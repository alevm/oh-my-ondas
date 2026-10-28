# Next hardware round (pickup 2026-10-29: Diotronic + DigiKey 102318278)

Bench rule: everything stays in `test/bench_all`, all parts running at once. Flash with `firmware/flash.sh bench`.
Parts are ORDERED until picked up and counted.

## 0. Count at pickup
- DigiKey: Quad 5752 x2, MAX9814 x1, 4397 x3, 4209 x3, PSRAM x2, USB Host cable x2, Perma-Proto x1, SI4732-A10 x2, logic analyzer x1.
- Diotronic: 20 lines, `docs/hardware/diotronic-order-2026-10-21.md` (check 100 nF, 100k, 10k: backorder on 10-21).

## 1. Firmware ready (bench_all, built, not yet flashed)
- Q1 0x49 / Q2 0x4A hot-plug, encoders E1-E7 (click per step, beep per press), LCD row `E ...`, serial `enc ... steps press`.
- LINE-IN L (MAX9814) / R (piezo) peak meters: OLED bars live, LCD `MIC L / PZ R` per second, serial `mic .. pz ..`. Inputs are never played or stored.
- First flash, before wiring anything new (regression check): CAP/OLED/ADS/GPS/MCP OK as before, Q1 Q2 `--`, mic and pz ~0.00, audio mem <= 10/24, cpu < 10 %.

## 2. Build order
1. **MAX9814 -> LINE-IN L.** VDD 3.3 V rail, GND, GAIN/AR open, OUT -> 1 uF (+ to MAX9814) -> LINE-IN L. Expect: `mic` idle a few %, clap > 50 %.
2. **Piezo buffer (MCP6002), bench rows 39-45.** Wiring in `web/prototype.html` rows 39-45. Second half (pins 5-7) tied off: pin 5 -> bias node, pin 7 -> pin 6. 100 nF at pin 8. Output 1 uF -> LINE-IN R for now (R is free until the radio, Nov; the MIC/PIEZO toggle on L comes with the Perma-Proto). Expect: pin 1 at ~1.65 V DC (multimeter), `pz` idle ~0, tap > 30 %.
3. **100 nF decoupling** at MCP23017 pin 9 (and every chip as it goes in).
4. **Quads.** Solder the 7 EC11 (4 on #1, 3 on #2). Cut A0 on Quad #2 (-> 0x4A). Rails -> 4209 -> Quad #1 -> 4397 -> Quad #2 (-> 4397 -> GPS if GPS moves to the chain). Expect: Q1 Q2 OK, each encoder counts both ways, presses beep. Optional: both INT -> pin 32.
5. **Front panel PC-3:** 5 nav + 4 buttons -> MCP GPA0-4 / GPB0-3 (already read by bench_all).
6. **demo_play** with the real mic + piezo: tune line-in levels, onset/classify thresholds, piezo threshold.
7. **Perma-Proto:** only after 1-6 run together without errors; copy row for row.

## 3. Waits
- Radio: Adafruit 1207 SOIC-16 adapter (US, Nov).
- ANO 6310 (US, Nov). Cable count with ANO + GPS on the chain: 3x 4397 all used, no spare.
- PSRAM: solder under the Teensy when it goes onto the shield with the female headers (needed for layer 1 captures).
