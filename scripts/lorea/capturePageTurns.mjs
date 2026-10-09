// Visual proof for the Lorea page turns: freezes every transition at 0/30/60/90% in the lab and saves PNGs.
//   1) npx vite --config page-turn-lab.vite.config.mjs        (serves http://127.0.0.1:3140)
//   2) node scripts/lorea/capturePageTurns.mjs [outDir] [styles,comma,separated] [variants]
// variants: ltr (default), rtl, spread, back  (back = turning to the previous page)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const out = path.resolve(process.argv[2] || 'docs/lorea-page-turns');
const all = ['curl', 'flip', 'slide', 'cover', 'dissolve', 'wipe', 'iris', 'zoom', 'cardflip', 'cube'];
const styles = (process.argv[3] || all.join(',')).split(',');
const variants = (process.argv[4] || 'ltr').split(',');
const steps = [0, 0.3, 0.6, 0.9];
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
for (const v of variants) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 760 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
  await page.goto('http://127.0.0.1:3140/page-turn-lab.html', { waitUntil: 'load', timeout: 90000 });
  await page.waitForSelector('[data-pt-root]', { timeout: 90000 });
  for (const s of styles) {
    await page.evaluate(([style, rtl, spread]) => { window.__lab.end(); window.__lab.set({ style, rtl, spread }); }, [s, v === 'rtl', v === 'spread']);
    await page.waitForTimeout(250);
    for (const p of steps) {
      await page.evaluate(([dir, pp]) => window.__lab.scrub(dir, pp), [v === 'back' ? -1 : 1, p]);
      await page.waitForTimeout(220);
      const el = await page.$('[data-pt-root]');
      const box = await el.boundingBox();
      const pad = 70;
      const file = path.join(out, `${s}-${v}-${String(Math.round(p * 100)).padStart(3, '0')}.png`);
      await page.screenshot({ path: file, clip: { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.width + pad * 2, height: box.height + pad * 2 } });
      console.log(file);
    }
  }
  await page.close();
}
await browser.close();
