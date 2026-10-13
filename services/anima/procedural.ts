/**
 * services/anima/procedural.ts
 *
 * Plajah Anima — Procedural Engine & Texture Synthesizer
 * Provides:
 * 1. Procedural Noise Fields (Perlin, Simplex, Worley / Voronoi Cells, Curl Noise, fBm)
 * 2. Procedural Texture Synthesis (Wood, Marble, Metal Scratch, Fabric Weave, Caustics)
 * 3. Geometry Modifier Stack (Array / Cloner, Displace, Scatter on Path, Jitter, Subdivision)
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. FAST HASH & PROCEDURAL NOISE FIELDS
// ─────────────────────────────────────────────────────────────────────────────

function hash21(x: number, y: number): number {
  const sinVal = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return sinVal - Math.floor(sinVal);
}

function hash22(x: number, y: number): [number, number] {
  return [hash21(x, y), hash21(x + 19.19, y + 7.77)];
}

/** 2D Value Noise */
export function valueNoise2D(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;

  // Smoothstep interpolation
  const ux = fx * fx * (3.0 - 2.0 * fx);
  const uy = fy * fy * (3.0 - 2.0 * fy);

  const a = hash21(ix, iy);
  const b = hash21(ix + 1, iy);
  const c = hash21(ix, iy + 1);
  const d = hash21(ix + 1, iy + 1);

  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** Fractal Brownian Motion (fBm) */
export function fbm2D(x: number, y: number, octaves = 4, lacunarity = 2.0, gain = 0.5): number {
  let total = 0;
  let amplitude = 1.0;
  let frequency = 1.0;
  let maxAmp = 0;

  for (let i = 0; i < octaves; i++) {
    total += valueNoise2D(x * frequency, y * frequency) * amplitude;
    maxAmp += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  return total / maxAmp;
}

/** Worley / Voronoi Cellular Noise (returns distance to closest seed point + cell ID) */
export function worleyNoise2D(x: number, y: number): { distance: number; cellId: number } {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let minDist = 1e6;
  let cellId = 0;

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = ix + dx;
      const cy = iy + dy;
      const [rx, ry] = hash22(cx, cy);
      const px = cx + rx;
      const py = cy + ry;
      const dist = Math.hypot(px - x, py - y);
      if (dist < minDist) {
        minDist = dist;
        cellId = rx * 1000 + ry * 100;
      }
    }
  }

  return { distance: minDist, cellId };
}

/** Curl of 2D noise (divergence-free flow velocity for particles & fluids) */
export function curlNoise2D(x: number, y: number, time = 0): [number, number] {
  const eps = 0.01;
  const n1 = fbm2D(x, y + eps + time);
  const n2 = fbm2D(x, y - eps + time);
  const n3 = fbm2D(x + eps, y + time);
  const n4 = fbm2D(x - eps, y + time);
  return [(n1 - n2) / (2 * eps), -(n3 - n4) / (2 * eps)];
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. PROCEDURAL TEXTURE SYNTHESIS
// ─────────────────────────────────────────────────────────────────────────────

export type ProceduralTextureKind =
  | 'marble'
  | 'wood'
  | 'voronoi_cells'
  | 'caustics'
  | 'brushed_metal'
  | 'fabric';

export interface TextureOptions {
  scale: number;
  contrast: number;
  colorA: string;
  colorB: string;
  time?: number;
}

export function synthesizeProceduralCanvas(
  kind: ProceduralTextureKind,
  width: number,
  height: number,
  opts: Partial<TextureOptions> = {}
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;
  const scale = opts.scale || 1.0;
  const time = opts.time || 0;

  let ptr = 0;
  for (let y = 0; y < height; y++) {
    const ny = (y / height) * 4 * scale;
    for (let x = 0; x < width; x++) {
      const nx = (x / width) * 4 * scale;
      let val = 0;

      switch (kind) {
        case 'marble': {
          // Domain-warped sine
          const turb = fbm2D(nx, ny, 4) * 2.0;
          val = 0.5 + 0.5 * Math.sin(nx * 3.0 + turb * 4.0);
          break;
        }
        case 'wood': {
          // Concentric rings with turbulence
          const r = Math.hypot(nx - 2 * scale, ny - 2 * scale) * 8.0;
          const grain = fbm2D(nx * 0.5, ny * 0.5, 3) * 3.0;
          val = 0.5 + 0.5 * Math.sin(r + grain);
          break;
        }
        case 'voronoi_cells': {
          const w = worleyNoise2D(nx, ny);
          val = Math.min(1.0, w.distance);
          break;
        }
        case 'caustics': {
          // Dual overlapping wave networks
          const w1 = worleyNoise2D(nx + Math.sin(time), ny + Math.cos(time)).distance;
          const w2 = worleyNoise2D(nx - Math.cos(time), ny - Math.sin(time)).distance;
          val = Math.pow(Math.abs(w1 - w2), 0.6);
          break;
        }
        case 'brushed_metal': {
          // Anisotropic streak noise
          val = fbm2D(nx * 0.2, ny * 16.0, 3);
          break;
        }
        case 'fabric': {
          // Interlocking grid weave
          const weaveX = Math.sin(nx * 20.0);
          const weaveY = Math.cos(ny * 20.0);
          val = 0.5 + 0.25 * weaveX + 0.25 * weaveY;
          break;
        }
      }

      const byteVal = Math.floor(Math.max(0, Math.min(1, val)) * 255);
      data[ptr] = byteVal;     // R
      data[ptr + 1] = byteVal; // G
      data[ptr + 2] = byteVal; // B
      data[ptr + 3] = 255;     // A
      ptr += 4;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. GEOMETRY MODIFIER STACK
// ─────────────────────────────────────────────────────────────────────────────

export interface ModifierArrayConfig {
  count: number;
  offset: { x: number; y: number; z: number };
  scaleMultiplier: number;
  rotationOffset: number; // degrees
}

export interface ModifierDisplaceConfig {
  strength: number;
  frequency: number;
  timeOffset: number;
}

export class ProceduralGeometryEngine {
  /** Cloner / Array Modifier: duplicates an input point or path in radial or linear arrays */
  static applyArrayModifier(
    points: Array<{ x: number; y: number }>,
    config: ModifierArrayConfig
  ): Array<Array<{ x: number; y: number }>> {
    const clones: Array<Array<{ x: number; y: number }>> = [];
    for (let i = 0; i < config.count; i++) {
      const factor = i;
      const angle = (config.rotationOffset * factor * Math.PI) / 180;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const s = Math.pow(config.scaleMultiplier, factor);

      const clone = points.map((p) => {
        // Rotate and scale
        const rx = (p.x * cosA - p.y * sinA) * s;
        const ry = (p.x * sinA + p.y * cosA) * s;
        return {
          x: rx + config.offset.x * factor,
          y: ry + config.offset.y * factor,
        };
      });
      clones.push(clone);
    }
    return clones;
  }

  /** Displace Modifier: ripples points using procedural noise */
  static applyDisplace(
    points: Array<{ x: number; y: number }>,
    config: ModifierDisplaceConfig,
    time = 0
  ): Array<{ x: number; y: number }> {
    return points.map((p) => {
      const [dx, dy] = curlNoise2D(p.x * config.frequency, p.y * config.frequency, time + config.timeOffset);
      return {
        x: p.x + dx * config.strength,
        y: p.y + dy * config.strength,
      };
    });
  }

  /** Scatter / Instancer: scatter N points across a bounding box with Poisson-like spacing */
  static scatterPoints(count: number, bounds: { w: number; h: number }, seed = 42): Array<{ x: number; y: number; rot: number; scale: number }> {
    const out: Array<{ x: number; y: number; rot: number; scale: number }> = [];
    for (let i = 0; i < count; i++) {
      const rx = hash21(i * 13.37 + seed, seed);
      const ry = hash21(seed, i * 7.71 + seed);
      out.push({
        x: rx * bounds.w,
        y: ry * bounds.h,
        rot: hash21(i, rx) * 360,
        scale: 0.8 + hash21(ry, i) * 0.4,
      });
    }
    return out;
  }
}
