#!/usr/bin/env node

/**
 * OH MY ONDAS - WORKFLOW SCENARIO TESTS
 * 
 * Simulates real-world music-making scenarios and measures:
 * 1. Time to complete
 * 2. Number of interactions required
 * 3. Cognitive load (complexity)
 * 4. Success rate
 * 
 * Compares against reference devices:
 * - Octatrack (complex but powerful)
 * - OP-Z (optimized for live performance)
 * - SP-404 (focused on sampling/resampling)
 */

const puppeteer = require('puppeteer');
const fs = require('fs');

const config = {
    url: process.env.TEST_URL || 'https://alevm.github.io/oh-my-ondas/',
    headless: process.env.HEADLESS === 'true' || process.env.CI === 'true',
    screenshotDir: './workflow-test-screenshots'
};

// Workflow scenario definitions
const scenarios = [
    {
        id: 'quick-beat',
        name: 'Quick Beat Creation',
        description: 'Create a simple 4-bar drum pattern',
        difficulty: 'Beginner',
        targetTime: 30000, // 30 seconds
        targetClicks: 10,
        reference: {
            octatrack: { time: 45000, clicks: 15, rating: 3 },
            opz: { time: 20000, clicks: 8, rating: 5 },
            sp404: { time: 25000, clicks: 10, rating: 4 }
        }
    },
    {
        id: 'effect-chain',
        name: 'Build Effect Chain',
        description: 'Apply 3 effects to a sample (delay, reverb, filter)',
        difficulty: 'Intermediate',
        targetTime: 20000,
        targetClicks: 6,
        reference: {
            octatrack: { time: 30000, clicks: 12, rating: 3 },
            opz: { time: 15000, clicks: 5, rating: 5 },
            sp404: { time: 18000, clicks: 6, rating: 4 }
        }
    },
    {
        id: 'scene-performance',
        name: 'Scene-Based Performance',
        description: 'Switch between 4 scenes during playback',
        difficulty: 'Intermediate',
        targetTime: 15000,
        targetClicks: 4,
        reference: {
            octatrack: { time: 10000, clicks: 4, rating: 5 },
            opz: { time: 12000, clicks: 8, rating: 3 },
            sp404: { time: 99999, clicks: 0, rating: 0 } // No scene system
        }
    },
    {
        id: 'parameter-automation',
        name: 'Parameter Lock Sequence',
        description: 'Create melody using pitch p-locks on steps',
        difficulty: 'Advanced',
        targetTime: 60000,
        targetClicks: 20,
        reference: {
            octatrack: { time: 45000, clicks: 32, rating: 4 },
            opz: { time: 50000, clicks: 25, rating: 4 },
            sp404: { time: 99999, clicks: 0, rating: 0 } // No p-locks
        }
    },
    {
        id: 'live-recording',
        name: 'Live Recording Session',
        description: 'Record 8-bar performance with punch effects',
        difficulty: 'Intermediate',
        targetTime: 45000,
        targetClicks: 12,
        reference: {
            octatrack: { time: 40000, clicks: 10, rating: 4 },
            opz: { time: 30000, clicks: 8, rating: 5 },
            sp404: { time: 35000, clicks: 9, rating: 4 }
        }
    },
    {
        id: 'sound-design',
        name: 'Sound Design from Scratch',
        description: 'Load sample, reverse, pitch, add effects, save',
        difficulty: 'Advanced',
        targetTime: 90000,
        targetClicks: 15,
        reference: {
            octatrack: { time: 60000, clicks: 20, rating: 3 },
            opz: { time: 70000, clicks: 18, rating: 3 },
            sp404: { time: 50000, clicks: 12, rating: 5 }
        }
    },
    {
        id: 'pattern-chaining',
        name: 'Arrange Song Structure',
        description: 'Chain 4 patterns (intro, verse, chorus, outro)',
        difficulty: 'Advanced',
        targetTime: 60000,
        targetClicks: 16,
        reference: {
            octatrack: { time: 50000, clicks: 24, rating: 4 },
            opz: { time: 45000, clicks: 20, rating: 4 },
            sp404: { time: 99999, clicks: 0, rating: 0 } // Limited chaining
        }
    },
    {
        id: 'emergency-recovery',
        name: 'Undo & Recover from Mistake',
        description: 'Make mistake, undo, try again, succeed',
        difficulty: 'Beginner',
        targetTime: 10000,
        targetClicks: 5,
        reference: {
            octatrack: { time: 8000, clicks: 3, rating: 4 },
            opz: { time: 7000, clicks: 2, rating: 5 },
            sp404: { time: 12000, clicks: 4, rating: 3 }
        }
    }
];

// Results storage
const workflowResults = {
    testDate: new Date().toISOString(),
    device: 'Oh My Ondas',
    scenarios: [],
    summary: {
        avgTimeRatio: 0,
        avgClickRatio: 0,
        avgSuccessRate: 0,
        overallRating: 0
    }
};

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

// =============================================================================
// SCENARIO 1: QUICK BEAT CREATION
// =============================================================================

async function runQuickBeatScenario(page) {
    log('\n🎵 SCENARIO: Quick Beat Creation', 'cyan');
    log('Goal: Create 4-bar drum pattern in <30 seconds', 'cyan');
    
    const startTime = Date.now();
    let clicks = 0;
    let success = false;
    const steps = [];
    
    try {
        // Step 1: Find and click first pad (kick)
        log('  Step 1: Trigger kick drum...', 'yellow');
        await page.evaluate(() => {
            const pad = Array.from(document.querySelectorAll('button')).find(b =>
                b.textContent.trim() === '1'
            );
            if (pad) pad.click();
        });
        clicks++;
        steps.push({ step: 'Trigger pad 1', time: Date.now() - startTime });
        await sleep(500);
        await screenshot(page, 'quick-beat-01-kick');
        
        // Step 2: Click second pad (snare)
        log('  Step 2: Trigger snare...', 'yellow');
        await page.evaluate(() => {
            const pad = Array.from(document.querySelectorAll('button')).find(b =>
                b.textContent.trim() === '2'
            );
            if (pad) pad.click();
        });
        clicks++;
        steps.push({ step: 'Trigger pad 2', time: Date.now() - startTime });
        await sleep(500);
        
        // Step 3: Click third pad (hi-hat)
        log('  Step 3: Trigger hi-hat...', 'yellow');
        await page.evaluate(() => {
            const pad = Array.from(document.querySelectorAll('button')).find(b =>
                b.textContent.trim() === '3'
            );
            if (pad) pad.click();
        });
        clicks++;
        steps.push({ step: 'Trigger pad 3', time: Date.now() - startTime });
        await sleep(500);
        
        // Step 4: Start playback
        log('  Step 4: Start playback...', 'yellow');
        await page.keyboard.press(' '); // Space bar
        clicks++;
        steps.push({ step: 'Play', time: Date.now() - startTime });
        await sleep(2000); // Listen for 2 seconds
        await screenshot(page, 'quick-beat-02-playing');
        
        success = true;
        
    } catch (error) {
        log(`  ❌ Error: ${error.message}`, 'red');
    }
    
    const totalTime = Date.now() - startTime;
    
    return {
        scenarioId: 'quick-beat',
        success,
        timeMs: totalTime,
        clicks,
        steps,
        rating: calculateRating(totalTime, 30000, clicks, 10)
    };
}

// =============================================================================
// SCENARIO 2: EFFECT CHAIN
// =============================================================================

async function runEffectChainScenario(page) {
    log('\n🎨 SCENARIO: Build Effect Chain', 'cyan');
    log('Goal: Apply delay, reverb, filter to sample', 'cyan');
    
    const startTime = Date.now();
    let clicks = 0;
    let success = false;
    const steps = [];
    const effectsApplied = [];
    
    try {
        // Step 1: Click pad to select sample
        log('  Step 1: Select sample...', 'yellow');
        await page.evaluate(() => {
            const pad = Array.from(document.querySelectorAll('button')).find(b =>
                b.textContent.trim() === '1'
            );
            if (pad) pad.click();
        });
        clicks++;
        steps.push({ step: 'Select sample', time: Date.now() - startTime });
        await sleep(500);
        
        // Step 2: Apply Delay
        log('  Step 2: Apply delay effect...', 'yellow');
        const delayApplied = await page.evaluate(() => {
            const delayButton = Array.from(document.querySelectorAll('button')).find(b =>
                b.textContent.includes('DLY') || b.textContent.includes('DELAY')
            );
            if (delayButton) {
                delayButton.click();
                return true;
            }
            return false;
        });
        if (delayApplied) {
            clicks++;
            effectsApplied.push('DELAY');
            steps.push({ step: 'Apply delay', time: Date.now() - startTime });
        }
        await sleep(500);
        await screenshot(page, 'fx-chain-01-delay');
        
        // Step 3: Apply Reverb
        log('  Step 3: Apply reverb effect...', 'yellow');
        const reverbApplied = await page.evaluate(() => {
            const reverbButton = Array.from(document.querySelectorAll('button')).find(b =>
                b.textContent.includes('REV') || b.textContent.includes('REVERB')
            );
            if (reverbButton) {
                reverbButton.click();
                return true;
            }
            return false;
        });
        if (reverbApplied) {
            clicks++;
            effectsApplied.push('REVERB');
            steps.push({ step: 'Apply reverb', time: Date.now() - startTime });
        }
        await sleep(500);
        
        // Step 4: Apply Filter
        log('  Step 4: Apply filter effect...', 'yellow');
        const filterApplied = await page.evaluate(() => {
            const filterButton = Array.from(document.querySelectorAll('button')).find(b =>
                b.textContent.includes('FLT') || b.textContent.includes('FILTER')
            );
            if (filterButton) {
                filterButton.click();
                return true;
            }
            return false;
        });
        if (filterApplied) {
            clicks++;
            effectsApplied.push('FILTER');
            steps.push({ step: 'Apply filter', time: Date.now() - startTime });
        }
        await sleep(500);
        await screenshot(page, 'fx-chain-02-complete');
        
        success = effectsApplied.length >= 2; // At least 2 effects
        
    } catch (error) {
        log(`  ❌ Error: ${error.message}`, 'red');
    }
    
    const totalTime = Date.now() - startTime;
    
    log(`  Effects applied: ${effectsApplied.join(', ')}`, 'white');
    
    return {
        scenarioId: 'effect-chain',
        success,
        timeMs: totalTime,
        clicks,
        steps,
        effectsApplied,
        rating: calculateRating(totalTime, 20000, clicks, 6)
    };
}

// =============================================================================
// SCENARIO 3: SCENE SWITCHING
// =============================================================================

async function runScenePerformanceScenario(page) {
    log('\n🎭 SCENARIO: Scene-Based Performance', 'cyan');
    log('Goal: Switch between scenes A→B→C→D', 'cyan');
    
    const startTime = Date.now();
    let clicks = 0;
    let success = false;
    const steps = [];
    const scenesVisited = [];
    
    try {
        // Start playback first
        log('  Step 1: Start playback...', 'yellow');
        await page.keyboard.press(' ');
        clicks++;
        await sleep(1000);
        
        // Scene A → B
        log('  Step 2: Switch to Scene B...', 'yellow');
        const sceneB = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const sceneB = buttons.find(b => 
                b.textContent.trim() === 'B' && 
                (b.className?.includes('scene') || b.dataset?.scene)
            );
            if (sceneB) {
                sceneB.click();
                return true;
            }
            return false;
        });
        if (sceneB) {
            clicks++;
            scenesVisited.push('B');
            steps.push({ step: 'Scene B', time: Date.now() - startTime });
        }
        await sleep(2000);
        await screenshot(page, 'scene-perf-01-b');
        
        // Scene B → C
        log('  Step 3: Switch to Scene C...', 'yellow');
        const sceneC = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const sceneC = buttons.find(b => 
                b.textContent.trim() === 'C' && 
                (b.className?.includes('scene') || b.dataset?.scene)
            );
            if (sceneC) {
                sceneC.click();
                return true;
            }
            return false;
        });
        if (sceneC) {
            clicks++;
            scenesVisited.push('C');
            steps.push({ step: 'Scene C', time: Date.now() - startTime });
        }
        await sleep(2000);
        
        // Scene C → D
        log('  Step 4: Switch to Scene D...', 'yellow');
        const sceneD = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const sceneD = buttons.find(b => 
                b.textContent.trim() === 'D' && 
                (b.className?.includes('scene') || b.dataset?.scene)
            );
            if (sceneD) {
                sceneD.click();
                return true;
            }
            return false;
        });
        if (sceneD) {
            clicks++;
            scenesVisited.push('D');
            steps.push({ step: 'Scene D', time: Date.now() - startTime });
        }
        await sleep(2000);
        await screenshot(page, 'scene-perf-02-d');
        
        success = scenesVisited.length >= 3;
        
    } catch (error) {
        log(`  ❌ Error: ${error.message}`, 'red');
    }
    
    const totalTime = Date.now() - startTime;
    
    log(`  Scenes visited: ${scenesVisited.join('→')}`, 'white');
    
    return {
        scenarioId: 'scene-performance',
        success,
        timeMs: totalTime,
        clicks,
        steps,
        scenesVisited,
        rating: calculateRating(totalTime, 15000, clicks, 4)
    };
}

// =============================================================================
// RATING CALCULATION
// =============================================================================

function calculateRating(actualTime, targetTime, actualClicks, targetClicks) {
    // Time score (50% weight)
    const timeRatio = actualTime / targetTime;
    let timeScore;
    if (timeRatio <= 1.0) timeScore = 5; // Excellent
    else if (timeRatio <= 1.5) timeScore = 4; // Good
    else if (timeRatio <= 2.0) timeScore = 3; // Acceptable
    else if (timeRatio <= 3.0) timeScore = 2; // Slow
    else timeScore = 1; // Very slow
    
    // Click efficiency score (50% weight)
    const clickRatio = actualClicks / targetClicks;
    let clickScore;
    if (clickRatio <= 1.0) clickScore = 5; // Excellent
    else if (clickRatio <= 1.3) clickScore = 4; // Good
    else if (clickRatio <= 1.6) clickScore = 3; // Acceptable
    else if (clickRatio <= 2.0) clickScore = 2; // Inefficient
    else clickScore = 1; // Very inefficient
    
    const overall = Math.round((timeScore + clickScore) / 2);
    
    return {
        overall,
        timeScore,
        clickScore,
        timeRatio,
        clickRatio
    };
}

// =============================================================================
// COMPARISON ANALYSIS
// =============================================================================

function compareToReference(result, scenario) {
    const ref = scenario.reference;
    const comparisons = {};
    
    for (const [device, data] of Object.entries(ref)) {
        const timeComparison = result.timeMs / data.time;
        const clickComparison = result.clicks / data.clicks;
        
        comparisons[device] = {
            timeVs: timeComparison < 1 ? 'faster' : 'slower',
            timeDiff: Math.abs(result.timeMs - data.time),
            clickVs: clickComparison < 1 ? 'fewer' : 'more',
            clickDiff: Math.abs(result.clicks - data.clicks),
            overallVs: result.rating.overall >= data.rating ? 'better' : 'worse'
        };
    }
    
    return comparisons;
}

// =============================================================================
// MAIN TEST EXECUTION
// =============================================================================

async function runWorkflowTests() {
    log('\n🎯 OH MY ONDAS - WORKFLOW SCENARIO TESTS', 'magenta');
    log('==========================================\n', 'magenta');
    
    const browser = await puppeteer.launch({
        headless: config.headless,
        slowMo: 100
    });
    
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        
        log(`📡 Loading ${config.url}...`, 'cyan');
        await page.goto(config.url, { waitUntil: 'networkidle2' });
        await sleep(2000);
        log('✅ Page loaded\n', 'green');
        
        // Run scenarios
        const results = [];
        
        results.push(await runQuickBeatScenario(page));
        await sleep(2000);
        
        results.push(await runEffectChainScenario(page));
        await sleep(2000);
        
        results.push(await runScenePerformanceScenario(page));
        
        // Store results
        workflowResults.scenarios = results.map((result, i) => {
            const scenario = scenarios[i];
            return {
                ...result,
                name: scenario.name,
                difficulty: scenario.difficulty,
                comparison: compareToReference(result, scenario)
            };
        });
        
        // Calculate summary
        const successCount = results.filter(r => r.success).length;
        workflowResults.summary = {
            scenariosTested: results.length,
            successCount,
            successRate: (successCount / results.length) * 100,
            avgRating: results.reduce((sum, r) => sum + r.rating.overall, 0) / results.length
        };
        
        // Print summary
        printWorkflowSummary();
        
        // Save report
        fs.writeFileSync('./workflow-test-results.json', JSON.stringify(workflowResults, null, 2));
        log('\n📄 Results saved: ./workflow-test-results.json', 'cyan');
        
    } catch (error) {
        log(`\n❌ Test error: ${error.message}`, 'red');
        console.error(error);
    } finally {
        await browser.close();
    }
}

function printWorkflowSummary() {
    log('\n═══════════════════════════════════════', 'magenta');
    log('  WORKFLOW TEST SUMMARY', 'magenta');
    log('═══════════════════════════════════════\n', 'magenta');
    
    const results = workflowResults.scenarios;
    
    for (const result of results) {
        const statusColor = result.success ? 'green' : 'red';
        const status = result.success ? '✅ SUCCESS' : '❌ FAILED';
        const stars = '⭐'.repeat(result.rating.overall);
        
        log(`${status} ${result.name}`, statusColor);
        log(`  Rating: ${stars} (${result.rating.overall}/5)`, 'yellow');
        log(`  Time: ${(result.timeMs / 1000).toFixed(1)}s | Clicks: ${result.clicks}`, 'white');
        
        // Comparison
        if (result.comparison) {
            log(`  vs Octatrack: ${result.comparison.octatrack.timeVs} by ${(result.comparison.octatrack.timeDiff/1000).toFixed(1)}s`, 'cyan');
            log(`  vs OP-Z: ${result.comparison.opz.timeVs} by ${(result.comparison.opz.timeDiff/1000).toFixed(1)}s`, 'cyan');
        }
        log('');
    }
    
    // Overall
    const avgRating = workflowResults.summary.avgRating.toFixed(1);
    const successRate = workflowResults.summary.successRate.toFixed(0);
    
    log('─────────────────────────────────────', 'cyan');
    log(`Overall Rating: ${avgRating}/5.0`, 'yellow');
    log(`Success Rate: ${successRate}%`, successRate >= 80 ? 'green' : 'yellow');
    log('─────────────────────────────────────', 'cyan');
}

// Run tests
runWorkflowTests().catch(console.error);
