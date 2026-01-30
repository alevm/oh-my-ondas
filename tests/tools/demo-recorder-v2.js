/**
 * Oh My Ondas - Demo Recorder v2
 *
 * This version uses direct JavaScript calls to control the app
 * and captures video with audio using the browser's screen recording.
 *
 * Usage:
 *   node demo-recorder-v2.js
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const CONFIG = {
    url: 'https://alevm.github.io/oh-my-ondas/',
    duration: 220,  // Full demo with advanced features (~3.5 min)
    width: 1920,
    height: 1080
};

// Helper to wait for user confirmation in terminal
function waitForUserInput(prompt) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise(resolve => {
        rl.question(prompt, () => {
            rl.close();
            resolve();
        });
    });
}

async function runDemo() {
    console.log('='.repeat(60));
    console.log('OH MY ONDAS - DEMO RECORDER v2 (with audio)');
    console.log('='.repeat(60));
    console.log('');
    console.log('IMPORTANT - When the dialog appears:');
    console.log('  1. Click on the "Oh My Ondas" TAB (not window)');
    console.log('  2. Check "Also share tab audio" checkbox!');
    console.log('  3. Click "Share"');
    console.log('  4. DO NOT close the browser until demo ends');
    console.log('');
    console.log('='.repeat(60));

    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: [
            `--window-size=${CONFIG.width},${CONFIG.height}`,
            '--autoplay-policy=no-user-gesture-required',
            '--disable-features=IsolateOrigins,site-per-process',
            '--enable-features=SharedArrayBuffer'
        ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: CONFIG.width, height: CONFIG.height });

    console.log('\n[1/4] Loading Oh My Ondas...');
    await page.goto(CONFIG.url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait for app to initialize
    await page.waitForSelector('#btnPlay', { timeout: 10000 });
    console.log('      App loaded!');

    // Click somewhere to enable audio context
    console.log('[2/4] Enabling audio...');
    await page.click('body');
    await page.evaluate(() => {
        // Resume audio context if suspended
        if (window.audioEngine && window.audioEngine.ctx) {
            window.audioEngine.ctx.resume();
        }
    });

    // Start screen recording from within the page
    console.log('[3/4] Starting recording (select the tab when prompted)...');

    const recordingStarted = await page.evaluate(async (duration) => {
        return new Promise(async (resolve) => {
            try {
                // Request screen capture with audio
                const stream = await navigator.mediaDevices.getDisplayMedia({
                    video: {
                        width: 1920,
                        height: 1080,
                        frameRate: 30,
                        displaySurface: 'browser'
                    },
                    audio: {
                        echoCancellation: false,
                        noiseSuppression: false,
                        autoGainControl: false
                    },
                    preferCurrentTab: true
                });

                const chunks = [];
                const recorder = new MediaRecorder(stream, {
                    mimeType: 'video/webm;codecs=vp9,opus',
                    videoBitsPerSecond: 8000000
                });

                recorder.ondataavailable = (e) => {
                    if (e.data.size > 0) chunks.push(e.data);
                };

                window._demoRecorder = recorder;
                window._demoChunks = chunks;
                window._demoStream = stream;

                recorder.start(1000);
                resolve(true);

            } catch (error) {
                console.error('Recording error:', error);
                resolve(false);
            }
        });
    }, CONFIG.duration);

    if (!recordingStarted) {
        console.log('Recording was cancelled or failed.');
        await browser.close();
        return;
    }

    console.log('[4/4] Executing demo sequence...\n');

    // Helper to run JS in browser and log
    const runStep = async (description, code) => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[${elapsed.padStart(5)}s] ${description}`);
        try {
            await page.evaluate(code);
        } catch (e) {
            // Ignore errors, continue demo
        }
    };

    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const startTime = Date.now();

    // === PSYCHOGEOGRAPHIC SOUNDSCAPE DEMO ===
    // Listen to the room, analyze mood & melody
    // Generate music that reflects THIS place, THIS moment

    await wait(1000);

    // ============================================
    // PHASE 1: DEEP LISTENING & MOOD ANALYSIS
    // ============================================

    // Enable mic and set up advanced audio analysis
    await runStep('>> Enabling microphone for deep listening...', () => {
        document.querySelector('.src-btn[data-src="mic"]')?.click();
    });
    await wait(2500);

    // Set up comprehensive audio analysis
    await runStep('>> Setting up mood & melody detection...', () => {
        const ctx = window.audioEngine?.ctx || window.audioEngine?.getContext?.();
        if (ctx && window.micInput?.micGain) {
            // Main frequency analyzer
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 2048;  // Higher resolution for pitch detection
            analyser.smoothingTimeConstant = 0.5;

            // Store for mood tracking over time
            window._demoAnalyser = analyser;
            window._demoFreqData = new Uint8Array(analyser.frequencyBinCount);
            window._demoTimeData = new Uint8Array(analyser.fftSize);
            window._demoMoodHistory = [];  // Track mood over time

            window.micInput.micGain.connect(analyser);
            console.log('Advanced audio analysis connected');
        }
    });
    await wait(500);

    await runStep('>> LISTENING to the soundscape of this place...', async () => {});
    console.log('      Analyzing: energy | mood | melodic content | rhythm patterns\n');

    // Extended listening with mood/melody analysis (20 seconds)
    let moodSamples = { energy: 0, chaos: 0, melodic: 0, rhythmic: 0, samples: 0 };

    for (let i = 0; i < 20; i++) {
        const analysis = await page.evaluate(() => {
            if (!window._demoAnalyser || !window._demoFreqData) {
                return { energy: 30, bass: 30, mid: 20, high: 10, rhythmic: false, melodic: false, mood: 'calm' };
            }

            window._demoAnalyser.getByteFrequencyData(window._demoFreqData);
            window._demoAnalyser.getByteTimeDomainData(window._demoTimeData);
            const freqData = window._demoFreqData;
            const timeData = window._demoTimeData;
            const len = freqData.length;

            // Frequency bands analysis
            const bass = freqData.slice(0, Math.floor(len * 0.05)).reduce((a, b) => a + b, 0) / Math.floor(len * 0.05);
            const lowMid = freqData.slice(Math.floor(len * 0.05), Math.floor(len * 0.15)).reduce((a, b) => a + b, 0) / Math.floor(len * 0.1);
            const mid = freqData.slice(Math.floor(len * 0.15), Math.floor(len * 0.4)).reduce((a, b) => a + b, 0) / Math.floor(len * 0.25);
            const highMid = freqData.slice(Math.floor(len * 0.4), Math.floor(len * 0.7)).reduce((a, b) => a + b, 0) / Math.floor(len * 0.3);
            const high = freqData.slice(Math.floor(len * 0.7)).reduce((a, b) => a + b, 0) / Math.floor(len * 0.3);
            const energy = (bass + lowMid + mid + highMid + high) / 5;

            // Detect if there's rhythmic content (amplitude variations)
            let maxAmp = 0, minAmp = 255;
            for (let j = 0; j < timeData.length; j++) {
                if (timeData[j] > maxAmp) maxAmp = timeData[j];
                if (timeData[j] < minAmp) minAmp = timeData[j];
            }
            const rhythmic = (maxAmp - minAmp) > 50;

            // Detect melodic content (sustained mid frequencies)
            const melodic = mid > 35 && (highMid > 20 || lowMid > 30);

            // Determine mood
            let mood;
            if (energy > 60) mood = 'chaos';
            else if (energy > 40 && rhythmic) mood = 'urban';
            else if (melodic && energy < 40) mood = 'nature';
            else mood = 'calm';

            // Store in history
            window._demoMoodHistory.push({ mood, energy, melodic, rhythmic });

            return { energy, bass, lowMid, mid, highMid, high, rhythmic, melodic, mood };
        });

        // Accumulate for AI generation
        moodSamples.energy += analysis.energy;
        moodSamples.chaos += analysis.mood === 'chaos' ? 1 : 0;
        moodSamples.melodic += analysis.melodic ? 1 : 0;
        moodSamples.rhythmic += analysis.rhythmic ? 1 : 0;
        moodSamples.samples++;

        // Visual feedback based on detected content
        const symbols = {
            energy: analysis.energy > 40 ? '▓▓' : analysis.energy > 20 ? '▒▒' : '░░',
            mood: analysis.mood.toUpperCase().padEnd(6),
            melodic: analysis.melodic ? '♪♪' : '--',
            rhythmic: analysis.rhythmic ? '◆◆' : '--'
        };

        console.log(`      [${symbols.energy}] ${symbols.mood} | melodic:${symbols.melodic} rhythm:${symbols.rhythmic} | energy:${analysis.energy.toFixed(0)}`);

        // React to what we hear in real-time
        if (analysis.melodic) {
            await page.evaluate(() => window.sampler?.trigger(2));  // Melodic response
        }
        if (analysis.rhythmic && analysis.energy > 35) {
            await page.evaluate(() => window.sampler?.trigger(0));  // Rhythmic response
        }

        await wait(1000);
    }

    // Calculate dominant mood
    const avgEnergy = moodSamples.energy / moodSamples.samples;
    const dominantMood = moodSamples.chaos > 8 ? 'chaos' :
                         avgEnergy > 45 ? 'urban' :
                         moodSamples.melodic > 10 ? 'nature' : 'calm';
    const density = Math.min(100, avgEnergy * 1.5);
    const complexity = moodSamples.rhythmic > 8 ? 70 : moodSamples.melodic > 8 ? 50 : 30;

    console.log(`\n      === AMBIENT ANALYSIS COMPLETE ===`);
    console.log(`      Dominant mood: ${dominantMood.toUpperCase()}`);
    console.log(`      Average energy: ${avgEnergy.toFixed(0)}`);
    console.log(`      Melodic content: ${((moodSamples.melodic / moodSamples.samples) * 100).toFixed(0)}%`);
    console.log(`      Rhythmic content: ${((moodSamples.rhythmic / moodSamples.samples) * 100).toFixed(0)}%\n`);

    // ============================================
    // PHASE 2: AI SOUNDSCAPE GENERATION
    // Generate patterns that reflect the mood/melody detected
    // ============================================
    await runStep(`>> AI generating ${dominantMood.toUpperCase()} soundscape...`, async () => {
        // Set the vibe based on analysis
        const vibeBtn = document.querySelector(`.vibe-btn[data-vibe="${dominantMood}"]`);
        if (vibeBtn) vibeBtn.click();

        // Set density and complexity from analysis
        const densitySlider = document.getElementById('aiDensity');
        const complexitySlider = document.getElementById('aiComplexity');
        if (densitySlider) densitySlider.value = density;
        if (complexitySlider) complexitySlider.value = complexity;

        // Trigger AI generation with analyzed parameters
        window.aiComposer?.generateRhythm(dominantMood, density, complexity);
    });
    await wait(2000);

    // Set tempo based on mood
    const tempoMap = { calm: 85, nature: 95, urban: 115, chaos: 135 };
    await runStep(`>> Setting tempo to ${tempoMap[dominantMood]} BPM for ${dominantMood} mood...`, () => {
        window.sequencer?.setTempo(tempoMap[dominantMood]);
        const tempoInput = document.getElementById('seqTempo');
        if (tempoInput) tempoInput.value = tempoMap[dominantMood];
    });
    await wait(1000);

    await runStep('>> AI pattern generated from ambient analysis', () => {
        window.app?.updateOctSteps();
    });
    await wait(1500);

    // Start playback with AI-generated pattern
    await runStep('>> PLAY - Music of this place begins...', () => {
        document.getElementById('btnPlay').click();
    });
    await wait(3000);

    // ============================================
    // PHASE 3: REACTIVE LAYERED BUILD-UP
    // Listen to ambient while building layers
    // ============================================

    // Layer 1: Add sampler - react to ambient
    await runStep('>> Layer 1: Adding sampler, reacting to ambient...', async () => {
        document.querySelector('.src-btn[data-src="sampler"]')?.click();
    });
    await wait(500);

    // Reactive pad triggers - listen and respond to frequencies
    for (let i = 0; i < 8; i++) {
        const audioData = await page.evaluate(() => {
            if (window._demoAnalyser && window._demoAudioData) {
                window._demoAnalyser.getByteFrequencyData(window._demoAudioData);
                const data = window._demoAudioData;
                const len = data.length;
                const bass = data.slice(0, Math.floor(len * 0.1)).reduce((a, b) => a + b, 0) / Math.floor(len * 0.1);
                const mid = data.slice(Math.floor(len * 0.1), Math.floor(len * 0.5)).reduce((a, b) => a + b, 0) / Math.floor(len * 0.4);
                const high = data.slice(Math.floor(len * 0.5)).reduce((a, b) => a + b, 0) / Math.floor(len * 0.5);
                return { bass, mid, high };
            }
            return { bass: Math.random() * 50 + 10, mid: Math.random() * 40 + 10, high: Math.random() * 30 + 5 };
        });

        // Choose pad based on dominant frequency
        let padIdx, desc;
        if (audioData.bass > audioData.mid && audioData.bass > audioData.high) {
            padIdx = 0;  // Kick
            desc = `BASS dominant (${audioData.bass.toFixed(0)})`;
        } else if (audioData.mid > audioData.high) {
            padIdx = 2;  // Melodic
            desc = `MID dominant (${audioData.mid.toFixed(0)})`;
        } else {
            padIdx = 4;  // Texture
            desc = `HIGH dominant (${audioData.high.toFixed(0)})`;
        }

        await page.evaluate((idx) => window.sampler?.trigger(idx), padIdx);
        console.log(`      [${desc}] >> pad ${padIdx}`);
        await wait(500 + Math.random() * 300);
    }

    // Add sequencer steps based on what we heard
    await runStep('>> Embedding ambient patterns into sequencer...', () => {
        window.sequencer.toggleStep(0, 0);
        window.sequencer.toggleStep(0, 4);
        window.sequencer.toggleStep(0, 8);
        window.sequencer.toggleStep(0, 12);
        window.sequencer.toggleStep(1, 2);
        window.sequencer.toggleStep(1, 6);
        window.sequencer.toggleStep(1, 10);
        window.sequencer.toggleStep(1, 14);
        window.app?.updateOctSteps();
    });
    await wait(3000);

    // Layer 2: Synth responds to ambient frequencies
    await runStep('>> Layer 2: Synth melody emerging from ambient...', () => {
        document.querySelector('.src-btn[data-src="synth"]')?.click();
        document.querySelector('.wave-btn[data-wave="sawtooth"]')?.click();
    });
    await wait(1000);

    await page.evaluate(() => {
        window.sequencer.toggleStep(3, 0);
        window.sequencer.toggleStep(3, 3);
        window.sequencer.toggleStep(3, 7);
        window.sequencer.toggleStep(3, 10);
        window.app?.updateOctSteps();
    });
    await wait(3000);

    // Punch FX while building - not separate section
    await runStep('>> Adding stutter effect...', () => {
        window.app?.applyPunchFX('stutter', true);
    });
    await wait(1200);
    await page.evaluate(() => window.app?.applyPunchFX('stutter', false));

    // Layer 3: Radio texture
    await runStep('>> Layer 3: Radio textures from afar...', () => {
        document.querySelector('.src-btn[data-src="radio"]')?.click();
    });
    await wait(800);

    await page.evaluate(() => {
        window.sequencer.toggleStep(4, 0);
        window.sequencer.toggleStep(4, 8);
        window.sequencer.toggleStep(5, 4);
        window.sequencer.toggleStep(5, 12);
        window.app?.updateOctSteps();
    });
    await wait(2000);

    // Filter sweep while layers play
    await runStep('>> Filter sweep...', () => {
        window.app?.applyPunchFX('filter', true);
    });
    await wait(2000);
    await page.evaluate(() => window.app?.applyPunchFX('filter', false));
    await wait(1000);

    // ============================================
    // PHASE 4: REACTIVE SCENE MORPHING
    // Scene changes triggered by ambient intensity
    // ============================================
    await runStep('>> Morphing to Scene B based on ambient mood...', () => {
        document.querySelector('.scene-btn[data-scene="1"]')?.click();
    });
    await wait(1000);

    // React to ambient while in Scene B - frequency-driven effects
    for (let i = 0; i < 6; i++) {
        const audioData = await page.evaluate(() => {
            if (window._demoAnalyser && window._demoAudioData) {
                window._demoAnalyser.getByteFrequencyData(window._demoAudioData);
                const data = window._demoAudioData;
                const len = data.length;
                const bass = data.slice(0, Math.floor(len * 0.1)).reduce((a, b) => a + b, 0) / Math.floor(len * 0.1);
                const mid = data.slice(Math.floor(len * 0.1), Math.floor(len * 0.5)).reduce((a, b) => a + b, 0) / Math.floor(len * 0.4);
                const high = data.slice(Math.floor(len * 0.5)).reduce((a, b) => a + b, 0) / Math.floor(len * 0.5);
                const avg = data.reduce((a, b) => a + b, 0) / len;
                return { bass, mid, high, avg };
            }
            return { bass: Math.random() * 50, mid: Math.random() * 40, high: Math.random() * 30, avg: 35 };
        });

        // Choose effect and pad based on frequencies
        if (audioData.bass > 45) {
            await page.evaluate(() => window.sampler?.trigger(0));
            await page.evaluate(() => window.app?.applyPunchFX('stutter', true));
            console.log(`      [bass:${audioData.bass.toFixed(0)}] >> STUTTER from bass`);
            await wait(350);
            await page.evaluate(() => window.app?.applyPunchFX('stutter', false));
        } else if (audioData.mid > 35) {
            await page.evaluate(() => window.sampler?.trigger(2));
            console.log(`      [mid:${audioData.mid.toFixed(0)}] >> melodic response`);
        } else if (audioData.high > 25) {
            await page.evaluate(() => window.sampler?.trigger(4));
            await page.evaluate(() => window.app?.applyPunchFX('filter', true));
            console.log(`      [high:${audioData.high.toFixed(0)}] >> FILTER from highs`);
            await wait(250);
            await page.evaluate(() => window.app?.applyPunchFX('filter', false));
        } else {
            console.log(`      [avg:${audioData.avg.toFixed(0)}] >> quiet... ambient texture`);
        }
        await wait(550);
    }

    // Tape effect for warmth
    await runStep('>> Tape warmth from ambient resonance...', () => {
        window.app?.applyPunchFX('tape', true);
    });
    await wait(2000);
    await page.evaluate(() => window.app?.applyPunchFX('tape', false));

    // Scene C based on accumulated energy
    const avgLevel = await page.evaluate(() => {
        if (window._demoAnalyser && window._demoAudioData) {
            window._demoAnalyser.getByteFrequencyData(window._demoAudioData);
            return window._demoAudioData.reduce((a, b) => a + b, 0) / window._demoAudioData.length;
        }
        return 45;
    });

    await runStep(`>> Morphing to Scene C [energy: ${avgLevel.toFixed(0)}]...`, () => {
        document.querySelector('.scene-btn[data-scene="2"]')?.click();
    });
    await wait(2000);

    // Reactive intense pad burst
    for (let i = 0; i < 6; i++) {
        await page.evaluate((idx) => window.sampler?.trigger(idx), i);
        await wait(200);
    }
    await wait(1500);

    // ============================================
    // PHASE 5: PATTERN VARIATIONS (110-140s)
    // Switch patterns while performing
    // ============================================
    await runStep('>> Pattern B - variation kicks in...', () => {
        document.querySelector('.pattern-btn[data-pattern="1"]')?.click();
    });
    await wait(500);

    // Build Pattern B live
    await page.evaluate(() => {
        window.sequencer.toggleStep(0, 2);
        window.sequencer.toggleStep(0, 6);
        window.sequencer.toggleStep(2, 0);
        window.sequencer.toggleStep(2, 4);
        window.sequencer.toggleStep(2, 8);
        window.sequencer.toggleStep(2, 12);
        window.app?.updateOctSteps();
    });
    await wait(4000);

    // Stutter burst
    await page.evaluate(() => window.app?.applyPunchFX('stutter', true));
    await wait(800);
    await page.evaluate(() => window.app?.applyPunchFX('stutter', false));
    await wait(500);
    await page.evaluate(() => window.app?.applyPunchFX('stutter', true));
    await wait(400);
    await page.evaluate(() => window.app?.applyPunchFX('stutter', false));

    await runStep('>> Back to Pattern A...', () => {
        document.querySelector('.pattern-btn[data-pattern="0"]')?.click();
    });
    await wait(3000);

    await runStep('>> Scene A - original mood returns...', () => {
        document.querySelector('.scene-btn[data-scene="0"]')?.click();
    });
    await wait(3000);

    // ============================================
    // PHASE 6: EUCLIDEAN + AI REGENERATION (140-160s)
    // ============================================
    await runStep('>> Euclidean rhythm generation...', () => {
        document.getElementById('eucGen')?.click();
    });
    await wait(500);
    await page.evaluate(() => window.app?.updateOctSteps());
    await wait(4000);

    await runStep('>> AI re-analyzing and generating...', () => {
        document.getElementById('aiGenerate')?.click();
    });
    await wait(500);
    await page.evaluate(() => window.app?.updateOctSteps());
    await wait(4000);

    // ============================================
    // PHASE 7: RECORDING THE MOMENT (160-180s)
    // ============================================
    await runStep('>> RECORDING this moment...', () => {
        document.getElementById('btnRecord')?.click();
    });
    await wait(1000);

    // Performance while recording
    await page.evaluate(() => window.sampler?.trigger(0));
    await wait(500);
    await page.evaluate(() => window.sampler?.trigger(2));
    await wait(500);
    await page.evaluate(() => window.app?.applyPunchFX('stutter', true));
    await wait(1000);
    await page.evaluate(() => window.app?.applyPunchFX('stutter', false));

    await page.evaluate(() => {
        document.querySelector('.scene-btn[data-scene="1"]')?.click();
    });
    await wait(2000);

    await page.evaluate(() => window.app?.applyPunchFX('filter', true));
    await wait(1500);
    await page.evaluate(() => window.app?.applyPunchFX('filter', false));

    await page.evaluate(() => window.sampler?.trigger(4));
    await wait(300);
    await page.evaluate(() => window.sampler?.trigger(5));
    await wait(300);
    await page.evaluate(() => window.sampler?.trigger(6));
    await wait(2000);

    await runStep('>> Stop recording - captured with GPS', () => {
        document.getElementById('btnRecord')?.click();
    });
    await wait(2000);

    // ============================================
    // PHASE 8: REACTIVE CLIMAX - Ambient-driven finale
    // ============================================
    await runStep('>> CLIMAX - responding to accumulated ambient energy...', () => {
        document.querySelector('.scene-btn[data-scene="2"]')?.click();
    });
    await wait(1000);

    // Reactive rapid pad triggers based on ambient
    for (let round = 0; round < 3; round++) {
        const level = await page.evaluate(() => {
            if (window._demoAnalyser && window._demoAudioData) {
                window._demoAnalyser.getByteFrequencyData(window._demoAudioData);
                return window._demoAudioData.reduce((a, b) => a + b, 0) / window._demoAudioData.length;
            }
            return Math.random() * 70 + 30;
        });

        // Intensity based on ambient
        const speed = level > 50 ? 100 : 200;
        for (let pad = 0; pad < 4; pad++) {
            await page.evaluate((idx) => window.sampler?.trigger(idx), pad);
            await wait(speed);
        }
        console.log(`      [ambient: ${level.toFixed(0)}] >> burst at ${speed}ms pace`);
        await wait(200);
    }

    // Final stutter - intensity based on ambient
    const finalLevel = await page.evaluate(() => {
        if (window._demoAnalyser && window._demoAudioData) {
            window._demoAnalyser.getByteFrequencyData(window._demoAudioData);
            return window._demoAudioData.reduce((a, b) => a + b, 0) / window._demoAudioData.length;
        }
        return 50;
    });

    await page.evaluate(() => window.app?.applyPunchFX('stutter', true));
    await wait(finalLevel > 50 ? 800 : 400);
    await page.evaluate(() => window.app?.applyPunchFX('stutter', false));
    await wait(200);
    await page.evaluate(() => window.app?.applyPunchFX('stutter', true));
    await wait(finalLevel > 50 ? 600 : 300);
    await page.evaluate(() => window.app?.applyPunchFX('stutter', false));

    // Final filter sweep down
    await runStep(`>> Filter sweep out [final energy: ${finalLevel.toFixed(0)}]...`, () => {
        window.app?.applyPunchFX('filter', true);
    });
    await wait(3000);
    await page.evaluate(() => window.app?.applyPunchFX('filter', false));

    // Return to ambient - full circle
    await runStep('>> Returning to ambient... the place speaks through the music', () => {
        document.querySelector('.scene-btn[data-scene="0"]')?.click();
    });
    await wait(3000);

    await runStep('>> Music of THIS place - COMPLETE', () => {
        document.getElementById('btnStop')?.click();
    });

    // Wait a moment then stop recording
    await wait(2000);

    console.log('\nStopping recording and saving...');

    // Stop recording and download
    try {
        await page.evaluate(() => {
            return new Promise((resolve) => {
                const recorder = window._demoRecorder;
                const chunks = window._demoChunks;
                const stream = window._demoStream;

                if (!recorder) {
                    resolve();
                    return;
                }

                recorder.onstop = () => {
                    const blob = new Blob(chunks, { type: 'video/webm' });
                    const url = URL.createObjectURL(blob);

                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `oh-my-ondas-demo-${Date.now()}.webm`;
                    a.click();

                    stream.getTracks().forEach(t => t.stop());
                    resolve();
                };

                recorder.stop();
            });
        });

        console.log('\n' + '='.repeat(60));
        console.log('DEMO COMPLETE!');
        console.log('='.repeat(60));
        console.log('The video should download automatically.');
        console.log('Check your browser Downloads folder for:');
        console.log('  oh-my-ondas-demo-*.webm');
        console.log('');
        console.log('='.repeat(60));

        // Wait for user confirmation before closing
        await waitForUserInput('\nPress ENTER when you are ready to close the browser...');

        console.log('Closing browser...');
        await browser.close();
    } catch (err) {
        // Browser was closed externally - that's okay
        console.log('\n' + '='.repeat(60));
        console.log('Browser was closed.');
        console.log('='.repeat(60));
        console.log('If you shared the tab audio, the video should have');
        console.log('downloaded to your Downloads folder.');
        console.log('');
        console.log('If no video was saved, make sure to:');
        console.log('  1. Select the Oh My Ondas TAB (not window)');
        console.log('  2. Check "Also share tab audio"');
        console.log('  3. Keep the browser open until the end');
        console.log('='.repeat(60));
    }
}

runDemo().catch(console.error);
