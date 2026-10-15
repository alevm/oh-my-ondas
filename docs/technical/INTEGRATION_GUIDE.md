# MUSIC BOX - INTEGRATION & QUICK START GUIDE

## 🚀 GETTING STARTED

This guide shows how the **Sampling Engine**, **FX Routing System**, and **AI Composition** work together to create unique place-time-bound musical compositions.

---

## 📋 SYSTEM OVERVIEW

```
┌─────────────────────────────────────────────────────────────┐
│                    MUSIC BOX SIGNAL FLOW                    │
└─────────────────────────────────────────────────────────────┘

INPUTS → SAMPLING ENGINE → FX CHAIN → OUTPUT + RECORDING
  ↓            ↓              ↓            ↓
  ↓         TRIGGERS      MODULATION   METADATA
  ↓            ↓              ↓            ↓
  └──────→ GPS + AI ←────────┴────────────┘
```

---

## 🎮 MAIN FIRMWARE INTEGRATION

### Complete Arduino Sketch Structure

```cpp
#include <Audio.h>
#include <Wire.h>
#include <SD.h>
#include <Adafruit_CAP1188.h>
#include <TinyGPS++.h>

// ===== IMPORT MODULES =====
// sampling_engine.ino - Sample playback and triggering
// fx_routing.ino      - Effect chain management
// gps_logger.ino      - Location and time tracking
// ai_interface.ino    - ESP32 communication for AI

// ===== GLOBAL STATE =====
enum SystemMode {
  MODE_IDLE,
  MODE_RECORDING,
  MODE_SAMPLING,
  MODE_FX_EDIT,
  MODE_AI_COMPOSE
};

SystemMode currentMode = MODE_IDLE;
bool isRecording = false;
unsigned long recordingStartTime = 0;

// ===== SETUP =====
void setup() {
  Serial.begin(115200);
  Serial.println("Music Box v2.0 Starting...");
  
  // Initialize all subsystems
  setupAudioSystem();       // From sampling_engine.ino
  setupFXSystem();          // From fx_routing.ino
  setupGPS();               // GPS and time tracking
  setupESP32();             // AI communication
  setupDisplay();           // OLED UI
  setupEncoders();          // User interface
  
  Serial.println("All systems ready!");
  displayStatus("READY");
}

// ===== MAIN LOOP =====
void loop() {
  // Update time-critical systems every loop
  handleTouchPads();        // Immediate sample triggering
  updateLFOs();             // Smooth modulation
  updateGPS();              // Location tracking
  
  // UI updates (10ms)
  static unsigned long lastUI = 0;
  if (millis() - lastUI > 10) {
    handleEncoders();
    updateDisplay();
    lastUI = millis();
  }
  
  // Audio monitoring (100ms)
  static unsigned long lastAudio = 0;
  if (millis() - lastAudio > 100) {
    updateSamples();        // Check sample playback states
    updateRecording();      // Update recording if active
    lastAudio = millis();
  }
  
  // AI and networking (1000ms)
  static unsigned long lastNetwork = 0;
  if (millis() - lastNetwork > 1000) {
    checkESP32Messages();   // AI responses, GPS updates
    sendTelemetry();        // Status to cloud if needed
    lastNetwork = millis();
  }
  
  // Display refresh (50ms for smooth UI)
  static unsigned long lastDisplay = 0;
  if (millis() - lastDisplay > 50) {
    refreshOLED();
    lastDisplay = millis();
  }
}
```

---

## 🎹 OPERATION MODES

### MODE 1: Live Sampling & Performance

**Workflow:**
1. Power on device
2. Connect inputs (radio, mics, line in)
3. Press **Mode** button → Select "SAMPLING"
4. Touch pads to trigger samples
5. Use encoders to:
   - **Encoder 1:** Mix input sources
   - **Encoder 2:** Select active FX
   - **Encoder 3:** Adjust FX parameters
   - **Encoder 4:** Switch sample banks
6. Press **Record** to capture performance

**Example Session:**
```
Location: Park bench, Central Park
Time: 3:30 PM, Saturday
Inputs: Bird sounds (mic), Radio (classic jazz), Contact mic on bench

Actions:
1. Touch Pad 1 → Trigger bird chirp sample (looped)
2. Touch Pad 2 → Trigger radio phrase
3. Encoder 2 → Add Reverb (50% wet)
4. Touch Pad 3 → Layer bench vibration
5. Encoder 1 → Fade in radio (0.6 level)
6. Press Record → Capture 90 seconds
7. GPS tags location automatically

Output: "CentralPark_20250315_1530.wav" + metadata
```

---

### MODE 2: AI-Assisted Composition

**Workflow:**
1. Press **Mode** button → Select "AI COMPOSE"
2. Position device at location
3. Wait for GPS lock (green LED)
4. Press **Trigger** → System records 30sec from all sources
5. System analyzes:
   - Beat detection
   - Pitch detection
   - Spectral analysis
   - Location data
   - Current time/weather
6. ESP32 sends data to Claude API
7. AI responds with composition structure
8. System automatically:
   - Slices samples
   - Applies pitch shifting
   - Arranges timeline
   - Adds suggested FX
9. Press **Trigger** again to render composition
10. Result saved with full metadata

**Example AI Interaction:**

**Human Input:** (via device position and samples)
```
Location: 34.0522° N, 118.2437° W (Downtown LA)
Time: 11:15 PM, Friday
Weather: Clear, 18°C
Audio detected:
- Traffic: 85 dB, broadband 200-5000 Hz
- Music from club: House music, 128 BPM, G minor
- Voices: Sparse conversation
- Helicopter: Intermittent, 80-150 Hz
```

**AI Response:**
```json
{
  "composition_title": "LA_Midnight_Pulse",
  "structure": [
    {
      "section": "intro",
      "duration": 20,
      "description": "Start with helicopter drone as bass",
      "samples": ["helicopter_low"],
      "fx": ["reverb", "filter_lp"],
      "parameters": {
        "filter_cutoff": 150,
        "reverb_size": 0.8
      }
    },
    {
      "section": "build",
      "duration": 40,
      "description": "Layer traffic rhythm, sync to 128 BPM",
      "samples": ["traffic_rhythm", "club_music_filtered"],
      "fx": ["delay", "compressor"],
      "tempo_lock": true,
      "bpm": 128
    },
    {
      "section": "climax",
      "duration": 30,
      "description": "Full mix with voice snippets as melody",
      "samples": ["voices_pitched", "club_music", "traffic_rhythm"],
      "fx": ["reverb", "chorus"],
      "mixing": {
        "voices": 0.7,
        "club": 0.5,
        "traffic": 0.6
      }
    },
    {
      "section": "outro",
      "duration": 20,
      "description": "Fade to distant helicopter",
      "samples": ["helicopter_low"],
      "fx": ["reverb", "filter_lp"],
      "fade_out": true
    }
  ],
  "rationale": "Late Friday in downtown LA suggests nightlife energy. 
               Helicopter creates cinematic tension typical of LA. 
               128 BPM house music provides rhythmic anchor. 
               Composition should feel urban, energetic, slightly cinematic."
}
```

**System then:**
1. Slices samples according to structure
2. Time-stretches to 128 BPM
3. Applies FX as specified
4. Renders 110-second composition
5. Saves with embedded metadata

---

## 🎛️ ENCODER CONTROL MAPPING

### Normal Operation Mode:

| Encoder | Function | Press Function |
|---------|----------|----------------|
| **1** | Source Mix Level | Mute/Solo source |
| **2** | FX Select | Bypass FX chain |
| **3** | FX Parameter 1 | Cycle param (P1→P2→P3) |
| **4** | Sample Bank Select | Quick-save current bank |

### FX Edit Mode (hold Mode button):

| Encoder | Function | Press Function |
|---------|----------|----------------|
| **1** | FX Slot Select | Add/Remove FX |
| **2** | FX Type Select | Load preset chain |
| **3** | Wet/Dry Mix | Reset to default |
| **4** | LFO Rate | Enable/Disable LFO |

### Recording Mode:

| Encoder | Function | Press Function |
|---------|----------|----------------|
| **1** | Recording Level | Auto-normalize |
| **2** | Monitor Mix | Headphone/Line out |
| **3** | *Disabled* | - |
| **4** | *Disabled* | - |

---

## 🎨 TOUCH PAD FUNCTIONALITY

### 8-Pad Layout:
```
┌────┬────┬────┬────┐
│ 1  │ 2  │ 3  │ 4  │  Top Row: Primary samples
├────┼────┼────┼────┤
│ 5  │ 6  │ 7  │ 8  │  Bottom Row: Secondary/Effects
└────┴────┴────┴────┘
```

### Touch Behaviors:

**Single Tap:** Trigger sample (one-shot or loop depending on mode)

**Double Tap:** Toggle loop on/off for that sample

**Hold (>500ms):** Record new sample to that pad from current input mix

**Slide (swipe):** Crossfade between samples

**Pressure (if using pressure-sensitive pads):** Control sample volume

---

## 📊 DISPLAY UI LAYOUTS

### Main Screen (Normal Operation):
```
┌──────────────────────┐
│ ♪ MUSIC BOX   [GPS✓]│  Line 1: Status
├──────────────────────┤
│ MODE: SAMPLING       │  Line 2: Current mode
│ BPM: 124  Key: Am   │  Line 3: Audio analysis
├──────────────────────┤
│ [==|=====|===|=]     │  Line 4: VU meters (4 sources)
│ FX: Reverb→Delay    │  Line 5: Active FX chain
├──────────────────────┤
│ REC: 01:23  [SD:42GB]│  Line 6: Recording time / Storage
│ 40.7128°N 74.0060°W │  Line 7: GPS coordinates
└──────────────────────┘
```

### FX Edit Screen:
```
┌──────────────────────┐
│ FX CHAIN EDITOR      │
├──────────────────────┤
│ [1] Reverb    [ACTIVE]│
│  ├─ Room:  0.75      │
│  ├─ Damp:  0.50      │
│  └─ Mix:   0.40      │
├──────────────────────┤
│ [2] Delay     [ACTIVE]│
│  ├─ Time:  250ms     │
│  └─ Fdbk:  0.35      │
├──────────────────────┤
│ [3] -Empty-          │
└──────────────────────┘
```

### AI Compose Screen:
```
┌──────────────────────┐
│ AI COMPOSITION       │
├──────────────────────┤
│ Analyzing...    [75%]│
│                      │
│ ▓▓▓▓▓▓▓▓▓▓▓░░░░      │
│                      │
│ Detected:            │
│  BPM: 128            │
│  Key: G minor        │
│  Sources: 4 active   │
│                      │
│ Sending to AI...     │
└──────────────────────┘
```

---

## 🔧 CALIBRATION & SETUP

### First Boot Checklist:

1. **SD Card Setup:**
   ```
   /samples/         - Put .wav sample files here
   /patches/         - FX preset patches
   /recordings/      - Output recordings
   /logs/            - Debug logs
   ```

2. **Touch Pad Calibration:**
   - Run calibration routine (hold all 4 buttons on startup)
   - Touch each pad when prompted
   - System stores baseline capacitance values

3. **GPS Configuration:**
   - First GPS lock takes 30-60 seconds
   - Requires clear sky view
   - After first lock, subsequent locks are faster (<10 sec)

4. **WiFi Setup:**
   - Connect via USB to configure WiFi
   - Enter SSID and password via Serial monitor
   - Or use WPS button press for automatic setup

5. **AI API Key:**
   - Create file `/config/api_key.txt` on SD card
   - Paste your Claude API key
   - System reads on boot

---

## 🎼 SAMPLE PREPARATION

### Recommended Sample Format:
- **File Format:** WAV, 16 or 24-bit
- **Sample Rate:** 44.1 kHz
- **Length:** 0.5 - 10 seconds (optimal)
- **Naming:** `sample01.wav` to `sample64.wav`

### Sample Bank Organization:
```
/samples/
  /bank01/  - Percussion
    kick.wav
    snare.wav
    hihat.wav
    clap.wav
  /bank02/  - Melodic
    bass.wav
    chord1.wav
    chord2.wav
    lead.wav
  /bank03/  - Ambient
    pad1.wav
    texture.wav
    drone.wav
    noise.wav
```

### Quick Sample Capture:
1. Hold touch pad for 2 seconds
2. Device records from current input mix
3. Release to stop recording
4. Sample automatically saved to that pad
5. LED blinks to confirm

---

## 🌐 CLOUD AI INTEGRATION

### API Communication Flow:

```
TEENSY → SERIAL → ESP32 → WiFi → CLAUDE API
   ↓                                    ↓
   ↓←──────────────────────────────────┘
   ↓
APPLY AI INSTRUCTIONS
```

### Data Sent to API:
```json
{
  "request_type": "composition",
  "location": {
    "lat": 40.7128,
    "lon": -74.0060,
    "name": "Manhattan, NYC"
  },
  "timestamp": "2025-03-15T14:30:00Z",
  "environment": {
    "weather": "Sunny",
    "temperature": 18,
    "time_of_day": "afternoon"
  },
  "audio_features": {
    "bpm": 128,
    "key": "C Major",
    "sources": [
      {"type": "radio", "characteristics": "pop music"},
      {"type": "microphone", "characteristics": "urban noise"},
      {"type": "contact_mic", "characteristics": "vibrations"}
    ]
  }
}
```

### API Response Processing:
1. ESP32 receives JSON structure
2. Parses composition instructions
3. Sends to Teensy via Serial
4. Teensy implements arrangement
5. Renders audio according to AI plan

---

## 🎯 TYPICAL CREATIVE WORKFLOWS

### Workflow 1: "Sonic Postcard"
**Goal:** Capture essence of location as musical composition

1. Arrive at location (beach, cafe, street corner)
2. Set up inputs (mics, contact mics, radio)
3. Press **AI COMPOSE** mode
4. Wait 30 seconds for environmental capture
5. AI analyzes and suggests composition
6. Review and tweak if needed
7. Render final piece
8. Share with GPS coordinates

**Result:** Musical memory of that specific place-time

### Workflow 2: "Live Remix"
**Goal:** Real-time performance mixing environment

1. Set up at live event or busy location
2. **SAMPLING** mode
3. Capture phrases to pads as they occur
4. Layer and manipulate in real-time
5. Apply FX for cohesion
6. Record improvised performance

**Result:** Live capture of moment's energy

### Workflow 3: "Sound Hunting"
**Goal:** Collect specific sounds, create library

1. Travel with device
2. Hunt for interesting sonic textures
3. Use **HOLD PAD** to quick-sample
4. Build location-tagged sample library
5. Later: use samples in studio productions

**Result:** Geotagged sample collection

---

## 📈 PERFORMANCE OPTIMIZATION

### Audio Latency:
- Target: <10ms end-to-end
- Teensy audio buffer: 128 samples @ 44.1kHz = 2.9ms
- Touch sensor polling: 10ms
- Display update: 50ms (doesn't affect audio)

### CPU Usage Guidelines:
- Aim for <70% average CPU usage
- Leave headroom for complex FX chains
- Monitor with `AudioProcessorUsage()`
- Optimize FX order (cheap effects first)

### Memory Management:
- 120 blocks allocated (30KB)
- Each sample player: ~12-16 blocks
- Each FX: 2-8 blocks
- Monitor with `AudioMemoryUsage()`

---

## 🔬 TROUBLESHOOTING

### Common Issues:

**GPS Not Locking:**
- Ensure clear sky view
- Wait 60 seconds on first boot
- Check antenna connection
- Verify GPS module LED blinking

**Touch Pads Not Responsive:**
- Recalibrate (boot with all buttons held)
- Check copper tape connectivity
- Verify CAP1188 I2C address (0x29 on Wire1, pins 16/17)
- Reduce sensitivity if too sensitive

**Audio Crackling:**
- Check SD card speed (Class 10 minimum)
- Reduce active FX count
- Increase audio buffer size
- Check power supply stability

**WiFi Won't Connect:**
- Verify SSID/password
- Check 2.4GHz band (ESP32 doesn't support 5GHz)
- Move closer to router
- Reset ESP32 (button press)

---

## 🚀 NEXT STEPS

1. **Build the Hardware** (see BOM-v2.md)
2. **Flash Firmware** (upload all .ino files)
3. **Calibrate System** (touch pads, GPS, audio)
4. **Load Sample Banks** (prepare WAV files)
5. **Configure WiFi & API** (cloud access)
6. **Test Workflows** (try each mode)
7. **Create First Recording** (capture your location!)

---

## 📚 FILE REFERENCE

**Hardware:**
- `music-box-architecture-v2.mermaid` - System diagram
- `music-box-BOM-v2.md` - Parts list

**Software:**
- `sampling_engine.ino` - Sample playback & triggers
- `fx_routing.ino` - Effect chain management
- Integration code above - Main firmware

**Documentation:**
- `PRODUCT_OVERVIEW.md` - Concept and philosophy
- This file - Integration guide

---

**Ready to create truly unique, place-bound music!** 🎵🌍⏰
