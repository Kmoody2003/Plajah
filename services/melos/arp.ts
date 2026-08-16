// The Arpeggiator — a note generator whose every step is also a modulation source.
//
// The design claim (see the architecture proposal): "an arp that can control other parameters"
// is really a step engine where each step carries a note AND a set of parameter values. That is
// Elektron's parameter lock, which nobody has fused with a proper arp inside a DAW.
//
// Two audiences, one object:
//   • Closed, it is five controls — rate, octaves, order, gate, swing — and it works the moment
//     you hold a chord. That is the whole arpeggiator most people ever want.
//   • Opened, every step exposes feel, chance and locks.
//
// Pure and synchronous: no audio, no timers, no React. The scheduler asks it what happens on a
// step and it answers. That keeps it testable headlessly and usable in the offline render.

import { snapToScale } from './theory';

export type ArpOrder =
  | 'up' | 'down' | 'updown' | 'downup' | 'upDownInclusive'
  | 'played' | 'random' | 'randomWalk' | 'chord' | 'spiral';

export const ARP_ORDERS: { id: ArpOrder; name: string; hint: string }[] = [
  { id: 'up', name: 'Up', hint: 'Lowest note to highest, then round again.' },
  { id: 'down', name: 'Down', hint: 'Highest to lowest.' },
  { id: 'updown', name: 'Up–down', hint: 'Up then back down, without repeating the ends.' },
  { id: 'downup', name: 'Down–up', hint: 'Down then back up.' },
  { id: 'upDownInclusive', name: 'Up–down (hold ends)', hint: 'Up then down, playing the top and bottom twice.' },
  { id: 'played', name: 'As played', hint: 'The order you pressed the keys in.' },
  { id: 'random', name: 'Random', hint: 'Any held note, chosen fresh each step.' },
  { id: 'randomWalk', name: 'Wander', hint: 'Steps to a neighbouring note — random but melodic.' },
  { id: 'chord', name: 'Chord', hint: 'All held notes together on every step.' },
  { id: 'spiral', name: 'Spiral', hint: 'Outward from the middle: low, high, low, high.' },
];

/**
 * Elektron-style trig conditions. The single cheapest route to a pattern that evolves instead of
 * looping, and it costs the user one dropdown.
 */
export type TrigCondition =
  | 'always'
  | '1:2' | '2:2' | '1:3' | '2:3' | '3:3' | '1:4' | '2:4' | '3:4' | '4:4'
  | 'first' | 'notFirst' | 'fill' | 'notFill' | 'prev' | 'notPrev';

export const TRIG_CONDITIONS: { id: TrigCondition; name: string; hint: string }[] = [
  { id: 'always', name: 'Always', hint: 'Plays every time.' },
  { id: '1:2', name: '1:2', hint: 'Every other loop.' },
  { id: '2:2', name: '2:2', hint: 'The other every-other loop.' },
  { id: '1:3', name: '1:3', hint: 'First of every three loops.' },
  { id: '1:4', name: '1:4', hint: 'First of every four loops.' },
  { id: '3:4', name: '3:4', hint: 'Third of every four loops.' },
  { id: 'first', name: 'First', hint: 'Only the first time round.' },
  { id: 'notFirst', name: 'Not first', hint: 'Every loop except the first.' },
  { id: 'fill', name: 'Fill', hint: 'Only while Fill is held.' },
  { id: 'notFill', name: 'Not fill', hint: 'Everywhere except during Fill.' },
  { id: 'prev', name: 'Prev', hint: 'Only if the previous conditional step played.' },
  { id: 'notPrev', name: 'Not prev', hint: 'Only if the previous conditional step did not.' },
];

/** A parameter lock: hold `value` on `paramId` for the duration of this step only. */
export interface ParamLock {
  /** Engine parameter id, the same space ONDA's mod matrix targets. */
  paramId: number;
  value: number;
  /** Set when the lock points at another device in the chain rather than the instrument. */
  deviceId?: string;
}

export interface ArpStep {
  on: boolean;
  /** 1–127. */
  velocity: number;
  /** Multiple of the step length; >1 ties into following steps. */
  gate: number;
  /** 1 = one hit, 2+ = a roll inside the step. */
  ratchet: number;
  /** Octave offset applied on top of the arp's octave walk. */
  octave: number;
  /** Semitone offset. Snapped to the scale when the guard is on. */
  transpose: number;
  /** 0–1. Rolled once per occurrence. */
  probability: number;
  condition: TrigCondition;
  locks: ParamLock[];
  /** -0.5..0.5 of a step. */
  micro: number;
}

export const defaultStep = (): ArpStep => ({
  on: true, velocity: 100, gate: 0.9, ratchet: 1, octave: 0, transpose: 0,
  probability: 1, condition: 'always', locks: [], micro: 0,
});

export interface ArpPatch {
  enabled: boolean;
  order: ArpOrder;
  /** Steps per beat: 1 = quarter, 2 = eighth, 4 = sixteenth, 8 = thirty-second. */
  rate: number;
  octaves: number;
  /** Global gate scaler, multiplied by each step's own gate. */
  gate: number;
  /** 0..1 on offbeat steps. */
  swing: number;
  /** Pattern length in steps (1–64). */
  length: number;
  steps: ArpStep[];
  /** Hold the last chord after the keys are released — the beginner's best friend. */
  latch: boolean;
  /** Scale guard: transposes and random walks stay in key. */
  scale: { rootPc: number; scaleId: string; enabled: boolean };
  /** Deterministic randomness, so a bounce reproduces what you heard. */
  seed: number;
}

export function defaultArpPatch(): ArpPatch {
  return {
    enabled: false,
    order: 'up',
    rate: 4,
    octaves: 1,
    gate: 0.9,
    swing: 0,
    length: 16,
    steps: Array.from({ length: 16 }, defaultStep),
    latch: false,
    scale: { rootPc: 0, scaleId: 'minor', enabled: false },
    seed: 0x5eed,
  };
}

/** One note the arp wants played. */
export interface ArpNote {
  key: number;
  velocity: number;
  /** Seconds, already accounting for gate and ratchet subdivision. */
  durationBeats: number;
  /** Offset from the step position, in beats — carries swing, micro-timing and ratchet spacing. */
  offsetBeats: number;
  locks: ParamLock[];
}

/** Everything the arp emits for one step: notes plus its Motion outputs. */
export interface ArpStepResult {
  notes: ArpNote[];
  /** Motion sources the arp publishes — draggable onto any parameter. */
  motion: { step: number; velocity: number; gate: number };
  played: boolean;
}

// Deterministic PRNG so probability is reproducible: same seed, same performance.
function rng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a ^= a << 13; a >>>= 0;
    a ^= a >> 17;
    a ^= a << 5; a >>>= 0;
    return a / 4294967296;
  };
}

function evaluateCondition(c: TrigCondition, loop: number, fill: boolean, prevFired: boolean): boolean {
  switch (c) {
    case 'always': return true;
    case '1:2': return loop % 2 === 0;
    case '2:2': return loop % 2 === 1;
    case '1:3': return loop % 3 === 0;
    case '2:3': return loop % 3 === 1;
    case '3:3': return loop % 3 === 2;
    case '1:4': return loop % 4 === 0;
    case '2:4': return loop % 4 === 1;
    case '3:4': return loop % 4 === 2;
    case '4:4': return loop % 4 === 3;
    case 'first': return loop === 0;
    case 'notFirst': return loop > 0;
    case 'fill': return fill;
    case 'notFill': return !fill;
    case 'prev': return prevFired;
    case 'notPrev': return !prevFired;
    default: return true;
  }
}

/** Order the held notes into the sequence the arp walks. */
export function orderNotes(held: number[], playedOrder: number[], order: ArpOrder, octaves: number): number[] {
  if (!held.length) return [];
  const asc = [...held].sort((a, b) => a - b);
  let base: number[];
  switch (order) {
    case 'down': base = [...asc].reverse(); break;
    case 'updown': base = asc.length > 2 ? [...asc, ...asc.slice(1, -1).reverse()] : [...asc, ...asc.slice(0, -1).reverse()]; break;
    case 'downup': { const d = [...asc].reverse(); base = d.length > 2 ? [...d, ...d.slice(1, -1).reverse()] : [...d, ...d.slice(0, -1).reverse()]; break; }
    case 'upDownInclusive': base = [...asc, ...[...asc].reverse()]; break;
    case 'played': base = playedOrder.length ? playedOrder.filter((n) => held.includes(n)) : asc; break;
    case 'chord': base = asc; break;
    case 'spiral': {
      // Outward from the centre — the shape that makes two-hand voicings sound composed.
      const out: number[] = [];
      let lo = 0, hi = asc.length - 1;
      while (lo <= hi) { out.push(asc[lo++]); if (lo <= hi) out.push(asc[hi--]); }
      base = out;
      break;
    }
    default: base = asc;
  }
  if (octaves <= 1) return base;
  const out: number[] = [];
  for (let o = 0; o < octaves; o++) for (const n of base) out.push(n + o * 12);
  return out;
}

/**
 * What the arp plays on one absolute step index.
 *
 * `stepIndex` is monotonic from transport start, so loop counting (and therefore trig
 * conditions) is derived rather than stored — the arp holds no mutable playback state, which is
 * what lets the offline render evaluate any step in any order.
 */
export function arpStep(
  patch: ArpPatch,
  held: number[],
  playedOrder: number[],
  stepIndex: number,
  opts: { fill?: boolean; prevFired?: boolean } = {},
): ArpStepResult {
  const empty: ArpStepResult = { notes: [], motion: { step: 0, velocity: 0, gate: 0 }, played: false };
  if (!patch.enabled || !held.length) return empty;

  const len = Math.max(1, Math.min(64, patch.length));
  const local = ((stepIndex % len) + len) % len;
  const loop = Math.floor(stepIndex / len);
  const step = patch.steps[local] || defaultStep();

  const motion = {
    step: len > 1 ? local / (len - 1) : 0,
    velocity: step.velocity / 127,
    gate: Math.min(1, step.gate * patch.gate),
  };
  if (!step.on) return { ...empty, motion };

  if (!evaluateCondition(step.condition, loop, !!opts.fill, !!opts.prevFired)) {
    return { ...empty, motion };
  }
  // Seed per (step, loop) so the same step in the same loop always rolls the same — otherwise a
  // bounce would differ from what the artist approved.
  const rand = rng(patch.seed ^ (stepIndex * 2654435761));
  if (step.probability < 1 && rand() > step.probability) return { ...empty, motion };

  const sequence = orderNotes(held, playedOrder, patch.order, Math.max(1, patch.octaves));
  if (!sequence.length) return { ...empty, motion };

  // Which note(s) this step plays.
  let keys: number[];
  if (patch.order === 'chord') {
    keys = sequence;
  } else if (patch.order === 'random') {
    keys = [sequence[Math.floor(rand() * sequence.length) % sequence.length]];
  } else if (patch.order === 'randomWalk') {
    // Wander: step to a neighbour rather than jumping — random that still sounds like a melody.
    const centre = ((stepIndex % sequence.length) + sequence.length) % sequence.length;
    const delta = Math.floor(rand() * 3) - 1;
    keys = [sequence[((centre + delta) % sequence.length + sequence.length) % sequence.length]];
  } else {
    keys = [sequence[((stepIndex % sequence.length) + sequence.length) % sequence.length]];
  }

  const stepBeats = 1 / Math.max(1, patch.rate);
  const swingOffset = local % 2 === 1 ? patch.swing * 0.5 * stepBeats : 0;
  const baseOffset = swingOffset + step.micro * stepBeats;
  const ratchet = Math.max(1, Math.min(8, step.ratchet));
  const gateBeats = Math.max(0.02, stepBeats * step.gate * patch.gate) / ratchet;

  const notes: ArpNote[] = [];
  for (const rawKey of keys) {
    let key = rawKey + step.octave * 12 + step.transpose;
    if (patch.scale.enabled) key = snapToScale(key, patch.scale.rootPc, patch.scale.scaleId, 'nearest');
    key = Math.max(0, Math.min(127, key));
    for (let r = 0; r < ratchet; r++) {
      notes.push({
        key,
        // Rolls taper so a ratchet reads as one gesture rather than N separate hits.
        velocity: Math.max(1, Math.round(step.velocity * (r === 0 ? 1 : 0.82 - r * 0.04))),
        durationBeats: gateBeats,
        offsetBeats: baseOffset + (r * stepBeats) / ratchet,
        locks: step.locks,
      });
    }
  }

  return { notes, motion, played: true };
}

/** Euclidean fill — the fastest way to a pattern that grooves without programming it. */
export function euclidean(steps: number, pulses: number, rotate = 0): boolean[] {
  const n = Math.max(1, Math.min(64, steps));
  const k = Math.max(0, Math.min(n, pulses));
  const out = new Array(n).fill(false);
  if (k === 0) return out;
  // Bjorklund by the bucket method — same result, a tenth of the code.
  let bucket = 0;
  for (let i = 0; i < n; i++) {
    bucket += k;
    if (bucket >= n) { bucket -= n; out[i] = true; }
  }
  if (!rotate) return out;
  const r = ((rotate % n) + n) % n;
  return [...out.slice(n - r), ...out.slice(0, n - r)];
}
