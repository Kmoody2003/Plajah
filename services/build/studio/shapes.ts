// Build Studio 3D: the scene model (shapes on a workplane, solids and holes, groups), our own
// primitive generators, evaluation to printable solids with csg.ts, alignment, and print checks.
// Millimetres, Z up; a shape's `pos` is the centre of its box, `rot` is degrees about X, Y, Z
// (three.js 'XYZ' Euler order, so the viewport and the export always agree).

import { type Poly, type Solid, type V3, poly, transform, union, subtract, overlaps, boundsOf, volume, toMesh } from './csg';
import { textGrid, FONT_ROWS } from './pixelFont';

export type ShapeKind = 'box' | 'cylinder' | 'sphere' | 'cone' | 'torus' | 'wedge' | 'pyramid' | 'text' | 'star' | 'heart' | 'group';
export interface Shape {
  id: string; kind: ShapeKind; name: string;
  size: V3; pos: V3; rot: V3;
  hole: boolean; color: string;
  /** Mirror along the shape's own axes. */
  flip?: [boolean, boolean, boolean];
  /** Round shapes: number of sides (smoothness). */
  sides?: number;
  /** Text shapes. */
  text?: string;
  /** Cone top as a fraction of the base (0 = point). Torus: tube thickness in mm is size[2]. */
  top?: number;
  /** Groups: members, in world coordinates. */
  children?: Shape[];
}
export interface Scene { shapes: Shape[]; grid: number; units: 'mm' }

export const SHAPE_INFO: Record<Exclude<ShapeKind, 'group'>, { label: string; size: V3; color: string; about: string }> = {
  box: { label: 'Box', size: [20, 20, 20], color: '#e8590c', about: 'A block. Make it thin for plates and bases.' },
  cylinder: { label: 'Cylinder', size: [20, 20, 20], color: '#1c7ed6', about: 'Round post or disc. As a hole it drills.' },
  sphere: { label: 'Ball', size: [20, 20, 20], color: '#2f9e44', about: 'A ball. Stretch it for an egg.' },
  cone: { label: 'Cone', size: [20, 20, 20], color: '#f08c00', about: 'Point on top. Set Top above 0 for a flat top.' },
  torus: { label: 'Ring', size: [24, 24, 5], color: '#ae3ec9', about: 'A donut ring. Height is how thick the ring is.' },
  wedge: { label: 'Ramp', size: [20, 20, 20], color: '#0ca678', about: 'A slope: good for stands and ramps.' },
  pyramid: { label: 'Pyramid', size: [20, 20, 20], color: '#f59f00', about: 'Square base to a point.' },
  text: { label: 'Letters', size: [44, 10, 3], color: '#d6336c', about: 'Blocky letters that print cleanly.' },
  star: { label: 'Star', size: [24, 24, 4], color: '#fab005', about: 'Five-point star.' },
  heart: { label: 'Heart', size: [24, 22, 4], color: '#e03131', about: 'A heart.' },
};
export const HOLE_COLOR = '#9aa4b2';

let seq = 0;
export const newId = () => `s${Date.now().toString(36)}${(seq++).toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

/** A new shape resting on the workplane at (x, y). */
export function makeShape(kind: Exclude<ShapeKind, 'group'>, at: [number, number] = [0, 0], over: Partial<Shape> = {}): Shape {
  const info = SHAPE_INFO[kind]; const size = (over.size ?? info.size).slice() as V3;
  return { id: newId(), kind, name: info.label, size, pos: [at[0], at[1], size[2] / 2], rot: [0, 0, 0], hole: false, color: info.color, ...(kind === 'text' ? { text: 'PLAJAH' } : {}), ...(kind === 'cylinder' || kind === 'cone' || kind === 'sphere' || kind === 'torus' ? { sides: 32 } : {}), ...over };
}

// ---------------------------------------------------------------- primitives (centred at origin)

const P = (pts: V3[], out: Poly[]) => { const p = poly(pts); if (p) out.push(p); };
function box([x, y, z]: V3): Solid {
  const a = x / 2, b = y / 2, c = z / 2; const o: Poly[] = [];
  P([[-a, -b, -c], [-a, b, -c], [a, b, -c], [a, -b, -c]], o); P([[-a, -b, c], [a, -b, c], [a, b, c], [-a, b, c]], o);
  P([[-a, -b, -c], [a, -b, -c], [a, -b, c], [-a, -b, c]], o); P([[-a, b, -c], [-a, b, c], [a, b, c], [a, b, -c]], o);
  P([[-a, -b, -c], [-a, -b, c], [-a, b, c], [-a, b, -c]], o); P([[a, -b, -c], [a, b, -c], [a, b, c], [a, -b, c]], o);
  return o;
}
/** Prism or frustum between an N-gon at the bottom (scale 1) and the top (scale `top`). */
function lathe(size: V3, n: number, top: number): Solid {
  const rx = size[0] / 2, ry = size[1] / 2, h = size[2] / 2; const o: Poly[] = [];
  const ring = (s: number, z: number) => Array.from({ length: n }, (_, i) => { const t = (i / n) * Math.PI * 2; return [Math.cos(t) * rx * s, Math.sin(t) * ry * s, z] as V3; });
  const bot = ring(1, -h); P([...bot].reverse(), o);
  if (top <= 1e-6) { const apex: V3 = [0, 0, h]; for (let i = 0; i < n; i++) P([bot[i], bot[(i + 1) % n], apex], o); return o; }
  const tp = ring(top, h); P(tp, o);
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; P([bot[i], bot[j], tp[j], tp[i]], o); }
  return o;
}
function sphere(size: V3, n: number): Solid {
  const rings = Math.max(4, Math.round(n / 2)); const o: Poly[] = [];
  const pt = (i: number, j: number): V3 => { const th = (j / rings) * Math.PI, ph = (i / n) * Math.PI * 2; return [Math.sin(th) * Math.cos(ph) * size[0] / 2, Math.sin(th) * Math.sin(ph) * size[1] / 2, Math.cos(th) * size[2] / 2]; };
  for (let j = 0; j < rings; j++) for (let i = 0; i < n; i++) {
    const a = pt(i, j), b = pt(i + 1, j), c = pt(i + 1, j + 1), d = pt(i, j + 1);
    if (j > 0) P([a, d, b], o); if (j < rings - 1) P([b, d, c], o);
  }
  return o;
}
function torus(size: V3, n: number): Solid {
  const r = size[2] / 2; const Rx = Math.max(r * 1.05, size[0] / 2 - r), Ry = Math.max(r * 1.05, size[1] / 2 - r); const m = Math.max(8, Math.round(n / 2)); const o: Poly[] = [];
  const pt = (i: number, j: number): V3 => { const u = (i / n) * Math.PI * 2, v = (j / m) * Math.PI * 2; return [(Rx + r * Math.cos(v)) * Math.cos(u), (Ry + r * Math.cos(v)) * Math.sin(u), r * Math.sin(v)]; };
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { const a = pt(i, j), b = pt(i + 1, j), c = pt(i + 1, j + 1), d = pt(i, j + 1); P([a, b, c], o); P([a, c, d], o); }
  return o;
}
function wedge([x, y, z]: V3): Solid {
  const a = x / 2, b = y / 2, c = z / 2; const o: Poly[] = [];
  P([[-a, -b, -c], [-a, b, -c], [a, b, -c], [a, -b, -c]], o); // bottom
  P([[-a, -b, -c], [-a, -b, c], [-a, b, c], [-a, b, -c]], o); // tall back (-x)
  P([[-a, -b, c], [a, -b, -c], [a, b, -c], [-a, b, c]], o); // slope
  P([[-a, -b, -c], [a, -b, -c], [-a, -b, c]], o); P([[-a, b, -c], [-a, b, c], [a, b, -c]], o); // sides
  return o;
}
function pyramid([x, y, z]: V3): Solid {
  const a = x / 2, b = y / 2, c = z / 2; const apex: V3 = [0, 0, c]; const o: Poly[] = [];
  const base: V3[] = [[-a, -b, -c], [a, -b, -c], [a, b, -c], [-a, b, -c]]; P([...base].reverse(), o);
  for (let i = 0; i < 4; i++) P([base[i], base[(i + 1) % 4], apex], o);
  return o;
}

type P2 = [number, number];
const area2 = (pts: P2[]) => { let s = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
/** Ear clipping for a simple polygon (counter-clockwise). */
export function triangulate(pts: P2[]): Array<[number, number, number]> {
  const idx = pts.map((_, i) => i); const out: Array<[number, number, number]> = [];
  const crossZ = (a: P2, b: P2, c: P2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inside = (p: P2, a: P2, b: P2, c: P2) => crossZ(a, b, p) >= -1e-12 && crossZ(b, c, p) >= -1e-12 && crossZ(c, a, p) >= -1e-12;
  let guard = 0;
  while (idx.length > 3 && guard++ < 10000) {
    let cut = false;
    for (let k = 0; k < idx.length; k++) {
      const i0 = idx[(k + idx.length - 1) % idx.length], i1 = idx[k], i2 = idx[(k + 1) % idx.length]; const a = pts[i0], b = pts[i1], c = pts[i2];
      if (crossZ(a, b, c) <= 1e-12) continue;
      if (idx.some(j => j !== i0 && j !== i1 && j !== i2 && inside(pts[j], a, b, c))) continue;
      out.push([i0, i1, i2]); idx.splice(k, 1); cut = true; break;
    }
    if (!cut) break;
  }
  if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
  return out;
}
/** Extrude a simple outline (any winding) to height h, centred on z = 0. */
export function extrude(outline: P2[], h: number): Solid {
  const pts = area2(outline) < 0 ? [...outline].reverse() : outline; const c = h / 2; const o: Poly[] = [];
  for (const [a, b, d] of triangulate(pts)) { P([[pts[a][0], pts[a][1], c], [pts[b][0], pts[b][1], c], [pts[d][0], pts[d][1], c]], o); P([[pts[d][0], pts[d][1], -c], [pts[b][0], pts[b][1], -c], [pts[a][0], pts[a][1], -c]], o); }
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; P([[a[0], a[1], -c], [b[0], b[1], -c], [b[0], b[1], c], [a[0], a[1], c]], o); }
  return o;
}
const fit = (pts: P2[], w: number, h: number): P2[] => { let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return pts.map(([x, y]) => [((x - x0) / (x1 - x0) - 0.5) * w, ((y - y0) / (y1 - y0) - 0.5) * h]); };
export const starOutline = (points = 5, inner = 0.45): P2[] => Array.from({ length: points * 2 }, (_, i) => { const r = i % 2 ? inner : 1, t = Math.PI / 2 + (i * Math.PI) / points; return [Math.cos(t) * r, Math.sin(t) * r]; });
export const heartOutline = (n = 48): P2[] => Array.from({ length: n }, (_, i) => { const t = (i / n) * Math.PI * 2; return [16 * Math.sin(t) ** 3, 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)]; });

/** Pixel lettering: run rectangles on the caps, unit edges on the walls (a closed, printable solid). */
function text(size: V3, s: string): Solid {
  const g = textGrid(s); const rows = FONT_ROWS, cols = g[0].length; const cw = size[0] / cols, ch = size[1] / rows, c = size[2] / 2; const o: Poly[] = [];
  const X = (i: number) => -size[0] / 2 + i * cw, Y = (r: number) => size[1] / 2 - r * ch; // row 0 at the top
  const on = (r: number, i: number) => r >= 0 && r < rows && i >= 0 && i < cols && g[r][i];
  for (let r = 0; r < rows; r++) {
    let i = 0;
    while (i < cols) {
      if (!g[r][i]) { i++; continue; } let j = i; while (j < cols && g[r][j]) j++;
      const x0 = X(i), x1 = X(j), y0 = Y(r + 1), y1 = Y(r);
      P([[x0, y0, c], [x1, y0, c], [x1, y1, c], [x0, y1, c]], o); P([[x0, y0, -c], [x0, y1, -c], [x1, y1, -c], [x1, y0, -c]], o);
      i = j;
    }
    for (let k = 0; k < cols; k++) {
      if (!g[r][k]) continue; const x0 = X(k), x1 = X(k + 1), y0 = Y(r + 1), y1 = Y(r);
      if (!on(r - 1, k)) P([[x1, y1, -c], [x0, y1, -c], [x0, y1, c], [x1, y1, c]], o); // top edge, faces +y
      if (!on(r + 1, k)) P([[x0, y0, -c], [x1, y0, -c], [x1, y0, c], [x0, y0, c]], o); // bottom edge, faces -y
      if (!on(r, k - 1)) P([[x0, y1, -c], [x0, y0, -c], [x0, y0, c], [x0, y1, c]], o); // left, faces -x
      if (!on(r, k + 1)) P([[x1, y0, -c], [x1, y1, -c], [x1, y1, c], [x1, y0, c]], o); // right, faces +x
    }
  }
  return o;
}

export function primitive(s: Shape): Solid {
  const n = Math.max(6, Math.min(96, Math.round(s.sides ?? 32))); const sz = s.size.map(v => Math.max(0.05, v)) as V3;
  switch (s.kind) {
    case 'box': return box(sz);
    case 'cylinder': return lathe(sz, n, 1);
    case 'cone': return lathe(sz, n, Math.max(0, Math.min(1, s.top ?? 0)));
    case 'sphere': return sphere(sz, n);
    case 'torus': return torus(sz, n);
    case 'wedge': return wedge(sz);
    case 'pyramid': return pyramid(sz);
    case 'star': return extrude(fit(starOutline(), sz[0], sz[1]), sz[2]);
    case 'heart': return extrude(fit(heartOutline(), sz[0], sz[1]), sz[2]);
    case 'text': return text(sz, s.text ?? '');
    default: return [];
  }
}

// ---------------------------------------------------------------- transforms

/** Column-major 4x4: translate(pos) · Rx·Ry·Rz (three.js XYZ order) · mirror. */
export function matrixOf(s: Pick<Shape, 'pos' | 'rot' | 'flip'>): number[] {
  const [ax, ay, az] = s.rot.map(d => (d * Math.PI) / 180); const a = Math.cos(ax), b = Math.sin(ax), c = Math.cos(ay), d = Math.sin(ay), e = Math.cos(az), f = Math.sin(az);
  const ae = a * e, af = a * f, be = b * e, bf = b * f;
  // three.js Matrix4.makeRotationFromEuler, order XYZ.
  const r = [c * e, af + be * d, bf - ae * d, -c * f, ae - bf * d, be + af * d, d, -b * c, a * c];
  const fx = s.flip?.[0] ? -1 : 1, fy = s.flip?.[1] ? -1 : 1, fz = s.flip?.[2] ? -1 : 1;
  return [r[0] * fx, r[1] * fx, r[2] * fx, 0, r[3] * fy, r[4] * fy, r[5] * fy, 0, r[6] * fz, r[7] * fz, r[8] * fz, 0, s.pos[0], s.pos[1], s.pos[2], 1];
}

/** World-space solid of one shape or group (holes in a group are cut from its solids). */
export function solidOf(s: Shape): Solid {
  if (s.kind === 'group') {
    const kids = s.children ?? []; let body: Solid = []; let cut: Solid = [];
    for (const k of kids) { const so = solidOf(k); if (k.hole) cut = cut.length && overlaps(cut, so) ? union(cut, so) : [...cut, ...so]; else body = body.length && overlaps(body, so) ? union(body, so) : [...body, ...so]; }
    return cut.length && body.length && overlaps(body, cut) ? subtract(body, cut) : body;
  }
  return transform(primitive(s), matrixOf(s));
}

/** World box of a shape (cheap: transformed local box corners, or children for groups). */
export function shapeBounds(s: Shape): { min: V3; max: V3 } {
  if (s.kind === 'group') {
    const min: V3 = [Infinity, Infinity, Infinity], max: V3 = [-Infinity, -Infinity, -Infinity];
    // A group's box is its solid result: holes only cut, so they do not make it bigger.
    const kids = s.children ?? []; const solids = kids.filter(k => !k.hole);
    for (const k of solids.length ? solids : kids) { const b = shapeBounds(k); for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], b.min[i]); max[i] = Math.max(max[i], b.max[i]); } }
    return min[0] === Infinity ? { min: [0, 0, 0], max: [0, 0, 0] } : { min, max };
  }
  const m = matrixOf(s); const h = s.size.map(v => v / 2); const min: V3 = [Infinity, Infinity, Infinity], max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * h[0], y = sy * h[1], z = sz * h[2]; const p = [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
    for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], p[i]); max[i] = Math.max(max[i], p[i]); }
  }
  return { min, max };
}

/** Move a shape (and a group's members) by d. */
export function translate(s: Shape, d: V3): Shape {
  const pos: V3 = [s.pos[0] + d[0], s.pos[1] + d[1], s.pos[2] + d[2]];
  return s.kind === 'group' ? { ...s, pos, children: (s.children ?? []).map(k => translate(k, d)) } : { ...s, pos };
}
/** Group the shapes: the group sits at their combined centre. Groups keep their members' colours unless every member is a hole. */
export function groupShapes(shapes: Shape[]): Shape {
  const g: Shape = { id: newId(), kind: 'group', name: 'Group', size: [0, 0, 0], pos: [0, 0, 0], rot: [0, 0, 0], hole: false, color: shapes.find(s => !s.hole)?.color ?? '#868e96', children: shapes };
  return refreshGroup(g);
}
export function refreshGroup(g: Shape): Shape {
  const b = shapeBounds(g); return { ...g, size: [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]], pos: [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2] };
}
export const ungroup = (g: Shape): Shape[] => g.children ?? [];

/** Rotate a group about its centre: members orbit and turn with it (rotation about one world axis). */
export function rotateGroup(g: Shape, axis: 0 | 1 | 2, deg: number): Shape {
  const c = g.pos; const t = (deg * Math.PI) / 180, co = Math.cos(t), si = Math.sin(t);
  const turn = (s: Shape): Shape => {
    const p = [s.pos[0] - c[0], s.pos[1] - c[1], s.pos[2] - c[2]]; const [i, j] = axis === 0 ? [1, 2] : axis === 1 ? [2, 0] : [0, 1];
    const q = p.slice(); q[i] = p[i] * co - p[j] * si; q[j] = p[i] * si + p[j] * co;
    const rot = s.rot.slice() as V3; rot[axis] = ((rot[axis] + deg + 540) % 360) - 180; // exact for single-axis turns of unrotated members
    const pos: V3 = [q[0] + c[0], q[1] + c[1], q[2] + c[2]];
    return s.kind === 'group' ? { ...s, pos, children: (s.children ?? []).map(turn) } : { ...s, pos, rot };
  };
  return refreshGroup({ ...g, children: (g.children ?? []).map(turn) });
}
/** Resize a group to a new box: members scale about the group's centre. */
export function scaleGroup(g: Shape, size: V3): Shape {
  const k = size.map((v, i) => (g.size[i] > 1e-6 ? Math.max(0.05, v) / g.size[i] : 1)) as V3; const c = g.pos;
  const sc = (s: Shape): Shape => {
    const pos = s.pos.map((p, i) => c[i] + (p - c[i]) * k[i]) as V3;
    if (s.kind === 'group') return { ...s, pos, children: (s.children ?? []).map(sc) };
    // Members turned a quarter about Z swap their X/Y stretch.
    const q = Math.round((((s.rot[2] % 180) + 180) % 180) / 90) % 2 === 1 && !s.rot[0] && !s.rot[1];
    const ks: V3 = q ? [k[1], k[0], k[2]] : k; return { ...s, pos, size: s.size.map((v, i) => v * ks[i]) as V3 };
  };
  return refreshGroup({ ...g, children: (g.children ?? []).map(sc) });
}

export type AlignMode = 'min' | 'mid' | 'max';
/** Line shapes up on one axis against the selection's combined box. */
export function align(shapes: Shape[], axis: 0 | 1 | 2, mode: AlignMode): Shape[] {
  if (shapes.length < 2) return shapes; const bs = shapes.map(shapeBounds);
  const lo = Math.min(...bs.map(b => b.min[axis])), hi = Math.max(...bs.map(b => b.max[axis]));
  return shapes.map((s, i) => { const b = bs[i]; const target = mode === 'min' ? lo - b.min[axis] : mode === 'max' ? hi - b.max[axis] : (lo + hi) / 2 - (b.min[axis] + b.max[axis]) / 2; const d: V3 = [0, 0, 0]; d[axis] = target; return translate(s, d); });
}
/** Mirror a shape along a world axis through its own centre. */
export function mirror(s: Shape, axis: 0 | 1 | 2): Shape {
  if (s.kind === 'group') { const c = s.pos; const m = (k: Shape): Shape => { const pos = k.pos.slice() as V3; pos[axis] = 2 * c[axis] - pos[axis]; const r = mirror({ ...k, pos }, axis); return r; }; return refreshGroup({ ...s, children: (s.children ?? []).map(m) }); }
  const f = (s.flip ?? [false, false, false]).slice() as [boolean, boolean, boolean]; f[axis] = !f[axis];
  // For a rotated shape, mirroring in the world equals flipping the local axis and negating the other rotations.
  const rot = s.rot.map((r, i) => (i === axis ? r : -r)) as V3;
  return { ...s, flip: f, rot };
}
/** Put a shape back on the workplane. */
export const dropToPlane = (s: Shape): Shape => translate(s, [0, 0, -shapeBounds(s).min[2]]);
export const snap = (v: number, grid: number) => (grid > 0 ? Math.round(v / grid) * grid : v);

// ---------------------------------------------------------------- export and print checks

export interface Body { name: string; solid: Solid; color: string }
/** Printable bodies: every top-level solid (or group). Ungrouped holes cut nothing and are skipped. */
export function bodies(scene: Scene): Body[] {
  return scene.shapes.filter(s => !s.hole).map(s => ({ name: s.name, solid: solidOf(s), color: s.color }));
}
export function meshes(scene: Scene, dropToBed = true): Array<{ name: string; positions: Float32Array; indices: Uint32Array }> {
  const bs = bodies(scene); let zMin = Infinity; for (const b of bs) zMin = Math.min(zMin, boundsOf(b.solid).min[2]);
  const dz = dropToBed && Number.isFinite(zMin) ? -zMin : 0;
  return bs.map(b => { const m = toMesh(b.solid); if (dz) for (let i = 2; i < m.positions.length; i += 3) m.positions[i] += dz; return { name: b.name, ...m }; });
}

export interface Printer { id: string; name: string; bed: V3 }
export const PRINTERS: Printer[] = [
  { id: 'mini', name: 'Small printer (180 mm)', bed: [180, 180, 180] },
  { id: 'std', name: 'Standard printer (220 × 220 × 250)', bed: [220, 220, 250] },
  { id: 'large', name: 'Large printer (256 mm)', bed: [256, 256, 256] },
];
export type Audience = 'under3' | 'kids' | 'teens' | 'adults';
export interface PrintFinding { level: 'error' | 'warn' | 'info'; id: string; text: string }
export interface PrintReport { size: V3; volume: number; grams: number; minutes: number; findings: PrintFinding[] }

/** Size, material and the problems a beginner would hit when printing this scene. */
export function printReport(scene: Scene, printer: Printer = PRINTERS[1], audience: Audience = 'kids'): PrintReport {
  const bs = bodies(scene); const f: PrintFinding[] = [];
  if (!bs.length) return { size: [0, 0, 0], volume: 0, grams: 0, minutes: 0, findings: [{ level: 'info', id: 'empty', text: 'Add a solid shape to print.' }] };
  const all = bs.flatMap(b => b.solid); const bb = boundsOf(all); const size = bb.max.map((v, i) => v - bb.min[i]) as V3;
  const vol = bs.reduce((s, b) => s + Math.abs(volume(b.solid)), 0);
  if (size[0] > printer.bed[0] || size[1] > printer.bed[1] || size[2] > printer.bed[2]) f.push({ level: 'error', id: 'too-big', text: `Too big for the ${printer.name}: ${size.map(v => v.toFixed(0)).join(' × ')} mm. Shrink it or split it into parts.` });
  if (bb.min[2] > 0.05) f.push({ level: 'info', id: 'floating', text: `Everything floats ${bb.min[2].toFixed(1)} mm above the workplane; the export drops it onto the bed.` });
  if (bb.min[2] < -0.05) f.push({ level: 'warn', id: 'below', text: 'Part of the design is below the workplane. The export lifts it so the lowest point sits on the bed.' });
  const flat = (s: Shape): Shape[] => (s.kind === 'group' ? (s.children ?? []).flatMap(flat) : [s]);
  const thin = scene.shapes.filter(s => !s.hole).flatMap(flat).filter(s => !s.hole && Math.min(...s.size) < 0.8);
  if (thin.length) f.push({ level: 'warn', id: 'thin', text: `${thin.map(s => s.name).join(', ')} ${thin.length > 1 ? 'are' : 'is'} thinner than 0.8 mm: too thin to print with a 0.4 mm nozzle.` });
  const looseHoles = scene.shapes.filter(s => s.hole);
  if (looseHoles.length) f.push({ level: 'warn', id: 'loose-hole', text: `${looseHoles.length} hole${looseHoles.length > 1 ? 's are' : ' is'} not grouped, so ${looseHoles.length > 1 ? 'they cut' : 'it cuts'} nothing. Select the hole and the solid, then Group.` });
  // Bodies resting on the plate: anything starting well above the lowest point needs support.
  // A body resting on another body (touching or overlapping below it) is supported.
  const boxes = bs.map(b => boundsOf(b.solid));
  bs.forEach((b, i) => {
    const x = boxes[i]; const z = x.min[2]; if (z - bb.min[2] <= 1) return;
    const rests = boxes.some((o, j) => j !== i && o.min[2] < z - 1e-6 && o.max[2] >= z - 0.05 && o.min[0] < x.max[0] && o.max[0] > x.min[0] && o.min[1] < x.max[1] && o.max[1] > x.min[1]);
    if (!rests) f.push({ level: 'warn', id: `overhang-${b.name}`, text: `${b.name} starts ${(z - bb.min[2]).toFixed(1)} mm up: it will print in mid-air unless it sits on something. Turn on supports or lower it.` });
  });
  if (size[2] > 4 * Math.min(size[0], size[1]) && size[2] > 30) f.push({ level: 'info', id: 'tippy', text: 'Tall and narrow: it may wobble while printing. A wider base or a brim helps.' });
  // Small-parts check (16 CFR 1501 cylinder: 31.7 mm wide, 57.1 mm deep).
  const small = bs.filter(b => { const x = boundsOf(b.solid); const d = x.max.map((v, i) => v - x.min[i]).sort((p, q) => p - q); return d[1] <= 31.7 && d[2] <= 57.1; });
  if (small.length && audience === 'under3') f.push({ level: 'error', id: 'small-parts', text: `Choking hazard: ${small.map(b => b.name).join(', ')} would fit in a small-parts test cylinder. Do not give it to children under 3; make it bigger than 32 × 57 mm.` });
  else if (small.length && audience === 'kids') f.push({ level: 'warn', id: 'small-parts', text: 'Small part: keep it away from children under 3 (choking hazard).' });
  if (vol < 1) f.push({ level: 'warn', id: 'tiny', text: 'This is very small; check the sizes are in millimetres.' });
  // PLA at 1.24 g/cm³; a typical 15–20 % infill print weighs about 40 % of a solid one. Roughly 12 g per hour on a standard printer.
  const grams = (vol / 1000) * 1.24 * 0.4; const minutes = Math.max(5, Math.round((grams / 12) * 60));
  return { size, volume: vol, grams, minutes, findings: f };
}
