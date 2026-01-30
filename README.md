# Oh My Ondas

[![Lint](https://github.com/alevm/oh-my-ondas/actions/workflows/lint.yml/badge.svg)](https://github.com/alevm/oh-my-ondas/actions/workflows/lint.yml)
[![Tests](https://github.com/alevm/oh-my-ondas/actions/workflows/test.yml/badge.svg)](https://github.com/alevm/oh-my-ondas/actions/workflows/test.yml)
[![License: GPL v3](https://img.shields.io/badge/License-GPL%20v3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Version](https://img.shields.io/badge/version-1.0.0-green.svg)](https://github.com/alevm/oh-my-ondas)

A location-aware portable music instrument combining professional sequencing, audio mangling, AI composition, and GPS-bound recordings. Includes a fully functional web prototype.

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
- 16 sample pads with audio mangling
- Synthesizer with ADSR envelope
- Internet radio integration
- 5-channel mixer with EQ
- Scene system with crossfader
- AI-assisted pattern generation
- GPS tracking and location-bound recordings
- Session recording and playback

## Tech Stack

| Layer    | Technology                          |
|----------|-------------------------------------|
| Web      | HTML / CSS / JavaScript (Web Audio API) |
| Firmware | C++ (Teensy 4.1, ESP32)            |
| Tooling  | Python (utilities), PlatformIO      |

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on submitting issues and pull requests.

## License

This project is licensed under the [GNU General Public License v3.0](https://www.gnu.org/licenses/gpl-3.0).
