/**
 * Oh My Ondas - UI Manager Implementation
 * Display and LED control
 */

#include "ui_manager.h"

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

void UIManager::update(SystemState& state) {
    if (!display) return;

    // Check if message should expire
    if (messageActive && (millis() - messageStartTime > (unsigned long)messageDuration)) {
        messageActive = false;
    }

    display->clearDisplay();

    // Draw current screen
    switch (currentScreen) {
        case SCREEN_MAIN:    drawMainScreen(state);    break;
        case SCREEN_PATTERN: drawPatternScreen(state);  break;
        case SCREEN_FX:      drawFXScreen(state);       break;
        case SCREEN_SCENE:   drawSceneScreen(state);    break;
        case SCREEN_SETTINGS: drawSettingsScreen(state); break;
        default: break;
    }

    // Draw message overlay if active
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
    DEBUG_PRINTF("UIManager: Message '%s'\n", message);
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
    display->drawLine(x, y, x + fillWidth, y, SSD1306_WHITE);
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

void UIManager::animateLEDs(int pattern) {
    // TODO: Implement LED animation patterns
    (void)pattern;
}

// Private screen drawing methods
void UIManager::drawMainScreen(SystemState& state) {
    drawHeader(state);

    // BPM display
    display->setCursor(0, 16);
    display->printf("BPM: %.1f", state.bpm);

    // Volume display
    display->setCursor(0, 28);
    display->printf("VOL: %d%%", (int)(state.masterVolume * 100));

    // Pattern display
    display->setCursor(0, 40);
    display->printf("PAT: %d  SCN: %d", state.currentPattern + 1, state.currentScene + 1);

    drawFooter(state);
}

void UIManager::drawPatternScreen(SystemState& state) {
    drawHeader(state);

    display->setCursor(0, 16);
    display->println("PATTERN EDIT");

    drawFooter(state);
}

void UIManager::drawFXScreen(SystemState& state) {
    drawHeader(state);

    display->setCursor(0, 16);
    display->println("FX CHAIN");

    drawFooter(state);
}

void UIManager::drawSceneScreen(SystemState& state) {
    drawHeader(state);

    display->setCursor(0, 16);
    display->println("SCENES");

    drawFooter(state);
}

void UIManager::drawSettingsScreen(SystemState& state) {
    drawHeader(state);

    display->setCursor(0, 16);
    display->println("SETTINGS");

    drawFooter(state);
}

void UIManager::drawMessageOverlay() {
    // Draw centered message box
    int textLen = strlen(messageBuffer);
    int boxW = textLen * 6 + 8;
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

    // Transport indicator
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
