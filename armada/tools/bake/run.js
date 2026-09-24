// Bakes every asset (or the ones named on the command line) into ../../assets.
//   NODE_PATH=$(npm root -g) node armada/tools/bake/run.js [name ...]
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const only = process.argv.slice(2);
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-watchdog'],
  });
  const page = await browser.newPage();
  page.on('console', (m) => console.log('[page]', m.text()));
  page.on('pageerror', (e) => console.error('[page error]', e.message));
  await page.goto('file://' + path.join(__dirname, 'index.html'));
  const list = await page.evaluate(() => ASSETS.map((a) => ({ name: a.name, ext: a.format === 'jpg' ? '.jpg' : '.png' })));
  const outDir = path.join(__dirname, '..', '..', 'assets');
  for (const { name, ext } of list) {
    if (only.length && !only.includes(name)) continue;
    const t0 = Date.now();
    const result = await page.evaluate((n) => {
      try { return { url: bake(ASSETS.find((a) => a.name === n)) }; }
      catch (e) { return { error: String(e.message || e) }; }
    }, name);
    if (result.error) { console.error(`${name}: ${result.error.slice(0, 4000)}`); process.exitCode = 1; continue; }
    const file = path.join(outDir, name + ext);
    fs.writeFileSync(file, Buffer.from(result.url.split(',')[1], 'base64'));
    console.log(`${name}${ext}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
  await browser.close();
})();
