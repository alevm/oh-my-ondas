/**
 * Oh My Ondas - USB MIDI implementation
 */

#include "midi_io.h"

#if defined(MIDI_INTERFACE)
#define HAVE_USB_MIDI 1
#else
#define HAVE_USB_MIDI 0
#endif

MidiIO::MidiIO()
    : transportCB(nullptr), tempoCB(nullptr), positionCB(nullptr)
    , clockLocked(false), clockBpm(0.0f)
    , windowTicks(0), windowStart(0), lastTick(0), rxCount(0)
{
    memset(lastCC, 0xFF, sizeof(lastCC));
}

void MidiIO::begin() {
    DEBUG_PRINTLN(HAVE_USB_MIDI ? "MidiIO: USB MIDI ready" : "MidiIO: no USB MIDI in this USB type");
}

void MidiIO::update() {
#if HAVE_USB_MIDI
    unsigned long now = millis();
    // Bounded: a flood of messages cannot stall the loop
    for (int i = 0; i < 64 && usbMIDI.read(); i++) {
        rxCount++;
        switch (usbMIDI.getType()) {
            case usbMIDI.Clock:    onClockTick(now); break;
            case usbMIDI.Start:    if (transportCB) transportCB(MIDI_T_START);    break;
            case usbMIDI.Continue: if (transportCB) transportCB(MIDI_T_CONTINUE); break;
            case usbMIDI.Stop:     if (transportCB) transportCB(MIDI_T_STOP);     break;
            case usbMIDI.SongPosition:   // 14-bit count of MIDI beats (16th notes)
                if (positionCB) positionCB(usbMIDI.getData1() | (usbMIDI.getData2() << 7));
                break;
            default: break;  // notes / CC in: not mapped yet
        }
    }
    if (clockLocked && now - lastTick > MIDI_CLOCK_TIMEOUT_MS) {
        clockLocked = false;
        windowTicks = 0;
        DEBUG_PRINTLN("MidiIO: clock lost");
    }
#endif
}

// Ticks are timestamped in loop context (jitter of a few ms), so the tempo is
// taken from the tick count over a ~1 s window rather than tick to tick.
void MidiIO::onClockTick(unsigned long now) {
    lastTick = now;
    if (windowTicks == 0) windowStart = now;
    windowTicks++;
    unsigned long span = now - windowStart;
    if (span >= MIDI_CLOCK_WINDOW_MS && windowTicks > 24) {
        float bpm = (windowTicks - 1) * 60000.0f / (24.0f * span);
        if (bpm >= 40.0f && bpm <= 300.0f) {
            clockBpm = clockLocked ? clockBpm * 0.5f + bpm * 0.5f : bpm;
            clockLocked = true;
            if (tempoCB) tempoCB(clockBpm);
        }
        windowTicks = 1;
        windowStart = now;
    }
}

void MidiIO::sendPad(int pad, bool on, float velocity) {
#if HAVE_USB_MIDI
    uint8_t note = MIDI_PAD_NOTE_BASE + pad;
    if (on) usbMIDI.sendNoteOn(note, (uint8_t)constrain(velocity * 127.0f, 1.0f, 127.0f), MIDI_CHANNEL);
    else    usbMIDI.sendNoteOff(note, 0, MIDI_CHANNEL);
    usbMIDI.send_now();
#else
    (void)pad; (void)on; (void)velocity;
#endif
}

void MidiIO::sendFader(int fader, float value) {
#if HAVE_USB_MIDI
    if (fader < 0 || fader >= TOTAL_FADERS) return;
    uint8_t v = (uint8_t)constrain(value * 127.0f + 0.5f, 0.0f, 127.0f);
    if (v == lastCC[fader]) return;  // faders report at 1 % steps; CC is 0..127
    lastCC[fader] = v;
    usbMIDI.sendControlChange(MIDI_FADER_CC_BASE + fader, v, MIDI_CHANNEL);
    usbMIDI.send_now();
#else
    (void)fader; (void)value;
#endif
}
