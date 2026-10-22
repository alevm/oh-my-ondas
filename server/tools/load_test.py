#!/usr/bin/env python3
"""Local load test: starts app.py as a subprocess and N simulated devices for D seconds.
Reports server CPU and memory (from /proc), plan latency from the server's own logs,
clip tagging counts, and errors. Place lookups are disabled (no public Overpass load);
without ANTHROPIC_API_KEY the rule planner is measured.

    python tools/load_test.py --devices 5 --duration 60
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import socket
import statistics
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
sys.path.insert(0, HERE)
sys.path.insert(0, ROOT)
import sim_device  # noqa: E402

TICKS = os.sysconf("SC_CLK_TCK")
PAGE = os.sysconf("SC_PAGE_SIZE")


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def proc_sample(pid: int) -> tuple[float, int]:
    with open(f"/proc/{pid}/stat") as f:
        parts = f.read().rsplit(")", 1)[1].split()
    cpu = (int(parts[11]) + int(parts[12])) / TICKS  # utime + stime
    with open(f"/proc/{pid}/statm") as f:
        rss = int(f.read().split()[1]) * PAGE
    return cpu, rss


async def main(a):
    port = free_port()
    tokens = [f"load-token-{i}" for i in range(a.devices)]
    jdir = tempfile.mkdtemp(prefix="ondas-load-journal-")
    env = {**os.environ, "DEVICE_TOKENS": ",".join(tokens), "PORT": str(port), "BIND_HOST": "127.0.0.1",
           "PLACE_ENABLED": "0", "CLIP_INTERVAL_S": str(a.clip_interval), "PLAN_EVERY_BARS": str(a.bars),
           "JOURNAL_DIR": jdir, "LOG_LEVEL": "INFO"}
    if not a.claude:
        env.pop("ANTHROPIC_API_KEY", None)
    logf = tempfile.NamedTemporaryFile(prefix="ondas-load-", suffix=".log", delete=False)
    p = subprocess.Popen([sys.executable, os.path.join(ROOT, "app.py")], env=env, stdout=logf, stderr=subprocess.STDOUT,
                         cwd=ROOT)
    for _ in range(100):
        try:
            socket.create_connection(("127.0.0.1", port), timeout=0.2).close()
            break
        except OSError:
            await asyncio.sleep(0.1)
    cpu0, rss0 = proc_sample(p.pid)
    t0 = time.monotonic()
    samples = []

    async def sampler():
        while True:
            await asyncio.sleep(1.0)
            samples.append((time.monotonic() - t0, *proc_sample(p.pid)))

    smp = asyncio.create_task(sampler())
    results = await asyncio.gather(*[sim_device.run(f"ws://127.0.0.1:{port}", tok, duration=a.duration,
                                                    speed=a.speed, quiet=True, seed=i + 1)
                                     for i, tok in enumerate(tokens)], return_exceptions=True)
    smp.cancel()
    cpu1, rss1 = proc_sample(p.pid)
    wall = time.monotonic() - t0
    p.terminate()
    p.wait(10)
    logf.close()

    lat, src, warn, errs, other, tagged, discarded = [], {}, [], [], [], 0, 0
    with open(logf.name) as f:
        for line in f:
            try:
                r = json.loads(line)
            except ValueError:  # native libraries writing to stderr (e.g. the LiteRT delegate notice)
                other.append(line.strip()[:200])
                continue
            if r.get("msg") == "plan":
                lat.append(r["latency_ms"])
                src[r["source"]] = src.get(r["source"], 0) + 1
            elif r.get("msg") == "clip tagged":
                tagged += 1
            elif r.get("msg") == "clip discarded":
                discarded += 1
            if r.get("level") in ("WARNING", "ERROR", "CRITICAL"):
                (errs if r["level"] != "WARNING" else warn).append(r.get("msg"))
    exc = [repr(x) for x in results if isinstance(x, BaseException)]
    plans = sum(len(x["plans"]) for x in results if isinstance(x, dict))
    dev_errs = sum(len(x["errs"]) for x in results if isinstance(x, dict))
    cpu_pct = [100 * (c2 - c1) / (t2 - t1) for (t1, c1, _), (t2, c2, _) in zip(samples, samples[1:])]
    print(f"devices {a.devices}, {wall:.0f} s, walk x{a.speed}, plan every {a.bars} bars, clip every {a.clip_interval} s")
    print(f"server CPU: mean {100 * (cpu1 - cpu0) / wall:.1f} % of one core, peak 1 s {max(cpu_pct):.0f} %")
    print(f"server RSS: start {rss0 / 2**20:.0f} MiB, peak {max(s[2] for s in samples) / 2**20:.0f} MiB, end {rss1 / 2**20:.0f} MiB")
    if lat:
        q = statistics.quantiles(lat, n=20) if len(lat) >= 20 else [max(lat)] * 19
        print(f"plans: {len(lat)} ({src}), received by devices {plans}; latency ms median {statistics.median(lat):.1f}, "
              f"p95 {q[18]:.1f}, max {max(lat):.1f}")
    print(f"clips tagged {tagged}, clips discarded {discarded}")
    print(f"errors: server {len(errs)} {errs[:3]}, warnings {len(warn)} {sorted(set(warn))[:3]}, "
          f"device ERR msgs {dev_errs}, client exceptions {exc[:3]}; non-JSON stderr lines {len(other)} {other[:2]}")
    print(f"server log: {logf.name}  journal: {jdir}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--devices", type=int, default=5)
    ap.add_argument("--duration", type=float, default=60.0)
    ap.add_argument("--speed", type=float, default=20.0)
    ap.add_argument("--bars", type=int, default=4, help="PLAN_EVERY_BARS (low = more plans = more load)")
    ap.add_argument("--clip-interval", type=float, default=10.0)
    ap.add_argument("--claude", action="store_true", help="keep ANTHROPIC_API_KEY (real calls, costs money)")
    asyncio.run(main(ap.parse_args()))
