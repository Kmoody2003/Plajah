// Probe the Ironport Grand Circuit in the running game: ground height along the racing line (sudden steps and spikes) and the traffic signals near it.
// usage: APEX_URL=http://127.0.0.1:4333 node scripts/apex-probe-city.mjs out.json
import {chromium} from 'playwright';
import fs from 'node:fs';

const out = process.argv[2] || 'apex-probe-city.json';
const browser = await chromium.launch({args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']});
const page = await browser.newPage({viewport: {width: 1280, height: 720}});
const errors = []; page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => { if (m.type() === 'error' || /context lost|CONTEXT_LOST/i.test(m.text())) errors.push(m.text()); if (/^intersections|road grade pass/.test(m.text())) console.log('[page]', m.text().slice(0, 400)); });
await page.goto((process.env.APEX_URL || 'http://127.0.0.1:4333') + '/region.html', {timeout: 120000});
await page.waitForFunction(() => window.regionViewer && window.countryShots && window.simDebug?.().signals, null, {timeout: 300000, polling: 1000});
await page.waitForTimeout(4000);
const res = await page.evaluate(() => {
  const R = window.regionViewer, P = R.debug().cityPath, D = window.simDebug();
  // the racing line at 2 m, with the road's own design height, the terrain mesh and the ground the car stands on
  const line = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], L = Math.hypot(b.x - a.x, b.z - a.z);
    for (let t = 0; t < L; t += 2) { const f = t / L, x = a.x + (b.x - a.x) * f, z = a.z + (b.z - a.z) * f; line.push({x, z, road: a.y + (b.y - a.y) * f, mesh: R.meshH(x, z), ground: R.groundH(x, z)}); }
  }
  const spikes = [];
  for (let i = 1; i < line.length - 1; i++) {
    const p = line[i], d2 = p.ground - (line[i - 1].ground + line[i + 1].ground) / 2, step = p.ground - line[i - 1].ground;
    if (Math.abs(d2) > 0.25 || Math.abs(step) > 0.6) spikes.push({i, x: Math.round(p.x), z: Math.round(p.z), ground: +p.ground.toFixed(2), prev: +line[i - 1].ground.toFixed(2), mesh: +p.mesh.toFixed(2), road: +p.road.toFixed(2), d2: +d2.toFixed(2)});
  }
  const sig = D.signals, near = (x, z) => { let b = 1e9; for (const p of P) b = Math.min(b, Math.hypot(p.x - x, p.z - z)); return b; };
  const js = sig.junctions.map((j) => ({id: j.id, control: j.control, x: Math.round(j.x ?? j.cx), z: Math.round(j.z ?? j.cz), legs: j.approaches?.length, halfs: j.approaches?.map((a) => a.half), cls: j.approaches?.map((a) => a.cls)})).map((j) => ({...j, dLine: Math.round(near(j.x, j.z))}));
  const keys = Object.keys(sig.junctions[0] ?? {});
  return {n: line.length, spikes, junctionKeys: keys, nearLine: js.filter((j) => j.dLine < 40), counts: js.reduce((a, j) => ((a[j.control] = (a[j.control] || 0) + 1), a), {}),
    roadVsMesh: line.filter((p) => p.mesh > p.road + 0.15).length, maxMeshAbove: Math.max(...line.map((p) => p.mesh - p.road))};
});
res.errors = errors.slice(0, 20);
fs.writeFileSync(out, JSON.stringify(res, null, 1));
console.log('samples', res.n, 'spikes', res.spikes.length, 'mesh above road', res.roadVsMesh, 'max', res.maxMeshAbove?.toFixed(2), 'signals near line', res.nearLine.filter((j) => j.control === 'signal').length, JSON.stringify(res.counts), 'errors', errors.length);
await browser.close();
