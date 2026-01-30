// Oh My Ondas - AI Composer (Context-aware rhythm generation)

class AIComposer {
    constructor() {
        this.context = {
            location: null,
            locationType: 'unknown',
            timeOfDay: 'day',
            vibe: 'calm',
            gps: null
        };
    }

    init() {
        // Update context periodically
        this.updateContext();
        setInterval(() => this.updateContext(), 30000);

        console.log('AIComposer initialized');
        return true;
    }

    updateContext() {
        // Get GPS data
        const gps = window.gpsTracker?.getPosition();
        if (gps) {
            this.context.gps = gps;
            this.context.location = gps.formatted;
            this.context.locationType = this.classifyLocation(gps);
        }

        // Get time context
        const hour = new Date().getHours();
        if (hour >= 5 && hour < 12) {
            this.context.timeOfDay = 'morning';
        } else if (hour >= 12 && hour < 17) {
            this.context.timeOfDay = 'afternoon';
        } else if (hour >= 17 && hour < 21) {
            this.context.timeOfDay = 'evening';
        } else {
            this.context.timeOfDay = 'night';
        }

        // Suggest vibe based on time
        this.context.vibe = this.suggestVibe();

        // Update UI
        this.updateUI();
    }

    classifyLocation(gps) {
        // Simplified location classification
        // In real implementation, would use reverse geocoding API
        if (!gps) return 'unknown';

        // Mock classification based on accuracy (lower = likely outdoors/urban)
        if (gps.accuracy < 10) {
            return 'urban';
        } else if (gps.accuracy < 50) {
            return 'suburban';
        } else {
            return 'rural';
        }
    }

    suggestVibe() {
        const { locationType, timeOfDay } = this.context;

        // Vibe matrix
        const vibeMatrix = {
            urban: {
                morning: 'urban',
                afternoon: 'urban',
                evening: 'chaos',
                night: 'calm'
            },
            suburban: {
                morning: 'calm',
                afternoon: 'nature',
                evening: 'calm',
                night: 'calm'
            },
            rural: {
                morning: 'nature',
                afternoon: 'nature',
                evening: 'calm',
                night: 'calm'
            },
            unknown: {
                morning: 'calm',
                afternoon: 'urban',
                evening: 'calm',
                night: 'calm'
            }
        };

        return vibeMatrix[locationType]?.[timeOfDay] || 'calm';
    }

    updateUI() {
        const locationEl = document.getElementById('aiLocation');
        const timeEl = document.getElementById('aiTime');
        const vibeEl = document.getElementById('aiVibe');

        if (locationEl) {
            locationEl.textContent = this.context.locationType.charAt(0).toUpperCase() +
                                    this.context.locationType.slice(1);
        }
        if (timeEl) {
            const now = new Date();
            timeEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        if (vibeEl) {
            vibeEl.textContent = this.context.vibe.charAt(0).toUpperCase() +
                                this.context.vibe.slice(1);
        }
    }

    // Scale definitions for melodic P-Locks (semitone intervals)
    getScale(vibe) {
        const scales = {
            calm: [0, 3, 5, 7, 10, 12],       // minor pentatonic
            urban: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], // chromatic
            nature: [0, 2, 4, 7, 9, 12],       // major pentatonic
            chaos: [0, 2, 4, 6, 8, 10]         // whole tone
        };
        return scales[vibe] || scales.calm;
    }

    // Add pitch P-Locks to active steps on specified tracks
    addPitchPLocks(trackIndices, vibe, complexity) {
        if (!window.sequencer) return;
        const scale = this.getScale(vibe);
        const seq = window.sequencer;
        const steps = seq.steps;
        const pitchChance = Math.min(0.9, (complexity / 100) * 0.8 + 0.1);

        for (const t of trackIndices) {
            for (let s = 0; s < steps; s++) {
                const step = seq.pattern[t][s];
                if (step.active && Math.random() < pitchChance) {
                    const pitch = scale[Math.floor(Math.random() * scale.length)];
                    seq.setPLock(t, s, 'pitch', pitch);
                }
            }
        }
    }

    // Auto-capture from radio if playing (returns padIndex or null)
    async autoCaptureRadio(durationMs = 2000) {
        if (!window.radioPlayer?.isPlaying()) return null;
        const padIdx = window.sampler?.getNextEmptyPad();
        if (padIdx === null) return null;

        const buffer = await window.radioPlayer.captureToBuffer(durationMs);
        if (!buffer) return null;

        const station = window.radioPlayer.getCurrentStation();
        window.sampler.loadBuffer(padIdx, buffer, {
            name: station?.name?.substring(0, 12) || 'Radio',
            source: 'radio',
            gps: window.gpsTracker?.getPosition(),
            timestamp: Date.now()
        });
        console.log(`AI auto-captured radio to pad ${padIdx}`);
        return padIdx;
    }

    // Auto-capture from mic if active (returns padIndex or null)
    async autoCaptureMic(durationMs = 2000) {
        if (!window.micInput?.isActive()) return null;
        const padIdx = window.sampler?.getNextEmptyPad();
        if (padIdx === null) return null;

        const buffer = await window.micInput.captureToBuffer(durationMs);
        if (!buffer) return null;

        window.sampler.loadBuffer(padIdx, buffer, {
            name: 'Ambient',
            source: 'mic',
            gps: window.gpsTracker?.getPosition(),
            timestamp: Date.now()
        });
        console.log(`AI auto-captured mic to pad ${padIdx}`);
        return padIdx;
    }

    // Full AI generate: auto-capture, auto-assign sources, add pitch P-Locks
    async generateFull(vibe, density = 70, complexity = 50) {
        if (!window.sequencer) return null;

        // 1. Auto-capture from active sources if no captured pads yet
        const capturedPads = [];
        for (let i = 0; i < 8; i++) {
            if (window.sampler?.hasCapturedSample(i)) capturedPads.push(i);
        }

        if (capturedPads.length === 0) {
            // Try to auto-capture from radio, then mic
            const radioPad = await this.autoCaptureRadio(2000);
            if (radioPad !== null) capturedPads.push(radioPad);
            const micPad = await this.autoCaptureMic(2000);
            if (micPad !== null) capturedPads.push(micPad);
        }

        // 2. Generate base rhythm pattern
        window.sequencer.generateVibePattern(vibe, density, complexity);

        // 3. Auto-assign track sources
        // Tracks 0-3: keep as sampler (drums)
        // Tracks 4-5: assign to captured pads if available (melodic)
        // Track 6: synth
        // Track 7: radio gate or mic gate if active
        const melodicTracks = [];
        if (capturedPads.length > 0) {
            // Assign captured pads to tracks 4+
            for (let i = 0; i < Math.min(capturedPads.length, 2); i++) {
                const trackIdx = 4 + i;
                window.sequencer.setTrackSource(trackIdx, 'sampler');
                // Remap: this track triggers the captured pad
                // We swap pattern data so track index matches pad index
                // Copy active pattern from trackIdx to capturedPads[i] track
                this.remapTrackToPad(trackIdx, capturedPads[i]);
                melodicTracks.push(trackIdx);
            }
        }

        // Assign synth to track 6 if not already melodic
        if (!melodicTracks.includes(6)) {
            window.sequencer.setTrackSource(6, 'synth');
            melodicTracks.push(6);
        }

        // Assign radio/mic gate to track 7 if active
        if (window.radioPlayer?.isPlaying()) {
            window.sequencer.setTrackSource(7, 'radio');
        } else if (window.micInput?.isActive()) {
            window.sequencer.setTrackSource(7, 'mic');
        }

        // 4. Add pitch P-Locks to melodic tracks
        this.addPitchPLocks(melodicTracks, vibe, complexity);

        // 5. Generate suggestions
        return this.generateSuggestions(vibe, density, complexity);
    }

    // Remap a sequencer track to trigger a specific pad index
    remapTrackToPad(trackIdx, padIdx) {
        // The sequencer triggers pad = trackIdx by default.
        // To make track N trigger pad M, we swap the track data positions.
        // Simpler approach: just ensure the track pattern exists and note
        // that trigger will use trackIdx. We copy the pad's buffer to the
        // trackIdx position so the sampler plays the right buffer.
        if (trackIdx === padIdx) return; // Already mapped

        const buf = window.sampler.samples.get(padIdx);
        const meta = window.sampler.padMeta.get(padIdx);
        if (buf) {
            window.sampler.samples.set(trackIdx, buf);
            if (meta) window.sampler.padMeta.set(trackIdx, { ...meta });
        }
    }

    // Generate rhythm based on parameters
    generateRhythm(vibe, density, complexity) {
        if (window.sequencer) {
            window.sequencer.generateVibePattern(vibe, density, complexity);
        }

        // Generate suggestions
        return this.generateSuggestions(vibe, density, complexity);
    }

    // Generate contextual suggestions
    generateSuggestions(vibe, density, complexity) {
        const suggestions = [];

        // Tempo suggestion
        const tempoRanges = {
            calm: { min: 70, max: 100 },
            urban: { min: 100, max: 140 },
            nature: { min: 80, max: 110 },
            chaos: { min: 120, max: 180 }
        };
        const range = tempoRanges[vibe] || tempoRanges.calm;
        const suggestedTempo = range.min + Math.floor(Math.random() * (range.max - range.min));
        suggestions.push({
            type: 'tempo',
            text: `Try tempo around ${suggestedTempo} BPM for ${vibe} vibe`,
            action: () => {
                if (window.sequencer) {
                    window.sequencer.setTempo(suggestedTempo);
                    document.getElementById('seqTempo').value = suggestedTempo;
                    document.getElementById('seqTempoDisplay').textContent = suggestedTempo;
                    document.getElementById('tempoValue').textContent = suggestedTempo;
                }
            }
        });

        // FX suggestion
        const fxSuggestions = {
            calm: 'Add subtle delay (200ms, 20% mix) for space',
            urban: 'Try bit crusher at 8-bit for grit',
            nature: 'Layer with grain cloud for organic texture',
            chaos: 'Enable glitch at 30% for unpredictability'
        };
        suggestions.push({
            type: 'fx',
            text: fxSuggestions[vibe] || 'Experiment with FX',
            action: () => {
                // Navigate to FX tab
                document.querySelector('[data-tab="fx"]')?.click();
            }
        });

        // Pattern variation
        if (complexity > 50) {
            suggestions.push({
                type: 'variation',
                text: 'Add probability (70-90%) for human feel',
                action: () => {
                    const prob = 70 + Math.floor(Math.random() * 20);
                    for (let t = 0; t < 8; t++) {
                        window.sequencer?.setTrackProbability(t, prob);
                    }
                }
            });
        }

        // Time-based suggestions
        if (this.context.timeOfDay === 'night') {
            suggestions.push({
                type: 'time',
                text: 'Night mode: reduce high frequencies, add reverb',
                action: () => {
                    // Mute hi-hat and shaker for night vibe
                    window.sequencer?.clearTrack(2);
                    window.sequencer?.clearTrack(6);
                }
            });
        } else if (this.context.timeOfDay === 'morning') {
            suggestions.push({
                type: 'time',
                text: 'Morning energy: bright sounds, moderate tempo',
                action: () => {}
            });
        }

        // Location-based suggestions
        if (this.context.locationType === 'urban') {
            suggestions.push({
                type: 'location',
                text: 'Urban setting: try radio input for local flavor',
                action: () => {
                    document.querySelector('[data-tab="radio"]')?.click();
                }
            });
        }

        return suggestions;
    }

    // Surprise generation
    surprise() {
        if (!window.sequencer) return null;

        const result = window.sequencer.generateSurprise();
        const suggestions = this.generateSuggestions(result.vibe, result.density, result.complexity);

        // Update UI
        document.getElementById('seqTempo').value = result.tempo;
        document.getElementById('seqTempoDisplay').textContent = result.tempo;
        document.getElementById('tempoValue').textContent = result.tempo;

        // Update vibe buttons
        const vibeDisplay = document.getElementById('aiVibe');
        if (vibeDisplay) vibeDisplay.textContent = result.vibe.charAt(0).toUpperCase() + result.vibe.slice(1);

        document.getElementById('aiDensity').value = result.density;
        document.getElementById('aiDensityDisplay').textContent = Math.round(result.density);
        document.getElementById('aiComplexity').value = result.complexity;
        document.getElementById('aiComplexityDisplay').textContent = Math.round(result.complexity);

        return { ...result, suggestions };
    }

    getContext() {
        return { ...this.context };
    }

    // Generate a complete arrangement with multiple scenes
    generateArrangement(numScenes = 4, barsPerScene = 4) {
        const vibes = ['calm', 'urban', 'nature', 'chaos'];
        const vibeProgression = this.createVibeProgression(numScenes);

        console.log('Generating arrangement with vibes:', vibeProgression);

        // Clear existing arrangement
        window.arrangement.clear();

        // Generate each scene
        for (let i = 0; i < numScenes; i++) {
            const vibe = vibeProgression[i];
            const density = 30 + (i * 15) + Math.random() * 20; // Gradually increase
            const complexity = 20 + (i * 10) + Math.random() * 20;

            // Generate pattern for this scene
            window.sequencer.generateVibePattern(vibe, density, complexity);

            // Set tempo based on vibe
            const tempoRanges = {
                calm: { min: 70, max: 100 },
                urban: { min: 100, max: 140 },
                nature: { min: 80, max: 110 },
                chaos: { min: 120, max: 180 }
            };
            const range = tempoRanges[vibe];
            const tempo = range.min + Math.floor(Math.random() * (range.max - range.min));
            window.sequencer.setTempo(tempo);

            // Update AI UI
            document.querySelectorAll('.vibe-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.vibe === vibe);
            });
            document.getElementById('aiDensity').value = density;
            document.getElementById('aiDensityDisplay').textContent = Math.round(density);
            document.getElementById('aiComplexity').value = complexity;
            document.getElementById('aiComplexityDisplay').textContent = Math.round(complexity);

            // Save to scene slot
            window.sceneManager.saveScene(i);

            // Add to arrangement
            window.arrangement.addBlock(i, barsPerScene);
        }

        // Update UI
        if (window.app) {
            window.app.updateSeqGrid();
            window.app.updateSeqOverview();
        }

        // Mark scene buttons
        document.querySelectorAll('.scene-btn').forEach(btn => {
            const idx = parseInt(btn.dataset.scene);
            btn.classList.toggle('has-data', window.sceneManager.hasScene(idx));
        });

        return {
            scenes: numScenes,
            vibes: vibeProgression,
            totalBars: numScenes * barsPerScene
        };
    }

    // Create a musical vibe progression
    createVibeProgression(numScenes) {
        const patterns = [
            // Build up patterns
            ['calm', 'urban', 'chaos', 'calm'],
            ['nature', 'calm', 'urban', 'chaos'],
            ['calm', 'nature', 'urban', 'chaos'],
            // Dynamic patterns
            ['urban', 'calm', 'chaos', 'nature'],
            ['chaos', 'urban', 'calm', 'nature']
        ];

        const pattern = patterns[Math.floor(Math.random() * patterns.length)];

        // Adjust to requested length
        const result = [];
        for (let i = 0; i < numScenes; i++) {
            result.push(pattern[i % pattern.length]);
        }
        return result;
    }

    // Get arrangement-aware suggestions
    getArrangementSuggestions() {
        const structure = window.arrangement.getStructure();
        const suggestions = [];

        if (structure.blocks.length === 0) {
            suggestions.push({
                type: 'arrangement',
                text: 'Generate a complete 4-scene arrangement',
                action: () => this.generateArrangement(4, 4)
            });
        } else {
            suggestions.push({
                type: 'arrangement',
                text: `Arrangement has ${structure.blocks.length} scenes, ${structure.totalBars} bars`,
                action: null
            });

            // Suggest variations
            if (structure.blocks.length < 4) {
                suggestions.push({
                    type: 'arrangement',
                    text: 'Add another scene with contrasting vibe',
                    action: () => {
                        const usedVibes = structure.blocks.map(b => b.sceneData?.ai?.vibe || 'calm');
                        const allVibes = ['calm', 'urban', 'nature', 'chaos'];
                        const unusedVibes = allVibes.filter(v => !usedVibes.includes(v));
                        const newVibe = unusedVibes[0] || allVibes[Math.floor(Math.random() * 4)];

                        this.generateRhythm(newVibe, 50, 50);
                        const nextSlot = structure.blocks.length;
                        window.sceneManager.saveScene(nextSlot);
                        window.arrangement.addBlock(nextSlot, 4);
                    }
                });
            }
        }

        return suggestions;
    }
}

// Global instance
window.aiComposer = new AIComposer();
