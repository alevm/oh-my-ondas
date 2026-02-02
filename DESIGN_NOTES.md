# Oh My Ondas — Design Notes (Feb 2026)

## Current State
Device mockup (`web/index.html`) redesigned with:
- Dark petrol green enclosure on grey page background
- **Ergonomic side grips** — contoured left/right grips with tactile ridges for handheld use
- 3-column top layout: 5 encoders (left) | 5" display (center) | 4 mode buttons (right)
- Mode buttons: PICTURE, SOUNDSCAPE, INTERACT, JOURNEY
- **Transport on top edge** — play/stop/rec as ridge-bump buttons on the top edge (index-finger accessible)
- Bottom section: 8 pads (4x2), **5-way joystick** (NAV), crossfader
- Sensor diagrams (piezo, mic, wifi, radio) visible around device
- Psychogeographic artwork (Chombart de Lauwe) as subtle background in bottom half
- DIY build assessment panel below device (~$187 BOM, high feasibility)
- All controls wired via postMessage to iframe app (incl. joystick → panel nav / map control)

## Implemented Design Changes

### 1. Handheld Ergonomics ✓
Contoured side grips added to left and right edges of the enclosure. Rounded profile with tactile ridge texture. Device is designed to be held with both hands, thumbs reaching encoders (left) and mode buttons (right).

### 2. Transport Buttons on Top Edge ✓
Play/stop/rec moved from bottom-left to the top edge of the device. Styled as ridge/bump buttons (rounded top, flat bottom) that protrude slightly above the enclosure — natural for index fingers. Front face freed up for pads and joystick.

### 3. Display Navigation Control ✓
5-way joystick module added to the bottom section (right of pads). Provides up/down/left/right + center-select. Wired via postMessage:
- **Default mode**: left/right = switch panel tabs, up/down = select sequencer track, select = trigger pad
- **Journey mode**: up/down = map zoom, left/right = pan map, select = add waypoint / start journey

### 4. Journey Mode ✓
Full Journey mode implemented in `web/js/journey.js`:
- Start/waypoint/end controls in a dedicated journey panel (JRN tab)
- GPS breadcrumb tracking every 5 seconds (3m movement threshold)
- Waypoints named A, B, C... with reverse geocoding and audio snapshots (reuses Landmark capture)
- Stats display: distance, duration, waypoint count
- Auto-starts when JOURNEY mode is selected on the mockup

### 5. Map Integration ✓
Leaflet.js (OSM tiles) map inside the journey panel:
- Live route polyline drawn from GPS breadcrumbs
- Circle markers for each waypoint (green = start, teal = intermediate, red = end)
- Auto-fit bounds as route grows
- Encoder "pan" remapped to zoom control in journey mode
- Joystick controls map zoom and pan

## DIY Build Notes
- **Total BOM: ~$187** (Raspberry Pi 4, 5" HDMI touch, encoders, crossfader, MPR121 pads, 5-way joystick, DAC, mic, piezo, FM module, 3D printed case)
- No custom PCB needed — protoboard + through-hole soldering
- Pi GPIO handles all I/O (I2C for MPR121/TEA5767, GPIO for encoders/buttons/joystick, I2S for DAC)
- UI runs in Chromium kiosk mode on Raspberry Pi OS
- Enclosure: 200x140x45mm, 3D printed PLA or CNC milled

## File Reference
- `web/index.html` — main device mockup (CSS + HTML + JS inline)
- `web/css/style.css` — shared site styles (header, footer, nav, journey panel CSS)
- `web/app.html` — the embedded app that runs inside the device display
- `web/js/journey.js` — Journey mode: GPS tracking, Leaflet map, waypoints
- `web/js/gps.js` — GPS tracker with distance calculation helpers
- `web/js/landmark.js` — Sonic snapshot capture (used by Journey waypoints)
- `web/js/app.js` — Main app controller (mode handling, postMessage bridge, joystick handler)
