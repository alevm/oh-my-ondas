// Oh My Ondas - App: Knobs, synth, oscilloscope, scenes, FX and punch FX
// Methods of App (js/app.js), split out by area; loaded right after app.js.

class AppSound {
    // Knobs
    setupKnobs() {
        // Target selector buttons (FX/SYN/SMP)
        const targetBtns = document.querySelectorAll('.target-btn');
        this.knobTarget = 'fx';  // Default target

        targetBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                targetBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.knobTarget = btn.dataset.target;
            });
        });

        const knobs = document.querySelectorAll('.knob');

        knobs.forEach(knob => {
            const param = knob.dataset.param;
            const min = parseFloat(knob.dataset.min);
            const max = parseFloat(knob.dataset.max);
            let value = parseFloat(knob.dataset.value);

            // Add value tooltip element
            let valueEl = knob.querySelector('.knob-value');
            if (!valueEl) {
                valueEl = document.createElement('div');
                valueEl.className = 'knob-value';
                knob.appendChild(valueEl);
            }

            // Set initial rotation
            this.updateKnobRotation(knob, value, min, max);
            valueEl.textContent = Math.round(value);

            let isDragging = false;
            let startY = 0;
            let startValue = 0;

            const onStart = (e) => {
                isDragging = true;
                knob.classList.add('dragging');
                startY = e.clientY || e.touches?.[0]?.clientY || 0;
                startValue = value;
                e.preventDefault();
            };

            const onMove = (e) => {
                if (!isDragging) return;
                const clientY = e.clientY || e.touches?.[0]?.clientY || 0;
                const delta = (startY - clientY) * 0.5;
                value = Math.max(min, Math.min(max, startValue + delta * (max - min) / 100));

                this.updateKnobRotation(knob, value, min, max);
                this.applyKnobValue(param, value);
                knob.dataset.value = value;
                valueEl.textContent = Math.round(value);
            };

            const onEnd = () => {
                isDragging = false;
                knob.classList.remove('dragging');
            };

            knob.addEventListener('mousedown', onStart);
            knob.addEventListener('touchstart', onStart);
            document.addEventListener('mousemove', onMove);
            document.addEventListener('touchmove', onMove);
            document.addEventListener('mouseup', onEnd);
            document.addEventListener('touchend', onEnd);
        });
    }

    updateKnobRotation(knob, value, min, max) {
        const percent = (value - min) / (max - min);
        const rotation = -135 + percent * 270; // -135 to +135 degrees
        knob.style.setProperty('--rotation', `${rotation}deg`);
    }

    applyKnobValue(param, value) {
        switch (param) {
            case 'freq':
                window.synth?.setFrequency(value);
                break;
            case 'filter':
                window.synth?.setFilterCutoff(value);
                break;
            case 'delay':
                window.mangleEngine?.setDelayMix(value);
                document.getElementById('fxDelay').value = value;
                break;
            case 'grain':
                window.mangleEngine?.setGrain(value, 50, 0);
                document.getElementById('fxGrain').value = value;
                break;
            case 'reso':
                window.synth?.setResonance?.(value);
                break;
            case 'drive':
                window.mangleEngine?.setDrive?.(value);
                break;
            case 'pan':
                window.audioEngine?.setPan?.(this.knobTarget, value / 100);
                break;
            case 'vol':
                window.audioEngine?.setChannelLevel?.(this.knobTarget, value / 100);
                break;
        }
    }

    // Synth
    setupSynth() {
        const toggle = document.getElementById('synthToggle');

        toggle.addEventListener('click', () => {
            const playing = window.synth.toggle();
            toggle.classList.toggle('active', playing);
            toggle.textContent = playing ? 'ON' : 'OFF';
        });

        // OSC1 Waveform buttons
        document.querySelectorAll('.wave-btns[data-osc="1"] .wave-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                window.synth.setOsc1Waveform(btn.dataset.wave);
                document.querySelectorAll('.wave-btns[data-osc="1"] .wave-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        // OSC2 Waveform buttons
        document.querySelectorAll('.wave-btns[data-osc="2"] .wave-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                window.synth.setOsc2Waveform(btn.dataset.wave);
                document.querySelectorAll('.wave-btns[data-osc="2"] .wave-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        // OSC2 Detune
        const osc2Detune = document.getElementById('osc2Detune');
        const osc2DetuneVal = document.getElementById('osc2DetuneVal');
        if (osc2Detune) {
            osc2Detune.addEventListener('input', () => {
                const val = parseInt(osc2Detune.value);
                window.synth.setOsc2Detune(val);
                if (osc2DetuneVal) osc2DetuneVal.textContent = val;
            });
        }

        // Pitch controls
        const pitchControls = [
            { id: 'synthOctave', valId: 'synthOctVal', setter: 'setOctave' },
            { id: 'synthFine', valId: 'synthFineVal', setter: 'setFineTune' },
            { id: 'synthGlide', valId: 'synthGlideVal', setter: 'setGlide' }
        ];
        pitchControls.forEach(({ id, valId, setter }) => {
            const slider = document.getElementById(id);
            const valDisplay = document.getElementById(valId);
            if (slider) {
                slider.addEventListener('input', () => {
                    const val = parseInt(slider.value);
                    window.synth[setter](val);
                    if (valDisplay) valDisplay.textContent = val;
                });
            }
        });

        // Filter type buttons
        document.querySelectorAll('.flt-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                window.synth.setFilterType(btn.dataset.flt);
                document.querySelectorAll('.flt-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        // Filter cutoff and resonance
        const filterCutoff = document.getElementById('filterCutoff');
        const filterCutVal = document.getElementById('filterCutVal');
        if (filterCutoff) {
            filterCutoff.addEventListener('input', () => {
                const val = parseInt(filterCutoff.value);
                window.synth.setFilterCutoff(val);
                if (filterCutVal) filterCutVal.textContent = val >= 1000 ? (val/1000).toFixed(1) + 'k' : val;
            });
        }

        const filterRes = document.getElementById('filterRes');
        const filterResVal = document.getElementById('filterResVal');
        if (filterRes) {
            filterRes.addEventListener('input', () => {
                const val = parseInt(filterRes.value);
                window.synth.setFilterResonance(val);
                if (filterResVal) filterResVal.textContent = val;
            });
        }

        // LFO controls
        const lfoRate = document.getElementById('lfoRate');
        const lfoRateVal = document.getElementById('lfoRateVal');
        if (lfoRate) {
            lfoRate.addEventListener('input', () => {
                const val = parseFloat(lfoRate.value);
                window.synth.setLFORate(val);
                if (lfoRateVal) lfoRateVal.textContent = val.toFixed(1);
            });
        }

        const lfoDepth = document.getElementById('lfoDepth');
        const lfoDepthVal = document.getElementById('lfoDepthVal');
        if (lfoDepth) {
            lfoDepth.addEventListener('input', () => {
                const val = parseInt(lfoDepth.value);
                window.synth.setLFODepth(val);
                if (lfoDepthVal) lfoDepthVal.textContent = val;
            });
        }

        // LFO target buttons
        document.querySelectorAll('.lfo-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                window.synth.setLFOTarget(btn.dataset.target);
                document.querySelectorAll('.lfo-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        // Unison controls
        const unisonVoices = document.getElementById('unisonVoices');
        const unisonVoicesVal = document.getElementById('unisonVoicesVal');
        if (unisonVoices) {
            unisonVoices.addEventListener('input', () => {
                const val = parseInt(unisonVoices.value);
                window.synth.setUnisonVoices(val);
                if (unisonVoicesVal) unisonVoicesVal.textContent = val;
            });
        }

        const unisonSpread = document.getElementById('unisonSpread');
        const unisonSpreadVal = document.getElementById('unisonSpreadVal');
        if (unisonSpread) {
            unisonSpread.addEventListener('input', () => {
                const val = parseInt(unisonSpread.value);
                window.synth.setUnisonSpread(val);
                if (unisonSpreadVal) unisonSpreadVal.textContent = val;
            });
        }

        // ADSR sliders
        const adsrControls = [
            { id: 'adsrAttack', valId: 'adsrAVal', setter: 'setAttack' },
            { id: 'adsrDecay', valId: 'adsrDVal', setter: 'setDecay' },
            { id: 'adsrSustain', valId: 'adsrSVal', setter: 'setSustain' },
            { id: 'adsrRelease', valId: 'adsrRVal', setter: 'setRelease' }
        ];

        adsrControls.forEach(({ id, valId, setter }) => {
            const slider = document.getElementById(id);
            const valDisplay = document.getElementById(valId);
            if (slider) {
                slider.addEventListener('input', () => {
                    const val = parseInt(slider.value);
                    window.synth[setter](val);
                    if (valDisplay) valDisplay.textContent = val;
                });
            }
        });

        // Preset buttons
        const presetSave = document.getElementById('synthPresetSave');
        const presetLoad = document.getElementById('synthPresetLoad');
        if (presetSave) {
            presetSave.addEventListener('click', () => {
                const name = prompt('Preset name:', 'Preset ' + (window.synth.getPresets().length + 1));
                if (name) {
                    window.synth.savePreset(name);
                    console.log('Saved preset:', name);
                }
            });
        }
        if (presetLoad) {
            presetLoad.addEventListener('click', () => {
                const presets = window.synth.getPresets();
                if (presets.length === 0) {
                    alert('No presets saved');
                    return;
                }
                const list = presets.map((p, i) => `${i + 1}. ${p.name}`).join('\n');
                const idx = prompt('Select preset:\n' + list, '1');
                if (idx) {
                    window.synth.loadPreset(parseInt(idx) - 1);
                    this.updateSynthUI();
                }
            });
        }

        // Oscilloscope
        this.setupOscilloscope();
    }

    // Oscilloscope visualization
    setupOscilloscope() {
        const canvas = document.getElementById('scopeCanvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        const drawScope = () => {
            const analyser = window.synth?.getAnalyser();
            if (!analyser) {
                requestAnimationFrame(drawScope);
                return;
            }

            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            analyser.getByteTimeDomainData(dataArray);

            ctx.fillStyle = '#1a1a2e';
            ctx.fillRect(0, 0, width, height);

            ctx.lineWidth = 1.5;
            ctx.strokeStyle = '#00ff88';
            ctx.beginPath();

            const sliceWidth = width / bufferLength;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0;
                const y = v * height / 2;

                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }

                x += sliceWidth;
            }

            ctx.lineTo(width, height / 2);
            ctx.stroke();

            requestAnimationFrame(drawScope);
        };

        drawScope();
    }

    // Update synth UI from state
    updateSynthUI() {
        const state = window.synth?.getState();
        if (!state) return;

        // Update OSC1 waveform buttons
        document.querySelectorAll('.wave-btns[data-osc="1"] .wave-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.wave === state.osc1.waveform);
        });

        // Update OSC2 waveform buttons
        document.querySelectorAll('.wave-btns[data-osc="2"] .wave-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.wave === state.osc2.waveform);
        });

        // Update sliders and values
        const updateSlider = (id, valId, value, formatter = v => v) => {
            const slider = document.getElementById(id);
            const valEl = document.getElementById(valId);
            if (slider) slider.value = value;
            if (valEl) valEl.textContent = formatter(value);
        };

        updateSlider('osc2Detune', 'osc2DetuneVal', state.osc2.detune);
        updateSlider('synthOctave', 'synthOctVal', state.pitch.octave);
        updateSlider('synthFine', 'synthFineVal', state.pitch.fine);
        updateSlider('synthGlide', 'synthGlideVal', state.pitch.glide);
        updateSlider('filterCutoff', 'filterCutVal', state.filter.cutoff, v => v >= 1000 ? (v/1000).toFixed(1) + 'k' : v);
        updateSlider('filterRes', 'filterResVal', state.filter.resonance);
        updateSlider('lfoRate', 'lfoRateVal', state.lfo.rate, v => v.toFixed(1));
        updateSlider('lfoDepth', 'lfoDepthVal', state.lfo.depth);
        updateSlider('unisonVoices', 'unisonVoicesVal', state.unison.voices);
        updateSlider('unisonSpread', 'unisonSpreadVal', state.unison.spread);
        updateSlider('adsrAttack', 'adsrAVal', state.adsr.attack);
        updateSlider('adsrDecay', 'adsrDVal', state.adsr.decay);
        updateSlider('adsrSustain', 'adsrSVal', state.adsr.sustain);
        updateSlider('adsrRelease', 'adsrRVal', state.adsr.release);

        // Update filter type buttons
        document.querySelectorAll('.flt-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.flt === state.filter.type);
        });

        // Update LFO target buttons
        document.querySelectorAll('.lfo-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.target === state.lfo.target);
        });
    }

    // Synth Matrix routing
    setupSynthMatrix() {
        document.querySelectorAll('.matrix-cell').forEach(cell => {
            cell.addEventListener('click', () => {
                cell.classList.toggle('active');
                // TODO: Implement actual routing changes in synth engine
                console.log(`Matrix: ${cell.dataset.src} -> ${cell.dataset.dst}: ${cell.classList.contains('active')}`);
            });
        });
    }

    // Scenes with crossfader
    setupScenes() {
        const sceneBtns = document.querySelectorAll('.scenes-panel .scene-btn');
        const saveBtn = document.getElementById('saveScene');
        const crossfader = document.getElementById('sceneCrossfader');
        const xfadeLeft = document.getElementById('xfadeLeft');
        const xfadeRight = document.getElementById('xfadeRight');

        // Scene selection with shift+click for morph
        sceneBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(btn.dataset.scene);

                if (e.shiftKey && window.sceneManager.hasScene(idx)) {
                    // Shift+click: smooth morph to target scene over 2 seconds
                    this.xfadeSceneB = idx;
                    xfadeRight.textContent = ['A', 'B', 'C', 'D'][idx];
                    btn.classList.add('morphing');
                    const morphDuration = 2000;
                    const morphStart = performance.now();
                    const startVal = crossfader ? parseInt(crossfader.value) / 100 : 0;
                    const animate = (now) => {
                        const elapsed = now - morphStart;
                        const t = Math.min(1, elapsed / morphDuration);
                        const morphVal = startVal + (1 - startVal) * t;
                        this.morphScenes(morphVal);
                        if (crossfader) crossfader.value = Math.round(morphVal * 100);
                        if (t < 1) {
                            requestAnimationFrame(animate);
                        } else {
                            btn.classList.remove('morphing');
                            // After morph complete, recall fully
                            window.sceneManager.recallScene(idx);
                            this.updateOctSteps();
                            if (crossfader) crossfader.value = 0;
                        }
                    };
                    requestAnimationFrame(animate);
                } else if (btn.classList.contains('active')) {
                    // Already active: assign to right side of crossfader
                    this.xfadeSceneB = idx;
                    xfadeRight.textContent = ['A', 'B', 'C', 'D'][idx];
                } else {
                    // Normal click: instant recall
                    if (window.sceneManager.hasScene(idx)) {
                        window.sceneManager.recallScene(idx);
                        this.updateOctSteps();
                    }

                    // Update active state
                    sceneBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');

                    // Assign to left side of crossfader
                    this.xfadeSceneA = idx;
                    xfadeLeft.textContent = ['A', 'B', 'C', 'D'][idx];
                }
            });
        });

        // Save button
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                const activeBtn = document.querySelector('.scenes-panel .scene-btn.active');
                if (activeBtn) {
                    const idx = parseInt(activeBtn.dataset.scene);
                    window.sceneManager.saveScene(idx);
                    activeBtn.classList.add('has-data');
                    console.log('Saved scene', ['A', 'B', 'C', 'D'][idx]);
                    this.publishAnalysisState();
                }
            });
        }

        // Crossfader - real-time scene morphing
        if (crossfader) {
            crossfader.addEventListener('input', () => {
                const value = parseInt(crossfader.value);
                this.morphScenes(value / 100);
            });
        }
    }

    // Real-time scene morphing based on crossfader position
    morphScenes(t) {
        // t = 0: fully scene A, t = 1: fully scene B
        if (!window.sceneManager.hasScene(this.xfadeSceneA) ||
            !window.sceneManager.hasScene(this.xfadeSceneB)) {
            return;
        }

        const sceneA = window.sceneManager.getScene(this.xfadeSceneA);
        const sceneB = window.sceneManager.getScene(this.xfadeSceneB);

        // Get current scope
        const scope = document.getElementById('sceneScope')?.value || 'all';

        // Interpolate based on scope
        const lerp = (a, b, t) => a + (b - a) * t;

        if (scope === 'all' || scope === 'mixer') {
            // Morph mixer levels
            if (sceneA.mixer && sceneB.mixer) {
                const channels = ['mic', 'samples', 'synth', 'radio'];
                channels.forEach(ch => {
                    const levelA = sceneA.mixer[ch]?.level ?? 0.8;
                    const levelB = sceneB.mixer[ch]?.level ?? 0.8;
                    const level = lerp(levelA, levelB, t);

                    const fader = document.getElementById(`fader${ch.charAt(0).toUpperCase() + ch.slice(1)}`);
                    if (fader) fader.value = level * 100;
                    window.audioEngine?.setChannelLevel(ch, level);
                });

                // Master
                const masterA = sceneA.mixer.master ?? 0.9;
                const masterB = sceneB.mixer.master ?? 0.9;
                const master = lerp(masterA, masterB, t);
                const masterFader = document.getElementById('faderMaster');
                if (masterFader) masterFader.value = master * 100;
                window.audioEngine?.setMasterLevel(master);
            }
        }

        if (scope === 'all' || scope === 'fx') {
            // Morph FX parameters
            if (sceneA.fx && sceneB.fx && window.mangleEngine) {
                // Delay mix
                const delayA = sceneA.fx.delay?.mix ?? 0;
                const delayB = sceneB.fx.delay?.mix ?? 0;
                const delayMix = lerp(delayA, delayB, t);
                window.mangleEngine.setDelayMix(delayMix);

                const delaySlider = document.getElementById('fxDelay');
                if (delaySlider) delaySlider.value = delayMix;
            }
        }

        if (scope === 'all') {
            // Morph tempo
            const tempoA = sceneA.tempo ?? 120;
            const tempoB = sceneB.tempo ?? 120;
            const tempo = Math.round(lerp(tempoA, tempoB, t));
            window.sequencer?.setTempo(tempo);

            const tempoSlider = document.getElementById('tempoSlider');
            const tempoVal = document.getElementById('tempoVal');
            if (tempoSlider) tempoSlider.value = tempo;
            if (tempoVal) tempoVal.textContent = tempo;
        }
    }

    // FX
    setupFX() {
        const delay = document.getElementById('fxDelay');
        const crush = document.getElementById('fxCrush');
        const glitch = document.getElementById('fxGlitch');
        const grain = document.getElementById('fxGrain');
        const saveFxBtn = document.getElementById('saveFx');

        delay.addEventListener('input', () => {
            window.mangleEngine.setDelayMix(parseInt(delay.value));
            // Sync knob
            const knob = document.getElementById('knobDelay');
            if (knob) {
                knob.dataset.value = delay.value;
                this.updateKnobRotation(knob, parseInt(delay.value), 0, 100);
            }
        });

        crush.addEventListener('input', () => {
            window.mangleEngine.setBitDepth(parseInt(crush.value));
        });

        glitch.addEventListener('input', () => {
            window.mangleEngine.setGlitch(parseInt(glitch.value), 100, 'stutter');
        });

        grain.addEventListener('input', () => {
            window.mangleEngine.setGrain(parseInt(grain.value), 50, 0);
            // Sync knob
            const knob = document.getElementById('knobGrain');
            if (knob) {
                knob.dataset.value = grain.value;
                this.updateKnobRotation(knob, parseInt(grain.value), 0, 100);
            }
        });

        // FX presets - now using buttons instead of dropdown
        const presetContainer = document.getElementById('fxPresetBtns');
        if (presetContainer) {
            presetContainer.addEventListener('click', (e) => {
                const btn = e.target.closest('.fx-preset-btn');
                if (!btn) return;

                // Update active state
                presetContainer.querySelectorAll('.fx-preset-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const idx = parseInt(btn.dataset.preset);
                if (idx > 0 && this.settings.fxPresets[idx - 1]) {
                    this.loadFxPreset(this.settings.fxPresets[idx - 1]);
                }
            });
            this.updateFxPresetList();
        }

        if (saveFxBtn) {
            saveFxBtn.addEventListener('click', () => {
                this.saveFxPreset();
            });
        }

        // Punch-in FX buttons
        this.setupPunchFX();
    }

    // Save current FX settings as preset
    saveFxPreset() {
        const preset = {
            delay: parseInt(document.getElementById('fxDelay')?.value || 0),
            grain: parseInt(document.getElementById('fxGrain')?.value || 0),
            glitch: parseInt(document.getElementById('fxGlitch')?.value || 0),
            crush: parseInt(document.getElementById('fxCrush')?.value || 16),
            name: `FX${this.settings.fxPresets.length + 1}`
        };
        this.settings.fxPresets.push(preset);
        this.saveSettings();
        this.updateFxPresetList();
        console.log('Saved FX preset:', preset.name);
    }

    // Load FX preset
    loadFxPreset(preset) {
        if (!preset) return;

        const delay = document.getElementById('fxDelay');
        const grain = document.getElementById('fxGrain');
        const glitch = document.getElementById('fxGlitch');
        const crush = document.getElementById('fxCrush');

        if (delay) { delay.value = preset.delay; window.mangleEngine?.setDelayMix(preset.delay); }
        if (grain) { grain.value = preset.grain; window.mangleEngine?.setGrain(preset.grain, 50, 0); }
        if (glitch) { glitch.value = preset.glitch; window.mangleEngine?.setGlitch(preset.glitch, 100, 'stutter'); }
        if (crush) { crush.value = preset.crush; window.mangleEngine?.setBitDepth(preset.crush); }

        console.log('Loaded FX preset:', preset.name);
    }

    // Update FX preset buttons
    updateFxPresetList() {
        const container = document.getElementById('fxPresetBtns');
        if (!container) return;

        container.innerHTML = '<button class="fx-preset-btn active" data-preset="0">--</button>';
        this.settings.fxPresets.forEach((preset, idx) => {
            const btn = document.createElement('button');
            btn.className = 'fx-preset-btn';
            btn.dataset.preset = idx + 1;
            btn.textContent = preset.name;
            container.appendChild(btn);
        });
    }

    // Punch-in FX (hold for temporary effect)
    setupPunchFX() {
        // Store original values to restore after punch-out
        this.punchFXStates = {};

        document.querySelectorAll('.punch-btn').forEach(btn => {
            const fxType = btn.dataset.fx;

            const punchIn = () => {
                btn.classList.add('active');
                this.applyPunchFX(fxType, true);
            };

            const punchOut = () => {
                btn.classList.remove('active');
                this.applyPunchFX(fxType, false);
            };

            // Mouse events
            btn.addEventListener('mousedown', punchIn);
            btn.addEventListener('mouseup', punchOut);
            btn.addEventListener('mouseleave', punchOut);

            // Touch events
            btn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                punchIn();
            });
            btn.addEventListener('touchend', punchOut);
        });
    }

    applyPunchFX(fxType, active) {
        if (!window.mangleEngine) return;

        if (active) {
            // Store current state before applying punch effect
            switch (fxType) {
                case 'stutter':
                    // Apply heavy glitch/stutter effect
                    this.punchFXStates.glitch = document.getElementById('fxGlitch')?.value || 0;
                    window.mangleEngine.setGlitch(100, 50, 'stutter');
                    break;

                case 'reverse':
                    // Apply reverse effect
                    this.punchFXStates.reverse = false;
                    window.mangleEngine.setReverse?.(true);
                    break;

                case 'filter':
                    // Apply filter sweep (low pass filter down)
                    this.punchFXStates.filter = window.synth?.getFilterCutoff?.() || 8000;
                    window.synth?.setFilterCutoff(200);
                    window.mangleEngine.setFilterSweep?.(true, 200, 8000);
                    break;

                case 'tape':
                    // Apply tape stop effect (slow down)
                    this.punchFXStates.tape = false;
                    window.mangleEngine.setTapeStop?.(true);
                    break;
            }
            console.log(`Punch-in: ${fxType}`);
        } else {
            // Restore original state
            switch (fxType) {
                case 'stutter':
                    window.mangleEngine.setGlitch(this.punchFXStates.glitch || 0, 100, 'stutter');
                    break;

                case 'reverse':
                    window.mangleEngine.setReverse?.(false);
                    break;

                case 'filter':
                    window.synth?.setFilterCutoff(this.punchFXStates.filter || 8000);
                    window.mangleEngine.setFilterSweep?.(false);
                    break;

                case 'tape':
                    window.mangleEngine.setTapeStop?.(false);
                    break;
            }
            console.log(`Punch-out: ${fxType}`);
        }
    }
}

mixIntoApp(AppSound);
