// The river: the channel leaves the town by the water gate and becomes a river that winds south through the
// forest to the sea, with natural banks (cut into the terrain by heightAt), a road bridge halfway, and the water
// falling gently from the channel's level to the sea's. Rafts and swimmers use it through waterways' makeWater.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { color, mix, positionWorld, sin, cos, time, vec3, float, smoothstep, normalWorld, cameraPosition, normalize, dot, pow, max } from 'three/tsl';
import { collide } from './core/collision';
import { setReflect } from './core/materials';
import { boxGeo } from './village';

/** How far the coast moved south when the forest went in between the harbour and the Outer Wall (2026-11-11). */
export const COAST_DZ = -400;

/** The river's line, from the end of the channel's stone banks (outside the water gate) to its mouth on the beach. */
const LINE: [number, number][] = [
  [-69, -46], [-70, -85], [-64, -130], [-56, -180], [-40, -226], [-12, -243], [18, -251], [36, -275], [40, -320],
  [36, -375], [32, -430], [30, -505],
];
export const RIVER_TOP = 0.4;   // the level where the channel hands over (the channel falls to this through the gate)
const SEA = 0.02;

interface Sample { x: number; z: number; s: number; half: number; level: number; tx: number; tz: number }
export interface RiverHit { d: number; half: number; level: number; s: number; i: number }

const samples: Sample[] = (() => {
  const out: Sample[] = [], P = LINE.map(([x, z]) => new THREE.Vector2(x, z));
  const cr = (a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2, d: THREE.Vector2, t: number) => {
    const t2 = t * t, t3 = t2 * t;
    const f = (p0: number, p1: number, p2: number, p3: number) => 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
    return new THREE.Vector2(f(a.x, b.x, c.x, d.x), f(a.y, b.y, c.y, d.y));
  };
  const pts: THREE.Vector2[] = [];
  for (let k = 0; k < P.length - 1; k++) {
    const a = P[Math.max(0, k - 1)], b = P[k], c = P[k + 1], d = P[Math.min(P.length - 1, k + 2)];
    const n = Math.ceil(b.distanceTo(c) / 1.5);
    for (let i = 0; i < n; i++) pts.push(cr(a, b, c, d, i / n));
  }
  pts.push(P[P.length - 1].clone());
  let s = 0;
  pts.forEach((p, i) => {
    if (i) s += p.distanceTo(pts[i - 1]);
    const q = pts[Math.min(pts.length - 1, i + 1)], r = pts[Math.max(0, i - 1)], t = new THREE.Vector2(q.x - r.x, q.y - r.y).normalize();
    out.push({ x: p.x, z: p.y, s, half: 0, level: 0, tx: t.x, tz: t.y });
  });
  const S = s;
  for (const o of out) {
    o.half = 4.3 + 1.1 * Math.sin(o.s * 0.023) + 0.6 * Math.sin(o.s * 0.061 + 1.3);
    o.half *= 0.75 + 0.25 * Math.min(1, o.s / 30);           // narrow where it leaves the stone channel
    o.level = RIVER_TOP + (SEA - RIVER_TOP) * Math.min(1, o.s / (S - 25));
  }
  return out;
})();
export const RIVER_LENGTH = samples[samples.length - 1].s;

// a bucket grid (10 m cells) of the samples near each cell
const CELL = 10, REACH = 16, grid = new Map<number, number[]>(), key = (i: number, j: number) => i * 100003 + j;
samples.forEach((p, n) => {
  for (let i = Math.floor((p.x - REACH) / CELL); i <= Math.floor((p.x + REACH) / CELL); i++)
    for (let j = Math.floor((p.z - REACH) / CELL); j <= Math.floor((p.z + REACH) / CELL); j++) {
      const k = key(i, j); (grid.get(k) ?? grid.set(k, []).get(k)!).push(n);
    }
});

/** The river near (x, z): distance from its line, its half-width and level there; null if more than ~14 m off. */
export function riverAt(x: number, z: number): RiverHit | null {
  const list = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
  if (!list) return null;
  let bi = -1, bd = Infinity;
  for (const n of list) { const p = samples[n], d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; bi = n; } }
  if (bi < 0) return null;
  // project onto the segment either side of the nearest sample for a smooth distance
  let best = { d: Math.sqrt(bd), t: 0, j: bi };
  for (const j of [bi - 1, bi]) {
    const a = samples[j], b = samples[j + 1]; if (!a || !b) continue;
    const ex = b.x - a.x, ez = b.z - a.z, L2 = ex * ex + ez * ez || 1;
    const t = Math.min(1, Math.max(0, ((x - a.x) * ex + (z - a.z) * ez) / L2));
    const d = Math.hypot(a.x + ex * t - x, a.z + ez * t - z);
    if (d < best.d) best = { d, t, j };
  }
  const a = samples[best.j], b = samples[Math.min(samples.length - 1, best.j + 1)], t = best.t;
  return { d: best.d, half: a.half + (b.half - a.half) * t, level: a.level + (b.level - a.level) * t, s: a.s + (b.s - a.s) * t, i: best.j };
}

/** The ground cut by the river: a bowl under the water, sloping banks up to the forest floor. */
export function riverCut(x: number, z: number, y: number) {
  const r = riverAt(x, z);
  if (!r || r.d > r.half + 8) return y;
  const lip = r.level - 0.45;
  const target = r.d < r.half ? r.level - 1.75 + 1.3 * (r.d / r.half) ** 2 : lip + (r.d - r.half) * 0.62;
  return Math.min(y, target);
}

/** Where the road crosses the river: the sample, and the point. */
export function riverCrossing(roadX: (z: number) => number) {
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i], fa = a.x - roadX(a.z), fb = b.x - roadX(b.z);
    if (fa <= 0 && fb > 0) { const t = fa / (fa - fb); return { i, x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, half: a.half, level: a.level }; }
  }
  return null;
}

export interface River {
  group: THREE.Group;
  deckAt(x: number, z: number): number;
  posts: { x: number; z: number; r: number }[];
  footprints: THREE.Box3[];
  bridge: { x: number; z: number; yaw: number; len: number };
}

/** The river's water ribbon and the road bridge (a long timber bridge on trestle piers). */
export function buildRiver(o: { heightAt: (x: number, z: number) => number; roadX: (z: number) => number;
  mats: { wood: THREE.Material; darkWood: THREE.Material; stone: THREE.Material } }): River {
  const group = new THREE.Group(); group.name = 'river';
  // ── the water ──
  {
    const pos: number[] = [], idx: number[] = [];
    samples.forEach((p) => {
      const nx = -p.tz, nz = p.tx, w = p.half + 1.2;
      pos.push(p.x - nx * w, p.level, p.z - nz * w, p.x + nx * w, p.level, p.z + nz * w);
    });
    // run the ribbon on into the sea a little
    const e = samples[samples.length - 1];
    for (let k = 1; k <= 3; k++) { const nx = -e.tz, nz = e.tx, w = e.half + 1.2 + k * 4, x = e.x + e.tx * k * 6, z = e.z + e.tz * k * 6; pos.push(x - nx * w, SEA, z - nz * w, x + nx * w, SEA, z + nz * w); }
    const n = pos.length / 6;
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    // the winding can flip a triangle's facing: the water is drawn both sides with an upward normal
    const nrm = g.attributes.normal as THREE.BufferAttribute; for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.045, metalness: 0, side: THREE.DoubleSide });
    // the current: ripples drift downstream (south) faster than the canal's
    const rip = sin(positionWorld.x.mul(1.9).add(time.mul(0.9))).mul(sin(positionWorld.z.mul(1.4).add(time.mul(2.2)))).mul(0.5).add(0.5);
    const froth = cos(positionWorld.x.mul(4.5).sub(time.mul(1.2))).mul(sin(positionWorld.z.mul(3.2).add(time.mul(3.1)))).mul(0.5).add(0.5);
    const view = normalize(cameraPosition.sub(positionWorld));
    const fres = pow(float(1).sub(max(dot(view, normalWorld), 0)), 3.6);
    // forest-green and peaty under the trees, the sea's blue toward the mouth, current foam streaks
    const mouth = smoothstep(-400, -470, positionWorld.z);
    const rough = mix(float(0.032), float(0.13), smoothstep(0.28, 0.9, rip));
    m.colorNode = mix(mix(color(0x16291e), color(0x143e46), mouth), color(0x314e3d), rip.mul(0.4)).add(vec3(0.1, 0.17, 0.15).mul(pow(froth, 4).mul(0.18))).mul(float(1).sub(fres.mul(0.38)));
    m.roughnessNode = rough;
    setReflect(m, 0.92, rough);
    const w = new THREE.Mesh(g, m); w.receiveShadow = true; group.add(w);
  }

  // ── the road bridge: a long, gently arched timber bridge on trestle piers, along the road ──
  const posts: River['posts'] = [];
  const c = riverCrossing(o.roadX)!;
  const dz = 2, dir = new THREE.Vector2(o.roadX(c.z + dz) - o.roadX(c.z - dz), 2 * dz).normalize();
  const yaw = Math.atan2(dir.x, dir.y);
  const s = samples[c.i], cosA = Math.abs(dir.x * -s.tz + dir.y * s.tx);   // the road against the river's normal
  const len = (c.half * 2 + 1.5) / Math.max(0.35, cosA) + 8, W = 4.6, rise = 1.4;
  const end = (k: number) => o.heightAt(c.x + dir.x * k * (len / 2 + 0.5), c.z + dir.y * k * (len / 2 + 0.5));
  const base = Math.max(end(-1), end(1), c.level + 0.6) + 0.05;
  const solid: THREE.BufferGeometry[] = [], guard: THREE.BufferGeometry[] = [], decor = new Map<THREE.Material, THREE.BufferGeometry[]>(), solidMat = o.mats.wood;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
  const put = (g: THREE.BufferGeometry, mat: THREE.Material | null, u: number, y: number, v: number, pitch = 0, isSolid = false) => {
    // (u along the road, v across it)
    e3.set(pitch, yaw, 0, 'YXZ'); q.setFromEuler(e3);
    m4.compose(new THREE.Vector3(c.x + dir.x * u + dir.y * v, y, c.z + dir.y * u - dir.x * v), q, one);
    const gg = (g.index ? g.toNonIndexed() : g.clone()).applyMatrix4(m4);
    for (const k of Object.keys(gg.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') gg.deleteAttribute(k);
    if (isSolid && mat === null) guard.push(gg); else if (isSolid && mat === solidMat) solid.push(gg); else (decor.get(mat!) ?? decor.set(mat!, []).get(mat!)!).push(gg);
  };
  const deckY = (u: number) => base + rise * Math.cos((Math.PI * u) / len);   // u in −len/2 … len/2
  const N = 18;
  for (let k = 0; k < N; k++) {
    const ua = -len / 2 + (k / N) * len, ub = -len / 2 + ((k + 1) / N) * len, ya = deckY(ua) - base + base, yb = deckY(ub);
    const L = Math.hypot(ub - ua, yb - ya), pitch = -Math.atan2(yb - ya, ub - ua);
    put(boxGeo(W, 0.14, L + 0.02), solidMat, (ua + ub) / 2, (ya + yb) / 2 - 0.07, 0, pitch, true);
    put(boxGeo(W + 0.3, 0.26, L + 0.02), o.mats.darkWood, (ua + ub) / 2, (ya + yb) / 2 - 0.27, 0, pitch);
    for (const sd of [-1, 1]) {
      put(boxGeo(0.14, 0.14, L + 0.02), o.mats.darkWood, (ua + ub) / 2, (ya + yb) / 2 + 0.98, sd * (W / 2 - 0.1), pitch);
      if (k % 2 === 0) put(boxGeo(0.15, 1.05, 0.15), o.mats.darkWood, ua, ya + 0.48, sd * (W / 2 - 0.1));
    }
  }
  // the railing's top as a solid (nobody walks off the bridge)
  for (const sd of [-1, 1]) for (let k = 0; k < N; k++) {
    const ua = -len / 2 + (k / N) * len, ub = -len / 2 + ((k + 1) / N) * len, ya = deckY(ua), yb = deckY(ub);
    put(boxGeo(0.12, 1.0, Math.hypot(ub - ua, yb - ya)), null, (ua + ub) / 2, (ya + yb) / 2 + 0.5, sd * (W / 2 - 0.1), -Math.atan2(yb - ya, ub - ua), true);
  }
  // trestle piers in the water: two bents of three posts, braced
  for (const u of [-len * 0.2, len * 0.2]) {
    const top = deckY(u) - 0.4, bed = c.level - 1.9;
    for (const v of [-W / 2 + 0.3, 0, W / 2 - 0.3]) {
      put(new THREE.CylinderGeometry(0.17, 0.2, top - bed, 8), o.mats.darkWood, u, (top + bed) / 2, v);
      const px = c.x + dir.x * u + dir.y * v, pz = c.z + dir.y * u - dir.x * v; posts.push({ x: px, z: pz, r: 0.5 });
    }
    put(boxGeo(W + 0.4, 0.24, 0.3), o.mats.darkWood, u, top + 0.1, 0);
    put(boxGeo(W, 0.12, 0.12), o.mats.darkWood, u, (top + c.level) / 2, 0);
  }
  // stone abutments at either end
  for (const k of [-1, 1]) {
    const u = k * (len / 2 - 0.6), y0 = o.heightAt(c.x + dir.x * u, c.z + dir.y * u) - 1.5;
    put(boxGeo(W + 1.2, base - y0 + 0.05, 1.6), o.mats.stone, u, (base + y0) / 2, 0);
  }
  if (solid.length) group.add(collide(new THREE.Mesh(mergeGeometries(solid, false)!, solidMat)));
  // the railings' unseen guard (the rails themselves are open timber, drawn above)
  if (guard.length) { const gm = new THREE.Mesh(mergeGeometries(guard, false)!, new THREE.MeshBasicNodeMaterial()); gm.visible = false; group.add(collide(gm)); }
  for (const [mat, list] of decor) { const mesh = new THREE.Mesh(mergeGeometries(list, false)!, mat); mesh.castShadow = mesh.receiveShadow = true; group.add(mesh); }
  group.traverse((m) => { if ((m as THREE.Mesh).isMesh && m.visible) { (m as THREE.Mesh).castShadow = true; (m as THREE.Mesh).receiveShadow = true; } });

  const deckAt = (x: number, z: number) => {
    const rx = x - c.x, rz = z - c.z, u = rx * dir.x + rz * dir.y, v = rx * dir.y - rz * dir.x;
    if (Math.abs(u) > len / 2 || Math.abs(v) > W / 2 - 0.15) return -Infinity;
    return deckY(u);
  };
  const bb = new THREE.Box3();
  for (const k of [-1, 1]) for (const sd of [-1, 1]) bb.expandByPoint(new THREE.Vector3(c.x + dir.x * k * len / 2 + dir.y * sd * W / 2, 0, c.z + dir.y * k * len / 2 - dir.x * sd * W / 2));
  bb.min.y = -50; bb.max.y = 200;
  return { group, deckAt, posts, footprints: [bb], bridge: { x: c.x, z: c.z, yaw, len } };
}
