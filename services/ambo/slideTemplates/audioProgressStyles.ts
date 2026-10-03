// audioProgressStyles — the animated "how far through are we" treatments for
// Audio slides. Each style plays out over the file's length and settles on a
// finished state at the end (full bar, sun set, candle out, circle closed).
//
// Every style draws inside any box: wide boxes get a horizontal layout, square
// ones a stacked one (shape above, times below), so designers allocate one
// readout box and the operator can switch styles freely.
//
// The maths at the top is pure and unit-tested; the painters below only read it.
import { formatClock } from './transcriptParse';

export const PROGRESS_STYLES = [
  'bar', 'counter', 'countdown', 'journey', 'vessel', 'sunrise', 'candle',
  'orbit', 'vu', 'thread', 'chapters', 'tape', 'hourglass',
] as const;
export type ProgressStyle = typeof PROGRESS_STYLES[number];

export const PROGRESS_LABELS: Record<ProgressStyle, string> = {
  bar: 'Progress bar', counter: 'Ticking counter', countdown: 'Countdown numerals', journey: 'Journey line',
  vessel: 'Filling vessel', sunrise: 'Sun arc', candle: 'Candle burning down', orbit: 'Orbit ring',
  vu: 'Segmented VU', thread: 'Stitched thread', chapters: 'Chapter ticks', tape: 'Tape reels', hourglass: 'Hourglass',
};

export const isProgressStyle = (s: string): s is ProgressStyle => (PROGRESS_STYLES as readonly string[]).includes(s);

/** Theme → the treatment that speaks its language (used when a template's style is 'auto'). */
const THEME_STYLE: Record<string, ProgressStyle> = {
  sanctuary: 'chapters', neodeco: 'sunrise', airy: 'sunrise', quiet: 'sunrise',
  candlelight: 'candle', spotlight: 'candle', colorfield: 'vessel', ribbon: 'journey',
  night: 'orbit', kinetic: 'orbit', mesh: 'orbit', gengrid: 'vu', monoblue: 'orbit', glass: 'vessel',
  youth: 'vu', stickers: 'vu', stencil: 'vu', neonbrick: 'vu', nightcity: 'vu', vhs: 'tape',
  zine: 'tape', halftone: 'tape', misprint: 'tape', riso: 'vessel', memphis: 'orbit', atomic: 'orbit',
  editorial: 'thread', cutpaper: 'thread', ducttape: 'thread', wheatpaste: 'thread', terrazzo: 'vessel', truchet: 'journey',
  minimal: 'bar', swiss: 'counter', datapoem: 'counter', brutalist: 'counter', deconstruct: 'journey',
  bauhaus: 'vu', destijl: 'vu', constructivist: 'chapters', suprematist: 'journey', chalk: 'journey', concrete: 'chapters',
};

/**
 * The style to draw: an explicit field choice wins; 'auto' takes the theme's
 * own treatment when the template allows it, else the template's first choice.
 */
export function resolveProgressStyle(field: string | undefined, candidates: ProgressStyle[], themeId: string): ProgressStyle {
  const f = (field || '').trim().toLowerCase();
  if (isProgressStyle(f)) return f;
  const pref = THEME_STYLE[themeId];
  return pref && candidates.includes(pref) ? pref : candidates[0] || 'bar';
}

// ── pure maths ───────────────────────────────────────────────────────────────
const clamp01 = (v: number) => v < 0 ? 0 : v > 1 ? 1 : (v || 0);

/** Fraction played of [startSec, dur]; 0 when the duration is unknown. */
export function progressAt(pos: number, startSec: number, dur: number): number {
  if (!(dur > startSec)) return 0;
  return clamp01((pos - startSec) / (dur - startSec));
}

/** Segments for a VU / block meter: how many are fully lit and the lead's partial 0..1. */
export function litSegments(p: number, n: number): { full: number; partial: number } {
  const v = clamp01(p) * n;
  const full = Math.min(n, Math.floor(v + 1e-9));
  return { full, partial: full >= n ? 0 : v - full };
}

/** Point at fraction p along an arc from a0 to a1 (radians). */
export function arcPoint(p: number, cx: number, cy: number, r: number, a0: number, a1: number): { x: number; y: number; a: number } {
  const a = a0 + (a1 - a0) * clamp01(p);
  return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, a };
}

/** Cumulative lengths of a polyline [x0,y0,x1,y1,…]. */
export function polyLengths(pts: number[]): number[] {
  const out = [0];
  for (let i = 2; i < pts.length; i += 2) out.push(out[out.length - 1] + Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]));
  return out;
}
/** Point at fraction p of a polyline's arc length. */
export function pointAlong(pts: number[], p: number, lens = polyLengths(pts)): { x: number; y: number; ang: number } {
  const total = lens[lens.length - 1] || 0, target = clamp01(p) * total;
  let i = 1;
  while (i < lens.length - 1 && lens[i] < target) i++;
  const seg = Math.max(1e-6, lens[i] - lens[i - 1]), k = clamp01((target - lens[i - 1]) / seg);
  const x0 = pts[(i - 1) * 2], y0 = pts[(i - 1) * 2 + 1], x1 = pts[i * 2] ?? x0, y1 = pts[i * 2 + 1] ?? y0;
  return { x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k, ang: Math.atan2(y1 - y0, x1 - x0) };
}

/** A gently winding route across a box (seeded) — the journey line. */
export function journeyRoute(x: number, y: number, w: number, h: number, seed: number, n = 48): number[] {
  const pts: number[] = [];
  const a = .5 + ((seed * 9301 + 49297) % 233280) / 233280 * .8, ph = seed % 7;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const wave = Math.sin(t * Math.PI * (2 + a) + ph) * .62 + Math.sin(t * Math.PI * 5.3 + ph * 2) * .18;
    pts.push(x + w * t, y + h / 2 + wave * h * .5 * Math.sin(Math.PI * Math.min(1, t * 1.15 + .05)));
  }
  return pts;
}

/**
 * Chapter boundaries as fractions of the file: from transcript cue starts when
 * there are a few, else evenly into `fallback` parts.
 */
export function chapterMarks(starts: number[], startSec: number, dur: number, fallback = 5, max = 9): number[] {
  const span = dur - startSec;
  if (span > 0 && starts.length >= 2 && starts.length <= max) {
    const f = starts.map(s => (s - startSec) / span).filter(v => v > .015 && v < .985);
    return [...new Set(f.map(v => Math.round(v * 1000) / 1000))].sort((a, b) => a - b);
  }
  return Array.from({ length: fallback - 1 }, (_, i) => (i + 1) / fallback);
}
/** Which chapter (0-based) a fraction falls in, and how far through it. */
export function chapterAt(marks: number[], p: number): { index: number; within: number; count: number } {
  const edges = [0, ...marks, 1];
  let i = 0;
  while (i < edges.length - 2 && p >= edges[i + 1]) i++;
  return { index: i, within: clamp01((p - edges[i]) / Math.max(1e-6, edges[i + 1] - edges[i])), count: edges.length - 1 };
}

/** Elapsed / remaining read-outs. Remaining shows "−0:00" at the end, "--:--" when unknown. */
export function timeTexts(elapsed: number, remaining: number, known: boolean): { el: string; rem: string; total: string } {
  return { el: formatClock(elapsed), rem: known ? `−${formatClock(Math.ceil(Math.max(0, remaining) - 1e-6))}` : '−‒:‒‒', total: known ? formatClock(elapsed + remaining) : '‒:‒‒' };
}

// ── painting ─────────────────────────────────────────────────────────────────
type Ctx = CanvasRenderingContext2D;

export interface ProgressPaint {
  ink: string; muted: string; accent: string; accent2: string; accent3: string; ground: string; dark: boolean;
  /** CSS families / weights for the small labels and the numerals. */
  label: string; labelWeight: number; num: string; numWeight: number; numItalic: boolean;
  /** Layout unit of the slide (px). */
  u: number;
}
export interface ProgressState {
  p: number; elapsed: number; remaining: number; known: boolean;
  ended: boolean; playing: boolean;
  /** Live loudness 0..1 (0 when not available). */
  level: number;
  /** Ambient clock (s) for idle motion. */
  t: number;
  /** Seconds since the file ended (settle animations), else 0. */
  endedFor: number;
  chapters: number[];
}

export function rgba(color: string, a: number): string {
  const m = (color || '').replace('#', '');
  if (/^[0-9a-f]{6}$/i.test(m)) return `rgba(${parseInt(m.slice(0, 2), 16)},${parseInt(m.slice(2, 4), 16)},${parseInt(m.slice(4, 6), 16)},${a})`;
  if (/^[0-9a-f]{3}$/i.test(m)) return `rgba(${parseInt(m[0] + m[0], 16)},${parseInt(m[1] + m[1], 16)},${parseInt(m[2] + m[2], 16)},${a})`;
  return color;
}
const hash1 = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const TAU = Math.PI * 2;

function label(ctx: Ctx, s: string, x: number, y: number, size: number, P: ProgressPaint, color: string, align: CanvasTextAlign = 'left', maxW?: number) {
  ctx.font = `${P.labelWeight} ${Math.max(6, size)}px ${P.label}`;
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
  if ('letterSpacing' in ctx) (ctx as any).letterSpacing = `${(size * .06).toFixed(1)}px`;
  ctx.fillText(s, x, y, maxW);
  if ('letterSpacing' in ctx) (ctx as any).letterSpacing = '0px';
}
function numFont(P: ProgressPaint, size: number) { return `${P.numItalic ? 'italic ' : ''}${P.numWeight} ${Math.max(6, size)}px ${P.num}`; }

/** Times under/beside a shape: elapsed left, remaining right. */
function timesRow(ctx: Ctx, x: number, y: number, w: number, size: number, s: ProgressState, P: ProgressPaint) {
  const tt = timeTexts(s.elapsed, s.remaining, s.known);
  label(ctx, tt.el, x, y, size, P, P.ink, 'left');
  label(ctx, s.ended ? tt.total : tt.rem, x + w, y, size, P, P.muted, 'right');
}
/** Big elapsed numerals with a rolling change on each new second. */
function rollingNumerals(ctx: Ctx, str: string, prev: string, frac: number, x: number, cy: number, size: number, P: ProgressPaint, color: string, align: 'left' | 'center' | 'right') {
  ctx.font = numFont(P, size); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const dig = ctx.measureText('0').width, colon = ctx.measureText(':').width;
  const adv = (ch: string) => /\d/.test(ch) ? dig : ch === ':' ? colon : ctx.measureText(ch).width;
  const total = Array.from(str).reduce((a, ch) => a + adv(ch), 0);
  let px = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  const roll = frac < .22 ? 1 - frac / .22 : 0;
  const pad = prev.padStart(str.length, ' ');
  Array.from(str).forEach((ch, i) => {
    const changed = roll > 0 && pad[i] !== ch;
    const a = adv(ch);
    if (changed) {
      ctx.save();
      ctx.beginPath(); ctx.rect(px - 2, cy - size * .62, a + 4, size * 1.24); ctx.clip();
      const e = roll * roll;
      if (pad[i].trim()) { ctx.fillStyle = rgba(color, e); ctx.fillText(pad[i], px, cy - size * .9 * (1 - e)); }
      ctx.fillStyle = color; ctx.fillText(ch, px, cy + size * .9 * e);
      ctx.restore();
    } else { ctx.fillStyle = color; ctx.fillText(ch, px, cy); }
    px += a;
  });
  return total;
}

function rail(ctx: Ctx, x: number, y: number, w: number, th: number, p: number, P: ProgressPaint, knob = true) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgba(P.muted, P.dark ? .28 : .3); ctx.lineWidth = th;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke();
  if (p > 0) {
    const g = ctx.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, P.accent2); g.addColorStop(1, P.accent);
    ctx.strokeStyle = g; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.max(.5, w * p), y); ctx.stroke();
  }
  if (knob) {
    const kx = x + w * p;
    ctx.fillStyle = rgba(P.accent, .25); ctx.beginPath(); ctx.arc(kx, y, th * 2.4, 0, TAU); ctx.fill();
    ctx.fillStyle = P.accent; ctx.beginPath(); ctx.arc(kx, y, th * 1.25, 0, TAU); ctx.fill();
  }
}

// Each painter: (ctx, x, y, w, h, state, paint, seed)
type Painter = (ctx: Ctx, x: number, y: number, w: number, h: number, s: ProgressState, P: ProgressPaint, seed: number) => void;

const bar: Painter = (ctx, x, y, w, h, s, P) => {
  const ls = Math.min(h * .28, P.u * 1.5), th = Math.max(2, Math.min(h * .12, P.u * .55));
  const cy = y + h * .4;
  rail(ctx, x + th * 2.4, cy, w - th * 4.8, th, s.p, P);
  timesRow(ctx, x, Math.min(y + h - ls * .6, cy + th * 3 + ls * .7), w, ls, s, P);
};

const counter: Painter = (ctx, x, y, w, h, s, P) => {
  const wide = w / h > 2.2;
  const el = formatClock(s.elapsed), prev = formatClock(s.elapsed - 1), frac = s.playing ? s.elapsed - Math.floor(s.elapsed) : 1;
  const tt = timeTexts(s.elapsed, s.remaining, s.known);
  if (wide) {
    const size = Math.min(h * .78, w * .2);
    const used = rollingNumerals(ctx, el, prev, frac, x, y + h * .42, size, P, P.ink, 'left');
    const lx = x + used + P.u * 1.6, ls = Math.min(h * .2, P.u * 1.4);
    label(ctx, s.known ? `of ${tt.total}` : 'elapsed', lx, y + h * .26, ls, P, P.muted, 'left');
    label(ctx, s.ended ? 'complete' : tt.rem, lx, y + h * .52, ls, P, P.accent, 'left');
    rail(ctx, x, y + h * .9, w, Math.max(2, P.u * .22), s.p, P, false);
  } else {
    const size = Math.min(h * .42, w * .3);
    rollingNumerals(ctx, el, prev, frac, x + w / 2, y + h * .38, size, P, P.ink, 'center');
    const ls = Math.min(h * .1, P.u * 1.4);
    label(ctx, s.ended ? `${tt.total} · complete` : `${tt.rem}  ·  of ${tt.total}`, x + w / 2, y + h * .68, ls, P, P.muted, 'center', w);
    rail(ctx, x + w * .1, y + h * .86, w * .8, Math.max(2, P.u * .22), s.p, P, false);
  }
};

const countdown: Painter = (ctx, x, y, w, h, s, P) => {
  const remain = s.known ? Math.max(0, s.remaining) : 0;
  const str = s.ended || !s.known ? (s.ended ? '0:00' : '‒:‒‒') : formatClock(Math.ceil(remain - 1e-6));
  const prev = s.known ? formatClock(Math.ceil(remain - 1e-6) + 1) : str;
  const frac = s.playing ? 1 - (remain - Math.floor(remain)) : 1;
  const wide = w / h > 1.6;
  if (wide) {
    const size = Math.min(h * .7, w * .22);
    const used = rollingNumerals(ctx, str, prev, frac === 1 ? 1 : frac, x, y + h * .42, size, P, P.ink, 'left');
    // Depleting bar: the time still to go, shrinking toward the numerals.
    const bx = x + used + P.u * 2, bw = Math.max(0, x + w - bx), th = Math.max(3, P.u * .5);
    ctx.lineCap = 'round';
    ctx.strokeStyle = rgba(P.muted, .25); ctx.lineWidth = th; ctx.beginPath(); ctx.moveTo(bx, y + h * .42); ctx.lineTo(bx + bw, y + h * .42); ctx.stroke();
    if (s.p < 1) { ctx.strokeStyle = P.accent; ctx.beginPath(); ctx.moveTo(bx, y + h * .42); ctx.lineTo(bx + bw * (1 - s.p), y + h * .42); ctx.stroke(); }
    label(ctx, s.ended ? 'it is time' : 'remaining', bx, y + h * .78, Math.min(h * .18, P.u * 1.4), P, P.muted, 'left');
    return;
  }
  const r = Math.min(w, h) * .44, cx = x + w / 2, cy = y + h / 2;
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgba(P.muted, .22); ctx.lineWidth = Math.max(3, r * .06); ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
  if (s.p < 1) { ctx.strokeStyle = P.accent; ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2 + TAU * s.p, -Math.PI / 2 + TAU); ctx.stroke(); }
  // Ticks: one per tenth.
  for (let i = 0; i < 60; i++) {
    const a = -Math.PI / 2 + TAU * i / 60, big = i % 6 === 0, lit = i / 60 >= s.p;
    ctx.strokeStyle = rgba(lit ? P.accent : P.muted, lit ? .7 : .25); ctx.lineWidth = Math.max(1, r * (big ? .02 : .01));
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r * .84, cy + Math.sin(a) * r * .84); ctx.lineTo(cx + Math.cos(a) * r * (big ? .76 : .8), cy + Math.sin(a) * r * (big ? .76 : .8)); ctx.stroke();
  }
  rollingNumerals(ctx, str, prev, frac, cx, cy - r * .04, r * .46, P, P.ink, 'center');
  label(ctx, s.ended ? 'it is time' : 'remaining', cx, cy + r * .42, r * .12, P, P.muted, 'center');
};

const routeCache = new Map<string, { pts: number[]; lens: number[] }>();
const journey: Painter = (ctx, x, y, w, h, s, P, seed) => {
  const ls = Math.min(h * .2, P.u * 1.4), pad = P.u * 1.2;
  const ry = y + pad * .4, rh = h - ls * 2.4 - pad * .4, rx = x + pad, rw = w - pad * 2;
  const key = `${Math.round(rx)},${Math.round(ry)},${Math.round(rw)},${Math.round(rh)},${seed}`;
  let R = routeCache.get(key);
  if (!R) { const pts = journeyRoute(rx, ry, rw, rh, seed); R = { pts, lens: polyLengths(pts) }; if (routeCache.size > 40) routeCache.clear(); routeCache.set(key, R); }
  const total = R.lens[R.lens.length - 1], lw = Math.max(2, P.u * .28);
  const trace = () => { ctx.beginPath(); ctx.moveTo(R!.pts[0], R!.pts[1]); for (let i = 2; i < R!.pts.length; i += 2) ctx.lineTo(R!.pts[i], R!.pts[i + 1]); };
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.setLineDash([lw * .2, lw * 2.6]); ctx.strokeStyle = rgba(P.muted, .55); ctx.lineWidth = lw; trace(); ctx.stroke();
  ctx.setLineDash([Math.max(.01, total * s.p), total + 10]); ctx.strokeStyle = P.accent; ctx.lineWidth = lw * 1.25; trace(); ctx.stroke();
  ctx.setLineDash([]);
  // Start post and destination.
  const end = pointAlong(R.pts, 1, R.lens);
  ctx.fillStyle = P.accent; ctx.beginPath(); ctx.arc(R.pts[0], R.pts[1], lw * 1.3, 0, TAU); ctx.fill();
  ctx.strokeStyle = s.ended ? P.accent : rgba(P.ink, .75); ctx.lineWidth = lw * .7;
  ctx.beginPath(); ctx.arc(end.x, end.y, lw * 2.6, 0, TAU); ctx.stroke();
  if (s.ended) { ctx.fillStyle = P.accent; ctx.beginPath(); ctx.arc(end.x, end.y, lw * 1.5, 0, TAU); ctx.fill(); }
  // Traveller with a breathing halo.
  const q = pointAlong(R.pts, s.p, R.lens), br = .5 + .5 * Math.sin(s.t * 3);
  if (!s.ended) {
    ctx.fillStyle = rgba(P.accent, .18 + .12 * br); ctx.beginPath(); ctx.arc(q.x, q.y, lw * (3 + br * 1.2 + s.level * 3), 0, TAU); ctx.fill();
    ctx.fillStyle = P.ink; ctx.beginPath(); ctx.arc(q.x, q.y, lw * 1.35, 0, TAU); ctx.fill();
  }
  timesRow(ctx, x, y + h - ls * .8, w, ls, s, P);
};

function vesselPath(ctx: Ctx, cx: number, top: number, bw: number, bh: number) {
  // A rounded jar: lip, shoulders, belly, flat foot.
  const lip = bw * .36, belly = bw * .5, foot = bw * .3;
  ctx.beginPath();
  ctx.moveTo(cx - lip, top);
  ctx.lineTo(cx + lip, top);
  ctx.bezierCurveTo(cx + lip, top + bh * .12, cx + belly * 1.04, top + bh * .2, cx + belly, top + bh * .55);
  ctx.bezierCurveTo(cx + belly * .96, top + bh * .86, cx + foot * 1.3, top + bh, cx + foot, top + bh);
  ctx.lineTo(cx - foot, top + bh);
  ctx.bezierCurveTo(cx - foot * 1.3, top + bh, cx - belly * .96, top + bh * .86, cx - belly, top + bh * .55);
  ctx.bezierCurveTo(cx - belly * 1.04, top + bh * .2, cx - lip, top + bh * .12, cx - lip, top);
  ctx.closePath();
}
/** Shape box + times placement shared by the square-ish styles. */
function shapeBox(x: number, y: number, w: number, h: number, P: ProgressPaint) {
  const wide = w / h > 1.8;
  if (wide) { const s = h; return { sx: x, sy: y, ss: s, tx: x + s + P.u * 1.6, tw: w - s - P.u * 1.6, wide, ty: y + h / 2 }; }
  const ls = Math.min(h * .1, P.u * 1.4), s = Math.min(w, h - ls * 2.6);
  return { sx: x + (w - s) / 2, sy: y, ss: s, tx: x, tw: w, wide, ty: y + s + ls * 1.4 };
}
function sideTimes(ctx: Ctx, b: ReturnType<typeof shapeBox>, s: ProgressState, P: ProgressPaint, h: number, title?: string) {
  const tt = timeTexts(s.elapsed, s.remaining, s.known);
  if (b.wide) {
    const big = Math.min(h * .34, b.tw * .22), ls = Math.min(h * .14, P.u * 1.4);
    ctx.font = numFont(P, big); ctx.fillStyle = P.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(tt.el, b.tx, b.ty - big * .3, b.tw);
    label(ctx, s.ended ? (title || 'complete') : `${tt.rem}  ·  ${tt.total}`, b.tx, b.ty + big * .5, ls, P, P.muted, 'left', b.tw);
  } else {
    timesRow(ctx, b.tx + b.tw * .08, b.ty, b.tw * .84, Math.min(h * .1, P.u * 1.4), s, P);
  }
}

const vessel: Painter = (ctx, x, y, w, h, s, P) => {
  const b = shapeBox(x, y, w, h, P);
  const bw = b.ss * .7, bh = b.ss * .86, cx = b.sx + b.ss / 2, top = b.sy + b.ss * .07;
  const level = top + bh * (1 - s.p * .97) - bh * .015;
  ctx.save();
  vesselPath(ctx, cx, top, bw, bh); ctx.clip();
  ctx.fillStyle = rgba(P.muted, P.dark ? .12 : .1); ctx.fillRect(cx - bw, top, bw * 2, bh);
  // Liquid with a travelling surface; calmer as it fills, still at the end.
  const amp = bh * .025 * (s.ended ? Math.max(0, 1 - s.endedFor / 1.5) : 1) * (1 + s.level * 1.5);
  const g = ctx.createLinearGradient(0, level, 0, top + bh); g.addColorStop(0, P.accent); g.addColorStop(1, P.accent2);
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(cx - bw, top + bh + 2);
  for (let i = 0; i <= 40; i++) { const px = cx - bw / 2 - bw * .1 + (bw * 1.2) * i / 40; ctx.lineTo(px, level + Math.sin(i * .5 + s.t * 2.4) * amp + Math.sin(i * .23 - s.t * 1.3) * amp * .6); }
  ctx.lineTo(cx + bw, top + bh + 2); ctx.closePath(); ctx.fill();
  // Rising bubbles.
  if (!s.ended) for (let i = 0; i < 6; i++) {
    const ph = (s.t * .35 + hash1(i)) % 1, bx = cx + (hash1(i + 9) - .5) * bw * .6, by = top + bh - ph * (top + bh - level);
    ctx.fillStyle = rgba(P.ink, .25 * (1 - ph)); ctx.beginPath(); ctx.arc(bx, by, bw * .018, 0, TAU); ctx.fill();
  }
  ctx.restore();
  vesselPath(ctx, cx, top, bw, bh); ctx.strokeStyle = rgba(P.ink, .7); ctx.lineWidth = Math.max(1.5, b.ss * .014); ctx.stroke();
  // Measure marks.
  for (let i = 1; i < 4; i++) { const my = top + bh * (1 - i / 4); ctx.strokeStyle = rgba(P.ink, .35); ctx.lineWidth = Math.max(1, b.ss * .006); ctx.beginPath(); ctx.moveTo(cx + bw * .38, my); ctx.lineTo(cx + bw * .46, my); ctx.stroke(); }
  sideTimes(ctx, b, s, P, h, 'full');
};

const sunrise: Painter = (ctx, x, y, w, h, s, P) => {
  const ls = Math.min(h * .14, P.u * 1.4);
  const r = Math.min(w * .44, (h - ls * 2.2) * .9), cx = x + w / 2, hy = y + r * 1.04 + ls * .2;
  // Sky warmth grows toward noon and softens to dusk.
  const warm = Math.sin(Math.PI * s.p);
  const sky = ctx.createRadialGradient(cx, hy, 0, cx, hy, r * 1.2);
  sky.addColorStop(0, rgba(P.accent, .1 + .18 * warm)); sky.addColorStop(1, rgba(P.accent, 0));
  ctx.fillStyle = sky; ctx.beginPath(); ctx.rect(x, y, w, hy - y); ctx.fill();
  ctx.lineCap = 'round';
  ctx.setLineDash([Math.max(1, r * .01), Math.max(3, r * .05)]); ctx.strokeStyle = rgba(P.muted, .6); ctx.lineWidth = Math.max(1.5, r * .016);
  ctx.beginPath(); ctx.arc(cx, hy, r, Math.PI, TAU); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = P.accent; ctx.lineWidth = Math.max(2, r * .022);
  ctx.beginPath(); ctx.arc(cx, hy, r, Math.PI, Math.PI + Math.PI * s.p); ctx.stroke();
  // Horizon.
  ctx.strokeStyle = rgba(P.ink, .7); ctx.lineWidth = Math.max(1.5, r * .012);
  ctx.beginPath(); ctx.moveTo(x + w * .02, hy); ctx.lineTo(x + w * .98, hy); ctx.stroke();
  const q = arcPoint(s.p, cx, hy, r, Math.PI, TAU), sr = r * .1;
  ctx.save(); ctx.beginPath(); ctx.rect(x - r, y - r, w + r * 2, hy - y + r + .5); ctx.clip();
  // Rays turn slowly; the sun sets into the horizon at the end.
  ctx.strokeStyle = rgba(P.accent, .55); ctx.lineWidth = Math.max(1, sr * .14);
  for (let i = 0; i < 12; i++) { const a = s.t * .25 + TAU * i / 12; ctx.beginPath(); ctx.moveTo(q.x + Math.cos(a) * sr * 1.5, q.y + Math.sin(a) * sr * 1.5); ctx.lineTo(q.x + Math.cos(a) * sr * (2 + .3 * Math.sin(s.t * 2 + i)), q.y + Math.sin(a) * sr * (2 + .3 * Math.sin(s.t * 2 + i))); ctx.stroke(); }
  const sun = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, sr * 2.4);
  sun.addColorStop(0, rgba(P.accent, .45)); sun.addColorStop(1, rgba(P.accent, 0));
  ctx.fillStyle = sun; ctx.beginPath(); ctx.arc(q.x, q.y, sr * 2.4, 0, TAU); ctx.fill();
  ctx.fillStyle = P.accent; ctx.beginPath(); ctx.arc(q.x, q.y, sr, 0, TAU); ctx.fill();
  ctx.restore();
  timesRow(ctx, x + w * .02, hy + ls * 1.2, w * .96, ls, s, P);
};

const candle: Painter = (ctx, x, y, w, h, s, P) => {
  const b = shapeBox(x, y, w, h, P);
  const cw = b.ss * .2, cx = b.sx + b.ss / 2, base = b.sy + b.ss * .96;
  const full = b.ss * .62, stub = b.ss * .1, ch = full - (full - stub) * s.p, top = base - ch;
  // Holder.
  ctx.fillStyle = rgba(P.ink, .55);
  ctx.beginPath(); ctx.ellipse(cx, base, cw * 1.5, cw * .26, 0, 0, TAU); ctx.fill();
  // Wax body with a soft side light, and a drip that grows as it burns.
  const g = ctx.createLinearGradient(cx - cw / 2, 0, cx + cw / 2, 0);
  g.addColorStop(0, P.dark ? '#E9DCC4' : '#F5EDE0'); g.addColorStop(.6, P.dark ? '#FFF6E6' : '#FFFFFF'); g.addColorStop(1, P.dark ? '#C9B79A' : '#DDD2C0');
  ctx.fillStyle = g; ctx.beginPath(); ctx.rect(cx - cw / 2, top, cw, ch); ctx.fill();
  ctx.fillStyle = P.dark ? '#F3E8D2' : '#EFE5D5';
  ctx.beginPath(); ctx.ellipse(cx, top, cw / 2, cw * .1, 0, 0, TAU); ctx.fill();
  const drip = Math.min(ch * .7, b.ss * .02 + s.p * b.ss * .14);
  ctx.beginPath(); ctx.moveTo(cx + cw * .18, top); ctx.lineTo(cx + cw * .34, top); ctx.lineTo(cx + cw * .34, top + drip); ctx.arc(cx + cw * .26, top + drip, cw * .08, 0, Math.PI); ctx.closePath(); ctx.fill();
  // Wick.
  ctx.strokeStyle = rgba('#2A2018', .9); ctx.lineWidth = Math.max(1, cw * .05);
  ctx.beginPath(); ctx.moveTo(cx, top); ctx.lineTo(cx + cw * .03, top - b.ss * .035); ctx.stroke();
  const fy = top - b.ss * .035;
  if (!s.ended) {
    const fl = 1 + .12 * Math.sin(s.t * 13) + .08 * Math.sin(s.t * 23 + 1) + s.level * .3, sway = Math.sin(s.t * 3.1) * cw * .06;
    const fh = b.ss * .16 * fl, fw = cw * .34;
    const glow = ctx.createRadialGradient(cx, fy - fh * .4, 0, cx, fy - fh * .4, b.ss * .42);
    glow.addColorStop(0, rgba(P.accent, .35)); glow.addColorStop(1, rgba(P.accent, 0));
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, fy - fh * .4, b.ss * .42, 0, TAU); ctx.fill();
    const fg = ctx.createLinearGradient(0, fy, 0, fy - fh);
    fg.addColorStop(0, '#FFF3C4'); fg.addColorStop(.5, '#FFC24A'); fg.addColorStop(1, rgba('#FF8A2A', .2));
    ctx.fillStyle = fg; ctx.beginPath();
    ctx.moveTo(cx, fy + fw * .2);
    ctx.bezierCurveTo(cx + fw, fy, cx + fw * .5 + sway, fy - fh * .6, cx + sway * 2, fy - fh);
    ctx.bezierCurveTo(cx - fw * .5 + sway, fy - fh * .6, cx - fw, fy, cx, fy + fw * .2);
    ctx.fill();
  } else {
    // Out: a wisp of smoke curling up, then gone.
    const k = Math.min(1, s.endedFor / 4);
    ctx.strokeStyle = rgba(P.muted, .5 * (1 - k)); ctx.lineWidth = Math.max(1, cw * .06);
    ctx.beginPath(); ctx.moveTo(cx, fy);
    for (let i = 1; i <= 16; i++) { const t = i / 16; ctx.lineTo(cx + Math.sin(t * 6 + s.t * 1.5) * cw * .25 * t, fy - t * b.ss * (.18 + k * .2)); }
    ctx.stroke();
  }
  sideTimes(ctx, b, s, P, h, 'complete');
};

const orbit: Painter = (ctx, x, y, w, h, s, P) => {
  const b = shapeBox(x, y, w, h, P);
  const cx = b.sx + b.ss / 2, cy = b.sy + b.ss / 2, r = b.ss * .4, lw = Math.max(2, r * .045);
  const a0 = -Math.PI / 2, a = a0 + TAU * s.p;
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgba(P.muted, .25); ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
  // Comet trail: fades behind the moving body.
  const trail = Math.min(s.p * TAU, 1.2);
  for (let i = 0; i < 18; i++) {
    const k = i / 18, aa = a - trail * k;
    ctx.strokeStyle = rgba(P.accent, (1 - k) * .5); ctx.lineWidth = lw * (1.8 - k);
    ctx.beginPath(); ctx.arc(cx, cy, r, aa - trail / 18, aa); ctx.stroke();
  }
  ctx.strokeStyle = P.accent; ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(cx, cy, r, a0, a); ctx.stroke();
  // Inner ring pulses with the audio.
  ctx.strokeStyle = rgba(P.accent2, .35 + s.level * .5); ctx.lineWidth = Math.max(1, lw * .4);
  ctx.beginPath(); ctx.arc(cx, cy, r * (.8 + s.level * .05), 0, TAU); ctx.stroke();
  const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
  ctx.fillStyle = rgba(P.accent, .25); ctx.beginPath(); ctx.arc(px, py, lw * 3.2, 0, TAU); ctx.fill();
  ctx.fillStyle = s.ended ? P.accent : P.ink; ctx.beginPath(); ctx.arc(px, py, lw * 1.5, 0, TAU); ctx.fill();
  // Centre read-out.
  const tt = timeTexts(s.elapsed, s.remaining, s.known);
  ctx.font = numFont(P, r * .36); ctx.fillStyle = P.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(tt.el, cx, cy - r * .06, r * 1.4);
  label(ctx, s.ended ? 'complete' : tt.rem, cx, cy + r * .32, r * .13, P, P.muted, 'center', r * 1.3);
  if (b.wide) label(ctx, `of ${tt.total}`, b.tx, b.ty, Math.min(h * .16, P.u * 1.5), P, P.muted, 'left', b.tw);
};

const vu: Painter = (ctx, x, y, w, h, s, P) => {
  const wide = w / h > 1.4, ls = Math.min(h * .2, P.u * 1.4);
  const mx = x, mw = wide ? w : w, my = y, mh = wide ? h - ls * 2.2 : h * .7;
  const n = Math.max(10, Math.min(48, Math.round(mw / Math.max(P.u * 1.2, mh * .5)))), gap = mw / n * .22, sw = mw / n - gap;
  const { full, partial } = litSegments(s.p, n);
  for (let i = 0; i < n; i++) {
    const sx = mx + i * (sw + gap) + gap / 2;
    const lit = i < full, lead = i === full && !s.ended;
    const hot = i / n > .82;
    const col = hot ? P.accent2 : P.accent;
    // Lit blocks bounce with the music; the lead block fills as time passes.
    const bounce = lit ? 1 - .25 * Math.max(0, s.level - hash1(i + Math.floor(s.t * 8)) * .6) : 1;
    const bh = mh * bounce, by = my + (mh - bh);
    ctx.fillStyle = rgba(P.muted, P.dark ? .16 : .14); ctx.fillRect(sx, my, sw, mh);
    if (lit) { ctx.fillStyle = col; ctx.fillRect(sx, by, sw, bh); }
    else if (lead) { ctx.fillStyle = rgba(col, .35 + .4 * (.5 + .5 * Math.sin(s.t * 6))); ctx.fillRect(sx, my + mh * (1 - partial), sw, mh * partial); }
  }
  if (wide) timesRow(ctx, x, y + h - ls * .7, w, ls, s, P);
  else timesRow(ctx, x, y + h * .86, w, Math.min(h * .1, P.u * 1.4), s, P);
};

const thread: Painter = (ctx, x, y, w, h, s, P, seed) => {
  const ls = Math.min(h * .2, P.u * 1.4), cy = y + (h - ls * 2) * .5, sl = Math.max(P.u * 1.1, w / 48), lw = Math.max(1.5, P.u * .24);
  const n = Math.floor(w / (sl * 1.7));
  // Seam: a faint dotted guide the stitches follow (a slight wave).
  const yAt = (px: number) => cy + Math.sin((px - x) / w * Math.PI * 2 + seed) * h * .06;
  ctx.fillStyle = rgba(P.muted, .4);
  for (let i = 0; i <= n * 2; i++) { const px = x + w * i / (n * 2); ctx.beginPath(); ctx.arc(px, yAt(px), lw * .3, 0, TAU); ctx.fill(); }
  const head = x + w * s.p;
  ctx.lineCap = 'round'; ctx.strokeStyle = P.accent; ctx.lineWidth = lw;
  for (let i = 0; i < n; i++) {
    const sx = x + i * sl * 1.7, ex = Math.min(sx + sl, head);
    if (ex <= sx) break;
    ctx.beginPath(); ctx.moveTo(sx, yAt(sx) + lw * .4); ctx.lineTo(ex, yAt(ex) - lw * .4); ctx.stroke();
  }
  if (!s.ended) {
    // Needle and the slack thread arcing back to the last stitch.
    const ny = yAt(head), dip = Math.sin(s.t * 4) * h * .12;
    ctx.strokeStyle = rgba(P.accent, .75); ctx.lineWidth = lw * .5;
    ctx.beginPath(); ctx.moveTo(head - sl * .3, ny); ctx.quadraticCurveTo(head + sl * .9, ny - h * .3 + dip, head + sl * 1.6, ny - h * .18); ctx.stroke();
    ctx.strokeStyle = P.ink; ctx.lineWidth = lw * .8;
    ctx.beginPath(); ctx.moveTo(head + sl * 1.6, ny - h * .18); ctx.lineTo(head + sl * 3.4, ny - h * .32); ctx.stroke();
    ctx.lineWidth = Math.max(1, lw * .3); ctx.beginPath(); ctx.ellipse(head + sl * 3.25, ny - h * .31, lw * .9, lw * .4, -.6, 0, TAU); ctx.stroke();
  } else {
    // Finished: a tied knot at the end of the seam.
    ctx.fillStyle = P.accent; ctx.beginPath(); ctx.arc(x + w - lw, yAt(x + w - lw), lw * 1.6, 0, TAU); ctx.fill();
  }
  timesRow(ctx, x, y + h - ls * .7, w, ls, s, P);
};

const chapters: Painter = (ctx, x, y, w, h, s, P) => {
  const ls = Math.min(h * .2, P.u * 1.4), cy = y + h * .34, th = Math.max(3, Math.min(h * .14, P.u * .6));
  const marks = s.chapters.length ? s.chapters : [.2, .4, .6, .8];
  const edges = [0, ...marks, 1], gap = th * 1.6, at = chapterAt(marks, s.p);
  ctx.lineCap = 'butt';
  for (let i = 0; i < edges.length - 1; i++) {
    const a = x + w * edges[i] + (i ? gap / 2 : 0), b = x + w * edges[i + 1] - (i < edges.length - 2 ? gap / 2 : 0);
    ctx.fillStyle = rgba(P.muted, P.dark ? .25 : .22); ctx.fillRect(a, cy - th / 2, b - a, th);
    const f = i < at.index || s.ended ? 1 : i === at.index ? at.within : 0;
    if (f > 0) { ctx.fillStyle = i === at.index && !s.ended ? P.accent : rgba(P.accent, .8); ctx.fillRect(a, cy - th / 2, (b - a) * f, th); }
    // Engraved tick + numeral at each chapter start.
    const done = i < at.index || s.ended, cur = i === at.index && !s.ended;
    ctx.fillStyle = cur ? P.ink : done ? P.accent : rgba(P.muted, .7);
    ctx.fillRect(a, cy - th * 1.6, Math.max(1, th * .25), th * 3.2);
    if (b - a > ls * 2.4) label(ctx, String(i + 1), a + ls * .3, cy - th * 2.6, ls * .8, P, cur ? P.ink : P.muted, 'left');
  }
  const tt = timeTexts(s.elapsed, s.remaining, s.known);
  label(ctx, tt.el, x, y + h - ls * .7, ls, P, P.ink, 'left');
  label(ctx, s.ended ? 'complete' : `part ${at.index + 1} of ${at.count}`, x + w / 2, y + h - ls * .7, ls, P, P.accent, 'center');
  label(ctx, s.ended ? tt.total : tt.rem, x + w, y + h - ls * .7, ls, P, P.muted, 'right');
};

const tape: Painter = (ctx, x, y, w, h, s, P) => {
  const b = shapeBox(x, y, w, h, P);
  const bw = b.ss * .96, bh = b.ss * .62, bx = b.sx + (b.ss - bw) / 2, by = b.sy + (b.ss - bh) / 2;
  ctx.fillStyle = rgba(P.muted, P.dark ? .14 : .12); ctx.strokeStyle = rgba(P.ink, .6); ctx.lineWidth = Math.max(1.5, b.ss * .01);
  ctx.beginPath(); ctx.roundRect?.(bx, by, bw, bh, bh * .08); ctx.fill(); ctx.stroke();
  const rmax = bh * .3, rmin = bh * .1, lcx = bx + bw * .3, rcx = bx + bw * .7, rcy = by + bh * .45;
  const rl = rmin + (rmax - rmin) * Math.sqrt(1 - s.p), rr = rmin + (rmax - rmin) * Math.sqrt(s.p);
  // Tape path under the reels.
  ctx.strokeStyle = rgba(P.accent2, .8); ctx.lineWidth = Math.max(1, b.ss * .008);
  ctx.beginPath(); ctx.moveTo(lcx - rl * .2, rcy + rl); ctx.lineTo(bx + bw * .22, by + bh * .9); ctx.lineTo(bx + bw * .78, by + bh * .9); ctx.lineTo(rcx + rr * .2, rcy + rr); ctx.stroke();
  const reel = (cx: number, r: number, ang: number) => {
    ctx.fillStyle = rgba(P.accent, .85); ctx.beginPath(); ctx.arc(cx, rcy, r, 0, TAU); ctx.fill();
    ctx.fillStyle = P.dark ? '#0E0E12' : '#FFFFFF'; ctx.beginPath(); ctx.arc(cx, rcy, rmin * .75, 0, TAU); ctx.fill();
    ctx.strokeStyle = rgba(P.ink, .8); ctx.lineWidth = Math.max(1, rmin * .14);
    for (let i = 0; i < 3; i++) { const a = ang + TAU * i / 3; ctx.beginPath(); ctx.moveTo(cx, rcy); ctx.lineTo(cx + Math.cos(a) * rmin * .7, rcy + Math.sin(a) * rmin * .7); ctx.stroke(); }
  };
  // Angular speed ∝ 1/radius (constant tape speed); stops at the end.
  const spin = s.playing && !s.ended ? s.t * 2.2 : 0;
  reel(lcx, rl, spin * rmax / rl);
  reel(rcx, rr, spin * rmax / rr);
  sideTimes(ctx, b, s, P, h, 'end of side');
};

const hourglass: Painter = (ctx, x, y, w, h, s, P) => {
  const b = shapeBox(x, y, w, h, P);
  const gw = b.ss * .5, gh = b.ss * .9, cx = b.sx + b.ss / 2, top = b.sy + b.ss * .05, mid = top + gh / 2, neck = gw * .06;
  const shape = () => {
    ctx.beginPath(); ctx.moveTo(cx - gw / 2, top); ctx.lineTo(cx + gw / 2, top);
    ctx.bezierCurveTo(cx + gw / 2, top + gh * .3, cx + neck, mid - gh * .08, cx + neck, mid);
    ctx.bezierCurveTo(cx + neck, mid + gh * .08, cx + gw / 2, top + gh * .7, cx + gw / 2, top + gh);
    ctx.lineTo(cx - gw / 2, top + gh);
    ctx.bezierCurveTo(cx - gw / 2, top + gh * .7, cx - neck, mid + gh * .08, cx - neck, mid);
    ctx.bezierCurveTo(cx - neck, mid - gh * .08, cx - gw / 2, top + gh * .3, cx - gw / 2, top);
    ctx.closePath();
  };
  ctx.save(); shape(); ctx.clip();
  ctx.fillStyle = rgba(P.muted, P.dark ? .1 : .08); ctx.fillRect(cx - gw, top, gw * 2, gh);
  ctx.fillStyle = P.accent;
  // Top: sand surface sinks toward the neck (volume ~ height² near the neck).
  const topH = (gh / 2) * Math.sqrt(1 - s.p) * .92;
  ctx.fillRect(cx - gw, mid - topH, gw * 2, topH);
  // Bottom: a growing mound.
  const mh = (gh / 2) * Math.sqrt(s.p) * .9, base = top + gh;
  ctx.beginPath(); ctx.moveTo(cx - gw, base); ctx.lineTo(cx - gw, base - mh * .55); ctx.quadraticCurveTo(cx, base - mh * 1.25, cx + gw, base - mh * .55); ctx.lineTo(cx + gw, base); ctx.closePath(); ctx.fill();
  if (!s.ended && s.p < 1) {
    ctx.fillStyle = rgba(P.accent, .9); ctx.fillRect(cx - neck * .35, mid, neck * .7, base - mh * .9 - mid);
    for (let i = 0; i < 5; i++) { const ph = (s.t * 1.6 + i / 5) % 1; ctx.fillRect(cx - neck * .6 + hash1(i) * neck * 1.2, mid + ph * (base - mh - mid), neck * .3, neck * .3); }
  }
  ctx.restore();
  shape(); ctx.strokeStyle = rgba(P.ink, .75); ctx.lineWidth = Math.max(1.5, b.ss * .012); ctx.stroke();
  ctx.fillStyle = rgba(P.ink, .75);
  ctx.fillRect(cx - gw * .62, top - b.ss * .025, gw * 1.24, b.ss * .025); ctx.fillRect(cx - gw * .62, top + gh, gw * 1.24, b.ss * .025);
  sideTimes(ctx, b, s, P, h, 'time');
};

const PAINTERS: Record<ProgressStyle, Painter> = { bar, counter, countdown, journey, vessel, sunrise, candle, orbit, vu, thread, chapters, tape, hourglass };

/** Draw one progress treatment into (x, y, w, h). Never throws. */
export function drawProgress(ctx: Ctx, style: ProgressStyle, x: number, y: number, w: number, h: number, s: ProgressState, P: ProgressPaint, seed = 1): void {
  if (!(w > 2 && h > 2)) return;
  ctx.save();
  try { (PAINTERS[style] || bar)(ctx, x, y, w, h, s, P, seed); } catch { /* a bad frame never blanks the slide */ }
  ctx.restore();
}
