/**
 * Oh My Ondas - ESP32 Module
 * WiFi, GPS, and AI communication
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <TinyGPSPlus.h>
#include <ArduinoJson.h>
#include "config.h"

// GPS Serial pins
#define GPS_RX 16
#define GPS_TX 17

TinyGPSPlus gps;
HardwareSerial gpsSerial(1);

struct GPSData {
    double lat, lon, alt, speed;
    int sats;
    bool valid;
    unsigned long lastFixTime;
} gpsData;

void setup() {
    Serial.begin(115200);
    gpsSerial.begin(9600, SERIAL_8N1, GPS_RX, GPS_TX);

    WiFi.begin(WIFI_SSID, WIFI_PASS);
    unsigned long wifiStart = millis();
    while (WiFi.status() != WL_CONNECTED) {
        if (millis() - wifiStart > WIFI_CONNECT_TIMEOUT_MS) {
            Serial.println("WiFi connect timeout — continuing without network");
            break;
        }
        delay(100);
        yield();
    }
    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("WiFi connected");
    }
}

void loop() {
    // Read GPS
    while (gpsSerial.available()) {
        if (gps.encode(gpsSerial.read())) {
            if (gps.location.isValid()) {
                gpsData.lat = gps.location.lat();
                gpsData.lon = gps.location.lng();
                gpsData.alt = gps.altitude.meters();
                gpsData.speed = gps.speed.kmph();
                gpsData.sats = gps.satellites.value();
                gpsData.valid = true;
                gpsData.lastFixTime = millis();
            }
        }
    }

    // Invalidate stale GPS fix
    if (gpsData.valid && (millis() - gpsData.lastFixTime > GPS_VALIDITY_TIMEOUT_MS)) {
        gpsData.valid = false;
    }

    // Send GPS every second
    static unsigned long lastSend = 0;
    if (millis() - lastSend >= 1000 && gpsData.valid) {
        StaticJsonDocument<256> doc;
        doc["type"] = "gps";
        doc["lat"] = gpsData.lat;
        doc["lon"] = gpsData.lon;
        doc["alt"] = gpsData.alt;
        doc["speed"] = gpsData.speed;
        doc["sats"] = gpsData.sats;
        String output;
        serializeJson(doc, output);
        Serial.println(output);
        lastSend = millis();
    }
}
