// Oh My Ondas - UART frame parser for the Teensy link (header-only, builds on host too)
//
// Feed bytes one at a time; push() returns true when a complete, CRC-valid frame
// is ready. raw()/raw_len() give header | payload (CRC stripped), which is exactly
// the binary WebSocket message the server expects.
// Garbage between frames is discarded at the next 0x00 delimiter and counted.

#pragma once
#include <stdint.h>
#include <stddef.h>
#include "link_protocol.h"

struct LinkParserStats {
    uint32_t frames;      // valid frames delivered
    uint32_t crc_err;     // COBS ok, CRC or length field wrong
    uint32_t cobs_err;    // COBS decode failed
    uint32_t overflow;    // more than LINK_MAX_ENCODED bytes without a delimiter
};

class LinkParser {
public:
    // Returns true when a valid frame has just been completed.
    bool push(uint8_t b) {
        if (b != 0x00) {
            if (skipping_) return false;
            if (n_ >= sizeof(enc_)) {          // no delimiter in time: drop until next 0x00
                stats_.overflow++;
                skipping_ = true;
                n_ = 0;
                return false;
            }
            enc_[n_++] = b;
            return false;
        }
        // delimiter
        if (skipping_) { skipping_ = false; n_ = 0; return false; }
        if (n_ == 0) return false;             // empty frame (e.g. leading 0x00), ignore
        size_t dn = link_cobs_decode(enc_, n_, raw_);
        n_ = 0;
        if (dn == 0) { stats_.cobs_err++; return false; }
        uint8_t type = 0; uint16_t seq = 0; const uint8_t* payload = nullptr;
        int len = link_parse_frame(raw_, dn, &type, &seq, &payload);
        if (len < 0 || len > LINK_MAX_PAYLOAD) { stats_.crc_err++; return false; }
        type_ = type; seq_ = seq; len_ = (uint16_t)len;
        stats_.frames++;
        return true;
    }

    uint8_t        type()    const { return type_; }
    uint16_t       seq()     const { return seq_; }
    uint16_t       len()     const { return len_; }                      // payload bytes
    const uint8_t* payload() const { return raw_ + LINK_HEADER_SIZE; }
    const uint8_t* raw()     const { return raw_; }                      // header | payload
    size_t         raw_len() const { return LINK_HEADER_SIZE + len_; }
    const LinkParserStats& stats() const { return stats_; }

private:
    // COBS output of a max frame fits in LINK_MAX_ENCODED - 1 (the -1 is the delimiter)
    uint8_t  enc_[LINK_MAX_ENCODED];
    // decode may write one byte beyond a valid frame on malformed input; keep slack
    uint8_t  raw_[LINK_MAX_ENCODED];
    size_t   n_ = 0;
    bool     skipping_ = false;
    uint8_t  type_ = 0;
    uint16_t seq_ = 0, len_ = 0;
    LinkParserStats stats_ = {};
};

// Validates a binary WebSocket message from the server (header | payload) and
// encodes it as a UART frame into out (LINK_MAX_ENCODED). Returns bytes to write, 0 if invalid.
static inline size_t link_frame_from_ws(const uint8_t* msg, size_t n, uint8_t* out) {
    if (n < LINK_HEADER_SIZE || n > LINK_HEADER_SIZE + LINK_MAX_PAYLOAD) return 0;
    uint16_t len = msg[3] | (msg[4] << 8);
    if ((size_t)len + LINK_HEADER_SIZE != n) return 0;
    uint16_t seq = msg[1] | (msg[2] << 8);
    return link_build_frame(msg[0], seq, msg + LINK_HEADER_SIZE, len, out);
}
