/**
 * Oh My Ondas - Layer 1 feature extraction implementation
 * See feature_extractor.h. Everything here runs in the main loop; the
 * per-sample work is in AudioSense (audio interrupt).
 */

#include "feature_extractor.h"
#include <math.h>

static const float BIN_HZ     = AUDIO_SAMPLE_RATE_EXACT / 1024.0f;   // FFT1024
static const float FLUX_RATE  = AUDIO_SAMPLE_RATE_EXACT / (AUDIO_BLOCK_SAMPLES * ONSET_FRAME_BLOCKS);  // ~86 Hz
static const int   TOP_BIN    = 371;                                 // ~16 kHz

static inline float clamp01(float x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }
static inline float smoothstep(float lo, float hi, float x) {
    float t = clamp01((x - lo) / (hi - lo));
    return t * t * (3.0f - 2.0f * t);
}
static inline float toDb(float power) {
    float db = 10.0f * log10f(power + 1e-13f);
    return db < -128.0f ? -128.0f : (db > 0.0f ? 0.0f : db);
}

FeatureExtractor::FeatureExtractor()
    : senseL(nullptr), senseR(nullptr), fft(nullptr)
    , leftSource(LEFT_SRC_MIC)
    , frames(0), lastFrame(0), lastPulse(0)
    , frameMicros(0), frameMicrosMax(0), lostBlocks(0)
    , pulseEnv(nullptr), pulseCount(0), pulseScratch(nullptr)
    , pulseBpm(0), pulseConf(0), lastBeatMs(0)
    , pitchRaw(nullptr), pitchBuf(nullptr), yinD(nullptr)
    , onsetHead(0), onsetTail(0)
{
    memset(&feat, 0, sizeof(feat));
    memset(&radioFeat, 0, sizeof(radioFeat));
    memset(&chL, 0, sizeof(chL));
    memset(&chR, 0, sizeof(chR));
}

void FeatureExtractor::begin(AudioSense* left, AudioSense* right, AudioAnalyzeFFT1024* fftLeft) {
    pulseEnv     = (float*)calloc(PULSE_FRAMES, sizeof(float));
    pulseScratch = (float*)calloc(PULSE_FRAMES, sizeof(float));
    pitchRaw     = (int16_t*)calloc(PITCH_WINDOW * 2 * PITCH_DECIM, sizeof(int16_t));
    pitchBuf     = (float*)calloc(PITCH_WINDOW * 2, sizeof(float));
    yinD         = (float*)calloc(PITCH_WINDOW, sizeof(float));
    if (!pulseEnv || !pulseScratch || !pitchRaw || !pitchBuf || !yinD) {
        DEBUG_PRINTLN("FeatureExtractor: out of memory, disabled");
        return;   // senseL stays null: update() is a no-op
    }
    senseL = left;
    senseR = right;
    fft = fftLeft;
    chL.sense = left;  chL.source = leftSource;
    chR.sense = right; chR.source = RIGHT_SRC_RADIO;
    for (Channel* ch : {&chL, &chR}) {
        for (int b = 0; b < SENSE_NUM_BANDS; b++) ch->prevLog[b] = -10.0f;
        ch->fluxVar = 0.01f;
        ch->nextBlock = ch->sense ? ch->sense->blocksWritten() : 0;
    }
    for (int i = 0; i < SPEECH_FRAMES; i++) {
        hann[i] = 0.5f - 0.5f * cosf(2.0f * PI * i / (SPEECH_FRAMES - 1));
    }
    initTables();
    DEBUG_PRINTLN("FeatureExtractor: Ready");
}

// 32 log-spaced bands 40 Hz..16 kHz over the FFT1024 bins (43 Hz wide):
// the lowest bands are narrower than one bin and reuse the nearest bin.
// Chroma: bins 100 Hz..5 kHz to the nearest pitch class (C = 0).
void FeatureExtractor::initTables() {
    memset(bandOfBin, 255, sizeof(bandOfBin));
    const float ratio = FEAT_BAND_HI_HZ / FEAT_BAND_LO_HZ;
    for (int b = 0; b < FEAT_NUM_BANDS; b++) {
        float lo = FEAT_BAND_LO_HZ * powf(ratio, (float)b / FEAT_NUM_BANDS);
        float hi = FEAT_BAND_LO_HZ * powf(ratio, (float)(b + 1) / FEAT_NUM_BANDS);
        int binLo = (int)ceilf(lo / BIN_HZ);
        int binHi = (int)ceilf(hi / BIN_HZ) - 1;
        if (binHi < binLo) {  // no bin centre inside: nearest bin to the band centre
            binLo = binHi = constrain((int)lroundf(sqrtf(lo * hi) / BIN_HZ), 1, TOP_BIN);
        }
        bandLo[b] = constrain(binLo, 1, TOP_BIN);
        bandHi[b] = constrain(binHi, 1, TOP_BIN);
        for (int i = bandLo[b]; i <= bandHi[b]; i++) bandOfBin[i] = b;
    }
    for (int i = 0; i < 512; i++) {
        float f = i * BIN_HZ;
        if (f < 100.0f || f > 5000.0f) { pcOfBin[i] = 255; continue; }
        int midi = (int)lroundf(69.0f + 12.0f * log2f(f / 440.0f));
        pcOfBin[i] = (uint8_t)(midi % 12);
    }
}

void FeatureExtractor::update() {
    if (!senseL) return;
    processChannel(chL);
    if (senseR) processChannel(chR);

    unsigned long now = millis();
    if (now - lastFrame < FEAT_PERIOD_MS) return;
    lastFrame = now;
    uint32_t t0 = micros();

    // ── Left: mic or piezo ──
    feat.t_ms = now;
    feat.source = leftSource;
    chL.source = leftSource;
    float e = chL.frameEnergyN ? chL.frameEnergySum / chL.frameEnergyN : 0.0f;
    chL.frameEnergySum = 0; chL.frameEnergyN = 0;
    feat.rms = sqrtf(e);
    feat.rmsDb = toDb(e);
    computeSpectrum();
    if (feat.rmsDb > -55.0f) {
        computePitch();
    } else {
        feat.pitchHz = 0; feat.pitchConf = 0;
    }
    feat.onsets = chL.onsetsSinceFrame;
    chL.onsetsSinceFrame = 0;
    chL.onsetRate += 0.1f * (feat.onsets * (1000.0f / FEAT_PERIOD_MS) - chL.onsetRate);
    feat.onsetRate = chL.onsetRate;
    chL.speech += 0.3f * (speechLikelihood(chL) - chL.speech);
    feat.speech = chL.speech;

    // ── Pulse: every second ──
    if (now - lastPulse >= 1000) {
        lastPulse = now;
        computePulse();
    }
    feat.bpm = pulseBpm;
    feat.bpmConf = pulseConf;
    if (pulseBpm > 0) {
        unsigned long period = (unsigned long)(60000.0f / pulseBpm);
        feat.phaseMs = (uint16_t)((now - lastBeatMs) % period);
    } else {
        feat.phaseMs = 0;
    }

    // ── Right: radio ──
    float er = chR.frameEnergyN ? chR.frameEnergySum / chR.frameEnergyN : 0.0f;
    chR.frameEnergySum = 0; chR.frameEnergyN = 0;
    radioFeat.rms = sqrtf(er);
    radioFeat.rmsDb = toDb(er);
    radioFeat.onsets = chR.onsetsSinceFrame;
    chR.onsetsSinceFrame = 0;
    chR.onsetRate += 0.1f * (radioFeat.onsets * (1000.0f / FEAT_PERIOD_MS) - chR.onsetRate);
    radioFeat.onsetRate = chR.onsetRate;
    chR.speech += 0.3f * (speechLikelihood(chR) - chR.speech);
    radioFeat.speech = chR.speech;

    frames++;
    frameMicros = micros() - t0;
    if (frameMicros > frameMicrosMax) frameMicrosMax = frameMicros;
}

// ============================================
// ONSETS (spectral flux on the AudioSense bands)
// ============================================

void FeatureExtractor::processChannel(Channel& ch) {
    if (!ch.sense) return;
    uint32_t written = ch.sense->blocksWritten();
    SenseBlock blk;
    while (ch.nextBlock < written) {
        if (!ch.sense->getBlock(ch.nextBlock, blk)) {
            // Loop fell more than ~1.5 s behind: skip to recent blocks
            uint32_t resume = written - SENSE_BLOCK_RING / 2;
            lostBlocks += resume - ch.nextBlock;
            ch.nextBlock = resume;
            ch.blkInFrame = 0;
            ch.accE = ch.accS = 0;
            for (int b = 0; b < SENSE_NUM_BANDS; b++) ch.accBand[b] = 0;
            continue;
        }
        ch.nextBlock++;
        ch.accE += blk.energy;
        ch.accS += blk.speech;
        for (int b = 0; b < SENSE_NUM_BANDS; b++) ch.accBand[b] += blk.band[b];
        if (++ch.blkInFrame >= ONSET_FRAME_BLOCKS) pushFluxFrame(ch, blk.t_ms);
    }
}

void FeatureExtractor::pushFluxFrame(Channel& ch, uint32_t t_ms) {
    const float inv = 1.0f / ONSET_FRAME_BLOCKS;
    float energy = ch.accE * inv;
    float sp = ch.accS * inv;

    // Half-wave rectified rise of log energy, summed over the 3 bands
    float flux = 0, domRise = -1;
    uint8_t dom = 0;
    for (int b = 0; b < SENSE_NUM_BANDS; b++) {
        float lg = log10f(ch.accBand[b] * inv + 1e-10f);
        float rise = lg - ch.prevLog[b];
        if (rise > 0) {
            flux += rise;
            if (rise > domRise) { domRise = rise; dom = b; }
        }
        ch.prevLog[b] = lg;
        ch.accBand[b] = 0;
    }
    if (energy < 1e-7f) flux = 0;  // below -70 dBFS: noise floor, no onsets
    ch.accE = ch.accS = 0;
    ch.blkInFrame = 0;

    // Peak picking on the middle frame of three
    ch.flux[0] = ch.flux[1];   ch.flux[1] = ch.flux[2];   ch.flux[2] = flux;
    ch.fluxT[0] = ch.fluxT[1]; ch.fluxT[1] = ch.fluxT[2]; ch.fluxT[2] = t_ms;
    ch.fluxDom[0] = ch.fluxDom[1]; ch.fluxDom[1] = ch.fluxDom[2]; ch.fluxDom[2] = dom;
    float sd = sqrtf(ch.fluxVar);
    float thr = ch.fluxMean + ONSET_THRESH_K * sd + ONSET_FLOOR;
    if (ch.flux[1] > thr && ch.flux[1] >= ch.flux[0] && ch.flux[1] >= ch.flux[2] &&
        ch.fluxT[1] - ch.lastOnsetMs >= ONSET_REFRACTORY_MS) {
        float strength = clamp01((ch.flux[1] - ch.fluxMean) / (4.0f * sd + ONSET_FLOOR + 1e-6f));
        emitOnset(ch, ch.fluxT[1], strength, ch.fluxDom[1]);
    }

    // Adaptive threshold statistics (~0.6 s), outliers clipped so one hit
    // does not raise the threshold for the next
    float x = min(flux, ch.fluxMean + 4.0f * sd + ONSET_FLOOR);
    const float a = 0.02f;
    float dlt = x - ch.fluxMean;
    ch.fluxMean += a * dlt;
    ch.fluxVar += a * (dlt * dlt - ch.fluxVar);

    // Pulse envelope (left only)
    if (&ch == &chL) {
        pulseEnv[pulseCount % PULSE_FRAMES] = flux;
        pulseCount++;
    }

    // Speech envelope
    uint32_t si = ch.spCount % SPEECH_FRAMES;
    ch.spEnv[si] = sqrtf(sp);
    ch.spE[si] = sp;
    ch.totE[si] = energy;
    ch.spCount++;

    ch.frameEnergySum += energy;
    ch.frameEnergyN++;
}

void FeatureExtractor::emitOnset(Channel& ch, uint32_t t_ms, float strength, uint8_t fluxBand) {
    ch.lastOnsetMs = t_ms;
    if (ch.onsetsSinceFrame < 255) ch.onsetsSinceFrame++;

    OnsetEvent& ev = onsetQ[onsetHead];
    ev.t_ms = t_ms;
    ev.source = ch.source;
    ev.strength = (uint8_t)(strength * 255.0f);
    // Left: the loudest FFT band now; right (no FFT): centre of the flux band
    static const uint8_t FLUX_BAND_TO_BAND[SENSE_NUM_BANDS] = {5, 17, 27};
    ev.band = (&ch == &chL && fft) ? dominantBand() : FLUX_BAND_TO_BAND[fluxBand];
    onsetHead = (onsetHead + 1) % ONSET_QUEUE_LEN;
    if (onsetHead == onsetTail) onsetTail = (onsetTail + 1) % ONSET_QUEUE_LEN;  // drop oldest
}

bool FeatureExtractor::popOnset(OnsetEvent& ev) {
    if (onsetTail == onsetHead) return false;
    ev = onsetQ[onsetTail];
    onsetTail = (onsetTail + 1) % ONSET_QUEUE_LEN;
    return true;
}

uint8_t FeatureExtractor::dominantBand() const {
    uint16_t best = 0;
    int bin = 1;
    for (int i = 1; i <= TOP_BIN; i++) {
        if (fft->output[i] > best) { best = fft->output[i]; bin = i; }
    }
    uint8_t b = bandOfBin[bin];
    return b == 255 ? 0 : b;
}

// ============================================
// SPEECH LIKELIHOOD
// ============================================

// Speech: most energy in 300-3400 Hz, and that band's envelope modulated at
// the syllable rate (3-8 Hz) with deep dips between syllables. Music tends
// to a steadier envelope or modulation outside 3-8 Hz; traffic and wind lack
// the band share. Rough by design: it only has to gate mic clips.
float FeatureExtractor::speechLikelihood(Channel& ch) const {
    uint32_t n = min(ch.spCount, (uint32_t)SPEECH_FRAMES);
    ch.mod = 0.0f;
    if (n < SPEECH_FRAMES) return 0.0f;
    uint32_t start = ch.spCount - n;

    float mean = 0, sumSp = 0, sumTot = 0;
    for (uint32_t i = 0; i < n; i++) {
        uint32_t k = (start + i) % SPEECH_FRAMES;
        mean += ch.spEnv[k];
        sumSp += ch.spE[k];
        sumTot += ch.totE[k];
    }
    mean /= n;
    float levelDb = 10.0f * log10f(sumSp / n + 1e-13f);
    float gate = smoothstep(-60.0f, -45.0f, levelDb);
    if (gate <= 0.0f || mean <= 0.0f) return 0.0f;

    float var = 0;
    for (uint32_t i = 0; i < n; i++) {
        float d = ch.spEnv[(start + i) % SPEECH_FRAMES] - mean;
        var += d * d;
    }
    float depth = sqrtf(var / n) / mean;

    // Goertzel at 1..16 Hz over the Hann-windowed envelope
    float pIn = 0, pAll = 1e-12f;
    for (int f = 1; f <= 16; f++) {
        float coeff = 2.0f * cosf(2.0f * PI * f / FLUX_RATE);
        float s1 = 0, s2 = 0;
        for (uint32_t i = 0; i < n; i++) {
            float x = (ch.spEnv[(start + i) % SPEECH_FRAMES] - mean) * hann[i];
            float s0 = x + coeff * s1 - s2;
            s2 = s1; s1 = s0;
        }
        float p = s1 * s1 + s2 * s2 - coeff * s1 * s2;
        pAll += p;
        if (f >= 3 && f <= 8) pIn += p;
    }
    float m = pIn / pAll;
    ch.mod = m * gate;
    float share = sumSp / (sumTot + 1e-13f);

    float ms = 1.0f / (1.0f + expf(-12.0f * (m - 0.5f)));
    float bs = smoothstep(0.4f, 0.8f, share);
    float ds = smoothstep(0.25f, 0.65f, depth);
    return ms * bs * (0.4f + 0.6f * ds) * gate;
}

// ============================================
// SPECTRUM (FFT1024 on LINE-IN L)
// ============================================

void FeatureExtractor::computeSpectrum() {
    if (!fft) return;
    static float pw[TOP_BIN + 1];
    float sumA = 0, sumFA = 0, sumP = 0, sumLog = 0;
    for (int i = 1; i <= TOP_BIN; i++) {
        float a = fft->output[i] * (1.0f / 16384.0f);
        pw[i] = a * a * FFT_POWER_SCALE;
        sumA += a;
        sumFA += a * i * BIN_HZ;
        if (i >= 2) { sumP += pw[i]; sumLog += logf(pw[i] + 1e-12f); }
    }
    for (int b = 0; b < FEAT_NUM_BANDS; b++) {
        float p = 0;
        for (int i = bandLo[b]; i <= bandHi[b]; i++) p += pw[i];
        feat.bandsDb[b] = toDb(p);
    }
    feat.centroidHz = sumA > 1e-6f ? sumFA / sumA : 0.0f;
    const int nFlat = TOP_BIN - 1;
    float arith = sumP / nFlat;
    feat.flatness = arith > 1e-12f ? clamp01(expf(sumLog / nFlat) / arith) : 1.0f;

    float maxC = 0;
    for (int c = 0; c < 12; c++) feat.chroma[c] = 0;
    for (int i = 1; i <= TOP_BIN; i++) {
        if (pcOfBin[i] != 255) feat.chroma[pcOfBin[i]] += pw[i];
    }
    for (int c = 0; c < 12; c++) maxC = max(maxC, feat.chroma[c]);
    for (int c = 0; c < 12; c++) feat.chroma[c] = maxC > 1e-12f ? feat.chroma[c] / maxC : 0.0f;
}

// ============================================
// PITCH (YIN-lite on the last ~93 ms of LINE-IN L)
// ============================================

void FeatureExtractor::computePitch() {
    const int nRaw = PITCH_WINDOW * 2 * PITCH_DECIM;
    const float fs = AUDIO_SAMPLE_RATE_EXACT / PITCH_DECIM;
    senseL->copyLatest(pitchRaw, nRaw);
    for (int j = 0; j < PITCH_WINDOW * 2; j++) {
        pitchBuf[j] = (pitchRaw[2 * j] + pitchRaw[2 * j + 1]) * (1.0f / 65536.0f);
    }
    float conf = 0;
    feat.pitchHz = yinPitch(pitchBuf, PITCH_WINDOW, fs, PITCH_MIN_HZ, PITCH_MAX_HZ, yinD, &conf);
    feat.pitchConf = conf;
}

float yinPitch(const float* x, int window, float fs, float minHz, float maxHz,
               float* d, float* confOut) {
    const int tauMin = max(2, (int)(fs / maxHz));
    const int tauMax = min((int)(fs / minHz), window - 2);
    *confOut = 0;
    if (tauMax <= tauMin + 2) return 0;

    // Cumulative mean normalised difference
    float running = 0;
    d[0] = 1.0f;
    for (int tau = 1; tau <= tauMax; tau++) {
        float s = 0;
        for (int j = 0; j < window; j++) {
            float v = x[j] - x[j + tau];
            s += v * v;
        }
        running += s;
        d[tau] = running > 0 ? s * tau / running : 1.0f;
    }

    int best = -1;
    for (int tau = tauMin; tau <= tauMax; tau++) {
        if (d[tau] < 0.15f) {
            while (tau + 1 <= tauMax && d[tau + 1] < d[tau]) tau++;
            best = tau;
            break;
        }
    }
    if (best < 0) {  // no dip under the threshold: global minimum
        best = tauMin;
        for (int tau = tauMin; tau <= tauMax; tau++) if (d[tau] < d[best]) best = tau;
    }
    *confOut = clamp01(1.0f - d[best]);
    if (d[best] > 0.5f) return 0;
    // Parabolic interpolation
    float tauF = best;
    if (best > tauMin && best < tauMax) {
        float a = d[best - 1], b = d[best], c = d[best + 1];
        float den = a - 2 * b + c;
        if (fabsf(den) > 1e-9f) tauF = best + 0.5f * (a - c) / den;
    }
    return fs / tauF;
}

// ============================================
// PULSE (autocorrelation of the onset flux over ~6 s)
// ============================================

void FeatureExtractor::computePulse() {
    uint32_t n = min(pulseCount, (uint32_t)PULSE_FRAMES);
    if (n < PULSE_FRAMES / 2) { pulseBpm = 0; pulseConf = 0; return; }
    uint32_t start = pulseCount - n;
    float mean = 0;
    for (uint32_t i = 0; i < n; i++) {
        pulseScratch[i] = pulseEnv[(start + i) % PULSE_FRAMES];
        mean += pulseScratch[i];
    }
    mean /= n;
    float r0 = 0;
    for (uint32_t i = 0; i < n; i++) { pulseScratch[i] -= mean; r0 += pulseScratch[i] * pulseScratch[i]; }
    if (r0 < 1e-6f) { pulseConf *= 0.5f; return; }

    const int lagMin = (int)(FLUX_RATE * 60.0f / PULSE_MAX_BPM);
    const int lagMax = (int)ceilf(FLUX_RATE * 60.0f / PULSE_MIN_BPM);
    static float r[128];
    int bestLag = lagMin;
    float bestW = -1e9f;
    for (int lag = lagMin; lag <= lagMax && lag < 127; lag++) {
        float s = 0;
        for (uint32_t i = lag; i < n; i++) s += pulseScratch[i] * pulseScratch[i - lag];
        r[lag] = s * n / (n - lag);
        // Mild preference for ~120 BPM against octave errors
        float bpm = 60.0f * FLUX_RATE / lag;
        float oct = log2f(bpm / 120.0f);
        float w = r[lag] * (0.7f + 0.3f * expf(-0.5f * oct * oct / 0.36f));
        if (w > bestW) { bestW = w; bestLag = lag; }
    }
    float lagF = bestLag;
    if (bestLag > lagMin && bestLag < lagMax && bestLag < 126) {
        float a = r[bestLag - 1], b = r[bestLag], c = r[bestLag + 1];
        float den = a - 2 * b + c;
        if (fabsf(den) > 1e-9f) lagF = bestLag + 0.5f * (a - c) / den;
    }
    float conf = clamp01((r[bestLag] / r0 - 0.1f) / 0.5f);
    float bpm = 60.0f * FLUX_RATE / lagF;

    if (conf < 0.15f) {
        pulseConf += 0.5f * (conf - pulseConf);
        return;
    }
    if (pulseBpm > 0 && fabsf(bpm - pulseBpm) / pulseBpm < 0.08f) pulseBpm += 0.4f * (bpm - pulseBpm);
    else pulseBpm = bpm;
    pulseConf += 0.5f * (conf - pulseConf);

    // Phase: comb over the last 4 periods; the best offset is the time since the last beat
    int lagI = (int)lroundf(lagF);
    int bestO = 0;
    float bestS = -1e9f;
    for (int o = 0; o < lagI; o++) {
        float s = 0;
        for (int k = 0; k < 4; k++) {
            int idx = (int)n - 1 - o - k * lagI;
            if (idx >= 0) s += pulseScratch[idx];
        }
        if (s > bestS) { bestS = s; bestO = o; }
    }
    lastBeatMs = millis() - (unsigned long)(bestO * 1000.0f / FLUX_RATE);
}
