/**
 * Oh My Ondas - ESP32 Module
 * WiFi, GPS, and AI communication
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <TinyGPSPlus.h>
#include <ArduinoJson.h>

// Configuration - Update these!
const char* WIFI_SSID = "your_wifi";
const char* WIFI_PASS = "your_pass";
const char* CLAUDE_API_KEY = "your_key";

// GPS Serial pins
#define GPS_RX 16
#define GPS_TX 17

TinyGPSPlus gps;
HardwareSerial gpsSerial(1);

struct GPSData {
    double lat, lon, alt, speed;
    int sats;
    bool valid;
} gpsData;

void setup() {
    Serial.begin(115200);
    gpsSerial.begin(9600, SERIAL_8N1, GPS_RX, GPS_TX);
    
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
    }
    Serial.println("WiFi connected");
}

void loop() {
    // Read GPS
    while (gpsSerial.available()) {
        if (gps.encode(gpsSerial.read())) {
            if (gps.location.isValid()) {
                gpsData.lat = gps.location.lat();
                gpsData.lon = gps.location.lng();
                gpsData.valid = true;
            }
        }
    }
    
    // Send GPS every second
    static unsigned long lastSend = 0;
    if (millis() - lastSend >= 1000 && gpsData.valid) {
        StaticJsonDocument<128> doc;
        doc["type"] = "gps";
        doc["lat"] = gpsData.lat;
        doc["lon"] = gpsData.lon;
        String output;
        serializeJson(doc, output);
        Serial.println(output);
        lastSend = millis();
    }
}
