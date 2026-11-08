// Drafting engine for the 2D room: object snaps, picking, window/crossing selection,
// edits (add, erase, move, copy, rotate-free translate), AutoCAD-style typed input and
// command aliases. Pure functions over CadModel, so the UI and tests share them.

import { type CadModel, type CadEntity2D, type CadLayer, type Vec3, type CadUnit, emptyModel } from './model';
import { flatten2D, paths2DBounds, bulgePoints } from './dxf';
import { transformEntity, type Affine } from './transform';
export { transformEntity, rotateAbout, scaleAbout, mirrorAcross, type Affine } from './transform';

export type P = [number, number];

// ── New drawing ─────────────────────────────────────────────────────────────

/** Starting layers follow the US National CAD Standard / AIA layer names architects expect. */
export const AEC_LAYERS: CadLayer[] = [
  { name: '0', color: '#ffffff', visible: true },
  { name: 'A-WALL', color: '#ff0000', visible: true },
  { name: 'A-DOOR', color: '#00ff00', visible: true },
  { name: 'A-GLAZ', color: '#00ffff', visible: true },
  { name: 'A-FLOR', color: '#c0c0c0', visible: true },
  { name: 'S-GRID', color: '#ff00ff', visible: true },
  { name: 'A-ANNO-DIMS', color: '#ffff00', visible: true },
  { name: 'A-ANNO-TEXT', color: '#ffffff', visible: true },
];

export function newDrawing(name = 'Drawing.dxf', units: CadUnit = 'mm'): CadModel {
  const m = emptyModel(name, 'dxf', 'plajah-dxf'); m.is2D = true; m.units = units;
  m.layers = AEC_LAYERS.map(l => ({ ...l }));
  m.bounds = { min: [0, 0, 0], max: units === 'mm' ? [10000, 7000, 0] : units === 'in' ? [400, 280, 0] : units === 'ft' ? [33, 23, 0] : [10, 7, 0] };
  return m;
}

// ── Per-entity geometry cache (picking and snapping read this) ──────────────

export interface EntityGeom { index: number; paths: P[][]; closed: boolean[]; texts: Array<{ at: P; w: number; h: number }>; snaps: Snap[]; box: [number, number, number, number] }
export type SnapKind = 'end' | 'mid' | 'center' | 'quad' | 'node' | 'insert' | 'intersection' | 'grid' | 'perp';
export interface Snap { p: P; kind: SnapKind }

export function buildGeom(m: CadModel, hiddenLayers?: Set<string>): EntityGeom[] {
  const out: EntityGeom[] = [];
  m.entities.forEach((e, index) => {
    const f = flatten2D({ entities: [e], blocks: m.blocks, layers: m.layers }, { hiddenLayers });
    if (!f.paths.length && !f.texts.length) return;
    const paths = f.paths.map(p => p.pts as P[]); const closed = f.paths.map(p => p.closed);
    const texts = f.texts.map(t => ({ at: t.at as P, w: t.height * Math.max(1, ...t.text.split('\n').map(l => l.length)) * 0.6, h: t.height }));
    const b = paths2DBounds(f);
    out.push({ index, paths, closed, texts, snaps: entitySnaps(e, m), box: [b.min[0], b.min[1], b.max[0], b.max[1]] });
  });
  return out;
}

const mid = (a: P | Vec3, b: P | Vec3): P => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const xy = (v: Vec3 | P): P => [v[0], v[1]];

function entitySnaps(e: CadEntity2D, m: CadModel): Snap[] {
  const s: Snap[] = [];
  switch (e.type) {
    case 'line': s.push({ p: xy(e.a), kind: 'end' }, { p: xy(e.b), kind: 'end' }, { p: mid(e.a, e.b), kind: 'mid' }); break;
    case 'polyline': {
      const pts = e.points; pts.forEach(p => s.push({ p: xy(p), kind: 'end' }));
      const n = e.closed ? pts.length : pts.length - 1;
      for (let i = 0; i < n; i++) if (!e.bulges?.[i]) s.push({ p: mid(pts[i], pts[(i + 1) % pts.length]), kind: 'mid' });
      break;
    }
    case 'circle': s.push({ p: xy(e.c), kind: 'center' }); for (const a of [0, 90, 180, 270]) s.push({ p: [e.c[0] + e.r * Math.cos(a * Math.PI / 180), e.c[1] + e.r * Math.sin(a * Math.PI / 180)], kind: 'quad' }); break;
    case 'arc': {
      const at = (deg: number): P => [e.c[0] + e.r * Math.cos(deg * Math.PI / 180), e.c[1] + e.r * Math.sin(deg * Math.PI / 180)];
      let end = e.end; while (end <= e.start) end += 360;
      s.push({ p: xy(e.c), kind: 'center' }, { p: at(e.start), kind: 'end' }, { p: at(e.end), kind: 'end' }, { p: at((e.start + end) / 2), kind: 'mid' });
      break;
    }
    case 'ellipse': s.push({ p: xy(e.c), kind: 'center' }); break;
    case 'point': s.push({ p: xy(e.at), kind: 'node' }); break;
    case 'text': s.push({ p: xy(e.at), kind: 'insert' }); break;
    case 'insert': {
      s.push({ p: xy(e.at), kind: 'insert' });
      const f = flatten2D({ entities: [e], blocks: m.blocks, layers: m.layers });
      for (const path of f.paths) { s.push({ p: path.pts[0] as P, kind: 'end' }); if (path.pts.length > 1) s.push({ p: path.pts[path.pts.length - 1] as P, kind: 'end' }); }
      break;
    }
    case 'dimension': s.push({ p: xy(e.a), kind: 'end' }, { p: xy(e.b), kind: 'end' }); break;
    case 'wall': s.push({ p: xy(e.a), kind: 'end' }, { p: xy(e.b), kind: 'end' }, { p: mid(e.a, e.b), kind: 'mid' }); break;
    case 'room': s.push({ p: xy(e.at), kind: 'insert' }); break;
    case 'face': case 'hatch': for (const p of (e.type === 'face' ? e.points : e.loops.flat())) s.push({ p: xy(p), kind: 'end' }); break;
    case 'spline': if (e.points.length) { s.push({ p: xy(e.points[0]), kind: 'end' }, { p: xy(e.points[e.points.length - 1]), kind: 'end' }); } break;
  }
  return s;
}

// ── Snapping ────────────────────────────────────────────────────────────────

export interface SnapOptions { end: boolean; mid: boolean; center: boolean; intersection: boolean; perpendicular: boolean; grid: boolean; gridSize: number; ortho: boolean }
export const DEFAULT_SNAPS: SnapOptions = { end: true, mid: true, center: true, intersection: true, perpendicular: true, grid: false, gridSize: 100, ortho: false };

const PRIORITY: Record<SnapKind, number> = { end: 0, intersection: 1, center: 2, mid: 3, quad: 4, node: 4, insert: 5, perp: 6, grid: 9 };

function segIntersect(a: P, b: P, c: P, d: P): P | null {
  const r: P = [b[0] - a[0], b[1] - a[1]], s: P = [d[0] - c[0], d[1] - c[1]]; const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 ? [a[0] + t * r[0], a[1] + t * r[1]] : null;
}

/** Nearest snap to `cursor` within `tol` (model units). `from` enables ortho and perpendicular. */
export function findSnap(geom: EntityGeom[], cursor: P, tol: number, o: SnapOptions, from?: P | null): Snap | null {
  let best: Snap | null = null; let bestScore = Infinity;
  const consider = (sn: Snap) => {
    const d = Math.hypot(sn.p[0] - cursor[0], sn.p[1] - cursor[1]); if (d > tol) return;
    const score = PRIORITY[sn.kind] * tol * 0.25 + d; // nearer wins, but an endpoint beats a midpoint at similar distance
    if (score < bestScore) { bestScore = score; best = sn; }
  };
  const near = geom.filter(g => cursor[0] >= g.box[0] - tol && cursor[0] <= g.box[2] + tol && cursor[1] >= g.box[1] - tol && cursor[1] <= g.box[3] + tol);
  for (const g of near) for (const sn of g.snaps) {
    if ((sn.kind === 'end' && o.end) || (sn.kind === 'mid' && o.mid) || ((sn.kind === 'center' || sn.kind === 'quad') && o.center) || sn.kind === 'node' || sn.kind === 'insert') consider(sn);
  }
  if (o.intersection) {
    const segs: Array<[P, P]> = [];
    for (const g of near) for (const path of g.paths) for (let i = 0; i + 1 < path.length && segs.length < 600; i++) {
      const a = path[i], b = path[i + 1];
      if (Math.min(a[0], b[0]) - tol <= cursor[0] && Math.max(a[0], b[0]) + tol >= cursor[0] && Math.min(a[1], b[1]) - tol <= cursor[1] && Math.max(a[1], b[1]) + tol >= cursor[1]) segs.push([a, b]);
    }
    for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) { const x = segIntersect(segs[i][0], segs[i][1], segs[j][0], segs[j][1]); if (x) consider({ p: x, kind: 'intersection' }); }
  }
  if (o.perpendicular && from && !best) {
    for (const g of near) for (const path of g.paths) for (let i = 0; i + 1 < path.length; i++) {
      const f = footOnSegment(from, path[i], path[i + 1]); if (f) consider({ p: f, kind: 'perp' });
    }
  }
  if (!best && o.grid && o.gridSize > 0) { const gs = o.gridSize; consider({ p: [Math.round(cursor[0] / gs) * gs, Math.round(cursor[1] / gs) * gs], kind: 'grid' }); }
  return best;
}

function footOnSegment(p: P, a: P, b: P): P | null {
  const dx = b[0] - a[0], dy = b[1] - a[1]; const l2 = dx * dx + dy * dy; if (l2 < 1e-18) return null;
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2; if (t < 0 || t > 1) return null;
  return [a[0] + t * dx, a[1] + t * dy];
}

/** Ortho: keep the larger of the two components relative to `from`. */
export function applyOrtho(p: P, from: P | null | undefined): P {
  if (!from) return p; return Math.abs(p[0] - from[0]) >= Math.abs(p[1] - from[1]) ? [p[0], from[1]] : [from[0], p[1]];
}

// ── Picking and selection ───────────────────────────────────────────────────

function distToSeg(p: P, a: P, b: P) {
  const dx = b[0] - a[0], dy = b[1] - a[1]; const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** Entity index nearest to `p` within `tol`, or -1. Topmost (last drawn) wins ties. */
export function pick(geom: EntityGeom[], p: P, tol: number, entities?: CadEntity2D[]): number {
  let best = -1, bd = tol;
  // A click anywhere inside a wall's thickness picks the wall.
  if (entities) entities.forEach((e, i) => { if (e.type !== 'wall') return; const d = distToSeg(p, xy(e.a), xy(e.b)); if (d <= e.thickness / 2 && d * 0.5 < bd) { bd = d * 0.5; best = i; } });
  for (const g of geom) {
    if (p[0] < g.box[0] - tol || p[0] > g.box[2] + tol || p[1] < g.box[1] - tol || p[1] > g.box[3] + tol) continue;
    g.paths.forEach((path, k) => {
      if (path.length === 1) { const d = Math.hypot(p[0] - path[0][0], p[1] - path[0][1]); if (d <= bd) { bd = d; best = g.index; } return; }
      const n = g.closed[k] ? path.length : path.length - 1;
      for (let i = 0; i < n; i++) { const d = distToSeg(p, path[i], path[(i + 1) % path.length]); if (d <= bd) { bd = d; best = g.index; } }
    });
    for (const t of g.texts) if (p[0] >= t.at[0] - tol && p[0] <= t.at[0] + t.w + tol && p[1] >= t.at[1] - tol && p[1] <= t.at[1] + t.h + tol) { const d = 0; if (d <= bd) { bd = d; best = g.index; } }
  }
  return best;
}

/** AutoCAD rules: dragging left-to-right is a window (fully inside); right-to-left is crossing (any touch). */
export function boxSelect(geom: EntityGeom[], a: P, b: P): number[] {
  const crossing = b[0] < a[0];
  const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
  const inside = (q: P) => q[0] >= x0 && q[0] <= x1 && q[1] >= y0 && q[1] <= y1;
  const out: number[] = [];
  for (const g of geom) {
    const all = [...g.paths.flat(), ...g.texts.map(t => t.at)];
    if (!crossing) { if (all.length && all.every(inside)) out.push(g.index); continue; }
    if (all.some(inside)) { out.push(g.index); continue; }
    // A segment passing through the box without a vertex inside it still crosses.
    const edges: Array<[P, P]> = [[[x0, y0], [x1, y0]], [[x1, y0], [x1, y1]], [[x1, y1], [x0, y1]], [[x0, y1], [x0, y0]]];
    if (g.paths.some(path => path.some((q, i) => i + 1 < path.length && edges.some(([e0, e1]) => segIntersect(q, path[i + 1], e0, e1))))) out.push(g.index);
  }
  return out;
}

// ── Edits (each returns a new model; the room keeps them for undo) ──────────

export function withEntities(m: CadModel, entities: CadEntity2D[]): CadModel {
  const next = { ...m, entities };
  const f = flatten2D(next); const b = paths2DBounds(f); next.bounds = f.paths.length || f.texts.length ? b : m.bounds;
  return next;
}
export const addEntities = (m: CadModel, ents: CadEntity2D[]) => withEntities(m, [...m.entities, ...ents]);
export const eraseEntities = (m: CadModel, idx: number[]) => { const s = new Set(idx); return withEntities(m, m.entities.filter((_, i) => !s.has(i))); };

export function translateEntity(e: CadEntity2D, dx: number, dy: number): CadEntity2D {
  const t = (v: Vec3): Vec3 => [v[0] + dx, v[1] + dy, v[2]];
  switch (e.type) {
    case 'line': return { ...e, a: t(e.a), b: t(e.b) };
    case 'polyline': return { ...e, points: e.points.map(t) };
    case 'circle': case 'arc': case 'ellipse': return { ...e, c: t(e.c) };
    case 'spline': return { ...e, points: e.points.map(t) };
    case 'text': case 'point': return { ...e, at: t(e.at) };
    case 'face': return { ...e, points: e.points.map(t) };
    case 'hatch': return { ...e, loops: e.loops.map(l => l.map(t)) };
    case 'insert': return { ...e, at: t(e.at) };
    case 'dimension': return { ...e, a: t(e.a), b: t(e.b), at: t(e.at) };
    case 'wall': return { ...e, a: t(e.a), b: t(e.b) };
    case 'room': return { ...e, at: t(e.at) };
  }
}

/** Move (copy=false) or copy (copy=true) entities by a displacement. Returns the model and the new selection. */
export function moveEntities(m: CadModel, idx: number[], dx: number, dy: number, copy = false): { model: CadModel; selection: number[] } {
  const s = new Set(idx);
  if (!copy) return { model: withEntities(m, m.entities.map((e, i) => s.has(i) ? translateEntity(e, dx, dy) : e)), selection: idx };
  const copies = idx.map(i => translateEntity(m.entities[i], dx, dy));
  return { model: withEntities(m, [...m.entities, ...copies]), selection: copies.map((_, k) => m.entities.length + k) };
}

export function setLayer(m: CadModel, idx: number[], layer: string): CadModel {
  const s = new Set(idx); return withEntities(m, m.entities.map((e, i) => s.has(i) ? { ...e, layer } : e));
}

/** Length of what is selected (lines, polylines with arcs, arcs, circles): the quick takeoff number. */
export function measureEntity(e: CadEntity2D): { length?: number; area?: number } {
  const plen = (pts: Vec3[], closed: boolean) => { let l = 0; for (let i = 0; i + 1 < pts.length; i++) l += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); if (closed && pts.length > 2) l += Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]); return l; };
  const parea = (pts: Vec3[]) => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a / 2); };
  switch (e.type) {
    case 'line': return { length: Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]) };
    case 'polyline': { const pts = bulgePoints(e.points, e.bulges, e.closed); return { length: plen(pts, e.closed), area: e.closed ? parea(pts) : undefined }; }
    case 'circle': return { length: 2 * Math.PI * e.r, area: Math.PI * e.r * e.r };
    case 'arc': { let sweep = e.end - e.start; while (sweep <= 0) sweep += 360; return { length: e.r * sweep * Math.PI / 180 }; }
    case 'wall': { const l = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]); return { length: l, area: l * e.thickness }; }
    default: return {};
  }
}

// ── Typed input ─────────────────────────────────────────────────────────────

/**
 * AutoCAD-style coordinates: "x,y" absolute, "@dx,dy" relative, "@d<angle" polar, or a bare
 * number = distance along the cursor direction from the last point (direct distance entry).
 */
export function parsePointInput(text: string, last: P | null, cursor: P | null): P | null {
  const t = text.trim().replace(/\s+/g, '');
  let m = /^(@)?(-?\d*\.?\d+(?:e-?\d+)?),(-?\d*\.?\d+(?:e-?\d+)?)$/i.exec(t);
  if (m) { const x = +m[2], y = +m[3]; return m[1] ? (last ? [last[0] + x, last[1] + y] : null) : [x, y]; }
  m = /^@(-?\d*\.?\d+)<(-?\d*\.?\d+)$/.exec(t);
  if (m && last) { const d = +m[1], a = +m[2] * Math.PI / 180; return [last[0] + d * Math.cos(a), last[1] + d * Math.sin(a)]; }
  m = /^(-?\d*\.?\d+)$/.exec(t);
  if (m && last && cursor) { const dx = cursor[0] - last[0], dy = cursor[1] - last[1]; const l = Math.hypot(dx, dy); if (l < 1e-12) return null; const d = +m[1]; return [last[0] + dx / l * d, last[1] + dy / l * d]; }
  return null;
}

export type DraftTool = 'select' | 'pan' | 'line' | 'polyline' | 'rect' | 'circle' | 'arc' | 'dimension' | 'text' | 'move' | 'copy' | 'measure' | 'rotate' | 'scale' | 'mirror' | 'offset' | 'insert' | 'wall' | 'trim' | 'extend' | 'fillet' | 'hatch' | 'roomtag';

/** The command aliases AutoCAD users type without thinking. */
export const COMMAND_ALIASES: Record<string, DraftTool | 'erase' | 'undo' | 'redo' | 'zoom' | 'escape'> = {
  L: 'line', LINE: 'line', PL: 'polyline', PLINE: 'polyline', REC: 'rect', RECTANG: 'rect', RECTANGLE: 'rect', C: 'circle', CIRCLE: 'circle', A: 'arc', ARC: 'arc',
  DIM: 'dimension', DLI: 'dimension', DAL: 'dimension', T: 'text', DT: 'text', TEXT: 'text', MT: 'text', M: 'move', MOVE: 'move', CO: 'copy', CP: 'copy', COPY: 'copy',
  E: 'erase', ERASE: 'erase', U: 'undo', UNDO: 'undo', REDO: 'redo', Z: 'zoom', ZE: 'zoom', ZOOM: 'zoom', DI: 'measure', DIST: 'measure', P: 'pan', PAN: 'pan', S: 'select', SELECT: 'select', RO: 'rotate', ROTATE: 'rotate', SC: 'scale', SCALE: 'scale', MI: 'mirror', MIRROR: 'mirror', O: 'offset', OFFSET: 'offset', W: 'wall', WALL: 'wall', TR: 'trim', TRIM: 'trim', EX: 'extend', EXTEND: 'extend', F: 'fillet', FILLET: 'fillet', H: 'hatch', HATCH: 'hatch', BH: 'hatch', RT: 'roomtag', ROOM: 'roomtag', ROOMTAG: 'roomtag',
};

/** Arc through a centre, a start point and an end point, counter-clockwise. */
export function arcFrom(center: P, start: P, end: P, layer: string): CadEntity2D {
  const r = Math.hypot(start[0] - center[0], start[1] - center[1]);
  const a0 = Math.atan2(start[1] - center[1], start[0] - center[0]) * 180 / Math.PI, a1 = Math.atan2(end[1] - center[1], end[0] - center[0]) * 180 / Math.PI;
  return { type: 'arc', layer, c: [center[0], center[1], 0], r, start: (a0 + 360) % 360, end: (a1 + 360) % 360 };
}

/** Sensible defaults from drawing size: text/dimension height and grid spacing. */
export function drawingScale(m: CadModel) {
  const w = Math.max(m.bounds.max[0] - m.bounds.min[0], m.bounds.max[1] - m.bounds.min[1], 1);
  const nice = (x: number) => { const p = 10 ** Math.floor(Math.log10(x)); const n = x / p; return (n < 2 ? 1 : n < 5 ? 2 : 5) * p; };
  return { textHeight: nice(w / 25), grid: nice(w / 40) };
}

// ── General transforms (rotate, scale, mirror): see transform.ts ────────────

/** Transform the selection in place, or (copy) add transformed copies; returns the new selection. */
export function transformEntities(m: CadModel, idx: number[], M: Affine, copy = false): { model: CadModel; selection: number[] } {
  const s = new Set(idx);
  if (!copy) return { model: withEntities(m, m.entities.map((e, i) => s.has(i) ? transformEntity(e, M) : e)), selection: idx };
  const copies = idx.map(i => transformEntity(m.entities[i], M));
  return { model: withEntities(m, [...m.entities, ...copies]), selection: copies.map((_, j) => m.entities.length + j) };
}

// ── Offset ──────────────────────────────────────────────────────────────────

function lineIntersect(p1: P, d1: P, p2: P, d2: P): P | null {
  const den = d1[0] * d2[1] - d1[1] * d2[0]; if (Math.abs(den) < 1e-12) return null;
  const t = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / den; return [p1[0] + t * d1[0], p1[1] + t * d1[1]];
}

function pointInPolygon(p: P, poly: P[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Offset a line, circle, arc or polyline by `dist` toward the side `side` is on. Polyline corners are mitred. */
export function offsetEntity(e: CadEntity2D, dist: number, side: P): CadEntity2D | null {
  switch (e.type) {
    case 'line': {
      const dx = e.b[0] - e.a[0], dy = e.b[1] - e.a[1]; const l = Math.hypot(dx, dy); if (!l) return null;
      const sgn = Math.sign(dx * (side[1] - e.a[1]) - dy * (side[0] - e.a[0])) || 1; const nx = -dy / l * dist * sgn, ny = dx / l * dist * sgn;
      return { ...e, a: [e.a[0] + nx, e.a[1] + ny, 0], b: [e.b[0] + nx, e.b[1] + ny, 0] };
    }
    case 'circle': case 'arc': {
      const out = Math.hypot(side[0] - e.c[0], side[1] - e.c[1]) > e.r; const r = e.r + (out ? dist : -dist);
      return r > 0 ? { ...e, r } : null;
    }
    case 'polyline': {
      const pts = (e.bulges?.some(Boolean) ? bulgePoints(e.points, e.bulges, e.closed) : e.points).map(xy);
      const clean = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 1e-9);
      if (e.closed && clean.length > 2 && Math.hypot(clean[0][0] - clean[clean.length - 1][0], clean[0][1] - clean[clean.length - 1][1]) < 1e-9) clean.pop();
      const n = clean.length; if (n < 2) return null;
      let sgn: number;
      if (e.closed && n > 2) {
        let area2 = 0; for (let i = 0; i < n; i++) { const p = clean[i], q = clean[(i + 1) % n]; area2 += p[0] * q[1] - q[0] * p[1]; }
        const inside = pointInPolygon(side, clean); sgn = (area2 > 0 ? 1 : -1) * (inside ? 1 : -1); // left of a CCW loop is inside
      } else {
        let best = 0, bd = Infinity;
        for (let i = 0; i + 1 < n; i++) {
          const a = clean[i], b = clean[i + 1]; const l2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 || 1;
          const t = Math.max(0, Math.min(1, ((side[0] - a[0]) * (b[0] - a[0]) + (side[1] - a[1]) * (b[1] - a[1])) / l2));
          const dd = Math.hypot(side[0] - a[0] - t * (b[0] - a[0]), side[1] - a[1] - t * (b[1] - a[1])); if (dd < bd) { bd = dd; best = i; }
        }
        const a = clean[best], b = clean[best + 1]; sgn = Math.sign((b[0] - a[0]) * (side[1] - a[1]) - (b[1] - a[1]) * (side[0] - a[0])) || 1;
      }
      const segs = n - (e.closed ? 0 : 1); const lines: Array<{ p: P; d: P }> = [];
      for (let i = 0; i < segs; i++) { const a = clean[i], b = clean[(i + 1) % n]; const dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy); lines.push({ p: [a[0] - dy / l * dist * sgn, a[1] + dx / l * dist * sgn], d: [dx, dy] }); }
      const out: P[] = [];
      for (let i = 0; i < n; i++) {
        if (!e.closed && i === 0) { out.push(lines[0].p); continue; }
        if (!e.closed && i === n - 1) { const Ln = lines[segs - 1]; out.push([Ln.p[0] + Ln.d[0], Ln.p[1] + Ln.d[1]]); continue; }
        const prev = lines[(i - 1 + segs) % segs], next = lines[i % segs];
        out.push(lineIntersect(prev.p, prev.d, next.p, next.d) ?? next.p);
      }
      return { ...e, points: out.map(p => [p[0], p[1], 0] as Vec3), bulges: undefined };
    }
    default: return null;
  }
}

/** Insert a block reference. */
export function insertBlock(m: CadModel, block: string, at: P, rotation: number, flip: boolean, layer: string): CadModel {
  return addEntities(m, [{ type: 'insert', layer, block, at: [at[0], at[1], 0], scale: [flip ? -1 : 1, 1, 1], rotation }]);
}

// ── Trim, extend, fillet (all other objects act as cutting edges / boundaries) ──

/** Every segment of every entity except `skip`, flattened (walls give their faces). */
function edgeSegments(m: CadModel, skip: number): Array<[P, P]> {
  const out: Array<[P, P]> = [];
  m.entities.forEach((e, i) => {
    if (i === skip) return;
    const f = flatten2D({ entities: [e], blocks: m.blocks, layers: m.layers });
    for (const p of f.paths) for (let k = 0; k + 1 < p.pts.length; k++) out.push([p.pts[k] as P, p.pts[k + 1] as P]);
    for (const p of f.paths) if (p.closed && p.pts.length > 2) out.push([p.pts[p.pts.length - 1] as P, p.pts[0] as P]);
  });
  return out;
}

/** Parameters t along a-b (unbounded) where it crosses the edges (within each edge). */
function crossings(a: P, b: P, edges: Array<[P, P]>, bounded: boolean): number[] {
  const out: number[] = []; const dx = b[0] - a[0], dy = b[1] - a[1];
  for (const [p, q] of edges) {
    const ex = q[0] - p[0], ey = q[1] - p[1]; const den = dx * ey - dy * ex; if (Math.abs(den) < 1e-12) continue;
    const t = ((p[0] - a[0]) * ey - (p[1] - a[1]) * ex) / den, u = ((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / den;
    if (u >= -1e-9 && u <= 1 + 1e-9 && (!bounded || (t > 1e-9 && t < 1 - 1e-9))) out.push(t);
  }
  return out.sort((x, y) => x - y);
}

/** Angles (degrees) where a circle crosses the edges. */
function circleCrossings(c: Vec3, r: number, edges: Array<[P, P]>): number[] {
  const out: number[] = [];
  for (const [p, q] of edges) {
    const dx = q[0] - p[0], dy = q[1] - p[1], fx = p[0] - c[0], fy = p[1] - c[1];
    const A = dx * dx + dy * dy, B = 2 * (fx * dx + fy * dy), C = fx * fx + fy * fy - r * r; const disc = B * B - 4 * A * C;
    if (A < 1e-18 || disc < 0) continue;
    for (const sg of [-1, 1]) { const t = (-B + sg * Math.sqrt(disc)) / (2 * A); if (t >= -1e-9 && t <= 1 + 1e-9) out.push(((Math.atan2(fy + t * dy, fx + t * dx) * 180 / Math.PI) + 360) % 360); }
  }
  return out;
}

/** Trim the part of entity `idx` between the cutting edges either side of `at`. Lines, circles and arcs. */
export function trimEntity(m: CadModel, idx: number, at: P): CadModel | null {
  const e = m.entities[idx]; const edges = edgeSegments(m, idx);
  if (e.type === 'line') {
    const a = xy(e.a), b = xy(e.b); const ts = crossings(a, b, edges, true); if (!ts.length) return null;
    const dx = b[0] - a[0], dy = b[1] - a[1]; const tc = ((at[0] - a[0]) * dx + (at[1] - a[1]) * dy) / (dx * dx + dy * dy || 1);
    const lo = [...ts].reverse().find(t => t < tc) ?? 0, hi = ts.find(t => t > tc) ?? 1;
    const pt = (t: number): Vec3 => [a[0] + dx * t, a[1] + dy * t, 0];
    const keep: CadEntity2D[] = [];
    if (lo > 1e-9) keep.push({ ...e, a: e.a, b: pt(lo) });
    if (hi < 1 - 1e-9) keep.push({ ...e, a: pt(hi), b: e.b });
    return withEntities(m, [...m.entities.slice(0, idx), ...keep, ...m.entities.slice(idx + 1)]);
  }
  if (e.type === 'circle' || e.type === 'arc') {
    const angs = circleCrossings(e.c, e.r, edges); const ac = ((Math.atan2(at[1] - e.c[1], at[0] - e.c[0]) * 180 / Math.PI) + 360) % 360;
    const inArc = (x: number) => { if (e.type === 'circle') return true; let s0 = e.start, s1 = e.end; while (s1 <= s0) s1 += 360; let xx = x; while (xx < s0) xx += 360; return xx > s0 + 1e-9 && xx < s1 - 1e-9; };
    const cuts = angs.filter(inArc); if (!cuts.length && e.type === 'circle') return null;
    if (e.type === 'circle') {
      if (cuts.length < 2) return null;
      // Remove the stretch containing the click: keep the arc from the next cut after it, round to the cut before it.
      const sorted = [...new Set(cuts.map(x => +x.toFixed(9)))].sort((x, y) => x - y);
      const before = [...sorted].reverse().find(x => x < ac) ?? sorted[sorted.length - 1]; const after = sorted.find(x => x > ac) ?? sorted[0];
      const arc: CadEntity2D = { type: 'arc', layer: e.layer, ...(e.color ? { color: e.color } : {}), c: e.c, r: e.r, start: after, end: before };
      return withEntities(m, [...m.entities.slice(0, idx), arc, ...m.entities.slice(idx + 1)]);
    }
    // Arc: measure everything from its start.
    const rel = (x: number) => { let d = x - e.start; while (d < 0) d += 360; return d; };
    let sweep = e.end - e.start; while (sweep <= 0) sweep += 360;
    const cr = cuts.map(rel).sort((x, y) => x - y); const cc = rel(ac); if (cc > sweep) return null;
    const lo = [...cr].reverse().find(x => x < cc) ?? 0, hi = cr.find(x => x > cc) ?? sweep;
    const keep: CadEntity2D[] = [];
    if (lo > 1e-9) keep.push({ ...e, start: e.start, end: (e.start + lo) % 360 });
    if (hi < sweep - 1e-9) keep.push({ ...e, start: (e.start + hi) % 360, end: e.end });
    return withEntities(m, [...m.entities.slice(0, idx), ...keep, ...m.entities.slice(idx + 1)]);
  }
  return null;
}

/** Extend the end of a line (or wall centreline) nearest `at` to the first boundary it meets. */
export function extendEntity(m: CadModel, idx: number, at: P): CadModel | null {
  const e = m.entities[idx]; if (e.type !== 'line' && e.type !== 'wall') return null;
  const a = xy(e.a), b = xy(e.b); const fromB = Math.hypot(at[0] - b[0], at[1] - b[1]) < Math.hypot(at[0] - a[0], at[1] - a[1]);
  const edges = edgeSegments(m, idx);
  // Walls extend their centreline to the boundary's far face if it is a wall: use all face segments, nearest wins.
  const ts = crossings(a, b, edges, false); const pick = fromB ? ts.find(t => t > 1 + 1e-9) : [...ts].reverse().find(t => t < -1e-9);
  if (pick === undefined) return null;
  const p: Vec3 = [a[0] + (b[0] - a[0]) * pick, a[1] + (b[1] - a[1]) * pick, 0];
  const next = fromB ? { ...e, b: p } : { ...e, a: p };
  return withEntities(m, m.entities.map((x, i) => i === idx ? next as CadEntity2D : x));
}

/**
 * Fillet two lines (or two walls) at radius r, keeping the parts on the sides that were picked.
 * r = 0 makes a sharp corner. Walls only take r = 0: their centrelines meet, and the corner mitres itself.
 */
export function filletEntities(m: CadModel, i1: number, p1: P, i2: number, p2: P, r: number): CadModel | null {
  const e1 = m.entities[i1], e2 = m.entities[i2]; if (i1 === i2) return null;
  const ok = (e: CadEntity2D) => e.type === 'line' || e.type === 'wall'; if (!ok(e1) || !ok(e2)) return null;
  const L1 = e1 as Extract<CadEntity2D, { a: Vec3; b: Vec3 }>, L2 = e2 as typeof L1;
  const a1 = xy(L1.a), b1 = xy(L1.b), a2 = xy(L2.a), b2 = xy(L2.b);
  const d1: P = [b1[0] - a1[0], b1[1] - a1[1]], d2: P = [b2[0] - a2[0], b2[1] - a2[1]];
  const den = d1[0] * d2[1] - d1[1] * d2[0]; if (Math.abs(den) < 1e-12) return null; // parallel
  const t = ((a2[0] - a1[0]) * d2[1] - (a2[1] - a1[1]) * d2[0]) / den; const X: P = [a1[0] + d1[0] * t, a1[1] + d1[1] * t];
  // Which end of each line goes to the corner: the one on the far side from the pick.
  const keepEnd = (a: P, b: P, pk: P): 'a' | 'b' => { const da = Math.hypot(pk[0] - a[0], pk[1] - a[1]), db = Math.hypot(pk[0] - b[0], pk[1] - b[1]); const sa = (a[0] - X[0]) * (pk[0] - X[0]) + (a[1] - X[1]) * (pk[1] - X[1]); const sb = (b[0] - X[0]) * (pk[0] - X[0]) + (b[1] - X[1]) * (pk[1] - X[1]); return sa > sb ? 'a' : sb > sa ? 'b' : da > db ? 'a' : 'b'; };
  const k1 = keepEnd(a1, b1, p1), k2 = keepEnd(a2, b2, p2);
  const far1 = k1 === 'a' ? a1 : b1, far2 = k2 === 'a' ? a2 : b2;
  const v1 = unit2([far1[0] - X[0], far1[1] - X[1]]), v2 = unit2([far2[0] - X[0], far2[1] - X[1]]);
  const setNear = (e: typeof L1, keep: 'a' | 'b', p: P) => (keep === 'a' ? { ...e, b: [p[0], p[1], 0] as Vec3 } : { ...e, a: [p[0], p[1], 0] as Vec3 }) as CadEntity2D;
  if (r <= 0 || e1.type === 'wall' || e2.type === 'wall') {
    return withEntities(m, m.entities.map((e, i) => i === i1 ? setNear(L1, k1, X) : i === i2 ? setNear(L2, k2, X) : e));
  }
  const cosA = v1[0] * v2[0] + v1[1] * v2[1]; const half = Math.acos(Math.max(-1, Math.min(1, cosA))) / 2; if (half < 1e-6 || half > Math.PI / 2 - 1e-6) return null;
  const dist = r / Math.tan(half); const T1: P = [X[0] + v1[0] * dist, X[1] + v1[1] * dist], T2: P = [X[0] + v2[0] * dist, X[1] + v2[1] * dist];
  const bis = unit2([v1[0] + v2[0], v1[1] + v2[1]]); const C: P = [X[0] + bis[0] * r / Math.sin(half), X[1] + bis[1] * r / Math.sin(half)];
  const a0 = Math.atan2(T1[1] - C[1], T1[0] - C[0]) * 180 / Math.PI, a3 = Math.atan2(T2[1] - C[1], T2[0] - C[0]) * 180 / Math.PI;
  let s0 = (a0 + 360) % 360, s1 = (a3 + 360) % 360; let sw = s1 - s0; while (sw < 0) sw += 360; if (sw > 180) { const tmp = s0; s0 = s1; s1 = tmp; }
  const arc: CadEntity2D = { type: 'arc', layer: L1.layer, c: [C[0], C[1], 0], r, start: s0, end: s1 };
  return withEntities(m, [...m.entities.map((e, i) => i === i1 ? setNear(L1, k1, T1) : i === i2 ? setNear(L2, k2, T2) : e), arc]);
}

const unit2 = (v: P): P => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };

/** The smallest closed boundary (closed polyline, circle, closed path of a block) around p, for hatching. */
export function boundaryAt(m: CadModel, p: P, hiddenLayers?: Set<string>): Vec3[][] | null {
  const f = flatten2D(m, { hiddenLayers }); let best: Array<[number, number]> | null = null; let bestArea = Infinity;
  const area = (pts: Array<[number, number]>) => { let s = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s / 2); };
  const inside = (pt: P, poly: Array<[number, number]>) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c; } return c; };
  for (const path of f.paths) {
    if (!path.closed || path.fill || path.pts.length < 3) continue;
    if (!inside(p, path.pts)) continue; const a = area(path.pts); if (a < bestArea) { bestArea = a; best = path.pts; }
  }
  return best ? [best.map(([x, y]) => [x, y, 0] as Vec3)] : null;
}

/** New walls along a chain of points (each segment its own wall, so corners join). */
export function wallsFrom(points: P[], thickness: number, height: number, layer: string, unitsPerMm: number, closed = false): CadEntity2D[] {
  const out: CadEntity2D[] = []; const n = points.length; const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) { const a = points[i], b = points[(i + 1) % n]; if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-9) continue; out.push({ type: 'wall', layer, a: [a[0], a[1], 0], b: [b[0], b[1], 0], thickness, height, openings: [], unitsPerMm }); }
  return out;
}
