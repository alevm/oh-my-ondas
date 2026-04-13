// Oh My Ondas — MIDI Export
// Exports sequencer patterns as Standard MIDI File (SMF Type 1)

class MidiExport {
    constructor() {
        this.TICKS_PER_BEAT = 480; // Standard resolution
    }

    // Write a variable-length quantity (VLQ) used in MIDI
    writeVLQ(value) {
        const bytes = [];
        bytes.push(value & 0x7F);
        value >>= 7;
        while (value > 0) {
            bytes.push((value & 0x7F) | 0x80);
            value >>= 7;
        }
        return bytes.reverse();
    }

    // Write a 16-bit big-endian integer
    write16(value) {
        return [(value >> 8) & 0xFF, value & 0xFF];
    }

    // Write a 32-bit big-endian integer
    write32(value) {
        return [(value >> 24) & 0xFF, (value >> 16) & 0xFF, (value >> 8) & 0xFF, value & 0xFF];
    }

    // Write a string as bytes
    writeString(str) {
        return Array.from(str).map(c => c.charCodeAt(0));
    }

    // Create a tempo meta event
    tempoEvent(bpm) {
        const microsPerBeat = Math.round(60000000 / bpm);
        return [
            0xFF, 0x51, 0x03,
            (microsPerBeat >> 16) & 0xFF,
            (microsPerBeat >> 8) & 0xFF,
            microsPerBeat & 0xFF
        ];
    }

    // Create a track name meta event
    trackNameEvent(name) {
        const nameBytes = this.writeString(name);
        return [0xFF, 0x03, ...this.writeVLQ(nameBytes.length), ...nameBytes];
    }

    // Create an end-of-track meta event
    endOfTrack() {
        return [0xFF, 0x2F, 0x00];
    }

    // Build a single MIDI track from sequencer track data
    buildTrack(trackData, trackIndex, patternLength, source, tempo) {
        const events = [];
        const ticksPerStep = this.TICKS_PER_BEAT / 4; // 16th notes

        // Source-based MIDI mapping
        const sourceConfig = {
            sampler: { channel: 9, baseNote: 36 },  // GM drums, kick=36
            synth:   { channel: 0, baseNote: 48 },   // Piano, C3
            radio:   { channel: 1, baseNote: 60 },   // C4
            mic:     { channel: 2, baseNote: 72 }     // C5
        };

        const config = sourceConfig[source] || sourceConfig.sampler;
        const channel = config.channel;
        // For drums: each track gets a different percussion note
        // For melodic: use pitch from p-locks or base note + track offset
        const drumNotes = [36, 38, 42, 46, 45, 47, 49, 51]; // kick, snare, hihat, open-hh, tom-lo, tom-mid, crash, ride

        // Track name
        const trackNames = ['Kick', 'Snare', 'Hi-Hat', 'Open HH', 'Tom Lo', 'Tom Mid', 'Crash', 'Ride'];
        const name = source === 'sampler'
            ? (trackNames[trackIndex] || `Track ${trackIndex + 1}`)
            : `${source.charAt(0).toUpperCase() + source.slice(1)} ${trackIndex + 1}`;

        // Track header
        let trackBytes = [];
        // Delta=0, track name
        trackBytes.push(...this.writeVLQ(0), ...this.trackNameEvent(name));

        // Program change for melodic tracks
        if (channel !== 9) {
            const programs = { synth: 80, radio: 88, mic: 0 }; // Lead, Pad, Piano
            trackBytes.push(...this.writeVLQ(0), 0xC0 | channel, programs[source] || 0);
        }

        let lastTick = 0;

        for (let s = 0; s < patternLength; s++) {
            const step = trackData[s];
            if (!step || !step.active) continue;

            const startTick = s * ticksPerStep;
            const velocity = Math.round((step.velocity || 100) * 1.27); // Scale 0-100 to 0-127
            const vel = Math.min(127, Math.max(1, velocity));

            // Determine note
            let note;
            if (source === 'sampler') {
                note = drumNotes[trackIndex] || 36;
            } else {
                const baseNotes = [48, 50, 52, 53, 55, 57, 59, 60]; // C3 major scale
                note = baseNotes[trackIndex] || 60;
                // Apply pitch p-lock
                if (step.pLocks && step.pLocks.pitch !== null) {
                    note += step.pLocks.pitch;
                }
            }
            note = Math.min(127, Math.max(0, note));

            // Note duration: one step (16th note) unless decay p-lock extends it
            let durationTicks = ticksPerStep;
            if (step.pLocks && step.pLocks.decay !== null) {
                durationTicks = Math.round(ticksPerStep * (0.25 + step.pLocks.decay / 100 * 1.75));
            }

            // Note On
            const deltaOn = startTick - lastTick;
            trackBytes.push(...this.writeVLQ(deltaOn), 0x90 | channel, note, vel);
            lastTick = startTick;

            // Note Off
            trackBytes.push(...this.writeVLQ(durationTicks), 0x80 | channel, note, 0);
            lastTick = startTick + durationTicks;
        }

        // End of track — pad to end of pattern
        const patternEnd = patternLength * ticksPerStep;
        const deltaEnd = Math.max(0, patternEnd - lastTick);
        trackBytes.push(...this.writeVLQ(deltaEnd), ...this.endOfTrack());

        // Wrap in MTrk chunk
        return [
            ...this.writeString('MTrk'),
            ...this.write32(trackBytes.length),
            ...trackBytes
        ];
    }

    // Build the tempo/conductor track (track 0 in Type 1 MIDI)
    buildConductorTrack(tempo, patternLength) {
        let trackBytes = [];

        // Track name
        trackBytes.push(...this.writeVLQ(0), ...this.trackNameEvent('Oh My Ondas'));

        // Time signature: 4/4
        trackBytes.push(...this.writeVLQ(0), 0xFF, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08);

        // Tempo
        trackBytes.push(...this.writeVLQ(0), ...this.tempoEvent(tempo));

        // End of track
        const patternTicks = patternLength * (this.TICKS_PER_BEAT / 4);
        trackBytes.push(...this.writeVLQ(patternTicks), ...this.endOfTrack());

        return [
            ...this.writeString('MTrk'),
            ...this.write32(trackBytes.length),
            ...trackBytes
        ];
    }

    // Export current sequencer state to MIDI file
    exportPattern(patternSlotIndex) {
        const seq = window.sequencer;
        if (!seq) {
            console.error('Sequencer not available');
            return null;
        }

        const slot = typeof patternSlotIndex === 'number'
            ? seq.patternSlots[patternSlotIndex]
            : seq.patternSlots[seq.currentPatternSlot];

        if (!slot) {
            console.error('Pattern slot not found');
            return null;
        }

        const pattern = slot.tracks;
        const patternLength = slot.length || 16;
        const tempo = seq.tempo || 120;
        const numTracks = seq.tracks || 8;

        // Count non-empty tracks
        let activeTracks = 0;
        for (let t = 0; t < numTracks; t++) {
            for (let s = 0; s < patternLength; s++) {
                if (pattern[t][s] && pattern[t][s].active) {
                    activeTracks++;
                    break;
                }
            }
        }

        if (activeTracks === 0) {
            console.warn('No active steps in pattern');
        }

        // Build MIDI file
        const midiData = [];

        // MThd header: Type 1, N+1 tracks, 480 ticks/beat
        midiData.push(...this.writeString('MThd'));
        midiData.push(...this.write32(6));        // Header length
        midiData.push(...this.write16(1));        // Type 1 (multi-track)
        midiData.push(...this.write16(numTracks + 1)); // Track count (conductor + 8 tracks)
        midiData.push(...this.write16(this.TICKS_PER_BEAT));

        // Conductor track (tempo, time sig)
        midiData.push(...this.buildConductorTrack(tempo, patternLength));

        // Data tracks
        for (let t = 0; t < numTracks; t++) {
            const source = seq.trackSources[t] || 'sampler';
            midiData.push(...this.buildTrack(pattern[t], t, patternLength, source, tempo));
        }

        return new Uint8Array(midiData);
    }

    // Export all pattern slots into a single MIDI file (each slot = 1 pattern repetition)
    exportAllPatterns() {
        // For now, export the current pattern
        return this.exportPattern();
    }

    // Trigger download of MIDI file
    download(filename) {
        const data = this.exportPattern();
        if (!data) {
            alert('No pattern data to export. Add some steps to the sequencer first.');
            return;
        }

        const name = filename || `ohmyondas-pattern-${Date.now()}.mid`;
        const blob = new Blob([data], { type: 'audio/midi' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log(`MIDI exported: ${name} (${data.length} bytes)`);
    }
}

window.midiExport = new MidiExport();
