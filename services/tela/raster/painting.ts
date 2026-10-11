// raster/painting — brush engine, eraser, bucket fill and gradient tool, with tile-diff
// undo patches and dirty-rect tracking.
//
// Photoshop stroke model: dabs accumulate into a per-stroke coverage buffer with FLOW
// (m ← m + (1 − m)·flow·dab), and OPACITY caps the whole stroke (final = opacity·m), so
// overlapping dabs inside one stroke never exceed the opacity. Pixels are recomposited
// from the stroke-start snapshot each dab, which is also the undo patch: only touched
// 64×64 tiles are snapshotted, so undo memory is proportional to what the stroke touched.
//
// Targets are a layer bitmap (RGBA, straight) or a mask (1 channel). Coordinates are
// TARGET pixels (the UI converts document → layer space with the inverse transform).

import type { BlendMode, GradientShape, GradientSpec } from './model';
import { blendRGB } from './blend';
import { clamp01, hash01, type Bitmap8, type Mask8, type Rect } from './buffer';
import { magicWand, type Selection } from './selection';
import { renderGradientBitmap } from './gradient';

export type PaintTarget = { kind: 'rgba'; bitmap: Bitmap8 } | { kind: 'mask'; mask: Mask8 };
export const TILE = 64;
const tw = (t: PaintTarget) => (t.kind === 'rgba' ? t.bitmap.width : t.mask.width);
const th = (t: PaintTarget) => (t.kind === 'rgba' ? t.bitmap.height : t.mask.height);
const chans = (t: PaintTarget) => (t.kind === 'rgba' ? 4 : 1);
const tdata = (t: PaintTarget): Uint8ClampedArray | Uint8Array => (t.kind === 'rgba' ? t.bitmap.data : t.mask.data);

// ── Tile-diff undo patches ──────────────────────────────────────────────────
export interface TilePatch { tx: number; ty: number; w: number; h: number; before: Uint8Array; after?: Uint8Array }
export interface UndoPatch { target: PaintTarget; tiles: TilePatch[]; bytes: number; label?: string }
function readTile(t: PaintTarget, tx: number, ty: number): TilePatch {
  const W = tw(t), H = th(t), c = chans(t), x0 = tx * TILE, y0 = ty * TILE, w = Math.min(TILE, W - x0), h = Math.min(TILE, H - y0), d = tdata(t), buf = new Uint8Array(w * h * c);
  for (let y = 0; y < h; y++) buf.set(d.subarray(((y0 + y) * W + x0) * c, ((y0 + y) * W + x0 + w) * c), y * w * c);
  return { tx, ty, w, h, before: buf };
}
function writeTile(t: PaintTarget, p: TilePatch, data: Uint8Array) { const W = tw(t), c = chans(t), d = tdata(t), x0 = p.tx * TILE, y0 = p.ty * TILE; for (let y = 0; y < p.h; y++) d.set(data.subarray(y * p.w * c, (y + 1) * p.w * c), ((y0 + y) * W + x0) * c); }
/** Snapshot all tiles intersecting `rect` (for one-shot ops: fill, gradient, filters on a layer). */
export function snapshotRect(t: PaintTarget, rect: Rect, label?: string): UndoPatch {
  const tiles: TilePatch[] = []; let bytes = 0;
  const x0 = Math.max(0, Math.floor(rect.x / TILE)), y0 = Math.max(0, Math.floor(rect.y / TILE)), x1 = Math.min(Math.ceil(tw(t) / TILE) - 1, Math.floor((rect.x + rect.width - 1) / TILE)), y1 = Math.min(Math.ceil(th(t) / TILE) - 1, Math.floor((rect.y + rect.height - 1) / TILE));
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) { const p = readTile(t, tx, ty); tiles.push(p); bytes += p.before.length; }
  return { target: t, tiles, bytes, label };
}
/** Capture the "after" state (call once the op finished) so the patch can redo. */
export function sealPatch(p: UndoPatch): UndoPatch { for (const tile of p.tiles) { tile.after = readTile(p.target, tile.tx, tile.ty).before; p.bytes += tile.after.length; } dropUnchanged(p); return p; }
function dropUnchanged(p: UndoPatch) { p.tiles = p.tiles.filter(t => { if (!t.after) return true; for (let i = 0; i < t.before.length; i++) if (t.before[i] !== t.after[i]) return true; p.bytes -= t.before.length + t.after.length; return false; }); }
export function undoPatch(p: UndoPatch): Rect | null { for (const t of p.tiles) writeTile(p.target, t, t.before); return patchRect(p); }
export function redoPatch(p: UndoPatch): Rect | null { for (const t of p.tiles) if (t.after) writeTile(p.target, t, t.after); return patchRect(p); }
export function patchRect(p: UndoPatch): Rect | null {
  if (!p.tiles.length) return null; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const t of p.tiles) { x0 = Math.min(x0, t.tx * TILE); y0 = Math.min(y0, t.ty * TILE); x1 = Math.max(x1, t.tx * TILE + t.w); y1 = Math.max(y1, t.ty * TILE + t.h); }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

// ── Brush settings ──────────────────────────────────────────────────────────
export interface BrushDynamics {
  /** 0..1 — how much pen pressure scales each property (0 = off, 1 = pressure 0 → 0). */
  sizePressure?: number; opacityPressure?: number; flowPressure?: number;
  /** Tilt: tip angle follows the pen's azimuth; tilt magnitude flattens the roundness. */
  angleFromTilt?: boolean; roundnessTilt?: number;
  sizeJitter?: number; opacityJitter?: number; angleJitter?: number;
}
export interface BrushTexture { pattern: Mask8; scale: number; depth: number; invert?: boolean }
export interface BrushSettings {
  size: number;          // px diameter
  hardness: number;      // 0..1 (round tip)
  spacing: number;       // fraction of size (0.25 = Photoshop default)
  flow: number;          // 0..1
  opacity: number;       // 0..1
  roundness?: number;    // 0..1
  angle?: number;        // degrees
  tip?: Mask8;           // sampled tip (gray, 255 = full)
  dynamics?: BrushDynamics;
  /** 0..1 lazy-mouse smoothing (Photoshop "Smoothing"). */
  smoothing?: number;
  /** Pulled-string stabiliser radius in px (0 = off). */
  stabilizer?: number;
  scatter?: { amount: number; count?: number; bothAxes?: boolean };
  texture?: BrushTexture;
  seed?: number;
}
export const DEFAULT_BRUSH: BrushSettings = { size: 30, hardness: 0.8, spacing: 0.25, flow: 1, opacity: 1 };
export interface StrokePoint { x: number; y: number; pressure?: number; tiltX?: number; tiltY?: number }

/** Dab coverage of a round tip at distance d (after roundness/angle) for radius R. */
export function roundTipCoverage(d: number, R: number, hardness: number): number {
  if (d >= R + 0.5) return 0;
  const h = Math.min(0.999, Math.max(0, hardness)), core = R * h;
  if (h >= 0.98 || R - core < 1) return clamp01(R - d + 0.5); // hard edge, 1px AA
  if (d <= core) return 1;
  const t = (d - core) / (R - core); return t >= 1 ? 0 : 0.5 * (1 + Math.cos(Math.PI * t));
}

export interface Dab { x: number; y: number; size: number; opacity: number; flow: number; angle: number; roundness: number; pressure: number }
export type DabOp = (stroke: BrushStroke, dab: Dab, coverage: (x: number, y: number) => number, rect: Rect) => void;

/**
 * One stroke. Feed pointer samples with addPoint(); read takeDirty() each frame to
 * re-upload GPU tiles; end() returns the UndoPatch.
 *  mode 'paint'  — builds up the stroke buffer and composites `source(x,y)` colour
 *  mode 'erase'  — same buffer, removes alpha (or paints 0 into masks)
 *  mode 'direct' — calls `dabOp` per dab (dodge/burn/sponge/blur/sharpen/smudge/heal)
 */
export class BrushStroke {
  readonly tiles = new Map<number, { patch: TilePatch; m: Float32Array }>();
  private last: StrokePoint | null = null; private smoothed: StrokePoint | null = null; private residual = 0;
  private dirty: Rect | null = null; private rand: () => number; dabs = 0;
  /** Straight RGBA source per pixel (paint colour, clone source). Mask targets use [0] as value. */
  source: (x: number, y: number, out: number[]) => void;
  blend: BlendMode = 'normal';
  lockTransparency = false;
  /** Optional selection (document = target space) limiting the effect. */
  selection: Mask8 | null = null;
  constructor(public target: PaintTarget, public brush: BrushSettings, public mode: 'paint' | 'erase' | 'direct', color: [number, number, number, number] = [0, 0, 0, 255], public dabOp?: DabOp) {
    this.source = (_x, _y, o) => { o[0] = color[0]; o[1] = color[1]; o[2] = color[2]; o[3] = color[3]; };
    let s = brush.seed ?? 12345; this.rand = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e9) / 1e9; };
  }
  /** Touch (snapshot) a tile before modifying it. */
  touch(tx: number, ty: number) {
    const key = ty * 65536 + tx; let e = this.tiles.get(key);
    if (!e) { const patch = readTile(this.target, tx, ty); e = { patch, m: new Float32Array(patch.w * patch.h) }; this.tiles.set(key, e); }
    return e;
  }
  /** Original (stroke-start) value of channel c at pixel x,y. */
  original(x: number, y: number, c: number): number {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE), e = this.tiles.get(ty * 65536 + tx), ch = chans(this.target);
    if (!e) return tdata(this.target)[(y * tw(this.target) + x) * ch + c];
    return e.patch.before[((y - ty * TILE) * e.patch.w + (x - tx * TILE)) * ch + c];
  }
  addPoint(p: StrokePoint) {
    const b = this.brush;
    // smoothing: pulled string, then lazy mouse
    let q = { ...p };
    if (this.smoothed) {
      if (b.stabilizer && b.stabilizer > 0) { const dx = q.x - this.smoothed.x, dy = q.y - this.smoothed.y, d = Math.hypot(dx, dy); if (d <= b.stabilizer) return; const k = (d - b.stabilizer) / d; q = { ...q, x: this.smoothed.x + dx * k, y: this.smoothed.y + dy * k }; }
      if (b.smoothing && b.smoothing > 0) { const k = 1 - Math.min(0.95, b.smoothing); q = { ...q, x: this.smoothed.x + (q.x - this.smoothed.x) * k, y: this.smoothed.y + (q.y - this.smoothed.y) * k }; }
    }
    this.smoothed = q;
    const step = (pr: number) => Math.max(0.5, b.spacing * b.size * this.sizeFactor(pr));
    if (!this.last) { this.last = q; this.emit(q); this.residual = step(q.pressure ?? 1); return; }
    const a = this.last, dx = q.x - a.x, dy = q.y - a.y, dist = Math.hypot(dx, dy);
    let t = this.residual;
    while (t <= dist) {
      const f = dist ? t / dist : 1, pr = (a.pressure ?? 1) + ((q.pressure ?? 1) - (a.pressure ?? 1)) * f;
      this.emit({ x: a.x + dx * f, y: a.y + dy * f, pressure: pr, tiltX: q.tiltX, tiltY: q.tiltY });
      t += step(pr);
    }
    this.residual = t - dist;
    this.last = q;
  }
  private sizeFactor(p: number) { const k = this.brush.dynamics?.sizePressure ?? 0; return 1 - k + k * p; }
  private emit(p: StrokePoint) {
    const b = this.brush, dyn = b.dynamics || {}, pr = p.pressure ?? 1;
    const jit = (amt?: number) => (amt ? 1 - amt * this.rand() : 1);
    let size = b.size * this.sizeFactor(pr) * jit(dyn.sizeJitter);
    const opacity = b.opacity * (1 - (dyn.opacityPressure ?? 0) + (dyn.opacityPressure ?? 0) * pr) * jit(dyn.opacityJitter);
    const flow = b.flow * (1 - (dyn.flowPressure ?? 0) + (dyn.flowPressure ?? 0) * pr);
    let angle = b.angle ?? 0, roundness = b.roundness ?? 1;
    if (dyn.angleFromTilt && (p.tiltX || p.tiltY)) angle = Math.atan2(p.tiltY || 0, p.tiltX || 0) * 180 / Math.PI;
    if (dyn.roundnessTilt && (p.tiltX || p.tiltY)) roundness *= 1 - dyn.roundnessTilt * Math.min(1, Math.hypot(p.tiltX || 0, p.tiltY || 0) / 90);
    if (dyn.angleJitter) angle += (this.rand() * 2 - 1) * 180 * dyn.angleJitter;
    size = Math.max(0.5, size);
    const n = b.scatter ? Math.max(1, b.scatter.count ?? 1) : 1;
    for (let i = 0; i < n; i++) {
      let x = p.x, y = p.y;
      if (b.scatter && b.scatter.amount > 0) { const s = b.scatter.amount * size; x += (this.rand() * 2 - 1) * s; if (b.scatter.bothAxes !== false) y += (this.rand() * 2 - 1) * s; }
      this.dab({ x, y, size, opacity, flow, angle, roundness: Math.max(0.05, roundness), pressure: pr });
    }
  }
  /** Render one dab (public so tools can place dabs directly, e.g. spot healing). */
  dab(d: Dab) {
    this.dabs++;
    const W = tw(this.target), H = th(this.target), R = d.size / 2, b = this.brush;
    const ext = R + 1, x0 = Math.max(0, Math.floor(d.x - ext)), y0 = Math.max(0, Math.floor(d.y - ext)), x1 = Math.min(W - 1, Math.ceil(d.x + ext)), y1 = Math.min(H - 1, Math.ceil(d.y + ext));
    if (x1 < x0 || y1 < y0) return;
    const rect = { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
    const ca = Math.cos(-d.angle * Math.PI / 180), sa = Math.sin(-d.angle * Math.PI / 180), tex = b.texture, tip = b.tip;
    const coverage = (x: number, y: number) => {
      const dx = x + 0.5 - d.x, dy = y + 0.5 - d.y, u = dx * ca - dy * sa, v = (dx * sa + dy * ca) / d.roundness;
      let c: number;
      if (tip) { const tx = (u / d.size + 0.5) * tip.width - 0.5, ty = (v / d.size + 0.5) * tip.height - 0.5; c = sampleGray(tip, tx, ty); }
      else c = roundTipCoverage(Math.hypot(u, v), R, b.hardness);
      if (c > 0 && tex) { let tv = sampleGray(tex.pattern, ((x / tex.scale) % tex.pattern.width + tex.pattern.width) % tex.pattern.width, ((y / tex.scale) % tex.pattern.height + tex.pattern.height) % tex.pattern.height); if (tex.invert) tv = 1 - tv; c *= 1 - tex.depth * (1 - tv); }
      if (c > 0 && this.selection) c *= this.selection.data[y * this.selection.width + x] / 255;
      return c;
    };
    // snapshot touched tiles
    for (let ty = Math.floor(y0 / TILE); ty <= Math.floor(y1 / TILE); ty++) for (let tx = Math.floor(x0 / TILE); tx <= Math.floor(x1 / TILE); tx++) this.touch(tx, ty);
    if (this.mode === 'direct') { this.dabOp?.(this, d, coverage, rect); this.markDirty(rect); return; }
    const src = [0, 0, 0, 0], data = tdata(this.target), ch = chans(this.target), tb = [0, 0, 0], ts = [0, 0, 0], tr = [0, 0, 0];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const c = coverage(x, y); if (c <= 0) continue;
      const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE), e = this.tiles.get(ty * 65536 + tx)!, li = (y - ty * TILE) * e.patch.w + (x - tx * TILE);
      const m = e.m[li] = e.m[li] + (1 - e.m[li]) * d.flow * c;
      const k = Math.min(1, m) * d.opacity, oi = li * ch, di = (y * W + x) * ch, before = e.patch.before;
      if (this.target.kind === 'mask') {
        this.source(x, y, src); const val = this.mode === 'erase' ? 0 : src[0];
        data[di] = Math.round(before[oi] + (val - before[oi]) * k); continue;
      }
      const ab = before[oi + 3] / 255;
      if (this.mode === 'erase') { data[di + 3] = Math.round(before[oi + 3] * (1 - k)); for (let q = 0; q < 3; q++) data[di + q] = before[oi + q]; continue; }
      this.source(x, y, src); const as = (src[3] / 255) * k;
      let cr = src[0] / 255, cg = src[1] / 255, cb = src[2] / 255;
      if (this.blend !== 'normal' && ab > 0) { tb[0] = before[oi] / 255; tb[1] = before[oi + 1] / 255; tb[2] = before[oi + 2] / 255; ts[0] = cr; ts[1] = cg; ts[2] = cb; blendRGB(this.blend, tb, ts, tr); cr = tb[0] + (tr[0] - tb[0]) * ab; cg = tb[1] + (tr[1] - tb[1]) * ab; cb = tb[2] + (tr[2] - tb[2]) * ab; }
      if (this.lockTransparency) { for (let q = 0; q < 3; q++) data[di + q] = Math.round(before[oi + q] + ([cr, cg, cb][q] * 255 - before[oi + q]) * as); data[di + 3] = before[oi + 3]; continue; }
      const ao = as + ab * (1 - as);
      if (ao <= 0) { data[di] = data[di + 1] = data[di + 2] = data[di + 3] = 0; continue; }
      data[di] = Math.round((cr * 255 * as + before[oi] * ab * (1 - as)) / ao); data[di + 1] = Math.round((cg * 255 * as + before[oi + 1] * ab * (1 - as)) / ao);
      data[di + 2] = Math.round((cb * 255 * as + before[oi + 2] * ab * (1 - as)) / ao); data[di + 3] = Math.round(ao * 255);
    }
    this.markDirty(rect);
  }
  markDirty(r: Rect) { if (!this.dirty) this.dirty = { ...r }; else { const x = Math.min(this.dirty.x, r.x), y = Math.min(this.dirty.y, r.y); this.dirty = { x, y, width: Math.max(this.dirty.x + this.dirty.width, r.x + r.width) - x, height: Math.max(this.dirty.y + this.dirty.height, r.y + r.height) - y }; } }
  /** Dirty rect since the last call (re-upload / recomposite only this). */
  takeDirty(): Rect | null { const d = this.dirty; this.dirty = null; return d; }
  /** Finish: returns the undo patch (only tiles that actually changed). */
  end(label?: string): UndoPatch {
    const p: UndoPatch = { target: this.target, tiles: [...this.tiles.values()].map(e => e.patch), bytes: 0, label };
    for (const t of p.tiles) p.bytes += t.before.length;
    return sealPatch(p);
  }
}
export function sampleGray(m: Mask8, x: number, y: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0; let acc = 0;
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { const xx = x0 + i, yy = y0 + j; if (xx < 0 || yy < 0 || xx >= m.width || yy >= m.height) continue; acc += m.data[yy * m.width + xx] * (i ? tx : 1 - tx) * (j ? ty : 1 - ty); }
  return acc / 255;
}
/** Convenience: run a whole polyline as one stroke. */
export function paintStroke(target: PaintTarget, points: StrokePoint[], brush: BrushSettings, color: [number, number, number, number], mode: 'paint' | 'erase' = 'paint', opts: { blend?: BlendMode; selection?: Mask8; lockTransparency?: boolean } = {}): UndoPatch {
  const s = new BrushStroke(target, brush, mode, color); if (opts.blend) s.blend = opts.blend; if (opts.selection) s.selection = opts.selection; s.lockTransparency = !!opts.lockTransparency;
  for (const p of points) s.addPoint(p); return s.end(mode === 'erase' ? 'Eraser' : 'Brush');
}

// ── Paint Bucket ────────────────────────────────────────────────────────────
export interface BucketOptions { tolerance: number; contiguous: boolean; antiAlias: boolean; opacity?: number; /** sample merged pixels instead of the target */ sample?: Bitmap8; selection?: Mask8 }
export function bucketFill(target: Bitmap8, x: number, y: number, color: [number, number, number, number], o: BucketOptions): UndoPatch | null {
  const region = magicWand(o.sample || target, x, y, { tolerance: o.tolerance, contiguous: o.contiguous, antiAlias: o.antiAlias });
  if (!region.bounds) return null;
  const t: PaintTarget = { kind: 'rgba', bitmap: target }, patch = snapshotRect(t, region.bounds, 'Paint Bucket');
  fillCoverage(target, region, color, o.opacity ?? 1, o.selection);
  return sealPatch(patch);
}
/** Composite a solid colour through a coverage mask (selection fill, bucket). */
export function fillCoverage(target: Bitmap8, cov: Selection | Mask8, color: [number, number, number, number], opacity = 1, clip?: Mask8) {
  const d = target.data, as0 = (color[3] / 255) * opacity;
  for (let i = 0; i < cov.data.length; i++) {
    let k = cov.data[i] / 255; if (clip) k *= clip.data[i] / 255; if (k <= 0) continue;
    const as = as0 * k, ab = d[i * 4 + 3] / 255, ao = as + ab * (1 - as); if (ao <= 0) continue;
    for (let c = 0; c < 3; c++) d[i * 4 + c] = Math.round((color[c] * as + d[i * 4 + c] * ab * (1 - as)) / ao);
    d[i * 4 + 3] = Math.round(ao * 255);
  }
}

// ── Gradient tool ───────────────────────────────────────────────────────────
export interface GradientToolOptions { shape: GradientShape; x0: number; y0: number; x1: number; y1: number; reverse?: boolean; dither?: boolean; opacity?: number; blend?: BlendMode; selection?: Mask8; /** paint into transparent pixels too (false = lock transparency) */ transparency?: boolean }
export function applyGradientTool(target: Bitmap8, spec: GradientSpec, o: GradientToolOptions): UndoPatch {
  const t: PaintTarget = { kind: 'rgba', bitmap: target }, patch = snapshotRect(t, { x: 0, y: 0, width: target.width, height: target.height }, 'Gradient');
  const g = renderGradientBitmap(target.width, target.height, spec, { shape: o.shape, x0: o.x0, y0: o.y0, x1: o.x1, y1: o.y1, reverse: o.reverse, dither: o.dither ?? true });
  const d = target.data, op = o.opacity ?? 1, tb = [0, 0, 0], ts = [0, 0, 0], tr = [0, 0, 0];
  for (let i = 0; i < target.width * target.height; i++) {
    let as = (g.data[i * 4 + 3] / 255) * op; if (o.selection) as *= o.selection.data[i] / 255; if (as <= 0) continue;
    const ab = d[i * 4 + 3] / 255; let s = [g.data[i * 4] / 255, g.data[i * 4 + 1] / 255, g.data[i * 4 + 2] / 255];
    if (o.blend && o.blend !== 'normal' && ab > 0) { for (let c = 0; c < 3; c++) { tb[c] = d[i * 4 + c] / 255; ts[c] = s[c]; } blendRGB(o.blend, tb, ts, tr); s = s.map((_, c) => tb[c] + (tr[c] - tb[c]) * ab); }
    if (o.transparency === false) { for (let c = 0; c < 3; c++) d[i * 4 + c] = Math.round(d[i * 4 + c] + (s[c] * 255 - d[i * 4 + c]) * as); continue; }
    const ao = as + ab * (1 - as); for (let c = 0; c < 3; c++) d[i * 4 + c] = Math.round((s[c] * 255 * as + d[i * 4 + c] * ab * (1 - as)) / ao); d[i * 4 + 3] = Math.round(ao * 255);
  }
  void hash01;
  return sealPatch(patch);
}

// ── History stack (byte-capped) ─────────────────────────────────────────────
export class PaintHistory {
  private undoStack: UndoPatch[] = []; private redoStack: UndoPatch[] = []; bytes = 0;
  constructor(public maxBytes = 256 * 1024 * 1024) {}
  push(p: UndoPatch | null) { if (!p || !p.tiles.length) return; this.undoStack.push(p); this.bytes += p.bytes; this.redoStack = []; while (this.bytes > this.maxBytes && this.undoStack.length > 1) this.bytes -= this.undoStack.shift()!.bytes; }
  undo(): UndoPatch | null { const p = this.undoStack.pop(); if (!p) return null; undoPatch(p); this.redoStack.push(p); return p; }
  redo(): UndoPatch | null { const p = this.redoStack.pop(); if (!p) return null; redoPatch(p); this.undoStack.push(p); return p; }
  get canUndo() { return this.undoStack.length > 0; } get canRedo() { return this.redoStack.length > 0; }
}
