// Apex lap check: drives a whole circuit with a scripted autopilot in the running dev server (preview "forth-horizon", port 4332) on the real GPU and reports
// how the car tracks the designed line: distance off the line, car height vs the road's design height (mean, worst and where), stalls, resets, page errors.
// It idles on the map first (so the map cinematic is running) and presses a real W, which used to end the drive. Steering sign is calibrated at the start.
// The game takes ~9 GB of RAM in one tab: check free memory first. Off-line runs (offRuns) are the autopilot running wide, not the road.
// usage (from repo root): node scripts/apex-lapdrive.mjs circuit_id [maxSeconds] [--swiftshader]
import {chromium} from 'playwright';
const id = process.argv[2], maxS = +(process.argv[3] || 900);
const gpu = process.argv.includes('--swiftshader') ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({args: gpu});
const page = await browser.newPage({viewport: {width: 960, height: 540}});
const errors = []; page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto((process.env.APEX_URL || 'http://127.0.0.1:4332') + '/region.html', {timeout: 120000});
await page.waitForFunction(() => window.regionViewer, null, {timeout: 300000, polling: 1000});
await page.waitForTimeout(12000);                                     // idle long enough for the map cinematic to start (the old bug)
const cine = await page.evaluate(() => document.getElementById('mapCardsWrap')?.style.opacity === '0');
await page.evaluate((id) => window.regionViewer.startDrive(id), id);
await page.waitForTimeout(1500);
await page.keyboard.down('KeyW'); await page.waitForTimeout(800); await page.keyboard.up('KeyW');
const alive = await page.evaluate(() => !!window.regionViewer.drive());
console.log('cinematic was on:', cine, '| drive alive after a real W press:', alive);
if (!alive) { await browser.close(); process.exit(1); }
await page.evaluate(() => {
  const R = window.regionViewer, c = R.meta.circuits[R.drive().circuitId] || Object.values(R.meta.circuits).find(() => false);
  const xz = c.xz, y = c.y, n = xz.length, K = R.keys;
  const st = window.__lap = {i: 0, t0: performance.now(), maxOff: 0, maxDy: 0, sumDy: 0, cnt: 0, stalls: 0, offRuns: 0, wasOff: false, slow: 0, done: false, log: []};
  let last = performance.now();
  const near = (p, all) => { let best = st.i, bd = 1e18; for (let k = all ? 0 : Math.max(0, st.i - 20); k < (all ? n : Math.min(n, st.i + 120)); k++) { const d = (xz[k][0] - p.x) ** 2 + (xz[k][1] - p.z) ** 2; if (d < bd) { bd = d; best = k; } } return [best, Math.sqrt(bd)]; };
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  setInterval(() => {
    const d = R.drive(); if (!d || st.done) { K.clear(); return; }
    const ps = d.ps, p = ps.pos, now = performance.now(), dt = (now - last) / 1000; last = now;
    let [i, off] = near(p, false); if (off > 25) [i, off] = near(p, true); st.i = i;
    if (st.sgn === undefined) {                                           // calibrate: which way does holding D turn the car?
      if (ps.forwardSpeed < 8) { K.add('KeyW'); return; }
      if (st.cal === undefined) { st.cal = ps.yaw; st.calT = now; K.add('KeyD'); return; }
      if (now - st.calT < 400) { K.add('KeyD'); return; }
      st.sgn = Math.sign(wrap(ps.yaw - st.cal)) || 1; st.log.push(['sgn', st.sgn]); K.delete('KeyD');
    }
    if (i >= n - 3) { st.done = true; st.t = (now - st.t0) / 1000; K.clear(); return; }
    const dy = p.y - y[i], v0 = ps.forwardSpeed; if (off < 4) { if (Math.abs(dy) > st.maxDy) st.maxAt = [i, Math.round(p.x), Math.round(p.z), +dy.toFixed(2), +v0.toFixed(1)]; st.maxDy = Math.max(st.maxDy, Math.abs(dy)); st.sumDy += Math.abs(dy); st.cnt++; }
    st.maxOff = Math.max(st.maxOff, off); if (off > 6 && !st.wasOff) st.offRuns++; st.wasOff = off > 6;
    const look = Math.min(n - 1, i + 6 + Math.round(Math.abs(ps.forwardSpeed) * 0.35));
    const want = Math.atan2(xz[look][0] - p.x, xz[look][1] - p.z), err = wrap(want - ps.yaw);
    let turn = 0; for (let k = i; k < Math.min(n - 2, i + 40); k += 4) { const a = Math.atan2(xz[k + 2][0] - xz[k][0], xz[k + 2][1] - xz[k][1]), b = Math.atan2(xz[Math.min(n - 1, k + 6)][0] - xz[k + 2][0], xz[Math.min(n - 1, k + 6)][1] - xz[k + 2][1]); turn = Math.max(turn, Math.abs(wrap(b - a))); }
    const vWant = turn > 0.35 ? 9 : turn > 0.2 ? 13 : turn > 0.1 ? 19 : 27, v = ps.forwardSpeed;
    K.delete('KeyA'); K.delete('KeyD'); K.delete('KeyW'); K.delete('KeyS');
    if (err * st.sgn > 0.03) K.add('KeyD'); else if (err * st.sgn < -0.03) K.add('KeyA');
    if (v < vWant) K.add('KeyW'); else if (v > vWant + 3) K.add('KeyS');
    if (Math.abs(v) < 1) { st.slow += dt; if (st.slow > 6) { st.stalls++; st.slow = 0; st.log.push(['stall', i, Math.round(p.x), Math.round(p.z)]); } } else st.slow = 0;
  }, 16);
});
let reloaded = false; page.on('framenavigated', (f) => { if (f === page.mainFrame()) reloaded = true; });   // the dev server reloads the page when a game source file changes
const t0 = Date.now();
while (true) {
  await page.waitForTimeout(15000);
  if (reloaded) { console.log('ABORTED: the page reloaded (a game source file changed during the run); run it again'); await browser.close(); process.exit(2); }
  const s = await page.evaluate(() => { const s = window.__lap, d = window.regionViewer.drive(); return {...s, n: d ? window.regionViewer.meta.circuits[d.circuitId]?.xz.length : -1, alive: !!d, v: d?.ps.forwardSpeed}; });
  console.log(`t=${Math.round((Date.now() - t0) / 1000)}s i=${s.i}/${s.n} v=${s.v?.toFixed(1)} maxOff=${s.maxOff.toFixed(1)} offRuns=${s.offRuns} maxDy=${s.maxDy.toFixed(2)} meanDy=${(s.sumDy / Math.max(1, s.cnt)).toFixed(3)} stalls=${s.stalls} sgn=${s.sgn} alive=${s.alive}`);
  if (s.done || !s.alive || (Date.now() - t0) / 1000 > maxS) { console.log('RESULT', JSON.stringify({done: s.done, lapS: s.t, maxOff: s.maxOff, offRuns: s.offRuns, maxDy: s.maxDy, meanDy: s.sumDy / Math.max(1, s.cnt), stalls: s.stalls, maxAt: s.maxAt, log: s.log.slice(0, 10)})); break; }
}
console.log('errors', errors.length, errors.slice(0, 5));
await browser.close();
