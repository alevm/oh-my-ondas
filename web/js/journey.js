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

// Rate limiter: reuse shared global defined in radio.js
// (radio.js loads first and creates window.nominatimRateLimiter)

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

        // Persist journey
        this.saveToStorage();
        this._renderSavedJourneys();

        const stats = this.getStats();
        this._setStatus(`Journey complete — ${stats.distance}m, ${stats.duration}, ${stats.waypointCount} wpts, ${stats.avgSpeedKmh} km/h`);
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
        const elapsedSec = elapsed / 1000;
        const avgSpeed = elapsedSec > 0 ? Math.round((distance / elapsedSec) * 10) / 10 : 0;
        const avgSpeedKmh = Math.round(avgSpeed * 3.6 * 10) / 10;

        return {
            distance: Math.round(distance),
            duration: `${mins}:${secs.toString().padStart(2, '0')}`,
            durationMs: elapsed,
            waypointCount: this.waypoints.length,
            breadcrumbs: this.route.length,
            avgSpeed,
            avgSpeedKmh
        };
    }

    // --- Persistence ---

    saveToStorage() {
        const key = `journey_${this.startTime || Date.now()}`;
        const data = {
            startTime: this.startTime,
            endTime: this.endTime,
            route: this.route,
            waypoints: this.waypoints,
            stats: this.getStats()
        };
        try {
            localStorage.setItem(key, JSON.stringify(data));
            console.log(`[JOURNEY] Saved to ${key}`);
        } catch (e) {
            console.warn('[JOURNEY] Save failed:', e);
        }
    }

    loadFromStorage(key) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            const data = JSON.parse(raw);
            this.startTime = data.startTime;
            this.endTime = data.endTime;
            this.route = data.route || [];
            this.waypoints = data.waypoints || [];
            this.waypointIndex = this.waypoints.length;

            // Rebuild map markers
            this.initMap();
            this.markers.forEach(m => m.remove());
            this.markers = [];
            if (this.polyline) this.polyline.setLatLngs([]);
            this.updateMap();
            for (const wp of this.waypoints) {
                this.addMapMarker(wp);
            }
            this._renderWaypointsList();
            this._updateUI();
            console.log(`[JOURNEY] Loaded ${key}`);
            return data;
        } catch (e) {
            console.warn('[JOURNEY] Load failed:', e);
            return null;
        }
    }

    listSavedJourneys() {
        const journeys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('journey_')) {
                try {
                    const data = JSON.parse(localStorage.getItem(key));
                    journeys.push({
                        key,
                        date: new Date(data.startTime).toLocaleDateString(),
                        distance: data.stats?.distance || 0,
                        waypoints: data.stats?.waypointCount || 0
                    });
                } catch (e) {}
            }
        }
        return journeys.sort((a, b) => b.key.localeCompare(a.key));
    }

    // --- GPX Export ---

    exportGPX() {
        const gpxHeader = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="OhMyOndas"
     xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>Oh My Ondas Journey</name>
    <time>${new Date(this.startTime || Date.now()).toISOString()}</time>
  </metadata>`;

        // Waypoints
        let wptXml = '';
        for (const wp of this.waypoints) {
            const name = (wp.locationName || wp.letter).replace(/[<>&"']/g, '');
            wptXml += `
  <wpt lat="${wp.lat}" lon="${wp.lon}">
    <name>${name}</name>
    <time>${new Date(wp.timestamp).toISOString()}</time>
  </wpt>`;
        }

        // Track
        let trkXml = `
  <trk>
    <name>Journey Route</name>
    <trkseg>`;
        for (const pt of this.route) {
            trkXml += `
      <trkpt lat="${pt.lat}" lon="${pt.lon}">
        <time>${new Date(pt.timestamp).toISOString()}</time>
      </trkpt>`;
        }
        trkXml += `
    </trkseg>
  </trk>`;

        const gpx = gpxHeader + wptXml + trkXml + '\n</gpx>';

        // Trigger download
        const blob = new Blob([gpx], { type: 'application/gpx+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ohmyondas-journey-${new Date(this.startTime || Date.now()).toISOString().slice(0, 10)}.gpx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log('[JOURNEY] GPX exported');
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

        // Reverse geocode (rate-limited per OSM policy)
        try {
            const url = `https://nominatim.openstreetmap.org/reverse?lat=${pos.lat}&lon=${pos.lon}&format=json&zoom=16`;
            const resp = await window.nominatimRateLimiter.throttledFetch(url);
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
            statsEl.textContent = `${stats.distance}m | ${stats.duration} | ${stats.waypointCount} wpts | ${stats.avgSpeedKmh} km/h`;
        }
    }

    _renderSavedJourneys() {
        const list = document.getElementById('journeySaved');
        if (!list) return;

        const journeys = this.listSavedJourneys();
        list.innerHTML = '';

        if (journeys.length === 0) {
            list.innerHTML = '<div class="journey-empty">No saved journeys</div>';
            return;
        }

        for (const j of journeys) {
            const item = document.createElement('div');
            item.className = 'journey-saved-item';
            item.innerHTML =
                `<span class="js-date">${escapeHtml(j.date)}</span>` +
                `<span class="js-dist">${j.distance}m</span>` +
                `<span class="js-wpts">${j.waypoints} wpts</span>`;
            item.addEventListener('click', () => this.loadFromStorage(j.key));
            list.appendChild(item);
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
    const gpxBtn = document.getElementById('journeyExportGPX');

    if (startBtn) startBtn.addEventListener('click', () => window.journey.startJourney());
    if (wpBtn) wpBtn.addEventListener('click', () => window.journey.addWaypoint());
    if (endBtn) endBtn.addEventListener('click', () => window.journey.endJourney());
    if (gpxBtn) gpxBtn.addEventListener('click', () => window.journey.exportGPX());

    // Render saved journeys on load
    window.journey._renderSavedJourneys();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initJourneyUI);
} else {
    initJourneyUI();
}
