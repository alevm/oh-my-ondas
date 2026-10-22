// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Oh My Ondas - Layer 5 Test: nav switch and buttons on the MCP23017, on the LCD
 *
 * MCP23017 on Wire2 at 0x20 (A0-A2 to GND, RESET to 3.3V). Nav switch common
 * and one leg of each button to GND:
 *   GPA0 up, GPA1 down, GPA2 left, GPA3 right, GPA4 centre
 *   GPB0 MODE, GPB1 SHIFT, GPB2 REC, GPB3 PLAY
 * Internal pull-ups, pressed = LOW. LCD on SPI1 as in layer3_integration.
 *
 * Each control lights while pressed and clicks (its own pitch, quiet).
 * Stats per control: presses (debounced 5 ms) and chatter (extra raw edges).
 *
 * Pass criteria per control (turns green):
 *   - at least 3 presses counted, released when idle
 */

#include <Audio.h>
#include <Wire.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ILI9341.h>
#include <Adafruit_MCP23X17.h>

#define UI_BUS Wire2

AudioSynthWaveformSine tone1;
AudioEffectEnvelope    env;
AudioOutputI2S         i2sOut;
AudioConnection        pc1(tone1, env);
AudioConnection        pcL(env, 0, i2sOut, 0);
AudioConnection        pcR(env, 0, i2sOut, 1);
AudioControlSGTL5000   codec;

Adafruit_ILI9341 lcd(&SPI1, 37, 38, 36);
Adafruit_MCP23X17 mcp;
bool mcpOk = false;

const int N = 9;
const uint8_t PIN[N] = {0, 1, 2, 3, 4, 8, 9, 10, 11};
const char *NAME[N] = {"UP", "DOWN", "LEFT", "RIGHT", "CENTRE", "MODE", "SHIFT", "REC", "PLAY"};
const float PITCH[N] = {660, 440, 494, 587, 523, 784, 880, 988, 1047};
// nav as a cross on the left, buttons as a column on the right
const int CX[N] = {80, 80, 30, 130, 80, 250, 250, 250, 250};
const int CY[N] = {50, 150, 100, 100, 100, 40, 80, 120, 160};

bool pressed[N], rawLast[N];
uint32_t changedAt[N];
int presses[N], chatter[N];
char lastText[N][24];

bool passed(int i) { return presses[i] >= 3 && !pressed[i]; }

void drawControl(int i) {
    uint16_t c = passed(i) ? ILI9341_GREEN : ILI9341_ORANGE;
    uint16_t fill = pressed[i] ? c : 0x2104;
    if (i < 5) {
        lcd.fillCircle(CX[i], CY[i], 22, fill);
        lcd.drawCircle(CX[i], CY[i], 22, c);
    } else {
        lcd.fillRoundRect(CX[i] - 45, CY[i] - 16, 90, 32, 6, fill);
        lcd.drawRoundRect(CX[i] - 45, CY[i] - 16, 90, 32, 6, c);
    }
    lcd.setTextSize(1);
    lcd.setTextColor(pressed[i] ? ILI9341_BLACK : ILI9341_WHITE);
    lcd.setCursor(CX[i] - strlen(NAME[i]) * 3, CY[i] - 3);
    lcd.print(NAME[i]);
}

void drawStats(int i) {
    char text[24];
    snprintf(text, sizeof(text), "%-6s %3d %3d %s", NAME[i], presses[i], chatter[i], passed(i) ? "PASS" : "    ");
    if (strcmp(text, lastText[i]) == 0) return;
    strcpy(lastText[i], text);
    lcd.setTextSize(1);
    lcd.setTextColor(passed(i) ? ILI9341_GREEN : ILI9341_WHITE, ILI9341_BLACK);
    lcd.setCursor(i < 5 ? 4 : 164, 196 + (i < 5 ? i : i - 5) * 9);
    lcd.print(text);
}

void drawAll() {
    lcd.fillScreen(ILI9341_BLACK);
    lcd.setTextSize(1);
    lcd.setTextColor(ILI9341_DARKGREY);
    lcd.setCursor(4, 186);  lcd.print("ctrl  press chat");
    lcd.setCursor(164, 186); lcd.print("ctrl  press chat");
    if (!mcpOk) {
        lcd.setTextColor(ILI9341_RED);
        lcd.setTextSize(2);
        lcd.setCursor(20, 100);
        lcd.print("MCP23017 NOT FOUND");
        return;
    }
    for (int i = 0; i < N; i++) { lastText[i][0] = 0; drawControl(i); drawStats(i); }
}

void setup() {
    Serial.begin(115200);
    AudioMemory(8);
    codec.enable();
    codec.volume(0.3);
    tone1.amplitude(0.15);
    env.attack(2);
    env.hold(10);
    env.decay(60);
    env.sustain(0);

    UI_BUS.begin();
    mcpOk = mcp.begin_I2C(0x20, &UI_BUS);
    if (mcpOk)
        for (int i = 0; i < N; i++) mcp.pinMode(PIN[i], INPUT_PULLUP);
    Serial.println(mcpOk ? "MCP23017 OK" : "MCP23017 NOT FOUND at 0x20");

    SPI1.setMISO(39);
    lcd.begin();
    lcd.setRotation(1);
    drawAll();
}

void loop() {
    static uint32_t nextPrint = 0, nextCheck = 0;
    if (mcpOk) {
        uint16_t ab = mcp.readGPIOAB();
        uint32_t now = millis();
        for (int i = 0; i < N; i++) {
            bool raw = !(ab & (1 << PIN[i]));
            if (raw != rawLast[i]) {
                if (now - changedAt[i] < 5) chatter[i]++;
                changedAt[i] = now;
                rawLast[i] = raw;
            }
            if (raw != pressed[i] && now - changedAt[i] >= 5) {  // stable for 5 ms
                pressed[i] = raw;
                if (raw) {
                    presses[i]++;
                    tone1.frequency(PITCH[i]);
                    env.noteOn();
                    Serial.printf("%s pressed (%d)\n", NAME[i], presses[i]);
                }
                drawControl(i);
                drawStats(i);
            }
        }
    }

    if (millis() > nextPrint) {
        nextPrint = millis() + 5000;
        for (int i = 0; i < N; i++)
            Serial.printf("%s %d/%d%s  ", NAME[i], presses[i], chatter[i], passed(i) ? " PASS" : "");
        Serial.println();
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
