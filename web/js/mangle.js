// Oh My Ondas - Mangling Effects Routing Manager
// Delegates FX processing to per-channel ChannelFX instances

class MangleEngine {
    constructor() {
        this.ctx = null;

        // Legacy audio nodes (kept for backward compat if ChannelFX unavailable)
        this.inputNode = null;
        this.outputNode = null;
        this.dryGain = null;
        this.delayNode = null;
        this.delayFeedback = null;
        this.wetGain = null;
        this.glitchInterval = null;

        // Effect state tracking
        this.effects = {
            crusher: { enabled: false, bits: 16, sampleRate: 44100 },
            glitch: { enabled: false, probability: 0, sliceSize: 100, mode: 'stutter' },
            grain: { enabled: false, density: 0, size: 50, pitch: 0, frozen: false },
            delay: { enabled: false, time: 250, feedback: 30, mix: 0 }
        };

        // ChannelFX refs (populated in init)
        this.channelFxMap = {};
        this.masterFxRef = null;

        // Current routing target
        this.currentRoute = 'master';
    }

    async init() {
        this.ctx = window.audioEngine?.getContext();
        if (!this.ctx) return false;

        // Cache refs to all ChannelFX instances
        const ae = window.audioEngine;
        for (const name of ['mic', 'samples', 'synth', 'radio']) {
            const fx = ae.getChannelFX(name);
            if (fx) this.channelFxMap[name] = fx;
        }
        this.masterFxRef = ae.getMasterFX();

        // Legacy fallback: create own audio graph if no ChannelFX available
        if (!this.masterFxRef) {
            this.inputNode = this.ctx.createGain();
            this.outputNode = this.ctx.createGain();
            this.dryGain = this.ctx.createGain();
            this.dryGain.gain.value = 1;
            this.delayNode = this.ctx.createDelay(2);
            this.delayNode.delayTime.value = 0.25;
            this.delayFeedback = this.ctx.createGain();
            this.delayFeedback.gain.value = 0.3;
            this.wetGain = this.ctx.createGain();
            this.wetGain.gain.value = 0;

            this.inputNode.connect(this.dryGain);
            this.inputNode.connect(this.delayNode);
            this.delayNode.connect(this.delayFeedback);
            this.delayFeedback.connect(this.delayNode);
            this.delayNode.connect(this.wetGain);
            this.dryGain.connect(this.outputNode);
            this.wetGain.connect(this.outputNode);
            this.outputNode.connect(window.audioEngine.masterGain);
        }

        console.log('MangleEngine initialized (routing mode:',
            this.masterFxRef ? 'per-channel' : 'legacy', ')');
        return true;
    }

    // Get the ChannelFX target for current route
    _getTarget() {
        if (this.currentRoute === 'master' && this.masterFxRef) {
            return this.masterFxRef;
        }
        return this.channelFxMap[this.currentRoute] || this.masterFxRef || null;
    }

    getInputNode() {
        return this.inputNode;
    }

    // --- Routing ---

    setRoute(route) {
        this.currentRoute = route;
        console.log('FX routing set to:', route);
    }

    getRoute() {
        return this.currentRoute;
    }

    // --- Delay (routed) ---

    setDelayTime(ms) {
        this.effects.delay.time = ms;
        const target = this._getTarget();
        if (target) {
            target.setDelayTime(ms);
        } else if (this.delayNode) {
            this.delayNode.delayTime.setTargetAtTime(ms / 1000, this.ctx.currentTime, 0.02);
        }
    }

    setDelayFeedback(percent) {
        this.effects.delay.feedback = percent;
        const target = this._getTarget();
        if (target) {
            target.setDelayFeedback(percent);
        } else if (this.delayFeedback) {
            this.delayFeedback.gain.setTargetAtTime(percent / 100, this.ctx.currentTime, 0.02);
        }
    }

    setDelayMix(percent) {
        this.effects.delay.mix = percent;
        const target = this._getTarget();
        if (target) {
            target.setDelayMix(percent);
        } else if (this.dryGain && this.wetGain) {
            const wet = percent / 100;
            const dry = 1 - wet * 0.5;
            this.dryGain.gain.setTargetAtTime(dry, this.ctx.currentTime, 0.02);
            this.wetGain.gain.setTargetAtTime(wet, this.ctx.currentTime, 0.02);
        }
    }

    // --- Per-channel direct control ---

    setChannelDelayMix(channelName, percent) {
        const target = this.channelFxMap[channelName] || this.masterFxRef;
        if (target) target.setDelayMix(percent);
    }

    setChannelDelayTime(channelName, ms) {
        const target = this.channelFxMap[channelName] || this.masterFxRef;
        if (target) target.setDelayTime(ms);
    }

    setChannelDelayFeedback(channelName, percent) {
        const target = this.channelFxMap[channelName] || this.masterFxRef;
        if (target) target.setDelayFeedback(percent);
    }

    setChannelGlitch(channelName, probability, sliceSize, mode) {
        const target = this.channelFxMap[channelName] || this.masterFxRef;
        if (target) target.setGlitch(probability, sliceSize, mode);
    }

    setChannelGrain(channelName, density, size, pitch) {
        const target = this.channelFxMap[channelName] || this.masterFxRef;
        if (target) target.setGrain(density, size, pitch);
    }

    // --- Glitch (routed) ---

    setGlitch(probability, sliceSize, mode) {
        this.effects.glitch.probability = probability;
        this.effects.glitch.sliceSize = sliceSize;
        this.effects.glitch.mode = mode;

        const target = this._getTarget();
        if (target) {
            target.setGlitch(probability, sliceSize, mode);
        }
    }

    // --- Grain (routed) ---

    setGrain(density, size, pitch) {
        this.effects.grain.density = density;
        this.effects.grain.size = size;
        this.effects.grain.pitch = pitch;

        const target = this._getTarget();
        if (target) {
            target.setGrain(density, size, pitch);
        }
    }

    toggleGrainFreeze(frozen) {
        this.effects.grain.frozen = frozen;
        const target = this._getTarget();
        if (target) {
            target.toggleGrainFreeze(frozen);
        }
    }

    // --- Crusher (state tracking only) ---

    setCrusher(bits, sampleRate) {
        this.effects.crusher.bits = bits;
        this.effects.crusher.sampleRate = sampleRate;
    }

    toggleCrusher(enabled) {
        this.effects.crusher.enabled = enabled;
    }

    setBitDepth(bits) {
        this.effects.crusher.bits = bits;
        this.effects.crusher.enabled = bits < 16;
    }

    // --- State ---

    getState() {
        return { ...this.effects };
    }

    // Get all per-channel FX states
    getAllChannelStates() {
        const states = {};
        for (const [name, fx] of Object.entries(this.channelFxMap)) {
            states[name] = fx.getState();
        }
        if (this.masterFxRef) {
            states.master = this.masterFxRef.getState();
        }
        return states;
    }

    // Restore all per-channel FX states
    setAllChannelStates(states) {
        if (!states) return;
        for (const [name, state] of Object.entries(states)) {
            if (name === 'master' && this.masterFxRef) {
                this.masterFxRef.setState(state);
            } else if (this.channelFxMap[name]) {
                this.channelFxMap[name].setState(state);
            }
        }
    }

    // --- Reverb (simulated via delay) ---

    setReverbMix(percent) {
        // Simulate reverb using delay with specific settings
        // Short delay time + high feedback = reverb-like diffusion
        const target = this._getTarget();
        if (!target) return;

        if (percent > 0) {
            // Store current delay state if not already saved
            if (!this._savedReverbState) {
                this._savedReverbState = {
                    time: this.effects.delay.time,
                    feedback: this.effects.delay.feedback,
                    mix: this.effects.delay.mix
                };
            }

            // Configure delay for reverb-like sound:
            // - Short delay time (30-80ms) for early reflections
            // - High feedback (60-80%) for decay tail
            // - Mix based on reverb amount
            const reverbTime = 50 + (percent / 100) * 30; // 50-80ms
            const reverbFeedback = 50 + (percent / 100) * 30; // 50-80%

            target.setDelayTime(reverbTime);
            target.setDelayFeedback(reverbFeedback);
            target.setDelayMix(percent * 0.6); // Scale down mix slightly
        } else {
            // Restore original delay settings
            if (this._savedReverbState) {
                target.setDelayTime(this._savedReverbState.time);
                target.setDelayFeedback(this._savedReverbState.feedback);
                target.setDelayMix(this._savedReverbState.mix);
                this._savedReverbState = null;
            }
        }
    }

    // --- Punch FX (momentary effects) ---

    // Reverse effect - uses glitch in reverse mode at 100% probability
    setReverse(enabled) {
        if (enabled) {
            // Store current glitch state
            this._savedGlitchState = { ...this.effects.glitch };
            this.setGlitch(100, 150, 'reverse');
        } else {
            // Restore original glitch state
            if (this._savedGlitchState) {
                this.setGlitch(
                    this._savedGlitchState.probability || 0,
                    this._savedGlitchState.sliceSize || 100,
                    this._savedGlitchState.mode || 'stutter'
                );
            } else {
                this.setGlitch(0, 100, 'stutter');
            }
        }
    }

    // Filter sweep - controls synth filter or master filter
    setFilterSweep(enabled, lowHz = 200, highHz = 8000) {
        if (!this.ctx) return;

        if (enabled) {
            // Create filter if not exists
            if (!this._punchFilter) {
                this._punchFilter = this.ctx.createBiquadFilter();
                this._punchFilter.type = 'lowpass';
                this._punchFilter.frequency.value = highHz;
                this._punchFilter.Q.value = 2;

                // Insert into master chain if possible
                if (window.audioEngine?.masterGain) {
                    const masterGain = window.audioEngine.masterGain;
                    const dest = masterGain.context.destination;
                    masterGain.disconnect();
                    masterGain.connect(this._punchFilter);
                    this._punchFilter.connect(dest);
                    this._filterInserted = true;
                }
            }
            // Sweep down
            this._punchFilter.frequency.setTargetAtTime(lowHz, this.ctx.currentTime, 0.05);
        } else {
            // Sweep back up
            if (this._punchFilter) {
                this._punchFilter.frequency.setTargetAtTime(highHz, this.ctx.currentTime, 0.1);
            }
        }
    }

    // Tape stop effect - simulates slowing down via delay time ramp
    setTapeStop(enabled) {
        if (!this.ctx) return;

        const target = this._getTarget();
        if (!target) return;

        if (enabled) {
            // Store current delay state
            this._savedDelayState = { ...this.effects.delay };

            // Ramp delay time up to simulate slowing down
            const now = this.ctx.currentTime;
            if (target.delayNode) {
                target.delayNode.delayTime.cancelScheduledValues(now);
                target.delayNode.delayTime.setValueAtTime(target.delayNode.delayTime.value, now);
                target.delayNode.delayTime.linearRampToValueAtTime(0.5, now + 0.3);
            }
            // Also reduce output for tape stop feel
            if (target.outputNode) {
                target.outputNode.gain.setTargetAtTime(0.3, now, 0.1);
            }
        } else {
            // Restore normal
            const now = this.ctx.currentTime;
            if (target.delayNode && this._savedDelayState) {
                target.delayNode.delayTime.cancelScheduledValues(now);
                target.delayNode.delayTime.setTargetAtTime(
                    this._savedDelayState.time / 1000 || 0.25,
                    now, 0.1
                );
            }
            if (target.outputNode) {
                target.outputNode.gain.setTargetAtTime(1, now, 0.05);
            }
        }
    }

    // --- Reset ---

    reset() {
        this.effects = {
            crusher: { enabled: false, bits: 16, sampleRate: 44100 },
            glitch: { enabled: false, probability: 0, sliceSize: 100, mode: 'stutter' },
            grain: { enabled: false, density: 0, size: 50, pitch: 0, frozen: false },
            delay: { enabled: false, time: 250, feedback: 30, mix: 0 }
        };

        // Reset all ChannelFX instances
        for (const fx of Object.values(this.channelFxMap)) {
            fx.reset();
        }
        if (this.masterFxRef) this.masterFxRef.reset();
    }
}

// Global instance
window.mangleEngine = new MangleEngine();
