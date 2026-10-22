/**
 * Oh My Ondas - Main Firmware v0.4.0
 * Teensy 4.1 + Audio Shield
 *
 * v1 breadboard hardware (web/prototype.html): 7 encoders on 2 Quad boards,
 * 4 buttons on one MCP23017, ANO nav wheel (0x4B), 2.8" LCD on SPI1, map OLED,
 * 5 faders, 8 touch pads, GPS, all UI I2C on Wire2; ESP32-S2 on Serial7
 */

#include <Audio.h>
#include <Wire.h>
#include <SPI.h>
#include <SD.h>
#include <SerialFlash.h>
#include <Adafruit_GPS.h>
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
#include "radio.h"
#include "midi_io.h"
#include "audio_sense.h"
#include "feature_extractor.h"
#include "play_capture.h"
#include "capture_store.h"
#include "continuous_mapper.h"
#include "plan_renderer.h"
#include "esp_link.h"
#include "motion_sensors.h"

// ============================================
// AUDIO OBJECTS
// ============================================

AudioInputI2S            audioInput;
AudioAnalyzeFFT1024      fft;
AudioAnalyzePeak         peakL, peakR;

// Layer 1 sensing on the raw inputs (not the output mix)
AudioAnalyzeFFT1024      fftIn;          // LINE-IN L: mic or piezo
AudioSense               senseL;         // LINE-IN L tap: onsets, speech, pitch, captures
AudioSense               senseR;         // LINE-IN R tap: radio

// Captures played from memory (PSRAM): voice -> low-pass -> capMix -> sampleSum ch 2
AudioPlayCapture         capVoice[CAPTURE_VOICES];
AudioFilterStateVariable capFilter[CAPTURE_VOICES];
AudioMixer4              capMix;

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

AudioControlSGTL5000 audioShield;
Adafruit_GPS gps(&UI_WIRE);
bool gpsReady = false;

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
Radio          radio;
MidiIO         midiIO;
FeatureExtractor features;
CaptureStore   captureStore;
ContinuousMapper mapper;
PlanRenderer   renderer;
EspLink        espLink;
MotionSensors  motionSensors;
bool           gesturesOn = false;   // off by default; nav up on the SENSE screen

// ============================================
// FORWARD DECLARATIONS
// ============================================

void updateAudio();
void updateDisplay();
void updateGPS();
uint32_t unixTime(int year, int month, int day, int h, int m, int s);

// Input callbacks
void onEncoderChange(int encoderID, int delta);
void onButtonEvent(int buttonID, bool pressed);
void onFaderChange(int faderID, float value);
void onJoystickChange(uint8_t directions);
void onTouchEvent(int pad, bool pressed);

// Actions
void onModePressed();
void onRecPressed();
void onCapturePressed();
void onCaptureEvicted(uint8_t id);
void onSequencerStep(int step);
void autoCapture();
void handleMotion();
const Capture* captureByRecency(int n);
void onPlayPressed();
void onStopPressed();

void onSequencerTrigger(int track, int step, const Step& stepData);
void onMidiTransport(MidiTransport cmd);
void onMidiPosition(uint16_t sixteenths);
void onMidiTempo(float bpm);
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

    // UI I2C bus (Wire2): CAP1188, OLED, ADS1115, MCP23017, Quads, GPS, radio.
    // Wire (18/19) stays with the Audio Shield.
    UI_WIRE.begin();
    UI_WIRE.setClock(UI_I2C_CLOCK);
    UI_WIRE.setTimeout(1000);  // 1ms I2C timeout — prevents bus hangs

    // IMU + barometer on Wire2: each optional, absent parts are skipped
    motionSensors.begin();

    // Si4732 radio on Wire2: if it does not answer, RST stays low and the
    // rest runs normally (RAD screen shows "radio not fitted")
    pinMode(RADIO_RST_PIN, OUTPUT);
    radio.begin();

    // GPS (PA1010D on Wire2)
    gpsReady = gps.begin(ADDR_GPS);
    if (gpsReady) {
        gps.sendCommand(PMTK_SET_NMEA_OUTPUT_RMCGGA);
        gps.sendCommand(PMTK_SET_NMEA_UPDATE_1HZ);
    }
    Serial.println(gpsReady ? "GPS OK" : "GPS not found");

    // Audio codec
    audioShield.enable();
    audioShield.volume(0.7);
    audioShield.inputSelect(AUDIO_INPUT_LINEIN);
    audioShield.lineInLevel(LINEIN_LEVEL_LEFT, LINEIN_LEVEL_RIGHT);   // per channel, see config.h
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
    sampleSum.gain(2, 1.0);   // capture voices

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
    inputMixer.gain(0, 0.5);   // LINE-IN L: mic / piezo (MIC fader)
    inputMixer.gain(1, 0.5);   // LINE-IN R: Si4732 radio (RAD fader)

    // Master mix
    masterMix.gain(0, 0.8);
    masterMix.gain(1, 0.5);
    masterMix.gain(2, 0.6);    // input sum; per-source levels are set in inputMixer

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
    samplingEngine.attachCaptureVoices(capVoice, capFilter, &capMix);
    sequencer.begin(state.bpm);
    sequencer.setTriggerCallback(onSequencerTrigger);
    fxEngine.begin(&reverb, &delayL, &crusher, &granular, &chorus,
                   filter, &fxReturn, &fxReturn2, &fxSend);
    synthVoice.begin(&synthWave1, &synthWave2, &synthNoise,
                     &synthMixer, &synthFilter, &synthEnv);
    sceneManager.begin();
    audioRecorder.begin(&recorder);

    // Input manager (Quads, ANO nav, MCP23017, ADS1115, fader 5, touch)
    inputManager.begin();
    inputManager.setEncoderCallback(onEncoderChange);
    inputManager.setButtonCallback(onButtonEvent);
    inputManager.setFaderCallback(onFaderChange);
    inputManager.setJoystickCallback(onJoystickChange);
    inputManager.setTouchCallback(onTouchEvent);

    // Layer 1 features from the inputs
    features.begin(&senseL, &senseR, &fftIn);

    // Captures: PSRAM pool, or a small RAM pool without PSRAM
    captureStore.begin();
    captureStore.setEvictCallback(onCaptureEvicted);

    // Continuous mapping (features -> parameters) and the capture renderer
    mapper.begin(&features, &sequencer, &synthVoice, &fxEngine, &radio, &midiIO, &state);
    mapper.userSet(MT_FILTER, 8000.0f);   // synth cutoff set above
    mapper.setMotion(&motionSensors);
    mapper.setLink(&espLink);
    renderer.begin(&captureStore, &samplingEngine, &mapper, &sequencer, &state, &midiIO);
    sequencer.setStepCallback(onSequencerStep);

    // USB MIDI: clock in sets the tempo, Start/Stop the transport
    midiIO.begin();
    midiIO.setTransportCallback(onMidiTransport);
    midiIO.setTempoCallback(onMidiTempo);
    midiIO.setPositionCallback(onMidiPosition);

    // Displays
    lcdDisplay.begin();
    lcdDisplay.setRadio(&radio);
    lcdDisplay.setSense(&features, &captureStore, &espLink, &renderer, &mapper, &midiIO);
    lcdDisplay.setMotion(&motionSensors, &gesturesOn);
    mapDisplay.begin();

    // ESP32-S2 link (Serial7: RX 28, TX 29, framed binary, common/link_protocol.h)
    espLink.begin(&features, &captureStore, &renderer, &sequencer, &radio,
                  &inputManager, &state, &senseL, &senseR);
    espLink.setMotion(&motionSensors);

    // Which Wire2 addresses answer (after every driver's begin, so the radio
    // is out of reset and the AK8963 is behind the MPU9250 bypass)
    static char i2cScan[64];
    int n = snprintf(i2cScan, sizeof(i2cScan), "I2C2");
    for (uint8_t a = 0x08; a < 0x78 && n < (int)sizeof(i2cScan) - 4; a++) {
        UI_WIRE.beginTransmission(a);
        if (UI_WIRE.endTransmission() == 0) n += snprintf(i2cScan + n, sizeof(i2cScan) - n, " %02X", a);
    }
    lcdDisplay.setI2CScan(i2cScan);
    Serial.println(i2cScan);

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
    midiIO.update();
    features.update();
    motionSensors.update();
    handleMotion();
    captureStore.update();
    mapper.update();
    renderer.update();
    autoCapture();
    updateAudio();
    audioRecorder.update();
    updateGPS();
    radio.update();

    // Display updates (every 50ms)
    static unsigned long lastDisplay = 0;
    if (millis() - lastDisplay >= 50) {
        updateDisplay();
        lastDisplay = millis();
    }

    // ESP32 link: non-blocking, every loop
    espLink.update();

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
// ENCODER CALLBACK — 7 encoders on the Quad boards
// ============================================

void onEncoderChange(int encoderID, int delta) {
    DEBUG_PRINTF("Encoder %d: %+d (shift: %d)\n", encoderID, delta, state.shiftPressed);
    espLink.userEncoder(encoderID, delta);

    switch (encoderID) {
        // ── Quad #1 ──
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
                // The mapper modulates around the user's mix (only if a route targets it)
                fxEngine.setMix(constrain(mapper.getUserBase(MT_FX_MIX) + delta * 0.02f, 0.0f, 1.0f));
                mapper.userSet(MT_FX_MIX, fxEngine.getMix());
            }
            break;

        // ── Quad #2 ──
        case ENC_DECAY:
            if (lcdDisplay.getScreen() == LCD_RADIO) {
                // RAD screen: tune, SHIFT = seek in the turn direction
                if (state.shiftPressed) radio.seek(delta);
                else                    radio.tune(delta);
                break;
            }
            if (state.shiftPressed) {
                sequencer.adjustSwing(delta);
            } else {
                state.bpm = constrain(state.bpm + delta, 40.0f, 300.0f);
                sequencer.setTempo(state.bpm);
                mapper.userTouchedTempo();   // pulse follow waits, then resumes
            }
            break;

        case ENC_CUT:
            if (state.shiftPressed) {
                synthVoice.setFilterRes(constrain(0.7f + delta * 0.1f, 0.1f, 5.0f));
            } else {
                // Cutoff in 1/12-octave steps around the user's base; the mapper modulates around it
                float f = constrain(mapper.getUserBase(MT_FILTER) * powf(2.0f, delta / 12.0f), 200.0f, 12000.0f);
                mapper.userSet(MT_FILTER, f);
                synthVoice.setFilterFreq(f);
            }
            break;
        case ENC_ATK:
            if (state.shiftPressed) {
                synthVoice.setRelease(constrain(200.0f + delta * 20.0f, 1.0f, 10000.0f));
            } else {
                synthVoice.setAttack(constrain(10.0f + delta * 5.0f, 1.0f, 5000.0f));
            }
            break;

        // ── ANO nav wheel: scrolls what the screen shows ──
        case ENC_NAV_WHEEL:
            if (lcdDisplay.getScreen() == LCD_RADIO) {
                radio.tune(delta);                       // fine tune, one step per click
            } else if (lcdDisplay.getScreen() == LCD_PATTERN) {
                int t = constrain(sequencer.getSelectedTrack() + delta, 0, MAX_TRACKS - 1);
                sequencer.selectTrack(t);
            } else {
                // Scroll through the screens
                int s = ((int)lcdDisplay.getScreen() + (delta > 0 ? 1 : -1) + LCD_COUNT) % LCD_COUNT;
                lcdDisplay.setScreen((LCDScreen)s);
            }
            break;
    }
}

// ============================================
// BUTTON CALLBACK — 4 buttons + encoder pushes (see config.h ButtonID)
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
        case BTN_MODE:
            if (state.shiftPressed) {          // SHIFT + MODE: walk starts here (height, steps)
                motionSensors.resetWalk();
                lcdDisplay.showMessage("WALK START");
            } else {
                onModePressed();
            }
            break;
        case BTN_REC:
            if (state.shiftPressed) onCapturePressed();   // SHIFT + REC: capture to memory
            else                    onRecPressed();       // REC: output recording to SD
            break;
        case BTN_PLAY:
            if (state.shiftPressed) {          // SHIFT + PLAY: compass calibration
                if (motionSensors.compassPresent()) {
                    motionSensors.startCompassCal();
                    lcdDisplay.showMessage("TURN ALL WAYS", MAG_CAL_MS);
                } else {
                    lcdDisplay.showMessage("NO COMPASS");
                }
            } else {
                onPlayPressed();
            }
            break;
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
    midiIO.sendFader(faderID, value);
    espLink.userFader(faderID, value);

    switch (faderID) {
        case FADER_MIC:
            inputMixer.gain(0, value);   // LINE-IN L: mic / piezo
            break;
        case FADER_SMP:
            masterMix.gain(0, value);
            break;
        case FADER_SYN:
            masterMix.gain(1, value);
            break;
        case FADER_RAD:
            inputMixer.gain(1, value);   // LINE-IN R: Si4732 radio
            break;
        case FADER_OUT:
            // Fader 5: master output level (ENC_VOL nudges the same value)
            state.masterVolume = value;
            break;
    }
}

// ============================================
// JOYSTICK CALLBACK
// ============================================

void onJoystickChange(uint8_t directions) {
    // SHIFT + nav stands in for the v0.3 PREV / NEXT / BACK buttons
    if (state.shiftPressed) {
        if (directions & JOY_UP) {
            // The MIC/PIEZO toggle is a hardware switch the firmware cannot read: say which
            // The 4-way source switch is not readable: say which position it is in
            uint8_t src = nextLeftSource(features.getLeftSource());
            features.setLeftSource(src);
            char msg[24];
            snprintf(msg, sizeof(msg), "IN L: %s", sourceName(src));
            lcdDisplay.showMessage(msg);
        }
        if (directions & JOY_DOWN) {
            // Tempo follow: off -> sensed pulse -> walking cadence -> off
            FollowMode m = (FollowMode)((mapper.getFollow() + 1) % 3);
            mapper.setFollow(m);
            static const char* names[3] = {"FIXED TEMPO", "FOLLOW PULSE", "FOLLOW WALK"};
            lcdDisplay.showMessage(names[m]);
        }
        if (lcdDisplay.getScreen() == LCD_RADIO && (directions & (JOY_LEFT | JOY_RIGHT))) {
            // SHIFT + nav L/R on the RAD screen: tune one step (the wheel's job without the ANO)
            radio.tune((directions & JOY_RIGHT) ? 1 : -1);
            return;
        }
        if (directions & JOY_LEFT)   onButtonEvent(BTN_PREV, true);
        if (directions & JOY_RIGHT)  onButtonEvent(BTN_NEXT, true);
        if (directions & JOY_CENTER) onButtonEvent(BTN_BACK, true);
        return;
    }
    if ((directions & JOY_UP) && lcdDisplay.getScreen() == LCD_SENSE) {
        // SENSE screen: nav up switches the gestures on / off
        gesturesOn = !gesturesOn;
        lcdDisplay.showMessage(gesturesOn ? "GESTURES ON" : "GESTURES OFF");
        directions &= ~JOY_UP;
    }
    if (directions & JOY_UP) {
        mapDisplay.zoomIn();
    }
    if (directions & JOY_DOWN) {
        mapDisplay.zoomOut();
    }
    if (lcdDisplay.getScreen() == LCD_RADIO && (directions & (JOY_LEFT | JOY_RIGHT))) {
        radio.nextBand((directions & JOY_RIGHT) ? 1 : -1);
        directions &= ~(JOY_LEFT | JOY_RIGHT);  // not also a pattern step
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
    midiIO.sendPad(pad, pressed, 0.8f);
    if (pressed) espLink.userPad(pad);
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

            case MODE_AI_COMPOSE: {
                // Audition: pad 0 = newest capture, pad 1 the one before, ...
                const Capture* c = captureByRecency(pad);
                if (c) {
                    samplingEngine.playCapture(CAPVOICE_PREVIEW, c->id, captureStore.samples(*c),
                                               0, c->length, 1.0f, 1.0f);
                }
                break;
            }
            default:
                break;
        }
    } else {
        // Release
        if (state.mode == MODE_LIVE) {
            if (state.shiftPressed) {
                synthVoice.noteOff();
            } else if (!samplingEngine.isLooping(pad)) {
                samplingEngine.stop(pad);
            }
        }
    }
}

// ============================================
// MODE / TRANSPORT
// ============================================

void onModePressed() {
    state.mode = (SystemMode)((state.mode + 1) % MODE_COUNT);
    espLink.userChanged();
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

// External MIDI: Start = from step 1, Continue = from here, Stop = stop (no reset)
void onMidiTransport(MidiTransport cmd) {
    if (cmd == MIDI_T_START) {
        sequencer.reset();
        if (!state.isPlaying) onPlayPressed();
    } else if (cmd == MIDI_T_CONTINUE) {
        if (!state.isPlaying) {
            state.isPlaying = true;
            sequencer.resume();
            lcdDisplay.showMessage("PLAY");
        }
    } else if (state.isPlaying) {
        state.isPlaying = false;
        sequencer.pause();   // keeps the position for Continue / Song Position
        lcdDisplay.showMessage("STOP");
    }
}

void onMidiPosition(uint16_t sixteenths) {
    sequencer.setPosition(sixteenths % sequencer.getPatternLength());
}

void onMidiTempo(float bpm) {
    if (fabsf(bpm - state.bpm) < 0.3f) return;
    state.bpm = bpm;
    sequencer.setTempo(bpm);
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
// CAPTURES
// ============================================

// SHIFT + REC: start a capture (press again to stop early). On the RAD
// screen it captures the radio, elsewhere LINE-IN L (mic or piezo).
void onCapturePressed() {
    if (captureStore.isRecording()) {
        captureStore.stopCapture();
        return;
    }
    if (!captureStore.isReady()) {
        lcdDisplay.showMessage("NO CAPTURE MEM");
        return;
    }
    bool radioSrc = lcdDisplay.getScreen() == LCD_RADIO;
    uint8_t src = radioSrc ? RIGHT_SRC_RADIO : features.getLeftSource();
    if (captureStore.startCapture(radioSrc ? &senseR : &senseL, src)) {
        char msg[24];
        snprintf(msg, sizeof(msg), "CAPTURE %s", sourceName(src));
        lcdDisplay.showMessage(msg);
    }
}

// Motion: gesture actions (each switchable in config.h, all behind
// gesturesOn) and the end of a compass calibration
void handleMotion() {
    static uint32_t lastFrame = 0;
    static bool wasCal = false;
    if (wasCal && !motionSensors.isCalibrating()) {
        lcdDisplay.showMessage(motionSensors.compassCalibrated() ? "COMPASS OK" : "COMPASS: TRY AGAIN");
    }
    wasCal = motionSensors.isCalibrating();
    if (motionSensors.frameCount() == lastFrame) return;
    lastFrame = motionSensors.frameCount();
    uint8_t g = motionSensors.motion().gesture;
    if (!gesturesOn || g == GEST_NONE) return;
    switch (g) {
        case GEST_SHAKE:
#if GESTURE_SHAKE_CAPTURE
            if (!captureStore.isRecording() &&
                captureStore.startCapture(&senseL, features.getLeftSource())) {
                lcdDisplay.showMessage("SHAKE: CAPTURE");
            }
#endif
            break;
        case GEST_TILT_LEFT:
        case GEST_TILT_RIGHT:
#if GESTURE_TILT_MELODY
            renderer.selectMelodyCapture(g == GEST_TILT_RIGHT ? 1 : -1);
            {
                char msg[24];
                snprintf(msg, sizeof(msg), "MELODY c%02u", renderer.melodyOverride());
                lcdDisplay.showMessage(msg);
            }
#endif
            break;
        case GEST_FLIP:
#if GESTURE_FLIP_MUTE
            renderer.setLayersMuted(motionSensors.motion().faceDown);
            lcdDisplay.showMessage(renderer.layersMuted() ? "LAYERS MUTED" : "LAYERS ON");
#endif
            break;
    }
}

// Sequencer step tick (every step while playing): the capture renderer
void onSequencerStep(int step) {
    renderer.onStep(step);
}

// While playing, take a capture now and then so the music keeps being made
// of the place. Captures stay on the device, but automatic ones still never
// keep speech: not started while speech is present, and cancelled if speech
// shows up while recording. (A capture the user asks for with SHIFT+REC is
// kept.) Alternates LINE-IN L and the radio when the radio is fitted.
void autoCapture() {
#if CAPTURE_AUTO_MS > 0
    static unsigned long last = 0;
    static bool radioTurn = false;
    static bool autoLeft = false;    // an automatic mic/piezo capture is recording
    unsigned long now = millis();
    if (captureStore.isRecording()) {
        if (autoLeft && sourceCarriesSpeech(captureStore.recordingSource()) && features.speechPresent()) {
            captureStore.cancelCapture();
            autoLeft = false;
        }
        return;
    }
    autoLeft = false;
    if (!state.isPlaying || !captureStore.isReady()) return;
    if (now - last < CAPTURE_AUTO_MS && captureStore.count() > 0) return;
    if (now - last < 5000) return;   // first ones: not more often than every 5 s
    bool useRadio = radioTurn && radio.isFitted();
    radioTurn = !radioTurn;
    if (useRadio) {
        if (features.radioFrame().rmsDb < -45.0f) return;
        last = now;
        captureStore.startCapture(&senseR, RIGHT_SRC_RADIO);
    } else {
        const FeatureFrame& f = features.frame();
        if (f.rmsDb < -45.0f) return;
        if (sourceCarriesSpeech(f.source) && (!features.isReady() || features.speechPresent())) return;
        last = now;
        autoLeft = captureStore.startCapture(&senseL, f.source);
    }
#endif
}

// A capture's memory is about to be reused: stop anything playing it
void onCaptureEvicted(uint8_t id) {
    samplingEngine.stopCaptureTag(id);
}

const Capture* captureByRecency(int n) {
    const Capture* order[CAPTURE_MAX];
    int count = 0;
    for (int i = 0; i < CAPTURE_MAX; i++) if (captureStore.at(i)) order[count++] = captureStore.at(i);
    if (n < 0 || n >= count) return nullptr;
    // n-th largest seq
    for (int k = 0; k <= n; k++) {
        for (int j = k + 1; j < count; j++) {
            if (order[j]->seq > order[k]->seq) { const Capture* t = order[k]; order[k] = order[j]; order[j] = t; }
        }
    }
    return order[n];
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
// GPS (PA1010D on Wire2)
// ============================================

void updateGPS() {
    if (!gpsReady) return;
    static unsigned long lastPoll = 0;   // NMEA is ~150 B/s: 32 B every 50 ms is plenty
    if (millis() - lastPoll < 50) return;
    lastPoll = millis();
    for (int i = 0; i < 32; i++) gps.read();  // drain the I2C buffer a little each loop
    if (!gps.newNMEAreceived() || !gps.parse(gps.lastNMEA())) return;
    if (gps.fix) {
        state.gps.lat = gps.latitudeDegrees;
        state.gps.lon = gps.longitudeDegrees;
        state.gps.valid = true;
        state.gps.lastUpdate = millis();
        state.gps.altM = gps.altitude;
        state.gps.speedKnots = gps.speed;
        state.gps.headingDeg = gps.angle;
    }
    state.gps.fixQuality = gps.fix ? max((uint8_t)1, (uint8_t)gps.fixquality) : 0;
    state.gps.sats = gps.satellites;
    if (gps.year > 0 && gps.month > 0) {
        state.gps.utc = unixTime(2000 + gps.year, gps.month, gps.day, gps.hour, gps.minute, gps.seconds);
    }
}

// Days-from-civil (proleptic Gregorian), UTC
uint32_t unixTime(int y, int mo, int d, int h, int mi, int s) {
    y -= mo <= 2;
    int era = y / 400;
    int yoe = y - era * 400;
    int doy = (153 * (mo + (mo > 2 ? -3 : 9)) + 2) / 5 + d - 1;
    int doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    int32_t days = era * 146097 + doe - 719468;
    return (uint32_t)days * 86400UL + h * 3600UL + mi * 60UL + s;
}
