"""Layer-2 WebSocket server.

One binary WebSocket message = one link frame (header | payload, no COBS/CRC).
Auth: `Authorization: Bearer <token>`, token must be in DEVICE_TOKENS.
Locally plain ws://; in production TLS is terminated by the reverse proxy.
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import signal
import logging
import time
from collections import deque
from http import HTTPStatus

from websockets.asyncio.server import ServerConnection, serve
from websockets.exceptions import ConnectionClosed

import logutil
import protocol as P
from config import Config
from journal import Journal
from place import PlaceService, cell_key
from planner import ClaudePlanner, PlanScheduler
from session import Session
from spectro import spectrogram_png
from tagger import SPEECH_DISCARD_THRESHOLD, make_tagger, speech_estimate
from validate import pack_valid_plan

log = logging.getLogger("app")

TICK_S = 0.25
PLACE_REFRESH_S = 600.0


class RateLimiter:
    """Token bucket per connection. Messages over the limit are dropped; if more than
    `abuse_drops` are dropped within `abuse_window_s`, the connection is closed."""

    def __init__(self, rate: float, burst: float, abuse_window_s: float = 2.0, abuse_drops: int | None = None,
                 clock=time.monotonic):
        self.rate, self.burst, self.clock = rate, burst, clock
        self.tokens = burst
        self.t = clock()
        self.window = abuse_window_s
        self.abuse_drops = abuse_drops if abuse_drops is not None else int(burst)
        self.drops: deque = deque()
        self.last_err = -1e9
        self.total_dropped = 0

    def allow(self) -> bool:
        now = self.clock()
        if self.tokens < self.burst:  # a one-off allowance above the burst is spent, not capped
            self.tokens = min(self.burst, self.tokens + (now - self.t) * self.rate)
        self.t = now
        if self.tokens >= 1.0:
            self.tokens -= 1.0
            return True
        self.drops.append(now)
        self.total_dropped += 1
        while self.drops and now - self.drops[0] > self.window:
            self.drops.popleft()
        return False

    @property
    def abusive(self) -> bool:
        now = self.clock()
        while self.drops and now - self.drops[0] > self.window:
            self.drops.popleft()
        return len(self.drops) >= self.abuse_drops

    def should_report(self) -> bool:
        now = self.clock()
        if now - self.last_err >= 1.0:
            self.last_err = now
            return True
        return False


def device_id_for(token: str) -> str:
    return "dev-" + hashlib.sha256(token.encode()).hexdigest()[:8]


class DeviceState:
    def __init__(self, server: "LayerTwoServer", session: Session):
        self.srv = server
        self.session = session
        self.scheduler = PlanScheduler(server.cfg, session, server.claude)
        self.ws: ServerConnection | None = None
        self.out_seq = 0
        self.next_clip_at = 0.0
        self.clip_rot = 0
        self.place_task: asyncio.Task | None = None
        self.place_cell = None
        self.place_at = -1e9
        self.counts: dict[str, int] = {}
        self.walk = server.journal.open(session.device_id)
        self.pending_clip: dict | None = None  # {"source", "seq", "at"} of the REQ_CLIP in flight
        self.plan_seqs: dict[int, int] = {}    # out seq of MSG_PLAN -> plan_id

    async def send(self, msg_type: int, payload: bytes) -> int | None:
        if self.ws is None:
            return None
        self.out_seq = (self.out_seq + 1) & 0xFFFF
        try:
            await self.ws.send(P.pack_frame(msg_type, self.out_seq, payload))
        except ConnectionClosed:
            return None
        return self.out_seq

    async def ack(self, seq: int, t: int):
        await self.send(P.MSG_ACK, P.Ack(seq, t).pack())

    async def err(self, seq: int, t: int, code: int):
        await self.send(P.MSG_ERR, P.Err(seq, t, code).pack())


class LayerTwoServer:
    def __init__(self, cfg: Config | None = None, claude: ClaudePlanner | None = None,
                 place: PlaceService | None = None, tagger=None):
        self.cfg = cfg or Config()
        self.claude = claude or ClaudePlanner(self.cfg)
        self.place = place if place is not None else (PlaceService(self.cfg) if self.cfg.place_enabled else None)
        self.tagger = tagger or make_tagger(self.cfg.tagger, self.cfg.yamnet_model)
        self.journal = Journal(self.cfg.journal_dir, self.cfg.journal_retention_days, self.cfg.journal_enabled)
        self.devices: dict[str, DeviceState] = {}
        self._server = None

    # ---------- auth ----------
    def _auth(self, headers) -> str | None:
        h = headers.get("Authorization", "")
        if not h.startswith("Bearer "):
            return None
        tok = h[7:].strip()
        ok = False
        for t in self.cfg.device_tokens:
            ok |= hmac.compare_digest(tok.encode(), t.encode())
        return device_id_for(tok) if ok and tok else None

    def process_request(self, connection: ServerConnection, request):
        upgrade = "websocket" in request.headers.get("Upgrade", "").lower()
        if request.path == "/healthz" or (request.path == "/" and not upgrade):
            # plain GET / and /healthz: liveness for the platform health checker (no data, no auth)
            return connection.respond(HTTPStatus.OK, "ok\n")
        if self._auth(request.headers) is None:
            log.warning("auth rejected", extra={"remote": str(connection.remote_address[0]) if connection.remote_address else None})
            return connection.respond(HTTPStatus.UNAUTHORIZED, "unauthorized\n")
        proto = request.headers.get("X-Ondas-Proto")
        if proto is not None and proto.strip() != str(P.LINK_PROTO_VERSION):
            log.warning("protocol version rejected", extra={"device_proto": proto[:8]})
            return connection.respond(HTTPStatus.UPGRADE_REQUIRED,
                                      f"link protocol {P.LINK_PROTO_VERSION} required\n")
        return None

    # ---------- connection ----------
    async def handler(self, ws: ServerConnection):
        dev_id = self._auth(ws.request.headers)
        if dev_id is None:  # process_request already rejected; defensive
            await ws.close(1008, "unauthorized")
            return
        self._expire_sessions()
        st = self.devices.get(dev_id)
        if st is None:
            st = DeviceState(self, Session(dev_id))
            self.devices[dev_id] = st
        if st.ws is not None:  # a half-open old connection must not block the new one
            old = st.ws
            asyncio.create_task(old.close(1000, "replaced by new connection"))
        st.ws = ws
        st.next_clip_at = time.monotonic() + min(10.0, self.cfg.clip_interval_s)
        log.info("device connected", extra={"device": dev_id})
        ticker = asyncio.create_task(self._ticker(st))
        limiter = RateLimiter(self.cfg.rate_msgs_per_s, self.cfg.rate_burst)
        limiter.tokens += self.cfg.rate_connect_backlog  # one-off allowance for the buffered backlog
        try:
            closing = None
            async for msg in ws:
                if closing is not None:
                    continue  # drain until the close handshake completes
                exempt = isinstance(msg, bytes) and len(msg) >= 1 and msg[0] in (P.MSG_HELLO, P.MSG_CAPS)
                if not exempt and not limiter.allow():
                    if limiter.abusive:
                        log.warning("rate limit: closing", extra={"device": dev_id, "dropped": limiter.total_dropped})
                        await st.err(0, 0, P.ERR_RATE)
                        closing = asyncio.create_task(ws.close(1008, "rate limit"))
                        continue
                    if limiter.should_report():
                        await st.err(0, 0, P.ERR_RATE)
                    continue
                if isinstance(msg, str):
                    await st.err(0, 0, P.ERR_MALFORMED)
                    continue
                await self._dispatch(st, msg)
        except ConnectionClosed:
            pass
        finally:
            ticker.cancel()
            if st.ws is ws:
                st.ws = None
            log.info("device disconnected", extra={"device": dev_id, "counts": st.counts})
            st.walk.write("disconnect", counts=st.counts, discarded_mic_clips=st.session.discarded_speech_clips)

    def _expire_sessions(self):
        now = time.monotonic()
        for k in [k for k, d in self.devices.items()
                  if d.ws is None and now - d.session.last_seen > self.cfg.session_idle_s]:
            del self.devices[k]

    async def _dispatch(self, st: DeviceState, data: bytes):
        try:
            t, seq, payload = P.unpack_frame(data)
        except P.ProtocolError:
            await st.err(0, 0, P.ERR_MALFORMED)
            return
        name = P.MSG_NAMES.get(t, f"0x{t:02x}")
        st.counts[name] = st.counts.get(name, 0) + 1
        if t >= 0x40 and t not in (P.MSG_ACK, P.MSG_ERR):  # server->device / local types
            await st.err(seq, t, P.ERR_UNKNOWN_TYPE)
            return
        try:
            obj = P.decode_payload(t, payload)
        except P.ProtocolError as e:
            log.info("bad payload", extra={"device": st.session.device_id, "type": name, "error": str(e)})
            await st.err(seq, t, P.ERR_UNKNOWN_TYPE if t not in P.MSG_NAMES else P.ERR_MALFORMED)
            return
        s = st.session
        if t in (P.MSG_ACK, P.MSG_ERR):
            self._on_device_reply(st, t, obj)
            return
        if t == P.MSG_CLIP:
            hdr, adp = obj
            try:
                clip = s.add_clip_chunk(hdr, adp)
            except P.ProtocolError:
                await st.err(seq, t, P.ERR_MALFORMED)
                return
            if clip is not None:
                if st.pending_clip and st.pending_clip["source"] == clip.source:
                    st.pending_clip = None
                await self._on_clip(st, clip)
                await st.ack(seq, t)
            return
        s.add(t, obj)
        if t == P.MSG_HELLO:
            log.info("hello", extra={"device": s.device_id, "fw": obj.fw, "proto": obj.proto})
            st.walk.write("hello", fw=obj.fw, proto=obj.proto)
            if obj.proto != P.LINK_PROTO_VERSION:
                await st.err(seq, t, P.ERR_MALFORMED)  # protocol version mismatch
                if st.ws is not None:
                    asyncio.create_task(st.ws.close(1008, f"link protocol {P.LINK_PROTO_VERSION} required"))
                return
            await st.ack(seq, t)
        elif t == P.MSG_CAPS:
            await st.ack(seq, t)
            st.walk.write("caps", caps=[{"id": c.id, "source": P.SOURCE_NAMES.get(c.source), "kind": c.kind,
                                         "length_ms": c.length_ms, "role": c.role, "onsets": c.onsets,
                                         "pitch_hz": c.pitch_hz_x10 / 10} for c in obj])
        elif t == P.MSG_GPS and obj.fix > 0:
            self._maybe_place(st, obj)

    # ---------- clips ----------
    async def _on_clip(self, st: DeviceState, clip):
        s = st.session
        src = P.SOURCE_NAMES.get(clip.source, str(clip.source))
        tagger = self.tagger
        voiced = clip.source in P.SPEECH_CHECK_SOURCES  # mic and piezo can carry a voice; coil/light/radio not
        if voiced and tagger.name != "yamnet" and self.cfg.mic_clips_require_model:
            # without the speech model the server cannot double-check mic audio: drop it unseen
            return self._discard(st, clip, "no_speech_model", None)
        result = await asyncio.to_thread(tagger.tag, clip.pcm, clip.sample_rate)
        if voiced:
            if "speech" in result:  # YAMNet speech classes, max over 0.975 s frames
                est, thr = result["speech"], self.cfg.yamnet_speech_discard
            else:  # numpy heuristic (weak: misses real speech; only with MIC_CLIPS_REQUIRE_MODEL=0)
                est, thr = speech_estimate(clip.pcm, clip.sample_rate, result.get("descriptors")), SPEECH_DISCARD_THRESHOLD
            if clip.device_speech >= SPEECH_DISCARD_THRESHOLD or est >= thr:
                return self._discard(st, clip, "speech", est)
        s.accept_clip(clip)
        s.tags[clip.source] = {"at": clip.received_at, **result}
        log.info("clip tagged", extra={"device": s.device_id, "clip_id": clip.clip_id, "source": src,
                                       "seconds": round(len(clip.pcm) / clip.sample_rate, 2),
                                       "tags": result["tags"][:3]})
        st.walk.write("clip", source=src, clip_id=clip.clip_id, seconds=round(len(clip.pcm) / clip.sample_rate, 2),
                      backend=result["backend"], tags=result["tags"], groups=result.get("groups"),
                      descriptors=result["descriptors"])

    def _discard(self, st: DeviceState, clip, reason: str, est):
        s = st.session
        s.discarded_speech_clips += 1
        clip.pcm = None  # drop the audio; nothing derived from it is kept
        log.info("clip discarded", extra={"device": s.device_id, "clip_id": clip.clip_id, "reason": reason,
                                              "server_est": est, "device_est": round(clip.device_speech, 2)})
        st.walk.write("clip_discarded", source=P.SOURCE_NAMES.get(clip.source), reason=reason)

    def _on_device_reply(self, st: DeviceState, t: int, obj):
        s = st.session
        ref = P.MSG_NAMES.get(obj.ref_type, f"0x{obj.ref_type:02x}")
        if t == P.MSG_ACK:
            if obj.ref_type == P.MSG_PLAN:
                st.scheduler.on_device_ack(obj.ref_seq)
            log.debug("device ack", extra={"device": s.device_id, "ref": ref, "ref_seq": obj.ref_seq})
            return
        log.info("device error", extra={"device": s.device_id, "ref": ref, "ref_seq": obj.ref_seq, "code": obj.code})
        if obj.ref_type == P.MSG_REQ_CLIP:
            pc = st.pending_clip
            if pc and (obj.ref_seq in (0, pc["seq"])):
                st.walk.write("clip_refused", source=P.SOURCE_NAMES.get(pc["source"]), code=obj.code)
                st.pending_clip = None
        elif obj.ref_type == P.MSG_PLAN:
            st.walk.write("plan_rejected", plan_id=st.plan_seqs.get(obj.ref_seq), code=obj.code)
            st.scheduler.on_device_reject(obj.ref_seq, obj.code)

    def _latest_spectrogram(self, s: Session):
        if not s.clips:
            return None
        c = max(s.clips.values(), key=lambda c: c.received_at)
        return spectrogram_png(c.pcm, c.sample_rate) if c.pcm is not None else None

    # ---------- place ----------
    def _maybe_place(self, st: DeviceState, g: P.Gps):
        if self.place is None or (st.place_task and not st.place_task.done()):
            return
        lat, lon = g.lat_e7 / 1e7, g.lon_e7 / 1e7
        cell = cell_key(lat, lon)
        now = time.monotonic()
        if cell == st.place_cell and now - st.place_at < PLACE_REFRESH_S:
            return
        st.place_cell, st.place_at = cell, now

        async def run():
            try:
                ctx = await self.place.context(lat, lon, g.utc or None)
                prev = st.session.place or {}
                for k in ("osm", "weather"):  # rate-limited or offline: keep the last known (marked stale)
                    if ctx.get(k) is None and prev.get(k) is not None:
                        ctx[k] = prev[k]
                        ctx[k + "_stale"] = True
                st.session.place = ctx
                rlat, rlon = round(lat, 3), round(lon, 3)
                st.walk.write("place", lat=rlat, lon=rlon, cell=ctx.get("cell"), osm=ctx.get("osm"),
                              weather=ctx.get("weather"), sun=ctx.get("sun"),
                              stale=[k for k in ("osm", "weather") if ctx.get(k + "_stale")])
            except Exception as e:
                log.warning("place context failed", extra={"error": type(e).__name__})

        st.place_task = asyncio.create_task(run())

    # ---------- periodic ----------
    async def _ticker(self, st: DeviceState):
        s = st.session

        async def on_plan(clean, source):
            out = await st.send(P.MSG_PLAN, pack_valid_plan(clean))
            if out is not None:
                st.plan_seqs[out] = clean["plan_id"]
                while len(st.plan_seqs) > 32:
                    st.plan_seqs.pop(next(iter(st.plan_seqs)))
            fs = s.feature_stats(window=30.0)
            st.walk.write("plan", source=source, plan=clean, features={
                k: (round(v, 2) if isinstance(v, float) else v) for k, v in fs.items()
                if k in ("rms_db", "centroid_hz", "flatness", "onset_rate", "piezo_rms_db", "piezo_peak_rate", "pitch_hz",
                         "cadence_spm", "standing_frac", "dalt_m", "climb_m_per_min", "mag_var_ut", "dp_fast_pa",
                         "ap_count")})

        try:
            while True:
                await asyncio.sleep(TICK_S)
                now = time.monotonic()
                reason = st.scheduler.due(now)
                if reason:
                    st.scheduler.start(reason, on_plan, lambda: self._latest_spectrogram(s))
                pc = st.pending_clip
                if pc and now - pc["at"] > self.cfg.clip_request_timeout_s:
                    log.info("clip request timed out", extra={"device": s.device_id, "source": pc["source"]})
                    st.walk.write("clip_timeout", source=P.SOURCE_NAMES.get(pc["source"]))
                    st.pending_clip = None
                if now >= st.next_clip_at and st.pending_clip is None:
                    st.next_clip_at = now + self.cfg.clip_interval_s
                    src = self._next_clip_source(st, now)
                    if src is not None:
                        out = await st.send(P.MSG_REQ_CLIP, P.ReqClip(src, self.cfg.clip_seconds).pack())
                        if out is not None:
                            st.pending_clip = {"source": src, "seq": out, "at": now}
        except asyncio.CancelledError:
            pass

    def _next_clip_source(self, st: DeviceState, now: float) -> int | None:
        s = st.session
        avail = []
        # LINE-IN L carries one input at a time (FEAT.left_source): ask only for what is selected
        if s.feats and now - s.feats[-1][0] < 10:
            src = s.left_source
            if src in P.SPEECH_CHECK_SOURCES:
                model_ok = self.tagger.name == "yamnet" or not self.cfg.mic_clips_require_model
                if model_ok and (src != P.SRC_MIC or s.max_speech(now - 10, now) < 0.3):
                    avail.append(src)  # the device also withholds mic clips during speech
            elif src in P.SOURCE_NAMES and src != P.SRC_RADIO:
                avail.append(src)  # coil / light: no voice possible
        if s.radio and now - s.radio[-1][0] < 10:
            avail.append(P.SRC_RADIO)
        if not avail:
            return None
        st.clip_rot += 1
        return avail[st.clip_rot % len(avail)]

    # ---------- lifecycle ----------
    async def start(self, host: str | None = None, port: int | None = None):
        self._server = await serve(self.handler, host or self.cfg.host, self.cfg.port if port is None else port,
                                   process_request=self.process_request, max_size=P.LINK_HEADER_SIZE + P.LINK_MAX_PAYLOAD,
                                   ping_interval=20, ping_timeout=20)
        return self._server

    @property
    def port(self) -> int:
        return self._server.sockets[0].getsockname()[1]

    async def stop(self):
        if self._server:
            self._server.close()
            await self._server.wait_closed()
        for d in self.devices.values():
            if d.scheduler.task:
                d.scheduler.task.cancel()
        if self.place:
            await self.place.aclose()


async def main():
    cfg = Config()
    logutil.setup(cfg.log_level)
    if not cfg.device_tokens:
        log.error("DEVICE_TOKENS is empty; refusing to start")
        raise SystemExit(2)
    srv = LayerTwoServer(cfg)
    await srv.start()
    log.info("listening", extra={"host": cfg.host, "port": srv.port, "model": cfg.anthropic_model,
                                 "claude": srv.claude.available, "tagger": srv.tagger.name,
                                 "plan_every_bars": cfg.plan_every_bars})
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):  # PID 1 in a container gets no default SIGTERM action
        loop.add_signal_handler(sig, stop.set)
    try:
        await stop.wait()
        log.info("shutting down")
    finally:
        await srv.stop()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
