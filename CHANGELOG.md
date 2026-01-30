# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2026-01-30

### Repository Restructuring

This release reorganizes the project from three separate `oh-my-box-*` directories
into a clean, professional repository layout with full CI/CD.

#### Changed
- Renamed project from "Oh My Box" to "Oh My Ondas"
- Flat directory structure: `web/`, `firmware/`, `tests/`, `docs/`
- All internal references updated (`oh-my-box` -> `oh-my-ondas`, `ohmybox` -> `ohmyondas`)
- License changed from MIT to GPL-3.0
- Tests support `TEST_URL` environment variable for CI compatibility

#### Added
- Root `README.md` with badges and quick start
- `LICENSE` (GPL-3.0 full text)
- `CONTRIBUTING.md` with development guidelines
- `.editorconfig` for consistent formatting
- `.gitignore` (comprehensive)
- Root `package.json` with convenience scripts
- `eslint.config.js` (ESLint 9 flat config for `web/js/`)
- GitHub Actions workflows: lint, test, deploy, firmware build, release
- Sub-READMEs for `web/`, `firmware/`, `tests/`
- `web/samples/.gitkeep`

#### Removed
- Old `oh-my-box-web/`, `oh-my-box-archive/`, `oh-my-box-tests/` directories
- Previous `.git` history (fresh start)
- Build artifacts, test screenshots, demo frame sequences

---

## Web App Changelog

For the detailed web application changelog (v0.7.x through v2.4.6), see
[web/CHANGELOG.md](web/CHANGELOG.md).
