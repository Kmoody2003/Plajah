// Chora Direct — the song brief.
//
// One typed plan that every engine reads. The prompt (songPrompt.ts) says what the person wants;
// the style pack (styleKnowledge.ts) says what a professional would already know; the brief is
// the two resolved into bars: tempo, key, meter, sections with lengths, energy, chords and words,
// and who is on the session.
//
//   symbolic writers  → briefToEnsemblePlan(), briefGrounding()   (council, Qwen director, LLM lanes)
//   Session Band      → briefToBandChart()                        (genre + chart the players read)
//   audio renderers   → briefToRenderRequest()                    (ACE-Step / HeartMuLa tags + lyrics)
//   vocal layer       → vocalScore.ts layoutVocal()               (editable sung phrases on the timeline)
//
// Before anything is generated the brief is read by the composers and players (reviewBrief): the
// same checks a music director or a session drummer would raise. Their notes go back to the user
// and into the model prompts, which is where the extra precision over a plain text prompt comes from.
//
// Pure and deterministic: the same prompt always compiles to the same brief.

import type { Dynamic, ParsedLine, ParsedSection, ParsedSongPrompt, SectionKind } from './songPrompt';
import { writeLyrics } from './songPrompt';
import { parseChord } from '../beats/band/chords';
import { chooseStyle, dynamicFor, energyFor, realizeProgression, type Chair, type Seat, type StylePack } from './styleKnowledge';

export interface BriefSection {
  id: string;
  kind: SectionKind;
  label: string;
  startBar: number;
  bars: number;
  energy: number;
  dynamic: Dynamic;
  direction: string;
  /** One entry per bar; a bar holds one or two chord symbols. */
  chords: string[][];
  lines: ParsedLine[];
  instrumental: boolean;
  modifiers: string[];
  feature?: string;
}

export interface ReviewNote {
  /** Who raised it: a Session Band player id (roster.ts) or 'producer'. */
  from: string;
  role: string;
  level: 'info' | 'suggest' | 'problem';
  message: string;
  /** Section the note is about, when it is about one. */
  sectionId?: string;
}

export interface SongBrief {
  title?: string;
  pack: StylePack;
  blend?: StylePack;
  /** False when no style tag was recognised and the general song pack was used. */
  styleMatched: boolean;
  bpm: number;
  key: { tonic: number; mode: string };
  keyName: string;
  meter: [number, number];
  beatsPerBar: number;
  swing: number;
  sections: BriefSection[];
  totalBars: number;
  seconds: number;
  lineup: Seat[];
  vocal: { present: boolean; gender?: 'female' | 'male' | 'mixed'; styles: string[]; rap: boolean };
  /** Tags the user wrote, minus directives; and what they asked to leave out. */
  tags: string[];
  exclude: string[];
  actions: { afterSection: number; action: string }[];
  unknownTags: string[];
}

export interface CompileOptions {
  /** Project values, used when the prompt does not say. */
  bpm?: number;
  key?: { tonic: number; mode: string };
  meter?: [number, number];
}

const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const FLAT_TONICS = new Set([1, 3, 5, 8, 10]);
export const keyName = (key: { tonic: number; mode: string }): string =>
  `${(FLAT_TONICS.has(key.tonic) ? FLAT : SHARP)[key.tonic]} ${key.mode}`;

/** Small stable hash so "random" choices are the same every time for the same prompt. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const SLOW = /\b(slow|slower|downtempo|laid[- ]?back|relaxed|lazy|gentle|calm|chill|mellow|ballad)\b/;
const FAST = /\b(fast|faster|up[- ]?tempo|driving|energetic|frantic|urgent|high[- ]?energy|intense|aggressive)\b/;
const DARK = /\b(dark|sad|melanchol\w*|moody|ominous|brooding|tragic|sinister|haunting|mournful|tense)\b/;
const BRIGHT = /\b(happy|uplifting|bright|joyful|triumphant|sunny|cheerful|hopeful|playful|celebrat\w*)\b/;
const QUIETER = /\b(stripped|acoustic|soft|whisper\w*|quiet|intimate|sparse|a ?cappella|half[- ]?time|breathy)\b/;
const LOUDER = /\b(big|anthemic|explosive|full|belt\w*|huge|powerful|double[- ]?time|gang|shout\w*|soaring)\b/;

const DEFAULT_ENERGY: Record<SectionKind, number> = {
  intro: 0.3, verse: 0.5, prechorus: 0.65, chorus: 0.9, postchorus: 0.8, hook: 0.85, bridge: 0.55, refrain: 0.7,
  build: 0.7, drop: 1, breakdown: 0.3, solo: 0.75, interlude: 0.45, instrumental: 0.6, outro: 0.3,
  theme: 0.55, development: 0.65, recap: 0.85, coda: 0.4, head: 0.6, cue: 0.5,
};
const DEFAULT_BARS: Record<SectionKind, number> = {
  intro: 4, verse: 8, prechorus: 4, chorus: 8, postchorus: 4, hook: 8, bridge: 8, refrain: 4,
  build: 8, drop: 16, breakdown: 8, solo: 8, interlude: 4, instrumental: 8, outro: 4,
  theme: 8, development: 8, recap: 8, coda: 4, head: 32, cue: 8,
};
const LIFT_KINDS = new Set<SectionKind>(['chorus', 'hook', 'drop', 'recap', 'refrain', 'postchorus']);
const CONTRAST_KINDS = new Set<SectionKind>(['bridge', 'development', 'breakdown', 'interlude']);

function progressionIndex(kind: SectionKind, pack: StylePack): number {
  const n = pack.progressions.length;
  // A jazz tune is one set of changes: head and solos share it.
  if (pack.family === 'jazz') return kind === 'bridge' && n > 1 ? 1 : 0;
  if (LIFT_KINDS.has(kind)) return Math.min(1, n - 1);
  if (CONTRAST_KINDS.has(kind)) return Math.min(2, n - 1);
  return 0;
}

const roundTo = (n: number, step: number) => Math.max(step, Math.round(n / step) * step);

/** Compile a parsed prompt into the brief every engine works from. */
export function compileSongBrief(parsed: ParsedSongPrompt, opts: CompileOptions = {}): SongBrief {
  const { style } = parsed;
  const chosen = chooseStyle(style.tags);
  const pack = chosen.pack;
  const all = style.tags.join(', ');
  const seed = hash(`${style.raw}|${parsed.title ?? ''}`);

  const meter = style.directives.meter ?? opts.meter ?? pack.meter;
  const beatsPerBar = meter[0] * 4 / meter[1];

  let bpm = style.directives.bpm ?? opts.bpm;
  if (!bpm) {
    const [lo, hi] = pack.tempo;
    bpm = pack.defaultTempo;
    if (SLOW.test(all)) bpm = Math.round(lo + (pack.defaultTempo - lo) * 0.3);
    else if (FAST.test(all)) bpm = Math.round(pack.defaultTempo + (hi - pack.defaultTempo) * 0.7);
  }

  let key = style.directives.key ?? opts.key;
  if (!key) {
    let mode = pack.modes[0];
    if (DARK.test(all)) mode = pack.modes.find((m) => m !== 'major' && m !== 'lydian' && m !== 'mixolydian') ?? mode;
    else if (BRIGHT.test(all)) mode = pack.modes.find((m) => m === 'major' || m === 'lydian' || m === 'mixolydian') ?? mode;
    key = { tonic: pack.tonics[seed % Math.min(3, pack.tonics.length)], mode };
  }

  const rap = style.vocal.styles.some((v) => /rap/.test(v)) || (pack.family === 'hiphop' && pack.vocals === 'typical');
  const hasWords = parsed.sections.some((x) => !x.instrumental);
  const present = style.vocal.presence !== 'none' && hasWords;

  // ── Sections: the user's, or the form this style uses.
  type Draft = Omit<BriefSection, 'id' | 'startBar' | 'chords' | 'dynamic'> & { dynamic?: Dynamic; chart?: string[][] };
  const drafts: Draft[] = [];
  if (parsed.sections.length) {
    const seen = new Map<SectionKind, number>();
    for (const ps of parsed.sections) {
      const nth = seen.get(ps.kind) ?? 0; seen.set(ps.kind, nth + 1);
      const same = pack.form.filter((f) => f.kind === ps.kind);
      const ref = same[Math.min(nth, same.length - 1)];
      const sung = ps.lines.filter((l) => l.words.length).length;
      const bars = ps.bars ?? (ps.chart?.length ? ps.chart.length
        : sung ? roundTo(sung * pack.barsPerLine, 4)
        : ref?.bars ?? DEFAULT_BARS[ps.kind]);
      const mods = ps.modifiers.join(' ');
      let energy = ps.dynamic ? energyFor(ps.dynamic) : ref?.energy ?? DEFAULT_ENERGY[ps.kind];
      if (!ps.dynamic) {
        // A repeated chorus or drop without a form reference grows a little each time.
        if (!ref && LIFT_KINDS.has(ps.kind)) energy = Math.min(1, energy + nth * 0.05);
        if (QUIETER.test(mods)) energy -= 0.15;
        if (LOUDER.test(mods)) energy += 0.1;
      }
      energy = Math.max(0.05, Math.min(1, energy));
      const direction = [
        ref?.direction ?? '',
        ps.feature ? `Feature: ${ps.feature}.` : '',
        ps.modifiers.length ? `As asked: ${ps.modifiers.join(', ')}.` : '',
      ].filter(Boolean).join(' ');
      drafts.push({ kind: ps.kind, label: ps.label, bars, energy, dynamic: ps.dynamic, direction, lines: ps.lines,
        instrumental: ps.instrumental, modifiers: ps.modifiers, feature: ps.feature, chart: ps.chart });
    }
  } else {
    let scale = 1;
    if (style.directives.durationSec) {
      const formBars = pack.form.reduce((n, f) => n + f.bars, 0);
      const wantBars = style.directives.durationSec * bpm / 60 / beatsPerBar;
      scale = wantBars / formBars;
    }
    const counts = new Map<SectionKind, number>();
    for (const f of pack.form) {
      const n = (counts.get(f.kind) ?? 0) + 1; counts.set(f.kind, n);
      const total = pack.form.filter((x) => x.kind === f.kind).length;
      const base = f.label ?? f.kind.replace(/^\w/, (c) => c.toUpperCase());
      drafts.push({ kind: f.kind, label: f.label || total === 1 ? base : `${base} ${n}`, bars: scale === 1 ? f.bars : roundTo(f.bars * scale, f.bars >= 4 ? 4 : 2),
        energy: f.energy, direction: f.direction, lines: [], instrumental: true, modifiers: [] });
    }
  }

  // ── Chords: the user's chart, or the pack's progression for that kind of section, in the key.
  const realized = pack.progressions.map((p) => realizeProgression(p, key!.tonic, key!.mode));
  const sections: BriefSection[] = [];
  let at = 0;
  drafts.forEach((d, i) => {
    const source = d.chart?.length ? d.chart : realized[progressionIndex(d.kind, pack)];
    const chords = Array.from({ length: d.bars }, (_, b) => source[b % source.length]);
    const { chart: _chart, ...rest } = d;
    sections.push({ ...rest, id: `s${i + 1}`, startBar: at, chords, dynamic: d.dynamic ?? dynamicFor(d.energy) });
    at += d.bars;
  });
  // Land on the tonic unless the song fades or the user charted the ending.
  const last = sections[sections.length - 1];
  const fades = parsed.actions.some((a) => a.action.startsWith('fade-out'));
  if (last && !fades && !drafts[drafts.length - 1].chart?.length && pack.harmonicRhythm < 8) {
    const minorish = !['major', 'lydian', 'mixolydian'].includes(key.mode);
    const tonicChord = realizeProgression(minorish ? 'i' : 'I', key.tonic, key.mode)[0];
    last.chords[last.chords.length - 1] = tonicChord;
  }

  const excluded = (seat: Seat) => style.exclude.some((e) => {
    const word = e.replace(/s$/, '');
    return seat.chair === word || seat.as.toLowerCase().includes(word);
  });

  return {
    title: parsed.title, pack, blend: chosen.blend, styleMatched: chosen.matched,
    bpm, key, keyName: keyName(key), meter, beatsPerBar, swing: pack.swing,
    sections, totalBars: at, seconds: Math.round(at * beatsPerBar * 60 / bpm),
    lineup: pack.lineup.filter((x) => !excluded(x)),
    vocal: { present, gender: style.vocal.gender, styles: style.vocal.styles, rap },
    tags: style.tags, exclude: style.exclude, actions: parsed.actions, unknownTags: parsed.unknownTags,
  };
}

// ─── The read-through: composers and players check the brief ─────────────────────

const HORN_FRIENDLY = [5, 10, 3, 8, 0, 7];      // F Bb Eb Ab C G
const STRING_FRIENDLY = [2, 7, 9, 4, 0, 11];    // D G A E C B (open strings and their relatives)
const nearest = (tonic: number, set: number[]) =>
  set.slice().sort((a, b) => Math.min((a - tonic + 12) % 12, (tonic - a + 12) % 12) - Math.min((b - tonic + 12) % 12, (tonic - b + 12) % 12))[0];

/** Sung syllables per second in a section. */
export function lyricDensity(section: BriefSection, brief: Pick<SongBrief, 'bpm' | 'beatsPerBar'>): number {
  const syl = section.lines.reduce((n, l) => n + l.syllables, 0);
  const seconds = section.bars * brief.beatsPerBar * 60 / brief.bpm;
  return seconds > 0 ? syl / seconds : 0;
}

/**
 * The brief read by the people who would have to play it. Each note is in a player's voice and
 * says what to change; nothing is changed silently, and what the user typed explicitly is kept.
 */
export function reviewBrief(brief: SongBrief): ReviewNote[] {
  const notes: ReviewNote[] = [];
  const { pack, bpm } = brief;
  const say = (from: string, role: string, level: ReviewNote['level'], message: string, sectionId?: string) => notes.push({ from, role, level, message, sectionId });

  if (!brief.styleMatched) say('producer', 'Producer', 'info', 'No style I have a playbook for was named, so this follows the general song form. Name a style (for example "deep house", "bebop", "epic trailer", "drill") for the full treatment.');
  if (brief.unknownTags.length) say('producer', 'Producer', 'info', `Kept as written directions, not understood as structure: ${brief.unknownTags.map((t) => `[${t}]`).join(' ')}.`);

  // Tempo against where the feel lives.
  const [lo, hi] = pack.tempo;
  if (bpm < lo - 2 || bpm > hi + 2) {
    const doubled = bpm * 2 >= lo && bpm * 2 <= hi, halved = bpm / 2 >= lo && bpm / 2 <= hi;
    say('marcus', 'Drums', doubled || halved ? 'info' : 'suggest',
      doubled ? `${bpm} BPM reads as the half-time count of ${pack.label} (${bpm * 2}). I will play it that way.`
      : halved ? `${bpm} BPM reads as the double-time count of ${pack.label} (${bpm / 2}). I will play it that way.`
      : `${pack.label} lives at ${lo}–${hi} BPM. At ${bpm} the groove will not sit like the records; ${bpm < lo ? lo : hi} is the closest that will.`);
  }

  // Words against time.
  for (const sec of brief.sections) {
    if (sec.instrumental || !brief.vocal.present) continue;
    const d = lyricDensity(sec, brief);
    const limit = brief.vocal.rap ? 8 : 4.6;
    if (d > limit) {
      const need = Math.ceil(sec.bars * d / (limit * 0.85) / 4) * 4;
      say('producer', 'Vocal producer', 'problem', `${sec.label}: ${d.toFixed(1)} syllables a second is more than a ${brief.vocal.rap ? 'rapper' : 'singer'} can deliver cleanly at ${bpm} BPM. Give it ${need} bars instead of ${sec.bars}, or trim the lines.`, sec.id);
    } else if (!brief.vocal.rap && d > 0 && d < 0.6 && sec.lines.length > 1) {
      say('producer', 'Vocal producer', 'info', `${sec.label}: very few words for ${sec.bars} bars. I will hold notes and leave space; shorten the section if that is not the intent.`, sec.id);
    }
  }
  if (!brief.vocal.present && brief.sections.some((x) => !x.instrumental)) {
    say('producer', 'Vocal producer', 'info', 'The style asks for no vocals, so the lyrics stay on the sheet and nothing sings them.');
  }
  if (brief.vocal.present && pack.vocals === 'none') {
    say('producer', 'Producer', 'info', `${pack.label} is normally instrumental. The vocal will be treated as a featured solo line over the score.`);
  }

  // Phrase lengths.
  if (brief.meter[0] === 4 && brief.meter[1] === 4) {
    for (const sec of brief.sections) {
      if (sec.bars % 2 === 1 && sec.bars > 1) say('elena', 'Music director', 'suggest', `${sec.label} is ${sec.bars} bars. Odd lengths trip the band unless it is deliberate; ${sec.bars + 1} would phrase evenly.`, sec.id);
      else if (sec.bars % 4 !== 0 && sec.bars > 4 && pack.family !== 'classical') say('elena', 'Music director', 'info', `${sec.label} is ${sec.bars} bars, a half phrase over. I will treat the last two bars as an extension.`, sec.id);
    }
  }

  // Shape.
  if (brief.sections.length >= 3) {
    const e = brief.sections.map((x) => x.energy);
    if (Math.max(...e) - Math.min(...e) < 0.25) say('producer', 'Producer', 'suggest', 'Every section sits at about the same intensity. Mark one section quieter (for example [Bridge | p]) or one bigger so the song has somewhere to go.');
  }
  if (pack.family === 'electronic') {
    brief.sections.forEach((sec, i) => {
      const prev = brief.sections[i - 1];
      if (sec.kind === 'drop' && prev && !['build', 'breakdown', 'prechorus'].includes(prev.kind)) {
        say('nova', 'Synths', 'suggest', `${sec.label} arrives straight out of ${prev.label}. A drop needs a build or a breakdown before it: add [Build | 8 bars] ahead of it.`, sec.id);
      }
    });
    if (!brief.sections.some((x) => x.kind === 'drop' || x.kind === 'chorus') && brief.sections.length > 2 && pack.id !== 'edm-ambient') {
      say('nova', 'Synths', 'info', 'No [Drop] in the form, so I will treat the highest-energy section as the peak.');
    }
  }
  if (pack.family === 'jazz' && !brief.sections.some((x) => x.kind === 'head' || x.kind === 'solo') && brief.sections.length > 1) {
    say('lena', 'Saxophone', 'info', 'No [Head] or [Solo] marked. I will play the first sung section as the head and take a solo over the same changes after it; add [Solo: tenor sax] where you want it.');
  }
  if (pack.family === 'hiphop') {
    const verse = brief.sections.find((x) => x.kind === 'verse'), hook = brief.sections.find((x) => x.kind === 'hook' || x.kind === 'chorus');
    if (verse && hook && hook.bars > verse.bars) say('producer', 'Producer', 'info', `The hook (${hook.bars} bars) is longer than the verse (${verse.bars}). Usual is 8 and 16.`);
  }

  // Keys the instruments like.
  const chairs = new Set<Chair>(brief.lineup.map((x) => x.chair));
  if (pack.family === 'jazz' && (chairs.has('sax') || chairs.has('trumpet')) && !HORN_FRIENDLY.includes(brief.key.tonic)) {
    const better = nearest(brief.key.tonic, HORN_FRIENDLY);
    say('corny', 'Trumpet', 'info', `${brief.keyName} is a hard key for Bb and Eb horns. ${keyName({ tonic: better, mode: brief.key.mode })} sits better under the fingers and will sound more relaxed.`);
  }
  if ((pack.family === 'classical' || pack.family === 'cinematic') && pack.id !== 'classical-romantic' && pack.id !== 'classical-impressionist'
    && !STRING_FRIENDLY.includes(brief.key.tonic) && brief.key.mode !== 'major') {
    const better = nearest(brief.key.tonic, STRING_FRIENDLY);
    say('priya', 'Violin', 'info', `${brief.keyName} gives the strings no open strings to ring. ${keyName({ tonic: better, mode: brief.key.mode })} will sound bigger and darker in the low strings.`);
  }

  // Length against what the renderers can do in one pass.
  if (brief.totalBars > 128 || brief.seconds > 360) {
    say('producer', 'Producer', 'info', `${brief.totalBars} bars (${Math.floor(brief.seconds / 60)}:${String(brief.seconds % 60).padStart(2, '0')}) is longer than one render pass. It will be generated section by section and joined on the timeline.`);
  }
  return notes;
}

// ─── Hand-offs ──────────────────────────────────────────────────────────────────

/** The form and one chord per bar, in the shape the existing ensemble pipeline already reads. */
export function briefToEnsemblePlan(brief: SongBrief): {
  bars: number; seconds: number; summary: string; chords: string[];
  sections: Array<{ title: string; startBar: number; bars: number; direction: string; dynamic: 'p' | 'mp' | 'mf' | 'f' }>;
} {
  const four = (d: Dynamic): 'p' | 'mp' | 'mf' | 'f' => (d === 'pp' || d === 'p' ? 'p' : d === 'ff' || d === 'f' ? 'f' : d);
  return {
    bars: brief.totalBars, seconds: brief.seconds,
    chords: brief.sections.flatMap((x) => x.chords.map((bar) => bar[0])),
    sections: brief.sections.map((x) => ({ title: x.label.slice(0, 80), startBar: x.startBar, bars: x.bars, direction: (x.direction || x.label).slice(0, 300), dynamic: four(x.dynamic) })),
    summary: `${pack(brief)}: ${brief.totalBars} bars, ${brief.meter[0]}/${brief.meter[1]}, ${brief.bpm} BPM, ${brief.keyName}.`,
  };
}
const pack = (b: SongBrief) => (b.blend ? `${b.pack.label} with ${b.blend.label}` : b.pack.label);

/** The whole song as a chart the Session Band reads ("Dm | Bb | F C | …"), and its band genre. */
export function briefToBandChart(brief: SongBrief): { genre: string; chart: string } {
  return { genre: brief.pack.bandGenre, chart: brief.sections.flatMap((x) => x.chords.map((bar) => bar.map(bandChord).join(' '))).join(' | ') };
}

/** A chord the band's chart reader knows: rare extensions fall back to the seventh chord under them. */
export function bandChord(symbol: string): string {
  if (parseChord(symbol)) return symbol;
  const m = symbol.match(/^([A-G][#b]?)(.*)$/);
  if (!m) return symbol;
  const q = m[2].split('/')[0];
  const simple = /m7b5|ø/.test(q) ? 'm7b5' : /^dim/.test(q) ? 'dim' : /^m(?!aj)/.test(q) ? (/\d/.test(q) ? 'm7' : 'm') : /maj/.test(q) ? 'maj7' : /sus/.test(q) ? 'sus4' : /\d/.test(q) ? '7' : '';
  return m[1] + simple;
}

/** Lyric lines placed on bars, in the shape of GrooveDoc.lyrics. */
export function briefToLyricLines(brief: SongBrief): { bar: number; text: string }[] {
  const out: { bar: number; text: string }[] = [];
  for (const sec of brief.sections) {
    const sung = sec.lines.filter((l) => l.words.length);
    if (!sung.length) continue;
    const step = sec.bars / sung.length;
    sung.forEach((l, i) => out.push({ bar: sec.startBar + Math.floor(i * step), text: l.text }));
  }
  return out;
}

/** What an audio renderer (ACE-Step, HeartMuLa) is sent: style tags and section-tagged lyrics. */
export function briefToRenderRequest(brief: SongBrief): {
  prompt: string; lyrics: string; bpm: number; key: string; seconds: number; timeSignature: string; exclude: string[];
} {
  const tags: string[] = [];
  const push = (t: string) => { const k = t.trim().toLowerCase(); if (k && !tags.includes(k) && !brief.exclude.some((e) => k.includes(e))) tags.push(k); };
  brief.tags.forEach(push);
  brief.pack.renderTags.forEach(push);
  brief.blend?.renderTags.slice(0, 3).forEach(push);
  push(`${brief.bpm} bpm`);
  push(brief.keyName);
  if (!brief.vocal.present) push('instrumental');
  else {
    if (brief.vocal.gender && brief.vocal.gender !== 'mixed') push(`${brief.vocal.gender} vocals`);
    brief.vocal.styles.forEach(push);
  }
  const asParsed: ParsedSection[] = brief.sections.map((x) => ({ kind: x.kind, label: x.label, modifiers: x.modifiers, lines: brief.vocal.present ? x.lines : [], instrumental: x.instrumental || !brief.vocal.present }));
  return {
    prompt: tags.join(', '),
    lyrics: brief.vocal.present ? writeLyrics(asParsed, { instrumentalTag: true }) : '[Instrumental]',
    bpm: brief.bpm, key: brief.keyName, seconds: brief.seconds,
    timeSignature: `${brief.meter[0]}/${brief.meter[1]}`, exclude: brief.exclude,
  };
}

/**
 * The brief as text for a language model: what the style demands, the form bar by bar, the chords,
 * who is playing and what each chair does, and the notes from the read-through. Pass a `chair` to
 * write for one player; pass `sectionId` to focus on one section with its neighbours for context.
 */
export function briefGrounding(brief: SongBrief, opts: { chair?: Chair; sectionId?: string; notes?: ReviewNote[]; maxChars?: number } = {}): string {
  const p = brief.pack;
  const out: string[] = [];
  out.push(`STYLE: ${pack(brief)}. ${brief.bpm} BPM${p.halfTime ? ' (felt in half-time)' : ''}, ${brief.meter[0]}/${brief.meter[1]}, key ${brief.keyName}${p.swing > 0.05 ? `, swing ${Math.round(p.swing * 100)}% on ${p.swingGrid}ths` : ', straight'}.`);
  if (brief.tags.length) out.push(`ASKED FOR: ${brief.tags.join(', ')}${brief.exclude.length ? `. Leave out: ${brief.exclude.join(', ')}` : ''}.`);
  out.push(`HARMONY: ${p.harmonyNotes.join(' ')}`);
  out.push(`RHYTHM: ${p.rhythm.join(' ')}`);
  out.push(`ARRANGEMENT: ${p.arrangement.join(' ')}`);
  out.push(`AVOID: ${p.avoid.join(' ')}`);
  if (brief.blend) out.push(`BLEND (${brief.blend.label}): ${brief.blend.harmonyNotes[0]} ${brief.blend.rhythm[0]}`);

  const seats = opts.chair ? brief.lineup.filter((x) => x.chair === opts.chair) : brief.lineup;
  if (opts.chair && seats.length) {
    out.push(`YOUR CHAIR: ${seats.map((x) => `${x.as}: ${x.job}`).join(' | ')}`);
    out.push(`THE REST OF THE SESSION: ${brief.lineup.filter((x) => x.chair !== opts.chair).map((x) => x.as).join(', ')}.`);
  } else {
    out.push('SESSION:\n' + seats.map((x) => `- ${x.as} (${x.chair}): ${x.job}`).join('\n'));
  }

  const focus = opts.sectionId ? brief.sections.findIndex((x) => x.id === opts.sectionId) : -1;
  const shown = focus >= 0 ? brief.sections.slice(Math.max(0, focus - 1), focus + 2) : brief.sections;
  out.push((focus >= 0 ? 'FORM (this section and its neighbours):\n' : 'FORM:\n') + shown.map((x) => {
    const mark = x.id === opts.sectionId ? '>> ' : '';
    const chords = x.chords.map((bar) => bar.join(' ')).join(' | ');
    const words = x.lines.filter((l) => l.words.length).map((l) => l.text).join(' / ');
    return `${mark}${x.label}: bars ${x.startBar + 1}–${x.startBar + x.bars}, ${x.dynamic}, energy ${x.energy.toFixed(2)}. ${x.direction}\n   chords: ${chords}${words ? `\n   words: ${words}` : ''}`;
  }).join('\n'));

  if (brief.vocal.present) out.push(`VOCAL: ${[brief.vocal.gender, ...brief.vocal.styles].filter(Boolean).join(', ') || 'lead vocal'}. ${p.vocalNote ?? ''}`.trim());
  const notes = (opts.notes ?? reviewBrief(brief)).filter((n) => n.level !== 'info' && (!opts.sectionId || !n.sectionId || n.sectionId === opts.sectionId));
  if (notes.length) out.push('NOTES FROM THE READ-THROUGH:\n' + notes.map((n) => `- ${n.role}: ${n.message}`).join('\n'));
  const text = out.join('\n');
  return opts.maxChars && text.length > opts.maxChars ? text.slice(0, opts.maxChars) : text;
}
