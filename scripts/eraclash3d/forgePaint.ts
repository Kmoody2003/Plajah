/**
 * forgePaint.ts — every garment and armour piece painted from the turnaround itself (forgeFidelity.ts --paint).
 *
 * - Each piece gets its own atlas (xatlas, engines/tela-3d/uv_atlas.py) in TEXCOORD_1, so the tiling detail maps on
 *   TEXCOORD_0 (weave, lacquer peel, hammer) keep working. Its vertices are re-cut along the atlas seams with every
 *   attribute carried by index: skin weights, correctives, nothing lost.
 * - The figure stands in the art's pose with its springs settled. Every texel's surface point is projected into the
 *   views that see it: front, back, and the side view for the left side (the same view mirrored for the right, which
 *   the sheet does not draw). Each view's depth buffer drops what is hidden; views blend by how squarely they see.
 * - Where no view sees a texel (inside folds, under plates) it keeps the piece's own colour.
 * The art's painted light comes with it: the texture is the painting, not a guess at it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

const PY = process.env.TELA3D_PY ?? 'D:/Plajah Runtime/tela3d-py/Scripts/python.exe';
type Acc = (i: number) => Float32Array | Uint32Array | Uint16Array | Uint8Array;
interface View { name: 'front' | 'side' | 'back'; r: { W: number; H: number; depth: Float32Array; mask: Uint8Array }; shift: number; x0: number; proj: (p: number[]) => [number, number, number] }
export interface PaintCtx {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gltf: any; bin: Buffer; acc: Acc; file: string; out: string;
  posedVerts: Map<string, { pp: Float32Array; nn: Float32Array }>;
  views: View[];
  sheet: { W: number; H: number; data: Buffer; mask: Uint8Array };
  work: string;
}

/** Meshes painted: the clothes and the armour (not the head, which has its own art-warped face; not hair, eyes, skin). */
const PAINT_NODES = /^(Haru_cloth|Haru_armour)$/;
const SKIP_MATERIALS = /^(hairCards|skin|face|scalp)$/;

export async function paintFromSheet(c: PaintCtx) {
  const g = c.gltf;
  const work = path.join(c.work, 'paint'); fs.mkdirSync(work, { recursive: true });
  // ---- which primitives, and their atlases ----------------------------------------------------------------------
  const jobs: { node: number; prim: number; key: string; out: string; res: number }[] = [];
  g.nodes.forEach((n: { name: string; mesh?: number }, ni: number) => {
    if (n.mesh === undefined || !PAINT_NODES.test(n.name)) return;
    g.meshes[n.mesh].primitives.forEach((pr: { attributes: Record<string, number>; indices: number; material: number }, pi: number) => {
      if (SKIP_MATERIALS.test(g.materials[pr.material]?.name ?? '')) return;
      const P = c.acc(pr.attributes.POSITION) as Float32Array, I = c.acc(pr.indices);
      let area = 0;
      for (let t = 0; t < I.length; t += 3) {
        const a = I[t] * 3, b = I[t + 1] * 3, d = I[t + 2] * 3;
        const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[d] - P[a], vy = P[d + 1] - P[a + 1], vz = P[d + 2] - P[a + 2];
        area += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
      }
      const res = area > 0.35 ? 2048 : area > 0.06 ? 1024 : 512; // about 2 texels per sheet pixel at most
      const key = `${ni}_${pi}`, out = path.join(work, key);
      fs.writeFileSync(out + '.f32', Buffer.from(new Float32Array(P).buffer));
      fs.writeFileSync(out + '.u32', Buffer.from(Uint32Array.from(I).buffer));
      jobs.push({ node: ni, prim: pi, key, out, res });
    });
  });
  const jobFile = path.join(work, 'jobs.json');
  fs.writeFileSync(jobFile, JSON.stringify(jobs.map((j) => ({ positions: j.out + '.f32', indices: j.out + '.u32', out: j.out, resolution: j.res }))));
  execFileSync(PY, ['engines/tela-3d/uv_atlas.py', jobFile], { stdio: ['ignore', 'pipe', 'inherit'] });

  // ---- paint ----------------------------------------------------------------------------------------------------
  const S = c.sheet;
  const srgb = (v: number) => 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
  const sampleArt = (x: number, y: number, outc: number[]) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= S.W - 1 || iy >= S.H - 1 || !S.mask[iy * S.W + ix]) return false;
    const u = x - ix, v = y - iy;
    outc[0] = outc[1] = outc[2] = 0;
    for (const [ox, oy, w] of [[0, 0, (1 - u) * (1 - v)], [1, 0, u * (1 - v)], [0, 1, (1 - u) * v], [1, 1, u * v]]) {
      const i = ((iy + oy) * S.W + ix + ox) * 4;
      for (let k = 0; k < 3; k++) outc[k] += S.data[i + k] * w;
    }
    return true;
  };
  const DIRS: { view: View; dir: number[]; mirror: boolean; w: number }[] = [];
  for (const v of c.views) {
    if (v.name === 'front') DIRS.push({ view: v, dir: [0, 0, 1], mirror: false, w: 1 });
    if (v.name === 'back') DIRS.push({ view: v, dir: [0, 0, -1], mirror: false, w: 0.9 });
    if (v.name === 'side') { DIRS.push({ view: v, dir: [1, 0, 0], mirror: false, w: 0.85 }); DIRS.push({ view: v, dir: [-1, 0, 0], mirror: true, w: 0.7 }); }
  }
  const painted = new Map<string, { vmap: Uint32Array; idx: Uint32Array; uv: Float32Array; jpeg: Buffer }>();
  let seen = 0, total = 0;
  for (const j of jobs) {
    // (copied out of the Buffer's own bytes: a small file's Buffer is a view into Node's shared pool)
    const own = (f: string) => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
    const vmap = new Uint32Array(own(j.out + '.vmap.u32')), idx = new Uint32Array(own(j.out + '.idx.u32')), uv = new Float32Array(own(j.out + '.uv.f32'));
    const posed = c.posedVerts.get(`${j.node}:${j.prim}`);
    if (!posed) continue;
    const mat = g.materials[g.meshes[g.nodes[j.node].mesh].primitives[j.prim].material];
    const base = (mat?.pbrMetallicRoughness?.baseColorFactor ?? [0.5, 0.5, 0.5]).slice(0, 3).map(srgb);
    const N = j.res;
    const img = new Float32Array(N * N * 3), have = new Uint8Array(N * N);
    const col = [0, 0, 0];
    for (let t = 0; t < idx.length; t += 3) {
      const vs = [idx[t], idx[t + 1], idx[t + 2]];
      const a = vs.map((v) => [uv[v * 2] * N, uv[v * 2 + 1] * N]);
      const det = (a[1][1] - a[2][1]) * (a[0][0] - a[2][0]) + (a[2][0] - a[1][0]) * (a[0][1] - a[2][1]);
      if (Math.abs(det) < 1e-12) continue;
      const o = vs.map((v) => vmap[v]);
      const x0 = Math.max(0, Math.floor(Math.min(a[0][0], a[1][0], a[2][0]))), x1 = Math.min(N - 1, Math.ceil(Math.max(a[0][0], a[1][0], a[2][0])));
      const y0 = Math.max(0, Math.floor(Math.min(a[0][1], a[1][1], a[2][1]))), y1 = Math.min(N - 1, Math.ceil(Math.max(a[0][1], a[1][1], a[2][1])));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5;
        const l0 = ((a[1][1] - a[2][1]) * (px - a[2][0]) + (a[2][0] - a[1][0]) * (py - a[2][1])) / det;
        const l1 = ((a[2][1] - a[0][1]) * (px - a[2][0]) + (a[0][0] - a[2][0]) * (py - a[2][1])) / det;
        const l2 = 1 - l0 - l1;
        if (l0 < -0.01 || l1 < -0.01 || l2 < -0.01) continue;
        const i = y * N + x;
        if (have[i]) continue;
        total++;
        const p = [0, 1, 2].map((k) => l0 * posed.pp[o[0] * 3 + k] + l1 * posed.pp[o[1] * 3 + k] + l2 * posed.pp[o[2] * 3 + k]);
        const n = [0, 1, 2].map((k) => l0 * posed.nn[o[0] * 3 + k] + l1 * posed.nn[o[1] * 3 + k] + l2 * posed.nn[o[2] * 3 + k]);
        const nl = Math.hypot(n[0], n[1], n[2]) || 1;
        let r = 0, gg = 0, b = 0, wt = 0;
        for (const d of DIRS) {
          const f = (n[0] * d.dir[0] + n[1] * d.dir[1] + n[2] * d.dir[2]) / nl;
          if (f <= 0.12) continue;
          const q = d.mirror ? [-p[0], p[1], p[2]] : p;
          const [sx, sy, near] = d.view.proj(q);
          const cx = Math.floor(sx - d.view.x0), cy = Math.floor(sy);
          if (cx < 0 || cy < 0 || cx >= d.view.r.W || cy >= d.view.r.H) continue;
          // hidden behind something nearer in that view (1.2 cm: a plate's own thickness and the pixel's footprint)
          if (d.view.r.depth[cy * d.view.r.W + cx] - near > 0.012) continue;
          if (!sampleArt(sx + d.view.shift, sy, col)) continue;
          const w = f * f * d.w;
          r += col[0] * w; gg += col[1] * w; b += col[2] * w; wt += w;
        }
        if (wt > 0) { img[i * 3] = r / wt; img[i * 3 + 1] = gg / wt; img[i * 3 + 2] = b / wt; seen++; }
        else { img[i * 3] = base[0]; img[i * 3 + 1] = base[1]; img[i * 3 + 2] = base[2]; }
        have[i] = 1;
      }
    }
    // grow past the charts' edges so filtering never pulls in black
    for (let pass = 0; pass < 6; pass++) {
      const add: [number, number, number, number][] = [];
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const i = y * N + x; if (have[i]) continue;
        let r = 0, gg = 0, b = 0, n = 0;
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + ox, yy = y + oy; if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue; const k = yy * N + xx; if (!have[k]) continue; r += img[k * 3]; gg += img[k * 3 + 1]; b += img[k * 3 + 2]; n++; }
        if (n) add.push([i, r / n, gg / n, b / n]);
      }
      for (const [i, r, gg, b] of add) { img[i * 3] = r; img[i * 3 + 1] = gg; img[i * 3 + 2] = b; have[i] = 1; }
    }
    const raw = Buffer.alloc(N * N * 3);
    for (let i = 0; i < N * N * 3; i++) raw[i] = Math.max(0, Math.min(255, Math.round(img[i])));
    const jpeg = await sharp(raw, { raw: { width: N, height: N, channels: 3 } }).jpeg({ quality: 88 }).toBuffer();
    painted.set(`${j.node}:${j.prim}`, { vmap, idx, uv, jpeg });
  }
  console.log(`painted ${painted.size} pieces; ${(100 * seen / Math.max(1, total)).toFixed(0)}% of their surface seen by the art`);
  writeGlb(c, painted);
}

/** Rewrite the GLB: painted primitives re-cut by their atlases, every accessor re-serialised, new textures added. */
function writeGlb(c: PaintCtx, painted: Map<string, { vmap: Uint32Array; idx: Uint32Array; uv: Float32Array; jpeg: Buffer }>) {
  const g = JSON.parse(JSON.stringify(c.gltf));
  const chunks: Buffer[] = []; let off = 0;
  const views: { buffer: number; byteOffset: number; byteLength: number; target?: number }[] = [];
  const push = (b: Buffer, target?: number) => {
    const pad = (4 - (off % 4)) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); off += pad; }
    views.push({ buffer: 0, byteOffset: off, byteLength: b.length, ...(target ? { target } : {}) });
    chunks.push(b); off += b.length; return views.length - 1;
  };
  const accessors: Record<string, unknown>[] = [];
  const typed = (a: Float32Array | Uint32Array | Uint16Array | Uint8Array) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
  // every existing accessor, copied as it is (a sparse one's indices and values views too: the face's ARKit shapes)
  const copyView = (vi: number) => { const v = c.gltf.bufferViews[vi]; return push(c.bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength)); };
  c.gltf.accessors.forEach((a: Record<string, unknown>, i: number) => {
    const { bufferView: bv, byteOffset: _bo, sparse, ...rest } = a as { bufferView?: number; byteOffset?: number; sparse?: { count: number; indices: { bufferView: number; byteOffset?: number; componentType: number }; values: { bufferView: number; byteOffset?: number } } };
    const out: Record<string, unknown> = { ...rest };
    if (bv !== undefined) { out.bufferView = push(typed(c.acc(i))); out.byteOffset = 0; } // else all zeros: no data
    if (sparse) out.sparse = { count: sparse.count, indices: { ...sparse.indices, bufferView: copyView(sparse.indices.bufferView) }, values: { ...sparse.values, bufferView: copyView(sparse.values.bufferView) } };
    accessors.push(out);
  });
  const addAcc = (data: Float32Array | Uint32Array | Uint16Array | Uint8Array, type: string, componentType: number, extra: Record<string, unknown> = {}) => {
    accessors.push({ bufferView: push(typed(data)), byteOffset: 0, componentType, count: data.length / ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 } as Record<string, number>)[type], type, ...extra });
    return accessors.length - 1;
  };
  const comps = (t: string) => ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 } as Record<string, number>)[t];
  const expand = (ai: number, vmap: Uint32Array) => {
    const a = c.gltf.accessors[ai], src = c.acc(ai), k = comps(a.type);
    const T = src.constructor as new (n: number) => typeof src;
    const out = new T(vmap.length * k);
    for (let v = 0; v < vmap.length; v++) for (let j = 0; j < k; j++) out[v * k + j] = src[vmap[v] * k + j];
    const extra: Record<string, unknown> = a.normalized ? { normalized: true } : {};
    if (a.min && a.max) { // POSITION needs its bounds
      const mn = Array(k).fill(Infinity), mx = Array(k).fill(-Infinity);
      for (let v = 0; v < vmap.length; v++) for (let j = 0; j < k; j++) { mn[j] = Math.min(mn[j], out[v * k + j]); mx[j] = Math.max(mx[j], out[v * k + j]); }
      extra.min = mn; extra.max = mx;
    }
    return addAcc(out, a.type, a.componentType, extra);
  };
  // images: the existing ones copied, the paintings appended
  g.images = (c.gltf.images ?? []).map((im: { bufferView: number; mimeType: string }) => {
    const v = c.gltf.bufferViews[im.bufferView];
    return { mimeType: im.mimeType, bufferView: push(c.bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength)) };
  });
  g.textures = g.textures ?? [];
  g.samplers = g.samplers?.length ? g.samplers : [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }];
  for (const [key, p] of painted) {
    const [ni, pi] = key.split(':').map(Number);
    const prim = g.meshes[g.nodes[ni].mesh].primitives[pi];
    for (const [name, ai] of Object.entries(c.gltf.meshes[c.gltf.nodes[ni].mesh].primitives[pi].attributes as Record<string, number>)) prim.attributes[name] = expand(ai, p.vmap);
    prim.attributes.TEXCOORD_1 = addAcc(p.uv, 'VEC2', 5126);
    if (prim.targets) prim.targets = (c.gltf.meshes[c.gltf.nodes[ni].mesh].primitives[pi].targets as Record<string, number>[]).map((t) => Object.fromEntries(Object.entries(t).map(([n, ai]) => [n, expand(ai, p.vmap)])));
    prim.indices = addAcc(p.idx, 'SCALAR', 5125);
    g.images.push({ mimeType: 'image/jpeg', bufferView: push(p.jpeg) });
    g.textures.push({ source: g.images.length - 1, sampler: 0 });
    // its own material: the piece's look, its colour now the painting (on the atlas channel)
    const m = JSON.parse(JSON.stringify(c.gltf.materials[prim.material]));
    m.name = `${m.name}_painted`;
    m.pbrMetallicRoughness = { ...(m.pbrMetallicRoughness ?? {}), baseColorFactor: [1, 1, 1, m.pbrMetallicRoughness?.baseColorFactor?.[3] ?? 1], baseColorTexture: { index: g.textures.length - 1, texCoord: 1 } };
    g.materials.push(m);
    prim.material = g.materials.length - 1;
  }
  g.accessors = accessors;
  g.bufferViews = views;
  const binBuf = Buffer.concat(chunks);
  const binPad = Buffer.concat([binBuf, Buffer.alloc((4 - (binBuf.length % 4)) % 4)]);
  g.buffers = [{ byteLength: binPad.length }];
  let json = Buffer.from(JSON.stringify(g), 'utf8');
  json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
  const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + json.length + 8 + binPad.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(json.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(binPad.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  fs.writeFileSync(c.out, Buffer.concat([header, jh, json, bh, binPad]));
}
