// What a game mode needs to know about a map, derived from the built Level so any mode can run on any map without
// hand-placed data: the two team spawns, a bounding area, ground anchors spread over the playable space, and objective
// spots (the level's control points when it has them, else the anchors that sit farthest apart).
import * as THREE from 'three/webgpu';
import type { Level } from '../shrine';

export interface ArenaDescriptor {
  spawns: { a: THREE.Vector3; b: THREE.Vector3 };
  /** The playable area: a box round every anchor (+4 m), and its centre / horizontal radius. */
  bounds: { box: THREE.Box3; center: THREE.Vector3; radius: number };
  /** Standable ground points spread over the map (farthest-point sampled), for spawns, pickups, beacons. */
  anchors: THREE.Vector3[];
  /** Where objectives go: the control points, else three anchors far from each other. */
  objectives: THREE.Vector3[];
  /** Where foes may stand (the level's own enemy spots). */
  foeSpots: THREE.Vector3[];
}

type GroundAt = (x: number, z: number, fromY: number) => number | null;

/** Farthest-point sampling: start at `seed`, then keep taking the candidate farthest from everything taken. */
function spread(cands: THREE.Vector3[], n: number, seed: THREE.Vector3): THREE.Vector3[] {
  const out: THREE.Vector3[] = [], d = cands.map((c) => c.distanceToSquared(seed));
  for (let k = 0; k < n && k < cands.length; k++) {
    let bi = -1, bd = -1;
    for (let i = 0; i < cands.length; i++) if (d[i] > bd) { bd = d[i]; bi = i; }
    if (bi < 0 || bd <= 0.01) break;
    const p = cands[bi]; out.push(p);
    for (let i = 0; i < cands.length; i++) d[i] = Math.min(d[i], cands[i].distanceToSquared(p));
  }
  return out;
}

export function describeArena(level: Level, groundAt: GroundAt, nAnchors = 16): ArenaDescriptor {
  const a = level.spawns.a.pos.clone(), b = level.spawns.b.pos.clone();
  const known = [a, b, ...level.enemySpots.map((p) => p.clone()), ...(level.controlPoints ?? []).map((c) => c.pos.clone())];
  // extent of what the level placed itself; sampled ground is kept inside it (+ a margin), so an open world's 2 km
  // terrain doesn't pull anchors far from where its fights are laid out
  const kb = new THREE.Box3().setFromPoints(known).expandByScalar(6);
  const floorY = level.hazardBelow ?? -Infinity;
  const cands = [...known];
  const c0 = kb.getCenter(new THREE.Vector3()), sx = kb.max.x - kb.min.x, sz = kb.max.z - kb.min.z;
  const N = 14;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const x = kb.min.x + (sx * i) / N, z = kb.min.z + (sz * j) / N;
    const g = groundAt(x, z, kb.max.y + 4);
    if (g === null || g < floorY + 0.5 || g < kb.min.y - 2) continue;
    // the nearest known point must be at a similar height (not a roof, a tree crown or a pit far below the fights)
    let near = Infinity, nearY = 0;
    for (const k of known) { const dd = (k.x - x) ** 2 + (k.z - z) ** 2; if (dd < near) { near = dd; nearY = k.y; } }
    if (Math.abs(g - nearY) > 9) continue;
    cands.push(new THREE.Vector3(x, g + 0.1, z));
  }
  const anchors = spread(cands, nAnchors, a);
  const box = new THREE.Box3().setFromPoints([...anchors, a, b]).expandByScalar(4);
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.hypot(box.max.x - box.min.x, box.max.z - box.min.z) / 2;
  const cps = (level.controlPoints ?? []).map((c) => c.pos.clone());
  const objectives = cps.length ? cps : spread(anchors, 3, a);
  return { spawns: { a, b }, bounds: { box, center, radius }, anchors, objectives, foeSpots: level.enemySpots };
}
