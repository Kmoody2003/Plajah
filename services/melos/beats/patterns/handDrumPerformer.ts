// The hand-drum performer — plays a rhythm from handRhythms.ts the way a person would, and writes it
// as notes for SOMA's hand map. A rhythm string is the idea; the performance is shaped by:
//   · persona — a Session Band player's personality traits (pocket, tightness, dynamics, density,
//     complexity, fills, space) from roster.ts: the Griot plays differently from Havana Nights;
//   · mood — tender, laid-back, steady, joyful, intense, hypnotic: velocity, push/pull, density;
//   · role — groove, groove with fills, solo, ad-libs, intro (build), break (stop-time).
// Every bar is played, not copied: accents follow the beat and the phrase, timing sits in the
// pocket with human scatter, ghost notes and flams come and go, bars vary, phrases end in fills.
// Deterministic for a seed, so a preset is reproducible and "another take" is a new seed. Pure.

import type { PersonaTraits } from '../band/roster';
import type { SomaStroke } from '../../instruments/soma/handMap';
import { STROKE_LETTERS, type HandRhythm } from './handRhythms';

export type HandMood = 'tender' | 'laid-back' | 'steady' | 'joyful' | 'intense' | 'hypnotic';
export type HandRole = 'groove' | 'fills' | 'solo' | 'adlib' | 'intro' | 'break';

export const HAND_MOODS: { id: HandMood; label: string; hint: string }[] = [
  { id: 'tender', label: 'Tender', hint: 'Soft hands, few slaps, a little behind the beat' },
  { id: 'laid-back', label: 'Laid-back', hint: 'Relaxed and behind, a lilt in the offbeats' },
  { id: 'steady', label: 'Steady', hint: 'In the pocket, honest dynamics' },
  { id: 'joyful', label: 'Joyful', hint: 'Bright slaps, a touch ahead, more chatter' },
  { id: 'intense', label: 'Intense', hint: 'Driving, loud, dense, building through the phrase' },
  { id: 'hypnotic', label: 'Hypnotic', hint: 'Repetitive and even — trance, few changes' },
];
export const HAND_ROLES: { id: HandRole; label: string; hint: string }[] = [
  { id: 'groove', label: 'Groove', hint: 'The accompaniment, played with small variations' },
  { id: 'fills', label: 'Groove + fills', hint: 'Fills at the end of each phrase' },
  { id: 'solo', label: 'Solo', hint: 'Lead phrases over the rhythm: call and response, a climax' },
  { id: 'adlib', label: 'Ad-libs', hint: 'Sparse answers in the gaps — for over a full band' },
  { id: 'intro', label: 'Intro build', hint: 'Starts bare and builds to the full groove' },
  { id: 'break', label: 'Break', hint: 'Groove, then a stop-time hit and a pickup' },
];

const MOOD: Record<HandMood, { vel: number; dyn: number; pocket: number; density: number; slap: number; swing: number; arc: number; vary: number }> = {
  'tender':    { vel: 0.68, dyn: 0.6, pocket: 0.05, density: -0.3, slap: -0.6, swing: 0.02, arc: -0.05, vary: 0.7 },
  'laid-back': { vel: 0.84, dyn: 0.8, pocket: 0.07, density: -0.1, slap: -0.2, swing: 0.08, arc: 0, vary: 0.9 },
  'steady':    { vel: 0.92, dyn: 1.0, pocket: 0.0, density: 0, slap: 0, swing: 0.0, arc: 0.02, vary: 1 },
  'joyful':    { vel: 1.0, dyn: 1.1, pocket: -0.03, density: 0.2, slap: 0.3, swing: 0.04, arc: 0.04, vary: 1.2 },
  'intense':   { vel: 1.08, dyn: 1.2, pocket: -0.04, density: 0.4, slap: 0.5, swing: 0.0, arc: 0.1, vary: 1.3 },
  'hypnotic':  { vel: 0.9, dyn: 0.5, pocket: 0.01, density: 0.05, slap: 0, swing: 0.03, arc: 0, vary: 0.3 },
};

/** A stroke as played: where (16th step + micro), what, how hard, which hand and drum. */
export interface PlayedStroke { step: number; micro: number; stroke: SomaStroke; hand: 'R' | 'L'; drum: number; vel: number }

export interface HandPerformance {
  /** Pattern length in 16ths (16, 32, 48 or 64). */
  length: 16 | 32 | 48 | 64;
  strokes: PlayedStroke[];
}

/** mulberry32 — small, fast, seedable. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const seedOf = (s: string) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);

const BASE_VEL: Record<SomaStroke, number> = { bass: 94, tone: 96, slap: 108, muted: 72, heel: 54, toe: 48, tip: 60, rim: 84 };
/** Where each stroke tends to sit: slaps snap a hair early, the bass settles late. */
const LEAN: Record<SomaStroke, number> = { bass: 0.03, tone: 0, slap: -0.03, muted: 0.01, heel: 0.02, toe: 0.02, tip: 0, rim: -0.01 };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const other = (h: 'R' | 'L'): 'R' | 'L' => (h === 'R' ? 'L' : 'R');

interface Cell { pos: number; stroke: SomaStroke; hand: 'R' | 'L'; drum: number }

/** The written rhythm as cells in 16ths (triplet grids land between 16ths — that's what micro is for). */
function cells(r: HandRhythm, barLen: number): Cell[][] {
  const bars: Cell[][] = Array.from({ length: r.bars }, () => []);
  for (const part of r.parts) {
    for (let i = 0; i < part.strokes.length; i++) {
      const ch = part.strokes[i];
      const stroke = STROKE_LETTERS[ch.toLowerCase()];
      if (!stroke) continue;
      const bar = Math.floor(i / r.grid);
      bars[bar].push({ pos: ((i % r.grid) * barLen) / r.grid, stroke, hand: ch === ch.toUpperCase() ? 'R' : 'L', drum: part.drum });
    }
  }
  return bars;
}

/** Solo vocabulary: short cells (in 16ths) a lead player strings together. */
const LICKS: { len: number; notes: [number, SomaStroke, number][] }[] = [
  { len: 4, notes: [[0, 'slap', 1], [2, 'slap', 0.9]] },
  { len: 4, notes: [[0, 'tone', 1], [1, 'tone', 0.85], [2, 'slap', 1]] },
  { len: 4, notes: [[0, 'slap', 1], [3, 'tone', 0.9]] },
  { len: 4, notes: [[0, 'tip', 0.6], [0.5, 'tip', 0.55], [1, 'tip', 0.6], [1.5, 'tip', 0.65], [2, 'tip', 0.7], [2.5, 'tip', 0.75], [3, 'slap', 1]] },
  { len: 2, notes: [[0, 'bass', 1]] },
  { len: 8, notes: [[0, 'slap', 1], [2, 'tone', 0.9], [3, 'tone', 0.85], [5, 'slap', 1], [6, 'muted', 0.7]] },
  { len: 4, notes: [[0, 'muted', 0.7], [1, 'slap', 1], [3, 'slap', 0.95]] },
  { len: 6, notes: [[0, 'tone', 1], [2, 'tone', 0.9], [4, 'slap', 1]] },
];

export interface PerformOptions { rhythm: HandRhythm; persona: PersonaTraits; mood: HandMood; role: HandRole; bars: 2 | 4; seed: number }

export function performHandDrum(o: PerformOptions): HandPerformance {
  const { rhythm: r, persona: p, role } = o;
  const m = MOOD[o.mood];
  const rand = rng(o.seed);
  const gauss = () => (rand() + rand() + rand() - 1.5) / 1.5;
  const barLen = r.meter === '2/4' ? 8 : 16;
  const barsOut = r.meter === '2/4' ? o.bars * 2 : o.bars;
  const total = barLen * barsOut;
  const length = (total <= 16 ? 16 : total <= 32 ? 32 : total <= 48 ? 48 : 64) as HandPerformance['length'];
  const written = cells(r, barLen);
  const phrase = r.meter === '2/4' ? 4 : 2; // bars per call/answer
  const out: PlayedStroke[] = [];
  const dens = clamp(p.density + m.density, -1, 1);
  const tight = clamp(p.tightness, 0, 1);
  const dyn = clamp(p.dynamics * m.dyn, 0, 1.4);
  const offbeatSwing = m.swing + p.swing * 0.5;

  const put = (bar: number, pos: number, stroke: SomaStroke, hand: 'R' | 'L', drum: number, velScale: number, accent: number) => {
    const at = bar * barLen + pos;
    let step = Math.floor(at + 0.5);
    let micro = at - step;
    // Feel: the player's pocket (beats → 16ths), the stroke's lean, a lilt on offbeat 16ths, human scatter.
    micro += p.pocket * 4 + m.pocket + LEAN[stroke] + (Math.abs((at % 2) - 1) < 0.01 ? offbeatSwing : 0) + gauss() * (1 - tight) * 0.11;
    if (micro > 0.45) { step += 1; micro -= 1; } else if (micro < -0.45 && step > 0) { step -= 1; micro += 1; }
    micro = clamp(micro, -0.45, 0.45);
    if (step >= length) return;
    // Slaps soften to tones in gentle moods and sharpen from tones in hot ones.
    let s = stroke;
    if (s === 'slap' && m.slap < 0 && rand() < -m.slap * 0.6) s = 'tone';
    else if (s === 'tone' && m.slap > 0 && accent > 0.5 && rand() < m.slap * 0.35) s = 'slap';
    const arc = 1 + m.arc * ((bar % 4) - 1.5);
    const v = BASE_VEL[s] * m.vel * velScale * arc * (1 + accent * 0.16 * dyn) + gauss() * (1 - tight) * 12;
    out.push({ step, micro: Math.round(micro * 1000) / 1000, stroke: s, hand, drum, vel: Math.round(clamp(v, 18, 127)) });
  };
  /** Accent from the beat structure: the downbeat, then beats, then the rest. */
  const accentAt = (pos: number) => (pos === 0 ? 1 : Math.abs(pos % 4) < 0.01 ? 0.6 : Math.abs(pos % 2) < 0.01 ? 0.25 : 0);

  const playGroove = (bar: number, sparse = 1, varyBar = true) => {
    const src = written[bar % written.length];
    const vary = varyBar && bar > 0 ? p.complexity * 0.3 * m.vary : 0;
    for (const c of src) {
      if (sparse < 1 && c.pos !== 0 && rand() > sparse) continue;
      if (c.pos !== 0 && rand() < p.space * 0.12 * m.vary) continue; // a breath
      let stroke = c.stroke;
      if (rand() < vary) stroke = stroke === 'tone' ? 'slap' : stroke === 'slap' ? 'tone' : stroke === 'heel' ? 'toe' : stroke;
      put(bar, c.pos, stroke, c.hand, c.drum, 1, accentAt(c.pos));
      // Flams on accents, for players who ornament.
      if (accentAt(c.pos) >= 0.6 && (stroke === 'slap' || stroke === 'tone') && rand() < p.complexity * 0.18 * m.vary) {
        put(bar, Math.max(0, c.pos - 0.2), stroke, other(c.hand), c.drum, 0.5, 0);
      }
    }
    // Ghost notes in the gaps — the conversation under the groove.
    const ghostP = clamp(0.06 + 0.22 * (dens + p.complexity - 0.4), 0, 0.5) * sparse;
    const taken = new Set(src.map((c) => Math.round(c.pos)));
    let hand: 'R' | 'L' = 'L';
    for (let s = 0; s < barLen; s++) {
      if (taken.has(s) || rand() > ghostP) continue;
      put(bar, s, 'tip', hand, 0, 0.62 + rand() * 0.15, 0);
      hand = other(hand);
    }
  };

  const playFill = (bar: number, from: number) => {
    const kind = Math.floor(rand() * 3);
    let hand: 'R' | 'L' = 'R';
    for (let s = from; s < barLen; s++) {
      const rise = 0.75 + 0.35 * ((s - from) / Math.max(1, barLen - from));
      if (kind === 0) put(bar, s, s % 2 ? 'tone' : 'slap', hand, 0, rise, s === from ? 0.6 : 0.2);
      else if (kind === 1) { put(bar, s, 'tip', hand, 0, rise * 0.8, 0); put(bar, s + 0.5, 'tip', other(hand), 0, rise * 0.75, 0); }
      else put(bar, s, s % 3 === 0 ? 'slap' : 'tone', hand, (s - from) % 4 < 2 ? 0 : 1, rise, s % 4 === 0 ? 0.5 : 0.1);
      hand = other(hand);
    }
  };

  const playSolo = (bar: number) => {
    // Call (first bar of the phrase) and answer (second): the answer reuses the call's first lick.
    const isAnswer = bar % phrase === phrase - 1;
    const climax = bar === barsOut - 1;
    let pos = 0;
    let first: typeof LICKS[number] | null = null;
    let hand: 'R' | 'L' = 'R';
    while (pos < barLen) {
      if (rand() < p.space * 0.35 && !climax && pos > 0) { pos += 2; continue; }
      const lick = isAnswer && first === null && rand() < 0.6 ? LICKS[(bar * 3) % LICKS.length] : LICKS[Math.floor(rand() * LICKS.length)];
      if (first === null) first = lick;
      if (pos + lick.len > barLen) { pos += 1; continue; }
      const drum = rand() < 0.65 ? 1 : 0; // a lead player lives on the high drum
      for (const [at, stroke, scale] of lick.notes) { put(bar, pos + at, stroke, hand, drum, scale * (climax ? 1.08 : 1), accentAt(pos + at)); hand = other(hand); }
      pos += lick.len;
    }
  };

  for (let bar = 0; bar < barsOut; bar++) {
    const phraseEnd = (bar + 1) % (phrase * 2) === 0 || bar === barsOut - 1;
    switch (role) {
      case 'groove': playGroove(bar); break;
      case 'fills':
        if (phraseEnd && rand() < 0.4 + p.fills * 0.6) { playGroove(bar, 1); out.splice(0, out.length, ...out.filter((x) => !(x.step >= bar * barLen + barLen / 2 && x.step < (bar + 1) * barLen))); playFill(bar, barLen / 2); }
        else playGroove(bar);
        break;
      case 'solo': playSolo(bar); break;
      case 'adlib':
        if (bar % phrase === phrase - 1) playSolo(bar);
        else put(bar, 0, 'bass', 'R', 0, 0.8, 1);
        break;
      case 'intro': playGroove(bar, Math.min(1, (bar + 1) / barsOut + 0.1), bar > barsOut / 2); if (bar === barsOut - 1) playFill(bar, barLen - 4); break;
      case 'break':
        if (bar < barsOut - 1) playGroove(bar);
        else { put(bar, 0, 'slap', 'R', 0, 1.15, 1); put(bar, 0, 'bass', 'L', -1, 1.1, 1); playFill(bar, barLen - 3); }
        break;
    }
  }
  out.sort((a, b) => a.step - b.step || a.micro - b.micro);
  return { length, strokes: out };
}
