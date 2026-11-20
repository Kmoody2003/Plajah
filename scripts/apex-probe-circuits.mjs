// Probe every Apex circuit in the running game for what a driver would hit or feel:
//  - the ground the car stands on along the line (groundH every 2 m): sudden steps, spikes and grades steeper than a racing road should have;
//  - things standing on the driving surface: every mesh triangle and instanced part whose box reaches into the space a car drives through
//    (0.45-2.4 m over the road, within 70 % of the half width of the line), grouped by the object that put it there.
// usage: APEX_URL=http://127.0.0.1:4333 node scripts/apex-probe-circuits.mjs out.json [circuit_id,...]
import {chromium} from 'playwright';
import fs from 'node:fs';

const out = process.argv[2] || 'apex-probe-circuits.json';
const only = (process.argv[3] || '').split(',').filter(Boolean);
const browser = await chromium.launch({args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']});
const page = await browser.newPage({viewport: {width: 1280, height: 720}});
const errors = []; page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript((w) => { window.__probeW = w; }, +process.env.PROBE_WIDTH || 0.7);   // PROBE_WIDTH=0.95: check out to the road edges
await page.goto((process.env.APEX_URL || 'http://127.0.0.1:4333') + '/region.html', {timeout: 120000});
await page.waitForFunction(() => window.regionViewer && window.countryShots && window.simDebug?.().signals, null, {timeout: 300000, polling: 1000});
await page.waitForTimeout(8000);
const res = await page.evaluate((only) => {
  const R = window.regionViewer, meta = R.meta;
  const HALF = { ironport_grand_circuit: 5.5, ironworks_industrial_circuit: 7, harbor_district_circuit: 7, civic_riverfront_circuit: 7, great_lakes_cliff_raceway: 6, pinewood_rally_stage: 4.5, superior_range_circuit: 4.2, escarpment_circuit: 4.2 };
  const ids = Object.keys(meta.circuits).filter((id) => !only.length || only.includes(id));
  // ---- every circuit's line at 2 m ----
  const lines = {};
  for (const id of ids) {
    const built = window.coursePaths?.()[id], c = meta.circuits[id], xz = built?.length > 10 ? [...built.map((p) => [p.x, p.z]), ...(Math.hypot(built[0].x - built[built.length - 1].x, built[0].z - built[built.length - 1].z) < 60 ? [[built[0].x, built[0].z]] : [])] : c.xz, pts = [];   // the line the game built the circuit on, where it has one
    for (let i = 0; i < xz.length - 1; i++) { const a = xz[i], b = xz[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let t = 0; t < L; t += 2) pts.push([a[0] + (b[0] - a[0]) * t / L, a[1] + (b[1] - a[1]) * t / L]); }
    lines[id] = pts.map(([x, z], k) => { const a = pts[Math.max(0, k - 2)], b = pts[Math.min(pts.length - 1, k + 2)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return { x, z, tx: (b[0] - a[0]) / L, tz: (b[1] - a[1]) / L, g: R.groundH(x, z) }; });
  }
  // a hash of the sample points (6 m cells) to keep only geometry near some line
  const C = 6, hash = new Map();
  for (const id of ids) lines[id].forEach((p, k) => { const key = Math.floor(p.x / C) * 100003 + Math.floor(p.z / C); let a = hash.get(key); if (!a) hash.set(key, a = []); a.push([id, k]); });
  const nearSamples = (x0, x1, z0, z1) => { const o = []; for (let i = Math.floor(x0 / C); i <= Math.floor(x1 / C); i++) for (let j = Math.floor(z0 / C); j <= Math.floor(z1 / C); j++) { const a = hash.get(i * 100003 + j); if (a) o.push(...a); } return o; };
  const hits = {};                                                                           // id -> object name -> {n, at: [x,z,h]}
  const test = (name, minx, maxx, miny, maxy, minz, maxz) => {
    if (maxx - minx > 60 || maxz - minz > 60) return;                                      // a whole-mesh box this big says nothing; triangles are tested one by one
    for (const [id, k] of nearSamples(minx - 8, maxx + 8, minz - 8, maxz + 8)) {
      const p = lines[id][k], h = (HALF[id] ?? 4) * (window.__probeW || 0.7);
      // the box against the slab across the road at this sample: lateral within +-h, along within +-1 m
      const cx = (minx + maxx) / 2 - p.x, cz = (minz + maxz) / 2 - p.z, ex = (maxx - minx) / 2, ez = (maxz - minz) / 2;
      const along = Math.abs(cx * p.tx + cz * p.tz) - (ex * Math.abs(p.tx) + ez * Math.abs(p.tz)), lat = Math.abs(-cx * p.tz + cz * p.tx) - (ex * Math.abs(p.tz) + ez * Math.abs(p.tx));
      if (along > 1 || lat > h) continue;
      if (maxy < p.g + 0.25 || miny > p.g + 2.4) continue;
      const H = hits[id] ??= {}, e = H[name] ??= { n: 0, at: [] };
      e.n++; if (e.at.length < 6 && !e.at.some((q) => Math.hypot(q[0] - p.x, q[1] - p.z) < 25)) e.at.push([Math.round(p.x), Math.round(p.z), +(maxy - p.g).toFixed(1)]);
    }
  };
  const label = (o) => { const n = []; for (let q = o; q && n.length < 3; q = q.parent) if (q.name) n.push(q.name); const m = Array.isArray(o.material) ? o.material[0] : o.material; return n.join(' < ') || `${o.type} [${o.geometry?.type ?? '?'}, ${m?.name || m?.type || '?'} #${m?.color?.getHexString?.() ?? ''}${m?.map ? ' tex' : ''}]`; };
  const skip = /terrain|water|sky|road|deck|kerb|asphalt|line|paint|zebra|grass|veg|shadow|ribbon|decal|sand-drift|leaf-litter|court-|lamp$|cloud/i;
  const E = (m, x, y, z) => { const e = m.elements; return [e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]]; };
  const mul = (a, b) => { const o = new Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return { elements: o }; };
  let meshes = 0, tris = 0;
  R.scene.updateMatrixWorld(true);
  R.scene.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    let vis = true; for (let q = o; q; q = q.parent) if (!q.visible) { vis = false; break; } if (!vis) return;
    const name = label(o); if (skip.test(name)) return;
    const geo = o.geometry; if (!geo?.attributes?.position) return;
    meshes++;
    if (o.isInstancedMesh) {
      geo.boundingBox || geo.computeBoundingBox(); const bb = geo.boundingBox; if (!bb) return;
      const im = o.instanceMatrix.array, cnt = o.count;
      for (let i = 0; i < cnt; i++) {
        const m = mul(o.matrixWorld.elements, Array.from(im.subarray(i * 16, i * 16 + 16)));
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
        for (const X of [bb.min.x, bb.max.x]) for (const Y of [bb.min.y, bb.max.y]) for (const Z of [bb.min.z, bb.max.z]) { const [x, y, z] = E(m, X, Y, Z); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
        if (!nearSamples(x0 - 8, x1 + 8, z0 - 8, z1 + 8).length) continue;
        test(name, x0, x1, y0, y1, z0, z1);
      }
      return;
    }
    // plain meshes: a small one by its box, a big (merged) one triangle by triangle
    geo.boundingBox || geo.computeBoundingBox(); const bb = geo.boundingBox; const mw = o.matrixWorld;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const X of [bb.min.x, bb.max.x]) for (const Y of [bb.min.y, bb.max.y]) for (const Z of [bb.min.z, bb.max.z]) { const [x, y, z] = E(mw, X, Y, Z); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    if (!nearSamples(x0 - 8, x1 + 8, z0 - 8, z1 + 8).length && x1 - x0 < 300 && z1 - z0 < 300) return;
    if (x1 - x0 <= 60 && z1 - z0 <= 60) { test(name, x0, x1, y0, y1, z0, z1); return; }
    const pos = geo.attributes.position, idx = geo.index, n = idx ? idx.count : pos.count;
    for (let t = 0; t < n; t += 3) {
      let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9, c0 = 1e9, c1 = -1e9; const V = [];
      for (let v = 0; v < 3; v++) { const vi = idx ? idx.getX(t + v) : t + v; const P = E(mw, pos.getX(vi), pos.getY(vi), pos.getZ(vi)); V.push(P); const [x, y, z] = P; a0 = Math.min(a0, x); a1 = Math.max(a1, x); b0 = Math.min(b0, y); b1 = Math.max(b1, y); c0 = Math.min(c0, z); c1 = Math.max(c1, z); }
      tris++;
      const near = nearSamples(a0 - 8, a1 + 8, c0 - 8, c1 + 8); if (!near.length) continue;
      // a mostly level triangle (a road, a deck, a pad): its own height where the line crosses it, at the centre and +-h across; a steep one (a wall, a fence, a skirt) by its box
      const ux = V[1][0] - V[0][0], uy = V[1][1] - V[0][1], uz = V[1][2] - V[0][2], vx = V[2][0] - V[0][0], vy = V[2][1] - V[0][1], vz = V[2][2] - V[0][2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, nl = Math.hypot(nx, ny, nz) || 1;
      if (Math.abs(ny) / nl < 0.6) { test(name, a0, a1, b0, b1, c0, c1); continue; }
      const den = (V[1][2] - V[2][2]) * (V[0][0] - V[2][0]) + (V[2][0] - V[1][0]) * (V[0][2] - V[2][2]);
      if (Math.abs(den) < 1e-9) continue;
      for (const [id, k] of near) {
        const p = lines[id][k], h = (HALF[id] ?? 4) * (window.__probeW || 0.7);
        for (const o of [-h, 0, h]) {
          const x = p.x - p.tz * o, z = p.z + p.tx * o;
          const l1 = ((V[1][2] - V[2][2]) * (x - V[2][0]) + (V[2][0] - V[1][0]) * (z - V[2][2])) / den, l2 = ((V[2][2] - V[0][2]) * (x - V[2][0]) + (V[0][0] - V[2][0]) * (z - V[2][2])) / den, l3 = 1 - l1 - l2;
          if (l1 < 0 || l2 < 0 || l3 < 0) continue;
          const y = l1 * V[0][1] + l2 * V[1][1] + l3 * V[2][1], gy = R.groundH(x, z);
          if (y < gy + 0.45 || y > gy + 2.4) continue;
          const H = hits[id] ??= {}, e = H[name + ' (surface)'] ??= { n: 0, at: [] };
          e.n++; if (e.at.length < 6 && !e.at.some((q) => Math.hypot(q[0] - x, q[1] - z) < 25)) e.at.push([Math.round(x), Math.round(z), +(y - gy).toFixed(1)]);
        }
      }
    }
  });
  // ---- the ground along each line ----
  const ground = {};
  for (const id of ids) {
    const L = lines[id], steps = [], steep = [];
    for (let i = 1; i < L.length - 1; i++) {
      const p = L[i], d2 = p.g - (L[i - 1].g + L[i + 1].g) / 2, st = p.g - L[i - 1].g;
      if (Math.abs(d2) > 0.25 || Math.abs(st) > 0.6) steps.push([Math.round(p.x), Math.round(p.z), +st.toFixed(2)]);
    }
    for (let i = 5; i < L.length; i += 5) { const gr = (L[i].g - L[i - 5].g) / 10; if (Math.abs(gr) > 0.14) steep.push([Math.round(L[i].x), Math.round(L[i].z), Math.round(gr * 100)]); }
    // merge neighbouring flags into places
    const places = (arr) => { const o = []; for (const q of arr) { const last = o[o.length - 1]; if (last && Math.hypot(last[0] - q[0], last[1] - q[1]) < 30) { last[3]++; if (Math.abs(q[2]) > Math.abs(last[2])) last[2] = q[2]; } else o.push([q[0], q[1], q[2], 1]); } return o; };
    ground[id] = { samples: L.length, steps: places(steps), steep: places(steep) };
  }
  return { ids, meshes, tris, ground, hits };
}, only);
res.errors = errors.slice(0, 10);
fs.writeFileSync(out, JSON.stringify(res, null, 1));
for (const id of res.ids) {
  const g = res.ground[id], h = res.hits[id] ?? {};
  console.log(`\n${id}: ${g.samples * 2} m · ${g.steps.length} step places · ${g.steep.length} over-steep places · ${Object.keys(h).length} kinds of object on the course`);
  for (const [n, e] of Object.entries(h).sort((a, b) => b[1].n - a[1].n).slice(0, 12)) console.log(`   ${e.n.toString().padStart(4)}  ${n.slice(0, 70)}  e.g. ${JSON.stringify(e.at.slice(0, 3))}`);
}
console.log('\nmeshes', res.meshes, 'big-mesh triangles', res.tris, 'errors', errors.length);
await browser.close();
