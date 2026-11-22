// Walk 8 km across the Expanse with the streamed terrain (docs/plajah-terrain.md, phase 6) and report hitches and
// memory:  npx tsx scripts/terrain/streamWalk.ts [speed m/s = 12] [budget ms = 4]
// Each simulated frame (60 fps) moves the player, refocuses the field, bakes for the budget and updates the chunks;
// we record the time each frame spends in terrain work, resident tiles / bytes and live chunks / vertices.
import * as THREE from 'three/webgpu';
import { compileGraph } from '../../services/terrain/graph';
import { EXPANSE, EXPANSE_SIZE } from '../../services/terrain/presets/expanse';
import { StreamedHeightField, StreamingChunks } from '../../services/terrain/stream';

const speed = Number(process.argv[2] ?? 12), budget = Number(process.argv[3] ?? 4), H = EXPANSE_SIZE / 2;
const f = compileGraph(EXPANSE);
let t = performance.now();
const field = new StreamedHeightField({ height: f, bounds: { x0: -H, z0: -H, size: EXPANSE_SIZE }, tile: 200, cell: 2, farCell: 16, radius: 700, budgetMs: budget });
const farMs = performance.now() - t;
const chunks = new StreamingChunks(field, new THREE.MeshBasicNodeMaterial(), { chunk: 100, buildBudgetMs: 3 });
// spawn: bake round the start, build the near ring
const path = [[-3600, -3300], [-1200, -900], [400, 300], [2600, 2900], [3600, 3500]];
const total = path.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - path[i][0], p[1] - path[i][1]), 0);
t = performance.now(); field.focus(path[0][0], path[0][1]); field.flush(); for (let k = 0; k < 400; k++) chunks.update({ x: path[0][0], z: path[0][1] }); const spawnMs = performance.now() - t;
const frames: number[] = [], bakeT: number[] = [], meshT: number[] = [], samples: string[] = [];
let walked = 0, seg = 0, peakBytes = 0, peakTiles = 0, peakChunks = 0, coarseUnder = 0, frameN = 0;
const dt = 1 / 60;
while (seg < path.length - 1) {
  const [ax, az] = path[seg], [bx, bz] = path[seg + 1], L = Math.hypot(bx - ax, bz - az);
  let u = 0;
  while (u < L) {
    u = Math.min(L, u + speed * dt); walked += speed * dt; frameN++;
    const x = ax + (bx - ax) * (u / L), z = az + (bz - az) * (u / L);
    const f0 = performance.now();
    if (frameN % 15 === 0) field.focus(x, z);
    field.update(budget);
    const f1 = performance.now();
    chunks.update({ x, z });
    const f2 = performance.now();
    frames.push(f2 - f0); bakeT.push(f1 - f0); meshT.push(f2 - f1);
    if (!field.fineAt(x, z)) coarseUnder++;
    peakBytes = Math.max(peakBytes, field.residentBytes); peakTiles = Math.max(peakTiles, field.residentTiles); peakChunks = Math.max(peakChunks, chunks.liveChunks);
    if (frameN % 3600 === 0) samples.push(`${(walked / 1000).toFixed(1)} km: ${field.residentTiles} tiles (${(field.residentBytes / 1e6).toFixed(1)} MB), ${field.pendingTiles} queued, ${chunks.liveChunks} chunks, ${(chunks.liveVertices / 1e6).toFixed(2)} M verts`);
  }
  seg++;
}
frames.sort((a, b) => a - b);
const p = (q: number) => frames[Math.floor(q * (frames.length - 1))].toFixed(2);
console.log(`far grid ${field.far.n}² baked in ${(farMs / 1000).toFixed(1)} s; spawn ring in ${(spawnMs / 1000).toFixed(1)} s`);
console.log(`walked ${(walked / 1000).toFixed(1)} km of ${(total / 1000).toFixed(1)} at ${speed} m/s, ${frames.length} frames, budget ${budget} ms`);
console.log(`terrain ms per frame: median ${p(0.5)}, p99 ${p(0.99)}, p99.9 ${p(0.999)}, max ${frames[frames.length - 1].toFixed(2)}; frames > 8 ms: ${frames.filter((v) => v > 8).length}`);
console.log(`peak ${peakTiles} tiles, ${(peakBytes / 1e6).toFixed(1)} MB field, ${peakChunks} chunks; ${field.stats.baked} tiles baked, ${field.stats.evicted} evicted; on coarse ground ${(100 * coarseUnder / frames.length).toFixed(2)}% of frames`);
bakeT.sort((a, b) => a - b); meshT.sort((a, b) => a - b);
const q = (a: number[], v: number) => a[Math.floor(v * (a.length - 1))].toFixed(2);
console.log(`  of which baking: p99 ${q(bakeT, 0.99)} max ${bakeT[bakeT.length - 1].toFixed(2)}; meshing: p99 ${q(meshT, 0.99)} max ${meshT[meshT.length - 1].toFixed(2)}`);
for (const s of samples.slice(0, 3)) console.log('  ' + s);
