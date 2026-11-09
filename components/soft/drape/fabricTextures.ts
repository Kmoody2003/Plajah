// Procedural fabric surfaces (our own): a height field per finish (plain weave, twill, jersey
// knit loops, rib wales, satin floats, pile, fleece, felt) drawn on a tiling canvas and turned into
// a tangent-space normal map, plus the physically based material settings (roughness, sheen,
// fuzz) that make each fabric read correctly under light.

import * as THREE from 'three';
import type { Finish } from '../../../services/soft/drape/fabrics';

const N = 256;
/** Height in [0,1] at tile coordinates u,v in [0,1). */
function height(f: Finish, u: number, v: number, rnd: (i: number) => number): number {
  const TAU = Math.PI * 2;
  switch (f) {
    case 'plain': { const a = Math.sin(TAU * 8 * u) * 0.5 + 0.5, b = Math.sin(TAU * 8 * v) * 0.5 + 0.5; const over = (Math.floor(8 * u) + Math.floor(8 * v)) % 2; return over ? a * 0.7 + 0.3 * b : b * 0.7 + 0.3 * a; }
    case 'twill': { const d = (u * 12 + v * 12) % 1; const ridge = Math.pow(Math.sin(Math.PI * d), 2); return ridge * 0.8 + 0.2 * (Math.sin(TAU * 24 * v) * 0.5 + 0.5); }
    case 'knit': { const cu = (u * 10) % 1, cv = (v * 14) % 1; const x = (cu - 0.5) * 2; const vshape = Math.abs(x) - (cv - 0.5) * 0.9; return Math.max(0, 1 - Math.pow(Math.abs(vshape) * 2.2, 2)) * (0.6 + 0.4 * Math.sin(Math.PI * cu)); }
    case 'rib': { const w = Math.sin(TAU * 10 * u) * 0.5 + 0.5; return Math.pow(w, 0.6) * (0.85 + 0.15 * Math.sin(TAU * 18 * v)); }
    case 'satin': { const d = (u * 5 + v * 40) % 1; return 0.5 + 0.15 * Math.sin(TAU * d); }
    case 'pile': case 'fleece': case 'felt': {
      // Value noise at a few octaves; pile is finer and stronger, felt flat and fibrous.
      const oct = f === 'pile' ? [32, 64] : f === 'fleece' ? [16, 48] : [24, 96]; let h = 0, w = 0;
      for (const o of oct) { const x = u * o, y = v * o, i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j; const s = (a: number, b: number) => rnd(((a % o) + o) % o * 7919 + ((b % o) + o) % o);
        const k = (t: number) => t * t * (3 - 2 * t); const top = s(i, j) + (s(i + 1, j) - s(i, j)) * k(fx), bot = s(i, j + 1) + (s(i + 1, j + 1) - s(i, j + 1)) * k(fx); h += (top + (bot - top) * k(fy)) / o; w += 1 / o; }
      return h / w;
    }
  }
}

const cache = new Map<Finish, THREE.CanvasTexture>();
/** Tangent-space normal map for a finish (cached, repeats). */
export function normalMapFor(f: Finish): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null; const hit = cache.get(f); if (hit) return hit;
  let seed = 1234567; const R = new Float32Array(1 << 20); for (let i = 0; i < R.length; i++) { seed = (seed * 1103515245 + 12345) >>> 0; R[i] = seed / 4294967296; }
  const rnd = (i: number) => R[i & (R.length - 1)]; const H = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) H[j * N + i] = height(f, i / N, j / N, rnd);
  const cv = document.createElement('canvas'); cv.width = cv.height = N; const g = cv.getContext('2d')!; const img = g.createImageData(N, N); const k = f === 'satin' ? 1.2 : f === 'felt' ? 2 : 4;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const hx = H[j * N + (i + 1) % N] - H[j * N + (i - 1 + N) % N], hy = H[((j + 1) % N) * N + i] - H[((j - 1 + N) % N) * N + i];
    let nx = -hx * k, ny = -hy * k, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l; const o = 4 * (j * N + i); img.data[o] = (nx * 0.5 + 0.5) * 255; img.data[o + 1] = (ny * 0.5 + 0.5) * 255; img.data[o + 2] = (nz * 0.5 + 0.5) * 255; img.data[o + 3] = 255; }
  g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.needsUpdate = true; cache.set(f, t); return t;
}

/** Millimetres of fabric one tile of the map covers (texture coordinates are flat pattern mm ÷ this). */
export const TILE_MM: Record<Finish, number> = { plain: 6, twill: 9, knit: 7, rib: 8, satin: 12, pile: 20, fleece: 18, felt: 25 };

/** Physically based settings per finish. */
export function materialFor(f: Finish): THREE.MeshPhysicalMaterial {
  const base = { vertexColors: true, side: THREE.DoubleSide, normalMap: normalMapFor(f), polygonOffset: true, polygonOffsetFactor: -1 } as THREE.MeshPhysicalMaterialParameters;
  const m = new THREE.MeshPhysicalMaterial({ ...base,
    roughness: f === 'satin' ? 0.32 : f === 'twill' ? 0.78 : f === 'felt' ? 0.95 : 0.88,
    normalScale: new THREE.Vector2(...({ plain: [0.5, 0.5], twill: [0.7, 0.7], knit: [0.6, 0.6], rib: [0.8, 0.8], satin: [0.25, 0.25], pile: [0.5, 0.5], fleece: [0.45, 0.45], felt: [0.35, 0.35] } as Record<Finish, [number, number]>)[f]),
    // Sheen: the soft rim glow of pile, brushed fleece and satin; fuzz approximated by sheen + low roughness response.
    sheen: f === 'satin' ? 0.6 : f === 'pile' ? 1 : f === 'fleece' ? 0.8 : f === 'felt' ? 0.4 : f === 'knit' || f === 'rib' ? 0.3 : 0.15,
    sheenRoughness: f === 'satin' ? 0.25 : f === 'pile' ? 0.55 : 0.8,
    sheenColor: new THREE.Color(f === 'satin' ? 0xffffff : 0xdddddd),
    ...(f === 'satin' ? { anisotropy: 0.6, anisotropyRotation: 0, specularIntensity: 0.9 } : { specularIntensity: 0.35 }),
  });
  return m;
}
