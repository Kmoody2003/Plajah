// doodleKit — pure black LINE ART helpers for the activity book "Doodle Day"
// (story-doodle). Everything is an unfilled outline in one ink on white paper:
// print-friendly, ink-saving, ready to colour. Icons are unit-space polylines.
import type { TelaVectorObject } from '../../../../types';
import { circle, rect, text, path } from '../../templateKit';
import { letterRow, measureRow, BUNGEE_ADV, type Pt } from './kidsArtC';

type O = TelaVectorObject;
export const INK = '#111111';
export const DW = 816, DH = 1056;
export type Sub = { pts: Pt[]; closed?: boolean };

// ── geometry ──────────────────────────────────────────────────────────────────
export const circPts = (cx: number, cy: number, r: number, n = 28): Pt[] => Array.from({ length: n }, (_, i) => [cx + r * Math.cos(i / n * Math.PI * 2), cy + r * Math.sin(i / n * Math.PI * 2)] as Pt);
export function ellPts(cx: number, cy: number, rx: number, ry: number, n = 32, rot = 0): Pt[] {
  const c = Math.cos(rot * Math.PI / 180), s = Math.sin(rot * Math.PI / 180);
  return Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2; const x = rx * Math.cos(a), y = ry * Math.sin(a); return [cx + x * c - y * s, cy + x * s + y * c] as Pt; });
}
export const arcP = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 20): Pt[] => Array.from({ length: n + 1 }, (_, i) => { const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180; return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)] as Pt; });
/** Catmull-Rom through the points, sampled. */
export function smooth(p: Pt[], closed = false, per = 8): Pt[] {
  const n = p.length; const out: Pt[] = []; const get = (i: number): Pt => closed ? p[((i % n) + n) % n] : p[Math.max(0, Math.min(n - 1, i))];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    for (let t = 0; t < per; t++) {
      const u = t / per, u2 = u * u, u3 = u2 * u;
      out.push([.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * u + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * u2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * u3), .5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * u + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3)]);
    }
  }
  if (!closed) out.push(p[n - 1]);
  return out;
}
/** Outline of a cluster of overlapping circles (cloud, tree crown, flower head): sample, drop covered points, order by angle. */
export function unionCircles(cs: Array<[number, number, number]>, n = 48): Pt[] {
  const mx = cs.reduce((a, c) => a + c[0], 0) / cs.length, my = cs.reduce((a, c) => a + c[1], 0) / cs.length;
  const keep: Array<{ p: Pt; a: number }> = [];
  cs.forEach(([cx, cy, r], i) => { for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2; const p: Pt = [cx + r * Math.cos(a), cy + r * Math.sin(a)]; if (cs.some(([x, y, rr], j) => j !== i && Math.hypot(p[0] - x, p[1] - y) < rr * .985)) continue; keep.push({ p, a: Math.atan2(p[1] - my, p[0] - mx) }); } });
  return keep.sort((u, v) => u.a - v.a).map(k => k.p);
}
export function xf(subs: Sub[], cx: number, cy: number, s: number, rot = 0, flip = false): Sub[] {
  const c = Math.cos(rot * Math.PI / 180), sn = Math.sin(rot * Math.PI / 180);
  return subs.map(sub => ({ closed: sub.closed, pts: sub.pts.map(([x, y]) => { const px = (flip ? -x : x) * s, py = y * s; return [cx + px * c - py * sn, cy + px * sn + py * c] as Pt; }) }));
}

// ── ink primitives ────────────────────────────────────────────────────────────
/** Many outlines as ONE editable path object. */
export function ink(subs: Sub[], w: number, o: { dash?: number[]; label?: string; opacity?: number; fill?: boolean } = {}): O {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of subs) for (const [x, y] of s.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const bw = Math.max(1, x1 - x0), bh = Math.max(1, y1 - y0);
  const f = (n: number) => Math.round(n * 10) / 10;
  const d = subs.map(s => 'M' + s.pts.map(p => `${f(p[0])} ${f(p[1])}`).join(' L') + (s.closed ? ' Z' : '')).join(' ');
  return path(x0, y0, bw, bh, d, o.fill ? '#FFFFFF' : 'none', { stroke: INK, strokeWidth: w, origin: { x: x0, y: y0, w: bw, h: bh }, open: true, dash: o.dash, opacity: o.opacity, label: o.label || 'Line art' });
}
export const loop = (pts: Pt[]): Sub => ({ pts, closed: true });
export const open = (pts: Pt[]): Sub => ({ pts, closed: false });
export const ring = (cx: number, cy: number, r: number, w = 6, label = 'Outline circle'): O => circle(cx, cy, r, 'none', { stroke: INK, strokeWidth: w, label });
export const dotInk = (cx: number, cy: number, r: number): O => circle(cx, cy, r, INK, { label: 'Ink dot' });
export const roundBox = (x: number, y: number, w: number, h: number, rx: number, sw = 5, o: { dash?: number[]; label?: string } = {}): O => rect(x, y, w, h, 'none', { rx, stroke: INK, strokeWidth: sw, dash: o.dash, label: o.label || 'Outline box' });

// ── unit icons (radius ~1) ────────────────────────────────────────────────────
function starSub(inner = .45): Sub { const pts: Pt[] = []; for (let i = 0; i < 10; i++) { const a = (i * 36 - 90) * Math.PI / 180, r = i % 2 ? inner : 1; pts.push([r * Math.cos(a), r * Math.sin(a)]); } return loop(pts); }
function heartSub(): Sub { const pts: Pt[] = []; for (let i = 0; i < 48; i++) { const t = i / 48 * Math.PI * 2; pts.push([16 * Math.pow(Math.sin(t), 3) / 17, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17 + .1]); } return loop(pts); }
function moonSub(): Sub {
  // fat crescent: unit circle minus a smaller circle (centre .5, radius .82); they cross at +-54.7 degrees
  const outer = arcP(0, 0, 1, 1, 54.7, 305.3, 26);
  const inner = arcP(.5, 0, .82, .82, 275.4, 84.6, 22);
  return loop([...outer, ...inner]);
}
export function iconSubs(kind: string): Sub[] {
  switch (kind) {
    case 'star': return [starSub()];
    case 'heart': return [heartSub()];
    case 'moon': return [moonSub()];
    case 'fish': return [loop(ellPts(-.1, 0, .72, .46)), loop([[.6, 0], [1, -.42], [1, .42]]), loop(circPts(-.45, -.1, .07, 10)), open(arcP(-.55, .08, .24, .2, 20, 90, 6))];
    case 'key': return [loop(circPts(-.62, 0, .32)), loop(circPts(-.62, 0, .12, 12)), open([[-.3, 0], [.95, 0]]), open([[.55, 0], [.55, .32]]), open([[.82, 0], [.82, .26]])];
    case 'flower': { const petals: Array<[number, number, number]> = Array.from({ length: 6 }, (_, i) => [.52 * Math.cos(i * Math.PI / 3), .52 * Math.sin(i * Math.PI / 3), .36]); petals.push([0, 0, .3]); return [loop(unionCircles(petals, 36)), loop(circPts(0, 0, .2, 14))]; }
    case 'leaf': return [loop([...arcP(0, 0.0, 1, .5, 180, 360, 14).map(([x, y]) => [x, y + .0] as Pt), ...arcP(0, 0, 1, .5, 0, 180, 14)]), open([[-.9, 0], [.8, 0]])];
    case 'plus': return [loop([[-.2, -.9], [.2, -.9], [.2, -.2], [.9, -.2], [.9, .2], [.2, .2], [.2, .9], [-.2, .9], [-.2, .2], [-.9, .2], [-.9, -.2], [-.2, -.2]])];
    case 'diamond': return [loop([[0, -.95], [.62, 0], [0, .95], [-.62, 0]]), open([[-.62, 0], [.62, 0]])];
    case 'ring': return [loop(circPts(0, 0, .85)), loop(circPts(0, 0, .45))];
    case 'triangle': return [loop([[0, -.9], [.9, .7], [-.9, .7]]), loop([[0, -.35], [.34, .3], [-.34, .3]])];
    case 'zigzag': return [open([[-1, .4], [-.6, -.4], [-.2, .4], [.2, -.4], [.6, .4], [1, -.4]])];
    case 'squiggle': return [open(Array.from({ length: 28 }, (_, i) => [-1 + i / 27 * 2, Math.sin(i / 27 * Math.PI * 4) * .4] as Pt))];
    case 'spiral': return [open(Array.from({ length: 44 }, (_, i) => { const t = i / 43 * Math.PI * 5; return [Math.cos(t) * (.08 + t * .058), Math.sin(t) * (.08 + t * .058)] as Pt; }))];
    case 'cloud': return [loop(unionCircles([[-.5, .15, .38], [-.1, -.1, .5], [.4, .1, .42], [.0, .3, .4]], 30))];
    case 'bee': return [loop(ellPts(0, .1, .62, .42)), open([[-.15, -.3], [-.15, .5]]), open([[.18, -.3], [.18, .5]]), loop(ellPts(-.2, -.6, .2, .32, 18, -25)), loop(ellPts(.25, -.6, .2, .32, 18, 25)), loop(circPts(-.4, .02, .07, 8)), open([[.62, .1], [.95, .1]])];
    case 'rocket': return [loop([[0, -1], [.32, -.5], [.4, .5], [-.4, .5], [-.32, -.5]]), loop(circPts(0, -.18, .17, 14)), loop([[.4, .1], [.72, .62], [.4, .5]]), loop([[-.4, .1], [-.72, .62], [-.4, .5]]), open([[-.2, .5], [0, .9], [.2, .5]])];
    case 'fishbowl': return [loop(circPts(0, 0, .9, 36))];
    default: return [loop(circPts(0, 0, .8))];
  }
}
export function icon(kind: string, cx: number, cy: number, size: number, rot = 0, w = 4, flip = false, fill = false): O {
  return ink(xf(iconSubs(kind), cx, cy, size, rot, flip), w, { label: 'Doodle ' + kind, fill });
}

// ── type + page furniture ─────────────────────────────────────────────────────
/** Doodle title: outline-only letters (Bungee Outline) that bounce a little. */
export function doodleTitle(str: string, x: number, y: number, size: number, o: { align?: 'left' | 'center'; seed?: number; maxW?: number } = {}): { objs: O[]; w: number } {
  let s = size; const maxW = o.maxW ?? 720; while (measureRow(str, s, BUNGEE_ADV) > maxW && s > 30) s -= 2;
  return letterRow(str, x, y, { font: 'bungeeOutline', adv: BUNGEE_ADV, size: s, colors: [INK], stroke: 'none', sw: 0, bounce: s * .035, rot: 2.5, align: o.align ?? 'left', seed: o.seed ?? 4, label: 'Doodle title letter' });
}
/** Numbered instruction steps in a rounded face: number rings + 20px copy. */
export function steps(x: number, y: number, w: number, list: string[], size = 20, gap = 8): { objs: O[]; bottom: number } {
  const objs: O[] = []; let cy = y;
  list.forEach((s, i) => {
    const t = text(x + 46, cy, w - 46, s, { size, font: 'fredoka', weight: 500, color: INK, leading: 1.22, label: 'Instruction', role: 'BODY' });
    const mid = cy + size * .62;
    objs.push(circle(x + 17, mid, 16, 'none', { stroke: INK, strokeWidth: 3, label: 'Step ring' }), text(x, mid - size * .66, 34, String(i + 1), { size, font: 'fredoka', weight: 700, color: INK, align: 'center', wrap: false, label: 'Step number', role: 'LABEL' }), t);
    cy += Math.max(t.h, size * 1.3) + gap;
  });
  return { objs, bottom: cy - gap };
}
export const folio = (n: number): O => text(0, DH - 36, DW, `DOODLE DAY  ·  ${n}`, { size: 16, font: 'fredoka', weight: 600, color: INK, align: 'center', wrap: false, tracking: .1, label: 'Folio', role: 'FOLIO' });
/** A small outlined pill, e.g. 'little hands' / 'big kids'. */
export function tag(x: number, y: number, label: string, w = 170): O[] {
  return [roundBox(x, y, w, 36, 18, 3, { label: 'Tag outline' }), text(x, y + 6, w, label, { size: 18, font: 'fredoka', weight: 600, color: INK, align: 'center', wrap: false, label: 'Tag', role: 'LABEL' })];
}
export { text, circle };
