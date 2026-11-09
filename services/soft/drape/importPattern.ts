// Import patterns drafted elsewhere: Seamly2D / Valentina SVG exports (each piece a closed path,
// often a seam-allowance outline around a seam line), any flat DXF (via our CAD reader), and AAMA
// DXF (aama.ts). Closed outlines become pieces; an outline nested inside a similar larger one is
// that piece's seam line and the outer its cut line. Units come from the SVG's width/viewBox
// (mm, cm, in) or 96 px/in.

import { type Pt, dist } from '../geometry';
import type { Pattern, Piece } from '../patterns';
import { parseDxf, flatten2D } from '../../cad/dxf';
import { MM_PER_UNIT } from '../../cad/model';
import { readAama } from './aama';
import { pointInPoly, polyDist } from './mesh';

const area = (p: Pt[]) => { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };

type M = [number, number, number, number, number, number];
const mul = (a: M, b: M): M => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
function parseTransform(s: string | undefined): M {
  let m: M = [1, 0, 0, 1, 0, 0]; if (!s) return m;
  for (const [, fn, args] of s.matchAll(/(\w+)\s*\(([^)]*)\)/g)) { const a = args.split(/[\s,]+/).filter(Boolean).map(Number);
    const t: M = fn === 'translate' ? [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0] : fn === 'scale' ? [a[0], 0, 0, a[1] ?? a[0], 0, 0] : fn === 'matrix' ? a.slice(0, 6) as M
      : fn === 'rotate' ? (() => { const r = (a[0] ?? 0) * Math.PI / 180, c = Math.cos(r), s2 = Math.sin(r); const R: M = [c, s2, -s2, c, 0, 0]; return a.length >= 3 ? mul(mul([1, 0, 0, 1, a[1], a[2]], R), [1, 0, 0, 1, -a[1], -a[2]]) : R; })() : [1, 0, 0, 1, 0, 0];
    m = mul(m, t); }
  return m;
}
const ap = (m: M, p: Pt): Pt => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];

/** SVG path data → polylines (curves sampled). */
export function pathToPolys(d: string): Array<{ pts: Pt[]; closed: boolean }> {
  const out: Array<{ pts: Pt[]; closed: boolean }> = []; const tok = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  let i = 0, cmd = '', cur: Pt = [0, 0], start: Pt = [0, 0], last: Pt | null = null, pts: Pt[] = [];
  const num = () => Number(tok[i++]); const isNum = () => i < tok.length && !/[a-zA-Z]/.test(tok[i]);
  const end = (closed: boolean) => { if (pts.length > 1) out.push({ pts, closed }); pts = []; };
  const cubic = (c1: Pt, c2: Pt, p: Pt) => { for (let k = 1; k <= 12; k++) { const t = k / 12, u = 1 - t; pts.push([u ** 3 * cur[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t ** 3 * p[0], u ** 3 * cur[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t ** 3 * p[1]]); } last = c2; cur = p; };
  while (i < tok.length) {
    if (/[a-zA-Z]/.test(tok[i])) cmd = tok[i++]; const rel = cmd === cmd.toLowerCase(); const C = cmd.toUpperCase(); const R = (p: Pt): Pt => (rel ? [cur[0] + p[0], cur[1] + p[1]] : p);
    if (C === 'Z') { end(true); cur = start; last = null; continue; }
    if (!isNum()) { i++; continue; }
    if (C === 'M') { end(false); cur = R([num(), num()]); start = cur; pts = [cur]; cmd = rel ? 'l' : 'L'; last = null; }
    else if (C === 'L') { cur = R([num(), num()]); pts.push(cur); last = null; }
    else if (C === 'H') { const x = num(); cur = [rel ? cur[0] + x : x, cur[1]]; pts.push(cur); last = null; }
    else if (C === 'V') { const y = num(); cur = [cur[0], rel ? cur[1] + y : y]; pts.push(cur); last = null; }
    else if (C === 'C') { const c1 = R([num(), num()]), c2 = R([num(), num()]), p = R([num(), num()]); cubic(c1, c2, p); }
    else if (C === 'S') { const c1: Pt = last ? [2 * cur[0] - last[0], 2 * cur[1] - last[1]] : cur; const c2 = R([num(), num()]), p = R([num(), num()]); cubic(c1, c2, p); }
    else if (C === 'Q') { const q = R([num(), num()]), p = R([num(), num()]); cubic([cur[0] + 2 / 3 * (q[0] - cur[0]), cur[1] + 2 / 3 * (q[1] - cur[1])], [p[0] + 2 / 3 * (q[0] - p[0]), p[1] + 2 / 3 * (q[1] - p[1])], p); }
    else if (C === 'A') { num(); num(); num(); num(); num(); const p = R([num(), num()]); pts.push(p); cur = p; last = null; }
    else i++;
  }
  end(false); return out;
}

const unitMm = (v: string | undefined): number | null => { if (!v) return null; const m = v.match(/^([\d.]+)\s*(mm|cm|in|pt|px)?$/); if (!m) return null; const x = Number(m[1]); return m[2] === 'mm' ? x : m[2] === 'cm' ? x * 10 : m[2] === 'in' ? x * 25.4 : m[2] === 'pt' ? x * 25.4 / 72 : x * 25.4 / 96; };
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`))?.[1] ?? tag.match(new RegExp(`\\s${name}\\s*=\\s*'([^']*)'`))?.[1];

/** Pieces from closed outlines: pair inner (seam) with outer (cut) when one nests in a similar one. */
export function piecesFromOutlines(rings: Array<{ pts: Pt[]; label?: string }>): Piece[] {
  const R = rings.map(r => { const p = area(r.pts) < 0 ? [...r.pts].reverse() : r.pts; return { pts: p, a: Math.abs(area(p)), label: r.label }; }).filter(r => r.a > 100).sort((a, b) => b.a - a.a);
  const used = new Set<number>(); const pieces: Piece[] = [];
  R.forEach((outer, oi) => {
    if (used.has(oi)) return; used.add(oi);
    // A seam line: the largest ring inside this one with ≥ 60% of its area.
    const inner = R.findIndex((r, k) => !used.has(k) && r.a < outer.a && r.a > outer.a * 0.6 && r.pts.every(q => pointInPoly(q, outer.pts)));
    let seam = outer.pts, allowance = 0;
    if (inner >= 0) { used.add(inner); seam = R[inner].pts; let s = 0; for (const q of seam) s += polyDist(q, outer.pts); allowance = Math.round(s / seam.length * 2) / 2; }
    // Skip small rings inside a piece (drill holes, labels) — they are not pieces.
    if (pieces.some(p => seam.every(q => pointInPoly(q, p.seam)))) return;
    const xs = seam.map(q => q[0]), ys = seam.map(q => q[1]); const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const name = outer.label ?? R[inner]?.label ?? `Piece ${pieces.length + 1}`;
    pieces.push({ id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `piece-${pieces.length + 1}`, name, seam: simplifyClose(seam), allowance, cut: 1, fabric: 'main', grain: [[cx, Math.min(...ys) + (Math.max(...ys) - Math.min(...ys)) * 0.2], [cx, Math.min(...ys) + (Math.max(...ys) - Math.min(...ys)) * 0.8]] });
  });
  return pieces;
}
function simplifyClose(p: Pt[]): Pt[] { const out: Pt[] = []; for (const q of p) if (!out.length || dist(out[out.length - 1], q) > 0.05) out.push(q); while (out.length > 2 && dist(out[0], out[out.length - 1]) < 0.05) out.pop(); return out; }

/** Seamly2D / Valentina (or any) SVG export → pattern. */
export function importSvg(svg: string, name = 'Imported pattern'): { pattern: Pattern; warnings: string[] } {
  const warnings: string[] = []; const head = svg.match(/<svg\b[^>]*>/i)?.[0] ?? '';
  const vb = attr(head, 'viewBox')?.split(/[\s,]+/).map(Number); const wmm = unitMm(attr(head, 'width'));
  const scale = vb && wmm && vb[2] > 0 && /mm|cm|in|pt/.test(attr(head, 'width') ?? '') ? wmm / vb[2] : 25.4 / 96;
  if (!(vb && wmm)) warnings.push('No physical size in the SVG; assumed 96 px per inch. Check one piece against its known size.');
  // Walk tags keeping a transform stack and the nearest label text per group.
  const stack: M[] = [[1, 0, 0, 1, 0, 0]]; const rings: Array<{ pts: Pt[]; label?: string; group: number }> = []; const labels: Array<{ at: Pt; text: string; group: number }> = [];
  let group = 0; const groupStack = [0];
  for (const m of svg.matchAll(/<(\/?)(\w+)\b([^>]*?)(\/?)>([^<]*)/g)) {
    const [, close, tag, rest, self, after] = m; const full = ` ${rest}`;
    if (close) { if (tag === 'g' || tag === 'svg') { stack.pop(); groupStack.pop(); } continue; }
    const T = mul(stack[stack.length - 1], parseTransform(attr(full, 'transform')));
    if ((tag === 'g' || tag === 'svg') && !self) { stack.push(tag === 'svg' ? stack[stack.length - 1] : T); groupStack.push(tag === 'g' ? ++group : groupStack[groupStack.length - 1]); continue; }
    const g = groupStack[groupStack.length - 1];
    if (tag === 'path') for (const pl of pathToPolys(attr(full, 'd') ?? '')) { const closed = pl.closed || (pl.pts.length > 2 && dist(pl.pts[0], pl.pts[pl.pts.length - 1]) < 0.01); if (closed) rings.push({ pts: pl.pts.map(p => ap(T, p)), group: g, label: attr(full, 'id') && !/^path\d*$/i.test(attr(full, 'id')!) ? attr(full, 'id') : undefined }); }
    if (tag === 'polygon') { const n = (attr(full, 'points') ?? '').split(/[\s,]+/).filter(Boolean).map(Number); const pts: Pt[] = []; for (let k = 0; k + 1 < n.length; k += 2) pts.push(ap(T, [n[k], n[k + 1]])); if (pts.length > 2) rings.push({ pts, group: g }); }
    if (tag === 'rect') { const x = Number(attr(full, 'x') ?? 0), y = Number(attr(full, 'y') ?? 0), w = Number(attr(full, 'width') ?? 0), h = Number(attr(full, 'height') ?? 0); if (w > 0 && h > 0 && !(x === 0 && y === 0 && vb && w >= vb[2] * 0.98)) rings.push({ pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(p => ap(T, p as Pt)), group: g }); }
    if (tag === 'text' || tag === 'tspan') { const t = (after ?? '').trim(); if (t) labels.push({ at: ap(T, [Number(attr(full, 'x') ?? 0), Number(attr(full, 'y') ?? 0)]), text: t, group: g }); }
  }
  // mm, y up.
  const conv = (p: Pt): Pt => [p[0] * scale, -p[1] * scale];
  const withLabels = rings.map(r => { const pts = r.pts.map(conv); const inside = labels.filter(l => pointInPoly(conv(l.at), pts)); const lab = r.label ?? inside.find(l => /[a-z]/i.test(l.text) && !/^\d+(\.\d+)?$/.test(l.text))?.text; return { pts, label: lab }; });
  const pieces = piecesFromOutlines(withLabels); if (!pieces.length) warnings.push('No closed outlines found.');
  return { pattern: blankPattern(name, pieces), warnings };
}

export function blankPattern(name: string, pieces: Piece[]): Pattern {
  return { template: 'imported', name, kind: 'apparel', pieces, notions: [], steps: [], notes: [], features: {}, fabricWidth: 1500, finished: [] };
}

/** Any DXF: AAMA/ASTM if it has piece blocks, else closed outlines through the CAD reader. */
export function importDxf(text: string, name = 'Imported pattern') {
  if (/AC1009/.test(text) && /\n\s*BLOCK\s*\r?\n/.test(text) && /Piece Name:/i.test(text)) { const r = readAama(text); return { pattern: r.graded.pattern, graded: r.graded, warnings: r.warnings }; }
  const model = parseDxf(text, name); const flat = flatten2D(model); const u = MM_PER_UNIT[model.units] ?? 1;
  const rings = flat.paths.filter(p => p.closed || (p.pts.length > 2 && Math.hypot(p.pts[0][0] - p.pts[p.pts.length - 1][0], p.pts[0][1] - p.pts[p.pts.length - 1][1]) < 0.01)).map(p => ({ pts: p.pts.map(q => [q[0] * u, q[1] * u] as Pt) }));
  const labels = flat.texts; const pieces = piecesFromOutlines(rings.map(r => ({ pts: r.pts, label: labels.find(t => pointInPoly([t.at[0] * u, t.at[1] * u], r.pts) && /[a-z]/i.test(t.text))?.text })));
  return { pattern: blankPattern(name, pieces), graded: undefined, warnings: pieces.length ? [] : ['No closed outlines found in this DXF.'] };
}
