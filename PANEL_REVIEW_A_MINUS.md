# A- Gap Analysis — Oh My Ondas
**Date:** 2026-04-12
**Baseline:** `PANEL_REVIEW_2026-04-12.md` (scope-adjusted B-)
**Target:** A- (hobby project)

---

## Verification of Prior Fixes

| Item | Status |
|------|--------|
| WiFi creds moved to `config.h` | VERIFIED — `config.h` gitignored, `main.cpp` includes it, placeholder values only |
| README reconciled | VERIFIED — commit `907d456`, honest working/planned split |
| innerHTML audited safe | VERIFIED — all external data flows through `escapeHtml()`, remaining self-XSS is MEDIUM |
| demo-mode.js postMessage wildcard | VERIFIED FIXED — line 164 now uses `window.location.origin` |

---

## Remaining Gaps to A-

### G1 — Theoretical grounding absent from docs (Musicologist)

The Musicologist role flagged that Schafer, Westerkamp, and Truax are never cited in project docs. `about.html` mentions them in passing but `REQUIREMENTS.md`, `INTENT.md`, and `docs/` contain zero references. For a project rooted in psychogeography and soundwalking, the theoretical lineage must be explicit. The ad-hoc soundscape taxonomy (`quiet/rhythmic/tonal/chaotic` in `soundscape-analyzer.js:12`) needs documented justification or mapping to established frameworks (Schafer's keynote/signal/soundmark or Truax's hi-fi/lo-fi).

### G2 — Timbral palette too conservative (Free Jazz Alto Player)

`synth.js` offers only sine/triangle/sawtooth/square. No spectral freezing, no buffer manipulation, no noise generators, no FM synthesis. For a situationist instrument, the sonic vocabulary should match the conceptual ambition. At minimum: add noise oscillator and basic FM capabilities.

### G3 — Sequencer uses `setInterval` (Audio DSP / DEV)

`sequencer.js:213` uses `setInterval` for step timing. This drifts. Chris Wilson's "A Tale of Two Clocks" pattern (`AudioContext.currentTime` + lookahead) is the standard fix and is documented in `TODO.md:58`.

### G4 — `escapeHtml` copy-pasted 3x (DEV)

Identical function at `app.js:4`, `journey.js:5`, `landmark.js:6`. Extract to shared `utils.js`. Symptom of no-module architecture.

### G5 — `mockup-orange.html` postMessage wildcard (Security)

`mockup-orange.html:800` still uses `'*'`. Last remaining wildcard site.

### G6 — ArduinoJson not pinned in ESP32 env (System Architect)

`platformio.ini` line 138 pins `ArduinoJson@^6.21.4` for the Teensy env but `StaticJsonDocument<256>` in `main.cpp:69` is deprecated in v7. The pin prevents breakage but the code should migrate to `JsonDocument` (v7 API) or add an explicit comment acknowledging v6 lock-in.

### G7 — No Serial protocol framing (System Architect)

`main.cpp:78` sends JSON via `Serial.println()` with no length prefix, no delimiter negotiation, no CRC. Partial reads on the Teensy side will silently corrupt.

### G8 — INTENT.md pitch line not in README (Marketing)

`INTENT.md:10-11` has the one-sentence pitch. `README.md:8` has a generic description. The human-readable hook belongs above the fold.

### G9 — Dirty-tree discipline (PM)

Working tree was dirty at baseline. Commit `3aa72f8` cleaned most of it. Current state is clean (`git status` shows no modifications or untracked files). This gap is resolved.

### G10 — WCAG accent color + user-select + overflow (UI/UX)

`style.css:8` `user-select: none` globally, `style.css:28-31` `overflow: hidden` on html/body, accent `#5ba8d4` fails AA at 3.1:1. All three persist.

---

## Tickets to A-

Priority tiers: P0 = blocks A-, P1 = required for A-, P2 = strengthens case.

### TICKET A1 — Add theoretical grounding document
**Priority:** P1
**Addresses:** G1
**Action:** Create `docs/theoretical-basis.md`. Document:
1. Lineage: Schafer (soundscape ecology, 1977), Westerkamp (soundwalking, Kits Beach 1989), Truax (hi-fi/lo-fi), Lopez (blind listening), Akio Suzuki (oto-date).
2. Map the `quiet/rhythmic/tonal/chaotic` taxonomy to Schafer's keynote/signal/soundmark. Justify divergences.
3. Explain how `_tunePitchesToEnvironment` and source-role assignment implement the "place composes itself" principle from `REQUIREMENTS.md:35`.
**acceptance_checks:**
- [ ] `docs/theoretical-basis.md` exists and references at least Schafer, Westerkamp, Truax by name with work titles
- [ ] Soundscape taxonomy mapping is explicit (table or prose linking each category to established terms)
- [ ] Document linked from `README.md` under a "Theoretical Background" heading

### TICKET A2 — Replace setInterval sequencer with Web Audio scheduler
**Priority:** P1
**Addresses:** G3
**Action:** In `sequencer.js`, replace `setInterval` at line 213 with a lookahead scheduler using `AudioContext.currentTime`. Follow Chris Wilson's "A Tale of Two Clocks" pattern: schedule notes 100ms ahead, use `setTimeout` with 25ms tick to refill the buffer.
**acceptance_checks:**
- [ ] `sequencer.js` no longer calls `setInterval` for step timing
- [ ] Timing uses `AudioContext.currentTime` as clock source
- [ ] Tempo changes mid-playback produce no glitches
- [ ] E2E tests still pass (`npm test` in `tests/`)

### TICKET A3 — Extract shared escapeHtml utility
**Priority:** P1
**Addresses:** G4
**Action:** Create `web/js/utils.js` with `escapeHtml()`. Remove duplicate definitions from `app.js:4`, `journey.js:5`, `landmark.js:6`. Add `<script src="js/utils.js">` before other scripts in all HTML files that use these JS files.
**acceptance_checks:**
- [ ] `escapeHtml` defined in exactly one file (`web/js/utils.js`)
- [ ] `app.js`, `journey.js`, `landmark.js` no longer define their own `escapeHtml`
- [ ] `grep -rn "function escapeHtml" web/js/` returns exactly one result
- [ ] App loads without console errors in Chrome DevTools

### TICKET A4 — Fix mockup-orange postMessage wildcard
**Priority:** P1
**Addresses:** G5
**Action:** In `mockup-orange.html:800`, replace `'*'` with `window.location.origin`.
**acceptance_checks:**
- [ ] `grep "postMessage.*'\*'" web/mockup-orange.html` returns no results
- [ ] Mockup-to-app communication still works when served from same origin

### TICKET A5 — Add noise + FM to synth
**Priority:** P2
**Addresses:** G2
**Action:** In `synth.js`:
1. Add white/pink noise oscillator option using `AudioBufferSourceNode` with generated noise buffer.
2. Add basic 2-operator FM: carrier + modulator with index control.
3. Wire both to existing ADSR envelope.
**acceptance_checks:**
- [ ] `synth.js` supports at least 6 waveform types (4 standard + noise + FM)
- [ ] FM index parameter is controllable (0 = pure sine, higher = richer harmonics)
- [ ] Noise and FM are selectable from the synth waveform UI control

### TICKET A6 — Add Serial framing to ESP32 output
**Priority:** P2
**Addresses:** G7
**Action:** In `main.cpp`, wrap JSON output with a simple framing protocol: `\x02` + length (2 bytes, little-endian) + JSON + `\x03`. Update Teensy-side parser to expect framing. Document the protocol in `docs/hardware/serial-protocol.md`.
**acceptance_checks:**
- [ ] `main.cpp` output is framed (not bare `Serial.println`)
- [ ] Protocol documented in `docs/hardware/`
- [ ] Teensy parser handles framed messages (or TODO is filed with specific line references)

### TICKET A7 — Move INTENT.md pitch to README
**Priority:** P1
**Addresses:** G8
**Action:** Replace `README.md:8` generic description with: "For people who walk through cities and want to listen differently — a portable instrument for pedestrian sonic exploration." Keep the technical description as a second paragraph.
**acceptance_checks:**
- [ ] `README.md` line 8 contains the human pitch, not the technical description
- [ ] `INTENT.md` is committed (not untracked)

### TICKET A8 — Fix WCAG accent color and scoping
**Priority:** P1
**Addresses:** G10
**Action:**
1. Change `--accent` from `#5ba8d4` to `#3a8bbf` (or similar that passes 4.5:1 on white).
2. Scope `user-select: none` to `.device, .device *` instead of `*`.
3. Scope `overflow: hidden` to `body.app-mode` instead of bare `html, body`.
**acceptance_checks:**
- [ ] `style.css` `--accent` value passes WCAG AA (4.5:1) against white — verify with contrast checker
- [ ] `user-select: none` selector is scoped (not `*`)
- [ ] `overflow: hidden` is conditional (not on bare `html, body`)
- [ ] Content pages (`about.html`, `sdlc.html`) allow text selection and scrolling

---

## Grade Projection

| Ticket | Impact |
|--------|--------|
| A1 (theoretical grounding) | Resolves Musicologist CONCERNING, strongest single lever for A- |
| A2 (sequencer scheduler) | Resolves Audio DSP CONCERNING, removes #3 risk |
| A3 (escapeHtml dedup) | Resolves DEV code-debt finding, removes #5 risk |
| A4 (postMessage fix) | Resolves last Security wildcard, removes #4 risk |
| A7 (README pitch) | Resolves Marketing finding |
| A8 (WCAG fixes) | Resolves Accessibility/UI findings |

**Completing A1 + A2 + A3 + A4 + A7 + A8 (all P1) moves the hobby grade from B- to A-.** The P2 tickets (A5, A6) would push toward A but are not required for A-.

**Estimated effort:** ~45 agent-minutes total for P1 tickets. A2 (sequencer) is the most complex at ~15 minutes; the rest are 5-8 minutes each.
