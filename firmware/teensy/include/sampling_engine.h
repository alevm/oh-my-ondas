/**
 * Oh My Ondas - Sampling Engine
 * 8-voice sample playback with touch triggers
 */

#ifndef SAMPLING_ENGINE_H
#define SAMPLING_ENGINE_H

#include <Arduino.h>
#include <Audio.h>
#include <SD.h>
#include "config.h"

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
    
    void begin();
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
    
    // Bank management
    void loadBank(int bankNumber);
    void saveBank(int bankNumber);
    int getCurrentBank();
    
private:
    Sample samples[MAX_TRACKS];
    int currentBank;
    
    // Audio players (external, connected in main)
    // AudioPlaySdWav* players[MAX_TRACKS];
    
    void initializeSample(int slot);
    bool validateSlot(int slot);
};

#endif // SAMPLING_ENGINE_H
