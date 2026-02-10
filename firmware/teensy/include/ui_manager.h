/**
 * Oh My Ondas - UI Manager
 * Display and LED control with real subsystem data
 */

#ifndef UI_MANAGER_H
#define UI_MANAGER_H

#include <Arduino.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_NeoPixel.h>
#include "config.h"

// Forward declarations
struct SystemState;
class Sequencer;
class FXEngine;
class SamplingEngine;
class SceneManager;

enum UIScreen {
    SCREEN_MAIN,
    SCREEN_PATTERN,
    SCREEN_FX,
    SCREEN_SCENE,
    SCREEN_SETTINGS,
    SCREEN_MESSAGE
};

class UIManager {
public:
    UIManager();

    void begin(Adafruit_SSD1306* display, Adafruit_NeoPixel* leds);
    void update(SystemState& state, Sequencer& seq, FXEngine& fx,
                SamplingEngine& sampler, SceneManager& scenes);

    // Screen control
    void setScreen(UIScreen screen);
    UIScreen getCurrentScreen();

    // Messages
    void showMessage(const char* message, int durationMs = 1000);
    void showError(const char* error);
    void clearMessage();

    // Display helpers
    void drawWaveform(int16_t* samples, int count, int x, int y, int width, int height);
    void drawVUMeter(float level, int x, int y, int width, int height);
    void drawProgress(float progress, int x, int y, int width);
    void drawPattern(int currentStep, bool* steps, int stepCount);

    // LED control
    void setLEDColor(int led, uint32_t color);
    void setAllLEDs(uint32_t color);
    void setLEDBrightness(uint8_t brightness);

private:
    Adafruit_SSD1306* display;
    Adafruit_NeoPixel* leds;

    UIScreen currentScreen;
    char messageBuffer[64];
    unsigned long messageStartTime;
    int messageDuration;
    bool messageActive;

    void drawMainScreen(SystemState& state, Sequencer& seq, SamplingEngine& sampler);
    void drawPatternScreen(SystemState& state, Sequencer& seq);
    void drawFXScreen(SystemState& state, FXEngine& fx);
    void drawSceneScreen(SystemState& state, SceneManager& scenes);
    void drawSettingsScreen(SystemState& state);
    void drawMessageOverlay();

    void drawHeader(SystemState& state);
    void drawFooter(SystemState& state);

    const char* getModeString(int mode);
};

#endif // UI_MANAGER_H
