/**
 * Era Clash — the game's score: a main title and one arena theme per era, scored in Chora.
 *
 * Cinematic, but built for a fighting game: every cue rides a house pulse (122–128 bpm, four-on-the-floor
 * added by the build script, offbeat bass and chord stabs written here) under a full orchestral and
 * choral setting of a hand-written theme. Each era gets its own colour: shakuhachi and koto for Kyoto,
 * horn and throat choir for the fjord, harpsichord and violins for the piazza, ney and log drum for the
 * temple, erhu and guzheng for the Shaolin terrace, brass and organ for the Colosseum.
 *
 * Form (bars): Intro 4 — then a 32-bar loop body: A 8 · B 8 · Breakdown 4 · Drop 8 · Turn 4.
 * The score is laid out Intro + Body + Body + 4 bars of Body, so the second body (with the first
 * body's reverb tail rolling into it) can be cut out as a seamless loop.
 *
 * The notes written here are the composition. What plays them in the game is the cue's Chora Studio
 * project (services/melos/eraClashChoraProjects.ts): the parts re-voiced for LYRA / AURA / BAJO / the VELA
 * suite, the ostinato turned into held chords through a live arp, the impact part dropped, and SOMA plus a
 * MEKA house kit for the rhythm section. `palette` below is only the score's own default voicing
 * (MusicXML / MIDI export); the game audio is a bounce of the Chora projects:
 *
 *   eraclash-score-lab.html?auto=1, then  npx tsx scripts/games/buildEraClashAudio.ts music [cueId]
 */

import {
  ScoreBuilder,
  VoiceLeader,
  brokenChord,
  chordPad,
  sustainVoices,
  bassLine,
  DYNAMIC_VELOCITY,
  type Dynamic,
  type Pitch,
  type Score,
  type ScoreEvent,
  type ScorePart,
  type ChoraVoice,
  type VoiceRange,
  type ChordTone,
} from '../../services/melos/score/scoreEngine';

export const INTRO_BARS = 4;
export const BODY_BARS = 32;
export const TAIL_BARS = 4;
export const TOTAL_BARS = INTRO_BARS + BODY_BARS * 2 + TAIL_BARS;

/** Section map inside one body (0-based bar offsets), shared with the drum programmer. */
export const BODY_SECTIONS = [
  { type: 'A', from: 0, to: 7 },
  { type: 'B', from: 8, to: 15 },
  { type: 'break', from: 16, to: 19 },
  { type: 'drop', from: 20, to: 27 },
  { type: 'turn', from: 28, to: 31 },
] as const;
export type SectionType = 'intro' | (typeof BODY_SECTIONS)[number]['type'];

type BassStyle = 'offbeat' | 'rolling' | 'log';

interface Palette {
  lead: ChoraVoice; ost: ChoraVoice; stab: ChoraVoice; pad: ChoraVoice; str: ChoraVoice;
  choir: ChoraVoice; brass: ChoraVoice; bass: ChoraVoice; cello: ChoraVoice; hit: ChoraVoice;
}

export interface CueSpec {
  id: string;
  title: string;
  bpm: number;
  keyFifths: number;
  /** Lead's register shift (octaves) relative to the written theme. */
  leadOct: number;
  intro: string; progA: string; progB: string; progC: string;
  theme: string[]; answer: string[];
  /** 16th-note index pattern for the ostinato ladder. */
  ostPattern: number[];
  /** House stab onsets in 16ths. */
  stab: number[];
  bass: BassStyle;
  palette: Palette;
  /** Drum colour for the build script: which hand percussion sits over the house kit. */
  perc: 'taiko' | 'frame' | 'war' | 'tabla' | 'gong' | 'timpani';
  reverb: { hallReverbDecaySec: number; wetReverbMix: number };
}

const v = (instrumentType: ChoraVoice['instrumentType'], presetId: string, gainDb: number, pan = 0): ChoraVoice => ({ instrumentType, presetId, gainDb, pan });

/* ── The cues ──────────────────────────────────────────────────────────────────────────────── */

export const CUES: CueSpec[] = [
  {
    id: 'title', title: 'Era Clash — Main Title', bpm: 120, keyFifths: -1, leadOct: 0,
    intro: 'Dm | Bb | Gm | A7sus4:2 A7:2',
    progA: 'Dm | Bb | F | C', progB: 'Gm | Bb | Dm | A', progC: 'Bb | C | Dm:2 Bb:2 | A7',
    theme: ['D4q. A4e A4h', 'G4e F4e E4e F4e D4h', 'F4q. C5e C5h', 'Bb4e A4e G4e A4e E4h',
      'D5q. A4e D5q F5q', 'F5q. D5e D5h', 'C5q. A4e C5q F5q', 'E5h. rq'],
    answer: ['D5q F5q Bb5h', 'C6q. Bb5e A5q G5q', 'A5q. F5e D5q Bb4q', 'C#5h E5h'],
    ostPattern: [0, 2, 4, 2, 1, 3, 4, 3], stab: [2, 6, 10, 14], bass: 'offbeat', perc: 'timpani',
    reverb: { hallReverbDecaySec: 2.4, wetReverbMix: 0.2 },
    palette: {
      lead: v('aura', 'aura-cs80-bladerunner', -5, -0.15), ost: v('onda', 'Bloom Pluck', -11, 0.3), stab: v('onda', 'House Stab', -12, -0.1),
      pad: v('onda', 'Wide Warm Pad', -15, 0), str: v('aura', 'aura-mellotron-violins', -7, -0.35), choir: v('aura', 'aura-mellotron-choir', -9, 0.1),
      brass: v('aura', 'aura-modular-brass-69', -8, 0.25), bass: v('bajo', 'deep-round', -6, 0), cello: v('bajo', 'cello-menace', -10, 0.3), hit: v('bajo', 'braam', -8, 0),
    },
  },
  {
    id: 'japan', title: 'Kyoto Dusk', bpm: 124, keyFifths: 1, leadOct: 0,
    intro: 'Em | C | Am | B',
    progA: 'Em | C | D | Bm', progB: 'Am | C | Em | D', progC: 'C | D | Em:2 C:2 | B7',
    theme: ['E5h. G5e A5e', 'B5q. A5e G5q E5q', 'F#5q. A5e D5h', 'B4w',
      'E5q G5q B5q. A5e', 'G5q. E5e C5h', 'D5e E5e F#5e A5e D6h', 'B5h. F#5q'],
    answer: ['E6q. D6e C6h', 'D6q. C6e B5q A5q', 'B5q G5q E5q G5q', 'F#5h D#5h'],
    ostPattern: [0, 3, 1, 4, 2, 3, 1, 3], stab: [3, 6, 10, 14], bass: 'rolling', perc: 'taiko',
    reverb: { hallReverbDecaySec: 2.6, wetReverbMix: 0.22 },
    palette: {
      lead: v('pneuma', 'pneuma-shakuhachi', -3, -0.1), ost: v('vela', 'vitreous', -8, 0.35), stab: v('onda', 'House Stab', -13, -0.15),
      pad: v('aura', 'aura-solina-74', -13, 0), str: v('aura', 'aura-mellotron-violins', -8, -0.35), choir: v('cantus', 'cantus-vault', -9, 0.1),
      brass: v('aura', 'aura-cs80-bladerunner', -9, 0.25), bass: v('bajo', 'deep-round', -6, 0), cello: v('bajo', 'cello-menace', -10, 0.3), hit: v('bajo', 'braam', -9, 0),
    },
  },
  {
    id: 'norse', title: 'Fjord of the Sagas', bpm: 118, keyFifths: -1, leadOct: 0,
    intro: 'Dm | Dm | C | A',
    progA: 'Dm | G | Bb | C', progB: 'Bb | F | C | Dm', progC: 'G | Bb | C | A7',
    theme: ['D4h A4h', 'B4q. A4e G4h', 'F4q. G4e Bb4q D5q', 'C5w',
      'D5h A4q. D5e', 'B4h D5h', 'F5q. D5e Bb4q F5q', 'E5w'],
    answer: ['G5h D5h', 'F5q. D5e Bb4h', 'E5q. C5e G4h', 'C#5h. E5q'],
    ostPattern: [0, 1, 2, 1, 0, 1, 3, 1], stab: [2, 6, 10, 14], bass: 'offbeat', perc: 'frame',
    reverb: { hallReverbDecaySec: 3.0, wetReverbMix: 0.24 },
    palette: {
      lead: v('aura', 'aura-cs80-bladerunner', -4, -0.2), ost: v('aura', 'aura-munich-arpeggio-77', -12, 0.3), stab: v('onda', 'House Stab', -14, -0.1),
      pad: v('onda', 'Wide Warm Pad', -14, 0), str: v('aura', 'aura-mellotron-violins', -8, -0.35), choir: v('cantus', 'cantus-kargyraa', -7, 0.05),
      brass: v('aura', 'aura-modular-brass-69', -8, 0.25), bass: v('bajo', 'organ-bass', -7, 0), cello: v('bajo', 'cello-menace', -8, 0.3), hit: v('bajo', 'braam', -7, 0),
    },
  },
  {
    id: 'italy', title: 'Piazza of the Lion', bpm: 126, keyFifths: 0, leadOct: 0,
    intro: 'Am | Dm/F | E | E7',
    progA: 'Am | F | Dm | E', progB: 'F | G | C | E', progC: 'Dm | G | C:2 F:2 | E7',
    theme: ['A5q E5e A5e C6q B5e A5e', 'C6e A5e F5e A5e C6q. A5e', 'D6e C6e B5e A5e F5q D5q', 'E5e G#5e B5e E6e D6h',
      'C6q. B5e A5q E5q', 'F5q. G5e A5q C6q', 'B5e A5e G#5e A5e F5h', 'E5w'],
    answer: ['F5q. A5e D6q F6q', 'D6q. B5e G5h', 'E6q C6q F6q C6q', 'B5h G#5h'],
    ostPattern: [0, 2, 1, 2, 3, 2, 1, 2], stab: [0, 3, 6, 10, 13], bass: 'rolling', perc: 'timpani',
    reverb: { hallReverbDecaySec: 2.2, wetReverbMix: 0.2 },
    palette: {
      lead: v('aura', 'aura-mellotron-violins', -4, -0.25), ost: v('aura', 'aura-harpsichord-68', -9, 0.35), stab: v('onda', 'House Stab', -11, -0.1),
      pad: v('aura', 'aura-solina-74', -13, 0), str: v('aura', 'aura-logan-melody', -9, -0.35), choir: v('aura', 'aura-mellotron-choir', -9, 0.1),
      brass: v('aura', 'aura-modular-brass-69', -8, 0.25), bass: v('bajo', 'deep-round', -6, 0), cello: v('bajo', 'cello-menace', -9, 0.3), hit: v('bajo', 'trailer-sub', -9, 0),
    },
  },
  {
    id: 'aztec', title: 'Temple of the Setting Sun', bpm: 122, keyFifths: -2, leadOct: 0,
    intro: 'Gm | Eb | Cm | D',
    progA: 'Gm | Eb | Bb | F', progB: 'Cm | Eb | Gm | D', progC: 'Eb | F | Gm:2 Eb:2 | D7',
    theme: ['G5q. Bb5e D6q C6e Bb5e', 'G5h. Bb5q', 'F5q. D5e F5q Bb5q', 'C6w',
      'D6q. C6e Bb5q G5q', 'Bb5e G5e Eb5e G5e Bb5h', 'D6q. C6e Bb5q F5q', 'A5h. C6q'],
    answer: ['G6q. F6e Eb6h', 'F6q. D6e C6h', 'D6q Bb5q G5q Bb5q', 'A5h F#5h'],
    ostPattern: [0, 2, 3, 1, 2, 4, 3, 2], stab: [2, 5, 10, 13], bass: 'log', perc: 'war',
    reverb: { hallReverbDecaySec: 2.4, wetReverbMix: 0.2 },
    palette: {
      lead: v('pneuma', 'pneuma-ney', -3, -0.1), ost: v('vela', 'ferrous', -9, 0.35), stab: v('onda', 'Glass Keys', -12, -0.15),
      pad: v('onda', 'Wide Warm Pad', -14, 0), str: v('aura', 'aura-mellotron-violins', -9, -0.35), choir: v('aura', 'aura-vp330-human', -10, 0.1),
      brass: v('aura', 'aura-modular-brass-69', -8, 0.25), bass: v('bajo', 'amapiano-log', -6, 0), cello: v('bajo', 'cello-menace', -10, 0.3), hit: v('bajo', 'braam', -8, 0),
    },
  },
  {
    id: 'china', title: 'Shaolin Mist Terrace', bpm: 120, keyFifths: 0, leadOct: 0,
    intro: 'Am | G | F | Em',
    progA: 'Am | F | C | G', progB: 'Dm | F | Am | Em', progC: 'F | G | Am:2 F:2 | E',
    theme: ['A4q. C5e E5q D5e C5e', 'A4h. C5q', 'G4q. A4e C5q E5q', 'D5w',
      'E5q. G5e A5q E5q', 'C5e D5e C5e A4e C5h', 'E5q. G5e E5q C5q', 'D5h. G4q'],
    answer: ['A5q. G5e E5h', 'G5q. E5e D5h', 'E5q C5q A4q C5q', 'B4h G#4h'],
    ostPattern: [0, 3, 2, 3, 1, 3, 2, 4], stab: [2, 6, 10, 14], bass: 'offbeat', perc: 'gong',
    reverb: { hallReverbDecaySec: 2.8, wetReverbMix: 0.24 },
    palette: {
      lead: v('aura', 'aura-logan-melody', -4, -0.1), ost: v('vela', 'vitreous', -8, 0.35), stab: v('onda', 'Glass Keys', -13, -0.15),
      pad: v('aura', 'aura-soft-77-pad', -13, 0), str: v('aura', 'aura-mellotron-violins', -9, -0.35), choir: v('aura', 'aura-mellotron-choir', -10, 0.1),
      brass: v('aura', 'aura-cs80-bladerunner', -9, 0.25), bass: v('bajo', 'deep-round', -6, 0), cello: v('bajo', 'cello-menace', -10, 0.3), hit: v('vela', 'himalayan-bronze', -6, 0),
    },
  },
  {
    id: 'rome', title: 'The Golden Colosseum', bpm: 128, keyFifths: -3, leadOct: 0,
    intro: 'Cm | Ab | Fm | G',
    progA: 'Cm | Ab | Eb | Bb', progB: 'Fm | Ab | Cm | G', progC: 'Ab | Bb | Cm:2 Ab:2 | G7',
    theme: ['C5q. C5e G5h', 'Ab5q. G5e Eb5h', 'G5q. Bb5e Eb6q Bb5q', 'D6w',
      'Eb6q. D6e C6q G5q', 'Ab5q. C6e Eb6h', 'Bb5q. G5e Eb5q G5q', 'F5h. D5q'],
    answer: ['C6q. Bb5e Ab5h', 'D6q. C6e Bb5h', 'G5q Eb5q C6q Ab5q', 'B5h. D6q'],
    ostPattern: [0, 2, 4, 2, 0, 3, 4, 3], stab: [0, 3, 6, 10, 12], bass: 'offbeat', perc: 'war',
    reverb: { hallReverbDecaySec: 2.6, wetReverbMix: 0.22 },
    palette: {
      lead: v('aura', 'aura-modular-brass-69', -4, -0.15), ost: v('onda', 'Festival Pluck', -12, 0.3), stab: v('onda', 'House Stab', -12, -0.1),
      pad: v('ison', 'ison-bourdon', -13, 0), str: v('aura', 'aura-mellotron-violins', -7, -0.35), choir: v('aura', 'aura-mellotron-choir', -8, 0.1),
      brass: v('aura', 'aura-cs80-bladerunner', -8, 0.25), bass: v('bajo', 'organ-bass', -6, 0), cello: v('bajo', 'cello-menace', -9, 0.3), hit: v('bajo', 'braam', -7, 0),
    },
  },
];

/* ── Parts ─────────────────────────────────────────────────────────────────────────────────── */

function partsFor(c: CueSpec): ScorePart[] {
  const P = c.palette;
  const part = (id: string, name: string, clef: ScorePart['clef'], gm: number, group: ScorePart['group'], chora: ChoraVoice): ScorePart =>
    ({ id, name, abbr: name.slice(0, 4) + '.', clef, gmProgram: gm, group, chora });
  return [
    part('lead', 'Lead', 'treble', 73, 'woodwinds', P.lead),
    part('brass', 'Brass', 'treble', 60, 'brass', P.brass),
    part('ost', 'Ostinato', 'treble', 46, 'harp', P.ost),
    part('stab', 'House Stab', 'treble', 0, 'piano', P.stab),
    part('pad', 'Pad', 'treble', 89, 'keyboard', P.pad),
    part('choir', 'Choir', 'treble', 52, 'choir', P.choir),
    part('str', 'Strings', 'treble', 48, 'strings', P.str),
    part('vc', 'Celli', 'bass', 42, 'strings', P.cello),
    part('bass', 'House Bass', 'bass', 38, 'strings', P.bass),
    part('hit', 'Impact', 'bass', 43, 'percussion', P.hit),
  ];
}

/* ── Writing helpers ───────────────────────────────────────────────────────────────────────── */

const R = {
  lead: { lo: 60, hi: 91 }, str: [{ lo: 72, hi: 86 }, { lo: 65, hi: 79 }] as VoiceRange[],
  brass: [{ lo: 60, hi: 74 }, { lo: 55, hi: 69 }, { lo: 50, hi: 62 }] as VoiceRange[],
  choir: [{ lo: 64, hi: 77 }, { lo: 59, hi: 71 }, { lo: 52, hi: 64 }] as VoiceRange[],
  pad: [{ lo: 62, hi: 74 }, { lo: 57, hi: 69 }, { lo: 50, hi: 62 }] as VoiceRange[],
  stab: [{ lo: 67, hi: 79 }, { lo: 62, hi: 74 }, { lo: 57, hi: 69 }] as VoiceRange[],
  vc: { lo: 40, hi: 55 }, bass: { lo: 31, hi: 43 }, hit: { lo: 26, hi: 38 },
};
const vel = (d: Dynamic) => DYNAMIC_VELOCITY[d];

/** A pitch spelled from a chord tone, at the octave that puts it at `midi`. */
function spell(t: ChordTone, midi: number): Pitch {
  const stepPc: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return { step: t.step, alter: t.alter, octave: Math.round((midi - stepPc[t.step] - t.alter) / 12) - 1 };
}
function inRange(pc: number, r: { lo: number; hi: number }): number {
  return r.lo + ((pc - (r.lo % 12)) + 12) % 12;
}

/** One bar from 16th-note onsets: each note lasts `len` 16ths (cut short by the next onset). */
function rhythmBar(onsets: number[], len: number, v0: number, pitchesAt: (onset16: number, k: number) => Pitch[], accentEvery?: number): ScoreEvent[] {
  const ev: ScoreEvent[] = [];
  const on = [...onsets].sort((a, b) => a - b);
  let t = 0;
  on.forEach((o, k) => {
    if (o > t) { ev.push({ pitches: [], dur: (o - t) / 4, vel: v0 }); t = o; }
    const next = k + 1 < on.length ? on[k + 1] : 16;
    const l = Math.min(len, next - o);
    ev.push({ pitches: pitchesAt(o, k), dur: l / 4, vel: accentEvery && k % accentEvery === 0 ? Math.min(127, v0 + 10) : v0 });
    t = o + l;
  });
  if (t < 16) ev.push({ pitches: [], dur: (16 - t) / 4, vel: v0 });
  return ev;
}

function segAt(sb: ScoreBuilder, bar: number, beat: number) {
  const segs = sb.segments(bar);
  let s = segs[0];
  for (const x of segs) if (x.start <= beat + 1e-6) s = x;
  return s;
}

const BASS_PATTERNS: Record<BassStyle, { on: number[]; len: number; oct: number[] }> = {
  /* classic house: off the kick on every "and" */
  offbeat: { on: [2, 6, 10, 14], len: 2, oct: [0, 0, 0, 12] },
  /* deep house roll: syncopated pushes with an octave pop */
  rolling: { on: [2, 3, 6, 10, 11, 14], len: 1, oct: [0, 12, 0, 0, 12, 0] },
  /* amapiano log drum: long, sliding, behind the beat */
  log: { on: [0, 3, 6, 10, 12, 14], len: 2, oct: [0, 0, 12, 0, 7, 0] },
};

function houseBass(sb: ScoreBuilder, style: BassStyle, from: number, to: number, d: Dynamic) {
  const pat = BASS_PATTERNS[style];
  for (let b = from; b <= Math.min(to, sb.totalBars); b++) {
    sb.put('bass', b, rhythmBar(pat.on, pat.len, vel(d), (o, k) => {
      const seg = segAt(sb, b, o / 4);
      const root = inRange(seg.chord.bass.pc, R.bass) + pat.oct[k % pat.oct.length];
      return [spell(seg.chord.bass, root)];
    }));
  }
}

function houseStabs(sb: ScoreBuilder, onsets: number[], from: number, to: number, d: Dynamic) {
  const vl = new VoiceLeader(R.stab);
  for (let b = from; b <= Math.min(to, sb.totalBars); b++) {
    let lastSeg = -1, voiced: Pitch[] = [];
    sb.put('stab', b, rhythmBar(onsets, 1, vel(d), (o) => {
      const seg = segAt(sb, b, o / 4);
      if (seg.start !== lastSeg) { voiced = vl.voice(seg.chord); lastSeg = seg.start; }
      return [...voiced];
    }));
  }
}

/** Long low hit on the downbeat: a braam / sub / gong under a section change. */
function impact(sb: ScoreBuilder, bar: number, d: Dynamic) {
  if (bar > sb.totalBars) return;
  const seg = sb.segments(bar)[0];
  sb.put('hit', bar, [{ pitches: [spell(seg.chord.bass, inRange(seg.chord.bass.pc, R.hit))], dur: 4, vel: vel(d) }]);
}

const clamp = (sb: ScoreBuilder, from: number, to: number): [number, number] | null => {
  const t = Math.min(to, sb.totalBars);
  return from > t ? null : [from, t];
};
const octave = (line: string, by: number) => line.replace(/([A-G](?:##|#|bb|b)?)(\d)/g, (_, n, o) => `${n}${Number(o) + by}`);
const bars = (lines: string[]) => lines.join(' | ');

/** Write a run of bars, but only as many as fit before the end of the score. */
function writeFit(sb: ScoreBuilder, part: string, bar: number, lines: string[], prefix = '') {
  const room = sb.totalBars - bar + 1;
  if (room <= 0) return;
  const take = lines.slice(0, room);
  sb.write(part, bar, `${prefix} ${bars(take)}`.trim());
}

/* ── Form ──────────────────────────────────────────────────────────────────────────────────── */

function writeIntro(sb: ScoreBuilder, c: CueSpec) {
  chordPad(sb, 'pad', R.pad, 1, 4, { dynamic: 'pp', toDynamic: 'mf' });
  sustainVoices(sb, ['str'], [R.str[0]], 1, 4, { dynamic: 'pp', toDynamic: 'f', artics: ['tremolo'] });
  chordPad(sb, 'choir', R.choir, 3, 4, { dynamic: 'p', toDynamic: 'f' });
  bassLine(sb, 'vc', R.vc, 1, 4, { pattern: 'pulse8', dynamic: 'mp', toDynamic: 'f' });
  impact(sb, 1, 'f');
  impact(sb, 3, 'mf');
  // the theme's first gesture, announced by the lead over the swell
  writeFit(sb, 'lead', 2, [octave(c.theme[0], c.leadOct), octave(c.theme[1], c.leadOct)], '!mp');
  sb.write('brass', 4, '!f rm');
}

function writeBody(sb: ScoreBuilder, c: CueSpec, b0: number) {
  const at = (off: number) => b0 + off;
  const span = (f: number, t: number) => clamp(sb, at(f), at(t));
  const A = span(0, 7), B = span(8, 15), BR = span(16, 19), D = span(20, 27), T = span(28, 31);
  const theme = c.theme.map((l) => octave(l, c.leadOct));

  // ── A: the beat drops in; the lead states the theme over offbeat bass, stabs and the ostinato
  if (A) {
    writeFit(sb, 'lead', A[0], theme, '!mf');
    houseBass(sb, c.bass, A[0], A[1], 'f');
    houseStabs(sb, c.stab, A[0] + 2, A[1], 'mp');
    brokenChord(sb, 'ost', 64, A[0], A[1], { shape: 'rising', step: 0.25, pattern: c.ostPattern, dynamic: 'mp' });
    chordPad(sb, 'pad', R.pad, A[0], A[1], { dynamic: 'p' });
    bassLine(sb, 'vc', R.vc, A[0], A[1], { pattern: 'pulse8', dynamic: 'mp' });
    impact(sb, A[0], 'f');
  }
  // ── B: the theme an octave up in the strings, brass chords and choir join
  if (B) {
    writeFit(sb, 'str', B[0], theme.map((l) => octave(l, 1)), '!f');
    writeFit(sb, 'lead', B[0], theme, '!f');
    houseBass(sb, c.bass, B[0], B[1], 'f');
    houseStabs(sb, c.stab, B[0], B[1], 'mf');
    brokenChord(sb, 'ost', 64, B[0], B[1], { shape: 'rising', step: 0.25, pattern: c.ostPattern, dynamic: 'mf' });
    chordPad(sb, 'brass', R.brass, B[0], B[1], { dynamic: 'mf' });
    chordPad(sb, 'choir', R.choir, B[0] + 4, B[1], { dynamic: 'mp', toDynamic: 'mf' });
    bassLine(sb, 'vc', R.vc, B[0], B[1], { pattern: 'pulse8', dynamic: 'mf' });
  }
  // ── Breakdown: the kick drops out (in the drum layer); pads, choir, the answer phrase, celli driving, a build
  if (BR) {
    chordPad(sb, 'pad', R.pad, BR[0], BR[1], { dynamic: 'mp', toDynamic: 'f' });
    chordPad(sb, 'choir', R.choir, BR[0], BR[1], { dynamic: 'mp', toDynamic: 'ff' });
    writeFit(sb, 'lead', BR[0], c.answer.map((l) => octave(l, c.leadOct - (Number(l.match(/\d/)?.[0]) >= 6 ? 1 : 0))), '!mf');
    sustainVoices(sb, ['str'], [R.str[0]], BR[0], BR[1], { dynamic: 'mp', toDynamic: 'ff', artics: ['tremolo'] });
    bassLine(sb, 'vc', R.vc, BR[0], BR[1], { pattern: 'pulse8', dynamic: 'mf', toDynamic: 'ff' });
    brokenChord(sb, 'ost', 64, BR[0] + 2, BR[1], { shape: 'rising', step: 0.25, pattern: c.ostPattern, dynamic: 'p', toDynamic: 'f' });
  }
  // ── Drop: everything — theme in brass, strings an octave above, choir, impact on the one
  if (D) {
    writeFit(sb, 'brass', D[0], theme, '!ff');
    writeFit(sb, 'str', D[0], theme.map((l) => octave(l, 1)), '!ff');
    writeFit(sb, 'lead', D[0], theme, '!f');
    chordPad(sb, 'choir', R.choir, D[0], D[1], { dynamic: 'f' });
    chordPad(sb, 'pad', R.pad, D[0], D[1], { dynamic: 'mf' });
    houseBass(sb, c.bass, D[0], D[1], 'ff');
    houseStabs(sb, c.stab, D[0], D[1], 'f');
    brokenChord(sb, 'ost', 64, D[0], D[1], { shape: 'rising', step: 0.25, pattern: c.ostPattern, dynamic: 'f' });
    bassLine(sb, 'vc', R.vc, D[0], D[1], { pattern: 'pulse8', dynamic: 'f' });
    impact(sb, D[0], 'ff');
    if (D[0] + 4 <= D[1]) impact(sb, D[0] + 4, 'f');
  }
  // ── Turn: the answer phrase in the strings, groove continues, back round to the top
  if (T) {
    writeFit(sb, 'str', T[0], c.answer, '!f');
    writeFit(sb, 'lead', T[0], c.answer.map((l) => octave(l, -1)), '!mf');
    houseBass(sb, c.bass, T[0], T[1], 'f');
    houseStabs(sb, c.stab, T[0], T[1], 'mf');
    brokenChord(sb, 'ost', 64, T[0], T[1], { shape: 'rising', step: 0.25, pattern: c.ostPattern, dynamic: 'mf' });
    chordPad(sb, 'brass', R.brass, T[0], T[1], { dynamic: 'mf', toDynamic: 'f' });
    bassLine(sb, 'vc', R.vc, T[0], T[1], { pattern: 'pulse8', dynamic: 'mf' });
  }
}

export function buildCue(c: CueSpec): Score {
  const sb = new ScoreBuilder({
    id: `era-clash-${c.id}`,
    title: c.title,
    subtitle: 'Era Clash · arena theme',
    composer: 'Plajah Chora Scoring',
    bpm: c.bpm, beatsPerBar: 4, beatUnit: 4,
    keyFifths: c.keyFifths, keyMode: 'minor',
    parts: partsFor(c),
  }, TOTAL_BARS);

  sb.harmony(1, c.intro);
  const body = `${c.progA} | ${c.progA} | ${c.progA} | ${c.progA} | ${c.progB} | ${c.progA} | ${c.progA} | ${c.progC}`;
  for (let b0 = INTRO_BARS + 1; b0 <= TOTAL_BARS; b0 += BODY_BARS) {
    const segs = body.split('|').map((s) => s.trim());
    sb.harmony(b0, segs.slice(0, TOTAL_BARS - b0 + 1).join(' | '));
  }
  sb.section(1, 'Intro', 'Intro');
  writeIntro(sb, c);
  for (let b0 = INTRO_BARS + 1; b0 <= TOTAL_BARS; b0 += BODY_BARS) {
    BODY_SECTIONS.forEach((s) => b0 + s.from <= TOTAL_BARS && sb.section(b0 + s.from, s.type, s.type));
    writeBody(sb, c, b0);
  }
  return sb.score;
}

/** Section type of a bar (1-based) in the laid-out score — for the drum programmer. */
export function sectionOfBar(bar: number): { type: SectionType; offset: number; len: number } {
  if (bar <= INTRO_BARS) return { type: 'intro', offset: bar - 1, len: INTRO_BARS };
  const inBody = (bar - INTRO_BARS - 1) % BODY_BARS;
  const s = BODY_SECTIONS.find((x) => inBody >= x.from && inBody <= x.to)!;
  return { type: s.type, offset: inBody - s.from, len: s.to - s.from + 1 };
}
