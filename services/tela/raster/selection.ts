// raster/selection — selections as 8-bit coverage masks (document-sized) with bounds.
//
// Every tool produces a Selection; combine() applies the toolbar mode (new/add/subtract/
// intersect). All functions are pure typed-array code (worker/node safe). The marching
// ants and selection→path both trace the 50% iso-contour with marching squares, so what
// the user sees is exactly what a path/mask conversion produces.

import type { Affine, Rect, VectorSubpath, PathPoint } from './model';
import { affineInvert } from './model';
import { createMask, type Bitmap8, type Mask8, type RasterF } from './buffer';
import { rasterizePolygons, type Pt } from './vectorPath';
import { distanceTransform } from './distance';
import { srgbToLab } from './colorMath';

export interface Selection extends Mask8 { bounds: Rect | null }
export type SelectionOp = 'replace' | 'add' | 'subtract' | 'intersect' | 'xor';

export const emptySelection = (w: number, h: number): Selection => ({ ...createMask(w, h), bounds: null });
export const selectAll = (w: number, h: number): Selection => ({ ...createMask(w, h, 255), bounds: { x: 0, y: 0, width: w, height: h } });
export function computeBounds(m: Mask8): Rect | null {
  let x0 = m.width, y0 = m.height, x1 = -1, y1 = -1;
  for (let y = 0; y < m.height; y++) { const row = y * m.width; for (let x = 0; x < m.width; x++) if (m.data[row + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y; } }
  return x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}
const fromCoverage = (w: number, h: number, cov: Float32Array): Selection => { const m = createMask(w, h); for (let i = 0; i < cov.length; i++) m.data[i] = Math.round(Math.min(1, Math.max(0, cov[i])) * 255); return { ...m, bounds: computeBounds(m) }; };
export const isEmpty = (s: Selection) => !s.bounds;

// ── Marquees + lassos ───────────────────────────────────────────────────────
export function rectSelection(w: number, h: number, r: Rect, antiAlias = true): Selection {
  const poly: Pt[] = [[r.x, r.y], [r.x + r.width, r.y], [r.x + r.width, r.y + r.height], [r.x, r.y + r.height]];
  if (!antiAlias) poly.forEach(p => { p[0] = Math.round(p[0]); p[1] = Math.round(p[1]); });
  return fromCoverage(w, h, rasterizePolygons([poly], w, h));
}
export function ellipseSelection(w: number, h: number, r: Rect): Selection {
  const n = Math.max(32, Math.ceil(Math.PI * (r.width + r.height) / 2)), poly: Pt[] = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; poly.push([r.x + r.width / 2 + Math.cos(a) * r.width / 2, r.y + r.height / 2 + Math.sin(a) * r.height / 2]); }
  return fromCoverage(w, h, rasterizePolygons([poly], w, h));
}
/** Freehand lasso and polygonal lasso share this (points are closed automatically). */
export function lassoSelection(w: number, h: number, points: { x: number; y: number }[]): Selection {
  return fromCoverage(w, h, rasterizePolygons([points.map(p => [p.x, p.y] as Pt)], w, h));
}
export const polygonalLassoSelection = lassoSelection;

// ── Combine / invert ────────────────────────────────────────────────────────
export function combine(base: Selection | null, next: Selection, op: SelectionOp): Selection {
  if (!base || op === 'replace') return next;
  const out = createMask(base.width, base.height), a = base.data, b = next.data;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] / 255, y = b[i] / 255;
    const v = op === 'add' ? x + y - x * y : op === 'subtract' ? x * (1 - y) : op === 'intersect' ? x * y : x + y - 2 * x * y;
    out.data[i] = Math.round(v * 255);
  }
  return { ...out, bounds: computeBounds(out) };
}
export function invertSelection(s: Selection): Selection { const out = createMask(s.width, s.height); for (let i = 0; i < out.data.length; i++) out.data[i] = 255 - s.data[i]; return { ...out, bounds: computeBounds(out) }; }

// ── Magic wand / colour range / bucket region ───────────────────────────────
export interface WandOptions { tolerance: number; contiguous: boolean; antiAlias: boolean }
/** Photoshop tolerance: every channel within ±tolerance of the seed (0..255). `image` = layer or merged pixels. */
export function magicWand(image: Bitmap8, x: number, y: number, o: WandOptions): Selection {
  const W = image.width, H = image.height, d = image.data, out = createMask(W, H);
  x = Math.floor(x); y = Math.floor(y); if (x < 0 || y < 0 || x >= W || y >= H) return emptySelection(W, H);
  const s = (y * W + x) * 4, sr = d[s], sg = d[s + 1], sb = d[s + 2], sa = d[s + 3], t = o.tolerance;
  const match = (p: number) => { const k = p * 4; return Math.abs(d[k] - sr) <= t && Math.abs(d[k + 1] - sg) <= t && Math.abs(d[k + 2] - sb) <= t && Math.abs(d[k + 3] - sa) <= t; };
  if (!o.contiguous) { for (let p = 0; p < W * H; p++) if (match(p)) out.data[p] = 255; }
  else {
    const stack = [y * W + x]; out.data[y * W + x] = 255;
    // scanline flood fill
    while (stack.length) {
      const p = stack.pop()!; const py = (p / W) | 0; let lx = p - py * W, rx = lx;
      while (lx > 0 && !out.data[py * W + lx - 1] && match(py * W + lx - 1)) { lx--; out.data[py * W + lx] = 255; }
      while (rx < W - 1 && !out.data[py * W + rx + 1] && match(py * W + rx + 1)) { rx++; out.data[py * W + rx] = 255; }
      for (const ny of [py - 1, py + 1]) { if (ny < 0 || ny >= H) continue; for (let i = lx; i <= rx; i++) { const q = ny * W + i; if (!out.data[q] && match(q)) { out.data[q] = 255; stack.push(q); } } }
    }
  }
  if (o.antiAlias) antiAliasEdges(out);
  return { ...out, bounds: computeBounds(out) };
}
/** Soften the 1-px staircase of a hard mask (3×3 tent on boundary pixels only). */
function antiAliasEdges(m: Mask8) {
  const W = m.width, H = m.height, src = new Uint8Array(m.data);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, v = src[i];
    let edge = false; for (let j = -1; j <= 1 && !edge; j++) for (let k = -1; k <= 1; k++) { const yy = y + j, xx = x + k; if (yy < 0 || xx < 0 || yy >= H || xx >= W) continue; if (src[yy * W + xx] !== v) { edge = true; break; } }
    if (!edge) continue;
    let acc = 0, n = 0; for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) { const yy = y + j, xx = x + k; if (yy < 0 || xx < 0 || yy >= H || xx >= W) continue; const w = (j === 0 ? 2 : 1) * (k === 0 ? 2 : 1); acc += src[yy * W + xx] * w; n += w; }
    m.data[i] = Math.round(acc / n);
  }
}
/** Colour Range: Lab ΔE to the nearest sampled colour, soft falloff over `fuzziness` (0..200). */
export function colorRange(image: Bitmap8, samples: [number, number, number][], fuzziness: number, opts: { invert?: boolean } = {}): Selection {
  const W = image.width, H = image.height, out = createMask(W, H), labs = samples.map(c => srgbToLab(c[0] / 255, c[1] / 255, c[2] / 255)), lab = [0, 0, 0], f = Math.max(1, fuzziness) / 2;
  for (let p = 0; p < W * H; p++) {
    const k = p * 4; srgbToLab(image.data[k] / 255, image.data[k + 1] / 255, image.data[k + 2] / 255, lab);
    let best = Infinity; for (const s of labs) best = Math.min(best, Math.hypot(lab[0] - s[0], lab[1] - s[1], lab[2] - s[2]));
    let v = Math.max(0, 1 - best / f) * (image.data[k + 3] / 255); if (opts.invert) v = 1 - v; out.data[p] = Math.round(v * 255);
  }
  return { ...out, bounds: computeBounds(out) };
}

// ── Quick selection: edge-aware geodesic region growing from brush strokes ──
export interface QuickSelectOptions { brushSize: number; /** 0..1 how readily it crosses soft edges */ spread?: number }
export function quickSelect(image: Bitmap8, stroke: { x: number; y: number }[], o: QuickSelectOptions, base: Selection | null = null, subtract = false): Selection {
  const W = image.width, H = image.height, d = image.data, N = W * H;
  const lab = new Float32Array(N * 3), t = [0, 0, 0];
  for (let p = 0; p < N; p++) { srgbToLab(d[p * 4] / 255, d[p * 4 + 1] / 255, d[p * 4 + 2] / 255, t); lab[p * 3] = t[0]; lab[p * 3 + 1] = t[1]; lab[p * 3 + 2] = t[2]; }
  // seeds under the brush + their colour model
  const r = Math.max(1, o.brushSize / 2), seeds: number[] = [], seen = new Uint8Array(N);
  for (const pt of stroke) for (let y = Math.max(0, Math.floor(pt.y - r)); y <= Math.min(H - 1, Math.ceil(pt.y + r)); y++) for (let x = Math.max(0, Math.floor(pt.x - r)); x <= Math.min(W - 1, Math.ceil(pt.x + r)); x++) { const p = y * W + x; if (!seen[p] && (x - pt.x) ** 2 + (y - pt.y) ** 2 <= r * r) { seen[p] = 1; seeds.push(p); } }
  if (!seeds.length) return base || emptySelection(W, H);
  const mean = [0, 0, 0]; for (const p of seeds) for (let c = 0; c < 3; c++) mean[c] += lab[p * 3 + c] / seeds.length;
  let varSum = 0; for (const p of seeds) varSum += (lab[p * 3] - mean[0]) ** 2 + (lab[p * 3 + 1] - mean[1]) ** 2 + (lab[p * 3 + 2] - mean[2]) ** 2;
  const sigma = Math.sqrt(varSum / seeds.length) + 6, spread = o.spread ?? 0.5, limit = (2.2 + spread * 2) * sigma;
  // geodesic distance: step cost = colour gradient between neighbours + distance from the model
  const dist = new Float64Array(N).fill(Infinity), heap = new MinHeap(); // f64: f32 rounding would make popped keys look stale
  for (const p of seeds) { dist[p] = 0; heap.push(0, p); }
  const budget = limit * Math.max(W, H) * 0.06 + limit * 4;
  while (heap.size) {
    const [dv, p] = heap.pop(); if (dv > dist[p]) continue;
    const px = p % W, py = (p / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = px + dx, y = py + dy; if (x < 0 || y < 0 || x >= W || y >= H) continue; const q = y * W + x;
      const g = Math.hypot(lab[q * 3] - lab[p * 3], lab[q * 3 + 1] - lab[p * 3 + 1], lab[q * 3 + 2] - lab[p * 3 + 2]);
      const m = Math.hypot(lab[q * 3] - mean[0], lab[q * 3 + 1] - mean[1], lab[q * 3 + 2] - mean[2]);
      if (m > limit) continue;
      const nd = dv + 0.15 + g * g / (sigma * 0.6) + Math.max(0, m - sigma) * 0.05;
      if (nd < dist[q] && nd < budget) { dist[q] = nd; heap.push(nd, q); }
    }
  }
  const sel = createMask(W, H); for (let p = 0; p < N; p++) if (dist[p] < budget) sel.data[p] = 255;
  antiAliasEdges(sel);
  const grown: Selection = { ...sel, bounds: computeBounds(sel) };
  const refined = refineEdge(grown, image, { radius: 2, epsilon: 0.002 });
  return combine(base, refined, base ? (subtract ? 'subtract' : 'add') : 'replace');
}
class MinHeap {
  private k: number[] = []; private v: number[] = [];
  get size() { return this.k.length; }
  push(key: number, val: number) { const k = this.k, v = this.v; k.push(key); v.push(val); let i = k.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= k[i]) break; [k[p], k[i]] = [k[i], k[p]]; [v[p], v[i]] = [v[i], v[p]]; i = p; } }
  pop(): [number, number] {
    const k = this.k, v = this.v, top: [number, number] = [k[0], v[0]], lk = k.pop()!, lv = v.pop()!;
    if (k.length) { k[0] = lk; v[0] = lv; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < k.length && k[l] < k[m]) m = l; if (r < k.length && k[r] < k[m]) m = r; if (m === i) break; [k[m], k[i]] = [k[i], k[m]]; [v[m], v[i]] = [v[i], v[m]]; i = m; } }
    return top;
  }
}

// ── Modify: feather / expand / contract / smooth / border ───────────────────
function boxBlurGray(src: Float32Array, W: number, H: number, r: number): Float32Array {
  const tmp = new Float32Array(W * H), out = new Float32Array(W * H), n = 2 * r + 1;
  for (let y = 0; y < H; y++) { let acc = 0; for (let x = -r; x <= r; x++) acc += src[y * W + Math.min(W - 1, Math.max(0, x))]; for (let x = 0; x < W; x++) { tmp[y * W + x] = acc / n; acc += src[y * W + Math.min(W - 1, x + r + 1)] - src[y * W + Math.max(0, x - r)]; } }
  for (let x = 0; x < W; x++) { let acc = 0; for (let y = -r; y <= r; y++) acc += tmp[Math.min(H - 1, Math.max(0, y)) * W + x]; for (let y = 0; y < H; y++) { out[y * W + x] = acc / n; acc += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x]; } }
  return out;
}
/** Gaussian feather (σ = radius/2, 3-box approximation; radius in px like Photoshop's Feather). */
export function featherSelection(s: Selection, radius: number): Selection {
  if (radius <= 0) return s;
  const W = s.width, H = s.height; let f = new Float32Array(W * H); for (let i = 0; i < f.length; i++) f[i] = s.data[i] / 255;
  const sigma = radius / 2, w = Math.sqrt(12 * sigma * sigma / 3 + 1), r = Math.max(1, Math.round((w - 1) / 2));
  for (let i = 0; i < 3; i++) f = boxBlurGray(f, W, H, r);
  return fromCoverage(W, H, f);
}
export function expandSelection(s: Selection, px: number): Selection {
  const W = s.width, H = s.height, dist = distanceTransform(W, H, i => s.data[i] >= 128), cov = new Float32Array(W * H);
  for (let i = 0; i < cov.length; i++) cov[i] = Math.max(s.data[i] / 255, Math.min(1, Math.max(0, px + 1 - dist[i]))); // dist is centre-to-centre: the edge sits 0.5 px from the nearest inside centre
  return fromCoverage(W, H, cov);
}
export function contractSelection(s: Selection, px: number): Selection {
  const W = s.width, H = s.height, dist = distanceTransform(W, H, i => s.data[i] < 128), cov = new Float32Array(W * H);
  for (let i = 0; i < cov.length; i++) cov[i] = Math.min(s.data[i] / 255, Math.min(1, Math.max(0, dist[i] - px)));
  return fromCoverage(W, H, cov);
}
/** Smooth: round off jaggies/islands (blur then re-threshold with an AA ramp). */
export function smoothSelection(s: Selection, radius: number): Selection {
  const W = s.width, H = s.height; let f = new Float32Array(W * H); for (let i = 0; i < f.length; i++) f[i] = s.data[i] / 255;
  f = boxBlurGray(boxBlurGray(f, W, H, Math.max(1, Math.round(radius))), W, H, Math.max(1, Math.round(radius / 2)));
  for (let i = 0; i < f.length; i++) f[i] = Math.min(1, Math.max(0, (f[i] - 0.5) * 4 + 0.5));
  return fromCoverage(W, H, f);
}
export function borderSelection(s: Selection, width: number): Selection {
  const e = expandSelection(s, width / 2), c = contractSelection(s, width / 2);
  return combine(e, c, 'subtract');
}
/** Transform Selection (scale/rotate/skew) — bilinear resample of the coverage. */
export function transformSelection(s: Selection, m: Affine): Selection {
  const W = s.width, H = s.height, inv = affineInvert(m), out = createMask(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx = inv[0] * (x + 0.5) + inv[2] * (y + 0.5) + inv[4] - 0.5, sy = inv[1] * (x + 0.5) + inv[3] * (y + 0.5) + inv[5] - 0.5;
    const x0 = Math.floor(sx), y0 = Math.floor(sy), tx = sx - x0, ty = sy - y0; let acc = 0;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { const xx = x0 + i, yy = y0 + j; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; acc += s.data[yy * W + xx] * (i ? tx : 1 - tx) * (j ? ty : 1 - ty); }
    out.data[y * W + x] = Math.round(acc);
  }
  return { ...out, bounds: computeBounds(out) };
}

// ── Select and Mask: guided-filter refine edge ──────────────────────────────
export interface RefineOptions { radius: number; epsilon?: number; smooth?: number; feather?: number; contrast?: number; shiftEdge?: number }
/** Edge-aware refinement (He et al. guided filter, gray guide) + PS-style smooth/feather/contrast/shift. */
export function refineEdge(s: Selection, image: Bitmap8, o: RefineOptions): Selection {
  const W = s.width, H = s.height, N = W * H, r = Math.max(1, Math.round(o.radius)), eps = o.epsilon ?? 0.001;
  const I = new Float32Array(N), p = new Float32Array(N);
  for (let i = 0; i < N; i++) { const k = i * 4; I[i] = (0.299 * image.data[k] + 0.587 * image.data[k + 1] + 0.114 * image.data[k + 2]) / 255; p[i] = s.data[i] / 255; }
  const mean = (f: Float32Array) => boxBlurGray(f, W, H, r);
  const mI = mean(I), mp = mean(p), Ip = new Float32Array(N), II = new Float32Array(N);
  for (let i = 0; i < N; i++) { Ip[i] = I[i] * p[i]; II[i] = I[i] * I[i]; }
  const mIp = mean(Ip), mII = mean(II), a = new Float32Array(N), b = new Float32Array(N);
  for (let i = 0; i < N; i++) { const cov = mIp[i] - mI[i] * mp[i], v = mII[i] - mI[i] * mI[i]; a[i] = cov / (v + eps); b[i] = mp[i] - a[i] * mI[i]; }
  const ma = mean(a), mb = mean(b); let q = new Float32Array(N);
  for (let i = 0; i < N; i++) q[i] = ma[i] * I[i] + mb[i];
  if (o.smooth) q = boxBlurGray(q, W, H, Math.round(o.smooth));
  if (o.contrast) { const c = 1 + o.contrast / 25; for (let i = 0; i < N; i++) q[i] = (q[i] - 0.5) * c + 0.5; }
  if (o.shiftEdge) for (let i = 0; i < N; i++) q[i] = q[i] + o.shiftEdge / 200;
  let out = fromCoverage(W, H, q);
  if (o.feather) out = featherSelection(out, o.feather);
  return out;
}

// ── Conversions ─────────────────────────────────────────────────────────────
/** Selection → layer mask bitmap cropped to its bounds (with defaultColor 0 outside). */
export function selectionToMask(s: Selection): { mask: Mask8; bounds: Rect } | null {
  if (!s.bounds) return null; const b = s.bounds, m = createMask(b.width, b.height);
  for (let y = 0; y < b.height; y++) m.data.set(s.data.subarray((b.y + y) * s.width + b.x, (b.y + y) * s.width + b.x + b.width), y * b.width);
  return { mask: m, bounds: b };
}
/** Layer pixels' alpha → selection (Ctrl-click a thumbnail). */
export function selectionFromAlpha(bm: Bitmap8, offsetX = 0, offsetY = 0, docW = bm.width, docH = bm.height): Selection {
  const out = createMask(docW, docH);
  for (let y = 0; y < bm.height; y++) for (let x = 0; x < bm.width; x++) { const X = x + offsetX, Y = y + offsetY; if (X < 0 || Y < 0 || X >= docW || Y >= docH) continue; out.data[Y * docW + X] = bm.data[(y * bm.width + x) * 4 + 3]; }
  return { ...out, bounds: computeBounds(out) };
}
/** Coverage of a raster's alpha (sample-merged selections). */
export function selectionFromRasterAlpha(r: RasterF): Selection { const m = createMask(r.width, r.height); for (let i = 0; i < m.data.length; i++) m.data[i] = Math.round(Math.min(1, r.data[i * 4 + 3]) * 255); return { ...m, bounds: computeBounds(m) }; }

/** Marching squares on the 50% iso-line → closed polylines (pixel-centre grid, sub-pixel). */
export function traceContours(s: Mask8, iso = 127.5): Pt[][] {
  const W = s.width, H = s.height, v = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : s.data[y * W + x]);
  const segs = new Map<string, Pt[]>(); const key = (p: Pt) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
  const lerp = (a: number, b: number) => (iso - a) / (b - a);
  const out: [Pt, Pt][] = [];
  for (let y = -1; y < H; y++) for (let x = -1; x < W; x++) {
    const a = v(x, y), b = v(x + 1, y), c = v(x + 1, y + 1), d = v(x, y + 1);
    const idx = (a > iso ? 8 : 0) | (b > iso ? 4 : 0) | (c > iso ? 2 : 0) | (d > iso ? 1 : 0);
    if (idx === 0 || idx === 15) continue;
    const cx = x + 0.5, cy = y + 0.5;
    const T: Pt = [cx + lerp(a, b), cy], R: Pt = [cx + 1, cy + lerp(b, c)], B: Pt = [cx + lerp(d, c), cy + 1], L: Pt = [cx, cy + lerp(a, d)];
    // oriented so the inside is on the left
    const table: Record<number, [Pt, Pt][]> = { 1: [[B, L]], 2: [[R, B]], 3: [[R, L]], 4: [[T, R]], 5: [[T, L], [B, R]], 6: [[T, B]], 7: [[T, L]], 8: [[L, T]], 9: [[B, T]], 10: [[L, B], [R, T]], 11: [[R, T]], 12: [[L, R]], 13: [[B, R]], 14: [[L, B]] };
    for (const sgm of table[idx]) out.push(sgm);
  }
  for (const [p, q] of out) { const k = key(p); if (!segs.has(k)) segs.set(k, []); segs.get(k)!.push(q); }
  const loops: Pt[][] = []; const used = new Set<string>();
  for (const [p0] of out) {
    const k0 = key(p0); if (used.has(k0) || !segs.get(k0)?.length) continue;
    const loop: Pt[] = [p0]; let cur = p0, guard = 0;
    for (;;) {
      const k = key(cur); const nexts = segs.get(k); if (!nexts || !nexts.length) break; const nx = nexts.pop()!; used.add(k);
      if (key(nx) === k0) break; loop.push(nx); cur = nx; if (++guard > 4 * W * H) break;
    }
    if (loop.length > 2) loops.push(loop);
  }
  return loops;
}
/** Marching ants for the UI: polylines in document px (call per selection change, not per frame). */
export const marchingAnts = (s: Selection) => traceContours(s);

/** Ramer–Douglas–Peucker on a closed loop. */
function simplify(poly: Pt[], tol: number): Pt[] {
  if (poly.length < 4) return poly;
  const rdp = (pts: Pt[], a: number, b: number, keep: Uint8Array) => {
    let best = -1, bi = -1; const [x1, y1] = pts[a], [x2, y2] = pts[b], dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / len; if (d > best) { best = d; bi = i; } }
    if (best > tol) { keep[bi] = 1; rdp(pts, a, bi, keep); rdp(pts, bi, b, keep); }
  };
  // split the loop at its farthest point from vertex 0
  let far = 0, fd = -1; for (let i = 1; i < poly.length; i++) { const d = Math.hypot(poly[i][0] - poly[0][0], poly[i][1] - poly[0][1]); if (d > fd) { fd = d; far = i; } }
  const pts = [...poly, poly[0]], keep = new Uint8Array(pts.length); keep[0] = keep[far] = keep[pts.length - 1] = 1;
  rdp(pts, 0, far, keep); rdp(pts, far, pts.length - 1, keep);
  return pts.filter((_, i) => keep[i] && i < pts.length - 1);
}
/** Selection → work path: contours simplified then fitted with smooth cubic handles (corners kept sharp). */
export function selectionToPath(s: Selection, tolerance = 1): VectorSubpath[] {
  return traceContours(s).map(loop => {
    const pts = simplify(loop, tolerance), n = pts.length;
    const points: PathPoint[] = pts.map((p, i) => {
      const prev = pts[(i - 1 + n) % n], next = pts[(i + 1) % n];
      const v1 = [p[0] - prev[0], p[1] - prev[1]], v2 = [next[0] - p[0], next[1] - p[1]];
      const l1 = Math.hypot(v1[0], v1[1]) || 1, l2 = Math.hypot(v2[0], v2[1]) || 1;
      const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2);
      if (cos < 0.5) return { x: p[0], y: p[1] }; // corner (> 60°)
      const tx = (next[0] - prev[0]) / (l1 + l2), ty = (next[1] - prev[1]) / (l1 + l2);
      return { x: p[0], y: p[1], in: { x: p[0] - tx * l1 / 3, y: p[1] - ty * l1 / 3 }, out: { x: p[0] + tx * l2 / 3, y: p[1] + ty * l2 / 3 } };
    });
    return { closed: true, points };
  });
}

// ── Select Subject (local SlimSAM, browser only) ────────────────────────────
/**
 * Wire-up to the existing on-device SAM service. `decodeAlpha` turns the returned cutout
 * PNG into a Bitmap8 (browser: createImageBitmap → canvas). Returns a document-sized selection.
 */
export async function selectSubject(src: string, docW: number, docH: number, decodeAlpha: (dataUrl: string, w: number, h: number) => Promise<Bitmap8>, box?: Rect, onProgress?: (e: unknown) => void): Promise<Selection> {
  const { refineDocumentRegionMask } = await import('../../telaDocumentIntelligence');
  const crop = box ? { ...box, sourceWidth: docW, sourceHeight: docH } : { x: 0, y: 0, width: docW, height: docH, sourceWidth: docW, sourceHeight: docH };
  const res = await refineDocumentRegionMask(src, crop, onProgress as any);
  const bm = await decodeAlpha(res.src, docW, docH);
  return selectionFromAlpha(bm, 0, 0, docW, docH);
}
