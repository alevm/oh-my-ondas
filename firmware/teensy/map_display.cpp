/**
 * Oh My Ondas - Map Display Implementation
 * SSD1306 128×64 OLED — GPS trail renderer
 */

#include <Wire.h>
#include <Adafruit_SSD1306.h>
#include "map_display.h"

MapDisplay::MapDisplay()
    : oled(nullptr)
    , ready(false)
    , trailHead(0), trailCount(0)
    , curLat(0), curLon(0), hasPosition(false)
    , zoom(5.0f)
    , statusMode(true)
    , lastUpdate(0)
{
    statusLine1[0] = '\0';
    statusLine2[0] = '\0';
}

MapDisplay::~MapDisplay() {
    delete oled;
}

void MapDisplay::begin() {
    oled = new Adafruit_SSD1306(OLED_WIDTH, OLED_HEIGHT, &Wire, OLED_RESET);
    if (oled->begin(SSD1306_SWITCHCAPVCC, ADDR_SSD1306)) {
        ready = true;
        oled->clearDisplay();
        oled->setTextSize(1);
        oled->setTextColor(SSD1306_WHITE);
        oled->setCursor(16, 20);
        oled->print("OH MY ONDAS");
        oled->setCursor(32, 36);
        oled->print("MAP OLED");
        oled->display();
        DEBUG_PRINTLN("MapDisplay: Initialized (128x64)");
    } else {
        DEBUG_PRINTLN("MapDisplay: SSD1306 NOT FOUND");
    }
}

void MapDisplay::update(float lat, float lon, bool gpsValid) {
    if (!ready || !oled) return;

    unsigned long now = millis();
    if (now - lastUpdate < 200) return;
    lastUpdate = now;

    if (gpsValid) {
        statusMode = false;
        if (!hasPosition || haversineMeters(curLat, curLon, lat, lon) > 1.0f) {
            addPoint(lat, lon);
        }
        curLat = lat;
        curLon = lon;
        hasPosition = true;
        drawMap();
    } else if (statusMode || !hasPosition) {
        showStatus("WAITING FOR", "GPS FIX...");
        drawStatusScreen();
    } else {
        drawMap();
        oled->setCursor(0, 0);
        oled->setTextColor(SSD1306_WHITE, SSD1306_BLACK);
        oled->print("NO FIX");
        oled->display();
    }
}

void MapDisplay::zoomIn() {
    zoom = max(1.0f, zoom * 0.7f);
    DEBUG_PRINTF("MapDisplay: Zoom %.1f m/px\n", zoom);
}

void MapDisplay::zoomOut() {
    zoom = min(50.0f, zoom * 1.4f);
    DEBUG_PRINTF("MapDisplay: Zoom %.1f m/px\n", zoom);
}

void MapDisplay::setZoom(float metersPerPixel) {
    zoom = constrain(metersPerPixel, 1.0f, 50.0f);
}

void MapDisplay::clearTrail() {
    trailHead = 0;
    trailCount = 0;
}

void MapDisplay::showStatus(const char* line1, const char* line2) {
    statusMode = true;
    strncpy(statusLine1, line1, 31); statusLine1[31] = '\0';
    if (line2) {
        strncpy(statusLine2, line2, 31); statusLine2[31] = '\0';
    } else {
        statusLine2[0] = '\0';
    }
}

// ============================================
// INTERNAL
// ============================================

void MapDisplay::addPoint(float lat, float lon) {
    trail[trailHead].lat = lat;
    trail[trailHead].lon = lon;
    trailHead = (trailHead + 1) % MAP_TRAIL_SIZE;
    if (trailCount < MAP_TRAIL_SIZE) trailCount++;
}

void MapDisplay::drawMap() {
    oled->clearDisplay();

    int cx = OLED_WIDTH / 2;
    int cy = OLED_HEIGHT / 2;

    for (int i = 0; i < trailCount; i++) {
        int idx = (trailHead - trailCount + i + MAP_TRAIL_SIZE) % MAP_TRAIL_SIZE;
        int px = cx + lonToX(trail[idx].lon);
        int py = cy + latToY(trail[idx].lat);

        if (px >= 0 && px < OLED_WIDTH && py >= 0 && py < OLED_HEIGHT) {
            float age = (float)i / (float)trailCount;
            if (age > 0.3f || (i % 2 == 0)) {
                oled->drawPixel(px, py, SSD1306_WHITE);
            }
        }
    }

    oled->drawLine(cx - 3, cy, cx + 3, cy, SSD1306_WHITE);
    oled->drawLine(cx, cy - 3, cx, cy + 3, SSD1306_WHITE);

    oled->setCursor(0, 56);
    oled->setTextSize(1);
    oled->setTextColor(SSD1306_WHITE);
    oled->printf("%.0fm", zoom * OLED_WIDTH);

    oled->setCursor(0, 0);
    oled->printf("%.4f", curLat);
    oled->setCursor(72, 0);
    oled->printf("%.4f", curLon);

    oled->setCursor(OLED_WIDTH - 8, 10);
    oled->print("N");

    oled->display();
}

void MapDisplay::drawStatusScreen() {
    if (!ready || !oled) return;
    oled->clearDisplay();

    oled->setTextSize(1);
    oled->setTextColor(SSD1306_WHITE);
    oled->setCursor(16, 20);
    oled->print(statusLine1);
    if (statusLine2[0]) {
        oled->setCursor(16, 36);
        oled->print(statusLine2);
    }

    int dots = (millis() / 500) % 4;
    oled->setCursor(16, 50);
    for (int i = 0; i < dots; i++) oled->print(".");

    oled->display();
}

int MapDisplay::lonToX(float lon) {
    float metersPerDeg = 111320.0f * cos(curLat * PI / 180.0f);
    float deltaMeters = (lon - curLon) * metersPerDeg;
    return (int)(deltaMeters / zoom);
}

int MapDisplay::latToY(float lat) {
    float deltaMeters = (curLat - lat) * 111320.0f;
    return (int)(deltaMeters / zoom);
}

float MapDisplay::haversineMeters(float lat1, float lon1, float lat2, float lon2) {
    float dLat = (lat2 - lat1) * PI / 180.0f;
    float dLon = (lon2 - lon1) * PI / 180.0f;
    float a = sin(dLat / 2) * sin(dLat / 2) +
              cos(lat1 * PI / 180.0f) * cos(lat2 * PI / 180.0f) *
              sin(dLon / 2) * sin(dLon / 2);
    float c = 2.0f * atan2(sqrt(a), sqrt(1.0f - a));
    return 6371000.0f * c;
}
