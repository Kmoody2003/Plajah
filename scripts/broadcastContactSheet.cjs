// broadcastContactSheet — rasterize the broadcast proof pages with headless Chrome and tile them.
//   node scripts/broadcastContactSheet.cjs [perSheet=4] [filter]
// Reads .tela-proofs/broadcast/each/*.html (from scripts/broadcastProofs.ts), writes one PNG per
// identity and stacked sheets to .tela-proofs/broadcast/png/. Fonts come from Google, so this needs
// the network; pages are loaded from disk.
const puppeteer = require('puppeteer');
const sharp = require('sharp');
const fs = require('fs'); const path = require('path');
const per = +(process.argv[2] || 4); const filter = process.argv[3] || '';
const dir = path.resolve('.tela-proofs/broadcast/each'); const out = path.resolve('.tela-proofs/broadcast/png'); fs.mkdirSync(out, { recursive: true });
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html') && f.includes(filter)).sort();
(async () => {
  const browser = await puppeteer.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox'] });
  const page = await browser.newPage(); await page.setViewport({ width: 1240, height: 1000, deviceScaleFactor: 1 });
  const shots = [];
  for (const f of files) {
    await page.goto('file:///' + path.join(dir, f).replace(/\\/g, '/'), { waitUntil: 'networkidle0', timeout: 90000 });
    await page.evaluate(() => document.fonts.ready); await new Promise(r => setTimeout(r, 400));
    const card = await page.$('.card'); const buf = await card.screenshot({ type: 'png' });
    shots.push({ f, buf }); fs.writeFileSync(path.join(out, f.replace('.html', '.png')), buf);
  }
  await browser.close();
  for (let i = 0; i < shots.length; i += per) {
    const group = shots.slice(i, i + per);
    const metas = await Promise.all(group.map(s => sharp(s.buf).metadata()));
    const W = Math.max(...metas.map(m => m.width)); const H = metas.reduce((a, m) => a + m.height + 16, 0);
    let y = 0; const composites = group.map((s, k) => { const c = { input: s.buf, top: y, left: 0 }; y += metas[k].height + 16; return c; });
    await sharp({ create: { width: W, height: H, channels: 3, background: '#0d0b10' } }).composite(composites).png().toFile(path.join(out, `sheet-${String(Math.floor(i / per) + 1).padStart(2, '0')}.png`));
  }
  console.log(shots.length, 'identities →', Math.ceil(shots.length / per), 'sheets in', out);
})().catch(e => { console.error(e); process.exit(1); });
