// Oh My Ondas - App: Sequencer, pattern slots, pads, P-lock editor, dub mode
// Methods of App (js/app.js), split out by area; loaded right after app.js.

class AppSequencer {
    // Octatrack-style sequencer
    setupOctaTrackSequencer() {

        // Register callback for pattern changes
        window.sequencer.onPatternChange = () => {
            this.rebuildSequencerUI();
            this.updateOctSteps();
            this.updatePatternButtons();
        };

        this.rebuildSequencerUI();

        // Source buttons (instead of dropdown)
        const srcBtns = document.querySelectorAll('.src-btn');
        srcBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                srcBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                window.sequencer.setTrackSource(this.selectedTrack, btn.dataset.src);
                this.updateTrackSourceDisplay();
            });
        });

        // Random button
        document.getElementById('seqRandom').addEventListener('click', () => {
            window.sequencer.saveHistory();
            window.sequencer.randomizeTrack(this.selectedTrack, 0.3);
            this.updateOctSteps();
        });

        // Clear button
        document.getElementById('seqClear').addEventListener('click', () => {
            window.sequencer.saveHistory();
            window.sequencer.clearTrack(this.selectedTrack);
            this.updateOctSteps();
        });

        // Euclidean button - quick apply
        document.getElementById('eucGen').addEventListener('click', () => {
            window.sequencer.saveHistory();
            const hits = Math.floor(Math.random() * 6) + 2; // 2-7 hits
            const numSteps = window.sequencer.getPatternLength();
            window.sequencer.applyEuclidean(this.selectedTrack, hits, numSteps, 0);
            this.updateOctSteps();
        });

        // Pattern slot buttons (A-H)
        this.setupPatternSlots();

        // Copy/Paste/Undo/Redo buttons
        this.setupSeqTools();

        // Pattern length selector
        this.setupPatternLength();

        // Swing control
        this.setupSwing();

        // Step callback for playback visualization
        window.sequencer.onStep((step) => {
            const patternLength = window.sequencer.getPatternLength();
            document.querySelectorAll('.oct-step').forEach(el => {
                const stepIdx = parseInt(el.dataset.step);
                el.classList.toggle('current', stepIdx === step && stepIdx < patternLength);
            });
        });

        // Initial update
        this.updateOctSteps();
        this.updatePatternButtons();
    }

    // Build sequencer UI tracks
    rebuildSequencerUI() {
        const octTracks = document.getElementById('octTracks');
        const numTracks = this.settings.seqTracks;
        const numSteps = window.sequencer.getPatternLength();

        // Generate track strips
        octTracks.innerHTML = '';
        for (let t = 0; t < numTracks; t++) {
            const track = document.createElement('div');
            track.className = 'oct-track' + (t === this.selectedTrack ? ' selected' : '');
            if (window.sequencer.isMuted(t)) track.classList.add('muted');
            track.dataset.track = t;

            const num = document.createElement('div');
            num.className = 'oct-track-num';
            num.textContent = t + 1;
            track.appendChild(num);

            // Mute button
            const muteBtn = document.createElement('button');
            muteBtn.className = 'oct-track-mute' + (window.sequencer.isMuted(t) ? ' active' : '');
            muteBtn.textContent = 'M';
            muteBtn.title = 'Mute track';
            muteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const muted = window.sequencer.toggleMute(t);
                muteBtn.classList.toggle('active', muted);
                track.classList.toggle('muted', muted);
            });
            track.appendChild(muteBtn);

            // Solo button
            const soloBtn = document.createElement('button');
            soloBtn.className = 'oct-track-solo' + (window.sequencer.isSoloed(t) ? ' active' : '');
            soloBtn.textContent = 'S';
            soloBtn.title = 'Solo track';
            soloBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const soloed = window.sequencer.toggleSolo(t);
                soloBtn.classList.toggle('active', soloed);
            });
            track.appendChild(soloBtn);

            const src = document.createElement('div');
            src.className = 'oct-track-src';
            src.textContent = this.getSourceAbbrev(window.sequencer.getTrackSource(t));
            track.appendChild(src);

            const steps = document.createElement('div');
            steps.className = 'oct-steps';
            for (let s = 0; s < numSteps; s++) {
                const step = document.createElement('div');
                step.className = 'oct-step' + (s % 4 === 0 ? ' beat' : '');
                step.dataset.track = t;
                step.dataset.step = s;

                // Click to toggle step, SHIFT+click to edit P-Locks
                step.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (this.shiftHeld || e.shiftKey) {
                        // Open P-Lock editor for this step
                        this.openPLockEditor(t, s);
                    } else {
                        window.sequencer.saveHistory();
                        const active = window.sequencer.toggleStep(t, s);
                        step.classList.toggle('active', active);
                    }
                });

                // Long press for P-Lock editor (mobile)
                let longPressTimer;
                step.addEventListener('touchstart', (_e) => {
                    longPressTimer = setTimeout(() => {
                        this.openPLockEditor(t, s);
                    }, 500);
                });
                step.addEventListener('touchend', () => clearTimeout(longPressTimer));
                step.addEventListener('touchmove', () => clearTimeout(longPressTimer));

                steps.appendChild(step);
            }
            track.appendChild(steps);

            // Click track to select
            track.addEventListener('click', () => {
                this.selectTrack(t);
            });

            octTracks.appendChild(track);
        }
    }

    // Setup pattern slot buttons (A-H)
    setupPatternSlots() {
        const patternBtns = document.querySelectorAll('.pattern-btn');
        patternBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const slotIdx = parseInt(btn.dataset.pattern);
                window.sequencer.selectPattern(slotIdx);
                patternBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.rebuildSequencerUI();
                this.updateOctSteps();
            });
        });
    }

    // Update pattern button states (has-data indicator)
    updatePatternButtons() {
        const patternBtns = document.querySelectorAll('.pattern-btn');
        patternBtns.forEach(btn => {
            const slotIdx = parseInt(btn.dataset.pattern);
            btn.classList.toggle('has-data', window.sequencer.patternHasData(slotIdx));
            btn.classList.toggle('active', slotIdx === window.sequencer.getCurrentPatternSlot());
        });
    }

    // Setup copy/paste/undo/redo buttons
    setupSeqTools() {
        const copyBtn = document.getElementById('seqCopy');
        const pasteBtn = document.getElementById('seqPaste');
        const undoBtn = document.getElementById('seqUndo');
        const redoBtn = document.getElementById('seqRedo');

        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                window.sequencer.copyTrack(this.selectedTrack);
            });
        }

        if (pasteBtn) {
            pasteBtn.addEventListener('click', () => {
                window.sequencer.pasteTrack(this.selectedTrack);
                this.updateOctSteps();
            });
        }

        if (undoBtn) {
            undoBtn.addEventListener('click', () => {
                window.sequencer.undo();
            });
        }

        if (redoBtn) {
            redoBtn.addEventListener('click', () => {
                window.sequencer.redo();
            });
        }

        // MIDI Export
        const midiBtn = document.getElementById('midiExport');
        if (midiBtn) {
            midiBtn.addEventListener('click', () => {
                if (window.midiExport) {
                    window.midiExport.download();
                }
            });
        }
    }

    // Setup pattern length selector
    setupPatternLength() {
        const lengthSelect = document.getElementById('patternLength');
        if (lengthSelect) {
            lengthSelect.value = window.sequencer.getPatternLength();
            lengthSelect.addEventListener('change', () => {
                window.sequencer.setPatternLength(parseInt(lengthSelect.value));
            });
        }
    }

    // Setup swing control
    setupSwing() {
        const swingSlider = document.getElementById('swingAmount');
        const swingVal = document.getElementById('swingVal');
        if (swingSlider) {
            swingSlider.addEventListener('input', () => {
                const val = parseInt(swingSlider.value);
                window.sequencer.setSwing(val);
                if (swingVal) swingVal.textContent = val;
            });
        }
    }

    getSourceAbbrev(source) {
        const abbrevs = { sampler: 'SMP', synth: 'SYN', radio: 'RAD', mic: 'MIC' };
        return abbrevs[source] || 'SMP';
    }

    selectTrack(trackIndex) {
        this.selectedTrack = trackIndex;
        window.sequencer.setSelectedTrack(trackIndex);

        // Update UI
        document.querySelectorAll('.oct-track').forEach((el, i) => {
            el.classList.toggle('selected', i === trackIndex);
        });

        // Update source buttons
        const source = window.sequencer.getTrackSource(trackIndex);
        document.querySelectorAll('.src-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.src === source);
        });
    }

    updateOctSteps() {
        const pattern = window.sequencer.getPattern();
        document.querySelectorAll('.oct-step').forEach(el => {
            const t = parseInt(el.dataset.track);
            const s = parseInt(el.dataset.step);
            const step = pattern[t]?.[s];

            el.classList.toggle('active', step?.active || false);

            // Show P-Lock indicator
            const hasPLocks = window.sequencer.hasPLocks(t, s);
            el.classList.toggle('has-plock', hasPLocks);

            // Show trig condition indicator
            const cond = step?.trigCondition;
            el.classList.toggle('has-condition', cond && cond.type !== 'always');
        });
    }

    updateTrackSourceDisplay() {
        document.querySelectorAll('.oct-track').forEach((track, idx) => {
            const srcEl = track.querySelector('.oct-track-src');
            if (srcEl) {
                srcEl.textContent = this.getSourceAbbrev(window.sequencer.getTrackSource(idx));
            }
        });
    }

    // Pads
    setupPads() {
        document.querySelectorAll('.pad').forEach(pad => {
            const index = parseInt(pad.dataset.pad);

            const trigger = () => {
                pad.classList.add('active');
                this.flashPad(index);
                window.sampler.trigger(index);

                // Record in dub mode if sequencer is playing
                if (window.sequencer.getDubMode() !== 'off' && window.sequencer.isPlaying()) {
                    window.sequencer.recordDubTrigger(index);
                    this.updateOctSteps();
                }
            };

            const release = () => {
                pad.classList.remove('active');
            };

            pad.addEventListener('mousedown', trigger);
            pad.addEventListener('mouseup', release);
            pad.addEventListener('mouseleave', release);
            pad.addEventListener('touchstart', (e) => { e.preventDefault(); trigger(); });
            pad.addEventListener('touchend', release);
        });

        // Kit selector buttons
        const kitBtns = document.querySelectorAll('.kit-btn');
        kitBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                kitBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                window.sampler.setBank(btn.dataset.kit);
                this.settings.selectedKit = btn.dataset.kit;
                this.saveSettings();
            });
        });

        // Register callback for sequencer-triggered pads
        if (window.sequencer) {
            window.sequencer.onPadTrigger = (padIndex) => {
                this.flashPad(padIndex);
            };
        }
    }

    // Flash pad animation
    flashPad(index) {
        const pad = document.querySelector(`.pad[data-pad="${index}"]`);
        if (pad) {
            pad.classList.remove('flash');
            // Force reflow to restart animation
            void pad.offsetWidth;
            pad.classList.add('flash');
            setTimeout(() => pad.classList.remove('flash'), 150);
        }
    }

    // P-Lock Editor
    setupPLockEditor() {
        const closeBtn = document.getElementById('plockClose');

        // Close button
        closeBtn.addEventListener('click', () => this.closePLockEditor());

        // P-Lock parameter sliders
        const params = ['Pitch', 'Slice', 'Filter', 'Decay'];
        params.forEach(param => {
            const slider = document.getElementById(`plock${param}`);
            const display = document.getElementById(`plock${param}Val`);

            if (slider) {
                slider.addEventListener('input', () => {
                    display.textContent = slider.value;
                    if (this.plockEditing) {
                        window.sequencer.setPLock(
                            this.plockTrack,
                            this.plockStep,
                            param.toLowerCase(),
                            parseInt(slider.value)
                        );
                        this.updateOctSteps();
                    }
                });
            }
        });

        // Trig condition controls - now using buttons instead of dropdown
        const trigBtns = document.querySelectorAll('#trigCondBtns .trig-btn');
        const trigValue = document.getElementById('trigCondValue');

        trigBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                // Update active state
                trigBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                if (this.plockEditing) {
                    window.sequencer.setTrigCondition(
                        this.plockTrack,
                        this.plockStep,
                        btn.dataset.cond,
                        parseInt(trigValue.value)
                    );
                    this.updateOctSteps();
                }
            });
        });

        trigValue.addEventListener('change', () => {
            if (this.plockEditing) {
                const activeBtn = document.querySelector('#trigCondBtns .trig-btn.active');
                const condType = activeBtn ? activeBtn.dataset.cond : 'always';
                window.sequencer.setTrigCondition(
                    this.plockTrack,
                    this.plockStep,
                    condType,
                    parseInt(trigValue.value)
                );
            }
        });
    }

    openPLockEditor(trackIndex, stepIndex) {
        const editor = document.getElementById('plockEditor');
        this.plockEditing = true;
        this.plockTrack = trackIndex;
        this.plockStep = stepIndex;

        // Update step number display
        document.getElementById('plockStepNum').textContent = `${trackIndex + 1}.${stepIndex + 1}`;

        // Load current P-Lock values
        const pLocks = ['pitch', 'slice', 'filter', 'decay'];
        pLocks.forEach(param => {
            const value = window.sequencer.getPLock(trackIndex, stepIndex, param);
            const slider = document.getElementById(`plock${param.charAt(0).toUpperCase() + param.slice(1)}`);
            const display = document.getElementById(`plock${param.charAt(0).toUpperCase() + param.slice(1)}Val`);

            if (slider) {
                // Use default values if no P-Lock set
                const defaultVal = param === 'pitch' ? 0 : (param === 'slice' ? 0 : 50);
                slider.value = value !== null ? value : defaultVal;
                display.textContent = slider.value;
            }
        });

        // Load trig condition - update buttons instead of dropdown
        const cond = window.sequencer.getTrigCondition(trackIndex, stepIndex);
        const trigBtns = document.querySelectorAll('#trigCondBtns .trig-btn');
        trigBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.cond === cond.type);
        });
        document.getElementById('trigCondValue').value = cond.value;

        // Show editor
        editor.classList.remove('hidden');
    }

    closePLockEditor() {
        const editor = document.getElementById('plockEditor');
        this.plockEditing = false;
        editor.classList.add('hidden');
    }

    // Dub Mode
    setupDubMode() {
        const dubToggle = document.getElementById('dubToggle');
        const fillBtn = document.getElementById('fillBtn');

        // Dub toggle: cycles through off -> dub -> overdub -> off
        dubToggle.addEventListener('click', () => {
            const currentMode = window.sequencer.getDubMode();
            let newMode;

            if (currentMode === 'off') {
                newMode = 'dub';
                dubToggle.classList.add('dub-active');
                dubToggle.classList.remove('overdub-active');
                dubToggle.textContent = 'DUB';
            } else if (currentMode === 'dub') {
                newMode = 'overdub';
                dubToggle.classList.remove('dub-active');
                dubToggle.classList.add('overdub-active');
                dubToggle.textContent = 'OVR';
            } else {
                newMode = 'off';
                dubToggle.classList.remove('dub-active', 'overdub-active');
                dubToggle.textContent = 'DUB';
            }

            window.sequencer.setDubMode(newMode);
        });

        // Fill button: hold to activate fill mode
        fillBtn.addEventListener('mousedown', () => {
            window.sequencer.setFillMode(true);
            fillBtn.classList.add('active');
        });

        fillBtn.addEventListener('mouseup', () => {
            window.sequencer.setFillMode(false);
            fillBtn.classList.remove('active');
        });

        fillBtn.addEventListener('mouseleave', () => {
            window.sequencer.setFillMode(false);
            fillBtn.classList.remove('active');
        });

        // Touch support for Fill
        fillBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            window.sequencer.setFillMode(true);
            fillBtn.classList.add('active');
        });

        fillBtn.addEventListener('touchend', () => {
            window.sequencer.setFillMode(false);
            fillBtn.classList.remove('active');
        });
    }
}

mixIntoApp(AppSequencer);
