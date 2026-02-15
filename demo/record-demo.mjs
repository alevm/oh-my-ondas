/**
 * OhMyOndas Demo Video Recorder
 *
 * Records a ~35-second automated demo of the web prototype showcasing:
 * - Sequencer with pattern generation
 * - AI composition (vibe generation)
 * - Mixer manipulation
 * - FX controls
 * - Synth panel
 * - Scene save/recall
 * - Pad interaction
 *
 * Output: demo/output/ohmyondas-demo.mp4 (video + audio)
 */

import { chromium } from 'playwright';
import { execSync, spawn } from 'child_process';
import { mkdirSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, 'output');
const VIDEO_DIR = path.join(OUTPUT_DIR, 'pw-video');
const AUDIO_FILE = path.join(OUTPUT_DIR, 'audio-capture.wav');
const FINAL_VIDEO = path.join(OUTPUT_DIR, 'ohmyondas-demo.mp4');
const WEB_DIR = path.join(__dirname, '..', 'web');

mkdirSync(OUTPUT_DIR, { recursive: true });
mkdirSync(VIDEO_DIR, { recursive: true });

// ─── PulseAudio virtual sink for audio capture ───
const SINK_NAME = 'ohmyondas_capture';

function setupAudioCapture() {
  try {
    // Remove existing sink if present
    try { execSync(`pactl unload-module module-null-sink 2>/dev/null`); } catch {}

    // Create a null sink to capture audio
    const moduleId = execSync(
      `pactl load-module module-null-sink sink_name=${SINK_NAME} sink_properties=device.description="OhMyOndas_Capture"`,
      { encoding: 'utf-8' }
    ).trim();

    console.log(`[audio] Created capture sink (module ${moduleId})`);
    return moduleId;
  } catch (e) {
    console.warn('[audio] Could not create PulseAudio sink:', e.message);
    return null;
  }
}

function startAudioRecording() {
  // Record from the monitor of our null sink
  const proc = spawn('ffmpeg', [
    '-y',
    '-f', 'pulse',
    '-i', `${SINK_NAME}.monitor`,
    '-ac', '2',
    '-ar', '48000',
    AUDIO_FILE
  ], { stdio: ['pipe', 'pipe', 'pipe'] });

  console.log('[audio] Recording started');
  return proc;
}

function stopAudioRecording(proc) {
  if (proc) {
    proc.stdin.write('q');
    setTimeout(() => proc.kill('SIGTERM'), 1000);
  }
}

function cleanupAudioSink(moduleId) {
  if (moduleId) {
    try { execSync(`pactl unload-module ${moduleId}`); } catch {}
  }
}

// ─── Route Chromium audio to our sink ───
function routeChromiumToSink() {
  // Wait a moment for Chromium to register with PulseAudio, then route it
  setTimeout(() => {
    try {
      const inputs = execSync('pactl list sink-inputs short', { encoding: 'utf-8' });
      for (const line of inputs.split('\n')) {
        if (line.includes('Chrom') || line.includes('chrom') || line.includes('Playwright')) {
          const inputId = line.split('\t')[0];
          execSync(`pactl move-sink-input ${inputId} ${SINK_NAME}`);
          console.log(`[audio] Routed Chromium sink-input ${inputId} to capture sink`);
        }
      }
    } catch (e) {
      console.warn('[audio] Could not route Chromium:', e.message);
    }
  }, 3000);
}

// ─── Web server ───
function startServer() {
  const srv = spawn('python3', ['-m', 'http.server', '8765', '--bind', '127.0.0.1'], {
    cwd: WEB_DIR,
    stdio: 'pipe'
  });
  console.log('[server] Started on http://127.0.0.1:8765');
  return srv;
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

// ─── Helper: visual highlight (briefly outlines an element) ───
async function highlight(page, selector, color = '#ff0') {
  await page.evaluate(([sel, col]) => {
    const el = document.querySelector(sel);
    if (!el) return;
    el.style.transition = 'outline 0.2s, outline-offset 0.2s';
    el.style.outline = `2px solid ${col}`;
    el.style.outlineOffset = '2px';
    setTimeout(() => {
      el.style.outline = 'none';
      el.style.outlineOffset = '0';
    }, 800);
  }, [selector, color]);
}

// ─── MAIN DEMO FLOW ───
async function runDemo() {
  const server = startServer();
  await new Promise(r => setTimeout(r, 1000)); // let server start

  const audioModuleId = setupAudioCapture();
  const audioProc = startAudioRecording();

  const browser = await chromium.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-features=PreloadMediaEngagementData,MediaEngagementBypassAutoplayPolicies',
      '--window-position=0,0',
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: VIDEO_DIR, size: { width: 1280, height: 720 } },
    permissions: ['microphone'],
    // Fake media stream for mic features
    launchOptions: {
      args: ['--use-fake-device-for-media-stream']
    }
  });

  const page = await context.newPage();

  // Route Chromium audio to our capture sink
  routeChromiumToSink();

  console.log('[demo] Loading app...');
  await page.goto('http://127.0.0.1:8765/app.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // ─── Initialize audio context with a click ───
  console.log('[demo] Initializing audio context...');
  await page.click('body');
  await page.waitForTimeout(500);

  // Re-route audio after page is loaded and audio context is active
  routeChromiumToSink();

  // ─── 1. Show the sequencer - Generate a random pattern ───
  console.log('[demo] 1. Generating random pattern on track 1...');
  await highlight(page, '#seqRandom');
  await page.click('#seqRandom');
  await page.waitForTimeout(400);

  // Select track 2 and randomize
  const tracks = await page.$$('.oct-tracks .track-label, .oct-tracks .track-btn');
  if (tracks.length >= 2) {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);
    await page.click('#seqRandom');
    await page.waitForTimeout(300);
    // Track 3
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);
    await page.click('#seqRandom');
    await page.waitForTimeout(300);
  }
  // Back to track 1
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(300);

  // ─── 2. Start the sequencer ───
  console.log('[demo] 2. Starting sequencer playback...');
  await highlight(page, '#btnPlay, #btnPlayE');
  await page.keyboard.press('Space');
  await page.waitForTimeout(3000); // Let it play for 3 seconds

  // Route audio again (Chromium may register with PA after audio starts)
  routeChromiumToSink();

  // ─── 3. AI Composition - generate a vibe ───
  console.log('[demo] 3. AI pattern generation...');
  // Press G to trigger AI generation
  await page.keyboard.press('g');
  await page.waitForTimeout(3000); // Listen to AI-generated pattern

  // ─── 4. Switch patterns ───
  console.log('[demo] 4. Switching patterns...');
  const patternB = await page.$('.pattern-btn[data-pattern="1"]');
  if (patternB) {
    await highlight(page, '.pattern-btn[data-pattern="1"]');
    await patternB.click();
    await page.waitForTimeout(500);
    // Randomize pattern B
    await page.click('#seqRandom');
    await page.waitForTimeout(300);
    await page.keyboard.press('ArrowDown');
    await page.click('#seqRandom');
    await page.waitForTimeout(1500);

    // Switch back to pattern A
    const patternA = await page.$('.pattern-btn[data-pattern="0"]');
    if (patternA) await patternA.click();
    await page.waitForTimeout(1500);
  }

  // ─── 5. Mixer manipulation ───
  console.log('[demo] 5. Mixer fader adjustments...');
  await animateSlider(page, '#faderSamples', 50, 500);
  await page.waitForTimeout(300);
  await animateSlider(page, '#faderSamples', 95, 500);
  await page.waitForTimeout(300);
  await animateSlider(page, '#faderSynth', 40, 400);
  await page.waitForTimeout(300);
  await animateSlider(page, '#faderSynth', 75, 400);
  await page.waitForTimeout(1000);

  // ─── 6. Synth panel - turn on and tweak ───
  console.log('[demo] 6. Synth tweaks...');
  const synthToggle = await page.$('#synthToggle');
  if (synthToggle) {
    await synthToggle.click();
    await page.waitForTimeout(500);
  }
  // Change OSC1 to sawtooth
  const sawBtn = await page.$('.wave-btns[data-osc="1"] .wave-btn[data-wave="sawtooth"]');
  if (sawBtn) {
    await highlight(page, '.wave-btns[data-osc="1"] .wave-btn[data-wave="sawtooth"]');
    await sawBtn.click();
    await page.waitForTimeout(400);
  }
  // Sweep the filter cutoff
  await animateSlider(page, '#filterCutoff', 800, 600);
  await page.waitForTimeout(400);
  await animateSlider(page, '#filterCutoff', 8000, 800);
  await page.waitForTimeout(1000);

  // ─── 7. Trigger some pads manually ───
  console.log('[demo] 7. Triggering pads...');
  for (const key of ['1', '2', '3', '4', '5']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(500);
  // Rapid-fire pattern
  for (const key of ['1', '3', '1', '5', '2', '4']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(1000);

  // ─── 8. FX - Punch effects ───
  console.log('[demo] 8. Punch FX...');
  // Hold Q for stutter
  await page.keyboard.down('q');
  await page.waitForTimeout(800);
  await page.keyboard.up('q');
  await page.waitForTimeout(400);
  // Hold W for reverse
  await page.keyboard.down('w');
  await page.waitForTimeout(800);
  await page.keyboard.up('w');
  await page.waitForTimeout(400);
  // Hold E for filter sweep
  await page.keyboard.down('e');
  await page.waitForTimeout(800);
  await page.keyboard.up('e');
  await page.waitForTimeout(1000);

  // ─── 9. Scene save and morph ───
  console.log('[demo] 9. Scene save/morph...');
  // Save to scene A
  const sceneA = await page.$('.scene-btn[data-scene="0"], .scene-slot[data-scene="0"]');
  if (sceneA) {
    await highlight(page, '.scene-btn[data-scene="0"], .scene-slot[data-scene="0"]');
    await sceneA.click();
    await page.waitForTimeout(500);
  }

  // ─── 10. Change tempo ───
  console.log('[demo] 10. Tempo change...');
  await animateSlider(page, '#tempoSlider, #tempoSliderE', 140, 800);
  await page.waitForTimeout(1500);
  await animateSlider(page, '#tempoSlider, #tempoSliderE', 110, 800);
  await page.waitForTimeout(1500);

  // ─── 11. One more AI generation with a different character ───
  console.log('[demo] 11. Second AI generation...');
  await page.keyboard.press('g');
  await page.waitForTimeout(3000);

  // ─── 12. Fill mode burst ───
  console.log('[demo] 12. Fill mode...');
  await page.keyboard.down('f');
  await page.waitForTimeout(1500);
  await page.keyboard.up('f');
  await page.waitForTimeout(1500);

  // ─── 13. Stop ───
  console.log('[demo] 13. Stopping sequencer...');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1000);

  // ─── Cleanup ───
  console.log('[demo] Saving video...');
  await page.close();
  await context.close();
  await browser.close();

  stopAudioRecording(audioProc);
  await new Promise(r => setTimeout(r, 2000)); // Let audio flush

  server.kill();

  // ─── Merge video + audio ───
  console.log('[merge] Looking for Playwright video...');
  const { readdirSync } = await import('fs');
  const videos = readdirSync(VIDEO_DIR).filter(f => f.endsWith('.webm'));

  if (videos.length === 0) {
    console.error('[merge] No video file found!');
    cleanupAudioSink(audioModuleId);
    process.exit(1);
  }

  const videoFile = path.join(VIDEO_DIR, videos[videos.length - 1]);
  console.log(`[merge] Video: ${videoFile}`);
  console.log(`[merge] Audio: ${AUDIO_FILE}`);

  // Check if audio file has content
  const { statSync } = await import('fs');
  let hasAudio = false;
  try {
    const audioStat = statSync(AUDIO_FILE);
    hasAudio = audioStat.size > 1000;
  } catch {}

  if (hasAudio) {
    console.log('[merge] Merging video + audio...');
    execSync([
      'ffmpeg', '-y',
      '-i', videoFile,
      '-i', AUDIO_FILE,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
      '-c:a', 'aac', '-b:a', '192k',
      '-shortest',
      '-movflags', '+faststart',
      FINAL_VIDEO
    ].join(' '));
  } else {
    console.log('[merge] No audio captured, converting video only...');
    execSync([
      'ffmpeg', '-y',
      '-i', videoFile,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
      '-movflags', '+faststart',
      FINAL_VIDEO
    ].join(' '));
  }

  cleanupAudioSink(audioModuleId);

  console.log(`\n✓ Demo video saved to: ${FINAL_VIDEO}`);

  // Also copy just the Playwright webm as fallback
  const { copyFileSync } = await import('fs');
  const fallback = path.join(OUTPUT_DIR, 'ohmyondas-demo-raw.webm');
  copyFileSync(videoFile, fallback);
  console.log(`✓ Raw recording also at: ${fallback}`);
}

runDemo().catch(e => {
  console.error('Demo failed:', e);
  process.exit(1);
});
