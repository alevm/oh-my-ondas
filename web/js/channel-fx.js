// Oh My Ondas - Per-Channel FX (Delay, Glitch, Grain)
// Reusable class: one instance per channel + one master

class ChannelFX {
    constructor(ctx, name) {
        this.ctx = ctx;
        this.name = name;

        // Effect states
        this.effects = {
            delay: { time: 250, feedback: 30, mix: 0 },
            glitch: { probability: 0, sliceSize: 100, mode: 'stutter' },
            grain: { density: 0, size: 50, pitch: 0, frozen: false }
        };

        // Build audio graph
        this.inputNode = ctx.createGain();
        this.outputNode = ctx.createGain();

        // Dry path
        this.dryGain = ctx.createGain();
        this.dryGain.gain.value = 1;

        // Delay
        this.delayNode = ctx.createDelay(2);
        this.delayNode.delayTime.value = 0.25;

        this.delayFeedback = ctx.createGain();
        this.delayFeedback.gain.value = 0.3;

        this.wetGain = ctx.createGain();
        this.wetGain.gain.value = 0;

        // Connect: input -> dry -> output
        this.inputNode.connect(this.dryGain);
        this.dryGain.connect(this.outputNode);

        // Connect: input -> delay -> feedback loop -> wet -> output
        this.inputNode.connect(this.delayNode);
        this.delayNode.connect(this.delayFeedback);
        this.delayFeedback.connect(this.delayNode);
        this.delayNode.connect(this.wetGain);
        this.wetGain.connect(this.outputNode);

        // Glitch interval handle
        this.glitchInterval = null;
    }

    // --- Delay ---

    setDelayTime(ms) {
        this.effects.delay.time = ms;
        this.delayNode.delayTime.setTargetAtTime(ms / 1000, this.ctx.currentTime, 0.02);
    }

    setDelayFeedback(percent) {
        this.effects.delay.feedback = percent;
        this.delayFeedback.gain.setTargetAtTime(percent / 100, this.ctx.currentTime, 0.02);
    }

    setDelayMix(percent) {
        this.effects.delay.mix = percent;
        const wet = percent / 100;
        const dry = 1 - wet * 0.5;
        this.dryGain.gain.setTargetAtTime(dry, this.ctx.currentTime, 0.02);
        this.wetGain.gain.setTargetAtTime(wet, this.ctx.currentTime, 0.02);
    }

    // --- Glitch ---

    setGlitch(probability, sliceSize, mode) {
        this.effects.glitch.probability = probability;
        this.effects.glitch.sliceSize = sliceSize;
        this.effects.glitch.mode = mode;

        if (probability > 0 && !this.glitchInterval) {
            this._startGlitch();
        } else if (probability === 0 && this.glitchInterval) {
            this._stopGlitch();
        }
    }

    _startGlitch() {
        this.glitchInterval = setInterval(() => {
            if (Math.random() * 100 < this.effects.glitch.probability) {
                this._triggerGlitch();
            }
        }, 100);
    }

    _stopGlitch() {
        if (this.glitchInterval) {
            clearInterval(this.glitchInterval);
            this.glitchInterval = null;
        }
    }

    _triggerGlitch() {
        const mode = this.effects.glitch.mode;
        const duration = this.effects.glitch.sliceSize / 1000;
        const now = this.ctx.currentTime;

        switch (mode) {
            case 'stutter':
                this.outputNode.gain.setValueAtTime(0, now);
                this.outputNode.gain.setValueAtTime(1, now + duration * 0.1);
                this.outputNode.gain.setValueAtTime(0, now + duration * 0.2);
                this.outputNode.gain.setValueAtTime(1, now + duration * 0.3);
                break;
            case 'reverse':
                if (this.delayFeedback) {
                    const orig = this.effects.delay.feedback / 100;
                    this.delayFeedback.gain.setValueAtTime(0.9, now);
                    this.delayFeedback.gain.setValueAtTime(orig, now + duration);
                }
                break;
            case 'jump':
                this.outputNode.gain.setValueAtTime(0.2 + Math.random() * 0.6, now);
                this.outputNode.gain.setValueAtTime(1, now + duration);
                break;
        }
    }

    // --- Grain (simplified via delay texture) ---

    setGrain(density, size, pitch) {
        this.effects.grain.density = density;
        this.effects.grain.size = size;
        this.effects.grain.pitch = pitch;

        if (density > 0) {
            const delayTime = size / 1000;
            const feedback = Math.min(0.8, density / 100);
            this.delayNode.delayTime.setTargetAtTime(delayTime, this.ctx.currentTime, 0.02);
            this.delayFeedback.gain.setTargetAtTime(feedback, this.ctx.currentTime, 0.02);
            this.wetGain.gain.setTargetAtTime(density / 100, this.ctx.currentTime, 0.02);
        }
    }

    toggleGrainFreeze(frozen) {
        this.effects.grain.frozen = frozen;
        if (frozen) {
            this.delayFeedback.gain.setTargetAtTime(0.98, this.ctx.currentTime, 0.02);
        } else {
            this.delayFeedback.gain.setTargetAtTime(
                this.effects.grain.density / 100 * 0.8,
                this.ctx.currentTime, 0.02
            );
        }
    }

    // --- State ---

    getState() {
        return JSON.parse(JSON.stringify(this.effects));
    }

    setState(state) {
        if (!state) return;
        if (state.delay) {
            this.setDelayTime(state.delay.time);
            this.setDelayFeedback(state.delay.feedback);
            this.setDelayMix(state.delay.mix);
        }
        if (state.glitch) {
            this.setGlitch(state.glitch.probability, state.glitch.sliceSize, state.glitch.mode);
        }
        if (state.grain) {
            this.setGrain(state.grain.density, state.grain.size, state.grain.pitch);
            this.toggleGrainFreeze(state.grain.frozen);
        }
    }

    reset() {
        this.setDelayTime(250);
        this.setDelayFeedback(30);
        this.setDelayMix(0);
        this.setGlitch(0, 100, 'stutter');
        this.setGrain(0, 50, 0);
        this.toggleGrainFreeze(false);
    }

    destroy() {
        this._stopGlitch();
        try {
            this.inputNode.disconnect();
            this.dryGain.disconnect();
            this.delayNode.disconnect();
            this.delayFeedback.disconnect();
            this.wetGain.disconnect();
            this.outputNode.disconnect();
        } catch (e) {}
    }
}

window.ChannelFX = ChannelFX;
