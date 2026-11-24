// Rift Realm's prop kit: builds each Game Studio prefab (services/gamestudio/prefabs.ts RIFT_KIT) from
// the game's own builders (structures.ts, geom.ts), in world space so the world-projected textures line
// up exactly as they do in the hand-built levels. Used by the World view (one group per piece, so a
// single piece rebuilds when edited) and by the game (all pieces merged into one kit).

import * as THREE from 'three/webgpu';
import { StaticKit, boulder } from '../geom';
import { builders } from '../structures';
import { pbr } from '../textures';
import { prefabById, resolvedParams } from '../../../../services/gamestudio/prefabs';
import type { Instance, ParamValue } from '../../../../services/gamestudio/schema';
import { spawnPlaykitInstance } from '../../../../playkit/world/prefabSpawner';

type Mats = Record<string, THREE.Material>;
let mats: Mats | null = null;
/** Materials are shared by every piece (one set per page), so pieces batch by material. */
export function kitMaterials(): Mats {
  if (mats) return mats;
  const steel = new THREE.MeshStandardNodeMaterial({ map: pbr('volc-steel', { maps: [] }).map, color: 0x7d8a92, roughness: 0.5, metalness: 0.85 });
  mats = {
    stone: pbr('glacial-brick', { maps: ['normal', 'roughness', 'ao'], tint: 0x6e8271, normalScale: 1.2 }),
    darkStone: pbr('glacial-brick', { maps: ['normal', 'roughness', 'ao'], tint: 0x464e5a, normalScale: 1.3 }),
    basalt: pbr('volc-basalt', { maps: ['normal', 'roughness', 'ao'], tint: 0x7f8c86, normalScale: 1.2 }),
    brick: pbr('glacial-brick', { maps: ['normal', 'roughness', 'ao'], tint: 0x8a7a6a, normalScale: 1.2 }),
    steel,
  };
  return mats;
}

const num = (p: Record<string, ParamValue>, k: string) => p[k] as number;

/** Add one instance's geometry to a kit. Unknown prefabs are skipped (a newer file opened in an older build). */
export function buildInstance(kit: StaticKit, inst: Instance): boolean {
  const def = prefabById(inst.prefab);
  if (!def) return false;
  const p = resolvedParams(def, inst);
  const m = kitMaterials();
  const mat = m[p.material as string] ?? m.stone;
  const [x, y, z] = inst.pos;
  const yaw = (inst.rot[1] * Math.PI) / 180;
  const B = builders(kit);
  switch (def.id) {
    case 'rr.gothicWall': B.gothicWall(mat, x, z, yaw, num(p, 'len'), num(p, 'h'), num(p, 'bays'), y, num(p, 'thick')); break;
    case 'rr.curtainWall': B.curtain(mat, x, z, yaw, num(p, 'len'), num(p, 'h'), y, num(p, 'thick')); break;
    case 'rr.tower': {
      // the tower builder is axis-aligned; turn it by building at the origin and rotating the pieces
      const sub = new StaticKit();
      builders(sub).tower(mat, 0, 0, num(p, 'w'), num(p, 'h'), 0, p.spikes as boolean);
      mergeTurned(kit, sub, x, y, z, yaw);
      break;
    }
    case 'rr.stairs': B.flight(mat, x, y, z, yaw, y + num(p, 'rise'), num(p, 'width'), 0.25, 0.4, p.cheeks as boolean); break;
    case 'rr.steelStair': B.steelStair(m.steel, x, y, z, yaw, y + num(p, 'rise'), num(p, 'width')); break;
    case 'rr.block': kit.box(mat, num(p, 'w'), num(p, 'h'), num(p, 'd'), x, y + num(p, 'h') / 2, z, yaw); break;
    case 'rr.pillar': kit.prism(mat, num(p, 'sides'), num(p, 'r'), num(p, 'r') * 1.08, num(p, 'h'), x, y, z, yaw); break;
    case 'rr.boulder': {
      const r = num(p, 'r');
      const g = boulder(r, num(p, 'seed'));
      kit.place(g, x, y + r * 0.35, z, yaw);
      kit.add(mat, g, { tpm: 0.4 });
      break;
    }
    default: return false;
  }
  return true;
}

/** Move a sub-kit's pieces by a yaw + offset, then into the main kit (world UVs are recomputed there). */
function mergeTurned(kit: StaticKit, sub: StaticKit, x: number, y: number, z: number, yaw: number) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
  for (const b of sub.buckets.values()) for (const g of b.geos) {
    g.applyMatrix4(m);
    kit.add(b.mat, g, { solid: b.solid, shadow: b.shadow, tpm: 0.45 });
  }
}

/** Build one instance into its own group (World view: rebuild a single piece on edit). */
export function instanceGroup(inst: Instance): THREE.Group {
  const playkitSpawned = spawnPlaykitInstance(inst, { tagBvhCollide: true });
  if (playkitSpawned) {
    playkitSpawned.group.name = `instance:${inst.id}`;
    playkitSpawned.group.userData.instanceId = inst.id;
    return playkitSpawned.group;
  }
  const g = new THREE.Group();
  g.name = `instance:${inst.id}`;
  g.userData.instanceId = inst.id;
  const kit = new StaticKit();
  if (buildInstance(kit, inst)) kit.build(g);
  return g;
}

/** Build every instance into one kit under `parent` (the game: fewest draws). Returns how many were built. */
export function buildInstances(parent: THREE.Object3D, instances: Instance[]): number {
  if (!instances.length) return 0;
  const kit = new StaticKit();
  let built = 0;
  const g = new THREE.Group();
  g.name = 'studio-instances';
  for (const inst of instances) {
    if (buildInstance(kit, inst)) {
      built++;
    } else {
      const pk = spawnPlaykitInstance(inst, { tagBvhCollide: true });
      if (pk) {
        g.add(pk.group);
        built++;
      }
    }
  }
  kit.build(g);
  parent.add(g);
  return built;
}
