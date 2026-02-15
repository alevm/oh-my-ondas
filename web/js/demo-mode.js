/**
 * Oh My Ondas — DEMO MODE
 *
 * Adds a DEMO button to app.html. When pressed, performs an automated
 * 40-second musical piece using the user's LIVE MICROPHONE as source material.
 *
 * Structure:
 *   PHASE 1 — LISTEN  (0:00 → 0:05)  Mic only. Capture room into a pad.
 *   PHASE 2 — PERFORM (0:05 → 0:35)  Sequence, radio, synth, FX, scenes, GPS.
 *   PHASE 3 — RETURN  (0:35 → 0:40)  Fade everything. Room sound resurfaces.
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
    // Connect to the destination (master output)
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
      // If peak is very hot (near clipping), duck the mic
      if (peak > 0.85 && !ducked && micFader) {
        const cur = parseFloat(micFader.value) || 0;
        if (cur > 20) {
          micFader.value = Math.max(10, cur * 0.4);
          micFader.dispatchEvent(new Event('input', { bubbles: true }));
          ducked = true;
          console.log(`[demo] Feedback guard: ducked mic from ${cur} to ${micFader.value}`);
        }
      }
      // Recover slowly when level drops
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

    // Insert after transport buttons
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

    try {
      // ── Init audio (needs user gesture — this IS the click handler) ──
      if (window.audioEngine) {
        if (!window.audioEngine.initialized) await window.audioEngine.init();
        if (window.audioEngine.ctx?.state === 'suspended') await window.audioEngine.ctx.resume();
      }

      // Start feedback detection
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
      // PHASE 1 — LISTEN (0:00 → 0:05)
      // ════════════════════════════════════════════════════════════
      console.log('[demo] PHASE 1: LISTEN');

      // Force GPS display — Barcelona, Llotja de Mar
      const gpsText = $('#gpsText');
      const gpsTextE = $('#gpsTextE');
      if (gpsText) gpsText.textContent = '41.3818, 2.1685';
      if (gpsTextE) gpsTextE.textContent = '41.3818, 2.1685';

      // Set tempo 85 BPM
      window.sequencer?.setTempo(85);
      const ts = $('#tempoSlider');
      const tv = $('#tempoVal');
      if (ts) ts.value = 85;
      if (tv) tv.textContent = '85';

      // Make sure sequencer is stopped and clear any previous patterns
      try { window.sequencer?.stop(); } catch {}
      for (let t = 0; t < 3; t++)
        for (let s = 0; s < 16; s++)
          try { window.sequencer?.setStep(t, s, false); } catch {}

      // All faders to zero except mic (start low, will ramp)
      for (const [id, val] of [
        ['faderSamples', 0], ['faderSynth', 0], ['faderRadio', 0],
        ['faderMic', 0], ['faderMaster', 80]
      ]) {
        const el = $(`#${id}`);
        if (el) { el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); }
      }

      // Filter wide open — let the mic sound natural in this phase
      const filterEl = $('#filterCutoff');
      if (filterEl) { filterEl.value = 12000; filterEl.dispatchEvent(new Event('input', { bubbles: true })); }

      // Mic fades in gently — NOT slamming to max
      await sweep($('#faderMic'), 55, 2000);

      // GPS coords visible
      const gps = window.gpsTracker?.getPosition?.();
      const coordStr = gps ? `${gps.latitude.toFixed(4)}, ${gps.longitude.toFixed(4)}` : '41.3818, 2.1685';
      caption(`Listening · ${coordStr}`, { fontSize: '15px' });

      await sleep(2500);

      // MIC REC — capture 2s of room into pad 0
      caption('Capturing room...');
      let micBuffer = null;
      try {
        micBuffer = await window.micInput.captureToBuffer(2000);
        if (micBuffer) {
          window.sampler.loadBuffer(0, micBuffer, {
            name: 'Room',
            source: 'mic',
            timestamp: Date.now()
          });
        }
      } catch (e) { console.warn('[demo] Mic capture failed:', e.message); }

      await sleep(500);

      // ════════════════════════════════════════════════════════════
      // PHASE 2 — PERFORM (0:05 → 0:35)
      // ════════════════════════════════════════════════════════════

      // ── 2a (5s): Sequence the captured room sample ──
      console.log('[demo] PHASE 2a: Sequence room sample');

      // Pull mic down as other elements enter — prevent feedback
      sweep($('#faderMic'), 25, 1500);

      caption('Room → sampler → sequencer');
      showPanel('seq');
      await sleep(300);

      // Irregular pattern — NOT four-on-the-floor
      window.sequencer.setTrackSource(0, 'sampler');
      for (const s of [0, 3, 5, 7, 8, 11, 14]) {
        window.sequencer.setStep(0, s, true);
      }
      window.app?.refreshSequencerUI?.();

      // Start FX non-zero
      const fxD = $('#fxDelay'), fxG = $('#fxGrain');
      if (fxD) { fxD.value = 15; fxD.dispatchEvent(new Event('input', { bubbles: true })); }
      if (fxG) { fxG.value = 20; fxG.dispatchEvent(new Event('input', { bubbles: true })); }

      // Filter low to start — darken the texture
      if (filterEl) { filterEl.value = 300; filterEl.dispatchEvent(new Event('input', { bubbles: true })); }

      // Sweep samples fader up
      sweep($('#faderSamples'), 72, 2000); // non-blocking

      // PLAY
      tap('#btnPlay');
      await sleep(2500);

      // Switch to CTRL knobs — sweep grain up
      showPanel('knobs');
      await sleep(300);
      sweepKnob($('#knobGrain'), 40, 1500); // non-blocking
      await sleep(2000);

      // ── 2b (4s): More texture — polyrhythm ──
      console.log('[demo] PHASE 2b: Polyrhythm');
      caption('');
      showPanel('seq');
      await sleep(200);

      window.sequencer.setTrackSource(1, 'sampler');
      for (const s of [1, 4, 6, 10, 13]) {
        window.sequencer.setStep(1, s, true);
      }
      window.app?.refreshSequencerUI?.();
      await sleep(3500);

      // ── 2c (5s): Radio enters ──
      console.log('[demo] PHASE 2c: Radio');
      caption('FM radio bleeds in');
      showPanel('radio');
      await sleep(300);

      // Start radio
      try { await window.radioPlayer?.playFallback(); } catch {}
      await sleep(800);
      tap('#radioScan');
      await sleep(1200);

      // Sweep radio fader up
      sweep($('#faderRadio'), 55, 1500); // non-blocking
      await sleep(1500);

      // Capture radio fragment
      try {
        tap('#radioSample');
      } catch {}
      await sleep(1000);

      // ── 2d (5s): Synth drone + filter sweep ──
      console.log('[demo] PHASE 2d: Synth drone + filter');
      caption('Filter sweep — dark to bright');

      // Track 2: synth source, steps 0 and 8 only — sustained drone
      window.sequencer.setTrackSource(2, 'synth');
      window.sequencer.setStep(2, 0, true);
      window.sequencer.setStep(2, 8, true);
      window.app?.refreshSequencerUI?.();

      // Sweep synth fader up
      sweep($('#faderSynth'), 60, 1200); // non-blocking

      // Sweep filter from low to high over 4s
      showPanel('knobs');
      await sleep(200);
      await sweep(filterEl, 6000, 4000);
      await sleep(500);

      // ── 2e (6s): Effects + scene crossfade ──
      console.log('[demo] PHASE 2e: Effects + scene crossfade');
      caption('Scene crossfade — morphing');

      // Pump up FX
      showPanel('fx');
      await sleep(200);
      sweep($('#fxDelay'), 50, 800);
      sweep($('#fxGrain'), 55, 800);
      await sleep(1000);

      // Save current as Scene A
      showPanel('scenes');
      await sleep(200);
      window.sceneManager?.saveScene(0);
      tap('.scene-btn[data-scene="0"]');
      await sleep(300);

      // Modify for Scene B: different FX, filter, mixer balance
      const setVal = (id, v) => {
        const el = $(`#${id}`);
        if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }
      };
      setVal('fxGlitch', 35);
      setVal('fxCrush', 5);
      setVal('fxDelay', 70);
      setVal('filterCutoff', 12000);
      setVal('faderRadio', 72);
      setVal('faderSynth', 35);
      setVal('faderSamples', 50);

      window.sceneManager?.saveScene(1);
      tap('.scene-btn[data-scene="1"]');
      await sleep(200);

      // Recall A, then morph to B
      window.sceneManager?.recallScene(0);
      await sleep(300);
      window.sceneManager?.morphTo(1, 3000);
      sweep($('#sceneCrossfader'), 100, 3000); // visual crossfader
      await sleep(3200);

      // Morph back to A (fast)
      window.sceneManager?.morphTo(0, 1500);
      sweep($('#sceneCrossfader'), 0, 1500);
      await sleep(1700);

      // ── 2f (5s): GPS stamp + Journey + AI ──
      console.log('[demo] PHASE 2f: GPS + Journey + AI');
      caption('This sound belongs to this place', { fontSize: '17px' });

      showPanel('journey');
      await sleep(300);
      tap('#journeyStart');
      await sleep(1500);
      tap('#journeyWaypoint');
      await sleep(1000);

      // AI generate
      showPanel('ai');
      await sleep(300);
      tap('#aiGenerate');
      await sleep(2000);

      // ════════════════════════════════════════════════════════════
      // PHASE 3 — RETURN (0:35 → 0:40)
      // ════════════════════════════════════════════════════════════
      console.log('[demo] PHASE 3: RETURN');
      caption('Returning to the room...');

      // Sweep all faders to zero EXCEPT mic (stays at 90)
      sweep($('#faderSamples'), 0, 2500);
      sweep($('#faderSynth'), 0, 2500);
      sweep($('#faderRadio'), 0, 2500);
      // Sweep FX down
      sweep($('#fxDelay'), 0, 2000);
      sweep($('#fxGrain'), 0, 2000);
      sweep($('#fxGlitch'), 0, 1500);
      sweep($('#fxCrush'), 16, 1500);

      // Mic comes back gently — room resurfaces
      sweep($('#faderMic'), 65, 2000);

      await sleep(3500);

      // ── HARD STOP — prevent any looping ──
      // Stop sequencer first
      try { window.sequencer?.stop(); } catch {}
      tap('#btnStop');
      await sleep(300);

      // Clear all sequencer steps so nothing can retrigger
      for (let t = 0; t < 3; t++)
        for (let s = 0; s < 16; s++)
          try { window.sequencer?.setStep(t, s, false); } catch {}

      // Fade mic to zero
      await sweep($('#faderMic'), 0, 1500);

      // Fade master to zero
      await sweep($('#faderMaster'), 0, 500);

      // End journey
      tap('#journeyEnd');

      // Stop radio
      try { window.radioPlayer?.stop(); } catch {}

      // Stop session recorder and auto-download
      try {
        const sr = window.sessionRecorder;
        if (sr?.isRecording()) {
          sr.stop();
          // Wait for recording to finalize, then trigger download
          await sleep(1500);
          const recs = sr.getRecordings?.() || sr.recordings || [];
          if (recs.length > 0) {
            const latest = recs[0];
            sr.downloadRecording(latest.id);
            caption('Recording saved', { fontSize: '16px' });
          }
        }
      } catch (e) { console.warn('[demo] Recording download failed:', e); }

      await sleep(2000);
      caption('');

      // Refresh the recordings list in the UI
      window.app?.updateRecCount?.();
      window.app?.updateFilesList?.();

      console.log('[demo] DONE');

    } catch (err) {
      console.error('[demo] Error:', err);
    } finally {
      stopFeedbackGuard();
      // Restore button
      running = false;
      btn.textContent = 'DEMO';
      btn.style.background = '#00e5a0';
      btn.style.color = '#0a0a0a';
      btn.disabled = false;

      // Remove overlay
      const overlay = $('#demo-overlay');
      if (overlay) overlay.remove();
    }
  }

  // ─── Init ───

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createDemoButton);
  } else {
    createDemoButton();
  }

})();
