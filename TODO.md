# fix/runtime-bugs — Scoped TODO

Branch: `fix/runtime-bugs`
Scope: JS modules, critical bugs, functional issues, security, race conditions.

## Files you own
- `web/js/radio.js`
- `web/js/scenes.js`
- `web/js/ai-composer.js`
- `web/js/landmark.js`
- `web/js/sampler.js`
- `web/js/synth.js`
- `web/js/sequencer.js`
- `web/js/mangle.js`
- `web/js/audio-engine.js`
- `web/js/recorder.js`
- `web/js/mic-input.js`
- `web/js/arrangement.js`
- `web/js/journey.js`
- `web/js/app.js` (JS logic only — null checks, transport IDs, setupFX, setupSynth, setupRadio, setupAdminModal, encoder wiring, VU loop, oscilloscope, state interval, innerHTML XSS)

## DO NOT touch
- `web/css/style.css` (owned by fix/css-a11y)
- `web/index.html` inline CSS/HTML layout (owned by fix/css-a11y)
- `web/about.html`, `web/design.html`, `web/ise.html`, `web/sdlc.html`, `web/proto.html` (owned by fix/website)

---

## Critical Bugs

- [ ] **GPS property mismatch in radio.js** — `radio.js:139,174` reads `gps.lat`/`gps.lng` but `gps.js:76-84` stores `.latitude`/`.longitude`. Fix to use correct property names.
- [ ] **scenes.js references nonexistent DOM IDs and App methods** — `applyState()` looks for `seqTempo`, `seqTempoDisplay`, `tempoValue`, `delayTime`, etc. None exist. Also calls `updateStepGrid()`, `updateTrackOverview()`, `updateSourceRouting()` which don't exist. Fix all references.
- [ ] **ai-composer.js same problem** — `surprise()` and `generateArrangement()` reference stale DOM IDs and nonexistent App methods. Fix all references.
- [ ] **landmark.js calls nonexistent RadioPlayer methods** — `tuneLocalRadio()` calls `scanLocalStations()` (should be `searchLocalStations()`) and `getStations()` (doesn't exist). Also stale DOM IDs.
- [ ] **setupTransport binds wrong button IDs** — `app.js:170-173` looks for `btnPlay2`/`btnStop2`/`btnRecord2`. Actual IDs are `btnPlayE`/`btnStopE`/`btnRecordE`.
- [ ] **Null-check crashes in app.js** — Add guards in `setupFX` (2353), `setupSynth` (1918), `setupAdminModal` (3078), `setupRadio` (2817).

## Functional Issues

- [ ] **Sequencer uses `setInterval`** (`sequencer.js:212`) — Replace with `AudioContext.currentTime` lookahead scheduler.
- [ ] **Swing stored but never applied** — Implement swing timing offset in `tick()` for even/odd steps.
- [ ] **Pads 8-15 can't receive samples** — `sampler.js:272` caps at 8. Expand `pads` array to 16.
- [ ] **Kit switching is a stub** — `sampler.js:308` `setBank()` must load actual audio files.
- [ ] **3 of 4 punch FX are stubs** — Implement `setReverse()`, `setFilterSweep()`, `setTapeStop()` in `mangle.js`.
- [ ] **Bit crusher not implemented** — Add AudioWorklet or ScriptProcessor fallback in `mangle.js`.
- [ ] **Pan encoder does nothing in default mode** — Wire `app.js:1511-1513` to master or sampler pan.
- [ ] **analysis.js is dead code in app.html** — Remove the `<script>` include from `app.html`, or guard with page detection.

## Architecture / Memory / Performance

- [ ] **Audio node leaks in synth** — Disconnect filter/gain nodes in note release.
- [ ] **VU meter animation never cancelled** — Add `cancelAnimationFrame` when not needed.
- [ ] **State publishing interval never cleared** — Add `clearInterval` mechanism.
- [ ] **Oscilloscope draws when hidden** — Only run `requestAnimationFrame` when synth panel visible.
- [ ] **getMeterLevel allocates per frame** — Reuse a single `Uint8Array` buffer.
- [ ] **Recorder blob URLs never revoked** — Call `URL.revokeObjectURL()` after download.
- [ ] **FX bypass channel routing** — Route `mangle.js` output through per-channel gain/EQ, not directly to master.
- [ ] **Arrangement overwrites sequencer callback** — Save and restore original callback.

## Security

- [ ] **XSS via innerHTML** — Replace `innerHTML` with `textContent` in `landmark.js:873` and `app.js:2795-2799` (radio station names).
- [ ] **No rate limiting on Nominatim** — Add throttle (1 req/sec max) in `journey.js` and `landmark.js`.
- [ ] **PostMessage uses wildcard origin** — Restrict to same-origin in `app.js:1335`. (index.html side owned by fix/css-a11y.)

## Race Conditions

- [ ] **landmark.js auto-initializes before app.init()** — Defer GPS/API calls until after AudioContext is ready.
- [ ] **Dual init paths in embedded mode** — Add proper mutex/flag in `app.js:3296-3327`.
- [ ] **Mic request without user gesture** — Ensure `getUserMedia()` only fires from user-initiated events.
