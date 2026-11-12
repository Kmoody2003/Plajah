/**
 * forgeLook.ts — Haru v3's look: the PBR material library (docs/character-forge.md §4) with colours read from his art
 * (public/games/era-clash/assets/sprite-samurai.png), procedural micro-detail (silk weave, lacquer, hammered iron),
 * and his face painted from the art with engines/tela-3d/paint_from_views.py.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import type { GMaterial } from '../../services/argilla/creature/gltfWriter';
import type { ForgeCharacter } from '../../services/argilla/creature/exportCreature';

export const ART = 'public/games/era-clash/assets/sprite-samurai.png';
const NAMES = ['skin', 'lacquer', 'lacquerBlack', 'gold', 'iron', 'leather', 'silk', 'silkRed', 'hakama', 'kosode', 'koteCloth', 'kyahan', 'obi', 'tabi', 'hair', 'katana_steel', 'hairCards'] as const;
export const MATERIAL_INDEX = Object.fromEntries(NAMES.map((n, i) => [n, i])) as Record<string, number>;

type RGB = [number, number, number];
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** Median colour of the art's pixels inside a box that pass a test (sRGB 0..1 in, linear out). */
function sample(png: PNG, box: [number, number, number, number], test: (r: number, g: number, b: number) => boolean, fallback: RGB): RGB {
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  for (let y = box[1]; y < box[3]; y++) for (let x = box[0]; x < box[2]; x++) {
    const i = (y * png.width + x) * 4;
    if (png.data[i + 3] < 200) continue;
    const r = png.data[i] / 255, g = png.data[i + 1] / 255, b = png.data[i + 2] / 255;
    if (!test(r, g, b)) continue;
    rs.push(r); gs.push(g); bs.push(b);
  }
  if (rs.length < 20) return fallback.map(toLinear) as RGB;
  const med = (a: number[]) => a.sort((p, q) => p - q)[Math.floor(a.length / 2)];
  return [toLinear(med(rs)), toLinear(med(gs)), toLinear(med(bs))];
}

let palette: Record<string, RGB> | null = null;
export function artPalette(): Record<string, RGB> {
  if (palette) return palette;
  const png = PNG.sync.read(fs.readFileSync(ART));
  const red = (r: number, g: number, b: number) => r > 0.35 && r > g * 1.7 && r > b * 1.5;
  const blue = (r: number, g: number, b: number) => b > r * 1.15 && b > g * 1.05 && b > 0.12;
  const gold = (r: number, g: number, b: number) => r > 0.5 && g > 0.38 && b < g * 0.75;
  const skinT = (r: number, g: number, b: number) => r > 0.45 && g > 0.3 && b > 0.2 && r > g && g > b && r - b > 0.12;
  palette = {
    lacquer: sample(png, [170, 170, 270, 300], red, [0.55, 0.13, 0.1]),        // the dō's rows
    silk: sample(png, [170, 170, 270, 300], blue, [0.12, 0.16, 0.32]),         // the kon-ito lacing between them
    gold: sample(png, [60, 330, 330, 470], gold, [0.7, 0.55, 0.3]),            // rims on the kusazuri
    hakama: sample(png, [80, 440, 300, 560], blue, [0.12, 0.13, 0.26]),        // the ballooning trousers
    kosode: sample(png, [60, 180, 120, 280], blue, [0.12, 0.13, 0.28]),        // the sleeves
    obi: sample(png, [120, 300, 280, 350], blue, [0.18, 0.28, 0.5]),           // the sash
    skin: sample(png, [180, 40, 290, 150], skinT, [0.78, 0.56, 0.42]),         // the face
  };
  return palette;
}

/** The art's face is lit warm; pull its hue toward a neutral skin so the game's own light does the warming. */
function skinTone(rgb: RGB): [number, number, number, number] {
  const neutral: RGB = [0.52, 0.32, 0.22];
  return [rgb[0] * 0.45 + neutral[0] * 0.55, rgb[1] * 0.45 + neutral[1] * 0.55, rgb[2] * 0.45 + neutral[2] * 0.55, 1];
}

export function haruMaterials(): GMaterial[] {
  const p = artPalette();
  const c = (rgb: RGB, k = 1): [number, number, number, number] => [rgb[0] * k, rgb[1] * k, rgb[2] * k, 1];
  const byName: Record<(typeof NAMES)[number], GMaterial> = {
    skin: { name: 'skin', color: skinTone(p.skin), metallic: 0, roughness: 0.52, sheen: { color: [0.55, 0.22, 0.16], roughness: 0.55 }, specular: { factor: 0.5 } },
    // urushi lacquer: a hard clear-coat over a deep vermilion base
    lacquer: { name: 'lacquer', color: c(p.lacquer), metallic: 0, roughness: 0.42, clearcoat: { factor: 1, roughness: 0.12 } },
    lacquerBlack: { name: 'lacquerBlack', color: [0.018, 0.016, 0.016, 1], metallic: 0, roughness: 0.35, clearcoat: { factor: 1, roughness: 0.08 } },
    gold: { name: 'gold', color: c(p.gold, 1.1), metallic: 1, roughness: 0.32 },
    iron: { name: 'iron', color: [0.09, 0.085, 0.085, 1], metallic: 0.85, roughness: 0.46, clearcoat: { factor: 0.5, roughness: 0.3 } },
    leather: { name: 'leather', color: [0.12, 0.06, 0.035, 1], metallic: 0, roughness: 0.6, clearcoat: { factor: 0.25, roughness: 0.4 } },
    // silk: a strong, tight sheen along the cord
    silk: { name: 'silk', color: c(p.silk, 0.9), metallic: 0, roughness: 0.55, sheen: { color: [0.45, 0.55, 0.85], roughness: 0.3 } },
    silkRed: { name: 'silkRed', color: [0.42, 0.05, 0.04, 1], metallic: 0, roughness: 0.55, sheen: { color: [0.9, 0.35, 0.3], roughness: 0.3 } },
    // woven cotton and hemp: soft, broad sheen
    hakama: { name: 'hakama', color: c(p.hakama), metallic: 0, roughness: 0.9, sheen: { color: [0.3, 0.32, 0.5], roughness: 0.7 } },
    kosode: { name: 'kosode', color: c(p.kosode, 0.9), metallic: 0, roughness: 0.85, sheen: { color: [0.3, 0.32, 0.55], roughness: 0.6 } },
    koteCloth: { name: 'koteCloth', color: c(p.kosode, 0.75), metallic: 0, roughness: 0.75, sheen: { color: [0.35, 0.4, 0.7], roughness: 0.45 } },
    kyahan: { name: 'kyahan', color: c(p.hakama, 0.8), metallic: 0, roughness: 0.9, sheen: { color: [0.3, 0.3, 0.45], roughness: 0.7 } },
    obi: { name: 'obi', color: c(p.obi), metallic: 0, roughness: 0.7, sheen: { color: [0.45, 0.55, 0.9], roughness: 0.4 } },
    tabi: { name: 'tabi', color: [0.05, 0.05, 0.08, 1], metallic: 0, roughness: 0.85, sheen: { color: [0.2, 0.2, 0.3], roughness: 0.6 } },
    hair: { name: 'hair', color: [0.012, 0.01, 0.01, 1], metallic: 0, roughness: 0.45, sheen: { color: [0.25, 0.22, 0.2], roughness: 0.25 } },
    katana_steel: { name: 'katana_steel', color: [0.78, 0.8, 0.84, 1], metallic: 1, roughness: 0.14 },
    // strand cards: alpha-tested, both sides, the highlight stretched across the strands
    hairCards: { name: 'hairCards', color: [0.016, 0.013, 0.012, 1], metallic: 0, roughness: 0.42, alphaMode: 'MASK', alphaCutoff: 0.35, anisotropy: { strength: 0.75, rotation: Math.PI / 2 }, specular: { factor: 0.45 } },
  };
  for (const m of Object.values(byName)) if (m.sheen && m.name !== 'skin') {
    const k = m.name.startsWith('silk') ? 2.6 : 1.9;
    m.sheen = { color: [Math.min(1, m.color[0] * k + 0.015), Math.min(1, m.color[1] * k + 0.015), Math.min(1, m.color[2] * k + 0.02)], roughness: m.sheen.roughness };
  }
  return NAMES.map((n) => ({ ...byName[n], doubleSided: n === 'gold' || n === 'katana_steel' || n === 'obi' || n === 'hairCards' }));
}

// ---- Procedural detail maps ----------------------------------------------------------------------------------

function pngBytes(size: number, f: (x: number, y: number) => [number, number, number]): Uint8Array {
  const png = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const [r, g, b] = f(x, y);
    const i = (y * size + x) * 4;
    png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = 255;
  }
  return new Uint8Array(PNG.sync.write(png));
}
/** Normal map from a height function (tileable). */
function normalMap(size: number, h: (x: number, y: number) => number, strength: number) {
  return pngBytes(size, (x, y) => {
    const dx = (h((x + 1) % size, y) - h((x - 1 + size) % size, y)) * strength;
    const dy = (h(x, (y + 1) % size) - h(x, (y - 1 + size) % size)) * strength;
    const l = Math.hypot(dx, dy, 1);
    return [Math.round((-dx / l * 0.5 + 0.5) * 255), Math.round((-dy / l * 0.5 + 0.5) * 255), Math.round((1 / l * 0.5 + 0.5) * 255)];
  });
}
const hash = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };

/** Paint and detail Haru: weave on cloth and cords, orange-peel on lacquer, hammer marks on iron; the face from the art. */
export function rgbaPng(px: Uint8Array, size: number): Uint8Array {
  const png = new PNG({ width: size, height: size });
  png.data.set(px);
  return new Uint8Array(PNG.sync.write(png));
}

export async function paintHaru(c: ForgeCharacter, work: string, log: (s: string) => void) {
  const N = 256;
  // plain weave: over-under threads, 16 per tile
  const weave = normalMap(N, (x, y) => {
    const t = 16, u = (x / N) * t, v = (y / N) * t;
    const over = (Math.floor(u) + Math.floor(v)) % 2 === 0;
    const a = Math.sin((u % 1) * Math.PI), b = Math.sin((v % 1) * Math.PI);
    return (over ? a : b) * 0.6 + hash(Math.floor(u), Math.floor(v)) * 0.15;
  }, 2.2);
  // twisted cord: diagonal ridges along the silk lacing
  const cord = normalMap(N, (x, y) => Math.sin(((x + y) / N) * Math.PI * 2 * 6) * 0.5 + 0.5, 1.6);
  // urushi: very faint orange peel
  const peel = normalMap(N, (x, y) => {
    let s = 0; for (let k = 1; k <= 3; k++) s += Math.sin(x * 0.07 * k + hash(k, 1) * 6) * Math.sin(y * 0.09 * k + hash(1, k) * 6) / k;
    return s;
  }, 0.5);
  // hammered iron: overlapping dimples
  const hammer = normalMap(N, (x, y) => {
    let best = 1;
    const cell = 32;
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const gx = cx + dx, gy = cy + dy;
      const px = (gx + hash(gx, gy)) * cell, py = (gy + hash(gy, gx)) * cell;
      best = Math.min(best, Math.hypot(x - px, y - py) / cell);
    }
    return -Math.cos(Math.min(1, best) * Math.PI) * 0.5;
  }, 1.4);
  const images = [weave, cord, peel, hammer];
  const W = 0, CORD = 1, PEEL = 2, HAM = 3;
  const detail: Record<string, [number, number, number]> = {
    hakama: [W, 0.35, 90], kosode: [W, 0.35, 90], koteCloth: [W, 0.45, 110], kyahan: [W, 0.35, 90], obi: [W, 0.35, 70], tabi: [W, 0.3, 110],
    silk: [CORD, 1, 1], silkRed: [CORD, 1, 1], lacquer: [PEEL, 0.4, 4], lacquerBlack: [PEEL, 0.4, 4], iron: [HAM, 0.6, 12], gold: [HAM, 0.2, 20],
  };
  c.images = images;
  c.materials = c.materials.map((m) => {
    const d = detail[m.name];
    return d ? { ...m, normalTexture: d[0], normalScale: d[1], extras: { uvScale: d[2] }, uvScale: d[2] } as GMaterial : m;
  });
  fs.writeFileSync(path.join(work, 'palette.json'), JSON.stringify(artPalette(), null, 2));
  log(`look: palette from the art ${JSON.stringify(Object.fromEntries(Object.entries(artPalette()).map(([k, v]) => [k, v.map((x) => +x.toFixed(3))])))}`);
}

// ---- Paint a part from the art with engines/tela-3d/paint_from_views.py ---------------------------------------

import { execFileSync } from 'node:child_process';
import { writeGlb } from '../../services/argilla/creature/gltfWriter';

const PY = process.env.TELA3D_PY ?? 'D:/Plajah Runtime/tela3d-py/Scripts/python.exe';

/** Crop the art to a box and keep only what a mask allows (the rest goes transparent). */
export function cropArt(box: [number, number, number, number], keep: (x: number, y: number) => boolean, out: string) {
  const src = PNG.sync.read(fs.readFileSync(ART));
  const w = box[2] - box[0], h = box[3] - box[1];
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const si = ((y + box[1]) * src.width + x + box[0]) * 4, di = (y * w + x) * 4;
    for (let k = 0; k < 4; k++) png.data[di + k] = src.data[si + k];
    if (!keep(x + box[0], y + box[1])) png.data[di + 3] = 0;
  }
  fs.writeFileSync(out, PNG.sync.write(png));
  return out;
}

export interface PaintedPart { positions: Float32Array; uvs: Float32Array; indices: Uint32Array; base: Uint8Array; normal: Uint8Array; orm: Uint8Array }

/** Run paint_from_views on one part where it stands (no recentring), and read back its atlas and maps. */
export function paintFromViews(name: string, mesh: { positions: Float32Array; normals: Float32Array; indices: Uint32Array }, views: { dir: string; png: string }[], work: string, res = 1024, minFacing = 0): PaintedPart {
  const inPath = path.join(work, `${name}_in.glb`), outPath = path.join(work, `${name}_painted.glb`);
  fs.writeFileSync(inPath, writeGlb({
    nodes: [{ name, mesh: 0 }], roots: [0], skins: [], images: [],
    meshes: [{ name, primitives: [{ positions: mesh.positions, normals: mesh.normals, indices: mesh.indices, material: 0 }] }],
    materials: [{ name: 'clay', color: [0.8, 0.8, 0.8], metallic: 0, roughness: 1 }],
  }));
  const args = ['engines/tela-3d/paint_from_views.py', '--mesh', inPath, '--out', outPath, '--faces', '400000', '--res', String(res), '--no-recenter', '--min-facing', String(minFacing), ...views.flatMap((v) => ['--view', `${v.dir}=${v.png}`])];
  const log = execFileSync(PY, args, { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  fs.writeFileSync(path.join(work, `${name}_paint.log`), log);
  return readPainted(outPath);
}

function readPainted(file: string): PaintedPart {
  const b = fs.readFileSync(file);
  const jl = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jl).toString('utf8'));
  const binStart = 20 + jl + 8;
  const view = (i: number) => { const v = json.bufferViews[i]; return b.subarray(binStart + (v.byteOffset ?? 0), binStart + (v.byteOffset ?? 0) + v.byteLength); };
  const acc = (i: number) => {
    const a = json.accessors[i];
    const bytes = view(a.bufferView);
    const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type as 'SCALAR'];
    const off = a.byteOffset ?? 0;
    const copy = new Uint8Array(bytes.subarray(off, off + a.count * comps * (a.componentType === 5126 || a.componentType === 5125 ? 4 : 2)));
    if (a.componentType === 5126) return new Float32Array(copy.buffer);
    if (a.componentType === 5125) return new Uint32Array(copy.buffer);
    return Uint32Array.from(new Uint16Array(copy.buffer));
  };
  const prim = json.meshes[0].primitives[0];
  const mat = json.materials[prim.material];
  const img = (texIndex: number) => new Uint8Array(view(json.images[json.textures[texIndex].source].bufferView));
  return {
    positions: acc(prim.attributes.POSITION) as Float32Array,
    uvs: acc(prim.attributes.TEXCOORD_0) as Float32Array,
    indices: acc(prim.indices) as Uint32Array,
    base: img(mat.pbrMetallicRoughness.baseColorTexture.index),
    normal: img(mat.normalTexture.index),
    orm: img(mat.pbrMetallicRoughness.metallicRoughnessTexture.index),
  };
}

// ---- The face painted from its own landmarks ----------------------------------------------------------------------
// The Forge face IS MediaPipe's canonical face, so every feature's outline is known: paint lands exactly on the
// geometry, at any resolution, with no reference photo. Haru's art gives the palette and the beard (a thin moustache
// and a short chin beard), and the hair under the strand cards.

type V3 = [number, number, number];
const EYE_R_RING = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
const EYE_L_RING = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];
const UPPER_LID_R = [33, 246, 161, 160, 159, 158, 157, 173, 133], UPPER_LID_L = [263, 466, 388, 387, 386, 385, 384, 398, 362];
const LOWER_LID_R = [33, 7, 163, 144, 145, 153, 154, 155, 133], LOWER_LID_L = [263, 249, 390, 373, 374, 380, 381, 382, 362];
const BROW_R = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46], BROW_L = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276];
const LIPS_OUT = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];
const MOUSTACHE = [92, 165, 167, 164, 393, 391, 322, 410, 270, 269, 267, 0, 37, 39, 40, 186];
const CHIN_BEARD = [17, 314, 405, 321, 200, 421, 428, 199, 208, 201, 181, 84];

/** Convex hull of 2D points (counter-clockwise). */
function hull2(p: [number, number][]): [number, number][] {
  const pts = [...p].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: [number, number][] = [], up: [number, number][] = [];
  for (const q of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of pts.reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

export interface FaceAtlas { size: number; png: Uint8Array; uvOf: (p: V3, back: boolean) => [number, number] }

/** Front of the head projected straight on in the top 72% of the atlas; the back of the head unrolled below. */
export function paintFace(landmarks: V3[], headTop: number, napeY: number, centreZ: number, size = 1024): FaceAtlas {
  const X0 = -0.1, X1 = 0.1, Y0 = headTop + 0.01, Y1 = 1.44, FRONT = 0.72;
  const uvOf = (p: V3, back: boolean): [number, number] => back
    ? [(Math.atan2(p[0], -(p[2] - centreZ)) / Math.PI + 1) / 2, FRONT + 0.02 + ((Y0 - p[1]) / (Y0 - Y1)) * (1 - FRONT - 0.04)]
    : [(p[0] - X0) / (X1 - X0), ((Y0 - p[1]) / (Y0 - Y1)) * FRONT];
  const N = size;
  const rgb = new Float32Array(N * N * 3);
  const px = (u: number, v: number): [number, number] => [u * N, v * N];
  const L = (i: number) => px(...uvOf(landmarks[i], false));
  const ring = (ids: number[]) => ids.map(L);
  const set = (x: number, y: number, c: number[], a: number) => {
    if (x < 0 || y < 0 || x >= N || y >= N || a <= 0) return;
    const i = (y * N + x) * 3;
    for (let k = 0; k < 3; k++) rgb[i + k] += (c[k] - rgb[i + k]) * Math.min(1, a);
  };
  const inPoly = (poly: [number, number][], x: number, y: number) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  const segDist = (x: number, y: number, a: [number, number], b: [number, number]) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2));
    return Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t);
  };
  const edgeDist = (poly: [number, number][], x: number, y: number) => { let d = Infinity; for (let i = 0; i < poly.length; i++) d = Math.min(d, segDist(x, y, poly[i], poly[(i + 1) % poly.length])); return d; };
  const bbox = (poly: [number, number][], pad: number) => [Math.max(0, Math.floor(Math.min(...poly.map((p) => p[0])) - pad)), Math.max(0, Math.floor(Math.min(...poly.map((p) => p[1])) - pad)), Math.min(N - 1, Math.ceil(Math.max(...poly.map((p) => p[0])) + pad)), Math.min(N - 1, Math.ceil(Math.max(...poly.map((p) => p[1])) + pad))];
  /** Fill a polygon with a soft edge `feather` px wide; `tex` varies the alpha per pixel (stubble, brow hairs). */
  const fill = (poly: [number, number][], c: number[], a: number, feather: number, tex?: (x: number, y: number) => number) => {
    const [x0, y0, x1, y1] = bbox(poly, feather);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const inside = inPoly(poly, x + 0.5, y + 0.5);
      const d = edgeDist(poly, x + 0.5, y + 0.5);
      const k = inside ? Math.min(1, 0.5 + d / feather / 2) : Math.max(0, 0.5 - d / feather / 2);
      set(x, y, c, a * k * (tex ? tex(x, y) : 1));
    }
  };
  const stroke = (pts: [number, number][], c: number[], a: number, w0: number, w1 = w0) => {
    const box = bbox(pts, Math.max(w0, w1) + 2);
    for (let y = box[1]; y <= box[3]; y++) for (let x = box[0]; x <= box[2]; x++) {
      let best = Infinity, t = 0;
      for (let i = 0; i < pts.length - 1; i++) { const d = segDist(x + 0.5, y + 0.5, pts[i], pts[i + 1]); if (d < best) { best = d; t = (i + 0.5) / (pts.length - 1); } }
      const w = w0 + (w1 - w0) * Math.sin(t * Math.PI);
      set(x, y, c, a * Math.max(0, Math.min(1, w - best)));
    }
  };
  const hashN = (x: number, y: number) => { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s); };

  // skin: a warm tan with soft mottling
  const skin = [196, 146, 112], hair = [20, 16, 14], brow = [32, 24, 20], lip = [150, 90, 80], sclera = [214, 208, 198], iris = [58, 38, 26];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const n = (hashN(Math.floor(x / 6), Math.floor(y / 6)) - 0.5) * 8 + (hashN(x, y) - 0.5) * 5;
    const i = (y * N + x) * 3; rgb[i] = skin[0] + n; rgb[i + 1] = skin[1] + n * 0.8; rgb[i + 2] = skin[2] + n * 0.7;
  }
  // the back of the head: hair down to the nape, skin below it
  const napeV = uvOf([0, napeY, 0], true)[1] * N;
  for (let y = Math.floor(FRONT * N); y < N; y++) for (let x = 0; x < N; x++) set(x, y, hair, Math.max(0, Math.min(1, (napeV - y) / 10 + 0.5)));
  // the front: a hairline about 4.5 cm above the brows at the centre, curving down to the temples (the canonical face
  // mesh only reaches mid-forehead, so its oval is no guide to where hair starts)
  const browWorld = landmarks[9][1];
  for (let y = 0; y < Math.floor(FRONT * N); y++) for (let x = 0; x < N; x++) {
    const wx = X0 + (x / N) * (X1 - X0), wy = Y0 - (y / (FRONT * N)) * (Y0 - Y1);
    const line = browWorld + 0.045 - 0.05 * Math.min(1, (Math.abs(wx) / 0.075) ** 2);
    set(x, y, hair, Math.max(0, Math.min(1, (wy - line) / 0.004 + 0.5)));
  }
  // warmth on the cheeks and the nose, a shade in the eye sockets
  const glow: [number, number, number[], number][] = [[50, 0.045, [188, 118, 96], 0.22], [280, 0.045, [188, 118, 96], 0.22], [4, 0.018, [190, 120, 100], 0.2], [159, 0.03, [150, 105, 85], 0.25], [386, 0.03, [150, 105, 85], 0.25]];
  for (const [i, r, c, a] of glow) {
    const [cx, cy] = L(i); const R = r * N;
    for (let y = Math.floor(cy - R); y <= cy + R; y++) for (let x = Math.floor(cx - R); x <= cx + R; x++) set(x, y, c, a * Math.max(0, 1 - Math.hypot(x - cx, y - cy) / R));
  }
  // beard: a thin moustache and a short chin beard, as in the art (stubble texture)
  const stubble = (x: number, y: number) => (hashN(x * 1.7, y * 2.3) > 0.45 ? 1 : 0.35);
  fill(ring(MOUSTACHE), hair, 0.75, 6, stubble);
  fill(hull2(ring(CHIN_BEARD)), hair, 0.7, 7, stubble);
  // lips, and the line where they meet
  fill(ring(LIPS_OUT), lip, 0.75, 4);
  stroke([L(78), L(81), L(13), L(311), L(308)], [70, 40, 36], 0.9, 1.6, 2.4);
  stroke([L(78), L(178), L(14), L(402), L(308)], [70, 40, 36], 0.6, 1.2, 1.6);
  // brows: dense hair strokes inside each brow's outline
  for (const b of [BROW_R, BROW_L]) fill(ring(b), brow, 0.95, 4, (x, y) => (hashN(x * 3.1, y * 0.9) > 0.3 ? 1 : 0.55));
  // eyes: sclera, iris and pupil where the eyeball shows, then the lids' lash lines
  const eyes: [number[], number[], number[]][] = [[EYE_R_RING, UPPER_LID_R, LOWER_LID_R], [EYE_L_RING, UPPER_LID_L, LOWER_LID_L]];
  for (const [ringIds, up, low] of eyes) {
    const eye = ring(ringIds);
    fill(eye, sclera, 1, 3);
    const c = eye.reduce((s, p) => [s[0] + p[0] / eye.length, s[1] + p[1] / eye.length], [0, 0]);
    const ir = (0.0055 / (X1 - X0)) * N;
    for (let y = Math.floor(c[1] - ir - 2); y <= c[1] + ir + 2; y++) for (let x = Math.floor(c[0] - ir - 2); x <= c[0] + ir + 2; x++) {
      if (!inPoly(eye, x + 0.5, y + 0.5)) continue; // the lids cover what's outside the opening
      const d = Math.hypot(x - c[0], y - c[1]);
      set(x, y, iris, Math.max(0, Math.min(1, ir - d + 0.5)));
      set(x, y, [8, 6, 6], Math.max(0, Math.min(1, ir * 0.42 - d + 0.5)));
      if (Math.hypot(x - c[0] + ir * 0.35, y - c[1] + ir * 0.35) < ir * 0.18) set(x, y, [240, 236, 230], 0.8);
    }
    stroke(up.map(L), [16, 12, 10], 1, 2.0, 3.6);
    stroke(low.map(L), [60, 42, 34], 0.6, 1.0, 1.4);
  }
  const png = new PNG({ width: N, height: N });
  for (let i = 0; i < N * N; i++) { for (let k = 0; k < 3; k++) png.data[i * 4 + k] = Math.max(0, Math.min(255, Math.round(rgb[i * 3 + k]))); png.data[i * 4 + 3] = 255; }
  return { size: N, png: new Uint8Array(PNG.sync.write(png)), uvOf };
}

// ---- The face painted from front art (Muse) ------------------------------------------------------------------------
// MediaPipe finds the same 468 landmarks on the art that the Forge face is built from, so the art maps onto the atlas
// triangle by triangle (engines/tela-3d/face_landmarks.py). Outside the landmark mesh (temples, hairline, ears, neck) a
// least-squares affine carries on, with the mesh's own correction relaxed smoothly out to the frame so there is no
// seam. The art's grey background is left to the procedural paint underneath.

export interface ArtLandmarks { width: number; height: number; image?: string; points: [number, number, number][] }

export function paintFaceFromArt(base: FaceAtlas, landmarks: V3[], artPath: string, art: ArtLandmarks, tris: ArrayLike<number>, front = 0.72): FaceAtlas & { skin: RGB } {
  const N = base.size, H = Math.floor(front * N);
  const out = PNG.sync.read(Buffer.from(base.png));
  const img = PNG.sync.read(fs.readFileSync(art.image ?? artPath));
  const sx = img.width / art.width, sy = img.height / art.height;
  const A = landmarks.slice(0, 468).map((p) => base.uvOf(p, false).map((c) => c * N) as [number, number]);
  const B = art.points.slice(0, 468).map((p) => [p[0] * sx, p[1] * sy] as [number, number]);

  // least-squares affine atlas → art
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], bx = [0, 0, 0], by = [0, 0, 0];
  A.forEach(([x, y], i) => { const r = [x, y, 1]; for (let a = 0; a < 3; a++) { for (let b = 0; b < 3; b++) M[a][b] += r[a] * r[b]; bx[a] += r[a] * B[i][0]; by[a] += r[a] * B[i][1]; } });
  const solve = (m: number[][], v: number[]) => {
    const a = m.map((row, i) => [...row, v[i]]);
    for (let c = 0; c < 3; c++) { let p = c; for (let r = c + 1; r < 3; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r; [a[c], a[p]] = [a[p], a[c]]; for (let r = 0; r < 3; r++) if (r !== c) { const f = a[r][c] / a[c][c]; for (let k = c; k < 4; k++) a[r][k] -= f * a[c][k]; } }
    return [a[0][3] / a[0][0], a[1][3] / a[1][1], a[2][3] / a[2][2]];
  };
  const ax = solve(M, bx), ay = solve(M, by);
  const affine = (x: number, y: number): [number, number] => [ax[0] * x + ax[1] * y + ax[2], ay[0] * x + ay[1] * y + ay[2]];

  // piecewise warp inside the landmark mesh
  const mapX = new Float32Array(N * H).fill(NaN), mapY = new Float32Array(N * H);
  for (let t = 0; t < tris.length; t += 3) {
    const [i, j, k] = [tris[t], tris[t + 1], tris[t + 2]];
    const [a, b, c] = [A[i], A[j], A[k]];
    const det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(det) < 1e-9) continue;
    const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), x1 = Math.min(N - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), y1 = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const l0 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / det;
      const l1 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / det;
      const l2 = 1 - l0 - l1;
      if (l0 < -1e-4 || l1 < -1e-4 || l2 < -1e-4) continue;
      mapX[y * N + x] = l0 * B[i][0] + l1 * B[j][0] + l2 * B[k][0];
      mapY[y * N + x] = l0 * B[i][1] + l1 * B[j][1] + l2 * B[k][1];
    }
  }
  // the mesh's correction to the affine, relaxed out to zero at the frame on a coarse grid
  const G = 8, gw = Math.ceil(N / G), gh = Math.ceil(H / G);
  const dx = new Float32Array(gw * gh), dy = new Float32Array(gw * gh), known = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    const x = Math.min(N - 1, gx * G + G / 2), y = Math.min(H - 1, gy * G + G / 2), i = y * N + x;
    if (Number.isNaN(mapX[i])) continue;
    const [fx, fy] = affine(x + 0.5, y + 0.5);
    dx[gy * gw + gx] = mapX[i] - fx; dy[gy * gw + gx] = mapY[i] - fy; known[gy * gw + gx] = 1;
  }
  // (free at the frame, not pinned to zero there: a correction forced back to nothing over a few cells folds the warp,
  // and a band of hair from above the hairline lands on the forehead)
  for (let it = 0; it < 900; it++) for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    const i = gy * gw + gx;
    if (known[i]) continue;
    let sx = 0, sy = 0, n = 0;
    if (gx > 0) { sx += dx[i - 1]; sy += dy[i - 1]; n++; }
    if (gx < gw - 1) { sx += dx[i + 1]; sy += dy[i + 1]; n++; }
    if (gy > 0) { sx += dx[i - gw]; sy += dy[i - gw]; n++; }
    if (gy < gh - 1) { sx += dx[i + gw]; sy += dy[i + gw]; n++; }
    dx[i] = sx / n; dy[i] = sy / n;
  }
  const field = (arr: Float32Array, x: number, y: number) => {
    const fx = Math.max(0, Math.min(gw - 1.001, x / G - 0.5)), fy = Math.max(0, Math.min(gh - 1.001, y / G - 0.5));
    const ix = Math.floor(fx), iy = Math.floor(fy), u = fx - ix, v = fy - iy;
    return (arr[iy * gw + ix] * (1 - u) + arr[iy * gw + ix + 1] * u) * (1 - v) + (arr[(iy + 1) * gw + ix] * (1 - u) + arr[(iy + 1) * gw + ix + 1] * u) * v;
  };
  const sampleArt = (x: number, y: number): number[] | null => {
    if (x < 0 || y < 0 || x >= img.width - 1 || y >= img.height - 1) return null;
    const ix = Math.floor(x), iy = Math.floor(y), u = x - ix, v = y - iy, c = [0, 0, 0];
    for (const [ox, oy, w] of [[0, 0, (1 - u) * (1 - v)], [1, 0, u * (1 - v)], [0, 1, (1 - u) * v], [1, 1, u * v]]) {
      const i = ((iy + oy) * img.width + ix + ox) * 4;
      for (let k = 0; k < 3; k++) c[k] += img.data[i + k] * w;
    }
    return c;
  };
  const hashN = (x: number, y: number) => { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s); };
  // the background: Muse's flat grey (low saturation, light)
  // (each factor clamped on its own: two negatives multiplied made warm skin read as background)
  const bgOf = (c: number[]) => { const mx = Math.max(...c), mn = Math.min(...c); return Math.max(0, Math.min(1, 1 - (mx - mn) / 22)) * Math.max(0, Math.min(1, (mn - 105) / 20)); };
  // the art's skin tone (from inside the landmark mesh), and the procedural paint shifted to it so nothing seams
  const skinAcc = [0, 0, 0]; let skinN = 0;
  for (let i = 0; i < N * H; i += 7) {
    if (Number.isNaN(mapX[i])) continue;
    const c = sampleArt(mapX[i], mapY[i]);
    if (c && c[0] > c[2] + 25 && c[0] > 110) { for (let k = 0; k < 3; k++) skinAcc[k] += c[k]; skinN++; }
  }
  const artSkin = skinAcc.map((v) => v / Math.max(1, skinN));
  const procSkin = [196, 146, 112];
  // distance (px) from the landmark mesh, for the soft edge below the brows (chamfer, two passes)
  const dist = new Float32Array(N * H);
  for (let i = 0; i < N * H; i++) dist[i] = Number.isNaN(mapX[i]) ? 1e9 : 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    if (x) dist[i] = Math.min(dist[i], dist[i - 1] + 1);
    if (y) dist[i] = Math.min(dist[i], dist[i - N] + 1, x ? dist[i - N - 1] + 1.414 : 1e9, x < N - 1 ? dist[i - N + 1] + 1.414 : 1e9);
  }
  for (let y = H - 1; y >= 0; y--) for (let x = N - 1; x >= 0; x--) {
    const i = y * N + x;
    if (x < N - 1) dist[i] = Math.min(dist[i], dist[i + 1] + 1);
    if (y < H - 1) dist[i] = Math.min(dist[i], dist[i + N] + 1, x < N - 1 ? dist[i + N + 1] + 1.414 : 1e9, x ? dist[i + N - 1] + 1.414 : 1e9);
  }
  const browPx = A[9][1];
  for (let y = 0; y < H; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    for (let k = 0; k < 3; k++) out.data[i * 4 + k] = Math.min(255, Math.round((out.data[i * 4 + k] * artSkin[k]) / procSkin[k]));
    const inside = !Number.isNaN(mapX[i]);
    let p: [number, number];
    if (inside) p = [mapX[i], mapY[i]];
    else { const f = affine(x + 0.5, y + 0.5); p = [f[0] + field(dx, x, y), f[1] + field(dy, x, y)]; }
    const c = sampleArt(p[0], p[1]);
    if (!c) continue;
    // above the brows the art's forehead and hair carry on; below them only a soft rim past the jaw (no ears, no collar)
    const rim = Math.max(Math.max(0, Math.min(1, (browPx + 10 - y) / 36)), Math.max(0, 1 - dist[i] / 40));
    const a = inside ? 1 : rim * (1 - bgOf(c));
    if (a <= 0) continue;
    // fine skin grain the upscaled art doesn't have
    const n = (hashN(x, y) - 0.5) * 6;
    for (let k = 0; k < 3; k++) out.data[i * 4 + k] = Math.max(0, Math.min(255, Math.round(out.data[i * 4 + k] * (1 - a) + (c[k] + n) * a)));
  }
  const skin = artSkin.map((v) => toLinear(v / 255)) as RGB;
  return { size: N, png: new Uint8Array(PNG.sync.write(out)), uvOf: base.uvOf, skin };
}
