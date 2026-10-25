// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Oh My Ondas - Bench test: every fitted part live at the same time
 *
 * For the incremental rebuild: everything wired so far keeps running while
 * the next part goes in, so a new part that breaks an old one shows at once.
 * Parts are found on Wire2 every second and started when they appear
 * (hot-plug), shown grey when absent, red when lost after being seen.
 *
 *   LCD     SPI1 (CLK 27, MOSI 26, MISO 39, CS 38, D/C 37, RST 36), auto re-init
 *   Audio   SGTL5000 0x0A on Wire, quiet sound (codec 0.3)
 *   Wire2   (SDA 25, SCL 24):
 *     0x29 CAP1188   8 pads, LEDs follow touches; pads 1-4 drums, 5-8 notes (wired fader picks the octave)
 *     0x3C OLED      touch squares + fader values
 *     0x48 ADS1115   faders 1-4 on A0-A3 (fader 5 on Teensy pin 40)
 *     0x10 GPS       PA1010D: fix, satellites, UTC time (no position shown)
 *     0x20 MCP23017  nav GPA0-4, buttons GPB0-3 (to GND, pull-ups on), beep per press
 *
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

#define UI_BUS     Wire2
#define FADER5_PIN 40

// pads 1-4 drums (kick, snare, hat, tom), pads 5-8 notes that play while held
AudioSynthWaveformSine   beepTone;
AudioSynthSimpleDrum     kick, snareBody, tom;
AudioSynthNoiseWhite     noise;
AudioEffectEnvelope      snareEnv, hatEnv;
AudioFilterStateVariable hatHp;
AudioSynthWaveform       voice[4];
AudioEffectEnvelope      env[4];
AudioMixer4              drums, melo, mix;
AudioOutputI2S           i2sOut;
AudioConnection          pn1(noise, snareEnv), pn2(noise, 0, hatHp, 0), pn3(hatHp, 2, hatEnv, 0);
AudioConnection          pd0(kick, 0, drums, 0), pd1(snareBody, 0, drums, 1), pd2(snareEnv, 0, drums, 2), pd3(tom, 0, drums, 3);
AudioConnection          pv0(voice[0], env[0]), pv1(voice[1], env[1]), pv2(voice[2], env[2]), pv3(voice[3], env[3]);
AudioConnection          pe0(env[0], 0, melo, 0), pe1(env[1], 0, melo, 1), pe2(env[2], 0, melo, 2), pe3(env[3], 0, melo, 3);
AudioConnection          pm0(hatEnv, 0, mix, 0), pm1(beepTone, 0, mix, 1), pm2(drums, 0, mix, 2), pm3(melo, 0, mix, 3);
AudioConnection        pcL(mix, 0, i2sOut, 0), pcR(mix, 0, i2sOut, 1);
AudioControlSGTL5000   codec;

Adafruit_ILI9341 lcd(&SPI1, 37, 38, 36);
Adafruit_SSD1306 oled(128, 64, &UI_BUS, -1);
Adafruit_CAP1188 touch;
Adafruit_ADS1115 ads;

enum { CAP, OLED, ADS, GPS, MCP, NPARTS };
const uint8_t ADDR[NPARTS] = {0x29, 0x3C, 0x48, 0x10, 0x20};
const char* NAME[NPARTS] = {"CAP", "OLED", "ADS", "GPS", "MCP"};
bool on[NPARTS], seen[NPARTS];
uint32_t lost[NPARTS];

const int NF = 5;
float pct[NF], lo[NF], hi[NF];
uint8_t touched = 0;
uint16_t mcpIn = 0xFFFF;
uint32_t touches = 0, presses = 0, lcdReinits = 0, beepAt = 0;
bool beepOn = false;
bool audioOk = false;
const float NOTE[4] = {261.63f, 329.63f, 392.00f, 440.00f};  // C E G A
const int OCTAVE_FADER = 2;  // F3: the one wired fader picks the octave; floating inputs are ignored
float octave = 1;            // low / middle / high octave

int gpsFix = -1, gpsSats = -1;
char gpsTime[9] = "--:--:--";

uint32_t busRecoveries = 0, adsTimeouts = 0, capErrors = 0, lcdDraws = 0;  // lcdDraws: element redraws, reset each second

// A part reset mid-transfer can hold SDA low and block the whole bus: clock
// SCL until it lets go (standard I2C bus clear), then restart Wire2.
bool busClear() {
    pinMode(25, INPUT_PULLUP);
    pinMode(24, INPUT_PULLUP);
    delayMicroseconds(20);
    if (digitalRead(25)) { UI_BUS.begin(); return false; }  // pins back to I2C
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

void beep(float hz) { beepTone.frequency(hz); beepTone.amplitude(0.05f); beepAt = millis(); beepOn = true; }

// touch.touched() returns the register number (0x03 = pads 1+2) when the read fails: read it here and check
bool capRead(uint8_t& t) {
    UI_BUS.beginTransmission(0x29); UI_BUS.write(0x03);
    if (UI_BUS.endTransmission(false) != 0 || UI_BUS.requestFrom(0x29, 1) != 1) return false;
    t = UI_BUS.read();
    if (t) {  // clear INT so the status refreshes
        UI_BUS.beginTransmission(0x29); UI_BUS.write(0x00);
        if (UI_BUS.endTransmission(false) != 0 || UI_BUS.requestFrom(0x29, 1) != 1) return false;
        uint8_t m = UI_BUS.read() & ~0x01;
        UI_BUS.beginTransmission(0x29); UI_BUS.write(0x00); UI_BUS.write(m);
        if (UI_BUS.endTransmission() != 0) return false;
    }
    return true;
}

// ADS1115 read without the library's endless wait: one channel at a time, 10 ms limit
int adsCh = 0;
bool adsBusy = false;
uint32_t adsStarted = 0;

void adsService(uint32_t now) {
    if (!on[ADS]) { adsBusy = false; return; }
    if (adsBusy) {
        if (ads.conversionComplete()) {
            float p = ads.getLastConversionResults() * 100.0f / 26400;
            pct[adsCh] = p; lo[adsCh] = min(lo[adsCh], p); hi[adsCh] = max(hi[adsCh], p);
            adsCh = (adsCh + 1) % 4;
            adsBusy = false;
        } else if (now - adsStarted > 10) { adsTimeouts++; adsBusy = false; }
        else return;
    }
    ads.startADCReading(MUX_BY_CHANNEL[adsCh], false);
    adsStarted = now; adsBusy = true;
}

void mcpWrite(uint8_t reg, uint8_t v) {
    UI_BUS.beginTransmission(0x20); UI_BUS.write(reg); UI_BUS.write(v); UI_BUS.endTransmission();
}

bool startPart(int p) {
    switch (p) {
    case CAP: {
        static bool begun = false;  // begin() allocates a new I2C device each call: once is enough
        if (!begun && !touch.begin(0x29, &UI_BUS)) return false;
        begun = true;
        touch.writeRegister(0x1F, 0x4F);  // 8x gain: 16x (0x3F) gave phantom touches with hands near the wires
        touch.writeRegister(0x20, touch.readRegister(0x20) | 0x08);
        touch.writeRegister(0x26, 0xFF);
        touch.writeRegister(0x72, 0xFF);  // LED n follows input n
        return true;
    }
    case OLED: return oled.begin(SSD1306_SWITCHCAPVCC, 0x3C);
    case ADS:
        if (!ads.begin(0x48, &UI_BUS)) return false;
        ads.setGain(GAIN_ONE);            // ±4.096 V: 3.3 V = 26400 counts
        ads.setDataRate(RATE_ADS1115_860SPS);
        return true;
    case MCP:
        mcpWrite(0x00, 0xFF); mcpWrite(0x01, 0xFF);  // all inputs
        mcpWrite(0x0C, 0xFF); mcpWrite(0x0D, 0xFF);  // pull-ups
        return true;
    default: return true;  // GPS streams NMEA on its own
    }
}

// ---------- GPS (PA1010D on I2C): read NMEA, keep fix / satellites / time from $GxGGA
char nmea[100];
int nmeaLen = 0;

void gpsLine() {
    if (strncmp(nmea + 3, "GGA", 3) != 0) return;
    char* f[16] = {0};
    int n = 0;
    for (char* t = nmea; n < 16 && t; n++) { f[n] = t; t = strchr(t, ','); if (t) *t++ = 0; }
    if (n < 8) return;
    if (strlen(f[1]) >= 6) snprintf(gpsTime, sizeof(gpsTime), "%.2s:%.2s:%.2s", f[1], f[1] + 2, f[1] + 4);
    gpsFix = atoi(f[6]);
    gpsSats = atoi(f[7]);
}

void gpsPoll() {
    UI_BUS.requestFrom(0x10, 32);
    while (UI_BUS.available()) {
        char c = UI_BUS.read();
        if (c == '$') nmeaLen = 0;
        if (c == '\n' || c == '\r') { if (nmeaLen > 6) { nmea[nmeaLen] = 0; gpsLine(); } nmeaLen = 0; continue; }
        if (c < 32) continue;
        if (nmeaLen < (int)sizeof(nmea) - 1) nmea[nmeaLen++] = c;
    }
}

// ---------- LCD layout (320x240 landscape)
const uint16_t GREY = 0x7BEF, DARK = 0x2104;

// LCD traffic ticks in the headphones: redraw only what changed, never the whole screen
bool lcdDirty = true;

void drawStatic() {
    lcd.fillScreen(ILI9341_BLACK);
    lcd.setTextSize(1);
    lcd.setTextColor(GREY, ILI9341_BLACK);
    for (int i = 0; i < NF; i++) { lcd.drawRect(8 + i * 42, 46, 34, 102, GREY); }
    lcd.setCursor(232, 38); lcd.print("pads");
    lcd.setCursor(232, 104); lcd.print("nav  buttons");
    lcdDirty = true;
}

void drawDynamic() {
    static uint32_t lastUp, lastParts, lastTouched, lastCount;
    static int lastH[NF], lastPass[NF], lastGps = -1;
    static uint16_t lastMcp;
    bool all = lcdDirty;
    lcdDirty = false;

    uint32_t up = millis() / 60000;  // minutes: a per-second redraw still ticks in the audio
    if (all || up != lastUp) {
        lastUp = up;
        lcdDraws++;
        lcd.setTextSize(2);
        lcd.setCursor(8, 4);
        lcd.setTextColor(ILI9341_GREEN, ILI9341_BLACK);
        lcd.printf("LCD OK  up %lu min   ", up);
    }

    uint32_t parts = audioOk;
    for (int i = 0; i < NPARTS; i++) parts |= (on[i] << (i * 2 + 1)) | (seen[i] << (i * 2 + 2));
    if (all || parts != lastParts) {
        lastParts = parts;
        lcdDraws++;
        lcd.setTextSize(1);
        lcd.setCursor(8, 26);
        lcd.setTextColor(audioOk ? ILI9341_GREEN : ILI9341_RED, ILI9341_BLACK);
        lcd.print("AUDIO ");
        for (int i = 0; i < NPARTS; i++) {
            lcd.setTextColor(on[i] ? ILI9341_GREEN : (seen[i] ? ILI9341_RED : GREY), ILI9341_BLACK);
            lcd.printf("%s%s ", NAME[i], on[i] ? "" : (seen[i] ? "!" : "-"));
        }
        lcd.setCursor(8, 200);
        lcd.setTextColor(ILI9341_CYAN, ILI9341_BLACK);
        lcd.print("Wire2:");
        for (int i = 0; i < NPARTS; i++) if (on[i]) lcd.printf(" %02X", ADDR[i]);
        lcd.print("                ");
    }

    lcd.setTextSize(1);
    for (int i = 0; i < NF; i++) {  // fader bars
        // unwired inputs float and their jitter redrew bars ~10x/s (ticks in the audio): show them as "--"
        bool used = i == OCTAVE_FADER || hi[i] - lo[i] >= 80;
        bool live = (i < 4 ? on[ADS] : true) && used;
        int h = live ? (int)(constrain(pct[i], 0.0f, 100.0f)) : -1;
        int pass = live && lo[i] <= 2 && hi[i] >= 95;
        if (!all && abs(h - lastH[i]) < 2 && pass == lastPass[i]) continue;  // floating inputs jitter by 1
        lastH[i] = h; lastPass[i] = pass;
        lcdDraws++;
        int x = 9 + i * 42, hh = max(h, 0);
        lcd.fillRect(x, 47, 32, 100 - hh, ILI9341_BLACK);
        lcd.fillRect(x, 147 - hh, 32, hh, pass ? ILI9341_GREEN : ILI9341_CYAN);
        lcd.setCursor(8 + i * 42, 152);
        lcd.setTextColor(pass ? ILI9341_GREEN : ILI9341_WHITE, ILI9341_BLACK);
        if (live) lcd.printf("F%d %3d", i + 1, h); else lcd.print("F- -- ");
    }

    uint8_t tkey = on[CAP] ? touched : 0xFF;
    if (all || tkey != lastTouched || (on[CAP] && lastTouched == 0xFF)) {
        lastTouched = tkey;
        lcdDraws++;
        for (int i = 0; i < 8; i++)  // touch pads
            lcd.fillRoundRect(232 + (i % 4) * 22, 48 + (i / 4) * 24, 19, 20, 4,
                              !on[CAP] ? DARK : (touched & (1 << i)) ? ILI9341_YELLOW : 0x4208);
    }
    uint16_t mkey = on[MCP] ? mcpIn : 0x1234;
    if (all || mkey != lastMcp) {
        lastMcp = mkey;
        lcdDraws++;
        for (int i = 0; i < 9; i++) {  // nav GPA0-4, buttons GPB0-3 (pressed = low)
            bool down = on[MCP] && !(mcpIn & (1 << (i < 5 ? i : i + 3)));
            int x = i < 5 ? 234 + i * 12 : 236 + i * 12;
            lcd.fillCircle(x, 122, 4, !on[MCP] ? DARK : down ? ILI9341_ORANGE : 0x4208);
        }
    }

    int gkey = on[GPS] ? gpsFix * 1000 + gpsSats * 10 + (gpsTime[4] & 7) : -2;  // UTC to the minute
    if (all || gkey != lastGps) {
        lastGps = gkey;
        lcdDraws++;
        lcd.setCursor(8, 172);
        lcd.setTextColor(on[GPS] ? ILI9341_WHITE : GREY, ILI9341_BLACK);
        if (on[GPS]) lcd.printf("GPS fix %d  sats %2d  UTC %.5s     ", gpsFix, gpsSats, gpsTime);
        else lcd.print("GPS -                                ");
    }
    uint32_t count = touches + presses * 7 + lcdReinits * 131 + busRecoveries * 1031;
    if (all || count != lastCount) {
        lastCount = count;
        lcdDraws++;
        lcd.setCursor(8, 186);
        lcd.setTextColor(ILI9341_WHITE, ILI9341_BLACK);
        lcd.printf("touch %lu press %lu LCDreinit %lu busclear %lu  ", touches, presses, lcdReinits, busRecoveries);
    }
}

void drawOled() {
    oled.clearDisplay();
    oled.setTextColor(SSD1306_WHITE);
    oled.setTextSize(1);
    oled.setCursor(0, 0);
    oled.printf("touch %lu press %lu", touches, presses);
    for (int i = 0; i < 8; i++) {
        if (on[CAP] && (touched & (1 << i))) oled.fillRect(i * 16 + 1, 20, 14, 14, SSD1306_WHITE);
        else oled.drawRect(i * 16 + 1, 20, 14, 14, SSD1306_WHITE);
    }
    oled.setCursor(0, 42);
    for (int i = 0; i < NF; i++) oled.printf("%2d ", (int)constrain(pct[i], 0.0f, 99.0f));
    oled.setCursor(0, 54);
    oled.print("F1 F2 F3 F4 F5 %");
    oled.display();
}

void setup() {
    Serial.begin(115200);
    AudioMemory(24);
    codec.enable();
    codec.volume(0.3);
    mix.gain(0, 1); mix.gain(1, 1); mix.gain(2, 1); mix.gain(3, 1);
    kick.frequency(60); kick.length(300); kick.pitchMod(0.55f);
    snareBody.frequency(200); snareBody.length(100);
    tom.frequency(120); tom.length(250); tom.pitchMod(0.6f);
    noise.amplitude(0.5f);
    snareEnv.attack(1); snareEnv.decay(120); snareEnv.sustain(0); snareEnv.release(50);
    hatHp.frequency(7000);
    hatEnv.attack(1); hatEnv.decay(40); hatEnv.sustain(0); hatEnv.release(20);
    drums.gain(0, 0.5f); drums.gain(1, 0.25f); drums.gain(2, 0.25f); drums.gain(3, 0.4f);
    mix.gain(0, 0.3f);  // hat
    for (int i = 0; i < 4; i++) {
        voice[i].begin(0.12f, NOTE[i], WAVEFORM_TRIANGLE);
        env[i].attack(5); env[i].decay(250); env[i].sustain(0.5f); env[i].release(400);
        melo.gain(i, 0.5f);
    }
    beepTone.amplitude(0);
    analogReadResolution(12);
    Wire.begin();
    busClear();
    UI_BUS.begin();
    SPI1.setMISO(39);
    lcd.begin();
    lcd.setRotation(3);
    drawStatic();
    for (int i = 0; i < NF; i++) { lo[i] = 100; hi[i] = 0; }
    beep(660);
}

void loop() {
    static uint32_t lastScan = 0, lastFast = 0, lastDraw = 0, lastGps = 0;  // now - last: safe across the millis wrap
    uint32_t now = millis();

    adsService(now);

    if (now - lastScan >= 1000) {  // hot-plug scan, LCD check, serial line
        lastScan = now;
        audioOk = present(Wire, 0x0A);
        bool anySeen = false, anyHere = false, here[NPARTS];
        for (int i = 0; i < NPARTS; i++) { anySeen |= seen[i]; here[i] = present(UI_BUS, ADDR[i]); anyHere |= here[i]; }
        if (anySeen && !anyHere && busClear()) {  // every part gone at once: bus stuck
            for (int i = 0; i < NPARTS; i++) { on[i] = false; here[i] = present(UI_BUS, ADDR[i]); }
        }
        for (int i = 0; i < NPARTS; i++) {
            if (here[i] && !on[i]) { on[i] = startPart(i); if (on[i]) { seen[i] = true; beep(880); } }
            if (!here[i] && on[i]) { on[i] = false; lost[i]++; beep(330); }
        }
        if (lcd.readcommand8(ILI9341_RDMODE) != 0x94) {
            lcdReinits++;
            lcd.begin(); lcd.setRotation(3); drawStatic();
        }
        static bool crashShown = false;  // a crash reboots the Teensy: say why once the serial monitor is open
        if (!crashShown && Serial && CrashReport) { Serial.print(CrashReport); crashShown = true; }
        Serial.printf("up %lus audio %s |", now / 1000, audioOk ? "OK" : "--");
        for (int i = 0; i < NPARTS; i++) Serial.printf(" %s %s", NAME[i], on[i] ? "OK" : (seen[i] ? "LOST" : "--"));
        Serial.printf(" | F");
        for (int i = 0; i < NF; i++) Serial.printf(" %d(%d-%d)", (int)pct[i], (int)lo[i], (int)hi[i]);
        Serial.printf(" | touch 0x%02X n %lu | mcp 0x%04X n %lu | gps fix %d sats %d %s | lcd reinit %lu bus clear %lu",
                      touched, touches, mcpIn, presses, gpsFix, gpsSats, gpsTime, lcdReinits, busRecoveries);
        Serial.printf(" | ads timeout %lu cap err %lu | audio mem %d/24 cpu %.1f%% | lcd draws/s %lu\n",
                      adsTimeouts, capErrors, AudioMemoryUsageMax(), AudioProcessorUsageMax(), lcdDraws);
        lcdDraws = 0;
    }

    if (now - lastFast >= 30) {  // inputs every 30 ms
        lastFast = now;
        float p = analogRead(FADER5_PIN) * 100.0f / 4095;
        pct[4] = p; lo[4] = min(lo[4], p); hi[4] = max(hi[4], p);
        int k = OCTAVE_FADER;
        if (hi[k] - lo[k] >= 80) {  // acts once it has travelled
            float o = pct[k] < 33 ? 0.5f : pct[k] < 66 ? 1.0f : 2.0f;
            if (o != octave) { octave = o; for (int v = 0; v < 4; v++) voice[v].frequency(NOTE[v] * octave); }
        }
        if (on[CAP]) {
            uint8_t t = 0;
            if (!capRead(t)) { capErrors++; t = touched; }  // a failed read is not a touch
            uint8_t fresh = t & ~touched, gone = touched & ~t;
            for (int i = 0; i < 8; i++) {
                if (fresh & (1 << i)) {
                    touches++;
                    if (i == 0) kick.noteOn();
                    else if (i == 1) { snareBody.noteOn(); snareEnv.noteOn(); }
                    else if (i == 2) hatEnv.noteOn();
                    else if (i == 3) tom.noteOn();
                    else env[i - 4].noteOn();
                }
                if (i >= 4 && (gone & (1 << i))) env[i - 4].noteOff();
            }
            touched = t;
        }
        if (on[MCP]) {
            UI_BUS.beginTransmission(0x20); UI_BUS.write(0x12); UI_BUS.endTransmission();
            if (UI_BUS.requestFrom(0x20, 2) == 2) {
                uint16_t v = UI_BUS.read() | (UI_BUS.read() << 8);
                uint16_t pressed = ~v & mcpIn & 0x0F1F;  // newly low on GPA0-4 / GPB0-3
                for (int b = 0; b < 16; b++) if (pressed & (1 << b)) { presses++; beep(392 + b * 30); }
                mcpIn = v;
            }
        }
    }

    if (on[GPS] && now - lastGps >= 100) { lastGps = now; gpsPoll(); }

    if (beepOn && now - beepAt >= 120) { beepTone.amplitude(0); beepOn = false; }

    if (now - lastDraw >= 150) {
        lastDraw = now;
        drawDynamic();
        if (on[OLED]) drawOled();
    }
}
