/**
 * Oh My Ondas - Audio Recorder
 * WAV capture to SD card using AudioRecordQueue
 */

#ifndef AUDIO_RECORDER_H
#define AUDIO_RECORDER_H

#include <Arduino.h>
#include <Audio.h>
#include <SD.h>
#include "config.h"

class AudioRecorder {
public:
    AudioRecorder();

    void begin(AudioRecordQueue* queue);
    void update();  // Call every loop iteration

    void startRecording(const char* filename);
    void stopRecording();
    bool isRecording();
    unsigned long getRecordingDuration();

private:
    AudioRecordQueue* queue;
    File wavFile;
    bool recording;
    unsigned long recordStartTime;
    uint32_t totalSamples;

    void writeWavHeader();
    void finalizeWavHeader();
};

#endif // AUDIO_RECORDER_H
