/**
 * Oh My Ondas - AudioPlayCapture implementation (audio interrupt)
 */

#include "play_capture.h"

AudioPlayCapture::AudioPlayCapture()
    : AudioStream(0, NULL)
    , tag(0), mode(MODE_IDLE), data(nullptr), length(0)
    , step(1ULL << 32), gain(1.0f), density(0.5f)
    , grainLen(4410), nextGrainIn(0), stopping(false), rng(0x1234567)
{
    memset(heads, 0, sizeof(heads));
}

void AudioPlayCapture::playSlice(const int16_t* d, uint32_t start, uint32_t end, float rate, float g) {
    if (!d || end <= start + 2) return;
    uint64_t st = (uint64_t)(constrain(rate, 0.125f, 8.0f) * 4294967296.0f);
    __disable_irq();
    // Retrigger: the slice still sounding moves to head 1 and fades out
    if (mode == MODE_ONESHOT && heads[0].active) {
        heads[1] = heads[0];
        heads[1].fadeOut = CAPTURE_FADE_SAMPLES;
    } else {
        heads[1].active = false;
    }
    data = d;
    length = end;
    step = st;
    gain = g;
    heads[0].src = d;
    heads[0].pos = (uint64_t)start << 32;
    heads[0].step = st;
    heads[0].start = start;
    heads[0].end = end;
    heads[0].fadeOut = 0;
    heads[0].active = true;
    stopping = false;
    mode = MODE_ONESHOT;
    __enable_irq();
}

void AudioPlayCapture::startGrains(const int16_t* d, uint32_t len, float dens, float grainMs,
                                   float rate, float g) {
    if (!d || len < 512) return;
    __disable_irq();
    data = d;
    length = len;
    grainLen = constrain((uint32_t)(grainMs * AUDIO_SAMPLE_RATE_EXACT / 1000.0f), 256u, len / 2);
    step = (uint64_t)(constrain(rate, 0.125f, 8.0f) * 4294967296.0f);
    gain = g;
    density = constrain(dens, 0.0f, 1.0f);
    // Grains still sounding from before fade out instead of cutting
    for (int i = 0; i < 2; i++) if (heads[i].active) heads[i].fadeOut = CAPTURE_FADE_SAMPLES;
    nextGrainIn = CAPTURE_FADE_SAMPLES;
    stopping = false;
    mode = MODE_GRAINS;
    __enable_irq();
}

void AudioPlayCapture::setRate(float r) {
    uint64_t s = (uint64_t)(constrain(r, 0.125f, 8.0f) * 4294967296.0f);
    __disable_irq();
    step = s;
    __enable_irq();
}

void AudioPlayCapture::stop() {
    __disable_irq();
    if (mode != MODE_IDLE) {
        stopping = true;
        for (int i = 0; i < 2; i++) {
            if (heads[i].active && (heads[i].fadeOut == 0 || heads[i].fadeOut > CAPTURE_FADE_SAMPLES)) {
                heads[i].fadeOut = CAPTURE_FADE_SAMPLES;
            }
        }
    }
    tag = 0;
    __enable_irq();
}

void AudioPlayCapture::stopNow() {
    __disable_irq();
    mode = MODE_IDLE;
    heads[0].active = heads[1].active = false;
    data = nullptr;
    stopping = false;
    tag = 0;
    __enable_irq();
}

void AudioPlayCapture::startGrain(Head& h) {
    uint32_t span = (uint32_t)(((uint64_t)grainLen * step) >> 32) + 2;  // source samples one grain reads
    if (span >= length) span = length - 1;
    uint32_t s = random32() % (length - span);
    h.src = data;
    h.start = s;
    h.end = s + span;
    h.pos = (uint64_t)s << 32;
    h.step = step;
    h.fadeOut = 0;
    h.active = true;
}

// One output sample from a head; envelope = fades (one-shot) or triangle
// (grain), times the fade-out when the head is being retired
float AudioPlayCapture::readHead(Head& h, bool triangle) {
    uint32_t i = (uint32_t)(h.pos >> 32);
    if (i + 1 >= h.end) { h.active = false; return 0.0f; }
    float frac = (uint32_t)h.pos * (1.0f / 4294967296.0f);
    float s = h.src[i] + (h.src[i + 1] - h.src[i]) * frac;
    float env;
    uint32_t done = i - h.start, left = h.end - i;
    if (triangle) {
        float ph = (float)done / (h.end - h.start);
        env = 1.0f - fabsf(2.0f * ph - 1.0f);
    } else {
        env = 1.0f;
        if (done < CAPTURE_FADE_SAMPLES) env = done * (1.0f / CAPTURE_FADE_SAMPLES);
        if (left < CAPTURE_FADE_SAMPLES) env = min(env, left * (1.0f / CAPTURE_FADE_SAMPLES));
    }
    if (h.fadeOut) {
        env *= h.fadeOut * (1.0f / CAPTURE_FADE_SAMPLES);
        if (--h.fadeOut == 0) h.active = false;
    }
    h.pos += h.step;
    return s * env;
}

void AudioPlayCapture::update() {
    if (mode == MODE_IDLE || !data) return;   // no block: silence downstream
    audio_block_t* block = allocate();
    if (!block) return;

    const float g = gain;
    if (mode == MODE_GRAINS) {
        // Grain start interval: from half a grain (dense, overlapping) to 3 grains (sparse)
        uint32_t interval = (uint32_t)(grainLen * (0.5f + 2.5f * (1.0f - density)));
        for (int n = 0; n < AUDIO_BLOCK_SAMPLES; n++) {
            if (nextGrainIn == 0) {
                if (!stopping) {
                    Head& h = !heads[0].active ? heads[0] : heads[1];
                    if (!h.active) startGrain(h);
                }
                nextGrainIn = interval;
            } else {
                nextGrainIn--;
            }
            float v = 0;
            if (heads[0].active) v += readHead(heads[0], true);
            if (heads[1].active) v += readHead(heads[1], true);
            block->data[n] = (int16_t)constrain(v * g, -32767.0f, 32767.0f);
        }
    } else {
        for (int n = 0; n < AUDIO_BLOCK_SAMPLES; n++) {
            float v = 0;
            if (heads[0].active) v += readHead(heads[0], false);
            if (heads[1].active) v += readHead(heads[1], false);
            block->data[n] = (int16_t)constrain(v * g, -32767.0f, 32767.0f);
        }
    }
    if (!heads[0].active && !heads[1].active && (mode == MODE_ONESHOT || stopping)) {
        mode = MODE_IDLE;
        stopping = false;
        tag = 0;
    }
    transmit(block);
    release(block);
}
