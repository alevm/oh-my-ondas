// Oh My Ondas - Soundscape Analyzer
// Taps into mic channel to analyze the sonic environment

class SoundscapeAnalyzer {
    constructor() {
        this.analyzing = false;
        this.monitoring = false;
        this.monitorInterval = null;
        this.persistentAnalyser = null;
        this.latest = this._emptyResult();
        this.changeCallbacks = [];
        this.previousClassification = 'quiet';
    }

    // Start continuous monitoring of the mic channel
    startMonitoring(intervalMs = 5000) {
        if (this.monitoring) return;

        const ae = window.audioEngine;
        if (!ae?.ctx || !ae.channels.mic?.gain) {
            console.warn('SoundscapeAnalyzer: cannot start monitoring — no audio engine or mic channel');
            return;
        }

        // Ensure mic is active
        if (window.micInput && !window.micInput.isActive()) {
            window.micInput.ensureActive();
        }

        // Create persistent analyser node (parallel tap, non-destructive)
        this.persistentAnalyser = ae.ctx.createAnalyser();
        this.persistentAnalyser.fftSize = 2048;
        this.persistentAnalyser.smoothingTimeConstant = 0.3;
        ae.channels.mic.gain.connect(this.persistentAnalyser);

        this.monitoring = true;
        console.log(`SoundscapeAnalyzer: continuous monitoring started (${intervalMs}ms interval)`);

        // Run first tick immediately, then on interval
        this._monitorTick();
        this.monitorInterval = setInterval(() => this._monitorTick(), intervalMs);
    }

    // Collect ~1s of spectral data and process
    _monitorTick() {
        if (!this.monitoring || !this.persistentAnalyser) return;

        const ae = window.audioEngine;
        if (!ae?.ctx) return;

        const analyser = this.persistentAnalyser;
        const sampleRate = ae.ctx.sampleRate;
        const freqBinCount = analyser.frequencyBinCount;
        const binHz = sampleRate / analyser.fftSize;
        const frameInterval = 50;
        const totalFrames = 20; // 20 frames * 50ms = 1 second of data

        const frames = [];
        const envelopePoints = [];
        let prevRms = 0;
        let transientCount = 0;
        let frameCount = 0;

        const collectFrame = () => {
            if (frameCount >= totalFrames || !this.monitoring) {
                // Process collected data
                const result = this._processFrames(frames, envelopePoints, transientCount, totalFrames * frameInterval, binHz, freqBinCount);
                this.latest = result;

                // Update AI composer context directly
                if (window.aiComposer) {
                    window.aiComposer.context.soundscape = result;
                }

                // Fire change callbacks if classification changed
                if (result.classification !== this.previousClassification) {
                    const change = {
                        previous: this.previousClassification,
                        current: result.classification,
                        analysis: result
                    };
                    for (const cb of this.changeCallbacks) {
                        try { cb(change); } catch (e) { console.error('SoundscapeAnalyzer change callback error:', e); }
                    }
                    this.previousClassification = result.classification;
                }
                return;
            }

            const freqData = new Uint8Array(freqBinCount);
            const timeData = new Uint8Array(analyser.fftSize);
            analyser.getByteFrequencyData(freqData);
            analyser.getByteTimeDomainData(timeData);

            let rmsSum = 0;
            for (let i = 0; i < timeData.length; i++) {
                const val = (timeData[i] - 128) / 128;
                rmsSum += val * val;
            }
            const rms = Math.sqrt(rmsSum / timeData.length);

            if (rms > prevRms * 1.8 && rms > 0.02) {
                transientCount++;
            }
            prevRms = rms;

            frames.push(Array.from(freqData));
            envelopePoints.push({
                time: frameCount * frameInterval,
                level: Math.round(rms * 1000) / 1000
            });

            frameCount++;
            setTimeout(collectFrame, frameInterval);
        };

        collectFrame();
    }

    stopMonitoring() {
        if (!this.monitoring) return;
        this.monitoring = false;

        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
        }

        if (this.persistentAnalyser) {
            try {
                window.audioEngine?.channels?.mic?.gain?.disconnect(this.persistentAnalyser);
            } catch (e) {}
            this.persistentAnalyser = null;
        }

        console.log('SoundscapeAnalyzer: monitoring stopped');
    }

    onClassificationChange(callback) {
        this.changeCallbacks.push(callback);
    }

    getLatest() {
        return this.latest;
    }

    // Analyze mic input for the given duration
    // Returns: { dominantFreqs, spectralCentroid, brightness, transientDensity,
    //            avgAmplitude, envelope, classification }
    async analyze(durationMs = 3000) {
        const ae = window.audioEngine;
        if (!ae?.ctx || !ae.channels.mic?.gain) {
            return this._emptyResult();
        }

        if (this.analyzing) return this._emptyResult();
        this.analyzing = true;

        const ctx = ae.ctx;
        const sampleRate = ctx.sampleRate;

        // Create high-res analyser, tapped in parallel (non-destructive)
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.3;
        ae.channels.mic.gain.connect(analyser);

        const freqBinCount = analyser.frequencyBinCount;
        const binHz = sampleRate / analyser.fftSize;
        const frameInterval = 50; // ms between frames
        const totalFrames = Math.floor(durationMs / frameInterval);

        // Collect spectral frames
        const frames = [];
        const envelopePoints = [];
        let prevRms = 0;
        let transientCount = 0;

        await new Promise(resolve => {
            let frameCount = 0;

            const collectFrame = () => {
                if (frameCount >= totalFrames) {
                    resolve();
                    return;
                }

                const freqData = new Uint8Array(freqBinCount);
                const timeData = new Uint8Array(analyser.fftSize);
                analyser.getByteFrequencyData(freqData);
                analyser.getByteTimeDomainData(timeData);

                // RMS from time domain
                let rmsSum = 0;
                for (let i = 0; i < timeData.length; i++) {
                    const val = (timeData[i] - 128) / 128;
                    rmsSum += val * val;
                }
                const rms = Math.sqrt(rmsSum / timeData.length);

                // Detect transient (amplitude spike)
                if (rms > prevRms * 1.8 && rms > 0.02) {
                    transientCount++;
                }
                prevRms = rms;

                frames.push(Array.from(freqData));
                envelopePoints.push({
                    time: frameCount * frameInterval,
                    level: Math.round(rms * 1000) / 1000
                });

                frameCount++;
                setTimeout(collectFrame, frameInterval);
            };

            collectFrame();
        });

        // Disconnect analyser (non-destructive tap)
        try { ae.channels.mic.gain.disconnect(analyser); } catch (e) {}
        this.analyzing = false;

        // Process collected data
        return this._processFrames(frames, envelopePoints, transientCount, durationMs, binHz, freqBinCount);
    }

    _processFrames(frames, envelope, transientCount, durationMs, binHz, freqBinCount) {
        if (frames.length === 0) return this._emptyResult();

        // Average spectrum across all frames
        const avgSpectrum = new Float32Array(freqBinCount);
        for (const frame of frames) {
            for (let i = 0; i < freqBinCount; i++) {
                avgSpectrum[i] += frame[i] / frames.length;
            }
        }

        // Dominant frequencies: top 5 peaks
        const peaks = [];
        for (let i = 1; i < freqBinCount - 1; i++) {
            if (avgSpectrum[i] > avgSpectrum[i - 1] && avgSpectrum[i] > avgSpectrum[i + 1] && avgSpectrum[i] > 10) {
                peaks.push({ freq: Math.round(i * binHz), magnitude: Math.round(avgSpectrum[i]) });
            }
        }
        peaks.sort((a, b) => b.magnitude - a.magnitude);
        const dominantFreqs = peaks.slice(0, 5);

        // Spectral centroid
        let weightedSum = 0;
        let magSum = 0;
        for (let i = 0; i < freqBinCount; i++) {
            const freq = i * binHz;
            weightedSum += freq * avgSpectrum[i];
            magSum += avgSpectrum[i];
        }
        const spectralCentroid = magSum > 0 ? Math.round(weightedSum / magSum) : 0;

        // Brightness: energy ratio above 2kHz
        const cutoffBin = Math.floor(2000 / binHz);
        let highEnergy = 0;
        let totalEnergy = 0;
        for (let i = 0; i < freqBinCount; i++) {
            totalEnergy += avgSpectrum[i];
            if (i >= cutoffBin) highEnergy += avgSpectrum[i];
        }
        const brightness = totalEnergy > 0 ? Math.round((highEnergy / totalEnergy) * 100) : 0;

        // Transient density (per second)
        const durationSec = durationMs / 1000;
        const transientDensity = Math.round((transientCount / durationSec) * 10) / 10;

        // Average amplitude
        const avgAmplitude = envelope.length > 0
            ? Math.round(envelope.reduce((s, p) => s + p.level, 0) / envelope.length * 1000) / 1000
            : 0;

        // Classification
        const classification = this._classify(avgAmplitude, transientDensity, brightness, spectralCentroid);

        return {
            dominantFreqs,
            spectralCentroid,
            brightness,
            transientDensity,
            avgAmplitude,
            envelope,
            classification
        };
    }

    _classify(amplitude, transients, brightness, centroid) {
        if (amplitude < 0.01) return 'quiet';
        if (transients > 4 && brightness > 50) return 'chaotic';
        if (transients > 2) return 'rhythmic';
        if (brightness > 40) return 'noisy';
        if (centroid > 500) return 'tonal';
        return 'ambient';
    }

    // Analyze an AudioBuffer offline (no mic/live input needed)
    analyzeBuffer(audioBuffer) {
        if (!audioBuffer || audioBuffer.length === 0) return this._emptyResult();

        const sampleRate = audioBuffer.sampleRate;
        const channelData = audioBuffer.getChannelData(0);
        const frameSize = Math.floor(sampleRate * 0.05); // 50ms windows
        const totalFrames = Math.floor(channelData.length / frameSize);
        if (totalFrames === 0) return this._emptyResult();

        const fftSize = 2048;
        const freqBinCount = fftSize / 2;
        const binHz = sampleRate / fftSize;
        const frames = [];
        const envelopePoints = [];
        let prevRms = 0;
        let transientCount = 0;

        for (let f = 0; f < totalFrames; f++) {
            const offset = f * frameSize;

            // RMS for this window
            let rmsSum = 0;
            const windowLen = Math.min(frameSize, channelData.length - offset);
            for (let i = 0; i < windowLen; i++) {
                const val = channelData[offset + i];
                rmsSum += val * val;
            }
            const rms = Math.sqrt(rmsSum / windowLen);

            // Transient detection
            if (rms > prevRms * 1.8 && rms > 0.02) {
                transientCount++;
            }
            prevRms = rms;

            envelopePoints.push({
                time: f * 50,
                level: Math.round(rms * 1000) / 1000
            });

            // Simple DFT magnitude spectrum for this frame
            const spectrum = new Array(freqBinCount).fill(0);
            const analysisLen = Math.min(fftSize, channelData.length - offset);
            for (let k = 0; k < freqBinCount; k++) {
                let re = 0, im = 0;
                // Downsample DFT: skip samples for speed (every 4th sample)
                const step = Math.max(1, Math.floor(analysisLen / 512));
                for (let n = 0; n < analysisLen; n += step) {
                    const angle = (2 * Math.PI * k * n) / fftSize;
                    re += channelData[offset + n] * Math.cos(angle);
                    im -= channelData[offset + n] * Math.sin(angle);
                }
                spectrum[k] = Math.sqrt(re * re + im * im) / (analysisLen / step);
            }
            // Scale to 0-255 range like Uint8Array frequency data
            const maxMag = Math.max(...spectrum, 0.001);
            const scaled = spectrum.map(v => Math.round((v / maxMag) * 255));
            frames.push(scaled);
        }

        const durationMs = (channelData.length / sampleRate) * 1000;
        return this._processFrames(frames, envelopePoints, transientCount, durationMs, binHz, freqBinCount);
    }

    // Detect onsets (transient attacks) in an AudioBuffer
    // Returns array of {time, amplitude, index} sorted by time
    detectOnsets(audioBuffer, thresholdMultiplier = 1.8) {
        if (!audioBuffer || audioBuffer.length === 0) return [];

        const sampleRate = audioBuffer.sampleRate;
        const channelData = audioBuffer.getChannelData(0);
        const windowSize = Math.floor(sampleRate * 0.01); // 10ms windows
        const numWindows = Math.floor(channelData.length / windowSize);
        const onsets = [];
        let prevRms = 0;

        for (let w = 0; w < numWindows; w++) {
            const offset = w * windowSize;
            let rmsSum = 0;
            for (let i = 0; i < windowSize; i++) {
                const val = channelData[offset + i];
                rmsSum += val * val;
            }
            const rms = Math.sqrt(rmsSum / windowSize);

            if (rms > prevRms * thresholdMultiplier && rms > 0.02) {
                onsets.push({
                    time: (offset / sampleRate) * 1000, // ms
                    amplitude: Math.round(rms * 1000) / 1000,
                    index: offset
                });
            }
            prevRms = rms;
        }

        return onsets;
    }

    // Extract transient segments from an AudioBuffer based on onset positions
    // Returns array of AudioBuffers, one per transient
    extractTransients(audioBuffer, onsets, paddingMs = 50) {
        if (!audioBuffer || !onsets || onsets.length === 0) return [];

        const sampleRate = audioBuffer.sampleRate;
        const channelData = audioBuffer.getChannelData(0);
        const paddingSamples = Math.floor((paddingMs / 1000) * sampleRate);
        const transients = [];
        const ctx = window.audioEngine?.ctx;
        if (!ctx) return [];

        for (const onset of onsets) {
            const startSample = Math.max(0, onset.index - paddingSamples);
            const endSample = Math.min(channelData.length, onset.index + paddingSamples * 2);
            const length = endSample - startSample;
            if (length <= 0) continue;

            const transientBuffer = ctx.createBuffer(1, length, sampleRate);
            const transientData = transientBuffer.getChannelData(0);
            for (let i = 0; i < length; i++) {
                transientData[i] = channelData[startSample + i];
            }
            transients.push(transientBuffer);
        }

        return transients;
    }

    // Detect tempo (BPM) from an AudioBuffer using inter-onset intervals
    // Returns {bpm, confidence}
    detectTempo(audioBuffer) {
        if (!audioBuffer || audioBuffer.length === 0) return { bpm: 0, confidence: 0 };

        const onsets = this.detectOnsets(audioBuffer, 1.5);
        if (onsets.length < 3) return { bpm: 0, confidence: 0 };

        // Compute inter-onset intervals (IOIs) in ms
        const iois = [];
        for (let i = 1; i < onsets.length; i++) {
            const ioi = onsets[i].time - onsets[i - 1].time;
            // Filter: only consider IOIs between 200ms (300 BPM) and 2000ms (30 BPM)
            if (ioi >= 200 && ioi <= 2000) {
                iois.push(ioi);
            }
        }

        if (iois.length < 2) return { bpm: 0, confidence: 0 };

        // Histogram IOIs with 20ms bin resolution
        const binSize = 20;
        const bins = new Map();
        for (const ioi of iois) {
            const bin = Math.round(ioi / binSize) * binSize;
            bins.set(bin, (bins.get(bin) || 0) + 1);
        }

        // Find the mode (most common IOI bin)
        let modeBin = 0;
        let modeCount = 0;
        for (const [bin, count] of bins) {
            if (count > modeCount) {
                modeCount = count;
                modeBin = bin;
            }
        }

        if (modeBin === 0) return { bpm: 0, confidence: 0 };

        // Convert IOI to BPM
        const bpm = Math.round(60000 / modeBin);

        // Confidence: percentage of IOIs within ±10% of the detected period
        const tolerance = modeBin * 0.1;
        const matchingIOIs = iois.filter(ioi => Math.abs(ioi - modeBin) <= tolerance).length;
        const confidence = Math.round((matchingIOIs / iois.length) * 100);

        return { bpm, confidence };
    }

    _emptyResult() {
        return {
            dominantFreqs: [],
            spectralCentroid: 0,
            brightness: 0,
            transientDensity: 0,
            avgAmplitude: 0,
            envelope: [],
            classification: 'quiet'
        };
    }
}

window.soundscapeAnalyzer = new SoundscapeAnalyzer();
