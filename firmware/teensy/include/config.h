/**
 * Oh My Ondas - Configuration Header
 * Hardware pin definitions and system constants
 */

#ifndef CONFIG_H
#define CONFIG_H

// ============================================
// SYSTEM CONSTANTS
// ============================================

#define VERSION "0.1.0"
#define MAX_TRACKS 8
#define MAX_PADS 8
#define MAX_STEPS 16
#define MAX_PATTERNS 64
#define MAX_SCENES 16

// Audio settings
#define SAMPLE_RATE 44100
#define AUDIO_MEMORY_BLOCKS 120
#define MAX_SAMPLE_LENGTH_MS 30000  // 30 seconds per sample

// ============================================
// DISPLAY
// ============================================

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1  // Share reset with Arduino

// ============================================
// PIN DEFINITIONS - TEENSY 4.1
// ============================================

// I2C (shared by touch sensor, display)
// SDA = Pin 18, SCL = Pin 19 (default I2C pins)

// Audio Shield (I2S)
// Uses pins 7, 20, 21, 23 internally

// Encoder 1 (MIX)
#define ENC1_CLK 3
#define ENC1_DT  4
#define ENC1_SW  5

// Encoder 2 (FX)
#define ENC2_CLK 6
#define ENC2_DT  7
#define ENC2_SW  8

// Encoder 3 (MOD)
#define ENC3_CLK 9
#define ENC3_DT  10
#define ENC3_SW  11

// Encoder 4 (TIME)
#define ENC4_CLK 12
#define ENC4_DT  24
#define ENC4_SW  25

// Main Buttons
#define BTN_MODE  26
#define BTN_SHIFT 27
#define BTN_REC   28
#define BTN_PLAY  29

// LED Ring (NeoPixel)
#define LED_PIN   30
#define LED_COUNT 8

// ESP32 Communication (Serial2)
#define ESP32_RX 16
#define ESP32_TX 17

// Status LEDs (optional)
#define LED_GPS   31
#define LED_WIFI  32
#define LED_ERROR 33

// ============================================
// I2C ADDRESSES
// ============================================

#define ADDR_MPR121   0x5A  // Touch sensor
#define ADDR_SSD1306  0x3C  // OLED display

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
// TIMING
// ============================================

#define DEBOUNCE_MS 50
#define LONG_PRESS_MS 500
#define DOUBLE_TAP_MS 300

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
