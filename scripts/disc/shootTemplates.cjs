// Render council disc templates to PNGs for review (each menu of each template, full 1920×1080).
//   node scripts/build-disc-preview.mjs && node scripts/disc/shootTemplates.cjs [templateId…]
//   → artifacts/disc-authoring-preview/shots/templates/<id>_<n>_<menu>.png
const puppeteer = require('puppeteer');
const path = require('path'), fs = require('fs');
const OUT = path.resolve('artifacts/disc-authoring-preview/shots/templates');
const URL = 'file:///' + path.resolve('artifacts/disc-authoring-preview/index.html').split(path.sep).join('/');
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['feature', 'collector4k', 'boxset', 'concert', 'arthouse', 'screener', 'documentary', 'family', 'genre'];
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await puppeteer.launch({ headless: 'new' });
  const p = await b.newPage(); await p.setViewport({ width: 1600, height: 1000 });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  for (const id of ids) {
    await p.goto(`${URL}?only=${id}`, { waitUntil: 'networkidle0', timeout: 90000 });
    await p.waitForFunction(() => (window.__shots || 0) >= document.querySelectorAll('canvas').length, { timeout: 60000 }).catch(() => errs.push(`${id}: art timeout`));
    await new Promise(r => setTimeout(r, 600));
    const shots = await p.evaluate(() => [...document.querySelectorAll('figure')].map(f => ({ name: f.querySelector('figcaption').textContent, url: f.querySelector('canvas').toDataURL('image/png') })));
    shots.forEach((s, i) => fs.writeFileSync(path.join(OUT, `${id}_${i}_${s.name.replace(/\W+/g, '_')}.png`), Buffer.from(s.url.split(',')[1], 'base64')));
    await p.screenshot({ path: path.join(OUT, `${id}__sheet.png`), fullPage: true });
    console.log(`${id}: ${shots.length} menus`);
  }
  if (errs.length) console.log('errors:', errs);
  await b.close();
})();
