/**
 * Oh My Ondas — DEMO MODE (Sónar+D version)
 *
 * Automated 50-second psychogeographic performance.
 * The room sound drives the composition through the soundscape analyzer.
 * Mic stays open. Radio is sampled and mangled. Everything adapts.
 *
 * Structure:
 *   PHASE 1 — LISTEN    (0:00 → 0:04)  Mic opens. Room + radio captured. PICTURE mode.
 *   PHASE 2 — COMPOSE   (0:04 → 0:08)  AI interprets. Sequencer starts. SOUNDSCAPE mode.
 *   PHASE 3 — INTERACT  (0:08 → 0:42)  Live adaptive composition. INTERACT mode.
 *             Reacts to soundscape changes:
 *               quiet/ambient  → sparse texture, granulated mic+radio
 *               rhythmic/noisy → driven, mic transients as drums, radio chopped
 *               tonal/chaotic  → melodic, synth follows room, all sources converge
 *   PHASE 4 — RETURN    (0:42 → 0:50)  Fade. Room resurfaces. GPS stamp.
 *
 * CRITICAL: Radio is SAMPLED into pads 1,2 (which the sequencer uses), then stream
 * is killed. Radio never plays as a live fader — it only exists as mangled material.
 * Mic is captured into pad 0, re-captured into pad 3 mid-performance.
 * The sequencer triggers pads 0,1,2,3 through the sampler tracks.
 *
 * Integration: <script src="js/demo-mode.js"></script> in app.html
 *
 * ═══ Confirmed DOM selectors ═══
 * Transport:    #btnPlay, #btnStop, #btnRecord
 * Tempo:        #tempoSlider, #tempoVal
 * Mixer faders: #faderMic, #faderSamples, #faderSynth, #faderRadio, #faderMaster
 * Filter:       #filterCutoff (range, Hz)
 * FX sliders:   #fxDelay, #fxGrain, #fxGlitch, #fxCrush (range inputs)
 * CTRL knobs:   #knobFreq, #knobFilter, #knobDelay, #knobGrain, #knobReso,
 *               #knobDrive, #knobPan, #knobVol  (div.knob, data-value)
 * Seq steps:    .oct-step[data-track="N"][data-step="N"]
 * Pads:         .pads-grid .pad[data-pad="N"]
 * Panel tabs:   .panel-tab[data-panel="X-panel"]
 * Radio:        #radioScan, #radioSample, #radioGo, #radioStop
 * Scenes:       .scene-btn[data-scene="N"], #sceneCopy, #scenePaste, #sceneCrossfader
 * AI:           #aiGenerate, #landmarkBtn, #aiVibe, #aiLocation
 * Journey:      #journeyStart, #journeyWaypoint, #journeyEnd, #journeyExportGPX
 * Mic capture:  #micCapture, #micCaptureDur
 * Punch FX:     .punch-btn[data-fx="stutter|reverse|filter|tape"]
 *
 * ═══ Confirmed JS APIs ═══
 * window.audioEngine   .init(), .ctx, .ctx.resume(), .initialized
 * window.sequencer     .setStep(t,s,bool), .setTempo(bpm), .setTrackSource(t,src)
 * window.sampler       .loadBuffer(pad, audioBuffer, meta), .trigger(pad, opts)
 * window.micInput      .init(), .ensureActive(), .captureToBuffer(ms)
 * window.radioPlayer   .playFallback(), .captureToBuffer(ms), .stop()
 * window.sceneManager  .saveScene(idx), .recallScene(idx), .morphTo(idx, ms)
 * window.mangleEngine  .setGrain(), .setDelayMix(), .setGlitch(), .setCrush()
 * window.sessionRecorder .start(), .stop(), .isRecording()
 * window.aiComposer    .context.vibe, .updateUI()
 * window.soundscapeAnalyzer .startMonitoring(), .stopMonitoring(), .onClassificationChange()
 * window.sourceRoleManager  .generateRoleAssignment(), .assignRole()
 * window.journey       (journey panel JS)
 * window.app           .refreshSequencerUI(), .applyKnobValue(), .updateKnobRotation()
 */

(function () {
  'use strict';

  // ─── Helpers ───

  const $ = (sel) => document.querySelector(sel);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  /** Feedback detection — monitors audio level, ducks mic if too hot */
  let feedbackGuard = null;
  function startFeedbackGuard() {
    if (!window.audioEngine?.ctx) return;
    const ctx = window.audioEngine.ctx;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    try {
      const dest = window.audioEngine.masterGain || window.audioEngine.master;
      if (dest) dest.connect(analyser);
    } catch {}
    const data = new Float32Array(analyser.frequencyBinCount);
    let ducked = false;
    const micFader = $('#faderMic');
    feedbackGuard = setInterval(() => {
      analyser.getFloatTimeDomainData(data);
      let peak = 0;
      for (let i = 0; i < data.length; i++) {
        const v = Math.abs(data[i]);
        if (v > peak) peak = v;
      }
      if (peak > 0.85 && !ducked && micFader) {
        const cur = parseFloat(micFader.value) || 0;
        if (cur > 20) {
          micFader.value = Math.max(10, cur * 0.4);
          micFader.dispatchEvent(new Event('input', { bubbles: true }));
          ducked = true;
        }
      }
      if (peak < 0.5 && ducked && micFader) {
        const cur = parseFloat(micFader.value) || 0;
        if (cur < 35) {
          micFader.value = Math.min(35, cur + 3);
          micFader.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          ducked = false;
        }
      }
    }, 100);
  }
  function stopFeedbackGuard() {
    if (feedbackGuard) { clearInterval(feedbackGuard); feedbackGuard = null; }
  }

  /** Smoothly animate a range input from current to target */
  async function sweep(el, target, durationMs) {
    if (!el) return;
    const start = parseFloat(el.value) || 0;
    const diff = target - start;
    const steps = Math.max(10, Math.ceil(durationMs / 50));
    for (let i = 1; i <= steps; i++) {
      el.value = start + diff * (i / steps);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(durationMs / steps);
    }
  }

  /** Smoothly animate a CTRL knob (div.knob with data-value) */
  async function sweepKnob(knobEl, target, durationMs) {
    if (!knobEl) return;
    const param = knobEl.dataset.param;
    const min = parseFloat(knobEl.dataset.min);
    const max = parseFloat(knobEl.dataset.max);
    const start = parseFloat(knobEl.dataset.value) || 0;
    const diff = target - start;
    const steps = Math.max(10, Math.ceil(durationMs / 50));
    for (let i = 1; i <= steps; i++) {
      const val = start + diff * (i / steps);
      knobEl.dataset.value = val;
      const valEl = knobEl.querySelector('.knob-value');
      if (valEl) valEl.textContent = Math.round(val);
      window.app?.updateKnobRotation?.(knobEl, val, min, max);
      window.app?.applyKnobValue?.(param, val);
      await sleep(durationMs / steps);
    }
  }

  /** Click a DOM element safely */
  function tap(sel) {
    const el = typeof sel === 'string' ? $(sel) : sel;
    if (el) el.click();
  }

  /** Switch to a panel tab */
  function showPanel(name) {
    tap(`.panel-tab[data-panel="${name}-panel"]`);
  }

  /** Set a fader/slider value immediately */
  function setVal(id, v) {
    const el = $(`#${id}`);
    if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }
  }

  /** Notify mockup parent of mode change */
  function setMode(mode) {
    try {
      window.parent.postMessage({ type: 'app-state', data: { mode } }, window.location.origin);
    } catch {}
  }

  /** Caption overlay — petrol green monospace on dark bg */
  function caption(text, opts = {}) {
    const { position = 'bottom', fontSize = '15px' } = opts;
    let overlay = $('#demo-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'demo-overlay';
      overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        pointer-events: none; z-index: 99999;
        display: flex; flex-direction: column;
        padding: 40px 60px;
      `;
      document.body.appendChild(overlay);
    }
    overlay.style.justifyContent =
      position === 'top' ? 'flex-start' :
      position === 'center' ? 'center' : 'flex-end';
    overlay.style.alignItems = 'center';

    if (!text) { overlay.innerHTML = ''; return; }
    overlay.innerHTML = `
      <div style="
        font-family: 'Courier New', monospace;
        color: #00e5a0;
        font-size: ${fontSize};
        text-shadow: 0 0 10px rgba(0,229,160,0.5);
        background: rgba(0,0,0,0.75);
        padding: 12px 24px;
        border-radius: 4px;
        opacity: 0;
        transition: opacity 0.6s ease-in;
        text-align: center;
        line-height: 1.5;
        max-width: 80%;
        letter-spacing: 1px;
      " id="demo-caption">${text}</div>
    `;
    requestAnimationFrame(() => {
      const c = $('#demo-caption');
      if (c) c.style.opacity = '1';
    });
  }

  /** Manually trigger sampler pads to ensure radio/mic material is heard */
  function triggerPad(padIdx, opts) {
    try { window.sampler?.trigger(padIdx, opts); } catch {}
  }

  // ─── Compositional states ───
  // Each state defines patterns, FX, mixer, tempo — driven by soundscape classification
  //
  // PAD LAYOUT (what the sequencer triggers):
  //   Pad 0: room capture (mic)
  //   Pad 1: radio fragment 1 (mangled)
  //   Pad 2: radio fragment 2 (chopped)
  //   Pad 3: room re-capture (mic, refreshed mid-performance)
  //
  // Track 0 → sampler (triggers pad 0 = room)
  // Track 1 → sampler (triggers pad 1 = radio)
  // Track 2 → synth

  const PATTERNS = {
    quiet: {
      // Sparse, breathing. Lots of space. Room + radio granulated.
      tracks: [
        { steps: [0, 7, 11],           source: 'sampler' },  // room fragments
        { steps: [3, 13],              source: 'sampler' },  // radio fragment
        { steps: [],                   source: 'synth'   },  // silent
      ],
      tempo: 72,
      fx: { delay: 55, grain: 65, glitch: 0, crush: 16 },
      filter: 400,
      mixer: { mic: 30, samples: 55, synth: 0, radio: 0 },
      vibe: 'calm',
      // Extra pad triggers per bar cycle (pads not in sequencer)
      extraTriggers: [
        { pad: 2, every: 8000 },  // radio chop every 8s
      ]
    },
    rhythmic: {
      // Driven, polyrhythmic. Mic transients become the beat. Radio chopped.
      tracks: [
        { steps: [0, 3, 5, 8, 11, 14], source: 'sampler' },  // room as percussion
        { steps: [1, 4, 6, 10, 13],    source: 'sampler' },  // radio chopped
        { steps: [0, 8],               source: 'synth'   },  // stabs
      ],
      tempo: 98,
      fx: { delay: 20, grain: 30, glitch: 40, crush: 8 },
      filter: 3500,
      mixer: { mic: 20, samples: 75, synth: 45, radio: 0 },
      vibe: 'urban',
      extraTriggers: [
        { pad: 2, every: 3000 },  // radio chops fast
        { pad: 3, every: 5000 },  // room re-capture hits
      ]
    },
    tonal: {
      // Melodic, layered. Voices become harmony. Radio melodic.
      tracks: [
        { steps: [0, 5, 7, 12],        source: 'sampler' },  // room pitched
        { steps: [2, 6, 10, 14],       source: 'sampler' },  // radio melodic
        { steps: [0, 3, 7, 10],        source: 'synth'   },  // melody
      ],
      tempo: 88,
      fx: { delay: 45, grain: 40, glitch: 10, crush: 16 },
      filter: 8000,
      mixer: { mic: 25, samples: 65, synth: 65, radio: 0 },
      vibe: 'nature',
      extraTriggers: [
        { pad: 2, every: 6000 },
        { pad: 3, every: 4000 },
      ]
    },
    chaotic: {
      // Everything converges. Dense, alive. All pads firing.
      tracks: [
        { steps: [0, 2, 5, 7, 8, 11, 13, 15], source: 'sampler' },
        { steps: [1, 3, 6, 9, 12, 14],         source: 'sampler' },
        { steps: [0, 4, 7, 11],                source: 'synth'   },
      ],
      tempo: 108,
      fx: { delay: 35, grain: 50, glitch: 55, crush: 5 },
      filter: 6000,
      mixer: { mic: 25, samples: 80, synth: 60, radio: 0 },
      vibe: 'chaos',
      extraTriggers: [
        { pad: 2, every: 2000 },
        { pad: 3, every: 2500 },
      ]
    }
  };
  // Aliases
  PATTERNS.ambient = PATTERNS.quiet;
  PATTERNS.noisy = PATTERNS.rhythmic;

  // Interval IDs for extra pad triggers
  let extraTriggerIntervals = [];

  function startExtraTriggers(state) {
    stopExtraTriggers();
    const triggers = PATTERNS[state]?.extraTriggers || [];
    for (const t of triggers) {
      const id = setInterval(() => triggerPad(t.pad), t.every);
      extraTriggerIntervals.push(id);
    }
  }
  function stopExtraTriggers() {
    for (const id of extraTriggerIntervals) clearInterval(id);
    extraTriggerIntervals = [];
  }

  /** Apply a compositional state — morphs over durationMs */
  async function applyState(stateName, durationMs) {
    const state = PATTERNS[stateName] || PATTERNS.quiet;
    const half = durationMs / 2;

    console.log(`[demo] → compositional state: ${stateName}`);

    // Tempo
    window.sequencer?.setTempo(state.tempo);
    const ts = $('#tempoSlider');
    const tv = $('#tempoVal');
    if (ts) ts.value = state.tempo;
    if (tv) tv.textContent = String(state.tempo);

    // Sequencer pattern — clear then set
    for (let t = 0; t < 3; t++) {
      for (let s = 0; s < 16; s++) {
        try { window.sequencer?.setStep(t, s, false); } catch {}
      }
      // Set source
      try { window.sequencer?.setTrackSource(t, state.tracks[t].source); } catch {}
      // Set active steps
      for (const s of state.tracks[t].steps) {
        try { window.sequencer?.setStep(t, s, true); } catch {}
      }
    }
    window.app?.refreshSequencerUI?.();

    // Start extra pad triggers for material not in the sequencer
    startExtraTriggers(stateName);

    // Apply source roles if available
    if (window.sourceRoleManager) {
      const analysis = window.soundscapeAnalyzer?.getLatest?.();
      window.sourceRoleManager.generateRoleAssignment({
        vibe: state.vibe,
        soundscape: analysis,
        availableSources: ['sampler', 'synth', 'radio', 'mic']
      });
    }

    // FX — sweep to targets
    sweep($('#fxDelay'), state.fx.delay, half);
    sweep($('#fxGrain'), state.fx.grain, half);
    sweep($('#fxGlitch'), state.fx.glitch, half);
    sweep($('#fxCrush'), state.fx.crush, half);

    // Filter
    sweep($('#filterCutoff'), state.filter, half);

    // Mixer — sweep faders
    sweep($('#faderSamples'), state.mixer.samples, half);
    sweep($('#faderSynth'), state.mixer.synth, half);
    sweep($('#faderRadio'), state.mixer.radio, half);
    sweep($('#faderMic'), state.mixer.mic, half);

    // Set AI vibe
    if (window.aiComposer) {
      window.aiComposer.context.vibe = state.vibe;
      window.aiComposer.updateUI?.();
    }
  }

  // ─── DEMO Button ───

  let running = false;

  function createDemoButton() {
    const container = $('.transport-controls') || $('.sidebar') || document.body;
    const btn = document.createElement('button');
    btn.id = 'btnDemo';
    btn.textContent = 'DEMO';
    btn.style.cssText = `
      background: #00e5a0; color: #0a0a0a; border: none;
      font-family: 'Courier New', monospace; font-size: 13px; font-weight: bold;
      padding: 8px 18px; border-radius: 4px; cursor: pointer;
      letter-spacing: 2px; margin: 6px 4px;
      transition: all 0.3s;
    `;
    btn.addEventListener('mouseenter', () => { if (!running) btn.style.background = '#33ffbb'; });
    btn.addEventListener('mouseleave', () => { if (!running) btn.style.background = '#00e5a0'; });
    btn.addEventListener('click', () => {
      if (running) return;
      runDemo(btn);
    });

    const stop = $('#btnStop');
    if (stop && stop.parentElement) {
      stop.parentElement.insertBefore(btn, stop.nextSibling);
    } else {
      container.appendChild(btn);
    }
  }

  // ─── DEMO Performance ───

  async function runDemo(btn) {
    running = true;
    btn.textContent = '● REC';
    btn.style.background = '#ff3355';
    btn.style.color = '#fff';
    btn.disabled = true;

    // Track current compositional state so we don't re-trigger the same one
    let currentState = 'quiet';

    // Classification change handler — THE CORE of the adaptive composition
    const onSoundscapeChange = (change) => {
      if (!running) return;
      const cls = change.current; // quiet, ambient, rhythmic, noisy, tonal, chaotic
      if (cls === currentState) return;

      console.log(`[demo] soundscape: ${change.previous} → ${cls}`);
      currentState = cls;

      // Show what's happening
      const labels = {
        quiet: 'Silence speaks...',
        ambient: 'Ambient field',
        rhythmic: 'Rhythm detected — recomposing',
        noisy: 'Noise as material',
        tonal: 'Voices become melody',
        chaotic: 'Everything converges'
      };
      caption(labels[cls] || cls);

      // Morph composition to match
      applyState(cls, 2500);

      // Re-capture mic fragment into pad 3 for fresh material
      captureMicToPad(3);
    };

    // Capture mic to a specific pad
    async function captureMicToPad(pad) {
      try {
        const dur = currentState === 'quiet' ? 2000 : currentState === 'rhythmic' ? 600 : 1200;
        const buf = await window.micInput?.captureToBuffer(dur);
        if (buf) {
          window.sampler?.loadBuffer(pad, buf, {
            name: `room-${currentState}`,
            source: 'mic',
            timestamp: Date.now()
          });
        }
      } catch (e) { console.warn('[demo] re-capture failed:', e.message); }
    }

    try {
      // ── Init audio ──
      if (window.audioEngine) {
        if (!window.audioEngine.initialized) await window.audioEngine.init();
        if (window.audioEngine.ctx?.state === 'suspended') await window.audioEngine.ctx.resume();
      }

      startFeedbackGuard();

      // Request real mic
      try {
        await window.micInput?.ensureActive();
      } catch (e) {
        console.warn('[demo] Mic denied:', e.message);
        try { await window.micInput?.init(); } catch {}
      }

      // Start session recorder
      try { window.sessionRecorder?.start(); } catch {}

      // ════════════════════════════════════════════════════════════
      // PHASE 1 — LISTEN (0:00 → 0:04)
      // PICTURE mode: capture room + radio FAST, get material loaded
      // ════════════════════════════════════════════════════════════
      console.log('[demo] PHASE 1: LISTEN — capturing material');

      setMode('picture');
      showPanel('mixer');

      // GPS display — force Barcelona coords if geolocation unavailable (HTTP localhost)
      let gps = window.gpsTracker?.getPosition?.();
      if (!gps) {
        // Inject fake position into the tracker so all GPS-dependent features work
        const fakePos = {
          latitude: 41.3818,
          longitude: 2.1685,
          accuracy: 10,
          altitude: 12,
          timestamp: Date.now(),
          formatted: '41.38180°N, 2.16850°E'
        };
        if (window.gpsTracker) {
          window.gpsTracker.currentPosition = fakePos;
          window.gpsTracker.error = null;
          window.gpsTracker.notifyListeners();
          window.gpsTracker.updateLocationImage?.();
        }
        gps = fakePos;
      }
      const coordStr = `${gps.latitude.toFixed(4)}, ${gps.longitude.toFixed(4)}`;
      const gpsText = $('#gpsText');
      const gpsTextE = $('#gpsTextE');
      if (gpsText) gpsText.textContent = coordStr;
      if (gpsTextE) gpsTextE.textContent = coordStr;

      // All faders down, master up
      for (const [id, val] of [
        ['faderSamples', 0], ['faderSynth', 0], ['faderRadio', 0],
        ['faderMic', 0], ['faderMaster', 80]
      ]) { setVal(id, val); }

      setVal('filterCutoff', 12000);

      // Tempo
      window.sequencer?.setTempo(72);
      setVal('tempoSlider', 72);
      const tv = $('#tempoVal');
      if (tv) tv.textContent = '72';

      // Clear sequencer
      try { window.sequencer?.stop(); } catch {}
      for (let t = 0; t < 3; t++)
        for (let s = 0; s < 16; s++)
          try { window.sequencer?.setStep(t, s, false); } catch {}

      caption(`Listening · ${coordStr}`, { fontSize: '15px' });

      // Mic fades in — the room arrives
      sweep($('#faderMic'), 45, 1500);

      // In parallel: start radio, capture mic, capture radio
      // Radio — start it, let it play briefly
      try { await window.radioPlayer?.playFallback(); } catch {}
      tap('#radioScan');

      await sleep(800);

      // Capture room into pad 0 (1.2s — short!)
      try {
        const micBuf = await window.micInput?.captureToBuffer(1200);
        if (micBuf) {
          window.sampler?.loadBuffer(0, micBuf, {
            name: 'Room', source: 'mic', timestamp: Date.now()
          });
        }
      } catch (e) { console.warn('[demo] Mic capture failed:', e.message); }

      // Capture radio into pad 1 (1.5s)
      try {
        const radioBuf1 = await window.radioPlayer?.captureToBuffer(1500);
        if (radioBuf1) {
          window.sampler?.loadBuffer(1, radioBuf1, {
            name: 'Radio-1', source: 'radio', timestamp: Date.now()
          });
        }
      } catch (e) { console.warn('[demo] Radio capture 1 failed:', e.message); }

      // Capture radio into pad 2 (shorter chop)
      try {
        const radioBuf2 = await window.radioPlayer?.captureToBuffer(800);
        if (radioBuf2) {
          window.sampler?.loadBuffer(2, radioBuf2, {
            name: 'Radio-2', source: 'radio', timestamp: Date.now()
          });
        }
      } catch (e) { console.warn('[demo] Radio capture 2 failed:', e.message); }

      // KILL the radio stream — from now on it only lives in pads 1,2
      try { window.radioPlayer?.stop(); } catch {}
      setVal('faderRadio', 0);

      // Start soundscape analysis
      window.soundscapeAnalyzer?.startMonitoring(3000);

      // ════════════════════════════════════════════════════════════
      // PHASE 2 — COMPOSE (0:04 → 0:08)
      // SOUNDSCAPE mode: AI interprets, sequencer starts IMMEDIATELY
      // ════════════════════════════════════════════════════════════
      console.log('[demo] PHASE 2: COMPOSE — music starts');

      setMode('soundscape');
      caption('Composing from soundscape...');

      // Duck mic — composition takes over
      sweep($('#faderMic'), 25, 800);

      // Show AI panel, generate
      showPanel('ai');
      tap('#aiGenerate');
      await sleep(400);

      // Apply initial quiet state AND start playback
      await applyState('quiet', 1000);

      showPanel('seq');
      tap('#btnPlay');
      await sleep(500);

      // Samples fader up — hear the mangled room + radio
      sweep($('#faderSamples'), 55, 1000);
      await sleep(1500);

      // ════════════════════════════════════════════════════════════
      // PHASE 3 — INTERACT (0:08 → 0:42)
      // INTERACT mode: live adaptive composition driven by room
      // 34 seconds of MUSIC
      // ════════════════════════════════════════════════════════════
      console.log('[demo] PHASE 3: INTERACT — adaptive composition');

      setMode('interact');
      caption('Room drives composition');

      // Register the soundscape change handler — this makes it LIVE
      window.soundscapeAnalyzer?.onClassificationChange(onSoundscapeChange);
      window._demoOnSoundscapeChange = onSoundscapeChange;

      // --- Timed showcase: panels rotate, material refreshes ---
      // Music adapts independently via the soundscape callback.

      // 8-14s: Let pattern establish, show sequencer
      await sleep(2000);
      showPanel('seq');
      await sleep(2000);

      // Trigger some pads manually to make sure radio material is heard
      triggerPad(1);
      await sleep(400);
      triggerPad(2);
      await sleep(1600);

      // 14-18s: CTRL knobs — grain + filter sweep
      showPanel('knobs');
      sweepKnob($('#knobGrain'), 50, 1500);
      await sleep(500);
      caption('');
      await sweep($('#filterCutoff'), 5000, 2000);
      await sleep(1000);

      // 18-22s: FX panel — glitch + delay
      showPanel('fx');
      await sleep(500);
      sweep($('#fxGlitch'), 25, 1000);
      sweep($('#fxDelay'), 40, 1000);
      await sleep(2000);

      // Punch FX — stutter burst
      tap('.punch-btn[data-fx="stutter"]');
      await sleep(600);
      tap('.punch-btn[data-fx="reverse"]');
      await sleep(1500);

      // 22-26s: Re-capture mic — fresh material
      caption('Re-sampling room...');
      showPanel('pads');
      await captureMicToPad(3);
      await sleep(300);
      // Trigger the new capture
      triggerPad(3);
      await sleep(500);
      triggerPad(0); // original room too
      await sleep(1200);
      caption('');

      // 26-30s: Re-capture radio — briefly turn it on, grab, kill
      showPanel('radio');
      try {
        await window.radioPlayer?.playFallback();
        await sleep(600);
        const radioBuf3 = await window.radioPlayer?.captureToBuffer(1000);
        if (radioBuf3) {
          window.sampler?.loadBuffer(2, radioBuf3, {
            name: 'Radio-fresh', source: 'radio', timestamp: Date.now()
          });
        }
        window.radioPlayer?.stop();
      } catch {}
      triggerPad(2); // play the fresh radio chop
      await sleep(500);
      triggerPad(1);
      await sleep(1500);

      // 30-34s: Scene crossfade
      showPanel('seq');
      await sleep(500);
      caption('Scene crossfade');
      showPanel('scenes');
      await sleep(300);

      // Save current as Scene A
      window.sceneManager?.saveScene(0);
      tap('.scene-btn[data-scene="0"]');
      await sleep(200);

      // Create Scene B: heavier FX
      setVal('fxGlitch', 45);
      setVal('fxCrush', 4);
      setVal('fxDelay', 60);
      setVal('filterCutoff', 10000);
      setVal('faderSynth', 50);
      setVal('faderSamples', 70);
      setVal('faderMic', 15);

      window.sceneManager?.saveScene(1);
      tap('.scene-btn[data-scene="1"]');
      await sleep(200);

      // Morph A → B
      window.sceneManager?.recallScene(0);
      await sleep(200);
      window.sceneManager?.morphTo(1, 2500);
      sweep($('#sceneCrossfader'), 100, 2500);
      await sleep(3000);

      // Morph back
      window.sceneManager?.morphTo(0, 1500);
      sweep($('#sceneCrossfader'), 0, 1500);
      await sleep(1500);
      caption('');

      // 34-38s: Rapid panel showcase — instrument alive
      for (const p of ['seq', 'mixer', 'pads', 'knobs', 'fx']) {
        showPanel(p);
        await sleep(300);
      }

      // Punch FX burst
      tap('.punch-btn[data-fx="tape"]');
      await sleep(400);
      tap('.punch-btn[data-fx="filter"]');
      await sleep(600);

      // AI re-generates
      showPanel('ai');
      tap('#aiGenerate');
      await sleep(800);

      // 38-42s: Journey — stamp this place
      showPanel('journey');
      tap('#journeyStart');
      await sleep(200);
      tap('#journeyWaypoint');
      caption('This sound belongs here', { fontSize: '17px' });
      await sleep(2000);

      // ════════════════════════════════════════════════════════════
      // PHASE 4 — RETURN (0:42 → 0:50)
      // Room resurfaces. Music dissolves.
      // ════════════════════════════════════════════════════════════
      console.log('[demo] PHASE 4: RETURN');
      caption('Returning to the room...');

      showPanel('mixer');

      // Stop monitoring and extra triggers
      window.soundscapeAnalyzer?.stopMonitoring();
      stopExtraTriggers();

      // Fade everything down except mic
      sweep($('#faderSamples'), 0, 3000);
      sweep($('#faderSynth'), 0, 3000);
      sweep($('#fxDelay'), 0, 2500);
      sweep($('#fxGrain'), 0, 2500);
      sweep($('#fxGlitch'), 0, 2000);
      sweep($('#fxCrush'), 16, 2000);

      // Mic comes back — the room resurfaces
      sweep($('#faderMic'), 60, 2500);

      await sleep(4000);

      // Stop sequencer
      showPanel('seq');
      await sleep(300);
      try { window.sequencer?.stop(); } catch {}
      tap('#btnStop');

      // Clear sequencer — visual emptying
      for (let t = 0; t < 3; t++)
        for (let s = 0; s < 16; s++)
          try { window.sequencer?.setStep(t, s, false); } catch {}
      window.app?.refreshSequencerUI?.();

      await sleep(800);

      // Fade mic to silence
      await sweep($('#faderMic'), 0, 1500);
      await sweep($('#faderMaster'), 0, 500);

      // GPS stamp — the place this sound belongs to
      showPanel('journey');
      tap('#journeyEnd');
      const endCoords = gps
        ? `${gps.latitude.toFixed(4)}° N, ${gps.longitude.toFixed(4)}° E`
        : '41.3818° N, 2.1685° E';
      caption(endCoords, { fontSize: '17px' });

      // Stop session recorder
      try {
        const sr = window.sessionRecorder;
        if (sr?.isRecording()) {
          sr.stop();
          await sleep(1500);
          const recs = sr.getRecordings?.() || sr.recordings || [];
          if (recs.length > 0) {
            sr.downloadRecording(recs[0].id);
          }
        }
      } catch (e) { console.warn('[demo] Recording download failed:', e); }

      await sleep(2000);
      caption('');

      window.app?.updateRecCount?.();
      window.app?.updateFilesList?.();

      console.log('[demo] DONE');

    } catch (err) {
      console.error('[demo] Error:', err);
    } finally {
      stopFeedbackGuard();
      stopExtraTriggers();
      window.soundscapeAnalyzer?.stopMonitoring();
      running = false;
      btn.textContent = 'DEMO';
      btn.style.background = '#00e5a0';
      btn.style.color = '#0a0a0a';
      btn.disabled = false;

      const overlay = $('#demo-overlay');
      if (overlay) overlay.remove();
    }
  }

  // ─── Init ───

  /** Inject Barcelona coords if GPS fails (HTTP localhost blocks geolocation) */
  function ensureGPS() {
    if (window.gpsTracker?.getPosition?.()) return; // real GPS works
    const fakePos = {
      latitude: 41.3818,
      longitude: 2.1685,
      accuracy: 10,
      altitude: 12,
      timestamp: Date.now(),
      formatted: '41.38180°N, 2.16850°E'
    };
    if (window.gpsTracker) {
      window.gpsTracker.currentPosition = fakePos;
      window.gpsTracker.error = null;
      try { window.gpsTracker.notifyListeners(); } catch {}
      try { window.gpsTracker.updateLocationImage?.(); } catch {}
    }
    // Update all GPS text elements directly
    const els = ['gpsText', 'gpsTextE'];
    for (const id of els) {
      const el = document.getElementById(id);
      if (el) el.textContent = '41.3818, 2.1685';
    }
    console.log('[demo] GPS injected: Barcelona (41.3818, 2.1685)');
  }

  function initDemo() {
    createDemoButton();

    // Inject GPS immediately so location shows before demo starts
    // Wait a moment for gpsTracker.init() to try real GPS first
    setTimeout(ensureGPS, 3000);

    // Auto-start if ?demo=auto in URL
    const params = new URLSearchParams(window.location.search);
    if (params.get('demo') === 'auto') {
      setTimeout(() => {
        const btn = $('#btnDemo');
        if (btn) btn.click();
      }, 4000);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDemo);
  } else {
    initDemo();
  }

})();
