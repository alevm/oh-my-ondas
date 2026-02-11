/**
 * Oh My Ondas - Main Firmware v0.3.0
 * Teensy 4.1 + Audio Shield
 *
 * Full hardware: 13 encoders, 19 buttons, 5" LCD,
 * map OLED, faders, crossfader, joystick, touch pads
 */

#include <Audio.h>
#include <Wire.h>
#include <SPI.h>
#include <SD.h>
#include <SerialFlash.h>
#include <Encoder.h>
#include <Adafruit_NeoPixel.h>
#include <ArduinoJson.h>

#include "config.h"
#include "system_state.h"
#include "sampling_engine.h"
#include "sequencer.h"
#include "fx_engine.h"
#include "synth_voice.h"
#include "scene_manager.h"
#include "audio_recorder.h"
#include "input_manager.h"
#include "lcd_display.h"
#include "map_display.h"

// ============================================
// AUDIO OBJECTS
// ============================================

AudioInputI2S            audioInput;
AudioAnalyzeFFT1024      fft;
AudioAnalyzePeak         peakL, peakR;

AudioPlaySdWav           player[MAX_TRACKS];
AudioFilterStateVariable filter[MAX_TRACKS];
AudioAmplifier           amp[MAX_TRACKS];

AudioMixer4              playerMixL;
AudioMixer4              playerMixR;
AudioMixer4              sampleSum;

AudioSynthWaveform       synthWave1;
AudioSynthWaveform       synthWave2;
AudioSynthNoiseWhite     synthNoise;
AudioMixer4              synthMixer;
AudioFilterLadder        synthFilter;
AudioEffectEnvelope      synthEnv;

AudioMixer4              inputMixer;
AudioMixer4              masterMix;

AudioMixer4              fxSend;
AudioEffectFreeverb      reverb;
AudioEffectDelay         delayL;
AudioEffectBitcrusher    crusher;
AudioEffectGranular      granular;
AudioEffectChorus        chorus;
AudioMixer4              fxReturn;
AudioMixer4              fxReturn2;

AudioMixer4              outputMixer;
AudioOutputI2S           audioOutput;
AudioRecordQueue         recorder;

int16_t granularBuffer[GRANULAR_BUFFER_SIZE];
short chorusDelayLine[CHORUS_DELAY_LENGTH];

#include "audio_connections.h"

// ============================================
// HARDWARE OBJECTS
// ============================================

Adafruit_NeoPixel ledRing(LED_COUNT, LED_PIN, NEO_GRB + NEO_KHZ800);
AudioControlSGTL5000 audioShield;

// ============================================
// SYSTEM STATE
// ============================================

SystemState state;

// ============================================
// SUBSYSTEMS
// ============================================

SamplingEngine samplingEngine;
Sequencer      sequencer;
FXEngine       fxEngine;
SynthVoice     synthVoice;
SceneManager   sceneManager;
AudioRecorder  audioRecorder;
InputManager   inputManager;
LCDDisplay     lcdDisplay;
MapDisplay     mapDisplay;

// ============================================
// FORWARD DECLARATIONS
// ============================================

void updateAudio();
void updateDisplay();
void updateLEDs();
void handleESP32Communication();

// Input callbacks
void onEncoderChange(int encoderID, int delta);
void onButtonEvent(int buttonID, bool pressed);
void onFaderChange(int faderID, float value);
void onJoystickChange(uint8_t directions);
void onTouchEvent(int pad, bool pressed);

// Actions
void onModePressed();
void onRecPressed();
void onPlayPressed();
void onStopPressed();

void onSequencerTrigger(int track, int step, const Step& stepData);
void processESP32Message(String message);
void sendToESP32(const char* type, JsonObject data);
void initSDDirectories();

// ============================================
// SETUP
// ============================================

void setup() {
    Serial.begin(115200);
    Serial.println("Oh My Ondas v" VERSION " Starting...");

    // Audio memory
    AudioMemory(AUDIO_MEMORY_BLOCKS);

    // SD card
    if (!SD.begin(BUILTIN_SDCARD)) {
        Serial.println("ERROR: SD card failed!");
    } else {
        Serial.println("SD card initialized");
        initSDDirectories();
    }

    // I2C (shared: OLED, MPR121, MCP23017×2, ADS1115)
    Wire.begin();
    Wire.setClock(400000);
    Wire.setTimeout(1000);  // 1ms I2C timeout — prevents bus hangs

    // LED ring
    ledRing.begin();
    ledRing.setBrightness(50);
    ledRing.clear();
    ledRing.show();

    // GPS status LED
    pinMode(LED_GPS, OUTPUT);
    digitalWrite(LED_GPS, LOW);

    // Audio codec
    audioShield.enable();
    audioShield.volume(0.7);
    audioShield.inputSelect(AUDIO_INPUT_LINEIN);
    audioShield.lineInLevel(5);
    audioShield.lineOutLevel(13);

    // Per-track filters
    for (int i = 0; i < MAX_TRACKS; i++) {
        filter[i].frequency(10000);
        filter[i].resonance(0.7);
        amp[i].gain(1.0);
    }

    // Player sub-mixer gains
    for (int i = 0; i < 4; i++) {
        playerMixL.gain(i, 0.25);
        playerMixR.gain(i, 0.25);
    }
    sampleSum.gain(0, 1.0);
    sampleSum.gain(1, 1.0);

    // Synth voice init
    synthWave1.begin(0.5, 440, WAVEFORM_SAWTOOTH);
    synthWave1.amplitude(0.0);
    synthWave2.begin(0.5, 440, WAVEFORM_SQUARE);
    synthWave2.amplitude(0.0);
    synthNoise.amplitude(0.0);
    synthMixer.gain(0, 0.5);
    synthMixer.gain(1, 0.3);
    synthMixer.gain(2, 0.0);
    synthFilter.frequency(8000);
    synthFilter.resonance(0.7);
    synthEnv.attack(10);
    synthEnv.decay(100);
    synthEnv.sustain(0.7);
    synthEnv.release(200);

    // Input mixer
    inputMixer.gain(0, 0.5);
    inputMixer.gain(1, 0.5);

    // Master mix
    masterMix.gain(0, 0.8);
    masterMix.gain(1, 0.5);
    masterMix.gain(2, 0.3);

    // FX send/return
    fxSend.gain(0, 1.0);
    fxSend.gain(1, 0.3);
    fxReturn.gain(0, 0.0);
    fxReturn.gain(1, 0.0);
    fxReturn.gain(2, 0.0);
    fxReturn.gain(3, 0.0);
    fxReturn2.gain(0, 0.0);

    // Output mixer
    outputMixer.gain(0, 0.8);
    outputMixer.gain(1, 0.5);
    outputMixer.gain(2, 0.5);

    // Effects init
    reverb.roomsize(0.7);
    reverb.damping(0.5);
    delayL.delay(0, 250);
    crusher.bits(12);
    crusher.sampleRate(22050);
    granular.begin(granularBuffer, GRANULAR_BUFFER_SIZE);
    chorus.begin(chorusDelayLine, CHORUS_DELAY_LENGTH, 2);

    // Subsystem init
    samplingEngine.begin(player, amp);
    sequencer.begin(state.bpm);
    sequencer.setTriggerCallback(onSequencerTrigger);
    fxEngine.begin(&reverb, &delayL, &crusher, &granular, &chorus,
                   filter, &fxReturn, &fxReturn2, &fxSend);
    synthVoice.begin(&synthWave1, &synthWave2, &synthNoise,
                     &synthMixer, &synthFilter, &synthEnv);
    sceneManager.begin();
    audioRecorder.begin(&recorder);

    // Input manager (MCP23017, ADS1115, direct GPIO, touch)
    inputManager.begin();
    inputManager.setEncoderCallback(onEncoderChange);
    inputManager.setButtonCallback(onButtonEvent);
    inputManager.setFaderCallback(onFaderChange);
    inputManager.setJoystickCallback(onJoystickChange);
    inputManager.setTouchCallback(onTouchEvent);

    // Displays
    lcdDisplay.begin();
    mapDisplay.begin();

    // ESP32 UART
    Serial2.begin(115200);

    Serial.println("Initialization complete!");
    Serial.printf("Audio CPU: %.2f%%, Memory: %d blocks\n",
                  AudioProcessorUsage(), AudioMemoryUsage());
}

// ============================================
// SD DIRECTORY INITIALIZATION
// ============================================

void initSDDirectories() {
    const char* dirs[] = { "/samples", "/patterns", "/recordings", "/presets" };
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
    // High priority: input + audio (every loop)
    inputManager.update();
    updateAudio();
    audioRecorder.update();

    // Display updates (every 50ms)
    static unsigned long lastDisplay = 0;
    if (millis() - lastDisplay >= 50) {
        updateDisplay();
        updateLEDs();
        lastDisplay = millis();
    }

    // ESP32 communication (every 100ms)
    static unsigned long lastSerial = 0;
    if (millis() - lastSerial >= 100) {
        handleESP32Communication();
        lastSerial = millis();
    }

    // Map display update (every 200ms — OLED is slow)
    static unsigned long lastMap = 0;
    if (millis() - lastMap >= 200) {
        mapDisplay.update(state.gps.lat, state.gps.lon, state.gps.valid);
        lastMap = millis();
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

    // Sequencer (tempo-synced)
    if (state.isPlaying) {
        sequencer.update();
    }

    // Synth LFO
    synthVoice.update();
}

// ============================================
// SEQUENCER TRIGGER CALLBACK
// ============================================

void onSequencerTrigger(int track, int step, const Step& stepData) {
    float vel = stepData.velocity / 127.0f;
    amp[track].gain(vel);

    if (stepData.hasParamLock[PARAM_FILTER_FREQ]) {
        filter[track].frequency(stepData.paramLocks[PARAM_FILTER_FREQ]);
    }
    if (stepData.hasParamLock[PARAM_FILTER_RES]) {
        filter[track].resonance(stepData.paramLocks[PARAM_FILTER_RES]);
    }
    if (stepData.hasParamLock[PARAM_VOLUME]) {
        amp[track].gain(stepData.paramLocks[PARAM_VOLUME] * vel);
    }
    if (stepData.hasParamLock[PARAM_PITCH]) {
        samplingEngine.setPitch(track, powf(2.0f, stepData.paramLocks[PARAM_PITCH] / 12.0f));
    } else if (stepData.pitchOffset != 0) {
        samplingEngine.setPitch(track, powf(2.0f, stepData.pitchOffset / 12.0f));
    }

    samplingEngine.trigger(track);
    DEBUG_PRINTF("Trigger: T%d S%d vel=%.2f\n", track, step, vel);
}

// ============================================
// ENCODER CALLBACK — All 13 encoders
// ============================================

void onEncoderChange(int encoderID, int delta) {
    DEBUG_PRINTF("Encoder %d: %+d (shift: %d)\n", encoderID, delta, state.shiftPressed);

    switch (encoderID) {
        // ── Direct Encoders ──
        case ENC_VOL:
            if (state.shiftPressed) {
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
            } else {
                state.masterVolume = constrain(state.masterVolume + delta * 0.02f, 0.0f, 1.0f);
                outputMixer.gain(0, state.masterVolume);
            }
            break;

        case ENC_PAN:
            if (state.shiftPressed) {
                fxEngine.adjustParam(1, delta * 0.01f);
            } else {
                fxEngine.selectEffect(delta);
            }
            break;

        case ENC_FILT:
            if (state.shiftPressed) {
                fxEngine.setLFORate(fxEngine.getLFOValue() + delta * 0.1f);
            } else {
                fxEngine.adjustParam(0, delta * 0.01f);
            }
            break;

        case ENC_FX:
            if (state.shiftPressed) {
                fxEngine.adjustParam(2, delta * 0.01f);
            } else {
                fxEngine.setMix(constrain(fxEngine.getMix() + delta * 0.02f, 0.0f, 1.0f));
            }
            break;

        case ENC_DECAY:
            if (state.shiftPressed) {
                sequencer.adjustSwing(delta);
            } else {
                state.bpm = constrain(state.bpm + delta, 40.0f, 300.0f);
                sequencer.setTempo(state.bpm);
            }
            break;

        // ── MCP Encoders (synth/FX) ──
        case ENC_CUT:
            synthVoice.setFilterFreq(constrain(100.0f + delta * 100.0f, 20.0f, 20000.0f));
            break;
        case ENC_RES:
            synthVoice.setFilterRes(constrain(0.7f + delta * 0.1f, 0.1f, 5.0f));
            break;
        case ENC_ATK:
            synthVoice.setAttack(constrain(10.0f + delta * 5.0f, 1.0f, 5000.0f));
            break;
        case ENC_REL:
            synthVoice.setRelease(constrain(200.0f + delta * 20.0f, 1.0f, 10000.0f));
            break;
        case ENC_DLY:
            fxEngine.adjustParam(0, delta * 0.01f);  // Delay time
            break;
        case ENC_GLT:
            fxEngine.adjustParam(1, delta * 0.01f);  // Glitch param
            break;
        case ENC_GRN:
            fxEngine.adjustParam(2, delta * 0.01f);  // Grain param
            break;
        case ENC_CRU:
            // Bitcrush amount
            fxEngine.adjustParam(0, delta * 0.01f);
            break;
    }
}

// ============================================
// BUTTON CALLBACK — All 19 buttons
// ============================================

void onButtonEvent(int buttonID, bool pressed) {
    DEBUG_PRINTF("Button %d: %s\n", buttonID, pressed ? "DOWN" : "UP");

    // SHIFT is a held state, not a toggle
    if (buttonID == BTN_SHIFT) {
        state.shiftPressed = pressed;
        return;
    }

    // Only act on press (not release) for most buttons
    if (!pressed) return;

    switch (buttonID) {
        case BTN_MODE:  onModePressed();  break;
        case BTN_REC:   onRecPressed();   break;
        case BTN_PLAY:  onPlayPressed();  break;
        case BTN_STOP:  onStopPressed();  break;

        case BTN_PIC:
            // Navigate LCD screen: Picture/Mixer
            lcdDisplay.setScreen(LCD_MIXER);
            break;
        case BTN_SND:
            lcdDisplay.setScreen(LCD_SYNTH);
            break;
        case BTN_INT:
            lcdDisplay.setScreen(LCD_FX);
            break;
        case BTN_JRN:
            // Journal: toggle recording
            onRecPressed();
            break;
        case BTN_MENU:
            lcdDisplay.setScreen(LCD_SETTINGS);
            break;
        case BTN_BACK:
            lcdDisplay.setScreen(LCD_MAIN);
            break;
        case BTN_PAGE:
            // Cycle through screens
            lcdDisplay.setScreen((LCDScreen)((lcdDisplay.getScreen() + 1) % LCD_COUNT));
            break;

        case BTN_DUB:
            state.mode = MODE_DUB;
            lcdDisplay.showMessage("DUB MODE");
            break;
        case BTN_FILL:
            sequencer.setFillMode(!sequencer.isFillMode());
            lcdDisplay.showMessage(sequencer.isFillMode() ? "FILL ON" : "FILL OFF");
            break;
        case BTN_CLR:
            if (state.shiftPressed) {
                sequencer.clearPattern();
                lcdDisplay.showMessage("CLEARED");
            } else {
                // Clear current step
                int sel = sequencer.getSelectedTrack();
                int step = sequencer.getCurrentStep();
                sequencer.setStep(sel, step, false);
            }
            break;
        case BTN_SCN:
            state.mode = MODE_SCENE;
            lcdDisplay.setScreen(LCD_SCENE);
            lcdDisplay.showMessage("SCENE");
            break;
        case BTN_BANK:
            if (state.shiftPressed) {
                samplingEngine.saveBank(samplingEngine.getCurrentBank());
                lcdDisplay.showMessage("BANK SAVED");
            } else {
                int nextBank = (samplingEngine.getCurrentBank() + 1) % 8;
                samplingEngine.loadBank(nextBank);
                lcdDisplay.showMessage("BANK");
            }
            break;
        case BTN_PREV:
            if (state.mode == MODE_PATTERN) {
                int pat = sequencer.getCurrentPattern();
                if (pat > 0) {
                    sequencer.loadPattern(pat - 1);
                    state.currentPattern = pat - 1;
                }
            } else {
                // Navigate tracks
                int t = sequencer.getSelectedTrack();
                if (t > 0) sequencer.selectTrack(t - 1);
            }
            break;
        case BTN_NEXT:
            if (state.mode == MODE_PATTERN) {
                int pat = sequencer.getCurrentPattern();
                if (pat < MAX_PATTERNS - 1) {
                    sequencer.loadPattern(pat + 1);
                    state.currentPattern = pat + 1;
                }
            } else {
                int t = sequencer.getSelectedTrack();
                if (t < MAX_TRACKS - 1) sequencer.selectTrack(t + 1);
            }
            break;
    }
}

// ============================================
// FADER CALLBACK
// ============================================

void onFaderChange(int faderID, float value) {
    DEBUG_PRINTF("Fader %d: %.2f\n", faderID, value);

    switch (faderID) {
        case FADER_MIC:
            inputMixer.gain(0, value);
            inputMixer.gain(1, value);
            break;
        case FADER_SMP:
            masterMix.gain(0, value);
            break;
        case FADER_SYN:
            masterMix.gain(1, value);
            break;
        case FADER_RAD:
            // Radio input level (future: via ESP32 streaming)
            masterMix.gain(2, value);
            break;
        case FADER_XFADE:
            // Crossfader: 0=full A (samples), 1=full B (synth+input)
            masterMix.gain(0, 1.0f - value);  // Samples fade out
            masterMix.gain(1, value);           // Synth fades in
            break;
    }
}

// ============================================
// JOYSTICK CALLBACK
// ============================================

void onJoystickChange(uint8_t directions) {
    if (directions & JOY_UP) {
        mapDisplay.zoomIn();
    }
    if (directions & JOY_DOWN) {
        mapDisplay.zoomOut();
    }
    if (directions & JOY_LEFT) {
        // Navigate pattern left
        int step = sequencer.getCurrentStep();
        if (step > 0) sequencer.setPosition(step - 1);
    }
    if (directions & JOY_RIGHT) {
        int step = sequencer.getCurrentStep();
        sequencer.setPosition(step + 1);
    }
    if (directions & JOY_CENTER) {
        // Toggle between LCD screens
        lcdDisplay.setScreen((LCDScreen)((lcdDisplay.getScreen() + 1) % LCD_COUNT));
    }
}

// ============================================
// TOUCH PAD CALLBACK
// ============================================

void onTouchEvent(int pad, bool pressed) {
    if (pressed) {
        DEBUG_PRINTF("Pad %d pressed\n", pad);

        switch (state.mode) {
            case MODE_LIVE:
                if (state.shiftPressed) {
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
                    lcdDisplay.showMessage("SAVED");
                } else if (pad < MAX_SCENES) {
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
                        lcdDisplay.showMessage("RECALL");
                    }
                }
                break;

            case MODE_DUB:
                samplingEngine.trigger(pad);
                if (state.isPlaying) {
                    int step = sequencer.getCurrentStep();
                    sequencer.setStep(pad, step, true);
                    DEBUG_PRINTF("DUB: recorded pad %d at step %d\n", pad, step);
                }
                break;

            case MODE_AI_COMPOSE:
                break;
        }

        ledRing.setPixelColor(pad, ledRing.Color(0, 100, 255));
        ledRing.show();
    } else {
        // Release
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
}

// ============================================
// MODE / TRANSPORT
// ============================================

void onModePressed() {
    state.mode = (SystemMode)((state.mode + 1) % MODE_COUNT);
    const char* modeNames[] = {"LIVE", "PATTERN", "SCENE", "DUB", "AI"};
    lcdDisplay.showMessage(modeNames[state.mode]);

    switch (state.mode) {
        case MODE_LIVE:       lcdDisplay.setScreen(LCD_MAIN);    break;
        case MODE_PATTERN:    lcdDisplay.setScreen(LCD_PATTERN); break;
        case MODE_SCENE:      lcdDisplay.setScreen(LCD_SCENE);   break;
        case MODE_DUB:        lcdDisplay.setScreen(LCD_MAIN);    break;
        case MODE_AI_COMPOSE: lcdDisplay.setScreen(LCD_SETTINGS); break;
        default: break;
    }
}

void onPlayPressed() {
    state.isPlaying = !state.isPlaying;
    if (state.isPlaying) {
        sequencer.start();
        lcdDisplay.showMessage("PLAY");
    } else {
        sequencer.stop();
        lcdDisplay.showMessage("STOP");
    }
}

void onStopPressed() {
    state.isPlaying = false;
    sequencer.stop();
    sequencer.reset();
    samplingEngine.stopAll();
    lcdDisplay.showMessage("STOP");
}

void onRecPressed() {
    state.isRecording = !state.isRecording;
    if (state.isRecording) {
        char filename[64];
        int recNum = 0;
        do {
            snprintf(filename, sizeof(filename), "/recordings/rec_%04d.wav", recNum++);
        } while (SD.exists(filename) && recNum < 9999);

        audioRecorder.startRecording(filename);

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
        lcdDisplay.showMessage("REC");
    } else {
        audioRecorder.stopRecording();
        lcdDisplay.showMessage("STOP REC");
    }
}

// ============================================
// AUDIO UPDATE
// ============================================

void updateAudio() {
    samplingEngine.update();
    fxEngine.update();
    outputMixer.gain(0, state.masterVolume);
}

// ============================================
// DISPLAY UPDATE
// ============================================

void updateDisplay() {
    lcdDisplay.update(state, sequencer, fxEngine, samplingEngine,
                      synthVoice, sceneManager, inputManager);
}

// ============================================
// LED UPDATE
// ============================================

void updateLEDs() {
    // GPS status LED
    digitalWrite(LED_GPS, state.gps.valid ? HIGH : LOW);

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
        for (int i = 0; i < 8; i++) {
            if (i < MAX_SCENES && sceneManager.isSceneSaved(i)) {
                ledRing.setPixelColor(i,
                    i == state.currentScene ?
                    ledRing.Color(0, 255, 0) : ledRing.Color(0, 40, 0));
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
    if (deserializeJson(doc, message)) return;

    const char* type = doc["type"];
    if (!type) return;

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
