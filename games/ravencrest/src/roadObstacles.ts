// Wreckage on the Cinema Mile: obstacles you jump, take at a run, or go around. Every load deals a
// different hand: each kind turns up or not, at its own spot on the road and its own angle, so
// sometimes the road is strewn with all of it, sometimes a piece or two, sometimes it's clear and
// only the monsters are waiting.
//   log       a fallen dead tree across both lanes (~0.6 m): a standing jump clears it
//   barricade barrels and sandbags across the road, 2.5 m deep: only a running jump carries over
//   fire      a burning debris pile (barrels, crates, planks), deep and alight: run and jump, or burn
//   car       an abandoned car under a tarp, slewed across one lane: go around it
//   bus       a short school bus crashed onto its side across a lane and the verge: go around
//   plane     a crashed prop plane, nose-down and slewed, a torn wing low over the other lane: jump it
// (The bus and plane are Muse sheets built locally like the war-rig tank: buildCast.py.)
import * as THREE from 'three/webgpu';
import type { ArrivalWorld } from './arrival';
import { loadModel, fitSize } from './assets';
import { collide } from './collision';
import { flameMaterial } from './fx';
import { loadGLB } from './character';

const VEHICLES = '/games/ravencrest/assets/vehicles/';

type Kind = 'log' | 'barricade' | 'fire' | 'car' | 'bus' | 'plane';
export interface RoadObstacles {
  group: THREE.Group;
  /** Resolves once every placed obstacle (and its colliders) is in the scene. */
  props: Promise<void>;
  /** Burning piles: centre + radius (the game hurts the hero who stands in one). */
  fires: { pos: THREE.Vector3; r: number }[];
  placed: Kind[];
  /** The tank's hull at `pos` heading `dir`: everything within reach is hurled off the road. */
  smash(pos: THREE.Vector3, dir: THREE.Vector3, speed: number): boolean;
  /** Wreckage in flight (call per frame); true once a smash has settled (rebuild collision then). */
  update(dt: number, groundAt: (x: number, z: number, y: number) => number | null): boolean;
}
interface Piece { obj: THREE.Object3D; mass: number; vel: THREE.Vector3; spin: THREE.Vector3; flying: boolean; done: boolean }

export function buildRoadObstacles(world: ArrivalWorld, seed = Math.random()): RoadObstacles {
  let s = Math.floor(seed * 2 ** 31) || 1;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const R = world.road, group = new THREE.Group();
  group.name = 'roadObstacles';
  const width = R.uR - R.uL, mid = (R.uL + R.uR) / 2;
  // Each kind shows up about half the time; about one load in eight the road is clear.
  const kinds: Kind[] = rnd() < 0.12 ? [] : (['log', 'barricade', 'fire', 'car', 'bus', 'plane'] as Kind[]).filter(() => rnd() < 0.5);
  // Spread along the road between the spawn and the bridge, never on top of each other.
  const span = -R.vStart - 30, slots = kinds.map((_, i) => R.vStart + 18 + (span / Math.max(1, kinds.length)) * (i + 0.2 + rnd() * 0.6));
  for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]]; }
  const at = (u: number, v: number) => R.fromLocal(u, v, R.heightAt(u, v));
  const yaw = R.yawAlong + Math.PI / 2;           // across the road
  const fires: RoadObstacles['fires'] = [];
  const jobs: Promise<unknown>[] = [];
  const pieces: Piece[] = [];
  const flameGroups: THREE.Object3D[][] = [];
  const place = (o: THREE.Object3D, u: number, v: number, turn: number, solid = true, mass = 1) => {
    o.position.copy(at(u, v));
    o.rotation.y = yaw + turn;
    group.add(solid ? collide(o) : o);
    pieces.push({ obj: o, mass, vel: new THREE.Vector3(), spin: new THREE.Vector3(), flying: false, done: false });
    return o;
  };
  const MASS: Record<string, number> = { covered_car: 12, dead_tree_trunk: 6, cement_bag: 1.2, Barrel_01: 1.5, barrel_03: 1.5, wooden_crate_01: 1, wine_barrel_01: 1.4 };
  const model = (id: string, size: number, axis: 'x' | 'y' | 'z' | 'max', u: number, v: number, turn: number, solid = true) =>
    loadModel(id).then((g) => { fitSize(g, size, axis); place(g, u, v, turn, solid, MASS[id] ?? 1); return g; }).catch(() => null);

  // A wreck: the vehicle model posed inside a holder (roll/pitch), lifted to rest on the road.
  const wreck = (file: string, mass: number, u: number, v: number, turn: number, pose: (o: THREE.Object3D) => void) =>
    loadGLB(VEHICLES + file).then((g) => {
      const body = g.scene;
      body.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      const holder = new THREE.Group();
      holder.add(body);
      pose(body);
      body.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(body);
      body.position.y -= box.min.y + 0.05;
      place(holder, u, v, turn, true, mass);
    }).catch(() => null);

  kinds.forEach((k, i) => {
    const v = slots[i], tilt = (rnd() - 0.5) * 0.5;
    if (k === 'log') {
      // A dead trunk fallen across both lanes.
      jobs.push(model('dead_tree_trunk', width + 3, 'max', mid + (rnd() - 0.5) * 2, v, tilt * 0.4));
    } else if (k === 'barricade') {
      // Two staggered rows of oil drums and sandbags: knee-to-waist high, too deep to hop.
      for (let row = 0; row < 2; row++) for (let u = R.uL - 0.6; u <= R.uR + 0.6; u += 1.05 + rnd() * 0.25) {
        const id = rnd() < 0.6 ? (rnd() < 0.5 ? 'Barrel_01' : 'barrel_03') : 'cement_bag';
        jobs.push(model(id, id === 'cement_bag' ? 0.85 : 0.95, id === 'cement_bag' ? 'max' : 'y', u + row * 0.5, v + row * 1.3 + (rnd() - 0.5) * 0.3, rnd() * 6.28));
      }
    } else if (k === 'fire') {
      // A wreck of barrels, crates and planks, burning: run, jump, and don't land in it.
      const c = at(mid + (rnd() - 0.5) * width * 0.3, v);
      for (let n = 0; n < 9; n++) {
        const id = ['Barrel_01', 'barrel_03', 'wooden_crate_01', 'wine_barrel_01'][Math.floor(rnd() * 4)];
        const u = mid + (rnd() - 0.5) * width * 0.9, vv = v + (rnd() - 0.5) * 2.2;
        jobs.push(model(id, 0.7 + rnd() * 0.3, 'y', u, vv, rnd() * 6.28).then((g) => { if (g) { g.rotation.z = (rnd() - 0.5) * 1.6; g.position.y -= 0.1; } }));
      }
      // Charred planks strewn across it.
      const plankMat = new THREE.MeshStandardNodeMaterial({ color: 0x1a1210, roughness: 0.95 });
      for (let n = 0; n < 7; n++) {
        const pl = new THREE.Mesh(new THREE.BoxGeometry(2.2 + rnd() * 1.4, 0.08, 0.22), plankMat);
        pl.castShadow = true;
        place(pl, mid + (rnd() - 0.5) * width * 0.8, v + (rnd() - 0.5) * 2, rnd() * 3, false);
        pl.position.y += 0.25 + rnd() * 0.4; pl.rotation.z = (rnd() - 0.5) * 0.7;
      }
      // An invisible box over the pile: a waist-high, 2.4 m-deep body you have to clear.
      const block = new THREE.Mesh(new THREE.BoxGeometry(width + 1.5, 0.95, 2.4), new THREE.MeshBasicNodeMaterial({ visible: false }));
      place(block, mid, v, 0, true, 0).position.y += 0.47;
      const flamesHere: THREE.Object3D[] = [];
      flameGroups.push(flamesHere);
      // The flames.
      const flame = flameMaterial();
      for (let n = 0; n < 14; n++) {
        const f = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.7), flame);
        f.position.copy(at(mid + (rnd() - 0.5) * width * 0.85, v + (rnd() - 0.5) * 2)).add(new THREE.Vector3(0, 0.9 + rnd() * 0.4, 0));
        f.scale.setScalar(0.8 + rnd() * 0.9);
        const f2 = new THREE.Mesh(f.geometry, flame); f2.rotation.y = Math.PI / 2; f.add(f2);   // crossed: fire from every side
        f.rotation.y = rnd() * 3;
        group.add(f);
        flamesHere.push(f);
      }
      fires.push({ pos: c, r: Math.max(2.2, width * 0.5) });
    } else if (k === 'bus') {
      // On its side (roof toward the near verge), across a lane and the shoulder.
      const lane = rnd() < 0.5 ? R.uL + width * 0.2 : R.uR - width * 0.2;
      // (The sheet draws a stubby bus; real short-bus proportions: ~2.6 m wide, ~3.6 m tall.)
      jobs.push(wreck('school_bus.glb', 20, lane, v, Math.PI / 2 + (rnd() - 0.5) * 0.7, (b) => { b.scale.set(0.64, 0.6, 1); b.rotation.z = (lane < mid ? 1 : -1) * Math.PI / 2; }));
    } else if (k === 'plane') {
      // Nose-down into the asphalt, slewed; the broken wing lies low across the far lane.
      jobs.push(wreck('crashed_plane.glb', 10, mid + (rnd() - 0.5) * width * 0.4, v, (rnd() < 0.5 ? 1 : -1) * (0.6 + rnd() * 0.5), (b) => { b.rotation.x = 0.2; b.rotation.z = (rnd() - 0.5) * 0.35; }));
    } else if (k === 'car') {
      // Abandoned, slewed across one lane; the other lane is open.
      const lane = rnd() < 0.5 ? R.uL + width * 0.28 : R.uR - width * 0.28;
      jobs.push(model('covered_car', 4.6, 'max', lane, v, (rnd() - 0.5) * 0.9 + Math.PI / 2 * (rnd() < 0.5 ? 0 : 1)));
    }
  });
  let settling = false;
  const smash = (pos: THREE.Vector3, dir: THREE.Vector3, speed: number) => {
    let hit = false;
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    for (const p of pieces) {
      if (p.flying || p.done) continue;
      const o = p.obj.position;
      if (Math.hypot(o.x - pos.x, o.z - pos.z) > 4.2) continue;
      hit = true;
      p.obj.traverse((c) => { c.userData.collide = false; });
      if (p.mass === 0) { p.done = true; p.obj.removeFromParent(); continue; }      // the burning pile's invisible block
      // Forward with the hull and out toward the nearer verge, up off the road; lighter flies further.
      const out = Math.sign(side.dot(o.clone().sub(pos))) || 1;
      const k = 1 / Math.sqrt(p.mass);
      p.vel.copy(dir).multiplyScalar(speed * (0.7 + 0.3 * Math.random()) * Math.min(1.4, k * 1.3))
        .addScaledVector(side, out * (5 + Math.random() * 5) * k).add(new THREE.Vector3(0, (3 + Math.random() * 5) * k + (p.mass > 8 ? 2 : 0), 0));
      p.spin.set((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 9).multiplyScalar(k);
      p.flying = true;
    }
    // The fire goes out under the hull.
    for (let i = fires.length - 1; i >= 0; i--) if (Math.hypot(fires[i].pos.x - pos.x, fires[i].pos.z - pos.z) < 5) {
      for (const f of flameGroups[i] ?? []) f.removeFromParent();
      fires.splice(i, 1); flameGroups.splice(i, 1);
    }
    if (hit) settling = true;
    return hit;
  };
  const update = (dt: number, groundAt: (x: number, z: number, y: number) => number | null) => {
    if (!settling) return false;
    let moving = false;
    for (const p of pieces) {
      if (!p.flying) continue;
      const o = p.obj;
      p.vel.y -= 9.8 * dt;
      o.position.addScaledVector(p.vel, dt);
      o.rotation.x += p.spin.x * dt; o.rotation.y += p.spin.y * dt; o.rotation.z += p.spin.z * dt;
      const g = groundAt(o.position.x, o.position.z, o.position.y + 2) ?? o.position.y;
      if (o.position.y < g) {
        o.position.y = g;
        if (p.vel.y < -1.5) { p.vel.y *= -0.3; p.vel.x *= 0.6; p.vel.z *= 0.6; p.spin.multiplyScalar(0.55); }
        else { p.vel.y = 0; p.vel.x *= 1 - Math.min(1, dt * 4); p.vel.z *= 1 - Math.min(1, dt * 4); p.spin.multiplyScalar(1 - Math.min(1, dt * 5)); }
      }
      if (p.vel.lengthSq() < 0.05 && o.position.y <= g + 0.01) { p.flying = false; p.done = true; }
      else moving = true;
    }
    if (!moving) { settling = false; return true; }
    return false;
  };
  return { group, props: Promise.all(jobs).then(() => undefined), fires, placed: kinds, smash, update };
}
