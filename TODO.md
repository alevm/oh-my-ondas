# Oh My Ondas — Combined TODO

Merged from branches: `fix/css-a11y`, `fix/runtime-bugs`, `fix/website`

---

## CSS & Accessibility (from fix/css-a11y)

### Device Mockup Layout (index.html)

- [ ] **Device mockup is 1100x700px fixed** — No media queries in 850 lines of inline CSS. Add responsive scaling (e.g. `transform: scale()` with viewport-based breakpoints, or `clamp()`/`vw` units).
- [ ] **Encoders and crossfader need touch events** — Add `touchstart`/`touchmove`/`touchend` handlers alongside mouse events in the inline `<script>`.
- [ ] **PostMessage wildcard in index.html:861** — Restrict origin.

### style.css — Dead / Stale Rules

- [ ] **All responsive CSS targets stale class names** — `style.css:1194-1320` styles `.top-bar`, `.col-mixer`, `.col-seq`, `.col-mid`, `.col-right`, `.pads-section`. None exist in current DOM. Rewrite to match actual class names or remove.
- [ ] **Second breakpoint also stale** — `style.css:1246-1320` same problem at 480px.
- [ ] **Dead selectors for removed components** — `.transport` (line 89), `.rec-panel` (221-226), `.map-panel` (790), `.map-box` (791). Remove.
- [ ] **Duplicate `.ch-btns` rule** — Lines 383 and 546. Merge into one.
- [ ] **Embedded mode references wrong transport classes** — `style.css:1572-1674` hides/shows elements that don't match current embedded HTML. Align.

### style.css — Global Rules That Hurt Content Pages

- [ ] **`user-select: none` on everything** — `style.css:8` `* { user-select: none }`. Scope to `.device` and app-specific elements only. Content pages need text selection.
- [ ] **`overflow: hidden` on html,body** — `style.css:28-31`. Scope to `body.app-mode` or `.device` context. Content pages shouldn't need to override this.

### style.css — Accessibility

- [ ] **No focus indicators** — Add `:focus-visible` styles for all interactive elements (buttons, pads, encoders, sliders, nav links).
- [ ] **No ARIA support styles** — Add styles for `[aria-pressed="true"]`, `[aria-expanded]`, etc. so that when ARIA attributes are added, they have visual representation.
- [ ] **Accent color fails WCAG AA** — `--accent: #5ba8d4` on white is ~3.1:1. Change to a darker value (e.g. `#3a8bbf` or similar) that passes 4.5:1.

### style.css — Add Shared Content Page Rules

- [ ] **Add `.page-container`, `.page-content`, `.page-title` to style.css** — Currently copy-pasted into every content page's `<style>`. Define once in the shared stylesheet.
- [ ] **Add content page responsive breakpoints** — Current `@media` rules only target app elements. Add rules for `.page-content` at 768px and 480px.

### style.css — External Asset

- [ ] **Rhizome.org image in style.css:47** — `background-image: url('https://media.rhizome.org/...')`. Update to local path once the asset is downloaded.

---

## Runtime & JS Bugs (from fix/runtime-bugs)

### Critical Bugs

- [ ] **GPS property mismatch in radio.js** — `radio.js:139,174` reads `gps.lat`/`gps.lng` but `gps.js:76-84` stores `.latitude`/`.longitude`. Fix to use correct property names.
- [ ] **scenes.js references nonexistent DOM IDs and App methods** — `applyState()` looks for `seqTempo`, `seqTempoDisplay`, `tempoValue`, `delayTime`, etc. None exist. Also calls `updateStepGrid()`, `updateTrackOverview()`, `updateSourceRouting()` which don't exist. Fix all references.
- [ ] **ai-composer.js same problem** — `surprise()` and `generateArrangement()` reference stale DOM IDs and nonexistent App methods. Fix all references.
- [ ] **landmark.js calls nonexistent RadioPlayer methods** — `tuneLocalRadio()` calls `scanLocalStations()` (should be `searchLocalStations()`) and `getStations()` (doesn't exist). Also stale DOM IDs.
- [ ] **setupTransport binds wrong button IDs** — `app.js:170-173` looks for `btnPlay2`/`btnStop2`/`btnRecord2`. Actual IDs are `btnPlayE`/`btnStopE`/`btnRecordE`.
- [ ] **Null-check crashes in app.js** — Add guards in `setupFX` (2353), `setupSynth` (1918), `setupAdminModal` (3078), `setupRadio` (2817).

### Functional Issues

- [ ] **Sequencer uses `setInterval`** (`sequencer.js:212`) — Replace with `AudioContext.currentTime` lookahead scheduler.
- [ ] **Swing stored but never applied** — Implement swing timing offset in `tick()` for even/odd steps.
- [ ] **Pads 8-15 can't receive samples** — `sampler.js:272` caps at 8. Expand `pads` array to 16.
- [ ] **Kit switching is a stub** — `sampler.js:308` `setBank()` must load actual audio files.
- [ ] **3 of 4 punch FX are stubs** — Implement `setReverse()`, `setFilterSweep()`, `setTapeStop()` in `mangle.js`.
- [ ] **Bit crusher not implemented** — Add AudioWorklet or ScriptProcessor fallback in `mangle.js`.
- [ ] **Pan encoder does nothing in default mode** — Wire `app.js:1511-1513` to master or sampler pan.
- [ ] **analysis.js is dead code in app.html** — Remove the `<script>` include from `app.html`, or guard with page detection.

### Architecture / Memory / Performance

- [ ] **Audio node leaks in synth** — Disconnect filter/gain nodes in note release.
- [ ] **VU meter animation never cancelled** — Add `cancelAnimationFrame` when not needed.
- [ ] **State publishing interval never cleared** — Add `clearInterval` mechanism.
- [ ] **Oscilloscope draws when hidden** — Only run `requestAnimationFrame` when synth panel visible.
- [ ] **getMeterLevel allocates per frame** — Reuse a single `Uint8Array` buffer.
- [ ] **Recorder blob URLs never revoked** — Call `URL.revokeObjectURL()` after download.
- [ ] **FX bypass channel routing** — Route `mangle.js` output through per-channel gain/EQ, not directly to master.
- [ ] **Arrangement overwrites sequencer callback** — Save and restore original callback.

### Security

- [ ] **XSS via innerHTML** — Replace `innerHTML` with `textContent` in `landmark.js:873` and `app.js:2795-2799` (radio station names).
- [ ] **No rate limiting on Nominatim** — Add throttle (1 req/sec max) in `journey.js` and `landmark.js`.
- [ ] **PostMessage uses wildcard origin** — Restrict to same-origin in `app.js:1335` and `index.html:861`.

### Race Conditions

- [ ] **landmark.js auto-initializes before app.init()** — Defer GPS/API calls until after AudioContext is ready.
- [ ] **Dual init paths in embedded mode** — Add proper mutex/flag in `app.js:3296-3327`.
- [ ] **Mic request without user gesture** — Ensure `getUserMedia()` only fires from user-initiated events.

---

## Website Pages (from fix/website)

### High Priority

- [ ] **ise.html footer links to wrong GitHub repo** — Line 334 links to `manuelvargasmontero/ohmyondas`. Change to `alevm/oh-my-ondas`.
- [ ] **ise.html navigation is different** — 5-link nav missing "SDLC" and "Analysis". Align to the standard 6-link nav. Decide whether to add ISE to all pages or keep it unlisted.
- [ ] **proto.html is fully orphaned** — Has custom nav with no links to rest of site. Either integrate into main nav or add a back-link.
- [ ] **CSS cache-buster versions desynchronized** — `index.html` `?v=253`, `app.html` `?v=249`, others `?v=248`. Unify to same version across all pages.
- [ ] **Version strings missing from 3 footers** — Add `v2.5.2` to `about.html`, `sdlc.html`, `analysis.html` footers.
- [ ] **Footer drift across pages** — Standardize: "GPL-3.0 License" everywhere, consistent `target="_blank"`, same format.

### Medium Priority

- [ ] **Zero SEO metadata** — Add to every page: `<meta name="description">`, `<meta property="og:title">`, `og:description`, `og:image`, `<link rel="icon">`.
- [ ] **External image hotlinked from rhizome.org** — Download `Chombart-de-Lauwe.jpg` to local assets. Update references in `index.html:76`, `design.html:104,414`, `style.css:47`.
- [ ] **Inline CSS duplication** — Extract shared `.page-container`, `.page-content`, `.page-title` rules from all content pages into `style.css`. Then remove the duplicated blocks from each page's `<style>`.
- [ ] **design.html has 596 lines of inline CSS** — Move reusable rules to shared stylesheet. Keep only page-specific overrides inline.
- [ ] **No responsive breakpoints for design.html mockup** — Add `@media` queries for the 1100px device at 0.65 scale.
- [ ] **proto.html doesn't load the shared stylesheet** — Add `<link rel="stylesheet" href="css/style.css">` and reconcile font stack.
- [ ] **`overflow: hidden` workaround** — Each content page overrides `body { overflow: auto }`. Once `overflow: hidden` is scoped to the app, these overrides can be removed.

### Lower Priority

- [ ] **Heading class names inconsistent** — Unify `section-heading` (analysis) and `section-header` (design, ise) to one name.
- [ ] **`<title>` format inconsistent** — Standardize to `PageName — Oh My Ondas` across all pages.
- [ ] **No `aria-label` on `<nav>`** — Add `aria-label="Main navigation"` to all `<nav>` elements.
- [ ] **No skip-navigation links** — Add hidden skip-to-content link in header.
- [ ] **No `<main>` in proto.html** — Wrap content in `<main>`.
- [ ] **`target="_blank"` links missing `rel="noopener noreferrer"`** — Fix in about, ise, sdlc, analysis.
- [ ] **proto.html uses deprecated implicit `event` global** — Line 742: pass event parameter explicitly.
- [ ] **ISE page contains placeholder content** — Moco, CaixaForum+, Lavinia say "Challenge TBC". Either flesh out or mark clearly as speculative.
- [ ] **ISE page publishes personal contact names** — Consider removing or anonymizing.
