// earTraining.ts — the Ear Gym's brain: drills, levels, spaced repetition and contrast feedback.
//
// Design rules (each traces to services/musicPedagogy/philosophy.ts):
//   • Sound before symbol — every drill starts from what you HEAR; names and notation come after.
//   • Start with the biggest contrast — intervals open with P5 vs P8, chords with major vs minor,
//     and new categories arrive only once the current set is ~85 % reliable (perceptual learning
//     and mastery gating).
//   • Context, not isolation — scale degrees are always heard against a cadence that sets the key,
//     and every degree answer "resolves home" afterwards (functional / tonal hearing).
//   • Spaced + interleaved — each item (e.g. "intervals:M3:asc") sits in a Leitner box; due items
//     come back across days, and the Daily Mix shuffles drills together instead of blocking them.
//   • Contrastive feedback — a miss replays the right answer AND what you chose, side by side, and
//     the confusion is remembered so the pair you mix up gets drilled until you don't.
//
// Pure logic + audio closures; storage is localStorage per user (guests included). Ledger writes
// happen at session end via musicLedger.ts.

import { chord, melody, note, progression, rhythm as playRhythm } from './earAudio';

// ── Vocabulary ────────────────────────────────────────────────────────────────

export type GymModeId = 'contour' | 'majmin' | 'intervals' | 'chords' | 'degrees' | 'rhythm' | 'melody' | 'cadences';
export type Direction = 'asc' | 'desc' | 'harm';
export type BandId = 'K2' | '35' | '68' | 'HS';

export const INTERVALS: Record<string, { semis: number; name: string; color: string }> = {
  m2: { semis: 1, name: 'minor 2nd', color: 'tight, crunchy — a half step' },
  M2: { semis: 2, name: 'Major 2nd', color: 'a plain step, like walking' },
  m3: { semis: 3, name: 'minor 3rd', color: 'wistful, the bottom of a minor chord' },
  M3: { semis: 4, name: 'Major 3rd', color: 'bright and sunny, the bottom of a major chord' },
  P4: { semis: 5, name: 'Perfect 4th', color: 'open and announcing — "here we go"' },
  TT: { semis: 6, name: 'Tritone', color: 'restless, a siren that wants to move' },
  P5: { semis: 7, name: 'Perfect 5th', color: 'hollow and strong, the power chord' },
  m6: { semis: 8, name: 'minor 6th', color: 'yearning, bittersweet' },
  M6: { semis: 9, name: 'Major 6th', color: 'warm, wide and singing' },
  m7: { semis: 10, name: 'minor 7th', color: 'bluesy, unresolved' },
  M7: { semis: 11, name: 'Major 7th', color: 'dreamy, one step short of the octave' },
  P8: { semis: 12, name: 'Octave', color: 'the same note, higher — fully at rest' },
};

/**
 * Public-domain reference songs — the first two notes ARE the interval. Only anchors we are sure
 * of; an interval without a reliable public-domain anchor is learned by its colour instead.
 */
export const INTERVAL_ANCHORS: Record<string, { asc?: string; desc?: string }> = {
  m2: { desc: '“Für Elise” (Beethoven) — the first two notes' },
  M2: { asc: '“Frère Jacques” — “Frè-re”', desc: '“Mary Had a Little Lamb” — “Ma-ry”' },
  m3: { asc: '“Greensleeves” — “A-las”', desc: '“This Old Man” — “This old”' },
  M3: { asc: '“When the Saints Go Marching In” — “Oh, when”', desc: '“Swing Low, Sweet Chariot” — “Swing low”' },
  P4: { asc: '“Here Comes the Bride” (Wagner) — “Here comes”' },
  P5: { asc: '“Twinkle, Twinkle, Little Star” — “Twinkle, twinkle”' },
  m6: { asc: '“The Entertainer” (Joplin) — the leap after the opening run' },
  M6: { asc: '“My Bonnie Lies Over the Ocean” — “My Bon-”' },
  P8: { asc: '“Take Me Out to the Ball Game” — “Take me”' },
};

export const CHORDS: Record<string, { tones: number[]; name: string; color: string }> = {
  maj: { tones: [0, 4, 7], name: 'Major', color: 'bright, settled' },
  min: { tones: [0, 3, 7], name: 'Minor', color: 'dark, inward' },
  dim: { tones: [0, 3, 6], name: 'Diminished', color: 'tense, squeezed' },
  aug: { tones: [0, 4, 8], name: 'Augmented', color: 'floating, dream-sequence' },
  maj7: { tones: [0, 4, 7, 11], name: 'Major 7th', color: 'lush, jazzy calm' },
  dom7: { tones: [0, 4, 7, 10], name: 'Dominant 7th', color: 'bluesy, wants to resolve' },
  min7: { tones: [0, 3, 7, 10], name: 'minor 7th', color: 'mellow, soulful' },
  m7b5: { tones: [0, 3, 6, 10], name: 'Half-diminished', color: 'questioning, noir' },
  dim7: { tones: [0, 3, 6, 9], name: 'Diminished 7th', color: 'silent-film villain' },
};

export const SOLFEGE = ['do', 're', 'mi', 'fa', 'sol', 'la', 'ti'] as const;
export type Syllable = typeof SOLFEGE[number];
const DEGREE_SEMIS: Record<Syllable, number> = { do: 0, re: 2, mi: 4, fa: 5, sol: 7, la: 9, ti: 11 };
/** How each degree walks home — hearing the pull is what makes the degree memorable. */
const RESOLVE: Record<Syllable, number[]> = {
  do: [0], re: [2, 0], mi: [4, 2, 0], fa: [5, 4, 2, 0], sol: [7, 9, 11, 12], la: [9, 11, 12], ti: [11, 12],
};
export const DEGREE_FEEL: Record<Syllable, string> = {
  do: 'home — completely at rest', re: 'a step away, leaning down to do', mi: 'bright and stable, the colour of major',
  fa: 'heavy, wants to sink to mi', sol: 'strong and open, the second home', la: 'tender, a little sad', ti: 'the leading tone — aches to rise to do',
};

export const CADENCES: Record<string, { name: string; romans: string; color: string }> = {
  authentic: { name: 'Authentic', romans: 'V → I', color: 'a full stop — “The End.”' },
  half: { name: 'Half', romans: '… → V', color: 'a comma — the phrase asks a question' },
  plagal: { name: 'Plagal', romans: 'IV → I', color: 'a soft “Amen”' },
  deceptive: { name: 'Deceptive', romans: 'V → vi', color: 'a plot twist — you expected home' },
};

// ── Rhythm cells (durations in quarter-note beats; negative = rest) ──────────────
export interface RhythmCell { id: string; beats: number[]; label: string }
export const RHYTHM_CELLS: Record<string, RhythmCell> = {
  w: { id: 'w', beats: [4], label: 'whole note' },
  dh: { id: 'dh', beats: [3], label: 'dotted half' },
  h: { id: 'h', beats: [2], label: 'half note' },
  hr: { id: 'hr', beats: [-2], label: 'half rest' },
  q: { id: 'q', beats: [1], label: 'quarter note' },
  qr: { id: 'qr', beats: [-1], label: 'quarter rest' },
  ee: { id: 'ee', beats: [0.5, 0.5], label: 'two eighths' },
  er_e: { id: 'er_e', beats: [-0.5, 0.5], label: 'eighth rest + eighth' },
  dqe: { id: 'dqe', beats: [1.5, 0.5], label: 'dotted quarter + eighth' },
  ssss: { id: 'ssss', beats: [0.25, 0.25, 0.25, 0.25], label: 'four sixteenths' },
  ess: { id: 'ess', beats: [0.5, 0.25, 0.25], label: 'eighth + two sixteenths' },
  sse: { id: 'sse', beats: [0.25, 0.25, 0.5], label: 'two sixteenths + eighth' },
  eqe: { id: 'eqe', beats: [0.5, 1, 0.5], label: 'syncopa (eighth–quarter–eighth)' },
  trip: { id: 'trip', beats: [1 / 3, 1 / 3, 1 / 3], label: 'eighth-note triplet' },
};
export const cellLength = (c: RhythmCell) => c.beats.reduce((s, b) => s + Math.abs(b), 0);

// ── Modes & levels ────────────────────────────────────────────────────────────

export interface LevelDef { label: string; items: string[] }
export interface ModeDef {
  id: GymModeId;
  title: string;
  tagline: string;
  emoji: string;
  band: BandId;
  /** Ledger standard this drill evidences (data/educationStandards.ts). */
  standardId: string;
  levels: LevelDef[];
}

export const MODES: ModeDef[] = [
  {
    id: 'contour', title: 'Up or Down?', emoji: '🎈', band: 'K2', standardId: 'MUSIC.EAR.K2',
    tagline: 'Does the melody climb, fall or stay? The first skill of every musician.',
    levels: [
      { label: 'Two notes', items: ['up', 'down', 'same'] },
      { label: 'Three-note shapes', items: ['up-up', 'up-down', 'down-up', 'down-down'] },
    ],
  },
  {
    id: 'majmin', title: 'Sunny or Stormy', emoji: '🌤️', band: '35', standardId: 'MUSIC.EAR.35',
    tagline: 'Major or minor — the most important colour switch in music.',
    levels: [
      { label: 'Chords', items: ['major', 'minor'] },
      { label: 'Scales', items: ['major', 'minor'] },
    ],
  },
  {
    id: 'intervals', title: 'Interval Lab', emoji: '📏', band: '68', standardId: 'MUSIC.EAR.68',
    tagline: 'The distance between two notes — the atoms of melody and harmony.',
    levels: [
      { label: 'Octave vs fifth', items: ['P5', 'P8'] },
      { label: '+ Major 3rd', items: ['M3', 'P5', 'P8'] },
      { label: '+ Perfect 4th', items: ['M3', 'P4', 'P5', 'P8'] },
      { label: '+ Steps & minor 3rd', items: ['M2', 'm3', 'M3', 'P4', 'P5', 'P8'] },
      { label: '+ Sixths & half step', items: ['m2', 'M2', 'm3', 'M3', 'P4', 'P5', 'M6', 'P8'] },
      { label: '+ minor 6th & 7th', items: ['m2', 'M2', 'm3', 'M3', 'P4', 'P5', 'm6', 'M6', 'm7', 'P8'] },
      { label: 'All twelve', items: Object.keys(INTERVALS) },
    ],
  },
  {
    id: 'chords', title: 'Chord Colours', emoji: '🎨', band: '68', standardId: 'MUSIC.HAR.68',
    tagline: 'Hear the quality of a chord the way you see the colour of paint.',
    levels: [
      { label: 'Major vs minor', items: ['maj', 'min'] },
      { label: '+ Diminished', items: ['maj', 'min', 'dim'] },
      { label: '+ Augmented', items: ['maj', 'min', 'dim', 'aug'] },
      { label: 'Seventh chords', items: ['maj7', 'dom7', 'min7'] },
      { label: 'All sevenths', items: ['maj7', 'dom7', 'min7', 'm7b5', 'dim7'] },
    ],
  },
  {
    id: 'degrees', title: 'Find Home', emoji: '🏠', band: '68', standardId: 'MUSIC.EAR.68',
    tagline: 'Hear a key, then name the note by how it feels — do, re, mi.',
    levels: [
      { label: 'do & sol', items: ['do', 'sol'] },
      { label: '+ mi', items: ['do', 'mi', 'sol'] },
      { label: '+ re & fa', items: ['do', 're', 'mi', 'fa', 'sol'] },
      { label: 'Full scale', items: [...SOLFEGE] },
    ],
  },
  {
    id: 'rhythm', title: 'Rhythm Reader', emoji: '🥁', band: '35', standardId: 'MUSIC.RHY.35',
    tagline: 'Hear a bar, find it on the page. Rhythm is just fractions you can dance to.',
    levels: [
      { label: 'Quarters, halves, wholes', items: ['q', 'h', 'w', 'qr'] },
      { label: '+ Eighths', items: ['q', 'h', 'w', 'qr', 'ee'] },
      { label: '+ Dots & rests', items: ['q', 'h', 'qr', 'ee', 'dh', 'dqe', 'hr'] },
      { label: '+ Sixteenths', items: ['q', 'qr', 'ee', 'dqe', 'ssss', 'ess', 'sse'] },
      { label: 'Syncopation & triplets', items: ['q', 'ee', 'dqe', 'ssss', 'eqe', 'trip', 'er_e'] },
    ],
  },
  {
    id: 'melody', title: 'Melody Detective', emoji: '🔎', band: 'HS', standardId: 'MUSIC.EAR.HS',
    tagline: 'Hear a short tune, then spell it in solfège. Real dictation, one clue at a time.',
    levels: [
      { label: 'do–re–mi, 3 notes', items: ['do', 're', 'mi'] },
      { label: 'do to sol, 4 notes', items: ['do', 're', 'mi', 'fa', 'sol'] },
      { label: 'Whole scale, 5 notes', items: [...SOLFEGE] },
    ],
  },
  {
    id: 'cadences', title: 'Punctuation', emoji: '🔚', band: 'HS', standardId: 'MUSIC.EAR.HS',
    tagline: 'Cadences are music’s commas and full stops. Hear how the phrase ends.',
    levels: [
      { label: 'Full stop vs comma', items: ['authentic', 'half'] },
      { label: '+ Amen', items: ['authentic', 'half', 'plagal'] },
      { label: '+ Plot twist', items: ['authentic', 'half', 'plagal', 'deceptive'] },
    ],
  },
];

export const modeById = (id: GymModeId) => MODES.find(m => m.id === id)!;

// ── Progress model (Leitner boxes + level gating + confusion memory) ────────────

const BOX_MS = [0, 10 * 60e3, 864e5, 3 * 864e5, 7 * 864e5, 21 * 864e5];
const GATE_N = 16;          // answers needed at a level before it can unlock the next
const GATE_ACC = 0.85;      // accuracy over those answers

export interface ItemStat { box: number; due: number; seen: number; right: number }
export interface ModeStat { level: number; recent: boolean[]; confusions: Record<string, number> }
export interface GymProgress {
  v: 1;
  items: Record<string, ItemStat>;
  modes: Partial<Record<GymModeId, ModeStat>>;
  xp: number;
  streakDays: number;
  lastDay: string;
}

const key = (uid: string) => `earGym.v1.${uid}`;
const today = () => new Date().toISOString().slice(0, 10);

export function loadGym(uid: string): GymProgress {
  try {
    const raw = localStorage.getItem(key(uid));
    if (raw) return JSON.parse(raw) as GymProgress;
  } catch { /* fall through */ }
  return { v: 1, items: {}, modes: {}, xp: 0, streakDays: 0, lastDay: '' };
}

export function saveGym(uid: string, p: GymProgress): void {
  try { localStorage.setItem(key(uid), JSON.stringify(p)); } catch { /* quota / private mode */ }
}

export function modeStat(p: GymProgress, m: GymModeId): ModeStat {
  return p.modes[m] ?? (p.modes[m] = { level: 0, recent: [], confusions: {} });
}

/** Mastery 0–1 for a drill: levels cleared plus accuracy within the current level. */
export function modeMastery(p: GymProgress, m: GymModeId): number {
  const def = modeById(m);
  const s = p.modes[m];
  if (!s) return 0;
  const acc = s.recent.length ? s.recent.filter(Boolean).length / s.recent.length : 0;
  return Math.min(1, (s.level + acc * Math.min(1, s.recent.length / GATE_N)) / def.levels.length);
}

export interface AnswerOutcome { levelUp: boolean; xp: number }

/** Record one answer: Leitner box, recent window, confusion pair, level gate, XP and streak. */
export function recordAnswer(p: GymProgress, q: GymQuestion, chosen: string, combo: number): AnswerOutcome {
  const ok = chosen === q.answer;
  const now = Date.now();
  const st = p.items[q.itemKey] ?? { box: 0, due: 0, seen: 0, right: 0 };
  st.seen++;
  if (ok) { st.right++; st.box = Math.min(BOX_MS.length - 1, st.box + 1); }
  else st.box = 0;
  st.due = now + BOX_MS[st.box];
  p.items[q.itemKey] = st;

  const ms = modeStat(p, q.mode);
  ms.recent = [...ms.recent, ok].slice(-GATE_N);
  if (!ok && q.kind === 'choice') {
    const pair = [q.answer, chosen].sort().join('|');
    ms.confusions[pair] = (ms.confusions[pair] || 0) + 1;
  } else if (ok) {
    for (const k of Object.keys(ms.confusions)) {
      if (k.split('|').includes(q.answer)) ms.confusions[k] = Math.max(0, ms.confusions[k] - 0.5);
    }
  }

  let levelUp = false;
  const def = modeById(q.mode);
  if (ms.level < def.levels.length - 1 && ms.recent.length >= GATE_N
    && ms.recent.filter(Boolean).length / ms.recent.length >= GATE_ACC) {
    ms.level++;
    ms.recent = [];
    levelUp = true;
  }

  const d = today();
  if (p.lastDay !== d) {
    const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    p.streakDays = p.lastDay === y ? p.streakDays + 1 : 1;
    p.lastDay = d;
  }
  const xp = ok ? 10 + Math.min(20, combo * 2) : 2; // showing up still counts
  p.xp += xp + (levelUp ? 50 : 0);
  return { levelUp, xp };
}

// ── Questions ─────────────────────────────────────────────────────────────────

export interface Choice { id: string; label: string; sub?: string }

export interface GymQuestion {
  mode: GymModeId;
  /** Spaced-repetition key, e.g. 'intervals:M3:asc'. */
  itemKey: string;
  kind: 'choice' | 'sequence';
  prompt: string;
  answer: string;
  choices: Choice[];
  /** sequence questions: the syllables the learner taps, and how many notes to enter. */
  pool?: Syllable[];
  length?: number;
  /** Rhythm questions: each choice id maps to its bar of cells for the notation renderer. */
  bars?: Record<string, RhythmCell[]>;
  /** Play the question. Returns when (AudioContext time) it finishes. */
  play: () => number;
  /** Play a specific choice — powers "hear the difference" after a miss. */
  playChoice?: (choiceId: string) => number;
  /** After answering: why, in plain words, plus a memory anchor when we have one. */
  explain: (choiceId: string) => string;
  anchor?: string;
}

const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];
function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/**
 * Choose the next target item for a mode: confused pairs first (30 %), then whatever is most
 * overdue in its Leitner box, with a little randomness so the order never becomes predictable.
 */
function chooseItem(p: GymProgress, mode: GymModeId, items: string[], suffix = ''): string {
  const ms = modeStat(p, mode);
  const hot = Object.entries(ms.confusions).filter(([, n]) => n >= 1).sort((a, b) => b[1] - a[1]);
  if (hot.length && Math.random() < 0.3) {
    const cand = hot[0][0].split('|').filter(x => items.includes(x));
    if (cand.length) return pick(cand);
  }
  const now = Date.now();
  const scored = items.map(it => {
    const st = p.items[`${mode}:${it}${suffix}`];
    const overdue = st ? (now - st.due) / 864e5 : 1; // unseen items count as due
    const weak = st ? 1 - st.box / (BOX_MS.length - 1) : 1;
    return { it, score: overdue + weak * 2 + Math.random() * 1.5 };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].it;
}

const levelItems = (p: GymProgress, m: GymModeId) => {
  const def = modeById(m);
  return def.levels[Math.min(modeStat(p, m).level, def.levels.length - 1)].items;
};

export interface BuildOpts { direction?: Direction | 'mixed' }

export function buildQuestion(p: GymProgress, mode: GymModeId, opts: BuildOpts = {}): GymQuestion {
  switch (mode) {
    case 'contour': return contourQ(p);
    case 'majmin': return majMinQ(p);
    case 'intervals': return intervalQ(p, opts.direction ?? 'asc');
    case 'chords': return chordQ(p);
    case 'degrees': return degreeQ(p);
    case 'rhythm': return rhythmQ(p);
    case 'melody': return melodyQ(p);
    case 'cadences': return cadenceQ(p);
  }
}

function contourQ(p: GymProgress): GymQuestion {
  const lvl = modeStat(p, 'contour').level;
  const items = levelItems(p, 'contour');
  const target = chooseItem(p, 'contour', items);
  const start = rnd(57, 69);
  const stepFor = (dir: string) => (dir === 'up' ? rnd(3, 7) : dir === 'down' ? -rnd(3, 7) : 0);
  const notesFor = (shape: string) => {
    const out = [start];
    for (const part of shape.split('-')) out.push(out[out.length - 1] + stepFor(part));
    return out;
  };
  const seqs: Record<string, number[]> = Object.fromEntries(items.map(it => [it, notesFor(it)]));
  const label = (s: string) => s.split('-').map(x => (x === 'up' ? '⬆️' : x === 'down' ? '⬇️' : '➡️')).join(' ') + '  ' + s.replace('-', ' then ');
  return {
    mode: 'contour', itemKey: `contour:${target}`, kind: 'choice',
    prompt: lvl === 0 ? 'Does the second note go up, down, or stay the same?' : 'Trace the shape: what does the melody do?',
    answer: target,
    choices: items.map(it => ({ id: it, label: label(it) })),
    play: () => melody(seqs[target], 0, 0.7, 0.7),
    playChoice: id => melody(seqs[id], 0, 0.7, 0.7),
    explain: () => 'Pitch is height: faster vibrations sound “higher”. Try drawing the shape in the air with your hand as you listen.',
  };
}

function majMinQ(p: GymProgress): GymQuestion {
  const lvl = modeStat(p, 'majmin').level;
  const target = chooseItem(p, 'majmin', ['major', 'minor']);
  const root = rnd(55, 64);
  const third = (q: string) => (q === 'major' ? 4 : 3);
  const playFor = (q: string) => lvl === 0
    ? (() => { const t = melody([root, root + third(q), root + 7], 0, 0.42, 0.5); return chord([root, root + third(q), root + 7], t + 0.1, 1.6); })()
    : melody([0, 2, third(q), 5, 7, 5, third(q), 2, 0].map(s => root + s), 0, 0.3, 0.34);
  return {
    mode: 'majmin', itemKey: `majmin:${target}:${lvl}`, kind: 'choice',
    prompt: lvl === 0 ? 'Is this chord major (sunny) or minor (stormy)?' : 'Is this scale major or minor?',
    answer: target,
    choices: [{ id: 'major', label: '☀️ Major' }, { id: 'minor', label: '🌧️ Minor' }],
    play: () => playFor(target),
    playChoice: id => playFor(id),
    explain: () => 'The whole difference is ONE note — the third. Raise it a half step and minor turns major. Listen for that middle note.',
  };
}

function intervalQ(p: GymProgress, dirOpt: Direction | 'mixed'): GymQuestion {
  const items = levelItems(p, 'intervals');
  const dir: Direction = dirOpt === 'mixed' ? pick(['asc', 'desc', 'harm'] as const) : dirOpt;
  const target = chooseItem(p, 'intervals', items, `:${dir}`);
  const root = dir === 'desc' ? rnd(64, 74) : rnd(52, 62);
  const playFor = (iv: string) => {
    const s = INTERVALS[iv].semis;
    if (dir === 'harm') return chord([root, root + s], 0, 1.8, 0.45);
    return melody(dir === 'asc' ? [root, root + s] : [root, root - s], 0, 0.75, 0.9);
  };
  const anchor = INTERVAL_ANCHORS[target]?.[dir === 'desc' ? 'desc' : 'asc'];
  return {
    mode: 'intervals', itemKey: `intervals:${target}:${dir}`, kind: 'choice',
    prompt: dir === 'harm' ? 'Two notes together — what interval?' : `Two notes, ${dir === 'asc' ? 'rising' : 'falling'} — what interval?`,
    answer: target,
    choices: items.map(iv => ({ id: iv, label: iv, sub: INTERVALS[iv].name })),
    play: () => playFor(target),
    playChoice: id => playFor(id),
    anchor,
    explain: () => `${INTERVALS[target].name}: ${INTERVALS[target].color}. ${INTERVALS[target].semis} half step${INTERVALS[target].semis === 1 ? '' : 's'} apart.`,
  };
}

function chordQ(p: GymProgress): GymQuestion {
  const lvl = modeStat(p, 'chords').level;
  const items = levelItems(p, 'chords');
  const target = chooseItem(p, 'chords', items);
  const root = rnd(50, 60);
  const playFor = (q: string) => {
    const ns = CHORDS[q].tones.map(t => root + t);
    if (lvl <= 1) { const t = melody(ns, 0, 0.32, 0.4); return chord(ns, t + 0.1, 1.8); }
    return chord(ns, 0, 2);
  };
  return {
    mode: 'chords', itemKey: `chords:${target}`, kind: 'choice',
    prompt: 'What colour is this chord?',
    answer: target,
    choices: items.map(c => ({ id: c, label: CHORDS[c].name, sub: CHORDS[c].color })),
    play: () => playFor(target),
    playChoice: id => playFor(id),
    explain: () => `${CHORDS[target].name} — ${CHORDS[target].color}. Built from ${CHORDS[target].tones.join('-')} half steps above the root.`,
  };
}

/** Root-position triads for I, IV, V, vi in a major key, voiced around middle C. */
function keyChords(tonic: number) {
  return {
    I: [tonic - 12, tonic, tonic + 4, tonic + 7],
    IV: [tonic - 7, tonic, tonic + 5, tonic + 9],
    V: [tonic - 5, tonic - 1, tonic + 2, tonic + 7],
    vi: [tonic - 3, tonic, tonic + 4, tonic + 9],
  };
}

function degreeQ(p: GymProgress): GymQuestion {
  const items = levelItems(p, 'degrees') as Syllable[];
  const target = chooseItem(p, 'degrees', items) as Syllable;
  const tonic = rnd(57, 64);
  const k = keyChords(tonic);
  const cadence = [k.I, k.IV, k.V, k.I];
  const resolve = (s: Syllable, when: number) => melody(RESOLVE[s].map(x => tonic + x), when, 0.42, 0.5);
  return {
    mode: 'degrees', itemKey: `degrees:${target}`, kind: 'choice',
    prompt: 'Listen to the key, then the note. Which degree is it?',
    answer: target,
    choices: items.map(s => ({ id: s, label: s, sub: `${SOLFEGE.indexOf(s) + 1}` })),
    play: () => { const t = progression(cadence, 0, 0.62); return note(tonic + DEGREE_SEMIS[target], t + 0.35, 1.3, 0.6); },
    // After answering we don't replay the cadence — we let the note walk home so the pull is heard.
    playChoice: id => resolve(id as Syllable, 0),
    explain: () => `${target} feels ${DEGREE_FEEL[target]}. Hear it walk home: ${RESOLVE[target].map(x => SOLFEGE[[0, 2, 4, 5, 7, 9, 11, 12].indexOf(x) % 7]).join(' → ')}.`,
  };
}

function randomBar(cellIds: string[]): RhythmCell[] {
  for (let tries = 0; tries < 40; tries++) {
    const bar: RhythmCell[] = [];
    let left = 4;
    while (left > 1e-6) {
      const fits = cellIds.map(id => RHYTHM_CELLS[id]).filter(c => cellLength(c) <= left + 1e-6);
      if (!fits.length) break;
      // Prefer shorter cells so bars have something to read; whole notes stay occasional.
      const c = Math.random() < 0.75 ? pick(fits.filter(f => cellLength(f) <= 2).length ? fits.filter(f => cellLength(f) <= 2) : fits) : pick(fits);
      bar.push(c);
      left -= cellLength(c);
    }
    if (Math.abs(left) < 1e-6 && bar.some(c => c.beats.some(b => b > 0))) return bar;
  }
  return [RHYTHM_CELLS.q, RHYTHM_CELLS.q, RHYTHM_CELLS.q, RHYTHM_CELLS.q];
}

const barKey = (bar: RhythmCell[]) => bar.map(c => c.id).join(' ');

/**
 * Where the attacks fall. A struck tone decays, so "half note" and "quarter + quarter rest" sound
 * almost identical — options are kept apart by their onsets, never by sustain alone.
 */
function onsetKey(bar: RhythmCell[]): string {
  const out: string[] = [];
  let t = 0;
  for (const b of bar.flatMap(c => c.beats)) { if (b > 0) out.push(t.toFixed(3)); t += Math.abs(b); }
  return out.join(',');
}

function mutate(bar: RhythmCell[], cellIds: string[]): RhythmCell[] | null {
  const i = rnd(0, bar.length - 1);
  const len = cellLength(bar[i]);
  const alts = cellIds.map(id => RHYTHM_CELLS[id]).filter(c => c.id !== bar[i].id && Math.abs(cellLength(c) - len) < 1e-6);
  if (alts.length) { const b = [...bar]; b[i] = pick(alts); return b; }
  return null;
}

function rhythmQ(p: GymProgress): GymQuestion {
  const cells = levelItems(p, 'rhythm');
  // The SRS item for rhythm is the cell the bar is built around, so weak cells get more airtime.
  const focus = chooseItem(p, 'rhythm', cells);
  let bar = randomBar(cells);
  if (!bar.some(c => c.id === focus) && cellLength(RHYTHM_CELLS[focus]) <= 4) {
    const rest = randomBar(cells.filter(c => cellLength(RHYTHM_CELLS[c]) <= 4 - cellLength(RHYTHM_CELLS[focus])));
    const tail: RhythmCell[] = [];
    let left = 4 - cellLength(RHYTHM_CELLS[focus]);
    for (const c of rest) { if (cellLength(c) <= left + 1e-6) { tail.push(c); left -= cellLength(c); } }
    if (Math.abs(left) < 1e-6) bar = shuffle([RHYTHM_CELLS[focus], ...tail]);
  }
  const options = new Map<string, RhythmCell[]>([[barKey(bar), bar]]);
  const onsets = new Set([onsetKey(bar)]);
  for (let tries = 0; options.size < 4 && tries < 80; tries++) {
    const m = (tries < 30 ? mutate(bar, cells) : null) ?? randomBar(cells);
    if (onsets.has(onsetKey(m))) continue;
    onsets.add(onsetKey(m));
    options.set(barKey(m), m);
  }
  const ids = shuffle([...options.keys()]);
  const bpm = 80;
  return {
    mode: 'rhythm', itemKey: `rhythm:${focus}`, kind: 'choice',
    prompt: 'Four clicks count you in. Which bar did you hear?',
    answer: barKey(bar),
    choices: ids.map((id, i) => ({ id, label: String.fromCharCode(65 + i) })),
    bars: Object.fromEntries(options),
    play: () => playRhythm(bar.flatMap(c => c.beats), bpm),
    playChoice: id => playRhythm(options.get(id)!.flatMap(c => c.beats), bpm, 0, 72, false),
    explain: () => `The bar was: ${bar.map(c => c.label).join(', ')} — ${bar.map(c => cellLength(c)).map(fmtBeats).join(' + ')} = 4 beats.`,
  };
}

const fmtBeats = (b: number) => (Math.abs(b - 1 / 3) < 1e-6 ? '⅓' : b === 0.25 ? '¼' : b === 0.5 ? '½' : b === 1.5 ? '1½' : String(+b.toFixed(2)));

function melodyQ(p: GymProgress): GymQuestion {
  const lvl = modeStat(p, 'melody').level;
  const pool = levelItems(p, 'melody') as Syllable[];
  const len = [3, 4, 5][lvl] ?? 5;
  const maxLeap = [1, 2, 4][lvl] ?? 4;
  const seq: Syllable[] = ['do'];
  while (seq.length < len) {
    const cur = SOLFEGE.indexOf(seq[seq.length - 1]);
    const opts = pool.map(s => SOLFEGE.indexOf(s)).filter(i => i !== cur && Math.abs(i - cur) <= maxLeap);
    seq.push(SOLFEGE[pick(opts)]);
  }
  const tonic = rnd(57, 64);
  const k = keyChords(tonic);
  const toMidi = (s: Syllable) => tonic + DEGREE_SEMIS[s];
  return {
    mode: 'melody', itemKey: `melody:L${lvl}`, kind: 'sequence',
    prompt: `Hear the key, then a ${len}-note tune starting on do. Tap it back in solfège.`,
    answer: seq.join(' '),
    choices: [],
    pool, length: len,
    play: () => { const t = progression([k.I, k.V, k.I], 0, 0.55); return melody(seq.map(toMidi), t + 0.4, 0.6, 0.62); },
    playChoice: id => melody(id.split(' ').map(s => toMidi(s as Syllable)), 0, 0.6, 0.62),
    explain: () => `The tune was ${seq.join(' – ')}. Sing it back on solfège — the syllables are how your inner ear files melodies.`,
  };
}

function cadenceQ(p: GymProgress): GymQuestion {
  const items = levelItems(p, 'cadences');
  const target = chooseItem(p, 'cadences', items);
  const tonic = rnd(57, 64);
  const k = keyChords(tonic);
  const phrases: Record<string, number[][]> = {
    authentic: [k.I, k.IV, k.V, k.I],
    half: [k.I, k.vi, k.IV, k.V],
    plagal: [k.I, k.V, k.IV, k.I],
    deceptive: [k.I, k.IV, k.V, k.vi],
  };
  return {
    mode: 'cadences', itemKey: `cadences:${target}`, kind: 'choice',
    prompt: 'How does this phrase end?',
    answer: target,
    choices: items.map(c => ({ id: c, label: CADENCES[c].name, sub: CADENCES[c].romans })),
    play: () => progression(phrases[target], 0, 0.8),
    playChoice: id => progression(phrases[id], 0, 0.8),
    explain: () => `${CADENCES[target].name} cadence (${CADENCES[target].romans}): ${CADENCES[target].color}`,
  };
}

/** Daily Mix: interleave the learner's unlocked drills, weighted toward what's due. */
export function dailyMixMode(p: GymProgress, band: BandId): GymModeId {
  const order: BandId[] = ['K2', '35', '68', 'HS'];
  const ceiling = order.indexOf(band);
  const eligible = MODES.filter(m => order.indexOf(m.band) <= ceiling);
  const now = Date.now();
  const scored = eligible.map(m => {
    const due = Object.entries(p.items).filter(([k, s]) => k.startsWith(`${m.id}:`) && s.due <= now).length;
    const started = p.modes[m.id] ? 1 : 0;
    return { m: m.id, w: 1 + due * 0.5 + started + Math.random() * 2 };
  });
  scored.sort((a, b) => b.w - a.w);
  return scored[0].m;
}
