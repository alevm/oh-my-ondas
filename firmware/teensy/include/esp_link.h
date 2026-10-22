/**
 * Oh My Ondas - ESP32-S2 link, Teensy side (Serial7: RX 28 <- ESP TX GPIO43,
 * TX 29 -> ESP RX GPIO44), protocol in common/link_protocol.h.
 *
 * Everything is non-blocking: frames go into a TX ring and are written only
 * as far as Serial7 has room (availableForWrite) each loop; RX bytes are
 * collected up to each 0x00 delimiter, COBS-decoded and CRC-checked. Garbage
 * (the ESP32 ROM boot banner, noise on an open RX pin) only counts as
 * errors. With no ESP32 connected the UART simply drains into nothing.
 *
 * Sends: HELLO at boot and whenever the server comes up (with CAPS), FEAT
 * every feature frame (10 Hz, LINE-IN L whatever its source), PIEZO at
 * 10 Hz while the source is the piezo, ONSET per event, PULSE / RADIO / GPS
 * at 1 Hz (RADIO also on change), USER on change (<= 10 Hz), CAPS on change,
 * CLIP on MSG_REQ_CLIP or every LINK_CLIP_PERIOD_MS while the server is up:
 * 16 kHz mono IMA-ADPCM chunks, low nibble first, at most one chunk per
 * LINK_CLIP_CHUNK_MS (~20 KB/s). HELLO + CAPS again when the server comes
 * up, every LINK_REANNOUNCE_MS and after a server ERR.
 *
 * Privacy (INTENT.md, design doc §3), fail-closed: a mic or piezo clip is
 * only started when the speech detector has a full window, and is never
 * sent if FeatureExtractor::speechPresent() was true at any time from the
 * start of the clip until the detector window (~1.5 s) after its end, or if
 * any audio blocks went unanalysed or feature frames were missed meanwhile.
 * Radio clips are broadcasts and are sent; coil and light clips cannot carry
 * speech acoustically and are sent too.
 *
 * Also MOTION at 10 Hz and ENV at 1 Hz when the IMU / barometer is fitted.
 *
 * Receives: PLAN (validated, handed to the renderer, ACK or ERR back),
 * REQ_CLIP, ACK / ERR, LINK_STATE (WiFi / server status for the LCD),
 * RF (WiFi density around, from the ESP32 scan; kept for LINK_RF_MAX_AGE_MS).
 */

#ifndef ESP_LINK_H
#define ESP_LINK_H

#include <Arduino.h>
#include "config.h"
#include "system_state.h"
#include "link_protocol.h"

class FeatureExtractor;
class CaptureStore;
class PlanRenderer;
class Sequencer;
class Radio;
class InputManager;
class AudioSense;
class MotionSensors;

#define LINK_TX_RING         8192
#define LINK_SERIAL_TX_MEM   2048   // added to Serial7's own buffer
#define LINK_SERIAL_RX_MEM   2048
#define LINK_RX_PER_UPDATE   1024   // bytes parsed per loop at most
#define LINK_CLIP_PERIOD_MS  60000
#define LINK_CLIP_SECONDS    6
#define LINK_CLIP_FALLBACK_SECONDS 1    // without PSRAM
#define LINK_CLIP_RATE       16000
#define LINK_SPEECH_TAIL_MS  1600       // detector window after the clip
#define LINK_ALIVE_MS        15000      // a valid frame this recently = ESP32 present
#define LINK_USER_MIN_MS     100
#define LINK_CLIP_CHUNK_MS   50         // clip pacing: 1 KB per 50 ms
#define LINK_REANNOUNCE_MS   30000      // HELLO + CAPS this often
#define LINK_RF_MAX_AGE_MS   60000      // MSG_RF older than this counts as none

class EspLink {
public:
    EspLink();

    void begin(FeatureExtractor* fe, CaptureStore* caps, PlanRenderer* renderer,
               Sequencer* seq, Radio* radio, InputManager* input, SystemState* state,
               AudioSense* senseL, AudioSense* senseR);
    void update();                         // every loop
    void setMotion(MotionSensors* m)       { motion = m; }
    const LinkRf* rf() const;              // latest MSG_RF, nullptr if none recent

    // USER events from the input callbacks
    void userFader(int id, float value);
    void userEncoder(int id, int delta);
    void userPad(int pad);
    void userChanged()                     { userDirty = true; }

    // Status (SENSE screen, header)
    bool     espAlive() const;
    uint8_t  wifiState() const             { return linkState.wifi; }
    uint8_t  serverState() const           { return espAlive() ? linkState.server : 0; }  // no ESP32: down
    int8_t   wifiRssi() const              { return linkState.rssi_dbm; }   // -128 = WiFi down
    bool     linkStateKnown() const        { return gotLinkState; }
    uint32_t framesSent() const            { return txFrames; }
    uint32_t framesReceived() const        { return rxFrames; }
    uint32_t rxErrors() const              { return rxErrs; }
    uint32_t txDropped() const             { return txDrops; }
    uint32_t clipsSent() const             { return clipsDone; }
    uint32_t clipsBlocked() const          { return clipsPrivacy; }
    uint32_t stateVersion() const          { return stateChanges; }  // bumps on LINK_STATE change
    const char* clipStatus() const;

private:
    FeatureExtractor* features;
    CaptureStore*     captures;
    PlanRenderer*     renderer;
    Sequencer*        sequencer;
    Radio*            radio;
    InputManager*     input;
    SystemState*      state;
    AudioSense*       senseL;
    AudioSense*       senseR;
    MotionSensors*    motion;
    uint32_t          lastMotionFrame;
    unsigned long     lastEnvSent;
    LinkRf            rfData;
    unsigned long     rfMs;

    // TX
    uint8_t* txRing;
    uint32_t txHead, txTail;   // free-running byte counters
    uint16_t txSeq;
    uint32_t txFrames, txDrops;

    // RX
    uint8_t  rxBuf[LINK_MAX_ENCODED];
    uint16_t rxLen;
    bool     rxOverflow;
    uint32_t rxFrames, rxErrs;
    unsigned long lastRxMs;

    LinkState linkState;
    bool      gotLinkState;
    uint32_t  stateChanges;

    // Periodic
    uint32_t lastFeatFrame;
    unsigned long last1Hz, lastUserSent, lastCapsSent;
    uint32_t capsVersionSent;
    bool     capsPending;
    char     lastRadioSig[96];

    // USER accumulation
    LinkUser user;
    bool     userDirty;
    uint8_t  lastButtons;

    // CLIP state machine
    enum ClipPhase : uint8_t { CLIP_IDLE, CLIP_RECORD, CLIP_TAIL, CLIP_SEND };
    ClipPhase clipPhase;
    int16_t*  clipBuf;
    uint32_t  clipMax, clipLen;
    uint8_t   clipSource;
    uint16_t  clipId;
    bool      clipSpeechSeen;
    unsigned long clipTailStart, lastClipMs, clipStartMs, lastChunkMs, lastAnnounce;
    uint32_t  clipFeatFrame, clipFrameStart, clipLostStart;
    bool      clipFromRequest;
    uint16_t  clipReqSeq;
    uint16_t  reqSeq;
    uint32_t  clipsDone, clipsPrivacy;
    // resampler + ADPCM state, persistent across chunks
    uint32_t  clipOutTotal, clipOutPos, clipInIdx;
    float     rsF0, rsF1;
    struct Biquad { float b0, b1, b2, a1, a2, x1, x2, y1, y2; };
    Biquad    aa[2];             // 4th-order Butterworth low-pass, 6.5 kHz
    int16_t   adpcmPred;
    int8_t    adpcmIndex;
    uint16_t  clipChunk, clipChunks;
    bool      clipRequested;
    uint8_t   reqSource, reqSeconds;

    bool send(uint8_t type, const void* payload, uint16_t len);
    uint32_t txFree() const { return LINK_TX_RING - (txHead - txTail); }
    void drainTx();
    void pollRx();
    void handleFrame(const uint8_t* raw, size_t n);
    void sendAckErr(bool ok, uint16_t refSeq, uint8_t refType, uint8_t code);

    void sendHello();
    void sendFeat();
    void sendPiezo();
    void sendOnsets();
    void sendPulse();
    void sendRadio(bool force);
    void sendGps();
    void sendCaps();
    void sendUser();
    void sendMotion();
    void sendEnv();

    void clipUpdate();
    bool clipStart(uint8_t source, uint8_t seconds);
    void clipSendChunk();
    float clipNextSample();
    uint8_t adpcmEncode(int16_t s);
};

#endif // ESP_LINK_H
