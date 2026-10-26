// Oh My Ondas - App: AI composer, analysis report, radio, mic capture
// Methods of App (js/app.js), split out by area; loaded right after app.js.

class AppAI {
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
        try { localStorage.setItem('ohmyondas_analysis', JSON.stringify(state)); } catch {}
    }
}

mixIntoApp(AppAI);
