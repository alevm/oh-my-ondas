"""Audio tagging of clips, plus the server-side speech double-check.

Backends:
  - "yamnet": Google YAMNet (AudioSet, 521 classes: birds, traffic, waves, speech, bells,
    music, wind, rain, footsteps, trains ...) as the official float32 TFLite model, run with
    ai-edge-litert (no TensorFlow). Model file: models/yamnet.tflite, fetched by
    tools/fetch_model.py (pinned URL + sha256), not in git.
  - "dsp": numpy-only fallback when the model or runtime is missing: continuous descriptors
    and heuristic descriptor tags (impulsive, tonal, broadband ...), not sound-event classes.
TAGGER=auto (default) picks yamnet when available.
"""
from __future__ import annotations

import logging
import math
import os

import numpy as np

log = logging.getLogger("tagger")

SPEECH_DISCARD_THRESHOLD = 0.5


def _frames(x: np.ndarray, n: int, hop: int) -> np.ndarray:
    if len(x) < n:
        x = np.pad(x, (0, n - len(x)))
    k = 1 + (len(x) - n) // hop
    idx = np.arange(n)[None, :] + hop * np.arange(k)[:, None]
    return x[idx]


def stft_mag(pcm: np.ndarray, sr: int, n: int = 512, hop: int = 256) -> tuple[np.ndarray, np.ndarray]:
    x = pcm.astype(np.float32) / 32768.0
    fr = _frames(x, n, hop) * np.hanning(n).astype(np.float32)
    mag = np.abs(np.fft.rfft(fr, axis=1))
    freqs = np.fft.rfftfreq(n, 1.0 / sr)
    return mag, freqs


def descriptors(pcm: np.ndarray, sr: int) -> dict:
    mag, freqs = stft_mag(pcm, sr)
    power = mag ** 2 + 1e-12
    x = pcm.astype(np.float32) / 32768.0
    rms = float(np.sqrt(np.mean(x ** 2)) + 1e-9)
    tot = power.sum(axis=1)
    centroid = float(np.mean((power * freqs).sum(axis=1) / tot))
    flat = float(np.mean(np.exp(np.mean(np.log(power), axis=1)) / np.mean(power, axis=1)))

    def band(lo, hi):
        m = (freqs >= lo) & (freqs < hi)
        return float(power[:, m].sum() / power.sum())

    env = np.sqrt(power.sum(axis=1))
    flux = np.maximum(np.diff(np.log(power), axis=0), 0).mean(axis=1) if len(power) > 1 else np.zeros(1)
    thr = flux.mean() + 1.5 * flux.std()
    peaks = int(np.sum((flux[1:-1] > thr) & (flux[1:-1] >= flux[:-2]) & (flux[1:-1] >= flux[2:]))) if len(flux) > 2 else 0
    dur = len(pcm) / sr
    # strongest envelope modulation frequency (Hz) and its relative strength
    frame_rate = sr / 256.0
    e = env - env.mean()
    mod_hz, mod_strength = 0.0, 0.0
    if len(e) > 16 and e.std() > 0:
        spec = np.abs(np.fft.rfft(e * np.hanning(len(e))))
        mf = np.fft.rfftfreq(len(e), 1.0 / frame_rate)
        m = (mf >= 0.5) & (mf <= 12)
        if m.any():
            i = int(np.argmax(spec[m]))
            mod_hz = float(mf[m][i])
            mod_strength = float(spec[m][i] / (spec[1:].sum() + 1e-9))
    # tonality: mean peak-to-mean ratio of spectra
    tonal = float(np.mean(mag.max(axis=1) / (mag.mean(axis=1) + 1e-9)))
    return {
        "rms_db": round(20 * math.log10(rms), 1),
        "centroid_hz": round(centroid),
        "flatness": round(flat, 3),
        "low_ratio": round(band(0, 250), 3),
        "speech_band_ratio": round(band(300, 3400), 3),
        "high_ratio": round(band(4000, sr / 2), 3),
        "onset_rate": round(peaks / max(dur, 0.1), 2),
        "envelope_mod_hz": round(mod_hz, 2),
        "envelope_mod_strength": round(mod_strength, 3),
        "tonality": round(tonal, 1),
        "duration_s": round(dur, 2),
    }


def speech_estimate(pcm: np.ndarray, sr: int, d: dict | None = None) -> float:
    """0..1 heuristic speech likelihood: energy concentrated in 300-3400 Hz,
    syllabic envelope modulation (3-8 Hz), moderate flatness, voiced harmonics.
    Deliberately biased towards false positives (a clip wrongly discarded costs little)."""
    d = d or descriptors(pcm, sr)
    if d["rms_db"] < -60:
        return 0.0
    s_band = min(1.0, max(0.0, (d["speech_band_ratio"] - 0.4) / 0.4))
    s_mod = 1.0 if 2.5 <= d["envelope_mod_hz"] <= 9 else 0.3
    s_mod *= min(1.0, d["envelope_mod_strength"] * 25)
    s_flat = 1.0 if 0.02 <= d["flatness"] <= 0.4 else 0.4
    s_tonal = min(1.0, d["tonality"] / 15.0)
    score = 0.45 * s_band + 0.3 * s_mod + 0.1 * s_flat + 0.15 * s_tonal
    return round(float(min(1.0, max(0.0, score))), 3)


class DspTagger:
    name = "dsp"

    def tag(self, pcm: np.ndarray, sr: int) -> dict:
        d = descriptors(pcm, sr)
        sig = lambda v, c, w: 1.0 / (1.0 + math.exp(-(v - c) / w))
        tags = {
            "impulsive": sig(d["onset_rate"], 2.0, 0.8),
            "tonal": sig(d["tonality"], 20.0, 5.0),
            "broadband": sig(d["flatness"], 0.3, 0.08),
            "low_rumble": sig(d["low_ratio"], 0.5, 0.1),
            "high_hiss": sig(d["high_ratio"], 0.3, 0.08),
            "pulsing": sig(d["envelope_mod_strength"], 0.04, 0.01),
            "quiet": sig(-d["rms_db"], 45, 5),
        }
        top = sorted(((k, round(v, 2)) for k, v in tags.items()), key=lambda kv: -kv[1])
        return {"backend": self.name, "tags": [t for t in top if t[1] >= 0.3][:5], "descriptors": d}


# ---------------- YAMNet (AudioSet, 521 classes) on LiteRT ----------------
YAMNET_SR = 16000
YAMNET_WIN = 15600   # 0.975 s
YAMNET_HOP = 7800
DEFAULT_MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models", "yamnet.tflite")

# Speech classes used for the privacy discard (intelligible voice). Crowd babble is reported
# as "voices" but does not by itself discard a clip.
SPEECH_LABELS = ["Speech", "Child speech, kid speaking", "Conversation", "Narration, monologue",
                 "Babbling", "Shout", "Whispering", "Children shouting"]
GROUPS = {
    "speech": SPEECH_LABELS,
    "voices": ["Laughter", "Crying, sobbing", "Baby cry, infant cry", "Crowd", "Chatter",
               "Hubbub, speech noise, speech babble", "Baby laughter"],
    "birds": ["Bird", "Bird vocalization, bird call, bird song", "Chirp, tweet", "Bird flight, flapping wings",
              "Pigeon, dove", "Crow", "Caw", "Coo"],
    "insects": ["Insect", "Cricket"],
    "dogs": ["Dog", "Bark", "Canidae, dogs, wolves", "Howl", "Yip", "Bow-wow"],
    "traffic": ["Vehicle", "Motor vehicle (road)", "Car", "Car passing by", "Truck", "Bus", "Motorcycle",
                "Traffic noise, roadway noise", "Engine", "Light engine (high frequency)",
                "Medium engine (mid frequency)", "Heavy engine (low frequency)", "Idling", "Accelerating, revving, vroom"],
    "horns_sirens": ["Vehicle horn, car horn, honking", "Air horn, truck horn", "Siren", "Emergency vehicle",
                     "Police car (siren)", "Ambulance (siren)", "Fire engine, fire truck (siren)", "Civil defense siren"],
    "rail": ["Rail transport", "Train", "Train whistle", "Train horn", "Railroad car, train wagon",
             "Train wheels squealing", "Subway, metro, underground"],
    "water_waves": ["Ocean", "Waves, surf", "Water", "Stream", "Waterfall", "Splash, splatter", "Drip", "Gurgling"],
    "rain": ["Rain", "Raindrop", "Rain on surface", "Thunderstorm", "Thunder"],
    "wind": ["Wind", "Wind noise (microphone)", "Rustling leaves"],
    "bells": ["Bell", "Church bell", "Chime", "Wind chime", "Tubular bells", "Gong", "Bicycle bell", "Jingle bell"],
    "music": ["Music", "Musical instrument"],  # plus every label containing "music"
    "footsteps": ["Walk, footsteps", "Run", "Shuffle"],
}


def resample(x: np.ndarray, sr_in: int, sr_out: int) -> np.ndarray:
    """FFT resampling (band-limited), float in, float out."""
    if sr_in == sr_out:
        return x.astype(np.float32)
    n_out = int(round(len(x) * sr_out / sr_in))
    X = np.fft.rfft(x.astype(np.float64))
    keep = n_out // 2 + 1
    Y = np.zeros(keep, dtype=complex)
    m = min(keep, len(X))
    Y[:m] = X[:m]
    return (np.fft.irfft(Y, n_out) * (n_out / len(x))).astype(np.float32)


def read_wav(path: str) -> tuple[np.ndarray, int]:
    """16-bit PCM WAV -> (int16 mono, sample rate)."""
    import wave
    with wave.open(path, "rb") as w:
        if w.getsampwidth() != 2:
            raise ValueError("only 16-bit PCM WAV")
        sr, ch = w.getframerate(), w.getnchannels()
        x = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2")
    if ch > 1:
        x = x.reshape(-1, ch).mean(axis=1).astype(np.int16)
    return x, sr


def to_16k_int16(pcm: np.ndarray, sr: int) -> np.ndarray:
    if sr == YAMNET_SR:
        return pcm
    y = resample(pcm.astype(np.float32), sr, YAMNET_SR)
    return np.clip(y, -32768, 32767).astype(np.int16)


class YamnetTagger:
    """YAMNet float32 TFLite model (MediaPipe audio_classifier build, labels embedded)
    run with ai-edge-litert. One interpreter, guarded by a lock (not thread-safe)."""

    name = "yamnet"

    def __init__(self, model_path: str | None = None, num_threads: int = 1):
        import threading
        import zipfile
        from ai_edge_litert.interpreter import Interpreter  # optional dependency

        path = model_path or os.environ.get("YAMNET_MODEL", DEFAULT_MODEL_PATH)
        if not os.path.exists(path):
            raise FileNotFoundError(path)
        with zipfile.ZipFile(path) as z:  # label list is appended to the .tflite as a zip
            self.labels = z.read("yamnet_label_list.txt").decode().splitlines()
        if len(self.labels) != 521:
            raise ValueError("unexpected label count")
        self._it = Interpreter(model_path=path, num_threads=num_threads)
        self._it.allocate_tensors()
        self._in = self._it.get_input_details()[0]["index"]
        self._out = self._it.get_output_details()[0]["index"]
        self._lock = threading.Lock()
        idx = {n: i for i, n in enumerate(self.labels)}
        self.groups = {g: [idx[n] for n in names if n in idx] for g, names in GROUPS.items()}
        self.groups["music"] = sorted(set(self.groups["music"]) | {i for i, n in enumerate(self.labels) if "music" in n.lower()})
        self.speech_idx = self.groups["speech"]

    def scores(self, pcm: np.ndarray, sr: int) -> np.ndarray:
        """Per-frame class scores, shape (frames, 521)."""
        x = to_16k_int16(pcm, sr).astype(np.float32) / 32768.0
        if len(x) < YAMNET_WIN:
            x = np.pad(x, (0, YAMNET_WIN - len(x)))
        starts = range(0, len(x) - YAMNET_WIN + 1, YAMNET_HOP)
        out = []
        with self._lock:
            for s in starts:
                self._it.set_tensor(self._in, x[s:s + YAMNET_WIN])
                self._it.invoke()
                out.append(self._it.get_tensor(self._out)[0].copy())
        return np.array(out)

    def tag(self, pcm: np.ndarray, sr: int) -> dict:
        sc = self.scores(pcm, sr)
        mean, peak = sc.mean(axis=0), sc.max(axis=0)
        top = np.argsort(mean)[::-1][:5]
        groups = {g: round(float(max(peak[i] * 0.5 + mean[i] * 0.5 for i in ids)), 3)
                  for g, ids in self.groups.items() if ids}
        speech = float(peak[self.speech_idx].max())
        return {"backend": self.name,
                "tags": [(self.labels[i], round(float(mean[i]), 3)) for i in top],
                "groups": {g: v for g, v in sorted(groups.items(), key=lambda kv: -kv[1])},
                "speech": round(speech, 3),
                "descriptors": descriptors(to_16k_int16(pcm, sr), YAMNET_SR)}


def make_tagger(name: str = "auto", model_path: str | None = None):
    """'auto' (default): YAMNet when the runtime and model file are present, else DSP.
    'yamnet': same, but logs a warning when falling back. 'dsp': DSP only."""
    if name in ("auto", "yamnet"):
        try:
            return YamnetTagger(model_path)
        except Exception as e:  # ImportError, missing model file, bad model
            (log.warning if name == "yamnet" else log.info)(
                "yamnet unavailable, using dsp", extra={"error": type(e).__name__})
    return DspTagger()
