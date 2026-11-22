// Compare the Wilds' hand-written forest placement (world/index.ts, replicated here) with the EcoSystem rules
// (world/eco.ts), plain and with the erosion bake:  npx tsx scripts/terrain/compareWildsEco.ts [--png D:/dir]
// Clearance is approximated from the layout (trails, rivers, places' pads); the game uses its own mask.
import { readFileSync, writeFileSync } from 'node:fs';
import { CORE, HALF, PLACES, POOL_STREAM, RIVER, TRAILS, WATER_Y, plateauMask, polyNear, worldHeight } from '../../games/rift-realm/src/world/layout';
import { scatterWilds } from '../../games/rift-realm/src/world/eco';
import { HeightField } from '../../services/terrain/field';
import { compileGraph } from '../../services/terrain/graph';
import { decodeRaster } from '../../services/terrain/raster';
import type { Spot } from '../../services/terrain/eco/index';
import { ELDERWOOD_TREES } from '../../services/vegetation/catalog/cyberForest';

const field = (h: (x: number, z: number) => number) => { const f = new HeightField({ height: h, world: { x0: -HALF, z0: -HALF, size: HALF * 2, cell: 2 } }); f.bake(); return f; };
const MC = 4, MN = Math.round((HALF * 2) / MC), mask = new Float32Array(MN * MN);
const clears = PLACES.map((p) => [p.x, p.z, (p.pad ?? 14)]);
for (let j = 0; j < MN; j++) for (let i = 0; i < MN; i++) {
  const x = -HALF + (i + 0.5) * MC, z = -HALF + (j + 0.5) * MC;
  let d = 12;
  for (const tr of TRAILS) { const n = polyNear(tr, x, z); if (n.d < d) d = n.d; }
  for (const pts of [RIVER, POOL_STREAM]) { const n = polyNear(pts, x, z); const w = pts[n.i][3] / 2 + 1.5; if (n.d - w < d) d = Math.max(0, n.d - w); }
  for (const c of clears) { const e = Math.hypot(x - c[0], z - c[1]) - c[2]; if (e < d) d = Math.max(0, e); }
  mask[i + j * MN] = d;
}
const clearance = (x: number, z: number) => mask[Math.min(MN - 1, Math.max(0, Math.floor((x + HALF) / MC))) + Math.min(MN - 1, Math.max(0, Math.floor((z + HALF) / MC))) * MN];

/** world/index.ts's canopy loop, verbatim but for the clearance source. */
function handWritten(T: HeightField) {
  let seed = 9091; const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const trees: Spot[] = [], cell = 10.5;
  for (let gz = -HALF + 40; gz < HALF - 40; gz += cell) for (let gx = -HALF + 40; gx < HALF - 40; gx += cell) {
    const x = gx + (R() - 0.5) * cell * 0.95, z = gz + (R() - 0.5) * cell * 0.95;
    if (Math.abs(x) < CORE + 6 && Math.abs(z) < CORE + 6) continue;
    if (clearance(x, z) < 5) continue;
    const y = T.surface(x, z), n = T.normal(x, z, 2);
    if (n[1] < 0.8) continue;
    const wet = y < WATER_Y + 0.4, r = Math.max(Math.abs(x), Math.abs(z)), P = plateauMask(x, z), riverD = polyNear(RIVER, x, z).d;
    let dens = 0.82, k = R() < 0.5 ? 2 : 0, s = 0.85 + R() * 0.55;
    if (wet) { if (R() > 0.35) continue; k = 3; }
    else if (P < 0.5) { k = R() < 0.72 ? 0 : R() < 0.5 ? 1 : 2; dens = 0.9; }
    else if (z < -470) { k = R() < 0.6 ? 2 : 0; dens = 0.7; }
    else if (x > 220 && z < 40) { k = R() < 0.7 ? 6 : 2; s = k === 6 ? 0.75 + R() * 0.5 : 1.25 + R() * 0.7; dens = 0.62; }
    if (riverD < 34 && !wet && R() < 0.45) k = 1;
    if (r > 880) dens = 0.55;
    if (R() > dens) continue;
    trees.push({ x, y: y - 0.25, z, yaw: R() * 6.283, species: k, scale: s });
  }
  // the undergrowth loop (world/index.ts), same RNG stream
  const plants: Spot[] = [], fungi: Spot[] = [];
  const tr = (t: Spot) => (ELDERWOOD_TREES[t.species]?.trunk.radius ?? 0.5) * t.scale;
  for (const t of trees) {
    if (Math.hypot(t.x, t.z) >= HALF * 0.95) continue;
    if (t.species === 6) {
      const r = tr(t);
      for (let k = 0; k < 7; k++) { const a = R() * 6.283, d = r * (1.6 + R() * 2.6), x = t.x + Math.sin(a) * d, z = t.z + Math.cos(a) * d; if (clearance(x, z) < 1.5) continue; plants.push({ x, y: 0, z, yaw: 0, species: R() < 0.55 ? 8 : 7, scale: 1 + R() * 0 }); }
      for (let k = 0; k < 3; k++) { R(); R(); fungi.push({ x: t.x, y: 0, z: t.z, yaw: 0, species: 4, scale: 1 }); }
      continue;
    }
    if (R() > 0.65) continue;
    for (let k = 0, m = 1 + Math.floor(R() * 2); k < m; k++) { const a = R() * 6.283, d = 2.5 + R() * 5, x = t.x + Math.sin(a) * d, z = t.z + Math.cos(a) * d; if (clearance(x, z) < 2) continue; plants.push({ x, y: 0, z, yaw: 0, species: R() < 0.6 ? 0 : 1, scale: 1 }); R(); R(); }
    if (R() < 0.22) { const a = R() * 6.283, d = 2 + R() * 3; fungi.push({ x: t.x + Math.sin(a) * d, y: 0, z: t.z + Math.cos(a) * d, yaw: 0, species: R() < 0.7 ? 0 : 1, scale: 1 }); R(); R(); }
    if (R() < 0.12) { R(); fungi.push({ x: t.x, y: 0, z: t.z, yaw: 0, species: 4, scale: 1 }); R(); }
  }
  for (let k = 0; k < 1400; k++) { const pts = R() < 0.8 ? RIVER : POOL_STREAM, i = Math.floor(R() * (pts.length - 1)); R(); const a = pts[i], b = pts[i + 1]; if (Math.abs(b[2] - a[2]) > 10) continue; R(); R(); plants.push({ x: a[0], y: 0, z: a[1], yaw: 0, species: R() < 0.75 ? 2 : 4, scale: 1 }); R(); }
  return { trees, plants, fungi };
}
const bySpecies = (a: Spot[]) => { const m: Record<number, number> = {}; for (const t of a) m[t.species] = (m[t.species] ?? 0) + 1; return m; };

const plain = field(worldHeight);
let t0 = Date.now(); const H = handWritten(plain), hand = H.trees; const handMs = Date.now() - t0;
const eco = scatterWilds({ height: (x, z) => plain.surface(x, z), normal: (x, z) => plain.normal(x, z, 2), clearance });
const ras = decodeRaster(readFileSync('public/games/rift-realm/assets/terrain/wilds-erosion.ptrs').buffer as ArrayBuffer);
const ero = field(compileGraph({ version: 1, output: 'o', nodes: { b: { type: 'fn', name: 'w' }, e: { type: 'raster', name: 'd' }, o: { type: 'combine', op: 'add', inputs: ['b', 'e'] } } }, { w: worldHeight }, { d: ras.layers.delta }));
const ecoE = scatterWilds({ height: (x, z) => ero.surface(x, z), normal: (x, z) => ero.normal(x, z, 2), clearance, maps: { wet: ras.layers.wetness, flow: ras.layers.flow, dep: ras.layers.deposition } });
console.log('trees by species   hand-written', bySpecies(hand), hand.length, `(${handMs} ms)`);
console.log('                   eco plain   ', bySpecies(eco.trees), eco.trees.length, `(${Math.round(eco.ms)} ms incl. undergrowth)`);
console.log('                   eco eroded  ', bySpecies(ecoE.trees), ecoE.trees.length, `(${Math.round(ecoE.ms)} ms)`);
console.log('plants / fungi     hand-written', H.plants.length, H.fungi.length, '· eco plain', eco.plants.length, eco.fungi.length, '· eco eroded', ecoE.plants.length, ecoE.fungi.length);
console.log('rules (eroded)', ecoE.byRule);

const pi = process.argv.indexOf('--png');
if (pi > 0) {
  // three panels: hand-written | eco plain | eco eroded (trees as dots by species, plants green, fungi cyan)
  const { deflateSync } = await import('node:zlib');
  const S = 1000, W = S * 3, img = Buffer.alloc((W * 3 + 1) * S);
  const col: Record<number, number[]> = { 0: [60, 160, 70], 1: [150, 200, 90], 2: [40, 110, 60], 3: [150, 90, 160], 6: [190, 80, 50] };
  for (let y = 0; y < S; y++) { img[y * (W * 3 + 1)] = 0; for (let x = 0; x < W; x++) { const wx = -HALF + (x % S) * 2, wz = -HALF + y * 2, h = plain.surface(wx, wz); const g = h < WATER_Y ? [30, 40, 70] : [22, 24, 22]; img.set(g, y * (W * 3 + 1) + 1 + x * 3); } }
  const dot = (panel: number, s: Spot, c: number[]) => { const x = Math.round((s.x + HALF) / 2) + panel * S, y = Math.round((s.z + HALF) / 2); if (y >= 0 && y < S && x >= panel * S && x < (panel + 1) * S) img.set(c, y * (W * 3 + 1) + 1 + x * 3); };
  [[hand, H.plants, H.fungi], [eco.trees, eco.plants, eco.fungi], [ecoE.trees, ecoE.plants, ecoE.fungi]].forEach(([tr, pl, fu], p) => {
    for (const s of pl as Spot[]) dot(p, s, [120, 220, 120]);
    for (const s of fu as Spot[]) dot(p, s, [60, 230, 240]);
    for (const s of tr as Spot[]) dot(p, s, col[s.species] ?? [255, 255, 255]);
  });
  const crcT = new Int32Array(256).map((_, k) => { let c = k; for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (b: Buffer) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (t: string, d: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 2;
  writeFileSync(`${process.argv[pi + 1]}/wilds-eco.png`, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(img)), chunk('IEND', Buffer.alloc(0))]));
  console.log(`png ${process.argv[pi + 1]}/wilds-eco.png`);
}
