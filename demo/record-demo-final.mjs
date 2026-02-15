/**
 * Oh My Ondas — Demo Recording (Playwright + real mic)
 *
 * 1. Records room mic via arecord in background
 * 2. Playwright launches browser with viewport video recording
 * 3. Clicks DEMO button, waits for 40s performance
 * 4. Extracts app audio from sessionRecorder
 * 5. Merges: Playwright video + mic audio + app audio → final mp4
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

const TS = new Date().toISOString().replace(/[T:]/g, '-').replace(/\..+/, '');
const VIDEO_DIR = path.join(OUTPUT_DIR, 'pw-demo-video');
const MIC_WAV = path.join(OUTPUT_DIR, 'mic-recording.wav');
const APP_AUDIO = path.join(OUTPUT_DIR, 'app-audio.webm');
const FINAL = path.join(OUTPUT_DIR, `ohmyondas-demo-${TS}.mp4`);

mkdirSync(VIDEO_DIR, { recursive: true });

// ─── Helpers ───

function startServer() {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
    cwd: WEB_DIR, stdio: 'pipe'
  });
  return srv;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function getLatestVideo(dir) {
  const files = readdirSync(dir).filter(f => f.endsWith('.webm'));
  if (files.length === 0) throw new Error(`No video in ${dir}`);
  return path.join(dir, files[files.length - 1]);
}

// ─── MAIN ───

async function main() {
  console.log('═══ Oh My Ondas — Demo Recording ═══\n');

  // Start web server
  const server = startServer();
  await sleep(1500);
  console.log(`[server] ${BASE}`);

  // Start mic recording in background
  console.log('[mic] Starting mic recording...');
  let micProc = null;
  try {
    micProc = spawn('arecord', ['-f', 'S16_LE', '-r', '44100', '-c', '1', '-d', '60', MIC_WAV], {
      stdio: 'pipe'
    });
    micProc.on('error', () => {});
    await sleep(500);
    console.log(`[mic] Recording to ${MIC_WAV}`);
  } catch {
    console.warn('[mic] arecord not available — continuing without raw mic');
  }

  // Launch browser with Playwright video recording
  console.log('[browser] Launching...');
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--autoplay-policy=no-user-gesture-required',
      '--enable-features=WebRTCPipeWireCapturer',
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: VIDEO_DIR, size: { width: 1920, height: 1080 } },
    permissions: ['microphone', 'geolocation'],
    geolocation: { latitude: 41.3818, longitude: 2.1685, accuracy: 10 },
  });

  const page = await context.newPage();
  await page.goto(`${BASE}/app.html`, { waitUntil: 'networkidle' });
  await sleep(3000);
  console.log('[browser] App loaded');

  // Init audio with user gesture
  await page.click('body');
  await sleep(500);

  // Init audio engine
  await page.evaluate(async () => {
    if (window.audioEngine && !window.audioEngine.initialized) await window.audioEngine.init();
    if (window.audioEngine?.ctx?.state === 'suspended') await window.audioEngine.ctx.resume();
  });
  await sleep(500);

  // Start session recorder (captures app's processed audio)
  const recOk = await page.evaluate(() => {
    try { return window.sessionRecorder?.start() || false; } catch { return false; }
  });
  console.log(`[audio] Session recorder: ${recOk}`);

  // Click DEMO button
  console.log('[demo] Clicking DEMO...');
  const demoBtn = await page.$('#btnDemo');
  if (demoBtn) {
    await demoBtn.click();
    console.log('[demo] DEMO started');
  } else {
    console.error('[demo] DEMO button not found!');
    // Try to find it by text
    const fallback = await page.$('button:has-text("DEMO")');
    if (fallback) {
      await fallback.click();
      console.log('[demo] DEMO started (fallback selector)');
    } else {
      console.error('[demo] Cannot find DEMO button at all');
    }
  }

  // Wait for 40s demo + buffer
  console.log('[demo] Waiting 45s for demo to complete...');
  for (let i = 0; i < 45; i++) {
    await sleep(1000);
    if (i % 10 === 0) process.stdout.write(`  ${i}s`);
  }
  console.log('  done');

  // Wait a bit after demo finishes
  await sleep(2000);

  // Extract app audio from session recorder
  console.log('[audio] Extracting app audio...');
  await page.evaluate(() => {
    return new Promise(resolve => {
      const sr = window.sessionRecorder;
      if (!sr?.isRecording?.()) { resolve(); return; }
      const origCb = sr.onRecordingComplete;
      sr.onRecordingComplete = (recording) => {
        if (origCb) origCb(recording);
        resolve();
      };
      sr.stop();
      setTimeout(resolve, 3000);
    });
  });
  await sleep(1000);

  const audioData = await page.evaluate(async () => {
    const sr = window.sessionRecorder;
    // Try finalized recording first
    if (sr?.recordings?.length > 0) {
      const latest = sr.recordings[0];
      if (latest?.blob?.size > 1000) {
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

  if (audioData && audioData.length > 1000) {
    writeFileSync(APP_AUDIO, Buffer.from(audioData));
    console.log(`[audio] App audio: ${(audioData.length / 1024).toFixed(0)} KB`);
  } else {
    console.warn('[audio] No app audio captured');
  }

  // Stop mic recording
  if (micProc) {
    micProc.kill('SIGINT');
    await sleep(500);
    if (existsSync(MIC_WAV)) {
      const sz = statSync(MIC_WAV).size;
      console.log(`[mic] Mic recording: ${(sz / 1024).toFixed(0)} KB`);
    }
  }

  // Close browser (finalizes video)
  await page.close();
  await context.close();
  await browser.close();
  console.log('[browser] Closed');

  // Get Playwright video
  const pwVideo = getLatestVideo(VIDEO_DIR);
  const pwSize = statSync(pwVideo).size;
  console.log(`[video] Playwright video: ${(pwSize / 1024 / 1024).toFixed(1)} MB`);

  // ─── Merge everything ───
  console.log('\n[merge] Building final video...');

  const hasAppAudio = existsSync(APP_AUDIO) && statSync(APP_AUDIO).size > 5000;
  const hasMicAudio = existsSync(MIC_WAV) && statSync(MIC_WAV).size > 10000;

  let ffmpegCmd;

  if (hasAppAudio && hasMicAudio) {
    // Best case: video + app audio + mic audio — EQ the mic, mix with app audio
    console.log('[merge] Video + app audio + mic audio');
    ffmpegCmd = `ffmpeg -y -i "${pwVideo}" -i "${APP_AUDIO}" -i "${MIC_WAV}" ` +
      `-filter_complex "[2:a]highpass=f=100[mic];[1:a][mic]amix=inputs=2:duration=shortest:dropout_transition=2,loudnorm=I=-18:TP=-2:LRA=14,areverse,afade=t=in:d=2,areverse,afade=t=in:d=1[aout]" ` +
      `-map 0:v -map "[aout]" ` +
      `-c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p ` +
      `-c:a aac -b:a 192k -shortest -movflags +faststart "${FINAL}"`;
  } else if (hasMicAudio) {
    // Mic only — gentle EQ: cut rumble, normalize loudness, fade in/out
    console.log('[merge] Video + mic audio (with EQ)');
    ffmpegCmd = `ffmpeg -y -i "${pwVideo}" -i "${MIC_WAV}" ` +
      `-filter_complex "[1:a]highpass=f=100,areverse,afade=t=in:d=2,areverse,afade=t=in:d=1,loudnorm=I=-18:TP=-2:LRA=14[aout]" ` +
      `-map 0:v -map "[aout]" ` +
      `-c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p ` +
      `-c:a aac -b:a 192k -shortest -movflags +faststart "${FINAL}"`;
  } else if (hasAppAudio) {
    // App audio only
    console.log('[merge] Video + app audio');
    ffmpegCmd = `ffmpeg -y -i "${pwVideo}" -i "${APP_AUDIO}" ` +
      `-c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p ` +
      `-c:a aac -b:a 192k -shortest -movflags +faststart "${FINAL}"`;
  } else {
    // Video only (no audio at all)
    console.warn('[merge] Video only — no audio captured');
    ffmpegCmd = `ffmpeg -y -i "${pwVideo}" ` +
      `-c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p ` +
      `-an -movflags +faststart "${FINAL}"`;
  }

  try {
    execSync(ffmpegCmd, { stdio: 'inherit' });
  } catch (err) {
    console.warn('[merge] Primary merge failed, trying fallbacks...');
    let merged = false;

    // Fallback 1: video + mic only with EQ (skip app audio which is often corrupt)
    if (!merged && hasMicAudio) {
      try {
        console.log('[merge] Fallback: video + mic audio (with EQ)');
        execSync(`ffmpeg -y -i "${pwVideo}" -i "${MIC_WAV}" -filter_complex "[1:a]highpass=f=100,areverse,afade=t=in:d=2,areverse,afade=t=in:d=1,loudnorm=I=-18:TP=-2:LRA=14[aout]" -map 0:v -map "[aout]" -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest -movflags +faststart "${FINAL}"`, { stdio: 'inherit' });
        merged = true;
      } catch { console.warn('[merge] Fallback video+mic also failed'); }
    }

    // Fallback 2: video only
    if (!merged) {
      console.warn('[merge] Final fallback: video only');
      execSync(`ffmpeg -y -i "${pwVideo}" -c:v libx264 -preset fast -crf 18 -an -movflags +faststart "${FINAL}"`, { stdio: 'inherit' });
    }
  }

  // ─── Validate ───
  console.log('\n[validate] Checking output...');
  const finalSize = statSync(FINAL).size;
  const probe = JSON.parse(execSync(`ffprobe -v quiet -print_format json -show_format -show_streams "${FINAL}"`).toString());
  const dur = parseFloat(probe.format.duration);
  const bitrate = parseInt(probe.format.bit_rate) / 1000;
  const vStream = probe.streams.find(s => s.codec_type === 'video');
  const aStream = probe.streams.find(s => s.codec_type === 'audio');
  const vBitrate = vStream ? parseInt(vStream.bit_rate || 0) / 1000 : 0;

  console.log(`  Duration: ${dur.toFixed(1)}s`);
  console.log(`  Size: ${(finalSize / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  Bitrate: ${bitrate.toFixed(0)} kbps`);
  console.log(`  Video: ${vStream?.width}x${vStream?.height} ${vBitrate.toFixed(0)}kbps`);
  console.log(`  Audio: ${aStream ? aStream.codec_name + ' ' + aStream.sample_rate + 'Hz' : 'NONE'}`);

  if (vBitrate < 50) {
    console.error('  ❌ VIDEO IS BLANK (bitrate too low)');
  } else {
    console.log('  ✓ Video has content');
  }

  if (aStream) {
    // Check audio levels
    try {
      execSync(`ffmpeg -y -i "${FINAL}" -vn -ar 44100 -ac 1 /tmp/omo-final-check.wav 2>/dev/null`);
      const checkScript = `
import wave, struct, math
w = wave.open('/tmp/omo-final-check.wav', 'rb')
frames = w.readframes(w.getnframes())
w.close()
samples = struct.unpack(f'<{len(frames)//2}h', frames)
peak = max(abs(s) for s in samples) / 32768.0
rms = math.sqrt(sum(s*s for s in samples) / len(samples)) / 32768.0
print(f'  Audio: Peak={peak:.3f} RMS={rms:.4f}')
if rms < 0.001: print('  ❌ AUDIO IS SILENT')
elif rms < 0.005: print('  ⚠ Audio is very quiet')
else: print('  ✓ Audio has content')
`;
      execSync(`python3 -c "${checkScript.replace(/"/g, '\\"')}"`);
      unlinkSync('/tmp/omo-final-check.wav');
    } catch {}
  }

  // Copy to Downloads
  const dlPath = path.join('/home/anv/Downloads', path.basename(FINAL));
  execSync(`cp "${FINAL}" "${dlPath}"`);

  console.log(`\n════════════════════════════════════════`);
  console.log(`✓ FINAL: ${dlPath}`);
  console.log(`  Play: mpv "${dlPath}"`);
  console.log(`════════════════════════════════════════\n`);

  server.kill();
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
