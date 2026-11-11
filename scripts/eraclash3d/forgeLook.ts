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
const NAMES = ['skin', 'lacquer', 'lacquerBlack', 'gold', 'iron', 'leather', 'silk', 'silkRed', 'hakama', 'kosode', 'koteCloth', 'kyahan', 'obi', 'tabi', 'hair', 'katana_steel'] as const;
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
  };
  for (const m of Object.values(byName)) if (m.sheen && m.name !== 'skin') {
    const k = m.name.startsWith('silk') ? 2.6 : 1.9;
    m.sheen = { color: [Math.min(1, m.color[0] * k + 0.015), Math.min(1, m.color[1] * k + 0.015), Math.min(1, m.color[2] * k + 0.02)], roughness: m.sheen.roughness };
  }
  return NAMES.map((n) => ({ ...byName[n], doubleSided: n === 'gold' || n === 'katana_steel' || n === 'obi' }));
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
export function paintFromViews(name: string, mesh: { positions: Float32Array; normals: Float32Array; indices: Uint32Array }, views: { dir: string; png: string }[], work: string, res = 1024): PaintedPart {
  const inPath = path.join(work, `${name}_in.glb`), outPath = path.join(work, `${name}_painted.glb`);
  fs.writeFileSync(inPath, writeGlb({
    nodes: [{ name, mesh: 0 }], roots: [0], skins: [], images: [],
    meshes: [{ name, primitives: [{ positions: mesh.positions, normals: mesh.normals, indices: mesh.indices, material: 0 }] }],
    materials: [{ name: 'clay', color: [0.8, 0.8, 0.8], metallic: 0, roughness: 1 }],
  }));
  const args = ['engines/tela-3d/paint_from_views.py', '--mesh', inPath, '--out', outPath, '--faces', '400000', '--res', String(res), '--no-recenter', ...views.flatMap((v) => ['--view', `${v.dir}=${v.png}`])];
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
