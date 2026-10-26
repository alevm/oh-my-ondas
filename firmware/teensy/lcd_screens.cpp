/**
 * Oh My Ondas - LCD screens (one draw function per screen)
 * The frame loop, header, message box and drawing helpers are in lcd_display.cpp.
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

extern "C" uint8_t external_psram_size;   // SENSE screen: memory line
extern unsigned long _heap_end;
extern "C" char* sbrk(int incr);

// ============================================
// MAIN SCREEN
// ============================================

void LCDDisplay::drawMainScreen(SystemState& state, Sequencer& seq,
                                 SamplingEngine& sampler, FXEngine& fx) {
    int y = 30;

    // Volume bar
    tft->setCursor(6, y);
    tft->setTextSize(1);
    tft->setTextColor(COL_DIM, COL_BG);
    tft->print("MASTER");
    drawBar(50, y, 200, 10, state.masterVolume, COL_ACCENT, COL_FADER_BG);
    tft->setCursor(258, y);
    tft->setTextColor(COL_TEXT, COL_BG);
    tft->printf("%3d%%", (int)(state.masterVolume * 100));

    y += 18;

    // Pattern/Scene info
    tft->setCursor(6, y);
    tft->setTextSize(2);
    tft->setTextColor(COL_TEXT, COL_BG);
    tft->printf("PAT %02d", state.currentPattern + 1);
    tft->setCursor(100, y);
    tft->printf("SCN %02d", state.currentScene + 1);

    // Step position
    tft->setCursor(196, y);
    if (state.isPlaying) {
        tft->printf("S%2d/%-2d", seq.getCurrentStep() + 1, seq.getPatternLength());
    } else {
        tft->print("      ");
    }

    y += 26;

    // FX info
    tft->setCursor(6, y);
    tft->setTextSize(1);
    tft->setTextColor(COL_ACCENT, COL_BG);
    tft->print("FX: ");
    tft->setTextColor(COL_TEXT, COL_BG);
    tft->printf("%-6s  MIX %3d%%", fx.getEffectName(fx.getCurrentEffect()), (int)(fx.getMix() * 100));

    y += 16;

    // Track activity (8 boxes)
    int boxW = 34;
    int boxH = 26;
    int gap = 4;
    int startX = (LCD_WIDTH - (8 * boxW + 7 * gap)) / 2;

    for (int i = 0; i < MAX_TRACKS; i++) {
        int bx = startX + i * (boxW + gap);

        if (sampler.isPlaying(i)) {
            tft->fillRect(bx, y, boxW, boxH, COL_ACCENT);
            tft->setCursor(bx + 11, y + 9);
            tft->setTextColor(COL_BG);
        } else if (sampler.isSampleLoaded(i)) {
            tft->drawRect(bx, y, boxW, boxH, COL_DIM);
            tft->setCursor(bx + 11, y + 9);
            tft->setTextColor(COL_DIM);
        } else {
            tft->drawRect(bx, y, boxW, boxH, COL_STEP_OFF);
            tft->setCursor(bx + 11, y + 9);
            tft->setTextColor(COL_STEP_OFF);
        }
        tft->setTextSize(1);
        tft->printf("T%d", i + 1);
    }

    y += boxH + 12;

    // Mini step view at bottom
    if (state.isPlaying) {
        drawStepGrid(8, y, seq, seq.getSelectedTrack());
    } else {
        tft->fillRect(8, y, LCD_WIDTH - 16, 12, COL_BG);
    }

    // GPS indicator (bottom right)
    tft->setCursor(180, 228);
    tft->setTextSize(1);
    tft->setTextColor(COL_DIM, COL_BG);
    if (state.gps.valid) {
        tft->printf("GPS %.4f,%.4f", state.gps.lat, state.gps.lon);
    } else {
        tft->print("                     ");
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
    int y = 30;
    tft->setTextSize(2);
    for (int i = 0; i < MAX_TRACKS; i++) {
        int tx = 4 + i * 39;
        if (i == selTrack) {
            tft->fillRect(tx, y, 36, 20, COL_ACCENT);
            tft->setCursor(tx + 6, y + 3);
            tft->setTextColor(COL_BG, COL_ACCENT);
        } else {
            tft->drawRect(tx, y, 36, 20, seq.isTrackMuted(i) ? COL_REC : COL_DIM);
            tft->setCursor(tx + 6, y + 3);
            tft->setTextColor(seq.isTrackMuted(i) ? COL_REC : COL_TEXT, COL_BG);
        }
        tft->printf("T%d", i + 1);
    }

    // Mute/Solo indicators
    y += 24;
    tft->setTextSize(1);
    tft->setCursor(6, y);
    tft->setTextColor(COL_REC, COL_BG);
    tft->print(seq.isTrackMuted(selTrack) ? "MUTED" : "     ");
    tft->setTextColor(COL_WARN, COL_BG);
    tft->print(seq.isTrackSoloed(selTrack) ? "  SOLO" : "      ");

    // 16-step grid (2 rows of 8)
    y += 12;
    int boxW = 36;
    int boxH = 34;
    int gap = 3;

    for (int row = 0; row < 2; row++) {
        for (int col = 0; col < 8; col++) {
            int step = row * 8 + col;
            if (step >= len) break;

            int bx = 5 + col * (boxW + gap);
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
                    tft->setCursor(bx + 3, by + 3);
                    tft->setTextSize(1);
                    tft->setTextColor(COL_BG, col16);
                    tft->printf("C%d", (int)cond);
                }

                // Step number
                tft->setCursor(bx + 12, by + 22);
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
                tft->setCursor(bx + 12, by + 13);
                tft->setTextSize(1);
                tft->setTextColor(COL_DIM, COL_BG);
                tft->printf("%d", step + 1);
            }
        }
    }

    // Swing indicator
    tft->setCursor(6, 226);
    tft->setTextSize(1);
    tft->setTextColor(COL_DIM, COL_BG);
    tft->printf("SWING: %3d%%  LEN: %-2d", seq.getSwing(), len);
}

// ============================================
// FX SCREEN
// ============================================

void LCDDisplay::drawFXScreen(SystemState& state, FXEngine& fx) {
    // Effect name (large)
    tft->setCursor(6, 32);
    tft->setTextSize(3);
    tft->setTextColor(COL_ACCENT, COL_BG);
    tft->printf("%-6s", fx.getEffectName(fx.getCurrentEffect()));

    // Enabled indicator
    if (fx.isEnabled()) {
        tft->setCursor(260, 36);
        tft->setTextSize(2);
        tft->setTextColor(COL_ACCENT, COL_BG);
        tft->print("ON ");
    } else {
        tft->setCursor(260, 36);
        tft->setTextSize(2);
        tft->setTextColor(COL_REC, COL_BG);
        tft->print("OFF");
    }

    // Parameter knobs
    int knobY = 110;
    drawKnob(45, knobY, 26, fx.getParam(0), "PARAM 1");
    drawKnob(120, knobY, 26, fx.getParam(1), "PARAM 2");
    drawKnob(195, knobY, 26, fx.getParam(2), "PARAM 3");
    drawKnob(270, knobY, 26, fx.getMix(), "MIX");

    // Parameter values
    tft->setTextSize(2);
    tft->setTextColor(COL_TEXT, COL_BG);
    tft->setCursor(27, knobY + 46);
    tft->printf("%3d", (int)(fx.getParam(0) * 100));
    tft->setCursor(102, knobY + 46);
    tft->printf("%3d", (int)(fx.getParam(1) * 100));
    tft->setCursor(177, knobY + 46);
    tft->printf("%3d", (int)(fx.getParam(2) * 100));
    tft->setCursor(246, knobY + 46);
    tft->printf("%3d%%", (int)(fx.getMix() * 100));

    // LFO info
    tft->setCursor(6, 200);
    tft->setTextSize(1);
    tft->setTextColor(COL_DIM, COL_BG);
    tft->printf("LFO: %4.1f Hz  Depth: %3d%%", fx.getLFORate(), (int)(fx.getLFODepth() * 100));
}

// ============================================
// SYNTH SCREEN
// ============================================

FLASHMEM void LCDDisplay::drawSynthScreen(SystemState& state, SynthVoice& synth) {
    tft->setCursor(6, 32);
    tft->setTextSize(3);
    tft->setTextColor(COL_ACCENT, COL_BG);
    tft->print("SYNTH");

    tft->setCursor(6, 62);
    tft->setTextSize(1);
    tft->setTextColor(COL_DIM, COL_BG);
    tft->print(synth.isActive() ? "ACTIVE" : "IDLE  ");

    // Oscillator section
    int y = 80;
    tft->setCursor(6, y);
    tft->setTextSize(2);
    tft->setTextColor(COL_TEXT, COL_BG);
    tft->print("OSC 1");
    tft->setCursor(160, y);
    tft->print("OSC 2");

    // ADSR visual
    y = 120;
    tft->setCursor(6, y);
    tft->setTextSize(1);
    tft->setTextColor(COL_ACCENT, COL_BG);
    tft->print("ENVELOPE");

    // Draw ADSR shape (simplified)
    int envX = 6, envY = 134, envW = 150, envH = 50;
    tft->drawRect(envX, envY, envW, envH, COL_DIM);
    // A-D-S-R labels
    tft->setCursor(envX + 10, envY + envH + 4);
    tft->setTextColor(COL_DIM, COL_BG);
    tft->print("A    D    S    R");

    // Filter knobs
    drawKnob(210, 160, 24, 0.5, "CUTOFF");
    drawKnob(280, 160, 24, 0.5, "RES");
}

// ============================================
// SCENE SCREEN
// ============================================

FLASHMEM void LCDDisplay::drawSceneScreen(SystemState& state, SceneManager& scenes) {
    tft->setCursor(6, 30);
    tft->setTextSize(2);
    tft->setTextColor(COL_ACCENT, COL_BG);
    tft->print("SCENES");

    // 16 scene slots in 4×4 grid
    int boxW = 70;
    int boxH = 36;
    int gap = 6;
    int startX = (LCD_WIDTH - (4 * boxW + 3 * gap)) / 2;
    int startY = 52;

    for (int i = 0; i < MAX_SCENES; i++) {
        int col = i % 4;
        int row = i / 4;
        int bx = startX + col * (boxW + gap);
        int by = startY + row * (boxH + gap);

        if (scenes.isSceneSaved(i)) {
            uint16_t bgCol = (i == state.currentScene) ? COL_ACCENT : COL_HEADER_BG;
            tft->fillRect(bx, by, boxW, boxH, bgCol);
            tft->setCursor(bx + 17, by + 10);
            tft->setTextSize(2);
            tft->setTextColor((i == state.currentScene) ? COL_BG : COL_TEXT, bgCol);
            tft->printf("S%02d", i + 1);
        } else {
            tft->drawRect(bx, by, boxW, boxH, COL_DIM);
            tft->setCursor(bx + 17, by + 10);
            tft->setTextSize(2);
            tft->setTextColor(COL_DIM, COL_BG);
            tft->printf("S%02d", i + 1);
        }
    }

    tft->setCursor(6, 228);
    tft->setTextSize(1);
    tft->setTextColor(COL_DIM, COL_BG);
    tft->print("PAD = recall   SHIFT+PAD = save   ENC = morph");
}

// ============================================
// MIXER SCREEN
// ============================================

void LCDDisplay::drawMixerScreen(SystemState& state, SamplingEngine& sampler,
                                  InputManager& input) {
    tft->setCursor(6, 30);
    tft->setTextSize(2);
    tft->setTextColor(COL_ACCENT, COL_BG);
    tft->print("MIXER");

    // 4 channel faders + output fader
    const char* faderLabels[] = {"MIC", "SMP", "SYN", "RAD", "OUT"};
    int faderW = 30;
    int faderH = 130;
    int gap = 28;
    int startX = 24;
    int startY = 62;

    for (int i = 0; i < FADER_COUNT; i++) {
        int fx = startX + i * (faderW + gap);
        float val = input.getFaderValue(i);
        drawFader(fx, startY, faderW, faderH, val, faderLabels[i]);
    }

    // Master volume
    tft->setCursor(6, 222);
    tft->setTextSize(1);
    tft->setTextColor(COL_DIM, COL_BG);
    tft->print("MASTER: ");
    drawBar(56, 222, 150, 10, state.masterVolume, COL_ACCENT, COL_FADER_BG);
    tft->setCursor(210, 222);
    tft->printf(" %3d%%", (int)(state.masterVolume * 100));
}

// ============================================
// RADIO SCREEN
// ============================================

FLASHMEM void LCDDisplay::drawRadioScreen() {
    char sig[48];
    if (!radio || !radio->isFitted()) {
        snprintf(sig, sizeof(sig), "absent");
        if (strcmp(sig, lastRadioSig) == 0) return;
        strcpy(lastRadioSig, sig);
        tft->setTextSize(2);
        tft->setTextColor(COL_WARN, COL_BG);
        tft->setCursor(6, 60);
        tft->print("radio not fitted");
        tft->setTextSize(1);
        tft->setTextColor(COL_DIM, COL_BG);
        tft->setCursor(6, 90);
        tft->print("Si4732 did not answer on Wire2 (0x11)");
        return;
    }

    char f[16];
    radio->formatFrequency(f, sizeof(f));
    snprintf(sig, sizeof(sig), "%s|%s|%u|%u|%s|%d", radio->getBandName(), f,
             radio->getRSSI(), radio->getSNR(), radio->getStationName(), radio->isMuted());
    if (strcmp(sig, lastRadioSig) == 0) return;
    strcpy(lastRadioSig, sig);

    tft->fillRect(0, 26, LCD_WIDTH, LCD_HEIGHT - 26, COL_BG);

    // Band selector: FM MW SW LW, current one highlighted
    static const char* names[BAND_COUNT] = {"FM", "MW", "SW", "LW"};
    tft->setTextSize(2);
    for (int b = 0; b < BAND_COUNT; b++) {
        bool cur = b == radio->getBand();
        int x = 6 + b * 60;
        tft->fillRoundRect(x, 34, 52, 24, 4, cur ? COL_ACCENT : COL_STEP_OFF);
        tft->setTextColor(cur ? COL_BG : COL_DIM);
        tft->setCursor(x + 14, 39);
        tft->print(names[b]);
    }

    // Frequency, large
    tft->setTextSize(4);
    tft->setTextColor(COL_TEXT, COL_BG);
    tft->setCursor(6, 76);
    tft->print(f);

    // RDS station name (FM)
    tft->setTextSize(2);
    tft->setTextColor(COL_ACTIVE, COL_BG);
    tft->setCursor(6, 120);
    tft->print(radio->getStationName()[0] ? radio->getStationName() : "");

    // Signal: RSSI bar (0-60 dBuV) + numbers
    tft->setTextSize(1);
    tft->setTextColor(COL_DIM, COL_BG);
    tft->setCursor(6, 150);
    tft->printf("RSSI %u dBuV   SNR %u dB%s", radio->getRSSI(), radio->getSNR(),
                radio->isMuted() ? "   MUTED" : "");
    drawBar(6, 162, LCD_WIDTH - 12, 10, radio->getRSSI() / 60.0f, COL_ACCENT, COL_FADER_BG);

    tft->setCursor(6, 190);
    tft->print("Enc 5: tune   SHIFT+Enc 5: seek   Nav L/R: band");
    tft->setCursor(6, 204);
    tft->print("Level: RAD fader (LINE-IN R)");
}

// ============================================
// SETTINGS SCREEN
// ============================================

FLASHMEM void LCDDisplay::drawSettingsScreen(SystemState& state) {
    int y = 30;
    int lineH = 18;
    tft->setTextSize(2);

    tft->setCursor(6, y);
    tft->setTextColor(COL_ACCENT, COL_BG);
    tft->print("SETTINGS");

    y += lineH + 8;
    tft->setTextSize(1);
    tft->setTextColor(COL_TEXT, COL_BG);

    tft->setCursor(6, y);
    tft->printf("CPU Usage:  %3d%%", (int)AudioProcessorUsage());
    y += lineH;

    tft->setCursor(6, y);
    tft->printf("Audio Mem:  %3d / %d blocks", AudioMemoryUsage(), AUDIO_MEMORY_BLOCKS);
    y += lineH;

    tft->setCursor(6, y);
    tft->printf("Pattern:    %-3d", state.currentPattern + 1);
    y += lineH;

    tft->setCursor(6, y);
    tft->printf("Scene:      %-3d", state.currentScene + 1);
    y += lineH;

    if (state.gps.valid) {
        tft->setCursor(6, y);
        tft->printf("GPS:        %-30s", "");
        tft->setCursor(6, y);
        tft->printf("GPS:        %.6f, %.6f", state.gps.lat, state.gps.lon);
        y += lineH;
        tft->setCursor(6, y);
        unsigned long age = (millis() - state.gps.lastUpdate) / 1000;
        tft->printf("GPS Age:    %-6lu sec", age);
    } else {
        tft->setCursor(6, y);
        tft->setTextColor(COL_WARN, COL_BG);
        tft->printf("GPS:        %-30s", "No Fix");
        y += lineH;
        tft->setCursor(6, y);
        tft->printf("%-30s", "");
    }

    y += lineH + 8;
    tft->setCursor(6, y);
    tft->setTextColor(COL_DIM, COL_BG);
    tft->print("Oh My Ondas v" VERSION);
}

// ============================================
// SENSE SCREEN: live layer-1 stats
// ============================================

// One text line of the SENSE screen (size 1, 53 columns). Only the
// characters that differ from what is on the glass are drawn.
void LCDDisplay::senseLine(int line, uint16_t color, const char* fmt, ...) {
    char buf[SENSE_COLS + 1];
    va_list ap;
    va_start(ap, fmt);
    vsnprintf(buf, sizeof(buf), fmt, ap);
    va_end(ap);
    int n = strlen(buf);
    for (int i = n; i < SENSE_COLS; i++) buf[i] = ' ';   // pad: clears old text
    buf[SENSE_COLS] = '\0';

    const int y = 86 + line * 9;
    bool full = senseColor[line] != color;
    senseColor[line] = color;
    tft->setTextSize(1);
    tft->setTextColor(color, COL_BG);
    for (int i = 0; i < SENSE_COLS; i++) {
        if (!full && senseText[line][i] == buf[i]) continue;
        tft->setCursor(2 + i * 6, y);
        tft->print(buf[i]);
        senseText[line][i] = buf[i];
    }
}

void LCDDisplay::drawSenseScreen() {
    if (!features) {
        senseLine(0, COL_WARN, "layer 1 not running");
        return;
    }
    if (features->frameCount() == lastSenseFrame) return;   // 10 Hz
    lastSenseFrame = features->frameCount();
    const FeatureFrame& f = features->frame();
    const RadioFeatures& rf = features->radioFrame();

    // 32 band bars (-90..0 dBFS), 7 px each, y 28..80
    const int barTop = 28, barH = 52;
    for (int b = 0; b < 32; b++) {
        int h = (int)constrain((f.bandsDb[b] + 90.0f) * barH / 90.0f, 0.0f, (float)barH);
        if (h == senseBars[b]) continue;
        int x = 4 + b * 7;
        tft->fillRect(x, barTop, 6, barH - h, COL_STEP_OFF);
        tft->fillRect(x, barTop + barH - h, 6, h, b < 8 ? COL_WARN : (b < 24 ? COL_ACCENT : COL_ACTIVE));
        senseBars[b] = h;
    }
    // 12 chroma bars, right column (y 28..48); the mapper's root highlighted
    int root = mapper ? mapper->getRoot() : -1;
    for (int c = 0; c < 12; c++) {
        int h = (int)(f.chroma[c] * 20);
        if (h == senseBars[32 + c]) continue;
        int x = 236 + c * 7;
        tft->fillRect(x, barTop, 6, 20 - h, COL_STEP_OFF);
        tft->fillRect(x, barTop + 20 - h, 6, h, c == root ? COL_STEP_CUR : COL_DIM);
        senseBars[32 + c] = h;
    }

    static const char* NOTE[12] = {"C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"};
    char tmp[40], tmp2[40];

    // Tempo, larger, under the chroma
    tft->setTextSize(2);
    tft->setTextColor(f.bpmConf > 0.5f ? COL_TEXT : COL_DIM, COL_BG);
    tft->setCursor(236, 52);
    if (f.bpm > 0) tft->printf("%5.1f", f.bpm); else tft->print("  ---");
    tft->setTextSize(1);
    tft->setCursor(236, 71);
    tft->setTextColor(COL_DIM, COL_BG);
    tft->printf("BPM %3d%%   ", (int)(f.bpmConf * 100));

    // 0-2: LINE-IN L
    senseLine(0, COL_TEXT, "IN L %-5s rms %5.1f dB  cent %5d Hz  flat %4.2f",
              sourceName(f.source), f.rmsDb, (int)f.centroidHz, f.flatness);
    if (f.pitchHz > 0) {
        int midi = (int)lroundf(69.0f + 12.0f * log2f(f.pitchHz / 440.0f));
        snprintf(tmp, sizeof(tmp), "%6.1f Hz %-2s%d %3d%%", f.pitchHz, NOTE[(midi % 12 + 12) % 12],
                 midi / 12 - 1, (int)(f.pitchConf * 100));
    } else {
        snprintf(tmp, sizeof(tmp), "   ---");
    }
    senseLine(1, COL_TEXT, "onsets %4.1f/s  pitch %s", f.onsetRate, tmp);
    senseLine(2, features->speechPresent() ? COL_WARN : COL_TEXT,
              "speech %3d%% mod %3d%%  key %s  phase %4u ms",
              (int)(f.speech * 100), (int)(features->speechModulation() * 100),
              root >= 0 ? NOTE[root] : "-", f.phaseMs);

    // 3-4: radio
    if (radio && radio->isFitted()) {
        char fq[16];
        radio->formatFrequency(fq, sizeof(fq));
        senseLine(3, COL_ACTIVE, "RADIO %s %s rssi %2u snr %2u  %5.1f dB", radio->getBandName(), fq,
                  radio->getRSSI(), radio->getSNR(), rf.rmsDb);
        senseLine(4, COL_ACTIVE, "speech %3d%% on %4.1f/s RDS %-8s %.19s", (int)(rf.speech * 100),
                  rf.onsetRate, radio->getStationName(), radio->getRadioText());
    } else {
        senseLine(3, COL_DIM, "RADIO --  (IN R %5.1f dB)", rf.rmsDb);
        senseLine(4, COL_DIM, "speech/music %3d%%  onsets %4.1f/s", (int)(rf.speech * 100), rf.onsetRate);
    }

    // 5-6: motion (IMU), "--" when absent
    if (motion && motion->imuPresent()) {
        const MotionFrame& m = motion->motion();
        if (m.headingDeg >= 0) snprintf(tmp, sizeof(tmp), "%3d%s", (int)m.headingDeg, motion->compassCalibrated() ? "" : "?");
        else snprintf(tmp, sizeof(tmp), "--");
        senseLine(5, COL_TEXT, "MOVE %3d spm %5lu st  acc %4d mg  head %s",
                  (int)m.cadence, m.stepTotal, (int)m.accelRmsMg, tmp);
        static const char* GEST[5] = {"-", "shake", "tilt L", "tilt R", "flip"};
        static uint8_t lastG = 0;
        if (m.gesture) lastG = m.gesture;
        if (m.headingDeg >= 0) snprintf(tmp2, sizeof(tmp2), "mag %4.1f var %3.1f", m.magUt, m.magVarUt);
        else snprintf(tmp2, sizeof(tmp2), "mag --");
        senseLine(6, motion->isCalibrating() ? COL_WARN : COL_TEXT, "tilt %+3d %+3d %s IMU %02X %s%s",
                  (int)m.pitchDeg, (int)m.rollDeg, tmp2, motion->imuWhoAmI(),
                  (gesturesOn && *gesturesOn) ? "G:" : "g:", GEST[min(lastG, (uint8_t)4)]);
    } else {
        senseLine(5, COL_DIM, "MOVE --   (no IMU at 0x68)");
        senseLine(6, COL_DIM, "tilt --  mag --  IMU %s", motion && motion->imuWhoAmI() ? "?" : "--");
    }

    // 7: environment (barometer)
    if (motion && motion->baroPresent() && motion->env().valid) {
        const EnvFrame& e = motion->env();
        senseLine(7, COL_TEXT, "ENV %7.1f hPa %4.1f C dalt %+5.1f m fast %4.1f Pa",
                  e.pressurePa / 100.0f, e.tempC, e.daltM, e.fastPa);
    } else {
        senseLine(7, COL_DIM, "ENV --   (no BMP280 at 0x76)");
    }

    // 8: RF density + link state
    const LinkRf* rfd = espLink ? espLink->rf() : nullptr;
    if (rfd) snprintf(tmp, sizeof(tmp), "RF %2u AP med %d max %d", rfd->ap_count, rfd->rssi_median, rfd->rssi_max);
    else snprintf(tmp, sizeof(tmp), "RF --");
    if (espLink) {
        bool alive = espLink->espAlive();
        if (!alive) snprintf(tmp2, sizeof(tmp2), "no ESP32");
        else if (espLink->wifiRssi() == -128) snprintf(tmp2, sizeof(tmp2), "wifi -- srv %s", espLink->serverState() ? "up" : "dn");
        else snprintf(tmp2, sizeof(tmp2), "wifi %d srv %s", espLink->wifiRssi(), espLink->serverState() ? "up" : "dn");
        senseLine(8, alive ? COL_TEXT : COL_DIM, "%-24s %s", tmp, tmp2);
        // 9: link counters
        senseLine(9, espLink->rxErrors() ? COL_WARN : COL_TEXT, "tx %lu rx %lu err %lu drop %lu clip %s %lu/%lu",
                  espLink->framesSent(), espLink->framesReceived(), espLink->rxErrors(), espLink->txDropped(),
                  espLink->clipStatus(), espLink->clipsSent(), espLink->clipsBlocked());
    }
    // 10: plan
    if (renderer) {
        if (renderer->hasPlan()) {
            senseLine(10, COL_ACCENT, "PLAN %u  %d bars left  next %u  ok %lu bad %lu%s",
                      renderer->activePlanId(), renderer->barsLeft(), renderer->pendingPlanId(),
                      renderer->plansApplied(), renderer->plansRejected(), renderer->layersMuted() ? " MUTE" : "");
        } else {
            senseLine(10, COL_DIM, "PLAN none (layer 1) next %u ok %lu bad %lu%s",
                      renderer->pendingPlanId(), renderer->plansApplied(), renderer->plansRejected(),
                      renderer->layersMuted() ? " MUTE" : "");
        }
    }
    // 11: mapper
    if (mapper) {
        static const char* FOL[3] = {"", " F:PULSE", " F:WALK"};
        senseLine(11, COL_TEXT, "MAP dens %3d grain %3d cut %5d focus %3d%s",
                  (int)(mapper->value(MT_RHYTHM_DENSITY) * 100), (int)(mapper->value(MT_GRAIN_DENSITY) * 100),
                  (int)mapper->physical(MT_FILTER), (int)(mapper->value(MT_LAYER_FOCUS) * 360),
                  FOL[mapper->getFollow()]);
    }
    // 12: captures
    if (captures) {
        float usedS = captures->usedSamples() / AUDIO_SAMPLE_RATE_EXACT;
        float poolS = captures->poolSamples() / AUDIO_SAMPLE_RATE_EXACT;
        if (captures->isRecording()) {
            senseLine(12, COL_REC, "CAPS %d  REC %s %3d%%  %.0f/%.0f s", captures->count(),
                      sourceName(captures->recordingSource()),
                      (int)(captures->recordProgress() * 100), usedS, poolS);
        } else {
            senseLine(12, captures->isFallback() ? COL_WARN : COL_TEXT, "CAPS %d  %.1f/%.0f s  PSRAM %u MB%s",
                      captures->count(), usedS, poolS, external_psram_size,
                      captures->isFallback() ? " (RAM pool)" : "");
        }
    }
    // 13-14: CPU, memory, MIDI
    char* heapTop = sbrk(0);
    unsigned long heapFree = (unsigned long)((char*)&_heap_end - heapTop);
    senseLine(13, AudioProcessorUsageMax() > 70.0f ? COL_WARN : COL_TEXT,
              "CPU %4.1f%% max %4.1f%% feat %4lu us max %5lu lost %lu",
              AudioProcessorUsage(), AudioProcessorUsageMax(),
              features->getFrameMicros(), features->getMaxFrameMicros(), features->getLostBlocks());
    senseLine(14, COL_DIM, "mem %3d/%d max %3d heap %luK MIDI %s lineIn L%u R%u",
              AudioMemoryUsage(), AUDIO_MEMORY_BLOCKS, AudioMemoryUsageMax(), heapFree / 1024,
              (midiIO && midiIO->isClockLocked()) ? "clk" : "--", LINEIN_LEVEL_LEFT, LINEIN_LEVEL_RIGHT);
    senseLine(15, COL_DIM, "%s", i2cScan ? i2cScan : "I2C2 scan --");
}
