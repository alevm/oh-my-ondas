/**
 * Oh My Ondas - Input Manager Implementation
 * Unified input handling: direct GPIO + MCP23017 + ADS1115 + MPR121
 */

#include "input_manager.h"

// Quadrature lookup table: [oldState][newState] → direction (-1, 0, +1)
static const int8_t QUAD_TABLE[4][4] = {
    { 0, -1,  1,  0},
    { 1,  0,  0, -1},
    {-1,  0,  0,  1},
    { 0,  1, -1,  0}
};

// MCP23017 registers
#define MCP_IODIRA   0x00
#define MCP_IODIRB   0x01
#define MCP_GPPUA    0x0C
#define MCP_GPPUB    0x0D
#define MCP_GPIOA    0x12
#define MCP_GPIOB    0x13

// ADS1115 registers and config
#define ADS_REG_CONVERT  0x00
#define ADS_REG_CONFIG   0x01
#define ADS_CONFIG_OS     0x8000  // Start conversion
#define ADS_CONFIG_MUX(c) ((uint16_t)(0x4000 | ((c) << 12)))  // Single-ended
#define ADS_CONFIG_PGA_4V 0x0200  // +/-4.096V
#define ADS_CONFIG_MODE   0x0100  // Single-shot
#define ADS_CONFIG_DR_860 0x00E0  // 860 SPS
#define ADS_CONFIG_COMP   0x0003  // Disable comparator

InputManager::InputManager()
    : encoderCB(nullptr), buttonCB(nullptr), faderCB(nullptr)
    , joystickCB(nullptr), touchCB(nullptr)
    , joystickState(JOY_NONE), joystickLastState(JOY_NONE)
    , touchLast(0), touchReady(false)
    , mcpAReady(false), mcpBReady(false)
    , adsReady(false), adsCurrentChannel(0)
    , i2cErrorCount(0), mcpALastGood(0xFFFF), mcpBLastGood(0xFFFF)
    , lastEncoderPoll(0), lastButtonPoll(0), lastFaderPoll(0)
{
    memset(directEncPositions, 0, sizeof(directEncPositions));
    memset(mcpEncLastState, 0, sizeof(mcpEncLastState));
    memset(mcpEncAccum, 0, sizeof(mcpEncAccum));
    memset(buttonStates, 0, sizeof(buttonStates));
    memset(buttonLastStates, 0, sizeof(buttonLastStates));
    memset(buttonDebounce, 0, sizeof(buttonDebounce));
    memset(faderValues, 0, sizeof(faderValues));
    memset(faderLastValues, 0, sizeof(faderLastValues));

    memset(adsLastGood, 0, sizeof(adsLastGood));

    for (int i = 0; i < NUM_DIRECT_ENCODERS; i++) {
        directEncoders[i] = nullptr;
    }
}

void InputManager::begin() {
    DEBUG_PRINTLN("InputManager: Initializing...");

    initDirectEncoders();
    initMCP23017();
    initADS1115();
    initDirectButtons();
    initJoystick();
    initTouch();

    DEBUG_PRINTLN("InputManager: Ready");
}

void InputManager::update() {
    unsigned long now = millis();

    // Touch pads: every loop (low latency)
    pollTouch();

    // MCP encoders: fast polling (every 2ms)
    if (now - lastEncoderPoll >= ENCODER_POLL_MS) {
        pollDirectEncoders();
        if (mcpAReady) pollMCPEncoders();
        lastEncoderPoll = now;
    }

    // Buttons + joystick: every 10ms
    if (now - lastButtonPoll >= 10) {
        pollDirectButtons();
        if (mcpBReady) pollMCPButtons();
        pollJoystick();
        lastButtonPoll = now;
    }

    // Faders: every 20ms (50Hz, smooth enough)
    if (now - lastFaderPoll >= 20) {
        pollFaders();
        lastFaderPoll = now;
    }
}

// ============================================
// INITIALIZATION
// ============================================

void InputManager::initDirectEncoders() {
    static Encoder enc1(ENC1_CLK, ENC1_DT);
    static Encoder enc2(ENC2_CLK, ENC2_DT);
    static Encoder enc3(ENC3_CLK, ENC3_DT);
    static Encoder enc4(ENC4_CLK, ENC4_DT);
    static Encoder enc5(ENC5_CLK, ENC5_DT);

    directEncoders[0] = &enc1;
    directEncoders[1] = &enc2;
    directEncoders[2] = &enc3;
    directEncoders[3] = &enc4;
    directEncoders[4] = &enc5;

    // Encoder push switches
    pinMode(ENC1_SW, INPUT_PULLUP);
    pinMode(ENC2_SW, INPUT_PULLUP);
    pinMode(ENC3_SW, INPUT_PULLUP);
    pinMode(ENC4_SW, INPUT_PULLUP);
    pinMode(ENC5_SW, INPUT_PULLUP);

    DEBUG_PRINTLN("  Direct encoders: OK (5)");
}

void InputManager::initMCP23017() {
    // MCP23017 #1 (0x20): all 16 pins as inputs with pull-ups (8 encoders)
    Wire.beginTransmission(ADDR_MCP23017A);
    if (Wire.endTransmission() == 0) {
        mcpWrite8(ADDR_MCP23017A, MCP_IODIRA, 0xFF);  // Port A: all input
        mcpWrite8(ADDR_MCP23017A, MCP_IODIRB, 0xFF);  // Port B: all input
        mcpWrite8(ADDR_MCP23017A, MCP_GPPUA,  0xFF);  // Port A: pull-ups
        mcpWrite8(ADDR_MCP23017A, MCP_GPPUB,  0xFF);  // Port B: pull-ups
        mcpAReady = true;

        // Read initial state for encoders
        uint16_t pins;
        if (mcpRead16(ADDR_MCP23017A, MCP_GPIOA, pins)) {
            mcpALastGood = pins;
            for (int i = 0; i < NUM_MCP_ENCODERS; i++) {
                int bitPos = i * 2;
                mcpEncLastState[i] = (pins >> bitPos) & 0x03;
            }
        }
        DEBUG_PRINTLN("  MCP23017 #1 (encoders): OK");
    } else {
        DEBUG_PRINTLN("  MCP23017 #1 (encoders): NOT FOUND");
    }

    // MCP23017 #2 (0x21): all 16 pins as inputs with pull-ups (14 buttons + 2 nav)
    Wire.beginTransmission(ADDR_MCP23017B);
    if (Wire.endTransmission() == 0) {
        mcpWrite8(ADDR_MCP23017B, MCP_IODIRA, 0xFF);
        mcpWrite8(ADDR_MCP23017B, MCP_IODIRB, 0xFF);
        mcpWrite8(ADDR_MCP23017B, MCP_GPPUA,  0xFF);
        mcpWrite8(ADDR_MCP23017B, MCP_GPPUB,  0xFF);
        mcpBReady = true;
        DEBUG_PRINTLN("  MCP23017 #2 (buttons): OK");
    } else {
        DEBUG_PRINTLN("  MCP23017 #2 (buttons): NOT FOUND");
    }
}

void InputManager::initADS1115() {
    Wire.beginTransmission(ADDR_ADS1115);
    if (Wire.endTransmission() == 0) {
        adsReady = true;
        DEBUG_PRINTLN("  ADS1115 (faders): OK");
    } else {
        DEBUG_PRINTLN("  ADS1115 (faders): NOT FOUND");
    }

    // Teensy ADC for crossfader
    analogReadResolution(12);
    pinMode(CROSSFADER_PIN, INPUT);
    DEBUG_PRINTLN("  Crossfader ADC: OK");
}

void InputManager::initDirectButtons() {
    pinMode(BTN_PIN_MODE,  INPUT_PULLUP);
    pinMode(BTN_PIN_SHIFT, INPUT_PULLUP);
    pinMode(BTN_PIN_REC,   INPUT_PULLUP);
    pinMode(BTN_PIN_PLAY,  INPUT_PULLUP);

    for (int i = 0; i < BTN_COUNT; i++) {
        buttonStates[i] = false;
        buttonLastStates[i] = false;
    }
    DEBUG_PRINTLN("  Direct buttons: OK (4)");
}

void InputManager::initJoystick() {
    pinMode(JOY_UP_PIN,    INPUT_PULLUP);
    pinMode(JOY_DOWN_PIN,  INPUT_PULLUP);
    pinMode(JOY_LEFT_PIN,  INPUT_PULLUP);
    pinMode(JOY_RIGHT_PIN, INPUT_PULLUP);
    // JOY_CENTER is on MCP#2 Port B bit 5 — read during pollMCPButtons
    DEBUG_PRINTLN("  Joystick: OK");
}

void InputManager::initTouch() {
    if (touchSensor.begin(ADDR_MPR121)) {
        touchReady = true;
        DEBUG_PRINTLN("  MPR121 touch: OK");
    } else {
        DEBUG_PRINTLN("  MPR121 touch: NOT FOUND");
    }
}

// ============================================
// POLLING
// ============================================

void InputManager::pollDirectEncoders() {
    for (int i = 0; i < NUM_DIRECT_ENCODERS; i++) {
        if (!directEncoders[i]) continue;
        long newPos = directEncoders[i]->read() / 4;  // 4 counts per detent
        if (newPos != directEncPositions[i]) {
            int delta = (int)(newPos - directEncPositions[i]);
            directEncPositions[i] = newPos;
            if (encoderCB) encoderCB(i, delta);  // IDs 0-4 = direct encoders
        }
    }
}

void InputManager::pollMCPEncoders() {
    // Read all 16 pins in one I2C transaction
    uint16_t pins;
    if (!mcpRead16(ADDR_MCP23017A, MCP_GPIOA, pins)) {
        pins = mcpALastGood;  // same state → quadrature decode yields 0 = safe
    } else {
        mcpALastGood = pins;
    }

    for (int i = 0; i < NUM_MCP_ENCODERS; i++) {
        int bitPos = i * 2;
        uint8_t newState = (pins >> bitPos) & 0x03;

        if (newState != mcpEncLastState[i]) {
            int8_t dir = decodeQuadrature(mcpEncLastState[i], newState);
            mcpEncLastState[i] = newState;

            if (dir != 0) {
                mcpEncAccum[i] += dir;
                // Report every 4 transitions (one detent)
                if (mcpEncAccum[i] >= 4 || mcpEncAccum[i] <= -4) {
                    int delta = (mcpEncAccum[i] > 0) ? 1 : -1;
                    mcpEncAccum[i] = 0;
                    // MCP encoder IDs start at NUM_DIRECT_ENCODERS
                    if (encoderCB) encoderCB(NUM_DIRECT_ENCODERS + i, delta);
                }
            }
        }
    }
}

void InputManager::pollDirectButtons() {
    unsigned long now = millis();
    // Map: BTN_MODE=0 → pin 26, BTN_SHIFT=1 → pin 27, BTN_REC=2 → pin 28, BTN_PLAY=3 → pin 29
    const uint8_t directPins[NUM_DIRECT_BUTTONS] = {
        BTN_PIN_MODE, BTN_PIN_SHIFT, BTN_PIN_REC, BTN_PIN_PLAY
    };

    for (int i = 0; i < NUM_DIRECT_BUTTONS; i++) {
        bool pressed = (digitalRead(directPins[i]) == LOW);

        if (pressed != buttonStates[i] && (now - buttonDebounce[i]) > DEBOUNCE_MS) {
            buttonStates[i] = pressed;
            buttonDebounce[i] = now;
            if (buttonCB) buttonCB(i, pressed);
        }
    }
}

void InputManager::pollMCPButtons() {
    unsigned long now = millis();
    uint16_t pins;
    if (!mcpRead16(ADDR_MCP23017B, MCP_GPIOA, pins)) {
        pins = mcpBLastGood;  // no state change → no spurious button events
    } else {
        mcpBLastGood = pins;
    }

    // MCP#2 Port A (bits 0-7): STOP, PIC, SND, INT, JRN, MENU, BACK, PAGE
    // MCP#2 Port B (bits 8-13): DUB, FILL, CLR, SCN, BANK, JOY_CENTER
    // MCP#2 Port B (bits 14-15): PREV, NEXT
    for (int i = 0; i < NUM_MCP_BUTTONS; i++) {
        int btnID = NUM_DIRECT_BUTTONS + i;  // offset by direct buttons
        bool pressed = !((pins >> i) & 1);    // active low with pull-ups

        if (pressed != buttonStates[btnID] && (now - buttonDebounce[btnID]) > DEBOUNCE_MS) {
            buttonStates[btnID] = pressed;
            buttonDebounce[btnID] = now;

            // Special case: bit 5 of Port B (index 13) is JOY_CENTER
            // It's mapped to a button in the ButtonID enum, handled normally

            if (buttonCB) buttonCB(btnID, pressed);
        }
    }

    // PREV/NEXT are the last two MCP buttons (index 14,15 in Port B = bits 14,15)
    for (int i = 0; i < 2; i++) {
        int btnID = BTN_PREV + i;
        int bit = 14 + i;
        bool pressed = !((pins >> bit) & 1);

        if (pressed != buttonStates[btnID] && (now - buttonDebounce[btnID]) > DEBOUNCE_MS) {
            buttonStates[btnID] = pressed;
            buttonDebounce[btnID] = now;
            if (buttonCB) buttonCB(btnID, pressed);
        }
    }
}

void InputManager::pollFaders() {
    // ADS1115: 4 mixer faders (channels 0-3)
    if (adsReady) {
        for (int ch = 0; ch < NUM_FADERS; ch++) {
            int16_t raw;
            if (!adsReadChannel(ch, raw)) {
                raw = adsLastGood[ch];  // hold last position on error
            } else {
                adsLastGood[ch] = raw;
            }
            float value = constrain((float)raw / 32767.0f, 0.0f, 1.0f);

            if (fabsf(value - faderLastValues[ch]) > FADER_THRESHOLD) {
                faderValues[ch] = value;
                faderLastValues[ch] = value;
                if (faderCB) faderCB(ch, value);
            }
        }
    }

    // Teensy ADC: crossfader (pin 39/A15)
    int raw = analogRead(CROSSFADER_PIN);
    float value = (float)raw / 4095.0f;  // 12-bit ADC

    if (fabsf(value - faderLastValues[FADER_XFADE]) > FADER_THRESHOLD) {
        faderValues[FADER_XFADE] = value;
        faderLastValues[FADER_XFADE] = value;
        if (faderCB) faderCB(FADER_XFADE, value);
    }
}

void InputManager::pollJoystick() {
    uint8_t state = JOY_NONE;

    if (digitalRead(JOY_UP_PIN) == LOW)    state |= JOY_UP;
    if (digitalRead(JOY_DOWN_PIN) == LOW)  state |= JOY_DOWN;
    if (digitalRead(JOY_LEFT_PIN) == LOW)  state |= JOY_LEFT;
    if (digitalRead(JOY_RIGHT_PIN) == LOW) state |= JOY_RIGHT;

    // JOY_CENTER comes from MCP#2 button — it's already handled as BTN_COUNT-related
    // but also expose it in joystick state for convenience
    if (buttonStates[BTN_STOP + 13]) state |= JOY_CENTER;  // MCP Port B bit 5

    if (state != joystickLastState) {
        joystickState = state;
        joystickLastState = state;
        if (joystickCB) joystickCB(state);
    }
}

void InputManager::pollTouch() {
    if (!touchReady) return;

    uint16_t current = touchSensor.touched();

    for (int i = 0; i < MAX_PADS; i++) {
        bool wasPressed = (touchLast >> i) & 1;
        bool isPressed  = (current >> i) & 1;

        if (isPressed && !wasPressed) {
            if (touchCB) touchCB(i, true);
        } else if (!isPressed && wasPressed) {
            if (touchCB) touchCB(i, false);
        }
    }

    touchLast = current;
}

// ============================================
// QUERIES
// ============================================

float InputManager::getFaderValue(int faderID) {
    if (faderID >= 0 && faderID < FADER_COUNT) {
        return faderValues[faderID];
    }
    return 0.0f;
}

bool InputManager::isButtonPressed(int buttonID) {
    if (buttonID >= 0 && buttonID < BTN_COUNT) {
        return buttonStates[buttonID];
    }
    return false;
}

uint8_t InputManager::getJoystickState() {
    return joystickState;
}

// ============================================
// I2C HELPERS
// ============================================

bool InputManager::mcpRead16(uint8_t addr, uint8_t reg, uint16_t& outVal) {
    Wire.beginTransmission(addr);
    Wire.write(reg);
    if (Wire.endTransmission(false) != 0) {
        i2cErrorCount++;
        return false;
    }
    if (Wire.requestFrom(addr, (uint8_t)2) < 2) {
        i2cErrorCount++;
        return false;
    }
    outVal = Wire.read();
    outVal |= (uint16_t)Wire.read() << 8;
    return true;
}

bool InputManager::mcpWrite8(uint8_t addr, uint8_t reg, uint8_t value) {
    Wire.beginTransmission(addr);
    Wire.write(reg);
    Wire.write(value);
    if (Wire.endTransmission() != 0) {
        i2cErrorCount++;
        return false;
    }
    return true;
}

bool InputManager::adsReadChannel(uint8_t channel, int16_t& outVal) {
    if (channel > 3) return false;

    // Configure ADS1115 for single-ended read on specified channel
    uint16_t config = ADS_CONFIG_OS
                    | ADS_CONFIG_MUX(channel)
                    | ADS_CONFIG_PGA_4V
                    | ADS_CONFIG_MODE
                    | ADS_CONFIG_DR_860
                    | ADS_CONFIG_COMP;

    // Write config
    Wire.beginTransmission(ADDR_ADS1115);
    Wire.write(ADS_REG_CONFIG);
    Wire.write((uint8_t)(config >> 8));
    Wire.write((uint8_t)(config & 0xFF));
    if (Wire.endTransmission() != 0) {
        i2cErrorCount++;
        return false;
    }

    // Wait for conversion (860 SPS ≈ 1.2ms)
    delayMicroseconds(1200);

    // Read result
    Wire.beginTransmission(ADDR_ADS1115);
    Wire.write(ADS_REG_CONVERT);
    if (Wire.endTransmission(false) != 0) {
        i2cErrorCount++;
        return false;
    }
    if (Wire.requestFrom((uint8_t)ADDR_ADS1115, (uint8_t)2) < 2) {
        i2cErrorCount++;
        return false;
    }
    outVal = (int16_t)Wire.read() << 8;
    outVal |= Wire.read();
    return true;
}

int8_t InputManager::decodeQuadrature(uint8_t oldState, uint8_t newState) {
    return QUAD_TABLE[oldState & 0x03][newState & 0x03];
}
