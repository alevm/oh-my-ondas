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

    async captureToBuffer(durationMs = 3000) {
        if (!this.active || !this.micGain) return null;

        const ctx = window.audioEngine.getContext();
        if (!ctx) return null;

        try {
            const dest = ctx.createMediaStreamDestination();
            this.micGain.connect(dest);

            const recorder = new MediaRecorder(dest.stream, {
                mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : ''
            });
            const chunks = [];
            recorder.ondataavailable = e => chunks.push(e.data);

            return new Promise((resolve) => {
                recorder.onstop = async () => {
                    try {
                        this.micGain.disconnect(dest);
                    } catch (e) {}
                    // Re-connect mic to its channel (disconnect may have severed it)
                    window.audioEngine.connectToChannel(this.micGain, 'mic');
                    const blob = new Blob(chunks, { type: recorder.mimeType });
                    const arrayBuffer = await blob.arrayBuffer();
                    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
                    resolve(audioBuffer);
                };
                recorder.start();
                setTimeout(() => recorder.stop(), durationMs);
            });
        } catch (err) {
            console.error('Mic capture failed:', err);
            return null;
        }
    }

    async ensureActive() {
        if (!this.active) return this.init();
        return true;
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
