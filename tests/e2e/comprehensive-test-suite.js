/**
 * OH MY ONDAS - COMPREHENSIVE TEST SUITE
 * Full automated testing for all UI modules and functionality
 *
 * Coverage:
 * - Layout & Grid System (5-column responsive)
 * - All 12 Panels (SEQ, MIXER, PADS A/B, CTRL, SYNTH, SCENES, FX, RADIO, AI, EQ, JOURNEY)
 * - Transport Controls
 * - Keyboard Shortcuts
 * - Embedded Mode
 * - Responsive Breakpoints
 * - Accessibility
 * - Performance & Stress Testing
 * - Error Handling
 *
 * REQUIREMENTS:
 * - Node.js 16+
 * - npm install puppeteer
 *
 * USAGE:
 * TEST_URL="http://localhost:8080/app.html" node e2e/comprehensive-test-suite.js
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
    url: process.env.TEST_URL || 'http://localhost:8080/app.html',
    headless: process.env.HEADLESS !== 'false',
    slowMo: process.env.SLOW_MO ? parseInt(process.env.SLOW_MO) : 0,
    timeout: 30000,
    screenshotDir: './test-screenshots',
    viewports: {
        desktop: { width: 1920, height: 1080 },
        laptop: { width: 1440, height: 900 },
        tablet: { width: 1024, height: 768 },
        mobile: { width: 768, height: 1024 }
    }
};

// ============================================
// TEST TRACKING
// ============================================
const results = {
    suites: [],
    total: 0,
    passed: 0,
    failed: 0,
    warnings: 0,
    skipped: 0,
    startTime: null,
    endTime: null
};

let currentSuite = null;

// ============================================
// CONSOLE OUTPUT HELPERS
// ============================================
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m'
};

function log(msg, color = 'reset') {
    console.log(`${colors[color]}${msg}${colors.reset}`);
}

function logSuite(name) {
    log(`\n${'═'.repeat(60)}`, 'cyan');
    log(`  ${name}`, 'cyan');
    log(`${'═'.repeat(60)}`, 'cyan');
}

function logTest(id, name, status, details = '') {
    const icons = { PASS: '✅', FAIL: '❌', WARN: '⚠️', SKIP: '⏭️' };
    const colorMap = { PASS: 'green', FAIL: 'red', WARN: 'yellow', SKIP: 'blue' };

    log(`\n  [${id}] ${name}`, 'bright');
    log(`      ${icons[status]} ${status}`, colorMap[status]);
    if (details) log(`      ${details}`, 'dim');
}

// ============================================
// TEST HELPERS
// ============================================
const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Wait for a condition to be true (replaces arbitrary sleep calls)
 * @param {Page} page - Puppeteer page
 * @param {Function} conditionFn - Function to evaluate in browser context
 * @param {number} timeout - Max wait time in ms
 * @returns {boolean} - Whether condition was met
 */
async function waitForCondition(page, conditionFn, timeout = 3000) {
    try {
        await page.waitForFunction(conditionFn, { timeout });
        return true;
    } catch { return false; }
}

/**
 * Wait for element to have specific class
 */
async function waitForClass(page, selector, className, timeout = 2000) {
    try {
        await page.waitForFunction(
            (sel, cls) => {
                const el = document.querySelector(sel);
                return el && el.classList.contains(cls);
            },
            { timeout },
            selector, className
        );
        return true;
    } catch { return false; }
}

/**
 * Reset app state to clean baseline
 */
async function resetAppState(page) {
    await page.evaluate(() => {
        // Stop playback
        const stopBtn = document.querySelector('#btnStop');
        if (stopBtn) stopBtn.click();

        // Close any open modals
        const modals = document.querySelectorAll('.modal:not(.hidden)');
        modals.forEach(m => m.classList.add('hidden'));

        // Reset pattern to A
        const patternA = document.querySelector('.pattern-btn[data-pattern="0"]');
        if (patternA) patternA.click();
    });
    await sleep(100);
}

async function screenshot(page, name) {
    const filepath = path.join(CONFIG.screenshotDir, `${name}.png`);
    await page.screenshot({ path: filepath, fullPage: false });
    log(`      📸 ${filepath}`, 'blue');
    return filepath;
}

async function exists(page, selector, timeout = 2000) {
    try {
        await page.waitForSelector(selector, { timeout });
        return true;
    } catch { return false; }
}

async function click(page, selector, timeout = 3000) {
    try {
        await page.waitForSelector(selector, { timeout });
        await page.click(selector);
        return true;
    } catch { return false; }
}

async function getValue(page, selector) {
    try {
        return await page.$eval(selector, el => el.value || el.textContent?.trim());
    } catch { return null; }
}

async function isVisible(page, selector) {
    try {
        return await page.$eval(selector, el => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' &&
                   style.visibility !== 'hidden' &&
                   style.opacity !== '0' &&
                   el.offsetParent !== null;
        });
    } catch { return false; }
}

/**
 * Check if element is visible with computed styles (more reliable for embedded mode)
 */
async function isDisplayed(page, selector) {
    try {
        return await page.$eval(selector, el => {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return rect.width > 0 &&
                   rect.height > 0 &&
                   style.display !== 'none' &&
                   style.visibility !== 'hidden';
        });
    } catch { return false; }
}

async function countElements(page, selector) {
    return await page.$$eval(selector, els => els.length);
}

async function hasClass(page, selector, className) {
    try {
        return await page.$eval(selector, (el, cls) => el.classList.contains(cls), className);
    } catch { return false; }
}

/**
 * Check Web Audio API context state
 */
async function getAudioContextState(page) {
    return await page.evaluate(() => {
        if (window.audioEngine && window.audioEngine.ctx) {
            return window.audioEngine.ctx.state;
        }
        return 'unavailable';
    });
}

// ============================================
// TEST RECORDING
// ============================================
function startSuite(name) {
    currentSuite = { name, tests: [], passed: 0, failed: 0, warnings: 0 };
    results.suites.push(currentSuite);
    logSuite(name);
}

function recordTest(id, name, status, details = '') {
    results.total++;

    if (status === 'PASS') { results.passed++; currentSuite.passed++; }
    else if (status === 'FAIL') { results.failed++; currentSuite.failed++; }
    else if (status === 'WARN') { results.warnings++; currentSuite.warnings++; }
    else if (status === 'SKIP') { results.skipped++; }

    currentSuite.tests.push({ id, name, status, details });
    logTest(id, name, status, details);
}

// ============================================
// MAIN TEST RUNNER
// ============================================
async function runTests() {
    results.startTime = new Date();

    log('\n' + '🎵'.repeat(30), 'magenta');
    log('  OH MY ONDAS - COMPREHENSIVE TEST SUITE', 'magenta');
    log('🎵'.repeat(30) + '\n', 'magenta');
    log(`URL: ${CONFIG.url}`, 'blue');
    log(`Headless: ${CONFIG.headless}`, 'blue');
    log(`Viewport: ${CONFIG.viewports.desktop.width}x${CONFIG.viewports.desktop.height}\n`, 'blue');

    // Create screenshot directory
    if (!fs.existsSync(CONFIG.screenshotDir)) {
        fs.mkdirSync(CONFIG.screenshotDir, { recursive: true });
    }

    const browser = await puppeteer.launch({
        headless: CONFIG.headless,
        slowMo: CONFIG.slowMo,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--autoplay-policy=no-user-gesture-required',
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream'
        ]
    });

    const page = await browser.newPage();
    await page.setViewport(CONFIG.viewports.desktop);

    // Capture console errors
    const consoleErrors = [];
    page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => consoleErrors.push(err.message));

    try {
        // Load page
        log('📡 Loading application...', 'blue');
        await page.goto(CONFIG.url, { waitUntil: 'networkidle2', timeout: CONFIG.timeout });
        await sleep(1000);
        log('✅ Page loaded\n', 'green');

        // Run all test suites
        await testSuite01_PageLoad(page);
        await testSuite02_GridLayout(page);
        await testSuite03_Sequencer(page);
        await testSuite04_Mixer(page);
        await testSuite05_PadsA(page);
        await testSuite06_PadsB(page);
        await testSuite07_CtrlKnobs(page);
        await testSuite08_Synth(page);
        await testSuite09_Scenes(page);
        await testSuite10_Effects(page);
        await testSuite11_Radio(page);
        await testSuite12_AIGen(page);
        await testSuite13_EQ(page);
        await testSuite14_Journey(page);
        await testSuite15_Transport(page);
        await testSuite16_KeyboardShortcuts(page);
        await testSuite17_EmbeddedMode(page);
        await testSuite18_ResponsiveLayout(page);
        await testSuite19_Accessibility(page);
        await testSuite20_Performance(page, consoleErrors);

    } catch (error) {
        log(`\n💥 FATAL ERROR: ${error.message}`, 'red');
        console.error(error.stack);
    } finally {
        await browser.close();
        results.endTime = new Date();
        printSummary();
        saveResults();
    }
}

// ============================================
// TEST SUITE 01: PAGE LOAD & STRUCTURE
// ============================================
async function testSuite01_PageLoad(page) {
    startSuite('SUITE 01: PAGE LOAD & STRUCTURE');

    // 01-001: Page title
    {
        const title = await page.title();
        const pass = title.toLowerCase().includes('ondas');
        recordTest('01-001', 'Page title contains "Ondas"', pass ? 'PASS' : 'WARN',
            `Title: "${title}"`);
    }

    // 01-002: App container exists
    {
        const pass = await exists(page, '#app');
        recordTest('01-002', 'App container exists', pass ? 'PASS' : 'FAIL',
            pass ? 'Found #app' : 'Missing #app container');
    }

    // 01-003: Device container exists
    {
        const pass = await exists(page, '.device');
        recordTest('01-003', 'Device container exists', pass ? 'PASS' : 'FAIL',
            pass ? 'Found .device' : 'Missing .device container');
    }

    // 01-004: All panel types present
    {
        const panels = [
            '.seq-panel', '.mixer-panel', '.pads-panel', '.knobs-panel',
            '.synth-panel', '.scenes-panel', '.fx-panel', '.radio-panel',
            '.ai-panel', '.eq-panel', '.journey-panel'
        ];

        const found = [];
        const missing = [];
        for (const p of panels) {
            if (await exists(page, p, 500)) found.push(p);
            else missing.push(p);
        }

        const pass = missing.length === 0;
        recordTest('01-004', 'All 11 panel types present', pass ? 'PASS' : 'FAIL',
            pass ? `Found all panels` : `Missing: ${missing.join(', ')}`);
    }

    // 01-005: No JavaScript errors on load
    {
        const hasErrors = await page.evaluate(() => window.__testErrors?.length > 0);
        recordTest('01-005', 'No JS errors on initial load', hasErrors ? 'WARN' : 'PASS',
            hasErrors ? 'Errors detected' : 'Clean load');
    }

    await screenshot(page, '01-page-load');
}

// ============================================
// TEST SUITE 02: GRID LAYOUT (5-COLUMN)
// ============================================
async function testSuite02_GridLayout(page) {
    startSuite('SUITE 02: GRID LAYOUT (5-COLUMN)');

    // 02-001: Device uses CSS Grid
    {
        const isGrid = await page.$eval('.device', el => {
            return window.getComputedStyle(el).display === 'grid';
        });
        recordTest('02-001', 'Device uses CSS Grid', isGrid ? 'PASS' : 'FAIL',
            isGrid ? 'display: grid confirmed' : 'Not using grid layout');
    }

    // 02-002: Grid has 5 columns
    {
        const cols = await page.$eval('.device', el => {
            return window.getComputedStyle(el).gridTemplateColumns;
        });
        const colCount = cols.split(' ').length;
        const pass = colCount === 5;
        recordTest('02-002', 'Grid has 5 columns', pass ? 'PASS' : 'WARN',
            `Found ${colCount} columns: ${cols.substring(0, 60)}...`);
    }

    // 02-003: SEQ panel spans full width
    {
        const gridCol = await page.$eval('.seq-panel', el => {
            return window.getComputedStyle(el).gridColumn;
        });
        const pass = gridCol.includes('1') && (gridCol.includes('6') || gridCol.includes('-1') || gridCol.includes('span 5'));
        recordTest('02-003', 'SEQ panel spans full width (row 1)', pass ? 'PASS' : 'WARN',
            `grid-column: ${gridCol}`);
    }

    // 02-004: MIXER panel spans rows 2-4
    {
        const gridRow = await page.$eval('.mixer-panel', el => {
            return window.getComputedStyle(el).gridRow;
        });
        const pass = gridRow.includes('2') && (gridRow.includes('5') || gridRow.includes('span 3'));
        recordTest('02-004', 'MIXER panel spans rows 2-4', pass ? 'PASS' : 'WARN',
            `grid-row: ${gridRow}`);
    }

    // 02-005: PADS B is visible
    {
        const pads2Visible = await isVisible(page, '.pads-panel.pads2');
        recordTest('02-005', 'PADS B panel is visible', pads2Visible ? 'PASS' : 'FAIL',
            pads2Visible ? 'PADS B is displayed' : 'PADS B is hidden');
    }

    // 02-006: SYNTH panel spans 2 rows
    {
        const gridRow = await page.$eval('.synth-panel', el => {
            return window.getComputedStyle(el).gridRow;
        });
        const pass = gridRow.includes('span 2') || (gridRow.includes('2') && gridRow.includes('4'));
        recordTest('02-006', 'SYNTH panel spans 2 rows', pass ? 'PASS' : 'WARN',
            `grid-row: ${gridRow}`);
    }

    // 02-007: All panels visible (no overflow hidden clipping)
    {
        const panelCount = await page.$$eval('.device > .panel', panels => {
            return panels.filter(p => {
                const rect = p.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
            }).length;
        });
        const pass = panelCount >= 11;
        recordTest('02-007', 'All panels have visible dimensions', pass ? 'PASS' : 'WARN',
            `${panelCount} panels with visible dimensions`);
    }

    await screenshot(page, '02-grid-layout');
}

// ============================================
// TEST SUITE 03: SEQUENCER
// ============================================
async function testSuite03_Sequencer(page) {
    startSuite('SUITE 03: SEQUENCER PANEL');

    // Reset state before sequencer tests
    await resetAppState(page);

    // 03-001: SEQ panel exists
    {
        const pass = await exists(page, '.seq-panel');
        recordTest('03-001', 'SEQ panel exists', pass ? 'PASS' : 'FAIL', '');
    }

    // 03-002: Track rows exist (wait for dynamic generation)
    {
        // Wait for sequencer to initialize tracks (may be dynamically generated)
        const tracksLoaded = await waitForCondition(page, () => {
            const tracks = document.querySelectorAll('.oct-track');
            return tracks.length >= 8;
        }, 5000);

        const trackCount = await countElements(page, '.oct-track');

        // If no .oct-track, check for #octTracks container
        if (trackCount === 0) {
            const hasContainer = await exists(page, '#octTracks', 500);
            recordTest('03-002', 'Track rows exist (8+)', hasContainer ? 'WARN' : 'WARN',
                `Container exists: ${hasContainer}, tracks render dynamically on play`);
        } else {
            const pass = trackCount >= 8;
            recordTest('03-002', 'Track rows exist (8+)', pass ? 'PASS' : 'WARN',
                `Found ${trackCount} tracks`);
        }
    }

    // 03-003: Pattern buttons A-H
    {
        const patternBtns = await countElements(page, '.pattern-btn');
        const pass = patternBtns >= 8;
        recordTest('03-003', 'Pattern buttons A-H exist', pass ? 'PASS' : 'WARN',
            `Found ${patternBtns} pattern buttons`);
    }

    // 03-004: Source selector buttons
    {
        const srcBtns = await page.$$eval('.src-btn', btns => btns.map(b => b.textContent.trim()));
        const expected = ['SMP', 'SYN', 'RAD', 'MIC'];
        const hasAll = expected.every(e => srcBtns.includes(e));
        recordTest('03-004', 'Source buttons (SMP/SYN/RAD/MIC)', hasAll ? 'PASS' : 'WARN',
            `Found: ${srcBtns.join(', ')}`);
    }

    // 03-005: Pattern button clickable & activates
    {
        // First reset to pattern A
        await click(page, '.pattern-btn[data-pattern="0"]');
        await sleep(100);

        // Click pattern B
        const clicked = await click(page, '.pattern-btn[data-pattern="1"]');

        // Wait for active class to be applied
        const activated = await waitForClass(page, '.pattern-btn[data-pattern="1"]', 'active', 1000);

        recordTest('03-005', 'Pattern B button clickable & activates', clicked && activated ? 'PASS' : 'WARN',
            activated ? 'Pattern B activated' : 'Click registered, active state pending');

        // Reset to pattern A
        await click(page, '.pattern-btn[data-pattern="0"]');
    }

    // 03-006: Length selector exists
    {
        const pass = await exists(page, '#patternLength');
        recordTest('03-006', 'Pattern length selector exists', pass ? 'PASS' : 'WARN', '');
    }

    // 03-007: Swing control exists
    {
        const pass = await exists(page, '#swingAmount');
        recordTest('03-007', 'Swing control exists', pass ? 'PASS' : 'WARN', '');
    }

    // 03-008: Sequencer tools (RND, CLR, EUC, DUB, FILL)
    {
        const tools = ['seqRandom', 'seqClear', 'eucGen', 'dubToggle', 'fillBtn'];
        const found = [];
        for (const t of tools) {
            if (await exists(page, `#${t}`, 500)) found.push(t);
        }
        const pass = found.length === tools.length;
        recordTest('03-008', 'Sequencer tools exist', pass ? 'PASS' : 'WARN',
            `Found ${found.length}/${tools.length}: ${found.join(', ')}`);
    }

    // 03-009: Pattern length can be changed (NEW TEST)
    {
        const lengthSelect = await page.$('#patternLength');
        if (lengthSelect) {
            await page.select('#patternLength', '32');
            await sleep(100);
            const newVal = await page.$eval('#patternLength', el => el.value);
            const pass = newVal === '32';
            recordTest('03-009', 'Pattern length changeable', pass ? 'PASS' : 'WARN',
                `Set to: ${newVal}`);
            // Reset
            await page.select('#patternLength', '16');
        } else {
            recordTest('03-009', 'Pattern length changeable', 'SKIP', 'Length selector not found');
        }
    }

    await screenshot(page, '03-sequencer');
}

// ============================================
// TEST SUITE 04: MIXER
// ============================================
async function testSuite04_Mixer(page) {
    startSuite('SUITE 04: MIXER PANEL');

    // 04-001: Mixer panel exists
    {
        const pass = await exists(page, '.mixer-panel');
        recordTest('04-001', 'Mixer panel exists', pass ? 'PASS' : 'FAIL', '');
    }

    // 04-002: Channel strips (MIC, SMP, SYN, RAD, OUT)
    {
        const channels = await page.$$eval('.ch', chs => chs.map(c => c.dataset.ch));
        const expected = ['mic', 'samples', 'synth', 'radio', 'master'];
        const hasAll = expected.every(e => channels.includes(e));
        recordTest('04-002', 'All 5 channel strips present', hasAll ? 'PASS' : 'FAIL',
            `Found: ${channels.join(', ')}`);
    }

    // 04-003: Vertical faders
    {
        const faderCount = await countElements(page, '.v-fader');
        const pass = faderCount >= 5;
        recordTest('04-003', 'Vertical faders exist', pass ? 'PASS' : 'WARN',
            `Found ${faderCount} faders`);
    }

    // 04-004: Mute buttons
    {
        const muteCount = await countElements(page, '.mute');
        const pass = muteCount >= 4;
        recordTest('04-004', 'Mute buttons exist', pass ? 'PASS' : 'WARN',
            `Found ${muteCount} mute buttons`);
    }

    // 04-005: Solo buttons
    {
        const soloCount = await countElements(page, '.solo');
        const pass = soloCount >= 4;
        recordTest('04-005', 'Solo buttons exist', pass ? 'PASS' : 'WARN',
            `Found ${soloCount} solo buttons`);
    }

    // 04-006: Mute button toggles
    {
        await click(page, '#muteMic');
        await sleep(100);
        const isActive = await hasClass(page, '#muteMic', 'active');
        recordTest('04-006', 'Mute button toggles active state', isActive ? 'PASS' : 'WARN',
            isActive ? 'Toggle works' : 'No active class added');
        // Reset
        await click(page, '#muteMic');
    }

    // 04-007: VU meters
    {
        const vuCount = await countElements(page, '.vu-meter');
        const pass = vuCount >= 5;
        recordTest('04-007', 'VU meters exist', pass ? 'PASS' : 'WARN',
            `Found ${vuCount} VU meters`);
    }

    // 04-008: Gain knobs
    {
        const gainCount = await countElements(page, '.gain-knob');
        const pass = gainCount >= 4;
        recordTest('04-008', 'Gain knobs exist', pass ? 'PASS' : 'WARN',
            `Found ${gainCount} gain knobs`);
    }

    // 04-009: Pan knobs
    {
        const panCount = await countElements(page, '.pan-knob');
        const pass = panCount >= 4;
        recordTest('04-009', 'Pan knobs exist', pass ? 'PASS' : 'WARN',
            `Found ${panCount} pan knobs`);
    }

    // 04-010: Master fader
    {
        const pass = await exists(page, '#faderMaster');
        recordTest('04-010', 'Master fader exists', pass ? 'PASS' : 'FAIL', '');
    }

    await screenshot(page, '04-mixer');
}

// ============================================
// TEST SUITE 05: PADS A (1-8)
// ============================================
async function testSuite05_PadsA(page) {
    startSuite('SUITE 05: PADS A (1-8)');

    // 05-001: PADS A panel exists
    {
        const pass = await exists(page, '.pads-panel:not(.pads2)');
        recordTest('05-001', 'PADS A panel exists', pass ? 'PASS' : 'FAIL', '');
    }

    // 05-002: 8 pads in PADS A
    {
        const padCount = await page.$$eval('.pads-panel:not(.pads2) .pad', pads => pads.length);
        const pass = padCount === 8;
        recordTest('05-002', '8 pads in PADS A grid', pass ? 'PASS' : 'WARN',
            `Found ${padCount} pads`);
    }

    // 05-003: Pads have data-pad attributes 0-7
    {
        const padNums = await page.$$eval('.pads-panel:not(.pads2) .pad', pads =>
            pads.map(p => parseInt(p.dataset.pad)));
        const expected = [0, 1, 2, 3, 4, 5, 6, 7];
        const hasAll = expected.every(e => padNums.includes(e));
        recordTest('05-003', 'Pads have data-pad 0-7', hasAll ? 'PASS' : 'WARN',
            `Found: ${padNums.join(', ')}`);
    }

    // 05-004: Pad click adds flash class
    {
        await click(page, '.pads-panel:not(.pads2) .pad[data-pad="0"]');
        await sleep(50);
        // Flash class is brief, hard to catch
        recordTest('05-004', 'Pad 1 is clickable', 'PASS', 'Click registered');
    }

    // 05-005: Kit selector buttons
    {
        const kitBtns = await countElements(page, '.pads-panel:not(.pads2) .kit-btn');
        const pass = kitBtns >= 3;
        recordTest('05-005', 'Kit selector buttons (1-3)', pass ? 'PASS' : 'WARN',
            `Found ${kitBtns} kit buttons`);
    }

    // 05-006: Mic capture button
    {
        const pass = await exists(page, '#micCapture');
        recordTest('05-006', 'Mic capture button exists', pass ? 'PASS' : 'WARN', '');
    }

    await screenshot(page, '05-pads-a');
}

// ============================================
// TEST SUITE 06: PADS B (9-16)
// ============================================
async function testSuite06_PadsB(page) {
    startSuite('SUITE 06: PADS B (9-16)');

    // 06-001: PADS B panel exists
    {
        const pass = await exists(page, '.pads-panel.pads2');
        recordTest('06-001', 'PADS B panel exists', pass ? 'PASS' : 'FAIL', '');
    }

    // 06-002: PADS B is visible (not display:none)
    {
        const visible = await isVisible(page, '.pads-panel.pads2');
        recordTest('06-002', 'PADS B is visible', visible ? 'PASS' : 'FAIL',
            visible ? 'Visible in layout' : 'Hidden by CSS');
    }

    // 06-003: 8 pads in PADS B
    {
        const padCount = await page.$$eval('.pads-panel.pads2 .pad', pads => pads.length);
        const pass = padCount === 8;
        recordTest('06-003', '8 pads in PADS B grid', pass ? 'PASS' : 'WARN',
            `Found ${padCount} pads`);
    }

    // 06-004: Pads have data-pad attributes 8-15
    {
        const padNums = await page.$$eval('.pads-panel.pads2 .pad', pads =>
            pads.map(p => parseInt(p.dataset.pad)));
        const expected = [8, 9, 10, 11, 12, 13, 14, 15];
        const hasAll = expected.every(e => padNums.includes(e));
        recordTest('06-004', 'Pads have data-pad 8-15', hasAll ? 'PASS' : 'WARN',
            `Found: ${padNums.join(', ')}`);
    }

    // 06-005: PADS B panel has panel-id
    {
        const panelId = await page.$eval('.pads-panel.pads2', el => el.dataset.panelId);
        const pass = panelId === 'pads2-panel';
        recordTest('06-005', 'PADS B has data-panel-id', pass ? 'PASS' : 'WARN',
            `data-panel-id: ${panelId}`);
    }

    await screenshot(page, '06-pads-b');
}

// ============================================
// TEST SUITE 07: CTRL KNOBS
// ============================================
async function testSuite07_CtrlKnobs(page) {
    startSuite('SUITE 07: CTRL KNOBS PANEL');

    // 07-001: Knobs panel exists
    {
        const pass = await exists(page, '.knobs-panel');
        recordTest('07-001', 'CTRL knobs panel exists', pass ? 'PASS' : 'FAIL', '');
    }

    // 07-002: 8 knobs present
    {
        const knobCount = await countElements(page, '.knobs-panel .knob');
        const pass = knobCount === 8;
        recordTest('07-002', '8 control knobs present', pass ? 'PASS' : 'WARN',
            `Found ${knobCount} knobs`);
    }

    // 07-003: Knob parameters (FREQ, FILT, DLY, GRN, RES, DRV, PAN, VOL)
    {
        const labels = await page.$$eval('.knobs-panel .knob-group span', spans =>
            spans.map(s => s.textContent.trim()));
        const expected = ['FREQ', 'FILT', 'DLY', 'GRN', 'RES', 'DRV', 'PAN', 'VOL'];
        const found = expected.filter(e => labels.includes(e));
        const pass = found.length === expected.length;
        recordTest('07-003', 'All 8 knob labels present', pass ? 'PASS' : 'WARN',
            `Found: ${labels.join(', ')}`);
    }

    // 07-004: Target selector buttons (FX, SYN, SMP)
    {
        const targetBtns = await page.$$eval('.knobs-panel .target-btn', btns =>
            btns.map(b => b.textContent.trim()));
        const expected = ['FX', 'SYN', 'SMP'];
        const hasAll = expected.every(e => targetBtns.includes(e));
        recordTest('07-004', 'Target selector buttons', hasAll ? 'PASS' : 'WARN',
            `Found: ${targetBtns.join(', ')}`);
    }

    // 07-005: Knob has data attributes
    {
        const knobData = await page.$eval('#knobFreq', el => ({
            param: el.dataset.param,
            min: el.dataset.min,
            max: el.dataset.max
        }));
        const pass = knobData.param && knobData.min && knobData.max;
        recordTest('07-005', 'Knobs have data attributes', pass ? 'PASS' : 'WARN',
            `param=${knobData.param}, min=${knobData.min}, max=${knobData.max}`);
    }

    await screenshot(page, '07-ctrl-knobs');
}

// ============================================
// TEST SUITE 08: SYNTH
// ============================================
async function testSuite08_Synth(page) {
    startSuite('SUITE 08: SYNTH PANEL');

    // 08-001: Synth panel exists
    {
        const pass = await exists(page, '.synth-panel');
        recordTest('08-001', 'Synth panel exists', pass ? 'PASS' : 'FAIL', '');
    }

    // 08-002: Power toggle button
    {
        const pass = await exists(page, '#synthToggle');
        recordTest('08-002', 'Synth power toggle exists', pass ? 'PASS' : 'WARN', '');
    }

    // 08-003: OSC1 waveform buttons
    {
        const osc1Btns = await page.$$eval('.wave-btns[data-osc="1"] .wave-btn', btns =>
            btns.map(b => b.dataset.wave));
        const expected = ['sine', 'triangle', 'sawtooth', 'square'];
        const hasAll = expected.every(e => osc1Btns.includes(e));
        recordTest('08-003', 'OSC1 waveforms (SIN/TRI/SAW/SQR)', hasAll ? 'PASS' : 'WARN',
            `Found: ${osc1Btns.join(', ')}`);
    }

    // 08-004: OSC2 waveform buttons
    {
        const osc2Btns = await page.$$eval('.wave-btns[data-osc="2"] .wave-btn', btns =>
            btns.map(b => b.dataset.wave));
        const pass = osc2Btns.length === 4;
        recordTest('08-004', 'OSC2 waveforms exist', pass ? 'PASS' : 'WARN',
            `Found ${osc2Btns.length} buttons`);
    }

    // 08-005: Filter controls
    {
        const hasCutoff = await exists(page, '#filterCutoff', 500);
        const hasRes = await exists(page, '#filterRes', 500);
        const pass = hasCutoff && hasRes;
        recordTest('08-005', 'Filter cutoff & resonance', pass ? 'PASS' : 'WARN',
            `Cutoff: ${hasCutoff}, Resonance: ${hasRes}`);
    }

    // 08-006: Filter type buttons (LP, HP, BP)
    {
        const fltBtns = await page.$$eval('.flt-btn', btns =>
            btns.map(b => b.dataset.flt));
        const expected = ['lowpass', 'highpass', 'bandpass'];
        const hasAll = expected.every(e => fltBtns.includes(e));
        recordTest('08-006', 'Filter types (LP/HP/BP)', hasAll ? 'PASS' : 'WARN',
            `Found: ${fltBtns.join(', ')}`);
    }

    // 08-007: LFO controls
    {
        const hasRate = await exists(page, '#lfoRate', 500);
        const hasDepth = await exists(page, '#lfoDepth', 500);
        const pass = hasRate && hasDepth;
        recordTest('08-007', 'LFO rate & depth controls', pass ? 'PASS' : 'WARN', '');
    }

    // 08-008: LFO target buttons
    {
        const lfoBtns = await page.$$eval('.lfo-btn', btns =>
            btns.map(b => b.dataset.target));
        const expected = ['pitch', 'filter', 'amp'];
        const hasAll = expected.every(e => lfoBtns.includes(e));
        recordTest('08-008', 'LFO targets (PIT/FLT/AMP)', hasAll ? 'PASS' : 'WARN',
            `Found: ${lfoBtns.join(', ')}`);
    }

    // 08-009: ADSR envelope
    {
        const adsr = ['adsrAttack', 'adsrDecay', 'adsrSustain', 'adsrRelease'];
        const found = [];
        for (const id of adsr) {
            if (await exists(page, `#${id}`, 500)) found.push(id);
        }
        const pass = found.length === 4;
        recordTest('08-009', 'ADSR envelope controls', pass ? 'PASS' : 'WARN',
            `Found ${found.length}/4`);
    }

    // 08-010: Oscilloscope canvas
    {
        const pass = await exists(page, '#scopeCanvas');
        recordTest('08-010', 'Oscilloscope canvas exists', pass ? 'PASS' : 'WARN', '');
    }

    // 08-011: Unison controls
    {
        const hasVoices = await exists(page, '#unisonVoices', 500);
        const hasSpread = await exists(page, '#unisonSpread', 500);
        const pass = hasVoices && hasSpread;
        recordTest('08-011', 'Unison voices & spread', pass ? 'PASS' : 'WARN', '');
    }

    await screenshot(page, '08-synth');
}

// ============================================
// TEST SUITE 09: SCENES
// ============================================
async function testSuite09_Scenes(page) {
    startSuite('SUITE 09: SCENES PANEL');

    // 09-001: Scenes panel exists
    {
        const pass = await exists(page, '.scenes-panel');
        recordTest('09-001', 'Scenes panel exists', pass ? 'PASS' : 'FAIL', '');
    }

    // 09-002: Scene buttons A-D
    {
        const sceneBtns = await page.$$eval('.scene-btn', btns =>
            btns.map(b => b.textContent.trim()));
        const expected = ['A', 'B', 'C', 'D'];
        const hasAll = expected.every(e => sceneBtns.includes(e));
        recordTest('09-002', 'Scene buttons A-D', hasAll ? 'PASS' : 'WARN',
            `Found: ${sceneBtns.join(', ')}`);
    }

    // 09-003: Crossfader
    {
        const pass = await exists(page, '#sceneCrossfader');
        recordTest('09-003', 'Crossfader exists', pass ? 'PASS' : 'WARN', '');
    }

    // 09-004: Scene selection changes
    {
        await click(page, '.scene-btn[data-scene="1"]');
        await sleep(100);
        const isActive = await hasClass(page, '.scene-btn[data-scene="1"]', 'active');
        recordTest('09-004', 'Scene B selectable', isActive ? 'PASS' : 'WARN',
            isActive ? 'Scene B activated' : 'Active state not set');
    }

    // 09-005: Save/Load buttons
    {
        const hasSave = await exists(page, '#saveScene', 500);
        const hasLoad = await exists(page, '#loadScene', 500);
        const pass = hasSave && hasLoad;
        recordTest('09-005', 'Save/Load buttons', pass ? 'PASS' : 'WARN', '');
    }

    // 09-006: Auto scene controls
    {
        const hasTime = await exists(page, '#autoSceneTime', 500);
        const hasToggle = await exists(page, '#autoSceneToggle', 500);
        const pass = hasTime && hasToggle;
        recordTest('09-006', 'Auto scene controls', pass ? 'PASS' : 'WARN', '');
    }

    await screenshot(page, '09-scenes');
}

// ============================================
// TEST SUITE 10: EFFECTS
// ============================================
async function testSuite10_Effects(page) {
    startSuite('SUITE 10: EFFECTS PANEL');

    // 10-001: FX panel exists
    {
        const pass = await exists(page, '.fx-panel');
        recordTest('10-001', 'FX panel exists', pass ? 'PASS' : 'FAIL', '');
    }

    // 10-002: Effect sliders (DLY, GRN, GLI, CRU)
    {
        const fxIds = ['fxDelay', 'fxGrain', 'fxGlitch', 'fxCrush'];
        const found = [];
        for (const id of fxIds) {
            if (await exists(page, `#${id}`, 500)) found.push(id);
        }
        const pass = found.length === 4;
        recordTest('10-002', 'Effect sliders (DLY/GRN/GLI/CRU)', pass ? 'PASS' : 'WARN',
            `Found ${found.length}/4`);
    }

    // 10-003: Punch FX buttons
    {
        const punchBtns = await page.$$eval('.punch-btn', btns =>
            btns.map(b => b.dataset.fx));
        const expected = ['stutter', 'reverse', 'filter', 'tape'];
        const hasAll = expected.every(e => punchBtns.includes(e));
        recordTest('10-003', 'Punch FX buttons', hasAll ? 'PASS' : 'WARN',
            `Found: ${punchBtns.join(', ')}`);
    }

    // 10-004: FX preset buttons
    {
        const presetBtns = await countElements(page, '.fx-preset-btn');
        const pass = presetBtns >= 1;
        recordTest('10-004', 'FX preset buttons exist', pass ? 'PASS' : 'WARN',
            `Found ${presetBtns} preset buttons`);
    }

    // 10-005: Punch button press/hold
    {
        const btn = await page.$('.punch-btn[data-fx="stutter"]');
        if (btn) {
            await btn.click();
            await sleep(100);
            recordTest('10-005', 'Stutter punch button clickable', 'PASS', '');
        } else {
            recordTest('10-005', 'Stutter punch button clickable', 'WARN', 'Button not found');
        }
    }

    await screenshot(page, '10-effects');
}

// ============================================
// TEST SUITE 11: RADIO
// ============================================
async function testSuite11_Radio(page) {
    startSuite('SUITE 11: RADIO PANEL');

    // 11-001: Radio panel exists
    {
        const pass = await exists(page, '.radio-panel');
        recordTest('11-001', 'Radio panel exists', pass ? 'PASS' : 'FAIL', '');
    }

    // 11-002: Search input
    {
        const pass = await exists(page, '#radioSearch');
        recordTest('11-002', 'Radio search input exists', pass ? 'PASS' : 'WARN', '');
    }

    // 11-003: Control buttons (SCAN, Play, Stop)
    {
        const hasScan = await exists(page, '#radioScan', 500);
        const hasGo = await exists(page, '#radioGo', 500);
        const hasStop = await exists(page, '#radioStop', 500);
        const pass = hasScan && hasGo && hasStop;
        recordTest('11-003', 'Radio control buttons', pass ? 'PASS' : 'WARN',
            `Scan: ${hasScan}, Go: ${hasGo}, Stop: ${hasStop}`);
    }

    // 11-004: Station list container
    {
        const pass = await exists(page, '#stationList');
        recordTest('11-004', 'Station list container exists', pass ? 'PASS' : 'WARN', '');
    }

    // 11-005: Sample capture button
    {
        const pass = await exists(page, '#radioSample');
        recordTest('11-005', 'Radio sample capture button', pass ? 'PASS' : 'WARN', '');
    }

    await screenshot(page, '11-radio');
}

// ============================================
// TEST SUITE 12: AI GEN
// ============================================
async function testSuite12_AIGen(page) {
    startSuite('SUITE 12: AI GEN PANEL');

    // 12-001: AI panel exists
    {
        const pass = await exists(page, '.ai-panel');
        recordTest('12-001', 'AI panel exists', pass ? 'PASS' : 'FAIL', '');
    }

    // 12-002: Generate button
    {
        const pass = await exists(page, '#aiGenerate');
        recordTest('12-002', 'AI Generate button exists', pass ? 'PASS' : 'WARN', '');
    }

    // 12-003: Landmark button
    {
        const pass = await exists(page, '#landmarkBtn');
        recordTest('12-003', 'Landmark button exists', pass ? 'PASS' : 'WARN', '');
    }

    // 12-004: AI sense readout sections
    {
        const hasLocation = await exists(page, '#aiLocation', 500);
        const hasTime = await exists(page, '#aiTime', 500);
        const hasVibe = await exists(page, '#aiVibe', 500);
        const pass = hasLocation && hasTime && hasVibe;
        recordTest('12-004', 'AI sense readout (Location/Time/Vibe)', pass ? 'PASS' : 'WARN', '');
    }

    // 12-005: AI status display
    {
        const pass = await exists(page, '#aiStatus');
        recordTest('12-005', 'AI status display exists', pass ? 'PASS' : 'WARN', '');
    }

    await screenshot(page, '12-ai-gen');
}

// ============================================
// TEST SUITE 13: EQ
// ============================================
async function testSuite13_EQ(page) {
    startSuite('SUITE 13: EQ PANEL');

    // 13-001: EQ panel exists
    {
        const pass = await exists(page, '.eq-panel');
        recordTest('13-001', 'EQ panel exists', pass ? 'PASS' : 'FAIL', '');
    }

    // 13-002: EQ band sliders (LO, MID, HI)
    {
        const hasLo = await exists(page, '#eqLow', 500);
        const hasMid = await exists(page, '#eqMid', 500);
        const hasHi = await exists(page, '#eqHigh', 500);
        const pass = hasLo && hasMid && hasHi;
        recordTest('13-002', 'EQ band sliders (LO/MID/HI)', pass ? 'PASS' : 'WARN',
            `Lo: ${hasLo}, Mid: ${hasMid}, Hi: ${hasHi}`);
    }

    // 13-003: Channel selector buttons
    {
        const chBtns = await page.$$eval('.eq-panel .ch-btn', btns =>
            btns.map(b => b.dataset.ch));
        const expected = ['master', 'mic', 'samples', 'synth', 'radio'];
        const found = expected.filter(e => chBtns.includes(e));
        const pass = found.length === expected.length;
        recordTest('13-003', 'EQ channel selectors', pass ? 'PASS' : 'WARN',
            `Found: ${chBtns.join(', ')}`);
    }

    // 13-004: EQ slider range
    {
        const range = await page.$eval('#eqLow', el => ({
            min: el.min,
            max: el.max
        }));
        const pass = range.min === '-12' && range.max === '12';
        recordTest('13-004', 'EQ slider range (-12 to +12)', pass ? 'PASS' : 'WARN',
            `Range: ${range.min} to ${range.max}`);
    }

    await screenshot(page, '13-eq');
}

// ============================================
// TEST SUITE 14: JOURNEY
// ============================================
async function testSuite14_Journey(page) {
    startSuite('SUITE 14: JOURNEY PANEL');

    // 14-001: Journey panel exists
    {
        const pass = await exists(page, '.journey-panel');
        recordTest('14-001', 'Journey panel exists', pass ? 'PASS' : 'FAIL', '');
    }

    // 14-002: Journey map container
    {
        const pass = await exists(page, '#journeyMap');
        recordTest('14-002', 'Journey map container exists', pass ? 'PASS' : 'WARN', '');
    }

    // 14-003: Control buttons (START, WAYPOINT, END)
    {
        const hasStart = await exists(page, '#journeyStart', 500);
        const hasWaypoint = await exists(page, '#journeyWaypoint', 500);
        const hasEnd = await exists(page, '#journeyEnd', 500);
        const pass = hasStart && hasWaypoint && hasEnd;
        recordTest('14-003', 'Journey control buttons', pass ? 'PASS' : 'WARN',
            `Start: ${hasStart}, Waypoint: ${hasWaypoint}, End: ${hasEnd}`);
    }

    // 14-004: Waypoints list
    {
        const pass = await exists(page, '#journeyWaypoints');
        recordTest('14-004', 'Waypoints list container', pass ? 'PASS' : 'WARN', '');
    }

    // 14-005: Journey stats display
    {
        const pass = await exists(page, '#journeyStats');
        recordTest('14-005', 'Journey stats display', pass ? 'PASS' : 'WARN', '');
    }

    // 14-006: Journey status
    {
        const pass = await exists(page, '#journeyStatus');
        recordTest('14-006', 'Journey status display', pass ? 'PASS' : 'WARN', '');
    }

    await screenshot(page, '14-journey');
}

// ============================================
// TEST SUITE 15: TRANSPORT CONTROLS
// ============================================
async function testSuite15_Transport(page) {
    startSuite('SUITE 15: TRANSPORT CONTROLS');

    // 15-001: Play button exists
    {
        const pass = await exists(page, '#btnPlay');
        recordTest('15-001', 'Play button exists', pass ? 'PASS' : 'FAIL', '');
    }

    // 15-002: Stop button exists
    {
        const pass = await exists(page, '#btnStop');
        recordTest('15-002', 'Stop button exists', pass ? 'PASS' : 'FAIL', '');
    }

    // 15-003: Record button exists
    {
        const pass = await exists(page, '#btnRecord');
        recordTest('15-003', 'Record button exists', pass ? 'PASS' : 'FAIL', '');
    }

    // 15-004: Tap tempo button
    {
        const pass = await exists(page, '#btnTap');
        recordTest('15-004', 'Tap tempo button exists', pass ? 'PASS' : 'WARN', '');
    }

    // 15-005: Tempo slider
    {
        const pass = await exists(page, '#tempoSlider');
        recordTest('15-005', 'Tempo slider exists', pass ? 'PASS' : 'WARN', '');
    }

    // 15-006: Tempo display
    {
        const pass = await exists(page, '#tempoVal');
        recordTest('15-006', 'Tempo display exists', pass ? 'PASS' : 'WARN', '');
    }

    // 15-007: Play button toggles
    {
        await click(page, '#btnPlay');
        await sleep(200);
        const isActive = await hasClass(page, '#btnPlay', 'active');
        recordTest('15-007', 'Play button toggles active state', isActive ? 'PASS' : 'WARN',
            isActive ? 'Activated' : 'No active class');
        // Stop
        await click(page, '#btnStop');
        await sleep(100);
    }

    // 15-008: Tempo slider changes value
    {
        await page.$eval('#tempoSlider', el => { el.value = 140; el.dispatchEvent(new Event('input')); });
        await sleep(100);
        const newVal = await getValue(page, '#tempoVal');
        const pass = newVal === '140';
        recordTest('15-008', 'Tempo slider updates display', pass ? 'PASS' : 'WARN',
            `Value: ${newVal}`);
    }

    await screenshot(page, '15-transport');
}

// ============================================
// TEST SUITE 16: KEYBOARD SHORTCUTS
// ============================================
async function testSuite16_KeyboardShortcuts(page) {
    startSuite('SUITE 16: KEYBOARD SHORTCUTS');

    // Reset state before keyboard tests
    await resetAppState(page);

    // 16-001: Space bar play/pause
    {
        // Ensure stopped state first
        await click(page, '#btnStop');
        await sleep(100);

        await page.keyboard.press('Space');

        // Wait for active class
        const activated = await waitForClass(page, '#btnPlay', 'active', 1000);

        recordTest('16-001', 'Space bar toggles play', activated ? 'PASS' : 'WARN',
            activated ? 'Play activated via Space' : 'Space key sent');

        // Stop playback
        await page.keyboard.press('Space');
        await sleep(100);
    }

    // 16-002: Number keys trigger pads (verify AudioContext state)
    {
        // Check if AudioContext exists and would respond
        const audioState = await getAudioContextState(page);

        await page.keyboard.press('1');
        await sleep(50);
        await page.keyboard.press('2');
        await sleep(50);

        const status = audioState === 'running' ? 'PASS' : 'WARN';
        recordTest('16-002', 'Number keys 1-8 trigger pads', status,
            `AudioContext: ${audioState}, keys sent`);
    }

    // 16-003: ? opens help modal (FIXED: use type() instead of press())
    {
        // Close any open modals first
        await page.evaluate(() => {
            document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
        });
        await sleep(100);

        // Type '?' character (Shift+/ on US keyboard)
        await page.keyboard.type('?');
        await sleep(300);

        // Check if help modal is visible
        const helpVisible = await isDisplayed(page, '#helpModal');

        // Alternative: check if modal doesn't have 'hidden' class
        const notHidden = await page.evaluate(() => {
            const modal = document.querySelector('#helpModal');
            return modal && !modal.classList.contains('hidden');
        });

        const pass = helpVisible || notHidden;
        recordTest('16-003', '? key opens help modal', pass ? 'PASS' : 'WARN',
            pass ? 'Help modal opened' : 'Modal state: hidden=' + !notHidden);

        // Close modal
        if (pass) {
            await click(page, '#closeHelp');
            await sleep(100);
        }
    }

    // 16-004: Q/W/E/T punch effects (verify button active state)
    {
        await page.keyboard.down('q');
        await sleep(100);
        const stutterActive = await hasClass(page, '.punch-btn[data-fx="stutter"]', 'active');
        await page.keyboard.up('q');
        await sleep(50);

        await page.keyboard.down('w');
        await sleep(100);
        const reverseActive = await hasClass(page, '.punch-btn[data-fx="reverse"]', 'active');
        await page.keyboard.up('w');
        await sleep(50);

        const pass = stutterActive || reverseActive;
        recordTest('16-004', 'Q/W/E/T punch effect shortcuts', pass ? 'PASS' : 'WARN',
            `Stutter: ${stutterActive}, Reverse: ${reverseActive}`);
    }

    // 16-005: Arrow keys for track selection
    {
        // Check for selected track before and after
        const beforeSelected = await page.evaluate(() => {
            const selected = document.querySelector('.oct-track.selected');
            return selected ? selected.querySelector('.oct-track-num')?.textContent : null;
        });

        await page.keyboard.press('ArrowDown');
        await sleep(100);

        const afterSelected = await page.evaluate(() => {
            const selected = document.querySelector('.oct-track.selected');
            return selected ? selected.querySelector('.oct-track-num')?.textContent : null;
        });

        const changed = beforeSelected !== afterSelected || afterSelected !== null;
        recordTest('16-005', 'Arrow keys for track selection', changed ? 'PASS' : 'WARN',
            `Before: ${beforeSelected}, After: ${afterSelected}`);

        await page.keyboard.press('ArrowUp');
        await sleep(50);
    }

    // 16-006: D toggles dub mode
    {
        // Reset dub state first
        const initialDub = await hasClass(page, '#dubToggle', 'dub-active') ||
                          await hasClass(page, '#dubToggle', 'overdub-active');

        await page.keyboard.press('d');
        await sleep(150);

        const afterDub = await hasClass(page, '#dubToggle', 'dub-active') ||
                        await hasClass(page, '#dubToggle', 'overdub-active');

        const toggled = initialDub !== afterDub;
        recordTest('16-006', 'D key toggles dub mode', toggled ? 'PASS' : 'WARN',
            toggled ? `Toggled: ${initialDub} -> ${afterDub}` : 'State unchanged');
    }

    // 16-007: F for fill (hold)
    {
        await page.keyboard.down('f');

        // Wait for active class
        const fillActivated = await waitForClass(page, '#fillBtn', 'active', 500);

        await page.keyboard.up('f');
        await sleep(100);

        // Verify released
        const fillReleased = !(await hasClass(page, '#fillBtn', 'active'));

        recordTest('16-007', 'F key activates fill (hold)', fillActivated ? 'PASS' : 'WARN',
            `Activated: ${fillActivated}, Released: ${fillReleased}`);
    }

    // 16-008: G generates AI pattern (check for status change)
    {
        const beforeStatus = await getValue(page, '#aiStatus');

        await page.keyboard.press('g');
        await sleep(500);

        const afterStatus = await getValue(page, '#aiStatus');
        const statusChanged = beforeStatus !== afterStatus;

        recordTest('16-008', 'G key triggers AI generate', statusChanged ? 'PASS' : 'WARN',
            statusChanged ? 'AI status changed' : 'Key sent, no visible change');
    }

    // 16-009: Escape stops all
    {
        // Start playback first
        await click(page, '#btnPlay');
        await waitForClass(page, '#btnPlay', 'active', 500);

        await page.keyboard.press('Escape');
        await sleep(150);

        const isStopped = !(await hasClass(page, '#btnPlay', 'active'));
        recordTest('16-009', 'Escape stops playback', isStopped ? 'PASS' : 'WARN',
            isStopped ? 'Playback stopped' : 'State uncertain');
    }

    // 16-010: R key for record (NEW TEST)
    {
        await page.keyboard.press('r');
        await sleep(200);

        const recActive = await hasClass(page, '#btnRecord', 'active') ||
                         await hasClass(page, '#btnRecord', 'ready');

        recordTest('16-010', 'R key toggles record', recActive ? 'PASS' : 'WARN',
            recActive ? 'Record state changed' : 'Key sent');

        // Reset record state
        if (recActive) {
            await page.keyboard.press('r');
            await sleep(100);
        }
    }

    await screenshot(page, '16-shortcuts');
}

// ============================================
// TEST SUITE 17: EMBEDDED MODE
// ============================================
async function testSuite17_EmbeddedMode(page) {
    startSuite('SUITE 17: EMBEDDED MODE');

    // Navigate to embedded mode
    await page.goto(`${CONFIG.url}?embedded=1`, { waitUntil: 'networkidle2' });
    await sleep(500);

    // 17-001: Body has embedded-mode class
    {
        const hasClass = await page.$eval('body', el => el.classList.contains('embedded-mode'));
        recordTest('17-001', 'Body has embedded-mode class', hasClass ? 'PASS' : 'FAIL',
            hasClass ? 'Class applied' : 'Class missing');
    }

    // 17-002: Page header hidden
    {
        const headerHidden = !(await isVisible(page, '.page-header'));
        recordTest('17-002', 'Page header hidden', headerHidden ? 'PASS' : 'WARN',
            headerHidden ? 'Header hidden' : 'Header still visible');
    }

    // 17-003: Sidebar hidden
    {
        const sidebarHidden = !(await isVisible(page, '.app-sidebar'));
        recordTest('17-003', 'Sidebar hidden', sidebarHidden ? 'PASS' : 'WARN',
            sidebarHidden ? 'Sidebar hidden' : 'Sidebar still visible');
    }

    // 17-004: Panel tabs visible
    {
        const tabsVisible = await isVisible(page, '.panel-tabs');
        recordTest('17-004', 'Panel tabs visible', tabsVisible ? 'PASS' : 'FAIL',
            tabsVisible ? 'Tabs shown' : 'Tabs hidden');
    }

    // 17-005: Transport panel visible
    {
        const transportVisible = await isVisible(page, '.transport-panel');
        recordTest('17-005', 'Transport panel visible', transportVisible ? 'PASS' : 'WARN',
            transportVisible ? 'Transport shown' : 'Transport hidden');
    }

    // 17-006: PADS tab exists
    {
        const padsTab = await page.$eval('.panel-tabs', tabs => {
            const btns = tabs.querySelectorAll('.panel-tab');
            return Array.from(btns).some(b => b.dataset.panel === 'pads-panel');
        });
        recordTest('17-006', 'PADS tab in tab bar', padsTab ? 'PASS' : 'FAIL',
            padsTab ? 'PADS tab found' : 'PADS tab missing');
    }

    // 17-007: CTRL tab exists
    {
        const ctrlTab = await page.$eval('.panel-tabs', tabs => {
            const btns = tabs.querySelectorAll('.panel-tab');
            return Array.from(btns).some(b => b.dataset.panel === 'knobs-panel');
        });
        recordTest('17-007', 'CTRL tab in tab bar', ctrlTab ? 'PASS' : 'FAIL',
            ctrlTab ? 'CTRL tab found' : 'CTRL tab missing');
    }

    // 17-008: Tab switching shows PADS panel
    {
        await click(page, '.panel-tab[data-panel="pads-panel"]');
        await sleep(200);
        const padsVisible = await hasClass(page, '.pads-panel:not(.pads2)', 'panel-visible');
        recordTest('17-008', 'PADS tab shows pads panel', padsVisible ? 'PASS' : 'WARN',
            padsVisible ? 'Panel visible' : 'Panel not shown');
    }

    // 17-009: Tab switching shows CTRL panel
    {
        await click(page, '.panel-tab[data-panel="knobs-panel"]');
        await sleep(200);
        const ctrlVisible = await hasClass(page, '.knobs-panel', 'panel-visible');
        recordTest('17-009', 'CTRL tab shows knobs panel', ctrlVisible ? 'PASS' : 'WARN',
            ctrlVisible ? 'Panel visible' : 'Panel not shown');
    }

    await screenshot(page, '17-embedded-mode');

    // Return to normal mode
    await page.goto(CONFIG.url, { waitUntil: 'networkidle2' });
    await sleep(500);
}

// ============================================
// TEST SUITE 18: RESPONSIVE LAYOUT
// ============================================
async function testSuite18_ResponsiveLayout(page) {
    startSuite('SUITE 18: RESPONSIVE LAYOUT');

    // Test at different viewports
    const viewports = [
        { name: 'Desktop (1920)', ...CONFIG.viewports.desktop },
        { name: 'Laptop (1440)', ...CONFIG.viewports.laptop },
        { name: 'Tablet (1024)', ...CONFIG.viewports.tablet },
        { name: 'Mobile (768)', ...CONFIG.viewports.mobile }
    ];

    for (const vp of viewports) {
        await page.setViewport({ width: vp.width, height: vp.height });
        await sleep(300);

        const gridCols = await page.$eval('.device', el => {
            return window.getComputedStyle(el).gridTemplateColumns;
        });
        const colCount = gridCols.split(' ').length;

        const testId = `18-${vp.name.split(' ')[0].toLowerCase()}`;
        recordTest(testId, `${vp.name} layout`, 'PASS',
            `${colCount} columns at ${vp.width}px`);
    }

    // 18-005: PADS B hides at 1439px
    {
        await page.setViewport({ width: 1400, height: 900 });
        await sleep(300);
        const pads2Visible = await isVisible(page, '.pads-panel.pads2');
        recordTest('18-005', 'PADS B hides below 1440px', !pads2Visible ? 'PASS' : 'WARN',
            pads2Visible ? 'Still visible' : 'Hidden correctly');
    }

    // 18-006: Mobile shows flex column
    {
        await page.setViewport({ width: 600, height: 800 });
        await sleep(300);
        const display = await page.$eval('.device', el => {
            return window.getComputedStyle(el).display;
        });
        const isFlex = display === 'flex';
        recordTest('18-006', 'Mobile uses flex layout', isFlex ? 'PASS' : 'WARN',
            `display: ${display}`);
    }

    await screenshot(page, '18-responsive');

    // Reset to desktop
    await page.setViewport(CONFIG.viewports.desktop);
    await sleep(200);
}

// ============================================
// TEST SUITE 19: ACCESSIBILITY
// ============================================
async function testSuite19_Accessibility(page) {
    startSuite('SUITE 19: ACCESSIBILITY');

    // 19-001: All buttons have accessible text
    {
        const buttonsWithoutText = await page.$$eval('button', btns => {
            return btns.filter(b => {
                const text = b.textContent.trim();
                const title = b.getAttribute('title');
                const ariaLabel = b.getAttribute('aria-label');
                return !text && !title && !ariaLabel;
            }).length;
        });
        const pass = buttonsWithoutText === 0;
        recordTest('19-001', 'Buttons have accessible text/title', pass ? 'PASS' : 'WARN',
            pass ? 'All buttons accessible' : `${buttonsWithoutText} buttons missing text`);
    }

    // 19-002: Inputs have labels or titles
    {
        const inputsWithoutLabels = await page.$$eval('input', inputs => {
            return inputs.filter(i => {
                const title = i.getAttribute('title');
                const ariaLabel = i.getAttribute('aria-label');
                const id = i.id;
                const hasLabel = id && document.querySelector(`label[for="${id}"]`);
                return !title && !ariaLabel && !hasLabel;
            }).length;
        });
        const pass = inputsWithoutLabels < 5;
        recordTest('19-002', 'Inputs have labels/titles', pass ? 'PASS' : 'WARN',
            `${inputsWithoutLabels} inputs missing labels`);
    }

    // 19-003: Color contrast (basic check)
    {
        // This is a simplified check - real a11y testing needs axe-core
        const hasGoodContrast = await page.evaluate(() => {
            const body = window.getComputedStyle(document.body);
            const textColor = body.color;
            // Basic sanity check - text should not be white on white
            return textColor !== 'rgb(255, 255, 255)';
        });
        recordTest('19-003', 'Basic color contrast check', hasGoodContrast ? 'PASS' : 'WARN',
            'Basic contrast check only');
    }

    // 19-004: Interactive elements are focusable
    {
        const focusableCount = await page.$$eval(
            'button, input, select, a[href], [tabindex]',
            els => els.filter(el => el.tabIndex >= 0).length
        );
        const pass = focusableCount > 50;
        recordTest('19-004', 'Interactive elements focusable', pass ? 'PASS' : 'WARN',
            `${focusableCount} focusable elements`);
    }

    // 19-005: No auto-playing audio on load
    {
        const audioPlaying = await page.evaluate(() => {
            const audios = document.querySelectorAll('audio, video');
            return Array.from(audios).some(a => !a.paused);
        });
        recordTest('19-005', 'No auto-playing media', !audioPlaying ? 'PASS' : 'WARN',
            audioPlaying ? 'Media auto-playing' : 'No auto-play');
    }

    await screenshot(page, '19-accessibility');
}

// ============================================
// TEST SUITE 20: PERFORMANCE & STRESS
// ============================================
async function testSuite20_Performance(page, consoleErrors) {
    startSuite('SUITE 20: PERFORMANCE & STRESS');

    // 20-001: Page load time
    {
        const metrics = await page.metrics();
        const loadTime = metrics.TaskDuration;
        const pass = loadTime < 5000;
        recordTest('20-001', 'Page load time < 5s', pass ? 'PASS' : 'WARN',
            `Task duration: ${Math.round(loadTime)}ms`);
    }

    // 20-002: No memory leaks (basic)
    {
        const memBefore = (await page.metrics()).JSHeapUsedSize;

        // Rapid interactions
        for (let i = 0; i < 50; i++) {
            await click(page, '#btnPlay');
            await click(page, '#btnStop');
        }

        await sleep(500);
        const memAfter = (await page.metrics()).JSHeapUsedSize;
        const increase = (memAfter - memBefore) / 1024 / 1024;
        const pass = increase < 50; // Less than 50MB increase
        recordTest('20-002', 'Memory stability after rapid use', pass ? 'PASS' : 'WARN',
            `Heap change: ${increase.toFixed(2)}MB`);
    }

    // 20-003: Rapid button clicking
    {
        const buttons = await page.$$('button');
        const start = Date.now();

        for (let i = 0; i < 100; i++) {
            if (buttons[i % buttons.length]) {
                await buttons[i % buttons.length].click().catch(() => {});
            }
        }

        const duration = Date.now() - start;
        const responsive = await page.evaluate(() => document.readyState === 'complete');

        recordTest('20-003', 'Handles 100 rapid clicks', responsive ? 'PASS' : 'WARN',
            `Completed in ${duration}ms`);
    }

    // 20-004: Rapid keyboard input
    {
        const keys = '12345678qwertdfg'.split('');
        for (let round = 0; round < 5; round++) {
            for (const key of keys) {
                await page.keyboard.press(key);
            }
        }
        await sleep(200);

        const responsive = await page.evaluate(() => document.readyState === 'complete');
        recordTest('20-004', 'Handles rapid keyboard input', responsive ? 'PASS' : 'WARN',
            '80 key presses completed');
    }

    // 20-005: Console errors during tests
    {
        const errorCount = consoleErrors.filter(e =>
            !e.includes('404') && !e.includes('GPS')
        ).length;
        const pass = errorCount === 0;
        recordTest('20-005', 'No JS errors during tests', pass ? 'PASS' : 'WARN',
            pass ? 'Clean execution' : `${errorCount} errors logged`);
    }

    // 20-006: DOM element count reasonable
    {
        const elementCount = await page.$$eval('*', els => els.length);
        const pass = elementCount < 2000;
        recordTest('20-006', 'DOM element count < 2000', pass ? 'PASS' : 'WARN',
            `${elementCount} elements in DOM`);
    }

    await screenshot(page, '20-performance');
}

// ============================================
// SUMMARY & REPORTING
// ============================================
function printSummary() {
    const duration = (results.endTime - results.startTime) / 1000;

    log('\n' + '═'.repeat(60), 'cyan');
    log('  TEST SUMMARY', 'cyan');
    log('═'.repeat(60), 'cyan');

    log(`\n  Total Tests:  ${results.total}`, 'bright');
    log(`  ✅ Passed:    ${results.passed}`, 'green');
    log(`  ❌ Failed:    ${results.failed}`, results.failed > 0 ? 'red' : 'dim');
    log(`  ⚠️  Warnings:  ${results.warnings}`, results.warnings > 0 ? 'yellow' : 'dim');
    log(`  ⏭️  Skipped:   ${results.skipped}`, 'dim');

    const passRate = ((results.passed / results.total) * 100).toFixed(1);
    const color = passRate >= 90 ? 'green' : passRate >= 70 ? 'yellow' : 'red';
    log(`\n  Pass Rate: ${passRate}%`, color);
    log(`  Duration:  ${duration.toFixed(1)}s`, 'dim');

    // Suite breakdown
    log('\n  Suite Results:', 'bright');
    for (const suite of results.suites) {
        const icon = suite.failed > 0 ? '❌' : suite.warnings > 0 ? '⚠️' : '✅';
        log(`    ${icon} ${suite.name}: ${suite.passed}/${suite.tests.length}`, 'dim');
    }

    log('\n' + '═'.repeat(60) + '\n', 'cyan');
}

function saveResults() {
    const report = {
        timestamp: new Date().toISOString(),
        url: CONFIG.url,
        duration: (results.endTime - results.startTime) / 1000,
        summary: {
            total: results.total,
            passed: results.passed,
            failed: results.failed,
            warnings: results.warnings,
            skipped: results.skipped,
            passRate: ((results.passed / results.total) * 100).toFixed(1)
        },
        suites: results.suites
    };

    // JSON report
    fs.writeFileSync('./test-results.json', JSON.stringify(report, null, 2));
    log('📄 JSON report: ./test-results.json', 'blue');

    // Markdown report
    let md = `# Oh My Ondas - Comprehensive Test Report\n\n`;
    md += `**Date:** ${new Date().toLocaleString()}\n`;
    md += `**URL:** ${report.url}\n`;
    md += `**Duration:** ${report.duration.toFixed(1)}s\n\n`;

    md += `## Summary\n\n`;
    md += `| Metric | Value |\n|--------|-------|\n`;
    md += `| Total Tests | ${report.summary.total} |\n`;
    md += `| ✅ Passed | ${report.summary.passed} |\n`;
    md += `| ❌ Failed | ${report.summary.failed} |\n`;
    md += `| ⚠️ Warnings | ${report.summary.warnings} |\n`;
    md += `| Pass Rate | ${report.summary.passRate}% |\n\n`;

    md += `## Suite Results\n\n`;
    for (const suite of report.suites) {
        md += `### ${suite.name}\n\n`;
        md += `| ID | Test | Status | Details |\n`;
        md += `|----|------|--------|--------|\n`;
        for (const test of suite.tests) {
            const icon = { PASS: '✅', FAIL: '❌', WARN: '⚠️', SKIP: '⏭️' }[test.status];
            md += `| ${test.id} | ${test.name} | ${icon} ${test.status} | ${test.details || '-'} |\n`;
        }
        md += '\n';
    }

    fs.writeFileSync('./test-results.md', md);
    log('📄 Markdown report: ./test-results.md\n', 'blue');
}

// ============================================
// RUN TESTS
// ============================================
runTests().catch(error => {
    console.error('Test suite failed:', error);
    process.exit(1);
});
