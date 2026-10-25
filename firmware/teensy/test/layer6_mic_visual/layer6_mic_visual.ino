// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Oh My Ondas - Layer 6 Test: MAX9814 mic on LINE-IN L, level meter + record/playback
 *
 * MAX9814: VDD -> 3.3V, GND -> GND, GAIN/AR unconnected, OUT -> LINE-IN L
 * on the Audio Shield (1 uF in series if LINE-IN has no coupling capacitor).
 * SD card in the Teensy slot. LCD on SPI1 as in layer3_integration.
 *
 * Cycle: 6 s live meter, countdown, 3 s recording to MIC.RAW, playback on
 * the headphones (quiet), repeat. Closes the Layer 1 analog-input test.
 *
 * Stats on screen: level now, highest peak, noise floor (quietest 1 s RMS),
 * clipped blocks, peak of the last recording and of its playback.
 *
 * Pass criteria (turns green):
 *   - noise floor <= 2 %  (room quiet, nobody speaking)
 *   - highest peak >= 20 % when you speak at ~30 cm, no clipping
 *   - playback peak >= 10 % and your voice is heard back
 */

#include <Audio.h>
#include <SD.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ILI9341.h>

AudioInputI2S          i2sIn;
AudioAnalyzePeak       inPeak;
AudioAnalyzeRMS        inRms;
AudioRecordQueue       recQueue;
AudioPlaySdRaw         playRaw;
AudioAnalyzePeak       playPeak;
AudioOutputI2S         i2sOut;
AudioConnection        pc1(i2sIn, 0, inPeak, 0);
AudioConnection        pc2(i2sIn, 0, inRms, 0);
AudioConnection        pc3(i2sIn, 0, recQueue, 0);
AudioConnection        pc4(playRaw, 0, i2sOut, 0);
AudioConnection        pc5(playRaw, 0, i2sOut, 1);
AudioConnection        pc6(playRaw, 0, playPeak, 0);
AudioControlSGTL5000   codec;

Adafruit_ILI9341 lcd(&SPI1, 37, 38, 36);
bool sdOk = false;

const char *FILE_NAME = "MIC.RAW";
const uint32_t REC_BYTES = 44100UL * 2 * 3;  // 3 s mono 16-bit
const int LINE_IN_LEVEL = 0;                 // 0 = 3.12 Vpp full scale, the least sensitive

float levelNow = 0, peakMax = 0, floorRms = 1, recPeak = 0, playPk = 0;
int clipped = 0;
char lastText[8][40];

bool floorOk() { return floorRms <= 0.02f; }
bool peakOk() { return peakMax >= 0.20f && clipped == 0; }
bool playOk() { return playPk >= 0.10f; }

void line(int row, const char *text, uint16_t c) {
    if (strcmp(text, lastText[row]) == 0) return;
    strcpy(lastText[row], text);
    lcd.fillRect(0, 120 + row * 16, 320, 15, ILI9341_BLACK);
    lcd.setTextSize(2);
    lcd.setTextColor(c);
    lcd.setCursor(6, 120 + row * 16);
    lcd.print(text);
}

void drawMeter() {
    static int lastW = -1, lastPk = -1;
    int w = constrain((int)(levelNow * 300), 0, 300);
    int pk = constrain((int)(peakMax * 300), 0, 299);
    if (w == lastW && pk == lastPk) return;
    uint16_t c = levelNow > 0.95f ? ILI9341_RED : (levelNow > 0.5f ? ILI9341_YELLOW : ILI9341_GREEN);
    lcd.fillRect(10, 60, w, 40, c);
    lcd.fillRect(10 + w, 60, 300 - w, 40, 0x2104);
    lcd.drawFastVLine(10 + pk, 58, 44, ILI9341_WHITE);
    lastW = w; lastPk = pk;
}

void drawStats() {
    char t[40];
    snprintf(t, sizeof(t), "level   %5.1f %%", levelNow * 100); line(0, t, ILI9341_WHITE);
    snprintf(t, sizeof(t), "peak    %5.1f %%", peakMax * 100);  line(1, t, peakOk() ? ILI9341_GREEN : ILI9341_ORANGE);
    snprintf(t, sizeof(t), "floor   %5.2f %%", floorRms * 100); line(2, t, floorOk() ? ILI9341_GREEN : ILI9341_ORANGE);
    snprintf(t, sizeof(t), "clipped %5d", clipped);             line(3, t, clipped ? ILI9341_RED : ILI9341_WHITE);
    snprintf(t, sizeof(t), "rec %4.0f%%  play %4.0f%%", recPeak * 100, playPk * 100);
    line(4, t, playOk() ? ILI9341_GREEN : ILI9341_ORANGE);
    line(5, floorOk() && peakOk() && playOk() ? "PASS" : "", ILI9341_GREEN);
}

void status(const char *text, uint16_t c) {
    lcd.fillRect(0, 0, 320, 50, ILI9341_BLACK);
    lcd.setTextSize(3);
    lcd.setTextColor(c);
    lcd.setCursor(10, 14);
    lcd.print(text);
}

void drawAll() {
    lcd.fillScreen(ILI9341_BLACK);
    for (int r = 0; r < 8; r++) lastText[r][0] = 0;
    if (!sdOk) {
        lcd.setTextColor(ILI9341_RED);
        lcd.setTextSize(1);
        lcd.setCursor(6, 228);
        lcd.print("SD FAIL - meter only, no recording");
    }
}

// Reads the input meters; also tracks the quietest 1 s window as the noise floor.
void updateMeters() {
    static float windowMax = 0;
    static uint32_t windowStart = 0;
    if (inPeak.available()) {
        float p = inPeak.read();
        levelNow = p;
        peakMax = max(peakMax, p);
        if (p > 0.99f) clipped++;
    }
    if (inRms.available()) {
        float r = inRms.read();
        windowMax = max(windowMax, r);
        if (millis() - windowStart > 1000) {
            if (windowStart) floorRms = min(floorRms, windowMax);
            windowMax = 0;
            windowStart = millis();
        }
    }
}

void lcdCheck() {
    static uint32_t nextCheck = 0;
    if (millis() < nextCheck) return;
    nextCheck = millis() + 1000;
    uint8_t mode = lcd.readcommand8(ILI9341_RDMODE);
    if (mode != 0x94) {
        Serial.printf("LCD 0x%02X - reinit\n", mode);
        lcd.begin();
        lcd.setRotation(3);
        drawAll();
    }
}

void meterFor(uint32_t ms, const char *label, uint16_t c) {
    status(label, c);
    uint32_t end = millis() + ms;
    while (millis() < end) {
        updateMeters();
        drawMeter();
        drawStats();
        lcdCheck();
    }
}

void record() {
    if (SD.exists(FILE_NAME)) SD.remove(FILE_NAME);
    File f = SD.open(FILE_NAME, FILE_WRITE);
    if (!f) return;
    status("REC", ILI9341_RED);
    recPeak = 0;
    uint32_t written = 0, start = millis();
    recQueue.begin();
    while (written < REC_BYTES && millis() - start < 5000) {
        if (recQueue.available() >= 2) {
            uint8_t buf[512];
            memcpy(buf, recQueue.readBuffer(), 256);
            recQueue.freeBuffer();
            memcpy(buf + 256, recQueue.readBuffer(), 256);
            recQueue.freeBuffer();
            written += f.write(buf, min((uint32_t)512, REC_BYTES - written));
        }
        updateMeters();
        recPeak = max(recPeak, levelNow);
        drawMeter();
    }
    recQueue.end();
    while (recQueue.available()) recQueue.freeBuffer();
    f.close();
    Serial.printf("Recorded %lu bytes, peak %.2f\n", written, recPeak);
}

void playback() {
    status("PLAY", ILI9341_CYAN);
    playPk = 0;
    playRaw.play(FILE_NAME);
    delay(25);
    while (playRaw.isPlaying()) {
        if (playPeak.available()) playPk = max(playPk, playPeak.read());
        updateMeters();
        drawStats();
        lcdCheck();
    }
    Serial.printf("Playback peak %.2f\n", playPk);
}

void setup() {
    Serial.begin(115200);
    AudioMemory(60);
    codec.enable();
    codec.inputSelect(AUDIO_INPUT_LINEIN);
    codec.lineInLevel(LINE_IN_LEVEL);
    codec.volume(0.3);
    sdOk = SD.begin(BUILTIN_SDCARD);
    Serial.println(sdOk ? "SD OK" : "SD FAIL");

    SPI1.setMISO(39);
    lcd.begin();
    lcd.setRotation(3);
    drawAll();
}

void loop() {
    meterFor(6000, "QUIET, then speak", ILI9341_WHITE);
    if (!sdOk) return;
    meterFor(1000, "REC in 3", ILI9341_YELLOW);
    meterFor(1000, "REC in 2", ILI9341_YELLOW);
    meterFor(1000, "REC in 1", ILI9341_YELLOW);
    record();
    playback();
    Serial.printf("level %.2f peak %.2f floor %.3f clipped %d rec %.2f play %.2f %s\n", levelNow, peakMax,
                  floorRms, clipped, recPeak, playPk, floorOk() && peakOk() && playOk() ? "PASS" : "");
}
