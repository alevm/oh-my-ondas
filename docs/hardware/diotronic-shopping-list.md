OH MY ONDAS — SHOPPING LIST
============================================================
Two sources only: Diotronic (walk-in) + BricoGeek (online 24h)

ALREADY HAVE (do NOT buy)
  - Teensy 4.1 (from Antratek Belgium)
  - Audio Shield Rev D
  - ESP32-WROOM DevKit
  - microSD card
  - Power bank
  - USB cable

============================================================
1. DIOTRONIC — Carrer Muntaner 49, 08011 Barcelona
   Mon-Fri 9:00-13:30 & 16:00-19:15 | Sat 10:00-13:30
   All prices include 21% IVA
============================================================

 #  Ref             Description                      Qty   €/unit    Total
--- --------------- -------------------------------- ----- -------- --------
 1  VTBB2N          Breadboard 830 pts                 2     6.53    13.06
 2  WJW140          Jumper wires 140 pcs               2     5.63    11.26
 3  MDIO9092        OLED SSD1306 0.96" I2C             1     8.29     8.29
 4  EC11E2020SW     Rotary encoder EC11 w/switch      13     4.54    59.02
 5  DTS61N          Tactile button 6x6mm              16     0.24     3.84
 6  (ask counter)   Slide pot 45mm 10K linear          5     2.50    12.50
 7  MDIO3212        WS2812B 8-LED NeoPixel ring        1     5.87     5.87
 8  VTCFT1          Copper tape 5mm x 25m              1     8.45     8.45
 9  CBS35           Jack 3.5mm stereo chassis          3     0.76     2.28
10  40PY            Pin header male 40-pin             3     0.79     2.37
11  40SYA           Pin header female 40-pin           3     0.99     2.97
12  1035025         Resistor 10K 1/4W                 20     0.02     0.40
13  CER10463        Cap 100nF ceramic                 10     0.12     1.20
14  ELR10025        Cap 10uF electrolytic              5     0.05     0.25
15  (ask counter)   MCP23017-E/SP DIP-28 (I/O exp.)   2     3.50     7.00
    Alt: PCF8575 DIP-24 if MCP23017 not in stock
16  (ask counter)   28-pin DIP IC socket               2     0.50     1.00
                                                              ----------
                                              DIOTRONIC    139.76 €

TOOLS (if needed)
--- --------------- -------------------------------- ----- -------- --------
17  VTSS4N          Soldering station 48W              1    17.15    17.15
18  HIF00637        Solder wire 1mm 100g               1     7.50     7.50
19  PDS             Flux paste                         1     3.18     3.18
20  VTHH7           Third hand 4-arm                   1    24.95    24.95
                                                              ----------
                                                    TOOLS     52.78 €

============================================================
2. BRICOGEEK — Single online order, 24h shipping
   https://tienda.bricogeek.com
   Free shipping over 60 €
============================================================

 #  Item                                          Qty    Price
--- --------------------------------------------- ----- --------
 1  CAP1188 capacitive touch 8ch I2C/SPI            1    10.95
    (replaces MPR121 — same 8 pads, I2C, IRQ)
    https://tienda.bricogeek.com/sensores-capacitivos/647-sensor-capacitivo-cap1188-i2c-spi.html

 2  ADS1115 16-bit ADC 4ch Adafruit                 1    16.95
    https://tienda.bricogeek.com/herramientas-medicion/1130-conversor-adc-16-bits-4-canales-ads1115.html

 3  Fermion 3.5" ILI9488 Capacitive Touch LCD       1    39.50
    480x320, SPI, GT911 5-point touch, MicroSD
    https://tienda.bricogeek.com/pantallas-lcd/1751-pantalla-lcd-tactil-capacitiva-fermion-480x320.html

 4  Mini joystick 5-way navigation (Adafruit 504)   1     5.00
    4 directions + center press
    https://tienda.bricogeek.com/pulsadores-y-teclados/2034-mini-joystick-de-navegacion-4-posiciones-con-pulsador.html

                                              Subtotal    72.40
                                              Shipping     0.00 (free >60€)
                                                        --------
                                             BRICOGEEK    72.40 €

============================================================
FIRMWARE CHANGES NEEDED (parts differ from original BOM)
============================================================
  - MPR121 → CAP1188: swap Adafruit_MPR121 lib for Adafruit_CAP1188
    Same I2C bus, 8 channels (exact match for 8 pads), has IRQ
  - 5" LCD → 3.5" LCD: same ILI9488 SPI driver, same pins
    Resolution stays 480x320, no code change needed
  - Joystick: Adafruit 504 is 4-dir + center push, matches
    current JOY_UP/DOWN/LEFT/RIGHT/CENTER enum

============================================================
GRAND TOTAL
============================================================
  Diotronic (walk-in Barcelona)               139.76 €
  BricoGeek (online, 24h delivery)             72.40 €
                                            -----------
  TOTAL (parts only)                          212.16 €
  Tools (if needed)                          + 52.78 €
