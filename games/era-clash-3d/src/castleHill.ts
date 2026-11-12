// The end of Act I (docs/era-clash-3d-act2-volcano.md): past the forecourt a road climbs a ridge to the castle on its
// hill (the keep the whole city looks up at, landmarks.ts), and Hōrin-ji (proposed) stands on a terrace beside the
// road, with its bell house and the stable where the horses wait for the ride up the mountain.
//
// The hill, the road and the temple terrace are shaped in the terrain (castleHillCut, called from heightAt); this
// file builds what stands on them: the ishigaki rim and the plastered walls round the castle's top, the gate, the
// keep's door, and the temple.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { collide } from './core/collision';
import { boxGeo, gableGeo } from './village';
import { walkRamp } from './waterways';

/** The castle's hilltop (the landmark keep stands at its centre, at `top`). */
export const CASTLE_HILL = { x: 62, z: 400, top: 46, r: 46 };
/** Hōrin-ji's terrace (west of the road), its level, and its gate on the east side. */
export const TEMPLE = { x: -22, z: 262, hw: 21, hd: 19, y: 18.4 };
/** The keep faces the town (landmarks.ts turns it by π + 0.25). */
const KEEP_FACE = Math.PI + 0.25;

const ss = (a: number, b: number, v: number) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

// ── the road: forecourt's north parapet → up the ridge → the castle gate on the rim ──────────────────────────────
const ROAD_PTS: [number, number][] = [[-0.8, 165], [-1, 184], [6, 222], [18, 262], [32, 300], [46, 330], [55, 352]];
interface RS { x: number; z: number; s: number; tx: number; tz: number }
const road: RS[] = (() => {
  const P = ROAD_PTS.map(([x, z]) => new THREE.Vector2(x, z)), pts: THREE.Vector2[] = [];
  const cr = (a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2, d: THREE.Vector2, t: number) => {
    const t2 = t * t, t3 = t2 * t, f = (p0: number, p1: number, p2: number, p3: number) => 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
    return new THREE.Vector2(f(a.x, b.x, c.x, d.x), f(a.y, b.y, c.y, d.y));
  };
  for (let k = 0; k < P.length - 1; k++) {
    const a = P[Math.max(0, k - 1)], b = P[k], c = P[k + 1], d = P[Math.min(P.length - 1, k + 2)], n = Math.ceil(b.distanceTo(c) / 1.5);
    for (let i = 0; i < n; i++) pts.push(cr(a, b, c, d, i / n));
  }
  pts.push(P[P.length - 1].clone());
  let s = 0;
  return pts.map((p, i) => {
    if (i) s += p.distanceTo(pts[i - 1]);
    const q = pts[Math.min(pts.length - 1, i + 1)], r = pts[Math.max(0, i - 1)], t = new THREE.Vector2(q.x - r.x, q.y - r.y).normalize();
    return { x: p.x, z: p.y, s, tx: t.x, tz: t.y };
  });
})();
const ROAD_LEN = road[road.length - 1].s;
const ROAD_Y0 = 16.6;    // the forecourt's level at its north parapet
/** The road's height at arc length s: a steady climb, easing on and off. */
const roadY = (s: number) => { const t = s / ROAD_LEN; return ROAD_Y0 + (CASTLE_HILL.top - ROAD_Y0) * (t * 0.85 + 0.15 * t * t * (3 - 2 * t)); };

/** Nearest point of the castle road: distance, arc length, height. */
export function castleRoadAt(x: number, z: number) {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < road.length; i += 3) { const d = (road[i].x - x) ** 2 + (road[i].z - z) ** 2; if (d < bd) { bd = d; bi = i; } }
  for (let i = Math.max(0, bi - 3); i < Math.min(road.length, bi + 4); i++) { const d = (road[i].x - x) ** 2 + (road[i].z - z) ** 2; if (d < bd) { bd = d; bi = i; } }
  const a = road[bi];
  return { d: Math.sqrt(bd), s: a.s, y: roadY(a.s), i: bi };
}
export const castleRoadPoints = () => road.map((r) => ({ x: r.x, z: r.z }));

/** The castle's hill, the ridge road up it, and the temple's terrace, cut into the ground (from heightAt). */
export function castleHillCut(x: number, z: number, y: number) {
  if (z < 160) return y;
  // the hill: a flat top at `top`, the ishigaki rim (the stone wall stands on the steep), a skirt down to the valley
  const r = Math.hypot(x - CASTLE_HILL.x, z - CASTLE_HILL.z), R = CASTLE_HILL.r;
  const hill = r < R ? CASTLE_HILL.top : r < R + 5 ? CASTLE_HILL.top - 10 * ss(R, R + 5, r) : (CASTLE_HILL.top - 10) * (1 - ss(R + 5, R + 100, r)) + 17 * ss(R + 5, R + 100, r);
  if (r < R + 100) y = r < R + 1 ? hill : Math.max(y, hill);
  // the temple's terrace
  const tx = Math.abs(x - TEMPLE.x) - TEMPLE.hw, tz = Math.abs(z - TEMPLE.z) - TEMPLE.hd;
  const out = Math.hypot(Math.max(0, tx), Math.max(0, tz));
  if (out < 8) y = TEMPLE.y + (y - TEMPLE.y) * ss(0.5, 8, out);
  // the road: cut and filled to its grade, banks easing into the ground either side
  if (z < 365 && z > 167) {
    const rd = castleRoadAt(x, z);
    if (rd.d < 13) y = rd.y + (y - rd.y) * ss(4.2, 13, rd.d);
  }
  return y;
}

export interface CastleHill {
  group: THREE.Group;
  footprints: THREE.Box3[];
  spots: {
    castleGate: THREE.Vector3; keepDoor: THREE.Vector3; yard: THREE.Vector3;
    templeGate: THREE.Vector3; temple: THREE.Vector3; bellHouse: THREE.Vector3; abbot: THREE.Vector3;
    stable: THREE.Vector3; horses: { p: THREE.Vector3; yaw: number }[];
  };
  trees: { x: number; z: number; h: number; blossom: boolean }[];
}

export function buildCastleHill(o: { heightAt: (x: number, z: number) => number;
  mats: { stone: THREE.Material; plaster: THREE.Material; wood: THREE.Material; darkWood: THREE.Material; tile: THREE.Material; lacquer: THREE.Material; thatch: THREE.Material } }): CastleHill {
  const { heightAt, mats } = o;
  const group = new THREE.Group(); group.name = 'castleHill';
  const solid = new Map<THREE.Material, THREE.BufferGeometry[]>(), decor = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const footprints: THREE.Box3[] = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
  /** Put g at (x, y, z) turned by yaw (and tilt), solid or not. Positions given in a frame (fx, fz, fyaw): local x/z. */
  const put = (g: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, yaw = 0, isSolid = false, rx = 0, rz = 0) => {
    e.set(rx, yaw, rz, 'YXZ'); q.setFromEuler(e); m4.compose(new THREE.Vector3(x, y, z), q, one);
    const c = (g.index ? g.toNonIndexed() : g.clone()).applyMatrix4(m4);
    for (const k of Object.keys(c.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') c.deleteAttribute(k);
    const map = isSolid ? solid : decor; (map.get(mat) ?? map.set(mat, []).get(mat)!).push(c);
  };
  const frame = (fx: number, fz: number, fy: number, fyaw: number) => (g: THREE.BufferGeometry, mat: THREE.Material, lx: number, ly: number, lz: number, yaw = 0, isSolid = false) => {
    const c = Math.cos(fyaw), s = Math.sin(fyaw);
    put(g, mat, fx + lx * c + lz * s, fy + ly, fz - lx * s + lz * c, fyaw + yaw, isSolid);
  };
  const foot = (x: number, z: number, hx: number, hz: number) => footprints.push(new THREE.Box3(new THREE.Vector3(x - hx, -50, z - hz), new THREE.Vector3(x + hx, 300, z + hz)));
  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, mat: THREE.Material, isSolid: boolean, uvScale = 0.25) => {
    // a → b along the top, d → c along the bottom; uv in metres × uvScale
    const g = new THREE.BufferGeometry();
    const p = [a, d, b, b, d, c, a, b, d, b, c, d].flatMap((v) => [v.x, v.y, v.z]);
    const L = a.distanceTo(b), H = a.distanceTo(d);
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, H, 0, 0, L, H, L, H, 0, 0, L, 0, 0, H, L, H, 0, 0, L, H, L, 0, 0, 0].map((v) => v * uvScale), 2));
    g.computeVertexNormals();
    (isSolid ? solid : decor).get(mat) ?? (isSolid ? solid : decor).set(mat, []);
    (isSolid ? solid : decor).get(mat)!.push(g);
  };

  // ═══ The castle's top: ishigaki round the rim, a plastered dobei on it, the gate where the road comes up ═══
  const C = CASTLE_HILL, gateA = Math.atan2(road[road.length - 1].x - C.x, road[road.length - 1].z - C.z);
  const N = 64, GATE_HW = 0.075;   // (the gate's gap, radians either side of the road's entry)
  const angDiff = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  for (let k = 0; k < N; k++) {
    const a0 = (k / N) * Math.PI * 2, a1 = ((k + 1) / N) * Math.PI * 2, am = (a0 + a1) / 2;
    const P = (a: number, r: number, y: number) => new THREE.Vector3(C.x + Math.sin(a) * r, y, C.z + Math.cos(a) * r);
    const gate = angDiff(am, gateA) < GATE_HW + 0.02;
    if (gate) continue;
    const yb0 = heightAt(C.x + Math.sin(a0) * (C.r + 5.5), C.z + Math.cos(a0) * (C.r + 5.5)) - 0.6;
    const yb1 = heightAt(C.x + Math.sin(a1) * (C.r + 5.5), C.z + Math.cos(a1) * (C.r + 5.5)) - 0.6;
    // the battered stone face (outside), from the rim down to the skirt
    quad(P(a1, C.r + 0.6, C.top + 0.5), P(a0, C.r + 0.6, C.top + 0.5), P(a0, C.r + 5.2, yb0), P(a1, C.r + 5.2, yb1), mats.stone, true, 0.3);
    // the coping, and the plastered wall on the rim with its tile cap
    const mid = P(am, C.r + 0.2, C.top), len = (C.r + 0.2) * (a1 - a0) + 0.05;
    put(boxGeo(len, 0.5, 1.4), mats.stone, mid.x, C.top + 0.25, mid.z, am, true);
    put(boxGeo(len, 2.1, 0.55), mats.plaster, mid.x, C.top + 0.5 + 1.05, mid.z, am, true);
    put(gableGeo(len, 0.9, 0.35, 0.15), mats.tile, mid.x, C.top + 2.6, mid.z, am);
  }
  // the gate (a yagura-mon: a gatehouse over the opening) where the road reaches the rim
  {
    const gp = new THREE.Vector3(C.x + Math.sin(gateA) * (C.r + 0.2), C.top, C.z + Math.cos(gateA) * (C.r + 0.2));
    const F = frame(gp.x, gp.z, C.top, gateA);   // local x along the rim, z outward
    const W = 2 * (C.r + 0.2) * Math.sin(GATE_HW) * 0.5;     // half the opening
    for (const sx of [-1, 1]) {
      F(boxGeo(2.4, 3.2, 3.4), mats.stone, sx * (W + 1.1), 1.6, 0, 0, true);
      for (const sz of [-1, 1]) F(boxGeo(0.45, 4.2, 0.45), mats.darkWood, sx * (W - 0.2), 2.1, sz * 1.3, 0, true);
    }
    F(boxGeo(W * 2 + 4.6, 0.5, 3.6), mats.darkWood, 0, 4.4, 0);
    F(boxGeo(W * 2 + 4.2, 2.6, 3.2), mats.plaster, 0, 4.65 + 1.3, 0);
    F(boxGeo(W * 2 + 4.3, 0.5, 3.3), mats.darkWood, 0, 4.9, 0);
    F(gableGeo(W * 2 + 4.6, 3.8, 1.8, 0.9), mats.tile, 0, 7.95, 0);
    // the leaves, swung open against the inner face
    for (const sx of [-1, 1]) F(boxGeo(0.18, 3.8, W * 0.95), mats.darkWood, sx * (W - 0.3), 1.9, -W * 0.5 - 1.5, 0, false);
    foot(gp.x, gp.z, 5, 5);
  }
  // the keep's door: a deep stone opening in the base, its iron-bound leaves standing ajar
  const fx = Math.sin(KEEP_FACE), fz = Math.cos(KEEP_FACE);
  const doorAt = new THREE.Vector3(C.x + fx * 23.6, C.top, C.z + fz * 23.6);
  {
    const F = frame(doorAt.x, doorAt.z, C.top, KEEP_FACE);
    F(boxGeo(6.4, 5.2, 2.4), mats.stone, 0, 2.6, 0.2, 0, false);
    F(boxGeo(3.6, 4.0, 2.6), mats.darkWood, 0, 2.0, 0.1);     // the dark of the passage
    F(boxGeo(1.7, 3.8, 0.2), mats.darkWood, -1.35, 1.9, 1.6, -0.9);
    F(boxGeo(1.7, 3.8, 0.2), mats.darkWood, 1.35, 1.9, 1.6, 0.9);
    F(boxGeo(4.4, 0.5, 0.8), mats.darkWood, 0, 4.4, 1.4);
  }
  // the keep's base is solid (landmarks.ts draws it): its unseen collider
  {
    const g = new THREE.CylinderGeometry(24, 33, 16, 4, 1); g.rotateY(Math.PI / 4); g.rotateY(KEEP_FACE);
    const m = new THREE.Mesh(g, new THREE.MeshBasicNodeMaterial()); m.position.set(C.x, C.top + 8, C.z); m.visible = false; group.add(collide(m));
  }

  // ═══ Hōrin-ji (proposed): a temple terrace beside the road, its gate facing the road (east) ═══
  const T = TEMPLE, TY = T.y;
  // the terrace's stone face on the road side, and the steps up to the gate
  {
    const xr = T.x + T.hw + 0.3;
    for (let z = T.z - T.hd; z < T.z + T.hd; z += 2) {
      if (Math.abs(z + 1 - T.z) < 2.6) continue;
      const yb = Math.min(heightAt(xr + 3, z + 1), TY) - 0.8;
      put(boxGeo(0.9, TY - yb + 0.2, 2.02), mats.stone, xr, (TY + yb) / 2 + 0.1, z + 1, 0, true);
    }
    const yb = heightAt(xr + 7, T.z), n = Math.max(2, Math.round((TY - yb) / 0.22)), h = (TY - yb) / n;
    for (let i = 0; i < n; i++) put(boxGeo(0.4, (i + 1) * h, 4.6), mats.stone, xr + 0.4 + (n - i) * 0.4, yb + ((i + 1) * h) / 2, T.z);
    group.add(walkRamp(new THREE.Vector3(xr + 0.4 + n * 0.4 + 0.3, yb, T.z), new THREE.Vector3(xr - 0.2, TY + 0.02, T.z), 4.4));
  }
  // the earthen wall (tsuijibei) round the other three sides, with a tile cap
  const tsuiji = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(x1 - x0, z1 - z0);
    put(boxGeo(0.7, 1.9, len), mats.plaster, (x0 + x1) / 2, TY + 0.95, (z0 + z1) / 2, yaw, true);
    put(boxGeo(0.72, 0.3, len), mats.darkWood, (x0 + x1) / 2, TY + 0.15, (z0 + z1) / 2, yaw, false);
    put(gableGeo(len, 1.0, 0.35, 0.12), mats.tile, (x0 + x1) / 2, TY + 1.9, (z0 + z1) / 2, yaw + Math.PI / 2);
  };
  const xl = T.x - T.hw, xr = T.x + T.hw, z0 = T.z - T.hd, z1 = T.z + T.hd;
  tsuiji(xl, z0, xl, z1); tsuiji(xl, z1, xr, z1); tsuiji(xl, z0, xr, z0);
  tsuiji(xr, z0, xr, T.z - 3.2); tsuiji(xr, T.z + 3.2, xr, z1);
  // the sanmon (the temple gate) over the opening
  {
    const F = frame(xr, T.z, TY, Math.PI / 2);   // local x across the opening (along z), z outward (+x)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) F(boxGeo(0.4, 4.2, 0.4), mats.lacquer, sx * 2.6, 2.1, sz * 1.0, 0, true);
    F(boxGeo(6.4, 0.42, 2.6), mats.darkWood, 0, 4.3, 0);
    F(gableGeo(6.8, 3.2, 1.6, 0.8), mats.tile, 0, 4.5, 0);
  }
  // the main hall (hondō): raised on a stone plinth, a veranda round it, a deep hipped tile roof
  const hall = { x: T.x - 7, z: T.z };
  {
    const F = frame(hall.x, hall.z, TY, Math.PI / 2);   // facing east (local +z → +x)
    F(boxGeo(15, 0.8, 12), mats.stone, 0, 0.4, 0, 0, true);
    F(boxGeo(16.4, 0.18, 13.4), mats.wood, 0, 0.89, 0, 0, true);                 // the veranda
    F(boxGeo(13, 4.4, 10), mats.plaster, 0, 0.98 + 2.2, 0, 0, true);
    for (let k = -3; k <= 3; k++) for (const sz of [-1, 1]) F(boxGeo(0.3, 4.4, 0.3), mats.lacquer, k * 2.1, 0.98 + 2.2, sz * 5.2);
    F(boxGeo(6.2, 3.4, 0.2), mats.darkWood, 0, 0.98 + 1.7, 5.08);                 // the open front doors' dark
    F(gableGeo(17.6, 14.6, 4.6, 1.4), mats.tile, 0, 5.4, 0);
    F(boxGeo(17.8, 0.35, 14.8), mats.darkWood, 0, 5.38, 0);
    // steps up to the veranda
    for (let i = 0; i < 4; i++) F(boxGeo(4.4, 0.22 * (i + 1), 0.36), mats.stone, 0, 0.11 * (i + 1), 8.2 - i * 0.36);
    foot(hall.x, hall.z, 8.4, 7.4);
  }
  group.add(walkRamp(new THREE.Vector3(hall.x + 8.6, TY + 0.02, hall.z), new THREE.Vector3(hall.x + 6.9, TY + 0.98, hall.z), 4.2));
  // the bell house (shōrō): four posts, a heavy roof, the great bell — Sōta is bound to its post
  const bell = { x: T.x + 9, z: T.z + 11 };
  {
    const F = frame(bell.x, bell.z, TY, 0);
    F(boxGeo(5, 0.5, 5), mats.stone, 0, 0.25, 0, 0, true);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) F(boxGeo(0.34, 4.4, 0.34), mats.lacquer, sx * 1.9, 2.7, sz * 1.9, 0, true);
    F(boxGeo(4.6, 0.36, 0.36), mats.darkWood, 0, 4.7, 0);
    F(gableGeo(5, 5, 2.2, 0.9), mats.tile, 0, 5.0, 0);
    F(new THREE.CylinderGeometry(0.62, 0.72, 1.7, 16, 1, true), mats.darkWood, 0, 3.6, 0);
    foot(bell.x, bell.z, 2.8, 2.8);
  }
  // the stable (umaya): a long open shed on the south side, stalls, a hay rack, saddles on the rail
  const stable = { x: T.x + 4, z: z0 + 4.2 };
  const horses: { p: THREE.Vector3; yaw: number }[] = [];
  {
    const F = frame(stable.x, stable.z, TY, 0);
    const L = 18, D = 5;
    F(boxGeo(L, 2.6, 0.3), mats.wood, 0, 1.3, -D / 2, 0, true);                                    // the back wall (the temple's south wall side)
    for (let k = 0; k <= 6; k++) F(boxGeo(0.28, 3.0, 0.28), mats.darkWood, -L / 2 + k * (L / 6), 1.5, D / 2 - 0.2, 0, true);
    for (let k = 1; k < 6; k++) F(boxGeo(0.12, 1.3, D - 0.6), mats.wood, -L / 2 + k * (L / 6), 0.65, 0);   // stall partitions
    F(gableGeo(L + 0.8, D + 1.2, 1.4, 0.5), mats.thatch, 0, 3.0, 0);
    F(boxGeo(L, 0.16, 0.16), mats.darkWood, 0, 1.0, D / 2 + 1.0);                                   // the tether rail
    for (let k = 0; k < 6; k++) {
      const lx = -L / 2 + (k + 0.5) * (L / 6);
      F(boxGeo(0.8, 0.3, 0.5), mats.lacquer, lx, 1.12, D / 2 + 1.0);                                // a saddle (kura) on the rail
      if (k % 2 === 0) F(boxGeo(1.1, 0.6, 0.6), mats.thatch, lx, 0.3, -D / 2 + 0.6);                // hay
      const c = Math.cos(0), s = Math.sin(0);
      horses.push({ p: new THREE.Vector3(stable.x + lx * c, TY, stable.z + (D / 2 + 2.4) * c - lx * s * 0), yaw: Math.PI / 2 });
    }
    foot(stable.x, stable.z, L / 2 + 0.6, D / 2 + 0.6);
  }
  // stone lanterns along the path from the gate to the hall
  for (let x = hall.x + 9; x < xr - 2; x += 4) for (const sz of [-1, 1]) {
    const F = frame(x, T.z + sz * 3.2, TY, 0);
    F(boxGeo(0.7, 0.25, 0.7), mats.stone, 0, 0.12, 0);
    F(new THREE.CylinderGeometry(0.14, 0.18, 0.9, 8), mats.stone, 0, 0.7, 0);
    F(boxGeo(0.62, 0.42, 0.62), mats.stone, 0, 1.35, 0);
    F(new THREE.ConeGeometry(0.62, 0.38, 4).rotateY(Math.PI / 4), mats.stone, 0, 1.75, 0);
  }
  foot(T.x, T.z, T.hw + 1, T.hd + 1);   // (no grass on the gravel court)

  for (const [map, isSolid] of [[solid, true], [decor, false]] as const) for (const [mat, list] of map) {
    const g = mergeGeometries(list, false); if (!g) continue;
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, mat); mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(isSolid ? collide(mesh) : mesh);
  }

  const trees: CastleHill['trees'] = [];
  // a few cherries and pines in the temple court, pines along the castle road's banks
  for (const [x, z, b] of [[T.x + 12, T.z - 12, true], [T.x - 16, T.z + 14, false], [T.x - 17, T.z - 13, true], [T.x + 15, T.z + 4, false]] as const) trees.push({ x, z, h: b ? 7 : 9, blossom: b });
  for (let i = 8; i < road.length - 8; i += 9) for (const sd of [-1, 1]) {
    const p = road[i], x = p.x - p.tz * sd * (9 + ((i * 7) % 5)), z = p.z + p.tx * sd * (9 + ((i * 7) % 5));
    if (Math.abs(x - T.x) < T.hw + 6 && Math.abs(z - T.z) < T.hd + 6) continue;
    trees.push({ x, z, h: 8 + ((i * 13) % 5), blossom: i % 4 === 0 });
  }
  const V = (x: number, z: number, y?: number) => new THREE.Vector3(x, y ?? heightAt(x, z), z);
  const gateOut = road[road.length - 6];
  return {
    group, footprints, trees,
    spots: {
      castleGate: V(gateOut.x, gateOut.z, roadY(gateOut.s)),
      keepDoor: V(doorAt.x + fx * 3, doorAt.z + fz * 3, C.top),
      yard: V(C.x + fx * 30, C.z + fz * 30, C.top),
      templeGate: V(xr + 4, T.z), temple: V(T.x + 6, T.z, TY), bellHouse: V(bell.x - 1.9, bell.z - 2.6, TY),
      abbot: V(hall.x + 9.4, hall.z + 1, TY), stable: V(stable.x, stable.z + 5, TY), horses,
    },
  };
}
