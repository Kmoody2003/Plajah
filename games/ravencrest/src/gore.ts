// Dismemberment for defeated monsters. The dying mob's skinned body is cloned once per body
// part and frozen in its last pose; in each clone every bone outside that part collapses to
// a point, so only the part's skin remains. Each part then flies as a rigid body (its bone
// matrices are moved together), bouncing on the level's collision floor before sinking away.
// Used for the zombie falling apart, Stitch bursting, and the werewolf's severed head.
import * as THREE from 'three/webgpu';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const base = (n: string) => n.replace(/_\d+$/, '');
/** Contract (Mixamo-style) humanoid parts: the Muse monsters. */
export const PARTS_MIXAMO = {
  head: ['Neck', 'Head'],
  torso: ['Hips', 'Spine', 'Spine1', 'Spine2', 'LeftShoulder', 'RightShoulder'],
  armL: ['LeftArm', 'LeftForeArm', 'LeftHand'],
  armR: ['RightArm', 'RightForeArm', 'RightHand'],
  legL: ['LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase'],
  legR: ['RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'],
};
export const PARTS17 = {
  head: ['Neck', 'Head'],
  torso: ['Hips', 'Spine', 'Chest'],
  armL: ['UpperArm_L', 'LowerArm_L', 'Hand_L'],
  armR: ['UpperArm_R', 'LowerArm_R', 'Hand_R'],
  legL: ['UpLeg_L', 'LowLeg_L', 'Foot_L'],
  legR: ['UpLeg_R', 'LowLeg_R', 'Foot_R'],
};

interface Chunk {
  root: THREE.Object3D;
  bones: THREE.Bone[];
  frozen: THREE.Matrix4[];
  center: THREE.Vector3;       // pivot (world, at freeze time)
  off: THREE.Vector3;          // translation since freeze
  q: THREE.Quaternion;         // rotation since freeze (about the pivot)
  vel: THREE.Vector3; spin: THREE.Vector3;
  radius: number;
  resting: boolean;
  /** Severed end (world, frozen): blood/gore emitters track it. */
  stump: THREE.Vector3 | null;
}

export class Dismember {
  readonly group = new THREE.Group();
  readonly chunks: Chunk[] = [];
  age = 0;
  constructor(body: THREE.Object3D, parts: { bones: string[]; vel: THREE.Vector3; spin: THREE.Vector3; stump?: string }[]) {
    this.group.userData.dynamic = true;
    body.updateMatrixWorld(true);
    const srcBones: THREE.Bone[] = [];
    body.traverse((o) => { if ((o as THREE.Bone).isBone) srcBones.push(o as THREE.Bone); });
    for (const part of parts) {
      const set = new Set(part.bones);
      const root = cloneSkinned(body);
      // Same world placement as the source body.
      body.matrixWorld.decompose(root.position, root.quaternion, root.scale);
      this.group.add(root);
      const bones: THREE.Bone[] = [];
      root.traverse((o) => {
        if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone);
        const m = o as THREE.SkinnedMesh;
        if (m.isMesh) { m.frustumCulled = false; m.castShadow = false; }
      });
      bones.forEach((b, i) => { const s = srcBones[i]; b.position.copy(s.position); b.quaternion.copy(s.quaternion); b.scale.copy(s.scale); });
      root.updateMatrixWorld(true);
      const center = new THREE.Vector3();
      let k = 0;
      const collapse = new THREE.Matrix4().makeScale(1e-4, 1e-4, 1e-4);
      const frozen = bones.map((b) => {
        const m = b.matrixWorld.clone();
        if (set.has(base(b.name))) { center.add(new THREE.Vector3().setFromMatrixPosition(m)); k++; }
        else m.multiply(collapse);
        b.matrixAutoUpdate = false;
        b.matrixWorldAutoUpdate = false;
        return m;
      });
      center.divideScalar(Math.max(1, k));
      let stump: THREE.Vector3 | null = null;
      if (part.stump) { const sb = bones.find((b) => base(b.name) === part.stump); if (sb) stump = new THREE.Vector3().setFromMatrixPosition(sb.matrixWorld); }
      this.chunks.push({ root, bones, frozen, center, off: new THREE.Vector3(), q: new THREE.Quaternion(), vel: part.vel.clone(), spin: part.spin.clone(), radius: set.has('Head') ? 0.14 : 0.18, resting: false, stump });
    }
  }

  /** World position of a chunk's severed end now. */
  stumpOf(c: Chunk): THREE.Vector3 | null {
    return c.stump ? c.stump.clone().sub(c.center).applyQuaternion(c.q).add(c.center).add(c.off) : null;
  }

  update(dt: number, ground: (x: number, z: number, y: number) => number | null): boolean {
    this.age += dt;
    const T = new THREE.Matrix4(), toPivot = new THREE.Matrix4(), fromPivot = new THREE.Matrix4(), R = new THREE.Matrix4();
    const sink = this.age > 5 ? (this.age - 5) * 0.25 : 0;
    for (const c of this.chunks) {
      if (!c.resting) {
        c.vel.y -= 14 * dt;
        c.off.addScaledVector(c.vel, dt);
        const w = c.spin.length();
        if (w > 1e-3) c.q.premultiply(new THREE.Quaternion().setFromAxisAngle(c.spin.clone().divideScalar(w), w * dt));
        const p = c.center.clone().add(c.off);
        const g = ground(p.x, p.z, p.y + 0.5);
        if (g !== null && p.y - c.radius < g) {
          c.off.y += g - (p.y - c.radius);
          if (Math.abs(c.vel.y) < 1.2 && c.vel.length() < 1.5) { c.resting = true; }
          c.vel.y = Math.abs(c.vel.y) * 0.32;
          c.vel.x *= 0.55; c.vel.z *= 0.55;
          c.spin.multiplyScalar(0.5);
        }
      }
      // Bone matrices: frozen pose, rotated about the pivot, translated, sinking at the end.
      toPivot.makeTranslation(-c.center.x, -c.center.y, -c.center.z);
      R.makeRotationFromQuaternion(c.q);
      fromPivot.makeTranslation(c.center.x + c.off.x, c.center.y + c.off.y - sink, c.center.z + c.off.z);
      T.copy(fromPivot).multiply(R).multiply(toPivot);
      c.bones.forEach((b, i) => b.matrixWorld.multiplyMatrices(T, c.frozen[i]));
    }
    if (this.age > 8) { this.group.removeFromParent(); return false; }
    return true;
  }
}
