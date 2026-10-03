// dataDrawers — live drawers for the Data templates: bars that grow with a
// stagger, lines that draw on, donuts that sweep, numbers that count up, then
// a gentle theme-styled shimmer. Registered on import (see live.ts).
//
// Designers compute ALL geometry (final mark rects, label anchors, font
// specs) and pass it as props; drawers only animate it. That keeps layout
// testable in node and drawers cheap per frame.
//
// Clock: with a host (Ambo output), seconds since the slide was taken
// (host.shownSec); without one (gallery / thumbnails) the drawer remembers
// when its object first became visible and counts env.t from there, so the
// gallery loop animates too. Thumbnails (first seen fully on) draw the
// finished chart. Reduced motion → finished chart, no shimmer.
import { registerLiveDrawer, type LiveEnv } from './live';
import type { SlideObj } from './types';
import { chartStyle, type ChartStyle } from './chartStyle';
import { formatValue, type NumFormat } from './dataParse';
import { concreteFontFamily } from '../../tela/telaText';
import { lay } from './layout';

type Ctx = CanvasRenderingContext2D;

// ── shared prop shapes (designer ↔ drawer contract) ─────────────────────────
export interface FontSpec { family: string; weight: number; italic?: boolean; track: number; upper?: boolean }
/** Text anchor: x by `align`, y = top of the em box (baseline = y + size, as Tela TEXT). */
export interface TextSpec { x: number; y: number; size: number; font: FontSpec; color: string; align: 'left' | 'center' | 'right'; maxW: number }

export interface BarMark { x: number; y: number; w: number; h: number; from: 'b' | 't' | 'l' | 'r'; c: string; i: number; hi?: boolean; v: number; label?: TextSpec | null }
export interface BarsProps { bars: BarMark[]; fmt: NumFormat; ghost?: boolean; n: number }
export interface LineSeries { pts: number[]; c: string; w: number; dash?: boolean; area?: boolean; r: number; labels: Array<TextSpec & { v: number; at: number }>; delay?: number }
export interface LineProps { series: LineSeries[]; baseY: number; x0: number; x1: number; fmt: NumFormat; ghost?: boolean; areaTop: number }
export interface DonutProps { cx: number; cy: number; r: number; w: number; slices: Array<{ v: number; c: string }>; total?: { spec: TextSpec; v: number; fmt: NumFormat } | null; ghost?: boolean }
export interface KpiProps { items: Array<{ spec: TextSpec; v: number; fmt: NumFormat; rule?: { x: number; y: number; w: number; h: number; c: string } }> }
export interface GoalProps {
  mode: 'arc' | 'thermo' | 'bar'; pct: number; c: string; track: string;
  arc?: { cx: number; cy: number; r: number; w: number; a0: number; a1: number };
  thermo?: { x: number; y: number; w: number; h: number; bulbR: number };
  bar?: { x: number; y: number; w: number; h: number };
  raised: { spec: TextSpec; v: number; fmt: NumFormat; ride?: boolean; rideMax?: number };
  pctText?: TextSpec | null;
}
export interface DumbbellProps { rows: Array<{ y: number; xa: number; xb: number; ca: string; cb: string; i: number }>; r: number; lineW: number; x0: number; x1: number; values: Array<{ spec: TextSpec; v: number; fmt: NumFormat; i: number }> }
export interface TimelineProps { a: [number, number]; b: [number, number]; nodes: Array<{ x: number; y: number }>; c: string; r: number; lineW: number; track: string }
export interface PictoProps { cells: Array<{ x: number; y: number; s: number }>; on: number; icon: 'person' | 'heart' | 'house' | 'meal'; cOn: string; cOff: string }
export interface StackProps { x: number; y: number; w: number; h: number; segs: Array<{ w: number; c: string }>; gap: number }

// ── maths ───────────────────────────────────────────────────────────────────
const clamp01 = (v: number) => v < 0 ? 0 : v > 1 ? 1 : v;
const outCubic = (p: number) => 1 - Math.pow(1 - p, 3);
const inCubic = (p: number) => p * p * p;
const outBack = (p: number) => { const c = 1.6, q = p - 1; return 1 + (c + 1) * q * q * q + c * q * q; };
const outBounce = (p: number) => 1 - Math.cos(p * Math.PI * 2.5) * Math.pow(1 - p, 2.2);
const hash1 = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const TAU = Math.PI * 2;

function ease(s: ChartStyle, p: number): number {
  p = clamp01(p);
  switch (s.ease) {
    case 'back': return p >= 1 ? 1 : outBack(p);
    case 'bounce': return p >= 1 ? 1 : outBounce(p);
    case 'step': return p >= 1 ? 1 : outCubic(Math.ceil(p * 7) / 7);
    default: return outCubic(p);
  }
}

// ── clock ───────────────────────────────────────────────────────────────────
interface Seen { t0: number; lastT: number; full: boolean }
const seen = new WeakMap<object, Seen>();
/** Seconds since the marks may start growing, and the exit retract factor (1 = fully present). */
export function chartTime(o: SlideObj, env: LiveEnv): { sec: number; k: number } {
  if (env.reduced) return { sec: 1e6, k: 1 };
  const h = env.host;
  if (h) {
    const lead = env.th.motion.enterSec * .32;
    const sec = h.shownSec < 0 ? 0 : h.shownSec - lead;
    return { sec, k: 1 - inCubic(clamp01(h.exitP)) };
  }
  const a = env.alpha;
  let r = seen.get(o);
  if (a < .03) { seen.set(o, { t0: env.t, lastT: env.t, full: false }); return { sec: 0, k: 1 }; }
  if (!r) { r = a >= .999 ? { t0: -1e6, lastT: env.t, full: true } : { t0: env.t - a * .4, lastT: env.t, full: false }; seen.set(o, r); }
  if (env.t < r.lastT - 1e-3) { r.t0 = env.t; r.full = false; } // clock rewound → replay
  r.lastT = env.t;
  let sec = env.t - r.t0;
  if (sec <= 0 && a < .999) sec = a * .6; // frozen clock (stills): approximate from alpha
  if (a >= .999) r.full = true;
  return { sec, k: r.full && a < .999 ? clamp01(a) : 1 };
}

/** Growth progress for mark i of n. */
function grow(sec: number, i: number, n: number, s: ChartStyle, dur = .95, span = 1.1): number {
  const st = Math.min(.14, span / Math.max(1, n));
  return ease(s, (sec - i * st) / dur);
}
const settleAt = (n: number, dur = .95, span = 1.1) => Math.min(.14, span / Math.max(1, n)) * n + dur;

// ── colour ──────────────────────────────────────────────────────────────────
function rgb(c: string): [number, number, number, number] | null {
  const m = c.replace('#', '');
  if (/^[0-9a-f]{6}$/i.test(m)) return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16), 1];
  const r = c.match(/rgba?\(([^)]+)\)/);
  if (r) { const p = r[1].split(',').map(s => parseFloat(s)); return [p[0], p[1], p[2], p[3] ?? 1]; }
  return null;
}
/** Colour with opacity a (multiplied with its own). */
function ca(c: string, a: number): string { const v = rgb(c); return v ? `rgba(${v[0]},${v[1]},${v[2]},${+(v[3] * a).toFixed(3)})` : c; }
/** Toward white (+) / black (−). */
function tint(c: string, k: number): string {
  const v = rgb(c); if (!v) return c;
  const t = k > 0 ? 255 : 0, a = Math.abs(k);
  return `rgba(${v.map((x, i) => i < 3 ? Math.round(x + (t - x) * a) : x).join(',')})`;
}

// ── text ────────────────────────────────────────────────────────────────────
function setFont(ctx: Ctx, f: FontSpec, size: number) {
  ctx.font = `${f.italic ? 'italic ' : ''}${f.weight} ${Math.max(1, size).toFixed(2)}px ${concreteFontFamily(f.family)}`;
}
function textWidth(ctx: Ctx, s: string, f: FontSpec, size: number): number {
  return ctx.measureText(s).width + f.track * size * Math.max(0, Array.from(s).length - 1);
}
/** Draw one line, shrinking to maxW. Returns the drawn width. */
export function drawText(ctx: Ctx, str: string, t: TextSpec, dx = 0, dy = 0, color = t.color): number {
  if (!str) return 0;
  const s = t.font.upper ? str.toUpperCase() : str;
  let size = t.size;
  setFont(ctx, t.font, size);
  let w = textWidth(ctx, s, t.font, size);
  if (w > t.maxW && w > 0) { size = size * t.maxW / w; setFont(ctx, t.font, size); w = textWidth(ctx, s, t.font, size); }
  const x = (t.align === 'center' ? t.x - w / 2 : t.align === 'right' ? t.x - w : t.x) + dx;
  const y = t.y + t.size * .62 + size * .38 + dy;
  ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  const ls = t.font.track * size;
  if ('letterSpacing' in (ctx as object)) { (ctx as any).letterSpacing = `${ls}px`; ctx.fillText(s, x, y); (ctx as any).letterSpacing = '0px'; }
  else if (!ls) ctx.fillText(s, x, y);
  else { let cx = x; for (const ch of Array.from(s)) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + ls; } }
  return w;
}

// ── textures (cached patterns) ──────────────────────────────────────────────
const patterns = new Map<string, CanvasPattern | null>();
function texturePattern(ctx: Ctx, kind: ChartStyle['texture'], u: number, color: string): CanvasPattern | null {
  if (kind === 'none' || typeof document === 'undefined') return null;
  const cell = Math.max(4, Math.round(u * (kind === 'halftone' ? .62 : kind === 'hatch' ? .7 : 2.4)));
  const key = `${kind}|${cell}|${color}`;
  if (patterns.has(key)) return patterns.get(key)!;
  let pat: CanvasPattern | null = null;
  try {
    const cv = document.createElement('canvas'); cv.width = cv.height = cell;
    const g = cv.getContext('2d')!;
    g.fillStyle = color; g.strokeStyle = color;
    if (kind === 'halftone') { g.beginPath(); g.arc(cell / 2, cell / 2, cell * .2, 0, TAU); g.fill(); g.beginPath(); g.arc(0, 0, cell * .2, 0, TAU); g.arc(cell, 0, cell * .2, 0, TAU); g.arc(0, cell, cell * .2, 0, TAU); g.arc(cell, cell, cell * .2, 0, TAU); g.fill(); }
    else if (kind === 'hatch') { g.lineWidth = Math.max(1, cell * .16); g.beginPath(); g.moveTo(-1, cell + 1); g.lineTo(cell + 1, -1); g.moveTo(-1, 1); g.lineTo(1, -1); g.moveTo(cell - 1, cell + 1); g.lineTo(cell + 1, cell - 1); g.stroke(); }
    else { for (let i = 0; i < cell * cell / 9; i++) { const x = hash1(i * 3.1) * cell, y = hash1(i * 7.7 + 2) * cell, r = .4 + hash1(i * 1.3) * cell * .05; g.globalAlpha = .35 + hash1(i) * .5; g.fillRect(x, y, r * 2, r); } }
    pat = ctx.createPattern(cv, 'repeat');
  } catch { pat = null; }
  if (patterns.size > 64) patterns.clear();
  patterns.set(key, pat);
  return pat;
}

// ── mark primitives ─────────────────────────────────────────────────────────
function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + rr, y); ctx.arcTo(x + w, y, x + w, y + h, rr); ctx.arcTo(x + w, y + h, x, y + h, rr); ctx.arcTo(x, y + h, x, y, rr); ctx.arcTo(x, y, x + w, y, rr); ctx.closePath();
}
/** A hand-drawn rectangle outline (deterministic wobble). */
function wobbleRect(ctx: Ctx, x: number, y: number, w: number, h: number, amp: number, seed: number) {
  const pts: number[] = [];
  const edge = (x0: number, y0: number, x1: number, y1: number, k: number) => {
    const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.round(len / Math.max(6, amp * 7)));
    const nx = -(y1 - y0) / (len || 1), ny = (x1 - x0) / (len || 1);
    for (let i = 0; i < n; i++) { const t = i / n, o = (hash1(seed * 13 + k * 101 + i) - .5) * 2 * amp; pts.push(x0 + (x1 - x0) * t + nx * o, y0 + (y1 - y0) * t + ny * o); }
  };
  edge(x, y, x + w, y, 1); edge(x + w, y, x + w, y + h, 2); edge(x + w, y + h, x, y + h, 3); edge(x, y + h, x, y, 4);
  ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.closePath();
}

interface MarkOpts { u: number; seed: number; t: number; settled: number; hi?: boolean; vertical: boolean; ghost?: boolean; ground: string; dark: boolean }
/** One bar-like mark in the theme's language. `settled` = seconds since the chart finished growing (−1 while growing). */
function barMark(ctx: Ctx, x: number, y: number, w: number, h: number, color: string, s: ChartStyle, o: MarkOpts) {
  if (w <= .5 || h <= .5) return;
  const { u } = o;
  const r = s.round * Math.min(w, h);
  const amb = o.settled >= 0 && !o.ghost;
  const trace = () => { ctx.beginPath(); if (s.wobble > 0) wobbleRect(ctx, x, y, w, h, s.wobble * u * .5, o.seed + (amb && s.shimmer === 'jitter' ? Math.floor(o.t * 2.5) : 0)); else roundRect(ctx, x, y, w, h, r); };
  ctx.save();
  if (o.ghost) ctx.globalAlpha *= .22;
  // flicker (neon tube buzz) — the mark only.
  if (amb && s.shimmer === 'flicker') { const hh = hash1(Math.floor(o.t * 9) + o.seed * 7); if (hh < .05) ctx.globalAlpha *= .55; }
  if (s.slab) {
    const j = amb && s.shimmer === 'jitter' ? (hash1(Math.floor(o.t * 3) + o.seed) - .5) * u * .2 : 0;
    ctx.fillStyle = s.slab.color; ctx.beginPath(); roundRect(ctx, x + s.slab.dx * u + j, y + s.slab.dy * u, w, h, r); ctx.fill();
  }
  if (s.misreg) {
    const j = amb && s.shimmer === 'jitter' ? (hash1(Math.floor(o.t * 2) + o.seed) - .5) * u * .18 : 0;
    ctx.save(); ctx.globalCompositeOperation = o.dark ? 'screen' : 'multiply'; ctx.globalAlpha *= .8;
    ctx.fillStyle = s.misreg.color; ctx.beginPath(); roundRect(ctx, x + s.misreg.dx * u + j, y - s.misreg.dy * u, w, h, r); ctx.fill(); ctx.restore();
  }
  if (s.glow > 0) {
    const breath = amb && (s.shimmer === 'breath' || s.shimmer === 'flicker') ? .8 + .2 * Math.sin(o.t * TAU / 3.6 + o.seed) : 1;
    ctx.shadowColor = ca(color, .85); ctx.shadowBlur = s.glow * u * (o.hi ? 1.5 : 1) * breath;
  }
  let fill: string | CanvasGradient = ca(color, s.fillA);
  if (s.gradient) {
    const g = o.vertical ? ctx.createLinearGradient(0, y + h, 0, y) : ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, ca(tint(color, o.dark ? -.25 : -.12), s.fillA)); g.addColorStop(1, ca(tint(color, o.dark ? .12 : .18), s.fillA));
    fill = g;
  }
  ctx.fillStyle = fill; trace(); ctx.fill();
  ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
  if (s.texture !== 'none') {
    const pat = texturePattern(ctx, s.texture, u, s.texture === 'chalk' ? o.ground : ca(o.ground, s.texture === 'hatch' ? .38 : .3));
    if (pat) { ctx.save(); trace(); ctx.clip(); ctx.globalAlpha *= s.texture === 'chalk' ? .45 : 1; ctx.fillStyle = pat; ctx.fillRect(x, y, w, h); ctx.restore(); }
  }
  // Ambient light sweep travelling base → tip.
  if (amb && s.shimmer === 'sweep') {
    const per = 6.5, ph = ((o.t / per + o.seed * .071) % 1 + 1) % 1;
    if (ph < .45) {
      const q = ph / .45, len = o.vertical ? h : w, band = Math.max(u * 3, len * .35);
      const pos = -band + q * (len + band * 2);
      ctx.save(); trace(); ctx.clip();
      const g = o.vertical ? ctx.createLinearGradient(0, y + h - pos - band, 0, y + h - pos + band) : ctx.createLinearGradient(x + pos - band, 0, x + pos + band, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.5, `rgba(255,255,255,${o.dark ? .2 : .26})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h); ctx.restore();
    }
  }
  if (s.outline) { ctx.strokeStyle = s.outline.color; ctx.lineWidth = Math.max(1, s.outline.w * u); ctx.lineJoin = 'round'; trace(); ctx.stroke(); }
  // Breath on the highlight: a soft halo ring.
  if (amb && o.hi && s.shimmer === 'breath') {
    const k = .5 + .5 * Math.sin(o.t * TAU / 3.2);
    ctx.strokeStyle = ca(color, .18 + .22 * k); ctx.lineWidth = Math.max(1, u * (.16 + .2 * k));
    const p = u * (.35 + .25 * k);
    ctx.beginPath(); roundRect(ctx, x - p, y - p, w + p * 2, h + p * 2, r + p); ctx.stroke();
  }
  ctx.restore();
}

function polyPath(ctx: Ctx, pts: number[], wob: number, seed: number) {
  ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) {
    if (wob > 0) {
      const x0 = pts[i - 2], y0 = pts[i - 1], x1 = pts[i], y1 = pts[i + 1], n = 4;
      for (let k = 1; k <= n; k++) { const t = k / n, o = k === n ? 0 : (hash1(seed + i * 7 + k) - .5) * 2 * wob; ctx.lineTo(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + o); }
    } else ctx.lineTo(pts[i], pts[i + 1]);
  }
}

function pointMark(ctx: Ctx, x: number, y: number, r: number, color: string, s: ChartStyle, ground: string) {
  ctx.beginPath();
  switch (s.point) {
    case 'square': ctx.rect(x - r, y - r, r * 2, r * 2); break;
    case 'diamond': ctx.moveTo(x, y - r * 1.25); ctx.lineTo(x + r * 1.25, y); ctx.lineTo(x, y + r * 1.25); ctx.lineTo(x - r * 1.25, y); ctx.closePath(); break;
    default: ctx.arc(x, y, r, 0, TAU);
  }
  if (s.point === 'ring') { ctx.fillStyle = ground; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, r * .45); ctx.stroke(); }
  else { ctx.fillStyle = color; ctx.fill(); if (s.outline) { ctx.strokeStyle = s.outline.color; ctx.lineWidth = Math.max(1, r * .3); ctx.stroke(); } }
}

function arcPath(ctx: Ctx, cx: number, cy: number, r0: number, r1: number, a0: number, a1: number) {
  ctx.beginPath(); ctx.arc(cx, cy, r1, a0, a1);
  if (r0 > .5) ctx.arc(cx, cy, r0, a1, a0, true); else ctx.lineTo(cx, cy);
  ctx.closePath();
}

const uOf = (env: LiveEnv) => lay(env.W, env.H).u;
const mopts = (env: LiveEnv, u: number, seed: number, settled: number, vertical: boolean, extra: Partial<MarkOpts> = {}): MarkOpts =>
  ({ u, seed, t: env.t, settled, vertical, ground: env.th.c.ground, dark: env.th.dark, ...extra });

// ── bars ────────────────────────────────────────────────────────────────────
registerLiveDrawer('data.bars', (ctx, o, env) => {
  const p = o.live!.props as unknown as BarsProps; if (!p?.bars) return;
  const s = chartStyle(env.th), u = uOf(env);
  const { sec, k } = chartTime(o, env);
  const settled = sec >= settleAt(p.n) ? sec - settleAt(p.n) : -1;
  for (const b of p.bars) {
    const g = Math.max(0, grow(sec, b.i, p.n, s) * k);
    const vert = b.from === 'b' || b.from === 't';
    let x = b.x, y = b.y, w = b.w, h = b.h, dx = 0, dy = 0;
    if (b.from === 'b') { h = b.h * g; y = b.y + b.h - h; dy = b.h - h; }
    else if (b.from === 't') { h = b.h * g; dy = -(b.h - h); }
    else if (b.from === 'l') { w = b.w * g; dx = w - b.w; }
    else { w = b.w * g; x = b.x + b.w - w; dx = -(b.w - w); }
    barMark(ctx, x, y, w, h, b.c, s, mopts(env, u, b.i + 1, settled, vert, { hi: b.hi, ghost: p.ghost }));
    if (b.label && !p.ghost) {
      const q = clamp01(g * 1.4 - .25);
      if (q > 0) { ctx.save(); ctx.globalAlpha *= q; drawText(ctx, formatValue(b.v * Math.min(1, g), p.fmt), b.label, dx, dy); ctx.restore(); }
    }
  }
});

// ── stacked (one segmented bar) ─────────────────────────────────────────────
registerLiveDrawer('data.stack', (ctx, o, env) => {
  const p = o.live!.props as unknown as StackProps; if (!p?.segs) return;
  const s = chartStyle(env.th), u = uOf(env);
  const { sec, k } = chartTime(o, env);
  const g = clamp01(outCubic(clamp01(sec / 1.6)) * k);
  const settled = sec >= 1.6 ? sec - 1.6 : -1;
  ctx.save(); ctx.fillStyle = s.track; ctx.beginPath(); roundRect(ctx, p.x, p.y, p.w, p.h, s.round * p.h); ctx.fill(); ctx.restore();
  const head = p.x + p.w * g;
  let x = p.x;
  p.segs.forEach((sg, i) => {
    const x1 = Math.min(x + sg.w, head);
    if (x1 > x + .5) {
      // pop in each segment as the head passes
      const pop = s.ease === 'back' ? Math.min(1.08, outBack(clamp01((head - x) / Math.max(u * 6, sg.w * .6)))) : 1;
      const hh = p.h * pop, yy = p.y + (p.h - hh) / 2;
      barMark(ctx, x, yy, Math.max(0, x1 - x - (i < p.segs.length - 1 ? p.gap : 0)), hh, sg.c, s, mopts(env, u, i + 3, settled, false, { hi: i === 0 }));
    }
    x += sg.w;
  });
});

// ── line / area ─────────────────────────────────────────────────────────────
registerLiveDrawer('data.line', (ctx, o, env) => {
  const p = o.live!.props as unknown as LineProps; if (!p?.series) return;
  const s = chartStyle(env.th), u = uOf(env), dur = 1.7;
  const { sec, k } = chartTime(o, env);
  p.series.forEach((sr, si) => {
    const pts = sr.pts; if (pts.length < 2) return;
    const lsec = sec - (sr.delay || 0);
    const g = clamp01(outCubic(clamp01(lsec / dur))) * k;
    const settled = lsec >= dur ? lsec - dur : -1;
    const span = p.x1 - p.x0, head = p.x0 + span * g;
    ctx.save();
    if (p.ghost) ctx.globalAlpha *= .22;
    ctx.beginPath(); ctx.rect(p.x0 - u * 3, 0, Math.max(0, head - p.x0 + u * 3), env.H); ctx.clip();
    if (sr.area) {
      const grd = ctx.createLinearGradient(0, p.areaTop, 0, p.baseY);
      grd.addColorStop(0, ca(sr.c, s.flavor === 'grid' ? .16 : .32)); grd.addColorStop(1, ca(sr.c, .02));
      ctx.beginPath(); ctx.moveTo(pts[0], p.baseY);
      for (let i = 0; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
      ctx.lineTo(pts[pts.length - 2], p.baseY); ctx.closePath();
      ctx.fillStyle = grd; ctx.fill();
      if (s.texture !== 'none') { const pat = texturePattern(ctx, s.texture, u, ca(sr.c, .35)); if (pat) { ctx.save(); ctx.clip(); ctx.fillStyle = pat; ctx.fillRect(p.x0, p.areaTop, span, p.baseY - p.areaTop); ctx.restore(); } }
    }
    const strokeIt = (col: string, w: number, dx = 0, dy = 0) => {
      ctx.save(); ctx.translate(dx, dy); polyPath(ctx, pts, s.wobble * u * .3, si * 31 + 5);
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      if (sr.dash) ctx.setLineDash([w * 2.2, w * 1.8]);
      ctx.stroke(); ctx.restore();
    };
    if (s.slab) strokeIt(s.slab.color, sr.w, s.slab.dx * u * .6, s.slab.dy * u * .6);
    if (s.misreg) { const j = settled >= 0 && s.shimmer === 'jitter' ? (hash1(Math.floor(env.t * 2)) - .5) * u * .2 : 0; ctx.save(); ctx.globalCompositeOperation = env.th.dark ? 'screen' : 'multiply'; strokeIt(s.misreg.color, sr.w, s.misreg.dx * u + j, -s.misreg.dy * u); ctx.restore(); }
    if (s.glow > 0) { ctx.shadowColor = ca(sr.c, .9); ctx.shadowBlur = s.glow * u * (settled >= 0 && s.shimmer !== 'none' ? .85 + .15 * Math.sin(env.t * TAU / 3.4) : 1); }
    strokeIt(sr.c, sr.w);
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
    ctx.restore();
    // Points pop as the head passes; labels count up beside them.
    const n = pts.length / 2;
    for (let i = 0; i < n; i++) {
      const px = pts[i * 2], py = pts[i * 2 + 1];
      const q = span > 0 ? clamp01((head - px) / Math.max(u * 3, span * .06) + (g >= 1 ? 1 : 0)) : 1;
      if (q <= 0) continue;
      const pr = sr.r * (s.ease === 'back' ? Math.min(1.25, outBack(q)) : outCubic(q));
      ctx.save(); if (p.ghost) ctx.globalAlpha *= .22; pointMark(ctx, px, py, pr, sr.c, s, env.th.c.ground); ctx.restore();
    }
    if (!p.ghost) for (const lb of sr.labels) {
      const px = pts[lb.at * 2];
      const q = clamp01((head - px) / Math.max(u * 4, span * .08) + (g >= 1 ? 1 : 0));
      if (q <= 0) continue;
      ctx.save(); ctx.globalAlpha *= q; drawText(ctx, formatValue(lb.v * outCubic(q), p.fmt), lb); ctx.restore();
    }
    // Ambient: a ripple from the latest point, and a light travelling the line.
    if (settled >= 0 && !p.ghost && si === 0) {
      const lx = pts[pts.length - 2], ly = pts[pts.length - 1], per = 2.8, ph = (settled % per) / per;
      ctx.save(); ctx.strokeStyle = ca(sr.c, .5 * (1 - ph)); ctx.lineWidth = Math.max(1, u * .14);
      ctx.beginPath(); ctx.arc(lx, ly, sr.r * (1.2 + ph * 2.6), 0, TAU); ctx.stroke(); ctx.restore();
      if (s.shimmer === 'sweep' || s.glow > 0) {
        const tp = (settled % 7) / 7;
        if (tp < .5) {
          const f = tp / .5 * (n - 1), i0 = Math.floor(f), fr = f - i0, i1 = Math.min(n - 1, i0 + 1);
          const gx = pts[i0 * 2] + (pts[i1 * 2] - pts[i0 * 2]) * fr, gy = pts[i0 * 2 + 1] + (pts[i1 * 2 + 1] - pts[i0 * 2 + 1]) * fr;
          const rg = ctx.createRadialGradient(gx, gy, 0, gx, gy, u * 2.4);
          rg.addColorStop(0, 'rgba(255,255,255,.75)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.save(); ctx.globalCompositeOperation = env.th.dark ? 'lighter' : 'screen'; ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(gx, gy, u * 2.4, 0, TAU); ctx.fill(); ctx.restore();
        }
      }
    }
  });
});

// ── donut / pie ─────────────────────────────────────────────────────────────
registerLiveDrawer('data.donut', (ctx, o, env) => {
  const p = o.live!.props as unknown as DonutProps; if (!p?.slices) return;
  const s = chartStyle(env.th), u = uOf(env), dur = 1.6;
  const { sec, k } = chartTime(o, env);
  const g = clamp01(outCubic(clamp01(sec / dur))) * k;
  const settled = sec >= dur ? sec - dur : -1;
  const total = p.slices.reduce((a, b) => a + Math.max(0, b.v), 0) || 1;
  const r1 = p.r, r0 = Math.max(0, p.r - p.w);
  ctx.save();
  if (p.ghost) ctx.globalAlpha *= .22;
  // track
  ctx.fillStyle = s.track; arcPath(ctx, p.cx, p.cy, r0, r1, 0, TAU); ctx.fill();
  const start = -Math.PI / 2, sweep = TAU * g;
  const gap = p.slices.length > 1 ? Math.min(.04, u * .25 / r1) : 0;
  let a = start, big = 0;
  p.slices.forEach((sl, i) => { if (sl.v > p.slices[big].v) big = i; });
  p.slices.forEach((sl, i) => {
    const span = TAU * Math.max(0, sl.v) / total;
    const a0 = a + gap / 2, a1 = Math.min(a + span - gap / 2, start + sweep);
    a += span;
    if (a1 <= a0) return;
    let rr1 = r1, rr0 = r0;
    if (settled >= 0 && i === big && !p.ghost && s.shimmer !== 'none') { const b = .5 + .5 * Math.sin(settled * TAU / 3.6); rr1 = r1 + u * .45 * b; }
    if (s.slab) { ctx.fillStyle = s.slab.color; arcPath(ctx, p.cx + s.slab.dx * u, p.cy + s.slab.dy * u, rr0, rr1, a0, a1); ctx.fill(); }
    if (s.misreg) { ctx.save(); ctx.globalCompositeOperation = env.th.dark ? 'screen' : 'multiply'; ctx.fillStyle = ca(s.misreg.color, .8); arcPath(ctx, p.cx + s.misreg.dx * u, p.cy - s.misreg.dy * u, rr0, rr1, a0, a1); ctx.fill(); ctx.restore(); }
    if (s.glow > 0) { ctx.shadowColor = ca(sl.c, .8); ctx.shadowBlur = s.glow * u; }
    ctx.fillStyle = ca(sl.c, s.fillA); arcPath(ctx, p.cx, p.cy, rr0, rr1, a0, a1); ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
    if (s.texture !== 'none') { const pat = texturePattern(ctx, s.texture, u, s.texture === 'chalk' ? env.th.c.ground : ca(env.th.c.ground, .3)); if (pat) { ctx.save(); arcPath(ctx, p.cx, p.cy, rr0, rr1, a0, a1); ctx.clip(); ctx.globalAlpha *= s.texture === 'chalk' ? .45 : 1; ctx.fillStyle = pat; ctx.fillRect(p.cx - rr1, p.cy - rr1, rr1 * 2, rr1 * 2); ctx.restore(); } }
    if (s.outline) { ctx.strokeStyle = s.outline.color; ctx.lineWidth = Math.max(1, s.outline.w * u); arcPath(ctx, p.cx, p.cy, rr0, rr1, a0, a1); ctx.stroke(); }
  });
  // ambient light travelling round the ring
  if (settled >= 0 && !p.ghost && (s.shimmer === 'sweep' || s.glow > 0)) {
    const ang = start + ((settled / 9) % 1) * TAU;
    ctx.save(); ctx.globalCompositeOperation = env.th.dark ? 'lighter' : 'screen';
    arcPath(ctx, p.cx, p.cy, r0, r1, ang - .35, ang); ctx.clip();
    const gx = p.cx + Math.cos(ang) * (r0 + r1) / 2, gy = p.cy + Math.sin(ang) * (r0 + r1) / 2;
    const rg = ctx.createRadialGradient(gx, gy, 0, gx, gy, Math.max(u * 3, p.w * 1.2));
    rg.addColorStop(0, 'rgba(255,255,255,.4)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = rg; ctx.fillRect(p.cx - r1, p.cy - r1, r1 * 2, r1 * 2); ctx.restore();
  }
  ctx.restore();
  if (p.total && !p.ghost) drawText(ctx, formatValue(p.total.v * g, p.total.fmt), p.total.spec);
});

// ── KPI counters ────────────────────────────────────────────────────────────
registerLiveDrawer('data.kpis', (ctx, o, env) => {
  const p = o.live!.props as unknown as KpiProps; if (!p?.items) return;
  const s = chartStyle(env.th), u = uOf(env);
  const { sec, k } = chartTime(o, env);
  p.items.forEach((it, i) => {
    const q = clamp01((sec - i * .18) / 1.5), g = outCubic(q) * k;
    if (it.rule) {
      const rw = it.rule.w * outCubic(clamp01((sec - i * .18 - .2) / 1)) * k;
      if (rw > .5) barMark(ctx, it.rule.x, it.rule.y, rw, it.rule.h, it.rule.c, s, mopts(env, u, i + 1, q >= 1 ? sec - 1.5 : -1, false, { hi: true }));
    }
    ctx.save(); ctx.globalAlpha *= clamp01(q * 3);
    drawText(ctx, formatValue(it.v * g, it.fmt), it.spec);
    ctx.restore();
  });
});

// ── goal (arc / thermometer / bar) ──────────────────────────────────────────
registerLiveDrawer('data.goal', (ctx, o, env) => {
  const p = o.live!.props as unknown as GoalProps; if (!p) return;
  const s = chartStyle(env.th), u = uOf(env), dur = 2.1;
  const { sec, k } = chartTime(o, env);
  const g = clamp01(outCubic(clamp01(sec / dur))) * k;
  const settled = sec >= dur ? sec - dur : -1;
  const f = clamp01(p.pct) * g;
  const glint = (x: number, y: number, r: number) => {
    if (settled < 0) return;
    const b = .5 + .5 * Math.sin(settled * TAU / 2.6);
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, `rgba(255,255,255,${.25 + .35 * b})`); rg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save(); ctx.globalCompositeOperation = env.th.dark ? 'lighter' : 'screen'; ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.restore();
  };
  if (p.mode === 'arc' && p.arc) {
    const A = p.arc, r0 = A.r - A.w;
    ctx.fillStyle = p.track; arcPath(ctx, A.cx, A.cy, r0, A.r, A.a0, A.a1); ctx.fill();
    const a1 = A.a0 + (A.a1 - A.a0) * f;
    if (a1 > A.a0 + 1e-3) {
      if (s.slab) { ctx.fillStyle = s.slab.color; arcPath(ctx, A.cx + s.slab.dx * u, A.cy + s.slab.dy * u, r0, A.r, A.a0, a1); ctx.fill(); }
      if (s.misreg) { ctx.save(); ctx.globalCompositeOperation = env.th.dark ? 'screen' : 'multiply'; ctx.fillStyle = ca(s.misreg.color, .8); arcPath(ctx, A.cx + s.misreg.dx * u, A.cy - s.misreg.dy * u, r0, A.r, A.a0, a1); ctx.fill(); ctx.restore(); }
      if (s.glow > 0) { ctx.shadowColor = ca(p.c, .85); ctx.shadowBlur = s.glow * u; }
      const grd = ctx.createLinearGradient(A.cx - A.r, 0, A.cx + A.r, 0);
      grd.addColorStop(0, s.gradient ? tint(p.c, env.th.dark ? -.25 : -.1) : p.c); grd.addColorStop(1, s.gradient ? tint(p.c, .15) : p.c);
      ctx.fillStyle = grd; arcPath(ctx, A.cx, A.cy, r0, A.r, A.a0, a1); ctx.fill();
      ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
      // rounded head cap for soft / neon styles
      if (s.round >= .3) { const hx = A.cx + Math.cos(a1) * (A.r - A.w / 2), hy = A.cy + Math.sin(a1) * (A.r - A.w / 2); ctx.fillStyle = tint(p.c, .15); ctx.beginPath(); ctx.arc(hx, hy, A.w / 2, 0, TAU); ctx.fill(); }
      if (s.outline) { ctx.strokeStyle = s.outline.color; ctx.lineWidth = Math.max(1, s.outline.w * u); arcPath(ctx, A.cx, A.cy, r0, A.r, A.a0, a1); ctx.stroke(); }
      glint(A.cx + Math.cos(a1) * (A.r - A.w / 2), A.cy + Math.sin(a1) * (A.r - A.w / 2), A.w * 1.1);
    }
  } else if (p.mode === 'thermo' && p.thermo) {
    const T = p.thermo, bx = T.x + T.w / 2, by = T.y + T.h + T.bulbR * .55;
    const tube = () => { ctx.beginPath(); roundRect(ctx, T.x, T.y, T.w, T.h + T.bulbR * .3, T.w / 2); ctx.moveTo(bx + T.bulbR, by); ctx.arc(bx, by, T.bulbR, 0, TAU); };
    ctx.fillStyle = p.track; tube(); ctx.fill();
    const lv = T.y + T.h - T.h * f;
    ctx.save(); tube(); ctx.clip();
    if (s.glow > 0) { ctx.shadowColor = ca(p.c, .85); ctx.shadowBlur = s.glow * u; }
    const pad = T.w * .16;
    ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(bx, by, T.bulbR - pad, 0, TAU); ctx.fill();
    ctx.beginPath(); roundRect(ctx, T.x + pad, lv, T.w - pad * 2, T.y + T.h - lv + T.bulbR * .6, (T.w - pad * 2) / 2); ctx.fill();
    ctx.shadowBlur = 0;
    // bubbles rising inside the filled column (ambient ornament)
    if (settled >= 0) for (let i = 0; i < 5; i++) {
      const per = 3 + hash1(i) * 2, ph = ((settled + hash1(i + 9) * per) % per) / per;
      const yy = by - ph * (by - lv), rr = T.w * (.06 + hash1(i + 3) * .06);
      if (yy < lv + rr) continue;
      ctx.fillStyle = `rgba(255,255,255,${.35 * (1 - ph)})`; ctx.beginPath(); ctx.arc(T.x + T.w * (.35 + hash1(i + 5) * .3), yy, rr, 0, TAU); ctx.fill();
    }
    ctx.restore();
    if (s.outline) { ctx.strokeStyle = s.outline.color; ctx.lineWidth = Math.max(1, s.outline.w * u); tube(); ctx.stroke(); }
    glint(bx, lv + T.w * .3, T.w * .9);
  } else if (p.bar) {
    const B = p.bar;
    ctx.fillStyle = p.track; ctx.beginPath(); roundRect(ctx, B.x, B.y, B.w, B.h, s.round * B.h); ctx.fill();
    barMark(ctx, B.x, B.y, B.w * f, B.h, p.c, s, mopts(env, u, 3, settled, false, { hi: true }));
    glint(B.x + B.w * f, B.y + B.h / 2, B.h * 1.1);
  }
  // numbers
  const R = p.raised;
  let dx = 0;
  if (R.ride && p.bar) {
    const B = p.bar;
    setFont(ctx, R.spec.font, R.spec.size);
    const w = Math.min(R.spec.maxW, textWidth(ctx, formatValue(R.v, R.fmt), R.spec.font, R.spec.size));
    const hx = Math.max(B.x + w / 2, Math.min((R.rideMax ?? B.x + B.w) - w / 2, B.x + B.w * f));
    dx = hx - R.spec.x;
  }
  drawText(ctx, formatValue(R.v * g, R.fmt), R.spec, dx);
  if (p.pctText) drawText(ctx, `${Math.round(p.pct * 100 * g)}%`, p.pctText);
});

// ── dumbbell (this year vs last) ────────────────────────────────────────────
registerLiveDrawer('data.dumbbell', (ctx, o, env) => {
  const p = o.live!.props as unknown as DumbbellProps; if (!p?.rows) return;
  const s = chartStyle(env.th), u = uOf(env), n = p.rows.length;
  const { sec, k } = chartTime(o, env);
  const settledAll = sec - settleAt(n, 1.2);
  for (const r of p.rows) {
    const g0 = clamp01((sec - r.i * .1) / .4);           // last-year dot appears
    const g = grow(sec - .35, r.i, n, s, 1.2) * k;       // then this year travels to its value
    ctx.save(); ctx.strokeStyle = s.track; ctx.lineWidth = Math.max(1, u * .12); ctx.beginPath(); ctx.moveTo(p.x0, r.y); ctx.lineTo(p.x1, r.y); ctx.stroke(); ctx.restore();
    const xa = r.xb + (r.xa - r.xb) * g;
    if (Math.abs(xa - r.xb) > .5) {
      ctx.save();
      if (s.glow > 0) { ctx.shadowColor = ca(r.ca, .8); ctx.shadowBlur = s.glow * u * .8; }
      ctx.strokeStyle = ca(r.ca, .75); ctx.lineWidth = p.lineW; ctx.lineCap = s.round > .2 ? 'round' : 'butt';
      ctx.beginPath(); ctx.moveTo(r.xb, r.y); ctx.lineTo(xa, r.y); ctx.stroke(); ctx.restore();
    }
    if (g0 > 0) { ctx.save(); ctx.globalAlpha *= g0; pointMark(ctx, r.xb, r.y, p.r * .82, r.cb, s, env.th.c.ground); ctx.restore(); }
    if (g > 0) {
      let rr = p.r;
      if (settledAll >= 0 && s.shimmer !== 'none') rr *= 1 + .1 * Math.sin(settledAll * TAU / 3 + r.i * .7);
      ctx.save(); if (s.glow > 0) { ctx.shadowColor = ca(r.ca, .9); ctx.shadowBlur = s.glow * u; } pointMark(ctx, xa, r.y, rr, r.ca, s, env.th.c.ground); ctx.restore();
    }
  }
  for (const v of p.values) {
    const g = grow(sec - .35, v.i, n, s, 1.2) * k;
    ctx.save(); ctx.globalAlpha *= clamp01(g * 2); drawText(ctx, formatValue(v.v * Math.min(1, g), v.fmt), v.spec); ctx.restore();
  }
});

// ── timeline ────────────────────────────────────────────────────────────────
registerLiveDrawer('data.timeline', (ctx, o, env) => {
  const p = o.live!.props as unknown as TimelineProps; if (!p?.nodes) return;
  const s = chartStyle(env.th), u = uOf(env), dur = 1.9;
  const { sec, k } = chartTime(o, env);
  const g = clamp01(outCubic(clamp01(sec / dur))) * k;
  const settled = sec >= dur ? sec - dur : -1;
  const [ax, ay] = p.a, [bx, by] = p.b, len = Math.hypot(bx - ax, by - ay) || 1;
  ctx.save(); ctx.strokeStyle = p.track; ctx.lineWidth = p.lineW; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  const hx = ax + (bx - ax) * g, hy = ay + (by - ay) * g;
  if (s.glow > 0) { ctx.shadowColor = ca(p.c, .85); ctx.shadowBlur = s.glow * u; }
  if (s.slab) { ctx.strokeStyle = s.slab.color; ctx.beginPath(); ctx.moveTo(ax + s.slab.dx * u * .5, ay + s.slab.dy * u * .5); ctx.lineTo(hx + s.slab.dx * u * .5, hy + s.slab.dy * u * .5); ctx.stroke(); }
  ctx.strokeStyle = p.c; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(hx, hy); ctx.stroke();
  ctx.restore();
  p.nodes.forEach((nd, i) => {
    const along = ((nd.x - ax) * (bx - ax) + (nd.y - ay) * (by - ay)) / len;
    const q = clamp01((len * g - along) / (u * 4) + (g >= 1 ? 1 : 0));
    if (q <= 0) return;
    const pr = p.r * (s.ease === 'back' || s.ease === 'out' ? Math.min(1.2, outBack(q)) : q);
    const last = i === p.nodes.length - 1;
    if (settled >= 0 && last) {
      const ph = (settled % 2.6) / 2.6;
      ctx.save(); ctx.strokeStyle = ca(p.c, .55 * (1 - ph)); ctx.lineWidth = Math.max(1, u * .14); ctx.beginPath(); ctx.arc(nd.x, nd.y, p.r * (1.3 + ph * 2.4), 0, TAU); ctx.stroke(); ctx.restore();
    }
    ctx.save(); if (s.glow > 0) { ctx.shadowColor = ca(p.c, .9); ctx.shadowBlur = s.glow * u; } pointMark(ctx, nd.x, nd.y, pr, p.c, s, env.th.c.ground); ctx.restore();
  });
  // a light travelling the line
  if (settled >= 0 && (s.shimmer === 'sweep' || s.glow > 0)) {
    const tp = (settled % 6) / 6;
    if (tp < .55) {
      const q = tp / .55, gx = ax + (bx - ax) * q, gy = ay + (by - ay) * q;
      const rg = ctx.createRadialGradient(gx, gy, 0, gx, gy, u * 2.2);
      rg.addColorStop(0, 'rgba(255,255,255,.7)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.save(); ctx.globalCompositeOperation = env.th.dark ? 'lighter' : 'screen'; ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(gx, gy, u * 2.2, 0, TAU); ctx.fill(); ctx.restore();
    }
  }
});

// ── pictogram (icon array) ──────────────────────────────────────────────────
function icon(ctx: Ctx, kind: PictoProps['icon'], x: number, y: number, s: number) {
  ctx.beginPath();
  const cx = x + s / 2;
  switch (kind) {
    case 'heart': {
      const t = y + s * .3;
      ctx.moveTo(cx, y + s * .92);
      ctx.bezierCurveTo(x - s * .05, y + s * .55, x + s * .02, t - s * .25, cx - s * .25, t - s * .2);
      ctx.bezierCurveTo(cx - s * .1, t - s * .2, cx, t - s * .05, cx, t);
      ctx.bezierCurveTo(cx, t - s * .05, cx + s * .1, t - s * .2, cx + s * .25, t - s * .2);
      ctx.bezierCurveTo(x + s * .98, t - s * .25, x + s * 1.05, y + s * .55, cx, y + s * .92);
      ctx.closePath(); break;
    }
    case 'house':
      ctx.moveTo(cx, y + s * .06); ctx.lineTo(x + s * .96, y + s * .48); ctx.lineTo(x + s * .84, y + s * .48); ctx.lineTo(x + s * .84, y + s * .94);
      ctx.lineTo(x + s * .6, y + s * .94); ctx.lineTo(x + s * .6, y + s * .66); ctx.lineTo(x + s * .4, y + s * .66); ctx.lineTo(x + s * .4, y + s * .94);
      ctx.lineTo(x + s * .16, y + s * .94); ctx.lineTo(x + s * .16, y + s * .48); ctx.lineTo(x + s * .04, y + s * .48); ctx.closePath(); break;
    case 'meal':
      ctx.moveTo(x + s * .04, y + s * .5); ctx.lineTo(x + s * .96, y + s * .5);
      ctx.bezierCurveTo(x + s * .96, y + s * .8, x + s * .74, y + s * .9, cx, y + s * .9);
      ctx.bezierCurveTo(x + s * .26, y + s * .9, x + s * .04, y + s * .8, x + s * .04, y + s * .5); ctx.closePath();
      ctx.moveTo(x + s * .34 + s * .06, y + s * .14); ctx.arc(x + s * .34, y + s * .14 + s * .0, s * .06, 0, TAU);
      ctx.moveTo(x + s * .58 + s * .07, y + s * .26); ctx.arc(x + s * .58, y + s * .26, s * .07, 0, TAU);
      break;
    default: // person
      ctx.arc(cx, y + s * .2, s * .17, 0, TAU);
      ctx.moveTo(x + s * .18, y + s * .96);
      ctx.lineTo(x + s * .18, y + s * .62); ctx.quadraticCurveTo(x + s * .18, y + s * .42, cx, y + s * .42);
      ctx.quadraticCurveTo(x + s * .82, y + s * .42, x + s * .82, y + s * .62); ctx.lineTo(x + s * .82, y + s * .96); ctx.closePath();
  }
}
registerLiveDrawer('data.picto', (ctx, o, env) => {
  const p = o.live!.props as unknown as PictoProps; if (!p?.cells) return;
  const s = chartStyle(env.th), u = uOf(env), n = p.cells.length;
  const { sec, k } = chartTime(o, env);
  const fillDur = 1.8, per = fillDur / Math.max(1, Math.ceil(p.on));
  const settled = sec - (.3 + fillDur + .4);
  p.cells.forEach((c, i) => {
    const appear = clamp01((sec - (i / n) * .5) / .35);
    if (appear <= 0) return;
    const sc = s.ease === 'back' ? Math.min(1.1, outBack(appear)) : outCubic(appear);
    const ss = c.s * sc, x = c.x + (c.s - ss) / 2, y = c.y + (c.s - ss) / 2;
    ctx.save(); ctx.fillStyle = p.cOff; icon(ctx, p.icon, x, y, ss); ctx.fill(); ctx.restore();
    const lit = clamp01(Math.min(p.on - i, 1)) * clamp01((sec - .3 - i * per) / .3) * k;
    if (lit <= 0) return;
    ctx.save();
    const whole = Math.min(1, p.on - i);
    if (whole < 1) { ctx.beginPath(); ctx.rect(x, y, ss * whole, ss); ctx.clip(); }
    let a = lit;
    if (settled >= 0 && s.shimmer !== 'none') a *= .86 + .14 * Math.sin(settled * TAU / 3.4 - i * .45);
    ctx.globalAlpha *= a;
    if (s.slab) { ctx.save(); ctx.translate(s.slab.dx * u * .4, s.slab.dy * u * .4); ctx.fillStyle = s.slab.color; icon(ctx, p.icon, x, y, ss); ctx.fill(); ctx.restore(); }
    if (s.glow > 0) { ctx.shadowColor = ca(p.cOn, .9); ctx.shadowBlur = s.glow * u * .8; }
    ctx.fillStyle = p.cOn; icon(ctx, p.icon, x, y, ss); ctx.fill();
    if (s.outline) { ctx.shadowBlur = 0; ctx.strokeStyle = s.outline.color; ctx.lineWidth = Math.max(1, s.outline.w * u * .6); icon(ctx, p.icon, x, y, ss); ctx.stroke(); }
    ctx.restore();
  });
});
