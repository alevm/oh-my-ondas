# Oh My Ondas - Firmware

Embedded firmware for the Oh My Ondas portable music instrument.

## Structure

```
firmware/
├── platformio.ini      # PlatformIO build configuration
├── requirements.txt    # Python dependencies for tools
├── teensy/             # Teensy 4.1 main processor firmware
│   ├── main.ino
│   ├── sampling_engine.cpp
│   ├── sequencer.cpp
│   └── include/        # Header files
├── esp32/              # ESP32 WiFi/GPS module firmware
│   └── main.cpp
└── tools/              # Python utilities
    ├── sample_converter.py
    └── metadata_generator.py
```

## Build

Requires [PlatformIO](https://platformio.org/).

```bash
# Install PlatformIO
pip install platformio

# Build Teensy 4.1 firmware
pio run -e teensy41

# Build ESP32 firmware
pio run -e esp32

# Upload to Teensy
pio run -e teensy41 --target upload
```

## Python Tools

```bash
pip install -r requirements.txt
python tools/sample_converter.py --help
python tools/metadata_generator.py --help
```

## Hardware

- **Teensy 4.1** - Main processor (600MHz ARM Cortex-M7, 1MB RAM)
- **ESP32-WROOM** - WiFi, Bluetooth, GPS communication
- **Audio Shield** - SGTL5000 codec (44.1kHz / 24-bit)
- **MPR121** - 8 capacitive touch pads
- **SSD1306** - 128x64 OLED display

See [docs/technical/component_pinout.md](../docs/technical/component_pinout.md) for pin assignments.
