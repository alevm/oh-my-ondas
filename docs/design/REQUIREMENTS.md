# Oh My Ondas - Requirements Document (v2.0)

## Layout Requirements

### Grid Structure
- [x] 3-column layout: Mixer/EQ, SEQ/PADS/CTRL, Synth/FX/Scenes/AI/Radio
- [x] PADS in middle column
- [x] App uses 100% of screen width
- [x] Enlarged header (96px) with transport, tempo, and mini map

### Column Sizing
- Left column: 240px (Mixer + EQ)
- Middle column: flexible (SEQ, PADS, CTRL)
- Right column: flexible (Synth, FX, Scenes, AI, Radio, REC)

### Background
- [x] Vin Mariani image as page background
- [ ] Brightness/filter adjustable via theme

### Mobile
- [x] Responsive layout for mobile (max-width: 768px)
- [x] Touch support for knobs/faders
- [x] Scrollable content on mobile

---

## Component Requirements

### Header / Transport (v2.0)
- [x] Large transport buttons (56x56px)
- [x] Tempo display with +/- buttons
- [x] TAP tempo button
- [x] Mini map display
- [x] GPS coordinates
- [x] Help button (keyboard shortcuts modal)
- [x] Settings button (admin modal)

### Mixer
- [x] 5 vertical faders (MIC, SMP, SYN, RAD, OUT)
- [x] Mute buttons for each channel
- [x] All channels fully visible
- [x] VU meters for each channel

### Equalizer
- [x] 3-band EQ (LO, MID, HI)
- [x] Vertical sliders
- [x] Channel selector BUTTONS (OUT, MIC, SMP, SYN, RAD) - no dropdown
- [x] Per-channel EQ in audio routing

### Sequencer
- [x] 8 tracks x 16 steps
- [x] Source selection per track via BUTTONS (SMP, SYN, RAD, MIC) - no dropdown
- [x] RND, CLR, EUC buttons
- [x] DUB mode (off/dub/overdub)
- [x] FILL button (hold to activate)
- [x] P-Lock editor (shift+click step)
- [x] Trigger condition BUTTONS (ALL, PROB, FILL, !FILL, NTH, NEIGH) - no dropdown
- [x] Tracks visible in UI

### Pads
- [x] 8 pads in a row
- [x] Trigger samples on press
- [x] Kit selection via BUTTONS - no dropdown
- [x] Visual feedback on trigger (flash animation)
- [x] Keyboard shortcuts displayed (1-8)
- [ ] Velocity sensitivity

### CTRL Knobs (v2.0)
- [x] 8 knobs in single row: FREQ, FILT, DLY, GRN, RES, DRV, PAN, VOL
- [x] Target selector BUTTONS - no dropdown
- [x] Drag to adjust
- [x] Touch support on mobile
- [x] Visual feedback on value (tooltip)

### Location
- [x] GPS coordinates display in header
- [x] Mini map image in header
- [x] Full map in Location panel
- [x] Reverse geocoding (for local radio search)

### AI Gen
- [x] Vibe buttons (Calm, Urban, Nature, Chaos)
- [x] Generate button
- [x] Generates patterns based on vibe
- [x] Sets tempo, FX, mixer levels based on vibe
- [x] Auto-tunes to local radio station

### Radio
- [x] Search input field
- [x] SCAN button
- [x] Play/Stop functionality
- [x] Local station search via GPS
- [x] Currently playing indicator
- [ ] Favorites

### Synth
- [x] ON/OFF toggle
- [x] Waveform selection BUTTONS (SIN, TRI, SAW, SQR) - no dropdown
- [x] ADSR envelope sliders
- [ ] Multiple oscillators

### Scenes (v2.0)
- [x] A/B/C/D buttons - FULL WIDTH, large (56px height)
- [x] Crossfader
- [x] SAVE/LOAD buttons
- [x] Scene recall working
- [x] Scene morphing with crossfader

### FX
- [x] Delay, Grain, Glitch, Crush sliders
- [x] Punch-in FX buttons (STT, REV, FLT, TPE)
- [x] FX preset BUTTONS - no dropdown

### Recordings
- [x] Recording counter
- [x] LIST button
- [x] AI GEN button
- [x] Most recent recording display

---

## UI/UX Requirements (v2.0)

### No Dropdowns Policy
- [x] ALL dropdowns replaced with button groups
- [x] Source selector: buttons
- [x] Kit selector: buttons
- [x] EQ channel: buttons
- [x] CTRL target: buttons
- [x] Trigger condition: buttons
- [x] FX preset: buttons
- [x] Waveform: buttons

### Text Sizes (v2.0)
- [x] Panel titles: 14px, bold
- [x] Labels: 12px minimum
- [x] Knob labels: 12px
- [x] Button text: appropriately sized for touch

### Tooltips (v2.0)
- [x] ALL interactive elements have title attributes
- [x] Hover tooltips provide description and help
- [x] Keyboard shortcuts shown in tooltips where applicable

### Transport Controls
- [x] Play/Stop/Record buttons - LARGE (56x56px)
- [x] Visual feedback on active state
- [x] Tempo display prominent
- [x] TAP button for BPM detection

### Keyboard Shortcuts
- [x] Keyboard shortcuts help modal ([?] button)
- [x] SPACE for play/pause
- [x] R for record
- [x] ESC for stop all
- [x] 1-8 for pad triggers
- [x] Arrow keys for track selection
- [x] D for dub mode toggle
- [x] F (hold) for fill mode
- [x] Q/W/E/T (hold) for punch FX

---

## Admin/Settings Requirements

- [x] Settings modal accessible via gear button
- [x] Sample kit selection with tooltips
- [x] Synth preset selection with tooltips
- [x] Theme selection with tooltips (Vin Mariani, Location Map, Dark)
- [x] Upload custom kit button
- [ ] Export/import settings
- [ ] Recording format selection

---

## Technical Requirements

### Browser Compatibility
- Chrome/Edge: Full support
- Firefox: Full support
- Safari/iOS: Works with tap-to-start

### Audio
- Web Audio API
- Click required to initialize (browser restriction)
- Low latency playback

### GPS
- Geolocation API
- HTTPS required for GPS
- Permission prompt on first use

### Storage
- localStorage for settings
- IndexedDB for recordings (future)

---

## Hardware Compatibility

### Target: Oh My Ondas Hardware Device
The web interface is designed as a prototype for a hardware device. Key design decisions:

- **Button Layout**: Keyboard shortcuts mirror hardware button positions
- **Hold-to-Activate**: Fill and Punch FX use hold pattern (momentary buttons)
- **LED Feedback**: Pad flash timing (150ms) designed for LED response
- **Tap Tempo**: Algorithm compatible with hardware button debounce
- **Transport**: Large buttons match hardware tactile controls
- **No Dropdowns**: All controls via buttons (hardware compatible)

### Future Hardware Features (Design Prepared)
- [ ] Mode switching (PLAY/SEQ/MIX/GEN views)
- [ ] Physical encoder for knobs
- [ ] Dedicated scene buttons with LEDs
- [ ] Hardware crossfader
- [ ] External MIDI sync

---

## Pending Features

1. Multiple oscillators for synth
2. Radio favorites
3. Offline mode / PWA support
4. MIDI controller support
5. Pad velocity sensitivity
6. Mode switching (PLAY/SEQ/MIX/GEN)
