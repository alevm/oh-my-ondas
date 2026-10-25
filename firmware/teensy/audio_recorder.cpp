/**
 * Oh My Ondas - Audio Recorder Implementation
 * WAV capture to SD card using AudioRecordQueue
 */

#include "audio_recorder.h"
#include "sd_guard.h"

AudioRecorder::AudioRecorder()
    : queue(nullptr)
    , recording(false)
    , recordStartTime(0)
    , totalSamples(0)
{
}

void AudioRecorder::begin(AudioRecordQueue* q) {
    queue = q;
    DEBUG_PRINTLN("AudioRecorder: Ready");
}

void AudioRecorder::update() {
    if (!recording || !queue) return;

    // Drain available audio buffers to SD, one guarded write per block
    // (SD WAV players read the card in the audio interrupt)
    while (queue->available() > 0) {
        int16_t* buf = queue->readBuffer();
        sdWrite(wavFile, buf, 256);  // 128 samples * 2 bytes
        queue->freeBuffer();
        totalSamples += 128;
    }
}

void AudioRecorder::startRecording(const char* filename) {
    if (!queue) return;
    if (recording) stopRecording();

    wavFile = sdOpen(filename, FILE_WRITE);
    if (!wavFile) {
        DEBUG_PRINTF("AudioRecorder: Cannot open %s\n", filename);
        return;
    }

    totalSamples = 0;
    writeWavHeader();

    queue->begin();
    recording = true;
    recordStartTime = millis();

    DEBUG_PRINTF("AudioRecorder: Recording to %s\n", filename);
}

void AudioRecorder::stopRecording() {
    if (!recording) return;

    if (queue) queue->end();
    // Drain remaining buffers
    if (queue) {
        while (queue->available() > 0) {
            int16_t* buf = queue->readBuffer();
            sdWrite(wavFile, buf, 256);
            queue->freeBuffer();
            totalSamples += 128;
        }
    }

    finalizeWavHeader();
    sdClose(wavFile);
    recording = false;

    DEBUG_PRINTF("AudioRecorder: Stopped (%lu samples, %lu ms)\n",
                 totalSamples, millis() - recordStartTime);
}

bool AudioRecorder::isRecording() {
    return recording;
}

unsigned long AudioRecorder::getRecordingDuration() {
    if (!recording) return 0;
    return millis() - recordStartTime;
}

void AudioRecorder::writeWavHeader() {
    // Placeholder WAV header (44 bytes), built in RAM and written in one
    // guarded call; finalized with the actual size on stop
    uint32_t dataSize = 0;  // placeholder
    uint32_t fileSize = 36 + dataSize;
    uint32_t sampleRate = 44100;
    uint16_t numChannels = 1;
    uint16_t bitsPerSample = 16;
    uint32_t byteRate = sampleRate * numChannels * bitsPerSample / 8;
    uint16_t blockAlign = numChannels * bitsPerSample / 8;
    uint32_t fmtSize = 16;
    uint16_t audioFormat = 1;  // PCM

    uint8_t h[44];
    memcpy(h, "RIFF", 4);
    memcpy(h + 4, &fileSize, 4);
    memcpy(h + 8, "WAVE", 4);

    // fmt sub-chunk
    memcpy(h + 12, "fmt ", 4);
    memcpy(h + 16, &fmtSize, 4);
    memcpy(h + 20, &audioFormat, 2);
    memcpy(h + 22, &numChannels, 2);
    memcpy(h + 24, &sampleRate, 4);
    memcpy(h + 28, &byteRate, 4);
    memcpy(h + 32, &blockAlign, 2);
    memcpy(h + 34, &bitsPerSample, 2);

    // data sub-chunk
    memcpy(h + 36, "data", 4);
    memcpy(h + 40, &dataSize, 4);
    sdWrite(wavFile, h, sizeof(h));
}

void AudioRecorder::finalizeWavHeader() {
    uint32_t dataSize = totalSamples * 2;  // 16-bit = 2 bytes per sample
    uint32_t fileSize = 36 + dataSize;

    // Seek back and write correct sizes
    SdGuard g;
    wavFile.seek(4);
    wavFile.write((byte*)&fileSize, 4);

    wavFile.seek(40);
    wavFile.write((byte*)&dataSize, 4);
}
