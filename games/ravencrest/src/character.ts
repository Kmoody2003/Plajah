// Jack Thorne: image-to-3D model from the supplied turnaround sheet (creation_3752922038),
// auto-rigged (24-joint humanoid), with locomotion retargeted from Mixamo-skeleton clips
// and the bushido combat set retargeted from the grindhouse survivor rig.
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { bakeMove, MOVES } from './fightClips';
import { addPonytail, type Ponytail } from './hair';

// Jack: the Tripo/Meshy image-to-3D build (default — the user's pick; its texture's stray
// back-of-head face is painted out by scripts/ravencrest/fixJackHead.py). Meta Muse's contract
// build is available with ?jack=muse.
const MESHY_JACK = new URLSearchParams(location.search).get('jack') !== 'muse';
const JACK_URL = MESHY_JACK ? '/games/ravencrest/assets/characters/jack_thorne.glb' : '/games/ravencrest/assets/characters/muse/jack_thorne.glb';
// Fight-move roles (Meshy names) → contract skeleton names.
const CONTRACT_ALIAS: Record<string, string> = { Spine02: 'Spine', Spine01: 'Spine1', Spine: 'Spine2', neck: 'Neck' };
const ANIM_SOURCE_URL = '/models/halloween/base_rigs/Soldier.glb';
export const GRINDHOUSE_URL = '/models/halloween/grindhouse_survivors_and_monsters.glb';
const HEIGHT_M = 1.83;

// Jack bone → Mixamo bone. Meshy's spine runs Spine02 (lowest) → Spine01 → Spine.
const BONE_MAP: Record<string, string> = {
  Hips: 'Hips', Spine02: 'Spine', Spine01: 'Spine1', Spine: 'Spine2', neck: 'Neck', Head: 'Head',
  LeftShoulder: 'LeftShoulder', LeftArm: 'LeftArm', LeftForeArm: 'LeftForeArm', LeftHand: 'LeftHand',
  RightShoulder: 'RightShoulder', RightArm: 'RightArm', RightForeArm: 'RightForeArm', RightHand: 'RightHand',
  LeftUpLeg: 'LeftUpLeg', LeftLeg: 'LeftLeg', LeftFoot: 'LeftFoot', LeftToeBase: 'LeftToeBase',
  RightUpLeg: 'RightUpLeg', RightLeg: 'RightLeg', RightFoot: 'RightFoot', RightToeBase: 'RightToeBase',
};
// Child used to measure each bone's rest direction for pose alignment.
const DIR_CHILD: Record<string, string> = {
  LeftShoulder: 'LeftArm', LeftArm: 'LeftForeArm', LeftForeArm: 'LeftHand',
  RightShoulder: 'RightArm', RightArm: 'RightForeArm', RightForeArm: 'RightHand',
  LeftUpLeg: 'LeftLeg', LeftLeg: 'LeftFoot', LeftFoot: 'LeftToeBase',
  RightUpLeg: 'RightLeg', RightLeg: 'RightFoot', RightFoot: 'RightToeBase',
  Spine02: 'Spine01', Spine01: 'Spine', Spine: 'neck', neck: 'Head',
};

export type CombatMove = 'cleave' | 'sweep' | 'combo' | 'backhand' | 'kata' | 'throw' | 'ready'
  | 'jab' | 'hook' | 'frontKick' | 'roundhouse' | 'spinKick' | 'flipKick' | 'flipCleave';

export interface Character {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  play(name: 'idle' | 'walk' | 'run'): void;
  /** 1-D blend tree on ground speed: idle → walk → run, playback rate matched to speed. */
  setLocomotion(speed: number, walkSpeed: number, runSpeed: number): void;
  /** One-shot full-body move blended over locomotion; returns its duration in seconds. */
  act(name: CombatMove, speed?: number): number;
  /** Cut the current one-shot (roll cancels a swing). */
  cancel(): void;
  /** The one-shot in progress (null when none). */
  readonly acting: { name: CombatMove; t: number; dur: number } | null;
  /** Right-hand bone (weapon socket). */
  hand: THREE.Object3D | null;
  /** Who this is (the fighting styles differ). */
  hero: Hero;
  /** Elise's simulated ponytail (set its `wind` from the weather). */
  hair?: Ponytail;
  /** Katana markers (trail sampling) and its steel (power glow). */
  blade: { base: THREE.Object3D; tip: THREE.Object3D; steel: THREE.MeshStandardNodeMaterial } | null;
}

/** Bone-name match, ignoring Mixamo prefixes and GLTFLoader's de-duplication suffix (_1, _2…). */
export const findBone = (root: THREE.Object3D, name: string) => {
  let hit: THREE.Bone | undefined;
  root.traverse((o) => {
    if (hit || !(o as THREE.Bone).isBone) return;
    const n = o.name;
    if (n === name || n === `mixamorig:${name}` || n === `mixamorig${name}` || n.replace(/_\d+$/, '') === name) hit = o as THREE.Bone;
  });
  return hit;
};

const worldQuat = (o: THREE.Object3D) => o.getWorldQuaternion(new THREE.Quaternion());
const worldPos = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());

// Rest pose = the bone transforms as loaded. (skeleton.pose() is wrong here: Meshy's root
// bone sits under a 0.01-scaled Armature node, and pose() re-applies that scale to the
// hips, shrinking the whole skeleton 100×.)
const REST = new WeakMap<THREE.Object3D, { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 }>();
export function snapshotRest(root: THREE.Object3D) {
  root.traverse((o) => { if ((o as THREE.Bone).isBone && !REST.has(o)) REST.set(o, { p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() }); });
}
export function restPose(root: THREE.Object3D) {
  snapshotRest(root);
  root.traverse((o) => {
    const r = REST.get(o);
    if (r) { o.position.copy(r.p); o.quaternion.copy(r.q); o.scale.copy(r.s); }
  });
  root.updateMatrixWorld(true);
}

/** How a source rig's bones line up with a target's. */
export interface RigSpec {
  /** target bone → source bone */
  map: Record<string, string>;
  /** target bone → target child used to measure its rest direction */
  dirChild: Record<string, string>;
  dstLegs: [string, string];
  srcLegs: [string, string];
  /**
   * The source's L/R names are mirrored relative to its mesh (the grindhouse rigs: "_L" bones
   * sit on the character's right). Motion is mirrored across the sagittal plane so each side
   * lands on the anatomically matching side (the katana stays in the right hand).
   */
  mirror?: boolean;
}

export const SOLDIER_TO_JACK: RigSpec = { map: BONE_MAP, dirChild: DIR_CHILD, dstLegs: ['LeftUpLeg', 'RightUpLeg'], srcLegs: ['LeftUpLeg', 'RightUpLeg'] };
export const GRIND_TO_JACK: RigSpec = {
  map: {
    Hips: 'Hips', Spine02: 'Spine', Spine01: 'Chest', neck: 'Neck', Head: 'Head',
    LeftArm: 'UpperArm_L', LeftForeArm: 'LowerArm_L', LeftHand: 'Hand_L',
    RightArm: 'UpperArm_R', RightForeArm: 'LowerArm_R', RightHand: 'Hand_R',
    LeftUpLeg: 'UpLeg_L', LeftLeg: 'LowLeg_L', LeftFoot: 'Foot_L',
    RightUpLeg: 'UpLeg_R', RightLeg: 'LowLeg_R', RightFoot: 'Foot_R',
  },
  dirChild: { ...DIR_CHILD, Spine01: 'neck' },
  dstLegs: ['LeftUpLeg', 'RightUpLeg'], srcLegs: ['UpLeg_L', 'UpLeg_R'], mirror: true,
};
const J17 = ['Hips', 'Spine', 'Chest', 'Neck', 'Head', 'UpperArm_L', 'LowerArm_L', 'Hand_L', 'UpperArm_R', 'LowerArm_R', 'Hand_R', 'UpLeg_L', 'LowLeg_L', 'Foot_L', 'UpLeg_R', 'LowLeg_R', 'Foot_R'];
/** Grindhouse 17-joint clips → the 17-joint monster/cast rigs (same names). */
export const GRIND_TO_RIG17: RigSpec = {
  map: Object.fromEntries(J17.map((n) => [n, n])),
  dirChild: { Spine: 'Chest', Chest: 'Neck', Neck: 'Head', UpperArm_L: 'LowerArm_L', LowerArm_L: 'Hand_L', UpperArm_R: 'LowerArm_R', LowerArm_R: 'Hand_R', UpLeg_L: 'LowLeg_L', LowLeg_L: 'Foot_L', UpLeg_R: 'LowLeg_R', LowLeg_R: 'Foot_R' },
  dstLegs: ['UpLeg_L', 'UpLeg_R'], srcLegs: ['UpLeg_L', 'UpLeg_R'], mirror: true,
};

/** CMU motion capture (DAZ-named FBX from the cgspeed BVH conversion) → the Muse contract skeleton. */
export const CMU_TO_CONTRACT: RigSpec = {
  map: {
    Hips: 'hip', Spine: 'abdomen', Spine2: 'chest', Neck: 'neck', Head: 'head',
    LeftShoulder: 'lCollar', LeftArm: 'lShldr', LeftForeArm: 'lForeArm', LeftHand: 'lHand',
    RightShoulder: 'rCollar', RightArm: 'rShldr', RightForeArm: 'rForeArm', RightHand: 'rHand',
    LeftUpLeg: 'lThigh', LeftLeg: 'lShin', LeftFoot: 'lFoot',
    RightUpLeg: 'rThigh', RightLeg: 'rShin', RightFoot: 'rFoot',
  },
  dirChild: {
    Spine: 'Spine2', Spine2: 'Neck', Neck: 'Head',
    LeftShoulder: 'LeftArm', LeftArm: 'LeftForeArm', LeftForeArm: 'LeftHand',
    RightShoulder: 'RightArm', RightArm: 'RightForeArm', RightForeArm: 'RightHand',
    LeftUpLeg: 'LeftLeg', LeftLeg: 'LeftFoot', RightUpLeg: 'RightLeg', RightLeg: 'RightFoot',
  },
  dstLegs: ['LeftUpLeg', 'RightUpLeg'], srcLegs: ['lThigh', 'rThigh'],
};

const mirrorQ = (q: THREE.Quaternion) => q.set(q.x, -q.y, -q.z, q.w);

/** A CMU capture (assets/mocap/<id>.fbx) retargeted onto a contract-skeleton model. */
async function mocapClip(model: THREE.Object3D, id: string, name: string): Promise<THREE.AnimationClip> {
  const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js');
  const fbx = await new FBXLoader().loadAsync(`/games/ravencrest/assets/mocap/${id}.fbx`);
  return retarget(model, fbx, fbx.animations[0], name, CMU_TO_CONTRACT);
}

/** Bake `clip` (on `src`) into a clip for `dst`, aligning rest poses bone by bone. */
export function retarget(dst: THREE.Object3D, src: THREE.Object3D, clip: THREE.AnimationClip, name: string, spec: RigSpec = SOLDIER_TO_JACK, fps = 30): THREE.AnimationClip {
  restPose(dst);
  restPose(src);
  const { map, dirChild, mirror } = spec;
  const pairs = Object.entries(map)
    .map(([t, s]) => ({ t: findBone(dst, t), s: findBone(src, s), tName: t }))
    .filter((p): p is { t: THREE.Bone; s: THREE.Bone; tName: string } => !!p.t && !!p.s);
  const mapped = new Map<THREE.Object3D, string>(pairs.map((p) => [p.t, p.tName]));

  // Facing compensation: rigs may face different ways (+Z vs -Z). Forward = (L hip − R hip) × up.
  const facing = (root: THREE.Object3D, [l, r]: [string, string], mir: boolean) => {
    const d = worldPos(findBone(root, l)!).sub(worldPos(findBone(root, r)!)).setY(0);
    if (mir) d.x = -d.x;
    return d.normalize().cross(new THREE.Vector3(0, 1, 0)).normalize();
  };
  // Pure yaw about +Y. (setFromUnitVectors picks an arbitrary axis for opposed vectors,
  // which flipped the rig upside-down about X and put Jack's face on the back of his head.)
  const fs = facing(src, spec.srcLegs, !!mirror), fd = facing(dst, spec.dstLegs, false);
  const F = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(fd.x, fd.z) - Math.atan2(fs.x, fs.z));
  const Finv = F.clone().invert();
  const Qs0 = new Map<string, THREE.Quaternion>();
  const Qt0 = new Map<string, THREE.Quaternion>();
  const align = new Map<string, THREE.Quaternion>();
  for (const { t, s, tName } of pairs) {
    Qs0.set(tName, worldQuat(s));
    Qt0.set(tName, worldQuat(t));
    const c = dirChild[tName];
    const tc = c && findBone(dst, c);
    const sc = c && map[c] && findBone(src, map[c]);
    if (tc && sc) {
      const dt = worldPos(tc).sub(worldPos(t)).normalize();
      const ds = worldPos(sc).sub(worldPos(s));
      if (mirror) ds.x = -ds.x;
      ds.normalize().applyQuaternion(F);
      align.set(tName, new THREE.Quaternion().setFromUnitVectors(dt, ds));
    } else align.set(tName, new THREE.Quaternion());
  }
  const tHips = findBone(dst, 'Hips')!, sHips = findBone(src, spec.map.Hips ?? 'Hips')!;
  const sHip0 = worldPos(sHips);
  const tHip0Local = tHips.position.clone();
  tHips.parent!.updateWorldMatrix(true, false);
  const parentQInv = worldQuat(tHips.parent!).invert();
  const parentScale = tHips.parent!.getWorldScale(new THREE.Vector3());
  // Hip height above each rig's feet (rigs don't all stand at y = 0 in their files).
  const footY = (r: THREE.Object3D) => {
    const b = new THREE.Box3().setFromObject(r);
    if (!b.isEmpty()) return b.min.y;
    // Skeleton-only sources (CMU mocap FBX): the lowest bone stands in for the feet.
    let y = Infinity;
    r.traverse((o) => { if ((o as THREE.Bone).isBone) y = Math.min(y, worldPos(o).y); });
    return y;
  };
  const ratio = (worldPos(tHips).y - footY(dst)) / Math.max(1e-4, sHip0.y - footY(src));

  const mixer = new THREE.AnimationMixer(src);
  const action = mixer.clipAction(clip);
  action.play();
  const frames = Math.max(2, Math.round(clip.duration * fps));
  const times: number[] = [];
  const qTracks = new Map<string, number[]>(pairs.map((p) => [p.tName, []]));
  const hipTrack: number[] = [];
  const targetWorld = new Map<string, THREE.Quaternion>();
  // World rotation of any target bone this frame: mapped bones from the bake, unmapped ones
  // (Meshy's shoulders, the upper spine) ride on their nearest mapped ancestor at rest offset.
  const worldOf = (b: THREE.Object3D): THREE.Quaternion => {
    const n = mapped.get(b);
    if (n) return targetWorld.get(n)!;
    if (!(b as THREE.Bone).isBone || !b.parent) return worldQuat(b);
    return worldOf(b.parent).clone().multiply(b.quaternion);
  };

  for (let f = 0; f <= frames; f++) {
    const time = (f / frames) * clip.duration;
    times.push(time);
    mixer.setTime(time);
    src.updateMatrixWorld(true);
    for (const { s, tName } of pairs) {
      // Wt = F·(Ws·Ws0⁻¹)·F⁻¹ · align · Wt0  (source motion re-expressed in the target's facing)
      const deltaS = worldQuat(s).multiply(Qs0.get(tName)!.clone().invert());
      if (mirror) mirrorQ(deltaS);
      const wt = F.clone().multiply(deltaS).multiply(Finv).multiply(align.get(tName)!).multiply(Qt0.get(tName)!);
      targetWorld.set(tName, wt);
    }
    for (const { t, tName } of pairs) {
      const local = worldOf(t.parent!).clone().invert().multiply(targetWorld.get(tName)!);
      qTracks.get(tName)!.push(local.x, local.y, local.z, local.w);
    }
    // Hips: vertical bob + sway, scaled to the target, expressed in the hips' parent space.
    const delta = worldPos(sHips).sub(sHip0);
    if (mirror) delta.x = -delta.x;
    delta.multiplyScalar(ratio).applyQuaternion(F);
    delta.x = delta.x * 0.6; delta.z = 0; // in-place locomotion
    // Convert the world-space offset into the hips' parent space explicitly: Meshy
    // armatures are in centimetres (0.01 scale), so the parent's scale matters.
    const local = tHip0Local.clone().add(delta.applyQuaternion(parentQInv).divide(parentScale));
    hipTrack.push(local.x, local.y, local.z);
  }
  action.stop();
  mixer.uncacheRoot(src);
  restPose(dst);
  restPose(src);

  const tracks: THREE.KeyframeTrack[] = pairs.map(({ t, tName }) => new THREE.QuaternionKeyframeTrack(`${t.name}.quaternion`, times, qTracks.get(tName)!));
  tracks.push(new THREE.VectorKeyframeTrack(`${tHips.name}.position`, times, hipTrack));
  return new THREE.AnimationClip(name, clip.duration, tracks);
}

const glbCache = new Map<string, Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>>();
/** Shared GLB loads (Jack, the monsters and the cast all draw clips from the grindhouse file). */
export function loadGLB(url: string) {
  if (!glbCache.has(url)) glbCache.set(url, new GLTFLoader().loadAsync(url).then((g) => { snapshotRest(g.scene); return g; }));
  return glbCache.get(url)!;
}

/** Procedural katana (the grindhouse sheets' bushido blade); local +Y runs up the blade. */
function katana(): THREE.Group & { userData: { base: THREE.Object3D; tip: THREE.Object3D; steel: THREE.MeshStandardNodeMaterial } } {
  const g = new THREE.Group() as THREE.Group & { userData: { base: THREE.Object3D; tip: THREE.Object3D; steel: THREE.MeshStandardNodeMaterial } };
  g.name = 'katana';
  const steel = new THREE.MeshStandardNodeMaterial({ color: 0xc9d1dc, roughness: 0.16, metalness: 1 });
  const wrap = new THREE.MeshStandardNodeMaterial({ color: 0x1a1210, roughness: 0.85 });
  const gold = new THREE.MeshStandardNodeMaterial({ color: 0x8a6a2a, roughness: 0.4, metalness: 1 });
  // Tapered blade with a shallow curve toward the back edge.
  const blade = new THREE.BoxGeometry(0.032, 0.76, 0.006, 1, 16, 1);
  const p = blade.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) + 0.38, t = y / 0.76;
    p.setX(i, p.getX(i) * (1 - t * 0.55) + t * t * 0.045);
    p.setY(i, y + 0.14);
  }
  blade.computeVertexNormals();
  g.add(new THREE.Mesh(blade, steel));
  const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 14), gold);
  guard.position.y = 0.135;
  g.add(guard);
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.26, 8), wrap));
  g.traverse((o) => { (o as THREE.Mesh).castShadow = true; });
  const base = new THREE.Object3D(); base.position.y = 0.17;
  const tip = new THREE.Object3D(); tip.position.y = 0.9;
  g.add(base, tip);
  g.userData = { base, tip, steel };
  return g;
}

/** The playable heroes (start menu): Jack (Tripo model, retargeted locomotion) or Elise (built from her
 *  sheet, contract skeleton, CMU motion-capture walk/run). */
export type Hero = 'jack' | 'elise';
const HEROES: Record<Hero, { url: string; height: number; name: string; mocap?: { walk: string; run: string } }> = {
  jack: { url: JACK_URL, height: HEIGHT_M, name: 'JackThorne' },
  elise: { url: '/games/ravencrest/assets/characters/elise.glb', height: 1.72, name: 'EliseCarter', mocap: { walk: '02_01', run: '02_03' } },
};

/** Start downloading a hero's model (and the shared locomotion rig) early; loadJack reuses the fetch. */
export function prefetchHero(hero: Hero) { loadGLB(HEROES[hero].url).catch(() => {}); loadGLB(ANIM_SOURCE_URL).catch(() => {}); }

export async function loadJack(hero: Hero = 'jack'): Promise<Character> {
  const H = HEROES[hero];
  const [jack, soldier] = await Promise.all([loadGLB(H.url), loadGLB(ANIM_SOURCE_URL)]);
  const model = jack.scene;
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      const mat = m.material as THREE.MeshStandardMaterial;
      // Generated albedo has some baked light; keep it matte and slightly cooler like the sheet.
      mat.roughness = Math.max(mat.roughness ?? 0.8, 0.75);
      mat.metalness = 0;
    }
  });
  // Measured in bind pose (bones as loaded); Box3 accounts for skinning and the cm armature.
  const box = new THREE.Box3().setFromObject(model);
  const minY = box.min.y, height = box.max.y - box.min.y;
  const s = H.height / height;
  model.scale.setScalar(s);
  model.position.y = -minY * s;
  const root = new THREE.Group();
  root.name = H.name;
  root.add(model);
  root.updateMatrixWorld(true);

  const contract = !!findBone(model, 'Spine2');
  const byName = (n: string) => soldier.animations.find((a) => a.name.toLowerCase() === n)!;
  const baked = (n: string) => jack.animations.find((a) => a.name === n);
  // Contract model: its own baked locomotion. Meshy model: retargeted from the Soldier rig.
  const clips = H.mocap ? {
    // Real captured locomotion (CMU), retargeted onto the contract skeleton.
    idle: baked('idle') ?? retarget(model, soldier.scene, byName('idle'), 'idle'),
    walk: await mocapClip(model, H.mocap.walk, 'walk'),
    run: await mocapClip(model, H.mocap.run, 'run'),
  } : contract && baked('idle') && baked('walk') && baked('run') ? {
    idle: baked('idle')!, walk: baked('walk')!, run: baked('run')!,
  } : {
    idle: retarget(model, soldier.scene, byName('idle'), 'idle'),
    walk: retarget(model, soldier.scene, byName('walk'), 'walk'),
    run: retarget(model, soldier.scene, byName('run'), 'run'),
  };
  // Combat moves: authored katana key poses baked onto Jack's own skeleton (fightClips.ts).
  // In the rest pose the blade points along the body's forward axis (+Z), see the mount below.
  const moves = Object.fromEntries(Object.entries(MOVES).map(([k, def]) => [k, bakeMove(model, k, def, new THREE.Vector3(0, 0, 1), contract ? CONTRACT_ALIAS : {})])) as Record<CombatMove, THREE.AnimationClip>;

  // Katana in the right hand: in the rest pose the blade points along the body's forward axis.
  const hand = findBone(model, 'RightHand') ?? null;
  let blade: Character['blade'] = null;
  if (hand) {
    const k = katana();
    blade = k.userData;
    hand.updateWorldMatrix(true, false);
    const hs = hand.getWorldScale(new THREE.Vector3()).x;
    k.scale.setScalar(1 / hs);
    const want = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2); // +Y → +Z
    const hq = worldQuat(hand);
    k.quaternion.copy(hq.clone().invert().multiply(want));
    const fore = findBone(model, 'RightForeArm');
    const grip = fore ? worldPos(hand).sub(worldPos(fore)).normalize().multiplyScalar(0.07) : new THREE.Vector3();
    k.position.copy(grip.applyQuaternion(hq.clone().invert()).divideScalar(hs));
    hand.add(k);
  }

  // Elise's ponytail: the model only has it painted flat, so it's built and simulated (hair.ts).
  const headBone = findBone(model, 'Head');
  const hair = hero === 'elise' && headBone ? addPonytail(model, headBone, root) : undefined;

  const mixer = new THREE.AnimationMixer(model);
  const actions = Object.fromEntries(Object.entries(clips).map(([k, c]) => [k, mixer.clipAction(c)])) as Record<keyof typeof clips, THREE.AnimationAction>;
  const oneShots = Object.fromEntries(Object.entries(moves).map(([k, c]) => {
    const a = mixer.clipAction(c);
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    return [k, a];
  })) as Record<CombatMove, THREE.AnimationAction>;
  // All three run continuously; weights come from speed so transitions are seamless.
  // Walk and run are phase-synced (same normalised time) to avoid foot pops in the cross-fade.
  for (const a of Object.values(actions)) { a.play(); a.setEffectiveWeight(0); }
  actions.idle.setEffectiveWeight(1);
  const w = { idle: 1, walk: 0, run: 0 };
  let manual: keyof typeof clips | null = null;
  let acting: { name: CombatMove; t: number; dur: number; a: THREE.AnimationAction } | null = null;
  const play = (name: keyof typeof clips) => { manual = name; };
  const act = (name: CombatMove, speed = 1) => {
    if (acting) acting.a.stop();
    const a = oneShots[name];
    a.reset();
    a.setEffectiveTimeScale(speed);
    a.setEffectiveWeight(0);
    a.play();
    acting = { name, t: 0, dur: moves[name].duration / speed, a };
    return acting.dur;
  };
  const cancel = () => { if (acting) { acting.dur = Math.min(acting.dur, acting.t + 0.1); } };
  const setLocomotion = (speed: number, walkSpeed: number, runSpeed: number) => {
    manual = null;
    let ti = 0, tw = 0, tr = 0;
    if (speed <= walkSpeed) { tw = THREE.MathUtils.smoothstep(speed, 0.05, walkSpeed); ti = 1 - tw; }
    else { tr = THREE.MathUtils.smoothstep(speed, walkSpeed, runSpeed); tw = 1 - tr; }
    const k = 0.2; // weight smoothing per frame
    w.idle += (ti - w.idle) * k; w.walk += (tw - w.walk) * k; w.run += (tr - w.run) * k;
    // Natural clip speeds (Soldier rig): walk ≈1.45 m/s, run ≈4.3 m/s.
    const walkRate = THREE.MathUtils.clamp(speed / 1.45, 0.7, 1.6);
    const runRate = THREE.MathUtils.clamp(speed / 4.3, 0.75, 1.35);
    actions.walk.setEffectiveTimeScale(walkRate);
    actions.run.setEffectiveTimeScale(runRate);
    if (w.run > 0.05 && w.walk > 0.05) {
      const ph = actions.walk.time / clips.walk.duration;
      actions.run.time = ph * clips.run.duration;
    }
  };
  const origUpdate = mixer.update.bind(mixer);
  mixer.update = (dt: number) => {
    // A one-shot fades in over 80 ms and out over its last 180 ms; locomotion fills the rest.
    let ow = 0;
    if (acting) {
      acting.t += dt;
      ow = THREE.MathUtils.clamp(Math.min(acting.t / 0.08, (acting.dur - acting.t) / 0.18), 0, 1);
      acting.a.setEffectiveWeight(ow);
      if (acting.t >= acting.dur) { acting.a.stop(); acting = null; ow = 0; }
    }
    if (manual) { // review/cutscene override
      for (const [k, a] of Object.entries(actions)) a.setEffectiveWeight(k === manual ? 1 - ow : 0);
    } else {
      actions.idle.setEffectiveWeight(w.idle * (1 - ow));
      actions.walk.setEffectiveWeight(w.walk * (1 - ow));
      actions.run.setEffectiveWeight(w.run * (1 - ow));
    }
    const r = origUpdate(dt);
    hair?.update(dt);
    return r;
  };
  return {
    root, mixer, play, setLocomotion, act, cancel, hand, blade, hair, hero,
    get acting() { return acting ? { name: acting.name, t: acting.t, dur: acting.dur } : null; },
  };
}
