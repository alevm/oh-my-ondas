// Oh My Ondas v2.5.2 - Main Application Controller
// escapeHtml is provided by utils.js (loaded first)

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
        } catch {
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
        window.sessionRecorder.onRecordingComplete = (_recording) => {
            console.log('Recording saved');
            this.updateRecordingsList();
            this.updateRecCount();
        };

        // Initialize MIDI I/O
        if (window.midiIO) {
            window.midiIO.init().then(() => {
                this.setupMidiSettings();
            });
        }

        // Setup preset sharing UI
        this.setupPresetShare();

        // Load preset from URL if present
        if (window.presetShare) {
            const urlPreset = window.presetShare.loadFromURL();
            if (urlPreset) {
                console.log('Loaded preset from URL:', urlPreset.name);
            }
        }

        // Apply saved settings
        this.applySettings();

        // Setup demo mode if active
        this.setupDemoMode();

        this.initialized = true;
        console.log('App v2.5.2 initialized');

        // Start onboarding walkthrough for first-time users
        if (window.onboarding) window.onboarding.init();
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

        const handleTap = (_btn) => {
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

}

// The app-*.js files add their methods to App with this
/* exported mixIntoApp */
function mixIntoApp(part) {
    for (const name of Object.getOwnPropertyNames(part.prototype)) {
        if (name === 'constructor') continue;
        Object.defineProperty(App.prototype, name, Object.getOwnPropertyDescriptor(part.prototype, name));
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
