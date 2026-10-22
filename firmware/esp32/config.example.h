/**
 * Oh My Ondas - ESP32-S2 bridge configuration TEMPLATE (tracked, placeholders only)
 *
 *   cp config.example.h config.h      # then edit config.h
 *
 * config.h is gitignored (firmware/esp32/config.h in .gitignore).
 * Never put real credentials in this file.
 */
#pragma once

// WiFi networks, tried in order of signal strength (WiFiMulti).
// First entry: the phone hotspot.
#define WIFI_NETWORKS { \
    { "PHONE_HOTSPOT_SSID", "PHONE_HOTSPOT_PASSWORD" }, \
    { "HOME_SSID",          "HOME_PASSWORD" },          \
}

// Server: secure WebSocket URL (wss only). Port defaults to 443.
// The server certificate must chain to a root in src/server_ca.h.
#define SERVER_URL   "wss://SERVER.EXAMPLE/device"

// Per-device token, sent as "Authorization: Bearer <token>".
#define DEVICE_TOKEN "REPLACE_WITH_DEVICE_TOKEN"

// WiFi density scan (MSG_RF: AP count, RSSI median/max, APs per channel;
// never SSIDs or MACs). Seconds between passive scans.
#define RF_SCAN_INTERVAL_S           10   // WiFi down / joining
#define RF_SCAN_INTERVAL_CONNECTED_S 10   // connected; raise to 30 if the link suffers

// UART baud: set LINK_USE_FALLBACK_BAUD in firmware/common/link_protocol.h
// (shared by the Teensy and the ESP32, so both sides always match).
