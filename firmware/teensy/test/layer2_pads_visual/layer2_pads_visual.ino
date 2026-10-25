// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Oh My Ondas - Layer 2 Test: touch pads shown on the LCD, playing samples
 *
 * CAP1188 on Wire2 (SDA 25, SCL 24), pads on C1-C8. LCD on SPI1 (see
 * layer3_integration), OLED on Wire2 optional. PAD1.WAV-PAD8.WAV at the
 * root of the built-in SD card (sd_upload.py --pad-samples).
 *
 * The LCD shows the 8 pads as a 2x4 grid: a pad lights while touched, and
 * the bar under it shows the raw delta count (touch threshold marked).
 * Touching pad N plays PADN.WAV on the headphones (4 voices).
 * Calibrates at start-up: wire the pads first, hands off during reset.
 *
 * Pass criteria:
 *   - touching a pad lights only that pad and plays its own sample
 *   - nothing lights with hands off
 */

#include <Audio.h>
#include <SD.h>
#include <Wire.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ILI9341.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_CAP1188.h>

#define UI_BUS Wire2

const int VOICES = 4;
AudioPlaySdWav         voice[VOICES];
AudioMixer4            mixer;
AudioOutputI2S         i2sOut;
AudioConnection        pc0(voice[0], 0, mixer, 0);
AudioConnection        pc1(voice[1], 0, mixer, 1);
AudioConnection        pc2(voice[2], 0, mixer, 2);
AudioConnection        pc3(voice[3], 0, mixer, 3);
AudioConnection        pcL(mixer, 0, i2sOut, 0);
AudioConnection        pcR(mixer, 0, i2sOut, 1);
AudioControlSGTL5000   codec;
int nextVoice = 0;

Adafruit_ILI9341 lcd(&SPI1, 37, 38, 36);
Adafruit_SSD1306 oled(128, 64, &UI_BUS, -1);
Adafruit_CAP1188 touch = Adafruit_CAP1188();
bool oledOk = false;

const int PAD_W = 70, PAD_H = 70, GAP = 8, X0 = 8, Y0 = 8, BAR_H = 8;
const int THRESHOLD = 64;  // CAP1188 default touch threshold (delta counts)

uint16_t padColor(int i) {
    const uint16_t c[] = {ILI9341_RED, ILI9341_ORANGE, ILI9341_YELLOW, ILI9341_GREEN,
                          ILI9341_CYAN, ILI9341_BLUE, ILI9341_MAGENTA, ILI9341_PINK};
    return c[i];
}
int padX(int i) { return X0 + (i % 4) * (PAD_W + GAP); }
int padY(int i) { return Y0 + (i / 4) * (PAD_H + BAR_H + 3 * GAP); }

void drawPad(int i, bool on) {
    int x = padX(i), y = padY(i);
    lcd.fillRoundRect(x, y, PAD_W, PAD_H, 8, on ? padColor(i) : 0x2104);
    lcd.drawRoundRect(x, y, PAD_W, PAD_H, 8, padColor(i));
    lcd.setTextColor(on ? ILI9341_BLACK : padColor(i));
    lcd.setTextSize(4);
    lcd.setCursor(x + PAD_W / 2 - 11, y + PAD_H / 2 - 14);
    lcd.print(i + 1);
}

void drawBar(int i, int delta) {
    int x = padX(i), y = padY(i) + PAD_H + 4;
    int w = constrain(delta, 0, 127) * PAD_W / 127;
    lcd.fillRect(x, y, PAD_W, BAR_H, ILI9341_BLACK);
    lcd.fillRect(x, y, w, BAR_H, delta >= THRESHOLD ? padColor(i) : ILI9341_DARKGREY);
    lcd.drawFastVLine(x + THRESHOLD * PAD_W / 127, y - 1, BAR_H + 2, ILI9341_WHITE);
}

void setup() {
    Serial.begin(115200);
    while (!Serial && millis() < 3000) {}

    AudioMemory(24);
    Serial.println(codec.enable() ? "SGTL5000 OK" : "SGTL5000 NON risponde");
    codec.volume(0.5);
    for (int i = 0; i < VOICES; i++) mixer.gain(i, 0.5);
    bool sdOk = SD.begin(BUILTIN_SDCARD);
    Serial.println(sdOk ? "SD OK" : "SD FAIL");

    SPI1.setMISO(39);
    lcd.begin();
    lcd.setRotation(3);
    lcd.fillScreen(ILI9341_BLACK);
    if (!sdOk) {
        lcd.setTextColor(ILI9341_RED);
        lcd.setTextSize(2);
        lcd.setCursor(8, 222);
        lcd.print("SD FAIL - no sound");
    }

    // touch.begin() fails if the previous transaction on the bus was NACKed;
    // a plain register read first clears it (see layer2_cap1188).
    UI_BUS.begin();
    UI_BUS.beginTransmission(0x29);
    UI_BUS.write(0xFD);
    UI_BUS.endTransmission(false);
    UI_BUS.requestFrom(0x29, 1);
    while (UI_BUS.available()) UI_BUS.read();
    if (!touch.begin(0x29, &UI_BUS)) {
        lcd.setTextColor(ILI9341_RED);
        lcd.setTextSize(3);
        lcd.setCursor(20, 100);
        lcd.print("CAP1188 NOT FOUND");
        Serial.println("CAP1188 NOT FOUND");
        return;
    }
    // 16x sensitivity and max-duration recalibration, as in layer2_touch_samples
    touch.writeRegister(0x1F, 0x3F);
    touch.writeRegister(0x20, touch.readRegister(0x20) | 0x08);
    touch.writeRegister(0x26, 0xFF);
    delay(300);
    Serial.println("CAP1188 OK - touch the pads");

    UI_BUS.beginTransmission(0x3C);
    oledOk = UI_BUS.endTransmission() == 0 && oled.begin(SSD1306_SWITCHCAPVCC, 0x3C);
    if (oledOk) {
        oled.clearDisplay();
        oled.setTextColor(SSD1306_WHITE);
        oled.setTextSize(2);
        oled.setCursor(0, 0);
        oled.print("Pads");
        oled.display();
    }

    for (int i = 0; i < 8; i++) { drawPad(i, false); drawBar(i, 0); }
}

void loop() {
    static uint8_t last = 0;
    uint8_t now = touch.touched();
    for (int i = 0; i < 8; i++) {
        bool was = last & (1 << i), is = now & (1 << i);
        if (is != was) {
            drawPad(i, is);
            Serial.printf("Pad %d %s\n", i + 1, is ? "down" : "up");
            if (is) {
                char name[12];
                snprintf(name, sizeof(name), "PAD%d.WAV", i + 1);
                voice[nextVoice].play(name);
                nextVoice = (nextVoice + 1) % VOICES;
            }
            if (is && oledOk) {
                oled.fillRect(0, 20, 128, 44, SSD1306_BLACK);
                oled.setTextSize(4);
                oled.setCursor(48, 26);
                oled.print(i + 1);
                oled.display();
            }
        }
        drawBar(i, (int8_t)touch.readRegister(0x10 + i));
    }
    last = now;
}
