// Oh My Ondas - Step Sequencer with P-Locks, Trig Conditions & Dub Mode

class Sequencer {
    constructor() {
        this.tracks = 8;
        this.steps = 16;
        this.maxSteps = 64;  // Maximum pattern length
        this.tempo = 120;
        this.playing = false;
        this.currentStep = 0;
        this.intervalId = null;
        this.swing = 0;  // Swing amount 0-100

        // Pattern slots (A-H = 0-7)
        this.patternSlots = [];
        this.currentPatternSlot = 0;
        for (let p = 0; p < 8; p++) {
            this.patternSlots[p] = this.createEmptyPattern();
        }

        // Current pattern reference
        this.pattern = this.patternSlots[0].tracks;

        // Source routing per track: sampler, radio, mic, synth
        this.trackSources = ['sampler', 'sampler', 'sampler', 'sampler',
                             'sampler', 'sampler', 'sampler', 'sampler'];

        // Track mute/solo state
        this.trackMutes = new Array(this.tracks).fill(false);
        this.trackSolos = new Array(this.tracks).fill(false);

        this.selectedTrack = 0;
        this.stepCallback = null;
        this.onPadTrigger = null;  // Callback for pad visual feedback
        this.onPatternChange = null;  // Callback when pattern changes

        // Playback counters for trig conditions
        this.playCount = 0;  // How many times pattern has looped
        this.fillMode = false;  // Fill mode active

        // Dub/Overdub mode
        this.dubMode = 'off';  // 'off', 'dub', 'overdub'
        this.dubBuffer = [];  // Buffer for real-time recording

        // Track play counters for nth-play conditions
        this.trackPlayCounts = new Array(this.tracks).fill(0);

        // Clipboard for copy/paste
        this.clipboard = null;

        // Undo/Redo history
        this.undoStack = [];
        this.redoStack = [];
        this.maxHistorySize = 50;
    }

    // Create empty pattern slot
    createEmptyPattern() {
        const tracks = [];
        for (let t = 0; t < this.tracks; t++) {
            tracks[t] = [];
            for (let s = 0; s < this.maxSteps; s++) {
                tracks[t][s] = this.createEmptyStep();
            }
        }
        return {
            tracks: tracks,
            length: 16,
            name: ''
        };
    }

    // Create empty step with all P-Lock and condition slots
    createEmptyStep() {
        return {
            active: false,
            probability: 100,
            velocity: 100,
            // P-Locks: parameter values locked per step (null = use track default)
            pLocks: {
                pitch: null,      // -24 to +24 semitones
                slice: null,      // 0-15 slice index
                filter: null,     // 0-100 filter cutoff
                decay: null,      // 0-100 decay time
                pan: null,        // -100 to +100
                delay: null,      // 0-100 delay send
                reverb: null,     // 0-100 reverb send
                grain: null       // 0-100 grain amount
            },
            // Trig Conditions
            trigCondition: {
                type: 'always',   // 'always', 'probability', 'fill', 'notFill', 'nth', 'neighbor'
                value: 100,       // Probability %, or nth count (1st, 2nd, 3rd...)
                neighborTrack: null  // For neighbor condition
            }
        };
    }

    init() {
        console.log('Sequencer initialized');
        return true;
    }

    // Euclidean rhythm generator
    generateEuclidean(hits, steps, rotation = 0) {
        if (hits > steps) hits = steps;
        if (hits <= 0) return new Array(steps).fill(false);

        const pattern = [];
        let bucket = 0;

        for (let i = 0; i < steps; i++) {
            bucket += hits;
            if (bucket >= steps) {
                bucket -= steps;
                pattern.push(true);
            } else {
                pattern.push(false);
            }
        }

        // Apply rotation
        const rotated = [];
        for (let i = 0; i < steps; i++) {
            rotated.push(pattern[(i + rotation) % steps]);
        }

        return rotated;
    }

    applyEuclidean(trackIndex, hits, steps, rotation = 0) {
        const rhythm = this.generateEuclidean(hits, steps, rotation);

        // Pad or trim to 16 steps
        for (let s = 0; s < this.steps; s++) {
            this.pattern[trackIndex][s].active = s < rhythm.length ? rhythm[s] : false;
        }

        console.log(`Applied Euclidean ${hits}/${steps} (rot ${rotation}) to track ${trackIndex}`);
    }

    setStep(trackIndex, stepIndex, active) {
        if (trackIndex >= 0 && trackIndex < this.tracks &&
            stepIndex >= 0 && stepIndex < this.steps) {
            this.pattern[trackIndex][stepIndex].active = active;
        }
    }

    toggleStep(trackIndex, stepIndex) {
        if (trackIndex >= 0 && trackIndex < this.tracks &&
            stepIndex >= 0 && stepIndex < this.steps) {
            this.pattern[trackIndex][stepIndex].active = !this.pattern[trackIndex][stepIndex].active;
            return this.pattern[trackIndex][stepIndex].active;
        }
        return false;
    }

    setStepProbability(trackIndex, stepIndex, probability) {
        if (trackIndex >= 0 && trackIndex < this.tracks &&
            stepIndex >= 0 && stepIndex < this.steps) {
            this.pattern[trackIndex][stepIndex].probability = probability;
        }
    }

    setTrackProbability(trackIndex, probability) {
        for (let s = 0; s < this.steps; s++) {
            this.pattern[trackIndex][s].probability = probability;
        }
    }

    clearTrack(trackIndex) {
        for (let s = 0; s < this.steps; s++) {
            this.pattern[trackIndex][s] = this.createEmptyStep();
        }
        this.trackPlayCounts[trackIndex] = 0;
    }

    randomizeTrack(trackIndex, density = 0.3) {
        for (let s = 0; s < this.steps; s++) {
            this.pattern[trackIndex][s].active = Math.random() < density;
        }
    }

    // Clear all pattern data
    clearAllTracks() {
        for (let t = 0; t < this.tracks; t++) {
            this.clearTrack(t);
        }
        this.resetPlayCounts();
    }

    setTempo(bpm) {
        this.tempo = Math.max(30, Math.min(300, bpm));
        if (this.playing) {
            this.stop();
            this.play();
        }
    }

    getTempo() {
        return this.tempo;
    }

    play() {
        if (this.playing) return;

        this.playing = true;
        this.currentStep = 0;

        const stepDuration = (60 / this.tempo) * 1000 / 4; // 16th notes

        this.intervalId = setInterval(() => {
            this.tick();
        }, stepDuration);

        console.log('Sequencer started at', this.tempo, 'BPM');
    }

    stop() {
        this.playing = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.currentStep = 0;

        if (this.stepCallback) {
            this.stepCallback(-1); // Signal stop
        }

        console.log('Sequencer stopped');
    }

    tick() {
        // Check if any track is soloed
        const hasSolo = this.trackSolos.some(s => s);

        // Trigger sounds for active steps (with trig conditions)
        for (let t = 0; t < this.tracks; t++) {
            // Skip muted tracks, or if solo mode, skip non-soloed tracks
            if (this.trackMutes[t]) continue;
            if (hasSolo && !this.trackSolos[t]) continue;

            const step = this.pattern[t][this.currentStep];
            if (step && step.active && this.shouldTrigger(step, t)) {
                // Trigger based on source routing with P-Locks applied
                const source = this.trackSources[t];
                this.triggerSource(source, t, step.pLocks, step.velocity);
            }
        }

        // Record in dub mode
        if (this.dubMode !== 'off') {
            this.processDubRecording();
        }

        // Notify UI
        if (this.stepCallback) {
            this.stepCallback(this.currentStep);
        }

        // Advance step (use current pattern length)
        const patternLength = this.getPatternLength();
        this.currentStep = (this.currentStep + 1) % patternLength;

        // Increment play count at pattern loop
        if (this.currentStep === 0) {
            this.playCount++;
            this.trackPlayCounts = this.trackPlayCounts.map(c => c + 1);
        }
    }

    // Check trig condition to determine if step should fire
    shouldTrigger(step, trackIndex) {
        const cond = step.trigCondition;

        switch (cond.type) {
            case 'always':
                return Math.random() * 100 < step.probability;

            case 'probability':
                return Math.random() * 100 < cond.value;

            case 'fill':
                return this.fillMode;

            case 'notFill':
                return !this.fillMode;

            case 'nth':
                // Only trigger on every Nth play (1st, 2nd, 3rd, etc.)
                return (this.trackPlayCounts[trackIndex] % cond.value) === 0;

            case 'neighbor':
                // Only trigger if neighbor track also triggered this step
                if (cond.neighborTrack !== null) {
                    const neighborStep = this.pattern[cond.neighborTrack][this.currentStep];
                    return neighborStep.active;
                }
                return true;

            default:
                return Math.random() * 100 < step.probability;
        }
    }

    // Set fill mode (typically held by button)
    setFillMode(active) {
        this.fillMode = active;
    }

    // Reset play counters (useful when switching patterns)
    resetPlayCounts() {
        this.playCount = 0;
        this.trackPlayCounts = new Array(this.tracks).fill(0);
    }

    triggerSource(source, trackIndex, pLocks = {}, velocity = 100) {
        // Apply P-Locks to the audio engine before triggering
        this.applyPLocks(pLocks);

        switch (source) {
            case 'sampler':
                if (window.sampler) {
                    window.sampler.trigger(trackIndex, {
                        pitch: pLocks.pitch,
                        slice: pLocks.slice,
                        velocity: velocity / 100
                    });
                    // Visual feedback for pads
                    if (this.onPadTrigger && trackIndex < 8) {
                        this.onPadTrigger(trackIndex);
                    }
                }
                break;
            case 'radio':
                if (window.radioPlayer?.isPlaying()) {
                    window.audioEngine.pulseChannel('radio', 0.1);
                }
                break;
            case 'mic':
                if (window.micInput?.isActive()) {
                    window.audioEngine.pulseChannel('mic', 0.1);
                }
                break;
            case 'synth':
                // Trigger synth note based on track (different frequencies)
                if (window.synth) {
                    const baseNotes = [110, 147, 165, 196, 220, 262, 330, 392]; // A2 to G4
                    let freq = baseNotes[trackIndex];
                    // Apply pitch P-Lock (semitones)
                    if (pLocks.pitch !== null) {
                        freq = freq * Math.pow(2, pLocks.pitch / 12);
                    }
                    window.synth.triggerNote(freq, 0.1);
                }
                break;
        }
    }

    // Apply P-Lock values to audio engines
    applyPLocks(pLocks) {
        if (!pLocks) return;

        if (pLocks.filter !== null && window.synth) {
            window.synth.setFilterCutoff(pLocks.filter * 80); // Scale to Hz
        }
        if (pLocks.delay !== null && window.mangleEngine) {
            window.mangleEngine.setDelayMix(pLocks.delay);
        }
        if (pLocks.reverb !== null && window.mangleEngine) {
            window.mangleEngine.setReverbMix?.(pLocks.reverb);
        }
        if (pLocks.grain !== null && window.mangleEngine) {
            window.mangleEngine.setGrain(pLocks.grain, 50, 0);
        }
    }

    // ===== P-LOCK METHODS =====

    // Set a P-Lock value for a specific step
    setPLock(trackIndex, stepIndex, param, value) {
        if (trackIndex >= 0 && trackIndex < this.tracks &&
            stepIndex >= 0 && stepIndex < this.steps) {
            const step = this.pattern[trackIndex][stepIndex];
            if (step.pLocks.hasOwnProperty(param)) {
                step.pLocks[param] = value;
                console.log(`P-Lock: Track ${trackIndex + 1}, Step ${stepIndex + 1}, ${param} = ${value}`);
            }
        }
    }

    // Clear a P-Lock for a specific step
    clearPLock(trackIndex, stepIndex, param) {
        this.setPLock(trackIndex, stepIndex, param, null);
    }

    // Clear all P-Locks for a step
    clearAllPLocks(trackIndex, stepIndex) {
        if (trackIndex >= 0 && trackIndex < this.tracks &&
            stepIndex >= 0 && stepIndex < this.steps) {
            const step = this.pattern[trackIndex][stepIndex];
            for (const param in step.pLocks) {
                step.pLocks[param] = null;
            }
        }
    }

    // Get P-Lock value for a step
    getPLock(trackIndex, stepIndex, param) {
        if (trackIndex >= 0 && trackIndex < this.tracks &&
            stepIndex >= 0 && stepIndex < this.steps) {
            return this.pattern[trackIndex][stepIndex].pLocks[param];
        }
        return null;
    }

    // Check if step has any P-Locks
    hasPLocks(trackIndex, stepIndex) {
        if (trackIndex >= 0 && trackIndex < this.tracks &&
            stepIndex >= 0 && stepIndex < this.steps) {
            const pLocks = this.pattern[trackIndex][stepIndex].pLocks;
            return Object.values(pLocks).some(v => v !== null);
        }
        return false;
    }

    // ===== TRIG CONDITION METHODS =====

    // Set trig condition for a step
    setTrigCondition(trackIndex, stepIndex, type, value = 100, neighborTrack = null) {
        if (trackIndex >= 0 && trackIndex < this.tracks &&
            stepIndex >= 0 && stepIndex < this.steps) {
            const step = this.pattern[trackIndex][stepIndex];
            step.trigCondition = { type, value, neighborTrack };
            console.log(`Trig Condition: Track ${trackIndex + 1}, Step ${stepIndex + 1}, ${type} (${value})`);
        }
    }

    // Get trig condition for a step
    getTrigCondition(trackIndex, stepIndex) {
        if (trackIndex >= 0 && trackIndex < this.tracks &&
            stepIndex >= 0 && stepIndex < this.steps) {
            return this.pattern[trackIndex][stepIndex].trigCondition;
        }
        return { type: 'always', value: 100, neighborTrack: null };
    }

    // ===== DUB/OVERDUB METHODS =====

    // Set dub mode: 'off', 'dub', 'overdub'
    setDubMode(mode) {
        this.dubMode = mode;
        if (mode !== 'off') {
            this.dubBuffer = [];
        }
        console.log(`Dub mode: ${mode}`);
    }

    getDubMode() {
        return this.dubMode;
    }

    // Record a trigger in dub mode (called from UI when pad is pressed)
    recordDubTrigger(trackIndex, pLocks = {}, velocity = 100) {
        if (this.dubMode === 'off' || !this.playing) return;

        const step = this.pattern[trackIndex][this.currentStep];

        if (this.dubMode === 'overdub' || !step.active) {
            // In overdub, always add; in dub, only add if step is empty
            step.active = true;
            step.velocity = velocity;

            // Copy P-Locks if provided
            for (const param in pLocks) {
                if (pLocks[param] !== null) {
                    step.pLocks[param] = pLocks[param];
                }
            }

            console.log(`Dub recorded: Track ${trackIndex + 1}, Step ${this.currentStep + 1}`);
        }
    }

    // Process dub recording (called each tick)
    processDubRecording() {
        // This can be extended to handle quantization, etc.
    }

    // Clear dub buffer
    clearDubBuffer() {
        this.dubBuffer = [];
    }

    isPlaying() {
        return this.playing;
    }

    getCurrentStep() {
        return this.currentStep;
    }

    getPattern() {
        return this.pattern;
    }

    getTrackPattern(trackIndex) {
        return this.pattern[trackIndex];
    }

    setSelectedTrack(trackIndex) {
        this.selectedTrack = trackIndex;
    }

    getSelectedTrack() {
        return this.selectedTrack;
    }

    onStep(callback) {
        this.stepCallback = callback;
    }

    // Source routing
    setTrackSource(trackIndex, source) {
        if (trackIndex >= 0 && trackIndex < this.tracks) {
            this.trackSources[trackIndex] = source;
            console.log(`Track ${trackIndex + 1} source: ${source}`);
        }
    }

    getTrackSource(trackIndex) {
        return this.trackSources[trackIndex] || 'sampler';
    }

    getTrackSources() {
        return [...this.trackSources];
    }

    // Generate pattern based on vibe
    generateVibePattern(vibe, density = 0.5, complexity = 0.5) {
        const patterns = {
            calm: () => {
                // Sparse, steady rhythms
                this.applyEuclidean(0, 4, 16, 0);  // Kick: 4 on floor
                this.clearTrack(1);                // No snare
                this.applyEuclidean(2, 2, 16, 0);  // HiHat sparse
                this.clearTrack(3);                // No clap
                this.clearTrack(4);
                this.clearTrack(5);
                this.applyEuclidean(6, 3, 16, 2);  // Shaker subtle
                this.clearTrack(7);
            },
            urban: () => {
                // Busy, syncopated
                this.applyEuclidean(0, 4, 16, 0);    // Kick steady
                this.applyEuclidean(1, 4, 16, 4);    // Snare backbeat
                this.applyEuclidean(2, 8, 16, 0);    // HiHat busy
                this.applyEuclidean(3, 3, 16, 2);    // Clap syncopated
                this.applyEuclidean(4, 2, 16, 6);    // Tom accents
                this.clearTrack(5);
                this.applyEuclidean(6, 5, 16, 1);    // Shaker groove
                this.applyEuclidean(7, 2, 16, 8);    // Cowbell accents
            },
            nature: () => {
                // Organic, irregular
                this.applyEuclidean(0, 3, 16, 0);    // Kick subtle
                this.clearTrack(1);
                this.applyEuclidean(2, 5, 16, 3);    // HiHat organic
                this.clearTrack(3);
                this.applyEuclidean(4, 2, 16, 5);    // Tom sporadic
                this.applyEuclidean(5, 3, 16, 7);    // Rim scattered
                this.applyEuclidean(6, 7, 16, 0);    // Shaker flowing
                this.clearTrack(7);
            },
            chaos: () => {
                // Maximum complexity
                this.applyEuclidean(0, 7, 16, Math.floor(Math.random() * 16));
                this.applyEuclidean(1, 5, 16, Math.floor(Math.random() * 16));
                this.applyEuclidean(2, 11, 16, Math.floor(Math.random() * 16));
                this.applyEuclidean(3, 7, 16, Math.floor(Math.random() * 16));
                this.applyEuclidean(4, 5, 16, Math.floor(Math.random() * 16));
                this.applyEuclidean(5, 9, 16, Math.floor(Math.random() * 16));
                this.applyEuclidean(6, 13, 16, Math.floor(Math.random() * 16));
                this.applyEuclidean(7, 3, 16, Math.floor(Math.random() * 16));
            }
        };

        if (patterns[vibe]) {
            patterns[vibe]();
        }

        // Apply density modifier
        const densityFactor = density / 100;
        for (let t = 0; t < this.tracks; t++) {
            for (let s = 0; s < this.steps; s++) {
                if (this.pattern[t][s].active && Math.random() > densityFactor) {
                    this.pattern[t][s].active = false;
                }
            }
        }

        // Apply complexity (probability variation)
        if (complexity > 50) {
            for (let t = 0; t < this.tracks; t++) {
                for (let s = 0; s < this.steps; s++) {
                    if (this.pattern[t][s].active) {
                        this.pattern[t][s].probability = 50 + Math.random() * 50;
                    }
                }
            }
        }

        console.log(`Generated ${vibe} pattern (density: ${density}%, complexity: ${complexity}%)`);
    }

    // Surprise pattern - completely random but musical
    generateSurprise() {
        const vibes = ['calm', 'urban', 'nature', 'chaos'];
        const vibe = vibes[Math.floor(Math.random() * vibes.length)];
        const density = 30 + Math.random() * 60;
        const complexity = 20 + Math.random() * 60;

        this.generateVibePattern(vibe, density, complexity);

        // Random tempo
        this.setTempo(80 + Math.floor(Math.random() * 80));

        return { vibe, density, complexity, tempo: this.tempo };
    }

    // ===== PATTERN SLOT METHODS =====

    // Get current pattern length
    getPatternLength() {
        return this.patternSlots[this.currentPatternSlot]?.length || 16;
    }

    // Set pattern length
    setPatternLength(length) {
        this.saveHistory();
        length = Math.max(1, Math.min(this.maxSteps, length));
        this.patternSlots[this.currentPatternSlot].length = length;
        this.steps = length;
        console.log(`Pattern length set to ${length}`);
        if (this.onPatternChange) this.onPatternChange();
    }

    // Switch to pattern slot (0-7 = A-H)
    selectPattern(slotIndex) {
        if (slotIndex < 0 || slotIndex >= 8) return;
        this.currentPatternSlot = slotIndex;
        this.pattern = this.patternSlots[slotIndex].tracks;
        this.steps = this.patternSlots[slotIndex].length;
        this.currentStep = 0;
        console.log(`Selected pattern ${String.fromCharCode(65 + slotIndex)}`);
        if (this.onPatternChange) this.onPatternChange();
    }

    // Check if pattern slot has data
    patternHasData(slotIndex) {
        const slot = this.patternSlots[slotIndex];
        if (!slot) return false;
        for (let t = 0; t < this.tracks; t++) {
            for (let s = 0; s < slot.length; s++) {
                if (slot.tracks[t][s]?.active) return true;
            }
        }
        return false;
    }

    getCurrentPatternSlot() {
        return this.currentPatternSlot;
    }

    // ===== TRACK MUTE/SOLO METHODS =====

    toggleMute(trackIndex) {
        if (trackIndex >= 0 && trackIndex < this.tracks) {
            this.trackMutes[trackIndex] = !this.trackMutes[trackIndex];
            console.log(`Track ${trackIndex + 1} mute: ${this.trackMutes[trackIndex]}`);
            return this.trackMutes[trackIndex];
        }
        return false;
    }

    setMute(trackIndex, muted) {
        if (trackIndex >= 0 && trackIndex < this.tracks) {
            this.trackMutes[trackIndex] = muted;
        }
    }

    isMuted(trackIndex) {
        return this.trackMutes[trackIndex] || false;
    }

    toggleSolo(trackIndex) {
        if (trackIndex >= 0 && trackIndex < this.tracks) {
            this.trackSolos[trackIndex] = !this.trackSolos[trackIndex];
            console.log(`Track ${trackIndex + 1} solo: ${this.trackSolos[trackIndex]}`);
            return this.trackSolos[trackIndex];
        }
        return false;
    }

    setSolo(trackIndex, soloed) {
        if (trackIndex >= 0 && trackIndex < this.tracks) {
            this.trackSolos[trackIndex] = soloed;
        }
    }

    isSoloed(trackIndex) {
        return this.trackSolos[trackIndex] || false;
    }

    // ===== COPY/PASTE METHODS =====

    copyTrack(trackIndex) {
        if (trackIndex >= 0 && trackIndex < this.tracks) {
            // Deep copy the track data
            this.clipboard = {
                type: 'track',
                data: JSON.parse(JSON.stringify(this.pattern[trackIndex])),
                source: this.trackSources[trackIndex]
            };
            console.log(`Copied track ${trackIndex + 1}`);
            return true;
        }
        return false;
    }

    pasteTrack(trackIndex) {
        if (!this.clipboard || this.clipboard.type !== 'track') {
            console.log('No track in clipboard');
            return false;
        }
        if (trackIndex >= 0 && trackIndex < this.tracks) {
            this.saveHistory();
            this.pattern[trackIndex] = JSON.parse(JSON.stringify(this.clipboard.data));
            this.trackSources[trackIndex] = this.clipboard.source;
            console.log(`Pasted to track ${trackIndex + 1}`);
            if (this.onPatternChange) this.onPatternChange();
            return true;
        }
        return false;
    }

    // ===== UNDO/REDO METHODS =====

    saveHistory() {
        // Save current state to undo stack
        const state = {
            pattern: JSON.parse(JSON.stringify(this.pattern)),
            sources: [...this.trackSources],
            length: this.steps
        };
        this.undoStack.push(state);
        if (this.undoStack.length > this.maxHistorySize) {
            this.undoStack.shift();
        }
        // Clear redo stack on new action
        this.redoStack = [];
    }

    undo() {
        if (this.undoStack.length === 0) {
            console.log('Nothing to undo');
            return false;
        }
        // Save current state to redo stack
        const currentState = {
            pattern: JSON.parse(JSON.stringify(this.pattern)),
            sources: [...this.trackSources],
            length: this.steps
        };
        this.redoStack.push(currentState);

        // Restore previous state
        const state = this.undoStack.pop();
        this.pattern = state.pattern;
        this.patternSlots[this.currentPatternSlot].tracks = this.pattern;
        this.trackSources = state.sources;
        this.steps = state.length;
        this.patternSlots[this.currentPatternSlot].length = state.length;

        console.log('Undo');
        if (this.onPatternChange) this.onPatternChange();
        return true;
    }

    redo() {
        if (this.redoStack.length === 0) {
            console.log('Nothing to redo');
            return false;
        }
        // Save current state to undo stack
        const currentState = {
            pattern: JSON.parse(JSON.stringify(this.pattern)),
            sources: [...this.trackSources],
            length: this.steps
        };
        this.undoStack.push(currentState);

        // Restore redo state
        const state = this.redoStack.pop();
        this.pattern = state.pattern;
        this.patternSlots[this.currentPatternSlot].tracks = this.pattern;
        this.trackSources = state.sources;
        this.steps = state.length;
        this.patternSlots[this.currentPatternSlot].length = state.length;

        console.log('Redo');
        if (this.onPatternChange) this.onPatternChange();
        return true;
    }

    canUndo() {
        return this.undoStack.length > 0;
    }

    canRedo() {
        return this.redoStack.length > 0;
    }

    // ===== SWING METHODS =====

    setSwing(amount) {
        this.swing = Math.max(0, Math.min(100, amount));
        console.log(`Swing set to ${this.swing}%`);
    }

    getSwing() {
        return this.swing;
    }
}

// Global instance
window.sequencer = new Sequencer();
