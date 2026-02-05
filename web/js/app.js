// Oh My Ondas v2.5.2 - Main Application Controller

// Security: HTML escape utility to prevent XSS
function escapeHtml(str) {
    if (typeof str !== 'string') return str;
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

class App {
    constructor() {
        this.initialized = false;
        this.meterInterval = null;
        this.timeInterval = null;
        this.selectedTrack = 0;
        this.xfadeSceneA = 0;
        this.xfadeSceneB = 1;
        this.settings = this.loadSettings();

        // P-Lock editor state
        this.plockEditing = false;
        this.plockTrack = 0;
        this.plockStep = 0;

        // Shift key state for P-Lock access
        this.shiftHeld = false;

        // Tap tempo state
        this.tapTimes = [];
        this.lastTapTime = 0;

        // Embedded panel state
        this._activePanel = 'seq-panel';
        this._currentMode = 'picture';
        this._encoderContext = null;
    }

    loadSettings() {
        const defaults = {
            theme: 'mariani',
            recFormat: 'webm',
            recAutoSave: 'off',
            recGpsEmbed: true,
            seqTracks: 8,
            seqSteps: 16,
            selectedKit: 'kit1',
            synthPreset: 'default',
            columnWidths: null,  // Will store [mixer, seq, mid, right] in px
            fxPresets: []
        };
        try {
            const saved = localStorage.getItem('ohmyondas_settings');
            return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
        } catch (e) {
            return defaults;
        }
    }

    saveSettings() {
        try {
            localStorage.setItem('ohmyondas_settings', JSON.stringify(this.settings));
        } catch (e) {
            console.warn('Could not save settings:', e);
        }
    }

    async init() {
        // Initialize audio engine first
        const audioOk = await window.audioEngine.init();
        if (!audioOk) {
            alert('Failed to initialize audio. Please check permissions.');
            return;
        }

        // Initialize all modules
        await Promise.all([
            window.gpsTracker.init(),
            window.micInput.init(),
            window.sampler.init(),
            window.synth.init(),
            window.radioPlayer.init(),
            window.sessionRecorder.init(),
            window.sequencer.init(),
            window.mangleEngine.init(),
            window.sceneManager.init(),
            window.arrangement.init(),
            window.aiComposer.init()
        ]);

        // Setup UI
        this.setupTransport();
        this.setupTempo();
        this.setupMixer();
        this.setupEQ();
        this.setupOctaTrackSequencer();
        this.setupPLockEditor();
        this.setupDubMode();
        this.setupPads();
        this.setupKnobs();
        this.setupSynth();
        this.setupSynthMatrix();
        this.setupScenes();
        this.setupFX();
        this.setupAI();
        this.setupRadio();
        this.setupMicCapture();
        this.setupRecordings();
        this.setupAdminModal();
        this.setupKeyboardShortcuts();
        this.setupResizableColumns();
        this.setupVUMeters();
        this.setupTapTempo();
        this.setupHelpModal();
        this.setupPostMessageBridge();
        this.setupPanelTabs();

        // GPS display and map background
        window.gpsTracker.addListener(() => this.updateGPS());
        this.updateGPS();

        // Recording handler
        window.sessionRecorder.onRecordingComplete = (recording) => {
            console.log('Recording saved');
            this.updateRecordingsList();
            this.updateRecCount();
        };

        // Apply saved settings
        this.applySettings();

        // Setup demo mode if active
        this.setupDemoMode();

        this.initialized = true;
        console.log('App v2.5.2 initialized');
    }

    // Demo mode configuration
    setupDemoMode() {
        const mode = this.getDemoMode();
        if (!mode) return;

        // Add demo-mode class to body for CSS targeting
        document.body.classList.add('demo-mode', `demo-${mode}`);

        // Show panel tabs bar (like embedded mode)
        const panelTabs = document.getElementById('panelTabs');
        if (panelTabs) panelTabs.style.display = 'flex';

        // Demo mode configurations
        const demoConfig = {
            // Lavinia: AI-Powered Localization - Capture local audio identity
            capture: {
                title: 'Capture Local Audio Identity',
                subtitle: 'GPS → Local Radio → Soundscape Analysis',
                panels: ['radio-panel', 'journey-panel', 'mixer-panel'],
                startPanel: 'radio-panel',
                autoActions: ['gps', 'radio-scan']
            },
            // Lavinia: AI-Powered Localization - Brand-consistent output
            brand: {
                title: 'Brand-Consistent Output',
                subtitle: 'Same pattern template, locally-sourced audio',
                panels: ['seq-panel', 'pads-panel', 'scenes-panel'],
                startPanel: 'seq-panel',
                autoActions: ['load-brand-pattern']
            },
            // Multisensorial: Immersive capture experience
            sense: {
                title: 'Immersive Sensory Capture',
                subtitle: 'Real-time soundscape analysis & visualization',
                panels: ['mixer-panel', 'eq-panel', 'ai-panel'],
                startPanel: 'mixer-panel',
                autoActions: ['mic', 'analyze']
            },
            // Multisensorial: Create & take home
            create: {
                title: 'Create Your Sonic Souvenir',
                subtitle: 'Sequence, sculpt, and export your creation',
                panels: ['seq-panel', 'fx-panel', 'scenes-panel'],
                startPanel: 'seq-panel',
                autoActions: []
            }
        };

        const config = demoConfig[mode];
        if (!config) {
            console.warn(`Unknown demo mode: ${mode}`);
            return;
        }

        // Show demo banner
        this.showDemoBanner(config.title, config.subtitle);

        // Switch to start panel
        this.switchToPanel(config.startPanel);

        // Execute auto-actions
        config.autoActions.forEach(action => {
            this.executeDemoAction(action);
        });

        console.log(`Demo mode "${mode}" activated: ${config.title}`);
    }

    showDemoBanner(title, subtitle) {
        const banner = document.createElement('div');
        banner.className = 'demo-banner';
        banner.innerHTML = `
            <div class="demo-banner-content">
                <strong>${title}</strong>
                <span>${subtitle}</span>
            </div>
            <button class="demo-banner-close" onclick="this.parentElement.remove()">×</button>
        `;
        document.body.insertBefore(banner, document.body.firstChild);
    }

    executeDemoAction(action) {
        switch (action) {
            case 'gps':
                // GPS is auto-initialized, just ensure it's tracking
                window.gpsTracker?.startTracking?.();
                break;
            case 'radio-scan':
                // Trigger local radio search after GPS fix
                setTimeout(() => {
                    const scanBtn = document.querySelector('.radio-panel .btn-scan, #btnRadioScan');
                    if (scanBtn) scanBtn.click();
                }, 2000);
                break;
            case 'mic':
                // Prompt mic access
                window.micInput?.requestAccess?.();
                break;
            case 'analyze':
                // Start soundscape analysis
                window.aiComposer?.startAnalysis?.();
                break;
            case 'load-brand-pattern':
                // Load a demo pattern template
                this.loadBrandPattern();
                break;
        }
    }

    loadBrandPattern() {
        // Create a simple "brand template" pattern
        // This demonstrates the concept: fixed structure, variable content
        if (!window.sequencer) return;

        // Basic 4-on-floor kick pattern
        const pattern = window.sequencer.patterns[window.sequencer.currentPatternIdx];
        if (!pattern) return;

        // Track 0: Kick on 1, 5, 9, 13 (4/4)
        [0, 4, 8, 12].forEach(step => {
            pattern.tracks[0].steps[step].active = true;
        });

        // Track 2: Hihat on every other step
        for (let i = 0; i < 16; i += 2) {
            pattern.tracks[2].steps[i].active = true;
        }

        // Track 1: Snare on 5, 13
        [4, 12].forEach(step => {
            pattern.tracks[1].steps[step].active = true;
        });

        window.sequencer.renderPattern();
        console.log('Brand pattern template loaded');
    }

    applySettings() {
        // Apply theme
        this.setTheme(this.settings.theme);

        // Apply kit
        if (window.sampler) {
            window.sampler.setBank(this.settings.selectedKit);
        }
    }

    setTheme(theme) {
        const mapBg = document.getElementById('mapBackground');
        this.settings.theme = theme;

        // Always remove filter first, then apply per theme
        mapBg.style.filter = '';

        if (theme === 'mariani') {
            mapBg.style.backgroundImage = "url('https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Mariani_wine_Laurens.jpg/800px-Mariani_wine_Laurens.jpg')";
            mapBg.style.filter = 'brightness(0.7) sepia(0.2)';
            mapBg.classList.remove('has-location');
        } else if (theme === 'map') {
            // Will be updated by GPS
            const pos = window.gpsTracker?.getPosition();
            if (pos) {
                const mapUrl = window.gpsTracker.getMapImageUrl(16);
                if (mapUrl) {
                    mapBg.style.backgroundImage = `url("${mapUrl}")`;
                    mapBg.classList.add('has-location');
                }
            }
        } else if (theme === 'dark') {
            mapBg.style.backgroundImage = 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)';
            mapBg.classList.remove('has-location');
        }

        this.saveSettings();
    }

    // Transport
    setupTransport() {
        const btnPlay = document.getElementById('btnPlay');
        const btnStop = document.getElementById('btnStop');
        const btnRecord = document.getElementById('btnRecord');

        // Embedded transport (inline bar, shown in embedded/iframe mode)
        const btnPlayE = document.getElementById('btnPlayE');
        const btnStopE = document.getElementById('btnStopE');
        const btnRecordE = document.getElementById('btnRecordE');

        const playHandler = () => {
            if (window.sequencer.isPlaying()) {
                window.sequencer.stop();
                btnPlay?.classList.remove('active');
                btnPlayE?.classList.remove('active');
            } else {
                window.sequencer.play();
                btnPlay?.classList.add('active');
                btnPlayE?.classList.add('active');
            }
            // Update tempo display
            this.updateTempoDisplay();
        };

        const stopHandler = () => {
            window.sequencer.stop();
            btnPlay?.classList.remove('active');
            btnPlayE?.classList.remove('active');

            if (window.sessionRecorder.isRecording()) {
                window.sessionRecorder.stop();
                btnRecord?.classList.remove('active');
                btnRecordE?.classList.remove('active');
                this.stopTimeDisplay();
            }

            window.synth.stop();
            window.radioPlayer.stop();
            window.sampler.stopAll();

            document.getElementById('synthToggle')?.classList.remove('active');
            const synthToggle = document.getElementById('synthToggle');
            if (synthToggle) synthToggle.textContent = 'OFF';
        };

        const recordHandler = () => {
            if (window.sessionRecorder.isRecording()) {
                window.sessionRecorder.stop();
                btnRecord?.classList.remove('active');
                btnRecordE?.classList.remove('active');
                this.stopTimeDisplay();
            } else {
                window.sessionRecorder.start();
                btnRecord?.classList.add('active');
                btnRecordE?.classList.add('active');
                this.startTimeDisplay();
            }
        };

        // Primary transport (sidebar)
        btnPlay?.addEventListener('click', playHandler);
        btnStop?.addEventListener('click', stopHandler);
        btnRecord?.addEventListener('click', recordHandler);

        // Embedded transport
        btnPlayE?.addEventListener('click', playHandler);
        btnStopE?.addEventListener('click', stopHandler);
        btnRecordE?.addEventListener('click', recordHandler);
    }

    updateTempoDisplay() {
        const tempo = window.sequencer?.getTempo() || 120;
        const tempoDisplay = document.getElementById('tempoDisplay2');
        if (tempoDisplay) tempoDisplay.textContent = tempo;
    }

    startTimeDisplay() {
        const display = document.getElementById('timeDisplay');
        this.timeInterval = setInterval(() => {
            display.textContent = window.sessionRecorder.getFormattedTime();
        }, 100);
    }

    stopTimeDisplay() {
        if (this.timeInterval) {
            clearInterval(this.timeInterval);
            this.timeInterval = null;
        }
        document.getElementById('timeDisplay').textContent = '00:00';
    }

    // Tempo
    setupTempo() {
        const slider = document.getElementById('tempoSlider');
        const display = document.getElementById('tempoVal');

        if (slider) {
            slider.addEventListener('input', () => {
                const tempo = parseInt(slider.value);
                window.sequencer.setTempo(tempo);
                if (display) display.textContent = tempo;
                // Sync embedded slider
                const sliderE = document.getElementById('tempoSliderE');
                const displayE = document.getElementById('tempoValE');
                if (sliderE) sliderE.value = tempo;
                if (displayE) displayE.textContent = tempo;
            });
        }

        // Embedded tempo slider
        const sliderE = document.getElementById('tempoSliderE');
        const displayE = document.getElementById('tempoValE');
        if (sliderE) {
            sliderE.addEventListener('input', () => {
                const tempo = parseInt(sliderE.value);
                window.sequencer.setTempo(tempo);
                if (displayE) displayE.textContent = tempo;
                if (slider) slider.value = tempo;
                if (display) display.textContent = tempo;
            });
        }
    }

    // Mixer
    setupMixer() {
        const channels = ['Mic', 'Samples', 'Synth', 'Radio'];
        this.mixerSolos = {};  // Track solo state
        this.meterMode = 'peak';  // 'peak' or 'rms'
        this.peakHolds = {};  // Peak hold values

        channels.forEach(name => {
            const fader = document.getElementById(`fader${name}`);
            const muteBtn = document.getElementById(`mute${name}`);
            const soloBtn = document.getElementById(`solo${name}`);
            const gainKnob = document.getElementById(`gain${name}`);
            const panKnob = document.getElementById(`pan${name}`);
            const channelKey = name.toLowerCase();

            // Fader
            if (fader) {
                fader.addEventListener('input', () => {
                    window.audioEngine.setChannelLevel(channelKey, fader.value / 100);
                });
            }

            // Mute button
            if (muteBtn) {
                muteBtn.addEventListener('click', () => {
                    const muted = window.audioEngine.toggleMute(channelKey);
                    muteBtn.classList.toggle('active', muted);
                });
            }

            // Solo button
            if (soloBtn) {
                this.mixerSolos[channelKey] = false;
                soloBtn.addEventListener('click', () => {
                    this.mixerSolos[channelKey] = !this.mixerSolos[channelKey];
                    soloBtn.classList.toggle('active', this.mixerSolos[channelKey]);
                    this.updateMixerSoloState();
                });
            }

            // Gain knob (input gain)
            if (gainKnob) {
                gainKnob.addEventListener('input', () => {
                    const gain = gainKnob.value / 100;  // 0-2 range
                    window.audioEngine.setChannelGain?.(channelKey, gain);
                });
            }

            // Pan knob
            if (panKnob) {
                panKnob.addEventListener('input', () => {
                    const pan = panKnob.value / 100;  // -1 to 1
                    window.audioEngine.setChannelPan?.(channelKey, pan);
                });
            }

            // Initialize peak hold
            this.peakHolds[channelKey] = 0;
        });

        // Master fader
        const masterFader = document.getElementById('faderMaster');
        if (masterFader) {
            masterFader.addEventListener('input', () => {
                window.audioEngine.setMasterLevel(masterFader.value / 100);
            });
        }

        // Meter mode buttons
        const meterBtns = document.querySelectorAll('.meter-btn');
        meterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                meterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.meterMode = btn.dataset.mode;
            });
        });
    }

    // Update mixer solo state (mute non-soloed channels)
    updateMixerSoloState() {
        const hasSolo = Object.values(this.mixerSolos).some(s => s);
        const channels = ['mic', 'samples', 'synth', 'radio'];

        channels.forEach(ch => {
            if (hasSolo) {
                // If any channel is soloed, mute non-soloed channels
                window.audioEngine.setSoloMute?.(ch, !this.mixerSolos[ch]);
            } else {
                // No solo active, unmute all
                window.audioEngine.setSoloMute?.(ch, false);
            }
        });
    }

    // EQ with channel selector buttons
    setupEQ() {
        const chBtns = document.querySelectorAll('.ch-btn');
        const eqLow = document.getElementById('eqLow');
        const eqMid = document.getElementById('eqMid');
        const eqHigh = document.getElementById('eqHigh');
        const eqLowVal = document.getElementById('eqLowVal');
        const eqMidVal = document.getElementById('eqMidVal');
        const eqHighVal = document.getElementById('eqHighVal');

        this.currentEqChannel = 'master';

        // Update sliders when channel changes
        const updateSliders = () => {
            const eq = window.audioEngine.getEQ(this.currentEqChannel);
            if (eqLow) eqLow.value = eq.low;
            if (eqMid) eqMid.value = eq.mid;
            if (eqHigh) eqHigh.value = eq.high;
            if (eqLowVal) eqLowVal.textContent = Math.round(eq.low);
            if (eqMidVal) eqMidVal.textContent = Math.round(eq.mid);
            if (eqHighVal) eqHighVal.textContent = Math.round(eq.high);
        };

        // Channel selector buttons
        chBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                chBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentEqChannel = btn.dataset.ch;
                updateSliders();
            });
        });

        // EQ slider handlers
        if (eqLow) {
            eqLow.addEventListener('input', () => {
                const val = parseFloat(eqLow.value);
                window.audioEngine.setEQ(this.currentEqChannel, 'low', val);
                if (eqLowVal) eqLowVal.textContent = Math.round(val);
            });
        }

        if (eqMid) {
            eqMid.addEventListener('input', () => {
                const val = parseFloat(eqMid.value);
                window.audioEngine.setEQ(this.currentEqChannel, 'mid', val);
                if (eqMidVal) eqMidVal.textContent = Math.round(val);
            });
        }

        if (eqHigh) {
            eqHigh.addEventListener('input', () => {
                const val = parseFloat(eqHigh.value);
                window.audioEngine.setEQ(this.currentEqChannel, 'high', val);
                if (eqHighVal) eqHighVal.textContent = Math.round(val);
            });
        }
    }

    // Octatrack-style sequencer
    setupOctaTrackSequencer() {
        const octTracks = document.getElementById('octTracks');
        const numTracks = this.settings.seqTracks;

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
                step.addEventListener('touchstart', (e) => {
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
        const editor = document.getElementById('plockEditor');
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

    // Keyboard shortcuts
    setupKeyboardShortcuts() {
        // Key state tracking for hold-to-activate (Fill, Punch FX)
        this.keysHeld = {};

        document.addEventListener('keydown', (e) => {
            // Ignore if typing in input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            if (e.key === 'Shift') {
                this.shiftHeld = true;
            }

            // Escape closes P-Lock editor or stops all
            if (e.key === 'Escape') {
                if (this.plockEditing) {
                    this.closePLockEditor();
                } else {
                    // Stop all
                    document.getElementById('btnStop')?.click();
                }
            }

            // Space = Play/Pause
            if (e.key === ' ' || e.code === 'Space') {
                e.preventDefault();
                document.getElementById('btnPlay')?.click();
            }

            // R = Record
            if (e.key === 'r' || e.key === 'R') {
                document.getElementById('btnRecord')?.click();
            }

            // Number keys 1-8 trigger pads
            if (e.key >= '1' && e.key <= '8') {
                const padIndex = parseInt(e.key) - 1;
                const pad = document.querySelector(`.pad[data-pad="${padIndex}"]`);
                if (pad) {
                    pad.classList.add('active');
                    this.flashPad(padIndex);
                    window.sampler?.trigger(padIndex);
                }
            }

            // Arrow keys for track selection
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                const newTrack = Math.max(0, this.selectedTrack - 1);
                this.selectTrack(newTrack);
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                const newTrack = Math.min(7, this.selectedTrack + 1);
                this.selectTrack(newTrack);
            }

            // D = Dub mode toggle
            if (e.key === 'd' || e.key === 'D') {
                document.getElementById('dubToggle')?.click();
            }

            // Ctrl+C = Copy track
            if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
                e.preventDefault();
                window.sequencer?.copyTrack(this.selectedTrack);
            }

            // Ctrl+V = Paste track
            if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
                e.preventDefault();
                window.sequencer?.pasteTrack(this.selectedTrack);
                this.updateOctSteps();
            }

            // Ctrl+Z = Undo
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                window.sequencer?.undo();
            }

            // Ctrl+Y or Ctrl+Shift+Z = Redo
            if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
                e.preventDefault();
                window.sequencer?.redo();
            }

            // F = Fill (hold)
            if ((e.key === 'f' || e.key === 'F') && !this.keysHeld['f']) {
                this.keysHeld['f'] = true;
                window.sequencer?.setFillMode(true);
                document.getElementById('fillBtn')?.classList.add('active');
            }

            // Punch FX keys (hold)
            if ((e.key === 'q' || e.key === 'Q') && !this.keysHeld['q']) {
                this.keysHeld['q'] = true;
                this.applyPunchFX('stutter', true);
                document.querySelector('.punch-btn[data-fx="stutter"]')?.classList.add('active');
            }
            if ((e.key === 'w' || e.key === 'W') && !this.keysHeld['w']) {
                this.keysHeld['w'] = true;
                this.applyPunchFX('reverse', true);
                document.querySelector('.punch-btn[data-fx="reverse"]')?.classList.add('active');
            }
            if ((e.key === 'e' || e.key === 'E') && !this.keysHeld['e']) {
                this.keysHeld['e'] = true;
                this.applyPunchFX('filter', true);
                document.querySelector('.punch-btn[data-fx="filter"]')?.classList.add('active');
            }
            if ((e.key === 't' || e.key === 'T') && !this.keysHeld['t']) {
                this.keysHeld['t'] = true;
                this.applyPunchFX('tape', true);
                document.querySelector('.punch-btn[data-fx="tape"]')?.classList.add('active');
            }

            // G = Generate AI pattern
            if (e.key === 'g' || e.key === 'G') {
                document.getElementById('aiGenerate')?.click();
            }

            // ? = Show help
            if (e.key === '?') {
                document.getElementById('helpModal')?.classList.remove('hidden');
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.key === 'Shift') {
                this.shiftHeld = false;
            }

            // Release number keys for pads
            if (e.key >= '1' && e.key <= '8') {
                const padIndex = parseInt(e.key) - 1;
                const pad = document.querySelector(`.pad[data-pad="${padIndex}"]`);
                if (pad) pad.classList.remove('active');
            }

            // Release Fill
            if (e.key === 'f' || e.key === 'F') {
                this.keysHeld['f'] = false;
                window.sequencer?.setFillMode(false);
                document.getElementById('fillBtn')?.classList.remove('active');
            }

            // Release Punch FX
            if (e.key === 'q' || e.key === 'Q') {
                this.keysHeld['q'] = false;
                this.applyPunchFX('stutter', false);
                document.querySelector('.punch-btn[data-fx="stutter"]')?.classList.remove('active');
            }
            if (e.key === 'w' || e.key === 'W') {
                this.keysHeld['w'] = false;
                this.applyPunchFX('reverse', false);
                document.querySelector('.punch-btn[data-fx="reverse"]')?.classList.remove('active');
            }
            if (e.key === 'e' || e.key === 'E') {
                this.keysHeld['e'] = false;
                this.applyPunchFX('filter', false);
                document.querySelector('.punch-btn[data-fx="filter"]')?.classList.remove('active');
            }
            if (e.key === 't' || e.key === 'T') {
                this.keysHeld['t'] = false;
                this.applyPunchFX('tape', false);
                document.querySelector('.punch-btn[data-fx="tape"]')?.classList.remove('active');
            }
        });
    }

    // Tap Tempo
    setupTapTempo() {
        const tapBtn = document.getElementById('btnTap');
        const tapBtn2 = document.getElementById('btnTap2');
        const tapBtnE = document.getElementById('btnTapE');

        const handleTap = (btn) => {
            const now = performance.now();

            // Reset if more than 2 seconds since last tap
            if (now - this.lastTapTime > 2000) {
                this.tapTimes = [];
            }

            this.tapTimes.push(now);
            this.lastTapTime = now;

            // Visual feedback for all tap buttons
            [tapBtn, tapBtn2, tapBtnE].forEach(b => {
                if (b) {
                    b.classList.add('tap-active');
                    setTimeout(() => b.classList.remove('tap-active'), 100);
                }
            });

            // Calculate tempo from last 4 taps
            if (this.tapTimes.length >= 2) {
                const intervals = [];
                for (let i = 1; i < Math.min(this.tapTimes.length, 5); i++) {
                    intervals.push(this.tapTimes[i] - this.tapTimes[i - 1]);
                }
                const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
                const bpm = Math.round(60000 / avgInterval);

                // Clamp to valid range
                const clampedBpm = Math.max(60, Math.min(200, bpm));

                // Apply tempo
                window.sequencer?.setTempo(clampedBpm);
                const tempoSlider = document.getElementById('tempoSlider');
                const tempoVal = document.getElementById('tempoVal');
                const tempoDisplay2 = document.getElementById('tempoDisplay2');
                const tempoSliderE = document.getElementById('tempoSliderE');
                const tempoValE = document.getElementById('tempoValE');
                if (tempoSlider) tempoSlider.value = clampedBpm;
                if (tempoVal) tempoVal.textContent = clampedBpm;
                if (tempoDisplay2) tempoDisplay2.textContent = clampedBpm;
                if (tempoSliderE) tempoSliderE.value = clampedBpm;
                if (tempoValE) tempoValE.textContent = clampedBpm;
            }

            // Keep only last 5 taps
            if (this.tapTimes.length > 5) {
                this.tapTimes.shift();
            }
        };

        if (tapBtn) {
            tapBtn.addEventListener('click', () => handleTap(tapBtn));
            tapBtn.addEventListener('touchstart', (e) => { e.preventDefault(); handleTap(tapBtn); });
        }
        if (tapBtn2) {
            tapBtn2.addEventListener('click', () => handleTap(tapBtn2));
            tapBtn2.addEventListener('touchstart', (e) => { e.preventDefault(); handleTap(tapBtn2); });
        }
        if (tapBtnE) {
            tapBtnE.addEventListener('click', () => handleTap(tapBtnE));
            tapBtnE.addEventListener('touchstart', (e) => { e.preventDefault(); handleTap(tapBtnE); });
        }
    }

    // Help Modal
    setupHelpModal() {
        const helpBtn = document.getElementById('btnHelp');
        const helpBtnE = document.getElementById('btnHelpE');
        const modal = document.getElementById('helpModal');
        const closeBtn = document.getElementById('closeHelp');

        const showHelp = () => { if (modal) modal.classList.remove('hidden'); };
        if (helpBtn) helpBtn.addEventListener('click', showHelp);
        if (helpBtnE) helpBtnE.addEventListener('click', showHelp);

        if (closeBtn && modal) {
            closeBtn.addEventListener('click', () => {
                modal.classList.add('hidden');
            });
        }

        // Close on backdrop click
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.add('hidden');
                }
            });
        }
    }

    // Embedded mode detection
    isEmbedded() {
        return new URLSearchParams(window.location.search).get('embedded') === '1';
    }

    // Demo mode detection
    getDemoMode() {
        return new URLSearchParams(window.location.search).get('demo') || null;
    }

    // Demo mode uses panel tabs like embedded mode
    isDemoOrEmbedded() {
        return this.isEmbedded() || this.getDemoMode();
    }

    // PostMessage bridge for embedded mode communication with parent mockup
    setupPostMessageBridge() {
        if (!this.isEmbedded()) return;

        // Listen for commands from parent mockup page
        window.addEventListener('message', (event) => {
            // Security: Only accept messages from same origin
            if (event.origin !== window.location.origin) return;
            const msg = event.data;
            if (!msg || msg.type !== 'mockup-control') return;

            switch (msg.action) {
                case 'transport':
                    if (msg.data.action === 'play') {
                        const btn = document.getElementById('btnPlayE') || document.getElementById('btnPlay');
                        if (btn) btn.click();
                    }
                    if (msg.data.action === 'stop') {
                        const btn = document.getElementById('btnStopE') || document.getElementById('btnStop');
                        if (btn) btn.click();
                    }
                    if (msg.data.action === 'record') {
                        const btn = document.getElementById('btnRecordE') || document.getElementById('btnRecord');
                        if (btn) btn.click();
                    }
                    break;
                case 'pad':
                    if (typeof msg.data.index === 'number') {
                        const pad = document.querySelector(`.pad[data-pad="${msg.data.index}"]`);
                        if (pad) {
                            pad.dispatchEvent(new MouseEvent('mousedown'));
                            setTimeout(() => pad.dispatchEvent(new MouseEvent('mouseup')), 100);
                        }
                    }
                    break;
                case 'encoder':
                    if (msg.data.param && typeof msg.data.value === 'number') {
                        this.handleMockupEncoder(msg.data.param, msg.data.value);
                    }
                    break;
                case 'mode':
                    if (msg.data.mode) {
                        this.handleMockupMode(msg.data.mode);
                    }
                    break;
                case 'scene':
                    if (typeof msg.data.index === 'number') {
                        const btn = document.querySelector(`.scene-btn[data-scene="${msg.data.index}"]`);
                        if (btn) btn.click();
                    }
                    break;
                case 'source':
                    if (msg.data.source) {
                        const btn = document.querySelector(`.src-btn[data-src="${msg.data.source}"]`);
                        if (btn) btn.click();
                    }
                    break;
                case 'pattern':
                    if (typeof msg.data.index === 'number') {
                        const btn = document.querySelector(`.pattern-btn[data-pattern="${msg.data.index}"]`);
                        if (btn) btn.click();
                    }
                    break;
                case 'panel':
                    if (msg.data.panelId) {
                        this.switchToPanel(msg.data.panelId);
                    }
                    break;
                case 'joystick':
                    this.handleJoystick(msg.data.direction);
                    break;
            }
        });

        // Send state updates to parent at 10fps
        this._stateInterval = setInterval(() => {
            if (!window.parent || window.parent === window) return;
            const gps = window.gpsTracker?.getPosition();
            window.parent.postMessage({
                type: 'app-state',
                data: {
                    isPlaying: window.sequencer?.isPlaying() || false,
                    isRecording: window.sessionRecorder?.isRecording() || false,
                    bpm: window.sequencer?.getTempo() || 120,
                    currentStep: window.sequencer?.getCurrentStep() || 0,
                    currentPattern: window.sequencer?.currentPattern || 0,
                    mode: this._currentMode || 'picture',
                    activePanel: this._activePanel || 'seq-panel',
                    gps: gps ? `${gps.latitude.toFixed(4)}, ${gps.longitude.toFixed(4)}` : null
                }
            }, window.location.origin);
        }, 100);
    }

    // Handle mode switch from mockup (PICTURE / SOUNDSCAPE / INTERACT)
    async handleMockupMode(mode) {
        this._currentMode = mode;

        // Mode → default panel mapping
        const modePanelMap = {
            picture: 'seq-panel',
            soundscape: 'ai-panel',
            interact: 'synth-panel',
            journey: 'journey-panel'
        };

        // Switch to the default panel for this mode
        if (this.isEmbedded() && modePanelMap[mode]) {
            this.switchToPanel(modePanelMap[mode]);
        }

        switch (mode) {
            case 'picture':
                // 90-sec capture mode: start recording + play sequencer
                if (!window.sessionRecorder?.isRecording()) {
                    window.sessionRecorder?.start();
                    const recBtn = document.getElementById('btnRecordE') || document.getElementById('btnRecord');
                    recBtn?.classList.add('active');
                }
                if (!window.sequencer?.isPlaying()) {
                    window.sequencer?.play();
                    const playBtn = document.getElementById('btnPlayE') || document.getElementById('btnPlay');
                    playBtn?.classList.add('active');
                }
                break;

            case 'soundscape':
                // AI ambient mode: ensure all sources live, continuous monitoring, generate + play
                {
                    await window.aiComposer?.ensureAllSources();

                    window.soundscapeAnalyzer?.startMonitoring(5000);

                    const vibe = window.aiComposer?.context?.vibe || 'calm';

                    await window.aiComposer?.generateFull(vibe, 70, 50);
                    this.generateFullComposition(vibe);

                    this.updatePadDisplay();

                    if (!window.sequencer?.isPlaying()) {
                        window.sequencer?.play();
                        const playBtn = document.getElementById('btnPlayE') || document.getElementById('btnPlay');
                        playBtn?.classList.add('active');
                    }

                    const statusEl = document.getElementById('aiStatus');
                    if (statusEl) statusEl.textContent = `SOUNDSCAPE: All sources active — ${vibe}`;
                }
                break;

            case 'interact':
                // Live performance mode: synth + mic ready
                // Enable synth if not already playing
                if (!window.synth?.isPlaying()) {
                    window.synth?.start();
                    const synthBtn = document.getElementById('synthToggle');
                    if (synthBtn) {
                        synthBtn.classList.add('active');
                        synthBtn.textContent = 'ON';
                    }
                }
                // Init mic if not already active
                if (!window.micInput?.isActive()) {
                    window.micInput?.init();
                }
                // Update status
                {
                    const statusEl = document.getElementById('aiStatus');
                    if (statusEl) statusEl.textContent = 'INTERACT: Synth + Mic live — use encoders';
                }
                break;

            case 'journey':
                // Init GPS if not running
                if (window.gpsTracker && !window.gpsTracker.watchId) {
                    window.gpsTracker.init();
                }
                // Notify journey panel it's visible
                if (window.journey) {
                    window.journey.onPanelShow();
                    // Auto-start if not already active
                    if (!window.journey.active) {
                        window.journey.startJourney();
                    }
                }
                break;
        }

        this.publishAnalysisState();
    }

    // Handle encoder changes from mockup
    handleMockupEncoder(param, value) {
        // JOURNEY mode: remap encoders for map/waypoint control
        if (this._currentMode === 'journey') {
            switch (param) {
                case 'volume':
                    window.audioEngine?.setMasterLevel(value / 100);
                    break;
                case 'pan':
                    // ZOOM: map zoom level 10-18
                    if (window.journey) {
                        const zoom = Math.round(10 + (value / 100) * 8);
                        window.journey.setMapZoom(zoom);
                    }
                    break;
            }
            return;
        }

        // INTERACT mode: remap encoders for live synth control
        if (this._currentMode === 'interact') {
            switch (param) {
                case 'volume':
                    window.audioEngine?.setMasterLevel(value / 100);
                    break;
                case 'pan':
                    // Map to filter cutoff (0-100 → 20-8000 Hz)
                    {
                        const cutoff = 20 + (value / 100) * 7980;
                        window.synth?.setFilterCutoff(cutoff);
                        const cutEl = document.getElementById('filterCutoff');
                        if (cutEl) cutEl.value = cutoff;
                        const cutValEl = document.getElementById('filterCutVal');
                        if (cutValEl) cutValEl.textContent = cutoff >= 1000 ? (cutoff / 1000).toFixed(1) + 'k' : Math.round(cutoff);
                    }
                    break;
                case 'filter':
                    // Map to LFO rate (0-100 → 0-20 Hz)
                    {
                        const rate = (value / 100) * 20;
                        window.synth?.setLFORate(rate);
                        const rateEl = document.getElementById('lfoRate');
                        if (rateEl) rateEl.value = rate;
                        const rateValEl = document.getElementById('lfoRateVal');
                        if (rateValEl) rateValEl.textContent = rate.toFixed(1);
                    }
                    break;
                case 'fx':
                    // Map to LFO depth (0-100)
                    {
                        window.synth?.setLFODepth(value);
                        const depEl = document.getElementById('lfoDepth');
                        if (depEl) depEl.value = value;
                        const depValEl = document.getElementById('lfoDepthVal');
                        if (depValEl) depValEl.textContent = Math.round(value);
                    }
                    break;
            }
            return;
        }

        const paramMap = {
            volume: { knobId: 'knobVol', engineParam: 'vol', min: 0, max: 100 },
            pan: { knobId: 'knobPan', engineParam: 'pan', min: -100, max: 100 },
            filter: { knobId: 'knobFilter', engineParam: 'filter', min: 20, max: 8000 },
            fx: { knobId: 'knobDelay', engineParam: 'delay', min: 0, max: 100 }
        };

        const mapping = paramMap[param];
        if (!mapping) return;

        // Scale value (0-100) to param range
        const scaled = mapping.min + (value / 100) * (mapping.max - mapping.min);

        // Update the app knob
        const knob = document.getElementById(mapping.knobId);
        if (knob) {
            knob.dataset.value = Math.round(scaled);
            this.updateKnobRotation(knob, scaled, mapping.min, mapping.max);
        }

        // Apply to audio engine
        switch (mapping.engineParam) {
            case 'vol':
                window.audioEngine?.setMasterLevel(value / 100);
                break;
            case 'pan':
                // Pan mapped to master or sampler
                break;
            case 'filter':
                window.synth?.setFilterCutoff(scaled);
                break;
            case 'delay':
                window.mangleEngine?.setDelayMix(value);
                break;
        }
    }

    // Handle 5-way joystick input from mockup
    handleJoystick(direction) {
        // In journey mode: up/down = zoom, left/right = waypoint nav, select = add waypoint
        if (this._currentMode === 'journey' && window.journey) {
            switch (direction) {
                case 'up':
                    window.journey.setMapZoom((window.journey.map?.getZoom() || 14) + 1);
                    break;
                case 'down':
                    window.journey.setMapZoom((window.journey.map?.getZoom() || 14) - 1);
                    break;
                case 'select':
                    if (window.journey.active) {
                        window.journey.addWaypoint();
                    } else {
                        window.journey.startJourney();
                    }
                    break;
                case 'left':
                case 'right':
                    // Pan map slightly in the given direction
                    if (window.journey.map) {
                        const c = window.journey.map.getCenter();
                        const offset = direction === 'left' ? -0.001 : 0.001;
                        window.journey.map.panTo([c.lat, c.lng + offset]);
                    }
                    break;
            }
            return;
        }

        // Default: left/right = switch panel tabs, up/down = select track, select = trigger
        const tabs = Array.from(document.querySelectorAll('.panel-tab'));
        const activeIdx = tabs.findIndex(t => t.classList.contains('active'));

        switch (direction) {
            case 'left':
                if (activeIdx > 0) tabs[activeIdx - 1].click();
                break;
            case 'right':
                if (activeIdx < tabs.length - 1) tabs[activeIdx + 1].click();
                break;
            case 'up':
                if (this.selectedTrack > 0) {
                    this.selectedTrack--;
                    this.updateOctSteps?.();
                }
                break;
            case 'down':
                if (this.selectedTrack < 7) {
                    this.selectedTrack++;
                    this.updateOctSteps?.();
                }
                break;
            case 'select':
                // Trigger the first pad
                const pad = document.querySelector('.pad[data-pad="0"]');
                if (pad) {
                    pad.dispatchEvent(new MouseEvent('mousedown'));
                    setTimeout(() => pad.dispatchEvent(new MouseEvent('mouseup')), 100);
                }
                break;
        }
    }

    // Panel tab navigation (embedded, demo, and mobile modes)
    setupPanelTabs() {
        const isMobile = () => window.innerWidth <= 767;

        // Always bind tab click handlers (needed for mobile too)
        document.querySelectorAll('.panel-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.switchToPanel(tab.dataset.panel);
            });
        });

        // Set initial panel if in embedded/demo/mobile mode
        if (this.isDemoOrEmbedded() || isMobile()) {
            this.switchToPanel(this._activePanel);
        }

        // Handle resize: activate/deactivate panel tabs when crossing mobile breakpoint
        let wasMobile = isMobile();
        window.addEventListener('resize', () => {
            const nowMobile = isMobile();
            if (nowMobile && !wasMobile) {
                // Entering mobile: ensure a panel is visible
                this.switchToPanel(this._activePanel || 'seq-panel');
            } else if (!nowMobile && wasMobile && !this.isDemoOrEmbedded()) {
                // Leaving mobile: remove panel-visible so grid layout takes over
                document.querySelectorAll('.device > .panel').forEach(p => {
                    p.classList.remove('panel-visible');
                });
            }
            wasMobile = nowMobile;
        });
    }

    switchToPanel(panelId) {
        this._activePanel = panelId;

        // Update tab bar active state
        document.querySelectorAll('.panel-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.panel === panelId);
        });

        // Hide all panels, show the target
        document.querySelectorAll('.device > .panel').forEach(panel => {
            panel.classList.remove('panel-visible');
        });
        const target = document.querySelector(`.device > .panel[data-panel-id="${panelId}"]`);
        if (target) {
            target.classList.add('panel-visible');
        }

        // Update encoder context
        this.updateEncoderContext(panelId);

        // Trigger resize for canvas/layout recalculation
        window.dispatchEvent(new Event('resize'));
    }

    updateEncoderContext(panelId) {
        const encoderMappings = {
            'seq-panel':    ['VOL', 'SWG', 'LEN', 'BPM'],
            'mixer-panel':  ['VOL', 'PAN', 'FILT', 'FX'],
            'synth-panel':  ['VOL', 'DET', 'CUT', 'RES'],
            'fx-panel':     ['DLY', 'GRN', 'GLI', 'CRU'],
            'ai-panel':     ['VOL', 'VIBE', 'FILT', 'FX'],
            'scenes-panel': ['VOL', 'XFAD', 'FILT', 'AUTO'],
            'radio-panel':  ['VOL', 'PAN', 'FILT', 'SCAN'],
            'eq-panel':     ['LO', 'MID', 'HI', 'VOL'],
            'journey-panel': ['VOL', 'ZOOM', 'WPT', 'REC']
        };

        this._encoderContext = encoderMappings[panelId] || ['VOL', 'PAN', 'FILT', 'FX'];

        // Notify parent mockup of encoder context change
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({
                type: 'encoder-context',
                data: {
                    panel: panelId,
                    encoders: this._encoderContext
                }
            }, window.location.origin);
        }
    }

    // Resizable columns
    setupResizableColumns() {
        const device = document.querySelector('.device');
        const cols = document.querySelectorAll('.col-mixer, .col-seq, .col-mid');

        // Add resize handles to columns (except last)
        cols.forEach((col, idx) => {
            const handle = document.createElement('div');
            handle.className = 'col-resize';
            handle.dataset.col = idx;
            col.appendChild(handle);
        });

        // Load saved widths
        if (this.settings.columnWidths) {
            this.applyColumnWidths(this.settings.columnWidths);
        }

        // Drag handling
        let dragging = null;
        let startX = 0;
        let startWidths = [];

        document.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('col-resize')) {
                dragging = parseInt(e.target.dataset.col);
                startX = e.clientX;
                startWidths = this.getColumnWidths();
                e.target.classList.add('active');
                e.preventDefault();
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (dragging !== null) {
                const delta = e.clientX - startX;
                const newWidths = [...startWidths];
                newWidths[dragging] = Math.max(100, startWidths[dragging] + delta);
                // Take from next column
                if (dragging < 3) {
                    newWidths[dragging + 1] = Math.max(100, startWidths[dragging + 1] - delta);
                }
                this.applyColumnWidths(newWidths);
            }
        });

        document.addEventListener('mouseup', () => {
            if (dragging !== null) {
                document.querySelectorAll('.col-resize').forEach(h => h.classList.remove('active'));
                this.settings.columnWidths = this.getColumnWidths();
                this.saveSettings();
                dragging = null;
            }
        });
    }

    getColumnWidths() {
        const cols = document.querySelectorAll('.col-mixer, .col-seq, .col-mid, .col-right');
        return Array.from(cols).map(col => col.offsetWidth);
    }

    applyColumnWidths(widths) {
        const device = document.querySelector('.device');
        if (device && widths.length === 4) {
            device.style.setProperty('--col-mixer', widths[0] + 'px');
            device.style.setProperty('--col-seq', widths[1] + 'px');
            device.style.setProperty('--col-mid', widths[2] + 'px');
            device.style.setProperty('--col-right', widths[3] + 'px');
        }
    }

    // VU Meters
    setupVUMeters() {
        // Add VU meter elements to each channel
        const channels = ['Mic', 'Samples', 'Synth', 'Radio', 'Master'];
        channels.forEach(name => {
            const ch = document.querySelector(`.ch:has(#fader${name}), .ch:has(#mute${name})`);
            if (!ch) return;

            // Check if VU already exists
            if (ch.querySelector('.vu-meter')) return;

            const vu = document.createElement('div');
            vu.className = 'vu-meter';
            vu.id = `vu${name}`;
            vu.innerHTML = '<div class="vu-fill"></div>';
            ch.insertBefore(vu, ch.firstChild);
        });

        // Start meter animation
        this.vuAnimationId = requestAnimationFrame(() => this.updateVUMeters());
    }

    updateVUMeters() {
        const channels = [
            { name: 'Mic', key: 'mic' },
            { name: 'Samples', key: 'samples' },
            { name: 'Synth', key: 'synth' },
            { name: 'Radio', key: 'radio' },
            { name: 'Master', key: 'master' }
        ];

        // Initialize peak holds if not exists
        if (!this.peakHolds) {
            this.peakHolds = {};
            channels.forEach(({ key }) => this.peakHolds[key] = 0);
        }

        channels.forEach(({ name, key }) => {
            // HTML structure: .vu-fill has id="vuXxx", .vu-peak has id="peakXxx"
            const fill = document.getElementById(`vu${name}`);
            const peak = document.getElementById(`peak${name}`);
            const level = window.audioEngine?.getMeterLevel(key) || 0;

            if (fill) {
                fill.style.height = level + '%';
                // Color based on level
                if (level > 90) {
                    fill.style.background = '#e74c3c';
                } else if (level > 70) {
                    fill.style.background = '#f1c40f';
                } else {
                    fill.style.background = '#27ae60';
                }
            }

            // Update peak hold
            if (peak) {
                if (level > this.peakHolds[key]) {
                    this.peakHolds[key] = level;
                } else {
                    // Decay peak slowly
                    this.peakHolds[key] = Math.max(0, this.peakHolds[key] - 1);
                }
                peak.style.bottom = this.peakHolds[key] + '%';
            }
        });

        // Update limiter indicator
        const limiter = document.getElementById('limiterIndicator');
        if (limiter) {
            const masterLevel = window.audioEngine?.getMeterLevel('master') || 0;
            const isLimiting = masterLevel > 95;
            limiter.classList.toggle('active', isLimiting);
        }

        this.vuAnimationId = requestAnimationFrame(() => this.updateVUMeters());
    }

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
        const scopeSelect = document.getElementById('sceneScope');
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

    // AI
    setupAI() {
        const generateBtn = document.getElementById('aiGenerate');

        // Wire AI progress callback for visual feedback
        if (window.aiComposer) {
            window.aiComposer.onProgress((stage, message) => {
                const progressEl = document.getElementById('aiProgress');
                const statusEl = document.getElementById('aiStatus');
                if (progressEl) {
                    const stageIcons = {
                        listening: '&#127911;', capturing: '&#127908;',
                        generating: '&#127926;', assigning: '&#127929;',
                        tuning: '&#127925;', done: '&#9989;'
                    };
                    progressEl.innerHTML = `<span class="ai-progress-icon">${stageIcons[stage] || ''}</span> ${message}`;
                    progressEl.className = `ai-progress ai-progress-${stage}`;
                }
                if (statusEl) statusEl.textContent = message;
            });
        }

        if (generateBtn) {
            generateBtn.addEventListener('click', async () => {
                // Use auto-detected vibe from AI composer
                const vibe = window.aiComposer?.context?.vibe || 'calm';

                // Ensure all sources active, then full AI generate
                const statusEl = document.getElementById('aiStatus');
                if (statusEl) statusEl.textContent = 'Generating...';

                await window.aiComposer?.ensureAllSources();
                await window.aiComposer?.generateFull(vibe, 70, 50);
                this.generateFullComposition(vibe);

                // Update pad display for any auto-captured samples
                this.updatePadDisplay();

                // Update role badges and modulation route labels
                this.updateRoleBadges();
                this.updateModulationLabels();

                if (statusEl) statusEl.textContent = `Generated ${vibe} composition with captured audio`;
            });
        }
    }

    // Update role badge indicators on mixer channels
    updateRoleBadges() {
        if (!window.sourceRoleManager) return;
        const assignments = window.sourceRoleManager.getAssignments();
        const channelMap = { mic: 'Mic', samples: 'Samples', synth: 'Synth', radio: 'Radio' };
        const roleLabels = { rhythm: 'R', texture: 'T', melody: 'M', modulation: 'X' };
        const roleColors = { rhythm: '#c47070', texture: '#5b9bd5', melody: '#6abf8a', modulation: '#d4c56a' };

        // Clear all role badges
        for (const ch of Object.keys(channelMap)) {
            const el = document.getElementById(`role${channelMap[ch]}`);
            if (el) { el.textContent = ''; el.style.background = 'transparent'; }
        }

        // Count roles per source channel
        const sourceRoles = {};
        for (const a of assignments) {
            if (!sourceRoles[a.source]) sourceRoles[a.source] = [];
            sourceRoles[a.source].push(a.role);
        }

        // Set badges
        for (const [source, roles] of Object.entries(sourceRoles)) {
            const chName = source === 'sampler' ? 'Samples' :
                           source.charAt(0).toUpperCase() + source.slice(1);
            const el = document.getElementById(`role${chName}`);
            if (!el) continue;
            // Show primary role (most common)
            const primaryRole = roles[0];
            el.textContent = roleLabels[primaryRole] || '';
            el.style.background = roleColors[primaryRole] || 'transparent';
            el.style.color = '#fff';
        }
    }

    // Update modulation route labels beneath mixer channels
    updateModulationLabels() {
        if (!window.sourceRoleManager) return;
        const routes = window.sourceRoleManager.modulationRoutes;
        const channelMap = { mic: 'Mic', samples: 'Samples', synth: 'Synth', radio: 'Radio' };

        // Clear all route labels
        for (const ch of Object.keys(channelMap)) {
            const el = document.getElementById(`route${channelMap[ch]}`);
            if (el) el.textContent = '';
        }

        // Set route labels
        for (const route of routes) {
            const srcName = route.sourceChannel === 'sampler' ? 'Samples' :
                            route.sourceChannel ? route.sourceChannel.charAt(0).toUpperCase() + route.sourceChannel.slice(1) : '';
            const el = document.getElementById(`route${srcName}`);
            if (!el) continue;
            const target = route.targetChannel || `T${route.targetTrack ?? ''}`;
            const param = route.targetParam || '';
            el.textContent = `\u2192 ${target} ${param}`;
        }
    }

    // Generate full composition based on vibe (patterns + FX + mixer + tempo)
    generateFullComposition(vibe) {
        console.log(`Generating full composition: ${vibe}`);

        // Generate rhythm pattern
        window.aiComposer?.generateRhythm(vibe, 70, 50);

        // Generate vibe-appropriate settings
        const vibeSettings = {
            calm: {
                tempo: 85 + Math.floor(Math.random() * 20),  // 85-105
                delay: 30 + Math.floor(Math.random() * 30),   // 30-60
                grain: 0,
                glitch: 0,
                crush: 16,
                mixer: { mic: 50, samples: 70, synth: 60, radio: 40, master: 85 }
            },
            urban: {
                tempo: 110 + Math.floor(Math.random() * 30), // 110-140
                delay: 20 + Math.floor(Math.random() * 40),
                grain: Math.floor(Math.random() * 30),
                glitch: Math.floor(Math.random() * 20),
                crush: 12 + Math.floor(Math.random() * 4),
                mixer: { mic: 30, samples: 90, synth: 70, radio: 55, master: 90 }
            },
            nature: {
                tempo: 70 + Math.floor(Math.random() * 30),  // 70-100
                delay: 40 + Math.floor(Math.random() * 30),
                grain: 20 + Math.floor(Math.random() * 40),
                glitch: 0,
                crush: 16,
                mixer: { mic: 70, samples: 60, synth: 40, radio: 55, master: 80 }
            },
            chaos: {
                tempo: 130 + Math.floor(Math.random() * 40), // 130-170
                delay: Math.floor(Math.random() * 80),
                grain: 30 + Math.floor(Math.random() * 50),
                glitch: 30 + Math.floor(Math.random() * 50),
                crush: 4 + Math.floor(Math.random() * 8),
                mixer: { mic: Math.random() * 100, samples: Math.random() * 100, synth: Math.random() * 100, radio: Math.random() * 100, master: 95 }
            }
        };

        const settings = vibeSettings[vibe] || vibeSettings.calm;

        // Apply tempo
        window.sequencer?.setTempo(settings.tempo);
        const tempoSlider = document.getElementById('tempoSlider');
        const tempoVal = document.getElementById('tempoVal');
        if (tempoSlider) tempoSlider.value = settings.tempo;
        if (tempoVal) tempoVal.textContent = settings.tempo;

        // Apply FX
        window.mangleEngine?.setDelayMix(settings.delay);
        window.mangleEngine?.setGrain(settings.grain, 50, 0);
        window.mangleEngine?.setGlitch(settings.glitch, 100, 'stutter');
        window.mangleEngine?.setBitDepth(settings.crush);

        // Update FX sliders
        const fxDelay = document.getElementById('fxDelay');
        const fxGrain = document.getElementById('fxGrain');
        const fxGlitch = document.getElementById('fxGlitch');
        const fxCrush = document.getElementById('fxCrush');
        if (fxDelay) fxDelay.value = settings.delay;
        if (fxGrain) fxGrain.value = settings.grain;
        if (fxGlitch) fxGlitch.value = settings.glitch;
        if (fxCrush) fxCrush.value = settings.crush;

        // Apply mixer levels
        const mixerChannels = ['Mic', 'Samples', 'Synth', 'Radio'];
        mixerChannels.forEach(ch => {
            const key = ch.toLowerCase();
            const level = settings.mixer[key];
            const fader = document.getElementById(`fader${ch}`);
            if (fader) fader.value = level;
            window.audioEngine?.setChannelLevel(key, level / 100);
        });

        const masterFader = document.getElementById('faderMaster');
        if (masterFader) masterFader.value = settings.mixer.master;
        window.audioEngine?.setMasterLevel(settings.mixer.master / 100);

        // Update knobs to match
        const knobDelay = document.getElementById('knobDelay');
        const knobGrain = document.getElementById('knobGrain');
        if (knobDelay) {
            knobDelay.dataset.value = settings.delay;
            this.updateKnobRotation(knobDelay, settings.delay, 0, 100);
        }
        if (knobGrain) {
            knobGrain.dataset.value = settings.grain;
            this.updateKnobRotation(knobGrain, settings.grain, 0, 100);
        }

        // Update sequencer display
        this.updateOctSteps();

        // Auto-tune to a local radio station (with fallback)
        this.tuneLocalRadio().then(() => {
            if (!window.radioPlayer?.isPlaying()) {
                window.radioPlayer?.playFallback();
            }
        });

        console.log(`Generated ${vibe} composition: tempo=${settings.tempo}, delay=${settings.delay}, grain=${settings.grain}`);

        // Run audio analysis after audio has started flowing
        setTimeout(() => this.runAnalysis(), 500);
        setTimeout(() => this.runAnalysis(), 2000);
    }

    // Analyze audio output and display report
    runAnalysis() {
        if (!window.audioEngine?.analyzeOutput) return;

        const master = window.audioEngine.analyzeOutput();
        const channelNames = ['mic', 'samples', 'synth', 'radio'];
        const channels = {};
        channelNames.forEach(name => {
            channels[name] = window.audioEngine.analyzeChannel(name);
        });

        // Log warnings for silent channels that should have signal
        channelNames.forEach(name => {
            const ch = channels[name];
            if (!ch.hasSignal) {
                console.warn(`Audio analysis: ${name} channel has no signal`);
            }
        });

        // Build report
        const activeCount = channelNames.filter(n => channels[n].hasSignal).length;
        let levelAssessment;
        if (master.rms < 5) levelAssessment = 'SILENT';
        else if (master.rms < 20) levelAssessment = 'QUIET';
        else if (master.rms < 70) levelAssessment = 'GOOD';
        else if (master.rms < 90) levelAssessment = 'LOUD';
        else levelAssessment = 'CLIPPING';

        let spectralChar;
        if (master.spectralCentroid < 500) spectralChar = 'Dark';
        else if (master.spectralCentroid < 2000) spectralChar = 'Warm';
        else if (master.spectralCentroid < 5000) spectralChar = 'Bright';
        else spectralChar = 'Harsh';

        this.displayAnalysisReport({
            master,
            channels,
            channelNames,
            activeCount,
            levelAssessment,
            spectralChar
        });

        this.publishAnalysisState();
    }

    // Render analysis report into AI panel
    displayAnalysisReport(report) {
        const channelsEl = document.getElementById('analysisChannels');
        const summaryEl = document.getElementById('analysisSummary');
        const reportEl = document.getElementById('analysisReport');
        if (!channelsEl || !summaryEl || !reportEl) return;

        reportEl.style.display = '';

        // Channel rows
        channelsEl.innerHTML = report.channelNames.map(name => {
            const ch = report.channels[name];
            const dot = ch.hasSignal ? '<span class="signal-dot signal-on"></span>' : '<span class="signal-dot signal-off"></span>';
            const levelWidth = Math.min(100, ch.rms);
            const freqLabel = ch.dominantFreq > 0 ? `${ch.dominantFreq}Hz` : '--';
            return `<div class="analysis-ch">
                ${dot}
                <span class="analysis-ch-name">${name.toUpperCase()}</span>
                <div class="analysis-level-bar"><div class="analysis-level-fill" style="width:${levelWidth}%"></div></div>
                <span class="analysis-freq">${freqLabel}</span>
            </div>`;
        }).join('');

        // Summary
        summaryEl.innerHTML = `
            <span class="analysis-item">Level: <strong>${report.levelAssessment}</strong></span>
            <span class="analysis-item">Character: <strong>${report.spectralChar}</strong></span>
            <span class="analysis-item">Sources: <strong>${report.activeCount}/${report.channelNames.length}</strong></span>
            <span class="analysis-item">Dominant: <strong>${report.master.dominantFreq}Hz</strong></span>
        `;
    }

    // Tune to a local radio station based on GPS
    async tuneLocalRadio() {
        const station = await window.radioPlayer?.autoTuneLocal();
        if (station) {
            console.log('Auto-tuned to local station:', station.name);
            // Update station list UI
            const stationList = document.getElementById('stationList');
            if (stationList) {
                stationList.innerHTML = '';
                const item = document.createElement('div');
                item.className = 'station-item playing';
                item.textContent = `📻 ${station.name}`;
                item.title = station.genre || station.country;
                stationList.appendChild(item);
            }
        }
    }

    // Radio
    setupRadio() {
        const searchInput = document.getElementById('radioSearch');
        const scanBtn = document.getElementById('radioScan');
        const goBtn = document.getElementById('radioGo');
        const stopBtn = document.getElementById('radioStop');
        const stationList = document.getElementById('stationList');
        const radioSampleBtn = document.getElementById('radioSample');
        const radioCaptureDur = document.getElementById('radioCaptureDur');
        const radioCaptureStatus = document.getElementById('radioCaptureStatus');

        const doSearch = async () => {
            const query = searchInput?.value?.trim();
            if (!query) return;

            stationList.innerHTML = '<div style="color:#888;font-size:9px;">Searching...</div>';

            const stations = await window.radioPlayer.searchStations(query, '', '');

            if (stations.length === 0) {
                stationList.innerHTML = '<div style="color:#888;font-size:9px;">No stations</div>';
                return;
            }

            stationList.innerHTML = stations.slice(0, 5).map(s => `
                <div class="station-item" data-url="${escapeHtml(s.url)}" data-name="${escapeHtml(s.name)}">
                    ${escapeHtml(s.name)}
                </div>
            `).join('');

            stationList.querySelectorAll('.station-item').forEach(item => {
                item.addEventListener('click', async () => {
                    const success = await window.radioPlayer.play({
                        name: item.dataset.name,
                        url: item.dataset.url
                    });
                    if (success) {
                        stationList.querySelectorAll('.station-item').forEach(i => i.classList.remove('playing'));
                        item.classList.add('playing');
                        stopBtn.disabled = false;
                        if (radioSampleBtn) radioSampleBtn.disabled = false;
                    }
                });
            });
        };

        goBtn.addEventListener('click', doSearch);
        searchInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') doSearch();
        });

        // SCAN button - search for local stations
        scanBtn?.addEventListener('click', async () => {
            stationList.innerHTML = '<div style="color:#888;font-size:9px;">Scanning...</div>';
            const stations = await window.radioPlayer.searchLocalStations();
            if (stations.length === 0) {
                stationList.innerHTML = '<div style="color:#888;font-size:9px;">No local stations</div>';
                return;
            }
            stationList.innerHTML = stations.slice(0, 5).map(s => `
                <div class="station-item" data-url="${escapeHtml(s.url)}" data-name="${escapeHtml(s.name)}">
                    ${escapeHtml(s.name)}
                </div>
            `).join('');

            stationList.querySelectorAll('.station-item').forEach(item => {
                item.addEventListener('click', async () => {
                    const success = await window.radioPlayer.play({
                        name: item.dataset.name,
                        url: item.dataset.url
                    });
                    if (success) {
                        stationList.querySelectorAll('.station-item').forEach(i => i.classList.remove('playing'));
                        item.classList.add('playing');
                        stopBtn.disabled = false;
                        if (radioSampleBtn) radioSampleBtn.disabled = false;
                    }
                });
            });
        });

        stopBtn.addEventListener('click', () => {
            window.radioPlayer.stop();
            stopBtn.disabled = true;
            radioSampleBtn.disabled = true;
            stationList.querySelectorAll('.station-item').forEach(i => i.classList.remove('playing'));
        });

        // SAMPLE button — capture radio audio to a pad
        if (radioSampleBtn) {
            radioSampleBtn.addEventListener('click', async () => {
                if (!window.radioPlayer?.isPlaying()) return;
                const dur = parseInt(radioCaptureDur?.value || 2000);

                radioSampleBtn.disabled = true;
                radioSampleBtn.classList.add('capturing');
                if (radioCaptureStatus) radioCaptureStatus.textContent = 'Sampling...';

                const buffer = await window.radioPlayer.captureToBuffer(dur);
                radioSampleBtn.classList.remove('capturing');

                if (buffer) {
                    const padIdx = window.sampler.getNextEmptyPad();
                    if (padIdx !== null) {
                        const station = window.radioPlayer.getCurrentStation();
                        window.sampler.loadBuffer(padIdx, buffer, {
                            name: station?.name?.substring(0, 12) || 'Radio',
                            source: 'radio',
                            gps: window.gpsTracker?.getPosition(),
                            timestamp: Date.now()
                        });
                        if (radioCaptureStatus) radioCaptureStatus.textContent = `\u2192 Pad ${padIdx + 1}`;
                        this.updatePadDisplay();
                    } else {
                        if (radioCaptureStatus) radioCaptureStatus.textContent = 'Pads full';
                    }
                } else {
                    if (radioCaptureStatus) radioCaptureStatus.textContent = 'Failed';
                }

                radioSampleBtn.disabled = !window.radioPlayer?.isPlaying();
            });
        }

    }

    // Mic capture to pads
    setupMicCapture() {
        const micCaptureBtn = document.getElementById('micCapture');
        const micCaptureDur = document.getElementById('micCaptureDur');
        const micCaptureStatus = document.getElementById('micCaptureStatus');

        if (micCaptureBtn) {
            micCaptureBtn.addEventListener('click', async () => {
                if (!window.micInput?.isActive()) {
                    if (micCaptureStatus) micCaptureStatus.textContent = 'No mic';
                    return;
                }
                const dur = parseInt(micCaptureDur?.value || 2000);

                micCaptureBtn.disabled = true;
                micCaptureBtn.classList.add('capturing');
                if (micCaptureStatus) micCaptureStatus.textContent = 'Recording...';

                const buffer = await window.micInput.captureToBuffer(dur);
                micCaptureBtn.classList.remove('capturing');

                if (buffer) {
                    const padIdx = window.sampler.getNextEmptyPad();
                    if (padIdx !== null) {
                        window.sampler.loadBuffer(padIdx, buffer, {
                            name: 'Mic',
                            source: 'mic',
                            gps: window.gpsTracker?.getPosition(),
                            timestamp: Date.now()
                        });
                        if (micCaptureStatus) micCaptureStatus.textContent = `\u2192 Pad ${padIdx + 1}`;
                        this.updatePadDisplay();
                    } else {
                        if (micCaptureStatus) micCaptureStatus.textContent = 'Pads full';
                    }
                } else {
                    if (micCaptureStatus) micCaptureStatus.textContent = 'Failed';
                }

                micCaptureBtn.disabled = false;
            });
        }
    }

    // Update pad button visuals to show captured state
    updatePadDisplay() {
        document.querySelectorAll('.pads-panel:not(.pads2) .pad').forEach(pad => {
            const index = parseInt(pad.dataset.pad);
            const meta = window.sampler?.getPadMeta(index);

            // Remove old capture classes and label
            pad.classList.remove('captured-radio', 'captured-mic');
            const oldLabel = pad.querySelector('.pad-label');
            if (oldLabel) oldLabel.remove();

            if (meta) {
                if (meta.source === 'radio') {
                    pad.classList.add('captured-radio');
                } else if (meta.source === 'mic') {
                    pad.classList.add('captured-mic');
                }
                // Add label
                const label = document.createElement('span');
                label.className = 'pad-label';
                label.textContent = meta.name;
                pad.appendChild(label);
            }
        });
    }

    // Recordings
    setupRecordings() {
        const listBtn = document.getElementById('recListBtn');

        if (listBtn) {
            listBtn.addEventListener('click', () => {
                this.updateRecordingsList();
            });
        }

        this.updateRecCount();
    }

    updateRecCount() {
        const countEl = document.getElementById('recCount');
        if (countEl) {
            const recordings = window.sessionRecorder?.getRecordings() || [];
            countEl.textContent = recordings.length;
        }
    }

    updateRecordingsList() {
        const recList = document.getElementById('recList');
        if (!recList) return;

        const recordings = window.sessionRecorder.getRecordings();

        if (!recordings || recordings.length === 0) {
            recList.innerHTML = '<div style="color:#888;font-size:8px;padding:2px;">No recordings</div>';
            return;
        }

        recList.innerHTML = recordings.map((rec) => `
            <div class="rec-item" data-id="${escapeHtml(rec.id)}">
                <span class="rec-item-name" data-id="${escapeHtml(rec.id)}">${escapeHtml(rec.name) || 'Rec'}</span>
                ${rec.url ? `<button class="rec-item-play" data-id="${escapeHtml(rec.id)}">▶</button>` : ''}
                ${rec.blob ? `<button class="rec-item-dl" data-id="${escapeHtml(rec.id)}">↓</button>` : ''}
                <button class="rec-item-del" data-id="${escapeHtml(rec.id)}">✕</button>
            </div>
        `).join('');

        // Play buttons
        recList.querySelectorAll('.rec-item-play').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                const rec = recordings.find(r => r.id === id);
                if (rec && rec.url) {
                    const audio = new Audio(rec.url);
                    audio.play();
                }
            });
        });

        // Download buttons
        recList.querySelectorAll('.rec-item-dl').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                window.sessionRecorder.downloadRecording(id);
            });
        });

        // Delete buttons
        recList.querySelectorAll('.rec-item-del').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                window.sessionRecorder.deleteRecording(id);
                this.updateRecordingsList();
                this.updateRecCount();
            });
        });

        // Rename on double-click
        recList.querySelectorAll('.rec-item-name').forEach(span => {
            span.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                const id = span.dataset.id;
                const newName = prompt('Rename recording:', span.textContent);
                if (newName && newName.trim()) {
                    window.sessionRecorder.renameRecording(id, newName.trim());
                    this.updateRecordingsList();
                }
            });
        });
    }

    // Admin Modal
    setupAdminModal() {
        const adminBtn = document.getElementById('btnAdmin');
        const adminBtnE = document.getElementById('btnAdminE');
        const modal = document.getElementById('adminModal');
        const closeBtn = document.getElementById('closeAdmin');

        const showAdmin = () => {
            if (modal) {
                modal.classList.remove('hidden');
                this.populateAdminModal();
            }
        };
        if (adminBtn) adminBtn.addEventListener('click', showAdmin);
        if (adminBtnE) adminBtnE.addEventListener('click', showAdmin);

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modal.classList.add('hidden');
            });
        }

        // Close on backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
            }
        });

        // Kit selection
        document.getElementById('kitList').addEventListener('click', (e) => {
            const item = e.target.closest('.kit-item');
            if (item) {
                document.querySelectorAll('.kit-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                const kit = item.dataset.kit;
                window.sampler.setBank(kit);
                this.settings.selectedKit = kit;
                this.saveSettings();
            }
        });

        // Synth presets
        document.getElementById('synthPresets').addEventListener('click', (e) => {
            const item = e.target.closest('.preset-item');
            if (item) {
                document.querySelectorAll('.preset-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                this.settings.synthPreset = item.dataset.preset;
                this.saveSettings();
                // TODO: Apply synth preset
            }
        });

        // Theme buttons
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.setTheme(btn.dataset.theme);
            });
        });

        // Settings selects
        document.getElementById('recFormat')?.addEventListener('change', (e) => {
            this.settings.recFormat = e.target.value;
            this.saveSettings();
        });

        document.getElementById('recAutoSave')?.addEventListener('change', (e) => {
            this.settings.recAutoSave = e.target.value;
            this.saveSettings();
        });

        document.getElementById('recGpsEmbed')?.addEventListener('change', (e) => {
            this.settings.recGpsEmbed = e.target.checked;
            this.saveSettings();
        });

        document.getElementById('seqTracks')?.addEventListener('change', (e) => {
            this.settings.seqTracks = parseInt(e.target.value);
            this.saveSettings();
            // Would need to rebuild sequencer UI
        });

        document.getElementById('seqSteps')?.addEventListener('change', (e) => {
            this.settings.seqSteps = parseInt(e.target.value);
            this.saveSettings();
            // Would need to rebuild sequencer UI
        });

        // Upload kit button
        const uploadKitBtn = document.getElementById('uploadKitBtn');
        const uploadKit = document.getElementById('uploadKit');

        uploadKitBtn?.addEventListener('click', () => {
            uploadKit.click();
        });

        uploadKit?.addEventListener('change', (e) => {
            const files = e.target.files;
            if (files.length > 0) {
                console.log('Upload kit files:', files);
                // TODO: Process uploaded audio files
            }
        });
    }

    populateAdminModal() {
        // Sync UI with current settings
        document.querySelectorAll('.kit-item').forEach(item => {
            item.classList.toggle('active', item.dataset.kit === this.settings.selectedKit);
        });

        document.querySelectorAll('.preset-item').forEach(item => {
            item.classList.toggle('active', item.dataset.preset === this.settings.synthPreset);
        });

        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === this.settings.theme);
        });

        const recFormat = document.getElementById('recFormat');
        const recAutoSave = document.getElementById('recAutoSave');
        const recGpsEmbed = document.getElementById('recGpsEmbed');
        const seqTracks = document.getElementById('seqTracks');
        const seqSteps = document.getElementById('seqSteps');

        if (recFormat) recFormat.value = this.settings.recFormat;
        if (recAutoSave) recAutoSave.value = this.settings.recAutoSave;
        if (recGpsEmbed) recGpsEmbed.checked = this.settings.recGpsEmbed;
        if (seqTracks) seqTracks.value = this.settings.seqTracks;
        if (seqSteps) seqSteps.value = this.settings.seqSteps;
    }

    // GPS
    updateGPS() {
        const text = document.getElementById('gpsText');
        const headerMapImg = document.getElementById('headerMapImg');
        const miniMapImg = document.getElementById('miniMapImg');
        const miniMapCoords = document.getElementById('miniMapCoords');

        const pos = window.gpsTracker.getPosition();

        if (pos) {
            if (text) {
                text.textContent = pos.formatted;
            }

            // Update header mini map
            if (headerMapImg) {
                const mapUrl = window.gpsTracker.getMapImageUrl(16);
                if (mapUrl) {
                    headerMapImg.style.backgroundImage = `url("${mapUrl}")`;
                }
            }

            // Update panel mini map (if visible)
            if (miniMapImg) {
                const mapUrl = window.gpsTracker.getMapImageUrl(14);
                if (mapUrl) {
                    miniMapImg.style.backgroundImage = `url("${mapUrl}")`;
                }
            }
            if (miniMapCoords) {
                miniMapCoords.textContent = `${pos.latitude.toFixed(3)}, ${pos.longitude.toFixed(3)}`;
            }

            // ONLY update background if theme is explicitly 'map'
            // Don't override other themes!
            if (this.settings.theme === 'map') {
                const mapBg = document.getElementById('mapBackground');
                if (mapBg) {
                    const mapUrl = window.gpsTracker.getMapImageUrl(15);
                    if (mapUrl) {
                        mapBg.style.backgroundImage = `url("${mapUrl}")`;
                        mapBg.classList.add('has-location');
                    }
                }
            }
        } else {
            if (text) {
                const err = window.gpsTracker.getError();
                text.textContent = err || '--';
            }
            if (miniMapCoords) {
                miniMapCoords.textContent = '--';
            }
        }
    }

    // Publish full session state to localStorage for the Analysis page
    publishAnalysisState() {
        const state = {
            timestamp: Date.now(),
            mode: this._currentMode,
            context: window.aiComposer?.context,
            tempo: window.sequencer?.getTempo(),
            swing: window.sequencer?.swing,
            patternLength: window.sequencer?.getPatternLength(),
            pattern: window.sequencer?.getPattern(),
            trackSources: window.sequencer?.getTrackSources(),
            trackMutes: [...(window.sequencer?.trackMutes || [])],
            trackSolos: [...(window.sequencer?.trackSolos || [])],
            fx: window.mangleEngine?.getState(),
            mixer: {
                mic:     { level: +document.getElementById('faderMic')?.value || 80, muted: window.audioEngine?.isMuted('mic') },
                samples: { level: +document.getElementById('faderSamples')?.value || 80, muted: window.audioEngine?.isMuted('samples') },
                synth:   { level: +document.getElementById('faderSynth')?.value || 80, muted: window.audioEngine?.isMuted('synth') },
                radio:   { level: +document.getElementById('faderRadio')?.value || 80, muted: window.audioEngine?.isMuted('radio') },
                master:  +document.getElementById('faderMaster')?.value || 90
            },
            eq: {
                master:  window.audioEngine?.getEQ('master'),
                mic:     window.audioEngine?.getEQ('mic'),
                samples: window.audioEngine?.getEQ('samples'),
                synth:   window.audioEngine?.getEQ('synth'),
                radio:   window.audioEngine?.getEQ('radio')
            },
            synth: window.synth?.getState(),
            synthPlaying: window.synth?.isPlaying(),
            pads: Array.from({length: 8}, (_, i) => window.sampler?.getPadMeta(i)),
            currentKit: window.sampler?.currentBank,
            micActive: window.micInput?.isActive(),
            audio: {
                master:   window.audioEngine?.analyzeOutput(),
                channels: {
                    mic:     window.audioEngine?.analyzeChannel('mic'),
                    samples: window.audioEngine?.analyzeChannel('samples'),
                    synth:   window.audioEngine?.analyzeChannel('synth'),
                    radio:   window.audioEngine?.analyzeChannel('radio')
                }
            },
            scenes: window.sceneManager?.scenes,
            arrangement: window.arrangement?.blocks
        };
        try { localStorage.setItem('ohmyondas_analysis', JSON.stringify(state)); } catch(e) {}
    }
}

// Initialize on first interaction (or immediately in embedded mode)
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();

    const isEmbedded = new URLSearchParams(window.location.search).get('embedded') === '1';

    if (isEmbedded) {
        // In embedded mode, listen for first postMessage as init trigger
        const initOnMessage = (event) => {
            // Security: Only accept messages from same origin
            if (event.origin !== window.location.origin) return;
            if (event.data && event.data.type === 'mockup-control') {
                if (!window.app.initialized) window.app.init();
                window.removeEventListener('message', initOnMessage);
            }
        };
        window.addEventListener('message', initOnMessage);
        // Also init on direct click (user clicks inside the iframe)
        const autoInit = () => {
            if (!window.app.initialized) window.app.init();
            document.removeEventListener('click', autoInit);
            document.removeEventListener('touchstart', autoInit);
        };
        document.addEventListener('click', autoInit);
        document.addEventListener('touchstart', autoInit);
    } else {
        const autoInit = () => {
            window.app.init();
            document.removeEventListener('click', autoInit);
            document.removeEventListener('touchstart', autoInit);
        };
        document.addEventListener('click', autoInit);
        document.addEventListener('touchstart', autoInit);
    }
});
