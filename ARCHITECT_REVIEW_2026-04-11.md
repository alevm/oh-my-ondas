# ARCHITECT REVIEW — Oh My Ondas
**Date:** 2026-04-11
**Reviewer:** Architect (maximum-severity due-diligence pass)
**Target:** `/home/anv/Current/OhMyOndas/`
**HEAD:** `8c5811a` (main, dirty tree: 15 modified, 6 untracked)

---

## 1) PM — **CONCERNING**

**Findings**
- **Version chaos.** `VERSION` = `1.0.0`, `README.md:6` badge = `1.0.0`, `package.json:3` = `2.5.2`, `TODO.md:100` references `v2.5.2`, `web/CHANGELOG.md` implied `v0.7.x–v2.4.6`. Three sources of truth, none agree.
- **Dirty working tree shipped as "release".** 15 modified files uncommitted (`README.md`, `CHANGELOG.md`, `LICENSE`, `package.json`, `docs/CLAUDE.md`, 4 mockup HTMLs, `web/js/demo-mode.js`), 6 untracked (`INTENT.md`, `LICENSE-*`, 3 demo MP4s). No release discipline.
- **TODO.md is a bug backlog, not a roadmap.** 9KB of items grouped "Critical Bugs", "Security", "Race Conditions", "Website Pages". No owners, no dates, no priorities beyond "High/Medium/Lower". (`TODO.md:47–123`)
- **No issue tracker link, no milestones, no changelog entry since 2026-01-30** (3+ months stale in `CHANGELOG.md:5`).
- **Scope sprawl.** README pitches "8-track sequencer + 16 pads + synth + internet radio + 5-ch mixer + scenes + AI composition + GPS + session recording" — this is 8 products. No MVP cut.
- **Three licenses** (`LICENSE-SOFTWARE`, `LICENSE-HARDWARE`, `LICENSE-DOCS`) but root `README.md:23` says `AGPL-3.0-only` and badge still says AGPL v3; tri-license boundary not explained to contributors. `CONTRIBUTING.md` does not mention DCO/CLA for tri-licensed work.

**Recommendations**
1. Freeze one version source. Kill `VERSION`, kill `package.json.version`, use git tags + `CHANGELOG.md`.
2. Convert `TODO.md` to GitHub Issues with labels (`bug/critical`, `security`, `a11y`, `firmware`) — it is currently unqueryable.
3. Define MVP cut: sequencer + sampler + scenes. Park radio, AI, GPS, journey behind a "labs" flag.
4. Commit or discard the dirty tree **today**.

---

## 2) SRE — **CONCERNING**

**Findings**
- **Repo is 851 MB on disk.** `.git` is 12 MB (fine). The bloat is: `firmware/arduino-ide.AppImage` = **192 MB** (untracked but in working tree), `2026-02-19 15-50-34.mp4` = **110 MB** (untracked), `ohmyondas-sonar-demo-2026*.mp4` = ~13 MB (untracked), `node_modules` 27 MB, `tests/` 62 MB, `firmware/` 204 MB including `.pio/`. `.gitignore:62` excludes `*.AppImage` but a 192 MB AppImage in a source tree is a smell regardless.
- **GitHub Pages deploy (`deploy.yml`) uploads the entire `web/` directory** including `web/samples/` — and samples are explicitly gitignored (`.gitignore:50–55`), meaning the deployed site is **structurally different from what's in git**. CI-only assets drift.
- **No CI caching.** `test.yml:25` runs `npm ci` cold every run. `firmware.yml:33` `pip install platformio` cold every run. Each push burns minutes needlessly.
- **`test.yml:30` uses `sleep 2` after backgrounding `python3 -m http.server`** — classic race. No health-check loop. Will flake on cold runners.
- **No artifact retention strategy.** `test.yml:45` retains screenshots 7 days, `firmware.yml:50` retains firmware 30 days — firmware bin is the thing you'd actually want long-term, 30 days is too short.
- **No environment matrix for Node.** Hardcoded Node 20 in `test.yml:18` and `lint.yml:17`, Python 3.12 in `test.yml:22`. No lower-bound test.
- **`release.yml:34`** packages `web/` by shelling `cd web && zip -r ...` — swallows failures under `set -e` absence (no `set -e` in the step at all; `softprops/action-gh-release@v2` will still succeed with a partial zip).
- **No Dockerfile, no docker-compose, no reproducible dev env.** Firmware needs `pio`, Python needs `flake8`, Node needs ESLint 9 — every contributor reproduces this by hand.
- **No observability.** Static site, no telemetry, no error reporting, no uptime check. If the live demo (https://alevm.github.io/oh-my-ondas/) breaks, nobody knows.
- **`SISYPHUS_DEPLOYMENT.md:104`** references a `.sisyphus-token` file and an incidents endpoint — but no evidence this project is actually onboarded to Sisyphus (no `.sisyphus-token` in tree, no check in CI).

**Recommendations**
1. `git clean -fdx firmware/arduino-ide.AppImage demo/output *.mp4` and add those to `.gitignore` properly. Do not check 192 MB AppImages into source-adjacent working trees.
2. Add `actions/cache@v4` for `~/.npm`, `~/.platformio`, `~/.cache/pip` in all three workflows. Expect 40–70% runtime reduction.
3. Replace `sleep 2` in `test.yml:30` with `curl --retry 10 --retry-delay 1 http://localhost:8080`.
4. Add a `Dockerfile.dev` or `devcontainer.json` so a fresh clone produces a working build in one command.
5. Pin actions to SHA, not floating tags (`actions/checkout@v4` → `@<sha>`). Supply-chain hardening.

---

## 3) DEV — **CRITICAL**

**Findings**
- **`TODO.md` itself documents the codebase is broken.** I am not extrapolating — the file explicitly lists:
  - `radio.js:139,174` reads `gps.lat`/`gps.lng`, but `gps.js:76–84` writes `.latitude`/`.longitude`. **Feature is dead.**
  - `scenes.js applyState()` references nonexistent DOM IDs and nonexistent `App` methods. **Feature is dead.**
  - `ai-composer.js surprise()` / `generateArrangement()` — same. **Feature is dead.**
  - `landmark.js tuneLocalRadio()` calls `scanLocalStations()` (doesn't exist) and `getStations()` (doesn't exist). **Feature is dead.**
  - `app.js:170–173 setupTransport()` binds `btnPlay2`/`btnStop2`/`btnRecord2` — real IDs are `btnPlayE`/`btnStopE`/`btnRecordE`. **Transport broken in embedded mode.**
  - `sampler.js:272` caps pads at 8; 8 of 16 pads receive nothing. **Half the feature is stubbed.**
  - `sampler.js:308 setBank()` is a stub. **Kit switching doesn't work.**
  - 3 of 4 punch FX (`setReverse`, `setFilterSweep`, `setTapeStop`) are stubs (`mangle.js`).
  - Bit crusher not implemented.
  - Pan encoder wired to nothing (`app.js:1511–1513`).
  - `analysis.js` is dead code in `app.html`.
- **Author knows these bugs and the README still advertises the features.** `README.md:46–54` lists "AI-assisted pattern generation", "GPS tracking and location-bound recordings", "Session recording and playback" — three of those are in the broken list above.
- **`web/js/app.js` is 3776 lines.** (`wc -l web/js/app.js`) God object. No module boundaries. `sequencer.js` 851 lines. `landmark.js` 918 lines. `demo-mode.js` 903 lines.
- **Sequencer uses `setInterval`** (`sequencer.js:212` per TODO). Anybody who has built an audio scheduler knows this is wrong — must use `AudioContext.currentTime` lookahead (Wilson 2013). Timing will drift and jitter.
- **Audio node leaks** (synth filter/gain never disconnected), **animation frame leaks** (VU meter, oscilloscope), **blob URL leaks** (`URL.revokeObjectURL` never called). Memory grows until tab dies.
- **ESP32 firmware `firmware/esp32/main.cpp` is 64 lines.** Total. With WiFi + GPS + "Claude API key" in a global `const char*`. No reconnect logic (`main.cpp:33–37` blocks forever on first connect), no watchdog, no WiFi disconnect handler, no HTTPS verification.
- **Teensy main.ino is 875 lines** — monolithic `.ino` with all audio graph wired globally. No graceful error path on SD card mount failure, no recovery from I2C (MPR121) bus errors (commit `ec73878` claims it was fixed — good — but monolithic architecture remains).
- **Build flag `-Wl,--allow-multiple-definition`** (`platformio.ini:28`) is a "make the linker shut up" hack to work around ILI9341_t3 + Adafruit GFX both defining `Adafruit_GFX_Button`. This will silently link the wrong symbol and is a latent field crash.
- **No unit tests for firmware.** `firmware/teensy/test/` exists but the build instruction at `platformio.ini:64–72` is to rename files manually. That is not a test suite.
- **No unit tests for web JS.** Only Puppeteer E2E (`tests/e2e/*.js`, 5444 LOC) — these are slow, brittle, and don't exercise audio-graph correctness.
- **ESLint config is single-rule default** (`eslint.config.js`, 17 lines, ESLint 9 flat default). No `no-unused-vars`, no `no-undef`, no complexity caps. TODO.md bugs (stale DOM IDs, nonexistent methods) would all be caught by `no-undef` + typed JSDoc.

**Recommendations**
1. **STOP shipping.** Nothing should go out on `main` until the "Critical Bugs" section of `TODO.md` is zero. This is table stakes.
2. Port `web/js/` to TypeScript. Even loose `tsc --checkJs --noEmit` with JSDoc would have caught every method-not-found bug in `TODO.md:49–54`.
3. Replace `setInterval` sequencer with Web Audio lookahead scheduler. Non-negotiable for an audio product.
4. Split `app.js` (3776 LOC) into modules: `transport`, `ui-bindings`, `persistence`, `embedded-bridge`.
5. Firmware: resolve the `--allow-multiple-definition` properly (pin one GFX lib, patch the other). Add unit tests via Teensy native build or PIO test framework.
6. Delete `firmware/arduino-ide.AppImage` (192 MB) from the working tree.

---

## 4) Solution Architect — **CONCERNING**

**Findings**
- **System has three planes that don't meet**: (a) web prototype (Web Audio API, runs in browser), (b) Teensy firmware (4010 LOC of audio DSP), (c) ESP32 firmware (64 LOC of WiFi/GPS/"Claude API"). There is **no contract, no shared schema, no protocol spec** between them. The ESP32 prints JSON to Serial (`main.cpp:55–62`); nobody documents who reads it.
- **"AI-assisted pattern generation"** is pitched in README + firmware. Where does the model run? ESP32 with Claude API key on-device, or web-side with a backend proxy, or offline model? Not decided. `firmware/esp32/main.cpp:14 const char* CLAUDE_API_KEY = "your_key"` implies on-device direct-to-Anthropic — which is an anti-pattern (key extractable, no rate limit, no cost control, no abuse mitigation).
- **Web ↔ firmware relationship is unclear.** Is the web app (a) a prototype that will be replaced by firmware, (b) a remote UI to the hardware, (c) a marketing demo? README says "web prototype" and "includes a fully functional web prototype" — two different answers in one paragraph. `docs/technical/DUAL_MODE_INTERACTION.md` exists; not audited here, but the root README doesn't cite it.
- **GPS/location is a core pillar of the product identity** ("location-aware portable music instrument") but lives half in ESP32 (reading GPS), half in web `js/gps.js` (navigator.geolocation), with conflicting property names (`TODO.md:49`).
- **No architectural decision records** (`docs/` has product/, technical/, design/, testing/, ise/, hardware/, visuals/ — zero `decisions/` or `adr/`).

**Recommendations**
1. Write one page: "system context" (C4 level 1). Who talks to whom, over what, with what payload.
2. Decide: is the browser prototype the canonical spec, or the firmware? Pick one as source of truth for audio graph, scene model, sequencer semantics.
3. Move Claude API calls behind a backend proxy. Never ship a user-held Anthropic key. Ever.

---

## 5) Software Architect — **CONCERNING**

**Findings**
- **No layering.** `web/js/` is a flat bag of 19 files sharing a global `App` object. No DI, no interfaces, no boundaries. Files cross-reference by global-window lookups (that's how `scenes.js` and `ai-composer.js` managed to go stale without the build breaking).
- **No types.** `package.json` has no `typescript`, no JSDoc type-check script. ESLint 9 default rules won't catch dead refs.
- **Event model is implicit.** `postMessage` used with wildcard origin (`app.js:1501`, `app.js:1982`, `demo-mode.js:164`, `mockup-orange.html:799`) — no schema, no versioning, no origin restriction.
- **Firmware mirrors the same problem** — `main.ino` instantiates every audio object as a file-scope global and wires them in `setup()`. No encapsulation, no testability, no mocking seam.
- **`web/js/app.js:3776` and `sequencer.js:851`** are the two hotspots. Complexity debt is concentrated.
- **Dead code retained.** `TODO.md:65` notes `analysis.js` is dead code in `app.html`. It's still `<script>`-included. `firmware/teensy/test/` is a parallel main.ino that only builds if a human manually `mv`s files.

**Recommendations**
1. Introduce module boundaries (ES modules with explicit imports, not `<script>` soup). This alone would kill the "stale DOM ID" class of bug because undefined identifiers become build errors.
2. Adopt JSDoc `@ts-check` or migrate to TypeScript. Cheapest win with highest leverage.
3. Put the audio scheduler behind an interface so it can be unit-tested without a browser.

---

## 6) System Architect — **CONCERNING**

**Findings**
- **Target hardware is Teensy 4.1 + ESP32 + Audio Shield + 5" LCD + 13 encoders + 19 buttons + MPR121 touch + NeoPixel + OLED map + joystick + crossfader.** (`main.ino:1–7`, `platformio.ini:35–58`). This is a **physically large, expensive, high-part-count BOM** for a hobbyist product. No mention of enclosure thermals, power budget, battery, or ruggedization for "portable". The word "portable" in the README is aspirational.
- **No power analysis.** Teensy 4.1 @ 600 MHz + WiFi ESP32 + 5" LCD backlight + NeoPixels = easily 2–3 A peak. No battery spec, no charger IC, no fuel gauge in `platformio.ini`.
- **No BOM cost in root docs.** `docs/hardware/music-box-BOM-v3.md` exists (not audited line-by-line). `docs/hardware/diotronic-shopping-list.md` exists. These should roll up to a single cost-of-goods figure for PM.
- **`-O2` with `-D DEBUG=1`** (`platformio.ini:26`) is a build smell — shipping debug-asserted binaries at O2 conflates debug and release. There is no separate release env.
- **`upload_protocol = custom` + `teensy_loader_cli`** (`platformio.ini:61–62`) assumes `/dev/ttyACM0` hardcoded. Works for one dev, breaks for others. Same for ESP32 `/dev/ttyUSB0`.
- **No bootloader strategy, no OTA**, no recovery mode. ESP32 has OTA primitives, they are unused. Once shipped, firmware updates require physical USB access — hostile UX.
- **No hardware abstraction layer.** `input_manager.cpp` (482 LOC) probably talks directly to MPR121/encoders/buttons; a HAL seam would enable host-side unit testing of game logic.

**Recommendations**
1. Publish power budget + thermals + battery spec as part of `docs/hardware/` before any more feature work.
2. Add a proper `release` env in `platformio.ini` with `-Os -DNDEBUG`.
3. Implement ESP32 OTA before first shipment. It is free work you are leaving on the table.

---

## 7) DBA / Data Architect — **N/A** (with one note)

No database. No persistence layer beyond browser `localStorage` (implied by "session recording") and SD card on Teensy. No schema to review.

**One note:** "GPS-bound recordings" and "location-bound playback" imply a spatial index eventually. When you add it, you will want something (SQLite with R-Tree on-device, or GeoJSON+KD-tree in the browser). Do not invent your own. Decide early so file formats don't churn.

---

## 8) Cybersecurity Senior Engineer — **CRITICAL**

**Findings**
- **`firmware/esp32/main.cpp:11–14`:**
  ```cpp
  const char* WIFI_SSID = "your_wifi";
  const char* WIFI_PASS = "your_pass";
  const char* CLAUDE_API_KEY = "your_key";
  ```
  Placeholders today, but the architecture commits you to **baking credentials into firmware**. This is wrong on three counts: (1) WiFi creds burned into flash survive resale/loss; (2) Anthropic API key on a device the attacker owns is **a key you have given the attacker**; (3) no remediation path without OTA.
- **CORS/postMessage wildcard.** `web/js/app.js:1501`, `app.js:1982`, `demo-mode.js:164`, `mockup-orange.html:799` all use `'*'` origin. `index.html:1212` correctly uses `window.location.origin`. `TODO.md:82` flags this. Any site that iframes your demo page can read/write app state.
- **XSS via `innerHTML`.** 8+ sites in `web/js/analysis.js` (`:137,188,220,232,259,296,307,355`) and `web/js/arrangement.js:185,187`. `TODO.md:80` flags `landmark.js:873` and `app.js:2795–2799` injecting radio station names fetched from the Internet Radio Directory. **This is a live XSS sink**: attacker-controlled station metadata → `innerHTML` → JS execution in your origin.
- **Nominatim with no rate limit** (`TODO.md:81`). Violates Nominatim ToS; you will be IP-banned, and a malicious page could weaponize your app to DoS Nominatim from user IPs.
- **`getUserMedia()` without user gesture** (`TODO.md:88`). Browsers reject this, but the code path shows intent to bypass.
- **No Content Security Policy.** No CSP meta, no security headers (static site, can't set headers without a reverse proxy — this is why you use a platform like Sisyphus's Caddyfile).
- **No Subresource Integrity** on any third-party asset. External image `media.rhizome.org/...` is hotlinked (`style.css:47`, `index.html:76`, `design.html:104,414`, flagged in `TODO.md:106`). If rhizome.org is compromised, your site ships their payload — though since it's only an image, risk is lower. Still, hotlinking is not acceptable.
- **HTTP `http://localhost:8080`** is used in CI (`test.yml:31`), fine for tests. No HTTPS dev server for local.
- **No dependency scanning.** No `npm audit` in CI. No Dependabot config (`.github/` has no `dependabot.yml`). `package-lock.json` is 39 KB, 17+ deps transitively; unaudited.
- **Release workflow** (`release.yml`) has `contents: write` — fine, but signs nothing. Firmware binaries are unsigned. Web zip is unsigned. Supply-chain weakness.
- **`.github/workflows/*` actions are floating tags** (`@v4`, `@v5`, `@v2`). A compromised action tag = repo compromise.

**Recommendations**
1. **Immediately:** sanitize all `innerHTML` sinks. Replace with `textContent` or a DOMPurify pass. This is the highest-severity finding.
2. **Immediately:** restrict all `postMessage` calls to `window.location.origin`.
3. **Before any firmware ships:** move Claude API calls to a backend proxy. Zero exceptions.
4. Add `dependabot.yml`, add `npm audit --audit-level=high` step to `lint.yml`.
5. Pin action SHAs.
6. Add CSP via `<meta http-equiv="Content-Security-Policy">` on every HTML page, or via Caddy headers if deployed behind Sisyphus.

---

## 9) UI/UX — **CONCERNING**

**Findings** (most of this is from `TODO.md`, which is the author's own correct self-assessment)
- **Accent color fails WCAG AA.** `style.css:8` `--accent: #5ba8d4` on white ≈ 3.1:1. Below 4.5:1 minimum. (`TODO.md:32`)
- **No focus indicators anywhere.** `TODO.md:30`. Keyboard users are abandoned.
- **`* { user-select: none }`** (`style.css:8`). Globally disables text selection on content pages. Hostile to users who want to copy anything. (`TODO.md:25`)
- **`overflow: hidden` on html/body** (`style.css:28–31`) forces every content page to override it. Symptom of app-CSS leaking into content-CSS. (`TODO.md:26`)
- **Mockup is 1100×700 fixed, 850 lines of inline CSS, zero media queries.** Breaks on every device smaller than a laptop. (`TODO.md:11`)
- **Mouse events only, no touch.** Encoders and crossfader need `touchstart`/`touchmove`/`touchend`. (`TODO.md:12`)
- **Version strings missing from 3 footers** (`about.html`, `sdlc.html`, `analysis.html`). Inconsistent footers across 17 HTML pages.
- **CSS cache-buster query strings desynchronized** across pages (`?v=253`, `?v=249`, `?v=248`). Users get stale CSS.
- **`proto.html` is fully orphaned** — custom nav, no links back. Dead page visible to users.
- **Zero SEO metadata** (no `<meta description>`, no OpenGraph, no favicon on many pages).
- **No `<main>`, no skip-links, no `aria-label` on nav.** Screen reader hostile.
- **`target="_blank"` without `rel="noopener noreferrer"`** — tab-napping vector.
- **17 HTML pages at the web root.** (`about, analysis, app, architecture, assembly, bom, build-log, design, gallery, index, ise, mockup-*, proto, prototype, sdlc`.) This is a site pretending to be an app. Navigation story is unclear: is this a product or a portfolio?

**Recommendations**
1. Fix the WCAG color and focus-indicators today — two CSS changes, instant compliance uplift.
2. Scope `user-select: none` and `overflow: hidden` to `.device` / `body.app-mode`. Stop leaking app styles into content pages.
3. Decide: marketing site or app? If both, put the app under `/app/` and the marketing under `/`. Stop interleaving.

---

## 10) Marketing — **CONCERNING**

**Findings**
- **Positioning is a wall of features, not a promise.** README lists 9 features, pitches to nobody in particular. Who is the user? "Portable music instrument" + "AI composition" + "GPS-bound recordings" is three audiences.
- **No landing page CTA.** `web/index.html` (not line-audited, but implied by the 17-page sprawl) has no "Buy", no "Pre-order", no "Wait-list", no "Docs". There is no conversion goal.
- **Live demo link in README** points to `https://alevm.github.io/oh-my-ondas/` — a personal GitHub account, not a brand. OK for hobby, wrong for product.
- **Brand/name collision.** Project is "Oh My Ondas"; directories used to be "oh-my-box"; `CHANGELOG.md:14` documents the rename; docs still say "Oh My Box" in places (`docs/visuals/oh-my-box-prototype.html`, `docs/visuals/oh-my-box-system-visual.html`). Rename incomplete.
- **Demos are 110 MB MP4s in the repo root** (`2026-02-19 15-50-34.mp4`). Not optimized, not on a CDN, not linked from README. Effort spent, zero reach.
- **No social, no press kit, no logo file referenced, no `og:image`.** `TODO.md:105`.
- **Three licenses** confuse prospective buyers/collaborators. The tri-license model is ideologically coherent (code=AGPL, hardware=CERN, docs=CC) but needs a one-paragraph "why" for non-lawyers.
- **`INTENT.md`** (untracked, 2.5 KB) may hold the positioning — but it's not committed, not linked from README except vaguely (`README.md:78`).

**Recommendations**
1. Pick one audience. Write one sentence. Put it above the feature list in README.
2. Commit `INTENT.md` or delete it.
3. Host the demo video on YouTube/Vimeo, embed in README, remove the MP4s from the working tree.
4. Register a proper domain (`ohmyondas.com` or similar) and a project GitHub org — don't ship a product from a personal namespace.

---

## Executive Summary

**Grade: D+**

This repo is a **competent hobby prototype presented as a v1.0.0 product**. The ambition is enormous (web app + Teensy firmware + ESP32 firmware + hardware BOM + AI + GPS + tri-license) and the execution is incomplete on every axis. The author's own `TODO.md` is a confession of broken features that the README still advertises. Nothing here is unsalvageable — most issues are mechanical — but shipping in the current state would be dishonest.

### Top 3 Critical
1. **XSS via `innerHTML` with attacker-influenced data** — 8+ sinks in `web/js/analysis.js`, plus `landmark.js:873` and `app.js:2795–2799` injecting Internet-fetched radio station names. **Live exploit vector.**
2. **Product advertises features that are dead code.** AI composition (`ai-composer.js` stale refs), GPS/location (`radio.js` ↔ `gps.js` property mismatch, `TODO.md:49`), kit switching (`sampler.js:308` stub), half the sample pads (`sampler.js:272` caps at 8). README = fiction.
3. **ESP32 firmware architecture commits to shipping a user-held Anthropic API key** (`firmware/esp32/main.cpp:14`). This must never ship. Move to backend-proxy now, before the design calcifies.

### Top 3 Quick Wins
1. `git clean -fdx` the 192 MB `firmware/arduino-ide.AppImage` and the 110 MB root-level MP4. Repo drops from 851 MB to ~400 MB.
2. Restrict all `postMessage('*')` → `window.location.origin`. 4-line patch across `app.js`, `demo-mode.js`, `mockup-orange.html`. Closes an entire class of bug.
3. Add `tsc --checkJs --noEmit` with JSDoc `@ts-check` headers on `web/js/*.js` and run it in `lint.yml`. This alone would have caught every "stale DOM ID / nonexistent method" bug in `TODO.md:49–54` at PR time.

### Verdict Matrix
| Persona | Verdict |
|---|---|
| PM | CONCERNING |
| SRE | CONCERNING |
| DEV | **CRITICAL** |
| Solution Architect | CONCERNING |
| Software Architect | CONCERNING |
| System Architect | CONCERNING |
| DBA/Data | N/A |
| Cybersecurity | **CRITICAL** |
| UI/UX | CONCERNING |
| Marketing | CONCERNING |

**Two CRITICALs. Do not tag a release until both are closed.**
