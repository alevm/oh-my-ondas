/**
 * Oh My Ondas - ESP32 Configuration Template
 *
 * Copy this file to config.h and fill in your values.
 * config.h is gitignored — never commit real credentials.
 */

#ifndef OHMYONDAS_CONFIG_H
#define OHMYONDAS_CONFIG_H

// WiFi credentials
#define WIFI_SSID "your_wifi"
#define WIFI_PASS "your_pass"

// API key — leave empty if not using cloud AI features
#define CLAUDE_API_KEY ""

// WiFi connection timeout (milliseconds)
#define WIFI_CONNECT_TIMEOUT_MS 15000

// GPS validity timeout (milliseconds) — mark fix stale after this
#define GPS_VALIDITY_TIMEOUT_MS 10000

#endif // OHMYONDAS_CONFIG_H
