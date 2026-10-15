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

#include <Wire.h>
#include <Adafruit_CAP1188.h>

// Wire2 = SDA 25 / SCL 24: free past the Audio Shield edge.
// (Wire1 on 16/17 sits inside the shield's sockets.)
#define TOUCH_BUS Wire2
#define TOUCH_BUS_NAME "Wire2 (SDA 25, SCL 24)"

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

void setup() {
    Serial.begin(115200);
    while (!Serial && millis() < 3000) {}

    Wire.begin();
    TOUCH_BUS.begin();
    scan(Wire, "Wire (SDA 18, SCL 19)");
    scan(TOUCH_BUS, TOUCH_BUS_NAME);

    if (touch.begin(0x29, &TOUCH_BUS)) {
        Serial.println("CAP1188 OK - touch each pad");
    } else {
        Serial.println("CAP1188 NOT FOUND - check wiring and 10K pull-ups");
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
