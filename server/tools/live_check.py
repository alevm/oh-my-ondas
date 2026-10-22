#!/usr/bin/env python3
"""One real plan request against the Claude API from a recorded session.

Replays tests/fixtures/recorded_session.jsonl (a recorded device stream) into a Session,
adds a real place context (tests/fixtures/place_barceloneta.json: live Overpass/Open-Meteo
summary), optionally tags a WAV clip, builds the summary, calls Claude exactly as the server
does, then prints latency, token usage, estimated cost and the validated plan.

    ANTHROPIC_API_KEY=... python tools/live_check.py [--clip .testdata/esc50/sea_waves__*.wav] [--image]
    python tools/live_check.py --dry-run     # no key, no network: shows the exact HTTP request

--dry-run sends the request through the installed anthropic SDK into a local mock transport
and prints the method, URL, beta header and JSON body the SDK would send.
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
sys.path.insert(0, ROOT)

import protocol as P  # noqa: E402
from config import Config  # noqa: E402
from planner import ClaudePlanner, summarize  # noqa: E402
from session import Session  # noqa: E402
from validate import PlanError, pack_valid_plan, validate_plan  # noqa: E402

FIX = os.path.join(ROOT, "tests", "fixtures")


def load_session(path: str, place_path: str | None) -> tuple[Session, float]:
    s = Session("live-check", now=0.0)
    t_end = 0.0
    with open(path) as f:
        for line in f:
            r = json.loads(line)
            t, seq, payload = P.unpack_frame(base64.b64decode(r["frame"]))
            obj = P.decode_payload(t, payload)
            s.add(t, obj, now=r["t"])
            t_end = r["t"]
    if place_path:
        with open(place_path) as f:
            s.place = json.load(f)
    return s, t_end


def add_clip(s: Session, path: str, now: float):
    from tagger import make_tagger, read_wav
    tg = make_tagger("auto")
    pcm, sr = read_wav(path)
    res = tg.tag(pcm[: sr * 10], sr)
    s.tags[P.SRC_MIC] = {"at": now, **res}
    from session import Clip
    from tagger import to_16k_int16
    s.accept_clip(Clip(1, P.SRC_MIC, 16000, to_16k_int16(pcm[: sr * 10], sr), now))
    print(f"clip {os.path.basename(path)} tagged by {res['backend']}: {res['tags'][:3]}")


def fake_response(req):
    body = json.loads(req.content)
    plan = {"starts_at_bar": 0, "bars": 16, "tempo": {"bpm": 0, "follow_pulse": True}, "tracks": [], "sections": [],
            "why": "dry run"}
    import httpx2
    return httpx2.Response(200, json={
        "id": "msg_dryrun", "type": "message", "role": "assistant", "model": body["model"],
        "content": [{"type": "text", "text": json.dumps(plan)}], "stop_reason": "end_turn", "stop_sequence": None,
        "usage": {"input_tokens": 0, "output_tokens": 0}})


async def main(a) -> int:
    cfg = Config()
    if a.model:
        cfg.anthropic_model = a.model
    cfg.attach_spectrogram = a.image
    s, now = load_session(a.session, a.place)
    if a.clip:
        add_clip(s, a.clip, now)
    summary = summarize(s, now)
    img = None
    if a.image and s.clips:
        from spectro import spectrogram_png
        c = next(iter(s.clips.values()))
        img = spectrogram_png(c.pcm, c.sample_rate)
    print("---- summary sent to the model ----")
    print(summary)
    print("-----------------------------------")

    captured = {}
    if a.dry_run:
        import anthropic
        import httpx2  # the anthropic 2.x SDK's HTTP client

        def handler(req):
            captured["req"] = req
            return fake_response(req)

        client = anthropic.AsyncAnthropic(api_key="dry-run-not-a-key", max_retries=0,
                                          http_client=httpx2.AsyncClient(transport=httpx2.MockTransport(handler)))
    else:
        if not os.environ.get("ANTHROPIC_API_KEY"):
            print("ANTHROPIC_API_KEY is not set (use --dry-run to check the request offline)", file=sys.stderr)
            return 2
        import anthropic
        client = anthropic.AsyncAnthropic(max_retries=0, timeout=a.timeout)

    planner = ClaudePlanner(cfg, client=client)
    t0 = time.perf_counter()
    try:
        raw = await asyncio.wait_for(planner.plan(summary, img), a.timeout)
    except Exception as e:
        print(f"request failed after {time.perf_counter() - t0:.2f} s: {type(e).__name__}: {e}", file=sys.stderr)
        return 1
    dt = time.perf_counter() - t0

    if a.dry_run:
        req = captured["req"]
        body = json.loads(req.content)
        print(f"{req.method} {req.url}")
        print("anthropic-beta:", req.headers.get("anthropic-beta"))
        print("anthropic-version:", req.headers.get("anthropic-version"))
        shown = {k: v for k, v in body.items() if k not in ("system", "messages")}
        shown["output_config"] = {**body["output_config"], "format": {"type": body["output_config"]["format"]["type"],
                                                                      "schema": "<PLAN_SCHEMA>"}}
        print("body:", json.dumps(shown, indent=1))
        print("system prompt chars:", len(body["system"]), "| user content blocks:",
              [b["type"] for b in body["messages"][0]["content"]])
        return 0

    m = planner.meter
    print(f"latency {dt:.2f} s | input {m.total_in} tok | output {m.total_out} tok | "
          f"cost ~${m.total_usd:.5f} (at ${cfg.price_input_per_mtok}/{cfg.price_output_per_mtok} per MTok) | "
          f"model {cfg.anthropic_model}")
    print("raw plan:", json.dumps(raw)[:2000])
    try:
        clean, warns = validate_plan(raw, s.caps, s.current_bar(now), 1)
    except PlanError as e:
        print("plan INVALID:", e)
        return 1
    print("validated plan:", json.dumps(clean, indent=1))
    print("warnings:", warns or "none")
    print(f"MSG_PLAN payload: {len(pack_valid_plan(clean))} bytes")
    if dt > cfg.plan_timeout_s:
        print(f"NOTE: latency {dt:.2f} s exceeds PLAN_TIMEOUT_S={cfg.plan_timeout_s}; the server would have used rules")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--session", default=os.path.join(FIX, "recorded_session.jsonl"))
    ap.add_argument("--place", default=os.path.join(FIX, "place_barceloneta.json"))
    ap.add_argument("--clip", help="16-bit WAV to tag and attach (e.g. from .testdata)")
    ap.add_argument("--image", action="store_true", help="attach the clip spectrogram")
    ap.add_argument("--model", help="override ANTHROPIC_MODEL")
    ap.add_argument("--timeout", type=float, default=30.0, help="seconds (the server itself uses PLAN_TIMEOUT_S)")
    ap.add_argument("--dry-run", action="store_true")
    sys.exit(asyncio.run(main(ap.parse_args())))
