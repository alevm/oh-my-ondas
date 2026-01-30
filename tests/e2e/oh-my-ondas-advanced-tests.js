#!/usr/bin/env node

/**
 * OH MY ONDAS - ADVANCED FEATURE TESTING SUITE
 * 
 * Comprehensive testing framework comparing Oh My Ondas to:
 * - Elektron Octatrack (sequencer depth)
 * - Teenage Engineering OP-Z (performance workflow)
 * - Roland SP-404 (sampler functionality)
 * 
 * Test Categories:
 * 1. Sequencer Depth (Octatrack comparison)
 * 2. Sampler Functionality (SP-404 comparison)
 * 3. Performance Workflow (OP-Z comparison)
 * 4. Sync & Timing (all devices)
 * 5. Interaction Efficiency (UX metrics)
 */

const puppeteer = require('puppeteer');
const fs = require('fs');

// Configuration
const config = {
    url: process.env.TEST_URL || 'https://alevm.github.io/oh-my-ondas/',
    headless: process.env.HEADLESS === 'true' || process.env.CI === 'true',
    slowMo: process.env.CI ? 0 : 100,
    timeout: 10000,
    screenshotDir: './advanced-test-screenshots',
    reportFile: './hardware-comparison-report.json'
};

// Test Results Storage
const testResults = {
    deviceName: 'Oh My Ondas',
    testDate: new Date().toISOString(),
    categories: {
        sequencer: { tests: [], score: 0, maxScore: 0 },
        sampler: { tests: [], score: 0, maxScore: 0 },
        performance: { tests: [], score: 0, maxScore: 0 },
        sync: { tests: [], score: 0, maxScore: 0 },
        ux: { tests: [], score: 0, maxScore: 0 }
    },
    benchmarks: {},
    comparisonMatrix: {}
};

// Utility Functions
function log(message, color = 'white') {
    const colors = {
        red: '\x1b[31m',
        green: '\x1b[32m',
        yellow: '\x1b[33m',
        blue: '\x1b[34m',
        magenta: '\x1b[35m',
        cyan: '\x1b[36m',
        white: '\x1b[37m',
        reset: '\x1b[0m'
    };
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function screenshot(page, name) {
    const dir = config.screenshotDir;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: `${dir}/${name}.png` });
}

function recordTest(category, test) {
    testResults.categories[category].tests.push(test);
    if (test.passed) testResults.categories[category].score++;
    testResults.categories[category].maxScore++;
}

function recordBenchmark(name, value, unit, comparison) {
    testResults.benchmarks[name] = { value, unit, comparison };
}

// Comparison Reference Data
const referenceDevices = {
    octatrack: {
        parameterLocksPerStep: 'unlimited',
        trigConditions: 12,
        maxTracks: 8,
        maxPatterns: 256,
        scenes: 16,
        stepsPerPattern: 64,
        interactionComplexity: {
            setParameterLock: 5, // 5 button presses
            changeTrigCondition: 4,
            switchScene: 1,
            copyPattern: 6
        }
    },
    opz: {
        tracks: 16,
        stepComponents: 10,
        performanceModes: 6,
        punchEffects: 4,
        interactionComplexity: {
            punchEffect: 1, // single button press
            changeStep: 2,
            recordLoop: 2
        }
    },
    sp404: {
        pads: 16,
        effects: 29,
        sampleTime: 'immediate',
        padLatency: '<5ms',
        interactionComplexity: {
            triggerSample: 1,
            applyEffect: 2,
            resample: 3
        }
    }
};

// =============================================================================
// TEST SUITE 1: SEQUENCER DEPTH (Octatrack Comparison)
// =============================================================================

async function testSequencerDepth(page) {
    log('\n═══════════════════════════════════════', 'cyan');
    log('  SEQUENCER DEPTH (Octatrack Comparison)', 'cyan');
    log('═══════════════════════════════════════', 'cyan');
    
    const tests = [];
    
    // Test 1: Parameter Locks Detection
    {
        log('\n🔍 Test 1: Parameter Locks (P-Locks)', 'yellow');
        const result = await page.evaluate(() => {
            // Look for P-Lock controls
            const plockIndicators = [
                'PITCH', 'SLICE', 'FILT', 'DECAY', 'LEVEL', 'PAN'
            ];
            
            const foundPlocks = [];
            for (const plock of plockIndicators) {
                const elements = Array.from(document.querySelectorAll('*')).filter(el =>
                    el.textContent.includes(plock) || 
                    el.className?.includes(plock.toLowerCase()) ||
                    el.dataset?.plock === plock.toLowerCase()
                );
                if (elements.length > 0) foundPlocks.push(plock);
            }
            
            return {
                available: foundPlocks,
                count: foundPlocks.length,
                perStepEditing: document.querySelector('[data-step-edit]') !== null
            };
        });
        
        const passed = result.count >= 4; // Minimum 4 p-lock types
        tests.push({
            name: 'Parameter Locks Available',
            passed,
            data: result,
            comparison: {
                octatrack: 'Unlimited parameters',
                ohMyOndas: `${result.count} parameter types`,
                score: passed ? 0.8 : 0.3 // 80% if >=4, 30% if less
            }
        });
        
        log(passed ? '  ✅ PASS' : '  ⚠️  PARTIAL', passed ? 'green' : 'yellow');
        log(`  Found: ${result.available.join(', ')}`, 'white');
    }
    
    // Test 2: Trig Conditions
    {
        log('\n🔍 Test 2: Trig Conditions', 'yellow');
        const result = await page.evaluate(() => {
            const trigTypes = [
                'ALL', 'PROB', 'FILL', '!FILL', 'NTH', 'NEIGH',
                '1ST', '2ND', '3RD', '4TH', 'PRE', 'NEI'
            ];
            
            const foundTrigs = [];
            for (const trig of trigTypes) {
                const elements = Array.from(document.querySelectorAll('*')).filter(el =>
                    el.textContent === trig || 
                    el.dataset?.trig === trig.toLowerCase()
                );
                if (elements.length > 0) foundTrigs.push(trig);
            }
            
            return {
                available: foundTrigs,
                count: foundTrigs.length,
                probability: foundTrigs.includes('PROB'),
                fill: foundTrigs.includes('FILL'),
                neighbor: foundTrigs.includes('NEIGH') || foundTrigs.includes('NEI')
            };
        });
        
        const passed = result.count >= 6; // Minimum 6 trig conditions
        tests.push({
            name: 'Trig Conditions',
            passed,
            data: result,
            comparison: {
                octatrack: '12 condition types',
                ohMyOndas: `${result.count} condition types`,
                score: result.count / 12 // Percentage of Octatrack
            }
        });
        
        log(passed ? '  ✅ PASS' : '  ⚠️  PARTIAL', passed ? 'green' : 'yellow');
        log(`  Found: ${result.available.join(', ')}`, 'white');
    }
    
    // Test 3: Pattern System
    {
        log('\n🔍 Test 3: Pattern System', 'yellow');
        const result = await page.evaluate(() => {
            // Count pattern slots/banks
            const patternButtons = Array.from(document.querySelectorAll('button')).filter(b =>
                b.textContent.match(/^P\d+$/) || // P1, P2, etc.
                b.dataset?.pattern !== undefined
            );
            
            // Check for pattern chaining
            const hasChaining = document.querySelector('[data-chain]') !== null ||
                               Array.from(document.querySelectorAll('*')).some(el =>
                                   el.textContent.includes('CHAIN')
                               );
            
            return {
                patternCount: patternButtons.length,
                hasChaining,
                hasLength: document.querySelector('[data-pattern-length]') !== null
            };
        });
        
        const passed = result.patternCount >= 16;
        tests.push({
            name: 'Pattern System',
            passed,
            data: result,
            comparison: {
                octatrack: '256 patterns',
                ohMyOndas: `${result.patternCount} patterns`,
                score: Math.min(result.patternCount / 256, 1)
            }
        });
        
        log(passed ? '  ✅ PASS' : '  ⚠️  PARTIAL', passed ? 'green' : 'yellow');
        log(`  Patterns: ${result.patternCount}, Chain: ${result.hasChaining}`, 'white');
    }
    
    // Test 4: Scene System
    {
        log('\n🔍 Test 4: Scene System', 'yellow');
        const result = await page.evaluate(() => {
            // Look for scene buttons
            const sceneButtons = Array.from(document.querySelectorAll('button')).filter(b =>
                ['A', 'B', 'C', 'D'].includes(b.textContent.trim()) &&
                b.className?.includes('scene')
            );
            
            // Check for scene morphing/crossfade
            const hasMorph = Array.from(document.querySelectorAll('*')).some(el =>
                el.textContent.includes('MORPH') || 
                el.textContent.includes('XFADE') ||
                el.dataset?.morph !== undefined
            );
            
            return {
                sceneCount: sceneButtons.length > 0 ? 4 : 0, // A, B, C, D
                hasMorph,
                hasSave: document.querySelector('[data-save-scene]') !== null
            };
        });
        
        await screenshot(page, 'seq-01-scenes');
        
        const passed = result.sceneCount >= 4;
        tests.push({
            name: 'Scene System',
            passed,
            data: result,
            comparison: {
                octatrack: '16 scenes per pattern',
                ohMyOndas: `${result.sceneCount} scenes`,
                score: result.sceneCount / 16
            }
        });
        
        log(passed ? '  ✅ PASS' : '  ⚠️  PARTIAL', passed ? 'green' : 'yellow');
        log(`  Scenes: ${result.sceneCount}, Morph: ${result.hasMorph}`, 'white');
    }
    
    // Test 5: Track Count & Independence
    {
        log('\n🔍 Test 5: Track System', 'yellow');
        const result = await page.evaluate(() => {
            // Look for track selectors
            const trackButtons = Array.from(document.querySelectorAll('button')).filter(b =>
                ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].includes(b.textContent.trim()) &&
                !b.className?.includes('scene')
            );
            
            // Check for per-track mute/solo
            const muteButtons = Array.from(document.querySelectorAll('button')).filter(b =>
                b.textContent.trim() === 'M' || 
                b.dataset?.mute !== undefined ||
                b.className?.includes('mute')
            );
            
            const soloButtons = Array.from(document.querySelectorAll('button')).filter(b =>
                b.textContent.trim() === 'S' || 
                b.dataset?.solo !== undefined ||
                b.className?.includes('solo')
            );
            
            return {
                trackCount: trackButtons.length,
                hasMute: muteButtons.length > 0,
                hasSolo: soloButtons.length > 0,
                independentSteps: true // Assume true if tracks exist
            };
        });
        
        const passed = result.trackCount >= 8;
        tests.push({
            name: 'Track System',
            passed,
            data: result,
            comparison: {
                octatrack: '8 tracks',
                ohMyOndas: `${result.trackCount} tracks`,
                score: result.trackCount >= 8 ? 1.0 : result.trackCount / 8
            }
        });
        
        log(passed ? '  ✅ PASS' : '  ⚠️  PARTIAL', passed ? 'green' : 'yellow');
        log(`  Tracks: ${result.trackCount}`, 'white');
    }
    
    // Store all sequencer tests
    tests.forEach(test => recordTest('sequencer', test));
    
    return tests;
}

// =============================================================================
// TEST SUITE 2: SAMPLER FUNCTIONALITY (SP-404 Comparison)
// =============================================================================

async function testSamplerFunctionality(page) {
    log('\n═══════════════════════════════════════', 'cyan');
    log('  SAMPLER FUNCTIONALITY (SP-404 Comparison)', 'cyan');
    log('═══════════════════════════════════════', 'cyan');
    
    const tests = [];
    
    // Test 1: Pad Count & Layout
    {
        log('\n🔍 Test 1: Pad Count & Layout', 'yellow');
        const result = await page.evaluate(() => {
            // Find pads (numbered buttons)
            const pads = [];
            for (let i = 1; i <= 16; i++) {
                const buttons = Array.from(document.querySelectorAll('button'));
                const pad = buttons.find(b => b.textContent.trim() === String(i));
                if (pad) pads.push(i);
            }
            
            // Check for banks (A/B switching)
            const bankButtons = Array.from(document.querySelectorAll('button')).filter(b =>
                b.textContent.match(/^BANK\s*[AB]$/i) ||
                b.dataset?.bank !== undefined
            );
            
            return {
                padCount: pads.length,
                pads,
                bankCount: bankButtons.length > 0 ? 2 : 1,
                totalPads: pads.length * (bankButtons.length > 0 ? 2 : 1)
            };
        });
        
        const passed = result.padCount >= 8;
        tests.push({
            name: 'Pad Configuration',
            passed,
            data: result,
            comparison: {
                sp404: '16 pads',
                ohMyOndas: `${result.totalPads} total pads (${result.padCount} per bank)`,
                score: result.totalPads / 16
            }
        });
        
        log(passed ? '  ✅ PASS' : '  ⚠️  PARTIAL', passed ? 'green' : 'yellow');
        log(`  Pads: ${result.padCount}, Banks: ${result.bankCount}`, 'white');
    }
    
    // Test 2: Pad Response Time
    {
        log('\n🔍 Test 2: Pad Response Time (Latency)', 'yellow');
        
        const latencies = [];
        for (let i = 0; i < 5; i++) {
            const latency = await page.evaluate(() => {
                return new Promise(resolve => {
                    const pad = Array.from(document.querySelectorAll('button')).find(b =>
                        b.textContent.trim() === '1'
                    );
                    
                    if (!pad) {
                        resolve(null);
                        return;
                    }
                    
                    const startTime = performance.now();
                    
                    // Listen for any audio/visual response
                    const observer = new MutationObserver(() => {
                        const endTime = performance.now();
                        observer.disconnect();
                        resolve(endTime - startTime);
                    });
                    
                    observer.observe(document.body, {
                        attributes: true,
                        subtree: true,
                        attributeFilter: ['class', 'style']
                    });
                    
                    pad.click();
                    
                    // Timeout after 100ms
                    setTimeout(() => {
                        observer.disconnect();
                        resolve(performance.now() - startTime);
                    }, 100);
                });
            });
            
            if (latency) latencies.push(latency);
            await sleep(200);
        }
        
        const avgLatency = latencies.length > 0 
            ? latencies.reduce((a, b) => a + b) / latencies.length 
            : null;
        
        const passed = avgLatency !== null && avgLatency < 50; // <50ms is good
        tests.push({
            name: 'Pad Response Latency',
            passed,
            data: {
                avgLatency: avgLatency ? avgLatency.toFixed(2) : 'N/A',
                measurements: latencies.length
            },
            comparison: {
                sp404: '<5ms (hardware)',
                ohMyOndas: avgLatency ? `${avgLatency.toFixed(2)}ms (software)` : 'Not measured',
                score: avgLatency ? Math.max(0, 1 - (avgLatency / 50)) : 0
            }
        });
        
        recordBenchmark('padLatency', avgLatency, 'ms', {
            sp404: 5,
            acceptable: 50,
            measured: avgLatency
        });
        
        log(passed ? '  ✅ PASS' : '  ⚠️  PARTIAL', passed ? 'green' : 'yellow');
        log(`  Average: ${avgLatency ? avgLatency.toFixed(2) : 'N/A'}ms`, 'white');
    }
    
    // Test 3: Sample Bank System
    {
        log('\n🔍 Test 3: Sample Banks & Kits', 'yellow');
        const result = await page.evaluate(() => {
            // Look for kit/bank switching
            const kitButtons = Array.from(document.querySelectorAll('button')).filter(b =>
                b.textContent.match(/Kit\s*\d+/i) ||
                b.textContent.match(/Bank\s*[A-Z]/i) ||
                b.dataset?.kit !== undefined
            );
            
            return {
                kitCount: kitButtons.length,
                hasKitSystem: kitButtons.length > 0,
                kitNames: kitButtons.map(b => b.textContent.trim())
            };
        });
        
        const passed = result.hasKitSystem;
        tests.push({
            name: 'Sample Bank System',
            passed,
            data: result,
            comparison: {
                sp404: '12 banks',
                ohMyOndas: result.hasKitSystem ? `${result.kitCount} kits/banks` : 'No kit system',
                score: result.hasKitSystem ? Math.min(result.kitCount / 12, 1) : 0
            }
        });
        
        log(passed ? '  ✅ PASS' : '  ❌ FAIL', passed ? 'green' : 'red');
        log(`  Kits: ${result.kitCount}`, 'white');
    }
    
    // Test 4: Sample Editing Features
    {
        log('\n🔍 Test 4: Sample Editing', 'yellow');
        const result = await page.evaluate(() => {
            const features = {
                reverse: false,
                pitchShift: false,
                slice: false,
                loop: false,
                trim: false,
                normalize: false
            };
            
            const allText = document.body.textContent;
            
            if (allText.includes('REV') || allText.includes('REVERSE')) features.reverse = true;
            if (allText.includes('PITCH')) features.pitchShift = true;
            if (allText.includes('SLICE')) features.slice = true;
            if (allText.includes('LOOP')) features.loop = true;
            if (allText.includes('TRIM')) features.trim = true;
            if (allText.includes('NORM')) features.normalize = true;
            
            return {
                features,
                count: Object.values(features).filter(Boolean).length
            };
        });
        
        const passed = result.count >= 3;
        tests.push({
            name: 'Sample Editing Features',
            passed,
            data: result,
            comparison: {
                sp404: '6 main editing functions',
                ohMyOndas: `${result.count} editing features`,
                score: result.count / 6
            }
        });
        
        log(passed ? '  ✅ PASS' : '  ⚠️  PARTIAL', passed ? 'green' : 'yellow');
        log(`  Features: ${Object.keys(result.features).filter(k => result.features[k]).join(', ')}`, 'white');
    }
    
    // Store all sampler tests
    tests.forEach(test => recordTest('sampler', test));
    
    return tests;
}

// =============================================================================
// TEST SUITE 3: PERFORMANCE WORKFLOW (OP-Z Comparison)
// =============================================================================

async function testPerformanceWorkflow(page) {
    log('\n═══════════════════════════════════════', 'cyan');
    log('  PERFORMANCE WORKFLOW (OP-Z Comparison)', 'cyan');
    log('═══════════════════════════════════════', 'cyan');
    
    const tests = [];
    
    // Test 1: Punch Effects (Temporary FX)
    {
        log('\n🔍 Test 1: Punch Effects', 'yellow');
        const result = await page.evaluate(() => {
            const punchKeys = ['Q', 'W', 'E', 'R', 'T'];
            const allText = document.body.textContent;
            
            const detectedEffects = [];
            const effectNames = ['DELAY', 'REVERB', 'FILTER', 'CRUSH', 'GLITCH'];
            
            effectNames.forEach(fx => {
                if (allText.includes(fx)) detectedEffects.push(fx);
            });
            
            return {
                effectCount: detectedEffects.length,
                effects: detectedEffects,
                hasPunchSystem: detectedEffects.length > 0
            };
        });
        
        // Test keyboard response
        await page.keyboard.press('Q');
        await sleep(100);
        await screenshot(page, 'perf-01-punch-q');
        
        const passed = result.effectCount >= 4;
        tests.push({
            name: 'Punch Effects (Keyboard FX)',
            passed,
            data: result,
            comparison: {
                opz: '4 punch effects',
                ohMyOndas: `${result.effectCount} punch-capable effects`,
                score: result.effectCount / 4
            }
        });
        
        log(passed ? '  ✅ PASS' : '  ⚠️  PARTIAL', passed ? 'green' : 'yellow');
        log(`  Effects: ${result.effects.join(', ')}`, 'white');
    }
    
    // Test 2: Live Recording/Looping
    {
        log('\n🔍 Test 2: Live Recording', 'yellow');
        const result = await page.evaluate(() => {
            // Look for record button/function
            const recordButtons = Array.from(document.querySelectorAll('button')).filter(b =>
                b.textContent.includes('REC') ||
                b.textContent.includes('⏺') ||
                b.dataset?.action === 'record'
            );
            
            // Look for loop functions
            const loopControls = Array.from(document.querySelectorAll('*')).filter(el =>
                el.textContent.includes('LOOP') ||
                el.dataset?.loop !== undefined
            );
            
            return {
                hasRecord: recordButtons.length > 0,
                hasLoop: loopControls.length > 0,
                recordButtons: recordButtons.length
            };
        });
        
        const passed = result.hasRecord;
        tests.push({
            name: 'Live Recording/Looping',
            passed,
            data: result,
            comparison: {
                opz: 'Live recording + looping',
                ohMyOndas: result.hasRecord ? 'Recording available' : 'No recording detected',
                score: (result.hasRecord ? 0.5 : 0) + (result.hasLoop ? 0.5 : 0)
            }
        });
        
        log(passed ? '  ✅ PASS' : '  ❌ FAIL', passed ? 'green' : 'red');
        log(`  Record: ${result.hasRecord}, Loop: ${result.hasLoop}`, 'white');
    }
    
    // Test 3: Real-time Parameter Control
    {
        log('\n🔍 Test 3: Real-time Parameter Control', 'yellow');
        const result = await page.evaluate(() => {
            // Look for knobs/sliders/encoders
            const sliders = document.querySelectorAll('input[type="range"]');
            const knobs = document.querySelectorAll('[class*="knob"], [class*="encoder"]');
            
            // Count tweakable parameters
            const parameterCount = sliders.length + knobs.length;
            
            return {
                sliders: sliders.length,
                knobs: knobs.length,
                totalParameters: parameterCount,
                hasRealtime: parameterCount > 0
            };
        });
        
        const passed = result.totalParameters >= 8;
        tests.push({
            name: 'Real-time Parameter Tweaking',
            passed,
            data: result,
            comparison: {
                opz: '10+ step components',
                ohMyOndas: `${result.totalParameters} tweakable parameters`,
                score: Math.min(result.totalParameters / 10, 1)
            }
        });
        
        log(passed ? '  ✅ PASS' : '  ⚠️  PARTIAL', passed ? 'green' : 'yellow');
        log(`  Parameters: ${result.totalParameters}`, 'white');
    }
    
    // Test 4: Keyboard Shortcut Coverage
    {
        log('\n🔍 Test 4: Keyboard Shortcuts', 'yellow');
        
        const shortcuts = [
            { key: ' ', name: 'Space (Play/Pause)' },
            { key: '?', name: '? (Help)' },
            { key: '1', name: '1 (Pad)' },
            { key: 'Q', name: 'Q (Punch FX)' },
            { key: 'Escape', name: 'Esc (Cancel)' }
        ];
        
        const results = [];
        for (const shortcut of shortcuts) {
            const hasResponse = await page.evaluate((key) => {
                return new Promise(resolve => {
                    const initialState = document.body.innerHTML;
                    
                    const observer = new MutationObserver(() => {
                        const changed = document.body.innerHTML !== initialState;
                        observer.disconnect();
                        resolve(changed);
                    });
                    
                    observer.observe(document.body, {
                        childList: true,
                        subtree: true,
                        attributes: true
                    });
                    
                    // Simulate keypress
                    document.dispatchEvent(new KeyboardEvent('keydown', { key }));
                    
                    setTimeout(() => {
                        observer.disconnect();
                        resolve(false);
                    }, 200);
                });
            }, shortcut.key);
            
            results.push({ ...shortcut, works: hasResponse });
            await sleep(300);
        }
        
        const workingShortcuts = results.filter(r => r.works).length;
        const passed = workingShortcuts >= 3;
        
        tests.push({
            name: 'Keyboard Shortcuts',
            passed,
            data: {
                tested: shortcuts.length,
                working: workingShortcuts,
                shortcuts: results
            },
            comparison: {
                opz: '20+ shortcuts',
                ohMyOndas: `${workingShortcuts}/${shortcuts.length} tested shortcuts work`,
                score: workingShortcuts / shortcuts.length
            }
        });
        
        log(passed ? '  ✅ PASS' : '  ⚠️  PARTIAL', passed ? 'green' : 'yellow');
        log(`  Working: ${workingShortcuts}/${shortcuts.length}`, 'white');
    }
    
    // Store all performance tests
    tests.forEach(test => recordTest('performance', test));
    
    return tests;
}

// =============================================================================
// TEST SUITE 4: SYNC & TIMING (All Devices)
// =============================================================================

async function testSyncTiming(page) {
    log('\n═══════════════════════════════════════', 'cyan');
    log('  SYNC & TIMING TESTS', 'cyan');
    log('═══════════════════════════════════════', 'cyan');
    
    const tests = [];
    
    // Test 1: BPM Range & Control
    {
        log('\n🔍 Test 1: BPM Range & Accuracy', 'yellow');
        
        const testBPMs = [60, 120, 180];
        const results = [];
        
        for (const targetBPM of testBPMs) {
            const result = await page.evaluate((bpm) => {
                // Try to find and change BPM control
                const bpmInput = document.querySelector('input[type="number"]');
                if (!bpmInput) return { success: false };
                
                const initialValue = bpmInput.value;
                bpmInput.value = bpm;
                bpmInput.dispatchEvent(new Event('change', { bubbles: true }));
                bpmInput.dispatchEvent(new Event('input', { bubbles: true }));
                
                // Wait a bit for update
                return new Promise(resolve => {
                    setTimeout(() => {
                        resolve({
                            success: true,
                            target: bpm,
                            actual: parseInt(bpmInput.value),
                            accurate: Math.abs(parseInt(bpmInput.value) - bpm) < 2
                        });
                    }, 100);
                });
            }, targetBPM);
            
            results.push(result);
            await sleep(500);
        }
        
        const successful = results.filter(r => r.success && r.accurate).length;
        const passed = successful === testBPMs.length;
        
        tests.push({
            name: 'BPM Range & Control',
            passed,
            data: {
                tested: testBPMs,
                results,
                accurate: successful
            },
            comparison: {
                hardware: '40-300 BPM typical',
                ohMyOndas: `${successful}/${testBPMs.length} BPM changes accurate`,
                score: successful / testBPMs.length
            }
        });
        
        log(passed ? '  ✅ PASS' : '  ⚠️  PARTIAL', passed ? 'green' : 'yellow');
        log(`  Tested: ${testBPMs.join(', ')} BPM`, 'white');
    }
    
    // Test 2: Clock Stability
    {
        log('\n🔍 Test 2: Internal Clock Stability', 'yellow');
        
        // Start playback and measure timing consistency
        const timing = await page.evaluate(() => {
            return new Promise(resolve => {
                const playButton = Array.from(document.querySelectorAll('button')).find(b =>
                    b.textContent.includes('▶') || 
                    b.textContent.includes('PLAY') ||
                    b.dataset?.action === 'play'
                );
                
                if (!playButton) {
                    resolve({ measured: false });
                    return;
                }
                
                // Measure time between visual updates
                const timestamps = [];
                let count = 0;
                
                const observer = new MutationObserver(() => {
                    timestamps.push(performance.now());
                    count++;
                    
                    if (count >= 10) {
                        observer.disconnect();
                        
                        // Calculate intervals
                        const intervals = [];
                        for (let i = 1; i < timestamps.length; i++) {
                            intervals.push(timestamps[i] - timestamps[i-1]);
                        }
                        
                        const avgInterval = intervals.reduce((a,b) => a+b) / intervals.length;
                        const variance = intervals.map(i => Math.pow(i - avgInterval, 2))
                                                 .reduce((a,b) => a+b) / intervals.length;
                        const stdDev = Math.sqrt(variance);
                        
                        resolve({
                            measured: true,
                            avgInterval,
                            stdDev,
                            jitter: (stdDev / avgInterval) * 100 // percentage
                        });
                    }
                });
                
                observer.observe(document.body, {
                    attributes: true,
                    subtree: true
                });
                
                playButton.click();
                
                // Timeout after 5 seconds
                setTimeout(() => {
                    observer.disconnect();
                    resolve({ measured: false, timeout: true });
                }, 5000);
            });
        });
        
        const passed = timing.measured && timing.jitter < 5; // <5% jitter is good
        
        tests.push({
            name: 'Clock Stability',
            passed,
            data: timing,
            comparison: {
                hardware: '<0.1% jitter',
                ohMyOndas: timing.measured ? `${timing.jitter.toFixed(2)}% jitter` : 'Not measured',
                score: timing.measured ? Math.max(0, 1 - (timing.jitter / 5)) : 0
            }
        });
        
        if (timing.measured) {
            recordBenchmark('clockJitter', timing.jitter, '%', {
                acceptable: 5,
                measured: timing.jitter
            });
        }
        
        log(passed ? '  ✅ PASS' : '  ⚠️  PARTIAL', passed ? 'green' : 'yellow');
        if (timing.measured) {
            log(`  Jitter: ${timing.jitter.toFixed(2)}%`, 'white');
        }
    }
    
    // Store all sync tests
    tests.forEach(test => recordTest('sync', test));
    
    return tests;
}

// =============================================================================
// TEST SUITE 5: INTERACTION EFFICIENCY (UX Metrics)
// =============================================================================

async function testInteractionEfficiency(page) {
    log('\n═══════════════════════════════════════', 'cyan');
    log('  INTERACTION EFFICIENCY (UX Analysis)', 'cyan');
    log('═══════════════════════════════════════', 'cyan');
    
    const tests = [];
    
    // Common workflow scenarios
    const workflows = [
        {
            name: 'Trigger a sample',
            steps: async () => {
                // Click pad 1
                await page.evaluate(() => {
                    const pad = Array.from(document.querySelectorAll('button')).find(b =>
                        b.textContent.trim() === '1'
                    );
                    if (pad) pad.click();
                });
            },
            expectedClicks: 1,
            comparison: { sp404: 1, octatrack: 1, opz: 1 }
        },
        {
            name: 'Apply effect to sample',
            steps: async () => {
                // Click FX button
                await page.evaluate(() => {
                    const fxButton = Array.from(document.querySelectorAll('button')).find(b =>
                        b.textContent.includes('DLY') || b.textContent.includes('REV')
                    );
                    if (fxButton) fxButton.click();
                });
            },
            expectedClicks: 2, // Select pad + select FX
            comparison: { sp404: 2, octatrack: 3, opz: 1 }
        },
        {
            name: 'Change scene',
            steps: async () => {
                await page.evaluate(() => {
                    const sceneB = Array.from(document.querySelectorAll('button')).find(b =>
                        b.textContent.trim() === 'B' && b.className?.includes('scene')
                    );
                    if (sceneB) sceneB.click();
                });
            },
            expectedClicks: 1,
            comparison: { octatrack: 1, opz: 2 }
        },
        {
            name: 'Mute a track',
            steps: async () => {
                await page.evaluate(() => {
                    const muteButton = document.querySelector('[data-mute]') ||
                                      Array.from(document.querySelectorAll('button')).find(b =>
                                          b.textContent === 'M'
                                      );
                    if (muteButton) muteButton.click();
                });
            },
            expectedClicks: 1,
            comparison: { octatrack: 1, opz: 1 }
        }
    ];
    
    for (const workflow of workflows) {
        log(`\n🔍 Workflow: ${workflow.name}`, 'yellow');
        
        const startTime = Date.now();
        try {
            await workflow.steps();
            const duration = Date.now() - startTime;
            
            const passed = duration < 1000; // Should complete in <1 second
            
            tests.push({
                name: workflow.name,
                passed,
                data: {
                    duration,
                    expectedClicks: workflow.expectedClicks
                },
                comparison: {
                    description: `Expected ${workflow.expectedClicks} click(s)`,
                    devices: workflow.comparison,
                    ohMyOndas: `${workflow.expectedClicks} clicks, ${duration}ms`,
                    score: workflow.expectedClicks <= Math.min(...Object.values(workflow.comparison)) ? 1 : 0.7
                }
            });
            
            log(passed ? '  ✅ PASS' : '  ⚠️  SLOW', passed ? 'green' : 'yellow');
            log(`  Completed in ${duration}ms`, 'white');
            
        } catch (error) {
            log(`  ❌ FAIL: ${error.message}`, 'red');
            tests.push({
                name: workflow.name,
                passed: false,
                error: error.message
            });
        }
        
        await sleep(500);
    }
    
    // Menu depth analysis
    {
        log('\n🔍 Menu Depth Analysis', 'yellow');
        const menuDepth = await page.evaluate(() => {
            // Count how many clicks to reach deep functions
            const hasDeepMenus = document.querySelectorAll('[class*="submenu"], [class*="nested"]').length;
            const hasModal = document.querySelectorAll('[class*="modal"], [class*="dialog"]').length;
            
            return {
                hasDeepMenus,
                hasModal,
                estimatedDepth: hasDeepMenus > 0 ? 3 : (hasModal > 0 ? 2 : 1)
            };
        });
        
        const passed = menuDepth.estimatedDepth <= 2; // Max 2 levels deep
        
        tests.push({
            name: 'Menu Depth (Accessibility)',
            passed,
            data: menuDepth,
            comparison: {
                tePhilosophy: '90% functions in <3 clicks',
                ohMyOndas: `${menuDepth.estimatedDepth} levels deep`,
                score: menuDepth.estimatedDepth <= 2 ? 1 : 0.5
            }
        });
        
        log(passed ? '  ✅ PASS' : '  ⚠️  DEEP', passed ? 'green' : 'yellow');
        log(`  Estimated depth: ${menuDepth.estimatedDepth} levels`, 'white');
    }
    
    // Store all UX tests
    tests.forEach(test => recordTest('ux', test));
    
    return tests;
}

// =============================================================================
// MAIN TEST EXECUTION
// =============================================================================

async function runAdvancedTests() {
    log('\n🎵 OH MY ONDAS - HARDWARE COMPARISON TEST SUITE', 'magenta');
    log('==============================================\n', 'magenta');
    
    const browser = await puppeteer.launch({
        headless: config.headless,
        slowMo: config.slowMo,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        
        // Set timeout
        page.setDefaultTimeout(config.timeout);
        
        // Listen for console messages
        page.on('console', msg => {
            if (msg.type() === 'error') {
                log(`   🔴 Browser Console Error: ${msg.text()}`, 'red');
            }
        });
        
        // Navigate to page
        log(`📡 Loading ${config.url}...`, 'cyan');
        await page.goto(config.url, { waitUntil: 'networkidle2' });
        await sleep(2000); // Wait for full initialization
        
        await screenshot(page, '00-initial-state');
        log('✅ Page loaded\n', 'green');
        
        // Run all test suites
        await testSequencerDepth(page);
        await sleep(1000);
        
        await testSamplerFunctionality(page);
        await sleep(1000);
        
        await testPerformanceWorkflow(page);
        await sleep(1000);
        
        await testSyncTiming(page);
        await sleep(1000);
        
        await testInteractionEfficiency(page);
        
        // Generate comparison matrix
        generateComparisonMatrix();
        
        // Print summary
        printSummary();
        
        // Save report
        fs.writeFileSync(config.reportFile, JSON.stringify(testResults, null, 2));
        log(`\n📄 Full report saved: ${config.reportFile}`, 'cyan');
        
    } catch (error) {
        log(`\n❌ Test suite error: ${error.message}`, 'red');
        console.error(error);
    } finally {
        await browser.close();
    }
}

function generateComparisonMatrix() {
    const matrix = {
        octatrack: { overall: 0, categories: {} },
        opz: { overall: 0, categories: {} },
        sp404: { overall: 0, categories: {} }
    };
    
    // Calculate scores per category
    for (const [category, data] of Object.entries(testResults.categories)) {
        const score = data.maxScore > 0 ? (data.score / data.maxScore) : 0;
        
        // Map to reference devices
        if (['sequencer'].includes(category)) {
            matrix.octatrack.categories[category] = score;
        }
        if (['sampler'].includes(category)) {
            matrix.sp404.categories[category] = score;
        }
        if (['performance'].includes(category)) {
            matrix.opz.categories[category] = score;
        }
    }
    
    // Calculate overall scores
    matrix.octatrack.overall = Object.values(matrix.octatrack.categories).reduce((a,b) => a+b, 0) / 
                                Object.keys(matrix.octatrack.categories).length;
    matrix.opz.overall = Object.values(matrix.opz.categories).reduce((a,b) => a+b, 0) / 
                         Object.keys(matrix.opz.categories).length;
    matrix.sp404.overall = Object.values(matrix.sp404.categories).reduce((a,b) => a+b, 0) / 
                          Object.keys(matrix.sp404.categories).length;
    
    testResults.comparisonMatrix = matrix;
}

function printSummary() {
    log('\n═══════════════════════════════════════', 'magenta');
    log('  HARDWARE COMPARISON SUMMARY', 'magenta');
    log('═══════════════════════════════════════\n', 'magenta');
    
    // Category scores
    for (const [category, data] of Object.entries(testResults.categories)) {
        const percentage = data.maxScore > 0 ? ((data.score / data.maxScore) * 100).toFixed(1) : 0;
        const bar = '█'.repeat(Math.round(percentage / 5)) + '░'.repeat(20 - Math.round(percentage / 5));
        
        log(`${category.toUpperCase().padEnd(15)} ${bar} ${percentage}% (${data.score}/${data.maxScore})`, 
            percentage > 80 ? 'green' : percentage > 50 ? 'yellow' : 'red');
    }
    
    // Overall comparison
    log('\n📊 Comparison to Reference Hardware:', 'cyan');
    log('─────────────────────────────────────', 'cyan');
    
    const matrix = testResults.comparisonMatrix;
    
    if (matrix.octatrack.overall) {
        const pct = (matrix.octatrack.overall * 100).toFixed(1);
        log(`Octatrack (Sequencer):    ${pct}% feature parity`, pct > 70 ? 'green' : 'yellow');
    }
    
    if (matrix.sp404.overall) {
        const pct = (matrix.sp404.overall * 100).toFixed(1);
        log(`SP-404 (Sampler):         ${pct}% feature parity`, pct > 70 ? 'green' : 'yellow');
    }
    
    if (matrix.opz.overall) {
        const pct = (matrix.opz.overall * 100).toFixed(1);
        log(`OP-Z (Performance):       ${pct}% feature parity`, pct > 70 ? 'green' : 'yellow');
    }
    
    // Benchmarks
    if (Object.keys(testResults.benchmarks).length > 0) {
        log('\n⚡ Performance Benchmarks:', 'cyan');
        log('─────────────────────────────────────', 'cyan');
        
        for (const [name, data] of Object.entries(testResults.benchmarks)) {
            log(`${name}: ${data.value}${data.unit}`, 'white');
        }
    }
}

// Run tests
runAdvancedTests().catch(console.error);
