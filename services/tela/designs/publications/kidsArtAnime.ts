// kidsArtAnime: the toolkit behind "Sakura and the Sky Whale" (story-anime).
//
// A Plajah-original anime / manga-inspired picture-book look built from vector parts:
// a draw context that places local unit geometry anywhere (scale, tilt, mirror), smooth
// Catmull-Rom curves, tapered "brush" strokes made from thin shapes, cel-shaded two-tone
// fills with a hard shadow shape and a highlight band, layered glossy eyes, flowing hair,
// soft pastel gradient skies, drifting petals, twinkle stars, speed lines and emotion marks.
import type { TelaVectorObject, TelaGradientPaint } from '../../../../types';
import { rect, ellipse, circle, text, mix, type ShapeOpts } from '../../templateKit';
import { rng } from '../../ornaments';
import { poly, multiPoly, halftone, lerp, type Pt } from './kidsArtA';
import type { FontKey } from '../../telaFonts';

export type O = TelaVectorObject;
export { rect, ellipse, circle, mix, halftone, lerp, multiPoly, poly, rng };
export type { Pt };

export const AP = {
  ink: '#2A1B4D', indigo: '#1E1B4B', night: '#12103A', night2: '#2B2670',
  sakura: '#FF8FB8', sakuraD: '#E2609A', sakuraL: '#FFD3E3', hot: '#FF3D81',
  sky: '#7FD8FF', skyL: '#CFF3FF', skyD: '#3FA9E6',
  lav: '#B9A6FF', lavL: '#E6DEFF', lavD: '#7F6BE0',
  peach: '#FFC58F', peachL: '#FFE3C6', gold: '#FFE14D',
  skin: '#FFE6D8', skinD: '#F4BFAE', white: '#FFFFFF', cream: '#FFF6EE', mint: '#A8F0D8',
};

// ── Gradients ────────────────────────────────────────────────────────────────
export const lin = (angle: number, ...cols: string[]): TelaGradientPaint => ({ kind: 'LINEAR', angle, stops: cols.map((c, i) => ({ offset: cols.length > 1 ? i / (cols.length - 1) : 0, color: c })) });
export const radial = (...cols: string[]): TelaGradientPaint => ({ kind: 'RADIAL', stops: cols.map((c, i) => ({ offset: cols.length > 1 ? i / (cols.length - 1) : 0, color: c })) });
export const glowPaint = (color: string, a = .9): TelaGradientPaint => ({ kind: 'RADIAL', stops: [{ offset: 0, color, opacity: a }, { offset: 1, color, opacity: 0 }] });
/** Full-page ground with a vertical gradient (first object on every page). */
export const sky = (W: number, H: number, ...cols: string[]): O => rect(0, 0, W, H, cols[0], { gradient: lin(90, ...cols), label: 'Page ground', role: 'GROUND' });
export const glow = (cx: number, cy: number, r: number, color: string, a = .9, o: ShapeOpts = {}): O => circle(cx, cy, r, color, { ...o, gradient: glowPaint(color, a), label: o.label || 'Soft glow' });

// ── Curves ───────────────────────────────────────────────────────────────────
/** Catmull-Rom through control points (closed loop or open run). */
export function smooth(c: Pt[], closed = true, seg = 7): Pt[] {
  const n = c.length; const out: Pt[] = [];
  const at = (i: number): Pt => closed ? c[(i + n) % n] : c[Math.max(0, Math.min(n - 1, i))];
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    for (let k = 0; k < seg; k++) {
      const t = k / seg, t2 = t * t, t3 = t2 * t;
      out.push([.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3), .5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]);
    }
  }
  if (!closed) out.push(c[n - 1]);
  return out;
}
/** A tapered brush stroke along a centreline: width = lerp(w0,w1) + bulge*sin(pi t). */
export function taperPts(center: Pt[], w0: number, w1: number, bulge = 0): Pt[] {
  const n = center.length; const L: Pt[] = [], R: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = center[Math.max(0, i - 1)], b = center[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    const t = n > 1 ? i / (n - 1) : 0; const w = Math.max(0, lerp(w0, w1, t) + bulge * Math.sin(Math.PI * t)) / 2;
    L.push([center[i][0] - dy * w, center[i][1] + dx * w]); R.push([center[i][0] + dy * w, center[i][1] - dx * w]);
  }
  return [...L, ...R.reverse()];
}
export function ringPts(cx: number, cy: number, r: number, n = 24, ry = r, rot = 0): Pt[] {
  const c = Math.cos(rot), s = Math.sin(rot);
  return Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2; const x = r * Math.cos(a), y = ry * Math.sin(a); return [cx + x * c - y * s, cy + x * s + y * c] as Pt; });
}
export const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n = 12, ry = r): Pt[] => Array.from({ length: n + 1 }, (_, i) => { const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180; return [cx + r * Math.cos(a), cy + ry * Math.sin(a)] as Pt; });
/** Sutherland-Hodgman clip of a polygon against a CONVEX polygon (clockwise or not). */
export function clipConvex(subject: Pt[], clip: Pt[]): Pt[] {
  let area = 0; for (let i = 0; i < clip.length; i++) { const a = clip[i], b = clip[(i + 1) % clip.length]; area += a[0] * b[1] - b[0] * a[1]; }
  const sgn = area >= 0 ? 1 : -1; let out = subject;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i], b = clip[(i + 1) % clip.length]; const inside = (p: Pt) => sgn * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) >= 0;
    const inter = (p: Pt, q: Pt): Pt => { const x1 = p[0], y1 = p[1], x2 = q[0], y2 = q[1], x3 = a[0], y3 = a[1], x4 = b[0], y4 = b[1]; const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4) || 1e-9; const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d; return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)]; };
    const inp = out; out = [];
    for (let j = 0; j < inp.length; j++) { const p = inp[j], q = inp[(j + 1) % inp.length]; const pi = inside(p), qi = inside(q); if (pi) { out.push(p); if (!qi) out.push(inter(p, q)); } else if (qi) out.push(inter(p, q)); }
  }
  return out;
}

// ── Draw context: local unit geometry -> page, with scale / tilt / mirror ───
export interface Tf { cx: number; cy: number; s: number; rot?: number; flip?: boolean }
type DOpts = ShapeOpts & { open?: boolean; ow?: number; ink?: string };
export function drawer(tf: Tf, out: O[]) {
  const a = (tf.rot || 0) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), fl = tf.flip ? -1 : 1, s = tf.s;
  const P = (p: Pt): Pt => { const x = p[0] * fl * s, y = p[1] * s; return [tf.cx + x * ca - y * sa, tf.cy + x * sa + y * ca]; };
  const sw = (u: number) => Math.max(1.3, u * s);
  const conv = (o: DOpts): ShapeOpts & { open?: boolean } => { const { ow, ink, ...rest } = o; return ow ? { ...rest, stroke: ink || AP.ink, strokeWidth: sw(ow) } : rest; };
  const api = {
    P, sw,
    poly(pts: Pt[], fill: string, o: DOpts = {}) { out.push(poly(pts.map(P), fill, conv(o))); },
    ell(cx: number, cy: number, rx: number, ry: number, fill: string, o: DOpts & { rot?: number } = {}) { const c = P([cx, cy]); const { rot, ...rest } = o; out.push(ellipse(c[0] - rx * s, c[1] - ry * s, 2 * rx * s, 2 * ry * s, fill, { ...conv(rest), rotation: (tf.rot || 0) + fl * (rot || 0) })); },
    circ(cx: number, cy: number, r: number, fill: string, o: DOpts = {}) { api.ell(cx, cy, r, r, fill, o); },
    taper(center: Pt[], w0: number, w1: number, bulge: number, fill: string, o: DOpts = {}) { api.poly(taperPts(center, w0, w1, bulge), fill, o); },
    /** Many tapered strokes in ONE draw (all the same fill). */
    tapers(list: Array<{ c: Pt[]; w0: number; w1: number; b?: number }>, fill: string, o: DOpts = {}) { out.push(multiPoly(list.map(t => taperPts(t.c, t.w0, t.w1, t.b || 0).map(P)), fill, conv(o))); },
    out,
  };
  return api;
}

// ── Typography (measured advances in em) ─────────────────────────────────────
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!?\'-:;';
export type AFont = 'mochiy' | 'zen';
const RAW: Record<AFont, string> = {
  mochiy: '0.87,0.83,0.89,0.8,0.84,0.84,0.92,0.87,0.29,0.73,0.85,0.83,0.98,0.91,0.92,0.82,0.91,0.87,0.79,0.88,0.83,0.89,0.98,0.94,0.93,0.86,0.73,0.67,0.66,0.66,0.69,0.56,0.62,0.66,0.26,0.58,0.63,0.46,0.92,0.68,0.69,0.7,0.7,0.5,0.66,0.59,0.69,0.71,0.91,0.76,0.73,0.71,0.76,0.67,0.73,0.76,0.75,0.77,0.71,0.75,0.75,0.77,0.23,0.29,0.27,0.38,0.92,0.33,0.47,0.29,0.29',
  zen: '0.66,0.64,0.67,0.67,0.59,0.57,0.67,0.69,0.26,0.53,0.61,0.57,0.77,0.7,0.73,0.63,0.73,0.64,0.62,0.59,0.66,0.63,0.83,0.63,0.63,0.57,0.53,0.57,0.49,0.57,0.52,0.37,0.55,0.53,0.26,0.26,0.51,0.23,0.79,0.53,0.54,0.57,0.57,0.38,0.46,0.38,0.52,0.5,0.69,0.54,0.5,0.43,0.5,0.41,0.45,0.48,0.49,0.47,0.5,0.42,0.51,0.48,0.28,0.26,0.3,0.29,0.5,0.24,0.48,0.26,0.28',
};
const TABLE: Record<AFont, Record<string, number>> = { mochiy: {}, zen: {} };
(Object.keys(RAW) as AFont[]).forEach(k => { const v = RAW[k].split(',').map(Number); Array.from(CHARS).forEach((c, i) => { TABLE[k][c] = v[i] ?? .6; }); });
const FK: Record<AFont, FontKey> = { mochiy: 'mochiyPop', zen: 'zenMaru' };
export const adv = (f: AFont, ch: string) => TABLE[f][ch] ?? .62;
export const tw = (f: AFont, s: string, size: number) => Array.from(s).reduce((a, c) => a + adv(f, c), 0) * size;
export const maxW = (f: AFont, lines: string[], size: number) => Math.max(...lines.map(l => tw(f, l, size)));
export const fit = (f: AFont, s: string, w: number, max: number) => Math.min(max, Math.floor(w / (tw(f, s, 1) || 1)));

/** Body copy: Zen Maru Gothic, pre-broken lines. */
export function body(x: number, y: number, w: number, lines: string[], size: number, color: string, o: { align?: 'left' | 'center' | 'right'; lh?: number; weight?: number; rotation?: number; label?: string; stroke?: string; sw?: number; font?: AFont } = {}): O {
  const lh = o.lh ?? 1.5; const f = o.font || 'zen';
  return text(x, y, w, lines.join('\n'), { size, font: FK[f], weight: o.weight ?? 700, color, align: o.align || 'left', leading: lh, wrap: false, h: Math.ceil(lines.length * size * lh), rotation: o.rotation, stroke: o.stroke, strokeWidth: o.sw, label: o.label || 'Story text', role: 'BODY' });
}
export const bodyH = (lines: string[], size: number, lh = 1.5) => Math.ceil(lines.length * size * lh);

/** Display lettering: dark outer outline + white inner outline + coloured face + offset shadow, letter by letter. */
export function title(cx: number, y: number, str: string, size: number, o: { colors: string[]; outer?: string; inner?: string; shadow?: string; bounce?: number; rot?: number; seed?: number; ow?: number; label?: string; track?: number } = { colors: [AP.sakura] }): O[] {
  const r = rng(o.seed ?? 3); const f: AFont = 'mochiy'; const track = o.track ?? 0; const ow = o.ow ?? Math.max(8, size * .13);
  const total = Array.from(str).reduce((a, c) => a + adv(f, c) * size + track, 0) - track; let px = cx - total / 2; let ci = 0;
  const L0: O[] = [], L1: O[] = [], L2: O[] = [], L3: O[] = [];
  for (const ch of Array.from(str)) {
    const w = adv(f, ch) * size;
    if (ch !== ' ') {
      const dy = (ci % 2 ? 1 : -1) * (.3 + r() * .7) * (o.bounce ?? 0), rot = (r() - .5) * 2 * (o.rot ?? 0);
      const base = { size, font: FK[f], weight: 400, align: 'center' as const, wrap: false, h: size * 1.3, rotation: rot, label: o.label || 'Title', role: 'HEADLINE' as const };
      if (o.shadow) L0.push(text(px + size * .05, y + dy + size * .08, w, ch, { ...base, color: o.shadow, stroke: o.shadow, strokeWidth: ow * 2.1 }));
      L1.push(text(px, y + dy, w, ch, { ...base, color: o.outer || AP.indigo, stroke: o.outer || AP.indigo, strokeWidth: ow * 2 }));
      L2.push(text(px, y + dy, w, ch, { ...base, color: o.inner || AP.white, stroke: o.inner || AP.white, strokeWidth: ow }));
      L3.push(text(px, y + dy, w, ch, { ...base, color: o.colors[ci % o.colors.length] }));
      ci++;
    }
    px += w + track;
  }
  return [...L0, ...L1, ...L2, ...L3];
}
/** Whole-line display text (3 layers: outer, inner, face). */
export function titleLine(cx: number, y: number, str: string, size: number, color: string, o: { outer?: string; inner?: string; ow?: number; label?: string; rotation?: number } = {}): O[] {
  const w = tw('mochiy', str, size) + 12, ow = o.ow ?? Math.max(6, size * .13);
  const base = { size, font: FK.mochiy, weight: 400, align: 'center' as const, wrap: false, h: size * 1.3, rotation: o.rotation, label: o.label || 'Subtitle', role: 'HEADLINE' as const };
  return [
    text(cx - w / 2, y, w, str, { ...base, color: o.outer || AP.indigo, stroke: o.outer || AP.indigo, strokeWidth: ow * 2 }),
    text(cx - w / 2, y, w, str, { ...base, color: o.inner || AP.white, stroke: o.inner || AP.white, strokeWidth: ow }),
    text(cx - w / 2, y, w, str, { ...base, color }),
  ];
}
/** Caption box: white rounded plate, ink line, a petal tab, text inside. */
export function caption(x: number, y: number, lines: string[], size: number, o: { w?: number; fill?: string; ink?: string; textColor?: string; rotation?: number; pad?: number; tab?: string; shadow?: boolean } = {}): O[] {
  const pad = o.pad ?? 18; const w = o.w ?? Math.ceil(maxW('zen', lines, size)) + pad * 2 + 6; const h = bodyH(lines, size, 1.42) + pad * 1.7;
  const out: O[] = [rect(x, y, w, h, o.fill || AP.white, { rx: 18, stroke: o.ink || AP.indigo, strokeWidth: 3.5, rotation: o.rotation, shadow: o.shadow === false ? undefined : { x: 3, y: 5, blur: 4, color: 'rgba(30,20,80,.28)' }, label: 'Caption plate' })];
  out.push(rect(x + 7, y + 7, w - 14, h - 14, 'none', { rx: 12, stroke: o.tab || AP.sakura, strokeWidth: 2, rotation: o.rotation, dash: [2, 6], label: 'Caption inner line' }));
  out.push(body(x + pad + 3, y + pad * .82, w - pad * 2, lines, size, o.textColor || AP.indigo, { lh: 1.42, rotation: o.rotation, label: 'Story text' }));
  return out;
}
/** Round speech / thought bubble with a tail pointing at (tx,ty). */
export function bubble(cx: number, cy: number, w: number, h: number, tx: number, ty: number, o: { fill?: string; ink?: string; thought?: boolean } = {}): O[] {
  const out: O[] = []; const ink = o.ink || AP.indigo;
  const ptsB = ringPts(cx, cy, w / 2, 40, h / 2);
  if (o.thought) {
    const n = 3; for (let i = 0; i < n; i++) { const t = (i + 1) / (n + 1); const x = lerp(cx + (tx - cx) * .55, tx, t), y = lerp(cy + (ty - cy) * .55, ty, t); out.push(circle(x, y, 16 - i * 4.5, o.fill || AP.white, { stroke: ink, strokeWidth: 3, label: 'Thought dot' })); }
    out.push(poly(ptsB, o.fill || AP.white, { stroke: ink, strokeWidth: 3.5, shadow: { x: 2, y: 4, blur: 4, color: 'rgba(30,20,80,.25)' }, label: 'Thought bubble' }));
  } else {
    const a = Math.atan2(ty - cy, tx - cx); const bx = cx + Math.cos(a) * w * .36, by = cy + Math.sin(a) * h * .4; const nx = -Math.sin(a), ny = Math.cos(a);
    out.push(poly([[bx + nx * 22, by + ny * 22], [tx, ty], [bx - nx * 22, by - ny * 22]], o.fill || AP.white, { stroke: ink, strokeWidth: 3.5, label: 'Bubble tail' }));
    out.push(poly(ptsB, o.fill || AP.white, { stroke: ink, strokeWidth: 3.5, shadow: { x: 2, y: 4, blur: 4, color: 'rgba(30,20,80,.25)' }, label: 'Speech bubble' }));
    out.push(poly([[bx + nx * 18, by + ny * 18], [lerp(bx, tx, .55), lerp(by, ty, .55)], [bx - nx * 18, by - ny * 18]], o.fill || AP.white, { label: 'Bubble tail cover' }));
  }
  return out;
}

// ── Sky, cloud, star, petal, bokeh, lines ───────────────────────────────────
export function cloudShape(cx: number, cy: number, w: number, h: number, seed: number): Pt[] {
  const r = rng(seed); const cs: Array<[number, number, number]> = []; const n = Math.max(4, Math.round(w / (h * .7)));
  for (let i = 0; i < n; i++) { const t = n === 1 ? .5 : i / (n - 1); const rr = h * (.42 + r() * .26) * (1 - Math.abs(t - .5) * .55); cs.push([cx - w / 2 + rr + (w - rr * 2) * t, cy + h * .22 - rr * (.45 + r() * .55), rr]); }
  cs.push([cx, cy - h * .08, h * .62]);
  const base = cy + h * .34; const inside = (x: number, y: number) => y <= base && cs.some(c => Math.hypot(x - c[0], y - c[1]) <= c[2]);
  const pts: Pt[] = []; const R = w / 2 + h;
  for (let k = 0; k < 90; k++) {
    const a = k / 90 * Math.PI * 2; const dx = Math.cos(a), dy = Math.sin(a); let found = 0;
    for (let t = R; t > 0; t -= 2.5) if (inside(cx + dx * t, cy + dy * t)) { found = t; break; }
    pts.push([cx + dx * found, cy + dy * found]);
  }
  return pts;
}
/** Fluffy pastel cloud: gradient body plus a hard lavender underside. */
export function cloud(cx: number, cy: number, w: number, h: number, seed: number, o: { top?: string; bottom?: string; shade?: string; opacity?: number } = {}): O[] {
  const pts = cloudShape(cx, cy, w, h, seed);
  const under = pts.filter(p => p[1] > cy + h * .05);
  const out: O[] = [poly(pts, o.top || AP.white, { gradient: lin(90, o.top || AP.white, o.bottom || AP.lavL), opacity: o.opacity, label: 'Cloud' })];
  if (under.length > 4) out.push(poly(under, o.shade || mix(o.bottom || AP.lavL, -.12), { opacity: (o.opacity ?? 1) * .55, label: 'Cloud shade' }));
  return out;
}
export function star4(cx: number, cy: number, r: number, inner = .26, stretch = 1, rot = 0): Pt[] {
  const pts: Pt[] = []; const c = Math.cos(rot), s = Math.sin(rot);
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 - Math.PI / 2; const rad = i % 2 ? r * inner : r; const x = rad * Math.cos(a), y = rad * Math.sin(a) * stretch; pts.push([cx + x * c - y * s, cy + x * s + y * c]); }
  return pts;
}
/** Twinkle stars scattered over a box: one batched path per colour, plus a few round glints. */
export function sparkles(x: number, y: number, w: number, h: number, n: number, seed: number, cols: string[] = [AP.white, AP.gold], rMin = 5, rMax = 14, avoid: Array<[number, number, number, number]> = []): O[] {
  const r = rng(seed); const by: Pt[][][] = cols.map(() => []); const dotsL: Pt[][] = [];
  for (let i = 0; i < n; i++) {
    let px = x + r() * w, py = y + r() * h; if (avoid.some(a => px > a[0] && px < a[0] + a[2] && py > a[1] && py < a[1] + a[3])) continue;
    const rr = rMin + r() * (rMax - rMin);
    by[i % cols.length].push(star4(px, py, rr, .24 + r() * .1, 1 + (r() > .7 ? .5 : 0), (r() - .5) * .3));
    if (i % 3 === 0) dotsL.push(ringPts(px + rr * 1.3, py - rr * .8, rr * .22, 8));
  }
  const o = by.map((l, i) => l.length ? multiPoly(l, cols[i], { label: 'Twinkle stars' }) : null).filter(Boolean) as O[];
  if (dotsL.length) o.push(multiPoly(dotsL, cols[0], { opacity: .85, label: 'Star dots' }));
  return o;
}
export function bokeh(x: number, y: number, w: number, h: number, n: number, seed: number, cols: string[], rMin = 14, rMax = 46, op = .45): O[] {
  const r = rng(seed); const out: O[] = [];
  for (let i = 0; i < n; i++) { const rr = rMin + r() * (rMax - rMin); const px = x + r() * w, py = y + r() * h; const c = cols[i % cols.length]; out.push(circle(px, py, rr, c, { opacity: op * (.6 + r() * .6), blur: 2 + r() * 3, gradient: i % 2 ? undefined : glowPaint(c, 1), label: 'Bokeh' })); }
  return out;
}
const PETAL: Pt[] = smooth([[0, -.78], [-.4, -1], [-.82, -.5], [-.6, .42], [0, 1], [.6, .42], [.82, -.5], [.4, -1]], true, 4);
export function petalPts(cx: number, cy: number, r: number, rot: number, squash = .78): Pt[] {
  const c = Math.cos(rot), s = Math.sin(rot); return PETAL.map(([x, y]) => { const px = x * r * squash, py = y * r; return [cx + px * c - py * s, cy + px * s + py * c] as Pt; });
}
/** Drifting cherry petals (two tones, batched). */
export function petals(x: number, y: number, w: number, h: number, n: number, seed: number, cols: string[] = [AP.sakura, AP.sakuraL], rMin = 7, rMax = 18, avoid: Array<[number, number, number, number]> = []): O[] {
  const r = rng(seed); const by: Pt[][][] = cols.map(() => []);
  for (let i = 0; i < n; i++) { const px = x + r() * w, py = y + r() * h; if (avoid.some(a => px > a[0] && px < a[0] + a[2] && py > a[1] && py < a[1] + a[3])) continue; by[i % cols.length].push(petalPts(px, py, rMin + r() * (rMax - rMin), r() * 6.28, .55 + r() * .4)); }
  return by.map((l, i) => l.length ? multiPoly(l, cols[i], { label: 'Cherry petals' }) : null).filter(Boolean) as O[];
}
/** A 5-petal blossom (flat, cel-shaded): one object per ring. */
export function blossom(cx: number, cy: number, r: number, col = AP.sakura, hi = AP.sakuraL, rot = 0): O[] {
  const ps: Pt[][] = [], hs: Pt[][] = [];
  for (let i = 0; i < 5; i++) { const a = rot + i * Math.PI * 2 / 5; ps.push(petalPts(cx + Math.cos(a - Math.PI / 2) * r * .55, cy + Math.sin(a - Math.PI / 2) * r * .55, r * .62, a)); hs.push(petalPts(cx + Math.cos(a - Math.PI / 2) * r * .62, cy + Math.sin(a - Math.PI / 2) * r * .62, r * .3, a)); }
  return [multiPoly(ps, col, { stroke: AP.ink, strokeWidth: Math.max(1.5, r * .07), label: 'Blossom' }), multiPoly(hs, hi, { opacity: .85, label: 'Blossom light' }), circle(cx, cy, r * .16, AP.gold, { stroke: AP.ink, strokeWidth: Math.max(1.2, r * .05), label: 'Blossom centre' })];
}
/** Radial speed lines: thin tapered wedges between r0 and r1. */
export function speedLines(cx: number, cy: number, r0: number, r1: number, n: number, seed: number, color: string, wMax = 10, op = 1): O {
  const r = rng(seed); const list: Pt[][] = [];
  for (let i = 0; i < n; i++) { const a = (i + r() * .8) / n * Math.PI * 2; const ra = r0 + r() * (r1 - r0) * .35, rb = r1 * (.7 + r() * .3); const w = (2 + r() * wMax) / 2 / Math.max(1, ra) * 1; const da = Math.max(.003, w * .6 / Math.max(1, rb) * 4); list.push([[cx + Math.cos(a) * ra, cy + Math.sin(a) * ra], [cx + Math.cos(a - da) * rb, cy + Math.sin(a - da) * rb], [cx + Math.cos(a + da) * rb, cy + Math.sin(a + da) * rb]]); }
  return multiPoly(list, color, { opacity: op, label: 'Speed lines' });
}
/** Parallel horizontal speed lines (tapered to the right). */
export function streaks(x: number, y: number, w: number, h: number, n: number, seed: number, color: string, op = .8, lenMin = .25, lenMax = .9, thick = 5): O {
  const r = rng(seed); const list: Pt[][] = [];
  for (let i = 0; i < n; i++) { const yy = y + r() * h, xx = x + r() * w * .5, len = w * (lenMin + r() * (lenMax - lenMin)), t = 1.5 + r() * thick; list.push([[xx, yy], [xx + len, yy - t / 2], [xx + len, yy + t / 2]]); }
  return multiPoly(list, color, { opacity: op, label: 'Streak lines' });
}
/** Jagged impact burst. */
export function burst(cx: number, cy: number, r: number, spikes: number, seed: number, fill: string, o: { stroke?: string; sw?: number; inner?: number; rot?: number } = {}): O {
  const rr = rng(seed); const pts: Pt[] = [];
  for (let i = 0; i < spikes * 2; i++) { const rad = i % 2 ? r * (o.inner ?? .62) * (.85 + rr() * .25) : r * (.88 + rr() * .24); const a = (i * Math.PI / spikes) + (o.rot ?? 0); pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]); }
  return poly(pts, fill, { stroke: o.stroke ?? AP.indigo, strokeWidth: o.sw ?? 5, label: 'Impact burst' });
}

// ── Emotion marks ───────────────────────────────────────────────────────────
export function sweatDrop(x: number, y: number, s: number): O[] {
  const pts = smooth([[0, -1.2], [.55, .0], [.5, .55], [0, .9], [-.5, .55], [-.55, .0]], true, 6);
  const P = (p: Pt): Pt => [x + p[0] * s, y + p[1] * s];
  return [poly(pts.map(P), AP.skyL, { stroke: AP.skyD, strokeWidth: Math.max(2, s * .12), label: 'Sweat drop' }), ellipse(x - s * .32, y + s * .0, s * .2, s * .42, AP.white, { rotation: 12, opacity: .9, label: 'Drop shine' })];
}
export function heartPts(cx: number, cy: number, s: number, rot = 0): Pt[] {
  const c = Math.cos(rot), sn = Math.sin(rot);
  const base = smooth([[0, .95], [-.55, .4], [-1, -.1], [-.9, -.62], [-.42, -.82], [0, -.4], [.42, -.82], [.9, -.62], [1, -.1], [.55, .4]], true, 5);
  return base.map(([px, py]) => [cx + (px * c - py * sn) * s, cy + (px * sn + py * c) * s] as Pt);
}
export function hearts(list: Array<[number, number, number, number?]>, fill = AP.hot): O[] {
  const out: O[] = [multiPoly(list.map(([x, y, s, r]) => heartPts(x, y, s, r || 0)), fill, { stroke: AP.ink, strokeWidth: 2.4, label: 'Floating hearts' })];
  out.push(multiPoly(list.map(([x, y, s]) => ringPts(x - s * .4, y - s * .35, s * .16, 8, s * .1)), AP.white, { opacity: .85, label: 'Heart shine' }));
  return out;
}
export function veinMark(x: number, y: number, s: number): O {
  const arm = (a: number): Pt[] => { const c = Math.cos(a), sn = Math.sin(a); return [[x + c * s * .2, y + sn * s * .2], [x + c * s * 1, y + sn * s * .5], [x + c * s * .6, y + sn * s * 1], [x + c * s * .15, y + sn * s * .22]]; };
  return multiPoly([arm(.4), arm(2.6), arm(-2.7), arm(-.5)], AP.hot, { stroke: AP.ink, strokeWidth: 2, label: 'Anger vein' });
}
export function blushHatch(cx: number, cy: number, w: number, col = AP.sakuraD): O {
  const list: Pt[][] = [];
  for (let i = 0; i < 3; i++) { const x = cx - w / 2 + i * w / 2.6; list.push(taperPts([[x, cy + w * .16], [x + w * .22, cy - w * .16]], w * .07, w * .03)); }
  return multiPoly(list, col, { opacity: .85, label: 'Blush hatch' });
}
export function exclaim(x: number, y: number, s: number, col = AP.hot): O[] {
  return [poly(taperPts([[x, y - s], [x, y + s * .35]], s * .55, s * .22), col, { stroke: AP.ink, strokeWidth: 2.5, label: 'Exclaim' }), circle(x, y + s * .85, s * .2, col, { stroke: AP.ink, strokeWidth: 2.5, label: 'Exclaim dot' })];
}

export { ringPts as ring };
