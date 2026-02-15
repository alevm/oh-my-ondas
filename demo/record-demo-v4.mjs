/**
 * OhMyOndas Demo Video Recorder v4
 *
 * Strategy:
 * - Playwright records viewport video (built-in, works on Wayland)
 * - App's built-in recorder captures audio via Web Audio API MediaRecorder
 * - Downloads audio blob from browser
 * - Merges video + audio with ffmpeg
 *
 * Showcases: Radio (tuned+captured), Mic, AI gen, Sequencer, Mixer,
 * Synth, Pads, FX, Scenes, Tempo, Fill — musique concrète vibe.
 */

import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { mkdirSync, writeFileSync, statSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, 'output');
const VIDEO_DIR = path.join(OUTPUT_DIR, 'pw-video');
const AUDIO_FILE = path.join(OUTPUT_DIR, 'app-audio.webm');
const FINAL_VIDEO = path.join(OUTPUT_DIR, 'ohmyondas-demo.mp4');
const WEB_DIR = path.join(__dirname, '..', 'web');

mkdirSync(OUTPUT_DIR, { recursive: true });
mkdirSync(VIDEO_DIR, { recursive: true });

function startServer() {
  const srv = spawn('python3', ['-m', 'http.server', '8765', '--bind', '127.0.0.1'], {
    cwd: WEB_DIR, stdio: 'pipe'
  });
  console.log('[server] http://127.0.0.1:8765');
  return srv;
}

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

async function click(page, sel, waitMs = 300) {
  try {
    const el = await page.$(sel);
    if (el) {
      const enabled = await el.evaluate(e => !e.disabled);
      if (enabled) {
        await el.click({ timeout: 3000 });
        await page.waitForTimeout(waitMs);
      }
    }
  } catch (e) {
    console.log(`  [skip] ${sel}`);
  }
}

const w = (page, ms) => page.waitForTimeout(ms);

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

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: VIDEO_DIR, size: { width: 1280, height: 720 } },
    permissions: ['microphone'],
  });

  const page = await context.newPage();

  console.log('[demo] Loading...');
  await page.goto('http://127.0.0.1:8765/app.html', { waitUntil: 'networkidle' });
  await w(page, 2000);

  // Init audio context
  await page.click('body');
  await w(page, 300);
  await page.evaluate(() => {
    if (window.audioCtx && window.audioCtx.state === 'suspended') window.audioCtx.resume();
  });
  await w(page, 500);

  // ─── Set balanced mixer levels BEFORE audio starts ───
  console.log('[demo] Setting mixer levels...');
  await page.evaluate(() => {
    const set = (id, v) => { const e = document.getElementById(id); if(e) { e.value=v; e.dispatchEvent(new Event('input',{bubbles:true})); }};
    set('faderMic', 55);
    set('faderSamples', 72);
    set('faderSynth', 50);
    set('faderRadio', 45);
    set('faderMaster', 80);
  });

  // ─── Start app's built-in recorder (captures all audio to WebM) ───
  console.log('[demo] Starting audio recording via app recorder...');
  await page.evaluate(() => {
    // Start the built-in session recorder
    const recBtn = document.getElementById('btnRecord') || document.getElementById('btnRecordE');
    if (recBtn) recBtn.click();
  });
  await w(page, 500);

  try {
    // ═══════════════════════════════════════════
    // SECTION 1: RADIO — Search, Tune, Capture
    // ═══════════════════════════════════════════
    console.log('[1/13] RADIO');

    // Play a fallback station directly (most reliable)
    await page.evaluate(async () => {
      if (window.radioPlayer) {
        try { await window.radioPlayer.playFallback(); } catch(e) { console.log('Radio fallback failed:', e); }
      }
    });
    await w(page, 4000); // Let radio play

    // Capture radio to sampler
    await page.evaluate(() => {
      const btn = document.getElementById('radioSample');
      if (btn) btn.disabled = false; // ensure enabled
    });
    await click(page, '#radioSample', 300);
    await w(page, 3000); // capture duration

    // ═══════════════════════════════════════════
    // SECTION 2: MICROPHONE CAPTURE
    // ═══════════════════════════════════════════
    console.log('[2/13] MIC CAPTURE');
    await click(page, '#micCapture', 300);
    await w(page, 2500);

    // ═══════════════════════════════════════════
    // SECTION 3: BUILD SEQUENCER PATTERNS
    // ═══════════════════════════════════════════
    console.log('[3/13] SEQUENCER');

    // Random patterns on 4 tracks
    for (let i = 0; i < 4; i++) {
      await click(page, '#seqRandom', 150);
      if (i < 3) { await page.keyboard.press('ArrowDown'); await w(page, 80); }
    }
    // Back to track 1
    for (let i = 0; i < 3; i++) { await page.keyboard.press('ArrowUp'); await w(page, 60); }

    // Route tracks: track 3→synth, track 4→radio
    await page.evaluate(() => {
      if (window.seq) {
        if (window.seq.tracks[2]) window.seq.tracks[2].source = 'synth';
        if (window.seq.tracks[3]) window.seq.tracks[3].source = 'radio';
      }
    });
    await w(page, 200);

    // ═══════════════════════════════════════════
    // SECTION 4: START PLAYBACK
    // ═══════════════════════════════════════════
    console.log('[4/13] PLAY');
    await page.keyboard.press('Space');
    await w(page, 3500);

    // ═══════════════════════════════════════════
    // SECTION 5: AI GENERATION
    // ═══════════════════════════════════════════
    console.log('[5/13] AI GENERATE');
    await click(page, '#aiGenerate', 300);
    await w(page, 4000);

    // ═══════════════════════════════════════════
    // SECTION 6: MIXER — Animated faders
    // ═══════════════════════════════════════════
    console.log('[6/13] MIXER');
    await slide(page, '#faderSamples', 35, 500);
    await w(page, 300);
    await slide(page, '#faderSynth', 80, 500);
    await w(page, 600);
    await slide(page, '#faderRadio', 65, 400);
    await w(page, 600);
    await slide(page, '#faderSamples', 68, 400);
    await slide(page, '#faderSynth', 55, 300);
    await w(page, 800);

    // ═══════════════════════════════════════════
    // SECTION 7: SYNTH
    // ═══════════════════════════════════════════
    console.log('[7/13] SYNTH');
    await click(page, '#synthToggle', 200);

    // Sawtooth OSC1 + Square OSC2 (harsh, experimental)
    await click(page, '.wave-btns[data-osc="1"] .wave-btn[data-wave="sawtooth"]', 150);
    await click(page, '.wave-btns[data-osc="2"] .wave-btn[data-wave="square"]', 150);

    // Detune for dissonance
    await slide(page, '#osc2Detune', 30, 300);
    await w(page, 400);

    // Filter sweep: dark → bright → mid (musique concrète spectral manipulation)
    await slide(page, '#filterCutoff', 400, 600);
    await w(page, 500);
    await slide(page, '#filterCutoff', 14000, 800);
    await w(page, 500);
    await slide(page, '#filterCutoff', 2500, 400);
    await w(page, 400);

    // Resonance for metallic texture
    await slide(page, '#filterRes', 15, 300);
    await w(page, 600);

    // ═══════════════════════════════════════════
    // SECTION 8: PADS — Musique concrète style
    // ═══════════════════════════════════════════
    console.log('[8/13] PADS');
    const padSeq = [
      ['1',140],['3',110],['5',90],['2',180],
      ['1',70],['4',70],['1',70],['6',140],
      ['3',110],['7',90],['8',140],['1',180],
      ['2',90],['2',70],['5',110],['1',250],
    ];
    for (const [k, d] of padSeq) {
      await page.keyboard.press(k);
      await w(page, d);
    }
    await w(page, 500);

    // ═══════════════════════════════════════════
    // SECTION 9: FX — Punch effects (tape-like)
    // ═══════════════════════════════════════════
    console.log('[9/13] FX');
    // Stutter (tape loop)
    await page.keyboard.down('q'); await w(page, 800); await page.keyboard.up('q'); await w(page, 250);
    // Reverse (backwards tape)
    await page.keyboard.down('w'); await w(page, 800); await page.keyboard.up('w'); await w(page, 250);
    // Tape stop
    await page.keyboard.down('t'); await w(page, 900); await page.keyboard.up('t'); await w(page, 300);
    // Filter sweep
    await page.keyboard.down('e'); await w(page, 700); await page.keyboard.up('e');
    await w(page, 600);

    // ═══════════════════════════════════════════
    // SECTION 10: TEMPO — Accelerando / Ritardando
    // ═══════════════════════════════════════════
    console.log('[10/13] TEMPO');
    await slide(page, '#tempoSlider', 150, 700);
    await w(page, 1200);
    await slide(page, '#tempoSlider', 88, 900);
    await w(page, 1200);
    await slide(page, '#tempoSlider', 120, 500);
    await w(page, 800);

    // ═══════════════════════════════════════════
    // SECTION 11: PATTERN SWITCH
    // ═══════════════════════════════════════════
    console.log('[11/13] PATTERN SWITCH');
    await click(page, '.pattern-btn[data-pattern="1"]', 300);
    await click(page, '#aiGenerate', 300);
    await w(page, 3000);
    await click(page, '.pattern-btn[data-pattern="0"]', 1200);
    await click(page, '.pattern-btn[data-pattern="1"]', 1200);
    await click(page, '.pattern-btn[data-pattern="0"]', 800);

    // ═══════════════════════════════════════════
    // SECTION 12: FILL + FINAL AI GEN
    // ═══════════════════════════════════════════
    console.log('[12/13] FILL + AI');
    await page.keyboard.down('f'); await w(page, 1200); await page.keyboard.up('f');
    await w(page, 1000);
    await click(page, '#aiGenerate', 300);
    await w(page, 3000);

    // ═══════════════════════════════════════════
    // SECTION 13: FADE OUT
    // ═══════════════════════════════════════════
    console.log('[13/13] FADE OUT');
    await slide(page, '#faderMaster', 25, 1200);
    await w(page, 500);
    await slide(page, '#faderMaster', 0, 600);
    await w(page, 400);
    await page.keyboard.press('Escape');
    await w(page, 1000);

  } catch (demoErr) {
    console.error('[demo] Error:', demoErr.message.split('\n')[0]);
  }

  // ─── Stop app recorder and download audio ───
  console.log('[demo] Stopping recorder and downloading audio...');

  // Stop the built-in recorder
  await page.evaluate(() => {
    const recBtn = document.getElementById('btnRecord') || document.getElementById('btnRecordE');
    if (recBtn && recBtn.classList.contains('recording')) recBtn.click();
  });
  await w(page, 1000);

  // Extract recorded audio via download
  const audioData = await page.evaluate(async () => {
    // The app stores recordings - try to get the last one
    // The recorder typically triggers a download. Let's capture it differently:
    // Check if there's a mediaRecorder with recorded chunks
    if (window.sessionRecorder && window.sessionRecorder.chunks && window.sessionRecorder.chunks.length > 0) {
      const blob = new Blob(window.sessionRecorder.chunks, { type: 'audio/webm' });
      const arrayBuf = await blob.arrayBuffer();
      return Array.from(new Uint8Array(arrayBuf));
    }

    // Alternative: check for recorder instance on window
    if (window.recorder && typeof window.recorder.getBlob === 'function') {
      const blob = await window.recorder.getBlob();
      const arrayBuf = await blob.arrayBuffer();
      return Array.from(new Uint8Array(arrayBuf));
    }

    return null;
  });

  if (audioData) {
    writeFileSync(AUDIO_FILE, Buffer.from(audioData));
    console.log(`[audio] Saved ${(audioData.length / 1024).toFixed(0)} KB`);
  } else {
    console.log('[audio] Could not extract audio from app recorder');

    // Alternative: use Web Audio API OfflineAudioContext to render audio
    // Or check downloads directory for the WebM file
  }

  // ─── Close browser ───
  console.log('[demo] Closing browser...');
  await page.close();
  await context.close();
  await browser.close();
  server.kill();

  // ─── Find Playwright video ───
  const { readdirSync } = await import('fs');
  const vids = readdirSync(VIDEO_DIR).filter(f => f.endsWith('.webm'));
  if (vids.length === 0) {
    console.error('[merge] No Playwright video found!');
    process.exit(1);
  }
  const videoFile = path.join(VIDEO_DIR, vids[vids.length - 1]);
  console.log(`[merge] Video: ${videoFile}`);

  // ─── Merge video + audio ───
  const hasAudio = existsSync(AUDIO_FILE) && statSync(AUDIO_FILE).size > 1000;

  const { execSync } = await import('child_process');

  if (hasAudio) {
    console.log(`[merge] Audio: ${AUDIO_FILE}`);
    console.log('[merge] Merging video + audio...');
    execSync([
      'ffmpeg', '-y',
      '-i', videoFile,
      '-i', AUDIO_FILE,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
      '-c:a', 'aac', '-b:a', '192k',
      '-shortest',
      '-movflags', '+faststart',
      FINAL_VIDEO
    ].join(' '), { stdio: 'inherit' });
  } else {
    console.log('[merge] No audio, encoding video only...');
    execSync([
      'ffmpeg', '-y',
      '-i', videoFile,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
      '-an',
      '-movflags', '+faststart',
      FINAL_VIDEO
    ].join(' '), { stdio: 'inherit' });
  }

  // Also keep the raw Playwright video
  const { copyFileSync } = await import('fs');
  const rawCopy = path.join(OUTPUT_DIR, 'ohmyondas-demo-playwright.webm');
  copyFileSync(videoFile, rawCopy);

  // Print results
  try {
    const s = statSync(FINAL_VIDEO);
    console.log(`\n✓ Final video: ${FINAL_VIDEO} (${(s.size/1024/1024).toFixed(1)} MB)`);
  } catch {}
  try {
    const s = statSync(rawCopy);
    console.log(`✓ Playwright raw: ${rawCopy} (${(s.size/1024/1024).toFixed(1)} MB)`);
  } catch {}
  if (hasAudio) {
    const s = statSync(AUDIO_FILE);
    console.log(`✓ Audio: ${AUDIO_FILE} (${(s.size/1024).toFixed(0)} KB)`);
  }
}

runDemo().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
