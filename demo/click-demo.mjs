// Click DEMO button via Chrome DevTools Protocol using Playwright's CDP support
import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const contexts = browser.contexts();
let page = null;

for (const ctx of contexts) {
  for (const p of ctx.pages()) {
    if (p.url().includes('app.html')) {
      page = p;
      break;
    }
  }
  if (page) break;
}

if (!page) {
  console.error('app.html page not found');
  process.exit(1);
}

console.log('Found:', await page.title());

// Click the DEMO button
const btn = await page.$('#btnDemo');
if (btn) {
  await btn.click();
  console.log('DEMO button clicked');
} else {
  console.error('btnDemo not found on page');
  process.exit(1);
}

// Disconnect (don't close the browser)
await browser.close();
