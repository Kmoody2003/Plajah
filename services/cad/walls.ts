// Walls: two faces from a centreline and a thickness, mitred where two walls share an end,
// broken where they host doors and windows, with the opening's library symbol drawn in place.
// Geometry comes out as ordinary entities, so drawing, picking, plotting and DXF export reuse
// everything that already exists.

import type { CadEntity2D, Vec3, WallOpening } from './model';
import { itemById, defaultParams, scaleEntities } from './library';
import { transformEntity, type Affine } from './transform';

type P = [number, number];
export type Wall = Extract<CadEntity2D, { type: 'wall' }>;

const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const len = (v: P) => Math.hypot(v[0], v[1]);
const unit = (v: P): P => { const l = len(v) || 1; return [v[0] / l, v[1] / l]; };
const perp = (v: P): P => [-v[1], v[0]];
const xy = (v: Vec3): P => [v[0], v[1]];

function intersect(p1: P, d1: P, p2: P, d2: P): P | null {
  const den = d1[0] * d2[1] - d1[1] * d2[0]; if (Math.abs(den) < 1e-9) return null;
  const t = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / den; return [p1[0] + t * d1[0], p1[1] + t * d1[1]];
}

export interface WallJoin { end: 'a' | 'b'; other: Wall; otherEnd: 'a' | 'b' }

/** For each wall, the one other wall sharing each end (L-corners). Three or more walls at a point stay butt-jointed. */
export function findJoins(walls: Wall[]): Map<Wall, WallJoin[]> {
  const tol = (w: Wall) => Math.max(1e-6, w.thickness * 0.02);
  const ends: Array<{ w: Wall; end: 'a' | 'b'; p: P }> = walls.flatMap(w => [{ w, end: 'a' as const, p: xy(w.a) }, { w, end: 'b' as const, p: xy(w.b) }]);
  const out = new Map<Wall, WallJoin[]>();
  for (const e of ends) {
    const near = ends.filter(o => o.w !== e.w && len(sub(o.p, e.p)) <= Math.max(tol(e.w), tol(o.w)));
    if (near.length !== 1) continue;
    const list = out.get(e.w) ?? []; list.push({ end: e.end, other: near[0].w, otherEnd: near[0].end }); out.set(e.w, list);
  }
  return out;
}

/** The two faces of a wall as [start, end] pairs in the wall's own direction: left (+normal) and right. */
export function wallFaces(w: Wall, joins: WallJoin[] = []): { left: [P, P]; right: [P, P] } {
  const a = xy(w.a), b = xy(w.b); const u = unit(sub(b, a)); const n = perp(u); const h = w.thickness / 2;
  const left: [P, P] = [[a[0] + n[0] * h, a[1] + n[1] * h], [b[0] + n[0] * h, b[1] + n[1] * h]];
  const right: [P, P] = [[a[0] - n[0] * h, a[1] - n[1] * h], [b[0] - n[0] * h, b[1] - n[1] * h]];
  for (const j of joins) {
    const P0 = j.end === 'a' ? a : b; const dW = j.end === 'a' ? u : [-u[0], -u[1]] as P; const nW = perp(dW);
    const o = j.other; const oa = xy(o.a), ob = xy(o.b); const uo = unit(sub(ob, oa)); const dV = j.otherEnd === 'a' ? uo : [-uo[0], -uo[1]] as P; const nV = perp(dV); const hV = o.thickness / 2;
    // Face on +nW (relative to the direction leaving the joint) meets the other wall's -nV face, and vice versa.
    const x1 = intersect([P0[0] + nW[0] * h, P0[1] + nW[1] * h], dW, [P0[0] - nV[0] * hV, P0[1] - nV[1] * hV], dV);
    const x2 = intersect([P0[0] - nW[0] * h, P0[1] - nW[1] * h], dW, [P0[0] + nV[0] * hV, P0[1] + nV[1] * hV], dV);
    if (!x1 || !x2) continue; // collinear walls: leave square ends
    // +nW at end a is the wall's left face; at end b it is the right face.
    if (j.end === 'a') { left[0] = x1; right[0] = x2; } else { right[1] = x1; left[1] = x2; }
  }
  return { left, right };
}

/** Where along the wall (distance from a) a point projects. */
export function stationOf(w: Wall, p: P): { s: number; offset: number; length: number } {
  const a = xy(w.a), b = xy(w.b); const L = len(sub(b, a)); const u = unit(sub(b, a)); const d = sub(p, a);
  return { s: d[0] * u[0] + d[1] * u[1], offset: d[0] * -u[1] + d[1] * u[0], length: L };
}

/** Everything a wall draws: faces with gaps, end caps where not joined, and its openings' symbols. */
export function wallGeometry(w: Wall, joins: WallJoin[] = []): CadEntity2D[] {
  const a = xy(w.a), b = xy(w.b); const L = len(sub(b, a)); if (L < 1e-9) return [];
  const u = unit(sub(b, a)); const n = perp(u); const h = w.thickness / 2; const layer = w.layer;
  const { left, right } = wallFaces(w, joins);
  const out: CadEntity2D[] = [];
  const gaps = [...w.openings].filter(o => o.width > 0).sort((x, y) => x.at - y.at).map(o => [Math.max(0, o.at), Math.min(L, o.at + o.width)] as [number, number]);
  const face = (f: [P, P]) => {
    const s0 = stationOf(w, f[0]).s, s1 = stationOf(w, f[1]).s; const off = stationOf(w, f[0]).offset;
    const at = (s: number): Vec3 => [a[0] + u[0] * s + n[0] * off, a[1] + u[1] * s + n[1] * off, 0];
    let cur = s0;
    for (const [g0, g1] of gaps) { if (g1 <= cur || g0 >= s1) continue; if (g0 > cur) out.push({ type: 'line', layer, a: cur === s0 ? [f[0][0], f[0][1], 0] : at(cur), b: at(g0) }); cur = Math.max(cur, g1); }
    if (cur < s1) out.push({ type: 'line', layer, a: cur === s0 ? [f[0][0], f[0][1], 0] : at(cur), b: [f[1][0], f[1][1], 0] });
  };
  face(left); face(right);
  if (!joins.some(j => j.end === 'a')) out.push({ type: 'line', layer, a: [left[0][0], left[0][1], 0], b: [right[0][0], right[0][1], 0] });
  if (!joins.some(j => j.end === 'b')) out.push({ type: 'line', layer, a: [left[1][0], left[1][1], 0], b: [right[1][0], right[1][1], 0] });
  for (const o of w.openings) out.push(...openingGeometry(w, o, a, u, n, h));
  return out;
}

/** The opening's library symbol, placed in the wall. Library frames: opening along +x from 0 to width, wall face on y = 0, body below, swing up. */
function openingGeometry(w: Wall, o: WallOpening, a: P, u: P, n: P, h: number): CadEntity2D[] {
  const k = w.unitsPerMm || 1;
  const item = o.item ? itemById(o.item) : undefined;
  const layer = o.kind === 'window' ? 'A-GLAZ' : 'A-DOOR';
  let local: CadEntity2D[];
  if (item) local = scaleEntities(item.build({ ...defaultParams(item), ...(o.params ?? {}), width: o.width / k, wall: w.thickness / k }), k);
  else local = [{ type: 'line', layer: '0', a: [0, 0, 0], b: [0, -w.thickness, 0] }, { type: 'line', layer: '0', a: [o.width, 0, 0], b: [o.width, -w.thickness, 0] }];
  // Not flipped: origin on the left face at the opening start, x along the wall, y out of the left face.
  // Flipped: rotated 180 so the symbol faces the right side; origin at the opening end on the right face.
  const M: Affine = !o.flip
    ? [u[0], u[1], n[0], n[1], a[0] + u[0] * o.at + n[0] * h, a[1] + u[1] * o.at + n[1] * h]
    : [-u[0], -u[1], -n[0], -n[1], a[0] + u[0] * (o.at + o.width) - n[0] * h, a[1] + u[1] * (o.at + o.width) - n[1] * h];
  return local.map(e => ({ ...transformEntity(e, M), layer: e.layer === '0' ? layer : e.layer }));
}

/** Add an opening centred at `centre` (a point near the wall), on the side the point is on. Returns null if it does not fit. */
export function addOpening(w: Wall, centre: P, opening: Omit<WallOpening, 'at' | 'flip' | 'id'> & { id?: string }): Wall | null {
  const st = stationOf(w, centre); if (opening.width > st.length) return null;
  const at = Math.max(0, Math.min(st.length - opening.width, st.s - opening.width / 2));
  // An opening may not overlap another one.
  if (w.openings.some(o => at < o.at + o.width - 1e-9 && o.at < at + opening.width - 1e-9)) return null;
  const id = opening.id ?? `op_${Math.random().toString(36).slice(2, 8)}`;
  return { ...w, openings: [...w.openings, { ...opening, id, at, flip: st.offset < 0 }] };
}

/** Wall nearest to p within reach (half thickness plus `extra`), with its index. */
export function wallAt(entities: CadEntity2D[], p: P, extra: number): { index: number; wall: Wall } | null {
  let best: { index: number; wall: Wall } | null = null; let bd = Infinity;
  entities.forEach((e, index) => {
    if (e.type !== 'wall') return; const st = stationOf(e, p);
    if (st.s < 0 || st.s > st.length) return;
    const d = Math.abs(st.offset); if (d <= e.thickness / 2 + extra && d < bd) { bd = d; best = { index, wall: e }; }
  });
  return best;
}
