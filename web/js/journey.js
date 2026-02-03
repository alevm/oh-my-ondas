// Oh My Ondas - Journey Mode
// GPS-tracked walking sessions with audio waypoint captures

// Security: HTML escape utility to prevent XSS
function escapeHtml(str) {
    if (typeof str !== 'string') return str;
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

class Journey {
    constructor() {
        this.active = false;
        this.startTime = null;
        this.endTime = null;
        this.startPosition = null;
        this.route = [];          // GPS breadcrumbs [{lat, lon, timestamp}]
        this.waypoints = [];      // Named waypoints [{letter, lat, lon, timestamp, locationName, hasAudio}]
        this.waypointIndex = 0;   // A=0, B=1, C=2...
        this.trackingInterval = null;
        this.map = null;
        this.mapInitialized = false;
        this.polyline = null;
        this.markers = [];
    }

    // --- Leaflet Map ---

    initMap() {
        if (this.mapInitialized) return;
        const container = document.getElementById('journeyMap');
        if (!container || typeof L === 'undefined') return;

        this.map = L.map('journeyMap', {
            zoomControl: false,
            attributionControl: false
        }).setView([0, 0], 14);

        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19
        }).addTo(this.map);

        this.polyline = L.polyline([], { color: '#3388ff', weight: 3 }).addTo(this.map);
        this.mapInitialized = true;

        // Force map to recalculate size (panel may have been hidden)
        setTimeout(() => this.map.invalidateSize(), 200);
    }

    updateMap() {
        if (!this.map) return;

        // Update polyline with full route
        if (this.route.length > 0) {
            const latlngs = this.route.map(p => [p.lat, p.lon]);
            this.polyline.setLatLngs(latlngs);
        }

        // Fit bounds if we have points
        if (this.route.length > 1) {
            const bounds = this.polyline.getBounds();
            if (bounds.isValid()) {
                this.map.fitBounds(bounds, { padding: [20, 20] });
            }
        } else if (this.route.length === 1) {
            this.map.setView([this.route[0].lat, this.route[0].lon], 16);
        }
    }

    addMapMarker(wp) {
        if (!this.map) return;

        const isStart = wp.letter === 'A';
        const color = isStart ? '#22c55e' : '#14b8a6';

        const marker = L.circleMarker([wp.lat, wp.lon], {
            radius: 8,
            fillColor: color,
            color: '#fff',
            weight: 2,
            fillOpacity: 0.9
        }).addTo(this.map);

        marker.bindTooltip(wp.letter, {
            permanent: true,
            direction: 'top',
            className: 'journey-marker-label'
        });

        this.markers.push(marker);
    }

    setMapZoom(level) {
        if (this.map) {
            this.map.setZoom(Math.max(10, Math.min(18, level)));
        }
    }

    // --- Session Control ---

    async startJourney() {
        if (this.active) return;

        this.active = true;
        this.startTime = Date.now();
        this.endTime = null;
        this.route = [];
        this.waypoints = [];
        this.waypointIndex = 0;

        // Clear old markers
        this.markers.forEach(m => m.remove());
        this.markers = [];
        if (this.polyline) this.polyline.setLatLngs([]);

        // Init map if needed
        this.initMap();

        // Get start position
        const pos = await this._getCurrentGPS();
        if (pos) {
            this.startPosition = pos;
            this.route.push(pos);
            this.updateMap();

            // Auto-add start waypoint "A"
            await this._addWaypointAt(pos, false);
        }

        // Start breadcrumb tracking (every 5 seconds)
        this.trackingInterval = setInterval(() => this._trackBreadcrumb(), 5000);

        this._updateUI();
        this._setStatus('Journey started — walk and drop waypoints');
        console.log('[JOURNEY] Started', { startPosition: this.startPosition });
    }

    async addWaypoint() {
        if (!this.active) return;

        const pos = await this._getCurrentGPS();
        if (!pos) {
            this._setStatus('GPS: waiting...');
            return;
        }

        // Add to route if not already there
        this.route.push(pos);
        this.updateMap();

        // Capture waypoint with audio
        await this._addWaypointAt(pos, true);

        this._updateUI();
    }

    async endJourney() {
        if (!this.active) return;

        this.active = false;
        this.endTime = Date.now();

        // Stop tracking
        if (this.trackingInterval) {
            clearInterval(this.trackingInterval);
            this.trackingInterval = null;
        }

        // Final position
        const pos = await this._getCurrentGPS();
        if (pos) {
            this.route.push(pos);
        }

        // Mark last marker red
        if (this.markers.length > 0) {
            const last = this.markers[this.markers.length - 1];
            last.setStyle({ fillColor: '#ef4444' });
        }

        this.updateMap();
        this._updateUI();

        const stats = this.getStats();
        this._setStatus(`Journey complete — ${stats.distance}m, ${stats.duration}, ${stats.waypointCount} waypoints`);
        console.log('[JOURNEY] Ended', stats);
    }

    // --- Data Accessors ---

    getRoute() {
        return this.route;
    }

    getWaypoints() {
        return this.waypoints;
    }

    getStats() {
        const positions = this.route.map(p => ({ latitude: p.lat, longitude: p.lon }));
        const distance = GPSTracker.getTotalDistance(positions);
        const elapsed = (this.endTime || Date.now()) - (this.startTime || Date.now());
        const mins = Math.floor(elapsed / 60000);
        const secs = Math.floor((elapsed % 60000) / 1000);

        return {
            distance: Math.round(distance),
            duration: `${mins}:${secs.toString().padStart(2, '0')}`,
            durationMs: elapsed,
            waypointCount: this.waypoints.length,
            breadcrumbs: this.route.length
        };
    }

    // --- Internal Helpers ---

    async _getCurrentGPS() {
        const tracker = window.gpsTracker;
        if (tracker && tracker.currentPosition) {
            return {
                lat: tracker.currentPosition.latitude,
                lon: tracker.currentPosition.longitude,
                timestamp: Date.now()
            };
        }

        // Try to init GPS if not running
        if (tracker && !tracker.watchId) {
            await tracker.init();
            if (tracker.currentPosition) {
                return {
                    lat: tracker.currentPosition.latitude,
                    lon: tracker.currentPosition.longitude,
                    timestamp: Date.now()
                };
            }
        }

        return null;
    }

    _trackBreadcrumb() {
        if (!this.active) return;

        const tracker = window.gpsTracker;
        if (!tracker || !tracker.currentPosition) return;

        const pos = {
            lat: tracker.currentPosition.latitude,
            lon: tracker.currentPosition.longitude,
            timestamp: Date.now()
        };

        // Only add if moved at least 3 meters from last point
        if (this.route.length > 0) {
            const last = this.route[this.route.length - 1];
            const dist = GPSTracker.getDistanceBetween(
                { latitude: last.lat, longitude: last.lon },
                { latitude: pos.lat, longitude: pos.lon }
            );
            if (dist < 3) return;
        }

        this.route.push(pos);
        this.updateMap();

        // Update stats display
        const statsEl = document.getElementById('journeyStats');
        if (statsEl) {
            const stats = this.getStats();
            statsEl.textContent = `${stats.distance}m | ${stats.duration} | ${stats.waypointCount} wpts`;
        }
    }

    async _addWaypointAt(pos, captureAudio) {
        const letter = String.fromCharCode(65 + this.waypointIndex); // A, B, C...
        this.waypointIndex++;

        const wp = {
            letter,
            lat: pos.lat,
            lon: pos.lon,
            timestamp: Date.now(),
            locationName: null,
            hasAudio: false
        };

        // Reverse geocode
        try {
            const url = `https://nominatim.openstreetmap.org/reverse?lat=${pos.lat}&lon=${pos.lon}&format=json&zoom=16`;
            const resp = await fetch(url, { headers: { 'User-Agent': 'OhMyOndas/2.0' } });
            const data = await resp.json();
            if (data.address) {
                const place = data.address.road || data.address.suburb ||
                              data.address.city || data.address.town ||
                              data.address.village || '';
                wp.locationName = place || `${pos.lat.toFixed(4)}, ${pos.lon.toFixed(4)}`;
            }
        } catch (e) {
            wp.locationName = `${pos.lat.toFixed(4)}, ${pos.lon.toFixed(4)}`;
        }

        if (!wp.locationName) {
            wp.locationName = `${pos.lat.toFixed(4)}, ${pos.lon.toFixed(4)}`;
        }

        // Capture audio snapshot (reuse landmark logic)
        if (captureAudio && window.landmark) {
            try {
                wp.hasAudio = true;
                window.landmark.capture();
            } catch (e) {
                console.warn('[JOURNEY] Audio capture failed', e);
                wp.hasAudio = false;
            }
        }

        this.waypoints.push(wp);
        this.addMapMarker(wp);

        // Update waypoints list UI
        this._renderWaypointsList();

        console.log(`[JOURNEY] Waypoint ${letter}`, wp);
    }

    _renderWaypointsList() {
        const list = document.getElementById('journeyWaypoints');
        if (!list) return;

        list.innerHTML = '';
        for (const wp of this.waypoints) {
            const item = document.createElement('div');
            item.className = 'journey-wp-item';

            const time = new Date(wp.timestamp);
            const timeStr = time.getHours().toString().padStart(2, '0') + ':' +
                           time.getMinutes().toString().padStart(2, '0');

            item.innerHTML = `<span class="wp-letter">${escapeHtml(wp.letter)}</span>` +
                `<span class="wp-time">${escapeHtml(timeStr)}</span>` +
                `<span class="wp-location">${escapeHtml(wp.locationName) || '...'}</span>` +
                (wp.hasAudio ? '<span class="wp-audio-dot"></span>' : '');

            list.appendChild(item);
        }
    }

    _updateUI() {
        const startBtn = document.getElementById('journeyStart');
        const wpBtn = document.getElementById('journeyWaypoint');
        const endBtn = document.getElementById('journeyEnd');

        if (startBtn) startBtn.disabled = this.active;
        if (wpBtn) wpBtn.disabled = !this.active;
        if (endBtn) endBtn.disabled = !this.active;

        // Stats
        const statsEl = document.getElementById('journeyStats');
        if (statsEl) {
            const stats = this.getStats();
            statsEl.textContent = `${stats.distance}m | ${stats.duration} | ${stats.waypointCount} wpts`;
        }
    }

    _setStatus(text) {
        const el = document.getElementById('journeyStatus');
        if (el) el.textContent = text;
    }

    // Called when journey panel becomes visible
    onPanelShow() {
        this.initMap();
        if (this.map) {
            setTimeout(() => {
                this.map.invalidateSize();
                this.updateMap();
            }, 100);
        }
    }
}

// Global instance
window.journey = new Journey();

// Bind button handlers when DOM ready
function initJourneyUI() {
    const startBtn = document.getElementById('journeyStart');
    const wpBtn = document.getElementById('journeyWaypoint');
    const endBtn = document.getElementById('journeyEnd');

    if (startBtn) startBtn.addEventListener('click', () => window.journey.startJourney());
    if (wpBtn) wpBtn.addEventListener('click', () => window.journey.addWaypoint());
    if (endBtn) endBtn.addEventListener('click', () => window.journey.endJourney());
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initJourneyUI);
} else {
    initJourneyUI();
}
