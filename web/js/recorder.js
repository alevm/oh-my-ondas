// Oh My Ondas - Session Recorder

class SessionRecorder {
    constructor() {
        this.mediaRecorder = null;
        this.chunks = [];
        this.recording = false;
        this.startTime = null;
        this.recordings = [];

        // Load saved recordings from localStorage
        this.loadRecordings();
    }

    async init() {
        console.log('Recorder initialized');
        return true;
    }

    start() {
        const stream = window.audioEngine.getRecordingStream();
        if (!stream) {
            console.error('No recording stream available');
            return false;
        }

        this.chunks = [];

        // Determine best supported format
        const mimeType = this.getSupportedMimeType();

        try {
            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: mimeType,
                audioBitsPerSecond: 128000
            });
        } catch (e) {
            // Fallback without options
            this.mediaRecorder = new MediaRecorder(stream);
        }

        this.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                this.chunks.push(e.data);
            }
        };

        this.mediaRecorder.onstop = () => {
            this.finalizeRecording();
        };

        this.mediaRecorder.start(1000); // Collect data every second
        this.startTime = Date.now();
        this.recording = true;

        console.log('Recording started');
        return true;
    }

    stop() {
        if (this.mediaRecorder && this.recording) {
            this.mediaRecorder.stop();
            this.recording = false;
            console.log('Recording stopped');
        }
    }

    isRecording() {
        return this.recording;
    }

    getElapsedTime() {
        if (!this.startTime) return 0;
        return Date.now() - this.startTime;
    }

    getFormattedTime() {
        const elapsed = this.getElapsedTime();
        const seconds = Math.floor(elapsed / 1000) % 60;
        const minutes = Math.floor(elapsed / 60000);
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    getSupportedMimeType() {
        const types = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/ogg;codecs=opus',
            'audio/mp4'
        ];

        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) {
                return type;
            }
        }
        return 'audio/webm';
    }

    finalizeRecording() {
        const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
        const blob = new Blob(this.chunks, { type: mimeType });

        // Get GPS metadata
        const gpsData = window.gpsTracker.getMetadata();

        // Create recording entry
        const recording = {
            id: Date.now().toString(),
            name: this.generateName(),
            timestamp: new Date().toISOString(),
            duration: this.getElapsedTime(),
            gps: gpsData,
            mimeType: mimeType,
            size: blob.size
        };

        // Store blob in memory (would use IndexedDB for persistence)
        recording.blob = blob;
        recording.url = URL.createObjectURL(blob);

        this.recordings.unshift(recording);
        this.saveRecordings();

        console.log('Recording saved:', recording.name);

        // Notify listeners
        if (this.onRecordingComplete) {
            this.onRecordingComplete(recording);
        }
    }

    generateName() {
        const now = new Date();
        const date = now.toISOString().split('T')[0];
        const time = now.toTimeString().split(' ')[0].replace(/:/g, '-');

        // Include GPS in filename if available
        const gps = window.gpsTracker?.getPosition();
        if (gps) {
            // Format: lat_lon with 4 decimal places, replace dots and minus signs for filename safety
            const lat = gps.latitude.toFixed(4).replace('.', 'd').replace('-', 'n');
            const lon = gps.longitude.toFixed(4).replace('.', 'd').replace('-', 'n');
            return `ohmyondas_${date}_${time}_${lat}_${lon}`;
        }

        return `ohmyondas_${date}_${time}`;
    }

    getRecordings() {
        return this.recordings;
    }

    deleteRecording(id) {
        const index = this.recordings.findIndex(r => r.id === id);
        if (index !== -1) {
            const recording = this.recordings[index];
            if (recording.url) {
                URL.revokeObjectURL(recording.url);
            }
            this.recordings.splice(index, 1);
            this.saveRecordings();
        }
    }

    renameRecording(id, newName) {
        const recording = this.recordings.find(r => r.id === id);
        if (recording) {
            recording.name = newName;
            this.saveRecordings();
        }
    }

    downloadRecording(id) {
        const recording = this.recordings.find(r => r.id === id);
        if (!recording || !recording.blob) return;

        // Determine file extension
        const ext = recording.mimeType.includes('webm') ? 'webm' :
                   recording.mimeType.includes('ogg') ? 'ogg' :
                   recording.mimeType.includes('mp4') ? 'm4a' : 'webm';

        // Create download link
        const a = document.createElement('a');
        a.href = recording.url;
        a.download = `${recording.name}.${ext}`;
        a.click();

        // Also download metadata JSON
        this.downloadMetadata(recording);
    }

    downloadMetadata(recording) {
        const metadata = {
            name: recording.name,
            timestamp: recording.timestamp,
            duration_ms: recording.duration,
            gps: recording.gps,
            format: recording.mimeType,
            size_bytes: recording.size,
            app: 'Oh My Ondas Web',
            version: '1.0.0'
        };

        const blob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `${recording.name}_metadata.json`;
        a.click();

        URL.revokeObjectURL(url);
    }

    // localStorage persistence (metadata only, blobs are session-only)
    saveRecordings() {
        const metadata = this.recordings.map(r => ({
            id: r.id,
            name: r.name,
            timestamp: r.timestamp,
            duration: r.duration,
            gps: r.gps,
            mimeType: r.mimeType,
            size: r.size
        }));

        try {
            localStorage.setItem('ohmyondas_recordings', JSON.stringify(metadata));
        } catch (e) {
            console.warn('Could not save recordings to localStorage');
        }
    }

    loadRecordings() {
        try {
            const data = localStorage.getItem('ohmyondas_recordings');
            if (data) {
                // Load metadata only (blobs are lost on page refresh)
                this.recordings = JSON.parse(data).map(r => ({
                    ...r,
                    blob: null,
                    url: null,
                    expired: true
                }));
            }
        } catch (e) {
            this.recordings = [];
        }
    }
}

// Global instance
window.sessionRecorder = new SessionRecorder();
