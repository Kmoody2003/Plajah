// Rift Realm — the Elderwood Wilds' water: stills of the creek, falls and swamp, plus an animated capture of the flow.
//   node scripts/riftrealm/water_shots.mjs [baseUrl]
// baseUrl defaults to http://127.0.0.1:4371/index.html (a play server of games/rift-realm, watch off).
// Env: DAY=1 (?time=day), Q='clock=..&weather=..', ONLY=id,id, ANIM=id (frames of that camera → animated webp),
//      FRAMES=32, GAP=90 (ms between frames), QUAL=high|low. Output → D:/rr_work/water/<id>.png (+ <id>-flow.webp).
import { chromium } from 'playwright';
import fs from 'node:fs';
import sharp from 'sharp';

const base = process.argv[2] ?? 'http://127.0.0.1:4371/index.html';
const OUT = process.env.OUT ?? 'D:/rr_work/water';
fs.mkdirSync(OUT, { recursive: true });
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const tag = process.env.TAG ?? '';

// [id, pos, look, fov] — absolute world coordinates
const CAMS = [
  ['glowcap-stream', [258, 3.5, 112], [244, 0, 160], 68],
  ['ravine-flow', [245, 2.8, 200], [232, -0.6, 228], 62],
  ['highland-rapids', [643, 44.6, -905], [639, 41.4, -848], 62],
  ['great-falls-foot', [214, -41, 366], [205, -42, 340], 70],
  ['neon-falls', [541, 11, -502], [562, 19, -552], 68],
  ['great-falls', [221, -40.5, 392], [206, -28, 333], 70],
  ['pool-falls', [205, -42, 412], [168, -30, 386], 70],
  ['mangrove-mire', [-290, -46.9, 560], [-322, -48.6, 600], 64],
  ['vale-mouth', [125, -44, 640], [60, -48.4, 760], 64],
];

const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--force_high_performance_gpu', '--window-position=-32000,-32000', '--window-size=1460,900'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
page.on('console', (m) => { const t = m.text(); if (process.env.LOGALL || /wilds\]|tier|error|Error|WGSL|TSL/.test(t)) console.log('[page]', t.slice(0, 400)); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`${base}?rrdebug&q=${process.env.QUAL ?? 'high'}${process.env.DAY ? '&time=day' : ''}${process.env.Q ? '&' + process.env.Q : ''}`, { timeout: 120000 });
await page.waitForFunction(() => !!window.__rr && !!window.__wilds, null, { timeout: 600000, polling: 1000 });
await page.evaluate(() => {
  const rr = window.__rr;
  for (const id of ['hudTop', 'hudRight', 'hudBottom', 'reticle', 'beatRing', 'beatPop', 'touchHud', 'overlay', 'achToast', 'camText']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
  const up = rr.player.update.bind(rr.player);
  rr.enemies.update = () => {};
  rr.player.update = (...a) => {
    const c = window.__cam; if (!c) return up(...a);
    rr.camera.fov = c.fov; rr.camera.far = 1600; rr.camera.position.set(...c.pos); rr.camera.lookAt(...c.look); rr.camera.updateProjectionMatrix();
    rr.player.object.position.set(c.pos[0], c.pos[1] - 1.6, c.pos[2]); rr.player.object.visible = false;
    document.querySelectorAll('body > div').forEach((e) => { if (e.id !== 'view' && !e.querySelector('canvas')) e.style.display = 'none'; });
  };
});
if (process.env.PROBE) console.log('probe', JSON.stringify(await page.evaluate(() => {
  const { THREE, scene } = window.__rr, out = { rivers: [], hits: {} };
  scene.traverse((m) => { if (m.name === 'wilds-river') { const f = m.geometry.attributes.wflow, p = m.geometry.attributes.position; let w5 = 0, wmax = 0, smax = 0, near = 0;
    for (let i = 0; i < f.count; i++) { const w = f.getY(i); if (w > 0.5) w5++; wmax = Math.max(wmax, w); smax = Math.max(smax, f.getX(i)); if (Math.hypot(p.getX(i) - 205, p.getZ(i) - 345) < 12) near = Math.max(near, w); }
    out.rivers.push({ verts: f.count, w5, wmax, smax, footWhite: near }); } });
  for (const [n, o, d] of [['hl-left', [643, 44.6, -905], [-1, -0.1, 0.6]], ['hl-right', [643, 44.6, -905], [1, -0.1, 0.6]], ['hl-down', [643, 44.6, -905], [0, -1, 0.3]]]) {
    const rc = new THREE.Raycaster(new THREE.Vector3(...o), new THREE.Vector3(...d).normalize(), 0, 80); let hits = [];
    scene.traverse((m) => { if (!m.isMesh || !m.visible) return; try { hits.push(...rc.intersectObject(m, false)); } catch { /* skip */ } });
    out.hits[n] = hits.sort((a, b) => a.distance - b.distance).slice(0, 4).map((h) => [h.object.name || h.object.type, h.object.material?.name || h.object.material?.type, +h.distance.toFixed(1)]);
  }
  return out;
})));
for (const [id, pos, look, fov] of CAMS) {
  if (only && !only.has(id)) continue;
  // never inside the ground: lift the camera to eye height over the terrain where it would be buried
  await page.evaluate((c) => { const g = window.__wilds.terrain.surface(c.pos[0], c.pos[2]); if (c.pos[1] < g + 1.2) c.pos[1] = g + 1.7; window.__cam = c; }, { pos: [...pos], look, fov });
  await page.waitForTimeout(2500);
  await page.evaluate(async () => { const w = window.__wilds, rr = window.__rr; w.chunks.update(rr.camera.position, 1, true); await rr.renderer.compileAsync(rr.scene, rr.camera); });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}/${id}${tag}.png`, timeout: 180000 });
  if (process.env.ISO) for (const k of process.env.ISO.split(',')) { // isolate: hide one suspect, shoot, restore
    const undo = await page.evaluate((k) => { const sc = window.__rr.scene, hid = [];
      if (k === 'shore') { window.__shore?.(false); return 'shore'; }
      sc.traverse((o) => { if ((o.name || '').includes(k) && o.visible) { o.visible = false; hid.push(o.uuid); } }); window.__hid = hid; return hid.length; }, k);
    await page.waitForTimeout(800); await page.screenshot({ path: `${OUT}/${id}-no-${k}.png`, timeout: 180000 }); console.log('iso', k, undo);
    await page.evaluate((k) => { if (k === 'shore') { window.__shore?.(true); return; } const sc = window.__rr.scene; sc.traverse((o) => { if (window.__hid.includes(o.uuid)) o.visible = true; }); }, k);
  }
  if (process.env.WDBG) for (const v of process.env.WDBG.split(',')) { await page.evaluate((v) => window.__wdbg(v), v); await page.waitForTimeout(600); await page.screenshot({ path: `${OUT}/${id}-${v}.png`, timeout: 180000 }); }
  if (process.env.WDBG) await page.evaluate(() => window.__wdbg('off'));
  console.log('shot', id, JSON.stringify(await page.evaluate((p) => window.__wilds.waterAt?.(p[0], p[2]) ?? null, look)));
  if (process.env.ANIM && process.env.ANIM.split(',').includes(id)) {
    const n = Number(process.env.FRAMES ?? 32), gap = Number(process.env.GAP ?? 90), frames = [];
    for (let k = 0; k < n; k++) { frames.push(await page.screenshot({ type: 'png', clip: { x: 160, y: 90, width: 1120, height: 630 } })); await page.waitForTimeout(gap); }
    const imgs = await Promise.all(frames.map((f) => sharp(f).resize(800, 450).toBuffer()));
    await sharp(imgs, { join: { animated: true } }).webp({ quality: 80, delay: Array(n).fill(Math.round(gap + 40)), loop: 0 }).toFile(`${OUT}/${id}${tag}-flow.webp`);
    console.log('anim', id, n, 'frames');
  }
}
const info = await page.evaluate(() => { const r = window.__rr.renderer.info.render; return { calls: r.calls, tris: r.triangles }; });
console.log('render', JSON.stringify(info));
// frame time at the last camera (the page's own rAF)
console.log('fps', await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { if (++n < 90) requestAnimationFrame(f); else res(Math.round(90000 / (performance.now() - t0))); }; requestAnimationFrame(f); })));
await browser.close();
