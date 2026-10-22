/**
 * Oh My Ondas - USB MIDI (USB type MIDI + audio + serial)
 *
 * In: incoming usbMIDI is drained every loop (never blocks). MIDI clock
 * (24 ppq) sets the tempo while it runs; Start (from step 1), Continue
 * (from where it is), Stop and Song Position drive the transport. Out: pads as notes (MIDI_PAD_NOTE_BASE + pad), faders as CC.
 * Without a MIDI USB type every call is a no-op.
 */

#ifndef MIDI_IO_H
#define MIDI_IO_H

#include <Arduino.h>
#include "config.h"

#define MIDI_CHANNEL        1
#define MIDI_PAD_NOTE_BASE  36     // pad 0 = C2 (GM kick)
#define MIDI_FADER_CC_BASE  20     // fader 0 = CC 20 .. fader 4 = CC 24
#define MIDI_CLOCK_WINDOW_MS 1000  // tempo measured over this many ms of ticks
#define MIDI_CLOCK_TIMEOUT_MS 500  // no tick for this long: clock lost

enum MidiTransport : uint8_t { MIDI_T_START = 0, MIDI_T_CONTINUE, MIDI_T_STOP };
typedef void (*MidiTransportCallback)(MidiTransport cmd);
typedef void (*MidiPositionCallback)(uint16_t sixteenths);   // Song Position, in 16th notes
typedef void (*MidiTempoCallback)(float bpm);

class MidiIO {
public:
    MidiIO();

    void begin();
    void update();                      // drain incoming messages (bounded per call)

    void setTransportCallback(MidiTransportCallback cb) { transportCB = cb; }
    void setTempoCallback(MidiTempoCallback cb)         { tempoCB = cb; }
    void setPositionCallback(MidiPositionCallback cb)   { positionCB = cb; }

    void sendPad(int pad, bool on, float velocity);
    void sendFader(int fader, float value);

    bool  isClockLocked() const { return clockLocked; }
    float getClockBpm() const   { return clockBpm; }
    uint32_t getRxCount() const { return rxCount; }

private:
    MidiTransportCallback transportCB;
    MidiTempoCallback     tempoCB;
    MidiPositionCallback  positionCB;
    bool     clockLocked;
    float    clockBpm;
    uint32_t windowTicks;
    unsigned long windowStart;
    unsigned long lastTick;
    uint32_t rxCount;
    uint8_t  lastCC[TOTAL_FADERS];

    void onClockTick(unsigned long now);
};

#endif // MIDI_IO_H
