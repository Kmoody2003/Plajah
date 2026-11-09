// Industrial grading: grade-rule tables (per grade point, an x/y increment for every size break)
// applied to any pattern, drafted here or imported. Grade points sit on corners and notches; the
// points between them follow by arc-length interpolation of their neighbours' moves, as cutting
// rooms grade curves. Rules can be derived from our parametric drafts (draft each size, take the
// differences), edited, written to an ASTM D6673 RUL file, and the graded set nested.

import { type Pt, bbox, dist } from '../geometry';
import type { Pattern, Piece } from '../patterns';

export interface GradeRule { id: number; /** Increment for each size break: deltas[k] moves sizes[k] → sizes[k+1]. */ deltas: Pt[] }
export interface GradeTable { name: string; sizes: string[]; base: string; units: 'mm'; rules: GradeRule[] }
export interface GradePoint { index: number; rule: number }
export interface GradedPattern { pattern: Pattern; table: GradeTable; points: Record<string, GradePoint[]> }

/** Corners sharper than `deg` on a closed ring. */
export function corners(ring: Pt[], deg = 25): number[] {
  const n = ring.length; const out: number[] = [];
  for (let i = 0; i < n; i++) { const a = ring[(i - 1 + n) % n], p = ring[i], b = ring[(i + 1) % n]; const u = [p[0] - a[0], p[1] - a[1]], v = [b[0] - p[0], b[1] - p[1]];
    const c = (u[0] * v[0] + u[1] * v[1]) / ((Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1])) || 1); if (Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI > deg) out.push(i); }
  return out;
}

/** Cumulative move of a rule from the base size to `size`. */
export function ruleMove(t: GradeTable, rule: number, size: string): Pt {
  const r = t.rules.find(x => x.id === rule); const b = t.sizes.indexOf(t.base), s = t.sizes.indexOf(size); if (!r || b < 0 || s < 0) return [0, 0];
  let x = 0, y = 0; if (s > b) for (let k = b; k < s; k++) { x += r.deltas[k][0]; y += r.deltas[k][1]; } else for (let k = s; k < b; k++) { x -= r.deltas[k][0]; y -= r.deltas[k][1]; }
  return [x, y];
}

/** Grade one piece to `size`: grade points move exactly by their rules, the rest interpolate. */
export function gradePiece(piece: Piece, points: GradePoint[], t: GradeTable, size: string): Piece {
  const ring = piece.seam; const n = ring.length; if (!points.length) return piece;
  const gp = [...points].sort((a, b) => a.index - b.index); const move = new Map(gp.map(g => [g.index, ruleMove(t, g.rule, size)]));
  const cum = [0]; for (let i = 1; i <= n; i++) cum.push(cum[i - 1] + dist(ring[i - 1], ring[i % n])); const P = cum[n];
  const disp = (i: number): Pt => {
    if (move.has(i)) return move.get(i)!;
    // Previous and next grade points round the ring.
    let prev = gp[gp.length - 1], next = gp[0]; for (const g of gp) { if (g.index < i) prev = g; } for (const g of gp) { if (g.index > i) { next = g; break; } }
    const sp = cum[prev.index], sn = cum[next.index]; let span = sn - sp; let at = cum[i] - sp; if (span <= 0) span += P; if (at < 0) at += P;
    const f = span > 0 ? at / span : 0; const a = move.get(prev.index)!, b = move.get(next.index)!; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  };
  const D = ring.map((_, i) => disp(i)); const seam = ring.map((p, i) => [p[0] + D[i][0], p[1] + D[i][1]] as Pt);
  const nearMove = (q: Pt): Pt => { let bi = 0, bd = Infinity; ring.forEach((p, i) => { const d = dist(p, q); if (d < bd) { bd = d; bi = i; } }); return D[bi]; };
  // Interior marks follow inverse-distance weighting of the grade points' moves.
  const idw = (q: Pt): Pt => { let wx = 0, wy = 0, ws = 0; for (const g of gp) { const d = Math.max(1, dist(ring[g.index], q)); const w = 1 / (d * d); const m = move.get(g.index)!; wx += m[0] * w; wy += m[1] * w; ws += w; } return [wx / ws, wy / ws]; };
  const mv = (q: Pt, f: (q: Pt) => Pt): Pt => { const m = f(q); return [q[0] + m[0], q[1] + m[1]]; };
  return { ...piece, seam, notches: piece.notches?.map(q => mv(q, nearMove)), grain: [mv(piece.grain[0], idw), mv(piece.grain[1], idw)], marks: piece.marks?.map(m => ({ ...m, at: mv(m.at, idw) })) };
}

export function gradePattern(g: GradedPattern, size: string): Pattern {
  return { ...g.pattern, size, name: g.pattern.name.replace(new RegExp(`\\b${g.table.base}\\b`), size), pieces: g.pattern.pieces.map(p => gradePiece(p, g.points[p.id] ?? [], g.table, size)) };
}

/** Match each base grade point to the same point on another size's ring (same index if counts agree, else by arc-length fraction among corners). */
function matchIndex(base: Pt[], other: Pt[], i: number, otherCorners: number[]) {
  if (base.length === other.length) return i;
  const frac = (r: Pt[], k: number) => { let s = 0, tot = 0; for (let j = 0; j < r.length; j++) { const d = dist(r[j], r[(j + 1) % r.length]); if (j < k) s += d; tot += d; } return s / tot; };
  const f = frac(base, i); let best = otherCorners[0] ?? 0, bd = Infinity; for (const c of otherCorners.length ? otherCorners : other.map((_, k) => k)) { const d = Math.abs(frac(other, c) - f); if (d < bd) { bd = d; best = c; } } return best;
}

/**
 * Derive a grade-rule table from drafts of every size (our parametric templates): grade points are
 * the base size's corners plus notches; each break's delta is the drafted move of that point.
 */
export function deriveGrading(drafts: Record<string, Pattern>, sizes: string[], base: string, name = 'Plajah grade rules'): GradedPattern {
  const B = drafts[base]; const rules: GradeRule[] = []; const points: Record<string, GradePoint[]> = {}; const key = new Map<string, number>();
  for (const piece of B.pieces) {
    const idx = [...new Set([...corners(piece.seam), ...(piece.notches ?? []).map(q => { let bi = 0, bd = Infinity; piece.seam.forEach((p, i) => { const d = dist(p, q); if (d < bd) { bd = d; bi = i; } }); return bi; })])].sort((a, b) => a - b);
    const per = sizes.map(s => drafts[s]?.pieces.find(p => p.id === piece.id)?.seam);
    points[piece.id] = idx.map(i => {
      const pos = per.map(r => (r ? r[matchIndex(piece.seam, r, i, corners(r))] : piece.seam[i]));
      const deltas: Pt[] = []; for (let k = 0; k + 1 < sizes.length; k++) deltas.push([round3(pos[k + 1][0] - pos[k][0]), round3(pos[k + 1][1] - pos[k][1])]);
      const sig = deltas.map(d => `${d[0]},${d[1]}`).join(';'); let id = key.get(sig);
      if (id == null) { id = rules.length + 1; key.set(sig, id); rules.push({ id, deltas }); }
      return { index: i, rule: id };
    });
  }
  return { pattern: B, table: { name, sizes, base, units: 'mm', rules }, points };
}
const round3 = (x: number) => Math.round(x * 1000) / 1000;

/** Nested set: every size of every piece overlaid at its own coordinates, base size bold. */
export function nestSvg(g: GradedPattern, opts: { gap?: number } = {}): string {
  const gap = opts.gap ?? 60; let x0 = 0; const parts: string[] = []; let H = 0;
  const graded = g.table.sizes.map(s => gradePattern(g, s));
  for (const piece of g.pattern.pieces) {
    const all = graded.flatMap(p => p.pieces.find(q => q.id === piece.id)?.seam ?? []); if (!all.length) continue; const b = bbox(all); H = Math.max(H, b.h);
    graded.forEach((p, k) => { const q = p.pieces.find(z => z.id === piece.id)!; const isBase = g.table.sizes[k] === g.table.base; const hue = Math.round(220 + 140 * k / Math.max(1, graded.length - 1));
      parts.push(`<path d="M${q.seam.map(([x, y]) => `${(x - b.x0 + x0).toFixed(2)},${(-(y - b.y0)).toFixed(2)}`).join('L')}Z" fill="none" stroke="hsl(${hue % 360},75%,55%)" stroke-width="${isBase ? 1.6 : 0.7}"><title>${esc(piece.name)} ${esc(g.table.sizes[k])}</title></path>`); });
    parts.push(`<text x="${(x0).toFixed(1)}" y="${(20).toFixed(1)}" font-size="16" fill="#555">${esc(piece.name)}</text>`); x0 += b.w + gap;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${(x0 / 10).toFixed(1)}cm" height="${((H + 60) / 10).toFixed(1)}cm" viewBox="-20 ${-(H + 20)} ${x0 + 20} ${H + 60}">${parts.join('')}</svg>`;
}
const esc = (s: string) => s.replace(/[<&>"]/g, c => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;', '"': '&quot;' }[c]!));

/** A graded pattern from a pattern that has no rules yet: every corner gets rule 0 (no move). */
export function ungraded(p: Pattern, sizes: string[] = [p.size ?? 'BASE'], base = sizes[0]): GradedPattern {
  const zero: GradeRule = { id: 1, deltas: sizes.slice(1).map(() => [0, 0] as Pt) };
  return { pattern: p, table: { name: 'Grade rules', sizes, base, units: 'mm', rules: [zero] }, points: Object.fromEntries(p.pieces.map(pc => [pc.id, corners(pc.seam).map(i => ({ index: i, rule: 1 }))])) };
}
