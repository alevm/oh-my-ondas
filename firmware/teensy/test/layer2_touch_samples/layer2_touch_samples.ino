// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Oh My Ondas - Layer 2 Test: Touch pads trigger samples
 *
 * CAP1188 on Wire2 (see layer2_cap1188 for wiring). Touching pad N plays
 * PADN.WAV from the root of the built-in SD card. Four voices, so up to four
 * samples overlap; a fifth touch reuses the oldest voice.
 *
 * Setup: PAD1.WAV-PAD8.WAV (44.1kHz, 16-bit) at the SD root.
 *
 * Pass criteria (Serial Monitor, 115200):
 *   - "SGTL5000 OK", "SD OK", "CAP1188 OK", no "missing" lines
 *   - Each touch prints "Pad N -> PADN.WAV" for that pad only
 *   - Each pad plays a different sample on headphones
 */

#include <Audio.h>
#include <SD.h>
#include <Wire.h>
#include <Adafruit_CAP1188.h>

#define TOUCH_BUS Wire2

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

Adafruit_CAP1188 touch = Adafruit_CAP1188();
uint8_t lastTouched = 0;
int nextVoice = 0;

void setup() {
    Serial.begin(115200);
    while (!Serial && millis() < 3000) {}

    AudioMemory(24);
    Serial.println(codec.enable() ? "SGTL5000 OK" : "SGTL5000 NON risponde");
    codec.volume(0.4);
    for (int i = 0; i < VOICES; i++) mixer.gain(i, 0.5);

    bool sdOk = SD.begin(BUILTIN_SDCARD);
    Serial.println(sdOk ? "SD OK" : "SD FAIL");
    for (int n = 1; sdOk && n <= 8; n++) {
        char name[12];
        snprintf(name, sizeof(name), "PAD%d.WAV", n);
        if (!SD.exists(name)) Serial.printf("%s missing\n", name);
    }

    // touch.begin() fails if the previous transaction on the bus was NACKed;
    // a plain register read first clears it (see layer2_cap1188).
    TOUCH_BUS.begin();
    TOUCH_BUS.beginTransmission(0x29);
    TOUCH_BUS.write(0xFD);
    TOUCH_BUS.endTransmission(false);
    TOUCH_BUS.requestFrom(0x29, 1);
    while (TOUCH_BUS.available()) TOUCH_BUS.read();
    if (touch.begin(0x29, &TOUCH_BUS)) {
        // 16x sensitivity: the default 32x fires neighbouring pads on the
        // prototype (tape on cardboard). Max-duration recalibration (5.6s
        // default) clears a pad that reads touched because something moved
        // after the power-up calibration.
        touch.writeRegister(0x1F, 0x3F);
        touch.writeRegister(0x20, touch.readRegister(0x20) | 0x08);
        touch.writeRegister(0x26, 0xFF);  // recalibrate with the settings above
        Serial.println("CAP1188 OK - touch a pad");
    } else {
        Serial.println("CAP1188 NOT FOUND");
    }
}

void loop() {
    uint8_t now = touch.touched();
    uint8_t pressed = now & ~lastTouched;
    for (int i = 0; i < 8; i++) {
        if (!(pressed & (1 << i))) continue;
        char name[12];
        snprintf(name, sizeof(name), "PAD%d.WAV", i + 1);
        voice[nextVoice].play(name);
        nextVoice = (nextVoice + 1) % VOICES;
        Serial.printf("Pad %d -> %s\n", i + 1, name);
    }
    lastTouched = now;
    delay(5);
}
