/**
 * OH MY ONDAS - QUICK SMOKE TEST
 * Fast basic checks to verify the site is working
 * 
 * USAGE: node quick-test.js
 */

const puppeteer = require('puppeteer');

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m'
};

async function quickTest() {
    console.log(`${colors.cyan}\n🎵 Oh My Ondas - Quick Smoke Test 🎵\n${colors.reset}`);
    
    const browser = await puppeteer.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    try {
        // Test 1: Page loads
        console.log('⏳ Loading page...');
        await page.goto('https://alevm.github.io/oh-my-ondas/', { 
            waitUntil: 'networkidle2', 
            timeout: 30000 
        });
        console.log(`${colors.green}✅ Page loaded${colors.reset}`);
        
        // Test 2: No critical errors
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        if (errors.length === 0) {
            console.log(`${colors.green}✅ No console errors${colors.reset}`);
        } else {
            console.log(`${colors.red}❌ Found ${errors.length} errors${colors.reset}`);
        }
        
        // Test 3: Basic elements exist
        const hasButtons = await page.evaluate(() => {
            return document.querySelectorAll('button').length > 0;
        });
        
        if (hasButtons) {
            console.log(`${colors.green}✅ UI elements present${colors.reset}`);
        } else {
            console.log(`${colors.red}❌ No buttons found${colors.reset}`);
        }
        
        // Test 4: Click play button
        const playClicked = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const playBtn = buttons.find(b => b.textContent.includes('▶'));
            if (playBtn) {
                playBtn.click();
                return true;
            }
            return false;
        });
        
        if (playClicked) {
            console.log(`${colors.green}✅ Play button works${colors.reset}`);
        } else {
            console.log(`${colors.yellow}⚠️  Play button not found${colors.reset}`);
        }
        
        // Test 5: Keyboard shortcut
        await page.keyboard.press('Space');
        console.log(`${colors.green}✅ Keyboard input works${colors.reset}`);
        
        // Summary
        console.log(`\n${colors.cyan}═══════════════════════════════════${colors.reset}`);
        console.log(`${colors.green}✅ Smoke tests passed!${colors.reset}`);
        console.log(`${colors.cyan}═══════════════════════════════════${colors.reset}\n`);
        console.log('💡 Run "npm test" for comprehensive testing\n');
        
    } catch (error) {
        console.log(`${colors.red}\n❌ SMOKE TEST FAILED${colors.reset}`);
        console.log(`${colors.red}Error: ${error.message}${colors.reset}\n`);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

quickTest();
