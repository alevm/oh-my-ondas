// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Oh My Ondas - Layer 1 Test: SD Playback
 *
 * Teensy 4.1 + Audio Shield Rev D. Loops TEST.WAV from the Teensy built-in
 * SD slot (not the Audio Shield socket, which stays empty).
 *
 * Setup: FAT32 card with TEST.WAV (44.1kHz, 16-bit) at the root.
 *
 * Pass criteria:
 *   - Serial Monitor (115200) prints "SGTL5000 OK" and "SD OK"
 *   - TEST.WAV heard on headphones, restarting each time it ends
 */

#include <Audio.h>
#include <SD.h>

AudioPlaySdWav         playWav;
AudioOutputI2S         i2sOut;
AudioConnection        pc1(playWav, 0, i2sOut, 0);
AudioConnection        pc2(playWav, 1, i2sOut, 1);
AudioControlSGTL5000   codec;

bool sdOk = false;

void setup() {
    Serial.begin(115200);
    while (!Serial && millis() < 3000) {}

    AudioMemory(16);
    if (codec.enable()) {
        Serial.println("SGTL5000 OK");
    } else {
        Serial.println("SGTL5000 NON risponde");
    }
    codec.volume(0.4);

    sdOk = SD.begin(BUILTIN_SDCARD);
    Serial.println(sdOk ? "SD OK" : "SD FAIL");
    if (sdOk && !SD.exists("TEST.WAV")) {
        Serial.println("TEST.WAV not found at SD root");
    }
}

void loop() {
    if (!sdOk) return;
    if (!playWav.isPlaying()) {
        Serial.println("Playing TEST.WAV");
        playWav.play("TEST.WAV");
        delay(25);  // let the header parse before isPlaying() is checked again
    }
}
