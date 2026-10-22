/**
 * Oh My Ondas - Capture store: snippets of the place's sound in PSRAM
 *
 * Records mic/piezo (LINE-IN L) or radio (LINE-IN R) through the
 * AudioSense taps into one pool used as a ring: a new capture goes after the
 * last one; captures it would overwrite are evicted first (and any voice
 * playing them is stopped through the evict callback).
 *
 * Pool: PSRAM (extmem_malloc) when external_psram_size > 0, sized
 * CAPTURE_PSRAM_RESERVE_MB below the fitted PSRAM. Without PSRAM it falls
 * back to CAPTURE_RAM_FALLBACK_BYTES of RAM2 (~1.4 s in total): captures
 * still work, just short; isFallback() says so.
 *
 * After recording, each capture is analysed (port of the web engine's
 * soundscape-analyzer.js analyzeBuffer / detectOnsets and
 * ai-composer.js analyzeAndAssignCapture):
 *   onsets: 10 ms RMS windows, rms > prev * 1.8 and > 0.02 (up to 16, as
 *           sampler.js autoSlice keeps them for slicing)
 *   transient density: 50 ms windows, same rule, per second
 *   pitch: YIN-lite on the loudest 93 ms
 *   kind: percussive if transient density > 3/s or a sharp single hit
 *         (crest > 6 with an onset), tonal if pitch confidence > 0.7,
 *         else ambient. The web version used spectral centroid/brightness
 *         for "tonal"; pitch confidence replaces it here (no FFT pass).
 *   role: percussive -> rhythm, tonal -> melody, ambient -> texture
 */

#ifndef CAPTURE_STORE_H
#define CAPTURE_STORE_H

#include <Arduino.h>
#include "config.h"
#include "audio_sense.h"

#define CAPTURE_MAX               16
#define CAPTURE_MAX_ONSETS        16
#define CAPTURE_DEFAULT_MS        3000
#define CAPTURE_MAX_MS            8000
#define CAPTURE_PSRAM_RESERVE_MB  1          // left for the clip buffer and others
#define CAPTURE_RAM_FALLBACK_BYTES (128 * 1024)
#define CAPTURE_AUTO_MS           45000      // while playing, auto-capture this often; 0 = off

enum CaptureKind : uint8_t { KIND_PERCUSSIVE = 0, KIND_TONAL = 1, KIND_AMBIENT = 2 };
enum CaptureRole : uint8_t { ROLE_RHYTHM = 0, ROLE_TEXTURE = 1, ROLE_MELODY = 2,
                             ROLE_MODULATION = 3, ROLE_NONE = 255 };

struct Capture {
    bool     used;
    uint8_t  id;                  // 1..255, never 0
    uint8_t  source;              // LinkSource: 0 mic, 1 piezo, 2 radio
    uint32_t offset;              // in the pool, samples
    uint32_t length;              // samples
    uint32_t t_ms;                // when it was made
    uint32_t seq;                 // creation order
    // Analysis
    uint8_t  kind;                // CaptureKind
    uint8_t  role;                // CaptureRole
    uint8_t  onsetCount;
    uint32_t onsets[CAPTURE_MAX_ONSETS];  // sample positions
    float    pitchHz, pitchConf;
    float    rms, peak;
    float    transientDensity;    // per second
};

typedef void (*CaptureEvictCallback)(uint8_t id);

class CaptureStore {
public:
    CaptureStore();

    bool begin();
    void update();                // finishes a recording: analyse + publish

    // Recording (non-blocking; the AudioSense tap copies in the audio interrupt)
    bool startCapture(AudioSense* sense, uint8_t source, uint32_t ms = CAPTURE_DEFAULT_MS);
    void stopCapture();           // ends early, keeps what was recorded
    void cancelCapture();         // ends and throws the recording away
    bool isRecording() const      { return recSense != nullptr; }
    uint8_t recordingSource() const { return recSource; }
    float recordProgress() const;

    // Inventory
    int      count() const;
    const Capture* at(int slot) const { return (slot >= 0 && slot < CAPTURE_MAX && caps[slot].used) ? &caps[slot] : nullptr; }
    const Capture* findById(uint8_t id) const;
    const Capture* newest(int kind = -1, int source = -1) const;  // -1 = any
    const int16_t* samples(const Capture& c) const { return pool + c.offset; }
    bool     setRole(uint8_t id, uint8_t role);
    uint32_t version() const      { return changeCount; }  // bumps on every change

    void setEvictCallback(CaptureEvictCallback cb) { evictCB = cb; }

    // Status
    bool     isReady() const      { return pool != nullptr; }
    bool     isFallback() const   { return fallback; }
    uint32_t poolSamples() const  { return poolLen; }
    uint32_t usedSamples() const;
    uint8_t  psramMB() const;

private:
    Capture  caps[CAPTURE_MAX];
    int16_t* pool;
    uint32_t poolLen;
    uint32_t writeHead;
    bool     fallback;
    uint32_t changeCount;
    uint32_t seqCounter;
    uint8_t  nextId;
    CaptureEvictCallback evictCB;

    // Recording in progress
    AudioSense* recSense;
    uint8_t  recSource;
    uint32_t recOffset, recMax;
    bool     recDiscard;

    void evictRange(uint32_t from, uint32_t to);
    void evictSlot(int slot);
    uint8_t allocId();
    void analyze(Capture& c);
};

#endif // CAPTURE_STORE_H
