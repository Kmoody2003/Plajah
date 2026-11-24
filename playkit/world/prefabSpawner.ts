// playkit/world/prefabSpawner.ts
//
// Universal Playkit Runtime Prefab Spawner (Studio -> Playable World Bridge).
// Reconstructs any Aria-compiled or Creator-registered `Instance` from its parametric GameProject
// recipe into live `three/webgpu` geometry, automatic collision tagging (walkable BIM doorways!),
// SH9 irradiance probes, parallax reflection boxes, and physics collider specs.

import * as THREE from 'three/webgpu';
import type { Instance } from '../../services/gamestudio/schema';
import type { AssetPipelineKind } from '../../services/gamestudio/compiler/schema';
import type { BakedIrradianceProbe, ParallaxReflectionBox } from '../../services/gamestudio/compiler/lightBaker';
import { AriaStudioAgent, type AriaProductionResult } from '../../services/gamestudio/ariaAgent';
import { ariaResultToThreeGroup } from '../render/threeBridge';
import type { PlajahPhysicsWorld, RigidBodySpec, Vec3 } from '../physics/runtime';

const DEG2RAD = Math.PI / 180;
const ARIA_PREFIXES = [
  'prefab.arch.',
  'prefab.vegetation.',
  'prefab.organic.',
  'prefab.hardsurface.',
  'prefab.parlor.',
  'prefab.sprite2d.',
];

export interface SpawnedPrefabHandle {
  instanceId: string;
  prefabId: string;
  group: THREE.Group;
  result: AriaProductionResult;
  probes: BakedIrradianceProbe[];
  reflectionBoxes: ParallaxReflectionBox[];
  colliderSpecs: RigidBodySpec[];
}

export interface PrefabSpawnerOptions {
  agent?: AriaStudioAgent;
  /** Tag solid meshes with `userData.collide = true` for BVH capsule worlds (doors remain passable). */
  tagBvhCollide?: boolean;
  showProbes?: boolean;
  cutawayInterior?: boolean;
  /** Optional physics world to auto-register static/dynamic colliders into. */
  physicsWorld?: PlajahPhysicsWorld;
}

const sharedAgent = new AriaStudioAgent();
const compileCache = new Map<string, AriaProductionResult>();

export function isPlaykitPrefabId(prefabId: string): boolean {
  return ARIA_PREFIXES.some((p) => prefabId.startsWith(p));
}

export function clearPrefabSpawnCache(): void {
  compileCache.clear();
}

function cacheKey(inst: Instance): string {
  const p = inst.params ?? {};
  return `${inst.prefab}|${String(p.pipeline ?? '')}|${String(p.prompt ?? '')}|${String(p.seed ?? '')}|${String(p.stories ?? '')}|${String(p.widthM ?? '')}|${String(p.depthM ?? '')}`;
}

/**
 * Resolve & spawn one parametric `Instance` into a positioned, scaled, collision-tagged Three.js Group.
 * Returns null if the instance is not a Playkit/Aria prefab (so legacy game kits handle it normally).
 */
export function spawnPlaykitInstance(inst: Instance, opts: PrefabSpawnerOptions = {}): SpawnedPrefabHandle | null {
  if (!isPlaykitPrefabId(inst.prefab)) return null;

  const agent = opts.agent ?? sharedAgent;
  const key = cacheKey(inst);
  let result = compileCache.get(key);

  if (!result) {
    const params = inst.params ?? {};
    const pipelineHint = typeof params.pipeline === 'string'
      ? (params.pipeline as AssetPipelineKind)
      : inst.prefab.startsWith('prefab.arch.') ? 'architecture'
      : inst.prefab.startsWith('prefab.vegetation.') ? 'vegetation'
      : inst.prefab.startsWith('prefab.organic.') ? 'organic'
      : inst.prefab.startsWith('prefab.hardsurface.') ? 'hard-surface'
      : inst.prefab.startsWith('prefab.parlor.') ? 'parlor-stage'
      : '2d-sprite';

    const prompt = typeof params.prompt === 'string' && params.prompt.trim()
      ? params.prompt
      : inst.prefab.replace(/^prefab\.[^.]+\./, '').replace(/[_-]+/g, ' ');

    result = agent.produce({
      id: inst.prefab.replace(/^prefab\.[^.]+\./, ''),
      name: typeof params.ariaName === 'string' ? params.ariaName : undefined,
      prompt,
      pipelineHint,
      params,
    });
    compileCache.set(key, result);
  }

  const group = ariaResultToThreeGroup(result, {
    showProbes: opts.showProbes,
    cutawayInterior: opts.cutawayInterior,
  });
  group.name = `playkit:${inst.id}`;
  group.userData.instanceId = inst.id;
  group.userData.prefabId = inst.prefab;

  group.position.set(inst.pos[0], inst.pos[1], inst.pos[2]);
  group.rotation.set(inst.rot[0] * DEG2RAD, inst.rot[1] * DEG2RAD, inst.rot[2] * DEG2RAD);
  group.scale.set(inst.scale[0], inst.scale[1], inst.scale[2]);

  // Tag solid meshes for BVH collision worlds while keeping doors & foliage cards passable!
  if (opts.tagBvhCollide !== false) {
    group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const lowerName = (mesh.name || '').toLowerCase();
      if (
        mesh.userData.ifcClass === 'IfcDoor' ||
        lowerName.includes('door') ||
        lowerName.includes('leaf') ||
        lowerName.includes('leaves')
      ) {
        return;
      }
      mesh.userData.collide = true;
    });
  }

  // Transform baked probes & reflection boxes into world space
  const ox = inst.pos[0], oy = inst.pos[1], oz = inst.pos[2];
  const probes: BakedIrradianceProbe[] = result.probes.map((p) => ({
    ...p,
    id: `${inst.id}:${p.id}`,
    position: [p.position[0] + ox, p.position[1] + oy, p.position[2] + oz],
  }));
  const reflectionBoxes: ParallaxReflectionBox[] = result.reflectionBoxes.map((b) => ({
    ...b,
    id: `${inst.id}:${b.id}`,
    center: [b.center[0] + ox, b.center[1] + oy, b.center[2] + oz],
    boxMin: [b.boxMin[0] + ox, b.boxMin[1] + oy, b.boxMin[2] + oz],
    boxMax: [b.boxMax[0] + ox, b.boxMax[1] + oy, b.boxMax[2] + oz],
  }));

  // Emit physics collider specs (and optionally register directly into PlajahPhysicsWorld)
  const colliderSpecs: RigidBodySpec[] = result.manifest.physics.colliders.map((c, idx) => {
    const pos: Vec3 = [ox + c.offset[0] * inst.scale[0], oy + c.offset[1] * inst.scale[1], oz + c.offset[2] * inst.scale[2]];
    const spec: RigidBodySpec = {
      id: `${inst.id}:col:${idx}`,
      kind: result.manifest.physics.bodyKind,
      position: pos,
      rotationYaw: inst.rot[1] * DEG2RAD,
      mass: result.manifest.physics.massKg,
      shape: c.shape,
      surfaceTag: result.manifest.physics.surfaceTag,
      userData: { instanceId: inst.id, prefabId: inst.prefab },
    };
    opts.physicsWorld?.addBody(spec);
    return spec;
  });

  return {
    instanceId: inst.id,
    prefabId: inst.prefab,
    group,
    result,
    probes,
    reflectionBoxes,
    colliderSpecs,
  };
}

/** Batch-spawn all Playkit/Aria instances in a level and return spawned handles + combined GI probes. */
export function spawnPlaykitLevelInstances(
  parent: THREE.Object3D,
  instances: ReadonlyArray<Instance>,
  opts: PrefabSpawnerOptions = {},
): { handles: SpawnedPrefabHandle[]; probes: BakedIrradianceProbe[]; reflectionBoxes: ParallaxReflectionBox[] } {
  const handles: SpawnedPrefabHandle[] = [];
  const probes: BakedIrradianceProbe[] = [];
  const reflectionBoxes: ParallaxReflectionBox[] = [];

  for (const inst of instances) {
    const h = spawnPlaykitInstance(inst, opts);
    if (!h) continue;
    parent.add(h.group);
    handles.push(h);
    probes.push(...h.probes);
    reflectionBoxes.push(...h.reflectionBoxes);
  }
  return { handles, probes, reflectionBoxes };
}
