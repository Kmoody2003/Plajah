// Melos Beats — how the council talks to small on-device models. They write one part as plain
// lines, one note per line — `bar beat length pitch` (e.g. `3 1.5 0.5 F#4`) — because a 1–2B
// model keeps that format far more reliably than nested JSON with MIDI numbers. The prompt gives
// them exactly what a session player would get: key, tempo, the feeling, each bar's chord and
// lyric line with its syllable count, the role's range, and (for a counter-melody) the melody.
// The parser is forgiving: it reads every line that looks like a note and ignores the rest.

import { syllables, type ComposeContext, type PartRole } from './composeContext';
import type { ComposedNote } from './composeCouncil';
import { ROLE_RANGE } from './composeCouncil';
import { midiToName, nameToPc } from '../../theory';

const SUNG: [number, number] = [48, 79];

export function partRange(role: PartRole, ctx: ComposeContext): [number, number] {
  return role === 'melody' && ctx.lyrics.some((l) => l.inRegion) ? SUNG : ROLE_RANGE[role];
}

const ROLE_BRIEF: Record<PartRole, string> = {
  melody: 'the lead melody — the line people remember',
  'counter-melody': 'a counter-melody that answers the melody: move when it holds, hold when it moves, mostly in contrary motion',
  harmony: 'chords', bass: 'the bass line', pad: 'a sustained pad', arp: 'an arpeggio', fill: 'a short fill into the next section',
};

export function partPrompt(ctx: ComposeContext, role: PartRole, opts: { melody?: ComposedNote[]; existing?: ComposedNote[] } = {}): { system: string; user: string } {
  const [lo, hi] = partRange(role, ctx);
  const sung = role === 'melody' && ctx.lyrics.some((l) => l.inRegion);
  const system = [
    'You are a session musician writing ONE part for a song, as plain text.',
    'Write one note per line in this exact form: bar beat length pitch',
    '  bar    = the bar number from the list',
    '  beat   = where the note starts in that bar, counting from 1 (1, 1.5, 2, 2.75 …)',
    '  length = how long it lasts, in beats (0.25 = sixteenth, 0.5 = eighth, 1 = quarter, 2 = half)',
    '  pitch  = note name with octave: C4 is middle C, then C#4, Eb4, F#3, Bb4 …',
    'Example:',
    '1 1 1 A4',
    '1 2 0.5 C5',
    '1 2.5 0.5 B4',
    'It is ONE line of music: one note at a time, each note starting where the one before it ends',
    '(never two notes on the same beat). Beats in a bar count 1, 2, 3, 4.',
    'Write only note lines. No words, no explanations, no code fences.',
  ].join('\n');

  const L: string[] = [];
  L.push(`Song: ${ctx.song.title}. Key: ${ctx.song.key ?? 'C major'}${ctx.song.scaleTones ? ` (notes in the key: ${ctx.song.scaleTones})` : ''}. Tempo: ${ctx.song.tempo}.`);
  L.push(`How it should feel: ${ctx.request.description.trim() || 'whatever this moment of the song needs'}`);
  L.push(`Write ${ROLE_BRIEF[role]}. Stay between ${midiToName(lo)} and ${midiToName(hi)}.`);
  L.push('');
  L.push('The bars:');
  for (const b of ctx.bars.filter((x) => x.inRegion)) {
    const lyric = b.lyric ? ` — sung words: "${b.lyric}" (${syllables(b.lyric)} syllables)` : '';
    L.push(`bar ${b.bar}: ${b.beats} beats, chord ${b.chord ?? 'free'}${lyric}`);
  }
  if (sung) {
    L.push('');
    L.push('This melody is SUNG: give each syllable one note, put stressed syllables on beats 1 and 3, end each line on a longer note and leave a short breath before the next line. Lines that start in a bar may run into the following bars.');
  }
  if (opts.melody?.length) {
    L.push('');
    L.push('The melody it answers:');
    L.push(toLines(ctx, opts.melody).join('\n'));
  }
  if (opts.existing?.length) {
    L.push('');
    L.push('The part as it is now (vary it, keep what makes it recognisable):');
    L.push(toLines(ctx, opts.existing).slice(0, 120).join('\n'));
  }
  const first = ctx.bars.find((b) => b.inRegion)!.bar, last = [...ctx.bars].reverse().find((b) => b.inRegion)!.bar;
  L.push('');
  L.push(`Use chord tones on beat 1 of each bar. Write the whole part for bars ${first} to ${last} now.`);
  return { system, user: L.join('\n') };
}

/** Notes → note lines (for showing a model the melody / the existing part). */
export function toLines(ctx: ComposeContext, notes: ComposedNote[]): string[] {
  return notes.map((n) => {
    let bar = ctx.bars[0];
    for (const b of ctx.bars) if (b.at <= n.start + 1e-6) bar = b;
    const beat = Math.round((n.start - bar.at + 1) * 1000) / 1000;
    return `${bar.bar} ${beat} ${Math.round(n.length * 1000) / 1000} ${midiToName(n.pitch)}`;
  });
}

const NUM = String.raw`(\d+(?:\.\d+)?|\d+\/\d+)`;
const LINE = new RegExp(String.raw`^\s*(?:[-*•]\s*)?(?:bar\s*)?(\d+)[\s,;:|]+(?:beat\s*)?${NUM}[\s,;:|]+(?:len(?:gth)?\s*)?${NUM}[\s,;:|]+([A-Ga-g])\s*([#♯b♭]?)\s*(-?\d)\b`, 'i');
const num = (s: string) => (s.includes('/') ? Number(s.split('/')[0]) / Number(s.split('/')[1]) : Number(s));

/** Parse a model's note lines into region-relative notes; lines that don't parse are skipped. */
export function parseNoteLines(text: string, ctx: ComposeContext, velocity = 80): ComposedNote[] {
  const out: ComposedNote[] = [];
  const barAt = new Map(ctx.bars.map((b) => [b.bar, b] as const));
  for (const raw of text.replace(/```[a-z]*/gi, '').split(/\r?\n/)) {
    const m = raw.match(LINE);
    if (!m) continue;
    const bar = barAt.get(Number(m[1]));
    if (!bar || !bar.inRegion) continue;
    const beat = num(m[2]), length = num(m[3]);
    if (!(beat >= 1) || !(length > 0) || beat - 1 >= bar.beats + 1e-6) continue;
    const acc = m[5] === '#' || m[5] === '♯' ? '#' : m[5] === 'b' || m[5] === '♭' ? 'b' : '';
    const pc = nameToPc(m[4].toUpperCase() + acc);
    const octave = Number(m[6]);
    // B#/Cb wrap across the octave boundary.
    const pitch = 12 * (octave + 1) + pc + (m[4].toUpperCase() === 'B' && acc === '#' ? 12 : 0) - (m[4].toUpperCase() === 'C' && acc === 'b' ? 12 : 0);
    if (pitch < 0 || pitch > 127) continue;
    out.push({ start: bar.at + beat - 1, length: Math.min(length, 16), pitch, velocity });
  }
  return out.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
}
