# AI composition: layer 1 (on device) + layer 2 (over WiFi)

Status: design, 2026-10-21. Nothing implemented yet. Scope reference: `INTENT.md`, `REQUIREMENTS.md` §1–2: the composition is *of* the place; the material is the place's own sound (mic, piezo, over-the-air radio). No presets: what is sensed drives the music continuously.

## 1. Two layers

| | Layer 1: continuous | Layer 2: AI |
|---|---|---|
| Where | Teensy 4.1 | Server (VPS) + AI model, reached through the ESP32-S2 and the phone hotspot |
| Needs internet | No | Yes |
| Time scale | Every audio block (~3 ms) to ~100 ms | Plans the next 8–32 bars; answer in a few seconds |
| Does | Sensed features drive parameters directly (density, tempo, filter, pitch, slicing, triggers); plays the captures; renders layer-2 plans | Writes structure: phrases, development, how sources answer each other |
| Without layer 2 | Keeps playing on its own | — |

Layer 1 always runs. A layer-2 plan is applied at the next bar boundary; if no plan arrives (no WiFi, timeout), layer 1 continues unchanged.

## 2. Data path

```
Teensy ──Serial7 (28/29), 2 Mbaud, framed binary──▶ ESP32-S2 ──WiFi, TLS WebSocket──▶ server (VPS) ──▶ AI model
       ◀───────────────────── plans, clip requests ◀──────────────────────────────────
```

- Teensy: feature extraction, capture store (PSRAM), speech detector, renderer.
- ESP32-S2: no logic beyond forwarding; buffers when the link drops; WiFi credentials only.
- Server: holds the API key (never on the device), adds place context, runs audio tagging on clips, calls the model, validates the plan, sends it back.

## 3. Device → server

| Msg | Rate | Content |
|---|---|---|
| `FEAT` | 10 Hz | 32 log-spaced spectrum bands (dB), RMS loudness, spectral centroid, flatness (noise vs tone), 12-bin chroma, pitch + confidence, onset count since last frame |
| `ONSET` | per event | timestamp (ms), strength, band of max energy |
| `PULSE` | 1 Hz | tempo estimate (BPM) + confidence, phase |
| `PIEZO` | 10 Hz | RMS, 8 bands, peak count (steps, trams, machines through the surface) |
| `RADIO` | 1 Hz + on change | band (FM/AM/SW), frequency, RSSI, SNR, speech/music estimate, RDS station name and radio text when present |
| `GPS` | 1 Hz | lat, lon, altitude, speed, heading, fix quality, UTC time |
| `USER` | on change | fader positions, encoder moves, pads hit, captures made, mode |
| `CAPS` | on change | inventory of captures: id, source (mic/piezo/radio), length, layer-1 analysis (percussive/tonal/ambient, onsets, pitch), current role |
| `CLIP` | on request or every ~60 s | 5–10 s mono, 16 kHz, IMA-ADPCM (~8 KB/s), source + timestamp |

Privacy (`INTENT.md`, "not for surveillance"): the Teensy runs a speech detector on the mic. While speech is detected, no mic clip is sent: only `FEAT`. Radio clips are broadcasts and may be sent.

Data budget: features ~2–5 KB/s, clips ~1 KB/s averaged: about 10–20 MB per hour on the phone's data plan.

## 4. Server adds

From the GPS position, cached per ~100 m:
- Map features within ~300 m (OpenStreetMap Overpass): water, coast, park/forest, roads by type, railway/tram, market, church, port.
- Weather now (Open-Meteo): wind, rain, temperature.
- Sun position (sunrise, sunset, day/night).

From `CLIP`: sound-event tags (birds, traffic, waves, voices, bells…) from an audio-tagging model on the server.

## 5. Server → device

| Msg | Content |
|---|---|
| `PLAN` | Structure for the next N bars, applied at a bar boundary |
| `REQ_CLIP` | Ask for a clip of a source |
| `ACK` / `ERR` | Link state |

`PLAN` (JSON on the server side, packed to binary for the UART):

```json
{
  "plan_id": 42,
  "starts_at_bar": 17,
  "bars": 16,
  "tempo": {"bpm": 92, "follow_pulse": true},
  "tracks": [
    {"role": "rhythm", "capture": "c07", "slice": "onsets",
     "steps": [1,0,0,1, 0,0,1,0, 1,0,0,1, 0,1,0,0], "prob": 0.85, "pitch": 0},
    {"role": "texture", "capture": "c03", "mode": "grain",
     "density": {"from": 0.2, "to": 0.6}, "duck_on": "melody"},
    {"role": "melody", "capture": "c11", "notes": [[0,62],[3,65],[6,60]], "scale_from": "chroma"},
    {"role": "modulation", "source": "piezo.rms", "target": "texture.filter", "depth": 0.5}
  ],
  "sections": [{"bar": 0, "name": "enter"}, {"bar": 8, "name": "open"}],
  "why": "tram rumble every ~40 s; church bell C#; RDS: news station"
}
```

Rules the server enforces before sending: only capture ids from the latest `CAPS`; values in range; every track rendered by layer 1 (the plan never carries audio).

## 6. UART framing (Serial7)

COBS-encoded frames: `type (1) | seq (2) | length (2) | payload | CRC16 (2)`, `0x00` delimiter. 2 Mbaud gives ~200 KB/s, enough for features plus a continuous 16 kHz ADPCM stream. Fall back to 1 Mbaud if the jumper wiring is noisy.

## 7. Model

- Claude takes text and images, not audio. Audio reaches it as: (a) server-side tags from §4, (b) the numeric features, (c) optionally spectrogram images rendered from clips.
- To decide and verify before building: which model and its cost per hour of walking; which audio tagger runs on the VPS; how often to ask for a plan (e.g. every 16 bars, or on a large feature change).

## 8. Build order

1. Layer 1 on the Teensy: feature extraction (FFT, onsets, pulse, chroma, piezo), captures in PSRAM, continuous feature → parameter mapping, renderer. Port from the web engine in `web/js` (`analyzeBuffer`, `detectOnsets`, role assignment, cross-sync), replacing the vibe categories with continuous mapping.
2. Speech detector on the Teensy.
3. UART protocol Teensy ↔ ESP32-S2; ESP32-S2 WiFi + TLS WebSocket (PlatformIO env for the ESP32-S2, not `esp32dev`).
4. Server: WebSocket endpoint, place context, audio tagging, model call, plan validation.
5. `PLAN` rendering in layer 1 at bar boundaries.

## 9. Hardware this assumes

ESP32-S2 Thing Plus on Serial7 (28/29), powered from power bank output 2 by its USB-C. PSRAM 2 × 8 MB on the Teensy for captures. See `web/prototype.html`.

Implications:
- **PSRAM must be soldered** before Phase 9 (captures). Without it the firmware falls back to a small RAM buffer.
- **Serial7 at 2 Mbaud** over jumpers: short wires, a GND wire alongside; 1 Mbaud fallback still carries features + 16 kHz ADPCM.
- **ESP32-S2 is 2.4 GHz only:** the phone hotspot must offer 2.4 GHz (iPhone: "Maximize Compatibility" on).
- **Power bank with 2 outputs** (Teensy, ESP32). Common GND between the boards through the Serial7 GND wire.
- **No new parts to order** for layers 1–2: everything is owned or already on the DigiKey / Diotronic / Miami lists.
- **Server side:** an Anthropic API key and a WebSocket endpoint with TLS on the VPS (deployment by the user). Cost per hour of walking: to measure from logged token counts.
