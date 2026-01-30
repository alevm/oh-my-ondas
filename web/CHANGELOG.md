# Oh My Ondas - Changelog

## v2.0.0 (2025-12-09)

### Major UI/UX Overhaul
- **Bigger Text**: All text sizes increased throughout the UI
- **Larger Buttons**: All buttons easier to click/tap
- **No Dropdowns**: ALL dropdowns replaced with button groups
  - Source selector (SMP, SYN, RAD, MIC)
  - Kit selector
  - EQ channel selector
  - CTRL target selector
  - Trigger condition selector (ALL, PROB, FILL, !FILL, NTH, NEIGH)
  - FX preset selector
  - Waveform selector (SIN, TRI, SAW, SQR)
- **Doubled Header Size**: 96px height with larger transport buttons (56x56)
- **Mini Map in Header**: GPS map visible at all times
- **8 CTRL Knobs**: Added PAN and VOL knobs (FREQ, FILT, DLY, GRN, RES, DRV, PAN, VOL)
- **Full-Width Scene Buttons**: A/B/C/D buttons 56px tall, filling panel width
- **Comprehensive Tooltips**: All interactive elements have hover descriptions
- **Panel Reorganization**: FX and Scenes panels swapped positions
- **Smaller Radio Panel**: More compact design

### Layout Changes
- Left column: 240px (Mixer + EQ)
- Header: 96px with transport, tempo, mini map, GPS
- Scene buttons: Full width, 56px height
- CTRL knobs: 8 in single row using CSS grid

---

## v1.7.x (2025-12-09)

### v1.7.4
- Scene buttons full width with flex: 1
- Increased scene button height to 56px

### v1.7.3
- Added tooltips to REC panel and settings modal elements

### v1.7.2
- Increased text sizes (knob labels 12px, recording text 12px)

### v1.7.1
- Increased all text sizes by ~2px

### v1.7.0
- Doubled header height (60px → 96px)
- Transport buttons enlarged (44x40 → 56x56)
- Left column widened to 240px

---

## v1.6.0 (2025-12-09)

### Header Enhancements
- Added mini map to top bar
- Increased header height to 60px
- Changed CTRL to 8 knobs (added PAN and VOL)

---

## v1.5.0 (2025-12-09)

### UI/UX Improvements
- Increased text sizes throughout
- Made buttons larger
- Replaced all dropdowns with button groups
- Swapped FX and Scenes panel positions
- Made Radio panel smaller (1 row)
- Enabled REC panel

---

## v1.3.0 (2025-12-09)

### 3-Column Layout Redesign
- **New 3-column layout** with pastel color-coded sections:
  - **Left (Pastel Blue #d6eaf8)**: MIXER + EQ
  - **Middle (Pastel Gray #e8e8e8)**: SEQ + PADS + CTRL + FX
  - **Right (Pastel Violet #e8daef)**: SYNTH + SCENES + AI GEN + RADIO
- **CTRL panel**: 6 knobs (FREQ, FILT, DLY, GRN, RES, DRV) with target selector buttons
- **Analog-style RADIO**: Tuning knob with FM frequency display, SCAN button
- **AI GEN panel**: Restored with vibe buttons (C/U/N/X) and Generate
- **SCENES**: A/B/C/D with crossfader restored
- **All dropdowns converted to buttons**: SEQ source, Kit, CTRL target, EQ channel
- Improved readability with larger panel titles (12px)
- Removed REC panel from main layout (available in Admin)

---

## v1.2.1 (2025-12-09)

### Hardware Layout Redesign
- **4-column layout** matching hardware target design:
  - Column 1 (Screen): Transport + Sequencer + Pads with dark LED styling
  - Column 2: Mixer + EQ stacked
  - Column 3: CTRL knobs, AI Gen, Radio, Location
  - Column 4: Synth, Scenes, FX, REC
- **Dark LED screen** for sequencer/pads area (green on black)
- **Secondary transport controls** in screen column
- **Dual TAP tempo buttons** (header + screen)
- Sequencer tracks now have LED-style green/yellow coloring

---

## v1.2.0 (2025-12-09)

### UX Improvements (Phase 1 - Hardware-Ready)
- **Pad flash animation**: Pads now visually flash when triggered (manual or sequencer)
- **Bigger transport controls**: Play/Stop/Record buttons larger and more prominent with better visual feedback
- **Tempo TAP button**: Tap to detect BPM (averages last 4 taps, auto-reset after 2s)
- **Keyboard shortcuts help**: Press [?] or click help button to view all shortcuts
- **Full keyboard control**:
  - SPACE: Play/Pause
  - R: Record
  - ESC: Stop all
  - 1-8: Trigger pads
  - Arrow Up/Down: Select track
  - D: Toggle dub mode
  - F (hold): Fill mode
  - Q/W/E/T (hold): Punch FX (Stutter/Reverse/Filter/Tape)
  - G: Generate AI pattern
  - ?: Show help

### Hardware Compatibility Notes
These UX changes are designed to map to physical controls on the target hardware device:
- TAP button maps to dedicated tempo tap button
- Keyboard shortcuts mirror hardware button layout
- Pad flash timing designed for LED feedback latency
- Hold-to-activate pattern matches momentary button behavior

---

## v1.1.0 (2025-12-09)

### Major Features
- Full-width layout (100% of screen)
- Resizable columns with drag handles (saved to localStorage)
- VU meters for all mixer channels
- Synth ADSR envelope controls (Attack, Decay, Sustain, Release)
- Scene morphing with crossfader
- FX presets (save/load)
- Recording management (delete, rename via double-click)
- Knob value tooltip (shows value while dragging)

---

## v1.0.4 (2025-12-09)

### EQ & Audio
- Added per-channel 3-band EQ (LO/MID/HI)
- Channel selector: OUT, MIC, SMP, SYN, RAD
- EQ affects audio routing chain

### Scenes
- Fixed scenes panel (buttons now work)

### Radio
- AI Generate now auto-tunes to local radio based on GPS
- Uses RadioBrowser API geo search
- Fallback to country search via reverse geocoding

---

## v1.0.3 (2025-12-09)

### Mobile Touch & Scroll Fixes
- Fixed mobile scrolling - body now scrollable on mobile
- Added touch-action: none to knobs for proper touch interaction
- Added touch-action to faders and EQ sliders
- CTRL knobs now respond to touch gestures on mobile

---

## v1.0.2 (2025-12-09)

### Mobile Fixes
- Removed sticky pads - all content scrolls naturally
- Fixed overflow issues causing panel overlap
- Changed to flexbox layout on mobile for proper stacking
- Increased gap between panels

---

## v1.0.1 (2025-12-09)

### Mobile Support
- Added responsive CSS for mobile devices (max-width: 768px)
- Single column layout on mobile
- Pads sticky at bottom (4x2 grid)
- Horizontal mixer faders on mobile
- Larger touch targets for buttons
- Scrollable content area

---

## v1.0.0 (2025-12-09)

### Layout
- Grid layout with 4 columns: Mixer (200px), SEQ/EQ, CTRL/Location/AI/Radio, Synth/Scenes/FX/REC
- PADS span full bottom row (8 pads in a row)
- App width 75% of screen, centered
- Vin Mariani background image

### Components
- MIXER: 5 channels (MIC, SMP, SYN, RAD, OUT) with faders and mute buttons
- SEQ: 8-track sequencer with RND, CLR, EUC, DUB, FILL controls
- EQ: 3-band equalizer (LO, MID, HI)
- CTRL: 4 knobs (FREQ, FILT, DLY, GRN)
- LOCATION: Map display with GPS coordinates
- AI GEN: Vibe buttons (C, U, N, X) + Generate
- RADIO: Search with station list
- SYNTH: Matrix routing, waveform selection
- SCENES: A/B/C/D with crossfader
- FX: Delay, Grain, Glitch, Crush + punch-in effects (STT, REV, FLT, TPE)
- REC: Recording counter with list

### Admin/Settings
- Sample kit selection
- Synth presets
- Theme selection (Vin Mariani, Location Map, Dark)

### Fixes
- Added missing stationList element for radio
- Added missing recList element for recordings
- Added missing synthPresets element for admin modal
- Fixed mixer overflow issues
- Fixed sequencer track visibility

---

## Pre-1.0 Development (v0.7.x)

Multiple iterations on layout and sizing adjustments during development session.
