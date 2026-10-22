/**
 * Oh My Ondas - Sampling Engine
 * 8-voice sample playback with touch triggers (SD WAV players), plus
 * CAPTURE_VOICES voices that play captures from memory (capture_store.h):
 * AudioPlayCapture -> per-voice low-pass -> capture mixer -> sampleSum ch 2
 */

#ifndef SAMPLING_ENGINE_H
#define SAMPLING_ENGINE_H

#include <Arduino.h>
#include <Audio.h>
#include <SD.h>
#include "config.h"
#include "play_capture.h"

// Capture voices: one per layer-1 role, plus one for auditioning
#define CAPTURE_VOICES     4
#define CAPVOICE_RHYTHM    0
#define CAPVOICE_TEXTURE   1
#define CAPVOICE_MELODY    2
#define CAPVOICE_PREVIEW   3

struct Sample {
    char filename[64];
    bool loaded;
    bool playing;
    bool looping;
    float pitch;
    float volume;
    float pan;
    uint32_t startPos;
    uint32_t endPos;
    uint32_t length;
};

class SamplingEngine {
public:
    SamplingEngine();

    void begin(AudioPlaySdWav* players, AudioAmplifier* amps);
    void update();

    // Sample management
    bool loadSample(int slot, const char* filename);
    void unloadSample(int slot);
    bool isSampleLoaded(int slot);

    // Playback control
    void trigger(int slot);
    void stop(int slot);
    void stopAll();

    // Properties
    void setVolume(int slot, float volume);
    void setPitch(int slot, float pitch);
    void setPan(int slot, float pan);
    void setLoop(int slot, bool loop);
    void setStartPos(int slot, uint32_t pos);
    void setEndPos(int slot, uint32_t pos);

    // Queries
    bool isPlaying(int slot);
    bool isLooping(int slot);
    float getVolume(int slot);
    float getPitch(int slot);

    // Capture voices (memory playback; tag = capture id playing)
    void attachCaptureVoices(AudioPlayCapture* voices, AudioFilterStateVariable* filters,
                             AudioMixer4* mix);
    void playCapture(int voice, uint8_t tag, const int16_t* data, uint32_t start, uint32_t end,
                     float rate, float gain);
    void grainCapture(int voice, uint8_t tag, const int16_t* data, uint32_t length,
                      float density, float rate, float gain);
    void setCaptureDensity(int voice, float density);
    void setCaptureGain(int voice, float gain);
    void setCaptureFilter(int voice, float hz);
    void setCaptureLevel(float level);          // whole capture layer
    void stopCaptureVoice(int voice);
    void stopCaptureTag(uint8_t tag);           // every voice playing this capture
    bool isCaptureVoicePlaying(int voice);
    uint8_t getCaptureVoiceTag(int voice);

    // Bank management
    void loadBank(int bankNumber);
    void saveBank(int bankNumber);
    int getCurrentBank();

private:
    Sample samples[MAX_TRACKS];
    int currentBank;

    AudioPlaySdWav* players;
    AudioAmplifier* amps;

    AudioPlayCapture*         capVoices;
    AudioFilterStateVariable* capFilters;
    AudioMixer4*              capMix;

    void initializeSample(int slot);
    bool validateSlot(int slot);
};

#endif // SAMPLING_ENGINE_H
