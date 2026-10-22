/**
 * Oh My Ondas - AudioPlayCapture: plays a capture from memory (PSRAM or RAM)
 *
 * AudioStream with no inputs and one output. Two modes:
 *   one-shot: a slice [start, end) at a rate (1.0 = original pitch, linear
 *             interpolation), short fades at both ends against clicks; a
 *             retrigger fades the previous slice out on the second head
 *   grains:   two overlapping grain slots at random positions in the capture,
 *             triangle envelope; density 0..1 sets how often grains start
 * Control calls come from the main loop and are applied atomically.
 * stop() fades out over CAPTURE_FADE_SAMPLES; stopNow() cuts at once (use it
 * when the memory is about to be reused).
 */

#ifndef PLAY_CAPTURE_H
#define PLAY_CAPTURE_H

#include <Arduino.h>
#include <AudioStream.h>

#define CAPTURE_FADE_SAMPLES 64

class AudioPlayCapture : public AudioStream {
public:
    AudioPlayCapture();
    void update() override;

    void playSlice(const int16_t* data, uint32_t start, uint32_t end, float rate, float gain);
    void startGrains(const int16_t* data, uint32_t length, float density, float grainMs,
                     float rate, float gain);
    void setDensity(float d)  { density = constrain(d, 0.0f, 1.0f); }
    void setRate(float r);
    void setGain(float g)     { gain = constrain(g, 0.0f, 2.0f); }
    void stop();
    void stopNow();

    bool isPlaying() const    { return mode != MODE_IDLE; }
    bool isGrains() const     { return mode == MODE_GRAINS; }
    const int16_t* playingData() const { return data; }
    uint8_t tag;              // owner's id for what is playing (capture id), 0 = none

private:
    enum { MODE_IDLE = 0, MODE_ONESHOT, MODE_GRAINS };
    struct Head {
        const int16_t* src;   // what this head reads (heads may play different captures)
        uint64_t pos;         // 32.32 fixed point sample position
        uint64_t step;
        uint32_t start, end;  // slice bounds
        uint16_t fadeOut;     // > 0: fading out, samples left
        bool     active;
    };
    volatile uint8_t mode;
    const int16_t* volatile data;
    uint32_t length;
    uint64_t step;            // rate in 32.32
    volatile float gain;
    volatile float density;
    uint32_t grainLen;
    uint32_t nextGrainIn;     // samples until the next grain starts
    Head     heads[2];
    volatile bool stopping;   // fading out, no new grains
    uint32_t rng;

    uint32_t random32() { rng = rng * 1664525u + 1013904223u; return rng; }
    void     startGrain(Head& h);
    float    readHead(Head& h, bool triangle);
};

#endif // PLAY_CAPTURE_H
