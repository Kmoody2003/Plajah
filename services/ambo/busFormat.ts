// busFormat — the shape and size of one output bus.
//
// A bus either matches its display (`autoDetectDisplay` on, the default: it renders at whatever
// shape the screen really is) or has a fixed format of its own, any W:H at all: 32:9, 4:1 for an
// LED ribbon, 9:16 for a portrait screen, 1:1. `displayScale` says how a fixed format sits on a
// screen of another shape. Media placement inside the bus is the separate `fit` (outputFit.ts).
//
// Pure: no DOM, so it runs in the studio, in every output window and in tests.

import { normalizeFit, ASPECT_TOLERANCE } from './outputFit';
import { allowedSlots } from './showModel';
import type { AmboOutput } from './outputRouter';

export type DisplayScale = 'fit' | 'fill' | 'stretch';

export const ASPECT_PRESETS = ['16:9', '16:10', '4:3', '21:9', '32:9', '4:1', '9:16', '1:1'] as const;

export const DISPLAY_SCALE_CSS: Record<DisplayScale, 'contain' | 'cover' | 'fill'> = { fit: 'contain', fill: 'cover', stretch: 'fill' };

/** The sizes people actually use, where they differ from the plain arithmetic below. */
const NAMED_SIZES: Record<string, { w: number; h: number }> = { '21:9': { w: 2560, h: 1080 } };

const MIN_EDGE = 16;
const MAX_EDGE = 16384;
const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);

/** '32:9', '32x9', '2.39' or '2.39:1' → width ÷ height. Null when it is not a usable shape. */
export function parseAspect(text: string | null | undefined): number | null {
  const m = /^\s*(\d*\.?\d+)\s*(?:[:x×/]\s*(\d*\.?\d+))?\s*$/i.exec(String(text ?? ''));
  if (!m) return null;
  const v = Number(m[1]) / (m[2] === undefined ? 1 : Number(m[2]));
  return isFinite(v) && v >= 0.02 && v <= 50 ? v : null;
}

/** The display resolution for a ratio: a 1080 short edge, which is what the master bus renders natively. */
export function sizeForAspect(text: string): { w: number; h: number } | null {
  const a = parseAspect(text);
  if (!a) return null;
  const named = NAMED_SIZES[text.trim()];
  if (named) return { ...named };
  return a >= 1 ? { w: even(1080 * a), h: 1080 } : { w: 1080, h: even(1080 / a) };
}

function gcd(a: number, b: number): number { return b === 0 ? a : gcd(b, a % b); }

// 2560×1080 and 3440×1440, sold as 21:9, are really 64:27 and 43:18.
const LABELS: Array<[string, number]> = [...ASPECT_PRESETS.map((p): [string, number] => [p, parseAspect(p)!]), ['21:9', 64 / 27], ['21:9', 43 / 18]];

/** A readable label for a size: a known ratio when it is one, otherwise the reduced W:H. */
export function aspectLabel(w: number, h: number): string {
  if (!(w > 0) || !(h > 0)) return '16:9';
  const r = w / h;
  for (const [label, v] of LABELS) if (Math.abs(r / v - 1) < ASPECT_TOLERANCE) return label;
  const iw = Math.round(w), ih = Math.round(h), g = gcd(iw, ih) || 1;
  const nw = iw / g, nh = ih / g;
  return nw <= 64 && nh <= 64 ? `${nw}:${nh}` : `${(iw / ih).toFixed(2)}:1`;
}

export function sameAspect(a: { w: number; h: number }, b: { w: number; h: number }): boolean {
  if (!a.w || !a.h || !b.w || !b.h) return false;
  return Math.abs((a.w / a.h) / (b.w / b.h) - 1) <= ASPECT_TOLERANCE;
}

/** What this bus renders at, given the real size of its window when it has one. */
export function busSize(o: Partial<AmboOutput> | null | undefined, display?: { w: number; h: number } | null): { w: number; h: number } {
  if (o?.autoDetectDisplay !== false && display?.w && display?.h) return { w: display.w, h: display.h };
  return { w: o?.width || display?.w || 1920, h: o?.height || display?.h || 1080 };
}

/**
 * The master bus canvas for a Program of this size. Capping the short edge rather than the long
 * one keeps a 16:9 4K screen at the 1080p it has always composited at, without squeezing 3840×1080
 * or a portrait 1080×1920 down to a soft sliver.
 */
export function busRenderSize(w: number, h: number, shortEdge = 1080, longEdge = 7680): { w: number; h: number } {
  const sw = Math.max(2, w || 1920), sh = Math.max(2, h || 1080);
  const k = Math.min(1, shortEdge / Math.min(sw, sh), longEdge / Math.max(sw, sh));
  return { w: Math.max(2, Math.round(sw * k)), h: Math.max(2, Math.round(sh * k)) };
}

/** A network feed for a bus of this size: even dimensions for the encoders, within 4K's long edge. */
export function feedSizeForBus(w: number, h: number): { w: number; h: number } {
  const k = Math.min(1, 3840 / Math.max(w, h, 1));
  return { w: even(w * k), h: even(h * k) };
}

/** A small monitor canvas of this shape. */
export function monitorSize(aspect: number, maxEdge = 960): { w: number; h: number } {
  const a = aspect > 0 && isFinite(aspect) ? aspect : 16 / 9;
  return a >= 1 ? { w: maxEdge, h: Math.max(2, Math.round(maxEdge / a)) } : { w: Math.max(2, Math.round(maxEdge * a)), h: maxEdge };
}

export function busAspect(o: Partial<AmboOutput> | null | undefined): number {
  const { w, h } = busSize(o);
  return w / h;
}

/** Short text for a monitor badge: '3840×1080 · 32:9'. */
export function busFormatLabel(o: Partial<AmboOutput> | null | undefined): string {
  const { w, h } = busSize(o);
  return `${w}×${h} · ${aspectLabel(w, h)}`;
}

/** Patch: give this bus a fixed ratio. A blank/unparsable ratio changes nothing. */
export function setBusAspect(text: string): Partial<AmboOutput> | null {
  const s = sizeForAspect(text);
  if (!s) return null;
  return { autoDetectDisplay: false, width: s.w, height: s.h, aspectRatio: aspectLabel(s.w, s.h) };
}

/** Patch: give this bus a fixed resolution; its ratio follows. */
export function setBusResolution(w: number, h: number): Partial<AmboOutput> | null {
  if (!(w >= MIN_EDGE) || !(h >= MIN_EDGE)) return null;
  const nw = Math.min(MAX_EDGE, Math.round(w)), nh = Math.min(MAX_EDGE, Math.round(h));
  return { autoDetectDisplay: false, width: nw, height: nh, aspectRatio: aspectLabel(nw, nh) };
}

/**
 * Outputs from a saved show. Anything saved before buses had formats has no `autoDetectDisplay`
 * (or a stale 1920×1080 beside it): it matches its display, and the window reports the true size
 * when it opens. A format the operator fixed stays fixed.
 */
export function normalizeBus<T extends AmboOutput>(o: T): T {
  const fixed = o.autoDetectDisplay === false;
  const width = o.width && o.width > 0 ? Math.round(o.width) : 1920;
  const height = o.height && o.height > 0 ? Math.round(o.height) : 1080;
  return { ...o, autoDetectDisplay: !fixed, width, height, aspectRatio: aspectLabel(width, height) };
}

/** Do these two buses let the same picture through? Audio is not picture: only the master plays it. */
function sameLayers(a: AmboOutput, b: AmboOutput): boolean {
  const slots = (o: AmboOutput) => { const s = allowedSlots(o.layers); s.delete('audio'); return s; };
  const sa = slots(a), sb = slots(b);
  return sa.size === sb.size && [...sa].every(slot => sb.has(slot));
}

/**
 * Can this window copy the master bus instead of compositing for itself? Only when the master
 * already is the picture it needs: the same layers and shape, placed the same way. Anything else
 * gets its own renderer, so a bus never shows another bus's framing with bars around it, or a slide
 * on a lobby loop. This looks at the bus's settings and not at what is live, even though a window
 * could share while the layers it lacks are empty: a copy lags the studio (a WebRTC frame or more),
 * so flipping back to it as a slide clears would flash that slide on a screen that must not show it.
 */
export function mirrorsProgram(
  o: AmboOutput | null | undefined,
  program: AmboOutput | null | undefined,
  display?: { w: number; h: number } | null,
): boolean {
  if (!o) return true;
  if (o.kind === 'STAGE' || o.kind === 'KEY' || o.alpha || o.clearedSlots?.length) return false;
  if (!program || program.id === o.id) return true;
  if (!sameLayers(o, program)) return false;
  if (!sameAspect(busSize(o, display), busSize(program))) return false;
  return JSON.stringify(normalizeFit(o.fit)) === JSON.stringify(normalizeFit(program.fit))
    && JSON.stringify(o.transform ?? null) === JSON.stringify(program.transform ?? null)
    && JSON.stringify(o.mask ?? null) === JSON.stringify(program.mask ?? null);
}
