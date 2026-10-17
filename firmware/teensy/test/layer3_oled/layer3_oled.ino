// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Oh My Ondas - Layer 3 Test: SSD1306 OLED on Wire2
 *
 * 0.96" SSD1306 (128x64) sharing Wire2 with the CAP1188: SDA/SCL into the
 * CAP1188's breadboard rows, VCC -> 3.3V rail, GND -> GND rail.
 *
 * Pass criteria (Serial Monitor, 115200):
 *   - Wire2 scan shows 0x29 (CAP1188) and 0x3C (OLED)
 *   - "OLED OK"; display shows "Oh My Ondas", a frame and a counter
 *     that counts up once per second
 */

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#define UI_BUS Wire2

Adafruit_SSD1306 oled(128, 64, &UI_BUS, -1);

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

    // begin() does not check for an ACK, so probe the address first
    UI_BUS.beginTransmission(0x3C);
    if (UI_BUS.endTransmission() != 0 || !oled.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
        Serial.println("OLED NOT FOUND at 0x3C");
        return;
    }
    Serial.println("OLED OK");
}

void loop() {
    static uint32_t n = 0;
    oled.clearDisplay();
    oled.drawRect(0, 0, 128, 64, SSD1306_WHITE);
    oled.setTextColor(SSD1306_WHITE);
    oled.setTextSize(2);
    oled.setCursor(6, 8);
    oled.print("Oh My");
    oled.setCursor(6, 26);
    oled.print("Ondas");
    oled.setTextSize(1);
    oled.setCursor(6, 50);
    oled.printf("Wire2 OK  %lu", n++);
    oled.display();
    delay(1000);
}
