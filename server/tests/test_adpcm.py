import numpy as np
import pytest

import adpcm
import protocol as P
from session import Session


def snr_db(ref, out):
    ref = ref.astype(float); out = out.astype(float)
    return 10 * np.log10(np.sum(ref ** 2) / np.sum((ref - out) ** 2))


@pytest.mark.parametrize("freq,amp", [(440, 12000), (1000, 20000), (3000, 6000)])
def test_sine_roundtrip(freq, amp):
    sr = 16000
    t = np.arange(sr) / sr
    x = (amp * np.sin(2 * np.pi * freq * t)).astype(np.int16)
    data, _, _ = adpcm.encode(x)
    assert len(data) == len(x) // 2
    y = adpcm.decode(data)
    # skip the first 20 ms while the step size adapts
    k = sr // 50
    assert snr_db(x[k:], y[k:]) > 20
    assert np.max(np.abs(x[k:].astype(int) - y[k:])) < amp * 0.25


def test_decoder_known_vector():
    # nibble 7 from predictor 0, index 0: diff = 7>>3 + 7 + 3 + 1 = 11 -> pred 11, index 8
    out = adpcm.decode(bytes([0x07]))
    assert out[0] == 11
    # second nibble 0 at index 8 (step 16): diff = 2 -> 13
    assert out[1] == 13


def test_clamping():
    out = adpcm.decode(bytes([0x77] * 400), predictor=32000, step_index=88)
    assert out.max() == 32767
    out = adpcm.decode(bytes([0xFF] * 400), predictor=-32000, step_index=88)
    assert out.min() == -32768


def test_chunked_roundtrip_through_session_out_of_order():
    sr = 16000
    t = np.arange(int(sr * 1.5)) / sr
    x = (8000 * np.sin(2 * np.pi * 523.25 * t) * (0.5 + 0.5 * np.sin(2 * np.pi * 2 * t))).astype(np.int16)
    chunks = adpcm.encode_chunks(x, 500)
    s = Session("t", now=0.0)
    order = list(range(len(chunks)))[::-1]
    clip = None
    for i in order:
        pred, idx, data = chunks[i]
        clip = s.add_clip_chunk(P.ClipHdr(clip_id=9, source=P.SRC_RADIO, sample_rate=sr, chunk=i,
                                          chunks=len(chunks), predictor=pred, step_index=idx), data, now=1.0)
    assert clip is not None and clip.source == P.SRC_RADIO
    whole, _, _ = adpcm.encode(x)
    assert np.array_equal(clip.pcm, adpcm.decode(whole))
    assert snr_db(x[320:], clip.pcm[320:len(x)]) > 20


def test_bad_chunk_rejected():
    s = Session("t", now=0.0)
    with pytest.raises(P.ProtocolError):
        s.add_clip_chunk(P.ClipHdr(clip_id=1, chunk=5, chunks=5), b"", now=0)
    with pytest.raises(P.ProtocolError):
        s.add_clip_chunk(P.ClipHdr(clip_id=1, chunk=0, chunks=1, step_index=99), b"", now=0)


def test_clip_sample_rate_and_length_bounded():
    from tagger import to_16k_int16
    s = Session("t", now=0.0)
    for sr in (50, 1, 7999, 96000):  # 50 Hz x 256 chunks made the resample to 16 kHz allocate ~1.3 GB
        with pytest.raises(P.ProtocolError):
            s.add_clip_chunk(P.ClipHdr(clip_id=2, sample_rate=sr, chunk=0, chunks=1), b"\0" * 10, now=0)
    with pytest.raises(P.ProtocolError):  # 256 full chunks at 8 kHz would be 65 s
        s.add_clip_chunk(P.ClipHdr(clip_id=3, sample_rate=8000, chunk=0, chunks=256), b"", now=0)
    # the device's longest clip, 10 s at 16 kHz (80 chunks), is still taken
    assert s.add_clip_chunk(P.ClipHdr(clip_id=4, sample_rate=16000, chunk=0, chunks=80), b"\0" * 1012, now=0) is None
    with pytest.raises(ValueError):
        to_16k_int16(np.zeros(100, dtype=np.int16), 50)
