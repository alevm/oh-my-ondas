// Oh My Ondas - Microphone Input

class MicInput {
    constructor() {
        this.stream = null;
        this.sourceNode = null;
        this.active = false;
    }

    async init() {
        try {
            // Request microphone access
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            });

            const ctx = window.audioEngine.getContext();
            if (!ctx) {
                throw new Error('AudioEngine not initialized');
            }

            // Create source from stream
            this.sourceNode = ctx.createMediaStreamSource(this.stream);

            // Add a gain boost for the mic (often needed)
            this.micGain = ctx.createGain();
            this.micGain.gain.value = 3.0; // Boost mic signal significantly

            // Connect: source -> boost -> channel
            this.sourceNode.connect(this.micGain);
            window.audioEngine.connectToChannel(this.micGain, 'mic');

            this.active = true;
            console.log('Microphone initialized - stream active:', this.stream.active);
            console.log('Mic tracks:', this.stream.getAudioTracks().map(t => ({
                label: t.label,
                enabled: t.enabled,
                muted: t.muted,
                readyState: t.readyState
            })));

            // Verify connection
            console.log('Mic connected to channel. Check MIC meter and ensure M button is NOT active.');
            return true;

        } catch (err) {
            console.error('Microphone init failed:', err);
            return false;
        }
    }

    isActive() {
        return this.active;
    }

    stop() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        if (this.sourceNode) {
            this.sourceNode.disconnect();
            this.sourceNode = null;
        }
        if (this.micGain) {
            this.micGain.disconnect();
            this.micGain = null;
        }
        this.active = false;
    }
}

// Global instance
window.micInput = new MicInput();
