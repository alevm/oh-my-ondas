// Oh My Ondas - Teensy <-> ESP32-S2 link protocol (Serial7, 2 Mbaud)
// Shared by both firmwares. Design: docs/technical/ai-layer2-design.md
//
// Frame on the wire: COBS(header | payload | crc16) followed by 0x00.
//   header  = type (1) | seq (2, LE) | length (2, LE)  -> length = payload bytes
//   crc16   = CRC-16/CCITT-FALSE over header + payload, LE
// The ESP32 forwards frames to the server unchanged (binary WebSocket
// message = header | payload, no COBS, no CRC) and back.

#pragma once
#include <stdint.h>
#include <stddef.h>

#define LINK_BAUD          2000000
#define LINK_BAUD_FALLBACK 1000000
// Set to 1 on BOTH sides (same header) to run the link at LINK_BAUD_FALLBACK
#ifndef LINK_USE_FALLBACK_BAUD
#define LINK_USE_FALLBACK_BAUD 0
#endif
#define LINK_BAUD_ACTIVE   (LINK_USE_FALLBACK_BAUD ? LINK_BAUD_FALLBACK : LINK_BAUD)
#define LINK_MAX_PAYLOAD   1024
#define LINK_HEADER_SIZE   5
#define LINK_MAX_FRAME     (LINK_HEADER_SIZE + LINK_MAX_PAYLOAD + 2)
// COBS adds at most 1 byte per 254, plus the delimiter
#define LINK_MAX_ENCODED   (LINK_MAX_FRAME + LINK_MAX_FRAME / 254 + 2)

enum LinkMsgType : uint8_t {
    // Teensy -> server
    MSG_FEAT     = 0x01,  // 10 Hz
    MSG_ONSET    = 0x02,  // per event
    MSG_PULSE    = 0x03,  // 1 Hz
    MSG_PIEZO    = 0x04,  // 10 Hz
    MSG_RADIO    = 0x05,  // 1 Hz + on change
    MSG_GPS      = 0x06,  // 1 Hz
    MSG_USER     = 0x07,  // on change
    MSG_CAPS     = 0x08,  // on change: capture inventory
    MSG_CLIP     = 0x09,  // audio chunk (IMA-ADPCM), split over several frames
    MSG_HELLO    = 0x0A,  // Teensy boot / firmware version
    MSG_MOTION   = 0x0B,  // 10 Hz, IMU
    MSG_ENV      = 0x0C,  // 1 Hz, barometer
    MSG_RF       = 0x0D,  // every ~10 s, WiFi density (ESP32 -> server AND -> Teensy)
    // server -> Teensy
    MSG_PLAN     = 0x41,  // packed plan, see LinkPlan*
    MSG_REQ_CLIP = 0x42,
    MSG_ACK      = 0x43,
    MSG_ERR      = 0x44,
    // ESP32 -> Teensy (local)
    MSG_LINK_STATE = 0x60, // WiFi / server connection state
};

enum LinkSource : uint8_t { SRC_MIC = 0, SRC_PIEZO = 1, SRC_RADIO = 2, SRC_COIL = 3, SRC_LIGHT = 4 };

#pragma pack(push, 1)

struct LinkFeat {            // MSG_FEAT
    uint32_t t_ms;
    int8_t   bands_db[32];   // log-spaced 40 Hz..16 kHz, dBFS (-128..0)
    uint16_t rms;            // 0..65535 linear
    uint16_t centroid_hz;
    uint8_t  flatness;       // 0 = tonal .. 255 = noise
    uint8_t  chroma[12];     // 0..255 per pitch class
    uint16_t pitch_hz_x10;   // fundamental, Hz * 10, 0 = none
    uint8_t  pitch_conf;     // 0..255
    uint8_t  onsets;         // onsets since previous FEAT
    uint8_t  speech;         // 0..255 speech likelihood (mic)
    uint8_t  left_source;    // LinkSource on LINE-IN L right now (mic or piezo)
};

struct LinkOnset {           // MSG_ONSET
    uint32_t t_ms;
    uint8_t  source;         // LinkSource
    uint8_t  strength;       // 0..255
    uint8_t  band;           // index of the band with max energy (0..31)
};

struct LinkPulse {           // MSG_PULSE
    uint32_t t_ms;
    uint16_t bpm_x10;
    uint8_t  conf;
    uint16_t phase_ms;       // time since the last beat
    uint16_t bar;            // sequencer bar counter (wraps), for PLAN.starts_at_bar
    uint8_t  step;           // current step in the bar, 0..15
};

struct LinkPiezo {           // MSG_PIEZO
    uint32_t t_ms;
    uint16_t rms;
    int8_t   bands_db[8];
    uint8_t  peaks;
};

struct LinkRadio {           // MSG_RADIO
    uint32_t t_ms;
    uint8_t  band;           // 0 FM, 1 AM/MW, 2 SW, 3 LW
    uint32_t freq_khz;
    uint8_t  rssi;           // dBuV
    uint8_t  snr;            // dB
    uint8_t  speech_music;   // 0 = music .. 255 = speech
    char     rds_ps[9];      // station name, NUL-terminated, "" if none
    char     rds_rt[65];     // radio text, NUL-terminated, "" if none
};

struct LinkGps {             // MSG_GPS
    uint32_t t_ms;
    int32_t  lat_e7;
    int32_t  lon_e7;
    int16_t  alt_m;
    uint16_t speed_cms;
    uint16_t heading_cdeg;
    uint8_t  fix;            // 0 none, 1 GPS, 2 DGPS
    uint8_t  sats;
    uint32_t utc;            // unix seconds, 0 if unknown
};

struct LinkUser {            // MSG_USER
    uint32_t t_ms;
    uint16_t faders[5];      // 0..4095
    int8_t   enc_delta[7];
    uint8_t  pads;           // bit per pad hit since last USER
    uint8_t  buttons;        // MODE, SHIFT, REC, PLAY, nav bits
    uint8_t  mode;
};

struct LinkCapEntry {        // one entry of MSG_CAPS
    uint8_t  id;
    uint8_t  source;         // LinkSource
    uint16_t length_ms;
    uint8_t  kind;           // 0 percussive, 1 tonal, 2 ambient
    uint8_t  role;           // 0 rhythm, 1 texture, 2 melody, 3 modulation, 255 none
    uint8_t  onsets;
    uint16_t pitch_hz_x10;
};
// MSG_CAPS payload: uint8_t count, then count * LinkCapEntry

struct LinkClipHdr {         // start of each MSG_CLIP payload, then ADPCM bytes
    uint16_t clip_id;
    uint8_t  source;
    uint16_t sample_rate;    // 16000
    uint16_t chunk;          // 0..chunks-1
    uint16_t chunks;
    // IMA-ADPCM state at the start of this chunk
    int16_t  predictor;
    uint8_t  step_index;
};

struct LinkHello {           // MSG_HELLO
    uint8_t  proto;          // LINK_PROTO_VERSION
    char     fw[16];
};

struct LinkState {           // MSG_LINK_STATE
    uint8_t  wifi;           // 0 down, 1 connecting, 2 up
    uint8_t  server;         // 0 down, 1 up
    int8_t   rssi_dbm;
};

struct LinkMotion {          // MSG_MOTION
    uint32_t t_ms;
    uint16_t accel_rms_mg;   // dynamic acceleration (gravity removed), milli-g
    uint8_t  steps;          // steps detected since previous MOTION
    uint16_t cadence_x10;    // steps per minute * 10, 0 = standing
    int16_t  gyro_dps[3];    // deg/s
    int16_t  pitch_cdeg;     // device tilt, 0.01 deg
    int16_t  roll_cdeg;
    uint16_t heading_cdeg;   // 0..35999, 0xFFFF = no compass
    uint16_t mag_ut_x10;     // field magnitude, uT * 10
    uint16_t mag_var_x10;    // field variation over the last second, uT * 10
    uint8_t  gesture;        // 0 none, 1 shake, 2 tilt left, 3 tilt right, 4 flip
};

struct LinkEnv {             // MSG_ENV
    uint32_t t_ms;
    uint32_t pressure_pa;
    int16_t  temp_cdeg;      // 0.01 C
    int16_t  dalt_cm;        // height change vs the walk start, cm
    int16_t  dp_trend_pa_h;  // pressure trend, Pa per hour
    uint16_t dp_fast_pa_x10; // short-term pressure fluctuation (gusts, doors, tunnels), Pa * 10
};

struct LinkRf {              // MSG_RF (counts only: no SSIDs, no MACs)
    uint32_t t_ms;           // ESP32 clock
    uint8_t  ap_count;
    int8_t   rssi_median;
    int8_t   rssi_max;
    uint8_t  ch_busy[13];    // APs per 2.4 GHz channel 1..13
};

// MSG_PLAN payload:
//   LinkPlanHdr, then track_count * LinkPlanTrack
struct LinkPlanHdr {
    uint16_t plan_id;
    uint16_t starts_at_bar;
    uint8_t  bars;
    uint16_t bpm_x10;        // 0 = keep current
    uint8_t  follow_pulse;   // 1 = layer 1 keeps tempo locked to the sensed pulse
    uint8_t  track_count;    // <= 8
};

struct LinkPlanTrack {
    uint8_t  role;           // 0 rhythm, 1 texture, 2 melody, 3 modulation
    uint8_t  capture_id;     // must be in the latest MSG_CAPS
    uint16_t steps;          // 16-step trig mask, bit 0 = step 1
    uint8_t  prob;           // 0..255
    int8_t   pitch;          // semitones
    uint8_t  density_from;   // texture: 0..255
    uint8_t  density_to;
    uint8_t  mod_source;     // modulation: feature index (0 rms, 1 centroid, 2 piezo rms, 3 onsets, 4 radio rssi,
                             // 5 cadence, 6 accel rms, 7 heading, 8 mag var, 9 dalt, 10 dp fast, 11 rf density)
    uint8_t  mod_target;     // modulation: 0 texture filter, 1 rhythm prob, 2 melody pitch, 3 master fx mix
    uint8_t  mod_depth;      // 0..255
    uint8_t  slice;          // 0 whole capture, 1 at onsets, 2 even 16 slices
    uint8_t  duck_on;        // role this track ducks under (0..3), 255 none
    uint8_t  flags;          // bit 0: snap pitch to the sensed chroma (scale_from)
    int8_t   notes[16];      // melody: semitone offset per step (from pitch), LINK_NOTE_NONE = rest/use steps mask
};
#define LINK_NOTE_NONE (-128)
// capture_id 255 = no capture (modulation tracks)

struct LinkReqClip {         // MSG_REQ_CLIP
    uint8_t  source;         // LinkSource
    uint8_t  seconds;        // 1..10
};

struct LinkAck {             // MSG_ACK
    uint16_t ref_seq;
    uint8_t  ref_type;
};

struct LinkErr {             // MSG_ERR
    uint16_t ref_seq;
    uint8_t  ref_type;
    uint8_t  code;           // 1 bad frame, 2 unknown type, 3 invalid plan, 4 auth, 5 rate
};

// IMA-ADPCM in MSG_CLIP: 2 samples per byte, low nibble first.
// MSG_LINK_STATE rssi_dbm = -128 when WiFi is down.

#pragma pack(pop)

#define LINK_PROTO_VERSION 4

// ---------- CRC-16/CCITT-FALSE ----------
static inline uint16_t link_crc16(const uint8_t* d, size_t n, uint16_t crc = 0xFFFF) {
    for (size_t i = 0; i < n; i++) {
        crc ^= (uint16_t)d[i] << 8;
        for (int b = 0; b < 8; b++) crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1;
    }
    return crc;
}

// ---------- COBS ----------
// Encodes n bytes from in to out (out must hold n + n/254 + 1). Returns encoded length (no delimiter).
static inline size_t link_cobs_encode(const uint8_t* in, size_t n, uint8_t* out) {
    size_t r = 0, w = 1, code_i = 0;
    uint8_t code = 1;
    while (r < n) {
        if (in[r] == 0) {
            out[code_i] = code; code = 1; code_i = w++; r++;
        } else {
            out[w++] = in[r++]; code++;
            if (code == 0xFF) { out[code_i] = code; code = 1; code_i = w++; }
        }
    }
    out[code_i] = code;
    return w;
}

// Decodes n bytes (no delimiter). Returns decoded length, or 0 on error.
static inline size_t link_cobs_decode(const uint8_t* in, size_t n, uint8_t* out) {
    size_t r = 0, w = 0;
    while (r < n) {
        uint8_t code = in[r++];
        if (code == 0 || r + code - 1 > n) return 0;
        for (uint8_t i = 1; i < code; i++) out[w++] = in[r++];
        if (code != 0xFF && r < n) out[w++] = 0;
    }
    return w;
}

// Builds a full encoded frame (with trailing 0x00) into out. Returns bytes to send, 0 if too long.
static inline size_t link_build_frame(uint8_t type, uint16_t seq, const void* payload, uint16_t len,
                                      uint8_t* out /* LINK_MAX_ENCODED */) {
    if (len > LINK_MAX_PAYLOAD) return 0;
    uint8_t raw[LINK_MAX_FRAME];
    raw[0] = type; raw[1] = seq & 0xFF; raw[2] = seq >> 8; raw[3] = len & 0xFF; raw[4] = len >> 8;
    const uint8_t* p = (const uint8_t*)payload;
    for (uint16_t i = 0; i < len; i++) raw[LINK_HEADER_SIZE + i] = p[i];
    uint16_t crc = link_crc16(raw, LINK_HEADER_SIZE + len);
    raw[LINK_HEADER_SIZE + len] = crc & 0xFF;
    raw[LINK_HEADER_SIZE + len + 1] = crc >> 8;
    size_t n = link_cobs_encode(raw, LINK_HEADER_SIZE + len + 2, out);
    out[n++] = 0x00;
    return n;
}

// Parses a decoded frame (COBS already removed). Returns payload length or -1 on bad CRC/length.
static inline int link_parse_frame(const uint8_t* raw, size_t n, uint8_t* type, uint16_t* seq,
                                   const uint8_t** payload) {
    if (n < LINK_HEADER_SIZE + 2) return -1;
    uint16_t len = raw[3] | (raw[4] << 8);
    if ((size_t)len + LINK_HEADER_SIZE + 2 != n) return -1;
    uint16_t crc = raw[n - 2] | (raw[n - 1] << 8);
    if (link_crc16(raw, n - 2) != crc) return -1;
    *type = raw[0];
    *seq = raw[1] | (raw[2] << 8);
    *payload = raw + LINK_HEADER_SIZE;
    return len;
}
