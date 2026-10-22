// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Oh My Ondas - Layer 5/6 Test: 7 encoders on 2 Quad boards + GPS, on the LCD
 *
 * STEMMA QT chain on Wire2: rails -> Quad #1 (0x49, 4 encoders) -> Quad #2
 * (0x4A, A0 jumper cut, 3 encoders) -> GPS PA1010D (0x10). LCD on SPI1 as in
 * layer3_integration.
 *
 * Each encoder is a dial: turning clicks (quiet, pitch per encoder), pressing
 * fills it, and its NeoPixel on the Quad board shows the position as a colour.
 * Bottom panel: GPS fix, satellites, position, UTC time.
 *
 * Pass criteria (turns green):
 *   - encoder: >= 10 steps each way and pressed at least once
 *   - GPS: fix (first fix outdoors or by a window, can take a minute)
 */

#include <Audio.h>
#include <Wire.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ILI9341.h>
#include <Adafruit_seesaw.h>
#include <seesaw_neopixel.h>
#include <Adafruit_GPS.h>

#define UI_BUS Wire2

AudioSynthWaveformSine tone1;
AudioEffectEnvelope    env;
AudioOutputI2S         i2sOut;
AudioConnection        pc1(tone1, env);
AudioConnection        pcL(env, 0, i2sOut, 0);
AudioConnection        pcR(env, 0, i2sOut, 1);
AudioControlSGTL5000   codec;

Adafruit_ILI9341 lcd(&SPI1, 37, 38, 36);
Adafruit_seesaw quad[2] = {Adafruit_seesaw(&UI_BUS), Adafruit_seesaw(&UI_BUS)};
seesaw_NeoPixel pix[2] = {seesaw_NeoPixel(4, 18, NEO_GRB + NEO_KHZ800, &UI_BUS),
                          seesaw_NeoPixel(4, 18, NEO_GRB + NEO_KHZ800, &UI_BUS)};
const uint8_t QUAD_ADDR[2] = {0x49, 0x4A};
const uint8_t SWITCH_PIN[4] = {12, 14, 17, 9};
bool quadOk[2];
Adafruit_GPS gps(&UI_BUS);
bool gpsOk = false;

const int N = 7;  // 4 on Quad #1, 3 on Quad #2
int32_t pos[N], lastPos[N];
int cw[N], ccw[N], presses[N];
bool down[N];
char lastText[N][24], lastGps[4][40];

int quadOf(int i) { return i < 4 ? 0 : 1; }
int chanOf(int i) { return i < 4 ? i : i - 4; }
bool passed(int i) { return cw[i] >= 10 && ccw[i] >= 10 && presses[i] >= 1; }
int dialX(int i) { return 40 + (i % 4) * 80; }
int dialY(int i) { return 40 + (i / 4) * 80; }

void drawDial(int i) {
    int x = dialX(i), y = dialY(i);
    uint16_t c = quadOk[quadOf(i)] ? (passed(i) ? ILI9341_GREEN : ILI9341_ORANGE) : ILI9341_DARKGREY;
    lcd.fillCircle(x, y, 26, down[i] ? c : 0x2104);
    lcd.drawCircle(x, y, 26, c);
    float a = pos[i] * (2 * PI / 20) - PI / 2;  // 20 detents per turn
    lcd.drawLine(x, y, x + 22 * cosf(a), y + 22 * sinf(a), down[i] ? ILI9341_BLACK : ILI9341_WHITE);
    lcd.setTextSize(1);
    lcd.setTextColor(ILI9341_WHITE, ILI9341_BLACK);
    lcd.setCursor(x - 9, y - 38);
    lcd.printf("E%d", i + 1);
}

void drawStats(int i) {
    char text[24];
    snprintf(text, sizeof(text), "%3d+%-3d %dp %s", cw[i], ccw[i], presses[i], passed(i) ? "OK" : "  ");
    if (strcmp(text, lastText[i]) == 0) return;
    strcpy(lastText[i], text);
    lcd.setTextSize(1);
    lcd.setTextColor(passed(i) ? ILI9341_GREEN : ILI9341_WHITE, ILI9341_BLACK);
    lcd.setCursor(dialX(i) - 38, dialY(i) + 30);
    lcd.print(text);
}

void gpsLine(int row, const char *text, uint16_t c) {
    if (strcmp(text, lastGps[row]) == 0) return;
    strcpy(lastGps[row], text);
    lcd.fillRect(0, 186 + row * 13, 320, 12, ILI9341_BLACK);
    lcd.setTextSize(1);
    lcd.setTextColor(c);
    lcd.setCursor(4, 188 + row * 13);
    lcd.print(text);
}

void drawGps() {
    char t[40];
    if (!gpsOk) { gpsLine(0, "GPS NOT FOUND at 0x10", ILI9341_RED); return; }
    snprintf(t, sizeof(t), "GPS %s  sats %d", gps.fix ? "FIX - PASS" : "no fix yet", (int)gps.satellites);
    gpsLine(0, t, gps.fix ? ILI9341_GREEN : ILI9341_ORANGE);
    snprintf(t, sizeof(t), "lat %.5f  lon %.5f", gps.latitudeDegrees, gps.longitudeDegrees);
    gpsLine(1, t, ILI9341_WHITE);
    snprintf(t, sizeof(t), "UTC %02d:%02d:%02d  20%02d-%02d-%02d", gps.hour, gps.minute, gps.seconds,
             gps.year, gps.month, gps.day);
    gpsLine(2, t, ILI9341_WHITE);
}

void drawAll() {
    lcd.fillScreen(ILI9341_BLACK);
    for (int i = 0; i < N; i++) { lastText[i][0] = 0; drawDial(i); drawStats(i); }
    for (int r = 0; r < 4; r++) lastGps[r][0] = 0;
    lcd.setTextSize(1);
    lcd.setTextColor(ILI9341_DARKGREY);
    lcd.setCursor(270, 112);
    lcd.print(quadOk[0] ? "Q1 OK" : "Q1 --");
    lcd.setCursor(270, 124);
    lcd.print(quadOk[1] ? "Q2 OK" : "Q2 --");
    drawGps();
}

void setup() {
    Serial.begin(115200);
    AudioMemory(8);
    codec.enable();
    codec.volume(0.3);
    tone1.amplitude(0.12);
    env.attack(1);
    env.hold(5);
    env.decay(30);
    env.sustain(0);

    UI_BUS.begin();
    for (int q = 0; q < 2; q++) {
        quadOk[q] = quad[q].begin(QUAD_ADDR[q]) && pix[q].begin(QUAD_ADDR[q]);
        if (quadOk[q]) {
            for (int e = 0; e < 4; e++) quad[q].pinMode(SWITCH_PIN[e], INPUT_PULLUP);
            pix[q].setBrightness(20);
            pix[q].show();
        }
        Serial.printf("Quad #%d (0x%02X): %s\n", q + 1, QUAD_ADDR[q], quadOk[q] ? "OK" : "NOT FOUND");
    }
    for (int i = 0; i < N; i++)
        if (quadOk[quadOf(i)]) pos[i] = lastPos[i] = -quad[quadOf(i)].getEncoderPosition(chanOf(i));

    gpsOk = gps.begin(0x10);
    if (gpsOk) {
        gps.sendCommand(PMTK_SET_NMEA_OUTPUT_RMCGGA);
        gps.sendCommand(PMTK_SET_NMEA_UPDATE_1HZ);
    }
    Serial.println(gpsOk ? "GPS OK" : "GPS NOT FOUND at 0x10");

    SPI1.setMISO(39);
    lcd.begin();
    lcd.setRotation(1);
    drawAll();
}

void loop() {
    static uint32_t nextEnc = 0, nextGps = 0, nextPrint = 0, nextCheck = 0;

    if (gpsOk) {  // drain the GPS buffer often, parse whole sentences
        for (int k = 0; k < 32; k++) gps.read();
        if (gps.newNMEAreceived()) gps.parse(gps.lastNMEA());
    }

    if (millis() > nextEnc) {
        nextEnc = millis() + 10;
        for (int i = 0; i < N; i++) {
            int q = quadOf(i), e = chanOf(i);
            if (!quadOk[q]) continue;
            pos[i] = -quad[q].getEncoderPosition(e);  // clockwise = up
            bool d = !quad[q].digitalRead(SWITCH_PIN[e]);
            bool changed = false;
            if (pos[i] != lastPos[i]) {
                int step = pos[i] - lastPos[i];
                if (step > 0) cw[i] += step; else ccw[i] -= step;
                tone1.frequency(400 + i * 90 + (step > 0 ? 120 : 0));
                env.noteOn();
                uint8_t h = (uint8_t)(pos[i] * 12);
                pix[q].setPixelColor(e, h, 255 - h, 80);
                pix[q].show();
                lastPos[i] = pos[i];
                changed = true;
            }
            if (d != down[i]) {
                down[i] = d;
                if (d) { presses[i]++; tone1.frequency(1200); env.noteOn(); }
                changed = true;
            }
            if (changed) { drawDial(i); drawStats(i); }
        }
    }

    if (millis() > nextGps) { nextGps = millis() + 1000; drawGps(); }

    if (millis() > nextPrint) {
        nextPrint = millis() + 5000;
        for (int i = 0; i < N; i++)
            Serial.printf("E%d %d+%d %dp%s  ", i + 1, cw[i], ccw[i], presses[i], passed(i) ? " PASS" : "");
        Serial.printf("| GPS fix %d sats %d\n", gps.fix, (int)gps.satellites);
    }

    // the LCD sometimes resets (power mode 0x00 instead of 0x94): re-init and redraw
    if (millis() > nextCheck) {
        nextCheck = millis() + 1000;
        uint8_t mode = lcd.readcommand8(ILI9341_RDMODE);
        if (mode != 0x94) {
            Serial.printf("LCD 0x%02X - reinit\n", mode);
            lcd.begin();
            lcd.setRotation(1);
            drawAll();
        }
    }
}
