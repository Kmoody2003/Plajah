/**
 * forgeFidelity.ts — scores a Forge character against its reference art from every view the art gives, so a pass is
 * judged by measurement, not by eye (Kenne, 2026-11-12: keep correcting until it is 95% of the art).
 *
 *   npx tsx scripts/eraclash3d/forgeFidelity.ts [glb] [--out dir] [--json]
 *
 * - Poses the model like the art (arm hang, elbow, leg stance: fitted to the front view's silhouette), so the score
 *   is about shape, not the rest pose's A.
 * - Renders it in software in the turnaround's own frame (sole and chin agree, each view centred on its figure):
 *   front, side (faces left, as the art), back. Albedo with a soft key light, like the painted art.
 * - Scores per view and per region (head, torso, legs):
 *   - shape: silhouette IoU, and the mean distance between the two outlines (mm);
 *   - colour: CIE Lab difference of 1.2 cm blocks where both have the figure;
 *   - overall: the mean of shape and colour, weighted toward the head.
 * - Writes each view's art | model | overlay to <out>/fidelity_<view>.png and the numbers to fidelity.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PNG } from 'pngjs';
import { HARU_SHEET, HEAD_WARP_FILE, loadHeadWarp, type HeadWarp } from './forgeFaceFit';
import * as THREE from 'three/webgpu';
import { SpringBones } from '../../playkit/character/springBones';

type M4 = Float64Array;
const args = process.argv.slice(2);
const file = args.find((a) => a.endsWith('.glb')) ?? 'public/games/era-clash/3d/assets/characters/samurai_v3.glb';
const outDir = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'D:/Plajah Runtime/eraclash3d/forge/fidelity';
fs.mkdirSync(outDir, { recursive: true });

// ---- small maths ----------------------------------------------------------------------------------------------------
const ident = (): M4 => { const m = new Float64Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; };
const mul = (a: M4, b: M4): M4 => {
  const o = new Float64Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; }
  return o;
};
const trs = (t = [0, 0, 0], q = [0, 0, 0, 1], s = [1, 1, 1]): M4 => {
  const [x, y, z, w] = q, m = new Float64Array(16);
  m[0] = (1 - 2 * (y * y + z * z)) * s[0]; m[1] = 2 * (x * y + z * w) * s[0]; m[2] = 2 * (x * z - y * w) * s[0];
  m[4] = 2 * (x * y - z * w) * s[1]; m[5] = (1 - 2 * (x * x + z * z)) * s[1]; m[6] = 2 * (y * z + x * w) * s[1];
  m[8] = 2 * (x * z + y * w) * s[2]; m[9] = 2 * (y * z - x * w) * s[2]; m[10] = (1 - 2 * (x * x + y * y)) * s[2];
  m[12] = t[0]; m[13] = t[1]; m[14] = t[2]; m[15] = 1; return m;
};
const qmul = (a: number[], b: number[]) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const qaxis = (ax: number[], ang: number) => { const l = Math.hypot(ax[0], ax[1], ax[2]); const s = Math.sin(ang / 2) / l; return [ax[0] * s, ax[1] * s, ax[2] * s, Math.cos(ang / 2)]; };

// ---- the GLB ----------------------------------------------------------------------------------------------------------
const buf = fs.readFileSync(file);
const jsonLen = buf.readUInt32LE(12);
const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
const bin = buf.subarray(20 + jsonLen + 8);
const view = (i: number) => { const v = gltf.bufferViews[i]; return bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength); };
const acc = (i: number): Float32Array | Uint32Array | Uint16Array | Uint8Array => {
  const a = gltf.accessors[i], v = gltf.bufferViews[a.bufferView];
  const n = a.count * ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 } as Record<string, number>)[a.type];
  const T = a.componentType === 5126 ? Float32Array : a.componentType === 5125 ? Uint32Array : a.componentType === 5123 ? Uint16Array : Uint8Array;
  if (!v) return new T(n); // no buffer view: all zeros (glTF allows it, e.g. an empty morph target)
  const off = bin.byteOffset + (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
  return new T(bin.buffer.slice(off, off + n * T.BYTES_PER_ELEMENT));
};
const images = await Promise.all((gltf.images ?? []).map(async (im: { bufferView: number }) => {
  const r = await sharp(view(im.bufferView)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { w: r.info.width, h: r.info.height, d: r.data };
}));
const matColour = (mi: number | undefined) => {
  const m = mi === undefined ? null : gltf.materials[mi];
  const f = m?.pbrMetallicRoughness?.baseColorFactor ?? [0.8, 0.8, 0.8, 1];
  const ti = m?.pbrMetallicRoughness?.baseColorTexture?.index;
  return { f, img: ti === undefined ? null : images[gltf.textures[ti].source], name: m?.name ?? '', index: mi ?? -1, texCoord: m?.pbrMetallicRoughness?.baseColorTexture?.texCoord ?? 0 };
};

const N = gltf.nodes.length;
const parent = new Int32Array(N).fill(-1);
gltf.nodes.forEach((n: { children?: number[] }, i: number) => n.children?.forEach((c) => { parent[c] = i; }));
const byName = new Map<string, number>(gltf.nodes.map((n: { name?: string }, i: number) => [n.name ?? `n${i}`, i]));

/**
 * World matrices in the art's pose with the spring chains (tassets, shoulder guards, ponytail) settled under gravity
 * against the body's capsules, as the game shows them standing: the playkit's own SpringBones, run for two seconds.
 */
const forge = gltf.nodes.find((n: { extras?: { forge?: unknown } }) => n.extras?.forge)?.extras.forge;
function worlds(pose: Record<string, number[]>): M4[] {
  const joints = new Set<number>(gltf.skins?.[0]?.joints ?? []);
  const objs: THREE.Object3D[] = gltf.nodes.map((n: { name?: string; translation?: number[]; rotation?: number[]; scale?: number[] }, i: number) => {
    const o = joints.has(i) ? new THREE.Bone() : new THREE.Object3D();
    o.name = n.name ?? `n${i}`;
    if (n.translation) o.position.fromArray(n.translation);
    const q = pose[o.name] ? qmul(pose[o.name], n.rotation ?? [0, 0, 0, 1]) : n.rotation;
    if (q) o.quaternion.fromArray(q);
    if (n.scale) o.scale.fromArray(n.scale);
    return o;
  });
  const root = new THREE.Group();
  gltf.nodes.forEach((n: { children?: number[] }, i: number) => n.children?.forEach((c) => objs[i].add(objs[c])));
  for (let i = 0; i < N; i++) if (parent[i] < 0) root.add(objs[i]);
  root.updateMatrixWorld(true);
  if (forge?.springs?.length && !args.includes('--no-springs')) {
    const springs = new SpringBones(root, forge.springs, forge.capsules);
    springs.reset();
    for (let k = 0; k < 120; k++) { springs.update(1 / 60); root.updateMatrixWorld(true); }
  }
  return objs.map((o) => Float64Array.from(o.matrixWorld.elements));
}

// every triangle of the figure, posed: positions, normals, colour per vertex (texture sampled at the vertex is too
// coarse for the face: the UVs are kept and sampled per pixel)
interface Tri { p: number[]; n: number[]; uv: number[] | null; mat: ReturnType<typeof matColour>; tail?: boolean }
const SKIP = new Set(['kabuto', 'katana']); // hidden by default / the drawn sword is a gameplay prop the art does not hold
/** Each primitive's posed vertices from the last posedTris (`node:primitive`), for painting. */
export const posedVerts = new Map<string, { pp: Float32Array; nn: Float32Array }>();
function posedTris(pose: Record<string, number[]>): Tri[] {
  posedVerts.clear();
  const W = worlds(pose);
  const skinMats = (gltf.skins ?? []).map((s: { joints: number[]; inverseBindMatrices: number }) => {
    const ibm = acc(s.inverseBindMatrices) as Float32Array;
    return s.joints.map((j, k) => mul(W[j], Float64Array.from(ibm.subarray(k * 16, k * 16 + 16))));
  });
  const tris: Tri[] = [];
  gltf.nodes.forEach((node: { name: string; mesh?: number; skin?: number; extensions?: Record<string, { attributes: Record<string, number> }> }, ni: number) => {
    if (node.mesh === undefined) return;
    let skipped = false; for (let a = ni; a >= 0; a = parent[a]) if (SKIP.has(gltf.nodes[a].name)) skipped = true;
    if (skipped) return;
    const inst = node.extensions?.EXT_mesh_gpu_instancing?.attributes;
    const instM: M4[] = [];
    if (inst) {
      const T = acc(inst.TRANSLATION) as Float32Array, R = acc(inst.ROTATION) as Float32Array, S = acc(inst.SCALE) as Float32Array;
      for (let k = 0; k < T.length / 3; k++) instM.push(mul(W[ni], trs([...T.subarray(k * 3, k * 3 + 3)], [...R.subarray(k * 4, k * 4 + 4)], [...S.subarray(k * 3, k * 3 + 3)])));
    } else instM.push(W[ni]);
    for (const [pi, pr] of (gltf.meshes[node.mesh].primitives as { attributes: Record<string, number>; indices?: number; material?: number }[]).entries()) {
      const P = acc(pr.attributes.POSITION) as Float32Array, Nn = acc(pr.attributes.NORMAL) as Float32Array;
      const mat = matColour(pr.material);
      const uvAttr = pr.attributes[`TEXCOORD_${mat.texCoord}`];
      const UV = uvAttr !== undefined ? acc(uvAttr) as Float32Array : null;
      const idx = pr.indices !== undefined ? acc(pr.indices) : Uint32Array.from({ length: P.length / 3 }, (_, i) => i);
      const nv = P.length / 3;
      // the ponytail's own triangles (skinned to its tail chain), so the skull's outline can be measured without it
      const jointNames: string[] = node.skin !== undefined ? gltf.skins[node.skin].joints.map((j: number) => gltf.nodes[j].name) : [];
      let onTail: Uint8Array | null = null;
      if (node.skin !== undefined && pr.attributes.JOINTS_0 !== undefined) {
        const J = acc(pr.attributes.JOINTS_0), Wt = acc(pr.attributes.WEIGHTS_0) as Float32Array;
        onTail = new Uint8Array(nv);
        for (let v = 0; v < nv; v++) for (let k = 0; k < 4; k++) if (Wt[v * 4 + k] > 0.3 && /^Tail_/.test(jointNames[J[v * 4 + k]])) onTail[v] = 1;
      }
      for (const base of instM) {
        const pp = new Float32Array(nv * 3), nn = new Float32Array(nv * 3);
        if (node.skin !== undefined) {
          const J = acc(pr.attributes.JOINTS_0), Wt = acc(pr.attributes.WEIGHTS_0) as Float32Array, mats = skinMats[node.skin];
          for (let v = 0; v < nv; v++) {
            let x = 0, y = 0, z = 0, a = 0, b = 0, c = 0;
            for (let k = 0; k < 4; k++) {
              const w = Wt[v * 4 + k]; if (!w) continue;
              const m = mats[J[v * 4 + k]];
              const px = P[v * 3], py = P[v * 3 + 1], pz = P[v * 3 + 2];
              x += w * (m[0] * px + m[4] * py + m[8] * pz + m[12]); y += w * (m[1] * px + m[5] * py + m[9] * pz + m[13]); z += w * (m[2] * px + m[6] * py + m[10] * pz + m[14]);
              const qx = Nn[v * 3], qy = Nn[v * 3 + 1], qz = Nn[v * 3 + 2];
              a += w * (m[0] * qx + m[4] * qy + m[8] * qz); b += w * (m[1] * qx + m[5] * qy + m[9] * qz); c += w * (m[2] * qx + m[6] * qy + m[10] * qz);
            }
            pp[v * 3] = x; pp[v * 3 + 1] = y; pp[v * 3 + 2] = z; nn[v * 3] = a; nn[v * 3 + 1] = b; nn[v * 3 + 2] = c;
          }
        } else {
          const m = base;
          for (let v = 0; v < nv; v++) {
            const px = P[v * 3], py = P[v * 3 + 1], pz = P[v * 3 + 2];
            pp[v * 3] = m[0] * px + m[4] * py + m[8] * pz + m[12]; pp[v * 3 + 1] = m[1] * px + m[5] * py + m[9] * pz + m[13]; pp[v * 3 + 2] = m[2] * px + m[6] * py + m[10] * pz + m[14];
            const qx = Nn[v * 3], qy = Nn[v * 3 + 1], qz = Nn[v * 3 + 2];
            nn[v * 3] = m[0] * qx + m[4] * qy + m[8] * qz; nn[v * 3 + 1] = m[1] * qx + m[5] * qy + m[9] * qz; nn[v * 3 + 2] = m[2] * qx + m[6] * qy + m[10] * qz;
          }
        }
        if (!posedVerts.has(`${ni}:${pi}`)) posedVerts.set(`${ni}:${pi}`, { pp, nn });
        for (let t = 0; t < idx.length; t += 3) {
          const vs = [idx[t], idx[t + 1], idx[t + 2]];
          tris.push({
            p: vs.flatMap((v) => [pp[v * 3], pp[v * 3 + 1], pp[v * 3 + 2]]),
            n: vs.flatMap((v) => [nn[v * 3], nn[v * 3 + 1], nn[v * 3 + 2]]),
            uv: UV && mat.img ? vs.flatMap((v) => [UV[v * 2], UV[v * 2 + 1]]) : null,
            mat, tail: onTail ? vs.some((v) => onTail![v]) : false,
          });
        }
      }
    }
  });
  return tris;
}

// ---- the sheet ------------------------------------------------------------------------------------------------------
const SH = HARU_SHEET;
const sheet = await sharp(SH.path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const SW = sheet.info.width, SHh = sheet.info.height, S = sheet.data;
const bg = [S[(5 * SW + 5) * 4], S[(5 * SW + 5) * 4 + 1], S[(5 * SW + 5) * 4 + 2]];
const artMask = new Uint8Array(SW * SHh);
for (let i = 0; i < SW * SHh; i++) artMask[i] = Math.abs(S[i * 4] - bg[0]) + Math.abs(S[i * 4 + 1] - bg[1]) + Math.abs(S[i * 4 + 2] - bg[2]) > 40 ? 1 : 0;
const centreOf = (x0: number, x1: number) => { const xs: number[] = []; for (let y = 400; y < 1250; y += 4) for (let x = x0; x < x1; x++) if (artMask[y * SW + x]) xs.push(x); xs.sort((a, b) => a - b); return xs[xs.length >> 1]; };
let chinModel = 1.537;
for (const n of gltf.nodes) if (n.extras?.forge?.tune) chinModel = 1.537;
const ppm = (SH.sole - SH.chin) / chinModel;
type ViewName = 'front' | 'side' | 'back';
const VIEWS: Record<ViewName, { x0: number; x1: number; cx: number; proj: (p: number[]) => [number, number, number] }> = {} as never;
for (const [name, r] of [['front', SH.front], ['side', SH.side], ['back', SH.back]] as const) {
  const cx = centreOf(r.x0, r.x1);
  // [screen x, screen y, nearness]
  const proj = name === 'front' ? (p: number[]): [number, number, number] => [cx + p[0] * ppm, SH.sole - p[1] * ppm, p[2]]
    : name === 'side' ? (p: number[]): [number, number, number] => [cx - p[2] * ppm, SH.sole - p[1] * ppm, p[0]]
      : (p: number[]): [number, number, number] => [cx - p[0] * ppm, SH.sole - p[1] * ppm, -p[2]];
  VIEWS[name] = { x0: r.x0, x1: r.x1, cx, proj };
}
// the model's figure is centred like the art's: on its own median column through the body
// (applied after rendering, by the shift that best overlays the two)

// ---- rendering ------------------------------------------------------------------------------------------------------
const LIGHT: Record<ViewName, number[]> = { front: [-0.35, 0.45, 0.82], side: [0.82, 0.45, 0.35], back: [0.35, 0.45, -0.82] };
function render(tris: Tri[], v: ViewName) {
  const { x0, x1, proj } = VIEWS[v];
  const W = x1 - x0, H = SHh;
  const depth = new Float32Array(W * H).fill(-Infinity), rgb = new Float32Array(W * H * 3), mask = new Uint8Array(W * H);
  const matId = new Int16Array(W * H).fill(-1), shadeOf = new Float32Array(W * H);
  const L = LIGHT[v], ll = Math.hypot(L[0], L[1], L[2]);
  for (const t of tris) {
    const a = proj(t.p.slice(0, 3)), b = proj(t.p.slice(3, 6)), c = proj(t.p.slice(6, 9));
    const ax = a[0] - x0, bx = b[0] - x0, cx = c[0] - x0;
    const d = (bx - ax) * (c[1] - a[1]) - (cx - ax) * (b[1] - a[1]);
    if (Math.abs(d) < 1e-9) continue;
    const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx))), maxX = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
    const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), maxY = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((bx - px) * (c[1] - py) - (cx - px) * (b[1] - py)) / d, w1 = ((cx - px) * (a[1] - py) - (ax - px) * (c[1] - py)) / d, w2 = 1 - w0 - w1;
      if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
      const z = w0 * a[2] + w1 * b[2] + w2 * c[2], i = y * W + x;
      if (z <= depth[i]) continue;
      depth[i] = z; mask[i] = 1;
      let col = t.mat.f.slice(0, 3);
      if (t.uv && t.mat.img) {
        const u = w0 * t.uv[0] + w1 * t.uv[2] + w2 * t.uv[4], vv = w0 * t.uv[1] + w1 * t.uv[3] + w2 * t.uv[5];
        const im = t.mat.img, tx = Math.min(im.w - 1, Math.max(0, Math.floor((u - Math.floor(u)) * im.w))), ty = Math.min(im.h - 1, Math.max(0, Math.floor((vv - Math.floor(vv)) * im.h)));
        const k = (ty * im.w + tx) * 4;
        // texture is sRGB, factor is linear
        col = col.map((f: number, j: number) => f * srgbToLin(im.d[k + j] / 255));
      }
      const nx = w0 * t.n[0] + w1 * t.n[3] + w2 * t.n[6], ny = w0 * t.n[1] + w1 * t.n[4] + w2 * t.n[7], nz = w0 * t.n[2] + w1 * t.n[5] + w2 * t.n[8];
      const nl = Math.hypot(nx, ny, nz) || 1;
      const lam = Math.max(0, (nx * L[0] + ny * L[1] + nz * L[2]) / (nl * ll));
      // soft, like the painted art's own light (and a painted-from-art texture already carries its shading)
      const shade = 0.78 + 0.32 * lam;
      matId[i] = t.mat.img ? -2 : t.mat.index; shadeOf[i] = shade;
      for (let k = 0; k < 3; k++) rgb[i * 3 + k] = linToSrgb(col[k] * shade) * 255;
    }
  }
  return { W, H, rgb, mask, matId, shadeOf, depth };
}
function srgbToLin(c: number) { return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }
function linToSrgb(c: number) { c = Math.max(0, Math.min(1, c)); return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055; }
function lab(r: number, g: number, b: number) {
  const R = srgbToLin(r / 255), G = srgbToLin(g / 255), B = srgbToLin(b / 255);
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047, Y = 0.2126 * R + 0.7152 * G + 0.0722 * B, Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

// ---- scoring --------------------------------------------------------------------------------------------------------
const REGIONS: [string, number, number][] = [['head', chinModel - 0.04, 2.2], ['torso', 0.95, chinModel - 0.04], ['legs', -0.1, 0.95]];
function shiftBest(mask: Uint8Array, W: number, x0: number) {
  // the horizontal shift (±25 px) that overlays the model on the art best: both are centred on their own figures
  let best = 0, bestI = -1;
  for (let s = -25; s <= 25; s++) {
    let inter = 0;
    for (let y = 300; y < SHh; y += 3) for (let x = 0; x < W; x++) if (mask[y * W + x] && artMask[y * SW + x0 + x + s]) inter++;
    if (inter > bestI) { bestI = inter; best = s; }
  }
  return best;
}
function chamfer(src: Uint8Array, W: number, H: number) { // distance (px) to the nearest edge pixel of src
  const D = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const x = i % W, y = (i / W) | 0, m = src[i];
    const edge = m && (x === 0 || y === 0 || x === W - 1 || y === H - 1 || !src[i - 1] || !src[i + 1] || !src[i - W] || !src[i + W]);
    D[i] = edge ? 0 : 1e9;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (x) D[i] = Math.min(D[i], D[i - 1] + 1); if (y) D[i] = Math.min(D[i], D[i - W] + 1); if (x && y) D[i] = Math.min(D[i], D[i - W - 1] + 1.414); if (y && x < W - 1) D[i] = Math.min(D[i], D[i - W + 1] + 1.414); }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; if (x < W - 1) D[i] = Math.min(D[i], D[i + 1] + 1); if (y < H - 1) D[i] = Math.min(D[i], D[i + W] + 1); if (x < W - 1 && y < H - 1) D[i] = Math.min(D[i], D[i + W + 1] + 1.414); if (y < H - 1 && x) D[i] = Math.min(D[i], D[i + W - 1] + 1.414); }
  return D;
}
interface RegionScore { iou: number; outlineMm: number; deltaE: number; shape: number; colour: number }
function score(r: ReturnType<typeof render>, v: ViewName, save: boolean) {
  const { x0 } = VIEWS[v];
  const s = shiftBest(r.mask, r.W, x0);
  const W = r.W, H = r.H;
  const A = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const ax = x0 + x + s; A[y * W + x] = ax >= 0 && ax < SW ? artMask[y * SW + ax] : 0; }
  const dA = chamfer(A, W, H), dM = chamfer(r.mask, W, H);
  const out: Record<string, RegionScore> = {};
  const B = 8;
  for (const [name, yLo, yHi] of REGIONS) {
    const r0 = Math.max(0, Math.floor(SH.sole - yHi * ppm)), r1 = Math.min(H, Math.ceil(SH.sole - yLo * ppm));
    let inter = 0, uni = 0, dsum = 0, dn = 0;
    for (let y = r0; y < r1; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, a = A[i], m = r.mask[i];
      if (a && m) inter++; if (a || m) uni++;
      const edgeM = m && (!r.mask[i - 1] || !r.mask[i + 1] || !r.mask[i - W] || !r.mask[i + W]);
      const edgeA = a && (!A[i - 1] || !A[i + 1] || !A[i - W] || !A[i + W]);
      if (edgeM) { dsum += Math.min(60, dA[i]); dn++; }
      if (edgeA) { dsum += Math.min(60, dM[i]); dn++; }
    }
    // colour: blocks where both have the figure
    let de = 0, dc = 0;
    for (let by = r0; by + B <= r1; by += B) for (let bx = 0; bx + B <= W; bx += B) {
      const ma = [0, 0, 0], mm = [0, 0, 0]; let n = 0;
      for (let y = by; y < by + B; y++) for (let x = bx; x < bx + B; x++) {
        const i = y * W + x; if (!A[i] || !r.mask[i]) continue;
        const ai = (y * SW + x0 + x + s) * 4;
        for (let k = 0; k < 3; k++) { ma[k] += S[ai + k]; mm[k] += r.rgb[i * 3 + k]; } n++;
      }
      if (n < B * B * 0.8) continue;
      const la = lab(ma[0] / n, ma[1] / n, ma[2] / n), lm = lab(mm[0] / n, mm[1] / n, mm[2] / n);
      de += Math.hypot(la[0] - lm[0], la[1] - lm[1], la[2] - lm[2]); dc++;
    }
    const iou = uni ? inter / uni : 1, outlineMm = dn ? (dsum / dn / ppm) * 1000 : 0, deltaE = dc ? de / dc : 0;
    // shape: IoU, held back by outline error (5 mm costs about 2%); colour: ΔE 3 is a perfect match, ΔE 30 is none
    const shape = Math.max(0, iou - Math.max(0, outlineMm - 2) * 0.004);
    const colour = Math.max(0, Math.min(1, 1 - (deltaE - 3) / 27));
    out[name] = { iou: +iou.toFixed(3), outlineMm: +outlineMm.toFixed(1), deltaE: +deltaE.toFixed(1), shape: +shape.toFixed(3), colour: +colour.toFixed(3) };
  }
  if (save) {
    const png = new PNG({ width: W * 3, height: H });
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, ai = (y * SW + x0 + x + s) * 4;
      const art = [S[ai], S[ai + 1], S[ai + 2]];
      const mod = r.mask[i] ? [r.rgb[i * 3], r.rgb[i * 3 + 1], r.rgb[i * 3 + 2]] : bg;
      const a = A[i], m = r.mask[i];
      const ov = a && m ? [art[0] * 0.5 + mod[0] * 0.5, art[1] * 0.5 + mod[1] * 0.5, art[2] * 0.5 + mod[2] * 0.5] : a ? [230, 60, 50] : m ? [50, 110, 240] : [245, 245, 245];
      for (const [k, c] of [[0, art], [1, mod], [2, ov]] as const) png.data.set([...c.map((q) => Math.max(0, Math.min(255, Math.round(q)))), 255], ((y * W * 3) + k * W + x) * 4);
    }
    fs.writeFileSync(path.join(outDir, `fidelity_${v}.png`), PNG.sync.write(png));
  }
  return { shift: s, regions: out, A, mask: r.mask, W, H };
}

/**
 * The head's outline against the art's, row by row (metres): on each row, the run of figure pixels through the head's
 * middle column, so a shoulder guard or a ponytail apart from the head never counts. Side: how far the front and the
 * back must move forward. Front: how much wider each half must be, and how much higher the crown.
 */
function headProfile(side: ReturnType<typeof score>, front: ReturnType<typeof score>, headZ: number, sideSkull: Uint8Array) {
  const rowOf = (y: number) => Math.round(SH.sole - y * ppm);
  const run = (m: Uint8Array, W: number, row: number, c: number): [number, number] | null => {
    if (!m[row * W + c]) { // the middle column may miss (between hair strands): look a little either side
      let k = 1; while (k < 12 && !m[row * W + c + k] && !m[row * W + c - k]) k++;
      if (k >= 12) return null; c = m[row * W + c + k] ? c + k : c - k;
    }
    let a = c, b = c; while (a > 0 && m[row * W + a - 1]) a--; while (b < W - 1 && m[row * W + b + 1]) b++;
    return [a, b];
  };
  const rows: { y: number; front: number; back: number; half: number }[] = [];
  const cSide = Math.round(VIEWS.side.cx - headZ * ppm - VIEWS.side.x0), cFront = Math.round(VIEWS.front.cx - VIEWS.front.x0);
  for (let y = 1.4; y <= 1.9001; y += 0.01) {
    const row = rowOf(y);
    let fr = 0, bk = 0, hf = 0;
    if (y >= 1.5) {
      const ra = run(side.A, side.W, row, cSide), rm = run(side.mask, side.W, row, cSide), rs = run(sideSkull, side.W, row, cSide);
      if (ra && rm) fr = (rm[0] - ra[0]) / ppm;
      // the back: the model's skull without its ponytail against the art's; a row where the art's ponytail joins the
      // head (its edge far past the skull) says nothing about the skull and is left alone
      if (ra && rs && y >= 1.62) { const d = (rs[1] - ra[1]) / ppm; if (d > -0.035) bk = d; }
      const fa = run(front.A, front.W, row, cFront), fm = run(front.mask, front.W, row, cFront);
      // (from the jaw up: lower, the art's collar and shoulder straps join the neck's row)
      if (fa && fm && y >= 1.56) hf = ((fa[1] - fa[0]) - (fm[1] - fm[0])) / 2 / ppm;
    }
    rows.push({ y: +y.toFixed(3), front: fr, back: bk, half: hf });
  }
  // the crown: the top of the figure just beside the bun (±4.5 cm), art against model
  const topAt = (m: Uint8Array, W: number, c: number) => { for (let r = 0; r < SH.sole; r++) if (m[r * W + c]) return r; return SH.sole; };
  const off = Math.round(0.045 * ppm);
  const top = ((topAt(front.mask, front.W, cFront - off) + topAt(front.mask, front.W, cFront + off)) - (topAt(front.A, front.W, cFront - off) + topAt(front.A, front.W, cFront + off))) / 2 / ppm;
  // a 5-row median against stray strands, then clamped: no row moves more than 2 cm a pass
  const med = (k: 'front' | 'back' | 'half') => rows.map((_, i) => { const a = rows.slice(Math.max(0, i - 2), i + 3).map((r) => r[k]).sort((p, q) => p - q); return a[a.length >> 1]; });
  const F = med('front'), B = med('back'), Hh = med('half');
  const cl = (v: number) => Math.max(-0.02, Math.min(0.02, v));
  return { rows: rows.map((r, i) => ({ y: r.y, front: cl(F[i]), back: cl(B[i]), half: cl(Hh[i]) })), top: cl(top) };
}

// ---- the art's pose, fitted ---------------------------------------------------------------------------------------
// arms hang from the A (rotate about the body's forward axis), elbows bend a little, legs stand apart
function poseOf(p: { arm: number; armFwd: number; elbow: number; leg: number }) {
  const o: Record<string, number[]> = {};
  for (const sx of [1, -1]) {
    const s = sx > 0 ? 'Left' : 'Right';
    o[`${s}Arm`] = qmul(qaxis([1, 0, 0], -p.armFwd), qaxis([0, 0, 1], -sx * p.arm));
    o[`${s}ForeArm`] = qaxis([1, 0, 0], -p.elbow);
    o[`${s}UpLeg`] = qaxis([0, 0, 1], sx * p.leg);
    o[`${s}Foot`] = qaxis([0, 0, 1], -sx * p.leg);
  }
  return o;
}
function fitPose() {
  let p = { arm: 0.66, armFwd: 0.0, elbow: 0.15, leg: 0.06 };
  const iouOf = (q: typeof p) => {
    const tris = posedTris(poseOf(q));
    let s = 0;
    for (const v of ['front', 'side'] as ViewName[]) { const r = render(tris, v); const sc = score(r, v, false); s += sc.regions.torso.iou + sc.regions.legs.iou; }
    return s;
  };
  let best = iouOf(p);
  const steps: [keyof typeof p, number][] = [['arm', 0.08], ['leg', 0.03], ['armFwd', 0.1], ['elbow', 0.12]];
  for (let round = 0; round < 2; round++) for (const [k, d] of steps) for (const dir of [1, -1]) {
    for (let tries = 0; tries < 3; tries++) {
      const q = { ...p, [k]: p[k] + dir * d / (round + 1) };
      const s = iouOf(q);
      if (s > best) { best = s; p = q; } else break;
    }
  }
  return p;
}

/**
 * Each untextured material's base colour as the art paints it: wherever the material shows in a view and the art has
 * the figure at the same pixel, the art's colour divided by this render's shading, the median over every view.
 */
function calibrate(tris: Tri[]) {
  const samples = new Map<number, number[][]>();
  for (const v of ['front', 'side', 'back'] as ViewName[]) {
    const r = render(tris, v), { x0 } = VIEWS[v], s = shiftBest(r.mask, r.W, x0);
    for (let y = 0; y < r.H; y += 2) for (let x = 0; x < r.W; x += 2) {
      const i = y * r.W + x, m = r.matId[i];
      if (m < 0) continue;
      // inside both figures, away from either outline (a pixel off the edge is the other part or the background)
      let inside = true;
      for (const [ox, oy] of [[-3, 0], [3, 0], [0, -3], [0, 3]]) { const j = (y + oy) * r.W + x + ox; const ax = x0 + x + ox + s; if (!r.mask[j] || r.matId[j] !== m || !artMask[(y + oy) * SW + ax]) inside = false; }
      if (!inside) continue;
      const ai = (y * SW + x0 + x + s) * 4;
      const lin = [0, 1, 2].map((k) => srgbToLin(S[ai + k] / 255) / r.shadeOf[i]);
      if (!samples.has(m)) samples.set(m, []);
      samples.get(m)!.push(lin);
    }
  }
  const out: Record<string, { color: number[]; samples: number }> = {};
  for (const [m, list] of samples) {
    if (list.length < 150) continue;
    const med = [0, 1, 2].map((k) => { const a = list.map((c) => c[k]).sort((p, q) => p - q); return +a[a.length >> 1].toFixed(4); });
    out[gltf.materials[m].name] = { color: med, samples: list.length };
  }
  return out;
}

const t0 = Date.now();
const pose = fitPose();
if (args.includes('--paint')) {
  const { paintFromSheet } = await import('./forgePaint');
  const posedT = posedTris(poseOf(pose));
  const views = (['front', 'side', 'back'] as ViewName[]).map((v) => { const r = render(posedT, v); return { name: v, r, shift: shiftBest(r.mask, r.W, VIEWS[v].x0), ...VIEWS[v] }; });
  const out = args[args.indexOf('--paint') + 1] ?? file;
  await paintFromSheet({ gltf, bin, acc, file, out, posedVerts, views, sheet: { W: SW, H: SHh, data: S, mask: artMask }, work: outDir });
  console.log(`painted from the turnaround -> ${out}`);
  process.exit(0);
}
const tris = posedTris(poseOf(pose));
if (args.includes('--calibrate')) {
  const cal = calibrate(tris);
  fs.writeFileSync(path.join(outDir, 'materials.json'), JSON.stringify(cal, null, 2));
  console.log('materials from the art:', Object.entries(cal).map(([k, v]) => `${k} ${v.color.map((c) => c.toFixed(3)).join(',')} (${v.samples})`).join('; '));
}
const report: Record<string, ReturnType<typeof score>> = {};
for (const v of ['front', 'side', 'back'] as ViewName[]) report[v] = score(render(tris, v), v, true);
{
  const headZ = (() => { const W0 = worlds({}); const h = byName.get('Head'); return h === undefined ? 0.02 : W0[h][14]; })();
  const skullOnly = render(tris.filter((t) => !t.tail), 'side');
  const sh = report.side.shift;
  const skull = new Uint8Array(skullOnly.W * skullOnly.H); // in the same frame as report.side (the shift is the art's)
  skull.set(skullOnly.mask); void sh;
  const prof = headProfile(report.side, report.front, headZ, skull);
  fs.writeFileSync(path.join(outDir, 'profile.json'), JSON.stringify(prof, null, 2));
  if (args.includes('--update-warp')) {
    // damped: each pass takes 80% of what it measured, so the loop settles instead of ringing
    const old: HeadWarp = loadHeadWarp() ?? { step: 0.01, rows: prof.rows.map((r) => ({ y: r.y, front: 0, back: 0, half: 0 })), top: 0, passes: 0 };
    const next: HeadWarp = {
      step: 0.01, passes: old.passes + 1, top: +(old.top + 0.8 * prof.top).toFixed(4),
      rows: old.rows.map((r, i) => ({ y: r.y, front: +(r.front + 0.8 * prof.rows[i].front).toFixed(4), back: +(r.back + 0.8 * prof.rows[i].back).toFixed(4), half: +(r.half + 0.8 * prof.rows[i].half).toFixed(4) })),
    };
    fs.writeFileSync(HEAD_WARP_FILE, JSON.stringify(next, null, 2));
    console.log(`head warp pass ${next.passes}: crown ${(prof.top * 1000).toFixed(0)} mm, front ${(Math.max(...prof.rows.map((r) => Math.abs(r.front))) * 1000).toFixed(0)} mm, back ${(Math.max(...prof.rows.map((r) => Math.abs(r.back))) * 1000).toFixed(0)} mm, half ${(Math.max(...prof.rows.map((r) => Math.abs(r.half))) * 1000).toFixed(0)} mm (largest)`);
  }
}
// overall: shape and colour averaged, the head counting double (it is what people look at)
const WEIGHT: Record<string, number> = { head: 2, torso: 1, legs: 1 };
let sum = 0, wsum = 0;
const axes: Record<string, { shape: number; colour: number }> = {};
for (const [v, r] of Object.entries(report)) {
  let vs = 0, vc = 0, vw = 0;
  for (const [name, s] of Object.entries(r.regions)) { vs += s.shape * WEIGHT[name]; vc += s.colour * WEIGHT[name]; vw += WEIGHT[name]; }
  axes[v] = { shape: +(vs / vw).toFixed(3), colour: +(vc / vw).toFixed(3) };
  sum += vs + vc; wsum += 2 * vw;
}
const overall = +(sum / wsum).toFixed(3);
const result = { file, pose: Object.fromEntries(Object.entries(pose).map(([k, v]) => [k, +v.toFixed(3)])), overall, axes, views: report, ms: Date.now() - t0 };
fs.writeFileSync(path.join(outDir, 'fidelity.json'), JSON.stringify(result, null, 2));
if (args.includes('--json')) console.log(JSON.stringify(result));
else {
  console.log(`fidelity ${(overall * 100).toFixed(1)}%  (pose ${JSON.stringify(result.pose)}, ${result.ms} ms)`);
  for (const [v, r] of Object.entries(report)) {
    console.log(`  ${v.padEnd(5)} shape ${(axes[v].shape * 100).toFixed(1)}%  colour ${(axes[v].colour * 100).toFixed(1)}%`);
    for (const [name, s] of Object.entries(r.regions)) console.log(`    ${name.padEnd(5)} IoU ${s.iou}  outline ${s.outlineMm} mm  ΔE ${s.deltaE}`);
  }
  console.log(`  images: ${outDir}`);
}
