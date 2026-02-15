/**
 * Oh My Ondas — Sónar+D 2026 Demo v3
 *
 * "A Place Becomes a Sound"
 *
 * NOT a drum machine walkthrough. A radio collage instrument demo.
 * Cold open with radio static. Radio fragments as rhythmic material.
 * Mic ambient, synth drone, scene crossfade, FX destruction.
 *
 * References: Stockhausen's Kurzwellen, Mouse on Mars, Autechre
 *
 * Timeline:
 *   0:00–0:05  Cold open: radio scanning + GPS location
 *   0:05–0:10  Radio captured into pad
 *   0:10–0:18  Sequencer enters with irregular radio pattern + CTRL knobs
 *   0:18–0:25  Mic captures environment, layered under radio
 *   0:25–0:30  Synth drone, AI mood shifts
 *   0:30–0:38  Scene crossfade A→B — two sonic worlds morphing
 *   0:38–0:45  FX go wild (glitch/crush/stutter), then pull back
 *   0:45–0:55  Journey START + GPS moment
 *   0:55–1:05  Hardware mockup reveal
 *   1:05–1:15  Closing card
 */

import { chromium } from 'playwright';
import { spawn, execSync } from 'child_process';
import { mkdirSync, writeFileSync, statSync, existsSync, readdirSync, unlinkSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, 'output');
const WEB_DIR = path.join(__dirname, '..', 'web');
const PORT = 8766;
const BASE = `http://127.0.0.1:${PORT}`;

// Barcelona — Llotja de Mar (Sónar+D venue)
const GEO = { latitude: 41.3818, longitude: 2.1685, accuracy: 10 };

const TS = new Date().toISOString().replace(/[T:]/g, '-').replace(/\..+/, '');
const P1_VIDEO_DIR = path.join(OUTPUT_DIR, 'v3-app-video');
const P2_VIDEO_DIR = path.join(OUTPUT_DIR, 'v3-mockup-video');
const P3_VIDEO_DIR = path.join(OUTPUT_DIR, 'v3-closing-video');
const AUDIO_FILE   = path.join(OUTPUT_DIR, 'v3-audio.webm');
const PART1_MP4    = path.join(OUTPUT_DIR, 'v3-app.mp4');
const PART2_MP4    = path.join(OUTPUT_DIR, 'v3-mockup.mp4');
const PART3_MP4    = path.join(OUTPUT_DIR, 'v3-closing.mp4');
const FINAL_VIDEO  = path.join(OUTPUT_DIR, `ohmyondas-sonar-v3-${TS}.mp4`);

for (const d of [OUTPUT_DIR, P1_VIDEO_DIR, P2_VIDEO_DIR, P3_VIDEO_DIR]) {
  mkdirSync(d, { recursive: true });
}

// ─── Helpers ───

function startServer() {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
    cwd: WEB_DIR, stdio: 'pipe'
  });
  console.log(`[server] ${BASE}`);
  return srv;
}

const w = (page, ms) => page.waitForTimeout(ms);

async function setCaption(page, text, opts = {}) {
  const { position = 'bottom', fontSize = '16px', delay = 0 } = opts;
  await page.evaluate(({ text, position, fontSize, delay }) => {
    let overlay = document.getElementById('demo-overlay');
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
    overlay.style.justifyContent = position === 'top' ? 'flex-start' :
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
    setTimeout(() => {
      const c = document.getElementById('demo-caption');
      if (c) c.style.opacity = '1';
    }, delay || 30);
  }, { text, position, fontSize, delay });
}

async function smoothTransform(page, selector, transform, origin, durationSec) {
  await page.evaluate(({ selector, transform, origin, durationSec }) => {
    const el = document.querySelector(selector);
    if (!el) return;
    el.style.transition = `transform ${durationSec}s cubic-bezier(0.25, 0.1, 0.25, 1)`;
    el.style.transformOrigin = origin;
    el.style.transform = transform;
  }, { selector, transform, origin, durationSec });
}

async function animateSlider(page, selector, targetValue, durationMs = 2000) {
  await page.evaluate(async ({ selector, targetValue, durationMs }) => {
    const el = document.querySelector(selector);
    if (!el) return;
    const startVal = parseInt(el.value);
    const diff = targetValue - startVal;
    const steps = Math.max(20, Math.ceil(durationMs / 50));
    for (let i = 1; i <= steps; i++) {
      el.value = Math.round(startVal + diff * (i / steps));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, durationMs / steps));
    }
  }, { selector, targetValue, durationMs });
}

function getLatestVideo(dir) {
  const files = readdirSync(dir).filter(f => f.endsWith('.webm'));
  if (files.length === 0) throw new Error(`No video in ${dir}`);
  return path.join(dir, files[files.length - 1]);
}


// ══════════════════════════════════════════════════════
// PART 1: APP DEMO — Radio Collage (55 seconds)
// ══════════════════════════════════════════════════════

async function recordAppDemo(server) {
  console.log('\n═══ PART 1: APP DEMO — Radio Collage ═══');

  const browser = await chromium.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--autoplay-policy=no-user-gesture-required',
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: P1_VIDEO_DIR, size: { width: 1920, height: 1080 } },
    permissions: ['microphone', 'geolocation'],
    geolocation: GEO,
  });

  const page = await context.newPage();
  await page.goto(`${BASE}/app.html`, { waitUntil: 'networkidle' });
  await w(page, 2000);

  // User gesture to init audio
  await page.click('body');
  await w(page, 600);

  // ─── PRE-SETUP (invisible to viewer — happens before meaningful recording) ───
  console.log('[setup] Initializing audio + pre-setup...');
  await page.evaluate(async () => {
    // Audio engine
    if (window.audioEngine && !window.audioEngine.initialized) await window.audioEngine.init();
    if (window.audioEngine?.ctx?.state === 'suspended') await window.audioEngine.ctx.resume();

    // Tempo: 85 BPM
    window.sequencer.setTempo(85);
    const ts = document.getElementById('tempoSlider');
    const tv = document.getElementById('tempoVal');
    if (ts) ts.value = 85;
    if (tv) tv.textContent = '85';

    // Mixer levels — balanced for texture, not drums
    const setFader = (id, v) => {
      const el = document.getElementById(id);
      if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }
    };
    setFader('faderSamples', 72);
    setFader('faderSynth', 45);
    setFader('faderRadio', 60);
    setFader('faderMic', 55);
    setFader('faderMaster', 85);

    // Start FX non-zero — textured from the beginning
    const setFx = (id, v) => {
      const el = document.getElementById(id);
      if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }
    };
    setFx('fxDelay', 20);
    setFx('fxGrain', 15);
    setFx('fxCrush', 12);

    // Filter cutoff LOW to start
    const fc = document.getElementById('filterCutoff');
    if (fc) { fc.value = 400; fc.dispatchEvent(new Event('input', { bubbles: true })); }

    // Enable mic input
    try { await window.micInput.init(); } catch {}
  });
  await w(page, 500);

  // Start audio recorder
  console.log('[setup] Starting audio recorder...');
  const recOk = await page.evaluate(() => window.sessionRecorder?.start() || false);
  console.log(`[setup] Recorder: ${recOk}`);
  await w(page, 300);


  // ═══════════════════════════════════════════════════════
  // 0:00–0:05  COLD OPEN: Radio scanning + GPS visible
  // ═══════════════════════════════════════════════════════
  console.log('[0:00] Radio scanning + GPS');

  // Switch to RADIO panel
  try { await page.click('.panel-tab[data-panel="radio-panel"]', { timeout: 1500 }); } catch {}
  await w(page, 400);

  await setCaption(page, 'Scanning FM radio — Barcelona, 41.38°N', { fontSize: '15px' });

  // Start radio — play fallback station
  await page.evaluate(async () => {
    try { await window.radioPlayer.playFallback(); } catch {}
  });
  await w(page, 1500);

  // Click SCAN button visually
  try { await page.click('#radioScan', { timeout: 1500 }); } catch {}
  await w(page, 2000);


  // ═══════════════════════════════════════════════════════
  // 0:05–0:10  Radio captured into pad
  // ═══════════════════════════════════════════════════════
  console.log('[0:05] Radio → Pad capture');
  await setCaption(page, '');

  // Capture radio into pad 0
  await page.evaluate(async () => {
    try {
      const buffer = await window.radioPlayer.captureToBuffer(3000);
      if (buffer) {
        window.sampler.loadBuffer(0, buffer, {
          name: 'Radio BCN',
          source: 'radio',
          gps: window.gpsTracker?.getPosition(),
          timestamp: Date.now()
        });
      }
    } catch (e) { console.log('Radio capture failed:', e.message); }
  });

  // Show the sample button click visually
  try {
    await page.evaluate(() => {
      const btn = document.getElementById('radioSample');
      if (btn) btn.disabled = false;
    });
    await page.click('#radioSample', { timeout: 1500 });
  } catch {}
  await w(page, 800);

  await setCaption(page, 'Radio fragment → sampler → sequencer', { fontSize: '15px' });
  await w(page, 1200);


  // ═══════════════════════════════════════════════════════
  // 0:10–0:18  Sequencer with irregular radio pattern + CTRL
  // ═══════════════════════════════════════════════════════
  console.log('[0:10] Sequencer + CTRL knobs');
  await setCaption(page, '');

  // Switch to SEQ panel
  try { await page.click('.panel-tab[data-panel="seq-panel"]', { timeout: 1500 }); } catch {}
  await w(page, 400);

  // Set up irregular pattern on track 0 (sampler with radio capture)
  // NOT 4-on-the-floor. Autechre-style: 0, 3, 5, 7, 8, 11, 14
  await page.evaluate(() => {
    window.sequencer.setTrackSource(0, 'sampler');
    for (const s of [0, 3, 5, 7, 8, 11, 14]) {
      window.sequencer.setStep(0, s, true);
    }
    // Track 1: second layer — different rhythm, shorter hits
    window.sequencer.setTrackSource(1, 'sampler');
    for (const s of [1, 4, 6, 10, 13]) {
      window.sequencer.setStep(1, s, true);
    }
    // Track 2: synth drone — just steps 0 and 8 with long release
    window.sequencer.setTrackSource(2, 'synth');
    window.sequencer.setStep(2, 0, true);
    window.sequencer.setStep(2, 8, true);
  });

  // Visually click a few steps so viewer sees interaction
  for (const s of [0, 3, 5, 7]) {
    try {
      await page.click(`.oct-step[data-track="0"][data-step="${s}"]`, { timeout: 800 });
      await w(page, 200);
    } catch {}
  }

  // PLAY
  await page.click('#btnPlay');
  await w(page, 2000);

  // Switch to CTRL panel — twist knobs
  try { await page.click('.panel-tab[data-panel="knobs-panel"]', { timeout: 1500 }); } catch {}
  await w(page, 300);

  // Animate FILT knob up (filter sweep)
  await animateSlider(page, '#filterCutoff', 3500, 2000);
  await w(page, 300);

  // Animate grain
  await animateSlider(page, '#fxGrain', 40, 1200);
  await w(page, 800);


  // ═══════════════════════════════════════════════════════
  // 0:18–0:25  Mic captures environment
  // ═══════════════════════════════════════════════════════
  console.log('[0:18] Mic ambient layer');
  await setCaption(page, 'Microphone captures the room', { fontSize: '15px' });

  // Switch to mixer to show mic fader coming up
  try { await page.click('.panel-tab[data-panel="mixer-panel"]', { timeout: 1500 }); } catch {}
  await w(page, 400);

  // Animate mic fader up
  await animateSlider(page, '#faderMic', 75, 1500);
  await w(page, 500);

  // Capture mic to pad 1
  await page.evaluate(async () => {
    try {
      await window.micInput.ensureActive();
      const buffer = await window.micInput.captureToBuffer(2000);
      if (buffer) {
        window.sampler.loadBuffer(1, buffer, {
          name: 'Room Ambience',
          source: 'mic',
          timestamp: Date.now()
        });
      }
    } catch {}
  });
  await w(page, 1500);


  // ═══════════════════════════════════════════════════════
  // 0:25–0:30  Synth drone + AI mood shifts
  // ═══════════════════════════════════════════════════════
  console.log('[0:25] Synth drone + AI mood');
  await setCaption(page, '');

  // Switch to AI panel
  try { await page.click('.panel-tab[data-panel="ai-panel"]', { timeout: 1500 }); } catch {}
  await w(page, 500);

  // Update AI context and change mood
  await page.evaluate(() => {
    if (window.aiComposer) {
      window.aiComposer.context.vibe = 'urban';
      window.aiComposer.updateUI?.();
      // Update the display elements
      const vibeEl = document.getElementById('aiVibe');
      if (vibeEl) vibeEl.textContent = 'Urban';
      const locEl = document.getElementById('aiLocation');
      if (locEl) locEl.textContent = 'Urban · Barcelona';
    }
  });
  await w(page, 1000);

  // Shift mood to melancholic
  await page.evaluate(() => {
    if (window.aiComposer) {
      window.aiComposer.context.vibe = 'calm';
      const vibeEl = document.getElementById('aiVibe');
      if (vibeEl) {
        vibeEl.style.transition = 'all 0.5s';
        vibeEl.textContent = 'Melancholic';
      }
    }
  });
  await w(page, 1200);

  // Bring synth fader up
  await animateSlider(page, '#faderSynth', 65, 1200);
  await w(page, 800);


  // ═══════════════════════════════════════════════════════
  // 0:30–0:38  Scene crossfade A→B
  // ═══════════════════════════════════════════════════════
  console.log('[0:30] Scene crossfade');
  await setCaption(page, 'Scene crossfade: two sonic worlds morphing', { fontSize: '15px' });

  // Switch to Scenes panel
  try { await page.click('.panel-tab[data-panel="scenes-panel"]', { timeout: 1500 }); } catch {}
  await w(page, 400);

  // Save current state as Scene A
  await page.evaluate(() => {
    window.sceneManager.saveScene(0);
  });
  // Click Scene A button visually
  try { await page.click('.scene-btn[data-scene="0"]', { timeout: 1000 }); } catch {}
  await w(page, 500);

  // Create Scene B — different FX, different filter, different feel
  await page.evaluate(() => {
    // Modify state for Scene B
    const setFx = (id, v) => {
      const el = document.getElementById(id);
      if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }
    };
    setFx('fxDelay', 65);
    setFx('fxGrain', 55);
    setFx('fxGlitch', 20);
    setFx('fxCrush', 8);

    // Higher filter cutoff
    const fc = document.getElementById('filterCutoff');
    if (fc) { fc.value = 12000; fc.dispatchEvent(new Event('input', { bubbles: true })); }

    // Different mixer balance
    const setFader = (id, v) => {
      const el = document.getElementById(id);
      if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }
    };
    setFader('faderRadio', 75);
    setFader('faderSynth', 35);
    setFader('faderSamples', 55);

    // Save as Scene B
    window.sceneManager.saveScene(1);
  });
  // Click Scene B button
  try { await page.click('.scene-btn[data-scene="1"]', { timeout: 1000 }); } catch {}
  await w(page, 500);

  // Recall Scene A first
  await page.evaluate(() => window.sceneManager.recallScene(0));
  await w(page, 500);

  // Now morph from A to B over 4 seconds using the crossfader
  await page.evaluate(() => {
    window.sceneManager.morphTo(1, 4000);
  });
  // Also visually animate the scene crossfader slider
  await animateSlider(page, '#sceneCrossfader', 100, 4000);
  await w(page, 1500);


  // ═══════════════════════════════════════════════════════
  // 0:38–0:45  FX go wild, then pull back
  // ═══════════════════════════════════════════════════════
  console.log('[0:38] FX destruction + pullback');
  await setCaption(page, '');

  // Switch to FX panel
  try { await page.click('.panel-tab[data-panel="fx-panel"]', { timeout: 1500 }); } catch {}
  await w(page, 400);

  // Crank everything — glitch, crush, delay
  await animateSlider(page, '#fxGlitch', 70, 1000);
  await animateSlider(page, '#fxCrush', 4, 600);
  await animateSlider(page, '#fxDelay', 80, 600);
  await w(page, 1200);

  // Punch stutter effect
  try {
    const stutterBtn = await page.$('.punch-btn[data-fx="stutter"]');
    if (stutterBtn) {
      const box = await stutterBtn.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await w(page, 600);
        await page.mouse.up();
      }
    }
  } catch {}
  await w(page, 400);

  // PULL BACK — clarity returns
  await animateSlider(page, '#fxGlitch', 5, 800);
  await animateSlider(page, '#fxCrush', 14, 600);
  await animateSlider(page, '#fxDelay', 25, 800);
  await w(page, 800);


  // ═══════════════════════════════════════════════════════
  // 0:45–0:55  Journey START — GPS moment
  // ═══════════════════════════════════════════════════════
  console.log('[0:45] Journey + GPS');

  // Switch to Journey panel
  try { await page.click('.panel-tab[data-panel="journey-panel"]', { timeout: 1500 }); } catch {}
  await w(page, 500);

  await setCaption(page, 'This sound belongs to this place', { fontSize: '18px' });

  // Press START
  try { await page.click('#journeyStart', { timeout: 2000 }); } catch {}
  await w(page, 2000);

  // Add a WAYPOINT
  try { await page.click('#journeyWaypoint', { timeout: 2000 }); } catch {}
  await w(page, 1500);

  // Update GPS display
  await page.evaluate(() => {
    const gpsText = document.getElementById('gpsText');
    if (gpsText) gpsText.textContent = '41.3818, 2.1685 — Barcelona';
    const gpsTextE = document.getElementById('gpsTextE');
    if (gpsTextE) gpsTextE.textContent = '41.3818, 2.1685';
  });
  await w(page, 3000);

  // Fade caption
  await setCaption(page, '');
  await w(page, 1000);

  // ─── Stop and extract audio ───
  console.log('[demo] Stopping + extracting audio...');
  await page.click('#btnStop');
  await w(page, 500);

  // Stop recorder and wait for finalization
  await page.evaluate(() => {
    return new Promise(resolve => {
      const sr = window.sessionRecorder;
      if (!sr?.isRecording()) { resolve(); return; }
      // Listen for the recording complete callback
      const origCb = sr.onRecordingComplete;
      sr.onRecordingComplete = (recording) => {
        if (origCb) origCb(recording);
        resolve();
      };
      sr.stop();
      // Safety timeout
      setTimeout(resolve, 3000);
    });
  });
  await w(page, 1000);

  const audioData = await page.evaluate(async () => {
    const sr = window.sessionRecorder;
    // Try the finalized recording first (has proper container)
    if (sr?.recordings?.length > 0) {
      const latest = sr.recordings[0]; // most recent (unshift)
      if (latest.blob && latest.blob.size > 1000) {
        const buf = await latest.blob.arrayBuffer();
        return Array.from(new Uint8Array(buf));
      }
    }
    // Fallback to raw chunks
    if (sr?.chunks?.length > 0) {
      const blob = new Blob(sr.chunks, { type: sr.mediaRecorder?.mimeType || 'audio/webm' });
      const buf = await blob.arrayBuffer();
      return Array.from(new Uint8Array(buf));
    }
    return null;
  });

  if (audioData) {
    writeFileSync(AUDIO_FILE, Buffer.from(audioData));
    console.log(`[audio] ${(audioData.length / 1024).toFixed(0)} KB`);
  } else {
    console.log('[audio] No audio captured');
  }

  await page.close();
  await context.close();
  await browser.close();

  // Encode — try with audio, fallback to video-only
  const vid = getLatestVideo(P1_VIDEO_DIR);
  const hasAudio = existsSync(AUDIO_FILE) && statSync(AUDIO_FILE).size > 5000;
  let audioMerged = false;
  if (hasAudio) {
    try {
      execSync(`ffmpeg -y -i "${vid}" -i "${AUDIO_FILE}" -c:v libx264 -preset fast -crf 20 -c:a aac -b:a 192k -shortest -movflags +faststart "${PART1_MP4}"`, { stdio: 'inherit' });
      audioMerged = true;
    } catch {
      console.log('[Part1] Audio merge failed, encoding video-only');
    }
  }
  if (!audioMerged) {
    execSync(`ffmpeg -y -i "${vid}" -c:v libx264 -preset fast -crf 20 -an -movflags +faststart "${PART1_MP4}"`, { stdio: 'inherit' });
  }
  console.log(`[Part1] ✓ ${PART1_MP4} (audio: ${audioMerged})`);
}


// ══════════════════════════════════════════════════════
// PART 2: MOCKUP REVEAL (10 seconds)
// ══════════════════════════════════════════════════════

async function recordMockup(server) {
  console.log('\n═══ PART 2: MOCKUP REVEAL ═══');

  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: P2_VIDEO_DIR, size: { width: 1920, height: 1080 } },
  });

  const page = await context.newPage();
  await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
  await w(page, 2000);

  // Clean cinematic view
  await page.evaluate(() => {
    const hide = (sel) => { const el = document.querySelector(sel); if (el) el.style.display = 'none'; };
    hide('.page-header');
    hide('.info-bar');
    hide('.diy-panel');
    hide('.page-footer');
    document.querySelectorAll('.sensor, .io-ports').forEach(el => el.style.display = 'none');
    const main = document.querySelector('.main-content');
    if (main) { main.style.padding = '0'; main.style.minHeight = '100vh'; main.style.background = 'transparent'; }
    document.body.style.background = '#0a0a0a';
  });
  await w(page, 500);

  // Full device — then zoom to highlight key areas quickly
  await setCaption(page, 'Oh My Ondas · ~€200 · Open Source · Build Your Own', { fontSize: '16px', position: 'bottom' });
  await w(page, 2500);

  // Quick zoom to pads + encoders
  await smoothTransform(page, '.device-container', 'scale(1.6)', '25% 50%', 2);
  await w(page, 2500);

  // Zoom to GPS strip
  await smoothTransform(page, '.device-container', 'scale(2.0)', '80% 90%', 1.5);
  await w(page, 2000);

  // Pull back
  await smoothTransform(page, '.device-container', 'scale(1.0)', '50% 50%', 1.5);
  await setCaption(page, 'ohmyondas.levm.eu', { fontSize: '14px', position: 'bottom' });
  await w(page, 2500);
  await setCaption(page, '');
  await w(page, 300);

  await page.close();
  await context.close();
  await browser.close();

  const vid = getLatestVideo(P2_VIDEO_DIR);
  execSync(`ffmpeg -y -i "${vid}" -c:v libx264 -preset fast -crf 20 -an -movflags +faststart "${PART2_MP4}"`, { stdio: 'inherit' });
  console.log(`[Part2] ✓ ${PART2_MP4}`);
}


// ══════════════════════════════════════════════════════
// PART 3: CLOSING CARD (8 seconds)
// ══════════════════════════════════════════════════════

async function recordClosing(server) {
  console.log('\n═══ PART 3: CLOSING ═══');

  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: P3_VIDEO_DIR, size: { width: 1920, height: 1080 } },
  });

  const page = await context.newPage();
  await page.goto('about:blank');
  await page.evaluate(() => {
    document.body.style.cssText = `
      margin:0; padding:0; background:#0a0a0a;
      display:flex; justify-content:center; align-items:center;
      height:100vh; font-family:'Courier New',monospace; color:#00e5a0;
    `;
    document.body.innerHTML = `
      <div style="text-align:center; opacity:0; transition:opacity 1.2s ease-in;" id="card">
        <div style="font-size:44px; font-weight:bold; letter-spacing:8px; margin-bottom:16px;
                    text-shadow:0 0 20px rgba(0,229,160,0.4);">OH MY ONDAS</div>
        <div style="font-size:16px; opacity:0.6; margin-bottom:36px; letter-spacing:2px;">
          A Location-Aware Music Instrument
        </div>
        <div style="font-size:13px; opacity:0.4; line-height:2; letter-spacing:1px;">
          Open Source · GPL v3 · ~€200 to build<br>
          ohmyondas.levm.eu<br>
          github.com/alevm/oh-my-ondas<br><br>
          <span style="opacity:0.7;">Andrea Valenti · Barcelona · 2026</span>
        </div>
      </div>
    `;
    setTimeout(() => { document.getElementById('card').style.opacity = '1'; }, 200);
  });
  await w(page, 8000);

  await page.close();
  await context.close();
  await browser.close();

  const vid = getLatestVideo(P3_VIDEO_DIR);
  execSync(`ffmpeg -y -i "${vid}" -c:v libx264 -preset fast -crf 20 -an -movflags +faststart "${PART3_MP4}"`, { stdio: 'inherit' });
  console.log(`[Part3] ✓ ${PART3_MP4}`);
}


// ══════════════════════════════════════════════════════
// STITCH
// ══════════════════════════════════════════════════════

function stitchFinal() {
  console.log('\n═══ STITCHING ═══');

  const norm = (input, output, addSilentAudio = false) => {
    const audioArg = addSilentAudio
      ? '-f lavfi -i anullsrc=channel_layout=stereo:sample_rate=48000'
      : '';
    const audioEnc = addSilentAudio ? '-c:a aac -b:a 192k -shortest' : '-c:a aac -b:a 192k';
    execSync(`ffmpeg -y -i "${input}" ${audioArg} -c:v libx264 -preset fast -crf 18 -r 25 -s 1920x1080 -pix_fmt yuv420p ${audioEnc} -movflags +faststart "${output}"`, { stdio: 'inherit' });
  };

  const P1N = path.join(OUTPUT_DIR, 'v3-n1.mp4');
  const P2N = path.join(OUTPUT_DIR, 'v3-n2.mp4');
  const P3N = path.join(OUTPUT_DIR, 'v3-n3.mp4');

  // Check if Part 1 has audio
  let p1HasAudio = false;
  try {
    const probe = execSync(`ffprobe -v quiet -print_format json -show_streams "${PART1_MP4}"`).toString();
    p1HasAudio = JSON.parse(probe).streams.some(s => s.codec_type === 'audio');
  } catch {}

  console.log('[stitch] Normalizing parts...');
  norm(PART1_MP4, P1N, !p1HasAudio); // add silent audio only if needed
  norm(PART2_MP4, P2N, true); // needs silent audio
  norm(PART3_MP4, P3N, true); // needs silent audio

  const concatFile = path.join(OUTPUT_DIR, 'v3-concat.txt');
  writeFileSync(concatFile, `file '${P1N}'\nfile '${P2N}'\nfile '${P3N}'\n`);

  console.log('[stitch] Concatenating...');
  execSync(`ffmpeg -y -f concat -safe 0 -i "${concatFile}" -c copy -movflags +faststart "${FINAL_VIDEO}"`, { stdio: 'inherit' });

  // Cleanup
  for (const f of [P1N, P2N, P3N, concatFile]) {
    try { unlinkSync(f); } catch {}
  }

  const stats = statSync(FINAL_VIDEO);
  console.log(`\n════════════════════════════════════════`);
  console.log(`✓ FINAL: ${FINAL_VIDEO}`);
  console.log(`  Size: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
  try {
    const probe = execSync(`ffprobe -v quiet -print_format json -show_format "${FINAL_VIDEO}"`).toString();
    console.log(`  Duration: ${Math.round(JSON.parse(probe).format.duration)}s`);
  } catch {}
  console.log(`════════════════════════════════════════\n`);
}


// ── MAIN ──

async function main() {
  const server = startServer();
  await new Promise(r => setTimeout(r, 1500));

  try {
    await recordAppDemo(server);
    await recordMockup(server);
    await recordClosing(server);
    stitchFinal();
  } catch (err) {
    console.error('FATAL:', err);
    process.exit(1);
  } finally {
    server.kill();
  }
}

main();
