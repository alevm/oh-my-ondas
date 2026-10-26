/**
 * Oh My Ondas - LCD Display Implementation
 * ILI9341 2.8" 320x240 main UI display on SPI1
 */

#include <SPI.h>
#include <Adafruit_ILI9341.h>
#include "lcd_display.h"
#include "system_state.h"
#include "sequencer.h"
#include "fx_engine.h"
#include "sampling_engine.h"
#include "synth_voice.h"
#include "scene_manager.h"
#include "input_manager.h"
#include "radio.h"
#include <stdarg.h>
#include "feature_extractor.h"
#include "capture_store.h"
#include "esp_link.h"
#include "plan_renderer.h"
#include "continuous_mapper.h"
#include "midi_io.h"
#include "motion_sensors.h"


LCDDisplay::LCDDisplay()
    : tft(nullptr)
    , radio(nullptr)
    , features(nullptr), captures(nullptr), espLink(nullptr)
    , renderer(nullptr), mapper(nullptr), midiIO(nullptr), motion(nullptr), gesturesOn(nullptr), i2cScan(nullptr)
    , lastLinkSig(-1), lastSenseFrame(0)
    , lastHealthCheck(0)
    , currentScreen(LCD_MAIN)
    , lastScreen(LCD_COUNT)  // Force initial draw
    , needsFullRedraw(true)
    , lastScreenSig(0), screenDirty(true), msgDrawn(false)
    , msgStart(0), msgDuration(0), msgActive(false)
    , msgBoxX(0), msgBoxY(0), msgBoxW(0), msgBoxH(0)
    , sweepStrip(-1)
    , lastBPM(0), lastVolume(0), lastStep(-1), lastMode(-1)
    , lastPlaying(false), lastRecording(false)
{
    msgBuffer[0] = '\0';
    lastRadioSig[0] = '\0';
    memset(senseText, 0, sizeof(senseText));
    memset(senseColor, 0, sizeof(senseColor));
    memset(senseBars, -1, sizeof(senseBars));
}

LCDDisplay::~LCDDisplay() {
    delete tft;
}

FLASHMEM void LCDDisplay::begin() {
    SPI1.setMISO(TFT_MISO);  // default MISO1 is pin 1, under the Audio Shield
    tft = new Adafruit_ILI9341(&SPI1, TFT_DC, TFT_CS, TFT_RST);
    tft->begin(TFT_SPI_HZ);  // no argument = 8 MHz on Teensy; see config.h
    tft->setRotation(TFT_ROTATION);  // Landscape: 320x240
    tft->fillScreen(COL_BG);

    // Splash screen
    tft->setCursor(61, 90);
    tft->setTextColor(COL_ACCENT);
    tft->setTextSize(3);
    tft->print("OH MY ONDAS");
    tft->setCursor(136, 125);
    tft->setTextSize(2);
    tft->setTextColor(COL_DIM);
    tft->print("v" VERSION);
    tft->setCursor(85, 150);
    tft->setTextSize(1);
    tft->print("Location-aware instrument");

    DEBUG_PRINTLN("LCDDisplay: Initialized (320x240)");
}

void LCDDisplay::update(SystemState& state, Sequencer& seq, FXEngine& fx,
                         SamplingEngine& sampler, SynthVoice& synth,
                         SceneManager& scenes, InputManager& input) {
    if (!tft) return;
    checkHealth();

    // Full-screen fills block the loop (320x240 px: ~61 ms at 20 MHz, ~154 ms
    // at 8 MHz), so only an LCD re-init clears everything. A screen change
    // clears the body, an expired or replaced message only its own box.
    if (needsFullRedraw) {
        tft->fillScreen(COL_BG);
        needsFullRedraw = false;
        lastScreen = currentScreen;
        msgBoxW = 0;
        sweepStrip = -1;
        resetDrawCache();
    } else if (currentScreen != lastScreen) {
        tft->fillRect(0, BODY_Y, LCD_WIDTH, LCD_HEIGHT - BODY_Y, COL_BG);
        lastScreen = currentScreen;
        msgBoxW = 0;
        sweepStrip = -1;
        resetDrawCache();   // the header names the screen: it redraws too
    }

    // Message expired: give its box back to the screen drawn below
    if (msgActive && (millis() - msgStart > (unsigned long)msgDuration)) {
        msgActive = false;
        // Screens that repaint every frame draw some elements only in some
        // states (step grid while playing, filled vs outlined boxes); the
        // old full redraw on expiry also wiped what those left behind. Do
        // that over the next 8 frames, one strip each (~7 ms at 20 MHz).
        if (currentScreen != LCD_RADIO && currentScreen != LCD_SENSE) sweepStrip = 0;
    }
    if (msgBoxW) {
        int16_t x, y, w, h;
        messageBox(x, y, w, h);
        if (!msgActive || x != msgBoxX || w != msgBoxW) clearMessageBox();
    }
    if (sweepStrip >= 0) {
        int y0 = BODY_Y + sweepStrip * SWEEP_H;
        int h = LCD_HEIGHT - y0;
        if (h > SWEEP_H) h = SWEEP_H;
        tft->fillRect(0, y0, LCD_WIDTH, h, COL_BG);
        if (++sweepStrip * SWEEP_H >= LCD_HEIGHT - BODY_Y) sweepStrip = -1;
    }

    drawHeader(state);

    uint32_t sig = screenSignature(state, seq, fx, sampler, synth, scenes, input);
    bool redraw = screenDirty || sweepStrip >= 0 || sig != lastScreenSig;
    lastScreenSig = sig;
    screenDirty = false;
    if (currentScreen == LCD_RADIO || currentScreen == LCD_SENSE) redraw = true;   // they diff themselves

    if (redraw) switch (currentScreen) {
        case LCD_MAIN:     drawMainScreen(state, seq, sampler, fx); break;
        case LCD_PATTERN:  drawPatternScreen(state, seq);           break;
        case LCD_FX:       drawFXScreen(state, fx);                 break;
        case LCD_SYNTH:    drawSynthScreen(state, synth);           break;
        case LCD_SCENE:    drawSceneScreen(state, scenes);          break;
        case LCD_MIXER:    drawMixerScreen(state, sampler, input);  break;
        case LCD_SETTINGS: drawSettingsScreen(state);               break;
        case LCD_RADIO:    drawRadioScreen();                       break;
        case LCD_SENSE:    drawSenseScreen();                       break;
        default: break;
    }

    // The box goes back on top only when the screen under it was repainted
    if (msgActive && (redraw || !msgDrawn)) {
        drawMessageOverlay();
        msgDrawn = true;
    }
}

namespace {
// FNV-1a over the values a screen shows
struct Sig {
    uint32_t h = 2166136261u;
    void add(int32_t v) {
        for (int i = 0; i < 4; i++) h = (h ^ (uint8_t)(v >> (8 * i))) * 16777619u;
    }
    void addPct(float v) { add((int32_t)(v * 100)); }
};
}

// What the current screen would draw, as one number. Values are taken at the
// resolution they are printed with, so noise below it causes no redraw.
uint32_t LCDDisplay::screenSignature(SystemState& state, Sequencer& seq, FXEngine& fx,
                                     SamplingEngine& sampler, SynthVoice& synth,
                                     SceneManager& scenes, InputManager& input) {
    Sig s;
    s.add(currentScreen);
    switch (currentScreen) {
        case LCD_MAIN: {
            s.addPct(state.masterVolume);
            s.add(state.currentPattern);
            s.add(state.currentScene);
            s.add(state.isPlaying);
            if (state.isPlaying) {
                int track = seq.getSelectedTrack();
                s.add(seq.getCurrentStep());
                s.add(seq.getPatternLength());
                s.add(track);
                for (int i = 0; i < seq.getPatternLength(); i++) s.add(seq.getStep(track, i));
            }
            s.add(fx.getCurrentEffect());
            s.addPct(fx.getMix());
            for (int i = 0; i < MAX_TRACKS; i++) s.add(sampler.isPlaying(i) * 2 + sampler.isSampleLoaded(i));
            s.add(state.gps.valid);
            if (state.gps.valid) {
                s.add((int32_t)lroundf(state.gps.lat * 10000));
                s.add((int32_t)lroundf(state.gps.lon * 10000));
            }
            break;
        }
        case LCD_PATTERN: {
            int track = seq.getSelectedTrack();
            int len = seq.getPatternLength();
            s.add(track);
            s.add(len);
            s.add(state.isPlaying ? seq.getCurrentStep() : -1);
            for (int i = 0; i < MAX_TRACKS; i++) s.add(seq.isTrackMuted(i));
            s.add(seq.isTrackSoloed(track));
            for (int i = 0; i < len; i++) s.add(seq.getStep(track, i) * 256 + seq.getTrigCondition(track, i));
            s.add(seq.getSwing());
            break;
        }
        case LCD_FX:
            s.add(fx.getCurrentEffect());
            s.add(fx.isEnabled());
            for (int i = 0; i < 3; i++) s.addPct(fx.getParam(i));
            s.addPct(fx.getMix());
            s.add((int32_t)lroundf(fx.getLFORate() * 10));
            s.addPct(fx.getLFODepth());
            break;
        case LCD_SYNTH:
            s.add(synth.isActive());
            break;
        case LCD_SCENE:
            s.add(state.currentScene);
            for (int i = 0; i < MAX_SCENES; i++) s.add(scenes.isSceneSaved(i));
            break;
        case LCD_MIXER:
            for (int i = 0; i < FADER_COUNT; i++) s.addPct(input.getFaderValue(i));
            s.addPct(state.masterVolume);
            break;
        case LCD_SETTINGS:
            s.add((int32_t)AudioProcessorUsage());
            s.add(AudioMemoryUsage());
            s.add(state.currentPattern);
            s.add(state.currentScene);
            s.add(state.gps.valid);
            if (state.gps.valid) {
                s.add((int32_t)lroundf(state.gps.lat * 1e6f));
                s.add((int32_t)lroundf(state.gps.lon * 1e6f));
                s.add((millis() - state.gps.lastUpdate) / 1000);
            }
            break;
        default:
            break;
    }
    return s.h;
}

void LCDDisplay::setScreen(LCDScreen screen) {
    if (screen != currentScreen) {
        currentScreen = screen;
    }
}

LCDScreen LCDDisplay::getScreen() {
    return currentScreen;
}

void LCDDisplay::showMessage(const char* msg, int durationMs) {
    strncpy(msgBuffer, msg, 63);
    msgBuffer[63] = '\0';
    msgStart = millis();
    msgDuration = durationMs;
    msgActive = true;
    msgDrawn = false;
}

void LCDDisplay::showError(const char* msg) {
    showMessage(msg, 3000);
}

void LCDDisplay::invalidate() {
    needsFullRedraw = true;
}

// Forget what is on the glass: header and the change-only screens redraw
void LCDDisplay::resetDrawCache() {
    lastBPM = -1;
    lastVolume = -1;
    lastStep = -1;
    lastMode = -1;
    lastRadioSig[0] = '\0';
    memset(senseText, 0, sizeof(senseText));
    memset(senseBars, -1, sizeof(senseBars));
    lastSenseFrame = 0;
    screenDirty = true;
}

// The LCD sometimes resets when its jumpers move (power mode reads 0x00
// instead of 0x94, screen goes white): re-initialise it and redraw.
void LCDDisplay::checkHealth() {
    if (millis() - lastHealthCheck < 1000) return;
    lastHealthCheck = millis();
    uint8_t mode = tft->readcommand8(ILI9341_RDMODE);
    if (mode != 0x94) {
        DEBUG_PRINTF("LCD power mode 0x%02X - reinit\n", mode);
        tft->begin(TFT_SPI_HZ);   // same speed as the first init
        tft->setRotation(TFT_ROTATION);
        needsFullRedraw = true;
        lastMode = -1;  // force the header to redraw too
    }
}

// ============================================
// HEADER BAR (persistent across all screens)
// ============================================

void LCDDisplay::drawHeader(SystemState& state) {
    bool modeChanged = (state.mode != lastMode);
    bool playChanged = (state.isPlaying != lastPlaying);
    bool recChanged  = (state.isRecording != lastRecording);
    bool bpmChanged  = (fabsf(state.bpm - lastBPM) > 0.1f);

    if (!modeChanged && !playChanged && !recChanged && !bpmChanged) {
        drawLinkIndicator();   // redraws itself only when the link state changes
        return;
    }

    // Header background
    tft->fillRect(0, 0, LCD_WIDTH, 24, COL_HEADER_BG);

    // Mode name (left)
    tft->setCursor(4, 4);
    tft->setTextSize(2);
    tft->setTextColor(COL_ACCENT, COL_HEADER_BG);
    tft->print(getModeString(state.mode));

    // Screen name (center)
    tft->setCursor(96, 4);
    tft->setTextColor(COL_DIM, COL_HEADER_BG);
    tft->setTextSize(2);
    tft->print(getScreenName(currentScreen));

    // BPM (right area)
    tft->setCursor(200, 4);
    tft->setTextColor(COL_TEXT, COL_HEADER_BG);
    tft->setTextSize(2);
    tft->printf("%.0f", state.bpm);
    tft->setTextSize(1);
    tft->print(" BPM");

    // Transport indicators
    if (state.isRecording) {
        tft->fillCircle(306, 12, 6, COL_REC);
    } else if (state.isPlaying) {
        // Play triangle
        tft->fillTriangle(300, 6, 300, 18, 312, 12, COL_ACCENT);
    }

    // Divider line
    tft->drawFastHLine(0, 24, LCD_WIDTH, COL_DIM);
    lastLinkSig = -1;
    drawLinkIndicator();

    lastMode = state.mode;
    lastPlaying = state.isPlaying;
    lastRecording = state.isRecording;
    lastBPM = state.bpm;
}

// ============================================
// LINK INDICATOR (header): W = WiFi, S = server, from MSG_LINK_STATE
// ============================================

void LCDDisplay::drawLinkIndicator() {
    if (!espLink) return;
    bool alive = espLink->espAlive();
    int sig = (alive ? 1 : 0) | (espLink->wifiState() << 1) | (espLink->serverState() << 3);
    if (sig == lastLinkSig) return;
    lastLinkSig = sig;
    tft->fillRect(270, 4, 26, 16, COL_HEADER_BG);
    tft->setTextSize(1);
    tft->setCursor(272, 8);
    if (!alive) {
        tft->setTextColor(COL_STEP_OFF, COL_HEADER_BG);   // no ESP32 heard
        tft->print("- -");
        return;
    }
    uint8_t w = espLink->wifiState();
    tft->setTextColor(w == 2 ? COL_ACCENT : (w == 1 ? COL_WARN : COL_REC), COL_HEADER_BG);
    tft->print("W ");
    tft->setTextColor(espLink->serverState() ? COL_ACCENT : COL_REC, COL_HEADER_BG);
    tft->print("S");
}

// ============================================
// MESSAGE OVERLAY
// ============================================

void LCDDisplay::messageBox(int16_t& x, int16_t& y, int16_t& w, int16_t& h) {
    int textLen = strlen(msgBuffer);
    w = textLen * 12 + 40;
    if (w > LCD_WIDTH - 40) w = LCD_WIDTH - 40;
    h = 50;
    x = (LCD_WIDTH - w) / 2;
    y = (LCD_HEIGHT - h) / 2;
}

// Paint the message box area back to the background and drop the draw
// caches, so every screen repaints what the box covered.
void LCDDisplay::clearMessageBox() {
    if (!msgBoxW) return;
    tft->fillRect(msgBoxX, msgBoxY, msgBoxW, msgBoxH, COL_BG);
    lastRadioSig[0] = '\0';
    for (int l = 0; l < SENSE_LINES; l++) {
        int ly = 86 + l * 9;   // as in senseLine()
        if (ly + 8 > msgBoxY && ly < msgBoxY + msgBoxH) memset(senseText[l], 0, sizeof(senseText[l]));
    }
    lastSenseFrame = 0;
    screenDirty = true;   // repaint what the box covered
    msgBoxW = 0;
}

void LCDDisplay::drawMessageOverlay() {
    int16_t bx, by, boxW, boxH;
    messageBox(bx, by, boxW, boxH);
    msgBoxX = bx; msgBoxY = by; msgBoxW = boxW; msgBoxH = boxH;

    tft->fillRect(bx, by, boxW, boxH, COL_HEADER_BG);
    tft->drawRect(bx, by, boxW, boxH, COL_ACCENT);
    tft->setCursor(bx + 20, by + 14);
    tft->setTextSize(2);
    tft->setTextColor(COL_ACCENT, COL_HEADER_BG);
    tft->print(msgBuffer);
}

// ============================================
// UI ELEMENT HELPERS
// ============================================

void LCDDisplay::drawBar(int x, int y, int w, int h, float value,
                          uint16_t fg, uint16_t bg) {
    tft->fillRect(x, y, w, h, bg);
    int fillW = (int)(value * w);
    if (fillW > 0) {
        tft->fillRect(x, y, fillW, h, fg);
    }
}

void LCDDisplay::drawStepGrid(int x, int y, Sequencer& seq, int track) {
    int len = seq.getPatternLength();
    int curStep = seq.getCurrentStep();
    int boxW = (LCD_WIDTH - 16) / len;
    if (boxW < 4) boxW = 4;

    for (int i = 0; i < len; i++) {
        int bx = x + i * boxW;
        bool active = seq.getStep(track, i);

        if (i == curStep) {
            tft->fillRect(bx, y, boxW - 1, 12, COL_STEP_CUR);
        } else if (active) {
            tft->fillRect(bx, y, boxW - 1, 12, COL_STEP_ON);
        } else {
            tft->drawRect(bx, y, boxW - 1, 12, COL_STEP_OFF);
        }
    }
}

void LCDDisplay::drawKnob(int cx, int cy, int r, float value, const char* label) {
    tft->fillCircle(cx, cy, r - 2, COL_BG);   // the old position dot

    // Knob circle
    tft->drawCircle(cx, cy, r, COL_DIM);
    tft->drawCircle(cx, cy, r - 1, COL_DIM);

    // Position indicator (arc from 7 o'clock to 5 o'clock = 225° to -45° = 270° range)
    float angle = (225.0f - value * 270.0f) * PI / 180.0f;
    int ix = cx + (int)((r - 4) * cos(angle));
    int iy = cy - (int)((r - 4) * sin(angle));
    tft->fillCircle(ix, iy, 3, COL_ACCENT);

    // Label below
    int labelLen = strlen(label);
    tft->setCursor(cx - labelLen * 3, cy + r + 6);
    tft->setTextSize(1);
    tft->setTextColor(COL_DIM, COL_BG);
    tft->print(label);
}

void LCDDisplay::drawFader(int x, int y, int w, int h, float value, const char* label) {
    // Track; the handle sticks out 4 px each side and 2 px below
    tft->fillRect(x - 4, y, w + 8, h + 2, COL_BG);
    tft->fillRect(x, y, w, h, COL_FADER_BG);

    // Fill from bottom
    int fillH = (int)(value * h);
    if (fillH > 0) {
        tft->fillRect(x, y + h - fillH, w, fillH, COL_FADER_FG);
    }

    // Handle line
    int handleY = y + h - fillH - 2;
    if (handleY < y) handleY = y;
    tft->fillRect(x - 4, handleY, w + 8, 4, COL_TEXT);

    // Value
    tft->setCursor(x + 4, y + h + 8);
    tft->setTextSize(1);
    tft->setTextColor(COL_TEXT, COL_BG);
    tft->printf("%3d", (int)(value * 100));

    // Label
    int labelLen = strlen(label);
    tft->setCursor(x + (w - labelLen * 6) / 2, y - 14);
    tft->setTextColor(COL_DIM, COL_BG);
    tft->print(label);
}

// ============================================
// STRING HELPERS
// ============================================

const char* LCDDisplay::getModeString(int mode) {
    switch (mode) {
        case MODE_LIVE:       return "LIVE";
        case MODE_PATTERN:    return "PATTERN";
        case MODE_SCENE:      return "SCENE";
        case MODE_DUB:        return "DUB";
        case MODE_AI_COMPOSE: return "AI";
        default:              return "???";
    }
}

const char* LCDDisplay::getScreenName(LCDScreen screen) {
    switch (screen) {
        case LCD_MAIN:     return "MAIN";
        case LCD_PATTERN:  return "PATTERN";
        case LCD_FX:       return "FX";
        case LCD_SYNTH:    return "SYNTH";
        case LCD_SCENE:    return "SCENE";
        case LCD_MIXER:    return "MIXER";
        case LCD_SETTINGS: return "SETTINGS";
        case LCD_RADIO:    return "RADIO";
        case LCD_SENSE:    return "SENSE";
        default:           return "???";
    }
}
