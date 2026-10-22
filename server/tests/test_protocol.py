import os
import shutil
import subprocess

import pytest

import protocol as P

HEADER = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "firmware", "common", "link_protocol.h"))


def samples():
    return [
        P.Feat(t_ms=123456, bands_db=list(range(-32, 0)), rms=40000, centroid_hz=2100, flatness=77,
               chroma=list(range(12)), pitch_hz_x10=4400, pitch_conf=200, onsets=3, speech=9),
        P.Onset(t_ms=99, source=P.SRC_PIEZO, strength=200, band=31),
        P.Pulse(t_ms=5, bpm_x10=1205, conf=180, phase_ms=321, bar=65535, step=15),
        P.Piezo(t_ms=7, rms=65535, bands_db=[-1, -2, -3, -4, -5, -6, -7, -128], peaks=4),
        P.Radio(t_ms=8, band=0, freq_khz=98800, rssi=40, snr=20, speech_music=200,
                rds_ps="CATRADIO", rds_rt="Les noticies de les vuit"),
        P.Gps(t_ms=9, lat_e7=413784000, lon_e7=21925000, alt_m=-3, speed_cms=140, heading_cdeg=35999,
              fix=1, sats=9, utc=1792000000),
        P.User(t_ms=10, faders=[0, 1, 2, 3, 4095], enc_delta=[-1, 0, 1, 0, 0, 0, 127], pads=0x81, buttons=3, mode=2),
        P.CapEntry(id=7, source=P.SRC_RADIO, length_ms=4000, kind=1, role=2, onsets=5, pitch_hz_x10=2772),
        P.ClipHdr(clip_id=65535, source=0, sample_rate=16000, chunk=3, chunks=10, predictor=-1234, step_index=88),
        P.Hello(proto=1, fw="teensy-0.3.1"),
        P.LinkState(wifi=2, server=1, rssi_dbm=-67),
        P.PlanHdr(plan_id=42, starts_at_bar=17, bars=16, bpm_x10=920, follow_pulse=1, track_count=0),
        P.PlanTrack(role=0, capture_id=7, steps=0x9249, prob=217, pitch=-12, density_from=51, density_to=153,
                    mod_source=2, mod_target=0, mod_depth=128, slice=1, duck_on=2, flags=P.FLAG_SNAP_CHROMA,
                    notes=[0, -128, 7, -128, 12, -128, -5, -128, 0, -128, 3, -128, -12, -128, 5, -128]),
        P.Motion(t_ms=11, accel_rms_mg=260, steps=2, cadence_x10=1120, gyro_dps=[-5, 3, 32767], pitch_cdeg=-1500,
                 roll_cdeg=20, heading_cdeg=P.HEADING_NONE, mag_ut_x10=450, mag_var_x10=3000, gesture=1),
        P.Env(t_ms=12, pressure_pa=101469, temp_cdeg=-550, dalt_cm=-1200, dp_trend_pa_h=-20, dp_fast_pa_x10=120),
        P.Rf(t_ms=4294967295, ap_count=44, rssi_median=-78, rssi_max=-30, ch_busy=list(range(13))),
        P.ReqClip(source=P.SRC_COIL, seconds=6), P.Ack(ref_seq=1000, ref_type=8), P.Err(ref_seq=3, ref_type=9, code=4),
    ]


@pytest.mark.parametrize("obj", samples(), ids=lambda o: type(o).__name__)
def test_struct_roundtrip(obj):
    b = obj.pack()
    assert len(b) == type(obj).size()
    assert type(obj).unpack(b) == obj


def test_named_sizes():
    assert P.Feat.size() == 59
    assert P.Radio.size() == 86
    assert P.PlanHdr.size() == 9
    assert P.PlanTrack.size() == 30
    assert P.Pulse.size() == 12
    assert (P.ReqClip.size(), P.Ack.size(), P.Err.size()) == (2, 3, 4)
    assert P.LINK_PROTO_VERSION == 4
    assert (P.Motion.size(), P.Env.size(), P.Rf.size()) == (26, 16, 20)


def test_little_endian_layout():
    b = P.Pulse(t_ms=0x01020304, bpm_x10=0x0506, conf=7, phase_ms=0x0809, bar=0x0B0A, step=12).pack()
    assert b == bytes([4, 3, 2, 1, 6, 5, 7, 9, 8, 10, 11, 12])
    notes = [P.LINK_NOTE_NONE] * 16
    notes[0], notes[15] = -48, 48
    t = P.PlanTrack(role=1, capture_id=255, steps=0x0201, slice=2, duck_on=255, flags=1, notes=notes).pack()
    assert t[11:14] == bytes([2, 255, 1]) and t[2:4] == bytes([1, 2])
    assert t[14] == 0xD0 and t[29] == 48 and t[15] == 0x80  # int8: -48, 48, -128 = rest
    f = P.Feat(left_source=P.SRC_PIEZO).pack()
    assert len(f) == 59 and f[-1] == P.SRC_PIEZO


def test_frame_roundtrip_and_errors():
    payload = P.Gps(fix=1).pack()
    fr = P.pack_frame(P.MSG_GPS, 0x1234, payload)
    assert fr[:5] == bytes([P.MSG_GPS, 0x34, 0x12, len(payload), 0])
    assert P.unpack_frame(fr) == (P.MSG_GPS, 0x1234, payload)
    with pytest.raises(P.ProtocolError):
        P.unpack_frame(fr[:-1])
    with pytest.raises(P.ProtocolError):
        P.unpack_frame(b"\x01\x00")
    with pytest.raises(P.ProtocolError):
        P.pack_frame(P.MSG_CLIP, 0, b"\0" * 1025)
    with pytest.raises(P.ProtocolError):
        P.decode_payload(P.MSG_FEAT, b"\0" * 57)


def test_caps_clip_plan_composites():
    caps = [P.CapEntry(id=i, kind=i % 3) for i in range(5)]
    assert P.unpack_caps(P.pack_caps(caps)) == caps
    assert P.unpack_caps(b"\x00") == []
    with pytest.raises(P.ProtocolError):
        P.unpack_caps(P.pack_caps(caps)[:-1])
    hdr = P.ClipHdr(clip_id=1, chunk=0, chunks=1)
    h2, data = P.unpack_clip(P.pack_clip(hdr, b"\x12\x34"))
    assert h2 == hdr and data == b"\x12\x34"
    tracks = [P.PlanTrack(role=i % 4, capture_id=i) for i in range(8)]
    payload = P.pack_plan(P.PlanHdr(plan_id=1), tracks)
    assert len(payload) == 9 + 8 * 30 <= P.LINK_MAX_PAYLOAD
    h3, t3 = P.unpack_plan(payload)
    assert h3.track_count == 8 and t3 == tracks
    with pytest.raises(P.ProtocolError):
        P.pack_plan(P.PlanHdr(), tracks + [P.PlanTrack()])


def test_cstring_truncation():
    r = P.Radio(rds_ps="X" * 20, rds_rt="Y" * 100)
    back = P.Radio.unpack(r.pack())
    assert back.rds_ps == "X" * 8 and back.rds_rt == "Y" * 64


@pytest.mark.skipif(shutil.which("g++") is None, reason="g++ not installed")
def test_sizes_match_c_header(tmp_path):
    assert os.path.exists(HEADER), HEADER
    names = list(P.EXPECTED_SIZES)
    src = tmp_path / "sizes.cpp"
    src.write_text(
        f'#include "{HEADER}"\n#include <cstdio>\nint main() {{\n'
        + "".join(f'  std::printf("{n} %zu\\n", sizeof({n}));\n' for n in names)
        + f'  std::printf("LINK_HEADER_SIZE %d\\n", LINK_HEADER_SIZE);\n'
        + f'  std::printf("LINK_MAX_PAYLOAD %d\\n", LINK_MAX_PAYLOAD);\n'
        + f'  std::printf("LINK_PROTO_VERSION %d\\n", LINK_PROTO_VERSION);\n'
        + "  return 0;\n}\n")
    exe = tmp_path / "sizes"
    subprocess.run(["g++", "-std=c++17", "-Wall", "-o", str(exe), str(src)], check=True, capture_output=True)
    out = dict(line.split() for line in subprocess.run([str(exe)], check=True, capture_output=True, text=True).stdout.splitlines())
    for n, (cls, expected) in P.EXPECTED_SIZES.items():
        assert int(out[n]) == cls.size() == expected, n
    assert int(out["LINK_HEADER_SIZE"]) == P.LINK_HEADER_SIZE
    assert int(out["LINK_MAX_PAYLOAD"]) == P.LINK_MAX_PAYLOAD
    assert int(out["LINK_PROTO_VERSION"]) == P.LINK_PROTO_VERSION


@pytest.mark.skipif(shutil.which("g++") is None, reason="g++ not installed")
def test_message_type_values_match_c_header(tmp_path):
    names = ["MSG_FEAT", "MSG_ONSET", "MSG_PULSE", "MSG_PIEZO", "MSG_RADIO", "MSG_GPS", "MSG_USER", "MSG_CAPS",
             "MSG_CLIP", "MSG_HELLO", "MSG_MOTION", "MSG_ENV", "MSG_RF", "SRC_COIL", "SRC_LIGHT", "MSG_PLAN", "MSG_REQ_CLIP", "MSG_ACK", "MSG_ERR", "MSG_LINK_STATE"]
    src = tmp_path / "types.cpp"
    src.write_text(f'#include "{HEADER}"\n#include <cstdio>\nint main() {{\n'
                   + "".join(f'  std::printf("{n} %d\\n", (int){n});\n' for n in names) + "}\n")
    exe = tmp_path / "types"
    subprocess.run(["g++", "-std=c++17", "-o", str(exe), str(src)], check=True, capture_output=True)
    out = dict(l.split() for l in subprocess.run([str(exe)], check=True, capture_output=True, text=True).stdout.splitlines())
    for n in names:
        assert int(out[n]) == getattr(P, n), n
