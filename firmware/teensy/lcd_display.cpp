/**
 * Oh My Ondas - LCD Display Implementation
 * ILI9488 5" 480×320 main UI display
 */

#include <ILI9341_t3.h>
#include "lcd_display.h"
#include "system_state.h"
#include "sequencer.h"
#include "fx_engine.h"
#include "sampling_engine.h"
#include "synth_voice.h"
#include "scene_manager.h"
#include "input_manager.h"

LCDDisplay::LCDDisplay()
    : tft(nullptr)
    , currentScreen(LCD_MAIN)
    , lastScreen(LCD_COUNT)  // Force initial draw
    , needsFullRedraw(true)
    , msgStart(0), msgDuration(0), msgActive(false)
    , lastBPM(0), lastVolume(0), lastStep(-1), lastMode(-1)
    , lastPlaying(false), lastRecording(false)
{
    msgBuffer[0] = '\0';
}

LCDDisplay::~LCDDisplay() {
    delete tft;
}

void LCDDisplay::begin() {
    tft = new ILI9341_t3(TFT_CS, TFT_DC, TFT_RST);
    tft->begin();
    tft->setRotation(1);  // Landscape: 480×320
    tft->fillScreen(COL_BG);
    tft->setTextColor(COL_TEXT);
    tft->setTextSize(2);

    // Splash screen
    tft->setCursor(140, 130);
    tft->setTextColor(COL_ACCENT);
    tft->setTextSize(3);
    tft->print("OH MY ONDAS");
    tft->setCursor(190, 170);
    tft->setTextSize(2);
    tft->setTextColor(COL_DIM);
    tft->print("v" VERSION);
    tft->setCursor(170, 200);
    tft->setTextSize(1);
    tft->print("Location-aware instrument");

    DEBUG_PRINTLN("LCDDisplay: Initialized (480x320)");
}

void LCDDisplay::update(SystemState& state, Sequencer& seq, FXEngine& fx,
                         SamplingEngine& sampler, SynthVoice& synth,
                         SceneManager& scenes, InputManager& input) {
    if (!tft) return;
    // Check message timeout
    if (msgActive && (millis() - msgStart > (unsigned long)msgDuration)) {
        msgActive = false;
        needsFullRedraw = true;
    }

    // Detect screen change
    if (currentScreen != lastScreen) {
        needsFullRedraw = true;
        lastScreen = currentScreen;
    }

    if (needsFullRedraw) {
        tft->fillScreen(COL_BG);
        needsFullRedraw = false;
        // Reset cached values to force full redraw
        lastBPM = -1;
        lastVolume = -1;
        lastStep = -1;
        lastMode = -1;
    }

    drawHeader(state);

    switch (currentScreen) {
        case LCD_MAIN:     drawMainScreen(state, seq, sampler, fx); break;
        case LCD_PATTERN:  drawPatternScreen(state, seq);           break;
        case LCD_FX:       drawFXScreen(state, fx);                 break;
        case LCD_SYNTH:    drawSynthScreen(state, synth);           break;
        case LCD_SCENE:    drawSceneScreen(state, scenes);          break;
        case LCD_MIXER:    drawMixerScreen(state, sampler, input);  break;
        case LCD_SETTINGS: drawSettingsScreen(state);               break;
        default: break;
    }

    if (msgActive) drawMessageOverlay();
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
}

void LCDDisplay::showError(const char* msg) {
    showMessage(msg, 3000);
}

void LCDDisplay::invalidate() {
    needsFullRedraw = true;
}

// ============================================
// HEADER BAR (persistent across all screens)
// ============================================

void LCDDisplay::drawHeader(SystemState& state) {
    bool modeChanged = (state.mode != lastMode);
    bool playChanged = (state.isPlaying != lastPlaying);
    bool recChanged  = (state.isRecording != lastRecording);
    bool bpmChanged  = (fabsf(state.bpm - lastBPM) > 0.1f);

    if (!modeChanged && !playChanged && !recChanged && !bpmChanged) return;

    // Header background
    tft->fillRect(0, 0, LCD_WIDTH, 28, COL_HEADER_BG);

    // Mode name (left)
    tft->setCursor(8, 6);
    tft->setTextSize(2);
    tft->setTextColor(COL_ACCENT, COL_HEADER_BG);
    tft->print(getModeString(state.mode));

    // Screen name (center)
    tft->setCursor(180, 6);
    tft->setTextColor(COL_DIM, COL_HEADER_BG);
    tft->setTextSize(2);
    tft->print(getScreenName(currentScreen));

    // BPM (right area)
    tft->setCursor(330, 6);
    tft->setTextColor(COL_TEXT, COL_HEADER_BG);
    tft->setTextSize(2);
    tft->printf("%.0f", state.bpm);
    tft->setTextSize(1);
    tft->print(" BPM");

    // Transport indicators
    if (state.isRecording) {
        tft->fillCircle(460, 14, 6, COL_REC);
    } else if (state.isPlaying) {
        // Play triangle
        tft->fillTriangle(454, 8, 454, 20, 466, 14, COL_ACCENT);
    }

    // Divider line
    tft->drawFastHLine(0, 28, LCD_WIDTH, COL_DIM);

    lastMode = state.mode;
    lastPlaying = state.isPlaying;
    lastRecording = state.isRecording;
    lastBPM = state.bpm;
}

// ============================================
// MAIN SCREEN
// ============================================

void LCDDisplay::drawMainScreen(SystemState& state, Sequencer& seq,
                                 SamplingEngine& sampler, FXEngine& fx) {
    int y = 36;

    // Volume bar
    tft->setCursor(8, y);
    tft->setTextSize(1);
    tft->setTextColor(COL_DIM, COL_BG);
    tft->print("MASTER");
    drawBar(70, y, 200, 12, state.masterVolume, COL_ACCENT, COL_FADER_BG);
    tft->setCursor(280, y);
    tft->setTextColor(COL_TEXT, COL_BG);
    tft->printf("%d%%", (int)(state.masterVolume * 100));

    y += 24;

    // Pattern/Scene info
    tft->setCursor(8, y);
    tft->setTextSize(2);
    tft->setTextColor(COL_TEXT, COL_BG);
    tft->printf("PAT %02d", state.currentPattern + 1);
    tft->setCursor(150, y);
    tft->printf("SCN %02d", state.currentScene + 1);

    // Step position
    if (state.isPlaying) {
        int step = seq.getCurrentStep();
        int len = seq.getPatternLength();
        tft->setCursor(320, y);
        tft->printf("STEP %2d/%d", step + 1, len);
    }

    y += 32;

    // FX info
    tft->setCursor(8, y);
    tft->setTextSize(1);
    tft->setTextColor(COL_ACCENT, COL_BG);
    tft->print("FX: ");
    tft->setTextColor(COL_TEXT, COL_BG);
    tft->print(fx.getEffectName(fx.getCurrentEffect()));
    tft->printf("  MIX %d%%", (int)(fx.getMix() * 100));

    y += 20;

    // Track activity (8 boxes)
    int boxW = 52;
    int boxH = 30;
    int gap = 4;
    int startX = (LCD_WIDTH - (8 * boxW + 7 * gap)) / 2;

    for (int i = 0; i < MAX_TRACKS; i++) {
        int bx = startX + i * (boxW + gap);

        if (sampler.isPlaying(i)) {
            tft->fillRect(bx, y, boxW, boxH, COL_ACCENT);
            tft->setCursor(bx + 16, y + 10);
            tft->setTextColor(COL_BG);
        } else if (sampler.isSampleLoaded(i)) {
            tft->drawRect(bx, y, boxW, boxH, COL_DIM);
            tft->setCursor(bx + 16, y + 10);
            tft->setTextColor(COL_DIM);
        } else {
            tft->drawRect(bx, y, boxW, boxH, COL_STEP_OFF);
            tft->setCursor(bx + 16, y + 10);
            tft->setTextColor(COL_STEP_OFF);
        }
        tft->setTextSize(1);
        tft->printf("T%d", i + 1);
    }

    y += boxH + 16;

    // Mini step view at bottom
    if (state.isPlaying) {
        drawStepGrid(8, y, seq, seq.getSelectedTrack());
    }

    // GPS indicator (bottom right)
    if (state.gps.valid) {
        tft->setCursor(340, 300);
        tft->setTextSize(1);
        tft->setTextColor(COL_DIM, COL_BG);
        tft->printf("GPS %.4f,%.4f", state.gps.lat, state.gps.lon);
    }
}

// ============================================
// PATTERN SCREEN
// ============================================

void LCDDisplay::drawPatternScreen(SystemState& state, Sequencer& seq) {
    int selTrack = seq.getSelectedTrack();
    int curStep = seq.getCurrentStep();
    int len = seq.getPatternLength();

    // Track selector
    int y = 36;
    tft->setTextSize(2);
    for (int i = 0; i < MAX_TRACKS; i++) {
        int tx = 8 + i * 56;
        if (i == selTrack) {
            tft->fillRect(tx, y, 50, 22, COL_ACCENT);
            tft->setCursor(tx + 12, y + 3);
            tft->setTextColor(COL_BG, COL_ACCENT);
        } else {
            tft->drawRect(tx, y, 50, 22, seq.isTrackMuted(i) ? COL_REC : COL_DIM);
            tft->setCursor(tx + 12, y + 3);
            tft->setTextColor(seq.isTrackMuted(i) ? COL_REC : COL_TEXT, COL_BG);
        }
        tft->printf("T%d", i + 1);
    }

    // Mute/Solo indicators
    y += 28;
    tft->setTextSize(1);
    tft->setCursor(8, y);
    if (seq.isTrackMuted(selTrack)) {
        tft->setTextColor(COL_REC, COL_BG);
        tft->print("MUTED");
    }
    if (seq.isTrackSoloed(selTrack)) {
        tft->setTextColor(COL_WARN, COL_BG);
        tft->print("  SOLO");
    }

    // 16-step grid (2 rows of 8)
    y += 16;
    int boxW = 54;
    int boxH = 40;
    int gap = 4;

    for (int row = 0; row < 2; row++) {
        for (int col = 0; col < 8; col++) {
            int step = row * 8 + col;
            if (step >= len) break;

            int bx = 8 + col * (boxW + gap);
            int by = y + row * (boxH + gap);

            bool active = seq.getStep(selTrack, step);
            TrigCondition cond = seq.getTrigCondition(selTrack, step);

            // Step box
            if (active) {
                uint16_t col16 = COL_STEP_ON;
                if (step == curStep && state.isPlaying) col16 = COL_STEP_CUR;
                tft->fillRect(bx, by, boxW, boxH, col16);

                // Trig condition label
                if (cond != TRIG_ALWAYS) {
                    tft->setCursor(bx + 4, by + 4);
                    tft->setTextSize(1);
                    tft->setTextColor(COL_BG, col16);
                    tft->printf("C%d", (int)cond);
                }

                // Step number
                tft->setCursor(bx + 18, by + 26);
                tft->setTextSize(1);
                tft->setTextColor(COL_BG, col16);
                tft->printf("%d", step + 1);
            } else {
                uint16_t col16 = COL_STEP_OFF;
                if (step == curStep && state.isPlaying) {
                    tft->drawRect(bx, by, boxW, boxH, COL_STEP_CUR);
                } else {
                    tft->drawRect(bx, by, boxW, boxH, col16);
                }
                tft->setCursor(bx + 18, by + 16);
                tft->setTextSize(1);
                tft->setTextColor(COL_DIM, COL_BG);
                tft->printf("%d", step + 1);
            }
        }
    }

    // Swing indicator
    tft->setCursor(8, 290);
    tft->setTextSize(1);
    tft->setTextColor(COL_DIM, COL_BG);
    tft->printf("SWING: %d%%  LEN: %d", seq.getSwing(), len);
}

// ============================================
// FX SCREEN
// ============================================

void LCDDisplay::drawFXScreen(SystemState& state, FXEngine& fx) {
    // Effect name (large)
    tft->setCursor(8, 40);
    tft->setTextSize(3);
    tft->setTextColor(COL_ACCENT, COL_BG);
    tft->print(fx.getEffectName(fx.getCurrentEffect()));

    // Enabled indicator
    if (fx.isEnabled()) {
        tft->setCursor(350, 44);
        tft->setTextSize(2);
        tft->setTextColor(COL_ACCENT, COL_BG);
        tft->print("ON");
    } else {
        tft->setCursor(350, 44);
        tft->setTextSize(2);
        tft->setTextColor(COL_REC, COL_BG);
        tft->print("OFF");
    }

    // Parameter knobs
    int knobY = 120;
    drawKnob(80, knobY, 35, fx.getParam(0), "PARAM 1");
    drawKnob(200, knobY, 35, fx.getParam(1), "PARAM 2");
    drawKnob(320, knobY, 35, fx.getParam(2), "PARAM 3");
    drawKnob(440, knobY, 35, fx.getMix(), "MIX");

    // Parameter values
    tft->setTextSize(2);
    tft->setTextColor(COL_TEXT, COL_BG);
    tft->setCursor(60, knobY + 50);
    tft->printf("%d", (int)(fx.getParam(0) * 100));
    tft->setCursor(180, knobY + 50);
    tft->printf("%d", (int)(fx.getParam(1) * 100));
    tft->setCursor(300, knobY + 50);
    tft->printf("%d", (int)(fx.getParam(2) * 100));
    tft->setCursor(420, knobY + 50);
    tft->printf("%d%%", (int)(fx.getMix() * 100));

    // LFO info
    tft->setCursor(8, 240);
    tft->setTextSize(1);
    tft->setTextColor(COL_DIM, COL_BG);
    tft->printf("LFO: %.1f Hz  Depth: %d%%", 0.0f, 0);  // TODO: expose LFO getters
}

// ============================================
// SYNTH SCREEN
// ============================================

void LCDDisplay::drawSynthScreen(SystemState& state, SynthVoice& synth) {
    tft->setCursor(8, 40);
    tft->setTextSize(3);
    tft->setTextColor(COL_ACCENT, COL_BG);
    tft->print("SYNTH");

    tft->setCursor(8, 80);
    tft->setTextSize(1);
    tft->setTextColor(COL_DIM, COL_BG);
    tft->print(synth.isActive() ? "ACTIVE" : "IDLE");

    // Oscillator section
    int y = 100;
    tft->setCursor(8, y);
    tft->setTextSize(2);
    tft->setTextColor(COL_TEXT, COL_BG);
    tft->print("OSC 1");
    tft->setCursor(200, y);
    tft->print("OSC 2");

    // ADSR visual
    y = 180;
    tft->setCursor(8, y);
    tft->setTextSize(1);
    tft->setTextColor(COL_ACCENT, COL_BG);
    tft->print("ENVELOPE");

    // Draw ADSR shape (simplified)
    int envX = 8, envY = 200, envW = 200, envH = 60;
    tft->drawRect(envX, envY, envW, envH, COL_DIM);
    // A-D-S-R labels
    tft->setCursor(envX + 10, envY + envH + 4);
    tft->setTextColor(COL_DIM, COL_BG);
    tft->print("A    D    S    R");

    // Filter knobs
    drawKnob(300, 220, 30, 0.5, "CUTOFF");
    drawKnob(400, 220, 30, 0.5, "RES");
}

// ============================================
// SCENE SCREEN
// ============================================

void LCDDisplay::drawSceneScreen(SystemState& state, SceneManager& scenes) {
    tft->setCursor(8, 40);
    tft->setTextSize(2);
    tft->setTextColor(COL_ACCENT, COL_BG);
    tft->print("SCENES");

    // 16 scene slots in 4×4 grid
    int boxW = 100;
    int boxH = 50;
    int gap = 10;
    int startX = (LCD_WIDTH - (4 * boxW + 3 * gap)) / 2;
    int startY = 70;

    for (int i = 0; i < MAX_SCENES; i++) {
        int col = i % 4;
        int row = i / 4;
        int bx = startX + col * (boxW + gap);
        int by = startY + row * (boxH + gap);

        if (scenes.isSceneSaved(i)) {
            uint16_t bgCol = (i == state.currentScene) ? COL_ACCENT : COL_HEADER_BG;
            tft->fillRect(bx, by, boxW, boxH, bgCol);
            tft->setCursor(bx + 30, by + 16);
            tft->setTextSize(2);
            tft->setTextColor((i == state.currentScene) ? COL_BG : COL_TEXT, bgCol);
            tft->printf("S%02d", i + 1);
        } else {
            tft->drawRect(bx, by, boxW, boxH, COL_DIM);
            tft->setCursor(bx + 30, by + 16);
            tft->setTextSize(2);
            tft->setTextColor(COL_DIM, COL_BG);
            tft->printf("S%02d", i + 1);
        }
    }

    tft->setCursor(8, 300);
    tft->setTextSize(1);
    tft->setTextColor(COL_DIM, COL_BG);
    tft->print("PAD = recall   SHIFT+PAD = save   ENC = morph");
}

// ============================================
// MIXER SCREEN
// ============================================

void LCDDisplay::drawMixerScreen(SystemState& state, SamplingEngine& sampler,
                                  InputManager& input) {
    tft->setCursor(8, 40);
    tft->setTextSize(2);
    tft->setTextColor(COL_ACCENT, COL_BG);
    tft->print("MIXER");

    // 4 channel faders + crossfader
    const char* faderLabels[] = {"MIC", "SMP", "SYN", "RAD", "X-FADE"};
    int faderW = 40;
    int faderH = 180;
    int gap = 30;
    int startX = 40;
    int startY = 70;

    for (int i = 0; i < FADER_COUNT; i++) {
        int fx = startX + i * (faderW + gap);
        float val = input.getFaderValue(i);
        drawFader(fx, startY, faderW, faderH, val, faderLabels[i]);
    }

    // Master volume
    tft->setCursor(8, 280);
    tft->setTextSize(1);
    tft->setTextColor(COL_DIM, COL_BG);
    tft->print("MASTER: ");
    drawBar(60, 280, 150, 10, state.masterVolume, COL_ACCENT, COL_FADER_BG);
    tft->printf(" %d%%", (int)(state.masterVolume * 100));
}

// ============================================
// SETTINGS SCREEN
// ============================================

void LCDDisplay::drawSettingsScreen(SystemState& state) {
    int y = 40;
    int lineH = 24;
    tft->setTextSize(2);

    tft->setCursor(8, y);
    tft->setTextColor(COL_ACCENT, COL_BG);
    tft->print("SETTINGS");

    y += lineH + 8;
    tft->setTextSize(1);
    tft->setTextColor(COL_TEXT, COL_BG);

    tft->setCursor(8, y);
    tft->printf("CPU Usage:  %.1f%%", AudioProcessorUsage());
    y += lineH;

    tft->setCursor(8, y);
    tft->printf("Audio Mem:  %d / %d blocks", AudioMemoryUsage(), AUDIO_MEMORY_BLOCKS);
    y += lineH;

    tft->setCursor(8, y);
    tft->printf("Pattern:    %d", state.currentPattern + 1);
    y += lineH;

    tft->setCursor(8, y);
    tft->printf("Scene:      %d", state.currentScene + 1);
    y += lineH;

    if (state.gps.valid) {
        tft->setCursor(8, y);
        tft->printf("GPS:        %.6f, %.6f", state.gps.lat, state.gps.lon);
        y += lineH;
        tft->setCursor(8, y);
        unsigned long age = (millis() - state.gps.lastUpdate) / 1000;
        tft->printf("GPS Age:    %lu sec", age);
    } else {
        tft->setCursor(8, y);
        tft->setTextColor(COL_WARN, COL_BG);
        tft->print("GPS:        No Fix");
    }

    y += lineH + 8;
    tft->setCursor(8, y);
    tft->setTextColor(COL_DIM, COL_BG);
    tft->print("Oh My Ondas v" VERSION);
}

// ============================================
// MESSAGE OVERLAY
// ============================================

void LCDDisplay::drawMessageOverlay() {
    int textLen = strlen(msgBuffer);
    int boxW = textLen * 18 + 40;
    if (boxW > LCD_WIDTH - 40) boxW = LCD_WIDTH - 40;
    int boxH = 50;
    int bx = (LCD_WIDTH - boxW) / 2;
    int by = (LCD_HEIGHT - boxH) / 2;

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
    // Track
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
    tft->printf("%d", (int)(value * 100));

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
        default:           return "???";
    }
}
