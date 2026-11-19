// Headless visual check for Plajah Motorsport: Apex: drives the running dev server (preview "forth-horizon", port 4332) in Playwright Chromium on the real GPU
// (Direct3D 11 through ANGLE; --swiftshader falls back to software), puts the game's debug camera at each shot, lets streaming settle and screenshots it.
// Also reports the frame time the page itself measures (requestAnimationFrame) at each shot.
// usage: node scripts/apex-shots.mjs [outDir] [--swiftshader] [--only name,name] [--tod noon] [--w 1600 --h 900]
import {chromium} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const out = path.resolve(args[0] && !args[0].startsWith('--') ? args[0] : 'docs/apex-elohim/shots'); fs.mkdirSync(out, {recursive: true});
const W = +flag('--w', 1600), H = +flag('--h', 900), tod = flag('--tod', 'noon');
const only = flag('--only', '')?.split(',').filter(Boolean);
const SHOTS = [
  ['wine-country-north', [1500, 90, -5000], [1500, 160, -9300]],
  ['tulip-fields', [-300, 35, -5200], [-200, 5, -6100]],
  ['finger-lake-escarpment', [1350, 60, -7300], [1700, 260, -9250]],
  ['giant-forest-coast', [-5600, 120, -7800], [-4500, 260, -9800]],
  ['range-glacier', [-2600, 820, -9800], [-4400, 560, -12100]],
  ['fjord', [-7600, 140, -10300], [-5600, 80, -10800]],
  ['canyon', [1200, 380, -11600], [-400, 200, -11700]],
  ['kettle-pass', [1180, 95, 2600], [1450, 60, 2850]],
  ['coastal-gallery', [-6090, 40, 700], [-5990, 52, 800]],
  ['halcyon-gateway', [2250, 150, 2420], [2900, 40, 2740]],
  ['festival-wine-stage', [450, 26, -6130], [380, 14, -6200]],
  ['speed-trap', [-1116, 40, 3195], [-1116, 20, 3795]],
  ['coast-highway', [-6900, 160, -10900], [-6550, 90, -10350]],
  ['glacier-pass-saddle', [-3120, 470, -12320], [-3360, 425, -12760]],
  ['glacier-pass-hairpins', [-3150, 560, -11850], [-3420, 370, -12080]],
  ['glacier-pass-north', [-3650, 470, -12950], [-3850, 345, -13280]],
  ['glacier-pass-forest', [-4150, 160, -8150], [-3950, 120, -8750]],
  ['escarpment-stair', [1300, 300, -8350], [810, 210, -8880]],
  ['escarpment-stair-top', [880, 330, -9260], [820, 180, -8700]],
  ['escarpment-viaduct', [220, 300, -9600], [40, 180, -9845]],
  ['access-wine-country', [640, 70, -6080], [400, 8, -6200]],
  ['access-ironport-nights', [4600, 110, 2380], [4150, 8, 2670]],
  ['access-dune-sea', [-4300, 140, 1300], [-5100, 6, -500]],
].filter(([n]) => !only?.length || only.includes(n));

const gpu = args.includes('--swiftshader') ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({args: gpu});
const page = await browser.newPage({viewport: {width: W, height: H}});
const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://127.0.0.1:4332/region.html', {timeout: 120000});
await page.waitForFunction(() => window.regionViewer && window.countryShots, null, {timeout: 300000, polling: 1000});
await page.evaluate((tod) => {
  document.querySelectorAll('#mapCards').forEach((e) => { const p = e.closest('div[id]'); if (p) p.style.display = 'none'; });
  window.setTod?.(tod); window.regionViewer.wx.setWeather('clear', false, true);
}, tod);
const report = [];
for (const [name, pos, at] of SHOTS) {
  await page.evaluate(([p, a]) => window.regionViewer.cam(p[0], p[1], p[2], a[0], a[1], a[2]), [pos, at]);
  await page.waitForTimeout(6000);                                                        // streaming (vegetation cells, city batches) settles
  const ms = await page.evaluate(() => new Promise((res) => { const t = []; let last = performance.now(); const f = (now) => { t.push(now - last); last = now; if (t.length < 90) requestAnimationFrame(f); else { t.sort((a, b) => a - b); res(+t[t.length >> 1].toFixed(1)); } }; requestAnimationFrame(f); }));
  await page.screenshot({path: path.join(out, name + '.png'), timeout: 60000});
  report.push({name, frameMs: ms});
  console.log(name, ms, 'ms');
}
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({gpu: gpu[0], size: [W, H], tod, report, errors: errors.slice(0, 20)}, null, 1));
await browser.close();
console.log('errors', errors.length);
