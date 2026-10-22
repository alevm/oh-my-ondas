/**
 * Oh My Ondas - Si4732 AM/FM/SW/LW radio
 *
 * Si4732-A10 on Wire2 (0x11, SEN to 3.3 V), RST on RADIO_RST_PIN.
 * Analog audio goes to the Audio Shield LINE-IN R; the level is set in
 * the audio graph by the RAD fader, not here.
 *
 * If the chip does not answer at begin() the radio stays "not fitted":
 * RST is held low (chip silent on the bus) and every call is a no-op.
 *
 * Clock wiring is unconfirmed: see RADIO_CLOCK_CRYSTAL in config.h.
 */

#ifndef RADIO_H
#define RADIO_H

#include <Arduino.h>
#include <SI4735.h>
#include "config.h"

class Radio {
public:
    Radio();

    bool begin();                 // detect the chip and start on FM
    bool isFitted() const { return fitted; }
    void update();                // RSSI/SNR/RDS refresh, every RADIO_POLL_MS

    void setBand(RadioBand b);
    void nextBand(int dir);       // +1 / -1, wraps
    void tune(int steps);         // band step size per step
    void seek(int dir);           // blocks until a station or the band edge
    void setMute(bool mute);
    void setVolume(uint8_t v);    // 0-63

    RadioBand   getBand() const   { return band; }
    const char* getBandName() const;
    uint16_t    getFrequency() const { return freq[band]; }  // FM: 10 kHz units, AM bands: kHz
    void        formatFrequency(char* buf, size_t len) const;  // "98.40 MHz", "1008 kHz", "9.420 MHz"
    uint8_t     getRSSI() const   { return rssi; }   // dBuV
    uint8_t     getSNR() const    { return snr; }    // dB
    const char* getStationName() const { return stationName; }  // FM RDS PS, "" if none
    const char* getRadioText() const   { return radioText; }    // FM RDS RT (2A), "" if none
    bool        isMuted() const   { return muted; }

private:
    SI4735   rx;
    bool     fitted;
    bool     muted;
    RadioBand band;
    uint16_t freq[BAND_COUNT];    // last frequency per band
    uint8_t  rssi, snr;
    char     stationName[9];
    char     radioText[65];
    unsigned long lastPoll;

    void applyBand();
    void readFrequency();
};

#endif // RADIO_H
