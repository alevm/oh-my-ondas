# Oh My Ondas - Hardware Pinout Reference

## Teensy 4.1 Pin Assignments

```
                    TEENSY 4.1
                  ┌───────────┐
              GND │ GND   VIN │ 5V (USB/Battery)
               0  │ 0      G  │ GND
               1  │ 1     3.3V│ 3.3V
               2  │ 2      23 │ I2S LRCLK (Audio)
    ENC1_CLK   3  │ 3      22 │ 
    ENC1_DT    4  │ 4      21 │ I2S BCLK (Audio)
    ENC1_SW    5  │ 5      20 │ I2S IN (Audio)
    ENC2_CLK   6  │ 6      19 │ SCL (I2C)
    ENC2_DT    7  │ 7      18 │ SDA (I2C)
    ENC2_SW    8  │ 8      17 │ ESP32_TX
    ENC3_CLK   9  │ 9      16 │ ESP32_RX
    ENC3_DT   10  │ 10     15 │ 
    ENC3_SW   11  │ 11     14 │ 
    ENC4_CLK  12  │ 12     13 │ 
              3V3 │ 3.3V   GND│ GND
    ENC4_DT   24  │ 24     41 │
    ENC4_SW   25  │ 25     40 │
    BTN_MODE  26  │ 26     39 │
    BTN_SHIFT 27  │ 27     38 │
    BTN_REC   28  │ 28     37 │
    BTN_PLAY  29  │ 29     36 │
    LED_PIN   30  │ 30     35 │
    LED_GPS   31  │ 31     34 │
    LED_WIFI  32  │ 32     33 │ LED_ERROR
                  └───────────┘
                  
    Built-in SD Card: Uses dedicated pins
    USB: Native USB port
```

## I2C Devices (Pins 18, 19)

| Device | Address | Function |
|--------|---------|----------|
| MPR121 | 0x5A | Touch sensor (8 pads) |
| SSD1306 | 0x3C | OLED display 128x64 |
| (Optional) | 0x68 | RTC module |

## Audio Shield Connections

The Teensy Audio Shield connects via the following dedicated pins:
- **I2S Data In**: Pin 20
- **I2S Data Out**: Pin 7
- **I2S BCLK**: Pin 21
- **I2S LRCLK**: Pin 23
- **I2C (Codec)**: Pins 18, 19 (shared bus)
- **SD Card**: Built-in (SDIO)

## Encoder Wiring

Each encoder requires 3 pins (CLK, DT, SW):

```
Encoder     CLK   DT    SW    Function
────────────────────────────────────────
ENC1 (MIX)   3     4     5    Source levels / Scene morph
ENC2 (FX)    6     7     8    Effect select / FX params
ENC3 (MOD)   9    10    11    Mod depth / LFO rate
ENC4 (TIME) 12    24    25    Tempo / Swing
```

## Button Wiring

All buttons use internal pullup (active LOW):

```
Button      Pin   Function
──────────────────────────────
MODE         26   Cycle modes (LIVE→PATTERN→SCENE→DUB→AI)
SHIFT        27   Hold for alternate functions
REC          28   Start/stop recording
PLAY         29   Start/stop playback
```

## Touch Sensor (MPR121)

8 touch electrodes connected to copper tape pads:

```
Pad    MPR121 Pin   Function
────────────────────────────────
PAD1   IRQ0         Sample trigger / Track 1
PAD2   IRQ1         Sample trigger / Track 2
PAD3   IRQ2         Sample trigger / Track 3
PAD4   IRQ3         Sample trigger / Track 4
PAD5   IRQ4         Sample trigger / Track 5
PAD6   IRQ5         Sample trigger / Track 6
PAD7   IRQ6         Sample trigger / Track 7
PAD8   IRQ7         Sample trigger / Track 8
```

Touch sensitivity can be adjusted in firmware.

## LED Ring (NeoPixel WS2812B)

8 addressable RGB LEDs on pin 30:

```
LED    Position    Primary Use
────────────────────────────────
LED0   12 o'clock  Step 1 / Pad 1 feedback
LED1   1:30        Step 2 / Pad 2 feedback
LED2   3 o'clock   Step 3 / Pad 3 feedback
LED3   4:30        Step 4 / Pad 4 feedback
LED4   6 o'clock   Step 5 / Pad 5 feedback
LED5   7:30        Step 6 / Pad 6 feedback
LED6   9 o'clock   Step 7 / Pad 7 feedback
LED7   10:30       Step 8 / Pad 8 feedback
```

## ESP32 Communication (Serial2)

```
Teensy Pin    ESP32 Pin    Function
──────────────────────────────────────
16 (RX2)      TX           Data from ESP32
17 (TX2)      RX           Data to ESP32
GND           GND          Common ground
3.3V          3.3V         Power (or use separate reg)
```

Baud rate: 115200

## Power Distribution

```
                    ┌─────────────┐
    USB-C ──────────┤ TP4056      ├──── 5V Out
    (5V)            │ Charger     │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   LiPo      │
                    │  3500mAh    │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────▼─────┐ ┌────▼────┐ ┌─────▼─────┐
        │  3.3V     │ │  5V     │ │  3.3V     │
        │  LDO      │ │  Boost  │ │  LDO      │
        │ (Teensy)  │ │ (Audio) │ │ (ESP32)   │
        └───────────┘ └─────────┘ └───────────┘
```

## Expansion Headers (Future)

Reserved pins for future expansion:
- **Pin 14**: SPI CS (external flash)
- **Pin 15**: SPI MOSI
- **Pin 33-41**: GPIO expansion
- **Pin 22**: Additional I/O

## Notes

1. **Power consumption**: ~200mA typical, ~400mA peak (audio + WiFi)
2. **I2C speed**: 400kHz (fast mode)
3. **Audio latency**: Target <10ms
4. **Touch debounce**: 10ms in software
5. **Encoder steps**: 4 pulses per detent (divide by 4)
