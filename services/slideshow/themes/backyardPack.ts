// Back Yard asset pack — Kenne's photographic plates, loops and backdrops.
//
// Built by scripts/slideshow/build_backyard_theme.py, which copies the curated assets to
// public/slideshow/backyard/ and detects every grey placeholder window (stills: one quad
// each; loops: a tracked quad per frame). The user's photos are composited into those
// windows at runtime, so no stand-in photo is ever shown.

import manifest from './backyard.manifest.json';

export type PackRole = 'plate' | 'plateLoop' | 'opening' | 'soft' | 'closing' | 'bokeh';

export interface PackWindow {
  id: number;
  /** TL, TR, BR, BL in 0..1 plate space (y down), flattened. */
  quad: number[];
  /** Mean luminance of the grey placeholder (0..1) — the shading reference. */
  lum: number;
  edge: boolean;
  partial: boolean;
  /** Window height as a fraction of the plate height. */
  height: number;
  /** Big and whole enough to lean into and lift to full page. */
  feature: boolean;
}

export interface PackAsset {
  id: string;
  role: PackRole;
  src: string;
  kind: 'image' | 'video';
  width: number;
  height: number;
  duration?: number;
  windows?: PackWindow[];
  tracks?: string;
  windowCount?: number;
  table?: boolean;
  coverage?: number;
}

export interface LoopTracks {
  fps: number;
  frames: number;
  duration: number;
  width: number;
  height: number;
  windows: { id: number; lum: number; edge: boolean; height: number; quads: number[] }[];
}

export const BACKYARD: { version: number; theme: string; assets: PackAsset[] } = manifest as any;

export const byId = (id: string) => BACKYARD.assets.find((a) => a.id === id)!;
export const byRole = (role: PackRole) => BACKYARD.assets.filter((a) => a.role === role);

/** Stills with windows the camera can lean into, by how many featured windows they hold. */
export function featurePlates() {
  return byRole('plate')
    .map((a) => ({ asset: a, feature: (a.windows || []).filter((w) => w.feature) }))
    .filter((p) => p.feature.length > 0 && p.feature.length <= 6);
}

/** Plates and loops used as wide "breaths" (lots of photos at once). */
export function breathPlates() {
  return [...byRole('plateLoop'), ...byRole('plate').filter((a) => (a.windows || []).length > 6)];
}

const trackCache = new Map<string, Promise<LoopTracks>>();
export function loadTracks(a: PackAsset): Promise<LoopTracks> {
  if (!a.tracks) return Promise.reject(new Error('no tracks'));
  let p = trackCache.get(a.tracks);
  if (!p) { p = fetch(a.tracks).then((r) => r.json()); trackCache.set(a.tracks, p); }
  return p;
}

/** Quad of tracked window w at loop time `time` (linear between 12 fps samples). */
export function trackedQuad(tr: LoopTracks, w: LoopTracks['windows'][number], time: number, out: number[]): number[] {
  const f = Math.max(0, Math.min(tr.frames - 1, time * tr.fps));
  const a = Math.floor(f), b = Math.min(tr.frames - 1, a + 1), k = f - a;
  for (let i = 0; i < 8; i++) out[i] = w.quads[a * 8 + i] * (1 - k) + w.quads[b * 8 + i] * k;
  return out;
}

// --- projective mapping ----------------------------------------------------------------

/**
 * 3×3 homography (column-major, for a THREE.Matrix3 via fromArray) mapping plate-space
 * points inside `quad` (TL,TR,BR,BL) to the unit square (0,0)…(1,1), y down.
 */
export function quadToUnit(quad: number[], out: number[] = new Array(9)): number[] {
  // unit square -> quad (Heckbert), then invert
  const [x0, y0, x1, y1, x2, y2, x3, y3] = quad;
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
  const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
  let g = 0, h = 0;
  const den = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(den) > 1e-12) { g = (sx * dy2 - dx2 * sy) / den; h = (dx1 * sy - sx * dy1) / den; }
  const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, c = x0;
  const d = y1 - y0 + g * y1, e = y3 - y0 + h * y3, f = y0;
  // forward M (row-major): [a b c; d e f; g h 1]; inverse via adjugate
  const A = e - f * h, B = c * h - b, C = b * f - c * e;
  const D = f * g - d, E = a - c * g, F = c * d - a * f;
  const G = d * h - e * g, H = b * g - a * h, I = a * e - b * d;
  // column-major for THREE.Matrix3.fromArray
  out[0] = A; out[1] = D; out[2] = G;
  out[3] = B; out[4] = E; out[5] = H;
  out[6] = C; out[7] = F; out[8] = I;
  return out;
}

export function pointInQuad(px: number, py: number, q: number[]) {
  let inside = false;
  for (let i = 0, j = 3; i < 4; j = i++) {
    const xi = q[i * 2], yi = q[i * 2 + 1], xj = q[j * 2], yj = q[j * 2 + 1];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function quadCentre(q: number[]) {
  return { x: (q[0] + q[2] + q[4] + q[6]) / 4, y: (q[1] + q[3] + q[5] + q[7]) / 4 };
}
