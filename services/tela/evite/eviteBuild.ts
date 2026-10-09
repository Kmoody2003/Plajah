// eviteBuild — the toolkit every evite template is written with.
//
// A template is a Tela vector document (services/tela/templateKit objects) on a 600x900 artboard. This file gives
// motif authors a `Kit` with deterministic ids, seeded randomness, and motion tags, and gives the collection one
// shared layout + text system, so 144 designs stay consistent about hierarchy and readability.
//
// MOTION TAGS: an object id looks like `fx-float:12` (effect : sequence). The player (components/evite/EviteArtwork)
// and `motionTracks()` below both read the tag, so a design animates in the app, on a guest's phone, and when it is
// opened as a plain Tela document. Untagged objects stay still.
import type { TelaVectorObject, TelaGradientPaint } from '../../../types';
import { rect as kRect, ellipse as kEllipse, circle as kCircle, line as kLine, path as kPath, text as kText, type ShapeOpts, type TextOpts } from '../templateKit';
import type { EvitePalette, EviteLayout, EviteCategory } from '../../evite/eviteTypes';

export const W = 600, H = 900;
export type Fx = 'float' | 'sway' | 'twinkle' | 'spin' | 'pulse' | 'drift' | 'shimmer' | 'bob' | 'rise' | 'wave' | 'flicker';
export interface Box { x: number; y: number; w: number; h: number; cx: number; cy: number }
export const box = (x: number, y: number, w: number, h: number): Box => ({ x, y, w, h, cx: x + w / 2, cy: y + h / 2 });

/** Small deterministic generator so a design renders identically every time. */
export function seeded(seed: number) {
  let s = (Math.floor(seed) * 2654435761) >>> 0 || 1;
  const next = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  return { next, range: (a: number, b: number) => a + (b - a) * next(), int: (a: number, b: number) => Math.floor(a + (b - a + 1) * next()), pick: <T,>(arr: T[]) => arr[Math.floor(next() * arr.length)] };
}
export const hashStr = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

export const alphaHex = (hex: string, a: number) => { const m = hex.replace('#', ''); if (m.length !== 6) return hex; const [r, g, b] = [0, 2, 4].map(i => parseInt(m.slice(i, i + 2), 16)); return `rgba(${r},${g},${b},${a})`; };
export const lum = (hex: string) => { const m = hex.replace('#', ''); if (m.length !== 6) return .5; const [r, g, b] = [0, 2, 4].map(i => parseInt(m.slice(i, i + 2), 16) / 255).map(v => v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4)); return .2126 * r + .7152 * g + .0722 * b; };
export const mixHex = (hex: string, amount: number) => { const m = hex.replace('#', ''); if (m.length !== 6) return hex; const c = [0, 2, 4].map(i => parseInt(m.slice(i, i + 2), 16)); const t = amount > 0 ? 255 : 0, k = Math.abs(amount); return '#' + c.map(v => Math.round(v + (t - v) * k).toString(16).padStart(2, '0')).join(''); };
export const grad = (a: string, b: string, angle = 90): TelaGradientPaint => ({ kind: 'LINEAR', angle, stops: [{ offset: 0, color: a }, { offset: 1, color: b }] });
export const radial = (a: string, b: string, aOpacity = 1, bOpacity = 0): TelaGradientPaint => ({ kind: 'RADIAL', stops: [{ offset: 0, color: a, opacity: aOpacity }, { offset: 1, color: b, opacity: bOpacity }] });

/** Closed polygon through flat points. */
export function poly(points: number[], fill: string, o: ShapeOpts = {}): TelaVectorObject {
  const xs = points.filter((_, i) => !(i % 2)), ys = points.filter((_, i) => i % 2);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { id: 'poly', kind: 'PATH', x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y, points, pathClosed: true, fill, stroke: o.stroke || 'none', strokeWidth: o.strokeWidth || 0, rotation: o.rotation || 0, opacity: o.opacity ?? 1, gradient: o.gradient, shadow: o.shadow, blur: o.blur, strokeDash: o.dash, objectLabel: o.label || 'Shape', templateRole: o.role || 'ORNAMENT' } as TelaVectorObject;
}
/** Open polyline (stems, smiles, waves). */
export function stroke(points: number[], color: string, width: number, o: { opacity?: number; label?: string; dash?: number[] } = {}): TelaVectorObject {
  const xs = points.filter((_, i) => !(i % 2)), ys = points.filter((_, i) => i % 2);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { id: 'stroke', kind: 'PATH', x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y, points, pathClosed: false, fill: 'none', stroke: color, strokeWidth: width, rotation: 0, opacity: o.opacity ?? 1, strokeDash: o.dash, objectLabel: o.label || 'Line', templateRole: 'ORNAMENT' } as TelaVectorObject;
}
/** Smooth curve through points (Catmull-Rom -> polyline sample). Good for stems, waves, ribbons. */
export function curve(pts: number[], steps = 10): number[] {
  const out: number[] = [];
  const P = (i: number) => [pts[Math.max(0, Math.min(pts.length / 2 - 1, i)) * 2], pts[Math.max(0, Math.min(pts.length / 2 - 1, i)) * 2 + 1]];
  for (let i = 0; i < pts.length / 2 - 1; i++) {
    const [p0, p1, p2, p3] = [P(i - 1), P(i), P(i + 1), P(i + 2)];
    for (let t = 0; t < steps; t++) {
      const u = t / steps, u2 = u * u, u3 = u2 * u;
      out.push(.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * u + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * u2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * u3));
      out.push(.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * u + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3));
    }
  }
  out.push(pts[pts.length - 2], pts[pts.length - 1]);
  return out.map(n => Math.round(n * 10) / 10);
}
export const starPts = (cx: number, cy: number, r: number, n = 5, inner = .45, rot = -90) => { const o: number[] = []; for (let i = 0; i < n * 2; i++) { const rr = i % 2 ? r * inner : r; const a = (rot + i * 180 / n) * Math.PI / 180; o.push(cx + rr * Math.cos(a), cy + rr * Math.sin(a)); } return o; };
export const ngon = (cx: number, cy: number, r: number, n: number, rot = -90) => { const o: number[] = []; for (let i = 0; i < n; i++) { const a = (rot + i * 360 / n) * Math.PI / 180; o.push(cx + r * Math.cos(a), cy + r * Math.sin(a)); } return o; };
/** Petal/leaf as a closed shape from base to tip with a given bulge. */
export function leafPts(x0: number, y0: number, x1: number, y1: number, bulge: number): number[] {
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, nx = -dy / len * bulge, ny = dx / len * bulge;
  const a = curve([x0, y0, mx + nx, my + ny, x1, y1], 8), b = curve([x1, y1, mx - nx, my - ny, x0, y0], 8);
  return [...a, ...b.slice(2)];
}

/** What a motif draws with: palette, a seeded rng, and shape helpers that tag objects for motion. */
export class Kit {
  readonly objects: TelaVectorObject[] = [];
  private seq = 0;
  readonly rng: ReturnType<typeof seeded>;
  constructor(public readonly pal: EvitePalette, public readonly seed: number, private readonly prefix: string) { this.rng = seeded(seed); }
  private tag<T extends TelaVectorObject>(o: T, fx?: Fx, label?: string): T { o.id = `${fx ? 'fx-' + fx : this.prefix}:${this.seq++}`; if (label) o.objectLabel = label; return o; }
  push<T extends TelaVectorObject | TelaVectorObject[]>(o: T, fx?: Fx): T { for (const x of Array.isArray(o) ? o : [o]) this.objects.push(this.tag(x, fx)); return o; }
  rect(x: number, y: number, w: number, h: number, fill: string, o: ShapeOpts & { fx?: Fx } = {}) { return this.push(kRect(x, y, w, h, fill, o), o.fx); }
  ellipse(x: number, y: number, w: number, h: number, fill: string, o: ShapeOpts & { fx?: Fx } = {}) { return this.push(kEllipse(x, y, w, h, fill, o), o.fx); }
  circle(cx: number, cy: number, r: number, fill: string, o: ShapeOpts & { fx?: Fx } = {}) { return this.push(kCircle(cx, cy, r, fill, o), o.fx); }
  line(x1: number, y1: number, x2: number, y2: number, color: string, width = 1, o: { opacity?: number; fx?: Fx } = {}) { return this.push(kLine(x1, y1, x2, y2, color, width, o), o.fx); }
  poly(points: number[], fill: string, o: ShapeOpts & { fx?: Fx } = {}) { return this.push(poly(points, fill, o), o.fx); }
  stroke(points: number[], color: string, width: number, o: { opacity?: number; fx?: Fx; dash?: number[] } = {}) { return this.push(stroke(points, color, width, o), o.fx); }
  star(cx: number, cy: number, r: number, fill: string, o: ShapeOpts & { fx?: Fx; points?: number; inner?: number } = {}) { return this.poly(starPts(cx, cy, r, o.points || 4, o.inner ?? .4), fill, o); }
  path(x: number, y: number, w: number, h: number, d: string, fill: string, o: ShapeOpts & { fx?: Fx } = {}) { return this.push(kPath(x, y, w, h, d, fill, o), o.fx); }
  text(x: number, y: number, w: number, value: string, o: TextOpts & { fx?: Fx }) { return this.push(kText(x, y, w, value, o), o.fx); }
  /** Scatter small shapes inside a box (stars, sparkles, confetti). */
  scatter(b: Box, n: number, draw: (x: number, y: number, i: number) => void) { for (let i = 0; i < n; i++) draw(b.x + this.rng.next() * b.w, b.y + this.rng.next() * b.h, i); }
}

export type Motif = (k: Kit, art: Box, p: EvitePalette) => void;

// ── Layout + text ────────────────────────────────────────────────────────────

export interface CopyIn {
  eyebrow: string; headline: string; subline: string; dateLine: string; timeLine: string; venueLine: string; hostLine: string; footer: string; message?: string;
}
export interface TypeSet { display: string; body: string; script?: string; displayWeight?: number; displayItalic?: boolean; displayCaps?: boolean; tracking?: number }

export const EYEBROW: Record<EviteCategory, string> = { kids_boy: "YOU'RE INVITED", kids_girl: "YOU'RE INVITED", adult: 'YOU ARE INVITED', anniversary: 'CELEBRATE WITH US', general: "LET'S GET TOGETHER", wedding: 'TOGETHER WITH THEIR FAMILIES' };

/** Fit a headline to a width by reducing the size: ~0.5em average advance for display faces. */
export function fitSize(textValue: string, width: number, max: number, min: number, advance = .52): number {
  const longest = textValue.split(/\s+/).reduce((m, w) => Math.max(m, w.length), 0);
  const lines = Math.max(1, Math.ceil(textValue.length * max * advance / width));
  let size = max;
  while (size > min && (longest * size * advance > width || Math.ceil(textValue.length * size * advance / width) > 3)) size -= 2;
  void lines; return Math.max(min, size);
}

export interface Placed { art: Box; textTop: number; align: 'center' | 'left'; ink: string; muted: string; chromeObjects: TelaVectorObject[] }

/** Draw the page ground and frame for a layout and say where the art and text go. */
export function layoutGround(k: Kit, layout: EviteLayout, p: EvitePalette): Placed {
  const dark = lum(p.bg) < .3;
  const ink = p.ink, muted = alphaHex(p.ink, .68);
  const ground = kRect(0, 0, W, H, p.bg, { gradient: grad(p.bg, p.bg2, 100), label: 'Background', role: 'GROUND' });
  k.push(ground);
  switch (layout) {
    case 'hero-top': return { art: box(30, 50, 540, 470), textTop: 548, align: 'center', ink, muted, chromeObjects: [] };
    case 'hero-bottom': return { art: box(30, 410, 540, 450), textTop: 70, align: 'center', ink, muted, chromeObjects: [] };
    case 'framed': {
      k.push(kRect(26, 26, W - 52, H - 52, 'none', { stroke: p.accent, strokeWidth: 2.5, rx: 6, label: 'Frame' }));
      k.push(kRect(38, 38, W - 76, H - 76, 'none', { stroke: alphaHex(p.accent, .45), strokeWidth: 1, rx: 3, label: 'Inner frame' }));
      for (const [cx, cy] of [[38, 38], [W - 38, 38], [38, H - 38], [W - 38, H - 38]]) k.push(kCircle(cx, cy, 7, p.accent, { label: 'Corner' }));
      return { art: box(90, 100, 420, 380), textTop: 520, align: 'center', ink, muted, chromeObjects: [] };
    }
    case 'arch': {
      const d = 'M0 100 L0 50 A50 50 0 0 1 100 50 L100 100 Z';
      k.push(kPath(95, 70, 410, 450, d, dark ? alphaHex('#ffffff', .07) : alphaHex(p.accent2, .35), { stroke: p.accent, strokeWidth: 2, label: 'Arch window' }));
      return { art: box(110, 130, 380, 380), textTop: 560, align: 'center', ink, muted, chromeObjects: [] };
    }
    case 'poster': return { art: box(0, 0, W, 560), textTop: 560, align: 'left', ink, muted, chromeObjects: [] };
    case 'card': {
      k.rect(0, 0, W, H, p.accent, { label: 'Backdrop' });
      k.push(kRect(28, 44, W - 56, H - 88, p.bg, { gradient: grad(p.bg, p.bg2, 100), rx: 36, shadow: { x: 0, y: 18, blur: 40, color: 'rgba(0,0,0,.35)' }, label: 'Card' }));
      return { art: box(52, 70, W - 104, 400), textTop: 500, align: 'center', ink, muted, chromeObjects: [] };
    }
  }
}

/** The shared text system: eyebrow, headline, subline, divider, when, where, host, footer. */
export function layoutText(k: Kit, placed: Placed, copy: CopyIn, p: EvitePalette, t: TypeSet, layout: EviteLayout): void {
  const left = placed.align === 'left';
  const x = left ? 44 : 60, w = left ? W - 88 : W - 120, align = left ? 'left' as const : 'center' as const;
  const onPoster = layout === 'poster';
  let y = placed.textTop;
  const ink = placed.ink, muted = placed.muted;
  const shadow = onPoster ? { x: 0, y: 3, blur: 14, color: 'rgba(0,0,0,.45)' } : undefined;
  if (layout === 'hero-bottom') y = 70;
  const eyebrow = k.text(x, y, w, copy.eyebrow, { size: 12, font: t.body, weight: 800, color: p.accent, align, tracking: .32, transform: 'uppercase', wrap: false, label: 'Eyebrow', role: 'LABEL' });
  y += 26;
  const size = fitSize(copy.headline, w, onPoster ? 78 : 62, 30, t.displayCaps ? .62 : .5);
  const head = k.text(x, y, w, copy.headline, { size, font: t.display, weight: t.displayWeight ?? 800, italic: t.displayItalic, color: onPoster ? '#ffffff' : ink, align, leading: 1.02, tracking: t.tracking ?? (t.displayCaps ? .02 : -.01), transform: t.displayCaps ? 'uppercase' : 'none', label: 'Headline', role: 'HEADLINE', shadow });
  y += head.h + 10;
  if (copy.subline) { const s = k.text(x, y, w, copy.subline, { size: 17, font: t.script || t.body, weight: t.script ? 400 : 500, color: onPoster ? '#ffffff' : muted, align, leading: 1.3, label: 'Subline', role: 'DECK', shadow }); y += s.h + 14; }
  k.rect(left ? x : W / 2 - 28, y, 56, 3, p.accent, { rx: 1.5, label: 'Divider', role: 'RULE' }); y += 20;
  const row = (value: string, size2: number, weight: number, color: string, label: string) => { if (!value) return; const o = k.text(x, y, w, value, { size: size2, font: t.body, weight, color, align, leading: 1.25, label, role: 'BODY', shadow }); y += o.h + 4; };
  row(copy.dateLine, 21, 800, onPoster ? '#ffffff' : ink, 'Date');
  row(copy.timeLine, 16, 600, onPoster ? '#ffffff' : muted, 'Time');
  row(copy.venueLine, 16, 600, onPoster ? '#ffffff' : ink, 'Venue');
  if (copy.message) { y += 6; const m = k.text(x, y, w, copy.message, { size: 14, font: t.body, weight: 400, color: muted, align, leading: 1.4, label: 'Message', role: 'BODY' }); y += m.h; }
  const footY = Math.max(y + 16, H - 70);
  const fy = Math.min(footY, H - 54);
  k.text(x, fy, w, copy.hostLine, { size: 13, font: t.body, weight: 700, color: onPoster ? '#ffffff' : ink, align, wrap: false, label: 'Host', role: 'CAPTION' });
  if (copy.footer) k.text(x, fy + 20, w, copy.footer, { size: 11, font: t.body, weight: 600, color: onPoster ? 'rgba(255,255,255,.8)' : muted, align, tracking: .1, transform: 'uppercase', wrap: false, label: 'Footer', role: 'FOLIO' });
  void eyebrow;
}

/** Tela-compatible motion tracks derived from fx tags, for `TelaDoc.templatePreset.motion`. */
export function motionTracks(objects: TelaVectorObject[]) {
  const tracks: Array<{ objectId: string; property: 'rotation' | 'x' | 'y' | 'opacity'; from: number; to: number; delay: number; duration: number; loop?: 'restart' }> = [];
  objects.forEach((o, i) => {
    const m = /^fx-([a-z]+):/.exec(o.id); if (!m) return;
    const delay = (i * 137) % 1800, fx = m[1];
    if (fx === 'float' || fx === 'bob' || fx === 'rise') tracks.push({ objectId: o.id, property: 'y', from: o.y, to: o.y - (fx === 'rise' ? 40 : 12), delay, duration: 3200 + (i % 5) * 400 });
    else if (fx === 'sway' || fx === 'wave') tracks.push({ objectId: o.id, property: 'rotation', from: o.rotation, to: o.rotation + 5, delay, duration: 2800 + (i % 4) * 300 });
    else if (fx === 'spin') tracks.push({ objectId: o.id, property: 'rotation', from: o.rotation, to: o.rotation + 360, delay: 0, duration: 40000, loop: 'restart' });
    else if (fx === 'twinkle' || fx === 'flicker' || fx === 'pulse') tracks.push({ objectId: o.id, property: 'opacity', from: o.opacity, to: Math.max(.2, o.opacity * .35), delay, duration: 1600 + (i % 4) * 300 });
    else if (fx === 'drift') tracks.push({ objectId: o.id, property: 'x', from: o.x, to: o.x + 18, delay, duration: 5000 + (i % 3) * 500 });
  });
  return tracks;
}

export const fxOf = (id: string): Fx | null => { const m = /^fx-([a-z]+):/.exec(id); return m ? m[1] as Fx : null; };
export { kRect, kEllipse, kCircle, kLine, kPath, kText };
