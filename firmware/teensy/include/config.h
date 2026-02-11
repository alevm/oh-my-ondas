/**
 * Oh My Ondas - Configuration Header
 * Hardware pin definitions and system constants
 *
 * v0.3.0 — Full hardware: 13 encoders, 16 buttons, 5" LCD,
 *           map OLED, faders, crossfader, joystick
 *
 * Pin allocation strategy:
 *   Direct GPIO: 5 encoders, 4 buttons, joystick, status LEDs, NeoPixel
 *   SPI0 (11,12,13): ILI9488 5" LCD
 *   I2C (18,19): OLED, MPR121, 2×MCP23017, ADS1115
 *   MCP23017 #1 (0x20): 8 extra encoders (CLK+DT, polled)
 *   MCP23017 #2 (0x21): 12 extra buttons + PREV/NEXT + joystick press
 *   ADS1115 (0x48): 4 mixer faders
 *   Teensy ADC (pin 39/A15): crossfader
 *   Serial2 (16,17): ESP32 UART
 */

#ifndef CONFIG_H
#define CONFIG_H

// ============================================
// SYSTEM CONSTANTS
// ============================================

#define VERSION "0.3.0"
#define MAX_TRACKS 8
#define MAX_PADS 8
#define MAX_STEPS 16
#define MAX_PATTERNS 64
#define MAX_SCENES 16

// Audio settings
#define SAMPLE_RATE 44100
#define AUDIO_MEMORY_BLOCKS 200
#define MAX_SAMPLE_LENGTH_MS 30000  // 30 seconds per sample

// Audio buffer sizes
#define GRANULAR_BUFFER_SIZE 12800  // ~290ms at 44.1kHz
#define CHORUS_DELAY_LENGTH 512
#define DELAY_MAX_MS 1000

// ============================================
// DISPLAY — DUAL SCREEN
// ============================================

// Primary: 5" IPS LCD 800×480 (SPI, ILI9488)
#define TFT_CS   36
#define TFT_DC   37
#define TFT_RST  38
// SPI0: MOSI=11, MISO=12, SCK=13

#define LCD_WIDTH  480   // ILI9488 in landscape
#define LCD_HEIGHT 320   // (native 320×480, rotated)

// Secondary: SSD1306 128×64 OLED (I2C) — GPS map display
#define OLED_WIDTH  128
#define OLED_HEIGHT 64
#define OLED_RESET -1

// ============================================
// PIN DEFINITIONS — TEENSY 4.1
// ============================================

// I2C (shared bus: OLED, MPR121, MCP23017×2, ADS1115)
// SDA = Pin 18, SCL = Pin 19

// Audio Shield (I2S) — RESERVED PINS, do NOT reuse:
// Pin 2  = I2S RX (audio input)
// Pin 7  = I2S TX (BCLK)
// Pin 20 = I2S LRCLK
// Pin 21 = I2S BCLK
// Pin 23 = I2S TX

// Touch Sensor IRQ (MPR121)
#define TOUCH_IRQ 15

// ── Direct Encoders (5) ──────────────────────
// Using Encoder library (interrupt-based)

#define ENC1_CLK 3       // VOL
#define ENC1_DT  4
#define ENC1_SW  5

#define ENC2_CLK 6       // PAN
#define ENC2_DT  14
#define ENC2_SW  8

#define ENC3_CLK 9       // FILT (moved from 9,10,11 to avoid SPI)
#define ENC3_DT  10
#define ENC3_SW  22

#define ENC4_CLK 24      // FX (moved from 12,24,25 to avoid SPI)
#define ENC4_DT  25
#define ENC4_SW  0

#define ENC5_CLK 34      // DECAY (new)
#define ENC5_DT  35
#define ENC5_SW  1

#define NUM_DIRECT_ENCODERS 5

// ── MCP23017 Encoders (8) ────────────────────
// 8 encoders × 2 pins = 16 pins = all of MCP#1
// Read via I2C polling, software quadrature decode
// Port A: CUT(0,1) RES(2,3) ATK(4,5) REL(6,7)
// Port B: DLY(0,1) GLT(2,3) GRN(4,5) CRU(6,7)
#define NUM_MCP_ENCODERS 8
#define TOTAL_ENCODERS (NUM_DIRECT_ENCODERS + NUM_MCP_ENCODERS)  // 13

// ── Encoder IDs (unified) ────────────────────
enum EncoderID {
    ENC_VOL = 0,    // Direct
    ENC_PAN,        // Direct
    ENC_FILT,       // Direct
    ENC_FX,         // Direct
    ENC_DECAY,      // Direct
    ENC_CUT,        // MCP#1
    ENC_RES,        // MCP#1
    ENC_ATK,        // MCP#1
    ENC_REL,        // MCP#1
    ENC_DLY,        // MCP#1
    ENC_GLT,        // MCP#1
    ENC_GRN,        // MCP#1
    ENC_CRU,        // MCP#1
    ENC_COUNT       // = 13
};

// ── Direct Buttons (4) ──────────────────────
#define BTN_PIN_MODE  26
#define BTN_PIN_SHIFT 27
#define BTN_PIN_REC   28
#define BTN_PIN_PLAY  29
#define NUM_DIRECT_BUTTONS 4

// ── MCP23017 #2 Buttons (14) ────────────────
// Port A (8): STOP, PIC, SND, INT, JRN, MENU, BACK, PAGE
// Port B (6+2): DUB, FILL, CLR, SCN, BANK, JOY_CENTER, PREV, NEXT
#define NUM_MCP_BUTTONS 14

// ── Button IDs (unified) ────────────────────
enum ButtonID {
    // Direct GPIO
    BTN_MODE = 0,
    BTN_SHIFT,
    BTN_REC,
    BTN_PLAY,
    // MCP#2 Port A
    BTN_STOP,
    BTN_PIC,
    BTN_SND,
    BTN_INT,
    BTN_JRN,
    BTN_MENU,
    BTN_BACK,
    BTN_PAGE,
    // MCP#2 Port B
    BTN_DUB,
    BTN_FILL,
    BTN_CLR,
    BTN_SCN,
    BTN_BANK,
    BTN_PREV,
    BTN_NEXT,
    BTN_COUNT       // = 19 (includes PREV/NEXT)
};

// ── 5-Way Joystick (digital) ────────────────
// Directions on free Teensy pins
#define JOY_UP_PIN    40
#define JOY_DOWN_PIN  41
#define JOY_LEFT_PIN  33   // Shared: repurposed from LED_ERROR
#define JOY_RIGHT_PIN 32   // Shared: repurposed from LED_WIFI

// Joystick press = MCP#2 Port B bit 5 (see BTN enum: not separate)
// Use JOY_CENTER from MCP#2

enum JoystickDir {
    JOY_NONE   = 0,
    JOY_UP     = (1 << 0),
    JOY_DOWN   = (1 << 1),
    JOY_LEFT   = (1 << 2),
    JOY_RIGHT  = (1 << 3),
    JOY_CENTER = (1 << 4)
};

// ── Faders (ADS1115 ADC) ────────────────────
// ADS1115 at 0x48, channels A0-A3
// Crossfader on Teensy ADC pin 39 (A15)
#define CROSSFADER_PIN 39
#define NUM_FADERS 4     // via ADS1115
#define TOTAL_FADERS 5   // + crossfader

enum FaderID {
    FADER_MIC = 0,
    FADER_SMP,
    FADER_SYN,
    FADER_RAD,
    FADER_XFADE,
    FADER_COUNT     // = 5
};

// ── LED Ring (NeoPixel) ─────────────────────
#define LED_PIN   30
#define LED_COUNT 8

// ── Status LEDs ─────────────────────────────
#define LED_GPS   31
// LED_WIFI and LED_ERROR repurposed for joystick
// Status now shown on LCD/OLED instead

// ── ESP32 Communication (Serial2) ───────────
#define ESP32_RX 16
#define ESP32_TX 17

// ============================================
// I2C ADDRESSES
// ============================================

#define ADDR_SSD1306   0x3C  // OLED map display
#define ADDR_MPR121    0x5A  // Touch sensor
#define ADDR_MCP23017A 0x20  // I/O expander #1 (encoders)
#define ADDR_MCP23017B 0x21  // I/O expander #2 (buttons)
#define ADDR_ADS1115   0x48  // 16-bit ADC (faders)

// ============================================
// AUDIO ROUTING
// ============================================

// Input source indices
#define SRC_LINEIN_L  0
#define SRC_LINEIN_R  1
#define SRC_MIC_L     2
#define SRC_MIC_R     3

// Effect types
enum FXType {
    FX_NONE = 0,
    FX_REVERB,
    FX_DELAY,
    FX_FILTER,
    FX_BITCRUSH,
    FX_WAVEFOLD,
    FX_GLITCH,
    FX_GRAIN,
    FX_RINGMOD,
    FX_COMB,
    FX_TAPE,
    FX_CHORUS,
    FX_COUNT
};

// ============================================
// SEQUENCER
// ============================================

// Trig condition types (Octatrack-style)
enum TrigCondition {
    TRIG_ALWAYS = 0,
    TRIG_FILL,
    TRIG_NOT_FILL,
    TRIG_PRE,
    TRIG_NEI,
    TRIG_PROB_25,
    TRIG_PROB_50,
    TRIG_PROB_75,
    TRIG_1ST,
    TRIG_2ND,
    TRIG_3RD,
    TRIG_4TH,
    TRIG_COUNT
};

// ============================================
// SYSTEM MODES
// ============================================

enum SystemMode {
    MODE_LIVE = 0,
    MODE_PATTERN,
    MODE_SCENE,
    MODE_DUB,
    MODE_AI_COMPOSE,
    MODE_COUNT
};

// ============================================
// TIMING
// ============================================

#define DEBOUNCE_MS 50
#define LONG_PRESS_MS 500
#define DOUBLE_TAP_MS 300
#define FADER_THRESHOLD 0.01f   // Change threshold for fader events
#define ENCODER_POLL_MS 2       // MCP encoder polling interval

// ============================================
// FILE PATHS
// ============================================

#define SAMPLES_DIR "/samples/"
#define PATTERNS_DIR "/patterns/"
#define RECORDINGS_DIR "/recordings/"
#define PRESETS_DIR "/presets/"

// ============================================
// DEBUG
// ============================================

#ifndef DEBUG
#define DEBUG 1
#endif

#if DEBUG
#define DEBUG_PRINT(x) Serial.print(x)
#define DEBUG_PRINTLN(x) Serial.println(x)
#define DEBUG_PRINTF(...) Serial.printf(__VA_ARGS__)
#else
#define DEBUG_PRINT(x)
#define DEBUG_PRINTLN(x)
#define DEBUG_PRINTF(...)
#endif

#endif // CONFIG_H
