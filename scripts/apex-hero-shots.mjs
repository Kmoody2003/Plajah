// Shoot Kenne's hero scenes from their camera spots in the running game (src/heroScenes.ts, window.heroScenes()), one PNG per scene.
// usage: APEX_URL=http://127.0.0.1:4333 node scripts/apex-hero-shots.mjs outDir [id,id,...]
import {chromium} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const out = path.resolve(process.argv[2] || 'hero-shots'); fs.mkdirSync(out, {recursive: true});
const only = (process.argv[3] || '').split(',').filter(Boolean);
const browser = await chromium.launch({args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']});
const page = await browser.newPage({viewport: {width: 1600, height: 900}});
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
await page.goto((process.env.APEX_URL || 'http://127.0.0.1:4333') + '/region.html', {timeout: 120000});
await page.waitForFunction(() => window.regionViewer && window.heroScenes && window.civicSpots, null, {timeout: 420000, polling: 1000});
await page.evaluate(() => { document.querySelectorAll('#mapCards').forEach((e) => { const p = e.closest('div[id]'); if (p) p.style.display = 'none'; }); window.setTod?.('golden'); window.regionViewer.wx.setWeather('clear', false, true); });
const scenes = (await page.evaluate(() => window.heroScenes())).filter((s) => !only.length || only.includes(s.id));
const report = [];
for (const s of scenes) {
  if (!s.cam) { report.push({id: s.id, missing: true}); console.log(s.id, 'no spot (not built yet)'); continue; }
  await page.evaluate(([c, a]) => window.regionViewer.cam(c[0], c[1], c[2], a[0], a[1], a[2]), [s.cam, s.at]);
  await page.waitForTimeout(6000);
  await page.screenshot({path: path.join(out, s.id + '.png'), timeout: 60000});
  report.push({id: s.id, cam: s.cam.map((v) => Math.round(v)), at: s.at.map((v) => Math.round(v)), files: s.files});
  console.log(s.id);
}
fs.writeFileSync(path.join(out, 'hero-scenes.json'), JSON.stringify({report, errors: errors.slice(0, 10)}, null, 1));
console.log('errors', errors.length);
await browser.close();
