// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Oh My Ondas - Bench test: every fitted part live at the same time
 *
 * For the incremental rebuild: everything wired so far keeps running while
 * the next part goes in, so a new part that breaks an old one shows at once.
 * Parts are found on Wire2 every second and started when they appear
 * (hot-plug), shown grey when absent, red when lost after being seen.
 *
 *   LCD     SPI1 (CLK 27, MOSI 26, MISO 39, CS 38, D/C 37, RST 36), auto re-init
 *   Audio   SGTL5000 0x0A on Wire, quiet tones (codec 0.3, tone <= 0.15)
 *   Wire2   (SDA 25, SCL 24):
 *     0x29 CAP1188   8 pads, LEDs follow touches, beep per touch
 *     0x3C OLED      touch squares + fader values
 *     0x48 ADS1115   faders 1-4 on A0-A3 (fader 5 on Teensy pin 40)
 *     0x10 GPS       PA1010D: fix, satellites, UTC time (no position shown)
 *     0x20 MCP23017  nav GPA0-4, buttons GPB0-3 (to GND, pull-ups on), beep per press
 *
 * Serial (115200): one status line a second.
 */

#include <Audio.h>
#include <Wire.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ILI9341.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_CAP1188.h>
#include <Adafruit_ADS1X15.h>

#define UI_BUS     Wire2
#define FADER5_PIN 40

AudioSynthWaveformSine faderTone, beepTone;
AudioMixer4            mix;
AudioOutputI2S         i2sOut;
AudioConnection        pc1(faderTone, 0, mix, 0), pc2(beepTone, 0, mix, 1);
AudioConnection        pcL(mix, 0, i2sOut, 0), pcR(mix, 0, i2sOut, 1);
AudioControlSGTL5000   codec;

Adafruit_ILI9341 lcd(&SPI1, 37, 38, 36);
Adafruit_SSD1306 oled(128, 64, &UI_BUS, -1);
Adafruit_CAP1188 touch;
Adafruit_ADS1115 ads;

enum { CAP, OLED, ADS, GPS, MCP, NPARTS };
const uint8_t ADDR[NPARTS] = {0x29, 0x3C, 0x48, 0x10, 0x20};
const char* NAME[NPARTS] = {"CAP", "OLED", "ADS", "GPS", "MCP"};
bool on[NPARTS], seen[NPARTS];
uint32_t lost[NPARTS];

const int NF = 5;
float pct[NF], lo[NF], hi[NF];
uint8_t touched = 0;
uint16_t mcpIn = 0xFFFF;
uint32_t touches = 0, presses = 0, lcdReinits = 0, beepOff = 0;
bool audioOk = false;
int gpsFix = -1, gpsSats = -1;
char gpsTime[9] = "--:--:--";

bool present(TwoWire& b, uint8_t a) { b.beginTransmission(a); return b.endTransmission() == 0; }

void beep(float hz) { beepTone.frequency(hz); beepTone.amplitude(0.05f); beepOff = millis() + 120; }

void mcpWrite(uint8_t reg, uint8_t v) {
    UI_BUS.beginTransmission(0x20); UI_BUS.write(reg); UI_BUS.write(v); UI_BUS.endTransmission();
}

bool startPart(int p) {
    switch (p) {
    case CAP:
        if (!touch.begin(0x29, &UI_BUS)) return false;
        touch.writeRegister(0x1F, 0x3F);  // same setup as layer2_pads_visual
        touch.writeRegister(0x20, touch.readRegister(0x20) | 0x08);
        touch.writeRegister(0x26, 0xFF);
        touch.writeRegister(0x72, 0xFF);  // LED n follows input n
        return true;
    case OLED: return oled.begin(SSD1306_SWITCHCAPVCC, 0x3C);
    case ADS:
        if (!ads.begin(0x48, &UI_BUS)) return false;
        ads.setDataRate(RATE_ADS1115_860SPS);
        return true;
    case MCP:
        mcpWrite(0x00, 0xFF); mcpWrite(0x01, 0xFF);  // all inputs
        mcpWrite(0x0C, 0xFF); mcpWrite(0x0D, 0xFF);  // pull-ups
        return true;
    default: return true;  // GPS streams NMEA on its own
    }
}

// ---------- GPS (PA1010D on I2C): read NMEA, keep fix / satellites / time from $GxGGA
char nmea[100];
int nmeaLen = 0;

void gpsLine() {
    if (strncmp(nmea + 3, "GGA", 3) != 0) return;
    char* f[16] = {0};
    int n = 0;
    for (char* t = nmea; n < 16 && t; n++) { f[n] = t; t = strchr(t, ','); if (t) *t++ = 0; }
    if (n < 8) return;
    if (strlen(f[1]) >= 6) snprintf(gpsTime, sizeof(gpsTime), "%.2s:%.2s:%.2s", f[1], f[1] + 2, f[1] + 4);
    gpsFix = atoi(f[6]);
    gpsSats = atoi(f[7]);
}

void gpsPoll() {
    UI_BUS.requestFrom(0x10, 32);
    while (UI_BUS.available()) {
        char c = UI_BUS.read();
        if (c == '$') nmeaLen = 0;
        if (c == '\n' || c == '\r') { if (nmeaLen > 6) { nmea[nmeaLen] = 0; gpsLine(); } nmeaLen = 0; continue; }
        if (c == 0x0A || c < 32) continue;
        if (nmeaLen < (int)sizeof(nmea) - 1) nmea[nmeaLen++] = c;
    }
}

// ---------- LCD layout (320x240 landscape)
const uint16_t GREY = 0x7BEF, DARK = 0x2104;

void drawStatic() {
    lcd.fillScreen(ILI9341_BLACK);
    lcd.setTextSize(1);
    lcd.setTextColor(GREY, ILI9341_BLACK);
    for (int i = 0; i < NF; i++) { lcd.drawRect(8 + i * 42, 46, 34, 102, GREY); }
    lcd.setCursor(232, 38); lcd.print("pads");
    lcd.setCursor(232, 104); lcd.print("nav  buttons");
}

void drawDynamic() {
    uint8_t p = lcd.readcommand8(ILI9341_RDMODE), f = lcd.readcommand8(ILI9341_RDPIXFMT);
    lcd.setTextSize(2);
    lcd.setCursor(8, 4);
    lcd.setTextColor(p == 0x94 && f == 0x05 ? ILI9341_GREEN : ILI9341_RED, ILI9341_BLACK);
    lcd.printf("LCD OK  up %lus  ", millis() / 1000);

    lcd.setTextSize(1);
    lcd.setCursor(8, 26);
    lcd.setTextColor(audioOk ? ILI9341_GREEN : ILI9341_RED, ILI9341_BLACK);
    lcd.print("AUDIO ");
    for (int i = 0; i < NPARTS; i++) {
        lcd.setTextColor(on[i] ? ILI9341_GREEN : (seen[i] ? ILI9341_RED : GREY), ILI9341_BLACK);
        lcd.printf("%s%s ", NAME[i], on[i] ? "" : (seen[i] ? "!" : "-"));
    }

    for (int i = 0; i < NF; i++) {  // fader bars
        bool live = i < 4 ? on[ADS] : true;
        int h = live ? (int)(constrain(pct[i], 0.0f, 100.0f)) : 0;
        int x = 9 + i * 42;
        lcd.fillRect(x, 47, 32, 100 - h, ILI9341_BLACK);
        bool pass = live && lo[i] <= 2 && hi[i] >= 95;
        lcd.fillRect(x, 147 - h, 32, h, pass ? ILI9341_GREEN : ILI9341_CYAN);
        lcd.setCursor(8 + i * 42, 152);
        lcd.setTextColor(pass ? ILI9341_GREEN : ILI9341_WHITE, ILI9341_BLACK);
        if (live) lcd.printf("F%d %3d", i + 1, (int)pct[i]); else lcd.print("F- -- ");
    }

    for (int i = 0; i < 8; i++)  // touch pads
        lcd.fillRoundRect(232 + (i % 4) * 22, 48 + (i / 4) * 24, 19, 20, 4,
                          !on[CAP] ? DARK : (touched & (1 << i)) ? ILI9341_YELLOW : 0x4208);
    for (int i = 0; i < 9; i++) {  // nav GPA0-4, buttons GPB0-3 (pressed = low)
        bool down = on[MCP] && !(mcpIn & (1 << (i < 5 ? i : i + 3)));
        int x = i < 5 ? 234 + i * 12 : 236 + i * 12;
        lcd.fillCircle(x, 122, 4, !on[MCP] ? DARK : down ? ILI9341_ORANGE : 0x4208);
    }

    lcd.setCursor(8, 172);
    lcd.setTextColor(on[GPS] ? ILI9341_WHITE : GREY, ILI9341_BLACK);
    if (on[GPS]) lcd.printf("GPS fix %d  sats %2d  UTC %s     ", gpsFix, gpsSats, gpsTime);
    else lcd.print("GPS -                                ");
    lcd.setCursor(8, 186);
    lcd.setTextColor(ILI9341_WHITE, ILI9341_BLACK);
    lcd.printf("touches %lu  presses %lu  LCD re-init %lu   ", touches, presses, lcdReinits);
    lcd.setCursor(8, 200);
    lcd.setTextColor(ILI9341_CYAN, ILI9341_BLACK);
    lcd.print("Wire2:");
    for (uint8_t a = 1; a < 127; a++) if (present(UI_BUS, a)) lcd.printf(" %02X", a);
    lcd.print("                ");
}

void drawOled() {
    oled.clearDisplay();
    oled.setTextColor(SSD1306_WHITE);
    oled.setTextSize(1);
    oled.setCursor(0, 0);
    oled.printf("touch %lu press %lu", touches, presses);
    for (int i = 0; i < 8; i++) {
        if (on[CAP] && (touched & (1 << i))) oled.fillRect(i * 16 + 1, 20, 14, 14, SSD1306_WHITE);
        else oled.drawRect(i * 16 + 1, 20, 14, 14, SSD1306_WHITE);
    }
    oled.setCursor(0, 42);
    for (int i = 0; i < NF; i++) oled.printf("%2d ", (int)constrain(pct[i], 0.0f, 99.0f));
    oled.setCursor(0, 54);
    oled.print("F1 F2 F3 F4 F5 %");
    oled.display();
}

void setup() {
    Serial.begin(115200);
    AudioMemory(10);
    codec.enable();
    codec.volume(0.3);
    mix.gain(0, 1); mix.gain(1, 1);
    faderTone.amplitude(0); beepTone.amplitude(0);
    analogReadResolution(12);
    Wire.begin();
    UI_BUS.begin();
    SPI1.setMISO(39);
    lcd.begin();
    lcd.setRotation(3);
    drawStatic();
    for (int i = 0; i < NF; i++) { lo[i] = 100; hi[i] = 0; }
    beep(660);
}

void loop() {
    static uint32_t nextScan = 0, nextFast = 0, nextDraw = 0, nextGps = 0, lastMove = 0;
    static int active = -1;
    static float amp = 0;
    uint32_t now = millis();

    if (now >= nextScan) {  // hot-plug scan, LCD check, serial line
        nextScan = now + 1000;
        audioOk = present(Wire, 0x0A);
        for (int i = 0; i < NPARTS; i++) {
            bool here = present(UI_BUS, ADDR[i]);
            if (here && !on[i]) { on[i] = startPart(i); if (on[i]) { seen[i] = true; beep(880); } }
            if (!here && on[i]) { on[i] = false; lost[i]++; beep(330); }
        }
        if (lcd.readcommand8(ILI9341_RDMODE) != 0x94) {
            lcdReinits++;
            lcd.begin(); lcd.setRotation(3); drawStatic();
        }
        Serial.printf("up %lus audio %s |", now / 1000, audioOk ? "OK" : "--");
        for (int i = 0; i < NPARTS; i++) Serial.printf(" %s %s", NAME[i], on[i] ? "OK" : (seen[i] ? "LOST" : "--"));
        Serial.printf(" | F");
        for (int i = 0; i < NF; i++) Serial.printf(" %d(%d-%d)", (int)pct[i], (int)lo[i], (int)hi[i]);
        Serial.printf(" | touch 0x%02X n %lu | mcp 0x%04X n %lu | gps fix %d sats %d %s | lcd reinit %lu\n",
                      touched, touches, mcpIn, presses, gpsFix, gpsSats, gpsTime, lcdReinits);
    }

    if (now >= nextFast) {  // inputs every 30 ms
        nextFast = now + 30;
        for (int i = 0; i < NF; i++) {
            float p;
            if (i < 4) { if (!on[ADS]) continue; p = ads.readADC_SingleEnded(i) * 100.0f / 26400; }
            else p = analogRead(FADER5_PIN) * 100.0f / 4095;
            if (fabsf(p - pct[i]) > 1.5f) { active = i; lastMove = now; }
            pct[i] = p; lo[i] = min(lo[i], p); hi[i] = max(hi[i], p);
        }
        if (on[CAP]) {
            uint8_t t = touch.touched(), fresh = t & ~touched;
            for (int i = 0; i < 8; i++) if (fresh & (1 << i)) { touches++; beep(523.25f * (1 + i / 8.0f)); }
            touched = t;
        }
        if (on[MCP]) {
            UI_BUS.beginTransmission(0x20); UI_BUS.write(0x12); UI_BUS.endTransmission();
            if (UI_BUS.requestFrom(0x20, 2) == 2) {
                uint16_t v = UI_BUS.read() | (UI_BUS.read() << 8);
                uint16_t pressed = ~v & mcpIn & 0x0F1F;  // newly low on GPA0-4 / GPB0-3
                for (int b = 0; b < 16; b++) if (pressed & (1 << b)) { presses++; beep(392 + b * 30); }
                mcpIn = v;
            }
        }
    }

    if (on[GPS] && now >= nextGps) { nextGps = now + 100; gpsPoll(); }

    bool moving = active >= 0 && now - lastMove < 300;  // quiet tone follows the moved fader
    amp += ((moving ? 0.15f : 0.0f) - amp) * 0.3f;
    if (active >= 0) faderTone.frequency(200 + constrain(pct[active], 0.0f, 100.0f) * 8);
    faderTone.amplitude(amp);
    if (beepOff && now > beepOff) { beepTone.amplitude(0); beepOff = 0; }

    if (now >= nextDraw) {
        nextDraw = now + 150;
        drawDynamic();
        if (on[OLED]) drawOled();
    }
}
