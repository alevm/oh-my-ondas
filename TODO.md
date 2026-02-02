# fix/website — Scoped TODO

Branch: `fix/website`
Scope: All website pages — navigation, footers, content, SEO, inline HTML structure.

## Files you own
- `web/about.html`
- `web/design.html` (HTML structure and inline `<style>` only)
- `web/ise.html`
- `web/sdlc.html`
- `web/analysis.html`
- `web/proto.html`
- `web/index.html` (HTML content only — footer, info-bar, DIY panel, nav)
- `web/app.html` (footer and CSS version string only)

## DO NOT touch
- `web/css/style.css` (owned by fix/css-a11y)
- `web/js/*.js` (owned by fix/runtime-bugs)
- `web/index.html` inline CSS or device layout (owned by fix/css-a11y)

---

## High Priority

- [ ] **ise.html footer links to wrong GitHub repo** — Line 334 links to `manuelvargasmontero/ohmyondas`. Change to `alevm/oh-my-ondas`.
- [ ] **ise.html navigation is different** — 5-link nav missing "SDLC" and "Analysis". Align to the standard 6-link nav. Decide whether to add ISE to all pages or keep it unlisted.
- [ ] **proto.html is fully orphaned** — Has custom nav with no links to rest of site. Either integrate into main nav or add a back-link.
- [ ] **CSS cache-buster versions desynchronized** — `index.html` `?v=253`, `app.html` `?v=249`, others `?v=248`. Unify to same version across all pages.
- [ ] **Version strings missing from 3 footers** — Add `v2.5.2` to `about.html`, `sdlc.html`, `analysis.html` footers.
- [ ] **Footer drift across pages** — Standardize: "GPL-3.0 License" everywhere, consistent `target="_blank"`, same format.

## Medium Priority

- [ ] **Zero SEO metadata** — Add to every page: `<meta name="description">`, `<meta property="og:title">`, `og:description`, `og:image`, `<link rel="icon">`.
- [ ] **External image hotlinked from rhizome.org** — Download `Chombart-de-Lauwe.jpg` to local assets. Update references in `index.html:76`, `design.html:104,414`. (Note: `style.css:47` reference is owned by fix/css-a11y.)
- [ ] **Inline CSS duplication** — Extract shared `.page-container`, `.page-content`, `.page-title` rules from all content pages into a request for fix/css-a11y to add them to `style.css`. Then remove the duplicated blocks from each page's `<style>`.
- [ ] **design.html has 596 lines of inline CSS** — Move reusable rules to shared stylesheet (coordinate with fix/css-a11y). Keep only page-specific overrides inline.
- [ ] **No responsive breakpoints for design.html mockup** — Add `@media` queries for the 1100px device at 0.65 scale (inline in design.html is fine since it's page-specific).
- [ ] **proto.html doesn't load the shared stylesheet** — Add `<link rel="stylesheet" href="css/style.css">` and reconcile font stack.
- [ ] **`overflow: hidden` workaround** — Each content page overrides `body { overflow: auto }`. Once fix/css-a11y scopes `overflow: hidden` to the app, these overrides can be removed.

## Lower Priority

- [ ] **Heading class names inconsistent** — Unify `section-heading` (analysis) and `section-header` (design, ise) to one name.
- [ ] **`<title>` format inconsistent** — Standardize to `PageName — Oh My Ondas` across all pages.
- [ ] **No `aria-label` on `<nav>`** — Add `aria-label="Main navigation"` to all `<nav>` elements.
- [ ] **No skip-navigation links** — Add hidden skip-to-content link in header.
- [ ] **No `<main>` in proto.html** — Wrap content in `<main>`.
- [ ] **`target="_blank"` links missing `rel="noopener noreferrer"`** — Fix in about, ise, sdlc, analysis.
- [ ] **proto.html uses deprecated implicit `event` global** — Line 742: pass event parameter explicitly.
- [ ] **ISE page contains placeholder content** — Moco, CaixaForum+, Lavinia say "Challenge TBC". Either flesh out or mark clearly as speculative.
- [ ] **ISE page publishes personal contact names** — Consider removing or anonymizing.
- [ ] **Accent color fails WCAG AA** — `#5ba8d4` on white is ~3.1:1. Pick a darker shade (coordinate with fix/css-a11y for the CSS variable).

## Coordination with other branches

- After fix/css-a11y scopes `overflow: hidden` and `user-select: none`, remove the per-page overrides.
- After fix/css-a11y adds `.page-container`/`.page-content`/`.page-title` to style.css, strip the inline duplicates.
- After fix/css-a11y changes the accent color variable, verify link colors still look right.
