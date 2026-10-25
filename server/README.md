# Oh My Ondas: layer-2 server

Status 2026-10-21: works locally, and the container image builds and runs under podman. **Not deployed.**
Claude calls are only checked offline, because no API key is available here (see "Verified / not verified").
Design: `../docs/technical/ai-layer2-design.md`.

The device (Teensy, layer 1) always plays on its own. This server adds structure. Every few
bars it sends a **plan** for the next 8–32 bars: which capture plays which role, the step
patterns, the melody notes, transposition, texture density ramps, ducking and modulation
routings. The plan is built from what the device senses and where it is. The composition is
*of* the place: the material is only the place's own captured sound. **The server never sends
audio back**; it sends only `MSG_PLAN`, `MSG_REQ_CLIP`, `MSG_ACK` and `MSG_ERR`.

```
device ──(ESP32 bridge, wss)──▶ app.py ─▶ session.py   60 s of features, onsets, pulse (device bar/step), piezo, radio/RDS,
                                                       GPS, user actions, captures, ADPCM clip assembly, device clock mapping
                                        ─▶ place.py     OSM Overpass (500 m query, 300 m summary) + Open-Meteo + sun
                                        ─▶ tagger.py    YAMNet (AudioSet classes, LiteRT) or numpy fallback; speech check
                                        ─▶ planner.py   summary (+ optional spectrogram) → Claude → PLAN JSON; rule fallback
                                        ─▶ validate.py  capture ids, enums, ranges, ≤ 8 tracks → packed MSG_PLAN
                                        ─▶ journal.py   one JSONL per walk (no audio, GPS ~100 m)
```

## Files

| File | Role |
|---|---|
| `protocol.py` | `struct` pack/unpack for every message in `firmware/common/link_protocol.h` (protocol v4). Sizes are asserted at import and compared with g++ output in the tests |
| `adpcm.py` | IMA-ADPCM decoder, plus the reference encoder used by tests and the simulator (low nibble first) |
| `session.py` | per-device state; clip assembly; device bar clock; device `t_ms` → server time |
| `place.py` | Overpass and Open-Meteo through an injectable `httpx.AsyncClient`; geometry (inside areas, distance to segments); sun position |
| `tagger.py` | `YamnetTagger` (ai-edge-litert, 521 AudioSet classes grouped into birds/traffic/water/…/speech), `DspTagger` fallback |
| `planner.py` | summary, plan JSON schema, Claude call, rule planner, scheduler, cost meter |
| `validate.py` | plan validation and clamping; packs `MSG_PLAN` |
| `journal.py` | per-walk JSONL journal with retention |
| `spectro.py` | spectrogram as a grayscale PNG (numpy + zlib) |
| `app.py` | WebSocket endpoint: auth, protocol check, dispatch, device ACK/ERR, REQ_CLIP, rate limit, `/healthz` |
| `tools/sim_device.py` | simulated device walking from Barceloneta beach to the Sagrada Família. It has steps, crossings where the walker stands, tram magnetic bursts along the Ciutadella stretch, and stairs down into a metro station (−12 m) and back up. It cycles LINE-IN L through mic, piezo and coil, and sends WiFi counts on an offset ESP32 clock |
| `tools/live_check.py` | one real Claude plan request from a recorded session (`--dry-run` shows the exact HTTP request) |
| `tools/load_test.py` | N simulated devices against a real `app.py` process: CPU, RSS, plan latency, errors |
| `tools/fetch_model.py` | downloads `models/yamnet.tflite` (pinned URL, sha256 checked; not in git) |
| `tools/fetch_testdata.py` | downloads real test recordings to `.testdata/` (ESC-50 clips + one speech sample; not in git) |
| `tools/review_walk.py` | prints a walk journal as a timeline |
| `tools/trim_overpass.py` | trims a real Overpass response into a test fixture |
| `deploy/` | Sisyphus compose service, Caddy block, env template, operator ticket draft; see `deploy/DEPLOY.md` |

## Wire format (link protocol v4)

One binary WebSocket message is one link frame as the ESP32 forwards it:
`type u8 | seq u16 LE | len u16 LE | payload`, with no COBS and no CRC, and packed little-endian
structs. A payload is at most 1024 bytes.

**Handshake:** the server checks `Authorization: Bearer <token>` (401 if wrong) and, when the
ESP32 sends it, `X-Ondas-Proto: 4` (426 if different). A `HELLO` with another `proto` gets
`ERR` code 1 and is then closed with WebSocket code 1008.

**Device → server**
- Sources: mic, piezo, radio, coil (electromagnetic pickup: fields as sound), light (solar
  cell: flicker as sound).
- `FEAT` is 59 bytes. Its last field, `left_source`, says which input is on LINE-IN L right now;
  `REQ_CLIP` only asks for that input or the radio.
- Speech checks: mic and piezo clips can carry a voice, so they get the speech check (and need
  YAMNet). Coil, light and radio clips do not.
- `CLIP` chunks are only taken for the REQ_CLIP in flight (same source, after its ACK).
  Unrequested clips (the device's own periodic ones, or one already under way when the request
  came) are dropped unseen. Sample rate must be 8000, 16000, 22050, 32000, 44100 or 48000
  (0 means 16000), and a clip at most 12 s; otherwise ERR 1.
- `MOTION` (26 B, 10 Hz) feeds 60 s windows of: cadence, standing fraction, steps, movement
  (accel rms and sd), heading and turn rate (from 1 s circular means), magnetic field and its
  variation (trams, trains, motors), and gestures.
- `ENV` (16 B, 1 Hz) gives height change vs the walk start, the climb rate over 30 s,
  pressure, the pressure trend, fast fluctuation (doors, tunnels), and temperature.
- `RF` (20 B, about every 10 s) is sent by the ESP32 on its **own clock**, mapped separately;
  it carries counts only (AP count, RSSI median/max, per-channel counts).
- `PULSE` carries the device sequencer's `bar` (u16, wraps) and `step`. The server uses them
  for `starts_at_bar` (moved forward by tempo between PULSEs, compared modulo 65536) and to fold
  onsets onto the bar grid.
- **Device time:** every message with `t_ms` is placed at its device time, mapped to the server
  clock by the minimum observed (receive − t_ms), i.e. the least-delayed message. A buffered
  backlog flushed after a reconnect is therefore stored as the past, not the present. The offset
  may drift by 200 ppm. If `t_ms` jumps back more than 5 s (reboot), or a HELLO arrives, the
  estimate resets.
- `ACK` and `ERR` from the device are accepted:
  - ACK of a PLAN is counted.
  - ACK of a REQ_CLIP (sent when recording starts) opens that clip: only then are its chunks
    taken.
  - ERR on a PLAN (code 3) → the plan is dropped, planning waits for a fresh `CAPS`, then
    starts again from scratch.
  - ERR on a REQ_CLIP (refused: speech, input not selected) → the server stops waiting for
    that clip.

**Server → device**
- `PLAN` is a 9-byte header plus 30 bytes per track (at most 8 tracks, 249 bytes). `mod_source`
  0–11 is rms, centroid, piezo_rms, onsets, radio_rssi, cadence, accel_rms, heading, mag_var,
  dalt, dp_fast, rf_density. Track fields:
  - `slice`: 0 whole, 1 onsets, 2 even16
  - `duck_on`: a role, or 255 for none
  - `flags` bit 0: snap pitch to the sensed chroma
  - `notes[16]`: melody semitone offset per step from `pitch`; -128 means a rest
  - `capture_id` 255: no capture (modulation tracks)
- `REQ_CLIP {source, seconds ≤ 6}`. At most one is in flight per device; it is dropped on a
  device ERR or after `CLIP_REQUEST_TIMEOUT_S` (30 s).
- `ACK` for HELLO, CAPS and each completed CLIP.
- `ERR` codes: 1 bad frame (including bad clip chunk, sample rate or length, protocol version,
  or a message the server failed to handle), 2 unknown or
  wrong-direction type, 3 invalid plan, 4 auth, 5 rate.

**Rate limit, per connection:** a token bucket of `RATE_MSGS_PER_S` (200) per second with a
burst of `RATE_BURST` (400).
- Right after connect there is a one-off allowance of `RATE_CONNECT_BACKLOG` (4000 messages)
  for the ESP32's buffered backlog.
- HELLO and CAPS do not use that bucket, so a FEAT flood never blocks them. They have their own:
  2 per second, burst 8. Over it they are dropped with ERR 5 (the device then announces again);
  this never closes the connection.
- Other messages over the limit are dropped, with ERR 5 at most once a second.
- 400 drops within 2 s close the connection (ERR 5, then code 1008).
- A device that reconnects replaces its old connection. The old one is closed in the
  background, so a half-open socket does not block the new one.

## Environment variables

See `.env.example`. Secrets come only from the environment.

| Var | Default | Meaning |
|---|---|---|
| `DEVICE_TOKENS` | (required) | comma list of bearer tokens; the device id in logs and the journal is `dev-` + 8 hex of sha256(token) |
| `ANTHROPIC_API_KEY` | — | without it only the rule planner runs |
| `ANTHROPIC_MODEL` | `claude-sonnet-5-5` | model id |
| `ANTHROPIC_EFFORT` | `low` | `output_config.effort` |
| `ANTHROPIC_THINKING` | `adaptive` | `between_tools` = no up-front thinking (lower latency) |
| `ANTHROPIC_FALLBACKS` | `1` | `fallbacks: "default"` with beta `server-side-fallback-2026-07-01` |
| `PLAN_EVERY_BARS` / `FEATURE_CHANGE_THRESHOLD` / `PLAN_MIN_INTERVAL_S` | 16 / 0.35 / 4 | when to plan |
| `PLAN_TIMEOUT_S` | 6 (clamped 3–8) | Claude time budget; after it, the rule plan is sent |
| `ATTACH_SPECTROGRAM` | 0 | attach a PNG spectrogram of the latest accepted clip |
| `CLIP_INTERVAL_S` / `CLIP_SECONDS` / `CLIP_REQUEST_TIMEOUT_S` | 60 / 6 / 30 | clip requests (6 s is the device maximum) |
| `TAGGER` | `auto` | `auto`/`yamnet` = YAMNet if the model and runtime are present, else `dsp` |
| `YAMNET_MODEL` | `models/yamnet.tflite` | model path |
| `YAMNET_SPEECH_DISCARD` | 0.3 | discard a mic clip if YAMNet's peak speech score reaches this |
| `MIC_CLIPS_REQUIRE_MODEL` | 1 | without YAMNet, mic clips are neither requested nor kept |
| `PLACE_ENABLED`, `OVERPASS_URL`, `OPEN_METEO_URL`, `CONTACT_URL` | on, public endpoints | `CONTACT_URL` goes in the User-Agent |
| `JOURNAL_ENABLED` / `JOURNAL_DIR` / `JOURNAL_RETENTION_DAYS` | 1 / `data/journal` / 30 | walk journal |
| `RATE_MSGS_PER_S` / `RATE_BURST` / `RATE_CONNECT_BACKLOG` | 200 / 400 / 4000 | rate limit |
| `PRICE_INPUT_PER_MTOK` / `PRICE_OUTPUT_PER_MTOK` | 2.0 / 10.0 | USD per million tokens, for the cost estimate |
| `PORT` (alias `BIND_PORT`) / `BIND_HOST` | 8765 / 127.0.0.1 | `HOST` is deliberately not used: shells set it to the hostname |
| `SESSION_IDLE_S` | 1800 | how long a disconnected device's session is kept |

## Run locally

```bash
cd server
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/python tools/fetch_model.py              # YAMNet (4 MB); optional, the server falls back to numpy
DEVICE_TOKENS=devtoken .venv/bin/python app.py      # ws://127.0.0.1:8765
.venv/bin/python tools/sim_device.py --token devtoken --duration 120 --speed 20     # second terminal
.venv/bin/python tools/review_walk.py --latest      # the walk you just simulated
```

`PLACE_ENABLED=0` avoids calls to the public Overpass and Open-Meteo servers while experimenting.

## Testing

```bash
cd server
.venv/bin/python tools/fetch_model.py && .venv/bin/python tools/fetch_testdata.py   # optional: enables the real-model tests
.venv/bin/python -m pytest -q
.venv/bin/python tools/load_test.py --devices 5 --duration 60
ANTHROPIC_API_KEY=... .venv/bin/python tools/live_check.py      # one real plan request (costs a few tenths of a cent)
```

No test touches the network or the Claude API. Tests that need the model or the recordings are
skipped when those are missing. The end-to-end tests run once with each tagger.

## What the tagger hears (measured on real recordings, 2026-10-21)

YAMNet float32 TFLite (MediaPipe build) on ai-edge-litert 2.3.0. ESC-50 clips are 5 s at 44.1 kHz,
resampled to 16 kHz. Times are for a laptop CPU.

| Clip | Top 3 YAMNet classes | Groups | Speech peak |
|---|---|---|---|
| sea_waves | Water 0.83, Ocean 0.77, Waves/surf 0.73 | water_waves 0.86 | 0.00 |
| rain | Water 0.76, Rain 0.73, Rain on surface 0.50 | water_waves 0.87, rain 0.84 | 0.04 |
| church_bells | Bell 1.00, Church bell 0.85, Musical instrument 0.26 | bells 1.00 | 0.00 |
| train | Vehicle 0.70, Rail transport 0.43, Train 0.42 | traffic 0.80, rail 0.59 | 0.02 |
| engine | Vehicle 0.59, Motor vehicle 0.14, Truck 0.10 | traffic 0.63 | 0.01 |
| chirping_birds | Animal 0.55, Bird 0.49, Wild animals 0.47 | birds 0.61 | 0.02 |
| footsteps | Walk/footsteps 0.41, Fireworks 0.22, Explosion 0.20 | footsteps 0.50 | 0.04 |
| dog | Silence 0.55, Animal 0.19, Dog 0.18 | dogs 0.52 | 0.02 |
| car_horn | Silence 0.63, Vehicle horn 0.08, Toot 0.05 | horns_sirens 0.41 | 0.01 |
| siren | Opera 0.30, Classical music 0.22, Siren 0.16 | horns_sirens 0.41, music 0.41 | 0.08 |
| crickets | Rattle 0.47, Maraca 0.30, Snake 0.30 | music 0.26, insects 0.15 | 0.02 |
| wind | Thunderstorm 0.52, Thunder 0.41, White noise 0.33 | rain 0.72 (wrong) | 0.01 |
| laughing | Silence 0.44, Speech 0.14, Laughter 0.03 | speech 0.28 | 0.41 |
| crying_baby | Speech 0.30, Laughter 0.09, Giggle 0.07 | speech 0.48 | 0.67 |
| speech (OSR US English, 8 kHz) | Speech 0.78 | speech 0.88 | 0.98 |

About 45–100 ms per 5 s clip. Errors: wind is heard as thunderstorm or rain, crickets as a
rattle, and the siren as opera. The numpy speech heuristic **misses real speech** (0.34 on the
speech sample) and flags birds. That is why, without YAMNet, mic clips are not used at all.

## Place context (real responses, 2026-10-21, overpass-api.de)

| Point | Summary within 300 m | Sensible? |
|---|---|---|
| Barceloneta beach 41.3784, 2.1925 | coastline 26 m, beach 26 m, pedestrian streets 31 m, park 77 m, fountain 153 m; no major road | yes: on the seafront promenade |
| Sagrada Família 41.4036, 2.1744 | basilica 0 m (inside the polygon), pond (Pl. Gaudí) 50 m, park 54 m, metro 63 m, rail tunnel 65 m, 34 medium roads (Eixample grid) | yes |
| Parc de la Ciutadella 41.3881, 2.1873 | park 0 m, wood 7 m, lake 14 m, Capella Castrense 92 m, fountains (Cascada) 204 m, tram T4 233 m | yes (the fourth attempt; the earlier ones got 502 "at capacity" or timed out) |

Each query took 37–45 s and returned about 300 KB, and the public server repeatedly answered
502 "at capacity … for automated use run a local Overpass API instance". That message is why
the code is shaped as it is:
- one query covers 500 m and is reused for 200 m of walking (about 25 queries per walking hour)
- sidewalks are excluded from the query
- 60 s HTTP timeout; lookups never block planning
- cool-down that doubles on each 429, 5xx, timeout or network error (up to 30 min); other 4xx
  answers concern the request, so they do not hold back other devices
- the last known context is kept, marked stale

Open-Meteo answered in about 0.3 s.

## Data and privacy rules

- **No mic speech.**
  - The device withholds mic clips during speech and answers the REQ_CLIP with an ERR.
  - The server discards a mic clip if the device flagged speech (FEAT.speech) at any time from
    the REQ_CLIP until the last chunk arrived (recording, the device's 1.6 s detector tail and
    sending), or if YAMNet's peak speech score is ≥ 0.3.
  - Only requested clips are used, so every clip has that window; any other clip is dropped.
  - Without YAMNet, mic clips are not requested and are discarded unseen.
  - A discarded clip leaves nothing behind: no audio, no tags, only a `clip_discarded` journal
    line.
  - Radio clips are broadcasts and are kept.
- **No audio on disk or in logs.** The latest accepted clip per source is held in memory only.
- **Journal** (`JOURNAL_DIR/<date>/<device>_<time>.jsonl`): place summaries with the position
  rounded to 3 decimals (~100 m), clip tags, captures, plans with source and `why`, and short
  feature summaries. Files older than `JOURNAL_RETENTION_DAYS` are deleted at start-up and every
  hour.
- **Location:** raw coordinates are not sent to Claude and not logged. The place context works
  only from the position rounded to 3 decimals (~100 m): that is what Overpass and Open-Meteo
  get, and the OSM summary (counts, nearest distances, names) is computed from it, with nearest
  distances rounded to 50 m. Out-of-range positions and (0, 0) are ignored.
- **Logs** never contain tokens, audio or coordinates.

## Claude request (checked offline against SDK 2.0.0 and the docs)

`client.beta.messages.create(...)` with:
- `model`
- `max_tokens` 4000
- `system`
- `output_config: {"effort": "low", "format": {"type": "json_schema", "schema": PLAN_SCHEMA}}`
- `betas=["server-side-fallback-2026-07-01"]` and `fallbacks="default"`

No forced `tool_choice`: Sonnet 5.5 rejects it.

The schema puts every property in `required`, sets `additionalProperties: false`, and uses no
numeric constraints. Ranges are clamped in `validate.py`, and enum values are compared
case-insensitively because the docs warn that their capitalisation may change.

`tools/live_check.py --dry-run` sends the call through the real SDK into a mock transport and
prints the wire request: `POST /v1/messages?beta=true`, header
`anthropic-beta: server-side-fallback-2026-07-01`.

On refusal, `max_tokens`, a timeout (`PLAN_TIMEOUT_S`), an API error or invalid JSON, the
server sends the rule plan instead.

## Cost

Every call logs `input_tokens`, `output_tokens`, `usd_est`, `usd_last_hour_est` and
`usd_per_hour_extrapolated`, at `PRICE_*_PER_MTOK` (claude-sonnet-5-5: $2 / $10 per MTok).
**These are estimates from logged token counts, to be measured; nothing has been measured
here.**

Rough figure: a summary of about 1.5–2.5 k tokens in and 0.4–0.8 k out, every 16 bars (about
95 calls an hour at 100 BPM), comes to roughly $0.7–1.2 per walking hour.

## Load (5 simulated devices, 60 s, local laptop)

Protocol v4 traffic (FEAT, PIEZO, MOTION at 10 Hz; PULSE, RADIO, GPS, ENV at 1 Hz; RF every
10 s). Rule planner, YAMNet on, plan every 4 bars, a clip every 10 s per device (6× the default
clip rate).

| Measure | Result |
|---|---|
| Server CPU | mean 11.4 % of one core; peak 85 % in a 1 s window (YAMNet bursts) |
| Server RSS | 66 → 93 MiB |
| Plans | 45, all delivered; rule-planner latency median 4.6 ms, p95 15.1 ms |
| Clips | 25 tagged |
| Errors | none |

The container RSS after a walk was 71 MiB, against the 512 MiB limit.

## Verified / not verified

- **Verified:**
  - Protocol v3 sizes and message type values against the C header (g++).
  - ADPCM round trip.
  - Real Overpass and Open-Meteo responses parsed, with sensible summaries.
  - YAMNet on real recordings.
  - Speech discard on a real speech recording.
  - Journal and retention.
  - Device ACK/ERR handling, the device-time backlog mapping, and the rate limit with
    reconnect backlog.
  - Load with 5 devices.
  - Image built with podman, run read-only, as a non-root user, with all capabilities dropped;
    the simulator works against it; SIGTERM stops it cleanly.
  - The Claude request shape through the real SDK (offline).
- **Not verified:**
  - Any real Claude call: latency inside the 3–8 s budget, plan quality, real token counts and
    cost, and acceptance of the fallback beta together with `output_config`.
  - Real device firmware against this server.
  - Real street recordings from the device's own microphone (gain, noise, speech).
  - The deployment itself (Caddy, DNS, the Sisyphus webhook build).

## Open decisions

1. **Overpass:** for production either accept the public server's limits (the current code
   copes), or run or rent an Overpass instance.
2. **Model, effort and interval:** `claude-sonnet-5-5`, effort `low`, every 16 bars; measure
   them with `tools/live_check.py` and a real walk.
3. **YAMNet thresholds:** speech discard at 0.3 is conservative; laughter (0.41) and a crying
   baby (0.67) are discarded too.
4. **Hostname and deploy shape:** `ondas-ws.levm.eu` is a proposal. It would be a second
   (app) shape built from a subfolder of the static-site repo, which is an architect decision
   in Sisyphus (`deploy/DEPLOY.md`).
