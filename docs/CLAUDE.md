# CLAUDE.md - Claude Code Instructions

## Project: Oh My Ondas

This file provides context and instructions for Claude Code when working on this project.

---

## 🎯 Project Summary

**Oh My Ondas** is a DIY portable music instrument combining:
- Professional sequencing (Octatrack-style)
- Audio mangling (Bastl-style)
- Intuitive interface (Teenage Engineering-style)
- AI composition assistance (Claude API)
- GPS location binding

**Target Cost:** ~€447 DIY
**Target Build Time:** 40-60 hours

---

## 📁 Project Structure

```
OhMyOndas/
├── web/                # Static web app (GitHub Pages)
│   ├── index.html
│   ├── css/style.css
│   ├── js/             # 14 JavaScript modules
│   ├── images/
│   └── samples/
├── firmware/           # Embedded firmware (PlatformIO)
│   ├── platformio.ini
│   ├── teensy/         # Teensy 4.1 firmware (Arduino/C++)
│   ├── esp32/          # ESP32 firmware (Arduino/C++)
│   └── tools/          # Python utilities
├── tests/              # Puppeteer E2E test suite
│   ├── e2e/            # Test scripts
│   └── tools/          # Demo recorders
├── docs/               # Documentation
│   ├── product/        # Product overviews
│   ├── technical/      # Integration, UX, pinout
│   ├── hardware/       # BOM
│   ├── design/         # Design review, requirements
│   ├── visuals/        # Interactive HTML prototypes
│   ├── testing/        # Test docs
│   └── ise/            # ISE 2026 submission
├── .github/workflows/  # CI/CD
├── README.md
├── LICENSE             # GPL-3.0
└── CONTRIBUTING.md
```

---

## 🔧 Development Environment

### Required Tools
- **PlatformIO** - Primary build system
- **Arduino IDE** - Alternative for Teensy
- **Python 3.10+** - For utilities
- **Node.js 18+** - For documentation tools

### Key Dependencies
```bash
# Install PlatformIO
pip install platformio

# Install Python deps
pip install pyserial librosa soundfile numpy

# Teensy tools (Linux)
sudo apt install teensy-loader-cli
```

---

## 🎵 Core Architecture

### Hardware Layers
1. **Teensy 4.1** - Main processor (audio, sequencing, UI)
2. **ESP32** - WiFi, GPS, AI communication
3. **Audio Shield** - SGTL5000 codec
4. **Touch Sensor** - MPR121 (8 pads)
5. **Display** - SSD1306 OLED 128x64

### Software Layers
1. **Audio Engine** - Teensy Audio Library
2. **Sequencer** - Custom 8-track, 16-step
3. **FX Chain** - Modular routing
4. **UI System** - State machine
5. **AI Interface** - HTTP client to Claude API

---

## 📝 Coding Conventions

### C++ (Teensy/ESP32)
```cpp
// Use descriptive names
int sampleBufferIndex;
bool isRecording;

// Constants in UPPER_CASE
const int MAX_TRACKS = 8;
const int SAMPLE_RATE = 44100;

// Classes in PascalCase
class SamplingEngine {
    void triggerSample(int padIndex);
};

// Functions in camelCase
void handleTouchEvent(int pad, bool pressed);
```

### Python
```python
# Use snake_case for functions and variables
def process_audio_file(input_path: str) -> np.ndarray:
    pass

# Classes in PascalCase
class MetadataGenerator:
    pass
```

---

## 🎛️ Pin Assignments (Teensy 4.1)

```
Audio Shield:
  - I2S: 7, 20, 21, 23
  - I2C: 18 (SDA), 19 (SCL)
  - SD Card: Built-in

Touch Sensor (MPR121):
  - I2C: 18 (SDA), 19 (SCL)
  - Address: 0x5A
  - IRQ: Pin 2

Encoders:
  - ENC1: Pins 3, 4 (CLK, DT), 5 (SW)
  - ENC2: Pins 6, 7 (CLK, DT), 8 (SW)
  - ENC3: Pins 9, 10 (CLK, DT), 11 (SW)
  - ENC4: Pins 12, 24 (CLK, DT), 25 (SW)

Buttons:
  - MODE: Pin 26
  - SHIFT: Pin 27
  - REC: Pin 28
  - PLAY: Pin 29

OLED Display:
  - I2C: 18 (SDA), 19 (SCL)
  - Address: 0x3C

ESP32 Communication:
  - Serial2: 16 (RX), 17 (TX)

LEDs:
  - NeoPixel Ring: Pin 30 (8 LEDs)
```

---

## 🔨 Common Tasks

### Build Teensy Firmware
```bash
cd code/teensy
pio run
```

### Upload to Teensy
```bash
pio run --target upload
```

### Build ESP32 Firmware
```bash
cd code/esp32
pio run -e esp32
```

### Run Python Tests
```bash
cd code/python
python -m pytest
```

### Generate Documentation
```bash
npm run docs
```

---

## 🎯 Current Development Focus

### Priority 1: Audio Engine
- Sample playback (8 voices)
- Touch pad triggering
- Basic mixing

### Priority 2: Sequencer
- Step sequencer (8 tracks × 16 steps)
- Pattern storage
- Transport controls

### Priority 3: Effects
- Basic FX chain (reverb, delay, filter)
- Bastl mangling effects
- Parameter control

### Priority 4: Interface
- OLED display
- Encoder handling
- Mode switching

---

## ⚠️ Important Notes

### European Suppliers Only
- **No Amazon or AliExpress** - Use Mouser.es, Farnell, Bricogeek
- Components must be CE compliant
- Consider 21% IVA in pricing

### Audio Considerations
- Use DMA for audio (non-blocking)
- Avoid malloc in audio callbacks
- Target latency: <10ms

### Memory Management
- Teensy 4.1: 1MB RAM, 8MB Flash
- Use PSRAM for sample buffers
- SD card for persistent storage

### Power Budget
- 3500mAh @ 3.7V
- Target: 5-7 hours runtime
- Sleep modes for idle

---

## 📚 Key Documentation Files

1. **DUAL_MODE_INTERACTION.md** - Core interaction paradigm
2. **PRODUCT_OVERVIEW_PRO.md** - Complete feature specification
3. **TE_INSPIRED_UX.md** - Interface design guide
4. **music-box-BOM-v2.md** - Bill of materials

---

## 🐛 Debugging Tips

### Serial Monitor
```cpp
// Use DEBUG macro
#define DEBUG 1
#if DEBUG
  Serial.printf("Sample %d triggered at %lu ms\n", padIndex, millis());
#endif
```

### Audio Debugging
```cpp
// Monitor CPU usage
Serial.printf("CPU: %.2f%%, Memory: %d blocks\n",
              AudioProcessorUsage(),
              AudioMemoryUsage());
```

### I2C Scanning
```cpp
// Scan for I2C devices
Wire.begin();
for (int addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
        Serial.printf("Found device at 0x%02X\n", addr);
    }
}
```

---

## 🔗 Useful Commands

```bash
# Monitor serial output
pio device monitor -b 115200

# Clean build
pio run --target clean

# List connected devices
pio device list

# Check library dependencies
pio pkg list
```

---

*Last updated: December 2025*
