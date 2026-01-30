/**
 * Oh My Ondas - Main Firmware
 * Teensy 4.1 + Audio Shield
 * 
 * Professional site-specific composition instrument
 * Combines: Octatrack sequencing + Bastl mangling + TE interface
 */

#include <Audio.h>
#include <Wire.h>
#include <SPI.h>
#include <SD.h>
#include <SerialFlash.h>
#include <Adafruit_MPR121.h>
#include <Adafruit_SSD1306.h>
#include <Encoder.h>
#include <Adafruit_NeoPixel.h>
#include <ArduinoJson.h>

#include "config.h"
#include "sampling_engine.h"
#include "sequencer.h"
#include "fx_engine.h"
#include "ui_manager.h"

// ============================================
// AUDIO OBJECTS
// ============================================

// Input sources
AudioInputI2S            audioInput;
AudioAnalyzeFFT1024      fft;
AudioAnalyzePeak         peakL, peakR;

// Sample players (8 voices)
AudioPlaySdWav           player[MAX_TRACKS];

// Mixers
AudioMixer4              mixerL1, mixerL2;
AudioMixer4              mixerR1, mixerR2;
AudioMixer4              mixerMasterL, mixerMasterR;

// Effects
AudioEffectDelay         delayL, delayR;
AudioEffectFreeverb      reverb;
AudioFilterStateVariable filter[MAX_TRACKS];

// Output
AudioOutputI2S           audioOutput;
AudioRecordQueue         recorder;

// Audio connections - defined in audio_connections.cpp

// ============================================
// HARDWARE OBJECTS
// ============================================

// Touch sensor
Adafruit_MPR121 touchSensor = Adafruit_MPR121();

// Display
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// Encoders
Encoder encoders[4] = {
    Encoder(ENC1_CLK, ENC1_DT),
    Encoder(ENC2_CLK, ENC2_DT),
    Encoder(ENC3_CLK, ENC3_DT),
    Encoder(ENC4_CLK, ENC4_DT)
};

// LED Ring
Adafruit_NeoPixel ledRing(LED_COUNT, LED_PIN, NEO_GRB + NEO_KHZ800);

// ============================================
// SYSTEM STATE
// ============================================

enum SystemMode {
    MODE_LIVE,
    MODE_PATTERN,
    MODE_SCENE,
    MODE_DUB,
    MODE_AI_COMPOSE
};

struct SystemState {
    SystemMode mode = MODE_LIVE;
    bool isPlaying = false;
    bool isRecording = false;
    bool shiftPressed = false;
    uint8_t currentPattern = 0;
    uint8_t currentScene = 0;
    float masterVolume = 0.8f;
    float bpm = 120.0f;
} state;

// Subsystems
SamplingEngine samplingEngine;
Sequencer sequencer;
FXEngine fxEngine;
UIManager uiManager;

// ============================================
// SETUP
// ============================================

void setup() {
    Serial.begin(115200);
    Serial.println("Oh My Ondas v0.1.0 Starting...");
    
    // Initialize audio memory
    AudioMemory(AUDIO_MEMORY_BLOCKS);
    
    // Initialize SD card
    if (!SD.begin(BUILTIN_SDCARD)) {
        Serial.println("ERROR: SD card failed!");
        // Continue anyway for debugging
    } else {
        Serial.println("SD card initialized");
    }
    
    // Initialize I2C
    Wire.begin();
    Wire.setClock(400000); // Fast mode
    
    // Initialize touch sensor
    if (!touchSensor.begin(0x5A)) {
        Serial.println("ERROR: MPR121 not found!");
    } else {
        Serial.println("Touch sensor initialized");
    }
    
    // Initialize display
    if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
        Serial.println("ERROR: OLED not found!");
    } else {
        display.clearDisplay();
        display.setTextSize(1);
        display.setTextColor(SSD1306_WHITE);
        display.setCursor(0, 0);
        display.println("OH MY ONDAS");
        display.println("v0.1.0");
        display.display();
        Serial.println("Display initialized");
    }
    
    // Initialize LED ring
    ledRing.begin();
    ledRing.setBrightness(50);
    ledRing.clear();
    ledRing.show();
    Serial.println("LED ring initialized");
    
    // Initialize buttons
    pinMode(BTN_MODE, INPUT_PULLUP);
    pinMode(BTN_SHIFT, INPUT_PULLUP);
    pinMode(BTN_REC, INPUT_PULLUP);
    pinMode(BTN_PLAY, INPUT_PULLUP);
    
    // Initialize encoder switches
    pinMode(ENC1_SW, INPUT_PULLUP);
    pinMode(ENC2_SW, INPUT_PULLUP);
    pinMode(ENC3_SW, INPUT_PULLUP);
    pinMode(ENC4_SW, INPUT_PULLUP);
    
    // Initialize audio codec
    AudioControlSGTL5000 audioShield;
    audioShield.enable();
    audioShield.volume(0.7);
    audioShield.inputSelect(AUDIO_INPUT_LINEIN);
    audioShield.lineInLevel(5);
    audioShield.lineOutLevel(13);
    
    // Initialize subsystems
    samplingEngine.begin();
    sequencer.begin(state.bpm);
    fxEngine.begin();
    uiManager.begin(&display, &ledRing);
    
    // Setup serial communication with ESP32
    Serial2.begin(115200);
    
    Serial.println("Initialization complete!");
    Serial.printf("Audio CPU: %.2f%%, Memory: %d blocks\n", 
                  AudioProcessorUsage(), AudioMemoryUsage());
}

// ============================================
// MAIN LOOP
// ============================================

void loop() {
    // High priority: Touch and audio (every loop)
    handleTouchPads();
    updateAudio();
    
    // Medium priority: UI (every 10ms)
    static unsigned long lastUI = 0;
    if (millis() - lastUI >= 10) {
        handleEncoders();
        handleButtons();
        lastUI = millis();
    }
    
    // Lower priority: Display (every 50ms)
    static unsigned long lastDisplay = 0;
    if (millis() - lastDisplay >= 50) {
        updateDisplay();
        updateLEDs();
        lastDisplay = millis();
    }
    
    // Low priority: Serial/ESP32 (every 100ms)
    static unsigned long lastSerial = 0;
    if (millis() - lastSerial >= 100) {
        handleESP32Communication();
        lastSerial = millis();
    }
    
    // Sequencer update (synced to tempo)
    if (state.isPlaying) {
        sequencer.update();
    }
}

// ============================================
// TOUCH HANDLING
// ============================================

void handleTouchPads() {
    static uint16_t lastTouched = 0;
    uint16_t currentTouched = touchSensor.touched();
    
    for (int i = 0; i < MAX_PADS; i++) {
        // Detect touch down
        if ((currentTouched & (1 << i)) && !(lastTouched & (1 << i))) {
            onPadPressed(i);
        }
        // Detect touch up
        if (!(currentTouched & (1 << i)) && (lastTouched & (1 << i))) {
            onPadReleased(i);
        }
    }
    
    lastTouched = currentTouched;
}

void onPadPressed(int pad) {
    Serial.printf("Pad %d pressed\n", pad);
    
    switch (state.mode) {
        case MODE_LIVE:
            // Trigger sample
            samplingEngine.trigger(pad);
            break;
            
        case MODE_PATTERN:
            if (state.shiftPressed) {
                // Toggle step
                sequencer.toggleStep(pad);
            } else {
                // Select track
                sequencer.selectTrack(pad);
            }
            break;
            
        case MODE_SCENE:
            // Trigger scene
            // TODO: Implement scene triggering
            break;
            
        case MODE_DUB:
            // Arm track for recording
            // TODO: Implement dub mode
            break;
            
        case MODE_AI_COMPOSE:
            // Start/stop AI capture
            // TODO: Implement AI mode
            break;
    }
    
    // Visual feedback
    ledRing.setPixelColor(pad, ledRing.Color(0, 100, 255));
    ledRing.show();
}

void onPadReleased(int pad) {
    Serial.printf("Pad %d released\n", pad);
    
    if (state.mode == MODE_LIVE) {
        // Check if we should stop the sample
        if (!samplingEngine.isLooping(pad)) {
            samplingEngine.stop(pad);
        }
    }
    
    // Visual feedback
    ledRing.setPixelColor(pad, ledRing.Color(0, 0, 0));
    ledRing.show();
}

// ============================================
// ENCODER HANDLING
// ============================================

void handleEncoders() {
    static long lastPositions[4] = {0, 0, 0, 0};
    
    for (int i = 0; i < 4; i++) {
        long newPos = encoders[i].read() / 4; // Divide by 4 for detents
        
        if (newPos != lastPositions[i]) {
            int delta = newPos - lastPositions[i];
            onEncoderChange(i, delta);
            lastPositions[i] = newPos;
        }
    }
}

void onEncoderChange(int encoder, int delta) {
    Serial.printf("Encoder %d: %+d (shift: %d)\n", encoder, delta, state.shiftPressed);
    
    if (state.shiftPressed) {
        // Shift functions
        switch (encoder) {
            case 0: // Scene morph
                // TODO: Implement scene morphing
                break;
            case 1: // FX param 2
                fxEngine.adjustParam(1, delta * 0.01f);
                break;
            case 2: // LFO rate
                // TODO: Implement LFO
                break;
            case 3: // Swing
                sequencer.adjustSwing(delta);
                break;
        }
    } else {
        // Normal functions
        switch (encoder) {
            case 0: // Mix
                state.masterVolume = constrain(state.masterVolume + delta * 0.02f, 0.0f, 1.0f);
                break;
            case 1: // FX select
                fxEngine.selectEffect(delta);
                break;
            case 2: // Mod depth
                fxEngine.adjustParam(0, delta * 0.01f);
                break;
            case 3: // Tempo
                state.bpm = constrain(state.bpm + delta, 40.0f, 300.0f);
                sequencer.setTempo(state.bpm);
                break;
        }
    }
}

// ============================================
// BUTTON HANDLING
// ============================================

void handleButtons() {
    static bool lastButtonStates[4] = {true, true, true, true};
    bool currentStates[4] = {
        digitalRead(BTN_MODE),
        digitalRead(BTN_SHIFT),
        digitalRead(BTN_REC),
        digitalRead(BTN_PLAY)
    };
    
    // MODE button
    if (currentStates[0] == LOW && lastButtonStates[0] == HIGH) {
        onModePressed();
    }
    
    // SHIFT button
    state.shiftPressed = (currentStates[1] == LOW);
    
    // REC button
    if (currentStates[2] == LOW && lastButtonStates[2] == HIGH) {
        onRecPressed();
    }
    
    // PLAY button
    if (currentStates[3] == LOW && lastButtonStates[3] == HIGH) {
        onPlayPressed();
    }
    
    for (int i = 0; i < 4; i++) {
        lastButtonStates[i] = currentStates[i];
    }
}

void onModePressed() {
    // Cycle through modes
    state.mode = (SystemMode)((state.mode + 1) % 5);
    Serial.printf("Mode changed to: %d\n", state.mode);
    
    const char* modeNames[] = {"LIVE", "PATTERN", "SCENE", "DUB", "AI"};
    uiManager.showMessage(modeNames[state.mode]);
}

void onRecPressed() {
    state.isRecording = !state.isRecording;
    Serial.printf("Recording: %s\n", state.isRecording ? "ON" : "OFF");
    
    if (state.isRecording) {
        // Start recording
        // TODO: Implement recording
        uiManager.showMessage("REC");
    } else {
        // Stop recording
        uiManager.showMessage("STOP");
    }
}

void onPlayPressed() {
    state.isPlaying = !state.isPlaying;
    Serial.printf("Playing: %s\n", state.isPlaying ? "ON" : "OFF");
    
    if (state.isPlaying) {
        sequencer.start();
        uiManager.showMessage("PLAY");
    } else {
        sequencer.stop();
        uiManager.showMessage("STOP");
    }
}

// ============================================
// AUDIO UPDATE
// ============================================

void updateAudio() {
    // Update sampling engine
    samplingEngine.update();
    
    // Update effects
    fxEngine.update();
    
    // Update master volume
    // mixerMasterL.gain(0, state.masterVolume);
    // mixerMasterR.gain(0, state.masterVolume);
}

// ============================================
// DISPLAY UPDATE
// ============================================

void updateDisplay() {
    uiManager.update(state);
}

// ============================================
// LED UPDATE
// ============================================

void updateLEDs() {
    if (state.isPlaying) {
        // Show step position
        int currentStep = sequencer.getCurrentStep();
        for (int i = 0; i < 8; i++) {
            if (i == currentStep % 8) {
                ledRing.setPixelColor(i, ledRing.Color(0, 255, 0));
            } else if (sequencer.hasStep(i)) {
                ledRing.setPixelColor(i, ledRing.Color(50, 50, 50));
            } else {
                ledRing.setPixelColor(i, ledRing.Color(0, 0, 0));
            }
        }
    } else if (state.isRecording) {
        // Pulsing red for recording
        static uint8_t brightness = 0;
        static int8_t direction = 5;
        brightness += direction;
        if (brightness >= 250 || brightness <= 5) direction = -direction;
        
        for (int i = 0; i < 8; i++) {
            ledRing.setPixelColor(i, ledRing.Color(brightness, 0, 0));
        }
    }
    
    ledRing.show();
}

// ============================================
// ESP32 COMMUNICATION
// ============================================

void handleESP32Communication() {
    // Check for incoming messages from ESP32
    while (Serial2.available()) {
        String message = Serial2.readStringUntil('\n');
        processESP32Message(message);
    }
}

void processESP32Message(String message) {
    // Parse JSON message from ESP32
    StaticJsonDocument<512> doc;
    DeserializationError error = deserializeJson(doc, message);
    
    if (error) {
        Serial.printf("JSON parse error: %s\n", error.c_str());
        return;
    }
    
    const char* type = doc["type"];
    
    if (strcmp(type, "gps") == 0) {
        // GPS update
        float lat = doc["lat"];
        float lon = doc["lon"];
        Serial.printf("GPS: %.6f, %.6f\n", lat, lon);
        // TODO: Store GPS data
    }
    else if (strcmp(type, "ai_response") == 0) {
        // AI composition response
        const char* structure = doc["structure"];
        Serial.printf("AI Response: %s\n", structure);
        // TODO: Process AI composition
    }
    else if (strcmp(type, "wifi_status") == 0) {
        bool connected = doc["connected"];
        Serial.printf("WiFi: %s\n", connected ? "Connected" : "Disconnected");
    }
}

void sendToESP32(const char* type, JsonObject data) {
    StaticJsonDocument<256> doc;
    doc["type"] = type;
    doc["data"] = data;
    
    String output;
    serializeJson(doc, output);
    Serial2.println(output);
}
