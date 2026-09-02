// forgeBindings — the PixelChooser + track-binding layer for Forge effect instances.
//
// A ForgeEffectInstance can carry:
//   • `mask`     — a shape (ellipse / rect / polygon) drawn in normalized clip space with
//                  feather + invert, optionally following the clip's VectorTrack (point or
//                  planar). Rasterised to a canvas the renderer uploads as the effect's mask.
//   • `bindings` — param → VectorTrack source (point x/y, planar centre/corner/scale/rotation),
//                  mapped into the param's range with an offset/scale.
//
// `resolveInstanceForFrame()` is the ONE place both the live monitor (ForgeClipPreview) and the
// offline export (fabulaRender → offlineRenderer) turn a stored instance into what the GPU sees
// for a given clip-local time, so what you preview is what bakes.
import type { ForgeEffectInstance } from './forgeEffects';
import type { FxEffect } from '../../components/plajahPixels/engine/fx/effects';
import { sampleTrackAt, type VectorTrackAsset } from './vectorTrack';
import { samplePlanarAt, type PlanarTrackSequence } from './planarSequence';
import { transformPoint, invertHomography, multiplyMat3, decomposePlanar, type Mat3, type Point2 } from './planarTrack';

export type MaskShape = 'ellipse' | 'rect' | 'poly';
export type MaskTrack = 'none' | 'point' | 'planar';
export interface EffectMask {
  shape: MaskShape;
  /** Ellipse/rect: centre + size (normalized). Poly: ignored (points used). */
  cx: number; cy: number; w: number; h: number; rotation: number;
  /** Polygon vertices (normalized), in draw order. */
  points?: Point2[];
  /** Edge softness as a fraction of the frame's shorter side (0 = hard). */
  feather: number;
  invert?: boolean;
  /** Follow the clip's track. The shape was drawn at `refFrame` (clip-local frame index). */
  track?: MaskTrack;
  refFrame?: number;
  enabled?: boolean;
}
export type BindingSource = 'pointX' | 'pointY' | 'planarCX' | 'planarCY' | 'planarCornerX' | 'planarCornerY' | 'planarScale' | 'planarRotation';
export interface ParamBinding {
  source: BindingSource;
  /** Corner index (TL,TR,BR,BL) for planarCorner*. */
  corner?: number;
  /** value = offset + raw * scale (raw is normalized 0..1 for positions, ×1 for scale, degrees for rotation). */
  offset?: number; scale?: number;
}
export const BINDING_SOURCES: { id: BindingSource; label: string }[] = [
  { id: 'pointX', label: 'Point track X' }, { id: 'pointY', label: 'Point track Y' },
  { id: 'planarCX', label: 'Surface centre X' }, { id: 'planarCY', label: 'Surface centre Y' },
  { id: 'planarCornerX', label: 'Surface corner X' }, { id: 'planarCornerY', label: 'Surface corner Y' },
  { id: 'planarScale', label: 'Surface scale' }, { id: 'planarRotation', label: 'Surface rotation' },
];

/** The clip-level track data an instance can bind to (a subset of clip.fx). */
export interface ClipTrackContext {
  vectorTrack?: VectorTrackAsset | null;
  planarTrack?: PlanarTrackSequence | null;
  fps?: number;
}

export const MASK_DEFAULT: EffectMask = { shape: 'ellipse', cx: .5, cy: .5, w: .5, h: .5, rotation: 0, feather: .05, invert: false, track: 'none', enabled: true };

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const frameOf = (t: number, fps?: number) => Math.max(0, Math.round(t * (fps || 24)));

/** Raw track values at a clip-local time: normalized positions, scale factor, rotation (deg). */
export function trackValuesAt(ctx: ClipTrackContext, localT: number): Record<BindingSource, number | null> & { corners?: Point2[] } {
  const out: any = { pointX: null, pointY: null, planarCX: null, planarCY: null, planarCornerX: null, planarCornerY: null, planarScale: null, planarRotation: null };
  if (ctx.vectorTrack?.samples?.length) {
    const s = sampleTrackAt(ctx.vectorTrack, frameOf(localT, ctx.vectorTrack.fps || ctx.fps));
    if (s) { out.pointX = s.x; out.pointY = s.y; }
  }
  if (ctx.planarTrack?.samples?.length) {
    const s = samplePlanarAt(ctx.planarTrack, frameOf(localT, ctx.planarTrack.fps || ctx.fps));
    if (s) {
      const c = s.corners; out.corners = c;
      out.planarCX = (c[0].x + c[1].x + c[2].x + c[3].x) / 4; out.planarCY = (c[0].y + c[1].y + c[2].y + c[3].y) / 4;
      const d = decomposePlanar(s.matrix); out.planarScale = (Math.abs(d.scaleX) + Math.abs(d.scaleY)) / 2; out.planarRotation = (d.rotation * 180) / Math.PI;
    }
  }
  return out;
}

/** Apply bindings to an instance's params for one frame. Unbound params are untouched. */
export function resolveBoundParams(instance: ForgeEffectInstance, effect: FxEffect, ctx: ClipTrackContext, localT: number): Record<string, number> {
  const bindings = (instance as any).bindings as Record<string, ParamBinding> | undefined;
  if (!bindings || !Object.keys(bindings).length) return instance.params;
  const values = trackValuesAt(ctx, localT);
  const params = { ...instance.params };
  for (const [key, b] of Object.entries(bindings)) {
    const param = effect.params.find(p => p.key === key); if (!param || !b) continue;
    let raw: number | null = null;
    if (b.source === 'planarCornerX' || b.source === 'planarCornerY') { const c = values.corners?.[clamp(b.corner ?? 0, 0, 3)]; raw = c ? (b.source === 'planarCornerX' ? c.x : c.y) : null; }
    else raw = values[b.source];
    if (raw == null) continue;
    const range = param.max - param.min;
    // Positions map the 0..1 track space across the param range by default; scale/rotation are direct.
    const isPos = b.source !== 'planarScale' && b.source !== 'planarRotation';
    const scale = b.scale ?? (isPos ? range : 1);
    const offset = b.offset ?? (isPos ? param.min : (b.source === 'planarScale' ? 0 : 0));
    params[key] = clamp(offset + raw * scale, param.min, param.max);
  }
  return params;
}

/** Matrix that moves a mask drawn at `refFrame` to `localT` (identity when untracked). */
export function maskTransformAt(mask: EffectMask, ctx: ClipTrackContext, localT: number): Mat3 {
  const I: Mat3 = [1,0,0, 0,1,0, 0,0,1];
  if (!mask.track || mask.track === 'none') return I;
  const ref = mask.refFrame ?? 0;
  if (mask.track === 'planar' && ctx.planarTrack?.samples?.length) {
    const seq = ctx.planarTrack; const fps = seq.fps || ctx.fps;
    const now = samplePlanarAt(seq, frameOf(localT, fps)), at = samplePlanarAt(seq, ref);
    if (!now || !at) return I;
    const inv = invertHomography(at.matrix); if (!inv) return I;
    return multiplyMat3(now.matrix, inv);
  }
  if (mask.track === 'point' && ctx.vectorTrack?.samples?.length) {
    const tr = ctx.vectorTrack; const fps = tr.fps || ctx.fps;
    const now = sampleTrackAt(tr, frameOf(localT, fps)), at = sampleTrackAt(tr, ref);
    if (!now || !at) return I;
    return [1,0,now.x - at.x, 0,1,now.y - at.y, 0,0,1];
  }
  return I;
}

/** The mask's outline at a clip-local time, as normalized points (for overlays and rasterising). */
export function maskOutlineAt(mask: EffectMask, ctx: ClipTrackContext, localT: number, segments = 48): Point2[] {
  const M = maskTransformAt(mask, ctx, localT);
  let pts: Point2[];
  if (mask.shape === 'poly' && mask.points?.length) pts = mask.points;
  else {
    const r = (mask.rotation || 0) * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r);
    const local = (x: number, y: number) => ({ x: mask.cx + x * cs - y * sn, y: mask.cy + x * sn + y * cs });
    if (mask.shape === 'rect') pts = [local(-mask.w / 2, -mask.h / 2), local(mask.w / 2, -mask.h / 2), local(mask.w / 2, mask.h / 2), local(-mask.w / 2, mask.h / 2)];
    else { pts = []; for (let i = 0; i < segments; i++) { const a = (i / segments) * Math.PI * 2; pts.push(local(Math.cos(a) * mask.w / 2, Math.sin(a) * mask.h / 2)); } }
  }
  return pts.map(p => transformPoint(M, p));
}

// ── Rasteriser (browser only; cached by content) ────────────────────────────────────────────
const maskCache = new Map<string, HTMLCanvasElement>();
const MAX_CACHE = 64;
export function rasterizeMask(outline: Point2[], w: number, h: number, feather: number, invert = false): HTMLCanvasElement | null {
  if (typeof document === 'undefined' || !outline.length || !w || !h) return null;
  const key = `${w}x${h}|${feather.toFixed(4)}|${invert ? 1 : 0}|${outline.map(p => `${p.x.toFixed(4)},${p.y.toFixed(4)}`).join(';')}`;
  const hit = maskCache.get(key); if (hit) return hit;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'); if (!ctx) return null;
  const blurPx = feather * Math.min(w, h);
  ctx.fillStyle = invert ? '#fff' : '#000'; ctx.fillRect(0, 0, w, h);
  ctx.save();
  if (blurPx > 0.5 && 'filter' in ctx) (ctx as any).filter = `blur(${blurPx.toFixed(2)}px)`;
  ctx.fillStyle = invert ? '#000' : '#fff';
  ctx.beginPath(); outline.forEach((p, i) => { const x = p.x * w, y = p.y * h; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }); ctx.closePath(); ctx.fill();
  ctx.restore();
  if (maskCache.size >= MAX_CACHE) { const first = maskCache.keys().next().value; if (first !== undefined) maskCache.delete(first); }
  maskCache.set(key, c);
  return c;
}

export interface ResolvedInstance extends ForgeEffectInstance { maskElement?: HTMLCanvasElement | null; maskInvert?: boolean; }

/** Turn a stored instance into the per-frame instance the renderer consumes (params bound,
 *  mask rasterised). Mask raster size defaults to a 512-wide analysis raster in the frame's aspect. */
export function resolveInstanceForFrame(instance: ForgeEffectInstance, effect: FxEffect | undefined, ctx: ClipTrackContext, localT: number, frame: { w: number; h: number }): ResolvedInstance {
  let out: ResolvedInstance = instance;
  if (effect) { const params = resolveBoundParams(instance, effect, ctx, localT); if (params !== instance.params) out = { ...out, params }; }
  const mask = (instance as any).mask as EffectMask | undefined;
  if (mask && mask.enabled !== false) {
    const rw = 512, rh = Math.max(2, Math.round(512 * (frame.h || 9) / (frame.w || 16)));
    const el = rasterizeMask(maskOutlineAt(mask, ctx, localT), rw, rh, mask.feather ?? 0, false);
    if (el) out = { ...out, maskElement: el, maskInvert: !!mask.invert };
  }
  return out;
}
