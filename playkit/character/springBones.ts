/**
 * springBones.ts — verlet spring chains with body-capsule collision (docs/character-forge.md §6).
 *
 * Each chain is a run of bones whose tails are simulated as particles: inertia, a pull back toward the rest direction
 * (stiffness), drag, gravity, a fixed length, and collision against the body's capsules. The bones are then aimed at
 * their particles, so anything bound to them (a tasset's plates, a sleeve's hem) swings and settles.
 *
 * Fixed 120 Hz substeps keep it frame-rate independent. Each chain is walked once from its parent's world matrix
 * (no per-bone world-matrix recursion) with no allocation per frame; the budget is a full cast under 0.3 ms on the
 * Arc iGPU machine's CPU (bench: `SpringBones.bench`).
 */
import * as THREE from 'three/webgpu';

export interface SpringChainSpec {
  /** Bone names, root first. The root's parent drives the chain. */
  bones: string[];
  stiffness: number;
  drag: number;
  gravity: number;
  /** Particle radius for collision, metres. */
  radius: number;
  /** Largest swing from the rest direction, degrees (a laced plate can't fly out flat). Default 65. */
  maxAngle?: number;
}
export interface CapsuleSpec { bone: string; a: [number, number, number]; b: [number, number, number]; r: number }

interface Joint {
  bone: THREE.Bone;
  /** Head offset in the parent's space (bone.position at rest) and tail offset in the bone's own space. */
  head: THREE.Vector3;
  tailLocal: THREE.Vector3;
  restQ: THREE.Quaternion;
  length: number;
  cur: THREE.Vector3;
  prev: THREE.Vector3;
}
interface Chain { joints: Joint[]; spec: SpringChainSpec; parent: THREE.Object3D; capsules: Capsule[] }
interface Capsule { bone: THREE.Object3D; a: THREE.Vector3; b: THREE.Vector3; r: number; wa: THREE.Vector3; wb: THREE.Vector3 }

const STEP = 1 / 120;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _c = new THREE.Vector3(), _h = new THREE.Vector3(), _seg = new THREE.Vector3();
const _pq = new THREE.Quaternion(), _wq = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _pp = new THREE.Vector3(), _ps = new THREE.Vector3();
const _from = new THREE.Vector3(), _to = new THREE.Vector3(), _inv = new THREE.Quaternion();

export class SpringBones {
  readonly chains: Chain[] = [];
  readonly capsules: Capsule[] = [];
  /** World-space wind (m/s²), e.g. from the weather. */
  wind = new THREE.Vector3();
  /**
   * How much of the character's own travel the particles feel (0..1). Root motion at a sprint is several metres a
   * second; heavy pieces feel the stride, the stop and the turn, not the whole velocity as if dragged through air.
   */
  rootInertia = 0.25;
  private root: THREE.Object3D;
  private lastRoot = new THREE.Vector3();
  private hasRoot = false;
  /** Last update's cost in ms (the budget check). */
  lastMs = 0;
  private acc = 0;

  constructor(root: THREE.Object3D, chains: SpringChainSpec[], capsules: CapsuleSpec[]) {
    this.root = root;
    const byName = new Map<string, THREE.Bone>();
    root.traverse((o) => { if ((o as THREE.Bone).isBone) byName.set(o.name, o as THREE.Bone); });
    root.traverse((o) => { const k = o.name.replace(/_\d+$/, ''); if ((o as THREE.Bone).isBone && !byName.has(k)) byName.set(k, o as THREE.Bone); });
    root.updateMatrixWorld(true);
    for (const spec of chains) {
      const bones = spec.bones.map((n) => byName.get(n)).filter((b): b is THREE.Bone => !!b);
      if (!bones.length || !bones[0].parent) continue;
      const joints: Joint[] = bones.map((bone, i) => {
        const tailLocal = i + 1 < bones.length ? bones[i + 1].position.clone() : bones[i].position.clone().normalize().multiplyScalar(Math.max(0.03, Math.min(0.06, bone.position.length())));
        const cur = bone.localToWorld(tailLocal.clone());
        return { bone, head: bone.position.clone(), tailLocal, restQ: bone.quaternion.clone(), length: tailLocal.length(), cur, prev: cur.clone() };
      });
      this.chains.push({ joints, spec, parent: bones[0].parent, capsules: [] });
    }
    for (const c of capsules) {
      const bone = byName.get(c.bone);
      if (!bone) continue;
      const cap: Capsule = { bone, a: new THREE.Vector3(...c.a), b: new THREE.Vector3(...c.b), r: c.r, wa: new THREE.Vector3(), wb: new THREE.Vector3() };
      this.capsules.push(cap);
      // a chain only tests the capsules it can reach (rest pose, with room for a limb swinging up to it)
      cap.wa.copy(cap.a).applyMatrix4(bone.matrixWorld); cap.wb.copy(cap.b).applyMatrix4(bone.matrixWorld);
      for (const chain of this.chains) {
        const reach = chain.joints.reduce((t, j) => t + j.length, 0) + c.r + 0.1;
        const head = chain.joints[0].bone.getWorldPosition(new THREE.Vector3());
        if (closestOnSegment(cap.wa, cap.wb, head, new THREE.Vector3()).distanceTo(head) < reach) chain.capsules.push(cap);
      }
    }
  }

  /** Snap every particle to its rest pose (after a teleport or a cut). Needs current world matrices. */
  reset() {
    for (const { joints } of this.chains) {
      for (const j of joints) j.bone.quaternion.copy(j.restQ);
      joints[0].bone.updateMatrixWorld(true);
      for (const j of joints) { j.bone.localToWorld(j.cur.copy(j.tailLocal)); j.prev.copy(j.cur); }
    }
  }

  /** Call with the skeleton's world matrices current for this frame (the chains' parents and the capsule bones). */
  update(dt: number) {
    const t0 = performance.now();
    this.acc = Math.min(this.acc + dt, STEP * 4);
    const steps = Math.floor(this.acc / STEP);
    this.acc -= steps * STEP;
    for (const c of this.capsules) {
      c.wa.copy(c.a).applyMatrix4(c.bone.matrixWorld);
      c.wb.copy(c.b).applyMatrix4(c.bone.matrixWorld);
    }
    // carry the particles along with most of the root's travel (a teleport carries them all the way)
    _c.setFromMatrixPosition(this.root.matrixWorld);
    if (this.hasRoot) {
      _seg.copy(_c).sub(this.lastRoot);
      const k = _seg.lengthSq() > 4 ? 1 : 1 - this.rootInertia;
      _seg.multiplyScalar(k);
      for (const { joints } of this.chains) for (const j of joints) { j.cur.add(_seg); j.prev.add(_seg); }
    }
    this.lastRoot.copy(_c); this.hasRoot = true;
    for (const chain of this.chains) {
      const { joints, spec, parent } = chain;
      // the chain's frame, carried down the joints as they are aimed
      parent.matrixWorld.decompose(_pp, _pq, _ps);
      const scale = _ps.x;
      for (const j of joints) {
        // this joint's head and its rest frame under the (already aimed) parent
        const head = _h.copy(j.head).multiplyScalar(scale).applyQuaternion(_pq).add(_pp);
        _wq.copy(_pq).multiply(j.restQ);
        const restTail = _w.copy(j.tailLocal).multiplyScalar(scale).applyQuaternion(_wq).add(head);
        const len = j.length * scale;
        for (let s = 0; s < steps; s++) {
          // inertia with drag, pull toward rest, gravity and wind (verlet: x += v + a·dt²)
          _v.copy(j.cur).sub(j.prev).multiplyScalar(1 - spec.drag);
          j.prev.copy(j.cur);
          j.cur.add(_v);
          j.cur.addScaledVector(_seg.copy(restTail).sub(j.cur), Math.min(1, spec.stiffness * STEP));
          j.cur.y -= spec.gravity * STEP * STEP;
          j.cur.addScaledVector(this.wind, STEP * STEP);
          j.cur.sub(head).setLength(len).add(head);
        }
        this.constrain(j, head, len, spec.radius * scale, scale, chain.capsules);
        // aim: world rotation = q2 · parent · rest, no further than the swing limit
        _from.copy(j.tailLocal).normalize().applyQuaternion(_wq);
        _to.copy(j.cur).sub(head).normalize();
        const limit = ((spec.maxAngle ?? 65) * Math.PI) / 180;
        const ang = _from.angleTo(_to);
        if (ang > limit) {
          _to.lerp(_from, 1 - limit / ang).normalize();
          j.cur.copy(_to).multiplyScalar(len).add(head);
        }
        _q2.setFromUnitVectors(_from, _to);
        _wq.premultiply(_q2);
        j.bone.quaternion.copy(_inv.copy(_pq).invert()).multiply(_wq);
        // the next joint hangs from this one
        _pq.copy(_wq);
        _pp.copy(head);
      }
      // (world matrices are refreshed by the renderer's scene update before skinning reads them)
    }
    this.lastMs = performance.now() - t0;
  }

  /** Fixed length from the head, then out of every capsule. */
  private constrain(j: Joint, head: THREE.Vector3, len: number, r: number, scale: number, capsules: Capsule[]) {
    j.cur.sub(head).setLength(len).add(head);
    for (const c of capsules) {
      const p = closestOnSegment(c.wa, c.wb, j.cur, _c);
      const d = j.cur.distanceTo(p), min = c.r * scale + r;
      if (d < min && d > 1e-6) j.cur.sub(p).multiplyScalar(min / d).add(p).sub(head).setLength(len).add(head);
    }
  }

  /** Average cost of one update over `n` frames (ms). */
  static bench(springs: SpringBones[], n = 600) {
    const t0 = performance.now();
    for (let i = 0; i < n; i++) for (const s of springs) s.update(1 / 60);
    return (performance.now() - t0) / n;
  }
}

function closestOnSegment(a: THREE.Vector3, b: THREE.Vector3, p: THREE.Vector3, out: THREE.Vector3) {
  out.copy(b).sub(a);
  const l2 = out.lengthSq();
  const t = l2 > 1e-10 ? Math.max(0, Math.min(1, ((p.x - a.x) * out.x + (p.y - a.y) * out.y + (p.z - a.z) * out.z) / l2)) : 0;
  return out.multiplyScalar(t).add(a);
}
