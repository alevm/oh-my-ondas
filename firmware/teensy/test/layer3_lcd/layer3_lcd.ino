// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Oh My Ondas - Layer 3 Test: ILI9341 2.8" LCD on SPI1
 *
 * Adafruit P1770 in SPI mode (IM1, IM2, IM3 jumpers closed on the back).
 * SPI1 sits on pins past the Audio Shield edge; MISO1 defaults to pin 1
 * (under the shield), so it is moved to 39.
 *
 * Wiring (SPI-row pins only): 3-5V -> 3.3V, GND -> GND, CLK -> 27,
 * MOSI -> 26, MISO -> 39, CS -> 38, D/C -> 37, RST -> 36. Lite unconnected.
 * Keep the LCD itself out of the breadboard and leave the 8-bit row
 * (including its PWR pins) unconnected: with the board plugged in and
 * powered from that row, the controller answered but the panel stayed white.
 *
 * Pass criteria (Serial Monitor, 115200):
 *   - "LCD power mode 0x94", "LCD pixel format 0x05" (read back over MISO)
 *   - Screen shows colour bars and "Oh My Ondas" text
 *   - "Fill test: N ms" printed (full-screen redraw time)
 */

#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ILI9341.h>

#define LCD_CS   38
#define LCD_DC   37
#define LCD_RST  36

Adafruit_ILI9341 lcd(&SPI1, LCD_DC, LCD_CS, LCD_RST);

void setup() {
    Serial.begin(115200);
    while (!Serial && millis() < 3000) {}

    SPI1.setMISO(39);
    lcd.begin();
    Serial.printf("LCD power mode 0x%02X\n", lcd.readcommand8(ILI9341_RDMODE));
    Serial.printf("LCD pixel format 0x%02X\n", lcd.readcommand8(ILI9341_RDPIXFMT));

    unsigned long t = millis();
    lcd.fillScreen(ILI9341_BLACK);
    Serial.printf("Fill test: %lu ms\n", millis() - t);

    lcd.setRotation(1);
    const uint16_t bars[] = {ILI9341_RED, ILI9341_GREEN, ILI9341_BLUE,
                             ILI9341_YELLOW, ILI9341_CYAN, ILI9341_MAGENTA,
                             ILI9341_WHITE, ILI9341_DARKGREY};
    int w = lcd.width() / 8;
    for (int i = 0; i < 8; i++) lcd.fillRect(i * w, 0, w, 120, bars[i]);

    lcd.setTextColor(ILI9341_WHITE);
    lcd.setTextSize(3);
    lcd.setCursor(20, 150);
    lcd.print("Oh My Ondas");
    lcd.setTextSize(2);
    lcd.setCursor(20, 195);
    lcd.print("LCD on SPI1 OK");
}

void loop() {}
