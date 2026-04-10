# Oh My Ondas — Project Instructions

## Overview

Oh My Ondas is a GPS-location-aware portable field recording and sampling instrument for pedestrian urban exploration. Built around a Teensy 4.1 + PJRC Audio Library core, with capacitive touch pads, faders, encoders, GPS, WiFi, and displays.

**Repo:** `alevm/oh-my-box` (repo name hasn't been renamed yet)
**Site:** `alevm.github.io/oh-my-box`
**Licenses:** AGPL v3 (firmware), CERN OHL-S v2 (hardware), CC BY-NC-SA 4.0 (docs)

---

## Important Hardware Facts (actual received, not theoretical)

- **Display:** 2.8" ILI9341 (P1770), NOT HXD8357D 3.5" (P2050)
- **Touch sensor:** CAP1188 8-channel (P1602), NOT MPR121 12-channel
- **GPS:** PA1010D with built-in antenna (P4415), NOT NEO-6M
- **Encoders:** 7 of 13 received (6 more needed from Diotronic)
- **MCU:** Teensy 4.1 with pre-soldered pins
- **Audio:** Audio Shield Rev D2 (SGTL5000 codec)
- **WiFi:** SparkFun ESP32-S2 Thing Plus
- **SD:** SanDisk Ultra 32GB in Teensy built-in SDIO slot (NOT Audio Shield SPI slot)

---

## Website Update Tasks

### Task 1: Add Blog Post

Blog post content is in `~/Downloads/blog-post-components-received.md`. Copy to the site as a post (Jekyll: `_posts/2026-03-22-components-received.md`, or static HTML depending on site structure).

Copy blog images:
- `oh-my-ondas-components-overview.jpg`
- `oh-my-ondas-core-brain.jpg`
- `oh-my-ondas-interface-components.jpg`
- `oh-my-ondas-workshop.jpg`

All from `~/Downloads/` to `assets/images/blog/`.

### Task 2: Update BOM Page

Create/update a BOM page reflecting **actual hardware received** from three orders:
- **Antratek Belgium** (Jan 2026, €78.05): Teensy 4.1, Audio Shield, ESP32-S2
- **Diotronic Barcelona** (Feb 2026, ~€80): encoders, buttons, OLED, copper tape, NeoPixels, jacks, passives, prototyping supplies, soldering station
- **Adafruit US** (Mar 2026, ~$194): backup Teensy + Audio Shield, GPS, CAP1188, ADS1115, MCP23017 x2, nav switch, slide pots, knobs, 2.8" LCD, LoRa, KB2040, USB-C, wire kit, helping hand

Still needed: 6 more EC11 encoders, 2.2kΩ resistors x4, 1kΩ resistors x5, 470Ω resistor x1.

### Task 3: Add Assembly Stages Page

8 phases with I2C bus map. Render as vertical timeline/checklist. Include bus map:
- **Wire (18/19):** SGTL5000 @ 0x0A, PA1010D @ 0x10, SSD1306 @ 0x3C, ADS1115 @ 0x48
- **Wire1 (16/17):** MCP23017 #1 @ 0x20, #2 @ 0x21, CAP1188 @ 0x29 (needs external 10K pull-ups)
- **SPI (10-13):** ILI9341 LCD (CS=10, DC=9, RST=15)
- **Serial1 (0/1):** ESP32-S2 UART

### Task 4: Update Main Page

- Version: v3.0.0, Status: "Components Received — Build Phase 1"
- Add navigation links to blog, BOM, assembly pages
- Update specs to reflect actual hardware

### Site Style

Dark background, monospace font (`Courier New`), gradient backgrounds. Match existing aesthetic.

---

## Hardware Assembly Instructions (8 Phases)

### Key Design Decisions

1. Use **Teensy built-in SD** (SDIO). Audio Shield's SD slot unused — avoids SPI bus conflict with LCD.
2. LCD is **2.8" ILI9341** — ILI9341_t3 is the most optimized display library for Teensy with DMA.
3. Split I2C: **Wire (18/19)** for audio-path devices, **Wire1 (16/17)** for UI-polling devices.
4. 4 main buttons (MODE/SHIFT/REC/PLAY) wired **directly to Teensy pins** (not MCP23017) for latency.
5. ESP32-S2 powered from **5V** through its own regulator, not from Teensy 3.3V.

### Phase 1: Core Audio
Teensy 4.1 + Audio Shield + SD + headphones. Solder female headers on Audio Shield underside using Teensy as jig. SD card FAT32 formatted. Flash WavFilePlayer example with `BUILTIN_SDCARD`.
**Done when:** hear audio in headphones.

### Phase 2: Touch Sensing
CAP1188 on Wire1 (pins 16/17), address 0x29. 10K pull-ups on SDA1/SCL1. Copper tape pads 20x20mm. Touch triggers audio samples.
**Done when:** touching pads triggers samples.

### Phase 3: Display + LEDs
SSD1306 OLED on Wire (18/19) @ 0x3C. ILI9341 LCD on SPI: CS=10, DC=9, RST=15 (pin 8 is I2S RX conflict). WS2812B NeoPixels on pin 6 with 470Ω series resistor.
**Done when:** OLED + LCD + NeoPixels work, audio still clean.

### Phase 4: Analog Inputs
ADS1115 on Wire (18/19) @ 0x48. 4 slide pots to ADS1115 A0-A3, 5th pot to Teensy pin 14 (A0). 100nF caps on all wipers. 3.3V reference (NOT 5V).
**Done when:** faders read 0-26000 smoothly, no jitter.

### Phase 5: I/O Expansion
Buttons directly: MODE=pin2, SHIFT=pin3, REC=pin4, PLAY=pin5 (INPUT_PULLUP). MCP23017 #1 @ 0x20, #2 @ 0x21 on Wire1. 5 encoders on MCP #1, 2 encoders + 5-way nav switch on MCP #2. 100nF decoupling caps. RESET pins tied to 3.3V.
**Done when:** all encoders, buttons, nav switch respond.

### Phase 6: GPS
PA1010D on Wire (18/19) @ 0x10. Test outdoors for first fix (~30s). Display coordinates on OLED.
**Done when:** Barcelona coordinates show on OLED.

### Phase 7: WiFi
ESP32-S2 programmed separately first. UART: ESP32 TX → Teensy pin 0 (RX1), ESP32 RX → Teensy pin 1 (TX1). Power from 5V/VBUS, NOT Teensy 3.3V. Do NOT connect 3.3V rails.
**Done when:** Teensy receives UART messages from ESP32, audio clean.

### Phase 8: Integration
Everything running simultaneously. CPU <70%, no I2C errors, audio clean, GPS fix, WiFi connected.

### Parts Not Used (set aside)
KB2040 (P5302), RFM95W LoRa (P3072), USB-C connectors (P5978, P5993), backup Teensy + Audio Shield.

### Next Diotronic Visit
2.2kΩ resistors x4 (replace I2C1 10K pull-ups), 1kΩ resistors x5 (RC filter for pots), 470Ω resistor x1 (NeoPixel data), 6x more EC11 encoders.
