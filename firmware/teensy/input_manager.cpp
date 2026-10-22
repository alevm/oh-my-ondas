/**
 * Oh My Ondas - Input Manager Implementation
 * Unified input handling on Wire2: Quad encoders + ANO nav + MCP23017 +
 * ADS1115 + CAP1188, plus fader 5 on the Teensy ADC
 */

#include "input_manager.h"

static const uint8_t QUAD_SWITCH[QUAD_ENCODERS_PER] = QUAD_SWITCH_PINS;
static const uint8_t ENC_PUSH[ENC_COUNT] = ENC_PUSH_BUTTONS;

// ANO seesaw pins in JoystickDir bit order: up, down, left, right, centre
static const uint8_t ANO_PINS[5] = {ANO_SW_UP, ANO_SW_DOWN, ANO_SW_LEFT, ANO_SW_RIGHT, ANO_SW_SELECT};

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
    , quadSwitchMask(0)
    , ano(nullptr), anoReady(false), anoSwitchMask(0), wheelPosition(0)
    , anoDirs(0), mcpDirs(0), mcpDirsRaw(0)
    , joystickState(JOY_NONE), joystickLastState(JOY_NONE), lastAnoPoll(0)
    , touchLast(0), touchReady(false)
    , mcpReady(false)
    , adsReady(false), adsCurrentChannel(0), adsPending(false)
    , i2cErrorCount(0), mcpLastGood(0xFFFF)
    , lastEncoderPoll(0), lastButtonPoll(0), lastFaderPoll(0), lastTouchPoll(0)
{
    memset(buttonStates, 0, sizeof(buttonStates));
    memset(buttonLastStates, 0, sizeof(buttonLastStates));
    memset(buttonDebounce, 0, sizeof(buttonDebounce));
    memset(faderValues, 0, sizeof(faderValues));
    memset(faderLastValues, 0, sizeof(faderLastValues));
    memset(adsLastGood, 0, sizeof(adsLastGood));

    for (int q = 0; q < NUM_QUAD_BOARDS; q++) {
        quads[q] = nullptr;
        quadReady[q] = false;
    }
}

void InputManager::begin() {
    DEBUG_PRINTLN("InputManager: Initializing...");

    initQuads();
    initANO();
    initMCP23017();
    initADS1115();
    initTouch();

    DEBUG_PRINTLN("InputManager: Ready");
}

void InputManager::update() {
    unsigned long now = millis();

    // Touch pads: every TOUCH_POLL_MS (one I2C read, ~0.3 ms)
    if (now - lastTouchPoll >= TOUCH_POLL_MS) {
        pollTouch();
        lastTouchPoll = now;
    }

    // Quad encoders + their push switches
#if QUAD_USE_INT
    // INT (both boards, wired-OR, active low) says something changed; the
    // fallback poll keeps the boards working if the INT wire is missing
    if (digitalReadFast(QUAD_INT_PIN) == LOW || now - lastEncoderPoll >= QUAD_FALLBACK_POLL_MS) {
        pollQuads();
        lastEncoderPoll = now;
    }
#else
    if (now - lastEncoderPoll >= ENCODER_POLL_MS) {
        pollQuads();
        lastEncoderPoll = now;
    }
#endif

    // ANO nav: same INT line if wired there, else its own poll period
#if QUAD_USE_INT
    if (digitalReadFast(QUAD_INT_PIN) == LOW || now - lastAnoPoll >= ANO_POLL_MS) {
#else
    if (now - lastAnoPoll >= ANO_POLL_MS) {
#endif
        if (anoReady) pollANO();
        lastAnoPoll = now;
    }

    // Buttons: every 10ms
    if (now - lastButtonPoll >= 10) {
        if (mcpReady) pollMCP();
        lastButtonPoll = now;
    }

    // Faders: one ADS1115 channel per poll, no waiting on conversions
    if (now - lastFaderPoll >= FADER_POLL_MS) {
        pollFaders();
        lastFaderPoll = now;
    }
}

// ============================================
// INITIALIZATION
// ============================================

void InputManager::initQuads() {
    static QuadBoard quad1(&UI_WIRE);
    static QuadBoard quad2(&UI_WIRE);
    quads[0] = &quad1;
    quads[1] = &quad2;
    const uint8_t addr[NUM_QUAD_BOARDS] = {ADDR_QUAD1, ADDR_QUAD2};

    for (int e = 0; e < QUAD_ENCODERS_PER; e++) quadSwitchMask |= 1UL << QUAD_SWITCH[e];
#if QUAD_USE_INT
    pinMode(QUAD_INT_PIN, INPUT_PULLUP);  // reads HIGH if the INT wire is missing
#endif

    for (int q = 0; q < NUM_QUAD_BOARDS; q++) {
        quadReady[q] = quads[q]->begin(addr[q]);
        if (quadReady[q]) {
            quads[q]->pinModeBulk(quadSwitchMask, INPUT_PULLUP);
            // Zero the hardware counters so the first poll reports no movement
            for (int e = 0; e < QUAD_ENCODERS_PER; e++) quads[q]->getEncoderDelta(e);
#if QUAD_USE_INT
            // Raise INT on any turn or push of the encoders in use (Quad #2 has 3);
            // INT is open drain, both boards share pin 32
            int used = (q == 0) ? QUAD_ENCODERS_PER : ENC_COUNT - QUAD_ENCODERS_PER;
            for (int e = 0; e < used; e++) quads[q]->enableEncoderInterrupt(e);
            quads[q]->setGPIOInterrupts(quadSwitchMask, true);
            quads[q]->clearGpioInterrupts();
#endif
        }
        DEBUG_PRINTF("  Quad encoder #%d (0x%02X): %s\n", q + 1, addr[q], quadReady[q] ? "OK" : "NOT FOUND");
    }
}

void InputManager::initANO() {
    static QuadBoard anoBoard(&UI_WIRE);
    ano = &anoBoard;
    for (int i = 0; i < 5; i++) anoSwitchMask |= 1UL << ANO_PINS[i];

    anoReady = ano->begin(ADDR_ANO);
    if (anoReady) {
        uint16_t pid = (ano->getVersion() >> 16) & 0xFFFF;
        if (pid != 5740) DEBUG_PRINTF("  ANO: unexpected seesaw product %u (want 5740)\n", pid);
        ano->pinModeBulk(anoSwitchMask, INPUT_PULLUP);
        wheelPosition = 0;
        ano->getEncoderDelta(ANO_ENCODER);  // zero the counter
#if QUAD_USE_INT
        // Harmless if its INT is not wired: the poll period still applies
        ano->enableEncoderInterrupt(ANO_ENCODER);
        ano->setGPIOInterrupts(anoSwitchMask, true);
        ano->clearGpioInterrupts();
#endif
    }
    DEBUG_PRINTF("  ANO nav (0x%02X): %s\n", ADDR_ANO, anoReady ? "OK" : "not fitted, nav on MCP GPA0-4");
}

void InputManager::initMCP23017() {
    // GPA0-4 nav buttons, GPB0-3 buttons: all 16 pins as inputs with pull-ups
    UI_WIRE.beginTransmission(ADDR_MCP23017);
    if (UI_WIRE.endTransmission() == 0) {
        mcpWrite8(ADDR_MCP23017, MCP_IODIRA, 0xFF);
        mcpWrite8(ADDR_MCP23017, MCP_IODIRB, 0xFF);
        mcpWrite8(ADDR_MCP23017, MCP_GPPUA,  0xFF);
        mcpWrite8(ADDR_MCP23017, MCP_GPPUB,  0xFF);
        mcpReady = true;
        DEBUG_PRINTLN("  MCP23017 (buttons + nav GPA0-4): OK");
    } else {
        DEBUG_PRINTLN("  MCP23017 (buttons + nav GPA0-4): NOT FOUND");
    }
}

void InputManager::initADS1115() {
    UI_WIRE.beginTransmission(ADDR_ADS1115);
    if (UI_WIRE.endTransmission() == 0) {
        adsReady = true;
        DEBUG_PRINTLN("  ADS1115 (faders 1-4): OK");
    } else {
        DEBUG_PRINTLN("  ADS1115 (faders 1-4): NOT FOUND");
    }

    // Teensy ADC for fader 5
    analogReadResolution(12);
    pinMode(FADER5_PIN, INPUT);
    DEBUG_PRINTLN("  Fader 5 ADC: OK");
}

void InputManager::initTouch() {
    // touch.begin() fails if the previous transaction on the bus was NACKed;
    // a plain register read first clears it (see test/layer2_cap1188).
    UI_WIRE.beginTransmission(ADDR_CAP1188);
    UI_WIRE.write(0xFD);
    UI_WIRE.endTransmission(false);
    UI_WIRE.requestFrom((uint8_t)ADDR_CAP1188, (uint8_t)1);
    while (UI_WIRE.available()) UI_WIRE.read();

    if (touchSensor.begin(ADDR_CAP1188, &UI_WIRE)) {
        // 16x sensitivity and max-duration recalibration, as verified in test/layer2_pads_visual
        touchSensor.writeRegister(0x1F, 0x3F);
        touchSensor.writeRegister(0x20, touchSensor.readRegister(0x20) | 0x08);
        touchSensor.writeRegister(0x26, 0xFF);
        touchReady = true;
        DEBUG_PRINTLN("  CAP1188 touch: OK");
    } else {
        DEBUG_PRINTLN("  CAP1188 touch: NOT FOUND");
    }
}

// ============================================
// POLLING
// ============================================

void InputManager::setButton(int buttonID, bool pressed, unsigned long now) {
    if (pressed != buttonStates[buttonID] && (now - buttonDebounce[buttonID]) > DEBOUNCE_MS) {
        buttonStates[buttonID] = pressed;
        buttonDebounce[buttonID] = now;
        if (buttonCB) buttonCB(buttonID, pressed);
    }
}

void InputManager::pollQuads() {
    unsigned long now = millis();
    for (int q = 0; q < NUM_QUAD_BOARDS; q++) {
        if (!quadReady[q]) continue;
        int count = (q == 0) ? QUAD_ENCODERS_PER : ENC_COUNT - QUAD_ENCODERS_PER;

        for (int e = 0; e < count; e++) {
            int32_t delta;
            if (!checkedDelta(quads[q], e, delta)) continue;
            if (delta != 0) {
                if (QUAD_INVERT) delta = -delta;
                if (encoderCB) encoderCB(q * QUAD_ENCODERS_PER + e, (int)delta);
            }
        }

        // One bulk read for the 4 push switches (pull-ups: pressed = LOW)
        uint32_t switches;
        if (!quads[q]->readBulk(quadSwitchMask, switches)) { i2cErrorCount++; continue; }
#if QUAD_USE_INT
        quads[q]->clearGpioInterrupts();  // releases INT; encoder INT clears on the delta read
#endif
        for (int e = 0; e < count; e++) {
            bool pressed = !(switches & (1UL << QUAD_SWITCH[e]));
            setButton(ENC_PUSH[q * QUAD_ENCODERS_PER + e], pressed, now);
        }
    }
}

void InputManager::pollANO() {
    // Wheel: hardware counted on the seesaw, read as a delta
    int32_t delta = 0;
    checkedDelta(ano, ANO_ENCODER, delta);
    if (delta != 0) {
        if (ANO_INVERT) delta = -delta;
        wheelPosition += delta;
        if (encoderCB) encoderCB(ENC_NAV_WHEEL, (int)delta);
    }

    // 5 buttons in one bulk read (pull-ups: pressed = LOW) -> JoystickDir bits
    uint32_t pins;
    if (!ano->readBulk(anoSwitchMask, pins)) { i2cErrorCount++; return; }   // keep the last nav state
#if QUAD_USE_INT
    ano->clearGpioInterrupts();
#endif
    uint8_t dirs = 0;
    for (int i = 0; i < 5; i++) {
        if (!(pins & (1UL << ANO_PINS[i]))) dirs |= (1 << i);
    }
    anoDirs = dirs;
    updateNav();
}

// ANO buttons OR MCP GPA buttons -> one JoystickDir state
void InputManager::updateNav() {
    uint8_t dirs = anoDirs | mcpDirs;
    if (dirs != joystickLastState) {
        joystickState = dirs;
        joystickLastState = dirs;
        if (joystickCB) joystickCB(dirs);
    }
}

void InputManager::pollMCP() {
    unsigned long now = millis();
    uint16_t pins;
    if (!mcpRead16(ADDR_MCP23017, MCP_GPIOA, pins)) {
        pins = mcpLastGood;  // no state change → no spurious events
    } else {
        mcpLastGood = pins;
    }

    // GPB0-3: MODE, SHIFT, REC, PLAY (active low)
    for (int i = 0; i < NUM_MCP_BUTTONS; i++) {
        setButton(BTN_MODE + i, !((pins >> (MCP_BUTTON_SHIFT + i)) & 1), now);
    }

    // GPA0-4: nav buttons (up, down, left, right, centre), taken when two
    // polls 10 ms apart agree (debounce)
    uint8_t raw = (~pins >> MCP_NAV_SHIFT) & 0x1F;
    if (raw == mcpDirsRaw && raw != mcpDirs) {
        mcpDirs = raw;
        updateNav();
    }
    mcpDirsRaw = raw;
}

void InputManager::pollFaders() {
    // ADS1115: faders 1-4 (channels 0-3), one channel per call. A conversion
    // takes 1.2 ms at 860 SPS; it was started on the previous call
    // (FADER_POLL_MS ago), so the result is ready and nothing waits.
    if (adsReady) {
        int ch = adsCurrentChannel;
        if (adsPending) {
            int16_t raw;
            if (!adsReadResult(raw)) raw = adsLastGood[ch];  // hold last position on error
            else adsLastGood[ch] = raw;
            float value = constrain((float)raw / FADER_ADS_FULL_SCALE, 0.0f, 1.0f);
            if (fabsf(value - faderLastValues[ch]) > FADER_THRESHOLD) {
                faderValues[ch] = value;
                faderLastValues[ch] = value;
                if (faderCB) faderCB(ch, value);
            }
            adsCurrentChannel = (ch + 1) % NUM_FADERS;
        }
        adsPending = adsStart(adsCurrentChannel);
    }

    // Teensy ADC: fader 5 (pin 40)
    int raw = analogRead(FADER5_PIN);
    float value = constrain((float)raw / FADER_ADC_FULL_SCALE, 0.0f, 1.0f);

    if (fabsf(value - faderLastValues[FADER_OUT]) > FADER_THRESHOLD) {
        faderValues[FADER_OUT] = value;
        faderLastValues[FADER_OUT] = value;
        if (faderCB) faderCB(FADER_OUT, value);
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
    UI_WIRE.beginTransmission(addr);
    UI_WIRE.write(reg);
    if (UI_WIRE.endTransmission(false) != 0) {
        i2cErrorCount++;
        return false;
    }
    if (UI_WIRE.requestFrom(addr, (uint8_t)2) < 2) {
        i2cErrorCount++;
        return false;
    }
    outVal = UI_WIRE.read();
    outVal |= (uint16_t)UI_WIRE.read() << 8;
    return true;
}

bool InputManager::mcpWrite8(uint8_t addr, uint8_t reg, uint8_t value) {
    UI_WIRE.beginTransmission(addr);
    UI_WIRE.write(reg);
    UI_WIRE.write(value);
    if (UI_WIRE.endTransmission() != 0) {
        i2cErrorCount++;
        return false;
    }
    return true;
}

bool InputManager::checkedDelta(QuadBoard* b, uint8_t enc, int32_t& delta) {
    delta = 0;
    if (!b->readDelta(enc, delta)) { i2cErrorCount++; delta = 0; return false; }
    if (abs(delta) > SEESAW_MAX_DELTA) { i2cErrorCount++; delta = 0; return false; }
    return true;
}

// Start a single-shot single-ended conversion on one channel
bool InputManager::adsStart(uint8_t channel) {
    if (channel > 3) return false;
    uint16_t config = ADS_CONFIG_OS
                    | ADS_CONFIG_MUX(channel)
                    | ADS_CONFIG_PGA_4V
                    | ADS_CONFIG_MODE
                    | ADS_CONFIG_DR_860
                    | ADS_CONFIG_COMP;
    UI_WIRE.beginTransmission(ADDR_ADS1115);
    UI_WIRE.write(ADS_REG_CONFIG);
    UI_WIRE.write((uint8_t)(config >> 8));
    UI_WIRE.write((uint8_t)(config & 0xFF));
    if (UI_WIRE.endTransmission() != 0) {
        i2cErrorCount++;
        return false;
    }
    return true;
}

// Read the conversion started by adsStart
bool InputManager::adsReadResult(int16_t& outVal) {
    UI_WIRE.beginTransmission(ADDR_ADS1115);
    UI_WIRE.write(ADS_REG_CONVERT);
    if (UI_WIRE.endTransmission(false) != 0) {
        i2cErrorCount++;
        return false;
    }
    if (UI_WIRE.requestFrom((uint8_t)ADDR_ADS1115, (uint8_t)2) < 2) {
        i2cErrorCount++;
        return false;
    }
    outVal = (int16_t)UI_WIRE.read() << 8;
    outVal |= UI_WIRE.read();
    return true;
}
