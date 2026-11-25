// Mesh surgery for scan cars: cut a generated body mesh along planes into separate real pieces (doors, hood, trunk, glass) with clean
// straight edges, an optional gap between pieces, and a thickened inner liner so an open panel looks manufactured, not torn.
import * as THREE from 'three';

export interface Vtx { p: THREE.Vector3; n: THREE.Vector3; uv: THREE.Vector2 }
export type Tri = [Vtx, Vtx, Vtx];
/** half-space: inside when n·p <= d. g marks a plane that is a real panel edge (it gets a gap); others are internal joins. */
export interface Plane { n: THREE.Vector3; d: number; g: boolean }
export type Region = Plane[];

export function toTris(geo: THREE.BufferGeometry): Tri[] {
  const pos = geo.attributes.position as THREE.BufferAttribute, nor = geo.attributes.normal as THREE.BufferAttribute, uv = geo.attributes.uv as THREE.BufferAttribute | undefined;
  const out: Tri[] = [];
  const v = (i: number): Vtx => ({ p: new THREE.Vector3().fromBufferAttribute(pos, i), n: new THREE.Vector3().fromBufferAttribute(nor, i), uv: uv ? new THREE.Vector2().fromBufferAttribute(uv, i) : new THREE.Vector2() });
  for (let i = 0; i < pos.count; i += 3) out.push([v(i), v(i + 1), v(i + 2)]);
  return out;
}

export function toGeometry(tris: Tri[]): THREE.BufferGeometry {
  const p = new Float32Array(tris.length * 9), n = new Float32Array(tris.length * 9), u = new Float32Array(tris.length * 6);
  tris.forEach((t, i) => t.forEach((v, k) => {
    p.set([v.p.x, v.p.y, v.p.z], i * 9 + k * 3); n.set([v.n.x, v.n.y, v.n.z], i * 9 + k * 3); u.set([v.uv.x, v.uv.y], i * 6 + k * 2);
  }));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('normal', new THREE.BufferAttribute(n, 3)); g.setAttribute('uv', new THREE.BufferAttribute(u, 2));
  return g;
}

const lerpV = (a: Vtx, b: Vtx, t: number): Vtx => ({ p: a.p.clone().lerp(b.p, t), n: a.n.clone().lerp(b.n, t).normalize(), uv: a.uv.clone().lerp(b.uv, t) });

function splitPoly(poly: Vtx[], pl: Plane): { inn: Vtx[]; out: Vtx[] } {
  const inn: Vtx[] = [], out: Vtx[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const da = pl.n.dot(a.p) - pl.d, db = pl.n.dot(b.p) - pl.d;
    if (da <= 0) inn.push(a); else out.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) { const m = lerpV(a, b, da / (da - db)); inn.push(m); out.push(m); }
  }
  return { inn, out };
}
const fan = (poly: Vtx[], into: Tri[]): void => { for (let i = 1; i + 1 < poly.length; i++) into.push([poly[0], poly[i], poly[i + 1]]); };

/** split triangles by a convex region: inside = in every plane. Planes flagged g are moved by `gap` (inside shrinks / outside grows). */
export function clipRegion(tris: Tri[], region: Region, gap: number, mode: 'inside' | 'outside'): Tri[] {
  const res: Tri[] = [];
  for (const t of tris) {
    let cur: Vtx[] = [t[0], t[1], t[2]];
    let dropped = false;
    for (const pl of region) {
      const sh = pl.g ? (mode === 'inside' ? -gap / 2 : gap / 2) : 0;
      const q: Plane = { n: pl.n, d: pl.d + sh, g: pl.g };
      const { inn, out } = splitPoly(cur, q);
      if (mode === 'outside' && out.length >= 3) fan(out, res);
      cur = inn;
      if (cur.length < 3) { dropped = true; break; }
    }
    if (mode === 'inside' && !dropped && cur.length >= 3) fan(cur, res);
  }
  return res;
}

/** take the part of tris inside any region of the union (panel), returning that and the rest (shell). Gaps only on flagged planes. */
export function splitUnion(tris: Tri[], regions: Region[], gap: number): { panel: Tri[]; rest: Tri[] } {
  let rest = tris; const panel: Tri[] = [];
  for (const r of regions) {
    panel.push(...clipRegion(rest, r, gap, 'inside'));
    rest = clipRegion(rest, r, gap, 'outside');
  }
  return { panel, rest };
}

export const plane = (nx: number, ny: number, nz: number, d: number, g = true): Plane => ({ n: new THREE.Vector3(nx, ny, nz), d, g });
/** axis-aligned box as a region (lo/hi in car frame). flags say which faces are real panel edges. */
export function boxRegion(lo: number[], hi: number[], edge: boolean[] = [true, true, true, true, true, true]): Region {
  return [plane(1, 0, 0, hi[0], edge[0]), plane(-1, 0, 0, -lo[0], edge[1]), plane(0, 1, 0, hi[1], edge[2]), plane(0, -1, 0, -lo[1], edge[3]), plane(0, 0, 1, hi[2], edge[4]), plane(0, 0, -1, -lo[2], edge[5])];
}
/** shift a car-frame region into the mesh's own coordinates (origin offset). */
export function toMesh(region: Region, origin: THREE.Vector3): Region {
  return region.map((p) => ({ n: p.n, d: p.d + p.n.dot(origin), g: p.g }));
}
/** a convex polygon in the (z, y) side plane extruded across x >= xMin (side=+1) or x <= -xMin (side=-1). pts ordered around. */
export function sideRegion(pts: number[][], side: number, xMin: number, edge = true): Region {
  const r: Region = [];
  for (let i = 0; i < pts.length; i++) {
    const [z0, y0] = pts[i], [z1, y1] = pts[(i + 1) % pts.length];
    const dz = z1 - z0, dy = y1 - y0;
    // outward normal of an edge walked counter-clockwise in (z, y): (dy, -dz)
    const nz = dy, ny = -dz, len = Math.hypot(nz, ny) || 1;
    r.push(plane(0, ny / len, nz / len, (ny * y0 + nz * z0) / len, edge));
  }
  r.push(side > 0 ? plane(-1, 0, 0, -xMin, edge) : plane(1, 0, 0, -xMin, edge));
  return r;
}

/** build an outer piece plus a dark inner liner offset inward along the normals, closed with edge strips: the "thickness" of a real panel. */
export function thicken(tris: Tri[], depth: number, linerOf?: Tri[]): { liner: Tri[]; edges: Tri[] } {
  const liner: Tri[] = (linerOf ?? tris).map((t) => {
    const v = (a: Vtx): Vtx => ({ p: a.p.clone().addScaledVector(a.n, -depth), n: a.n.clone().negate(), uv: a.uv.clone() });
    return [v(t[0]), v(t[2]), v(t[1])] as Tri;
  });
  // boundary edges: edges used by exactly one triangle
  const key = (p: THREE.Vector3): string => `${Math.round(p.x * 4000)},${Math.round(p.y * 4000)},${Math.round(p.z * 4000)}`;
  const count = new Map<string, { a: Vtx; b: Vtx; n: number }>();
  for (const t of tris) for (let i = 0; i < 3; i++) {
    const a = t[i], b = t[(i + 1) % 3], ka = key(a.p), kb = key(b.p);
    const k = ka < kb ? ka + '|' + kb : kb + '|' + ka;
    const e = count.get(k);
    if (e) e.n++; else count.set(k, { a, b, n: 1 });
  }
  const edges: Tri[] = [];
  for (const e of count.values()) {
    if (e.n !== 1) continue;
    const a2: Vtx = { p: e.a.p.clone().addScaledVector(e.a.n, -depth), n: e.a.n.clone(), uv: e.a.uv.clone() };
    const b2: Vtx = { p: e.b.p.clone().addScaledVector(e.b.n, -depth), n: e.b.n.clone(), uv: e.b.uv.clone() };
    // two triangles per boundary edge with a proper face normal (a NaN normal here is what drew the black teeth)
    const mk = (A: Vtx, B: Vtx, C: Vtx): Tri => {
      const n = B.p.clone().sub(A.p).cross(C.p.clone().sub(A.p));
      if (n.lengthSq() < 1e-14) n.set(0, 1, 0); else n.normalize();
      return [{ p: A.p, n, uv: A.uv }, { p: B.p, n, uv: B.uv }, { p: C.p, n, uv: C.uv }];
    };
    edges.push(mk(e.a, e.b, b2), mk(e.a, b2, a2));
  }
  return { liner, edges };
}
