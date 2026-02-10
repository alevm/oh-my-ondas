/**
 * Oh My Ondas - Sequencer Implementation
 * Octatrack-style step sequencer with parameter locks
 */

#include "sequencer.h"

static Step dummyStep;

Sequencer::Sequencer()
    : currentPatternNumber(0)
    , selectedTrack(0)
    , currentStep(0)
    , running(false)
    , fillMode(false)
    , globalBpm(120.0f)
    , lastStepTime(0)
    , stepInterval(125)
    , swingOffset(0)
    , triggerCallback(nullptr)
{
    clearPattern();
    memset(triggerCounts, 0, sizeof(triggerCounts));
}

void Sequencer::begin(float initialBpm) {
    DEBUG_PRINTLN("Sequencer: Initializing...");

    globalBpm = initialBpm;
    calculateStepInterval();

    loadPattern(0);

    DEBUG_PRINTLN("Sequencer: Ready");
}

void Sequencer::setTriggerCallback(StepTriggerCallback callback) {
    triggerCallback = callback;
}

void Sequencer::update() {
    if (!running) return;

    unsigned long now = millis();

    // Calculate effective interval for this step (swing offsets even steps)
    unsigned long effectiveInterval = stepInterval;
    if (pattern.swing > 0 && (currentStep % 2 == 1)) {
        // Swing delays odd steps (the "and" beats)
        effectiveInterval += (stepInterval * pattern.swing) / 200;
    }

    if (now - lastStepTime >= effectiveInterval) {
        lastStepTime = now;

        // Check if any track is soloed
        bool anySoloed = false;
        for (int t = 0; t < MAX_TRACKS; t++) {
            if (pattern.tracks[t].soloed) {
                anySoloed = true;
                break;
            }
        }

        // Process all tracks for current step
        for (int track = 0; track < MAX_TRACKS; track++) {
            if (pattern.tracks[track].muted) continue;
            if (anySoloed && !pattern.tracks[track].soloed) continue;

            if (evaluateTrigCondition(track, currentStep)) {
                triggerStep(track, currentStep);
            }
        }

        // Advance step
        currentStep = (currentStep + 1) % pattern.length;

        if (currentStep == 0) {
            memset(triggerCounts, 0, sizeof(triggerCounts));
        }
    }
}

void Sequencer::calculateStepInterval() {
    float bpm = (pattern.bpm > 0) ? pattern.bpm : globalBpm;
    stepInterval = (unsigned long)(60000.0f / bpm / 4.0f);
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
            return (step > 0) && pattern.tracks[track].steps[step - 1].active;
        case TRIG_NEI:
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

    if (triggerCallback) {
        triggerCallback(track, step, s);
    } else {
        DEBUG_PRINTF("Seq: Trigger T%d S%d (vel:%d pitch:%+d)\n",
                     track, step, s.velocity, s.pitchOffset);
    }
}

void Sequencer::applyParamLocks(int track, int step) {
    Step& s = pattern.tracks[track].steps[step];

    for (int p = 0; p < PARAM_COUNT; p++) {
        if (s.hasParamLock[p]) {
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

Step& Sequencer::getStepData(int track, int step) {
    if (track >= 0 && track < MAX_TRACKS && step >= 0 && step < pattern.length) {
        return pattern.tracks[track].steps[step];
    }
    return dummyStep;
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

    if (!SD.exists(path)) {
        DEBUG_PRINTF("Sequencer: Pattern file not found, using empty pattern\n");
        currentPatternNumber = patternNumber;
        return;
    }

    File file = SD.open(path);
    if (!file) {
        currentPatternNumber = patternNumber;
        return;
    }

    DynamicJsonDocument doc(8192);
    DeserializationError error = deserializeJson(doc, file);
    file.close();

    if (error) {
        DEBUG_PRINTF("Sequencer: JSON parse error: %s\n", error.c_str());
        currentPatternNumber = patternNumber;
        return;
    }

    pattern.length = doc["length"] | MAX_STEPS;
    pattern.swing = doc["swing"] | 0;
    pattern.bpm = doc["bpm"] | 0.0f;

    JsonArray tracks = doc["tracks"];
    for (int t = 0; t < MAX_TRACKS && t < (int)tracks.size(); t++) {
        JsonObject trk = tracks[t];
        pattern.tracks[t].muted = trk["muted"] | false;
        pattern.tracks[t].sourceSlot = trk["src"] | t;
        pattern.tracks[t].volume = trk["vol"] | 1.0f;
        pattern.tracks[t].pan = trk["pan"] | 0.0f;

        JsonArray steps = trk["steps"];
        for (int s = 0; s < MAX_STEPS && s < (int)steps.size(); s++) {
            if (steps[s].is<int>() && steps[s].as<int>() == 0) {
                // Inactive step (compact format)
                pattern.tracks[t].steps[s].active = false;
                continue;
            }

            JsonObject st = steps[s];
            pattern.tracks[t].steps[s].active = true;
            pattern.tracks[t].steps[s].velocity = st["v"] | 127;
            pattern.tracks[t].steps[s].condition = (TrigCondition)(st["c"] | 0);
            pattern.tracks[t].steps[s].pitchOffset = st["p"] | 0;

            // Load parameter locks (L0..Ln)
            for (int p = 0; p < PARAM_COUNT; p++) {
                char key[4];
                snprintf(key, sizeof(key), "L%d", p);
                if (st.containsKey(key)) {
                    pattern.tracks[t].steps[s].paramLocks[p] = st[key];
                    pattern.tracks[t].steps[s].hasParamLock[p] = true;
                }
            }
        }
    }

    currentPatternNumber = patternNumber;
    calculateStepInterval();
    DEBUG_PRINTF("Sequencer: Pattern %d loaded (%d steps)\n", patternNumber, pattern.length);
}

void Sequencer::savePattern(int patternNumber) {
    DEBUG_PRINTF("Sequencer: Saving pattern %d\n", patternNumber);

    char path[64];
    snprintf(path, sizeof(path), "%spattern%02d.json", PATTERNS_DIR, patternNumber);

    // Streaming JSON write for memory efficiency
    File file = SD.open(path, FILE_WRITE);
    if (!file) {
        DEBUG_PRINTF("Sequencer: Cannot open %s for writing\n", path);
        return;
    }

    file.print("{\"length\":");
    file.print(pattern.length);
    file.print(",\"swing\":");
    file.print(pattern.swing);
    file.print(",\"bpm\":");
    file.print(pattern.bpm);
    file.print(",\"tracks\":[");

    for (int t = 0; t < MAX_TRACKS; t++) {
        if (t > 0) file.print(",");
        Track& trk = pattern.tracks[t];

        file.print("{\"muted\":");
        file.print(trk.muted ? "true" : "false");
        file.print(",\"src\":");
        file.print(trk.sourceSlot);
        file.printf(",\"vol\":%.2f,\"pan\":%.2f", trk.volume, trk.pan);
        file.print(",\"steps\":[");

        for (int s = 0; s < pattern.length; s++) {
            if (s > 0) file.print(",");
            Step& st = trk.steps[s];

            if (!st.active) {
                file.print("0");
                continue;
            }

            file.print("{\"v\":");
            file.print(st.velocity);
            file.print(",\"c\":");
            file.print((int)st.condition);
            file.print(",\"p\":");
            file.print(st.pitchOffset);

            for (int p = 0; p < PARAM_COUNT; p++) {
                if (st.hasParamLock[p]) {
                    file.printf(",\"L%d\":%.2f", p, st.paramLocks[p]);
                }
            }

            file.print("}");
        }

        file.print("]}");
    }

    file.print("]}");
    file.close();

    DEBUG_PRINTF("Sequencer: Pattern %d saved\n", patternNumber);
}

void Sequencer::copyPattern(int from, int to) {
    DEBUG_PRINTF("Sequencer: Copy pattern %d to %d\n", from, to);
    loadPattern(from);
    savePattern(to);
}

void Sequencer::clearPattern() {
    pattern.length = MAX_STEPS;
    pattern.swing = 0;
    pattern.bpm = 0;

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

uint8_t Sequencer::getPatternLength() {
    return pattern.length;
}

// Fill mode
void Sequencer::setFillMode(bool enabled) {
    fillMode = enabled;
    DEBUG_PRINTF("Sequencer: Fill mode = %s\n", enabled ? "ON" : "OFF");
}

bool Sequencer::isFillMode() {
    return fillMode;
}
