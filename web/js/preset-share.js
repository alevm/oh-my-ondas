// Oh My Ondas — Shareable Presets
// Export/import/share synth + sequencer presets via JSON files and URL parameters

class PresetShare {
    constructor() {
        // Built-in preset gallery
        this.builtInPresets = [
            {
                name: 'Deep Bass',
                description: 'Warm sub-bass with slow filter sweep',
                synth: {
                    osc1: { waveform: 'sawtooth', enabled: true },
                    osc2: { waveform: 'sine', enabled: true, detune: 3 },
                    pitch: { octave: -1, fine: 0, glide: 80 },
                    filter: { type: 'lowpass', cutoff: 400, resonance: 4 },
                    lfo: { rate: 0.3, depth: 20, target: 'filter' },
                    unison: { voices: 2, spread: 8 },
                    adsr: { attack: 20, decay: 200, sustain: 60, release: 300 },
                    noiseLevel: 0
                },
                sequencer: null
            },
            {
                name: 'Acid Lead',
                description: 'Classic 303-style resonant lead',
                synth: {
                    osc1: { waveform: 'sawtooth', enabled: true },
                    osc2: { waveform: 'square', enabled: false, detune: 0 },
                    pitch: { octave: 0, fine: 0, glide: 40 },
                    filter: { type: 'lowpass', cutoff: 1200, resonance: 18 },
                    lfo: { rate: 0, depth: 0, target: 'pitch' },
                    unison: { voices: 1, spread: 10 },
                    adsr: { attack: 5, decay: 150, sustain: 30, release: 100 },
                    noiseLevel: 0
                },
                sequencer: null
            },
            {
                name: 'Ambient Pad',
                description: 'Wide stereo pad with slow attack',
                synth: {
                    osc1: { waveform: 'sine', enabled: true },
                    osc2: { waveform: 'triangle', enabled: true, detune: 12 },
                    pitch: { octave: 0, fine: 0, glide: 0 },
                    filter: { type: 'lowpass', cutoff: 3000, resonance: 1 },
                    lfo: { rate: 0.5, depth: 15, target: 'pitch' },
                    unison: { voices: 6, spread: 25 },
                    adsr: { attack: 800, decay: 400, sustain: 80, release: 1500 },
                    noiseLevel: 5
                },
                sequencer: null
            },
            {
                name: 'Harsh Noise',
                description: 'Noisy distorted texture with fast LFO',
                synth: {
                    osc1: { waveform: 'square', enabled: true },
                    osc2: { waveform: 'sawtooth', enabled: true, detune: 50 },
                    pitch: { octave: 1, fine: 0, glide: 0 },
                    filter: { type: 'highpass', cutoff: 800, resonance: 12 },
                    lfo: { rate: 8, depth: 80, target: 'filter' },
                    unison: { voices: 4, spread: 40 },
                    adsr: { attack: 0, decay: 50, sustain: 90, release: 50 },
                    noiseLevel: 60
                },
                sequencer: null
            },
            {
                name: 'Pluck',
                description: 'Short percussive pluck sound',
                synth: {
                    osc1: { waveform: 'triangle', enabled: true },
                    osc2: { waveform: 'sine', enabled: true, detune: 7 },
                    pitch: { octave: 0, fine: 0, glide: 0 },
                    filter: { type: 'lowpass', cutoff: 5000, resonance: 2 },
                    lfo: { rate: 0, depth: 0, target: 'pitch' },
                    unison: { voices: 1, spread: 10 },
                    adsr: { attack: 2, decay: 80, sustain: 10, release: 150 },
                    noiseLevel: 0
                },
                sequencer: null
            },
            {
                name: 'Lo-Fi Keys',
                description: 'Detuned electric piano character',
                synth: {
                    osc1: { waveform: 'sine', enabled: true },
                    osc2: { waveform: 'triangle', enabled: true, detune: 15 },
                    pitch: { octave: 0, fine: -5, glide: 0 },
                    filter: { type: 'lowpass', cutoff: 2200, resonance: 3 },
                    lfo: { rate: 4.5, depth: 5, target: 'amp' },
                    unison: { voices: 2, spread: 12 },
                    adsr: { attack: 10, decay: 300, sustain: 40, release: 400 },
                    noiseLevel: 3
                },
                sequencer: null
            },
            {
                name: 'Wobble Bass',
                description: 'Dubstep-style wobbling bass',
                synth: {
                    osc1: { waveform: 'sawtooth', enabled: true },
                    osc2: { waveform: 'square', enabled: true, detune: 2 },
                    pitch: { octave: -1, fine: 0, glide: 20 },
                    filter: { type: 'lowpass', cutoff: 600, resonance: 10 },
                    lfo: { rate: 3, depth: 90, target: 'filter' },
                    unison: { voices: 3, spread: 15 },
                    adsr: { attack: 5, decay: 100, sustain: 80, release: 150 },
                    noiseLevel: 0
                },
                sequencer: null
            },
            {
                name: '4-on-the-Floor',
                description: 'Classic kick pattern with hi-hats',
                synth: null,
                sequencer: {
                    tempo: 120,
                    patternLength: 16,
                    tracks: [
                        // Kick: every beat
                        [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
                        // Snare: beats 2 & 4
                        [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
                        // Hi-hat: every 8th
                        [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
                        // Open HH: offbeats
                        [0,0,0,0, 0,0,0,1, 0,0,0,0, 0,0,0,1],
                        [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
                        [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
                        [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
                        [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0]
                    ]
                }
            },
            {
                name: 'Breakbeat',
                description: 'Syncopated break with ghost notes',
                synth: null,
                sequencer: {
                    tempo: 135,
                    patternLength: 16,
                    tracks: [
                        [1,0,0,0, 0,0,1,0, 0,0,1,0, 0,0,0,0],
                        [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,1],
                        [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
                        [0,0,0,0, 0,0,0,0, 0,1,0,0, 0,0,0,0],
                        [0,0,0,1, 0,0,0,0, 0,0,0,0, 0,1,0,0],
                        [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
                        [0,1,0,0, 0,0,0,1, 0,1,0,0, 0,0,0,1],
                        [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0]
                    ]
                }
            },
            {
                name: 'Ambient + Pattern',
                description: 'Ambient pad synth with sparse percussion',
                synth: {
                    osc1: { waveform: 'sine', enabled: true },
                    osc2: { waveform: 'triangle', enabled: true, detune: 12 },
                    pitch: { octave: 0, fine: 0, glide: 0 },
                    filter: { type: 'lowpass', cutoff: 3000, resonance: 1 },
                    lfo: { rate: 0.5, depth: 15, target: 'pitch' },
                    unison: { voices: 6, spread: 25 },
                    adsr: { attack: 800, decay: 400, sustain: 80, release: 1500 },
                    noiseLevel: 5
                },
                sequencer: {
                    tempo: 85,
                    patternLength: 16,
                    tracks: [
                        [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
                        [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
                        [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0],
                        [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,1],
                        [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
                        [0,0,0,0, 0,1,0,0, 0,0,0,0, 0,1,0,0],
                        [1,0,0,1, 0,0,0,1, 1,0,0,1, 0,0,0,1],
                        [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0]
                    ]
                }
            }
        ];
    }

    // ===== Capture current state as preset =====

    capturePreset(name, description) {
        const preset = {
            name: name || 'Untitled',
            description: description || '',
            version: '1.0',
            timestamp: Date.now()
        };

        // Capture synth state
        if (window.synth) {
            preset.synth = window.synth.getState();
        }

        // Capture sequencer state
        if (window.sequencer) {
            const seq = window.sequencer;
            const patternLength = seq.getPatternLength();
            const tracks = [];
            for (let t = 0; t < seq.tracks; t++) {
                const trackData = [];
                for (let s = 0; s < patternLength; s++) {
                    const step = seq.pattern[t][s];
                    trackData.push(step.active ? 1 : 0);
                }
                tracks.push(trackData);
            }
            preset.sequencer = {
                tempo: seq.tempo,
                patternLength: patternLength,
                tracks: tracks
            };
        }

        return preset;
    }

    // ===== Apply a preset =====

    applyPreset(preset) {
        if (!preset) return false;

        // Apply synth parameters
        if (preset.synth && window.synth) {
            const s = preset.synth;
            window.synth.osc1 = { ...s.osc1 };
            window.synth.osc2 = { ...s.osc2 };
            window.synth.pitch = { ...s.pitch };
            window.synth.filterParams = { ...(s.filter || s.filterParams) };
            window.synth.lfoParams = { ...(s.lfo || s.lfoParams) };
            window.synth.unison = { ...s.unison };
            window.synth.adsr = { ...s.adsr };
            window.synth.noiseLevel = s.noiseLevel || 0;

            if (window.synth.playing) {
                window.synth.stop();
                window.synth.start();
            }

            // Update synth UI
            if (window.app?.updateSynthUI) {
                window.app.updateSynthUI();
            }
        }

        // Apply sequencer pattern
        if (preset.sequencer && window.sequencer) {
            const seq = window.sequencer;
            const p = preset.sequencer;

            if (p.tempo) seq.setTempo(p.tempo);
            if (p.patternLength) seq.setPatternLength(p.patternLength);

            if (p.tracks) {
                for (let t = 0; t < Math.min(p.tracks.length, seq.tracks); t++) {
                    for (let s = 0; s < Math.min(p.tracks[t].length, seq.maxSteps); s++) {
                        seq.pattern[t][s].active = p.tracks[t][s] === 1 || p.tracks[t][s] === true;
                    }
                }
            }

            // Update sequencer UI
            if (seq.onPatternChange) seq.onPatternChange();

            // Update tempo UI
            const tempoSlider = document.getElementById('tempoSlider');
            const tempoVal = document.getElementById('tempoVal');
            if (tempoSlider) tempoSlider.value = seq.tempo;
            if (tempoVal) tempoVal.textContent = seq.tempo;
        }

        return true;
    }

    // ===== Export preset as JSON file =====

    exportPreset(preset) {
        if (!preset) {
            preset = this.capturePreset('My Preset', 'Exported from Oh My Ondas');
        }

        const json = JSON.stringify(preset, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ohmyondas-${preset.name.replace(/\s+/g, '-').toLowerCase()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log('Preset exported:', preset.name);
    }

    // ===== Import preset from JSON file =====

    importPreset() {
        return new Promise((resolve, reject) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json,application/json';

            input.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) {
                    reject(new Error('No file selected'));
                    return;
                }

                const reader = new FileReader();
                reader.onload = (ev) => {
                    try {
                        const preset = JSON.parse(ev.target.result);
                        if (!preset.name) {
                            preset.name = file.name.replace('.json', '');
                        }
                        this.applyPreset(preset);
                        resolve(preset);
                    } catch (err) {
                        reject(new Error('Invalid preset file'));
                    }
                };
                reader.readAsText(file);
            });

            input.click();
        });
    }

    // ===== Share via URL =====

    generateShareURL(preset) {
        if (!preset) {
            preset = this.capturePreset('Shared', '');
        }
        // Minify: remove description and timestamp for URL brevity
        const minimal = { ...preset };
        delete minimal.description;
        delete minimal.timestamp;
        delete minimal.version;

        const json = JSON.stringify(minimal);
        const encoded = btoa(unescape(encodeURIComponent(json)));
        const url = new URL(window.location.href.split('?')[0]);
        url.searchParams.set('preset', encoded);
        return url.toString();
    }

    loadFromURL() {
        const params = new URLSearchParams(window.location.search);
        const presetParam = params.get('preset');
        if (!presetParam) return false;

        try {
            const json = decodeURIComponent(escape(atob(presetParam)));
            const preset = JSON.parse(json);
            console.log('Loading preset from URL:', preset.name);
            this.applyPreset(preset);
            return preset;
        } catch (e) {
            console.warn('Failed to decode preset from URL:', e);
            return false;
        }
    }

    // ===== Gallery =====

    getGallery() {
        return this.builtInPresets;
    }
}

window.presetShare = new PresetShare();
