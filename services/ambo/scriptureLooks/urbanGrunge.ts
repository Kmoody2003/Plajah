// Urban & Grunge — twelve scripture looks for youth nights.
//
// Street culture, made church-safe: spray paint, wheat-paste, photocopy zines,
// VHS, risograph, duct tape, chalk, neon on brick, sticker-bomb, stencil,
// night-city light and skate-park concrete. Each look is its own composition,
// hand-authored for the Art Council.
//
// THE RULE still holds: grit, glitch and texture live in the BACKGROUND and the
// frame. The verse sits on a clean surface (a buffed patch, a pasted sheet, a
// strip of tape, a grip-taped deck…) in a comfortable centred measure, large
// and high-contrast. Glitch touches the verse only while it is arriving or
// leaving — never while it is being read.

import {
  type AspectClass, type ScriptureLayout, type ScriptureState, type LayoutFamily,
  aspectClass, SERIF, SANS, DISPLAY, GROTESK, MONO, clamp01, easeOut, easeInOut, easeBack, rgba,
  decoAlpha, wrap, fit, measure, drawVerse, drawReference, drawReferenceLead, drawCopyright, plate,
  safe, motionT, contextText, keyWords, lightLeak, grain, coverFrame,
} from '../scriptureKit';

type Ctx = CanvasRenderingContext2D;
type Font = (sz: number) => string;

const FAM: LayoutFamily = 'Urban & Grunge';
const RH = 'the Rebellious Hand';
const FUT = 'the Futurist';
const TRAV = 'the World-Eclectic Traveller';

// ── local helpers ────────────────────────────────────────────────────────────

/** Deterministic hash → [0,1). */
const rnd = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
function seeded(seed: number) { let v = (Math.floor(Math.abs(seed)) % 2147483646) + 1; return () => { v = (v * 16807) % 2147483647; return (v - 1) / 2147483646; }; }

/** Decoration arrival (0→1) and departure (0→1). */
const lifeIn = (s: ScriptureState, k = 1.7) => easeOut(clamp01(s.enterP * k));
const lifeOut = (s: ScriptureState, k = 1.35) => easeInOut(clamp01(s.exitP * k));
const life = (s: ScriptureState, ki = 1.7, ko = 1.35) => lifeIn(s, ki) * (1 - lifeOut(s, ko));
/** 0 while the verse is settled; rises only during entrance and exit. */
const transit = (s: ScriptureState) => (s.exitP > 0 ? clamp01(s.exitP * 1.3) : clamp01((1 - s.enterP) * 1.25));
const isVert = (c: AspectClass) => c === 'vertical' || c === 'portrait';
const isWide = (c: AspectClass) => c === 'ultrawide' || c === 'wall';

function maxSize(s: ScriptureState): number {
  const c = aspectClass(s.w, s.h);
  return c === 'vertical' ? s.w * 0.078 : c === 'portrait' ? s.w * 0.068 : c === 'classic' ? s.h * 0.07 : s.h * 0.074;
}

/** Rounded-rect sub-path (no beginPath), so callers can combine paths. */
function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const q = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + q, y); ctx.lineTo(x + w - q, y); ctx.arcTo(x + w, y, x + w, y + q, q);
  ctx.lineTo(x + w, y + h - q); ctx.arcTo(x + w, y + h, x + w - q, y + h, q);
  ctx.lineTo(x + q, y + h); ctx.arcTo(x, y + h, x, y + h - q, q);
  ctx.lineTo(x, y + q); ctx.arcTo(x, y, x + q, y, q); ctx.closePath();
}

/** Rectangle with torn / ragged edges (paper, tape, paint). */
function ragged(ctx: Ctx, x: number, y: number, w: number, h: number, seed: number, jag: number, sideJag = jag * 0.4) {
  const n = Math.max(6, Math.min(80, Math.round(w / Math.max(4, jag * 2.6))));
  const m = Math.max(3, Math.min(40, Math.round(h / Math.max(4, jag * 2.6))));
  ctx.beginPath(); ctx.moveTo(x, y + (rnd(seed) - 0.5) * jag);
  for (let i = 1; i <= n; i++) ctx.lineTo(x + (w * i) / n, y + (rnd(seed + i) - 0.5) * jag);
  for (let i = 1; i <= m; i++) ctx.lineTo(x + w + (rnd(seed + 200 + i) - 0.5) * sideJag, y + (h * i) / m);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(x + (w * i) / n, y + h + (rnd(seed + 400 + i) - 0.5) * jag);
  for (let i = m - 1; i > 0; i--) ctx.lineTo(x + (rnd(seed + 600 + i) - 0.5) * sideJag, y + (h * i) / m);
  ctx.closePath();
}

function starPath(ctx: Ctx, cx: number, cy: number, r: number, pts = 5, inner = 0.46, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < pts * 2; i++) {
    const rad = i % 2 ? r * inner : r, a = rot + (i * Math.PI) / pts;
    if (i) ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad); else ctx.moveTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  ctx.closePath();
}

/** Reading panel: a centred measure, fitted text, and padding for a surface. */
interface Panel { x: number; y: number; w: number; h: number; ix: number; iw: number; ty: number; size: number; lines: string[]; lh: number }
function panel(ctx: Ctx, s: ScriptureState, font: Font, o: { frac?: number; yC?: number; maxH?: number; lh?: number; padTop?: number; padBottom?: number; k?: number; inset?: number } = {}): Panel {
  const cls = aspectClass(s.w, s.h);
  const lh = o.lh ?? 1.3;
  const w = measure(s.w, s.h, o.frac ?? (cls === 'vertical' ? 0.9 : cls === 'portrait' ? 0.86 : 0.76));
  const inset = o.inset ?? 0.07;
  const iw = w * (1 - inset * 2);
  const f = fit(ctx, s.text, font, iw, s.h * (o.maxH ?? (cls === 'vertical' ? 0.44 : 0.5)), lh, maxSize(s) * (o.k ?? 1), s.h * 0.022);
  const padTop = f.size * (o.padTop ?? 1.0), padBottom = f.size * (o.padBottom ?? 1.75);
  const h = f.lines.length * f.size * lh + padTop + padBottom;
  const x = (s.w - w) / 2, y = s.h * (o.yC ?? 0.48) - h / 2;
  return { x, y, w, h, ix: x + w * inset, iw, ty: y + padTop, size: f.size, lines: f.lines, lh };
}
/** Draw the verse exactly as the panel laid it out (same size, same lines). */
function verse(ctx: Ctx, s: ScriptureState, P: Panel, font: Font, color: string, shadow?: number) {
  return drawVerse(ctx, s, { x: P.ix, y: P.ty, w: P.iw, h: P.lines.length * P.size * P.lh + 2, align: 'center', valign: 'top' }, { font, color, lh: P.lh, max: P.size, min: P.size, shadow });
}
const refSize = (P: Panel) => Math.max(13, P.size * 0.4);

/** RGB-split ghosts of the verse — only while it is arriving or leaving. */
function verseSplit(ctx: Ctx, s: ScriptureState, P: Panel, font: Font, amt: number, mt: number) {
  if (amt <= 0.01) return;
  const d = P.size * 0.22 * amt * (0.6 + 0.4 * Math.sin(mt * 23));
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.translate(-d, 0); verse(ctx, s, P, font, `rgba(255,40,110,${0.75 * amt})`);
  ctx.translate(d * 2, d * 0.3); verse(ctx, s, P, font, `rgba(40,230,255,${0.75 * amt})`);
  ctx.restore();
}

// ── cached textures (built once per size, never per frame) ───────────────────

const texCache = new Map<string, HTMLCanvasElement>();
function tex(key: string, w: number, h: number, paint: (c: Ctx, w: number, h: number) => void): HTMLCanvasElement {
  const tw = Math.max(64, Math.round(w / 2)), th = Math.max(64, Math.round(h / 2));
  const k = `${key}:${tw}x${th}`;
  let c = texCache.get(k);
  if (!c) {
    c = document.createElement('canvas'); c.width = tw; c.height = th;
    paint(c.getContext('2d')!, tw, th);
    texCache.set(k, c);
    if (texCache.size > 10) texCache.delete(texCache.keys().next().value as string);
  }
  return c;
}
const tileCache = new Map<string, HTMLCanvasElement>();
function tile(key: string, w: number, h: number, paint: (c: Ctx) => void): HTMLCanvasElement {
  let c = tileCache.get(key);
  if (!c) { c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d')!); tileCache.set(key, c); if (tileCache.size > 24) tileCache.delete(tileCache.keys().next().value as string); }
  return c;
}

function noiseLayer(c: Ctx, w: number, h: number, alpha: number, seed: number, tone: number | null) {
  const n = document.createElement('canvas'); n.width = w; n.height = h;
  const nc = n.getContext('2d')!; const img = nc.createImageData(w, h); const d = img.data; const R = seeded(seed);
  for (let i = 0; i < d.length; i += 4) { const v = R(); const t = tone ?? (v > 0.5 ? 255 : 0); d[i] = d[i + 1] = d[i + 2] = t; d[i + 3] = Math.abs(v - 0.5) * 2 * 255 * alpha; }
  nc.putImageData(img, 0, 0); c.drawImage(n, 0, 0);
}

function paintBrick(c: Ctx, w: number, h: number, base: [number, number, number], mortar: string, seed: number) {
  c.fillStyle = mortar; c.fillRect(0, 0, w, h);
  const bh = Math.max(5, Math.min(w, h) * 0.06), bw = bh * 2.6, gap = Math.max(1, bh * 0.14);
  const R = seeded(seed);
  for (let row = 0, y = 0; y < h; row++, y += bh) {
    const off = row % 2 ? bw * 0.5 : 0;
    for (let x = -off; x < w; x += bw) {
      const v = 0.72 + R() * 0.5;
      c.fillStyle = `rgb(${Math.min(255, base[0] * v) | 0},${Math.min(255, base[1] * v) | 0},${Math.min(255, base[2] * v) | 0})`;
      c.fillRect(x + gap / 2, y + gap / 2, bw - gap, bh - gap);
      c.fillStyle = 'rgba(255,255,255,0.06)'; c.fillRect(x + gap / 2, y + gap / 2, bw - gap, Math.max(1, gap * 0.6));
      if (R() < 0.25) { c.fillStyle = 'rgba(0,0,0,0.22)'; c.beginPath(); c.arc(x + R() * bw, y + R() * bh, bh * (0.15 + R() * 0.25), 0, Math.PI * 2); c.fill(); }
    }
  }
  for (let i = 0; i < 14; i++) {
    const x = R() * w, ww = w * (0.02 + R() * 0.06);
    const g = c.createLinearGradient(0, 0, 0, h * (0.3 + R() * 0.5));
    g.addColorStop(0, 'rgba(0,0,0,0.28)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(x, 0, ww, h);
  }
  const sg = c.createLinearGradient(0, h * 0.6, 0, h); sg.addColorStop(0, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,0.45)');
  c.fillStyle = sg; c.fillRect(0, 0, w, h);
  noiseLayer(c, w, h, 0.22, seed + 5, null);
}

function paintConcrete(c: Ctx, w: number, h: number, base: string, seed: number, o: { rust?: boolean; joints?: boolean } = {}) {
  c.fillStyle = base; c.fillRect(0, 0, w, h);
  const R = seeded(seed), M = Math.max(w, h);
  for (let i = 0; i < 60; i++) {
    const x = R() * w, y = R() * h, r = M * (0.05 + R() * 0.25);
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, R() < 0.55 ? `rgba(0,0,0,${0.04 + R() * 0.06})` : `rgba(255,255,255,${0.03 + R() * 0.05})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  if (o.rust) for (let i = 0; i < 12; i++) {
    const x = R() * w, y = R() * h * 0.6, ww = w * (0.004 + R() * 0.02), hh = h * (0.15 + R() * 0.4);
    const g = c.createLinearGradient(0, y, 0, y + hh); g.addColorStop(0, 'rgba(150,72,28,0.32)'); g.addColorStop(1, 'rgba(150,72,28,0)');
    c.fillStyle = g; c.fillRect(x, y, ww, hh);
  }
  c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    let x = R() * w, y = R() * h; c.beginPath(); c.moveTo(x, y);
    for (let k = 0; k < 22; k++) { x += (R() - 0.5) * w * 0.03; y += (R() - 0.3) * h * 0.03; c.lineTo(x, y); }
    c.stroke();
  }
  if (o.joints) {
    const step = Math.min(w, h) * 0.38;
    c.lineWidth = Math.max(1.5, step * 0.02);
    for (let x = step * 0.7; x < w; x += step) { c.strokeStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); c.strokeStyle = 'rgba(255,255,255,0.08)'; c.beginPath(); c.moveTo(x + c.lineWidth, 0); c.lineTo(x + c.lineWidth, h); c.stroke(); }
    for (let y = step * 0.55; y < h; y += step) { c.strokeStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    for (let i = 0; i < 16; i++) {
      c.strokeStyle = `rgba(12,10,10,${0.08 + R() * 0.12})`; c.lineWidth = 1 + R() * 4;
      const cx = R() * w, cy = R() * h, r = Math.min(w, h) * (0.1 + R() * 0.5), a0 = R() * Math.PI * 2;
      c.beginPath(); c.arc(cx, cy, r, a0, a0 + 0.4 + R() * 1.2); c.stroke();
    }
  }
  noiseLayer(c, w, h, 0.25, seed + 9, null);
}

function paintSlate(c: Ctx, w: number, h: number, seed: number) {
  c.fillStyle = '#1b2622'; c.fillRect(0, 0, w, h);
  const R = seeded(seed);
  c.lineCap = 'round';
  for (let i = 0; i < 90; i++) {
    c.strokeStyle = `rgba(230,240,235,${0.012 + R() * 0.024})`; c.lineWidth = h * (0.02 + R() * 0.08);
    c.beginPath(); c.ellipse(R() * w, R() * h, w * (0.05 + R() * 0.25), h * (0.02 + R() * 0.12), R() * 0.4 - 0.2, 0, Math.PI * (0.5 + R() * 1.5)); c.stroke();
  }
  noiseLayer(c, w, h, 0.1, seed + 3, null);
  const vg = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)');
  c.fillStyle = vg; c.fillRect(0, 0, w, h);
}

function paintCopy(c: Ctx, w: number, h: number, seed: number) {
  c.fillStyle = '#efeee8'; c.fillRect(0, 0, w, h);
  const cell = Math.max(4, Math.min(w, h) * 0.024);
  c.save(); c.fillStyle = '#1a1a1a'; c.translate(w / 2, h / 2); c.rotate(0.3);
  const Rr = Math.hypot(w, h) / 2;
  for (let y = -Rr; y < Rr; y += cell) for (let x = -Rr; x < Rr; x += cell) {
    // two toner blobs: heavy top-left, lighter bottom-right
    const ux = x / Rr, uy = y / Rr;
    const k = Math.max(clamp01(1 - Math.hypot(ux + 0.75, uy + 0.2) * 1.25), clamp01(0.7 - Math.hypot(ux - 0.7, uy - 0.35) * 1.4));
    if (k < 0.05) continue;
    c.beginPath(); c.arc(x, y, cell * 0.52 * k, 0, Math.PI * 2); c.fill();
  }
  c.restore();
  const R = seeded(seed);
  for (const side of [0, 1]) {
    const g = side ? c.createLinearGradient(w, 0, w * 0.93, 0) : c.createLinearGradient(0, 0, w * 0.06, 0);
    g.addColorStop(0, 'rgba(10,10,10,0.95)'); g.addColorStop(0.35, 'rgba(10,10,10,0.45)'); g.addColorStop(1, 'rgba(10,10,10,0)');
    c.fillStyle = g; c.fillRect(side ? w * 0.92 : 0, 0, w * 0.08, h);
  }
  const tg = c.createLinearGradient(0, 0, 0, h * 0.06); tg.addColorStop(0, 'rgba(10,10,10,0.7)'); tg.addColorStop(1, 'rgba(10,10,10,0)');
  c.fillStyle = tg; c.fillRect(0, 0, w, h * 0.06);
  c.fillStyle = 'rgba(10,10,10,0.6)';
  for (let i = 0; i < 260; i++) c.fillRect(R() * w, R() * h, 1 + R() * 2.5, 1 + R() * 2.5);
  noiseLayer(c, w, h, 0.16, seed + 1, 0);
}

function paintPaper(c: Ctx, w: number, h: number, seed: number) {
  c.fillStyle = '#f3eddf'; c.fillRect(0, 0, w, h);
  const R = seeded(seed);
  c.lineWidth = 1;
  for (let i = 0; i < 420; i++) {
    const x = R() * w, y = R() * h, a = R() * Math.PI, l = 3 + R() * 10;
    c.strokeStyle = `rgba(120,100,70,${0.04 + R() * 0.05})`;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
  }
  noiseLayer(c, w, h, 0.08, seed + 2, 0);
}

function vignette(ctx: Ctx, s: ScriptureState, inner: number, alpha: number) {
  const vg = ctx.createRadialGradient(s.w / 2, s.h / 2, Math.min(s.w, s.h) * inner, s.w / 2, s.h / 2, Math.max(s.w, s.h) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(0,0,0,${alpha})`);
  ctx.fillStyle = vg; ctx.fillRect(0, 0, s.w, s.h);
}

// ── 01 · Spray Wall ──────────────────────────────────────────────────────────

const SPRAY = ['#ff3d8b', '#2de2e6', '#c6ff3d', '#ffd23f'];
const SPRAY_SPOTS: Record<AspectClass, [number, number, number, number][]> = {
  vertical: [[0.5, 0.115, -0.07, 0.07], [0.5, 0.885, 0.05, 0.065]],
  portrait: [[0.5, 0.11, -0.06, 0.08], [0.5, 0.89, 0.05, 0.075]],
  classic: [[0.32, 0.11, -0.07, 0.105], [0.68, 0.9, 0.05, 0.095]],
  screen: [[0.24, 0.12, -0.08, 0.125], [0.77, 0.885, 0.06, 0.115]],
  ultrawide: [[0.13, 0.3, -0.1, 0.17], [0.87, 0.7, 0.08, 0.16]],
  wall: [[0.1, 0.32, -0.1, 0.2], [0.9, 0.68, 0.08, 0.2], [0.27, 0.86, 0.05, 0.1], [0.73, 0.14, -0.05, 0.1]],
};
const SPRAY_MAXW: Record<AspectClass, number> = { vertical: 0.86, portrait: 0.86, classic: 0.5, screen: 0.42, ultrawide: 0.24, wall: 0.17 };

function sprayPiece(ctx: Ctx, word: string, x: number, y: number, rot: number, size: number, color: string, reveal: number, mt: number, seed: number) {
  if (reveal <= 0) return;
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.font = `900 ${size}px ${DISPLAY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const tw = ctx.measureText(word).width;
  const edge = -tw / 2 - size * 0.4 + (tw + size * 0.8) * reveal;
  ctx.save(); ctx.beginPath(); ctx.rect(-tw / 2 - size, -size * 1.4, edge + tw / 2 + size, size * 4); ctx.clip();
  // overspray halo
  ctx.fillStyle = rgba(color, 0.1);
  for (const [ox, oy] of [[-1, -1], [1.2, 1], [1.6, -0.6], [-1.4, 0.9]]) ctx.fillText(word, ox * size * 0.06, oy * size * 0.06);
  ctx.lineJoin = 'round'; ctx.lineWidth = size * 0.1; ctx.strokeStyle = 'rgba(14,10,22,0.9)'; ctx.strokeText(word, size * 0.03, size * 0.05);
  ctx.fillStyle = color; ctx.fillText(word, 0, 0);
  // white shine flicks
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = size * 0.035; ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) { const fx = (rnd(seed + i * 7) - 0.5) * tw * 0.8; ctx.beginPath(); ctx.moveTo(fx, -size * 0.28); ctx.lineTo(fx + size * 0.08, -size * 0.36); ctx.stroke(); }
  // drips (slowly creeping)
  ctx.fillStyle = color;
  for (let i = 0; i < 7; i++) {
    const dx = (rnd(seed + i) - 0.5) * tw * 0.86;
    const len = size * (0.15 + rnd(seed + i * 3) * 0.6) * (0.8 + 0.2 * Math.sin(mt * 0.25 + i * 1.7));
    const dw = size * (0.03 + rnd(seed + i * 5) * 0.025);
    ctx.fillRect(dx, size * 0.3, dw, len);
    ctx.beginPath(); ctx.arc(dx + dw / 2, size * 0.3 + len, dw * 0.85, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  // nozzle mist at the writing edge
  if (reveal < 1) {
    ctx.fillStyle = rgba(color, 0.35);
    for (let i = 0; i < 26; i++) {
      const a = rnd(seed + i * 11 + Math.floor(mt * 20)) * Math.PI * 2, r = size * 0.6 * Math.sqrt(rnd(seed + i * 13 + Math.floor(mt * 20)));
      ctx.fillRect(edge + Math.cos(a) * r, Math.sin(a) * r, size * 0.025, size * 0.025);
    }
  }
  ctx.restore();
}

const sprayWall: ScriptureLayout = {
  id: 'ug-spray-wall', name: 'Spray Wall', family: FAM, background: 'opaque', director: RH, animated: true,
  blurb: 'Bright spray-painted words from the chapter on a night brick wall; the verse sits on a fresh rolled-over patch of paint.',
  draw(ctx, s) {
    const a = decoAlpha(s), mt = motionT(s), cls = aspectClass(s.w, s.h);
    const font: Font = sz => `600 ${sz}px ${DISPLAY}`;
    const P = panel(ctx, s, font, { yC: 0.5, padTop: 1.05, padBottom: 1.85, maxH: cls === 'vertical' ? 0.5 : 0.52 });
    ctx.save(); ctx.globalAlpha = a;
    ctx.drawImage(tex('ug-brick-warm', s.w, s.h, (c, w, h) => paintBrick(c, w, h, [118, 56, 44], '#3b322d', 7)), 0, 0, s.w, s.h);
    // a sodium street-lamp pool drifting slowly across the wall
    const lx = s.w * (0.5 + 0.35 * Math.sin(mt * 0.06)), ly = -s.h * 0.1;
    const lg = ctx.createRadialGradient(lx, ly, 0, lx, ly, Math.max(s.w, s.h) * 0.8);
    lg.addColorStop(0, 'rgba(255,190,110,0.22)'); lg.addColorStop(1, 'rgba(255,190,110,0)');
    ctx.fillStyle = lg; ctx.fillRect(0, 0, s.w, s.h);
    vignette(ctx, s, 0.2, 0.65);
    const words = keyWords(contextText(s), 4);
    SPRAY_SPOTS[cls].forEach(([fx, fy, rot, fs], i) => {
      const word = words[i % words.length];
      let size = s.h * fs;
      ctx.font = `900 ${size}px ${DISPLAY}`;
      const maxW = s.w * SPRAY_MAXW[cls];
      const tw = ctx.measureText(word).width;
      if (tw > maxW) size *= maxW / tw;
      const reveal = Math.min(clamp01(s.enterP * 1.9 - i * 0.18), 1 - clamp01(s.exitP * 1.5 - i * 0.1));
      sprayPiece(ctx, word, s.w * fx, s.h * fy, rot + Math.sin(mt * 0.2 + i) * 0.004, size, SPRAY[(i + 1) % SPRAY.length], easeOut(reveal), mt, i * 31 + 5);
    });
    ctx.restore();

    // buffed patch: grey paint rolled over the wall, band by band
    const rev = life(s, 1.7, 1.3);
    if (rev > 0) {
      ctx.save(); ctx.globalAlpha = a;
      const bands = Math.max(3, Math.round(P.h / (P.size * 1.5)));
      const over = P.size * 0.5;
      for (let i = 0; i < bands; i++) {
        const y0 = P.y + (P.h * i) / bands - P.size * 0.12, hb = P.h / bands + P.size * 0.24;
        const q = clamp01(rev * 1.2 - i * 0.04);
        const x0 = P.x - over * (0.6 + rnd(i + 1) * 0.8);
        const x1 = x0 + (P.w + over * (1.2 + rnd(i + 3) * 1.2)) * q;
        const sh = 36 + Math.round(rnd(i + 9) * 8);
        ctx.fillStyle = `rgb(${sh},${sh},${sh + 3})`;
        ctx.beginPath(); ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y0 + (rnd(i + 21) - 0.5) * P.size * 0.1);
        for (let k = 1; k <= 6; k++) ctx.lineTo(x1 + (rnd(i * 9 + k) - 0.3) * P.size * 0.35, y0 + (hb * k) / 6);
        ctx.lineTo(x0 + (rnd(i + 41) - 0.5) * P.size * 0.3, y0 + hb);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.025)';
        for (let k = 0; k < 4; k++) ctx.fillRect(x0, y0 + hb * (0.15 + k * 0.22), (x1 - x0) * 0.98, Math.max(1, hb * 0.04));
      }
      ctx.restore();
    }
    drawReferenceLead(ctx, s, '#ffffff');
    const r = verse(ctx, s, P, font, '#FFFFFF');
    drawReference(ctx, s, s.w / 2, r.bottom + P.size * 1.0, 'center', refSize(P), '#c6ff3d', { font: `800 ${refSize(P)}px ${SANS}` });
    drawCopyright(ctx, s, s.w / 2, s.h - safe(s) * 0.45, 'center', 'rgba(255,255,255,0.5)');
  },
};

// ── 02 · Wheat-Paste ─────────────────────────────────────────────────────────

const POSTER_BG = ['#f2e8d5', '#ffd23f', '#ff6f59', '#4ecdc4', '#ece6f5', '#c6ff3d', '#f7f7f2'];
const wheatPaste: ScriptureLayout = {
  id: 'ug-wheatpaste', name: 'Wheat-Paste', family: FAM, background: 'opaque', director: RH, animated: true,
  blurb: 'A concrete wall papered with gig-style posters of the chapter’s words; the verse is a fresh sheet pasted on top.',
  draw(ctx, s) {
    const a = decoAlpha(s), mt = motionT(s), cls = aspectClass(s.w, s.h);
    const font: Font = sz => `700 ${sz}px ${GROTESK}`;
    const P = panel(ctx, s, font, { lh: 1.26, padTop: 1.3, padBottom: 2.0, yC: 0.5 });
    ctx.save(); ctx.globalAlpha = a;
    ctx.drawImage(tex('ug-concrete-grey', s.w, s.h, (c, w, h) => paintConcrete(c, w, h, '#77746f', 11, { rust: true })), 0, 0, s.w, s.h);
    const cols = ({ vertical: 2, portrait: 3, classic: 4, screen: 5, ultrawide: 7, wall: 10 } as Record<AspectClass, number>)[cls];
    const rows = cls === 'vertical' ? 5 : cls === 'portrait' ? 4 : 3;
    const words = keyWords(contextText(s), 16);
    const cw = s.w / cols, rh = s.h / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c, sd = i * 13.7 + 3;
      const q = Math.min(clamp01(s.enterP * 2.2 - rnd(sd) * 0.7), 1 - clamp01(s.exitP * 1.7 - rnd(sd + 1) * 0.5));
      if (q <= 0) continue;
      const pw = cw * 0.96, ph = rh * 0.94;
      const cx = c * cw + cw / 2 + (rnd(sd + 2) - 0.5) * cw * 0.05, cy = r * rh + rh / 2 + (rnd(sd + 3) - 0.5) * rh * 0.05;
      ctx.save(); ctx.globalAlpha = a * easeOut(q);
      ctx.translate(cx, cy); ctx.rotate((rnd(sd + 4) - 0.5) * 0.04); const sc = 1 + (1 - easeOut(q)) * 0.08; ctx.scale(sc, sc);
      ragged(ctx, -pw / 2, -ph / 2, pw, ph, sd, Math.min(pw, ph) * 0.03, Math.min(pw, ph) * 0.01);
      ctx.fillStyle = POSTER_BG[i % POSTER_BG.length]; ctx.fill();
      ctx.save(); ctx.clip();
      const word = words[i % words.length];
      const vertical = i % 3 === 1;
      const ink = i % 2 ? '#1d1a22' : '#e3261f';
      ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const long = vertical ? ph : pw, short = vertical ? pw : ph;
      let fs = short * 0.62; ctx.font = `900 ${fs}px ${DISPLAY}`;
      const ww = ctx.measureText(word).width; if (ww > long * 0.92) fs *= (long * 0.92) / ww;
      ctx.font = `900 ${fs}px ${DISPLAY}`;
      if (vertical) { ctx.save(); ctx.rotate(-Math.PI / 2); ctx.fillText(word, 0, 0); ctx.restore(); } else ctx.fillText(word, 0, -ph * 0.06);
      // second-colour band + small print rules
      ctx.fillStyle = rgba(ink, 0.85); ctx.fillRect(-pw / 2, ph * 0.3, pw, ph * 0.05);
      ctx.fillStyle = rgba(ink, 0.5); for (let k = 0; k < 3; k++) ctx.fillRect(-pw * 0.38, ph * (0.39 + k * 0.035), pw * (0.5 + rnd(sd + k) * 0.25), Math.max(1, ph * 0.012));
      // torn-away corner showing the paper beneath
      const tc = Math.floor(rnd(sd + 5) * 4);
      const sx = tc % 2 ? pw / 2 : -pw / 2, sy = tc > 1 ? ph / 2 : -ph / 2;
      ctx.fillStyle = '#e8e2d2'; ctx.beginPath(); ctx.moveTo(sx, sy);
      ctx.lineTo(sx - Math.sign(sx) * pw * (0.25 + rnd(sd + 6) * 0.3), sy);
      for (let k = 1; k < 5; k++) ctx.lineTo(sx - Math.sign(sx) * pw * (0.25 - k * 0.05) * (0.8 + rnd(sd + k) * 0.4), sy - Math.sign(sy) * ph * k * 0.07);
      ctx.lineTo(sx, sy - Math.sign(sy) * ph * (0.3 + rnd(sd + 7) * 0.2)); ctx.closePath(); ctx.fill();
      // wrinkles
      ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = Math.max(1, pw * 0.006);
      ctx.beginPath(); ctx.moveTo(-pw / 2, (rnd(sd + 8) - 0.5) * ph); ctx.lineTo(pw / 2, (rnd(sd + 9) - 0.5) * ph); ctx.stroke();
      ctx.restore();
      ctx.restore();
    }
    // the wall recedes so the fresh sheet reads
    ctx.fillStyle = 'rgba(14,12,16,0.42)'; ctx.fillRect(0, 0, s.w, s.h);
    // slow raking light across the wall
    const sx = ((mt * 0.035) % 1.6 - 0.3) * s.w;
    const sg = ctx.createLinearGradient(sx - s.w * 0.25, 0, sx + s.w * 0.25, s.h * 0.3);
    sg.addColorStop(0, 'rgba(255,240,210,0)'); sg.addColorStop(0.5, 'rgba(255,240,210,0.08)'); sg.addColorStop(1, 'rgba(255,240,210,0)');
    ctx.fillStyle = sg; ctx.fillRect(0, 0, s.w, s.h);
    ctx.restore();

    // the verse sheet: pasted down from the top, torn away downward on exit
    const vis = Math.min(lifeIn(s, 1.8), 1 - lifeOut(s, 1.4));
    if (vis > 0) {
      ctx.save(); ctx.globalAlpha = a;
      const px = P.x - P.size * 0.2, py = P.y, pw = P.w + P.size * 0.4, ph = P.h;
      ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fillRect(px + P.size * 0.18, py + P.size * 0.22, pw, ph * vis);
      ctx.beginPath(); ctx.rect(px - P.size, py - P.size, pw + P.size * 2, (ph + P.size) * vis + P.size * 0.2); ctx.clip();
      ragged(ctx, px, py, pw, ph, 77, P.size * 0.22, P.size * 0.06);
      ctx.fillStyle = '#f6f2e8'; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.strokeStyle = 'rgba(60,40,20,0.06)'; ctx.lineWidth = Math.max(1, P.size * 0.05);
      for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(px + pw * rnd(k + 50), py); ctx.lineTo(px + pw * rnd(k + 60), py + ph); ctx.stroke(); }
      // wet-paste sheen at the brush edge while pasting
      if (vis < 1) {
        const ey = py + ph * vis;
        const wg = ctx.createLinearGradient(0, ey - P.size * 1.4, 0, ey);
        wg.addColorStop(0, 'rgba(255,255,255,0)'); wg.addColorStop(1, 'rgba(255,255,255,0.5)');
        ctx.fillStyle = wg; ctx.fillRect(px, ey - P.size * 1.4, pw, P.size * 1.4);
      }
      // corner curl that lifts in the breeze
      const cs = P.size * (0.7 + 0.25 * Math.sin(mt * 1.1));
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath(); ctx.moveTo(px + pw, py + ph - cs); ctx.lineTo(px + pw - cs, py + ph); ctx.lineTo(px + pw, py + ph); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e4ddcc';
      ctx.beginPath(); ctx.moveTo(px + pw, py + ph - cs); ctx.lineTo(px + pw - cs, py + ph); ctx.lineTo(px + pw - cs * 0.85, py + ph - cs * 0.85); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.restore();
    }
    drawReferenceLead(ctx, s, '#16131c');
    const r = verse(ctx, s, P, font, '#16131c');
    drawReference(ctx, s, s.w / 2, r.bottom + P.size * 1.0, 'center', refSize(P), '#d12a2a', { font: `800 ${refSize(P)}px ${GROTESK}` });
    drawCopyright(ctx, s, s.w / 2, s.h - safe(s) * 0.45, 'center', 'rgba(255,255,255,0.55)');
  },
};

// ── 03 · Photocopy Zine ──────────────────────────────────────────────────────

const RANSOM_FONTS = [`900 {s}px ${DISPLAY}`, `italic 700 {s}px ${SERIF}`, `700 {s}px ${MONO}`, `700 {s}px ${GROTESK}`, `900 {s}px ${SANS}`];
const xeroxZine: ScriptureLayout = {
  id: 'ug-xerox', name: 'Photocopy Zine', family: FAM, background: 'opaque', director: RH, animated: true,
  blurb: 'A black-and-white photocopied zine page: toner halftones, a cut-out ransom-letter title, and the verse on a clean pasted label.',
  draw(ctx, s) {
    const a = decoAlpha(s), mt = motionT(s), cls = aspectClass(s.w, s.h), m = safe(s);
    const font: Font = sz => `800 ${sz}px ${SANS}`;
    const P = panel(ctx, s, font, { yC: cls === 'vertical' ? 0.56 : 0.6, maxH: cls === 'vertical' ? 0.42 : 0.46, padTop: 1.0, padBottom: 1.9, lh: 1.26 });
    ctx.save(); ctx.globalAlpha = a;
    const drift = Math.sin(mt * 0.11) * s.w * 0.004;
    ctx.drawImage(tex('ug-copy', s.w, s.h, (c, w, h) => paintCopy(c, w, h, 21)), -s.w * 0.01 + drift, -s.h * 0.01, s.w * 1.02, s.h * 1.02);
    // copier drum streaks that jump around
    for (let k = 0; k < 3; k++) {
      const fr = Math.floor(mt * 3) + k * 17;
      ctx.fillStyle = `rgba(20,20,20,${0.08 + rnd(fr) * 0.12})`;
      ctx.fillRect(rnd(fr * 1.7) * s.w, 0, 1 + rnd(fr * 2.3) * 3, s.h);
    }
    // context typed into the margins
    const ms = Math.max(10, Math.round(s.h * 0.015));
    ctx.font = `${ms}px ${MONO}`; ctx.fillStyle = 'rgba(20,20,20,0.55)'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    const body = contextText(s).slice(0, 1600);
    const colW = (s.w - P.w) / 2 - m * 1.6;
    if (!isVert(cls) && colW > s.h * 0.16) {
      const L = wrap(ctx, body, colW);
      const rowsN = Math.floor((s.h - m * 2.4) / (ms * 1.5));
      for (let i = 0; i < Math.min(rowsN, L.length); i++) ctx.fillText(L[i], m * 0.9, m * 1.2 + i * ms * 1.5);
      for (let i = 0; i < Math.min(rowsN, Math.max(0, L.length - rowsN)); i++) ctx.fillText(L[i + rowsN], s.w - m * 0.7 - colW, m * 1.2 + i * ms * 1.5);
    } else {
      const top = P.y + P.h + ms * 2.2, room = s.h - m * 1.2 - top;
      if (room > ms * 3) {
        const L = wrap(ctx, body, P.w);
        for (let i = 0; i < Math.min(L.length, Math.floor(room / (ms * 1.5))); i++) ctx.fillText(L[i], P.x, top + i * ms * 1.5);
      }
    }
    grain(ctx, s, 0.06, 0);
    // ransom-letter title from the neighbouring verses
    const title = keyWords(contextText(s), 8).find(w => w.length <= 9) ?? 'SELAH';
    const avail = isVert(cls) ? s.w * 0.92 : Math.min(P.w * 1.05, s.w * 0.9);
    const L = Math.min(isVert(cls) ? s.w * 0.12 : s.h * 0.11, avail / (title.length * 0.98), Math.max(s.h * 0.05, (P.y - m * 0.8) * 0.62));
    const ty = P.y - L * 0.78;
    let tx = s.w / 2 - (title.length * L * 0.9) / 2 + L * 0.45;
    for (let i = 0; i < title.length; i++, tx += L * 0.9) {
      const sd = i * 7.3 + title.length;
      const q = clamp01(s.enterP * 2.2 - i * 0.07), e = clamp01(s.exitP * 1.7 - i * 0.04);
      if (q <= 0 || e >= 1) continue;
      const style = Math.floor(rnd(sd) * 3);
      const fs = L * (0.62 + rnd(sd + 1) * 0.2);
      const sw = L * (0.78 + rnd(sd + 2) * 0.16), shh = L * (0.92 + rnd(sd + 3) * 0.18);
      ctx.save(); ctx.globalAlpha = a * (1 - e);
      ctx.translate(tx, ty - e * L * 1.5); ctx.rotate((rnd(sd + 4) - 0.5) * 0.24 + Math.sin(mt * 0.7 + i) * 0.015 + e * (rnd(sd) - 0.5) * 1.5);
      const sc = easeBack(q); ctx.scale(sc, sc);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-sw / 2 + L * 0.05, -shh / 2 + L * 0.06, sw, shh);
      ctx.fillStyle = style === 0 ? '#111' : style === 1 ? '#fbfbf6' : '#fff200'; ctx.fillRect(-sw / 2, -shh / 2, sw, shh);
      ctx.fillStyle = style === 0 ? '#fbfbf6' : '#111';
      ctx.font = RANSOM_FONTS[Math.floor(rnd(sd + 5) * RANSOM_FONTS.length)].replace('{s}', String(Math.round(fs)));
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(title[i], 0, fs * 0.04);
      ctx.restore();
    }
    ctx.restore();

    // the clean pasted label
    const g = life(s, 2, 1.3);
    if (g > 0) {
      ctx.save(); ctx.globalAlpha = a * clamp01(g * 1.4);
      ctx.translate(s.w / 2, P.y + P.h / 2); ctx.rotate(-0.006 - (1 - g) * 0.05); ctx.scale(0.96 + g * 0.04, 0.96 + g * 0.04); ctx.translate(-s.w / 2, -(P.y + P.h / 2));
      ctx.fillStyle = '#111'; ctx.fillRect(P.x + P.size * 0.22, P.y + P.size * 0.26, P.w, P.h);
      ctx.fillStyle = '#fdfdf9'; ctx.fillRect(P.x, P.y, P.w, P.h);
      ctx.strokeStyle = '#111'; ctx.lineWidth = Math.max(2, P.size * 0.06); ctx.strokeRect(P.x, P.y, P.w, P.h);
      // tape at the corners
      ctx.fillStyle = 'rgba(250,240,190,0.62)';
      for (const [tx2, sgn] of [[P.x, -1], [P.x + P.w, 1]] as [number, number][]) {
        ctx.save(); ctx.translate(tx2, P.y); ctx.rotate(sgn * 0.6); ctx.fillRect(-P.size * 0.9, -P.size * 0.28, P.size * 1.8, P.size * 0.56); ctx.restore();
      }
      ctx.restore();
    }
    drawReferenceLead(ctx, s, '#111');
    const r = verse(ctx, s, P, font, '#111');
    // highlighter swipe behind the reference
    const rs = refSize(P), ry = r.bottom + P.size * 1.0;
    const refText = (s.reference + (s.translation ? `  ·  ${s.translation}` : '')).toUpperCase();
    ctx.save(); ctx.font = `700 ${rs}px ${MONO}`;
    const rw = ctx.measureText(refText).width + refText.length * Math.round(rs * 0.12);
    ctx.globalAlpha = a * 0.85; ctx.fillStyle = '#fff200';
    ctx.fillRect(s.w / 2 - rw / 2 - rs * 0.4, ry - rs * 0.95, (rw + rs * 0.8) * life(s, 1.4, 1.5), rs * 1.3);
    ctx.restore();
    drawReference(ctx, s, s.w / 2, ry, 'center', rs, '#111', { font: `700 ${rs}px ${MONO}`, tracking: 0.12 });
    drawCopyright(ctx, s, s.w / 2, s.h - m * 0.45, 'center', 'rgba(20,20,20,0.6)');
  },
};

// ── 04 · Rewind (VHS) ────────────────────────────────────────────────────────

function retroFallback(ctx: Ctx, s: ScriptureState, mt: number) {
  const g = ctx.createLinearGradient(0, 0, 0, s.h); g.addColorStop(0, '#0b0420'); g.addColorStop(0.6, '#2a0b3d'); g.addColorStop(1, '#07030f');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s.w, s.h);
  const hy = s.h * 0.64, R = Math.min(s.w, s.h) * 0.24, sx = s.w / 2, sy = hy - R * 0.3;
  ctx.save(); ctx.beginPath(); ctx.arc(sx, sy, R, 0, Math.PI * 2); ctx.clip();
  const sg = ctx.createLinearGradient(0, sy - R, 0, sy + R); sg.addColorStop(0, '#ffd23f'); sg.addColorStop(1, '#ff3d8b');
  ctx.fillStyle = sg; ctx.fillRect(sx - R, sy - R, R * 2, R * 2);
  ctx.fillStyle = '#2a0b3d'; for (let i = 0; i < 6; i++) ctx.fillRect(sx - R, sy + R * (0.05 + i * 0.16), R * 2, R * 0.025 * (i + 1));
  ctx.restore();
  ctx.fillStyle = '#0a0418'; ctx.fillRect(0, hy, s.w, s.h - hy);
  ctx.strokeStyle = 'rgba(255,61,139,0.5)'; ctx.lineWidth = Math.max(1, s.h * 0.0016);
  ctx.beginPath();
  for (let i = 0; i < 14; i++) { const t = (i + (mt * 0.5) % 1) / 14, y = hy + Math.pow(t, 2.2) * (s.h - hy); ctx.moveTo(0, y); ctx.lineTo(s.w, y); }
  for (let i = -18; i <= 18; i++) { ctx.moveTo(s.w / 2 + i * s.w * 0.02, hy); ctx.lineTo(s.w / 2 + i * s.w * 0.17, s.h); }
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,61,139,0.6)'; ctx.fillRect(0, hy - 1, s.w, Math.max(2, s.h * 0.003));
}

function osd(ctx: Ctx, txt: string, x: number, y: number, align: CanvasTextAlign, size: number) {
  ctx.font = `700 ${size}px ${MONO}`; ctx.textAlign = align; ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(255,40,110,0.6)'; ctx.fillText(txt, x - size * 0.06, y);
  ctx.fillStyle = 'rgba(40,230,255,0.6)'; ctx.fillText(txt, x + size * 0.06, y);
  ctx.fillStyle = '#eef8ff'; ctx.fillText(txt, x, y);
}

const vhsRewind: ScriptureLayout = {
  id: 'ug-vhs', name: 'Rewind', family: FAM, background: 'opaque', director: FUT, animated: true, generator: 'RETROGRID',
  blurb: 'A worn VHS tape on an old CRT: scanlines, a rolling tracking band and on-screen PLAY text — the verse powers on clean and steady.',
  draw(ctx, s) {
    const a = decoAlpha(s), mt = motionT(s), cls = aspectClass(s.w, s.h), m = safe(s);
    const font: Font = sz => `500 ${sz}px ${DISPLAY}`;
    const tr = transit(s);
    const P = panel(ctx, s, font, { yC: 0.5, padTop: 1.0, padBottom: 1.8 });
    // CRT power: opens from a line on entrance, collapses to a dot on exit
    const pw = s.exitP > 0 ? 1 - clamp01(s.exitP * 1.5) : clamp01(s.enterP * 2.4);
    const openH = Math.max(2, s.h * easeOut(clamp01(pw * 1.25)));
    const openW = s.w * (pw < 0.15 && s.exitP > 0 ? Math.max(0.01, pw / 0.15) : 1);
    ctx.save(); ctx.globalAlpha = a > 0 ? 1 : 0;
    ctx.fillStyle = '#030206'; ctx.fillRect(0, 0, s.w, s.h);
    ctx.beginPath(); ctx.rect((s.w - openW) / 2, (s.h - openH) / 2, openW, openH); ctx.clip();
    if (!coverFrame(ctx, s, s.genFrame, 0.55)) retroFallback(ctx, s, mt);
    ctx.fillStyle = 'rgba(8,4,18,0.2)'; ctx.fillRect(0, 0, s.w, s.h);
    // scanlines
    const scan = tile('ug-scan', 4, 4, c => { c.fillStyle = 'rgba(0,0,0,0.38)'; c.fillRect(0, 2, 4, 2); });
    const pat = ctx.createPattern(scan, 'repeat'); if (pat) { ctx.fillStyle = pat; ctx.fillRect(0, 0, s.w, s.h); }
    // rolling tracking band (wider and noisier while the type moves)
    const bands = 1 + Math.round(tr * 3);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let b = 0; b < bands; b++) {
      const ty = ((((mt * 0.06) + b * 0.31) % 1.25) - 0.12) * s.h, th = s.h * (0.035 + 0.07 * tr);
      const fr = Math.floor(mt * 30);
      for (let i = 0; i < 14; i++) {
        const k = rnd(fr * 13 + i + b * 99);
        ctx.fillStyle = `rgba(255,255,255,${0.03 + k * 0.09})`;
        ctx.fillRect(k * s.w * 0.6, ty + (i / 14) * th, s.w * (0.2 + rnd(i + fr) * 0.6), Math.max(1, (th / 14) * 0.6));
      }
    }
    ctx.restore();
    // power-on flash
    if (pw < 1) { ctx.fillStyle = `rgba(255,255,255,${(1 - pw) * 0.35})`; ctx.fillRect(0, 0, s.w, s.h); }
    // on-screen display
    const os = isVert(cls) ? s.w * 0.045 : Math.max(14, s.h * 0.034);
    const state = s.exitP > 0 ? '■ STOP' : s.enterP < 1 && Math.floor(mt * 4) % 2 ? '  PLAY' : '▶ PLAY';
    osd(ctx, state, m, m * 0.8, 'left', os);
    osd(ctx, 'SP', s.w - m, m * 0.8, 'right', os);
    const t = Math.floor(s.t), p2 = (n: number) => (n < 10 ? '0' : '') + n;
    osd(ctx, `${Math.floor(t / 3600)}:${p2(Math.floor(t / 60) % 60)}:${p2(t % 60)}`, m, s.h - m * 0.8 - os, 'left', os);
    osd(ctx, 'CH 03', s.w - m, s.h - m * 0.8 - os, 'right', os);
    // the verse panel: a dark, quiet field over the picture
    ctx.fillStyle = 'rgba(6,3,16,0.66)';
    ctx.beginPath(); rr(ctx, P.x, P.y, P.w, P.h, P.size * 0.3); ctx.fill();
    ctx.fillStyle = 'rgba(92,225,230,0.6)'; ctx.fillRect(P.x + P.size * 0.3, P.y, (P.w - P.size * 0.6) * life(s), Math.max(2, s.h * 0.003));
    // CRT bezel + curvature vignette
    vignette(ctx, s, 0.35, 0.6);
    ctx.restore();
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.rect(0, 0, s.w, s.h); rr(ctx, m * 0.18, m * 0.18, s.w - m * 0.36, s.h - m * 0.36, Math.min(s.w, s.h) * 0.05); ctx.fill('evenodd');
    ctx.restore();
    drawReferenceLead(ctx, s, '#ffffff');
    verseSplit(ctx, s, P, font, tr, mt);
    const r = verse(ctx, s, P, font, '#FFFFFF');
    drawReference(ctx, s, s.w / 2, r.bottom + P.size * 1.0, 'center', refSize(P), '#5ce1e6', { font: `600 ${refSize(P)}px ${MONO}`, tracking: 0.14 });
    drawCopyright(ctx, s, s.w / 2, s.h - m * 0.45, 'center', 'rgba(255,255,255,0.45)');
  },
};

// ── 05 · Riso Misprint ───────────────────────────────────────────────────────

const RISO_PINK = '#ff48b0', RISO_BLUE = '#0078bf';
function bigType(ctx: Ctx, word: string, x: number, y: number, size: number, rot: number, color: string, maxLen: number) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.font = `900 ${size}px ${DISPLAY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(word).width; if (w > maxLen) { size *= maxLen / w; ctx.font = `900 ${size}px ${DISPLAY}`; }
  ctx.fillStyle = color; ctx.fillText(word, 0, 0);
  ctx.restore();
}
const risoMisprint: ScriptureLayout = {
  id: 'ug-riso', name: 'Riso Misprint', family: FAM, background: 'opaque', director: RH, animated: true,
  blurb: 'Two-colour risograph print — fluorescent pink and blue slightly out of register, huge chapter words — with the verse on clean paper.',
  draw(ctx, s) {
    const a = decoAlpha(s), mt = motionT(s), cls = aspectClass(s.w, s.h), m = safe(s);
    const font: Font = sz => `700 ${sz}px ${GROTESK}`;
    const yC = cls === 'vertical' || cls === 'portrait' ? 0.52 : isWide(cls) ? 0.52 : 0.6;
    const P = panel(ctx, s, font, { yC, lh: 1.26, padTop: 1.1, padBottom: 1.9, maxH: isWide(cls) ? 0.56 : 0.46, frac: isWide(cls) ? 0.62 : undefined });
    const words = keyWords(contextText(s), 3);
    const off = s.h * (0.006 + (1 - lifeIn(s, 1.4)) * 0.08 + lifeOut(s) * 0.1);
    const mx = off + Math.sin(mt * 0.37) * s.h * 0.004, my = off * 0.6 + Math.cos(mt * 0.29) * s.h * 0.003;
    const pinkA = clamp01(s.enterP * 2.4) * (1 - lifeOut(s)), blueA = clamp01(s.enterP * 2.4 - 0.3) * (1 - lifeOut(s));
    ctx.save(); ctx.globalAlpha = a;
    ctx.drawImage(tex('ug-paper', s.w, s.h, (c, w, h) => paintPaper(c, w, h, 31)), 0, 0, s.w, s.h);
    ctx.globalCompositeOperation = 'multiply';
    const drawWords = (color: string, dx: number, dy: number) => {
      if (isVert(cls)) {
        bigType(ctx, words[0], s.w / 2 + dx, Math.max(P.y * 0.5, s.h * 0.08) + dy, Math.min(s.w * 0.3, P.y * 0.7), -0.04, color, s.w * 0.9);
        bigType(ctx, words[1 % words.length], s.w / 2 + dx, (P.y + P.h + s.h) / 2 + dy, Math.min(s.w * 0.26, (s.h - P.y - P.h) * 0.6), 0.03, color, s.w * 0.9);
      } else if (isWide(cls)) {
        const colW = (s.w - P.w) / 2;
        bigType(ctx, words[0], colW / 2 + dx, s.h / 2 + dy, colW * 0.8, -Math.PI / 2, color, s.h * 1.02);
        bigType(ctx, words[1 % words.length], s.w - colW / 2 + dx, s.h / 2 + dy, colW * 0.8, Math.PI / 2, color, s.h * 1.02);
      } else {
        bigType(ctx, words[0], s.w / 2 + dx, P.y * 0.5 + dy, Math.min(s.h * 0.34, P.y * 0.78), -0.02, color, s.w * 0.92);
      }
    };
    // pink plate: halftone sun, zigzag, and the type (offset)
    ctx.globalAlpha = a * pinkA;
    const cell = Math.max(6, Math.round(Math.min(s.w, s.h) * 0.014));
    const dots = tile(`ug-dot-${cell}`, cell, cell, c => { c.fillStyle = RISO_PINK; c.beginPath(); c.arc(cell / 2, cell / 2, cell * 0.34, 0, Math.PI * 2); c.fill(); });
    const dp = ctx.createPattern(dots, 'repeat');
    const sunR = Math.min(s.w, s.h) * 0.3, sunX = isVert(cls) ? s.w * 0.85 : P.x + P.size * 0.5, sunY = isVert(cls) ? P.y : P.y + P.h;
    if (dp) { ctx.fillStyle = dp; ctx.beginPath(); ctx.arc(sunX + mx + Math.sin(mt * 0.08) * sunR * 0.05, sunY + my, sunR, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = RISO_PINK; ctx.lineWidth = Math.max(3, s.h * 0.012); ctx.lineJoin = 'miter';
    const zy = s.h - m * 1.1, zs = s.h * 0.03, zo = (mt * s.h * 0.02) % (zs * 2);
    ctx.beginPath(); for (let x = -zs * 2 + zo, k = 0; x < s.w * (isVert(cls) ? 1 : 0.45); x += zs, k++) { if (k) ctx.lineTo(x + mx, zy + (k % 2 ? -zs : zs) * 0.5 + my); else ctx.moveTo(x + mx, zy + my); }
    ctx.stroke();
    drawWords(RISO_PINK, mx, my);
    // blue plate: stripes and the type (in register)
    ctx.globalAlpha = a * blueA * 0.92;
    drawWords(RISO_BLUE, 0, 0);
    ctx.strokeStyle = RISO_BLUE; ctx.lineWidth = Math.max(2, s.h * 0.008);
    const st = (mt * s.h * 0.01) % (s.h * 0.04);
    ctx.save(); ctx.beginPath(); ctx.rect(s.w * 0.72, 0, s.w * 0.28, s.h * 0.3); ctx.clip();
    ctx.beginPath(); for (let k = -10; k < 16; k++) { const x0 = s.w * 0.7 + k * s.h * 0.04 + st; ctx.moveTo(x0, 0); ctx.lineTo(x0 + s.h * 0.3, s.h * 0.3); } ctx.stroke();
    ctx.restore();
    // plate shadow block in pink (misregistered), then the clean paper
    const g = life(s, 2, 1.3);
    ctx.globalAlpha = a * g;
    ctx.fillStyle = RISO_PINK; ctx.fillRect(P.x + P.size * 0.35 + mx, P.y + P.size * 0.35 + my, P.w, P.h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#f9f5ea'; ctx.fillRect(P.x, P.y, P.w, P.h);
    ctx.globalCompositeOperation = 'multiply';
    ctx.strokeStyle = RISO_BLUE; ctx.lineWidth = Math.max(2, P.size * 0.05); ctx.strokeRect(P.x - mx * 0.5, P.y - my * 0.5, P.w, P.h);
    ctx.restore();
    grain(ctx, s, 0.04, 0);
    drawReferenceLead(ctx, s, '#18306e');
    const r = verse(ctx, s, P, font, '#18306e');
    drawReference(ctx, s, s.w / 2, r.bottom + P.size * 1.0, 'center', refSize(P), '#c8106f', { font: `800 ${refSize(P)}px ${GROTESK}` });
    drawCopyright(ctx, s, s.w / 2, s.h - m * 0.45, 'center', 'rgba(24,48,110,0.6)');
  },
};

// ── 06 · Duct Tape (transparent) ─────────────────────────────────────────────

function tapeStrip(ctx: Ctx, x: number, y: number, w: number, h: number, seed: number, base: [string, string, string], mt: number, sheen = true) {
  if (w <= 2) return;
  const teeth = 7, tj = h * 0.12;
  ctx.beginPath(); ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  for (let k = 1; k <= teeth; k++) ctx.lineTo(x + w + (k % 2 ? tj : -tj * 0.3) * (0.6 + rnd(seed + k) * 0.8), y + (h * k) / teeth);
  ctx.lineTo(x, y + h);
  for (let k = teeth - 1; k > 0; k--) ctx.lineTo(x + (k % 2 ? -tj : tj * 0.3) * (0.6 + rnd(seed + 30 + k) * 0.8), y + (h * k) / teeth);
  ctx.closePath();
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = h * 0.25; ctx.shadowOffsetY = h * 0.08;
  const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, base[0]); g.addColorStop(0.5, base[1]); g.addColorStop(1, base[2]);
  ctx.fillStyle = g; ctx.fill();
  ctx.restore();
  ctx.save(); ctx.clip();
  // woven fibre texture
  ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = 1; ctx.beginPath();
  const st = h * 0.14;
  for (let k = -h; k < w + h; k += st) { ctx.moveTo(x + k, y); ctx.lineTo(x + k + h, y + h); ctx.moveTo(x + k + h, y); ctx.lineTo(x + k, y + h); }
  ctx.stroke();
  if (sheen) {
    const sx = x + (((mt * 0.07 + rnd(seed)) % 1.4) - 0.2) * w;
    const sg = ctx.createLinearGradient(sx - h * 2, 0, sx + h * 2, 0);
    sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.28)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sg; ctx.fillRect(sx - h * 2, y, h * 4, h);
  }
  ctx.restore();
}
const ductTape: ScriptureLayout = {
  id: 'ug-duct-tape', name: 'Duct Tape', family: FAM, background: 'transparent', director: RH, animated: true,
  blurb: 'Over camera: each line of the verse rides on its own torn strip of silver tape, pulled on line by line and ripped away at the end.',
  draw(ctx, s) {
    const a = decoAlpha(s), mt = motionT(s), cls = aspectClass(s.w, s.h);
    const font: Font = sz => `800 ${sz}px ${SANS}`;
    const lh = 1.5;
    const P = panel(ctx, s, font, { lh, yC: cls === 'vertical' ? 0.6 : isVert(cls) ? 0.6 : 0.62, inset: 0.05, k: 0.94, padTop: 0.4, padBottom: 1.8, maxH: cls === 'vertical' ? 0.46 : 0.5 });
    ctx.font = font(P.size);
    const n = P.lines.length;
    const silver: [string, string, string] = ['#d9d9d3', '#c2c2bc', '#9f9f99'];
    let lastEnd = 0, lastY = 0, lastH = 0;
    P.lines.forEach((line, li) => {
      const lw = ctx.measureText(line).width;
      const sw = lw + P.size * 1.1, sh = P.size * 1.22;
      const baseY = P.ty + li * P.size * lh + P.size * 0.98;
      const y0 = baseY - P.size * 0.9;
      const x0 = s.w / 2 - sw / 2;
      const q = easeOut(clamp01(s.enterP * 1.7 - (li / Math.max(1, n)) * 0.45));
      const e = easeInOut(clamp01(s.exitP * 1.6 - ((n - 1 - li) / Math.max(1, n)) * 0.4));
      if (q <= 0 || e >= 1) return;
      ctx.save(); ctx.globalAlpha = a * (1 - e);
      ctx.translate(e * s.w * 0.25, -e * sh * 0.8);
      ctx.translate(s.w / 2, y0 + sh / 2); ctx.rotate((rnd(li + 3) - 0.5) * 0.012 + e * 0.06); ctx.translate(-s.w / 2, -(y0 + sh / 2));
      tapeStrip(ctx, x0, y0, sw * q, sh, li * 17 + 1, silver, mt);
      ctx.restore();
      lastEnd = x0 + sw; lastY = y0; lastH = sh;
    });
    // loose flap on the last strip, lifting gently
    if (n && life(s) > 0.98) {
      const fl = P.size * (0.45 + 0.12 * Math.sin(mt * 1.4));
      ctx.save(); ctx.globalAlpha = a * 0.9; ctx.fillStyle = '#e4e4de';
      ctx.beginPath(); ctx.moveTo(lastEnd, lastY + lastH - fl); ctx.lineTo(lastEnd, lastY + lastH); ctx.lineTo(lastEnd + fl * 0.5, lastY + lastH + fl * 0.35); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    drawReferenceLead(ctx, s, '#ffffff');
    const r = verse(ctx, s, P, font, '#141414');
    // reference on a short strip of pink gaffer tape
    const rs = refSize(P), ry = r.bottom + P.size * 1.15;
    const refText = (s.reference + (s.translation ? `  ·  ${s.translation}` : '')).toUpperCase();
    ctx.save(); ctx.font = `900 ${rs}px ${SANS}`;
    const rw = ctx.measureText(refText).width + refText.length * Math.round(rs * 0.16) + rs * 1.6;
    const rq = life(s, 1.4, 1.6);
    ctx.globalAlpha = a; ctx.translate(s.w / 2, ry - rs * 0.4); ctx.rotate(-0.02); ctx.translate(-s.w / 2, -(ry - rs * 0.4));
    tapeStrip(ctx, s.w / 2 - rw / 2, ry - rs * 1.25, rw * rq, rs * 1.75, 99, ['#ff6fb5', '#ff4fa3', '#e23a8a'], mt, false);
    ctx.restore();
    drawReference(ctx, s, s.w / 2, ry, 'center', rs, '#141414', { font: `900 ${rs}px ${SANS}`, tracking: 0.16 });
    drawCopyright(ctx, s, s.w / 2, s.h - safe(s) * 0.4, 'center', 'rgba(255,255,255,0.7)');
  },
};

// ── 07 · Chalk Talk ──────────────────────────────────────────────────────────

function chalk(ctx: Ctx, build: () => void, lw: number, color: string, p: number, len: number) {
  if (p <= 0) return;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.setLineDash(p < 1 ? [len * p, len * 2] : []);
  ctx.strokeStyle = rgba(color, 0.78); ctx.lineWidth = lw; build(); ctx.stroke();
  if (p >= 1) { ctx.setLineDash([lw * 0.3, lw * 0.9]); ctx.strokeStyle = rgba(color, 0.3); ctx.lineWidth = lw * 1.7; build(); ctx.stroke(); }
  ctx.restore();
}
const chalkTalk: ScriptureLayout = {
  id: 'ug-chalk', name: 'Chalk Talk', family: FAM, background: 'opaque', director: RH, animated: true,
  blurb: 'A youth-room chalkboard: ghosts of the chapter half-erased, hand-drawn arrows, stars and a little cross, the verse written fresh in the wiped middle.',
  draw(ctx, s) {
    const a = decoAlpha(s), mt = motionT(s), cls = aspectClass(s.w, s.h), m = safe(s);
    const font: Font = sz => `600 ${sz}px ${DISPLAY}`;
    const P = panel(ctx, s, font, { yC: cls === 'vertical' ? 0.5 : 0.5, padTop: 0.9, padBottom: 2.1, maxH: cls === 'vertical' ? 0.46 : 0.5 });
    const fr = Math.max(4, m * 0.32);
    ctx.save(); ctx.globalAlpha = a;
    ctx.drawImage(tex('ug-slate', s.w, s.h, (c, w, h) => paintSlate(c, w, h, 41)), 0, 0, s.w, s.h);
    // ghost writing from the chapter, half-erased
    const gs = Math.max(14, isVert(cls) ? s.w * 0.04 : s.h * 0.042);
    ctx.font = `italic ${gs}px ${SERIF}`; ctx.fillStyle = 'rgba(235,240,232,0.07)'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const ghost = contextText(s);
    const rowsN = Math.ceil(s.h / (gs * 1.9));
    for (let i = 0; i < rowsN; i++) {
      const o = Math.floor(rnd(i + 2) * Math.max(1, ghost.length - 200));
      ctx.fillText(ghost.slice(o, o + 140), -rnd(i) * s.w * 0.3, gs * 1.2 + i * gs * 1.9);
    }
    // freshly wiped (wet) area behind the verse
    const wg = ctx.createRadialGradient(s.w / 2, P.y + P.h / 2, 0, s.w / 2, P.y + P.h / 2, Math.max(P.w, P.h) * 0.62);
    wg.addColorStop(0, 'rgba(10,18,15,0.62)'); wg.addColorStop(0.7, 'rgba(10,18,15,0.45)'); wg.addColorStop(1, 'rgba(10,18,15,0)');
    ctx.fillStyle = wg; ctx.fillRect(0, 0, s.w, s.h);
    ctx.strokeStyle = 'rgba(230,240,235,0.03)'; ctx.lineCap = 'round'; ctx.lineWidth = P.size * 1.2;
    for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(P.x - P.size, P.y + P.h * (0.15 + k * 0.24)); ctx.quadraticCurveTo(s.w / 2, P.y + P.h * (0.1 + k * 0.24), P.x + P.w + P.size, P.y + P.h * (0.2 + k * 0.24)); ctx.stroke(); }
    // dust motes
    ctx.fillStyle = 'rgba(240,240,232,0.28)';
    for (let i = 0; i < 40; i++) {
      const x = rnd(i) * s.w + Math.sin(mt * 0.3 + i) * s.w * 0.01;
      const y = ((rnd(i + 3) + mt * 0.008 * (0.5 + rnd(i + 5))) % 1) * s.h;
      const d = 1 + rnd(i + 7) * 2.2; ctx.fillRect(x, y, d, d);
    }
    // doodles
    const sz = P.size, lw = Math.max(2, sz * 0.08);
    const dp = (i: number) => easeOut(clamp01(s.enterP * 1.9 - 0.3 - i * 0.09)) * (1 - lifeOut(s, 1.6));
    const white = '#f3f0e6', yellow = '#ffe27a', pink = '#ff9ec7', blue = '#9edcff';
    const topRoom = P.y - m;
    if (topRoom > sz * 1.6) {
      const cx = s.w / 2, cy = P.y - Math.min(topRoom * 0.5, sz * 1.2), cs = Math.min(sz * 0.9, topRoom * 0.38);
      chalk(ctx, () => { ctx.beginPath(); ctx.moveTo(cx, cy - cs); ctx.lineTo(cx, cy + cs); ctx.moveTo(cx - cs * 0.6, cy - cs * 0.35); ctx.lineTo(cx + cs * 0.6, cy - cs * 0.35); }, lw, yellow, dp(0), cs * 4);
      const pulse = 1 + 0.08 * Math.sin(mt * 1.2);
      chalk(ctx, () => { ctx.beginPath(); for (let k = 0; k < 8; k++) { const an = (k / 8) * Math.PI * 2 + Math.PI / 8; ctx.moveTo(cx + Math.cos(an) * cs * 1.3 * pulse, cy - cs * 0.2 + Math.sin(an) * cs * 1.3 * pulse); ctx.lineTo(cx + Math.cos(an) * cs * 1.7 * pulse, cy - cs * 0.2 + Math.sin(an) * cs * 1.7 * pulse); } }, lw * 0.7, yellow, dp(1), cs * 8);
    }
    const side = (s.w - P.w) / 2;
    if (side > sz * 2.8) {
      for (const dir of [-1, 1]) {
        const ex = dir < 0 ? P.x - sz * 0.35 : P.x + P.w + sz * 0.35, ey = P.y + P.h * 0.45;
        const sx = ex + dir * Math.min(side * 0.65, sz * 3.2), sy = ey - sz * 1.6;
        chalk(ctx, () => { ctx.beginPath(); ctx.moveTo(sx, sy); ctx.bezierCurveTo(sx + dir * sz, sy + sz * 1.6, ex + dir * sz * 1.2, ey + sz * 0.4, ex, ey); ctx.moveTo(ex, ey); ctx.lineTo(ex + dir * sz * 0.5, ey - sz * 0.15); ctx.moveTo(ex, ey); ctx.lineTo(ex + dir * sz * 0.25, ey + sz * 0.45); }, lw, dir < 0 ? pink : blue, dp(2), sz * 7);
      }
    }
    const starSpots: [number, number, number][] = isVert(cls)
      ? [[0.14, 0.1, 0.5], [0.86, 0.14, 0.4], [0.12, 0.9, 0.42], [0.88, 0.87, 0.5]]
      : [[0.07, 0.15, 0.5], [0.93, 0.18, 0.42], [0.08, 0.82, 0.42], [0.92, 0.84, 0.5]];
    starSpots.forEach(([fx, fy, k], i) => {
      const r0 = sz * k * (1 + 0.06 * Math.sin(mt * 1.5 + i));
      chalk(ctx, () => starPath(ctx, s.w * fx, s.h * fy, r0, 5, 0.45, -Math.PI / 2 + i), lw * 0.8, i % 2 ? yellow : white, dp(3 + i), r0 * 9);
    });
    // chalk tray + frame
    ctx.fillStyle = '#5a3d22'; ctx.fillRect(0, 0, s.w, fr); ctx.fillRect(0, 0, fr, s.h); ctx.fillRect(s.w - fr, 0, fr, s.h); ctx.fillRect(0, s.h - fr * 1.6, s.w, fr * 1.6);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(fr, fr, s.w - fr * 2, Math.max(1, fr * 0.2)); ctx.fillRect(fr, s.h - fr * 1.6 - Math.max(1, fr * 0.2), s.w - fr * 2, Math.max(1, fr * 0.2));
    const sticks = ['#f3f0e6', '#ffe27a', '#ff9ec7', '#9edcff'];
    sticks.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(s.w * (isVert(cls) ? 0.6 : 0.72) + i * fr * 2.6, s.h - fr * 1.45, fr * 2, fr * 0.55); });
    ctx.restore();
    drawReferenceLead(ctx, s, '#f3f0e6');
    const r = verse(ctx, s, P, font, '#f5f2e8');
    const rs = refSize(P), ry = r.bottom + P.size * 1.0;
    drawReference(ctx, s, s.w / 2, ry, 'center', rs, '#ffe27a', { font: `700 ${rs}px ${DISPLAY}`, tracking: 0.14 });
    // underline swoosh under the reference
    const uw = Math.min(P.w * 0.5, rs * 14);
    ctx.save(); ctx.globalAlpha = a;
    chalk(ctx, () => { ctx.beginPath(); ctx.moveTo(s.w / 2 - uw / 2, ry + rs * 0.55); ctx.bezierCurveTo(s.w / 2 - uw / 6, ry + rs * 0.9, s.w / 2 + uw / 6, ry + rs * 0.2, s.w / 2 + uw / 2, ry + rs * 0.6); }, Math.max(2, rs * 0.12), '#ffe27a', dp(4), uw * 1.3);
    ctx.restore();
    drawCopyright(ctx, s, s.w / 2, s.h - fr * 1.6 - m * 0.2, 'center', 'rgba(243,240,230,0.45)');
  },
};

// ── 08 · Neon Alley ──────────────────────────────────────────────────────────

function neonOn(s: ScriptureState, i: number, mt: number): number {
  if (s.exitP > 0) { const p = s.exitP * 1.5; if (p >= 1) return 0; return rnd(Math.floor(mt * 22) + i * 31) < p ? 0.1 : 1; }
  if (s.enterP < 1) { const p = s.enterP * 1.5; if (p >= 1) return 1; return rnd(Math.floor(mt * 22) + i * 31) < p ? 1 : 0.1; }
  const dip = rnd(Math.floor(mt * 9) + i * 57) < 0.025 ? 0.55 : 1;
  return dip * (0.96 + 0.04 * Math.sin(mt * 3.1 + i));
}
function neonStroke(ctx: Ctx, build: () => void, color: string, lw: number, I: number) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = lw; build(); ctx.stroke();
  if (I <= 0.12) return;
  for (const [mul, al] of [[7, 0.05], [3.6, 0.14], [1.7, 0.9]] as [number, number][]) { ctx.strokeStyle = rgba(color, al * I); ctx.lineWidth = lw * mul; build(); ctx.stroke(); }
  ctx.strokeStyle = `rgba(255,255,255,${0.8 * I})`; ctx.lineWidth = lw * 0.55; build(); ctx.stroke();
}
const neonAlley: ScriptureLayout = {
  id: 'ug-neon-alley', name: 'Neon Alley', family: FAM, background: 'opaque', director: FUT, animated: true,
  blurb: 'Night brick wall and wet pavement: a humming neon frame and a little neon cross sputter on around the verse.',
  draw(ctx, s) {
    const a = decoAlpha(s), mt = motionT(s), cls = aspectClass(s.w, s.h), m = safe(s);
    const font: Font = sz => `500 ${sz}px ${DISPLAY}`;
    const P = panel(ctx, s, font, { yC: isVert(cls) ? 0.53 : 0.54, frac: isVert(cls) ? 0.84 : 0.7, padTop: 1.1, padBottom: 1.9, maxH: cls === 'vertical' ? 0.42 : 0.46 });
    const pad = P.size * 0.55;
    const fx = P.x - pad, fy = P.y - pad, fw = P.w + pad * 2, fh = P.h + pad * 2;
    const pink = '#ff4fa8', cyan = '#6ff7ff', warm = '#ffd9a0';
    const I0 = neonOn(s, 0, mt), I1 = neonOn(s, 1, mt);
    ctx.save(); ctx.globalAlpha = a;
    ctx.drawImage(tex('ug-brick-night', s.w, s.h, (c, w, h) => paintBrick(c, w, h, [58, 44, 66], '#141016', 13)), 0, 0, s.w, s.h);
    ctx.fillStyle = 'rgba(6,4,14,0.4)'; ctx.fillRect(0, 0, s.w, s.h);
    // glow on the bricks
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const gr = ctx.createRadialGradient(s.w / 2, fy + fh / 2, Math.min(fw, fh) * 0.3, s.w / 2, fy + fh / 2, Math.max(fw, fh) * 0.95);
    gr.addColorStop(0, rgba(pink, 0.16 * I0)); gr.addColorStop(1, rgba(pink, 0));
    ctx.fillStyle = gr; ctx.fillRect(0, 0, s.w, s.h);
    ctx.restore();
    // wet pavement with neon reflections
    const gy = isVert(cls) ? s.h * 0.88 : s.h * 0.86;
    const pg = ctx.createLinearGradient(0, gy, 0, s.h); pg.addColorStop(0, '#0b0910'); pg.addColorStop(1, '#040306');
    ctx.fillStyle = pg; ctx.fillRect(0, gy, s.w, s.h - gy);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const hg = ctx.createLinearGradient(0, gy, 0, gy + (s.h - gy) * 0.5);
    hg.addColorStop(0, rgba(pink, 0.3 * I0)); hg.addColorStop(1, rgba(pink, 0));
    ctx.fillStyle = hg; ctx.fillRect(fx, gy, fw, (s.h - gy) * 0.5);
    for (let k = 0; k < 14; k++) {
      const rx = fx + fw * rnd(k * 3.7) + Math.sin(mt * 0.9 + k) * s.w * 0.003;
      const rl = (s.h - gy) * (0.4 + rnd(k) * 0.6);
      const rg2 = ctx.createLinearGradient(0, gy, 0, gy + rl);
      rg2.addColorStop(0, rgba(k % 4 === 1 ? cyan : pink, 0.16 * I0)); rg2.addColorStop(1, rgba(pink, 0));
      ctx.fillStyle = rg2; ctx.fillRect(rx, gy, Math.max(2, s.w * 0.003 * (0.5 + rnd(k + 9))), rl);
    }
    ctx.restore();
    // reading field inside the frame
    ctx.fillStyle = 'rgba(5,3,12,0.66)'; ctx.beginPath(); rr(ctx, fx, fy, fw, fh, pad * 1.2); ctx.fill();
    // neon frame (with a break at top centre for the cross on landscape)
    const lw = Math.max(2, s.h * 0.0045);
    neonStroke(ctx, () => { ctx.beginPath(); rr(ctx, fx, fy, fw, fh, pad * 1.2); }, pink, lw, I0);
    // little neon cross above
    const topRoom = fy - m * 0.6;
    if (topRoom > P.size * 1.1) {
      const cs = Math.min(topRoom * 0.42, P.size * 1.1), cx = s.w / 2, cy = fy - topRoom * 0.5;
      neonStroke(ctx, () => { ctx.beginPath(); ctx.moveTo(cx, cy - cs); ctx.lineTo(cx, cy + cs); ctx.moveTo(cx - cs * 0.62, cy - cs * 0.3); ctx.lineTo(cx + cs * 0.62, cy - cs * 0.3); }, warm, lw * 1.1, I1);
    }
    // side signs on wide walls: words from the chapter in neon script
    if (isWide(cls) || isVert(cls)) {
      const words = keyWords(contextText(s), 2);
      ctx.font = `italic 600 ${10}px ${SERIF}`;
      const place: [string, number, number, number][] = isVert(cls)
        ? [[words[0], s.w / 2, (fy + fh + gy) / 2, Math.min(s.w * 0.8, (gy - fy - fh) * 2.4)]]
        : [[words[0], (fx) / 2, s.h * 0.45, fx * 0.8], [words[1 % words.length], s.w - fx / 2, s.h * 0.45, fx * 0.8]];
      place.forEach(([w2, x, y, maxW], i) => {
        let size = s.h * 0.12;
        ctx.font = `italic 600 ${size}px ${SERIF}`;
        const tw = ctx.measureText(w2.toLowerCase()).width; if (tw > maxW) size *= maxW / tw;
        if (size < s.h * 0.03) return;
        ctx.font = `italic 600 ${size}px ${SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const I = neonOn(s, 3 + i, mt);
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = size * 0.04; ctx.strokeText(w2.toLowerCase(), x, y);
        if (I > 0.12) for (const [mul, al] of [[0.22, 0.06], [0.11, 0.16], [0.05, 0.9], [0.018, 0.8]] as [number, number][]) {
          ctx.strokeStyle = al === 0.8 ? `rgba(255,255,255,${al * I})` : rgba(i ? pink : cyan, al * I); ctx.lineWidth = size * mul; ctx.strokeText(w2.toLowerCase(), x, y);
        }
      });
    }
    ctx.restore();
    drawReferenceLead(ctx, s, '#fff4ea');
    const r = verse(ctx, s, P, font, '#fff4ea');
    drawReference(ctx, s, s.w / 2, r.bottom + P.size * 1.0, 'center', refSize(P), '#ff7cc0', { font: `600 ${refSize(P)}px ${SANS}`, tracking: 0.22 });
    drawCopyright(ctx, s, s.w / 2, s.h - m * 0.45, 'center', 'rgba(255,255,255,0.45)');
  },
};

// ── 09 · Sticker Bomb (transparent) ──────────────────────────────────────────

const STICK = ['#ff4f9a', '#ffd23f', '#3ddc97', '#4cc9f0', '#9b5de5', '#ff7a1a', '#f7f7f2'];
const STICK_INK = ['#fff', '#141414', '#141414', '#141414', '#fff', '#141414', '#141414'];
function stickerShape(ctx: Ctx, kind: number, r: number) {
  ctx.beginPath();
  switch (kind) {
    case 0: ctx.arc(0, 0, r, 0, Math.PI * 2); break;
    case 1: starPath(ctx, 0, 0, r * 1.1, 5, 0.5); break;
    case 2: rr(ctx, -r * 1.45, -r * 0.62, r * 2.9, r * 1.24, r * 0.3); break;
    case 3: ctx.moveTo(0, r * 0.85); ctx.bezierCurveTo(-r * 1.4, -r * 0.1, -r * 0.7, -r * 1.15, 0, -r * 0.45); ctx.bezierCurveTo(r * 0.7, -r * 1.15, r * 1.4, -r * 0.1, 0, r * 0.85); ctx.closePath(); break;
    case 4: ctx.moveTo(r * 0.2, -r); ctx.lineTo(-r * 0.6, r * 0.15); ctx.lineTo(-r * 0.05, r * 0.15); ctx.lineTo(-r * 0.25, r); ctx.lineTo(r * 0.6, -r * 0.2); ctx.lineTo(r * 0.05, -r * 0.2); ctx.closePath(); break;
    default: for (let i = 0; i < 28; i++) { const an = (i / 28) * Math.PI * 2, rad = i % 2 ? r * 0.88 : r; if (i) ctx.lineTo(Math.cos(an) * rad, Math.sin(an) * rad); else ctx.moveTo(rad, 0); } ctx.closePath();
  }
}
const STICK_COUNT: Record<AspectClass, number> = { vertical: 16, portrait: 14, classic: 14, screen: 16, ultrawide: 20, wall: 26 };
const stickerBomb: ScriptureLayout = {
  id: 'ug-sticker-bomb', name: 'Sticker Bomb', family: FAM, background: 'transparent', director: TRAV, animated: true,
  blurb: 'Over camera: bright die-cut stickers of the chapter’s words slap onto the corners, and the verse sits on a big white label.',
  draw(ctx, s) {
    const a = decoAlpha(s), mt = motionT(s), cls = aspectClass(s.w, s.h);
    const font: Font = sz => `700 ${sz}px ${DISPLAY}`;
    const P = panel(ctx, s, font, { yC: 0.5, padTop: 1.0, padBottom: 1.8, frac: isVert(cls) ? 0.86 : 0.7, maxH: cls === 'vertical' ? 0.42 : 0.48 });
    const words = keyWords(contextText(s), 10).filter(w => w.length <= 8);
    if (!words.length) words.push('GRACE');
    const R0 = Math.min(s.w, s.h);
    const N = STICK_COUNT[cls];
    // corner (and, on wide formats, side) clusters, avoiding the label
    const anchors: [number, number][] = isVert(cls)
      ? [[0, 0], [1, 0], [0.5, 0], [0, 1], [1, 1], [0.5, 1]]
      : isWide(cls) ? [[0, 0], [1, 0], [0, 1], [1, 1], [0, 0.5], [1, 0.5]] : [[0, 0], [1, 0], [0, 1], [1, 1]];
    const lx0 = P.x - R0 * 0.03, lx1 = P.x + P.w + R0 * 0.03, ly0 = P.y - R0 * 0.03, ly1 = P.y + P.h + R0 * 0.03;
    let placed = 0;
    for (let i = 0; i < N * 10 && placed < N; i++) {
      const an = anchors[i % anchors.length];
      const r = R0 * (0.045 + rnd(i * 3.1) * 0.04);
      const spread = R0 * (isVert(cls) ? 0.34 : 0.4);
      const x = an[0] * s.w + (an[0] === 0 ? 1 : an[0] === 1 ? -1 : (rnd(i * 5.3) - 0.5) * 3) * rnd(i * 1.7) * spread + (an[0] === 0 ? r * 0.6 : an[0] === 1 ? -r * 0.6 : 0);
      const y = an[1] * s.h + (an[1] === 0 ? 1 : an[1] === 1 ? -1 : (rnd(i * 6.1) - 0.5) * 3) * rnd(i * 2.9) * spread + (an[1] === 0 ? r * 0.6 : an[1] === 1 ? -r * 0.6 : 0);
      if (x < r * 1.6 || x > s.w - r * 1.6 || y < r * 1.2 || y > s.h - r * 1.2) continue;
      if (x + r * 1.4 > lx0 && x - r * 1.4 < lx1 && y + r > ly0 && y - r < ly1) continue;
      const order = placed++;
      const q = clamp01(s.enterP * 1.9 - (order / N) * 0.55), e = clamp01(s.exitP * 1.7 - ((N - 1 - order) / N) * 0.5);
      if (q <= 0 || e >= 1) continue;
      const kind = Math.floor(rnd(i * 7.7) * 6);
      const ci = Math.floor(rnd(i * 4.4) * STICK.length);
      ctx.save(); ctx.globalAlpha = a * (1 - e);
      ctx.translate(x, y);
      ctx.rotate((rnd(i * 9.1) - 0.5) * 0.7 + (1 - q) * 0.6 + e * 0.9 + Math.sin(mt * 1.1 + i) * 0.025);
      const sc = easeBack(q) * (1 - e * 0.6); ctx.scale(sc, sc);
      ctx.save(); ctx.translate(r * 0.06, r * 0.09); stickerShape(ctx, kind, r); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fill(); ctx.restore();
      stickerShape(ctx, kind, r);
      ctx.lineJoin = 'round'; ctx.lineWidth = r * 0.2; ctx.strokeStyle = '#ffffff'; ctx.stroke();
      ctx.fillStyle = STICK[ci]; ctx.fill();
      // glossy highlight
      ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.beginPath(); ctx.ellipse(-r * 0.3, -r * 0.35, r * 0.45, r * 0.18, -0.5, 0, Math.PI * 2); ctx.fill();
      if (kind === 0 || kind === 2 || kind === 5) {
        const w = words[i % words.length];
        const box = kind === 2 ? r * 2.5 : r * 1.55;
        let fs = kind === 2 ? r * 0.62 : r * 0.46;
        ctx.font = `900 ${fs}px ${DISPLAY}`; const tw = ctx.measureText(w).width; if (tw > box) fs *= box / tw;
        ctx.font = `900 ${fs}px ${DISPLAY}`; ctx.fillStyle = STICK_INK[ci]; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(w, 0, fs * 0.05);
      }
      ctx.restore();
    }
    // the big white label
    const lq = clamp01(s.enterP * 2.6), le = lifeOut(s, 1.3);
    if (lq > 0 && le < 1) {
      ctx.save(); ctx.globalAlpha = a * (1 - le);
      const cx = s.w / 2, cy = P.y + P.h / 2;
      ctx.translate(cx, cy); ctx.rotate(-0.008 + (1 - lq) * 0.08 + le * 0.1); const sc = easeBack(lq) * (1 - le * 0.2); ctx.scale(sc, sc); ctx.translate(-cx, -cy);
      ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.beginPath(); rr(ctx, P.x + P.size * 0.12, P.y + P.size * 0.2, P.w, P.h, P.size * 0.5); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); rr(ctx, P.x - P.size * 0.14, P.y - P.size * 0.14, P.w + P.size * 0.28, P.h + P.size * 0.28, P.size * 0.6); ctx.fill();
      ctx.fillStyle = '#fbfaf5'; ctx.beginPath(); rr(ctx, P.x, P.y, P.w, P.h, P.size * 0.5); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = Math.max(1, P.size * 0.03); ctx.setLineDash([P.size * 0.18, P.size * 0.12]);
      ctx.beginPath(); rr(ctx, P.x + P.size * 0.2, P.y + P.size * 0.2, P.w - P.size * 0.4, P.h - P.size * 0.4, P.size * 0.35); ctx.stroke();
      ctx.restore();
    }
    drawReferenceLead(ctx, s, '#ffffff');
    const r = verse(ctx, s, P, font, '#141414');
    drawReference(ctx, s, s.w / 2, r.bottom + P.size * 1.0, 'center', refSize(P), '#e0136f', { font: `900 ${refSize(P)}px ${SANS}`, tracking: 0.14 });
    drawCopyright(ctx, s, s.w / 2, s.h - safe(s) * 0.4, 'center', 'rgba(255,255,255,0.7)');
  },
};

// ── 10 · Stencil Spray (transparent) ─────────────────────────────────────────

const stencilSpray: ScriptureLayout = {
  id: 'ug-stencil', name: 'Stencil Spray', family: FAM, background: 'transparent', director: RH, animated: true,
  blurb: 'Over camera: a sprayed-on matte panel with overspray and slow paint drips, a stencilled header word, and crate-style marks.',
  draw(ctx, s) {
    const a = decoAlpha(s), mt = motionT(s), cls = aspectClass(s.w, s.h);
    const font: Font = sz => `600 ${sz}px ${GROTESK}`;
    const P = panel(ctx, s, font, { yC: isVert(cls) ? 0.56 : 0.56, padTop: 2.7, padBottom: 1.85, maxH: cls === 'vertical' ? 0.42 : 0.46 });
    const sz = P.size;
    const rev = life(s, 1.8, 1.3);
    const plateCol = '#111113';
    ctx.save(); ctx.globalAlpha = a;
    // overspray halo (static, seeded)
    ctx.fillStyle = 'rgba(17,17,19,0.5)';
    for (let i = 0; i < 220; i++) {
      const side = i % 4, t = rnd(i * 1.3), d = Math.pow(rnd(i * 2.7), 2) * sz * 0.9;
      const x = side < 2 ? P.x + t * P.w : side === 2 ? P.x - d : P.x + P.w + d;
      const y = side >= 2 ? P.y + t * P.h : side === 0 ? P.y - d : P.y + P.h + d;
      if (x > P.x + P.w * rev) continue;
      const ds = 1 + rnd(i * 4.1) * sz * 0.06; ctx.fillRect(x, y, ds, ds);
    }
    // the panel, revealed by a sweeping spray edge
    const ex = P.x + P.w * rev;
    ctx.save(); ctx.beginPath(); ctx.moveTo(P.x - 2, P.y);
    if (rev >= 1) ctx.lineTo(P.x + P.w, P.y); else for (let k = 0; k <= 10; k++) ctx.lineTo(ex + (rnd(k + Math.floor(mt * 15)) - 0.5) * sz * 0.5, P.y + (P.h * k) / 10);
    if (rev >= 1) ctx.lineTo(P.x + P.w, P.y + P.h);
    ctx.lineTo(P.x - 2, P.y + P.h); ctx.closePath(); ctx.clip();
    ctx.fillStyle = 'rgba(17,17,19,0.88)'; ctx.fillRect(P.x, P.y, P.w, P.h);
    ctx.restore();
    if (rev > 0 && rev < 1) {
      ctx.fillStyle = 'rgba(17,17,19,0.4)';
      for (let i = 0; i < 40; i++) { const fr = Math.floor(mt * 24); ctx.fillRect(ex + (rnd(i + fr) - 0.3) * sz * 0.9, P.y + rnd(i * 3 + fr) * P.h, 2 + rnd(i) * 3, 2 + rnd(i) * 3); }
    }
    // drips from the bottom edge
    for (let i = 0; i < 4; i++) {
      const dx = P.x + P.w * (0.12 + rnd(i * 8.3) * 0.76);
      if (dx > ex) continue;
      const cyc = (mt * 0.035 + rnd(i * 2.2)) % 1;
      const len = sz * (0.3 + cyc * 1.6), dw = sz * (0.06 + rnd(i) * 0.05);
      ctx.fillStyle = `rgba(17,17,19,${0.85 * (1 - Math.max(0, cyc - 0.8) * 5)})`;
      ctx.fillRect(dx, P.y + P.h - 1, dw, len);
      ctx.beginPath(); ctx.arc(dx + dw / 2, P.y + P.h + len, dw * 0.8, 0, Math.PI * 2); ctx.fill();
    }
    // stencilled header word from the chapter, with bridges
    const word = keyWords(contextText(s), 3)[0];
    const hq = clamp01(s.enterP * 2 - 0.35) * (1 - lifeOut(s, 1.6));
    if (hq > 0 && rev > 0.5) {
      let hs = sz * 0.95;
      ctx.font = `900 ${hs}px ${DISPLAY}`;
      (ctx as any).letterSpacing = `${Math.round(hs * 0.12)}px`;
      const maxW = P.w * 0.62; const tw = ctx.measureText(word).width; if (tw > maxW) { hs *= maxW / tw; ctx.font = `900 ${hs}px ${DISPLAY}`; (ctx as any).letterSpacing = `${Math.round(hs * 0.12)}px`; }
      const hy = P.y + sz * 1.45;
      ctx.globalAlpha = a * hq; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255,210,63,0.12)'; ctx.fillText(word, s.w / 2 + hs * 0.04, hy + hs * 0.04);
      ctx.fillStyle = '#ffd23f'; ctx.fillText(word, s.w / 2, hy);
      const tw2 = ctx.measureText(word).width;
      (ctx as any).letterSpacing = '0px';
      ctx.fillStyle = plateCol; ctx.fillRect(s.w / 2 - tw2 / 2 - hs, hy - hs * 0.04, tw2 + hs * 2, Math.max(2, hs * 0.075));
      ctx.fillStyle = '#ffd23f';
      starPath(ctx, s.w / 2 - tw2 / 2 - hs * 0.55, hy, hs * 0.26); ctx.fill();
      starPath(ctx, s.w / 2 + tw2 / 2 + hs * 0.55, hy, hs * 0.26); ctx.fill();
      // registration marks at the corners
      ctx.strokeStyle = 'rgba(245,245,240,0.55)'; ctx.lineWidth = Math.max(1.5, sz * 0.04);
      const cm = sz * 0.32;
      ctx.beginPath();
      for (const [cx, cy] of [[P.x + sz * 0.55, P.y + sz * 0.55], [P.x + P.w - sz * 0.55, P.y + sz * 0.55], [P.x + sz * 0.55, P.y + P.h - sz * 0.55], [P.x + P.w - sz * 0.55, P.y + P.h - sz * 0.55]]) {
        ctx.moveTo(cx - cm, cy); ctx.lineTo(cx + cm, cy); ctx.moveTo(cx, cy - cm); ctx.lineTo(cx, cy + cm);
      }
      ctx.stroke();
    }
    ctx.restore();
    drawReferenceLead(ctx, s, '#ffffff');
    const r = verse(ctx, s, P, font, '#f4f4ef');
    drawReference(ctx, s, s.w / 2, r.bottom + sz * 1.0, 'center', refSize(P), '#ffd23f', { font: `700 ${refSize(P)}px ${GROTESK}`, tracking: 0.2 });
    drawCopyright(ctx, s, s.w / 2, s.h - safe(s) * 0.4, 'center', 'rgba(255,255,255,0.7)');
  },
};

// ── 11 · Night Drive ─────────────────────────────────────────────────────────

const BOKEH = ['#ffb347', '#ff4d6d', '#5cc8ff', '#ff79c6', '#ffe08a'];
const nightDrive: ScriptureLayout = {
  id: 'ug-night-drive', name: 'Night Drive', family: FAM, background: 'opaque', director: FUT, animated: true, generator: 'TUNNEL',
  blurb: 'City lights from a car window at night — skyline, rain, drifting bokeh and light leaks — with the verse on smoked glass.',
  draw(ctx, s) {
    const a = decoAlpha(s), mt = motionT(s), cls = aspectClass(s.w, s.h), m = safe(s);
    const font: Font = sz => `500 ${sz}px ${DISPLAY}`;
    const P = panel(ctx, s, font, { yC: isVert(cls) ? 0.47 : 0.46, padTop: 1.0, padBottom: 1.8 });
    ctx.save(); ctx.globalAlpha = a;
    const sky = ctx.createLinearGradient(0, 0, 0, s.h); sky.addColorStop(0, '#070a1f'); sky.addColorStop(0.7, '#1c0b2b'); sky.addColorStop(1, '#05060d');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, s.w, s.h);
    coverFrame(ctx, s, s.genFrame, 0.35);
    // two parallax skyline layers
    const baseY = s.h * (isVert(cls) ? 0.86 : 0.8);
    for (let L = 0; L < 2; L++) {
      const bw = s.h * (L ? 0.11 : 0.075);
      const shift = mt * s.h * (L ? 0.045 : 0.016);
      const first = Math.floor(shift / bw), count = Math.ceil(s.w / bw) + 2;
      for (let j = 0; j < count; j++) {
        const k = first + j, x = k * bw - shift;
        const bh = s.h * (0.14 + rnd(k * 3.3 + L * 100) * 0.3) * (L ? 1 : 1.25);
        ctx.fillStyle = L ? '#0a0812' : '#130f22';
        ctx.fillRect(x, baseY - bh, bw * 0.94, bh);
        if (L) {
          const ww = bw / 6, wh = s.h * 0.012;
          ctx.fillStyle = 'rgba(255,196,110,0.5)';
          for (let wy = baseY - bh + wh * 2; wy < baseY - wh; wy += wh * 2.4)
            for (let wx = 0; wx < 4; wx++) if (rnd(k * 17 + wx * 3.1 + wy * 0.13) > 0.62) ctx.fillRect(x + ww * (0.7 + wx * 1.25), wy, ww * 0.7, wh);
        }
      }
    }
    // road with racing lane dashes
    ctx.fillStyle = '#05050a'; ctx.fillRect(0, baseY, s.w, s.h - baseY);
    ctx.fillStyle = 'rgba(255,200,90,0.55)';
    for (let i = 0; i < 9; i++) {
      const t = ((i + mt * 0.9) % 9) / 9, t2 = Math.min(1, t + 0.05);
      const y0 = baseY + t * t * (s.h - baseY), y1 = baseY + t2 * t2 * (s.h - baseY);
      const w0 = s.w * 0.004 + t * s.w * 0.012;
      ctx.beginPath(); ctx.moveTo(s.w / 2 - w0, y0); ctx.lineTo(s.w / 2 + w0, y0); ctx.lineTo(s.w / 2 + w0 * 1.1, y1); ctx.lineTo(s.w / 2 - w0 * 1.1, y1); ctx.fill();
    }
    // bokeh street lights
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const R0 = Math.min(s.w, s.h);
    for (let i = 0; i < 16; i++) {
      const span = s.w * 1.3;
      const x = ((((rnd(i) * span - mt * s.w * (0.02 + rnd(i + 1) * 0.05)) % span) + span) % span) - s.w * 0.15;
      const y = rnd(i + 2) * s.h * 0.85, r = R0 * (0.025 + rnd(i + 3) * 0.06);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const c = BOKEH[i % BOKEH.length];
      g.addColorStop(0, rgba(c, 0.32)); g.addColorStop(0.75, rgba(c, 0.22)); g.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.restore();
    lightLeak(ctx, s, ['#ff3d6e', '#ff9a3c', '#3d7bff'], 0.45);
    // rain on the glass
    ctx.strokeStyle = 'rgba(190,210,255,0.16)'; ctx.lineWidth = Math.max(1, s.h * 0.0012); ctx.beginPath();
    for (let i = 0; i < 80; i++) {
      const x = (rnd(i) * s.w + mt * s.w * 0.03) % s.w;
      const y = ((rnd(i + 9) * s.h * 1.1 + mt * s.h * (0.5 + rnd(i) * 0.5)) % (s.h * 1.1)) - s.h * 0.05;
      const l = s.h * (0.02 + rnd(i + 4) * 0.03);
      ctx.moveTo(x, y); ctx.lineTo(x - l * 0.22, y + l);
    }
    ctx.stroke();
    ctx.restore();
    // smoked glass
    const grow = life(s, 1.8, 1.2);
    plate(ctx, P.x + (P.w * (1 - grow)) / 2, P.y, P.w * grow, P.h, { tint: 'rgba(6,7,18,0.66)', blur: s.h * 0.018, r: P.size * 0.35, edge: 'rgba(255,170,90,0.4)', alpha: a });
    drawReferenceLead(ctx, s, '#ffffff');
    const r = verse(ctx, s, P, font, '#FFFFFF');
    drawReference(ctx, s, s.w / 2, r.bottom + P.size * 1.0, 'center', refSize(P), '#ffb347', { font: `600 ${refSize(P)}px ${MONO}`, tracking: 0.14 });
    drawCopyright(ctx, s, s.w / 2, s.h - m * 0.45, 'center', 'rgba(255,255,255,0.45)');
  },
};

// ── 12 · Grip Tape ───────────────────────────────────────────────────────────

const gripTape: ScriptureLayout = {
  id: 'ug-grip-tape', name: 'Grip Tape', family: FAM, background: 'opaque', director: TRAV, animated: true,
  blurb: 'Skate-park concrete in late sun with a checker stripe; the verse rides in on a grip-taped skateboard deck and rolls away after.',
  draw(ctx, s) {
    const a = decoAlpha(s), mt = motionT(s), cls = aspectClass(s.w, s.h), m = safe(s);
    const font: Font = sz => `800 ${sz}px ${GROTESK}`;
    const P = panel(ctx, s, font, { yC: 0.52, inset: isVert(cls) ? 0.1 : 0.115, padTop: 1.05, padBottom: 1.85, lh: 1.24, frac: isVert(cls) ? 0.92 : 0.8 });
    ctx.save(); ctx.globalAlpha = a;
    ctx.drawImage(tex('ug-concrete-skate', s.w, s.h, (c, w, h) => paintConcrete(c, w, h, '#8d877d', 17, { joints: true })), 0, 0, s.w, s.h);
    lightLeak(ctx, s, ['#ffb347', '#ff6f59', '#ffd23f'], 0.38);
    // a wheel scuff being laid down, slowly
    const cyc = (mt * 0.06) % 1;
    const sx = s.w * (0.15 + rnd(Math.floor(mt * 0.06)) * 0.7), sy = s.h * (isVert(cls) ? 0.85 : 0.8);
    ctx.save(); ctx.strokeStyle = `rgba(14,12,12,${0.22 * (1 - Math.max(0, cyc - 0.7) / 0.3)})`; ctx.lineWidth = Math.max(2, s.h * 0.006); ctx.lineCap = 'round';
    const len = s.w * 0.4; ctx.setLineDash([len * Math.min(1, cyc * 1.6), len * 2]);
    ctx.beginPath(); ctx.moveTo(sx - s.w * 0.15, sy); ctx.quadraticCurveTo(sx, sy - s.h * 0.08, sx + s.w * 0.15, sy + s.h * 0.01); ctx.stroke(); ctx.restore();
    // checker stripes
    const q = isVert(cls) ? s.w * 0.045 : s.h * 0.034;
    const off = (mt * q * 0.6) % (q * 2);
    const checker = (y: number) => {
      ctx.fillStyle = '#141414'; ctx.fillRect(0, y, s.w, q * 2);
      ctx.fillStyle = '#f2efe6';
      for (let row = 0; row < 2; row++) for (let x = -q * 2 + off + (row ? q : 0); x < s.w; x += q * 2) ctx.fillRect(x, y + row * q, q, q);
    };
    const bandY = m * 0.5;
    checker(bandY);
    if (isVert(cls) || cls === 'classic') checker(s.h - m * 0.5 - q * 2);
    if (isWide(cls)) {
      // painted coping stripes on the sides
      ctx.fillStyle = 'rgba(255,210,63,0.85)'; ctx.fillRect(m * 0.6, bandY + q * 3, q * 0.8, s.h - bandY - q * 3 - m * 0.6); ctx.fillRect(s.w - m * 0.6 - q * 0.8, bandY + q * 3, q * 0.8, s.h - bandY - q * 3 - m * 0.6);
    }
    ctx.restore();

    // the deck rolls in from the left, rolls out to the right
    const rollIn = 1 - easeOut(clamp01(s.enterP * 2.6)), rollOut = easeInOut(clamp01(s.exitP * 1.3));
    const rx = -rollIn * (s.w * 0.5 + P.w) + rollOut * (s.w * 0.5 + P.w);
    const bob = (rollIn + rollOut) > 0 ? Math.sin(mt * 18) * P.size * 0.04 * (rollIn + rollOut) : 0;
    const rad = Math.min(P.h / 2, P.w * 0.15);
    ctx.save(); ctx.globalAlpha = a; ctx.translate(rx, bob);
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); rr(ctx, P.x + P.size * 0.15, P.y + P.size * 0.3, P.w, P.h, rad); ctx.fill();
    // wood edge, then grip
    ctx.fillStyle = '#c98a4b'; ctx.beginPath(); rr(ctx, P.x - P.size * 0.08, P.y - P.size * 0.08, P.w + P.size * 0.16, P.h + P.size * 0.16, rad + P.size * 0.08); ctx.fill();
    ctx.fillStyle = '#18181b'; ctx.beginPath(); rr(ctx, P.x, P.y, P.w, P.h, rad); ctx.fill();
    const gt = tile('ug-grip', 96, 96, c => { const R = seeded(5); for (let i = 0; i < 700; i++) { c.fillStyle = `rgba(255,255,255,${0.05 + R() * 0.12})`; c.fillRect(R() * 96, R() * 96, 1, 1); } });
    const gp = ctx.createPattern(gt, 'repeat');
    if (gp) { ctx.save(); ctx.beginPath(); rr(ctx, P.x, P.y, P.w, P.h, rad); ctx.clip(); ctx.fillStyle = gp; ctx.fillRect(P.x, P.y, P.w, P.h);
      // cut-line grip art near the tails
      ctx.strokeStyle = '#c98a4b'; ctx.lineWidth = Math.max(1.5, P.size * 0.04);
      const gx = Math.max(P.x + rad * 0.55, P.ix - P.size * 0.3);
      ctx.beginPath(); ctx.moveTo(gx, P.y); ctx.lineTo(gx - P.size * 0.25, P.y + P.h); ctx.moveTo(s.w - gx, P.y); ctx.lineTo(s.w - gx + P.size * 0.25, P.y + P.h); ctx.stroke();
      ctx.restore(); }
    // truck bolts
    const b = Math.min(P.size * 0.3, P.h * 0.16), cy = P.y + P.h / 2;
    ctx.fillStyle = '#a9a9ad';
    for (const ex of [P.x + rad * 0.42, P.x + P.w - rad * 0.42]) for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.beginPath(); ctx.arc(ex + dx * b * 0.6, cy + dy * b, Math.max(2, P.size * 0.06), 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    drawReferenceLead(ctx, s, '#ffffff');
    ctx.save(); ctx.translate(rx, bob);
    const r = verse(ctx, s, P, font, '#FFFFFF');
    drawReference(ctx, s, s.w / 2, r.bottom + P.size * 1.0, 'center', refSize(P), '#ffd23f', { font: `800 ${refSize(P)}px ${GROTESK}`, tracking: 0.16 });
    ctx.restore();
    drawCopyright(ctx, s, s.w / 2, s.h - m * 0.3, 'center', 'rgba(20,20,20,0.6)');
  },
};

export const URBAN_GRUNGE_LAYOUTS: ScriptureLayout[] = [
  sprayWall, wheatPaste, xeroxZine, vhsRewind, risoMisprint, ductTape,
  chalkTalk, neonAlley, stickerBomb, stencilSpray, nightDrive, gripTape,
];
