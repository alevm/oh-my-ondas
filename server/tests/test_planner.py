import asyncio
import json
import random
from types import SimpleNamespace

import pytest

import protocol as P
from config import Config
from planner import PLAN_SCHEMA, ClaudePlanner, CostMeter, PlanScheduler, euclid, rule_plan, summarize
from session import Session
from validate import validate_plan

CAPS = [
    P.CapEntry(id=1, source=P.SRC_MIC, length_ms=3000, kind=0, role=0, onsets=14),
    P.CapEntry(id=2, source=P.SRC_MIC, length_ms=9000, kind=2, role=1, onsets=1),
    P.CapEntry(id=3, source=P.SRC_RADIO, length_ms=4000, kind=1, role=2, onsets=4, pitch_hz_x10=4400),
    P.CapEntry(id=4, source=P.SRC_PIEZO, length_ms=2000, kind=0, role=255, onsets=8),
]


def make_session(level=-35.0, onset_p=0.3, flat=100, piezo_peaks=0.2, seed=3, place=None):
    rng = random.Random(seed)
    s = Session("test", now=0.0)
    s.add(P.MSG_CAPS, CAPS, now=0.0)
    for i in range(300):
        t = i * 0.1
        rms = int(65535 * 10 ** ((level + rng.gauss(0, 1)) / 20))
        on = 1 if rng.random() < onset_p else 0
        chroma = [20] * 12
        chroma[9] = 200
        s.add(P.MSG_FEAT, P.Feat(t_ms=int(t * 1000), bands_db=[int(level)] * 32, rms=rms, centroid_hz=1500,
                                 flatness=flat, chroma=chroma, onsets=on), now=t)
        if on:
            s.add(P.MSG_ONSET, P.Onset(t_ms=int(t * 1000), source=P.SRC_MIC, strength=150, band=6), now=t)
        s.add(P.MSG_PIEZO, P.Piezo(t_ms=int(t * 1000), rms=2000, bands_db=[-50] * 8,
                                   peaks=1 if rng.random() < piezo_peaks / 10 else 0), now=t)
        if i % 10 == 0:
            st = int(t * 104 / 15)
            s.add(P.MSG_PULSE, P.Pulse(t_ms=int(t * 1000), bpm_x10=1040, conf=200, bar=500 + st // 16, step=st % 16), now=t)
            s.add(P.MSG_RADIO, P.Radio(t_ms=int(t * 1000), band=0, freq_khz=93900, rssi=40, snr=20, speech_music=200,
                                       rds_ps="TESTFM", rds_rt="Hello from the test"), now=t)
            s.add(P.MSG_GPS, P.Gps(t_ms=int(t * 1000), lat_e7=413784000, lon_e7=21925000, speed_cms=140,
                                   heading_cdeg=9000, fix=1, sats=8), now=t)
    s.place = place
    return s


PLACE = {"osm": {"coastline": {"count": 1, "nearest_m": 40}, "road_major": {"count": 2, "nearest_m": 30},
                 "place_of_worship": {"count": 1, "nearest_m": 150, "names": ["Sant Miquel"]}},
         "weather": {"wind_kmh": 20, "rain_mm": 0, "temperature_c": 19}, "sun": {"elevation_deg": 30, "phase": "day"}}


def test_euclid():
    assert euclid(4) == [1, 0, 0, 0] * 4
    assert sum(euclid(5)) == 5 and sum(euclid(0)) == 0 and sum(euclid(20)) == 16


def test_rule_plan_valid_and_deterministic():
    s1, s2 = make_session(place=PLACE), make_session(place=PLACE)
    p1, p2 = rule_plan(s1, now=30.0), rule_plan(s2, now=30.0)
    assert p1 == p2
    clean, warns = validate_plan(p1, s1.caps, s1.current_bar(30.0), 1)
    roles = [t["role"] for t in clean["tracks"]]
    assert {"rhythm", "texture", "melody", "modulation"} <= set(roles)
    assert all(t["capture_id"] in s1.caps or t["capture_id"] == P.CAPTURE_NONE for t in clean["tracks"])
    assert clean["tempo"] == {"bpm": 104.0, "follow_pulse": True}  # confident pulse is followed
    mel = next(t for t in clean["tracks"] if t["role"] == "melody")
    assert mel["pitch"] == 0  # capture at A4 already matches chroma peak A
    assert "rules:" in clean["why"]
    rh = next(t for t in clean["tracks"] if t["role"] == "rhythm")
    tex = next(t for t in clean["tracks"] if t["role"] == "texture")
    assert rh["slice"] == "onsets" and tex["duck_on"] == "melody" and mel["scale_from"] == "chroma"
    assert 500 < clean["starts_at_bar"] <= s1.current_bar(30.0) + 1


def test_rule_plan_is_continuous_not_presets():
    """Denser onsets -> more rhythm hits; louder/noisier/windier -> denser texture, monotonically."""
    hits, dens = [], []
    for onset_p in (0.02, 0.1, 0.3, 0.6):
        p = rule_plan(make_session(onset_p=onset_p, place=PLACE), now=30.0)
        hits.append(sum(next(t for t in p["tracks"] if t["role"] == "rhythm")["steps"]))
    assert hits == sorted(hits) and hits[0] < hits[-1]
    for flat in (20, 100, 200):
        p = rule_plan(make_session(flat=flat, place=PLACE), now=30.0)
        dens.append(next(t for t in p["tracks"] if t["role"] == "texture")["density"]["to"])
    assert dens == sorted(dens) and dens[0] < dens[-1]
    near = rule_plan(make_session(place=PLACE), now=30.0)
    far = rule_plan(make_session(place={**PLACE, "osm": {}}), now=30.0)
    tex = lambda p: next(t for t in p["tracks"] if t["role"] == "texture")["density"]["to"]
    assert tex(near) > tex(far)  # sea nearby thickens the texture


def test_rule_plan_without_place_or_pulse():
    s = make_session(place=None)
    s.pulses.clear()
    p = rule_plan(s, now=30.0)
    clean, _ = validate_plan(p, s.caps, 0, 1)
    assert 50 <= clean["tempo"]["bpm"] <= 160


def test_bar_from_device_pulse():
    s = Session("b", now=0.0)
    assert s.bar_source == "estimate"
    s.add(P.MSG_PULSE, P.Pulse(t_ms=1000, bpm_x10=1200, conf=200, phase_ms=100, bar=41, step=14), now=10.0)
    assert s.bar_source == "device"
    assert s.current_bar(10.0) == 41
    assert s.current_bar(10.5) == 42  # 120 BPM: 2 steps in 0.125 s -> next bar after 0.125 s
    assert s.current_bar(12.0) == 42  # 2 s = 1 bar
    bar0, bar_ms = s.bar_grid()
    assert bar_ms == 2000 and bar0 == 1000 - 100 - 3 * 500
    s.add(P.MSG_PULSE, P.Pulse(t_ms=11000, bpm_x10=1200, conf=200, bar=65535, step=15), now=20.0)
    assert s.current_bar(20.2) & 0xFFFF == 0


def test_summary_mentions_inputs():
    s = make_session(place=PLACE)
    txt = summarize(s, now=30.0)
    for needle in ("TESTFM", "Hello from the test", "coastline", "Sant Miquel", "wind_kmh 20", "pulse: 104.0 BPM", "(device step",
                   "1: mic, percussive", "3: radio, tonal", "onset rate"):
        assert needle in txt, needle
    assert "41.37" not in txt and "2.19" not in txt  # raw coordinates are not sent to the model


def _schema_objects(node):
    if isinstance(node, dict):
        if node.get("type") == "object":
            yield node
        for v in node.values():
            yield from _schema_objects(v)
    elif isinstance(node, list):
        for v in node:
            yield from _schema_objects(v)


def test_schema_is_strict():
    for obj in _schema_objects(PLAN_SCHEMA):
        assert obj["additionalProperties"] is False
        assert set(obj["required"]) == set(obj["properties"])


class FakeMessages:
    def __init__(self, reply, delay=0.0, exc=None, stop="end_turn"):
        self.reply, self.delay, self.exc, self.stop, self.calls = reply, delay, exc, stop, []

    async def create(self, **kw):
        self.calls.append(kw)
        await asyncio.sleep(self.delay)
        if self.exc:
            raise self.exc
        return SimpleNamespace(stop_reason=self.stop, model=kw["model"],
                               content=[SimpleNamespace(type="text", text=json.dumps(self.reply))],
                               usage=SimpleNamespace(input_tokens=1800, output_tokens=420))


class FakeClient:
    def __init__(self, msgs):
        self.messages = msgs
        self.beta = SimpleNamespace(messages=msgs)


GOOD = {"starts_at_bar": 99999, "bars": 16, "tempo": {"bpm": 96, "follow_pulse": True},
        "tracks": [{"role": "rhythm", "capture_id": 4, "steps": [1, 0, 1, 0] * 4, "prob": 0.9, "pitch": 0,
                    "density": {"from": 0, "to": 0}, "modulation": {"source": "rms", "target": "rhythm_prob", "depth": 0}},
                   {"role": "melody", "capture_id": 42, "steps": [1] + [0] * 15, "prob": 1, "pitch": 3,
                    "density": {"from": 0, "to": 0}, "modulation": {"source": "rms", "target": "rhythm_prob", "depth": 0}}],
        "sections": [], "why": "mocked"}


def cfg(**kw):
    c = Config()
    c.plan_timeout_s = kw.pop("timeout", 3.0)
    c.plan_min_interval_s = 0.0
    for k, v in kw.items():
        setattr(c, k, v)
    return c


async def run_once(c, client, session=None):
    s = session or make_session(place=PLACE)
    sent = []

    async def on_plan(clean, source):
        sent.append((clean, source))

    sch = PlanScheduler(c, s, ClaudePlanner(c, client=client), clock=lambda: 30.0)
    assert sch.due(30.0) == "first"
    await sch.start("first", on_plan, image_fn=lambda: b"\x89PNG fake")
    return sent, sch


async def test_claude_plan_used_and_validated():
    msgs = FakeMessages(GOOD)
    c = cfg(attach_spectrogram=True)
    sent, sch = await run_once(c, FakeClient(msgs))
    clean, source = sent[0]
    assert source == "claude"
    assert [t["capture_id"] for t in clean["tracks"]] == [4]  # unknown capture 42 dropped
    kw = msgs.calls[0]
    assert kw["model"] == "claude-sonnet-5-5"
    assert kw["output_config"]["format"]["type"] == "json_schema"
    assert kw["fallbacks"] == "default" and kw["betas"]
    assert "tool_choice" not in kw
    assert kw["messages"][0]["content"][0]["type"] == "image"
    assert sch.claude.meter.total_in == 1800


@pytest.mark.parametrize("fake", [
    FakeMessages(GOOD, delay=10.0),                       # timeout
    FakeMessages(GOOD, exc=RuntimeError("api down")),    # API error
    FakeMessages({"tracks": "nope"}),                    # schema-violating JSON
    FakeMessages(GOOD, stop="refusal"),                  # refusal
], ids=["timeout", "error", "invalid", "refusal"])
async def test_fallback_to_rules(fake):
    c = cfg(timeout=3.0)
    sent, sch = await asyncio.wait_for(run_once(c, FakeClient(fake)), 6)
    clean, source = sent[0]
    assert source == "rules" and clean["tracks"]
    assert sch.stats["claude_errors"] == 1 or fake.reply == {"tracks": "nope"}


async def test_no_key_uses_rules(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    c = cfg()
    sent, sch = await run_once(c, None)
    assert sent[0][1] == "rules" and not sch.claude.available


async def test_single_request_in_flight():
    msgs = FakeMessages(GOOD, delay=0.3)
    c = cfg()
    s = make_session(place=PLACE)
    sch = PlanScheduler(c, s, ClaudePlanner(c, client=FakeClient(msgs)), clock=lambda: 30.0)

    async def on_plan(*a):
        pass

    sch.start("first", on_plan)
    await asyncio.sleep(0)
    assert sch.due(30.0) is None  # in flight
    await sch.task
    assert len(msgs.calls) == 1


def test_scheduler_bar_and_change_triggers():
    c = cfg(plan_every_bars=4, feature_change_threshold=0.2)
    s = make_session()
    sch = PlanScheduler(c, s, ClaudePlanner(c, client=None), clock=lambda: 30.0)
    s.last_plan = {"tracks": []}
    sch.last_bar = s.current_bar(30.0)
    sch.last_vec = s.feature_vector(30.0)
    assert sch.due(30.0) is None
    v = sch.last_vec
    sch.last_vec = v + 1.0
    assert sch.due(30.0) == "change"
    sch.last_vec = v
    assert sch.due(30.0 + 4 * 240 / 104.0) == "bars"


def test_cost_meter():
    t = [0.0]
    m = CostMeter(2.0, 10.0, clock=lambda: t[0])
    t[0] = 1800
    r = m.add(1_000_000, 100_000)
    assert r["usd_est"] == 3.0
    assert r["usd_per_hour_extrapolated"] == 6.0
    t[0] = 6000
    r = m.add(0, 0)
    assert r["usd_last_hour_est"] == 0.0


async def test_between_tools_thinking_option():
    msgs = FakeMessages(GOOD)
    c = cfg(anthropic_thinking="between_tools")
    await run_once(c, FakeClient(msgs))
    assert msgs.calls[0]["thinking"] == {"type": "between_tools"}


def test_enum_case_from_model_is_accepted():
    plan = json.loads(json.dumps(GOOD))
    plan["tracks"][0]["role"] = "Rhythm"
    plan["tracks"][0]["slice"] = "Onsets"
    s = make_session()
    clean, _ = validate_plan(plan, s.caps, 0, 1)
    assert clean["tracks"][0]["role"] == "rhythm" and clean["tracks"][0]["slice"] == "onsets"


def test_rule_plan_uses_heard_sounds():
    s = make_session(place={**PLACE, "osm": {}})
    base = next(t for t in rule_plan(s, now=30.0)["tracks"] if t["role"] == "texture")["density"]["to"]
    s.tags[P.SRC_MIC] = {"at": 29.0, "backend": "yamnet", "tags": [], "groups": {"water_waves": 0.9},
                         "descriptors": {}}
    heard = next(t for t in rule_plan(s, now=30.0)["tracks"] if t["role"] == "texture")["density"]["to"]
    assert heard > base  # waves heard by the tagger thicken the texture even without map water


def test_rule_melody_notes_follow_chroma():
    s = make_session(place=PLACE)
    for t, f in s.feats:  # strong A (9), E (4) and C# (1)
        f.chroma = [10] * 12
        f.chroma[9], f.chroma[4], f.chroma[1] = 220, 200, 180
    p = rule_plan(s, now=30.0)
    mel = next(t for t in p["tracks"] if t["role"] == "melody")
    hits = [i for i, v in enumerate(mel["steps"]) if v]
    assert all(mel["notes"][i] is not None for i in hits)
    assert all(n is None for i, n in enumerate(mel["notes"]) if i not in hits)
    assert {n % 12 for n in mel["notes"] if n is not None} <= {0, 7, 4}  # A, E (+7/-5), C# (+4)
    clean, _ = validate_plan(p, s.caps, 0, 1)
    from validate import pack_valid_plan
    _, tracks = P.unpack_plan(pack_valid_plan(clean))
    mt = next(t for t in tracks if t.role == 2)
    assert [n == P.LINK_NOTE_NONE for n in mt.notes] == [n is None for n in mel["notes"]]


def test_device_time_maps_backlog_to_the_past():
    s = Session("clock", now=0.0)
    for i in range(50):  # live: device t_ms 0..4.9 s, received immediately at server time 100..104.9
        s.add(P.MSG_FEAT, P.Feat(t_ms=i * 100, onsets=0), now=100.0 + i * 0.1)
    # link drops for 60 s; the device keeps measuring, then flushes 60 s of backlog in 1 s
    for i in range(600):
        s.add(P.MSG_FEAT, P.Feat(t_ms=5000 + i * 100, onsets=1), now=165.0 + i / 600)
    s.add(P.MSG_FEAT, P.Feat(t_ms=65100, onsets=0), now=166.0)
    st10 = s.feature_stats(now=166.0, window=10.0)
    assert st10["n"] == 91  # device time 56.0..65.1 s only, not the whole flushed minute
    at = {f.t_ms: t for t, f in s.feats}
    assert max(at.values()) <= 166.0 and abs(at[6000] - 106.0) < 0.2  # backlog item placed 6 s after start
    # reboot: t_ms restarts at 0 -> estimator resets instead of mapping to the far past
    s.add(P.MSG_FEAT, P.Feat(t_ms=0), now=200.0)
    assert s.feats[-1][0] == 200.0



def add_body(s, cadence, standing_every=0, dalt_per_s=0.0, mag_burst=False, t_end=30.0):
    """Adds 30 s of MOTION (10 Hz) and ENV (1 Hz) to a session built by make_session."""
    for i in range(int(t_end * 10)):
        t = i * 0.1
        stand = standing_every and (i % standing_every) < standing_every // 2
        s.add(P.MSG_MOTION, P.Motion(t_ms=int(t * 1000), accel_rms_mg=30 if stand else 260,
                                     cadence_x10=0 if stand else int(cadence * 10), heading_cdeg=9000,
                                     mag_ut_x10=450, mag_var_x10=2500 if (mag_burst and i % 100 < 30) else 20), now=t)
        if i % 10 == 0:
            s.add(P.MSG_ENV, P.Env(t_ms=int(t * 1000), dalt_cm=int(100 * dalt_per_s * t)), now=t)


def _no_pulse(s):
    s.pulses.clear()
    return s


def test_cadence_leans_tempo_when_no_pulse():
    s = _no_pulse(make_session(place=PLACE, onset_p=0.05))
    base = rule_plan(s, now=30.0)["tempo"]["bpm"]
    s2 = _no_pulse(make_session(place=PLACE, onset_p=0.05))
    add_body(s2, cadence=118)
    walk = rule_plan(s2, now=30.0)
    assert abs(walk["tempo"]["bpm"] - 118) < abs(base - 118) and "cadence" in walk["why"]


def test_standing_is_sparser_and_descending_is_darker():
    walk = make_session(place=PLACE)
    add_body(walk, cadence=110)
    stand = make_session(place=PLACE)
    add_body(stand, cadence=110, standing_every=2000)  # all standing
    hits = lambda p: sum(next(t for t in p["tracks"] if t["role"] == "rhythm")["steps"])
    assert hits(rule_plan(stand, now=30.0)) < hits(rule_plan(walk, now=30.0))
    down = make_session(place=PLACE)
    add_body(down, cadence=88, dalt_per_s=-0.2)  # 12 m/min down the metro stairs
    mel = lambda p: next(t for t in p["tracks"] if t["role"] == "melody")["pitch"]
    pd = rule_plan(down, now=30.0)
    assert mel(pd) <= mel(rule_plan(walk, now=30.0)) - 12 and "descending" in pd["why"]


def test_tram_magnetic_bursts_drive_modulation_and_summary():
    s = make_session(place=PLACE)
    add_body(s, cadence=0, standing_every=2, mag_burst=True)
    s.add(P.MSG_RF, P.Rf(t_ms=999000, ap_count=31, rssi_median=-80, rssi_max=-50, ch_busy=[5] + [0] * 12), now=30.0)
    p = rule_plan(s, now=30.0)
    mod = next(t for t in p["tracks"] if t["role"] == "modulation")["modulation"]
    assert mod["source"] == "mag_var" and mod["target"] == "texture_filter"
    txt = summarize(s, now=30.0)
    for needle in ("body (IMU", "standing", "magnetic field", "height:", "WiFi density: 31 access points"):
        assert needle in txt, needle
    clean, _ = validate_plan(p, s.caps, 0, 1)
    from validate import pack_valid_plan
    _, tracks = P.unpack_plan(pack_valid_plan(clean))
    assert next(t for t in tracks if t.role == 3).mod_source == P.MOD_SOURCES.index("mag_var") == 8


def test_rf_uses_its_own_clock():
    s = Session("rf", now=0.0)
    s.add(P.MSG_FEAT, P.Feat(t_ms=5000), now=5.0)
    s.add(P.MSG_RF, P.Rf(t_ms=900000, ap_count=3), now=6.0)  # ESP32 clock far ahead of the Teensy's
    s.add(P.MSG_FEAT, P.Feat(t_ms=6000), now=6.0)
    assert s.rf[-1][0] == 6.0 and s.feats[-1][0] == 6.0  # neither clock disturbs the other


def test_schema_has_all_mod_sources():
    enum = PLAN_SCHEMA["properties"]["tracks"]["items"]["properties"]["modulation"]["properties"]["source"]["enum"]
    assert enum[5:] == ["cadence", "accel_rms", "heading", "mag_var", "dalt", "dp_fast", "rf_density"]
