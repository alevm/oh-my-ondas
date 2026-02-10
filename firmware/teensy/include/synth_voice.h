/**
 * Oh My Ondas - Synth Voice
 * Dual-oscillator synthesizer with Moog ladder filter and ADSR envelope
 */

#ifndef SYNTH_VOICE_H
#define SYNTH_VOICE_H

#include <Arduino.h>
#include <Audio.h>
#include "config.h"

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

    // ADSR envelope
    void setAttack(float ms);
    void setDecay(float ms);
    void setSustain(float level);
    void setRelease(float ms);

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
    bool active;

    // LFO
    float lfoRate;
    float lfoDepth;
    int lfoTarget;
    float lfoPhase;
    unsigned long lastLFOUpdate;
};

#endif // SYNTH_VOICE_H
