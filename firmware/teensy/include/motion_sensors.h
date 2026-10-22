/**
 * Oh My Ondas - Motion + environment sensors (Wire2)
 *
 * MPU9250 IMU at 0x68 (AD0 to GND) with its AK8963 compass at 0x0C reached
 * through the I2C bypass, and a BMP280 barometer at 0x76. Small register
 * drivers, no libraries. Each read is one short I2C transfer (14 / 8 / 6
 * bytes) on a schedule (IMU 50 Hz, compass and barometer 25 Hz), so nothing
 * waits on a conversion. A part that does not answer at begin() is simply
 * absent; WHO_AM_I 0x70 (a common MPU6500 clone sold as MPU9250) or a
 * silent AK8963 = no compass: heading reads 0xFFFF.
 *
 * Motion (10 Hz frame): dynamic acceleration (gravity removed by a 0.5 s
 * low-pass) RMS over ~1 s; steps (peaks of the vertical dynamic component,
 * 0.3 s refractory) and cadence (median of the last intervals, 0 after 2 s
 * without a step); gyro; pitch / roll from the gravity vector;
 * tilt-compensated heading (hard-iron offsets from the calibration routine,
 * kept in EEPROM); field magnitude and its 1 s standard deviation;
 * gestures: shake (3 jolts > 1.5 g within 0.8 s), tilt left / right (roll
 * 35 deg away from its slow baseline), flip (face down / face up).
 * Axes: accel/gyro frame of the MPU; AK8963 axes are mapped onto it
 * (x <-> y, z inverted, MPU9250 datasheet). Check signs on hardware.
 *
 * Environment: pressure (1 s average), temperature, height change since the
 * walk start (resetWalk; boot), pressure trend in Pa/h (regression over up
 * to 30 one-minute means), fast fluctuation (RMS of pressure minus its 1 s
 * average: gusts, doors, tunnels). BMP280 runs normal mode, pressure x2,
 * temperature x1, IIR 2, 0.5 ms standby (~100 Hz), read at 25 Hz.
 */

#ifndef MOTION_SENSORS_H
#define MOTION_SENSORS_H

#include <Arduino.h>
#include "config.h"

enum Gesture : uint8_t { GEST_NONE = 0, GEST_SHAKE, GEST_TILT_LEFT, GEST_TILT_RIGHT, GEST_FLIP };

struct MotionFrame {
    uint32_t t_ms;
    float    accelRmsMg;        // dynamic acceleration, milli-g
    uint8_t  steps;             // since the previous frame
    uint32_t stepTotal;         // since the walk start
    float    cadence;           // steps per minute, 0 = standing
    float    walking;           // 0..1, smoothed "is walking"
    float    gyroDps[3];
    float    pitchDeg, rollDeg;
    float    headingDeg;        // 0..360, < 0 = no compass
    float    magUt;
    float    magVarUt;
    uint8_t  gesture;           // Gesture since the previous frame
    bool     faceDown;
};

struct EnvFrame {
    uint32_t t_ms;
    float    pressurePa;        // 1 s average
    float    tempC;
    float    daltM;             // height change vs the walk start
    float    trendPaH;          // pressure trend
    float    fastPa;            // short-term fluctuation RMS
    bool     valid;
};

class MotionSensors {
public:
    MotionSensors();

    void begin();
    void update();                        // every loop; a motion frame every 100 ms

    bool    imuPresent() const     { return imuOk; }
    bool    compassPresent() const { return magOk; }
    bool    baroPresent() const    { return baroOk; }
    uint8_t imuWhoAmI() const      { return whoAmI; }   // 0 = no answer

    uint32_t frameCount() const    { return frames; }
    const MotionFrame& motion() const { return mf; }
    const EnvFrame&    env() const    { return ef; }

    // Compass calibration: turn the device through every direction for
    // MAG_CAL_MS; min/max per axis -> hard-iron offsets, saved to EEPROM
    void startCompassCal();
    bool isCalibrating() const     { return calActive; }
    float calProgress() const;
    bool compassCalibrated() const { return magCalOk; }

    void resetWalk();                     // height and step count from here

private:
    bool imuOk, magOk, baroOk, magCalOk;
    uint8_t whoAmI;
    uint32_t frames;
    unsigned long lastImu, lastMag, lastBaro, lastFrame, lastMinute;
    uint32_t i2cErrors;

    // IMU state
    float acc[3], gyr[3], grav[3];
    float dynSqAvg;                       // EMA of |dyn|^2 (g^2), ~1 s
    float vertLp, vertPrev, vertPrev2;    // vertical dynamic accel, 3 Hz low-pass
    float stepPeakAvg;
    unsigned long lastStepMs;
    float stepIntervals[6];
    uint8_t nIntervals;
    uint8_t stepsSinceFrame;
    uint32_t stepTotal;
    float walking;
    // gestures
    unsigned long jolts[3];
    unsigned long lastGesture;
    float rollBase;
    unsigned long tiltSince;
    int8_t tiltDir;
    bool faceDown;
    unsigned long faceSince;
    uint8_t pendingGesture;
    // compass
    float magAdj[3], magOff[3], mag[3];
    float magRing[25];
    uint8_t magRingN, magRingI;
    bool calActive;
    unsigned long calStart;
    float calMin[3], calMax[3];

    // Barometer
    uint16_t digT1; int16_t digT2, digT3;
    uint16_t digP1; int16_t digP2, digP3, digP4, digP5, digP6, digP7, digP8, digP9;
    float pAvg, pFastSq, tempC;
    float pRef;                           // walk start
    bool  pInit;
    float minuteSum; uint16_t minuteN;
    float minuteMeans[30];
    uint8_t nMinutes;

    MotionFrame mf;
    EnvFrame    ef;

    bool write8(uint8_t addr, uint8_t reg, uint8_t v);
    bool readN(uint8_t addr, uint8_t reg, uint8_t* buf, uint8_t n);

    void initImu();
    void initMag();
    void initBaro();
    void readImu(unsigned long now);
    void readMag();
    void readBaro();
    void buildFrame(unsigned long now);
    void detectStep(float vert, unsigned long now);
    void detectGestures(float dynMag, unsigned long now);
    void finishCal();
    void loadCal();
};

#endif // MOTION_SENSORS_H
