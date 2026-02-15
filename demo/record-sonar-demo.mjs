/**
 * Oh My Ondas — Sónar+D 2026 Demo Video
 *
 * Three-part structure:
 *   Part 1 (0:00–0:25): Hardware mockup — cinematic zoom/pan + text overlays
 *   Part 2 (0:25–1:15): App demo — build a musical piece from scratch
 *   Part 3 (1:15–1:25): Closing card — project info
 *
 * Each part recorded separately, then stitched with ffmpeg.
 *
 * Strategy:
 *   - Playwright viewport recording (video)
 *   - App's built-in SessionRecorder (audio, Part 2 only)
 *   - Barcelona geolocation (Sónar+D venue)
 */

import { chromium } from 'playwright';
import { spawn, execSync } from 'child_process';
import { mkdirSync, writeFileSync, statSync, existsSync, readdirSync, copyFileSync, unlinkSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, 'output');
const WEB_DIR = path.join(__dirname, '..', 'web');
const PORT = 8766;
const BASE = `http://127.0.0.1:${PORT}`;

// Barcelona — Llotja de Mar (Sónar+D venue)
const GEO = { latitude: 41.3818, longitude: 2.1685, accuracy: 10 };

// Output paths
const P1_VIDEO_DIR = path.join(OUTPUT_DIR, 'part1-video');
const P2_VIDEO_DIR = path.join(OUTPUT_DIR, 'part2-video');
const P3_VIDEO_DIR = path.join(OUTPUT_DIR, 'part3-video');
const AUDIO_FILE   = path.join(OUTPUT_DIR, 'sonar-audio.webm');
const PART1_MP4    = path.join(OUTPUT_DIR, 'part1.mp4');
const PART2_MP4    = path.join(OUTPUT_DIR, 'part2.mp4');
const PART3_MP4    = path.join(OUTPUT_DIR, 'part3.mp4');
const TS = new Date().toISOString().replace(/[T:]/g, '-').replace(/\..+/, '');
const FINAL_VIDEO  = path.join(OUTPUT_DIR, `ohmyondas-sonar-demo-${TS}.mp4`);

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

/** Inject or update a text overlay caption */
async function setCaption(page, text, opts = {}) {
  const { position = 'bottom', fontSize = '18px', delay = 0 } = opts;
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

    if (!text) {
      overlay.innerHTML = '';
      return;
    }

    overlay.innerHTML = `
      <div style="
        font-family: 'Courier New', monospace;
        color: #00e5a0;
        font-size: ${fontSize};
        text-shadow: 0 0 10px rgba(0,229,160,0.5);
        background: rgba(0,0,0,0.75);
        padding: 14px 28px;
        border-radius: 4px;
        opacity: 0;
        transition: opacity 0.8s ease-in;
        text-align: center;
        line-height: 1.6;
        max-width: 80%;
        letter-spacing: 1px;
      " id="demo-caption">${text}</div>
    `;

    setTimeout(() => {
      const cap = document.getElementById('demo-caption');
      if (cap) cap.style.opacity = '1';
    }, delay || 50);
  }, { text, position, fontSize, delay });
}

/** Smoothly set a CSS transform on an element */
async function smoothTransform(page, selector, transform, origin, durationSec) {
  await page.evaluate(({ selector, transform, origin, durationSec }) => {
    const el = document.querySelector(selector);
    if (!el) return;
    el.style.transition = `transform ${durationSec}s cubic-bezier(0.25, 0.1, 0.25, 1)`;
    el.style.transformOrigin = origin;
    el.style.transform = transform;
  }, { selector, transform, origin, durationSec });
}

/** Get the latest webm file from a directory */
function getLatestVideo(dir) {
  const files = readdirSync(dir).filter(f => f.endsWith('.webm'));
  if (files.length === 0) throw new Error(`No video files in ${dir}`);
  return path.join(dir, files[files.length - 1]);
}

/** Slowly drag a range slider to a target value (visible animation) */
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


// ══════════════════════════════════════════════════════
// PART 1: HARDWARE MOCKUP — Cinematic (25 seconds)
// ══════════════════════════════════════════════════════

async function recordPart1(server) {
  console.log('\n═══ PART 1: HARDWARE MOCKUP ═══');

  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: P1_VIDEO_DIR, size: { width: 1920, height: 1080 } },
  });

  const page = await context.newPage();
  await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
  await w(page, 2000);

  // Hide non-device elements for clean cinematic view
  await page.evaluate(() => {
    const hide = (sel) => { const el = document.querySelector(sel); if (el) el.style.display = 'none'; };
    hide('.page-header');
    hide('.info-bar');
    hide('.diy-panel');
    hide('.page-footer');
    // Hide external sensors and I/O ports for cleaner framing
    document.querySelectorAll('.sensor, .io-ports').forEach(el => el.style.display = 'none');
    // Center the device fully
    const main = document.querySelector('.main-content');
    if (main) { main.style.padding = '0'; main.style.minHeight = '100vh'; }
    // Dark background for cinematic feel
    document.body.style.background = '#0a0a0a';
    const main2 = document.querySelector('.main-content');
    if (main2) main2.style.background = 'transparent';
  });
  await w(page, 500);

  // ── Shot 1 (0:00–0:04): Full device reveal ──
  console.log('[Part1] Shot 1: Full device reveal');
  await w(page, 500);
  await setCaption(page, 'OH MY ONDAS', { position: 'center', fontSize: '42px', delay: 300 });
  await w(page, 1500);
  await setCaption(page, 'OH MY ONDAS<br><span style="font-size:20px;opacity:0.7;">A Location-Aware Music Instrument</span>', { position: 'center', fontSize: '42px' });
  await w(page, 2000);

  // ── Shot 2 (0:04–0:08): Zoom to control surface ──
  console.log('[Part1] Shot 2: Control surface zoom');
  await setCaption(page, '');
  await smoothTransform(page, '.device-container', 'scale(1.8)', '15% 40%', 2.5);
  await w(page, 2800);
  await setCaption(page, '13 encoders · 8 pads · 4 faders · DJ crossfader', { position: 'bottom', fontSize: '16px' });
  await w(page, 1500);

  // ── Shot 3 (0:08–0:12): Zoom to mixer / crossfader ──
  console.log('[Part1] Shot 3: Mixer & crossfader');
  await setCaption(page, '');
  await smoothTransform(page, '.device-container', 'scale(2.0)', '35% 65%', 2.5);
  await w(page, 2800);
  await setCaption(page, '5-channel mixer with scene crossfade', { position: 'bottom', fontSize: '16px' });
  await w(page, 1500);

  // ── Shot 4 (0:12–0:17): Zoom to GPS section ──
  console.log('[Part1] Shot 4: GPS & connectivity');
  await setCaption(page, '');
  await smoothTransform(page, '.device-container', 'scale(2.2)', '80% 85%', 2.5);
  await w(page, 2800);
  await setCaption(page, 'GPS · WiFi · FM Radio · every sound belongs to a place', { position: 'bottom', fontSize: '16px' });
  await w(page, 1500);

  // ── Shot 5 (0:17–0:22): Pull back + transition ──
  console.log('[Part1] Shot 5: Pull back');
  await setCaption(page, '');
  await smoothTransform(page, '.device-container', 'scale(1.0)', '50% 50%', 2);
  await w(page, 2200);
  await setCaption(page, 'Open source · €200 in parts · build your own<br><span style="font-size:14px;opacity:0.6;">ohmyondas.levm.eu</span>', { position: 'bottom', fontSize: '16px' });
  await w(page, 2000);
  await setCaption(page, '');
  await w(page, 300);

  console.log('[Part1] Closing...');
  await page.close();
  await context.close();
  await browser.close();

  // Encode Part 1
  const vid1 = getLatestVideo(P1_VIDEO_DIR);
  console.log(`[Part1] Video: ${vid1}`);
  execSync(`ffmpeg -y -i "${vid1}" -c:v libx264 -preset fast -crf 20 -an -movflags +faststart "${PART1_MP4}"`, { stdio: 'inherit' });
  console.log(`[Part1] ✓ ${PART1_MP4}`);
}


// ══════════════════════════════════════════════════════
// PART 2: APP DEMO — Musical Arc (50 seconds)
// ══════════════════════════════════════════════════════

async function recordPart2(server) {
  console.log('\n═══ PART 2: APP DEMO ═══');

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
    recordVideo: { dir: P2_VIDEO_DIR, size: { width: 1920, height: 1080 } },
    permissions: ['microphone', 'geolocation'],
    geolocation: GEO,
  });

  const page = await context.newPage();
  await page.goto(`${BASE}/app.html`, { waitUntil: 'networkidle' });
  await w(page, 2000);

  // Initialize audio engine (user gesture)
  await page.click('body');
  await w(page, 1000);

  // Ensure audio engine is running
  await page.evaluate(async () => {
    if (window.audioEngine && !window.audioEngine.initialized) {
      await window.audioEngine.init();
    }
    if (window.audioEngine?.ctx?.state === 'suspended') {
      await window.audioEngine.ctx.resume();
    }
  });
  await w(page, 500);

  // Set tempo to 95 BPM
  console.log('[Part2] Setting tempo: 95 BPM');
  await page.evaluate(() => {
    window.sequencer.setTempo(95);
    const slider = document.getElementById('tempoSlider');
    const val = document.getElementById('tempoVal');
    if (slider) slider.value = 95;
    if (val) val.textContent = '95';
  });
  await w(page, 300);

  // Set balanced mixer levels
  await page.evaluate(() => {
    const setFader = (id, val) => {
      const el = document.getElementById(id);
      if (el) { el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); }
    };
    setFader('faderSamples', 70);
    setFader('faderSynth', 50);
    setFader('faderRadio', 40);
    setFader('faderMic', 55);
    setFader('faderMaster', 85);
  });
  await w(page, 300);

  // Start audio recorder
  console.log('[Part2] Starting audio recorder...');
  const recStarted = await page.evaluate(() => {
    if (window.sessionRecorder) return window.sessionRecorder.start();
    return false;
  });
  console.log(`[Part2] Recorder: ${recStarted}`);
  await w(page, 500);

  // ─── INTRO (0:00–0:08): Silence → Kick pattern ───
  console.log('[Part2] INTRO: Kick pattern');
  await setCaption(page, 'Building a pattern from scratch', { position: 'bottom', fontSize: '16px', delay: 500 });

  // Place kick on beats 1, 5, 9, 13 (quarter notes) on track 0
  await page.evaluate(() => {
    window.sequencer.setStep(0, 0, true);
    window.sequencer.setStep(0, 4, true);
    window.sequencer.setStep(0, 8, true);
    window.sequencer.setStep(0, 12, true);
    // Refresh UI
    if (window.app?.refreshSequencerUI) window.app.refreshSequencerUI();
  });

  // Also visually click the steps (animate the UI)
  for (const step of [0, 4, 8, 12]) {
    try {
      await page.click(`.oct-step[data-track="0"][data-step="${step}"]`, { timeout: 1500 });
      await w(page, 300);
    } catch {}
  }

  // Hit PLAY
  await page.click('#btnPlay');
  await w(page, 5000); // Let kick play

  // ─── BUILD (0:08–0:16): Add hi-hats on track 1 ───
  console.log('[Part2] BUILD: Hi-hats');
  await setCaption(page, '');

  // Off-beat hi-hats on steps 2, 6, 10, 14
  await page.evaluate(() => {
    window.sequencer.setStep(1, 2, true);
    window.sequencer.setStep(1, 6, true);
    window.sequencer.setStep(1, 10, true);
    window.sequencer.setStep(1, 14, true);
    // Also add some 8th note hats
    window.sequencer.setStep(1, 0, true);
    window.sequencer.setStep(1, 4, true);
    window.sequencer.setStep(1, 8, true);
    window.sequencer.setStep(1, 12, true);
  });

  // Visual step clicks on track 1
  for (const step of [2, 6, 10, 14]) {
    try {
      await page.click(`.oct-step[data-track="1"][data-step="${step}"]`, { timeout: 1500 });
      await w(page, 250);
    } catch {}
  }
  await w(page, 4000); // Let it groove

  // ─── TEXTURE (0:16–0:24): Pads + filter sweep ───
  console.log('[Part2] TEXTURE: Pads + filter sweep');

  // Trigger pad 1 (kick)
  try { await page.click('.pads-grid .pad[data-pad="0"]', { timeout: 2000 }); } catch {}
  await w(page, 500);
  // Trigger pad 3 (hi-hat)
  try { await page.click('.pads-grid .pad[data-pad="2"]', { timeout: 2000 }); } catch {}
  await w(page, 500);

  // Switch to synth panel briefly to show filter
  try { await page.click('.panel-tab[data-panel="synth-panel"]', { timeout: 1500 }); } catch {}
  await w(page, 500);

  // Slow filter sweep: cutoff from 200 to 8000 Hz over 6 seconds
  console.log('[Part2] Filter sweep...');
  await setCaption(page, 'Filter sweep — dark to bright', { position: 'bottom', fontSize: '14px' });
  await animateSlider(page, '#filterCutoff', 8000, 6000);
  await w(page, 300);

  // ─── DEPTH (0:24–0:32): Synth layer ───
  console.log('[Part2] DEPTH: Synth layer');
  await setCaption(page, '');

  // Switch SEQ source to SYN for track 2
  try { await page.click('.panel-tab[data-panel="seq-panel"]', { timeout: 1500 }); } catch {}
  await w(page, 500);

  // Add bass notes on track 2 (simple pattern: steps 0, 4, 8, 12 — root D)
  await page.evaluate(() => {
    // Set track 2 to synth source
    window.sequencer.setTrackSource(2, 'synth');
    // Add bass steps
    window.sequencer.setStep(2, 0, true);
    window.sequencer.setStep(2, 4, true);
    window.sequencer.setStep(2, 10, true);
  });

  for (const step of [0, 4, 10]) {
    try {
      await page.click(`.oct-step[data-track="2"][data-step="${step}"]`, { timeout: 1500 });
      await w(page, 250);
    } catch {}
  }
  await w(page, 4000); // Let synth+drums groove

  // ─── EFFECTS (0:32–0:40): Delay + grain ───
  console.log('[Part2] EFFECTS: Delay + grain');

  // Switch to FX panel
  try { await page.click('.panel-tab[data-panel="fx-panel"]', { timeout: 1500 }); } catch {}
  await w(page, 500);

  await setCaption(page, 'Adding space — delay and grain', { position: 'bottom', fontSize: '14px' });

  // Animate delay up
  await animateSlider(page, '#fxDelay', 45, 2500);
  await w(page, 400);

  // Animate grain up slightly
  await animateSlider(page, '#fxGrain', 30, 1500);
  await w(page, 2000); // Let effects ring

  // ─── LOCATION (0:40–0:48): GPS / Journey ───
  console.log('[Part2] LOCATION: GPS reveal');
  await setCaption(page, '');

  // Switch to Journey panel
  try { await page.click('.panel-tab[data-panel="journey-panel"]', { timeout: 1500 }); } catch {}
  await w(page, 1000);

  await setCaption(page, 'GPS: 41.3818°N, 2.1685°E — Barcelona<br><span style="font-size:13px;opacity:0.7;">This composition now belongs to this place</span>', { position: 'bottom', fontSize: '18px' });

  // Press Journey START
  try { await page.click('#journeyStart', { timeout: 2000 }); } catch {}
  await w(page, 3000); // Show GPS data appearing

  // Also switch to AI panel briefly to show location detection
  try { await page.click('.panel-tab[data-panel="ai-panel"]', { timeout: 1500 }); } catch {}
  await w(page, 2500);

  // ─── ENDING (0:48–0:50): Stop ───
  console.log('[Part2] ENDING: Stop');
  await setCaption(page, '');
  await page.click('#btnStop');
  await w(page, 1500);

  // ─── Extract audio ───
  console.log('[Part2] Extracting audio...');
  await page.evaluate(() => {
    if (window.sessionRecorder?.isRecording()) window.sessionRecorder.stop();
  });
  await w(page, 1500);

  const audioData = await page.evaluate(async () => {
    const sr = window.sessionRecorder;
    if (sr?.chunks?.length > 0) {
      const blob = new Blob(sr.chunks, { type: 'audio/webm' });
      const buf = await blob.arrayBuffer();
      return Array.from(new Uint8Array(buf));
    }
    if (sr?.recordings?.length > 0) {
      const latest = sr.recordings[0];
      if (latest.blob) {
        const buf = await latest.blob.arrayBuffer();
        return Array.from(new Uint8Array(buf));
      }
    }
    return null;
  });

  if (audioData) {
    writeFileSync(AUDIO_FILE, Buffer.from(audioData));
    console.log(`[Part2] Audio: ${(audioData.length / 1024).toFixed(0)} KB`);
  } else {
    console.log('[Part2] No audio captured (will be silent)');
  }

  await page.close();
  await context.close();
  await browser.close();

  // Encode Part 2
  const vid2 = getLatestVideo(P2_VIDEO_DIR);
  console.log(`[Part2] Video: ${vid2}`);
  const hasAudio = existsSync(AUDIO_FILE) && statSync(AUDIO_FILE).size > 1000;
  if (hasAudio) {
    execSync(`ffmpeg -y -i "${vid2}" -i "${AUDIO_FILE}" -c:v libx264 -preset fast -crf 20 -c:a aac -b:a 192k -shortest -movflags +faststart "${PART2_MP4}"`, { stdio: 'inherit' });
  } else {
    execSync(`ffmpeg -y -i "${vid2}" -c:v libx264 -preset fast -crf 20 -an -movflags +faststart "${PART2_MP4}"`, { stdio: 'inherit' });
  }
  console.log(`[Part2] ✓ ${PART2_MP4}`);
}


// ══════════════════════════════════════════════════════
// PART 3: CLOSING CARD (10 seconds)
// ══════════════════════════════════════════════════════

async function recordPart3(server) {
  console.log('\n═══ PART 3: CLOSING CARD ═══');

  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: P3_VIDEO_DIR, size: { width: 1920, height: 1080 } },
  });

  const page = await context.newPage();

  // Navigate to a blank page and inject the closing card
  await page.goto('about:blank');
  await page.evaluate(() => {
    document.body.style.cssText = `
      margin: 0; padding: 0;
      background: #0a0a0a;
      display: flex; justify-content: center; align-items: center;
      height: 100vh; width: 100vw;
      font-family: 'Courier New', monospace;
      color: #00e5a0;
    `;
    document.body.innerHTML = `
      <div style="text-align: center; opacity: 0; transition: opacity 1.5s ease-in;" id="card">
        <div style="font-size: 48px; font-weight: bold; letter-spacing: 8px; margin-bottom: 20px;
                    text-shadow: 0 0 20px rgba(0,229,160,0.4);">OH MY ONDAS</div>
        <div style="font-size: 18px; opacity: 0.7; margin-bottom: 40px; letter-spacing: 2px;">
          A Location-Aware Music Instrument
        </div>
        <div style="font-size: 14px; opacity: 0.5; line-height: 2.2; letter-spacing: 1px;">
          Open Source · GPL v3 · ~€200 to build<br>
          <span style="opacity: 0.8;">ohmyondas.levm.eu</span><br>
          <span style="opacity: 0.6;">github.com/alevm/oh-my-ondas</span><br><br>
          <span style="opacity: 0.4; font-size: 13px;">Andrea Valenti · Barcelona · 2026</span>
        </div>
      </div>
    `;
    // Fade in
    setTimeout(() => {
      document.getElementById('card').style.opacity = '1';
    }, 200);
  });

  await w(page, 8000); // Hold for 8 seconds

  await page.close();
  await context.close();
  await browser.close();

  // Encode Part 3
  const vid3 = getLatestVideo(P3_VIDEO_DIR);
  console.log(`[Part3] Video: ${vid3}`);
  execSync(`ffmpeg -y -i "${vid3}" -c:v libx264 -preset fast -crf 20 -an -movflags +faststart "${PART3_MP4}"`, { stdio: 'inherit' });
  console.log(`[Part3] ✓ ${PART3_MP4}`);
}


// ══════════════════════════════════════════════════════
// FINAL ASSEMBLY
// ══════════════════════════════════════════════════════

function stitchFinal() {
  console.log('\n═══ STITCHING FINAL VIDEO ═══');

  const concatFile = path.join(OUTPUT_DIR, 'concat.txt');
  let parts = `file '${PART1_MP4}'\n`;
  parts += `file '${PART2_MP4}'\n`;
  parts += `file '${PART3_MP4}'\n`;
  writeFileSync(concatFile, parts);

  // First, ensure all parts have the same resolution/framerate for clean concat
  // Re-encode each to ensure identical stream params
  const norm = (input, output) => {
    execSync(`ffmpeg -y -i "${input}" -c:v libx264 -preset fast -crf 18 -r 25 -s 1920x1080 -pix_fmt yuv420p -c:a aac -b:a 192k -ar 48000 -ac 2 -movflags +faststart "${output}"`, { stdio: 'inherit' });
  };

  const P1_NORM = path.join(OUTPUT_DIR, 'part1-norm.mp4');
  const P2_NORM = path.join(OUTPUT_DIR, 'part2-norm.mp4');
  const P3_NORM = path.join(OUTPUT_DIR, 'part3-norm.mp4');

  // Part 1: add silent audio stream
  console.log('[stitch] Normalizing Part 1 (adding silent audio)...');
  execSync(`ffmpeg -y -i "${PART1_MP4}" -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=48000 -c:v libx264 -preset fast -crf 18 -r 25 -s 1920x1080 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest -movflags +faststart "${P1_NORM}"`, { stdio: 'inherit' });

  // Part 2: normalize
  console.log('[stitch] Normalizing Part 2...');
  norm(PART2_MP4, P2_NORM);

  // Part 3: add silent audio stream
  console.log('[stitch] Normalizing Part 3 (adding silent audio)...');
  execSync(`ffmpeg -y -i "${PART3_MP4}" -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=48000 -c:v libx264 -preset fast -crf 18 -r 25 -s 1920x1080 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest -movflags +faststart "${P3_NORM}"`, { stdio: 'inherit' });

  // Concatenate
  const normConcatFile = path.join(OUTPUT_DIR, 'concat-norm.txt');
  writeFileSync(normConcatFile, `file '${P1_NORM}'\nfile '${P2_NORM}'\nfile '${P3_NORM}'\n`);

  console.log('[stitch] Concatenating...');
  execSync(`ffmpeg -y -f concat -safe 0 -i "${normConcatFile}" -c copy -movflags +faststart "${FINAL_VIDEO}"`, { stdio: 'inherit' });

  // Clean up normalized files
  for (const f of [P1_NORM, P2_NORM, P3_NORM, concatFile, normConcatFile]) {
    try { unlinkSync(f); } catch {}
  }

  // Final stats
  const stats = statSync(FINAL_VIDEO);
  console.log(`\n════════════════════════════════════════`);
  console.log(`✓ FINAL: ${FINAL_VIDEO}`);
  console.log(`  Size: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);

  // Get duration
  try {
    const probe = execSync(`ffprobe -v quiet -print_format json -show_format "${FINAL_VIDEO}"`).toString();
    const dur = JSON.parse(probe).format.duration;
    console.log(`  Duration: ${Math.round(dur)}s`);
  } catch {}
  console.log(`════════════════════════════════════════\n`);
}


// ══════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════

async function main() {
  const server = startServer();
  await new Promise(r => setTimeout(r, 1500));

  try {
    await recordPart1(server);
    await recordPart2(server);
    await recordPart3(server);
    stitchFinal();
  } catch (err) {
    console.error('FATAL:', err);
    process.exit(1);
  } finally {
    server.kill();
  }
}

main();
