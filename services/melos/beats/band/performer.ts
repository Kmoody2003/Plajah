// Chora Session Band — how each player plays one bar. Every bar is written fresh from the chords,
// the genre's idioms, the player's active personality and the producer's direction, and it listens
// to the band: the bass locks to the kick the drummer just played, comping thins out under a
// soloist, only one horn takes the pickup into the next phrase. Then it is played like a person:
// swing on the offbeats, the player's pocket ahead of or behind the grid, a little timing drift,
// accents and phrase dynamics, and the ornaments of their instrument (ghost notes, strums, bends,
// scoops, vibrato, trills, glissandos, falls).
//
// Pure and deterministic for a given seed — the session plays it live, the tests read it.

import type { NoteMpeExpression, OrchestralArticulation } from '../grooveDoc';
import { voiceChord } from '../council/rulesArranger';
import type { BandPlayer, Persona, PersonaTraits } from './roster';
import type { PlayerDirection } from './direction';
import { LEAD_SCALES, type DrumVoice, type GenreStyle } from './styles';

export interface FrameChord { at: number; beats: number; pcs: number[] }
export interface BarFrame {
  bar: number;
  beats: number;
  /** Chords inside this bar (offsets from the bar start). */
  chords: FrameChord[];
  /** The next bar's first chord — for approach notes and anticipations. */
  next: number[];
  keyPc: number;
  /** In-key pitch classes (index = pc). */
  scale: boolean[];
  minor: boolean;
  phrasePos: number;
  phraseLen: number;
  genre: GenreStyle;
  /** The band's energy here (0 … 1, a build ramps it). */
  energy: number;
  breakdown: boolean;
  seed: number;
}

/** What the band has already decided this bar (players are performed in band order). */
export interface BandShared {
  kicks: number[];
  soloist?: string;
  /** The one lead player taking the pickup into the next phrase. */
  pickup?: string;
  /** Someone is holding long chords (others can comp lighter). */
  padding: boolean;
  hornStabs?: number[];
}

export interface BandNote { at: number; len: number; key: number; vel: number; articulation?: OrchestralArticulation; expr?: NoteMpeExpression }
export interface BandHit { at: number; vel: number; voice: DrumVoice }
export interface PlayedBar { notes: BandNote[]; hits: BandHit[]; trace: string[] }

/** Per-player memory between bars (last voicing, motif, a crash owed after a fill …). */
export type PlayerMemory = Record<string, unknown>;

export interface Performance {
  player: BandPlayer;
  persona: Persona;
  dir: PlayerDirection;
  cue?: { fill?: boolean; hit?: boolean };
  mem: PlayerMemory;
}

// ── small tools ─────────────────────────────────────────────────────────────────────────────────

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const hashSeed = (...parts: (string | number)[]) => {
  let h = 2166136261;
  for (const ch of parts.join('|')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
};
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const nearestPc = (pc: number, target: number) => {
  const base = target - ((((target - pc) % 12) + 12) % 12);
  return target - base > 6 ? base + 12 : base;
};
const chordAt = (f: BarFrame, at: number) => [...f.chords].reverse().find((c) => c.at <= at + 1e-6) ?? f.chords[0];
const fit = (key: number, [lo, hi]: [number, number]) => { let k = key; while (k < lo) k += 12; while (k > hi) k -= 12; return clamp(k, lo, hi); };

export interface Feel {
  energy: number; density: number; dyn: number; pocket: number; jitter: number; swing: number;
  complexity: number; fills: number; register: number; brightness: number; space: number;
  sustain: boolean; short: boolean; traits: PersonaTraits;
}

/** The persona's traits + the producer's direction + the band's energy → how they play this bar. */
export function feelFor(p: Performance, f: BarFrame): Feel {
  const tr = p.persona.traits, d = p.dir;
  const energy = clamp(f.energy + tr.energy * 0.3 + d.energy * 0.35 - (f.breakdown ? 0.3 : 0), 0, 1);
  return {
    energy,
    density: clamp(tr.density + d.density + (energy - 0.5) * 0.8 - (f.breakdown ? 0.5 : 0), -1, 1),
    dyn: d.dynamics,
    pocket: tr.pocket + d.pocket * 0.03 + (d.feel === 'half' ? 0.006 : 0),
    jitter: (1 - tr.tightness) * 0.018,
    swing: clamp(f.genre.swing + tr.swing, 0, 1),
    complexity: clamp(tr.complexity + d.complexity * 0.4, 0, 1),
    fills: tr.fills,
    register: tr.register + d.octave * 12,
    brightness: d.brightness,
    space: clamp(tr.space - d.density * 0.3, 0, 1),
    sustain: d.sustain, short: d.short, traits: tr,
  };
}

/** Human time: swing on the offbeats, the player's pocket, a little drift. */
function humanAt(at: number, fe: Feel, f: BarFrame, r: () => number): number {
  let t = at;
  const frac = ((at % 1) + 1) % 1;
  if (f.genre.swingGrid === 8 && Math.abs(frac - 0.5) < 1e-3) t += fe.swing * (2 / 3 - 0.5);
  if (f.genre.swingGrid === 16 && (Math.abs(frac - 0.25) < 1e-3 || Math.abs(frac - 0.75) < 1e-3)) t += fe.swing * (1 / 3 - 0.25);
  if (f.genre.swingGrid === 8 && (Math.abs(frac - 0.25) < 1e-3 || Math.abs(frac - 0.75) < 1e-3)) t += fe.swing * 0.04;
  t += fe.pocket + (r() + r() + r() - 1.5) * fe.jitter;
  return Math.max(-0.06, t);
}

function velOf(base: number, fe: Feel, r: () => number, accent = 0): number {
  const spread = fe.traits.dynamics;
  return Math.round(clamp(base + fe.energy * 16 + fe.dyn * 18 + accent * (0.5 + spread) + (r() - 0.5) * spread * 12, 8, 127));
}

const vibrato = (depth = 0.18): NoteMpeExpression => ({ vibratoDepth: depth, vibratoRateHz: 5.4, vibratoDelay01: 0.35 });
const scoop = (semis = -1): NoteMpeExpression => ({ glideFromSemis: semis, glidePortion01: 0.18 });
const swell = (shape: 'hairpin' | 'crescendo' | 'arch' = 'hairpin'): NoteMpeExpression => ({ swellShape: shape, pressure: 0.85 });

/** Chord pitch classes with the colour the genre wants (7ths, 9ths, 11ths/13ths). */
export function colorChord(pcs: number[], color: number, bluesy: boolean): number[] {
  const root = pcs[0];
  const third = ((pcs[1] ?? root + 4) - root + 12) % 12;
  const out = [...pcs];
  const has = (iv: number) => out.some((pc) => (pc - root + 12) % 12 === iv);
  if (color >= 1 && out.length === 3) out.push((root + (third === 3 || bluesy ? 10 : 11)) % 12);
  if (color >= 2 && !has(2)) out.push((root + 2) % 12);
  if (color >= 3) out.push((root + (third === 3 ? 5 : 9)) % 12);
  return out;
}

function voicingFor(c: FrameChord, center: number, fe: Feel, f: BarFrame, mem: PlayerMemory, voices: number, rootless: boolean, colorBoost = 0): number[] {
  const bluesy = ['blues', 'funk', 'gospel', 'rock'].includes(f.genre.id);
  let pcs = colorChord(c.pcs, Math.min(3, f.genre.color + colorBoost + (fe.complexity > 0.7 ? 1 : 0)), bluesy);
  if (rootless && pcs.length >= 4) pcs = pcs.slice(1);
  const prev = mem.voicing as number[] | undefined;
  const v = voiceChord(pcs, center + Math.round(fe.brightness * 4), prev, Math.min(voices, pcs.length));
  mem.voicing = v;
  return v;
}

// ── drums ───────────────────────────────────────────────────────────────────────────────────────

function drums(p: Performance, f: BarFrame, band: BandShared, r: () => number): PlayedBar {
  const fe = feelFor(p, f);
  const hits: BandHit[] = [];
  const trace: string[] = [`groove:${f.genre.id}`];
  const steps = Math.round(f.beats * 4);
  const mode = p.persona.mode;
  const half = p.dir.feel === 'half', dbl = p.dir.feel === 'double';
  const grid = { ...f.genre.drums };
  if (!Object.keys(grid).length) return { notes: [], hits, trace: ['tacet: the genre has no kit'] };
  if (f.breakdown) { delete grid.snare; delete grid.clap; grid.kick = 'x.......x.......'; trace.push('breakdown'); }
  // Hats open up into 16ths or the ride as it drives; thin to quarters when it's quiet.
  if (grid.hatC && fe.energy > 0.7 && fe.density > 0.1 && !grid.hatC.includes('oo')) { grid.hatC = 'xooo'.repeat(4); trace.push('16th hats'); }
  if (grid.hatC && fe.energy < 0.28) { grid.hatC = 'o...'.repeat(4); trace.push('quarter hats'); }
  if (mode === 'big' && fe.energy > 0.72 && grid.hatC) { grid.ride = grid.hatC.replace(/o/g, 'o'); delete grid.hatC; trace.push('ride'); }

  const idx = (s: number) => (half ? Math.floor(s / 2) + (f.bar % 2) * 8 : dbl ? (s * 2) % 16 : s) % 16;
  const fill = !!p.cue?.fill || (f.phrasePos === f.phraseLen - 1 && r() < fe.fills * (0.35 + fe.energy * 0.6));
  const fillFrom = fill ? (fe.energy > 0.6 || mode !== 'tight' ? Math.max(0, steps - 8) : Math.max(0, steps - 4)) : steps;

  for (const [voice, g] of Object.entries(grid) as [DrumVoice, string][]) {
    for (let s = 0; s < Math.min(steps, fillFrom); s++) {
      let ch = g[idx(s)];
      if (half && voice === 'snare') ch = s === 8 ? 'x' : (g[idx(s)] === 'g' ? 'g' : '.');
      if (half && (voice === 'snare' || voice === 'clap') && s !== 8) continue;
      if (ch === '.' || ch === undefined) continue;
      const v = ch === 'x' ? 100 : ch === 'g' ? 34 : 80;
      const accent = s % 4 === 0 ? 8 : 0;
      const at = humanAt(s / 4, fe, f, r);
      // 'g' is a ghost stroke: on the snare it's the ghost pad, elsewhere a feathered hit (jazz kick).
      hits.push({ at, vel: ch === 'g' ? Math.round(clamp(v + (r() - 0.5) * 10, 18, 50)) : velOf(v - 16, fe, r, accent), voice: ch === 'g' && voice === 'snare' ? 'ghost' : voice });
    }
  }
  // Ghost notes: the Deacon talks between the backbeats; Clockwork barely does.
  const ghostP = mode === 'chops' ? 0.22 + fe.density * 0.25 : mode === 'tight' ? 0.04 : 0.1;
  if (grid.snare && !f.breakdown) {
    for (let s = 0; s < Math.min(steps, fillFrom); s++) {
      if (s % 2 === 0 || grid.snare[idx(s)] !== '.' || r() > ghostP) continue;
      hits.push({ at: humanAt(s / 4, fe, f, r), vel: Math.round(22 + r() * 18), voice: 'ghost' });
    }
    if (ghostP > 0.15) trace.push('ghost-notes');
  }
  // Kick variations when it's driving (a pickup kick before 3).
  if (grid.kick && fe.density > 0.35 && r() < fe.complexity * 0.6) {
    const s = 7;
    if (s < fillFrom && grid.kick[idx(s)] === '.') { hits.push({ at: humanAt(s / 4, fe, f, r), vel: velOf(62, fe, r), voice: 'kick' }); trace.push('kick variation'); }
  }
  // The crash owed from last bar's fill, or a band hit.
  if (p.mem.crash || p.cue?.hit || (f.phrasePos === 0 && mode === 'big' && fe.energy > 0.6)) {
    hits.push({ at: humanAt(0, fe, f, r), vel: velOf(92, fe, r, 10), voice: 'crash' });
    if (!hits.some((h) => h.voice === 'kick' && h.at < 0.05)) hits.push({ at: humanAt(0, fe, f, r), vel: velOf(90, fe, r, 8), voice: 'kick' });
    trace.push(p.cue?.hit ? 'band hit' : 'crash');
  }
  p.mem.crash = false;
  if (fill) {
    const n = steps - fillFrom;
    const kind = mode === 'big' ? 'toms' : mode === 'chops' ? 'linear' : 'snare';
    for (let k = 0; k < n; k++) {
      const s = fillFrom + k;
      const at = humanAt(s / 4, fe, f, r);
      const crescendo = 60 + (k / Math.max(1, n - 1)) * 40;
      if (kind === 'toms') hits.push({ at, vel: velOf(crescendo - 20, fe, r), voice: k < n / 2 ? 'tomH' : 'tomL' });
      else if (kind === 'linear') {
        hits.push({ at, vel: velOf(crescendo - 24, fe, r), voice: k % 3 === 2 ? 'kick' : k % 3 === 1 ? 'tomH' : 'snare' });
        if (k % 2 === 0 && fe.complexity > 0.6) hits.push({ at: at + 0.125, vel: Math.round(30 + r() * 15), voice: 'ghost' }); // 32nds
      } else hits.push({ at, vel: velOf(crescendo - 24, fe, r), voice: 'snare' });
    }
    if (grid.kick) hits.push({ at: humanAt(fillFrom / 4, fe, f, r), vel: velOf(70, fe, r), voice: 'kick' });
    p.mem.crash = true;
    trace.push(`fill:${kind}`);
  }
  if (half) trace.push('half-time'); if (dbl) trace.push('double-time');
  band.kicks = hits.filter((h) => h.voice === 'kick').map((h) => Math.max(0, Math.round(h.at * 4) / 4)).sort((a, b) => a - b);
  return { notes: [], hits, trace };
}

// ── percussion (SOMA — low keys = bigger drum / open tones, high = slaps) ───────────────────────

function percussion(p: Performance, f: BarFrame, band: BandShared, r: () => number): PlayedBar {
  const fe = feelFor(p, f);
  const notes: BandNote[] = [];
  const trace: string[] = [];
  const LOW = 48, MID = 55, HIGH = 62, SLAP = 67;
  const add = (at: number, key: number, base: number, len = 0.2) => notes.push({ at: humanAt(at, fe, f, r), len, key, vel: velOf(base, fe, r, at % 1 === 0 ? 6 : 0) });
  if (f.genre.id === 'classical') {
    // Timpani: the chord's root on the downbeat, a roll into the phrase end.
    const c = f.chords[0];
    const root = nearestPc(c.pcs[0], 45);
    add(0, root, 74, 1);
    if (f.phrasePos === f.phraseLen - 1) for (let t = f.beats - 1; t < f.beats - 1e-6; t += 0.125) add(t, nearestPc(f.next[0] ?? c.pcs[0], 45), 40 + (t - f.beats + 1) * 50, 0.12);
    return { notes, hits: [], trace: ['timpani on the root'] };
  }
  if (f.genre.id === 'cinematic') {
    add(0, LOW, 96, 1); if (fe.energy > 0.5) add(f.beats / 2 + 0.5, MID, 76, 0.5);
    if (f.phrasePos === f.phraseLen - 1) for (let t = f.beats - 1; t < f.beats - 1e-6; t += 0.25) add(t, HIGH, 60 + (t - f.beats + 1) * 40);
    return { notes, hits: [], trace: ['taiko hits'] };
  }
  const mode = p.persona.mode;
  if (mode === 'tumbao') {
    // Heel-toe, slap on 2, open tones on 4 and the and of 4.
    for (let beat = 0; beat + 4 <= f.beats + 1e-6 || beat === 0; beat += 4) {
      const cell: [number, number, number][] = [[0, MID - 2, 44], [0.5, MID - 2, 40], [1, SLAP, 86], [1.5, MID - 2, 42], [2, MID - 2, 44], [2.5, MID - 2, 40], [3, LOW + 7, 80], [3.5, LOW + 7, 78]];
      for (const [t, k, v] of cell) if (beat + t < f.beats - 1e-6) add(beat + t, k, v);
      if (f.beats < 4) break;
    }
    if (fe.density > 0.3) for (let t = 0.25; t < f.beats; t += 1) if (r() < fe.density * 0.4) add(t, HIGH, 50);
    trace.push('tumbao: slap on two, open tones on four');
  } else if (mode === 'poly') {
    // Three against four on the high drum over a 12/8 bell feel on the low.
    for (let k = 0; k < 3 * Math.round(f.beats / 4 || 1); k++) add((k * 4) / 3, HIGH, 80);
    for (const k of [0, 2, 4, 5, 7, 9, 11]) { const t = k / 3; if (t < f.beats - 1e-6) add(t, SLAP, 56); }
    add(0, LOW, 88, 0.5); if (f.beats >= 3) add(2, LOW, 76, 0.5);
    trace.push('three-against-four polyrhythm');
  } else {
    // Texture: light 16ths, accents on the offbeats.
    for (let t = 0; t < f.beats - 1e-6; t += fe.density > -0.2 ? 0.25 : 0.5) {
      if (r() < fe.space * 0.5) continue;
      add(t, t % 0.5 ? HIGH : SLAP, t % 1 === 0.5 ? 46 : 30, 0.1);
    }
    trace.push('shaker texture');
  }
  if (p.cue?.fill || (f.phrasePos === f.phraseLen - 1 && r() < fe.fills * 0.5)) {
    for (let t = f.beats - 1; t < f.beats - 1e-6; t += 0.25) add(t, t % 0.5 ? HIGH : MID, 64 + (t - f.beats + 1) * 30);
    trace.push('conga run');
  }
  void band;
  return { notes, hits: [], trace };
}

// ── bass ────────────────────────────────────────────────────────────────────────────────────────

function bass(p: Performance, f: BarFrame, band: BandShared, r: () => number): PlayedBar {
  const fe = feelFor(p, f);
  const notes: BandNote[] = [];
  const trace: string[] = [];
  const range = p.player.range;
  const home = 36 + fe.register;
  let style = f.genre.bass;
  const mode = p.persona.mode;
  if (mode === 'walking' && !['808', 'house'].includes(style)) style = 'walking';
  if (mode === 'funk' && ['root8', 'rootFifth', 'melodic', 'afro'].includes(style)) style = 'funk';
  if (f.breakdown || fe.sustain) style = 'sustain';
  if (p.dir.feel === 'half' && style !== 'sustain') style = 'rootFifth';
  trace.push(`bass:${style}`);
  const scalePcs = f.scale.map((on, pc) => (on ? pc : -1)).filter((x) => x >= 0);
  const add = (at: number, len: number, key: number, base: number, extra: Partial<BandNote> = {}) =>
    notes.push({ at: humanAt(at, fe, f, r), len: Math.max(0.1, fe.short ? Math.min(len, 0.35) : len), key: fit(key, range), vel: velOf(base, fe, r, Math.abs(at % 1) < 1e-6 ? 8 : 0), ...extra });

  for (const [ci, c] of f.chords.entries()) {
    const root = fit(nearestPc(c.pcs[0], home), range);
    const fifth = root + 7 <= range[1] ? root + 7 : root - 5;
    const third = fit(nearestPc(c.pcs[1] ?? c.pcs[0], root + 4), range);
    const nextPcs = f.chords[ci + 1]?.pcs ?? f.next;
    const nextRoot = fit(nearestPc(nextPcs[0] ?? c.pcs[0], root), range);
    const end = c.at + c.beats;
    switch (style) {
      case 'sustain':
        add(c.at, c.beats * 0.98, root, 70, { articulation: 'legato' });
        break;
      case 'root8': {
        const step = fe.energy < 0.35 ? 1 : 0.5;
        for (let t = c.at; t < end - 1e-6; t += step) {
          const last = t + step >= end - 1e-6;
          const key = last && fe.complexity > 0.45 && r() < 0.5 ? (r() < 0.5 ? fifth : nextRoot + (nextRoot > root ? -1 : 1)) : root;
          add(t, step * 0.85, key, t === c.at ? 80 : 68);
        }
        break;
      }
      case 'rootFifth':
        if (f.genre.id === 'bossa') for (let t = c.at; t < end - 1e-6; t += 2) { add(t, 1.4, root, 74); if (t + 1.5 < end) add(t + 1.5, 0.45, fifth, 66); }
        else { add(c.at, Math.min(2, c.beats) * 0.9, root, 78); if (c.beats > 2) add(c.at + 2, (c.beats - 2) * 0.9, fifth, 70); }
        break;
      case 'walking': {
        const beats = Math.max(1, Math.round(c.beats));
        let cur = root;
        for (let b = 0; b < beats; b++) {
          let key: number;
          if (b === 0) key = root;
          else if (b === beats - 1) key = nextRoot + (r() < 0.5 ? -1 : 1);         // chromatic approach
          else {
            const tones = [third, fifth, root + 12, ...scalePcs.map((pc) => nearestPc(pc, cur))];
            const pool = tones.filter((k) => Math.abs(k - cur) <= 5 && k !== cur);
            key = pool[Math.floor(r() * pool.length)] ?? fifth;
          }
          cur = fit(key, range);
          add(c.at + b, 0.92, cur, b === 0 ? 76 : 70);
          // A swung skip note now and then.
          if (b > 0 && b < beats - 1 && r() < fe.complexity * 0.18) add(c.at + b + 2 / 3, 0.25, cur, 48);
        }
        trace.push('chromatic approach on four');
        break;
      }
      case 'funk': {
        const kicks = band.kicks.filter((k) => k >= c.at - 1e-6 && k < end - 1e-6);
        const hitsAt = kicks.length ? kicks : [c.at, c.at + 1.5, c.at + 2.75].filter((t) => t < end);
        for (const [i, t] of hitsAt.entries()) {
          const key = i === 0 ? root : r() < 0.35 + fe.complexity * 0.3 ? root + 12 : r() < 0.5 ? fifth : fit(root + 10, range);
          add(t, 0.3, key, i === 0 ? 92 : 76, key === root + 12 ? { expr: scoop(-0.5) } : {});
        }
        // Dead notes on the 16ths.
        for (let t = c.at + 0.25; t < end - 1e-6; t += 0.5) if (r() < 0.15 + fe.density * 0.3 && !hitsAt.some((h) => Math.abs(h - t) < 0.2)) add(t, 0.08, root, 28);
        trace.push('locked to the kick', 'octave pops');
        break;
      }
      case '808': {
        const kicks = band.kicks.filter((k) => k >= c.at - 1e-6 && k < end - 1e-6);
        const at = kicks.length ? kicks : [c.at];
        let prev = (p.mem.last808 as number | undefined) ?? root;
        for (const [i, t] of at.entries()) {
          const len = (at[i + 1] ?? end) - t;
          const key = i > 0 && r() < 0.3 ? root + 12 : root;
          add(t, len * 0.95, key, 90, key !== prev && Math.abs(key - prev) <= 12 ? { expr: { glideFromSemis: prev - key, glidePortion01: 0.2 } } : {});
          prev = key;
        }
        p.mem.last808 = prev;
        trace.push('808 slides');
        break;
      }
      case 'reggae':
        for (const [t, k, len] of [[0.5, root, 0.4], [1, root, 0.8], [2.5, fifth, 0.4], [3, third, 0.4], [3.5, root, 0.4]] as [number, number, number][]) if (c.at + t < end - 1e-6) add(c.at + t, len, k, 80);
        trace.push('one drop: the bass leaves beat one open');
        break;
      case 'tumbao':
        if (c.at + 1.5 < end) add(c.at + 1.5, 1.4, fifth, 82);
        if (c.at + 3 < end) add(c.at + 3, 1.4, nextRoot, 86);
        trace.push('tumbao: anticipates the next chord on four');
        break;
      case 'house':
        for (let t = c.at + 0.5; t < end - 1e-6; t += 1) add(t, 0.4, fe.energy > 0.7 && (t - c.at) % 2 > 1 ? root + 12 : root, 84);
        trace.push('offbeat house bass');
        break;
      case 'afro':
        for (const [t, k] of [[0, root], [0.75, root], [1.5, fifth], [2.5, root + 12], [3, root], [3.5, fit(root + 10, range)]] as [number, number][]) if (c.at + t < end - 1e-6 && (t === 0 || r() < 0.55 + fe.density * 0.4)) add(c.at + t, 0.35, k, t === 0 ? 88 : 74);
        break;
      case 'melodic':
      default: {
        add(c.at, Math.min(1.5, c.beats), root, 82);
        if (c.beats >= 2) add(c.at + 1.5, 0.45, r() < 0.5 ? fifth : third, 70);
        if (c.beats >= 3) add(c.at + 2, 0.9, fifth, 72);
        // Walk-up into the next chord.
        if (c.beats >= 4 && nextRoot !== root) {
          const dir = nextRoot > root ? 1 : -1;
          const path = scalePcs.map((pc) => nearestPc(pc, nextRoot)).filter((k) => (k - nextRoot) * dir < 0 && Math.abs(k - nextRoot) <= 5).sort((a, b) => (a - b) * dir).slice(-3);
          path.forEach((k, i) => add(end - (path.length - i) * 0.33, 0.3, k, 66 + i * 4));
          if (path.length) trace.push('walk-up into the change');
        }
      }
    }
  }
  return { notes, hits: [], trace };
}

// ── comping: piano / guitar / organ / synth / orchestra / woodwind section ──────────────────────

function strumNotes(v: number[], at: number, len: number, down: boolean, base: number, fe: Feel, f: BarFrame, r: () => number, out: BandNote[]) {
  const order = down ? v : [...v].reverse();
  const strings = down ? order : order.slice(0, Math.max(2, order.length - 2));
  strings.forEach((key, i) => out.push({ at: humanAt(at, fe, f, r) + i * (0.012 + (1 - fe.traits.tightness) * 0.02), len, key, vel: velOf(base - (down ? 0 : 14) - i * 2, fe, r) }));
}

function comp(p: Performance, f: BarFrame, band: BandShared, r: () => number, opts: { center: number; voices: number; style?: string; rootless?: boolean; color?: number }): PlayedBar {
  const fe = feelFor(p, f);
  const notes: BandNote[] = [];
  const trace: string[] = [];
  const range = p.player.range;
  const center = opts.center + fe.register;
  let style = opts.style ?? f.genre.comp;
  if (fe.sustain || f.breakdown) style = 'pad';
  if (fe.short && style === 'pad') style = 'stabs';
  // Under a soloist the comping thins.
  const thin = band.soloist && band.soloist !== p.player.id ? 0.35 : 0;
  const push = (at: number, len: number, keys: number[], base: number, extra: Partial<BandNote> = {}) => {
    const t = humanAt(at, fe, f, r);
    keys.forEach((k, i) => notes.push({ at: t + (fe.traits.ornaments.includes('roll') ? i * 0.01 : 0), len: Math.max(0.08, len), key: fit(k, range), vel: velOf(base - i * 2, fe, r, at % 1 === 0 ? 6 : 0), ...extra }));
  };
  trace.push(`comp:${style}`);
  for (const c of f.chords) {
    const v = voicingFor(c, center, fe, f, p.mem, opts.voices, !!opts.rootless, opts.color ?? 0);
    const end = c.at + c.beats;
    switch (style) {
      case 'pad':
        push(c.at, c.beats * 0.98, v, 58, { articulation: p.persona.traits.articulation ?? 'legato', expr: swell(fe.energy > 0.5 ? 'crescendo' : 'hairpin') });
        band.padding = true;
        break;
      case 'block': {
        const hits = fe.energy < 0.4 ? [[0, c.beats]] : fe.energy < 0.68 ? [[0, c.beats / 2], [c.beats / 2, c.beats / 2]] : Array.from({ length: Math.round(c.beats * 2) }, (_, i) => [i * 0.5, 0.42]);
        for (const [t, len] of hits) if (r() > thin || t === 0) push(c.at + t, len * 0.92, v, t === 0 ? 70 : 60);
        break;
      }
      case 'stabs': {
        const slots = [0.5, 1.5, 2.5, 3.5, 0.75, 2.75].filter((t) => t < c.beats);
        const n = Math.max(1, Math.round(2 + fe.density * 1.5));
        const pick = f.genre.id === 'house' ? slots.slice(0, 4) : slots.filter(() => r() < n / slots.length);
        if (!pick.length) pick.push(slots[0] ?? 0);
        for (const t of pick) if (r() > thin) push(c.at + t, 0.22, v, 72, { articulation: 'staccato' });
        trace.push('offbeat stabs');
        break;
      }
      case 'strum': {
        const pattern: [number, boolean][] = fe.energy < 0.35 ? [[0, true], [2, true]] : [[0, true], [1, true], [1.5, false], [2.5, false], [3, true], [3.5, false]];
        for (const [t, down] of pattern) if (t < c.beats && (r() > thin || t === 0)) strumNotes(v, c.at + t, (down ? 0.9 : 0.45), down, 76, fe, f, r, notes);
        trace.push('down-up strum');
        break;
      }
      case 'power': {
        const root = fit(nearestPc(c.pcs[0], 40 + fe.register), range);
        const pw = [root, root + 7, root + 12];
        if (fe.energy < 0.45) push(c.at, c.beats * 0.95, pw, 80);
        else for (let t = 0; t < c.beats - 1e-6; t += 0.5) push(c.at + t, 0.3, pw, t % 1 === 0 ? 88 : 72, t % 1 ? { articulation: 'staccato' } : {});
        trace.push(fe.energy < 0.45 ? 'power chords ring' : 'palm-muted eighths');
        break;
      }
      case 'arpeggio': {
        const step = fe.energy > 0.62 ? 0.25 : p.persona.mode === 'glass' ? 0.75 : 0.5;
        const seq = [...v, v[1] + 12, v[2] + 12, ...v.slice(1).reverse()];
        let k = 0;
        for (let t = 0; t < c.beats - 1e-6; t += step, k++) {
          if (r() < fe.space * 0.3 && k % 4 === 3) continue;
          notes.push({ at: humanAt(c.at + t, fe, f, r), len: p.persona.mode === 'midnight' ? Math.min(2, c.beats - t) : step * 0.9, key: fit(seq[k % seq.length], range), vel: velOf(k % 4 ? 54 : 66, fe, r) });
        }
        trace.push(step === 0.75 ? 'dotted-eighth arpeggio' : 'arpeggio');
        break;
      }
      case 'montuno': {
        // Two-bar piano guajeo: offbeat octaves of the chord's top notes.
        const top = [...v].sort((a, b) => b - a);
        const cell = f.bar % 2 ? [0, 0.5, 1.5, 2, 3, 3.5] : [0.5, 1, 2, 2.5, 3.5];
        for (const [i, t] of cell.entries()) if (t < c.beats) { const k = top[i % 2]; push(c.at + t, 0.4, [k, k - 12], 74); }
        trace.push('montuno');
        break;
      }
      case 'skank':
        for (const t of [1, 3]) if (t < c.beats) push(c.at + t, 0.2, v, 72, { articulation: 'staccato' });
        trace.push('skank on two and four');
        break;
      case 'gospel': {
        push(c.at, Math.min(1.4, c.beats), v, 74, { expr: swell('hairpin') });
        if (c.beats >= 3) push(c.at + 1.5, 0.4, v, 66);
        if (c.beats >= 4) push(c.at + 2.5, 0.9, v, 70);
        // Passing chord: the whole voicing a half step below the next chord, on the and of four.
        const nx = (f.chords[f.chords.indexOf(c) + 1]?.pcs ?? f.next);
        if (c.beats >= 4 && nx.length && fe.complexity > 0.45) {
          const nv = voiceChord(colorChord(nx, f.genre.color, true), center, v, opts.voices);
          push(end - 0.5, 0.45, nv.map((k) => k - 1), 64);
          trace.push('passing chord into the change');
        }
        break;
      }
      case 'chop': {
        // Funk guitar scratch: muted 16ths, accented chord on a few of them.
        const small = v.slice(-3);
        for (let t = 0; t < c.beats - 1e-6; t += 0.25) {
          const accent = [0.75, 1.5, 2.75, 3.25].some((a) => Math.abs(a - t) < 1e-6);
          if (accent) strumNotes(small, c.at + t, 0.15, t % 0.5 === 0, 84, fe, f, r, notes);
          else if (r() < 0.55 + fe.density * 0.3 && r() > thin) strumNotes(small, c.at + t, 0.06, t % 0.5 === 0, 30, fe, f, r, notes);
        }
        trace.push('chicken-scratch sixteenths');
        break;
      }
      case 'swing': {
        // Charleston-ish comping, re-voiced every chord, sparse under a soloist.
        const hits = r() < 0.5 ? [[0, 0.75], [1.5, 0.5]] : [[0.5, 0.5], [2.5, 0.75]];
        if (c.beats >= 4 && r() < fe.density * 0.6) hits.push([3.5, 0.4]);
        for (const [t, len] of hits) if (t < c.beats && r() > thin) push(c.at + t, len, v, 62);
        trace.push('rootless voicings, Charleston comping');
        break;
      }
      case 'bossa': {
        const cell = [0, 0.75, 1.5, 2.5, 3.25].filter((t) => t < c.beats);
        for (const t of cell) push(c.at + t, 0.45, v.slice(-3), 60);
        trace.push('bossa guitar rhythm');
        break;
      }
    }
  }
  return { notes, hits: [], trace };
}

// ── lines: solos, fills, counter-melodies, ostinatos ────────────────────────────────────────────

function scaleFor(f: BarFrame, c: FrameChord): number[] {
  const lead = f.genre.lead;
  if (lead === 'key') return f.scale.map((on, pc) => (on ? pc : -1)).filter((x) => x >= 0);
  const tonic = lead === 'pent' || lead === 'blues' || lead === 'harmonic' ? (f.minor ? f.keyPc : (lead === 'blues' ? f.keyPc : f.keyPc)) : c.pcs[0];
  const set = lead === 'pent' && !f.minor ? LEAD_SCALES.pent : lead === 'pent' ? [0, 3, 5, 7, 10] : LEAD_SCALES[lead];
  return set.map((iv) => (tonic + iv) % 12);
}

function scaleNotes(pcs: number[], lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let k = lo; k <= hi; k++) if (pcs.includes(k % 12)) out.push(k);
  return out;
}

/** An improvised line — a full solo when featured, otherwise a pickup into the next phrase. */
function line(p: Performance, f: BarFrame, band: BandShared, r: () => number, center: number, solo: boolean): PlayedBar {
  const fe = feelFor(p, f);
  const notes: BandNote[] = [];
  const trace: string[] = [solo ? 'solo' : 'pickup'];
  const orn = fe.traits.ornaments;
  const [lo, hi] = p.player.range;
  const home = clamp(center + fe.register, lo + 5, hi - 5);
  // Where in the bar the line plays: everything when soloing (minus breaths), the tail otherwise.
  const from = solo ? (f.phrasePos === 0 && r() < fe.space ? 0.5 : 0) : Math.max(0, f.beats - (fe.energy > 0.6 ? 2 : 1.5));
  const to = solo && f.phrasePos === f.phraseLen - 1 ? f.beats - 0.5 - fe.space : f.beats;
  // Rhythm cells (beats). Busier players reach for sixteenths and triplets.
  const cells: number[][] = fe.density > 0.35 ? [[0.25, 0.25, 0.25, 0.25], [1 / 3, 1 / 3, 1 / 3], [0.5, 0.25, 0.25], [0.5, 0.5]]
    : fe.density > -0.2 ? [[0.5, 0.5], [0.75, 0.25], [1], [1 / 3, 1 / 3, 1 / 3], [0.5, 0.25, 0.25]]
      : [[1], [1.5, 0.5], [2], [0.5, 0.5], [1, 1]];
  const motif = (p.mem.motif as number[][] | undefined) && f.phrasePos % 2 === 1 ? (p.mem.motif as number[][]) : null;
  const rhythm: number[][] = [];
  let t = from;
  while (t < to - 1e-6) {
    const cell = motif?.[rhythm.length] ?? cells[Math.floor(r() * cells.length)];
    rhythm.push(cell);
    t += cell.reduce((a, b) => a + b, 0);
  }
  if (!motif) p.mem.motif = rhythm;
  else trace.push('motif repeated, developed');

  let cur = (p.mem.lineAt as number | undefined) ?? home;
  let dirn = cur > home + 5 ? -1 : 1;
  t = from;
  for (const cell of rhythm) for (const d of cell) {
    if (t >= to - 1e-6) break;
    const c = chordAt(f, t);
    const pool = scaleNotes(scaleFor(f, c), lo, hi);
    const strong = Math.abs(t % 1) < 1e-6;
    // Rest now and then — players breathe.
    if (!strong && r() < fe.space * 0.25) { t += d; continue; }
    let i = pool.findIndex((k) => k >= cur);
    if (i < 0) i = pool.length - 1;
    const stepBy = r() < 0.75 ? 1 : 2;
    i = clamp(i + dirn * stepBy, 0, pool.length - 1);
    let key = pool[i];
    if (key > home + 9 || key >= hi - 2) dirn = -1;
    if (key < home - 7 || key <= lo + 2) dirn = 1;
    if (r() < 0.12) dirn = -dirn;
    // Land chord tones on the beat (bebop players enclose them first).
    if (strong) {
      const tones = c.pcs.map((pc) => nearestPc(pc, key));
      const target = tones.sort((a, b) => Math.abs(a - key) - Math.abs(b - key))[0];
      if (fe.complexity > 0.75 && orn.includes('grace') && d >= 0.5) {
        notes.push({ at: humanAt(t, fe, f, r) - 0.12, len: 0.1, key: fit(target + 1, [lo, hi]), vel: velOf(52, fe, r) });
        trace.push('enclosure');
      }
      key = target;
    }
    key = fit(key, [lo, hi]);
    const len = Math.max(0.1, d * (fe.short ? 0.5 : 0.92));
    const n: BandNote = { at: humanAt(t, fe, f, r), len, key, vel: velOf(strong ? 72 : 62, fe, r, strong ? 6 : 0) };
    if (p.persona.traits.articulation) n.articulation = p.persona.traits.articulation;
    if (len >= 0.9 && orn.includes('vibrato')) n.expr = vibrato();
    if (orn.includes('scoop') && strong && r() < 0.35) { n.expr = { ...n.expr, ...scoop(-1) }; trace.push('scoop'); }
    if (orn.includes('bend') && len >= 0.45 && r() < 0.3) { n.expr = { ...n.expr, glideFromSemis: -2, glidePortion01: 0.3 }; trace.push('bend'); }
    if (orn.includes('growl') && r() < 0.25) { n.expr = { ...n.expr, bowBreath01: 0.75 }; trace.push('growl'); }
    if (orn.includes('trill') && len >= 0.9 && r() < 0.3) {
      // Trill: alternate with the step above for the note's length.
      const up = pool.find((k) => k > key) ?? key + 2;
      for (let s = 0; s < len - 0.06; s += 0.125) notes.push({ at: n.at + s, len: 0.11, key: s % 0.25 ? up : key, vel: n.vel - 6 });
      trace.push('trill');
      t += d; cur = key; continue;
    }
    notes.push(n);
    if (orn.includes('doubleStop') && strong && r() < 0.4) { notes.push({ ...n, key: fit(key - (c.pcs.includes((key - 3 + 12) % 12) ? 3 : 4), [lo, hi]) }); trace.push('double stop'); }
    cur = key;
    t += d;
  }
  // The last note of a phrase: hold it, maybe fall off it.
  const last = notes[notes.length - 1];
  if (last && f.phrasePos === f.phraseLen - 1 && solo) {
    last.len = Math.max(last.len, Math.min(1.5, f.beats - last.at));
    if (orn.includes('fall')) { last.expr = { ...last.expr, curvePoints: [{ t: 0, bend: 0 }, { t: 0.7, bend: 0 }, { t: 1, bend: -0.25 }] }; trace.push('fall'); }
  }
  p.mem.lineAt = cur;
  if (!solo) band.pickup = p.player.id;
  return { notes, hits: [], trace };
}

/** Long guide tones (3rds and 7ths) that answer the melody — strings and winds singing underneath. */
function guideLine(p: Performance, f: BarFrame, r: () => number, center: number, art: OrchestralArticulation = 'legato'): PlayedBar {
  const fe = feelFor(p, f);
  const notes: BandNote[] = [];
  let cur = (p.mem.guide as number | undefined) ?? center + fe.register;
  for (const c of f.chords) {
    const guides = [c.pcs[1], c.pcs[3] ?? c.pcs[2]].filter((x) => x !== undefined) as number[];
    const half = c.beats >= 4 && fe.density > -0.3 ? c.beats / 2 : c.beats;
    for (let t = 0, i = 0; t < c.beats - 1e-6; t += half, i++) {
      cur = fit(nearestPc(guides[i % guides.length], Math.round(cur * 0.6 + (center + fe.register) * 0.4)), p.player.range);
      notes.push({ at: humanAt(c.at + t, fe, f, r), len: half * 0.97, key: cur, vel: velOf(58, fe, r), articulation: art, expr: { ...vibrato(0.16), ...swell('arch') } });
    }
  }
  p.mem.guide = cur;
  return { notes, hits: [], trace: ['guide tones: thirds and sevenths'] };
}

/** A repeating figure (root, fifth, octave) — cellos and the section's engine room. */
function ostinato(p: Performance, f: BarFrame, r: () => number, center: number): PlayedBar {
  const fe = feelFor(p, f);
  const notes: BandNote[] = [];
  const step = fe.energy > 0.72 ? 0.25 : 0.5;
  for (const c of f.chords) {
    const root = fit(nearestPc(c.pcs[0], center + fe.register), p.player.range);
    const fig = [root, root + 7, root + 12, root + 7];
    let k = 0;
    for (let t = 0; t < c.beats - 1e-6; t += step, k++) notes.push({ at: humanAt(c.at + t, fe, f, r), len: step * 0.6, key: fit(fig[k % fig.length], p.player.range), vel: velOf(k % 4 === 0 ? 74 : 62, fe, r), articulation: 'spiccato' });
  }
  return { notes, hits: [], trace: ['spiccato ostinato'] };
}

// ── who plays what ──────────────────────────────────────────────────────────────────────────────

const HORN_GENRES = new Set(['funk', 'soul', 'salsa', 'afrobeat', 'gospel']);

/** One bar from one player. */
export function playBar(p: Performance, f: BarFrame, band: BandShared): PlayedBar {
  const r = rng(hashSeed(p.player.id, f.bar, f.seed));
  if (!p.dir.in) return { notes: [], hits: [], trace: ['laying out'] };
  const featured = band.soloist === p.player.id;
  const mode = p.persona.mode;
  const wantsPickup = () => !band.soloist && !band.pickup && (f.phrasePos % 2 === 1 || !!p.cue?.fill) && r() < p.persona.traits.fills * 0.8 + (p.cue?.fill ? 1 : 0);
  let out: PlayedBar;
  switch (p.player.role) {
    case 'drums': out = drums(p, f, band, r); break;
    case 'percussion': out = percussion(p, f, band, r); break;
    case 'bass': out = bass(p, f, band, r); break;
    case 'piano':
      if (featured) out = line(p, f, band, r, 72, true);
      else if (mode === 'juke') out = stride(p, f, band, r);
      else out = comp(p, f, band, r, { center: 62, voices: 4, rootless: f.genre.color >= 2 && mode === 'professor', style: mode === 'midnight' ? 'arpeggio' : f.genre.comp === 'chop' ? 'stabs' : f.genre.comp === 'power' ? 'block' : undefined, color: mode === 'professor' ? 1 : 0 });
      break;
    case 'guitar':
      if (featured) out = line(p, f, band, r, 67, true);
      else {
        out = comp(p, f, band, r, { center: 60, voices: 5, style: mode === 'glass' ? 'arpeggio' : mode === 'fire' && f.genre.comp !== 'chop' ? 'power' : ['pad', 'gospel', 'swing'].includes(f.genre.comp) ? 'strum' : f.genre.comp === 'montuno' ? 'strum' : undefined });
        if (mode !== 'glass' && wantsPickup()) out = merge(out, line(p, f, band, r, 69, false));
      }
      break;
    case 'organ':
      if (featured) out = line(p, f, band, r, 72, true);
      else if (mode === 'cathedral') out = chorale(p, f, band, r);
      else {
        out = comp(p, f, band, r, { center: 62, voices: 4, style: mode === 'sanctuary' ? (feelFor(p, f).energy > 0.72 ? 'stabs' : 'pad') : f.genre.comp === 'power' ? 'pad' : f.genre.comp === 'chop' ? 'stabs' : undefined });
        if (mode === 'sanctuary' && f.phrasePos === f.phraseLen - 1) out = merge(out, gliss(p, f, r));
      }
      break;
    case 'synth':
      if (featured) out = line(p, f, band, r, 72, true);
      else if (mode === 'lab') out = labSequence(p, f, r);
      else out = comp(p, f, band, r, { center: 64, voices: 4, style: mode === 'neon' ? 'arpeggio' : mode === 'club' ? (feelFor(p, f).energy > 0.55 ? 'stabs' : 'pad') : undefined });
      break;
    case 'orchestra':
      if (mode === 'pulse') out = merge(ostinato(p, f, r, 48), feelFor(p, f).energy > 0.7 ? comp(p, f, band, r, { center: 64, voices: 5, style: 'stabs' }) : empty());
      else if (mode === 'chamber') out = comp(p, f, band, r, { center: 60, voices: 4, style: 'pad' });
      else out = merge(comp(p, f, band, r, { center: 58, voices: 5, style: 'pad' }), guideLine(p, f, r, 79));
      break;
    case 'cello':
      if (featured) out = line(p, f, band, r, 57, true);
      else if (mode === 'engine') out = ostinato(p, f, r, 43);
      else if (mode === 'lantern') out = lantern(p, f, r);
      else out = guideLine(p, f, r, 55);
      break;
    case 'violin':
      if (featured) out = line(p, f, band, r, 79, true);
      else if (mode === 'silk') out = guideLine(p, f, r, 79);
      else if (mode === 'fiddle' && f.genre.id === 'country') out = merge(fiddleChop(p, f, r), wantsPickup() ? line(p, f, band, r, 76, false) : empty());
      else out = wantsPickup() ? line(p, f, band, r, 81, false) : guideLine(p, f, r, 76, mode === 'prima' ? 'legato' : 'legato');
      break;
    case 'woodwinds':
      if (featured) out = line(p, f, band, r, 79, true);
      else if (mode === 'reeds') out = comp(p, f, band, r, { center: 72, voices: 3, style: 'pad' });
      else out = wantsPickup() ? line(p, f, band, r, 81, false) : empty('waiting for a gap');
      break;
    case 'trumpet': case 'sax':
      if (featured) out = line(p, f, band, r, p.player.role === 'sax' ? 64 : 70, true);
      else if (HORN_GENRES.has(f.genre.id) || mode === 'fanfare') out = hornSection(p, f, band, r);
      else out = wantsPickup() ? line(p, f, band, r, p.player.role === 'sax' ? 64 : 70, false) : empty('waiting for a gap');
      break;
  }
  if (p.cue?.hit && p.player.role !== 'drums') {
    const c = f.chords[0];
    const v = voiceChord(c.pcs, (p.player.range[0] + p.player.range[1]) / 2, undefined, p.player.role === 'bass' ? 1 : 3);
    out = merge(out, { notes: v.map((key) => ({ at: 0, len: 0.4, key: fit(key, p.player.range), vel: 104, articulation: 'marcato' as const })), hits: [], trace: ['band hit'] });
  }
  return out;
}

const empty = (why = ''): PlayedBar => ({ notes: [], hits: [], trace: why ? [why] : [] });
const merge = (a: PlayedBar, b: PlayedBar): PlayedBar => ({ notes: [...a.notes, ...b.notes], hits: [...a.hits, ...b.hits], trace: [...a.trace, ...b.trace] });

function stride(p: Performance, f: BarFrame, band: BandShared, r: () => number): PlayedBar {
  const fe = feelFor(p, f);
  const notes: BandNote[] = [];
  const boogie = ['blues', 'rock', 'country'].includes(f.genre.id) && fe.energy > 0.5;
  for (const c of f.chords) {
    const root = nearestPc(c.pcs[0], 40);
    const v = voicingFor(c, 62, fe, f, p.mem, 3, false);
    if (boogie) {
      const fig = [0, 4, 7, 9, 10, 9, 7, 4];
      for (let t = 0, k = 0; t < c.beats - 1e-6; t += 0.5, k++) notes.push({ at: humanAt(c.at + t, fe, f, r), len: 0.45, key: root + fig[k % 8], vel: velOf(k % 2 ? 60 : 72, fe, r) });
      for (const t of [1, 3]) if (t < c.beats) for (const k of v) notes.push({ at: humanAt(c.at + t, fe, f, r), len: 0.3, key: k, vel: velOf(64, fe, r) });
    } else {
      for (let t = 0; t < c.beats - 1e-6; t += 1) {
        const bassBeat = t % 2 === 0;
        if (bassBeat) notes.push({ at: humanAt(c.at + t, fe, f, r), len: 0.5, key: t % 4 === 0 ? root : root - 5, vel: velOf(72, fe, r) });
        else for (const k of v) notes.push({ at: humanAt(c.at + t, fe, f, r), len: 0.4, key: k, vel: velOf(62, fe, r) });
      }
    }
  }
  void band;
  return { notes, hits: [], trace: [boogie ? 'boogie-woogie left hand' : 'stride: bass, chord, bass, chord'] };
}

function chorale(p: Performance, f: BarFrame, band: BandShared, r: () => number): PlayedBar {
  const fe = feelFor(p, f);
  const notes: BandNote[] = [];
  for (const c of f.chords) {
    const v = voicingFor(c, 62, fe, f, p.mem, 4, false);
    for (const k of v) notes.push({ at: humanAt(c.at, fe, f, r), len: c.beats * 0.99, key: k, vel: velOf(60, fe, r), articulation: 'legato' });
    notes.push({ at: humanAt(c.at, fe, f, r), len: c.beats * 0.99, key: nearestPc(c.pcs[0], 36), vel: velOf(64, fe, r), articulation: 'legato' }); // pedal
  }
  band.padding = true;
  return { notes, hits: [], trace: ['four-voice chorale', 'pedal line'] };
}

function gliss(p: Performance, f: BarFrame, r: () => number): PlayedBar {
  const fe = feelFor(p, f);
  const notes: BandNote[] = [];
  const target = nearestPc(f.next[0] ?? f.chords[0].pcs[0], 79);
  const white = [0, 2, 4, 5, 7, 9, 11];
  let k = target - 12;
  for (let t = f.beats - 0.5; t < f.beats - 0.02 && k < target; t += 0.04) {
    do k++; while (!white.includes(k % 12));
    notes.push({ at: t, len: 0.05, key: k, vel: velOf(54, fe, r) });
  }
  return { notes, hits: [], trace: ['palm glissando into the downbeat'] };
}

function lantern(p: Performance, f: BarFrame, r: () => number): PlayedBar {
  const fe = feelFor(p, f);
  const notes: BandNote[] = [];
  for (const c of f.chords) {
    const root = fit(nearestPc(c.pcs[0], 43 + fe.register), p.player.range);
    notes.push({ at: humanAt(c.at, fe, f, r), len: c.beats * 0.98, key: root, vel: velOf(56, fe, r), articulation: 'sul-tasto', expr: { ...vibrato(0.12), ...swell('arch') } });
    if (fe.energy > 0.35) notes.push({ at: humanAt(c.at, fe, f, r), len: c.beats * 0.98, key: root + 7, vel: velOf(48, fe, r), articulation: 'sul-tasto' });
  }
  return { notes, hits: [], trace: ['sustained root and fifth, sul tasto'] };
}

function fiddleChop(p: Performance, f: BarFrame, r: () => number): PlayedBar {
  const fe = feelFor(p, f);
  const notes: BandNote[] = [];
  for (const c of f.chords) {
    const v = voiceChord(c.pcs, 68, undefined, 2);
    for (const t of [1, 3]) if (t < c.beats) for (const k of v) notes.push({ at: humanAt(c.at + t, fe, f, r), len: 0.15, key: fit(k, p.player.range), vel: velOf(70, fe, r), articulation: 'staccato' });
  }
  return { notes, hits: [], trace: ['bluegrass chop on the backbeat'] };
}

function labSequence(p: Performance, f: BarFrame, r: () => number): PlayedBar {
  const fe = feelFor(p, f);
  const notes: BandNote[] = [];
  // The same 16-step "patch" repeats through the phrase — chance, but a loop you can hear.
  const pr = rng(hashSeed(p.player.id, Math.floor(f.bar / Math.max(1, f.phraseLen)), f.seed));
  const steps = Array.from({ length: 16 }, () => ({ on: pr() < 0.32 + fe.density * 0.2, oct: Math.floor(pr() * 3) - 1, tone: Math.floor(pr() * 4) }));
  for (let s = 0; s < Math.round(f.beats * 4); s++) {
    const st = steps[s % 16];
    if (!st.on) continue;
    const c = chordAt(f, s / 4);
    const pcs = colorChord(c.pcs, 2, false);
    notes.push({ at: humanAt(s / 4, fe, f, r), len: 0.2, key: fit(nearestPc(pcs[st.tone % pcs.length], 64) + st.oct * 12, p.player.range), vel: velOf(60, fe, r) });
  }
  return { notes, hits: [], trace: ['probability sequence'] };
}

/** Horn section stabs: the trumpet on top, the sax a third or sixth under, same rhythm. */
function hornSection(p: Performance, f: BarFrame, band: BandShared, r: () => number): PlayedBar {
  const fe = feelFor(p, f);
  if (!band.hornStabs) {
    const hr = rng(hashSeed('horns', f.bar, f.seed));
    const slots = [0.75, 1.5, 2.5, 3.25, 3.5].filter((t) => t < f.beats);
    band.hornStabs = slots.filter(() => hr() < 0.35 + fe.density * 0.25);
    if (!band.hornStabs.length) band.hornStabs = [f.phrasePos % 2 ? 3.5 : 1.5];
  }
  const notes: BandNote[] = [];
  for (const t of band.hornStabs) {
    const c = chordAt(f, t);
    const top = fit(nearestPc(c.pcs[2] ?? c.pcs[0], 74 + fe.register), p.player.range);
    const key = p.player.role === 'trumpet' ? top : fit(top - (r() < 0.5 ? 3 : 4), p.player.range);
    notes.push({ at: humanAt(t, fe, f, r), len: 0.22, key, vel: velOf(80, fe, r, 8), articulation: 'marcato', ...(p.persona.traits.ornaments.includes('fall') && t === band.hornStabs[band.hornStabs.length - 1] && r() < 0.3 ? { expr: { curvePoints: [{ t: 0, bend: 0 }, { t: 0.5, bend: 0 }, { t: 1, bend: -0.25 }] } } : {}) });
  }
  return { notes, hits: [], trace: ['horn section stabs'] };
}
