# Prototype #1: feasibility and next steps (updated 2026-10-28)

Bench rule: everything stays in `test/bench_all`, all parts running at once. Flash with `firmware/flash.sh bench`.
Carts: only through `firmware/tools/cart_check.py` (plan `docs/hardware/parts-plan.csv`).
Parts are ORDERED until picked up and counted.

## 1. Orders

| Order | Contents | Cost | State |
|---|---|---|---|
| DigiKey 102318278 | Quad x2, MAX9814, 4397 x3, 4209 x3, PSRAM x2, USB Host cable x2, Perma-Proto, SI4732-A10 x2, logic analyzer | EUR 91.62 | through customs, pickup 2026-10-29 |
| Diotronic online | core list (`diotronic-order-2026-10-21.md`); whether the "later" sensors are in it: check at pickup | quote EUR 29.78 | ready, pickup 2026-10-29 |
| Adafruit 1 #3770949-8350099476 | 1207, 6310, 4210 | $26.65 | Preparing for Shipment, to Miami |
| Adafruit 2 | NeoTrellis 3954 + keypad 1611 | $25.44 | ordered 2026-10-28, to Miami |

Expected in Miami 2-6 Nov (Adafruit ships in 1-2 business days, USPS Ground Advantage 2-5, not guaranteed). They reach the bench after the trip (departure from the US 12 Nov).

**Add at the Diotronic counter on 29 Oct:** CBS35 x2 (LINE OUT, piezo in), DTS64N x9 (9.5 mm buttons, unless the case prints plungers), TM2.5X5-20 x1 (screws: 20 F-F standoffs need 40), the later sensors if not in the online order (MPU9250 EUR 10.60, BMP280 6.96, 100MH 1.88, SOL1N 4.24, CR3C4PS 3.93), slide pots if fewer than 5 are found.

## 2. Feasibility review

| Area | Verdict | Risk | Mitigation / check |
|---|---|---|---|
| Bench round (Quads, MAX9814, piezo buffer, PC-3) | feasible now | none known | bench_all ready (f624ff9, built, not flashed). Gate: push + Firmware Build green (platformio.ini changed) |
| Wire2 address map | no clash | - | 0x0C, 0x10, 0x11, 0x20, 0x29, 0x2E NeoTrellis, 0x3C, 0x48, 0x49, 0x4A, 0x4B ANO, 0x68, 0x76 |
| NeoTrellis on the Teensy | feasible | its bus pull-ups go to 3.3 V or VIN via solder jumper SJ4 (schematic); 5 V pull-ups would hit the Teensy (not 5 V tolerant) | power it alone at 5 V, measure SDA to GND = 3.3 V before connecting. Own AP2112 3.3 V regulator and MOSFET level shifter (schematic) |
| NeoTrellis power | feasible | 16 NeoPixels | VIN from 5 V (the LCD's VIN wire on the shield), never the 3.3 V rail; low brightness |
| NeoTrellis connector | needs wires | JST-PH 4-pin, not STEMMA QT | 4 wires to the pads (owned wire) |
| NeoTrellis firmware | to write | - | Adafruit_NeoTrellis is in the seesaw library already used for the Quads; driver in bench_all, then main firmware (gated) |
| Pads on the panel | feasible | 60 x 60 mm vs 51 mm pad block | block moves 6 mm left, 2 mm left to the LCD; CAP1188 stays on the bench (copper) or leaves the case |
| ANO | feasible | driver not written | cut A1 -> 0x4B; STEMMA QT in the chain |
| Radio Si4732 | feasible, one open point | crystal pins from the datasheet pinout (2 GPO3, 13 RCLK) not tried | fallback: `RADIO_CLOCK_CRYSTAL 0` + 32.768 kHz PWM from a free pin. Needs the 1207 (after the trip) |
| 3.3 V budget | risk | estimate 180-260 mA vs ~250 mA from the Teensy 3V3 pin | LCD and NeoTrellis on 5 V; measure the total once all is on |
| Mounting | short | 20 screws for 20 F-F standoffs; standoff count unknown | 1 bag of screws at the counter; count mounting holes on arrival |
| Buttons through the lid | short | owned DTS61N are 4.3 mm | DTS64N 9.5 mm or printed plungers |
| Jacks | short | LINE OUT and piezo need case jacks | CBS35 x2 |
| Case layout | design | Teensy micro-USB and the shield headphone jack must reach one case edge; MAX9814 moves to the lid by the mic hole (5 wires) | decided when the open frame (stage 2) is built |
| Case depth, encoder spacing | unknown | - | measure the Quads, faders, LCD and stack in stage 2 |
| PSRAM | feasible | fine SMD soldering | only needed for long captures (phase 9); the 2 s room capture runs in RAM2 |
| Faders | check | 5 bought, 3 seen in the 10-21 photos | count at home |

## 3. Next steps

**Tonight**
- Push f624ff9 (user: `! git -C ~/Current/Sisyphus/projects/ohmyondas.levm.eu push`), Firmware Build green.

**Thu 29 Oct: pickup and bench**
1. Collect DigiKey + Diotronic, add the counter items above, count everything (`cart_check --plan` after updating the plan).
2. Flash bench_all before wiring. Expect: CAP, OLED, ADS, GPS, MCP OK; Q1 Q2 `--`; mic and pz ~0; audio mem <= 10/24; CPU < 10 %.
3. MAX9814 -> LINE-IN L. Expect a few % in a quiet room, > 50 % on a clap (estimate).
4. Piezo buffer (MCP6002, rows 39-45) -> LINE-IN R. Expect pin 1 ~1.65 V DC, > 30 % on a tap (estimate).
5. 100 nF at every chip.
6. Quads: 7 EC11 (4 + 3), cut A0 on Quad #2; Q1 Q2 OK, every encoder counts both ways.
7. PC-3 front panel: 5 nav + 4 buttons on the MCP.
8. Room demo with the real mic and piezo; tune levels and thresholds; commit the demo after approval.

**29-31 Oct, before the trip**
- Copy the bench 1:1 onto the Perma-Proto when 2-8 run together without errors.
- Stage 2 open frame: two A5 plates on standoffs; measure heights for the case.
- Write the NeoTrellis and ANO drivers into bench_all (compile only; hardware after the trip).

**After the trip (from ~13 Nov)**
- Bring orders 1 + 2 back. ANO, NeoTrellis (SJ4 check first), then the radio on the 1207.
- Main firmware: NeoTrellis pads and ANO (gated flash).
- Case model in OpenSCAD from the stage 2 measurements; print at Espai STEAM Can Fabra.
- Later layers: IMU, barometer, coil + solar with the rotary switch.
