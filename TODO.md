# Oh My Ondas — Review TODO

## TARGET 1: Device Mockup + Webapp

### Critical Bugs (broken at runtime)

- [ ] **GPS property mismatch in radio.js** — `radio.js:139,174` reads `gps.lat`/`gps.lng` but `gps.js:76-84` stores `.latitude`/`.longitude`. Local station search always gets `undefined` coordinates.
- [ ] **scenes.js references nonexistent DOM IDs and App methods** — `applyState()` looks for `seqTempo`, `seqTempoDisplay`, `tempoValue`, `delayTime`, etc. None exist in `app.html`. Also calls `window.app.updateStepGrid()`, `updateTrackOverview()`, `updateSourceRouting()` which don't exist. Scene recall is broken.
- [ ] **ai-composer.js same problem** — `surprise()` and `generateArrangement()` reference stale DOM IDs and call `window.app.updateSeqGrid()` / `updateSeqOverview()` which don't exist.
- [ ] **landmark.js calls nonexistent RadioPlayer methods** — `tuneLocalRadio()` calls `scanLocalStations()` and `getStations()`. Actual method is `searchLocalStations()`; `getStations()` doesn't exist. Also references stale DOM IDs.
- [ ] **setupTransport binds to wrong button IDs** — `app.js:170-173` looks for `btnPlay2`, `btnStop2`, `btnRecord2`. Actual embedded buttons are `btnPlayE`, `btnStopE`, `btnRecordE`.
- [ ] **Null-check crashes throughout app.js** — `setupFX` (2353), `setupSynth` (1918), `setupAdminModal` (3078), `setupRadio` (2817) call `.addEventListener()` on potentially null elements without guards.

### Significant Functional Issues

- [ ] **Sequencer uses `setInterval` for timing** (`sequencer.js:212`) — jitter, GC pauses, background tab throttling. Should use `AudioContext.currentTime` with lookahead scheduler.
- [ ] **Swing stored but never applied** — `tick()` never adjusts timing for even/odd steps. Swing control has zero effect.
- [ ] **Pads 8-15 can't receive samples** — `sampler.js:272` validates `padIndex < 8`. Bank B pads (8-15) always fail silently.
- [ ] **Kit switching is a stub** — `sampler.js:308` `setBank()` only logs. Never loads different audio files.
- [ ] **3 of 4 punch FX are stubs** — `app.js:2504-2517` calls `setReverse()`, `setFilterSweep()`, `setTapeStop()` on mangle engine. None exist.
- [ ] **Bit crusher not implemented** — `mangle.js:82-83` says "requires AudioWorklet" but none loaded.
- [ ] **Pan encoder does nothing in default mode** — `app.js:1511-1513` has only a comment.
- [ ] **Encoders and crossfader don't work on touch** — `index.html` only binds mouse events, no touch handlers.
- [ ] **analysis.js is 564 lines of dead code in app.html** — References DOM elements that only exist in `analysis.html`.

### Architecture / Memory / Performance

- [ ] **Audio node leaks in synth** — `triggerNote()` creates nodes per note but never disconnects filter/gain on release.
- [ ] **VU meter animation never cancelled** — `app.js:1744` starts `requestAnimationFrame` loop; `cancelAnimationFrame` never called.
- [ ] **State publishing interval never cleared** — `app.js:1320` `setInterval` at 10fps forever.
- [ ] **Oscilloscope draws when hidden** — `app.js:2105-2153` runs canvas drawing continuously even when synth panel not visible.
- [ ] **getMeterLevel allocates on every frame** — `audio-engine.js:150` creates `new Uint8Array` per call (300 allocs/sec).
- [ ] **Recorder blob URLs never revoked** — `URL.createObjectURL()` called but never revoked.
- [ ] **FX bypass channel routing** — `mangle.js:68` connects to `masterGain` directly, skipping per-channel EQ/gain.
- [ ] **Arrangement destructively overwrites sequencer callback** — `arrangement.js:93` doesn't save/restore original.

### Security

- [ ] **XSS via innerHTML** — `landmark.js:873` inserts Nominatim names; `app.js:2795-2799` inserts RadioBrowser station names. Use `textContent` instead.
- [ ] **No rate limiting on Nominatim** — `journey.js` and `landmark.js` fire reverse geocoding without throttle. Policy requires max 1 req/sec.
- [ ] **PostMessage uses wildcard origin** — `index.html:861` and `app.js:1335` both use `postMessage(msg, '*')`.

### Layout / CSS

- [ ] **Device mockup is 1100x700px fixed** — zero media queries in 850 lines of inline CSS.
- [ ] **All responsive CSS in style.css targets stale class names** — `style.css:1194-1320` styles `.top-bar`, `.col-mixer`, `.col-seq` etc. None exist in current DOM.
- [ ] **Duplicate `.ch-btns` rule** — `style.css` lines 383 and 546.
- [ ] **Global `user-select: none`** — `style.css:8` prevents selection everywhere.
- [ ] **Zero accessibility** — No ARIA, no focus indicators, no semantic roles on interactive elements.

### Race Conditions

- [ ] **landmark.js auto-initializes before app.init()** — `landmark.js:904-908` runs on DOMContentLoaded, making GPS/API calls before AudioContext exists.
- [ ] **Dual init paths in embedded mode** — `app.js:3296-3327` can trigger `init()` from both postMessage and click simultaneously.
- [ ] **Mic request without user gesture** — `handleMockupMode('interact')` at `app.js:1397` fires `getUserMedia()` from postMessage, not a click.

---

## TARGET 2: Website

### High Priority

- [ ] **ise.html footer links to wrong GitHub repo** — `ise.html:334` links to `manuelvargasmontero/ohmyondas` instead of `alevm/oh-my-ondas`.
- [ ] **ise.html navigation is different** — 5-link nav missing "SDLC" and "Analysis". No other page links to ISE.
- [ ] **proto.html is fully orphaned** — Custom nav with no links to rest of site. No page links to it.
- [ ] **CSS cache-buster versions desynchronized** — `index.html` `?v=253`, `app.html` `?v=249`, others `?v=248`.
- [ ] **Version strings missing from 3 footers** — `about.html`, `sdlc.html`, `analysis.html` omit version.
- [ ] **`user-select: none` on content pages** — Global rule prevents text selection on all content pages. None override it.
- [ ] **`overflow: hidden` on html,body** — `style.css:28-31` forces every content page to override in its own `<style>` block.

### Medium Priority

- [ ] **Zero SEO metadata** — No `<meta name="description">`, OG tags, Twitter cards, or favicon on any page.
- [ ] **External image hotlinked from rhizome.org** — `style.css:47`, `index.html:76`, `design.html:104,414`. Should be a local asset.
- [ ] **596 lines of inline CSS in design.html** — Plus 30-80 lines duplicated per content page. Move shared rules to `style.css`.
- [ ] **Footer drift across pages** — "GPL-3.0" vs "GPL-3.0 License", `target="_blank"` inconsistent, version present on 4 of 7 pages.
- [ ] **No responsive breakpoints for design.html mockup** — 1100px device at 0.65 scale has zero `@media` queries.
- [ ] **proto.html doesn't load the shared stylesheet** — Different font stack, won't inherit global fixes.
- [ ] **Accent color fails WCAG AA** — `#5ba8d4` on white is ~3.1:1 contrast. AA requires 4.5:1.

### Lower Priority

- [ ] **Heading class names inconsistent** — `section-heading` (analysis) vs `section-header` (design, ise).
- [ ] **`<title>` format inconsistent** — "Page - Oh My Ondas" vs "About Oh My Ondas" vs em-dash variant.
- [ ] **No `aria-label` on `<nav>`** — No skip-navigation links, no `<main>` in proto.html.
- [ ] **`target="_blank"` links missing `rel="noopener noreferrer"`** — about, ise, sdlc, analysis.
- [ ] **proto.html uses deprecated implicit `event` global** — Line 742 will throw in strict mode.
- [ ] **ISE page contains placeholder content** — Moco, CaixaForum+, Lavinia cards say "Challenge TBC".
- [ ] **ISE page publishes personal contact names/positions** — Possible GDPR / professional concern.
