// Host test for the ESP32-S2 bridge parser and queue.
//   cd firmware/esp32
//   g++ -std=c++17 -O2 -Wall -Wextra -I../common -Isrc host_test/test_bridge.cpp -o /tmp/test_bridge
//   /tmp/test_bridge
//
// 1. Frames built with link_build_frame, concatenated with injected garbage, fed
//    to LinkParser in chunks split at random byte boundaries: every frame must
//    come out exactly once, byte-identical, in order.
// 2. link_frame_from_ws round trip and rejection of bad lengths.
// 3. FrameQueue: arrival order across rings, drop-oldest, CLIP never evicts others,
//    newest HELLO/CAPS only and delivered first.

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <random>
#include <vector>
#include "link_protocol.h"
#include "link_parser.h"
#include "frame_queue.h"
#include "rf_stats.h"

static int g_fail = 0;
#define CHECK(c) do { if (!(c)) { std::printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #c); g_fail++; } } while (0)

struct Sent { uint8_t type; uint16_t seq; std::vector<uint8_t> payload; };

static void test_parser(uint32_t seed) {
    std::mt19937 rng(seed);
    std::vector<uint8_t> stream;
    std::vector<Sent> sent;
    uint8_t enc[LINK_MAX_ENCODED];
    const int kFrames = 3000;
    for (int i = 0; i < kFrames; i++) {
        // garbage before ~1/4 of the frames; always terminated by 0x00 so it cannot
        // merge with the next frame (a real line glitch ends at the next delimiter)
        if (rng() % 4 == 0) {
            size_t g = rng() % 40;
            for (size_t k = 0; k < g; k++) stream.push_back((uint8_t)(rng() % 256));
            if (rng() % 10 == 0)  // sometimes a long run with no delimiter: overflow path
                for (size_t k = 0; k < LINK_MAX_ENCODED + 50; k++) stream.push_back((uint8_t)(1 + rng() % 255));
            stream.push_back(0x00);
        }
        Sent s;
        s.type = (uint8_t)(rng() % 256);
        s.seq = (uint16_t)i;
        uint16_t len;
        switch (rng() % 4) {
            case 0:  len = 0; break;
            case 1:  len = LINK_MAX_PAYLOAD; break;
            default: len = (uint16_t)(rng() % (LINK_MAX_PAYLOAD + 1));
        }
        int zero_bias = rng() % 3;   // 0: random, 1: many zeros, 2: no zeros (long COBS runs)
        for (uint16_t k = 0; k < len; k++) {
            uint8_t b = (uint8_t)(rng() % 256);
            if (zero_bias == 1 && rng() % 3 == 0) b = 0;
            if (zero_bias == 2 && b == 0) b = 1;
            s.payload.push_back(b);
        }
        size_t n = link_build_frame(s.type, s.seq, s.payload.data(), len, enc);
        CHECK(n > 0 && n <= LINK_MAX_ENCODED);
        stream.insert(stream.end(), enc, enc + n);
        sent.push_back(std::move(s));
    }
    // a corrupted frame: must be rejected (CRC), not delivered
    {
        uint8_t p[10] = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10};
        size_t n = link_build_frame(MSG_FEAT, 9999, p, sizeof(p), enc);
        enc[3] ^= 0x40;
        stream.insert(stream.end(), enc, enc + n);
    }

    static LinkParser parser;   // static: ~2 KB buffers
    parser = LinkParser();
    size_t got = 0;
    bool order_ok = true, bytes_ok = true;
    size_t pos = 0;
    while (pos < stream.size()) {
        size_t chunk = 1 + rng() % 300;   // random split boundaries
        if (pos + chunk > stream.size()) chunk = stream.size() - pos;
        for (size_t i = pos; i < pos + chunk; i++) {
            if (!parser.push(stream[i])) continue;
            if (got >= sent.size()) { order_ok = false; continue; }
            const Sent& s = sent[got];
            if (parser.type() != s.type || parser.seq() != s.seq || parser.len() != s.payload.size()) order_ok = false;
            else if (s.payload.size() && std::memcmp(parser.payload(), s.payload.data(), s.payload.size()) != 0) bytes_ok = false;
            // raw() is the WebSocket message: header | payload
            const uint8_t* r = parser.raw();
            if (parser.raw_len() != LINK_HEADER_SIZE + s.payload.size() || r[0] != s.type ||
                (r[1] | (r[2] << 8)) != s.seq || (size_t)(r[3] | (r[4] << 8)) != s.payload.size()) bytes_ok = false;
            got++;
        }
        pos += chunk;
    }
    CHECK(got == sent.size());
    CHECK(order_ok);
    CHECK(bytes_ok);
    CHECK(parser.stats().frames == sent.size());
    CHECK(parser.stats().crc_err + parser.stats().cobs_err >= 1);   // the corrupted frame
    std::printf("parser seed %u: %zu/%zu frames, crc_err=%u cobs_err=%u overflow=%u, %zu bytes\n", seed, got,
                sent.size(), parser.stats().crc_err, parser.stats().cobs_err, parser.stats().overflow, stream.size());
}

static void test_ws_roundtrip() {
    uint8_t msg[LINK_HEADER_SIZE + LINK_MAX_PAYLOAD];
    uint8_t enc[LINK_MAX_ENCODED];
    LinkParser* p = new LinkParser();
    for (uint16_t len : {(uint16_t)0, (uint16_t)1, (uint16_t)300, (uint16_t)LINK_MAX_PAYLOAD}) {
        msg[0] = MSG_PLAN; msg[1] = 0x34; msg[2] = 0x12; msg[3] = len & 0xFF; msg[4] = len >> 8;
        for (uint16_t i = 0; i < len; i++) msg[LINK_HEADER_SIZE + i] = (uint8_t)(i * 7);
        size_t n = link_frame_from_ws(msg, LINK_HEADER_SIZE + len, enc);
        CHECK(n > 0);
        bool done = false;
        for (size_t i = 0; i < n; i++) if (p->push(enc[i])) done = true;
        CHECK(done);
        CHECK(p->raw_len() == (size_t)(LINK_HEADER_SIZE + len));
        CHECK(std::memcmp(p->raw(), msg, LINK_HEADER_SIZE + len) == 0);
    }
    // bad: too short, length field mismatch, too long
    msg[3] = 10; msg[4] = 0;
    CHECK(link_frame_from_ws(msg, 4, enc) == 0);
    CHECK(link_frame_from_ws(msg, LINK_HEADER_SIZE + 9, enc) == 0);
    CHECK(link_frame_from_ws(msg, LINK_HEADER_SIZE + 11, enc) == 0);
    msg[3] = (LINK_MAX_PAYLOAD + 1) & 0xFF; msg[4] = (LINK_MAX_PAYLOAD + 1) >> 8;
    static uint8_t big[LINK_HEADER_SIZE + LINK_MAX_PAYLOAD + 1];
    std::memcpy(big, msg, LINK_HEADER_SIZE);
    CHECK(link_frame_from_ws(big, sizeof(big), enc) == 0);
    delete p;
    std::printf("ws round trip: ok\n");
}

// message = type | marker | filler (queue classifies by the type byte)
static void mk(uint8_t* d, uint8_t type, uint8_t marker, size_t n) {
    std::memset(d, marker, n); d[0] = type; d[1] = marker;
}

static void test_queue() {
    auto* q = new FrameQueue(1000, 300);
    CHECK(q->ok());
    uint8_t d[1100], out[LINK_HEADER_SIZE + LINK_MAX_PAYLOAD];
    uint32_t order;
    // arrival order across both rings
    for (int i = 0; i < 6; i++) { mk(d, i % 2 ? MSG_CLIP : MSG_FEAT, i, 50); CHECK(q->push(d, 50)); }
    for (int i = 0; i < 6; i++) {
        int n = q->peek(out, &order);
        CHECK(n == 50 && out[1] == i);
        CHECK(q->pop(order));
    }
    CHECK(q->empty() && q->peek(out, &order) == -1);
    // main ring: 1000 / (6 + 94) = 10 records; push 15 -> oldest 5 dropped
    for (int i = 0; i < 15; i++) { mk(d, MSG_FEAT, i, 94); q->push(d, 94); }
    CHECK(q->count() == 10 && q->dropped() == 5);
    // flood with clips: main records must survive
    for (int i = 0; i < 50; i++) { mk(d, MSG_CLIP, 0xC0, 144); q->push(d, 144); }
    // HELLO / CAPS: only the newest kept, delivered before any backlog
    mk(d, MSG_CAPS, 0xA1, 30);  q->push(d, 30);
    mk(d, MSG_HELLO, 0xB1, 20); q->push(d, 20);
    mk(d, MSG_CAPS, 0xA2, 1000); q->push(d, 1000);   // replaces 0xA1, larger than any ring is fine
    mk(d, MSG_HELLO, 0xB2, 20); q->push(d, 20);       // replaces 0xB1
    CHECK(q->replaced() == 2);
    CHECK(q->next_is_priority());
    CHECK(q->peek(out, &order) == 20 && out[0] == MSG_HELLO && out[1] == 0xB2);
    CHECK(q->pop(order));
    // CAPS replaced between peek and pop: the stale pop must not remove the new one
    CHECK(q->peek(out, &order) == 1000 && out[0] == MSG_CAPS && out[1] == 0xA2);
    mk(d, MSG_CAPS, 0xA3, 40); q->push(d, 40);
    CHECK(!q->pop(order));
    CHECK(q->peek(out, &order) == 40 && out[1] == 0xA3);
    CHECK(q->pop(order));
    CHECK(!q->next_is_priority());
    size_t main_left = 0, clips_left = 0;
    int first = -1;
    while (q->peek(out, &order) >= 0) {
        if (out[0] == MSG_CLIP) clips_left++;
        else { if (first < 0) first = out[1]; main_left++; }
        q->pop(order);
    }
    CHECK(main_left == 10 && first == 5);
    CHECK(clips_left == 2);   // 300 / 150
    // stale pop is a no-op
    mk(d, MSG_GPS, 1, 10); q->push(d, 10);
    CHECK(!q->pop(order + 12345));
    CHECK(q->count() == 1);
    // record larger than its ring is refused; over-max length refused
    mk(d, MSG_CLIP, 2, 400);
    CHECK(!q->push(d, 400));
    CHECK(!q->push(d, LINK_HEADER_SIZE + LINK_MAX_PAYLOAD + 1));
    delete q;
    std::printf("queue: ok\n");
}

static void test_rf() {
    static_assert(sizeof(LinkRf) == 20, "LinkRf is 20 B");
    LinkRf rf;
    RfAccumulator a;
    a.finish(5, &rf);
    CHECK(rf.t_ms == 5 && rf.ap_count == 0 && rf.rssi_median == -128 && rf.rssi_max == -128);
    RfAccumulator b;
    int32_t r[] = {-70, -40, -90, -55, -60};
    int32_t c[] = {1, 6, 6, 11, 14};   // channel 14 counted in ap_count, not in ch_busy
    for (int i = 0; i < 5; i++) b.add(r[i], c[i]);
    b.finish(1234, &rf);
    CHECK(rf.ap_count == 5 && rf.rssi_median == -60 && rf.rssi_max == -40);
    CHECK(rf.ch_busy[0] == 1 && rf.ch_busy[5] == 2 && rf.ch_busy[10] == 1);
    int sum = 0; for (int i = 0; i < 13; i++) sum += rf.ch_busy[i];
    CHECK(sum == 4);
    RfAccumulator e;   // even count: mean of the middle two; clamp out-of-range RSSI
    e.add(-80, 3); e.add(-50, 3); e.add(-300, 3); e.add(5, 3);
    e.finish(0, &rf);
    CHECK(rf.ap_count == 4 && rf.rssi_median == -65 && rf.rssi_max == 0 && rf.ch_busy[2] == 4);
    RfAccumulator f;   // > 255 APs: capped
    for (int i = 0; i < 300; i++) f.add(-60, 1);
    f.finish(0, &rf);
    CHECK(rf.ap_count == 255 && rf.ch_busy[0] == 255);
    std::printf("rf: ok\n");
}

int main() {
    for (uint32_t seed : {1u, 2u, 3u, 0xC0FFEEu, 20261021u}) test_parser(seed);
    test_ws_roundtrip();
    test_queue();
    test_rf();
    std::printf(g_fail ? "FAILED (%d)\n" : "ALL PASS\n", g_fail);
    return g_fail ? 1 : 0;
}
