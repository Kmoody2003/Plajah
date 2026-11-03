/**
 * anatomy.ts — builds a body from the inside out: skeleton, then muscle on the skeleton, then skin over the muscle.
 *
 * The rig and the muscle system are not guessed afterwards. They are the same data the clay was baked from,
 * so bones sit inside the limbs and each muscle lies where the bulge is. Every body plan shares one topology,
 * which is why a werewolf can drop to all fours on the same bones a man walks on.
 *
 * Space: x right (subject's left is +x), y up, z toward the viewer, inside -1..1.
 */

import type { ClayPart } from '../bake';
import type { Vec3 } from '../engine';
import type { BodyTune, FurRegion } from './codex';

export type Side = 'L' | 'R';
export const JOINTS = [
  'hips', 'spine', 'chest', 'neck', 'head', 'jaw', 'muzzle', 'earL', 'earR',
  'clavL', 'upperArmL', 'foreArmL', 'handL', 'fingersL',
  'clavR', 'upperArmR', 'foreArmR', 'handR', 'fingersR',
  'thighL', 'shinL', 'ankleL', 'footL', 'toesL',
  'thighR', 'shinR', 'ankleR', 'footR', 'toesR',
  'tail1', 'tail2', 'tail3', 'tailTip',
] as const;
export type JointName = (typeof JOINTS)[number];

const PARENT: Record<JointName, JointName | null> = {
  hips: null, spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck', jaw: 'head', muzzle: 'head', earL: 'head', earR: 'head',
  clavL: 'chest', upperArmL: 'clavL', foreArmL: 'upperArmL', handL: 'foreArmL', fingersL: 'handL',
  clavR: 'chest', upperArmR: 'clavR', foreArmR: 'upperArmR', handR: 'foreArmR', fingersR: 'handR',
  thighL: 'hips', shinL: 'thighL', ankleL: 'shinL', footL: 'ankleL', toesL: 'footL',
  thighR: 'hips', shinR: 'thighR', ankleR: 'shinR', footR: 'ankleR', toesR: 'footR',
  tail1: 'hips', tail2: 'tail1', tail3: 'tail2', tailTip: 'tail3',
};
export const parentOf = (joint: JointName) => PARENT[joint];

export interface Bone {
  name: JointName;
  parent: JointName | null;
  /** The joint's rest position. A bone runs from here to its `tip`. */
  at: Vec3;
  tip: Vec3;
  /** Rough radius of the limb around this bone; skin weights use it. */
  radius: number;
  fur: FurRegion;
}

export interface Muscle {
  id: string;
  /** Spoken name. */
  label: string;
  from: { joint: JointName; offset: Vec3 };
  to: { joint: JointName; offset: Vec3 };
  /** Belly radius at rest. */
  radius: number;
  /** Where along the line the belly is thickest. */
  belly: number;
  side: Side | null;
}

export interface Anatomy {
  tune: BodyTune;
  bones: Bone[];
  byName: Record<JointName, Bone>;
  muscles: Muscle[];
  parts: ClayPart[];
  /** Ground height in world space. */
  floor: number;
  /** Scale applied to fit the domain. */
  scale: number;
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

type Frame = Partial<Record<JointName, Vec3>>;

/** Standing frame, heights in units of a 1.0-tall person. Left side only; the right is mirrored. */
function uprightFrame(t: BodyTune): Frame {
  const leg = t.legLength, arm = t.armLength, d = t.digitigrade;
  const thigh = 0.245 * leg * (1 - 0.1 * d), shin = 0.245 * leg * (1 - 0.08 * d), meta = 0.15 * leg * d;
  // A raised heel folds the leg, so the hips sit lower than the sum of its bones.
  const hipY = thigh * mix(1, 0.92, d) + shin * mix(1, 0.92, d) + meta * 0.82 + 0.05;
  const hipW = 0.05 * t.hips, shoulderW = 0.11 * t.shoulders;
  const torso = 0.3;
  const h = t.hunch;
  const hips: Vec3 = [0, hipY, 0];
  const spine: Vec3 = [0, hipY + torso * 0.33, 0.015 + h * 0.03];
  const chest: Vec3 = [0, hipY + torso * mix(0.72, 0.62, h), 0.015 + h * 0.1];
  const neck: Vec3 = [0, hipY + torso * mix(1.05, 0.86, h), 0.005 + h * 0.15];
  const head: Vec3 = [0, neck[1] + mix(0.09, 0.05, h), neck[2] + 0.015 + h * 0.07];
  const clav: Vec3 = [0.025, chest[1] + 0.055, chest[2] + 0.015];
  const shoulder: Vec3 = [shoulderW, chest[1] + 0.05 - h * 0.012, chest[2] - 0.005];
  // Arms hang out from the sides at about 35 degrees, which skins far better than a T or straight down.
  const upper = 0.17 * arm, fore = 0.15 * arm;
  const elbow = add(shoulder, [upper * 0.5, -upper * 0.86, h * 0.012]);
  const wrist = add(elbow, [fore * 0.42, -fore * 0.89, fore * 0.14 + h * 0.03]);
  const hand = 0.085 * t.handSize;
  const thighAt: Vec3 = [hipW, hipY - 0.015, 0];
  const knee = add(thighAt, [0.006, -thigh * mix(1, 0.88, d), mix(0.008, thigh * 0.42, d)]);
  const ankle = add(knee, [0.002, -shin * mix(1, 0.86, d), mix(-0.008, -shin * 0.52, d)]);
  const ball = add(ankle, [0.002, -(ankle[1] - 0.035) * (d > 0.02 ? 1 : 0.6), mix(0.015, meta * 0.42, d)]);
  return {
    hips, spine, chest, neck, head,
    clavL: clav, upperArmL: shoulder, foreArmL: elbow, handL: wrist, fingersL: add(wrist, [hand * 0.28, -hand * 0.5, hand * 0.1]),
    thighL: thighAt, shinL: knee, ankleL: ankle,
    footL: d > 0.02 ? ball : [ankle[0] + 0.002, 0.04, ankle[2] + 0.02],
    toesL: [ankle[0] + 0.004, 0.018, (d > 0.02 ? ball[2] : ankle[2] + 0.02) + mix(0.09, 0.05, d)],
  };
}

/** Standing on four legs. Same joints: the arms are the forelegs, the spine runs along z. */
function fourLegFrame(t: BodyTune): Frame {
  const leg = 0.36 * t.legLength, foreLeg = 0.34 * t.armLength;
  const back = 0.34;
  const hipY = leg * 0.95 + 0.03, shoulderY = foreLeg * 0.96 + 0.05;
  const hips: Vec3 = [0, hipY, -back * 0.5];
  const spine: Vec3 = [0, mix(hipY, shoulderY, 0.42) + 0.01, -back * 0.14];
  const chest: Vec3 = [0, mix(hipY, shoulderY, 0.8), back * 0.24];
  const neck: Vec3 = [0, shoulderY + 0.035, back * 0.46];
  const head: Vec3 = [0, shoulderY + 0.1 + (1 - t.hunch) * 0.03, back * 0.46 + 0.085];
  const w = 0.058 * t.shoulders, hw = 0.05 * t.hips;
  const shoulder: Vec3 = [w, shoulderY - 0.015, back * 0.33];
  const elbow = add(shoulder, [0.004, -foreLeg * 0.42, -0.02]);
  const wrist = add(elbow, [0, -foreLeg * 0.43, 0.012]);
  const hand = 0.07 * t.handSize;
  const thighAt: Vec3 = [hw, hipY - 0.02, -back * 0.5];
  const d = t.digitigrade;
  const knee = add(thighAt, [0.004, -leg * 0.38, 0.05]);
  const ankle = add(knee, [0, -leg * 0.34, -0.065 * mix(0.4, 1, d)]);
  return {
    hips, spine, chest, neck, head,
    clavL: [0.02, shoulderY - 0.01, back * 0.28],
    upperArmL: shoulder, foreArmL: elbow, handL: wrist, fingersL: add(wrist, [0, -Math.max(0.02, wrist[1] - 0.03) * 0.6, hand * 0.3]),
    thighL: thighAt, shinL: knee, ankleL: ankle,
    footL: [ankle[0], 0.035, ankle[2] + 0.02 * mix(1.8, 1, d)],
    toesL: [ankle[0], 0.016, ankle[2] + 0.075],
  };
}

const mirrorVec = (v: Vec3): Vec3 => [-v[0], v[1], v[2]];

export function buildAnatomy(tune: BodyTune): Anatomy {
  const biped = uprightFrame(tune), quad = fourLegFrame(tune);
  const q = Math.max(0, Math.min(1, tune.quadruped));
  const joints = {} as Record<JointName, Vec3>;
  for (const key of Object.keys(biped) as JointName[]) joints[key] = lerp(biped[key]!, quad[key]!, q);

  const headR = 0.062 * tune.head;
  const headFwd: Vec3 = q > 0.5 ? [0, -0.25, 1] : [0, -tune.hunch * 0.18, 1];
  const fwdLen = Math.hypot(...headFwd);
  const fwd: Vec3 = [headFwd[0] / fwdLen, headFwd[1] / fwdLen, headFwd[2] / fwdLen];
  const snout = mix(0.004, 0.105, tune.muzzle) * tune.head;
  joints.jaw = add(joints.head, [0, -headR * 0.42, headR * 0.15]);
  joints.muzzle = add(joints.head, [fwd[0] * headR * 0.65, fwd[1] * headR * 0.65 - headR * 0.25, fwd[2] * headR * 0.65]);
  const earY = mix(0.25, 0.85, tune.ears), earX = mix(1, 0.62, tune.ears);
  joints.earL = add(joints.head, [headR * earX, headR * earY, -headR * 0.15]);
  const tailBase = add(joints.hips, q > 0.5 ? [0, 0.02, -0.04] : [0, -0.02, -0.055]);
  const tailLen = 0.32 * tune.tail;
  joints.tail1 = tailBase;
  joints.tail2 = add(tailBase, [0, q > 0.5 ? -tailLen * 0.2 : -tailLen * 0.3, -tailLen * 0.33]);
  joints.tail3 = add(joints.tail2, [0, -tailLen * 0.22, -tailLen * 0.3]);
  joints.tailTip = add(joints.tail3, [0, -tailLen * 0.12, -tailLen * 0.3]);
  for (const key of JOINTS) {
    if (!key.endsWith('L')) continue;
    joints[key.slice(0, -1) + 'R' as JointName] = mirrorVec(joints[key]);
  }

  // ---- Fit to the domain: the whole body, feet on a floor, spanning most of the clay ------------
  const m = (j: JointName) => joints[j];
  const points = Object.values(joints);
  const extra = headR + snout;
  let top = -Infinity, front = -Infinity, backEnd = Infinity, wide = 0;
  for (const p of points) {
    top = Math.max(top, p[1]);
    front = Math.max(front, p[2]);
    backEnd = Math.min(backEnd, p[2]);
    wide = Math.max(wide, Math.abs(p[0]));
  }
  top += headR * mix(1, 1.4, tune.ears) + 0.02;
  const scale = 1.84 / Math.max(top, front - backEnd + extra * 2, (wide + 0.06) * 2);
  const zShift = -(front + extra + backEnd) / 2 * (q > 0.5 ? 1 : 0.5);
  const floor = -0.92;
  const world = (p: Vec3): Vec3 => [p[0] * scale, p[1] * scale + floor, (p[2] + zShift) * scale];
  for (const key of JOINTS) joints[key] = world(joints[key]);
  const S = scale, B = 0.75 + tune.mass * 0.65, D = tune.definition, C = Math.sqrt(B);
  const R = (r: number) => r * S;

  // ---- Bones ------------------------------------------------------------------------------------
  const tips: Partial<Record<JointName, Vec3>> = {
    hips: m('spine'), spine: m('chest'), chest: m('neck'), neck: m('head'),
    head: add(m('head'), [0, R(headR), 0]), jaw: add(m('jaw'), [0, R(-headR * 0.2), R(headR * 0.6 + snout * 0.8)]),
    muzzle: add(m('muzzle'), [fwd[0] * R(snout + headR * 0.3), fwd[1] * R(snout + headR * 0.3), fwd[2] * R(snout + headR * 0.3)]),
  };
  const bone = (name: JointName, tip: Vec3, radius: number, fur: FurRegion): Bone =>
    ({ name, parent: PARENT[name], at: m(name), tip, radius: R(radius) * (name.startsWith('finger') ? 1 : B), fur });
  const bones: Bone[] = [
    bone('hips', tips.hips!, 0.07, 'belly'), bone('spine', tips.spine!, 0.075, 'back'), bone('chest', tips.chest!, 0.09, 'chest'),
    bone('neck', tips.neck!, 0.04, 'ruff'), bone('head', tips.head!, headR, 'crown'), bone('jaw', tips.jaw!, headR * 0.45, 'muzzle'),
    bone('muzzle', tips.muzzle!, Math.max(headR * 0.42, 0.012), 'muzzle'),
  ];
  for (const s of ['L', 'R'] as Side[]) {
    const n = (base: string) => `${base}${s}` as JointName;
    bones.push(
      bone(n('ear'), add(m(n('ear')), [(s === 'L' ? 1 : -1) * R(headR * mix(0.1, 0.25, tune.ears)), R(headR * mix(0.28, 1.25, tune.ears)), 0]), 0.012, 'muzzle'),
      bone(n('clav'), m(n('upperArm')), 0.035, 'ruff'),
      bone(n('upperArm'), m(n('foreArm')), 0.036, 'arm'),
      bone(n('foreArm'), m(n('hand')), 0.028, 'forearm'),
      bone(n('hand'), m(n('fingers')), 0.024 * tune.handSize, 'hand'),
      bone(n('fingers'), add(m(n('fingers')), scaleVec(sub(m(n('fingers')), m(n('hand'))), 1.1)), 0.012 * tune.handSize, 'hand'),
      bone(n('thigh'), m(n('shin')), 0.052, 'thigh'),
      bone(n('shin'), m(n('ankle')), 0.036, 'shin'),
      bone(n('ankle'), m(n('foot')), 0.024, 'foot'),
      bone(n('foot'), m(n('toes')), 0.024, 'foot'),
      bone(n('toes'), add(m(n('toes')), [0, 0, R(0.025)]), 0.014, 'foot'),
    );
  }
  bones.push(
    bone('tail1', m('tail2'), 0.018, 'tail'), bone('tail2', m('tail3'), 0.014, 'tail'),
    bone('tail3', m('tailTip'), 0.01, 'tail'), bone('tailTip', add(m('tailTip'), scaleVec(sub(m('tailTip'), m('tail3')), 0.5)), 0.006, 'tail'),
  );
  // Skin weights index this list and skeletons are built from JOINTS, so the two must share one order.
  bones.sort((a, b) => JOINTS.indexOf(a.name) - JOINTS.indexOf(b.name));
  const byName = Object.fromEntries(bones.map((b) => [b.name, b])) as Record<JointName, Bone>;

  // ---- Muscle: each belly is both clay and a live part of the rig -------------------------------
  const muscles: Muscle[] = [];
  const parts: ClayPart[] = [];
  const belly = (id: string, label: string, side: Side | null, fromJ: JointName, fromOff: Vec3, toJ: JointName, toOff: Vec3, radius: number, at = 0.45) => {
    const flip = (v: Vec3): Vec3 => (side === 'R' ? [-v[0], v[1], v[2]] : v);
    muscles.push({
      id: side ? `${id}${side}` : id, label, side,
      from: { joint: fromJ, offset: flip([v3(fromOff, S)][0]) },
      to: { joint: toJ, offset: flip([v3(toOff, S)][0]) },
      radius: R(radius) * mix(0.8, 1.05, D) * C, belly: at,
    });
  };
  const limb = (base: string, s: Side) => `${base}${s}` as JointName;
  const trunkDepth = q > 0.5 ? 0 : 1;
  belly('core', 'Abdominals', null, 'hips', [0, 0.04, 0.02 * trunkDepth], 'chest', [0, -0.04, 0.026 * trunkDepth], 0.036 * (1 + 0.3 * q), 0.5);
  belly('neckBack', 'Neck extensors', null, 'chest', [0, 0.02, -0.02], 'head', [0, -0.01, -0.03], 0.026 * mix(1, 1.8, tune.hunch * tune.mass));
  belly('jawClose', 'Masseter', null, 'head', [0, -0.012, 0.012], 'jaw', [0, -0.005, 0.015], 0.024 * tune.head, 0.5);
  for (const s of ['L', 'R'] as Side[]) {
    belly('pec', 'Chest', s, 'chest', [0.022, 0.025, 0.05 * trunkDepth], limb('upperArm', s), [0.004, -0.008, 0.016], 0.04);
    belly('lat', 'Back wing', s, 'spine', [0.03, 0, -0.03], limb('upperArm', s), [0, -0.02, -0.012], 0.04);
    belly('trap', 'Trapezius', s, 'chest', [0.012, 0.04, -0.03], 'neck', [0.012, 0.03, -0.012], 0.032 * mix(1, 1.6, tune.mass));
    belly('delt', 'Shoulder', s, limb('clav', s), [0.03, 0.012, 0], limb('upperArm', s), [0.012, -0.055, 0], 0.036 * tune.shoulders, 0.42);
    belly('biceps', 'Biceps', s, limb('upperArm', s), [0, -0.01, 0.012], limb('foreArm', s), [0, 0.012, 0.012], 0.03);
    belly('triceps', 'Triceps', s, limb('upperArm', s), [0.004, -0.012, -0.016], limb('foreArm', s), [0, 0.012, -0.018], 0.03);
    belly('forearm', 'Forearm', s, limb('foreArm', s), [0.006, -0.006, 0.006], limb('hand', s), [0, 0.012, 0], 0.028, 0.32);
    belly('glute', 'Glute', s, 'hips', [0.022, 0.012, -0.03], limb('thigh', s), [0.012, -0.05, -0.022], 0.052);
    belly('quad', 'Quadriceps', s, limb('thigh', s), [0, -0.012, 0.016], limb('shin', s), [0, 0.014, 0.016], 0.046);
    belly('hamstring', 'Hamstring', s, limb('thigh', s), [0, -0.016, -0.02], limb('shin', s), [0, 0.018, -0.018], 0.04);
    belly('calf', 'Calf', s, limb('shin', s), [0, -0.012, -0.014], limb('ankle', s), [0, 0.018, -0.006], 0.032 + tune.digitigrade * 0.006, 0.3);
  }

  // ---- Clay ----------------------------------------------------------------------------------
  const cone = (a: Vec3, ra: number, b: Vec3, rb: number, blend = 0.02) => parts.push({ op: 'add', a, ra: R(ra), b, rb: R(rb), blend: R(blend) });
  const ball = (a: Vec3, ra: number, blend = 0.02) => parts.push({ op: 'add', a, ra: R(ra), blend: R(blend) });
  const carve = (a: Vec3, ra: number, b: Vec3 | undefined, rb: number | undefined, blend = 0.012) => parts.push({ op: 'carve', a, ra: R(ra), b, rb: rb === undefined ? undefined : R(rb), blend: R(blend) });

  // Skeleton core: gives the body a floor under the muscle, so it reads even when a build is lean.
  // A torso is wider than it is deep, and a round cone can't be: left and right halves make the section.
  const rib = (j: JointName, side: number, half: number, r: number): [Vec3, number] => [add(m(j), [side * half * S, 0, 0]), r * C];
  for (const side of [1, -1]) {
    const hip = rib('hips', side, 0.028 * tune.hips, 0.052 * tune.hips);
    const waist = rib('spine', side, 0.022, 0.046);
    const ribs = rib('chest', side, 0.038 * tune.shoulders, mix(0.058, 0.066, q) * Math.sqrt(tune.shoulders));
    const top = rib('neck', side, 0.012, 0.038);
    cone(hip[0], hip[1], waist[0], waist[1], 0.03);
    cone(waist[0], waist[1], ribs[0], ribs[1], 0.03);
    cone(ribs[0], ribs[1], top[0], top[1], 0.03);
  }
  cone(m('neck'), 0.03 * C * mix(1, 1.3, tune.hunch), m('head'), headR * 0.62, 0.02);

  for (const s of ['L', 'R'] as Side[]) {
    const n = (base: string) => `${base}${s}` as JointName;
    cone(m('chest'), 0.03 * C, m(n('upperArm')), 0.028 * C, 0.025);
    cone(m(n('upperArm')), 0.02 * C, m(n('foreArm')), 0.016 * C, 0.008);
    cone(m(n('foreArm')), 0.017 * C, m(n('hand')), 0.012 * C, 0.008);
    cone(m(n('thigh')), 0.034 * C, m(n('shin')), 0.019 * C, 0.012);
    cone(m(n('shin')), 0.024 * C, m(n('ankle')), 0.016 * C, 0.008);
    cone(m(n('ankle')), 0.016 * C, m(n('foot')), 0.016 * C, 0.006);
    cone(m(n('foot')), 0.018 * C, m(n('toes')), 0.012 * C, 0.008);
    cone(m('hips'), 0.042 * tune.hips * C, m(n('thigh')), 0.036 * C, 0.025);
    // Knobs that make joints read as joints.
    if (D > 0.25) { ball(m(n('foreArm')), 0.016 * C, 0.008); ball(m(n('shin')), 0.021 * C, 0.008); }

    // Hand: palm plus four fingers, spread and curled a little, each with a claw when the plan has them.
    const wrist = m(n('hand')), knuckles = m(n('fingers'));
    const sgn = s === 'L' ? 1 : -1;
    const hs = tune.handSize;
    cone(wrist, 0.013 * C * Math.sqrt(hs), knuckles, 0.019 * Math.sqrt(hs), 0.008);
    const handDir = norm(sub(knuckles, wrist));
    const across: Vec3 = norm(cross(handDir, [0, 0, 1]));
    for (let f = 0; f < 4; f++) {
      const spread = (f - 1.5) * 0.012 * hs * S;
      const baseAt: Vec3 = add(knuckles, scaleVec(across, spread * sgn));
      const len = (f === 0 || f === 3 ? 0.035 : 0.043) * hs * S;
      const mid = add(baseAt, add(scaleVec(handDir, len * 0.55), [0, 0, 0.004 * S]));
      const endAt = add(mid, add(scaleVec(handDir, len * 0.45), [0, 0, 0.008 * S]));
      cone(baseAt, 0.0085 * hs, mid, 0.007 * hs, 0.004);
      cone(mid, 0.007 * hs, endAt, 0.0055 * hs, 0.003);
      if (tune.claws > 0.02) {
        const clawEnd = add(endAt, add(scaleVec(handDir, 0.028 * tune.claws * hs * S), [0, 0, 0.012 * tune.claws * S]));
        cone(endAt, 0.005 * hs, clawEnd, 0.0012, 0.001);
      }
    }
    // Thumb, across from the fingers.
    const thumbAt = add(lerp(wrist, knuckles, 0.35), scaleVec(across, -0.012 * hs * S * sgn));
    const thumbEnd = add(thumbAt, add(scaleVec(handDir, 0.03 * hs * S), add(scaleVec(across, -0.018 * hs * S * sgn), [0, 0, 0.012 * S])));
    cone(thumbAt, 0.012 * hs, thumbEnd, 0.0065 * hs, 0.012);

    // Foot: toes across the ball of the foot, with claws when the plan has them.
    const ballAt = m(n('foot')), toeAt = m(n('toes'));
    for (let f = 0; f < 3; f++) {
      const off = (f - 1) * 0.015 * S;
      const a: Vec3 = [ballAt[0] + off * sgn, ballAt[1], ballAt[2]];
      const b: Vec3 = [toeAt[0] + off * 1.25 * sgn, toeAt[1], toeAt[2] + (f === 1 ? 0.006 * S : 0)];
      cone(a, 0.014 * B, b, 0.0095, 0.008);
      if (tune.claws > 0.02) cone(b, 0.0065, add(b, [0, -0.003 * S, 0.022 * tune.claws * S]), 0.0012, 0.001);
    }
  }

  // Muscles, as two tapered cones meeting at the belly, softer on a soft build and crisper on a defined one.
  const blendMuscle = mix(0.018, 0.004, D);
  for (const mu of muscles) {
    const a = add(m(mu.from.joint), mu.from.offset), b = add(m(mu.to.joint), mu.to.offset);
    const mid = lerp(a, b, mu.belly);
    const r = mu.radius / S;
    cone(a, r * 0.3, mid, r, blendMuscle);
    cone(mid, r, b, r * 0.26, blendMuscle);
  }

  buildHead();
  function buildHead() {
    const h = m('head');
    const r = headR;
    // Cranium; a beast's flatter top comes from setting the mass further back.
    const craniumAt = add(h, [0, r * 0.1 * (1 - tune.muzzle * 0.4) * S, -r * 0.08 * S]);
    parts.push({ op: 'add', a: craniumAt, ra: R(r), blend: R(0.02) });
    const face = add(h, [0, -r * 0.35 * S, r * 0.32 * S]);
    cone(craniumAt, r * 0.82, face, r * 0.62, 0.025);
    const brow = add(h, [0, r * 0.22 * S, r * 0.72 * S]);
    const browW = r * 0.5 * S;
    // The brow drops toward the nose, more on a predator, which is most of what makes a face read as fierce.
    const scowl = r * 0.14 * tune.muzzle * S;
    cone([brow[0], brow[1] - scowl, brow[2] + r * 0.05 * S], r * 0.17, [brow[0] + browW, brow[1] + scowl, brow[2] - r * 0.1 * S], r * 0.15, 0.016);
    cone([brow[0], brow[1] - scowl, brow[2] + r * 0.05 * S], r * 0.17, [brow[0] - browW, brow[1] + scowl, brow[2] - r * 0.1 * S], r * 0.15, 0.016);

    // A predator's skull is a wedge: wide flat cheeks behind the eyes, narrowing hard to the snout.
    if (tune.muzzle > 0.3) {
      const wedge = (tune.muzzle - 0.3) / 0.7;
      for (const sgn of [1, -1]) {
        const cheek = add(h, [sgn * r * 0.72 * S, -r * 0.22 * S, -r * 0.05 * S]);
        const cheekFront = add(h, [sgn * r * 0.34 * S, -r * 0.38 * S, r * 0.55 * S]);
        cone(cheek, r * 0.42 * wedge, cheekFront, r * 0.26, 0.02);
      }
      const top = add(h, [0, r * 0.62 * S, -r * 0.1 * S]);
      cone(top, r * 0.5 * wedge, add(h, [0, r * 0.18 * S, r * 0.72 * S]), r * 0.26, 0.022);
    }

    // Snout: a tapered bridge over a jaw, or almost nothing on a person.
    const nose = add(m('muzzle'), scaleVec(fwd, (snout + r * 0.22) * S));
    const snoutRoot = add(h, [0, -r * 0.1 * S, r * 0.7 * S]);
    cone(snoutRoot, r * mix(0.17, 0.5, tune.muzzle), nose, r * mix(0.13, 0.28, tune.muzzle), 0.012);
    ball(add(nose, [0, r * 0.08 * S, r * 0.02 * S]), r * mix(0.12, 0.15, tune.muzzle), 0.004);
    const jawAt = m('jaw');
    const chin = add(jawAt, [0, -r * 0.18 * S, (r * 0.55 + snout * 0.82) * S]);
    cone(jawAt, r * 0.55, chin, r * mix(0.2, 0.3, tune.muzzle), 0.014);
    // Mouth line: open a little on a beast, so the snarl reads before anyone animates it.
    if (tune.muzzle > 0.2) {
      const mouthBack = add(jawAt, [0, r * 0.12 * S, r * 0.25 * S]);
      const mouthFront = add(nose, [0, -r * 0.3 * S, r * 0.05 * S]);
      carve(mouthBack, r * 0.06, mouthFront, r * 0.1, 0.006);
      for (let i = 0; i < 2; i++) for (const sgn of [1, -1]) {
        const toothAt = add(mouthFront, [sgn * r * (0.15 + i * 0.11) * S, r * 0.16 * S, -r * (0.12 + i * 0.35) * S]);
        cone(toothAt, r * 0.05, add(toothAt, [0, -r * 0.22 * S, 0]), 0.0008, 0.001);
      }
    } else {
      const lip = add(h, [0, -r * 0.62 * S, r * 0.76 * S]);
      carve([lip[0] - r * 0.25 * S, lip[1], lip[2] + r * 0.05 * S], r * 0.018, [lip[0] + r * 0.25 * S, lip[1], lip[2] + r * 0.05 * S], r * 0.018, 0.01);
    }

    for (const sgn of [1, -1]) {
      const eye = add(h, [sgn * r * 0.36 * S, r * 0.08 * S, r * 0.82 * S]);
      carve(eye, r * 0.15, undefined, undefined, 0.012);
      ball(add(eye, [0, 0, -r * 0.1 * S]), r * 0.075, 0.003);
      const earRoot = sgn > 0 ? m('earL') : m('earR');
      const earTip = (sgn > 0 ? byName.earL : byName.earR).tip;
      cone(earRoot, r * mix(0.18, 0.26, tune.ears), earTip, r * mix(0.12, 0.03, tune.ears), 0.012);
    }
  }

  if (tune.tail > 0.02) {
    const w = 0.018 * mix(0.6, 1.3, tune.tail);
    cone(m('tail1'), w, m('tail2'), w * 0.85, 0.018);
    cone(m('tail2'), w * 0.85, m('tail3'), w * 0.6, 0.006);
    cone(m('tail3'), w * 0.6, m('tailTip'), w * 0.25, 0.004);
  }

  return { tune, bones, byName, muscles, parts, floor, scale };
}

function v3(v: Vec3, s: number): Vec3 { return [v[0] * s, v[1] * s, v[2] * s]; }
function scaleVec(v: Vec3, s: number): Vec3 { return [v[0] * s, v[1] * s, v[2] * s]; }
function norm(v: Vec3): Vec3 { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
function cross(a: Vec3, b: Vec3): Vec3 { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
