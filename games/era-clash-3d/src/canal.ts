// The canal across Otsu-no-ura (still 2, "cherry blossom petals floating"): a stone-banked channel of still green
// water from the western hills to the valley side, wooden railings along both banks, cherries over the water,
// small boats tied up at the steps, and an arched wooden bridge (taikobashi) wherever a street crosses. The bridge
// decks are walkable (collision) and `deckAt` gives their height to everything that walks without the collision
// world (townsfolk, villagers, markers).
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { color, mix, positionWorld, sin, time, vec3, float, smoothstep, normalWorld, cameraPosition, normalize, dot, pow, max } from 'three/tsl';
import { collide } from './core/collision';
import { boxGeo } from './village';
import { walkRamp } from './waterways';

export interface CanalSpec { z: number; half: number; water: number; bed: number; west: number; east: number }
export interface Canal {
  group: THREE.Group;
  /** The bridge deck's height at (x, z), or −Infinity off every bridge. */
  deckAt(x: number, z: number): number;
  /** Cherry spots along the banks (chapter1 plants them in the forest). */
  cherries: { x: number; z: number; h: number }[];
  footprints: THREE.Box3[];
  /** The bridge piers in the water (rafts steer round them). */
  posts: { x: number; z: number; r: number }[];
  /** Landing stages at the water (raft moorings; swimmers climb out here): the stage and the way up. */
  landings: { p: THREE.Vector3; out: THREE.Vector3 }[];
}

export function buildCanal(o: { spec: CanalSpec; heightAt: (x: number, z: number) => number; bridges: { x: number; width: number }[];
  /** Where a channel joins through the south bank (x, half width). */
  junction?: { x: number; half: number };
  /** Landing steps down to the water (x, bank side). */
  landings?: { x: number; side: 1 | -1 }[];
  mats: { stone: THREE.Material; wood: THREE.Material; darkWood: THREE.Material } }): Canal {
  const { spec: C, heightAt, mats } = o;
  const group = new THREE.Group(); group.name = 'canal';
  const solid: Map<THREE.Material, THREE.BufferGeometry[]> = new Map(), decor: Map<THREE.Material, THREE.BufferGeometry[]> = new Map();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
  const put = (g: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, l: { rx?: number; ry?: number; rz?: number } = {}, isSolid = false) => {
    e.set(l.rx ?? 0, l.ry ?? 0, l.rz ?? 0); q.setFromEuler(e); m4.compose(new THREE.Vector3(x, y, z), q, one);
    const c = (g.index ? g.toNonIndexed() : g.clone()).applyMatrix4(m4);
    for (const k of Object.keys(c.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') c.deleteAttribute(k);
    const map = isSolid ? solid : decor; (map.get(mat) ?? map.set(mat, []).get(mat)!).push(c);
  };
  const onBridge = (x: number) => o.bridges.find((b) => Math.abs(x - b.x) < b.width / 2 + 0.3);

  // ── The banks: dressed stone from the bed to a coping just above the street; railings on top ─────────
  const STEP = 2.4;
  const J = o.junction, atLanding = (x: number, sd: number) => (o.landings ?? []).some((l) => l.side === sd && Math.abs(x - l.x) < 1.6);
  for (let x = C.west; x < C.east; x += STEP) {
    const xc = x + STEP / 2;
    for (const sd of [-1, 1]) {
      if (J && sd < 0 && Math.abs(xc - J.x) < J.half + 0.35 + STEP / 2) continue;   // the channel comes in here
      const z = C.z + sd * (C.half + 0.35);
      const top = Math.max(heightAt(xc, z + sd * 1.2), C.water + 0.6) + 0.12;
      put(boxGeo(STEP + 0.02, top - C.bed + 0.3, 0.7), mats.stone, xc, (top + C.bed - 0.3) / 2, z);
      put(boxGeo(STEP + 0.02, 0.14, 0.86), mats.stone, xc, top + 0.07, z);
      // a wooden railing along the bank (not across a bridge's landing)
      if (!onBridge(xc) && !atLanding(xc, sd)) {
        put(boxGeo(0.12, 0.95, 0.12), mats.darkWood, x + 0.1, top + 0.55, z, {}, true);
        put(boxGeo(STEP, 0.08, 0.08), mats.darkWood, xc, top + 0.98, z, {}, true);
        put(boxGeo(STEP, 0.06, 0.06), mats.darkWood, xc, top + 0.55, z);
      }
    }
  }
  // the ends: a stone wall where the canal meets the hills and the valley side
  for (const x of [C.west, C.east]) {
    const top = heightAt(x + (x === C.west ? -1.5 : 1.5), C.z) + 0.1;
    put(boxGeo(0.8, top - C.bed + 0.3, C.half * 2 + 1.4), mats.stone, x, (top + C.bed - 0.3) / 2, C.z, {}, true);
  }

  // ── Arched bridges (taikobashi) at the street crossings: a curved plank deck on beams, rails both sides ──
  const posts: Canal['posts'] = [];
  const decks: { x: number; w: number; z0: number; z1: number; base: number; rise: number }[] = [];
  for (const b of o.bridges) {
    const span = C.half * 2 + 3.4, z0 = C.z - span / 2, z1 = C.z + span / 2;
    const base = Math.max(heightAt(b.x, z0 - 0.5), heightAt(b.x, z1 + 0.5)) + 0.04, rise = 0.85;
    decks.push({ x: b.x, w: b.width, z0, z1, base, rise });
    const N = 14;
    for (let k = 0; k < N; k++) {
      const ta = k / N, tb = (k + 1) / N, za = z0 + ta * span, zb = z0 + tb * span;
      const ya = base + rise * Math.sin(Math.PI * ta), yb = base + rise * Math.sin(Math.PI * tb);
      const len = Math.hypot(zb - za, yb - ya), ang = Math.atan2(yb - ya, zb - za);
      put(boxGeo(b.width, 0.12, len + 0.02), mats.wood, b.x, (ya + yb) / 2 - 0.06, (za + zb) / 2, { rx: -ang }, true);
      for (const sd of [-1, 1]) {
        put(boxGeo(0.16, 0.16, len + 0.02), mats.darkWood, b.x + sd * (b.width / 2 - 0.1), (ya + yb) / 2 + 0.95, (za + zb) / 2, { rx: -ang }, true);
        if (k % 3 === 0) put(boxGeo(0.14, 1.0, 0.14), mats.darkWood, b.x + sd * (b.width / 2 - 0.1), ya + 0.45, za, {}, true);
      }
      put(boxGeo(b.width + 0.3, 0.22, 0.22), mats.darkWood, b.x, (ya + yb) / 2 - 0.22, (za + zb) / 2, { rx: -ang });   // the beams below
    }
    // piers in the water
    for (const pz of [C.z - C.half * 0.45, C.z + C.half * 0.45]) for (const sd of [-1, 1]) posts.push({ x: b.x + sd * (b.width / 2 - 0.4), z: pz, r: 0.5 });
    for (const pz of [C.z - C.half * 0.45, C.z + C.half * 0.45]) for (const sd of [-1, 1]) put(new THREE.CylinderGeometry(0.16, 0.18, base + rise - C.bed, 8), mats.darkWood, b.x + sd * (b.width / 2 - 0.4), (base + rise + C.bed) / 2 - 0.2, pz);
  }
  const deckAt = (x: number, z: number) => {
    for (const d of decks) if (Math.abs(x - d.x) < d.w / 2 && z > d.z0 && z < d.z1) return d.base + d.rise * Math.sin(Math.PI * (z - d.z0) / (d.z1 - d.z0));
    return -Infinity;
  };

  // ── Landing steps (funaba): a flight down along the bank to a stone stage at the water ─────────────
  const landings: Canal['landings'] = [];
  for (const L of o.landings ?? []) {
    const sd = L.side, zb = C.z + sd * (C.half - 0.5);
    const top = Math.max(heightAt(L.x, C.z + sd * (C.half + 1.5)), C.water + 0.6) + 0.12;
    const n = Math.max(2, Math.round((top - C.water - 0.12) / 0.24)), h = (top - C.water - 0.12) / n;
    for (let i = 0; i < n; i++) {
      const y = top - (i + 1) * h, x = L.x - 1.2 + i * 0.3;
      put(boxGeo(0.32, y - C.bed + 0.1, 1.0), mats.stone, x, (y + C.bed - 0.1) / 2, zb, {}, false);
      if (i % 2 === 0) posts.push({ x, z: zb, r: 0.55 });
    }
    const stageX = L.x - 1.2 + n * 0.3 + 0.55;
    group.add(walkRamp(new THREE.Vector3(L.x - 1.36, top - h + 0.03, zb), new THREE.Vector3(stageX - 0.55, C.water + 0.15, zb), 0.96));
    put(boxGeo(1.1, C.water + 0.12 - C.bed, 1.0), mats.stone, stageX, (C.water + 0.12 + C.bed) / 2, zb, {}, true);
    posts.push({ x: stageX, z: zb, r: 0.65 });
    landings.push({ p: new THREE.Vector3(stageX, C.water + 0.12, zb), out: new THREE.Vector3(0, 0, sd) });
  }

  // ── Boats tied up along the banks ───────────────────────────────────────────────────────────────
  const hull = new THREE.CylinderGeometry(0.62, 0.42, 4.6, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).rotateZ(Math.PI).rotateY(Math.PI / 2);
  for (let x = C.west + 14; x < C.east - 10; x += 23) {
    if (onBridge(x) || o.bridges.some((b) => Math.abs(x - b.x) < 6) || (J && Math.abs(x - J.x) < J.half + 4) || (o.landings ?? []).some((l) => Math.abs(x - l.x) < 5)) continue;
    const sd = (Math.round(x) % 2 === 0) ? 1 : -1;
    put(hull, mats.darkWood, x, C.water + 0.2, C.z + sd * (C.half - 0.9), { ry: 0.04 * sd });
    put(boxGeo(4.0, 0.06, 0.9), mats.wood, x, C.water + 0.4, C.z + sd * (C.half - 0.9));
  }

  // ── The water: still, dark green, a soft moving ripple and the sky in it ─────────────────────────
  const wg = new THREE.PlaneGeometry(C.east - C.west, C.half * 2 + 0.4, 48, 4).rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(wg, (() => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.06, metalness: 0 });
    const rip = sin(positionWorld.x.mul(1.7).add(time.mul(0.9))).mul(sin(positionWorld.z.mul(2.3).sub(time.mul(0.7)))).mul(0.5).add(0.5);
    const view = normalize(cameraPosition.sub(positionWorld));
    const fres = pow(float(1).sub(max(dot(view, normalWorld), 0)), 3);
    m.colorNode = mix(color(0x1a2a24), color(0x2c4038), rip.mul(0.35)).mul(float(1).sub(fres.mul(0.4)));
    m.roughnessNode = mix(float(0.04), float(0.12), smoothstep(0.3, 0.9, rip));
    void vec3;
    return m;
  })());
  water.position.set((C.west + C.east) / 2, C.water, C.z); water.receiveShadow = true;
  group.add(water);

  for (const [map, isSolid] of [[solid, true], [decor, false]] as const) for (const [mat, list] of map) {
    const g = mergeGeometries(list, false); if (!g) continue;
    const mesh = new THREE.Mesh(g, mat); mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(isSolid ? collide(mesh) : mesh);
  }
  // cherries over the water, both banks, between the bridges
  const cherries: Canal['cherries'] = [];
  for (let x = C.west + 8; x < C.east - 6; x += 17) {
    if (o.bridges.some((b) => Math.abs(x - b.x) < 7)) continue;
    cherries.push({ x, z: C.z + ((Math.round(x / 17) % 2) ? 1 : -1) * (C.half + 2.2), h: 6 + ((x * 7) % 3) });
  }
  const footprints = [new THREE.Box3(new THREE.Vector3(C.west - 1, -50, C.z - C.half - 1.2), new THREE.Vector3(C.east + 1, 200, C.z + C.half + 1.2))];
  return { group, deckAt, cherries, footprints, posts, landings };
}
