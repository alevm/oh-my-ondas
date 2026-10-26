// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Oh My Ondas - Playable demo on the bench as wired today
 *
 *   Pads 1-4   kick, snare, hat, tom      Pads 5-8   C E G A
 *   Pads 1+4   groove on / off            Pads 2+3   clear what you added
 *   Pads 5+8   capture 1.5 s from the mic: pads 5-8 then play it at C E G A
 *   Pads 6+7   back to the synth notes
 *   Piezo tap  kick (contact mic on the table)
 *   Fader F3   low-pass filter on everything (ADS1115 A2)
 *
 * With the groove on, drum hits (pads and piezo) are also written into the
 * 16-step loop at the nearest step, so you build the beat by playing it.
 *
 * Inputs on the Audio Shield: LINE-IN L = MAX9814 OUT through 1 uF,
 * LINE-IN R = piezo disc (the radio's input, free until the Si4732 is in).
 *
 * Hardware code from test/bench_all (same pins, same parts, hot-plug, LCD
 * re-init). The LCD redraws only what changed: its SPI traffic is audible.
 * The running step is shown on the OLED, not on the LCD, for that reason.
 *
 * Flash: BENCH_SKETCH=demo_play firmware/flash.sh bench
 * Serial (115200): one status line a second.
 */

#include <Audio.h>
#include <Wire.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ILI9341.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_CAP1188.h>
#include <Adafruit_ADS1X15.h>
#include "play_capture.h"   // firmware/teensy/include, built via play_capture_link.cpp

#define UI_BUS Wire2

AudioSynthSimpleDrum     kick, snareBody, tom;
AudioSynthNoiseWhite     noise;
AudioEffectEnvelope      snareEnv, hatEnv;
AudioFilterStateVariable hatHp;
AudioSynthWaveform       voice[4];
AudioEffectEnvelope      env[4];
AudioMixer4              drums, melo, mix;
AudioFilterStateVariable lp;   // F3
AudioOutputI2S           i2sOut;
AudioConnection          pn1(noise, snareEnv), pn2(noise, 0, hatHp, 0), pn3(hatHp, 2, hatEnv, 0);
AudioConnection          pd0(kick, 0, drums, 0), pd1(snareBody, 0, drums, 1), pd2(snareEnv, 0, drums, 2), pd3(tom, 0, drums, 3);
AudioConnection          pv0(voice[0], env[0]), pv1(voice[1], env[1]), pv2(voice[2], env[2]), pv3(voice[3], env[3]);
AudioConnection          pe0(env[0], 0, melo, 0), pe1(env[1], 0, melo, 1), pe2(env[2], 0, melo, 2), pe3(env[3], 0, melo, 3);
AudioInputI2S            i2sIn;
AudioAnalyzePeak         micPeak, piezoPeak;
AudioRecordQueue         recQ;
AudioPlayCapture         capVoice[4];
AudioMixer4              capMix;
AudioConnection          pi0(i2sIn, 0, micPeak, 0), pi1(i2sIn, 0, recQ, 0), pi2(i2sIn, 1, piezoPeak, 0);
AudioConnection          pc0(capVoice[0], 0, capMix, 0), pc1(capVoice[1], 0, capMix, 1), pc2(capVoice[2], 0, capMix, 2), pc3(capVoice[3], 0, capMix, 3);
AudioConnection          pm0(hatEnv, 0, mix, 0), pm1(capMix, 0, mix, 1), pm2(drums, 0, mix, 2), pm3(melo, 0, mix, 3);
AudioConnection          pf(mix, 0, lp, 0), pcL(lp, 0, i2sOut, 0), pcR(lp, 0, i2sOut, 1);
AudioControlSGTL5000     codec;

Adafruit_ILI9341 lcd(&SPI1, 37, 38, 36);
Adafruit_SSD1306 oled(128, 64, &UI_BUS, -1);
Adafruit_CAP1188 touch;
Adafruit_ADS1115 ads;

enum { CAP, OLED, ADS, NPARTS };
const uint8_t ADDR[NPARTS] = {0x29, 0x3C, 0x48};
const char* NAME[NPARTS] = {"CAP", "OLED", "ADS"};
bool on[NPARTS];

const float NOTE[4] = {261.63f, 329.63f, 392.00f, 440.00f};  // C E G A
const char* PAD_NAME[8] = {"KICK", "SNARE", "HAT", "TOM", "C", "E", "G", "A"};
const int FILTER_FADER = 2;   // F3, the wired one

// ---------- mic capture: 1.5 s in RAM2, played by 4 voices at C E G A
const uint32_t CAP_LEN = 66150;
DMAMEM int16_t capBuf[CAP_LEN];
uint32_t capFill = 0;          // samples recorded so far
bool capturing = false, capReady = false;
float capPeak = 0;             // loudest sample of the capture, for the level
const float RATIO[4] = {1.0f, 1.2599f, 1.4983f, 1.6818f};   // C E G A from C

// ---------- piezo: a tap above the threshold plays the kick
const float PIEZO_MIN = 0.10f;   // threshold floor; above the noise x4
float piezoNow = 0, piezoNoise = 0.01f, micNow = 0;
uint32_t piezoHits = 0, piezoLast = 0;

// ---------- groove: 4 drums x 16 steps, stepped by a timer so screen and I2C work cannot shift it
const float BPM = 100;
const uint16_t BASE[4] = {0x0101 | 0x0400, 0x1010, 0x5555, 0x0000};   // bit n = step n: kick, snare, hat, tom
volatile uint16_t pattern[4];
volatile uint16_t skipOnce[4];      // a hit written ahead of the beat already sounded: skip its next pass
volatile int curStep = 0;
volatile uint32_t stepAt = 0;       // micros() of the current step
volatile bool grooveOn = false;
IntervalTimer stepTimer;
const uint32_t STEP_US = (uint32_t)(60e6f / BPM / 4);

void hitDrum(int d) {
    switch (d) {
        case 0: kick.noteOn(); break;
        case 1: snareBody.noteOn(); snareEnv.noteOn(); break;
        case 2: hatEnv.noteOn(); break;
        case 3: tom.noteOn(); break;
    }
}

void onStep() {
    curStep = (curStep + 1) & 15;
    stepAt = micros();
    for (int d = 0; d < 4; d++) {
        uint16_t bit = 1 << curStep;
        if (!(pattern[d] & bit)) continue;
        if (skipOnce[d] & bit) { skipOnce[d] &= ~bit; continue; }
        hitDrum(d);
    }
}

// A pad hit while the groove runs goes into the loop at the nearest step
void recordHit(int d) {
    noInterrupts();
    int s = curStep;
    bool late = micros() - stepAt > STEP_US / 2;
    if (late) { s = (s + 1) & 15; skipOnce[d] |= 1 << s; }
    pattern[d] |= 1 << s;
    interrupts();
}

// ---------- state shown on screen
uint8_t touched = 0;
uint32_t hits = 0, lcdReinits = 0, capErrors = 0, adsTimeouts = 0, busRecoveries = 0;
float fader = -1;        // F3 0-100, -1 until read
float faderLo = 100, faderHi = 0;
bool audioOk = false;

// ---------- hardware helpers (from test/bench_all)
bool busClear() {
    pinMode(25, INPUT_PULLUP);
    pinMode(24, INPUT_PULLUP);
    delayMicroseconds(20);
    if (digitalRead(25)) { UI_BUS.begin(); return false; }
    pinMode(24, OUTPUT_OPENDRAIN);
    for (int i = 0; i < 18 && !digitalRead(25); i++) {
        digitalWrite(24, 0); delayMicroseconds(10);
        digitalWrite(24, 1); delayMicroseconds(10);
    }
    pinMode(24, INPUT_PULLUP);
    UI_BUS.begin();
    busRecoveries++;
    return true;
}

bool present(TwoWire& b, uint8_t a) { b.beginTransmission(a); return b.endTransmission() == 0; }

bool capRead(uint8_t& t) {
    UI_BUS.beginTransmission(0x29); UI_BUS.write(0x03);
    if (UI_BUS.endTransmission(false) != 0 || UI_BUS.requestFrom(0x29, 1) != 1) return false;
    t = UI_BUS.read();
    if (t) {
        UI_BUS.beginTransmission(0x29); UI_BUS.write(0x00);
        if (UI_BUS.endTransmission(false) != 0 || UI_BUS.requestFrom(0x29, 1) != 1) return false;
        uint8_t m = UI_BUS.read() & ~0x01;
        UI_BUS.beginTransmission(0x29); UI_BUS.write(0x00); UI_BUS.write(m);
        if (UI_BUS.endTransmission() != 0) return false;
    }
    return true;
}

// F3 only, non-blocking, 10 ms limit
bool adsBusy = false;
uint32_t adsStarted = 0;

void adsService(uint32_t now) {
    if (!on[ADS]) { adsBusy = false; return; }
    if (adsBusy) {
        if (ads.conversionComplete()) {
            float p = constrain(ads.getLastConversionResults() * 100.0f / 26400, 0.0f, 100.0f);
            fader = fader < 0 ? p : fader * 0.6f + p * 0.4f;   // light smoothing against wiper noise
            faderLo = min(faderLo, p); faderHi = max(faderHi, p);
            adsBusy = false;
        } else if (now - adsStarted > 10) { adsTimeouts++; adsBusy = false; }
        else return;
    }
    ads.startADCReading(MUX_BY_CHANNEL[FILTER_FADER], false);
    adsStarted = now; adsBusy = true;
}

bool startPart(int p) {
    switch (p) {
    case CAP: {
        static bool begun = false;
        if (!begun && !touch.begin(0x29, &UI_BUS)) return false;
        begun = true;
        touch.writeRegister(0x1F, 0x4F);  // 8x gain (16x gave phantom touches)
        touch.writeRegister(0x20, touch.readRegister(0x20) | 0x08);
        touch.writeRegister(0x26, 0xFF);
        touch.writeRegister(0x72, 0xFF);  // LED n follows pad n
        return true;
    }
    case OLED: return oled.begin(SSD1306_SWITCHCAPVCC, 0x3C);
    case ADS:
        if (!ads.begin(0x48, &UI_BUS)) return false;
        ads.setGain(GAIN_ONE);            // 3.3 V = 26400 counts
        ads.setDataRate(RATE_ADS1115_860SPS);
        return true;
    }
    return false;
}

// Filter: F3 bottom = 150 Hz, top = 15 kHz, exponential. Before F3 is moved, wide open.
float cutoffHz() {
    if (fader < 0 || faderHi - faderLo < 20) return 15000;
    return 150.0f * powf(100.0f, fader / 100.0f);
}

// ---------- LCD (320x240), drawn only on change
const uint16_t GREY = 0x7BEF, DARK = 0x2104, PAD_OFF = 0x18E3;
const uint16_t DRUM_COL = 0xFD20, NOTE_COL = 0x07FF;   // orange, cyan
const int GRID_X = 24, GRID_Y = 156, CELL = 18;
bool lcdDirty = true;

void drawStatic() {
    lcd.fillScreen(ILI9341_BLACK);
    lcd.setTextColor(ILI9341_GREEN, ILI9341_BLACK);
    lcd.setTextSize(3);
    lcd.setCursor(8, 6);
    lcd.print("OH MY ONDAS");
    lcd.setTextSize(1);
    lcd.setTextColor(GREY, ILI9341_BLACK);
    lcd.setCursor(212, 8);  lcd.print("1+4 groove");
    lcd.setCursor(212, 18); lcd.print("2+3 clear");
    lcd.setCursor(212, 28); lcd.print("F3  filter");
    const char* row[4] = {"K", "S", "H", "T"};
    for (int d = 0; d < 4; d++) { lcd.setCursor(10, GRID_Y + d * CELL + 5); lcd.print(row[d]); }
    lcdDirty = true;
}

void drawPad(int i, bool lit) {
    int x = 8 + (i % 4) * 78, y = 40 + (i / 4) * 52;
    uint16_t c = i < 4 ? DRUM_COL : NOTE_COL;
    lcd.fillRoundRect(x, y, 72, 46, 6, lit ? c : PAD_OFF);
    lcd.setTextSize(2);
    lcd.setTextColor(lit ? ILI9341_BLACK : c);
    int w = strlen(PAD_NAME[i]) * 12;
    lcd.setCursor(x + (72 - w) / 2, y + 16);
    lcd.print(PAD_NAME[i]);
}

void drawDynamic() {
    static uint8_t lastTouched = 0xFF;
    static uint16_t lastPat[4];
    static bool lastGroove, lastCap = true;
    static int lastCut = -1;
    static uint32_t lastHits = 0xFFFFFFFF;
    bool all = lcdDirty;
    lcdDirty = false;

    if (all || touched != lastTouched || on[CAP] != lastCap) {
        for (int i = 0; i < 8; i++) {
            bool lit = touched & (1 << i);
            if (all || on[CAP] != lastCap || lit != (bool)(lastTouched & (1 << i))) drawPad(i, lit);
        }
        lastTouched = touched;
        if (all || on[CAP] != lastCap) {
            lcd.setTextSize(1);
            lcd.setCursor(212, 40 + 104 + 4);
            lcd.setTextColor(ILI9341_RED, ILI9341_BLACK);
            lcd.print(on[CAP] ? "          " : "no CAP1188");
        }
        lastCap = on[CAP];
    }

    for (int d = 0; d < 4; d++) {
        uint16_t p = pattern[d];
        if (!all && p == lastPat[d]) continue;
        for (int s = 0; s < 16; s++) {
            bool v = p & (1 << s), was = lastPat[d] & (1 << s);
            if (!all && v == was) continue;
            int x = GRID_X + s * CELL, y = GRID_Y + d * CELL;
            bool user = v && !(BASE[d] & (1 << s));
            lcd.fillRect(x, y, CELL - 3, CELL - 3, v ? (user ? ILI9341_YELLOW : DRUM_COL) : (s % 4 ? PAD_OFF : DARK));
        }
        lastPat[d] = p;
    }

    if (all || grooveOn != lastGroove || hits != lastHits) {
        lcd.setTextSize(1);
        lcd.setCursor(8, 230);
        lcd.setTextColor(grooveOn ? ILI9341_GREEN : GREY, ILI9341_BLACK);
        lcd.printf("groove %s  %3.0f BPM   hits %-6lu", grooveOn ? "ON " : "off", BPM, hits);
        lastGroove = grooveOn; lastHits = hits;
    }

    static int lastCapState = -1;
    int capState = capturing ? 1 : capReady ? 2 : 0;
    if (all || capState != lastCapState) {
        lcd.setTextSize(1);
        lcd.setCursor(8, 144);
        lcd.setTextColor(capturing ? ILI9341_RED : capReady ? ILI9341_YELLOW : GREY, ILI9341_BLACK);
        lcd.print(capturing ? "REC mic 1.5 s ...          " : capReady ? "pads 5-8 play the mic      " : "5+8 capture mic  6+7 synth ");
        lastCapState = capState;
    }

    int cut = (int)cutoffHz();
    if (all || abs(cut - lastCut) > lastCut / 20) {   // 5 %: wiper noise does not redraw
        lcd.setTextSize(1);
        lcd.setCursor(212, 230);
        lcd.setTextColor(NOTE_COL, ILI9341_BLACK);
        lcd.printf("LP %5d Hz", cut);
        lastCut = cut;
    }
}

// ---------- OLED: running step + pads
void drawOled() {
    static int lastStep = -1;
    static uint8_t lastT = 0xFF;
    static bool lastG = false;
    static int lastMic = -1, lastPz = -1;
    int st = grooveOn ? curStep : -1;
    int mic = (int)(micNow * 20), pz = (int)(piezoNow * 20);   // 20 px meters
    if (st == lastStep && touched == lastT && grooveOn == lastG && mic == lastMic && pz == lastPz) return;
    lastStep = st; lastT = touched; lastG = grooveOn; lastMic = mic; lastPz = pz;
    oled.clearDisplay();
    oled.setTextColor(SSD1306_WHITE);
    oled.setTextSize(1);
    oled.setCursor(0, 0);
    oled.print(grooveOn ? "GROOVE" : "play the pads");
    for (int s = 0; s < 16; s++) {
        if (s == st) oled.fillRect(s * 8, 14, 7, 10, SSD1306_WHITE);
        else oled.drawRect(s * 8, 14 + (s % 4 ? 3 : 0), 7, s % 4 ? 4 : 10, SSD1306_WHITE);
    }
    for (int i = 0; i < 8; i++) {
        if (touched & (1 << i)) oled.fillRect(i * 16 + 1, 34, 14, 14, SSD1306_WHITE);
        else oled.drawRect(i * 16 + 1, 34, 14, 14, SSD1306_WHITE);
    }
    oled.setCursor(0, 54);  oled.print("MIC");
    oled.drawRect(20, 54, 42, 8, SSD1306_WHITE); oled.fillRect(21, 55, min(mic * 2, 40), 6, SSD1306_WHITE);
    oled.setCursor(66, 54); oled.print("PZ");
    oled.drawRect(80, 54, 42, 8, SSD1306_WHITE); oled.fillRect(81, 55, min(pz * 2, 40), 6, SSD1306_WHITE);
    oled.display();
}

// ---------- capture and piezo
void startCapture() {
    capFill = 0; capPeak = 0; capturing = true; capReady = false;
    for (int v = 0; v < 4; v++) capVoice[v].stopNow();
    recQ.clear();
    recQ.begin();
}

void serviceCapture() {
    while (recQ.available()) {
        const int16_t* b = recQ.readBuffer();
        if (capturing) {
            uint32_t n = min((uint32_t)AUDIO_BLOCK_SAMPLES, CAP_LEN - capFill);
            memcpy(capBuf + capFill, b, n * 2);
            for (uint32_t i = 0; i < n; i++) capPeak = max(capPeak, abs(b[i]) / 32768.0f);
            capFill += n;
        }
        recQ.freeBuffer();
        if (capturing && capFill >= CAP_LEN) {
            recQ.end();
            capturing = false;
            capReady = capPeak > 0.01f;   // silence (mic not connected) is no capture
        }
    }
}

void playCaptureNote(int v) {
    // normalise quiet captures up to ~0.5 peak, never boost more than 8x
    float g = constrain(0.5f / max(capPeak, 0.01f), 0.5f, 8.0f) * 0.6f;
    capVoice[v].playSlice(capBuf, 0, CAP_LEN, RATIO[v], g);
}

void servicePiezo(uint32_t now) {
    if (piezoPeak.available()) {
        piezoNow = piezoPeak.read();
        float thr = max(PIEZO_MIN, piezoNoise * 4);
        if (piezoNow > thr && now - piezoLast > 90) {   // 90 ms: one tap rings, one hit
            piezoLast = now;
            piezoHits++;
            hits++;
            hitDrum(0);
            if (grooveOn) recordHit(0);
        } else if (now - piezoLast > 300) {
            piezoNoise = piezoNoise * 0.995f + piezoNow * 0.005f;   // slow floor when no taps
        }
    }
    if (micPeak.available()) micNow = micPeak.read();
}

// ---------- pads
void onPads(uint8_t t) {
    uint8_t fresh = t & ~touched, gone = touched & ~t;
    // two-pad gestures: on the press that completes the pair
    if ((fresh & 0x09) && (t & 0x09) == 0x09) {
        grooveOn = !grooveOn;
        if (grooveOn) { curStep = 15; stepTimer.begin(onStep, STEP_US); }
        else stepTimer.end();
        fresh &= ~0x09;
    }
    if ((fresh & 0x06) && (t & 0x06) == 0x06) {
        noInterrupts();
        for (int d = 0; d < 4; d++) { pattern[d] = BASE[d]; skipOnce[d] = 0; }
        interrupts();
        fresh &= ~0x06;
    }
    if ((fresh & 0x90) && (t & 0x90) == 0x90) {   // 5+8: capture from the mic
        for (int v = 0; v < 4; v++) env[v].noteOff();
        startCapture();
        fresh &= ~0x90;
    }
    if ((fresh & 0x60) && (t & 0x60) == 0x60) {   // 6+7: back to the synth
        capReady = false;
        for (int v = 0; v < 4; v++) capVoice[v].stop();
        fresh &= ~0x60;
    }
    for (int i = 0; i < 8; i++) {
        if (fresh & (1 << i)) {
            hits++;
            if (i < 4) { hitDrum(i); if (grooveOn) recordHit(i); }
            else if (capReady) playCaptureNote(i - 4);
            else if (!capturing) env[i - 4].noteOn();
        }
        if (i >= 4 && (gone & (1 << i))) env[i - 4].noteOff();
    }
    touched = t;
}

void setup() {
    Serial.begin(115200);
    AudioMemory(60);     // + the record queue
    codec.enable();
    codec.inputSelect(AUDIO_INPUT_LINEIN);
    codec.lineInLevel(0, 5);   // L: MAX9814 ~2 Vpp (as config.h); R: bare piezo, mid gain
    codec.volume(0.3);   // quiet
    capMix.gain(0, 0.5f); capMix.gain(1, 0.5f); capMix.gain(2, 0.5f); capMix.gain(3, 0.5f);
    kick.frequency(60); kick.length(300); kick.pitchMod(0.55f);
    snareBody.frequency(200); snareBody.length(100);
    tom.frequency(120); tom.length(250); tom.pitchMod(0.6f);
    noise.amplitude(0.5f);
    snareEnv.attack(1); snareEnv.decay(120); snareEnv.sustain(0); snareEnv.release(50);
    hatHp.frequency(7000);
    hatEnv.attack(1); hatEnv.decay(40); hatEnv.sustain(0); hatEnv.release(20);
    drums.gain(0, 0.5f); drums.gain(1, 0.25f); drums.gain(2, 0.25f); drums.gain(3, 0.4f);
    mix.gain(0, 0.3f); mix.gain(1, 1); mix.gain(2, 1); mix.gain(3, 1);
    lp.frequency(15000); lp.resonance(1.2f);
    for (int i = 0; i < 4; i++) {
        voice[i].begin(0.12f, NOTE[i], WAVEFORM_TRIANGLE);
        env[i].attack(5); env[i].decay(250); env[i].sustain(0.5f); env[i].release(400);
        melo.gain(i, 0.5f);
    }
    for (int d = 0; d < 4; d++) pattern[d] = BASE[d];
    Wire.begin();
    busClear();
    UI_BUS.begin();
    SPI1.setMISO(39);
    lcd.begin();
    lcd.setRotation(3);
    drawStatic();
}

void loop() {
    static uint32_t lastScan = 0, lastFast = 0, lastDraw = 0;
    static int lastCut = -1;
    uint32_t now = millis();

    adsService(now);
    serviceCapture();
    servicePiezo(now);

    if (now - lastScan >= 1000) {   // hot-plug, LCD check, serial line
        lastScan = now;
        audioOk = present(Wire, 0x0A);
        bool anyOn = false, anyHere = false, here[NPARTS];
        for (int i = 0; i < NPARTS; i++) { anyOn |= on[i]; here[i] = present(UI_BUS, ADDR[i]); anyHere |= here[i]; }
        if (anyOn && !anyHere && busClear()) {
            for (int i = 0; i < NPARTS; i++) { on[i] = false; here[i] = present(UI_BUS, ADDR[i]); }
        }
        for (int i = 0; i < NPARTS; i++) {
            if (here[i] && !on[i]) on[i] = startPart(i);
            if (!here[i]) on[i] = false;
        }
        if (lcd.readcommand8(ILI9341_RDMODE) != 0x94) {
            lcdReinits++;
            lcd.begin(); lcd.setRotation(3); drawStatic();
        }
        static bool crashShown = false;
        if (!crashShown && Serial && CrashReport) { Serial.print(CrashReport); crashShown = true; }
        Serial.printf("up %lus audio %s |", now / 1000, audioOk ? "OK" : "--");
        for (int i = 0; i < NPARTS; i++) Serial.printf(" %s %s", NAME[i], on[i] ? "OK" : "--");
        Serial.printf(" | groove %s step %d | hits %lu | F3 %d (%d-%d) LP %d Hz | lcd reinit %lu bus clear %lu",
                      grooveOn ? "on" : "off", curStep, hits, (int)fader, (int)faderLo, (int)faderHi,
                      (int)cutoffHz(), lcdReinits, busRecoveries);
        Serial.printf(" | mic %.2f cap %s %lu peak %.2f | piezo %.2f noise %.3f hits %lu",
                      micNow, capturing ? "rec" : capReady ? "ready" : "none", capFill, capPeak,
                      piezoNow, piezoNoise, piezoHits);
        Serial.printf(" | ads timeout %lu cap err %lu | audio mem %d/60 cpu %.1f%%\n",
                      adsTimeouts, capErrors, AudioMemoryUsageMax(), AudioProcessorUsageMax());
    }

    if (now - lastFast >= 15) {   // pads every 15 ms
        lastFast = now;
        if (on[CAP]) {
            uint8_t t = 0;
            if (capRead(t)) onPads(t); else capErrors++;   // a failed read is not a touch
        }
        int cut = (int)cutoffHz();
        if (cut != lastCut) { lp.frequency(cut); lastCut = cut; }
    }

    if (now - lastDraw >= 40) {
        lastDraw = now;
        drawDynamic();
    }
    static uint32_t lastOled = 0;
    if (on[OLED] && now - lastOled >= 100) { lastOled = now; drawOled(); }   // ~25 ms per frame
}
