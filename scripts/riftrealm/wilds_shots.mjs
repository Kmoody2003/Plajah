// Rift Realm — Elderwood Wilds: render every art shot's camera in the game (Chrome on the discrete GPU, WebGPU) and save the frames.
//   node scripts/riftrealm/wilds_shots.mjs [baseUrl] [id,id,...]
// baseUrl defaults to http://127.0.0.1:4336/index.html (a dev server of games/rift-realm). Frames → D:/rr_work/wilds/game/<id>.png.
// scripts/riftrealm/wilds_pairs.py then pairs each with its art into docs/rift-realm-wilds/.
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://127.0.0.1:4336/index.html';
const only = process.argv[3] ? new Set(process.argv[3].split(',')) : null;
const OUT = 'D:/rr_work/wilds/game';
fs.mkdirSync(OUT, { recursive: true });

// headless Chrome has no WebGPU here; a headed window parked off-screen on the discrete GPU does (the game's high tier)
const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--force_high_performance_gpu', '--window-position=-32000,-32000', '--window-size=1460,1500'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
page.on('console', (m) => { const t = m.text(); if (/wilds|tier|error|Error/.test(t)) console.log('[page]', t.slice(0, 300)); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`${base}?rrdebug&q=high`, { timeout: 120000 });
await page.waitForFunction(() => !!window.__rr && !!window.__wilds, null, { timeout: 300000, polling: 1000 });
let shots = await page.evaluate(() => {
  const rr = window.__rr;
  for (const id of ['hudTop', 'hudRight', 'hudBottom', 'reticle', 'beatRing', 'beatPop', 'touchHud', 'overlay', 'achToast', 'camText']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
  const up = rr.player.update.bind(rr.player);
  rr.enemies.update = () => {};
  rr.player.update = (...a) => {
    const c = window.__cam; if (!c) return up(...a);
    rr.camera.fov = c.fov; rr.camera.far = c.far ?? 1600; rr.camera.position.set(...c.pos); rr.camera.lookAt(...c.look); rr.camera.updateProjectionMatrix();
    rr.player.object.position.set(c.pos[0], c.pos[1] - 1.6, c.pos[2]); rr.player.object.visible = false;
    document.querySelectorAll('body > div').forEach((e) => { if (e.id !== 'view' && !e.querySelector('canvas')) e.style.display = 'none'; });
  };
  return window.__wilds.shots;
});
// CAMS='name:x,y,z,lx,ly,lz,fov;…' renders extra absolute cameras (for scouting)
if (process.env.CAMS) for (const c of process.env.CAMS.split(';')) { const [n, v] = c.split(':'); const a = v.split(',').map(Number); shots.push({ id: n, art: '', abs: true, cam: { pos: a.slice(0, 3), look: a.slice(3, 6), fov: a[6] ?? 60, far: a[7] } }); }
if (process.env.RAY) { // what the first thing in front of each listed shot's camera is
  console.log(JSON.stringify(await page.evaluate((ids) => {
    const { THREE, scene } = window.__rr, out = {};
    for (const s of window.__wilds.shots.filter((q) => ids.includes(q.id))) {
      const o = new THREE.Vector3(...s.cam.pos), d = new THREE.Vector3(...s.cam.look).sub(o).normalize();
      const rc = new THREE.Raycaster(o, d, 0, 60); let hits = []; scene.traverse((m) => { if (!m.isMesh || !m.visible) return; try { hits.push(...rc.intersectObject(m, false)); } catch { /* skip */ } }); hits = hits.sort((a, b) => a.distance - b.distance).slice(0, 4);
      out[s.id] = hits.map((h) => [h.object.name || h.object.type, (h.object.material?.name || ''), +h.distance.toFixed(2)]);
    }
    return out;
  }, process.env.RAY.split(','))));
  await browser.close(); process.exit(0);
}
if (process.env.PROBE) { // print ground heights at x,z;x,z;… and every place's pad height, then stop
  console.log(JSON.stringify(await page.evaluate((pts) => { const w = window.__wilds, H = (x, z) => +w.terrain.surface(x, z).toFixed(2);
    return { pts: pts.split(';').map((p) => { const [x, z] = p.split(',').map(Number); return [x, z, H(x, z)]; }), places: w.places.map((q) => [q.id, q.x, q.z, H(q.x, q.z)]) }; }, process.env.PROBE)));
  await browser.close(); process.exit(0);
}
for (const s of shots) {
  if (only && !only.has(s.id)) continue;
  const portrait = /eh-\d|elderwood-hollow\.webp|cf-24/.test(s.art) || s.id === 'map';
  await page.setViewportSize(portrait ? { width: 1440, height: /cf-24/.test(s.art) || s.id === 'map' ? 1440 : 960 } : { width: 1440, height: 810 });
  await page.evaluate((s) => {
    const H = (x, z) => window.__wilds.terrain.surface(x, z);
    const p = s.cam.pos.slice(), l = s.cam.look.slice();
    if (!s.abs) { p[1] += H(p[0], p[2]); l[1] += H(l[0], l[2]); }
    window.__cam = { pos: p, look: l, fov: s.cam.fov, far: s.cam.far };
    if (s.cam.far) { const sc = window.__rr.scene; sc.fogNode = null; sc.fog = null; }   // the map shot: no fog
  }, s);
  // let the terrain stream in and the vegetation re-sort round the new camera
  await page.waitForTimeout(2500);
  await page.evaluate(() => { const w = window.__wilds; const c = window.__rr.camera.position; w.chunks.update(c, 1, true); });
  await page.waitForTimeout(2500);
  if (s.cam.far) await page.waitForTimeout(40000);   // every material recompiles without fog
  await page.screenshot({ path: `${OUT}/${s.id}.png`, timeout: 180000 });
  console.log('shot', s.id);
}
const info = await page.evaluate(() => { const r = window.__rr.renderer.info.render; return { calls: r.calls, tris: r.triangles }; });
console.log('render', JSON.stringify(info));
await browser.close();
