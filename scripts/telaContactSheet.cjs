// telaContactSheet — rasterize per-template proof pages with headless Chrome and tile them
// into contact sheets for design review.  node scripts/telaContactSheet.cjs <which> [perSheet]
const puppeteer = require('puppeteer');
const sharp = require('sharp');
const fs = require('fs'); const path = require('path');
const which = process.argv[2] || 'eras'; const per = +(process.argv[3] || 6);
const dir = path.resolve('.tela-proofs/each'); const out = path.resolve('.tela-proofs/png'); fs.mkdirSync(out, { recursive: true });
const prefix = which === 'eras' ? 'era-' : which === 'lower' ? 'lower-' : which === 'pub' ? 'pub-' : 'creative-';
const files = fs.readdirSync(dir).filter(f => f.startsWith(prefix) && f.endsWith('.html')).sort();
(async () => {
  const browser = await puppeteer.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox'] });
  const page = await browser.newPage(); await page.setViewport({ width: 1240, height: 900, deviceScaleFactor: 1.5 });
  const shots = [];
  for (const f of files) {
    await page.goto(`http://localhost:5179/each/${f}`, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.evaluate(() => document.fonts.ready); await new Promise(r => setTimeout(r, 300));
    const card = await page.$('.card'); const box = await card.boundingBox();
    const buf = await card.screenshot({ type: 'png' }); shots.push({ f, buf, h: box.height });
    fs.writeFileSync(path.join(out, f.replace('.html', '.png')), buf);
  }
  await browser.close();
  // Tile `per` cards per sheet, stacked vertically.
  for (let i = 0; i < shots.length; i += per) {
    const group = shots.slice(i, i + per);
    const metas = await Promise.all(group.map(s => sharp(s.buf).metadata()));
    const W = Math.max(...metas.map(m => m.width)); const H = metas.reduce((a, m) => a + m.height + 20, 0);
    let y = 0; const composites = group.map((s, k) => { const c = { input: s.buf, top: y, left: 0 }; y += metas[k].height + 20; return c; });
    await sharp({ create: { width: W, height: H, channels: 3, background: '#141118' } }).composite(composites).png().toFile(path.join(out, `${which}-sheet-${Math.floor(i / per) + 1}.png`));
  }
  console.log(shots.length, 'cards →', Math.ceil(shots.length / per), 'sheets in', out);
})().catch(e => { console.error(e); process.exit(1); });
