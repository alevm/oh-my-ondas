/**
 * Oh My Ondas - Input Manager
 * Unified handling for all physical controls:
 *   5 direct encoders (interrupt-based via Encoder library)
 *   8 MCP23017 encoders (polled via I2C, software quadrature)
 *   4 direct buttons + 14 MCP23017 buttons (debounced)
 *   5-way joystick (4 GPIO + 1 MCP pin)
 *   4 ADS1115 faders + 1 Teensy ADC crossfader
 *   8 MPR121 touch pads
 */

#ifndef INPUT_MANAGER_H
#define INPUT_MANAGER_H

#include <Arduino.h>
#include <Wire.h>
#include <Encoder.h>
#include <Adafruit_MPR121.h>
#include "config.h"

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
    uint32_t getI2CErrorCount() const { return i2cErrorCount; }

private:
    // Callbacks
    EncoderCallback  encoderCB;
    ButtonCallback   buttonCB;
    FaderCallback    faderCB;
    JoystickCallback joystickCB;
    TouchCallback    touchCB;

    // ── Direct Encoders ──
    Encoder* directEncoders[NUM_DIRECT_ENCODERS];
    long     directEncPositions[NUM_DIRECT_ENCODERS];

    // ── MCP23017 Encoders ──
    uint8_t  mcpEncLastState[NUM_MCP_ENCODERS];  // 2-bit grey code per encoder
    int8_t   mcpEncAccum[NUM_MCP_ENCODERS];       // accumulator for detent

    // ── Buttons ──
    bool     buttonStates[BTN_COUNT];
    bool     buttonLastStates[BTN_COUNT];
    unsigned long buttonDebounce[BTN_COUNT];

    // ── Faders ──
    float    faderValues[FADER_COUNT];
    float    faderLastValues[FADER_COUNT];

    // ── Joystick ──
    uint8_t  joystickState;
    uint8_t  joystickLastState;

    // ── Touch ──
    Adafruit_MPR121 touchSensor;
    uint16_t touchLast;
    bool     touchReady;

    // ── MCP23017 state ──
    bool     mcpAReady;   // encoder expander
    bool     mcpBReady;   // button expander

    // ── ADS1115 state ──
    bool     adsReady;
    uint8_t  adsCurrentChannel;

    // ── I2C error handling ──
    uint32_t i2cErrorCount;
    uint16_t mcpALastGood;     // last good MCP#1 read (encoders)
    uint16_t mcpBLastGood;     // last good MCP#2 read (buttons)
    int16_t  adsLastGood[4];   // last good ADS1115 per-channel

    // ── Timing ──
    unsigned long lastEncoderPoll;
    unsigned long lastButtonPoll;
    unsigned long lastFaderPoll;

    // ── Internal methods ──
    void initDirectEncoders();
    void initMCP23017();
    void initADS1115();
    void initDirectButtons();
    void initJoystick();
    void initTouch();

    void pollDirectEncoders();
    void pollMCPEncoders();
    void pollDirectButtons();
    void pollMCPButtons();
    void pollFaders();
    void pollJoystick();
    void pollTouch();

    // I2C helpers (return false on bus error, increment i2cErrorCount)
    bool mcpRead16(uint8_t addr, uint8_t reg, uint16_t& outVal);
    bool mcpWrite8(uint8_t addr, uint8_t reg, uint8_t value);
    bool adsReadChannel(uint8_t channel, int16_t& outVal);

    // Quadrature decode helper
    int8_t   decodeQuadrature(uint8_t oldState, uint8_t newState);
};

#endif // INPUT_MANAGER_H
