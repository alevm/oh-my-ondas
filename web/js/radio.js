// Oh My Ondas - Internet Radio Player

class RadioPlayer {
    constructor() {
        this.audio = null;
        this.sourceNode = null;
        this.currentStation = null;
        this.playing = false;

        // RadioBrowser API base URL (free, no auth required)
        this.apiBase = 'https://de1.api.radio-browser.info/json';
    }

    async init() {
        // Create audio element for streaming
        this.audio = new Audio();
        this.audio.crossOrigin = 'anonymous';
        this.audio.preload = 'none';

        console.log('Radio initialized');
        return true;
    }

    async searchStations(query = '', country = '', tag = '') {
        try {
            const params = new URLSearchParams();
            if (query) params.append('name', query);
            if (country) params.append('countrycode', country);
            if (tag) params.append('tag', tag);
            params.append('limit', '20');
            params.append('order', 'clickcount');
            params.append('reverse', 'true');
            params.append('hidebroken', 'true');

            const response = await fetch(`${this.apiBase}/stations/search?${params}`);
            const stations = await response.json();

            return stations.map(s => ({
                id: s.stationuuid,
                name: s.name,
                url: s.url_resolved || s.url,
                genre: s.tags?.split(',')[0] || 'Unknown',
                country: s.country,
                codec: s.codec,
                bitrate: s.bitrate
            }));

        } catch (err) {
            console.error('Radio search failed:', err);
            return [];
        }
    }

    async play(station) {
        const ctx = window.audioEngine.getContext();
        if (!ctx) return false;

        // Stop current but don't clear source node
        if (this.audio) {
            this.audio.pause();
        }

        try {
            this.currentStation = station;
            this.audio.src = station.url;

            // Create source from audio element (only once)
            if (!this.sourceNode) {
                this.sourceNode = ctx.createMediaElementSource(this.audio);

                // Add gain boost for radio
                this.radioGain = ctx.createGain();
                this.radioGain.gain.value = 1.5;

                this.sourceNode.connect(this.radioGain);
                window.audioEngine.connectToChannel(this.radioGain, 'radio');
                console.log('Radio connected to audio engine');
            }

            await this.audio.play();
            this.playing = true;

            console.log('Now playing:', station.name, 'URL:', station.url);
            return true;

        } catch (err) {
            console.error('Radio play failed:', err);
            console.error('Station URL:', station.url);
            this.currentStation = null;
            return false;
        }
    }

    stop() {
        if (this.audio) {
            this.audio.pause();
            // Don't clear src - just pause
        }
        this.playing = false;
        this.currentStation = null;
    }

    // Check if radio is actually outputting audio
    isConnected() {
        return this.sourceNode !== null;
    }

    isPlaying() {
        return this.playing;
    }

    getCurrentStation() {
        return this.currentStation;
    }

    setVolume(level) {
        if (this.audio) {
            this.audio.volume = level;
        }
    }

    // Search for local stations based on GPS location
    async searchLocalStations() {
        const gps = window.gpsTracker?.getPosition();
        if (!gps) {
            console.log('No GPS data for local radio search');
            return [];
        }

        try {
            // Use RadioBrowser geo search
            const params = new URLSearchParams();
            params.append('limit', '10');
            params.append('order', 'clickcount');
            params.append('reverse', 'true');
            params.append('hidebroken', 'true');

            // Search by coordinates (within ~100km radius)
            const response = await fetch(`${this.apiBase}/stations/search?${params}&geo_lat=${gps.lat}&geo_long=${gps.lng}&geo_radius=100000`);

            if (!response.ok) {
                // Fallback: try reverse geocoding to get country
                return await this.searchByCountryFromGPS(gps);
            }

            const stations = await response.json();

            if (stations.length === 0) {
                // No local stations found, try country search
                return await this.searchByCountryFromGPS(gps);
            }

            return stations.map(s => ({
                id: s.stationuuid,
                name: s.name,
                url: s.url_resolved || s.url,
                genre: s.tags?.split(',')[0] || 'Unknown',
                country: s.country,
                codec: s.codec,
                bitrate: s.bitrate,
                distance: s.geo_distance
            }));

        } catch (err) {
            console.error('Local radio search failed:', err);
            return [];
        }
    }

    // Fallback: search by country using GPS reverse geocoding
    async searchByCountryFromGPS(gps) {
        try {
            // Use Nominatim for reverse geocoding (free)
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${gps.lat}&lon=${gps.lng}&format=json`);
            const data = await response.json();

            const countryCode = data.address?.country_code?.toUpperCase();
            if (countryCode) {
                console.log('Found country from GPS:', countryCode);
                return await this.searchStations('', countryCode);
            }
        } catch (err) {
            console.error('Reverse geocoding failed:', err);
        }
        return [];
    }

    async captureToBuffer(durationMs = 3000) {
        if (!this.playing || !this.radioGain) return null;

        const ctx = window.audioEngine.getContext();
        if (!ctx) return null;

        try {
            const dest = ctx.createMediaStreamDestination();
            this.radioGain.connect(dest);

            const recorder = new MediaRecorder(dest.stream, {
                mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : ''
            });
            const chunks = [];
            recorder.ondataavailable = e => chunks.push(e.data);

            return new Promise((resolve) => {
                recorder.onstop = async () => {
                    try {
                        this.radioGain.disconnect(dest);
                    } catch (e) {}
                    const blob = new Blob(chunks, { type: recorder.mimeType });
                    const arrayBuffer = await blob.arrayBuffer();
                    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
                    resolve(audioBuffer);
                };
                recorder.start();
                setTimeout(() => recorder.stop(), durationMs);
            });
        } catch (err) {
            console.error('Radio capture failed:', err);
            return null;
        }
    }

    // Auto-tune to a random local station
    async autoTuneLocal() {
        const stations = await this.searchLocalStations();
        if (stations.length > 0) {
            const station = stations[Math.floor(Math.random() * Math.min(5, stations.length))];
            await this.play(station);
            return station;
        }
        return null;
    }
}

// Global instance
window.radioPlayer = new RadioPlayer();
