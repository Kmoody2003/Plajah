// The waterways of Otsu-no-ura: the canal across the city (canal.ts) joined to the harbour by a channel that runs
// south between the merchant streets and leaves the town through a water gate (mizumon) in the Outer Wall, out
// across the beach to the sea. Stone landing steps (funaba) go down to the water along both, where the rafts tie up.
//
// `makeWater` answers "is there water here, and how high" for everything that swims or floats (core/player.ts,
// raft.ts) and for the raiders, who keep out of it (core/mobs.ts).
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { color, mix, positionWorld, sin, time, float, smoothstep, normalWorld, cameraPosition, normalize, dot, pow, max } from 'three/tsl';
import { collide } from './core/collision';
import { boxGeo, gableGeo } from './village';
import type { CanalSpec } from './canal';
import { riverAt, COAST_DZ } from './river';

/** The channel (runs along z at x): water level `inner` inside the wall, falling to the sea's level at the gate. */
export interface ChannelSpec { x: number; half: number; z0: number; z1: number; bed: number; inner: number; sea: number; gateZ: number; out: number }
export const SEA_Y = 0.02;
/** The playable sea: rafts and swimmers keep inside it. */
export const SEA_BOUNDS = { x0: -178, x1: 68, z0: -116 + COAST_DZ };
/** The sea starts south of here (the beach moved 400 m south with the forest). */
export const SEA_Z = -60 + COAST_DZ;

export interface Water {
  /** The water's surface at (x, z), or null where there is none (or it is too shallow to float a raft). */
  surfaceAt(x: number, z: number): number | null;
  /** How deep the water is at (x, z) (0 off the water). */
  depthAt(x: number, z: number): number;
}

/** An unseen walking ramp from a to b (feet heights), `width` across: what the feet use on a flight of steps
 *  (open risers and shallow treads snag the capsule's step-up). */
export function walkRamp(a: THREE.Vector3, b: THREE.Vector3, width: number) {
  const d = b.clone().sub(a), len = d.length();
  const g = new THREE.PlaneGeometry(width, len).rotateX(-Math.PI / 2);   // along local z
  const m = new THREE.Mesh(g, new THREE.MeshBasicNodeMaterial());
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.lookAt(b.x, b.y, b.z);   // local +z toward b, so the plane runs a→b
  m.visible = false;
  return collide(m);
}

export function channelLevel(c: ChannelSpec, z: number) {
  // level inside the wall; a short fall through the gate to the harbour's level, then the sea's
  const t = Math.min(1, Math.max(0, (c.gateZ + 4 - z) / (c.gateZ + 4 - c.out)));
  return c.inner + (c.sea - c.inner) * t;
}

export function makeWater(o: { canal: CanalSpec; channel: ChannelSpec; heightAt: (x: number, z: number) => number }): Water {
  const { canal: C, channel: H, heightAt } = o;
  const surfaceAt = (x: number, z: number) => {
    if (x > C.west + 0.4 && x < C.east - 0.4 && Math.abs(z - C.z) < C.half - 0.05) return C.water;
    if (Math.abs(x - H.x) < H.half - 0.05 && z > H.z0 && z < H.z1 + 0.5) return channelLevel(H, z);
    if (z < H.z0 + 1) { const r = riverAt(x, z); if (r && r.d < r.half - 0.05 && heightAt(x, z) < r.level - 0.1) return r.level; }
    if (z < SEA_Z && z > SEA_BOUNDS.z0 && x > SEA_BOUNDS.x0 && x < SEA_BOUNDS.x1 && heightAt(x, z) < SEA_Y - 0.3) return SEA_Y;
    return null;
  };
  return {
    surfaceAt,
    depthAt(x, z) { const s = surfaceAt(x, z); return s === null ? 0 : Math.max(0, s - heightAt(x, z)); },
  };
}

export interface Channel {
  group: THREE.Group;
  deckAt(x: number, z: number): number;
  footprints: THREE.Box3[];
  /** The bridge piers in the water (round posts): rafts steer round them. */
  posts: { x: number; z: number; r: number }[];
  /** Landing platforms at the water (raft moorings, where swimmers climb out): position and the way out (yaw). */
  landings: { p: THREE.Vector3; out: THREE.Vector3 }[];
}

/** The channel: stone banks with railings, arched plank bridges where the streets cross, landing steps, the
 *  water (falling a little at the gate), and the water gate in the Outer Wall. */
export function buildChannel(o: { spec: ChannelSpec; heightAt: (x: number, z: number) => number; bridges: number[]; landings: { z: number; side: 1 | -1 }[];
  mats: { stone: THREE.Material; wood: THREE.Material; darkWood: THREE.Material; plaster: THREE.Material; tile: THREE.Material } }): Channel {
  const { spec: H, heightAt, mats } = o;
  const group = new THREE.Group(); group.name = 'channel';
  const solid = new Map<THREE.Material, THREE.BufferGeometry[]>(), decor = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
  const put = (g: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, l: { rx?: number; ry?: number; rz?: number } = {}, isSolid = false) => {
    e.set(l.rx ?? 0, l.ry ?? 0, l.rz ?? 0); q.setFromEuler(e); m4.compose(new THREE.Vector3(x, y, z), q, one);
    const c = (g.index ? g.toNonIndexed() : g.clone()).applyMatrix4(m4);
    for (const k of Object.keys(c.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') c.deleteAttribute(k);
    const map = isSolid ? solid : decor; (map.get(mat) ?? map.set(mat, []).get(mat)!).push(c);
  };
  const SPAN = H.half * 2 + 3.2, BW = 3.6;
  const onBridge = (z: number) => o.bridges.some((b) => Math.abs(z - b) < BW / 2 + 0.3);
  const atLanding = (z: number, side: number) => o.landings.some((l) => l.side === side && Math.abs(z - l.z) < 1.6);
  const gateGap = (z: number) => Math.abs(z - H.gateZ) < 2.4;

  // ── The banks ──────────────────────────────────────────────────────────────────────────────────
  const STEP = 2.4;
  for (let z = H.z0; z < H.z1; z += STEP) {
    const zc = z + STEP / 2;
    if (gateGap(zc)) continue;
    for (const sd of [-1, 1] as const) {
      const x = H.x + sd * (H.half + 0.35);
      const top = Math.max(heightAt(x + sd * 1.2, zc), channelLevel(H, zc) + 0.6) + 0.12;
      put(boxGeo(0.7, top - H.bed + 0.3, STEP + 0.02), mats.stone, x, (top + H.bed - 0.3) / 2, zc, {}, true);
      put(boxGeo(0.86, 0.14, STEP + 0.02), mats.stone, x, top + 0.07, zc);
      // railings inside the town (the beach end is open)
      if (zc > H.gateZ + 2 && !onBridge(zc) && !atLanding(zc, sd)) {
        put(boxGeo(0.12, 0.95, 0.12), mats.darkWood, x, top + 0.55, z + 0.1, {}, true);
        put(boxGeo(0.08, 0.08, STEP), mats.darkWood, x, top + 0.98, zc, {}, true);
        put(boxGeo(0.06, 0.06, STEP), mats.darkWood, x, top + 0.55, zc);
      }
    }
  }

  // ── Landing steps (funaba): a flight down along the bank to a stage at the water ─────────────────
  const landings: Channel['landings'] = [];
  const posts: Channel['posts'] = [];
  for (const L of o.landings) {
    const sd = L.side, xb = H.x + sd * (H.half - 0.5), lvl = channelLevel(H, L.z);
    const top = Math.max(heightAt(H.x + sd * (H.half + 1.5), L.z), lvl + 0.6) + 0.12;
    const n = Math.max(2, Math.round((top - lvl - 0.12) / 0.24)), h = (top - lvl - 0.12) / n;
    for (let i = 0; i < n; i++) {
      const y = top - (i + 1) * h, z = L.z - 1.2 + i * 0.3;
      put(boxGeo(1.0, y - H.bed + 0.1, 0.32), mats.stone, xb, (y + H.bed - 0.1) / 2, z, {}, false);
      if (i % 2 === 0) posts.push({ x: xb, z, r: 0.55 });
    }
    const stageZ = L.z - 1.2 + n * 0.3 + 0.55;
    group.add(walkRamp(new THREE.Vector3(xb, top - h + 0.03, L.z - 1.36), new THREE.Vector3(xb, lvl + 0.15, stageZ - 0.55), 0.96));
    put(boxGeo(1.0, lvl + 0.12 - H.bed, 1.1), mats.stone, xb, (lvl + 0.12 + H.bed) / 2, stageZ, {}, true);
    posts.push({ x: xb, z: stageZ, r: 0.65 });
    landings.push({ p: new THREE.Vector3(xb, lvl + 0.12, stageZ), out: new THREE.Vector3(-sd, 0, 0) });
  }

  // ── Bridges: low arched plank bridges where the streets cross (town bridges ran flatter than a shrine's) ─
  const decks: { z: number; x0: number; x1: number; base: number; rise: number }[] = [];
  for (const bz of o.bridges) {
    const x0 = H.x - SPAN / 2, x1 = H.x + SPAN / 2;
    const base = Math.max(heightAt(x0 - 0.5, bz), heightAt(x1 + 0.5, bz)) + 0.04, rise = 1.2;
    decks.push({ z: bz, x0, x1, base, rise });
    const N = 12;
    for (let k = 0; k < N; k++) {
      const ta = k / N, tb = (k + 1) / N, xa = x0 + ta * SPAN, xb = x0 + tb * SPAN;
      const ya = base + rise * Math.sin(Math.PI * ta), yb = base + rise * Math.sin(Math.PI * tb);
      const len = Math.hypot(xb - xa, yb - ya), ang = Math.atan2(yb - ya, xb - xa);
      put(boxGeo(len + 0.02, 0.12, BW), mats.wood, (xa + xb) / 2, (ya + yb) / 2 - 0.06, bz, { rz: ang }, true);
      for (const sd of [-1, 1]) {
        put(boxGeo(len + 0.02, 0.14, 0.14), mats.darkWood, (xa + xb) / 2, (ya + yb) / 2 + 0.95, bz + sd * (BW / 2 - 0.1), { rz: ang }, true);
        if (k % 3 === 0) put(boxGeo(0.13, 1.0, 0.13), mats.darkWood, xa, ya + 0.45, bz + sd * (BW / 2 - 0.1), {}, true);
      }
      put(boxGeo(len + 0.02, 0.22, BW + 0.3), mats.darkWood, (xa + xb) / 2, (ya + yb) / 2 - 0.22, bz, { rz: ang });
    }
    for (const px of [H.x - H.half * 0.62, H.x + H.half * 0.62]) for (const sd of [-1, 1]) {
      put(new THREE.CylinderGeometry(0.15, 0.17, base + rise - H.bed, 8), mats.darkWood, px, (base + rise + H.bed) / 2 - 0.2, bz + sd * (BW / 2 - 0.4));
      posts.push({ x: px, z: bz + sd * (BW / 2 - 0.4), r: 0.5 });
    }
  }
  const deckAt = (x: number, z: number) => {
    for (const d of decks) if (Math.abs(z - d.z) < BW / 2 && x > d.x0 && x < d.x1) return d.base + d.rise * Math.sin(Math.PI * (x - d.x0) / (d.x1 - d.x0));
    return -Infinity;
  };

  // ── The water gate (mizumon) in the Outer Wall: stone towers either side, a roofed beam across, and the
  //    lattice gate drawn up under it ────────────────────────────────────────────────────────────────
  {
    const gz = H.gateZ, gy = Math.min(heightAt(H.x - H.half - 3, gz), heightAt(H.x + H.half + 3, gz)) - 0.4;
    for (const sd of [-1, 1]) {
      const x = H.x + sd * (H.half + 1.6);
      put(boxGeo(2.6, gy + 5.2 - H.bed, 3.4), mats.stone, x, (gy + 5.2 + H.bed) / 2, gz, {}, true);
    }
    put(boxGeo(H.half * 2 + 5.8, 0.55, 0.6), mats.darkWood, H.x, gy + 5.5, gz);
    put(boxGeo(H.half * 2 + 5.8, 1.2, 2.4), mats.plaster, H.x, gy + 6.35, gz);
    put(gableGeo(H.half * 2 + 5.8, 2.4, 1.2, 0.8), mats.tile, H.x, gy + 6.95, gz);
    // the lattice gate, drawn up: its lower edge 1.4 m below the beam
    for (let i = -6; i <= 6; i++) put(boxGeo(0.12, 1.6, 0.14), mats.darkWood, H.x + i * (H.half / 6.2), gy + 4.55, gz - 0.5);
    for (const y of [3.9, 4.6, 5.2]) put(boxGeo(H.half * 2 + 0.4, 0.12, 0.14), mats.darkWood, H.x, gy + y, gz - 0.5);
  }

  // ── The water: a ribbon along the channel at its level (the fall through the gate is a gentle slope) ──
  {
    const pos: number[] = [], idx: number[] = [];
    const n = Math.ceil((H.z1 + 0.6 - H.z0) / 1.5);
    for (let i = 0; i <= n; i++) {
      const z = H.z0 + (i / n) * (H.z1 + 0.6 - H.z0), y = channelLevel(H, z);
      pos.push(H.x - H.half - 0.2, y, z, H.x + H.half + 0.2, y, z);
    }
    for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.06, metalness: 0 });
    const rip = sin(positionWorld.x.mul(2.1).add(time.mul(0.8))).mul(sin(positionWorld.z.mul(1.6).add(time.mul(1.4)))).mul(0.5).add(0.5);
    const view = normalize(cameraPosition.sub(positionWorld));
    const fres = pow(float(1).sub(max(dot(view, normalWorld), 0)), 3);
    // greener in the town, turning to the harbour's blue toward the mouth
    const sea = smoothstep(H.gateZ, H.out, positionWorld.z);
    m.colorNode = mix(mix(color(0x1a2a24), color(0x163a40), sea), color(0x2c4038), rip.mul(0.35)).mul(float(1).sub(fres.mul(0.4)));
    m.roughnessNode = mix(float(0.04), float(0.12), smoothstep(0.3, 0.9, rip));
    const w = new THREE.Mesh(g, m); w.receiveShadow = true; group.add(w);
  }

  for (const [map, isSolid] of [[solid, true], [decor, false]] as const) for (const [mat, list] of map) {
    const g = mergeGeometries(list, false); if (!g) continue;
    const mesh = new THREE.Mesh(g, mat); mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(isSolid ? collide(mesh) : mesh);
  }
  const footprints = [new THREE.Box3(new THREE.Vector3(H.x - H.half - 1.2, -50, H.z0), new THREE.Vector3(H.x + H.half + 1.2, 200, H.z1 + 1))];
  return { group, deckAt, footprints, posts, landings };
}
