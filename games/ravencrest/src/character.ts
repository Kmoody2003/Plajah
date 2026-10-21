// Jack Thorne: image-to-3D model from the supplied turnaround sheet (creation_3752922038),
// auto-rigged (24-joint humanoid), with locomotion retargeted from Mixamo-skeleton clips.
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const JACK_URL = '/games/ravencrest/assets/characters/jack_thorne.glb';
const ANIM_SOURCE_URL = '/models/halloween/base_rigs/Soldier.glb';
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

export interface Character {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  play(name: 'idle' | 'walk' | 'run'): void;
  /** 1-D blend tree on ground speed: idle → walk → run, playback rate matched to speed. */
  setLocomotion(speed: number, walkSpeed: number, runSpeed: number): void;
}

const findBone = (root: THREE.Object3D, name: string) => {
  let hit: THREE.Bone | undefined;
  root.traverse((o) => {
    if (!hit && (o as THREE.Bone).isBone && (o.name === name || o.name === `mixamorig:${name}` || o.name === `mixamorig${name}`)) hit = o as THREE.Bone;
  });
  return hit;
};

const worldQuat = (o: THREE.Object3D) => o.getWorldQuaternion(new THREE.Quaternion());
const worldPos = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());

// Rest pose = the bone transforms as loaded. (skeleton.pose() is wrong here: Meshy's root
// bone sits under a 0.01-scaled Armature node, and pose() re-applies that scale to the
// hips, shrinking the whole skeleton 100×.)
const REST = new WeakMap<THREE.Object3D, { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 }>();
function snapshotRest(root: THREE.Object3D) {
  root.traverse((o) => { if ((o as THREE.Bone).isBone && !REST.has(o)) REST.set(o, { p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() }); });
}
function restPose(root: THREE.Object3D) {
  snapshotRest(root);
  root.traverse((o) => {
    const r = REST.get(o);
    if (r) { o.position.copy(r.p); o.quaternion.copy(r.q); o.scale.copy(r.s); }
  });
  root.updateMatrixWorld(true);
}

/** Bake `clip` (on `src`) into a clip for `dst`, aligning rest poses bone by bone. */
function retarget(dst: THREE.Object3D, src: THREE.Object3D, clip: THREE.AnimationClip, name: string, fps = 30): THREE.AnimationClip {
  restPose(dst);
  restPose(src);
  const pairs = Object.entries(BONE_MAP)
    .map(([t, s]) => ({ t: findBone(dst, t), s: findBone(src, s), tName: t }))
    .filter((p): p is { t: THREE.Bone; s: THREE.Bone; tName: string } => !!p.t && !!p.s);

  // Facing compensation: rigs may face different ways (+Z vs -Z). Forward = (L hip − R hip) × up.
  const facing = (root: THREE.Object3D, map: (n: string) => string) => {
    const l = findBone(root, map('LeftUpLeg')), r = findBone(root, map('RightUpLeg'));
    return worldPos(l!).sub(worldPos(r!)).setY(0).normalize().cross(new THREE.Vector3(0, 1, 0)).normalize();
  };
  // Pure yaw about +Y. (setFromUnitVectors picks an arbitrary axis for opposed vectors,
  // which flipped the rig upside-down about X and put Jack's face on the back of his head.)
  const fs = facing(src, (n) => n), fd = facing(dst, (n) => n);
  const F = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(fd.x, fd.z) - Math.atan2(fs.x, fs.z));
  const Finv = F.clone().invert();
  const Qs0 = new Map<string, THREE.Quaternion>();
  const Qt0 = new Map<string, THREE.Quaternion>();
  const align = new Map<string, THREE.Quaternion>();
  for (const { t, s, tName } of pairs) {
    Qs0.set(tName, worldQuat(s));
    Qt0.set(tName, worldQuat(t));
    const c = DIR_CHILD[tName];
    const tc = c && findBone(dst, c);
    const sc = c && findBone(src, BONE_MAP[c]);
    if (tc && sc) {
      const dt = worldPos(tc).sub(worldPos(t)).normalize();
      const ds = worldPos(sc).sub(worldPos(s)).normalize().applyQuaternion(F);
      align.set(tName, new THREE.Quaternion().setFromUnitVectors(dt, ds));
    } else align.set(tName, new THREE.Quaternion());
  }
  const tHips = findBone(dst, 'Hips')!, sHips = findBone(src, 'Hips')!;
  const sHip0 = worldPos(sHips);
  const tHip0Local = tHips.position.clone();
  tHips.parent!.updateWorldMatrix(true, false);
  const parentQInv = worldQuat(tHips.parent!).invert();
  const parentScale = tHips.parent!.getWorldScale(new THREE.Vector3());
  const ratio = worldPos(tHips).y / Math.max(1e-4, sHip0.y);

  const mixer = new THREE.AnimationMixer(src);
  const action = mixer.clipAction(clip);
  action.play();
  const frames = Math.max(2, Math.round(clip.duration * fps));
  const times: number[] = [];
  const qTracks = new Map<string, number[]>(pairs.map((p) => [p.tName, []]));
  const hipTrack: number[] = [];
  const targetWorld = new Map<string, THREE.Quaternion>();

  for (let f = 0; f <= frames; f++) {
    const time = (f / frames) * clip.duration;
    times.push(time);
    mixer.setTime(time);
    src.updateMatrixWorld(true);
    for (const { s, tName } of pairs) {
      // Wt = F·(Ws·Ws0⁻¹)·F⁻¹ · align · Wt0  (source motion re-expressed in the target's facing)
      const deltaS = worldQuat(s).multiply(Qs0.get(tName)!.clone().invert());
      const wt = F.clone().multiply(deltaS).multiply(Finv).multiply(align.get(tName)!).multiply(Qt0.get(tName)!);
      targetWorld.set(tName, wt);
    }
    for (const { t, tName } of pairs) {
      const parentName = Object.keys(BONE_MAP).find((n) => findBone(dst, n) === t.parent);
      const parentWorld = parentName ? targetWorld.get(parentName)! : worldQuat(t.parent!);
      const local = parentWorld.clone().invert().multiply(targetWorld.get(tName)!);
      qTracks.get(tName)!.push(local.x, local.y, local.z, local.w);
    }
    // Hips: vertical bob + sway, scaled to Jack, expressed in the hips' parent space.
    const delta = worldPos(sHips).sub(sHip0).multiplyScalar(ratio).applyQuaternion(F);
    delta.x = delta.x * 0.6; delta.z = 0; // in-place locomotion
    // Convert the world-space offset into the hips' parent space explicitly: Meshy
    // armatures are in centimetres (0.01 scale), so the parent's scale matters.
    const local = tHip0Local.clone().add(delta.applyQuaternion(parentQInv).divide(parentScale));
    hipTrack.push(local.x, local.y, local.z);
  }
  action.stop();
  mixer.uncacheRoot(src);
  restPose(dst);

  const tracks: THREE.KeyframeTrack[] = pairs.map(({ t, tName }) => new THREE.QuaternionKeyframeTrack(`${t.name}.quaternion`, times, qTracks.get(tName)!));
  tracks.push(new THREE.VectorKeyframeTrack(`${tHips.name}.position`, times, hipTrack));
  return new THREE.AnimationClip(name, clip.duration, tracks);
}

export async function loadJack(): Promise<Character> {
  const loader = new GLTFLoader();
  const [jack, soldier] = await Promise.all([loader.loadAsync(JACK_URL), loader.loadAsync(ANIM_SOURCE_URL)]);
  const model = jack.scene;
  snapshotRest(model);
  snapshotRest(soldier.scene);
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
  const s = HEIGHT_M / height;
  model.scale.setScalar(s);
  model.position.y = -minY * s;
  const root = new THREE.Group();
  root.name = 'JackThorne';
  root.add(model);

  const byName = (n: string) => soldier.animations.find((a) => a.name.toLowerCase() === n)!;
  const clips = {
    idle: retarget(model, soldier.scene, byName('idle'), 'idle'),
    walk: retarget(model, soldier.scene, byName('walk'), 'walk'),
    run: retarget(model, soldier.scene, byName('run'), 'run'),
  };
  const mixer = new THREE.AnimationMixer(model);
  const actions = Object.fromEntries(Object.entries(clips).map(([k, c]) => [k, mixer.clipAction(c)])) as Record<keyof typeof clips, THREE.AnimationAction>;
  // All three run continuously; weights come from speed so transitions are seamless.
  // Walk and run are phase-synced (same normalised time) to avoid foot pops in the cross-fade.
  for (const a of Object.values(actions)) { a.play(); a.setEffectiveWeight(0); }
  actions.idle.setEffectiveWeight(1);
  const w = { idle: 1, walk: 0, run: 0 };
  let manual: keyof typeof clips | null = null;
  const play = (name: keyof typeof clips) => { manual = name; };
  const setLocomotion = (speed: number, walkSpeed: number, runSpeed: number) => {
    manual = null;
    let ti = 0, tw = 0, tr = 0;
    if (speed <= walkSpeed) { tw = THREE.MathUtils.smoothstep(speed, 0.05, walkSpeed); ti = 1 - tw; }
    else { tr = THREE.MathUtils.smoothstep(speed, walkSpeed, runSpeed); tw = 1 - tr; }
    const k = 0.2; // weight smoothing per frame
    w.idle += (ti - w.idle) * k; w.walk += (tw - w.walk) * k; w.run += (tr - w.run) * k;
    actions.idle.setEffectiveWeight(w.idle);
    actions.walk.setEffectiveWeight(w.walk);
    actions.run.setEffectiveWeight(w.run);
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
    if (manual) { // review/cutscene override
      for (const [k, a] of Object.entries(actions)) a.setEffectiveWeight(k === manual ? 1 : 0);
    }
    return origUpdate(dt);
  };
  return { root, mixer, play, setLocomotion };
}
