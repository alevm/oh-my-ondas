/**
 * Oh My Ondas - Scene Manager Implementation
 * Save/recall/morph complete mixer+FX+tempo snapshots
 */

#include "scene_manager.h"

SceneManager::SceneManager() {
    memset(saved, 0, sizeof(saved));
}

void SceneManager::begin() {
    loadAllFromSD();
    DEBUG_PRINTLN("SceneManager: Ready");
}

float SceneManager::lerp(float a, float b, float t) {
    return a + (b - a) * t;
}

void SceneManager::saveScene(int slot, const Scene& scene) {
    if (slot < 0 || slot >= MAX_SCENES) return;

    scenes[slot] = scene;
    saved[slot] = true;

    saveAllToSD();

    DEBUG_PRINTF("SceneManager: Saved scene %d\n", slot);
}

bool SceneManager::recallScene(int slot, Scene& scene) {
    if (slot < 0 || slot >= MAX_SCENES || !saved[slot]) return false;

    // Snapshot current state for morphing
    currentSnapshot = scene;

    scene = scenes[slot];

    DEBUG_PRINTF("SceneManager: Recalled scene %d\n", slot);
    return true;
}

bool SceneManager::morphTo(int targetSlot, float progress, Scene& result) {
    if (targetSlot < 0 || targetSlot >= MAX_SCENES || !saved[targetSlot]) return false;

    progress = constrain(progress, 0.0f, 1.0f);
    Scene& target = scenes[targetSlot];

    result.masterVolume = lerp(currentSnapshot.masterVolume, target.masterVolume, progress);
    result.bpm = lerp(currentSnapshot.bpm, target.bpm, progress);
    result.fxMix = lerp(currentSnapshot.fxMix, target.fxMix, progress);

    for (int i = 0; i < MAX_TRACKS; i++) {
        result.trackVolumes[i] = lerp(currentSnapshot.trackVolumes[i], target.trackVolumes[i], progress);
        // Mutes snap at 50% progress
        result.trackMutes[i] = (progress < 0.5f) ? currentSnapshot.trackMutes[i] : target.trackMutes[i];
    }

    for (int i = 0; i < 3; i++) {
        result.fxParams[i] = lerp(currentSnapshot.fxParams[i], target.fxParams[i], progress);
    }

    // FX type and pattern snap at 50%
    result.currentFX = (progress < 0.5f) ? currentSnapshot.currentFX : target.currentFX;
    result.patternNumber = (progress < 0.5f) ? currentSnapshot.patternNumber : target.patternNumber;

    return true;
}

bool SceneManager::isSceneSaved(int slot) {
    if (slot < 0 || slot >= MAX_SCENES) return false;
    return saved[slot];
}

void SceneManager::saveAllToSD() {
    File file = SD.open("/presets/scenes.json", FILE_WRITE);
    if (!file) {
        DEBUG_PRINTLN("SceneManager: Cannot write scenes.json");
        return;
    }

    file.print("[");
    for (int s = 0; s < MAX_SCENES; s++) {
        if (s > 0) file.print(",");

        if (!saved[s]) {
            file.print("null");
            continue;
        }

        Scene& sc = scenes[s];
        file.print("{\"mv\":");
        file.print(sc.masterVolume, 2);
        file.print(",\"bpm\":");
        file.print(sc.bpm, 1);
        file.print(",\"fx\":");
        file.print(sc.currentFX);
        file.print(",\"pat\":");
        file.print(sc.patternNumber);
        file.print(",\"fxm\":");
        file.print(sc.fxMix, 2);

        file.print(",\"fp\":[");
        for (int i = 0; i < 3; i++) {
            if (i > 0) file.print(",");
            file.print(sc.fxParams[i], 2);
        }
        file.print("]");

        file.print(",\"tv\":[");
        for (int i = 0; i < MAX_TRACKS; i++) {
            if (i > 0) file.print(",");
            file.print(sc.trackVolumes[i], 2);
        }
        file.print("]");

        file.print(",\"tm\":[");
        for (int i = 0; i < MAX_TRACKS; i++) {
            if (i > 0) file.print(",");
            file.print(sc.trackMutes[i] ? 1 : 0);
        }
        file.print("]}");
    }
    file.print("]");
    file.close();

    DEBUG_PRINTLN("SceneManager: Saved to SD");
}

void SceneManager::loadAllFromSD() {
    if (!SD.exists("/presets/scenes.json")) {
        DEBUG_PRINTLN("SceneManager: No scenes.json found");
        return;
    }

    File file = SD.open("/presets/scenes.json");
    if (!file) return;

    DynamicJsonDocument doc(4096);
    DeserializationError error = deserializeJson(doc, file);
    file.close();

    if (error) {
        DEBUG_PRINTF("SceneManager: JSON parse error: %s\n", error.c_str());
        return;
    }

    JsonArray arr = doc.as<JsonArray>();
    for (int s = 0; s < MAX_SCENES && s < (int)arr.size(); s++) {
        if (arr[s].isNull()) {
            saved[s] = false;
            continue;
        }

        JsonObject obj = arr[s];
        scenes[s].masterVolume = obj["mv"] | 0.8f;
        scenes[s].bpm = obj["bpm"] | 120.0f;
        scenes[s].currentFX = obj["fx"] | 0;
        scenes[s].patternNumber = obj["pat"] | 0;
        scenes[s].fxMix = obj["fxm"] | 0.0f;

        JsonArray fp = obj["fp"];
        for (int i = 0; i < 3 && i < (int)fp.size(); i++) {
            scenes[s].fxParams[i] = fp[i];
        }

        JsonArray tv = obj["tv"];
        for (int i = 0; i < MAX_TRACKS && i < (int)tv.size(); i++) {
            scenes[s].trackVolumes[i] = tv[i];
        }

        JsonArray tm = obj["tm"];
        for (int i = 0; i < MAX_TRACKS && i < (int)tm.size(); i++) {
            scenes[s].trackMutes[i] = (tm[i].as<int>() != 0);
        }

        saved[s] = true;
    }

    DEBUG_PRINTLN("SceneManager: Loaded from SD");
}
