"""IMA-ADPCM (4 bit, mono). Nibble order: low nibble first (as in IMA/DVI WAV).

decode() is what the server uses on CLIP chunks. encode() is a reference encoder
for tests and the simulator; the Teensy encoder must use the same nibble order.
"""
from __future__ import annotations

import numpy as np

STEP_TABLE = [
    7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45,
    50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230,
    253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963,
    1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327,
    3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442,
    11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794,
    32767,
]
INDEX_TABLE = [-1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8]


def _step(pred: int, idx: int, n: int) -> tuple[int, int]:
    step = STEP_TABLE[idx]
    diff = step >> 3
    if n & 4:
        diff += step
    if n & 2:
        diff += step >> 1
    if n & 1:
        diff += step >> 2
    pred = pred - diff if n & 8 else pred + diff
    if pred > 32767:
        pred = 32767
    elif pred < -32768:
        pred = -32768
    idx += INDEX_TABLE[n]
    if idx < 0:
        idx = 0
    elif idx > 88:
        idx = 88
    return pred, idx


def decode(data: bytes, predictor: int = 0, step_index: int = 0) -> np.ndarray:
    """Decodes ADPCM bytes (2 samples per byte) to int16 samples."""
    if not 0 <= step_index <= 88:
        raise ValueError("step_index out of range")
    out = np.empty(len(data) * 2, dtype=np.int16)
    pred, idx, k = int(predictor), int(step_index), 0
    for b in data:
        pred, idx = _step(pred, idx, b & 0x0F)
        out[k] = pred; k += 1
        pred, idx = _step(pred, idx, b >> 4)
        out[k] = pred; k += 1
    return out


def encode(samples, predictor: int = 0, step_index: int = 0) -> tuple[bytes, int, int]:
    """Reference encoder. Returns (bytes, final predictor, final step_index).
    An odd trailing sample is dropped."""
    s = np.asarray(samples, dtype=np.int32)
    n_out = len(s) // 2
    out = bytearray(n_out)
    pred, idx = int(predictor), int(step_index)
    for i in range(n_out * 2):
        step = STEP_TABLE[idx]
        diff = int(s[i]) - pred
        n = 0
        if diff < 0:
            n = 8
            diff = -diff
        if diff >= step:
            n |= 4
            diff -= step
        if diff >= step >> 1:
            n |= 2
            diff -= step >> 1
        if diff >= step >> 2:
            n |= 1
        pred, idx = _step(pred, idx, n)
        if i & 1:
            out[i >> 1] |= n << 4
        else:
            out[i >> 1] = n
    return bytes(out), pred, idx


def encode_chunks(samples, chunk_bytes: int) -> list[tuple[int, int, bytes]]:
    """Splits into chunks of chunk_bytes; returns (predictor, step_index, bytes) per chunk,
    with the codec state at the start of each chunk (as LinkClipHdr carries it)."""
    s = np.asarray(samples)
    per = chunk_bytes * 2
    pred, idx, res = 0, 0, []
    for off in range(0, len(s) - len(s) % 2, per):
        data, p2, i2 = encode(s[off:off + per], pred, idx)
        res.append((pred, idx, data))
        pred, idx = p2, i2
    return res
