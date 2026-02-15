/**
 * OhMyOndas Demo Video Recorder v2
 *
 * Uses x11grab + PulseAudio default monitor for screen+audio capture
 * while Playwright automates Chrome in headed mode.
 *
 * Output: demo/output/ohmyondas-demo.mp4
 */

import { chromium } from 'playwright';
import { execSync, spawn } from 'child_process';
import { mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, 'output');
const FINAL_VIDEO = path.join(OUTPUT_DIR, 'ohmyondas-demo.mp4');
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

// ─── Start ffmpeg x11grab + pulse capture ───
function startScreenCapture(x, y, w, h) {
  const monitor = getDefaultMonitor();
  console.log(`[capture] Screen region: ${w}x${h} at +${x},+${y}`);
  console.log(`[capture] Audio source: ${monitor}`);

  const proc = spawn('ffmpeg', [
    '-y',
    '-thread_queue_size', '512',
    // Video: screen capture
    '-f', 'x11grab',
    '-framerate', '30',
    '-video_size', `${w}x${h}`,
    '-i', `:0+${x},${y}`,
    // Audio: PulseAudio monitor
    '-f', 'pulse',
    '-ac', '2',
    '-i', monitor,
    // Output settings
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
    '-c:a', 'aac', '-b:a', '192k',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-shortest',
    FINAL_VIDEO
  ], { stdio: ['pipe', 'pipe', 'pipe'] });

  proc.stderr.on('data', d => {
    const s = d.toString();
    if (s.includes('frame=') || s.includes('Error') || s.includes('error')) {
      process.stdout.write(`[ffmpeg] ${s}`);
    }
  });

  console.log('[capture] Recording started');
  return proc;
}

function stopScreenCapture(proc) {
  return new Promise(resolve => {
    proc.on('close', resolve);
    proc.stdin.write('q');
    setTimeout(() => {
      try { proc.kill('SIGTERM'); } catch {}
      resolve();
    }, 5000);
  });
}

// ─── Smooth slider animation ───
async function animateSlider(page, selector, targetValue, durationMs = 600) {
  const el = await page.$(selector);
  if (!el) return;
  const currentValue = await el.evaluate(e => parseFloat(e.value));
  const steps = Math.ceil(durationMs / 50);
  const increment = (targetValue - currentValue) / steps;
  for (let i = 1; i <= steps; i++) {
    const val = currentValue + increment * i;
    await el.evaluate((e, v) => {
      e.value = v;
      e.dispatchEvent(new Event('input', { bubbles: true }));
    }, val);
    await page.waitForTimeout(50);
  }
}

// ─── MAIN DEMO FLOW ───
async function runDemo() {
  const server = startServer();
  await new Promise(r => setTimeout(r, 1000));

  // Browser window position and size
  const WIN_X = 0, WIN_Y = 0, WIN_W = 1280, WIN_H = 760;

  const browser = await chromium.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-features=PreloadMediaEngagementData,MediaEngagementBypassAutoplayPolicies',
      `--window-position=${WIN_X},${WIN_Y}`,
      `--window-size=${WIN_W},${WIN_H}`,
      '--use-fake-device-for-media-stream',
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    permissions: ['microphone'],
  });

  const page = await context.newPage();

  console.log('[demo] Loading app...');
  await page.goto('http://127.0.0.1:8765/app.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // ─── Initialize audio context ───
  console.log('[demo] Initializing audio context...');
  await page.click('body');
  await page.waitForTimeout(500);

  // Ensure audio context is running
  await page.evaluate(() => {
    if (window.audioCtx && window.audioCtx.state === 'suspended') {
      window.audioCtx.resume();
    }
  });
  await page.waitForTimeout(500);

  // Start screen + audio capture NOW (after audio context is initialized)
  const ffmpegProc = startScreenCapture(WIN_X, WIN_Y, WIN_W, WIN_H);
  await new Promise(r => setTimeout(r, 1500)); // let ffmpeg stabilize

  // ─── 1. Generate random patterns on 3 tracks ───
  console.log('[demo] 1. Generating patterns...');
  await page.click('#seqRandom');
  await page.waitForTimeout(300);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(150);
  await page.click('#seqRandom');
  await page.waitForTimeout(300);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(150);
  await page.click('#seqRandom');
  await page.waitForTimeout(200);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(200);

  // ─── 2. Start sequencer ───
  console.log('[demo] 2. Starting sequencer...');
  await page.keyboard.press('Space');
  await page.waitForTimeout(3000);

  // ─── 3. AI pattern generation ───
  console.log('[demo] 3. AI generation...');
  await page.keyboard.press('g');
  await page.waitForTimeout(3500);

  // ─── 4. Switch to pattern B, randomize, switch back ───
  console.log('[demo] 4. Pattern switching...');
  const patB = await page.$('.pattern-btn[data-pattern="1"]');
  if (patB) {
    await patB.click();
    await page.waitForTimeout(400);
    await page.click('#seqRandom');
    await page.waitForTimeout(200);
    await page.keyboard.press('ArrowDown');
    await page.click('#seqRandom');
    await page.waitForTimeout(1500);
    const patA = await page.$('.pattern-btn[data-pattern="0"]');
    if (patA) await patA.click();
    await page.waitForTimeout(1500);
  }

  // ─── 5. Mixer faders ───
  console.log('[demo] 5. Mixer faders...');
  await animateSlider(page, '#faderSamples', 40, 400);
  await page.waitForTimeout(300);
  await animateSlider(page, '#faderSamples', 95, 400);
  await page.waitForTimeout(500);
  await animateSlider(page, '#faderSynth', 30, 300);
  await page.waitForTimeout(300);
  await animateSlider(page, '#faderSynth', 80, 300);
  await page.waitForTimeout(800);

  // ─── 6. Synth on + waveform change + filter sweep ───
  console.log('[demo] 6. Synth...');
  const synthOn = await page.$('#synthToggle');
  if (synthOn) await synthOn.click();
  await page.waitForTimeout(300);
  const sawBtn = await page.$('.wave-btns[data-osc="1"] .wave-btn[data-wave="sawtooth"]');
  if (sawBtn) await sawBtn.click();
  await page.waitForTimeout(300);
  await animateSlider(page, '#filterCutoff', 600, 500);
  await page.waitForTimeout(300);
  await animateSlider(page, '#filterCutoff', 10000, 700);
  await page.waitForTimeout(800);

  // ─── 7. Trigger pads ───
  console.log('[demo] 7. Pads...');
  for (const key of ['1', '2', '3', '4', '5']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(180);
  }
  await page.waitForTimeout(300);
  for (const key of ['1', '3', '1', '5', '2', '4', '1']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(800);

  // ─── 8. Punch FX ───
  console.log('[demo] 8. Punch FX...');
  await page.keyboard.down('q');
  await page.waitForTimeout(700);
  await page.keyboard.up('q');
  await page.waitForTimeout(300);
  await page.keyboard.down('w');
  await page.waitForTimeout(700);
  await page.keyboard.up('w');
  await page.waitForTimeout(300);
  await page.keyboard.down('e');
  await page.waitForTimeout(700);
  await page.keyboard.up('e');
  await page.waitForTimeout(800);

  // ─── 9. Tempo change ───
  console.log('[demo] 9. Tempo change...');
  await animateSlider(page, '#tempoSlider', 145, 700);
  await page.waitForTimeout(1000);
  await animateSlider(page, '#tempoSlider', 105, 700);
  await page.waitForTimeout(1000);

  // ─── 10. Second AI gen ───
  console.log('[demo] 10. Second AI generation...');
  await page.keyboard.press('g');
  await page.waitForTimeout(3000);

  // ─── 11. Fill mode ───
  console.log('[demo] 11. Fill mode...');
  await page.keyboard.down('f');
  await page.waitForTimeout(1200);
  await page.keyboard.up('f');
  await page.waitForTimeout(1500);

  // ─── 12. Stop ───
  console.log('[demo] 12. Stop.');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1500);

  // ─── Stop capture ───
  console.log('[capture] Stopping recording...');
  await stopScreenCapture(ffmpegProc);

  await page.close();
  await context.close();
  await browser.close();
  server.kill();

  console.log(`\n✓ Demo video saved to: ${FINAL_VIDEO}`);
}

runDemo().catch(e => {
  console.error('Demo failed:', e);
  process.exit(1);
});
