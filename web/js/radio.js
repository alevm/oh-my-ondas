// Oh My Ondas - Internet Radio Player

// Rate limiter for Nominatim API (1 req/sec max per OSM policy)
// Shared global to avoid duplicate declarations across modules
if (!window.nominatimRateLimiter) {
    window.nominatimRateLimiter = {
        lastCall: 0,
        minInterval: 1100, // 1.1 seconds to be safe
        async throttledFetch(url) {
            const now = Date.now();
            const wait = Math.max(0, this.lastCall + this.minInterval - now);
            if (wait > 0) await new Promise(r => setTimeout(r, wait));
            this.lastCall = Date.now();
            return fetch(url);
        }
    };
}
const nominatimRateLimiter = window.nominatimRateLimiter;

class RadioPlayer {
    constructor() {
        this.audio = null;
        this.sourceNode = null;
        this.currentStation = null;
        this.playing = false;
        this.corsSupported = false;

        // RadioBrowser API base URL (free, no auth required)
        this.apiBase = 'https://de1.api.radio-browser.info/json';

        // Station queue for retry logic
        this.stationQueue = [];

        // Fallback stations with known CORS support
        this.fallbackStations = [
            { name: 'SomaFM Drone Zone', url: 'https://ice2.somafm.com/dronezone-128-mp3', genre: 'Ambient' },
            { name: 'SomaFM Groove Salad', url: 'https://ice2.somafm.com/groovesalad-128-mp3', genre: 'Chill' },
            { name: 'SomaFM DEF CON', url: 'https://ice2.somafm.com/defcon-128-mp3', genre: 'Electronic' },
            { name: 'SomaFM Fluid', url: 'https://ice2.somafm.com/fluid-128-mp3', genre: 'Downtempo' },
            { name: 'Radio Paradise Main', url: 'https://stream.radioparadise.com/mp3-128', genre: 'Eclectic' }
        ];
    }

    async init() {
        // Create audio element for streaming (no crossOrigin yet — set dynamically in play)
        this.audio = new Audio();
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

    async play(station, withCors = true) {
        const ctx = window.audioEngine?.getContext();
        if (!ctx) return false;

        // Stop current
        if (this.audio) {
            this.audio.pause();
            this.audio.removeAttribute('src');
            this.audio.onerror = null;
            this.audio.onplaying = null;
            this.audio.onstalled = null;
        }

        this.playing = false;
        this.currentStation = station;
        this.corsSupported = withCors;

        try {
            // Set crossOrigin dynamically
            if (withCors) {
                this.audio.crossOrigin = 'anonymous';
            } else {
                this.audio.removeAttribute('crossOrigin');
            }

            // Set up error/stall handlers before setting src
            this.audio.onerror = () => {
                console.warn(`Radio error on: ${station.name} (CORS=${withCors})`);
                if (withCors) {
                    // Retry without CORS — audio plays through element directly
                    console.log('Retrying without CORS...');
                    this.play(station, false);
                } else {
                    this._tryNextStation();
                }
            };

            this.audio.onstalled = () => {
                console.warn(`Radio stalled: ${station.name}`);
            };

            // Timeout: if not playing within 5s, try next
            const playTimeout = setTimeout(() => {
                if (!this.playing) {
                    console.warn(`Radio timeout on: ${station.name} (CORS=${withCors})`);
                    if (withCors) {
                        this.play(station, false);
                    } else {
                        this._tryNextStation();
                    }
                }
            }, 5000);

            this.audio.onplaying = () => {
                clearTimeout(playTimeout);
                this.playing = true;
                console.log('Now playing:', station.name, 'URL:', station.url, 'CORS:', withCors);
                this._connectToWebAudio(ctx, withCors);
            };

            this.audio.src = station.url;
            await this.audio.play();
            return true;

        } catch (err) {
            console.error('Radio play failed:', err, 'Station:', station.name);
            if (withCors) {
                // Retry without CORS
                return this.play(station, false);
            }
            this.currentStation = null;
            this._tryNextStation();
            return false;
        }
    }

    // Connect audio element to Web Audio graph (only if CORS is supported)
    _connectToWebAudio(ctx, withCors) {
        if (!this.sourceNode) {
            if (withCors) {
                try {
                    this.sourceNode = ctx.createMediaElementSource(this.audio);

                    this.radioGain = ctx.createGain();
                    this.radioGain.gain.value = 1.5;

                    this.sourceNode.connect(this.radioGain);
                    window.audioEngine.connectToChannel(this.radioGain, 'radio');
                    console.log('Radio connected to audio engine (Web Audio routed)');
                } catch (e) {
                    console.warn('Radio: createMediaElementSource failed, audio plays through element directly:', e.message);
                }
            } else {
                console.log('Radio playing through element directly (no CORS, no Web Audio routing)');
            }
        }
    }

    // Try the next station in the queue
    _tryNextStation() {
        if (this.stationQueue.length > 0) {
            const next = this.stationQueue.shift();
            console.log(`Radio: trying next station: ${next.name} (${this.stationQueue.length} remaining)`);
            this.play(next);
        } else {
            console.warn('Radio: all stations in queue failed');
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
            const response = await fetch(`${this.apiBase}/stations/search?${params}&geo_lat=${gps.latitude}&geo_long=${gps.longitude}&geo_radius=100000`);

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
            // Use Nominatim for reverse geocoding (rate-limited per OSM policy)
            const response = await nominatimRateLimiter.throttledFetch(`https://nominatim.openstreetmap.org/reverse?lat=${gps.latitude}&lon=${gps.longitude}&format=json`);
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

    // Auto-tune to a random local station, with fallback station queue
    async autoTuneLocal() {
        const stations = await this.searchLocalStations();

        // Build queue: search results first, then fallback stations
        this.stationQueue = [...stations, ...this.fallbackStations];

        if (this.stationQueue.length > 0) {
            const station = this.stationQueue.shift();
            await this.play(station);
            return station;
        }
        return null;
    }

    // Play a random fallback station directly (ultimate safety net)
    async playFallback() {
        const station = this.fallbackStations[Math.floor(Math.random() * this.fallbackStations.length)];
        console.log('Radio: playing fallback station:', station.name);
        this.stationQueue = [...this.fallbackStations.filter(s => s.url !== station.url)];
        await this.play(station);
        return station;
    }
}

// Global instance
window.radioPlayer = new RadioPlayer();
