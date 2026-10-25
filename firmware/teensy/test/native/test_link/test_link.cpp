// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Oh My Ondas - host tests for common/link_protocol.h (CRC, COBS, frames)
 * Run: pio test -e native   (no board needed)
 */

#include <unity.h>
#include <string.h>
#include "link_protocol.h"

void setUp() {}
void tearDown() {}

// CRC-16/CCITT-FALSE check value
static void test_crc16_check_value() {
    const char* s = "123456789";
    TEST_ASSERT_EQUAL_HEX16(0x29B1, link_crc16((const uint8_t*)s, 9));
    TEST_ASSERT_EQUAL_HEX16(0xFFFF, link_crc16((const uint8_t*)s, 0));
}

static void test_cobs_known_vectors() {
    uint8_t out[16];
    const uint8_t a[] = {0x00};
    TEST_ASSERT_EQUAL(2, link_cobs_encode(a, 1, out));
    TEST_ASSERT_EQUAL_HEX8(0x01, out[0]);
    TEST_ASSERT_EQUAL_HEX8(0x01, out[1]);

    const uint8_t b[] = {0x11, 0x22, 0x00, 0x33};
    const uint8_t bEnc[] = {0x03, 0x11, 0x22, 0x02, 0x33};
    TEST_ASSERT_EQUAL(sizeof(bEnc), link_cobs_encode(b, sizeof(b), out));
    TEST_ASSERT_EQUAL_HEX8_ARRAY(bEnc, out, sizeof(bEnc));
}

// Encoded data never contains the 0x00 delimiter, and decodes back
static void test_cobs_roundtrip_lengths() {
    static uint8_t in[LINK_MAX_FRAME], enc[LINK_MAX_ENCODED], dec[LINK_MAX_FRAME];
    uint32_t x = 12345;
    for (size_t n = 1; n <= LINK_MAX_FRAME; n += (n < 600 ? 1 : 7)) {
        for (size_t i = 0; i < n; i++) {
            x = x * 1103515245u + 12345u;
            in[i] = (x >> 16) % 5 == 0 ? 0 : (uint8_t)(x >> 8);   // ~20 % zeros
        }
        if (n == 254 || n == 255) memset(in, 0x5A, n);            // runs at the 0xFF code boundary
        size_t e = link_cobs_encode(in, n, enc);
        TEST_ASSERT_TRUE(e <= n + n / 254 + 1);
        TEST_ASSERT_NULL(memchr(enc, 0, e));
        TEST_ASSERT_EQUAL(n, link_cobs_decode(enc, e, dec));
        TEST_ASSERT_EQUAL_MEMORY(in, dec, n);
    }
}

static void test_cobs_decode_rejects_bad_input() {
    uint8_t dec[16];
    const uint8_t zeroCode[] = {0x02, 0x11, 0x00, 0x22};
    TEST_ASSERT_EQUAL(0, link_cobs_decode(zeroCode, sizeof(zeroCode), dec));
    const uint8_t overrun[] = {0x05, 0x11, 0x22};
    TEST_ASSERT_EQUAL(0, link_cobs_decode(overrun, sizeof(overrun), dec));
}

// build -> strip delimiter -> COBS decode -> parse gives the same frame back
static void test_frame_roundtrip_and_corruption() {
    static uint8_t enc[LINK_MAX_ENCODED], raw[LINK_MAX_FRAME];
    uint8_t payload[LINK_MAX_PAYLOAD];
    for (int i = 0; i < LINK_MAX_PAYLOAD; i++) payload[i] = (uint8_t)(i * 7);

    const uint16_t lens[] = {0, 1, 253, 254, 255, 600, LINK_MAX_PAYLOAD};
    for (uint16_t len : lens) {
        size_t n = link_build_frame(MSG_PLAN, 0xBEEF, payload, len, enc);
        TEST_ASSERT_TRUE(n > 0 && n <= LINK_MAX_ENCODED);
        TEST_ASSERT_EQUAL_HEX8(0x00, enc[n - 1]);
        TEST_ASSERT_NULL(memchr(enc, 0, n - 1));

        size_t r = link_cobs_decode(enc, n - 1, raw);
        TEST_ASSERT_EQUAL(LINK_HEADER_SIZE + len + 2, r);
        uint8_t type = 0; uint16_t seq = 0; const uint8_t* p = nullptr;
        TEST_ASSERT_EQUAL(len, link_parse_frame(raw, r, &type, &seq, &p));
        TEST_ASSERT_EQUAL_HEX8(MSG_PLAN, type);
        TEST_ASSERT_EQUAL_HEX16(0xBEEF, seq);
        if (len) TEST_ASSERT_EQUAL_MEMORY(payload, p, len);

        raw[r / 2] ^= 0x10;                                       // one flipped bit: CRC fails
        TEST_ASSERT_EQUAL(-1, link_parse_frame(raw, r, &type, &seq, &p));
        raw[r / 2] ^= 0x10;
        TEST_ASSERT_EQUAL(-1, link_parse_frame(raw, r - 1, &type, &seq, &p));   // length mismatch
    }
    TEST_ASSERT_EQUAL(-1, link_parse_frame(raw, LINK_HEADER_SIZE + 1, nullptr, nullptr, nullptr));
}

static void test_frame_too_long_rejected() {
    static uint8_t enc[LINK_MAX_ENCODED];
    static uint8_t payload[LINK_MAX_PAYLOAD + 1];
    TEST_ASSERT_EQUAL(0, link_build_frame(MSG_FEAT, 1, payload, LINK_MAX_PAYLOAD + 1, enc));
}

int main() {
    UNITY_BEGIN();
    RUN_TEST(test_crc16_check_value);
    RUN_TEST(test_cobs_known_vectors);
    RUN_TEST(test_cobs_roundtrip_lengths);
    RUN_TEST(test_cobs_decode_rejects_bad_input);
    RUN_TEST(test_frame_roundtrip_and_corruption);
    RUN_TEST(test_frame_too_long_rejected);
    return UNITY_END();
}
