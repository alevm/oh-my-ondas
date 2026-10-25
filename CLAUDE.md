# Oh My Ondas — instructions for Claude

## Primary directive: verify yourself first

Before every answer, verify it yourself: flash a probe or test sketch and read the serial output, scan the pins, read the docs/config. Answer with what you measured. Hand the user a check only when no tool can see it (meter readings, what the screen shows), and say why.

## Flashing the Teensy: only through `firmware/flash.sh`

Never call teensy_loader_cli or `pio run -t upload` directly. The changed path decides the loop:

| Changed | Command | Loop |
|---|---|---|
| `firmware/teensy/test/**` (bench_all, layer tests) | `firmware/flash.sh bench` | fast: build, flash now |
| main firmware (`firmware/teensy/*`, `include/`, `common/`, `esp32/`, `platformio.ini`) | `firmware/flash.sh teensy41` | gated: committed, pushed, Firmware Build fully green, then flash |

A change touching both is gated. Before each flash, state the expected status line values; after, compare them with what the script printed (it logs every flash in CHANGES.md).
