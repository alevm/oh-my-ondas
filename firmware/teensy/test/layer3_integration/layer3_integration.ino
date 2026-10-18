// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Oh My Ondas - Layer 3 Test: LCD + I2C devices together
 *
 * For rebuilding the stack one step at a time: run after each change.
 * LCD (P1770) on SPI1: CLK 27, MOSI 26, MISO 39, CS 38, D/C 37, RST 36.
 * Wire: SGTL5000 (0x0A, answers only while MCLK runs).
 * Wire2 (SDA 25, SCL 24): CAP1188 (0x29), OLED (0x3C), optional.
 *
 * Pass criteria (Serial Monitor 115200, and the same report on the LCD):
 *   - "LCD power 0x94 pixfmt 0x05", fill time ~180 ms
 *   - Wire shows 0x0A
 *   - Wire2 shows whatever is connected at this step, nothing unexpected
 *   - OLED, when present, shows "Oh My Ondas"
 */

#include <Audio.h>
#include <SPI.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ILI9341.h>
#include <Adafruit_SSD1306.h>

#define LCD_CS   38
#define LCD_DC   37
#define LCD_RST  36
#define UI_BUS   Wire2

AudioOutputI2S   i2sOut;  // starts MCLK so the SGTL5000 answers on I2C
Adafruit_ILI9341 lcd(&SPI1, LCD_DC, LCD_CS, LCD_RST);
Adafruit_SSD1306 oled(128, 64, &UI_BUS, -1);

String scan(TwoWire& bus) {
    String found;
    for (uint8_t addr = 1; addr < 127; addr++) {
        bus.beginTransmission(addr);
        if (bus.endTransmission() == 0) {
            char s[6];
            snprintf(s, sizeof(s), " %02X", addr);
            found += s;
        }
    }
    return found.length() ? found : String(" none");
}

void report(int y, const String& line, uint16_t color = ILI9341_WHITE) {
    Serial.println(line);
    lcd.setTextColor(color, ILI9341_BLACK);
    lcd.setCursor(8, y);
    lcd.print(line);
}

void setup() {
    Serial.begin(115200);
    while (!Serial && millis() < 3000) {}
    AudioMemory(4);

    SPI1.setMISO(39);
    lcd.begin();
    uint8_t power = lcd.readcommand8(ILI9341_RDMODE);
    uint8_t pixfmt = lcd.readcommand8(ILI9341_RDPIXFMT);
    unsigned long t = millis();
    lcd.fillScreen(ILI9341_BLACK);
    unsigned long fillMs = millis() - t;
    lcd.setRotation(1);
    lcd.setTextSize(2);

    bool lcdOk = power == 0x94 && pixfmt == 0x05;
    report(10, "LCD power 0x" + String(power, HEX) + " pixfmt 0x" + String(pixfmt, HEX),
           lcdOk ? ILI9341_GREEN : ILI9341_RED);
    report(35, "LCD fill " + String(fillMs) + " ms");

    Wire.begin();
    UI_BUS.begin();
    String w = scan(Wire), w2 = scan(UI_BUS);
    report(70, "Wire :" + w, w.indexOf("0A") >= 0 ? ILI9341_GREEN : ILI9341_RED);
    report(95, "Wire2:" + w2, ILI9341_CYAN);

    if (w2.indexOf("3C") >= 0 && oled.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
        oled.clearDisplay();
        oled.setTextColor(SSD1306_WHITE);
        oled.setTextSize(2);
        oled.setCursor(6, 20);
        oled.print("Oh My");
        oled.setCursor(6, 40);
        oled.print("Ondas");
        oled.display();
        report(120, "OLED OK", ILI9341_GREEN);
    } else {
        report(120, "OLED not present");
    }
    if (w2.indexOf("29") >= 0) report(145, "CAP1188 present", ILI9341_GREEN);
}

void loop() {}
