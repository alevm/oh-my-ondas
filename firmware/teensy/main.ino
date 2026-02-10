/**
 * Oh My Ondas - Main Firmware
 * Teensy 4.1 + Audio Shield
 *
 * Professional site-specific composition instrument
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
#include "synth_voice.h"
#include "scene_manager.h"
#include "audio_recorder.h"

// ============================================
// AUDIO OBJECTS
// ============================================

// Input sources
AudioInputI2S            audioInput;
AudioAnalyzeFFT1024      fft;
AudioAnalyzePeak         peakL, peakR;

// Sample players (8 voices)
AudioPlaySdWav           player[MAX_TRACKS];

// Per-track filters and amplifiers
AudioFilterStateVariable filter[MAX_TRACKS];
AudioAmplifier           amp[MAX_TRACKS];

// Player sub-mixers (4 channels each, covers 8 tracks)
AudioMixer4              playerMixL;  // tracks 0-3
AudioMixer4              playerMixR;  // tracks 4-7
AudioMixer4              sampleSum;   // combines both sub-mixers

// Synth voice objects
AudioSynthWaveform       synthWave1;
AudioSynthWaveform       synthWave2;
AudioSynthNoiseWhite     synthNoise;
AudioMixer4              synthMixer;
AudioFilterLadder        synthFilter;
AudioEffectEnvelope      synthEnv;

// Input mixer
AudioMixer4              inputMixer;

// Master dry mix (samples + synth + input)
AudioMixer4              masterMix;

// FX send/return
AudioMixer4              fxSend;      // send to effects
AudioEffectFreeverb      reverb;
AudioEffectDelay         delayL;
AudioEffectBitcrusher    crusher;
AudioEffectGranular      granular;
AudioEffectChorus        chorus;
AudioMixer4              fxReturn;    // reverb + delay + crusher + granular
AudioMixer4              fxReturn2;   // chorus + overflow

// Output mixing
AudioMixer4              outputMixer; // dry + wet

// Output
AudioOutputI2S           audioOutput;
AudioRecordQueue         recorder;

// Effect buffers
int16_t granularBuffer[GRANULAR_BUFFER_SIZE];
short chorusDelayLine[CHORUS_DELAY_LENGTH];

// Audio connections (must come after all object declarations)
#include "audio_connections.h"

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

// Audio codec control
AudioControlSGTL5000 audioShield;

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

struct GPSState {
    float lat = 0.0f;
    float lon = 0.0f;
    bool valid = false;
    unsigned long lastUpdate = 0;
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
    GPSState gps;
} state;

// Subsystems
SamplingEngine samplingEngine;
Sequencer sequencer;
FXEngine fxEngine;
UIManager uiManager;
SynthVoice synthVoice;
SceneManager sceneManager;
AudioRecorder audioRecorder;

// ============================================
// FORWARD DECLARATIONS
// ============================================

void handleTouchPads();
void handleEncoders();
void handleButtons();
void updateAudio();
void updateDisplay();
void updateLEDs();
void handleESP32Communication();
void onPadPressed(int pad);
void onPadReleased(int pad);
void onEncoderChange(int encoder, int delta);
void onModePressed();
void onRecPressed();
void onPlayPressed();
void onSequencerTrigger(int track, int step, const Step& stepData);
void processESP32Message(String message);
void sendToESP32(const char* type, JsonObject data);
void initSDDirectories();

// ============================================
// SETUP
// ============================================

void setup() {
    Serial.begin(115200);
    Serial.println("Oh My Ondas v0.2.0 Starting...");

    // Initialize audio memory
    AudioMemory(AUDIO_MEMORY_BLOCKS);

    // Initialize SD card
    if (!SD.begin(BUILTIN_SDCARD)) {
        Serial.println("ERROR: SD card failed!");
    } else {
        Serial.println("SD card initialized");
        initSDDirectories();
    }

    // Initialize I2C
    Wire.begin();
    Wire.setClock(400000);

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
        display.println("v0.2.0");
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
    audioShield.enable();
    audioShield.volume(0.7);
    audioShield.inputSelect(AUDIO_INPUT_LINEIN);
    audioShield.lineInLevel(5);
    audioShield.lineOutLevel(13);

    // Initialize per-track filters (wide open by default)
    for (int i = 0; i < MAX_TRACKS; i++) {
        filter[i].frequency(10000);
        filter[i].resonance(0.7);
        amp[i].gain(1.0);
    }

    // Initialize player sub-mixer gains
    for (int i = 0; i < 4; i++) {
        playerMixL.gain(i, 0.25);
        playerMixR.gain(i, 0.25);
    }
    sampleSum.gain(0, 1.0);
    sampleSum.gain(1, 1.0);

    // Initialize synth voice audio objects
    synthWave1.begin(0.5, 440, WAVEFORM_SAWTOOTH);
    synthWave1.amplitude(0.0);
    synthWave2.begin(0.5, 440, WAVEFORM_SQUARE);
    synthWave2.amplitude(0.0);
    synthNoise.amplitude(0.0);
    synthMixer.gain(0, 0.5);  // osc1
    synthMixer.gain(1, 0.3);  // osc2
    synthMixer.gain(2, 0.0);  // noise
    synthFilter.frequency(8000);
    synthFilter.resonance(0.7);
    synthEnv.attack(10);
    synthEnv.decay(100);
    synthEnv.sustain(0.7);
    synthEnv.release(200);

    // Initialize input mixer
    inputMixer.gain(0, 0.5);
    inputMixer.gain(1, 0.5);

    // Initialize master mix levels
    masterMix.gain(0, 0.8);  // samples
    masterMix.gain(1, 0.5);  // synth
    masterMix.gain(2, 0.3);  // input

    // Initialize FX send/return
    fxSend.gain(0, 1.0);     // main signal
    fxSend.gain(1, 0.3);     // delay feedback

    // FX return levels (all muted by default)
    fxReturn.gain(0, 0.0);   // reverb
    fxReturn.gain(1, 0.0);   // delay
    fxReturn.gain(2, 0.0);   // bitcrusher
    fxReturn.gain(3, 0.0);   // granular
    fxReturn2.gain(0, 0.0);  // chorus

    // Output mixer (dry/wet)
    outputMixer.gain(0, 0.8); // dry
    outputMixer.gain(1, 0.5); // wet (fxReturn)
    outputMixer.gain(2, 0.5); // wet (fxReturn2)

    // Initialize effects
    reverb.roomsize(0.7);
    reverb.damping(0.5);
    delayL.delay(0, 250);
    crusher.bits(12);
    crusher.sampleRate(22050);
    granular.begin(granularBuffer, GRANULAR_BUFFER_SIZE);
    chorus.begin(chorusDelayLine, CHORUS_DELAY_LENGTH, 2);

    // Initialize subsystems with audio object pointers
    samplingEngine.begin(player, amp);
    sequencer.begin(state.bpm);
    sequencer.setTriggerCallback(onSequencerTrigger);
    fxEngine.begin(&reverb, &delayL, &crusher, &granular, &chorus,
                   filter, &fxReturn, &fxReturn2, &fxSend);
    synthVoice.begin(&synthWave1, &synthWave2, &synthNoise,
                     &synthMixer, &synthFilter, &synthEnv);
    sceneManager.begin();
    audioRecorder.begin(&recorder);
    uiManager.begin(&display, &ledRing);

    // Setup serial communication with ESP32
    Serial2.begin(115200);

    Serial.println("Initialization complete!");
    Serial.printf("Audio CPU: %.2f%%, Memory: %d blocks\n",
                  AudioProcessorUsage(), AudioMemoryUsage());
}

// ============================================
// SD DIRECTORY INITIALIZATION
// ============================================

void initSDDirectories() {
    const char* dirs[] = {
        "/samples", "/patterns", "/recordings", "/presets"
    };
    for (auto dir : dirs) {
        if (!SD.exists(dir)) {
            SD.mkdir(dir);
            Serial.printf("Created directory: %s\n", dir);
        }
    }
}

// ============================================
// MAIN LOOP
// ============================================

void loop() {
    // High priority: Touch and audio (every loop)
    handleTouchPads();
    updateAudio();

    // High priority: Audio recording (every loop)
    audioRecorder.update();

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

    // GPS breadcrumb logging (every 10s)
    static unsigned long lastGPSLog = 0;
    if (state.gps.valid && millis() - lastGPSLog >= 10000) {
        File gpsFile = SD.open("/gps_log.csv", FILE_WRITE);
        if (gpsFile) {
            gpsFile.printf("%lu,%.6f,%.6f\n", millis(), state.gps.lat, state.gps.lon);
            gpsFile.close();
        }
        lastGPSLog = millis();
    }

    // Sequencer update (synced to tempo)
    if (state.isPlaying) {
        sequencer.update();
    }

    // Synth voice LFO update
    synthVoice.update();
}

// ============================================
// SEQUENCER TRIGGER CALLBACK
// ============================================

void onSequencerTrigger(int track, int step, const Step& stepData) {
    // Apply velocity
    float vel = stepData.velocity / 127.0f;
    amp[track].gain(vel);

    // Apply P-lock: filter frequency
    if (stepData.hasParamLock[PARAM_FILTER_FREQ]) {
        float freq = stepData.paramLocks[PARAM_FILTER_FREQ];
        filter[track].frequency(freq);
    }

    // Apply P-lock: filter resonance
    if (stepData.hasParamLock[PARAM_FILTER_RES]) {
        float res = stepData.paramLocks[PARAM_FILTER_RES];
        filter[track].resonance(res);
    }

    // Apply P-lock: volume
    if (stepData.hasParamLock[PARAM_VOLUME]) {
        float vol = stepData.paramLocks[PARAM_VOLUME];
        amp[track].gain(vol * vel);
    }

    // Apply P-lock: pitch (stored as semitones, applied as playback rate)
    if (stepData.hasParamLock[PARAM_PITCH]) {
        float pitch = powf(2.0f, stepData.paramLocks[PARAM_PITCH] / 12.0f);
        samplingEngine.setPitch(track, pitch);
    } else if (stepData.pitchOffset != 0) {
        float pitch = powf(2.0f, stepData.pitchOffset / 12.0f);
        samplingEngine.setPitch(track, pitch);
    }

    // Trigger the sample
    samplingEngine.trigger(track);

    DEBUG_PRINTF("Trigger: T%d S%d vel=%.2f\n", track, step, vel);
}

// ============================================
// TOUCH HANDLING
// ============================================

void handleTouchPads() {
    static uint16_t lastTouched = 0;
    uint16_t currentTouched = touchSensor.touched();

    for (int i = 0; i < MAX_PADS; i++) {
        if ((currentTouched & (1 << i)) && !(lastTouched & (1 << i))) {
            onPadPressed(i);
        }
        if (!(currentTouched & (1 << i)) && (lastTouched & (1 << i))) {
            onPadReleased(i);
        }
    }

    lastTouched = currentTouched;
}

void onPadPressed(int pad) {
    DEBUG_PRINTF("Pad %d pressed\n", pad);

    switch (state.mode) {
        case MODE_LIVE:
            if (state.shiftPressed) {
                // Shift+pad in LIVE mode: play synth note (C major scale)
                static const float noteFreqs[] = {
                    261.63, 293.66, 329.63, 349.23,
                    392.00, 440.00, 493.88, 523.25
                };
                synthVoice.noteOn(noteFreqs[pad], 0.8);
            } else {
                samplingEngine.trigger(pad);
            }
            break;

        case MODE_PATTERN:
            if (state.shiftPressed) {
                sequencer.toggleStep(pad);
            } else {
                sequencer.selectTrack(pad);
            }
            break;

        case MODE_SCENE:
            if (state.shiftPressed) {
                // Save current state to scene slot
                Scene scene;
                scene.masterVolume = state.masterVolume;
                scene.bpm = state.bpm;
                scene.currentFX = fxEngine.getCurrentEffect();
                scene.patternNumber = state.currentPattern;
                for (int i = 0; i < MAX_TRACKS; i++) {
                    scene.trackVolumes[i] = samplingEngine.getVolume(i);
                    scene.trackMutes[i] = sequencer.isTrackMuted(i);
                }
                for (int i = 0; i < 3; i++) {
                    scene.fxParams[i] = fxEngine.getParam(i);
                }
                scene.fxMix = fxEngine.getMix();
                sceneManager.saveScene(pad % MAX_SCENES, scene);
                uiManager.showMessage("SAVED");
            } else if (pad < MAX_SCENES) {
                // Recall scene
                Scene scene;
                if (sceneManager.recallScene(pad, scene)) {
                    state.masterVolume = scene.masterVolume;
                    state.bpm = scene.bpm;
                    sequencer.setTempo(scene.bpm);
                    state.currentScene = pad;
                    for (int i = 0; i < MAX_TRACKS; i++) {
                        samplingEngine.setVolume(i, scene.trackVolumes[i]);
                        if (scene.trackMutes[i]) sequencer.muteTrack(i);
                        else sequencer.unmuteTrack(i);
                    }
                    fxEngine.setMix(scene.fxMix);
                    for (int i = 0; i < 3; i++) {
                        fxEngine.setParam(i, scene.fxParams[i]);
                    }
                    uiManager.showMessage("RECALL");
                }
            }
            break;

        case MODE_DUB:
            // DUB mode: trigger sample + record to current sequencer step
            samplingEngine.trigger(pad);
            if (state.isPlaying) {
                int step = sequencer.getCurrentStep();
                sequencer.setStep(pad, step, true);
                DEBUG_PRINTF("DUB: recorded pad %d at step %d\n", pad, step);
            }
            break;

        case MODE_AI_COMPOSE:
            // Future: AI interaction
            break;
    }

    // Visual feedback
    ledRing.setPixelColor(pad, ledRing.Color(0, 100, 255));
    ledRing.show();
}

void onPadReleased(int pad) {
    if (state.mode == MODE_LIVE) {
        if (state.shiftPressed) {
            synthVoice.noteOff();
        } else if (!samplingEngine.isLooping(pad)) {
            samplingEngine.stop(pad);
        }
    }

    ledRing.setPixelColor(pad, ledRing.Color(0, 0, 0));
    ledRing.show();
}

// ============================================
// ENCODER HANDLING
// ============================================

void handleEncoders() {
    static long lastPositions[4] = {0, 0, 0, 0};

    for (int i = 0; i < 4; i++) {
        long newPos = encoders[i].read() / 4;

        if (newPos != lastPositions[i]) {
            int delta = newPos - lastPositions[i];
            onEncoderChange(i, delta);
            lastPositions[i] = newPos;
        }
    }
}

void onEncoderChange(int encoder, int delta) {
    DEBUG_PRINTF("Encoder %d: %+d (shift: %d)\n", encoder, delta, state.shiftPressed);

    if (state.shiftPressed) {
        switch (encoder) {
            case 0: {
                // Scene morph
                static float morphProgress = 0.0f;
                morphProgress = constrain(morphProgress + delta * 0.05f, 0.0f, 1.0f);
                Scene morphed;
                if (sceneManager.morphTo(state.currentScene, morphProgress, morphed)) {
                    state.masterVolume = morphed.masterVolume;
                    for (int i = 0; i < MAX_TRACKS; i++) {
                        samplingEngine.setVolume(i, morphed.trackVolumes[i]);
                    }
                }
                break;
            }
            case 1:
                fxEngine.adjustParam(1, delta * 0.01f);
                break;
            case 2:
                fxEngine.setLFORate(fxEngine.getLFOValue() + delta * 0.1f);
                break;
            case 3:
                sequencer.adjustSwing(delta);
                break;
        }
    } else {
        switch (encoder) {
            case 0:
                state.masterVolume = constrain(state.masterVolume + delta * 0.02f, 0.0f, 1.0f);
                outputMixer.gain(0, state.masterVolume);
                break;
            case 1:
                fxEngine.selectEffect(delta);
                break;
            case 2:
                fxEngine.adjustParam(0, delta * 0.01f);
                break;
            case 3:
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

    if (currentStates[0] == LOW && lastButtonStates[0] == HIGH) {
        onModePressed();
    }

    state.shiftPressed = (currentStates[1] == LOW);

    if (currentStates[2] == LOW && lastButtonStates[2] == HIGH) {
        onRecPressed();
    }

    if (currentStates[3] == LOW && lastButtonStates[3] == HIGH) {
        onPlayPressed();
    }

    for (int i = 0; i < 4; i++) {
        lastButtonStates[i] = currentStates[i];
    }
}

void onModePressed() {
    state.mode = (SystemMode)((state.mode + 1) % 5);
    Serial.printf("Mode changed to: %d\n", state.mode);

    const char* modeNames[] = {"LIVE", "PATTERN", "SCENE", "DUB", "AI"};
    uiManager.showMessage(modeNames[state.mode]);

    // Auto-switch display screen to match mode
    switch (state.mode) {
        case MODE_LIVE:      uiManager.setScreen(SCREEN_MAIN);    break;
        case MODE_PATTERN:   uiManager.setScreen(SCREEN_PATTERN); break;
        case MODE_SCENE:     uiManager.setScreen(SCREEN_SCENE);   break;
        case MODE_DUB:       uiManager.setScreen(SCREEN_MAIN);    break;
        case MODE_AI_COMPOSE: uiManager.setScreen(SCREEN_SETTINGS); break;
    }
}

void onRecPressed() {
    state.isRecording = !state.isRecording;
    Serial.printf("Recording: %s\n", state.isRecording ? "ON" : "OFF");

    if (state.isRecording) {
        // Generate filename with counter
        char filename[64];
        int recNum = 0;
        do {
            snprintf(filename, sizeof(filename), "/recordings/rec_%04d.wav", recNum++);
        } while (SD.exists(filename) && recNum < 9999);

        audioRecorder.startRecording(filename);

        // Save GPS metadata alongside recording
        if (state.gps.valid) {
            char metaPath[64];
            snprintf(metaPath, sizeof(metaPath), "/recordings/rec_%04d.json", recNum - 1);
            File meta = SD.open(metaPath, FILE_WRITE);
            if (meta) {
                meta.printf("{\"lat\":%.6f,\"lon\":%.6f,\"time\":%lu}\n",
                           state.gps.lat, state.gps.lon, millis());
                meta.close();
            }
        }

        uiManager.showMessage("REC");
    } else {
        audioRecorder.stopRecording();
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
    // Update sampling engine (polls player states)
    samplingEngine.update();

    // Update effects (applies current FX params to audio objects)
    fxEngine.update();

    // Update master volume
    outputMixer.gain(0, state.masterVolume);
}

// ============================================
// DISPLAY UPDATE
// ============================================

void updateDisplay() {
    uiManager.update(state, sequencer, fxEngine, samplingEngine, sceneManager);
}

// ============================================
// LED UPDATE
// ============================================

void updateLEDs() {
    if (state.isPlaying) {
        int currentStep = sequencer.getCurrentStep();
        for (int i = 0; i < 8; i++) {
            if (i == currentStep % 8) {
                ledRing.setPixelColor(i, ledRing.Color(255, 255, 255));
            } else if (sequencer.hasStep(i)) {
                ledRing.setPixelColor(i, ledRing.Color(50, 50, 50));
            } else {
                ledRing.setPixelColor(i, ledRing.Color(0, 0, 0));
            }
        }
    } else if (state.isRecording) {
        static uint8_t brightness = 0;
        static int8_t direction = 5;
        brightness += direction;
        if (brightness >= 250 || brightness <= 5) direction = -direction;

        for (int i = 0; i < 8; i++) {
            ledRing.setPixelColor(i, ledRing.Color(brightness, 0, 0));
        }
    } else if (state.mode == MODE_SCENE) {
        // Show saved scene slots in green
        for (int i = 0; i < 8; i++) {
            if (i < MAX_SCENES && sceneManager.isSceneSaved(i)) {
                if (i == state.currentScene) {
                    ledRing.setPixelColor(i, ledRing.Color(0, 255, 0));
                } else {
                    ledRing.setPixelColor(i, ledRing.Color(0, 40, 0));
                }
            } else {
                ledRing.setPixelColor(i, ledRing.Color(0, 0, 0));
            }
        }
    }

    ledRing.show();
}

// ============================================
// ESP32 COMMUNICATION
// ============================================

void handleESP32Communication() {
    while (Serial2.available()) {
        String message = Serial2.readStringUntil('\n');
        processESP32Message(message);
    }
}

void processESP32Message(String message) {
    StaticJsonDocument<512> doc;
    DeserializationError error = deserializeJson(doc, message);

    if (error) {
        Serial.printf("JSON parse error: %s\n", error.c_str());
        return;
    }

    const char* type = doc["type"];

    if (strcmp(type, "gps") == 0) {
        state.gps.lat = doc["lat"];
        state.gps.lon = doc["lon"];
        state.gps.valid = true;
        state.gps.lastUpdate = millis();
        DEBUG_PRINTF("GPS: %.6f, %.6f\n", state.gps.lat, state.gps.lon);
    }
    else if (strcmp(type, "ai_response") == 0) {
        const char* structure = doc["structure"];
        Serial.printf("AI Response: %s\n", structure);
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
