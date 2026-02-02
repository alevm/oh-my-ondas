// Oh My Ondas - Soundscape Analyzer
// Taps into mic channel to analyze the sonic environment

class SoundscapeAnalyzer {
    constructor() {
        this.analyzing = false;
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
