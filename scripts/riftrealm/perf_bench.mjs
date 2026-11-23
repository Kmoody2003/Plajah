// Rift Realm — frame benchmark on fixed camera poses, per level, on a chosen GPU (default: the Intel iGPU).
//   node scripts/riftrealm/perf_bench.mjs <baseUrl> <level> <label> [extraQuery]
//   e.g. node scripts/riftrealm/perf_bench.mjs http://127.0.0.1:4358/index.html elderwood intel q=intel
// env: RR_GPU=low|high (Chrome --use-webgpu-power-preference; low = the iGPU), RR_SHOTS=0 no screenshots,
//      RR_LIVE=seconds of free-running play per pose for the live fps (default 6; 0 = skip), RR_SETTLE=ms after load.
// Method (this machine is shared: other GPU users and memory paging only ever ADD time, so minimums are the signal):
//   - the game loop is paused (rAF captured) and frames are stepped by hand; three's nodeFrame is advanced each step
//     (the renderer's own rAF normally does it — without it FRAME-updated nodes like the post scene pass stop);
//   - gpu   = min over 15 frames of the GPU timestamp-query time of one frame, world frozen (dt 0: identical work);
//   - cpu   = min over 15 frames of the JS frame() call (no GPU wait);
//   - draws = render-object calls in one frame (scene + shadow passes), tris = triangles submitted;
//   - live  = fps of the real loop (rAF, dynamic resolution on) over RR_LIVE seconds, with the scale it settled on.
// The iGPU clocks down when idle: every pose runs 1.5 s of frames before timing.
// Rows append to D:/rr_work/perf/bench.jsonl, screenshots to D:/rr_work/perf/<label>-<level>-<pose>.png.
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://127.0.0.1:4358/index.html';
const level = process.argv[3] ?? 'elderwood';
const label = process.argv[4] ?? 'run';
const extra = process.argv[5] ?? '';
const OUT = 'D:/rr_work/perf';
const PROFILE = `${OUT}/profile-${process.env.RR_GPU ?? 'low'}`;
fs.mkdirSync(OUT, { recursive: true });

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: false, viewport: { width: 1600, height: 900 },
  args: ['--enable-unsafe-webgpu', `--use-webgpu-power-preference=${process.env.RR_GPU === 'high' ? 'force-high-performance' : 'force-low-power'}`,
    '--window-position=-32000,-32000', '--window-size=1620,960',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-background-timer-throttling'],
});
const page = ctx.pages()[0] ?? await ctx.newPage();
const t0 = Date.now();
page.on('console', (m) => {
  const t = m.text();
  if (/\[rift-realm\]|\[load\] total|\[gfx\]|error/i.test(t)) console.log(`  ${String(Date.now() - t0).padStart(7)} ms  ${t.slice(0, 200)}`);
});
page.on('pageerror', (e) => console.log('  pageerror', String(e).slice(0, 300)));
await page.goto(`${base}?rrdebug&level=${level}${extra ? '&' + extra : ''}`, { timeout: 120000 });
await page.waitForFunction(() => !!window.__rr, null, { timeout: 1800000, polling: 500 });
const loadMs = Date.now() - t0;
console.log(`ready in ${loadMs} ms`);
await page.waitForTimeout(Number(process.env.RR_SETTLE ?? 20000)); // the background shader warm-up (compileEverything)

const shots = process.env.RR_SHOTS !== '0', live = Number(process.env.RR_LIVE ?? 6);
await page.evaluate(() => {
  const rr = window.__rr, { renderer, player, enemies, arena, THREE } = rr;
  const queue = renderer.backend.device.queue, nf = renderer._nodes.nodeFrame;
  const raf = window.requestAnimationFrame.bind(window);
  let pending = null; window.requestAnimationFrame = (cb) => { pending = cb; return 0; };
  enemies.passive = true;
  renderer.backend.trackTimestamp = renderer.backend.hasFeature('timestamp-query');
  let t = performance.now();
  const F = (tt) => { nf.update(); rr.frame(tt, true); };
  const step = (n = 1) => { for (let i = 0; i < n; i++) { t += 16.7; F(t); } };
  const done = () => queue.onSubmittedWorkDone();
  const warm = async (ms = 1500) => { const a = performance.now(); while (performance.now() - a < ms) { step(2); await done(); } };
  const gpu = async (n = 15) => { let b = 1e9; F(t); await done(); await renderer.resolveTimestampsAsync('render'); for (let i = 0; i < n; i++) { F(t); await done(); b = Math.min(b, await renderer.resolveTimestampsAsync('render') ?? 1e9); } return +b.toFixed(2); };
  const cpu = async (n = 15) => { let b = 1e9; for (let i = 0; i < n; i++) { t += 16.7; nf.update(); const a = performance.now(); rr.frame(t, true); b = Math.min(b, performance.now() - a); await done(); } return +b.toFixed(2); };
  const count = () => { let calls = 0, tris = 0; const o = renderer.renderObject; renderer.renderObject = function (ob) { calls++; const g = ob.geometry; tris += ((g.index ? g.index.count : g.attributes.position?.count ?? 0) / 3) * (ob.isInstancedMesh ? ob.count : 1); return o.apply(this, arguments); }; step(1); renderer.renderObject = o; return { calls, tris: Math.round(tris) }; };
  const liveRun = async (sec) => {
    window.requestAnimationFrame = raf; const a = renderer._animation; a.stop(); a.start();
    let frames = 0, on = true; const cnt = () => { frames++; if (on) raf(cnt); }; raf(cnt);
    raf(pending ?? rr.frame); pending = null;
    await new Promise((r) => setTimeout(r, 1500)); frames = 0; const s = performance.now();
    await new Promise((r) => setTimeout(r, sec * 1000)); on = false;
    const fps = frames / ((performance.now() - s) / 1000);
    window.requestAnimationFrame = (cb) => { pending = cb; return 0; }; await new Promise((r) => setTimeout(r, 100));
    return { fps: +fps.toFixed(1), scale: rr.dynres?.scale ?? null, gpuMs: rr.dynres ? +rr.dynres.gpuMs.toFixed(1) : null };
  };
  const place = async (p) => { player.spawnAt(new THREE.Vector3(...p.pos), p.yaw); player.pitch = -0.08; step(15); await done(); };
  // poses: both spawns, each control point looking at the middle of them
  const poses = [{ id: 'spawnA', pos: arena.spawns.a.pos.toArray(), yaw: arena.spawns.a.yaw }];
  if (arena.spawns.b) poses.push({ id: 'spawnB', pos: arena.spawns.b.pos.toArray(), yaw: arena.spawns.b.yaw });
  const cps = arena.controlPoints ?? [], mid = new THREE.Vector3(); for (const c of cps) mid.add(c.pos); if (cps.length) mid.divideScalar(cps.length);
  for (const c of cps) { const p = c.pos.clone(); p.x += 4; p.z += 4; const d = mid.clone().sub(p); poses.push({ id: `cp${c.id}`, pos: p.toArray(), yaw: Math.atan2(-d.x, -d.z) }); }
  window.__bench = { poses, place, warm, gpu, cpu, count, liveRun, step, done };
});

const poses = await page.evaluate(() => window.__bench.poses);
const info = await page.evaluate(() => { const rr = window.__rr, r = rr.renderer, a = r.backend.device.adapterInfo; return { adapter: `${a.vendor} ${a.architecture}`, profile: rr.gfx?.profile ?? rr.tier, tier: rr.tier, canvas: [r.domElement.width, r.domElement.height], pr: r.getPixelRatio(), shadows: r.shadowMap.enabled, post: !!rr.post }; });
const rows = [];
for (const p of poses) {
  const row = await page.evaluate(async ({ p }) => {
    const B = window.__bench;
    await B.place(p); await B.warm(1500);
    const gpu = await B.gpu(15), cpu = await B.cpu(15), c = B.count();
    return { id: p.id, gpu, cpu, draws: c.calls, tris: c.tris, scale: window.__rr.dynres?.scale ?? null };
  }, { p });
  if (shots) { await page.evaluate(async () => { window.__bench.step(3); await window.__bench.done(); }); await page.screenshot({ path: `${OUT}/${label}-${level}-${p.id}.png`, timeout: 120000 }).catch(() => console.log('  (screenshot timed out)')); }
  if (live > 0) Object.assign(row, { live: await page.evaluate(async ({ p, live }) => { await window.__bench.place(p); return window.__bench.liveRun(live); }, { p, live }) });
  console.log(`  ${row.id.padEnd(7)} gpu ${String(row.gpu).padStart(7)}  cpu ${String(row.cpu).padStart(6)}  draws ${String(row.draws).padStart(5)}  tris ${(row.tris / 1e6).toFixed(2)}M${row.live ? `  live ${row.live.fps} fps${row.live.scale ? ' @' + row.live.scale : ''}${row.live.gpuMs ? ' gpu ' + row.live.gpuMs : ''}` : ''}`);
  rows.push(row);
}
await ctx.close();
const out = { label, level, extra, gpu: process.env.RR_GPU ?? 'low', loadMs, at: new Date().toISOString(), ...info, poses: rows };
fs.appendFileSync(`${OUT}/bench.jsonl`, JSON.stringify(out) + '\n');
console.log(JSON.stringify({ ...out, poses: undefined }));
