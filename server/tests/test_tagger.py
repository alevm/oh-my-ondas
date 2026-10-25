import os
import struct
import sys
import zlib

import numpy as np
import pytest

from spectro import png_gray, spectrogram_png
from tagger import DEFAULT_MODEL_PATH, DspTagger, make_tagger, speech_estimate

SR = 16000


def speechlike(seconds=4.0, seed=0):
    """Voiced harmonics (f0 ~130 Hz) through two formant-ish resonances, syllables at ~4.5 Hz."""
    rng = np.random.default_rng(seed)
    t = np.arange(int(SR * seconds)) / SR
    f0 = 130 + 15 * np.sin(2 * np.pi * 0.7 * t)
    ph = 2 * np.pi * np.cumsum(f0) / SR
    x = sum((1 / k) * np.sin(k * ph) * (1.0 if 300 < 130 * k < 3400 else 0.15) for k in range(1, 30))
    env = np.clip(np.sin(2 * np.pi * 4.5 * t), 0, None) ** 1.5
    x = x * env + 0.01 * rng.standard_normal(len(t))
    return (x / np.abs(x).max() * 12000).astype(np.int16)


def waves(seconds=4.0, seed=1):
    rng = np.random.default_rng(seed)
    t = np.arange(int(SR * seconds)) / SR
    n = rng.standard_normal(len(t))
    x = (0.4 + 0.6 * np.sin(2 * np.pi * t / 7) ** 2) * n
    return (x / np.abs(x).max() * 10000).astype(np.int16)


def clicks(seconds=4.0):
    x = np.zeros(int(SR * seconds))
    for k in np.arange(0.1, seconds, 0.25):
        i = int(k * SR)
        x[i:i + 200] = np.exp(-np.arange(200) / 30) * np.sin(np.arange(200))
    return (x * 20000).astype(np.int16)


def test_speech_estimate_separates():
    sp = speech_estimate(speechlike(), SR)
    assert sp >= 0.5
    assert speech_estimate(waves(), SR) < 0.5
    assert speech_estimate(np.zeros(SR * 2, dtype=np.int16), SR) == 0.0


def test_dsp_tags():
    t = DspTagger()
    r = t.tag(waves(), SR)
    names = dict(r["tags"])
    assert "broadband" in names
    r2 = t.tag(clicks(), SR)
    assert r2["descriptors"]["onset_rate"] > 2
    assert dict(r2["tags"]).get("impulsive", 0) > 0.5


def test_yamnet_falls_back_without_runtime(monkeypatch):
    monkeypatch.setitem(sys.modules, "ai_edge_litert", None)  # import now raises ImportError
    monkeypatch.setitem(sys.modules, "ai_edge_litert.interpreter", None)
    assert make_tagger("yamnet").name == "dsp" and make_tagger("auto").name == "dsp"


def test_yamnet_falls_back_without_model(tmp_path):
    assert make_tagger("yamnet", str(tmp_path / "missing.tflite")).name == "dsp"


def test_yamnet_loads_when_available():
    pytest.importorskip("ai_edge_litert")
    if not os.path.exists(DEFAULT_MODEL_PATH):
        pytest.skip("YAMNet model not downloaded (python tools/fetch_model.py)")
    assert make_tagger("yamnet").name == "yamnet"


def test_png_writer_valid():
    img = (np.arange(64 * 32) % 256).reshape(32, 64).astype(np.uint8)
    b = png_gray(img)
    assert b[:8] == b"\x89PNG\r\n\x1a\n"
    w, h = struct.unpack(">II", b[16:24])
    assert (w, h) == (64, 32)
    # decode IDAT
    i = b.index(b"IDAT")
    ln = struct.unpack(">I", b[i - 4:i])[0]
    raw = zlib.decompress(b[i + 4:i + 4 + ln])
    rows = np.frombuffer(raw, dtype=np.uint8).reshape(32, 65)
    assert (rows[:, 0] == 0).all() and np.array_equal(rows[:, 1:], img)


def test_spectrogram_png():
    b = spectrogram_png(speechlike(2.0), SR, width=128, height=64)
    assert b[:4] == b"\x89PNG" and struct.unpack(">II", b[16:24]) == (128, 64)


# ---------------- YAMNet (real model) ----------------
import glob  # noqa: E402
import os  # noqa: E402

import pytest  # noqa: E402

from tagger import DEFAULT_MODEL_PATH, YamnetTagger, read_wav, resample  # noqa: E402

HAVE_MODEL = os.path.exists(DEFAULT_MODEL_PATH)
TESTDATA = os.path.join(os.path.dirname(__file__), "..", ".testdata")
needs_model = pytest.mark.skipif(not HAVE_MODEL, reason="YAMNet model not downloaded (python tools/fetch_model.py)")


def test_make_tagger_falls_back_without_model(tmp_path):
    t = make_tagger("auto", model_path=str(tmp_path / "missing.tflite"))
    assert t.name == "dsp"
    assert make_tagger("dsp").name == "dsp"


def test_resample_keeps_tone():
    sr_in = 44100
    t = np.arange(sr_in) / sr_in
    y = resample(np.sin(2 * np.pi * 1000 * t), sr_in, 16000)
    assert len(y) == 16000
    spec = np.abs(np.fft.rfft(y))
    assert abs(np.argmax(spec) - 1000) <= 1  # 1 Hz bins


@pytest.fixture(scope="module")
def yam():
    if not HAVE_MODEL:
        pytest.skip("YAMNet model not downloaded")
    return YamnetTagger()


@needs_model
def test_yamnet_shapes_and_short_input(yam):
    assert len(yam.labels) == 521 and yam.labels[0] == "Speech"
    r = yam.tag(np.zeros(4000, dtype=np.int16), 16000)  # shorter than one frame: padded
    assert r["backend"] == "yamnet" and len(r["tags"]) == 5 and 0 <= r["speech"] <= 1
    assert set(r["groups"]) >= {"speech", "birds", "traffic", "water_waves", "bells", "rail"}
    sc = yam.scores(np.zeros(16000 * 3, dtype=np.int16), 16000)
    assert sc.shape == (1 + (48000 - 15600) // 7800, 521)


EXPECT = {  # ESC-50 category -> YAMNet group that must lead or score high
    "sea_waves": "water_waves", "rain": "rain", "church_bells": "bells", "train": "rail",
    "chirping_birds": "birds", "dog": "dogs", "footsteps": "footsteps", "engine": "traffic",
}


@needs_model
@pytest.mark.parametrize("cat,group", sorted(EXPECT.items()))
def test_yamnet_real_recordings(yam, cat, group):
    files = glob.glob(os.path.join(TESTDATA, "esc50", f"{cat}__*.wav"))
    if not files:
        pytest.skip("real recordings not downloaded (python tools/fetch_testdata.py)")
    x, sr = read_wav(files[0])
    r = yam.tag(x, sr)
    assert r["groups"][group] >= 0.4, (r["groups"], r["tags"])
    assert r["speech"] < 0.3, r["speech"]  # non-speech recordings are not discarded


@needs_model
def test_yamnet_detects_real_speech(yam):
    p = os.path.join(TESTDATA, "speech_OSR_us_000_0010_8k.wav")
    if not os.path.exists(p):
        pytest.skip("speech recording not downloaded")
    x, sr = read_wav(p)
    r = yam.tag(x[: sr * 10], sr)
    assert r["speech"] >= 0.5 and r["tags"][0][0] == "Speech"
