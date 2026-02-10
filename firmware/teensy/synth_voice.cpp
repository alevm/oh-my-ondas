/**
 * Oh My Ondas - Synth Voice Implementation
 * Dual-oscillator synthesizer with Moog ladder filter and ADSR envelope
 */

#include "synth_voice.h"

SynthVoice::SynthVoice()
    : osc1(nullptr)
    , osc2(nullptr)
    , noise(nullptr)
    , mixer(nullptr)
    , filter(nullptr)
    , envelope(nullptr)
    , baseFreq(440.0f)
    , osc2DetuneRatio(1.0f)
    , filterFreq(8000.0f)
    , active(false)
    , lfoRate(2.0f)
    , lfoDepth(0.0f)
    , lfoTarget(0)
    , lfoPhase(0.0f)
    , lastLFOUpdate(0)
{
}

void SynthVoice::begin(AudioSynthWaveform* o1,
                       AudioSynthWaveform* o2,
                       AudioSynthNoiseWhite* n,
                       AudioMixer4* mix,
                       AudioFilterLadder* filt,
                       AudioEffectEnvelope* env) {
    osc1 = o1;
    osc2 = o2;
    noise = n;
    mixer = mix;
    filter = filt;
    envelope = env;

    DEBUG_PRINTLN("SynthVoice: Ready");
}

void SynthVoice::update() {
    if (!active) return;

    unsigned long now = millis();
    if (now - lastLFOUpdate < 10) return;

    float dt = (now - lastLFOUpdate) / 1000.0f;
    lfoPhase += lfoRate * dt;
    if (lfoPhase >= 1.0f) lfoPhase -= 1.0f;
    lastLFOUpdate = now;

    if (lfoDepth <= 0.0f) return;

    float lfoVal = sinf(lfoPhase * 2.0f * PI) * lfoDepth;

    switch (lfoTarget) {
        case 0: {
            // Pitch modulation (vibrato)
            float pitchMod = baseFreq * (1.0f + lfoVal * 0.05f);
            if (osc1) osc1->frequency(pitchMod);
            if (osc2) osc2->frequency(pitchMod * osc2DetuneRatio);
            break;
        }
        case 1: {
            // Filter modulation (wah)
            float filterMod = filterFreq * (1.0f + lfoVal * 0.5f);
            if (filter) filter->frequency(constrain(filterMod, 20.0f, 15000.0f));
            break;
        }
        case 2: {
            // Amplitude modulation (tremolo)
            float ampMod = 0.5f + lfoVal * 0.5f;
            if (mixer) mixer->gain(0, ampMod * 0.5f);
            break;
        }
    }
}

void SynthVoice::noteOn(float freq, float velocity) {
    baseFreq = freq;

    if (osc1) {
        osc1->frequency(freq);
        osc1->amplitude(velocity);
    }
    if (osc2) {
        osc2->frequency(freq * osc2DetuneRatio);
        osc2->amplitude(velocity * 0.6f);
    }
    if (envelope) {
        envelope->noteOn();
    }

    active = true;
    lastLFOUpdate = millis();

    DEBUG_PRINTF("SynthVoice: noteOn freq=%.1f vel=%.2f\n", freq, velocity);
}

void SynthVoice::noteOff() {
    if (envelope) {
        envelope->noteOff();
    }
    if (osc1) osc1->amplitude(0.0);
    if (osc2) osc2->amplitude(0.0);
    active = false;

    DEBUG_PRINTLN("SynthVoice: noteOff");
}

void SynthVoice::setOsc1Waveform(int waveform) {
    if (osc1) osc1->begin(waveform);
}

void SynthVoice::setOsc2Waveform(int waveform) {
    if (osc2) osc2->begin(waveform);
}

void SynthVoice::setOsc1Level(float level) {
    if (mixer) mixer->gain(0, constrain(level, 0.0f, 1.0f));
}

void SynthVoice::setOsc2Level(float level) {
    if (mixer) mixer->gain(1, constrain(level, 0.0f, 1.0f));
}

void SynthVoice::setNoiseLevel(float level) {
    if (noise) noise->amplitude(constrain(level, 0.0f, 1.0f));
    if (mixer) mixer->gain(2, constrain(level, 0.0f, 1.0f));
}

void SynthVoice::setOsc2Detune(float semitones) {
    osc2DetuneRatio = powf(2.0f, semitones / 12.0f);
    if (osc2 && active) {
        osc2->frequency(baseFreq * osc2DetuneRatio);
    }
}

void SynthVoice::setFilterFreq(float freq) {
    filterFreq = constrain(freq, 20.0f, 15000.0f);
    if (filter) filter->frequency(filterFreq);
}

void SynthVoice::setFilterRes(float res) {
    if (filter) filter->resonance(constrain(res, 0.0f, 5.0f));
}

void SynthVoice::setAttack(float ms) {
    if (envelope) envelope->attack(ms);
}

void SynthVoice::setDecay(float ms) {
    if (envelope) envelope->decay(ms);
}

void SynthVoice::setSustain(float level) {
    if (envelope) envelope->sustain(constrain(level, 0.0f, 1.0f));
}

void SynthVoice::setRelease(float ms) {
    if (envelope) envelope->release(ms);
}

void SynthVoice::setLFORate(float hz) {
    lfoRate = constrain(hz, 0.01f, 20.0f);
}

void SynthVoice::setLFODepth(float depth) {
    lfoDepth = constrain(depth, 0.0f, 1.0f);
}

void SynthVoice::setLFOTarget(int target) {
    lfoTarget = constrain(target, 0, 2);
}

bool SynthVoice::isActive() {
    return active;
}
