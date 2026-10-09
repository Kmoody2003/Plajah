// Composer Council: the music-for-books counterpart of the Melos Music Council and the Editorial Council. Aria is the single voice;
// these lenses are the team behind her. It reads a BOOK (page text, mood, ages, interactions) and returns DATA, not a verdict:
//   * one living Score per cue (cues are shared by pages with the same mood),
//   * a direction for every page: tempo, mood, play or stay silent, and whether the music grows, holds, slows or yields,
//   * a children's-audio lens: age-banded caps (velocity, tempo, range, attack jumps, density), applied to every cue and audited,
//   * a short deliberation (proposals, tensions, options) so the author can see WHY, and overrule anything.
//
// It works with NO AI key: the deterministic path picks a progression from the Melos progression repository (services/melos/progressionRepo),
// realises it with the Melos clip builder (progressionToClip), writes a seeded melody that is snapped to the key with Melos' snapToScale, and
// converts through the Melos<->Living bridge. An optional AI path (composeCueWithAi) asks Melos' promptToScore for the melody, then runs the
// SAME snap + lens, and falls back to the deterministic cue if the model call fails.
//
// Guides, never dictates: every decision carries a reason and a "your call" note; applying to a book is an explicit author action.
// Nothing here is audio-measured. The caps are conservative design rules for children's audio, not a loudness measurement; see HONESTY below.

import type { LivingBook, LivingPage, Score, ScoreNote, ScoreTrack, Behavior } from '../contracts';
import { MUSIC_PERSONAS } from '../../melos/council/musicCouncilPersonas';
import { getProgression } from '../../melos/progressionRepo';
import { nameToPc, pcName, realiseProgression, scalePitchClasses, snapToScale } from '../../melos/theory';
import { progressionToClip } from '../../melos/composition/progressionToClip';
import { mulberry32, hash32 } from '../audio/dsp';
import { noteToMidi } from '../audio/notes';
import { clipToScore } from './melosBridge';

// ───────────────────────── types ─────────────────────────
export type Mood = 'calm' | 'sleepy' | 'cozy' | 'playful' | 'curious' | 'wonder' | 'sad' | 'tense' | 'triumphant' | 'spooky' | 'adventure';
export const MOODS: Mood[] = ['calm', 'sleepy', 'cozy', 'playful', 'curious', 'wonder', 'sad', 'tense', 'triumphant', 'spooky', 'adventure'];

export type SoundInteraction = 'tap' | 'press' | 'drag' | 'proximity' | 'tilt' | 'note' | 'sfx';

export interface BookPageBrief {
  /** 1-based page number (LivingPage.page) */
  page: number;
  text?: string;
  /** author-stated mood; 'silent' asks for no music. Inferred from the text when absent. */
  mood?: Mood | 'silent';
  /** things the child can do on this page (only the ones that make sound matter to music) */
  interactions?: SoundInteraction[];
  /** read aloud (default true when there is text). The engine ducks music under narration by itself. */
  narrated?: boolean;
  /** author marks this page the emotional peak */
  climax?: boolean;
}

export interface BookMusicBrief {
  title?: string;
  ages: { min: number; max: number };
  pages: BookPageBrief[];
  /** same seed + same brief = same music */
  seed?: number;
}

export type ComposerPersonaId = 'CHILDRENS_SONG' | 'SCORER' | 'SOUND_DESIGNER' | 'WELLBEING' | 'MELOS_COMPOSER' | 'MELOS_MIX';

export interface ComposerPersona {
  id: ComposerPersonaId;
  name: string;
  epithet: string;
  lens: string;
  protects: string;
  challenges: string;
  voice: string;
  questions: string[];
  /** set when this seat is the existing Melos Music Council persona, reused as-is */
  reusesMelos?: 'COMPOSER' | 'MIX';
}

// ───────────────────────── personas ─────────────────────────
const melosComposer = MUSIC_PERSONAS.COMPOSER;
const melosMix = MUSIC_PERSONAS.MIX;

export const COMPOSER_PERSONAS: Record<ComposerPersonaId, ComposerPersona> = {
  CHILDRENS_SONG: {
    id: 'CHILDRENS_SONG', name: "The Children's-Song Composer", epithet: "the Children's-Song Composer",
    lens: 'Singability and memory: a small range, stepwise motion, a repeating shape a child can hum back after one page.',
    protects: 'The tune a child carries out of the book; repetition that feels like a game, not a loop.',
    challenges: 'Clever harmony that nobody can sing; melodies that leap past a child voice; cues that never repeat so nothing sticks.',
    voice: 'Warm, concrete, counts in bars and syllables. Would rather repeat a good phrase than invent a new one.',
    questions: ['Can a four-year-old hum this after hearing it twice?', 'Does the tune stay inside one octave?', 'Does it come back, so the child can recognise it?'],
  },
  SCORER: {
    id: 'SCORER', name: 'The Film & Game Scorer', epithet: 'the Film and Game Scorer',
    lens: 'Where music joins, grows, thins and leaves, so it serves the page turn rather than playing over the story.',
    protects: 'Contrast: a quiet page only lands after a fuller one; the climax gets room.',
    challenges: 'Wallpaper music on every page; the same energy from first page to last.',
    voice: 'Dramaturgical, talks in arcs, entrances and exits, and in what NOT to score.',
    questions: ['Where is the peak, and what comes before it?', 'Which pages should be silent so the next one matters?', 'Does the ending resolve, or stay open on purpose?'],
  },
  SOUND_DESIGNER: {
    id: 'SOUND_DESIGNER', name: 'The Sound Designer', epithet: 'the Sound Designer',
    lens: 'Space for the child\'s own sounds: taps, drags and notes are the instrument, the score is the room around them.',
    protects: 'Narration intelligibility and the child\'s cause-and-effect: a tap must be heard.',
    challenges: 'Music that masks the interactive sounds, or competes with the voice.',
    voice: 'Practical, talks in layers, ducking and frequency room, asks what the child is hearing now.',
    questions: ['What sound does the child make on this page, and does the score leave room for it?', 'Is the voice ever competing with the melody?', 'Does anything startle on a page turn?'],
  },
  WELLBEING: {
    id: 'WELLBEING', name: 'The Lullaby & Wellbeing Specialist', epithet: 'the Lullaby and Wellbeing Specialist',
    lens: 'Regulation: slow, even pulse, soft attacks and long fades, so the book can calm and close a day.',
    protects: 'The wind-down: no sudden changes, no tension that is not resolved, an ending that lands softly.',
    challenges: 'Energy that rises at bedtime; scary musical language for the youngest; sudden silence after sound.',
    voice: 'Gentle and measured; talks in breath, pulse, and how the last page leaves the child.',
    questions: ['Is the pulse slower than a calm heartbeat-at-rest feel, or racing?', 'Does anything arrive suddenly?', 'How does the last page leave the child?'],
  },
  MELOS_COMPOSER: {
    id: 'MELOS_COMPOSER', name: melosComposer.name, epithet: melosComposer.epithet,
    lens: melosComposer.lens, protects: melosComposer.protects, challenges: melosComposer.challenges, voice: melosComposer.voice,
    questions: melosComposer.questions, reusesMelos: 'COMPOSER',
  },
  MELOS_MIX: {
    id: 'MELOS_MIX', name: melosMix.name, epithet: melosMix.epithet,
    lens: melosMix.lens, protects: melosMix.protects, challenges: melosMix.challenges, voice: melosMix.voice,
    questions: melosMix.questions, reusesMelos: 'MIX',
  },
};
export const COMPOSER_COUNCIL_LIST: ComposerPersona[] = Object.values(COMPOSER_PERSONAS);

/** The method note Aria carries into any book-music conversation (kept here so ariaCreativeRoles.ts stays untouched). */
export const ARIA_COMPOSER_COUNCIL_METHOD = `For music in a children's book or Tela page, convene internal composer lenses: a children's-song composer (singability, repetition), a film and game scorer (arc, entrances, silence), a sound designer (room for the child's own sounds and the narrator), a lullaby and wellbeing specialist (regulation, soft closings), and the existing Melos composer and mix seats. They are not mascots and do not role-play conversation. Let each make a materially different proposal, name the strongest disagreement out loud, and synthesize without averaging. Treat silence as a musical choice. For ages 2-4 never use sudden loud onsets, scary harmony, or fast pulses; say what you softened and why. Give options and what would change your recommendation; the author keeps every decision and can decline any cue. Say plainly that nothing was auditioned or loudness-measured unless it was.`;

// ───────────────────────── children's-audio lens ─────────────────────────
export type AgeBand = 'toddler' | 'early' | 'middle';

export interface ChildrensCaps {
  band: AgeBand;
  label: string;
  /** highest ScoreNote velocity allowed (0..1) */
  maxVelocity: number;
  /** widest velocity spread inside one cue (gentle dynamics) */
  maxVelocitySpan: number;
  /** biggest jump above the recent average velocity a note may make (no startle) */
  maxAttackJump: number;
  /** suggested LivingBook.defaults.musicGain ceiling */
  maxMusicGain: number;
  minTempo: number;
  maxTempo: number;
  lowestMidi: number;
  highestMidi: number;
  /** instruments that may not appear at all (shrill, percussive or very low) */
  forbiddenInstruments: string[];
  /** hard cap for percussion velocity (null = percussion not allowed) */
  percussionMaxVelocity: number | null;
  /** upper bound of "simultaneous velocity sum", a density proxy (NOT a loudness measurement) */
  maxDensity: number;
  fadeInMs: number;
  fadeOutMs: number;
  maxReverb: number;
  /** moods that are re-voiced as a gentler one for this band */
  softenedMoods: Partial<Record<Mood, Mood>>;
}

export function ageBandFor(ages: { min: number; max: number }): AgeBand {
  const youngest = Math.max(0, Math.min(ages.min, ages.max));   // the youngest listener governs
  return youngest <= 4 ? 'toddler' : youngest <= 7 ? 'early' : 'middle';
}

export function childrensLens(ages: { min: number; max: number }): ChildrensCaps {
  const band = ageBandFor(ages);
  if (band === 'toddler') {
    return { band, label: 'Ages 2-4', maxVelocity: 0.5, maxVelocitySpan: 0.2, maxAttackJump: 0.12, maxMusicGain: 0.45, minTempo: 56, maxTempo: 100, lowestMidi: 48, highestMidi: 84,
      forbiddenInstruments: ['drum', 'bass', 'whistle', 'glass', 'bell', 'kazoo', 'click', 'shaker', 'choir'], percussionMaxVelocity: null, maxDensity: 1.5, fadeInMs: 2000, fadeOutMs: 2500, maxReverb: 0.5,
      softenedMoods: { tense: 'curious', spooky: 'curious', triumphant: 'wonder', adventure: 'playful' } };
  }
  if (band === 'early') {
    return { band, label: 'Ages 5-7', maxVelocity: 0.66, maxVelocitySpan: 0.3, maxAttackJump: 0.22, maxMusicGain: 0.6, minTempo: 56, maxTempo: 120, lowestMidi: 41, highestMidi: 88,
      forbiddenInstruments: ['whistle', 'kazoo'], percussionMaxVelocity: 0.4, maxDensity: 2.2, fadeInMs: 1500, fadeOutMs: 2000, maxReverb: 0.55, softenedMoods: { spooky: 'tense' } };
  }
  return { band, label: 'Ages 8+', maxVelocity: 0.82, maxVelocitySpan: 0.45, maxAttackJump: 0.34, maxMusicGain: 0.75, minTempo: 50, maxTempo: 140, lowestMidi: 36, highestMidi: 96,
    forbiddenInstruments: [], percussionMaxVelocity: 0.6, maxDensity: 3.2, fadeInMs: 1000, fadeOutMs: 1500, maxReverb: 0.6, softenedMoods: {} };
}

const PERCUSSION = new Set(['drum', 'shaker', 'click']);
const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);
const r3 = (x: number) => Math.round(x * 1000) / 1000;

export interface LensIssue { rule: 'velocity' | 'span' | 'attack' | 'tempo' | 'range' | 'instrument' | 'density' | 'reverb'; message: string }

/** Peak of the density proxy: sum of (velocity x track gain) of notes sounding together. A proxy for "how much is going on", not dB. */
export function densityPeak(score: Score): number {
  const ev: Array<{ t0: number; t1: number; w: number }> = [];
  for (const tr of score.tracks) for (const n of tr.notes) ev.push({ t0: n.t, t1: n.t + n.d, w: (n.v ?? 0.7) * (tr.gain ?? 1) });
  let peak = 0;
  for (const e of ev) {
    let s = 0;
    for (const o of ev) if (o.t0 <= e.t0 + 1e-9 && o.t1 > e.t0 + 1e-9) s += o.w;
    if (s > peak) peak = s;
  }
  return peak;
}

function attackJumps(tr: ScoreTrack): number {
  const sorted = [...tr.notes].sort((a, b) => a.t - b.t);
  let worst = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted.slice(Math.max(0, i - 3), i);
    const avg = prev.reduce((s, n) => s + (n.v ?? 0.7), 0) / prev.length;
    worst = Math.max(worst, (sorted[i].v ?? 0.7) - avg);
  }
  return worst;
}

/** Non-mutating check of a Score against the caps. An empty list means the cue satisfies this lens. */
export function auditScore(score: Score, caps: ChildrensCaps): LensIssue[] {
  const out: LensIssue[] = [];
  if (score.tempo > caps.maxTempo + 1e-9 || score.tempo < caps.minTempo - 1e-9) out.push({ rule: 'tempo', message: `tempo ${score.tempo} outside ${caps.minTempo}-${caps.maxTempo}` });
  if ((score.reverb ?? 0) > caps.maxReverb + 1e-9) out.push({ rule: 'reverb', message: `reverb ${score.reverb} above ${caps.maxReverb}` });
  const vels: number[] = [];
  for (const tr of score.tracks) {
    const perc = PERCUSSION.has(tr.instrument);
    if (caps.forbiddenInstruments.includes(tr.instrument)) out.push({ rule: 'instrument', message: `${tr.instrument} not used for ${caps.label}` });
    for (const n of tr.notes) {
      const v = n.v ?? 0.7;
      const cap = perc && caps.percussionMaxVelocity != null ? Math.min(caps.maxVelocity, caps.percussionMaxVelocity) : caps.maxVelocity;
      if (v > cap + 1e-9) { out.push({ rule: 'velocity', message: `${tr.instrument} velocity ${r3(v)} above ${cap}` }); break; }
    }
    if (!perc) for (const n of tr.notes) {
      const m = noteToMidi(n.n);
      if (m != null && (m < caps.lowestMidi || m > caps.highestMidi)) { out.push({ rule: 'range', message: `${tr.instrument} note ${m} outside ${caps.lowestMidi}-${caps.highestMidi}` }); break; }
    }
    const j = attackJumps(tr);
    if (j > caps.maxAttackJump + 1e-6) out.push({ rule: 'attack', message: `${tr.instrument} attack jump ${r3(j)} above ${caps.maxAttackJump}` });
    for (const n of tr.notes) vels.push(n.v ?? 0.7);
  }
  if (vels.length) {
    const span = Math.max(...vels) - Math.min(...vels);
    if (span > caps.maxVelocitySpan + 1e-6) out.push({ rule: 'span', message: `dynamic span ${r3(span)} above ${caps.maxVelocitySpan}` });
  }
  const d = densityPeak(score);
  if (d > caps.maxDensity + 1e-6) out.push({ rule: 'density', message: `density proxy ${r3(d)} above ${caps.maxDensity}` });
  return out;
}

/** Make a Score satisfy the caps. Returns a NEW score plus a plain-language list of what changed (so the author sees every softening). */
export function applyChildrensLens(input: Score, caps: ChildrensCaps): { score: Score; changes: string[] } {
  const changes: string[] = [];
  const score: Score = JSON.parse(JSON.stringify(input));
  const note = (s: string) => { if (!changes.includes(s)) changes.push(s); };

  const tempo = clamp(score.tempo, caps.minTempo, caps.maxTempo);
  if (tempo !== score.tempo) { note(`tempo ${score.tempo} -> ${tempo} bpm`); score.tempo = tempo; }
  if ((score.reverb ?? 0) > caps.maxReverb) { note(`reverb capped at ${caps.maxReverb}`); score.reverb = caps.maxReverb; }

  score.tracks = score.tracks.filter((tr) => {
    if (caps.forbiddenInstruments.includes(tr.instrument)) { note(`removed ${tr.instrument} (not used for ${caps.label})`); return false; }
    return true;
  });

  for (const tr of score.tracks) {
    const perc = PERCUSSION.has(tr.instrument);
    if (!perc) {
      for (const n of tr.notes) {
        const m = noteToMidi(n.n);
        if (m == null) continue;
        let f = m;
        while (f < caps.lowestMidi) f += 12;
        while (f > caps.highestMidi) f -= 12;
        if (f !== m) { n.n = f; note(`folded out-of-range pitches into ${caps.lowestMidi}-${caps.highestMidi}`); }
      }
    }
  }

  // Dynamics: compress toward the mean when the span is too wide, then cap, then soften onsets.
  const all = score.tracks.flatMap((t) => t.notes);
  if (all.length) {
    const vs = all.map((n) => n.v ?? 0.7);
    const mean = vs.reduce((s, v) => s + v, 0) / vs.length;
    const span = Math.max(...vs) - Math.min(...vs);
    if (span > caps.maxVelocitySpan) {
      const k = caps.maxVelocitySpan / span;
      for (const n of all) n.v = mean + ((n.v ?? 0.7) - mean) * k;
      note(`narrowed dynamic range to ${caps.maxVelocitySpan} (gentle dynamics)`);
    }
    for (const tr of score.tracks) {
      const cap = PERCUSSION.has(tr.instrument) && caps.percussionMaxVelocity != null ? Math.min(caps.maxVelocity, caps.percussionMaxVelocity) : caps.maxVelocity;
      for (const n of tr.notes) { const v = n.v ?? 0.7; if (v > cap) { n.v = cap; note(`velocity capped at ${cap}`); } }
    }
  }
  for (const tr of score.tracks) {
    const sorted = [...tr.notes].sort((a, b) => a.t - b.t);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted.slice(Math.max(0, i - 3), i);
      const avg = prev.reduce((s, n) => s + (n.v ?? 0.7), 0) / prev.length;
      if ((sorted[i].v ?? 0.7) - avg > caps.maxAttackJump) { sorted[i].v = avg + caps.maxAttackJump; note('softened sudden accents (no startle)'); }
    }
  }
  // Density: scale everything down uniformly until the proxy is under the cap (a few passes; attack/span only ever shrink).
  for (let pass = 0; pass < 4 && densityPeak(score) > caps.maxDensity; pass++) {
    const k = (caps.maxDensity / densityPeak(score)) * 0.98;
    for (const tr of score.tracks) tr.gain = r3((tr.gain ?? 1) * k);
    note('thinned simultaneous level (density cap)');
  }
  for (const tr of score.tracks) for (const n of tr.notes) if (n.v != null) n.v = r3(n.v);
  return { score, changes };
}

// ───────────────────────── mood inference ─────────────────────────
const LEXICON: Record<Mood, string[]> = {
  sleepy: ['sleep', 'sleepy', 'bedtime', 'dream', 'yawn', 'goodnight', 'night', 'moon', 'drowsy', 'lullaby', 'tucked', 'pillow'],
  calm: ['calm', 'quiet', 'gentle', 'soft', 'peace', 'still', 'slowly', 'breathe', 'float', 'drift'],
  cozy: ['cozy', 'warm', 'home', 'blanket', 'hug', 'family', 'kitchen', 'together', 'cuddle', 'supper'],
  playful: ['play', 'giggle', 'laugh', 'jump', 'bounce', 'silly', 'dance', 'hop', 'tickle', 'funny', 'splash'],
  curious: ['wonder', 'what', 'why', 'maybe', 'peek', 'explore', 'noticed', 'tiptoe', 'discover', 'found', 'strange'],
  wonder: ['magic', 'sparkle', 'glow', 'stars', 'shimmer', 'beautiful', 'amazing', 'twinkle', 'rainbow'],
  sad: ['sad', 'cry', 'tear', 'lonely', 'miss', 'lost', 'goodbye', 'alone', 'sorry'],
  tense: ['suddenly', 'creak', 'shadow', 'hide', 'worried', 'afraid', 'danger', 'trouble', 'hurry', 'chase'],
  spooky: ['ghost', 'spooky', 'dark', 'haunted', 'monster', 'scary', 'howl', 'cobweb'],
  triumphant: ['hooray', 'won', 'cheer', 'victory', 'finally', 'proud', 'success', 'celebrate', 'did it'],
  adventure: ['adventure', 'journey', 'sail', 'climb', 'quest', 'race', 'map', 'treasure', 'brave', 'fly'],
};
const QUIET_WORDS = ['silence', 'silent', 'hush', 'whisper', 'listen', 'held their breath', 'holding their breath', 'not a sound'];

export function inferMood(text: string | undefined): { mood: Mood; confident: boolean } {
  const t = (text ?? '').toLowerCase();
  if (!t.trim()) return { mood: 'calm', confident: false };
  let best: Mood = 'calm', bestScore = 0;
  for (const m of MOODS) {
    const score = LEXICON[m].reduce((s, w) => s + (new RegExp(`\\b${w}`).test(t) ? 1 : 0), 0);
    if (score > bestScore) { best = m; bestScore = score; }
  }
  return { mood: bestScore ? best : 'calm', confident: bestScore > 0 };
}
export const asksForQuiet = (text: string | undefined) => { const t = (text ?? '').toLowerCase(); return QUIET_WORDS.some((w) => t.includes(w)); };
const wordCount = (s: string | undefined) => (s ?? '').trim().split(/\s+/).filter(Boolean).length;

// ───────────────────────── deterministic cue writer ─────────────────────────
interface MoodProfile {
  energy: number;                 // 0..1
  tempo: [number, number];
  meter: 3 | 4;
  mode: 'major' | 'minor';
  scaleId: string;
  progs: string[];                // ids in the Melos progression repository
  keys: number[];                 // candidate tonics (pitch classes)
  melody: string; harmony: string; pad: boolean; bass: boolean; shaker: boolean;
  vel: [number, number];
  rests: number;                  // chance a melody slot is a rest
  rhythms: number[][];            // beat patterns that sum to a bar (4 or 3 beats)
  melodyLow: number;              // melody register floor (MIDI)
  reverb: number;
}
const R4 = { slow: [[2, 2], [3, 1], [2, 1, 1]], mid: [[1, 1, 2], [1, 1, 1, 1], [2, 1, 1], [1.5, 0.5, 2]], busy: [[1, 0.5, 0.5, 1, 1], [0.5, 0.5, 1, 1, 1], [1, 1, 0.5, 0.5, 1]] };
const R3 = { slow: [[3], [2, 1], [1, 2]], mid: [[1.5, 0.5, 1], [1, 1, 1], [2, 1]], busy: [[1, 0.5, 0.5, 1], [0.5, 0.5, 1, 1]] };

export const MOOD_PROFILES: Record<Mood, MoodProfile> = {
  sleepy: { energy: 0.1, tempo: [58, 68], meter: 3, mode: 'major', scaleId: 'major-pent', progs: ['plagal', 'dream-pop', 'canon'], keys: [5, 0, 7], melody: 'musicbox', harmony: 'harp', pad: true, bass: false, shaker: false, vel: [0.28, 0.4], rests: 0.2, rhythms: R3.slow, melodyLow: 69, reverb: 0.45 },
  calm: { energy: 0.2, tempo: [64, 76], meter: 4, mode: 'major', scaleId: 'major-pent', progs: ['plagal', 'canon', 'dream-pop'], keys: [0, 7, 5], melody: 'felt-piano', harmony: 'harp', pad: true, bass: false, shaker: false, vel: [0.3, 0.45], rests: 0.18, rhythms: R4.slow, melodyLow: 67, reverb: 0.4 },
  cozy: { energy: 0.35, tempo: [72, 86], meter: 3, mode: 'major', scaleId: 'major', progs: ['pop', 'canon', 'optimistic-axis'], keys: [7, 0, 2], melody: 'kalimba', harmony: 'felt-piano', pad: true, bass: false, shaker: false, vel: [0.34, 0.5], rests: 0.12, rhythms: R3.mid, melodyLow: 67, reverb: 0.3 },
  playful: { energy: 0.65, tempo: [92, 112], meter: 4, mode: 'major', scaleId: 'major-pent', progs: ['optimistic-axis', 'pop', 'doo-wop'], keys: [0, 7, 2], melody: 'marimba', harmony: 'kalimba', pad: false, bass: true, shaker: true, vel: [0.42, 0.62], rests: 0.1, rhythms: R4.busy, melodyLow: 69, reverb: 0.2 },
  curious: { energy: 0.4, tempo: [72, 88], meter: 4, mode: 'major', scaleId: 'major', progs: ['deceptive', 'plagal', 'dream-pop'], keys: [2, 9, 0], melody: 'flute', harmony: 'harp', pad: true, bass: false, shaker: false, vel: [0.32, 0.5], rests: 0.25, rhythms: R4.mid, melodyLow: 67, reverb: 0.35 },
  wonder: { energy: 0.45, tempo: [66, 80], meter: 4, mode: 'major', scaleId: 'major', progs: ['dream-pop', 'deceptive', 'canon'], keys: [5, 0, 7], melody: 'musicbox', harmony: 'harp', pad: true, bass: false, shaker: false, vel: [0.34, 0.52], rests: 0.15, rhythms: R4.mid, melodyLow: 72, reverb: 0.5 },
  sad: { energy: 0.2, tempo: [58, 70], meter: 4, mode: 'minor', scaleId: 'minor-pent', progs: ['sad-pop', 'epic-minor'], keys: [9, 4, 2], melody: 'felt-piano', harmony: 'pad', pad: false, bass: false, shaker: false, vel: [0.3, 0.45], rests: 0.2, rhythms: R4.slow, melodyLow: 64, reverb: 0.45 },
  tense: { energy: 0.55, tempo: [84, 100], meter: 4, mode: 'minor', scaleId: 'minor', progs: ['cinematic-min', 'phrygian'], keys: [9, 4], melody: 'pluck', harmony: 'pad', pad: false, bass: true, shaker: false, vel: [0.36, 0.56], rests: 0.3, rhythms: R4.mid, melodyLow: 64, reverb: 0.3 },
  spooky: { energy: 0.45, tempo: [66, 80], meter: 3, mode: 'minor', scaleId: 'minor', progs: ['phrygian', 'cinematic-min'], keys: [4, 9], melody: 'musicbox', harmony: 'pad', pad: false, bass: false, shaker: false, vel: [0.3, 0.5], rests: 0.3, rhythms: R3.mid, melodyLow: 69, reverb: 0.5 },
  triumphant: { energy: 0.85, tempo: [100, 116], meter: 4, mode: 'major', scaleId: 'major', progs: ['anthem', 'pop', 'canon'], keys: [0, 7], melody: 'marimba', harmony: 'felt-piano', pad: true, bass: true, shaker: true, vel: [0.5, 0.75], rests: 0.05, rhythms: R4.busy, melodyLow: 69, reverb: 0.3 },
  adventure: { energy: 0.75, tempo: [96, 120], meter: 4, mode: 'major', scaleId: 'major', progs: ['anthem', 'optimistic-axis', 'epic-minor'], keys: [2, 0, 9], melody: 'flute', harmony: 'harp', pad: true, bass: true, shaker: true, vel: [0.45, 0.7], rests: 0.08, rhythms: R4.busy, melodyLow: 67, reverb: 0.3 },
};

const hashStr = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const midiOfPc = (pc: number, octaveBase: number) => octaveBase + ((pc - octaveBase) % 12 + 12) % 12;

export interface CueMeta { mood: Mood; progressionId: string; progressionName: string; key: string; mode: 'major' | 'minor'; scaleId: string; bars: number; softenedFrom?: Mood; lensChanges: string[]; source: 'local' | 'ai' }
export interface ComposeCueOpts { mood: Mood; caps: ChildrensCaps; seed?: number; bars?: number; id?: string; meter?: 3 | 4; melodyOverride?: ScoreNote[]; skipLens?: boolean }

/** Deterministic cue. Same opts = same Score. Always in key (snapToScale) and always satisfies the lens (unless skipLens). */
export function composeCue(o: ComposeCueOpts): { score: Score; meta: CueMeta } {
  const asked = o.mood;
  const mood = o.caps.softenedMoods[asked] ?? asked;
  const P = MOOD_PROFILES[mood];
  const seed = hash32(o.seed ?? 1, hashStr(mood));
  const rng = mulberry32(seed);
  const pick = <T,>(a: T[]): T => a[Math.floor(rng() * a.length) % a.length];
  const meter = o.meter ?? P.meter;
  const bars = Math.max(2, o.bars ?? 8);
  const progId = pick(P.progs.filter((id) => !!getProgression(id)));
  const prog = getProgression(progId) ?? getProgression('pop')!;
  const rootPc = pick(P.keys);
  const scaleId = P.scaleId;
  const tempo = Math.round(P.tempo[0] + rng() * (P.tempo[1] - P.tempo[0]));
  const degrees = realiseProgression(prog, rootPc, false);

  // ── harmony: the Melos clip builder voices the progression, then the bridge turns the clip into a Score track ──
  const baseClip = progressionToClip(prog.id, rootPc, { barBeats: meter, baseMidi: 48, velocity: 60 })!;
  const per = degrees.length;
  const loopedNotes = [];
  for (let b = 0; b < bars; b++) {
    const src = (baseClip.notes ?? []).filter((n) => Math.floor(n.startBeats / meter + 1e-9) === b % per);
    for (const n of src) loopedNotes.push({ ...n, id: `${n.id}-${b}`, startBeats: b * meter + (n.startBeats - (b % per) * meter) });
  }
  const padScore = clipToScore({ lengthBeats: bars * meter, notes: loopedNotes }, { id: 'tmp', tempo, instrument: 'pad' }).score.tracks[0];
  const [vLo, vHi] = P.vel;
  const velAt = (bar: number, accent = 0) => clamp(vLo + (vHi - vLo) * (0.35 + 0.65 * P.energy * Math.min(1, (bar + 1) / (bars * 0.75))) + accent + (rng() - 0.5) * 0.04, 0.05, 1);

  const tracks: ScoreTrack[] = [];
  if (P.pad) { padScore.notes = padScore.notes.map((n) => ({ ...n, v: r3((vLo + 0.02)) })); padScore.gain = 0.35; padScore.pan = 0.05; padScore.loop = true; tracks.push(padScore); }

  // arpeggiated/colour harmony track on the harmony instrument
  const arp: ScoreNote[] = [];
  for (let b = 0; b < bars; b++) {
    const tones = loopedNotes.filter((n) => Math.floor(n.startBeats / meter + 1e-9) === b).map((n) => n.key).sort((a, c) => a - c);
    if (!tones.length) continue;
    const order = [0, 1, 2, 1];
    for (let s = 0; s < meter; s++) arp.push({ t: b * meter + s, n: tones[order[s % order.length] % tones.length] + 12, d: 1, v: r3(velAt(b) * 0.8) });
  }
  tracks.push({ instrument: P.harmony === 'pad' && P.pad ? 'harp' : P.harmony, notes: arp, gain: 0.5, pan: -0.2, loop: true });

  if (P.bass) {
    const bn: ScoreNote[] = [];
    for (let b = 0; b < bars; b++) {
      const root = Math.min(...loopedNotes.filter((n) => Math.floor(n.startBeats / meter + 1e-9) === b).map((n) => n.key)) - 12;
      bn.push({ t: b * meter, n: root, d: meter / 2, v: r3(velAt(b)) }, { t: b * meter + meter / 2, n: root + 7, d: meter / 2, v: r3(velAt(b) * 0.8) });
    }
    tracks.push({ instrument: 'bass', notes: bn, gain: 0.6, loop: true });
  }
  if (P.shaker) {
    const sn: ScoreNote[] = [];
    for (let b = 0; b < bars; b++) for (let s = 0; s < meter; s++) sn.push({ t: b * meter + s + 0.5, n: 'x', d: 0.25, v: r3(0.3 + (rng() - 0.5) * 0.04) });
    tracks.push({ instrument: 'shaker', notes: sn, gain: 0.4, loop: true });
  }

  // ── melody: chord tones on strong beats, steps between, a repeating two-bar rhythm (singable), snapped to the key ──
  let melody: ScoreNote[];
  if (o.melodyOverride) melody = o.melodyOverride;
  else {
    const pcs = scalePitchClasses(rootPc, scaleId);
    const cand: number[] = [];
    for (let m = P.melodyLow; m <= P.melodyLow + 14; m++) if (pcs[((m % 12) + 12) % 12]) cand.push(m);
    const rhyA = pick(P.rhythms), rhyB = pick(P.rhythms);
    const rhyOf = (b: number) => (b % 4 === 0 || b % 4 === 2 ? rhyA : rhyB);
    let pos = Math.floor(cand.length / 2);
    melody = [];
    for (let b = 0; b < bars; b++) {
      const chordPcs = new Set(loopedNotes.filter((n) => Math.floor(n.startBeats / meter + 1e-9) === b).map((n) => n.key % 12));
      let t = b * meter;
      const rhy = rhyOf(b);
      rhy.forEach((d, i) => {
        const last = b === bars - 1 && i === rhy.length - 1;
        if (last) {
          let best = pos; for (let k = 0; k < cand.length; k++) if (cand[k] % 12 === rootPc && Math.abs(k - pos) < Math.abs(best - pos)) best = k;
          pos = best;
          melody.push({ t, n: snapToScale(cand[pos], rootPc, scaleId, 'nearest'), d: Math.max(d, meter - (t - b * meter)), v: r3(velAt(b) * 0.9) });
        } else if (i > 0 && rng() < P.rests) { /* rest */ }
        else {
          if (i === 0) {
            let best = pos; let bd = 99;
            for (let k = Math.max(0, pos - 3); k <= Math.min(cand.length - 1, pos + 3); k++) if (chordPcs.has(cand[k] % 12) && Math.abs(k - pos) < bd) { bd = Math.abs(k - pos); best = k; }
            pos = best;
          } else {
            const r = rng(); const step = r < 0.2 ? 0 : r < 0.72 ? (rng() < 0.5 ? -1 : 1) : (rng() < 0.5 ? -2 : 2);
            pos = clamp(pos + step, 0, cand.length - 1);
          }
          melody.push({ t, n: snapToScale(cand[pos], rootPc, scaleId, 'nearest'), d: d * 0.95, v: r3(velAt(b, i === 0 ? 0.04 : 0)) });
        }
        t += d;
      });
    }
  }
  tracks.unshift({ instrument: P.melody, notes: melody, gain: 0.9, pan: 0.1, loop: true });

  const id = o.id ?? `cue-${mood}`;
  const raw: Score = { id, tempo, beatsPerBar: meter, lengthBeats: bars * meter, reverb: P.reverb, variation: { seed: seed & 0xffff, humanizeMs: 6 }, tracks };
  const lens = o.skipLens ? { score: raw, changes: [] as string[] } : applyChildrensLens(raw, o.caps);
  return {
    score: lens.score,
    meta: { mood, progressionId: prog.id, progressionName: prog.name, key: pcName(rootPc), mode: prog.mode, scaleId, bars, softenedFrom: mood !== asked ? asked : undefined, lensChanges: lens.changes, source: o.melodyOverride ? 'ai' : 'local' },
  };
}

// ───────────────────────── optional AI path ─────────────────────────
export interface AiComposeDeps {
  /** inject for tests; default lazily imports Melos' promptToScore (which needs the Gemini proxy / a signed-in user) */
  promptToScore?: (direction: string, opts: { key?: string; mode?: 'major' | 'minor'; bars?: number; progression?: string; snap?: boolean }) => Promise<{ notes: Array<{ startBeats: number; lengthBeats: number; key: number; vel: number }>; key: string; mode: 'major' | 'minor' }>;
}

/** Ask Melos' promptToScore for a melody, keep the deterministic harmony, snap + lens as usual. Never throws: falls back to the local cue. */
export async function composeCueWithAi(o: ComposeCueOpts & { direction?: string; ageLabel?: string }, deps: AiComposeDeps = {}): Promise<{ score: Score; meta: CueMeta; aiError?: string }> {
  const base = composeCue({ ...o, meter: 4 });   // promptToScore writes 4-beat bars
  try {
    const fn = deps.promptToScore ?? (await import('../../melos/composition/promptToScore')).promptToScore;
    const mood = base.meta.mood;
    const direction = o.direction ?? `a ${mood} melody for a children's picture book${o.ageLabel ? ` (${o.ageLabel})` : ''}; gentle, singable, small range, repeats a short phrase`;
    const res = await fn(direction, { key: base.meta.key, mode: base.meta.mode, bars: base.meta.bars, progression: base.meta.progressionName, snap: true });
    const rootPc = nameToPc(base.meta.key);
    const notes: ScoreNote[] = res.notes.map((n) => ({ t: n.startBeats, n: snapToScale(n.key, Number.isFinite(rootPc) ? rootPc : 0, base.meta.scaleId, 'nearest'), d: n.lengthBeats, v: Math.max(0.05, Math.min(1, n.vel / 127)) }))
      .filter((n) => n.t < base.meta.bars * 4);
    if (!notes.length) throw new Error('model returned no notes');
    const out = composeCue({ ...o, meter: 4, melodyOverride: notes });
    return { score: out.score, meta: out.meta };
  } catch (e) {
    return { ...base, aiError: e instanceof Error ? e.message : String(e) };
  }
}

// ───────────────────────── the plan ─────────────────────────
export type PageDynamic = 'rest' | 'enter' | 'grow' | 'hold' | 'slow';

export interface PageDirection {
  page: number;
  mood: Mood | 'silent';
  /** mood actually scored after the children's lens (may differ from the author's) */
  scoredMood?: Mood;
  /** page tempo in bpm (null on silent pages) */
  tempo: number | null;
  energy: number;
  music: boolean;
  cue?: string;
  dynamic: PageDynamic;
  /** LivingBook action: musicTempo scale to ramp to on entering the page (1 = none) */
  tempoScale: number;
  fadeMs: number;
  /** advisory: sound interactions on this page that the music should leave room for */
  duckAdvice?: string;
  reasons: string[];
}

export interface Proposal { personaId: ComposerPersonaId; headline: string; moves: Array<{ text: string; yourCall: string }> }

export interface ComposerPlan {
  version: 1;
  bookTitle?: string;
  caps: ChildrensCaps;
  pages: PageDirection[];
  cues: Record<string, Score>;
  cueMeta: Record<string, CueMeta>;
  silentPages: number[];
  growPages: number[];
  slowPages: number[];
  /** pages with sound interactions: duck/make room advice */
  roomPages: number[];
  lensReport: { softenedMoods: Array<{ page: number; from: Mood; to: Mood }>; changesByCue: Record<string, string[]>; audit: Record<string, LensIssue[]>; suggestedMusicGain: number };
  proposals: Proposal[];
  tensions: string[];
  summary: string;
  source: 'local' | 'ai';
  /** always true: nothing here has been listened to */
  unauditioned: true;
}

const SOUND_KINDS = new Set<SoundInteraction>(['tap', 'press', 'drag', 'proximity', 'tilt', 'note', 'sfx']);

export function planBookMusic(brief: BookMusicBrief, opts: { cueOverrides?: Record<string, { score: Score; meta: CueMeta }> } = {}): ComposerPlan {
  const caps = childrensLens(brief.ages);
  const seed = brief.seed ?? 7;
  const pages = [...brief.pages].sort((a, b) => a.page - b.page);
  const softened: Array<{ page: number; from: Mood; to: Mood }> = [];

  // 1) mood + silence decisions
  const prelim = pages.map((p, idx) => {
    const reasons: string[] = [];
    let mood: Mood | 'silent';
    if (p.mood) mood = p.mood; else { const g = inferMood(p.text); mood = g.mood; reasons.push(g.confident ? `mood read from the page text: ${g.mood}` : 'no mood given and the text is neutral: calm is a gentle default'); }
    const soundLoad = (p.interactions ?? []).filter((k) => SOUND_KINDS.has(k)).length;
    let scored: Mood | undefined;
    if (mood !== 'silent') {
      scored = caps.softenedMoods[mood] ?? mood;
      if (scored !== mood) { softened.push({ page: p.page, from: mood, to: scored }); reasons.push(`${caps.label}: ${mood} is voiced as ${scored} (no scary or driving musical language for the youngest)`); }
    }
    let silent = mood === 'silent';
    if (silent) reasons.push('author asked for no music here');
    if (!silent && asksForQuiet(p.text)) { silent = true; reasons.push('the text itself asks for quiet; silence will say it better than a quiet cue'); }
    if (!silent && soundLoad >= 3) { silent = true; reasons.push(`${soundLoad} things on this page make sound when touched: the child\'s sounds are the music here`); }
    return { p, idx, mood, scored, silent, reasons, soundLoad };
  });
  // breathing room: never more than 4 musical pages in a row (not on the first, last or climax page)
  let streak = 0;
  for (const x of prelim) {
    if (x.silent) { streak = 0; continue; }
    streak++;
    if (streak > 4 && x.idx !== 0 && x.idx !== prelim.length - 1 && !x.p.climax) { x.silent = true; x.reasons.push('breathing room: four musical pages in a row, so this one rests and the next entrance matters'); streak = 0; }
  }

  // 2) cues for every scored mood
  const cues: Record<string, Score> = {};
  const cueMeta: Record<string, CueMeta> = {};
  for (const x of prelim) {
    if (x.silent || !x.scored) continue;
    const id = `cue-${x.scored}`;
    if (cues[id]) continue;
    const ov = opts.cueOverrides?.[id];
    const c = ov ?? composeCue({ mood: x.scored, caps, seed, id });
    cues[id] = c.score; cueMeta[id] = c.meta;
  }

  // 3) dynamics
  const directions: PageDirection[] = [];
  let prevEnergy: number | null = null;
  prelim.forEach((x) => {
    const { p } = x;
    if (x.silent || !x.scored) {
      directions.push({ page: p.page, mood: x.mood, tempo: null, energy: 0, music: false, dynamic: 'rest', tempoScale: 1, fadeMs: caps.fadeOutMs, reasons: x.reasons });
      return;
    }
    const cueId = `cue-${x.scored}`;
    const energy = MOOD_PROFILES[x.scored].energy + (p.climax ? 0.15 : 0);
    let dynamic: PageDynamic = 'enter', tempoScale = 1;
    if (prevEnergy != null) {
      const d = energy - prevEnergy;
      if (d >= 0.2) { dynamic = 'grow'; tempoScale = r3(Math.min(1.08, caps.maxTempo / cues[cueId].tempo)); x.reasons.push(`energy rises ${prevEnergy.toFixed(2)} -> ${energy.toFixed(2)}: the music grows (slightly faster, fuller)`); }
      else if (d <= -0.2) { dynamic = 'slow'; tempoScale = r3(Math.max(0.88, caps.minTempo / cues[cueId].tempo)); x.reasons.push(`energy falls ${prevEnergy.toFixed(2)} -> ${energy.toFixed(2)}: the music eases down`); }
      else { dynamic = 'hold'; x.reasons.push('similar energy to the page before: the cue holds'); }
    } else x.reasons.push('first musical page: a slow fade-in, no entrance');
    prevEnergy = energy;
    const duckAdvice = x.soundLoad > 0 ? `${x.soundLoad} sound interaction${x.soundLoad > 1 ? 's' : ''} here: consider a short duck action on those behaviours so each tap is heard` : undefined;
    directions.push({ page: p.page, mood: x.mood, scoredMood: x.scored, tempo: Math.round(cues[cueId].tempo * tempoScale), energy: r3(energy), music: true, cue: cueId, dynamic, tempoScale, fadeMs: dynamic === 'grow' ? caps.fadeInMs + 500 : caps.fadeInMs, duckAdvice, reasons: x.reasons });
  });
  // last musical page: say how it leaves
  const lastMusical = [...directions].reverse().find((d) => d.music);
  if (lastMusical && lastMusical === directions[directions.length - 1]) lastMusical.reasons.push(`the book ends on music: it fades out over ${caps.fadeOutMs} ms rather than stopping`);

  const audit: Record<string, LensIssue[]> = {}, changesByCue: Record<string, string[]> = {};
  for (const id of Object.keys(cues)) { audit[id] = auditScore(cues[id], caps); changesByCue[id] = cueMeta[id].lensChanges; }

  const silentPages = directions.filter((d) => !d.music).map((d) => d.page);
  const growPages = directions.filter((d) => d.dynamic === 'grow').map((d) => d.page);
  const slowPages = directions.filter((d) => d.dynamic === 'slow').map((d) => d.page);
  const roomPages = directions.filter((d) => d.duckAdvice).map((d) => d.page);

  const plan: ComposerPlan = {
    version: 1, bookTitle: brief.title, caps, pages: directions, cues, cueMeta, silentPages, growPages, slowPages, roomPages,
    lensReport: { softenedMoods: softened, changesByCue, audit, suggestedMusicGain: caps.maxMusicGain },
    proposals: [], tensions: [], summary: '', source: opts.cueOverrides && Object.values(opts.cueOverrides).some((c) => c.meta.source === 'ai') ? 'ai' : 'local', unauditioned: true,
  };
  const d = deliberate(plan, brief);
  plan.proposals = d.proposals; plan.tensions = d.tensions; plan.summary = d.summary;
  return plan;
}

/** Same as planBookMusic but asks the AI path for each cue's melody first. Falls back per cue; the plan records which cues were AI-written. */
export async function planBookMusicWithAi(brief: BookMusicBrief, deps: AiComposeDeps = {}): Promise<{ plan: ComposerPlan; aiErrors: string[] }> {
  const caps = childrensLens(brief.ages);
  const base = planBookMusic(brief);
  const overrides: Record<string, { score: Score; meta: CueMeta }> = {};
  const aiErrors: string[] = [];
  for (const id of Object.keys(base.cues)) {
    const mood = base.cueMeta[id].mood;
    const r = await composeCueWithAi({ mood, caps, seed: brief.seed ?? 7, id, ageLabel: caps.label }, deps);
    overrides[id] = { score: r.score, meta: r.meta };
    if (r.aiError) aiErrors.push(`${id}: ${r.aiError}`);
  }
  return { plan: planBookMusic(brief, { cueOverrides: overrides }), aiErrors };
}

// ───────────────────────── deliberation (the council speaking) ─────────────────────────
const list = (xs: number[]) => (xs.length ? xs.join(', ') : 'none');

function deliberate(plan: ComposerPlan, brief: BookMusicBrief): { proposals: Proposal[]; tensions: string[]; summary: string } {
  const cueIds = Object.keys(plan.cues);
  const musical = plan.pages.filter((p) => p.music).length;
  const proposals: Proposal[] = [];
  const caps = plan.caps;

  proposals.push({ personaId: 'CHILDRENS_SONG', headline: 'A tune a child can hum back', moves: [
    { text: `${cueIds.length} cue${cueIds.length === 1 ? '' : 's'} cover ${musical} musical page${musical === 1 ? '' : 's'}: pages with the same mood share a cue, so the tune comes back and becomes familiar.`, yourCall: 'This changes if you want every page to have its own theme (more variety, less memory).' },
    { text: 'Melodies stay inside about an octave and a half, move mostly by step, and repeat a two-bar rhythm.', yourCall: 'Edit any cue in Melos if you want a specific tune; the notes are plain data.' },
  ] });

  const peak = plan.pages.filter((p) => p.dynamic === 'grow').map((p) => p.page);
  proposals.push({ personaId: 'SCORER', headline: 'Arc and silence', moves: [
    { text: plan.silentPages.length ? `Silence on page${plan.silentPages.length > 1 ? 's' : ''} ${list(plan.silentPages)}, so the music that returns means something.` : 'Every page has music; consider letting one page rest so the next entrance lands.', yourCall: 'Any silent page can be given a cue; any musical page can be muted. Silence is a choice, not a gap.' },
    { text: `Music grows on page${peak.length === 1 ? '' : 's'} ${list(peak)} and eases on ${list(plan.slowPages)}.`, yourCall: 'This changes if the story\'s real peak is somewhere else: mark that page as the climax and re-plan.' },
  ] });

  proposals.push({ personaId: 'SOUND_DESIGNER', headline: 'Room for the child and the narrator', moves: [
    { text: plan.roomPages.length ? `Pages ${list(plan.roomPages)} have sounds the child makes. Keep the music underneath them and add a short duck to those taps.` : 'No sounding interactions flagged, so the score has the room to itself.', yourCall: 'The reader already ducks music under narration; only touch-sounds need your decision.' },
    { text: `Suggested book music gain: at most ${caps.maxMusicGain}. Narration should stay clearly on top.`, yourCall: 'This is a design cap, not a measurement. Check it with the narration on the device you care about.' },
  ] });

  const soft = plan.lensReport.softenedMoods;
  proposals.push({ personaId: 'WELLBEING', headline: `${caps.label}: soft in, soft out`, moves: [
    { text: `Fades are ${caps.fadeInMs} ms in and ${caps.fadeOutMs} ms out, tempo stays between ${caps.minTempo} and ${caps.maxTempo} bpm, and no accent jumps more than ${caps.maxAttackJump} above the notes before it.`, yourCall: 'If a page truly needs a jolt, add it as an explicit sound effect you chose, not as music.' },
    ...(soft.length ? [{ text: `${soft.map((s) => `page ${s.page}: ${s.from} -> ${s.to}`).join('; ')}. The tension stays in your words.`, yourCall: 'Older readers can take the original mood: widen the age range and re-plan.' }] : []),
  ] });

  proposals.push({ personaId: 'MELOS_COMPOSER', headline: 'Harmony from the Melos repository', moves: [
    { text: `Progressions: ${cueIds.map((id) => `${id} = ${plan.cueMeta[id].progressionName} in ${plan.cueMeta[id].key} ${plan.cueMeta[id].mode}`).join('; ') || 'none'}.`, yourCall: 'Swap any progression by regenerating with another seed, or open the cue in Melos.' },
    ...MUSIC_PERSONAS.COMPOSER.questions.slice(0, 1).map((q) => ({ text: `Question from the Composer seat: ${q}`, yourCall: 'Answering it is the author\'s job, not ours.' })),
  ] });

  const auditBad = Object.entries(plan.lensReport.audit).filter(([, v]) => v.length);
  proposals.push({ personaId: 'MELOS_MIX', headline: 'Balance and headroom', moves: [
    { text: auditBad.length ? `Lens audit found issues in ${auditBad.map(([id]) => id).join(', ')} (see lensReport.audit).` : 'Every cue passes the children\'s lens audit (velocity, range, tempo, attack jumps, density proxy).', yourCall: 'The audit checks the notes, not the sound. Listen on a phone speaker and in headphones before publishing.' },
    { text: 'Melody sits on top, harmony underneath at about half level, no bass for the youngest.', yourCall: 'Adjust track gains in the Behaviours JSON or in Melos.' },
  ] });

  const tensions: string[] = [];
  if (plan.silentPages.length && plan.growPages.length) tensions.push('The Scorer wants contrast (silence, then a growing entrance); the Lullaby specialist wants no sudden changes. The plan resolves it with long fades rather than abrupt cuts. Your call whether to keep that.');
  if (plan.roomPages.length) tensions.push('The Children\'s-Song Composer wants the tune present; the Sound Designer wants the tune out of the way of the child\'s taps. The plan keeps the cue but flags where to duck.');
  if (soft.length) tensions.push('The Scorer would score the tension; the Wellbeing specialist will not scare ages 2-4. The lens wins for the youngest age band, and the original mood is recorded.');

  const summary = `${brief.title ? `"${brief.title}": ` : ''}${musical} of ${plan.pages.length} pages carry music (${cueIds.length} cue${cueIds.length === 1 ? '' : 's'}), ${plan.silentPages.length} rest, fitted to ${caps.label}. This is a draft for you to audition and change; nothing here has been listened to or loudness-measured.`;
  return { proposals, tensions, summary };
}

// ───────────────────────── applying a plan to a LivingBook ─────────────────────────
export const COMPOSER_BEHAVIOR_ID = 'composer-dynamics';

/** Returns a new LivingBook with the plan's cues, per-page music and tempo behaviours. Existing behaviours are kept; the composer's own
 *  behaviour (id COMPOSER_BEHAVIOR_ID) is replaced so applying twice is idempotent. `onlyPages` limits which pages are touched. */
export function applyPlanToLivingBook(living: LivingBook | undefined, plan: ComposerPlan, bookId: string, o: { onlyPages?: number[]; setMusicGain?: boolean } = {}): LivingBook {
  const book: LivingBook = living ? JSON.parse(JSON.stringify(living)) : { version: 1, bookId, pages: [], scores: {} };
  const only = o.onlyPages ? new Set(o.onlyPages) : null;
  const wanted = new Set<string>();
  for (const d of plan.pages) if ((!only || only.has(d.page)) && d.music && d.cue) wanted.add(d.cue);
  for (const id of wanted) book.scores[id] = plan.cues[id];
  for (const d of plan.pages) {
    if (only && !only.has(d.page)) continue;
    let page: LivingPage = book.pages.find((p) => p.page === d.page) ?? { page: d.page, behaviors: [] };
    const behaviors: Behavior[] = page.behaviors.filter((b) => b.id !== COMPOSER_BEHAVIOR_ID);
    if (d.music && d.cue) {
      page = { ...page, music: { cue: d.cue, fadeMs: d.fadeMs } };
      if (d.tempoScale !== 1) behaviors.push({ id: COMPOSER_BEHAVIOR_ID, label: `Composer: ${d.dynamic}`, target: { page: true }, on: { type: 'enter' }, do: [{ do: 'musicTempo', scale: d.tempoScale, rampMs: d.fadeMs }] });
    } else {
      const { music: _m, ...rest } = page; void _m;
      page = rest;
    }
    page = { ...page, behaviors };
    book.pages = [...book.pages.filter((p) => p.page !== d.page), page].sort((a, b) => a.page - b.page);
  }
  if (o.setMusicGain !== false) book.defaults = { ...book.defaults, musicGain: Math.min(book.defaults?.musicGain ?? plan.caps.maxMusicGain, plan.caps.maxMusicGain) };
  return book;
}
