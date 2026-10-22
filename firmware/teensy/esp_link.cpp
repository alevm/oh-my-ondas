/**
 * Oh My Ondas - ESP32-S2 link implementation (Teensy side)
 */

#include "esp_link.h"
#include "feature_extractor.h"
#include "capture_store.h"
#include "plan_renderer.h"
#include "sequencer.h"
#include "radio.h"
#include "input_manager.h"
#include "audio_sense.h"
#include "motion_sensors.h"

extern "C" uint8_t external_psram_size;

static_assert(sizeof(LinkFeat) == 59, "LinkFeat layout (proto v3)");
static_assert(sizeof(LinkMotion) == 26, "LinkMotion layout (proto v4)");
static_assert(sizeof(LinkEnv) == 16, "LinkEnv layout (proto v4)");
static_assert(sizeof(LinkRf) == 20, "LinkRf layout (proto v4)");

static uint8_t serialTxMem[LINK_SERIAL_TX_MEM];
static uint8_t serialRxMem[LINK_SERIAL_RX_MEM];

static const float CLIP_RATIO = AUDIO_SAMPLE_RATE_EXACT / LINK_CLIP_RATE;   // ~2.756 input samples per output
static const uint32_t CLIP_SAMPLES_PER_CHUNK = (LINK_MAX_PAYLOAD - sizeof(LinkClipHdr)) * 2;

static const int16_t ADPCM_STEP[89] = {
    7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45,
    50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230,
    253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963,
    1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327,
    3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487,
    12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767
};
static const int8_t ADPCM_INDEX[16] = {-1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8};

EspLink::EspLink()
    : features(nullptr), captures(nullptr), renderer(nullptr), sequencer(nullptr)
    , radio(nullptr), input(nullptr), state(nullptr), senseL(nullptr), senseR(nullptr)
    , motion(nullptr), lastMotionFrame(0), lastEnvSent(0), rfMs(0)
    , txRing(nullptr), txHead(0), txTail(0), txSeq(0), txFrames(0), txDrops(0)
    , rxLen(0), rxOverflow(false), rxFrames(0), rxErrs(0), lastRxMs(0)
    , gotLinkState(false), stateChanges(0)
    , lastFeatFrame(0), last1Hz(0), lastUserSent(0), lastCapsSent(0)
    , capsVersionSent(0xFFFFFFFF), capsPending(true)
    , userDirty(false), lastButtons(0)
    , clipPhase(CLIP_IDLE), clipBuf(nullptr), clipMax(0), clipLen(0), clipSource(0), clipId(0)
    , clipSpeechSeen(false), clipTailStart(0), lastClipMs(0), clipStartMs(0), lastChunkMs(0)
    , lastAnnounce(0), clipFeatFrame(0), clipFrameStart(0), clipLostStart(0)
    , clipFromRequest(false), clipReqSeq(0), reqSeq(0)
    , clipsDone(0), clipsPrivacy(0)
    , clipOutTotal(0), clipOutPos(0), clipInIdx(0), rsF0(0), rsF1(0)
    , adpcmPred(0), adpcmIndex(0), clipChunk(0), clipChunks(0)
    , clipRequested(false), reqSource(SRC_MIC), reqSeconds(LINK_CLIP_SECONDS)
{
    lastRadioSig[0] = '\0';
    memset(&user, 0, sizeof(user));
    memset(&rfData, 0, sizeof(rfData));
    linkState.wifi = 0;
    linkState.server = 0;
    linkState.rssi_dbm = -128;
}

void EspLink::begin(FeatureExtractor* fe, CaptureStore* caps, PlanRenderer* rend,
                    Sequencer* seq, Radio* r, InputManager* in, SystemState* st,
                    AudioSense* sl, AudioSense* sr) {
    features = fe; captures = caps; renderer = rend; sequencer = seq;
    radio = r; input = in; state = st; senseL = sl; senseR = sr;

    ESP32_SERIAL.begin(LINK_BAUD_ACTIVE);
    ESP32_SERIAL.addMemoryForWrite(serialTxMem, sizeof(serialTxMem));
    ESP32_SERIAL.addMemoryForRead(serialRxMem, sizeof(serialRxMem));
    txRing = (uint8_t*)malloc(LINK_TX_RING);

    // Clip buffer: 6 s in PSRAM, 1 s of RAM2 without it
    uint32_t secs = external_psram_size ? LINK_CLIP_SECONDS : LINK_CLIP_FALLBACK_SECONDS;
    clipMax = (uint32_t)(secs * AUDIO_SAMPLE_RATE_EXACT);
    clipBuf = (int16_t*)(external_psram_size ? extmem_malloc(clipMax * 2) : malloc(clipMax * 2));
    if (!clipBuf) clipMax = 0;

    // Anti-alias low-pass before the 16 kHz resampler: 4th-order Butterworth
    // at 6.5 kHz as two RBJ biquads (Q 0.5412 and 1.3066)
    const float Q[2] = {0.5412f, 1.3066f};
    for (int k = 0; k < 2; k++) {
        float w = 2.0f * PI * 6500.0f / AUDIO_SAMPLE_RATE_EXACT;
        float c = cosf(w), alpha = sinf(w) / (2.0f * Q[k]), a0 = 1.0f + alpha;
        aa[k].b0 = (1.0f - c) / 2.0f / a0; aa[k].b1 = (1.0f - c) / a0; aa[k].b2 = aa[k].b0;
        aa[k].a1 = -2.0f * c / a0; aa[k].a2 = (1.0f - alpha) / a0;
        aa[k].x1 = aa[k].x2 = aa[k].y1 = aa[k].y2 = 0;
    }

    // A leading delimiter ends whatever the receiver collected before us
    if (txRing) { txRing[txHead++ % LINK_TX_RING] = 0x00; }
    sendHello();
    DEBUG_PRINTF("EspLink: Serial7 %d baud, clip buffer %lu s%s\n", LINK_BAUD_ACTIVE, secs,
                 clipBuf ? "" : " (none: clips off)");
}

bool EspLink::espAlive() const {
    return lastRxMs != 0 && millis() - lastRxMs < LINK_ALIVE_MS;
}

// ============================================
// TX
// ============================================

bool EspLink::send(uint8_t type, const void* payload, uint16_t len) {
    if (!txRing) return false;
    static uint8_t enc[LINK_MAX_ENCODED];
    size_t n = link_build_frame(type, txSeq, payload, len, enc);
    if (n == 0 || n > txFree()) {
        txDrops++;
        txSeq++;   // the receiver sees the gap
        return false;
    }
    for (size_t i = 0; i < n; i++) txRing[(txHead + i) % LINK_TX_RING] = enc[i];
    txHead += n;
    txSeq++;
    txFrames++;
    return true;
}

void EspLink::drainTx() {
    uint32_t used = txHead - txTail;
    if (!used) return;
    int room = ESP32_SERIAL.availableForWrite();
    if (room <= 0) return;
    uint32_t n = min(used, (uint32_t)room);
    while (n > 0) {
        uint32_t idx = txTail % LINK_TX_RING;
        uint32_t chunk = min(n, LINK_TX_RING - idx);   // contiguous part
        ESP32_SERIAL.write(txRing + idx, chunk);
        txTail += chunk;
        n -= chunk;
    }
}

void EspLink::sendAckErr(bool ok, uint16_t refSeq, uint8_t refType, uint8_t code) {
    if (ok) {
        LinkAck a = {refSeq, refType};
        send(MSG_ACK, &a, sizeof(a));
    } else {
        LinkErr e = {refSeq, refType, code};
        send(MSG_ERR, &e, sizeof(e));
    }
}

// ============================================
// RX
// ============================================

void EspLink::pollRx() {
    static uint8_t dec[LINK_MAX_ENCODED];
    for (int count = 0; count < LINK_RX_PER_UPDATE && ESP32_SERIAL.available(); count++) {
        uint8_t b = ESP32_SERIAL.read();
        if (b == 0x00) {
            if (rxOverflow) {
                rxErrs++;                         // too long: not one of ours
            } else if (rxLen > 0) {
                size_t m = link_cobs_decode(rxBuf, rxLen, dec);
                if (m == 0) rxErrs++;
                else handleFrame(dec, m);
            }                                     // empty frame: just a delimiter
            rxLen = 0;
            rxOverflow = false;
        } else if (rxLen < sizeof(rxBuf)) {
            rxBuf[rxLen++] = b;
        } else {
            rxOverflow = true;                    // e.g. the ESP32 boot banner
        }
    }
}

void EspLink::handleFrame(const uint8_t* raw, size_t n) {
    uint8_t type;
    uint16_t seq;
    const uint8_t* p;
    int len = link_parse_frame(raw, n, &type, &seq, &p);
    if (len < 0) { rxErrs++; return; }
    rxFrames++;
    lastRxMs = millis();

    switch (type) {
        case MSG_PLAN: {
            PlanError e = renderer ? renderer->queuePlan(p, len) : PLAN_ERR_LENGTH;
            sendAckErr(e == PLAN_OK, seq, type, 3);
            if (e != PLAN_OK) DEBUG_PRINTF("EspLink: plan rejected (%u)\n", e);
            break;
        }
        case MSG_REQ_CLIP: {
            LinkReqClip r = {SRC_MIC, LINK_CLIP_SECONDS};
            if (len >= (int)sizeof(r)) memcpy(&r, p, sizeof(r));
            bool ok = r.source <= SRC_LIGHT && r.seconds >= 1 && r.seconds <= 10 && clipBuf;
            if (ok) {
                // ACK / ERR is sent when the clip starts (or cannot)
                clipRequested = true; reqSource = r.source; reqSeconds = r.seconds; reqSeq = seq;
            } else {
                sendAckErr(false, seq, type, 3);
            }
            break;
        }
        case MSG_LINK_STATE: {
            if (len < (int)sizeof(LinkState)) { rxErrs++; break; }
            LinkState s;
            memcpy(&s, p, sizeof(s));
            bool serverUp = s.server && !linkState.server;
            if (memcmp(&s, &linkState, sizeof(s)) != 0 || !gotLinkState) stateChanges++;
            linkState = s;
            gotLinkState = true;
            if (serverUp) {            // new session: introduce ourselves again
                sendHello();
                capsPending = true;
            }
            break;
        }
        case MSG_RF:
            if (len >= (int)sizeof(LinkRf)) {
                memcpy(&rfData, p, sizeof(rfData));
                rfMs = millis();
            } else {
                rxErrs++;
            }
            break;
        case MSG_ACK:
            break;
        case MSG_ERR:
            if (len >= (int)sizeof(LinkErr)) {
                LinkErr e;
                memcpy(&e, p, sizeof(e));
                DEBUG_PRINTF("EspLink: server ERR %u for type 0x%02X seq %u\n", e.code, e.ref_type, e.ref_seq);
            }
            if (millis() - lastAnnounce > 2000) {   // the server may have lost our state
                lastAnnounce = millis();
                sendHello();
                capsPending = true;
            }
            break;
        default:
            sendAckErr(false, seq, type, 2);   // unknown type
            break;
    }
}

// ============================================
// PERIODIC MESSAGES
// ============================================

void EspLink::update() {
    pollRx();
    unsigned long now = millis();

    if (features && features->frameCount() != lastFeatFrame) {
        lastFeatFrame = features->frameCount();
        sendFeat();
        if (features->getLeftSource() == LEFT_SRC_PIEZO) sendPiezo();
        sendRadio(false);
    }
    sendOnsets();

    if (motion && motion->imuPresent() && motion->frameCount() != lastMotionFrame) {
        lastMotionFrame = motion->frameCount();
        sendMotion();
    }
    if (motion && motion->baroPresent() && now - lastEnvSent >= 1000) {
        lastEnvSent = now;
        sendEnv();
    }

    if (now - lastAnnounce >= LINK_REANNOUNCE_MS) {
        lastAnnounce = now;
        sendHello();
        capsPending = true;
    }

    if (now - last1Hz >= 1000) {
        last1Hz = now;
        sendPulse();
        sendRadio(true);
        sendGps();
    }

    if (captures && (captures->version() != capsVersionSent || capsPending) && now - lastCapsSent >= 500) {
        sendCaps();
    }

    if (input) {
        uint8_t b = 0;
        for (int i = 0; i < 4; i++) if (input->isButtonPressed(BTN_MODE + i)) b |= 1 << i;
        b |= (input->getJoystickState() & 0x0F) << 4;   // up, down, left, right (centre has no bit)
        if (b != lastButtons) { lastButtons = b; userDirty = true; }
    }
    if (userDirty && now - lastUserSent >= LINK_USER_MIN_MS) sendUser();

    clipUpdate();
    drainTx();
}

void EspLink::sendHello() {
    LinkHello h;
    memset(&h, 0, sizeof(h));
    h.proto = LINK_PROTO_VERSION;
    snprintf(h.fw, sizeof(h.fw), "teensy " VERSION);
    send(MSG_HELLO, &h, sizeof(h));
}

void EspLink::sendFeat() {
    const FeatureFrame& f = features->frame();
    LinkFeat lf;
    lf.t_ms = f.t_ms;
    for (int b = 0; b < 32; b++) lf.bands_db[b] = (int8_t)constrain(lroundf(f.bandsDb[b]), -128L, 0L);
    lf.rms = (uint16_t)constrain(f.rms * 65535.0f, 0.0f, 65535.0f);
    lf.centroid_hz = (uint16_t)constrain(f.centroidHz, 0.0f, 65535.0f);
    lf.flatness = (uint8_t)constrain(f.flatness * 255.0f, 0.0f, 255.0f);
    for (int c = 0; c < 12; c++) lf.chroma[c] = (uint8_t)constrain(f.chroma[c] * 255.0f, 0.0f, 255.0f);
    lf.pitch_hz_x10 = (uint16_t)constrain(f.pitchHz * 10.0f, 0.0f, 65535.0f);
    lf.pitch_conf = (uint8_t)(f.pitchConf * 255.0f);
    lf.onsets = f.onsets;
    lf.speech = (uint8_t)(f.speech * 255.0f);
    lf.left_source = f.source;
    send(MSG_FEAT, &lf, sizeof(lf));
}

void EspLink::sendPiezo() {
    const FeatureFrame& f = features->frame();
    LinkPiezo lp;
    lp.t_ms = f.t_ms;
    lp.rms = (uint16_t)constrain(f.rms * 65535.0f, 0.0f, 65535.0f);
    for (int g = 0; g < 8; g++) {   // 4 of the 32 bands each, summed as power
        float p = 0;
        for (int k = 0; k < 4; k++) p += powf(10.0f, f.bandsDb[g * 4 + k] / 10.0f);
        lp.bands_db[g] = (int8_t)constrain(lroundf(10.0f * log10f(p + 1e-13f)), -128L, 0L);
    }
    lp.peaks = f.onsets;
    send(MSG_PIEZO, &lp, sizeof(lp));
}

void EspLink::sendOnsets() {
    if (!features) return;
    OnsetEvent ev;
    for (int i = 0; i < 16 && features->popOnset(ev); i++) {
        LinkOnset o = {ev.t_ms, ev.source, ev.strength, ev.band};
        send(MSG_ONSET, &o, sizeof(o));
    }
}

void EspLink::sendPulse() {
    if (!features) return;
    const FeatureFrame& f = features->frame();
    LinkPulse lp;
    lp.t_ms = millis();
    lp.bpm_x10 = (uint16_t)(f.bpm * 10.0f);
    lp.conf = (uint8_t)(f.bpmConf * 255.0f);
    lp.phase_ms = f.phaseMs;
    lp.bar = sequencer ? (uint16_t)sequencer->getBarCount() : 0;
    lp.step = sequencer ? (uint8_t)(sequencer->getCurrentStep() & 0x0F) : 0;
    send(MSG_PULSE, &lp, sizeof(lp));
}

void EspLink::sendRadio(bool force) {
    if (!radio || !radio->isFitted()) return;
    char sig[sizeof(lastRadioSig)];
    snprintf(sig, sizeof(sig), "%u|%u|%s|%s", radio->getBand(), radio->getFrequency(),
             radio->getStationName(), radio->getRadioText());
    bool changed = strcmp(sig, lastRadioSig) != 0;
    if (!force && !changed) return;
    strcpy(lastRadioSig, sig);

    LinkRadio r;
    memset(&r, 0, sizeof(r));
    r.t_ms = millis();
    r.band = radio->getBand();
    r.freq_khz = radio->getBand() == BAND_FM ? (uint32_t)radio->getFrequency() * 10 : radio->getFrequency();
    r.rssi = radio->getRSSI();
    r.snr = radio->getSNR();
    r.speech_music = features ? (uint8_t)(features->radioFrame().speech * 255.0f) : 0;
    snprintf(r.rds_ps, sizeof(r.rds_ps), "%s", radio->getStationName());
    snprintf(r.rds_rt, sizeof(r.rds_rt), "%s", radio->getRadioText());
    send(MSG_RADIO, &r, sizeof(r));
}

void EspLink::sendGps() {
    if (!state) return;
    const GPSState& g = state->gps;
    LinkGps lg;
    lg.t_ms = millis();
    lg.lat_e7 = (int32_t)(g.lat * 1e7);
    lg.lon_e7 = (int32_t)(g.lon * 1e7);
    lg.alt_m = (int16_t)constrain(g.altM, -32768.0f, 32767.0f);
    lg.speed_cms = (uint16_t)constrain(g.speedKnots * 51.4444f, 0.0f, 65535.0f);
    lg.heading_cdeg = (uint16_t)constrain(g.headingDeg * 100.0f, 0.0f, 35999.0f);
    lg.fix = g.valid ? g.fixQuality : 0;
    lg.sats = g.sats;
    lg.utc = g.utc;
    send(MSG_GPS, &lg, sizeof(lg));
}

const LinkRf* EspLink::rf() const {
    return (rfMs && millis() - rfMs < LINK_RF_MAX_AGE_MS) ? &rfData : nullptr;
}

void EspLink::sendMotion() {
    const MotionFrame& m = motion->motion();
    LinkMotion lm;
    lm.t_ms = m.t_ms;
    lm.accel_rms_mg = (uint16_t)constrain(m.accelRmsMg, 0.0f, 65535.0f);
    lm.steps = m.steps;
    lm.cadence_x10 = (uint16_t)(m.cadence * 10.0f);
    for (int i = 0; i < 3; i++) lm.gyro_dps[i] = (int16_t)constrain(m.gyroDps[i], -32768.0f, 32767.0f);
    lm.pitch_cdeg = (int16_t)(m.pitchDeg * 100.0f);
    lm.roll_cdeg = (int16_t)(m.rollDeg * 100.0f);
    lm.heading_cdeg = m.headingDeg >= 0 ? (uint16_t)constrain(m.headingDeg * 100.0f, 0.0f, 35999.0f) : 0xFFFF;
    lm.mag_ut_x10 = (uint16_t)constrain(m.magUt * 10.0f, 0.0f, 65535.0f);
    lm.mag_var_x10 = (uint16_t)constrain(m.magVarUt * 10.0f, 0.0f, 65535.0f);
    lm.gesture = m.gesture;
    send(MSG_MOTION, &lm, sizeof(lm));
}

void EspLink::sendEnv() {
    const EnvFrame& e = motion->env();
    if (!e.valid) return;
    LinkEnv le;
    le.t_ms = e.t_ms;
    le.pressure_pa = (uint32_t)e.pressurePa;
    le.temp_cdeg = (int16_t)constrain(e.tempC * 100.0f, -32768.0f, 32767.0f);
    le.dalt_cm = (int16_t)constrain(e.daltM * 100.0f, -32768.0f, 32767.0f);
    le.dp_trend_pa_h = (int16_t)constrain(e.trendPaH, -32768.0f, 32767.0f);
    le.dp_fast_pa_x10 = (uint16_t)constrain(e.fastPa * 10.0f, 0.0f, 65535.0f);
    send(MSG_ENV, &le, sizeof(le));
}

void EspLink::sendCaps() {
    uint8_t buf[1 + CAPTURE_MAX * sizeof(LinkCapEntry)];
    uint8_t n = 0;
    for (int i = 0; i < CAPTURE_MAX; i++) {
        const Capture* c = captures->at(i);
        if (!c) continue;
        LinkCapEntry e;
        e.id = c->id;
        e.source = c->source;
        e.length_ms = (uint16_t)min(65535.0f, c->length * 1000.0f / AUDIO_SAMPLE_RATE_EXACT);
        e.kind = c->kind;
        e.role = c->role;
        e.onsets = c->onsetCount;
        e.pitch_hz_x10 = (uint16_t)constrain(c->pitchHz * 10.0f, 0.0f, 65535.0f);
        memcpy(buf + 1 + n * sizeof(e), &e, sizeof(e));
        n++;
    }
    buf[0] = n;
    if (send(MSG_CAPS, buf, 1 + n * sizeof(LinkCapEntry))) {
        capsVersionSent = captures->version();
        capsPending = false;
    }
    lastCapsSent = millis();
}

void EspLink::userFader(int id, float value) {
    (void)id; (void)value;   // positions are read fresh from the input manager when sending
    userDirty = true;
}

void EspLink::userEncoder(int id, int delta) {
    if (id < 0 || id >= ENC_COUNT) return;   // the ANO wheel has no slot in LinkUser
    user.enc_delta[id] = (int8_t)constrain(user.enc_delta[id] + delta, -128, 127);
    userDirty = true;
}

void EspLink::userPad(int pad) {
    if (pad < 0 || pad >= 8) return;
    user.pads |= 1 << pad;
    userDirty = true;
}

void EspLink::sendUser() {
    user.t_ms = millis();
    for (int i = 0; i < 5; i++) user.faders[i] = input ? (uint16_t)(input->getFaderValue(i) * 4095.0f) : 0;
    user.buttons = lastButtons;
    user.mode = state ? (uint8_t)state->mode : 0;
    send(MSG_USER, &user, sizeof(user));
    memset(user.enc_delta, 0, sizeof(user.enc_delta));
    user.pads = 0;
    userDirty = false;
    lastUserSent = millis();
}

// ============================================
// CLIPS (16 kHz IMA-ADPCM)
// ============================================

const char* EspLink::clipStatus() const {
    switch (clipPhase) {
        case CLIP_RECORD: return "rec";
        case CLIP_TAIL:   return "check";
        case CLIP_SEND:   return "send";
        default:          return clipBuf ? "idle" : "off";
    }
}

bool EspLink::clipStart(uint8_t source, uint8_t seconds) {
    AudioSense* sense = source == SRC_RADIO ? senseR : senseL;
    if (!sense || !clipBuf) return false;
    if (source != SRC_RADIO && features->getLeftSource() != source) return false;  // not selected
    if (sourceCarriesSpeech(source)) {
        if (!features->isReady()) return false;                  // detector not warmed up: refuse
        if (features->speechPresent()) {                         // privacy: someone is talking
            clipsPrivacy++;
            return false;
        }
    }
    uint32_t n = min((uint32_t)(seconds * AUDIO_SAMPLE_RATE_EXACT), clipMax);
    sense->armRecord(clipBuf, n, 1);
    clipSource = source;
    clipSpeechSeen = false;
    clipFeatFrame = clipFrameStart = features->frameCount();
    clipLostStart = features->getLostBlocks();
    clipStartMs = millis();
    clipPhase = CLIP_RECORD;
    return true;
}

void EspLink::clipUpdate() {
    if (!clipBuf || !features) return;
    unsigned long now = millis();
    AudioSense* sense = clipSource == SRC_RADIO ? senseR : senseL;

    // Track speech over the whole clip and the detector window after it
    if ((clipPhase == CLIP_RECORD || clipPhase == CLIP_TAIL) && features->frameCount() != clipFeatFrame) {
        clipFeatFrame = features->frameCount();
        if (features->speechPresent()) clipSpeechSeen = true;
    }

    switch (clipPhase) {
        case CLIP_IDLE: {
            bool periodic = espAlive() && linkState.server && now - lastClipMs >= LINK_CLIP_PERIOD_MS;
            if (!clipRequested && !periodic) return;
            uint8_t src, secs;
            bool fromReq = clipRequested;
            if (clipRequested) {
                src = reqSource; secs = reqSeconds;
                clipRequested = false;
            } else {
                // Alternate the left input and the radio
                static bool radioTurn = false;
                radioTurn = !radioTurn;
                src = (radioTurn && radio && radio->isFitted()) ? SRC_RADIO : features->getLeftSource();
                secs = LINK_CLIP_SECONDS;
            }
            lastClipMs = now;
            bool ok = clipStart(src, secs);
            clipFromRequest = ok && fromReq;
            clipReqSeq = reqSeq;
            if (fromReq) sendAckErr(ok, reqSeq, MSG_REQ_CLIP, 3);
            break;
        }
        case CLIP_RECORD:
            if (sense->isRecording(1)) return;
            clipLen = sense->recordedSamples(1);
            clipTailStart = now;
            clipPhase = CLIP_TAIL;
            break;
        case CLIP_TAIL: {
            if (sourceCarriesSpeech(clipSource) && now - clipTailStart < LINK_SPEECH_TAIL_MS) return;
            bool drop = false;
            if (sourceCarriesSpeech(clipSource)) {
                // Fail closed: speech seen, audio not analysed, or frames missed
                uint32_t expected = (now - clipStartMs) / FEAT_PERIOD_MS;
                uint32_t got = features->frameCount() - clipFrameStart;
                if (clipSpeechSeen || features->getLostBlocks() != clipLostStart ||
                    got * 10 < expected * 7) drop = true;
            }
            if (drop || clipLen < 1024) {
                if (drop) {
                    clipsPrivacy++;
                    DEBUG_PRINTLN("EspLink: clip dropped (speech or unanalysed audio)");
                }
                if (clipFromRequest) sendAckErr(false, clipReqSeq, MSG_REQ_CLIP, 3);
                clipPhase = CLIP_IDLE;
                return;
            }
            clipOutTotal = (uint32_t)((clipLen - 2) / CLIP_RATIO);
            clipOutPos = 0;
            clipInIdx = 0;
            rsF0 = rsF1 = 0;
            for (int k = 0; k < 2; k++) aa[k].x1 = aa[k].x2 = aa[k].y1 = aa[k].y2 = 0;
            adpcmPred = 0;
            adpcmIndex = 0;
            clipChunk = 0;
            clipChunks = (clipOutTotal + CLIP_SAMPLES_PER_CHUNK - 1) / CLIP_SAMPLES_PER_CHUNK;
            clipId++;
            clipPhase = CLIP_SEND;
            break;
        }
        case CLIP_SEND:
            // Paced (~20 KB/s) and only with room to spare for the live messages
            if (now - lastChunkMs < LINK_CLIP_CHUNK_MS) return;
            if (txFree() < LINK_MAX_ENCODED + 512) return;
            lastChunkMs = now;
            clipSendChunk();
            if (clipChunk >= clipChunks) {
                clipPhase = CLIP_IDLE;
                clipsDone++;
            }
            break;
    }
}

// Next 16 kHz sample: 6.5 kHz 4th-order low-pass on the 44.1 kHz input, linear interpolation
float EspLink::clipNextSample() {
    float pos = clipOutPos * CLIP_RATIO;
    uint32_t need = (uint32_t)pos + 1;
    while (clipInIdx <= need && clipInIdx < clipLen) {
        float y = clipBuf[clipInIdx] * (1.0f / 32768.0f);
        for (int k = 0; k < 2; k++) {
            Biquad& q = aa[k];
            float o = q.b0 * y + q.b1 * q.x1 + q.b2 * q.x2 - q.a1 * q.y1 - q.a2 * q.y2;
            q.x2 = q.x1; q.x1 = y; q.y2 = q.y1; q.y1 = o;
            y = o;
        }
        rsF0 = rsF1;
        rsF1 = y;
        clipInIdx++;
    }
    float frac = pos - floorf(pos);
    clipOutPos++;
    return rsF0 + (rsF1 - rsF0) * frac;
}

uint8_t EspLink::adpcmEncode(int16_t s) {
    int step = ADPCM_STEP[adpcmIndex];
    int diff = s - adpcmPred;
    uint8_t nib = 0;
    if (diff < 0) { nib = 8; diff = -diff; }
    int vpdiff = step >> 3;
    if (diff >= step) { nib |= 4; diff -= step; vpdiff += step; }
    step >>= 1;
    if (diff >= step) { nib |= 2; diff -= step; vpdiff += step; }
    step >>= 1;
    if (diff >= step) { nib |= 1; vpdiff += step; }
    int pred = adpcmPred + ((nib & 8) ? -vpdiff : vpdiff);
    adpcmPred = (int16_t)constrain(pred, -32768, 32767);
    adpcmIndex = (int8_t)constrain(adpcmIndex + ADPCM_INDEX[nib], 0, 88);
    return nib;
}

void EspLink::clipSendChunk() {
    static uint8_t buf[LINK_MAX_PAYLOAD];
    uint32_t n = min(CLIP_SAMPLES_PER_CHUNK, clipOutTotal - clipOutPos);
    LinkClipHdr h;
    h.clip_id = clipId;
    h.source = clipSource;
    h.sample_rate = LINK_CLIP_RATE;
    h.chunk = clipChunk;
    h.chunks = clipChunks;
    h.predictor = adpcmPred;
    h.step_index = (uint8_t)adpcmIndex;
    memcpy(buf, &h, sizeof(h));
    uint8_t* out = buf + sizeof(h);
    for (uint32_t i = 0; i < n; i += 2) {   // 2 samples per byte, low nibble first
        int16_t a = (int16_t)constrain(clipNextSample() * 32767.0f, -32768.0f, 32767.0f);
        uint8_t lo = adpcmEncode(a);
        uint8_t hi = 0;
        if (i + 1 < n) {
            int16_t b = (int16_t)constrain(clipNextSample() * 32767.0f, -32768.0f, 32767.0f);
            hi = adpcmEncode(b);
        }
        *out++ = lo | (hi << 4);
    }
    send(MSG_CLIP, buf, sizeof(h) + (n + 1) / 2);
    clipChunk++;
}
