// Bake Elderwood Wilds erosion offline (docs/plajah-terrain.md, phase 3):
//   npx tsx scripts/terrain/bakeWildsErosion.ts [preset] [--preview D:/dir]
// Erodes the 2 km world at 2 m with the authored places, rivers, trails, standing water and the hollow protected, and
// writes public/games/rift-realm/assets/terrain/wilds-erosion.ptrs: the height change (2 m) plus flow, wetness and
// deposition maps (4 m) for materials and the EcoSystem. The game adds the change on top of worldHeight (?erosion=1).
import { writeFileSync } from 'node:fs';
import { CORE, HALF, PLACES, POOL_STREAM, RIVER, TRAILS, WATER_Y, polyNear, smooth, worldHeight } from '../../games/rift-realm/src/world/layout';
import { EROSION_PRESETS, erodeGrid } from '../../services/terrain/erode/index';
import { downsample } from '../../services/terrain/maps';
import { encodeRaster } from '../../services/terrain/raster';

const preset = (process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'weathered') as keyof typeof EROSION_PRESETS;
const previewDir = process.argv.includes('--preview') ? process.argv[process.argv.indexOf('--preview') + 1] : null;
const CELL = 2, n = Math.round((HALF * 2) / CELL) + 1, X0 = -HALF;
const OUT = 'public/games/rift-realm/assets/terrain/wilds-erosion.ptrs';

const t0 = Date.now();
const h = new Float32Array(n * n), protect = new Float32Array(n * n);
const widthAt = (pts: readonly (readonly number[])[], i: number, t: number) => pts[i][3] + (pts[i + 1][3] - pts[i][3]) * t;
const segDist = (pts: number[][], x: number, z: number) => polyNear(pts, x, z).d;
for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
  const x = X0 + i * CELL, z = X0 + j * CELL, k = i + j * n, y = worldHeight(x, z);
  h[k] = y;
  let p = 1 - smooth(CORE + 30, CORE + 60, Math.max(Math.abs(x), Math.abs(z)));      // the hollow (elderwood.ts builds it)
  for (const pl of PLACES) {
    const R = (pl.pad ?? 18) * 1.8 + 10, d = Math.hypot(x - pl.x, z - pl.z);
    if (d < R + 25) p = Math.max(p, 1 - smooth(R, R + 25, d));
  }
  for (const [pts, bank] of [[RIVER, 22], [POOL_STREAM, 14]] as const) {
    const nr = polyNear(pts, x, z), w = widthAt(pts, nr.i, nr.t) / 2 + bank;
    if (nr.d < w + 25) p = Math.max(p, 1 - smooth(w, w + 25, nr.d));
  }
  for (const tr of TRAILS) { const d = segDist(tr, x, z); if (d < 16) p = Math.max(p, 0.8 * (1 - smooth(5, 16, d))); }
  p = Math.max(p, 1 - smooth(WATER_Y + 1, WATER_Y + 3.5, y));                        // standing water stays where it is
  protect[k] = p;
}
console.log(`grid ${n}² at ${CELL} m sampled + masked in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

const r = erodeGrid(h, n, CELL, { ...EROSION_PRESETS[preset], protect, seed: 24 });
let cut = 0, fill = 0, moved = 0, free = 0;
for (let k = 0; k < n * n; k++) { const d = r.delta[k]; cut = Math.min(cut, d); fill = Math.max(fill, d); moved += Math.abs(d); if (protect[k] < 0.05) free++; }
console.log(`${preset}: eroded in ${(r.ms / 1000).toFixed(1)} s; cut ${cut.toFixed(1)} m, fill ${fill.toFixed(1)} m, mean |Δ| ${(moved / (n * n)).toFixed(2)} m; ${(100 * free / (n * n)).toFixed(0)}% of the map free to erode`);

const m = Math.floor((n - 1) / 2) + 1, region4 = { x0: X0, z0: X0, size: HALF * 2, cell: CELL * 2 };
const buf = encodeRaster([
  { name: 'delta', x0: X0, z0: X0, size: HALF * 2, cell: CELL, data: r.delta, type: 'i16', step: 0.01 },
  { name: 'flow', ...region4, data: downsample(r.flow, n, 2), type: 'u8' },
  { name: 'wetness', ...region4, data: downsample(r.wetness, n, 2), type: 'u8' },
  { name: 'deposition', ...region4, data: downsample(r.deposition, n, 2), type: 'u8' },
], { world: 'elderwood-wilds', preset, baked: new Date().toISOString().slice(0, 10), m });
writeFileSync(OUT, Buffer.from(buf));
console.log(`wrote ${OUT} (${(buf.byteLength / 1e6).toFixed(2)} MB)`);

if (previewDir) {
  // quick look: hillshade before | after, protect mask in red, rivers of the flow map in blue
  const { deflateSync } = await import('node:zlib');
  const S = 2, w = Math.floor(n / S);
  const crcT = new Int32Array(256).map((_, k) => { let c = k; for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (b: Buffer) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (t: string, d: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const W = w * 2, raw = Buffer.alloc((W * 3 + 1) * w);
  const shade = (g: Float32Array, i: number, j: number) => {
    const k = i + j * n, dx = (g[Math.min(n - 1, i + 1) + j * n] - g[Math.max(0, i - 1) + j * n]) / 4, dz = (g[i + Math.min(n - 1, j + 1) * n] - g[i + Math.max(0, j - 1) * n]) / 4;
    return Math.max(0, Math.min(1, 0.55 + (-dx * 0.7 - dz * 0.7) * 1.2 / Math.hypot(1, dx, dz))) * (g[k] < WATER_Y ? 0.6 : 1);
  };
  for (let y = 0; y < w; y++) {
    raw[y * (W * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const i = x * S, j = y * S, k = i + j * n, a = shade(h, i, j) * 200, b = shade(r.height, i, j) * 200, pr = protect[k], fl = r.flow[k] > 0.6;
      raw.set([a, a, a], y * (W * 3 + 1) + 1 + x * 3);
      raw.set(fl ? [40, 90, 200] : [b + pr * 50, b * (1 - pr * 0.3), b * (1 - pr * 0.3)], y * (W * 3 + 1) + 1 + (x + w) * 3);
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(w, 4); ihdr[8] = 8; ihdr[9] = 2;
  writeFileSync(`${previewDir}/wilds-erosion.png`, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
  console.log(`preview ${previewDir}/wilds-erosion.png`);
}
