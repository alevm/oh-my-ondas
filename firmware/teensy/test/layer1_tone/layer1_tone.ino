// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Oh My Ondas - Layer 1 Test: Tone
 *
 * Teensy 4.1 + Audio Shield Rev D (SGTL5000). Plays a continuous 440Hz sine
 * on both channels of the headphone jack.
 *
 * Pass criteria:
 *   - Serial Monitor (115200) prints "SGTL5000 OK"
 *   - Steady 440Hz tone heard on headphones, both ears
 *
 * If it fails, the diagnostic lines narrow it down:
 *   - Shield pull-ups LOW   -> shield not connected/powered: reseat the Teensy
 *   - I2C devices: none     -> no I2C contact on pins 18/19
 *   - I2S input 0.0000      -> I2S clocks (20, 21, 23) not reaching the codec
 */

#include <Audio.h>
#include <Wire.h>

AudioSynthWaveform     tone1;
AudioOutputI2S         i2sOut;
AudioInputI2S          i2sIn;
AudioAnalyzePeak       peakIn;
AudioConnection        pc1(tone1, 0, i2sOut, 0);
AudioConnection        pc2(tone1, 0, i2sOut, 1);
AudioConnection        pc3(i2sIn, 0, peakIn, 0);
AudioControlSGTL5000   codec;

void setup() {
    Serial.begin(115200);
    while (!Serial && millis() < 3000) {}

    // The Audio Shield has 2.2k pull-ups on SDA/SCL: with internal pull-downs
    // on, a connected shield still reads HIGH, a missing one reads LOW.
    pinMode(18, INPUT_PULLDOWN);
    pinMode(19, INPUT_PULLDOWN);
    delay(5);
    Serial.printf("Shield pull-ups: SDA(18)=%s SCL(19)=%s\n",
                  digitalRead(18) ? "HIGH" : "LOW", digitalRead(19) ? "HIGH" : "LOW");

    // I2C scan: SGTL5000 answers at 0x0A
    Wire.begin();
    Serial.print("I2C devices:");
    int found = 0;
    for (uint8_t addr = 1; addr < 127; addr++) {
        Wire.beginTransmission(addr);
        if (Wire.endTransmission() == 0) {
            Serial.printf(" 0x%02X", addr);
            found++;
        }
    }
    Serial.println(found ? "" : " none");

    AudioMemory(8);
    if (codec.enable()) {
        Serial.println("SGTL5000 OK");
    } else {
        Serial.println("SGTL5000 NON risponde");
    }
    codec.volume(0.4);
    // Max mic gain: even with no mic, I2S input carries noise when the clocks work
    codec.inputSelect(AUDIO_INPUT_MIC);
    codec.micGain(63);

    tone1.begin(WAVEFORM_SINE);
    tone1.frequency(440);
    tone1.amplitude(0.3);
}

void loop() {
    static unsigned long lastPrint = 0;
    if (millis() - lastPrint >= 2000 && peakIn.available()) {
        Serial.printf("I2S input: %.4f\n", peakIn.read());
        lastPrint = millis();
    }
}
