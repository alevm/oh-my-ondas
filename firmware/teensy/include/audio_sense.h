/**
 * Oh My Ondas - AudioSense: analysis tap on one input channel
 *
 * An AudioStream with one input and no output. In the audio interrupt
 * (every 128-sample block, 2.9 ms) it:
 *   - copies the samples into a short ring (pitch) and, while armed, into
 *     up to SENSE_REC_SLOTS record buffers (PSRAM or RAM: slot 0 captures,
 *     slot 1 link clips), so recording does not depend on the main loop
 *     running on time (radio seek blocks it for seconds)
 *   - stores one SenseBlock per block: energy, peak, the energy in the
 *     300-3400 Hz speech band and in 3 bands (<200 Hz, 200-2k, >2 kHz) for
 *     spectral-flux onsets
 * The block ring holds ~1.5 s, so the loop may fall that far behind without
 * losing onsets. It releases each audio block at once (no AudioMemory held).
 * Cost: ~30 float ops per sample, well under 1 % CPU per channel.
 * Its ~23 KB of buffers are malloc'd (RAM2), not in RAM1.
 */

#ifndef AUDIO_SENSE_H
#define AUDIO_SENSE_H

#include <Arduino.h>
#include <AudioStream.h>

#define SENSE_RING_SAMPLES  4096   // power of 2, ~93 ms
#define SENSE_BLOCK_RING    512    // power of 2, ~1.49 s of blocks
#define SENSE_NUM_BANDS     3      // flux bands: low, mid, high
#define SENSE_REC_SLOTS     2      // 0 = captures, 1 = link clips

struct SenseBlock {
    uint32_t t_ms;                  // millis() when the block arrived
    float    energy;                // mean square, full scale = 1.0
    float    speech;                // mean square in 300-3400 Hz
    float    band[SENSE_NUM_BANDS]; // mean square: <200 Hz, 200-2k, >2 kHz
    int16_t  peak;                  // abs peak
};

class AudioSense : public AudioStream {
public:
    AudioSense();
    void update() override;

    // Sample ring
    uint32_t samplesWritten() const { return ringCount; }
    void     copyLatest(int16_t* dst, uint32_t n) const;   // n <= SENSE_RING_SAMPLES - 512

    // Block records (absolute index; false if already overwritten)
    uint32_t blocksWritten() const { return blockCount; }
    bool     getBlock(uint32_t index, SenseBlock& out) const;

    // Recording: copies every following sample into dst until maxSamples
    void     armRecord(int16_t* dst, uint32_t maxSamples, int slot = 0);
    void     stopRecord(int slot = 0)            { rec[slot].armed = false; }
    bool     isRecording(int slot = 0) const     { return rec[slot].armed; }
    uint32_t recordedSamples(int slot = 0) const { return rec[slot].pos; }

private:
    audio_block_t* inputQueueArray[1];

    int16_t*    ring;               // SENSE_RING_SAMPLES
    volatile uint32_t ringCount;
    SenseBlock* blocks;             // SENSE_BLOCK_RING
    volatile uint32_t blockCount;

    // Record targets
    struct RecSlot {
        int16_t* volatile dst;
        volatile uint32_t max;
        volatile uint32_t pos;
        volatile bool     armed;
    };
    RecSlot  rec[SENSE_REC_SLOTS];

    // Filter state: speech band = HP 300 Hz + LP 3400 Hz biquads (DF1),
    // flux bands from one-pole low-passes at 200 Hz and 2 kHz
    struct Biquad { float b0, b1, b2, a1, a2, x1, x2, y1, y2; };
    Biquad hp300, lp3400;
    float lp200, lp2k, k200, k2k;

    static void designBiquad(Biquad& q, float fc, bool highpass);
    static inline float runBiquad(Biquad& q, float x) {
        float y = q.b0 * x + q.b1 * q.x1 + q.b2 * q.x2 - q.a1 * q.y1 - q.a2 * q.y2;
        q.x2 = q.x1; q.x1 = x; q.y2 = q.y1; q.y1 = y;
        return y;
    }
};

#endif // AUDIO_SENSE_H
