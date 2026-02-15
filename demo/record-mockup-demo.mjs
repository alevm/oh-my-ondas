/**
 * OhMyOndas MOCKUP Demo Video Recorder
 *
 * Records the interactive hardware mockup (petrol green device) in action.
 * All interactions happen via the physical hardware controls (pads, transport,
 * faders, encoders, knobs, mode buttons, joystick) which communicate with
 * the embedded app via postMessage.
 *
 * Strategy: Playwright viewport recording + app's built-in audio recorder.
 */

import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { mkdirSync, writeFileSync, statSync, existsSync, readdirSync, copyFileSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, 'output');
const VIDEO_DIR = path.join(OUTPUT_DIR, 'pw-mockup');
const AUDIO_FILE = path.join(OUTPUT_DIR, 'mockup-audio.webm');
const FINAL_VIDEO = path.join(OUTPUT_DIR, 'ohmyondas-mockup-demo.mp4');
const WEB_DIR = path.join(__dirname, '..', 'web');

mkdirSync(OUTPUT_DIR, { recursive: true });
mkdirSync(VIDEO_DIR, { recursive: true });

function startServer() {
  const srv = spawn('python3', ['-m', 'http.server', '8766', '--bind', '127.0.0.1'], {
    cwd: WEB_DIR, stdio: 'pipe'
  });
  console.log('[server] http://127.0.0.1:8766');
  return srv;
}

const w = (page, ms) => page.waitForTimeout(ms);

// Click a hardware control on the mockup
async function hw(page, sel, waitMs = 250) {
  try {
    const el = await page.$(sel);
    if (el) {
      await el.click({ timeout: 3000 });
      await w(page, waitMs);
    }
  } catch (e) {
    console.log(`  [skip] ${sel}`);
  }
}

// Simulate dragging a fader thumb vertically (mockup uses mouse drag)
async function dragFader(page, channel, targetVal, ms = 500) {
  const thumb = await page.$(`.fader-ch[data-channel="${channel}"] .fader-thumb`);
  const track = await page.$(`.fader-ch[data-channel="${channel}"] .fader-track`);
  if (!thumb || !track) return;

  const thumbBox = await thumb.boundingBox();
  const trackBox = await track.boundingBox();
  if (!thumbBox || !trackBox) return;

  const trackH = trackBox.height - thumbBox.height;
  const targetTop = trackH * (1 - targetVal / 100);
  const startX = thumbBox.x + thumbBox.width / 2;
  const startY = thumbBox.y + thumbBox.height / 2;
  const endY = trackBox.y + targetTop + thumbBox.height / 2;

  const steps = Math.ceil(ms / 30);
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    const y = startY + (endY - startY) * (i / steps);
    await page.mouse.move(startX, y);
    await w(page, 30);
  }
  await page.mouse.up();
  await w(page, 100);
}

// Simulate dragging an encoder/knob vertically (up = increase)
async function dragKnob(page, sel, delta, ms = 400) {
  const el = await page.$(sel);
  if (!el) return;
  const box = await el.boundingBox();
  if (!box) return;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const steps = Math.ceil(ms / 30);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(cx, cy - delta * (i / steps));
    await w(page, 30);
  }
  await page.mouse.up();
  await w(page, 100);
}

// Simulate dragging crossfader horizontally
async function dragCrossfader(page, targetPct, ms = 500) {
  const thumb = await page.$('#xfadeThumb');
  const track = await page.$('#xfadeThumb');
  if (!thumb) return;
  const box = await thumb.boundingBox();
  const parent = await thumb.evaluate(e => {
    const r = e.parentElement.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  if (!box || !parent) return;
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  const endX = parent.x + parent.width * (targetPct / 100);
  const steps = Math.ceil(ms / 30);
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(startX + (endX - startX) * (i / steps), startY);
    await w(page, 30);
  }
  await page.mouse.up();
  await w(page, 100);
}

// Trigger a pad with mousedown/mouseup (visual flash + sound)
async function trigPad(page, padIndex, holdMs = 100) {
  const pad = await page.$(`.pad[data-pad="${padIndex}"]`);
  if (!pad) return;
  const box = await pad.boundingBox();
  if (!box) return;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await w(page, holdMs);
  await page.mouse.up();
  await w(page, 50);
}

// ─── MAIN DEMO ───
async function runDemo() {
  const server = startServer();
  await new Promise(r => setTimeout(r, 1200));

  const browser = await chromium.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--autoplay-policy=no-user-gesture-required',
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
    ]
  });

  // Larger viewport to show the full mockup device
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: VIDEO_DIR, size: { width: 1280, height: 800 } },
    permissions: ['microphone'],
  });

  const page = await context.newPage();

  console.log('[demo] Loading mockup...');
  await page.goto('http://127.0.0.1:8766/index.html', { waitUntil: 'networkidle' });
  await w(page, 3000); // Let iframe load fully

  // Get the actual iframe Frame object for direct JS execution
  const iframeEl = await page.$('#appDisplay');
  const appFrame = await iframeEl.contentFrame();

  // Init audio in iframe via user gesture (click inside iframe)
  console.log('[demo] Initializing audio...');
  await page.click('.enclosure');
  await w(page, 500);
  try {
    await appFrame.click('body', { timeout: 2000 });
  } catch {}
  await w(page, 1000);

  // Ensure audio engine is initialized inside the iframe
  await appFrame.evaluate(async () => {
    if (window.audioEngine && !window.audioEngine.initialized) {
      await window.audioEngine.init();
    }
    // Resume AudioContext if suspended
    if (window.audioEngine?.ctx?.state === 'suspended') {
      await window.audioEngine.ctx.resume();
    }
  });
  await w(page, 500);

  // Start the app's built-in recorder via iframe
  console.log('[demo] Starting audio recorder...');
  const recStarted = await appFrame.evaluate(() => {
    if (window.sessionRecorder) {
      const result = window.sessionRecorder.start();
      return result;
    }
    return false;
  });
  console.log(`[demo] Recorder started: ${recStarted}`);
  await w(page, 500);

  // Balance mixer levels inside the iframe
  await appFrame.evaluate(() => {
    if (window.audioEngine) {
      window.audioEngine.setChannelLevel('mic', 0.55);
      window.audioEngine.setChannelLevel('samples', 0.72);
      window.audioEngine.setChannelLevel('synth', 0.50);
      window.audioEngine.setChannelLevel('radio', 0.45);
      window.audioEngine.setMasterLevel(0.80);
    }
  });
  await w(page, 300);

  // Start radio + generate patterns inside the iframe
  await appFrame.evaluate(async () => {
    try { await window.radioPlayer?.playFallback(); } catch {}
    try {
      const rndBtn = document.getElementById('seqRandom');
      if (rndBtn) rndBtn.click();
    } catch {}
  });

  try {
    // ═══════════════════════════════════════════
    // SECTION 1: SHOW THE DEVICE — Mode buttons
    // ═══════════════════════════════════════════
    console.log('[1/12] MODE BUTTONS');
    await hw(page, '.mode-btn[data-mode="soundscape"]', 800);
    await hw(page, '.mode-btn[data-mode="interact"]', 800);
    await hw(page, '.mode-btn[data-mode="journey"]', 800);
    await hw(page, '.mode-btn[data-mode="picture"]', 600);

    // ═══════════════════════════════════════════
    // SECTION 2: SCREEN NAV — Page through panels
    // ═══════════════════════════════════════════
    console.log('[2/12] SCREEN NAV');
    await hw(page, '.nav-btn[data-action="page"]', 600);
    await hw(page, '.nav-btn[data-action="page"]', 600);
    await hw(page, '.nav-btn[data-action="page"]', 600);
    await hw(page, '.nav-btn[data-action="back"]', 500);

    // ═══════════════════════════════════════════
    // SECTION 3: GENERATE PATTERNS (via iframe)
    // ═══════════════════════════════════════════
    console.log('[3/12] GENERATE PATTERNS');
    await page.evaluate(() => {
      const f = document.getElementById('appDisplay');
      if (f && f.contentWindow) {
        // Click seqRandom multiple times for different tracks
        const doc = f.contentWindow.document;
        const rndBtn = doc.getElementById('seqRandom');
        if (rndBtn) {
          rndBtn.click();
          setTimeout(() => {
            // Switch track and randomize
            f.contentWindow.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
            setTimeout(() => rndBtn.click(), 100);
            setTimeout(() => {
              f.contentWindow.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
              setTimeout(() => rndBtn.click(), 100);
            }, 200);
          }, 200);
        }
      }
    });
    await w(page, 800);

    // ═══════════════════════════════════════════
    // SECTION 4: TRANSPORT — Press PLAY
    // ═══════════════════════════════════════════
    console.log('[4/12] PLAY');
    await hw(page, '.transport-btn.play', 400);
    await w(page, 3000); // Listen to the pattern

    // ═══════════════════════════════════════════
    // SECTION 5: AI GENERATE (via iframe)
    // ═══════════════════════════════════════════
    console.log('[5/12] AI GENERATE');
    await page.evaluate(() => {
      const f = document.getElementById('appDisplay');
      if (f?.contentWindow?.document) {
        const btn = f.contentWindow.document.getElementById('aiGenerate');
        if (btn) btn.click();
      }
    });
    await w(page, 4000);

    // ═══════════════════════════════════════════
    // SECTION 6: PAD PERFORMANCE
    // ═══════════════════════════════════════════
    console.log('[6/12] PADS');
    const padPattern = [
      [0,120],[2,100],[4,80],[1,160],
      [0,60],[3,60],[0,60],[5,120],
      [2,100],[6,80],[7,120],[0,160],
      [1,80],[1,60],[4,100],[0,200],
    ];
    for (const [pad, hold] of padPattern) {
      await trigPad(page, pad, hold);
    }
    await w(page, 500);

    // ═══════════════════════════════════════════
    // SECTION 7: MIXER FADERS
    // ═══════════════════════════════════════════
    console.log('[7/12] FADERS');
    await dragFader(page, 'sample', 30, 400);
    await w(page, 200);
    await dragFader(page, 'synth', 85, 400);
    await w(page, 300);
    await dragFader(page, 'radio', 65, 300);
    await w(page, 300);
    await dragFader(page, 'sample', 70, 300);
    await w(page, 600);

    // ═══════════════════════════════════════════
    // SECTION 8: SYNTH KNOBS — Filter sweep
    // ═══════════════════════════════════════════
    console.log('[8/12] SYNTH KNOBS');
    // Drag cutoff knob up (increase)
    await dragKnob(page, '.knob-unit[data-param="cutoff"] .encoder-knob', 60, 500);
    await w(page, 400);
    // Drag cutoff back down
    await dragKnob(page, '.knob-unit[data-param="cutoff"] .encoder-knob', -80, 600);
    await w(page, 400);
    // Resonance up
    await dragKnob(page, '.knob-unit[data-param="resonance"] .encoder-knob', 40, 400);
    await w(page, 600);

    // ═══════════════════════════════════════════
    // SECTION 9: FX KNOBS
    // ═══════════════════════════════════════════
    console.log('[9/12] FX KNOBS');
    // Delay up
    await dragKnob(page, '.knob-unit[data-param="delay"] .encoder-knob', 50, 400);
    await w(page, 500);
    // Glitch up
    await dragKnob(page, '.knob-unit[data-param="glitch"] .encoder-knob', 40, 400);
    await w(page, 500);
    // Grain up
    await dragKnob(page, '.knob-unit[data-param="grain"] .encoder-knob', 45, 400);
    await w(page, 800);

    // ═══════════════════════════════════════════
    // SECTION 10: FUNCTION BUTTONS
    // ═══════════════════════════════════════════
    console.log('[10/12] FUNC BUTTONS');
    // Hold FILL
    const fillBtn = await page.$('.func-btn.fill');
    if (fillBtn) {
      const box = await fillBtn.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await w(page, 1200);
        await page.mouse.up();
      }
    }
    await w(page, 600);

    // Scene button
    await hw(page, '.func-btn.scene', 500);
    await w(page, 400);

    // Bank switch
    await hw(page, '.func-btn.bank', 500);
    await w(page, 600);

    // ═══════════════════════════════════════════
    // SECTION 11: CROSSFADER + ENCODERS
    // ═══════════════════════════════════════════
    console.log('[11/12] CROSSFADER + ENCODERS');
    await dragCrossfader(page, 20, 500);
    await w(page, 400);
    await dragCrossfader(page, 80, 600);
    await w(page, 400);
    await dragCrossfader(page, 50, 400);
    await w(page, 500);

    // Volume encoder
    await dragKnob(page, '.encoder[data-param="volume"] .encoder-knob', 30, 400);
    await w(page, 300);
    // Filter encoder
    await dragKnob(page, '.encoder[data-param="filter"] .encoder-knob', -40, 400);
    await w(page, 300);
    await dragKnob(page, '.encoder[data-param="filter"] .encoder-knob', 50, 500);
    await w(page, 500);
    // FX encoder
    await dragKnob(page, '.encoder[data-param="fx"] .encoder-knob', 35, 400);
    await w(page, 800);

    // ═══════════════════════════════════════════
    // SECTION 12: JOYSTICK NAV + STOP
    // ═══════════════════════════════════════════
    console.log('[12/12] JOYSTICK + STOP');
    await hw(page, '.joystick-up', 300);
    await hw(page, '.joystick-right', 300);
    await hw(page, '.joystick-center', 400);
    await hw(page, '.joystick-down', 300);
    await hw(page, '.joystick-left', 300);
    await w(page, 600);

    // Navigate with prev/next
    await hw(page, '.joy-nav-btn[data-action="next"]', 400);
    await hw(page, '.joy-nav-btn[data-action="next"]', 400);
    await hw(page, '.joy-nav-btn[data-action="prev"]', 400);
    await w(page, 600);

    // Final pad burst
    for (const p of [0, 2, 4, 6, 1, 3, 5, 7]) {
      await trigPad(page, p, 60);
    }
    await w(page, 600);

    // STOP
    await hw(page, '.transport-btn.stop', 500);
    await w(page, 1500);

  } catch (demoErr) {
    console.error('[demo] Error:', demoErr.message.split('\n')[0]);
  }

  // ─── Stop recorder and download audio ───
  console.log('[demo] Stopping recorder and extracting audio...');
  await appFrame.evaluate(() => {
    if (window.sessionRecorder?.isRecording()) {
      window.sessionRecorder.stop();
    }
  });
  await w(page, 1500); // Wait for onstop/finalize

  // Extract audio from iframe's recorder (inside iframe context)
  const audioData = await appFrame.evaluate(async () => {
    const sr = window.sessionRecorder;
    // First try chunks (if still available before finalization clears them)
    if (sr?.chunks?.length > 0) {
      const blob = new Blob(sr.chunks, { type: 'audio/webm' });
      const buf = await blob.arrayBuffer();
      return Array.from(new Uint8Array(buf));
    }
    // Try the most recent recording blob
    if (sr?.recordings?.length > 0) {
      const latest = sr.recordings[0]; // most recent is first (unshift)
      if (latest.blob) {
        const buf = await latest.blob.arrayBuffer();
        return Array.from(new Uint8Array(buf));
      }
    }
    return null;
  });

  if (audioData) {
    writeFileSync(AUDIO_FILE, Buffer.from(audioData));
    console.log(`[audio] Saved ${(audioData.length / 1024).toFixed(0)} KB`);
  } else {
    console.log('[audio] Could not extract audio');
  }

  // ─── Close browser ───
  console.log('[demo] Closing...');
  await page.close();
  await context.close();
  await browser.close();
  server.kill();

  // ─── Find video and merge ───
  const vids = readdirSync(VIDEO_DIR).filter(f => f.endsWith('.webm'));
  if (vids.length === 0) { console.error('No video!'); process.exit(1); }
  const videoFile = path.join(VIDEO_DIR, vids[vids.length - 1]);
  const hasAudio = existsSync(AUDIO_FILE) && statSync(AUDIO_FILE).size > 1000;

  console.log(`[merge] Video: ${videoFile}`);
  if (hasAudio) {
    console.log(`[merge] Audio: ${AUDIO_FILE}`);
    execSync(`ffmpeg -y -i "${videoFile}" -i "${AUDIO_FILE}" -c:v libx264 -preset fast -crf 20 -c:a aac -b:a 192k -shortest -movflags +faststart "${FINAL_VIDEO}"`, { stdio: 'inherit' });
  } else {
    execSync(`ffmpeg -y -i "${videoFile}" -c:v libx264 -preset fast -crf 20 -an -movflags +faststart "${FINAL_VIDEO}"`, { stdio: 'inherit' });
  }

  // Copy raw
  const rawCopy = path.join(OUTPUT_DIR, 'ohmyondas-mockup-raw.webm');
  copyFileSync(videoFile, rawCopy);

  // Results
  try { const s = statSync(FINAL_VIDEO); console.log(`\n✓ Final: ${FINAL_VIDEO} (${(s.size/1024/1024).toFixed(1)} MB)`); } catch {}
  try { const s = statSync(rawCopy); console.log(`✓ Raw: ${rawCopy} (${(s.size/1024/1024).toFixed(1)} MB)`); } catch {}
  if (hasAudio) { const s = statSync(AUDIO_FILE); console.log(`✓ Audio: ${AUDIO_FILE} (${(s.size/1024).toFixed(0)} KB)`); }
}

runDemo().catch(e => { console.error('Fatal:', e); process.exit(1); });
