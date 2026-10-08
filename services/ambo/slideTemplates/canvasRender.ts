// canvasRender — draws slide-template objects straight onto Canvas2D.
//
// Why not SVG → Image → canvas: an SVG rasterised through an <img> cannot use
// the page's web fonts, so every Cinzel/Anton/Fraunces title would fall back to
// Times. Drawing TelaVectorObjects natively keeps the document's loaded fonts,
// uses the same text layout as telaText/TelaVector (baseline = y + size, same
// wrapping, same tracking), and lets us animate per object.
//
// Motion model (all deterministic from a clock):
//   entrance — staggered by entrance group (ground → ornaments → kicker →
//              title → body), styled by the theme (rise, wipe, slam, glow…)
//   ambient  — only ornaments carrying `amb` move (drift/spin/orbit/pulse/
//              sweep); text people are reading never moves
//   exit     — reverse stagger, theme-styled, short
import { layoutTextLines, fontShorthand } from '../../tela/telaText';
import { ensureFontsForObjects } from '../../tela/telaFonts';
import { lay, objBox, type Lay } from './layout';
import { themeById } from './themes';
import { buildSlideObjects, resolveTheme } from './registry';
import type { SlideObj, SlideTheme } from './types';
import { liveDrawer, type SlideHost } from './live';

type Ctx = CanvasRenderingContext2D;

export interface FrameClock {
  /** Ambient time (s). */
  t: number;
  /** Seconds since the entrance began (Infinity = fully entered). */
  enterT: number;
  /** Seconds since the exit began, or < 0 when not exiting. */
  exitT: number;
  reduced?: boolean;
  /** Entrance applies only to groups ≥ this (a field edit re-enters just the words). */
  enterFromGroup?: number;
  /** Per-source context for live drawers (absent in galleries / thumbnails). */
  host?: SlideHost;
}

/** Set by drawSlideObjects so drawObject can hand live drawers their env. */
let liveCtx: { th: SlideTheme; W: number; H: number; reduced: boolean; host?: SlideHost } | null = null;

export function slideTemplateTiming(theme?: string | SlideTheme, reduced = false): { enterSec: number; exitSec: number; enterMs: number; exitMs: number } {
  const th = typeof theme === 'object' ? theme : themeById(theme);
  const enterSec = reduced ? .45 : th.motion.enterSec, exitSec = reduced ? .3 : th.motion.exitSec;
  return { enterSec, exitSec, enterMs: Math.round(enterSec * 1000), exitMs: Math.round(exitSec * 1000) };
}

export function prefersReducedMotion(): boolean {
  try { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

// ── easing ───────────────────────────────────────────────────────────────────
const clamp01 = (v: number) => v < 0 ? 0 : v > 1 ? 1 : v;
const outCubic = (p: number) => 1 - Math.pow(1 - p, 3);
const inCubic = (p: number) => p * p * p;
const outBack = (p: number) => { const c = 1.7, q = p - 1; return 1 + (c + 1) * q * q * q + c * q * q; };
const outSine = (p: number) => Math.sin(p * Math.PI / 2);
/** Damped bounce landing (drop). */
const outBounce = (p: number) => 1 - Math.cos(p * Math.PI * 2.5) * Math.pow(1 - p, 2.2);
/** Deterministic 0..1 noise for an integer step (no allocation). */
const hash1 = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
/** Neon strike: lit/unlit steps that settle to fully lit at p = 1. */
const strike = (p: number, k: number) => p >= .82 ? 1 : hash1(Math.floor(p * 18) + k * 13) < .35 + p * .6 ? Math.min(1, .25 + p) : .04;

interface Anim { alpha: number; dx: number; dy: number; scale: number; scaleX: number; wipe0: number; wipe1: number; blur: number; rot: number; vw0: number; vw1: number }
const IDLE: Anim = { alpha: 1, dx: 0, dy: 0, scale: 1, scaleX: 1, wipe0: 0, wipe1: 1, blur: 0, rot: 0, vw0: 0, vw1: 1 };

const GROUP_AT = [0, .12, .32, .45, .62];
const isRule = (o: SlideObj, u: number) => o.kind === 'LINE' || (o.kind === 'RECT' && o.h <= u * .5 && o.w > o.h * 6);

function computeAnim(o: SlideObj, k: number, th: SlideTheme, L: Lay, c: FrameClock): Anim {
  const g = o.grp ?? 1, u = L.u;
  const a: Anim = { ...IDLE };
  // Exit takes precedence.
  if (c.exitT >= 0) {
    const ex = c.reduced ? .3 : th.motion.exitSec, dur = ex * .6;
    const delay = ((4 - g) / 4) * (ex - dur) * (g === 0 ? 1 : .8);
    const q = clamp01((c.exitT - delay) / dur), e = inCubic(q);
    a.alpha = 1 - e;
    if (c.reduced || g === 0) return a;
    switch (th.motion.exit) {
      case 'fade-up': a.dy = -e * u * 1.2; break;
      case 'slide': a.dx = -e * u * 9; a.alpha = 1 - clamp01(q * 1.3); break;
      case 'wipe-out': a.wipe0 = e; a.alpha = 1 - e * .25; break;
      case 'zoom-fade': a.scale = 1 + e * .045; break;
      case 'float-up': a.dy = -e * u * 2.6; break;
      case 'drop': a.dy = e * u * 4.5; a.rot = e * ((k % 3) - 1) * 2.5; break;
      case 'shrink': a.scale = 1 - e * .08; break;
      case 'slide-right': a.dx = e * u * 9; a.alpha = 1 - clamp01(q * 1.3); break;
      case 'glitch-out': { const n = Math.floor(c.exitT * 22) + k * 7; a.dx = (hash1(n) - .5) * u * 3 * (.3 + q); a.alpha = hash1(n + 3) < q * 1.1 ? 0 : 1 - q * .5; break; }
      case 'flicker-out': a.alpha = q >= .9 ? 0 : (1 - q * .4) * (hash1(Math.floor(q * 16) + k * 5) < q * .9 ? .08 : 1); break;
      case 'scan-out': a.vw0 = e; a.alpha = 1 - e * .2; break;
      default: break;
    }
    return a;
  }
  if (!Number.isFinite(c.enterT) || g < (c.enterFromGroup ?? 0)) return a;
  const en = c.reduced ? .45 : th.motion.enterSec;
  if (g === 0) { a.alpha = outCubic(clamp01(c.enterT / Math.min(.4, en * .4))); return a; }
  const dur = c.reduced ? .4 : en * .55;
  const delay = c.reduced ? 0 : Math.min(GROUP_AT[g] / .62 * (en - dur) + (k % 6) * .025, en - dur);
  const p = clamp01((c.enterT - delay) / dur);
  if (c.reduced) { a.alpha = p; return a; }
  const e = outCubic(p);
  const rule = th.motion.ruleGrow && isRule(o, u);
  switch (th.motion.enter) {
    case 'rise': a.alpha = e; if (rule) a.scaleX = e; else a.dy = (1 - e) * u * 1.8; break;
    case 'fade': a.alpha = e; if (rule) a.wipe1 = e; break;
    case 'slam': {
      a.alpha = clamp01(p * 4);
      if (o.kind === 'RECT' || o.kind === 'PATH') a.wipe1 = e;
      else a.scale = 1 + .2 * (1 - outBack(p));
      break;
    }
    case 'wipe': a.wipe1 = e; a.alpha = clamp01(p * 3); break;
    case 'glow': a.alpha = e; a.scale = .94 + .06 * e; if (o.kind === 'TEXT') a.blur = (1 - e) * u * .5; if (rule) a.scaleX = e; break;
    case 'reveal': a.alpha = Math.pow(e, 1.6); a.scale = 1.05 - .05 * e; if (rule) a.scaleX = e; break;
    case 'float': { const s = outSine(p); a.alpha = s; a.dy = (1 - s) * u * 3.4; if (rule) a.scaleX = s; break; }
    case 'drop': a.alpha = clamp01(p * 3); if (rule) a.scaleX = e; else a.dy = -(1 - outBounce(p)) * u * 3.2; break;
    case 'pop': a.alpha = clamp01(p * 3); if (rule) a.scaleX = e; else a.scale = Math.max(.001, .55 + .45 * outBack(p)); break;
    case 'tilt': a.alpha = e; a.rot = (1 - e) * ((k % 2) ? 6 : -6); a.dx = (1 - e) * u * -2.2; a.dy = (1 - e) * u * 1.2; break;
    case 'glitch': {
      const n = Math.floor(c.enterT * 24) + k * 7, live = 1 - p;
      a.alpha = p >= .7 ? e : hash1(n + 5) < .3 ? .15 : e * .9 + .1;
      a.dx = p >= .7 ? 0 : (hash1(n) - .5) * u * 4 * live; a.dy = p >= .7 ? 0 : (hash1(n + 1) > .8 ? (hash1(n + 2) - .5) * u : 0);
      break;
    }
    case 'flicker': a.alpha = o.kind === 'TEXT' || g >= 2 ? strike(p, k) : e; break;
    case 'scan': a.vw1 = e; a.alpha = clamp01(p * 3); break;
    case 'stamp': { a.alpha = clamp01(p * 6); const s = clamp01(p * 1.6); a.scale = 1 + .45 * Math.pow(1 - s, 3); break; }
    case 'stretch': a.alpha = clamp01(p * 2.5); a.scaleX = Math.max(.001, e); break;
  }
  return a;
}

/** Fold ambient motion into an animation (ornaments only). */
function applyAmbient(o: SlideObj, a: Anim, t: number): void {
  const m = o.amb; if (!m) return;
  const TAU = Math.PI * 2;
  switch (m.kind) {
    case 'drift': { const ph = (m.phase || 0) * TAU; a.dx += m.ax * Math.sin(TAU * t / m.period + ph); a.dy += m.ay * Math.sin(TAU * t / (m.period * 1.37) + ph + 1); break; }
    case 'spin': a.rot += m.degPerSec * t; break;
    case 'pulse': { const s = .5 + .5 * Math.sin(TAU * t / m.period + (m.phase || 0) * TAU); a.alpha *= m.min + (m.max - m.min) * s; break; }
    case 'orbit': {
      const b = objBox(o), vx = b.cx - m.cx, vy = b.cy - m.cy;
      const tilt = (m.tilt || 0) * Math.PI / 180, sq = m.squash ?? 1, ang = m.degPerSec * t * Math.PI / 180;
      // Into the orbit's own frame (untilt, unsquash), rotate, and back out.
      const ux = vx * Math.cos(-tilt) - vy * Math.sin(-tilt), uy = (vx * Math.sin(-tilt) + vy * Math.cos(-tilt)) / Math.max(.05, sq);
      const rx = ux * Math.cos(ang) - uy * Math.sin(ang), ry = (ux * Math.sin(ang) + uy * Math.cos(ang)) * sq;
      const nx = rx * Math.cos(tilt) - ry * Math.sin(tilt), ny = rx * Math.sin(tilt) + ry * Math.cos(tilt);
      a.dx += nx - vx; a.dy += ny - vy; break;
    }
    case 'jitter': { const n = Math.floor(t / m.step + (m.phase || 0) * 97); a.dx += m.ax * (hash1(n) - .5) * 2; a.dy += m.ay * (hash1(n + 17) - .5) * 2; break; }
    case 'flicker': { const n = Math.floor(t * m.rate + (m.phase || 0) * 31); const h = hash1(n); a.alpha *= h < .08 ? 1 - m.depth : h < .16 ? 1 - m.depth * .45 : 1; break; }
    case 'sway': a.rot += m.deg * Math.sin(TAU * t / m.period + (m.phase || 0) * TAU); break;
    case 'scroll': { const f = t / m.period - Math.floor(t / m.period); a.dx += m.dx * f; a.dy += m.dy * f; break; }
    default: break;
  }
}

// ── colour & paint ───────────────────────────────────────────────────────────
function rgba(color: string, opacity?: number): string {
  if (opacity === undefined || opacity >= 1) return color;
  const m = color.replace('#', '');
  if (/^[0-9a-f]{6}$/i.test(m)) return `rgba(${parseInt(m.slice(0, 2), 16)},${parseInt(m.slice(2, 4), 16)},${parseInt(m.slice(4, 6), 16)},${opacity})`;
  if (/^[0-9a-f]{3}$/i.test(m)) return `rgba(${parseInt(m[0] + m[0], 16)},${parseInt(m[1] + m[1], 16)},${parseInt(m[2] + m[2], 16)},${opacity})`;
  return color;
}

function linearFor(ctx: Ctx, o: SlideObj, b: { x: number; y: number; w: number; h: number }): CanvasGradient {
  const ang = (o.gradient!.angle ?? 0) * Math.PI / 180, cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const g = ctx.createLinearGradient(cx - Math.cos(ang) * b.w / 2, cy - Math.sin(ang) * b.h / 2, cx + Math.cos(ang) * b.w / 2, cy + Math.sin(ang) * b.h / 2);
  for (const s of o.gradient!.stops) g.addColorStop(clamp01(s.offset), rgba(s.color, s.opacity));
  return g;
}

/** Fill the current path (built by `trace`) with o's fill or gradient. */
function paintFill(ctx: Ctx, o: SlideObj, trace: () => void, rule: CanvasFillRule = 'nonzero', path?: Path2D) {
  const b = objBox(o);
  const fillP = () => { if (path) ctx.fill(path, rule); else { ctx.beginPath(); trace(); ctx.fill(rule); } };
  if (o.gradient && o.gradient.stops.length) {
    if (o.shadow) { // canvas clips shadows of clipped fills — lay a solid underpaint for the shadow first
      ctx.save(); ctx.fillStyle = rgba(o.gradient.stops[o.gradient.stops.length - 1].color, 1); fillP(); ctx.restore();
      ctx.shadowColor = 'transparent';
    }
    if (o.gradient.kind === 'RADIAL') {
      ctx.save();
      if (path) ctx.clip(path, rule); else { ctx.beginPath(); trace(); ctx.clip(rule); }
      ctx.shadowColor = 'transparent';
      ctx.translate(b.x + b.w / 2, b.y + b.h / 2); ctx.scale(Math.max(.01, b.w / 2), Math.max(.01, b.h / 2));
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      for (const s of o.gradient.stops) g.addColorStop(clamp01(s.offset), rgba(s.color, s.opacity));
      ctx.fillStyle = g; ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();
    } else { ctx.fillStyle = linearFor(ctx, o, b); fillP(); }
    return;
  }
  if (!o.fill || o.fill === 'none') return;
  ctx.fillStyle = o.fill; fillP();
}

function paintStroke(ctx: Ctx, o: SlideObj, trace: () => void, width = o.strokeWidth, path?: Path2D) {
  if (!o.stroke || o.stroke === 'none' || !(width > 0)) return;
  ctx.save(); ctx.shadowColor = o.kind === 'LINE' ? ctx.shadowColor : 'transparent';
  ctx.strokeStyle = o.stroke; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (o.strokeDash?.length) ctx.setLineDash(o.strokeDash);
  if (path) ctx.stroke(path); else { ctx.beginPath(); trace(); ctx.stroke(); }
  ctx.restore();
}

const pathCache = new Map<string, Path2D>();
function path2d(d: string): Path2D | null {
  if (typeof Path2D === 'undefined') return null;
  let p = pathCache.get(d);
  if (!p) { try { p = new Path2D(d); } catch { return null; } if (pathCache.size > 400) pathCache.clear(); pathCache.set(d, p); }
  return p;
}

// ── images ───────────────────────────────────────────────────────────────────
const images = new Map<string, HTMLImageElement>();
const imageListeners = new Set<() => void>();
/** Called when any slide image finishes loading (sources re-cache). */
export function onSlideImageLoad(fn: () => void): () => void { imageListeners.add(fn); return () => imageListeners.delete(fn); }
function imageFor(src: string): HTMLImageElement | null {
  if (typeof Image === 'undefined' || !src) return null;
  let img = images.get(src);
  if (!img) {
    img = new Image(); img.crossOrigin = 'anonymous'; img.decoding = 'async';
    img.onload = () => imageListeners.forEach(f => { try { f(); } catch { /* */ } });
    img.src = src; images.set(src, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

// ── countdown ────────────────────────────────────────────────────────────────
export function parseClockTime(s: string, now = new Date()): Date | null {
  const m = (s || '').trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?$/i);
  if (!m) return null;
  let h = +m[1]; const min = +(m[2] || 0); const ap = m[3]?.toLowerCase();
  if (ap?.startsWith('p') && h < 12) h += 12;
  if (ap?.startsWith('a') && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  const d = new Date(now); d.setHours(h, min, 0, 0);
  return d;
}
export function countdownText(target: string, fallback: string, nowMs = Date.now()): string {
  const d = parseClockTime(target, new Date(nowMs));
  if (!d) return fallback || target;
  const rem = Math.ceil((d.getTime() - nowMs) / 1000);
  if (rem <= 0) return fallback;
  const h = Math.floor(rem / 3600), mm = Math.floor((rem % 3600) / 60), ss = rem % 60;
  return h ? `${h}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${mm}:${String(ss).padStart(2, '0')}`;
}

// ── text ─────────────────────────────────────────────────────────────────────
const hasLetterSpacing = (ctx: Ctx) => 'letterSpacing' in ctx;
function drawTextObj(ctx: Ctx, o: SlideObj, override?: string) {
  let size = o.fontSize || 24;
  const align = o.textAlign || 'left';
  ctx.font = fontShorthand(o);
  let lines = layoutTextLines(o, override);
  // Shrink-to-fit (slide editor): step the size down until the wrapped text fits the box height.
  if (o.autoFit && override === undefined && o.h > 0) {
    let s = size;
    for (let i = 0; i < 16 && s > 8 && lines.length * s * (o.lineHeight ?? 1.22) > o.h; i++) {
      s *= .92; lines = layoutTextLines({ ...o, fontSize: s }, override);
    }
    if (s !== size) { size = s; ctx.font = fontShorthand({ ...o, fontSize: size }); }
  }
  const ls = (o.letterSpacing || 0) * size;
  if (override !== undefined) { // live text: shrink to the box instead of wrapping
    const w = Math.max(...lines.map(l => ctx.measureText(l).width + ls * Math.max(0, l.length - 1)));
    if (w > o.w && w > 0) { size = size * o.w / w; ctx.font = fontShorthand({ ...o, fontSize: size }); }
    lines = [lines.join(' ')];
  }
  const lsPx = (o.letterSpacing || 0) * size;
  const leading = size * (o.lineHeight ?? 1.22);
  const blockH = size + Math.max(0, lines.length - 1) * leading;
  const dyV = o.vAlign === 'middle' ? Math.max(0, (o.h - blockH) / 2) : o.vAlign === 'bottom' ? Math.max(0, o.h - blockH) : 0;
  const ax = align === 'center' ? o.x + o.w / 2 : align === 'right' ? o.x + o.w : o.x;
  ctx.textBaseline = 'alphabetic';
  if (o.gradient && o.gradient.stops.length) ctx.fillStyle = linearFor(ctx, o, o); else ctx.fillStyle = o.fill && o.fill !== 'none' ? o.fill : '#000';
  const outlined = o.stroke && o.stroke !== 'none' && o.strokeWidth > 0;
  if (outlined) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.strokeWidth; ctx.lineJoin = 'round'; }
  const native = hasLetterSpacing(ctx);
  if (native) (ctx as any).letterSpacing = `${lsPx}px`;
  lines.forEach((ln, i) => {
    const y = o.y + dyV + size + i * leading;
    if (o.underline || o.strike) {
      const wLn = ctx.measureText(ln).width + lsPx * Math.max(0, Array.from(ln).length - 1);
      const x0 = align === 'center' ? ax - wLn / 2 : align === 'right' ? ax - wLn : ax;
      ctx.save(); ctx.strokeStyle = ctx.fillStyle as string; ctx.lineWidth = Math.max(1, size / 16); ctx.shadowColor = 'transparent';
      ctx.beginPath();
      if (o.underline) { ctx.moveTo(x0, y + size * .1); ctx.lineTo(x0 + wLn, y + size * .1); }
      if (o.strike) { ctx.moveTo(x0, y - size * .3); ctx.lineTo(x0 + wLn, y - size * .3); }
      ctx.stroke(); ctx.restore();
    }
    if (native || !lsPx) {
      ctx.textAlign = align;
      // Canvas adds tracking after the last glyph too; recentre like SVG does.
      const x = align === 'center' ? ax + lsPx / 2 : align === 'right' ? ax + lsPx : ax;
      if (outlined) ctx.strokeText(ln, x, y);
      ctx.fillText(ln, x, y);
    } else {
      const chars = Array.from(ln);
      const total = chars.reduce((w, ch) => w + ctx.measureText(ch).width, 0) + lsPx * Math.max(0, chars.length - 1);
      let x = align === 'center' ? ax - total / 2 : align === 'right' ? ax - total : ax;
      ctx.textAlign = 'left';
      for (const ch of chars) { if (outlined) ctx.strokeText(ch, x, y); ctx.fillText(ch, x, y); x += ctx.measureText(ch).width + lsPx; }
    }
  });
  if (native) (ctx as any).letterSpacing = '0px';
}

// ── one object ───────────────────────────────────────────────────────────────
function roundRectPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  if (!rr) { ctx.rect(x, y, w, h); return; }
  ctx.moveTo(x + rr, y); ctx.arcTo(x + w, y, x + w, y + h, rr); ctx.arcTo(x + w, y + h, x, y + h, rr); ctx.arcTo(x, y + h, x, y, rr); ctx.arcTo(x, y, x + w, y, rr); ctx.closePath();
}

export function drawObject(ctx: Ctx, o: SlideObj, a: Anim = IDLE, t = 0): void {
  const alpha = (o.opacity ?? 1) * a.alpha;
  if (alpha <= .003 || o.hidden) return;
  const b = objBox(o);
  ctx.save();
  ctx.globalAlpha *= clamp01(alpha);
  if (o.blendMode && o.blendMode !== 'normal') ctx.globalCompositeOperation = o.blendMode as GlobalCompositeOperation;
  if (a.dx || a.dy) ctx.translate(a.dx, a.dy);
  if (a.scale !== 1 || a.scaleX !== 1) { ctx.translate(b.cx, b.cy); ctx.scale(Math.max(.001, a.scale * a.scaleX), Math.max(.001, a.scale)); ctx.translate(-b.cx, -b.cy); }
  if (a.wipe0 > 0 || a.wipe1 < 1) {
    const pad = o.kind === 'TEXT' ? (o.fontSize || 20) * .5 : Math.max(2, o.strokeWidth || 0);
    const x0 = b.x + b.w * a.wipe0 - (a.wipe0 > 0 ? 0 : pad), x1 = b.x + b.w * a.wipe1 + (a.wipe1 < 1 ? 0 : pad);
    ctx.beginPath(); ctx.rect(x0, b.y - pad, Math.max(0, x1 - x0), b.h + pad * 2); ctx.clip();
  }
  if (a.vw0 > 0 || a.vw1 < 1) {
    const pad = o.kind === 'TEXT' ? (o.fontSize || 20) * .5 : Math.max(2, o.strokeWidth || 0);
    const y0 = b.y + b.h * a.vw0 - (a.vw0 > 0 ? 0 : pad), y1 = b.y + b.h * a.vw1 + (a.vw1 < 1 ? 0 : pad);
    ctx.beginPath(); ctx.rect(b.x - pad, y0, b.w + pad * 2, Math.max(0, y1 - y0)); ctx.clip();
  }
  const rot = (o.rotation || 0) + a.rot;
  if (rot) { ctx.translate(b.cx, b.cy); ctx.rotate(rot * Math.PI / 180); ctx.translate(-b.cx, -b.cy); }
  if (o.shadow) { ctx.shadowColor = o.shadow.color; ctx.shadowBlur = o.shadow.blur * 2; ctx.shadowOffsetX = o.shadow.x; ctx.shadowOffsetY = o.shadow.y; }
  const blur = (o.blur || 0) + a.blur;
  if (blur > .2) ctx.filter = `blur(${blur.toFixed(1)}px)`;

  const ld = o.live ? liveDrawer(o.live.drawer) : undefined;
  if (ld) {
    const env = liveCtx;
    try { ld(ctx, o, { t, th: env?.th ?? themeById(undefined), W: env?.W ?? o.w, H: env?.H ?? o.h, alpha: a.alpha, reduced: !!env?.reduced, host: env?.host }); } catch { /* a bad drawer never blanks the slide */ }
    ctx.restore();
    return;
  }
  switch (o.kind) {
    case 'RECT': {
      const trace = () => roundRectPath(ctx, o.x, o.y, o.w, o.h, o.rx || 0);
      paintFill(ctx, o, trace); paintStroke(ctx, o, trace); break;
    }
    case 'ELLIPSE': {
      const trace = () => ctx.ellipse(o.x + o.w / 2, o.y + o.h / 2, Math.max(0, o.w / 2), Math.max(0, o.h / 2), 0, 0, Math.PI * 2);
      paintFill(ctx, o, trace); paintStroke(ctx, o, trace); break;
    }
    case 'LINE': {
      const p = o.points || [o.x, o.y, o.x + o.w, o.y + o.h];
      paintStroke(ctx, o, () => { ctx.moveTo(p[0], p[1]); ctx.lineTo(p[2], p[3]); });
      break;
    }
    case 'PATH': {
      if (!o.svgPathData) break;
      const p = path2d(o.svgPathData); if (!p) break;
      const ox = o.pathOriginX ?? 0, oy = o.pathOriginY ?? 0;
      const sx = o.w / Math.max(1e-6, o.pathOriginW ?? o.w), sy = o.h / Math.max(1e-6, o.pathOriginH ?? o.h);
      ctx.translate(o.x, o.y); ctx.scale(sx, sy); ctx.translate(-ox, -oy);
      // Gradient boxes are authored in artboard px; this path draws in its origin space.
      const local: SlideObj = { ...o, x: ox, y: oy, w: o.pathOriginW ?? o.w, h: o.pathOriginH ?? o.h };
      if (o.pathClosed !== false) paintFill(ctx, local, () => {}, 'evenodd', p);
      paintStroke(ctx, o, () => {}, o.strokeWidth / Math.max(1e-4, Math.sqrt(Math.abs(sx * sy))), p);
      break;
    }
    case 'TEXT': {
      let override: string | undefined;
      if (o.amb?.kind === 'countdown') override = countdownText(o.amb.target, o.amb.fallback);
      drawTextObj(ctx, o, override);
      break;
    }
    case 'IMAGE': {
      const img = o.sourceImageSrc ? imageFor(o.sourceImageSrc) : null;
      if (!img) break;
      ctx.beginPath(); roundRectPath(ctx, o.x, o.y, o.w, o.h, o.rx || 0); ctx.clip();
      const cr = o.imageCrop, sw0 = cr ? img.naturalWidth * cr.w : img.naturalWidth, sh0 = cr ? img.naturalHeight * cr.h : img.naturalHeight;
      const sx0 = cr ? img.naturalWidth * cr.x : 0, sy0 = cr ? img.naturalHeight * cr.y : 0;
      if (o.imageFit === 'fill') { ctx.drawImage(img, sx0, sy0, sw0, sh0, o.x, o.y, o.w, o.h); break; }
      const s = (o.imageFit === 'contain' ? Math.min : Math.max)(o.w / sw0, o.h / sh0), dw = sw0 * s, dh = sh0 * s;
      ctx.drawImage(img, sx0, sy0, sw0, sh0, o.x + (o.w - dw) / 2, o.y + (o.h - dh) / 2, dw, dh);
      break;
    }
  }
  ctx.restore();

  // Light sweep: a soft highlight travelling along a rule.
  if (o.amb?.kind === 'sweep' && (o.kind === 'LINE' || o.kind === 'RECT') && a.alpha > .5) {
    const m = o.amb, len = Math.max(b.w, b.h), horiz = b.w >= b.h;
    const cyc = ((t / m.period + (m.phase || 0)) % 1 + 1) % 1, hw = len * (m.width ?? .25);
    const pos = -hw + cyc * (len + hw * 2);
    ctx.save();
    ctx.globalAlpha *= clamp01(alpha);
    if (a.dx || a.dy) ctx.translate(a.dx, a.dy);
    ctx.globalCompositeOperation = 'lighter';
    const g = horiz ? ctx.createLinearGradient(b.x + pos - hw, 0, b.x + pos + hw, 0) : ctx.createLinearGradient(0, b.y + pos - hw, 0, b.y + pos + hw);
    g.addColorStop(0, rgba(m.color, 0)); g.addColorStop(.5, rgba(m.color, .9)); g.addColorStop(1, rgba(m.color, 0));
    if (o.kind === 'LINE') { const p = o.points!; ctx.strokeStyle = g; ctx.lineWidth = Math.max(1, o.strokeWidth) * 1.6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[2], p[3]); ctx.stroke(); }
    else { ctx.fillStyle = g; ctx.beginPath(); roundRectPath(ctx, o.x, o.y, o.w, o.h, o.rx || 0); ctx.fill(); }
    ctx.restore();
  }
}

// ── whole slide ──────────────────────────────────────────────────────────────

/** Per-object order inside its entrance group (drives the stagger). */
function groupOrder(objs: SlideObj[]): number[] {
  const n: number[] = [0, 0, 0, 0, 0];
  return objs.map(o => { const g = o.grp ?? 1; return n[g]++; });
}

/** Draw a set of objects (optionally a subset) for a clock. */
export function drawSlideObjects(ctx: Ctx, objs: SlideObj[], th: SlideTheme, W: number, H: number, clock: FrameClock, include?: (o: SlideObj, i: number) => boolean): void {
  const L = lay(W, H), order = groupOrder(objs);
  const t = clock.reduced ? 0 : clock.t;
  liveCtx = { th, W, H, reduced: !!clock.reduced, host: clock.host };
  for (let i = 0; i < objs.length; i++) {
    const o = objs[i];
    if (include && !include(o, i)) continue;
    try {
      const a = computeAnim(o, order[i], th, L, clock);
      if (!clock.reduced) applyAmbient(o, a, t);
      else if (o.amb?.kind === 'pulse') a.alpha *= (o.amb.min + o.amb.max) / 2;
      drawObject(ctx, o, a, t);
    } catch { /* one bad object never blanks the slide */ }
  }
}

/** A clean labelled card for when a template cannot be drawn. */
export function drawFallbackCard(ctx: Ctx, W: number, H: number, label: string): void {
  ctx.save();
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1b1530'); g.addColorStop(1, '#0d0a18');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(208,188,255,0.35)'; ctx.lineWidth = Math.max(1, H * .003);
  const m = Math.min(W, H) * .06; ctx.strokeRect(m, m, W - m * 2, H - m * 2);
  ctx.fillStyle = '#F2EEFF'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `600 ${Math.round(Math.min(H * .06, W * .05))}px Inter, system-ui, sans-serif`;
  ctx.fillText(label || 'Slide', W / 2, H / 2, W * .8);
  ctx.restore();
}

// ── pure render entry (for galleries / artifacts) ────────────────────────────
const memo = new Map<string, SlideObj[] | null>();
function memoBuild(templateId: string, theme: string | undefined, fields: Record<string, string> | undefined, w: number, h: number, fontEpoch: number): SlideObj[] | null {
  const key = `${templateId}|${theme}|${w}x${h}|${fontEpoch}|${JSON.stringify(fields || {})}`;
  if (memo.has(key)) return memo.get(key)!;
  const objs = buildSlideObjects(templateId, theme, fields, w, h);
  if (memo.size > 120) memo.clear();
  memo.set(key, objs);
  return objs;
}
let fontEpoch = 0;
/** Bump after fonts load so memoised layouts re-measure with the real metrics. */
export function invalidateSlideLayouts(): void { fontEpoch++; memo.clear(); }

/**
 * Draw one frame of a slide template.
 *   t        ambient clock in seconds
 *   enterP   entrance progress 0..1 (omit or ≥1 = fully entered)
 *   exitP    exit progress 0..1 (omit or 0 = not exiting)
 */
export function renderSlideTemplate(
  ctx: CanvasRenderingContext2D, templateId: string, theme: string | undefined, fields: Record<string, string> | undefined,
  w: number, h: number, opts: { t?: number; enterP?: number; exitP?: number; reducedMotion?: boolean; host?: SlideHost } = {},
): void {
  const reduced = !!opts.reducedMotion;
  const th = resolveTheme(theme, fields);
  try {
    const objs = memoBuild(templateId, theme, fields, w, h, fontEpoch);
    if (!objs) { drawFallbackCard(ctx, w, h, fields?.title || templateId); return; }
    const tm = slideTemplateTiming(th, reduced);
    const enterP = opts.enterP ?? 1, exitP = opts.exitP ?? 0;
    const clock: FrameClock = { t: opts.t ?? 0, enterT: enterP >= 1 ? Infinity : Math.max(0, enterP) * tm.enterSec, exitT: exitP > 0 ? exitP * tm.exitSec : -1, reduced, host: opts.host };
    ctx.save(); ctx.clearRect(0, 0, w, h);
    drawSlideObjects(ctx, objs, th, w, h, clock);
    ctx.restore();
  } catch {
    try { drawFallbackCard(ctx, w, h, fields?.title || templateId); } catch { /* */ }
  }
}

// ── fonts ────────────────────────────────────────────────────────────────────
const fontPromises = new Map<string, Promise<void>>();
function linksLoaded(timeoutMs: number): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[data-tela-fonts]'));
  const each = links.map(l => l.sheet ? Promise.resolve() : new Promise<void>(res => { l.addEventListener('load', () => res(), { once: true }); l.addEventListener('error', () => res(), { once: true }); }));
  return Promise.race([Promise.all(each).then(() => undefined), new Promise<void>(res => setTimeout(res, timeoutMs))]);
}
/** Inject the Google Fonts a slide uses and resolve once its faces are usable on canvas. */
export function loadSlideFonts(objs: SlideObj[]): Promise<void> {
  if (typeof document === 'undefined' || !(document as any).fonts) return Promise.resolve();
  const texts = objs.filter(o => o.kind === 'TEXT');
  const shorthands = [...new Set(texts.map(o => fontShorthand({ ...o, fontSize: 32 })))];
  const key = shorthands.sort().join('|');
  let p = fontPromises.get(key);
  if (!p) {
    ensureFontsForObjects(texts);
    p = linksLoaded(6000)
      .then(() => Promise.all(shorthands.map(s => (document as any).fonts.load(s).catch(() => null))))
      .then(() => undefined).catch(() => undefined);
    fontPromises.set(key, p);
  }
  return p;
}
/** Preload every face a theme uses (gallery). */
export function loadThemeFonts(themeId: string | undefined): Promise<void> {
  const objs = buildSlideObjects('welcome', themeId, {}, 1920, 1080) || [];
  const more = buildSlideObjects('sermon-point', themeId, {}, 1920, 1080) || [];
  const ev = buildSlideObjects('event', themeId, {}, 1920, 1080) || [];
  return loadSlideFonts([...objs, ...more, ...ev]);
}
