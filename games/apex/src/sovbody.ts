// Clean modelled body for the Kestrel Sovereign GT-R. Built only from the reference measurements in car/sovereign/fit.json
// (side silhouette profile and front / rear width rows taken from the turntable frames), never from the generated scan mesh.
// The body is a lofted surface: stations along the car, and at each station a half section whose width at height y comes from the
// front / rear silhouette rows, scaled by a plan-view width curve, with a crown over the top. Left is the mirror of right.
import * as THREE from 'three';
import fit from '../car/sovereign/fit.json';

function curve(keys: number[][]): (v: number) => number {
  const ks = [...keys].sort((a, b) => a[0] - b[0]);
  return (v: number): number => {
    if (v <= ks[0][0]) return ks[0][1];
    for (let i = 1; i < ks.length; i++) if (v <= ks[i][0]) { const t = (v - ks[i - 1][0]) / (ks[i][0] - ks[i - 1][0]); const s = t * t * (3 - 2 * t); return ks[i - 1][1] + (ks[i][1] - ks[i - 1][1]) * (0.35 * t + 0.65 * s); }
    return ks[ks.length - 1][1];
  };
}

// side silhouette: top line from the reference profile, lightly smoothed, nose and tail rounded off
const prof = (fit as any).profile as { z: number; top: number; bot: number }[];
const topKeys: number[][] = [[2.39, 0.66], [2.33, 0.72]];
for (let i = 0; i < prof.length; i++) {
  const p = prof[i];
  if (p.z > 2.25 || p.z < -2.25 || p.top <= 0.01) continue;
  const a = prof[Math.max(0, i - 1)], b = prof[Math.min(prof.length - 1, i + 1)];
  const t = (a.top > 0.01 ? a.top : p.top) * 0.25 + p.top * 0.5 + (b.top > 0.01 ? b.top : p.top) * 0.25;
  topKeys.push([p.z, t]);
}
topKeys.push([-2.33, 1.03], [-2.39, 0.96]);
export const bodyTop = curve(topKeys);
export const bodyBot = curve([[2.39, 0.14], [2.3, 0.12], [2.1, 0.12], [1.7, 0.13], [1.3, 0.2], [0, 0.2], [-1.5, 0.2], [-2.1, 0.22], [-2.39, 0.3]]);
const hip = curve([[2.39, 0.82], [2.3, 0.9], [2.05, 0.95], [1.75, 0.97], [1.4, 0.99], [0.9, 0.95], [0.3, 0.93], [-0.5, 0.94], [-1.1, 0.97], [-1.6, 0.99], [-2.1, 0.96], [-2.39, 0.86]]);
const crownAt = curve([[2.39, 0.04], [1.5, 0.06], [0.9, 0.08], [0.3, 0.11], [-0.5, 0.11], [-1.3, 0.09], [-2.39, 0.05]]);

// silhouette half-width (metres) against height, from the reference front and rear views (rows run roof to ground)
function table(rows: number[], aspect: number, height: number): (y: number) => number {
  const n = rows.length;
  const pts = rows.map((f, i) => [height * (1 - i / (n - 1)), f * 0.99]).reverse();      // ascending y
  return curve(pts.map(([y, w]) => [y, Math.max(0.02, w)]));
}
const Wf = table((fit as any).front.rows, (fit as any).front.aspect, 1.37);
const Wr = table((fit as any).rear.rows, (fit as any).rear.aspect, 1.37);
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const smooth = (e0: number, e1: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/** half-width of the body at height y on station z (before the crown) */
const gauss = (v: number, c: number, w: number): number => Math.exp(-(((v - c) / w) ** 2));
export function halfWidthAt(y: number, z: number): number {
  const base = mix(Wf(y), Wr(y), smooth(0.4, -1.1, z));
  let w = base * (hip(z) / 0.97);
  // widebody: flared front fenders and big rear haunches around the arches, a rocker scoop and a shoulder crease along the doors
  const band = smooth(0.25, 0.45, y) * (1 - smooth(0.95, 1.1, y));
  w += band * (0.05 * gauss(z, 1.37, 0.5) + 0.065 * gauss(z, -1.6, 0.55));
  const door = smooth(1.05, 0.75, z) * smooth(-1.1, -0.8, z);
  w -= 0.032 * gauss(y, 0.5, 0.09) * door;
  w += 0.012 * gauss(y, 0.92, 0.04) * door;
  // plan-view corner radius at nose and tail so the ends are rounded, not a flat slab
  const e = Math.abs(z);
  if (e > 2.2) w *= Math.max(0.8, Math.sqrt(Math.max(0, 1 - ((e - 2.2) / 0.19) ** 2)));
  return w;
}
/** x of the surface at height y on station z, including the crown over the top */
const BELT = 1.0;
/** below the belt the section follows the reference silhouette; above it the greenhouse tumbles in at a fixed rake (about 42 degrees) */
function bodyX(y: number, z: number): number {
  if (y <= BELT) return halfWidthAt(y, z);
  return Math.max(0.2, halfWidthAt(BELT, z) - 0.7 * (y - BELT));
}
export function surfaceX(y: number, z: number): number {
  const top = bodyTop(z), c = crownAt(z), ySh = top - c;
  if (y <= ySh) return bodyX(y, z);
  const wsh = bodyX(ySh, z);
  const t = Math.min(1, (y - ySh) / c);
  return wsh * Math.pow(Math.max(0, 1 - Math.pow(t, 2.6)), 1 / 2.6);
}

export function buildBodyGeometry(): THREE.BufferGeometry {
  // stations: dense near the nose and tail, steady elsewhere
  const zs: number[] = [];
  const N = 200;
  for (let i = 0; i <= N; i++) { const u = i / N; zs.push(2.39 - 4.78 * (0.5 * (0.5 - 0.5 * Math.cos(Math.PI * u)) + 0.5 * u)); }
  const K = 56;
  // blend of cosine and linear spacing so both the sill and the crown are resolved
  const taus: number[] = [];
  for (let k = 0; k <= K; k++) taus.push(0.5 * (0.5 - 0.5 * Math.cos(Math.PI * k / K)) + 0.5 * (k / K));
  const right: THREE.Vector3[][] = zs.map((z) => {
    const yb = bodyBot(z), yt = bodyTop(z);
    return taus.map((t) => { const y = yb + (yt - yb) * t; return new THREE.Vector3(surfaceX(y, z), y, z); });
  });
  const pos: number[] = [];
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): void => {
    // orient outward from the car's long axis
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    const cen = a.clone().add(b).add(c).multiplyScalar(1 / 3);
    const out = new THREE.Vector3(cen.x, cen.y - 0.7, 0);
    if (n.dot(out) < 0) { pos.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z); } else { pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z); }
  };
  const mir = (v: THREE.Vector3): THREE.Vector3 => new THREE.Vector3(-v.x, v.y, v.z);
  for (let i = 0; i < zs.length - 1; i++) {
    for (let k = 0; k < K; k++) {
      const a = right[i][k], b = right[i + 1][k], c = right[i + 1][k + 1], d = right[i][k + 1];
      tri(a, b, c); tri(a, c, d);
      tri(mir(a), mir(b), mir(c)); tri(mir(a), mir(c), mir(d));
    }
    // floor strip between the two bottom edges
    const a = right[i][0], b = right[i + 1][0];
    tri(a, b, mir(b)); tri(a, mir(b), mir(a));
  }
  // nose and tail caps: fan over the whole ring
  for (const idx of [0, zs.length - 1]) {
    const ring: THREE.Vector3[] = [];
    // inset a hair so the flat end face keeps its own normals instead of smoothing into the side surface
    const inset = (v: THREE.Vector3): THREE.Vector3 => new THREE.Vector3(v.x, v.y, v.z + (idx === 0 ? -0.002 : 0.002));
    for (let k = 0; k <= K; k++) ring.push(inset(right[idx][k]));
    for (let k = K - 1; k >= 0; k--) ring.push(inset(mir(right[idx][k])));
    // close the 2 mm gap between the side ring and the inset end face
    const orig: THREE.Vector3[] = [];
    for (let k = 0; k <= K; k++) orig.push(right[idx][k]);
    for (let k = K - 1; k >= 0; k--) orig.push(mir(right[idx][k]));
    for (let i = 0; i < ring.length; i++) { const j = (i + 1) % ring.length; tri(orig[i], orig[j], ring[j]); tri(orig[i], ring[j], ring[i]); }
    const cen = ring.reduce((s, v) => s.add(v), new THREE.Vector3()).multiplyScalar(1 / ring.length);
    for (let i = 0; i < ring.length; i++) tri(cen, ring[i], ring[(i + 1) % ring.length]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  return g;
}
