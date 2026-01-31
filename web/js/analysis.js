/**
 * Oh My Ondas v2.5.2 - Analysis Page Controller
 * Reads session state from localStorage, renders live dashboard or frozen snapshot.
 */
class AnalysisPage {
    constructor() {
        this.state = null;
        this.frozen = false;
        this.pollInterval = null;
    }

    init() {
        this.readState();
        this.pollInterval = setInterval(() => {
            if (!this.frozen) this.readState();
        }, 500);

        document.getElementById('btnSnapshot').onclick = () => this.snapshot();
        document.getElementById('btnRefresh').onclick = () => this.readState();
    }

    readState() {
        try {
            const raw = localStorage.getItem('ohmyondas_analysis');
            if (!raw) {
                document.getElementById('noData').style.display = '';
                document.getElementById('analysisContent').style.display = 'none';
                return;
            }
            this.state = JSON.parse(raw);
            document.getElementById('noData').style.display = 'none';
            document.getElementById('analysisContent').style.display = '';
            this.renderAll();
        } catch(e) {
            // Ignore parse errors
        }
    }

    snapshot() {
        this.frozen = !this.frozen;
        const dot = document.getElementById('statusDot');
        const label = document.getElementById('statusLabel');
        const btn = document.getElementById('btnSnapshot');
        if (this.frozen) {
            dot.classList.add('frozen');
            label.textContent = 'SNAPSHOT';
            btn.classList.add('active');
        } else {
            dot.classList.remove('frozen');
            label.textContent = 'LIVE';
            btn.classList.remove('active');
        }
    }

    renderAll() {
        if (!this.state) return;
        this.renderStatusBar();
        this.renderOverview();
        this.renderAudio();
        this.renderPattern();
        this.renderSources();
        this.renderProcessing();
        this.renderScenes();
    }

    // --- Section renderers ---

    renderStatusBar() {
        const timeEl = document.getElementById('statusTime');
        if (timeEl && this.state.timestamp) {
            timeEl.textContent = 'Updated: ' + this.formatTime(this.state.timestamp);
        }
    }

    renderOverview() {
        const s = this.state;

        // Context card
        const vibe = s.context?.vibe || '--';
        const vibeEl = document.getElementById('ctxVibe');
        vibeEl.textContent = vibe.toUpperCase();
        vibeEl.className = 'card-value';
        if (vibe !== '--') vibeEl.classList.add('vibe-' + vibe);

        const ctxParts = [];
        if (s.context?.location) ctxParts.push('Location: ' + s.context.location);
        if (s.context?.timeOfDay) ctxParts.push('Time: ' + s.context.timeOfDay);
        if (s.context?.gps) {
            const g = s.context.gps;
            ctxParts.push('GPS: ' + (g.lat?.toFixed(4) || '--') + ', ' + (g.lon?.toFixed(4) || '--'));
        }
        document.getElementById('ctxDetail').textContent = ctxParts.join(' | ') || '--';

        // Tempo card
        document.getElementById('tempoValue').textContent = (s.tempo || '--') + ' BPM';
        const tempoParts = [];
        if (s.swing != null) tempoParts.push('Swing: ' + s.swing + '%');
        if (s.patternLength) tempoParts.push('Length: ' + s.patternLength + ' steps');
        document.getElementById('tempoDetail').textContent = tempoParts.join(' | ') || '--';

        // Mode card
        document.getElementById('modeValue').textContent = (s.mode || '--').toUpperCase();
        const modeParts = [];
        if (s.synthPlaying) modeParts.push('Synth: playing');
        if (s.micActive) modeParts.push('Mic: active');
        document.getElementById('modeDetail').textContent = modeParts.join(' | ') || 'Idle';

        // Arrangement card
        const blockCount = s.arrangement?.length || 0;
        document.getElementById('arrValue').textContent = blockCount + ' blocks';
        const sceneCount = s.scenes ? s.scenes.filter(sc => sc != null).length : 0;
        document.getElementById('arrDetail').textContent = sceneCount + ' scenes saved';
    }

    renderAudio() {
        this.drawSpectrum('spectrumCanvas');

        // Channel meters
        const metersEl = document.getElementById('channelMeters');
        const channels = s => s?.audio?.channels || {};
        const ch = channels(this.state);
        const names = ['mic', 'samples', 'synth', 'radio'];

        let html = '';
        names.forEach(name => {
            const data = ch[name];
            const hasSignal = data?.hasSignal;
            const rms = data?.rms || 0;
            const freq = data?.dominantFreq || 0;
            html += `<div class="channel-meter">
                <div class="signal-dot ${hasSignal ? 'active' : 'silent'}"></div>
                <span class="channel-name">${name}</span>
                <div class="level-bar"><div class="level-bar-fill" style="width:${Math.min(rms, 100)}%"></div></div>
                <span class="channel-freq">${freq ? this.formatFreq(freq) : '--'}</span>
            </div>`;
        });
        metersEl.innerHTML = html;

        // Summary
        const master = this.state.audio?.master;
        const summaryParts = [];
        if (master?.rms != null) {
            let level;
            if (master.rms < 5) level = 'SILENT';
            else if (master.rms < 20) level = 'QUIET';
            else if (master.rms < 70) level = 'GOOD';
            else if (master.rms < 90) level = 'LOUD';
            else level = 'CLIPPING';
            summaryParts.push('Level: ' + level);
        }
        if (master?.spectralCentroid != null) {
            let character;
            if (master.spectralCentroid < 500) character = 'Dark';
            else if (master.spectralCentroid < 2000) character = 'Warm';
            else if (master.spectralCentroid < 5000) character = 'Bright';
            else character = 'Harsh';
            summaryParts.push('Character: ' + character);
        }
        const activeNames = names.filter(n => ch[n]?.hasSignal);
        if (activeNames.length) summaryParts.push('Active: ' + activeNames.join(', '));
        if (master?.dominantFreq) summaryParts.push('Dominant: ' + this.formatFreq(master.dominantFreq));

        document.getElementById('audioSummary').textContent = summaryParts.join('  |  ') || '--';
    }

    renderPattern() {
        this.drawPatternGrid('patternCanvas');

        const pattern = this.state.pattern;
        const length = this.state.patternLength || 16;
        const sources = this.state.trackSources || [];
        const tbody = document.getElementById('trackTableBody');
        let html = '';

        for (let t = 0; t < 8; t++) {
            const track = pattern?.[t];
            const stats = this.computeTrackStats(track, length);
            const density = stats.total ? Math.round((stats.active / stats.total) * 100) : 0;
            html += `<tr>
                <td>${t + 1}</td>
                <td>${sources[t] || '--'}</td>
                <td>${stats.active} / ${stats.total}</td>
                <td><span class="density-bar"><span class="density-bar-fill" style="width:${density}%"></span></span> ${density}%</td>
                <td>${stats.plockCount}</td>
                <td>${stats.trigCondCount}</td>
            </tr>`;
        }
        tbody.innerHTML = html;

        // Rhythm notes
        const syncopation = this.computeSyncopation(pattern, length);
        const notes = [];
        notes.push('Syncopation: ' + (syncopation * 100).toFixed(0) + '%');
        if (syncopation > 0.5) notes.push('Off-beat heavy pattern');
        else if (syncopation < 0.2) notes.push('Straight / on-beat pattern');
        document.getElementById('rhythmNotes').textContent = notes.join('  |  ');
    }

    renderSources() {
        const pads = this.state.pads || [];
        const tbody = document.getElementById('padsTableBody');
        let html = '';

        for (let i = 0; i < 8; i++) {
            const pad = pads[i];
            const name = pad?.name || '--';
            const source = pad?.source || '--';
            const gps = pad?.gps ? (pad.gps.lat?.toFixed(4) + ', ' + pad.gps.lon?.toFixed(4)) : '--';
            const time = pad?.captureTime ? this.formatTime(pad.captureTime) : '--';
            const hasBuffer = pad?.hasBuffer ? 'Yes' : 'No';
            html += `<tr>
                <td>${i + 1}</td>
                <td>${name}</td>
                <td>${source}</td>
                <td>${gps}</td>
                <td>${time}</td>
                <td>${hasBuffer}</td>
            </tr>`;
        }
        tbody.innerHTML = html;

        // Synth card
        const synth = this.state.synth;
        if (synth) {
            const lines = [];
            if (synth.osc1) lines.push('OSC1: ' + (synth.osc1.wave || '--'));
            if (synth.osc2) lines.push('OSC2: ' + (synth.osc2.wave || '--') + ' (detune: ' + (synth.osc2.detune || 0) + ')');
            if (synth.filter) lines.push('Filter: ' + (synth.filter.type || '--') + ' cutoff=' + (synth.filter.cutoff || '--') + ' reso=' + (synth.filter.resonance || '--'));
            if (synth.lfo) lines.push('LFO: ' + (synth.lfo.target || '--') + ' rate=' + (synth.lfo.rate || '--') + ' depth=' + (synth.lfo.depth || '--'));
            if (synth.adsr) lines.push('ADSR: A=' + (synth.adsr.attack || 0) + ' D=' + (synth.adsr.decay || 0) + ' S=' + (synth.adsr.sustain || 0) + ' R=' + (synth.adsr.release || 0));
            if (synth.unison) lines.push('Unison: ' + (synth.unison.voices || 1) + ' voices, spread=' + (synth.unison.spread || 0));
            document.getElementById('synthDetail').innerHTML = lines.join('<br>') || '--';
        } else {
            document.getElementById('synthDetail').textContent = '--';
        }

        // Radio card
        const ctx = this.state.context;
        if (ctx?.radioStation) {
            document.getElementById('radioDetail').textContent = ctx.radioStation + (ctx.radioGenre ? ' (' + ctx.radioGenre + ')' : '');
        } else {
            document.getElementById('radioDetail').textContent = 'Not playing';
        }
    }

    renderProcessing() {
        // FX card
        const fxList = this.describeFX(this.state.fx);
        let fxHtml = '';
        fxList.forEach(fx => {
            fxHtml += `<div class="fx-card">
                <div class="fx-header">
                    <span class="fx-name">${fx.name}</span>
                    <span class="fx-badge ${fx.enabled ? 'on' : 'off'}">${fx.enabled ? 'ON' : 'OFF'}</span>
                </div>
                <div class="fx-params">${fx.params}</div>
            </div>`;
        });
        document.getElementById('fxContent').innerHTML = fxHtml || '--';

        // Mixer card
        const mixer = this.state.mixer || {};
        const eq = this.state.eq || {};
        const mutes = this.state.trackMutes || [];
        const solos = this.state.trackSolos || [];
        const chNames = ['mic', 'samples', 'synth', 'radio'];
        let mixHtml = '';

        chNames.forEach(name => {
            const ch = mixer[name] || {};
            const level = ch.level || 0;
            const muted = ch.muted;
            const eqVals = eq[name];
            const eqStr = eqVals ? `Lo:${eqVals.lo || 0} Mid:${eqVals.mid || 0} Hi:${eqVals.hi || 0}` : '';

            mixHtml += `<div class="mixer-row">
                <span class="mixer-ch-name">${name}</span>
                <div class="mixer-level-bar"><div class="mixer-level-fill" style="width:${level}%"></div></div>
                <span class="mixer-indicators">
                    ${muted ? '<span class="mute-indicator">M</span>' : ''}
                    ${eqStr ? '<span class="eq-vals">' + eqStr + '</span>' : ''}
                </span>
            </div>`;
        });

        // Master
        const masterLevel = mixer.master || 0;
        const masterEq = eq.master;
        const masterEqStr = masterEq ? `Lo:${masterEq.lo || 0} Mid:${masterEq.mid || 0} Hi:${masterEq.hi || 0}` : '';
        mixHtml += `<div class="mixer-row" style="border-top:1px solid var(--border);padding-top:10px;margin-top:6px;">
            <span class="mixer-ch-name">MASTER</span>
            <div class="mixer-level-bar"><div class="mixer-level-fill" style="width:${masterLevel}%;background:var(--accent);"></div></div>
            <span class="mixer-indicators"><span class="eq-vals">${masterEqStr}</span></span>
        </div>`;

        document.getElementById('mixerContent').innerHTML = mixHtml;

        // Signal flow
        let flowLines = [];
        chNames.forEach(name => {
            const ch = mixer[name] || {};
            const eqVals = eq[name];
            const eqStr = eqVals ? `EQ (lo:${eqVals.lo || 0} mid:${eqVals.mid || 0} hi:${eqVals.hi || 0})` : 'EQ (flat)';
            const gainFactor = ch.level ? (ch.level / 80 * 3).toFixed(1) : '1.0';
            flowLines.push(`${name.toUpperCase()} → gain ${gainFactor}x → ${eqStr} → master EQ → out`);
        });
        document.getElementById('signalFlow').innerHTML = flowLines.join('<br>');
    }

    renderScenes() {
        const scenes = this.state.scenes || [];
        const metrics = [
            { name: 'Tempo', key: 'tempo' },
            { name: 'Active Steps', key: 'activeSteps' },
            { name: 'Vibe', key: 'vibe' },
            { name: 'Mic Level', key: 'micLevel' },
            { name: 'Samples Level', key: 'samplesLevel' },
            { name: 'Synth Level', key: 'synthLevel' },
            { name: 'Radio Level', key: 'radioLevel' },
            { name: 'Delay Mix', key: 'delayMix' },
            { name: 'Grain Density', key: 'grainDensity' }
        ];

        const extractMetric = (scene, key) => {
            if (!scene) return '--';
            switch(key) {
                case 'tempo': return scene.tempo || '--';
                case 'activeSteps': return scene.activeSteps || '--';
                case 'vibe': return scene.vibe || '--';
                case 'micLevel': return scene.mixer?.mic?.level ?? '--';
                case 'samplesLevel': return scene.mixer?.samples?.level ?? '--';
                case 'synthLevel': return scene.mixer?.synth?.level ?? '--';
                case 'radioLevel': return scene.mixer?.radio?.level ?? '--';
                case 'delayMix': return scene.fx?.delay?.mix ?? '--';
                case 'grainDensity': return scene.fx?.grain?.density ?? '--';
                default: return '--';
            }
        };

        const tbody = document.getElementById('sceneTableBody');
        let html = '';

        metrics.forEach(m => {
            const vals = [0,1,2,3].map(i => extractMetric(scenes[i], m.key));
            const refVal = vals[0];
            html += '<tr>';
            html += `<td>${m.name}</td>`;
            vals.forEach((v, i) => {
                const diff = (i > 0 && v !== '--' && refVal !== '--' && v !== refVal) ? ' class="scene-diff"' : '';
                html += `<td${diff}>${v}</td>`;
            });
            html += '</tr>';
        });

        tbody.innerHTML = html;
    }

    // --- Canvas helpers ---

    drawSpectrum(canvasId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;

        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, w, h);

        const freqData = this.state.audio?.master?.freqData;
        if (!freqData || !freqData.length) {
            ctx.fillStyle = '#333';
            ctx.font = '13px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('No frequency data', w / 2, h / 2);
            return;
        }

        const bins = freqData.length;
        const barW = Math.max(1, (w - 20) / bins);
        const maxVal = 255;

        for (let i = 0; i < bins; i++) {
            const val = freqData[i] || 0;
            const barH = (val / maxVal) * (h - 10);
            const x = 10 + i * barW;
            const green = Math.floor(100 + (val / maxVal) * 155);
            ctx.fillStyle = `rgb(0, ${green}, 50)`;
            ctx.fillRect(x, h - barH, Math.max(1, barW - 1), barH);
        }
    }

    drawPatternGrid(canvasId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;

        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, w, h);

        const pattern = this.state.pattern;
        const length = this.state.patternLength || 16;
        const sources = this.state.trackSources || [];
        const mutes = this.state.trackMutes || [];

        if (!pattern) {
            ctx.fillStyle = '#333';
            ctx.font = '13px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('No pattern data', w / 2, h / 2);
            return;
        }

        const rows = 8;
        const padX = 40;
        const padY = 10;
        const cellW = (w - padX - 10) / length;
        const cellH = (h - padY * 2) / rows;

        const sourceColors = {
            sampler: '#ff6b2b',
            synth: '#9b59b6',
            radio: '#ffc003',
            mic: '#1270b8'
        };

        // Track labels
        ctx.fillStyle = '#666';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'right';
        for (let t = 0; t < rows; t++) {
            const y = padY + t * cellH + cellH / 2 + 3;
            ctx.fillText('T' + (t + 1), padX - 6, y);
        }

        for (let t = 0; t < rows; t++) {
            const track = pattern[t];
            if (!track) continue;
            const isMuted = mutes[t];
            const color = sourceColors[sources[t]] || '#888';

            for (let s = 0; s < length; s++) {
                const x = padX + s * cellW;
                const y = padY + t * cellH;

                // Grid cell background
                ctx.fillStyle = '#222';
                ctx.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);

                const step = track[s];
                const isActive = step && (step === 1 || step?.active || step?.trig);

                if (isActive) {
                    ctx.fillStyle = isMuted ? '#444' : color;
                    ctx.globalAlpha = isMuted ? 0.3 : 0.85;
                    ctx.fillRect(x + 2, y + 2, cellW - 4, cellH - 4);
                    ctx.globalAlpha = 1;

                    // P-Lock dot overlay
                    const hasPlock = step?.plock || step?.plocks;
                    if (hasPlock) {
                        ctx.fillStyle = '#fff';
                        ctx.beginPath();
                        ctx.arc(x + cellW - 5, y + 5, 2, 0, Math.PI * 2);
                        ctx.fill();
                    }

                    // Trig condition marker
                    const hasCond = step?.condition || step?.trigCondition;
                    if (hasCond) {
                        ctx.fillStyle = '#ffc003';
                        ctx.fillRect(x + 2, y + cellH - 4, 4, 2);
                    }
                }
            }
        }
    }

    // --- Computation helpers ---

    computeTrackStats(trackData, length) {
        const result = { active: 0, total: length, plockCount: 0, trigCondCount: 0 };
        if (!trackData) return result;

        for (let s = 0; s < length; s++) {
            const step = trackData[s];
            if (!step) continue;
            const isActive = step === 1 || step?.active || step?.trig;
            if (isActive) result.active++;
            if (step?.plock || step?.plocks) result.plockCount++;
            if (step?.condition || step?.trigCondition) result.trigCondCount++;
        }
        return result;
    }

    computeSyncopation(pattern, length) {
        if (!pattern) return 0;
        let onBeat = 0;
        let offBeat = 0;

        for (let t = 0; t < 8; t++) {
            const track = pattern[t];
            if (!track) continue;
            for (let s = 0; s < length; s++) {
                const step = track[s];
                const isActive = step && (step === 1 || step?.active || step?.trig);
                if (!isActive) continue;
                if (s % 4 === 0) onBeat++;
                else offBeat++;
            }
        }

        const total = onBeat + offBeat;
        return total > 0 ? offBeat / total : 0;
    }

    describeFX(fx) {
        if (!fx) return [];
        const result = [];

        const fxNames = ['crusher', 'glitch', 'grain', 'delay'];
        fxNames.forEach(name => {
            const effect = fx[name];
            if (!effect) return;
            const enabled = effect.enabled || effect.active || false;
            const params = [];
            Object.keys(effect).forEach(k => {
                if (k === 'enabled' || k === 'active') return;
                params.push(k + ': ' + effect[k]);
            });
            result.push({
                name: name.charAt(0).toUpperCase() + name.slice(1),
                enabled,
                params: params.join(', ') || 'No parameters'
            });
        });

        return result;
    }

    describeSignalFlow(channelName) {
        const mixer = this.state.mixer || {};
        const eq = this.state.eq || {};
        const ch = mixer[channelName] || {};
        const eqVals = eq[channelName];
        const eqStr = eqVals ? `EQ (lo:${eqVals.lo || 0} mid:${eqVals.mid || 0} hi:${eqVals.hi || 0})` : 'EQ (flat)';
        const gainFactor = ch.level ? (ch.level / 80 * 3).toFixed(1) : '1.0';
        return `${channelName.toUpperCase()} → gain ${gainFactor}x → ${eqStr} → master EQ → out`;
    }

    formatFreq(hz) {
        if (hz == null) return '--';
        return hz >= 1000 ? (hz / 1000).toFixed(1) + 'kHz' : Math.round(hz) + 'Hz';
    }

    formatTime(ms) {
        return new Date(ms).toLocaleTimeString();
    }
}

window.addEventListener('DOMContentLoaded', () => new AnalysisPage().init());
