/**
 * Oh My Ondas - AudioSense implementation (runs in the audio interrupt)
 */

#include "audio_sense.h"
#include <math.h>

AudioSense::AudioSense()
    : AudioStream(1, inputQueueArray)
    , ringCount(0), blockCount(0)
    , lp200(0), lp2k(0)
{
    for (int s = 0; s < SENSE_REC_SLOTS; s++) {
        rec[s].dst = nullptr; rec[s].max = 0; rec[s].pos = 0; rec[s].armed = false;
    }
    ring = (int16_t*)calloc(SENSE_RING_SAMPLES, sizeof(int16_t));
    blocks = (SenseBlock*)calloc(SENSE_BLOCK_RING, sizeof(SenseBlock));
    designBiquad(hp300, 300.0f, true);
    designBiquad(lp3400, 3400.0f, false);
    k200 = 1.0f - expf(-2.0f * PI * 200.0f / AUDIO_SAMPLE_RATE_EXACT);
    k2k  = 1.0f - expf(-2.0f * PI * 2000.0f / AUDIO_SAMPLE_RATE_EXACT);
}

// RBJ cookbook, Q = 0.707
void AudioSense::designBiquad(Biquad& q, float fc, bool highpass) {
    float w = 2.0f * PI * fc / AUDIO_SAMPLE_RATE_EXACT;
    float c = cosf(w), alpha = sinf(w) / (2.0f * 0.7071f);
    float a0 = 1.0f + alpha;
    if (highpass) {
        q.b0 = (1.0f + c) / 2.0f / a0; q.b1 = -(1.0f + c) / a0; q.b2 = q.b0;
    } else {
        q.b0 = (1.0f - c) / 2.0f / a0; q.b1 = (1.0f - c) / a0;  q.b2 = q.b0;
    }
    q.a1 = -2.0f * c / a0;
    q.a2 = (1.0f - alpha) / a0;
    q.x1 = q.x2 = q.y1 = q.y2 = 0.0f;
}

void AudioSense::update() {
    audio_block_t* block = receiveReadOnly(0);
    if (!ring || !blocks) {  // allocation failed: pass through as a no-op
        if (block) release(block);
        return;
    }
    static const int16_t silence[AUDIO_BLOCK_SAMPLES] = {0};
    const int16_t* data = block ? block->data : silence;

    // Ring copy (power-of-2 wrap)
    uint32_t pos = ringCount;
    for (int i = 0; i < AUDIO_BLOCK_SAMPLES; i++) {
        ring[(pos + i) & (SENSE_RING_SAMPLES - 1)] = data[i];
    }

    // Record copies
    for (int s = 0; s < SENSE_REC_SLOTS; s++) {
        RecSlot& r = rec[s];
        if (!r.armed || !r.dst) continue;
        uint32_t n = AUDIO_BLOCK_SAMPLES;
        if (r.pos + n > r.max) n = r.max - r.pos;
        memcpy(r.dst + r.pos, data, n * sizeof(int16_t));
        r.pos += n;
        if (r.pos >= r.max) r.armed = false;
    }

    // Block statistics
    float e = 0, es = 0, el = 0, em = 0, eh = 0;
    int peak = 0;
    for (int i = 0; i < AUDIO_BLOCK_SAMPLES; i++) {
        float x = data[i] * (1.0f / 32768.0f);
        int a = abs(data[i]);
        if (a > peak) peak = a;
        e += x * x;
        float s = runBiquad(lp3400, runBiquad(hp300, x));
        es += s * s;
        lp200 += k200 * (x - lp200);
        lp2k  += k2k * (x - lp2k);
        float mid = lp2k - lp200, high = x - lp2k;
        el += lp200 * lp200;
        em += mid * mid;
        eh += high * high;
    }
    const float inv = 1.0f / AUDIO_BLOCK_SAMPLES;
    SenseBlock& b = blocks[blockCount & (SENSE_BLOCK_RING - 1)];
    b.t_ms = millis();
    b.energy = e * inv;
    b.speech = es * inv;
    b.band[0] = el * inv;
    b.band[1] = em * inv;
    b.band[2] = eh * inv;
    b.peak = (int16_t)min(peak, 32767);

    ringCount = pos + AUDIO_BLOCK_SAMPLES;
    blockCount = blockCount + 1;
    if (block) release(block);
}

void AudioSense::copyLatest(int16_t* dst, uint32_t n) const {
    if (!ring) { memset(dst, 0, n * sizeof(int16_t)); return; }
    uint32_t end = ringCount;   // snapshot; the ISR writes past it, not inside
    uint32_t start = end - n;
    for (uint32_t i = 0; i < n; i++) dst[i] = ring[(start + i) & (SENSE_RING_SAMPLES - 1)];
}

bool AudioSense::getBlock(uint32_t index, SenseBlock& out) const {
    uint32_t count = blockCount;
    if (!blocks) return false;
    if (index >= count || count - index > SENSE_BLOCK_RING - 4) return false;
    out = blocks[index & (SENSE_BLOCK_RING - 1)];
    return true;
}

void AudioSense::armRecord(int16_t* dst, uint32_t maxSamples, int slot) {
    if (slot < 0 || slot >= SENSE_REC_SLOTS) return;
    __disable_irq();
    rec[slot].dst = dst;
    rec[slot].max = maxSamples;
    rec[slot].pos = 0;
    rec[slot].armed = (dst != nullptr && maxSamples > 0);
    __enable_irq();
}
