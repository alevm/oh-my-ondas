/**
 * Oh My Ondas - Continuous mapper (layer 1: sensed features -> parameters)
 *
 * No presets, no categories: every feature frame (10 Hz) each target is
 *   value = base + sum over routes of depth * (curve(source) - center)
 * in a normalised 0..1 space, smoothed per target, then scaled to the
 * target's physical range and written through the existing APIs
 * (sequencer, synth voice, FX engine, capture voices via the renderer).
 *
 * User input wins: turning a control that owns a target sets its base
 * (userSet) and holds the routes off for MAPPER_USER_HOLD_MS, then fades
 * them back in over MAPPER_USER_RAMP_MS. The mapper then modulates around
 * the user's value. A target with no route of non-zero depth is never
 * written, so it cannot fight a control.
 *
 * Routes are data (DEFAULT_ROUTES in continuous_mapper.cpp) and can be
 * changed at run time (setRoute); layer-2 plans add up to MAPPER_PLAN_ROUTES
 * more (modulation tracks), cleared when the plan ends.
 *
 * Chroma -> scale: the 12-bin chroma is smoothed over a few seconds; the 5
 * strongest pitch classes form the scale, the strongest is the root
 * (getScaleMask / getRoot), used to snap melody notes.
 * Tempo: follow mode OFF / PULSE / WALK. PULSE: when the pulse confidence
 * is high, the BPM glides to the sensed pulse; WALK: to the walking cadence
 * (one step = one beat), and while standing the music settles (the
 * ROUTE_WALK_ONLY route takes capture density down slowly). Never while
 * the user or MIDI clock owns the tempo. Folded into 70-150 BPM.
 *
 * Defaults (user decision, staged bring-up): only onset density -> capture
 * density, centroid -> filter, heading -> forward capture layer, and the
 * tempo follow are active. Every other route is in the table at depth 0.
 */

#ifndef CONTINUOUS_MAPPER_H
#define CONTINUOUS_MAPPER_H

#include <Arduino.h>
#include "config.h"
#include "system_state.h"

class FeatureExtractor;
class Sequencer;
class SynthVoice;
class FXEngine;
class Radio;
class MidiIO;
class MotionSensors;
class EspLink;

#define MAPPER_MAX_ROUTES     32
#define MAPPER_PLAN_ROUTES    4
#define MAPPER_USER_HOLD_MS   3000
#define MAPPER_USER_RAMP_MS   4000
#define MAPPER_PULSE_MIN_CONF 0.5f

enum MapSource : uint8_t {
    MS_RMS = 0,        // LINE-IN L level (mic or piezo), -60..-10 dBFS
    MS_CENTROID,       // spectral centroid, 200 Hz..8 kHz (log)
    MS_FLATNESS,       // 0 tonal .. 1 noise (0..0.5 raw)
    MS_ONSET_RATE,     // onsets/s, 0..8
    MS_PULSE_CONF,
    MS_PITCH_CONF,
    MS_SPEECH,         // mic speech likelihood
    MS_PIEZO_RMS,      // LINE-IN L level while the source is the piezo, else 0
    MS_RADIO_RMS,      // LINE-IN R level
    MS_RADIO_SPEECH,   // 0 music .. 1 speech
    MS_RADIO_RSSI,     // 0..60 dBuV
    MS_RADIO_ONSETS,   // radio onsets/s, 0..8
    MS_CADENCE,        // steps/min, 0..140
    MS_ACCEL_RMS,      // dynamic acceleration, 0..500 mg
    MS_HEADING,        // 0..360 deg -> 0..1 (0 without compass)
    MS_MAG_VAR,        // field variation over 1 s, 0..5 uT
    MS_DALT,           // height change, -20..+20 m -> 0..1 (0.5 = level)
    MS_DP_FAST,        // pressure fluctuation, 0..10 Pa
    MS_RF_DENSITY,     // WiFi access points around, 0..30
    MS_WALKING,        // 0 standing .. 1 walking (smoothed, ~8 s)
    MS_COUNT
};

enum MapTarget : uint8_t {
    MT_SEQ_PROB = 0,     // sequencer global trig probability
    MT_RHYTHM_DENSITY,   // capture rhythm layer: hits per bar
    MT_RHYTHM_PROB,      // capture rhythm layer: trig probability
    MT_FILTER,           // synth cutoff + rhythm/melody capture filters, 200 Hz..12 kHz
    MT_TEX_FILTER,       // texture capture filter, 200 Hz..12 kHz
    MT_GRAIN_DENSITY,    // texture grain density
    MT_DYNAMICS,         // capture layer level
    MT_MOD_DEPTH,        // synth LFO depth + texture filter wobble
    MT_SLICE_MODE,       // 0 even slices (music) .. 1 onset slices (speech)
    MT_FX_MIX,           // master FX mix
    MT_MELODY_PITCH,     // melody transpose, -12..+12 semitones
    MT_LAYER_FOCUS,      // which capture layer is "forward" (0..1 = direction around the circle)
    MT_COUNT
};

enum MapCurve : uint8_t { CURVE_LINEAR = 0, CURVE_SQUARE, CURVE_SQRT, CURVE_SMOOTH, CURVE_INVERT };

#define ROUTE_WALK_ONLY  0x01   // route counts only in follow-walk mode

enum FollowMode : uint8_t { FOLLOW_OFF = 0, FOLLOW_PULSE, FOLLOW_WALK };

struct MapRoute {
    MapSource source;
    MapTarget target;
    MapCurve  curve;
    float     depth;    // -1..1, in normalised target units
    float     center;   // 0: source only adds, 0.5: modulates both ways
    uint8_t   flags;    // ROUTE_*
};

class ContinuousMapper {
public:
    ContinuousMapper();

    void begin(FeatureExtractor* fe, Sequencer* seq, SynthVoice* synth, FXEngine* fx,
               Radio* radio, MidiIO* midi, SystemState* state);
    void update();                    // call every loop; works once per feature frame
    void setMotion(MotionSensors* m)  { motion = m; }
    void setLink(EspLink* l)          { link = l; }

    // User overrides: physical value of the control that owns the target
    void  userSet(MapTarget t, float physical);
    float getUserBase(MapTarget t) const;          // physical
    void  userTouchedTempo()           { lastTempoTouch = millis(); }

    // Outputs (smoothed, normalised 0..1 / physical)
    float value(MapTarget t) const     { return out[t]; }
    float physical(MapTarget t) const;
    float modulation(MapTarget t) const { return out[t] - base[t]; }   // what the routes add
    float sourceValue(MapSource s) const { return src[s]; }
    bool  isActive(MapTarget t) const  { return active[t]; }
    const char* targetName(MapTarget t) const;

    // Routes (data-driven)
    int   routeCount() const           { return nRoutes; }
    const MapRoute& route(int i) const { return routes[i]; }
    bool  setRoute(int i, const MapRoute& r);
    void  addPlanRoute(MapSource s, MapTarget t, float depth);
    void  clearPlanRoutes();

    // Scale from chroma
    uint16_t getScaleMask() const      { return scaleMask; }  // bit per pitch class, C = bit 0
    uint8_t  getRoot() const           { return root; }
    int      snapToScale(int midiNote) const;

    // Tempo follow
    void setFollowPulse(bool on)       { follow = on ? FOLLOW_PULSE : FOLLOW_OFF; }
    bool getFollowPulse() const        { return follow == FOLLOW_PULSE; }
    void setFollow(FollowMode m)       { follow = m; }
    FollowMode getFollow() const       { return follow; }

private:
    FeatureExtractor* features;
    Sequencer*  sequencer;
    SynthVoice* synth;
    FXEngine*   fx;
    Radio*      radio;
    MidiIO*     midi;
    SystemState* state;
    MotionSensors* motion;
    EspLink*    link;

    MapRoute routes[MAPPER_MAX_ROUTES];
    int      nRoutes;
    MapRoute planRoutes[MAPPER_PLAN_ROUTES];
    int      nPlanRoutes;

    float src[MS_COUNT];
    float base[MT_COUNT];
    float out[MT_COUNT];
    bool  active[MT_COUNT];
    unsigned long lastUser[MT_COUNT];
    unsigned long lastTempoTouch;
    uint32_t lastFrame;

    float    chromaAvg[12];
    uint16_t scaleMask;
    uint8_t  root;
    FollowMode follow;

    void readSources();
    void refreshActive();
    void apply();
    void updateScale();
    void updateTempo();
    float userWeight(MapTarget t, unsigned long now) const;
    static float curve(MapCurve c, float x);
};

#endif // CONTINUOUS_MAPPER_H
