# Oh My Ondas - Design Review & Roadmap

## Current State Assessment (v2.0)

Oh My Ondas is a web-based music creation tool with:
- 3-column layout (Mixer/EQ, SEQ/PADS/CTRL, Synth/FX/Scenes/AI/Radio/REC)
- 8-track sequencer with P-locks and conditional triggers
- Scene system with crossfader morphing
- AI-assisted pattern generation with GPS awareness
- Radio streaming integration
- Punch-in FX
- Comprehensive tooltips for all controls

**Unique Strengths:**
- GPS/Location-aware music generation
- Radio integration (local station discovery)
- AI vibe-based composition
- Web-based = accessible anywhere
- No dropdowns = hardware-ready UI

---

## v2.0 Achievements

### Usability Fixes Completed
1. ~~Too many panels visible at once~~ → 3-column layout with clear organization
2. ~~No clear workflow~~ → Tooltips explain every control
3. ~~Transport controls lost in header~~ → Large 56x56 buttons, 96px header
4. ~~Knobs too small~~ → 8 knobs in clear row
5. ~~No keyboard shortcuts visible~~ → Help modal + tooltips show shortcuts
6. ~~Dropdowns not hardware-friendly~~ → All replaced with button groups

### v2.0 UI/UX Features
- Bigger text sizes throughout
- Larger buttons for easier touch/click
- All dropdowns → button groups
- Doubled header with mini map
- 8 CTRL knobs (FREQ, FILT, DLY, GRN, RES, DRV, PAN, VOL)
- Full-width scene buttons (56px)
- Comprehensive hover tooltips

---

## Hardware Inspiration Analysis

### Elektron Octatrack

**What makes it special:**
- Parameter locks on EVERY step (not just a few params)
- Conditional trigs (1:2, 2:4, A:B, PRE, etc.)
- Pickup machines (live looping with tempo sync)
- Slices (auto-chop samples into 16/32/64 pieces)
- Scenes + Crossfader = performance machine
- Parts (4 variations per pattern)
- Arranger mode for full songs

**Adopt for Oh My Ondas:**
- [x] **Conditional triggers** - ALL, PROB, FILL, !FILL, NTH, NEIGH
- [ ] **Slice mode** - auto-slice loaded samples
- [ ] **Pickup machine** - loop pedal style recording
- [ ] **Parts** - 4 variations per pattern (A/B/C/D)
- [x] **Better P-locks** - lock ANY parameter per step

### Teenage Engineering OP-Z

**What makes it special:**
- Extreme minimalism - one encoder does many things
- Step components - micro-timing, direction, jumps
- Punch-in effects with one-finger hold
- Tape track for arrangement
- Performance mode (mutes as buttons)
- Modular connections (lights, video)

**Adopt for Oh My Ondas:**
- [ ] **Step components** - per-step timing offset, swing
- [ ] **Tape track** - visual arrangement timeline
- [ ] **Performance mode** - big mute buttons, instant access
- [ ] **Minimal mode** - hide everything but essentials
- [ ] **Motion sequencing** - record knob movements

### Bastl Microgranny

**What makes it special:**
- Granular synthesis focused
- Lo-fi aesthetic is the feature
- Immediate - load sample, play, mangle
- Physical randomization
- Brutal crusher/filter

**Adopt for Oh My Ondas:**
- [ ] **Granular focus** - make grain engine primary
- [ ] **Randomize everything** - one button chaos
- [ ] **Lo-fi mode** - force 8-bit, mono, low sample rate
- [ ] **Start/End points** - visual waveform with draggable markers
- [ ] **Hold mode** - sustain sample while held

### Roland SP-404

**What makes it special:**
- Pads are EVERYTHING - big, responsive, immediate
- Effects are immediate - hold pad = effect active
- Pattern sequencer is secondary
- Resampling workflow
- DJ-friendly (vinyl sim, isolator)

**Adopt for Oh My Ondas:**
- [x] **Bigger pads** - prominently displayed
- [ ] **Resample button** - capture output as new sample
- [ ] **Pad FX** - each pad can have assigned effect
- [ ] **Bank system** - A/B/C/D banks x 8 pads = 32 sounds
- [ ] **DJ isolator** - quick kill low/mid/hi

---

## Proposed Design Modes

### Mode 1: PLAY (Default - SP-404 inspired)
```
┌─────────────────────────────────────────────┐
│ [▶] [■] [●]   120 BPM   [TAP]   [FX] [SET] │
├─────────────────────────────────────────────┤
│                                             │
│   ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐   │
│   │ 1 │ │ 2 │ │ 3 │ │ 4 │ │ 5 │ │ 6 │ │ 7 │ │ 8 │   │
│   └───┘ └───┘ └───┘ └───┘ └───┘ └───┘ └───┘ └───┘   │
│   ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐   │
│   │ 9 │ │10 │ │11 │ │12 │ │13 │ │14 │ │15 │ │16 │   │
│   └───┘ └───┘ └───┘ └───┘ └───┘ └───┘ └───┘ └───┘   │
│                                             │
│  [DLY] [REV] [FLT] [GRN] [GLI] [CRU] [ISO] [VIN]   │
│                                             │
│      A ═══════════════════════ B    [REC]  │
└─────────────────────────────────────────────┘
```
- 16 big pads (4x4 or 2x8)
- Hold FX buttons for temporary effect
- Crossfader between scenes
- Minimal controls visible

### Mode 2: SEQ (Octatrack inspired)
```
┌─────────────────────────────────────────────┐
│ T1 [●○○○│●○○○│●○○○│●○○○] SMP ▶ FLT ▶ DLY  │
│ T2 [○○●○│○○●○│○○●○│○○●○] SYN              │
│ T3 [○○○●│○○○●│○○○●│○○○●] RAD              │
│ T4 [●●○○│●●○○│●●○○│●●○○] MIC              │
│ T5 [○●○●│○●○●│○●○●│○●○●] SMP              │
│ T6 [○○○○│○○○○│○○○○│●○○○] SYN              │
│ T7 [○○○○│○○○○│○○○○│○○○○] -               │
│ T8 [○○○○│○○○○│○○○○│○○○○] -               │
├─────────────────────────────────────────────┤
│ STEP 5  │ NOTE: C3  VEL: 100  LEN: 1/16    │
│ P-LOCK  │ FILT: 2000  DLY: 30%  PAN: L15   │
│ TRIG    │ [1:1] [1:2] [2:2] [RND] [FIL]    │
└─────────────────────────────────────────────┘
```
- Full sequencer view
- P-lock parameter display
- Conditional trig selection
- Track routing visible

### Mode 3: MIX (Live performance)
```
┌─────────────────────────────────────────────┐
│  MIC    SMP    SYN    RAD    OUT           │
│  ┃┃     ┃┃     ┃┃     ┃┃     ┃┃            │
│  ██     ██     ██     ██     ██  ← VU      │
│  ██     ██     ▓▓     ▓▓     ██            │
│  ▓▓     ▓▓     ░░     ░░     ▓▓            │
│  ░░     ░░     ░░     ░░     ░░            │
│  [M]    [M]    [M]    [M]                  │
├─────────────────────────────────────────────┤
│  LO ════════════════════════════ HI        │
│  EQ: [▼▼▼] [───] [▲▲▲]                     │
├─────────────────────────────────────────────┤
│  A ═══════════○═══════════════ B   SCENE   │
└─────────────────────────────────────────────┘
```
- Big faders
- Big VU meters
- DJ-style EQ
- Scene crossfader prominent

### Mode 4: GEN (AI/Location - unique to Oh My Ondas)
```
┌─────────────────────────────────────────────┐
│  📍 Milan, Italy    🕐 23:45    🌡 12°C    │
├─────────────────────────────────────────────┤
│                                             │
│     [  CALM  ]  [  URBAN  ]                │
│     [ NATURE ]  [  CHAOS  ]                │
│                                             │
│  ────────────●────────────  DENSITY        │
│  ────────────────●────────  COMPLEXITY     │
│                                             │
│         [ ★ GENERATE ★ ]                   │
│                                             │
├─────────────────────────────────────────────┤
│  📻 Radio Milano 101.5 FM  [▶]             │
│     Jazz, Electronic, Ambient              │
└─────────────────────────────────────────────┘
```
- Location prominent
- Big vibe buttons
- Generation front and center
- Radio integration visible

---

## Implementation Priority

### Phase 1: Core UX (v1.2) ✓ COMPLETED
1. ✓ Make pads flash on trigger
2. ✓ Add keyboard shortcuts display ([?] button)
3. ✓ Add tempo tap button
4. ✓ Transport controls bigger/more visible
5. ✓ Full keyboard shortcuts (1-8, SPACE, R, D, F, Q/W/E/T, G, arrows)

### Phase 2: UI/UX Overhaul (v2.0) ✓ COMPLETED
1. ✓ Bigger text throughout
2. ✓ All dropdowns → button groups
3. ✓ Larger header with mini map
4. ✓ 8 CTRL knobs
5. ✓ Full-width scene buttons
6. ✓ Comprehensive tooltips
7. ✓ Conditional triggers (ALL, PROB, FILL, !FILL, NTH, NEIGH)

### Phase 3: Sequencer Power (v2.1)
1. Variable pattern length (1-64 steps)
2. Copy/paste patterns
3. Undo/redo for pattern edits
4. More conditional trigger types

### Phase 4: Performance (v2.2)
1. Mode switching (PLAY/SEQ/MIX/GEN views)
2. Performance mode with big mute buttons
3. Hold-for-effect on pads
4. Resample to new pad
5. Motion recording (record knob movements)

### Phase 5: Polish (v3.0)
1. Dark mode theme
2. Slice mode for samples
3. Waveform display with markers
4. PWA offline support

---

## Questions for Future Development

1. Which mode should be default? (PLAY, SEQ, MIX, or GEN)
2. Priority: More sequencer features or better live performance?
3. Should GPS/AI be a core differentiator or optional feature?
4. Target: Musicians or general creative exploration?
