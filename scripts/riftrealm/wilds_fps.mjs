// Rift Realm — Elderwood Wilds: frame rate from fixed shot cameras (Chrome on the discrete GPU), for A/B comparisons.
//   node scripts/riftrealm/wilds_fps.mjs [baseUrl] [extraQuery] [label] [shotIds]
// e.g. node scripts/riftrealm/wilds_fps.mjs http://127.0.0.1:4336/index.html "eco=1" eco portal-plaza,mangrove-mire
// Prints frames/s (median of 1 s windows over 8 s), draw calls and triangles per shot; frames → D:/rr_work/wilds/fps/<label>-<id>.png.
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://127.0.0.1:4336/index.html';
const extra = process.argv[3] ?? '';
const label = process.argv[4] ?? 'run';
const ids = (process.argv[5] ?? 'portal-plaza,mangrove-mire,eh08-atmosphere').split(',');
const OUT = 'D:/rr_work/wilds/fps';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--force_high_performance_gpu', '--window-position=-32000,-32000', '--window-size=1460,860', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
page.on('console', (m) => { const t = m.text(); if (/\[wilds\]|error|Error/.test(t)) console.log('[page]', t.slice(0, 200)); });
await page.goto(`${base}?rrdebug&q=high&time=day${extra ? '&' + extra : ''}`, { timeout: 120000 });
await page.waitForFunction(() => !!window.__rr && !!window.__wilds, null, { timeout: 600000, polling: 1000 });
await page.evaluate(() => {
  const rr = window.__rr;
  rr.enemies.update = () => {};
  const up = rr.player.update.bind(rr.player);
  rr.player.update = (...a) => {
    const c = window.__cam; if (!c) return up(...a);
    rr.camera.fov = c.fov; rr.camera.position.set(...c.pos); rr.camera.lookAt(...c.look); rr.camera.updateProjectionMatrix();
    rr.player.object.position.set(c.pos[0], c.pos[1] - 1.6, c.pos[2]); rr.player.object.visible = false;
  };
});
const rows = [];
for (const id of ids) {
  await page.evaluate((id) => {
    const s = window.__wilds.shots.find((q) => q.id === id), H = (x, z) => window.__wilds.terrain.surface(x, z);
    const p = s.cam.pos.slice(), l = s.cam.look.slice();
    if (!s.abs) { p[1] += H(p[0], p[2]); l[1] += H(l[0], l[2]); }
    window.__cam = { pos: p, look: l, fov: s.cam.fov };
  }, id);
  await page.waitForTimeout(3000);
  await page.evaluate(async () => { const rr = window.__rr; window.__wilds.chunks.update(rr.camera.position, 1, true); await rr.renderer.compileAsync(rr.scene, rr.camera); });
  await page.waitForTimeout(3000);
  const r = await page.evaluate(() => new Promise((res) => {
    const win = []; let n = 0, t0 = performance.now(), start = t0;
    const tick = () => { n++; const t = performance.now(); if (t - t0 >= 1000) { win.push(n * 1000 / (t - t0)); n = 0; t0 = t; } if (t - start < 8000) requestAnimationFrame(tick); else { win.sort((a, b) => a - b); const i = window.__rr.renderer.info.render; res({ fps: +win[win.length >> 1].toFixed(1), min: +win[0].toFixed(1), calls: i.calls, tris: i.triangles }); } };
    requestAnimationFrame(tick);
  }));
  await page.screenshot({ path: `${OUT}/${label}-${id}.png` });
  rows.push({ id, ...r });
  console.log(label, id, JSON.stringify(r));
}
fs.appendFileSync(`${OUT}/fps.jsonl`, rows.map((r) => JSON.stringify({ label, extra, ...r })).join('\n') + '\n');
await browser.close();
