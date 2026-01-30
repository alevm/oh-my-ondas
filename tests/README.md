# Oh My Ondas - Automated Test Suite

Comprehensive automated testing for the Oh My Ondas web application using Puppeteer (headless Chrome).

## 🚀 Quick Start

### Prerequisites
- Node.js 16 or higher
- npm or yarn

### Installation

```bash
# 1. Install dependencies
npm install

# 2. Run tests
npm test
```

That's it! The tests will run automatically and generate a report.

## 📋 What Gets Tested

The test suite covers:

1. ✅ **Page Structure** - All UI elements load correctly
2. ✅ **Transport Controls** - Play, Stop, Record, BPM
3. ✅ **Sequencer** - Steps, tracks, pattern length
4. ✅ **Pads** - All 16 pads, keyboard shortcuts
5. ✅ **Mixer** - Mute, solo, metering
6. ✅ **Synth** - Oscillators, filter, LFO, envelope
7. ✅ **Effects** - All 8 FX types, punch effects
8. ✅ **Scenes** - Scene switching, save/load
9. ✅ **Keyboard Shortcuts** - All shortcuts working
10. ✅ **Stress Tests** - Rapid input, stability

## 📊 Output

After running, you'll get:

1. **Console Output** - Real-time test results with colors
2. **Screenshots** - Saved to `./test-screenshots/`
3. **JSON Report** - `test-results.json`
4. **Markdown Report** - `test-results.md`

## 🎯 Usage Options

```bash
# Normal test (visible browser)
npm test

# Headless mode (no browser window)
npm run test:headless

# Visual mode (see browser actions)
node e2e/oh-my-ondas-test.js
```

## 🔧 Configuration

Edit the `CONFIG` object in `e2e/oh-my-ondas-test.js`:

```javascript
const CONFIG = {
    url: 'https://alevm.github.io/oh-my-ondas/',
    headless: false,  // true = invisible, false = see browser
    slowMo: 100,      // Delay between actions (ms)
    timeout: 30000,   // Test timeout (ms)
};
```

## 📸 Screenshots

Screenshots are automatically saved for key tests:
- Initial page load
- After clicking play
- BPM changes
- Sequencer interactions
- FX activation
- Settings menu
- And more...

## 🐛 Debugging

If tests fail:

1. **Check screenshots** in `./test-screenshots/`
2. **Run in visual mode** (set `headless: false`)
3. **Check console output** for specific errors
4. **Review test-results.md** for details

## 📈 Understanding Results

**Test Statuses:**
- ✅ **PASS** - Test passed successfully
- ❌ **FAIL** - Test failed (critical issue)
- ⚠️ **WARN** - Test uncertain (needs manual verification)
- ⏭️ **SKIP** - Test skipped

**Pass Rate:**
- 80%+ = Excellent
- 50-80% = Good
- <50% = Needs attention

## 🔍 What to Look For

### High Priority Issues (FAIL)
- Buttons not clickable
- Page not loading
- Console errors
- Crashes

### Medium Priority (WARN)
- Features work but can't be verified automatically
- Visual changes expected but not detected
- Audio features (require human verification)

### Manual Verification Needed
Some tests require human verification:
- Audio playback
- Sound quality
- Timing accuracy
- Visual animations

## 🎵 Audio Testing Note

⚠️ **Important:** This test suite cannot verify audio output!

You'll need to manually verify:
- Does sound play when pads are triggered?
- Do effects actually affect the audio?
- Is the synth generating sound?
- Do samples play back correctly?

The tests verify that UI elements exist and are interactive, but cannot confirm actual audio functionality.

## 📝 Sample Report

```
═══════════════════════════════════════
  TEST SUMMARY
═══════════════════════════════════════

Total Tests:    92
✅ Passed:      67
❌ Failed:      3
⚠️  Warnings:    22
⏭️  Skipped:     0

Pass Rate: 72.8%

═══════════════════════════════════════
```

## 🤝 Contributing

To add more tests:

1. Add test function to appropriate suite
2. Use `recordTest()` to log results
3. Take screenshots for visual verification
4. Document expected behavior

Example:
```javascript
async function myNewTest(page) {
    const name = "My test description";
    
    const result = await page.evaluate(() => {
        // Test logic here
        return true; // or false
    });
    
    recordTest(testNum++, name, result ? 'PASS' : 'FAIL',
               result ? 'Success details' : 'Failure details');
    
    await screenshot(page, 'my-test');
}
```

## 📞 Support

If you encounter issues:
1. Check that Oh My Ondas is live at the URL
2. Ensure Node.js 16+ is installed
3. Clear test-screenshots folder and re-run
4. Check browser console for errors

## Environment Variables

- `TEST_URL` - Override the default test URL (default: `https://alevm.github.io/oh-my-ondas/`)
- `HEADLESS` - Set to `true` for headless mode
- `CI` - Automatically detected in CI environments

## License

GPL-3.0
