// Frame-gap sampler for the lab page (headless Chromium, software rendering: relative numbers only, NOT a device measurement).
//   node scripts/living/perfLab.mjs
import { chromium } from 'playwright';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 1000 } });
await page.goto(process.env.LAB_URL || 'http://127.0.0.1:3155/living-lab.html?sound=1', { waitUntil: 'load' });
await page.waitForSelector('.pj-live-page'); await sleep(1500);
const sample = ms => page.evaluate(async ms => {
  const gaps = []; let last = performance.now(); const t0 = last;
  await new Promise(res => { const f = now => { gaps.push(now - last); last = now; if (now - t0 < ms) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
  const g = gaps.slice(3).sort((a, b) => a - b); const p = q => g[Math.min(g.length - 1, Math.floor(g.length * q))].toFixed(1);
  return `frames=${g.length} p50=${p(0.5)}ms p95=${p(0.95)}ms max=${g[g.length - 1].toFixed(1)}ms over20ms=${g.filter(x => x > 20).length}`;
}, ms);
const anims = () => page.evaluate(() => document.getAnimations().length);
console.log('idle page (ambient loops only), animations running:', await anims());
console.log(' ', await sample(3000));

for (const id of ['pip-1', 'pip-2', 'pip-3']) { const o = await page.evaluate(i => window.__lab.objCenter(i), id); await page.mouse.click(o.x, o.y); await sleep(180); }
console.log('celebrate (up to 160 particles + ambient loops):', await page.evaluate(() => window.__lab.engine().debug().particles), 'particles');
console.log(' ', await sample(1500));
await sleep(5000);
console.log('settled, loop running:', await page.evaluate(() => window.__lab.engine().debug().loop));
await page.evaluate(() => window.__lab.handle().pause());
console.log('paused: animations playing =', await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length));
await browser.close();
