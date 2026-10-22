/**
 * Oh My Ondas - System State
 * Shared state structure used by main.ino and display drivers
 */

#ifndef SYSTEM_STATE_H
#define SYSTEM_STATE_H

#include <Arduino.h>
#include "config.h"

struct GPSState {
    float lat = 0.0f;
    float lon = 0.0f;
    bool valid = false;
    unsigned long lastUpdate = 0;
    // Filled from the PA1010D (for MSG_GPS)
    float altM = 0.0f;
    float speedKnots = 0.0f;
    float headingDeg = 0.0f;
    uint8_t fixQuality = 0;      // 0 none, 1 GPS, 2 DGPS
    uint8_t sats = 0;
    uint32_t utc = 0;            // unix seconds, 0 if unknown
};

struct SystemState {
    SystemMode mode = MODE_LIVE;
    bool isPlaying = false;
    bool isRecording = false;
    bool shiftPressed = false;
    uint8_t currentPattern = 0;
    uint8_t currentScene = 0;
    float masterVolume = 0.8f;
    float bpm = 120.0f;
    GPSState gps;
};

#endif // SYSTEM_STATE_H
