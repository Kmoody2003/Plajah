// Melos Beats — the composer council's context packet. Everything the council needs to write music
// that belongs to THIS song, read straight from the doc: the key, the tempo and meter, the bars of
// the region (with a little before and after), what every other track plays there, the chord each
// bar implies, the drum grooves, the song's sections and its lyrics placed on their bars.
//
// Pure (no engine, no network): the client builds it, the server renders it into the prompt, and the
// critic checks the council's draft against it. Times are BEATS (quarter notes) from the region start,
// so negative = before the region; bars are shown 1-based like the ruler.

import type { GrooveDoc, ArrangeTrack, InstrumentType, LyricLine } from '../grooveDoc';
import { songTime } from '../tempoMap';
import { noteOccurrences } from '../clipContent';
import { docKey, keyLabel } from '../songKey';
import { identifyChord, midiToName, nameToPc, pcName, scalePitchClasses } from '../../theory';

export const PART_ROLES = ['melody', 'counter-melody', 'harmony', 'bass', 'pad', 'arp', 'fill'] as const;
export type PartRole = typeof PART_ROLES[number];

/** Instruments the council may ask for (KERA is a sampler with no content of its own — not offered). */
export const COUNCIL_INSTRUMENTS = ['onda', 'aura', 'bajo', 'vela', 'cantus', 'ison', 'pneuma', 'soma'] as const satisfies readonly InstrumentType[];
export type CouncilInstrument = typeof COUNCIL_INSTRUMENTS[number];

/** One thing the council is asked to write: a new part in a role, or a rewrite of an existing track. */
export interface ComposeTarget {
  role: PartRole;
  /** Set = rewrite / vary this instrument track (its current notes are shown to the council). */
  trackId?: string;
}

export interface ComposeRequest {
  /** What it should feel like — the user's own words. */
  description: string;
  startBeats: number;
  endBeats: number;
  targets: ComposeTarget[];
}

/** [start, length, pitch, velocity] — start in beats from the region start. */
export type CtxNote = [number, number, number, number];

export interface ContextBar {
  bar: number;          // 1-based, as on the ruler
  at: number;           // beats from the region start
  beats: number;        // bar length in beats
  sig: string;          // "4/4"
  inRegion: boolean;
  section?: string;
  chord?: string;
  /** The chord's pitch classes, root first (what the arranger voices). */
  chordPcs?: number[];
  lyric?: string;
}

export interface ContextTrack {
  id: string;
  name: string;
  kind: 'instrument' | 'drums';
  instrument?: string;
  role?: PartRole;
  /** Being rewritten by this request (its notes are the material to vary, not to accompany). */
  target?: boolean;
  /** Everything it plays near the region is an earlier council take — an alternative to the part
   *  being written, not something to accompany (left out of chords, clash and doubling checks). */
  councilTake?: boolean;
  notes?: CtxNote[];
  /** Drum pattern grids per pad: "Kick  x...x...x...x..." (one char per 16th, x accent, o hit). */
  drums?: { pattern: string; at: number; lengthBeats: number; pads: { name: string; grid: string }[] }[];
  /** Where in the whole song this track has material ("bars 1–8, 17–32"). */
  presence: string;
}

export interface ComposeContext {
  song: {
    title: string;
    key: string | null;
    scaleTones: string | null;
    /** Tonic + scale the writers use: the project key, else C major. */
    keyPc: number;
    scaleId: string;
    tempo: string;
    meter: string;
    sections: string[];
    totalBars: number;
  };
  region: { startBar: number; endBar: number; beats: number; seconds: number };
  bars: ContextBar[];
  tracks: ContextTrack[];
  /** Every lyric line with its bar (1-based), the whole song — for the emotional arc. */
  lyrics: { bar: number; text: string; inRegion: boolean }[];
  request: ComposeRequest & { targetLabels: string[] };
}

const CONTEXT_BARS = 2;           // bars shown before and after the region
const MAX_NOTES_PER_TRACK = 700;
const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** Rough singer's syllable count (vowel groups, silent final e) — good enough to match notes to words. */
export function syllables(text: string): number {
  let n = 0;
  for (const raw of text.toLowerCase().split(/[^a-z']+/)) {
    const w = raw.replace(/'/g, '');
    if (!w) continue;
    let k = (w.match(/[aeiouy]+/g) ?? []).length;
    if (k > 1 && /[^aeiou]e$/.test(w) && !/[^aeiou]le$/.test(w)) k--;
    n += Math.max(1, k);
  }
  return n;
}

/** Guess what an existing track is doing from its name, register and polyphony. */
export function guessRole(name: string, notes: CtxNote[]): PartRole | undefined {
  const n = name.toLowerCase();
  if (/bass|sub|808|bajo/.test(n)) return 'bass';
  if (/pad|drone|ison|atmos/.test(n)) return 'pad';
  if (/arp/.test(n)) return 'arp';
  if (/chord|keys|piano|organ|string|harm|comp/.test(n)) return 'harmony';
  if (/lead|melody|vocal|voice|topline|hook/.test(n)) return 'melody';
  if (!notes.length) return undefined;
  const avg = notes.reduce((s, x) => s + x[2], 0) / notes.length;
  if (avg < 50) return 'bass';
  const starts = new Map<number, number>();
  for (const x of notes) starts.set(x[0], (starts.get(x[0]) ?? 0) + 1);
  const poly = notes.length / starts.size;
  if (poly >= 1.8) return 'harmony';
  return 'melody';
}

function barRanges(bars: number[]): string {
  if (!bars.length) return 'nowhere';
  const s = [...new Set(bars)].sort((a, b) => a - b);
  const out: string[] = [];
  let a = s[0], b = s[0];
  for (const x of s.slice(1)) { if (x === b + 1) b = x; else { out.push(a === b ? `${a}` : `${a}–${b}`); a = b = x; } }
  out.push(a === b ? `${a}` : `${a}–${b}`);
  return `bar${s.length > 1 ? 's' : ''} ${out.join(', ')}`;
}

/** Tracks the council can write into — real instrument tracks, not pad-owned or foreign ones. */
export function composableTracks(doc: GrooveDoc): ArrangeTrack[] {
  return doc.arrangement.filter((t) => t.kind === 'instrument' && !t.padOwned && !t.foreign && !t.isFolder);
}

export function buildComposeContext(doc: GrooveDoc, req: ComposeRequest): ComposeContext {
  const { tempo, meter } = songTime(doc);
  const start = meter.at(Math.max(0, req.startBeats)).startBeat;
  const end = Math.max(start + 0.25, req.endBeats);
  const regionBeats = end - start;
  const firstBar = meter.at(start).bar;
  const lastBar = meter.at(end - 1e-6).bar;
  const winStart = meter.barToBeat(Math.max(0, firstBar - CONTEXT_BARS));
  const winEnd = meter.barToBeat(lastBar + 1 + CONTEXT_BARS);

  // Song length: the last thing on the timeline.
  let songEnd = end;
  for (const t of doc.arrangement) for (const c of t.clips) songEnd = Math.max(songEnd, c.startBeats + c.lengthBeats);
  const totalBars = meter.at(Math.max(0, songEnd - 1e-6)).bar + 1;

  // Section names by bar: song sections (MEKA), else film section markers.
  const sectionAt = new Map<number, string>();
  const sections: string[] = [];
  if (doc.sections?.length) {
    let bar = 0;
    for (const s of doc.sections) {
      const scene = doc.scenes?.find((x) => x.id === s.sceneId);
      const name = s.name || scene?.name || 'Section';
      sections.push(`${name} (bars ${bar + 1}–${bar + s.bars})`);
      for (let b = bar; b < bar + s.bars; b++) sectionAt.set(b, name);
      bar += s.bars;
    }
  } else if (doc.sectionMarkers?.length) {
    for (const m of [...doc.sectionMarkers].sort((a, b) => a.startBeats - b.startBeats)) {
      const b0 = meter.at(m.startBeats).bar, b1 = meter.at(Math.max(m.startBeats, m.startBeats + m.lengthBeats - 1e-6)).bar;
      sections.push(`${m.title} (bars ${b0 + 1}–${b1 + 1}${m.dramaticCue ? `, ${m.dramaticCue}` : ''})`);
      for (let b = b0; b <= b1; b++) sectionAt.set(b, m.title);
    }
  }

  // Lyrics by bar.
  const lyricLines: LyricLine[] = [...(doc.lyrics ?? [])].filter((l) => l.text.trim()).sort((a, b) => a.bar - b.bar);
  const lyricAt = new Map<number, string>();
  for (const l of lyricLines) lyricAt.set(l.bar, lyricAt.has(l.bar) ? `${lyricAt.get(l.bar)} / ${l.text.trim()}` : l.text.trim());

  const targetIds = new Set(req.targets.map((t) => t.trackId).filter(Boolean) as string[]);

  // Instrument tracks: notes in the window, relative to the region start.
  const tracks: ContextTrack[] = [];
  const harmonyNotes: CtxNote[] = [];   // everything pitched that isn't being rewritten — for chords
  const targetNotes: CtxNote[] = [];    // the rewritten tracks' notes — chords come from them if nothing else plays
  for (const t of composableTracks(doc)) {
    const notes: CtxNote[] = [];
    const presenceBars: number[] = [];
    for (const c of t.clips) {
      for (const o of noteOccurrences(c)) presenceBars.push(meter.at(o.songBeat).bar + 1);
      for (const o of noteOccurrences(c, winStart, winEnd)) {
        notes.push([r3(o.songBeat - start), r3(o.lengthBeats), o.note.key, o.note.vel]);
      }
    }
    notes.sort((a, b) => a[0] - b[0] || a[2] - b[2]);
    const target = targetIds.has(t.id);
    const near = t.clips.filter((c) => c.startBeats < winEnd && c.startBeats + c.lengthBeats > winStart);
    const councilTake = near.length > 0 && near.every((c) => /council/.test(c.generativeEngine ?? ''));
    if (!notes.length && !target && !presenceBars.length) continue;
    const kept = notes.slice(0, MAX_NOTES_PER_TRACK);
    tracks.push({
      id: t.id, name: t.name || 'Untitled', kind: 'instrument', instrument: t.instrument?.type,
      role: guessRole(t.name || '', kept), target: target || undefined, councilTake: councilTake || undefined, notes: kept, presence: barRanges(presenceBars),
    });
    if (!councilTake) (target ? targetNotes : harmonyNotes).push(...kept);
  }

  // Drum tracks: the pattern grids playing in the window.
  for (const t of doc.arrangement) {
    if (t.kind !== 'pattern' || t.foreign) continue;
    const drums: NonNullable<ContextTrack['drums']> = [];
    const presenceBars: number[] = [];
    for (const c of t.clips) {
      const b0 = meter.at(c.startBeats).bar, b1 = meter.at(Math.max(c.startBeats, c.startBeats + c.lengthBeats - 1e-6)).bar;
      for (let b = b0; b <= b1; b++) presenceBars.push(b + 1);
      if (c.startBeats >= winEnd || c.startBeats + c.lengthBeats <= winStart) continue;
      const pat = doc.patterns.find((p) => p.id === c.patternId);
      if (!pat) continue;
      const pads: { name: string; grid: string }[] = [];
      for (const [padStr, steps] of Object.entries(pat.steps)) {
        const pad = doc.kit[Number(padStr)];
        if (!pad || pad.empty || !steps || !Object.keys(steps).length) continue;
        let grid = '';
        for (let i = 0; i < pat.length; i++) {
          const s = steps[i];
          grid += (i && i % 16 === 0 ? '|' : '') + (s ? (s.v >= 100 ? 'x' : 'o') : '.');
        }
        pads.push({ name: pad.name, grid });
      }
      if (pads.length) drums.push({ pattern: pat.name, at: r3(c.startBeats - start), lengthBeats: r3(c.lengthBeats), pads });
    }
    if (!drums.length && !presenceBars.length) continue;
    tracks.push({ id: t.id, name: t.name || 'Drums', kind: 'drums', drums, presence: barRanges(presenceBars) });
  }

  // The bars of the window, with the chord each implies (weighted by how long each pitch sounds).
  const bars: ContextBar[] = [];
  for (let b = Math.max(0, firstBar - CONTEXT_BARS); b <= lastBar + CONTEXT_BARS; b++) {
    const info = meter.at(meter.barToBeat(b));
    const at = info.startBeat - start;
    const weight = new Map<number, number>();
    const lowest = new Map<number, number>();
    const sounding = (src: CtxNote[]) => src.some(([s, len]) => Math.min(s + len, at + info.lenBeats) > Math.max(s, at));
    for (const [s, len, pitch] of sounding(harmonyNotes) ? harmonyNotes : targetNotes) {
      const overlap = Math.min(s + len, at + info.lenBeats) - Math.max(s, at);
      if (overlap <= 0) continue;
      const pc = pitch % 12;
      weight.set(pc, (weight.get(pc) ?? 0) + overlap);
      lowest.set(pc, Math.min(lowest.get(pc) ?? 127, pitch));
    }
    let chord: string | undefined;
    let chordPcs: number[] | undefined;
    if (weight.size) {
      const total = [...weight.values()].reduce((a, x) => a + x, 0);
      const pcs = [...weight.entries()].filter(([, w]) => w >= total * 0.12).map(([pc]) => pc)
        .sort((a, c) => (lowest.get(a)! - lowest.get(c)!));
      const named = identifyChord(pcs.map((pc) => lowest.get(pc)!));
      chord = named?.symbol ?? pcs.map((pc) => pcName(pc)).join(' ');
      const root = named ? nameToPc(named.rootName) : pcs[0];
      chordPcs = [root, ...pcs.filter((pc) => pc !== root)];
    }
    bars.push({
      bar: b + 1, at: r3(at), beats: info.lenBeats, sig: `${info.num}/${info.den}`,
      inRegion: b >= firstBar && b <= lastBar,
      section: sectionAt.get(b), chord, chordPcs, lyric: lyricAt.get(b),
    });
  }

  const key = docKey(doc);
  let scaleTones: string | null = null;
  if (key) {
    const inScale = scalePitchClasses(key.tonic, key.scale);
    scaleTones = [...Array(12).keys()].map((i) => (key.tonic + i) % 12).filter((pc) => inScale[pc]).map((pc) => pcName(pc)).join(' ');
  }
  const bpms = [doc.bpm, ...(doc.tempoMap ?? []).map((p) => p.bpm)].filter((x) => Number.isFinite(x));
  const lo = Math.min(...bpms), hi = Math.max(...bpms);
  const startBpm = Math.round(tempo.bpmAt(start));

  const trackName = (id: string) => doc.arrangement.find((t) => t.id === id)?.name || 'track';
  return {
    song: {
      title: doc.showcaseMetadata?.trackTitle || doc.name || 'Untitled',
      key: key ? keyLabel(key) : null,
      scaleTones,
      keyPc: key?.tonic ?? 0,
      scaleId: key?.scale ?? 'major',
      tempo: lo === hi ? `${Math.round(lo)} BPM` : `${startBpm} BPM at the region (song ranges ${Math.round(lo)}–${Math.round(hi)})`,
      meter: meter.isConstant ? '4/4' : [...new Set(bars.map((b) => b.sig))].join(', '),
      sections,
      totalBars,
    },
    region: {
      startBar: firstBar + 1, endBar: lastBar + 1, beats: r3(regionBeats),
      seconds: Math.round(tempo.secBetween(start, end) * 10) / 10,
    },
    bars,
    tracks,
    lyrics: lyricLines.map((l) => ({ bar: l.bar + 1, text: l.text.trim(), inRegion: l.bar >= firstBar && l.bar <= lastBar })),
    request: {
      ...req, startBeats: start, endBeats: end,
      targetLabels: req.targets.map((t, i) => t.trackId
        ? `${t.trackId} — rewrite "${trackName(t.trackId)}" as ${t.role}`
        : `new:${i} — a new ${t.role} part`),
    },
  };
}

export const noteName = (midi: number) => midiToName(midi);
