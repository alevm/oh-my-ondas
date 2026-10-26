/**
 * Oh My Ondas - Configuration Header
 * Hardware pin definitions and system constants
 *
 * v1 breadboard prototype (layout: web/prototype.html).
 * With the Audio Shield under the Teensy, pins 0-23 are inside the shield
 * sockets, so everything else uses the pins past the shield edge (24-41).
 *
 *   Wire  (18/19): Audio Shield only (SGTL5000)
 *   Wire2 (SDA 25, SCL 24): every UI part: CAP1188, OLED, ADS1115,
 *                  MCP23017, 2 Quad encoder boards, ANO nav wheel, GPS,
 *                  Si4732 radio
 *   SPI1 (MOSI 26, SCK 27, MISO 39): 2.8" ILI9341 LCD
 *   Teensy ADC pin 40: fader 5 (OUT)
 *   Serial7 (RX 28, TX 29): ESP32-S2 WiFi
 *
 * Replaces the v0.3 map (5" ILI9488 on SPI0, 13 encoders, 19 buttons,
 * joystick and NeoPixel ring on direct pins), which assumed pins 0-23 free.
 */

#ifndef CONFIG_H
#define CONFIG_H

// ============================================
// SYSTEM CONSTANTS
// ============================================

#define VERSION "0.4.0"
#define MAX_TRACKS 8
#define MAX_PADS 8
#define MAX_STEPS 16
#define MAX_PATTERNS 64
#define MAX_SCENES 16

// Audio settings
#define SAMPLE_RATE 44100
#define AUDIO_MEMORY_BLOCKS 590   // 240 for the graph (+40 for the input FFT and capture voices) + 350 for a full DELAY_MAX_MS delay (1000 ms = 346 blocks). DMAMEM: lives in RAM2
#define MAX_SAMPLE_LENGTH_MS 30000  // 30 seconds per sample

// Audio buffer sizes
#define GRANULAR_BUFFER_SIZE 12800  // ~290ms at 44.1kHz
#define CHORUS_DELAY_LENGTH 512
#define DELAY_MAX_MS 1000

// ============================================
// BUSES
// ============================================

#define UI_WIRE        Wire2     // SDA 25, SCL 24: all UI I2C devices
#define UI_I2C_CLOCK   400000    // bench tests ran at the 100 kHz default; drop to 100000 on I2C errors
#define UI_SDA_PIN     25        // Wire2 pins, driven as GPIO only for the bus clear (InputManager)
#define UI_SCL_PIN     24
#define UI_PROBE_MS    1000      // CAP1188 re-probe; bus clear when every UI part stops answering
#define ESP32_SERIAL   Serial7   // RX7 28 <- ESP TX, TX7 29 -> ESP RX
// Link speed: LINK_BAUD (2 Mbaud) from common/link_protocol.h, see esp_link.h

// Audio Shield Rev D: reserved, do NOT reuse (pjrc.com/store/teensy3_audio.html)
// Pin 7 I2S TX, 8 I2S RX, 20 LRCLK, 21 BCLK, 23 MCLK, Wire 18/19.
// All of 0-23 sit inside the shield sockets anyway.

// ============================================
// DISPLAYS
// ============================================

// Main UI: Adafruit 2.8" ILI9341 320x240 on SPI1.
// Adafruit_ILI9341::begin() without a speed runs at 8 MHz on Teensy
// (SPI_DEFAULT_FREQ for TEENSYDUINO), which is what the bench sketches use:
// a full-screen fill then blocks the loop ~154 ms. 40 MHz over jumpers
// gave a white screen. Drop to 8000000 if the screen goes white.
#define TFT_SPI_HZ 20000000
#define TFT_MOSI 26
#define TFT_SCK  27
#define TFT_MISO 39   // needs SPI1.setMISO(39): the default MISO1 is pin 1, under the shield
#define TFT_CS   38
#define TFT_DC   37
#define TFT_RST  36
#define TFT_ROTATION 3   // landscape, turned 180° (1 = landscape, other way up)

#define LCD_WIDTH  320   // landscape
#define LCD_HEIGHT 240

// Secondary: SSD1306 128x64 OLED on Wire2 (GPS map). Two-colour glass:
// top 16 rows yellow, bottom 48 blue.
#define OLED_WIDTH  128
#define OLED_HEIGHT 64
#define OLED_RESET -1

// ============================================
// ENCODERS: 2 Adafruit I2C Quad Rotary Encoder boards (5752)
// ============================================

// Quad #1 at 0x49 carries encoders 1-4, Quad #2 at 0x4A (A0 jumper cut)
// carries 5-7. Each encoder has a push switch and an RGB NeoPixel.
#define NUM_QUAD_BOARDS     2
#define QUAD_ENCODERS_PER   4
#define QUAD_SWITCH_PINS    {12, 14, 17, 9}   // seesaw pins of the 4 push switches
#define QUAD_NEOPIXEL_PIN   18
#define QUAD_INVERT         1    // 1: report clockwise as +1 (check direction on hardware)
#define QUAD_INT_PIN        32   // recommended: INT of both Quads wired together (open drain, active low)
// Reading: each seesaw read blocks ~0.45 ms at 400 kHz (250 us fixed delay in
// Adafruit_seesaw::read + the transfer). Plain polling of 7 deltas + 2 switch
// reads every 10 ms blocks ~4 ms in every 10 (~40 %). With QUAD_USE_INT the
// boards are read only when INT is low, plus a slow fallback poll so they keep
// working if the INT wire is missing (hardware counting loses no steps, only
// latency grows to QUAD_FALLBACK_POLL_MS).
#define QUAD_USE_INT          1    // 1: read on INT + fallback poll; 0: poll every ENCODER_POLL_MS
#define QUAD_FALLBACK_POLL_MS 50   // fallback poll period when QUAD_USE_INT is 1

// Encoder IDs (v1 has 7; the v0.3 IDs DLY, GLT, GRN, CRU are gone:
// those effects are reached through FX select + PARAM encoders)
enum EncoderID {
    ENC_VOL = 0,    // Quad #1 enc 0: master volume   (SHIFT: scene morph)
    ENC_PAN,        // Quad #1 enc 1: FX select        (SHIFT: FX param 2)
    ENC_FILT,       // Quad #1 enc 2: FX param 1       (SHIFT: LFO rate)
    ENC_FX,         // Quad #1 enc 3: FX mix           (SHIFT: FX param 3)
    ENC_DECAY,      // Quad #2 enc 0: tempo            (SHIFT: swing)
    ENC_CUT,        // Quad #2 enc 1: synth cutoff     (SHIFT: resonance)
    ENC_ATK,        // Quad #2 enc 2: synth attack     (SHIFT: release)
    ENC_COUNT       // = 7
};

// ============================================
// NAV: Adafruit ANO rotary navigation encoder on its I2C STEMMA QT adapter
// (Adafruit 6310, seesaw firmware, product id 5740) at 0x4B on Wire2
// ============================================

// 5 buttons (up, down, left, right, centre) + the scroll wheel encoder.
// Default address 0x49 clashes with Quad #1: cut the A1 jumper (0x4B).
// Optional: without it, nav is 5 tactile buttons on MCP23017 GPA0-4 (below);
// with it, any GPA buttons wired are OR-ed in. Wheel functions without the
// ANO: SHIFT + nav L/R tunes on the RAD screen, selects tracks elsewhere
// (PREV / NEXT); nav centre scrolls the screens.
// Seesaw pins from Adafruit_seesaw examples/encoder/PID5740_ANOencoder_demo.
// The buttons feed the JoystickDir bits; the wheel is reported to the
// encoder callback as ENC_NAV_WHEEL (outside ENC_COUNT).
#define ANO_SW_SELECT   1    // centre
#define ANO_SW_UP       2
#define ANO_SW_LEFT     3
#define ANO_SW_DOWN     4
#define ANO_SW_RIGHT    5
#define ANO_ENCODER     0    // seesaw encoder index of the wheel
#define ANO_INVERT      0    // 1: flip the wheel direction (check on hardware)
#define ANO_POLL_MS     20   // poll period; with QUAD_USE_INT its INT may share QUAD_INT_PIN
#define ENC_NAV_WHEEL   ENC_COUNT   // encoder callback ID of the wheel (= 7)

// ============================================
// BUTTONS: one MCP23017 at 0x20 on Wire2
// ============================================

// GPA0-4: nav buttons up, down, left, right, centre (when there is no ANO
//         board, or in addition to it); unwired pins read released
// GPB0-3: MODE, SHIFT, REC, PLAY
// Internal pull-ups, pressed = LOW. A0-A2 to GND, RESET to 3.3 V.
#define MCP_NAV_SHIFT     0      // GPA bits 0-4, JoystickDir order
#define MCP_BUTTON_SHIFT  8      // GPB bits 0-3 in the 16-bit GPIOAB word
#define NUM_MCP_BUTTONS   4
#define MCP_INTA_PIN      33     // optional, not used yet

// Button IDs. Only MODE, SHIFT, REC, PLAY are physical buttons in v1.
// The rest of the v0.3 set is reached like this:
//   encoder pushes  -> see ENC_PUSH_BUTTONS below
//   SHIFT + nav L/R -> PREV / NEXT
//   SHIFT + nav centre -> BACK (main screen)
//   PIC, SND, INT, MENU, PAGE screens -> nav centre cycles screens
//   (nav = ANO buttons; the ANO wheel scrolls, see ENC_NAV_WHEEL)
//   DUB -> MODE cycles through DUB;  JRN -> REC
enum ButtonID {
    BTN_MODE = 0,
    BTN_SHIFT,
    BTN_REC,
    BTN_PLAY,
    BTN_STOP,
    BTN_PIC,
    BTN_SND,
    BTN_INT,
    BTN_JRN,
    BTN_MENU,
    BTN_BACK,
    BTN_PAGE,
    BTN_DUB,
    BTN_FILL,
    BTN_CLR,
    BTN_SCN,
    BTN_BANK,
    BTN_PREV,
    BTN_NEXT,
    BTN_COUNT       // = 19
};

// Encoder push switch -> button, by EncoderID order
#define ENC_PUSH_BUTTONS { BTN_STOP, BTN_INT, BTN_FILL, BTN_CLR, BTN_SCN, BTN_SND, BTN_BANK }

enum JoystickDir {
    JOY_NONE   = 0,
    JOY_UP     = (1 << 0),
    JOY_DOWN   = (1 << 1),
    JOY_LEFT   = (1 << 2),
    JOY_RIGHT  = (1 << 3),
    JOY_CENTER = (1 << 4)
};

// ============================================
// FADERS
// ============================================

// ADS1115 at 0x48 on Wire2, channels A0-A3; fader 5 on the Teensy ADC.
// Fader ends to 3.3 V / GND only, never 5 V.
#define FADER5_PIN  40                 // A16
#define NUM_FADERS  4                  // via ADS1115
#define TOTAL_FADERS 5
#define FADER_ADS_FULL_SCALE 26400.0f  // 3.3 V at the +/-4.096 V range
#define FADER_ADC_FULL_SCALE 4095.0f   // Teensy ADC, 12-bit

enum FaderID {
    FADER_MIC = 0,
    FADER_SMP,
    FADER_SYN,
    FADER_RAD,
    FADER_OUT,      // fader 5: master output level
    FADER_COUNT     // = 5
};

// ============================================
// OTHER PINS
// ============================================

#define RADIO_RST_PIN    34   // Si4732 RST, active low

// ============================================
// RADIO: Si4732-A10 (SOIC-16 on a DIP adapter, Wire2 0x11, SEN to 3.3 V)
// ============================================
// Driver: radio.h/.cpp on the PU2CLR SI4735 library, vendored in
// teensy/lib/SI4735 and patched to take a TwoWire bus (upstream uses Wire).
// Audio: LOUT/ROUT -> 4.7 uF -> Audio Shield LINE-IN R -> inputMixer ch 1,
// level on the RAD fader (ADS A3).
//
// Clock: UNCONFIRMED. The Si4732 datasheet shows only RCLK (pin 13). On the
// Si473x family a 32.768 kHz crystal goes across RCLK and GPO3 (pin 2) with
// 2 x 22 pF to GND; the alternative is a 32.768 kHz oscillator into RCLK.
//   RADIO_CLOCK_CRYSTAL 1: crystal on RCLK/GPO3 (XOSCEN_CRYSTAL)
//   RADIO_CLOCK_CRYSTAL 0: external 32.768 kHz clock into RCLK (XOSCEN_RCLK)
#define RADIO_CLOCK_CRYSTAL 1
#define RADIO_REF_CLOCK_HZ  32768   // used when RADIO_CLOCK_CRYSTAL is 0
#define RADIO_VOLUME        45      // chip output volume 0-63 (mix level is the RAD fader)
#define RADIO_POLL_MS       500     // RSSI/SNR/RDS refresh

// Bands (European ranges). Frequencies: FM in 10 kHz units, AM bands in kHz.
enum RadioBand {
    BAND_FM = 0,    //  87.5-108.0 MHz, 100 kHz steps
    BAND_MW,        //  522-1710 kHz, 9 kHz steps (EU raster)
    BAND_SW,        //  2.3-26.1 MHz, 5 kHz steps
    BAND_LW,        //  153-279 kHz, 9 kHz steps
    BAND_COUNT
};

// Controls on the RAD screen (LCD_RADIO):
//   ENC_DECAY (encoder 5): turn = tune one step, SHIFT + turn = seek
//   nav left / right       = previous / next band
// Elsewhere encoder 5 keeps tempo/swing and nav keeps its normal roles.
// ============================================
// MOTION + ENVIRONMENT (motion_sensors.h)
// ============================================
#define MAG_CAL_MS          20000  // compass calibration: turn the device this long (SHIFT + PLAY)
#define EEPROM_MAGCAL_ADDR  64     // hard-iron offsets (16 bytes)
// Gestures: which ones exist (1) — all are OFF at boot; nav up on the SENSE
// screen switches them on / off together
#define GESTURE_SHAKE_CAPTURE 1    // shake: capture LINE-IN L
#define GESTURE_TILT_MELODY   1    // tilt left / right: previous / next capture on the melody layer
#define GESTURE_FLIP_MUTE     1    // face down: capture layers muted; face up: back

#define CAP_IRQ_PIN      35   // optional, not used yet
// CAP1188 sensitivity register 0x1F: 0x4F = 8x gain. 16x (0x3F) gave phantom
// touches with hands near the wires (test/bench_all uses 0x4F)
#define CAP_SENSITIVITY  0x4F
#define CAP_FAIL_LIMIT   20   // consecutive failed reads (~100 ms) before the pads count as gone
#define SPARE_ANALOG_PIN 41   // A17, only spare analog pin
// No NeoPixel ring and no status LEDs in v1: status goes to LCD/OLED,
// per-encoder colour to the Quad boards' NeoPixels.

// ============================================
// I2C ADDRESSES (Wire2 unless noted)
// ============================================

#define ADDR_GPS       0x10  // PA1010D
#define ADDR_SI4732    0x11  // radio, SEN to 3.3 V
#define ADDR_MCP23017  0x20  // buttons (GPB0-3), nav buttons (GPA0-4)
#define ADDR_CAP1188   0x29  // touch pads
#define ADDR_SSD1306   0x3C  // OLED map display
#define ADDR_ADS1115   0x48  // 16-bit ADC (faders)
#define ADDR_QUAD1     0x49  // encoders 1-4
#define ADDR_QUAD2     0x4A  // encoders 5-7
#define ADDR_ANO       0x4B  // ANO nav + wheel (A1 jumper cut)
#define ADDR_AK8963    0x0C  // compass inside the MPU9250 (through its I2C bypass)
#define ADDR_MPU9250   0x68  // IMU, AD0 to GND
#define ADDR_BMP280    0x76  // barometer, SDO to GND
// Wire (18/19): 0x0A SGTL5000 (answers only while MCLK runs)

// Polling (Wire2):
//   CAP1188  every 5 ms
//   Quads    when QUAD_INT_PIN is low, else every QUAD_FALLBACK_POLL_MS (QUAD_USE_INT 0: every ENCODER_POLL_MS)
//   Radio    status every RADIO_POLL_MS when fitted
//   ANO      every ANO_POLL_MS (or on QUAD_INT_PIN low if its INT is wired there)
//   MCP23017 every 10 ms
//   ADS1115  one channel every 10 ms (conversion started one poll earlier, no wait)
//   GPS      every 50 ms (at most one 32-byte I2C read)
//   OLED     every 200 ms

#define GPS_FIX_TIMEOUT_MS 3000   // state.gps.valid drops when no fix sentence arrived for this long

// ============================================
// AUDIO ROUTING
// ============================================

// SGTL5000 LINE-IN gain per channel (0 = 3.12 Vpp full scale .. 15 = 0.24 Vpp,
// ~1.5 dB steps). L: mic (MAX9814 ~2 Vpp) / piezo buffer (up to 3.3 Vpp) /
// coil / solar cell; R: Si4732 radio (~0.2 Vpp)
#define LINEIN_LEVEL_LEFT   0
#define LINEIN_LEVEL_RIGHT  11

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
    FX_RINGMOD,     // NOT IMPLEMENTED — no dedicated audio object; kept for preset compatibility
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
#define ENCODER_POLL_MS 10      // Quad encoder polling interval

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
