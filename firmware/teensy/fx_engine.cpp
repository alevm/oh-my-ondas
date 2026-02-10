/**
 * Oh My Ondas - FX Engine Implementation
 * Send/return effects chain using real Teensy Audio Library objects
 */

#include "fx_engine.h"
#include <SD.h>
#include <ArduinoJson.h>

FXEngine::FXEngine()
    : currentEffect(FX_NONE)
    , reverbFX(nullptr)
    , delayFX(nullptr)
    , crusherFX(nullptr)
    , granularFX(nullptr)
    , chorusFX(nullptr)
    , filters(nullptr)
    , fxReturnMix(nullptr)
    , fxReturn2Mix(nullptr)
    , fxSendMix(nullptr)
    , lfoRate(1.0f)
    , lfoDepth(0.0f)
    , lfoTarget(-1)
    , lfoPhase(0.0f)
    , lastLFOUpdate(0)
{
    initializeDefaults();
}

void FXEngine::begin(AudioEffectFreeverb* reverb,
                     AudioEffectDelay* delay,
                     AudioEffectBitcrusher* crusher,
                     AudioEffectGranular* granular,
                     AudioEffectChorus* chorus,
                     AudioFilterStateVariable* trackFilters,
                     AudioMixer4* fxReturn,
                     AudioMixer4* fxReturn2,
                     AudioMixer4* fxSend) {
    reverbFX = reverb;
    delayFX = delay;
    crusherFX = crusher;
    granularFX = granular;
    chorusFX = chorus;
    filters = trackFilters;
    fxReturnMix = fxReturn;
    fxReturn2Mix = fxReturn2;
    fxSendMix = fxSend;

    DEBUG_PRINTLN("FXEngine: Initializing...");
    initializeDefaults();
    muteAllReturns();
    DEBUG_PRINTLN("FXEngine: Ready");
}

void FXEngine::update() {
    updateLFO();
    applyEffect();
}

void FXEngine::initializeDefaults() {
    currentParams.param1 = 0.5f;
    currentParams.param2 = 0.5f;
    currentParams.param3 = 0.0f;
    currentParams.mix = 0.0f;
    currentParams.enabled = false;

    for (int i = 0; i < MAX_TRACKS; i++) {
        trackEffects[i] = FX_NONE;
        trackParams[i].param1 = 0.5f;
        trackParams[i].param2 = 0.5f;
        trackParams[i].param3 = 0.0f;
        trackParams[i].mix = 0.0f;
        trackParams[i].enabled = false;
    }
}

void FXEngine::muteAllReturns() {
    if (!fxReturnMix) return;
    for (int i = 0; i < 4; i++) {
        fxReturnMix->gain(i, 0.0);
    }
    if (fxReturn2Mix) {
        for (int i = 0; i < 4; i++) {
            fxReturn2Mix->gain(i, 0.0);
        }
    }
}

void FXEngine::applyEffect() {
    if (!fxReturnMix) return;

    float mix = currentParams.mix;

    // First mute all return channels
    muteAllReturns();

    // Then enable only the active effect's return channel
    switch (currentEffect) {
        case FX_REVERB:
            if (reverbFX) {
                reverbFX->roomsize(currentParams.param1);
                reverbFX->damping(currentParams.param2);
                fxReturnMix->gain(0, mix);  // ch0 = reverb
            }
            break;

        case FX_DELAY:
            if (delayFX) {
                // param1 = delay time (50-1000ms), param2 = feedback
                int delayMs = (int)(currentParams.param1 * DELAY_MAX_MS);
                if (delayMs < 50) delayMs = 50;
                delayFX->delay(0, delayMs);
                // Feedback via fxSend mixer ch1
                if (fxSendMix) {
                    fxSendMix->gain(1, currentParams.param2 * 0.8f);
                }
                fxReturnMix->gain(1, mix);  // ch1 = delay
            }
            break;

        case FX_BITCRUSH:
            if (crusherFX) {
                // param1 = bits (4-16), param2 = sample rate reduction
                int bits = 4 + (int)(currentParams.param1 * 12);
                int sr = 4000 + (int)(currentParams.param2 * 40000);
                crusherFX->bits(bits);
                crusherFX->sampleRate(sr);
                fxReturnMix->gain(2, mix);  // ch2 = bitcrusher
            }
            break;

        case FX_GRAIN:
            if (granularFX) {
                // param1 = grain size/speed, param2 = pitch shift ratio
                float speed = 0.25f + currentParams.param1 * 1.75f;
                granularFX->beginPitchShift(50 + (int)(currentParams.param2 * 200));
                granularFX->setSpeed(speed);
                fxReturnMix->gain(3, mix);  // ch3 = granular
            }
            break;

        case FX_CHORUS:
            if (chorusFX) {
                int voices = 2 + (int)(currentParams.param1 * 4);
                if (voices > 6) voices = 6;
                chorusFX->voices(voices);
                if (fxReturn2Mix) {
                    fxReturn2Mix->gain(0, mix);  // fxReturn2 ch0 = chorus
                }
            }
            break;

        case FX_FILTER:
            // Per-track filter sweep (applies to all track filters)
            if (filters) {
                float freq = 100.0f + currentParams.param1 * 9900.0f;
                float res = 0.7f + currentParams.param2 * 4.3f;
                for (int i = 0; i < MAX_TRACKS; i++) {
                    filters[i].frequency(freq);
                    filters[i].resonance(res);
                }
            }
            break;

        case FX_WAVEFOLD:
            // Wavefold via drive into the filter resonance
            if (filters) {
                float res = 0.7f + currentParams.param1 * 9.0f;
                for (int i = 0; i < MAX_TRACKS; i++) {
                    filters[i].resonance(res);
                }
            }
            break;

        case FX_NONE:
        default:
            // No effect — feedback path off
            if (fxSendMix) {
                fxSendMix->gain(1, 0.0);
            }
            break;
    }
}

// Effect selection
void FXEngine::selectEffect(int delta) {
    int newEffect = (int)currentEffect + delta;
    if (newEffect < 0) newEffect = FX_COUNT - 1;
    if (newEffect >= FX_COUNT) newEffect = 0;
    currentEffect = (FXType)newEffect;

    // Enable mix when selecting a new effect
    if (currentEffect != FX_NONE && currentParams.mix < 0.01f) {
        currentParams.mix = 0.5f;
    }

    DEBUG_PRINTF("FXEngine: Selected effect %d (%s)\n", currentEffect, getEffectName(currentEffect));
}

FXType FXEngine::getCurrentEffect() {
    return currentEffect;
}

const char* FXEngine::getEffectName(FXType type) {
    switch (type) {
        case FX_NONE:     return "NONE";
        case FX_REVERB:   return "REVERB";
        case FX_DELAY:    return "DELAY";
        case FX_FILTER:   return "FILTER";
        case FX_BITCRUSH: return "CRUSH";
        case FX_WAVEFOLD: return "FOLD";
        case FX_GLITCH:   return "GLITCH";
        case FX_GRAIN:    return "GRAIN";
        case FX_RINGMOD:  return "RING";
        case FX_COMB:     return "COMB";
        case FX_TAPE:     return "TAPE";
        case FX_CHORUS:   return "CHORUS";
        default:          return "???";
    }
}

// Parameter control
void FXEngine::adjustParam(int paramIndex, float delta) {
    switch (paramIndex) {
        case 0: currentParams.param1 = constrain(currentParams.param1 + delta, 0.0f, 1.0f); break;
        case 1: currentParams.param2 = constrain(currentParams.param2 + delta, 0.0f, 1.0f); break;
        case 2: currentParams.param3 = constrain(currentParams.param3 + delta, 0.0f, 1.0f); break;
    }
}

void FXEngine::setParam(int paramIndex, float value) {
    value = constrain(value, 0.0f, 1.0f);
    switch (paramIndex) {
        case 0: currentParams.param1 = value; break;
        case 1: currentParams.param2 = value; break;
        case 2: currentParams.param3 = value; break;
    }
}

float FXEngine::getParam(int paramIndex) {
    switch (paramIndex) {
        case 0: return currentParams.param1;
        case 1: return currentParams.param2;
        case 2: return currentParams.param3;
        default: return 0.0f;
    }
}

// Mix control
void FXEngine::setMix(float mix) {
    currentParams.mix = constrain(mix, 0.0f, 1.0f);
}

float FXEngine::getMix() {
    return currentParams.mix;
}

// Enable/bypass
void FXEngine::enable() {
    currentParams.enabled = true;
    DEBUG_PRINTLN("FXEngine: Enabled");
}

void FXEngine::disable() {
    currentParams.enabled = false;
    muteAllReturns();
    DEBUG_PRINTLN("FXEngine: Disabled");
}

void FXEngine::toggle() {
    currentParams.enabled = !currentParams.enabled;
    if (!currentParams.enabled) muteAllReturns();
    DEBUG_PRINTF("FXEngine: %s\n", currentParams.enabled ? "Enabled" : "Disabled");
}

bool FXEngine::isEnabled() {
    return currentParams.enabled;
}

// Per-track effects
void FXEngine::setTrackEffect(int track, FXType type) {
    if (track >= 0 && track < MAX_TRACKS) {
        trackEffects[track] = type;
    }
}

FXType FXEngine::getTrackEffect(int track) {
    if (track >= 0 && track < MAX_TRACKS) {
        return trackEffects[track];
    }
    return FX_NONE;
}

void FXEngine::setTrackFXParam(int track, int paramIndex, float value) {
    if (track >= 0 && track < MAX_TRACKS) {
        value = constrain(value, 0.0f, 1.0f);
        switch (paramIndex) {
            case 0: trackParams[track].param1 = value; break;
            case 1: trackParams[track].param2 = value; break;
            case 2: trackParams[track].param3 = value; break;
        }
    }
}

// Presets
void FXEngine::loadPreset(int presetNumber) {
    DEBUG_PRINTF("FXEngine: Loading preset %d\n", presetNumber);

    char path[64];
    snprintf(path, sizeof(path), "%sfx_preset%02d.json", PRESETS_DIR, presetNumber);

    if (!SD.exists(path)) return;

    File file = SD.open(path);
    if (!file) return;

    StaticJsonDocument<256> doc;
    if (deserializeJson(doc, file) == DeserializationError::Ok) {
        currentEffect = (FXType)(doc["fx"] | 0);
        currentParams.param1 = doc["p1"] | 0.5f;
        currentParams.param2 = doc["p2"] | 0.5f;
        currentParams.param3 = doc["p3"] | 0.0f;
        currentParams.mix = doc["mix"] | 0.0f;
    }
    file.close();
}

void FXEngine::savePreset(int presetNumber) {
    DEBUG_PRINTF("FXEngine: Saving preset %d\n", presetNumber);

    char path[64];
    snprintf(path, sizeof(path), "%sfx_preset%02d.json", PRESETS_DIR, presetNumber);

    File file = SD.open(path, FILE_WRITE);
    if (!file) return;

    StaticJsonDocument<256> doc;
    doc["fx"] = (int)currentEffect;
    doc["p1"] = currentParams.param1;
    doc["p2"] = currentParams.param2;
    doc["p3"] = currentParams.param3;
    doc["mix"] = currentParams.mix;

    serializeJson(doc, file);
    file.close();
}

// LFO
void FXEngine::setLFORate(float hz) {
    lfoRate = constrain(hz, 0.01f, 20.0f);
}

void FXEngine::setLFODepth(float depth) {
    lfoDepth = constrain(depth, 0.0f, 1.0f);
}

void FXEngine::setLFOTarget(int paramIndex) {
    lfoTarget = paramIndex;
}

float FXEngine::getLFOValue() {
    return sin(lfoPhase * 2.0f * PI) * lfoDepth;
}

void FXEngine::updateLFO() {
    unsigned long now = millis();
    if (now - lastLFOUpdate >= 10) {
        float dt = (now - lastLFOUpdate) / 1000.0f;
        lfoPhase += lfoRate * dt;
        if (lfoPhase >= 1.0f) lfoPhase -= 1.0f;
        lastLFOUpdate = now;

        // Apply LFO modulation to target parameter
        if (lfoTarget >= 0 && lfoDepth > 0.0f) {
            float lfoVal = getLFOValue();
            float base = getParam(lfoTarget);
            float modulated = constrain(base + lfoVal * 0.3f, 0.0f, 1.0f);
            // Temporarily override the param (will be rewritten next frame)
            switch (lfoTarget) {
                case 0: currentParams.param1 = modulated; break;
                case 1: currentParams.param2 = modulated; break;
                case 2: currentParams.param3 = modulated; break;
            }
        }
    }
}
