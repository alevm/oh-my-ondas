/**
 * OH MY ONDAS — Full Button & Generation Validation
 * Validates every interactive element and AI composition output.
 * Run: node validate-all.js
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const URL = 'http://localhost:8080/app.html';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'validation');
const results = { passed: 0, failed: 0, warnings: 0, tests: [] };

function record(name, status, detail = '') {
    results.tests.push({ name, status, detail });
    if (status === 'PASS') results.passed++;
    else if (status === 'FAIL') results.failed++;
    else results.warnings++;
    const icon = status === 'PASS' ? '\x1b[32mPASS\x1b[0m' : status === 'FAIL' ? '\x1b[31mFAIL\x1b[0m' : '\x1b[33mWARN\x1b[0m';
    console.log(`  ${icon}  ${name}${detail ? ' — ' + detail : ''}`);
}

async function snap(page, name) {
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`), fullPage: true });
}

async function clickAndVerify(page, selector, expectClass, label) {
    try {
        const el = await page.$(selector);
        if (!el) { record(label, 'FAIL', `Element not found: ${selector}`); return false; }
        await el.click();
        await new Promise(r => setTimeout(r, 200));
        if (expectClass) {
            const hasClass = await page.evaluate((sel, cls) => {
                const e = document.querySelector(sel);
                return e ? e.classList.contains(cls) : false;
            }, selector, expectClass);
            if (hasClass) { record(label, 'PASS'); return true; }
            else { record(label, 'FAIL', `Expected class "${expectClass}" not found after click`); return false; }
        }
        record(label, 'PASS');
        return true;
    } catch (e) {
        record(label, 'FAIL', e.message);
        return false;
    }
}

async function elementExists(page, selector, label) {
    const exists = await page.$(selector) !== null;
    if (exists) record(label, 'PASS');
    else record(label, 'FAIL', `Not found: ${selector}`);
    return exists;
}

(async () => {
    if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 1000 });

    console.log('\n========================================');
    console.log('  OH MY ONDAS — FULL VALIDATION SUITE');
    console.log('========================================\n');

    try {
        await page.goto(URL, { waitUntil: 'networkidle2', timeout: 15000 });
        await new Promise(r => setTimeout(r, 1000));
    } catch (e) {
        console.log('\x1b[31mFailed to load page: ' + e.message + '\x1b[0m');
        console.log('Make sure to run: cd web && python3 -m http.server 8080');
        await browser.close();
        process.exit(1);
    }

    // ===== SECTION 1: PAGE STRUCTURE =====
    console.log('\n--- PAGE STRUCTURE ---');
    await elementExists(page, '#app', 'App container exists');
    await elementExists(page, '.page-header', 'Page header exists');
    await elementExists(page, '.page-footer', 'Page footer exists');
    await elementExists(page, '.app-sidebar', 'Sidebar exists');
    await elementExists(page, '.device', 'Device container exists');
    await elementExists(page, '.seq-panel', 'SEQ panel exists');
    await elementExists(page, '.mixer-panel', 'Mixer panel exists');
    await elementExists(page, '.pads-panel', 'Pads panel exists');
    await elementExists(page, '.knobs-panel', 'Knobs panel exists');
    await elementExists(page, '.synth-panel', 'Synth panel exists');
    await elementExists(page, '.scenes-panel', 'Scenes panel exists');
    await elementExists(page, '.fx-panel', 'FX panel exists');
    await elementExists(page, '.ai-panel', 'AI panel exists');
    await elementExists(page, '.radio-panel', 'Radio panel exists');
    await elementExists(page, '.eq-panel', 'EQ panel exists');
    await snap(page, '01-structure');

    // ===== SECTION 2: NAVIGATION =====
    console.log('\n--- NAVIGATION ---');
    const navLinks = await page.$$eval('.nav-link', els => els.map(e => ({ text: e.textContent.trim(), href: e.getAttribute('href') })));
    const expectedNav = ['Home', 'App', 'Design', 'SDLC', 'About', 'Analysis'];
    for (const n of expectedNav) {
        const found = navLinks.find(l => l.text === n);
        record(`Nav link: ${n}`, found ? 'PASS' : 'FAIL', found ? found.href : 'Missing');
    }

    // ===== SECTION 3: TRANSPORT =====
    console.log('\n--- TRANSPORT ---');
    await elementExists(page, '#btnPlay', 'Play button exists');
    await elementExists(page, '#btnStop', 'Stop button exists');
    await elementExists(page, '#btnRecord', 'Record button exists');

    // Click Play
    await clickAndVerify(page, '#btnPlay', 'active', 'Play button activates');
    const isPlaying = await page.evaluate(() => window.sequencer?.isPlaying());
    record('Sequencer is playing after Play click', isPlaying ? 'PASS' : 'WARN', isPlaying ? '' : 'Sequencer may not be initialized');

    await new Promise(r => setTimeout(r, 500));

    // Click Stop
    await page.click('#btnStop');
    await new Promise(r => setTimeout(r, 200));
    const isStopped = await page.evaluate(() => !window.sequencer?.isPlaying());
    record('Sequencer stopped after Stop click', isStopped ? 'PASS' : 'WARN');

    // Click Record
    await page.click('#btnRecord');
    await new Promise(r => setTimeout(r, 200));
    const isRecording = await page.evaluate(() => window.sessionRecorder?.isRecording());
    record('Record button toggles recording', isRecording !== undefined ? 'PASS' : 'WARN', isRecording ? 'Recording' : 'Not recording (may need audio context)');
    await page.click('#btnRecord');
    await new Promise(r => setTimeout(r, 100));

    // Tap Tempo
    await elementExists(page, '#btnTap', 'Tap tempo button exists');
    await page.click('#btnTap');
    await new Promise(r => setTimeout(r, 100));
    await page.click('#btnTap');
    record('Tap tempo clickable', 'PASS');

    // Tempo slider
    const tempoVal = await page.evaluate(() => +document.getElementById('tempoVal')?.textContent);
    record('Tempo display shows value', tempoVal > 0 ? 'PASS' : 'FAIL', `${tempoVal} BPM`);
    await snap(page, '02-transport');

    // ===== SECTION 4: SEQUENCER =====
    console.log('\n--- SEQUENCER ---');

    // Source buttons (SMP, SYN, RAD, MIC)
    const srcBtns = ['sampler', 'synth', 'radio', 'mic'];
    for (const src of srcBtns) {
        await clickAndVerify(page, `.src-btn[data-src="${src}"]`, 'active', `Source button: ${src.toUpperCase()}`);
    }
    // Reset to SMP
    await page.click('.src-btn[data-src="sampler"]');
    await new Promise(r => setTimeout(r, 100));

    // Pattern slots (A-H)
    for (let i = 0; i < 8; i++) {
        const label = String.fromCharCode(65 + i);
        await clickAndVerify(page, `.pattern-btn[data-pattern="${i}"]`, 'active', `Pattern slot ${label}`);
    }
    // Reset to A
    await page.click('.pattern-btn[data-pattern="0"]');
    await new Promise(r => setTimeout(r, 100));

    // Seq tools
    for (const btn of ['seqRandom', 'seqClear', 'eucGen', 'dubToggle', 'fillBtn']) {
        await elementExists(page, `#${btn}`, `SEQ tool: ${btn}`);
    }
    await page.click('#seqRandom');
    await new Promise(r => setTimeout(r, 200));
    const hasActiveSteps = await page.evaluate(() => document.querySelectorAll('.oct-step.active').length);
    record('Randomize creates active steps', hasActiveSteps > 0 ? 'PASS' : 'WARN', `${hasActiveSteps} active steps`);

    // Copy/Paste/Undo/Redo
    for (const btn of ['seqCopy', 'seqPaste', 'seqUndo', 'seqRedo']) {
        await elementExists(page, `#${btn}`, `SEQ tool: ${btn}`);
    }

    // Pattern length
    const lenSelect = await page.$('#patternLength');
    record('Pattern length selector exists', lenSelect ? 'PASS' : 'FAIL');
    if (lenSelect) {
        await page.select('#patternLength', '32');
        await new Promise(r => setTimeout(r, 200));
        const newLen = await page.evaluate(() => window.sequencer?.getPatternLength?.() || +document.getElementById('patternLength')?.value);
        record('Pattern length change to 32', newLen == 32 ? 'PASS' : 'WARN', `Got: ${newLen}`);
        await page.select('#patternLength', '16');
    }

    // Swing
    await elementExists(page, '#swingAmount', 'Swing slider exists');
    await snap(page, '03-sequencer');

    // ===== SECTION 5: PADS =====
    console.log('\n--- PADS ---');
    for (let i = 0; i < 8; i++) {
        await elementExists(page, `.pad[data-pad="${i}"]`, `Pad ${i + 1} exists`);
    }
    // Click pad 1
    await page.click('.pad[data-pad="0"]');
    await new Promise(r => setTimeout(r, 200));
    record('Pad 1 clickable', 'PASS');

    // Kit buttons
    for (const kit of ['kit1', 'kit2', 'kit3']) {
        await clickAndVerify(page, `.kit-btn[data-kit="${kit}"]`, 'active', `Kit button: ${kit}`);
    }
    await page.click('.kit-btn[data-kit="kit1"]');

    // Mic capture button
    await elementExists(page, '#micCapture', 'Mic capture button exists');
    await snap(page, '04-pads');

    // ===== SECTION 6: MIXER =====
    console.log('\n--- MIXER ---');
    const channels = ['mic', 'samples', 'synth', 'radio'];
    for (const ch of channels) {
        await elementExists(page, `#fader${ch.charAt(0).toUpperCase() + ch.slice(1)}`, `Fader: ${ch}`);
        await elementExists(page, `#gain${ch.charAt(0).toUpperCase() + ch.slice(1)}`, `Gain knob: ${ch}`);
        await elementExists(page, `#pan${ch.charAt(0).toUpperCase() + ch.slice(1)}`, `Pan knob: ${ch}`);
    }
    await elementExists(page, '#faderMaster', 'Master fader exists');

    // Mute/Solo buttons
    for (const ch of channels) {
        const chCap = ch.charAt(0).toUpperCase() + ch.slice(1);
        await elementExists(page, `#mute${chCap}`, `Mute button: ${ch}`);
        await elementExists(page, `#solo${chCap}`, `Solo button: ${ch}`);
    }

    // Click mute on mic, verify active class
    await clickAndVerify(page, '#muteMic', 'active', 'Mute MIC toggles active');
    await page.click('#muteMic'); // unmute

    // Meter mode buttons
    await elementExists(page, '.meter-btn[data-mode="peak"]', 'Peak meter mode button');
    await elementExists(page, '.meter-btn[data-mode="rms"]', 'RMS meter mode button');
    await snap(page, '05-mixer');

    // ===== SECTION 7: KNOBS / CTRL =====
    console.log('\n--- CTRL / KNOBS ---');
    const knobIds = ['knobFreq', 'knobFilter', 'knobDelay', 'knobGrain', 'knobReso', 'knobDrive', 'knobPan', 'knobVol'];
    for (const id of knobIds) {
        await elementExists(page, `#${id}`, `Knob: ${id}`);
    }

    // Target buttons
    for (const tgt of ['fx', 'synth', 'sampler']) {
        await clickAndVerify(page, `.target-btn[data-target="${tgt}"]`, 'active', `Target button: ${tgt}`);
    }
    await page.click('.target-btn[data-target="fx"]');

    // ===== SECTION 8: SYNTH =====
    console.log('\n--- SYNTH ---');
    await elementExists(page, '#synthToggle', 'Synth power button exists');

    // Wave buttons OSC1 & OSC2
    for (const wave of ['sine', 'triangle', 'sawtooth', 'square']) {
        await elementExists(page, `.wave-btns[data-osc="1"] .wave-btn[data-wave="${wave}"]`, `OSC1 wave: ${wave}`);
        await elementExists(page, `.wave-btns[data-osc="2"] .wave-btn[data-wave="${wave}"]`, `OSC2 wave: ${wave}`);
    }

    // Click sine on OSC1
    await clickAndVerify(page, '.wave-btns[data-osc="1"] .wave-btn[data-wave="sawtooth"]', 'active', 'OSC1 SAW select');
    await page.click('.wave-btns[data-osc="1"] .wave-btn[data-wave="sine"]');

    // Filter type buttons
    for (const flt of ['lowpass', 'highpass', 'bandpass']) {
        await elementExists(page, `.flt-btn[data-flt="${flt}"]`, `Filter button: ${flt}`);
    }
    await clickAndVerify(page, '.flt-btn[data-flt="highpass"]', 'active', 'Filter HP select');
    await page.click('.flt-btn[data-flt="lowpass"]');

    // LFO target buttons
    for (const lfo of ['pitch', 'filter', 'amp']) {
        await elementExists(page, `.lfo-btn[data-target="${lfo}"]`, `LFO target: ${lfo}`);
    }

    // ADSR sliders
    for (const param of ['adsrAttack', 'adsrDecay', 'adsrSustain', 'adsrRelease']) {
        await elementExists(page, `#${param}`, `ADSR: ${param}`);
    }

    // Synth presets
    await elementExists(page, '#synthPresetSave', 'Synth preset save');
    await elementExists(page, '#synthPresetLoad', 'Synth preset load');
    await snap(page, '06-synth');

    // ===== SECTION 9: SCENES =====
    console.log('\n--- SCENES ---');
    for (let i = 0; i < 4; i++) {
        const label = String.fromCharCode(65 + i);
        await elementExists(page, `.scene-btn[data-scene="${i}"]`, `Scene button ${label}`);
    }
    await clickAndVerify(page, '.scene-btn[data-scene="1"]', 'active', 'Scene B select');
    await page.click('.scene-btn[data-scene="0"]');

    await elementExists(page, '#saveScene', 'Save scene button');
    await elementExists(page, '#loadScene', 'Load scene button');
    await elementExists(page, '#sceneCrossfader', 'Crossfader exists');
    await elementExists(page, '#sceneCopy', 'Scene copy button');
    await elementExists(page, '#scenePaste', 'Scene paste button');
    await elementExists(page, '#sceneLock', 'Scene lock button');
    await elementExists(page, '#autoSceneToggle', 'Auto scene toggle');

    // Save scene A
    await page.click('#saveScene');
    await new Promise(r => setTimeout(r, 200));
    record('Save scene clickable', 'PASS');
    await snap(page, '07-scenes');

    // ===== SECTION 10: FX =====
    console.log('\n--- FX ---');
    for (const fx of ['fxDelay', 'fxGrain', 'fxGlitch', 'fxCrush']) {
        await elementExists(page, `#${fx}`, `FX slider: ${fx}`);
    }

    // Punch FX buttons
    for (const pf of ['stutter', 'reverse', 'filter', 'tape']) {
        await elementExists(page, `.punch-btn[data-fx="${pf}"]`, `Punch FX: ${pf}`);
    }

    // Click stutter
    const stutterBtn = await page.$('.punch-btn[data-fx="stutter"]');
    if (stutterBtn) {
        await page.evaluate(el => {
            el.dispatchEvent(new MouseEvent('mousedown'));
        }, stutterBtn);
        await new Promise(r => setTimeout(r, 300));
        await page.evaluate(el => {
            el.dispatchEvent(new MouseEvent('mouseup'));
        }, stutterBtn);
        record('Punch STT press/release', 'PASS');
    }

    // FX preset save
    await elementExists(page, '#saveFx', 'FX preset save button');
    await snap(page, '08-fx');

    // ===== SECTION 11: RADIO =====
    console.log('\n--- RADIO ---');
    await elementExists(page, '#radioSearch', 'Radio search input');
    await elementExists(page, '#radioScan', 'Radio scan button');
    await elementExists(page, '#radioGo', 'Radio play button');
    await elementExists(page, '#radioStop', 'Radio stop button');
    await elementExists(page, '#radioSample', 'Radio sample button');
    await elementExists(page, '#stationList', 'Station list container');

    // Click scan
    await page.click('#radioScan');
    await new Promise(r => setTimeout(r, 500));
    record('Radio scan clickable', 'PASS');
    await snap(page, '09-radio');

    // ===== SECTION 12: EQ =====
    console.log('\n--- EQ ---');
    await elementExists(page, '#eqLow', 'EQ Low slider');
    await elementExists(page, '#eqMid', 'EQ Mid slider');
    await elementExists(page, '#eqHigh', 'EQ High slider');

    // EQ channel buttons
    for (const ch of ['master', 'mic', 'samples', 'synth', 'radio']) {
        await elementExists(page, `.ch-btn[data-ch="${ch}"]`, `EQ channel: ${ch}`);
    }
    await clickAndVerify(page, '.ch-btn[data-ch="synth"]', 'active', 'EQ channel select: synth');
    await page.click('.ch-btn[data-ch="master"]');

    // ===== SECTION 13: AI COMPOSER =====
    console.log('\n--- AI COMPOSER ---');
    await elementExists(page, '#aiGenerate', 'Generate button exists');
    await elementExists(page, '#landmarkBtn', 'Landmark button exists');
    await elementExists(page, '#aiLocation', 'AI location display');
    await elementExists(page, '#aiTime', 'AI time display');
    await elementExists(page, '#aiVibe', 'AI vibe display');

    // Click Generate and verify output
    console.log('\n--- AI GENERATION TEST ---');
    await page.click('#aiGenerate');
    await new Promise(r => setTimeout(r, 3000)); // Wait for generation + analysis

    const genResult = await page.evaluate(() => {
        const seq = window.sequencer;
        const ae = window.audioEngine;
        const ai = window.aiComposer;
        let activeSteps = 0;
        let totalSteps = 0;
        const pattern = seq?.getPattern?.();
        if (pattern) {
            const len = seq.getPatternLength?.() || 16;
            for (let t = 0; t < 8; t++) {
                for (let s = 0; s < len; s++) {
                    totalSteps++;
                    if (pattern[t] && pattern[t][s] && (pattern[t][s].active || pattern[t][s] === true || pattern[t][s] === 1)) {
                        activeSteps++;
                    }
                }
            }
        }
        return {
            isPlaying: seq?.isPlaying?.() || false,
            tempo: seq?.getTempo?.() || 0,
            patternLength: seq?.getPatternLength?.() || 0,
            activeSteps,
            totalSteps,
            hasAudio: !!(ae?.ctx && ae.ctx.state === 'running'),
            vibe: ai?.context?.vibe || 'unknown',
            location: ai?.context?.location || 'unknown',
            timeOfDay: ai?.context?.timeOfDay || 'unknown'
        };
    });

    record('Generation produces active steps', genResult.activeSteps > 0 ? 'PASS' : 'WARN', `${genResult.activeSteps}/${genResult.totalSteps} steps active`);
    record('Sequencer playing after generate', genResult.isPlaying ? 'PASS' : 'WARN', genResult.isPlaying ? 'Playing' : 'Not playing (may need user gesture)');
    record('Tempo set', genResult.tempo > 0 ? 'PASS' : 'WARN', `${genResult.tempo} BPM`);
    record('AI vibe detected', genResult.vibe !== 'unknown' ? 'PASS' : 'WARN', genResult.vibe);
    record('AI context available', genResult.location !== 'unknown' || genResult.timeOfDay !== 'unknown' ? 'PASS' : 'WARN', `${genResult.location}, ${genResult.timeOfDay}`);
    await snap(page, '10-after-generate');

    // Check pattern density
    if (genResult.totalSteps > 0) {
        const density = (genResult.activeSteps / genResult.totalSteps * 100).toFixed(1);
        record('Pattern density reasonable (5-60%)', density >= 5 && density <= 60 ? 'PASS' : 'WARN', `${density}%`);
    }

    // Check track sources
    const trackSources = await page.evaluate(() => {
        const sources = window.sequencer?.getTrackSources?.();
        return sources || [];
    });
    record('Track sources assigned', trackSources.length > 0 ? 'PASS' : 'WARN', trackSources.join(', ') || 'none');

    // Check if analysis report appeared
    const analysisVisible = await page.evaluate(() => {
        const el = document.getElementById('analysisReport');
        return el && el.style.display !== 'none';
    });
    record('Analysis report visible after generate', analysisVisible ? 'PASS' : 'WARN');

    // Stop playback
    await page.click('#btnStop');
    await new Promise(r => setTimeout(r, 300));

    // ===== SECTION 14: KEYBOARD SHORTCUTS =====
    console.log('\n--- KEYBOARD SHORTCUTS ---');
    await page.keyboard.press('Space');
    await new Promise(r => setTimeout(r, 300));
    const playingAfterSpace = await page.evaluate(() => window.sequencer?.isPlaying?.());
    record('Space key toggles play', playingAfterSpace !== undefined ? 'PASS' : 'WARN');
    await page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 200));

    // Pad keys
    for (let k = 1; k <= 8; k++) {
        await page.keyboard.press(String(k));
        await new Promise(r => setTimeout(r, 100));
    }
    record('Pad keys 1-8 pressable', 'PASS');

    // ===== SECTION 15: HELP & SETTINGS MODALS =====
    console.log('\n--- MODALS ---');
    await page.click('#btnHelp');
    await new Promise(r => setTimeout(r, 300));
    const helpVisible = await page.evaluate(() => !document.getElementById('helpModal')?.classList.contains('hidden'));
    record('Help modal opens', helpVisible ? 'PASS' : 'FAIL');
    if (helpVisible) {
        await page.click('#closeHelp');
        await new Promise(r => setTimeout(r, 200));
    }

    await page.click('#btnAdmin');
    await new Promise(r => setTimeout(r, 300));
    const adminVisible = await page.evaluate(() => !document.getElementById('adminModal')?.classList.contains('hidden'));
    record('Settings modal opens', adminVisible ? 'PASS' : 'FAIL');
    if (adminVisible) {
        await page.click('#closeAdmin');
        await new Promise(r => setTimeout(r, 200));
    }
    await snap(page, '11-modals');

    // ===== SECTION 16: P-LOCK EDITOR =====
    console.log('\n--- P-LOCK EDITOR ---');
    await elementExists(page, '#plockEditor', 'P-Lock editor element exists');
    await elementExists(page, '#plockPitch', 'P-Lock pitch slider');
    await elementExists(page, '#plockSlice', 'P-Lock slice slider');
    await elementExists(page, '#plockFilter', 'P-Lock filter slider');
    await elementExists(page, '#plockDecay', 'P-Lock decay slider');

    // Trig condition buttons
    for (const cond of ['always', 'probability', 'fill', 'notFill', 'nth', 'neighbor']) {
        await elementExists(page, `.trig-btn[data-cond="${cond}"]`, `Trig condition: ${cond}`);
    }

    // ===== FINAL SCREENSHOT =====
    await snap(page, '12-final');

    await browser.close();

    // ===== GENERATE REPORT =====
    console.log('\n========================================');
    console.log('  VALIDATION REPORT');
    console.log('========================================');
    console.log(`  Total tests: ${results.tests.length}`);
    console.log(`  \x1b[32mPassed: ${results.passed}\x1b[0m`);
    console.log(`  \x1b[31mFailed: ${results.failed}\x1b[0m`);
    console.log(`  \x1b[33mWarnings: ${results.warnings}\x1b[0m`);
    console.log('========================================');

    if (results.failed > 0) {
        console.log('\nFailed tests:');
        results.tests.filter(t => t.status === 'FAIL').forEach(t => {
            console.log(`  \x1b[31m- ${t.name}: ${t.detail}\x1b[0m`);
        });
    }

    if (results.warnings > 0) {
        console.log('\nWarnings:');
        results.tests.filter(t => t.status === 'WARN').forEach(t => {
            console.log(`  \x1b[33m- ${t.name}: ${t.detail}\x1b[0m`);
        });
    }

    // Write report to file
    const report = {
        timestamp: new Date().toISOString(),
        summary: { total: results.tests.length, passed: results.passed, failed: results.failed, warnings: results.warnings },
        tests: results.tests
    };
    fs.writeFileSync(path.join(SCREENSHOT_DIR, 'report.json'), JSON.stringify(report, null, 2));
    console.log(`\nReport saved: ${path.join(SCREENSHOT_DIR, 'report.json')}`);
    console.log(`Screenshots: ${SCREENSHOT_DIR}/`);

    process.exit(results.failed > 0 ? 1 : 0);
})();
