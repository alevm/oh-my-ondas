/**
 * Test Song Generator
 *
 * Generates a 30-second test song with:
 * - Mic input affecting changes over time
 * - Radio sampled, chopped into melodic line
 * - Synth as lead instrument
 * - Pads for bass line with heavy FX
 */

const puppeteer = require('puppeteer');
const path = require('path');

const TEST_URL = process.env.TEST_URL || 'http://localhost:8080/app.html';
const SONG_DURATION = 30000; // 30 seconds

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function generateTestSong() {
    console.log('='.repeat(60));
    console.log('TEST SONG GENERATOR');
    console.log('='.repeat(60));
    console.log(`URL: ${TEST_URL}`);
    console.log(`Duration: ${SONG_DURATION / 1000} seconds\n`);

    const browser = await puppeteer.launch({
        headless: false, // Show browser for visual feedback
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            '--autoplay-policy=no-user-gesture-required'
        ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    // Capture console for debugging
    page.on('console', msg => {
        if (msg.type() === 'error') {
            console.log(`[Browser Error] ${msg.text()}`);
        }
    });

    try {
        console.log('[1/8] Loading application...');
        await page.goto(TEST_URL, { waitUntil: 'networkidle2', timeout: 30000 });
        await sleep(2000);

        // Click to initialize audio context (required by browsers)
        console.log('[2/8] Initializing audio context...');
        await page.click('body');
        await sleep(500);

        // Resume audio context and initialize
        const initResult = await page.evaluate(async () => {
            // Resume audio context
            if (window.audioEngine?.ctx?.state === 'suspended') {
                await window.audioEngine.ctx.resume();
            }

            // Ensure all sources are active
            if (typeof window.ensureAllSources === 'function') {
                await window.ensureAllSources();
            }

            return {
                contextState: window.audioEngine?.ctx?.state,
                sampleRate: window.audioEngine?.ctx?.sampleRate
            };
        });
        console.log(`    AudioContext: ${initResult.contextState} @ ${initResult.sampleRate}Hz`);

        // Configure sequencer with bass pattern
        console.log('[3/8] Setting up bass pattern on pads...');
        await page.evaluate(() => {
            const seq = window.sequencer;
            if (!seq) return;

            // Set BPM
            seq.setTempo(90);

            // Track 0: Bass pattern (pads) - every 4th step with variations
            const bassPattern = [1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 1, 0];
            const bassPitches = [-12, 0, 0, 0, -12, 0, 0, -5, -7, 0, 0, 0, -12, 0, -5, 0];

            for (let step = 0; step < 16; step++) {
                if (bassPattern[step]) {
                    seq.setStep(0, step, true);
                    // P-Lock: pitch shift for bass
                    seq.setPLock(0, step, 'pitch', bassPitches[step]);
                    seq.setPLock(0, step, 'velocity', 0.9);
                }
            }

            // Track 1: Synth melody pattern
            const melodyPattern = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
            const melodyPitches = [0, 0, 7, 0, 0, 12, 0, 0, 5, 0, 0, 7, 0, 0, 3, 0];

            for (let step = 0; step < 16; step++) {
                if (melodyPattern[step]) {
                    seq.setStep(1, step, true);
                    seq.setPLock(1, step, 'pitch', melodyPitches[step]);
                }
            }

            // Track 2: Radio chops - melodic slices
            const radioPattern = [0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 1];
            const radioSlices = [0, 2, 0, 5, 0, 0, 8, 0, 0, 3, 0, 7, 0, 0, 11, 4];
            const radioPitches = [0, 5, 0, 7, 0, 0, 12, 0, 0, 3, 0, 5, 0, 0, 7, 0];

            for (let step = 0; step < 16; step++) {
                if (radioPattern[step]) {
                    seq.setStep(2, step, true);
                    seq.setPLock(2, step, 'slice', radioSlices[step]);
                    seq.setPLock(2, step, 'pitch', radioPitches[step]);
                }
            }
        });

        // Configure synth as lead
        console.log('[4/8] Configuring synth as lead...');
        await page.evaluate(() => {
            const synth = window.synth;
            if (!synth) return;

            // Lead synth settings
            if (synth.setWaveform) synth.setWaveform('sawtooth');
            if (synth.setFilterCutoff) synth.setFilterCutoff(2000);
            if (synth.setFilterResonance) synth.setFilterResonance(0.5);
            if (synth.setLFORate) synth.setLFORate(4);
            if (synth.setLFODepth) synth.setLFODepth(0.3);
            if (synth.setAttack) synth.setAttack(0.05);
            if (synth.setDecay) synth.setDecay(0.2);
            if (synth.setSustain) synth.setSustain(0.6);
            if (synth.setRelease) synth.setRelease(0.3);
            if (synth.setGlide) synth.setGlide(0.1);

            // Enable unison for thickness
            if (synth.setUnisonVoices) synth.setUnisonVoices(4);
            if (synth.setUnisonSpread) synth.setUnisonSpread(15);
        });

        // Configure heavy FX on samples channel
        console.log('[5/8] Configuring heavy FX for bass...');
        await page.evaluate(() => {
            const mangle = window.mangleEngine;
            if (!mangle) return;

            // Heavy delay with feedback
            if (mangle.setDelayTime) mangle.setDelayTime(375); // Dotted 8th at 90 BPM
            if (mangle.setDelayFeedback) mangle.setDelayFeedback(45);
            if (mangle.setDelayMix) mangle.setDelayMix(35);

            // Subtle grain for texture
            if (mangle.setGrain) mangle.setGrain(25, 80, 0); // density, size, pitch

            // Light glitch for character
            if (mangle.setGlitch) mangle.setGlitch(10, 50, 'stutter');
        });

        // Try to capture radio or use fallback
        console.log('[6/8] Setting up radio source...');
        const radioSetup = await page.evaluate(async () => {
            const radio = window.radioPlayer;
            const sampler = window.sampler;

            if (!radio || !sampler) return { success: false, reason: 'Missing modules' };

            try {
                // Try to play fallback radio (internal audio)
                if (radio.playFallback) {
                    await radio.playFallback();
                    await new Promise(r => setTimeout(r, 1000));
                }

                // Capture radio to buffer
                if (radio.captureToBuffer && radio.isPlaying?.()) {
                    const buffer = await radio.captureToBuffer(3000);
                    if (buffer && sampler.loadBuffer) {
                        sampler.loadBuffer(0, buffer, 'radio-chop');
                        return { success: true, method: 'radio-capture' };
                    }
                }

                // Fallback: use existing kit samples
                return { success: true, method: 'kit-samples' };
            } catch (e) {
                return { success: false, reason: e.message };
            }
        });
        console.log(`    Radio setup: ${radioSetup.success ? radioSetup.method : radioSetup.reason}`);

        // Enable mic-reactive mode
        console.log('[7/8] Enabling mic-reactive mode...');
        await page.evaluate(() => {
            // Start soundscape analyzer if available
            if (window.soundscapeAnalyzer?.start) {
                window.soundscapeAnalyzer.start();
            }

            // Register AI composer to respond to changes
            if (window.aiComposer && window.soundscapeAnalyzer) {
                window.soundscapeAnalyzer.onClassificationChange = (classification) => {
                    console.log(`Soundscape: ${classification}`);
                    window.aiComposer.onSoundscapeChange?.(classification);
                };
            }
        });

        // Start playback and recording
        console.log('[8/8] Starting playback and recording...');
        const recordingStarted = await page.evaluate(() => {
            // Start session recorder if available
            let recStarted = false;
            if (window.sessionRecorder?.start) {
                recStarted = window.sessionRecorder.start();
            }

            // Start sequencer
            if (window.sequencer?.play) {
                window.sequencer.play();
            }

            // Also start synth continuous if needed
            if (window.synth?.start) {
                window.synth.start();
            }

            return recStarted;
        });
        console.log(`    Recording started: ${recordingStarted ? 'YES' : 'NO'}`);

        // Take initial screenshot
        await page.screenshot({
            path: '/home/anv/Current/OhMyOndas/tests/screenshots/song-playing.png'
        });
        console.log('\nScreenshot saved: tests/screenshots/song-playing.png');

        console.log(`\n▶ PLAYING TEST SONG (${SONG_DURATION / 1000} seconds)...`);
        console.log('  Bass: Pads with heavy delay/grain FX');
        console.log('  Lead: Synth with sawtooth + unison');
        console.log('  Melody: Radio chops with pitch/slice P-Locks');
        console.log('  Dynamic: Mic → SoundscapeAnalyzer → FX modulation\n');

        // Progress indicator
        const startTime = Date.now();
        const progressInterval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const remaining = Math.max(0, SONG_DURATION - elapsed);
            const progress = Math.min(100, Math.round((elapsed / SONG_DURATION) * 100));
            process.stdout.write(`\r  Progress: ${progress}% | ${Math.ceil(remaining / 1000)}s remaining...`);
        }, 1000);

        // Wait for song duration
        await sleep(SONG_DURATION);
        clearInterval(progressInterval);
        console.log('\r  Progress: 100% | Complete!                    ');

        // Stop and save recording
        console.log('\nStopping playback...');

        // Setup download path
        const downloadPath = '/home/anv/Current/OhMyOndas/tests/recordings';
        const fs = require('fs');
        if (!fs.existsSync(downloadPath)) {
            fs.mkdirSync(downloadPath, { recursive: true });
        }

        // Configure downloads
        const client = await page.target().createCDPSession();
        await client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: downloadPath
        });

        const recordingResult = await page.evaluate(async () => {
            // Stop sequencer
            if (window.sequencer?.stop) {
                window.sequencer.stop();
            } else if (window.sequencer?.pause) {
                window.sequencer.pause();
            }

            // Stop synth
            if (window.synth?.stop) {
                window.synth.stop();
            }

            // Stop recording and wait for finalization
            if (window.sessionRecorder?.stop && window.sessionRecorder?.isRecording?.()) {
                window.sessionRecorder.stop();

                // Wait for finalization (the recorder stores in this.recordings)
                await new Promise(r => setTimeout(r, 1000));

                // Get the latest recording
                const recordings = window.sessionRecorder.recordings || [];
                if (recordings.length > 0) {
                    const latest = recordings[recordings.length - 1];
                    if (latest && latest.blob) {
                        // Create download link
                        const url = URL.createObjectURL(latest.blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `test-song-${Date.now()}.webm`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        return { recorded: true, size: latest.blob.size, filename: a.download };
                    }
                }
                return { recorded: false, reason: 'No recording data available' };
            }

            return { recorded: false, reason: 'Recorder not active' };
        });

        // Wait for download to complete
        if (recordingResult.recorded) {
            await sleep(2000);
            console.log(`Recording saved: ${recordingResult.filename} (${recordingResult.size} bytes)`);
        }

        // Take final screenshot
        await page.screenshot({
            path: '/home/anv/Current/OhMyOndas/tests/screenshots/song-complete.png'
        });

        console.log('\n' + '='.repeat(60));
        console.log('SONG GENERATION COMPLETE');
        console.log('='.repeat(60));
        console.log(`Duration: ${SONG_DURATION / 1000} seconds`);
        console.log(`Recording: ${recordingResult.recorded ? `Yes (${recordingResult.size} bytes)` : 'No'}`);
        console.log('Screenshots: song-playing.png, song-complete.png');
        console.log('='.repeat(60));

        // Keep browser open briefly to hear the end
        await sleep(2000);

    } catch (error) {
        console.error('\nError generating song:', error.message);
    }

    await browser.close();
    console.log('\nBrowser closed.');
}

generateTestSong().catch(console.error);
