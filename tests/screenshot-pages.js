const puppeteer = require('puppeteer');
const path = require('path');

const pages = [
    { name: 'index',    url: 'http://localhost:8080/index.html' },
    { name: 'app',      url: 'http://localhost:8080/app.html' },
    { name: 'design',   url: 'http://localhost:8080/design.html' },
    { name: 'analysis', url: 'http://localhost:8080/analysis.html' },
    { name: 'about',    url: 'http://localhost:8080/about.html' },
    { name: 'sdlc',     url: 'http://localhost:8080/sdlc.html' },
];

(async () => {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const outDir = path.join(__dirname, 'screenshots');
    const fs = require('fs');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    for (const pg of pages) {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 900 });
        try {
            await page.goto(pg.url, { waitUntil: 'networkidle2', timeout: 10000 });
            await new Promise(r => setTimeout(r, 1000));
            const file = path.join(outDir, `${pg.name}.png`);
            await page.screenshot({ path: file, fullPage: true });
            console.log(`OK: ${pg.name} → ${file}`);
        } catch (e) {
            console.log(`FAIL: ${pg.name} → ${e.message}`);
        }
        await page.close();
    }

    await browser.close();
    console.log('Done.');
})();
