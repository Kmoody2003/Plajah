// Jack's katana moves, authored here as key poses and baked onto his own skeleton at load.
// Each key gives the sword hand's position and blade direction in character space
// (feet at origin, +Z forward, +X = his left), plus torso twist/lean, hip drop/lunge and a
// whole-body spin. The bake solves two-bone IK for both arms (left hand rides the grip
// below the right) and both legs (feet planted in a fighting stance), so the poses read as
// real two-handed kenjutsu instead of the grindhouse rig's small retargeted motions.
import * as THREE from 'three/webgpu';
import { findBone, restPose } from './character';

type V = [number, number, number];
export interface PoseKey {
  t: number;
  hand: V; blade: V;
  /** Left hand target, or 'grip' (two-handed, below the right hand on the handle). */
  left?: V | 'grip';
  yaw?: number; pitch?: number; roll?: number;
  hipY?: number; hipZ?: number;
  /** Whole-body turn (radians, positive = toward his left). Feet pivot with it. */
  spin?: number;
  /** Somersault about the body's left-right axis (radians; negative = backflip). */
  flip?: number;
  /** Feet leave the ground and ride with the body (0 planted … 1 airborne, tucked by `tuck`). */
  air?: number; tuck?: number;
  /** Kick: a foot's target in character space (overrides the planted stance). */
  kickL?: V; kickR?: V;
}
export interface MoveDef { dur: number; keys: PoseKey[] }

const GUARD: Omit<PoseKey, 't'> = { hand: [-0.08, 1.08, 0.36], blade: [0.05, 0.8, 0.6], left: 'grip', yaw: 0, pitch: 0.05, roll: 0, hipY: -0.05, hipZ: 0, spin: 0 };
const g = (t: number, o: Partial<PoseKey> = {}): PoseKey => ({ ...GUARD, ...o, t });

export const MOVES: Record<string, MoveDef> = {
  // MID: flat cut, right to left.
  combo: { dur: 0.62, keys: [
    g(0),
    g(0.28, { hand: [-0.5, 1.25, 0.0], blade: [-0.75, 0.35, -0.55], yaw: -0.75, hipY: -0.07 }),
    g(0.46, { hand: [-0.05, 1.15, 0.62], blade: [0.15, 0.05, 1], yaw: -0.05, pitch: 0.12, hipY: -0.13, hipZ: 0.12 }),
    g(0.64, { hand: [0.5, 1.08, 0.3], blade: [0.95, -0.05, 0.25], yaw: 0.8, pitch: 0.1, hipY: -0.11, hipZ: 0.1 }),
    g(1),
  ] },
  // Return cut: rising, left to right.
  backhand: { dur: 0.6, keys: [
    g(0),
    g(0.26, { hand: [0.45, 0.95, 0.15], blade: [0.8, -0.25, -0.5], yaw: 0.7, hipY: -0.11 }),
    g(0.46, { hand: [0.0, 1.25, 0.6], blade: [-0.2, 0.35, 0.95], pitch: 0.1, hipY: -0.08, hipZ: 0.12 }),
    g(0.64, { hand: [-0.5, 1.45, 0.25], blade: [-0.85, 0.45, 0.2], yaw: -0.75, hipY: -0.04 }),
    g(1),
  ] },
  // HIGH: overhead cleave into a deep lunge.
  cleave: { dur: 0.7, keys: [
    g(0),
    g(0.3, { hand: [-0.05, 1.95, -0.05], blade: [0, 0.55, -0.85], pitch: -0.2, hipY: 0 }),
    g(0.5, { hand: [0, 1.05, 0.62], blade: [0, -0.45, 0.9], pitch: 0.45, hipY: -0.2, hipZ: 0.2 }),
    g(0.68, { hand: [0, 0.85, 0.5], blade: [0, -0.75, 0.66], pitch: 0.5, hipY: -0.22, hipZ: 0.2 }),
    g(1),
  ] },
  // LOW: crouching sweep at the legs.
  sweep: { dur: 0.65, keys: [
    g(0),
    g(0.28, { hand: [0.4, 0.85, 0.1], blade: [0.75, -0.45, -0.45], yaw: 0.6, pitch: 0.3, hipY: -0.33 }),
    g(0.48, { hand: [-0.05, 0.6, 0.6], blade: [-0.25, -0.35, 0.92], pitch: 0.45, hipY: -0.4, hipZ: 0.15 }),
    g(0.68, { hand: [-0.5, 0.8, 0.25], blade: [-0.95, -0.15, 0.2], yaw: -0.7, pitch: 0.35, hipY: -0.36 }),
    g(1),
  ] },
  // Finisher: one-handed whirlwind, blade out to the right, ending in a slam.
  kata: { dur: 0.85, keys: [
    g(0),
    g(0.2, { hand: [-0.3, 1.3, 0.2], blade: [-0.6, 0.5, -0.6], yaw: -0.6, hipY: -0.15 }),
    g(0.35, { hand: [-0.62, 1.2, 0.12], blade: [-1, 0.05, 0.15], left: [0.45, 1.2, 0.0], hipY: 0.04 }),
    g(0.55, { hand: [-0.62, 1.2, 0.12], blade: [-1, 0.05, 0.15], left: [0.45, 1.2, 0.0], hipY: 0.12, spin: Math.PI }),
    g(0.75, { hand: [-0.62, 1.2, 0.12], blade: [-1, 0.05, 0.15], left: [0.45, 1.2, 0.0], hipY: 0.02, spin: Math.PI * 2 }),
    g(0.86, { hand: [-0.05, 1.0, 0.62], blade: [0, -0.35, 0.94], pitch: 0.4, hipY: -0.2, hipZ: 0.15, spin: Math.PI * 2 }),
    g(1, { spin: Math.PI * 2 }),
  ] },
  // Molotov with the left hand; the katana drops to a low guard.
  throw: { dur: 0.7, keys: [
    g(0),
    g(0.2, { hand: [-0.3, 0.95, 0.15], blade: [-0.3, -0.6, 0.7], left: [0.25, 1.05, 0.25] }),
    g(0.38, { hand: [-0.3, 0.95, 0.15], blade: [-0.3, -0.6, 0.7], left: [0.35, 1.7, -0.35], yaw: 0.5, pitch: -0.1 }),
    g(0.55, { hand: [-0.3, 0.95, 0.2], blade: [-0.3, -0.6, 0.7], left: [0.12, 1.5, 0.62], yaw: -0.35, pitch: 0.2, hipZ: 0.1 }),
    g(0.75, { hand: [-0.3, 0.95, 0.15], blade: [-0.3, -0.6, 0.7], left: [0.2, 1.1, 0.35] }),
    g(1),
  ] },
  ready: { dur: 0.5, keys: [g(0), g(1)] },

  // ── Hand-to-hand: blade held low in the right hand, the rest of the body fights. ──
  // Left jab to the face, snapping back.
  jab: { dur: 0.38, keys: [
    g(0),
    g(0.25, { hand: [-0.3, 0.95, 0.2], blade: [-0.2, -0.7, 0.6], left: [0.12, 1.4, 0.2], yaw: 0.25 }),
    g(0.45, { hand: [-0.3, 0.95, 0.2], blade: [-0.2, -0.7, 0.6], left: [0.04, 1.42, 0.68], yaw: -0.3, hipZ: 0.08 }),
    g(0.7, { hand: [-0.3, 0.95, 0.2], blade: [-0.2, -0.7, 0.6], left: [0.15, 1.35, 0.25], yaw: 0.1 }),
    g(1),
  ] },
  // Right hook with the sword hand (pommel first), hips turning through it.
  hook: { dur: 0.48, keys: [
    g(0),
    g(0.25, { hand: [-0.45, 1.25, 0.05], blade: [-0.2, 0.9, -0.3], left: [0.2, 1.35, 0.3], yaw: -0.6, hipY: -0.08 }),
    g(0.48, { hand: [0.15, 1.35, 0.6], blade: [0.1, 0.95, 0.2], left: [0.2, 1.3, 0.25], yaw: 0.65, hipY: -0.1, hipZ: 0.12 }),
    g(0.72, { hand: [0.3, 1.25, 0.35], blade: [0.3, 0.9, 0], left: [0.2, 1.3, 0.25], yaw: 0.5 }),
    g(1),
  ] },
  // Front kick: chamber the right knee, drive the heel into the chest.
  frontKick: { dur: 0.55, keys: [
    g(0),
    g(0.28, { hand: [-0.35, 1.15, 0.15], blade: [-0.3, 0.6, 0.6], left: [0.25, 1.3, 0.2], pitch: -0.15, kickR: [-0.12, 0.75, 0.35] }),
    g(0.46, { hand: [-0.4, 1.15, 0.05], blade: [-0.3, 0.6, 0.6], left: [0.3, 1.25, 0.05], pitch: -0.3, hipZ: 0.1, kickR: [-0.1, 1.05, 0.95] }),
    g(0.68, { hand: [-0.35, 1.15, 0.15], blade: [-0.3, 0.6, 0.6], left: [0.25, 1.3, 0.2], pitch: -0.1, kickR: [-0.12, 0.6, 0.4] }),
    g(1),
  ] },
  // Roundhouse: pivot on the left foot, the right shin whips round at head height.
  roundhouse: { dur: 0.62, keys: [
    g(0),
    g(0.25, { hand: [-0.45, 1.2, 0.0], blade: [-0.5, 0.6, -0.3], left: [0.35, 1.35, 0.15], spin: 0.5, roll: -0.2, kickR: [-0.45, 0.8, 0.1] }),
    g(0.45, { hand: [-0.5, 1.25, -0.1], blade: [-0.6, 0.5, -0.4], left: [0.45, 1.3, 0.0], spin: 1.0, roll: -0.45, kickR: [0.2, 1.45, 0.9] }),
    g(0.62, { hand: [-0.45, 1.2, 0.0], blade: [-0.5, 0.6, -0.3], left: [0.35, 1.35, 0.15], spin: 1.3, roll: -0.25, kickR: [0.5, 1.0, 0.4] }),
    g(1, { spin: 0 }),
  ] },
  // Spinning back kick (Elise): turn away, the left heel lances back through the foe.
  spinKick: { dur: 0.6, keys: [
    g(0),
    g(0.25, { hand: [-0.3, 1.2, 0.1], blade: [-0.3, 0.7, -0.5], left: [0.3, 1.3, 0.1], spin: -1.6, pitch: 0.2 }),
    g(0.46, { hand: [-0.3, 1.3, 0.1], blade: [-0.3, 0.7, -0.5], left: [0.35, 1.25, 0.2], spin: -3.1, pitch: 0.45, kickL: [0.05, 1.1, -0.95] }),
    g(0.7, { hand: [-0.3, 1.2, 0.1], blade: [-0.3, 0.7, -0.5], left: [0.3, 1.3, 0.1], spin: -3.6, pitch: 0.2, kickL: [0.1, 0.7, -0.4] }),
    g(1, { spin: -2 * Math.PI }),
  ] },
  // Backflip kick (Elise's finisher): the right foot whips up under the chin as she goes over.
  flipKick: { dur: 0.85, keys: [
    g(0),
    g(0.15, { hand: [-0.25, 1.0, 0.15], blade: [-0.3, -0.5, 0.8], left: [0.25, 1.1, 0.15], hipY: -0.22 }),
    g(0.35, { hand: [-0.35, 1.3, 0.0], blade: [-0.4, 0.3, -0.8], left: [0.35, 1.3, 0.0], hipY: 0.55, flip: -1.6, air: 1, tuck: 0.2, kickR: [-0.1, 1.6, 0.7] }),
    g(0.55, { hand: [-0.3, 1.15, 0.05], blade: [-0.4, 0.3, -0.8], left: [0.3, 1.15, 0.05], hipY: 0.75, flip: -3.6, air: 1, tuck: 0.6 }),
    g(0.78, { hand: [-0.25, 1.05, 0.2], blade: [-0.2, -0.3, 0.9], left: [0.3, 1.1, 0.2], hipY: 0.1, flip: -2 * Math.PI, air: 0.4, tuck: 0.2 }),
    g(0.9, { hipY: -0.18, flip: -2 * Math.PI }),
    g(1, { flip: -2 * Math.PI }),
  ] },
  // Front-flip cleave (Jack's finisher): vault over, blade overhead, and bring it down on landing.
  flipCleave: { dur: 0.95, keys: [
    g(0),
    g(0.15, { hand: [-0.05, 1.3, 0.2], blade: [0, 0.8, 0.5], hipY: -0.25 }),
    g(0.4, { hand: [-0.05, 1.7, -0.05], blade: [0, 0.6, -0.8], hipY: 0.7, hipZ: 0.3, flip: Math.PI, air: 1, tuck: 0.55 }),
    g(0.62, { hand: [-0.05, 1.9, -0.05], blade: [0, 0.55, -0.85], hipY: 0.45, hipZ: 0.5, flip: 2 * Math.PI, air: 0.7, tuck: 0.3, pitch: -0.2 }),
    g(0.78, { hand: [0, 0.9, 0.62], blade: [0, -0.6, 0.8], hipY: -0.24, hipZ: 0.55, flip: 2 * Math.PI, pitch: 0.5 }),
    g(1, { hipZ: 0.4, flip: 2 * Math.PI }),
  ] },
};

// Catmull-Rom through the keys (clamped ends) for smooth arcs and velocities.
function sample(keys: PoseKey[], t: number) {
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1].t) i++;
  const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(keys.length - 1, i + 2)];
  const u = THREE.MathUtils.clamp((t - k1.t) / Math.max(1e-4, k2.t - k1.t), 0, 1);
  const cr = (a: number, b: number, c: number, d: number) => 0.5 * ((2 * b) + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
  const n = (f: (k: PoseKey) => number) => cr(f(k0), f(k1), f(k2), f(k3));
  const v = (f: (k: PoseKey) => V) => new THREE.Vector3(n((k) => f(k)[0]), n((k) => f(k)[1]), n((k) => f(k)[2]));
  const leftOf = (k: PoseKey): V | null => (k.left && k.left !== 'grip' ? k.left : null);
  const kick = (sel: (k: PoseKey) => V | undefined) => {
    const w = (k: PoseKey) => (sel(k) ? 1 : 0);
    const pos = w(k1) || w(k2) ? v((k) => sel(k) ?? sel(k1) ?? sel(k2)!) : null;
    return { pos, w: THREE.MathUtils.clamp(w(k1) + (w(k2) - w(k1)) * u, 0, 1) };
  };
  // Grip ↔ free-hand blends: weight of the free target.
  const lw = (k: PoseKey) => (leftOf(k) ? 1 : 0);
  const free = lw(k1) || lw(k2) ? v((k) => leftOf(k) ?? leftOf(k1) ?? leftOf(k2)!) : null;
  return {
    hand: v((k) => k.hand), blade: v((k) => k.blade).normalize(),
    left: free, leftW: THREE.MathUtils.clamp(lw(k1) + (lw(k2) - lw(k1)) * u, 0, 1),
    yaw: n((k) => k.yaw ?? 0), pitch: n((k) => k.pitch ?? 0), roll: n((k) => k.roll ?? 0),
    hipY: n((k) => k.hipY ?? 0), hipZ: n((k) => k.hipZ ?? 0), spin: n((k) => k.spin ?? 0),
    flip: n((k) => k.flip ?? 0), air: THREE.MathUtils.clamp(n((k) => k.air ?? 0), 0, 1), tuck: n((k) => k.tuck ?? 0),
    kickL: kick((k) => k.kickL), kickR: kick((k) => k.kickR),
  };
}

const Y = new THREE.Vector3(0, 1, 0);
const swing = (from: THREE.Vector3, to: THREE.Vector3) => new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), to.clone().normalize());

/** Two-bone IK: joint position for root S reaching T with lengths a, b and a pole hint. */
function solve2(S: THREE.Vector3, T: THREE.Vector3, a: number, b: number, pole: THREE.Vector3) {
  const toT = T.clone().sub(S);
  const d = THREE.MathUtils.clamp(toT.length(), Math.abs(a - b) + 1e-3, (a + b) * 0.999);
  const u = toT.normalize();
  const cosA = THREE.MathUtils.clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
  const v = pole.clone().sub(u.clone().multiplyScalar(pole.dot(u))).normalize();
  const J = S.clone().addScaledVector(u, a * cosA).addScaledVector(v, a * Math.sqrt(1 - cosA * cosA));
  return { J, T: S.clone().addScaledVector(u, d) };
}

/** Bake a move onto Jack's skeleton. `model` must sit under an un-transformed root. */
export function bakeMove(model: THREE.Object3D, name: string, def: MoveDef, bladeRest: THREE.Vector3, alias: Record<string, string> = {}, fps = 60): THREE.AnimationClip {
  restPose(model);
  const names = ['Hips', 'Spine02', 'Spine01', 'Spine', 'neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
    'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'] as const;
  type N = typeof names[number];
  // Bones by role (named as on the Meshy rig); `alias` maps them onto other skeletons.
  const B = Object.fromEntries(names.map((n) => [n, findBone(model, alias[n] ?? n)!])) as Record<N, THREE.Bone>;
  const P0 = {} as Record<N, THREE.Vector3>, Q0 = {} as Record<N, THREE.Quaternion>;
  for (const n of names) { P0[n] = B[n].getWorldPosition(new THREE.Vector3()); Q0[n] = B[n].getWorldQuaternion(new THREE.Quaternion()); }
  const parentOf: Partial<Record<N, N>> = {
    Spine02: 'Hips', Spine01: 'Spine02', Spine: 'Spine01', neck: 'Spine', Head: 'neck',
    LeftShoulder: 'Spine', LeftArm: 'LeftShoulder', LeftForeArm: 'LeftArm', LeftHand: 'LeftForeArm',
    RightShoulder: 'Spine', RightArm: 'RightShoulder', RightForeArm: 'RightArm', RightHand: 'RightForeArm',
    LeftUpLeg: 'Hips', LeftLeg: 'LeftUpLeg', LeftFoot: 'LeftLeg', RightUpLeg: 'Hips', RightLeg: 'RightUpLeg', RightFoot: 'RightLeg',
  };
  const len = (a: N, b: N) => P0[a].distanceTo(P0[b]);
  const armR = [len('RightArm', 'RightForeArm'), len('RightForeArm', 'RightHand')];
  const armL = [len('LeftArm', 'LeftForeArm'), len('LeftForeArm', 'LeftHand')];
  const legR = [len('RightUpLeg', 'RightLeg'), len('RightLeg', 'RightFoot')];
  const legL = [len('LeftUpLeg', 'LeftLeg'), len('LeftLeg', 'LeftFoot')];
  const hipsParent = B.Hips.parent!;
  hipsParent.updateWorldMatrix(true, false);
  const hipsParentInv = hipsParent.matrixWorld.clone().invert();
  const hipsParentQ = hipsParent.getWorldQuaternion(new THREE.Quaternion());
  // Fighting stance: left foot forward, right foot back and turned out.
  const footL0 = P0.LeftFoot.clone().add(new THREE.Vector3(0.02, 0, 0.16));
  const footR0 = P0.RightFoot.clone().add(new THREE.Vector3(-0.03, 0, -0.14));

  const W = {} as Record<N, THREE.Quaternion>, P = {} as Record<N, THREE.Vector3>;
  // Inherited world rotation/position of a child from its parent's new transform.
  const inherit = (n: N) => { const p = parentOf[n]!; return W[p].clone().multiply(Q0[p].clone().invert()).multiply(Q0[n]); };
  const place = (n: N) => { const p = parentOf[n]!; P[n] = P[p].clone().add(P0[n].clone().sub(P0[p]).applyQuaternion(W[p].clone().multiply(Q0[p].clone().invert()))); };
  const aim = (n: N, child: N, dir: THREE.Vector3) => {
    const Wi = inherit(n);
    const restDir = P0[child].clone().sub(P0[n]).applyQuaternion(Wi.clone().multiply(Q0[n].clone().invert()));
    W[n] = swing(restDir, dir).multiply(Wi);
  };

  const frames = Math.max(2, Math.round(def.dur * fps));
  const times: number[] = [];
  const tracks = new Map<N, number[]>(names.map((n) => [n, []]));
  const hipPos: number[] = [];
  for (let f = 0; f <= frames; f++) {
    const t = f / frames;
    times.push(t * def.dur);
    const s = sample(def.keys, t);
    const Qspin = new THREE.Quaternion().setFromAxisAngle(Y, s.spin);
    // Somersault about the (spun) left-right axis, pivoting on the hips.
    const Qbody = Qspin.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), s.flip));
    const toSpin = (v: THREE.Vector3) => v.clone().applyQuaternion(Qspin);
    const hipsUp = new THREE.Vector3(0, P0.Hips.y + s.hipY, 0);
    // Body-space targets turn with the somersault around the hips.
    const toBody = (v: THREE.Vector3) => (s.flip ? v.clone().sub(hipsUp).applyQuaternion(Qbody).add(hipsUp) : v.clone().applyQuaternion(Qspin));
    // Hips: drop + lunge (in the spun facing), spin, flip.
    W.Hips = Qbody.clone().multiply(Q0.Hips);
    P.Hips = toSpin(P0.Hips.clone().setY(0)).setY(P0.Hips.y + s.hipY).add(toSpin(new THREE.Vector3(0, 0, s.hipZ)));
    // Torso twist/lean spread over three spine bones; head counters half the twist.
    const T = new THREE.Quaternion().setFromEuler(new THREE.Euler(s.pitch, s.yaw, s.roll, 'YXZ'));
    const I = new THREE.Quaternion();
    (['Spine02', 'Spine01', 'Spine'] as const).forEach((n, i) => {
      W[n] = Qbody.clone().multiply(I.clone().slerp(T, (i + 1) / 3)).multiply(Q0[n]);
      place(n);
    });
    W.neck = Qbody.clone().multiply(I.clone().slerp(T, 0.75)).multiply(Q0.neck); place('neck');
    W.Head = Qbody.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(s.pitch * 0.3, s.yaw * 0.35, 0, 'YXZ'))).multiply(Q0.Head); place('Head');
    for (const n of ['LeftShoulder', 'RightShoulder'] as const) { W[n] = inherit(n); place(n); }

    // Right arm → sword hand; blade orientation on the hand.
    place('RightArm');
    const hand = toBody(s.hand), blade = toBody(s.blade);
    const rArm = solve2(P.RightArm, hand, armR[0], armR[1], toBody(new THREE.Vector3(-0.7, -1, -0.25)));
    aim('RightArm', 'RightForeArm', rArm.J.clone().sub(P.RightArm)); place('RightForeArm');
    aim('RightForeArm', 'RightHand', rArm.T.clone().sub(rArm.J)); place('RightHand');
    {
      const Wi = inherit('RightHand');
      const bladeNow = bladeRest.clone().applyQuaternion(Wi.clone().multiply(Q0.RightHand.clone().invert()));
      W.RightHand = swing(bladeNow, blade).multiply(Wi);
    }
    // Left arm: on the grip below the right hand, or its own target.
    place('LeftArm');
    const grip = rArm.T.clone().addScaledVector(blade, -0.12);
    const lt = s.left ? grip.clone().lerp(toBody(s.left), s.leftW) : grip;
    const lArm = solve2(P.LeftArm, lt, armL[0], armL[1], toBody(new THREE.Vector3(0.7, -1, -0.25)));
    aim('LeftArm', 'LeftForeArm', lArm.J.clone().sub(P.LeftArm)); place('LeftForeArm');
    aim('LeftForeArm', 'LeftHand', lArm.T.clone().sub(lArm.J));
    W.LeftHand = inherit('LeftHand');

    // Legs: planted stance (pivoting with the spin), knees forward — or airborne (riding the
    // body through a flip, tucked toward the hips), or kicking out at a target.
    for (const [up, low, foot, L, target, kk] of [['LeftUpLeg', 'LeftLeg', 'LeftFoot', legL, footL0, s.kickL], ['RightUpLeg', 'RightLeg', 'RightFoot', legR, footR0, s.kickR]] as const) {
      place(up);
      const planted = toSpin(target);
      const airborne = P.Hips.clone().add(target.clone().sub(P0.Hips).multiplyScalar(1 - 0.45 * s.tuck).applyQuaternion(Qbody));
      let tgt = planted.lerp(airborne, s.air);
      if (kk.pos) tgt = tgt.lerp(toBody(kk.pos), kk.w);
      const sol = solve2(P[up], tgt, L[0], L[1], toBody(new THREE.Vector3(0, 0.2, 1)));
      aim(up, low, sol.J.clone().sub(P[up])); place(low);
      aim(low, foot, sol.T.clone().sub(sol.J));
      W[foot] = Qbody.clone().multiply(Q0[foot]);
    }

    for (const n of names) {
      const p = parentOf[n];
      const parentW = p ? W[p] : hipsParentQ;
      const local = parentW.clone().invert().multiply(W[n]);
      tracks.get(n)!.push(local.x, local.y, local.z, local.w);
    }
    const hl = P.Hips.clone().applyMatrix4(hipsParentInv);
    hipPos.push(hl.x, hl.y, hl.z);
  }
  restPose(model);
  const out: THREE.KeyframeTrack[] = names.map((n) => new THREE.QuaternionKeyframeTrack(`${B[n].name}.quaternion`, times, tracks.get(n)!));
  out.push(new THREE.VectorKeyframeTrack(`${B.Hips.name}.position`, times, hipPos));
  return new THREE.AnimationClip(name, def.dur, out);
}

