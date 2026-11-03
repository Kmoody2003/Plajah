/**
 * motion.ts — how a creature moves, computed from what it is.
 *
 * Nothing here is keyframed by hand. A gait is a few numbers from the codex driving the body and foot targets,
 * and inverse kinematics finds the limbs, so a walk fits any proportions the sculptor gives it. The same
 * evaluation runs live for reactions and at 30 fps for a baked clip.
 */

import { Quaternion, Vector3 } from 'three';
import { Anatomy, JOINTS, JointName, Side, parentOf } from './anatomy';
import type { MotionStyle } from './codex';

export type ClipName = 'idle' | 'walk' | 'run' | 'signature';

export interface PoseInput {
  clip: ClipName;
  /** Seconds. */
  t: number;
  /** World point the head should look at, or null. */
  look?: Vector3 | null;
  /** How much to look, 0-1. */
  lookAmount?: number;
  /** Extra muscle tone from what's happening around it. */
  arousal?: number;
  /** A recoil: pushes the chest and head away, in world units. */
  recoil?: Vector3 | null;
}

export interface PoseOutput {
  /** Local rotation of each joint against rest, in JOINTS order, xyzw. */
  rotations: Float32Array;
  /** Root translation against rest. */
  hipsOffset: Vector3;
  /** World position of each joint, for muscle lengths and hit tests. */
  world: Record<JointName, Vector3>;
  worldRot: Record<JointName, Quaternion>;
  /** Activation per muscle in anatomy order, 0-1.2. */
  muscles: Float32Array;
  /** Speed of the body through the air, for fur. */
  drag: Vector3;
}

const X = new Vector3(1, 0, 0), Y = new Vector3(0, 1, 0), Z = new Vector3(0, 0, 1);
const smooth = (v: number) => { const t = Math.max(0, Math.min(1, v)); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;

export class CreatureMotion {
  readonly rest: Record<JointName, Vector3>;
  readonly offsets: Record<JointName, Vector3>;
  readonly lengths: Partial<Record<JointName, number>> = {};
  private readonly restLength: number[];
  private readonly legLength: number;
  readonly fourLegs: boolean;
  private lastHips = new Vector3();
  private lastT = -1;

  constructor(readonly anatomy: Anatomy, public style: MotionStyle) {
    this.rest = {} as Record<JointName, Vector3>;
    this.offsets = {} as Record<JointName, Vector3>;
    for (const name of JOINTS) this.rest[name] = new Vector3(...anatomy.byName[name].at);
    for (const name of JOINTS) {
      const parent = parentOf(name);
      this.offsets[name] = parent ? this.rest[name].clone().sub(this.rest[parent]) : this.rest[name].clone();
    }
    this.fourLegs = anatomy.tune.quadruped > 0.5;
    this.legLength = this.rest.thighL.y - anatomy.floor;
    const frozen = this.emptyPose();
    this.restLength = anatomy.muscles.map((m) => this.muscleLength(m, frozen.world, frozen.worldRot));
  }

  private emptyPose() {
    const world = {} as Record<JointName, Vector3>, worldRot = {} as Record<JointName, Quaternion>;
    for (const name of JOINTS) { world[name] = this.rest[name].clone(); worldRot[name] = new Quaternion(); }
    return { world, worldRot };
  }

  private muscleLength(m: Anatomy['muscles'][number], world: Record<JointName, Vector3>, rot: Record<JointName, Quaternion>) {
    const a = new Vector3(...m.from.offset).applyQuaternion(rot[m.from.joint]).add(world[m.from.joint]);
    const b = new Vector3(...m.to.offset).applyQuaternion(rot[m.to.joint]).add(world[m.to.joint]);
    return a.distanceTo(b);
  }

  /** Finds a joint from its parent's pose, keeping the bone length exact. */
  private place(pose: ReturnType<CreatureMotion['emptyPose']>, name: JointName) {
    const parent = parentOf(name);
    if (!parent) return;
    pose.world[name].copy(this.offsets[name]).applyQuaternion(pose.worldRot[parent]).add(pose.world[parent]);
  }

  /** Two bones reaching for a target. `bend` picks which side the middle joint goes. */
  private reach(pose: ReturnType<CreatureMotion['emptyPose']>, upper: JointName, lower: JointName, end: JointName, target: Vector3, bend: Vector3) {
    this.place(pose, upper);
    const root = pose.world[upper];
    const a = this.offsets[lower].length(), b = this.offsets[end].length();
    const toTarget = target.clone().sub(root);
    const dist = Math.max(Math.abs(a - b) + 1e-4, Math.min(a + b - 1e-4, toTarget.length()));
    const dir = toTarget.normalize();
    const along = (a * a - b * b + dist * dist) / (2 * dist);
    const height = Math.sqrt(Math.max(0, a * a - along * along));
    const side = bend.clone().addScaledVector(dir, -bend.dot(dir));
    if (side.lengthSq() < 1e-8) side.set(0, 0, 1).addScaledVector(dir, -dir.z);
    side.normalize();
    const mid = root.clone().addScaledVector(dir, along).addScaledVector(side, height);
    pose.worldRot[upper].setFromUnitVectors(this.offsets[lower].clone().normalize(), mid.clone().sub(root).normalize());
    pose.world[lower].copy(mid);
    const endAt = root.clone().addScaledVector(dir, dist);
    pose.worldRot[lower].setFromUnitVectors(this.offsets[end].clone().normalize(), endAt.clone().sub(mid).normalize());
    pose.world[end].copy(endAt);
  }

  evaluate(input: PoseInput): PoseOutput {
    const { clip, t, arousal = 0 } = input;
    const s = this.style;
    const pose = this.emptyPose();
    const running = clip === 'run';
    const moving = clip === 'walk' || running;
    const cadence = s.cadence * (running ? 1.75 : 1);
    const phase = moving ? t * cadence * 0.5 : 0;
    const stride = this.legLength * s.stride * (running ? 1.25 : 0.62);

    // All-fours is a body choice: an upright creature tips over and its arms become forelegs.
    const allFours = this.fourLegs ? 1 : running && s.runsOnAllFours ? 1 : 0;
    const tips = allFours && !this.fourLegs ? 1 : 0;

    // ---- Trunk ------------------------------------------------------------------------------------
    const breath = Math.sin(t * (1.2 + s.tension * 1.4)) * (1 + arousal);
    const beat = phase * TAU * 2;
    const bounce = moving ? Math.abs(Math.sin(phase * TAU)) * this.legLength * s.bounce * 6 - this.legLength * s.bounce * 3 : breath * 0.002;
    const weight = moving ? Math.sin(phase * TAU) * s.sway : Math.sin(t * 0.6) * s.sway * 0.25;
    const hipsAt = this.rest.hips.clone().add(new Vector3(weight * 0.5, bounce, 0));
    // A shambler's body is thrown onto its bad side and caught late.
    if (s.gait === 'shamble' && moving) hipsAt.y -= Math.max(0, Math.sin(phase * TAU)) * 0.03;
    // A glide hides its steps.
    if (s.gait === 'glide') hipsAt.y = this.rest.hips.y + breath * 0.001;

    let trunkPitch = moving ? s.lean * (running ? 1.8 : 1) : 0;
    let headPitch = moving ? -s.lean * 0.7 : 0;
    let crouch = moving ? (running ? 0.12 : 0.03) * this.legLength * (1 + s.tension * 0.4) : arousal * 0.04;
    let armLift = 0, jawOpen = moving ? 0 : 0.03 + arousal * 0.15, spread = 0;

    if (clip === 'signature') {
      const cycle = 4.5;
      const u = (t % cycle) / cycle;
      const on = smooth(u / 0.25) * (1 - smooth((u - 0.72) / 0.28));
      switch (s.signature) {
        case 'howl': trunkPitch = -0.28 * on; headPitch = -0.95 * on; jawOpen = 0.65 * on; armLift = 0.1 * on; spread = 0.5 * on; crouch = -0.01 * on; break;
        case 'lunge': { const hit = smooth((u - 0.2) / 0.08) * (1 - smooth((u - 0.45) / 0.3)); trunkPitch = 0.6 * hit - 0.2 * (1 - hit) * on; headPitch = -0.45 * hit; jawOpen = 0.55 * hit; armLift = 1.05 * hit; crouch = 0.13 * this.legLength * on; break; }
        case 'lurch': trunkPitch = 0.28 + 0.3 * Math.sin(u * TAU * 2) * on; headPitch = 0.2 - 0.5 * on; jawOpen = 0.5 * on; armLift = 0.7 * on; crouch = 0.05 * this.legLength * on; break;
        case 'hiss': trunkPitch = 0.08 * on; headPitch = -0.2 * on; jawOpen = 0.5 * on; armLift = 0.55 * on; spread = 0.3 * on; break;
        case 'roar': trunkPitch = 0.3 * on; headPitch = -0.55 * on; jawOpen = 0.75 * on; armLift = 0.25 * on; spread = 0.75 * on; crouch = 0.05 * this.legLength * on; break;
        case 'rear': trunkPitch = -0.95 * on; headPitch = 0.5 * on; jawOpen = 0.5 * on; armLift = 0.5 * on; break;
        case 'bow': trunkPitch = 0.65 * on; headPitch = 0.25 * on; break;
      }
    }
    hipsAt.y -= crouch;

    const q = new Quaternion();
    // Tipping forward happens mostly up the spine: a pelvis turned all the way would tear the skin at the groin.
    const trunkTip = tips ? 1.62 : 0;
    const raise = (name: JointName, pitch: number, yaw = 0, roll = 0) => {
      const parent = parentOf(name);
      const base = parent ? pose.worldRot[parent].clone() : new Quaternion();
      q.setFromAxisAngle(X, pitch);
      base.multiply(q);
      if (yaw) base.multiply(q.setFromAxisAngle(Y, yaw));
      if (roll) base.multiply(q.setFromAxisAngle(Z, roll));
      pose.worldRot[name].copy(base);
    };

    pose.world.hips.copy(hipsAt);
    if (tips) pose.world.hips.y -= this.legLength * 0.1;
    const twist = moving ? Math.sin(phase * TAU) * (running ? 0.12 : 0.07) : 0;
    raise('hips', trunkPitch * 0.25 + trunkTip * 0.5, -twist, weight * 0.6);
    this.place(pose, 'spine');
    raise('spine', trunkPitch * 0.4 + trunkTip * 0.3 + (moving && allFours ? Math.sin(beat) * 0.08 : 0) + breath * 0.004, twist * 0.5);
    this.place(pose, 'chest');
    raise('chest', trunkPitch * 0.35 + trunkTip * 0.2 + breath * 0.006, twist * 0.5, -weight * 0.4);
    this.place(pose, 'neck');

    // ---- Head: looks where told, against the tip of the trunk ---------------------------------------
    const headFixup = tips ? -1.75 : 0;
    let lookYaw = 0, lookPitch = 0;
    if (input.look && (input.lookAmount ?? 0) > 0.001) {
      const toLook = input.look.clone().sub(pose.world.neck);
      lookYaw = Math.max(-1, Math.min(1, Math.atan2(toLook.x, toLook.z))) * input.lookAmount!;
      lookPitch = Math.max(-0.7, Math.min(0.7, -Math.atan2(toLook.y, Math.hypot(toLook.x, toLook.z)))) * input.lookAmount!;
    }
    raise('neck', headPitch * 0.45 + headFixup * 0.5 + lookPitch * 0.4, lookYaw * 0.45);
    this.place(pose, 'head');
    const bob = moving ? Math.sin(beat) * 0.03 : 0;
    raise('head', headPitch * 0.55 + headFixup * 0.5 + lookPitch * 0.6 + bob, lookYaw * 0.55, Math.sin(t * 0.4) * 0.01);
    if (input.recoil) { pose.world.chest.addScaledVector(input.recoil, 0.4); pose.world.neck.addScaledVector(input.recoil, 0.7); }
    this.place(pose, 'head');
    if (input.recoil) pose.world.head.addScaledVector(input.recoil, 0.25);
    this.place(pose, 'jaw');
    raise('jaw', jawOpen);
    this.place(pose, 'muzzle');
    pose.worldRot.muzzle.copy(pose.worldRot.head);
    for (const ear of ['earL', 'earR'] as const) {
      this.place(pose, ear);
      const flick = Math.max(0, Math.sin(t * 0.9 + (ear === 'earL' ? 0 : 1.7)) - 0.97) * 12 * s.tension;
      raise(ear, -arousal * 0.5 - flick, 0, (ear === 'earL' ? -1 : 1) * flick * 0.4);
    }

    // ---- Legs -----------------------------------------------------------------------------------
    const floor = this.anatomy.floor;
    for (const side of ['L', 'R'] as Side[]) {
      const n = (b: string) => `${b}${side}` as JointName;
      const sgn = side === 'L' ? 1 : -1;
      const foot = this.rest[n('foot')].clone();
      let pitch = 0;
      if (moving) {
        const p = (phase + (side === 'R' ? 0.5 : 0)) % 1;
        const stance = p < 0.6;
        const k = stance ? p / 0.6 : (p - 0.6) / 0.4;
        foot.z += stance ? stride * 0.5 * (1 - 2 * k) : stride * 0.5 * (2 * smooth(k) - 1);
        let lift = stance ? 0 : Math.sin(k * Math.PI) * this.legLength * (running ? 0.22 : 0.09);
        // One side drags on a failing body.
        if (s.gait === 'shamble' && side === 'R') { lift *= 0.2; foot.z *= 0.45; }
        foot.y += lift;
        pitch = stance ? 0 : -Math.sin(k * Math.PI) * 0.75;
      }
      if (tips) foot.z -= this.legLength * 0.2;
      foot.y = Math.max(foot.y, floor + 0.015);
      this.place(pose, n('thigh'));
      const ankleRest = this.offsets[n('foot')].clone().negate();
      q.setFromAxisAngle(X, pitch);
      const ankle = foot.clone().add(ankleRest.applyQuaternion(q));
      // Knees go forward, ankle hocks back; a four-legged hind leg is the same bend.
      this.reach(pose, n('thigh'), n('shin'), n('ankle'), ankle, new Vector3(sgn * 0.02, 0, 1));
      const anklePose = pose.world[n('ankle')];
      pose.worldRot[n('ankle')].setFromUnitVectors(this.offsets[n('foot')].clone().normalize(), foot.clone().sub(anklePose).normalize());
      this.place(pose, n('foot'));
      pose.worldRot[n('foot')].setFromAxisAngle(X, pitch);
      this.place(pose, n('toes'));
      pose.worldRot[n('toes')].setFromAxisAngle(X, pitch * 0.4);
    }

    // ---- Arms ------------------------------------------------------------------------------------
    for (const side of ['L', 'R'] as Side[]) {
      const n = (b: string) => `${b}${side}` as JointName;
      const sgn = side === 'L' ? 1 : -1;
      this.place(pose, n('clav'));
      pose.worldRot[n('clav')].copy(pose.worldRot.chest);
      this.place(pose, n('upperArm'));
      const shoulder = pose.world[n('upperArm')];
      const restReach = this.rest[n('hand')].clone().sub(this.rest[n('upperArm')]);
      let hand: Vector3;
      if (allFours) {
        // A foreleg: planted under the shoulder, stepping opposite its hind leg.
        const p = (phase + (side === 'L' ? 0.5 : 0) + 0.08) % 1;
        const stance = !moving || p < 0.6;
        const k = moving ? (stance ? p / 0.6 : (p - 0.6) / 0.4) : 0;
        const z = moving ? (stance ? stride * 0.5 * (1 - 2 * k) : stride * 0.5 * (2 * smooth(k) - 1)) : 0;
        hand = new Vector3(shoulder.x * 0.95, floor + 0.035 + (stance ? 0 : Math.sin(k * Math.PI) * this.legLength * 0.16), shoulder.z + z);
      } else {
        const swing = moving ? Math.sin((phase + (side === 'L' ? 0.5 : 0)) * TAU) * s.armSwing * (running ? 0.42 : 0.26) : Math.sin(t * 0.9 + sgn) * 0.015;
        const twitch = s.tension * arousal * 0.1;
        const rotateBy = new Quaternion().setFromAxisAngle(X, -swing - armLift * 1.6 - twitch);
        const out = new Quaternion().setFromAxisAngle(Z, sgn * spread);
        hand = restReach.clone().applyQuaternion(out).applyQuaternion(rotateBy).applyQuaternion(pose.worldRot.chest).add(shoulder);
      }
      this.reach(pose, n('upperArm'), n('foreArm'), n('hand'), hand, new Vector3(sgn * 0.45, -0.15, -1));
      pose.worldRot[n('hand')].copy(pose.worldRot[n('foreArm')]);
      this.place(pose, n('fingers'));
      const curl = 0.25 + arousal * 0.5 + armLift * 0.4;
      pose.worldRot[n('fingers')].copy(pose.worldRot[n('hand')]).multiply(q.setFromAxisAngle(X, curl));
    }

    // ---- Tail: follows the hips late, more when it matters ---------------------------------------
    let prior = pose.worldRot.hips;
    (['tail1', 'tail2', 'tail3', 'tailTip'] as const).forEach((name, i) => {
      this.place(pose, name);
      const wag = Math.sin(t * (moving ? cadence * 2 : 1.1) - i * 0.7) * (moving ? 0.22 : 0.08 + arousal * 0.25);
      const rot = prior.clone().multiply(q.setFromAxisAngle(Y, wag)).multiply(new Quaternion().setFromAxisAngle(X, (tips ? -0.35 : 0) + arousal * 0.14));
      pose.worldRot[name].copy(rot);
      prior = rot;
    });

    // ---- Locals, for the skeleton -----------------------------------------------------------------
    const rotations = new Float32Array(JOINTS.length * 4);
    const inv = new Quaternion();
    JOINTS.forEach((name, i) => {
      const parent = parentOf(name);
      const local = pose.worldRot[name].clone();
      if (parent) local.premultiply(inv.copy(pose.worldRot[parent]).invert());
      rotations.set([local.x, local.y, local.z, local.w], i * 4);
    });

    // ---- Muscles: a shorter muscle is a working one, and working muscle bulges ---------------------
    const muscles = new Float32Array(this.anatomy.muscles.length);
    this.anatomy.muscles.forEach((m, i) => {
      const now = this.muscleLength(m, pose.world, pose.worldRot);
      const shortened = 1 - now / this.restLength[i];
      muscles[i] = Math.max(0, Math.min(1.2, shortened * 4.5 + (0.08 + arousal * 0.5) * (0.5 + s.tension * 0.5)));
    });

    const drag = new Vector3();
    if (this.lastT >= 0 && t > this.lastT) drag.copy(pose.world.hips).sub(this.lastHips).divideScalar(Math.max(t - this.lastT, 1e-3));
    this.lastHips.copy(pose.world.hips);
    this.lastT = t;
    if (moving) drag.z -= stride * cadence * 0.3;

    return { rotations, hipsOffset: pose.world.hips.clone().sub(this.rest.hips), world: pose.world, worldRot: pose.worldRot, muscles, drag };
  }
}

/** Seconds a clip takes to come back round, so baked clips loop clean. */
export function clipLength(clip: ClipName, style: MotionStyle): number {
  if (clip === 'signature') return 4.5;
  if (clip === 'idle') return 6;
  const cadence = style.cadence * (clip === 'run' ? 1.75 : 1);
  return 2 / cadence;
}
