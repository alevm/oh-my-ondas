// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Oh My Ondas - Layer 4 Test: faders on ADS1115 + Teensy ADC
 *
 * ADS1115 on Wire2 next to the CAP1188/OLED (ADDR -> GND = 0x48),
 * VDD 3.3V. Faders 1-4: track ends to GND/3.3V, wiper to A0-A3.
 * Fader 5: wiper to Teensy pin 40 (A16). 3.3V only - never 5V.
 *
 * Pass criteria (Serial Monitor, 115200):
 *   - Wire2 scan shows 0x48
 *   - Each fader sweeps its column from ~0 to max (ADS ~26400 at the
 *     default +/-4.096V range, Teensy ~1023) and holds steady when left alone
 */

#include <Wire.h>
#include <Adafruit_ADS1X15.h>

#define UI_BUS Wire2
#define FADER5_PIN 40

Adafruit_ADS1115 ads;
bool adsOk = false;

void setup() {
    Serial.begin(115200);
    while (!Serial && millis() < 3000) {}

    UI_BUS.begin();
    Serial.print("Wire2 (SDA 25, SCL 24):");
    for (uint8_t addr = 1; addr < 127; addr++) {
        UI_BUS.beginTransmission(addr);
        if (UI_BUS.endTransmission() == 0) Serial.printf(" 0x%02X", addr);
    }
    Serial.println();

    adsOk = ads.begin(0x48, &UI_BUS);
    Serial.println(adsOk ? "ADS1115 OK" : "ADS1115 NOT FOUND at 0x48");
    Serial.println("   A0     A1     A2     A3   pin40");
}

void loop() {
    for (int ch = 0; ch < 4; ch++) {
        Serial.printf("%6d ", adsOk ? ads.readADC_SingleEnded(ch) : -1);
    }
    Serial.printf("%6d\n", analogRead(FADER5_PIN));
    delay(200);
}
