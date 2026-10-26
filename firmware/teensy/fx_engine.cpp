/**
 * Oh My Ondas - FX Engine Implementation
 * Send/return effects chain using real Teensy Audio Library objects
 */

#include "fx_engine.h"
#include <SD.h>
#include "sd_guard.h"
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
    , appliedEffect(FX_NONE)
    , applied(false)
    , grainMs(0)
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

    // The LFO moves a copy around the user's value: the encoders and the
    // LFO never feed into each other
    FXParams p = currentParams;
    if (lfoTarget >= 0 && lfoDepth > 0.0f) {
        float modulated = constrain(getParam(lfoTarget) + getLFOValue() * 0.3f, 0.0f, 1.0f);
        switch (lfoTarget) {
            case 0: p.param1 = modulated; break;
            case 1: p.param2 = modulated; break;
            case 2: p.param3 = modulated; break;
        }
    }

    // Write only on change: re-writing every loop costs CPU, and the old
    // mute-then-restore of the return gains on every pass could click
    bool sameEffect = applied && appliedEffect == currentEffect;
    if (sameEffect && p.param1 == appliedParams.param1 && p.param2 == appliedParams.param2
        && p.param3 == appliedParams.param3 && p.mix == appliedParams.mix
        && currentEffect != FX_TAPE) {   // tape wobbles its delay with the LFO
        return;
    }
    appliedEffect = currentEffect;
    appliedParams = p;
    applied = true;

    float mix = p.mix;

    if (!sameEffect) {
        muteAllReturns();
        if (fxSendMix) fxSendMix->gain(1, 0.0);   // feedback off until an effect sets it
        if (granularFX && grainMs && currentEffect != FX_GRAIN) {
            granularFX->stop();
            grainMs = 0;
        }
    }

    // Then enable only the active effect's return channel
    switch (currentEffect) {
        case FX_REVERB:
            if (reverbFX) {
                reverbFX->roomsize(p.param1);
                reverbFX->damping(p.param2);
                fxReturnMix->gain(0, mix);  // ch0 = reverb
            }
            break;

        case FX_DELAY:
            if (delayFX) {
                // param1 = delay time (50-1000ms), param2 = feedback
                int delayMs = (int)(p.param1 * DELAY_MAX_MS);
                if (delayMs < 50) delayMs = 50;
                delayFX->delay(0, delayMs);
                // Feedback via fxSend mixer ch1
                if (fxSendMix) {
                    fxSendMix->gain(1, p.param2 * 0.8f);
                }
                fxReturnMix->gain(1, mix);  // ch1 = delay
            }
            break;

        case FX_BITCRUSH:
            if (crusherFX) {
                // param1 = bits (4-16), param2 = sample rate reduction
                int bits = 4 + (int)(p.param1 * 12);
                int sr = 4000 + (int)(p.param2 * 40000);
                crusherFX->bits(bits);
                crusherFX->sampleRate(sr);
                fxReturnMix->gain(2, mix);  // ch2 = bitcrusher
            }
            break;

        case FX_GRAIN:
            if (granularFX) {
                // param1 = grain size/speed, param2 = pitch shift ratio
                float speed = 0.25f + p.param1 * 1.75f;
                // beginPitchShift() restarts the grain capture: call it only when the length changes
                int ms = 50 + (int)(p.param2 * 200);
                if (ms != grainMs) {
                    granularFX->beginPitchShift(ms);
                    grainMs = ms;
                }
                granularFX->setSpeed(speed);
                fxReturnMix->gain(3, mix);  // ch3 = granular
            }
            break;

        case FX_CHORUS:
            if (chorusFX) {
                int voices = 2 + (int)(p.param1 * 4);
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
                float freq = 100.0f + p.param1 * 9900.0f;
                float res = 0.7f + p.param2 * 4.3f;
                for (int i = 0; i < MAX_TRACKS; i++) {
                    filters[i].frequency(freq);
                    filters[i].resonance(res);
                }
            }
            break;

        case FX_WAVEFOLD:
            // Wavefold via drive into the filter resonance
            if (filters) {
                float res = 0.7f + p.param1 * 9.0f;
                for (int i = 0; i < MAX_TRACKS; i++) {
                    filters[i].resonance(res);
                }
            }
            break;

        case FX_GLITCH:
            // Extreme bitcrusher: low sample rate + low bit depth
            if (crusherFX) {
                // param1 = sample rate (2000-8000Hz), param2 = bits (4-8)
                int glitchSR = 2000 + (int)(p.param1 * 6000);
                int glitchBits = 4 + (int)(p.param2 * 4);
                crusherFX->sampleRate(glitchSR);
                crusherFX->bits(glitchBits);
                fxReturnMix->gain(2, mix);  // ch2 = bitcrusher
            }
            break;

        case FX_COMB:
            // Comb filter via very short delay + high feedback
            if (delayFX) {
                // param1 = delay time (1-30ms), param2 = feedback (0.5-0.95)
                int combMs = 1 + (int)(p.param1 * 29);
                float combFb = 0.5f + p.param2 * 0.45f;
                delayFX->delay(0, combMs);
                if (fxSendMix) {
                    fxSendMix->gain(1, combFb);
                }
                fxReturnMix->gain(1, mix);  // ch1 = delay
            }
            break;

        case FX_TAPE:
            // Tape: mild 12-bit crush + LFO-modulated short delay (wow/flutter)
            if (crusherFX && delayFX) {
                crusherFX->bits(12);
                crusherFX->sampleRate(22050);
                // param1 = wow amount (5-30ms delay), param2 = flutter depth
                float lfo = sinf(lfoPhase * 2.0f * PI);
                int tapeDelay = 5 + (int)(p.param1 * 25
                                + p.param2 * 10.0f * lfo);
                if (tapeDelay < 1) tapeDelay = 1;
                delayFX->delay(0, tapeDelay);
                if (fxSendMix) {
                    fxSendMix->gain(1, 0.3f);  // mild feedback
                }
                fxReturnMix->gain(1, mix * 0.6f);  // delay return
                fxReturnMix->gain(2, mix * 0.4f);  // crush return
            }
            break;

        case FX_RINGMOD:
            // Not implemented — no dedicated audio object
            break;

        case FX_NONE:
        default:
            // No effect: returns and feedback were turned off on the switch
            break;
    }
}

// Effect selection
void FXEngine::selectEffect(int delta) {
    int newEffect = (int)currentEffect + delta;
    if (newEffect < 0) newEffect = FX_COUNT - 1;
    if (newEffect >= FX_COUNT) newEffect = 0;
    // Skip FX_RINGMOD (not implemented — no dedicated audio object)
    if (newEffect == FX_RINGMOD) {
        newEffect += (delta >= 0) ? 1 : -1;
        if (newEffect < 0) newEffect = FX_COUNT - 1;
        if (newEffect >= FX_COUNT) newEffect = 0;
    }
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
        case FX_RINGMOD:  return "RING-";
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
    applied = false;
    DEBUG_PRINTLN("FXEngine: Disabled");
}

void FXEngine::toggle() {
    currentParams.enabled = !currentParams.enabled;
    if (!currentParams.enabled) { muteAllReturns(); applied = false; }
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

    if (!sdExists(path)) return;

    SdReader file(path);   // guarded (SD WAV players read the card in the audio interrupt)
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

    SdWriter file(path);
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
        // The modulation is applied to a copy in applyEffect(); the user's
        // params (getParam, presets, scenes) stay unmodulated
    }
}
