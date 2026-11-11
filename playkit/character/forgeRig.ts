/**
 * forgeRig.ts — brings a Character Forge GLB to life in any playkit game (Era Clash, Ravencrest).
 *
 * The GLB carries what glTF has no word for in `extras.forge` on its root node: spring chains and the body capsules
 * they collide with, corrective-shape drivers, twist drivers, hand grips and the blade's markers. This reads them and
 * runs, once per frame after the animation mixer: twist and grip, the correctives, then the springs.
 */
import * as THREE from 'three/webgpu';
import { SpringBones, type CapsuleSpec, type SpringChainSpec } from './springBones';
import { MorphDrivers, type MorphDriverSpec, type TwistDriverSpec } from './morphDrivers';
import { enableDualQuaternionSkinning } from './dqSkinning';

export interface ForgeExtras {
  version: number;
  /** Standing height of the authored figure in metres (crown to sole, hair included). */
  height: number;
  springs: SpringChainSpec[];
  capsules: CapsuleSpec[];
  drivers: MorphDriverSpec[];
  twists: TwistDriverSpec[];
  /** Hand poses: bone → local rotation [x, y, z, w]. */
  grips: Record<string, Record<string, [number, number, number, number]>>;
  /** Which grip each hand holds by default. */
  hold: Record<string, string>;
  /** Pieces the game may hide (e.g. the kabuto) and whether they start shown. */
  optional?: Record<string, boolean>;
}

export interface ForgeRig {
  extras: ForgeExtras;
  springs: SpringBones;
  drivers: MorphDrivers;
  /** Set a hand's grip by name ('katana', 'fist', 'relaxed'). */
  grip(hand: 'Left' | 'Right', pose: string): void;
  update(dt: number): void;
  /** Spring + driver cost of the last frame, ms. */
  readonly costMs: number;
}

export function findForgeExtras(root: THREE.Object3D): ForgeExtras | null {
  let found: ForgeExtras | null = null;
  root.traverse((o) => { if (!found && o.userData?.forge?.springs) found = o.userData.forge as ForgeExtras; });
  return found;
}

export function forgeRig(model: THREE.Object3D, opts: { dqs?: boolean } = {}): ForgeRig | null {
  const extras = findForgeExtras(model);
  if (!extras) return null;
  const dqsOff = typeof location !== 'undefined' && new URLSearchParams(location.search).get('dqs') === '0';
  if (opts.dqs !== false && !dqsOff) model.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) enableDualQuaternionSkinning(o as THREE.SkinnedMesh); });
  const springs = new SpringBones(model, extras.springs, extras.capsules);
  const drivers = new MorphDrivers(model, extras.drivers, extras.twists);
  const bones = new Map<string, THREE.Object3D>();
  model.traverse((o) => { if ((o as THREE.Bone).isBone) bones.set(o.name, o); });
  const held: Record<string, string> = { ...extras.hold };
  for (const [name, on] of Object.entries(extras.optional ?? {})) { const o = model.getObjectByName(name); if (o) o.visible = on; }
  let cost = 0;
  const applyGrips = () => {
    for (const pose of Object.values(held)) {
      const g = extras.grips[pose];
      if (!g) continue;
      for (const [bone, q] of Object.entries(g)) bones.get(bone)?.quaternion.set(q[0], q[1], q[2], q[3]);
    }
  };
  let first = true;
  return {
    extras, springs, drivers,
    grip(hand, pose) { held[hand] = `${hand}:${pose}`; },
    update(dt) {
      const t0 = performance.now();
      applyGrips();
      drivers.updateTwists();
      model.updateMatrixWorld(true);
      drivers.update();
      if (first) { springs.reset(); first = false; }
      springs.update(dt);
      cost = performance.now() - t0;
    },
    get costMs() { return cost; },
  };
}
