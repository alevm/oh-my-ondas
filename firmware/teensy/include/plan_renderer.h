/**
 * Oh My Ondas - Renderer: plays the captures in time (layer 1 + layer-2 plans)
 *
 * Driven by the sequencer's step tick (only while the transport runs). Three
 * capture voices, one per role (sampling_engine.h CAPVOICE_*):
 *   rhythm:  slices of a percussive capture on a 16-step mask
 *   texture: continuous grains of an ambient capture
 *   melody:  a tonal capture re-pitched to notes of the sensed scale
 *
 * Without a plan (layer 1 alone) the masks come from the continuous mapper:
 * Euclidean hits from MT_RHYTHM_DENSITY, probability MT_RHYTHM_PROB, onset or
 * even slicing from MT_SLICE_MODE, grain density MT_GRAIN_DENSITY, filters
 * MT_FILTER / MT_TEX_FILTER (+ MT_MOD_DEPTH wobble), level MT_DYNAMICS.
 * Captures are chosen by role (newest first).
 *
 * A layer-2 PLAN (common/link_protocol.h) is validated on arrival
 * (validatePlan), held pending, and applied at the first bar boundary at or
 * after starts_at_bar (the bar counter sent in MSG_PULSE; more than
 * PLAN_MAX_WAIT_BARS ahead = apply now). It lasts `bars` bars, then layer 1
 * alone carries on. Plan values are added on top of the mapper: track prob
 * plus the mapper's MT_RHYTHM_PROB modulation, texture density from->to over
 * the plan plus MT_GRAIN_DENSITY modulation; modulation tracks become mapper
 * plan routes. One track per role is used (later ones ignored).
 * Melody notes: a step plays if notes[step] != LINK_NOTE_NONE (note =
 * MELODY_BASE_NOTE + pitch + notes[step], snapped to the sensed scale when
 * flags bit 0 is set) or, for LINK_NOTE_NONE steps, if its bit is in the
 * steps mask (then a scale walk picks the note). duck_on = texture ducks
 * while the texture grains are sounding.
 *
 * Layer focus (MT_LAYER_FOCUS, from the compass heading): the three layers
 * sit at 0, 120 and 240 deg around the walker; the one ahead plays at full
 * level, the others down to 40 %. Gestures (main.ino) mute the layers and
 * step the melody layer through the captures (selectMelodyCapture).
 */

#ifndef PLAN_RENDERER_H
#define PLAN_RENDERER_H

#include <Arduino.h>
#include "config.h"
#include "system_state.h"
#include "link_protocol.h"

class CaptureStore;
class SamplingEngine;
class ContinuousMapper;
class Sequencer;
class MidiIO;
struct Capture;

#define PLAN_MAX_WAIT_BARS  32
#define PLAN_ROLES          3        // rhythm, texture, melody (modulation -> mapper)
#define MELODY_BASE_NOTE    60
#define RENDER_MAX_SLICE_MS 1500

// Plan validation results (LinkErr.code 3 = invalid plan; detail here)
enum PlanError : uint8_t {
    PLAN_OK = 0, PLAN_ERR_LENGTH, PLAN_ERR_TRACKS, PLAN_ERR_BARS, PLAN_ERR_BPM,
    PLAN_ERR_ROLE, PLAN_ERR_CAPTURE, PLAN_ERR_RANGE
};

class PlanRenderer {
public:
    PlanRenderer();

    void begin(CaptureStore* store, SamplingEngine* sampler, ContinuousMapper* mapper,
               Sequencer* seq, SystemState* state, MidiIO* midi);
    void onStep(int step);           // sequencer step tick
    void update();                   // every loop: texture voice, levels, filters

    PlanError validatePlan(const uint8_t* payload, int len) const;
    PlanError queuePlan(const uint8_t* payload, int len);   // validates, then pending

    bool     hasPlan() const         { return active.valid; }
    uint16_t activePlanId() const    { return active.valid ? active.id : 0; }
    uint16_t pendingPlanId() const   { return pending.valid ? pending.id : 0; }
    int      barsLeft() const;
    uint32_t plansApplied() const    { return appliedCount; }
    uint32_t plansRejected() const   { return rejectedCount; }
    uint8_t  lastError() const       { return lastErr; }

    void setLayersMuted(bool m)      { muted = m; }
    bool layersMuted() const         { return muted; }
    void selectMelodyCapture(int dir);    // layer 1 melody: previous / next capture by age
    uint8_t melodyOverride() const   { return melodyPick; }

private:
    struct Track {
        bool     on;
        uint8_t  captureId;
        uint16_t steps;
        float    prob;
        int8_t   pitch;
        float    densFrom, densTo;
        uint8_t  slice;              // 0 whole, 1 onsets, 2 even 16
        uint8_t  duckOn;             // role, 255 none
        uint8_t  flags;
        int8_t   notes[16];          // melody, LINK_NOTE_NONE = rest / use the mask
    };
    struct Plan {
        bool     valid;
        uint16_t id;
        uint16_t startBar;
        uint8_t  bars;
        uint16_t bpmX10;
        bool     follow;
        Track    tracks[PLAN_ROLES];
        LinkPlanTrack mods[4];
        uint8_t  nMods;
    };

    CaptureStore*     store;
    SamplingEngine*   sampler;
    ContinuousMapper* mapper;
    Sequencer*        seq;
    SystemState*      state;
    MidiIO*           midi;

    Plan     pending, active;
    uint32_t activeSinceBar;
    uint32_t appliedCount, rejectedCount;
    uint8_t  lastErr;

    uint8_t  hitCount[PLAN_ROLES];
    int      melodyDegree;
    unsigned long lastTrig[PLAN_ROLES];
    unsigned long lastUpdate;
    float    wobblePhase;
    bool     muted;
    uint8_t  melodyPick;             // capture id chosen by gesture, 0 = by role
    uint8_t  followBefore;

    float focusGain(int role) const;

    void startPlan(uint32_t bar);
    void endPlan();
    const Capture* captureFor(int role, const Track* t) const;
    void triggerRhythm(int step);
    void triggerMelody(int step);
    bool sliceBounds(const Capture& c, uint8_t mode, uint8_t hit, int step,
                     uint32_t& start, uint32_t& end) const;
    float duckGain(const Track* t) const;
    unsigned long stepMs() const;
    static uint16_t euclid(int hits);
};

#endif // PLAN_RENDERER_H
