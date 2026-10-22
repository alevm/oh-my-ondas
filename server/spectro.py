"""Spectrogram of a clip as a small grayscale PNG (numpy + zlib, no imaging library)."""
from __future__ import annotations

import struct
import zlib

import numpy as np

from tagger import stft_mag


def png_gray(img: np.ndarray) -> bytes:
    """Minimal 8-bit grayscale PNG writer. img: 2-D uint8, row 0 at the top."""
    img = np.ascontiguousarray(img, dtype=np.uint8)
    h, w = img.shape
    raw = b"".join(b"\x00" + img[r].tobytes() for r in range(h))

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 0, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def spectrogram_png(pcm: np.ndarray, sr: int, width: int = 256, height: int = 128, floor_db: float = -80) -> bytes:
    """Log-frequency (50 Hz..sr/2) magnitude spectrogram, time left to right, dB scaled."""
    mag, freqs = stft_mag(pcm, sr, n=1024, hop=256)
    db = 20 * np.log10(mag + 1e-9)
    db = np.clip(db - db.max(), floor_db, 0)
    edges = np.geomspace(50, sr / 2, height + 1)
    rows = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (freqs >= lo) & (freqs < hi)
        if not m.any():
            m = np.zeros_like(freqs, dtype=bool); m[np.argmin(np.abs(freqs - lo))] = True
        rows.append(db[:, m].max(axis=1))
    spec = np.array(rows)[::-1]  # high frequencies on top
    t_idx = np.linspace(0, spec.shape[1] - 1, width).astype(int)
    spec = spec[:, t_idx]
    img = ((spec - floor_db) / -floor_db * 255).astype(np.uint8)
    return png_gray(img)
