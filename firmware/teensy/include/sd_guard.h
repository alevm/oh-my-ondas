/**
 * Oh My Ondas - SD access from the main loop
 *
 * AudioPlaySdWav reads the card inside the audio update interrupt
 * (IRQ_SOFTWARE). A main-loop SD call running at the same moment corrupts
 * SdFat's shared state (cache sector, FAT), so every main-loop SD call holds
 * that interrupt off, as play_sd_wav.cpp does around SD.open / close.
 * Audio blocks are 2.9 ms apart: keep each guarded part to one SD call
 * (one open, one chunk of at most SD_CHUNK bytes, one close); the pending
 * audio update runs as soon as the guard ends.
 */

#ifndef SD_GUARD_H
#define SD_GUARD_H

#include <Arduino.h>
#include <SD.h>

#define SD_CHUNK 512   // bytes per guarded read / write (one card sector)

// AudioNoInterrupts() / AudioInterrupts(), but nest-safe: re-enables only
// what it disabled (same test as play_sd_wav.cpp)
class SdGuard {
public:
    SdGuard() : wasOn(NVIC_IS_ENABLED(IRQ_SOFTWARE)) { if (wasOn) NVIC_DISABLE_IRQ(IRQ_SOFTWARE); }
    ~SdGuard() { if (wasOn) NVIC_ENABLE_IRQ(IRQ_SOFTWARE); }
    SdGuard(const SdGuard&) = delete;
    SdGuard& operator=(const SdGuard&) = delete;
private:
    bool wasOn;
};

static inline bool sdExists(const char* path)          { SdGuard g; return SD.exists(path); }
static inline bool sdMkdir(const char* path)           { SdGuard g; return SD.mkdir(path); }
static inline File sdOpen(const char* path, uint8_t mode = FILE_READ) { SdGuard g; return SD.open(path, mode); }
static inline void sdClose(File& f)                     { SdGuard g; f.close(); }
static inline size_t sdWrite(File& f, const void* buf, size_t n) {
    SdGuard g;
    return f.write((const uint8_t*)buf, n);
}

// Print to a file through a RAM buffer: file.print() calls become one
// guarded write per SD_CHUNK bytes. close() flushes and closes.
class SdWriter : public Print {
public:
    SdWriter(const char* path, uint8_t mode = FILE_WRITE) : file(sdOpen(path, mode)), used(0) {}
    ~SdWriter() { close(); }
    explicit operator bool() { return (bool)file; }
    size_t write(uint8_t b) override {
        if (!file) return 0;
        buf[used++] = b;
        if (used == SD_CHUNK) flushBuf();
        return 1;
    }
    size_t write(const uint8_t* p, size_t n) override {
        for (size_t i = 0; i < n; i++) write(p[i]);
        return file ? n : 0;
    }
    void close() {
        if (!file) return;
        flushBuf();
        sdClose(file);
    }
private:
    File    file;
    uint8_t buf[SD_CHUNK];
    size_t  used;
    void flushBuf() { if (used) { sdWrite(file, buf, used); used = 0; } }
};

// Read a file as a Stream (for deserializeJson) one guarded SD_CHUNK at a
// time. Timeout 0: end of file returns at once instead of waiting 1 s.
class SdReader : public Stream {
public:
    explicit SdReader(const char* path) : file(sdOpen(path)), len(0), pos(0) { setTimeout(0); }
    ~SdReader() { close(); }
    explicit operator bool() { return (bool)file; }
    int available() override { return fill() ? (int)(len - pos) : 0; }
    int read() override      { return fill() ? buf[pos++] : -1; }
    int peek() override      { return fill() ? buf[pos] : -1; }
    size_t write(uint8_t) override { return 0; }
    void close() { if (file) sdClose(file); }
private:
    File    file;
    uint8_t buf[SD_CHUNK];
    size_t  len, pos;
    bool fill() {
        if (pos < len) return true;
        if (!file) return false;
        int n;
        { SdGuard g; n = file.read(buf, SD_CHUNK); }
        len = n > 0 ? (size_t)n : 0;
        pos = 0;
        return len > 0;
    }
};

#endif // SD_GUARD_H
