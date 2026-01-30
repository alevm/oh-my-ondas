/**
 * Oh My Ondas - FX Engine Implementation
 * Bastl-style audio mangling effects
 */

#include "fx_engine.h"

FXEngine::FXEngine()
    : currentEffect(FX_NONE)
    , lfoRate(1.0f)
    , lfoDepth(0.0f)
    , lfoTarget(-1)
    , lfoPhase(0.0f)
    , lastLFOUpdate(0)
{
    initializeDefaults();
}

void FXEngine::begin() {
    DEBUG_PRINTLN("FXEngine: Initializing...");
    initializeDefaults();
    DEBUG_PRINTLN("FXEngine: Ready");
}

void FXEngine::update() {
    updateLFO();
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

// Effect selection
void FXEngine::selectEffect(int delta) {
    int newEffect = (int)currentEffect + delta;
    if (newEffect < 0) newEffect = FX_COUNT - 1;
    if (newEffect >= FX_COUNT) newEffect = 0;
    currentEffect = (FXType)newEffect;
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
    DEBUG_PRINTLN("FXEngine: Disabled");
}

void FXEngine::toggle() {
    currentParams.enabled = !currentParams.enabled;
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
    // TODO: Load from SD card
}

void FXEngine::savePreset(int presetNumber) {
    DEBUG_PRINTF("FXEngine: Saving preset %d\n", presetNumber);
    // TODO: Save to SD card
}

void FXEngine::loadManglePreset(const char* name) {
    DEBUG_PRINTF("FXEngine: Loading mangle preset '%s'\n", name);
    // TODO: Load named mangle preset
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
    if (now - lastLFOUpdate >= 10) { // 100Hz LFO update rate
        float dt = (now - lastLFOUpdate) / 1000.0f;
        lfoPhase += lfoRate * dt;
        if (lfoPhase >= 1.0f) lfoPhase -= 1.0f;
        lastLFOUpdate = now;

        // Apply LFO to target parameter
        if (lfoTarget >= 0 && lfoDepth > 0.0f) {
            float lfoVal = getLFOValue();
            // TODO: Modulate target parameter
            (void)lfoVal;
        }
    }
}

void FXEngine::applyEffect(FXType type, FXParams& params) {
    // TODO: Route to Teensy Audio Library effect objects
    (void)type;
    (void)params;
}

void FXEngine::processBitcrush(float& sampleL, float& sampleR, FXParams& params) {
    // TODO: Implement bitcrusher
    (void)sampleL; (void)sampleR; (void)params;
}

void FXEngine::processWavefold(float& sampleL, float& sampleR, FXParams& params) {
    // TODO: Implement wavefolder
    (void)sampleL; (void)sampleR; (void)params;
}

void FXEngine::processGlitch(float& sampleL, float& sampleR, FXParams& params) {
    // TODO: Implement glitch effect
    (void)sampleL; (void)sampleR; (void)params;
}

void FXEngine::processGrain(float& sampleL, float& sampleR, FXParams& params) {
    // TODO: Implement granular effect
    (void)sampleL; (void)sampleR; (void)params;
}

void FXEngine::processRingMod(float& sampleL, float& sampleR, FXParams& params) {
    // TODO: Implement ring modulator
    (void)sampleL; (void)sampleR; (void)params;
}

void FXEngine::processComb(float& sampleL, float& sampleR, FXParams& params) {
    // TODO: Implement comb filter
    (void)sampleL; (void)sampleR; (void)params;
}

void FXEngine::processTape(float& sampleL, float& sampleR, FXParams& params) {
    // TODO: Implement tape emulation
    (void)sampleL; (void)sampleR; (void)params;
}
