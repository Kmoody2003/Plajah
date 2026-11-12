// Synthetic performers for the mocap solver tests: known skeleton motion → MediaPipe-shaped landmarks.
import * as THREE from 'three';
import { buildSkeleton, fk, JOINTS, type Proportions } from '../services/mocap/solve';
import type { RawTake, RawFrame } from '../services/mocap/types';

export const P: Proportions = { spine: 0.52, neckHead: 0.22, shHalf: 0.19, upper: 0.29, fore: 0.26, hand: 0.09, hipHalf: 0.1, thigh: 0.44, shin: 0.42, foot: 0.17, ankleH: 0.075 };
export const SKEL = buildSkeleton(P);
export const ji = (n: string) => (JOINTS as readonly string[]).indexOf(n);
const W = 1280, H = 720, HFOV = 65, CAM = new THREE.Vector3(0, 1.0, 4.0);
const F = (W / 2) / Math.tan(THREE.MathUtils.degToRad(HFOV) / 2);
export const q = (x = 0, y = 0, z = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'YXZ'));

export type Pose = Partial<Record<string, THREE.Quaternion>>;
export const locals = (p: Pose) => SKEL.map((j) => (p[j.name] ?? new THREE.Quaternion()).clone());

/** The 33 landmarks of a posed skeleton, in world space (Y up). */
export function landmarks(p: Pose, root: THREE.Vector3): THREE.Vector3[] {
  const L = locals(p);
  const { pos, world, ends } = fk(L, SKEL, root);
  const out: THREE.Vector3[] = Array.from({ length: 33 }, () => root.clone());
  const at = (n: string) => pos[ji(n)];
  const Wq = (n: string) => world[ji(n)];
  const earM = at('neck').clone().add(new THREE.Vector3(0, P.neckHead, 0).applyQuaternion(Wq('neck')));
  out[7] = earM.clone().add(new THREE.Vector3(0.07, 0, 0).applyQuaternion(Wq('head')));
  out[8] = earM.clone().add(new THREE.Vector3(-0.07, 0, 0).applyQuaternion(Wq('head')));
  out[0] = earM.clone().add(new THREE.Vector3(0, -0.02, 0.1).applyQuaternion(Wq('head')));
  for (const [s, o] of [['l', 0], ['r', 1]] as const) {
    out[11 + o] = at(`${s}Shldr`).clone(); out[13 + o] = at(`${s}ForeArm`).clone(); out[15 + o] = at(`${s}Hand`).clone();
    const end = ends[ji(`${s}Hand`)]!;
    out[19 + o] = end.clone().add(new THREE.Vector3(0, 0, 0.025).applyQuaternion(Wq(`${s}Hand`)));
    out[17 + o] = end.clone().add(new THREE.Vector3(0, 0, -0.025).applyQuaternion(Wq(`${s}Hand`)));
    out[21 + o] = end.clone();
    out[23 + o] = at(`${s}Thigh`).clone(); out[25 + o] = at(`${s}Shin`).clone(); out[27 + o] = at(`${s}Foot`).clone();
    out[29 + o] = at(`${s}Foot`).clone().add(new THREE.Vector3(0, -P.ankleH, -0.04).applyQuaternion(Wq(`${s}Foot`)));
    out[31 + o] = ends[ji(`${s}Foot`)]!.clone();
  }
  return out;
}

const rand = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647) - 0.5; })();

/** A RawFrame as MediaPipe would report it for landmarks seen by the test camera. */
export function rawFrame(t: number, lm: THREE.Vector3[], noise = { world: 0, px: 0 }): RawFrame {
  const hip = lm[23].clone().add(lm[24]).multiplyScalar(0.5);
  return {
    t,
    world: lm.map((p) => {
      const r = p.clone().sub(hip);
      return { x: r.x + rand() * noise.world, y: -r.y + rand() * noise.world, z: -r.z + rand() * noise.world, v: 0.98 };
    }),
    pts: lm.map((p) => {
      const r = p.clone().sub(CAM), d = -r.z;
      return { x: (W / 2 + (F * r.x) / d + rand() * noise.px) / W, y: (H / 2 - (F * r.y) / d + rand() * noise.px) / H, v: 0.98 };
    }),
  };
}

export const take = (frames: RawFrame[], fps = 30): RawTake => ({ fps, frames, width: W, height: H, hfovDeg: HFOV, source: { kind: 'upload', label: 'synthetic', model: 'heavy' } });

/** Lowest point of each foot (ankle, toe, heel) relative to the root, as the solver measures it. */
export function lowRel(p: Pose, foot: 'l' | 'r') {
  const lm = landmarks(p, new THREE.Vector3());
  const o = foot === 'l' ? 0 : 1;
  return [lm[27 + o], lm[31 + o], lm[29 + o]].reduce((a, b) => (b.y < a.y ? b : a));
}

export const standing = (): Pose => ({});
export const standRoot = () => new THREE.Vector3(0, -lowRel(standing(), 'l').y, 0);


/** A side-on walk along +x at constant speed: the stance foot stays put, the swing foot arcs to the next
 *  footprint, legs posed by two-bone IK with flat feet. Returns poses and the true root per frame. */
export function walk(opts: { fps?: number; seconds?: number; speed?: number; step?: number } = {}) {
  const fps = opts.fps ?? 30, n = Math.round((opts.seconds ?? 3) * fps), v = opts.speed ?? 1.0, s = opts.step ?? 0.6;
  const Ts = s / v, L1 = P.thigh, L2 = P.shin;
  // Hip height so the leg is 96% straight with the foot half a step away.
  const hipH = Math.sqrt((0.96 * (L1 + L2)) ** 2 - (s / 2) ** 2) + P.ankleH;
  const ik = (dy: number, dz: number) => {
    const d = Math.min(L1 + L2 - 1e-4, Math.hypot(dy, dz));
    const k = Math.PI - Math.acos((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2));
    const th = Math.atan2(dz, -dy) + Math.acos((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d));
    return { a: -th, k };
  };
  const poses: Pose[] = [], roots: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / fps, x = v * t;
    const step = Math.floor(t / Ts), u = t / Ts - step;
    const p: Pose = { hip: q(0, Math.PI / 2, 0), lShldr: q(0, 0, -1.2), rShldr: q(0, 0, 1.2), lForeArm: q(0, 0.3, 0), rForeArm: q(0, -0.3, 0) };
    for (const side of ['l', 'r'] as const) {
      const stanceNow = (step % 2 === 0) === (side === 'l');
      // Footprint centres (relative to where the step began): stance foot under the middle of this step.
      const base = step * s;
      let fx: number, fy = 0;
      if (stanceNow) fx = base + s / 2;
      else { fx = base - s / 2 + 2 * s * u; fy = 0.12 * Math.sin(Math.PI * u); }
      const { a, k } = ik(-(hipH - (fy + P.ankleH)), fx - x);
      p[`${side}Thigh`] = q(a, 0, 0); p[`${side}Shin`] = q(k, 0, 0); p[`${side}Foot`] = q(-(a + k), 0, 0);
    }
    poses.push(p); roots.push(new THREE.Vector3(x, hipH, 0));
  }
  return { poses, roots, fps };
}
