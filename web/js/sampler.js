// Oh My Ondas - Sample Player (8 pads)

class Sampler {
    constructor() {
        this.samples = new Map(); // pad index -> AudioBuffer
        this.activeSources = new Map(); // pad index -> currently playing source
        this.banks = {
            kit1: [
                { name: 'kick', url: 'samples/kick.wav' },
                { name: 'snare', url: 'samples/snare.wav' },
                { name: 'hihat', url: 'samples/hihat.wav' },
                { name: 'clap', url: 'samples/clap.wav' },
                { name: 'tom', url: 'samples/tom.wav' },
                { name: 'rim', url: 'samples/rim.wav' },
                { name: 'shaker', url: 'samples/shaker.wav' },
                { name: 'cowbell', url: 'samples/cowbell.wav' }
            ],
            kit2: [
                { name: 'texture1', url: 'samples/texture1.wav' },
                { name: 'texture2', url: 'samples/texture2.wav' },
                { name: 'texture3', url: 'samples/texture3.wav' },
                { name: 'texture4', url: 'samples/texture4.wav' },
                { name: 'drone1', url: 'samples/drone1.wav' },
                { name: 'drone2', url: 'samples/drone2.wav' },
                { name: 'noise1', url: 'samples/noise1.wav' },
                { name: 'noise2', url: 'samples/noise2.wav' }
            ],
            kit3: [
                { name: 'tone1', url: 'samples/tone1.wav' },
                { name: 'tone2', url: 'samples/tone2.wav' },
                { name: 'tone3', url: 'samples/tone3.wav' },
                { name: 'tone4', url: 'samples/tone4.wav' },
                { name: 'chord1', url: 'samples/chord1.wav' },
                { name: 'chord2', url: 'samples/chord2.wav' },
                { name: 'bass1', url: 'samples/bass1.wav' },
                { name: 'bass2', url: 'samples/bass2.wav' }
            ]
        };
        this.currentBank = 'kit1';
        this.initialized = false;
    }

    async init() {
        // Generate default samples if files don't exist
        await this.generateDefaultSamples();
        this.initialized = true;
        console.log('Sampler initialized with generated samples');
        return true;
    }

    async generateDefaultSamples() {
        const ctx = window.audioEngine.getContext();
        if (!ctx) return;

        // Generate 8 unique synthesized samples
        const generators = [
            this.generateKick.bind(this),
            this.generateSnare.bind(this),
            this.generateHihat.bind(this),
            this.generateClap.bind(this),
            this.generateTom.bind(this),
            this.generateRim.bind(this),
            this.generateShaker.bind(this),
            this.generateCowbell.bind(this)
        ];

        for (let i = 0; i < 8; i++) {
            const buffer = generators[i](ctx);
            this.samples.set(i, buffer);
        }
    }

    // Sample generators - LOUD versions
    generateKick(ctx) {
        const duration = 0.5;
        const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < data.length; i++) {
            const t = i / ctx.sampleRate;
            const freq = 150 * Math.exp(-t * 10);
            const env = Math.exp(-t * 5);
            data[i] = Math.sin(2 * Math.PI * freq * t) * env * 0.9;
        }
        return buffer;
    }

    generateSnare(ctx) {
        const duration = 0.3;
        const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < data.length; i++) {
            const t = i / ctx.sampleRate;
            const noise = (Math.random() * 2 - 1) * Math.exp(-t * 15);
            const tone = Math.sin(2 * Math.PI * 180 * t) * Math.exp(-t * 20);
            data[i] = (noise * 0.7 + tone * 0.3) * 0.9;
        }
        return buffer;
    }

    generateHihat(ctx) {
        const duration = 0.15;
        const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < data.length; i++) {
            const t = i / ctx.sampleRate;
            const env = Math.exp(-t * 40);
            data[i] = (Math.random() * 2 - 1) * env * 0.8;
        }
        return buffer;
    }

    generateClap(ctx) {
        const duration = 0.25;
        const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < data.length; i++) {
            const t = i / ctx.sampleRate;
            // Multiple bursts
            let env = 0;
            for (let b = 0; b < 4; b++) {
                const bt = t - b * 0.01;
                if (bt > 0) {
                    env += Math.exp(-bt * 50) * (1 - b * 0.2);
                }
            }
            data[i] = (Math.random() * 2 - 1) * env * 0.9;
        }
        return buffer;
    }

    generateTom(ctx) {
        const duration = 0.5;
        const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < data.length; i++) {
            const t = i / ctx.sampleRate;
            const freq = 100 * Math.exp(-t * 5);
            const env = Math.exp(-t * 6);
            data[i] = Math.sin(2 * Math.PI * freq * t) * env * 0.9;
        }
        return buffer;
    }

    generateRim(ctx) {
        const duration = 0.1;
        const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < data.length; i++) {
            const t = i / ctx.sampleRate;
            const env = Math.exp(-t * 80);
            const tone = Math.sin(2 * Math.PI * 800 * t);
            data[i] = tone * env * 0.9;
        }
        return buffer;
    }

    generateShaker(ctx) {
        const duration = 0.2;
        const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < data.length; i++) {
            const t = i / ctx.sampleRate;
            const env = Math.sin(Math.PI * t / duration);
            data[i] = (Math.random() * 2 - 1) * env * 0.8;
        }
        return buffer;
    }

    generateCowbell(ctx) {
        const duration = 0.3;
        const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < data.length; i++) {
            const t = i / ctx.sampleRate;
            const env = Math.exp(-t * 10);
            const tone1 = Math.sin(2 * Math.PI * 587 * t);
            const tone2 = Math.sin(2 * Math.PI * 845 * t);
            data[i] = (tone1 + tone2 * 0.6) * env * 0.8;
        }
        return buffer;
    }

    trigger(padIndex) {
        const ctx = window.audioEngine.getContext();
        if (!ctx || !this.initialized) {
            console.warn('Sampler not ready:', { ctx: !!ctx, init: this.initialized });
            return;
        }

        const buffer = this.samples.get(padIndex);
        if (!buffer) {
            console.warn('No buffer for pad:', padIndex);
            return;
        }

        // Stop any currently playing sample on this pad
        this.stopPad(padIndex);

        // Create and play new source
        const source = ctx.createBufferSource();
        source.buffer = buffer;

        // Connect to samples channel
        window.audioEngine.connectToChannel(source, 'samples');

        source.start();
        this.activeSources.set(padIndex, source);
        console.log('Triggered pad:', padIndex, 'buffer duration:', buffer.duration);

        // Clean up when done
        source.onended = () => {
            this.activeSources.delete(padIndex);
        };
    }

    stopPad(padIndex) {
        const source = this.activeSources.get(padIndex);
        if (source) {
            try {
                source.stop();
            } catch (e) {
                // Already stopped
            }
            this.activeSources.delete(padIndex);
        }
    }

    stopAll() {
        for (const [index, source] of this.activeSources) {
            try {
                source.stop();
            } catch (e) {}
        }
        this.activeSources.clear();
    }

    setBank(bankName) {
        if (this.banks[bankName]) {
            this.currentBank = bankName;
            // In a full implementation, would reload samples
            console.log('Switched to bank:', bankName);
        }
    }
}

// Global instance
window.sampler = new Sampler();
