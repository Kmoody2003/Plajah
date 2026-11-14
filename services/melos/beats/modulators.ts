// Melos Beats — parameter animation. Automation draws a value along the song; a modulator MOVES a
// value by itself, between two ends, on any parameter it's attached to (Bitwig's unified modulation,
// in Chora's own shape). The value at any moment is a pure function of the beat and the second, so
// a seek, a loop or an offline bounce all land on the same value: no phase is ever carried along.
//
// Extend it: a motion is one WAVES entry, a mathematical shaping is one CURVES entry. Their ids are
// saved in projects, so append, never rename. The rack draws its pickers from these tables.

import type { AutomationTarget } from './grooveDoc';

export interface WaveInput {
  /** 0..1 through this cycle. */
  phase: number;
  /** Which cycle this is (monotonic; seeds per-cycle randomness). */
  cycle: number;
  /** Deterministic 0..1 for a cycle and a salt. */
  rand(cycle: number, salt?: number): number;
}

export interface WaveDef {
  id: string;
  name: string;
  hint: string;
  /** Output 0..1. */
  fn(i: WaveInput): number;
}

const TAU = Math.PI * 2;
const smooth = (t: number) => t * t * (3 - 2 * t);
const rnd = (i: WaveInput, c: number) => i.rand(c, 1);

export const WAVES: WaveDef[] = [
  { id: 'sine', name: 'Sine', hint: 'The smooth one.', fn: ({ phase }) => 0.5 - 0.5 * Math.cos(TAU * phase) },
  { id: 'triangle', name: 'Triangle', hint: 'Straight up, straight down.', fn: ({ phase }) => 1 - Math.abs(2 * phase - 1) },
  { id: 'saw', name: 'Saw down', hint: 'Jumps up, falls away.', fn: ({ phase }) => 1 - phase },
  { id: 'ramp', name: 'Saw up', hint: 'Climbs, then drops back.', fn: ({ phase }) => phase },
  { id: 'square', name: 'Square', hint: 'Hard between the two ends.', fn: ({ phase }) => (phase < 0.5 ? 1 : 0) },
  { id: 'pulse', name: 'Pulse', hint: 'A short blip each cycle.', fn: ({ phase }) => (phase < 0.15 ? 1 : 0) },
  { id: 'sh', name: 'Sample + hold', hint: 'A new random value each cycle, held.', fn: (i) => rnd(i, i.cycle) },
  { id: 'smooth', name: 'Random smooth', hint: 'Glides between random values.', fn: (i) => rnd(i, i.cycle) + (rnd(i, i.cycle + 1) - rnd(i, i.cycle)) * smooth(i.phase) },
  { id: 'drunk', name: 'Drunk walk', hint: 'Wanders in small steps, never jumping far.', fn: (i) => {
    // A bounded sum of per-cycle steps, read back over a fixed window: stateless, still a walk.
    let v = 0.5;
    for (let c = i.cycle - 7; c <= i.cycle; c++) v += (rnd(i, c) - 0.5) * 0.3;
    const next = v + (rnd(i, i.cycle + 1) - 0.5) * 0.3;
    return Math.max(0, Math.min(1, v + (next - v) * smooth(i.phase)));
  } },
  { id: 'noise', name: 'Noise', hint: 'Fine-grained jitter, changing thirty-two times a cycle.', fn: (i) => i.rand(i.cycle * 32 + Math.floor(i.phase * 32), 2) },
  { id: 'exp-up', name: 'Exponential rise', hint: 'Slow at first, then rushes up.', fn: ({ phase }) => (Math.exp(phase * 4) - 1) / (Math.E ** 4 - 1) },
  { id: 'exp-down', name: 'Exponential fall', hint: 'Falls fast, then settles: a decay.', fn: ({ phase }) => Math.exp(-phase * 5) },
  { id: 'bounce', name: 'Bounce', hint: 'A ball dropped each cycle.', fn: ({ phase }) => {
    const t = phase, n1 = 7.5625, d1 = 2.75;
    let v;
    if (t < 1 / d1) v = n1 * t * t;
    else if (t < 2 / d1) { const x = t - 1.5 / d1; v = n1 * x * x + 0.75; }
    else if (t < 2.5 / d1) { const x = t - 2.25 / d1; v = n1 * x * x + 0.9375; }
    else { const x = t - 2.625 / d1; v = n1 * x * x + 0.984375; }
    return 1 - v;
  } },
  { id: 'elastic', name: 'Elastic', hint: 'Snaps over and rings back.', fn: ({ phase }) => {
    if (phase <= 0) return 0;
    return Math.max(0, Math.min(1, 0.5 + 0.5 * (1 - Math.pow(2, -10 * phase) * Math.cos((phase * 10 - 0.75) * (TAU / 3)))));
  } },
  { id: 'lorenz', name: 'Chaos (logistic)', hint: 'Deterministic chaos: the logistic map at r=3.9.', fn: (i) => {
    let x = 0.2 + 0.6 * i.rand(0, 3);
    const steps = ((i.cycle % 256) + 256) % 256 + 8;
    for (let n = 0; n < steps; n++) x = 3.9 * x * (1 - x);
    const y = 3.9 * x * (1 - x);
    return x + (y - x) * smooth(i.phase);
  } },
  { id: 'golden', name: 'Golden ratio', hint: 'Fibonacci steps: covers the range without ever repeating.', fn: ({ cycle, phase }) => {
    const v = (c: number) => ((c * 0.6180339887) % 1 + 1) % 1;
    return v(cycle) + (v(cycle + 1) - v(cycle)) * smooth(phase);
  } },
];

export interface CurveDef {
  id: string;
  name: string;
  hint: string;
  /** Maps 0..1 to 0..1. `amt` 0..1 is how strongly. */
  fn(x: number, amt: number): number;
}

export const CURVES: CurveDef[] = [
  { id: 'linear', name: 'Linear', hint: 'The motion as it is.', fn: (x) => x },
  { id: 'power', name: 'Power', hint: 'Spends longer near the low end.', fn: (x, a) => Math.pow(x, 1 + a * 4) },
  { id: 'root', name: 'Root', hint: 'Spends longer near the high end.', fn: (x, a) => Math.pow(x, 1 / (1 + a * 4)) },
  { id: 'exp', name: 'Exponential', hint: 'For frequency-style controls, where equal steps should sound equal.', fn: (x, a) => {
    const k = 0.01 + a * 8;
    return (Math.exp(k * x) - 1) / (Math.exp(k) - 1);
  } },
  { id: 'log', name: 'Logarithmic', hint: 'Rises fast, then flattens.', fn: (x, a) => {
    const k = 0.01 + a * 30;
    return Math.log(1 + k * x) / Math.log(1 + k);
  } },
  { id: 'scurve', name: 'S-curve', hint: 'Lingers at both ends, moves through the middle.', fn: (x, a) => x + (smooth(smooth(x)) - x) * a },
  { id: 'sine', name: 'Sine shape', hint: 'Rounded ends.', fn: (x, a) => x + (0.5 - 0.5 * Math.cos(Math.PI * x) - x) * a },
  { id: 'steps', name: 'Stepped', hint: 'Quantised to a few values.', fn: (x, a) => {
    const n = Math.max(2, Math.round(2 + (1 - a) * 14));
    return Math.min(1, Math.floor(x * n) / (n - 1));
  } },
  { id: 'fold', name: 'Wavefold', hint: 'Folds the motion back on itself, so one cycle moves several times.', fn: (x, a) => {
    const f = x * (1 + a * 4);
    const m = f % 2;
    return m > 1 ? 2 - m : m;
  } },
  { id: 'invert', name: 'Invert', hint: 'Upside-down.', fn: (x, a) => x + (1 - 2 * x) * a },
  { id: 'gamma', name: 'Sigmoid', hint: 'A hard S: nearly a switch at full.', fn: (x, a) => {
    const k = 1 + a * 14;
    const s = (v: number) => 1 / (1 + Math.exp(-k * (v - 0.5)));
    return (s(x) - s(0)) / (s(1) - s(0));
  } },
];

export const waveById = (id: string): WaveDef => WAVES.find((w) => w.id === id) ?? WAVES[0];
export const curveById = (id: string): CurveDef => CURVES.find((c) => c.id === id) ?? CURVES[0];

// ── targets ──────────────────────────────────────────────────────────────────────────────────

/** A slope map from the control's own units to one engine parameter. Lets one knob that writes
 *  several engine values (a macro), or one in different units (dB → 0..1), be animated faithfully. */
export interface ParamLink {
  id: number;
  base: number;
  slope: number;
}

export type ModTarget =
  /** A channel's mix control or instrument message: everything automation can reach. */
  | { kind: 'track'; trackId: string; target: AutomationTarget }
  /** An engine parameter of a track's instrument. `knobBase` is the control value `links` hang from. */
  | { kind: 'param'; trackId: string; id: number; knobBase?: number; links?: ParamLink[] }
  /** A parameter of an insert: on a track, a pad, a group or a send bus. */
  | { kind: 'fx'; scope: 'track' | 'pad' | 'group' | 'send'; owner: string; fxId: string; param: string }
  /** A pad's channel strip. */
  | { kind: 'pad'; padIdx: number; field: 'gainDb' | 'pan' }
  /** A group bus's or the master's fader. */
  | { kind: 'mixer'; scope: 'group' | 'master'; index: number }
  /** A pad setting read when it's struck (drum-synth tune, envelope, filter…): each hit takes the
   *  value at that moment, so a one-shot changes from hit to hit rather than mid-sound. */
  | { kind: 'padHit'; padIdx: number; path: (string | number)[] };

export const modTargetKey = (t: ModTarget): string => {
  switch (t.kind) {
    case 'track': return `track:${t.trackId}:${t.target.kind}:${'index' in t.target ? t.target.index : ''}`;
    case 'param': return `param:${t.trackId}:${t.id}`;
    case 'fx': return `fx:${t.scope}:${t.owner}:${t.fxId}:${t.param}`;
    case 'pad': return `pad:${t.padIdx}:${t.field}`;
    case 'mixer': return `mixer:${t.scope}:${t.index}`;
    case 'padHit': return `padHit:${t.padIdx}:${t.path.join('.')}`;
  }
};

export interface Modulator {
  id: string;
  on: boolean;
  /** What the rack calls the target ("Cutoff — ONDA 1"). */
  label: string;
  target: ModTarget;
  /** The two ends the value moves between, in the control's own units. */
  min: number;
  max: number;
  wave: string;
  /** Beats per cycle when > 0 (synced); 0 = free-running at `rateHz`. */
  syncBeats: number;
  rateHz: number;
  /** 0..1 offset into the cycle. */
  phase: number;
  /** 0..1 chance that a cycle moves at all. A cycle that doesn't move sits at `rest`. */
  probability: number;
  /** Where a skipped cycle sits, 0..1 between the ends. */
  rest: number;
  /** 0..1: how much each cycle's depth and timing wander. */
  randomness: number;
  curve: string;
  curveAmt: number;
  seed: number;
}

export function newModulator(target: ModTarget, label: string, min: number, max: number): Modulator {
  return {
    id: `mod${Math.random().toString(36).slice(2, 9)}`, on: true, label, target, min, max,
    wave: 'sine', syncBeats: 1, rateHz: 0.5, phase: 0, probability: 1, rest: 0.5, randomness: 0,
    curve: 'linear', curveAmt: 0.5, seed: (Math.random() * 0x7fffffff) | 0,
  };
}

// ── evaluation ───────────────────────────────────────────────────────────────────────────────

function rand(seed: number, cycle: number, salt = 0): number {
  let h = (seed ^ Math.imul(cycle + 1, 0x9E3779B1) ^ Math.imul(salt + 1, 0x85EBCA77)) | 0;
  h = Math.imul(h ^ (h >>> 15), 1 | h);
  h = (h + Math.imul(h ^ (h >>> 7), 61 | h)) ^ h;
  return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
}

/** The modulator's position between its ends, 0..1, at this beat and second. */
export function modulatorAmount(m: Modulator, beat: number, sec: number): number {
  const pos = (m.syncBeats > 0 ? beat / m.syncBeats : sec * Math.max(0.001, m.rateHz)) + m.phase;
  const cycle = Math.floor(pos);
  let phase = pos - cycle;
  const roll = (c: number, salt = 0) => rand(m.seed, c, salt);
  if (m.probability < 1 && roll(cycle, 100) >= m.probability) return Math.max(0, Math.min(1, m.rest));
  if (m.randomness > 0) {
    // Each cycle starts a little late and doesn't quite reach the far end.
    phase = Math.max(0, Math.min(1, phase + (roll(cycle, 101) - 0.5) * m.randomness * 0.5));
  }
  let v = waveById(m.wave).fn({ phase, cycle, rand: (c, salt) => roll(c, salt ?? 0) });
  v = curveById(m.curve).fn(Math.max(0, Math.min(1, v)), m.curveAmt);
  if (m.randomness > 0) v = 0.5 + (v - 0.5) * (1 - m.randomness * roll(cycle, 102));
  return Math.max(0, Math.min(1, v));
}

/** The control value, in the target's own units. */
export function modulatorValue(m: Modulator, beat: number, sec: number): number {
  return m.min + (m.max - m.min) * modulatorAmount(m, beat, sec);
}

/** The engine parameters a `param` target writes, and the values for a control value. */
export function paramWrites(t: Extract<ModTarget, { kind: 'param' }>, v: number): Array<[number, number]> {
  if (t.links?.length) return t.links.map((l) => [l.id, l.base + l.slope * (v - (t.knobBase ?? 0))] as [number, number]);
  return [[t.id, v]];
}

/**
 * Points to print a modulator as, one every `maxBeats`. Beats are absolute song beats.
 */
export function modulatorPoints(m: Modulator, fromBeat: number, toBeat: number, beatToSec: (b: number) => number, maxBeats = 1 / 32): { beat: number; value: number }[] {
  const out: { beat: number; value: number }[] = [];
  for (let b = fromBeat; b < toBeat + 1e-9; b += maxBeats) {
    out.push({ beat: b, value: modulatorValue(m, b, beatToSec(b)) });
  }
  return out;
}

// ── attaching: from a control's edit to a target ─────────────────────────────────────────────

export type DocPath = (string | number)[];

/** Numeric leaves that differ between two doc snapshots, ignoring bookkeeping. */
export function diffNumericLeaves(a: unknown, b: unknown, path: DocPath = [], out: { path: DocPath; before: number; after: number }[] = []): { path: DocPath; before: number; after: number }[] {
  if (typeof a === 'number' && typeof b === 'number') {
    if (a !== b && path[path.length - 1] !== 'updatedAt') out.push({ path, before: a, after: b });
    return out;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ao = a as Record<string, unknown>, bo = b as Record<string, unknown>;
    const keys = Array.isArray(a) ? Array.from({ length: Math.max((a as unknown[]).length, (b as unknown[]).length) }, (_, i) => i) : [...new Set([...Object.keys(ao), ...Object.keys(bo)])];
    for (const k of keys) diffNumericLeaves(ao[k as string], bo[k as string], [...path, k], out);
  }
  return out;
}

interface PathDoc {
  arrangement: { id: string; inserts?: { id: string }[] }[];
  kit: { inserts?: { id: string }[] }[];
  mixer: { groups: { inserts?: { id: string }[] }[]; sendBuses?: { inserts?: { id: string }[] }[] };
}

/** What a changed doc value points at, or null if it's not something that can move live. */
export function targetFromPath(doc: PathDoc, path: DocPath): ModTarget | null {
  const [root, idx, field, a, b, c] = path;
  const fxAt = (owner: string, scope: 'track' | 'pad' | 'group' | 'send', inserts: { id: string }[] | undefined, i: unknown, leaf: unknown, param: unknown): ModTarget | null => {
    const fx = inserts?.[i as number];
    return fx && leaf === 'params' && typeof param === 'string' ? { kind: 'fx', scope, owner, fxId: fx.id, param } : null;
  };
  if (root === 'arrangement') {
    const track = doc.arrangement[idx as number];
    if (!track) return null;
    if (field === 'gainDb') return { kind: 'track', trackId: track.id, target: { kind: 'volume' } };
    if (field === 'pan') return { kind: 'track', trackId: track.id, target: { kind: 'pan' } };
    if (field === 'sends') return { kind: 'track', trackId: track.id, target: { kind: 'send', index: a as number } };
    if (field === 'inserts') return fxAt(track.id, 'track', track.inserts, a, b, c);
    if (field === 'instrument' && a === 'patch') {
      if (b === 'params' && Number.isFinite(Number(c))) return { kind: 'param', trackId: track.id, id: Number(c) };
      if (b === 'macros' && typeof c === 'number') return { kind: 'track', trackId: track.id, target: { kind: 'macro', index: c } };
    }
    return null;
  }
  if (root === 'kit') {
    const pad = doc.kit[idx as number];
    if (!pad) return null;
    if (field === 'gainDb' || field === 'pan') return { kind: 'pad', padIdx: idx as number, field };
    if (field === 'inserts') return fxAt(String(idx), 'pad', pad.inserts, a, b, c);
    // Sends are live gains, not read per hit; everything else on a pad is.
    if (field === 'sends' || field === 'stepFx') return null;
    return { kind: 'padHit', padIdx: idx as number, path: path.slice(2) };
  }
  if (root === 'mixer' && idx === 'master' && field === 'gainDb') return { kind: 'mixer', scope: 'master', index: 0 };
  if (root === 'mixer' && idx === 'groups') {
    const g = doc.mixer.groups[field as number];
    if (a === 'gainDb') return { kind: 'mixer', scope: 'group', index: field as number };
    if (a === 'inserts') return fxAt(String(field), 'group', g?.inserts, b, c, path[6]);
    return null;
  }
  if (root === 'mixer' && idx === 'sendBuses') {
    const g = doc.mixer.sendBuses?.[field as number];
    if (a === 'inserts') return fxAt(String(field), 'send', g?.inserts, b, c, path[6]);
    return null;
  }
  return null;
}

/**
 * Lay a pad's per-hit modulators over its settings for one trigger, then call the returned undo: the
 * doc is only different for the length of that synchronous call. Values step in 32nds of the range,
 * which also bounds how many renders the drum-synth hit cache can be asked for.
 */
export function overlayPadHit(doc: { modulators?: Modulator[]; kit: unknown[] }, padIdx: number, beat: number, sec: number): (() => void) | null {
  const mods = doc.modulators;
  if (!mods?.length) return null;
  let undo: (() => void) | null = null;
  for (const m of mods) {
    if (!m.on || m.target.kind !== 'padHit' || m.target.padIdx !== padIdx) continue;
    const path = m.target.path;
    let at = doc.kit[padIdx] as Record<string | number, unknown> | undefined;
    for (let i = 0; at && i < path.length - 1; i++) at = at[path[i]] as Record<string | number, unknown> | undefined;
    const leaf = path[path.length - 1];
    if (!at || typeof at[leaf] !== 'number') continue;
    const holder = at;
    const before = at[leaf] as number;
    const stepped = Math.round(modulatorAmount(m, beat, sec) * 32) / 32;
    holder[leaf] = m.min + (m.max - m.min) * stepped;
    const prev = undo;
    undo = () => { holder[leaf] = before; prev?.(); };
  }
  return undo;
}

/** What a right-clicked knob offers the attach gesture. */
export interface KnobRequest {
  label: string;
  value: number;
  min: number;
  max: number;
  set(v: number): void;
}
/** Knob → host: set while Chora's rack is mounted, so a knob elsewhere keeps its normal menu. */
export const knobBridge: { request: ((r: KnobRequest) => void) | null } = { request: null };

/** Live hook while a control is being identified: instruments report the parameters it wrote. */
export const modCapture = {
  active: false,
  writes: [] as { trackId: string; id: number; before: number; after: number }[],
  messages: [] as { trackId: string; target: AutomationTarget }[],
  begin() { this.active = true; this.writes = []; this.messages = []; },
  end() { this.active = false; },
};
