/**
 * Oh My Ondas - Scene Manager
 * Save/recall/morph complete mixer+FX+tempo snapshots
 */

#ifndef SCENE_MANAGER_H
#define SCENE_MANAGER_H

#include <Arduino.h>
#include <SD.h>
#include <ArduinoJson.h>
#include "config.h"

struct Scene {
    float masterVolume = 0.8f;
    float trackVolumes[MAX_TRACKS] = {1,1,1,1,1,1,1,1};
    bool trackMutes[MAX_TRACKS] = {};
    int currentFX = 0;
    float fxParams[3] = {0.5f, 0.5f, 0.0f};
    float fxMix = 0.0f;
    float bpm = 120.0f;
    int patternNumber = 0;
};

class SceneManager {
public:
    SceneManager();

    void begin();

    void saveScene(int slot, const Scene& scene);
    bool recallScene(int slot, Scene& scene);
    bool morphTo(int targetSlot, float progress, Scene& result);
    bool isSceneSaved(int slot);

    void saveAllToSD();
    void loadAllFromSD();

private:
    Scene scenes[MAX_SCENES];
    bool saved[MAX_SCENES];
    Scene currentSnapshot;  // For morphing: the state when morph started

    float lerp(float a, float b, float t);
};

#endif // SCENE_MANAGER_H
