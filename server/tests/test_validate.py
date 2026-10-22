import pytest

import protocol as P
from validate import PlanError, mask_to_steps, pack_valid_plan, steps_to_mask, validate_plan

CAPS = {i: P.CapEntry(id=i, kind=i % 3) for i in (1, 2, 3, 7)}


def track(**kw):
    t = {"role": "rhythm", "capture_id": 1, "steps": [1, 0, 0, 1] * 4, "prob": 0.8, "pitch": 0,
         "density": {"from": 0.2, "to": 0.6}, "modulation": {"source": "rms", "target": "texture_filter", "depth": 0.5}}
    t.update(kw)
    return t


def plan(**kw):
    p = {"starts_at_bar": 17, "bars": 16, "tempo": {"bpm": 92, "follow_pulse": True},
         "tracks": [track()], "sections": [{"bar": 0, "name": "enter"}], "why": "test"}
    p.update(kw)
    return p


def test_steps_mask_forms():
    assert steps_to_mask([1, 0, 0, 1] * 4) == 0x9999
    assert steps_to_mask(0x1_0001) == 0x0001
    assert steps_to_mask("x...x...x...x...") == 0x1111
    assert steps_to_mask("0x8001") == 0x8001
    assert steps_to_mask([1] * 20) == 0xFFFF
    assert mask_to_steps(0x8001) == [1] + [0] * 14 + [1]


def test_valid_plan_packs():
    clean, warns = validate_plan(plan(), CAPS, current_bar=16, plan_id=42)
    assert warns == []
    b = pack_valid_plan(clean)
    hdr, tracks = P.unpack_plan(b)
    assert (hdr.plan_id, hdr.starts_at_bar, hdr.bars, hdr.bpm_x10, hdr.follow_pulse, hdr.track_count) == (42, 17, 16, 920, 1, 1)
    t = tracks[0]
    assert t.role == 0 and t.capture_id == 1 and t.steps == 0x9999 and t.prob == 204
    assert (t.density_from, t.density_to, t.mod_depth) == (51, 153, 128)
    assert (t.slice, t.duck_on, t.flags) == (0, P.DUCK_NONE, 0)  # defaults: whole, none, no snap


def test_slice_duck_scale_fields():
    tr = [track(role="texture", capture_id=2, slice="even16", duck_on="melody", scale_from="chroma"),
          track(role="melody", capture_id=3, slice="onsets", duck_on="melody", scale_from="chroma"),
          track(slice="granular", duck_on="drums", scale_from="key")]
    clean, warns = validate_plan(plan(tracks=tr), CAPS, 16, 1)
    a, b, c = clean["tracks"]
    assert (a["slice"], a["duck_on"], a["scale_from"]) == ("even16", "melody", "chroma")
    assert b["duck_on"] == "none"  # a track never ducks under its own role
    assert (c["slice"], c["duck_on"], c["scale_from"]) == ("whole", "none", "none") and len(warns) == 3
    _, tracks = P.unpack_plan(pack_valid_plan(clean))
    assert (tracks[0].slice, tracks[0].duck_on, tracks[0].flags) == (2, 2, P.FLAG_SNAP_CHROMA)
    assert (tracks[1].slice, tracks[1].duck_on, tracks[1].flags) == (1, P.DUCK_NONE, P.FLAG_SNAP_CHROMA)


def test_starts_at_bar_wraps():
    clean, warns = validate_plan(plan(starts_at_bar=2), CAPS, current_bar=65534, plan_id=1)
    assert clean["starts_at_bar"] == 2 and warns == []  # 65534 -> 2 is 4 bars ahead across the wrap
    clean, _ = validate_plan(plan(starts_at_bar=65530), CAPS, current_bar=65536 + 3, plan_id=1)
    assert clean["starts_at_bar"] == 4


def test_unknown_capture_dropped_and_ranges_clamped():
    p = plan(bars=500, starts_at_bar=3, tempo={"bpm": 999, "follow_pulse": False},
             tracks=[track(capture_id=99), track(capture_id="c07", pitch=80, prob=3, density={"from": -1, "to": 9}),
                     track(role="lead"), "nope"])
    clean, warns = validate_plan(p, CAPS, current_bar=10, plan_id=70000)
    assert len(clean["tracks"]) == 1
    t = clean["tracks"][0]
    assert t["capture_id"] == 7 and t["pitch"] == 24 and t["prob"] == 1.0
    assert t["density"] == {"from": 0.0, "to": 1.0}
    assert clean["bars"] == 64 and clean["starts_at_bar"] == 11 and clean["tempo"]["bpm"] == 200
    assert clean["plan_id"] == 70000 & 0xFFFF
    assert any("99" in w for w in warns) and any("lead" in w for w in warns)


def test_track_limit_and_modulation_without_capture():
    tracks = [track(capture_id=1)] * 10 + [track(role="modulation", capture_id=None,
                                                 modulation={"source": "piezo_rms", "target": "rhythm_prob", "depth": 0.3})]
    clean, warns = validate_plan(plan(tracks=tracks), CAPS, 0, 1)
    assert len(clean["tracks"]) == 8
    clean, _ = validate_plan(plan(tracks=tracks[-1:]), CAPS, 0, 1)
    assert clean["tracks"][0]["capture_id"] == P.CAPTURE_NONE
    hdr, tr = P.unpack_plan(pack_valid_plan(clean))
    assert tr[0].role == 3 and tr[0].mod_source == 2 and tr[0].mod_target == 1


def test_bad_modulation_dropped_and_empty_raises():
    bad = track(role="modulation", modulation={"source": "moon", "target": "x", "depth": 1})
    with pytest.raises(PlanError):
        validate_plan(plan(tracks=[bad]), CAPS, 0, 1)
    with pytest.raises(PlanError):
        validate_plan(plan(tracks=[]), CAPS, 0, 1)
    with pytest.raises(PlanError):
        validate_plan([], CAPS, 0, 1)


def test_bpm_zero_keeps_tempo_and_nan_safe():
    clean, _ = validate_plan(plan(tempo={"bpm": 0, "follow_pulse": True}, tracks=[track(prob=float("nan"))]), CAPS, 0, 1)
    assert clean["tempo"]["bpm"] == 0
    assert clean["tracks"][0]["prob"] == 1.0
    hdr, _ = P.unpack_plan(pack_valid_plan(clean))
    assert hdr.bpm_x10 == 0


def test_notes_clamped_nulls_are_rests():
    from validate import clean_notes
    assert clean_notes(None) == [None] * 16
    n = clean_notes([0, None, 99, -99, "3", "x", True, -128, 2.6] + [0] * 20)
    assert n[:9] == [0, None, 48, -48, 3, None, None, None, 3] and len(n) == 16
    tr = [track(role="melody", capture_id=3, notes=[0, None, 7] + [None] * 13),
          track(notes=[5] * 16)]  # rhythm: notes ignored
    clean, _ = validate_plan(plan(tracks=tr), CAPS, 0, 1)
    assert clean["tracks"][0]["notes"][:3] == [0, None, 7] and clean["tracks"][1]["notes"] == [None] * 16
    _, tracks = P.unpack_plan(pack_valid_plan(clean))
    assert tracks[0].notes[:3] == [0, P.LINK_NOTE_NONE, 7] and tracks[1].notes == [P.LINK_NOTE_NONE] * 16
