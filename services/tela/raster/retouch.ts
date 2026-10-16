// raster/retouch — clone stamp, healing brush, spot healing, red eye, dodge/burn/sponge,
// blur/sharpen/smudge.
//
// Healing is real Poisson image editing (Pérez, Gangnet & Blake 2003): inside the healed
// region Ω the result f satisfies ∇²f = ∇²g (g = sampled texture) with f = destination on
// ∂Ω. Writing f = g + h reduces it to a Laplace problem ∇²h = 0, h|∂Ω = dst − g (the
// "membrane"), which we solve coarse-to-fine: pyramid down (known = boundary), solve the
// coarsest exactly by SOR, upsample as the initial guess, SOR-relax at each finer level.
// Spot healing synthesises the texture with PatchMatch first, then Poisson-blends it.

import { createBitmap, cloneBitmap, clamp01, type Bitmap8, type Mask8, type Rect } from './buffer';
import { BrushStroke, TILE, roundTipCoverage, sealPatch, type BrushSettings, type Dab, type PaintTarget, type StrokePoint, type UndoPatch } from './painting';
import { contentAwareFill } from './patchmatch';
import { solveMembrane } from './membrane';
import { rgbToHsl, hslToRgb } from './colorMath';

// ── Membrane (Laplace) solver — lives in membrane.ts (shared with content-aware fill); re-exported here ──
export { solveMembrane };

/**
 * Poisson blend: inside `cov` (0..1, crop-local) replace dst with texture + membrane
 * correction. dst/tex are RGB 0..255 Float32 (crop W×H). Returns blended RGB.
 */
export function poissonBlend(W: number, H: number, dst: Float32Array, tex: Float32Array, cov: Float32Array): Float32Array {
  const diff = new Float32Array(W * H * 3), unknown = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) { if (cov[i] > 0.004) unknown[i] = 1; for (let c = 0; c < 3; c++) diff[i * 3 + c] = dst[i * 3 + c] - tex[i * 3 + c]; }
  solveMembrane(W, H, 3, diff, unknown);
  const out = new Float32Array(W * H * 3);
  for (let i = 0; i < W * H; i++) { const k = cov[i]; for (let c = 0; c < 3; c++) { const f = tex[i * 3 + c] + diff[i * 3 + c]; out[i * 3 + c] = dst[i * 3 + c] + (f - dst[i * 3 + c]) * k; } }
  return out;
}

// ── Sampling helpers ────────────────────────────────────────────────────────
export function sampleBitmap(b: Bitmap8, x: number, y: number, out: number[]): void {
  const fx = Math.min(b.width - 1, Math.max(0, x - 0.5)), fy = Math.min(b.height - 1, Math.max(0, y - 0.5)), x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(b.width - 1, x0 + 1), y1 = Math.min(b.height - 1, y0 + 1), tx = fx - x0, ty = fy - y0, d = b.data;
  for (let c = 0; c < 4; c++) out[c] = (d[(y0 * b.width + x0) * 4 + c] * (1 - tx) + d[(y0 * b.width + x1) * 4 + c] * tx) * (1 - ty) + (d[(y1 * b.width + x0) * 4 + c] * (1 - tx) + d[(y1 * b.width + x1) * 4 + c] * tx) * ty;
}

// ── Clone stamp ─────────────────────────────────────────────────────────────
/** Alt-click source + aligned/non-aligned bookkeeping across strokes. */
export class CloneSession {
  private offset: { dx: number; dy: number } | null = null;
  constructor(public sourceX: number, public sourceY: number, public aligned = true) {}
  /** Offset (source − destination) for a stroke starting at (x, y). */
  begin(x: number, y: number) { if (!this.offset || !this.aligned) this.offset = { dx: this.sourceX - x, dy: this.sourceY - y }; return this.offset; }
}
/**
 * Clone stamp stroke. `source` = snapshot of the current layer ("Current Layer") or the
 * merged composite ("All Layers") taken at stroke start, in target pixel space.
 */
export function createCloneStroke(target: PaintTarget, source: Bitmap8, offset: { dx: number; dy: number }, brush: BrushSettings): BrushStroke {
  const s = new BrushStroke(target, brush, 'paint');
  s.source = (x, y, o) => sampleBitmap(source, x + 0.5 + offset.dx, y + 0.5 + offset.dy, o);
  return s;
}

// ── Healing brush ───────────────────────────────────────────────────────────
/** A healing stroke previews like the clone stamp; finishHealing() Poisson-blends it. */
export function createHealingStroke(target: Extract<PaintTarget, { kind: 'rgba' }>, source: Bitmap8, offset: { dx: number; dy: number }, brush: BrushSettings) {
  const stroke = createCloneStroke(target, source, offset, { ...brush, opacity: 1, flow: 1 });
  return { stroke, finish: () => finishHealing(stroke, source, offset) };
}
export function finishHealing(stroke: BrushStroke, source: Bitmap8, offset: { dx: number; dy: number }): UndoPatch {
  const t = stroke.target; if (t.kind !== 'rgba') return stroke.end('Healing Brush');
  const bm = t.bitmap; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const e of stroke.tiles.values()) { x0 = Math.min(x0, e.patch.tx * TILE); y0 = Math.min(y0, e.patch.ty * TILE); x1 = Math.max(x1, e.patch.tx * TILE + e.patch.w); y1 = Math.max(y1, e.patch.ty * TILE + e.patch.h); }
  if (!isFinite(x0)) return stroke.end('Healing Brush');
  const W = x1 - x0, H = y1 - y0, dst = new Float32Array(W * H * 3), tex = new Float32Array(W * H * 3), cov = new Float32Array(W * H), px = [0, 0, 0, 0];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const X = x + x0, Y = y + y0, i = y * W + x;
    const tx = Math.floor(X / TILE), ty = Math.floor(Y / TILE), e = stroke.tiles.get(ty * 65536 + tx);
    for (let c = 0; c < 3; c++) dst[i * 3 + c] = stroke.original(X, Y, c);
    sampleBitmap(source, X + 0.5 + offset.dx, Y + 0.5 + offset.dy, px); tex[i * 3] = px[0]; tex[i * 3 + 1] = px[1]; tex[i * 3 + 2] = px[2];
    cov[i] = e ? Math.min(1, e.m[(Y - ty * TILE) * e.patch.w + (X - tx * TILE)]) * stroke.brush.opacity : 0;
  }
  const out = poissonBlend(W, H, dst, tex, cov);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (cov[i] <= 0) continue; const k = ((y + y0) * bm.width + x + x0) * 4; for (let c = 0; c < 3; c++) bm.data[k + c] = Math.round(out[i * 3 + c]); bm.data[k + 3] = stroke.original(x + x0, y + y0, 3); }
  return stroke.end('Healing Brush');
}
/** Functional form (tests / proofs): heal along `points`, sampling from (x+offsetX, y+offsetY). */
export function healBrushStroke(image: Bitmap8, points: StrokePoint[], o: { size: number; hardness?: number; offsetX: number; offsetY: number }): Bitmap8 {
  const out = cloneBitmap(image), src = cloneBitmap(image);
  const { stroke, finish } = createHealingStroke({ kind: 'rgba', bitmap: out }, src, { dx: o.offsetX, dy: o.offsetY }, { size: o.size, hardness: o.hardness ?? 0.5, spacing: 0.15, flow: 1, opacity: 1 });
  for (const p of points) stroke.addPoint(p); finish(); return out;
}

// ── Spot healing ────────────────────────────────────────────────────────────
/** Heal a soft mask region (crop-local synthesis + Poisson). `mask` is image-sized coverage. */
export function spotHealMask(image: Bitmap8, mask: Mask8, opts: { seed?: number; margin?: number } = {}): Bitmap8 {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < mask.height; y++) for (let x = 0; x < mask.width; x++) if (mask.data[y * mask.width + x]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  if (x1 < 0) return cloneBitmap(image);
  const size = Math.max(x1 - x0, y1 - y0) + 1, m = opts.margin ?? Math.max(24, size * 3);
  const cx0 = Math.max(0, x0 - m), cy0 = Math.max(0, y0 - m), cx1 = Math.min(image.width, x1 + 1 + m), cy1 = Math.min(image.height, y1 + 1 + m), W = cx1 - cx0, H = cy1 - cy0;
  const crop = createBitmap(W, H), hole: Mask8 = { width: W, height: H, data: new Uint8Array(W * H) };
  for (let y = 0; y < H; y++) { crop.data.set(image.data.subarray(((y + cy0) * image.width + cx0) * 4, ((y + cy0) * image.width + cx1) * 4), y * W * 4); hole.data.set(mask.data.subarray((y + cy0) * mask.width + cx0, (y + cy0) * mask.width + cx1), y * W); }
  const filled = contentAwareFill(crop, hole, { seed: opts.seed ?? 1, patchSize: size < 12 ? 5 : 7 });
  const dst = new Float32Array(W * H * 3), tex = new Float32Array(W * H * 3), cov = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) { for (let c = 0; c < 3; c++) { dst[i * 3 + c] = crop.data[i * 4 + c]; tex[i * 3 + c] = filled.data[i * 4 + c]; } cov[i] = hole.data[i] / 255; }
  // grow the Poisson domain by 1 px of full replacement so the membrane sees clean boundary
  const blended = poissonBlend(W, H, dst, tex, cov);
  const out = cloneBitmap(image);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (cov[i] <= 0) continue; const k = ((y + cy0) * image.width + x + cx0) * 4; for (let c = 0; c < 3; c++) out.data[k + c] = Math.round(blended[i * 3 + c]); }
  return out;
}
/** Spot Healing Brush single click: soft disc of radius r at (x, y). */
export function spotHeal(image: Bitmap8, x: number, y: number, r: number, opts: { seed?: number; hardness?: number } = {}): Bitmap8 {
  const mask: Mask8 = { width: image.width, height: image.height, data: new Uint8Array(image.width * image.height) };
  for (let j = Math.max(0, Math.floor(y - r - 1)); j <= Math.min(image.height - 1, Math.ceil(y + r + 1)); j++) for (let i = Math.max(0, Math.floor(x - r - 1)); i <= Math.min(image.width - 1, Math.ceil(x + r + 1)); i++) {
    const c = roundTipCoverage(Math.hypot(i + 0.5 - x, j + 0.5 - y), r, opts.hardness ?? 0.7); if (c > 0) mask.data[j * image.width + i] = Math.round(c * 255);
  }
  return spotHealMask(image, mask, opts);
}

// ── Red eye ─────────────────────────────────────────────────────────────────
/** Remove red-eye inside `rect`: redness-weighted desaturate + darken of the pupil. */
export function redEye(image: Bitmap8, rect: Rect, o: { darken?: number } = {}): Bitmap8 {
  const out = cloneBitmap(image), dk = o.darken ?? 0.5, cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2, rx = rect.width / 2, ry = rect.height / 2;
  for (let y = Math.max(0, Math.floor(rect.y)); y < Math.min(image.height, Math.ceil(rect.y + rect.height)); y++) for (let x = Math.max(0, Math.floor(rect.x)); x < Math.min(image.width, Math.ceil(rect.x + rect.width)); x++) {
    const e = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2; if (e > 1) continue;
    const k = (y * image.width + x) * 4, r = out.data[k], g = out.data[k + 1], b = out.data[k + 2];
    const redness = clamp01((r - Math.max(g, b) * 1.2) / Math.max(1, r)) * clamp01((r - 60) / 60);
    if (redness <= 0) continue;
    const w = redness * clamp01((1 - e) * 4), nr = ((g + b) / 2) * (1 - dk * 0.5);
    out.data[k] = Math.round(r + (nr - r) * w); out.data[k + 1] = Math.round(g * (1 - dk * 0.5 * w)); out.data[k + 2] = Math.round(b * (1 - dk * 0.5 * w));
  }
  return out;
}

// ── Toning + focus tools (direct dab ops) ───────────────────────────────────
export type ToneRange = 'shadows' | 'midtones' | 'highlights';
const rangeWeight = (l: number, r: ToneRange) => (r === 'shadows' ? (1 - l) ** 2 : r === 'highlights' ? l * l : 1 - Math.abs(2 * l - 1));
/** Dodge (lighten) / Burn (darken) — exposure 0..1. */
export function createToneStroke(target: Extract<PaintTarget, { kind: 'rgba' }>, brush: BrushSettings, kind: 'dodge' | 'burn', range: ToneRange, exposure: number): BrushStroke {
  return new BrushStroke(target, brush, 'direct', undefined, (s, d, cov, rect) => directPixels(s, rect, cov, d, (c, k) => {
    const l = (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255, w = rangeWeight(l, range) * exposure * k * d.flow;
    for (let i = 0; i < 3; i++) c[i] = kind === 'dodge' ? c[i] + (255 - c[i]) * w : c[i] * (1 - w);
  }));
}
/** Sponge — saturate / desaturate (flow 0..1). */
export function createSpongeStroke(target: Extract<PaintTarget, { kind: 'rgba' }>, brush: BrushSettings, mode: 'saturate' | 'desaturate', flow: number): BrushStroke {
  const hsl = [0, 0, 0];
  return new BrushStroke(target, brush, 'direct', undefined, (s, d, cov, rect) => directPixels(s, rect, cov, d, (c, k) => {
    rgbToHsl(c[0] / 255, c[1] / 255, c[2] / 255, hsl); const w = flow * k * d.flow;
    hsl[1] = mode === 'saturate' ? hsl[1] + (1 - hsl[1]) * w * hsl[1] + w * 0.1 * (hsl[1] > 0.02 ? 1 : 0) : hsl[1] * (1 - w);
    hslToRgb(hsl[0], clamp01(hsl[1]), hsl[2], c); c[0] *= 255; c[1] *= 255; c[2] *= 255;
  }));
}
/** Blur / Sharpen tool — strength 0..1 per dab (3×3 kernel on the current pixels). */
export function createFocusStroke(target: Extract<PaintTarget, { kind: 'rgba' }>, brush: BrushSettings, kind: 'blur' | 'sharpen', strength: number): BrushStroke {
  return new BrushStroke(target, brush, 'direct', undefined, (s, d, cov, rect) => {
    const bm = target.bitmap, W = bm.width, H = bm.height, snap = new Float32Array(rect.width * rect.height * 4);
    for (let y = 0; y < rect.height; y++) for (let x = 0; x < rect.width; x++) {
      const X = x + rect.x, Y = y + rect.y; const acc = [0, 0, 0, 0]; let n = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const xx = Math.min(W - 1, Math.max(0, X + i)), yy = Math.min(H - 1, Math.max(0, Y + j)), w = (i ? 1 : 2) * (j ? 1 : 2), k = (yy * W + xx) * 4; for (let c = 0; c < 4; c++) acc[c] += bm.data[k + c] * w; n += w; }
      for (let c = 0; c < 4; c++) snap[(y * rect.width + x) * 4 + c] = acc[c] / n;
    }
    for (let y = 0; y < rect.height; y++) for (let x = 0; x < rect.width; x++) {
      const X = x + rect.x, Y = y + rect.y, k = cov(X, Y) * strength * d.flow; if (k <= 0) continue; const o = (Y * W + X) * 4;
      for (let c = 0; c < 3; c++) { const b = snap[(y * rect.width + x) * 4 + c], v = bm.data[o + c]; bm.data[o + c] = Math.round(kind === 'blur' ? v + (b - v) * k : v + (v - b) * k * 1.5); }
    }
  });
}
/** Smudge — drags colour: carried pixels blend into the target each dab (strength 0..1). */
export function createSmudgeStroke(target: Extract<PaintTarget, { kind: 'rgba' }>, brush: BrushSettings, strength: number): BrushStroke {
  let carried: Float32Array | null = null; const N = Math.ceil(brush.size) + 4;
  return new BrushStroke(target, { ...brush, spacing: Math.min(brush.spacing, 0.1) }, 'direct', undefined, (s, d, cov, _rect) => {
    const bm = target.bitmap, W = bm.width, H = bm.height, half = N >> 1;
    const first = !carried; if (!carried) carried = new Float32Array(N * N * 4);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const X = Math.round(d.x) - half + i, Y = Math.round(d.y) - half + j; if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      const o = (Y * W + X) * 4, q = (j * N + i) * 4;
      if (first) { for (let c = 0; c < 4; c++) carried[q + c] = bm.data[o + c]; continue; }
      const k = cov(X, Y) * strength; if (k <= 0) { for (let c = 0; c < 4; c++) carried[q + c] = bm.data[o + c]; continue; }
      for (let c = 0; c < 4; c++) { const v = bm.data[o + c] + (carried[q + c] - bm.data[o + c]) * k; bm.data[o + c] = Math.round(v); carried[q + c] = v; }
    }
  });
}
function directPixels(s: BrushStroke, rect: Rect, cov: (x: number, y: number) => number, d: Dab, fn: (c: number[], k: number) => void) {
  if (s.target.kind !== 'rgba') return; const bm = s.target.bitmap, c = [0, 0, 0];
  for (let y = rect.y; y < rect.y + rect.height; y++) for (let x = rect.x; x < rect.x + rect.width; x++) {
    const k = cov(x, y) * d.opacity; if (k <= 0) continue; const o = (y * bm.width + x) * 4;
    c[0] = bm.data[o]; c[1] = bm.data[o + 1]; c[2] = bm.data[o + 2]; fn(c, k);
    bm.data[o] = Math.round(c[0]); bm.data[o + 1] = Math.round(c[1]); bm.data[o + 2] = Math.round(c[2]);
  }
}
export { sealPatch };
