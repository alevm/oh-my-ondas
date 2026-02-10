/**
 * Oh My Ondas - Sampling Engine Implementation
 * 8-voice sample playback with touch triggers
 */

#include "sampling_engine.h"

SamplingEngine::SamplingEngine()
    : currentBank(0)
    , players(nullptr)
    , amps(nullptr)
{
    for (int i = 0; i < MAX_TRACKS; i++) {
        initializeSample(i);
    }
}

void SamplingEngine::begin(AudioPlaySdWav* playerArray, AudioAmplifier* ampArray) {
    players = playerArray;
    amps = ampArray;

    DEBUG_PRINTLN("SamplingEngine: Initializing...");

    // Load default bank (bank 0)
    loadBank(0);

    DEBUG_PRINTLN("SamplingEngine: Ready");
}

void SamplingEngine::update() {
    if (!players) return;

    // Poll player states — detect finished playback, re-trigger loops
    for (int i = 0; i < MAX_TRACKS; i++) {
        if (samples[i].playing) {
            if (!players[i].isPlaying()) {
                if (samples[i].looping && samples[i].loaded) {
                    // Re-trigger looping sample
                    players[i].play(samples[i].filename);
                    amps[i].gain(samples[i].volume);
                } else {
                    samples[i].playing = false;
                }
            }
        }
    }
}

void SamplingEngine::initializeSample(int slot) {
    if (!validateSlot(slot)) return;

    samples[slot].filename[0] = '\0';
    samples[slot].loaded = false;
    samples[slot].playing = false;
    samples[slot].looping = false;
    samples[slot].pitch = 1.0f;
    samples[slot].volume = 1.0f;
    samples[slot].pan = 0.0f;
    samples[slot].startPos = 0;
    samples[slot].endPos = 0;
    samples[slot].length = 0;
}

bool SamplingEngine::validateSlot(int slot) {
    return (slot >= 0 && slot < MAX_TRACKS);
}

bool SamplingEngine::loadSample(int slot, const char* filename) {
    if (!validateSlot(slot)) return false;

    if (!SD.exists(filename)) {
        DEBUG_PRINTF("SamplingEngine: File not found: %s\n", filename);
        return false;
    }

    File file = SD.open(filename);
    if (!file) {
        DEBUG_PRINTF("SamplingEngine: Cannot open file: %s\n", filename);
        return false;
    }

    strncpy(samples[slot].filename, filename, 63);
    samples[slot].filename[63] = '\0';

    samples[slot].length = file.size();
    samples[slot].startPos = 0;
    samples[slot].endPos = samples[slot].length;
    samples[slot].loaded = true;

    file.close();

    DEBUG_PRINTF("SamplingEngine: Loaded slot %d: %s (%lu bytes)\n",
                 slot, filename, samples[slot].length);

    return true;
}

void SamplingEngine::unloadSample(int slot) {
    if (!validateSlot(slot)) return;

    stop(slot);
    initializeSample(slot);

    DEBUG_PRINTF("SamplingEngine: Unloaded slot %d\n", slot);
}

bool SamplingEngine::isSampleLoaded(int slot) {
    if (!validateSlot(slot)) return false;
    return samples[slot].loaded;
}

void SamplingEngine::trigger(int slot) {
    if (!validateSlot(slot)) return;
    if (!samples[slot].loaded) {
        DEBUG_PRINTF("SamplingEngine: Slot %d not loaded\n", slot);
        return;
    }

    if (players) {
        players[slot].play(samples[slot].filename);
        amps[slot].gain(samples[slot].volume);
    }

    samples[slot].playing = true;

    DEBUG_PRINTF("SamplingEngine: Triggered slot %d\n", slot);
}

void SamplingEngine::stop(int slot) {
    if (!validateSlot(slot)) return;

    if (players) {
        players[slot].stop();
    }

    samples[slot].playing = false;

    DEBUG_PRINTF("SamplingEngine: Stopped slot %d\n", slot);
}

void SamplingEngine::stopAll() {
    for (int i = 0; i < MAX_TRACKS; i++) {
        stop(i);
    }
    DEBUG_PRINTLN("SamplingEngine: Stopped all");
}

void SamplingEngine::setVolume(int slot, float volume) {
    if (!validateSlot(slot)) return;
    samples[slot].volume = constrain(volume, 0.0f, 1.0f);
    if (amps && samples[slot].playing) {
        amps[slot].gain(samples[slot].volume);
    }
}

void SamplingEngine::setPitch(int slot, float pitch) {
    if (!validateSlot(slot)) return;
    samples[slot].pitch = constrain(pitch, 0.1f, 4.0f);
    // Note: AudioPlaySdWav doesn't support variable-rate playback.
    // Pitch changes take effect on next trigger.
}

void SamplingEngine::setPan(int slot, float pan) {
    if (!validateSlot(slot)) return;
    samples[slot].pan = constrain(pan, -1.0f, 1.0f);
}

void SamplingEngine::setLoop(int slot, bool loop) {
    if (!validateSlot(slot)) return;
    samples[slot].looping = loop;
}

void SamplingEngine::setStartPos(int slot, uint32_t pos) {
    if (!validateSlot(slot)) return;
    samples[slot].startPos = min(pos, samples[slot].length);
}

void SamplingEngine::setEndPos(int slot, uint32_t pos) {
    if (!validateSlot(slot)) return;
    samples[slot].endPos = min(pos, samples[slot].length);
}

bool SamplingEngine::isPlaying(int slot) {
    if (!validateSlot(slot)) return false;
    // Check actual player state if available
    if (players) {
        return players[slot].isPlaying();
    }
    return samples[slot].playing;
}

bool SamplingEngine::isLooping(int slot) {
    if (!validateSlot(slot)) return false;
    return samples[slot].looping;
}

float SamplingEngine::getVolume(int slot) {
    if (!validateSlot(slot)) return 0.0f;
    return samples[slot].volume;
}

float SamplingEngine::getPitch(int slot) {
    if (!validateSlot(slot)) return 1.0f;
    return samples[slot].pitch;
}

void SamplingEngine::loadBank(int bankNumber) {
    DEBUG_PRINTF("SamplingEngine: Loading bank %d\n", bankNumber);

    char bankPath[64];
    snprintf(bankPath, sizeof(bankPath), "%sbank%02d/", SAMPLES_DIR, bankNumber);

    if (!SD.exists(bankPath)) {
        DEBUG_PRINTF("SamplingEngine: Bank %d not found\n", bankNumber);
        return;
    }

    for (int i = 0; i < MAX_TRACKS; i++) {
        char samplePath[128];
        snprintf(samplePath, sizeof(samplePath), "%ssample%02d.wav", bankPath, i + 1);

        if (SD.exists(samplePath)) {
            loadSample(i, samplePath);
        } else {
            unloadSample(i);
        }
    }

    currentBank = bankNumber;
    DEBUG_PRINTF("SamplingEngine: Bank %d loaded\n", bankNumber);
}

void SamplingEngine::saveBank(int bankNumber) {
    DEBUG_PRINTF("SamplingEngine: Saving bank %d\n", bankNumber);

    char bankPath[64];
    snprintf(bankPath, sizeof(bankPath), "%sbank%02d", SAMPLES_DIR, bankNumber);

    if (!SD.exists(bankPath)) {
        SD.mkdir(bankPath);
    }

    char metaPath[128];
    snprintf(metaPath, sizeof(metaPath), "%s/bank.json", bankPath);

    File metaFile = SD.open(metaPath, FILE_WRITE);
    if (metaFile) {
        metaFile.println("{");
        metaFile.printf("  \"bank\": %d,\n", bankNumber);
        metaFile.println("  \"samples\": [");

        for (int i = 0; i < MAX_TRACKS; i++) {
            if (samples[i].loaded) {
                metaFile.printf("    {\"slot\": %d, \"file\": \"%s\", \"volume\": %.2f, \"pitch\": %.2f}%s\n",
                               i, samples[i].filename, samples[i].volume, samples[i].pitch,
                               (i < MAX_TRACKS - 1) ? "," : "");
            }
        }

        metaFile.println("  ]");
        metaFile.println("}");
        metaFile.close();
    }

    DEBUG_PRINTF("SamplingEngine: Bank %d saved\n", bankNumber);
}

int SamplingEngine::getCurrentBank() {
    return currentBank;
}
