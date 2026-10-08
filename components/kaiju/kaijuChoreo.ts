// kaijuChoreo — the dance book. Four styles × several moves, plus vocal performance overlays.
//
// Every move is a pure function of the beat clock (B = beats as a float, ph = phase in the beat),
// wall time t, and the music features, returning a canonical (Lorik / stage-left) Pose. The stage
// mirrors it for Lumi, blends between moves, and layers the singer's performance on top.

import { type Pose, pose, damp, lerpPose, clamp, pulse, ease, TAU } from './kaijuPose';
import type { KaijuFeatures, KaijuStyle, VocalMode } from './kaijuAudio';
import type { KaijuKind } from './KaijuFigure';

export interface MoveCtx {
  t: number; B: number; ph: number;
  /** 0.55..1 — how hard to dance, from loudness. */
  amp: number;
  kick: number;
  f: KaijuFeatures;
}

export interface Move { name: string; fn: (c: MoveCtx) => Partial<Pose> }

const S = Math.sin, PI = Math.PI;

// ── ZEN: slow, floating, eyes closed, breathing ──────────────────────────────────────────────────
const ZEN: Move[] = [
  { name: 'Lotus Float', fn: ({ t }) => ({
    y: -22 - 9 * S(t * 0.9), rot: 2.5 * S(t * 0.5), sx: 1 - 0.02 * S(t * 1.1), sy: 1 + 0.025 * S(t * 1.1),
    armL: 48 + 8 * S(t * 0.9), armR: 48 + 8 * S(t * 0.9 + 0.4), legL: -28, legR: -28, liftL: -8, liftR: -8,
    closed: 1, smile: 0.7, blush: 0.6, headRot: 4 * S(t * 0.45), tail: 8 * S(t * 0.6), glow: 0.45 + 0.2 * S(t * 0.9),
  }) },
  { name: 'Tai Chi Wave', fn: ({ t }) => { const u = t * 0.7; return {
    armL: 40 + 80 * (0.5 + 0.5 * S(u)), armR: 40 + 80 * (0.5 + 0.5 * S(u + PI)), rot: 5 * S(u), x: 10 * S(u * 0.5),
    legL: 10 + 5 * S(u), legR: 10 - 5 * S(u), headRot: -5 * S(u), closed: 0.85, smile: 0.5,
    y: -3 * (0.5 + 0.5 * S(u * 2)), tail: 10 * S(u), glow: 0.25,
  }; } },
  { name: 'Humming Sway', fn: ({ t }) => { const u = t * 0.65; return {
    rot: 6 * S(u), headRot: 9 * S(u + 0.5), armL: -24, armR: -24, closed: 1, smile: 0.8, blush: 0.7,
    y: -2 * Math.abs(S(u)), tail: 12 * S(u + 1), legL: 4, legR: 4, glow: 0.15,
  }; } },
  { name: 'Reading Calm', fn: ({ t }) => ({
    book: 1, armL: -20, armR: -42, headRot: 3 * S(t * 0.4), headY: 3, lookY: 1, lookX: 0.25 * S(t * 0.3),
    eyeOpen: 0.75, smile: 0.4, y: -14 - 5 * S(t * 0.8), legL: -26, legR: -26, liftL: -6, liftR: -6, glow: 0.3, tail: 6 * S(t * 0.5),
  }) },
  // From the videos: plopped down on the floor, legs splayed forward, reading / tapping along.
  { name: 'Sit & Read', fn: ({ t, B }) => ({
    y: 20, legL: 72, legR: 72, liftL: -4, liftR: -4, sy: 0.98, sx: 1.03, book: 1, armL: -18, armR: -40,
    headRot: 5 * S((B / 4) * TAU), headY: 2, lookY: 0.9, lookX: 0.3 * S(t * 0.35), eyeOpen: 0.7, smile: 0.3,
    tail: 10 * S(t * 0.9), glow: 0.2,
  }) },
  // From the videos: a little "hi!" wave with one paw, the other on the tummy.
  { name: 'Friendly Wave', fn: ({ t, B }) => { const w = S(t * 5.5); return {
    armL: 150 + 22 * w, armR: -18, headRot: -6 + 4 * w, rot: -3, y: -2 * Math.abs(S(PI * B)),
    happy: 0.7, smile: 0.9, blush: 0.8, tail: 12 * S(t * 2), legL: 4, legR: 4,
  }; } },
];

// ── EDM: jumping, pumping, shuffling, robot pops ─────────────────────────────────────────────────
const POP: [number, number, number][] = [[95, -30, 6], [-30, 95, -6], [170, 15, 8], [15, 170, -8], [95, 95, 0], [165, 165, 0], [-45, -45, 0], [130, 35, 10]];
const EDM: Move[] = [
  { name: 'Jump Pump', fn: ({ B, ph, amp }) => {
    const hop = Math.pow(S(PI * ph), 1.3), land = pulse(ph, 10), bar = Math.floor(B / 4) % 2 === 0;
    const up = 160 + 14 * pulse(ph, 5), low = 24 + 10 * S(TAU * ph);
    return { y: -(26 + 22 * amp) * hop, sy: 1 - 0.12 * land + 0.06 * hop, sx: 1 + 0.1 * land - 0.04 * hop,
      armL: bar ? up : low, armR: bar ? low : up, legL: 12 * hop, legR: 12 * hop, liftL: -6 * hop, liftR: -6 * hop,
      happy: 1, mouth: 0.35 * pulse(ph, 4), mane: 0.6 * pulse(ph, 4), tail: 15 * S(PI * B), headY: 4 * land, smile: 0.8 };
  } },
  { name: 'Shuffle', fn: ({ B, kick }) => {
    const s = S(PI * B), s2 = S(TAU * B);
    return { x: 18 * s, legL: 30 * Math.max(0, s), legR: 30 * Math.max(0, -s), liftL: -12 * Math.max(0, s2), liftR: -12 * Math.max(0, -s2),
      y: -7 * Math.abs(s2), armL: 30 + 28 * s, armR: 30 - 28 * s, rot: 6 * s, headRot: -5 * s, happy: 0.8, smile: 0.8, tail: -20 * s, mane: 0.3 * kick };
  } },
  { name: 'Hands Up Wave', fn: ({ B, ph, kick }) => {
    const w = S(PI * B), dip = pulse(ph, 6);
    return { armL: 150 + 20 * w, armR: 150 - 20 * w, rot: 8 * w, x: 6 * w, y: 5 * dip, sy: 1 - 0.07 * dip, sx: 1 + 0.05 * dip,
      headRot: 7 * w, happy: 1, mouth: 0.25 + 0.25 * kick, smile: 1, tail: 18 * w, blush: 0.8 };
  } },
  { name: 'Robot Pop', fn: ({ B, ph }) => {
    const i = Math.floor(B) % 8, j = (i + 7) % 8, k = ease(clamp(ph / 0.14)), a = POP[j], b = POP[i];
    const H = a[2] + (b[2] - a[2]) * k;
    return { armL: a[0] + (b[0] - a[0]) * k, armR: a[1] + (b[1] - a[1]) * k, headRot: H, rot: H * 0.4, y: 3 * pulse(ph, 12),
      legL: 10, legR: 10, smile: 0.3, mane: 0.4 * pulse(ph, 8), lookX: H / 10 };
  } },
  { name: 'Spin Jump', fn: ({ B, ph }) => {
    if (Math.floor(B) % 4 === 3) {
      return { y: -72 * S(PI * ph), spin: Math.cos(TAU * ph), armL: 160, armR: 160, legL: -10, legR: -10, liftL: -10, liftR: -10,
        happy: 1, mouth: 0.5, smile: 1, mane: 0.8 };
    }
    const hop = S(PI * ph);
    return { y: -14 * hop, armL: 60 + 30 * hop, armR: 60 + 30 * hop, happy: 0.6, legL: 6, legR: 6, sy: 1 - 0.06 * pulse(ph, 10), tail: 10 * S(PI * B) };
  } },
  // From the videos: grumpy little boxing jabs, alternating paws on each beat, bobbing.
  { name: 'Kaiju Boxing', fn: ({ B, ph }) => {
    const left = Math.floor(B) % 2 === 0, p = pulse(ph, 6), bob = S(TAU * B);
    const jab = 82 + 8 * p, guard = -100;
    return { armL: left ? jab : guard, armR: left ? guard : jab, rot: left ? 6 * p : -6 * p, x: (left ? 6 : -6) * p,
      headRot: left ? -4 : 4, y: 3 * Math.abs(bob), legL: 14, legR: 14, liftL: left ? 0 : -4 * p, liftR: left ? -4 * p : 0,
      smile: -0.7, mouth: 0.25 * p, mane: 0.4 * p, tail: 14 * bob, sy: 1 - 0.04 * p };
  } },
  // From the videos: a determined stompy march, knees up, arms swinging.
  { name: 'Stomp March', fn: ({ B, ph }) => {
    const left = Math.floor(B) % 2 === 0, s = S(PI * ph), land = pulse(ph, 9);
    return { liftL: left ? -18 * s : 0, liftR: left ? 0 : -18 * s, legL: left ? -8 * s : 4, legR: left ? 4 : -8 * s,
      armL: left ? 55 : -25, armR: left ? -25 : 55, rot: left ? -4 : 4, headRot: left ? 3 : -3, y: 3 * land - 4 * s,
      x: 10 * S((PI * B) / 4), smile: -0.4, mane: 0.3 * land, tail: left ? 16 : -16, sy: 1 - 0.05 * land };
  } },
];

// ── ROCK: headbangs, air guitar, pogo, stomps ────────────────────────────────────────────────────
const ROCK: Move[] = [
  { name: 'Headbang', fn: ({ B, ph }) => {
    const p = pulse(ph, 4.5), alt = Math.floor(B) % 2 ? 1 : -1;
    return { headRot: 4 + 10 * p + 6 * p * alt, headY: 13 * p, headScale: 1 + 0.05 * p, rot: 4 + 5 * p, mane: p,
      armL: 22 + 22 * p, armR: 22 + 22 * p, legL: 20, legR: 20, sy: 1 - 0.07 * p, sx: 1 + 0.04 * p, y: 4 * p,
      closed: 0.6, mouth: 0.45 * p, smile: -0.6, tail: 20 * p * alt };
  } },
  { name: 'Air Guitar', fn: ({ B, ph, t }) => {
    const strum = Math.abs(S(TAU * B)), p = pulse(ph, 5);
    return { armL: 75 + 6 * S(t * 3), armR: -15 + 40 * strum, rot: -7, legL: 26, legR: 8, y: 6 * p, headY: 7 * p, headRot: -6 + 8 * p,
      mouth: 0.25 + 0.45 * p, closed: 0.5, smile: -0.3, mane: 0.5 * p, tail: 14 * p, sy: 1 - 0.05 * p };
  } },
  { name: 'Horns Up Pogo', fn: ({ B, ph, amp }) => {
    const hop = S(PI * ph), p = pulse(ph, 6);
    return { y: -(30 + 20 * amp) * hop, armL: 165 + 10 * p, armR: 165 + 10 * p, legL: -4, legR: -4, mouth: 0.6 * hop, mane: 0.9 * hop,
      headRot: 6 * S(PI * B), sy: 1 + 0.06 * hop - 0.1 * p, sx: 1 - 0.03 * hop + 0.08 * p, smile: -0.4, tail: 20 * hop };
  } },
  { name: 'Stomp', fn: ({ B, ph }) => {
    const left = Math.floor(B) % 2 === 0, s = S(PI * ph), p = pulse(ph, 7);
    return { liftL: left ? -20 * s : 0, liftR: left ? 0 : -20 * s, legL: left ? 14 * s : 6, legR: left ? 6 : 14 * s,
      rot: left ? -7 : 7, armL: left ? 120 : 55, armR: left ? 55 : 120, headY: 6 * p, headRot: left ? -6 : 6, y: 3 * p,
      mouth: 0.3 * p, smile: -0.5, mane: 0.6 * p, tail: left ? -15 : 15 };
  } },
  // From the videos: arms flung wide, claws out, a big fanged ROAR on the downbeat of every bar.
  { name: 'Kaiju Roar', fn: ({ B, ph }) => {
    const bar = (B % 4) / 4, roar = bar < 0.5 ? S(PI * (bar / 0.5)) : 0, p = pulse(ph, 6);
    return { armL: 70 + 40 * roar + 6 * p, armR: 70 + 40 * roar + 6 * p, headY: -6 * roar + 4 * p, headScale: 1 + 0.06 * roar,
      mouth: 0.15 + 0.85 * roar, mouthW: 0.8, smile: -0.8, mane: 0.3 + 0.7 * roar, legL: 18, legR: 18,
      sy: 1 + 0.05 * roar - 0.05 * p, sx: 1 + 0.04 * roar, y: -4 * roar, tail: 18 * S(PI * B), rot: 3 * S(PI * B) };
  } },
  // From the videos: a sassy side kick on every other beat.
  { name: 'Side Kick', fn: ({ B, ph }) => {
    const n = Math.floor(B) % 4, kick = n === 1 || n === 3, left = n === 1, k = kick ? S(PI * ph) : 0, p = pulse(ph, 7);
    return { legL: left ? 60 * k : 6, legR: !left ? 60 * k : 6, liftL: left ? -14 * k : 0, liftR: !left ? -14 * k : 0,
      rot: (left ? 10 : -10) * k, armL: left ? 40 : 110 * (0.4 + 0.6 * k), armR: left ? 110 * (0.4 + 0.6 * k) : 40,
      headRot: (left ? -6 : 6) * k, y: 3 * p, smile: -0.5, mouth: 0.3 * k, mane: 0.5 * k, tail: (left ? -20 : 20) * k };
  } },
];

// ── BALLET: pirouettes, arabesques, port de bras, leaps ──────────────────────────────────────────
const BALLET: Move[] = [
  { name: 'Pirouette', fn: ({ t, amp }) => { const a = t * (3.2 + 2 * amp); return {
    spin: Math.cos(a), y: -9 - 3 * S(t * 2), armL: 165, armR: 165, legR: -32, liftR: -18,
    closed: 0.8, smile: 0.8, blush: 0.6, glow: 0.3, tail: 10 * S(a),
  }; } },
  { name: 'Arabesque', fn: ({ t }) => { const br = S(t * 0.9); return {
    legL: 78 + 4 * br, liftL: -14, rot: 14 + 3 * br, armL: 125 + 8 * br, armR: 70 - 6 * br, y: -8 - 2 * br, headRot: -6,
    closed: 0.6, happy: 0.3, smile: 0.7, blush: 0.5, tail: -8 * br, glow: 0.2,
  }; } },
  { name: 'Port de Bras', fn: ({ B }) => { const u = (B / 4) * TAU; return {
    armL: 90 + 62 * S(u), armR: 90 + 62 * S(u + 1.3), rot: 5 * S(u), x: 12 * S(u / 2), headRot: 9 * S(u + 0.6),
    y: -5 - 3 * S(u * 2), closed: 0.9, smile: 0.8, blush: 0.6, legL: 6, legR: 6, tail: 10 * S(u),
  }; } },
  { name: 'Grand Jeté', fn: ({ B }) => {
    const p = (B % 8) / 8;
    if (p >= 0.5 && p < 0.75) {
      const arc = S(PI * ((p - 0.5) / 0.25));
      return { y: -85 * arc, x: 40 * arc, legL: 75 * arc, legR: 75 * arc, armL: 110, armR: 110, rot: 6 * arc,
        happy: 0.8, smile: 1, mouth: 0.2, mane: 0.4 * arc, glow: 0.3 };
    }
    const plie = 0.5 + 0.5 * S(B * PI);
    return { y: -4 * plie, sy: 1 - 0.03 * (1 - plie), armL: 60 + 20 * plie, armR: 60 + 20 * plie, legL: 12, legR: 12, closed: 0.7, smile: 0.7, tail: 6 * S(B) };
  } },
];

export const MOVES: Record<KaijuStyle, Move[]> = { zen: ZEN, edm: EDM, rock: ROCK, ballet: BALLET };

export const STYLE_META: Record<KaijuStyle, { label: string; emoji: string; tint: string; ripple: string }> = {
  zen: { label: 'Meditation', emoji: '🪷', tint: '#7FE0C4', ripple: '#9C88E8' },
  edm: { label: 'EDM Rave', emoji: '⚡', tint: '#FF4FD8', ripple: '#00C2FF' },
  rock: { label: 'Rock Headbang', emoji: '🤘', tint: '#FF6A2A', ripple: '#D40055' },
  ballet: { label: 'Ballet & Cinema', emoji: '🩰', tint: '#FFB6D5', ripple: '#E7B04B' },
};

// ── vocal performance overlays (applied to the singer, on top of a little of the groove) ─────────
export interface VocalCtx extends MoveCtx { env: number; syl: number; pitch: number }

export function performVocal(groove: Pose, mode: VocalMode, c: VocalCtx, kind: KaijuKind): Pose {
  if (mode === 'none') return groove;
  const g = damp(groove, mode === 'rap' ? 0.25 : 0.35);
  const env = c.env;
  const micArm = -105 + 5 * S(c.t * 2.2);
  switch (mode) {
    case 'sing': return {
      ...g, mic: 1, armL: micArm,
      // Lorik reads the lyrics from his LORIK book; Lumi gestures with the melody.
      armR: kind === 'lorik' ? -38 : 45 + 55 * c.pitch + 8 * S(c.t * 1.7), book: kind === 'lorik' ? 1 : 0,
      headRot: g.headRot + 7 * S((c.B / 4) * TAU), mouth: 0.12 + 0.88 * env, mouthW: 0.55,
      happy: env > 0.25 ? 0.55 : 0.2, closed: env > 0.75 ? 0.6 : 0, blush: 0.7, lookY: kind === 'lorik' ? 0.7 : 0, smile: 0.6,
    };
    case 'rap': {
      const p = pulse(c.ph, 5), alt = Math.floor(c.B) % 2 ? 1 : -1;
      return {
        ...g, mic: 1, armL: micArm, armR: 70 + 40 * c.syl, headY: 8 * p, headRot: 6 * alt * p, rot: -5 + 3 * p,
        shades: 1, mouth: 0.1 + 0.75 * c.syl * Math.max(0.4, env) + 0.15 * env, mouthW: 0.7, smile: 0.25,
        legL: 14, legR: 14, y: 4 * p, sy: 1 - 0.04 * p, happy: 0, closed: 0,
      };
    }
    case 'sustain': return {
      ...g, mic: 1, armL: micArm, armR: 118 + 3 * S(c.t * 36), headRot: -9, headY: -5, closed: 1,
      mouth: 0.8 + 0.1 * S(c.t * 30), mouthW: 0.3, y: -7, sy: 1.04, sx: 0.98, glow: 0.7, mane: 0.4, blush: 0.8, happy: 0,
    };
    case 'run': return {
      ...g, mic: 1, armL: micArm, armR: 45 + 110 * c.pitch + 10 * S(c.t * 9), headRot: 16 * (c.pitch - 0.5), headY: -6 * c.pitch,
      mouth: 0.35 + 0.55 * env, mouthW: 0.45, closed: 0.6, happy: 0.3, blush: 0.7, glow: 0.35,
    };
  }
}

/** Breathing idle used when paused / silent; `sleepy` 0..1 dozes them off. */
export function idlePose(t: number, seed: number, sleepy: number): Pose {
  const u = t + seed * 2.1;
  const awake = pose({
    y: -1.5 * (0.5 + 0.5 * S(u * 1.6)), sy: 1 + 0.018 * S(u * 1.6), sx: 1 - 0.012 * S(u * 1.6),
    headRot: 3 * S(u * 0.5), armL: 12 + 3 * S(u * 1.6), armR: 12 + 3 * S(u * 1.6 + 0.5), tail: 8 * S(u * 0.8),
    lookX: S(u * 0.23) > 0.6 ? 0.8 : S(u * 0.31) < -0.7 ? -0.5 : 0, smile: -0.3,
  });
  if (sleepy <= 0) return awake;
  const asleep = pose({
    y: 2, sy: 0.97 + 0.025 * S(u * 0.9), headRot: 12, headY: 6, closed: 1, smile: 0.4, blush: 0.6,
    armL: -10, armR: -10, legL: 8, legR: 8, tail: 4 * S(u * 0.4), mouth: S(u * 0.9) > 0.2 ? 0.1 : 0,
  });
  return lerpPose(awake, asleep, sleepy);
}
