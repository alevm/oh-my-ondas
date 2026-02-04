# Oh My Ondas - Requirements Specification

**Version:** 2.5.2
**Last Updated:** 2026-02-03
**License:** GPL-3.0

---

## 1. Product Vision

Oh My Ondas is a GPS-aware instrument for **sonic transurbance**. It captures the full wave spectrum of a location and transforms it into music. The composition is *of* the place, not just *at* the place.

**Core Principle:** The instrument must produce compositions that are structurally shaped by the environment, not merely decorated with environmental samples.

### 1.1 Intended Workflow

```
1. ARRIVE at location
   ↓
2. LISTEN - mic analyzes soundscape (rhythmic? tonal? ambient? chaotic?)
   ↓
3. CAPTURE - record sounds, tune radio, grab snippets
   ↓
4. ANALYZE - system identifies sonic character of captures
   ↓
5. ASSIGN - sounds mapped to roles (rhythm, texture, melody, modulation)
   ↓
6. GENERATE - AI creates pattern using captures as musical material
   ↓
7. INTERACT - user performs, adjusts, records
   ↓
8. MOVE - walk to new location, composition evolves with environment
```

**Key Distinction:** Captured sounds are not just layered on top of a beat. They ARE the beat, the melody, the texture. Radio becomes drums. Mic becomes bass. The place composes itself.

---

## 2. Composition Requirements

### 2.1 Non-Linear Source Integration

**Requirement:** Sources (Mic, Sampler, Synth, Radio) must interact with each other, not simply layer additively.

| Behavior | Required | Current Status |
|----------|----------|----------------|
| Source A's amplitude modulates Source B's FX parameters | Yes | Implemented (modulation routing) |
| Soundscape classification changes FX in real-time | Yes | Implemented |
| Detected frequencies tune melodic content | Yes | Implemented (_tunePitchesToEnvironment) |
| Sources can swap roles dynamically during playback | Yes | Implemented (reevaluateRoles) |
| Cross-source rhythmic sync (radio pulse triggers sampler) | Yes | Implemented (setupCrossSync) |

**Acceptance Criteria:**
- When mic detects rhythmic input, synth delay should pulse in sync
- When radio plays tonal content, sampler pitch-locks should harmonize
- Muting one source should audibly affect how other sources sound (via modulation loss)

### 2.2 Intelligent Sound Sampling

**Requirement:** Captured sounds (mic, radio) must be analyzed and assigned to musical roles based on their sonic character, not just played back raw.

| Behavior | Required | Current Status |
|----------|----------|----------------|
| Analyze captured audio for transients, pitch, texture | Yes | Implemented (analyzeBuffer, detectOnsets) |
| Auto-assign tonal captures to MELODY role | Yes | Implemented (analyzeAndAssignCapture) |
| Auto-assign percussive captures to RHYTHM role | Yes | Implemented (analyzeAndAssignCapture) |
| Auto-assign ambient captures to TEXTURE role | Yes | Implemented (analyzeAndAssignCapture) |
| Extract specific sounds from continuous capture (noise isolation) | Yes | Implemented (extractTransients) |
| Slice captured audio into playable segments | Yes | Implemented (autoSlice) |

**Acceptance Criteria:**
- Capture 10 seconds of street audio → system identifies drum-like sounds and assigns to rhythm track
- Capture radio with vocals → system extracts vocal phrases for melodic use
- User hears captured sounds transformed into musical elements, not raw playback

### 2.3 Radio as Musical Material

**Requirement:** Radio is not just a background stream. It must be choppable, sampleable, and usable as rhythmic/melodic material.

| Behavior | Required | Current Status |
|----------|----------|----------------|
| Gate radio rhythmically via sequencer | Yes | Implemented (track source = radio) |
| Capture radio snippets to sampler pads | Yes | Implemented |
| Slice radio into 16 playable segments | Yes | Implemented (autoSlice on captured radio) |
| Detect radio beat/tempo and sync to sequencer | Yes | Implemented (detectTempo) |
| Extract tonal content from radio for pitch-locking | Yes | Implemented (analyzeBuffer + _tunePitchesToEnvironment) |
| Use radio as sidechain trigger for other sources | Yes | Implemented (setupSidechain) |

**Acceptance Criteria:**
- Radio playing → user can chop it into 1/16th note slices triggered by sequencer
- Radio with drums → system detects BPM and offers to sync
- Radio fragment assigned to pad → plays like a sample, not a stream

### 2.4 Microphone as Musical Material

**Requirement:** Mic input is not just a live stream. Captured sounds must be processable into distinct musical elements.

| Behavior | Required | Current Status |
|----------|----------|----------------|
| Capture mic to sampler pad | Yes | Implemented |
| Analyze capture for sonic character (percussive/tonal/ambient) | Yes | Implemented (analyzeBuffer) |
| Isolate transients from ambient background | Yes | Implemented (detectOnsets + extractTransients) |
| Pitch-detect tonal content for scale snapping | Yes | Partial (_tunePitchesToEnvironment) |
| Time-stretch captured sounds to match tempo | Yes | Not implemented |
| Layer multiple mic captures with different roles | Yes | Implemented (via multiple pads) |

**Acceptance Criteria:**
- Record 4 seconds of clapping → system detects as percussive → assigns to RHYTHM track
- Record 4 seconds of humming → system detects pitch → assigns to MELODY with P-Locks
- Record ambient room tone → system assigns to TEXTURE with grain processing

### 2.5 Environment-Driven Structure

**Requirement:** The environment must shape composition structure, not just tweak parameters.

| Behavior | Required | Current Status |
|----------|----------|----------------|
| Soundscape classification determines track count and density | Yes | Partial (density adjustment only) |
| Detected transients become rhythmic anchor points | Yes | Implemented (detectOnsets in analyzeAndAssignCapture) |
| Quiet environments produce sparse arrangements | Yes | Implemented |
| Chaotic environments produce polyrhythmic, dense patterns | Yes | Implemented |
| Location change mid-session triggers arrangement evolution | Yes | Implemented (reevaluateRoles on classification change) |

**Acceptance Criteria:**
- Same vibe (e.g., "urban") at two different locations must produce audibly different compositions
- A 3-minute session in a changing environment should evolve, not loop
- User should be able to hear "this was made HERE" when playing back a recording

### 2.6 Role Assignment Quality

**Requirement:** Role assignment (RHYTHM, TEXTURE, MELODY, MODULATION) must produce musically coherent results, not random layering.

| Role | Expected Behavior | Current Status |
|------|-------------------|----------------|
| RHYTHM | Drives pulse, other sources sync to it | Implemented (cross-sync + sidechain) |
| TEXTURE | Fills space without competing with melody | Implemented |
| MELODY | Carries recognizable pitched phrases | Implemented |
| MODULATION | Creates movement by controlling other sources | Implemented |

**Any Source Can Serve Any Role:**

| Role | From Sampler | From Synth | From Radio | From Mic |
|------|--------------|------------|------------|----------|
| RHYTHM | Drum kit hits | Short percussive stabs | Chopped beats, gated bursts | Claps, footsteps, transients |
| TEXTURE | Ambient pads, noise | Sustained drones, pads | Background stream, hiss | Room tone, wind, traffic |
| MELODY | Pitched one-shots | Note sequences, arpeggios | Vocal phrases, melodic fragments | Humming, whistling, tonal sounds |
| MODULATION | Amplitude envelope | LFO-like patterns | Stream dynamics | Live input level |

**Acceptance Criteria:**
- Two RHYTHM sources should interlock, not clash
- TEXTURE sources should duck when MELODY is active
- MODULATION source removal should flatten the mix noticeably
- Any source can serve any role (radio as drums, mic as melody, etc.)

### 2.7 Compositional Variation

**Requirement:** Repeated generation with same parameters must produce meaningfully different results.

| Behavior | Required | Current Status |
|----------|----------|----------------|
| Same vibe + same location = different pattern each time | Yes | Implemented (randomization) |
| Generated patterns should not sound like presets | Yes | Partial |
| P-Lock values should vary per step, not uniform | Yes | Implemented |
| At least 3 distinct arrangement archetypes per vibe | Yes | Implemented (15 archetypes in 5 families) |

---

## 3. User Interface Requirements

### 3.1 Simultaneous Component Access

**Requirement:** User must be able to see and interact with multiple components simultaneously during performance.

| View Mode | Required Visible Panels | Current Status |
|-----------|------------------------|----------------|
| **Desktop (>1200px)** | Sequencer + Mixer + Pads + one of (Synth/FX/AI) | Partial - panels visible but cramped |
| **Tablet (768-1200px)** | Sequencer + Mixer OR Pads + Controls | Not implemented - uses tabs |
| **Mobile (<768px)** | Single panel with quick-switch tabs | Implemented |

**Acceptance Criteria:**
- On desktop, user can adjust mixer fader while watching sequencer playhead
- On desktop, user can trigger pad while viewing FX parameters
- Tab switching must complete in <100ms

### 3.2 Component Visibility During Generation

**Requirement:** When AI generates a composition, user must see what's happening.

| Behavior | Required | Current Status |
|----------|----------|----------------|
| Show which sources are being activated | Yes | Implemented (AI progress callbacks) |
| Show role assignments as they happen | Yes | Implemented (role badges on mixer) |
| Show soundscape classification result | Yes | Implemented (aiVibe display) |
| Animate sequencer grid as pattern is written | Yes | Not implemented |
| Show modulation routes visually | Yes | Implemented (route labels on mixer) |

### 3.3 All-Source Control Panel

**Requirement:** A single view must exist where user can control all 4 sources + master.

| Control | Must Be Accessible | Current Status |
|---------|-------------------|----------------|
| Volume (all 4 + master) | Yes | Implemented (mixer panel) |
| Mute/Solo (all 4) | Yes | Implemented |
| Pan (all 4) | Yes | Implemented |
| Per-channel FX send | Yes | Not in mixer - requires FX panel |
| Per-channel EQ | Yes | Not in mixer - requires EQ panel |
| Source role indicator | Yes | Not implemented |

**Acceptance Criteria:**
- Without switching panels, user can: mute any source, adjust any volume, see all levels
- Role assignments visible at a glance (icons or labels on mixer channels)

### 3.4 Real-Time Feedback

**Requirement:** User must receive immediate visual feedback for all actions.

| Action | Required Feedback | Max Latency | Current Status |
|--------|-------------------|-------------|----------------|
| Pad trigger | Pad lights up | <50ms | Implemented |
| Step toggle | Step highlights | <50ms | Implemented |
| Fader move | VU meter responds | <100ms | Implemented |
| AI generate | Progress indicator | Immediate | Not implemented |
| Soundscape change | Vibe label updates | <500ms | Implemented |
| Modulation active | Visual pulse on target | Real-time | Not implemented |

---

## 4. Journey Tracking Requirements

### 4.1 GPS Route Recording

**Requirement:** Journey mode must capture a complete record of movement with audio context.

| Data Point | Capture Frequency | Current Status |
|------------|-------------------|----------------|
| GPS position | Every 5 seconds or 3+ meters moved | Implemented |
| Timestamp | Per position | Implemented |
| Accuracy | Per position | Implemented |
| Altitude | Per position | Not captured |
| Speed | Derived from positions | Not calculated |

### 4.2 Waypoint System

**Requirement:** User can mark significant locations with associated audio.

| Feature | Required | Current Status |
|---------|----------|----------------|
| Manual waypoint drop | Yes | Implemented |
| Auto-name via reverse geocoding | Yes | Implemented |
| Audio snapshot at waypoint | Yes | Implemented (triggers landmark) |
| Waypoint limit | 26 (A-Z) | Implemented |
| Waypoint photo attachment | No | Not planned |

### 4.3 Journey Visualization

**Requirement:** Journey must be viewable on a map during and after recording.

| Feature | Required | Current Status |
|---------|----------|----------------|
| Live route polyline | Yes | Implemented |
| Waypoint markers with labels | Yes | Implemented |
| Start marker (green) | Yes | Implemented |
| End marker (red) | Yes | Implemented |
| Pan/zoom controls | Yes | Implemented (Leaflet) |
| Route fits to bounds | Yes | Implemented |

### 4.4 Journey Statistics

**Requirement:** Journey must calculate and display summary statistics.

| Statistic | Required | Current Status |
|-----------|----------|----------------|
| Total distance (meters) | Yes | Implemented |
| Duration (mm:ss) | Yes | Implemented |
| Waypoint count | Yes | Implemented |
| Average speed | Yes | Not implemented |
| Elevation gain/loss | No | Not implemented |

### 4.5 Journey Persistence

**Requirement:** Journey data must survive session end.

| Feature | Required | Current Status |
|---------|----------|----------------|
| Save journey to localStorage | Yes | Not implemented |
| Export journey as GPX | Yes | Not implemented |
| Export journey as GeoJSON | No | Not implemented |
| Recall past journeys | Yes | Not implemented |
| Journey list with dates | Yes | Not implemented |

---

## 5. Audio Engine Requirements

### 5.1 Signal Flow

```
Source → Channel Gain → Channel EQ → Channel FX → Master EQ → Master FX → Master Gain → Output
```

Each of 4 sources follows this path independently before summing at master.

### 5.2 Channel Specifications

| Parameter | Range | Default |
|-----------|-------|---------|
| Input Gain | 0-200% | 100% |
| Fader | 0-100% | 80% |
| Pan | -100 to +100 | 0 |
| EQ Lo/Mid/Hi | ±12dB | 0dB |
| FX Send (Delay) | 0-100% | 0% |
| FX Send (Glitch) | 0-100% probability | 0% |
| FX Send (Grain) | 0-100% density | 0% |

### 5.3 Effects Specifications

| Effect | Parameters | Behavior |
|--------|------------|----------|
| **Delay** | Time (0-2000ms), Feedback (0-100%), Mix (0-100%) | Tempo-syncable delay with feedback loop |
| **Glitch** | Probability (0-100%), Slice (10-500ms), Mode (stutter/reverse/jump) | Probability-triggered slice effects |
| **Grain** | Density (0-100%), Size (10-500ms), Pitch (±24 semi), Freeze | Granular texture via delay buffer |

### 5.4 Performance Requirements

| Metric | Target | Platform |
|--------|--------|----------|
| Audio latency | <10ms | Firmware |
| Audio latency | <50ms | Web (browser-dependent) |
| Sample rate | 44.1kHz | Both |
| Bit depth | 32-bit float | Web |
| Bit depth | 24-bit | Firmware |
| CPU usage | <60% | Both |

---

## 6. Sequencer Requirements

### 6.1 Pattern Structure

| Parameter | Specification |
|-----------|---------------|
| Tracks | 8 |
| Steps | 16 (expandable: 4, 8, 12, 16, 24, 32, 48, 64) |
| Patterns | 8 slots (A-H) |
| Resolution | 16th notes at current tempo |

### 6.2 Per-Step Parameters (P-Locks)

| Parameter | Range | Effect |
|-----------|-------|--------|
| Pitch | -24 to +24 semitones | Transpose sample/synth note |
| Filter | 0-100% | Cutoff frequency |
| Decay | 0-100% | Amplitude envelope release |
| Pan | -100 to +100 | Stereo position |
| Delay | 0-100% | Per-step delay send |
| Grain | 0-100% | Per-step grain density |
| FX Route | mic/samples/synth/radio/master | Target channel for FX |

### 6.3 Trigger Conditions

| Condition | Behavior |
|-----------|----------|
| Always | Trigger every cycle |
| Probability | Random trigger (1-100% chance) |
| Fill | Only during fill mode |
| Not Fill | Only when fill is OFF |
| Nth | Every N pattern cycles |
| Neighbor | Only if adjacent step triggered |

### 6.4 Track Sources

Each track can trigger any of:
- **Sampler** - Triggers pad (track 0→pad 0, track 1→pad 1, etc.)
- **Synth** - Triggers note at P-Lock pitch
- **Radio** - Gates radio audio
- **Mic** - Gates mic audio

---

## 7. Sampler Requirements

### 7.1 Pad Configuration

| Parameter | Specification |
|-----------|---------------|
| Pads | 8 primary + 8 secondary |
| Sample duration | Up to 30 seconds |
| Sample banks | 3 (switchable) |
| Velocity | 0-127 per trigger |

### 7.2 Sample Sources

| Source | Method |
|--------|--------|
| Procedural | Generated drum sounds (fallback) |
| File | Loaded from URL/file |
| Mic capture | 1s/2s/4s recording |
| Radio capture | Captured from stream |

### 7.3 Sample Manipulation

| Feature | Required | Current Status |
|---------|----------|----------------|
| Pitch shift | Yes | Implemented (P-Lock) |
| Slice selection (16 slices) | Yes | P-Lock exists, playback not implemented |
| Reverse playback | No | Not planned |
| Time stretch | No | Not planned |

---

## 8. Synthesizer Requirements

### 8.1 Architecture

| Component | Specification |
|-----------|---------------|
| Oscillators | 2 (OSC1 + OSC2) |
| Waveforms | Sine, Triangle, Sawtooth, Square |
| Filter | LP, HP, BP with resonance |
| Envelope | ADSR (Attack, Decay, Sustain, Release) |
| LFO | 1 with rate, depth, target selection |
| Unison | 1-8 voices with spread |

### 8.2 Parameters

| Parameter | Range |
|-----------|-------|
| OSC2 Detune | ±100 cents |
| Octave | -2 to +2 |
| Filter Cutoff | 20Hz - 20kHz |
| Filter Resonance | 0-100% |
| LFO Rate | 0.1 - 20 Hz |
| LFO Depth | 0-100% |
| LFO Target | Pitch, Filter, Amplitude |

---

## 9. Radio Requirements

### 9.1 Station Discovery

| Method | Required | Current Status |
|--------|----------|----------------|
| Search by name | Yes | Implemented |
| Search by country | Yes | Implemented |
| Search by genre/tag | Yes | Implemented |
| GPS-local search | Yes | Implemented |
| Fallback stations | Yes | Implemented (5 SomaFM/Radio Paradise) |

### 9.2 Playback

| Feature | Required | Current Status |
|---------|----------|----------------|
| CORS-enabled streams | Yes | Implemented |
| Non-CORS fallback (audio element) | Yes | Implemented |
| Automatic retry on failure | Yes | Implemented |
| Station queue | Yes | Implemented |

### 9.3 Integration

| Feature | Required | Current Status |
|---------|----------|----------------|
| Route through mixer | Yes | Implemented (when CORS) |
| Capture to sampler pad | Yes | Implemented |
| FX processing | Yes | Implemented (when CORS) |

---

## 10. GPS & Location Requirements

### 10.1 Position Tracking

| Feature | Required | Current Status |
|---------|----------|----------------|
| Continuous position updates | Yes | Implemented |
| Accuracy reporting | Yes | Implemented |
| High accuracy mode | Yes | Implemented |
| Location caching (60s) | Yes | Implemented |

### 10.2 Reverse Geocoding

| Feature | Required | Current Status |
|---------|----------|----------------|
| Location name from coordinates | Yes | Implemented |
| Rate limiting (1 req/sec for Nominatim) | Yes | Implemented |
| Fallback to coordinates on failure | Yes | Implemented |

### 10.3 Map Display

| Feature | Required | Current Status |
|---------|----------|----------------|
| OpenStreetMap tiles | Yes | Implemented |
| Current position marker | Yes | Implemented |
| Mini-map in sidebar | Yes | Implemented |
| Full map in journey panel | Yes | Implemented |

---

## 11. Recording Requirements

### 11.1 Session Recording

| Feature | Required | Current Status |
|---------|----------|----------------|
| Record master output | Yes | Implemented |
| Format: WebM/Ogg | Yes | Implemented |
| GPS metadata in filename | Yes | Implemented |
| Start/stop via button or R key | Yes | Implemented |

### 11.2 Recording Persistence

| Feature | Required | Current Status |
|---------|----------|----------------|
| Recording list in sidebar | Yes | Implemented |
| Download recorded files | Yes | Implemented |
| Persist list across sessions | Yes | Implemented (localStorage) |
| Persist blobs across sessions | Yes | Not implemented (lost on refresh) |

---

## 12. Scene Requirements

### 12.1 Scene Storage

| Data | Captured | Current Status |
|------|----------|----------------|
| Pattern (all 8 tracks × all steps) | Yes | Implemented |
| Mixer state (faders, mutes, pans) | Yes | Implemented |
| FX state (per-channel + master) | Yes | Implemented |
| Role assignments | Yes | Implemented |
| Tempo | Yes | Implemented |
| Swing | Yes | Implemented |

### 12.2 Scene Operations

| Operation | Required | Current Status |
|-----------|----------|----------------|
| Save to slot (A-D) | Yes | Implemented |
| Recall from slot | Yes | Implemented |
| Morph between scenes (2s crossfade) | Yes | Code exists, UI not connected |
| Auto-scene timer | No | UI exists, not implemented |

---

## 13. Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Space | Play/Pause |
| R | Start/Stop Recording |
| ESC | Stop All |
| 1-8 | Trigger Pads 1-8 |
| Up/Down | Select Track |
| Shift+Click | Edit P-Locks |
| D | Toggle Dub Mode |
| F (hold) | Fill Mode |
| G | Generate AI Pattern |
| Q (hold) | Stutter Punch FX |
| W (hold) | Reverse Punch FX |
| E (hold) | Filter Sweep Punch FX |
| T (hold) | Tape Stop Punch FX |
| ? | Show Help |

---

## 14. Implementation Gaps

### 14.1 Critical (Blocks Core Experience)

| Gap | Impact | Priority | Status |
|-----|--------|----------|--------|
| **No intelligent sound analysis for role assignment** | Captured audio just plays back, not transformed | Critical | **CLOSED** — analyzeBuffer(), analyzeAndAssignCapture() |
| **No radio/mic slicing into playable segments** | Can't use radio/mic as rhythmic material | Critical | **CLOSED** — autoSlice() with onset detection |
| No dynamic role swapping during playback | Composition feels static | High | **CLOSED** — reevaluateRoles() with debounce |
| No cross-source rhythmic sync | Sources don't interlock | High | **CLOSED** — setupCrossSync() |
| No simultaneous panel view on desktop | Can't perform effectively | High | Existing (CSS grid already shows panels) |
| No journey persistence | Journeys lost on refresh | High | **CLOSED** — localStorage save/load/list |

### 14.2 High (Degrades Experience)

| Gap | Impact | Priority | Status |
|-----|--------|----------|--------|
| **No transient isolation from captures** | Can't extract drums from ambient recording | High | **CLOSED** — detectOnsets() + extractTransients() |
| **No tempo detection from radio/mic** | Manual sync only | High | **CLOSED** — detectTempo() via IOI histogram |
| No visual feedback during AI generation | User doesn't know what's happening | High | **CLOSED** — progress callbacks + UI display |
| No modulation route visualization | Can't see source interactions | High | **CLOSED** — route labels on mixer channels |
| Scene morphing UI not connected | Feature exists but inaccessible | Medium | **CLOSED** — Shift+click for smooth morph |
| Sample slicing not implemented | P-Lock exists but does nothing | Medium | **CLOSED** — custom slice boundaries in trigger() |

### 14.3 Medium (Polish)

| Gap | Impact | Priority | Status |
|-----|--------|----------|--------|
| No time-stretch for captured sounds | Tempo mismatch issues | Medium | INFEASIBLE — requires phase vocoder, too heavy for target HW |
| No sidechain triggering from radio | Can't pump synth from radio drums | Medium | **CLOSED** — setupSidechain() + applySidechainGain() |
| No arrangement archetypes | Generations feel similar | Medium | **CLOSED** — 15 archetypes in 5 families |
| No average speed in journey stats | Minor data gap | Low | **CLOSED** — avgSpeed + avgSpeedKmh in getStats() |
| No GPX export | Can't share journeys | Low | **CLOSED** — exportGPX() with waypoints + track |
| Secondary pads (9-16) not triggered | UI misleading | Low | **CLOSED** — pads 9-16 wired, sampler supports 16 pads |

### 14.4 Hardware Feasibility Analysis

Assessment of implementing each gap feature on the target hardware (Teensy 4.1 + ESP32-WROOM).

| Gap | HW (Teensy 4.1 + ESP32) Feasibility | Notes |
|-----|--------------------------------------|-------|
| Buffer analysis (FFT) | YES | Teensy audio library has FFT (1024-point), ESP32 has DSP instructions |
| Onset detection | YES | Simple amplitude threshold in 10ms windows, runs easily on Teensy |
| Tempo detection | YES | IOI histogram is lightweight, no floating-point issues on ARM Cortex-M7 |
| Radio slicing | PARTIAL | ESP32 handles HTTP streaming, CORS N/A on hardware, slicing from captured buffer works |
| Time-stretch | NO | Requires phase vocoder with overlap-add, too heavy for Teensy real-time at 600MHz |
| Sidechain | YES | Analog envelope follower circuit or digital RMS tracking at audio rate |
| Role assignment | YES | Simple threshold comparisons, trivial on ARM |
| Cross-source sync | YES | Threshold comparison per tick, minimal CPU |
| Dynamic role swap | YES | Reassignment is just data structure update |
| Journey persistence | YES | SD card storage on Teensy (64GB microSD), SQLite on ESP32 |
| GPX export | YES | String formatting written to SD card file |
| Simultaneous UI | YES | 5" IPS touch (800x480) can show split-view layout |
| Scene morphing | YES | Linear interpolation trivial on ARM, smooth at 60fps |
| Arrangement archetypes | YES | Static data arrays, zero runtime cost |

---

## 15. Acceptance Tests

### 15.1 Composition Quality

- [ ] Generate twice with same vibe → audibly different patterns
- [ ] Mute mic → synth delay changes (modulation lost)
- [ ] Urban vs nature vibe → recognizably different character
- [ ] Same vibe at two GPS locations → different results

### 15.2 Sound Sampling & Role Assignment

- [ ] Capture clapping via mic → system detects percussive → assigns to RHYTHM
- [ ] Capture humming via mic → system detects tonal → assigns to MELODY with pitch P-Locks
- [ ] Capture ambient noise → system assigns to TEXTURE with grain FX
- [ ] Radio with beat → user can chop into 16 slices
- [ ] Radio fragment on pad → triggers like sample, not continuous stream
- [ ] Any source can be assigned any role (radio as rhythm, mic as melody)

### 15.3 UI Responsiveness

- [ ] Desktop: adjust mixer while viewing sequencer
- [ ] Tab switch completes in <100ms
- [ ] Pad trigger lights up in <50ms
- [ ] VU meters respond to fader in <100ms

### 15.4 Journey Completeness

- [ ] Start journey → GPS breadcrumbs appear on map
- [ ] Drop waypoint → marker appears with location name
- [ ] End journey → stats show distance/duration/waypoints
- [ ] Close/reopen browser → journey data persists (Implemented)

---

## 16. Hardware Target (Future)

| Component | Specification |
|-----------|---------------|
| Processor | Teensy 4.1 (600MHz ARM Cortex-M7) |
| WiFi/BT | ESP32-WROOM |
| Audio | SGTL5000 codec |
| Display | 5" IPS Touch (800x480) |
| Storage | 64GB microSD |
| Battery | 3500mAh LiPo (5-7 hours) |
| Enclosure | 200 × 140 × 45mm aluminum |

---

*This document specifies required behaviors, not just features. Implementation status reflects current web prototype v2.5.2.*
