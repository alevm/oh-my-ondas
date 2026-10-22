#!/usr/bin/env python3
"""Simulated Oh My Ondas device: connects like the ESP32 bridge and streams synthetic
FEAT/ONSET/PULSE/PIEZO/RADIO/GPS/USER/CAPS, answers REQ_CLIP with ADPCM CLIP chunks,
and prints the plans it receives.

The walk goes from Barceloneta beach to the Sagrada Familia. --speed scales the walk
(and the synthetic soundscape along it); messages are sent at their real rates.

    python tools/sim_device.py --url ws://127.0.0.1:8765 --token devtoken --duration 120 --speed 20
"""
from __future__ import annotations

import argparse
import asyncio
import math
import os
import random
import sys
import time

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

import adpcm  # noqa: E402
import protocol as P  # noqa: E402

from websockets.asyncio.client import connect  # noqa: E402

# Barceloneta beach (Passeig Maritim) -> Placa de Tetuan -> Sagrada Familia
ROUTE = [(41.3784, 2.1925), (41.3851, 2.1870), (41.3925, 2.1790), (41.3946, 2.1752), (41.4036, 2.1744)]
WALK_MS = 1.4
SR = 16000
CHUNK_BYTES = P.LINK_MAX_PAYLOAD - P.ClipHdr.size()


def _dist(a, b):
    dy = (b[0] - a[0]) * 111320
    dx = (b[1] - a[1]) * 111320 * math.cos(math.radians(a[0]))
    return math.hypot(dx, dy)


SEGS = [_dist(a, b) for a, b in zip(ROUTE, ROUTE[1:])]
TOTAL_M = sum(SEGS)


def position(walked_m: float):
    """(lat, lon, heading_deg, progress 0..1) along the route."""
    d = min(max(walked_m, 0), TOTAL_M)
    for (a, b), L in zip(zip(ROUTE, ROUTE[1:]), SEGS):
        if d <= L:
            f = d / L
            lat, lon = a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1])
            hd = math.degrees(math.atan2((b[1] - a[1]) * math.cos(math.radians(a[0])), b[0] - a[0])) % 360
            return lat, lon, hd, (walked_m / TOTAL_M)
        d -= L
    return ROUTE[-1][0], ROUTE[-1][1], 0.0, 1.0


def scene(progress: float, t: float) -> dict:
    """Soundscape parameters along the walk: sea -> streets -> basilica square."""
    sea = max(0.0, 1 - progress / 0.3)
    city = math.sin(min(progress, 1) * math.pi) ** 0.7
    square = max(0.0, (progress - 0.75) / 0.25)
    waves = 0.5 + 0.5 * math.sin(2 * math.pi * t / 9.0)
    speech = 1.0 if (int(t) % 47) < 4 and square > 0.2 else 0.0  # passers-by talking
    return {"sea": sea, "city": city, "square": square, "waves": waves, "speech": speech}


def left_source_at(el: float) -> int:
    """The walker's LINE-IN L selection, cycling every 80 s: mic 40 s, piezo 20 s, coil 20 s."""
    ph = el % 80
    return P.SRC_MIC if ph < 40 else P.SRC_PIEZO if ph < 60 else P.SRC_COIL


# metro station near the end of the walk: stairs down, platform, stairs up (fractions of the route)
METRO_DOWN, METRO_PLATFORM, METRO_UP, METRO_OUT = 0.86, 0.885, 0.915, 0.94
METRO_DEPTH_M = 12.0
TRAM = (0.30, 0.55)  # stretch along the tram line (Ciutadella / Wellington)


def body(progress: float, wt: float) -> dict:
    """The walker's body and surroundings at route fraction `progress`, walk time `wt` (s)."""
    standing = (wt % 45) < 7 and METRO_DOWN > progress > 0.1  # waiting at crossings
    if METRO_DOWN <= progress < METRO_PLATFORM:
        dalt = -METRO_DEPTH_M * (progress - METRO_DOWN) / (METRO_PLATFORM - METRO_DOWN)
        stairs = -1
    elif METRO_PLATFORM <= progress < METRO_UP:
        dalt, stairs = -METRO_DEPTH_M, 0
        standing = (wt % 30) < 15  # waiting on the platform
    elif METRO_UP <= progress < METRO_OUT:
        dalt = -METRO_DEPTH_M * (1 - (progress - METRO_UP) / (METRO_OUT - METRO_UP))
        stairs = 1
    else:
        dalt, stairs = 0.0, 0
    underground = METRO_DOWN <= progress < METRO_OUT
    tram_burst = (TRAM[0] <= progress <= TRAM[1] and (wt % 25) < 4) or (underground and (wt % 20) < 5)
    return {"standing": standing, "dalt": dalt, "stairs": stairs, "underground": underground, "tram": tram_burst}


def feat_frame(t_ms: int, sc: dict, rng: random.Random, left: int = P.SRC_MIC) -> P.Feat:
    level = -50 + 18 * sc["sea"] * sc["waves"] + 22 * sc["city"] + 8 * sc["square"] + rng.gauss(0, 1.5)
    tilt = -0.6 * sc["sea"] - 0.2 * sc["city"]
    bands = [int(max(-128, min(0, level + tilt * i + rng.gauss(0, 2)))) for i in range(32)]
    chroma = [int(30 + 20 * rng.random()) for _ in range(12)]
    if sc["square"] > 0:
        chroma[1] = int(min(255, 60 + 190 * sc["square"]))  # bell partial on C#
    onsets = 1 if rng.random() < 0.05 + 0.35 * sc["city"] else 0
    rms = int(min(65535, 65535 * 10 ** (level / 20)))
    return P.Feat(t_ms=t_ms, bands_db=bands, rms=rms,
                  centroid_hz=int(600 + 2500 * sc["city"] - 300 * sc["sea"] + rng.gauss(0, 80)),
                  flatness=int(min(255, 255 * (0.35 + 0.45 * sc["sea"] + 0.1 * sc["city"]))),
                  chroma=chroma, pitch_hz_x10=2772 if sc["square"] > 0.3 else 0,
                  pitch_conf=200 if sc["square"] > 0.3 else 20, onsets=onsets,
                  speech=int(220 * sc["speech"]), left_source=left)


def synth_clip(source: int, sc: dict, seconds: float, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    n = int(SR * seconds)
    t = np.arange(n) / SR
    if source == P.SRC_RADIO:
        x = sum(0.15 * np.sin(2 * np.pi * f * t) for f in (277.2, 349.2, 415.3)) + 0.03 * rng.standard_normal(n)
    elif source == P.SRC_COIL:  # mains hum + switching harmonics, tram traction bursts
        x = sum((0.2 / k) * np.sin(2 * np.pi * 50 * k * t) for k in (1, 3, 5, 7)) + 0.01 * rng.standard_normal(n)
        x += 0.3 * (np.sin(2 * np.pi * 0.4 * t) > 0.6) * np.sign(np.sin(2 * np.pi * 750 * t)) * 0.3
    elif source == P.SRC_LIGHT:  # 100 Hz lamp flicker + screen PWM
        x = 0.3 * np.sign(np.sin(2 * np.pi * 100 * t)) + 0.1 * np.sin(2 * np.pi * 240 * t) + 0.01 * rng.standard_normal(n)
    elif source == P.SRC_PIEZO:
        x = 0.02 * rng.standard_normal(n)
        for k in np.arange(0, seconds, 0.55):
            i = int(k * SR)
            m = min(n - i, 2000)
            x[i:i + m] += 0.6 * np.exp(-np.arange(m) / 300) * np.sin(2 * np.pi * 60 * np.arange(m) / SR)
    else:
        noise = rng.standard_normal(n)
        lp = np.convolve(noise, np.ones(16) / 16, mode="same")
        x = (0.25 * sc["sea"] * (0.5 + 0.5 * np.sin(2 * np.pi * t / 7)) * lp
             + 0.05 * sc["city"] * noise)
        for k in rng.uniform(0, seconds, int(3 * seconds * (0.2 + sc["city"]))):
            i = int(k * SR)
            m = min(n - i, 400)
            x[i:i + m] += 0.4 * np.exp(-np.arange(m) / 60) * rng.standard_normal(m)
        if sc["square"] > 0:
            x += 0.1 * sc["square"] * np.sin(2 * np.pi * 277.2 * t) * np.exp(-(t % 4) / 1.5)
    return np.clip(x * 32767, -32768, 32767).astype(np.int16)


INITIAL_CAPS = [
    P.CapEntry(id=1, source=P.SRC_MIC, length_ms=3200, kind=0, role=0, onsets=14, pitch_hz_x10=0),     # footsteps
    P.CapEntry(id=2, source=P.SRC_MIC, length_ms=9000, kind=2, role=1, onsets=2, pitch_hz_x10=0),      # waves
    P.CapEntry(id=3, source=P.SRC_RADIO, length_ms=4000, kind=1, role=2, onsets=6, pitch_hz_x10=2772),  # radio chord
    P.CapEntry(id=4, source=P.SRC_PIEZO, length_ms=2500, kind=0, role=255, onsets=9, pitch_hz_x10=0),  # bench knocks
]
CAPS_EXTRA = [
    P.CapEntry(id=6, source=P.SRC_COIL, length_ms=6000, kind=2, role=255, onsets=3, pitch_hz_x10=500),  # mains hum
    P.CapEntry(id=7, source=P.SRC_LIGHT, length_ms=3000, kind=1, role=255, onsets=0, pitch_hz_x10=1000),  # lamp flicker
]
INITIAL_CAPS = INITIAL_CAPS + CAPS_EXTRA
BELL_CAP = P.CapEntry(id=5, source=P.SRC_MIC, length_ms=5000, kind=1, role=255, onsets=1, pitch_hz_x10=2772)


class Walker:
    """Generates the device's 10 Hz message stream along the walk (shared by the live
    simulator and the offline recorder)."""

    def __init__(self, speed: float, rng: random.Random, caps: list):
        self.speed, self.rng, self.caps = speed, rng, caps
        self.tick = 0
        self.seq_steps = 0.0
        self.seq_last = 0.0
        self.device_bar = 0
        self.sc = scene(0, 0)
        self.new_caps = False
        self.left = P.SRC_MIC
        self.walked = 0.0
        self.last_el = 0.0
        self.step_acc = 0.0
        self.body = body(0.0, 0.0)

    def step(self, el: float, utc: int) -> list[tuple[int, bytes]]:
        rng, out, tick = self.rng, [], self.tick
        t_ms = int(el * 1000)
        dt = max(0.0, el - self.last_el)
        self.last_el = el
        wt = el * self.speed
        if not self.body["standing"]:
            self.walked += dt * self.speed * WALK_MS
        lat, lon, hd, prog = position(self.walked)
        b = self.body = body(prog, wt)
        sc = self.sc = scene(prog, wt)
        # IMU at 10 Hz
        cad = 0.0 if b["standing"] else (88.0 if b["stairs"] else 112.0) + rng.gauss(0, 2)
        self.step_acc += cad / 60 * dt * self.speed
        steps = int(self.step_acc)
        self.step_acc -= steps
        mag_var = (150 + rng.random() * 200) if b["tram"] else rng.random() * 8
        out.append((P.MSG_MOTION, P.Motion(
            t_ms, accel_rms_mg=int((30 if b["standing"] else 260 + 60 * abs(b["stairs"])) + rng.gauss(0, 10)),
            steps=min(255, steps), cadence_x10=int(cad * 10),
            gyro_dps=[int(rng.gauss(0, 5)), int(rng.gauss(0, 5)), int(rng.gauss(0, 3))],
            pitch_cdeg=int(-1500 * b["stairs"] + rng.gauss(0, 100)), roll_cdeg=int(rng.gauss(0, 100)),
            heading_cdeg=int(((hd + rng.gauss(0, 4)) % 360) * 100), mag_ut_x10=int(450 + (100 if b["tram"] else 0)),
            mag_var_x10=int(mag_var), gesture=1 if tick % 997 == 500 else 0).pack()))
        self.left = left_source_at(el)
        f = feat_frame(t_ms, sc, rng, self.left)
        out.append((P.MSG_FEAT, f.pack()))
        if f.onsets:
            out.append((P.MSG_ONSET, P.Onset(t_ms, P.SRC_MIC, rng.randint(80, 250), rng.randint(4, 20)).pack()))
        peaks = 1 if rng.random() < 0.1 + 0.3 * sc["city"] else 0
        out.append((P.MSG_PIEZO, P.Piezo(t_ms, int(500 + 4000 * sc["city"] * rng.random()),
                                         [int(-60 + 20 * sc["city"] - 3 * i) for i in range(8)], peaks).pack()))
        if tick % 10 == 0:
            bpm = 96 + 10 * sc["city"]
            self.seq_steps += (el - self.seq_last) * bpm / 15.0  # device sequencer: 16th steps
            self.seq_last = el
            beat_ms = 60000.0 / bpm
            st_i = int(self.seq_steps)
            phase = int(((self.seq_steps % 4) / 4) * beat_ms)
            self.device_bar = (st_i // 16) & 0xFFFF
            out.append((P.MSG_PULSE, P.Pulse(t_ms, int(bpm * 10), int(60 + 150 * sc["city"]), phase,
                                             self.device_bar, st_i % 16).pack()))
            out.append((P.MSG_RADIO, P.Radio(t_ms, 0, 98800, int(38 + rng.random() * 6), 22, 70,
                                             "OHMYTEST", "Simulated radio text, not a real station").pack()))
            out.append((P.MSG_GPS, P.Gps(t_ms, int(lat * 1e7), int(lon * 1e7), 12 + int(b["dalt"]),
                                         0 if b["standing"] else int(WALK_MS * 100), int(hd * 100),
                                         0 if b["underground"] else 1, 0 if b["underground"] else 9, utc).pack()))
            out.append((P.MSG_ENV, P.Env(t_ms, pressure_pa=int(101325 - 12.0 * b["dalt"] + rng.gauss(0, 3)),
                                         temp_cdeg=int((21.5 if b["underground"] else 19.0) * 100),
                                         dalt_cm=int(b["dalt"] * 100), dp_trend_pa_h=-20,
                                         dp_fast_pa_x10=int((120 if b["underground"] and b["tram"] else 8) + rng.random() * 10)).pack()))
        if tick % 100 == 50:  # ESP32 WiFi scan: its own clock (offset) and counts only
            aps = int(4 + 40 * sc["city"] + (0 if not b["underground"] else -10) + rng.random() * 5)
            busy = [max(0, int(aps / 6 + rng.gauss(0, 1))) if ch in (0, 5, 10) else int(rng.random() * 3)
                    for ch in range(13)]
            out.append((P.MSG_RF, P.Rf(t_ms + 777000, ap_count=max(0, aps), rssi_median=-78, rssi_max=-48,
                                       ch_busy=busy).pack()))
        if tick % 50 == 25:
            out.append((P.MSG_USER, P.User(t_ms, [2048, 1800 + tick % 400, 3000, 1000, 2500],
                                           [0, 1, 0, 0, 0, 0, 0], 1 << (tick // 50 % 8), 0, 1).pack()))
        self.new_caps = False
        if prog > 0.75 and BELL_CAP not in self.caps:
            self.caps.append(BELL_CAP)
            out.append((P.MSG_CAPS, P.pack_caps(self.caps)))
            self.new_caps = True
        self.tick += 1
        return out


def record(duration: float, speed: float, seed: int = 1, utc0: int = 1792569600) -> list[dict]:
    """Offline recording of the device stream: [{"t": seconds, "frame": base64}], CAPS first."""
    import base64
    rng = random.Random(seed)
    caps = list(INITIAL_CAPS)
    w = Walker(speed, rng, caps)
    rec = [{"t": 0.0, "frame": base64.b64encode(P.pack_frame(P.MSG_HELLO, 0, P.Hello(P.LINK_PROTO_VERSION, "sim-0.1").pack())).decode()},
           {"t": 0.0, "frame": base64.b64encode(P.pack_frame(P.MSG_CAPS, 1, P.pack_caps(caps))).decode()}]
    for k in range(int(duration * 10)):
        el = k * 0.1
        for t, payload in w.step(el, utc0 + int(el)):
            rec.append({"t": round(el, 2), "frame": base64.b64encode(P.pack_frame(t, len(rec), payload)).decode()})
    return rec


async def run(url: str, token: str, duration: float = 60.0, speed: float = 10.0, quiet: bool = False,
              seed: int = 1, clip_seconds_cap: float | None = None, reject_first_plan: bool = False,
              proto: int = P.LINK_PROTO_VERSION) -> dict:
    rng = random.Random(seed)
    say = (lambda *a: None) if quiet else (lambda *a: print(*a, flush=True))
    seq = 0
    result = {"plans": [], "acks": 0, "errs": [], "req_clips": [], "clips_sent": 0, "clips_withheld": 0,
              "plans_rejected": 0}
    caps = list(INITIAL_CAPS)
    t0 = time.monotonic()
    state = {"sc": scene(0, 0), "left": P.SRC_MIC}
    headers = {"Authorization": f"Bearer {token}", "X-Ondas-Proto": str(proto)}

    async with connect(url, additional_headers=headers, max_size=4096) as ws:
        lock = asyncio.Lock()

        async def send(t, payload):
            nonlocal seq
            seq = (seq + 1) & 0xFFFF
            async with lock:
                await ws.send(P.pack_frame(t, seq, payload))

        async def send_clip(source: int, seconds: int, req_seq: int):
            sc = state["sc"]
            refuse = (source == P.SRC_MIC and sc["speech"] > 0) or \
                     (source in (P.SRC_MIC, P.SRC_PIEZO) and source != state["left"])
            if refuse:  # privacy rule (speech) or the input is not selected: tell the server
                result["clips_withheld"] += 1
                say(f"[sim] {P.SOURCE_NAMES[source]} clip refused")
                await send(P.MSG_ERR, P.Err(req_seq, P.MSG_REQ_CLIP, 3).pack())
                return
            seconds = min(seconds, 6)  # device maximum
            secs = min(seconds, clip_seconds_cap) if clip_seconds_cap else seconds
            pcm = synth_clip(source, sc, secs, rng.randrange(1 << 30))
            chunks = await asyncio.to_thread(adpcm.encode_chunks, pcm, CHUNK_BYTES)
            cid = rng.randrange(1, 65535)
            for i, (pred, idx, data) in enumerate(chunks):
                hdr = P.ClipHdr(clip_id=cid, source=source, sample_rate=SR, chunk=i, chunks=len(chunks),
                                predictor=pred, step_index=idx)
                await send(P.MSG_CLIP, P.pack_clip(hdr, data))
            result["clips_sent"] += 1
            say(f"[sim] sent {P.SOURCE_NAMES[source]} clip {cid}: {len(chunks)} chunks")

        async def receiver():
            async for msg in ws:
                t, s, payload = P.unpack_frame(msg)
                if t == P.MSG_PLAN:
                    hdr, tracks = P.unpack_plan(payload)
                    if reject_first_plan and not result["plans_rejected"]:
                        result["plans_rejected"] += 1
                        await send(P.MSG_ERR, P.Err(s, P.MSG_PLAN, 3).pack())
                        say(f"[sim] PLAN #{hdr.plan_id} rejected; re-sending CAPS")
                        await send(P.MSG_CAPS, P.pack_caps(caps))
                        continue
                    await send(P.MSG_ACK, P.Ack(s, P.MSG_PLAN).pack())
                    result["plans"].append((hdr, tracks))
                    say(f"[sim] PLAN #{hdr.plan_id} at bar {hdr.starts_at_bar} for {hdr.bars} bars, "
                        f"bpm {hdr.bpm_x10 / 10:.1f} follow={hdr.follow_pulse}")
                    for tr in tracks:
                        steps = "".join("x" if tr.steps >> i & 1 else "." for i in range(16))
                        say(f"        {P.ROLE_NAMES[tr.role]:<10} cap {tr.capture_id:<3} {steps} prob {tr.prob / 255:.2f} "
                            f"pitch {tr.pitch:+d} dens {tr.density_from / 255:.2f}->{tr.density_to / 255:.2f} "
                            f"mod {P.MOD_SOURCES[tr.mod_source]}->{P.MOD_TARGETS[tr.mod_target]} {tr.mod_depth / 255:.2f} "
                            f"slice {P.SLICE_NAMES[tr.slice] if tr.slice < 3 else tr.slice} "
                            f"duck {P.ROLE_NAMES[tr.duck_on] if tr.duck_on < 4 else '-'} "
                            f"{'snap' if tr.flags & P.FLAG_SNAP_CHROMA else ''}"
                            + (" notes " + " ".join("." if n == P.LINK_NOTE_NONE else f"{n:+d}" for n in tr.notes)
                               if tr.role == 2 else ""))
                elif t == P.MSG_REQ_CLIP:
                    r = P.ReqClip.unpack(payload)
                    result["req_clips"].append(r.source)
                    say(f"[sim] REQ_CLIP {P.SOURCE_NAMES.get(r.source)} {r.seconds} s")
                    asyncio.create_task(send_clip(r.source, r.seconds, s))
                elif t == P.MSG_ACK:
                    result["acks"] += 1
                elif t == P.MSG_ERR:
                    result["errs"].append(P.Err.unpack(payload))
                    say(f"[sim] ERR {P.Err.unpack(payload)}")

        recv = asyncio.create_task(receiver())
        await send(P.MSG_HELLO, P.Hello(P.LINK_PROTO_VERSION, "sim-0.1").pack())
        await send(P.MSG_CAPS, P.pack_caps(caps))
        walker = Walker(speed, rng, caps)
        try:
            while time.monotonic() - t0 < duration:
                el = time.monotonic() - t0
                for t, payload in walker.step(el, utc=int(time.time())):
                    await send(t, payload)
                state["sc"] = walker.sc
                state["left"] = walker.left
                result["device_bar"] = walker.device_bar
                if walker.new_caps:
                    say("[sim] new capture 5 (bell, tonal)")
                await asyncio.sleep(max(0.0, t0 + walker.tick * 0.1 - time.monotonic()))
        finally:
            recv.cancel()
    return result


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--url", default=os.environ.get("SIM_URL", "ws://127.0.0.1:8765"))
    ap.add_argument("--token", default=os.environ.get("SIM_TOKEN", "devtoken"))
    ap.add_argument("--duration", type=float, default=120.0, help="seconds of real time")
    ap.add_argument("--speed", type=float, default=20.0, help="walk speed multiplier")
    ap.add_argument("--seed", type=int, default=1)
    a = ap.parse_args()
    print(f"[sim] route {TOTAL_M:.0f} m, {TOTAL_M / WALK_MS / a.speed:.0f} s at x{a.speed}")
    res = asyncio.run(run(a.url, a.token, a.duration, a.speed, seed=a.seed))
    print(f"[sim] done: {len(res['plans'])} plans, {res['clips_sent']} clips sent, "
          f"{res['clips_withheld']} withheld, {res['acks']} acks, {len(res['errs'])} errors")


if __name__ == "__main__":
    main()
