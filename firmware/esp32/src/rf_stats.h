// Oh My Ondas - WiFi density summary (MSG_RF), header-only, builds on host too.
//
// Privacy: input is only RSSI + channel per access point; no SSID, no BSSID/MAC
// ever reaches this code or the LinkRf output (counts and levels only).

#pragma once
#include <stdint.h>
#include <stddef.h>
#include <string.h>
#include "link_protocol.h"

// Collects up to 255 access points (ap_count is a uint8_t).
struct RfAccumulator {
    int8_t  rssi[255];
    uint8_t n = 0;
    uint8_t ch_busy[13] = {};

    void add(int32_t rssi_dbm, int32_t channel) {
        if (n < sizeof(rssi)) rssi[n++] = (int8_t)(rssi_dbm < -128 ? -128 : rssi_dbm > 0 ? 0 : rssi_dbm);
        if (channel >= 1 && channel <= 13 && ch_busy[channel - 1] < 255) ch_busy[channel - 1]++;
    }

    // Median: middle value, mean of the two middle values for an even count.
    // No AP: median = max = -128.
    void finish(uint32_t t_ms, LinkRf* out) {
        // insertion sort, n <= 255
        for (uint8_t i = 1; i < n; i++) {
            int8_t v = rssi[i];
            int j = i - 1;
            while (j >= 0 && rssi[j] > v) { rssi[j + 1] = rssi[j]; j--; }
            rssi[j + 1] = v;
        }
        out->t_ms = t_ms;
        out->ap_count = n;
        if (n == 0) {
            out->rssi_median = -128;
            out->rssi_max = -128;
        } else {
            out->rssi_max = rssi[n - 1];
            out->rssi_median = (n % 2) ? rssi[n / 2]
                                       : (int8_t)(((int)rssi[n / 2 - 1] + (int)rssi[n / 2]) / 2);
        }
        memcpy(out->ch_busy, ch_busy, sizeof(ch_busy));
    }
};
