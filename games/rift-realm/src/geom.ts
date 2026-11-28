// Static-world geometry kit: everything is authored in world space, given world-scale UVs (so PBR sheets tile at a real
// size on every face) and merged per material, so a whole level is a handful of draw calls.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { collide } from './collision';

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hash3 = (x: number, y: number, z: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
};
export function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(
    l(l(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u), l(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u), v),
    l(l(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u), l(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u), v),
    w,
  );
}
export const fbm3 = (x: number, y: number, z: number) =>
  noise3(x, y, z) * 0.55 + noise3(x * 2.1, y * 2.1, z * 2.1) * 0.3 + noise3(x * 4.3, y * 4.3, z * 4.3) * 0.15;

/** Flat-shaded, position + normal + uv only, so geometries of every kind merge. */
export function prep(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geo.index ? geo.toNonIndexed() : geo;
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
  g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g;
}

/** World-space UVs by dominant normal axis (tiles per metre = tpm). Call on world-space, flat-shaded geometry. */
export function worldUV(g: THREE.BufferGeometry, tpm: number, offset = 0): THREE.BufferGeometry {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u: number, v: number;
    if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); }
    else if (ax >= az) { u = p.getZ(i); v = p.getY(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv.setXY(i, u * tpm + offset, v * tpm + offset);
  }
  uv.needsUpdate = true;
  return g;
}

export type Bucket = { mat: THREE.Material; solid: boolean; shadow: boolean; geos: THREE.BufferGeometry[] };

export class StaticKit {
  readonly buckets = new Map<string, Bucket>();
  private tmp = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();

  add(mat: THREE.Material, geo: THREE.BufferGeometry, opts: { solid?: boolean; shadow?: boolean; tpm?: number; uvOffset?: number } = {}) {
    const solid = opts.solid ?? true;
    const shadow = opts.shadow ?? true;
    const key = `${mat.uuid}|${solid}|${shadow}`;
    let b = this.buckets.get(key);
    if (!b) { b = { mat, solid, shadow, geos: [] }; this.buckets.set(key, b); }
    const g = prep(geo);
    if (opts.tpm) worldUV(g, opts.tpm, opts.uvOffset ?? 0);
    b.geos.push(g);
    return g;
  }

  /** Place a geometry: rotate (Euler y-x-z), then translate. */
  place(geo: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    this.e.set(rx, ry, rz, 'YXZ');
    this.q.setFromEuler(this.e);
    this.tmp.compose(new THREE.Vector3(x, y, z), this.q, new THREE.Vector3(sx, sy, sz));
    geo.applyMatrix4(this.tmp);
    return geo;
  }

  box(mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, opts: { solid?: boolean; shadow?: boolean; tpm?: number; rx?: number; rz?: number } = {}) {
    const g = new THREE.BoxGeometry(w, h, d);
    this.place(g, x, y, z, ry, opts.rx ?? 0, opts.rz ?? 0);
    return this.add(mat, g, { ...opts, tpm: opts.tpm ?? 0.45 });
  }

  /** Vertical prism with n sides; radius is the circumradius; faceYaw rotates it (π/n puts a flat toward +x). */
  prism(mat: THREE.Material, n: number, rTop: number, rBot: number, h: number, x: number, y: number, z: number, ry = 0, opts: { solid?: boolean; tpm?: number } = {}) {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, n, 1);
    this.place(g, x, y + h / 2, z, ry);
    return this.add(mat, g, { ...opts, tpm: opts.tpm ?? 0.45 });
  }

  build(parent: THREE.Object3D) {
    for (const b of this.buckets.values()) {
      const merged = mergeGeometries(b.geos, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, b.mat);
      mesh.castShadow = b.shadow;
      mesh.receiveShadow = true;
      if (b.solid) collide(mesh);
      parent.add(mesh);
    }
  }
}

/** Polygon (x,z points, CCW from above) → top face triangulated with optional holes, plus side walls. Returns [top, sides]. */
export function polyPrism(outer: [number, number][], holes: [number, number][][], y0: number, y1: number): { top: THREE.BufferGeometry; sides: THREE.BufferGeometry } {
  const v2 = (a: [number, number][]) => a.map(([x, z]) => new THREE.Vector2(x, z));
  const tris = THREE.ShapeUtils.triangulateShape(v2(outer), holes.map(v2));
  const all = [...outer, ...holes.flat()];
  const topPos: number[] = [];
  for (const t of tris) for (const idx of t) topPos.push(all[idx][0], y1, all[idx][1]);
  const top = new THREE.BufferGeometry();
  top.setAttribute('position', new THREE.Float32BufferAttribute(topPos, 3));
  // winding: make normals face +y
  const a = new THREE.Vector3(topPos[0], topPos[1], topPos[2]), b = new THREE.Vector3(topPos[3], topPos[4], topPos[5]), c = new THREE.Vector3(topPos[6], topPos[7], topPos[8]);
  if (b.clone().sub(a).cross(c.clone().sub(a)).y < 0) {
    const flipped: number[] = [];
    for (let i = 0; i < topPos.length; i += 9) flipped.push(topPos[i], topPos[i + 1], topPos[i + 2], topPos[i + 6], topPos[i + 7], topPos[i + 8], topPos[i + 3], topPos[i + 4], topPos[i + 5]);
    top.setAttribute('position', new THREE.Float32BufferAttribute(flipped, 3));
  }
  const sidePos: number[] = [];
  const wall = (ring: [number, number][], outward: boolean) => {
    for (let i = 0; i < ring.length; i++) {
      const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % ring.length];
      const q = outward
        ? [x0, y0, z0, x1, y0, z1, x1, y1, z1, x0, y0, z0, x1, y1, z1, x0, y1, z0]
        : [x1, y0, z1, x0, y0, z0, x0, y1, z0, x1, y0, z1, x0, y1, z0, x1, y1, z1];
      sidePos.push(...q);
    }
  };
  wall(outer, true);
  for (const h of holes) wall(h, false);
  const sides = new THREE.BufferGeometry();
  sides.setAttribute('position', new THREE.Float32BufferAttribute(sidePos, 3));
  return { top, sides };
}

export const octagon = (R: number, rot = Math.PI / 8): [number, number][] =>
  Array.from({ length: 8 }, (_, k) => [Math.cos(rot + (k * Math.PI) / 4) * R, Math.sin(rot + (k * Math.PI) / 4) * R] as [number, number]);

/** Tapered tube along a curve (radius r0 → r1), noisy surface optional. */
export function taperTube(curve: THREE.Curve<THREE.Vector3>, r0: number, r1: number, segs = 16, radial = 8, wobble = 0): THREE.BufferGeometry {
  const pos: number[] = [], idx: number[] = [];
  const frames = curve.computeFrenetFrames(segs, false);
  const fallbackN = new THREE.Vector3(1, 0, 0), fallbackB = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, p = curve.getPoint(t);
    const fn = frames.normals[i], fb = frames.binormals[i];
    const N = Number.isFinite(fn.x) && Number.isFinite(fn.y) && Number.isFinite(fn.z) ? fn : fallbackN;
    const B = Number.isFinite(fb.x) && Number.isFinite(fb.y) && Number.isFinite(fb.z) ? fb : fallbackB;
    const r = r0 + (r1 - r0) * t;
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const w = 1 + wobble * (fbm3(p.x * 1.7 + j, p.y * 1.7, p.z * 1.7) - 0.5);
      const dx = Math.cos(a) * N.x + Math.sin(a) * B.x, dy = Math.cos(a) * N.y + Math.sin(a) * B.y, dz = Math.cos(a) * N.z + Math.sin(a) * B.z;
      pos.push(p.x + dx * r * w, p.y + dy * r * w, p.z + dz * r * w);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
    const a = i * radial + j, b = i * radial + ((j + 1) % radial), c = (i + 1) * radial + j, d = (i + 1) * radial + ((j + 1) % radial);
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

/** Displaced rock: noisy sphere squashed into a boulder. */
export function boulder(r: number, seed: number, detail = 3): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const d = 0.72 + fbm3(v.x * 2.2 + seed, v.y * 2.2 + seed, v.z * 2.2 + seed) * 0.62;
    const ridge = Math.abs(noise3(v.x * 5 + seed, v.y * 5, v.z * 5) - 0.5) * 0.16;
    p.setXYZ(i, v.x * r * (d - ridge), v.y * r * (d - ridge) * 0.72, v.z * r * (d - ridge));
  }
  g.computeVertexNormals();
  return g;
}
