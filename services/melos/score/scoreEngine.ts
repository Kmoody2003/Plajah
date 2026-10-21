/**
 * scoreEngine.ts — the notation layer the book scores are written in.
 *
 * The old book "scores" (data/classicBookSoundtracks.ts, classicBookMasterScores.ts) were an 8-chord
 * loop plus a 16-note contour, copied 8× with transposition. That can only ever sound like a game
 * loop. This module is how a cue is actually written instead: a full score of named parts, measure
 * by measure, with
 *   - hand-written lines in a compact pitch/duration DSL (`F#5q G5e. A5s`), validated bar by bar, and
 *   - a written harmonic plan (one or more chord symbols per bar) that accompaniment textures are
 *     voice-led from, the way an orchestrator realises a short score.
 *
 * The result exports to MusicXML (engraved notation), multi-track MIDI and Chora renders
 * (scoreExport.ts). Nothing here is generative audio.
 */

import type { NoteEvent, OrchestralArticulation } from '../beats/grooveDoc';
import type { MelosWasmInstrumentType } from '../melosWasmSongEngine';

// ── Pitch spelling ────────────────────────────────────────────────────────────────────────────

export type Step = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';
export interface Pitch { step: Step; alter: number; octave: number }

const STEPS: Step[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const STEP_PC: Record<Step, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function pitchMidi(p: Pitch): number {
  return STEP_PC[p.step] + p.alter + 12 * (p.octave + 1);
}

function parseAlter(acc: string | undefined): number {
  if (!acc || acc === 'n') return 0;
  if (acc === '#') return 1;
  if (acc === '##') return 2;
  if (acc === 'b') return -1;
  if (acc === 'bb') return -2;
  throw new Error(`bad accidental "${acc}"`);
}

/** Spelled pitch nearest to `targetMidi` with the given step/alter. */
function placeNear(step: Step, alter: number, targetMidi: number): Pitch {
  let best: Pitch = { step, alter, octave: 4 };
  let bestD = Infinity;
  for (let oct = 0; oct <= 8; oct++) {
    const p = { step, alter, octave: oct };
    const d = Math.abs(pitchMidi(p) - targetMidi);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

// ── Chord symbols ─────────────────────────────────────────────────────────────────────────────

/** [letter steps above root, semitones above root] */
type Interval = [number, number];
const I: Record<string, Interval> = {
  '1': [0, 0], b3: [2, 3], '3': [2, 4], '4': [3, 5], b5: [4, 6], '5': [4, 7], '#5': [4, 8],
  '6': [5, 9], bb7: [6, 9], b7: [6, 10], '7': [6, 11], '9': [1, 2], '2': [1, 2],
};
const QUALITIES: Array<[string, string[]]> = [
  // longest suffixes first
  ['m7b5', ['1', 'b3', 'b5', 'b7']], ['ø7', ['1', 'b3', 'b5', 'b7']], ['dim7', ['1', 'b3', 'b5', 'bb7']],
  ['°7', ['1', 'b3', 'b5', 'bb7']], ['maj7', ['1', '3', '5', '7']], ['7sus4', ['1', '4', '5', 'b7']],
  ['sus4', ['1', '4', '5']], ['sus2', ['1', '2', '5']], ['add9', ['1', '3', '5', '9']], ['m7', ['1', 'b3', '5', 'b7']],
  ['m6', ['1', 'b3', '5', '6']], ['dim', ['1', 'b3', 'b5']], ['°', ['1', 'b3', 'b5']], ['aug', ['1', '3', '#5']],
  ['m', ['1', 'b3', '5']], ['7', ['1', '3', '5', 'b7']], ['6', ['1', '3', '5', '6']], ['', ['1', '3', '5']],
];

export interface ChordTone { step: Step; alter: number; pc: number; degree: string }
export interface Chord { symbol: string; tones: ChordTone[]; bass: ChordTone }

function spellAbove(root: { step: Step; alter: number }, [letters, semis]: Interval): { step: Step; alter: number } {
  const step = STEPS[(STEPS.indexOf(root.step) + letters) % 7];
  const rootPc = STEP_PC[root.step] + root.alter;
  let alter = (rootPc + semis - STEP_PC[step]) % 12;
  if (alter > 6) alter -= 12;
  if (alter < -6) alter += 12;
  return { step, alter };
}

const pcOf = (step: Step, alter: number) => (((STEP_PC[step] + alter) % 12) + 12) % 12;

export function parseChord(symbol: string): Chord {
  const [head, slash] = symbol.split('/');
  const m = /^([A-G])(#|b)?(.*)$/.exec(head);
  if (!m) throw new Error(`bad chord "${symbol}"`);
  const root = { step: m[1] as Step, alter: parseAlter(m[2]) };
  const q = QUALITIES.find(([suffix]) => suffix === m[3]);
  if (!q) throw new Error(`unknown chord quality "${m[3]}" in "${symbol}"`);
  const tones = q[1].map((deg) => {
    const s = spellAbove(root, I[deg]);
    return { ...s, pc: pcOf(s.step, s.alter), degree: deg };
  });
  let bass = tones[0];
  if (slash) {
    const b = /^([A-G])(#|b)?$/.exec(slash);
    if (!b) throw new Error(`bad slash bass in "${symbol}"`);
    const bs = { step: b[1] as Step, alter: parseAlter(b[2]) };
    bass = tones.find((t) => t.step === bs.step && t.alter === bs.alter)
      ?? { ...bs, pc: pcOf(bs.step, bs.alter), degree: 'bass' };
  }
  return { symbol, tones, bass };
}

// ── Score model ───────────────────────────────────────────────────────────────────────────────

export type Dynamic = 'ppp' | 'pp' | 'p' | 'mp' | 'mf' | 'f' | 'ff' | 'fff';
export const DYNAMIC_VELOCITY: Record<Dynamic, number> = { ppp: 26, pp: 36, p: 50, mp: 63, mf: 76, f: 92, ff: 106, fff: 118 };

export type Articulation = 'staccato' | 'accent' | 'tenuto' | 'tremolo' | 'pizz' | 'arco';

export interface ScoreEvent {
  /** Empty = rest. */
  pitches: Pitch[];
  /** Beats (quarter = 1). */
  dur: number;
  vel: number;
  tieToNext?: boolean;
  artics?: Articulation[];
  /** Dynamic marking printed on this event. */
  dynamic?: Dynamic;
  /** Expression text printed above (e.g. "dolce", "cresc."). */
  words?: string;
}

export type Clef = 'treble' | 'bass' | 'alto' | 'treble8vb';

export interface ChoraVoice {
  instrumentType: MelosWasmInstrumentType;
  presetId: string;
  gainDb: number;
  pan: number;
  articulation?: OrchestralArticulation;
}

export interface ScorePart {
  id: string;
  name: string;
  abbr: string;
  clef: Clef;
  /** Written pitch sounds this many octaves away (contrabass = -1). */
  octaveTranspose?: number;
  /** General MIDI program (0-based). */
  gmProgram: number;
  /** Bracket group in the engraved score. */
  group: 'woodwinds' | 'brass' | 'harp' | 'piano' | 'strings';
  chora: ChoraVoice;
}

export interface ScoreSection { bar: number; label: string; title: string }

export interface Score {
  id: string;
  title: string;
  subtitle: string;
  composer: string;
  bpm: number;
  beatsPerBar: number;
  beatUnit: number;
  keyFifths: number;
  keyMode: 'major' | 'minor';
  parts: ScorePart[];
  sections: ScoreSection[];
  /** Chord symbols per bar (index 0 = bar 1). */
  harmony: string[];
  /** bars[partId][barIndex] */
  bars: Record<string, ScoreEvent[][]>;
}

// ── DSL ───────────────────────────────────────────────────────────────────────────────────────

const DUR: Record<string, number> = { w: 4, h: 2, q: 1, e: 0.5, s: 0.25, t: 0.125 };

/**
 * One bar per `|`. Tokens:
 *   F#5q  Bb4e.  D5h~ (tie)  A4q' (staccato)  A4q> (accent)  A4q_ (tenuto)
 *   [D4 F#4 A4]h.   chord
 *   rq rh. re       rests;  rm  full-measure rest
 *   !p !mf ...      dynamic for the next note (also sets velocity)
 *   "dolce"         expression text for the next note (no spaces — use _ for space)
 */
export function parseBars(dsl: string, beatsPerBar: number, startVel: number, where: string): { bars: ScoreEvent[][]; vel: number } {
  let vel = startVel;
  const bars: ScoreEvent[][] = [];
  const chunks = dsl.split('|').map((c) => c.trim());
  if (chunks.length && chunks[chunks.length - 1] === '') chunks.pop();
  chunks.forEach((chunk, bi) => {
    const events: ScoreEvent[] = [];
    let pendingDyn: Dynamic | undefined;
    let pendingWords: string | undefined;
    const tokens = chunk.match(/\[[^\]]*\][^\s]*|"[^"]*"|\S+/g) ?? [];
    for (const tok of tokens) {
      if (tok.startsWith('!')) {
        const d = tok.slice(1) as Dynamic;
        if (!(d in DYNAMIC_VELOCITY)) throw new Error(`${where} bar+${bi}: bad dynamic ${tok}`);
        pendingDyn = d;
        vel = DYNAMIC_VELOCITY[d];
        continue;
      }
      if (tok.startsWith('"')) { pendingWords = tok.slice(1, -1).replace(/_/g, ' '); continue; }
      if (tok === 'rm') { events.push({ pitches: [], dur: beatsPerBar, vel }); continue; }
      let pitchPart: string;
      let tail: string;
      if (tok.startsWith('[')) {
        const close = tok.indexOf(']');
        pitchPart = tok.slice(1, close);
        tail = tok.slice(close + 1);
      } else if (tok.startsWith('r')) {
        pitchPart = '';
        tail = tok.slice(1);
      } else {
        const m = /^([A-G](?:##|#|bb|b|n)?\d)(.*)$/.exec(tok);
        if (!m) throw new Error(`${where} bar+${bi}: bad token "${tok}"`);
        pitchPart = m[1];
        tail = m[2];
      }
      const dm = /^([whqest])(\.?)([~'>_]*)$/.exec(tail);
      if (!dm) throw new Error(`${where} bar+${bi}: bad duration in "${tok}"`);
      const dur = DUR[dm[1]] * (dm[2] ? 1.5 : 1);
      const pitches = pitchPart
        ? pitchPart.split(/\s+/).map((ps) => {
          const pm = /^([A-G])(##|#|bb|b|n)?(\d)$/.exec(ps);
          if (!pm) throw new Error(`${where} bar+${bi}: bad pitch "${ps}"`);
          return { step: pm[1] as Step, alter: parseAlter(pm[2]), octave: Number(pm[3]) };
        })
        : [];
      const artics: Articulation[] = [];
      if (dm[3].includes("'")) artics.push('staccato');
      if (dm[3].includes('>')) artics.push('accent');
      if (dm[3].includes('_')) artics.push('tenuto');
      events.push({
        pitches, dur, vel,
        tieToNext: dm[3].includes('~') || undefined,
        artics: artics.length ? artics : undefined,
        dynamic: pendingDyn,
        words: pendingWords,
      });
      pendingDyn = undefined;
      pendingWords = undefined;
    }
    const total = events.reduce((s, e) => s + e.dur, 0);
    if (Math.abs(total - beatsPerBar) > 1e-6) {
      throw new Error(`${where} bar+${bi}: ${total} beats in a ${beatsPerBar}-beat bar → "${chunk}"`);
    }
    bars.push(events);
  });
  return { bars, vel };
}

// ── Builder ───────────────────────────────────────────────────────────────────────────────────

export interface HarmonySegment { chord: Chord; start: number; dur: number }

export class ScoreBuilder {
  readonly score: Score;
  private velByPart: Record<string, number> = {};

  constructor(meta: Omit<Score, 'bars' | 'harmony' | 'sections'>, totalBars: number) {
    this.score = {
      ...meta,
      sections: [],
      harmony: new Array(totalBars).fill(''),
      bars: Object.fromEntries(meta.parts.map((p) => [
        p.id,
        Array.from({ length: totalBars }, () => [{ pitches: [], dur: meta.beatsPerBar, vel: 0 }]),
      ])),
    };
    for (const p of meta.parts) this.velByPart[p.id] = DYNAMIC_VELOCITY.mp;
  }

  get totalBars() { return this.score.harmony.length; }

  section(bar: number, label: string, title: string) {
    this.score.sections.push({ bar, label, title });
    return this;
  }

  /** Chord symbols from `bar` on, one entry per bar; "G A7" splits a bar evenly, "G:2 A7:1" by beats. */
  harmony(bar: number, perBar: string) {
    perBar.split('|').map((s) => s.trim()).filter(Boolean).forEach((h, i) => {
      this.score.harmony[bar - 1 + i] = h;
    });
    return this;
  }

  segments(bar: number): HarmonySegment[] {
    const h = this.score.harmony[bar - 1];
    if (!h) throw new Error(`no harmony at bar ${bar}`);
    const parts = h.split(/\s+/);
    const bpb = this.score.beatsPerBar;
    const explicit = parts.every((p) => p.includes(':'));
    let t = 0;
    return parts.map((p) => {
      const [sym, d] = p.split(':');
      const dur = explicit ? Number(d) : bpb / parts.length;
      const seg = { chord: parseChord(sym), start: t, dur };
      t += dur;
      return seg;
    });
  }

  /** Write hand-composed bars for a part starting at `bar`. */
  write(partId: string, bar: number, dsl: string) {
    const { bars, vel } = parseBars(dsl, this.score.beatsPerBar, this.velByPart[partId], `${partId}@${bar}`);
    bars.forEach((b, i) => this.put(partId, bar + i, b));
    this.velByPart[partId] = vel;
    return this;
  }

  put(partId: string, bar: number, events: ScoreEvent[]) {
    const part = this.score.bars[partId];
    if (!part) throw new Error(`unknown part ${partId}`);
    if (bar < 1 || bar > this.totalBars) throw new Error(`${partId}: bar ${bar} out of range`);
    part[bar - 1] = events;
  }

  /** Copy bars of one part into another, optionally transposed by octaves. */
  double(fromId: string, toId: string, fromBar: number, toBar: number, octaves = 0, velScale = 1) {
    for (let b = fromBar; b <= toBar; b++) {
      const src = this.score.bars[fromId][b - 1];
      this.put(toId, b, src.map((e) => ({
        ...e,
        vel: Math.round(e.vel * velScale),
        pitches: e.pitches.map((p) => ({ ...p, octave: p.octave + octaves })),
      })));
    }
    return this;
  }
}

// ── Textures (orchestrating the harmonic plan) ────────────────────────────────────────────────

export interface VoiceRange { lo: number; hi: number }

/** Split a duration into notatable values (no dotted-half across beat boundaries in 3/4 is fine). */
function notatable(dur: number): number[] {
  const vals = [4, 3, 2, 1.5, 1, 0.75, 0.5, 0.25];
  const out: number[] = [];
  let left = dur;
  while (left > 1e-6) {
    const v = vals.find((x) => x <= left + 1e-6);
    if (!v) throw new Error(`cannot notate ${dur}`);
    out.push(v);
    left -= v;
  }
  return out;
}

function toneInRange(t: ChordTone, prev: number, range: VoiceRange): Pitch {
  // nearest octave to the previous note that stays in range
  const target = Math.max(range.lo, Math.min(range.hi, prev));
  let p = placeNear(t.step, t.alter, target);
  while (pitchMidi(p) < range.lo) p = { ...p, octave: p.octave + 1 };
  while (pitchMidi(p) > range.hi) p = { ...p, octave: p.octave - 1 };
  return p;
}

/**
 * Voice-leads the harmony across a set of upper voices: each voice moves to the nearest chord tone,
 * voices avoid doubling while the chord has unused tones, and the third is always present.
 */
export class VoiceLeader {
  private prev: number[];
  constructor(private ranges: VoiceRange[]) {
    this.prev = ranges.map((r) => Math.round((r.lo + r.hi) / 2));
  }

  voice(chord: Chord): Pitch[] {
    const order = this.ranges.map((_, i) => i);
    const chosen: (Pitch | null)[] = this.ranges.map(() => null);
    const used = new Set<number>();
    const third = chord.tones.find((t) => t.degree === 'b3' || t.degree === '3' || t.degree === '4');
    for (const i of order) {
      let best: Pitch | null = null;
      let bestCost = Infinity;
      for (const t of chord.tones) {
        const p = toneInRange(t, this.prev[i], this.ranges[i]);
        let cost = Math.abs(pitchMidi(p) - this.prev[i]);
        if (used.has(t.pc) && used.size < chord.tones.length) cost += 7;
        // a voice above must not cross below the voice before it
        const above = i > 0 ? chosen[i - 1] : null;
        if (above && pitchMidi(p) > pitchMidi(above)) cost += 24;
        if (cost < bestCost) { bestCost = cost; best = p; }
      }
      chosen[i] = best!;
      used.add(((pitchMidi(best!) % 12) + 12) % 12);
    }
    if (third && !used.has(third.pc)) {
      // put the third in the voice whose move to it is cheapest
      let bi = 0;
      let bc = Infinity;
      chosen.forEach((p, i) => {
        const cand = toneInRange(third, pitchMidi(p!), this.ranges[i]);
        const c = Math.abs(pitchMidi(cand) - this.prev[i]);
        if (c < bc) { bc = c; bi = i; }
      });
      chosen[bi] = toneInRange(third, pitchMidi(chosen[bi]!), this.ranges[bi]);
    }
    this.prev = chosen.map((p) => pitchMidi(p!));
    return chosen as Pitch[];
  }
}

export interface TextureOpts {
  dynamic?: Dynamic;
  words?: string;
  artics?: Articulation[];
  /** velocity ramp across the range (e.g. crescendo: from p to f) */
  toDynamic?: Dynamic;
}

function rampVel(opts: TextureOpts, i: number, n: number): number {
  const a = DYNAMIC_VELOCITY[opts.dynamic ?? 'mp'];
  const b = opts.toDynamic ? DYNAMIC_VELOCITY[opts.toDynamic] : a;
  return Math.round(a + (b - a) * (n <= 1 ? 0 : i / (n - 1)));
}

function markFirst(events: ScoreEvent[], opts: TextureOpts, isFirst: boolean) {
  const first = events.find((e) => e.pitches.length) ?? events[0];
  if (!isFirst || !first) return;
  if (opts.dynamic) first.dynamic = opts.dynamic;
  if (opts.words) first.words = opts.words;
}

/** Held chord tones in several parts at once (one voice per part), voice-led. */
export function sustainVoices(sb: ScoreBuilder, partIds: string[], ranges: VoiceRange[], from: number, to: number, opts: TextureOpts = {}) {
  const vl = new VoiceLeader(ranges);
  const n = to - from + 1;
  for (let b = from; b <= to; b++) {
    const vel = rampVel(opts, b - from, n);
    const perPart: ScoreEvent[][] = partIds.map(() => []);
    for (const seg of sb.segments(b)) {
      const voiced = vl.voice(seg.chord);
      partIds.forEach((_, i) => {
        const durs = notatable(seg.dur);
        durs.forEach((d, k) => perPart[i].push({
          pitches: [voiced[i]], dur: d, vel, tieToNext: k < durs.length - 1 || undefined, artics: opts.artics,
        }));
      });
    }
    partIds.forEach((id, i) => { markFirst(perPart[i], opts, b === from); sb.put(id, b, perPart[i]); });
  }
}

/** The harmonic bass line, one note per chord segment (optionally doubled at the octave below). */
export function bassLine(sb: ScoreBuilder, partId: string, range: VoiceRange, from: number, to: number, opts: TextureOpts & { octaves?: boolean; pattern?: 'held' | 'beat1' } = {}) {
  let prev = Math.round((range.lo + range.hi) / 2);
  const n = to - from + 1;
  for (let b = from; b <= to; b++) {
    const vel = rampVel(opts, b - from, n);
    const ev: ScoreEvent[] = [];
    for (const seg of sb.segments(b)) {
      const p = toneInRange(seg.chord.bass, prev, range);
      prev = pitchMidi(p);
      const pitches = opts.octaves && pitchMidi(p) - 12 >= range.lo - 5 ? [{ ...p, octave: p.octave - 1 }, p] : [p];
      if (opts.pattern === 'beat1') {
        ev.push({ pitches, dur: 1, vel, artics: opts.artics });
        notatable(seg.dur - 1).forEach((d) => d > 0 && ev.push({ pitches: [], dur: d, vel }));
      } else {
        const durs = notatable(seg.dur);
        durs.forEach((d, k) => ev.push({ pitches, dur: d, vel, tieToNext: k < durs.length - 1 || undefined, artics: opts.artics }));
      }
    }
    markFirst(ev, opts, b === from);
    sb.put(partId, b, ev);
  }
}

/** Waltz after-beats: chord on beats 2 and 3 (rest on 1), voice-led, as one part's chords. */
export function afterbeats(sb: ScoreBuilder, partId: string, ranges: VoiceRange[], from: number, to: number, opts: TextureOpts = {}) {
  const vl = new VoiceLeader(ranges);
  const n = to - from + 1;
  for (let b = from; b <= to; b++) {
    const vel = rampVel(opts, b - from, n);
    const ev: ScoreEvent[] = [];
    for (const seg of sb.segments(b)) {
      const pitches = vl.voice(seg.chord);
      for (let beat = 0; beat < seg.dur; beat++) {
        const onBeat1 = seg.start + beat === 0;
        ev.push(onBeat1 ? { pitches: [], dur: 1, vel } : { pitches: [...pitches], dur: 1, vel, artics: opts.artics });
      }
    }
    markFirst(ev, opts, b === from);
    sb.put(partId, b, ev);
  }
}

/**
 * Broken-chord eighths built up from the bass: `alberti` (low-high-mid-high, piano LH), `rising`
 * (harp sweep), `wave` (up then back down).
 */
export function brokenChord(sb: ScoreBuilder, partId: string, startNear: number, from: number, to: number, opts: TextureOpts & { shape: 'rising' | 'wave' | 'alberti'; fromBass?: boolean; step?: number } ) {
  const n = to - from + 1;
  const step = opts.step ?? 0.5;
  let anchor = startNear;
  for (let b = from; b <= to; b++) {
    const vel = rampVel(opts, b - from, n);
    const ev: ScoreEvent[] = [];
    for (const seg of sb.segments(b)) {
      const count = Math.round(seg.dur / step);
      const base = opts.fromBass ? seg.chord.bass : seg.chord.tones[0];
      let basePitch = placeNear(base.step, base.alter, anchor);
      // stay in the register the texture was written for (nearest-move alone drifts by octaves)
      while (pitchMidi(basePitch) < startNear - 6) basePitch = { ...basePitch, octave: basePitch.octave + 1 };
      while (pitchMidi(basePitch) > startNear + 5) basePitch = { ...basePitch, octave: basePitch.octave - 1 };
      anchor = pitchMidi(basePitch);
      // ascending ladder of chord tones from the base, two octaves
      const ladder: Pitch[] = [basePitch];
      let cursor = pitchMidi(basePitch);
      const cycle = [...seg.chord.tones].sort((x, y) => ((x.pc - base.pc + 12) % 12) - ((y.pc - base.pc + 12) % 12));
      if (opts.shape === 'alberti') {
        // open spacing for a left hand: the fifth above the bass before anything closer
        const fifth = seg.chord.tones.find((t) => ((t.pc - base.pc + 12) % 12) >= 6 && ((t.pc - base.pc + 12) % 12) <= 8)
          ?? seg.chord.tones.find((t) => t.pc !== base.pc)!;
        let f = placeNear(fifth.step, fifth.alter, cursor + 7);
        while (pitchMidi(f) <= cursor) f = { ...f, octave: f.octave + 1 };
        ladder.push(f);
        cursor = pitchMidi(f);
      }
      for (let lap = 0; ladder.length < 9 && lap < 4; lap++) {
        for (const t of cycle) {
          const cand = placeNear(t.step, t.alter, cursor + 1);
          let m = pitchMidi(cand);
          let c = cand;
          while (m <= cursor) { c = { ...c, octave: c.octave + 1 }; m = pitchMidi(c); }
          if (m - cursor > 9) continue;
          ladder.push(c);
          cursor = m;
          if (ladder.length >= 9) break;
        }
      }
      let idx: number[];
      if (opts.shape === 'rising') idx = Array.from({ length: count }, (_, i) => i % ladder.length);
      else if (opts.shape === 'alberti') idx = Array.from({ length: count }, (_, i) => [0, 1, 3, 1, 2, 1][i % 6]);
      else idx = Array.from({ length: count }, (_, i) => [0, 1, 2, 3, 2, 1][i % 6]);
      idx.forEach((k) => ev.push({ pitches: [ladder[Math.min(k, ladder.length - 1)]], dur: step, vel, artics: opts.artics }));
    }
    markFirst(ev, opts, b === from);
    sb.put(partId, b, ev);
  }
}

/** Repeated chords (pulse) on each beat — agitation. */
export function pulseChords(sb: ScoreBuilder, partId: string, ranges: VoiceRange[], from: number, to: number, opts: TextureOpts & { step?: number } = {}) {
  const vl = new VoiceLeader(ranges);
  const n = to - from + 1;
  const step = opts.step ?? 1;
  for (let b = from; b <= to; b++) {
    const vel = rampVel(opts, b - from, n);
    const ev: ScoreEvent[] = [];
    for (const seg of sb.segments(b)) {
      const pitches = vl.voice(seg.chord);
      for (let t = 0; t < seg.dur - 1e-6; t += step) ev.push({ pitches: [...pitches], dur: step, vel, artics: opts.artics });
    }
    markFirst(ev, opts, b === from);
    sb.put(partId, b, ev);
  }
}

// ── Compile to playable notes ─────────────────────────────────────────────────────────────────

const ARTIC_TO_ORCH: Partial<Record<Articulation, OrchestralArticulation>> = {
  staccato: 'staccato', pizz: 'pizzicato', tremolo: 'tremolo', accent: 'marcato',
};

/** Sounding notes per part in beats from the top of the score (ties merged). */
export function compileScore(score: Score): Record<string, NoteEvent[]> {
  const out: Record<string, NoteEvent[]> = {};
  let seq = 1;
  for (const part of score.parts) {
    const notes: NoteEvent[] = [];
    const open = new Map<number, NoteEvent>(); // midi → note being tied
    const shift = 12 * (part.octaveTranspose ?? 0);
    score.bars[part.id].forEach((bar, bi) => {
      let t = bi * score.beatsPerBar;
      for (const e of bar) {
        for (const p of e.pitches) {
          const key = pitchMidi(p) + shift;
          const tied = open.get(key);
          if (tied) {
            tied.lengthBeats += e.dur;
            if (!e.tieToNext) open.delete(key);
            continue;
          }
          const art = e.artics?.map((a) => ARTIC_TO_ORCH[a]).find(Boolean) ?? part.chora.articulation;
          const note: NoteEvent = { id: `sc_${seq++}`, startBeats: t, lengthBeats: e.dur, key, vel: Math.max(1, Math.min(127, e.vel)), articulation: art };
          notes.push(note);
          if (e.tieToNext) open.set(key, note);
        }
        t += e.dur;
      }
    });
    out[part.id] = notes;
  }
  return out;
}

export function scoreLengthBeats(score: Score): number {
  return score.harmony.length * score.beatsPerBar;
}
