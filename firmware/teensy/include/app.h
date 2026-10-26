/**
 * Oh My Ondas - objects shared between main.ino and controls.cpp
 * They are defined in main.ino; this header only declares them.
 */

#ifndef APP_H
#define APP_H

#include <Audio.h>
#include "config.h"
#include "system_state.h"
#include "sampling_engine.h"
#include "sequencer.h"
#include "fx_engine.h"
#include "synth_voice.h"
#include "scene_manager.h"
#include "audio_recorder.h"
#include "input_manager.h"
#include "lcd_display.h"
#include "map_display.h"
#include "radio.h"
#include "midi_io.h"
#include "audio_sense.h"
#include "feature_extractor.h"
#include "capture_store.h"
#include "continuous_mapper.h"
#include "plan_renderer.h"
#include "esp_link.h"
#include "motion_sensors.h"
#include "sd_guard.h"

// Audio objects the controls set directly
extern AudioMixer4 inputMixer;
extern AudioMixer4 masterMix;
extern AudioMixer4 outputMixer;
extern AudioSense  senseL;
extern AudioSense  senseR;

extern SystemState state;

extern SamplingEngine   samplingEngine;
extern Sequencer        sequencer;
extern FXEngine         fxEngine;
extern SynthVoice       synthVoice;
extern SceneManager     sceneManager;
extern AudioRecorder    audioRecorder;
extern InputManager     inputManager;
extern LCDDisplay       lcdDisplay;
extern MapDisplay       mapDisplay;
extern Radio            radio;
extern MidiIO           midiIO;
extern FeatureExtractor features;
extern CaptureStore     captureStore;
extern ContinuousMapper mapper;
extern PlanRenderer     renderer;
extern EspLink          espLink;
extern MotionSensors    motionSensors;
extern bool             gesturesOn;

// controls.cpp: input callbacks
void onEncoderChange(int encoderID, int delta);
void onButtonEvent(int buttonID, bool pressed);
void onFaderChange(int faderID, float value);
void onJoystickChange(uint8_t directions);
void onTouchEvent(int pad, bool pressed);

// controls.cpp: actions
void onModePressed();
void onRecPressed();
void onCapturePressed();
void onCaptureEvicted(uint8_t id);
void onSequencerStep(int step);
void autoCapture();
void handleMotion();
const Capture* captureByRecency(int n);
void onPlayPressed();
void onStopPressed();
void onMidiTransport(MidiTransport cmd);
void onMidiPosition(uint16_t sixteenths);
void onMidiTempo(float bpm);

#endif // APP_H
