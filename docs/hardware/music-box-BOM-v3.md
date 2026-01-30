# OH MY ONDAS - BILL OF MATERIALS v3.0

## Zero-Waste Design (No Amazon, Belgium suppliers)

**All MVP parts carry forward to Full build - no throwaway components**

| Option | Description | Cost | Build Time |
|--------|-------------|------|------------|
| **MVP** | Core functionality on breadboard - full feature test | ~€200 | 6-10 hours |
| **FULL** | Complete portable prototype in enclosure | ~€330 | 15-20 hours |

| Path | Total Cost |
|------|------------|
| MVP only | €200 |
| Full only (skip MVP) | €305 |
| MVP → upgrade to Full | €200 + €130 = €330 |

**€25 difference** = breadboard + wires (tools you keep forever)

---

# OPTION 1: MVP (Minimal Viable Prototype)

**Goal:** Test ALL core features on breadboard - iterate fast

**Core = Audio + GPS + WiFi + AI + Radio** (this IS the product)

**No enclosure** - uses breadboard for rapid iteration

**Zero waste** - all parts reused in Full build

## MVP Components

| Component | Description | Qty | Price | Total | Reused in Full? |
|-----------|-------------|-----|-------|-------|-----------------|
| **AUDIO ENGINE** ||||||
| Teensy 4.1 | 600MHz ARM, SD slot, 1MB RAM | 1 | €30.00 | €30.00 | Yes |
| Teensy Audio Shield | SGTL5000 codec, line in/out | 1 | €14.00 | €14.00 | Yes |
| microSD 64GB | Sample + recording storage | 1 | €12.00 | €12.00 | Yes |
| **Subtotal** | | | | **€56.00** | |
| | | | | | |
| **CONNECTIVITY (CORE)** ||||||
| ESP32-WROOM-32 | WiFi/BT - handles AI API calls | 1 | €8.00 | €8.00 | Yes |
| GPS Module NEO-6M | Location tagging + time sync | 1 | €12.00 | €12.00 | Yes |
| RTL-SDR v3 Dongle | Radio input (FM/AM/shortwave) | 1 | €35.00 | €35.00 | Yes |
| SMA Antenna | For RTL-SDR | 1 | €5.00 | €5.00 | Yes |
| **Subtotal** | | | | **€60.00** | |
| | | | | | |
| **USER INTERFACE** ||||||
| MPR121 Breakout | 12-channel capacitive touch | 1 | €8.00 | €8.00 | Yes |
| Copper Tape | For 8 touch pads (3/4" x 12ft) | 1 | €6.00 | €6.00 | Yes |
| Rotary Encoders | With push button (EC11) | 4 | €3.00 | €12.00 | Yes |
| Encoder Knobs | **Aluminum 18mm** (final quality) | 4 | €1.50 | €6.00 | Yes |
| Tactile Buttons | 6x6mm (Play, Stop, Rec, Mode) | 4 | €0.50 | €2.00 | Yes |
| SSD1306 OLED 1.3" | 128x64 I2C display | 1 | €8.00 | €8.00 | Yes (debug display) |
| WS2812B LEDs | **RGB addressable** (final quality) | 4 | €0.50 | €2.00 | Yes |
| **Subtotal** | | | | **€44.00** | |
| | | | | | |
| **AUDIO I/O (Panel Mount)** ||||||
| 3.5mm Panel Jack | Stereo output | 2 | €2.00 | €4.00 | Yes |
| 3.5mm Panel Jack | Mic/Line input | 1 | €2.00 | €2.00 | Yes |
| **Subtotal** | | | | **€6.00** | |
| | | | | | |
| **PROTOTYPING TOOLS** ||||||
| Breadboard (830 point) | Full-size solderless | 2 | €6.00 | €12.00 | Keep as tools |
| Jumper Wires (M-M) | 40-pack assorted | 1 | €4.00 | €4.00 | Keep as tools |
| Jumper Wires (M-F) | 40-pack assorted | 1 | €4.00 | €4.00 | Keep as tools |
| USB-C Cable | Power + programming | 1 | €5.00 | €5.00 | Yes |
| **Subtotal** | | | | **€25.00** | |

### MVP TOTAL

| Category | Subtotal | Reusable |
|----------|----------|----------|
| Audio Engine | €56.00 | 100% |
| Connectivity (Core) | €60.00 | 100% |
| User Interface | €44.00 | 100% |
| Audio I/O | €6.00 | 100% |
| Prototyping Tools | €25.00 | Tools (keep) |
| **TOTAL** | **€191.00** | |
| + Belgium supplier markup | ~€9 | |
| **BUDGET** | **~€200** | |

### MVP Pin Usage (Teensy 4.1)

```
Audio Shield: 7, 20, 21, 23 (I2S) + 18, 19 (I2C)
OLED Display: 18, 19 (shared I2C)
MPR121 Touch: 18, 19 (shared I2C) + Pin 2 (IRQ)
Encoder 1: Pins 3, 4 (CLK, DT), 5 (SW)
Encoder 2: Pins 6, 8 (CLK, DT), 9 (SW)
Encoder 3: Pins 10, 11 (CLK, DT), 12 (SW)
Encoder 4: Pins 24, 25 (CLK, DT), 26 (SW)
Buttons: Pins 27, 28, 29, 30
LEDs: Pin 31 (WS2812B data)
ESP32 Serial: Pins 16 (RX), 17 (TX)
RTL-SDR: USB (to computer during MVP, internal USB host in Full)
GPS: Connected to ESP32 (UART)
```

### What MVP Can Do

- Play/record samples to SD card
- 8-track sequencer with P-locks
- All effects (software-based)
- 8 touch pads for triggering
- 4 encoders for parameter control
- **GPS location tagging**
- **WiFi for AI composition (Claude API)**
- **Radio input via RTL-SDR**
- OLED feedback for all modes
- Full firmware development
- **100% feature parity with Full build**

---

# OPTION 2: FULL FLEXIBLE PROTOTYPE

**Goal:** Portable, battery-powered, polished prototype

**Adds to MVP:** 5" touch display, battery, enclosure

**Enclosure:** 200 x 140 x 45mm aluminum

## Full = MVP Parts + Portability Package

### FROM MVP (100% Reused)

| Category | Cost |
|----------|------|
| Audio Engine | €56.00 |
| Connectivity (GPS, WiFi, Radio) | €60.00 |
| User Interface | €44.00 |
| Audio I/O (panel mount) | €6.00 |
| **MVP Parts Subtotal** | **€166.00** |

*(Prototyping tools €25 kept separately - not part of Full)*

### PORTABILITY UPGRADES (Buy for Full)

| Component | Description | Qty | Price | Total |
|-----------|-------------|-----|-------|-------|
| **DISPLAY** |||||
| 5" IPS Touch Display | 800x480 capacitive, SPI | 1 | €35.00 | €35.00 |
| Display Driver Board | RA8875 or SSD1963 | 1 | €8.00 | €8.00 |
| **Subtotal** | | | | **€43.00** |
| | | | | |
| **POWER SYSTEM** |||||
| LiPo Battery | 3500mAh 3.7V, JST connector | 1 | €18.00 | €18.00 |
| TP4056 Module | USB-C charging with protection | 1 | €2.00 | €2.00 |
| 5V Boost Converter | MT3608 or similar | 1 | €3.00 | €3.00 |
| Power Switch | Latching, panel mount | 1 | €1.50 | €1.50 |
| **Subtotal** | | | | **€24.50** |
| | | | | |
| **PANEL MOUNTS** |||||
| USB-C Panel Mount | Power + data | 1 | €3.00 | €3.00 |
| SMA Panel Mount | For RTL-SDR antenna | 1 | €2.00 | €2.00 |
| **Subtotal** | | | | **€5.00** |
| | | | | |
| **ENCLOSURE** |||||
| Aluminum Enclosure | 200 x 140 x 45mm | 1 | €28.00 | €28.00 |
| Acrylic Panel | Laser-cut top (3mm smoked) | 1 | €12.00 | €12.00 |
| Rubber Feet | Self-adhesive, 10mm | 4 | €0.50 | €2.00 |
| Standoffs M3 | Assorted heights kit | 1 | €5.00 | €5.00 |
| Screws M3 | Pan head, various lengths | 1 | €3.00 | €3.00 |
| Wire 22AWG | Assorted colors kit | 1 | €5.00 | €5.00 |
| JST Connectors | 2/3/4-pin assorted | 1 | €5.00 | €5.00 |
| **Subtotal** | | | | **€60.00** |

### FULL PROTOTYPE TOTAL

| Category | Subtotal |
|----------|----------|
| MVP Parts (reused) | €175.00 |
| Display + Driver | €55.00 |
| Enclosure | €35.00 |
| Power System | €35.00 |
| Hardware + Panel | €25.00 |
| **TOTAL** | **€305.00** |
| **BUDGET** | **~€305** |

### Upgrade Cost from MVP

| If you built MVP first | Cost to upgrade |
|------------------------|-----------------|
| Display + Driver (Opencircuit) | €55.00 |
| Enclosure (Reichelt) | €35.00 |
| Power system (Conrad) | €35.00 |
| Hardware + Panel | €25.00 |
| **Upgrade Total** | **€130** |

### Math Check

| Path | Calculation | Total |
|------|-------------|-------|
| MVP only | €175 parts + €25 tools | **€200** |
| Full direct | €175 + €130 | **€305** |
| MVP → Full | €200 + €130 | **€330** |
| Difference | Tools kept | **€25** |

---

## COMPARISON TABLE

| Feature | MVP | Full |
|---------|-----|------|
| **Cost** | ~€200 | ~€305 (or €330 via MVP) |
| **Build Time** | 6-10 hrs | 15-20 hrs |
| **Enclosure** | None (breadboard) | 200x140x45mm aluminum |
| **Display** | 1.3" OLED | 1.3" OLED + 5" IPS Touch |
| **Touch Pads** | 8 | 8 |
| **Encoders** | 4 | 4 |
| **Buttons** | 4 | 4 + touch UI |
| **GPS** | Yes | Yes |
| **WiFi/AI** | Yes | Yes |
| **Radio (RTL-SDR)** | Yes | Yes |
| **Battery** | USB powered | 3500mAh (5-7 hrs) |
| **Audio I/O** | Panel mount jacks | Panel mount jacks |
| **Portability** | Desktop/tethered | Fully portable |
| **Flexibility** | Maximum (rewire anytime) | Good (software changes) |
| **Polish Level** | Dev kit | Product-like |

### Core Functionality (SAME in both)

| Feature | MVP | Full |
|---------|-----|------|
| Audio Engine | Yes | Yes |
| 8-track Sequencer | Yes | Yes |
| P-locks & Conditions | Yes | Yes |
| All Effects | Yes | Yes |
| GPS Location | Yes | Yes |
| WiFi + AI | Yes | Yes |
| Radio Input | Yes | Yes |
| 8 Touch Pads | Yes | Yes |
| 4 Encoders | Yes | Yes |

### Difference is ONLY Portability

| Portability Feature | MVP | Full |
|---------------------|-----|------|
| Battery power | No | Yes |
| Enclosed | No | Yes |
| Large touch display | No | Yes |
| Take anywhere | No | Yes |

---

## UPGRADE PATH

```
MVP (€200) - FULL CORE FUNCTIONALITY
  │
  │  ✓ Audio engine working
  │  ✓ GPS tagging working
  │  ✓ WiFi + AI working
  │  ✓ Radio input working
  │  ✓ All 8 pads + 4 encoders
  │  ✓ Firmware complete
  │
  │  Ready to upgrade when software is stable
  │
  ├── Add 5" Touch Display (+€55)
  │
  ├── Add Enclosure (+€35)
  │
  ├── Add Battery + Power (+€35)
  │
  └── Add Hardware + Panel (+€25)
        │
        └── FULL PORTABLE (€330 total via MVP path)
```

**Key insight:** MVP tests 100% of functionality. Only add portability when core works.

---

## SUPPLIER RECOMMENDATIONS (BELGIUM)

### Primary Suppliers (Ship to Belgium)

| Supplier | URL | Ships From | Best For | Delivery |
|----------|-----|------------|----------|----------|
| **Mouser.be** | mouser.be | Belgium warehouse | Teensy, ICs, pro components | 1-3 days |
| **Farnell.be** | be.farnell.com | Belgium | Professional components | 1-2 days |
| **RS Components** | be.rs-online.com | Belgium | Connectors, hardware, tools | 1-2 days |
| **Gotron.be** | gotron.be | Belgium | Arduino, modules, hobby | 1-3 days |
| **Antratek.be** | antratek.be | Netherlands | Teensy, Adafruit products | 2-4 days |
| **Kiwi Electronics** | kiwi-electronics.com | Netherlands | SparkFun, dev boards | 2-4 days |
| **Conrad.be** | conrad.be | Belgium | Everything, local pickup | 1-3 days |
| **Opencircuit.nl** | opencircuit.nl | Netherlands | Displays, modules, RTL-SDR | 2-4 days |
| **Reichelt.de** | reichelt.de | Germany | Enclosures, components | 3-5 days |

### Where to Buy Each Component

| Component | Recommended Supplier | Alt Supplier |
|-----------|---------------------|--------------|
| Teensy 4.1 | Antratek.be | Mouser.be |
| Audio Shield | Antratek.be | Mouser.be |
| ESP32 | Gotron.be | Conrad.be |
| 5" Display | Opencircuit.nl | Antratek.be |
| RTL-SDR | Opencircuit.nl | rtl-sdr.com |
| MPR121 | Gotron.be | Kiwi Electronics |
| GPS NEO-6M | Gotron.be | Opencircuit.nl |
| Encoders | Mouser.be | Conrad.be |
| Buttons/LEDs | Gotron.be | Conrad.be |
| LiPo Battery | Conrad.be | Gotron.be |
| Enclosure | Reichelt.de | RS Components |
| Wires/Connectors | Gotron.be | Conrad.be |

### Price Notes (Belgium)
- Add **21% BTW** (VAT) if not included
- Mouser/Farnell: Free shipping over €50
- Most EU suppliers: Free shipping €30-50+
- Budget extra €15-25 for shipping on small orders

---

## BELGIUM SHOPPING LIST (No Amazon)

### MVP Shopping List (€190)

**Order 1: Antratek.be** (~€55)
| Item | Qty | Est. Price |
|------|-----|------------|
| Teensy 4.1 (with headers) | 1 | €35.00 |
| Teensy Audio Shield Rev D | 1 | €16.00 |
| Shipping | | €4.00 |

**Order 2: Gotron.be** (~€65)
| Item | Qty | Est. Price |
|------|-----|------------|
| ESP32-WROOM-32 DevKit | 1 | €9.00 |
| GPS Module NEO-6M | 1 | €13.00 |
| MPR121 Capacitive Touch Breakout | 1 | €9.00 |
| Rotary Encoder EC11 (with button) | 4 | €12.00 |
| Tactile Button 6x6mm | 4 | €2.00 |
| WS2812B LED (individual or strip) | 4 | €3.00 |
| Copper Tape 19mm x 5m | 1 | €7.00 |
| SSD1306 OLED 1.3" I2C | 1 | €9.00 |
| Shipping | | €0 (free >€30) |

**Order 3: Opencircuit.nl** (~€55)
| Item | Qty | Est. Price |
|------|-----|------------|
| RTL-SDR Blog V3 R860 | 1 | €42.00 |
| microSD 64GB | 1 | €12.00 |
| Shipping | | €0 (free >€50) |

**Order 4: Conrad.be** (~€25)
| Item | Qty | Est. Price |
|------|-----|------------|
| Breadboard 830 points | 2 | €10.00 |
| Jumper wire kit M-M + M-F | 1 | €6.00 |
| 3.5mm Panel Mount Stereo Jack | 3 | €6.00 |
| Aluminum Encoder Knobs 18mm | 4 | €8.00 |
| USB-C Cable 1m | 1 | €5.00 |
| Shipping | | €0 (pickup) |

**MVP Total: ~€200**

---

### Full Upgrade Shopping List (add €130)

**Order 5: Opencircuit.nl** (~€55)
| Item | Qty | Est. Price |
|------|-----|------------|
| 5" IPS Touch Display 800x480 | 1 | €40.00 |
| RA8875 Display Driver Board | 1 | €15.00 |
| Shipping | | €0 (free >€50) |

**Order 6: Reichelt.de** (~€35)
| Item | Qty | Est. Price |
|------|-----|------------|
| Aluminum Enclosure 200x140x45mm | 1 | €30.00 |
| Shipping | | €5.00 |

**Order 7: Conrad.be** (~€35)
| Item | Qty | Est. Price |
|------|-----|------------|
| LiPo Battery 3.7V 3500mAh | 1 | €18.00 |
| TP4056 USB-C Charger Module | 1 | €3.00 |
| MT3608 5V Boost Converter | 1 | €3.00 |
| Latching Power Switch | 1 | €2.00 |
| USB-C Panel Mount | 1 | €4.00 |
| SMA Panel Mount | 1 | €3.00 |
| Shipping | | €0 (pickup) |

**Order 8: Conrad.be or Brico** (~€10)
| Item | Qty | Est. Price |
|------|-----|------------|
| Acrylic sheet 3mm A4 (drill yourself) | 1 | €5.00 |
| -OR- Skip panel, use open-top design | | €0.00 |
| Shipping | | €0 (pickup) |

**Order 9: Gotron.be** (~€20)
| Item | Qty | Est. Price |
|------|-----|------------|
| M3 Standoff Kit | 1 | €5.00 |
| M3 Screw Assortment | 1 | €4.00 |
| 22AWG Wire Kit | 1 | €6.00 |
| JST Connector Kit | 1 | €5.00 |
| Rubber Feet 10mm | 4 | €2.00 |
| Shipping | | €0 (combine with MVP order) |

**Upgrade Total: ~€130**

---

### Quick Reference: What to Order Where

| Supplier | Order | Items | Est. Total |
|----------|-------|-------|------------|
| Antratek.be | MVP | Teensy + Audio Shield | €55 |
| Gotron.be | MVP | ESP32, GPS, Touch, Encoders, OLED | €65 |
| Opencircuit.nl | MVP | RTL-SDR, SD Card | €55 |
| Conrad.be | MVP | Breadboard, jacks, knobs, wires | €25 |
| **MVP TOTAL** | | | **€200** |
| | | | |
| Opencircuit.nl | Full | Display + driver | €55 |
| Reichelt.de | Full | Aluminum enclosure | €35 |
| Conrad.be | Full | Battery, power, mounts | €35 |
| Conrad.be/Brico | Full | Acrylic sheet (drill yourself) | €5 |
| Gotron.be | Full | Hardware kit | €20 |
| **UPGRADE TOTAL** | | | **€130** |
| | | | |
| **FULL VIA MVP** | | | **€330** |

### Panel Options (No laser cutting needed)
1. **DIY drill:** Buy A4 acrylic sheet from Brico, mark holes, drill with step bit
2. **Open-top:** Skip panel entirely, components visible (prototype style)
3. **3D print:** If you have access to a printer, print the panel
4. **Later:** Add laser-cut panel after holidays when FabLabs reopen

---

## SOLDERING REQUIREMENTS

### MVP Build - Soldering Level: **MINIMAL**

| Task | Soldering Required? | Difficulty |
|------|---------------------|------------|
| Teensy 4.1 | Headers pre-soldered option available | None/Easy |
| Audio Shield | Solder headers to shield | Easy |
| OLED Display | Usually pre-soldered | None |
| MPR121 | Solder headers | Easy |
| Encoders | Breadboard-friendly | None |
| Buttons | Breadboard-friendly | None |
| Wiring | Jumper wires | None |

**MVP Soldering Summary:**
- ~30 minutes of basic through-hole soldering
- Just headers on Audio Shield and MPR121
- Buy Teensy with pre-soldered headers to skip soldering entirely
- All testing can be done on breadboard

### Full Build - Soldering Level: **INTERMEDIATE**

| Task | Soldering Required? | Difficulty |
|------|---------------------|------------|
| All MVP components | Same as above | Easy |
| Permanent wiring | Solder wires to components | Easy |
| JST connectors | Crimp or solder | Easy-Medium |
| Panel-mount jacks | Solder wires | Easy |
| Power system | Solder battery connector | Easy |
| LED strip | Solder 3 wires | Easy |
| Display connector | Depends on display | Easy-Medium |

**Full Build Soldering Summary:**
- ~2-4 hours total soldering
- Mostly wire-to-pad connections
- No SMD (surface mount) soldering required
- All components are through-hole or have breakout boards

### Recommended Soldering Equipment

| Tool | Purpose | Have at Home? |
|------|---------|---------------|
| Soldering iron (adjustable) | Main tool | Check temp range (300-400°C) |
| Solder 0.8mm lead-free | Connections | |
| Flux pen | Clean joints | |
| Solder wick | Fix mistakes | |
| Helping hands | Hold components | |
| Multimeter | Test connections | |
| Heat shrink tubing | Insulate wires | |

### Tips for Clean Build
1. Test everything on breadboard FIRST (MVP style)
2. Only solder permanent connections when design is finalized
3. Use JST connectors for modules you might swap
4. Color-code wires (red=5V, black=GND, etc.)
5. Take photos before and after each step

---

## BUILD NOTES

### MVP Build Order
1. Test Teensy 4.1 standalone (blink LED)
2. Attach Audio Shield, test audio passthrough
3. Add OLED, test I2C
4. Add encoders, test rotation
5. Add buttons, test input
6. Add MPR121 + touch pads (if included)
7. Load firmware, test full system

### Full Build Order
1. Complete MVP testing first
2. Design enclosure cutouts (display, jacks, buttons)
3. Laser cut acrylic panel
4. Wire power system (battery, charger, boost)
5. Mount components on standoffs
6. Connect all modules
7. Final assembly and testing

---

## MEMORY BUDGET (Teensy 4.1)

| Resource | Available | MVP Usage | Full Usage |
|----------|-----------|-----------|------------|
| RAM | 1024 KB | ~200 KB | ~800 KB |
| Flash | 8 MB | ~500 KB | ~2 MB |
| SD Card | 32/64 GB | 32 GB | 64 GB |

---

## REVISION HISTORY

| Version | Date | Changes |
|---------|------|---------|
| v1.0 | Nov 2025 | Initial BOM |
| v2.0 | Dec 2025 | Added sampling engine, ZOIA FX |
| v3.0 | Dec 2025 | Split MVP/Full, aligned with HARDWARE-SPEC v3, fixed math |

---

*Last updated: December 2025*
