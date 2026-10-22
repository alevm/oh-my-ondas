#!/usr/bin/env python3
"""Prints a walk journal as a readable timeline.

    python tools/review_walk.py data/journal/2026-10-21/dev-xxxx_101500.jsonl
    python tools/review_walk.py --latest [--dir data/journal]
"""
from __future__ import annotations

import argparse
import glob
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from journal import read_walk  # noqa: E402


def fmt(e: dict) -> str:
    ev = e["ev"]
    if ev == "place":
        near = sorted(((v.get("nearest_m") or 9999, k) for k, v in (e.get("osm") or {}).items()))[:5]
        w = e.get("weather") or {}
        return (f"place ~{e['lat']},{e['lon']}: " + ", ".join(f"{k} {d} m" for d, k in near)
                + (f" | {w.get('temperature_c')} C, wind {w.get('wind_kmh')} km/h" if w else "")
                + (f" | sun {e['sun'].get('phase')}" if e.get("sun") else ""))
    if ev == "clip":
        g = ", ".join(f"{k} {v:.2f}" for k, v in list((e.get("groups") or {}).items())[:3])
        return f"clip {e['source']}: {', '.join(t[0] for t in e['tags'][:3])}" + (f" ({g})" if g else "")
    if ev == "clip_discarded":
        return f"{e['source']} clip discarded ({e['reason']})"
    if ev == "plan":
        p = e["plan"]
        roles = " ".join(f"{t['role'][0]}{t['capture_id'] if t['capture_id'] != 255 else ''}" for t in p["tracks"])
        return f"plan #{p['plan_id']} [{e['source']}] bar {p['starts_at_bar']} x{p['bars']} {roles}: {p['why']}"
    if ev == "caps":
        return f"captures: {len(e['caps'])}"
    return ev + " " + " ".join(f"{k}={v}" for k, v in e.items() if k not in ("t", "ev"))[:120]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("path", nargs="?")
    ap.add_argument("--latest", action="store_true")
    ap.add_argument("--dir", default=os.environ.get("JOURNAL_DIR", "data/journal"))
    a = ap.parse_args()
    path = a.path
    if a.latest or not path:
        files = sorted(glob.glob(os.path.join(a.dir, "*", "*.jsonl")), key=os.path.getmtime)
        if not files:
            sys.exit(f"no journal files under {a.dir}")
        path = files[-1]
    evs = read_walk(path)
    t0 = evs[0]["t"] if evs else 0
    print(f"{path}: {len(evs)} events, start {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime(t0))}")
    for e in evs:
        print(f"+{e['t'] - t0:7.1f}s  {fmt(e)}")


if __name__ == "__main__":
    main()
