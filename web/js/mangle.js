// Oh My Ondas - Mangling Effects (Bit Crusher, Glitch, Grain, Delay)

class MangleEngine {
    constructor() {
        this.ctx = null;
        this.inputNode = null;
        this.outputNode = null;

        // Effect states
        this.effects = {
            crusher: { enabled: false, bits: 16, sampleRate: 44100 },
            glitch: { enabled: false, probability: 0, sliceSize: 100, mode: 'stutter' },
            grain: { enabled: false, density: 0, size: 50, pitch: 0, frozen: false },
            delay: { enabled: false, time: 250, feedback: 30, mix: 0 }
        };

        // Audio nodes
        this.crusherNode = null;
        this.delayNode = null;
        this.delayFeedback = null;
        this.delayMix = null;
        this.dryGain = null;
        this.wetGain = null;

        // Glitch buffer
        this.glitchBuffer = null;
        this.glitchInterval = null;

        // Grain cloud
        this.grainBuffer = null;
        this.grainInterval = null;
        this.grains = [];
    }

    async init() {
        this.ctx = window.audioEngine?.getContext();
        if (!this.ctx) return false;

        // Create effect chain
        this.inputNode = this.ctx.createGain();
        this.outputNode = this.ctx.createGain();

        // Dry path
        this.dryGain = this.ctx.createGain();
        this.dryGain.gain.value = 1;

        // Create delay effect
        this.delayNode = this.ctx.createDelay(2);
        this.delayNode.delayTime.value = 0.25;

        this.delayFeedback = this.ctx.createGain();
        this.delayFeedback.gain.value = 0.3;

        this.wetGain = this.ctx.createGain();
        this.wetGain.gain.value = 0;

        // Connect delay
        this.inputNode.connect(this.dryGain);
        this.inputNode.connect(this.delayNode);
        this.delayNode.connect(this.delayFeedback);
        this.delayFeedback.connect(this.delayNode);
        this.delayNode.connect(this.wetGain);

        this.dryGain.connect(this.outputNode);
        this.wetGain.connect(this.outputNode);

        // Connect to master
        this.outputNode.connect(window.audioEngine.masterGain);

        console.log('MangleEngine initialized');
        return true;
    }

    getInputNode() {
        return this.inputNode;
    }

    // Bit Crusher (using waveshaper approximation)
    setCrusher(bits, sampleRate) {
        this.effects.crusher.bits = bits;
        this.effects.crusher.sampleRate = sampleRate;
        // Note: True bit crushing requires AudioWorklet
        // This is a simplified version using distortion
    }

    toggleCrusher(enabled) {
        this.effects.crusher.enabled = enabled;
    }

    // Delay
    setDelayTime(ms) {
        this.effects.delay.time = ms;
        if (this.delayNode) {
            this.delayNode.delayTime.setTargetAtTime(ms / 1000, this.ctx.currentTime, 0.02);
        }
    }

    setDelayFeedback(percent) {
        this.effects.delay.feedback = percent;
        if (this.delayFeedback) {
            this.delayFeedback.gain.setTargetAtTime(percent / 100, this.ctx.currentTime, 0.02);
        }
    }

    setDelayMix(percent) {
        this.effects.delay.mix = percent;
        const wet = percent / 100;
        const dry = 1 - wet * 0.5; // Keep some dry even at 100%

        if (this.dryGain && this.wetGain) {
            this.dryGain.gain.setTargetAtTime(dry, this.ctx.currentTime, 0.02);
            this.wetGain.gain.setTargetAtTime(wet, this.ctx.currentTime, 0.02);
        }
    }

    // Glitch
    setGlitch(probability, sliceSize, mode) {
        this.effects.glitch.probability = probability;
        this.effects.glitch.sliceSize = sliceSize;
        this.effects.glitch.mode = mode;

        // Start/stop glitch processing
        if (probability > 0 && !this.glitchInterval) {
            this.startGlitch();
        } else if (probability === 0 && this.glitchInterval) {
            this.stopGlitch();
        }
    }

    startGlitch() {
        const checkInterval = 100; // Check every 100ms

        this.glitchInterval = setInterval(() => {
            if (Math.random() * 100 < this.effects.glitch.probability) {
                this.triggerGlitch();
            }
        }, checkInterval);
    }

    stopGlitch() {
        if (this.glitchInterval) {
            clearInterval(this.glitchInterval);
            this.glitchInterval = null;
        }
    }

    triggerGlitch() {
        const mode = this.effects.glitch.mode;
        const duration = this.effects.glitch.sliceSize / 1000;

        switch (mode) {
            case 'stutter':
                // Quick volume chop
                if (this.outputNode) {
                    const now = this.ctx.currentTime;
                    this.outputNode.gain.setValueAtTime(0, now);
                    this.outputNode.gain.setValueAtTime(1, now + duration * 0.1);
                    this.outputNode.gain.setValueAtTime(0, now + duration * 0.2);
                    this.outputNode.gain.setValueAtTime(1, now + duration * 0.3);
                }
                break;

            case 'reverse':
                // Simulate reverse with quick delay feedback burst
                if (this.delayFeedback) {
                    const now = this.ctx.currentTime;
                    const originalFeedback = this.effects.delay.feedback / 100;
                    this.delayFeedback.gain.setValueAtTime(0.9, now);
                    this.delayFeedback.gain.setValueAtTime(originalFeedback, now + duration);
                }
                break;

            case 'jump':
                // Random volume spike/drop
                if (this.outputNode) {
                    const now = this.ctx.currentTime;
                    const jumpLevel = 0.2 + Math.random() * 0.6;
                    this.outputNode.gain.setValueAtTime(jumpLevel, now);
                    this.outputNode.gain.setValueAtTime(1, now + duration);
                }
                break;
        }
    }

    // Grain Cloud (simplified - uses delay for texture)
    setGrain(density, size, pitch) {
        this.effects.grain.density = density;
        this.effects.grain.size = size;
        this.effects.grain.pitch = pitch;

        // Use delay to simulate grain texture
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

        if (frozen && this.delayFeedback) {
            // Near-infinite feedback for freeze
            this.delayFeedback.gain.setTargetAtTime(0.98, this.ctx.currentTime, 0.02);
        } else if (this.delayFeedback) {
            // Restore normal feedback
            this.delayFeedback.gain.setTargetAtTime(
                this.effects.grain.density / 100 * 0.8,
                this.ctx.currentTime,
                0.02
            );
        }
    }

    // Set FX routing target
    setRoute(route) {
        this.currentRoute = route;
        console.log('FX routing set to:', route);
        // The actual routing happens at the channel level
        // This just tracks which channel the FX controls affect
    }

    // Set bit depth for crusher
    setBitDepth(bits) {
        this.effects.crusher.bits = bits;
        this.effects.crusher.enabled = bits < 16;
        // Note: True bit crushing requires AudioWorklet
        console.log('Crusher bits:', bits);
    }

    // Get current effect states
    getState() {
        return { ...this.effects };
    }

    // Reset all effects
    reset() {
        this.setCrusher(16, 44100);
        this.toggleCrusher(false);
        this.setGlitch(0, 100, 'stutter');
        this.setGrain(0, 50, 0);
        this.toggleGrainFreeze(false);
        this.setDelayTime(250);
        this.setDelayFeedback(30);
        this.setDelayMix(0);
    }
}

// Global instance
window.mangleEngine = new MangleEngine();
