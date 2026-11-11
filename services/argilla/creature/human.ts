/**
 * human.ts — the creature plan grown into a human body plan (Character Forge, docs/character-forge.md §1).
 *
 * Same idea as anatomy.ts: skeleton first, muscle on the skeleton, skin over the muscle, all one piece of data. What a
 * person needs on top of the creature plan:
 * - joint names on the shared contract skeleton (Hips … RightToeBase, the names Era Clash and Ravencrest retarget
 *   CMU captures and Haru's strikes onto), so every clip plays without a mapping table;
 * - real hands: three joints per finger and a thumb, so a hilt is gripped, not glued;
 * - twist joints in the upper arms and forearms (leaves, driven at runtime, so the contract chain is untouched);
 * - about thirty human muscle groups, each with an origin, an insertion and a belly;
 * - a face on MediaPipe's canonical face mesh, so the VTuber rig builder's 43 ARKit shapes apply without fitting.
 *
 * Every clay part records the bone (or, for a muscle, the two bones) it rides on, so the field can be re-posed: bend
 * the elbow and the biceps shortens and thickens at constant volume. Corrective shapes are baked from exactly that.
 *
 * Space: metres, y up, feet on y = 0, facing +z, the subject's left on +x.
 */

import type { ClayPart } from '../bake';
import type { Vec3 } from '../engine';
import { CANONICAL_INDICES, CANONICAL_POSITIONS } from '../../vtuber/rigBuilder/canonicalFace';

export type HumanSide = 'Left' | 'Right';
const FINGERS = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'] as const;
export type FingerName = (typeof FINGERS)[number];

const sideJoints = (s: HumanSide) => [
  `${s}Shoulder`, `${s}Arm`, `${s}ArmTwist`, `${s}ForeArm`, `${s}ForeArmTwist`, `${s}Hand`,
  ...FINGERS.flatMap((f) => [1, 2, 3].map((k) => `${s}Hand${f}${k}`)),
];
/** Contract skeleton (first 22 names, the Muse/Mixamo set) plus hands, twists and eyes. Skin indices follow this order. */
export const HUMAN_JOINTS = [
  'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftEye', 'RightEye',
  ...sideJoints('Left'), ...sideJoints('Right'),
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase',
] as const;
export type HumanJoint = (typeof HUMAN_JOINTS)[number];

/** Twist joints are leaves: the chain Arm → ForeArm → Hand stays the contract chain; a driver rolls them at runtime. */
export const TWIST_JOINTS: Record<string, { parent: string; driver: string; share: number; from: number; to: number }> = {
  // forearm: takes part of the hand's roll about the forearm, ramps in from mid-forearm to the wrist
  LeftForeArmTwist: { parent: 'LeftForeArm', driver: 'LeftHand', share: 0.6, from: 0.3, to: 0.95 },
  RightForeArmTwist: { parent: 'RightForeArm', driver: 'RightHand', share: 0.6, from: 0.3, to: 0.95 },
  // upper arm: undoes part of the arm's own roll near the shoulder, so the deltoid doesn't wring
  LeftArmTwist: { parent: 'LeftArm', driver: 'LeftArm', share: -0.5, from: 0.55, to: 0.05 },
  RightArmTwist: { parent: 'RightArm', driver: 'RightArm', share: -0.5, from: 0.55, to: 0.05 },
};

export interface HumanTune {
  /** Standing height in metres (crown, not hair). */
  height: number;
  /** Shoulder breadth, 1 = average. */
  build: number;
  /** 0 soft … 1 hard-trained: muscle size and definition. */
  musculature: number;
  /** 0 lean … 1 heavy: fat over the muscle. */
  weight: number;
  /** Years; only shapes the face and posture lightly. */
  age: number;
}

export const HARU_TUNE: HumanTune = { height: 1.74, build: 1.04, musculature: 0.72, weight: 0.18, age: 31 };

export interface HumanBone {
  name: HumanJoint;
  parent: HumanJoint | null;
  at: Vec3;
  tip: Vec3;
  /** Limb radius around this bone (skin weights, capsules). */
  radius: number;
}

export interface HumanMuscle {
  id: string;
  label: string;
  from: { joint: HumanJoint; at: Vec3 };
  to: { joint: HumanJoint; at: Vec3 };
  radius: number;
  belly: number;
  side: HumanSide | null;
}

/** A clay part riding on bones: `a` moves with `boneA`, `b` with `boneB` (the same bone for anything rigid). */
export interface BodyPart extends ClayPart {
  boneA: HumanJoint;
  boneB: HumanJoint;
  /** Index into `muscles` when the part is a muscle belly (its radius follows its length when posed). */
  muscle?: number;
}

/** Collision capsule for cloth and spring chains, from the anatomy (bone-relative ends are the rest positions). */
export interface BodyCapsule { bone: HumanJoint; a: Vec3; b: Vec3; r: number }

export interface HumanAnatomy {
  tune: HumanTune;
  bones: HumanBone[];
  byName: Record<HumanJoint, HumanBone>;
  muscles: HumanMuscle[];
  parts: BodyPart[];
  capsules: BodyCapsule[];
  /** The 468 canonical face landmarks placed on this head (rest pose, world space). */
  face: Vec3[];
  /** The canonical face mesh set in by `thickness`: the field adds a shell of that thickness around it. */
  faceShell: { points: Vec3[]; thickness: number };
  /** Grip sockets in the rest pose: palm centre and the hilt axis through the curled fingers. */
  grip: Record<HumanSide, { at: Vec3; axis: Vec3; palm: Vec3 }>;
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: Vec3): Vec3 => mul(a, 1 / (len(a) || 1));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mirror = (v: Vec3): Vec3 => [-v[0], v[1], v[2]];
/** Rotate v about unit axis k by angle a (Rodrigues). */
const rot = (v: Vec3, k: Vec3, a: number): Vec3 => {
  const c = Math.cos(a), s = Math.sin(a);
  return add(add(mul(v, c), mul(cross(k, v), s)), mul(k, dot(k, v) * (1 - c)));
};

export const PARENT: Record<HumanJoint, HumanJoint | null> = (() => {
  const p: Record<string, string | null> = {
    Hips: null, Spine: 'Hips', Spine1: 'Spine', Spine2: 'Spine1', Neck: 'Spine2', Head: 'Neck', LeftEye: 'Head', RightEye: 'Head',
    LeftUpLeg: 'Hips', LeftLeg: 'LeftUpLeg', LeftFoot: 'LeftLeg', LeftToeBase: 'LeftFoot',
    RightUpLeg: 'Hips', RightLeg: 'RightUpLeg', RightFoot: 'RightLeg', RightToeBase: 'RightFoot',
  };
  for (const s of ['Left', 'Right'] as HumanSide[]) {
    p[`${s}Shoulder`] = 'Spine2'; p[`${s}Arm`] = `${s}Shoulder`; p[`${s}ArmTwist`] = `${s}Arm`;
    p[`${s}ForeArm`] = `${s}Arm`; p[`${s}ForeArmTwist`] = `${s}ForeArm`; p[`${s}Hand`] = `${s}ForeArm`;
    for (const f of FINGERS) { p[`${s}Hand${f}1`] = `${s}Hand`; p[`${s}Hand${f}2`] = `${s}Hand${f}1`; p[`${s}Hand${f}3`] = `${s}Hand${f}2`; }
  }
  return p as Record<HumanJoint, HumanJoint | null>;
})();

/** Where a finger's knuckle sits across the palm (toward the thumb is +), its three segment lengths and its splay. */
const FINGER_PLAN: Record<Exclude<FingerName, 'Thumb'>, { across: number; back: number; segs: [number, number, number]; splay: number; r: number }> = {
  Index: { across: 0.0265, back: 0.0, segs: [0.044, 0.026, 0.021], splay: 0.07, r: 0.0088 },
  Middle: { across: 0.0085, back: -0.004, segs: [0.049, 0.030, 0.023], splay: 0.0, r: 0.0091 },
  Ring: { across: -0.0105, back: 0.0, segs: [0.046, 0.028, 0.022], splay: -0.06, r: 0.0085 },
  Pinky: { across: -0.0275, back: 0.011, segs: [0.036, 0.021, 0.019], splay: -0.14, r: 0.0074 },
};

export function buildHumanAnatomy(tune: HumanTune = HARU_TUNE): HumanAnatomy {
  const k = tune.height / 1.74;
  const P = (x: number, y: number, z: number): Vec3 => [x * k, y * k, z * k];
  const W = tune.build;
  const M = tune.musculature, F = tune.weight;
  const J = {} as Record<HumanJoint, Vec3>;
  const tips = {} as Record<HumanJoint, Vec3>;

  // ---- Skeleton (left side; the right is mirrored) ------------------------------------------------
  J.Hips = P(0, 0.985, 0.0);
  J.Spine = P(0, 1.075, -0.012);
  J.Spine1 = P(0, 1.185, -0.018);
  J.Spine2 = P(0, 1.305, -0.012);
  J.Neck = P(0, 1.465, -0.022);
  J.Head = P(0, 1.565, -0.006);
  tips.Hips = J.Spine; tips.Spine = J.Spine1; tips.Spine1 = J.Spine2; tips.Spine2 = J.Neck; tips.Neck = J.Head;
  tips.Head = P(0, 1.74, -0.006);

  J.LeftShoulder = P(0.022 * W, 1.43, 0.012);
  J.LeftArm = P(0.172 * W, 1.405, -0.012);
  // A-pose: the upper arm 48° below horizontal, a touch forward; the elbow carries the forearm a little further forward.
  const upperLen = 0.292 * k, foreLen = 0.252 * k;
  const armDir = norm([Math.cos((48 * Math.PI) / 180), -Math.sin((48 * Math.PI) / 180), 0.06]);
  J.LeftForeArm = add(J.LeftArm, mul(armDir, upperLen));
  const foreDir = norm(add(armDir, [0.0, -0.02, 0.2]));
  J.LeftHand = add(J.LeftForeArm, mul(foreDir, foreLen));
  J.LeftArmTwist = lerp(J.LeftArm, J.LeftForeArm, 0.35);
  J.LeftForeArmTwist = lerp(J.LeftForeArm, J.LeftHand, 0.62);
  tips.LeftShoulder = J.LeftArm; tips.LeftArm = J.LeftForeArm; tips.LeftArmTwist = J.LeftForeArm;
  tips.LeftForeArm = J.LeftHand; tips.LeftForeArmTwist = J.LeftHand;

  // Hand frame: `along` down the hand, `palm` the way the palm faces (toward the thigh), `thumbSide` forward.
  const along = foreDir;
  const thumbSide = norm(cross(along, cross([0, 0, 1], along)));     // +z, made perpendicular to the hand
  const palm = norm(cross(thumbSide, along));                        // points toward the body and down
  const palmLen = 0.097 * k;
  const knuckles = add(J.LeftHand, mul(along, palmLen));
  tips.LeftHand = knuckles;
  for (const [f, plan] of Object.entries(FINGER_PLAN) as [Exclude<FingerName, 'Thumb'>, (typeof FINGER_PLAN)['Index']][]) {
    let at = add(add(knuckles, mul(thumbSide, plan.across * k)), mul(along, -plan.back * k));
    // Relaxed hand: each segment curls a little more toward the palm, and the fingers fan.
    let dir = norm(rot(along, palm, 0)); dir = norm(add(dir, mul(thumbSide, plan.splay)));
    const curlAxis = norm(cross(dir, palm)); // positive angle turns dir toward the palm
    for (let s = 0; s < 3; s++) {
      const name = `LeftHand${f}${s + 1}` as HumanJoint;
      J[name] = at;
      dir = norm(rot(dir, curlAxis, -((s === 0 ? 10 : 14) * Math.PI) / 180));
      const tip = add(at, mul(dir, plan.segs[s] * k));
      tips[name] = tip;
      at = tip;
    }
  }
  {
    // Thumb: from the base of the palm, out toward the thumb side and across the palm.
    const t1 = add(add(add(J.LeftHand, mul(along, 0.022 * k)), mul(thumbSide, 0.021 * k)), mul(palm, 0.012 * k));
    let dir = norm(add(add(mul(along, 0.62), mul(thumbSide, 0.62)), mul(palm, 0.45)));
    const segs = [0.044, 0.033, 0.028];
    let at = t1;
    const curlAxis = norm(cross(dir, palm));
    for (let s = 0; s < 3; s++) {
      const name = `LeftHandThumb${s + 1}` as HumanJoint;
      J[name] = at;
      dir = norm(rot(dir, curlAxis, -(8 * Math.PI) / 180));
      const tip = add(at, mul(dir, segs[s] * k));
      tips[name] = tip;
      at = tip;
    }
  }

  J.LeftUpLeg = P(0.088, 0.925, 0.0);
  J.LeftLeg = P(0.094, 0.505, 0.012);
  J.LeftFoot = P(0.098, 0.082, -0.022);
  J.LeftToeBase = P(0.116, 0.022, 0.118);
  tips.LeftUpLeg = J.LeftLeg; tips.LeftLeg = J.LeftFoot; tips.LeftFoot = J.LeftToeBase; tips.LeftToeBase = P(0.124, 0.02, 0.19);

  J.LeftEye = P(0.032, 1.652, 0.083);
  tips.LeftEye = add(J.LeftEye, P(0, 0, 0.02));

  for (const name of HUMAN_JOINTS) {
    if (!name.startsWith('Left')) continue;
    const r = name.replace(/^Left/, 'Right') as HumanJoint;
    J[r] = mirror(J[name]);
    tips[r] = mirror(tips[name]);
  }

  // ---- Bones ----------------------------------------------------------------------------------------
  const R = (name: string): number => {
    const b = name.replace(/^(Left|Right)/, '');
    const m = mix(0.9, 1.15, M) * mix(1, 1.15, F);
    const table: Record<string, number> = {
      Hips: 0.12, Spine: 0.11, Spine1: 0.115, Spine2: 0.13, Neck: 0.055, Head: 0.09, Eye: 0.012,
      Shoulder: 0.05, Arm: 0.048, ArmTwist: 0.046, ForeArm: 0.04, ForeArmTwist: 0.034, Hand: 0.028,
      UpLeg: 0.075, Leg: 0.05, Foot: 0.04, ToeBase: 0.025,
    };
    if (b.startsWith('Hand') && b !== 'Hand') return 0.0085 * k;
    return (table[b] ?? 0.03) * k * (b === 'Head' || b === 'Eye' ? 1 : m);
  };
  const bones: HumanBone[] = HUMAN_JOINTS.map((name) => ({ name, parent: PARENT[name], at: J[name], tip: tips[name], radius: R(name) }));
  const byName = Object.fromEntries(bones.map((b) => [b.name, b])) as Record<HumanJoint, HumanBone>;

  // ---- Muscles (~30 groups) -------------------------------------------------------------------------
  // Offsets are in the body frame (x out to the side being built, y up, z forward), metres at 1.74 m.
  const muscles: HumanMuscle[] = [];
  const parts: BodyPart[] = [];
  const muscleScale = mix(0.82, 1.12, M);
  const at = (j: HumanJoint, o: Vec3, s: HumanSide | null): Vec3 => add(J[j], s === 'Right' ? mirror(P(...o)) : P(...o));
  const belly = (id: string, label: string, side: HumanSide | null, fj: HumanJoint, fo: Vec3, tj: HumanJoint, to: Vec3, radius: number, b = 0.45) => {
    muscles.push({ id: side ? `${id}${side[0]}` : id, label, side, from: { joint: fj, at: at(fj, fo, side) }, to: { joint: tj, at: at(tj, to, side) }, radius: radius * k * muscleScale, belly: b });
  };
  const S = (s: HumanSide, j: string) => `${s}${j}` as HumanJoint;
  belly('rectusAbdominis', 'Abdominals', null, 'Hips', [0, 0.02, 0.085], 'Spine2', [0, -0.07, 0.1], 0.04, 0.5);
  belly('erectorSpinae', 'Spinal erectors', null, 'Hips', [0, 0.05, -0.075], 'Spine2', [0, 0.02, -0.085], 0.042, 0.4);
  belly('splenius', 'Neck extensors', null, 'Spine2', [0, 0.1, -0.06], 'Head', [0, 0.01, -0.05], 0.03, 0.5);
  for (const s of ['Left', 'Right'] as HumanSide[]) {
    belly('sternocleid', 'Sternocleidomastoid', s, 'Spine2', [0.022, 0.12, 0.06], 'Head', [0.05, 0.0, -0.01], 0.014, 0.5);
    belly('trapezius', 'Trapezius', s, 'Spine2', [0.03, 0.06, -0.075], 'Neck', [0.035, 0.03, -0.03], 0.034 * mix(1, 1.25, M), 0.45);
    belly('trapeziusMid', 'Mid trapezius', s, 'Spine1', [0.04, 0.05, -0.085], S(s, 'Shoulder'), [0.11, 0.0, -0.05], 0.026, 0.5);
    belly('deltoidFront', 'Front deltoid', s, S(s, 'Shoulder'), [0.1, 0.0, 0.035], S(s, 'Arm'), [0.07, -0.08, 0.02], 0.028, 0.4);
    belly('deltoidSide', 'Side deltoid', s, S(s, 'Shoulder'), [0.15, 0.005, -0.005], S(s, 'Arm'), [0.09, -0.08, 0.0], 0.03, 0.38);
    belly('deltoidRear', 'Rear deltoid', s, S(s, 'Shoulder'), [0.12, -0.005, -0.05], S(s, 'Arm'), [0.07, -0.085, -0.02], 0.026, 0.4);
    belly('pectoralis', 'Chest', s, 'Spine2', [0.035, 0.03, 0.095], S(s, 'Arm'), [0.035, -0.04, 0.03], 0.042, 0.42);
    belly('pectoralisLow', 'Lower chest', s, 'Spine2', [0.04, -0.035, 0.09], S(s, 'Arm'), [0.03, -0.05, 0.02], 0.032, 0.45);
    belly('latissimus', 'Lats', s, 'Spine1', [0.085, -0.01, -0.07], S(s, 'Arm'), [-0.025, -0.025, -0.02], 0.042, 0.4);
    belly('serratus', 'Serratus', s, 'Spine1', [0.1, 0.0, 0.035], 'Spine2', [0.105, 0.05, 0.0], 0.022, 0.5);
    belly('obliques', 'Obliques', s, 'Hips', [0.12, 0.06, 0.02], 'Spine1', [0.12, 0.02, 0.04], 0.034, 0.45);
    belly('infraspinatus', 'Infraspinatus', s, 'Spine2', [0.07, -0.02, -0.09], S(s, 'Arm'), [0.0, 0.0, -0.035], 0.026, 0.45);
    belly('biceps', 'Biceps', s, S(s, 'Arm'), [0.0, -0.03, 0.03], S(s, 'ForeArm'), [0.0, 0.02, 0.02], 0.027, 0.55);
    belly('brachialis', 'Brachialis', s, S(s, 'Arm'), [0.012, -0.12, 0.012], S(s, 'ForeArm'), [0.0, -0.015, 0.012], 0.02, 0.5);
    belly('triceps', 'Triceps', s, S(s, 'Arm'), [0.0, -0.01, -0.03], S(s, 'ForeArm'), [0.0, 0.03, -0.028], 0.03, 0.42);
    belly('brachioradialis', 'Brachioradialis', s, S(s, 'Arm'), [0.03, -0.2, 0.01], S(s, 'ForeArm'), [0.035, -0.12, 0.03], 0.022, 0.3);
    belly('forearmFlexors', 'Forearm flexors', s, S(s, 'ForeArm'), [-0.01, -0.01, 0.0], S(s, 'Hand'), [-0.01, 0.025, 0.008], 0.025, 0.28);
    belly('forearmExtensors', 'Forearm extensors', s, S(s, 'ForeArm'), [0.022, 0.0, -0.01], S(s, 'Hand'), [0.008, 0.025, -0.008], 0.022, 0.28);
    belly('thenar', 'Thumb pad', s, S(s, 'Hand'), [0.0, -0.02, 0.012], S(s, 'HandThumb2'), [0, 0, 0], 0.012, 0.45);
    belly('gluteusMax', 'Glutes', s, 'Hips', [0.03, 0.02, -0.09], S(s, 'UpLeg'), [0.03, -0.1, -0.055], 0.062, 0.45);
    belly('gluteusMed', 'Gluteus medius', s, 'Hips', [0.11, 0.06, -0.03], S(s, 'UpLeg'), [0.06, -0.04, 0.0], 0.04, 0.45);
    belly('rectusFemoris', 'Quadriceps', s, S(s, 'UpLeg'), [0.012, -0.03, 0.05], S(s, 'Leg'), [0.0, 0.06, 0.045], 0.044, 0.45);
    belly('vastusLateralis', 'Outer quad', s, S(s, 'UpLeg'), [0.05, -0.07, 0.012], S(s, 'Leg'), [0.03, 0.08, 0.025], 0.042, 0.5);
    belly('vastusMedialis', 'Inner quad', s, S(s, 'UpLeg'), [-0.02, -0.2, 0.025], S(s, 'Leg'), [-0.03, 0.06, 0.03], 0.038, 0.62);
    belly('adductors', 'Adductors', s, 'Hips', [0.03, -0.07, 0.02], S(s, 'UpLeg'), [-0.04, -0.2, 0.0], 0.045, 0.35);
    belly('hamstrings', 'Hamstrings', s, S(s, 'UpLeg'), [0.0, -0.06, -0.05], S(s, 'Leg'), [0.0, 0.05, -0.04], 0.045, 0.45);
    belly('sartorius', 'Sartorius', s, 'Hips', [0.11, -0.01, 0.06], S(s, 'Leg'), [-0.035, 0.0, 0.0], 0.014, 0.5);
    belly('gastrocnemius', 'Calves', s, S(s, 'Leg'), [0.0, -0.02, -0.035], S(s, 'Foot'), [0.0, 0.07, -0.03], 0.04, 0.28);
    belly('soleus', 'Soleus', s, S(s, 'Leg'), [0.0, -0.14, -0.028], S(s, 'Foot'), [0.0, 0.05, -0.035], 0.03, 0.45);
    belly('tibialisAnterior', 'Shin muscle', s, S(s, 'Leg'), [0.02, -0.04, 0.025], S(s, 'Foot'), [0.005, 0.03, 0.04], 0.02, 0.3);
  }
  muscles.forEach((mu, i) => {
    const mid = lerp(mu.from.at, mu.to.at, mu.belly);
    const blend = mix(0.016, 0.006, M) * k;
    parts.push({ op: 'add', a: mu.from.at, ra: mu.radius * 0.32, b: mid, rb: mu.radius, blend, boneA: mu.from.joint, boneB: mu.to.joint, muscle: i });
    parts.push({ op: 'add', a: mid, ra: mu.radius, b: mu.to.at, rb: mu.radius * 0.28, blend, boneA: mu.from.joint, boneB: mu.to.joint, muscle: i });
  });

  // ---- Skeleton core and fat layer: what the body reads as when the muscle is lean -----------------------
  const fat = mix(0.0, 0.012, F) * k;
  const cone = (bone: HumanJoint, a: Vec3, ra: number, b: Vec3, rb: number, blend = 0.02, boneB: HumanJoint = bone) =>
    parts.push({ op: 'add', a, ra: ra * k + fat, b, rb: rb * k + fat, blend: blend * k, boneA: bone, boneB });
  const carve = (bone: HumanJoint, a: Vec3, ra: number, b: Vec3, rb: number, blend = 0.01) =>
    parts.push({ op: 'carve', a, ra: ra * k, b, rb: rb * k, blend: blend * k, boneA: bone, boneB: bone });
  const ball = (bone: HumanJoint, a: Vec3, r: number, blend = 0.02) => cone(bone, a, r, a, r, blend);

  for (const sx of [1, -1]) {
    const X = (v: Vec3): Vec3 => [v[0] * sx, v[1], v[2]];
    // pelvis bowl and the flank above it
    cone('Hips', X(P(0.06, 0.95, 0.0)), 0.085, X(P(0.075, 1.02, 0.005)), 0.08, 0.04);
    cone('Spine', X(P(0.055, 1.06, 0.0)), 0.085, X(P(0.06, 1.13, 0.0)), 0.083, 0.04);
    // rib cage: wider than deep, a pair of eggs leaning in at the top
    cone('Spine1', X(P(0.06, 1.16, 0.005)), 0.092, X(P(0.068, 1.25, 0.005)), 0.1 * W, 0.04);
    cone('Spine2', X(P(0.068, 1.27, 0.0)), 0.1 * W, X(P(0.055, 1.38, -0.01)), 0.085 * W, 0.04);
    // shoulder girdle: clavicle to the acromion, scapula on the back
    const sideJ = (sx > 0 ? 'Left' : 'Right') as HumanSide;
    cone(S(sideJ, 'Shoulder'), X(P(0.02, 1.43, 0.035)), 0.022, X(P(0.16 * W, 1.43, 0.0)), 0.026, 0.02);
    cone(S(sideJ, 'Shoulder'), X(P(0.06, 1.38, -0.075)), 0.03, X(P(0.13 * W, 1.41, -0.05)), 0.03, 0.03);
    // pectoral shelf and the buttock line
    cone('Spine2', X(P(0.045, 1.33, 0.07)), 0.045, X(P(0.11, 1.35, 0.045)), 0.04, 0.03);
    cone('Hips', X(P(0.07, 0.94, -0.05)), 0.075, X(P(0.08, 0.88, -0.04)), 0.07, 0.04, S(sideJ, 'UpLeg'));
  }
  // belly front and the neck
  cone('Spine', P(0, 1.02, 0.045), 0.09, P(0, 1.15, 0.055), 0.088, 0.05, 'Spine1');
  cone('Neck', P(0, 1.44, -0.015), 0.058, P(0, 1.58, -0.005), 0.05, 0.03, 'Head');

  for (const s of ['Left', 'Right'] as HumanSide[]) {
    const j = (n: string) => J[S(s, n)];
    // arm bones under the muscle, with the elbow and wrist knobs that make joints read as joints
    cone(S(s, 'Arm'), j('Arm'), 0.042, j('ForeArm'), 0.032, 0.02, S(s, 'ForeArm'));
    cone(S(s, 'ForeArm'), j('ForeArm'), 0.033, lerp(j('ForeArm'), j('Hand'), 0.55), 0.03, 0.015);
    cone(S(s, 'ForeArm'), lerp(j('ForeArm'), j('Hand'), 0.55), 0.03, j('Hand'), 0.024, 0.015, S(s, 'ForeArmTwist'));
    ball(S(s, 'ForeArm'), add(j('ForeArm'), mul(norm(sub(j('ForeArm'), j('Hand'))), 0.018 * k)), 0.022, 0.012);
    // leg bones: femur under the quads, knee cap, shin, ankle knobs
    cone(S(s, 'UpLeg'), j('UpLeg'), 0.075, j('Leg'), 0.048, 0.03, S(s, 'Leg'));
    ball(S(s, 'Leg'), add(j('Leg'), P(0, 0.008, 0.035)), 0.03, 0.015);
    cone(S(s, 'Leg'), j('Leg'), 0.046, j('Foot'), 0.03, 0.02, S(s, 'Foot'));
    for (const side of [1, -1]) ball(S(s, 'Foot'), add(j('Foot'), P(side * 0.025, 0.0, -0.005)), 0.02, 0.01);
    // foot: heel, arch, ball and toes
    const heel = add(j('Foot'), P(0, -0.05, -0.045));
    cone(S(s, 'Foot'), heel, 0.032, add(j('ToeBase'), P(0, 0.008, -0.01)), 0.03, 0.025, S(s, 'Foot'));
    cone(S(s, 'Foot'), j('Foot'), 0.035, heel, 0.032, 0.02);
    const toeTip = byName[S(s, 'ToeBase')].tip;
    for (let t = 0; t < 5; t++) {
      const off = (t - 1.6) * 0.016 * (s === 'Left' ? 1 : -1) * k;
      const a: Vec3 = add(j('ToeBase'), [off, 0.0, -0.01 * k]);
      const b: Vec3 = add(toeTip, [off * 1.25, 0.0, -Math.abs(t - 0.6) * 0.008 * k]);
      cone(S(s, 'ToeBase'), a, t === 0 ? 0.014 : 0.011, b, t === 0 ? 0.011 : 0.008, 0.008);
    }
    // hand: palm block, fingers on their joints, the thumb's web
    const hand = j('Hand');
    const knuck = byName[S(s, 'Hand')].tip;
    const palmN = s === 'Left' ? palm : mirror(palm);
    const thumbS = s === 'Left' ? thumbSide : mirror(thumbSide);
    for (const t of [-0.02, 0.0, 0.02]) {
      cone(S(s, 'Hand'), add(add(hand, mul(thumbS, t * k)), mul(palmN, 0.004 * k)), 0.016, add(knuck, mul(thumbS, t * 1.15 * k)), 0.012, 0.012);
    }
    cone(S(s, 'Hand'), hand, 0.022, lerp(hand, knuck, 0.4), 0.02, 0.015, S(s, 'ForeArm'));
    for (const f of FINGERS) {
      for (let seg = 1; seg <= 3; seg++) {
        const name = S(s, `Hand${f}${seg}`);
        const b = byName[name];
        const r0 = (f === 'Thumb' ? 0.0105 : FINGER_PLAN[f as Exclude<FingerName, 'Thumb'>].r) * (1 - (seg - 1) * 0.09);
        cone(name, b.at, r0, b.tip, r0 * 0.9, 0.0035);
      }
    }
  }

  // ---- Head: cranium, jaw and a face that passes through the canonical landmarks -----------------------
  const face = placeFace(k);
  // cranium behind the face mask: the canonical landmarks make the whole front of the head
  cone('Head', P(0, 1.652, -0.022), 0.086, P(0, 1.664, -0.03), 0.086, 0.02);
  cone('Head', P(0, 1.6, -0.02), 0.06, P(0, 1.57, 0.0), 0.05, 0.03);                   // skull base to the jaw hinge
  for (const sx of [1, -1]) {
    cone('Head', [sx * 0.055 * k, 1.592 * k, -0.005 * k], 0.022, [sx * 0.035 * k, 1.55 * k, 0.05 * k], 0.016, 0.02); // jaw line
    // ears
    cone('Head', [sx * 0.074 * k, 1.645 * k, -0.005 * k], 0.012, [sx * 0.077 * k, 1.615 * k, -0.012 * k], 0.009, 0.006);
  }
  // The face is MediaPipe's canonical face mesh itself, as a thin shell whose outer side passes through the
  // landmarks (faceShell, smooth-unioned into the field by humanFinish). Behind its outline the skull rises to meet it,
  // so the mask has no rim.
  const normals = landmarkNormals(face);
  const centre: Vec3 = P(0, 1.62, -0.02);
  const outward = normals.map((n, i) => (dot(n, sub(face[i], centre)) < 0 ? mul(n, -1) : n));
  const SHELL = 0.0035 * k;
  const shellPoints = face.map((p, i) => sub(p, mul(outward[i], SHELL)));
  for (const i of FACE_OVAL) {
    const c = sub(face[i], mul(outward[i], 0.013 * k));
    parts.push({ op: 'add', a: c, ra: 0.012 * k, b: c, rb: 0.012 * k, blend: 0.012 * k, boneA: 'Head', boneB: 'Head' });
  }
  // forehead and cheek fill behind the mask, so a gap between the shell and the skull never shows through the eyes
  cone('Head', P(0, 1.67, 0.025), 0.05, P(0, 1.6, 0.03), 0.045, 0.03);
  for (const sx of [1, -1]) cone('Head', [sx * 0.04 * k, 1.63 * k, 0.025 * k], 0.035, [sx * 0.035 * k, 1.585 * k, 0.03 * k], 0.03, 0.03);
  // eye sockets read through the lids: a shallow carve under the brow, the eyeballs behind
  for (const s of ['Left', 'Right'] as HumanSide[]) {
    const eye = J[S(s, 'Eye')];
    ball(S(s, 'Eye'), add(eye, P(0, 0, -0.004)), 0.0115, 0.004);
  }
  carve('Head', P(0, 1.58, 0.096), 0.0035, P(0.017, 1.578, 0.088), 0.0025, 0.004);   // mouth line
  carve('Head', P(0, 1.58, 0.096), 0.0035, P(-0.017, 1.578, 0.088), 0.0025, 0.004);
  // topknot (chonmage) and hair cap are their own mesh; the skull just carries them

  // ---- Capsules for cloth and spring chains --------------------------------------------------------------
  const capsules: BodyCapsule[] = [];
  const cap = (bone: HumanJoint, a: Vec3, b: Vec3, r: number) => capsules.push({ bone, a, b, r: r * k });
  cap('Hips', P(-0.07, 0.95, -0.005), P(0.07, 0.95, -0.005), 0.12);
  cap('Spine1', P(-0.06, 1.2, 0.0), P(0.06, 1.2, 0.0), 0.13);
  cap('Spine2', P(-0.08, 1.33, -0.01), P(0.08, 1.33, -0.01), 0.125);
  for (const s of ['Left', 'Right'] as HumanSide[]) {
    cap(S(s, 'Arm'), J[S(s, 'Arm')], J[S(s, 'ForeArm')], 0.05);
    cap(S(s, 'ForeArm'), J[S(s, 'ForeArm')], J[S(s, 'Hand')], 0.042);
    cap(S(s, 'UpLeg'), J[S(s, 'UpLeg')], J[S(s, 'Leg')], 0.085);
    cap(S(s, 'Leg'), J[S(s, 'Leg')], J[S(s, 'Foot')], 0.058);
  }

  // ---- Grip: the hilt runs across the palm through the curled fingers -------------------------------------
  const grip = {} as HumanAnatomy['grip'];
  for (const s of ['Left', 'Right'] as HumanSide[]) {
    const palmN = s === 'Left' ? palm : mirror(palm);
    const thumbS = s === 'Left' ? thumbSide : mirror(thumbSide);
    const knuck = byName[S(s, 'Hand')].tip;
    const hand = J[S(s, 'Hand')];
    grip[s] = { at: add(lerp(hand, knuck, 0.82), mul(palmN, 0.026 * k)), axis: thumbS, palm: palmN };
  }

  return { tune, bones, byName, muscles, parts, capsules, face, faceShell: { points: shellPoints, thickness: SHELL }, grip };
}

/** MediaPipe's face-oval landmarks (the mask's outline). */
export const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];

/** MediaPipe canonical face (cm-ish units, subject's left +x, +z out of the face) placed on a head of height scale k. */
function placeFace(k: number): Vec3[] {
  const n = CANONICAL_POSITIONS.length / 3;
  let minY = Infinity;
  for (let i = 0; i < n; i++) minY = Math.min(minY, CANONICAL_POSITIONS[i * 3 + 1]);
  const s = 0.0093 * k;
  const chinY = 1.537 * k, frontZ = 0.044 * k;
  const out: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const x = CANONICAL_POSITIONS[i * 3], y = CANONICAL_POSITIONS[i * 3 + 1], z = CANONICAL_POSITIONS[i * 3 + 2];
    out.push([x * s, chinY + (y - minY) * s, frontZ + z * s]);
  }
  return out;
}

/** Vertex normals of the canonical face mesh at its placed landmarks. */
function landmarkNormals(points: Vec3[]): Vec3[] {
  const acc: Vec3[] = points.map(() => [0, 0, 0]);
  const idx = CANONICAL_INDICES;
  for (let t = 0; t < idx.length; t += 3) {
    const a = points[idx[t]], b = points[idx[t + 1]], c = points[idx[t + 2]];
    const n = cross(sub(b, a), sub(c, a));
    for (const v of [idx[t], idx[t + 1], idx[t + 2]]) acc[v] = add(acc[v], n);
  }
  return acc.map(norm);
}

// ---- Posing --------------------------------------------------------------------------------------------

/** A rigid transform per joint: rotation as a unit quaternion [x, y, z, w] and the joint's posed world position. */
export interface JointXf { q: [number, number, number, number]; t: Vec3 }
export type HumanPose = Partial<Record<HumanJoint, [number, number, number, number]>>;

export const qmul = (a: number[], b: number[]): [number, number, number, number] => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
export const qrot = (q: number[], v: Vec3): Vec3 => {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
};
export const qaxis = (axis: Vec3, angle: number): [number, number, number, number] => {
  const n = norm(axis), s = Math.sin(angle / 2);
  return [n[0] * s, n[1] * s, n[2] * s, Math.cos(angle / 2)];
};

/**
 * World transforms for a pose given as local rotations (rest orientation is identity for every joint, so a local
 * rotation is a rotation about the joint in its parent's frame). Joints not in `extra` order use HUMAN_JOINTS order.
 */
export function poseJoints(anatomy: Pick<HumanAnatomy, 'bones'>, pose: HumanPose): Map<string, JointXf> {
  const out = new Map<string, JointXf>();
  for (const b of anatomy.bones) {
    const local = pose[b.name] ?? [0, 0, 0, 1];
    if (!b.parent) { out.set(b.name, { q: local, t: b.at }); continue; }
    const p = out.get(b.parent)!;
    const pb = anatomy.bones.find((x) => x.name === b.parent)!;
    const q = qmul(p.q, local);
    out.set(b.name, { q, t: add(p.t, qrot(p.q, sub(b.at, pb.at))) });
  }
  return out;
}

/** Where a rest-pose point riding on `bone` goes in a pose. */
export function movePoint(anatomy: Pick<HumanAnatomy, 'byName'>, xf: Map<string, JointXf>, bone: HumanJoint, p: Vec3): Vec3 {
  const x = xf.get(bone)!;
  return add(x.t, qrot(x.q, sub(p, anatomy.byName[bone].at)));
}

/**
 * The clay in a pose. Rigid parts ride their bone; a muscle's ends ride its origin and insertion, and its belly
 * thickens as it shortens (radius ∝ 1/√length keeps the volume), which is the bulge a corrective shape stores.
 */
export function posedParts(anatomy: HumanAnatomy, xf: Map<string, JointXf>): ClayPart[] {
  return anatomy.parts.map((p) => {
    const a = movePoint(anatomy, xf, p.boneA, p.a);
    const b = movePoint(anatomy, xf, p.boneB, p.b ?? p.a);
    let ra = p.ra, rb = p.rb ?? p.ra;
    if (p.muscle !== undefined) {
      const mu = anatomy.muscles[p.muscle];
      const l0 = len(sub(mu.to.at, mu.from.at));
      const l1 = len(sub(movePoint(anatomy, xf, mu.to.joint, mu.to.at), movePoint(anatomy, xf, mu.from.joint, mu.from.at)));
      const k = Math.min(1.45, Math.max(0.8, Math.sqrt(l0 / Math.max(1e-4, l1))));
      ra *= k; rb *= k;
    }
    return { op: p.op, a, ra, b, rb, blend: p.blend };
  });
}
