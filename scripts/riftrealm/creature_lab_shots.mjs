// Frames of the creature rig lab (games/rift-realm/creature-lab.html) in WebGPU: front / side / back of each rigged
// creature (for side-by-sides with its turnaround), clip poses, and the moth swarm.
//   node scripts/riftrealm/creature_lab_shots.mjs [baseUrl]   → D:/rr_work/creatures/lab/*.png
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://127.0.0.1:4335/creature-lab.html';
const OUT = 'D:/rr_work/creatures/lab';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--force_high_performance_gpu', '--window-position=-32000,-32000', '--window-size=820,840'] });
const page = await browser.newPage({ viewport: { width: 800, height: 800 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const shots = (process.env.ONLY ?? '').split(',').filter(Boolean);
const list = shots.length ? shots.map((s) => s.split(':')) : [
  ...['wolf', 'mantis', 'wasp', 'deer', 'bat', 'moth'].flatMap((k) => ['front', 'side', 'back'].map((v) => [k, `view=${v}&clip=idle&t=0`])),
  ['moth', 'swarm&speed=0'],
];
for (const [kind, qs] of list) {
  await page.goto(`${base}?kind=${kind}&${qs}`);
  await page.waitForFunction(() => !!window.__lab, null, { timeout: 120000 });
  await page.waitForTimeout(2500);
  const name = `${kind}_${qs.replace(/[&=.]/g, '_')}`;
  await page.evaluate(() => { document.getElementById('ui').style.display = 'none'; document.getElementById('info').style.display = 'none'; });
  await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 120000 });
  console.log(name);
}
await browser.close();
