// Rift Realm — the rigged Elderwood creatures in the level: frames of each kind's locomotion, attack and reactions,
// played through the same rig API the combat and predator code uses (body.rig.play / hold).
//   node scripts/riftrealm/creature_shots.mjs [baseUrl]      (a games/rift-realm dev server, default :4335)
// Frames → D:/rr_work/creatures/level/<kind>_<clip>_<t>.png. Headed Chrome parked off-screen (headless has no WebGPU).
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://127.0.0.1:4335/';
const OUT = 'D:/rr_work/creatures/level';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--force_high_performance_gpu', '--window-position=-32000,-32000', '--window-size=980,760'] });
const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { const t = m.text(); if (/rig|error|Error/.test(t)) console.log('[page]', t.slice(0, 200)); });
await page.goto(`${base}?level=elderwood&classic&rrdebug&nodanger&q=${process.env.Q ?? "low"}`, { timeout: 180000 });
// spawn enough rift creatures for every kind (the level picks the kind from the id), keep their AI still, and hold a
// camera on one at a time (set just before each render, after the player camera has moved)
async function setup() {
  await page.waitForFunction(() => window.__rr?.enemies?.enemies?.some((e) => e.body?.rig?.clipNames?.length), null, { timeout: 600000, polling: 1000 });
  await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => /enter the rift/i.test(b.textContent))?.click(); });
  await page.waitForTimeout(2500);
  return page.evaluate(async () => {
    const rr = window.__rr, T = rr.THREE;
    for (const id of ['hudTop', 'hudRight', 'hudBottom', 'reticle', 'beatRing', 'beatPop', 'touchHud', 'overlay', 'achToast', 'camText']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
    document.querySelectorAll('body > div').forEach((e) => { if (!e.querySelector('canvas')) e.style.display = 'none'; });
    const P = rr.player.object.position.clone();
    for (let i = 0; i < 6; i++) rr.enemies.spawnAt(P.clone().add(new T.Vector3(3, 0, 3)), 'rusher');
    await new Promise((r) => setTimeout(r, 3000));
    const byKind = {};
    for (const e of rr.enemies.enemies) {
      const n = e.body?.rig?.clipNames ?? [];
      const k = n.includes('run') ? 'wolf' : n.includes('attack_2') ? 'mantis' : n.includes('fly') ? (e.body.hover > 2 ? 'bat' : 'wasp') : null;
      if (k && !byKind[k]) byKind[k] = e; else e.mesh.visible = false;
    }
    window.__shot = { byKind, cur: null };
    rr.enemies.update = (dt) => { for (const e of Object.values(byKind)) e.body.update(dt, window.__shot.speed ?? 0); };
    const spot = P.clone().add(new T.Vector3(2.5, 0, 2.5));
    const setCam = () => {
      const s = window.__shot; const e = s.cur && s.byKind[s.cur]; if (!e) return;
      for (const [k, o] of Object.entries(s.byKind)) o.mesh.visible = k === s.cur;
      e.mesh.position.set(spot.x, P.y, spot.z); e.mesh.rotation.y = 0;
      const h = e.body.hover + e.body.height * 0.5, d = Math.max(3.2, e.body.height * 2.4), yaw = s.yaw ?? 1.3;
      rr.camera.position.set(spot.x + Math.sin(yaw) * d, P.y + h + 0.4, spot.z + Math.cos(yaw) * d); rr.camera.lookAt(spot.x, P.y + h, spot.z);
      rr.camera.fov = 45; rr.camera.updateProjectionMatrix(); rr.camera.updateMatrixWorld();
      rr.player.object.visible = false;
    };
    if (rr.post?.render) { const pr = rr.post.render.bind(rr.post); rr.post.render = (...a) => { setCam(); return pr(...a); }; }
    const rd = rr.renderer.render.bind(rr.renderer); rr.renderer.render = (sc, cam) => { if (sc === rr.scene) setCam(); return rd(sc, cam); };
    return Object.keys(byKind);
  });
}
let kinds = await setup();
console.log('kinds in level', kinds);
await page.screenshot({ path: `${OUT}/_warmup.png`, timeout: 300000 });

const shots = [
  ['idle', 0, [0.6]], ['loco', 4, [0.2, 0.45]], ['attack', 0, [0.25, 0.5]], ['hit', 0, [0.12]], ['parried', 0, [0.2]],
  ['launch', 0, [0.45]], ['death', 0, [1.2]],
];
for (const k of kinds) {
  for (const [clip, speed, times] of shots) {
    if (!(await page.evaluate(() => !!window.__shot))) { console.log('page reloaded; setting up again'); kinds = await setup(); }
    await page.evaluate(([k, clip, speed]) => {
      const s = window.__shot; s.cur = k; s.speed = speed; s.yaw = Math.PI / 2 + 0.5;
      const r = s.byKind[k].body.rig; r.release();
      if (clip === 'death') r.hold('death'); else if (clip !== 'idle' && clip !== 'loco') r.play(clip);
    }, [k, clip, speed]);
    let t0 = 0;
    for (const t of times) { await page.waitForTimeout((t - t0) * 1000); t0 = t; await page.screenshot({ path: `${OUT}/${k}_${clip}_${t}.png`, timeout: 180000 }); }
    await page.evaluate(([k]) => window.__shot?.byKind[k]?.body.rig.release(), [k]).catch(() => {});
    await page.waitForTimeout(400);
  }
}
await browser.close();
