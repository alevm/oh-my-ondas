# Oh My Ondas — Design Notes (Feb 2026)

## Current State
Device mockup (`web/index.html`) redesigned with:
- Dark petrol green enclosure on grey page background
- 3-column top layout: 5 encoders (left) | 5" display (center) | 4 mode buttons (right)
- Mode buttons: PICTURE, SOUNDSCAPE, INTERACT, JOURNEY (new)
- Bottom section: transport (play/stop/rec), 8 smaller pads (4x2), crossfader
- Sensor diagrams (piezo, mic, wifi, radio) visible around device
- Psychogeographic artwork (Chombart de Lauwe) as subtle background in bottom half
- DIY build assessment panel below device (~$185 BOM, high feasibility)
- All controls wired via postMessage to iframe app

## Pending Design Changes

### 1. Handheld Ergonomics
The device should be **held with both hands on the sides** like a game controller or handheld console. The current layout (encoders left, modes right) already supports thumb-reach, but the physical enclosure shape should reflect this — consider rounded/contoured side grips in the mockup.

### 2. Transport Buttons on Top Edge
Move play/stop/rec to the **top edge of the device** (like a camera shutter button). This frees the front face and is natural for index fingers when holding the device with both hands. Consider a ridge/bump design for tactile feel without looking.

### 3. Display Navigation Control
A 5" touchscreen is small for finger navigation. Need an **additional input method** for UI interaction. Options to consider:
- **D-pad + center button** (like a game controller) — placed near the display
- **Mini trackball** (like old BlackBerry) — precise navigation
- **Rotary encoder with push-click** — scroll through menus, click to select (could repurpose one of the existing encoders)
- **Joystick nub** (like ThinkPad TrackPoint) — compact, precise
- Best candidate: **small 5-way joystick module** (~$2, fits the form factor, thumb-accessible)

### 4. Journey Mode (Feature)
New mode for GPS-tracked walking sessions:
- Start from point A, record at waypoints B, C, D
- Option to return to A or end the walk
- Map integration in the display showing the route
- Each waypoint triggers audio capture / sound snapshot
- Ties into the psychogeographic / dérive concept of the project

### 5. Map Integration
- GPS strip was removed from the device body
- Map should be **part of the display content** (inside the iframe app)
- In JOURNEY mode, the display shows a live map with route tracking
- Waypoints marked on the map with associated audio recordings

## DIY Build Notes
- **Total BOM: ~$185** (Raspberry Pi 4, 5" HDMI touch, encoders, crossfader, MPR121 pads, DAC, mic, piezo, FM module, 3D printed case)
- No custom PCB needed — protoboard + through-hole soldering
- Pi GPIO handles all I/O (I2C for MPR121/TEA5767, GPIO for encoders/buttons, I2S for DAC)
- UI runs in Chromium kiosk mode on Raspberry Pi OS
- Enclosure: 200x140x45mm, 3D printed PLA or CNC milled

## File Reference
- `web/index.html` — main device mockup (CSS + HTML + JS inline)
- `web/css/style.css` — shared site styles (header, footer, nav)
- `web/app.html` — the embedded app that runs inside the device display
