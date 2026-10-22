"""Per-device session state. Everything is in memory; nothing is written to disk.

Mic audio is held only as the latest decoded clip (overwritten), and only after the
speech double-check has passed. It is never logged and never sent anywhere except,
optionally, as a spectrogram image to the model.
"""
from __future__ import annotations

import math
import time
from collections import Counter, deque
from dataclasses import dataclass, field

import numpy as np

import adpcm
import protocol as P

FEAT_WINDOW_S = 60.0
CLOCK_DRIFT = 2e-4          # allowed device-vs-server clock drift (s per s) for the offset estimate
DEVICE_RESET_JUMP_S = 5.0   # t_ms going back more than this = device reboot
CLIP_ASSEMBLY_TIMEOUT_S = 30.0
MAX_CLIP_CHUNKS = 256
DEFAULT_BPM = 100.0


@dataclass
class Clip:
    clip_id: int
    source: int
    sample_rate: int
    pcm: np.ndarray            # int16
    received_at: float
    device_speech: float = 0.0  # max FEAT.speech (0..1) seen while the clip was recorded


@dataclass
class _Assembly:
    source: int
    sample_rate: int
    chunks: int
    started: float
    parts: dict = field(default_factory=dict)  # chunk -> (predictor, step_index, bytes)


def _db(lin: float, full: float = 65535.0) -> float:
    return 20.0 * math.log10(max(lin, 1.0) / full)


class Session:
    def __init__(self, device_id: str, now: float | None = None):
        self.device_id = device_id
        t = time.monotonic() if now is None else now
        self.created = t
        self.last_seen = t
        self.hello: P.Hello | None = None
        self.feats: deque = deque()      # (server_t, Feat)
        self.onsets: deque = deque()     # (server_t, Onset)
        self.pulses: deque = deque(maxlen=120)
        self.piezo: deque = deque()
        self.radio: deque = deque(maxlen=120)
        self.gps: deque = deque(maxlen=7200)  # 2 h at 1 Hz
        self.users: deque = deque(maxlen=200)
        self.caps: dict[int, P.CapEntry] = {}
        self.caps_at: float | None = None
        self._assemblies: dict[int, _Assembly] = {}
        self.clips: dict[int, Clip] = {}  # latest accepted clip per source
        self.tags: dict[int, dict] = {}   # source -> {"at", "tags", "descriptors"}
        self.discarded_speech_clips = 0
        # bar clock: from MSG_PULSE bar/step (proto v2); time-based estimate until a PULSE arrives
        self._bar_pos = 0.0
        self._bar_t = t
        self.plan_bpm: float | None = None
        self.last_plan: dict | None = None
        self.plan_seq = 0
        self.place: dict | None = None
        # device clock -> server monotonic clock: offset = min over messages of (receive time - t_ms),
        # i.e. the least-delayed message; buffered backlog then maps to when it really happened.
        self.clock = ClockMap(t)      # Teensy t_ms
        self.rf_clock = ClockMap(t)   # MSG_RF is stamped with the ESP32's own clock
        self.motion: deque = deque()            # 60 s
        self.env: deque = deque(maxlen=900)     # 15 min at 1 Hz
        self.rf: deque = deque(maxlen=360)      # 1 h at ~0.1 Hz
        self.caps_stale = False   # device rejected a plan: wait for a fresh CAPS before planning
        self.left_source = P.SRC_MIC

    # ---------- ingest ----------
    def _trim(self, dq: deque, now: float, window: float = FEAT_WINDOW_S):
        while dq and now - dq[0][0] > window:
            dq.popleft()

    def reset_clock(self):
        self.clock.reset()

    def event_time(self, t_ms: int, now: float) -> float:
        return self.clock.map(t_ms, now)

    def add(self, msg_type: int, obj, now: float | None = None):
        now = time.monotonic() if now is None else now
        self.last_seen = now
        if msg_type == P.MSG_HELLO:
            self.reset_clock()
        t_ms = getattr(obj, "t_ms", None)
        clk = self.rf_clock if msg_type == P.MSG_RF else self.clock
        et = clk.map(t_ms, now) if t_ms is not None else now
        self.tick(now)
        now = et  # everything below is stored at the device's event time
        if msg_type == P.MSG_FEAT:
            self.feats.append((now, obj)); self._trim(self.feats, now)
            self.left_source = obj.left_source
        elif msg_type == P.MSG_ONSET:
            self.onsets.append((now, obj)); self._trim(self.onsets, now)
        elif msg_type == P.MSG_PULSE:
            self.pulses.append((now, obj))
        elif msg_type == P.MSG_PIEZO:
            self.piezo.append((now, obj)); self._trim(self.piezo, now)
        elif msg_type == P.MSG_RADIO:
            self.radio.append((now, obj))
        elif msg_type == P.MSG_GPS:
            if obj.fix > 0:
                self.gps.append((now, obj))
        elif msg_type == P.MSG_MOTION:
            self.motion.append((now, obj)); self._trim(self.motion, now)
        elif msg_type == P.MSG_ENV:
            self.env.append((now, obj))
        elif msg_type == P.MSG_RF:
            self.rf.append((now, obj))
        elif msg_type == P.MSG_USER:
            self.users.append((now, obj))
        elif msg_type == P.MSG_CAPS:
            self.caps = {e.id: e for e in obj}
            self.caps_at = now
            self.caps_stale = False
        elif msg_type == P.MSG_HELLO:
            self.hello = obj

    def add_clip_chunk(self, hdr: P.ClipHdr, data: bytes, now: float | None = None) -> Clip | None:
        """Collects chunks; returns the decoded Clip when all chunks are in."""
        now = time.monotonic() if now is None else now
        for cid in [c for c, a in self._assemblies.items() if now - a.started > CLIP_ASSEMBLY_TIMEOUT_S]:
            del self._assemblies[cid]
        if not (0 < hdr.chunks <= MAX_CLIP_CHUNKS) or hdr.chunk >= hdr.chunks:
            raise P.ProtocolError("bad clip chunk index")
        if not 0 <= hdr.step_index <= 88:
            raise P.ProtocolError("bad ADPCM step index")
        a = self._assemblies.get(hdr.clip_id)
        if a is None or a.chunks != hdr.chunks or a.source != hdr.source:
            a = _Assembly(hdr.source, hdr.sample_rate or 16000, hdr.chunks, now)
            self._assemblies[hdr.clip_id] = a
        a.parts[hdr.chunk] = (hdr.predictor, hdr.step_index, data)
        if len(a.parts) < a.chunks:
            return None
        del self._assemblies[hdr.clip_id]
        pcm = np.concatenate([adpcm.decode(d, p, i) for p, i, d in (a.parts[k] for k in range(a.chunks))])
        dur = len(pcm) / a.sample_rate
        speech = self.max_speech(now - dur - 1.0, now)
        return Clip(hdr.clip_id, a.source, a.sample_rate, pcm, now, speech)

    def accept_clip(self, clip: Clip):
        self.clips[clip.source] = clip

    def max_speech(self, t0: float, t1: float) -> float:
        vals = [f.speech for t, f in self.feats if t0 <= t <= t1]
        return max(vals) / 255.0 if vals else 0.0

    # ---------- bar clock ----------
    def current_bpm(self) -> float:
        p = self.latest_pulse()
        if p is not None and p.conf >= 100 and p.bpm_x10 > 0:
            return p.bpm_x10 / 10.0
        if self.plan_bpm:
            return self.plan_bpm
        return DEFAULT_BPM

    def tick(self, now: float):
        dt = max(0.0, now - self._bar_t)
        self._bar_pos += dt * self.current_bpm() / 240.0  # 4/4: bars = beats/4
        self._bar_t = now

    def current_bar(self, now: float | None = None) -> int:
        """Device bar counter (from the latest PULSE, extrapolated by tempo since then).
        Not masked: compare with bar_delta(); pack with & 0xFFFF."""
        now = time.monotonic() if now is None else now
        self.tick(now)
        if self.pulses:
            tp, p = self.pulses[-1]
            steps = p.bar * 16 + p.step + max(0.0, now - tp) * self.current_bpm() / 15.0
            return int(steps // 16)
        return int(self._bar_pos)

    @property
    def bar_source(self) -> str:
        return "device" if self.pulses else "estimate"

    def bar_grid(self) -> tuple[float, float] | None:
        """(device ms at which a bar started, bar length ms) from the latest PULSE."""
        p = self.latest_pulse()
        if p is None:
            return None
        beat_ms = 60000.0 / self.current_bpm()
        return p.t_ms - p.phase_ms - (p.step // 4) * beat_ms, 4 * beat_ms


    # ---------- views ----------
    def latest_pulse(self):
        return self.pulses[-1][1] if self.pulses else None

    def latest_radio(self):
        return self.radio[-1][1] if self.radio else None

    def latest_gps(self):
        return self.gps[-1][1] if self.gps else None

    def feature_stats(self, now: float | None = None, window: float = FEAT_WINDOW_S) -> dict:
        """Compact numeric description of the last `window` seconds."""
        now = time.monotonic() if now is None else now
        fs = [(t, f) for t, f in self.feats if now - t <= window]
        out: dict = {"n": len(fs), "window_s": window}
        if fs:
            ts = np.array([t for t, _ in fs])
            rms_db = np.array([_db(f.rms) for _, f in fs])
            cen = np.array([f.centroid_hz for _, f in fs], dtype=float)
            flat = np.array([f.flatness for _, f in fs], dtype=float) / 255.0
            bands = np.array([f.bands_db for _, f in fs], dtype=float)
            chroma = np.array([f.chroma for _, f in fs], dtype=float).mean(axis=0)
            onsets = sum(f.onsets for _, f in fs)
            span = max(ts[-1] - ts[0], 0.1)
            pitches = [f.pitch_hz_x10 / 10.0 for _, f in fs if f.pitch_conf > 128 and f.pitch_hz_x10]

            def slope(y):
                if len(y) < 3 or np.ptp(ts) < 1e-6:
                    return 0.0
                return float(np.polyfit(ts - ts[0], y, 1)[0])

            out.update(
                rms_db=float(rms_db.mean()), rms_db_sd=float(rms_db.std()), rms_db_slope_per_min=slope(rms_db) * 60,
                centroid_hz=float(cen.mean()), centroid_slope_per_min=slope(cen) * 60,
                flatness=float(flat.mean()), flatness_slope_per_min=slope(flat) * 60,
                bands_low_db=float(bands[:, :10].mean()), bands_mid_db=float(bands[:, 10:22].mean()),
                bands_high_db=float(bands[:, 22:].mean()),
                chroma=[float(c) for c in chroma],
                onset_rate=onsets / span,
                pitch_hz=float(np.median(pitches)) if pitches else None,
                speech_max=float(max(f.speech for _, f in fs) / 255.0),
            )
        ps = [(t, p) for t, p in self.piezo if now - t <= window]
        if ps:
            prms = np.array([_db(p.rms) for _, p in ps])
            span = max(ps[-1][0] - ps[0][0], 0.1)
            out.update(piezo_rms_db=float(prms.mean()), piezo_rms_db_sd=float(prms.std()),
                       piezo_peak_rate=sum(p.peaks for _, p in ps) / span,
                       piezo_bands_db=[float(x) for x in np.array([p.bands_db for _, p in ps]).mean(axis=0)])
        ms = [(t, m) for t, m in self.motion if now - t <= window]
        if ms:
            cad = np.array([m.cadence_x10 / 10 for _, m in ms])
            walking = cad[cad > 0]
            span = max(ms[-1][0] - ms[0][0], 0.1)
            hd = [m.heading_cdeg / 100 for _, m in ms if m.heading_cdeg != P.HEADING_NONE]
            hd_t = [t for t, m in ms if m.heading_cdeg != P.HEADING_NONE]
            out.update(
                cadence_spm=float(walking.mean()) if len(walking) else 0.0,
                standing_frac=float(np.mean(cad == 0)),
                steps_per_s=sum(m.steps for _, m in ms) / span,
                accel_rms_g=float(np.mean([m.accel_rms_mg for _, m in ms]) / 1000),
                accel_sd_g=float(np.std([m.accel_rms_mg for _, m in ms]) / 1000),
                mag_ut=float(np.mean([m.mag_ut_x10 for _, m in ms]) / 10),
                mag_var_ut=float(np.mean([m.mag_var_x10 for _, m in ms]) / 10),
                mag_var_peak_ut=float(max(m.mag_var_x10 for _, m in ms) / 10),
                gestures={(P.GESTURES[g] if g < len(P.GESTURES) else str(g)): n for g, n in
                          sorted(Counter(m.gesture for _, m in ms if m.gesture).items())},
            )
            if len(hd) >= 2:
                r = np.radians(hd)
                out["heading_deg"] = float(np.degrees(np.arctan2(np.sin(r).mean(), np.cos(r).mean())) % 360)
                # turning: 1 s circular means first, so compass jitter does not count as turning
                secs = np.floor(np.array(hd_t) - hd_t[0]).astype(int)
                means = [np.arctan2(np.sin(r[secs == k]).mean(), np.cos(r[secs == k]).mean())
                         for k in np.unique(secs)]
                d = np.diff(np.unwrap(means)) if len(means) > 1 else np.zeros(1)
                out["turn_deg_per_s"] = float(np.degrees(np.abs(d).sum()) / max(len(means) - 1, 1))
                out["heading_spread"] = float(1 - np.hypot(np.sin(r).mean(), np.cos(r).mean()))
        es = [(t, e) for t, e in self.env if now - t <= max(window, 60.0)]
        if es:
            e = es[-1][1]
            out.update(dalt_m=e.dalt_cm / 100, pressure_hpa=e.pressure_pa / 100, temp_c=e.temp_cdeg / 100,
                       dp_trend_pa_h=e.dp_trend_pa_h,
                       dp_fast_pa=float(np.mean([x.dp_fast_pa_x10 for _, x in es[-10:]]) / 10))
            recent = [(t, x) for t, x in es if now - t <= 30.0]
            if len(recent) >= 3 and recent[-1][0] - recent[0][0] > 5:
                tt = np.array([t for t, _ in recent]); hh = np.array([x.dalt_cm / 100 for _, x in recent])
                out["climb_m_per_min"] = float(np.polyfit(tt - tt[0], hh, 1)[0] * 60)
            else:
                out["climb_m_per_min"] = 0.0
        if self.rf:
            r = self.rf[-1][1]
            out.update(ap_count=r.ap_count, rssi_median=r.rssi_median, rssi_max=r.rssi_max,
                       busy_channels=int(sum(1 for c in r.ch_busy if c)),
                       ap_count_mean=float(np.mean([x.ap_count for _, x in list(self.rf)[-6:]])),
                       rf_age_s=float(now - self.rf[-1][0]))
        os_ = [o for t, o in self.onsets if now - t <= window]
        if os_:
            by_src = {}
            for o in os_:
                by_src.setdefault(P.SOURCE_NAMES.get(o.source, str(o.source)), []).append(o)
            out["onset_events"] = {k: {"count": len(v), "mean_strength": float(np.mean([o.strength for o in v]) / 255),
                                       "band_mode": int(np.bincount([o.band for o in v]).argmax())}
                                   for k, v in by_src.items()}
            out["onset_times_ms"] = [o.t_ms for o in os_ if o.source == P.SRC_MIC][-64:]
        return out

    def feature_vector(self, now: float | None = None, window: float = 5.0) -> np.ndarray | None:
        """Normalised short-term vector for "large change" detection."""
        st = self.feature_stats(now, window)
        if not st.get("n"):
            return None
        return np.array([
            (st["rms_db"] + 90) / 90,
            math.log2(max(st["centroid_hz"], 50) / 50) / 9,
            st["flatness"],
            min(st["onset_rate"] / 8, 1.5),
            (st.get("piezo_rms_db", -90) + 90) / 90,
            st.get("cadence_spm", 0.0) / 120,
            min(st.get("mag_var_ut", 0.0) / 20, 1.5),
        ])

    def user_actions(self, n: int = 10) -> list[dict]:
        res = []
        prev = None
        for t, u in list(self.users)[-n:]:
            d = {"t_ms": u.t_ms, "mode": u.mode, "pads": u.pads, "buttons": u.buttons,
                 "faders": [round(f / 4095, 2) for f in u.faders]}
            moved = [i for i, e in enumerate(u.enc_delta) if e]
            if moved:
                d["encoders_moved"] = moved
            if prev is not None:
                d["fader_change"] = [round((a - b) / 4095, 2) for a, b in zip(u.faders, prev.faders)]
            res.append(d)
            prev = u
        return res


def bar_delta(a: int, b: int) -> int:
    """a - b on the 16-bit wrapping bar counter, in -32768..32767."""
    return ((a - b + 32768) & 0xFFFF) - 32768


class ClockMap:
    """Maps a remote millisecond clock to the server's monotonic clock.
    offset = min over messages of (receive time - remote time): the least-delayed message wins,
    so a flushed backlog lands in the past. Relaxes by CLOCK_DRIFT; resets when the remote
    clock jumps back (reboot)."""

    def __init__(self, t: float):
        self.offset: float | None = None
        self.t = t
        self.max_dev = -1.0

    def reset(self):
        self.offset = None
        self.max_dev = -1.0

    def map(self, t_ms: int, now: float) -> float:
        dev = t_ms / 1000.0
        if self.max_dev >= 0 and dev < self.max_dev - DEVICE_RESET_JUMP_S:
            self.reset()
        self.max_dev = max(self.max_dev, dev)
        off = now - dev
        if self.offset is None:
            self.offset = off
        else:
            self.offset = min(self.offset + CLOCK_DRIFT * max(0.0, now - self.t), off)
        self.t = now
        return min(now, dev + self.offset)
