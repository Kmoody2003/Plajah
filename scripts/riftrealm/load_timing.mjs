// Rift Realm — load timing: how long a level takes from navigation to the first rendered frame, cold and warm.
//   node scripts/riftrealm/load_timing.mjs [baseUrl] [level] [label] [extraQuery]
// e.g. node scripts/riftrealm/load_timing.mjs http://127.0.0.1:4374/index.html elderwood before
// Runs headed Chrome on the discrete GPU (headless has no WebGPU here), parked off-screen. Two passes:
//   cold = a fresh profile (empty HTTP cache, IndexedDB and GPU shader cache), warm = the same profile again.
// Each pass opens ?rrdebug (skips the menus) and prints when each boot stage logged and when the first frame drew.
// The game's own stage marks (window.__rrLoad, set by src/menu/loadProgress.ts) are read when present.
// Rows append to D:/rr_work/loadtime/timing.jsonl.
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://127.0.0.1:4374/index.html';
const level = process.argv[3] ?? 'elderwood';
const label = process.argv[4] ?? 'run';
const extra = process.argv[5] ?? '';
const OUT = 'D:/rr_work/loadtime';
const PROFILE = `${OUT}/profile-${label}`;
fs.mkdirSync(OUT, { recursive: true });
fs.rmSync(PROFILE, { recursive: true, force: true });

async function pass(kind) {
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: false, viewport: { width: 1440, height: 810 },
    args: ['--enable-unsafe-webgpu', '--force_high_performance_gpu', '--window-position=-32000,-32000', '--window-size=1460,860',
      // an off-screen window counts as occluded: without these, rAF stops and timers throttle like a hidden tab
      '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-background-timer-throttling',
      // RR_DAWN=use_dxc etc.: try Dawn toggles (D3D12 shader compiler) for comparison
      ...(process.env.RR_DAWN ? [`--enable-dawn-features=${process.env.RR_DAWN}`] : [])],
  });
  const page = ctx.pages()[0] ?? await ctx.newPage();
  const t0 = Date.now();
  const marks = [];
  page.on('console', (m) => {
    const t = m.text();
    if (!/\[wilds\]|\[rift-realm\]|\[load\]|error/i.test(t)) return;
    marks.push([Date.now() - t0, t.slice(0, 140)]);
    console.log(`  ${String(Date.now() - t0).padStart(7)} ms  ${t.slice(0, 140)}`);
  });
  // RR_PROFILE=1: a JS CPU profile of the cold load, summarised by self time (where the main thread went)
  const cdp = process.env.RR_PROFILE && kind === 'cold' ? await ctx.newCDPSession(page) : null;
  if (cdp) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 2000 }); await cdp.send('Profiler.start'); }
  await page.goto(`${base}?rrdebug&level=${level}${extra ? '&' + extra : ''}`, { timeout: 120000 });
  const tDom = Date.now() - t0;
  await page.waitForFunction(() => !!window.__rr, null, { timeout: 900000, polling: 250 });
  const tReady = Date.now() - t0;
  // the first frame after boot: wait two rAFs so the frame actually reached the screen
  await page.evaluate(() => new Promise((r) => { requestAnimationFrame(() => requestAnimationFrame(r)); setTimeout(r, 5000); }));
  const tFrame = Date.now() - t0;
  if (cdp) {
    const { profile } = await cdp.send('Profiler.stop');
    const self = new Map(), byId = new Map(profile.nodes.map((n) => [n.id, n]));
    const dts = profile.timeDeltas; let i = 0;
    for (const id of profile.samples) {
      const n = byId.get(id), f = n.callFrame;
      const key = f.functionName === '(idle)' || f.functionName === '(program)' || f.functionName === '(garbage collector)' ? f.functionName : `${f.functionName || '(anon)'} ${f.url.split('/').pop().split('?')[0]}:${f.lineNumber + 1}`;
      self.set(key, (self.get(key) ?? 0) + (dts[i++] ?? 0) / 1000);
    }
    const top = [...self].sort((a, b) => b[1] - a[1]).slice(0, 40);
    fs.writeFileSync(`${OUT}/${label}-${level}-profile.json`, JSON.stringify(top, null, 1));
    console.log('  top self time (ms):'); for (const [k, v] of top.slice(0, 25)) console.log(`   ${String(Math.round(v)).padStart(7)}  ${k}`);
  }
  const stages = await page.evaluate(() => window.__rrLoad?.marks ?? null);
  await page.screenshot({ path: `${OUT}/${label}-${level}-${kind}.png`, timeout: 120000 }).catch(() => console.log("  (screenshot timed out: page busy)"));
  await ctx.close();
  const row = { label, level, kind, extra, domMs: tDom, readyMs: tReady, firstFrameMs: tFrame, marks, stages };
  console.log(`\n${label} ${level} ${kind}: dom ${tDom} ms, ready ${tReady} ms, first frame ${tFrame} ms`);
  if (stages) for (const s of stages) console.log(`  stage ${s.id.padEnd(14)} ${String(Math.round(s.ms)).padStart(7)} ms`);
  fs.appendFileSync(`${OUT}/timing.jsonl`, JSON.stringify(row) + '\n');
  return row;
}

await pass('cold');
if (!process.env.RR_COLD_ONLY) await pass('warm');
