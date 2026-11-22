// Rift Realm — front-end flow check on the discrete GPU: Start → Map → Character → Loading → in game.
//   node scripts/riftrealm/menu_flow.mjs [baseUrl] [outDir]
// Drives the menus with a simulated controller (navigator.getGamepads stub: d-pad / A / B / RB) and the keyboard,
// screenshots each screen and the loading screen every 20 s, then enters the rift and screenshots the game.
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://127.0.0.1:4375/index.html';
const OUT = process.argv[3] ?? 'D:/rr_work/loadtime/flow';
fs.mkdirSync(OUT, { recursive: true });

const ctx = await chromium.launchPersistentContext('D:/rr_work/loadtime/profile-flow', {
  headless: false, viewport: { width: 1440, height: 810 },
  args: ['--enable-unsafe-webgpu', '--force_high_performance_gpu', '--window-position=-32000,-32000', '--window-size=1460,860',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-background-timer-throttling', '--autoplay-policy=no-user-gesture-required'],
});
const page = ctx.pages()[0] ?? await ctx.newPage();
// a fake standard gamepad the test presses buttons on
await page.addInitScript(() => {
  const pad = { id: 'test pad', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  navigator.getGamepads = () => [pad];
  window.__pad = (b, down) => { pad.buttons[b].pressed = down; pad.buttons[b].value = down ? 1 : 0; };
});
page.on('console', (m) => { const t = m.text(); if (/\[load\]|error/i.test(t)) console.log('[page]', t.slice(0, 160)); });
const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 60000 }).catch(() => console.log('  (screenshot timed out)', name)); console.log('shot', name); };
const press = async (b) => { await page.evaluate((b) => window.__pad(b, true), b); await page.waitForTimeout(320); await page.evaluate((b) => window.__pad(b, false), b); await page.waitForTimeout(250); };
const screen = () => page.evaluate(() => document.querySelector('.rr-menu')?.dataset.screen ?? (document.querySelector('.rr-load') ? 'loading' : 'game'));

const t0 = Date.now();
await page.goto(base, { timeout: 120000 });
await page.waitForSelector('.rr-menu .rr-start.on');
await page.waitForTimeout(2500);
await shot('1-start');
// controller: down to Settings, A, RB raises volume, B back, up to Start, A
await press(13); await press(0); await page.waitForTimeout(600); await shot('2-settings');
await press(5); await press(1); await press(12);
console.log('screen after settings', await screen());
await press(0);
await page.waitForTimeout(2500);
console.log('screen', await screen());
await shot('3-map-elderwood');
await press(15); await press(15); await page.waitForTimeout(2500); await shot('4-map-glacial');
await press(14); await press(14); // back to Elderwood
// keyboard confirms the map
await page.keyboard.press('Enter');
await page.waitForTimeout(8000);
console.log('screen', await screen());
await shot('5-char-aegis');
await press(5); await page.waitForTimeout(6000); await shot('6-char-stalker');
await page.click('.rr-arrow.r'); // the right arrow next to the pedestal (mouse)
await page.waitForTimeout(6000); await shot('7-char-seraph');
await press(4); // LB back to the Void Stalker
await page.waitForTimeout(1500);
const tPick = Date.now();
await press(0); // A: enter the rift
for (let i = 0; ; i++) {
  await page.waitForTimeout(20000);
  const ready = await page.evaluate(() => !!document.querySelector('.rr-load.is-ready')).catch(() => false);
  await shot(`8-loading-${String(i).padStart(2, '0')}`);
  if (ready) break;
  if (Date.now() - tPick > 1500000) { console.log('gave up waiting'); break; }
}
console.log(`loading took ${Math.round((Date.now() - tPick) / 1000)} s (menus ${Math.round((tPick - t0) / 1000)} s)`);
await page.keyboard.press('Enter');
await page.waitForTimeout(6000);
console.log('screen', await screen());
await shot('9-game');
await page.keyboard.press('Escape'); await page.waitForTimeout(1500); await shot('10-pause');
await ctx.close();
