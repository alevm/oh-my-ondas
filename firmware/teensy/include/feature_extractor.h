/**
 * Oh My Ondas - Layer 1 feature extraction (continuous, no categories)
 *
 * Left input (LINE-IN L) is one of mic, piezo, EM coil or solar cell
 * (light), chosen by a 4-position rotary switch the firmware cannot read:
 * the user tells it with SHIFT + nav up (setLeftSource cycles them). All
 * four get the same analysis. Right input (LINE-IN R) is the radio.
 *
 * Left, every FEAT_PERIOD_MS (10 Hz), from the FFT1024 on LINE-IN L and
 * its AudioSense tap:
 *   32 log-spaced bands (40 Hz-16 kHz, dBFS), RMS, spectral centroid,
 *   flatness, 12-bin chroma, pitch + confidence (YIN-lite, 60-1000 Hz),
 *   onsets (spectral flux on 3 bands at 86 Hz, adaptive threshold, each
 *   with a timestamp), pulse (onset autocorrelation over ~6 s, 60-180 BPM,
 *   recomputed every second), speech likelihood (300-3400 Hz energy share
 *   plus 3-8 Hz syllabic modulation of that band's envelope).
 * Right (radio), cheaper, no FFT: RMS, onsets, speech/music estimate.
 */

#ifndef FEATURE_EXTRACTOR_H
#define FEATURE_EXTRACTOR_H

#include <Arduino.h>
#include <Audio.h>
#include "config.h"
#include "audio_sense.h"

#define FEAT_PERIOD_MS      100    // 10 Hz frames
#define FEAT_NUM_BANDS      32
#define FEAT_BAND_LO_HZ     40.0f
#define FEAT_BAND_HI_HZ     16000.0f
#define ONSET_FRAME_BLOCKS  4      // flux frame = 4 blocks = 11.6 ms (86 Hz)
#define ONSET_THRESH_K      2.0f   // threshold = mean + K * std of the flux
#define ONSET_FLOOR         0.15f  // minimum flux (sum of log10 energy rises)
#define ONSET_REFRACTORY_MS 60
#define PULSE_FRAMES        512    // ~5.9 s of flux frames
#define PULSE_MIN_BPM       60.0f
#define PULSE_MAX_BPM       180.0f
#define SPEECH_FRAMES       128    // ~1.5 s of flux frames
#define PITCH_DECIM         2      // YIN at 22.05 kHz
#define PITCH_WINDOW        512    // decimated samples
#define PITCH_MIN_HZ        60.0f
#define PITCH_MAX_HZ        1000.0f
#define ONSET_QUEUE_LEN     32
// Privacy gate (speechPresent): low on purpose, so it errs towards "speech".
// CALIBRATE ON HARDWARE with real voices, traffic, wind and music.
#define SPEECH_BLOCK        0.15f  // speech likelihood
#define SPEECH_MOD_BLOCK    0.60f  // or the 3-8 Hz modulation share alone
// FFT1024 (Hann window): a full-scale sine sums to ~0.375 in read()^2 over
// its main lobe (computed from the library's scaling, not measured):
// multiply band power by this so it reads ~0 dBFS
#define FFT_POWER_SCALE     (1.0f / 0.375f)

// Left-input source values match LinkSource (common/link_protocol.h)
#define LEFT_SRC_MIC    0
#define LEFT_SRC_PIEZO  1
#define RIGHT_SRC_RADIO 2
#define LEFT_SRC_COIL   3
#define LEFT_SRC_LIGHT  4

// Privacy: mic and piezo can carry speech (a contact mic hears voices
// through a table); the coil and the solar cell cannot carry it acoustically
static inline bool sourceCarriesSpeech(uint8_t src) {
    return src == LEFT_SRC_MIC || src == LEFT_SRC_PIEZO;
}
static inline const char* sourceName(uint8_t src) {
    static const char* N[5] = {"MIC", "PIEZO", "RADIO", "COIL", "LIGHT"};
    return src < 5 ? N[src] : "?";
}
static inline uint8_t nextLeftSource(uint8_t src) {   // MIC -> PIEZO -> COIL -> LIGHT -> MIC
    switch (src) {
        case LEFT_SRC_MIC:   return LEFT_SRC_PIEZO;
        case LEFT_SRC_PIEZO: return LEFT_SRC_COIL;
        case LEFT_SRC_COIL:  return LEFT_SRC_LIGHT;
        default:             return LEFT_SRC_MIC;
    }
}

struct FeatureFrame {
    uint32_t t_ms;
    float    bandsDb[FEAT_NUM_BANDS];  // dBFS, -128..0
    float    rms;                      // linear, full scale = 1
    float    rmsDb;
    float    centroidHz;
    float    flatness;                 // 0 tonal .. 1 noise
    float    chroma[12];               // 0..1, max = 1, C = 0
    float    pitchHz;                  // 0 = none
    float    pitchConf;                // 0..1
    uint8_t  onsets;                   // since previous frame
    float    onsetRate;                // per second, smoothed
    float    speech;                   // 0..1
    float    bpm, bpmConf;             // pulse
    uint16_t phaseMs;                  // time since the last beat
    uint8_t  source;                   // LEFT_SRC_*
};

struct RadioFeatures {
    float   rms, rmsDb;
    uint8_t onsets;                    // since previous frame
    float   onsetRate;
    float   speech;                    // 0 music .. 1 speech
};

struct OnsetEvent {
    uint32_t t_ms;
    uint8_t  source;                   // LinkSource
    uint8_t  strength;                 // 0..255
    uint8_t  band;                     // 0..31
};

// YIN-lite pitch on x[0 .. 2*window): returns Hz (0 = none), conf 0..1.
// d needs window floats. Shared by the live extractor and capture analysis.
float yinPitch(const float* x, int window, float fs, float minHz, float maxHz,
               float* d, float* confOut);

class FeatureExtractor {
public:
    FeatureExtractor();

    void begin(AudioSense* left, AudioSense* right, AudioAnalyzeFFT1024* fftLeft);
    void update();                     // every loop: onsets; a full frame every FEAT_PERIOD_MS

    uint32_t frameCount() const        { return frames; }  // bumps once per new frame
    const FeatureFrame&  frame() const { return feat; }
    const RadioFeatures& radioFrame() const { return radioFeat; }

    void    setLeftSource(uint8_t src) { leftSource = src; feat.source = src; }
    uint8_t getLeftSource() const      { return leftSource; }

    bool     popOnset(OnsetEvent& ev);  // queue for the ESP link
    uint32_t getFrameMicros() const    { return frameMicros; }   // last frame cost
    uint32_t getMaxFrameMicros() const { return frameMicrosMax; }
    uint32_t getLostBlocks() const     { return lostBlocks; }
    // Speech detector has a full window of fresh data (privacy gates refuse otherwise)
    bool     isReady() const           { return senseL && chL.spCount >= SPEECH_FRAMES && frames > 0; }
    float    speechModulation() const  { return chL.mod; }    // 3-8 Hz share of the speech-band envelope, gated by level
    bool     speechPresent() const     { return feat.speech > SPEECH_BLOCK || chL.mod > SPEECH_MOD_BLOCK; }

private:
    // Per-channel onset + speech state (fed from AudioSense blocks)
    struct Channel {
        AudioSense* sense;
        uint8_t  source;
        uint32_t nextBlock;
        uint8_t  blkInFrame;
        float    accBand[SENSE_NUM_BANDS], accE, accS;
        float    prevLog[SENSE_NUM_BANDS];
        float    flux[3];               // n-2, n-1, n for peak picking
        uint32_t fluxT[3];
        uint8_t  fluxDom[3];            // flux band that rose most
        float    fluxMean, fluxVar;
        uint32_t lastOnsetMs;
        uint8_t  onsetsSinceFrame;
        float    onsetRate;
        float    frameEnergySum; uint32_t frameEnergyN;
        // speech: envelope + energies over SPEECH_FRAMES
        float    spEnv[SPEECH_FRAMES], spE[SPEECH_FRAMES], totE[SPEECH_FRAMES];
        uint32_t spCount;
        float    speech;
        float    mod;                    // last syllabic modulation share (0 when too quiet)
    };

    AudioSense* senseL;
    AudioSense* senseR;
    AudioAnalyzeFFT1024* fft;
    Channel chL, chR;
    uint8_t leftSource;

    FeatureFrame  feat;
    RadioFeatures radioFeat;
    uint32_t frames;
    unsigned long lastFrame, lastPulse;
    uint32_t frameMicros, frameMicrosMax, lostBlocks;

    // FFT bin tables
    uint8_t bandOfBin[512];
    uint16_t bandLo[FEAT_NUM_BANDS], bandHi[FEAT_NUM_BANDS];
    uint8_t pcOfBin[512];

    // Pulse: flux envelope of the left channel (buffers malloc'd in begin: RAM2)
    float*   pulseEnv;              // PULSE_FRAMES
    uint32_t pulseCount;
    float*   pulseScratch;          // PULSE_FRAMES
    float    pulseBpm, pulseConf;
    unsigned long lastBeatMs;
    float    hann[SPEECH_FRAMES];

    // Pitch scratch (malloc'd in begin)
    int16_t* pitchRaw;              // PITCH_WINDOW * 2 * PITCH_DECIM
    float*   pitchBuf;              // PITCH_WINDOW * 2
    float*   yinD;                  // PITCH_WINDOW

    OnsetEvent onsetQ[ONSET_QUEUE_LEN];
    volatile uint8_t onsetHead, onsetTail;

    void initTables();
    void processChannel(Channel& ch);
    void pushFluxFrame(Channel& ch, uint32_t t_ms);
    void emitOnset(Channel& ch, uint32_t t_ms, float strength, uint8_t fluxBand);
    float speechLikelihood(Channel& ch) const;
    void computeSpectrum();
    void computePitch();
    void computePulse();
    uint8_t dominantBand() const;
};

#endif // FEATURE_EXTRACTOR_H
