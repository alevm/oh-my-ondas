// Oh My Ondas - Scene System (Save/Recall mixer + FX states)

class SceneManager {
    constructor() {
        this.scenes = [null, null, null, null]; // A, B, C, D
        this.currentScene = 0;
        this.morphing = false;
        this.morphProgress = 0;
    }

    init() {
        // Initialize with default scene in slot A
        this.saveScene(0);
        console.log('SceneManager initialized');
        return true;
    }

    // Capture current state (full snapshot)
    captureState() {
        return {
            mixer: {
                mic: {
                    level: parseFloat(document.getElementById('faderMic')?.value || 80) / 100,
                    muted: document.getElementById('muteMic')?.classList.contains('active') || false
                },
                samples: {
                    level: parseFloat(document.getElementById('faderSamples')?.value || 80) / 100,
                    muted: document.getElementById('muteSamples')?.classList.contains('active') || false
                },
                synth: {
                    level: parseFloat(document.getElementById('faderSynth')?.value || 80) / 100,
                    muted: document.getElementById('muteSynth')?.classList.contains('active') || false
                },
                radio: {
                    level: parseFloat(document.getElementById('faderRadio')?.value || 80) / 100,
                    muted: document.getElementById('muteRadio')?.classList.contains('active') || false
                },
                master: parseFloat(document.getElementById('faderMaster')?.value || 90) / 100
            },
            fx: window.mangleEngine?.getState() || {},
            tempo: window.sequencer?.getTempo() || 120,
            // NEW: Store sequencer pattern (deep copy)
            pattern: JSON.parse(JSON.stringify(window.sequencer?.getPattern() || [])),
            // NEW: Store source routing (copy array)
            sources: [...(window.sequencer?.getTrackSources() || [])],
            // NEW: Store AI settings
            ai: {
                vibe: document.querySelector('.vibe-btn.active')?.dataset.vibe || 'calm',
                density: parseInt(document.getElementById('aiDensity')?.value || 50),
                complexity: parseInt(document.getElementById('aiComplexity')?.value || 50)
            },
            timestamp: Date.now()
        };
    }

    // Save current state to scene slot
    saveScene(index) {
        if (index < 0 || index > 3) return;

        this.scenes[index] = this.captureState();

        // Log summary for debugging
        const scene = this.scenes[index];
        const activeSteps = scene.pattern.reduce((sum, track) =>
            sum + track.filter(s => s.active).length, 0);
        console.log(`Saved scene ${['A', 'B', 'C', 'D'][index]}: tempo=${scene.tempo}, activeSteps=${activeSteps}, vibe=${scene.ai?.vibe}`);
    }

    // Recall scene instantly
    recallScene(index) {
        if (index < 0 || index > 3) {
            console.log(`Invalid scene index: ${index}`);
            return;
        }
        if (!this.scenes[index]) {
            console.log(`Scene ${['A', 'B', 'C', 'D'][index]} is empty - save first`);
            return;
        }

        const scene = this.scenes[index];
        this.applyState(scene);
        this.currentScene = index;

        // Log summary for debugging
        const activeSteps = scene.pattern?.reduce((sum, track) =>
            sum + track.filter(s => s.active).length, 0) || 0;
        console.log(`Recalled scene ${['A', 'B', 'C', 'D'][index]}: tempo=${scene.tempo}, activeSteps=${activeSteps}, vibe=${scene.ai?.vibe}`);
    }

    // Apply a state
    applyState(state) {
        if (!state) return;

        // Apply mixer levels
        if (state.mixer) {
            for (const [channel, data] of Object.entries(state.mixer)) {
                if (channel === 'master') {
                    const fader = document.getElementById('faderMaster');
                    if (fader) fader.value = data * 100;
                    window.audioEngine?.setMasterLevel(data);
                } else {
                    const fader = document.getElementById(`fader${channel.charAt(0).toUpperCase() + channel.slice(1)}`);
                    if (fader) fader.value = data.level * 100;
                    window.audioEngine?.setChannelLevel(channel, data.level);

                    // Handle mutes
                    const muteBtn = document.getElementById(`mute${channel.charAt(0).toUpperCase() + channel.slice(1)}`);
                    if (muteBtn) {
                        if (data.muted && !window.audioEngine?.isMuted(channel)) {
                            window.audioEngine?.toggleMute(channel);
                            muteBtn.classList.add('active');
                        } else if (!data.muted && window.audioEngine?.isMuted(channel)) {
                            window.audioEngine?.toggleMute(channel);
                            muteBtn.classList.remove('active');
                        }
                    }
                }
            }
        }

        // Apply FX
        if (state.fx && window.mangleEngine) {
            if (state.fx.delay) {
                window.mangleEngine.setDelayTime(state.fx.delay.time);
                window.mangleEngine.setDelayFeedback(state.fx.delay.feedback);
                window.mangleEngine.setDelayMix(state.fx.delay.mix);
            }
            if (state.fx.glitch) {
                window.mangleEngine.setGlitch(
                    state.fx.glitch.probability,
                    state.fx.glitch.sliceSize,
                    state.fx.glitch.mode
                );
            }
        }

        // Apply tempo
        if (state.tempo && window.sequencer) {
            window.sequencer.setTempo(state.tempo);
            // Update tempo UI
            const tempoSlider = document.getElementById('seqTempo');
            const tempoDisplay = document.getElementById('seqTempoDisplay');
            const tempoValue = document.getElementById('tempoValue');
            if (tempoSlider) tempoSlider.value = state.tempo;
            if (tempoDisplay) tempoDisplay.textContent = state.tempo;
            if (tempoValue) tempoValue.textContent = state.tempo;
        }

        // Update FX UI sliders
        if (state.fx) {
            if (state.fx.delay) {
                const delayTime = document.getElementById('delayTime');
                const delayFeedback = document.getElementById('delayFeedback');
                const delayMix = document.getElementById('delayMix');
                if (delayTime) {
                    delayTime.value = state.fx.delay.time;
                    document.getElementById('delayTimeDisplay').textContent = state.fx.delay.time;
                }
                if (delayFeedback) {
                    delayFeedback.value = state.fx.delay.feedback;
                    document.getElementById('delayFeedbackDisplay').textContent = state.fx.delay.feedback;
                }
                if (delayMix) {
                    delayMix.value = state.fx.delay.mix;
                    document.getElementById('delayMixDisplay').textContent = state.fx.delay.mix;
                }
            }
        }

        // Apply sequencer pattern
        if (state.pattern && window.sequencer) {
            const seq = window.sequencer;
            for (let t = 0; t < state.pattern.length; t++) {
                for (let s = 0; s < state.pattern[t].length; s++) {
                    if (seq.pattern[t] && seq.pattern[t][s]) {
                        seq.pattern[t][s] = { ...state.pattern[t][s] };
                    }
                }
            }
            // Notify app to update UI
            if (window.app) {
                window.app.updateStepGrid();
                window.app.updateTrackOverview();
            }
        }

        // Apply source routing
        if (state.sources && window.sequencer) {
            state.sources.forEach((source, idx) => {
                window.sequencer.setTrackSource(idx, source);
            });
            if (window.app) {
                window.app.updateSourceRouting();
            }
        }

        // Apply AI settings
        if (state.ai) {
            // Update vibe buttons
            document.querySelectorAll('.vibe-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.vibe === state.ai.vibe);
            });
            // Update sliders
            const densitySlider = document.getElementById('aiDensity');
            const complexitySlider = document.getElementById('aiComplexity');
            if (densitySlider) {
                densitySlider.value = state.ai.density;
                document.getElementById('aiDensityDisplay').textContent = state.ai.density;
            }
            if (complexitySlider) {
                complexitySlider.value = state.ai.complexity;
                document.getElementById('aiComplexityDisplay').textContent = state.ai.complexity;
            }
        }
    }

    // Morph between two scenes over time
    morphTo(targetIndex, durationMs = 2000) {
        if (targetIndex < 0 || targetIndex > 3 || !this.scenes[targetIndex]) return;
        if (this.morphing) return;

        const startScene = this.captureState();
        const endScene = this.scenes[targetIndex];

        this.morphing = true;
        this.morphProgress = 0;

        const startTime = Date.now();

        const morphStep = () => {
            const elapsed = Date.now() - startTime;
            this.morphProgress = Math.min(1, elapsed / durationMs);

            // Interpolate values
            const interpolated = this.interpolateScenes(startScene, endScene, this.morphProgress);
            this.applyState(interpolated);

            if (this.morphProgress < 1) {
                requestAnimationFrame(morphStep);
            } else {
                this.morphing = false;
                this.currentScene = targetIndex;
                console.log(`Morphed to scene ${['A', 'B', 'C', 'D'][targetIndex]}`);
            }
        };

        requestAnimationFrame(morphStep);
    }

    // Interpolate between two scenes
    interpolateScenes(start, end, t) {
        const lerp = (a, b, t) => a + (b - a) * t;

        return {
            mixer: {
                mic: {
                    level: lerp(start.mixer.mic.level, end.mixer.mic.level, t),
                    muted: t < 0.5 ? start.mixer.mic.muted : end.mixer.mic.muted
                },
                samples: {
                    level: lerp(start.mixer.samples.level, end.mixer.samples.level, t),
                    muted: t < 0.5 ? start.mixer.samples.muted : end.mixer.samples.muted
                },
                synth: {
                    level: lerp(start.mixer.synth.level, end.mixer.synth.level, t),
                    muted: t < 0.5 ? start.mixer.synth.muted : end.mixer.synth.muted
                },
                radio: {
                    level: lerp(start.mixer.radio.level, end.mixer.radio.level, t),
                    muted: t < 0.5 ? start.mixer.radio.muted : end.mixer.radio.muted
                },
                master: lerp(start.mixer.master, end.mixer.master, t)
            },
            fx: {
                delay: {
                    time: lerp(start.fx.delay?.time || 250, end.fx.delay?.time || 250, t),
                    feedback: lerp(start.fx.delay?.feedback || 30, end.fx.delay?.feedback || 30, t),
                    mix: lerp(start.fx.delay?.mix || 0, end.fx.delay?.mix || 0, t)
                }
            },
            tempo: Math.round(lerp(start.tempo || 120, end.tempo || 120, t))
        };
    }

    getCurrentScene() {
        return this.currentScene;
    }

    getScene(index) {
        return this.scenes[index];
    }

    hasScene(index) {
        return this.scenes[index] !== null;
    }
}

// Global instance
window.sceneManager = new SceneManager();
