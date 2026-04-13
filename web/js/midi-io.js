// Oh My Ondas — WebMIDI Input/Output
// Uses the Web MIDI API for bi-directional MIDI communication

class MidiIO {
    constructor() {
        this.midiAccess = null;
        this.selectedInputId = null;
        this.selectedOutputId = null;
        this.currentInput = null;
        this.currentOutput = null;

        // CC mapping: CC number -> { target, param }
        // target: 'synth' | 'sampler' | 'fx'
        this.ccMappings = this.loadMappings();

        // Default CC mappings (GM-ish)
        if (Object.keys(this.ccMappings).length === 0) {
            this.ccMappings = {
                1:  { target: 'synth', param: 'filterCutoff', min: 20, max: 8000, label: 'Filter Cutoff' },
                71: { target: 'synth', param: 'filterResonance', min: 0, max: 30, label: 'Resonance' },
                7:  { target: 'synth', param: 'volume', min: 0, max: 100, label: 'Volume' },
                74: { target: 'synth', param: 'filterCutoff', min: 20, max: 8000, label: 'Brightness' },
                5:  { target: 'synth', param: 'glide', min: 0, max: 500, label: 'Portamento' },
                10: { target: 'synth', param: 'pan', min: -100, max: 100, label: 'Pan' },
                91: { target: 'fx', param: 'reverb', min: 0, max: 100, label: 'Reverb' },
                93: { target: 'fx', param: 'delay', min: 0, max: 100, label: 'Delay' }
            };
        }

        // Note-to-pad mapping (for drum pads, notes 36-43 = GM kick/snare/hat etc.)
        this.drumNoteMap = [36, 38, 42, 46, 45, 47, 49, 51];

        // MIDI output channel assignments
        this.drumChannel = 9;       // GM channel 10 (0-indexed = 9)
        this.melodicChannels = [0, 1, 2]; // Channels 1-3 for melodic tracks

        // Listeners
        this.onStateChange = null;  // Called when devices connect/disconnect
        this.available = false;
    }

    async init() {
        if (!navigator.requestMIDIAccess) {
            console.log('WebMIDI not supported in this browser');
            this.available = false;
            return false;
        }

        try {
            this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
            this.available = true;

            // Listen for device connect/disconnect
            this.midiAccess.onstatechange = (e) => {
                console.log('MIDI device state change:', e.port.name, e.port.state);
                if (this.onStateChange) this.onStateChange();
            };

            // Restore saved device selections
            const savedInput = localStorage.getItem('ohmyondas_midi_input');
            const savedOutput = localStorage.getItem('ohmyondas_midi_output');
            if (savedInput) this.selectInput(savedInput);
            if (savedOutput) this.selectOutput(savedOutput);

            console.log('WebMIDI initialized');
            return true;
        } catch (err) {
            console.warn('WebMIDI access denied:', err);
            this.available = false;
            return false;
        }
    }

    // ===== Device enumeration =====

    getInputs() {
        if (!this.midiAccess) return [];
        const inputs = [];
        this.midiAccess.inputs.forEach((input) => {
            inputs.push({ id: input.id, name: input.name, manufacturer: input.manufacturer });
        });
        return inputs;
    }

    getOutputs() {
        if (!this.midiAccess) return [];
        const outputs = [];
        this.midiAccess.outputs.forEach((output) => {
            outputs.push({ id: output.id, name: output.name, manufacturer: output.manufacturer });
        });
        return outputs;
    }

    // ===== Input selection & handling =====

    selectInput(deviceId) {
        // Disconnect previous input
        if (this.currentInput) {
            this.currentInput.onmidimessage = null;
            this.currentInput = null;
        }

        if (!deviceId || !this.midiAccess) {
            this.selectedInputId = null;
            localStorage.removeItem('ohmyondas_midi_input');
            return;
        }

        const input = this.midiAccess.inputs.get(deviceId);
        if (!input) {
            console.warn('MIDI input not found:', deviceId);
            return;
        }

        this.currentInput = input;
        this.selectedInputId = deviceId;
        localStorage.setItem('ohmyondas_midi_input', deviceId);

        input.onmidimessage = (msg) => this.handleMIDIMessage(msg);
        console.log('MIDI input connected:', input.name);
    }

    // ===== Output selection =====

    selectOutput(deviceId) {
        if (!deviceId || !this.midiAccess) {
            this.currentOutput = null;
            this.selectedOutputId = null;
            localStorage.removeItem('ohmyondas_midi_output');
            return;
        }

        const output = this.midiAccess.outputs.get(deviceId);
        if (!output) {
            console.warn('MIDI output not found:', deviceId);
            return;
        }

        this.currentOutput = output;
        this.selectedOutputId = deviceId;
        localStorage.setItem('ohmyondas_midi_output', deviceId);
        console.log('MIDI output connected:', output.name);
    }

    // ===== Incoming MIDI message handler =====

    handleMIDIMessage(msg) {
        const [status, data1, data2] = msg.data;
        const messageType = status & 0xF0;
        const channel = status & 0x0F;

        switch (messageType) {
            case 0x90: // Note On
                if (data2 > 0) {
                    this.handleNoteOn(channel, data1, data2);
                } else {
                    this.handleNoteOff(channel, data1);
                }
                break;
            case 0x80: // Note Off
                this.handleNoteOff(channel, data1);
                break;
            case 0xB0: // Control Change
                this.handleCC(channel, data1, data2);
                break;
        }
    }

    handleNoteOn(channel, note, velocity) {
        // Map incoming notes to pads/samples
        const padIndex = this.drumNoteMap.indexOf(note);
        if (padIndex !== -1) {
            // Trigger the sampler pad
            if (window.sampler) {
                window.sampler.trigger(padIndex, { velocity: velocity / 127 });
            }
            // Visual feedback
            const pad = document.querySelector(`.pad[data-pad="${padIndex}"]`);
            if (pad) {
                pad.classList.add('active');
                setTimeout(() => pad.classList.remove('active'), 100);
            }
            // Record in dub mode
            if (window.sequencer?.dubMode !== 'off' && window.sequencer?.playing) {
                window.sequencer.recordDubTrigger(padIndex, {}, Math.round(velocity / 1.27));
            }
        } else {
            // Melodic note: convert MIDI note to frequency and trigger synth
            const freq = 440 * Math.pow(2, (note - 69) / 12);
            if (window.synth) {
                window.synth.triggerNote(freq, 0.3);
            }
        }
    }

    handleNoteOff(channel, note) {
        // Currently triggerNote is fire-and-forget with ADSR,
        // so note off is a no-op for now
    }

    handleCC(channel, ccNumber, value) {
        const mapping = this.ccMappings[ccNumber];
        if (!mapping) return;

        const { target, param, min, max } = mapping;
        // Scale 0-127 to min-max
        const scaled = min + (value / 127) * (max - min);

        switch (target) {
            case 'synth':
                this.applySynthCC(param, scaled);
                break;
            case 'fx':
                this.applyFxCC(param, scaled);
                break;
            case 'sampler':
                this.applySamplerCC(param, scaled);
                break;
        }
    }

    applySynthCC(param, value) {
        if (!window.synth) return;
        switch (param) {
            case 'filterCutoff':
                window.synth.setFilterCutoff(value);
                this.updateUISlider('filterCutoff', value);
                break;
            case 'filterResonance':
                window.synth.setFilterResonance(value);
                this.updateUISlider('filterRes', value);
                break;
            case 'volume':
                if (window.audioEngine) {
                    window.audioEngine.setChannelLevel('synth', value / 100);
                }
                break;
            case 'glide':
                window.synth.setGlide(value);
                break;
            case 'lfoRate':
                window.synth.setLFORate(value);
                break;
            case 'lfoDepth':
                window.synth.setLFODepth(value);
                break;
        }
    }

    applyFxCC(param, value) {
        if (!window.mangleEngine) return;
        switch (param) {
            case 'delay':
                window.mangleEngine.setChannelDelayMix?.('master', value);
                break;
            case 'reverb':
                window.mangleEngine.setReverbMix?.(value);
                break;
        }
    }

    applySamplerCC(param, value) {
        // Future: sample pitch, filter per pad, etc.
    }

    updateUISlider(sliderId, value) {
        const slider = document.getElementById(sliderId);
        if (slider) {
            slider.value = value;
            slider.dispatchEvent(new Event('input'));
        }
    }

    // ===== MIDI Output: send notes from sequencer =====

    sendNoteOn(channel, note, velocity) {
        if (!this.currentOutput) return;
        this.currentOutput.send([0x90 | (channel & 0x0F), note & 0x7F, velocity & 0x7F]);
    }

    sendNoteOff(channel, note) {
        if (!this.currentOutput) return;
        this.currentOutput.send([0x80 | (channel & 0x0F), note & 0x7F, 0]);
    }

    // Called by the sequencer tick to send MIDI out for a triggered step
    sendSequencerNote(trackIndex, source, pLocks, velocity) {
        if (!this.currentOutput) return;

        let channel, note;

        if (source === 'sampler') {
            // Drums go to GM channel 10
            channel = this.drumChannel;
            note = this.drumNoteMap[trackIndex] || 36;
        } else {
            // Melodic tracks go to channels 1-3
            channel = this.melodicChannels[Math.min(trackIndex, this.melodicChannels.length - 1)];
            const baseNotes = [48, 50, 52, 53, 55, 57, 59, 60];
            note = baseNotes[trackIndex] || 60;
            if (pLocks && pLocks.pitch !== null) {
                note += pLocks.pitch;
            }
        }

        note = Math.min(127, Math.max(0, note));
        const vel = Math.min(127, Math.max(1, Math.round((velocity || 100) * 1.27)));

        this.sendNoteOn(channel, note, vel);

        // Auto note-off after a 16th note duration
        const stepMs = (60000 / (window.sequencer?.tempo || 120)) / 4;
        setTimeout(() => this.sendNoteOff(channel, note), stepMs * 0.9);
    }

    // ===== CC Mapping management =====

    setMapping(ccNumber, target, param, min, max, label) {
        this.ccMappings[ccNumber] = { target, param, min, max, label: label || `CC${ccNumber}` };
        this.saveMappings();
    }

    removeMapping(ccNumber) {
        delete this.ccMappings[ccNumber];
        this.saveMappings();
    }

    getMappings() {
        return { ...this.ccMappings };
    }

    saveMappings() {
        localStorage.setItem('ohmyondas_midi_cc_mappings', JSON.stringify(this.ccMappings));
    }

    loadMappings() {
        try {
            const stored = localStorage.getItem('ohmyondas_midi_cc_mappings');
            return stored ? JSON.parse(stored) : {};
        } catch (e) {
            return {};
        }
    }

    resetMappings() {
        localStorage.removeItem('ohmyondas_midi_cc_mappings');
        this.ccMappings = {};
        // Re-init will set defaults
    }

    // ===== Status =====

    isAvailable() {
        return this.available;
    }

    getStatus() {
        if (!this.available) return 'No MIDI support';
        const inputs = this.getInputs();
        const outputs = this.getOutputs();
        if (inputs.length === 0 && outputs.length === 0) return 'No MIDI devices found';
        const parts = [];
        if (this.currentInput) parts.push('IN: ' + this.currentInput.name);
        if (this.currentOutput) parts.push('OUT: ' + this.currentOutput.name);
        return parts.length > 0 ? parts.join(' | ') : `${inputs.length} in / ${outputs.length} out available`;
    }
}

window.midiIO = new MidiIO();
