// Oh My Ondas - Core Audio Engine
// Manages AudioContext, routing, and mixing

class AudioEngine {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.analyser = null;

        // Channel gains
        this.channels = {
            mic: { gain: null, level: 0.8, muted: false, eq: null },
            samples: { gain: null, level: 0.8, muted: false, eq: null },
            synth: { gain: null, level: 0.8, muted: false, eq: null },
            radio: { gain: null, level: 0.8, muted: false, eq: null }
        };

        // Master EQ
        this.masterEq = null;

        // Destination for recording
        this.recordingDestination = null;

        this.initialized = false;
    }

    async init() {
        if (this.initialized) return true;

        try {
            // Create audio context
            this.ctx = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 44100,
                latencyHint: 'interactive'
            });

            // Resume if suspended (iOS/Chrome requirement)
            if (this.ctx.state === 'suspended') {
                await this.ctx.resume();
            }

            // Double-check it's running
            console.log('AudioContext state:', this.ctx.state);
            if (this.ctx.state !== 'running') {
                // Try again with user gesture
                await this.ctx.resume();
                console.log('AudioContext state after resume:', this.ctx.state);
            }

            // Create master output chain
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = 0.9;

            // Analyser for metering
            this.analyser = this.ctx.createAnalyser();
            this.analyser.fftSize = 256;

            // Connect master chain
            this.masterGain.connect(this.analyser);
            this.analyser.connect(this.ctx.destination);

            // Create recording destination
            this.recordingDestination = this.ctx.createMediaStreamDestination();
            this.masterGain.connect(this.recordingDestination);

            // Create master EQ (before master gain)
            this.masterEq = this.createEQ();
            this.masterEq.output.connect(this.masterGain);

            // Create channel gains with per-channel EQ
            for (const name of Object.keys(this.channels)) {
                const channel = this.channels[name];
                channel.gain = this.ctx.createGain();
                channel.gain.gain.value = channel.level;

                // Create per-channel EQ
                channel.eq = this.createEQ();
                channel.gain.connect(channel.eq.input);
                channel.eq.output.connect(this.masterEq.input);

                // Create analyser for each channel
                channel.analyser = this.ctx.createAnalyser();
                channel.analyser.fftSize = 256;
                channel.gain.connect(channel.analyser);
            }

            this.initialized = true;
            console.log('AudioEngine initialized');
            return true;

        } catch (err) {
            console.error('AudioEngine init failed:', err);
            return false;
        }
    }

    getContext() {
        return this.ctx;
    }

    getChannelInput(channelName) {
        return this.channels[channelName]?.gain || null;
    }

    getRecordingStream() {
        return this.recordingDestination?.stream || null;
    }

    setChannelLevel(channelName, level) {
        const channel = this.channels[channelName];
        if (channel && channel.gain) {
            channel.level = level;
            if (!channel.muted) {
                channel.gain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.02);
            }
        }
    }

    setMasterLevel(level) {
        if (this.masterGain) {
            this.masterGain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.02);
        }
    }

    toggleMute(channelName) {
        const channel = this.channels[channelName];
        if (channel && channel.gain) {
            channel.muted = !channel.muted;
            const targetLevel = channel.muted ? 0 : channel.level;
            channel.gain.gain.setTargetAtTime(targetLevel, this.ctx.currentTime, 0.02);
            return channel.muted;
        }
        return false;
    }

    isMuted(channelName) {
        return this.channels[channelName]?.muted || false;
    }

    getMeterLevel(channelName) {
        let analyser;
        if (channelName === 'master') {
            analyser = this.analyser;
        } else {
            analyser = this.channels[channelName]?.analyser;
        }

        if (!analyser) return 0;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);

        // Calculate RMS
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / dataArray.length);

        // Normalize to 0-100
        return Math.min(100, (rms / 255) * 100 * 1.5);
    }

    // Utility: Create and connect a source to a channel
    connectToChannel(sourceNode, channelName) {
        const channelGain = this.getChannelInput(channelName);
        if (channelGain) {
            sourceNode.connect(channelGain);
        }
    }

    // Create a 3-band EQ
    createEQ() {
        const low = this.ctx.createBiquadFilter();
        low.type = 'lowshelf';
        low.frequency.value = 320;
        low.gain.value = 0;

        const mid = this.ctx.createBiquadFilter();
        mid.type = 'peaking';
        mid.frequency.value = 1000;
        mid.Q.value = 0.5;
        mid.gain.value = 0;

        const high = this.ctx.createBiquadFilter();
        high.type = 'highshelf';
        high.frequency.value = 3200;
        high.gain.value = 0;

        // Chain: input -> low -> mid -> high -> output
        low.connect(mid);
        mid.connect(high);

        return {
            input: low,
            output: high,
            low: low,
            mid: mid,
            high: high
        };
    }

    // Set EQ for a channel or master
    setEQ(target, band, value) {
        let eq;
        if (target === 'master') {
            eq = this.masterEq;
        } else {
            eq = this.channels[target]?.eq;
        }

        if (!eq) return;

        const filter = eq[band];
        if (filter) {
            filter.gain.setTargetAtTime(value, this.ctx.currentTime, 0.02);
        }
    }

    // Pulse a channel gain briefly (for rhythmic gating of continuous sources)
    pulseChannel(channelName, duration = 0.1) {
        const channel = this.channels[channelName];
        if (!channel || !channel.gain || !this.ctx) return;

        const now = this.ctx.currentTime;
        const gain = channel.gain.gain;

        // Store current level, briefly set to full, then restore
        const savedLevel = channel.muted ? 0 : channel.level;
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(channel.level, now);
        gain.setValueAtTime(0, now + duration);
        // Restore after pulse
        gain.setValueAtTime(savedLevel, now + duration + 0.005);
    }

    // Get current EQ values for a channel
    getEQ(target) {
        let eq;
        if (target === 'master') {
            eq = this.masterEq;
        } else {
            eq = this.channels[target]?.eq;
        }

        if (!eq) return { low: 0, mid: 0, high: 0 };

        return {
            low: eq.low.gain.value,
            mid: eq.mid.gain.value,
            high: eq.high.gain.value
        };
    }
}

// Global instance
window.audioEngine = new AudioEngine();
