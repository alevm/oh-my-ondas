/**
 * Oh My Ondas - Sequencer
 * Octatrack-style step sequencer with parameter locks
 */

#ifndef SEQUENCER_H
#define SEQUENCER_H

#include <Arduino.h>
#include "config.h"

// Parameter lock types
enum ParamType {
    PARAM_PITCH = 0,
    PARAM_VOLUME,
    PARAM_PAN,
    PARAM_FILTER_FREQ,
    PARAM_FILTER_RES,
    PARAM_FX_SEND_1,
    PARAM_FX_SEND_2,
    PARAM_SAMPLE_START,
    PARAM_SAMPLE_END,
    PARAM_COUNT
};

// Step data structure
struct Step {
    bool active;
    TrigCondition condition;
    uint8_t velocity;
    int8_t pitchOffset;     // Semitones
    uint8_t sampleSlice;    // Which slice to play
    float paramLocks[PARAM_COUNT];
    bool hasParamLock[PARAM_COUNT];
};

// Track data structure
struct Track {
    bool muted;
    bool soloed;
    uint8_t sourceSlot;     // Which sample/input
    float volume;
    float pan;
    Step steps[MAX_STEPS];
};

// Pattern data structure
struct Pattern {
    uint8_t length;         // 1-64 steps
    uint8_t swing;          // 0-100%
    float bpm;              // Pattern-specific tempo (or 0 for global)
    Track tracks[MAX_TRACKS];
};

class Sequencer {
public:
    Sequencer();
    
    void begin(float initialBpm);
    void update();
    
    // Transport
    void start();
    void stop();
    void pause();
    void reset();
    bool isRunning();
    
    // Tempo
    void setTempo(float bpm);
    float getTempo();
    void adjustSwing(int delta);
    uint8_t getSwing();
    
    // Position
    int getCurrentStep();
    int getCurrentBar();
    void setPosition(int step);
    
    // Track management
    void selectTrack(int track);
    int getSelectedTrack();
    void muteTrack(int track);
    void unmuteTrack(int track);
    void soloTrack(int track);
    void unsoloTrack(int track);
    bool isTrackMuted(int track);
    bool isTrackSoloed(int track);
    
    // Step editing
    void toggleStep(int step);
    void setStep(int track, int step, bool active);
    bool hasStep(int step);
    bool getStep(int track, int step);
    
    // Trig conditions
    void setTrigCondition(int track, int step, TrigCondition condition);
    TrigCondition getTrigCondition(int track, int step);
    
    // Parameter locks
    void setParamLock(int track, int step, ParamType param, float value);
    void clearParamLock(int track, int step, ParamType param);
    void clearAllParamLocks(int track, int step);
    bool hasParamLock(int track, int step, ParamType param);
    float getParamLock(int track, int step, ParamType param);
    
    // Pattern management
    void loadPattern(int patternNumber);
    void savePattern(int patternNumber);
    void copyPattern(int from, int to);
    void clearPattern();
    int getCurrentPattern();
    
    // Fill mode
    void setFillMode(bool enabled);
    bool isFillMode();
    
private:
    Pattern pattern;
    int currentPatternNumber;
    int selectedTrack;
    int currentStep;
    bool running;
    bool fillMode;
    float globalBpm;
    
    unsigned long lastStepTime;
    unsigned long stepInterval;
    uint8_t triggerCounts[MAX_TRACKS]; // For Nth play conditions
    
    void calculateStepInterval();
    bool evaluateTrigCondition(int track, int step);
    void triggerStep(int track, int step);
    void applyParamLocks(int track, int step);
};

#endif // SEQUENCER_H
