// Chora Direct — the vocal layer.
//
// A generated vocal is not an audio file dropped on a track. It is a score the audio is rendered
// FROM: phrases on the timeline, each a run of notes that carry a syllable, a pitch, a length and
// delivery marks. The user types on the timeline, drags a note, marks a word to be held or
// whispered, and only the phrases that changed are sung again, in context, with the phrases on
// either side handed to the engine so the join is seamless.
//
//   VocalLayer ─ phrases ─ notes(syllable, pitch, time, marks)        what the user edits
//        │
//        ├─ staleRegions()   which stretches need singing again, with pre/post roll
//        ├─ regenRequest()   what an engine is sent for one region (lyrics, notes, context, window)
//        └─ markRendered()   the take that came back, pinned to the exact content it was sung from
//
// This file is the contract between the editor, the composer and whichever engine sings: a
// generative model repainting a window (ACE-Step repaint), or Chora's own singing synthesiser
// driven note by note. It is pure data and pure functions; no audio, no model.

import type { ParsedLine, WordMark } from './songPrompt';
import { readLine } from './songPrompt';
import type { BriefSection, SongBrief } from './songBrief';

export interface VocalNote {
  id: string;
  /** The syllable sung on this note. Empty when the note continues the previous syllable (melisma). */
  syllable: string;
  /** First syllable of a word: where the lyric display puts a space, and where stress usually falls. */
  wordStart: boolean;
  /** Beats from the start of the layer. */
  startBeats: number;
  lengthBeats: number;
  /** MIDI note. For rap and spoken delivery this is the speech contour, not a held pitch. */
  key: number;
  vel: number;
  marks: WordMark[];
}

export interface VocalTake {
  /** none: never sung · fresh: audio matches this content · stale: edited since it was sung. */
  status: 'none' | 'fresh' | 'stale';
  /** contentHash() of the phrase when the audio was rendered. */
  hash?: string;
  /** The rendered audio in the sample store. */
  sampleKey?: string;
  engine?: string;
  seed?: number;
}

export interface VocalPhrase {
  id: string;
  sectionId: string;
  /** The line as written, for the lyric display and the editor. */
  text: string;
  startBeats: number;
  lengthBeats: number;
  notes: VocalNote[];
  /** How it is delivered: "whispered", "belted", "falsetto", "rap", "spoken"… */
  delivery: string[];
  adlibs: string[];
  take: VocalTake;
}

export interface VocalVoice {
  id: string;
  name: string;
  /** Comfortable range, MIDI low to high. */
  range: [number, number];
  /** How the voice is described to a generative engine. */
  prompt: string;
}

export interface VocalLayer {
  voice: VocalVoice;
  language: string;
  phrases: VocalPhrase[];
}

export const VOICES: Record<'female' | 'male', VocalVoice> = {
  female: { id: 'lead-female', name: 'Lead (female)', range: [57, 74], prompt: 'female lead vocal' },   // A3–D5
  male: { id: 'lead-male', name: 'Lead (male)', range: [48, 65], prompt: 'male lead vocal' },           // C3–F4
};

// ─── Pitch helpers ──────────────────────────────────────────────────────────────

const SCALE: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10], lydian: [0, 2, 4, 6, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10], harmonic: [0, 2, 3, 5, 7, 8, 11], 'harmonic minor': [0, 2, 3, 5, 7, 8, 11],
  'melodic minor': [0, 2, 3, 5, 7, 9, 11], aeolian: [0, 2, 3, 5, 7, 8, 10],
};
const LETTER: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** The main tones of a chord symbol (root, third, fifth, seventh when written), as pitch classes. */
export function chordTones(symbol: string): number[] {
  const m = symbol.match(/^([A-G])([#b]?)(.*)$/);
  if (!m) return [];
  const root = (LETTER[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  const q = m[3].split('/')[0];
  const dim = /^(dim|°)/.test(q), half = /m7b5|ø/.test(q);
  const minor = dim || half || /^m(?!aj)/.test(q);
  const third = /^sus2/.test(q) ? 2 : /^sus/.test(q) ? 5 : minor ? 3 : 4;
  const fifth = dim || half ? 6 : /^aug|\+|#5/.test(q) ? 8 : 7;
  const tones = [0, third, fifth];
  if (/maj7|maj9|Δ/.test(q)) tones.push(11);
  else if (/dim7/.test(q)) tones.push(9);
  else if (/7|9|11|13/.test(q)) tones.push(10);
  else if (/6/.test(q)) tones.push(9);
  return tones.map((t) => (root + t) % 12);
}

/** The nearest MIDI note to `target` whose pitch class is allowed, inside the range. */
function nearestIn(target: number, pcs: number[], range: [number, number]): number {
  let best = Math.round(target), bestD = Infinity;
  for (let k = range[0]; k <= range[1]; k++) {
    if (!pcs.includes(((k % 12) + 12) % 12)) continue;
    const d = Math.abs(k - target);
    if (d < bestD) { bestD = d; best = k; }
  }
  return best;
}

// ─── Rhythm: syllables onto the grid ────────────────────────────────────────────

interface Syl { text: string; wordStart: boolean; marks: WordMark[] }

function syllablesOf(line: ParsedLine): Syl[] {
  const out: Syl[] = [];
  for (const w of line.words) {
    w.syllables.forEach((sy, i) => out.push({
      text: sy, wordStart: i === 0,
      // A mark on the word lands where a singer puts it: accent on the first syllable, hold and breath on the last.
      marks: w.marks.filter((mk) => (mk === 'accent' || mk === 'emphasis' ? i === 0 : mk === 'melisma' ? true : i === w.syllables.length - 1)),
    }));
  }
  return out;
}

/**
 * Place n syllables in a window. Finest grid that fits is used (quarters, 8ths, 16ths); notes
 * are legato up to the next, the last one rings, a held word takes time from the gap after it.
 */
function placeSyllables(syls: Syl[], startBeats: number, windowBeats: number): { start: number; length: number }[] {
  const n = syls.length;
  if (!n) return [];
  const usable = Math.max(0.25 * n, windowBeats * 0.82);            // leave a breath at the end of the line
  const grid = n * 1 <= usable ? 1 : n * 0.5 <= usable ? 0.5 : 0.25;
  const starts: number[] = [];
  for (let i = 0; i < n; i++) {
    let t = Math.round((i * usable / n) / grid) * grid;
    if (i > 0 && t <= starts[i - 1]) t = starts[i - 1] + Math.min(grid, 0.25);
    starts.push(t);
  }
  return starts.map((t, i) => {
    const next = i < n - 1 ? starts[i + 1] : Math.min(windowBeats, t + Math.max(grid, Math.min(2, windowBeats - t)));
    let length = Math.max(0.125, next - t);
    if (syls[i].marks.includes('breath-after')) length = Math.max(0.125, length - Math.min(0.25, length / 2));
    if (i === n - 1 && syls[i].marks.includes('hold')) length = Math.max(length, Math.min(windowBeats - t, 4));
    return { start: startBeats + t, length };
  });
}

// ─── Layout: a first, singable pass from the brief ──────────────────────────────

let uidSeq = 0;
const uid = (p: string) => `${p}${(++uidSeq).toString(36)}`;

function chordAt(section: BriefSection, beatInSection: number, beatsPerBar: number): string {
  const bar = Math.max(0, Math.min(section.bars - 1, Math.floor(beatInSection / beatsPerBar)));
  const chords = section.chords[bar] ?? [];
  if (!chords.length) return '';
  const within = beatInSection - bar * beatsPerBar;
  return chords[Math.min(chords.length - 1, Math.floor(within / (beatsPerBar / chords.length)))];
}

/**
 * Lay the lyrics out as an editable vocal layer: one phrase per line, spread across its section,
 * one note per syllable, with a plain, singable melody (chord tones on stressed syllables, steps
 * between, an arch per line, the last line of a section coming home). It is a starting point the
 * composer council and the user both rewrite, and it means the layer exists and can be edited
 * before any audio has been rendered.
 */
export function layoutVocal(brief: SongBrief, voice?: VocalVoice): VocalLayer {
  const v = voice ?? (brief.vocal.gender === 'male' ? VOICES.male : VOICES.female);
  const scale = (SCALE[brief.key.mode] ?? SCALE.major).map((x) => (x + brief.key.tonic) % 12);
  const mid = (v.range[0] + v.range[1]) / 2;
  const phrases: VocalPhrase[] = [];
  if (!brief.vocal.present) return { voice: v, language: 'en', phrases };

  for (const sec of brief.sections) {
    const lines = sec.lines.filter((l) => l.words.length);
    if (!lines.length) continue;
    const secStart = sec.startBar * brief.beatsPerBar;
    const slot = sec.bars * brief.beatsPerBar / lines.length;
    const spoken = brief.vocal.rap || sec.modifiers.some((m) => /rap|spoken|whisper/.test(m));
    // Louder sections sit higher in the voice.
    const centre = mid + Math.round((sec.energy - 0.5) * 6);
    let prev = nearestIn(centre, [brief.key.tonic], v.range);

    lines.forEach((line, li) => {
      const start = secStart + li * slot;
      const syls = syllablesOf(line);
      const times = placeSyllables(syls, start, slot);
      const lastLine = li === lines.length - 1;
      const notes: VocalNote[] = syls.map((sy, i) => {
        const pos = syls.length > 1 ? i / (syls.length - 1) : 0;
        let key: number;
        if (spoken) {
          // Speech contour: near the tonic, lifting on stressed syllables, falling at the line end.
          key = nearestIn(v.range[0] + 7 + (sy.wordStart ? 2 : 0) - (i === syls.length - 1 ? 2 : 0), scale, v.range);
        } else {
          const arch = Math.sin(Math.PI * pos) * (3 + (li % 2) * 2);
          const fall = lastLine ? -pos * 2 : (li % 2 ? pos : -pos);
          const target = centre + arch + fall;
          const onBeat = Math.abs(times[i].start - Math.round(times[i].start)) < 0.01;
          const chord = chordTones(chordAt(sec, times[i].start - secStart, brief.beatsPerBar));
          const pool = (sy.wordStart && onBeat && chord.length) ? chord : scale;
          key = nearestIn(target, pool, v.range);
          // Keep it singable: no leap larger than a fifth between neighbours.
          if (Math.abs(key - prev) > 7) key = nearestIn(prev + Math.sign(key - prev) * 4, scale, v.range);
          if (lastLine && i === syls.length - 1) key = nearestIn(key, chordTones(chordAt(sec, times[i].start - secStart, brief.beatsPerBar)).slice(0, 1).concat(brief.key.tonic), v.range);
        }
        prev = key;
        return {
          id: uid('n'), syllable: sy.text, wordStart: sy.wordStart, startBeats: times[i].start, lengthBeats: times[i].length,
          key, vel: Math.round(60 + sec.energy * 50 + (sy.marks.includes('accent') || sy.marks.includes('emphasis') ? 12 : 0)),
          marks: sy.marks,
        };
      });
      const end = notes.length ? notes[notes.length - 1].startBeats + notes[notes.length - 1].lengthBeats : start + slot;
      phrases.push({
        id: uid('p'), sectionId: sec.id, text: line.text, startBeats: start, lengthBeats: Math.max(0.25, end - start), notes,
        delivery: [...new Set([...sec.modifiers.filter((m) => /whisper|belt|falsetto|rap|spoken|breathy|soft|shout|growl|harmon|choir|scat|chant/.test(m)), ...line.delivery])],
        adlibs: line.adlibs, take: { status: 'none' },
      });
    });
  }
  return { voice: v, language: 'en', phrases };
}

// ─── Editing ────────────────────────────────────────────────────────────────────

/** A fingerprint of everything that changes how a phrase sounds. */
export function contentHash(p: VocalPhrase): string {
  const s = `${p.delivery.join(',')}|${p.adlibs.join(',')}|` + p.notes.map((n) => `${n.syllable}:${n.key}:${n.startBeats.toFixed(3)}:${n.lengthBeats.toFixed(3)}:${n.vel}:${n.marks.join('')}`).join(';');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

const touch = (p: VocalPhrase): VocalPhrase => {
  if (p.take.status === 'none') return p;
  return { ...p, take: { ...p.take, status: p.take.hash === contentHash(p) ? 'fresh' : 'stale' } };
};

const edit = (layer: VocalLayer, phraseId: string, fn: (p: VocalPhrase) => VocalPhrase): VocalLayer => ({
  ...layer, phrases: layer.phrases.map((p) => (p.id === phraseId ? touch(fn(p)) : p)),
});

/**
 * The user retyped a phrase on the timeline. Same number of syllables: the melody and timing are
 * kept and only the words change. Different number: the phrase keeps its place and length, the
 * syllables are spread again and the old melody's shape is carried across.
 */
export function retextPhrase(layer: VocalLayer, phraseId: string, text: string): VocalLayer {
  return edit(layer, phraseId, (p) => {
    const line = readLine(text);
    const syls = syllablesOf(line);
    if (!syls.length) return { ...p, text: line.text, notes: [], adlibs: line.adlibs };
    const delivery = [...new Set([...p.delivery, ...line.delivery])];
    if (syls.length === p.notes.length) {
      return { ...p, text: line.text, adlibs: line.adlibs, delivery,
        notes: p.notes.map((n, i) => ({ ...n, syllable: syls[i].text, wordStart: syls[i].wordStart, marks: syls[i].marks })) };
    }
    const window = Math.max(p.lengthBeats / 0.82, syls.length * 0.25);
    const times = placeSyllables(syls, p.startBeats, window);
    const old = p.notes;
    const notes: VocalNote[] = syls.map((sy, i) => {
      const src = old.length ? old[Math.min(old.length - 1, Math.round(i * (old.length - 1) / Math.max(1, syls.length - 1)))] : undefined;
      return { id: uid('n'), syllable: sy.text, wordStart: sy.wordStart, startBeats: times[i].start, lengthBeats: times[i].length,
        key: src?.key ?? 60, vel: src?.vel ?? 90, marks: sy.marks };
    });
    const end = notes[notes.length - 1].startBeats + notes[notes.length - 1].lengthBeats;
    return { ...p, text: line.text, adlibs: line.adlibs, delivery, notes, lengthBeats: Math.max(0.25, end - p.startBeats) };
  });
}

/** Move, stretch, repitch or re-mark one note. */
export function editNote(layer: VocalLayer, phraseId: string, noteId: string, patch: Partial<Pick<VocalNote, 'key' | 'startBeats' | 'lengthBeats' | 'vel' | 'marks' | 'syllable'>>): VocalLayer {
  return edit(layer, phraseId, (p) => {
    const notes = p.notes.map((n) => (n.id === noteId ? { ...n, ...patch } : n)).sort((a, b) => a.startBeats - b.startBeats);
    const start = Math.min(p.startBeats, notes[0]?.startBeats ?? p.startBeats);
    const end = notes.length ? Math.max(...notes.map((n) => n.startBeats + n.lengthBeats)) : p.startBeats + p.lengthBeats;
    return { ...p, notes, startBeats: start, lengthBeats: end - start };
  });
}

/** Change how a phrase is delivered ("whispered", "belted"). */
export function setDelivery(layer: VocalLayer, phraseId: string, delivery: string[]): VocalLayer {
  return edit(layer, phraseId, (p) => ({ ...p, delivery }));
}

/** Slide a whole phrase in time. */
export function movePhrase(layer: VocalLayer, phraseId: string, deltaBeats: number): VocalLayer {
  return edit(layer, phraseId, (p) => ({ ...p, startBeats: p.startBeats + deltaBeats, notes: p.notes.map((n) => ({ ...n, startBeats: n.startBeats + deltaBeats })) }));
}

/** Cut a phrase in two before the given note, so each half can be regenerated on its own. */
export function splitPhrase(layer: VocalLayer, phraseId: string, noteId: string): VocalLayer {
  const out: VocalPhrase[] = [];
  for (const p of layer.phrases) {
    const at = p.id === phraseId ? p.notes.findIndex((n) => n.id === noteId) : -1;
    if (at <= 0) { out.push(p); continue; }
    const text = (notes: VocalNote[]) => notes.map((n) => (n.wordStart ? ' ' : '') + n.syllable).join('').trim();
    const a = p.notes.slice(0, at), b = p.notes.slice(at);
    const aEnd = a[a.length - 1].startBeats + a[a.length - 1].lengthBeats;
    const stale: VocalTake = p.take.status === 'none' ? { status: 'none' } : { ...p.take, status: 'stale' };
    out.push({ ...p, notes: a, text: text(a), lengthBeats: aEnd - p.startBeats, take: stale });
    out.push({ ...p, id: uid('p'), notes: b, text: text(b), startBeats: b[0].startBeats, lengthBeats: p.startBeats + p.lengthBeats - b[0].startBeats, adlibs: [], take: stale });
  }
  return { ...layer, phrases: out };
}

/** Pin a rendered take to the phrase content it was sung from. */
export function markRendered(layer: VocalLayer, phraseIds: string[], take: { sampleKey: string; engine: string; seed?: number }): VocalLayer {
  return { ...layer, phrases: layer.phrases.map((p) => (phraseIds.includes(p.id) ? { ...p, take: { status: 'fresh', hash: contentHash(p), ...take } } : p)) };
}

// ─── Regeneration in context ────────────────────────────────────────────────────

export interface VocalRegion {
  phraseIds: string[];
  /** The stretch to sing again, in layer beats, including the roll either side. */
  startBeats: number;
  endBeats: number;
  /** The untouched phrases on either side, handed to the engine so the new audio joins them. */
  before?: VocalPhrase;
  after?: VocalPhrase;
}

/**
 * The stretches that need singing: phrases never rendered or edited since. Neighbouring ones are
 * merged so a run of edits is sung in one breath; each region is padded, but never into a
 * neighbouring phrase that is still good.
 */
export function staleRegions(layer: VocalLayer, opts: { rollBeats?: number; includeUnrendered?: boolean } = {}): VocalRegion[] {
  const roll = opts.rollBeats ?? 0.5;
  const phrases = layer.phrases.slice().sort((a, b) => a.startBeats - b.startBeats);
  const needs = (p: VocalPhrase) => p.notes.length > 0 && (p.take.status === 'stale' || (opts.includeUnrendered !== false && p.take.status === 'none'));
  const regions: VocalRegion[] = [];
  let i = 0;
  while (i < phrases.length) {
    if (!needs(phrases[i])) { i++; continue; }
    let j = i;
    while (j + 1 < phrases.length && needs(phrases[j + 1])) j++;
    const before = phrases[i - 1], after = phrases[j + 1];
    const first = phrases[i], last = phrases[j];
    const start = Math.max(before ? before.startBeats + before.lengthBeats : 0, first.startBeats - roll);
    const end = Math.min(after ? after.startBeats : Infinity, last.startBeats + last.lengthBeats + roll);
    regions.push({ phraseIds: phrases.slice(i, j + 1).map((p) => p.id), startBeats: start, endBeats: end, before, after });
    i = j + 1;
  }
  return regions;
}

export interface VocalRegenRequest {
  voice: VocalVoice;
  language: string;
  bpm: number;
  key: string;
  /** The window to replace, in seconds from the start of the layer. */
  startSec: number;
  endSec: number;
  /** Words to sing in the window, one line per phrase. */
  lyrics: string;
  /** What is sung immediately before and after: context only, not to be re-sung. */
  lyricsBefore: string;
  lyricsAfter: string;
  /** Rendered audio either side, for engines that condition on it. */
  audioBefore?: string;
  audioAfter?: string;
  /** The exact notes, for engines that follow a score. Times in seconds from the window start. */
  notes: { syllable: string; key: number; startSec: number; lengthSec: number; vel: number; marks: WordMark[] }[];
  delivery: string[];
  /** The style and section this sits in, as a text prompt for generative engines. */
  prompt: string;
}

/** Everything an engine needs to sing one region again so that it sits in the song around it. */
export function regenRequest(layer: VocalLayer, region: VocalRegion, brief: SongBrief): VocalRegenRequest {
  const spb = 60 / brief.bpm;
  const phrases = layer.phrases.filter((p) => region.phraseIds.includes(p.id)).sort((a, b) => a.startBeats - b.startBeats);
  const section = brief.sections.find((x) => x.id === phrases[0]?.sectionId);
  const delivery = [...new Set(phrases.flatMap((p) => p.delivery))];
  return {
    voice: layer.voice, language: layer.language, bpm: brief.bpm, key: brief.keyName,
    startSec: region.startBeats * spb, endSec: region.endBeats * spb,
    lyrics: phrases.map((p) => p.text).join('\n'),
    lyricsBefore: region.before?.text ?? '', lyricsAfter: region.after?.text ?? '',
    audioBefore: region.before?.take.status === 'fresh' ? region.before.take.sampleKey : undefined,
    audioAfter: region.after?.take.status === 'fresh' ? region.after.take.sampleKey : undefined,
    notes: phrases.flatMap((p) => p.notes).map((n) => ({ syllable: n.syllable, key: n.key, startSec: (n.startBeats - region.startBeats) * spb, lengthSec: n.lengthBeats * spb, vel: n.vel, marks: n.marks })),
    delivery,
    prompt: [layer.voice.prompt, ...delivery, brief.pack.label.toLowerCase(), section ? `${section.label.toLowerCase()}, ${section.dynamic}` : '', `${brief.bpm} bpm`, brief.keyName].filter(Boolean).join(', '),
  };
}

// ─── Views ──────────────────────────────────────────────────────────────────────

/** The guide melody as plain notes: for a preview instrument, for notation, and as a conditioning track. */
export function vocalGuideNotes(layer: VocalLayer): { startBeats: number; lengthBeats: number; key: number; vel: number }[] {
  return layer.phrases.flatMap((p) => p.notes).map((n) => ({ startBeats: n.startBeats, lengthBeats: n.lengthBeats, key: n.key, vel: n.vel }))
    .sort((a, b) => a.startBeats - b.startBeats);
}

/** The lyric as the timeline draws it over a phrase: syllables joined into words, hyphens inside a word. */
export function phraseDisplay(p: VocalPhrase): { noteId: string; label: string; startBeats: number; lengthBeats: number }[] {
  return p.notes.map((n, i) => {
    const next = p.notes[i + 1];
    const continues = next && !next.wordStart;
    return { noteId: n.id, label: `${n.syllable}${continues ? '-' : ''}`, startBeats: n.startBeats, lengthBeats: n.lengthBeats };
  });
}
