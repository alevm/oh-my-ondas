// Oh My Ondas - GPS Location Tracking

class GPSTracker {
    constructor() {
        this.currentPosition = null;
        this.watchId = null;
        this.listeners = [];
        this.error = null;
    }

    async init() {
        if (!navigator.geolocation) {
            this.error = 'Geolocation not supported';
            console.warn('GPS: Geolocation not supported');
            return false;
        }

        try {
            // Request initial position
            const position = await this.getCurrentPosition();
            this.currentPosition = this.formatPosition(position);
            this.notifyListeners();

            // Start watching
            this.startWatching();

            console.log('GPS initialized:', this.currentPosition);
            return true;

        } catch (err) {
            this.error = this.getErrorMessage(err);
            console.warn('GPS init error:', this.error);
            return false;
        }
    }

    getCurrentPosition() {
        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 60000
            });
        });
    }

    startWatching() {
        if (this.watchId) return;

        this.watchId = navigator.geolocation.watchPosition(
            (position) => {
                this.currentPosition = this.formatPosition(position);
                this.error = null;
                this.notifyListeners();
            },
            (err) => {
                this.error = this.getErrorMessage(err);
                this.notifyListeners();
            },
            {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 30000
            }
        );
    }

    stopWatching() {
        if (this.watchId) {
            navigator.geolocation.clearWatch(this.watchId);
            this.watchId = null;
        }
    }

    formatPosition(position) {
        return {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            altitude: position.coords.altitude,
            timestamp: position.timestamp,
            formatted: this.formatCoords(position.coords.latitude, position.coords.longitude)
        };
    }

    formatCoords(lat, lon) {
        const latDir = lat >= 0 ? 'N' : 'S';
        const lonDir = lon >= 0 ? 'E' : 'W';
        return `${Math.abs(lat).toFixed(5)}°${latDir}, ${Math.abs(lon).toFixed(5)}°${lonDir}`;
    }

    getErrorMessage(err) {
        switch (err.code) {
            case 1: return 'Permission denied';
            case 2: return 'Position unavailable';
            case 3: return 'Timeout';
            default: return 'Unknown error';
        }
    }

    getPosition() {
        return this.currentPosition;
    }

    getError() {
        return this.error;
    }

    getDisplayString() {
        if (this.error) {
            return `GPS: ${this.error}`;
        }
        if (this.currentPosition) {
            return `GPS: ${this.currentPosition.formatted}`;
        }
        return 'GPS: waiting...';
    }

    // Get metadata for embedding in recordings
    getMetadata() {
        if (!this.currentPosition) return null;

        return {
            latitude: this.currentPosition.latitude,
            longitude: this.currentPosition.longitude,
            accuracy: this.currentPosition.accuracy,
            altitude: this.currentPosition.altitude,
            timestamp: new Date().toISOString(),
            formatted: this.currentPosition.formatted
        };
    }

    // Listener pattern
    addListener(callback) {
        this.listeners.push(callback);
    }

    removeListener(callback) {
        this.listeners = this.listeners.filter(l => l !== callback);
    }

    notifyListeners() {
        for (const listener of this.listeners) {
            listener(this.currentPosition, this.error);
        }
    }

    // Get static map image URL
    getMapImageUrl(width = 400, height = 300) {
        if (!this.currentPosition) return null;

        const lat = this.currentPosition.latitude;
        const lon = this.currentPosition.longitude;
        const zoom = 15;

        // Using geoapify static maps API (free tier, no key needed for basic usage)
        // return `https://maps.geoapify.com/v1/staticmap?style=osm-bright&width=${width}&height=${height}&center=lonlat:${lon},${lat}&zoom=${zoom}`;

        // Alternative: Use OpenStreetMap tile directly as background
        // Calculate tile coordinates
        const n = Math.pow(2, zoom);
        const xtile = Math.floor((lon + 180) / 360 * n);
        const ytile = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n);

        // Return OSM tile URL
        return `https://tile.openstreetmap.org/${zoom}/${xtile}/${ytile}.png`;
    }

    // Update location display
    updateLocationImage() {
        const imageEl = document.getElementById('locationImage');
        const coordsEl = document.getElementById('locationCoords');

        if (this.currentPosition) {
            // Update coordinates overlay
            if (coordsEl) {
                coordsEl.textContent = this.currentPosition.formatted;
            }

            // Update placeholder text to show coordinates
            if (imageEl) {
                const textEl = imageEl.querySelector('.location-text');
                if (textEl) {
                    textEl.textContent = this.currentPosition.formatted;
                }
            }
        } else if (this.error) {
            if (imageEl) {
                const textEl = imageEl.querySelector('.location-text');
                if (textEl) {
                    textEl.textContent = this.error;
                }
            }
            if (coordsEl) {
                coordsEl.textContent = this.error;
            }
        }
    }

    // Haversine distance in meters between two positions {latitude, longitude}
    static getDistanceBetween(pos1, pos2) {
        const R = 6371000; // Earth radius in meters
        const toRad = deg => deg * Math.PI / 180;
        const dLat = toRad(pos2.latitude - pos1.latitude);
        const dLon = toRad(pos2.longitude - pos1.longitude);
        const a = Math.sin(dLat / 2) ** 2 +
                  Math.cos(toRad(pos1.latitude)) * Math.cos(toRad(pos2.latitude)) *
                  Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    // Sum of consecutive Haversine distances for an array of {latitude, longitude}
    static getTotalDistance(positions) {
        let total = 0;
        for (let i = 1; i < positions.length; i++) {
            total += GPSTracker.getDistanceBetween(positions[i - 1], positions[i]);
        }
        return total;
    }
}

// Global instance
window.gpsTracker = new GPSTracker();
