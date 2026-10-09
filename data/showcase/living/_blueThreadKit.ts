// Shared helpers for the two living editions "Below the Blue" and "The Golden Thread" (data/showcase/living/<book-id>.ts).
//
// Everything here is build-time: it READS the real page designers' output (the same objects the Tela doc is built from), so groups and
// "ride this path" keyframes always match the art and a designer change shows up as a failing test instead of a silently dead behaviour.
// What leaves this file is plain LivingBook JSON.
import type { Action, AnimKeyframe, Behavior, Cond, Narration, Scalar, Target, Trigger } from '../../../services/living/contracts';
import type { TelaVectorObject } from '../../../types';
import { pageObjects } from '../../../services/showcase/livingDoc';
import { showcaseById } from '../index';

// ───────────────────────────── designer objects ─────────────────────────────

const cache = new Map<string, TelaVectorObject[]>();
/** The objects the Tela doc has on page `n` (1-based) of a showcase book: same ids and labels as buildShowcaseTelaDoc. */
export function designerObjects(bookId: string, n: number): TelaVectorObject[] {
  const key = `${bookId}:${n}`;
  let v = cache.get(key);
  if (!v) {
    const b = showcaseById(bookId);
    if (!b) throw new Error(`unknown showcase book ${bookId}`);
    v = pageObjects(b.templateId, n - 1).objects;
    cache.set(key, v);
  }
  return v;
}

export interface PageKit {
  bookId: string; n: number; objs: TelaVectorObject[];
  indexOf(id: string): number;
  labelOf(id: string): string;
  /** all ids with this exact label, in z order */
  all(label: string): string[];
  /** the k-th (1-based) object with this label; throws when the designer no longer draws it */
  nth(label: string, k?: number): string;
  count(label: string): number;
  /** ids from `a` to `b` inclusive, in z order */
  span(a: string, b: string): string[];
  /** the object just below `id` in z order */
  before(id: string): string;
  after(id: string): string;
  box(ids: string[]): { x: number; y: number; w: number; h: number };
  obj(id: string): TelaVectorObject;
}

export function pageKit(bookId: string, n: number): PageKit {
  const objs = designerObjects(bookId, n);
  const idx = new Map(objs.map((o, i) => [o.id, i] as const));
  const need = (id: string) => { const i = idx.get(id); if (i === undefined) throw new Error(`${bookId} p${n}: no object ${id}`); return i; };
  const all = (label: string) => objs.filter(o => o.objectLabel === label).map(o => o.id);
  const k: PageKit = {
    bookId, n, objs,
    indexOf: need,
    labelOf: id => objs[need(id)].objectLabel ?? '',
    all,
    nth: (label, i = 1) => { const a = all(label); if (!a[i - 1]) throw new Error(`${bookId} p${n}: no ${i}th "${label}" (the designer draws ${a.length})`); return a[i - 1]; },
    count: label => all(label).length,
    span: (a, b) => objs.slice(need(a), need(b) + 1).map(o => o.id),
    before: id => objs[Math.max(0, need(id) - 1)].id,
    after: id => objs[Math.min(objs.length - 1, need(id) + 1)].id,
    box: ids => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const id of ids) { const o = objs[need(id)]; const b = bounds(o); x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1); }
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    },
    obj: id => objs[need(id)],
  };
  return k;
}

/** The designers set x/y/w/h to the shape's bounding box for every kind (paths included). */
function bounds(o: TelaVectorObject) {
  return { x0: o.x, y0: o.y, x1: o.x + o.w, y1: o.y + o.h };
}

// ───────────────────────────── paths ─────────────────────────────

export interface Pt { x: number; y: number }

/** The designers write paths as `M x y L x y ...` (polylines). Anything else is an error: the ride keyframes would be wrong. */
export function parseSvgPath(d: string): Pt[] {
  const t = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const out: Pt[] = [];
  let i = 0;
  while (i < t.length) {
    const c = t[i];
    if (c === 'M' || c === 'L') { out.push({ x: +t[i + 1], y: +t[i + 2] }); i += 3; }
    else if (c === 'Z' || c === 'z') i++;
    else throw new Error(`parseSvgPath: unsupported command ${c}`);
  }
  return out;
}
export function pathPoints(o: TelaVectorObject): Pt[] {
  const d = (o as TelaVectorObject & { svgPathData?: string }).svgPathData;
  if (d) return parseSvgPath(d);
  const p = o.points;
  if (p && p.length >= 4) return Array.from({ length: Math.floor(p.length / 2) }, (_, i) => ({ x: p[2 * i], y: p[2 * i + 1] }));
  return [];
}

/** s in 0..1 along the path by arc length. */
export function sampler(pts: Pt[]): (s: number) => Pt {
  if (pts.length < 2) throw new Error('sampler: need a path');
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const total = L[L.length - 1];
  return s => {
    const want = Math.min(1, Math.max(0, s)) * total;
    let j = 1; while (j < L.length - 1 && L[j] < want) j++;
    const f = (want - L[j - 1]) / Math.max(1e-6, L[j] - L[j - 1]);
    return { x: pts[j - 1].x + (pts[j].x - pts[j - 1].x) * f, y: pts[j - 1].y + (pts[j].y - pts[j - 1].y) * f };
  };
}
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / Math.max(1e-6, b - a))); return t * t * (3 - 2 * t); };
const r1 = (n: number) => Math.round(n * 10) / 10;

export interface RideOptions {
  /** the path to follow, s in 0..1 */
  path: (s: number) => Pt;
  /** the part of the path used: drag progress 0..1 maps to s0..s1 */
  s0?: number; s1?: number;
  /** where the ridden object's centre is at rest */
  rest: Pt;
  /** how far the drag itself has already moved the object at progress p (the ride adds only the difference) */
  drag?: (p: number) => Pt;
  /** the object glides from `rest` onto the path over the first part of the drag (0..1 of progress) */
  blend?: number;
  /** extra offset on top of the path (weaving, stitching) */
  wobble?: (p: number) => Pt;
  steps?: number;
}

/**
 * Keyframes for an `easing:'var:<progressVar>'` animation that make an object ride a path while the drag supplies only the progress.
 * Net position of the object at progress p = rest + (blend of rest and path(p)) - rest, i.e. the object sits ON the path (after `blend`).
 */
export function rideKeyframes(o: RideOptions): AnimKeyframe[] {
  const steps = o.steps ?? 16; const s0 = o.s0 ?? 0, s1 = o.s1 ?? 1; const blend = o.blend ?? 0.08;
  const out: AnimKeyframe[] = [];
  for (let i = 0; i <= steps; i++) {
    const p = i / steps;
    const P = o.path(s0 + (s1 - s0) * p);
    const b = smooth(0, blend, p);
    const w = o.wobble?.(p) ?? { x: 0, y: 0 };
    const net = { x: o.rest.x + (P.x - o.rest.x) * b + w.x, y: o.rest.y + (P.y - o.rest.y) * b + w.y };
    const d = o.drag?.(p) ?? { x: 0, y: 0 };
    out.push({ at: p, x: r1(net.x - o.rest.x - d.x), y: r1(net.y - o.rest.y - d.y) });
  }
  return out;
}

export const center = (b: { x: number; y: number; w: number; h: number }): Pt => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

// ───────────────────────────── behaviours ─────────────────────────────

export const bhv = (id: string, target: Target, on: Trigger, doing: Action[], extra: Partial<Behavior> = {}): Behavior => ({ id, target, on, do: doing, ...extra });

export const gt = (name: string, value: Scalar): Cond => ({ var: name, op: '>=', value });
export const lt = (name: string, value: Scalar): Cond => ({ var: name, op: '<', value });
export const eq = (name: string, value: Scalar): Cond => ({ var: name, op: '==', value });
export const allOf = (...c: Cond[]): Cond => ({ all: c });
/** a band of a 0..1 variable: lo <= name < hi */
export const band = (name: string, lo: number, hi: number): Cond => allOf(gt(name, lo), lt(name, hi));

/** Actions that move things or throw particles: dropped for the reduced-motion twin of a behaviour. */
const MOTION = new Set(['animate', 'burst', 'trail', 'follow']);
export function withoutMotion(actions: Action[]): Action[] {
  return actions.flatMap((a): Action[] => {
    if (MOTION.has(a.do)) return [];
    if (a.do === 'if') return [{ ...a, then: withoutMotion(a.then), else: a.else ? withoutMotion(a.else) : undefined }];
    return [a];
  });
}
export function hasMotion(actions: Action[]): boolean {
  return actions.some(a => MOTION.has(a.do) || (a.do === 'if' && (hasMotion(a.then) || hasMotion(a.else ?? []))));
}

export interface NarrationOptions { voice?: string; rate?: number }
/** Narration from the spread text: the book's own words, line breaks as spaces. */
export function spreadNarration(bookId: string, n: number, o: NarrationOptions = {}): Narration {
  const s = showcaseById(bookId)?.spreads[n - 1];
  if (!s) throw new Error(`${bookId}: no spread ${n}`);
  return { text: s.text.replace(/\s+/g, ' ').trim(), voice: o.voice ?? 'aria', rate: o.rate ?? 0.9 };
}
