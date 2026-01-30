/**
 * Oh My Ondas - Automated Demo Recorder
 *
 * This script uses Puppeteer to automate a demo of Oh My Ondas
 * and record the screen using the browser's screen recording capabilities.
 *
 * Usage:
 *   node demo-recorder.js [--url URL] [--duration SECONDS] [--output FILENAME]
 *
 * Requirements:
 *   - Node.js 18+
 *   - npm install puppeteer
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
    url: process.argv.find(a => a.startsWith('--url='))?.split('=')[1] || 'https://alevm.github.io/oh-my-ondas/',
    duration: parseInt(process.argv.find(a => a.startsWith('--duration='))?.split('=')[1]) || 30,
    output: process.argv.find(a => a.startsWith('--output='))?.split('=')[1] || `demo-${Date.now()}.webm`,
    width: 1920,
    height: 1080
};

// Fast 30-second demo showcasing ALL features
const DEMO_SEQUENCE = [
    // === SECTION 1: BUILD A BEAT (0-6s) ===
    { time: 0, action: 'wait', description: 'Ready' },

    // Click sequencer steps to build kick pattern (track 0)
    { time: 300, action: 'click', selector: '.oct-step[data-track="0"][data-step="0"]', description: 'Kick step 1' },
    { time: 450, action: 'click', selector: '.oct-step[data-track="0"][data-step="4"]', description: 'Kick step 5' },
    { time: 600, action: 'click', selector: '.oct-step[data-track="0"][data-step="8"]', description: 'Kick step 9' },
    { time: 750, action: 'click', selector: '.oct-step[data-track="0"][data-step="12"]', description: 'Kick step 13' },

    // Add snare (track 1)
    { time: 900, action: 'click', selector: '.oct-step[data-track="1"][data-step="4"]', description: 'Snare step 5' },
    { time: 1050, action: 'click', selector: '.oct-step[data-track="1"][data-step="12"]', description: 'Snare step 13' },

    // Add hi-hats (track 2)
    { time: 1200, action: 'click', selector: '.oct-step[data-track="2"][data-step="2"]', description: 'HH step 3' },
    { time: 1300, action: 'click', selector: '.oct-step[data-track="2"][data-step="6"]', description: 'HH step 7' },
    { time: 1400, action: 'click', selector: '.oct-step[data-track="2"][data-step="10"]', description: 'HH step 11' },
    { time: 1500, action: 'click', selector: '.oct-step[data-track="2"][data-step="14"]', description: 'HH step 15' },

    // Start playback
    { time: 1700, action: 'click', selector: '#btnPlay', description: 'PLAY - Beat starts!' },

    // === SECTION 2: SWITCH SOURCE TO SYNTH (6-9s) ===
    { time: 2500, action: 'click', selector: '.src-btn[data-src="synth"]', description: 'Switch to SYNTH' },

    // Add synth notes (track 3)
    { time: 2800, action: 'click', selector: '.oct-step[data-track="3"][data-step="0"]', description: 'Synth note 1' },
    { time: 2950, action: 'click', selector: '.oct-step[data-track="3"][data-step="3"]', description: 'Synth note 4' },
    { time: 3100, action: 'click', selector: '.oct-step[data-track="3"][data-step="7"]', description: 'Synth note 8' },
    { time: 3250, action: 'click', selector: '.oct-step[data-track="3"][data-step="11"]', description: 'Synth note 12' },

    // Tweak synth waveform
    { time: 3500, action: 'click', selector: '.wave-btn[data-wave="sawtooth"]', description: 'Sawtooth wave' },
    { time: 3700, action: 'click', selector: '.filter-btn[data-filter="lowpass"]', description: 'Lowpass filter' },

    // === SECTION 3: PARAMETER LOCKS (9-12s) ===
    // Shift+click to open p-lock editor
    { time: 4000, action: 'shiftclick', selector: '.oct-step[data-track="0"][data-step="0"]', description: 'P-LOCK: Open editor' },
    { time: 4500, action: 'click', selector: '.plock-close, .modal-close', description: 'Close p-lock' },

    // === SECTION 4: RADIO SOURCE (12-15s) ===
    { time: 5000, action: 'click', selector: '.src-btn[data-src="radio"]', description: 'Switch to RADIO' },
    { time: 5300, action: 'click', selector: '.oct-step[data-track="4"][data-step="0"]', description: 'Radio sample' },
    { time: 5500, action: 'click', selector: '.oct-step[data-track="4"][data-step="8"]', description: 'Radio sample 2' },

    // === SECTION 5: EFFECTS & MIXER (15-19s) ===
    { time: 6000, action: 'click', selector: '.fx-btn[data-fx="reverb"], [data-fx="REVERB"]', description: 'Add REVERB' },
    { time: 6300, action: 'click', selector: '.fx-btn[data-fx="delay"], [data-fx="DELAY"]', description: 'Add DELAY' },

    // Punch effects
    { time: 6800, action: 'keydown', key: 'q', description: 'PUNCH: Stutter' },
    { time: 7200, action: 'keyup', key: 'q', description: 'Release stutter' },
    { time: 7400, action: 'keydown', key: 'e', description: 'PUNCH: Filter' },
    { time: 7800, action: 'keyup', key: 'e', description: 'Release filter' },

    // === SECTION 6: SCENES (19-23s) ===
    { time: 8200, action: 'click', selector: '.scene-btn[data-scene="1"]', description: 'SCENE B' },
    { time: 8800, action: 'click', selector: '.scene-btn[data-scene="2"]', description: 'SCENE C' },
    { time: 9400, action: 'click', selector: '.scene-btn[data-scene="0"]', description: 'SCENE A' },

    // === SECTION 7: LIVE PADS (23-26s) ===
    { time: 10000, action: 'key', key: '1', description: 'Pad 1' },
    { time: 10150, action: 'key', key: '2', description: 'Pad 2' },
    { time: 10300, action: 'key', key: '3', description: 'Pad 3' },
    { time: 10450, action: 'key', key: '4', description: 'Pad 4' },
    { time: 10600, action: 'key', key: '5', description: 'Pad 5' },
    { time: 10750, action: 'key', key: '6', description: 'Pad 6' },

    // === SECTION 8: RECORD SESSION (26-28s) ===
    { time: 11000, action: 'click', selector: '#btnRecord', description: 'START RECORDING' },
    { time: 11500, action: 'keydown', key: 't', description: 'Tape effect' },
    { time: 11800, action: 'keyup', key: 't', description: 'Release' },
    { time: 12200, action: 'click', selector: '#btnRecord', description: 'STOP RECORDING' },

    // === SECTION 9: FINALE (28-30s) ===
    { time: 12500, action: 'click', selector: '.scene-btn[data-scene="2"]', description: 'Scene C finale' },
    { time: 13000, action: 'keydown', key: 'q', description: 'Final stutter' },
    { time: 13300, action: 'keyup', key: 'q', description: 'Release' },
    { time: 13500, action: 'click', selector: '#btnStop', description: 'STOP - Demo complete!' },
];

// Main recording function
async function recordDemo() {
    console.log('='.repeat(60));
    console.log('OH MY ONDAS - AUTOMATED DEMO RECORDER');
    console.log('='.repeat(60));
    console.log(`URL: ${CONFIG.url}`);
    console.log(`Duration: ${CONFIG.duration}s`);
    console.log(`Output: ${CONFIG.output}`);
    console.log('='.repeat(60));

    // Launch browser
    console.log('\n[1/5] Launching browser...');
    const browser = await puppeteer.launch({
        headless: false, // Must be false for screen recording
        defaultViewport: null,
        args: [
            `--window-size=${CONFIG.width},${CONFIG.height}`,
            '--autoplay-policy=no-user-gesture-required',
            '--use-fake-ui-for-media-stream',
            '--enable-features=WebRTC',
            '--disable-features=IsolateOrigins,site-per-process'
        ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: CONFIG.width, height: CONFIG.height });

    // Navigate to Oh My Ondas
    console.log('[2/5] Loading Oh My Ondas...');
    await page.goto(CONFIG.url, { waitUntil: 'networkidle2' });

    // Wait for app to initialize
    await page.waitForSelector('#btnPlay', { timeout: 10000 });
    console.log('      App loaded successfully!');

    // Start screen recording using Page.screencast (Chrome DevTools Protocol)
    console.log('[3/5] Starting screen recording...');

    const client = await page.target().createCDPSession();

    // Create output directory if needed
    const outputDir = path.dirname(CONFIG.output);
    if (outputDir && !fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Start recording frames
    const frames = [];
    let frameCount = 0;

    await client.send('Page.startScreencast', {
        format: 'png',
        quality: 100,
        maxWidth: CONFIG.width,
        maxHeight: CONFIG.height,
        everyNthFrame: 2 // Capture every 2nd frame (~30fps)
    });

    client.on('Page.screencastFrame', async ({ data, sessionId }) => {
        frames.push(Buffer.from(data, 'base64'));
        frameCount++;
        await client.send('Page.screencastFrameAck', { sessionId });
    });

    // Execute demo sequence
    console.log('[4/5] Executing demo sequence...');
    console.log('');

    const startTime = Date.now();
    let lastActionTime = 0;

    for (const step of DEMO_SEQUENCE) {
        // Wait until the right time
        const waitTime = step.time - lastActionTime;
        if (waitTime > 0) {
            await new Promise(r => setTimeout(r, waitTime));
        }
        lastActionTime = step.time;

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[${elapsed.padStart(6)}s] ${step.description}`);

        try {
            switch (step.action) {
                case 'click':
                    // Try multiple selectors (comma-separated)
                    const selectors = step.selector.split(',').map(s => s.trim());
                    let clicked = false;
                    for (const sel of selectors) {
                        const element = await page.$(sel);
                        if (element) {
                            await element.click();
                            clicked = true;
                            break;
                        }
                    }
                    if (!clicked) {
                        console.log(`         (element not found)`);
                    }
                    break;

                case 'shiftclick':
                    await page.keyboard.down('Shift');
                    const shiftEl = await page.$(step.selector);
                    if (shiftEl) {
                        await shiftEl.click();
                    }
                    await page.keyboard.up('Shift');
                    break;

                case 'keydown':
                    await page.keyboard.down(step.key);
                    break;

                case 'keyup':
                    await page.keyboard.up(step.key);
                    break;

                case 'key':
                    await page.keyboard.press(step.key);
                    break;

                case 'wait':
                    // Just wait
                    break;
            }
        } catch (error) {
            console.log(`         (${error.message})`);
        }
    }

    // Wait for remaining duration
    const remainingTime = (CONFIG.duration * 1000) - (Date.now() - startTime);
    if (remainingTime > 0) {
        console.log(`\nWaiting ${(remainingTime / 1000).toFixed(1)}s for recording to complete...`);
        await new Promise(r => setTimeout(r, remainingTime));
    }

    // Stop recording
    console.log('\n[5/5] Saving recording...');
    await client.send('Page.stopScreencast');

    // Save frames as individual PNGs (can be converted to video with ffmpeg)
    const framesDir = CONFIG.output.replace('.webm', '-frames');
    if (!fs.existsSync(framesDir)) {
        fs.mkdirSync(framesDir, { recursive: true });
    }

    console.log(`      Saving ${frames.length} frames to ${framesDir}/`);
    for (let i = 0; i < frames.length; i++) {
        const framePath = path.join(framesDir, `frame-${String(i).padStart(5, '0')}.png`);
        fs.writeFileSync(framePath, frames[i]);
    }

    // Generate ffmpeg command for user
    const ffmpegCmd = `ffmpeg -framerate 30 -i ${framesDir}/frame-%05d.png -c:v libx264 -pix_fmt yuv420p ${CONFIG.output.replace('.webm', '.mp4')}`;

    console.log('\n' + '='.repeat(60));
    console.log('RECORDING COMPLETE!');
    console.log('='.repeat(60));
    console.log(`\nFrames saved to: ${framesDir}/`);
    console.log(`Total frames: ${frames.length}`);
    console.log(`\nTo convert to video, run:`);
    console.log(`  ${ffmpegCmd}`);
    console.log('');

    // Take final screenshot
    const screenshotPath = CONFIG.output.replace('.webm', '-final.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`Final screenshot: ${screenshotPath}`);

    // Close browser
    await browser.close();

    console.log('\nDone!');
}

// Alternative: Use browser's MediaRecorder API for audio+video
async function recordWithAudio() {
    console.log('='.repeat(60));
    console.log('OH MY ONDAS - DEMO RECORDER WITH AUDIO');
    console.log('='.repeat(60));

    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: [
            `--window-size=${CONFIG.width},${CONFIG.height}`,
            '--autoplay-policy=no-user-gesture-required',
            '--enable-features=WebRTC',
            '--auto-select-desktop-capture-source=Oh My Ondas'
        ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: CONFIG.width, height: CONFIG.height });

    // Navigate
    await page.goto(CONFIG.url, { waitUntil: 'networkidle2' });
    await page.waitForSelector('#btnPlay', { timeout: 10000 });

    // Inject recording script
    const recordingHandle = await page.evaluateHandle(async (duration) => {
        return new Promise(async (resolve) => {
            try {
                // Get display media (screen + audio)
                const stream = await navigator.mediaDevices.getDisplayMedia({
                    video: { width: 1920, height: 1080, frameRate: 30 },
                    audio: true
                });

                const chunks = [];
                const recorder = new MediaRecorder(stream, {
                    mimeType: 'video/webm;codecs=vp9',
                    videoBitsPerSecond: 8000000
                });

                recorder.ondataavailable = (e) => {
                    if (e.data.size > 0) chunks.push(e.data);
                };

                recorder.onstop = () => {
                    const blob = new Blob(chunks, { type: 'video/webm' });
                    const url = URL.createObjectURL(blob);

                    // Auto-download
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `oh-my-ondas-demo-${Date.now()}.webm`;
                    a.click();

                    resolve({ success: true, size: blob.size });
                };

                recorder.start();

                // Stop after duration
                setTimeout(() => {
                    recorder.stop();
                    stream.getTracks().forEach(t => t.stop());
                }, duration * 1000);

            } catch (error) {
                resolve({ success: false, error: error.message });
            }
        });
    }, CONFIG.duration);

    console.log('Recording started. Please select the browser window when prompted.');
    console.log(`Recording for ${CONFIG.duration} seconds...`);

    // Execute demo sequence
    const startTime = Date.now();
    for (const step of DEMO_SEQUENCE) {
        const waitTime = step.time - (Date.now() - startTime);
        if (waitTime > 0) await new Promise(r => setTimeout(r, waitTime));

        console.log(`[${((Date.now() - startTime) / 1000).toFixed(1)}s] ${step.description}`);

        try {
            switch (step.action) {
                case 'click':
                    await page.click(step.selector).catch(() => {});
                    break;
                case 'keydown':
                    await page.keyboard.down(step.key);
                    break;
                case 'keyup':
                    await page.keyboard.up(step.key);
                    break;
                case 'key':
                    await page.keyboard.press(step.key);
                    break;
            }
        } catch (e) {}
    }

    // Wait for recording to complete
    await new Promise(r => setTimeout(r, CONFIG.duration * 1000 + 2000));

    const result = await recordingHandle.jsonValue();
    console.log('\nRecording result:', result);

    await browser.close();
}

// Run
if (process.argv.includes('--with-audio')) {
    recordWithAudio().catch(console.error);
} else {
    recordDemo().catch(console.error);
}
