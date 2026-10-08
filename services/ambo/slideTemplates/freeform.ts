// freeform — the "blank canvas" slide template used by the Ambo slide editor.
//
// A freeform slide is just a scene of Tela vector objects (text, shapes, images,
// live clock/timer) authored on a 1920×1080 artboard and stored as JSON in the
// reserved `scene` field of an ordinary TELA_TEMPLATE layer. Because it is a
// TELA_TEMPLATE, every output, thumbnail and gallery already knows how to draw
// it with the SAME renderer (canvasRender.drawSlideObjects), re-flowed to the
// output's aspect ratio (uniform scale, centred) — what the editor shows is what
// the screens show. It is deliberately NOT listed in SLIDE_TEMPLATES (it is not a
// gallery template); registry.buildSlideObjects special-cases FREEFORM_ID.
import type { TelaVectorObject } from '../../../types';
import { fontShorthand } from '../../tela/telaText';
import { registerLiveDrawer } from './live';
import type { SlideObj } from './types';

export const FREEFORM_ID = 'freeform';
export const FREEFORM_FIELD = 'scene';
export const ART_W = 1920;
export const ART_H = 1080;

export interface FreeformScene { v: 1; objs: TelaVectorObject[] }

export function encodeScene(objs: TelaVectorObject[]): string {
  const clean = objs.map(o => { const { amboLayer: _a, ...rest } = o as any; return rest as TelaVectorObject; });
  return JSON.stringify({ v: 1, objs: clean } satisfies FreeformScene);
}

export function decodeScene(raw: string | undefined): TelaVectorObject[] {
  if (!raw) return [];
  try {
    const s = JSON.parse(raw) as FreeformScene;
    return Array.isArray(s?.objs) ? s.objs : [];
  } catch { return []; }
}

/** Plain text of a scene (reading order = z-order), for search / stage notes / thumbnails. */
export function sceneText(objs: TelaVectorObject[]): string {
  return objs.filter(o => o.kind === 'TEXT' && !o.hidden && o.text).map(o => o.text!.replace(/\s*\n\s*/g, ' ')).join(' ').trim();
}

/** Scale a scene object from the 1920×1080 artboard to a W×H output (uniform, centred). */
export function scaleObj(o: TelaVectorObject, k: number, ox: number, oy: number): SlideObj {
  const r: any = { ...o, x: o.x * k + ox, y: o.y * k + oy, w: o.w * k, h: o.h * k, strokeWidth: (o.strokeWidth || 0) * k };
  if (o.points) r.points = o.points.map((v, i) => v * k + (i % 2 ? oy : ox));
  if (o.fontSize) r.fontSize = o.fontSize * k;
  if (o.rx) r.rx = o.rx * k;
  if (o.blur) r.blur = o.blur * k;
  if (o.shadow) r.shadow = { ...o.shadow, x: o.shadow.x * k, y: o.shadow.y * k, blur: o.shadow.blur * k };
  if (o.strokeDash) r.strokeDash = o.strokeDash.map(v => v * k);
  r.grp = 1;
  return r as SlideObj;
}

export function buildFreeformObjects(fields: Record<string, string> | undefined, W: number, H: number): SlideObj[] {
  const k = Math.min(W / ART_W, H / ART_H);
  const ox = (W - ART_W * k) / 2, oy = (H - ART_H * k) / 2;
  return decodeScene(fields?.[FREEFORM_FIELD]).filter(o => !o.hidden).map(o => scaleObj(o, k, ox, oy));
}

// ── live drawers: clock + timer objects (the object is a text box; the drawer paints the time) ──

function paintLine(ctx: CanvasRenderingContext2D, o: SlideObj, text: string): void {
  const size = o.fontSize || 96;
  ctx.font = fontShorthand({ ...o, fontSize: size });
  let s = size;
  const w = ctx.measureText(text).width;
  if (w > o.w && w > 0) { s = size * o.w / w; ctx.font = fontShorthand({ ...o, fontSize: s }); }
  ctx.fillStyle = o.fill && o.fill !== 'none' ? o.fill : '#ffffff';
  const align = o.textAlign || 'center';
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  const x = align === 'left' ? o.x : align === 'right' ? o.x + o.w : o.x + o.w / 2;
  if (o.stroke && o.stroke !== 'none' && o.strokeWidth > 0) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.strokeWidth; ctx.lineJoin = 'round'; ctx.strokeText(text, x, o.y + o.h / 2); }
  ctx.fillText(text, x, o.y + o.h / 2);
}

export const pad2 = (n: number) => String(n).padStart(2, '0');

export function formatClock(d: Date, format: string | undefined): string {
  const h = d.getHours(), m = d.getMinutes(), s = d.getSeconds();
  if (format === '24h') return `${pad2(h)}:${pad2(m)}`;
  if (format === '24h-sec') return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  const h12 = h % 12 || 12, ap = h < 12 ? 'AM' : 'PM';
  return format === '12h-sec' ? `${h12}:${pad2(m)}:${pad2(s)} ${ap}` : `${h12}:${pad2(m)} ${ap}`;
}

export function formatTimer(totalSec: number): string {
  const t = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}

registerLiveDrawer('ambo-clock', (ctx, o) => {
  paintLine(ctx, o, formatClock(new Date(), (o.live?.props as any)?.format));
});

registerLiveDrawer('ambo-timer', (ctx, o, env) => {
  const p = (o.live?.props || {}) as { seconds?: number; mode?: 'down' | 'up' };
  const total = Number(p.seconds) || 300;
  const shown = Math.max(0, env.host?.shownSec ?? 0);   // gallery/thumbnail: a still frame
  const t = p.mode === 'up' ? shown : Math.max(0, total - shown);
  paintLine(ctx, o, formatTimer(env.host ? t : total));
});
