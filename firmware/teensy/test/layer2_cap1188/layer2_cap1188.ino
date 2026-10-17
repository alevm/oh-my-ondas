// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Oh My Ondas - Layer 2 Test: CAP1188 touch pads
 *
 * Wiring: CAP1188 SDA/SCL to TOUCH_BUS pins below, VIN -> 3.3V, GND -> GND,
 * one set of pull-ups (the breakout's own, or 2.2K to 3.3V if it has none).
 * Pads on C1-C8.
 *
 * Pass criteria (Serial Monitor, 115200):
 *   - Wire (18/19) scan shows 0x0A (SGTL5000), audio path untouched
 *   - Touch bus scan shows 0x29
 *   - "CAP1188 OK", then each pad prints "Pad N down/up" when touched
 */

#include <Audio.h>
#include <Wire.h>
#include <Adafruit_CAP1188.h>

// Wire2 = SDA 25 / SCL 24: free past the Audio Shield edge.
// (Wire1 on 16/17 sits inside the shield's sockets.)
#define TOUCH_BUS Wire2
#define TOUCH_BUS_NAME "Wire2 (SDA 25, SCL 24)"

// The SGTL5000 only answers on I2C while MCLK runs: an I2S object starts it.
AudioOutputI2S   i2sOut;
Adafruit_CAP1188 touch = Adafruit_CAP1188();
uint8_t lastTouched = 0;

void scan(TwoWire& bus, const char* name) {
    Serial.printf("%s:", name);
    int found = 0;
    for (uint8_t addr = 1; addr < 127; addr++) {
        bus.beginTransmission(addr);
        if (bus.endTransmission() == 0) {
            Serial.printf(" 0x%02X", addr);
            found++;
        }
    }
    Serial.println(found ? "" : " none");
}

uint8_t readReg(TwoWire& bus, uint8_t addr, uint8_t reg) {
    bus.beginTransmission(addr);
    bus.write(reg);
    bus.endTransmission(false);
    bus.requestFrom(addr, (uint8_t)1);
    return bus.available() ? bus.read() : 0;
}

void setup() {
    Serial.begin(115200);
    while (!Serial && millis() < 3000) {}

    AudioMemory(4);
    delay(10);
    Wire.begin();
    TOUCH_BUS.begin();
    scan(Wire, "Wire (SDA 18, SCL 19)");
    scan(TOUCH_BUS, TOUCH_BUS_NAME);

    // touch.begin() fails if the previous transaction on the bus was NACKed
    // (the scan ends on one); a plain register read first clears it.
    readReg(TOUCH_BUS, 0x29, 0xFD);
    bool ok = touch.begin(0x29, &TOUCH_BUS);
    if (ok) {
        Serial.println("CAP1188 OK - touch each pad");
    } else {
        // Library expects product 0x50, manufacturer 0x5D, revision 0x83
        Serial.printf("CAP1188 NOT FOUND - IDs: product 0x%02X, manuf 0x%02X, rev 0x%02X\n",
                      readReg(TOUCH_BUS, 0x29, 0xFD), readReg(TOUCH_BUS, 0x29, 0xFE),
                      readReg(TOUCH_BUS, 0x29, 0xFF));
    }
}

void loop() {
    uint8_t now = touch.touched();
    for (int i = 0; i < 8; i++) {
        bool was = lastTouched & (1 << i), is = now & (1 << i);
        if (is != was) Serial.printf("Pad %d %s\n", i + 1, is ? "down" : "up");
    }
    lastTouched = now;
    delay(10);
}
