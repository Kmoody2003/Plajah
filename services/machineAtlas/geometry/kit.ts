// Procedural geometry kit: shared helpers. Pure three.js BufferGeometry, no GLB, no DOM.
// CONVENTION: wheel/rotor axis = +Z, outboard = +Z, 1 unit ~ 125 mm (rotor outer radius 1.2). Every generator returns a
// single merged, NON-indexed geometry with `position`, `normal` and a baked `color` attribute (material uses vertexColors).
import {
  BufferAttribute, BufferGeometry, CatmullRomCurve3, Color, CylinderGeometry, ExtrudeGeometry, Matrix4, Path, Quaternion,
  Shape, TorusGeometry, TubeGeometry, Vector3, Euler, BoxGeometry, SphereGeometry, LatheGeometry, Vector2,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type V3 = [number, number, number];
export interface Xf { p?: V3; r?: V3; s?: V3 }

export function paint(g: BufferGeometry, hex: string): BufferGeometry {
  const c = new Color(hex); const n = g.attributes.position.count; const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new BufferAttribute(a, 3)); return g;
}

const _m = new Matrix4(), _q = new Quaternion(), _e = new Euler(), _p = new Vector3(), _s = new Vector3();
export function xf(g: BufferGeometry, t: Xf): BufferGeometry {
  _e.set(...(t.r || [0, 0, 0])); _q.setFromEuler(_e);
  _p.set(...(t.p || [0, 0, 0])); _s.set(...(t.s || [1, 1, 1]));
  _m.compose(_p, _q, _s); g.applyMatrix4(_m); return g;
}

/** Cylinder along +Z (three's default is +Y). */
export const cylZ = (r: number, h: number, color: string, at: V3 = [0, 0, 0], seg = 20, rTop = r): BufferGeometry =>
  paint(xf(new CylinderGeometry(rTop, r, h, seg, 1), { r: [Math.PI / 2, 0, 0], p: at }), color);
/** Cylinder along an arbitrary axis given by Euler rotation of the default +Y cylinder. */
export const cyl = (r: number, h: number, color: string, t: Xf = {}, seg = 16, rTop = r): BufferGeometry =>
  paint(xf(new CylinderGeometry(rTop, r, h, seg, 1), t), color);
export const box = (w: number, h: number, d: number, color: string, at: V3 = [0, 0, 0], r: V3 = [0, 0, 0]): BufferGeometry =>
  paint(xf(new BoxGeometry(w, h, d), { p: at, r }), color);
export const ball = (r: number, color: string, at: V3 = [0, 0, 0]): BufferGeometry =>
  paint(xf(new SphereGeometry(r, 12, 8), { p: at }), color);

/** Hex-head bolt/nut standing along +Y by default. */
export const hex = (r: number, h: number, color: string, t: Xf = {}): BufferGeometry =>
  paint(xf(new CylinderGeometry(r, r, h, 6, 1), t), color);

/** Annular ring (axis Z) with optional bolt holes, extruded from z0 to z0+depth. */
export function ring(rOut: number, rIn: number, depth: number, z0: number, color: string, holes?: { n: number; at: number; r: number }, seg = 40): BufferGeometry {
  const s = new Shape(); s.absarc(0, 0, rOut, 0, Math.PI * 2, false);
  const h = new Path(); h.absarc(0, 0, rIn, 0, Math.PI * 2, true); s.holes.push(h);
  if (holes) for (let i = 0; i < holes.n; i++) {
    const a = (i / holes.n) * Math.PI * 2, c = new Path(); c.absarc(Math.cos(a) * holes.at, Math.sin(a) * holes.at, holes.r, 0, Math.PI * 2, true); s.holes.push(c);
  }
  const g = new ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: seg });
  return paint(xf(g, { p: [0, 0, z0] }), color);
}

/** Annular sector (axis Z) between angles a0..a1 (rad), radii r0..r1, extruded z0..z0+depth. */
export function sector(r0: number, r1: number, a0: number, a1: number, depth: number, z0: number, color: string, seg = 14): BufferGeometry {
  const s = new Shape(); s.absarc(0, 0, r1, a0, a1, false); s.absarc(0, 0, r0, a1, a0, true); s.closePath();
  return paint(xf(new ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: seg }), { p: [0, 0, z0] }), color);
}

export function tube(points: V3[], r: number, color: string, seg = 24, radial = 8, closed = false): BufferGeometry {
  const c = new CatmullRomCurve3(points.map(p => new Vector3(...p)), closed, 'catmullrom', 0.3);
  return paint(new TubeGeometry(c, seg, r, radial, closed), color);
}

/** Coil spring helix along +Z. */
export function coil(r: number, len: number, turns: number, wire: number, color: string, at: V3 = [0, 0, 0], r2: V3 = [0, 0, 0]): BufferGeometry {
  const pts: V3[] = []; const n = turns * 10;
  for (let i = 0; i <= n; i++) { const a = (i / 10) * Math.PI * 2; pts.push([Math.cos(a) * r, Math.sin(a) * r, (i / n) * len - len / 2]); }
  return xf(tube(pts, wire, color, n, 4), { p: at, r: r2 });
}

export function torus(R: number, r: number, color: string, at: V3 = [0, 0, 0]): BufferGeometry {
  return paint(xf(new TorusGeometry(R, r, 6, 20), { p: at }), color);
}

export function lathe(profile: [number, number][], color: string, t: Xf = {}, seg = 28): BufferGeometry {
  return paint(xf(new LatheGeometry(profile.map(([x, y]) => new Vector2(x, y)), seg), t), color);
}

/** Merge parts (all converted to non-indexed, uv stripped) into one geometry. */
export function merge(parts: BufferGeometry[]): BufferGeometry {
  const prepared = parts.map(g => { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); if (n !== g) g.dispose(); return n; });
  const out = mergeGeometries(prepared, false);
  for (const p of prepared) p.dispose();
  if (!out) throw new Error('merge failed');
  out.computeBoundingSphere(); out.computeBoundingBox();
  return out;
}

export const triCount = (g: BufferGeometry) => (g.index ? g.index.count : g.attributes.position.count) / 3;

export function pnum(p: Record<string, number | string | boolean>, k: string, d: number): number {
  const v = p[k]; return typeof v === 'number' ? v : d;
}
export function ppts(p: Record<string, number | string | boolean>, k: string, d: V3[]): V3[] {
  const v = p[k]; if (typeof v !== 'string') return d;
  try { const a = JSON.parse(v); return Array.isArray(a) ? a : d; } catch { return d; }
}

export const COLORS = {
  castIron: '#7d7f86', darkIron: '#4a4c52', steel: '#a9adb5', zinc: '#c8b36a', alu: '#b9bec6', black: '#1c1d20', rubber: '#26272b',
  friction: '#5a3f31', backing: '#8a8d93', red: '#c0392b', brass: '#b08d3c', fluidAmber: '#d9a441', plastic: '#d9d6cc', blue: '#2f6fbd',
  green: '#2e8b57', orange: '#FF8C00', magenta: '#D40055', purple: '#6B0099', caliperPaint: '#c0392b',
};
