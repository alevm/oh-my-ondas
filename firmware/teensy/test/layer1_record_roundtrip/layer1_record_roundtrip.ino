// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Oh My Ondas - Layer 1 Test: Record -> SD -> Playback (digital path)
 *
 * Records an internally generated 880Hz sine through AudioRecordQueue to
 * REC.RAW on the built-in SD card, checks the file, then plays it back.
 * Covers the record pipeline, SD write and playback. It does NOT test the
 * analog input (mic/line-in): that needs an input source on the shield.
 *
 * Pass criteria (Serial Monitor, 115200):
 *   - "SGTL5000 OK", "SD OK"
 *   - "File: PASS"      size matches 3s of 44.1kHz 16-bit mono, frequency
 *                       measured from the file within 880Hz +/- 5Hz
 *   - "Playback: PASS"  peak level of the played-back file above 0.1
 *   - 880Hz tone heard on headphones during playback (after 3s of silence)
 */

#include <Audio.h>
#include <SD.h>

AudioSynthWaveform     tone1;
AudioRecordQueue       recQueue;
AudioPlaySdRaw         playRaw;
AudioAnalyzePeak       playPeak;
AudioOutputI2S         i2sOut;
AudioConnection        pc1(tone1, 0, recQueue, 0);
AudioConnection        pc2(playRaw, 0, i2sOut, 0);
AudioConnection        pc3(playRaw, 0, i2sOut, 1);
AudioConnection        pc4(playRaw, 0, playPeak, 0);
AudioControlSGTL5000   codec;

const char* FILE_NAME = "REC.RAW";
const float FREQ = 880.0;
const unsigned long RECORD_MS = 3000;
const uint32_t EXPECTED_BYTES = 44100UL * 2 * RECORD_MS / 1000;

uint32_t recordToSD() {
    if (SD.exists(FILE_NAME)) SD.remove(FILE_NAME);
    File f = SD.open(FILE_NAME, FILE_WRITE);
    if (!f) return 0;

    uint32_t written = 0;
    recQueue.begin();
    tone1.amplitude(0.5);
    unsigned long start = millis();
    while (written < EXPECTED_BYTES) {
        if (recQueue.available() >= 2) {
            uint8_t buf[512];
            memcpy(buf, recQueue.readBuffer(), 256);
            recQueue.freeBuffer();
            memcpy(buf + 256, recQueue.readBuffer(), 256);
            recQueue.freeBuffer();
            uint32_t n = min((uint32_t)512, EXPECTED_BYTES - written);
            written += f.write(buf, n);
        }
        if (millis() - start > RECORD_MS + 2000) break;  // safety stop
    }
    recQueue.end();
    tone1.amplitude(0);
    while (recQueue.available()) recQueue.freeBuffer();
    f.close();
    return written;
}

// Frequency from upward zero crossings over the whole file
float measureFrequency(uint32_t& samples) {
    File f = SD.open(FILE_NAME);
    if (!f) return 0;
    int16_t prev = 0, s;
    uint32_t crossings = 0;
    samples = 0;
    while (f.read(&s, 2) == 2) {
        if (prev < 0 && s >= 0) crossings++;
        prev = s;
        samples++;
    }
    f.close();
    return samples ? crossings * 44100.0 / samples : 0;
}

void setup() {
    Serial.begin(115200);
    while (!Serial && millis() < 3000) {}

    AudioMemory(60);
    Serial.println(codec.enable() ? "SGTL5000 OK" : "SGTL5000 NON risponde");
    codec.volume(0.4);
    bool sdOk = SD.begin(BUILTIN_SDCARD);
    Serial.println(sdOk ? "SD OK" : "SD FAIL");
    if (!sdOk) return;

    tone1.begin(WAVEFORM_SINE);
    tone1.frequency(FREQ);
    tone1.amplitude(0);

    Serial.println("Recording 3s of 880Hz to REC.RAW (silent on headphones)...");
    uint32_t written = recordToSD();
    uint32_t samples;
    float freq = measureFrequency(samples);
    bool fileOk = written == EXPECTED_BYTES && fabsf(freq - FREQ) < 5.0;
    Serial.printf("File: %s (%lu/%lu bytes, %.1f Hz measured)\n",
                  fileOk ? "PASS" : "FAIL", written, EXPECTED_BYTES, freq);

    Serial.println("Playing REC.RAW back - listen for 880Hz...");
    playRaw.play(FILE_NAME);
    delay(25);
    float maxPeak = 0;
    while (playRaw.isPlaying()) {
        if (playPeak.available()) maxPeak = max(maxPeak, playPeak.read());
    }
    Serial.printf("Playback: %s (peak %.3f)\n", maxPeak > 0.1 ? "PASS" : "FAIL", maxPeak);
    Serial.println("Done. Reset to run again.");
}

void loop() {}
