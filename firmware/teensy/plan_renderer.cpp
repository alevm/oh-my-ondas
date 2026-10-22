/**
 * Oh My Ondas - Renderer implementation
 */

#include "plan_renderer.h"
#include "capture_store.h"
#include "sampling_engine.h"
#include "continuous_mapper.h"
#include "sequencer.h"
#include "midi_io.h"

static inline float clamp01(float x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }

static_assert(sizeof(LinkPlanHdr) == 9, "LinkPlanHdr layout");
static_assert(sizeof(LinkPlanTrack) == 30, "LinkPlanTrack layout (proto v3)");

// Protocol feature / target indices (LinkPlanTrack.mod_source / mod_target)
static const MapSource PLAN_MOD_SOURCE[12] = {
    MS_RMS, MS_CENTROID, MS_PIEZO_RMS, MS_ONSET_RATE, MS_RADIO_RSSI,
    MS_CADENCE, MS_ACCEL_RMS, MS_HEADING, MS_MAG_VAR, MS_DALT, MS_DP_FAST, MS_RF_DENSITY
};
static const MapTarget PLAN_MOD_TARGET[4] = {MT_TEX_FILTER, MT_RHYTHM_PROB, MT_MELODY_PITCH, MT_FX_MIX};

PlanRenderer::PlanRenderer()
    : store(nullptr), sampler(nullptr), mapper(nullptr), seq(nullptr), state(nullptr), midi(nullptr)
    , activeSinceBar(0), appliedCount(0), rejectedCount(0), lastErr(PLAN_OK)
    , melodyDegree(0), lastUpdate(0), wobblePhase(0)
    , muted(false), melodyPick(0), followBefore(0)
{
    memset(&pending, 0, sizeof(pending));
    memset(&active, 0, sizeof(active));
    memset(hitCount, 0, sizeof(hitCount));
    memset(lastTrig, 0, sizeof(lastTrig));
}

void PlanRenderer::begin(CaptureStore* st, SamplingEngine* sm, ContinuousMapper* mp,
                         Sequencer* sq, SystemState* ss, MidiIO* m) {
    store = st; sampler = sm; mapper = mp; seq = sq; state = ss; midi = m;
    DEBUG_PRINTLN("PlanRenderer: Ready");
}

// ============================================
// PLANS
// ============================================

PlanError PlanRenderer::validatePlan(const uint8_t* p, int len) const {
    if (len < (int)sizeof(LinkPlanHdr)) return PLAN_ERR_LENGTH;
    LinkPlanHdr h;
    memcpy(&h, p, sizeof(h));
    if (h.track_count > 8) return PLAN_ERR_TRACKS;
    if (len != (int)(sizeof(LinkPlanHdr) + h.track_count * sizeof(LinkPlanTrack))) return PLAN_ERR_LENGTH;
    if (h.bars < 1 || h.bars > 64) return PLAN_ERR_BARS;
    if (h.bpm_x10 != 0 && (h.bpm_x10 < 400 || h.bpm_x10 > 3000)) return PLAN_ERR_BPM;
    if (h.follow_pulse > 1) return PLAN_ERR_RANGE;
    for (int i = 0; i < h.track_count; i++) {
        LinkPlanTrack t;
        memcpy(&t, p + sizeof(LinkPlanHdr) + i * sizeof(LinkPlanTrack), sizeof(t));
        if (t.role > ROLE_MODULATION) return PLAN_ERR_ROLE;
        if (t.slice > 2 || (t.duck_on > 3 && t.duck_on != 255)) return PLAN_ERR_RANGE;
        if (t.pitch < -24 || t.pitch > 24) return PLAN_ERR_RANGE;
        for (int k = 0; k < 16; k++) {
            if (t.notes[k] != LINK_NOTE_NONE && (t.notes[k] < -48 || t.notes[k] > 48)) return PLAN_ERR_RANGE;
        }
        if (t.role == ROLE_MODULATION) {
            if (t.mod_source > 11 || t.mod_target > 3) return PLAN_ERR_RANGE;
        } else {
            // Only captures of the latest inventory (MSG_CAPS) may be named
            if (t.capture_id == 255 || !store || !store->findById(t.capture_id)) return PLAN_ERR_CAPTURE;
        }
    }
    return PLAN_OK;
}

PlanError PlanRenderer::queuePlan(const uint8_t* p, int len) {
    PlanError e = validatePlan(p, len);
    lastErr = e;
    if (e != PLAN_OK) { rejectedCount++; return e; }

    LinkPlanHdr h;
    memcpy(&h, p, sizeof(h));
    Plan pl;
    memset(&pl, 0, sizeof(pl));
    pl.valid = true;
    pl.id = h.plan_id;
    pl.startBar = h.starts_at_bar;
    pl.bars = h.bars;
    pl.bpmX10 = h.bpm_x10;
    pl.follow = h.follow_pulse != 0;
    for (int i = 0; i < h.track_count; i++) {
        LinkPlanTrack t;
        memcpy(&t, p + sizeof(LinkPlanHdr) + i * sizeof(LinkPlanTrack), sizeof(t));
        if (t.role == ROLE_MODULATION) {
            if (pl.nMods < 4) pl.mods[pl.nMods++] = t;
            continue;
        }
        Track& tr = pl.tracks[t.role];
        if (tr.on) continue;   // one track per role
        tr.on = true;
        tr.captureId = t.capture_id;
        tr.steps = t.steps;
        tr.prob = t.prob / 255.0f;
        tr.pitch = t.pitch;
        tr.densFrom = t.density_from / 255.0f;
        tr.densTo = t.density_to / 255.0f;
        tr.slice = t.slice;
        tr.duckOn = t.duck_on;
        tr.flags = t.flags;
        memcpy(tr.notes, t.notes, sizeof(tr.notes));
    }
    pending = pl;   // a newer plan replaces one still waiting
    DEBUG_PRINTF("PlanRenderer: plan %u pending (bar %u, %u bars)\n", pl.id, pl.startBar, pl.bars);
    return PLAN_OK;
}

void PlanRenderer::startPlan(uint32_t bar) {
    if (active.valid) endPlan();
    active = pending;
    pending.valid = false;
    activeSinceBar = bar;
    appliedCount++;

    if (active.bpmX10 && state && seq && !(midi && midi->isClockLocked())) {
        state->bpm = active.bpmX10 / 10.0f;
        seq->setTempo(state->bpm);
    }
    if (mapper) {
        followBefore = mapper->getFollow();
        if (active.follow) mapper->setFollow(FOLLOW_PULSE);   // 0: the user's follow mode stays
        mapper->clearPlanRoutes();
        for (int i = 0; i < active.nMods; i++) {
            const LinkPlanTrack& m = active.mods[i];
            mapper->addPlanRoute(PLAN_MOD_SOURCE[m.mod_source], PLAN_MOD_TARGET[m.mod_target],
                                 m.mod_depth / 255.0f);
        }
    }
    // Texture capture may change: restart its grains on the next update
    if (sampler) sampler->stopCaptureVoice(CAPVOICE_TEXTURE);
    DEBUG_PRINTF("PlanRenderer: plan %u active at bar %lu\n", active.id, bar);
}

void PlanRenderer::endPlan() {
    if (!active.valid) return;
    DEBUG_PRINTF("PlanRenderer: plan %u done\n", active.id);
    active.valid = false;
    if (mapper) {
        mapper->clearPlanRoutes();
        mapper->setFollow((FollowMode)followBefore);
    }
    if (sampler) sampler->stopCaptureVoice(CAPVOICE_TEXTURE);
}

int PlanRenderer::barsLeft() const {
    if (!active.valid || !seq) return 0;
    return (int)active.bars - (int)(seq->getBarCount() - activeSinceBar);
}

// ============================================
// STEP TICK
// ============================================

void PlanRenderer::onStep(int step) {
    if (!seq || !store || !sampler) return;

    if (step == 0) {
        uint32_t bar = seq->getBarCount();
        if (active.valid && bar - activeSinceBar >= active.bars) endPlan();
        if (pending.valid) {
            int16_t ahead = (int16_t)(pending.startBar - (uint16_t)bar);
            if (ahead <= 0 || ahead > PLAN_MAX_WAIT_BARS) startPlan(bar);
        }
    }
    triggerRhythm(step);
    triggerMelody(step);
}

unsigned long PlanRenderer::stepMs() const {
    float bpm = seq ? seq->getTempo() : 120.0f;
    return (unsigned long)(60000.0f / bpm / 4.0f);
}

uint16_t PlanRenderer::euclid(int hits) {
    hits = constrain(hits, 0, 16);
    uint16_t m = 0;
    for (int i = 0; i < 16; i++) if ((i * hits) % 16 < hits) m |= 1 << i;
    return m;
}

const Capture* PlanRenderer::captureFor(int role, const Track* t) const {
    if (t && t->on) {
        const Capture* c = store->findById(t->captureId);
        if (c) return c;   // evicted since the plan: fall back to layer 1's choice
    }
    if (role == ROLE_MELODY && melodyPick) {
        const Capture* c = store->findById(melodyPick);
        if (c) return c;
    }
    const Capture* best = nullptr;
    for (int i = 0; i < CAPTURE_MAX; i++) {
        const Capture* c = store->at(i);
        if (c && c->role == role && (!best || c->seq > best->seq)) best = c;
    }
    if (best) return best;
    // Nothing in this role yet: rhythm and texture use any capture, melody waits
    return role == ROLE_MELODY ? nullptr : store->newest();
}

// Slice of a capture for one hit
bool PlanRenderer::sliceBounds(const Capture& c, uint8_t mode, uint8_t hit, int step,
                               uint32_t& start, uint32_t& end) const {
    uint32_t maxLen = (uint32_t)(AUDIO_SAMPLE_RATE_EXACT * RENDER_MAX_SLICE_MS / 1000.0f);
    if (mode == 1 && c.onsetCount >= 2) {
        int k = hit % c.onsetCount;
        start = c.onsets[k];
        end = (k + 1 < c.onsetCount) ? c.onsets[k + 1] : c.length;
    } else if (mode == 2 || mode == 1) {
        start = (uint64_t)c.length * step / 16;
        end = (uint64_t)c.length * (step + 1) / 16;
    } else {
        start = 0;
        end = c.length;
    }
    if (end > start + maxLen) end = start + maxLen;
    return end > start + 256;
}

float PlanRenderer::duckGain(const Track* t) const {
    if (!t || !t->on || t->duckOn >= PLAN_ROLES) return 1.0f;
    return millis() - lastTrig[t->duckOn] < 2 * stepMs() ? 0.4f : 1.0f;
}

void PlanRenderer::triggerRhythm(int step) {
    const Track* t = active.valid && active.tracks[ROLE_RHYTHM].on ? &active.tracks[ROLE_RHYTHM] : nullptr;
    uint16_t mask;
    float prob;
    uint8_t slice;
    int pitch = 0;
    if (t) {
        mask = t->steps;
        prob = clamp01(t->prob + mapper->modulation(MT_RHYTHM_PROB));
        slice = t->slice;
        pitch = t->pitch;
    } else {
        // Layer 1: onset density -> number of Euclidean hits per bar
        mask = euclid(1 + (int)lroundf(mapper->value(MT_RHYTHM_DENSITY) * 11.0f));
        prob = mapper->value(MT_RHYTHM_PROB);
        slice = mapper->value(MT_SLICE_MODE) > 0.5f ? 1 : 2;
    }
    if (!(mask & (1 << step))) return;
    if ((long)random(1000) >= (long)(prob * 1000.0f)) return;
    const Capture* c = captureFor(ROLE_RHYTHM, t);
    if (!c) return;
    uint32_t s, e;
    if (!sliceBounds(*c, slice, hitCount[ROLE_RHYTHM]++, step, s, e)) return;
    float rate = powf(2.0f, pitch / 12.0f);
    sampler->playCapture(CAPVOICE_RHYTHM, c->id, store->samples(*c), s, e, rate,
                         0.9f * duckGain(t) * focusGain(ROLE_RHYTHM));
    lastTrig[ROLE_RHYTHM] = millis();
}

void PlanRenderer::triggerMelody(int step) {
    const Track* t = active.valid && active.tracks[ROLE_MELODY].on ? &active.tracks[ROLE_MELODY] : nullptr;
    uint16_t mask;
    float prob;
    uint8_t slice = 0;
    int pitch = 0;
    bool snap = true;
    int planNote = LINK_NOTE_NONE;   // explicit note from the plan for this step
    if (t) {
        mask = t->steps;
        prob = t->prob;
        slice = t->slice;
        pitch = t->pitch;
        snap = t->flags & 0x01;
        planNote = t->notes[step];
        if (planNote != LINK_NOTE_NONE) mask |= 1 << step;
    } else {
        // Layer 1: a note on beats 1 and 3, more when the place is dense
        mask = 0x0101 | (mapper->value(MT_RHYTHM_DENSITY) > 0.6f ? 0x1010 : 0);
        prob = 0.5f;
    }
    if (!(mask & (1 << step))) return;
    if ((long)random(1000) >= (long)(prob * 1000.0f)) return;
    const Capture* c = captureFor(ROLE_MELODY, t);
    if (!c) return;

    int transpose = pitch + (int)lroundf(mapper->physical(MT_MELODY_PITCH));
    float rate;
    if (planNote != LINK_NOTE_NONE) {
        int note = MELODY_BASE_NOTE + transpose + planNote;
        if (snap) note = mapper->snapToScale(note);
        float hz = 440.0f * powf(2.0f, (note - 69) / 12.0f);
        rate = c->pitchHz > 0 ? hz / c->pitchHz : powf(2.0f, (note - MELODY_BASE_NOTE) / 12.0f);
        while (rate > 4.0f) rate *= 0.5f;
        while (rate < 0.25f) rate *= 2.0f;
    } else if (snap) {
        // Random walk over the sensed scale, rooted on the strongest chroma
        melodyDegree = constrain(melodyDegree + (int)random(-2, 3), -5, 7);
        int note = MELODY_BASE_NOTE + mapper->getRoot() + melodyDegree * 2 + transpose;
        note = mapper->snapToScale(note);
        float hz = 440.0f * powf(2.0f, (note - 69) / 12.0f);
        rate = c->pitchHz > 0 ? hz / c->pitchHz : powf(2.0f, (note - MELODY_BASE_NOTE) / 12.0f);
        while (rate > 4.0f) rate *= 0.5f;     // keep it in a playable octave
        while (rate < 0.25f) rate *= 2.0f;
    } else {
        rate = powf(2.0f, transpose / 12.0f);
    }
    uint32_t s, e;
    if (!sliceBounds(*c, slice, hitCount[ROLE_MELODY]++, step, s, e)) return;
    sampler->playCapture(CAPVOICE_MELODY, c->id, store->samples(*c), s, e, rate,
                         0.8f * duckGain(t) * focusGain(ROLE_MELODY));
    lastTrig[ROLE_MELODY] = millis();
}

// Heading focus: layer ahead at full level, behind down to 40 %
float PlanRenderer::focusGain(int role) const {
    if (!mapper || !mapper->isActive(MT_LAYER_FOCUS) || mapper->sourceValue(MS_HEADING) <= 0.0f) return 1.0f;
    static const float ANGLE[PLAN_ROLES] = {0.0f, 1.0f / 3.0f, 2.0f / 3.0f};   // rhythm, texture, melody
    float d = mapper->value(MT_LAYER_FOCUS) - ANGLE[role];
    return 0.7f + 0.3f * cosf(2.0f * PI * d);
}

void PlanRenderer::selectMelodyCapture(int dir) {
    if (!store || store->count() == 0) return;
    // Order by age; step from the current pick (or the newest)
    const Capture* order[CAPTURE_MAX];
    int n = 0;
    for (int i = 0; i < CAPTURE_MAX; i++) if (store->at(i)) order[n++] = store->at(i);
    for (int i = 0; i < n; i++) for (int j = i + 1; j < n; j++) {
        if (order[j]->seq > order[i]->seq) { const Capture* x = order[i]; order[i] = order[j]; order[j] = x; }
    }
    int cur = 0;
    for (int i = 0; i < n; i++) if (order[i]->id == melodyPick) cur = i;
    cur = (cur + (dir > 0 ? 1 : -1) + n) % n;
    melodyPick = order[cur]->id;
}

// ============================================
// CONTINUOUS PART (texture, levels, filters)
// ============================================

void PlanRenderer::update() {
    if (!sampler || !store || !mapper || !state) return;
    unsigned long now = millis();
    if (now - lastUpdate < 20) return;
    float dt = (now - lastUpdate) / 1000.0f;
    lastUpdate = now;

    // Levels and filters follow the mapper whether or not the transport runs
    sampler->setCaptureLevel(muted ? 0.0f : 0.15f + 0.75f * mapper->value(MT_DYNAMICS));
    float cut = mapper->physical(MT_FILTER);
    sampler->setCaptureFilter(CAPVOICE_RHYTHM, cut);
    sampler->setCaptureFilter(CAPVOICE_MELODY, cut);
    wobblePhase += 0.3f * dt;   // 0.3 Hz
    if (wobblePhase >= 1.0f) wobblePhase -= 1.0f;
    float wob = sinf(2.0f * PI * wobblePhase) * mapper->value(MT_MOD_DEPTH);
    sampler->setCaptureFilter(CAPVOICE_TEXTURE, mapper->physical(MT_TEX_FILTER) * powf(2.0f, wob));

    // Texture: continuous grains while playing
    if (!state->isPlaying) {
        if (sampler->isCaptureVoicePlaying(CAPVOICE_TEXTURE)) sampler->stopCaptureVoice(CAPVOICE_TEXTURE);
        return;
    }
    const Track* t = active.valid && active.tracks[ROLE_TEXTURE].on ? &active.tracks[ROLE_TEXTURE] : nullptr;
    const Capture* c = captureFor(ROLE_TEXTURE, t);
    if (!c) {
        sampler->stopCaptureVoice(CAPVOICE_TEXTURE);
        return;
    }
    float density;
    if (t) {
        float prog = active.bars ? clamp01((float)(seq->getBarCount() - activeSinceBar) / active.bars) : 0.0f;
        density = clamp01(t->densFrom + (t->densTo - t->densFrom) * prog + mapper->modulation(MT_GRAIN_DENSITY));
    } else {
        density = mapper->value(MT_GRAIN_DENSITY);
    }
    float gain = 0.7f * duckGain(t) * focusGain(ROLE_TEXTURE);
    lastTrig[ROLE_TEXTURE] = now;   // sounding: tracks with duck_on = texture duck under it
    if (sampler->getCaptureVoiceTag(CAPVOICE_TEXTURE) != c->id) {
        float rate = t ? powf(2.0f, t->pitch / 12.0f) : 1.0f;
        sampler->grainCapture(CAPVOICE_TEXTURE, c->id, store->samples(*c), c->length, density, rate, gain);
    } else {
        sampler->setCaptureDensity(CAPVOICE_TEXTURE, density);
        sampler->setCaptureGain(CAPVOICE_TEXTURE, gain);
    }
}
