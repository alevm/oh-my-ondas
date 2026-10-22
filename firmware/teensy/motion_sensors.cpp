/**
 * Oh My Ondas - Motion + environment sensors implementation
 */

#include "motion_sensors.h"
#include <Wire.h>
#include <EEPROM.h>

// MPU9250 registers
#define MPU_SMPLRT_DIV    0x19
#define MPU_CONFIG        0x1A
#define MPU_GYRO_CONFIG   0x1B
#define MPU_ACCEL_CONFIG  0x1C
#define MPU_ACCEL_CONFIG2 0x1D
#define MPU_INT_PIN_CFG   0x37
#define MPU_ACCEL_XOUT_H  0x3B
#define MPU_PWR_MGMT_1    0x6B
#define MPU_WHO_AM_I      0x75
#define MPU_ACCEL_LSB_G   8192.0f   // +/-4 g
#define MPU_GYRO_LSB_DPS  65.5f     // +/-500 dps
// AK8963 registers
#define AK_WIA     0x00
#define AK_ST1     0x02
#define AK_HXL     0x03
#define AK_CNTL1   0x0A
#define AK_ASAX    0x10
#define AK_UT_LSB  0.15f            // 16-bit output
// BMP280 registers
#define BMP_CALIB   0x88
#define BMP_ID      0xD0
#define BMP_CTRL    0xF4
#define BMP_CONFIG  0xF5
#define BMP_DATA    0xF7

#define MAGCAL_MAGIC 0x4D41474Bu    // "MAGK"

static inline float sqf(float x) { return x * x; }

MotionSensors::MotionSensors()
    : imuOk(false), magOk(false), baroOk(false), magCalOk(false), whoAmI(0), frames(0)
    , lastImu(0), lastMag(0), lastBaro(0), lastFrame(0), lastMinute(0), i2cErrors(0)
    , dynSqAvg(0), vertLp(0), vertPrev(0), vertPrev2(0), stepPeakAvg(0.1f), lastStepMs(0)
    , nIntervals(0), stepsSinceFrame(0), stepTotal(0), walking(0)
    , lastGesture(0), rollBase(0), tiltSince(0), tiltDir(0), faceDown(false), faceSince(0)
    , pendingGesture(GEST_NONE), magRingN(0), magRingI(0), calActive(false), calStart(0)
    , pAvg(0), pFastSq(0), tempC(0), pRef(0), pInit(false), minuteSum(0), minuteN(0), nMinutes(0)
{
    memset(acc, 0, sizeof(acc)); memset(gyr, 0, sizeof(gyr));
    grav[0] = grav[1] = 0; grav[2] = 1.0f;
    memset(stepIntervals, 0, sizeof(stepIntervals));
    memset(jolts, 0, sizeof(jolts));
    for (int i = 0; i < 3; i++) { magAdj[i] = 1.0f; magOff[i] = 0; mag[i] = 0; }
    memset(&mf, 0, sizeof(mf));
    memset(&ef, 0, sizeof(ef));
    mf.headingDeg = -1;
}

// ============================================
// I2C
// ============================================

bool MotionSensors::write8(uint8_t addr, uint8_t reg, uint8_t v) {
    UI_WIRE.beginTransmission(addr);
    UI_WIRE.write(reg);
    UI_WIRE.write(v);
    if (UI_WIRE.endTransmission() != 0) { i2cErrors++; return false; }
    return true;
}

bool MotionSensors::readN(uint8_t addr, uint8_t reg, uint8_t* buf, uint8_t n) {
    UI_WIRE.beginTransmission(addr);
    UI_WIRE.write(reg);
    if (UI_WIRE.endTransmission(false) != 0) { i2cErrors++; return false; }
    if (UI_WIRE.requestFrom(addr, n) < n) { i2cErrors++; return false; }
    for (uint8_t i = 0; i < n; i++) buf[i] = UI_WIRE.read();
    return true;
}

// ============================================
// INIT
// ============================================

void MotionSensors::begin() {
    initImu();
    if (imuOk) initMag();
    initBaro();
    loadCal();
    DEBUG_PRINTF("MotionSensors: IMU %s (WHO_AM_I 0x%02X), compass %s%s, baro %s\n",
                 imuOk ? "OK" : "absent", whoAmI, magOk ? "OK" : "absent",
                 magCalOk ? " (calibrated)" : "", baroOk ? "OK" : "absent");
}

void MotionSensors::initImu() {
    uint8_t id;
    if (!readN(ADDR_MPU9250, MPU_WHO_AM_I, &id, 1)) return;
    whoAmI = id;
    // 0x71 MPU9250, 0x73 MPU9255, 0x70 MPU6500 (clone, no compass), 0x68 MPU6050
    if (id != 0x71 && id != 0x73 && id != 0x70 && id != 0x68) return;
    write8(ADDR_MPU9250, MPU_PWR_MGMT_1, 0x01);     // wake, PLL clock
    delay(10);                                     // once, at boot
    write8(ADDR_MPU9250, MPU_CONFIG, 0x03);         // gyro DLPF 41 Hz
    write8(ADDR_MPU9250, MPU_SMPLRT_DIV, 9);        // 100 Hz
    write8(ADDR_MPU9250, MPU_GYRO_CONFIG, 0x08);    // +/-500 dps
    write8(ADDR_MPU9250, MPU_ACCEL_CONFIG, 0x08);   // +/-4 g
    write8(ADDR_MPU9250, MPU_ACCEL_CONFIG2, 0x03);  // accel DLPF 41 Hz
    write8(ADDR_MPU9250, MPU_INT_PIN_CFG, 0x02);    // bypass: AK8963 on the bus
    imuOk = true;
}

void MotionSensors::initMag() {
    uint8_t wia;
    if (whoAmI == 0x70 || whoAmI == 0x68) return;  // no AK8963 inside
    if (!readN(ADDR_AK8963, AK_WIA, &wia, 1) || wia != 0x48) return;
    uint8_t asa[3];
    write8(ADDR_AK8963, AK_CNTL1, 0x00); delay(1);
    write8(ADDR_AK8963, AK_CNTL1, 0x0F); delay(1);  // fuse ROM
    if (!readN(ADDR_AK8963, AK_ASAX, asa, 3)) return;
    for (int i = 0; i < 3; i++) magAdj[i] = (asa[i] - 128) / 256.0f + 1.0f;
    write8(ADDR_AK8963, AK_CNTL1, 0x00); delay(1);
    write8(ADDR_AK8963, AK_CNTL1, 0x16);            // 16-bit, continuous 100 Hz
    magOk = true;
}

void MotionSensors::initBaro() {
    uint8_t id;
    if (!readN(ADDR_BMP280, BMP_ID, &id, 1) || id != 0x58) return;
    uint8_t c[24];
    if (!readN(ADDR_BMP280, BMP_CALIB, c, 24)) return;
    digT1 = c[0] | (c[1] << 8);  digT2 = c[2] | (c[3] << 8);  digT3 = c[4] | (c[5] << 8);
    digP1 = c[6] | (c[7] << 8);  digP2 = c[8] | (c[9] << 8);  digP3 = c[10] | (c[11] << 8);
    digP4 = c[12] | (c[13] << 8); digP5 = c[14] | (c[15] << 8); digP6 = c[16] | (c[17] << 8);
    digP7 = c[18] | (c[19] << 8); digP8 = c[20] | (c[21] << 8); digP9 = c[22] | (c[23] << 8);
    write8(ADDR_BMP280, BMP_CONFIG, (0 << 5) | (1 << 2));       // standby 0.5 ms, IIR 2
    write8(ADDR_BMP280, BMP_CTRL, (1 << 5) | (2 << 2) | 3);     // T x1, P x2, normal mode
    baroOk = true;
}

void MotionSensors::loadCal() {
    struct { uint32_t magic; float off[3]; } c;
    EEPROM.get(EEPROM_MAGCAL_ADDR, c);
    if (c.magic == MAGCAL_MAGIC) {
        for (int i = 0; i < 3; i++) magOff[i] = isfinite(c.off[i]) ? c.off[i] : 0.0f;
        magCalOk = true;
    }
}

// ============================================
// UPDATE
// ============================================

void MotionSensors::update() {
    unsigned long now = millis();
    if (imuOk && now - lastImu >= 20) { lastImu = now; readImu(now); }
    if (magOk && now - lastMag >= 40) { lastMag = now; readMag(); }
    if (baroOk && now - lastBaro >= 40) { lastBaro = now; readBaro(); }
    if (calActive && now - calStart >= MAG_CAL_MS) finishCal();
    if (now - lastFrame >= 100) { lastFrame = now; buildFrame(now); }
}

void MotionSensors::readImu(unsigned long now) {
    uint8_t b[14];
    if (!readN(ADDR_MPU9250, MPU_ACCEL_XOUT_H, b, 14)) return;
    for (int i = 0; i < 3; i++) {
        acc[i] = (int16_t)((b[2 * i] << 8) | b[2 * i + 1]) / MPU_ACCEL_LSB_G;
        gyr[i] = (int16_t)((b[8 + 2 * i] << 8) | b[9 + 2 * i]) / MPU_GYRO_LSB_DPS;
    }
    // Gravity: 0.5 s low-pass; dynamic = the rest
    const float ag = 0.039f;   // 1 - exp(-0.02 / 0.5)
    float dyn[3];
    for (int i = 0; i < 3; i++) {
        grav[i] += ag * (acc[i] - grav[i]);
        dyn[i] = acc[i] - grav[i];
    }
    float dynMag2 = sqf(dyn[0]) + sqf(dyn[1]) + sqf(dyn[2]);
    dynSqAvg += 0.02f * (dynMag2 - dynSqAvg);   // ~1 s

    // Vertical component (along gravity), 3 Hz low-pass, for steps
    float gn = sqrtf(sqf(grav[0]) + sqf(grav[1]) + sqf(grav[2]));
    float vert = gn > 0.1f ? (dyn[0] * grav[0] + dyn[1] * grav[1] + dyn[2] * grav[2]) / gn : 0.0f;
    vertLp += 0.31f * (vert - vertLp);           // 1 - exp(-2 pi 3 Hz * 0.02 s)
    detectStep(vertLp, now);
    detectGestures(sqrtf(dynMag2), now);
}

void MotionSensors::detectStep(float v, unsigned long now) {
    // Peak at the previous sample, above an adaptive threshold
    bool peak = vertPrev > vertPrev2 && vertPrev >= v;
    float thr = max(0.06f, 0.5f * stepPeakAvg);
    if (peak && vertPrev > thr && now - lastStepMs >= 300) {
        unsigned long iv = now - lastStepMs;
        if (lastStepMs && iv <= 1500) {
            for (int i = 5; i > 0; i--) stepIntervals[i] = stepIntervals[i - 1];
            stepIntervals[0] = iv;
            if (nIntervals < 6) nIntervals++;
        }
        lastStepMs = now;
        stepPeakAvg += 0.2f * (vertPrev - stepPeakAvg);
        stepsSinceFrame++;
        stepTotal++;
    }
    vertPrev2 = vertPrev;
    vertPrev = v;
}

void MotionSensors::detectGestures(float dynMag, unsigned long now) {
    if (now - lastGesture < 1000) return;   // one gesture per second at most

    // Shake: 3 jolts over 1.5 g within 0.8 s
    if (dynMag > 1.5f && now - jolts[0] > 120) {
        jolts[2] = jolts[1]; jolts[1] = jolts[0]; jolts[0] = now;
        if (jolts[2] && now - jolts[2] < 800) {
            pendingGesture = GEST_SHAKE;
            lastGesture = now;
            memset(jolts, 0, sizeof(jolts));
            return;
        }
    }

    // Flip: gravity along -z (face down) or back, held 0.5 s
    bool down = grav[2] < -0.7f, up = grav[2] > 0.5f;
    if ((down && !faceDown) || (up && faceDown)) {
        if (!faceSince) faceSince = now;
        if (now - faceSince >= 500) {
            faceDown = down;
            faceSince = 0;
            pendingGesture = GEST_FLIP;
            lastGesture = now;
            return;
        }
    } else {
        faceSince = 0;
    }

    // Tilt left / right: roll 35 deg away from its slow (5 s) baseline for 150 ms
    float roll = atan2f(grav[1], grav[2]) * 57.2958f;
    if (faceDown) return;
    rollBase += 0.004f * (roll - rollBase);
    float d = roll - rollBase;
    int8_t dir = d > 35.0f ? 1 : (d < -35.0f ? -1 : 0);
    if (dir != 0 && dir == tiltDir) {
        if (now - tiltSince >= 150) {
            pendingGesture = dir < 0 ? GEST_TILT_LEFT : GEST_TILT_RIGHT;
            lastGesture = now;
            tiltDir = 0;
        }
    } else {
        tiltDir = dir;
        tiltSince = now;
    }
}

void MotionSensors::readMag() {
    uint8_t b[8];   // ST1 .. ST2 (reading ST2 releases the data registers)
    if (!readN(ADDR_AK8963, AK_ST1, b, 8)) return;
    if (!(b[0] & 0x01) || (b[7] & 0x08)) return;   // not ready, or overflow
    float raw[3];
    for (int i = 0; i < 3; i++) raw[i] = (int16_t)(b[1 + 2 * i] | (b[2 + 2 * i] << 8)) * AK_UT_LSB * magAdj[i];
    if (calActive) {
        for (int i = 0; i < 3; i++) { calMin[i] = min(calMin[i], raw[i]); calMax[i] = max(calMax[i], raw[i]); }
    }
    // Into the accel frame: x = AK y, y = AK x, z = -AK z
    mag[0] = raw[1] - magOff[1];
    mag[1] = raw[0] - magOff[0];
    mag[2] = -(raw[2] - magOff[2]);
    float m = sqrtf(sqf(mag[0]) + sqf(mag[1]) + sqf(mag[2]));
    magRing[magRingI] = m;
    magRingI = (magRingI + 1) % 25;
    if (magRingN < 25) magRingN++;
}

void MotionSensors::readBaro() {
    uint8_t b[6];
    if (!readN(ADDR_BMP280, BMP_DATA, b, 6)) return;
    int32_t adcP = ((int32_t)b[0] << 12) | ((int32_t)b[1] << 4) | (b[2] >> 4);
    int32_t adcT = ((int32_t)b[3] << 12) | ((int32_t)b[4] << 4) | (b[5] >> 4);
    // Bosch datasheet compensation, double precision
    double v1 = (adcT / 16384.0 - digT1 / 1024.0) * digT2;
    double v2 = sqf(adcT / 131072.0 - digT1 / 8192.0) * digT3;
    double tFine = v1 + v2;
    tempC = tFine / 5120.0;
    v1 = tFine / 2.0 - 64000.0;
    v2 = v1 * v1 * digP6 / 32768.0;
    v2 = v2 + v1 * digP5 * 2.0;
    v2 = v2 / 4.0 + digP4 * 65536.0;
    v1 = (digP3 * v1 * v1 / 524288.0 + digP2 * v1) / 524288.0;
    v1 = (1.0 + v1 / 32768.0) * digP1;
    if (v1 == 0) return;
    double p = 1048576.0 - adcP;
    p = (p - v2 / 4096.0) * 6250.0 / v1;
    v1 = digP9 * p * p / 2147483648.0;
    v2 = p * digP8 / 32768.0;
    p = p + (v1 + v2 + digP7) / 16.0;
    float pa = (float)p;
    if (pa < 30000.0f || pa > 110000.0f) return;   // nonsense read

    if (!pInit) { pAvg = pa; pRef = pa; pInit = true; }
    pAvg += 0.04f * (pa - pAvg);                    // ~1 s at 25 Hz
    pFastSq += 0.04f * (sqf(pa - pAvg) - pFastSq);
    minuteSum += pAvg;
    minuteN++;
}

void MotionSensors::buildFrame(unsigned long now) {
    // ── Motion ──
    mf.t_ms = now;
    mf.accelRmsMg = sqrtf(dynSqAvg) * 1000.0f;
    mf.steps = stepsSinceFrame;
    stepsSinceFrame = 0;
    mf.stepTotal = stepTotal;
    if (now - lastStepMs > 2000 || nIntervals < 2) {
        mf.cadence = 0;
    } else {
        float s[6];
        memcpy(s, stepIntervals, sizeof(s));
        int n = nIntervals;
        for (int i = 0; i < n; i++) for (int j = i + 1; j < n; j++) if (s[j] < s[i]) { float t = s[i]; s[i] = s[j]; s[j] = t; }
        float med = s[n / 2];
        mf.cadence = med > 0 ? 60000.0f / med : 0;
        if (mf.cadence < 40.0f || mf.cadence > 200.0f) mf.cadence = 0;
    }
    walking += 0.0125f * ((mf.cadence > 0 ? 1.0f : 0.0f) - walking);   // ~8 s at 10 Hz
    mf.walking = walking;
    for (int i = 0; i < 3; i++) mf.gyroDps[i] = gyr[i];
    float pitch = atan2f(-grav[0], sqrtf(sqf(grav[1]) + sqf(grav[2])));
    float roll = atan2f(grav[1], grav[2]);
    mf.pitchDeg = pitch * 57.2958f;
    mf.rollDeg = roll * 57.2958f;
    mf.faceDown = faceDown;
    mf.gesture = pendingGesture;
    pendingGesture = GEST_NONE;

    if (magOk && magRingN > 0) {
        // Tilt-compensated heading
        float cp = cosf(pitch), sp = sinf(pitch), cr = cosf(roll), sr = sinf(roll);
        float xh = mag[0] * cp + mag[1] * sr * sp + mag[2] * cr * sp;
        float yh = mag[1] * cr - mag[2] * sr;
        float h = atan2f(-yh, xh) * 57.2958f;
        mf.headingDeg = h < 0 ? h + 360.0f : h;
        float mean = 0, var = 0;
        for (int i = 0; i < magRingN; i++) mean += magRing[i];
        mean /= magRingN;
        for (int i = 0; i < magRingN; i++) var += sqf(magRing[i] - mean);
        mf.magUt = mean;
        mf.magVarUt = sqrtf(var / magRingN);
    } else {
        mf.headingDeg = -1;
    }

    // ── Environment ──
    if (baroOk && pInit) {
        if (now - lastMinute >= 60000 && minuteN > 0) {
            lastMinute = now;
            for (int i = 29; i > 0; i--) minuteMeans[i] = minuteMeans[i - 1];
            minuteMeans[0] = minuteSum / minuteN;
            if (nMinutes < 30) nMinutes++;
            minuteSum = 0; minuteN = 0;
        }
        ef.t_ms = now;
        ef.pressurePa = pAvg;
        ef.tempC = tempC;
        ef.daltM = 44330.0f * (1.0f - powf(pAvg / pRef, 0.190295f));
        ef.fastPa = sqrtf(pFastSq);
        if (nMinutes >= 5) {
            // Least squares slope over the minute means (index 0 = newest)
            float sx = 0, sy = 0, sxx = 0, sxy = 0;
            for (int i = 0; i < nMinutes; i++) {
                float x = -i, y = minuteMeans[i];
                sx += x; sy += y; sxx += x * x; sxy += x * y;
            }
            float den = nMinutes * sxx - sx * sx;
            ef.trendPaH = den != 0 ? (nMinutes * sxy - sx * sy) / den * 60.0f : 0.0f;
        }
        ef.valid = true;
    }
    frames++;
}

// ============================================
// CALIBRATION / WALK
// ============================================

void MotionSensors::startCompassCal() {
    if (!magOk) return;
    for (int i = 0; i < 3; i++) { calMin[i] = 1e9f; calMax[i] = -1e9f; }
    calStart = millis();
    calActive = true;
}

float MotionSensors::calProgress() const {
    return calActive ? min(1.0f, (millis() - calStart) / (float)MAG_CAL_MS) : 0.0f;
}

void MotionSensors::finishCal() {
    calActive = false;
    // Needs a real turn on every axis (> 20 uT span), else keep the old offsets
    for (int i = 0; i < 3; i++) if (calMax[i] - calMin[i] < 20.0f) {
        DEBUG_PRINTLN("MotionSensors: compass calibration failed (turn through every direction)");
        return;
    }
    struct { uint32_t magic; float off[3]; } c;
    c.magic = MAGCAL_MAGIC;
    for (int i = 0; i < 3; i++) magOff[i] = c.off[i] = (calMax[i] + calMin[i]) / 2.0f;
    EEPROM.put(EEPROM_MAGCAL_ADDR, c);
    magCalOk = true;
    DEBUG_PRINTF("MotionSensors: compass offsets %.1f %.1f %.1f uT\n", magOff[0], magOff[1], magOff[2]);
}

void MotionSensors::resetWalk() {
    pRef = pAvg;
    stepTotal = 0;
}
