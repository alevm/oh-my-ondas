/**
 * Oh My Ondas - FX Engine
 * Bastl-style audio mangling effects
 */

#ifndef FX_ENGINE_H
#define FX_ENGINE_H

#include <Arduino.h>
#include "config.h"

// Effect parameters
struct FXParams {
    float param1;  // Primary parameter
    float param2;  // Secondary parameter
    float param3;  // Tertiary parameter
    float mix;     // Wet/dry mix
    bool enabled;
};

// Mangle preset
struct ManglePreset {
    char name[32];
    FXType effects[4];
    FXParams params[4];
};

class FXEngine {
public:
    FXEngine();
    
    void begin();
    void update();
    
    // Effect selection
    void selectEffect(int delta);
    FXType getCurrentEffect();
    const char* getEffectName(FXType type);
    
    // Parameter control
    void adjustParam(int paramIndex, float delta);
    void setParam(int paramIndex, float value);
    float getParam(int paramIndex);
    
    // Mix control
    void setMix(float mix);
    float getMix();
    
    // Enable/bypass
    void enable();
    void disable();
    void toggle();
    bool isEnabled();
    
    // Per-track effects
    void setTrackEffect(int track, FXType type);
    FXType getTrackEffect(int track);
    void setTrackFXParam(int track, int paramIndex, float value);
    
    // Presets
    void loadPreset(int presetNumber);
    void savePreset(int presetNumber);
    void loadManglePreset(const char* name);
    
    // LFO modulation
    void setLFORate(float hz);
    void setLFODepth(float depth);
    void setLFOTarget(int paramIndex);
    float getLFOValue();
    
private:
    FXType currentEffect;
    FXParams currentParams;
    FXType trackEffects[MAX_TRACKS];
    FXParams trackParams[MAX_TRACKS];
    
    // LFO state
    float lfoRate;
    float lfoDepth;
    int lfoTarget;
    float lfoPhase;
    unsigned long lastLFOUpdate;
    
    void initializeDefaults();
    void updateLFO();
    void applyEffect(FXType type, FXParams& params);
    
    // Individual effect processors
    void processBitcrush(float& sampleL, float& sampleR, FXParams& params);
    void processWavefold(float& sampleL, float& sampleR, FXParams& params);
    void processGlitch(float& sampleL, float& sampleR, FXParams& params);
    void processGrain(float& sampleL, float& sampleR, FXParams& params);
    void processRingMod(float& sampleL, float& sampleR, FXParams& params);
    void processComb(float& sampleL, float& sampleR, FXParams& params);
    void processTape(float& sampleL, float& sampleR, FXParams& params);
};

#endif // FX_ENGINE_H
