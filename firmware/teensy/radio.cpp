/**
 * Oh My Ondas - Si4732 radio implementation
 * PU2CLR SI4735 library (vendored in teensy/lib/SI4735, patched for Wire2)
 */

#include "radio.h"

struct BandDef {
    const char* name;
    uint16_t lo, hi, start, step;  // FM in 10 kHz units, AM bands in kHz
    bool     fm;
};

// European ranges and rasters
static const BandDef BANDS[BAND_COUNT] = {
    {"FM",  8750, 10800, 9840, 10, true},   //  87.5-108 MHz, 100 kHz
    {"MW",   522,  1710, 1008,  9, false},  //  522-1710 kHz, 9 kHz
    {"SW",  2300, 26100, 9420,  5, false},  //  2.3-26.1 MHz, 5 kHz
    {"LW",   153,   279,  198,  9, false},  //  153-279 kHz, 9 kHz
};

Radio::Radio()
    : fitted(false), muted(false), band(BAND_FM)
    , rssi(0), snr(0), lastPoll(0)
{
    for (int b = 0; b < BAND_COUNT; b++) freq[b] = BANDS[b].start;
    stationName[0] = '\0';
    radioText[0] = '\0';
}

bool Radio::begin() {
    rx.setI2CBus(&UI_WIRE);

    // getDeviceI2CAddress() pulses RST and probes 0x11 / 0x63. Both it and
    // setup() call UI_WIRE.begin(), which drops the clock to 100 kHz: restore it.
    int16_t addr = rx.getDeviceI2CAddress(RADIO_RST_PIN);
    UI_WIRE.setClock(UI_I2C_CLOCK);
    if (addr == 0) {
        digitalWrite(RADIO_RST_PIN, LOW);  // keep the absent/unpowered chip off the bus
        DEBUG_PRINTLN("Radio: Si4732 not fitted");
        return false;
    }

#if !RADIO_CLOCK_CRYSTAL
    rx.setRefClock(RADIO_REF_CLOCK_HZ);
    rx.setRefClockPrescaler(1);
    rx.setup(RADIO_RST_PIN, 0, FM_CURRENT_MODE, SI473X_ANALOG_AUDIO, XOSCEN_RCLK);
#else
    rx.setup(RADIO_RST_PIN, 0, FM_CURRENT_MODE, SI473X_ANALOG_AUDIO, XOSCEN_CRYSTAL);
#endif
    UI_WIRE.setClock(UI_I2C_CLOCK);
    delay(250);  // oscillator start-up

    fitted = true;
    applyBand();
    rx.setVolume(RADIO_VOLUME);
    DEBUG_PRINTF("Radio: Si4732 at 0x%02X, %s\n", addr, getBandName());
    return true;
}

// Front end: setFM() powers the chip up in FM mode (FMI input), setAM()
// in AM mode (AMI input, used for MW, SW and LW alike). The PU2CLR library
// powers down and up again only when the mode changes.
void Radio::applyBand() {
    const BandDef& d = BANDS[band];
    if (d.fm) {
        rx.setFM(d.lo, d.hi, freq[band], d.step);
        rx.setSeekFmLimits(d.lo, d.hi);
        rx.setSeekFmSpacing(d.step);
        rx.setRdsConfig(1, 2, 2, 2, 2);
        rx.setFmStereoOn();
    } else {
        rx.setAM(d.lo, d.hi, freq[band], d.step);
        rx.setSeekAmLimits(d.lo, d.hi);
        rx.setSeekAmSpacing(d.step);
    }
    rx.setVolume(RADIO_VOLUME);
    rx.setAudioMute(muted);
    stationName[0] = '\0';
    radioText[0] = '\0';
    readFrequency();
}

void Radio::readFrequency() {
    freq[band] = rx.getFrequency();
}

void Radio::update() {
    if (!fitted) return;
    unsigned long now = millis();
    if (now - lastPoll < RADIO_POLL_MS) return;
    lastPoll = now;

    rx.getCurrentReceivedSignalQuality();
    rssi = rx.getCurrentRSSI();
    snr  = rx.getCurrentSNR();

    if (BANDS[band].fm) {
        rx.getRdsStatus();
        if (rx.getRdsReceived() && rx.getRdsSync() && rx.getRdsSyncFound()) {
            char* ps = rx.getRdsText0A();
            if (ps) {
                strncpy(stationName, ps, sizeof(stationName) - 1);
                stationName[sizeof(stationName) - 1] = '\0';
            }
            char* rt = rx.getRdsText2A();
            if (rt) {
                strncpy(radioText, rt, sizeof(radioText) - 1);
                radioText[sizeof(radioText) - 1] = '\0';
                // trim the trailing padding spaces RT is sent with
                for (int i = strlen(radioText) - 1; i >= 0 && radioText[i] == ' '; i--) radioText[i] = '\0';
            }
        }
    }
}

void Radio::setBand(RadioBand b) {
    if (!fitted || b == band) return;
    band = b;
    applyBand();
}

void Radio::nextBand(int dir) {
    int b = ((int)band + (dir >= 0 ? 1 : -1) + BAND_COUNT) % BAND_COUNT;
    setBand((RadioBand)b);
}

void Radio::tune(int steps) {
    if (!fitted || steps == 0) return;
    steps = constrain(steps, -5, 5);   // a bad encoder read must not hang the loop
    for (int i = 0; i < abs(steps); i++) {
        if (steps > 0) rx.frequencyUp();
        else           rx.frequencyDown();
    }
    stationName[0] = '\0';
    radioText[0] = '\0';
    readFrequency();
}

void Radio::seek(int dir) {
    if (!fitted) return;
    // Blocks the UI loop until a station or the band edge (audio keeps running,
    // it is interrupt driven). Up to a few seconds on SW.
    rx.seekStationProgress(NULL, dir > 0 ? SEEK_UP : SEEK_DOWN);
    stationName[0] = '\0';
    radioText[0] = '\0';
    readFrequency();
}

void Radio::setMute(bool mute) {
    muted = mute;
    if (fitted) rx.setAudioMute(mute);
}

void Radio::setVolume(uint8_t v) {
    if (fitted) rx.setVolume(min(v, (uint8_t)63));
}

const char* Radio::getBandName() const {
    return BANDS[band].name;
}

void Radio::formatFrequency(char* buf, size_t len) const {
    uint16_t f = freq[band];
    switch (band) {
        case BAND_FM: snprintf(buf, len, "%u.%02u MHz", f / 100, f % 100);  break;
        case BAND_SW: snprintf(buf, len, "%u.%03u MHz", f / 1000, f % 1000); break;
        default:      snprintf(buf, len, "%u kHz", f);                       break;
    }
}
