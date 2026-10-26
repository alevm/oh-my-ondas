// Oh My Ondas - App: Embedded mode: the postMessage bridge from the hardware mockup, joystick
// Methods of App (js/app.js), split out by area; loaded right after app.js.

class AppBridge {
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
                case 'fader':
                    if (msg.data.channel && typeof msg.data.value === 'number') {
                        this.handleMockupFader(msg.data.channel, msg.data.value);
                    }
                    break;
                case 'crossfade':
                    if (typeof msg.data.value === 'number') {
                        this.handleMockupCrossfade(msg.data.value);
                    }
                    break;
                case 'button':
                    if (msg.data.action) {
                        this.handleMockupButton(msg.data.action);
                    }
                    break;
                case 'function':
                    if (msg.data.func) {
                        this.handleMockupFunction(msg.data.func);
                    }
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
            fx: { knobId: 'knobDelay', engineParam: 'delay', min: 0, max: 100 },
            decay: { knobId: 'knobDecay', engineParam: 'decay', min: 0, max: 100 },
            cutoff: { knobId: 'filterCutoff', engineParam: 'filter', min: 20, max: 8000 },
            resonance: { knobId: 'filterRes', engineParam: 'resonance', min: 0, max: 100 },
            attack: { knobId: 'envAttack', engineParam: 'attack', min: 0, max: 100 },
            release: { knobId: 'envRelease', engineParam: 'release', min: 0, max: 100 },
            delay: { knobId: 'knobDelay', engineParam: 'delay', min: 0, max: 100 },
            glitch: { knobId: null, engineParam: 'glitch', min: 0, max: 100 },
            grain: { knobId: null, engineParam: 'grain', min: 0, max: 100 },
            crush: { knobId: null, engineParam: 'crush', min: 0, max: 100 }
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
            case 'decay':
                window.audioEngine?.setDecay(value / 100);
                break;
            case 'resonance':
                window.synth?.setFilterResonance(scaled / 100);
                break;
            case 'attack':
                window.synth?.setEnvAttack(scaled / 100);
                break;
            case 'release':
                window.synth?.setEnvRelease(scaled / 100);
                break;
            case 'glitch':
                window.mangleEngine?.setGlitchAmount(value);
                break;
            case 'grain':
                window.mangleEngine?.setGrainSize(value);
                break;
            case 'crush':
                window.mangleEngine?.setBitCrush(value);
                break;
        }
    }

    // Handle mixer fader input from mockup
    handleMockupFader(channel, value) {
        const level = value / 100;
        switch (channel) {
            case 'mic':
                window.audioEngine?.setInputLevel(level);
                break;
            case 'sample':
                window.audioEngine?.setSamplerLevel(level);
                break;
            case 'synth':
                window.synth?.setLevel(level);
                break;
            case 'radio':
                window.radioEngine?.setLevel(level);
                break;
        }
    }

    // Handle crossfader input from mockup (0=A, 100=B)
    handleMockupCrossfade(value) {
        const mix = value / 100;
        window.audioEngine?.setCrossfade(mix);
    }

    // Handle navigation button input from mockup
    handleMockupButton(action) {
        switch (action) {
            case 'menu':
                // Toggle menu/settings panel
                this.switchToPanel('settings');
                break;
            case 'back':
                // Go back to main sequencer panel
                this.switchToPanel('sequencer');
                break;
            case 'shift':
                this._shiftPressed = !this._shiftPressed;
                break;
            case 'page':
                // Cycle through panels
                {
                    const panels = ['sequencer', 'mixer', 'synth', 'scene', 'ai', 'fx', 'radio'];
                    const current = panels.indexOf(this._activePanel) || 0;
                    const next = (current + 1) % panels.length;
                    this.switchToPanel(panels[next]);
                }
                break;
            case 'prev':
                // Previous pattern
                if (window.sequencer) {
                    const cur = window.sequencer.getCurrentPattern?.() || 0;
                    if (cur > 0) window.sequencer.selectPattern?.(cur - 1);
                }
                break;
            case 'next':
                // Next pattern
                if (window.sequencer) {
                    const cur = window.sequencer.getCurrentPattern?.() || 0;
                    window.sequencer.selectPattern?.(cur + 1);
                }
                break;
        }
    }

    // Handle function button input from mockup
    handleMockupFunction(func) {
        switch (func) {
            case 'dub':
                // Toggle dub/overdub mode
                if (window.sequencer) {
                    window.sequencer.toggleDub?.();
                }
                break;
            case 'fill':
                // Trigger pattern fill
                if (window.sequencer) {
                    window.sequencer.triggerFill?.();
                }
                break;
            case 'clr':
                // Clear current track/pattern
                if (window.sequencer) {
                    window.sequencer.clearCurrentTrack?.();
                }
                break;
            case 'scene':
                // Switch to scene view
                this.switchToPanel('scene');
                break;
            case 'bank':
                // Cycle sample banks
                if (window.audioEngine) {
                    const cur = window.audioEngine.getCurrentBank?.() || 0;
                    window.audioEngine.selectBank?.((cur + 1) % 4);
                }
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
}

mixIntoApp(AppBridge);
