# fix/css-a11y — Scoped TODO

Branch: `fix/css-a11y`
Scope: Shared stylesheet, responsive layout, accessibility, device mockup CSS/HTML layout.

## Files you own
- `web/css/style.css`
- `web/index.html` (inline CSS and HTML layout — enclosure, encoders, pads, crossfader, transport, sensors, mockup structure, touch event handlers in inline script)

## DO NOT touch
- `web/js/*.js` (owned by fix/runtime-bugs)
- `web/about.html`, `web/design.html`, `web/ise.html`, `web/sdlc.html`, `web/proto.html`, `web/analysis.html` (owned by fix/website)
- `web/app.html` JS logic (owned by fix/runtime-bugs)

---

## Device Mockup Layout (index.html)

- [ ] **Device mockup is 1100x700px fixed** — No media queries in 850 lines of inline CSS. Add responsive scaling (e.g. `transform: scale()` with viewport-based breakpoints, or `clamp()`/`vw` units).
- [ ] **Encoders and crossfader need touch events** — Add `touchstart`/`touchmove`/`touchend` handlers alongside mouse events in the inline `<script>`.
- [ ] **PostMessage wildcard in index.html:861** — Restrict origin. (Coordinate with fix/runtime-bugs for the app.js side.)

## style.css — Dead / Stale Rules

- [ ] **All responsive CSS targets stale class names** — `style.css:1194-1320` styles `.top-bar`, `.col-mixer`, `.col-seq`, `.col-mid`, `.col-right`, `.pads-section`. None exist in current DOM. Rewrite to match actual class names or remove.
- [ ] **Second breakpoint also stale** — `style.css:1246-1320` same problem at 480px.
- [ ] **Dead selectors for removed components** — `.transport` (line 89), `.rec-panel` (221-226), `.map-panel` (790), `.map-box` (791). Remove.
- [ ] **Duplicate `.ch-btns` rule** — Lines 383 and 546. Merge into one.
- [ ] **Embedded mode references wrong transport classes** — `style.css:1572-1674` hides/shows elements that don't match current embedded HTML. Align.

## style.css — Global Rules That Hurt Content Pages

- [ ] **`user-select: none` on everything** — `style.css:8` `* { user-select: none }`. Scope to `.device` and app-specific elements only. Content pages need text selection.
- [ ] **`overflow: hidden` on html,body** — `style.css:28-31`. Scope to `body.app-mode` or `.device` context. Content pages shouldn't need to override this.

## style.css — Accessibility

- [ ] **No focus indicators** — Add `:focus-visible` styles for all interactive elements (buttons, pads, encoders, sliders, nav links).
- [ ] **No ARIA support styles** — Add styles for `[aria-pressed="true"]`, `[aria-expanded]`, etc. so that when fix/runtime-bugs adds ARIA attributes, they have visual representation.
- [ ] **Accent color fails WCAG AA** — `--accent: #5ba8d4` on white is ~3.1:1. Change to a darker value (e.g. `#3a8bbf` or similar) that passes 4.5:1.

## style.css — Add Shared Content Page Rules

- [ ] **Add `.page-container`, `.page-content`, `.page-title` to style.css** — Currently copy-pasted into every content page's `<style>`. Define once in the shared stylesheet so fix/website can remove inline duplicates.
- [ ] **Add content page responsive breakpoints** — Current `@media` rules only target app elements. Add rules for `.page-content` at 768px and 480px.

## style.css — External Asset

- [ ] **Rhizome.org image in style.css:47** — `background-image: url('https://media.rhizome.org/...')`. Update to local path once fix/website downloads the asset.

## Coordination with other branches

- After scoping `overflow: hidden` and `user-select: none`, notify fix/website so they can remove per-page overrides.
- After adding `.page-container`/`.page-content`/`.page-title` to style.css, notify fix/website so they can strip inline duplicates.
- After changing the accent color variable, notify fix/website to verify link colors.
- Touch event handlers in index.html inline script are borderline with fix/runtime-bugs. Keep here since they live inline alongside the CSS.
