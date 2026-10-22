# Oh My Ondas prototype #1 (Field Unit v1): gap review and US (Miami) list

Date: 2026-10-21. Read-only review. Sources: web/prototype.html (definitive layout), web/bom.html, ~/Downloads/DK_PRODUCTS_102318278.csv, STATUS-HARDWARE.md (incl. 2026-10-21 photo inventory), docs/hardware/diotronic-order-2026-10-21.md, firmware/teensy/include/config.h, firmware/platformio.ini, firmware/teensy/*.cpp/.ino (grep), web/assembly.html (v0.3), web/prototype-v1.html (concept), ~/Downloads/"Electronics Gear Inventory — Additional Items.md".

Status codes: **OWNED** (evidence) · **DK** = DigiKey 102318278, arriving 2026-10-21 · **DIO** = Diotronic list 2026-10-21 (to buy now) · **MISSING**.
"Feb-DIO" = Diotronic walk-in Feb 2026 (bom.html), not confirmed by the 2026-10-21 photos.

## 1. Every part prototype #1 needs

### Core
| Part | Need | Have | Status / evidence |
|---|---|---|---|
| Teensy 4.1 with pins | 1 | 2 | OWNED (Antratek + Adafruit P4622; working) |
| Audio Shield Rev D | 1 | 2 | OWNED (Antratek SF15845 + Adafruit P4384; 440 Hz test PASS) |
| microSD card | 1 | 1 | OWNED (in Teensy slot; firmware uses BUILTIN_SDCARD; holds TEST.WAV, PAD1-8.WAV) |
| PSRAM 8 MB (SMD, under SD slot) | 2 | 2 | DK (COM-28391 ×2). No headers needed. Firmware does not use it yet (no EXTMEM) |
| Perma-Proto full-size | 1 | 1 | DK (1606 ×1). Single-board layout 2026-10-20: 1 is enough |
| Front panel perfboard 72×47 (PC-3) | 1 | 0 | DIO #14 |

### Headers, sockets, interconnect
| Part | Need | Have | Status / evidence |
|---|---|---|---|
| Female header 2× 14-pin (Audio Shield socket for the Teensy pins) | 28 pins | Feb-DIO female 40-pin ×3 | OWNED per bom.html (Diotronic Feb, role "Stacking headers"); assembly.html v0.3 step: "cut 2× female 14-pin strips from 40-pin". **Not in photos** → physical check |
| Male header: 5-pin USB host | 5 | Feb-DIO male 40 ×3 + 2 strips in TSL2561 bag | OWNED (STATUS: "5-pin header (owned)") |
| Male header: SOIC→DIP adapter | 16 | same | OWNED (same strips) |
| Male header: ESP32-S2 Thing Plus TX/RX/GND/VUSB | ~4–6 | same | OWNED (same strips) |
| Breakout headers (CAP1188, ADS1115, OLED, LCD, MAX9814) | — | — | Soldered already (CAP1188, ADS1115 2026-10-20, OLED, LCD); MAX9814 1713 ships with its header |
| DIP-28 socket (MCP23017) | 1 | 2 | OWNED per bom.html (Feb-DIO ×2); photo shows the MCP23017s on the EIC-104 (socket not mentioned) |
| DIP-8 socket (MCP6002) | 1 | 0 | DIO #9 (ref 008 is **backorder**; turned-pin 308 in stock €0.38) |
| SOIC-16 → DIP-16 adapter (Si4732) | 1 (+1 spare) | 0 | **MISSING** (not at Diotronic; not in DK order) |
| STEMMA QT → male (4209), rails → Quad #1 | 1 | 3 | DK (4209 ×3; 2 spare) |
| STEMMA QT 150 mm (4397), Quad #1→#2, #2→GPS | 2 | 3 | DK (4397 ×2 + ×1, line 11 extra) |
| Female-end jumpers onto the Teensy's down-facing pins (3V3, G, 24–29, 32–40: ~17) + LCD 8 + ESP32 3 | ~28 female ends | unknown count of M-F / F-F | OWNED in part (CAP1188 and LCD run on them today); count unknown → insurance in US list |
| Solid-core wire (Perma-Proto, pads, faders, front-panel cable, antenna 75 cm) | — | 1 kit | OWNED (Adafruit P3174 wire kit 22AWG solid) |
| Front-panel cable, 10 wires (9 signals + GND) | 1 | — | OWNED (wire kit; optional 10-pin header pair from owned male/female strips as a connector) |
| Shielded/twisted wire mic + piezo | 2 runs | — | OWNED as twisted pair from wire kit (prototype allows "shielded or twisted") |
| Copper tape (8 pads) | few cm | 1 roll | OWNED (Feb-DIO VTCFT1) |
| Cardboard pad panel | 1 | — | OWNED (in use) |

### UI
| Part | Need | Have | Status / evidence |
|---|---|---|---|
| LCD 2.8″ ILI9341 P1770 | 1 | 1 | OWNED (photo; working on SPI1) |
| OLED SSD1306 0.96″ | 1 | 1 | OWNED (tested PASS) |
| CAP1188 | 1 | 1 | OWNED (photo; working 0x29) |
| ADS1115 | 1 | 1 | OWNED (photo; 0x48 found) |
| MCP23017 DIP-28 | 1 | 2 | OWNED (photo ×2) |
| Quad Rotary Encoder 5752 | 2 | 2 | DK (5752 ×2). A0 jumper cut on #2 |
| EC11 encoders | 7 | 7 | OWNED (Diotronic Feb ×7; nut/washer normally included) |
| Knobs for EC11 | 7 | 20 | OWNED per bom (Adafruit P5542 ×2 packs). Fit: set-screw, "any shaft type (round, D, T18)" (adafruit.com/product/5542, read 2026-10-21); **needs a 2 mm hex key (not included)** |
| Slide pots 45 mm B10K | 5 | 5 bought / 3 seen | OWNED per Adafruit order (P4272 ×5); photo shows 3 → physical check |
| Fader knobs | 5 | 5 | OWNED: P4272 "comes with a knob" (adafruit.com/product/4272) |
| 5-way nav switch | 1 | 1? | Adafruit order P504; **not in 2026-10-21 photo** → physical check. Adafruit 504 is now **out of stock**. Through-hole, legs **not on a 0.1″ grid** (bend/drill on PC-3) |
| Tactile buttons | 4 | 16 | OWNED (Feb-DIO DTS61N ×16) |
| Fader wiper 100 nF | 5 | — | DIO #5 (100 nF ×10, **backorder**) or Feb-DIO 100 nF ×10 (not seen in photos) |
| Fader 1k RC | 0 (only if jitter) | — | DIO #15 |

### Audio sources
| Part | Need | Have | Status / evidence |
|---|---|---|---|
| MAX9814 mic preamp (1713) | 1 | 1 | DK |
| 1 µF coupling (MAX9814 out if needed, piezo buffer out) | 2 | 6 | OWNED (photo: 1 µF 63 V ×6) |
| Piezo disc (passive) | 1 | 1 | OWNED (photo: brass disc with leads) |
| MCP6002 DIP-8 | 1 | 0 | DIO #8 (×2) |
| 100k (bias) | 2 | 0 seen | DIO #11 (**backorder**); Feb-DIO had none of this value |
| 1 MΩ (input bias) | 1 | 0 seen | DIO #10 |
| 10k (input) | 1 | 0 seen | DIO #12 (**backorder**); Feb-DIO 10k ×20 (not seen) |
| 10 µF (bias node) | 1 | 0 seen | DIO #13; Feb-DIO 10 µF ×5 (not seen) |
| MIC/PIEZO SPDT switch | 1 | 1 | OWNED (photo: red mini toggle, 3 lugs) |
| Headphones on shield jack | 1 | — | OWNED (audio heard) |
| LINE-IN L/R pad wires | 4 | — | OWNED (wire kit) |

### Radio (Si4732)
| Part | Need | Have | Status / evidence |
|---|---|---|---|
| Si4732-A10-GS | 1 | 2 | DK (×2, 1 spare) |
| SOIC-16→DIP adapter | 1 | 0 | **MISSING** |
| 32.768 kHz crystal 12.5 pF | 1 | 0 | DIO #1 (×2) |
| 22 pF (crystal load) | 2 | 0 | DIO #2 |
| 100 nF + 22 nF at VDD pin 14 | 1 + 1 | 0 | DIO #5 (backorder) + #6 |
| 1 nF FMI | 1 | 0 | DIO #3 |
| 470 nF AMI | 1 | 0 | DIO #4 |
| 4.7 µF audio out | 1–2 | 0 | DIO #7 |
| 2 resistors to sum LOUT+ROUT (optional) | 2 | — | DIO 1k/10k or owned assortment |
| 2.2k (crystal series, optional) | 0–1 | yes | OWNED (photo: 2.2k) |
| Antenna wire ≈75 cm (FM/SW) | 1 | — | OWNED (wire kit) |
| AM ferrite loopstick | optional | 0 | MISSING, optional (user) |

### Power, USB, ESP32
| Part | Need | Have | Status / evidence |
|---|---|---|---|
| USB-C power bank | 1 | ? | Decided "easy in Spain" (STATUS 2026-10-18): buy in Spain, not US |
| Cable power bank → Teensy micro-B | 1 | ? | Unknown. A USB-C-only bank needs a C→micro-B cable with a 5.1k pulldown → US list (cheap) |
| micro-USB data cable Teensy ↔ computer | 1 | 1 | OWNED (uploads working) |
| ESP32-S2 Thing Plus (WRL-17743, red, USB-C) | 1 | 1 | OWNED (Antratek; photo "red ESP32 board with USB-C") |
| 5 V for the ESP32 | 1 | — | Not designed: 2nd power-bank port + USB-C cable, **or** a wire from Teensy VIN (top-side solder joint; VIN sits in the shield-covered row) to Thing Plus VUSB. No purchase if wired |
| USB host cable CAB-28389 | 1 | 2 | DK (duplicate line = spare) |
| USB MIDI keyboard | optional | ? | not a BOM part |

### Case (3D print decided 2026-10-20)
| Part | Need | Have | Status |
|---|---|---|---|
| Standoffs + screws (Perma-Proto, Quads, LCD, PC-3) | ~16 sets | 0 | **MISSING** (no order lists any) |
| Panel jacks PHONES / LINE OUT / MIC (concept page) | 3 | 3 | OWNED (Feb-DIO CBS35 ×3) — not needed for the bench v1 (onboard jack) |
| Panel USB-C → Teensy micro-B | optional | 0 | concept page shows a USB-C port; owned P5978/P5993 parts are not a micro-B link. Optional Adafruit 4056 (no CC resistors: some power banks will not supply) |
| Telescopic antenna (concept "design idea") | optional | 0 | prototype.html uses wire; not needed |

## 2. MISSING items — US list (one Adafruit order, ship to US address)

Prices read on adafruit.com 2026-10-21 unless marked.

| # | Item | Source / part # | Unit | Qty | Line | Stock | URL | Why |
|---|---|---|---|---|---|---|---|---|
| 1 | SMT Breakout PCB SOIC-16/TSSOP-16, 3-pack (narrow/medium/wide SOIC) | Adafruit 1207 | $3.95 | 1 | $3.95 | in stock | https://www.adafruit.com/product/1207 | **Required** for the Si4732. 3 boards = #1 + spare + #2. Headers not included (owned) |
| 2 | Nylon M2.5 standoff + screw set (380 pcs, 6–12 mm F-F/M-F) | Adafruit 3299 | $16.95 | 1 | $16.95 | in stock | https://www.adafruit.com/product/3299 | Mount Perma-Proto, Quads, LCD, PC-3 in the printed case |
| 3 | USB C to Micro B cable 1 m (5.1k pulldown) | Adafruit 3878 | $3.50 | 1 | $3.50 | in stock | https://www.adafruit.com/product/3878 | USB-C power bank → Teensy; skip if a C→micro cable is owned |
| 4 | Premium F/M jumper wires 20 × 6″ | Adafruit 1954 | $1.95 | 2 | $3.90 | in stock | https://www.adafruit.com/product/1954 | Female ends on the Teensy's downward pins (~17) + ESP32; male end into the Perma-Proto |
| | **Subtotal** | | | | **$28.30** | | | |

Optional:
| # | Item | Source | Unit | Qty | Line | Note |
|---|---|---|---|---|---|---|
| 5 | 36-pin female header, 5-pack | Adafruit 598 | $2.95 | 1 | $2.95 | Only if the Feb-DIO female strips are gone (Audio Shield 2×14 socket). In stock |
| 6 | 2 mm hex key | any hardware store | ~$2 | 1 | — | Micro knob set screws; only if none owned |
| 7 | AM ferrite loopstick ~500 µH | no verified US listing found (searched Tindie/DigiKey/Mouser) | — | 1 | — | Optional per user; salvage from an old AM radio. Unverified |

Alternative to #1: Amplified Parts P-PC-SODIP-16, $1.95 per 5, in stock per search snippet (page returned 403, so unverified directly); separate order + shipping, so Adafruit 1207 is simpler. Chip Quik PA0006 at DigiKey US ≈$4.09 each (search result). SparkFun has no SOIC-16 adapter (only SSOP-16 BOB-13994, SOIC-8 BOB-13655). SchmalzTech ST-SOIC-16 DigiKey page not reachable (unverified).

Totals: required $3.95; recommended set $28.30; with optional female headers $31.25. Plus Florida sales tax (Miami-Dade 7%, unverified) and Adafruit shipping (unverified, ~$5–10 USPS).

Not for the US list: power bank (Spain), Diotronic parts, DigiKey parts (arriving), 2nd Perma-Proto (no longer needed).

## 3. Inconsistencies and risks

1. **Teensy 3.3 V budget.** Everything runs from the Teensy 3V3 pin (PJRC limit ≈250 mA): LCD incl. backlight (tens of mA up to ~100 mA, unverified), Audio Shield, GPS (~30 mA), OLED, Si4732, MAX9814, 7 Quad NeoPixels, CAP1188, ADS, MCP. Plausibly near the limit. prototype.html only says "measure". Mitigation without purchase: LCD "3-5V" pin to 5 V (Teensy VIN) and keep Quad NeoPixel brightness low.
2. **No 5 V source designed for the ESP32.** prototype.html says "own 3.3 V from 5 V (its USB or regulator)", but the build has no 5 V rail and Teensy VIN is in the shield-covered row. Needs either a 2nd power-bank port + USB-C cable, or a wire from the VIN joint on top of the Teensy. Decide before the case.
3. **Firmware vs. claimed features:** platformio `-D USB_AUDIO_SERIAL` = no USB MIDI, while prototype.html says micro-USB = "Power + USB MIDI + USB Audio" (needs `USB_MIDI_AUDIO_SERIAL`). No USBHost_t36 code for the MIDI keyboard (CAB-28389). No PSRAM use (EXTMEM). `[env:esp32]` uses `board = esp32dev` but the owned board is an ESP32-S2 (Thing Plus WRL-17743); the ESP32 code still carries TinyGPSPlus from the old design. `[env:teensy41_test]` still pulls Encoder + NeoPixel (v0.3).
4. **Missing decoupling in the layout:** prototype.html has no 100 nF on MCP23017 (pin 9) or MCP6002 (pin 8); assembly.html v0.3 had one for the MCP. 100 nF total = 1 (Si4732) + 5 (faders) + 2 = 8; Diotronic buys 10 but ref CER10463 is **backorder** — the radio cannot be decoupled without it. Also backorder: 100k, 10k, DIP-8 socket (take the in-stock turned-pin 308).
5. **bom.html Still Needed is stale vs. Diotronic doc:** says SOIC adapter and AM ferrite come from "the next Diotronic visit" (not sold there); lists MCP6002 ×2 and SPDT ×2 "one per prototype" against the "#1 only" budget decision (SPDT owned, not in Diotronic doc); omits the DIP-8 socket; "Not counted: ESP32-S2" although Phase 7 is back in v1.
6. **bom.html vs. photo inventory:** bom records Feb-DIO 100 nF ×10, 10k ×20, 10 µF ×5, male/female 40-pin ×3 each, DIP-28 ×2; the 2026-10-21 photos show none of these (STATUS: "treat as missing"). Diotronic list re-buys the passives; the headers and DIP-28 sockets are only covered by the Feb purchase.
7. **5-way nav switch:** in bom (Adafruit P504) but not in the photos; Adafruit 504 is out of stock now; its legs are off the 0.1″ grid, so the PC-3 perfboard needs bent legs or drilled holes.
8. **Physical fit on the Perma-Proto:** ADS1115 (≈28×18 mm) on rows 28–37 left and MAX9814/OLED on the right half of the same rows: the board bodies overhang the centre gap and each other. OLED (≈27 mm square) on rows 33–36 covers ~11 columns and is a display meant for the panel ("radio window" in prototype-v1.html). Dry-fit; mount OLED on the panel by 4 wires (prototype.html already allows it), ADS body over the outer edge.
9. **Row count:** prototype.html says the Perma-Proto has 60 rows; STATUS (2026-10-21) says the EIC-104 is numbered to row 63 "matching the Perma-Proto row for row". Layout uses ≤60, no impact; confirm on the board.
10. **Si4732 clock pins unconfirmed** (crystal across RCLK 13 / GPO3 2). Fallback without purchase: `RADIO_CLOCK_CRYSTAL 0` and a 32.768 kHz PWM from a free PWM pin (e.g. 33, then MCP INTA is lost).
11. **Concept page (prototype-v1.html)** claims "every control is a part we own or have on order", but shows a telescopic antenna and a USB-C panel port neither owned nor in the prototype build.
12. **Pin map: no conflicts found.** prototype.html and config.h agree: Wire2 24/25; SPI1 26/27/39 + CS 38, DC 37, RST 36; Serial7 RX 28 / TX 29; Quad INT 32; MCP INTA 33; radio RST 34; CAP IRQ 35; fader 5 = 40; 41 spare; 30/31 free. I2C map has no clashes (0x10, 0x11, 0x20, 0x29, 0x3C, 0x48, 0x49, 0x4A on Wire2; 0x0A on Wire). STEMMA cables: chain needs 1× 4209 + 2× 4397; ordered 3 + 3 (4 spares). Known duplicate: CAB-28389 ×2 (spare).
13. **Prototype.html title** still says "on two 830-point breadboards" while the body says one Perma-Proto; cosmetic.

## 4. Physical checks (not knowable from files/photos)

1. Kit box: Feb-Diotronic male and female 40-pin header strips (shield socket 2×14, SOIC adapter 16, USB-host 5) and the 2 DIP-28 sockets. If the female strips are gone, add Adafruit 598.
2. 5-way nav switch (Adafruit P504) received and present.
3. All 5 slide pots present (3 seen).
4. Power bank port types and whether a USB-C → micro-B cable is owned (drops item 3); 2 mm hex key.
5. DigiKey box today vs. the CSV (11 lines).

## 5. Decisions (2026-10-21, after the review)

- **Power:** USB power bank (Spain, ~5,000 mAh, 2 outputs, no auto-off), **outside the case** on the back (printed cradle or strap). Output 1 → Teensy, output 2 → ESP32-S2 USB-C. This fixes risk #2. No PowerBoost/LiPo.
- **Nav switch:** P504 not found and out of stock → Adafruit ANO 6310 (5-way + wheel, I2C, pre-soldered), cut A1 → 0x4B. MCP GPA0–4 freed; front-panel cable 10 → 5 wires. Firmware driver still to write.
- **Single source:** everything US from Adafruit (SparkFun has no SOIC-16 adapter and only 4-40 standoffs).
- **Miami order (Adafruit), $56.55:** 1207, 3299, 6310, 1606, 1954 ×2, 1950 ×2 (266 out of stock), 598. If needed: 4210 STEMMA QT cable, 3878 C→micro-B cable.
