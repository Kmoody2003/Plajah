// broadcastGraphicLayer.ts — the ONE renderer for broadcast template graphics
// placed on the Fabula timeline (and, later, the live titler).
//
// A broadcast identity's held still is rasterized once (async, cached) into an
// Image; each frame we draw that Image with a deterministic motion envelope
// (services/fabula/graphicMotion.ts) computed from the clip-local time and the
// clip's duration. The monitor and the offline export call the same code, so
// what plays back is what renders. Non-full-frame kinds (BUG, SCORE_STRIP) are
// placed in the frame at their own aspect instead of being stretched.
import { FABULA_BROADCAST_PACKS } from '../../../../services/fabula/broadcastPacks';
import { makeBroadcastTemplate, renderBroadcastTemplateSvg, stillBroadcastSvg, fontKeysFor, type FabulaBroadcastTemplateControls } from '../../../../services/fabula/broadcastTemplateFactory';
import { embedBroadcastFonts } from '../../../../services/fabula/broadcastFontEmbed';
import { evaluateGraphicEnvelope, type GraphicEnvelope } from '../../../../services/fabula/graphicMotion';
import type { FabulaBroadcastAssetKind } from '../../../../services/fabula/broadcastPacks';

export interface BroadcastGraphicRef { packId: string; kind: FabulaBroadcastAssetKind; controls?: Partial<FabulaBroadcastTemplateControls> }

// Where each kind sits in a 1920×1080 frame (fractions), preserving its own aspect.
const PLACEMENT: Partial<Record<FabulaBroadcastAssetKind, { x: number; y: number; w: number; h: number }>> = {
  BUG: { x: .805, y: .05, w: .158, h: .281 },   // 600×600 square, top-right
  SCORE_STRIP: { x: 0, y: .778, w: 1, h: .222 }, // 1920×240 strip, along the bottom
};
const fullFrame = { x: 0, y: 0, w: 1, h: 1 };
const placementFor = (kind: FabulaBroadcastAssetKind) => PLACEMENT[kind] || fullFrame;

// Build the held-still SVG + native size for a graphic reference, merging the
// clip's editable text over the template defaults.
export function broadcastStill(ref: BroadcastGraphicRef, texts?: { title?: string; subtitle?: string }): { svg: string; w: number; h: number; key: string; fontKeys: string[] } {
  const pack = FABULA_BROADCAST_PACKS.find(p => p.id === ref.packId);
  if (!pack) return { svg: '', w: 1920, h: 1080, key: 'missing:' + ref.packId, fontKeys: [] };
  const t = makeBroadcastTemplate(pack, ref.kind);
  t.controls = { ...t.controls, ...(ref.controls || {}) };
  if (texts?.title != null && texts.title !== '') t.controls.title = texts.title;
  if (texts?.subtitle != null && texts.subtitle !== '') t.controls.subtitle = texts.subtitle;
  const svg = stillBroadcastSvg(renderBroadcastTemplateSvg(t));
  const key = `${t.id}|${JSON.stringify(ref.controls || {})}|${t.controls.title}|${t.controls.subtitle}`;
  return { svg, w: t.width, h: t.height, key, fontKeys: fontKeysFor(ref.packId) as any };
}

// ── Base-still raster cache (async) ───────────────────────────────────────────
const baseCache = new Map<string, HTMLImageElement>();
const pending = new Map<string, Promise<HTMLImageElement | null>>();

/** Peek the rasterized still, or null if not ready yet. */
export function getBroadcastBase(key: string): HTMLImageElement | null { return baseCache.get(key) || null; }

/** Rasterize a still SVG to an Image once; resolves when it is cached. */
export function ensureBroadcastBase(key: string, svg: string, fontKeys?: string[]): Promise<HTMLImageElement | null> {
  if (baseCache.has(key)) return Promise.resolve(baseCache.get(key)!);
  const hit = pending.get(key); if (hit) return hit;
  const p = (async (): Promise<HTMLImageElement | null> => {
    if (!svg) return null;
    // Rasterizing via <img> isolates the SVG from the document, so the pack's
    // fonts must be embedded as data URIs or every identity falls back to system faces.
    let doc = svg;
    try { doc = await embedBroadcastFonts(svg, (fontKeys || []) as any); } catch { doc = svg; }
    return await new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      img.onload = () => { baseCache.set(key, img); pending.delete(key); if (baseCache.size > 96) { const k = baseCache.keys().next().value; if (k && k !== key) baseCache.delete(k); } resolve(img); };
      img.onerror = () => { pending.delete(key); resolve(null); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(doc);
    });
  })();
  pending.set(key, p);
  return p;
}

/** Convenience: build + rasterize in one call (used by the offline prewarm). */
export function ensureBroadcastGraphic(ref: BroadcastGraphicRef, texts?: { title?: string; subtitle?: string }): Promise<HTMLImageElement | null> {
  const { svg, key, fontKeys } = broadcastStill(ref, texts);
  return ensureBroadcastBase(key, svg, fontKeys);
}

// ── Draw ──────────────────────────────────────────────────────────────────────
export function drawBroadcastGraphic(ctx: CanvasRenderingContext2D, img: HTMLImageElement, kind: FabulaBroadcastAssetKind, env: GraphicEnvelope, W: number, H: number, place?: { x: number; y: number; w: number; h: number }) {
  const pl = place || placementFor(kind);
  const dx = pl.x * W, dy = pl.y * H, dw = pl.w * W, dh = pl.h * H;
  const ax = dx + dw / 2, ay = dy + dh / 2; // scale about the graphic's own centre
  ctx.save();
  ctx.globalAlpha = env.opacity;
  if (env.clip) { ctx.beginPath(); ctx.rect(env.clip.x * W, env.clip.y * H, env.clip.w * W, env.clip.h * H); ctx.clip(); }
  ctx.translate(env.tx * W, env.ty * H);
  if (env.sx !== 1 || env.sy !== 1) { ctx.translate(ax, ay); ctx.scale(env.sx, env.sy); ctx.translate(-ax, -ay); }
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
}

// ── Keyed per-frame canvas (export path, mirrors getLowerThirdCanvas) ─────────
const frameCache = new Map<string, HTMLCanvasElement>();
export interface BroadcastGraphicFrameOpts { ref: BroadcastGraphicRef; title?: string; subtitle?: string; t: number; duration: number; width?: number; height?: number; place?: { x: number; y: number; w: number; h: number } }

/** Returns a W×H canvas for the frame, or null until the base still finishes
 *  rasterizing (the caller should ensureBroadcastGraphic() ahead of the loop). */
export function getBroadcastGraphicCanvas(o: BroadcastGraphicFrameOpts): HTMLCanvasElement | null {
  const { svg, key, fontKeys } = broadcastStill(o.ref, { title: o.title, subtitle: o.subtitle });
  const img = getBroadcastBase(key);
  if (!img) { ensureBroadcastBase(key, svg, fontKeys); return null; }
  const W = o.width || 1920, H = o.height || 1080;
  const pack = FABULA_BROADCAST_PACKS.find(p => p.id === o.ref.packId);
  const speed = o.ref.controls?.motionSpeed ?? 1;
  const env = evaluateGraphicEnvelope(o.ref.kind, o.t, o.duration, speed);
  const tq = env.animating ? Math.round(o.t * 60) / 60 : -1;
  // The exit is a function of the clip duration, so an animating frame must key on
  // D (and speed) too — otherwise two clips of the same identity but different
  // handles collide. Held frames (tq === -1) are duration-independent and shared.
  const dk = env.animating ? `${Number.isFinite(o.duration) ? o.duration.toFixed(2) : 'inf'}:${speed}` : '';
  const fkey = `${key}|${W}x${H}|${o.place ? JSON.stringify(o.place) : ''}|${dk}|${tq}`;
  const hit = frameCache.get(fkey); if (hit) return hit;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d'); if (!ctx) return null;
  drawBroadcastGraphic(ctx, img, o.ref.kind, env, W, H, o.place);
  frameCache.set(fkey, c);
  if (frameCache.size > 200) { const k = frameCache.keys().next().value; if (k) frameCache.delete(k); }
  void pack;
  return c;
}
