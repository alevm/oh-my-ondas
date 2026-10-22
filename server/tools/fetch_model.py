#!/usr/bin/env python3
"""Downloads the YAMNet TFLite model (Google MediaPipe audio_classifier build, float32,
labels embedded) to models/yamnet.tflite and checks its sha256. Not committed to git.

    python tools/fetch_model.py [--dest models/yamnet.tflite]
"""
from __future__ import annotations

import argparse
import hashlib
import os
import sys
import tempfile
import urllib.request

URL = "https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite"
SHA256 = "4d8b4a53282dc83ef04e3e7dbc4fbc98082e34e44ed798e16c3a0cdd4c584faf"
SIZE = 4126810
HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DEST = os.path.join(HERE, "..", "models", "yamnet.tflite")


def sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def fetch(dest: str = DEFAULT_DEST) -> str:
    dest = os.path.abspath(dest)
    if os.path.exists(dest) and sha256(dest) == SHA256:
        print(f"ok: {dest} (sha256 matches)")
        return dest
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    req = urllib.request.Request(URL, headers={"User-Agent": "OhMyOndas-layer2/0.1 fetch_model"})
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(dest), suffix=".part")
    try:
        with urllib.request.urlopen(req, timeout=120) as r, os.fdopen(fd, "wb") as f:
            while chunk := r.read(1 << 16):
                f.write(chunk)
        got = sha256(tmp)
        if got != SHA256 or os.path.getsize(tmp) != SIZE:
            raise SystemExit(f"checksum mismatch: {got} (expected {SHA256}); not installed")
        os.replace(tmp, dest)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)
    print(f"installed: {dest}")
    return dest


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dest", default=DEFAULT_DEST)
    fetch(ap.parse_args().dest)
    sys.exit(0)
