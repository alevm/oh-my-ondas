/**
 * Oh My Ondas - Audio Recorder Implementation
 * WAV capture to SD card using AudioRecordQueue
 */

#include "audio_recorder.h"

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

    // Drain available audio buffers to SD
    while (queue->available() > 0) {
        int16_t* buf = queue->readBuffer();
        wavFile.write((byte*)buf, 256);  // 128 samples * 2 bytes
        queue->freeBuffer();
        totalSamples += 128;
    }
}

void AudioRecorder::startRecording(const char* filename) {
    if (!queue) return;
    if (recording) stopRecording();

    wavFile = SD.open(filename, FILE_WRITE);
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
            wavFile.write((byte*)buf, 256);
            queue->freeBuffer();
            totalSamples += 128;
        }
    }

    finalizeWavHeader();
    wavFile.close();
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
    // Write placeholder WAV header (44 bytes)
    // Will be finalized with actual size on stop
    uint32_t dataSize = 0;  // placeholder
    uint32_t fileSize = 36 + dataSize;
    uint32_t sampleRate = 44100;
    uint16_t numChannels = 1;
    uint16_t bitsPerSample = 16;
    uint32_t byteRate = sampleRate * numChannels * bitsPerSample / 8;
    uint16_t blockAlign = numChannels * bitsPerSample / 8;

    wavFile.write("RIFF", 4);
    wavFile.write((byte*)&fileSize, 4);
    wavFile.write("WAVE", 4);

    // fmt sub-chunk
    wavFile.write("fmt ", 4);
    uint32_t fmtSize = 16;
    wavFile.write((byte*)&fmtSize, 4);
    uint16_t audioFormat = 1;  // PCM
    wavFile.write((byte*)&audioFormat, 2);
    wavFile.write((byte*)&numChannels, 2);
    wavFile.write((byte*)&sampleRate, 4);
    wavFile.write((byte*)&byteRate, 4);
    wavFile.write((byte*)&blockAlign, 2);
    wavFile.write((byte*)&bitsPerSample, 2);

    // data sub-chunk
    wavFile.write("data", 4);
    wavFile.write((byte*)&dataSize, 4);
}

void AudioRecorder::finalizeWavHeader() {
    uint32_t dataSize = totalSamples * 2;  // 16-bit = 2 bytes per sample
    uint32_t fileSize = 36 + dataSize;

    // Seek back and write correct sizes
    wavFile.seek(4);
    wavFile.write((byte*)&fileSize, 4);

    wavFile.seek(40);
    wavFile.write((byte*)&dataSize, 4);
}
