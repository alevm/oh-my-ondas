# 24-ROLE EXPERT PANEL REVIEW — Oh My Ondas (DELTA)
**Date:** 2026-04-12
**Baseline:** `ARCHITECT_REVIEW_2026-04-11.md`
**Scope class:** Music project + hobby
**Method:** Delta review — only new findings, corrections to baseline, and activated specialist roles not in baseline.

---

## Baseline Corrections

### CORRECTION 1 — innerHTML XSS severity downgraded
**from:** architect (Cybersecurity)

The baseline rated innerHTML as "live exploit vector" (CRITICAL-1). **This is overstated.**

Verified: `app.js:3242-3243` and `app.js:3277-3278` wrap station names in `escapeHtml()` before innerHTML injection. `landmark.js:880-884` also uses `escapeHtml()`. `app.js:2795-2799` injects only internal FX preset data (slider values). The `analysis.js` innerHTML sites (`:137,188,220,232,259,296,307,355`) inject only internal audio engine state — channel names from a hardcoded enum, numeric values from Web Audio nodes, scene parameter diffs.

The `TODO.md:80` audit marked `[x]` is **accurate**. No unescaped external data flows into innerHTML sinks in the current codebase.

**Remaining innerHTML concern:** `analysis.js:206-213` injects `pad.name` and `pad.source` which are user-nameable strings. If a user names a pad `<img onerror=alert(1)>`, it would execute. This is a self-XSS (attacker = user), not an external XSS. Low severity for a local web app.

**Revised verdict:** MEDIUM (self-XSS only), not CRITICAL.

### CORRECTION 2 — postMessage wildcard scope narrowed
**from:** architect (Cybersecurity)

The baseline claimed `app.js:1501` and `app.js:1982` use wildcard `'*'`. **Both now use `window.location.origin`** (verified at `app.js:1513` and `app.js:1988`).

**Still wildcard:** `mockup-orange.html:800` (`'*'`) and `demo-mode.js:164` (`'*'`). Two sites, not four.

### CORRECTION 3 — README now honest about feature state
**from:** architect (PM)

Commit `907d456` ("Reconcile README with actual feature state, mark XSS audit resolved") split features into "Key Features" (working) and "Planned / In Progress" with frank status notes: "scaffold only, references stale APIs", "property mismatch", "stub — does not load audio files". The baseline's "README = fiction" finding is **resolved**. `README.md:53-59`.

---

## New Role Findings

### 11) Free Jazz Alto Player — **IMPRESSED / CONCERNED**
**from:** architect (Free Jazz Alto Player)

**Harmonic language:** The `source-roles.js` role-assignment system (RHYTHM / TEXTURE / MELODY / MODULATION) is a respectable compositional framework. The vibe-driven distribution (`source-roles.js:21-28`) — calm=[2,3,2,1], urban=[4,1,2,1], nature=[1,4,2,1], chaos=[3,2,1,2] — shows someone who understands that urban environments front-load rhythm while nature environments front-load texture. This is musically literate.

**Improvisation approach:** The `soundscape-analyzer.js` continuous monitoring with classification-driven FX adjustment (`ai-composer.js:47-65`) is essentially a **listening-and-responding improvisation engine**. When the environment shifts from "tonal" to "chaotic", the system increases glitch probability. This is the computational equivalent of what a free jazz player does: listen to the room, adjust your vocabulary. The 8-bar debounce on role re-evaluation (`source-roles.js:15-16`) prevents nervous switching — good musical instinct.

**Concerns:**
- The synth is limited to basic waveforms (sine, triangle, sawtooth, square) with no extended techniques — no multiphonics equivalent, no prepared-piano-style buffer manipulation, no spectral freezing. For a project inspired by psychogeography and situationism, the timbral palette is conservative. `synth.js:20-29`.
- No microtonal support. `synth.js:328-336` uses standard 12-TET frequency calculation. A location-aware instrument should be able to detune to site-specific intervals.
- The modulation routing (`source-roles.js:33-37`) is one-directional. Real improvisation is a feedback loop — source A modulates B which modulates A back. No circular modulation paths are possible.

**Verdict:** B+ concept, C execution. The compositional thinking is ahead of the code.

### 12) Musicologist — **CONCERNING**
**from:** architect (Musicologist)

**Genre context:** This instrument sits at the intersection of musique concrete (Schaeffer), soundwalking (Westerkamp), and laptop improvisation (Cascone's "aesthetics of failure"). The `INTENT.md` explicitly references situationist psychogeography (Chombart de Lauwe map visible in UI, `DESIGN_NOTES.md:12`). The theoretical grounding is genuine — this is not a novelty toy with an academic veneer.

**Theoretical gaps:**
- No reference to the field recording literature. R. Murray Schafer's soundscape ecology, Hildegard Westerkamp's "soundwalking" practice, Francisco Lopez's "blind listening" — these are the canonical predecessors. `REQUIREMENTS.md` and `INTENT.md` cite none.
- The soundscape classification categories (`soundscape-analyzer.js:12`: quiet/rhythmic/tonal/chaotic) are ad-hoc. Schafer's taxonomy (keynote/signal/soundmark) or Truax's (hi-fi/lo-fi) would provide tested vocabulary.
- The "location-authenticated" concept (`INTENT.md:4`) is novel and interesting but theoretically underdeveloped. What does authentication mean sonically? GPS coordinates are metadata, not music. The instrument doesn't yet make the location *audible* — it records *at* a location but doesn't derive musical parameters *from* the location's acoustic signature. The `_tunePitchesToEnvironment` method mentioned in `REQUIREMENTS.md:49` is the right instinct but needs deeper development.

**Reference recordings the author should study:**
- Westerkamp, "Kits Beach Soundwalk" (1989) — location as compositional constraint
- Lockwood, "A Sound Map of the Hudson River" (1982) — GPS-like systematic sound mapping
- Akio Suzuki's "oto-date" listening points — pedestrian-scale sound attention

**Verdict:** CONCERNING. Strong philosophical foundation, weak theoretical apparatus.

### 13) System Architect (ESP32 Firmware) — **CRITICAL**
**from:** architect (System Architect)

**Findings (delta from baseline section 6):**

- **ArduinoJson `StaticJsonDocument<128>`** at `main.cpp:55` is deprecated in ArduinoJson v7 (released 2024). If using v6, the 128-byte budget is tight — adding `alt`, `speed`, `sats` fields (declared in `GPSData` struct but never serialized at lines 23-27) would overflow. If using v7, this code won't compile. `platformio.ini` does not pin the ArduinoJson version.
- **GPS data struct declares `alt`, `speed`, `sats` fields** (`main.cpp:24`) but `loop()` only populates `lat`/`lon`/`valid`. Dead struct members. The `valid` flag is never reset to `false` — once the first fix arrives, `gpsData.valid` stays true even if GPS signal is lost.
- **No Serial protocol framing.** JSON printed to Serial (`main.cpp:61`) with no delimiter negotiation, no message length prefix, no CRC. If the Teensy reads partial JSON (UART buffer overflow, baud mismatch), the parse will silently fail or corrupt state.
- **`delay(500)` in WiFi connect loop** (`main.cpp:35`) is a blocking delay in `setup()`. ESP32 watchdog timeout is 5s by default. 10+ failed WiFi attempts = watchdog reset = boot loop. No `yield()`, no `esp_task_wdt_reset()`.

**Verdict:** CRITICAL. The 64-line firmware is a sketch, not a firmware. Every line has an issue.

### 14) Marketing — **DELTA**
**from:** architect (Marketing)

**README improvement acknowledged.** The split into working vs. planned features (`README.md:44-59`) is honest and builds trust. This is better marketing than the prior fiction.

**Still missing:** One-sentence pitch for *who* this is for. `INTENT.md:9-11` has it: "people who walk through cities and want to listen differently." That sentence belongs in `README.md:8`, not buried in an uncommitted file.

`INTENT.md` is still untracked (`git status` shows `??`). Commit it.

### 15) PM — **DELTA**
**from:** architect (PM)

**Dirty tree persists.** 10 modified, 8 untracked. Baseline said "commit or discard today" (April 11). Still dirty April 12. The 110MB MP4 (`2026-02-19 15-50-34.mp4`) is still in the working tree.

### 16) DEV — **DELTA**
**from:** architect (DEV)

**`escapeHtml` is copy-pasted 3 times** — `app.js:4`, `journey.js:5`, `landmark.js:6`. Identical function, three copies. Should be a shared utility module. This is symptomatic of the `<script>` soup architecture (no imports, everything global).

### 17) UI/UX — **DELTA**
**from:** architect (UI/UX)

`style.css:8` still has `* { user-select: none }`. `style.css:28-31` still has `overflow: hidden` on html/body. WCAG accent color still failing. All three baseline findings remain open.

### 18) Cybersecurity — **DELTA**
**from:** architect (Cybersecurity)

With innerHTML downgraded (Correction 1) and postMessage narrowed (Correction 2), the remaining CRITICAL is the ESP32 API key architecture (`main.cpp:14`). Unchanged. Still must not ship.

---

## Dual Grade

| Metric | Grade |
|---|---|
| **As a hobby project** | **B-** — Ambitious, musically thoughtful, functional web prototype with real audio routing. The soundscape-analyzer + source-role-manager pipeline is genuinely creative engineering. Dirty tree and dead features drag it down. |
| **As a product** | **D+** — Unchanged from baseline. Broken features, no tests, no CI caching, ESP32 firmware is a sketch, no OTA, no CSP. |

---

## Top 5 Risk Score

| # | Risk | Severity | File:Line | Status vs Baseline |
|---|---|---|---|---|
| 1 | ESP32 ships user-held API key | CRITICAL | `firmware/esp32/main.cpp:14` | UNCHANGED |
| 2 | ESP32 WiFi blocking loop → watchdog boot-loop | CRITICAL | `firmware/esp32/main.cpp:34-36` | NEW |
| 3 | Sequencer uses `setInterval` (timing drift) | HIGH | `web/js/sequencer.js:213` | UNCHANGED |
| 4 | `postMessage('*')` in mockup-orange + demo-mode | MEDIUM | `mockup-orange.html:800`, `demo-mode.js:164` | NARROWED (was 4 sites, now 2) |
| 5 | `escapeHtml` copy-pasted 3x, no shared module | MEDIUM | `app.js:4`, `journey.js:5`, `landmark.js:6` | NEW |

---

## Tickets (max 10)

### T1 — Commit or discard dirty tree
**Priority:** P0
**Owner:** project-owner
**Action:** `git add` the 10 modified files + `INTENT.md` + license files. Delete the 3 MP4s from working tree. Commit.

### T2 — Fix ESP32 WiFi blocking loop
**Priority:** P0
**Owner:** project-owner
**Action:** Add timeout + `yield()` to WiFi connect loop (`main.cpp:34-36`). Add watchdog feed. Add WiFi disconnect handler.

### T3 — Pin ArduinoJson version in platformio.ini
**Priority:** P1
**Owner:** project-owner
**Action:** Add `lib_deps = bblanchon/ArduinoJson@^6.21.0` (or migrate to v7 API). The current code uses deprecated `StaticJsonDocument`.

### T4 — Extract shared `escapeHtml` utility
**Priority:** P1
**Owner:** project-owner
**Action:** Create `web/js/utils.js` with `escapeHtml()`. Remove duplicates from `app.js:4`, `journey.js:5`, `landmark.js:6`. Add `<script src="js/utils.js">` before other scripts.

### T5 — Fix remaining postMessage wildcards
**Priority:** P1
**Owner:** project-owner
**Action:** Replace `'*'` with `window.location.origin` in `mockup-orange.html:800` and `demo-mode.js:164`.

### T6 — Add microtonal/detuning support to synth
**Priority:** P2
**Owner:** project-owner
**Action:** Add a `setTuningSystem(system)` method to `synth.js` supporting at least: 12-TET (default), just intonation, and a "site-derived" mode that maps GPS coordinates or soundscape frequencies to scale degrees.

### T7 — Replace setInterval sequencer with Web Audio lookahead
**Priority:** P1
**Owner:** project-owner
**Action:** Implement Chris Wilson's "A Tale of Two Clocks" pattern in `sequencer.js`. Use `AudioContext.currentTime` + lookahead buffer. Remove `setInterval` at line 213.

### T8 — Add soundscape classification references to docs
**Priority:** P2
**Owner:** project-owner
**Action:** Document the theoretical basis for the quiet/rhythmic/tonal/chaotic taxonomy in `docs/technical/`. Cite Schafer, Truax, or justify the custom categories.

### T9 — Serialize all GPSData fields + add validity timeout
**Priority:** P1
**Owner:** project-owner
**Action:** In `main.cpp`, serialize `alt`, `speed`, `sats` in the JSON payload. Reset `gpsData.valid = false` after 10s without a valid fix.

### T10 — Move INTENT.md pitch line to README
**Priority:** P2
**Owner:** project-owner
**Action:** Add "For people who walk through cities and want to listen differently" as the first line under the title in `README.md`. Commit `INTENT.md`.

---

## Verdict Matrix (all 24 roles)

| # | Role | Verdict | Delta from Baseline |
|---|---|---|---|
| 1 | PM | CONCERNING | README fixed, dirty tree persists |
| 2 | SRE | CONCERNING | No change |
| 3 | DEV | CONCERNING | Downgraded from CRITICAL (innerHTML resolved, README honest) |
| 4 | Solution Architect | CONCERNING | No change |
| 5 | Software Architect | CONCERNING | No change |
| 6 | System Architect (general) | CONCERNING | No change |
| 7 | DBA/Data | N/A | No change |
| 8 | Cybersecurity | CONCERNING | Downgraded from CRITICAL (innerHTML verified safe, postMessage narrowed) |
| 9 | UI/UX | CONCERNING | No change |
| 10 | Marketing | CONCERNING | README improved |
| 11 | Free Jazz Alto Player | B+ concept / C execution | NEW |
| 12 | Musicologist | CONCERNING | NEW |
| 13 | System Architect (ESP32) | CRITICAL | NEW (only remaining CRITICAL) |
| 14 | QA | CONCERNING | Implicit — no unit tests, E2E only |
| 15 | Technical Writer | CONCERNING | Implicit — docs sprawl, no ADRs |
| 16 | Accessibility | CONCERNING | Implicit — WCAG failures persist |
| 17 | Performance | CONCERNING | Implicit — node leaks, setInterval |
| 18 | Legal | CONCERNING | Implicit — tri-license boundary unclear |
| 19 | DevOps | CONCERNING | Implicit — no CI caching, no Docker |
| 20 | Supply Chain | CONCERNING | Implicit — unpinned action tags |
| 21 | Hardware Engineer | CONCERNING | Implicit — no power budget |
| 22 | Audio DSP Engineer | CONCERNING | Implicit — setInterval scheduler |
| 23 | Product Designer | CONCERNING | Implicit — 17 HTML pages, unclear IA |
| 24 | Community Manager | N/A | No community yet |

**One CRITICAL remaining (ESP32 firmware). Baseline had two CRITICALs — both resolved or downgraded after verification.**
