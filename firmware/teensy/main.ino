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
#include "sd_guard.h"
#include "app.h"   // what controls.cpp shares with this file

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

void onSequencerTrigger(int track, int step, const Step& stepData);
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
    // No setTimeout(): that is the Stream read timeout (ms), not an I2C one.
    // Teensy 4 Wire times out stuck transfers itself (16-50 ms); a bus held
    // low is cleared by InputManager (see UI_PROBE_MS).

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
        if (!sdExists(dir)) {
            sdMkdir(dir);
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
        SdWriter gpsFile("/gps_log.csv");   // guarded: SD WAV players read the card in the audio interrupt
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
    // A fix older than GPS_FIX_TIMEOUT_MS is no fix: sky lost or GPS silent
    if (state.gps.valid && millis() - state.gps.lastUpdate >= GPS_FIX_TIMEOUT_MS) state.gps.valid = false;
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
    } else {
        state.gps.valid = false;   // the GPS itself says no fix
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
