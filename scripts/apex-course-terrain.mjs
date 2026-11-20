// Where does the land come up through a circuit's pavement? Along each circuit's built line (window.coursePaths) every 2 m, the drawn terrain mesh
// (regionViewer.meshH) is read across the road at 1 m steps out to the edge, and compared with the road's own height on the centre line (groundH there).
// usage: APEX_URL=http://127.0.0.1:4333 node scripts/apex-course-terrain.mjs out.json [circuit_id,...]
import {chromium} from 'playwright';
import fs from 'node:fs';

const out = process.argv[2] || 'apex-course-terrain.json';
const only = (process.argv[3] || 'ironworks_industrial_circuit,harbor_district_circuit,civic_riverfront_circuit').split(',').filter(Boolean);
const browser = await chromium.launch({args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']});
const page = await browser.newPage({viewport: {width: 1280, height: 720}});
await page.goto((process.env.APEX_URL || 'http://127.0.0.1:4333') + '/region.html', {timeout: 120000});
await page.waitForFunction(() => window.regionViewer && window.coursePaths, null, {timeout: 420000, polling: 1000});
await page.waitForTimeout(6000);
const res = await page.evaluate((ids) => {
  const R = window.regionViewer, paths = window.coursePaths(), rep = {};
  for (const id of ids) {
    const P = paths[id]; if (!P) { rep[id] = 'no path'; continue; }
    let pts = 0, poke = 0, worst = 0, at = null; const spots = [];
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length], L = Math.hypot(b.x - a.x, b.z - a.z) || 1, tx = (b.x - a.x) / L, tz = (b.z - a.z) / L;
      for (let t = 0; t < L; t += 2) {
        const x = a.x + tx * t, z = a.z + tz * t, y = R.groundH(x, z); pts++;
        let m = 0;
        for (let s = -7; s <= 7; s++) { const h = R.meshH(x - tz * s, z + tx * s) - y; if (h > m) m = h; }
        if (m > 0.05) { poke++; if (m > worst) { worst = m; at = [Math.round(x), Math.round(z)]; } if (m > 0.3 && (!spots.length || Math.hypot(spots[spots.length - 1][0] - x, spots[spots.length - 1][1] - z) > 60)) spots.push([Math.round(x), Math.round(z), +m.toFixed(2)]); }
      }
    }
    rep[id] = {points: pts, pokeShare: +(poke / pts).toFixed(3), worst: +worst.toFixed(2), worstAt: at, spots: spots.slice(0, 40)};
  }
  return rep;
}, only);
fs.writeFileSync(out, JSON.stringify(res, null, 1));
for (const [k, v] of Object.entries(res)) console.log(k, typeof v === 'string' ? v : `terrain above the road at ${(v.pokeShare * 100).toFixed(1)}% of points, worst ${v.worst} m at ${v.worstAt}, ${v.spots.length} spots > 0.3 m`);
await browser.close();
