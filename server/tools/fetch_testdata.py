#!/usr/bin/env python3
"""Downloads real test recordings into .testdata/ (git-ignored) for tagger checks:
ESC-50 clips (Piczak 2015, CC BY-NC, github.com/karolpiczak/ESC-50, pinned commit) and one
Open Speech Repository sentence recording (8 kHz, US English).

    python tools/fetch_testdata.py
"""
from __future__ import annotations

import csv
import io
import os
import urllib.request

ESC50_COMMIT = "33c8ce9eb2cf0b1c2f8bcf322eb349b6be34dbb6"
ESC50 = f"https://raw.githubusercontent.com/karolpiczak/ESC-50/{ESC50_COMMIT}"
CATEGORIES = ["dog", "rain", "sea_waves", "crickets", "church_bells", "train", "footsteps", "chirping_birds",
              "wind", "engine", "car_horn", "laughing", "crying_baby", "siren"]
SPEECH_URL = "https://www.voiptroubleshooter.com/open_speech/american/OSR_us_000_0010_8k.wav"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".testdata")
UA = {"User-Agent": "OhMyOndas-layer2/0.1 fetch_testdata"}


def get(url: str) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read()


def main():
    os.makedirs(os.path.join(OUT, "esc50"), exist_ok=True)
    meta = list(csv.DictReader(io.StringIO(get(f"{ESC50}/meta/esc50.csv").decode())))
    for cat in CATEGORIES:
        fn = next(r["filename"] for r in meta if r["category"] == cat)
        dest = os.path.join(OUT, "esc50", f"{cat}__{fn}")
        if not os.path.exists(dest):
            open(dest, "wb").write(get(f"{ESC50}/audio/{fn}"))
        print(dest)
    dest = os.path.join(OUT, "speech_OSR_us_000_0010_8k.wav")
    if not os.path.exists(dest):
        open(dest, "wb").write(get(SPEECH_URL))
    print(dest)


if __name__ == "__main__":
    main()
