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
- **Audio:** Audio Shield Rev D (SGTL5000 codec; silkscreen reads "Rev D", ordered as Rev D2)
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
- **DigiKey Spain** (Oct 2026, €91.62, in transit): 2x Quad Rotary Encoder (Adafruit 5752), MAX9814 mic preamp, STEMMA QT cables, 2x PSRAM 8 MB, 2x USB Host cable, Perma-Proto, 2x Si4732-A10 radio chip, USB logic analyzer

Still needed (Diotronic): for the Si4732 radio, 2x SOIC-16 to DIP adapter, 2x 32.768 kHz crystal, capacitors 22 pF x4, 1 nF x2, 22 nF x2, 470 nF x2, 4.7 µF x4, 2.2kΩ x2, AM ferrite antenna; 1kΩ x5 only if the faders jitter. See web/bom.html.

Open — not yet chosen: Input source TBD — electret on MIC/GND pads or line-in. Picture Mode needs audio capture; no microphone is in the component list.

### Task 3: Add Assembly Stages Page

8 phases with I2C bus map. Render as vertical timeline/checklist. Include bus map:
v1 pin map (source of truth: `web/prototype.html`, `firmware/teensy/include/config.h`):
- **Wire (18/19):** SGTL5000 @ 0x0A only.
- **Wire2 (SDA 25, SCL 24):** GPS 0x10, Si4732 0x11, MCP23017 0x20, CAP1188 0x29, OLED 0x3C, ADS1115 0x48, Quad #1 0x49, Quad #2 0x4A, ANO nav 0x4B. Breakout pull-ups only.
- **SPI1:** ILI9341 LCD: MOSI 26, SCK 27, MISO 39, CS 38, DC 37, RST 36.
- **Serial7 (RX 28, TX 29):** ESP32-S2 link, 2 Mbaud.

### Task 4: Update Main Page

- Version: v3.0.0, Status: "Components Received — Build Phase 1"
- Add navigation links to blog, BOM, assembly pages
- Update specs to reflect actual hardware

### Site Style

Dark background, monospace font (`Courier New`), gradient backgrounds. Match existing aesthetic.

---

## Hardware Assembly Instructions (10 Phases)

### Key Design Decisions (v1, 2026-10-21)

1. Use **Teensy built-in SD** (SDIO). Audio Shield's SD slot unused.
2. LCD is **2.8" ILI9341** on SPI1 (pins 26/27/39 + 36–38), the only SPI pins past the shield.
3. All UI devices on **Wire2 (24/25)**; Wire (18/19) is the SGTL5000 only.
4. Buttons MODE/SHIFT/REC/PLAY on MCP23017 GPB0–3; nav is the ANO I2C board (0x4B); 7 encoders on 2 Quad boards.
5. ESP32-S2 powered from its own USB-C (power bank output 2), never from the Teensy 3.3 V.
6. Composition engine: layer 1 on the Teensy (continuous, no internet), layer 2 AI over WiFi. See `docs/technical/ai-layer2-design.md`.

### Phase 1: Core Audio
Teensy 4.1 + Audio Shield + SD + headphones.

- **Stack:** Audio Shield sits UNDER the Teensy 4.1. A female socket strip on the shield receives the Teensy's downward-facing male headers. Shield at the USB end, pin 0 to pin 0. The shield covers only the first 14 pins per side; pins 24+ stay free. Seat the Teensy fully (header plastic touching the socket strip) — partial insertion gives intermittent contact. Pluggable; no solder joint between the boards.
- **Shield pins** ([PJRC](https://www.pjrc.com/store/teensy3_audio.html)): audio data 7, 8, 20, 21, 23 · I2C 18 (SDA), 19 (SCL), shared · shield SD socket 10–13 · memory chip CS 6 · volume pot 15/A1. Keep the shield SD socket empty and don't fit the pot or memory chip. Pins 0–23 are under the shield: v1 uses only 24–41.
- **SD:** FAT32, `TEST.WAV` (44.1 kHz/16-bit) at root, Teensy built-in slot (`BUILTIN_SDCARD`).
- **Tests:** `firmware/teensy/test/layer1_tone`, `firmware/teensy/test/layer1_sd_playback`, `firmware/teensy/test/layer1_record_roundtrip`.
- **Status:**
  - [x] Audio out: SGTL5000 responds, 440 Hz sine heard on headphones (Oct 2026)
  - [x] SD playback from BUILTIN_SDCARD (TEST.WAV, 44.1kHz/16-bit) heard on headphones (Oct 2026)
  - [ ] Record → SD → playback round trip — digital path verified with layer1_record_roundtrip (Oct 2026); analog input blocked: input source TBD (electret on MIC/GND pads or line-in, not yet chosen)
- **Before Phase 2:** I2C scan on Wire (18/19) should show only the SGTL5000 at 0x0A. Then add the CAP1188 on Wire2 (24/25) and confirm 0x29 (`firmware/teensy/test/layer2_cap1188`).
**Done when:** hear audio in headphones.

### Phase 2: Touch Sensing
CAP1188 on Wire2 @ 0x29. Copper pads. Touch triggers samples.
**Done when:** touching pads triggers samples.

### Phase 3: Displays
OLED SSD1306 on Wire2 @ 0x3C. LCD ILI9341 on SPI1 (MOSI 26, SCK 27, MISO 39 with `SPI1.setMISO(39)`, CS 38, DC 37, RST 36). No NeoPixel strip in v1.
**Done when:** OLED + LCD work, audio still clean.

### Phase 4: Analog Inputs
ADS1115 on Wire2 @ 0x48: faders 1–4 to A0–A3, fader 5 to Teensy pin 40 (A16). 100 nF on every wiper, at the fader. 3.3 V only, never 5 V.
**Done when:** faders read full range smoothly, no jitter.

### Phase 5: I/O Expansion
MCP23017 @ 0x20 on Wire2: GPB0–3 = MODE, SHIFT, REC, PLAY (internal pull-ups), 100 nF at pin 9, RESET to 3.3 V. 7 EC11 on Quad #1 (0x49) and Quad #2 (0x4A, A0 cut). ANO nav + wheel (Adafruit 6310) at 0x4B (A1 cut) on the STEMMA QT chain.
**Done when:** all encoders, buttons, nav and wheel respond.

### Phase 6: GPS
PA1010D on Wire2 @ 0x10, end of the STEMMA QT chain. First fix outdoors (~30 s).
**Done when:** Barcelona coordinates show on the OLED.

### Phase 7: WiFi link (ESP32-S2 Thing Plus)
Firmware in `firmware/esp32/` (flash it separately first). UART: ESP TX → Teensy 28 (RX7), ESP RX ← Teensy 29 (TX7), common GND; short wires, 2 Mbaud (1 Mbaud fallback). Power: USB-C from power bank output 2. Do NOT connect the 3.3 V rails. WiFi: the phone hotspot.
**Done when:** the LCD SENSE screen shows frames sent/received with 0 errors, WiFi up, server connected; audio clean.

### Phase 8: Integration
Everything running together, radio included. CPU <70%, no I2C errors, audio clean, GPS fix, link up.

### Phase 9: Layer 1 sensing and engine
PSRAM 2 × 8 MB soldered (captures). SENSE screen: spectrum bands, onsets, pulse, pitch, speech, piezo, radio. Captures from mic, piezo and radio analysed and assigned to roles; continuous mapping drives the sequencer and FX.
**Done when:** walking between two places changes the music audibly without touching a control, and captures play as rhythm/texture/melody.

### Phase 10: Layer 2 AI
Server in `server/` (local first, then the VPS: deployment by the user). Device streams features and clips (no mic clips while speech is detected); server adds place context and returns plans.
**Done when:** plans arrive and are applied at bar boundaries; with WiFi off, layer 1 keeps playing.

### Parts Not Used (set aside)
KB2040 (P5302), RFM95W LoRa (P3072), USB-C connectors (P5978, P5993), backup Teensy + Audio Shield.

### Next Diotronic Visit
2.2kΩ resistors x4 (Wire2 pull-ups, if the breakouts have none), 1kΩ resistors x5 (RC filter for pots), 470Ω resistor x1 (NeoPixel data), 6x more EC11 encoders.
