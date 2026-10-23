// Wreckage on the Cinema Mile: obstacles you jump, take at a run, or go around. Every load deals a
// different hand: each kind turns up or not, at its own spot on the road and its own angle, so
// sometimes the road is strewn with all of it, sometimes a piece or two, sometimes it's clear and
// only the monsters are waiting.
//   log       a fallen dead tree across both lanes (~0.6 m): a standing jump clears it
//   barricade barrels and sandbags across the road, 2.5 m deep: only a running jump carries over
//   fire      a burning debris pile (barrels, crates, planks), deep and alight: run and jump, or burn
//   car       an abandoned car under a tarp, slewed across one lane: go around it
// The school bus and the crashed prop plane slot in here once their models exist (Muse sheets →
// buildCast.py, like the war-rig tank).
import * as THREE from 'three/webgpu';
import type { ArrivalWorld } from './arrival';
import { loadModel, fitSize } from './assets';
import { collide } from './collision';
import { flameMaterial } from './fx';

type Kind = 'log' | 'barricade' | 'fire' | 'car';
export interface RoadObstacles {
  group: THREE.Group;
  /** Resolves once every placed obstacle (and its colliders) is in the scene. */
  props: Promise<void>;
  /** Burning piles: centre + radius (the game hurts the hero who stands in one). */
  fires: { pos: THREE.Vector3; r: number }[];
  placed: Kind[];
}

export function buildRoadObstacles(world: ArrivalWorld, seed = Math.random()): RoadObstacles {
  let s = Math.floor(seed * 2 ** 31) || 1;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const R = world.road, group = new THREE.Group();
  group.name = 'roadObstacles';
  const width = R.uR - R.uL, mid = (R.uL + R.uR) / 2;
  // Each kind shows up about half the time; about one load in eight the road is clear.
  const kinds: Kind[] = rnd() < 0.12 ? [] : (['log', 'barricade', 'fire', 'car'] as Kind[]).filter(() => rnd() < 0.55);
  // Spread along the road between the spawn and the bridge, never on top of each other.
  const span = -R.vStart - 30, slots = kinds.map((_, i) => R.vStart + 18 + (span / Math.max(1, kinds.length)) * (i + 0.2 + rnd() * 0.6));
  for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]]; }
  const at = (u: number, v: number) => R.fromLocal(u, v, R.heightAt(u, v));
  const yaw = R.yawAlong + Math.PI / 2;           // across the road
  const fires: RoadObstacles['fires'] = [];
  const jobs: Promise<unknown>[] = [];
  const place = (o: THREE.Object3D, u: number, v: number, turn: number, solid = true) => {
    o.position.copy(at(u, v));
    o.rotation.y = yaw + turn;
    group.add(solid ? collide(o) : o);
    return o;
  };
  const model = (id: string, size: number, axis: 'x' | 'y' | 'z' | 'max', u: number, v: number, turn: number, solid = true) =>
    loadModel(id).then((g) => { fitSize(g, size, axis); place(g, u, v, turn, solid); return g; }).catch(() => null);

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
      place(block, mid, v, 0).position.y += 0.47;
      // The flames.
      const flame = flameMaterial();
      for (let n = 0; n < 14; n++) {
        const f = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.7), flame);
        f.position.copy(at(mid + (rnd() - 0.5) * width * 0.85, v + (rnd() - 0.5) * 2)).add(new THREE.Vector3(0, 0.9 + rnd() * 0.4, 0));
        f.scale.setScalar(0.8 + rnd() * 0.9);
        const f2 = new THREE.Mesh(f.geometry, flame); f2.rotation.y = Math.PI / 2; f.add(f2);   // crossed: fire from every side
        f.rotation.y = rnd() * 3;
        group.add(f);
      }
      fires.push({ pos: c, r: Math.max(2.2, width * 0.5) });
    } else if (k === 'car') {
      // Abandoned, slewed across one lane; the other lane is open.
      const lane = rnd() < 0.5 ? R.uL + width * 0.28 : R.uR - width * 0.28;
      jobs.push(model('covered_car', 4.6, 'max', lane, v, (rnd() - 0.5) * 0.9 + Math.PI / 2 * (rnd() < 0.5 ? 0 : 1)));
    }
  });
  return { group, props: Promise.all(jobs).then(() => undefined), fires, placed: kinds };
}
