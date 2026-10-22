/**
 * Oh My Ondas - Capture store implementation
 */

#include "capture_store.h"
#include "feature_extractor.h"   // yinPitch

extern "C" uint8_t external_psram_size;   // Teensy 4.1 core: MB of PSRAM found at boot

CaptureStore::CaptureStore()
    : pool(nullptr), poolLen(0), writeHead(0), fallback(false)
    , changeCount(0), seqCounter(0), nextId(1), evictCB(nullptr)
    , recSense(nullptr), recSource(0), recOffset(0), recMax(0), recDiscard(false)
{
    memset(caps, 0, sizeof(caps));
}

bool CaptureStore::begin() {
    if (external_psram_size > CAPTURE_PSRAM_RESERVE_MB) {
        size_t bytes = (size_t)(external_psram_size - CAPTURE_PSRAM_RESERVE_MB) * 1024 * 1024;
        pool = (int16_t*)extmem_malloc(bytes);
        if (pool) {
            poolLen = bytes / sizeof(int16_t);
            DEBUG_PRINTF("CaptureStore: %u MB PSRAM, pool %.1f s\n", external_psram_size,
                         poolLen / AUDIO_SAMPLE_RATE_EXACT);
            return true;
        }
    }
    // No PSRAM soldered (or it failed): small RAM pool so captures still work
    pool = (int16_t*)malloc(CAPTURE_RAM_FALLBACK_BYTES);
    if (pool) {
        poolLen = CAPTURE_RAM_FALLBACK_BYTES / sizeof(int16_t);
        fallback = true;
        DEBUG_PRINTF("CaptureStore: no PSRAM, RAM fallback %.1f s\n", poolLen / AUDIO_SAMPLE_RATE_EXACT);
        return true;
    }
    DEBUG_PRINTLN("CaptureStore: no memory, captures disabled");
    return false;
}

uint8_t CaptureStore::psramMB() const {
    return external_psram_size;
}

// ============================================
// RECORDING
// ============================================

bool CaptureStore::startCapture(AudioSense* sense, uint8_t source, uint32_t ms) {
    if (!pool || !sense || recSense) return false;
    uint32_t want = (uint32_t)(constrain(ms, 100u, (uint32_t)CAPTURE_MAX_MS) * (AUDIO_SAMPLE_RATE_EXACT / 1000.0f));
    if (want > poolLen / 2) want = poolLen / 2;   // RAM fallback: keep room for 2

    if (writeHead + want > poolLen) writeHead = 0;   // wrap the ring
    evictRange(writeHead, writeHead + want);
    if (count() >= CAPTURE_MAX) {                     // inventory full: drop the oldest
        int oldest = -1;
        for (int i = 0; i < CAPTURE_MAX; i++) {
            if (caps[i].used && (oldest < 0 || caps[i].seq < caps[oldest].seq)) oldest = i;
        }
        if (oldest >= 0) evictSlot(oldest);
    }

    recSense = sense;
    recSource = source;
    recDiscard = false;
    recOffset = writeHead;
    recMax = want;
    sense->armRecord(pool + recOffset, recMax);
    DEBUG_PRINTF("CaptureStore: recording src %u, %lu samples\n", source, recMax);
    return true;
}

void CaptureStore::stopCapture() {
    if (recSense) recSense->stopRecord();
}

void CaptureStore::cancelCapture() {
    if (!recSense) return;
    recSense->stopRecord();
    recDiscard = true;
}

float CaptureStore::recordProgress() const {
    if (!recSense || !recMax) return 0.0f;
    return (float)recSense->recordedSamples() / recMax;
}

void CaptureStore::update() {
    if (!recSense || recSense->isRecording()) return;

    uint32_t len = recSense->recordedSamples();
    recSense = nullptr;
    if (recDiscard) {
        recDiscard = false;
        DEBUG_PRINTLN("CaptureStore: capture cancelled");
        return;
    }
    if (len < 2048) {   // < 50 ms: nothing worth keeping
        DEBUG_PRINTLN("CaptureStore: capture too short, dropped");
        return;
    }
    int slot = -1;
    for (int i = 0; i < CAPTURE_MAX; i++) if (!caps[i].used) { slot = i; break; }
    if (slot < 0) return;   // cannot happen: startCapture made room

    Capture& c = caps[slot];
    memset(&c, 0, sizeof(c));
    c.used = true;
    c.id = allocId();
    c.source = recSource;
    c.offset = recOffset;
    c.length = len;
    c.t_ms = millis();
    c.seq = ++seqCounter;
    writeHead = recOffset + len;
    analyze(c);
    changeCount++;
    DEBUG_PRINTF("CaptureStore: c%02u src %u %.2f s kind %u onsets %u pitch %.1f (%.2f)\n",
                 c.id, c.source, len / AUDIO_SAMPLE_RATE_EXACT, c.kind, c.onsetCount,
                 c.pitchHz, c.pitchConf);
}

// ============================================
// INVENTORY
// ============================================

int CaptureStore::count() const {
    int n = 0;
    for (int i = 0; i < CAPTURE_MAX; i++) if (caps[i].used) n++;
    return n;
}

const Capture* CaptureStore::findById(uint8_t id) const {
    if (id == 0) return nullptr;
    for (int i = 0; i < CAPTURE_MAX; i++) if (caps[i].used && caps[i].id == id) return &caps[i];
    return nullptr;
}

const Capture* CaptureStore::newest(int kind, int source) const {
    const Capture* best = nullptr;
    for (int i = 0; i < CAPTURE_MAX; i++) {
        const Capture& c = caps[i];
        if (!c.used) continue;
        if (kind >= 0 && c.kind != kind) continue;
        if (source >= 0 && c.source != source) continue;
        if (!best || c.seq > best->seq) best = &c;
    }
    return best;
}

bool CaptureStore::setRole(uint8_t id, uint8_t role) {
    for (int i = 0; i < CAPTURE_MAX; i++) {
        if (caps[i].used && caps[i].id == id) {
            if (caps[i].role != role) { caps[i].role = role; changeCount++; }
            return true;
        }
    }
    return false;
}

uint32_t CaptureStore::usedSamples() const {
    uint32_t n = 0;
    for (int i = 0; i < CAPTURE_MAX; i++) if (caps[i].used) n += caps[i].length;
    return n;
}

void CaptureStore::evictRange(uint32_t from, uint32_t to) {
    for (int i = 0; i < CAPTURE_MAX; i++) {
        if (!caps[i].used) continue;
        uint32_t a = caps[i].offset, b = caps[i].offset + caps[i].length;
        if (a < to && b > from) evictSlot(i);
    }
}

void CaptureStore::evictSlot(int slot) {
    uint8_t id = caps[slot].id;
    if (evictCB) evictCB(id);   // stop voices before the memory is reused
    caps[slot].used = false;
    changeCount++;
    DEBUG_PRINTF("CaptureStore: evicted c%02u\n", id);
}

uint8_t CaptureStore::allocId() {
    for (int tries = 0; tries < 255; tries++) {
        uint8_t id = nextId;
        nextId = nextId == 255 ? 1 : nextId + 1;
        if (!findById(id)) return id;
    }
    return 1;
}

// ============================================
// ANALYSIS
// ============================================

void CaptureStore::analyze(Capture& c) {
    const int16_t* x = pool + c.offset;
    const float fs = AUDIO_SAMPLE_RATE_EXACT;

    // Whole-capture RMS / peak
    double sum = 0;
    int peak = 0;
    for (uint32_t i = 0; i < c.length; i++) {
        int v = x[i];
        sum += (double)v * v;
        if (abs(v) > peak) peak = abs(v);
    }
    c.rms = sqrtf((float)(sum / c.length)) / 32768.0f;
    c.peak = peak / 32768.0f;

    // Onsets: 10 ms windows (detectOnsets, threshold x1.8, floor 0.02)
    const uint32_t win = (uint32_t)(fs * 0.01f);
    uint32_t loudestWin = 0;
    float loudest = 0, prev = 0;
    uint32_t found[64];
    int nFound = 0;
    for (uint32_t w = 0; (w + 1) * win <= c.length; w++) {
        float s = 0;
        for (uint32_t i = 0; i < win; i++) { float v = x[w * win + i] / 32768.0f; s += v * v; }
        float rms = sqrtf(s / win);
        if (rms > prev * 1.8f && rms > 0.02f && nFound < 64) found[nFound++] = w * win;
        if (rms > loudest) { loudest = rms; loudestWin = w; }
        prev = rms;
    }
    // Keep up to 16, evenly thinned (sampler.js autoSlice)
    int stride = (nFound + CAPTURE_MAX_ONSETS - 1) / CAPTURE_MAX_ONSETS;
    if (stride < 1) stride = 1;
    for (int i = 0; i < nFound && c.onsetCount < CAPTURE_MAX_ONSETS; i += stride) {
        c.onsets[c.onsetCount++] = found[i];
    }

    // Transient density: 50 ms windows (analyzeBuffer), per second
    const uint32_t fwin = (uint32_t)(fs * 0.05f);
    int transients = 0;
    prev = 0;
    for (uint32_t w = 0; (w + 1) * fwin <= c.length; w++) {
        float s = 0;
        for (uint32_t i = 0; i < fwin; i += 2) { float v = x[w * fwin + i] / 32768.0f; s += v * v; }
        float rms = sqrtf(s / (fwin / 2));
        if (rms > prev * 1.8f && rms > 0.02f) transients++;
        prev = rms;
    }
    c.transientDensity = transients / (c.length / fs);

    // Pitch: YIN-lite on the loudest ~93 ms (decimated to 22 kHz)
    static float buf[1024];
    static float d[512];
    uint32_t start = loudestWin * win;
    if (start + 2048 > c.length) start = c.length > 2048 ? c.length - 2048 : 0;
    int n = min((uint32_t)1024, (c.length - start) / 2);
    for (int j = 0; j < n; j++) buf[j] = (x[start + 2 * j] + x[start + 2 * j + 1]) * (1.0f / 65536.0f);
    for (int j = n; j < 1024; j++) buf[j] = 0;
    float conf = 0;
    c.pitchHz = (n == 1024) ? yinPitch(buf, 512, fs / 2, 60.0f, 1000.0f, d, &conf) : 0.0f;
    c.pitchConf = conf;

    // Kind and role
    float crest = c.rms > 1e-5f ? c.peak / c.rms : 0;
    if (c.transientDensity > 3.0f || (c.onsetCount >= 1 && crest > 6.0f)) c.kind = KIND_PERCUSSIVE;
    else if (c.pitchHz > 0 && c.pitchConf > 0.7f)                          c.kind = KIND_TONAL;
    else                                                                   c.kind = KIND_AMBIENT;
    c.role = c.kind == KIND_PERCUSSIVE ? ROLE_RHYTHM : (c.kind == KIND_TONAL ? ROLE_MELODY : ROLE_TEXTURE);
}
