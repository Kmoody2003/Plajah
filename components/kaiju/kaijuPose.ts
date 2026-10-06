// kaijuPose — the joint/expression vector that drives a Kaiju puppet (Lorik / Lumi).
//
// Every number here maps to exactly one transform or opacity in KaijuFigure, so choreography is
// plain arithmetic: moves return a Pose, the director blends Poses, the rig applies the result.
//
// Conventions (canonical = Lorik, standing on the LEFT of the stage):
//   • y is negative = up (character space, feet at 0).
//   • armL / armR are "raise" degrees: 0 = hanging down, 90 = straight out, 170 = overhead,
//     negative = swung across the body (e.g. -110 holds a mic under the chin).
//   • legL / legR are outward swing degrees; liftL / liftR raise the foot (negative = up).
//   • mirrorPose() turns a canonical pose into Lumi's (she stands on the right, so her "outer"
//     arm is R) — moves are written once and both kaiju dance them.

export interface Pose {
  x: number; y: number; rot: number; sx: number; sy: number;
  /** cos of the pirouette angle: 1 = facing front, -1 = mirrored mid-spin. */
  spin: number;
  headRot: number; headX: number; headY: number; headScale: number;
  armL: number; armR: number;
  legL: number; legR: number; liftL: number; liftR: number;
  tail: number;
  /** Frill flare 0..1 (headbangs, drops). */
  mane: number;
  eyeOpen: number; happy: number; closed: number;
  lookX: number; lookY: number;
  mouth: number; mouthW: number; smile: number; blush: number;
  /** Prop visibilities 0..1 — the rig ignores props a character doesn't own. */
  mic: number; book: number; camUp: number; shades: number;
  glow: number;
}

export const REST: Pose = {
  x: 0, y: 0, rot: 0, sx: 1, sy: 1, spin: 1,
  headRot: 0, headX: 0, headY: 0, headScale: 1,
  armL: 10, armR: 10, legL: 0, legR: 0, liftL: 0, liftR: 0,
  tail: 0, mane: 0,
  eyeOpen: 1, happy: 0, closed: 0, lookX: 0, lookY: 0,
  mouth: 0, mouthW: 0.5, smile: -0.4, blush: 0.25,
  mic: 0, book: 0, camUp: 0, shades: 0, glow: 0,
};

const KEYS = Object.keys(REST) as (keyof Pose)[];

export function pose(p: Partial<Pose>): Pose {
  return { ...REST, ...p };
}

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const o = {} as Pose;
  for (const k of KEYS) o[k] = a[k] + (b[k] - a[k]) * t;
  return o;
}

/** Scale a pose's deviation from REST — lets the singer keep "a little of the groove". */
export function damp(p: Pose, amt: number): Pose {
  return lerpPose(REST, p, amt);
}

/** Canonical (Lorik, stage-left) → stage-right partner. */
export function mirrorPose(p: Pose): Pose {
  return {
    ...p,
    x: -p.x, rot: -p.rot, headRot: -p.headRot, headX: -p.headX, lookX: -p.lookX, tail: -p.tail,
    armL: p.armR, armR: p.armL, legL: p.legR, legR: p.legL, liftL: p.liftR, liftR: p.liftL,
  };
}

/** Exponential smoothing toward a target pose, frame-rate independent. */
export function follow(cur: Pose, target: Pose, dt: number, speed = 14): Pose {
  return lerpPose(cur, target, 1 - Math.exp(-speed * dt));
}

// ── tiny math helpers shared by the choreo / stage ──
export const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const TAU = Math.PI * 2;
/** 1 on the beat, decaying through it. */
export const pulse = (ph: number, sharp = 6) => Math.exp(-ph * sharp);
export const sinB = (B: number, period: number, off = 0) => Math.sin((B / period) * TAU + off);
export const ease = (t: number) => t * t * (3 - 2 * t);
