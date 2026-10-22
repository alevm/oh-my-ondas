// Oh My Ondas - bounded store-and-forward queue for Teensy -> server messages
// (header-only, builds on host too; not thread-safe: the caller locks).
//
// Classes of message (by type byte, data[0]):
//   HELLO, CAPS  -> one "latest" slot each: a newer one replaces the queued one;
//                   peek() returns these first (HELLO, then CAPS), before any backlog.
//   CLIP         -> its own ring, so audio chunks never push feature frames out.
//   everything else -> main ring.
// Each ring drops its oldest records when full. After the slots, peek()/pop()
// return records in arrival order across both rings.
//
// Record layout in a ring: len (2, LE) | order (4, LE) | data (len)

#pragma once
#include <stdint.h>
#include <stddef.h>
#include <string.h>
#include <initializer_list>
#include <new>
#include "link_protocol.h"

// Ring buffers are heap-allocated at construction (the ESP32-S2 static DRAM
// segment is too small for them); check ok() after constructing.
class ByteRing {
public:
    static constexpr size_t kRecHdr = 6;

    explicit ByteRing(size_t cap) : buf_(new (std::nothrow) uint8_t[cap]), cap_(buf_ ? cap : 0) {}
    ~ByteRing() { delete[] buf_; }
    ByteRing(const ByteRing&) = delete;
    ByteRing& operator=(const ByteRing&) = delete;

    bool   ok()       const { return buf_ != nullptr; }
    size_t capacity() const { return cap_; }

    bool   empty()  const { return used_ == 0; }
    size_t used()   const { return used_; }
    size_t count()  const { return count_; }

    // Appends a record, dropping oldest ones until it fits. Returns records dropped,
    // or -1 if the record can never fit.
    int push(const uint8_t* data, uint16_t len, uint32_t order) {
        size_t need = kRecHdr + len;
        if (need > cap_) return -1;
        int dropped = 0;
        while (cap_ - used_ < need) { drop_head(); dropped++; }
        uint8_t hdr[kRecHdr] = { (uint8_t)len, (uint8_t)(len >> 8),
                                 (uint8_t)order, (uint8_t)(order >> 8),
                                 (uint8_t)(order >> 16), (uint8_t)(order >> 24) };
        write(hdr, kRecHdr);
        write(data, len);
        count_++;
        return dropped;
    }

    // Head record: order and length. Requires !empty().
    uint32_t head_order() const {
        return (uint32_t)at(2) | ((uint32_t)at(3) << 8) | ((uint32_t)at(4) << 16) | ((uint32_t)at(5) << 24);
    }
    uint16_t head_len() const { return (uint16_t)(at(0) | (at(1) << 8)); }
    void head_copy(uint8_t* out) const {
        uint16_t n = head_len();
        for (uint16_t i = 0; i < n; i++) out[i] = at(kRecHdr + i);
    }
    void drop_head() {
        size_t n = kRecHdr + head_len();
        head_ = (head_ + n) % cap_;
        used_ -= n;
        count_--;
    }
    void clear() { head_ = used_ = count_ = 0; }

private:
    uint8_t at(size_t off) const { return buf_[(head_ + off) % cap_]; }
    void write(const uint8_t* d, size_t n) {
        size_t tail = (head_ + used_) % cap_;
        size_t first = cap_ - tail < n ? cap_ - tail : n;
        memcpy(buf_ + tail, d, first);
        memcpy(buf_, d + first, n - first);
        used_ += n;
    }
    uint8_t* buf_;
    size_t  cap_;
    size_t  head_ = 0, used_ = 0, count_ = 0;
};

// Holds at most one message; a newer one replaces it.
class LatestSlot {
public:
    bool     full()  const { return full_; }
    uint32_t order() const { return order_; }
    uint16_t len()   const { return len_; }
    const uint8_t* data() const { return buf_; }
    // Returns true if an older message was replaced.
    bool set(const uint8_t* d, uint16_t n, uint32_t order) {
        bool replaced = full_;
        memcpy(buf_, d, n); len_ = n; order_ = order; full_ = true;
        return replaced;
    }
    void clear() { full_ = false; }
private:
    uint8_t  buf_[LINK_HEADER_SIZE + LINK_MAX_PAYLOAD];
    uint16_t len_ = 0;
    uint32_t order_ = 0;
    bool     full_ = false;
};

class FrameQueue {
public:
    FrameQueue(size_t main_cap, size_t clip_cap) : main_(main_cap), clip_(clip_cap) {}
    bool ok() const { return main_.ok() && clip_.ok(); }
    size_t main_capacity() const { return main_.capacity(); }
    size_t clip_capacity() const { return clip_.capacity(); }

    // data = header | payload. Returns false only if the message cannot be stored.
    bool push(const uint8_t* data, uint16_t len) {
        if (len < 1 || len > LINK_HEADER_SIZE + LINK_MAX_PAYLOAD) { dropped_++; return false; }
        uint8_t type = data[0];
        if (type == MSG_HELLO || type == MSG_CAPS) {
            LatestSlot& sl = type == MSG_HELLO ? hello_ : caps_;
            if (sl.set(data, len, order_)) replaced_++;
            order_++;
            return true;
        }
        int d = type == MSG_CLIP ? clip_.push(data, len, order_) : main_.push(data, len, order_);
        if (d < 0) { dropped_++; return false; }
        dropped_ += (uint32_t)d;
        order_++;
        return true;
    }

    bool empty() const { return !hello_.full() && !caps_.full() && main_.empty() && clip_.empty(); }
    size_t count() const { return hello_.full() + caps_.full() + main_.count() + clip_.count(); }
    size_t used()  const { return main_.used() + clip_.used(); }
    uint32_t dropped()  const { return dropped_; }    // lost to ring overflow
    uint32_t replaced() const { return replaced_; }   // HELLO/CAPS superseded by a newer one

    // True if the next peek() returns a HELLO/CAPS slot (not rate-limited backlog).
    bool next_is_priority() const { return hello_.full() || caps_.full(); }

    // Copies the next record into out (LINK_HEADER_SIZE + LINK_MAX_PAYLOAD bytes).
    // Returns its length and sets *order; returns -1 if empty.
    int peek(uint8_t* out, uint32_t* order) const {
        for (const LatestSlot* sl : { &hello_, &caps_ }) {
            if (!sl->full()) continue;
            memcpy(out, sl->data(), sl->len());
            *order = sl->order();
            return sl->len();
        }
        if (main_.empty() && clip_.empty()) return -1;
        if (from_clip()) { *order = clip_.head_order(); clip_.head_copy(out); return clip_.head_len(); }
        *order = main_.head_order(); main_.head_copy(out); return main_.head_len();
    }

    // Removes the record with this order if it is still at a head (it may have been
    // dropped meanwhile). Returns true if removed.
    bool pop(uint32_t order) {
        if (hello_.full() && hello_.order() == order) { hello_.clear(); return true; }
        if (caps_.full() && caps_.order() == order) { caps_.clear(); return true; }
        if (!main_.empty() && main_.head_order() == order) { main_.drop_head(); return true; }
        if (!clip_.empty() && clip_.head_order() == order) { clip_.drop_head(); return true; }
        return false;
    }

private:
    bool from_clip() const {
        if (clip_.empty()) return false;
        if (main_.empty()) return true;
        return (int32_t)(clip_.head_order() - main_.head_order()) < 0;  // wrap-safe
    }
    ByteRing main_;
    ByteRing clip_;
    LatestSlot hello_, caps_;
    uint32_t order_ = 0;
    uint32_t dropped_ = 0;
    uint32_t replaced_ = 0;
};
