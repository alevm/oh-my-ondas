"""App + simulator over a real local WebSocket, Claude mocked, place services mocked."""
import asyncio
import json
from types import SimpleNamespace

import httpx
import numpy as np
import pytest
from websockets.asyncio.client import connect
from websockets.exceptions import ConnectionClosed, InvalidStatus

import glob
import os

import protocol as P
import sim_device
from journal import read_walk
from tagger import DEFAULT_MODEL_PATH, make_tagger, read_wav
from app import LayerTwoServer
from config import Config
from planner import ClaudePlanner
from place import PlaceService
from session import Clip, bar_delta
from test_place import mock_client
from test_tagger import speechlike, waves

TOKEN = "test-token-not-a-secret"


class PlanningFake:
    """Mock Messages API: builds a plan from the capture ids listed in the summary text."""

    def __init__(self):
        self.calls = []
        self.messages = self
        self.beta = SimpleNamespace(messages=self)

    async def create(self, **kw):
        self.calls.append(kw)
        text = kw["messages"][0]["content"][-1]["text"]
        ids = [int(line.split(":")[0]) for line in text.splitlines() if line.startswith("  ") and line.strip()[0].isdigit()]
        plan = {"starts_at_bar": 0, "bars": 16, "tempo": {"bpm": 0, "follow_pulse": True},
                "tracks": [{"role": "rhythm", "capture_id": i, "steps": [1, 0, 0, 0] * 4, "prob": 0.8, "pitch": 0,
                            "density": {"from": 0, "to": 0},
                            "modulation": {"source": "rms", "target": "rhythm_prob", "depth": 0}} for i in ids[:3]]
                + [{"role": "texture", "capture_id": 200, "steps": [0] * 16, "prob": 1, "pitch": 0,
                    "density": {"from": 0.1, "to": 0.5},
                    "modulation": {"source": "rms", "target": "rhythm_prob", "depth": 0}}],
                "sections": [], "why": "mock"}
        return SimpleNamespace(stop_reason="end_turn", model=kw["model"],
                               content=[SimpleNamespace(type="text", text=json.dumps(plan))],
                               usage=SimpleNamespace(input_tokens=2000, output_tokens=500))


def make_cfg(tmp_path=None):
    c = Config()
    c.journal_dir = str(tmp_path / "journal") if tmp_path else "/nonexistent"
    c.journal_enabled = tmp_path is not None
    c.device_tokens = [TOKEN, "other"]
    c.plan_every_bars = 2
    c.plan_min_interval_s = 1.0
    c.clip_interval_s = 1.5
    c.clip_seconds = 2
    c.attach_spectrogram = True
    return c


@pytest.fixture(params=["dsp", "yamnet"])
async def server(request, tmp_path):
    if request.param == "yamnet" and not os.path.exists(DEFAULT_MODEL_PATH):
        pytest.skip("YAMNet model not downloaded (python tools/fetch_model.py)")
    cfg = make_cfg(tmp_path)
    fake = PlanningFake()
    srv = LayerTwoServer(cfg, claude=ClaudePlanner(cfg, client=fake),
                         place=PlaceService(cfg, client=mock_client([])), tagger=make_tagger(request.param))
    srv.journal_root = tmp_path / "journal"
    await srv.start(host="127.0.0.1", port=0)
    srv.fake = fake
    yield srv
    await srv.stop()


async def test_end_to_end_walk(server):
    url = f"ws://127.0.0.1:{server.port}"
    res = await sim_device.run(url, TOKEN, duration=7.0, speed=400.0, quiet=True)
    assert len(res["plans"]) >= 2, res
    for hdr, tracks in res["plans"]:
        assert 1 <= hdr.track_count <= 8
        # starts_at_bar follows the device's PULSE bar counter (sim starts at bar 0)
        assert 1 <= hdr.starts_at_bar and bar_delta(hdr.starts_at_bar, res["device_bar"]) <= 8
        for t in tracks:
            assert t.capture_id in (1, 2, 3, 4, 5)  # never the bogus 200 from the mock
    assert res["errs"] == []
    assert res["acks"] >= 2  # HELLO + CAPS (+ clips)
    assert res["req_clips"], "server should request clips"
    dev = next(iter(server.devices.values()))
    s = dev.session
    assert server.fake.calls, "Claude mock was called"
    assert dev.scheduler.stats["claude"] >= 1
    assert s.place and s.place["osm"]["coastline"]["count"] >= 1
    assert s.tags, "a clip was assembled and tagged"
    # the spectrogram was attached once a clip existed
    assert any(c["messages"][0]["content"][0]["type"] == "image" for c in server.fake.calls)
    for _ in range(50):  # server-side close handling finishes shortly after the client leaves
        if dev.ws is None:
            break
        await asyncio.sleep(0.05)
    assert dev.ws is None
    # walk journal: reviewable, no audio, rounded positions
    files = glob.glob(str(server.journal_root / "*" / "*.jsonl"))
    assert len(files) == 1
    evs = read_walk(files[0])
    kinds = {e["ev"] for e in evs}
    assert {"start", "hello", "caps", "place", "plan", "disconnect"} <= kinds
    assert all(e["plan"]["why"] for e in evs if e["ev"] == "plan")
    for e in evs:
        if e["ev"] == "place":
            assert e["lat"] == round(e["lat"], 3) and e["osm"]["coastline"]["count"] >= 1
    raw = open(files[0]).read()
    assert "pcm" not in raw and "Bearer" not in raw and TOKEN not in raw
    if server.tagger.name == "yamnet":
        assert "clip" in kinds  # radio/piezo clips tagged (mic clips may be discarded)


async def test_auth_rejected(server):
    url = f"ws://127.0.0.1:{server.port}"
    for headers in ({}, {"Authorization": "Bearer wrong"}, {"Authorization": TOKEN}):
        with pytest.raises(InvalidStatus) as e:
            async with connect(url, additional_headers=headers):
                pass
        assert e.value.response.status_code == 401
    assert server.devices == {}


async def test_healthz(server):
    async with httpx.AsyncClient() as c:
        r = await c.get(f"http://127.0.0.1:{server.port}/healthz")
    assert r.status_code == 200


async def test_malformed_and_wrong_direction_frames(server):
    url = f"ws://127.0.0.1:{server.port}"
    async with connect(url, additional_headers={"Authorization": f"Bearer {TOKEN}"}) as ws:
        await ws.send(b"\x01\x00")                                           # short
        await ws.send(P.pack_frame(P.MSG_FEAT, 5, b"\0" * 10))              # wrong size
        await ws.send(P.pack_frame(P.MSG_PLAN, 6, b""))                      # server->device type
        await ws.send("text")
        await ws.send(P.pack_frame(P.MSG_HELLO, 7, P.Hello(proto=9).pack()))  # wrong proto -> ERR + close
        errs = []
        with pytest.raises(ConnectionClosed) as cc:
            while True:
                t, _, payload = P.unpack_frame(await asyncio.wait_for(ws.recv(), 2))
                assert t == P.MSG_ERR
                errs.append(P.Err.unpack(payload))
    assert [e.code for e in errs] == [P.ERR_MALFORMED, P.ERR_MALFORMED, P.ERR_UNKNOWN_TYPE,
                                      P.ERR_MALFORMED, P.ERR_MALFORMED]
    assert cc.value.rcvd.code == 1008


async def test_proto_header_mismatch_rejected_at_handshake(server):
    url = f"ws://127.0.0.1:{server.port}"
    with pytest.raises(InvalidStatus) as e:
        async with connect(url, additional_headers={"Authorization": f"Bearer {TOKEN}", "X-Ondas-Proto": "2"}):
            pass
    assert e.value.response.status_code == 426
    async with connect(url, additional_headers={"Authorization": f"Bearer {TOKEN}",
                                                "X-Ondas-Proto": str(P.LINK_PROTO_VERSION)}) as ws:
        await ws.send(P.pack_frame(P.MSG_HELLO, 1, P.Hello().pack()))
        t, _, payload = P.unpack_frame(await asyncio.wait_for(ws.recv(), 2))
        assert t == P.MSG_ACK and P.Ack.unpack(payload).ref_type == P.MSG_HELLO


async def test_rate_limit_closes_flooder(server):
    url = f"ws://127.0.0.1:{server.port}"
    frame = P.pack_frame(P.MSG_FEAT, 1, P.Feat().pack())
    async with connect(url, additional_headers={"Authorization": f"Bearer {TOKEN}"}) as ws:
        for _ in range(4400):  # burst + one-off reconnect backlog allowance are accepted
            await ws.send(frame)
        await asyncio.sleep(0.05)
        rate_errs, closed = 0, False
        try:
            for _ in range(3000):
                await ws.send(frame)
            while True:
                t, _, payload = P.unpack_frame(await asyncio.wait_for(ws.recv(), 2))
                if t == P.MSG_ERR and P.Err.unpack(payload).code == P.ERR_RATE:
                    rate_errs += 1
        except ConnectionClosed as e:
            closed = e.rcvd is not None and e.rcvd.code == 1008
        assert closed  # ERR 5 may or may not be read before the close frame


def test_rate_limiter_unit():
    from app import RateLimiter
    t = [0.0]
    rl = RateLimiter(rate=200, burst=400, clock=lambda: t[0])
    assert sum(rl.allow() for _ in range(450)) == 400 and not rl.abusive
    t[0] += 0.5  # refills 100
    assert sum(rl.allow() for _ in range(100)) == 100
    for _ in range(400):
        rl.allow()
    assert rl.abusive
    t[0] += 10
    rl.allow()
    assert not rl.abusive  # old drops expire; normal 35 msg/s traffic is far below the limit


SPEECH_WAV = os.path.join(os.path.dirname(__file__), "..", ".testdata", "speech_OSR_us_000_0010_8k.wav")
WAVES_WAV = glob.glob(os.path.join(os.path.dirname(__file__), "..", ".testdata", "esc50", "sea_waves__*.wav"))


def _real(path):
    from tagger import to_16k_int16
    x, sr = read_wav(path)
    return to_16k_int16(x[: sr * 8], sr)


async def test_speech_mic_clip_discarded(server):
    from app import DeviceState
    from session import Session
    st = DeviceState(server, Session("x"))
    s = st.session
    # device flagged speech while recording: always discarded
    await server._on_clip(st, Clip(2, P.SRC_MIC, 16000, waves(), 0.0, device_speech=0.9))
    assert s.discarded_speech_clips == 1 and not s.clips
    if server.tagger.name != "yamnet":
        # no speech model: mic clips are dropped unseen, radio is kept
        await server._on_clip(st, Clip(4, P.SRC_MIC, 16000, waves(), 0.0))
        assert s.discarded_speech_clips == 2 and P.SRC_MIC not in s.clips
        await server._on_clip(st, Clip(3, P.SRC_RADIO, 16000, speechlike(), 0.0))
        assert P.SRC_RADIO in s.clips
        return
    if not os.path.exists(SPEECH_WAV) or not WAVES_WAV:
        pytest.skip("real recordings not downloaded (python tools/fetch_testdata.py)")
    speech = _real(SPEECH_WAV)
    await server._on_clip(st, Clip(5, P.SRC_MIC, 16000, speech, 0.0))
    assert s.discarded_speech_clips == 2 and P.SRC_MIC not in s.clips and P.SRC_MIC not in s.tags
    await server._on_clip(st, Clip(6, P.SRC_RADIO, 16000, speech, 0.0))  # broadcast speech is kept
    assert P.SRC_RADIO in s.clips
    await server._on_clip(st, Clip(7, P.SRC_MIC, 16000, _real(WAVES_WAV[0]), 0.0))
    assert P.SRC_MIC in s.clips and s.tags[P.SRC_MIC]["groups"]["water_waves"] > 0.5


async def test_backlog_after_connect_and_exempt_messages(server):
    """A reconnecting device flushes its buffer: thousands of frames at once are fine,
    and HELLO/CAPS are never rate-dropped."""
    url = f"ws://127.0.0.1:{server.port}"
    feat = P.pack_frame(P.MSG_FEAT, 1, P.Feat().pack())
    async with connect(url, additional_headers={"Authorization": f"Bearer {TOKEN}"}) as ws:
        for _ in range(3000):
            await ws.send(feat)
        for i in range(500):  # bucket is now drained by FEAT; CAPS still go through
            await ws.send(feat)
        await ws.send(P.pack_frame(P.MSG_CAPS, 9, P.pack_caps([P.CapEntry(id=1)])))
        got = []
        try:
            while True:
                t, _, payload = P.unpack_frame(await asyncio.wait_for(ws.recv(), 1.5))
                got.append((t, payload))
        except TimeoutError:
            pass
    assert (P.MSG_ACK, P.Ack(9, P.MSG_CAPS).pack()) in got
    assert not any(t == P.MSG_ERR and P.Err.unpack(p).code == P.ERR_RATE for t, p in got)


async def test_plan_reject_resyncs_on_caps(server):
    url = f"ws://127.0.0.1:{server.port}"
    res = await sim_device.run(url, TOKEN, duration=7.0, speed=400.0, quiet=True, reject_first_plan=True)
    dev = next(iter(server.devices.values()))
    assert res["plans_rejected"] == 1 and len(res["plans"]) >= 1  # re-planned after the fresh CAPS
    assert dev.scheduler.stats["device_rejects"] == 1 and dev.scheduler.stats["device_acks"] >= 1
    assert not dev.session.caps_stale


async def test_clip_request_refused_and_timeout(server):
    from app import DeviceState
    from session import Session
    st = DeviceState(server, Session("x"))
    st.pending_clip = {"source": P.SRC_MIC, "seq": 42, "at": 0.0}
    server._on_device_reply(st, P.MSG_ERR, P.Err(41, P.MSG_REQ_CLIP, 3))  # other request: ignored
    assert st.pending_clip is not None
    server._on_device_reply(st, P.MSG_ERR, P.Err(42, P.MSG_REQ_CLIP, 3))
    assert st.pending_clip is None
    # timeout path, through the ticker
    server.cfg.clip_request_timeout_s = 0.3
    server.cfg.clip_interval_s = 1000
    st.next_clip_at = 1e18
    st.pending_clip = {"source": P.SRC_RADIO, "seq": 7, "at": __import__("time").monotonic()}
    task = asyncio.create_task(server._ticker(st))
    await asyncio.sleep(0.8)
    task.cancel()
    assert st.pending_clip is None


def test_clip_source_follows_left_input(server):
    import time as _t
    from app import DeviceState
    from session import Session
    st = DeviceState(server, Session("y", now=_t.monotonic()))
    now = _t.monotonic()
    st.session.add(P.MSG_FEAT, P.Feat(t_ms=1000, left_source=P.SRC_PIEZO), now=now)
    st.session.add(P.MSG_RADIO, P.Radio(t_ms=1000), now=now)
    picks = {server._next_clip_source(st, now) for _ in range(4)}
    # never the mic while LINE-IN L is on the piezo; piezo (acoustic) needs the speech model too
    assert picks == ({P.SRC_PIEZO, P.SRC_RADIO} if server.tagger.name == "yamnet" else {P.SRC_RADIO})
    st.session.add(P.MSG_FEAT, P.Feat(t_ms=1100, left_source=P.SRC_MIC), now=now + 0.1)
    picks = {server._next_clip_source(st, now + 0.1) for _ in range(4)}
    expect_mic = server.tagger.name == "yamnet"
    assert (P.SRC_MIC in picks) == expect_mic and P.SRC_PIEZO not in picks


async def test_reconnect_does_not_wait_for_old_close(server):
    url = f"ws://127.0.0.1:{server.port}"
    hdr = {"Authorization": f"Bearer {TOKEN}"}
    old = await connect(url, additional_headers=hdr)
    old.transport.pause_reading()  # half-open: the old peer never answers the close handshake
    t0 = asyncio.get_running_loop().time()
    async with connect(url, additional_headers=hdr) as new:
        await new.send(P.pack_frame(P.MSG_HELLO, 1, P.Hello().pack()))
        t, _, _ = P.unpack_frame(await asyncio.wait_for(new.recv(), 2))
        assert t == P.MSG_ACK
    assert asyncio.get_running_loop().time() - t0 < 2.0
    old.transport.abort()



async def test_coil_and_light_clips_skip_speech_check(server):
    from app import DeviceState
    from session import Session
    st = DeviceState(server, Session("z"))
    await server._on_clip(st, Clip(8, P.SRC_COIL, 16000, speechlike(), 0.0, device_speech=0.0))
    await server._on_clip(st, Clip(9, P.SRC_LIGHT, 16000, waves(), 0.0))
    assert P.SRC_COIL in st.session.clips and P.SRC_LIGHT in st.session.clips
    assert st.session.discarded_speech_clips == 0
    # piezo is acoustic (voices through surfaces): checked like the mic
    await server._on_clip(st, Clip(10, P.SRC_PIEZO, 16000, waves(), 0.0, device_speech=0.9))
    assert P.SRC_PIEZO not in st.session.clips


def test_clip_source_coil_when_selected(server):
    import time as _t
    from app import DeviceState
    from session import Session
    now = _t.monotonic()
    st = DeviceState(server, Session("w", now=now))
    st.session.add(P.MSG_FEAT, P.Feat(t_ms=1000, left_source=P.SRC_COIL), now=now)
    assert {server._next_clip_source(st, now) for _ in range(3)} == {P.SRC_COIL}


def _clip_frames(source, pcm, clip_id=11, sr=16000):
    import adpcm
    ch = adpcm.encode_chunks(pcm, P.LINK_MAX_PAYLOAD - P.ClipHdr.size())
    return [P.pack_frame(P.MSG_CLIP, 100 + i, P.pack_clip(P.ClipHdr(clip_id=clip_id, source=source, sample_rate=sr, chunk=i,
                                                                    chunks=len(ch), predictor=p, step_index=k), d))
            for i, (p, k, d) in enumerate(ch)]


def _recording_state(server, name, now=None):
    from app import DeviceState
    from session import Session
    st = DeviceState(server, Session(name, now=now))
    sent = []

    async def send(t, payload):
        sent.append((t, payload))
        return len(sent)
    st.send = send
    return st, sent


async def test_only_the_requested_clip_is_taken(server, monkeypatch):
    import threading
    import app as app_mod
    threads = []
    real = app_mod.decode_assembly
    monkeypatch.setattr(app_mod, "decode_assembly", lambda a: (threads.append(threading.current_thread()), real(a))[1])
    st, sent = _recording_state(server, "u")
    s = st.session
    errs = lambda: [P.Err.unpack(p).code for t, p in sent if t == P.MSG_ERR]
    await server._dispatch(st, _clip_frames(7, waves(1.0))[0])  # no such source
    assert errs() == [P.ERR_MALFORMED]
    for f in _clip_frames(P.SRC_COIL, waves(1.0)):  # unrequested: dropped unseen
        await server._dispatch(st, f)
    st.pending_clip = {"source": P.SRC_RADIO, "seq": 5, "at": 0.0}
    for f in _clip_frames(P.SRC_COIL, waves(1.0), clip_id=12):  # not the source asked for
        await server._dispatch(st, f)
    for f in _clip_frames(P.SRC_RADIO, waves(1.0), clip_id=13):  # before the device ACKed: not ours yet
        await server._dispatch(st, f)
    assert not s.clips and not s.tags and errs() == [P.ERR_MALFORMED] and not threads
    server._on_device_reply(st, P.MSG_ACK, P.Ack(5, P.MSG_REQ_CLIP))
    for f in _clip_frames(P.SRC_RADIO, waves(1.0), clip_id=14):
        await server._dispatch(st, f)
    assert list(s.clips) == [P.SRC_RADIO] and st.pending_clip is None
    assert (P.MSG_ACK, P.Ack(100 + len(_clip_frames(P.SRC_RADIO, waves(1.0))) - 1, P.MSG_CLIP).pack()) in sent
    assert threads and threads[0] is not threading.main_thread()  # ADPCM decode off the event loop


async def test_device_speech_window_covers_a_queued_recording(server, monkeypatch):
    """REQ_CLIP queued behind another clip: recording starts later, speech is flagged in its first
    second, then 1.6 s detector tail and ~2.4 s of paced chunks. The old window (clip length
    before the last chunk) missed it; the window from the request does not."""
    import time as _t
    server.cfg.mic_clips_require_model = False  # reach the device-flag check with either tagger
    reasons = []
    real = server._discard
    monkeypatch.setattr(server, "_discard", lambda st, c, why, est: (reasons.append((why, c.device_speech)),
                                                                      real(st, c, why, est))[1])
    now = _t.monotonic()
    st, _ = _recording_state(server, "v", now=now - 20)
    s = st.session
    st.pending_clip = {"source": P.SRC_MIC, "seq": 5, "at": now - 12.0}
    server._on_device_reply(st, P.MSG_ACK, P.Ack(5, P.MSG_REQ_CLIP))
    s.add(P.MSG_FEAT, P.Feat(t_ms=1000, speech=230), now=now - 9.5)
    s.add(P.MSG_FEAT, P.Feat(t_ms=10400, speech=0), now=now - 0.1)
    assert s.max_speech(now - 6.1 - 1.0, now + 1) == 0
    for f in _clip_frames(P.SRC_MIC, waves(6.0)):
        await server._dispatch(st, f)
    assert reasons and reasons[0][0] == "speech" and reasons[0][1] > 0.5
    assert P.SRC_MIC not in s.clips and P.SRC_MIC not in s.tags


async def test_hello_caps_have_their_own_bucket(server):
    from app import CTL_BURST
    url = f"ws://127.0.0.1:{server.port}"
    caps = P.pack_frame(P.MSG_CAPS, 9, P.pack_caps([P.CapEntry(id=1)]))
    async with connect(url, additional_headers={"Authorization": f"Bearer {TOKEN}"}) as ws:
        for _ in range(40):
            await ws.send(caps)
        got = []
        try:
            while True:
                t, _, payload = P.unpack_frame(await asyncio.wait_for(ws.recv(), 0.5))
                got.append((t, payload))
        except TimeoutError:
            pass
        acks = sum(1 for t, p in got if t == P.MSG_ACK and P.Ack.unpack(p).ref_type == P.MSG_CAPS)
        assert CTL_BURST <= acks <= CTL_BURST + 3
        assert any(t == P.MSG_ERR and P.Err.unpack(p).code == P.ERR_RATE for t, p in got)
        await asyncio.sleep(1.0)  # refilled, and the connection was not closed
        await ws.send(P.pack_frame(P.MSG_HELLO, 10, P.Hello().pack()))
        t, _, payload = P.unpack_frame(await asyncio.wait_for(ws.recv(), 2))
        assert t == P.MSG_ACK and P.Ack.unpack(payload).ref_type == P.MSG_HELLO


async def test_bad_gps_fix_never_reaches_place(server):
    calls = []

    class FakePlace:
        async def context(self, lat, lon, utc=None):
            calls.append((lat, lon))
            return {}

        async def aclose(self):
            pass
    await server.place.aclose()
    server.place = FakePlace()
    st, _ = _recording_state(server, "g")
    for lat_e7, lon_e7 in ((0, 0), (950000000, 21925000), (413784000, 1900000000), (-910000000, 0)):
        server._maybe_place(st, P.Gps(lat_e7=lat_e7, lon_e7=lon_e7, fix=1))
    assert st.place_task is None
    server._maybe_place(st, P.Gps(lat_e7=413784000, lon_e7=21925000, fix=1))
    await st.place_task
    assert len(calls) == 1


async def test_failing_message_does_not_end_the_connection(server, monkeypatch):
    def boom(st, g):
        raise RuntimeError("boom")
    monkeypatch.setattr(server, "_maybe_place", boom)
    url = f"ws://127.0.0.1:{server.port}"
    async with connect(url, additional_headers={"Authorization": f"Bearer {TOKEN}"}) as ws:
        await ws.send(P.pack_frame(P.MSG_GPS, 1, P.Gps(lat_e7=413784000, lon_e7=21925000, fix=1).pack()))
        await ws.send(P.pack_frame(P.MSG_HELLO, 2, P.Hello().pack()))
        frames = [P.unpack_frame(await asyncio.wait_for(ws.recv(), 2)) for _ in range(2)]
    assert frames[0][0] == P.MSG_ERR and P.Err.unpack(frames[0][2]).code == P.ERR_MALFORMED
    assert frames[1][0] == P.MSG_ACK and P.Ack.unpack(frames[1][2]).ref_type == P.MSG_HELLO


async def test_ticker_survives_a_failing_tick(server):
    st, _ = _recording_state(server, "t8")
    st.next_clip_at = 1e18
    n = [0]

    def due(now):
        n[0] += 1
        if n[0] == 1:
            raise RuntimeError("boom")
        return None
    st.scheduler.due = due
    task = asyncio.create_task(server._ticker(st))
    await asyncio.sleep(0.8)
    assert not task.done() and n[0] >= 2
    task.cancel()


def test_dockerfile_base_pinned_by_digest():
    import re
    with open(os.path.join(os.path.dirname(__file__), "..", "Dockerfile")) as f:
        assert re.search(r"^FROM \S+@sha256:[0-9a-f]{64}$", f.read(), re.M)
