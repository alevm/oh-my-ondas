// Oh My Ondas - Enhanced Synthesizer
// Features: Dual Oscillators, Filter, LFO, Unison, Portamento

class Synth {
    constructor() {
        // Audio nodes
        this.oscillators = [];
        this.noiseNode = null;
        this.noiseGain = null;
        this.filter = null;
        this.masterGain = null;
        this.lfo = null;
        this.lfoGain = null;
        this.analyser = null;

        this.playing = false;
        this.lastFrequency = 220;

        // Oscillator 1 params
        this.osc1 = {
            waveform: 'sine',
            enabled: true
        };

        // Oscillator 2 params
        this.osc2 = {
            waveform: 'triangle',
            enabled: true,
            detune: 7  // cents
        };

        // Pitch params
        this.pitch = {
            octave: 0,      // -2 to +2
            fine: 0,        // cents
            glide: 0        // ms
        };

        // Filter params
        this.filterParams = {
            type: 'lowpass',
            cutoff: 2000,
            resonance: 1
        };

        // LFO params
        this.lfoParams = {
            rate: 0,
            depth: 0,
            target: 'pitch'  // 'pitch', 'filter', 'amp'
        };

        // Unison params
        this.unison = {
            voices: 1,
            spread: 10  // cents
        };

        // ADSR envelope (in milliseconds, sustain is 0-100%)
        this.adsr = {
            attack: 10,
            decay: 100,
            sustain: 70,
            release: 200
        };

        // Noise
        this.noiseLevel = 0;
        this.noiseBuffer = null;

        // Presets storage
        this.presets = [];
    }

    async init() {
        const ctx = window.audioEngine?.getContext();
        if (!ctx) return false;

        // Pre-generate noise buffer
        this.generateNoiseBuffer(ctx);

        console.log('Enhanced Synth initialized');
        return true;
    }

    generateNoiseBuffer(ctx) {
        const bufferSize = ctx.sampleRate * 2;
        this.noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
    }

    // Calculate frequency with octave and fine tune
    getFrequency(baseFreq) {
        const octaveMultiplier = Math.pow(2, this.pitch.octave);
        const fineMultiplier = Math.pow(2, this.pitch.fine / 1200);
        return baseFreq * octaveMultiplier * fineMultiplier;
    }

    start() {
        if (this.playing) return;

        const ctx = window.audioEngine?.getContext();
        if (!ctx) return;

        const baseFreq = this.getFrequency(this.lastFrequency);

        // Create master gain
        this.masterGain = ctx.createGain();
        this.masterGain.gain.value = 0.5;

        // Create filter
        this.filter = ctx.createBiquadFilter();
        this.filter.type = this.filterParams.type;
        this.filter.frequency.value = this.filterParams.cutoff;
        this.filter.Q.value = this.filterParams.resonance;

        // Create analyser for oscilloscope
        this.analyser = ctx.createAnalyser();
        this.analyser.fftSize = 256;

        // Create oscillators based on unison voices
        this.oscillators = [];
        const voiceCount = this.unison.voices;
        const spreadCents = this.unison.spread;

        for (let v = 0; v < voiceCount; v++) {
            // Calculate detune for this voice
            let voiceDetune = 0;
            if (voiceCount > 1) {
                voiceDetune = (v / (voiceCount - 1) - 0.5) * spreadCents * 2;
            }

            // OSC1
            if (this.osc1.enabled) {
                const osc1 = ctx.createOscillator();
                osc1.type = this.osc1.waveform;
                osc1.frequency.value = baseFreq;
                osc1.detune.value = voiceDetune;

                const gain1 = ctx.createGain();
                gain1.gain.value = 0.5 / voiceCount;

                osc1.connect(gain1);
                gain1.connect(this.filter);
                osc1.start();

                this.oscillators.push({ osc: osc1, gain: gain1, type: 'osc1' });
            }

            // OSC2
            if (this.osc2.enabled) {
                const osc2 = ctx.createOscillator();
                osc2.type = this.osc2.waveform;
                osc2.frequency.value = baseFreq;
                osc2.detune.value = this.osc2.detune + voiceDetune;

                const gain2 = ctx.createGain();
                gain2.gain.value = 0.4 / voiceCount;

                osc2.connect(gain2);
                gain2.connect(this.filter);
                osc2.start();

                this.oscillators.push({ osc: osc2, gain: gain2, type: 'osc2' });
            }
        }

        // Create noise source
        if (this.noiseBuffer) {
            this.noiseNode = ctx.createBufferSource();
            this.noiseNode.buffer = this.noiseBuffer;
            this.noiseNode.loop = true;

            this.noiseGain = ctx.createGain();
            this.noiseGain.gain.value = this.noiseLevel / 100;

            this.noiseNode.connect(this.noiseGain);
            this.noiseGain.connect(this.filter);
            this.noiseNode.start();
        }

        // Create LFO
        this.lfo = ctx.createOscillator();
        this.lfo.type = 'sine';
        this.lfo.frequency.value = this.lfoParams.rate;

        this.lfoGain = ctx.createGain();
        this.lfoGain.gain.value = this.lfoParams.depth;

        this.lfo.connect(this.lfoGain);
        this.connectLFO();
        this.lfo.start();

        // Connect chain
        this.filter.connect(this.masterGain);
        this.masterGain.connect(this.analyser);
        window.audioEngine.connectToChannel(this.analyser, 'synth');

        this.playing = true;
    }

    connectLFO() {
        if (!this.lfoGain) return;

        // Disconnect existing connections
        try { this.lfoGain.disconnect(); } catch(e) {}

        const ctx = window.audioEngine?.getContext();
        if (!ctx) return;

        switch (this.lfoParams.target) {
            case 'pitch':
                // Modulate frequency of all oscillators
                this.oscillators.forEach(({ osc }) => {
                    this.lfoGain.connect(osc.frequency);
                });
                this.lfoGain.gain.value = this.lfoParams.depth * 10;  // Hz variation
                break;
            case 'filter':
                this.lfoGain.connect(this.filter.frequency);
                this.lfoGain.gain.value = this.lfoParams.depth * 50;  // Hz variation
                break;
            case 'amp':
                this.lfoGain.connect(this.masterGain.gain);
                this.lfoGain.gain.value = this.lfoParams.depth / 200;  // Subtle
                break;
        }
    }

    stop() {
        if (!this.playing) return;

        try {
            this.oscillators.forEach(({ osc, gain }) => {
                osc.stop();
                osc.disconnect();
                gain.disconnect();
            });
            this.oscillators = [];

            if (this.noiseNode) {
                this.noiseNode.stop();
                this.noiseNode.disconnect();
                this.noiseNode = null;
            }
            if (this.lfo) {
                this.lfo.stop();
                this.lfo.disconnect();
                this.lfo = null;
            }
            if (this.filter) {
                this.filter.disconnect();
                this.filter = null;
            }
            if (this.masterGain) {
                this.masterGain.disconnect();
                this.masterGain = null;
            }
            if (this.analyser) {
                this.analyser.disconnect();
                this.analyser = null;
            }
        } catch (e) {}

        this.playing = false;
    }

    toggle() {
        if (this.playing) {
            this.stop();
        } else {
            this.start();
        }
        return this.playing;
    }

    isPlaying() {
        return this.playing;
    }

    // Get analyser for oscilloscope
    getAnalyser() {
        return this.analyser;
    }

    // OSC1 waveform
    setOsc1Waveform(type) {
        this.osc1.waveform = type;
        this.oscillators.filter(o => o.type === 'osc1').forEach(({ osc }) => {
            osc.type = type;
        });
    }

    // OSC2 waveform
    setOsc2Waveform(type) {
        this.osc2.waveform = type;
        this.oscillators.filter(o => o.type === 'osc2').forEach(({ osc }) => {
            osc.type = type;
        });
    }

    // OSC2 detune
    setOsc2Detune(cents) {
        this.osc2.detune = cents;
        this.oscillators.filter(o => o.type === 'osc2').forEach(({ osc }) => {
            osc.detune.value = cents;
        });
    }

    // Pitch controls
    setOctave(oct) {
        this.pitch.octave = oct;
        this.updateAllFrequencies();
    }

    setFineTune(cents) {
        this.pitch.fine = cents;
        this.updateAllFrequencies();
    }

    setGlide(ms) {
        this.pitch.glide = ms;
    }

    updateAllFrequencies() {
        const freq = this.getFrequency(this.lastFrequency);
        const ctx = window.audioEngine?.getContext();
        if (!ctx) return;

        this.oscillators.forEach(({ osc }) => {
            osc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.02);
        });
    }

    setFrequency(freq) {
        this.lastFrequency = freq;
        const targetFreq = this.getFrequency(freq);
        const ctx = window.audioEngine?.getContext();
        if (!ctx) return;

        const glideTime = this.pitch.glide / 1000;
        this.oscillators.forEach(({ osc }) => {
            if (glideTime > 0) {
                osc.frequency.setTargetAtTime(targetFreq, ctx.currentTime, glideTime / 3);
            } else {
                osc.frequency.setTargetAtTime(targetFreq, ctx.currentTime, 0.02);
            }
        });
    }

    // Filter controls
    setFilterType(type) {
        this.filterParams.type = type;
        if (this.filter) {
            this.filter.type = type;
        }
    }

    setFilterCutoff(freq) {
        this.filterParams.cutoff = freq;
        if (this.filter) {
            const ctx = window.audioEngine?.getContext();
            this.filter.frequency.setTargetAtTime(freq, ctx.currentTime, 0.02);
        }
    }

    setFilterResonance(q) {
        this.filterParams.resonance = q;
        if (this.filter) {
            const ctx = window.audioEngine?.getContext();
            this.filter.Q.setTargetAtTime(q, ctx.currentTime, 0.02);
        }
    }

    // LFO controls
    setLFORate(rate) {
        this.lfoParams.rate = rate;
        if (this.lfo) {
            this.lfo.frequency.value = rate;
        }
    }

    setLFODepth(depth) {
        this.lfoParams.depth = depth;
        this.connectLFO();
    }

    setLFOTarget(target) {
        this.lfoParams.target = target;
        this.connectLFO();
    }

    // Unison controls
    setUnisonVoices(voices) {
        const wasPlaying = this.playing;
        if (wasPlaying) this.stop();
        this.unison.voices = voices;
        if (wasPlaying) this.start();
    }

    setUnisonSpread(cents) {
        this.unison.spread = cents;
        // Would need restart for full effect, but update existing detunes
        if (this.playing && this.unison.voices > 1) {
            const voices = this.unison.voices;
            let idx = 0;
            this.oscillators.forEach(({ osc, type }) => {
                const voiceIdx = Math.floor(idx / 2);
                const voiceDetune = (voiceIdx / (voices - 1) - 0.5) * cents * 2;
                if (type === 'osc1') {
                    osc.detune.value = voiceDetune;
                } else {
                    osc.detune.value = this.osc2.detune + voiceDetune;
                }
                idx++;
            });
        }
    }

    // Noise level
    setNoiseLevel(level) {
        this.noiseLevel = level;
        if (this.noiseGain) {
            const ctx = window.audioEngine?.getContext();
            this.noiseGain.gain.setTargetAtTime(level / 100, ctx.currentTime, 0.02);
        }
    }

    // ADSR setters
    setAttack(ms) { this.adsr.attack = ms; }
    setDecay(ms) { this.adsr.decay = ms; }
    setSustain(percent) { this.adsr.sustain = percent; }
    setRelease(ms) { this.adsr.release = ms; }
    getADSR() { return { ...this.adsr }; }

    // Trigger a note (for sequencer) with ADSR
    triggerNote(frequency, duration = null) {
        const ctx = window.audioEngine?.getContext();
        if (!ctx) return;

        const now = ctx.currentTime;
        const { attack, decay, sustain, release } = this.adsr;
        const targetFreq = this.getFrequency(frequency);

        const attackTime = attack / 1000;
        const decayTime = decay / 1000;
        const releaseTime = release / 1000;
        const sustainLevel = sustain / 100 * 0.5;
        const noteDuration = duration || (attackTime + decayTime + 0.1);

        // Create oscillators for the note
        const noteOscs = [];
        const noteGain = ctx.createGain();

        // Create filter for note
        const noteFilter = ctx.createBiquadFilter();
        noteFilter.type = this.filterParams.type;
        noteFilter.frequency.value = this.filterParams.cutoff;
        noteFilter.Q.value = this.filterParams.resonance;

        const voiceCount = this.unison.voices;
        const spreadCents = this.unison.spread;

        for (let v = 0; v < voiceCount; v++) {
            let voiceDetune = 0;
            if (voiceCount > 1) {
                voiceDetune = (v / (voiceCount - 1) - 0.5) * spreadCents * 2;
            }

            // OSC1
            const osc1 = ctx.createOscillator();
            osc1.type = this.osc1.waveform;
            osc1.frequency.value = targetFreq;
            osc1.detune.value = voiceDetune;
            osc1.connect(noteFilter);
            noteOscs.push(osc1);

            // OSC2
            const osc2 = ctx.createOscillator();
            osc2.type = this.osc2.waveform;
            osc2.frequency.value = targetFreq;
            osc2.detune.value = this.osc2.detune + voiceDetune;
            osc2.connect(noteFilter);
            noteOscs.push(osc2);
        }

        noteFilter.connect(noteGain);

        // ADSR envelope
        noteGain.gain.setValueAtTime(0.001, now);
        noteGain.gain.exponentialRampToValueAtTime(0.5 / voiceCount, now + attackTime);
        noteGain.gain.exponentialRampToValueAtTime(Math.max(0.001, sustainLevel / voiceCount), now + attackTime + decayTime);
        noteGain.gain.setValueAtTime(Math.max(0.001, sustainLevel / voiceCount), now + noteDuration);
        noteGain.gain.exponentialRampToValueAtTime(0.001, now + noteDuration + releaseTime);

        window.audioEngine.connectToChannel(noteGain, 'synth');

        noteOscs.forEach(osc => {
            osc.start(now);
            osc.stop(now + noteDuration + releaseTime + 0.05);
        });
    }

    // Preset management
    savePreset(name) {
        const preset = {
            name,
            osc1: { ...this.osc1 },
            osc2: { ...this.osc2 },
            pitch: { ...this.pitch },
            filter: { ...this.filterParams },
            lfo: { ...this.lfoParams },
            unison: { ...this.unison },
            adsr: { ...this.adsr },
            noiseLevel: this.noiseLevel
        };
        this.presets.push(preset);
        localStorage.setItem('synthPresets', JSON.stringify(this.presets));
        return preset;
    }

    loadPreset(preset) {
        if (typeof preset === 'number') {
            preset = this.presets[preset];
        }
        if (!preset) return false;

        this.osc1 = { ...preset.osc1 };
        this.osc2 = { ...preset.osc2 };
        this.pitch = { ...preset.pitch };
        this.filterParams = { ...preset.filter };
        this.lfoParams = { ...preset.lfo };
        this.unison = { ...preset.unison };
        this.adsr = { ...preset.adsr };
        this.noiseLevel = preset.noiseLevel || 0;

        // Restart synth if playing to apply changes
        if (this.playing) {
            this.stop();
            this.start();
        }

        return true;
    }

    getPresets() {
        return this.presets;
    }

    loadPresetsFromStorage() {
        const stored = localStorage.getItem('synthPresets');
        if (stored) {
            this.presets = JSON.parse(stored);
        }
    }

    // Get current state for UI
    getState() {
        return {
            osc1: this.osc1,
            osc2: this.osc2,
            pitch: this.pitch,
            filter: this.filterParams,
            lfo: this.lfoParams,
            unison: this.unison,
            adsr: this.adsr,
            noiseLevel: this.noiseLevel
        };
    }
}

// Global instance
window.synth = new Synth();
