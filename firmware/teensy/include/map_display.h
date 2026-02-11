/**
 * Oh My Ondas - Map Display
 * SSD1306 128×64 OLED — GPS trail / psychogeographic map
 *
 * NOTE: Adafruit_SSD1306.h is only included in map_display.cpp to avoid
 * Adafruit_GFX_Button class conflict with ILI9341_t3.
 */

#ifndef MAP_DISPLAY_H
#define MAP_DISPLAY_H

#include <Arduino.h>
#include "config.h"

#define MAP_TRAIL_SIZE 128

class Adafruit_SSD1306;  // Forward declaration

struct MapPoint {
    float lat;
    float lon;
};

class MapDisplay {
public:
    MapDisplay();
    ~MapDisplay();

    void begin();
    void update(float lat, float lon, bool gpsValid);

    void zoomIn();
    void zoomOut();
    void setZoom(float metersPerPixel);
    void clearTrail();
    void showStatus(const char* line1, const char* line2 = nullptr);

private:
    Adafruit_SSD1306* oled;
    bool ready;

    MapPoint trail[MAP_TRAIL_SIZE];
    int trailHead;
    int trailCount;

    float curLat, curLon;
    bool hasPosition;

    float zoom;

    bool statusMode;
    char statusLine1[32];
    char statusLine2[32];

    unsigned long lastUpdate;

    void addPoint(float lat, float lon);
    void drawMap();
    void drawStatusScreen();
    int  lonToX(float lon);
    int  latToY(float lat);
    float haversineMeters(float lat1, float lon1, float lat2, float lon2);
};

#endif // MAP_DISPLAY_H
