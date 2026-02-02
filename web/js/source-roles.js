// Oh My Ondas - Creative Source Role Manager
// Assigns musical roles to sources: RHYTHM, TEXTURE, MELODY, MODULATION

class SourceRoleManager {
    constructor() {
        this.ROLES = { RHYTHM: 'rhythm', TEXTURE: 'texture', MELODY: 'melody', MODULATION: 'modulation' };

        // Current track assignments: [{track, role, source}]
        this.assignments = [];

        // Modulation routes: [{sourceChannel, targetChannel, targetParam, scale}]
        this.modulationRoutes = [];
    }

    // Role distribution templates by vibe
    // Numbers = how many tracks per role [RHYTHM, TEXTURE, MELODY, MODULATION]
    _vibeDistributions() {
        return {
            calm:   [2, 3, 2, 1],
            urban:  [4, 1, 2, 1],
            nature: [1, 4, 2, 1],
            chaos:  [3, 2, 1, 2]
        };
    }

    // Source preference per role (ordered by preference)
    _sourcePreferences() {
        return {
            rhythm:     ['sampler', 'synth', 'radio', 'mic'],
            texture:    ['radio', 'mic', 'sampler', 'synth'],
            melody:     ['synth', 'sampler', 'radio', 'mic'],
            modulation: ['mic', 'radio', 'synth', 'sampler']
        };
    }

    // Generate role assignments for 8 tracks
    generateRoleAssignment(context) {
        const { vibe = 'calm', soundscape = null, availableSources = ['sampler', 'synth'] } = context;

        // Get base distribution
        const distributions = this._vibeDistributions();
        const dist = [...(distributions[vibe] || distributions.calm)];
        const roleNames = ['rhythm', 'texture', 'melody', 'modulation'];

        // Soundscape adjustments
        if (soundscape) {
            if (soundscape.classification === 'rhythmic' && dist[0] < 5) {
                dist[0]++;
                // Reduce texture by 1 to stay at 8
                const texIdx = dist[1] > 1 ? 1 : 3;
                dist[texIdx] = Math.max(0, dist[texIdx] - 1);
            }
            if (soundscape.classification === 'tonal' && dist[2] < 4) {
                dist[2]++;
                const texIdx = dist[1] > 1 ? 1 : 0;
                dist[texIdx] = Math.max(0, dist[texIdx] - 1);
            }
        }

        // Ensure total = 8
        let total = dist.reduce((a, b) => a + b, 0);
        while (total < 8) { dist[0]++; total++; }
        while (total > 8) {
            for (let i = 3; i >= 0; i--) {
                if (dist[i] > 0 && total > 8) { dist[i]--; total--; }
            }
        }

        // Build assignment list
        const prefs = this._sourcePreferences();
        const assignments = [];
        let trackIdx = 0;

        for (let r = 0; r < 4; r++) {
            const role = roleNames[r];
            const rolePref = prefs[role];

            for (let i = 0; i < dist[r]; i++) {
                // Pick best available source for this role
                let source = 'sampler'; // fallback
                for (const pref of rolePref) {
                    if (availableSources.includes(pref)) {
                        source = pref;
                        break;
                    }
                }

                assignments.push({
                    track: trackIdx,
                    role: role,
                    source: source
                });
                trackIdx++;
            }
        }

        this.assignments = assignments;
        return assignments;
    }

    // Apply a role strategy to a track
    assignRole(trackIndex, role, source) {
        const strategyKey = `_${role}From${source.charAt(0).toUpperCase() + source.slice(1)}`;
        if (typeof this[strategyKey] === 'function') {
            this[strategyKey](trackIndex);
        }

        // Update assignment record
        const existing = this.assignments.find(a => a.track === trackIndex);
        if (existing) {
            existing.role = role;
            existing.source = source;
        } else {
            this.assignments.push({ track: trackIndex, role, source });
        }
    }

    // --- Role strategies ---

    _rhythmFromSampler(trackIndex) {
        // Default behavior - sampler drums are already rhythmic
    }

    _rhythmFromSynth(trackIndex) {
        if (!window.sequencer) return;
        const seq = window.sequencer;
        // Short decay + filter P-Locks for percussive character
        for (let s = 0; s < seq.steps; s++) {
            const step = seq.pattern[trackIndex]?.[s];
            if (step && step.active) {
                seq.setPLock(trackIndex, s, 'decay', 15 + Math.random() * 20);
                seq.setPLock(trackIndex, s, 'filter', 30 + Math.random() * 40);
            }
        }
    }

    _rhythmFromRadio(trackIndex) {
        // Radio pulsed rhythmically via channel gating (default sequencer behavior)
    }

    _rhythmFromMic(trackIndex) {
        // Mic pulsed rhythmically via channel gating
    }

    _textureFromRadio(trackIndex) {
        if (!window.sequencer) return;
        const seq = window.sequencer;
        // Delay + grain P-Locks for ambient layer
        for (let s = 0; s < seq.steps; s++) {
            const step = seq.pattern[trackIndex]?.[s];
            if (step && step.active) {
                seq.setPLock(trackIndex, s, 'delay', 40 + Math.random() * 30);
                seq.setPLock(trackIndex, s, 'grain', 30 + Math.random() * 40);
                seq.setPLock(trackIndex, s, 'fxRoute', 'radio');
            }
        }
    }

    _textureFromMic(trackIndex) {
        if (!window.sequencer) return;
        const seq = window.sequencer;
        // Heavy grain P-Locks for processed ambient
        for (let s = 0; s < seq.steps; s++) {
            const step = seq.pattern[trackIndex]?.[s];
            if (step && step.active) {
                seq.setPLock(trackIndex, s, 'grain', 60 + Math.random() * 30);
                seq.setPLock(trackIndex, s, 'delay', 20 + Math.random() * 20);
                seq.setPLock(trackIndex, s, 'fxRoute', 'mic');
            }
        }
    }

    _textureFromSampler(trackIndex) {
        if (!window.sequencer) return;
        const seq = window.sequencer;
        for (let s = 0; s < seq.steps; s++) {
            const step = seq.pattern[trackIndex]?.[s];
            if (step && step.active) {
                seq.setPLock(trackIndex, s, 'grain', 40 + Math.random() * 30);
                seq.setPLock(trackIndex, s, 'delay', 30 + Math.random() * 20);
            }
        }
    }

    _textureFromSynth(trackIndex) {
        if (!window.sequencer) return;
        const seq = window.sequencer;
        for (let s = 0; s < seq.steps; s++) {
            const step = seq.pattern[trackIndex]?.[s];
            if (step && step.active) {
                seq.setPLock(trackIndex, s, 'decay', 80 + Math.random() * 20);
                seq.setPLock(trackIndex, s, 'grain', 50 + Math.random() * 30);
            }
        }
    }

    _melodyFromSynth(trackIndex) {
        // Synth is the natural melody source - pitch P-Locks handled by AI composer
    }

    _melodyFromSampler(trackIndex) {
        if (!window.sequencer) return;
        const seq = window.sequencer;
        // Pitch P-Locks on pitched kits (kit2/3)
        const scale = [0, 3, 5, 7, 10, 12];
        for (let s = 0; s < seq.steps; s++) {
            const step = seq.pattern[trackIndex]?.[s];
            if (step && step.active) {
                const pitch = scale[Math.floor(Math.random() * scale.length)];
                seq.setPLock(trackIndex, s, 'pitch', pitch);
            }
        }
    }

    _melodyFromRadio(trackIndex) {
        // Radio melody: gate with pitch-suggestive timing
    }

    _melodyFromMic(trackIndex) {
        // Mic melody: gate with pitch-suggestive timing
    }

    _modulationFromMic(trackIndex) {
        // Set up amplitude-to-parameter modulation route
        this.modulationRoutes.push({
            sourceChannel: 'mic',
            targetChannel: 'synth',
            targetParam: 'delay',
            scale: 80 // max FX amount
        });
    }

    _modulationFromRadio(trackIndex) {
        this.modulationRoutes.push({
            sourceChannel: 'radio',
            targetChannel: 'synth',
            targetParam: 'delay',
            scale: 60
        });
    }

    _modulationFromSynth(trackIndex) {
        this.modulationRoutes.push({
            sourceChannel: 'synth',
            targetChannel: 'samples',
            targetParam: 'grain',
            scale: 70
        });
    }

    _modulationFromSampler(trackIndex) {
        this.modulationRoutes.push({
            sourceChannel: 'samples',
            targetChannel: 'radio',
            targetParam: 'delay',
            scale: 50
        });
    }

    // Called each sequencer tick: reads source channel RMS, maps to target FX
    processModulation() {
        if (this.modulationRoutes.length === 0) return;

        const ae = window.audioEngine;
        const me = window.mangleEngine;
        if (!ae || !me) return;

        for (const route of this.modulationRoutes) {
            // Read source channel amplitude
            const analysis = ae.analyzeChannel(route.sourceChannel);
            if (!analysis) continue;

            const rms = analysis.rms; // 0-100
            const mapped = (rms / 100) * route.scale;

            // Apply to target channel FX parameter
            switch (route.targetParam) {
                case 'delay':
                    me.setChannelDelayMix(route.targetChannel, mapped);
                    break;
                case 'grain':
                    me.setChannelGrain(route.targetChannel, mapped, 50, 0);
                    break;
                case 'glitch':
                    me.setChannelGlitch(route.targetChannel, mapped, 100, 'stutter');
                    break;
            }
        }
    }

    // Get current assignments
    getAssignments() {
        return JSON.parse(JSON.stringify(this.assignments));
    }

    // Restore assignments (from scene recall)
    setAssignments(assignments) {
        if (!assignments) return;
        this.assignments = JSON.parse(JSON.stringify(assignments));

        // Re-apply modulation routes from modulation-role assignments
        this.modulationRoutes = [];
        for (const a of this.assignments) {
            if (a.role === 'modulation') {
                const strategyKey = `_modulationFrom${a.source.charAt(0).toUpperCase() + a.source.slice(1)}`;
                if (typeof this[strategyKey] === 'function') {
                    this[strategyKey](a.track);
                }
            }
        }
    }

    // Clear all assignments
    clear() {
        this.assignments = [];
        this.modulationRoutes = [];
    }
}

window.sourceRoleManager = new SourceRoleManager();
