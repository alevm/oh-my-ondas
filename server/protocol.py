"""Binary message formats of firmware/common/link_protocol.h.

On the WebSocket each binary message is one frame without COBS and CRC:
    header = type (u8) | seq (u16 LE) | length (u16 LE), then `length` payload bytes.
All structs are packed little-endian (#pragma pack(1)).

Matches LINK_PROTO_VERSION 4 (MOTION/ENV/RF messages, coil and light sources;PULSE carries the device bar/step; PLAN tracks carry
slice, duck_on, flags and 16 per-step melody notes; REQ_CLIP/ACK/ERR defined). IMA-ADPCM: low nibble first.
"""
from __future__ import annotations

import struct
from dataclasses import dataclass, field
from typing import ClassVar

# ---- message types (enum LinkMsgType) ----
MSG_FEAT = 0x01
MSG_ONSET = 0x02
MSG_PULSE = 0x03
MSG_PIEZO = 0x04
MSG_RADIO = 0x05
MSG_GPS = 0x06
MSG_USER = 0x07
MSG_CAPS = 0x08
MSG_CLIP = 0x09
MSG_HELLO = 0x0A
MSG_MOTION = 0x0B   # 10 Hz IMU
MSG_ENV = 0x0C      # 1 Hz barometer
MSG_RF = 0x0D       # ~0.1 Hz WiFi density, sent by the ESP32 itself (its own clock and seq)
MSG_PLAN = 0x41
MSG_REQ_CLIP = 0x42
MSG_ACK = 0x43
MSG_ERR = 0x44
MSG_LINK_STATE = 0x60

MSG_NAMES = {
    MSG_FEAT: "FEAT", MSG_ONSET: "ONSET", MSG_PULSE: "PULSE", MSG_PIEZO: "PIEZO",
    MSG_RADIO: "RADIO", MSG_GPS: "GPS", MSG_USER: "USER", MSG_CAPS: "CAPS",
    MSG_CLIP: "CLIP", MSG_HELLO: "HELLO", MSG_MOTION: "MOTION", MSG_ENV: "ENV", MSG_RF: "RF", MSG_PLAN: "PLAN", MSG_REQ_CLIP: "REQ_CLIP",
    MSG_ACK: "ACK", MSG_ERR: "ERR", MSG_LINK_STATE: "LINK_STATE",
}

SRC_MIC, SRC_PIEZO, SRC_RADIO, SRC_COIL, SRC_LIGHT = 0, 1, 2, 3, 4
SOURCE_NAMES = {SRC_MIC: "mic", SRC_PIEZO: "piezo", SRC_RADIO: "radio", SRC_COIL: "coil", SRC_LIGHT: "light"}
SPEECH_CHECK_SOURCES = (SRC_MIC, SRC_PIEZO)  # acoustic inputs that can carry a voice

LINK_HEADER_SIZE = 5
LINK_MAX_PAYLOAD = 1024
LINK_PROTO_VERSION = 4

ROLE_NAMES = ["rhythm", "texture", "melody", "modulation"]
ROLE_NONE = 255
KIND_NAMES = ["percussive", "tonal", "ambient"]
MOD_SOURCES = ["rms", "centroid", "piezo_rms", "onsets", "radio_rssi",
               "cadence", "accel_rms", "heading", "mag_var", "dalt", "dp_fast", "rf_density"]
HEADING_NONE = 0xFFFF
GESTURES = ["none", "shake", "tilt_left", "tilt_right", "flip"]
MOD_TARGETS = ["texture_filter", "rhythm_prob", "melody_pitch", "master_fx_mix"]
CAPTURE_NONE = 255  # no capture (modulation tracks)
SLICE_NAMES = ["whole", "onsets", "even16"]
DUCK_NONE = 255
LINK_NOTE_NONE = -128  # rest / use the steps mask
FLAG_SNAP_CHROMA = 0x01  # snap pitch to the sensed chroma (JSON: scale_from = "chroma")

_HDR = struct.Struct("<BHH")


class ProtocolError(ValueError):
    pass


def pack_frame(msg_type: int, seq: int, payload: bytes) -> bytes:
    if len(payload) > LINK_MAX_PAYLOAD:
        raise ProtocolError(f"payload {len(payload)} > {LINK_MAX_PAYLOAD}")
    return _HDR.pack(msg_type, seq & 0xFFFF, len(payload)) + payload


def unpack_frame(data: bytes) -> tuple[int, int, bytes]:
    if len(data) < LINK_HEADER_SIZE:
        raise ProtocolError("short frame")
    t, seq, ln = _HDR.unpack_from(data)
    if ln > LINK_MAX_PAYLOAD or LINK_HEADER_SIZE + ln != len(data):
        raise ProtocolError(f"length mismatch: header {ln}, got {len(data) - LINK_HEADER_SIZE}")
    return t, seq, bytes(data[LINK_HEADER_SIZE:])


def _cstr(b: bytes) -> str:
    return b.split(b"\0", 1)[0].decode("latin-1", errors="replace")


def _to_cstr(s: str, size: int) -> bytes:
    raw = s.encode("latin-1", errors="replace")[: size - 1]
    return raw + b"\0" * (size - len(raw))


class _Packed:
    """Base for flat structs. Subclasses set FMT and LAYOUT (field name, count)."""

    FMT: ClassVar[str]
    LAYOUT: ClassVar[list[tuple[str, int]]]  # count 1 = scalar, n>1 = list, -n = C string of n bytes
    _S: ClassVar[struct.Struct]

    def __init_subclass__(cls, **kw):
        super().__init_subclass__(**kw)
        cls._S = struct.Struct(cls.FMT)

    @classmethod
    def size(cls) -> int:
        return cls._S.size

    def pack(self) -> bytes:
        vals = []
        for name, n in self.LAYOUT:
            v = getattr(self, name)
            if n == 1:
                vals.append(v)
            elif n < 0:
                vals.append(_to_cstr(v, -n))
            else:
                if len(v) != n:
                    raise ProtocolError(f"{type(self).__name__}.{name}: need {n} values")
                vals.extend(v)
        return self._S.pack(*vals)

    @classmethod
    def unpack(cls, data: bytes, offset: int = 0):
        if len(data) - offset < cls._S.size:
            raise ProtocolError(f"{cls.__name__}: need {cls._S.size} bytes, got {len(data) - offset}")
        raw = cls._S.unpack_from(data, offset)
        kw, i = {}, 0
        for name, n in cls.LAYOUT:
            if n == 1:
                kw[name] = raw[i]; i += 1
            elif n < 0:
                kw[name] = _cstr(raw[i]); i += 1
            else:
                kw[name] = list(raw[i:i + n]); i += n
        return cls(**kw)


@dataclass
class Feat(_Packed):
    FMT = "<I32bHHB12BHBBBB"
    LAYOUT = [("t_ms", 1), ("bands_db", 32), ("rms", 1), ("centroid_hz", 1), ("flatness", 1),
              ("chroma", 12), ("pitch_hz_x10", 1), ("pitch_conf", 1), ("onsets", 1), ("speech", 1),
              ("left_source", 1)]
    t_ms: int = 0
    bands_db: list = field(default_factory=lambda: [-100] * 32)
    rms: int = 0
    centroid_hz: int = 0
    flatness: int = 0
    chroma: list = field(default_factory=lambda: [0] * 12)
    pitch_hz_x10: int = 0
    pitch_conf: int = 0
    onsets: int = 0
    speech: int = 0
    left_source: int = 0  # LinkSource on LINE-IN L right now (mic or piezo)


@dataclass
class Onset(_Packed):
    FMT = "<IBBB"
    LAYOUT = [("t_ms", 1), ("source", 1), ("strength", 1), ("band", 1)]
    t_ms: int = 0
    source: int = 0
    strength: int = 0
    band: int = 0


@dataclass
class Pulse(_Packed):
    FMT = "<IHBHHB"
    LAYOUT = [("t_ms", 1), ("bpm_x10", 1), ("conf", 1), ("phase_ms", 1), ("bar", 1), ("step", 1)]
    t_ms: int = 0
    bpm_x10: int = 0
    conf: int = 0
    phase_ms: int = 0
    bar: int = 0      # device sequencer bar counter (wraps at 65536)
    step: int = 0     # 0..15


@dataclass
class Piezo(_Packed):
    FMT = "<IH8bB"
    LAYOUT = [("t_ms", 1), ("rms", 1), ("bands_db", 8), ("peaks", 1)]
    t_ms: int = 0
    rms: int = 0
    bands_db: list = field(default_factory=lambda: [-100] * 8)
    peaks: int = 0


@dataclass
class Radio(_Packed):
    FMT = "<IBIBBB9s65s"
    LAYOUT = [("t_ms", 1), ("band", 1), ("freq_khz", 1), ("rssi", 1), ("snr", 1),
              ("speech_music", 1), ("rds_ps", -9), ("rds_rt", -65)]
    t_ms: int = 0
    band: int = 0
    freq_khz: int = 0
    rssi: int = 0
    snr: int = 0
    speech_music: int = 0
    rds_ps: str = ""
    rds_rt: str = ""


@dataclass
class Gps(_Packed):
    FMT = "<IiihHHBBI"
    LAYOUT = [("t_ms", 1), ("lat_e7", 1), ("lon_e7", 1), ("alt_m", 1), ("speed_cms", 1),
              ("heading_cdeg", 1), ("fix", 1), ("sats", 1), ("utc", 1)]
    t_ms: int = 0
    lat_e7: int = 0
    lon_e7: int = 0
    alt_m: int = 0
    speed_cms: int = 0
    heading_cdeg: int = 0
    fix: int = 0
    sats: int = 0
    utc: int = 0


@dataclass
class Motion(_Packed):
    FMT = "<IHBH3hhhHHHB"
    LAYOUT = [("t_ms", 1), ("accel_rms_mg", 1), ("steps", 1), ("cadence_x10", 1), ("gyro_dps", 3),
              ("pitch_cdeg", 1), ("roll_cdeg", 1), ("heading_cdeg", 1), ("mag_ut_x10", 1), ("mag_var_x10", 1),
              ("gesture", 1)]
    t_ms: int = 0
    accel_rms_mg: int = 0
    steps: int = 0
    cadence_x10: int = 0        # steps/min * 10, 0 = standing
    gyro_dps: list = field(default_factory=lambda: [0, 0, 0])
    pitch_cdeg: int = 0
    roll_cdeg: int = 0
    heading_cdeg: int = HEADING_NONE
    mag_ut_x10: int = 0
    mag_var_x10: int = 0
    gesture: int = 0


@dataclass
class Env(_Packed):
    FMT = "<IIhhhH"
    LAYOUT = [("t_ms", 1), ("pressure_pa", 1), ("temp_cdeg", 1), ("dalt_cm", 1), ("dp_trend_pa_h", 1),
              ("dp_fast_pa_x10", 1)]
    t_ms: int = 0
    pressure_pa: int = 101325
    temp_cdeg: int = 2000
    dalt_cm: int = 0            # height change vs walk start
    dp_trend_pa_h: int = 0
    dp_fast_pa_x10: int = 0


@dataclass
class Rf(_Packed):
    FMT = "<IBbb13B"
    LAYOUT = [("t_ms", 1), ("ap_count", 1), ("rssi_median", 1), ("rssi_max", 1), ("ch_busy", 13)]
    t_ms: int = 0               # ESP32 clock, not the Teensy's
    ap_count: int = 0
    rssi_median: int = -100
    rssi_max: int = -100
    ch_busy: list = field(default_factory=lambda: [0] * 13)


@dataclass
class User(_Packed):
    FMT = "<I5H7bBBB"
    LAYOUT = [("t_ms", 1), ("faders", 5), ("enc_delta", 7), ("pads", 1), ("buttons", 1), ("mode", 1)]
    t_ms: int = 0
    faders: list = field(default_factory=lambda: [0] * 5)
    enc_delta: list = field(default_factory=lambda: [0] * 7)
    pads: int = 0
    buttons: int = 0
    mode: int = 0


@dataclass
class CapEntry(_Packed):
    FMT = "<BBHBBBH"
    LAYOUT = [("id", 1), ("source", 1), ("length_ms", 1), ("kind", 1), ("role", 1),
              ("onsets", 1), ("pitch_hz_x10", 1)]
    id: int = 0
    source: int = 0
    length_ms: int = 0
    kind: int = 0
    role: int = ROLE_NONE
    onsets: int = 0
    pitch_hz_x10: int = 0


@dataclass
class ClipHdr(_Packed):
    FMT = "<HBHHHhB"
    LAYOUT = [("clip_id", 1), ("source", 1), ("sample_rate", 1), ("chunk", 1), ("chunks", 1),
              ("predictor", 1), ("step_index", 1)]
    clip_id: int = 0
    source: int = 0
    sample_rate: int = 16000
    chunk: int = 0
    chunks: int = 1
    predictor: int = 0
    step_index: int = 0


@dataclass
class Hello(_Packed):
    FMT = "<B16s"
    LAYOUT = [("proto", 1), ("fw", -16)]
    proto: int = LINK_PROTO_VERSION
    fw: str = ""


@dataclass
class LinkState(_Packed):
    FMT = "<BBb"
    LAYOUT = [("wifi", 1), ("server", 1), ("rssi_dbm", 1)]
    wifi: int = 0
    server: int = 0
    rssi_dbm: int = 0


@dataclass
class PlanHdr(_Packed):
    FMT = "<HHBHBB"
    LAYOUT = [("plan_id", 1), ("starts_at_bar", 1), ("bars", 1), ("bpm_x10", 1),
              ("follow_pulse", 1), ("track_count", 1)]
    plan_id: int = 0
    starts_at_bar: int = 0
    bars: int = 16
    bpm_x10: int = 0
    follow_pulse: int = 1
    track_count: int = 0


@dataclass
class PlanTrack(_Packed):
    FMT = "<BBHBbBBBBBBBB16b"
    LAYOUT = [("role", 1), ("capture_id", 1), ("steps", 1), ("prob", 1), ("pitch", 1),
              ("density_from", 1), ("density_to", 1), ("mod_source", 1), ("mod_target", 1),
              ("mod_depth", 1), ("slice", 1), ("duck_on", 1), ("flags", 1), ("notes", 16)]
    role: int = 0
    capture_id: int = 0
    steps: int = 0
    prob: int = 255
    pitch: int = 0
    density_from: int = 0
    density_to: int = 0
    mod_source: int = 0
    mod_target: int = 0
    mod_depth: int = 0
    slice: int = 0          # 0 whole, 1 at onsets, 2 even 16 slices
    duck_on: int = DUCK_NONE  # role index this track ducks under, 255 none
    flags: int = 0
    notes: list = field(default_factory=lambda: [LINK_NOTE_NONE] * 16)  # melody: semitones from pitch per step


# ---- link control payloads ----
@dataclass
class ReqClip(_Packed):
    FMT = "<BB"
    LAYOUT = [("source", 1), ("seconds", 1)]
    source: int = SRC_MIC
    seconds: int = 8


@dataclass
class Ack(_Packed):
    FMT = "<HB"
    LAYOUT = [("ref_seq", 1), ("ref_type", 1)]
    ref_seq: int = 0
    ref_type: int = 0


# LinkErr.code
ERR_MALFORMED = 1     # bad frame (also: bad clip chunk, protocol version mismatch)
ERR_UNKNOWN_TYPE = 2
ERR_INVALID_PLAN = 3
ERR_AUTH = 4
ERR_RATE = 5


@dataclass
class Err(_Packed):
    FMT = "<HBB"
    LAYOUT = [("ref_seq", 1), ("ref_type", 1), ("code", 1)]
    ref_seq: int = 0
    ref_type: int = 0
    code: int = 0


# ---- composite payloads ----
def pack_caps(entries: list[CapEntry]) -> bytes:
    if len(entries) > 255:
        raise ProtocolError("too many captures")
    return bytes([len(entries)]) + b"".join(e.pack() for e in entries)


def unpack_caps(payload: bytes) -> list[CapEntry]:
    if not payload:
        raise ProtocolError("empty CAPS")
    n = payload[0]
    if len(payload) != 1 + n * CapEntry.size():
        raise ProtocolError("CAPS length mismatch")
    return [CapEntry.unpack(payload, 1 + i * CapEntry.size()) for i in range(n)]


def pack_clip(hdr: ClipHdr, adpcm: bytes) -> bytes:
    return hdr.pack() + adpcm


def unpack_clip(payload: bytes) -> tuple[ClipHdr, bytes]:
    hdr = ClipHdr.unpack(payload)
    return hdr, payload[ClipHdr.size():]


def pack_plan(hdr: PlanHdr, tracks: list[PlanTrack]) -> bytes:
    if len(tracks) > 8:
        raise ProtocolError("track_count > 8")
    hdr.track_count = len(tracks)
    return hdr.pack() + b"".join(t.pack() for t in tracks)


def unpack_plan(payload: bytes) -> tuple[PlanHdr, list[PlanTrack]]:
    hdr = PlanHdr.unpack(payload)
    n = hdr.track_count
    if n > 8 or len(payload) != PlanHdr.size() + n * PlanTrack.size():
        raise ProtocolError("PLAN length mismatch")
    return hdr, [PlanTrack.unpack(payload, PlanHdr.size() + i * PlanTrack.size()) for i in range(n)]


# Fixed-size payload classes by message type (CAPS, CLIP, PLAN are composite).
FIXED = {
    MSG_FEAT: Feat, MSG_ONSET: Onset, MSG_PULSE: Pulse, MSG_PIEZO: Piezo, MSG_RADIO: Radio,
    MSG_GPS: Gps, MSG_USER: User, MSG_MOTION: Motion, MSG_ENV: Env, MSG_RF: Rf, MSG_HELLO: Hello, MSG_LINK_STATE: LinkState,
    MSG_REQ_CLIP: ReqClip, MSG_ACK: Ack, MSG_ERR: Err,
}

# Sizes computed from link_protocol.h by hand; test_protocol also checks them with g++.
EXPECTED_SIZES = {
    "LinkFeat": (Feat, 59), "LinkOnset": (Onset, 7), "LinkPulse": (Pulse, 12),
    "LinkPiezo": (Piezo, 15), "LinkRadio": (Radio, 86), "LinkGps": (Gps, 24),
    "LinkUser": (User, 24), "LinkMotion": (Motion, 26), "LinkEnv": (Env, 16), "LinkRf": (Rf, 20), "LinkCapEntry": (CapEntry, 9), "LinkClipHdr": (ClipHdr, 12),
    "LinkHello": (Hello, 17), "LinkState": (LinkState, 3), "LinkPlanHdr": (PlanHdr, 9),
    "LinkPlanTrack": (PlanTrack, 30),
    "LinkReqClip": (ReqClip, 2), "LinkAck": (Ack, 3), "LinkErr": (Err, 4),
}
for _name, (_cls, _n) in EXPECTED_SIZES.items():
    assert _cls.size() == _n, f"{_name}: {_cls.size()} != {_n}"


def decode_payload(msg_type: int, payload: bytes):
    """Returns the parsed object for a device->server message type."""
    if msg_type == MSG_CAPS:
        return unpack_caps(payload)
    if msg_type == MSG_CLIP:
        return unpack_clip(payload)
    if msg_type == MSG_PLAN:
        return unpack_plan(payload)
    cls = FIXED.get(msg_type)
    if cls is None:
        raise ProtocolError(f"unknown type 0x{msg_type:02x}")
    if len(payload) != cls.size():
        raise ProtocolError(f"{MSG_NAMES.get(msg_type)}: payload {len(payload)} != {cls.size()}")
    return cls.unpack(payload)


