// Retarget an animation from one humanoid rig onto another, bone by bone in world space (rest poses aligned by
// each bone's direction to its child, facing compensated, hip motion scaled by hip height). Ported from Era Clash
// 3D's core/character.ts (the version the game ships), on plain `three` so the capture room, the benchmark and
// any tool can use it. Works for CMU/DAZ-named sources: CMU mocap and Plajah camera captures alike.
import * as THREE from 'three';

/** Bone-name match, ignoring Mixamo prefixes and GLTFLoader's de-duplication suffix (_1, _2…). */
export const findBone = (root: THREE.Object3D, name: string): THREE.Bone | undefined => {
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

// Rest pose = the bone transforms as loaded (skeleton.pose() re-applies armature scale on some exports).
const REST = new WeakMap<THREE.Object3D, { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 }>();
export function snapshotRest(root: THREE.Object3D): void {
  root.traverse((o) => { if ((o as THREE.Bone).isBone && !REST.has(o)) REST.set(o, { p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() }); });
}
export function restPose(root: THREE.Object3D): void {
  snapshotRest(root);
  root.traverse((o) => { const r = REST.get(o); if (r) { o.position.copy(r.p); o.quaternion.copy(r.q); o.scale.copy(r.s); } });
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
}

/** CMU / DAZ names (CMU mocap FBX, Plajah capture BVH) → the Mixamo-style contract skeleton (Plajah characters). */
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

export interface RetargetOptions {
  fps?: number;
  /** Keep the source's travel across the floor (default false: in place, as games want). */
  travel?: boolean;
}

/** Bake `clip` (playing on `src`) into a clip for `dst`. */
export function retarget(dst: THREE.Object3D, src: THREE.Object3D, clip: THREE.AnimationClip, name: string, spec: RigSpec = CMU_TO_CONTRACT, o: RetargetOptions = {}): THREE.AnimationClip {
  const fps = o.fps ?? 30;
  restPose(dst); restPose(src);
  const { map, dirChild } = spec;
  const pairs = Object.entries(map)
    .map(([t, s]) => ({ t: findBone(dst, t), s: findBone(src, s), tName: t }))
    .filter((p): p is { t: THREE.Bone; s: THREE.Bone; tName: string } => !!p.t && !!p.s);
  const mapped = new Map<THREE.Object3D, string>(pairs.map((p) => [p.t, p.tName]));
  // Facing: forward = (L hip − R hip) × up; pure yaw between the rigs.
  const facing = (root: THREE.Object3D, [l, r]: [string, string]) => {
    const d = worldPos(findBone(root, l)!).sub(worldPos(findBone(root, r)!)).setY(0);
    return d.normalize().cross(new THREE.Vector3(0, 1, 0)).normalize();
  };
  const fs = facing(src, spec.srcLegs), fd = facing(dst, spec.dstLegs);
  const F = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(fd.x, fd.z) - Math.atan2(fs.x, fs.z));
  const Finv = F.clone().invert();
  const Qs0 = new Map<string, THREE.Quaternion>(), Qt0 = new Map<string, THREE.Quaternion>(), align = new Map<string, THREE.Quaternion>();
  for (const { t, s, tName } of pairs) {
    Qs0.set(tName, worldQuat(s)); Qt0.set(tName, worldQuat(t));
    const c = dirChild[tName];
    const tc = c && findBone(dst, c), sc = c && map[c] && findBone(src, map[c]);
    if (tc && sc) {
      const dt = worldPos(tc).sub(worldPos(t)).normalize();
      const ds = worldPos(sc).sub(worldPos(s)).normalize().applyQuaternion(F);
      align.set(tName, new THREE.Quaternion().setFromUnitVectors(dt, ds));
    } else align.set(tName, new THREE.Quaternion());
  }
  const tHips = findBone(dst, 'Hips')!, sHips = findBone(src, map.Hips ?? 'Hips')!;
  const sHip0 = worldPos(sHips), tHip0Local = tHips.position.clone();
  tHips.parent!.updateWorldMatrix(true, false);
  const parentQInv = worldQuat(tHips.parent!).invert();
  const parentScale = tHips.parent!.getWorldScale(new THREE.Vector3());
  const footY = (r: THREE.Object3D) => {
    const b = new THREE.Box3().setFromObject(r);
    if (!b.isEmpty()) return b.min.y;
    let y = Infinity; r.traverse((x) => { if ((x as THREE.Bone).isBone) y = Math.min(y, worldPos(x).y); });
    return y;
  };
  const ratio = (worldPos(tHips).y - footY(dst)) / Math.max(1e-4, sHip0.y - footY(src));

  const mixer = new THREE.AnimationMixer(src);
  mixer.clipAction(clip).play();
  const frames = Math.max(2, Math.round(clip.duration * fps));
  const times: number[] = [], hipTrack: number[] = [];
  const qTracks = new Map<string, number[]>(pairs.map((p) => [p.tName, []]));
  const targetWorld = new Map<string, THREE.Quaternion>();
  const worldOf = (b: THREE.Object3D): THREE.Quaternion => {
    const n = mapped.get(b);
    if (n) return targetWorld.get(n)!;
    if (!(b as THREE.Bone).isBone || !b.parent) return worldQuat(b);
    return worldOf(b.parent).clone().multiply(b.quaternion);
  };
  for (let f = 0; f <= frames; f++) {
    const time = (f / frames) * clip.duration;
    times.push(time);
    mixer.setTime(time); src.updateMatrixWorld(true);
    for (const { s, tName } of pairs) {
      const deltaS = worldQuat(s).multiply(Qs0.get(tName)!.clone().invert());
      targetWorld.set(tName, F.clone().multiply(deltaS).multiply(Finv).multiply(align.get(tName)!).multiply(Qt0.get(tName)!));
    }
    for (const { t, tName } of pairs) {
      const local = worldOf(t.parent!).clone().invert().multiply(targetWorld.get(tName)!);
      qTracks.get(tName)!.push(local.x, local.y, local.z, local.w);
    }
    const delta = worldPos(sHips).sub(sHip0).multiplyScalar(ratio).applyQuaternion(F);
    if (!o.travel) { delta.x *= 0.6; delta.z = 0; }
    const local = tHip0Local.clone().add(delta.applyQuaternion(parentQInv).divide(parentScale));
    hipTrack.push(local.x, local.y, local.z);
  }
  mixer.stopAllAction(); mixer.uncacheRoot(src);
  restPose(dst); restPose(src);
  const tracks: THREE.KeyframeTrack[] = pairs.map(({ t, tName }) => new THREE.QuaternionKeyframeTrack(`${t.name}.quaternion`, times, qTracks.get(tName)!));
  tracks.push(new THREE.VectorKeyframeTrack(`${tHips.name}.position`, times, hipTrack));
  return new THREE.AnimationClip(name, clip.duration, tracks);
}
