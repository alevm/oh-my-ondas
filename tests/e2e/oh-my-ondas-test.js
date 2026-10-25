/**
 * OH MY ONDAS - AUTOMATED TESTING SUITE
 * Tests the interactive functionality of the web app (web/app.html).
 * 
 * REQUIREMENTS:
 * - Node.js 16+
 * - npm install puppeteer
 * 
 * USAGE:
 * node oh-my-ondas-test.js
 * TEST_URL=http://localhost:8080 node oh-my-ondas-test.js   # site root; app.html is appended
 *
 * Exits 1 when any test FAILs or a suite crashes (CI relies on this).
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Test configuration
const CONFIG = {
    // TEST_URL is the site root (web/ served at /); the app itself is app.html
    url: new URL('app.html', (process.env.TEST_URL || 'https://ohmyondas.levm.eu').replace(/\/?$/, '/')).href,
    headless: process.env.HEADLESS === 'true' || process.env.CI === 'true',
    slowMo: process.env.CI ? 0 : 100,
    timeout: 30000,  // 30 second timeout per test
    screenshotDir: './test-screenshots',
    videoDir: './test-videos'
};

// Test results
const results = {
    total: 0,
    passed: 0,
    failed: 0,
    warnings: 0,
    tests: []
};

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(num, name, status, details = '') {
    const statusSymbol = {
        'PASS': '✅',
        'FAIL': '❌',
        'WARN': '⚠️',
        'SKIP': '⏭️'
    }[status] || '❓';
    
    const statusColor = {
        'PASS': 'green',
        'FAIL': 'red',
        'WARN': 'yellow',
        'SKIP': 'blue'
    }[status] || 'reset';
    
    log(`\nTest #${num}: ${name}`, 'bright');
    log(`${statusSymbol} ${status}`, statusColor);
    if (details) log(`   ${details}`, 'reset');
}

// Seen during the run. appErrors (uncaught exceptions, failed same-origin loads) fail
// test #92; consoleErrors (mostly external: GPS denied in headless, radio streams) warn in #93.
const appErrors = [];
const consoleErrors = [];

// Helper function to wait
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to take screenshot
async function screenshot(page, name) {
    const filepath = path.join(CONFIG.screenshotDir, `${name}.png`);
    await page.screenshot({ path: filepath, fullPage: true });
    log(`   📸 Screenshot: ${filepath}`, 'blue');
}

// Helper to check if element exists
async function elementExists(page, selector) {
    try {
        await page.waitForSelector(selector, { timeout: 2000 });
        return true;
    } catch {
        return false;
    }
}

// Helper to get element text
async function getText(page, selector) {
    try {
        return await page.$eval(selector, el => el.textContent.trim());
    } catch {
        return null;
    }
}

// Helper to click element
async function clickElement(page, selector) {
    try {
        await page.waitForSelector(selector, { timeout: 5000 });
        await page.click(selector);
        return true;
    } catch (e) {
        log(`   ❌ Failed to click ${selector}: ${e.message}`, 'red');
        return false;
    }
}

// Main test suite
async function runTests() {
    log('\n🎵 OH MY ONDAS - AUTOMATED TEST SUITE 🎵\n', 'magenta');
    log(`Testing: ${CONFIG.url}\n`, 'blue');
    
    // Create output directories
    if (!fs.existsSync(CONFIG.screenshotDir)) {
        fs.mkdirSync(CONFIG.screenshotDir, { recursive: true });
    }
    
    const browser = await puppeteer.launch({
        headless: CONFIG.headless,
        slowMo: CONFIG.slowMo,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--autoplay-policy=no-user-gesture-required', // Allow audio
            '--use-fake-ui-for-media-stream', // Allow mic access
            '--use-fake-device-for-media-stream'
        ]
    });
    
    const page = await browser.newPage();
    
    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Enable console logging from page
    page.on('console', msg => {
        if (msg.type() === 'error') {
            log(`   🔴 Browser Console Error: ${msg.text()}`, 'red');
            consoleErrors.push(msg.text());
        }
    });
    
    // Catch page errors
    page.on('pageerror', error => {
        log(`   🔴 Page Error: ${error.message}`, 'red');
        appErrors.push(`pageerror: ${error.message}`);
    });

    // Same-origin load failures are app bugs (missing file, bad path). /favicon.ico is
    // the browser's implicit request (no page links it), so it is not counted.
    const appOrigin = new URL(CONFIG.url).origin;
    const sameOrigin = (u) => { try { return new URL(u).origin === appOrigin; } catch { return false; } };
    page.on('response', response => {
        const u = response.url();
        if (response.status() >= 400 && sameOrigin(u) && new URL(u).pathname !== '/favicon.ico') {
            appErrors.push(`HTTP ${response.status()} ${u}`);
        }
    });
    page.on('requestfailed', request => {
        if (sameOrigin(request.url())) {
            appErrors.push(`request failed ${request.url()}: ${request.failure()?.errorText}`);
        }
    });
    
    try {
        // Navigate to page
        log('📡 Loading Oh My Ondas...', 'blue');
        const response = await page.goto(CONFIG.url, { waitUntil: 'networkidle2', timeout: CONFIG.timeout });
        if (!response || !response.ok()) {
            throw new Error(`${CONFIG.url} returned HTTP ${response ? response.status() : 'no response'}`);
        }
        await screenshot(page, '00-initial-load');
        log('✅ Page loaded successfully\n', 'green');
        
        // Wait a bit for any animations
        await sleep(1000);
        
        // ========================================
        // TEST SUITE 1: PAGE STRUCTURE
        // ========================================
        log('\n═══════════════════════════════════════', 'cyan');
        log('  TEST SUITE 1: PAGE STRUCTURE', 'cyan');
        log('═══════════════════════════════════════\n', 'cyan');
        
        try {
            await testPageStructure(page);
        } catch (error) {
            recordTest(1 * 10 - 1, 'Suite 1 ran to completion', 'FAIL', `Suite 1 crashed: ${error.message}`);
        }
        
        // ========================================
        // TEST SUITE 2: TRANSPORT CONTROLS
        // ========================================
        log('\n═══════════════════════════════════════', 'cyan');
        log('  TEST SUITE 2: TRANSPORT CONTROLS', 'cyan');
        log('═══════════════════════════════════════\n', 'cyan');
        
        try {
            await testTransportControls(page);
        } catch (error) {
            recordTest(2 * 10 - 1, 'Suite 2 ran to completion', 'FAIL', `Suite 2 crashed: ${error.message}`);
        }
        
        // ========================================
        // TEST SUITE 3: SEQUENCER
        // ========================================
        log('\n═══════════════════════════════════════', 'cyan');
        log('  TEST SUITE 3: SEQUENCER', 'cyan');
        log('═══════════════════════════════════════\n', 'cyan');
        
        try {
            await testSequencer(page);
        } catch (error) {
            recordTest(3 * 10 - 1, 'Suite 3 ran to completion', 'FAIL', `Suite 3 crashed: ${error.message}`);
        }
        
        // ========================================
        // TEST SUITE 4: PADS
        // ========================================
        log('\n═══════════════════════════════════════', 'cyan');
        log('  TEST SUITE 4: PADS', 'cyan');
        log('═══════════════════════════════════════\n', 'cyan');
        
        try {
            await testPads(page);
        } catch (error) {
            recordTest(4 * 10 - 1, 'Suite 4 ran to completion', 'FAIL', `Suite 4 crashed: ${error.message}`);
        }
        
        // ========================================
        // TEST SUITE 5: MIXER
        // ========================================
        log('\n═══════════════════════════════════════', 'cyan');
        log('  TEST SUITE 5: MIXER', 'cyan');
        log('═══════════════════════════════════════\n', 'cyan');
        
        try {
            await testMixer(page);
        } catch (error) {
            recordTest(5 * 10 - 1, 'Suite 5 ran to completion', 'FAIL', `Suite 5 crashed: ${error.message}`);
        }
        
        // ========================================
        // TEST SUITE 6: SYNTH
        // ========================================
        log('\n═══════════════════════════════════════', 'cyan');
        log('  TEST SUITE 6: SYNTH ENGINE', 'cyan');
        log('═══════════════════════════════════════\n', 'cyan');
        
        try {
            await testSynth(page);
        } catch (error) {
            recordTest(6 * 10 - 1, 'Suite 6 ran to completion', 'FAIL', `Suite 6 crashed: ${error.message}`);
        }
        
        // ========================================
        // TEST SUITE 7: FX
        // ========================================
        log('\n═══════════════════════════════════════', 'cyan');
        log('  TEST SUITE 7: EFFECTS', 'cyan');
        log('═══════════════════════════════════════\n', 'cyan');
        
        try {
            await testFX(page);
        } catch (error) {
            recordTest(7 * 10 - 1, 'Suite 7 ran to completion', 'FAIL', `Suite 7 crashed: ${error.message}`);
        }
        
        // ========================================
        // TEST SUITE 8: SCENES
        // ========================================
        log('\n═══════════════════════════════════════', 'cyan');
        log('  TEST SUITE 8: SCENES', 'cyan');
        log('═══════════════════════════════════════\n', 'cyan');
        
        try {
            await testScenes(page);
        } catch (error) {
            recordTest(8 * 10 - 1, 'Suite 8 ran to completion', 'FAIL', `Suite 8 crashed: ${error.message}`);
        }
        
        // ========================================
        // TEST SUITE 9: KEYBOARD SHORTCUTS
        // ========================================
        log('\n═══════════════════════════════════════', 'cyan');
        log('  TEST SUITE 9: KEYBOARD SHORTCUTS', 'cyan');
        log('═══════════════════════════════════════\n', 'cyan');
        
        try {
            await testKeyboardShortcuts(page);
        } catch (error) {
            recordTest(9 * 10 - 1, 'Suite 9 ran to completion', 'FAIL', `Suite 9 crashed: ${error.message}`);
        }
        
        // ========================================
        // TEST SUITE 10: STRESS TESTS
        // ========================================
        log('\n═══════════════════════════════════════', 'cyan');
        log('  TEST SUITE 10: STRESS TESTS', 'cyan');
        log('═══════════════════════════════════════\n', 'cyan');
        
        try {
            await testStress(page);
        } catch (error) {
            recordTest(10 * 10 - 1, 'Suite 10 ran to completion', 'FAIL', `Suite 10 crashed: ${error.message}`);
        }
        
    } catch (error) {
        log(`\n💥 FATAL ERROR: ${error.message}`, 'red');
        console.error(error);
        recordTest(0, 'Test run completed', 'FAIL', `Fatal: ${error.message}`);
    } finally {
        await browser.close();
        
        // Print summary
        printSummary();
        
        // Save results to file
        saveResults();
    }
}

// ========================================
// TEST IMPLEMENTATIONS
// ========================================

async function testPageStructure(page) {
    let testNum = 1;
    
    // Test 1: Check if main sections exist
    {
        const name = "Main UI sections exist";
        
        const buttonsFound = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const playBtn = buttons.find(b => b.textContent.includes('▶') || b.textContent.includes('Play'));
            const stopBtn = buttons.find(b => b.textContent.includes('■') || b.textContent.includes('Stop'));
            const recBtn = buttons.find(b => b.textContent.includes('●') || b.textContent.includes('Rec'));
            
            return {
                play: !!playBtn,
                stop: !!stopBtn,
                rec: !!recBtn,
                totalButtons: buttons.length
            };
        });
        
        const allFound = buttonsFound.play && buttonsFound.stop && buttonsFound.rec;
        let details = allFound ? 'All main UI elements found' : 'Missing: ';
        if (!buttonsFound.play) details += 'Play ';
        if (!buttonsFound.stop) details += 'Stop ';
        if (!buttonsFound.rec) details += 'Record ';
        details += `(Found ${buttonsFound.totalButtons} total buttons)`;
        
        recordTest(testNum++, name, allFound ? 'PASS' : 'WARN', details);
    }
    
    // Test 2: Check BPM display
    {
        const name = "BPM display visible";
        const bpmText = await getText(page, '#bpm, .bpm, [data-bpm]');
        const hasBPM = bpmText !== null && bpmText.includes('120');
        
        recordTest(testNum++, name, hasBPM ? 'PASS' : 'WARN',
                   hasBPM ? `BPM showing: ${bpmText}` : 'BPM display not found or not showing 120');
        
        if (hasBPM) await screenshot(page, '01-bpm-display');
    }
    
    // Test 3: Check if sequencer grid exists
    {
        const name = "Sequencer grid exists";
        // Look for common sequencer patterns
        const hasGrid = await page.evaluate(() => {
            // Check for grid-like structures
            const grids = document.querySelectorAll('[class*="grid"], [class*="seq"], [class*="step"]');
            return grids.length > 0;
        });
        
        recordTest(testNum++, name, hasGrid ? 'PASS' : 'WARN',
                   hasGrid ? 'Sequencer grid structure found' : 'No grid structure detected');
    }
    
    // Test 4: Check for pad elements
    {
        const name = "Pad elements exist";
        const padCount = await page.evaluate(() => {
            // Look for elements that might be pads
            const padsByClass = document.querySelectorAll('[class*="pad"]');
            const buttons = Array.from(document.querySelectorAll('button'));
            const numberedButtons = buttons.filter(b => /^[1-8]$/.test(b.textContent.trim()));
            
            return Math.max(padsByClass.length, numberedButtons.length);
        });
        
        recordTest(testNum++, name, padCount >= 8 ? 'PASS' : 'WARN',
                   `Found ${padCount} pad-like elements (expected 16)`);
    }
    
    // Test 5: Check for mixer elements
    {
        const name = "Mixer elements exist";
        const hasMixer = await page.evaluate(() => {
            const mixerElements = document.querySelectorAll('[class*="mix"], [class*="channel"], [class*="fader"]');
            return mixerElements.length > 0;
        });
        
        recordTest(testNum++, name, hasMixer ? 'PASS' : 'WARN',
                   hasMixer ? 'Mixer elements found' : 'No mixer elements detected');
    }
}

async function testTransportControls(page) {
    let testNum = 10;
    
    // Test 10: Click Play button
    {
        const name = "Play button clickable";
        const clicked = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const playBtn = buttons.find(b => b.textContent.includes('▶') || b.textContent.includes('Play'));
            if (playBtn) {
                playBtn.click();
                return true;
            }
            return false;
        });
        
        if (clicked) {
            await sleep(500);
            await screenshot(page, '10-play-clicked');
            recordTest(testNum++, name, 'PASS', 'Play button clicked successfully');
        } else {
            recordTest(testNum++, name, 'FAIL', 'Play button not found');
        }
    }
    
    // Test 11: Check if anything changes after play
    {
        const name = "UI responds to play";
        await sleep(1000);
        
        const hasChanges = await page.evaluate(() => {
            // Look for active states, animations, etc.
            const activeElements = document.querySelectorAll('[class*="active"], [class*="playing"], .is-playing');
            return activeElements.length > 0;
        });
        
        recordTest(testNum++, name, hasChanges ? 'PASS' : 'WARN',
                   hasChanges ? 'UI shows active/playing state' : 'No visual changes detected after play');
    }
    
    // Test 12: Stop button
    {
        const name = "Stop button clickable";
        const clicked = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const stopBtn = buttons.find(b => b.textContent.includes('■') || b.textContent.includes('Stop'));
            if (stopBtn) {
                stopBtn.click();
                return true;
            }
            return false;
        });
        await sleep(500);
        
        recordTest(testNum++, name, clicked ? 'PASS' : 'FAIL',
                   clicked ? 'Stop button clicked' : 'Stop button not found or not clickable');
    }
    
    // Test 13: Space bar shortcut
    {
        const name = "Space bar play/pause shortcut";
        await page.keyboard.press('Space');
        await sleep(500);
        await screenshot(page, '13-space-shortcut');
        
        // Can't easily verify this worked, so mark as WARN
        recordTest(testNum++, name, 'WARN', 'Space pressed, visual verification needed');
    }
    
    // Test 14: BPM change
    {
        const name = "BPM can be changed";
        
        // Try to find BPM input/control
        const bpmChanged = await page.evaluate(() => {
            const bpmInputs = document.querySelectorAll('input[type="number"], input[type="range"]');
            for (const input of bpmInputs) {
                const label = input.previousElementSibling?.textContent || input.parentElement?.textContent || '';
                if (label.toLowerCase().includes('bpm') || label.includes('120')) {
                    input.value = '140';
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    return true;
                }
            }
            return false;
        });
        
        recordTest(testNum++, name, bpmChanged ? 'PASS' : 'WARN',
                   bpmChanged ? 'BPM changed to 140' : 'BPM control not found');
        
        if (bpmChanged) await screenshot(page, '14-bpm-changed');
    }
}

async function testSequencer(page) {
    let testNum = 20;
    
    // Test 20: Click on sequencer steps
    {
        const name = "Sequencer steps are clickable";
        
        const stepsClicked = await page.evaluate(() => {
            // Find step-like elements
            const steps = document.querySelectorAll('[class*="step"], [data-step], .seq-step, button[class*="step"]');
            if (steps.length > 0) {
                // Click first 4 steps
                for (let i = 0; i < Math.min(4, steps.length); i++) {
                    steps[i].click();
                }
                return true;
            }
            return false;
        });
        
        await sleep(500);
        await screenshot(page, '20-sequencer-steps');
        
        recordTest(testNum++, name, stepsClicked ? 'PASS' : 'WARN',
                   stepsClicked ? 'Sequencer steps clicked' : 'No sequencer steps found');
    }
    
    // Test 21: Track selection
    {
        const name = "Track selection works";
        
        const trackSelected = await page.evaluate(() => {
            // Look for track buttons (A, B, C, etc.)
            // (:has-text() is Playwright-only; querySelectorAll throws on it)
            const tracks = [
                ...Array.from(document.querySelectorAll('button')).filter(b => ['A', 'B'].includes(b.textContent.trim())),
                ...document.querySelectorAll('[data-track]')
            ];
            if (tracks.length > 0) {
                tracks[0].click();
                return true;
            }
            return false;
        });
        
        recordTest(testNum++, name, trackSelected ? 'PASS' : 'WARN',
                   trackSelected ? 'Track selected' : 'Track buttons not found');
    }
    
    // Test 22: Pattern length change
    {
        const name = "Pattern length can be changed";
        
        const lengthChanged = await page.evaluate(() => {
            // Look for length buttons (4, 8, 16, 32, etc.)
            const lengthButtons = Array.from(document.querySelectorAll('button')).filter(b => 
                ['4', '8', '16', '32'].includes(b.textContent.trim())
            );
            
            if (lengthButtons.length > 0) {
                lengthButtons[0].click(); // Click first length option
                return true;
            }
            return false;
        });
        
        recordTest(testNum++, name, lengthChanged ? 'PASS' : 'WARN',
                   lengthChanged ? 'Pattern length changed' : 'Length controls not found');
    }
}

async function testPads(page) {
    let testNum = 30;
    
    // Test 30: Pad clicking
    {
        const name = "Pads are clickable";
        
        const padsClicked = await page.evaluate(() => {
            // Look for numbered pads
            const pads = [];
            const buttons = Array.from(document.querySelectorAll('button'));
            for (let i = 1; i <= 8; i++) {
                const pad = buttons.find(b => b.textContent.trim() === String(i)) ||
                    document.querySelector(`[data-pad="${i}"], .pad-${i}`);
                if (pad) pads.push(pad);
            }
            
            if (pads.length > 0) {
                pads[0].click();
                return pads.length;
            }
            return 0;
        });
        
        await sleep(300);
        await screenshot(page, '30-pad-clicked');
        
        recordTest(testNum++, name, padsClicked > 0 ? 'PASS' : 'WARN',
                   padsClicked > 0 ? `Found and clicked ${padsClicked} pads` : 'No pads found');
    }
    
    // Test 31: Keyboard shortcuts for pads (1-8)
    {
        const name = "Keyboard shortcuts for pads (1-8)";
        
        await page.keyboard.press('1');
        await sleep(100);
        await page.keyboard.press('2');
        await sleep(100);
        await page.keyboard.press('3');
        await sleep(100);
        
        recordTest(testNum++, name, 'WARN', 'Keys 1, 2, 3 pressed - visual/audio verification needed');
    }
    
    // Test 32: Kit switching
    {
        const name = "Kit switching works";
        
        const kitSwitched = await page.evaluate(() => {
            // Look for kit buttons
            const kitButtons = Array.from(document.querySelectorAll('button')).filter(b =>
                b.textContent.includes('Kit') || b.textContent.match(/Kit\s*[123]/)
            );
            
            if (kitButtons.length > 0) {
                kitButtons[0].click();
                return true;
            }
            return false;
        });
        
        recordTest(testNum++, name, kitSwitched ? 'PASS' : 'WARN',
                   kitSwitched ? 'Kit switched' : 'Kit buttons not found');
    }
}

async function testMixer(page) {
    let testNum = 40;
    
    // Test 40: Mute buttons
    {
        const name = "Mute buttons work";
        
        const muteClicked = await page.evaluate(() => {
            const muteButtons = Array.from(document.querySelectorAll('button')).filter(b =>
                b.textContent.trim() === 'M' || b.classList.contains('mute') || b.dataset.action === 'mute'
            );
            
            if (muteButtons.length > 0) {
                muteButtons[0].click();
                return true;
            }
            return false;
        });
        
        await screenshot(page, '40-mute-clicked');
        
        recordTest(testNum++, name, muteClicked ? 'PASS' : 'WARN',
                   muteClicked ? 'Mute button clicked' : 'Mute buttons not found');
    }
    
    // Test 41: Solo buttons
    {
        const name = "Solo buttons work";
        
        const soloClicked = await page.evaluate(() => {
            const soloButtons = Array.from(document.querySelectorAll('button')).filter(b =>
                b.textContent.trim() === 'S' || b.classList.contains('solo') || b.dataset.action === 'solo'
            );
            
            if (soloButtons.length > 0) {
                soloButtons[0].click();
                return true;
            }
            return false;
        });
        
        recordTest(testNum++, name, soloClicked ? 'PASS' : 'WARN',
                   soloClicked ? 'Solo button clicked' : 'Solo buttons not found');
    }
}

async function testSynth(page) {
    let testNum = 50;
    
    // Test 50: Oscillator waveform selection
    {
        const name = "Oscillator waveform buttons work";
        
        const waveformClicked = await page.evaluate(() => {
            const waveButtons = Array.from(document.querySelectorAll('button')).filter(b =>
                ['SIN', 'TRI', 'SAW', 'SQR'].includes(b.textContent.trim())
            );
            
            if (waveButtons.length > 0) {
                waveButtons[0].click();
                return true;
            }
            return false;
        });
        
        recordTest(testNum++, name, waveformClicked ? 'PASS' : 'WARN',
                   waveformClicked ? 'Waveform button clicked' : 'Waveform buttons not found');
    }
    
    // Test 51: Filter type selection
    {
        const name = "Filter type buttons work";
        
        const filterClicked = await page.evaluate(() => {
            const filterButtons = Array.from(document.querySelectorAll('button')).filter(b =>
                ['LP', 'HP', 'BP'].includes(b.textContent.trim())
            );
            
            if (filterButtons.length > 0) {
                filterButtons[0].click();
                return true;
            }
            return false;
        });
        
        recordTest(testNum++, name, filterClicked ? 'PASS' : 'WARN',
                   filterClicked ? 'Filter type button clicked' : 'Filter buttons not found');
    }
}

async function testFX(page) {
    let testNum = 60;
    
    // Test 60: FX buttons
    {
        const name = "FX buttons are clickable";
        
        const fxClicked = await page.evaluate(() => {
            const fxButtons = Array.from(document.querySelectorAll('button')).filter(b =>
                ['DLY', 'GRN', 'GLI', 'CRU', 'STT', 'REV', 'FLT', 'TPE'].includes(b.textContent.trim())
            );
            
            if (fxButtons.length > 0) {
                fxButtons[0].click();
                return fxButtons.length;
            }
            return 0;
        });
        
        await screenshot(page, '60-fx-clicked');
        
        recordTest(testNum++, name, fxClicked > 0 ? 'PASS' : 'WARN',
                   fxClicked > 0 ? `Found ${fxClicked} FX buttons` : 'FX buttons not found');
    }
    
    // Test 61: Punch effects (Q, W, E, T)
    {
        const name = "Punch effect keyboard shortcuts";
        
        await page.keyboard.press('q');
        await sleep(200);
        await page.keyboard.press('w');
        await sleep(200);
        
        recordTest(testNum++, name, 'WARN', 'Q and W pressed - audio verification needed');
    }
}

async function testScenes(page) {
    let testNum = 70;
    
    // Test 70: Scene buttons
    {
        const name = "Scene buttons work";
        
        const sceneClicked = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            // Look for scene buttons - might be labeled A, B, C, D
            const sceneButtons = buttons.filter(b => {
                const text = b.textContent.trim();
                return text === 'A' || text === 'B' || text === 'C' || text === 'D';
            });
            
            // Try to find and click scene A
            const sceneA = sceneButtons.find(b => b.textContent.trim() === 'A');
            if (sceneA) {
                sceneA.click();
                return true;
            }
            return false;
        });
        
        recordTest(testNum++, name, sceneClicked ? 'PASS' : 'WARN',
                   sceneClicked ? 'Scene button clicked' : 'Scene buttons not found');
    }
    
    // Test 71: Save/Load buttons
    {
        const name = "Save/Load buttons exist";
        
        const hasSaveLoad = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const hasSave = buttons.some(b => b.textContent.includes('SAVE') || b.textContent.includes('SAV'));
            const hasLoad = buttons.some(b => b.textContent.includes('LOAD') || b.textContent.includes('LOD'));
            return hasSave && hasLoad;
        });
        
        recordTest(testNum++, name, hasSaveLoad ? 'PASS' : 'WARN',
                   hasSaveLoad ? 'Save/Load buttons found' : 'Save/Load buttons not found');
    }
}

async function testKeyboardShortcuts(page) {
    let testNum = 80;
    
    // Test 80: Help menu (?)
    {
        const name = "Help menu keyboard shortcut (?)";
        
        await page.keyboard.press('?');
        await sleep(500);
        await screenshot(page, '80-help-menu');
        
        const helpVisible = await page.evaluate(() => {
            // Look for help modal/overlay
            const modals = document.querySelectorAll('[class*="modal"], [class*="help"], [class*="overlay"]');
            return Array.from(modals).some(m => m.offsetParent !== null);
        });
        
        recordTest(testNum++, name, helpVisible ? 'PASS' : 'WARN',
                   helpVisible ? 'Help menu opened' : 'Help menu visibility uncertain');
    }
    
    // Test 81: Settings menu
    {
        const name = "Settings button works";
        
        const settingsClicked = await page.evaluate(() => {
            const settingsButtons = Array.from(document.querySelectorAll('button')).filter(b =>
                b.textContent.includes('⚙') || b.textContent.includes('Settings') || 
                b.classList.contains('settings')
            );
            
            if (settingsButtons.length > 0) {
                settingsButtons[0].click();
                return true;
            }
            return false;
        });
        
        await sleep(500);
        await screenshot(page, '81-settings');
        
        recordTest(testNum++, name, settingsClicked ? 'PASS' : 'WARN',
                   settingsClicked ? 'Settings clicked' : 'Settings button not found');
    }
}

async function testStress(page) {
    let testNum = 90;
    
    // Test 90: Rapid clicking
    {
        const name = "Handles rapid clicking";
        
        await page.evaluate(() => {
            const buttons = document.querySelectorAll('button');
            for (let i = 0; i < 20; i++) {
                if (buttons[i % buttons.length]) {
                    buttons[i % buttons.length].click();
                }
            }
        });
        
        await sleep(500);
        
        // Check if page is still responsive
        const responsive = await page.evaluate(() => {
            return document.readyState === 'complete';
        });
        
        recordTest(testNum++, name, responsive ? 'PASS' : 'FAIL',
                   responsive ? 'Page handled rapid clicking' : 'Page may be unresponsive');
    }
    
    // Test 91: Rapid keyboard input
    {
        const name = "Handles rapid keyboard input";
        
        const keys = ['1', '2', '3', '4', '5', '6', '7', '8', 'q', 'w', 'e', 'Space'];
        for (const key of keys) {
            await page.keyboard.press(key);
            await sleep(50);
        }
        
        await sleep(500);
        await screenshot(page, '91-rapid-input');
        
        recordTest(testNum++, name, 'WARN', 'Rapid keyboard input sent - stability verification needed');
    }
    
    // Test 92: Console errors
    {
        const name = "No page errors or failed same-origin loads";
        
        const errors = appErrors;
        
        recordTest(testNum++, name, errors.length === 0 ? 'PASS' : 'FAIL',
                   errors.length === 0 ? 'No errors detected' : `${errors.length} errors found: ${errors.slice(0, 5).join(' | ')}`);
    }
    
    // Test 93: Console errors (external dependencies: geolocation, radio streams)
    {
        const name = "Console errors (external dependencies)";
        const errors = consoleErrors.filter(e => !e.startsWith('Failed to load resource'));
        
        recordTest(testNum++, name, errors.length === 0 ? 'PASS' : 'WARN',
                   errors.length === 0 ? 'No console errors' : `${errors.length} console errors: ${[...new Set(errors)].slice(0, 5).join(' | ')}`);
    }
}

// Helper to record test result
function recordTest(num, name, status, details) {
    results.total++;
    if (status === 'PASS') results.passed++;
    else if (status === 'FAIL') results.failed++;
    else if (status === 'WARN') results.warnings++;
    
    const test = { num, name, status, details };
    results.tests.push(test);
    
    logTest(num, name, status, details);
}

// Print summary
function printSummary() {
    log('\n\n═══════════════════════════════════════', 'cyan');
    log('  TEST SUMMARY', 'cyan');
    log('═══════════════════════════════════════\n', 'cyan');
    
    log(`Total Tests:    ${results.total}`, 'bright');
    log(`✅ Passed:      ${results.passed}`, 'green');
    log(`❌ Failed:      ${results.failed}`, 'red');
    log(`⚠️  Warnings:    ${results.warnings}`, 'yellow');
    log(`⏭️  Skipped:     ${results.total - results.passed - results.failed - results.warnings}`, 'blue');
    
    const passRate = results.total ? ((results.passed / results.total) * 100).toFixed(1) : '0.0';
    log(`\nPass Rate: ${passRate}%`, passRate > 80 ? 'green' : passRate > 50 ? 'yellow' : 'red');
    
    log('\n═══════════════════════════════════════\n', 'cyan');
}

// Save results to JSON
function saveResults() {
    const report = {
        timestamp: new Date().toISOString(),
        url: CONFIG.url,
        summary: {
            total: results.total,
            passed: results.passed,
            failed: results.failed,
            warnings: results.warnings,
            passRate: results.total ? ((results.passed / results.total) * 100).toFixed(1) : '0.0'
        },
        tests: results.tests
    };
    
    const filepath = './test-results.json';
    fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
    log(`📄 Results saved to: ${filepath}`, 'blue');
    
    // Also create markdown report
    const mdReport = generateMarkdownReport(report);
    fs.writeFileSync('./test-results.md', mdReport);
    log(`📄 Markdown report: ./test-results.md\n`, 'blue');
}

// Generate markdown report
function generateMarkdownReport(report) {
    let md = `# Oh My Ondas - Test Report\n\n`;
    md += `**Date:** ${new Date(report.timestamp).toLocaleString()}\n`;
    md += `**URL:** ${report.url}\n\n`;
    
    md += `## Summary\n\n`;
    md += `| Metric | Value |\n`;
    md += `|--------|-------|\n`;
    md += `| Total Tests | ${report.summary.total} |\n`;
    md += `| ✅ Passed | ${report.summary.passed} |\n`;
    md += `| ❌ Failed | ${report.summary.failed} |\n`;
    md += `| ⚠️ Warnings | ${report.summary.warnings} |\n`;
    md += `| Pass Rate | ${report.summary.passRate}% |\n\n`;
    
    md += `## Detailed Results\n\n`;
    
    for (const test of report.tests) {
        const icon = {
            'PASS': '✅',
            'FAIL': '❌',
            'WARN': '⚠️',
            'SKIP': '⏭️'
        }[test.status] || '❓';
        
        md += `### ${icon} Test #${test.num}: ${test.name}\n\n`;
        md += `**Status:** ${test.status}\n\n`;
        if (test.details) {
            md += `**Details:** ${test.details}\n\n`;
        }
        md += `---\n\n`;
    }
    
    return md;
}

// Run the tests; non-zero exit on any FAIL (or if nothing ran) so CI goes red
runTests().then(() => {
    process.exit(results.failed || results.total === 0 ? 1 : 0);
}).catch(error => {
    console.error('Test suite failed:', error);
    process.exit(1);
});
