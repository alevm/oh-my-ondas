/**
 * Oh My Ondas - LCD Display Driver
 * ILI9488 5" 480×320 SPI LCD — main UI display
 *
 * Uses ILI9341_t3 library (Teensy-optimized, works with ILI9488 in 16-bit mode)
 * Screens: MAIN, PATTERN, FX, SYNTH, SCENE, MIXER, SETTINGS, MESSAGE
 *
 * NOTE: ILI9341_t3.h is only included in lcd_display.cpp to avoid
 * Adafruit_GFX_Button class redefinition conflict with Adafruit_SSD1306.
 */

#ifndef LCD_DISPLAY_H
#define LCD_DISPLAY_H

#include <Arduino.h>
#include "config.h"
#include "system_state.h"

// Forward declarations — avoids header conflict
class ILI9341_t3;
class Sequencer;
class FXEngine;
class SamplingEngine;
class SynthVoice;
class SceneManager;
class InputManager;

// Color palette (RGB565)
#define COL_BG        0x0000  // Black
#define COL_ACCENT    0x07E0  // Green (petrol green)
#define COL_TEXT      0xFFFF  // White
#define COL_DIM       0x7BEF  // Grey
#define COL_ACTIVE    0x07FF  // Cyan
#define COL_REC       0xF800  // Red
#define COL_WARN      0xFD20  // Orange
#define COL_HEADER_BG 0x0841  // Dark grey
#define COL_STEP_ON   0x07E0  // Green
#define COL_STEP_OFF  0x2104  // Dark grey
#define COL_STEP_CUR  0xFFE0  // Yellow
#define COL_FADER_BG  0x2104  // Dark grey
#define COL_FADER_FG  0x07E0  // Green

enum LCDScreen {
    LCD_MAIN = 0,
    LCD_PATTERN,
    LCD_FX,
    LCD_SYNTH,
    LCD_SCENE,
    LCD_MIXER,
    LCD_SETTINGS,
    LCD_COUNT
};

class LCDDisplay {
public:
    LCDDisplay();
    ~LCDDisplay();

    void begin();
    void update(SystemState& state, Sequencer& seq, FXEngine& fx,
                SamplingEngine& sampler, SynthVoice& synth,
                SceneManager& scenes, InputManager& input);

    void setScreen(LCDScreen screen);
    LCDScreen getScreen();

    void showMessage(const char* msg, int durationMs = 1500);
    void showError(const char* msg);
    void invalidate();

private:
    ILI9341_t3* tft;
    LCDScreen currentScreen;
    LCDScreen lastScreen;
    bool needsFullRedraw;

    char msgBuffer[64];
    unsigned long msgStart;
    int msgDuration;
    bool msgActive;

    float lastBPM;
    float lastVolume;
    int   lastStep;
    int   lastMode;
    bool  lastPlaying;
    bool  lastRecording;

    void drawHeader(SystemState& state);
    void drawMainScreen(SystemState& state, Sequencer& seq,
                        SamplingEngine& sampler, FXEngine& fx);
    void drawPatternScreen(SystemState& state, Sequencer& seq);
    void drawFXScreen(SystemState& state, FXEngine& fx);
    void drawSynthScreen(SystemState& state, SynthVoice& synth);
    void drawSceneScreen(SystemState& state, SceneManager& scenes);
    void drawMixerScreen(SystemState& state, SamplingEngine& sampler,
                         InputManager& input);
    void drawSettingsScreen(SystemState& state);
    void drawMessageOverlay();

    void drawBar(int x, int y, int w, int h, float value, uint16_t fg, uint16_t bg);
    void drawStepGrid(int x, int y, Sequencer& seq, int track);
    void drawKnob(int cx, int cy, int r, float value, const char* label);
    void drawFader(int x, int y, int w, int h, float value, const char* label);

    const char* getModeString(int mode);
    const char* getScreenName(LCDScreen screen);
};

#endif // LCD_DISPLAY_H
