// Oh My Ondas - App: Recordings, admin modal, MIDI settings, preset sharing, GPS
// Methods of App (js/app.js), split out by area; loaded right after app.js.

class AppAdmin {
    // Recordings
    setupRecordings() {
        const listBtn = document.getElementById('recListBtn');

        if (listBtn) {
            listBtn.addEventListener('click', () => {
                this.updateRecordingsList();
            });
        }

        this.updateRecCount();
    }

    updateRecCount() {
        const countEl = document.getElementById('recCount');
        if (countEl) {
            const recordings = window.sessionRecorder?.getRecordings() || [];
            countEl.textContent = recordings.length;
        }
    }

    updateRecordingsList() {
        const recList = document.getElementById('recList');
        if (!recList) return;

        const recordings = window.sessionRecorder.getRecordings();

        if (!recordings || recordings.length === 0) {
            recList.innerHTML = '<div style="color:#888;font-size:8px;padding:2px;">No recordings</div>';
            return;
        }

        recList.innerHTML = recordings.map((rec) => `
            <div class="rec-item" data-id="${escapeHtml(rec.id)}">
                <span class="rec-item-name" data-id="${escapeHtml(rec.id)}">${escapeHtml(rec.name) || 'Rec'}</span>
                ${rec.url ? `<button class="rec-item-play" data-id="${escapeHtml(rec.id)}">▶</button>` : ''}
                ${rec.blob ? `<button class="rec-item-dl" data-id="${escapeHtml(rec.id)}">↓</button>` : ''}
                <button class="rec-item-del" data-id="${escapeHtml(rec.id)}">✕</button>
            </div>
        `).join('');

        // Play buttons
        recList.querySelectorAll('.rec-item-play').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                const rec = recordings.find(r => r.id === id);
                if (rec && rec.url) {
                    const audio = new Audio(rec.url);
                    audio.play();
                }
            });
        });

        // Download buttons
        recList.querySelectorAll('.rec-item-dl').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                window.sessionRecorder.downloadRecording(id);
            });
        });

        // Delete buttons
        recList.querySelectorAll('.rec-item-del').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                window.sessionRecorder.deleteRecording(id);
                this.updateRecordingsList();
                this.updateRecCount();
            });
        });

        // Rename on double-click
        recList.querySelectorAll('.rec-item-name').forEach(span => {
            span.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                const id = span.dataset.id;
                const newName = prompt('Rename recording:', span.textContent);
                if (newName && newName.trim()) {
                    window.sessionRecorder.renameRecording(id, newName.trim());
                    this.updateRecordingsList();
                }
            });
        });
    }

    // Admin Modal
    setupAdminModal() {
        const adminBtn = document.getElementById('btnAdmin');
        const adminBtnE = document.getElementById('btnAdminE');
        const modal = document.getElementById('adminModal');
        const closeBtn = document.getElementById('closeAdmin');

        const showAdmin = () => {
            if (modal) {
                modal.classList.remove('hidden');
                this.populateAdminModal();
            }
        };
        if (adminBtn) adminBtn.addEventListener('click', showAdmin);
        if (adminBtnE) adminBtnE.addEventListener('click', showAdmin);

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modal.classList.add('hidden');
            });
        }

        // Close on backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
            }
        });

        // Kit selection
        document.getElementById('kitList').addEventListener('click', (e) => {
            const item = e.target.closest('.kit-item');
            if (item) {
                document.querySelectorAll('.kit-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                const kit = item.dataset.kit;
                window.sampler.setBank(kit);
                this.settings.selectedKit = kit;
                this.saveSettings();
            }
        });

        // Synth presets
        document.getElementById('synthPresets').addEventListener('click', (e) => {
            const item = e.target.closest('.preset-item');
            if (item) {
                document.querySelectorAll('.preset-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                this.settings.synthPreset = item.dataset.preset;
                this.saveSettings();
                // TODO: Apply synth preset
            }
        });

        // Theme buttons
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.setTheme(btn.dataset.theme);
            });
        });

        // Settings selects
        document.getElementById('recFormat')?.addEventListener('change', (e) => {
            this.settings.recFormat = e.target.value;
            this.saveSettings();
        });

        document.getElementById('recAutoSave')?.addEventListener('change', (e) => {
            this.settings.recAutoSave = e.target.value;
            this.saveSettings();
        });

        document.getElementById('recGpsEmbed')?.addEventListener('change', (e) => {
            this.settings.recGpsEmbed = e.target.checked;
            this.saveSettings();
        });

        document.getElementById('seqTracks')?.addEventListener('change', (e) => {
            this.settings.seqTracks = parseInt(e.target.value);
            this.saveSettings();
            // Would need to rebuild sequencer UI
        });

        document.getElementById('seqSteps')?.addEventListener('change', (e) => {
            this.settings.seqSteps = parseInt(e.target.value);
            this.saveSettings();
            // Would need to rebuild sequencer UI
        });

        // Upload kit button
        const uploadKitBtn = document.getElementById('uploadKitBtn');
        const uploadKit = document.getElementById('uploadKit');

        uploadKitBtn?.addEventListener('click', () => {
            uploadKit.click();
        });

        uploadKit?.addEventListener('change', (e) => {
            const files = e.target.files;
            if (files.length > 0) {
                console.log('Upload kit files:', files);
                // TODO: Process uploaded audio files
            }
        });
    }

    // ===== MIDI Settings UI =====
    setupMidiSettings() {
        const midi = window.midiIO;
        if (!midi) return;

        const inputSelect = document.getElementById('midiInputSelect');
        const outputSelect = document.getElementById('midiOutputSelect');
        const statusEl = document.getElementById('midiStatus');

        const refreshDevices = () => {
            if (!midi.isAvailable()) {
                if (statusEl) statusEl.textContent = 'No MIDI devices found';
                return;
            }

            // Populate input dropdown
            if (inputSelect) {
                const inputs = midi.getInputs();
                inputSelect.innerHTML = '<option value="">-- None --</option>';
                inputs.forEach(d => {
                    const opt = document.createElement('option');
                    opt.value = d.id;
                    opt.textContent = d.name;
                    if (d.id === midi.selectedInputId) opt.selected = true;
                    inputSelect.appendChild(opt);
                });
            }

            // Populate output dropdown
            if (outputSelect) {
                const outputs = midi.getOutputs();
                outputSelect.innerHTML = '<option value="">-- None --</option>';
                outputs.forEach(d => {
                    const opt = document.createElement('option');
                    opt.value = d.id;
                    opt.textContent = d.name;
                    if (d.id === midi.selectedOutputId) opt.selected = true;
                    outputSelect.appendChild(opt);
                });
            }

            if (statusEl) statusEl.textContent = midi.getStatus();
        };

        // Device selection
        inputSelect?.addEventListener('change', () => {
            midi.selectInput(inputSelect.value || null);
            if (statusEl) statusEl.textContent = midi.getStatus();
        });

        outputSelect?.addEventListener('change', () => {
            midi.selectOutput(outputSelect.value || null);
            if (statusEl) statusEl.textContent = midi.getStatus();
        });

        // Re-populate on device changes
        midi.onStateChange = refreshDevices;

        // Initial populate
        refreshDevices();

        // CC mapping UI
        this.renderCCMappings();

        const addBtn = document.getElementById('midiCCAdd');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                const ccNum = parseInt(document.getElementById('midiCCNum')?.value);
                const target = document.getElementById('midiCCTarget')?.value;
                const param = document.getElementById('midiCCParam')?.value;
                if (isNaN(ccNum) || ccNum < 0 || ccNum > 127) return;

                // Determine min/max based on param
                const ranges = {
                    filterCutoff: [20, 8000],
                    filterResonance: [0, 30],
                    volume: [0, 100],
                    glide: [0, 500],
                    lfoRate: [0, 20],
                    lfoDepth: [0, 100],
                    delay: [0, 100],
                    reverb: [0, 100]
                };
                const [min, max] = ranges[param] || [0, 127];
                midi.setMapping(ccNum, target, param, min, max, `CC${ccNum} -> ${param}`);
                this.renderCCMappings();
            });
        }
    }

    renderCCMappings() {
        const list = document.getElementById('midiCCList');
        if (!list || !window.midiIO) return;

        const mappings = window.midiIO.getMappings();
        list.innerHTML = '';

        Object.keys(mappings).sort((a, b) => a - b).forEach(cc => {
            const m = mappings[cc];
            const row = document.createElement('div');
            row.className = 'midi-cc-row';
            row.innerHTML = `<span>CC${cc}</span><span>${m.target}.${m.param}</span>` +
                `<button class="midi-cc-del" data-cc="${cc}" title="Remove mapping">x</button>`;
            list.appendChild(row);
        });

        list.querySelectorAll('.midi-cc-del').forEach(btn => {
            btn.addEventListener('click', () => {
                window.midiIO.removeMapping(parseInt(btn.dataset.cc));
                this.renderCCMappings();
            });
        });
    }

    // ===== Preset Sharing UI =====
    setupPresetShare() {
        const ps = window.presetShare;
        if (!ps) return;

        // Export button
        document.getElementById('presetExport')?.addEventListener('click', () => {
            const name = prompt('Preset name:', 'My Preset');
            if (!name) return;
            const desc = prompt('Description (optional):', '') || '';
            const preset = ps.capturePreset(name, desc);
            ps.exportPreset(preset);
        });

        // Import button
        document.getElementById('presetImport')?.addEventListener('click', () => {
            ps.importPreset().then(preset => {
                console.log('Imported preset:', preset.name);
                alert('Preset loaded: ' + preset.name);
            }).catch(err => {
                console.warn('Import failed:', err);
                alert('Failed to import preset: ' + err.message);
            });
        });

        // Share URL button
        document.getElementById('presetShareURL')?.addEventListener('click', () => {
            const name = prompt('Preset name for sharing:', 'Shared Preset');
            if (!name) return;
            const preset = ps.capturePreset(name, '');
            const url = ps.generateShareURL(preset);

            // Copy to clipboard
            navigator.clipboard.writeText(url).then(() => {
                alert('Share URL copied to clipboard!');
            }).catch(() => {
                // Fallback: show the URL
                prompt('Copy this URL:', url);
            });
        });

        // Render gallery
        this.renderPresetGallery();
    }

    renderPresetGallery() {
        const list = document.getElementById('presetGalleryList');
        const ps = window.presetShare;
        if (!list || !ps) return;

        list.innerHTML = '';
        ps.getGallery().forEach((preset) => {
            const item = document.createElement('div');
            item.className = 'preset-gallery-item';
            item.title = preset.description;
            item.innerHTML = `<span class="preset-gallery-name">${preset.name}</span>` +
                `<span class="preset-gallery-desc">${preset.description}</span>`;
            item.addEventListener('click', () => {
                ps.applyPreset(preset);
                console.log('Applied gallery preset:', preset.name);
                // Visual feedback
                list.querySelectorAll('.preset-gallery-item').forEach(el => el.classList.remove('active'));
                item.classList.add('active');
            });
            list.appendChild(item);
        });
    }

    populateAdminModal() {
        // Sync UI with current settings
        document.querySelectorAll('.kit-item').forEach(item => {
            item.classList.toggle('active', item.dataset.kit === this.settings.selectedKit);
        });

        document.querySelectorAll('.preset-item').forEach(item => {
            item.classList.toggle('active', item.dataset.preset === this.settings.synthPreset);
        });

        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === this.settings.theme);
        });

        const recFormat = document.getElementById('recFormat');
        const recAutoSave = document.getElementById('recAutoSave');
        const recGpsEmbed = document.getElementById('recGpsEmbed');
        const seqTracks = document.getElementById('seqTracks');
        const seqSteps = document.getElementById('seqSteps');

        if (recFormat) recFormat.value = this.settings.recFormat;
        if (recAutoSave) recAutoSave.value = this.settings.recAutoSave;
        if (recGpsEmbed) recGpsEmbed.checked = this.settings.recGpsEmbed;
        if (seqTracks) seqTracks.value = this.settings.seqTracks;
        if (seqSteps) seqSteps.value = this.settings.seqSteps;

        // Refresh MIDI device lists and CC mappings
        if (window.midiIO?.isAvailable()) {
            this.setupMidiSettings();
        }

        // Refresh preset gallery
        this.renderPresetGallery();
    }

    // GPS
    updateGPS() {
        const text = document.getElementById('gpsText');
        const headerMapImg = document.getElementById('headerMapImg');
        const miniMapImg = document.getElementById('miniMapImg');
        const miniMapCoords = document.getElementById('miniMapCoords');

        const pos = window.gpsTracker.getPosition();

        if (pos) {
            if (text) {
                text.textContent = pos.formatted;
            }

            // Update header mini map
            if (headerMapImg) {
                const mapUrl = window.gpsTracker.getMapImageUrl(16);
                if (mapUrl) {
                    headerMapImg.style.backgroundImage = `url("${mapUrl}")`;
                }
            }

            // Update panel mini map (if visible)
            if (miniMapImg) {
                const mapUrl = window.gpsTracker.getMapImageUrl(14);
                if (mapUrl) {
                    miniMapImg.style.backgroundImage = `url("${mapUrl}")`;
                }
            }
            if (miniMapCoords) {
                miniMapCoords.textContent = `${pos.latitude.toFixed(3)}, ${pos.longitude.toFixed(3)}`;
            }

            // ONLY update background if theme is explicitly 'map'
            // Don't override other themes!
            if (this.settings.theme === 'map') {
                const mapBg = document.getElementById('mapBackground');
                if (mapBg) {
                    const mapUrl = window.gpsTracker.getMapImageUrl(15);
                    if (mapUrl) {
                        mapBg.style.backgroundImage = `url("${mapUrl}")`;
                        mapBg.classList.add('has-location');
                    }
                }
            }
        } else {
            if (text) {
                const err = window.gpsTracker.getError();
                text.textContent = err || '--';
            }
            if (miniMapCoords) {
                miniMapCoords.textContent = '--';
            }
        }
    }
}

mixIntoApp(AppAdmin);
