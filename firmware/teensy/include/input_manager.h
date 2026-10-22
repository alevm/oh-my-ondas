/**
 * Oh My Ondas - Input Manager
 * Unified handling for all physical controls (v1, all I2C on Wire2):
 *   7 encoders on 2 Quad seesaw boards (hardware counting, read on INT
 *     with a fallback poll, see QUAD_USE_INT),
 *     their push switches reported as buttons (ENC_PUSH_BUTTONS)
 *   nav: ANO board (seesaw, 0x4B, optional): 5 buttons + scroll wheel
 *     (-> encoder callback as ENC_NAV_WHEEL), OR-ed with 5 tactile buttons
 *     on MCP23017 GPA0-4 -> one set of JoystickDir bits
 *   4 buttons on one MCP23017 GPB0-3 (debounced)
 *   4 ADS1115 faders + fader 5 on the Teensy ADC
 *   8 CAP1188 touch pads
 */

#ifndef INPUT_MANAGER_H
#define INPUT_MANAGER_H

#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_seesaw.h>
#include <Adafruit_CAP1188.h>
#include "config.h"

// Seesaw board with access to the GPIO interrupt flags. The INT line stays
// low until the flags are read, so they are cleared after each switch read.
// The library's getEncoderDelta / digitalReadBulk ignore a NACK and return
// whatever is in the buffer; the checked reads here return false instead.
class QuadBoard : public Adafruit_seesaw {
public:
    using Adafruit_seesaw::Adafruit_seesaw;
    uint32_t clearGpioInterrupts() {
        uint32_t v;
        return read32(SEESAW_GPIO_BASE, SEESAW_GPIO_INTFLAG, v) ? v : 0;
    }
    bool readDelta(uint8_t encoder, int32_t& delta) {
        uint32_t v;
        if (!read32(SEESAW_ENCODER_BASE, SEESAW_ENCODER_DELTA + encoder, v)) return false;
        delta = (int32_t)v;
        return true;
    }
    bool readBulk(uint32_t mask, uint32_t& pins) {
        uint32_t v;
        if (!read32(SEESAW_GPIO_BASE, SEESAW_GPIO_BULK, v)) return false;
        pins = v & mask;
        return true;
    }
private:
    bool read32(uint8_t hi, uint8_t lo, uint32_t& v) {
        uint8_t buf[4];
        if (!read(hi, lo, buf, 4)) return false;
        v = ((uint32_t)buf[0] << 24) | ((uint32_t)buf[1] << 16) | ((uint32_t)buf[2] << 8) | buf[3];
        return true;
    }
};

#define SEESAW_MAX_DELTA   20    // larger per read = a corrupted transfer, ignored
#define FADER_POLL_MS      10    // one ADS1115 channel per poll: each fader every 40 ms
#define TOUCH_POLL_MS      5

// Callbacks
typedef void (*EncoderCallback)(int encoderID, int delta);
typedef void (*ButtonCallback)(int buttonID, bool pressed);
typedef void (*FaderCallback)(int faderID, float value);
typedef void (*JoystickCallback)(uint8_t directions);  // bitmask of JoystickDir
typedef void (*TouchCallback)(int pad, bool pressed);

class InputManager {
public:
    InputManager();

    void begin();
    void update();   // Call from loop, handles polling intervals internally

    // Register callbacks
    void setEncoderCallback(EncoderCallback cb)   { encoderCB = cb; }
    void setButtonCallback(ButtonCallback cb)      { buttonCB = cb; }
    void setFaderCallback(FaderCallback cb)        { faderCB = cb; }
    void setJoystickCallback(JoystickCallback cb)  { joystickCB = cb; }
    void setTouchCallback(TouchCallback cb)        { touchCB = cb; }

    // Direct queries
    float getFaderValue(int faderID);
    bool  isButtonPressed(int buttonID);
    uint8_t getJoystickState();
    int32_t getWheelPosition() const { return wheelPosition; }  // accumulated ANO wheel steps
    bool    isNavReady() const { return anoReady; }
    uint32_t getI2CErrorCount() const { return i2cErrorCount; }

private:
    // Callbacks
    EncoderCallback  encoderCB;
    ButtonCallback   buttonCB;
    FaderCallback    faderCB;
    JoystickCallback joystickCB;
    TouchCallback    touchCB;

    // ── Quad encoder boards ──
    QuadBoard* quads[NUM_QUAD_BOARDS];
    bool     quadReady[NUM_QUAD_BOARDS];
    uint32_t quadSwitchMask;

    // ── Buttons ──
    bool     buttonStates[BTN_COUNT];
    bool     buttonLastStates[BTN_COUNT];
    unsigned long buttonDebounce[BTN_COUNT];

    // ── Faders ──
    float    faderValues[FADER_COUNT];
    float    faderLastValues[FADER_COUNT];

    // ── Nav (ANO board) ──
    QuadBoard* ano;            // same seesaw access as the Quads
    bool     anoReady;
    uint32_t anoSwitchMask;
    int32_t  wheelPosition;
    uint8_t  anoDirs, mcpDirs;     // the two nav sources, OR-ed
    uint8_t  mcpDirsRaw;           // GPA reading awaiting confirmation (debounce)
    uint8_t  joystickState;
    uint8_t  joystickLastState;
    unsigned long lastAnoPoll;

    // ── Touch ──
    Adafruit_CAP1188 touchSensor;
    uint16_t touchLast;
    bool     touchReady;

    // ── MCP23017 state ──
    bool     mcpReady;

    // ── ADS1115 state (non-blocking: start a conversion, read it next poll) ──
    bool     adsReady;
    uint8_t  adsCurrentChannel;
    bool     adsPending;

    // ── I2C error handling ──
    uint32_t i2cErrorCount;
    uint16_t mcpLastGood;      // last good MCP read
    int16_t  adsLastGood[4];   // last good ADS1115 per-channel

    // ── Timing ──
    unsigned long lastEncoderPoll;
    unsigned long lastButtonPoll;
    unsigned long lastFaderPoll;
    unsigned long lastTouchPoll;

    // ── Internal methods ──
    void initQuads();
    void initANO();
    void initMCP23017();
    void initADS1115();
    void initTouch();

    void pollQuads();
    void pollANO();
    void pollMCP();
    void pollFaders();
    void pollTouch();

    void setButton(int buttonID, bool pressed, unsigned long now);
    void updateNav();

    // I2C helpers (return false on bus error, increment i2cErrorCount)
    bool mcpRead16(uint8_t addr, uint8_t reg, uint16_t& outVal);
    bool mcpWrite8(uint8_t addr, uint8_t reg, uint8_t value);
    bool adsStart(uint8_t channel);
    bool adsReadResult(int16_t& outVal);
    bool checkedDelta(QuadBoard* b, uint8_t enc, int32_t& delta);
};

#endif // INPUT_MANAGER_H
