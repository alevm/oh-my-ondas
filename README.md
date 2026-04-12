# Oh My Ondas

[![Lint](https://github.com/alevm/oh-my-ondas/actions/workflows/lint.yml/badge.svg)](https://github.com/alevm/oh-my-ondas/actions/workflows/lint.yml)
[![Tests](https://github.com/alevm/oh-my-ondas/actions/workflows/test.yml/badge.svg)](https://github.com/alevm/oh-my-ondas/actions/workflows/test.yml)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Version](https://img.shields.io/badge/version-1.0.0-green.svg)](https://github.com/alevm/oh-my-ondas)

A location-aware portable music instrument combining sequencing, audio mangling, and GPS-aware features. Includes a web prototype and ESP32 firmware scaffolding.

**[Live Demo](https://alevm.github.io/oh-my-ondas/)**

---

## Architecture

```
oh-my-ondas/
├── web/        Static web app (GitHub Pages)
├── firmware/   Embedded firmware (Teensy 4.1 + ESP32)
├── tests/      Puppeteer E2E test suite
└── docs/       Documentation
```

## Quick Start

**Web** -- serve the static app locally:

```bash
cd web && python3 -m http.server 8080
```

**Tests** -- run the end-to-end suite:

```bash
cd tests && npm install && npm test
```

**Firmware** -- build for the Teensy 4.1 target:

```bash
cd firmware && pio run -e teensy41
```

## Key Features

- 8-track sequencer with parameter locks
- 8 sample pads with audio mangling (16 pads planned)
- Synthesizer with ADSR envelope
- Internet radio integration (stream & sample)
- 5-channel mixer with EQ
- Session recording and playback

### Planned / In Progress

- Scene system with crossfader (UI exists, wiring incomplete)
- AI-assisted pattern generation (scaffold only, references stale APIs)
- GPS-bound recordings (GPS capture works, radio-GPS link has property mismatch)
- Kit switching (stub — does not load audio files)
- Punch FX: reverse, filter sweep, tape stop (stubs)

## Tech Stack

| Layer    | Technology                          |
|----------|-------------------------------------|
| Web      | HTML / CSS / JavaScript (Web Audio API) |
| Firmware | C++ (Teensy 4.1, ESP32)            |
| Tooling  | Python (utilities), PlatformIO      |

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on submitting issues and pull requests.

## License

This project uses a tri-license structure:

| Component | License |
|-----------|---------|
| Software & Firmware | [AGPL v3](LICENSE-SOFTWARE) |
| Hardware Designs | [CERN OHL-S v2](LICENSE-HARDWARE) |
| Documentation & Brand | [CC BY-NC-SA 4.0](LICENSE-DOCS) |

See [INTENT.md](INTENT.md) for the philosophy behind this instrument.
