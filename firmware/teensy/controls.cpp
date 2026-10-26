/**
 * Oh My Ondas - Controls
 * What the encoders, buttons, faders, nav, pads, MIDI transport and
 * gestures do, plus the capture flow. Objects live in main.ino (app.h).
 */

#include "app.h"

// ============================================
// ENCODER CALLBACK — 7 encoders on the Quad boards
// ============================================

void onEncoderChange(int encoderID, int delta) {
    DEBUG_PRINTF("Encoder %d: %+d (shift: %d)\n", encoderID, delta, state.shiftPressed);
    espLink.userEncoder(encoderID, delta);

    switch (encoderID) {
        // ── Quad #1 ──
        case ENC_VOL:
            if (state.shiftPressed) {
                // Scene morph
                static float morphProgress = 0.0f;
                morphProgress = constrain(morphProgress + delta * 0.05f, 0.0f, 1.0f);
                Scene morphed;
                if (sceneManager.morphTo(state.currentScene, morphProgress, morphed)) {
                    state.masterVolume = morphed.masterVolume;
                    for (int i = 0; i < MAX_TRACKS; i++) {
                        samplingEngine.setVolume(i, morphed.trackVolumes[i]);
                    }
                }
            } else {
                state.masterVolume = constrain(state.masterVolume + delta * 0.02f, 0.0f, 1.0f);
                outputMixer.gain(0, state.masterVolume);
            }
            break;

        case ENC_PAN:
            if (state.shiftPressed) {
                fxEngine.adjustParam(1, delta * 0.01f);
            } else {
                fxEngine.selectEffect(delta);
            }
            break;

        case ENC_FILT:
            if (state.shiftPressed) {
                fxEngine.setLFORate(fxEngine.getLFORate() + delta * 0.1f);   // clamped 0.01..20 Hz
            } else {
                fxEngine.adjustParam(0, delta * 0.01f);
            }
            break;

        case ENC_FX:
            if (state.shiftPressed) {
                fxEngine.adjustParam(2, delta * 0.01f);
            } else {
                // The mapper modulates around the user's mix (only if a route targets it)
                fxEngine.setMix(constrain(mapper.getUserBase(MT_FX_MIX) + delta * 0.02f, 0.0f, 1.0f));
                mapper.userSet(MT_FX_MIX, fxEngine.getMix());
            }
            break;

        // ── Quad #2 ──
        case ENC_DECAY:
            if (lcdDisplay.getScreen() == LCD_RADIO) {
                // RAD screen: tune, SHIFT = seek in the turn direction
                if (state.shiftPressed) radio.seek(delta);
                else                    radio.tune(delta);
                break;
            }
            if (state.shiftPressed) {
                sequencer.adjustSwing(delta);
            } else {
                state.bpm = constrain(state.bpm + delta, 40.0f, 300.0f);
                sequencer.setTempo(state.bpm);
                mapper.userTouchedTempo();   // pulse follow waits, then resumes
            }
            break;

        case ENC_CUT:
            if (state.shiftPressed) {
                synthVoice.setFilterRes(synthVoice.getFilterRes() + delta * 0.05f);   // clamped 0..SYNTH_RES_MAX
            } else {
                // Cutoff in 1/12-octave steps around the user's base; the mapper modulates around it
                float f = constrain(mapper.getUserBase(MT_FILTER) * powf(2.0f, delta / 12.0f), 200.0f, 12000.0f);
                mapper.userSet(MT_FILTER, f);
                synthVoice.setFilterFreq(f);
            }
            break;
        case ENC_ATK:
            if (state.shiftPressed) {
                synthVoice.setRelease(synthVoice.getRelease() + delta * 20.0f);   // clamped 1..SYNTH_RELEASE_MAX_MS
            } else {
                synthVoice.setAttack(synthVoice.getAttack() + delta * 5.0f);      // clamped 1..SYNTH_ATTACK_MAX_MS
            }
            break;

        // ── ANO nav wheel: scrolls what the screen shows ──
        case ENC_NAV_WHEEL:
            if (lcdDisplay.getScreen() == LCD_RADIO) {
                radio.tune(delta);                       // fine tune, one step per click
            } else if (lcdDisplay.getScreen() == LCD_PATTERN) {
                int t = constrain(sequencer.getSelectedTrack() + delta, 0, MAX_TRACKS - 1);
                sequencer.selectTrack(t);
            } else {
                // Scroll through the screens
                int s = ((int)lcdDisplay.getScreen() + (delta > 0 ? 1 : -1) + LCD_COUNT) % LCD_COUNT;
                lcdDisplay.setScreen((LCDScreen)s);
            }
            break;
    }
}

// ============================================
// BUTTON CALLBACK — 4 buttons + encoder pushes (see config.h ButtonID)
// ============================================

void onButtonEvent(int buttonID, bool pressed) {
    DEBUG_PRINTF("Button %d: %s\n", buttonID, pressed ? "DOWN" : "UP");

    // SHIFT is a held state, not a toggle
    if (buttonID == BTN_SHIFT) {
        state.shiftPressed = pressed;
        return;
    }

    // Only act on press (not release) for most buttons
    if (!pressed) return;

    switch (buttonID) {
        case BTN_MODE:
            if (state.shiftPressed) {          // SHIFT + MODE: walk starts here (height, steps)
                motionSensors.resetWalk();
                lcdDisplay.showMessage("WALK START");
            } else {
                onModePressed();
            }
            break;
        case BTN_REC:
            if (state.shiftPressed) onCapturePressed();   // SHIFT + REC: capture to memory
            else                    onRecPressed();       // REC: output recording to SD
            break;
        case BTN_PLAY:
            if (state.shiftPressed) {          // SHIFT + PLAY: compass calibration
                if (motionSensors.compassPresent()) {
                    motionSensors.startCompassCal();
                    lcdDisplay.showMessage("TURN ALL WAYS", MAG_CAL_MS);
                } else {
                    lcdDisplay.showMessage("NO COMPASS");
                }
            } else {
                onPlayPressed();
            }
            break;
        case BTN_STOP:  onStopPressed();  break;

        case BTN_PIC:
            // Navigate LCD screen: Picture/Mixer
            lcdDisplay.setScreen(LCD_MIXER);
            break;
        case BTN_SND:
            lcdDisplay.setScreen(LCD_SYNTH);
            break;
        case BTN_INT:
            lcdDisplay.setScreen(LCD_FX);
            break;
        case BTN_JRN:
            // Journal: toggle recording
            onRecPressed();
            break;
        case BTN_MENU:
            lcdDisplay.setScreen(LCD_SETTINGS);
            break;
        case BTN_BACK:
            lcdDisplay.setScreen(LCD_MAIN);
            break;
        case BTN_PAGE:
            // Cycle through screens
            lcdDisplay.setScreen((LCDScreen)((lcdDisplay.getScreen() + 1) % LCD_COUNT));
            break;

        case BTN_DUB:
            state.mode = MODE_DUB;
            lcdDisplay.showMessage("DUB MODE");
            break;
        case BTN_FILL:
            sequencer.setFillMode(!sequencer.isFillMode());
            lcdDisplay.showMessage(sequencer.isFillMode() ? "FILL ON" : "FILL OFF");
            break;
        case BTN_CLR:
            if (state.shiftPressed) {
                sequencer.clearPattern();
                lcdDisplay.showMessage("CLEARED");
            } else {
                // Clear current step
                int sel = sequencer.getSelectedTrack();
                int step = sequencer.getCurrentStep();
                sequencer.setStep(sel, step, false);
            }
            break;
        case BTN_SCN:
            state.mode = MODE_SCENE;
            lcdDisplay.setScreen(LCD_SCENE);
            lcdDisplay.showMessage("SCENE");
            break;
        case BTN_BANK:
            if (state.shiftPressed) {
                samplingEngine.saveBank(samplingEngine.getCurrentBank());
                lcdDisplay.showMessage("BANK SAVED");
            } else {
                int nextBank = (samplingEngine.getCurrentBank() + 1) % 8;
                samplingEngine.loadBank(nextBank);
                lcdDisplay.showMessage("BANK");
            }
            break;
        case BTN_PREV:
            if (state.mode == MODE_PATTERN) {
                int pat = sequencer.getCurrentPattern();
                if (pat > 0) {
                    sequencer.loadPattern(pat - 1);
                    state.currentPattern = pat - 1;
                }
            } else {
                // Navigate tracks
                int t = sequencer.getSelectedTrack();
                if (t > 0) sequencer.selectTrack(t - 1);
            }
            break;
        case BTN_NEXT:
            if (state.mode == MODE_PATTERN) {
                int pat = sequencer.getCurrentPattern();
                if (pat < MAX_PATTERNS - 1) {
                    sequencer.loadPattern(pat + 1);
                    state.currentPattern = pat + 1;
                }
            } else {
                int t = sequencer.getSelectedTrack();
                if (t < MAX_TRACKS - 1) sequencer.selectTrack(t + 1);
            }
            break;
    }
}

// ============================================
// FADER CALLBACK
// ============================================

void onFaderChange(int faderID, float value) {
    DEBUG_PRINTF("Fader %d: %.2f\n", faderID, value);
    midiIO.sendFader(faderID, value);
    espLink.userFader(faderID, value);

    switch (faderID) {
        case FADER_MIC:
            inputMixer.gain(0, value);   // LINE-IN L: mic / piezo
            break;
        case FADER_SMP:
            masterMix.gain(0, value);
            break;
        case FADER_SYN:
            masterMix.gain(1, value);
            break;
        case FADER_RAD:
            inputMixer.gain(1, value);   // LINE-IN R: Si4732 radio
            break;
        case FADER_OUT:
            // Fader 5: master output level (ENC_VOL nudges the same value)
            state.masterVolume = value;
            break;
    }
}

// ============================================
// JOYSTICK CALLBACK
// ============================================

void onJoystickChange(uint8_t directions) {
    // SHIFT + nav stands in for the v0.3 PREV / NEXT / BACK buttons
    if (state.shiftPressed) {
        if (directions & JOY_UP) {
            // The MIC/PIEZO toggle is a hardware switch the firmware cannot read: say which
            // The 4-way source switch is not readable: say which position it is in
            uint8_t src = nextLeftSource(features.getLeftSource());
            features.setLeftSource(src);
            char msg[24];
            snprintf(msg, sizeof(msg), "IN L: %s", sourceName(src));
            lcdDisplay.showMessage(msg);
        }
        if (directions & JOY_DOWN) {
            // Tempo follow: off -> sensed pulse -> walking cadence -> off
            FollowMode m = (FollowMode)((mapper.getFollow() + 1) % 3);
            mapper.setFollow(m);
            static const char* names[3] = {"FIXED TEMPO", "FOLLOW PULSE", "FOLLOW WALK"};
            lcdDisplay.showMessage(names[m]);
        }
        if (lcdDisplay.getScreen() == LCD_RADIO && (directions & (JOY_LEFT | JOY_RIGHT))) {
            // SHIFT + nav L/R on the RAD screen: tune one step (the wheel's job without the ANO)
            radio.tune((directions & JOY_RIGHT) ? 1 : -1);
            return;
        }
        if (directions & JOY_LEFT)   onButtonEvent(BTN_PREV, true);
        if (directions & JOY_RIGHT)  onButtonEvent(BTN_NEXT, true);
        if (directions & JOY_CENTER) onButtonEvent(BTN_BACK, true);
        return;
    }
    if ((directions & JOY_UP) && lcdDisplay.getScreen() == LCD_SENSE) {
        // SENSE screen: nav up switches the gestures on / off
        gesturesOn = !gesturesOn;
        lcdDisplay.showMessage(gesturesOn ? "GESTURES ON" : "GESTURES OFF");
        directions &= ~JOY_UP;
    }
    if (directions & JOY_UP) {
        mapDisplay.zoomIn();
    }
    if (directions & JOY_DOWN) {
        mapDisplay.zoomOut();
    }
    if (lcdDisplay.getScreen() == LCD_RADIO && (directions & (JOY_LEFT | JOY_RIGHT))) {
        radio.nextBand((directions & JOY_RIGHT) ? 1 : -1);
        directions &= ~(JOY_LEFT | JOY_RIGHT);  // not also a pattern step
    }
    if (directions & JOY_LEFT) {
        // Navigate pattern left
        int step = sequencer.getCurrentStep();
        if (step > 0) sequencer.setPosition(step - 1);
    }
    if (directions & JOY_RIGHT) {
        int step = sequencer.getCurrentStep();
        sequencer.setPosition(step + 1);
    }
    if (directions & JOY_CENTER) {
        // Toggle between LCD screens
        lcdDisplay.setScreen((LCDScreen)((lcdDisplay.getScreen() + 1) % LCD_COUNT));
    }
}

// ============================================
// TOUCH PAD CALLBACK
// ============================================

void onTouchEvent(int pad, bool pressed) {
    midiIO.sendPad(pad, pressed, 0.8f);
    if (pressed) espLink.userPad(pad);
    if (pressed) {
        DEBUG_PRINTF("Pad %d pressed\n", pad);

        switch (state.mode) {
            case MODE_LIVE:
                if (state.shiftPressed) {
                    static const float noteFreqs[] = {
                        261.63, 293.66, 329.63, 349.23,
                        392.00, 440.00, 493.88, 523.25
                    };
                    synthVoice.noteOn(noteFreqs[pad], 0.8);
                } else {
                    samplingEngine.trigger(pad);
                }
                break;

            case MODE_PATTERN:
                if (state.shiftPressed) {
                    sequencer.toggleStep(pad);
                } else {
                    sequencer.selectTrack(pad);
                }
                break;

            case MODE_SCENE:
                if (state.shiftPressed) {
                    Scene scene;
                    scene.masterVolume = state.masterVolume;
                    scene.bpm = state.bpm;
                    scene.currentFX = fxEngine.getCurrentEffect();
                    scene.patternNumber = state.currentPattern;
                    for (int i = 0; i < MAX_TRACKS; i++) {
                        scene.trackVolumes[i] = samplingEngine.getVolume(i);
                        scene.trackMutes[i] = sequencer.isTrackMuted(i);
                    }
                    for (int i = 0; i < 3; i++) {
                        scene.fxParams[i] = fxEngine.getParam(i);
                    }
                    scene.fxMix = fxEngine.getMix();
                    sceneManager.saveScene(pad % MAX_SCENES, scene);
                    lcdDisplay.showMessage("SAVED");
                } else if (pad < MAX_SCENES) {
                    Scene scene;
                    if (sceneManager.recallScene(pad, scene)) {
                        state.masterVolume = scene.masterVolume;
                        state.bpm = scene.bpm;
                        sequencer.setTempo(scene.bpm);
                        state.currentScene = pad;
                        for (int i = 0; i < MAX_TRACKS; i++) {
                            samplingEngine.setVolume(i, scene.trackVolumes[i]);
                            if (scene.trackMutes[i]) sequencer.muteTrack(i);
                            else sequencer.unmuteTrack(i);
                        }
                        fxEngine.setMix(scene.fxMix);
                        for (int i = 0; i < 3; i++) {
                            fxEngine.setParam(i, scene.fxParams[i]);
                        }
                        lcdDisplay.showMessage("RECALL");
                    }
                }
                break;

            case MODE_DUB:
                samplingEngine.trigger(pad);
                if (state.isPlaying) {
                    int step = sequencer.getCurrentStep();
                    sequencer.setStep(pad, step, true);
                    DEBUG_PRINTF("DUB: recorded pad %d at step %d\n", pad, step);
                }
                break;

            case MODE_AI_COMPOSE: {
                // Audition: pad 0 = newest capture, pad 1 the one before, ...
                const Capture* c = captureByRecency(pad);
                if (c) {
                    samplingEngine.playCapture(CAPVOICE_PREVIEW, c->id, captureStore.samples(*c),
                                               0, c->length, 1.0f, 1.0f);
                }
                break;
            }
            default:
                break;
        }
    } else {
        // Release
        if (state.mode == MODE_LIVE) {
            if (state.shiftPressed) {
                synthVoice.noteOff();
            } else if (!samplingEngine.isLooping(pad)) {
                samplingEngine.stop(pad);
            }
        }
    }
}

// ============================================
// MODE / TRANSPORT
// ============================================

void onModePressed() {
    state.mode = (SystemMode)((state.mode + 1) % MODE_COUNT);
    espLink.userChanged();
    const char* modeNames[] = {"LIVE", "PATTERN", "SCENE", "DUB", "AI"};
    lcdDisplay.showMessage(modeNames[state.mode]);

    switch (state.mode) {
        case MODE_LIVE:       lcdDisplay.setScreen(LCD_MAIN);    break;
        case MODE_PATTERN:    lcdDisplay.setScreen(LCD_PATTERN); break;
        case MODE_SCENE:      lcdDisplay.setScreen(LCD_SCENE);   break;
        case MODE_DUB:        lcdDisplay.setScreen(LCD_MAIN);    break;
        case MODE_AI_COMPOSE: lcdDisplay.setScreen(LCD_SETTINGS); break;
        default: break;
    }
}

void onPlayPressed() {
    state.isPlaying = !state.isPlaying;
    if (state.isPlaying) {
        sequencer.start();
        lcdDisplay.showMessage("PLAY");
    } else {
        sequencer.stop();
        lcdDisplay.showMessage("STOP");
    }
}

// External MIDI: Start = from step 1, Continue = from here, Stop = stop (no reset)
void onMidiTransport(MidiTransport cmd) {
    if (cmd == MIDI_T_START) {
        sequencer.reset();
        if (!state.isPlaying) onPlayPressed();
    } else if (cmd == MIDI_T_CONTINUE) {
        if (!state.isPlaying) {
            state.isPlaying = true;
            sequencer.resume();
            lcdDisplay.showMessage("PLAY");
        }
    } else if (state.isPlaying) {
        state.isPlaying = false;
        sequencer.pause();   // keeps the position for Continue / Song Position
        lcdDisplay.showMessage("STOP");
    }
}

void onMidiPosition(uint16_t sixteenths) {
    sequencer.setPosition(sixteenths % sequencer.getPatternLength());
}

void onMidiTempo(float bpm) {
    if (fabsf(bpm - state.bpm) < 0.3f) return;
    state.bpm = bpm;
    sequencer.setTempo(bpm);
}

void onStopPressed() {
    state.isPlaying = false;
    sequencer.stop();
    sequencer.reset();
    samplingEngine.stopAll();
    lcdDisplay.showMessage("STOP");
}

void onRecPressed() {
    state.isRecording = !state.isRecording;
    if (state.isRecording) {
        char filename[64];
        int recNum = 0;
        do {
            snprintf(filename, sizeof(filename), "/recordings/rec_%04d.wav", recNum++);
        } while (sdExists(filename) && recNum < 9999);

        audioRecorder.startRecording(filename);

        if (state.gps.valid) {
            char metaPath[64];
            snprintf(metaPath, sizeof(metaPath), "/recordings/rec_%04d.json", recNum - 1);
            SdWriter meta(metaPath);
            if (meta) {
                meta.printf("{\"lat\":%.6f,\"lon\":%.6f,\"time\":%lu}\n",
                           state.gps.lat, state.gps.lon, millis());
                meta.close();
            }
        }
        lcdDisplay.showMessage("REC");
    } else {
        audioRecorder.stopRecording();
        lcdDisplay.showMessage("STOP REC");
    }
}

// ============================================
// CAPTURES
// ============================================

// SHIFT + REC: start a capture (press again to stop early). On the RAD
// screen it captures the radio, elsewhere LINE-IN L (mic or piezo).
void onCapturePressed() {
    if (captureStore.isRecording()) {
        captureStore.stopCapture();
        return;
    }
    if (!captureStore.isReady()) {
        lcdDisplay.showMessage("NO CAPTURE MEM");
        return;
    }
    bool radioSrc = lcdDisplay.getScreen() == LCD_RADIO;
    uint8_t src = radioSrc ? RIGHT_SRC_RADIO : features.getLeftSource();
    if (captureStore.startCapture(radioSrc ? &senseR : &senseL, src)) {
        char msg[24];
        snprintf(msg, sizeof(msg), "CAPTURE %s", sourceName(src));
        lcdDisplay.showMessage(msg);
    }
}

// Motion: gesture actions (each switchable in config.h, all behind
// gesturesOn) and the end of a compass calibration
void handleMotion() {
    static uint32_t lastFrame = 0;
    static bool wasCal = false;
    if (wasCal && !motionSensors.isCalibrating()) {
        lcdDisplay.showMessage(motionSensors.compassCalibrated() ? "COMPASS OK" : "COMPASS: TRY AGAIN");
    }
    wasCal = motionSensors.isCalibrating();
    if (motionSensors.frameCount() == lastFrame) return;
    lastFrame = motionSensors.frameCount();
    uint8_t g = motionSensors.motion().gesture;
    if (!gesturesOn || g == GEST_NONE) return;
    switch (g) {
        case GEST_SHAKE:
#if GESTURE_SHAKE_CAPTURE
            if (!captureStore.isRecording() &&
                captureStore.startCapture(&senseL, features.getLeftSource())) {
                lcdDisplay.showMessage("SHAKE: CAPTURE");
            }
#endif
            break;
        case GEST_TILT_LEFT:
        case GEST_TILT_RIGHT:
#if GESTURE_TILT_MELODY
            renderer.selectMelodyCapture(g == GEST_TILT_RIGHT ? 1 : -1);
            {
                char msg[24];
                snprintf(msg, sizeof(msg), "MELODY c%02u", renderer.melodyOverride());
                lcdDisplay.showMessage(msg);
            }
#endif
            break;
        case GEST_FLIP:
#if GESTURE_FLIP_MUTE
            renderer.setLayersMuted(motionSensors.motion().faceDown);
            lcdDisplay.showMessage(renderer.layersMuted() ? "LAYERS MUTED" : "LAYERS ON");
#endif
            break;
    }
}

// Sequencer step tick (every step while playing): the capture renderer
void onSequencerStep(int step) {
    renderer.onStep(step);
}

// While playing, take a capture now and then so the music keeps being made
// of the place. Captures stay on the device, but automatic ones still never
// keep speech: not started while speech is present, and cancelled if speech
// shows up while recording. (A capture the user asks for with SHIFT+REC is
// kept.) Alternates LINE-IN L and the radio when the radio is fitted.
void autoCapture() {
#if CAPTURE_AUTO_MS > 0
    static unsigned long last = 0;
    static bool radioTurn = false;
    static bool autoLeft = false;    // an automatic mic/piezo capture is recording
    unsigned long now = millis();
    if (captureStore.isRecording()) {
        if (autoLeft && sourceCarriesSpeech(captureStore.recordingSource()) && features.speechPresent()) {
            captureStore.cancelCapture();
            autoLeft = false;
        }
        return;
    }
    autoLeft = false;
    if (!state.isPlaying || !captureStore.isReady()) return;
    if (now - last < CAPTURE_AUTO_MS && captureStore.count() > 0) return;
    if (now - last < 5000) return;   // first ones: not more often than every 5 s
    bool useRadio = radioTurn && radio.isFitted();
    radioTurn = !radioTurn;
    if (useRadio) {
        if (features.radioFrame().rmsDb < -45.0f) return;
        last = now;
        captureStore.startCapture(&senseR, RIGHT_SRC_RADIO);
    } else {
        const FeatureFrame& f = features.frame();
        if (f.rmsDb < -45.0f) return;
        if (sourceCarriesSpeech(f.source) && (!features.isReady() || features.speechPresent())) return;
        last = now;
        autoLeft = captureStore.startCapture(&senseL, f.source);
    }
#endif
}

// A capture's memory is about to be reused: stop anything playing it
void onCaptureEvicted(uint8_t id) {
    samplingEngine.stopCaptureTag(id);
}

const Capture* captureByRecency(int n) {
    const Capture* order[CAPTURE_MAX];
    int count = 0;
    for (int i = 0; i < CAPTURE_MAX; i++) if (captureStore.at(i)) order[count++] = captureStore.at(i);
    if (n < 0 || n >= count) return nullptr;
    // n-th largest seq
    for (int k = 0; k <= n; k++) {
        for (int j = k + 1; j < count; j++) {
            if (order[j]->seq > order[k]->seq) { const Capture* t = order[k]; order[k] = order[j]; order[j] = t; }
        }
    }
    return order[n];
}
