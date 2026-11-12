/**
 * forgeSilhouette.ts — lays a Forge GLB's rest-pose silhouette over Muse's turnaround sheet, front and side, so the body
 * can be fitted to the art by measurement rather than by eye.
 *
 *   npx tsx scripts/eraclash3d/forgeSilhouette.ts [glb] [out.png]
 *
 * The sheet's figure and the model are scaled so sole and chin agree (the chin from MediaPipe on the sheet's face).
 * Art-only pixels show red, model-only blue, both grey. Prints per-band widths (art vs model) in metres.
 */
import fs from 'node:fs';
import { PNG } from 'pngjs';
import sharp from 'sharp';

const file = process.argv[2] ?? 'public/games/era-clash/3d/assets/characters/samurai_v3.glb';
const out = process.argv[3] ?? 'D:/Plajah Runtime/eraclash3d/forge/silhouette.png';
const SHEET = process.env.FORGE_SHEET ?? 'D:/Plajah Runtime/forge/haru-ref/sheet.png';
/** Sheet views: x range of each figure, sole and chin rows (chin from face landmarks on the sheet's front face). */
const VIEWS = { front: { x0: 100, x1: 700 }, side: { x0: 750, x1: 1300 } };
const SOLE = 1322, CHIN = 264.2;

// ---- the model's triangles at rest ------------------------------------------------------------------------------
const buf = fs.readFileSync(file);
const jsonLen = buf.readUInt32LE(12);
const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
const bin = buf.subarray(20 + jsonLen + 8);
const acc = (i: number) => {
  const a = gltf.accessors[i], v = gltf.bufferViews[a.bufferView];
  const off = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const n = a.count * ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 } as Record<string, number>)[a.type];
  const T = a.componentType === 5126 ? Float32Array : a.componentType === 5125 ? Uint32Array : a.componentType === 5123 ? Uint16Array : Uint8Array;
  return new T(bin.buffer.slice(bin.byteOffset + off, bin.byteOffset + off + n * T.BYTES_PER_ELEMENT)) as ArrayLike<number>;
};
const tris: number[][] = []; // [x,y,z]*3
let chinModel = Number(process.env.FORGE_CHIN ?? NaN);
for (const n of gltf.nodes) {
  if (n.mesh === undefined || n.extras?.forge || n.extensions?.EXT_mesh_gpu_instancing) continue;
  if (/kabuto|katana|wakizashi|saya/i.test(n.name ?? '')) continue;
  const t = n.translation ?? [0, 0, 0];
  for (const p of gltf.meshes[n.mesh].primitives) {
    const pos = acc(p.attributes.POSITION);
    const idx = p.indices !== undefined ? acc(p.indices) : Array.from({ length: pos.length / 3 }, (_, i) => i);
    for (let i = 0; i < idx.length; i += 3) tris.push([0, 1, 2].flatMap((e) => [pos[idx[i + e] * 3] + t[0], pos[idx[i + e] * 3 + 1] + t[1], pos[idx[i + e] * 3 + 2] + t[2]]));
  }
}
for (const n of gltf.nodes) if (n.extras?.face?.landmarks && Number.isNaN(chinModel)) chinModel = n.extras.face.landmarks[152 * 3 + 1];
for (const m of gltf.meshes) if (m.extras?.face?.landmarks && Number.isNaN(chinModel)) chinModel = m.extras.face.landmarks[152 * 3 + 1];
if (Number.isNaN(chinModel)) chinModel = 1.537;
const pxPerM = (SOLE - CHIN) / chinModel;

// ---- rasterize into the sheet's frame ------------------------------------------------------------------------------
const sheet = await sharp(SHEET).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
const W = sheet.info.width, H = sheet.info.height, S = sheet.data;
const bg = [S[(5 * W + 5) * 4], S[(5 * W + 5) * 4 + 1], S[(5 * W + 5) * 4 + 2]];
const art = new Uint8Array(W * H), model = new Uint8Array(W * H);
for (let i = 0; i < W * H; i++) art[i] = Math.abs(S[i * 4] - bg[0]) + Math.abs(S[i * 4 + 1] - bg[1]) + Math.abs(S[i * 4 + 2] - bg[2]) > 40 ? 1 : 0;
const centre = (x0: number, x1: number) => { // the figure's middle column: the median x of art pixels in the body band
  const xs: number[] = [];
  for (let y = 400; y < 1250; y += 4) for (let x = x0; x < x1; x++) if (art[y * W + x]) xs.push(x);
  xs.sort((a, b) => a - b); return xs[xs.length >> 1];
};
const fill = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => {
  const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx))), maxX = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
  const minY = Math.max(0, Math.floor(Math.min(ay, by, cy))), maxY = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
  const d = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
  if (Math.abs(d) < 1e-9) return;
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const px = x + 0.5, py = y + 0.5;
    const u = ((bx - px) * (cy - py) - (cx - px) * (by - py)) / d, v = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) / d;
    if (u >= -0.01 && v >= -0.01 && u + v <= 1.02) model[y * W + x] = 1;
  }
};
const report: Record<string, { y: number; art: number; model: number }[]> = {};
for (const [name, v] of Object.entries(VIEWS)) {
  const cx = centre(v.x0, v.x1);
  // front: model x to the right of the figure is its left (+x); side: the art faces left, the model's +z is its front
  const toPx = (p: number[]) => name === 'front' ? [cx + p[0] * pxPerM, SOLE - p[1] * pxPerM] : [cx - p[2] * pxPerM, SOLE - p[1] * pxPerM];
  for (const t of tris) { const a = toPx(t.slice(0, 3)), b = toPx(t.slice(3, 6)), c = toPx(t.slice(6, 9)); fill(a[0], a[1], b[0], b[1], c[0], c[1]); }
  report[name] = [];
  for (let y = 60; y <= SOLE; y += 20) {
    const span = (m: Uint8Array) => { let lo = -1, hi = -1; for (let x = v.x0; x < v.x1; x++) if (m[y * W + x]) { if (lo < 0) lo = x; hi = x; } return lo < 0 ? 0 : (hi - lo) / pxPerM; };
    report[name].push({ y: +((SOLE - y) / pxPerM).toFixed(3), art: +span(art).toFixed(3), model: +span(model).toFixed(3) });
  }
}
const png = new PNG({ width: W, height: H });
for (let i = 0; i < W * H; i++) {
  const a = art[i], m = model[i];
  const c = a && m ? [150, 150, 150] : a ? [220, 60, 50] : m ? [50, 110, 230] : [245, 245, 245];
  png.data.set([...c, 255], i * 4);
}
fs.writeFileSync(out, PNG.sync.write(png));
// the model's outline drawn over the art itself
const line = new PNG({ width: W, height: H });
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = y * W + x;
  const edge = model[i] && (x === 0 || y === 0 || x === W - 1 || y === H - 1 || !model[i - 1] || !model[i + 1] || !model[i - W] || !model[i + W]);
  line.data.set(edge ? [0, 255, 255, 255] : [S[i * 4], S[i * 4 + 1], S[i * 4 + 2], 255], i * 4);
}
fs.writeFileSync(out.replace(/\.png$/, '_outline.png'), PNG.sync.write(line));
console.log(JSON.stringify({ pxPerM: +pxPerM.toFixed(1), chinModel, out }));
for (const [name, rows] of Object.entries(report)) {
  console.log(name);
  for (const r of rows) console.log(`  y ${r.y.toFixed(2)}  art ${r.art.toFixed(3)}  model ${r.model.toFixed(3)}  ${(r.model - r.art >= 0 ? '+' : '') + (r.model - r.art).toFixed(3)}`);
}
