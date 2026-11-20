// Shots taken from a circuit's own built line (window.coursePaths): the camera rides the line like a driver would, so it is where the road really is
// (inside a tunnel, through a corner). Each shot: [name, circuitId, nearX, nearZ, aheadSamples, heightM, lookAheadSamples]
// usage: APEX_URL=http://127.0.0.1:4333 node scripts/apex-shots-on-course.mjs outDir shots.json
import {chromium} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const out = path.resolve(process.argv[2] || 'course-shots'); fs.mkdirSync(out, {recursive: true});
const shots = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const browser = await chromium.launch({args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']});
const page = await browser.newPage({viewport: {width: 1600, height: 900}});
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
await page.goto((process.env.APEX_URL || 'http://127.0.0.1:4333') + '/region.html', {timeout: 120000});
await page.waitForFunction(() => window.regionViewer && window.countryShots && window.coursePaths, null, {timeout: 300000, polling: 1000});
await page.evaluate(() => { document.querySelectorAll('#mapCards').forEach((e) => { const p = e.closest('div[id]'); if (p) p.style.display = 'none'; }); window.setTod?.('noon'); window.regionViewer.wx.setWeather('clear', false, true); });
for (const [name, id, nx, nz, ahead, h, look] of shots) {
  const ok = await page.evaluate(([id, nx, nz, ahead, h, look]) => {
    const R = window.regionViewer, P = window.coursePaths()[id]; if (!P?.length) return false;
    let k = 0, bd = 1e18; P.forEach((p, i) => { const d = (p.x - nx) ** 2 + (p.z - nz) ** 2; if (d < bd) { bd = d; k = i; } });
    const n = P.length, a = P[((k + ahead) % n + n) % n], b = P[((k + ahead + look) % n + n) % n];
    R.cam(a.x, R.groundH(a.x, a.z) + h, a.z, b.x, R.groundH(b.x, b.z) + h * 0.6, b.z);
    return true;
  }, [id, nx, nz, ahead, h, look]);
  if (!ok) { console.log(name, 'no such course'); continue; }
  await page.waitForTimeout(6000);
  await page.screenshot({path: path.join(out, name + '.png'), timeout: 60000});
  console.log(name);
}
console.log('errors', errors.length, errors.slice(0, 3));
await browser.close();
