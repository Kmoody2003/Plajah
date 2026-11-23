// Vesselbound character select: pedestal screenshots of each vessel (headed Chrome on the RTX).
//   node scripts/riftrealm/pedestal_shots.mjs [baseUrl] [label]
// → D:/rr_work/pedestal/<label>-<vessel>.png (+ a 2nd frame 1.5 s later per vessel, to see the idle move)
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://127.0.0.1:4375/index.html';
const label = process.argv[3] ?? 'shot';
const OUT = 'D:/rr_work/pedestal';
fs.mkdirSync(OUT, { recursive: true });
const ctx = await chromium.launchPersistentContext('D:/rr_work/pedestal/profile', {
  headless: false, viewport: { width: 1440, height: 810 },
  args: ['--enable-unsafe-webgpu', '--force_high_performance_gpu', '--window-position=-32000,-32000', '--window-size=1460,860',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-background-timer-throttling', '--autoplay-policy=no-user-gesture-required'],
});
const page = ctx.pages()[0] ?? await ctx.newPage();
page.on('console', (m) => { if (/error|pedestal/i.test(m.text())) console.log('[page]', m.text().slice(0, 200)); });
await page.goto(base, { timeout: 120000 });
await page.waitForSelector('.rr-menu .rr-start.on');
await page.waitForTimeout(1500);
await page.keyboard.press('Enter'); await page.waitForTimeout(1500);
await page.keyboard.press('Enter');
await page.waitForFunction(() => document.querySelector('.rr-menu')?.classList.contains('rr-live3d'), null, { timeout: 120000 });
for (const id of ['aegis', 'stalker', 'seraph']) {
  await page.waitForFunction(() => document.querySelector('.rr-menu')?.classList.contains('rr-live3d'), null, { timeout: 120000 });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}/${label}-${id}.png` });
  await page.waitForTimeout(8000); // a later frame: the pose must hold (no drift)
  await page.screenshot({ path: `${OUT}/${label}-${id}-b.png` });
  console.log('shot', label, id);
  await page.keyboard.press('ArrowRight');
}
await ctx.close();
