/**
 * OhMyOndas Demo Video Recorder v3
 *
 * Comprehensive demo showcasing:
 * - Radio: search, tune, capture to pads, sequence the captured audio
 * - Microphone capture
 * - AI generation with musique concrète vibe (Stockhausen/Walkmen)
 * - Balanced mixer levels
 * - Synth textures + filter sweeps
 * - FX: delay, glitch, grain, punch effects
 * - Scene save/morph
 * - GPS/location display
 * - Pattern switching with variations
 *
 * Uses x11grab on XWayland :1 + PulseAudio for screen+audio capture.
 */

import { chromium } from 'playwright';
import { execSync, spawn } from 'child_process';
import { mkdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, 'output');
const FINAL_VIDEO = path.join(OUTPUT_DIR, 'ohmyondas-demo.mp4');
const RAW_VIDEO = path.join(OUTPUT_DIR, 'ohmyondas-demo-raw.mkv');
const WEB_DIR = path.join(__dirname, '..', 'web');

mkdirSync(OUTPUT_DIR, { recursive: true });

// ─── Web server ───
function startServer() {
  const srv = spawn('python3', ['-m', 'http.server', '8765', '--bind', '127.0.0.1'], {
    cwd: WEB_DIR, stdio: 'pipe'
  });
  console.log('[server] Started on http://127.0.0.1:8765');
  return srv;
}

// ─── Find default PulseAudio monitor source ───
function getDefaultMonitor() {
  try {
    const defaultSink = execSync('pactl get-default-sink', { encoding: 'utf-8' }).trim();
    return `${defaultSink}.monitor`;
  } catch {
    return 'default';
  }
}

// ─── Start screen + audio capture via ffmpeg ───
function startCapture(display, x, y, w, h) {
  const monitor = getDefaultMonitor();
  console.log(`[capture] x11grab ${display}+${x},${y} ${w}x${h}`);
  console.log(`[capture] Audio: ${monitor}`);

  const proc = spawn('ffmpeg', [
    '-y',
    '-thread_queue_size', '1024',
    '-f', 'x11grab', '-framerate', '30', '-video_size', `${w}x${h}`,
    '-i', `${display}+${x},${y}`,
    '-thread_queue_size', '1024',
    '-f', 'pulse', '-ac', '2', '-sample_rate', '48000',
    '-i', monitor,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18',
    '-c:a', 'aac', '-b:a', '192k',
    '-pix_fmt', 'yuv420p',
    RAW_VIDEO
  ], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, DISPLAY: display }
  });

  proc.stderr.on('data', d => {
    const s = d.toString();
    if (s.includes('Error') || s.includes('error') || s.includes('frame=')) {
      const trimmed = s.trim().split('\n').pop();
      if (trimmed) process.stdout.write(`[ffmpeg] ${trimmed}\n`);
    }
  });

  return proc;
}

async function stopCapture(proc) {
  return new Promise(resolve => {
    const timer = setTimeout(() => { try { proc.kill('SIGTERM'); } catch {} resolve(); }, 5000);
    proc.on('close', () => { clearTimeout(timer); resolve(); });
    proc.stdin.write('q');
  });
}

// ─── Smooth slider animation ───
async function slide(page, sel, target, ms = 500) {
  const el = await page.$(sel);
  if (!el) return;
  const cur = await el.evaluate(e => parseFloat(e.value));
  const steps = Math.ceil(ms / 40);
  const inc = (target - cur) / steps;
  for (let i = 1; i <= steps; i++) {
    await el.evaluate((e, v) => {
      e.value = v;
      e.dispatchEvent(new Event('input', { bubbles: true }));
    }, cur + inc * i);
    await page.waitForTimeout(40);
  }
}

// ─── Click with error resilience ───
async function clickEl(page, sel, waitMs = 300) {
  try {
    const el = await page.$(sel);
    if (el) {
      // Check if enabled before clicking
      const enabled = await el.evaluate(e => !e.disabled);
      if (enabled) {
        await el.click({ timeout: 3000 });
        await page.waitForTimeout(waitMs);
      } else {
        console.log(`[skip] ${sel} is disabled`);
      }
    }
  } catch (e) {
    console.log(`[skip] ${sel}: ${e.message.split('\n')[0]}`);
  }
}

// Helper: wait
const wait = (page, ms) => page.waitForTimeout(ms);

// ─── DEMO FLOW ───
async function runDemo() {
  const server = startServer();
  await new Promise(r => setTimeout(r, 1000));

  const DISPLAY = ':1';
  const WIN_W = 1280, WIN_H = 760;

  const browser = await chromium.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-features=PreloadMediaEngagementData,MediaEngagementBypassAutoplayPolicies',
      '--window-position=0,0',
      `--window-size=${WIN_W},${WIN_H}`,
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
    ],
    env: { ...process.env, DISPLAY }
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    permissions: ['microphone'],
  });

  const page = await context.newPage();

  console.log('[demo] Loading app...');
  await page.goto('http://127.0.0.1:8765/app.html', { waitUntil: 'networkidle' });
  await wait(page, 2000);

  // Initialize audio context
  console.log('[demo] Init audio...');
  await page.click('body');
  await wait(page, 300);
  await page.evaluate(() => {
    if (window.audioCtx && window.audioCtx.state === 'suspended') window.audioCtx.resume();
  });
  await wait(page, 500);

  // ─── SET BALANCED MIXER LEVELS FIRST ───
  console.log('[demo] Setting balanced mixer levels...');
  await page.evaluate(() => {
    // Set all faders to reasonable levels
    const setFader = (id, val) => {
      const el = document.getElementById(id);
      if (el) { el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); }
    };
    setFader('faderMic', 60);
    setFader('faderSamples', 75);
    setFader('faderSynth', 55);
    setFader('faderRadio', 50);
    setFader('faderMaster', 85);
  });
  await wait(page, 300);

  // ─── START CAPTURE after audio init and levels set ───
  const ffmpegProc = startCapture(DISPLAY, 0, 0, WIN_W, WIN_H);
  await new Promise(r => setTimeout(r, 2000)); // let ffmpeg stabilize

  try {
  // === SECTION 1: RADIO — Search, Tune, Capture ===
  console.log('[demo] === RADIO ===');

  // Search for radio station
  try {
    const radioSearch = await page.$('#radioSearch');
    if (radioSearch) {
      await radioSearch.click();
      await wait(page, 200);
      await radioSearch.fill('jazz');
      await wait(page, 300);

      // Click search/play button
      await clickEl(page, '#radioGo', 500);
      await wait(page, 2000);

      // Force play a fallback station via JS (most reliable)
      console.log('[demo] Tuning to fallback station...');
      await page.evaluate(async () => {
        if (window.radioPlayer) {
          try { await window.radioPlayer.playFallback(); } catch {}
        }
      });
      await wait(page, 4000); // Listen to radio

      // Enable and click sample button via JS (bypass disabled state)
      console.log('[demo] Capturing radio to pads...');
      await page.evaluate(() => {
        const btn = document.getElementById('radioSample');
        if (btn) btn.disabled = false;
      });
      await clickEl(page, '#radioSample', 300);
      await wait(page, 3000); // Wait for capture
    }
  } catch (e) {
    console.log(`[skip] Radio section: ${e.message.split('\n')[0]}`);
  }

  // === SECTION 2: MICROPHONE CAPTURE ===
  console.log('[demo] === MIC CAPTURE ===');
  try {
    await clickEl(page, '#micCapture', 300);
    await wait(page, 2500); // Record 2s of mic
  } catch (e) {
    console.log('[skip] Mic capture:', e.message.split('\n')[0]);
  }

  // === SECTION 3: SEQUENCER — Build a pattern ===
  console.log('[demo] === SEQUENCER ===');

  // Generate random patterns on tracks 1-4
  for (let i = 0; i < 4; i++) {
    await clickEl(page, '#seqRandom', 200);
    if (i < 3) {
      await page.keyboard.press('ArrowDown');
      await wait(page, 100);
    }
  }
  // Back to track 1
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('ArrowUp');
    await wait(page, 80);
  }
  await wait(page, 300);

  // Set source routing for some tracks: track 3 → Synth, track 4 → Radio
  await page.evaluate(() => {
    // Set track 3 source to synth (if sequencer API available)
    if (window.seq) {
      window.seq.tracks[2].source = 'synth';
      window.seq.tracks[3].source = 'radio';
    }
  });

  // === SECTION 4: START PLAYBACK ===
  console.log('[demo] === PLAY ===');
  await page.keyboard.press('Space');
  await wait(page, 4000); // Listen to the initial pattern

  // === SECTION 5: AI GENERATION — Musique concrète vibe ===
  console.log('[demo] === AI GENERATE ===');
  // Click the AI Generate button (G key)
  await clickEl(page, '#aiGenerate', 500);
  await wait(page, 4000); // Listen to AI-generated pattern

  // === SECTION 6: MIXER — Animated adjustments ===
  console.log('[demo] === MIXER ===');
  // Bring samples down, synth up (create tension)
  await slide(page, '#faderSamples', 35, 600);
  await wait(page, 400);
  await slide(page, '#faderSynth', 85, 600);
  await wait(page, 800);

  // Bring radio in
  await slide(page, '#faderRadio', 70, 500);
  await wait(page, 1000);

  // Rebalance
  await slide(page, '#faderSamples', 70, 500);
  await slide(page, '#faderSynth', 60, 500);
  await wait(page, 1000);

  // === SECTION 7: SYNTH — Activate and sculpt ===
  console.log('[demo] === SYNTH ===');
  await clickEl(page, '#synthToggle', 300);

  // Sawtooth on OSC1 (harsh, Stockhausen-like)
  await clickEl(page, '.wave-btns[data-osc="1"] .wave-btn[data-wave="sawtooth"]', 200);
  // Square on OSC2 (add bite)
  await clickEl(page, '.wave-btns[data-osc="2"] .wave-btn[data-wave="square"]', 200);

  // Detune OSC2 for dissonance
  await slide(page, '#osc2Detune', 35, 400);
  await wait(page, 500);

  // Filter sweep — from dark to bright to mid
  await slide(page, '#filterCutoff', 300, 700);
  await wait(page, 600);
  await slide(page, '#filterCutoff', 12000, 900);
  await wait(page, 600);
  await slide(page, '#filterCutoff', 3000, 500);
  await wait(page, 800);

  // Add resonance for texture
  await slide(page, '#filterRes', 12, 300);
  await wait(page, 800);

  // === SECTION 8: TRIGGER PADS — Manual musique concrète ===
  console.log('[demo] === PADS ===');
  // Play pads rhythmically like tape manipulation
  const padPattern = [
    ['1', 150], ['3', 120], ['5', 100], ['2', 200],
    ['1', 80], ['4', 80], ['1', 80], ['6', 150],
    ['3', 120], ['7', 100], ['8', 150], ['1', 200],
    ['2', 100], ['2', 80], ['5', 120], ['1', 300],
  ];
  for (const [key, delay] of padPattern) {
    await page.keyboard.press(key);
    await wait(page, delay);
  }
  await wait(page, 600);

  // === SECTION 9: FX — Punch effects (tape-like) ===
  console.log('[demo] === FX ===');
  // Stutter (like tape loop)
  await page.keyboard.down('q');
  await wait(page, 900);
  await page.keyboard.up('q');
  await wait(page, 300);

  // Reverse (backwards tape)
  await page.keyboard.down('w');
  await wait(page, 900);
  await page.keyboard.up('w');
  await wait(page, 300);

  // Tape stop effect
  await page.keyboard.down('t');
  await wait(page, 1000);
  await page.keyboard.up('t');
  await wait(page, 400);

  // Filter sweep
  await page.keyboard.down('e');
  await wait(page, 800);
  await page.keyboard.up('e');
  await wait(page, 800);

  // === SECTION 10: TEMPO — Accelerando/Ritardando ===
  console.log('[demo] === TEMPO ===');
  await slide(page, '#tempoSlider', 155, 800);
  await wait(page, 1500);
  await slide(page, '#tempoSlider', 90, 1000);
  await wait(page, 1500);
  await slide(page, '#tempoSlider', 120, 600);
  await wait(page, 1000);

  // === SECTION 11: PATTERN SWITCH ===
  console.log('[demo] === PATTERN SWITCH ===');
  // Save current as pattern A, create new on B
  await clickEl(page, '.pattern-btn[data-pattern="1"]', 300);
  // AI generate a fresh pattern on B
  await clickEl(page, '#aiGenerate', 500);
  await wait(page, 3000);

  // Switch between A and B for contrast
  await clickEl(page, '.pattern-btn[data-pattern="0"]', 1500);
  await clickEl(page, '.pattern-btn[data-pattern="1"]', 1500);
  await clickEl(page, '.pattern-btn[data-pattern="0"]', 1000);

  // === SECTION 12: SCENE SAVE + MORPH ===
  console.log('[demo] === SCENES ===');
  await clickEl(page, '#saveScene', 500);
  await wait(page, 500);

  // Radically change mixer for scene B
  await slide(page, '#faderSamples', 20, 300);
  await slide(page, '#faderRadio', 90, 300);
  await slide(page, '#faderSynth', 85, 300);
  await wait(page, 500);

  // Select scene slot B and save
  const sceneSelB = await page.$('#sceneSelect');
  if (sceneSelB) {
    await sceneSelB.selectOption('1');
    await wait(page, 200);
  }
  await clickEl(page, '#saveScene', 500);
  await wait(page, 500);

  // Morph between scenes: load A, then load B
  if (sceneSelB) {
    await sceneSelB.selectOption('0');
    await wait(page, 200);
  }
  await clickEl(page, '#loadScene', 1500);
  if (sceneSelB) {
    await sceneSelB.selectOption('1');
    await wait(page, 200);
  }
  await clickEl(page, '#loadScene', 1500);

  // === SECTION 13: FILL MODE BURST ===
  console.log('[demo] === FILL ===');
  await page.keyboard.down('f');
  await wait(page, 1500);
  await page.keyboard.up('f');
  await wait(page, 1500);

  // === SECTION 14: SECOND AI GEN (different character) ===
  console.log('[demo] === FINAL AI GEN ===');
  await clickEl(page, '#aiGenerate', 500);
  await wait(page, 3000);

  // === SECTION 15: FINAL — Fade and stop ===
  console.log('[demo] === FADE OUT ===');
  await slide(page, '#faderMaster', 30, 1500);
  await wait(page, 800);
  await slide(page, '#faderMaster', 0, 800);
  await wait(page, 500);
  await page.keyboard.press('Escape');
  await wait(page, 1500);

  } catch (demoErr) {
    console.error('[demo] Error during demo:', demoErr.message.split('\n')[0]);
  }

  // ─── Stop everything (always runs) ───
  console.log('[capture] Stopping...');
  await stopCapture(ffmpegProc);
  await new Promise(r => setTimeout(r, 1000));

  try { await page.close(); } catch {}
  try { await context.close(); } catch {}
  try { await browser.close(); } catch {}
  server.kill();

  // ─── Post-process: encode to high-quality MP4 ───
  console.log('[encode] Encoding final MP4...');
  try {
    execSync([
      'ffmpeg', '-y',
      '-i', RAW_VIDEO,
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
      '-c:a', 'aac', '-b:a', '192k',
      '-movflags', '+faststart',
      FINAL_VIDEO
    ].join(' '), { stdio: 'inherit' });
  } catch {
    console.log('[encode] Re-encode failed, raw video is still available');
  }

  // Print results
  try {
    const rawStat = statSync(RAW_VIDEO);
    console.log(`\n✓ Raw recording: ${RAW_VIDEO} (${(rawStat.size / 1024 / 1024).toFixed(1)} MB)`);
  } catch {}
  try {
    const finalStat = statSync(FINAL_VIDEO);
    console.log(`✓ Final video: ${FINAL_VIDEO} (${(finalStat.size / 1024 / 1024).toFixed(1)} MB)`);
  } catch {}
}

runDemo().catch(e => {
  console.error('Demo failed:', e);
  process.exit(1);
});
