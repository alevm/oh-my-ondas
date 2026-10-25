// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Oh My Ondas - Layer 4 Test: faders shown on the LCD, with sound and stats
 *
 * ADS1115 on Wire2 (0x48): faders 1-4 wipers on A0-A3. Fader 5 wiper on
 * Teensy pin 40. Fader ends to GND / 3.3V (never 5V). LCD on SPI1 as in
 * layer3_integration.
 *
 * Each fader is a column: live bar, value in %, lowest/highest seen and
 * noise (peak-to-peak over the last 16 readings, in % of full scale).
 * Moving a fader plays a quiet tone whose pitch follows it.
 * The same stats go to Serial (115200) once a second.
 *
 * Pass criteria per fader (column turns green):
 *   - lowest seen  <= 2 %   (reaches the bottom)
 *   - highest seen >= 95 %  (reaches the top)
 *   - noise        <= 0.5 % while left alone
 */

#include <Audio.h>
#include <Wire.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ILI9341.h>
#include <Adafruit_ADS1X15.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_CAP1188.h>

#define UI_BUS Wire2
#define FADER5_PIN 40

AudioSynthWaveformSine tone1;
AudioOutputI2S         i2sOut;
AudioSynthWaveformSine tone2;   // touch beeps
AudioMixer4            mix;
AudioConnection        pc1(tone1, 0, mix, 0);
AudioConnection        pc2(tone2, 0, mix, 1);
AudioConnection        pcL(mix, 0, i2sOut, 0);
AudioConnection        pcR(mix, 0, i2sOut, 1);
AudioControlSGTL5000   codec;

Adafruit_ILI9341 lcd(&SPI1, 37, 38, 36);
Adafruit_ADS1115 ads;
bool adsOk = false;
// earlier steps stay live: OLED shows touches + fader values, CAP1188 LEDs follow touches
Adafruit_SSD1306 oled(128, 64, &UI_BUS, -1);
Adafruit_CAP1188 touch;
bool oledOk = false, capOk = false;
uint32_t touches = 0, beepOff = 0;
uint8_t touched = 0;

const int N = 5, HIST = 16;
const float FULL[N] = {26400, 26400, 26400, 26400, 4095};  // ADS at +/-4.096 V and 3.3 V; Teensy 12-bit
float pct[N], lo[N], hi[N], noise[N];
float hist[N][HIST];
int histPos = 0;
int lastBar[N];
char lastText[N][64];
bool seenStill[N];  // an unconnected input never holds still, so it never makes sound

const int COL_W = 64, BAR_X = 18, BAR_W = 28, BAR_Y = 34, BAR_H = 120;

int readRaw(int i) {
    if (i < 4) return adsOk ? ads.readADC_SingleEnded(i) : 0;
    return analogRead(FADER5_PIN);
}

bool passed(int i) { return lo[i] <= 2 && hi[i] >= 95 && noise[i] <= 0.5; }

void drawStatic() {
    lcd.fillScreen(ILI9341_BLACK);
    lcd.setTextSize(2);
    for (int i = 0; i < N; i++) {
        int x = i * COL_W;
        lcd.setTextColor(ILI9341_WHITE);
        lcd.setCursor(x + 16, 8);
        lcd.printf("F%d", i + 1);
        lcd.drawRect(x + BAR_X - 1, BAR_Y - 1, BAR_W + 2, BAR_H + 2, ILI9341_DARKGREY);
        lastBar[i] = -1;
        lastText[i][0] = 0;
    }
    lcd.setTextSize(1);
    lcd.setTextColor(ILI9341_DARKGREY);
    lcd.setCursor(0, 230);
    lcd.print(adsOk ? "ADS1115 OK  - pass: lo<=2% hi>=95% noise<=0.5%" : "ADS1115 NOT FOUND (0x48)");
}

void drawColumn(int i) {
    int x = i * COL_W;
    int h = constrain((int)(pct[i] * BAR_H / 100), 0, BAR_H);
    if (lastBar[i] >= 0 && abs(h - lastBar[i]) < 2) h = lastBar[i];  // ignore 1-pixel jitter
    uint16_t c = passed(i) ? ILI9341_GREEN : ILI9341_ORANGE;
    if (h != lastBar[i]) {
        lcd.fillRect(x + BAR_X, BAR_Y, BAR_W, BAR_H - h, ILI9341_BLACK);
        lcd.fillRect(x + BAR_X, BAR_Y + BAR_H - h, BAR_W, h, c);
        lastBar[i] = h;
    }
    // text only when it changes, to keep the screen calm
    char text[64];
    snprintf(text, sizeof(text), "%5.0f%5.0f%5.0f%5.1f%d", pct[i], lo[i], hi[i], noise[i], passed(i));
    if (strcmp(text, lastText[i]) == 0) return;
    strcpy(lastText[i], text);
    lcd.setTextSize(1);
    lcd.setTextColor(c, ILI9341_BLACK);
    lcd.setCursor(x + 4, 162); lcd.printf("now %4.0f%%", pct[i]);
    lcd.setCursor(x + 4, 176); lcd.printf("lo  %4.0f%%", lo[i]);
    lcd.setCursor(x + 4, 190); lcd.printf("hi  %4.0f%%", hi[i]);
    lcd.setCursor(x + 4, 204); lcd.printf("nz %4.1f%%", noise[i]);
    lcd.setCursor(x + 4, 216); lcd.print(passed(i) ? "PASS  " : "      ");
}

void setup() {
    Serial.begin(115200);
    AudioMemory(8);
    codec.enable();
    codec.volume(0.3);
    tone1.amplitude(0);

    analogReadResolution(12);
    UI_BUS.begin();
    adsOk = ads.begin(0x48, &UI_BUS);
    if (adsOk) ads.setDataRate(RATE_ADS1115_860SPS);

    capOk = touch.begin(0x29, &UI_BUS);
    if (capOk) {  // same setup as layer2_pads_visual
        touch.writeRegister(0x1F, 0x3F);
        touch.writeRegister(0x20, touch.readRegister(0x20) | 0x08);
        touch.writeRegister(0x26, 0xFF);
        touch.writeRegister(0x72, 0xFF);  // LED n follows input n
    }
    oledOk = oled.begin(SSD1306_SWITCHCAPVCC, 0x3C);
    mix.gain(0, 1); mix.gain(1, 1);
    tone2.amplitude(0);

    SPI1.setMISO(39);
    lcd.begin();
    lcd.setRotation(3);
    drawStatic();

    for (int i = 0; i < N; i++) {
        lo[i] = 100; hi[i] = 0; noise[i] = 0;
        float p = readRaw(i) * 100.0f / FULL[i];
        for (int k = 0; k < HIST; k++) hist[i][k] = p;
    }
    Serial.println(adsOk ? "ADS1115 OK" : "ADS1115 NOT FOUND at 0x48");
}

void loop() {
    static int active = -1;
    static uint32_t lastMove = 0, nextPrint = 0, nextCheck = 0;
    static float amp = 0;

    for (int i = 0; i < N; i++) {
        float p = readRaw(i) * 100.0f / FULL[i];
        if (seenStill[i] && fabsf(p - pct[i]) > 1.0f) { active = i; lastMove = millis(); }
        pct[i] = p;
        lo[i] = min(lo[i], p);
        hi[i] = max(hi[i], p);
        hist[i][histPos] = p;
        float a = hist[i][0], b = a;
        for (int k = 1; k < HIST; k++) { a = min(a, hist[i][k]); b = max(b, hist[i][k]); }
        noise[i] = b - a;
        if (noise[i] < 0.3f) seenStill[i] = true;
    }
    histPos = (histPos + 1) % HIST;

    // quiet tone that follows the fader being moved, fades out when left alone
    bool moving = active >= 0 && millis() - lastMove < 300;
    amp += ((moving ? 0.15f : 0.0f) - amp) * 0.3f;
    if (active >= 0) tone1.frequency(200 + constrain(pct[active], 0.0f, 100.0f) * 8);
    tone1.amplitude(amp);

    static uint32_t nextTouch = 0, nextOled = 0;
    if (capOk && millis() > nextTouch) {
        nextTouch = millis() + 30;
        uint8_t t = touch.touched(), fresh = t & ~touched;
        for (int i = 0; i < 8; i++) if (fresh & (1 << i)) {
            touches++;
            tone2.frequency(523.25f * (1 + i / 8.0f)); tone2.amplitude(0.05f); beepOff = millis() + 120;
        }
        touched = t;
    }
    if (beepOff && millis() > beepOff) { tone2.amplitude(0); beepOff = 0; }
    if (oledOk && millis() > nextOled) {
        nextOled = millis() + 100;
        oled.clearDisplay();
        oled.setTextColor(SSD1306_WHITE); oled.setTextSize(1);
        oled.setCursor(0, 0); oled.printf("CAP %s touch %lu", capOk ? "OK" : "--", touches);
        for (int i = 0; i < 8; i++) {
            if (touched & (1 << i)) oled.fillRect(i * 16 + 1, 20, 14, 14, SSD1306_WHITE);
            else oled.drawRect(i * 16 + 1, 20, 14, 14, SSD1306_WHITE);
        }
        oled.setCursor(0, 40);
        for (int i = 0; i < N; i++) oled.printf("%d ", (int)constrain(pct[i], 0.0f, 99.0f));
        oled.setCursor(0, 54); oled.print("F1 F2 F3 F4 F5 %");
        oled.display();
    }

    static uint32_t nextDraw = 0;
    if (millis() > nextDraw) {  // 10 frames a second is enough
        nextDraw = millis() + 100;
        for (int i = 0; i < N; i++) drawColumn(i);
    }

    if (millis() > nextPrint) {
        nextPrint = millis() + 1000;
        for (int i = 0; i < N; i++)
            Serial.printf("F%d now %5.1f lo %5.1f hi %5.1f nz %5.2f %s | ", i + 1, pct[i], lo[i], hi[i],
                          noise[i], passed(i) ? "PASS" : "-");
        Serial.printf("CAP %s touches %lu OLED %s\n", capOk ? "OK" : "--", touches, oledOk ? "OK" : "--");
    }

    // the LCD sometimes resets (power mode 0x00 instead of 0x94): re-init and redraw
    if (millis() > nextCheck) {
        nextCheck = millis() + 1000;
        uint8_t mode = lcd.readcommand8(ILI9341_RDMODE);
        if (mode != 0x94) {
            Serial.printf("LCD 0x%02X - reinit\n", mode);
            lcd.begin();
            lcd.setRotation(3);
            drawStatic();
        }
    }
}
