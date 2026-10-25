/**
 * Oh My Ondas - Synth Voice
 * Dual-oscillator synthesizer with Moog ladder filter and ADSR envelope
 */

#ifndef SYNTH_VOICE_H
#define SYNTH_VOICE_H

#include <Arduino.h>
#include <Audio.h>
#include "config.h"

#define SYNTH_RES_MAX         1.8f      // AudioFilterLadder clamps resonance to 0..1.8 (self-oscillates near 1)
#define SYNTH_ATTACK_MAX_MS   5000.0f
#define SYNTH_RELEASE_MAX_MS  10000.0f  // AudioEffectEnvelope allows up to 11880 ms

class SynthVoice {
public:
    SynthVoice();

    void begin(AudioSynthWaveform* osc1,
               AudioSynthWaveform* osc2,
               AudioSynthNoiseWhite* noise,
               AudioMixer4* mixer,
               AudioFilterLadder* filter,
               AudioEffectEnvelope* envelope);

    void update();  // Call from main loop for LFO

    // Note control
    void noteOn(float freq, float velocity);
    void noteOff();

    // Oscillator settings
    void setOsc1Waveform(int waveform);
    void setOsc2Waveform(int waveform);
    void setOsc1Level(float level);
    void setOsc2Level(float level);
    void setNoiseLevel(float level);
    void setOsc2Detune(float semitones);

    // Filter
    void setFilterFreq(float freq);
    void setFilterRes(float res);
    float getFilterRes() const { return filterRes; }

    // ADSR envelope
    void setAttack(float ms);
    void setDecay(float ms);
    void setSustain(float level);
    void setRelease(float ms);
    float getAttack() const  { return attackMs; }
    float getRelease() const { return releaseMs; }

    // LFO
    void setLFORate(float hz);
    void setLFODepth(float depth);
    void setLFOTarget(int target);  // 0=pitch, 1=filter, 2=amplitude

    // State
    bool isActive();

private:
    AudioSynthWaveform* osc1;
    AudioSynthWaveform* osc2;
    AudioSynthNoiseWhite* noise;
    AudioMixer4* mixer;
    AudioFilterLadder* filter;
    AudioEffectEnvelope* envelope;

    float baseFreq;
    float osc2DetuneRatio;
    float filterFreq;
    float filterRes;    // last values set: encoders step from these
    float attackMs;
    float releaseMs;
    bool active;

    // LFO
    float lfoRate;
    float lfoDepth;
    int lfoTarget;
    float lfoPhase;
    unsigned long lastLFOUpdate;
};

#endif // SYNTH_VOICE_H
