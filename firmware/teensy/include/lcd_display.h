/**
 * Oh My Ondas - LCD Display Driver
 * Adafruit 2.8" ILI9341 320x240 on SPI1 — main UI display
 *
 * Uses Adafruit_ILI9341 (the driver proven on the bench with SPI1 pins).
 * Screens: MAIN, PATTERN, FX, SYNTH, SCENE, MIXER, SETTINGS, RADIO, SENSE, MESSAGE
 * SENSE: live layer-1 stats (bands, features, radio, link, CPU/memory, plan);
 * its text is redrawn character by character, only where it changed.
 * Header: link indicator "W S" (WiFi, server) from MSG_LINK_STATE.
 */

#ifndef LCD_DISPLAY_H
#define LCD_DISPLAY_H

#include <Arduino.h>
#include "config.h"
#include "system_state.h"

// Forward declarations — avoids header conflict
class Adafruit_ILI9341;
class Sequencer;
class FXEngine;
class SamplingEngine;
class SynthVoice;
class SceneManager;
class InputManager;
class Radio;
class FeatureExtractor;
class CaptureStore;
class EspLink;
class PlanRenderer;
class ContinuousMapper;
class MidiIO;
class MotionSensors;

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
    LCD_RADIO,
    LCD_SENSE,
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

    void setRadio(Radio* r) { radio = r; }
    void setSense(FeatureExtractor* fe, CaptureStore* cs, EspLink* link,
                  PlanRenderer* pr, ContinuousMapper* mp, MidiIO* midi) {
        features = fe; captures = cs; espLink = link; renderer = pr; mapper = mp; midiIO = midi;
    }
    void setMotion(MotionSensors* m, const bool* gestures) { motion = m; gesturesOn = gestures; }
    void setI2CScan(const char* s) { i2cScan = s; }
    void setScreen(LCDScreen screen);
    LCDScreen getScreen();

    void showMessage(const char* msg, int durationMs = 1500);
    void showError(const char* msg);
    void invalidate();

private:
    Adafruit_ILI9341* tft;
    Radio*   radio;
    char     lastRadioSig[48];   // redraw the RAD screen only when this changes
    FeatureExtractor* features;
    CaptureStore*     captures;
    EspLink*          espLink;
    PlanRenderer*     renderer;
    ContinuousMapper* mapper;
    MidiIO*           midiIO;
    MotionSensors*    motion;
    const bool*       gesturesOn;
    const char*       i2cScan;      // boot scan of Wire2, shown on SENSE
    int      lastLinkSig;        // header link indicator
    uint32_t lastSenseFrame;
    static const int SENSE_LINES = 16;
    static const int SENSE_COLS  = 53;
    char     senseText[SENSE_LINES][SENSE_COLS + 1];
    uint16_t senseColor[SENSE_LINES];
    int8_t   senseBars[32 + 12];  // drawn heights of band + chroma bars
    unsigned long lastHealthCheck;
    LCDScreen currentScreen;
    LCDScreen lastScreen;
    bool needsFullRedraw;

    char msgBuffer[64];
    unsigned long msgStart;
    int msgDuration;
    bool msgActive;
    int16_t msgBoxX, msgBoxY, msgBoxW, msgBoxH;   // box on the glass, W 0 = none

    static const int BODY_Y  = 25;  // below the header bar and its divider
    static const int SWEEP_H = 27;  // body cleared in 8 strips of 27 rows, one per frame
    int8_t sweepStrip;              // next strip to clear, -1 = none

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
    void drawRadioScreen();
    void drawSenseScreen();
    void senseLine(int line, uint16_t color, const char* fmt, ...);
    void drawLinkIndicator();
    void drawMessageOverlay();
    void messageBox(int16_t& x, int16_t& y, int16_t& w, int16_t& h);
    void clearMessageBox();
    void resetDrawCache();
    void checkHealth();

    void drawBar(int x, int y, int w, int h, float value, uint16_t fg, uint16_t bg);
    void drawStepGrid(int x, int y, Sequencer& seq, int track);
    void drawKnob(int cx, int cy, int r, float value, const char* label);
    void drawFader(int x, int y, int w, int h, float value, const char* label);

    const char* getModeString(int mode);
    const char* getScreenName(LCDScreen screen);
};

#endif // LCD_DISPLAY_H
