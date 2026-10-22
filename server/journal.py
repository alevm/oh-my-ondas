"""Per-walk journal: one JSONL file per device session, so a walk can be reviewed later.

<JOURNAL_DIR>/<YYYY-MM-DD>/<device>_<HHMMSS>.jsonl, one JSON object per line:
  {"t": <unix s>, "ev": "start"|"place"|"clip"|"clip_discarded"|"plan"|"caps"|"end", ...}

What is written: timestamps, place summaries (map counts/distances, weather, sun) with the
position rounded to 3 decimals (~100 m), clip tags/groups/descriptors, capture inventory,
plans with their source and "why", short feature summaries. What is never written: audio,
anything derived from a mic clip that was discarded for speech, tokens, exact coordinates.
Files older than JOURNAL_RETENTION_DAYS are deleted at start-up and every hour.
"""
from __future__ import annotations

import json
import logging
import os
import re
import time

log = logging.getLogger("journal")

_SAFE = re.compile(r"[^A-Za-z0-9_-]")


def round_pos(lat: float, lon: float) -> tuple[float, float]:
    return round(lat, 3), round(lon, 3)


class Journal:
    def __init__(self, root: str, retention_days: float = 30.0, enabled: bool = True, clock=time.time):
        self.root = os.path.abspath(root)
        self.retention_s = retention_days * 86400.0
        self.enabled = enabled
        self.clock = clock
        self._last_prune = -1e18
        if enabled:
            os.makedirs(self.root, mode=0o750, exist_ok=True)
            self.prune()

    def open(self, device_id: str, meta: dict | None = None) -> "WalkLog":
        if not self.enabled:
            return WalkLog(None, self.clock)
        now = self.clock()
        day = time.strftime("%Y-%m-%d", time.gmtime(now))
        d = os.path.join(self.root, day)
        os.makedirs(d, mode=0o750, exist_ok=True)
        path = os.path.join(d, f"{_SAFE.sub('_', device_id)}_{time.strftime('%H%M%S', time.gmtime(now))}.jsonl")
        w = WalkLog(path, self.clock)
        w.write("start", device=device_id, **(meta or {}))
        if now - self._last_prune > 3600:
            self.prune()
        return w

    def prune(self) -> int:
        """Deletes journal files older than the retention period. Returns the count."""
        self._last_prune = self.clock()
        if self.retention_s <= 0 or not os.path.isdir(self.root):
            return 0
        cutoff = self.clock() - self.retention_s
        n = 0
        for dirpath, dirnames, filenames in os.walk(self.root, topdown=False):
            for fn in filenames:
                p = os.path.join(dirpath, fn)
                if fn.endswith(".jsonl") and os.path.getmtime(p) < cutoff:
                    os.unlink(p)
                    n += 1
            if dirpath != self.root and not os.listdir(dirpath):
                os.rmdir(dirpath)
        if n:
            log.info("journal pruned", extra={"files": n})
        return n


class WalkLog:
    def __init__(self, path: str | None, clock=time.time):
        self.path = path
        self.clock = clock
        self.lines = 0

    def write(self, ev: str, **fields):
        if self.path is None:
            return
        rec = {"t": round(self.clock(), 2), "ev": ev, **fields}
        for k in ("lat", "lon"):
            if k in rec:  # never exact coordinates
                rec[k] = round(float(rec[k]), 3)
        try:
            with open(self.path, "a", encoding="utf-8") as f:
                f.write(json.dumps(rec, separators=(",", ":"), default=_default) + "\n")
            self.lines += 1
        except OSError as e:
            log.warning("journal write failed", extra={"error": type(e).__name__})


def _default(o):
    try:
        import numpy as np
        if isinstance(o, np.generic):
            return o.item()
    except ImportError:
        pass
    return str(o)


def read_walk(path: str) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]
