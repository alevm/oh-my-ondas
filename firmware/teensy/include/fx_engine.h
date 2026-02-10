/**
 * Oh My Ondas - FX Engine
 * Send/return effects chain using Teensy Audio Library objects
 */

#ifndef FX_ENGINE_H
#define FX_ENGINE_H

#include <Arduino.h>
#include <Audio.h>
#include "config.h"

struct FXParams {
    float param1;  // Primary parameter
    float param2;  // Secondary parameter
    float param3;  // Tertiary parameter
    float mix;     // Wet/dry mix
    bool enabled;
};

class FXEngine {
public:
    FXEngine();

    void begin(AudioEffectFreeverb* reverb,
               AudioEffectDelay* delay,
               AudioEffectBitcrusher* crusher,
               AudioEffectGranular* granular,
               AudioEffectChorus* chorus,
               AudioFilterStateVariable* trackFilters,
               AudioMixer4* fxReturn,
               AudioMixer4* fxReturn2,
               AudioMixer4* fxSend);
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

    // Audio object pointers (injected from main.ino)
    AudioEffectFreeverb* reverbFX;
    AudioEffectDelay* delayFX;
    AudioEffectBitcrusher* crusherFX;
    AudioEffectGranular* granularFX;
    AudioEffectChorus* chorusFX;
    AudioFilterStateVariable* filters;
    AudioMixer4* fxReturnMix;
    AudioMixer4* fxReturn2Mix;
    AudioMixer4* fxSendMix;

    // LFO state
    float lfoRate;
    float lfoDepth;
    int lfoTarget;
    float lfoPhase;
    unsigned long lastLFOUpdate;

    void initializeDefaults();
    void updateLFO();
    void applyEffect();
    void muteAllReturns();
};

#endif // FX_ENGINE_H
