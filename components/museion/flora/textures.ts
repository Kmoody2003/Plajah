// ═══════════════════════════════════════════════════════════════════════════
// textures — species materials, drawn at runtime.
//
// Bark and leaves are baked to canvases on first use and cached forever. That
// keeps the wing's asset weight at zero while giving every species the surface
// a botanist would name it by: an oak's deep fissures, a birch's papery white
// with black lenticels, a pine's broken plates, a baobab's smooth grey skin.
//
// Each bark bake emits a matching NORMAL map derived from the same height
// field, so fissures actually catch the canopy light instead of being painted
// shadows that sit flat when the sun moves.
// ═══════════════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { leafOutline, type LeafShape } from './leafShapes';

type Ctx2D = CanvasRenderingContext2D;

const canvasCache = new Map<string, THREE.Texture>();
const normalCache = new Map<string, THREE.Texture>();

function makeCanvas(w: number, h: number): { cv: HTMLCanvasElement; ctx: Ctx2D } | null {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  return { cv, ctx };
}

// ── deterministic noise (same seed → same bark, so a species never re-rolls) ─
function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Value noise over a grid, smoothed — the height field every bark is built on. */
function valueNoise(w: number, h: number, cells: number, seed: number): Float32Array {
  const rand = mulberry(seed);
  const gw = cells + 1;
  const grid = new Float32Array(gw * gw);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();
  const out = new Float32Array(w * h);
  const smooth = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < h; y++) {
    const gy = (y / h) * cells, y0 = Math.floor(gy), fy = smooth(gy - y0);
    for (let x = 0; x < w; x++) {
      const gx = (x / w) * cells, x0 = Math.floor(gx), fx = smooth(gx - x0);
      const i00 = (y0 % cells) * gw + (x0 % cells);
      const i10 = (y0 % cells) * gw + ((x0 + 1) % cells);
      const i01 = ((y0 + 1) % cells) * gw + (x0 % cells);
      const i11 = ((y0 + 1) % cells) * gw + ((x0 + 1) % cells);
      const a = grid[i00] + (grid[i10] - grid[i00]) * fx;
      const b = grid[i01] + (grid[i11] - grid[i01]) * fx;
      out[y * w + x] = a + (b - a) * fy;
    }
  }
  return out;
}

export type BarkKind = 'fissured' | 'papery' | 'plated' | 'ridged' | 'smooth';

/** Which bark a species wears — keyed off the species id the grower already carries. */
export const BARK_KIND: Record<string, BarkKind> = {
  oak: 'fissured', birch: 'papery', pine: 'plated', willow: 'ridged', baobab: 'smooth',
};

/**
 * The bark height field. Vertical structure dominates every real bark — fissures
 * and ridges run with the trunk — so noise is stretched hard in y, then broken
 * differently per kind.
 */
function barkHeight(w: number, h: number, kind: BarkKind, seed: number): Float32Array {
  const coarse = valueNoise(w, h, 8, seed);
  const fine = valueNoise(w, h, 26, seed + 991);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      // stretch: sample coarse noise from a squashed y so features run vertically
      const iy = ((y * 0.22) | 0) % h;
      const stretched = coarse[iy * w + x];
      let v: number;
      switch (kind) {
        case 'fissured': {           // oak — deep, dark, near-vertical clefts
          const ridge = 1 - Math.abs(stretched * 2 - 1);
          v = Math.pow(ridge, 2.1) * 0.85 + fine[i] * 0.15;
          break;
        }
        case 'papery': {             // birch — smooth sheets, horizontal peel lines
          const band = Math.sin(y * 0.09 + stretched * 3.2) * 0.5 + 0.5;
          v = 0.72 + Math.pow(band, 6) * 0.28 - fine[i] * 0.06;
          break;
        }
        case 'plated': {             // pine — broken irregular plates
          const c = valueNoise(1, 1, 1, 1)[0];                  // keep signature stable
          const cell = Math.abs(stretched - 0.5) + Math.abs(fine[i] - 0.5);
          v = cell < 0.16 ? 0.25 : 0.75 - cell * 0.2 + c * 0;
          break;
        }
        case 'ridged': {             // willow — fine close ridges
          const ridge = 1 - Math.abs(((stretched * 5) % 1) * 2 - 1);
          v = 0.45 + ridge * 0.4 + fine[i] * 0.15;
          break;
        }
        case 'smooth':
        default:
          v = 0.62 + stretched * 0.2 + fine[i] * 0.08;          // baobab — soft, swollen
      }
      out[i] = Math.max(0, Math.min(1, v));
    }
  }
  return out;
}

/** Bark colour map, tinted from the species' own bark colour. */
export function barkTexture(species: string, baseColor: string, size = 512): THREE.Texture | null {
  const key = `bark:${species}:${baseColor}:${size}`;
  const hit = canvasCache.get(key);
  if (hit) return hit;
  const made = makeCanvas(size, size);
  if (!made) return null;
  const { cv, ctx } = made;
  const kind = BARK_KIND[species] ?? 'fissured';
  const seed = [...species].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const height = barkHeight(size, size, kind, seed);
  const base = new THREE.Color(baseColor);
  const img = ctx.createImageData(size, size);
  const rand = mulberry(seed + 5);

  for (let i = 0; i < size * size; i++) {
    const hgt = height[i];
    // darken deep into the fissures, lift the ridges
    const shade = 0.42 + hgt * 0.78;
    const jitter = 0.94 + rand() * 0.12;
    const o = i * 4;
    img.data[o] = Math.min(255, base.r * 255 * shade * jitter);
    img.data[o + 1] = Math.min(255, base.g * 255 * shade * jitter);
    img.data[o + 2] = Math.min(255, base.b * 255 * shade * jitter);
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  // Birch earns its lenticels — the black horizontal dashes that name the tree.
  if (kind === 'papery') {
    ctx.fillStyle = 'rgba(24,20,16,0.82)';
    const r2 = mulberry(seed + 77);
    for (let i = 0; i < 90; i++) {
      const x = r2() * size, y = r2() * size;
      const w = 6 + r2() * 34, h = 1.5 + r2() * 3;
      ctx.fillRect(x, y, w, h);
    }
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  canvasCache.set(key, tex);
  return tex;
}

/** Matching normal map, derived from the same height field via Sobel. */
export function barkNormal(species: string, size = 512, strength = 2.4): THREE.Texture | null {
  const key = `barkN:${species}:${size}:${strength}`;
  const hit = normalCache.get(key);
  if (hit) return hit;
  const made = makeCanvas(size, size);
  if (!made) return null;
  const { cv, ctx } = made;
  const kind = BARK_KIND[species] ?? 'fissured';
  const seed = [...species].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const h = barkHeight(size, size, kind, seed);
  const img = ctx.createImageData(size, size);
  const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const nz = 1;
      const len = Math.hypot(dx, dy, nz) || 1;
      const o = (y * size + x) * 4;
      img.data[o] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[o + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      img.data[o + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  normalCache.set(key, tex);
  return tex;
}

/**
 * Leaf sprite: the species outline rasterised with veins and a little colour
 * variance. Transparent outside the blade, so a quad reads as a leaf.
 */
/**
 * Leaf CARD: the technique every real-time tree uses. A single quad carries a
 * whole cluster of leaves rather than one blade, so a canopy reads as thousands
 * of leaves at a few hundred quads. Individual leaf quads is what made the first
 * pass look like bare winter branches — you cannot afford enough of them.
 *
 * The card scatters `count` outlines across the canvas with varied rotation,
 * scale, depth-shading and hue, then leaves the background transparent.
 */
export function leafCardTexture(
  shape: LeafShape,
  color: string,
  size = 512,
  count = 16,
  seed = 1,
): THREE.Texture | null {
  const key = `card:${shape}:${color}:${size}:${count}:${seed}`;
  const hit = canvasCache.get(key);
  if (hit) return hit;
  const made = makeCanvas(size, size);
  if (!made) return null;
  const { cv, ctx } = made;
  const o = leafOutline(shape);
  const base = new THREE.Color(color);
  const rand = mulberry(seed * 7919 + shape.length * 31);

  ctx.clearRect(0, 0, size, size);

  // Leaves nearer the "back" of the card draw first and darker, so the cluster
  // has depth instead of reading as a flat decal.
  const leaves: { x: number; y: number; rot: number; s: number; shade: number }[] = [];
  for (let i = 0; i < count; i++) {
    leaves.push({
      x: 0.5 + (rand() - 0.5) * 0.86,
      y: 0.5 + (rand() - 0.5) * 0.86,
      rot: rand() * Math.PI * 2,
      s: 0.3 + rand() * 0.34,
      shade: rand(),
    });
  }
  leaves.sort((a, b) => a.shade - b.shade);

  for (const lf of leaves) {
    ctx.save();
    ctx.translate(lf.x * size, lf.y * size);
    ctx.rotate(lf.rot);
    const S = lf.s * size;
    // depth shading + slight hue drift keeps a cluster from looking stamped
    const tone = 0.55 + lf.shade * 0.62;
    const drift = (rand() - 0.5) * 0.1;
    const c = base.clone().multiplyScalar(tone).offsetHSL(drift * 0.1, 0, 0);
    const hi = c.clone().lerp(new THREE.Color('#ffffff'), 0.16);
    const lo = c.clone().multiplyScalar(0.66);

    for (const poly of o.polygons) {
      ctx.beginPath();
      poly.forEach(([px, py], i) => {
        const X = px * S;
        const Y = -(py * S);           // tip points "up" in card space
        if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
      });
      ctx.closePath();
      const g = ctx.createLinearGradient(0, -S, 0, 0);
      g.addColorStop(0, `#${hi.getHexString()}`);
      g.addColorStop(1, `#${lo.getHexString()}`);
      ctx.fillStyle = g;
      ctx.fill();
    }
    if (o.veins.length) {
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = Math.max(0.7, S / 90);
      for (const v of o.veins) {
        ctx.beginPath();
        v.forEach(([px, py], i) => {
          const X = px * S, Y = -(py * S);
          if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
        });
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  canvasCache.set(key, tex);
  return tex;
}

/** A single blade, for close-up specimen plates. */
export function leafTexture(shape: LeafShape, color: string, size = 256): THREE.Texture | null {
  return leafCardTexture(shape, color, size, 1, 3);
}

/** Free every baked texture (wing unmount). */
export function disposeFloraTextures() {
  for (const t of canvasCache.values()) t.dispose();
  for (const t of normalCache.values()) t.dispose();
  canvasCache.clear();
  normalCache.clear();
}
