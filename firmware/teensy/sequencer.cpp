/**
 * Oh My Ondas - Sequencer Implementation
 * Octatrack-style step sequencer with parameter locks
 */

#include "sequencer.h"

Sequencer::Sequencer() 
    : currentPatternNumber(0)
    , selectedTrack(0)
    , currentStep(0)
    , running(false)
    , fillMode(false)
    , globalBpm(120.0f)
    , lastStepTime(0)
    , stepInterval(125) // Default for 120 BPM
{
    clearPattern();
    memset(triggerCounts, 0, sizeof(triggerCounts));
}

void Sequencer::begin(float initialBpm) {
    DEBUG_PRINTLN("Sequencer: Initializing...");
    
    globalBpm = initialBpm;
    calculateStepInterval();
    
    // Try to load pattern 0
    loadPattern(0);
    
    DEBUG_PRINTLN("Sequencer: Ready");
}

void Sequencer::update() {
    if (!running) return;
    
    unsigned long now = millis();
    
    if (now - lastStepTime >= stepInterval) {
        lastStepTime = now;
        
        // Process all tracks for current step
        for (int track = 0; track < MAX_TRACKS; track++) {
            if (pattern.tracks[track].muted) continue;
            
            // Check for solo (if any track is soloed, only play soloed tracks)
            bool anySoloed = false;
            for (int t = 0; t < MAX_TRACKS; t++) {
                if (pattern.tracks[t].soloed) {
                    anySoloed = true;
                    break;
                }
            }
            if (anySoloed && !pattern.tracks[track].soloed) continue;
            
            // Evaluate trig condition
            if (evaluateTrigCondition(track, currentStep)) {
                triggerStep(track, currentStep);
            }
        }
        
        // Advance step
        currentStep = (currentStep + 1) % pattern.length;
        
        // Reset trigger counts on pattern loop
        if (currentStep == 0) {
            memset(triggerCounts, 0, sizeof(triggerCounts));
        }
    }
}

void Sequencer::calculateStepInterval() {
    float bpm = (pattern.bpm > 0) ? pattern.bpm : globalBpm;
    // 4 steps per beat (16th notes)
    stepInterval = (unsigned long)(60000.0f / bpm / 4.0f);
    
    // Apply swing (affects even steps)
    // TODO: Implement swing timing
}

bool Sequencer::evaluateTrigCondition(int track, int step) {
    Step& s = pattern.tracks[track].steps[step];
    
    if (!s.active) return false;
    
    switch (s.condition) {
        case TRIG_ALWAYS:
            return true;
            
        case TRIG_FILL:
            return fillMode;
            
        case TRIG_NOT_FILL:
            return !fillMode;
            
        case TRIG_PRE:
            // Play on the step before (pre-roll)
            return (step > 0) && pattern.tracks[track].steps[step - 1].active;
            
        case TRIG_NEI:
            // Play if previous step played
            if (step == 0) return false;
            return pattern.tracks[track].steps[step - 1].active;
            
        case TRIG_PROB_25:
            return (random(100) < 25);
            
        case TRIG_PROB_50:
            return (random(100) < 50);
            
        case TRIG_PROB_75:
            return (random(100) < 75);
            
        case TRIG_1ST:
            triggerCounts[track]++;
            return (triggerCounts[track] == 1);
            
        case TRIG_2ND:
            triggerCounts[track]++;
            return (triggerCounts[track] == 2);
            
        case TRIG_3RD:
            triggerCounts[track]++;
            return (triggerCounts[track] == 3);
            
        case TRIG_4TH:
            triggerCounts[track]++;
            return (triggerCounts[track] == 4);
            
        default:
            return true;
    }
}

void Sequencer::triggerStep(int track, int step) {
    Step& s = pattern.tracks[track].steps[step];
    
    // Apply parameter locks before triggering
    applyParamLocks(track, step);
    
    // TODO: Actually trigger the sample through SamplingEngine
    DEBUG_PRINTF("Seq: Trigger T%d S%d (vel:%d pitch:%+d)\n", 
                 track, step, s.velocity, s.pitchOffset);
}

void Sequencer::applyParamLocks(int track, int step) {
    Step& s = pattern.tracks[track].steps[step];
    
    for (int p = 0; p < PARAM_COUNT; p++) {
        if (s.hasParamLock[p]) {
            // TODO: Apply parameter lock to audio engine
            DEBUG_PRINTF("  P-Lock: param %d = %.2f\n", p, s.paramLocks[p]);
        }
    }
}

// Transport controls
void Sequencer::start() {
    running = true;
    lastStepTime = millis();
    DEBUG_PRINTLN("Sequencer: Started");
}

void Sequencer::stop() {
    running = false;
    currentStep = 0;
    memset(triggerCounts, 0, sizeof(triggerCounts));
    DEBUG_PRINTLN("Sequencer: Stopped");
}

void Sequencer::pause() {
    running = false;
    DEBUG_PRINTLN("Sequencer: Paused");
}

void Sequencer::reset() {
    currentStep = 0;
    memset(triggerCounts, 0, sizeof(triggerCounts));
    DEBUG_PRINTLN("Sequencer: Reset");
}

bool Sequencer::isRunning() {
    return running;
}

// Tempo
void Sequencer::setTempo(float bpm) {
    globalBpm = constrain(bpm, 40.0f, 300.0f);
    calculateStepInterval();
    DEBUG_PRINTF("Sequencer: Tempo = %.1f BPM\n", globalBpm);
}

float Sequencer::getTempo() {
    return (pattern.bpm > 0) ? pattern.bpm : globalBpm;
}

void Sequencer::adjustSwing(int delta) {
    pattern.swing = constrain(pattern.swing + delta, 0, 100);
    calculateStepInterval();
    DEBUG_PRINTF("Sequencer: Swing = %d%%\n", pattern.swing);
}

uint8_t Sequencer::getSwing() {
    return pattern.swing;
}

// Position
int Sequencer::getCurrentStep() {
    return currentStep;
}

int Sequencer::getCurrentBar() {
    return currentStep / 4;
}

void Sequencer::setPosition(int step) {
    currentStep = step % pattern.length;
}

// Track management
void Sequencer::selectTrack(int track) {
    if (track >= 0 && track < MAX_TRACKS) {
        selectedTrack = track;
        DEBUG_PRINTF("Sequencer: Selected track %d\n", track);
    }
}

int Sequencer::getSelectedTrack() {
    return selectedTrack;
}

void Sequencer::muteTrack(int track) {
    if (track >= 0 && track < MAX_TRACKS) {
        pattern.tracks[track].muted = true;
    }
}

void Sequencer::unmuteTrack(int track) {
    if (track >= 0 && track < MAX_TRACKS) {
        pattern.tracks[track].muted = false;
    }
}

void Sequencer::soloTrack(int track) {
    if (track >= 0 && track < MAX_TRACKS) {
        pattern.tracks[track].soloed = true;
    }
}

void Sequencer::unsoloTrack(int track) {
    if (track >= 0 && track < MAX_TRACKS) {
        pattern.tracks[track].soloed = false;
    }
}

bool Sequencer::isTrackMuted(int track) {
    if (track >= 0 && track < MAX_TRACKS) {
        return pattern.tracks[track].muted;
    }
    return false;
}

bool Sequencer::isTrackSoloed(int track) {
    if (track >= 0 && track < MAX_TRACKS) {
        return pattern.tracks[track].soloed;
    }
    return false;
}

// Step editing
void Sequencer::toggleStep(int step) {
    if (step >= 0 && step < pattern.length) {
        pattern.tracks[selectedTrack].steps[step].active = 
            !pattern.tracks[selectedTrack].steps[step].active;
        DEBUG_PRINTF("Sequencer: T%d S%d = %s\n", 
                     selectedTrack, step,
                     pattern.tracks[selectedTrack].steps[step].active ? "ON" : "OFF");
    }
}

void Sequencer::setStep(int track, int step, bool active) {
    if (track >= 0 && track < MAX_TRACKS && step >= 0 && step < pattern.length) {
        pattern.tracks[track].steps[step].active = active;
    }
}

bool Sequencer::hasStep(int step) {
    // Check if any track has this step active
    for (int t = 0; t < MAX_TRACKS; t++) {
        if (pattern.tracks[t].steps[step].active) {
            return true;
        }
    }
    return false;
}

bool Sequencer::getStep(int track, int step) {
    if (track >= 0 && track < MAX_TRACKS && step >= 0 && step < pattern.length) {
        return pattern.tracks[track].steps[step].active;
    }
    return false;
}

// Trig conditions
void Sequencer::setTrigCondition(int track, int step, TrigCondition condition) {
    if (track >= 0 && track < MAX_TRACKS && step >= 0 && step < pattern.length) {
        pattern.tracks[track].steps[step].condition = condition;
    }
}

TrigCondition Sequencer::getTrigCondition(int track, int step) {
    if (track >= 0 && track < MAX_TRACKS && step >= 0 && step < pattern.length) {
        return pattern.tracks[track].steps[step].condition;
    }
    return TRIG_ALWAYS;
}

// Parameter locks
void Sequencer::setParamLock(int track, int step, ParamType param, float value) {
    if (track >= 0 && track < MAX_TRACKS && 
        step >= 0 && step < pattern.length &&
        param >= 0 && param < PARAM_COUNT) {
        pattern.tracks[track].steps[step].paramLocks[param] = value;
        pattern.tracks[track].steps[step].hasParamLock[param] = true;
    }
}

void Sequencer::clearParamLock(int track, int step, ParamType param) {
    if (track >= 0 && track < MAX_TRACKS && 
        step >= 0 && step < pattern.length &&
        param >= 0 && param < PARAM_COUNT) {
        pattern.tracks[track].steps[step].hasParamLock[param] = false;
    }
}

void Sequencer::clearAllParamLocks(int track, int step) {
    if (track >= 0 && track < MAX_TRACKS && step >= 0 && step < pattern.length) {
        for (int p = 0; p < PARAM_COUNT; p++) {
            pattern.tracks[track].steps[step].hasParamLock[p] = false;
        }
    }
}

bool Sequencer::hasParamLock(int track, int step, ParamType param) {
    if (track >= 0 && track < MAX_TRACKS && 
        step >= 0 && step < pattern.length &&
        param >= 0 && param < PARAM_COUNT) {
        return pattern.tracks[track].steps[step].hasParamLock[param];
    }
    return false;
}

float Sequencer::getParamLock(int track, int step, ParamType param) {
    if (track >= 0 && track < MAX_TRACKS && 
        step >= 0 && step < pattern.length &&
        param >= 0 && param < PARAM_COUNT) {
        return pattern.tracks[track].steps[step].paramLocks[param];
    }
    return 0.0f;
}

// Pattern management
void Sequencer::loadPattern(int patternNumber) {
    DEBUG_PRINTF("Sequencer: Loading pattern %d\n", patternNumber);
    
    char path[64];
    snprintf(path, sizeof(path), "%spattern%02d.json", PATTERNS_DIR, patternNumber);
    
    // TODO: Load pattern from SD card
    // For now, just set the pattern number
    currentPatternNumber = patternNumber;
}

void Sequencer::savePattern(int patternNumber) {
    DEBUG_PRINTF("Sequencer: Saving pattern %d\n", patternNumber);
    
    char path[64];
    snprintf(path, sizeof(path), "%spattern%02d.json", PATTERNS_DIR, patternNumber);
    
    // TODO: Save pattern to SD card
}

void Sequencer::copyPattern(int from, int to) {
    DEBUG_PRINTF("Sequencer: Copy pattern %d to %d\n", from, to);
    // TODO: Implement pattern copy
}

void Sequencer::clearPattern() {
    pattern.length = MAX_STEPS;
    pattern.swing = 0;
    pattern.bpm = 0; // Use global BPM
    
    for (int t = 0; t < MAX_TRACKS; t++) {
        pattern.tracks[t].muted = false;
        pattern.tracks[t].soloed = false;
        pattern.tracks[t].sourceSlot = t;
        pattern.tracks[t].volume = 1.0f;
        pattern.tracks[t].pan = 0.0f;
        
        for (int s = 0; s < MAX_STEPS; s++) {
            pattern.tracks[t].steps[s].active = false;
            pattern.tracks[t].steps[s].condition = TRIG_ALWAYS;
            pattern.tracks[t].steps[s].velocity = 127;
            pattern.tracks[t].steps[s].pitchOffset = 0;
            pattern.tracks[t].steps[s].sampleSlice = 0;
            
            for (int p = 0; p < PARAM_COUNT; p++) {
                pattern.tracks[t].steps[s].paramLocks[p] = 0.0f;
                pattern.tracks[t].steps[s].hasParamLock[p] = false;
            }
        }
    }
    
    DEBUG_PRINTLN("Sequencer: Pattern cleared");
}

int Sequencer::getCurrentPattern() {
    return currentPatternNumber;
}

// Fill mode
void Sequencer::setFillMode(bool enabled) {
    fillMode = enabled;
    DEBUG_PRINTF("Sequencer: Fill mode = %s\n", enabled ? "ON" : "OFF");
}

bool Sequencer::isFillMode() {
    return fillMode;
}
