/**
 * Oh My Ondas - UI Manager Implementation
 * Display and LED control with real subsystem data
 */

#include "ui_manager.h"
#include "sequencer.h"
#include "fx_engine.h"
#include "sampling_engine.h"
#include "scene_manager.h"

// Forward-declare SystemState (defined in main.ino)
struct SystemState {
    int mode;
    bool isPlaying;
    bool isRecording;
    bool shiftPressed;
    uint8_t currentPattern;
    uint8_t currentScene;
    float masterVolume;
    float bpm;
    struct { float lat; float lon; bool valid; unsigned long lastUpdate; } gps;
};

UIManager::UIManager()
    : display(nullptr)
    , leds(nullptr)
    , currentScreen(SCREEN_MAIN)
    , messageStartTime(0)
    , messageDuration(0)
    , messageActive(false)
{
    messageBuffer[0] = '\0';
}

void UIManager::begin(Adafruit_SSD1306* disp, Adafruit_NeoPixel* ledRing) {
    display = disp;
    leds = ledRing;
    DEBUG_PRINTLN("UIManager: Initialized");
}

void UIManager::update(SystemState& state, Sequencer& seq, FXEngine& fx,
                       SamplingEngine& sampler, SceneManager& scenes) {
    if (!display) return;

    if (messageActive && (millis() - messageStartTime > (unsigned long)messageDuration)) {
        messageActive = false;
    }

    display->clearDisplay();

    switch (currentScreen) {
        case SCREEN_MAIN:    drawMainScreen(state, seq, sampler); break;
        case SCREEN_PATTERN: drawPatternScreen(state, seq);       break;
        case SCREEN_FX:      drawFXScreen(state, fx);             break;
        case SCREEN_SCENE:   drawSceneScreen(state, scenes);      break;
        case SCREEN_SETTINGS: drawSettingsScreen(state);          break;
        default: break;
    }

    if (messageActive) {
        drawMessageOverlay();
    }

    display->display();
}

// Screen control
void UIManager::setScreen(UIScreen screen) {
    currentScreen = screen;
}

UIScreen UIManager::getCurrentScreen() {
    return currentScreen;
}

// Messages
void UIManager::showMessage(const char* message, int durationMs) {
    strncpy(messageBuffer, message, 63);
    messageBuffer[63] = '\0';
    messageStartTime = millis();
    messageDuration = durationMs;
    messageActive = true;
}

void UIManager::showError(const char* error) {
    showMessage(error, 3000);
}

void UIManager::clearMessage() {
    messageActive = false;
}

// Display helpers
void UIManager::drawWaveform(int16_t* samples, int count, int x, int y, int width, int height) {
    if (!display) return;
    int halfHeight = height / 2;
    int yCenter = y + halfHeight;

    for (int i = 0; i < width && i < count; i++) {
        int sampleIndex = (i * count) / width;
        int amplitude = (samples[sampleIndex] * halfHeight) / 32768;
        display->drawPixel(x + i, yCenter - amplitude, SSD1306_WHITE);
    }
}

void UIManager::drawVUMeter(float level, int x, int y, int width, int height) {
    if (!display) return;
    int fillWidth = (int)(level * width);
    display->drawRect(x, y, width, height, SSD1306_WHITE);
    if (fillWidth > 0) {
        display->fillRect(x, y, fillWidth, height, SSD1306_WHITE);
    }
}

void UIManager::drawProgress(float progress, int x, int y, int width) {
    if (!display) return;
    int fillWidth = (int)(progress * width);
    display->drawLine(x, y, x + width, y, SSD1306_WHITE);
    display->fillRect(x, y - 1, fillWidth, 3, SSD1306_WHITE);
}

void UIManager::drawPattern(int currentStep, bool* steps, int stepCount) {
    if (!display) return;
    int startX = 0;
    int y = 48;
    int boxW = SCREEN_WIDTH / stepCount;

    for (int i = 0; i < stepCount; i++) {
        int x = startX + i * boxW;
        if (steps[i]) {
            display->fillRect(x, y, boxW - 1, 8, SSD1306_WHITE);
        } else {
            display->drawRect(x, y, boxW - 1, 8, SSD1306_WHITE);
        }
        if (i == currentStep) {
            display->drawRect(x, y - 1, boxW - 1, 10, SSD1306_WHITE);
        }
    }
}

// LED control
void UIManager::setLEDColor(int led, uint32_t color) {
    if (leds && led >= 0 && led < LED_COUNT) {
        leds->setPixelColor(led, color);
    }
}

void UIManager::setAllLEDs(uint32_t color) {
    if (!leds) return;
    for (int i = 0; i < LED_COUNT; i++) {
        leds->setPixelColor(i, color);
    }
}

void UIManager::setLEDBrightness(uint8_t brightness) {
    if (leds) {
        leds->setBrightness(brightness);
    }
}

// ============================================
// SCREEN DRAWING
// ============================================

void UIManager::drawMainScreen(SystemState& state, Sequencer& seq, SamplingEngine& sampler) {
    drawHeader(state);

    // BPM
    display->setCursor(0, 16);
    display->printf("BPM: %.1f", state.bpm);

    // Volume bar
    display->setCursor(0, 26);
    display->print("VOL:");
    drawVUMeter(state.masterVolume, 30, 26, 60, 6);

    // Pattern/Scene
    display->setCursor(0, 36);
    display->printf("PAT:%d SCN:%d", state.currentPattern + 1, state.currentScene + 1);

    // Step position (if playing)
    if (state.isPlaying) {
        int step = seq.getCurrentStep();
        int len = seq.getPatternLength();
        display->setCursor(90, 36);
        display->printf("S%d/%d", step + 1, len);
    }

    // Track activity indicators
    display->setCursor(0, 48);
    for (int i = 0; i < MAX_TRACKS; i++) {
        if (sampler.isPlaying(i)) {
            display->fillRect(i * 16, 48, 14, 6, SSD1306_WHITE);
        } else if (sampler.isSampleLoaded(i)) {
            display->drawRect(i * 16, 48, 14, 6, SSD1306_WHITE);
        }
    }

    drawFooter(state);
}

void UIManager::drawPatternScreen(SystemState& state, Sequencer& seq) {
    drawHeader(state);

    int selTrack = seq.getSelectedTrack();
    int curStep = seq.getCurrentStep();
    int len = seq.getPatternLength();

    // Track indicator
    display->setCursor(0, 14);
    display->printf("T%d", selTrack + 1);
    if (seq.isTrackMuted(selTrack)) {
        display->print(" [M]");
    }
    if (seq.isTrackSoloed(selTrack)) {
        display->print(" [S]");
    }

    // 16-step grid: 8x2 layout
    int boxW = 15;
    int boxH = 10;
    for (int row = 0; row < 2; row++) {
        for (int col = 0; col < 8; col++) {
            int step = row * 8 + col;
            if (step >= len) break;

            int x = col * boxW + 1;
            int y = 24 + row * (boxH + 2);

            bool active = seq.getStep(selTrack, step);
            TrigCondition cond = seq.getTrigCondition(selTrack, step);

            if (active) {
                display->fillRect(x, y, boxW - 2, boxH, SSD1306_WHITE);
                // Show trig condition indicator inside active steps
                if (cond != TRIG_ALWAYS) {
                    display->setCursor(x + 2, y + 2);
                    display->setTextColor(SSD1306_BLACK);
                    display->print(cond);
                    display->setTextColor(SSD1306_WHITE);
                }
            } else {
                display->drawRect(x, y, boxW - 2, boxH, SSD1306_WHITE);
            }

            // Current step highlight
            if (step == curStep && state.isPlaying) {
                display->drawRect(x - 1, y - 1, boxW, boxH + 2, SSD1306_WHITE);
            }
        }
    }

    drawFooter(state);
}

void UIManager::drawFXScreen(SystemState& state, FXEngine& fx) {
    drawHeader(state);

    // Effect name (large)
    display->setTextSize(2);
    display->setCursor(0, 14);
    display->print(fx.getEffectName(fx.getCurrentEffect()));
    display->setTextSize(1);

    // Parameter bars
    const char* paramNames[] = {"P1", "P2", "P3"};
    for (int i = 0; i < 3; i++) {
        int y = 34 + i * 9;
        display->setCursor(0, y);
        display->print(paramNames[i]);
        drawVUMeter(fx.getParam(i), 18, y, 80, 5);

        // Value text
        display->setCursor(102, y);
        display->printf("%d", (int)(fx.getParam(i) * 100));
    }

    // Mix level at bottom
    display->setCursor(0, 56);
    display->printf("MIX: %d%%", (int)(fx.getMix() * 100));

    // No footer - FX screen uses full space
}

void UIManager::drawSceneScreen(SystemState& state, SceneManager& scenes) {
    drawHeader(state);

    display->setCursor(0, 14);
    display->println("SCENES");

    // 4 scene slot boxes (2x2 grid) using letters A-D for first 4
    const char slotLabels[] = "ABCDEFGH";
    int boxW = 28;
    int boxH = 16;

    for (int i = 0; i < 8 && i < MAX_SCENES; i++) {
        int col = i % 4;
        int row = i / 4;
        int x = col * (boxW + 4) + 2;
        int y = 24 + row * (boxH + 4);

        if (scenes.isSceneSaved(i)) {
            display->fillRect(x, y, boxW, boxH, SSD1306_WHITE);
            display->setCursor(x + 10, y + 4);
            display->setTextColor(SSD1306_BLACK);
            display->print(slotLabels[i]);
            display->setTextColor(SSD1306_WHITE);
        } else {
            display->drawRect(x, y, boxW, boxH, SSD1306_WHITE);
            display->setCursor(x + 10, y + 4);
            display->print(slotLabels[i]);
        }

        // Highlight current scene
        if (i == state.currentScene) {
            display->drawRect(x - 1, y - 1, boxW + 2, boxH + 2, SSD1306_WHITE);
        }
    }

    drawFooter(state);
}

void UIManager::drawSettingsScreen(SystemState& state) {
    drawHeader(state);

    display->setCursor(0, 14);
    display->printf("CPU: %.1f%%", AudioProcessorUsage());

    display->setCursor(0, 24);
    display->printf("MEM: %d/%d blk", AudioMemoryUsage(), AudioMemoryUsageMax());

    display->setCursor(0, 34);
    display->printf("Bank: %d", 0);

    display->setCursor(0, 44);
    display->printf("Pattern: %d", state.currentPattern + 1);

    if (state.gps.valid) {
        display->setCursor(0, 54);
        display->printf("GPS: %.4f,%.4f", state.gps.lat, state.gps.lon);
    }
}

void UIManager::drawMessageOverlay() {
    int textLen = strlen(messageBuffer);
    int boxW = textLen * 6 + 8;
    if (boxW > SCREEN_WIDTH - 4) boxW = SCREEN_WIDTH - 4;
    int boxX = (SCREEN_WIDTH - boxW) / 2;
    int boxY = 20;

    display->fillRect(boxX, boxY, boxW, 20, SSD1306_BLACK);
    display->drawRect(boxX, boxY, boxW, 20, SSD1306_WHITE);
    display->setCursor(boxX + 4, boxY + 6);
    display->print(messageBuffer);
}

void UIManager::drawHeader(SystemState& state) {
    display->setTextSize(1);
    display->setCursor(0, 0);
    display->print(getModeString(state.mode));

    if (state.isRecording) {
        display->setCursor(SCREEN_WIDTH - 18, 0);
        display->print("REC");
    } else if (state.isPlaying) {
        display->setCursor(SCREEN_WIDTH - 12, 0);
        display->print("> ");
    }

    display->drawLine(0, 10, SCREEN_WIDTH, 10, SSD1306_WHITE);
}

void UIManager::drawFooter(SystemState& state) {
    display->drawLine(0, 54, SCREEN_WIDTH, 54, SSD1306_WHITE);
    display->setCursor(0, 56);
    display->printf("%.0f BPM", state.bpm);

    if (state.shiftPressed) {
        display->setCursor(SCREEN_WIDTH - 30, 56);
        display->print("SHIFT");
    }
}

const char* UIManager::getModeString(int mode) {
    switch (mode) {
        case 0: return "LIVE";
        case 1: return "PATTERN";
        case 2: return "SCENE";
        case 3: return "DUB";
        case 4: return "AI";
        default: return "???";
    }
}
