/**
 * Oh My Ondas - Continuous mapper implementation
 */

#include "continuous_mapper.h"
#include "feature_extractor.h"
#include "sequencer.h"
#include "synth_voice.h"
#include "fx_engine.h"
#include "radio.h"
#include "midi_io.h"
#include "motion_sensors.h"
#include "esp_link.h"

// Physical range per target, default base (normalised) and smoothing
struct TargetDef {
    const char* name;
    float lo, hi;
    bool  logScale;
    float base;       // normalised default
    float smoothSec;
};

static const TargetDef TARGETS[MT_COUNT] = {
    {"seq prob",   0.0f,   1.0f,     false, 1.00f, 1.0f},   // MT_SEQ_PROB (written only if a route has depth)
    {"density",    0.0f,   1.0f,     false, 0.30f, 1.5f},   // MT_RHYTHM_DENSITY
    {"rhy prob",   0.0f,   1.0f,     false, 0.80f, 1.0f},   // MT_RHYTHM_PROB
    {"cutoff",     200.0f, 12000.0f, true,  0.60f, 0.5f},   // MT_FILTER
    {"tex cutoff", 200.0f, 12000.0f, true,  0.55f, 0.8f},   // MT_TEX_FILTER
    {"grain",      0.0f,   1.0f,     false, 0.40f, 1.0f},   // MT_GRAIN_DENSITY
    {"dynamics",   0.0f,   1.0f,     false, 0.55f, 0.4f},   // MT_DYNAMICS
    {"mod depth",  0.0f,   1.0f,     false, 0.00f, 0.3f},   // MT_MOD_DEPTH
    {"slicing",    0.0f,   1.0f,     false, 0.00f, 2.0f},   // MT_SLICE_MODE
    {"fx mix",     0.0f,   1.0f,     false, 0.00f, 0.5f},   // MT_FX_MIX
    {"mel pitch", -12.0f,  12.0f,    false, 0.50f, 2.0f},   // MT_MELODY_PITCH
    {"focus",      0.0f,   1.0f,     false, 0.00f, 0.3f},   // MT_LAYER_FOCUS (wraps at north: short smoothing)
};

// Default routes: tune here. depth in normalised target units; 0 = present
// but off. Active by default: the four marked ON (see the header).
static const MapRoute DEFAULT_ROUTES[] = {
    // source            target             curve          depth  center flags
    {MS_ONSET_RATE,   MT_RHYTHM_DENSITY, CURVE_SQRT,     0.80f, 0.3f, 0},  // ON: onset density -> capture hits per bar
    {MS_CENTROID,     MT_FILTER,         CURVE_LINEAR,   0.60f, 0.5f, 0},  // ON: bright place, open filter
    {MS_HEADING,      MT_LAYER_FOCUS,    CURVE_LINEAR,   1.00f, 0.0f, 0},  // ON: heading -> forward capture layer
    {MS_WALKING,      MT_RHYTHM_DENSITY, CURVE_LINEAR,   0.30f, 1.0f, ROUTE_WALK_ONLY},  // ON in follow-walk: standing settles
    // Off by default (depth 0); MT_SEQ_PROB would thin the user's own pattern
    {MS_ONSET_RATE,   MT_SEQ_PROB,       CURVE_SQRT,     0.00f, 0.5f, 0},
    {MS_PULSE_CONF,   MT_RHYTHM_PROB,    CURVE_LINEAR,   0.00f, 0.5f, 0},  // try 0.30: clear pulse, steadier rhythm
    {MS_CENTROID,     MT_TEX_FILTER,     CURVE_LINEAR,   0.00f, 0.5f, 0},  // try 0.50
    {MS_FLATNESS,     MT_GRAIN_DENSITY,  CURVE_SQRT,     0.00f, 0.4f, 0},  // try 0.80: noisy -> dense grains
    {MS_RMS,          MT_DYNAMICS,       CURVE_SMOOTH,   0.00f, 0.5f, 0},  // try 0.50: loud place, louder layer
    {MS_PIEZO_RMS,    MT_MOD_DEPTH,      CURVE_SQRT,     0.00f, 0.0f, 0},  // try 0.90: surface vibration -> modulation
    {MS_RADIO_SPEECH, MT_SLICE_MODE,     CURVE_SMOOTH,   0.00f, 0.0f, 0},  // try 1.00: radio speech -> onset slices
    {MS_ACCEL_RMS,    MT_GRAIN_DENSITY,  CURVE_SQRT,     0.00f, 0.0f, 0},  // try 0.30: moving -> denser grains
    {MS_ACCEL_RMS,    MT_FX_MIX,         CURVE_SQRT,     0.00f, 0.0f, 0},  // try 0.15
    {MS_MAG_VAR,      MT_MOD_DEPTH,      CURVE_SQRT,     0.00f, 0.0f, 0},  // try 0.50: magnetic change -> texture wobble
    {MS_DALT,         MT_FILTER,         CURVE_LINEAR,   0.00f, 0.5f, 0},  // try 0.40: going down -> darker
    {MS_DALT,         MT_MELODY_PITCH,   CURVE_LINEAR,   0.00f, 0.5f, 0},  // try 0.40: going down -> lower register
    {MS_DP_FAST,      MT_FX_MIX,         CURVE_SQRT,     0.00f, 0.0f, 0},  // try 0.40: gusts / doors -> FX bursts
    {MS_RF_DENSITY,   MT_GRAIN_DENSITY,  CURVE_SQRT,     0.00f, 0.3f, 0},  // try 0.30: dense WiFi -> dense texture
};

static inline float clamp01(float x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }

ContinuousMapper::ContinuousMapper()
    : features(nullptr), sequencer(nullptr), synth(nullptr), fx(nullptr)
    , radio(nullptr), midi(nullptr), state(nullptr), motion(nullptr), link(nullptr)
    , nRoutes(0), nPlanRoutes(0), lastTempoTouch(0), lastFrame(0)
    , scaleMask(0x0AB5), root(0), follow(FOLLOW_OFF)   // C major until chroma says otherwise
{
    memset(src, 0, sizeof(src));
    memset(lastUser, 0, sizeof(lastUser));
    memset(chromaAvg, 0, sizeof(chromaAvg));
    for (int t = 0; t < MT_COUNT; t++) {
        base[t] = out[t] = TARGETS[t].base;
        active[t] = false;
    }
    nRoutes = sizeof(DEFAULT_ROUTES) / sizeof(DEFAULT_ROUTES[0]);
    for (int i = 0; i < nRoutes; i++) routes[i] = DEFAULT_ROUTES[i];
}

void ContinuousMapper::begin(FeatureExtractor* fe, Sequencer* seq, SynthVoice* sv, FXEngine* fxe,
                             Radio* r, MidiIO* m, SystemState* st) {
    features = fe; sequencer = seq; synth = sv; fx = fxe; radio = r; midi = m; state = st;
    refreshActive();
    DEBUG_PRINTF("ContinuousMapper: %d routes\n", nRoutes);
}

float ContinuousMapper::curve(MapCurve c, float x) {
    x = clamp01(x);
    switch (c) {
        case CURVE_SQUARE: return x * x;
        case CURVE_SQRT:   return sqrtf(x);
        case CURVE_SMOOTH: return x * x * (3.0f - 2.0f * x);
        case CURVE_INVERT: return 1.0f - x;
        default:           return x;
    }
}

void ContinuousMapper::update() {
    if (!features || features->frameCount() == lastFrame) return;
    lastFrame = features->frameCount();
    unsigned long now = millis();

    readSources();

    float sum[MT_COUNT] = {0};
    for (int i = 0; i < nRoutes; i++) {
        const MapRoute& r = routes[i];
        if ((r.flags & ROUTE_WALK_ONLY) && follow != FOLLOW_WALK) continue;
        sum[r.target] += r.depth * (curve(r.curve, src[r.source]) - r.center);
    }
    for (int i = 0; i < nPlanRoutes; i++) {
        const MapRoute& r = planRoutes[i];
        sum[r.target] += r.depth * (curve(r.curve, src[r.source]) - r.center);
    }
    const float dt = FEAT_PERIOD_MS / 1000.0f;
    for (int t = 0; t < MT_COUNT; t++) {
        float target = clamp01(base[t] + sum[t] * userWeight((MapTarget)t, now));
        float a = 1.0f - expf(-dt / TARGETS[t].smoothSec);
        out[t] += a * (target - out[t]);
    }

    updateScale();
    updateTempo();
    apply();
}

// Normalise the features to 0..1
void ContinuousMapper::readSources() {
    const FeatureFrame& f = features->frame();
    const RadioFeatures& rf = features->radioFrame();
    src[MS_RMS]        = clamp01((f.rmsDb + 60.0f) / 50.0f);
    src[MS_CENTROID]   = f.centroidHz > 200.0f ? clamp01(log2f(f.centroidHz / 200.0f) / log2f(40.0f)) : 0.0f;
    src[MS_FLATNESS]   = clamp01(f.flatness / 0.5f);
    src[MS_ONSET_RATE] = clamp01(f.onsetRate / 8.0f);
    src[MS_PULSE_CONF] = f.bpmConf;
    src[MS_PITCH_CONF] = f.pitchHz > 0 ? f.pitchConf : 0.0f;
    src[MS_SPEECH]     = f.speech;
    src[MS_PIEZO_RMS]  = f.source == LEFT_SRC_PIEZO ? src[MS_RMS] : 0.0f;
    src[MS_RADIO_RMS]  = clamp01((rf.rmsDb + 60.0f) / 50.0f);
    src[MS_RADIO_SPEECH] = rf.speech;
    src[MS_RADIO_RSSI] = (radio && radio->isFitted()) ? clamp01(radio->getRSSI() / 60.0f) : 0.0f;
    src[MS_RADIO_ONSETS] = clamp01(rf.onsetRate / 8.0f);
    // Motion / environment / RF: 0 when the sensor is absent
    if (motion && motion->imuPresent()) {
        const MotionFrame& m = motion->motion();
        src[MS_CADENCE]   = clamp01(m.cadence / 140.0f);
        src[MS_ACCEL_RMS] = clamp01(m.accelRmsMg / 500.0f);
        src[MS_HEADING]   = m.headingDeg >= 0 ? clamp01(m.headingDeg / 360.0f) : 0.0f;
        src[MS_MAG_VAR]   = clamp01(m.magVarUt / 5.0f);
        src[MS_WALKING]   = m.walking;
    } else {
        src[MS_CADENCE] = src[MS_ACCEL_RMS] = src[MS_HEADING] = src[MS_MAG_VAR] = src[MS_WALKING] = 0.0f;
    }
    if (motion && motion->baroPresent() && motion->env().valid) {
        src[MS_DALT]    = clamp01(0.5f + motion->env().daltM / 40.0f);
        src[MS_DP_FAST] = clamp01(motion->env().fastPa / 10.0f);
    } else {
        src[MS_DALT] = 0.5f;
        src[MS_DP_FAST] = 0.0f;
    }
    const LinkRf* rfd = link ? link->rf() : nullptr;
    src[MS_RF_DENSITY] = rfd ? clamp01(rfd->ap_count / 30.0f) : 0.0f;
}

// 0 while the user holds the control, then a linear ramp back to 1
float ContinuousMapper::userWeight(MapTarget t, unsigned long now) const {
    if (lastUser[t] == 0) return 1.0f;
    unsigned long since = now - lastUser[t];
    if (since < MAPPER_USER_HOLD_MS) return 0.0f;
    since -= MAPPER_USER_HOLD_MS;
    return since >= MAPPER_USER_RAMP_MS ? 1.0f : (float)since / MAPPER_USER_RAMP_MS;
}

void ContinuousMapper::refreshActive() {
    for (int t = 0; t < MT_COUNT; t++) active[t] = false;
    for (int i = 0; i < nRoutes; i++) if (routes[i].depth != 0.0f) active[routes[i].target] = true;
    for (int i = 0; i < nPlanRoutes; i++) if (planRoutes[i].depth != 0.0f) active[planRoutes[i].target] = true;
}

float ContinuousMapper::physical(MapTarget t) const {
    const TargetDef& d = TARGETS[t];
    float v = out[t];
    return d.logScale ? d.lo * powf(d.hi / d.lo, v) : d.lo + (d.hi - d.lo) * v;
}

float ContinuousMapper::getUserBase(MapTarget t) const {
    const TargetDef& d = TARGETS[t];
    float v = base[t];
    return d.logScale ? d.lo * powf(d.hi / d.lo, v) : d.lo + (d.hi - d.lo) * v;
}

void ContinuousMapper::userSet(MapTarget t, float physicalValue) {
    const TargetDef& d = TARGETS[t];
    float v;
    if (d.logScale) v = logf(constrain(physicalValue, d.lo, d.hi) / d.lo) / logf(d.hi / d.lo);
    else            v = (physicalValue - d.lo) / (d.hi - d.lo);
    base[t] = clamp01(v);
    out[t] = base[t];   // the user hears the value at once
    lastUser[t] = millis();
}

const char* ContinuousMapper::targetName(MapTarget t) const {
    return t < MT_COUNT ? TARGETS[t].name : "?";
}

bool ContinuousMapper::setRoute(int i, const MapRoute& r) {
    if (i < 0 || i > nRoutes || i >= MAPPER_MAX_ROUTES) return false;
    if (r.source >= MS_COUNT || r.target >= MT_COUNT) return false;
    routes[i] = r;
    if (i == nRoutes) nRoutes++;
    refreshActive();
    return true;
}

void ContinuousMapper::addPlanRoute(MapSource s, MapTarget t, float depth) {
    if (nPlanRoutes >= MAPPER_PLAN_ROUTES || s >= MS_COUNT || t >= MT_COUNT) return;
    planRoutes[nPlanRoutes++] = {s, t, CURVE_LINEAR, constrain(depth, -1.0f, 1.0f), 0.5f, 0};
    refreshActive();
}

void ContinuousMapper::clearPlanRoutes() {
    nPlanRoutes = 0;
    refreshActive();
}

// ============================================
// SCALE FROM CHROMA
// ============================================

void ContinuousMapper::updateScale() {
    const FeatureFrame& f = features->frame();
    if (f.rmsDb < -55.0f) return;   // silence says nothing about the key
    for (int c = 0; c < 12; c++) chromaAvg[c] += 0.03f * (f.chroma[c] - chromaAvg[c]);  // ~3 s
    // 5 strongest pitch classes; the strongest is the root
    uint16_t mask = 0;
    for (int k = 0; k < 5; k++) {
        int best = -1;
        for (int c = 0; c < 12; c++) {
            if (mask & (1 << c)) continue;
            if (best < 0 || chromaAvg[c] > chromaAvg[best]) best = c;
        }
        if (best < 0 || chromaAvg[best] <= 0.0f) break;
        if (k == 0) root = best;
        mask |= 1 << best;
    }
    if (__builtin_popcount(mask) >= 3) scaleMask = mask;
}

int ContinuousMapper::snapToScale(int note) const {
    if (!scaleMask) return note;
    for (int d = 0; d < 7; d++) {
        if (scaleMask & (1 << (((note - d) % 12 + 12) % 12))) return note - d;
        if (scaleMask & (1 << (((note + d) % 12 + 12) % 12))) return note + d;
    }
    return note;
}

// ============================================
// TEMPO FOLLOW
// ============================================

void ContinuousMapper::updateTempo() {
    if (follow == FOLLOW_OFF || !state || !sequencer) return;
    if (midi && midi->isClockLocked()) return;                       // external clock owns tempo
    if (lastTempoTouch && millis() - lastTempoTouch < MAPPER_USER_HOLD_MS + MAPPER_USER_RAMP_MS) return;
    float target;
    if (follow == FOLLOW_WALK) {
        if (!motion || !motion->imuPresent()) return;
        target = motion->motion().cadence;   // one step = one beat
        if (target <= 0) return;             // standing: keep the tempo, density settles
    } else {
        const FeatureFrame& f = features->frame();
        if (f.bpm <= 0 || f.bpmConf < MAPPER_PULSE_MIN_CONF) return;
        target = f.bpm;
    }
    while (target < 70.0f) target *= 2.0f;
    while (target > 150.0f) target *= 0.5f;
    float bpm = state->bpm + 0.05f * (target - state->bpm);   // ~2 s glide
    if (fabsf(bpm - state->bpm) > 0.05f) {
        state->bpm = bpm;
        sequencer->setTempo(bpm);
    }
}

// ============================================
// OUTPUTS TO THE ENGINE
// ============================================

// Capture-layer targets (density, grain, slicing, texture filter, melody
// pitch, rhythm prob) are read by the renderer through value()/physical().
void ContinuousMapper::apply() {
    if (active[MT_SEQ_PROB] && sequencer) sequencer->setGlobalProbability(physical(MT_SEQ_PROB));
    if (active[MT_FILTER] && synth)       synth->setFilterFreq(physical(MT_FILTER));
    if (active[MT_MOD_DEPTH] && synth)    synth->setLFODepth(physical(MT_MOD_DEPTH));
    if (active[MT_FX_MIX] && fx)          fx->setMix(physical(MT_FX_MIX));
}
