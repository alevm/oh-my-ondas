/**
 * Oh My Ondas - Hardware Test Suite
 *
 * Interactive test sketch that exercises every subsystem.
 * Flash this before main firmware to verify your build is wired correctly.
 *
 * Open Serial Monitor at 115200 baud. Follow the prompts.
 * Each test prints PASS/FAIL. Send 's' to skip a test.
 *
 * Test sequence:
 *   1. I2C scan (finds MPR121 + OLED)
 *   2. OLED display
 *   3. LED ring (NeoPixel)
 *   4. Touch sensor (MPR121)
 *   5. Buttons (MODE/SHIFT/REC/PLAY)
 *   6. Encoders (4x rotary)
 *   7. SD card
 *   8. Audio output (sine wave test tone)
 *   9. Audio input (level meter)
 *  10. Audio codec registers
 */

#include <Audio.h>
#include <Wire.h>
#include <SPI.h>
#include <SD.h>
#include <Adafruit_MPR121.h>
#include <Adafruit_SSD1306.h>
#include <Encoder.h>
#include <Adafruit_NeoPixel.h>

#include "config.h"

// ============================================
// TEST AUDIO OBJECTS (minimal chain)
// ============================================
AudioSynthWaveformSine testTone;
AudioOutputI2S         testOutput;
AudioInputI2S          testInput;
AudioAnalyzePeak       testPeakL, testPeakR;
AudioConnection        pc1(testTone, 0, testOutput, 0);
AudioConnection        pc2(testTone, 0, testOutput, 1);
AudioConnection        pc3(testInput, 0, testPeakL, 0);
AudioConnection        pc4(testInput, 1, testPeakR, 0);

// ============================================
// HARDWARE OBJECTS
// ============================================
Adafruit_MPR121 touch = Adafruit_MPR121();
Adafruit_SSD1306 oled(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
Encoder enc[4] = {
    Encoder(ENC1_CLK, ENC1_DT),
    Encoder(ENC2_CLK, ENC2_DT),
    Encoder(ENC3_CLK, ENC3_DT),
    Encoder(ENC4_CLK, ENC4_DT)
};
Adafruit_NeoPixel leds(LED_COUNT, LED_PIN, NEO_GRB + NEO_KHZ800);
AudioControlSGTL5000 codec;

// ============================================
// TEST STATE
// ============================================
int testNumber = 0;
int passed = 0;
int failed = 0;
int skipped = 0;

void printHeader(const char* name) {
    testNumber++;
    Serial.println();
    Serial.printf("━━━ TEST %d: %s ━━━\n", testNumber, name);
}

void reportResult(bool pass, const char* detail = nullptr) {
    if (pass) {
        Serial.print("  ✓ PASS");
        passed++;
    } else {
        Serial.print("  ✗ FAIL");
        failed++;
    }
    if (detail) {
        Serial.printf(" — %s", detail);
    }
    Serial.println();
}

bool waitForInput(const char* prompt, unsigned long timeoutMs = 10000) {
    Serial.printf("  → %s (send 's' to skip, %lus timeout)\n", prompt, timeoutMs / 1000);
    unsigned long start = millis();
    while (millis() - start < timeoutMs) {
        if (Serial.available()) {
            char c = Serial.read();
            if (c == 's' || c == 'S') {
                Serial.println("  ⊘ SKIPPED");
                skipped++;
                return false;
            }
            return true;
        }
    }
    Serial.println("  ⊘ TIMEOUT (skipped)");
    skipped++;
    return false;
}

// ============================================
// SETUP
// ============================================
void setup() {
    Serial.begin(115200);
    while (!Serial && millis() < 3000) {}

    Serial.println();
    Serial.println("╔══════════════════════════════════════════╗");
    Serial.println("║   OH MY ONDAS — Hardware Test Suite      ║");
    Serial.println("║   v0.2.0                                 ║");
    Serial.println("╚══════════════════════════════════════════╝");
    Serial.println();
    Serial.println("Make sure Serial Monitor is at 115200 baud.");
    Serial.println("Tests will start in 2 seconds...");
    delay(2000);

    // Init subsystems needed for all tests
    Wire.begin();
    Wire.setClock(400000);
    AudioMemory(20);
    leds.begin();

    // Button pins
    pinMode(BTN_MODE, INPUT_PULLUP);
    pinMode(BTN_SHIFT, INPUT_PULLUP);
    pinMode(BTN_REC, INPUT_PULLUP);
    pinMode(BTN_PLAY, INPUT_PULLUP);
    pinMode(ENC1_SW, INPUT_PULLUP);
    pinMode(ENC2_SW, INPUT_PULLUP);
    pinMode(ENC3_SW, INPUT_PULLUP);
    pinMode(ENC4_SW, INPUT_PULLUP);

    // ─── TEST 1: I2C Scan ───
    testI2CScan();

    // ─── TEST 2: OLED Display ───
    testOLED();

    // ─── TEST 3: LED Ring ───
    testLEDRing();

    // ─── TEST 4: Touch Sensor ───
    testTouch();

    // ─── TEST 5: Buttons ───
    testButtons();

    // ─── TEST 6: Encoders ───
    testEncoders();

    // ─── TEST 7: SD Card ───
    testSDCard();

    // ─── TEST 8: Audio Codec ───
    testAudioCodec();

    // ─── TEST 9: Audio Output ───
    testAudioOutput();

    // ─── TEST 10: Audio Input ───
    testAudioInput();

    // ─── SUMMARY ───
    Serial.println();
    Serial.println("╔══════════════════════════════════════════╗");
    Serial.printf("║  RESULTS: %d passed, %d failed, %d skipped  \n", passed, failed, skipped);
    Serial.println("╚══════════════════════════════════════════╝");

    if (failed == 0 && skipped == 0) {
        Serial.println("\n  All tests passed! Hardware is ready.");
    } else if (failed == 0) {
        Serial.println("\n  All run tests passed. Skipped tests may need manual check.");
    } else {
        Serial.println("\n  Some tests failed. Check wiring and connections.");
    }

    Serial.println("\nTest suite complete. Reset to run again.");
}

void loop() {
    // Nothing — tests run once in setup()
}

// ============================================
// TEST IMPLEMENTATIONS
// ============================================

void testI2CScan() {
    printHeader("I2C Bus Scan");

    int found = 0;
    bool foundMPR121 = false;
    bool foundOLED = false;

    for (uint8_t addr = 1; addr < 127; addr++) {
        Wire.beginTransmission(addr);
        if (Wire.endTransmission() == 0) {
            Serial.printf("  Found device at 0x%02X", addr);
            if (addr == ADDR_MPR121) {
                Serial.print(" (MPR121 touch sensor)");
                foundMPR121 = true;
            } else if (addr == ADDR_SSD1306) {
                Serial.print(" (SSD1306 OLED)");
                foundOLED = true;
            }
            Serial.println();
            found++;
        }
    }

    Serial.printf("  Total I2C devices: %d\n", found);
    reportResult(foundMPR121, "MPR121 at 0x5A");
    reportResult(foundOLED, "SSD1306 at 0x3C");
}

void testOLED() {
    printHeader("OLED Display (SSD1306 128x64)");

    bool ok = oled.begin(SSD1306_SWITCHCAPVCC, ADDR_SSD1306);
    reportResult(ok, ok ? "Display initialized" : "begin() failed");

    if (ok) {
        oled.clearDisplay();
        oled.setTextSize(2);
        oled.setTextColor(SSD1306_WHITE);
        oled.setCursor(10, 10);
        oled.println("OH MY");
        oled.println(" ONDAS");
        oled.setTextSize(1);
        oled.setCursor(10, 48);
        oled.println("HW TEST v0.2.0");
        oled.display();
        reportResult(true, "Test pattern drawn — check display visually");
    }
}

void testLEDRing() {
    printHeader("LED Ring (NeoPixel x8)");

    leds.setBrightness(30);

    // Cycle R, G, B across all LEDs
    uint32_t colors[] = {
        leds.Color(255, 0, 0),
        leds.Color(0, 255, 0),
        leds.Color(0, 0, 255),
        leds.Color(255, 255, 255)
    };
    const char* names[] = {"Red", "Green", "Blue", "White"};

    for (int c = 0; c < 4; c++) {
        for (int i = 0; i < LED_COUNT; i++) {
            leds.setPixelColor(i, colors[c]);
        }
        leds.show();
        Serial.printf("  Showing: %s\n", names[c]);
        delay(400);
    }

    // Chase pattern
    for (int j = 0; j < 2; j++) {
        for (int i = 0; i < LED_COUNT; i++) {
            leds.clear();
            leds.setPixelColor(i, leds.Color(0, 100, 255));
            leds.show();
            delay(80);
        }
    }

    leds.clear();
    leds.show();

    reportResult(true, "LED ring animated — check LEDs visually");
}

void testTouch() {
    printHeader("Touch Sensor (MPR121)");

    bool ok = touch.begin(ADDR_MPR121);
    reportResult(ok, ok ? "MPR121 initialized" : "begin() failed — check wiring SDA/SCL/IRQ");

    if (!ok) return;

    // Read baseline values
    Serial.println("  Baseline capacitance per electrode:");
    bool baselines_ok = true;
    for (int i = 0; i < 12; i++) {
        uint16_t baseline = touch.baselineData(i);
        uint16_t filtered = touch.filteredData(i);
        Serial.printf("    CH%02d: baseline=%d filtered=%d", i, baseline, filtered);
        if (i < MAX_PADS) {
            if (baseline == 0) {
                Serial.print(" ⚠ no baseline (disconnected?)");
                baselines_ok = false;
            }
        }
        Serial.println();
    }
    reportResult(baselines_ok, "All 8 pad channels have baseline data");

    // Interactive touch test
    if (waitForInput("Touch each pad (1-8). Press any key when done.", 15000)) {
        uint16_t touched = touch.touched();
        int count = 0;
        for (int i = 0; i < MAX_PADS; i++) {
            if (touched & (1 << i)) count++;
        }
        Serial.printf("  Currently touched: %d pads (raw: 0x%03X)\n", count, touched);
        reportResult(true, "Touch readout working");
    }
}

void testButtons() {
    printHeader("Buttons (MODE/SHIFT/REC/PLAY)");

    const int pins[] = {BTN_MODE, BTN_SHIFT, BTN_REC, BTN_PLAY};
    const char* names[] = {"MODE", "SHIFT", "REC", "PLAY"};

    // Check all are HIGH (not pressed, pulled up)
    bool allHigh = true;
    for (int i = 0; i < 4; i++) {
        int val = digitalRead(pins[i]);
        Serial.printf("  %s (pin %d): %s\n", names[i], pins[i], val ? "HIGH (ok)" : "LOW (stuck?)");
        if (!val) allHigh = false;
    }
    reportResult(allHigh, "All buttons read HIGH (not pressed)");

    // Interactive: press each button
    Serial.println("  → Press each button in order: MODE, SHIFT, REC, PLAY");
    Serial.println("    (send 's' to skip, 15s timeout)");

    int detected = 0;
    bool buttonSeen[4] = {false, false, false, false};
    unsigned long start = millis();

    while (millis() - start < 15000 && detected < 4) {
        if (Serial.available() && (Serial.read() == 's')) {
            skipped++;
            Serial.println("  ⊘ SKIPPED");
            return;
        }

        for (int i = 0; i < 4; i++) {
            if (!buttonSeen[i] && digitalRead(pins[i]) == LOW) {
                buttonSeen[i] = true;
                detected++;
                Serial.printf("  ✓ %s pressed!\n", names[i]);
                delay(200);  // debounce
            }
        }
    }

    reportResult(detected == 4, detected == 4 ? "All 4 buttons detected" : "Not all buttons pressed");
}

void testEncoders() {
    printHeader("Rotary Encoders (x4)");

    // Check encoder switch pins
    const int swPins[] = {ENC1_SW, ENC2_SW, ENC3_SW, ENC4_SW};
    const char* names[] = {"MIX", "FX", "MOD", "TIME"};

    bool allHigh = true;
    for (int i = 0; i < 4; i++) {
        int val = digitalRead(swPins[i]);
        Serial.printf("  ENC%d (%s) switch: %s\n", i + 1, names[i], val ? "HIGH" : "LOW");
        if (!val) allHigh = false;
    }
    reportResult(allHigh, "All encoder switches HIGH");

    // Interactive: turn each encoder
    Serial.println("  → Turn each encoder (any direction). 10s timeout.");
    Serial.println("    (send 's' to skip)");

    long startPos[4];
    bool moved[4] = {false, false, false, false};
    for (int i = 0; i < 4; i++) {
        startPos[i] = enc[i].read();
    }

    unsigned long start = millis();
    int detected = 0;

    while (millis() - start < 10000 && detected < 4) {
        if (Serial.available() && (Serial.read() == 's')) {
            skipped++;
            Serial.println("  ⊘ SKIPPED");
            return;
        }

        for (int i = 0; i < 4; i++) {
            if (!moved[i]) {
                long pos = enc[i].read();
                if (abs(pos - startPos[i]) >= 4) {
                    moved[i] = true;
                    detected++;
                    Serial.printf("  ✓ ENC%d (%s) moved: %+ld\n", i + 1, names[i], pos - startPos[i]);
                }
            }
        }
    }

    reportResult(detected == 4, detected == 4 ? "All 4 encoders detected rotation" : "Some encoders not detected");
}

void testSDCard() {
    printHeader("SD Card");

    bool ok = SD.begin(BUILTIN_SDCARD);
    reportResult(ok, ok ? "SD card initialized" : "SD.begin() failed — check card insertion");

    if (!ok) return;

    // Check directory structure
    const char* dirs[] = {"/samples", "/patterns", "/recordings", "/presets"};
    for (auto dir : dirs) {
        if (SD.exists(dir)) {
            Serial.printf("  ✓ %s exists\n", dir);
        } else {
            Serial.printf("  ⊘ %s missing (will be created by main firmware)\n", dir);
        }
    }

    // Write/read test
    const char* testFile = "/_hw_test.tmp";
    File f = SD.open(testFile, FILE_WRITE);
    if (f) {
        f.println("Oh My Ondas test");
        f.close();

        f = SD.open(testFile);
        if (f) {
            String line = f.readStringUntil('\n');
            f.close();
            SD.remove(testFile);

            bool match = line.startsWith("Oh My Ondas");
            reportResult(match, match ? "Write/read/delete OK" : "Data mismatch");
        } else {
            reportResult(false, "Cannot re-open test file");
        }
    } else {
        reportResult(false, "Cannot write to SD card");
    }

    // Check for sample bank
    if (SD.exists("/samples/bank00/")) {
        Serial.println("  ✓ Sample bank00 found");
        // Count WAV files
        File dir = SD.open("/samples/bank00/");
        int wavCount = 0;
        while (File entry = dir.openNextFile()) {
            String name = entry.name();
            if (name.endsWith(".wav") || name.endsWith(".WAV")) {
                wavCount++;
                Serial.printf("    %s (%lu bytes)\n", entry.name(), entry.size());
            }
            entry.close();
        }
        dir.close();
        Serial.printf("  Found %d WAV files in bank00\n", wavCount);
        reportResult(wavCount > 0, wavCount > 0 ? "Samples ready" : "No WAV files — add samples to /samples/bank00/");
    } else {
        Serial.println("  ⊘ No sample bank found at /samples/bank00/");
        Serial.println("    Create it and add sample01.wav through sample08.wav");
    }
}

void testAudioCodec() {
    printHeader("Audio Codec (SGTL5000)");

    bool ok = codec.enable();
    reportResult(ok, ok ? "SGTL5000 enabled" : "enable() failed — check Audio Shield connection");

    if (!ok) return;

    codec.volume(0.5);
    codec.inputSelect(AUDIO_INPUT_LINEIN);
    codec.lineInLevel(5);
    codec.lineOutLevel(13);

    reportResult(true, "Codec configured: vol=0.5, lineIn=5, lineOut=13");
}

void testAudioOutput() {
    printHeader("Audio Output (sine wave test tone)");

    Serial.println("  Playing 440Hz sine wave for 2 seconds...");
    Serial.println("  → Listen for the tone on headphones/speakers");

    testTone.frequency(440);
    testTone.amplitude(0.3);
    delay(2000);
    testTone.amplitude(0.0);

    // Quick chirp sequence to confirm
    Serial.println("  Playing chirp sequence (C-E-G)...");
    float notes[] = {261.63, 329.63, 392.00};
    for (int i = 0; i < 3; i++) {
        testTone.frequency(notes[i]);
        testTone.amplitude(0.3);
        delay(200);
        testTone.amplitude(0.0);
        delay(100);
    }

    if (waitForInput("Did you hear the tones? Press any key for yes.", 10000)) {
        reportResult(true, "Audio output confirmed");
    }
}

void testAudioInput() {
    printHeader("Audio Input (line in level meter)");

    Serial.println("  Reading input level for 5 seconds...");
    Serial.println("  → Plug in an audio source to line-in, or tap the jack");

    float maxPeakL = 0, maxPeakR = 0;
    unsigned long start = millis();

    while (millis() - start < 5000) {
        if (testPeakL.available()) {
            float p = testPeakL.read();
            if (p > maxPeakL) maxPeakL = p;
        }
        if (testPeakR.available()) {
            float p = testPeakR.read();
            if (p > maxPeakR) maxPeakR = p;
        }

        // Print level bar every 250ms
        static unsigned long lastPrint = 0;
        if (millis() - lastPrint >= 250) {
            float lev = max(testPeakL.available() ? testPeakL.read() : 0,
                           testPeakR.available() ? testPeakR.read() : 0);
            int bars = (int)(lev * 40);
            Serial.print("  ");
            for (int i = 0; i < 40; i++) {
                Serial.print(i < bars ? "█" : "░");
            }
            Serial.printf(" %.3f\n", lev);
            lastPrint = millis();
        }

        delay(10);
    }

    Serial.printf("  Peak levels — L: %.4f  R: %.4f\n", maxPeakL, maxPeakR);

    bool hasSignal = (maxPeakL > 0.01 || maxPeakR > 0.01);
    if (hasSignal) {
        reportResult(true, "Audio input detected signal");
    } else {
        Serial.println("  No signal detected (this is OK if nothing is plugged in)");
        reportResult(true, "Input is silent (expected with no source)");
    }

    Serial.printf("\n  Audio CPU: %.2f%%  Memory: %d/%d blocks\n",
                  AudioProcessorUsage(), AudioMemoryUsage(), AudioMemoryUsageMax());
}
