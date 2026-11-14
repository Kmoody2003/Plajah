// Chora Session Band — Fresh Take & Accompaniment Generator.
// Turns a studied audio reference (mic hum, song from computer, project mix) and/or a researched
// creative brief (book, movie, vibe) into original playable MIDI phrases and drum grooves locked to
// the song's key, scale, chord changes, BPM, and instrument MIDI range.

import { scalePitchClasses, snapToScale } from '../../theory';
import { grooveUid, type GrooveDoc, type NoteEvent } from '../grooveDoc';
import { songTime } from '../tempoMap';
import { parseChord } from './chords';
import { kitMap } from './printTake';
import { hashSeed, rng, type BandHit, type BandNote } from './performer';
import type { StudiedReference } from './audioEar';
import type { ResearchBrief } from './referenceResearch';

export type FreshTakeMode = 'fresh-take' | 'accompany';
export type FreshTakeRole = 'melody' | 'bass' | 'comp' | 'percussion';

export interface FreshTakeParams {
  role: FreshTakeRole;
  keyTonic: number;
  keyScale: string;
  bpm: number;
  bars?: number;
  beatsPerBar?: number;
  range: [number, number];
  seed?: number;
  mode: FreshTakeMode;
  reference?: StudiedReference | null;
  research?: ResearchBrief | null;
  chordSymbols?: string[];
}

export interface FreshTakeNote extends BandNote {
  bar: number;
}

export interface FreshTakeHit extends BandHit {
  bar: number;
}

export interface FreshTakeResult {
  notes: FreshTakeNote[];
  hits: FreshTakeHit[];
  chords: string[];
  description: string;
}

function clampToRange(midi: number, lo: number, hi: number): number {
  let m = midi;
  while (m < lo) m += 12;
  while (m > hi) m -= 12;
  return Math.max(lo, Math.min(hi, Math.round(m)));
}

function resolveChordTones(symbols: string[], bars: number, tonic: number, scaleMask: boolean[]): number[][] {
  const fallbackThird = scaleMask[(tonic + 3) % 12] && !scaleMask[(tonic + 4) % 12] ? 3 : 4;
  const fallback = [tonic, (tonic + fallbackThird) % 12, (tonic + 7) % 12];
  const out: number[][] = [];
  for (let b = 0; b < bars; b++) {
    const sym = symbols.length ? symbols[b % symbols.length] : '';
    const pcs = sym ? parseChord(sym) : null;
    out.push(pcs && pcs.length ? pcs : fallback);
  }
  return out;
}

/** Compose original playable notes/hits for real-time jam or direct timeline capture. */
export function composeFreshTake(params: FreshTakeParams): FreshTakeResult {
  const bars = Math.max(1, Math.min(16, Math.round(params.bars ?? 4)));
  const beatsPerBar = Math.max(2, Math.min(12, Math.round(params.beatsPerBar ?? 4)));
  const scaleMask = scalePitchClasses(params.keyTonic, params.keyScale);
  const lo = Math.min(params.range[0], params.range[1]);
  const hi = Math.max(params.range[0], params.range[1]);
  const r = rng(hashSeed(`${params.role}:${params.mode}:${params.keyTonic}:${params.keyScale}`, params.seed ?? 42));

  const symbols = params.chordSymbols?.length
    ? params.chordSymbols
    : params.research?.chords?.length
      ? params.research.chords
      : params.reference?.chords?.length
        ? params.reference.chords
        : [];
  const barChords = resolveChordTones(symbols, bars, params.keyTonic, scaleMask);
  const energy = params.research?.energy ?? params.reference?.energy ?? 0.58;
  const swing = params.research?.swing ?? 0.08;

  const notes: FreshTakeNote[] = [];
  const hits: FreshTakeHit[] = [];

  if (params.role === 'percussion') {
    const beatbox = params.reference?.beatboxHits ?? [];
    for (let bar = 0; bar < bars; bar++) {
      if (beatbox.length >= 2) {
        for (const bh of beatbox) {
          const inBar = bh.beat - Math.floor(bh.beat / beatsPerBar) * beatsPerBar;
          const mappedVoice = bh.cls === 'kick' ? 'kick' : bh.cls === 'snare' ? 'snare' : 'hatC';
          const variedAt = params.mode === 'fresh-take' && mappedVoice === 'hatC'
            ? (inBar + 0.5) % beatsPerBar
            : inBar;
          hits.push({ bar, at: Math.round(variedAt * 16) / 16, voice: mappedVoice, vel: bh.vel });
        }
      }
      hits.push({ bar, at: 0, voice: 'kick', vel: Math.round(88 + energy * 30) });
      if (beatsPerBar >= 3) hits.push({ bar, at: beatsPerBar >= 4 ? 2 : 1.5, voice: 'kick', vel: 84 });
      if (beatsPerBar >= 4) {
        hits.push({ bar, at: 1, voice: 'snare', vel: Math.round(80 + energy * 24) });
        hits.push({ bar, at: 3, voice: 'snare', vel: Math.round(84 + energy * 24) });
      } else {
        hits.push({ bar, at: 1, voice: 'rim', vel: 76 });
      }
      const step = energy > 0.65 ? 0.5 : 1;
      for (let bt = 0; bt < beatsPerBar; bt += step) {
        const isOff = bt % 1 !== 0;
        hits.push({ bar, at: bt + (isOff ? swing * 0.28 : 0), voice: isOff && r() < 0.25 ? 'shaker' : 'hatC', vel: isOff ? 58 : 74 });
      }
    }
    return {
      notes: [],
      hits,
      chords: symbols,
      description: beatbox.length
        ? `${params.mode === 'fresh-take' ? 'Fresh groove variation' : 'Pocket accompaniment'} inspired by your ${beatbox.length} beatbox hits.`
        : `${params.research?.title ?? 'Original rhythm pocket'} at ${params.bpm} BPM.`,
    };
  }

  const contour = params.reference?.contourNotes ?? [];
  if (contour.length >= 2) {
    const rootMid = Math.round((lo + hi) / 2);
    const baseMidi = contour[0].midi;
    for (let bar = 0; bar < bars; bar++) {
      const chordPcs = barChords[bar];
      const barStart = bar * beatsPerBar;
      const barNotes = contour.filter((n) => n.startBeats >= barStart && n.startBeats < barStart + beatsPerBar);
      const sourceSlice = barNotes.length ? barNotes : contour.slice(0, Math.min(4, contour.length));

      sourceSlice.forEach((src, idx) => {
        const localBeat = barNotes.length ? src.startBeats - barStart : ((idx / sourceSlice.length) * beatsPerBar);
        const interval = src.midi - baseMidi;
        let candidateMidi: number;

        if (params.mode === 'fresh-take') {
          const sign = bar % 2 === 1 ? -1 : 1;
          const shiftedBeat = Math.min(beatsPerBar - 0.25, Math.max(0, localBeat + (bar % 2 === 1 ? 0.25 : 0)));
          const raw = rootMid + sign * interval + (idx % 2 === 0 ? 0 : (chordPcs[0] - params.keyTonic));
          const clamped = clampToRange(raw, lo, hi);
          const snapped = snapToScale(clamped, params.keyTonic, params.keyScale);
          candidateMidi = clampToRange(snapped, lo, hi);
          notes.push({
            bar,
            at: Math.round(shiftedBeat * 16) / 16,
            len: Math.max(0.25, Math.min(beatsPerBar - shiftedBeat, src.lengthBeats * 0.9)),
            key: candidateMidi,
            vel: Math.max(54, Math.min(118, src.vel)),
          });
        } else {
          if (params.role === 'bass') {
            if (idx % 2 !== 0) return;
            const pc = chordPcs[idx === 0 ? 0 : Math.min(2, chordPcs.length - 1)];
            const midi = clampToRange(lo + ((pc - (lo % 12) + 12) % 12), lo, Math.min(hi, lo + 18));
            notes.push({ bar, at: idx === 0 ? 0 : Math.min(beatsPerBar - 0.5, localBeat), len: 1.5, key: midi, vel: 92 });
          } else {
            const harmonyOffset = params.role === 'comp' ? -5 : 4;
            const snapped = snapToScale(clampToRange(rootMid + interval * 0.5 + harmonyOffset, lo, hi), params.keyTonic, params.keyScale);
            const pos = idx % 2 === 0 ? localBeat : Math.min(beatsPerBar - 0.5, localBeat + 0.5);
            notes.push({
              bar,
              at: Math.round(pos * 16) / 16,
              len: params.role === 'comp' ? 1.5 : 0.75,
              key: clampToRange(snapped, lo, hi),
              vel: 74,
            });
          }
        }
      });
    }
  } else {
    const center = Math.round((lo + hi) / 2);
    for (let bar = 0; bar < bars; bar++) {
      const chordPcs = barChords[bar];
      if (params.role === 'bass') {
        const root = clampToRange(lo + ((chordPcs[0] - (lo % 12) + 12) % 12), lo, Math.min(hi, lo + 16));
        const fifth = clampToRange(lo + ((chordPcs[Math.min(2, chordPcs.length - 1)] - (lo % 12) + 12) % 12), lo, Math.min(hi, lo + 18));
        notes.push({ bar, at: 0, len: 1.4, key: root, vel: Math.round(92 + energy * 22) });
        if (beatsPerBar >= 3) notes.push({ bar, at: beatsPerBar >= 4 ? 1.5 : 1, len: 0.75, key: fifth, vel: 78 });
        if (beatsPerBar >= 4) notes.push({ bar, at: 2.5, len: 1.0, key: root, vel: 86 });
      } else if (params.role === 'comp') {
        const stabAt = swing > 0.2 ? [0, 1.66, 3] : [0, 2];
        for (const bt of stabAt) {
          if (bt >= beatsPerBar) continue;
          for (const pc of chordPcs.slice(0, 3)) {
            const voice = clampToRange(center - 6 + ((pc - ((center - 6) % 12) + 12) % 12), lo, hi);
            notes.push({ bar, at: bt, len: swing > 0.2 ? 0.65 : 1.5, key: voice, vel: Math.round(62 + energy * 24) });
          }
        }
      } else {
        const steps = energy > 0.65 ? [0, 0.75, 1.5, 2.5, 3.25] : [0, 1, 2.5];
        steps.forEach((bt, i) => {
          if (bt >= beatsPerBar) return;
          const pc = chordPcs[(i + bar) % chordPcs.length];
          const archShift = (bar % 4 < 2 ? i * 2 : -i * 2);
          const snapped = snapToScale(clampToRange(center + archShift + ((pc - (center % 12) + 12) % 12), lo, hi), params.keyTonic, params.keyScale);
          notes.push({
            bar,
            at: bt + (bt % 1 !== 0 ? swing * 0.2 : 0),
            len: i === steps.length - 1 ? 1.0 : 0.65,
            key: clampToRange(snapped, lo, hi),
            vel: Math.round(70 + (i === 0 ? 18 : 6) + r() * 14),
          });
        });
      }
    }
  }

  for (const n of notes) n.key = clampToRange(n.key, lo, hi);

  const label = params.mode === 'fresh-take' ? 'Fresh Take' : 'Accompaniment';
  const sourceDesc = params.reference
    ? `from "${params.reference.title}"`
    : params.research
      ? `inspired by "${params.research.title}"`
      : 'locked to your project key & groove';

  return {
    notes,
    hits,
    chords: symbols,
    description: `${label} (${notes.length} notes) ${sourceDesc}.`,
  };
}

/**
 * Commit a composed FreshTakeResult directly into the user's GrooveDoc (instrument clip notes or
 * MEKA drum pattern hits) inside an undo-tracked `onMutate` call. Returns the count of written events.
 */
export function writeFreshTakeToDoc(
  doc: GrooveDoc,
  trackId: string | undefined,
  result: FreshTakeResult,
  opts: { startBeats?: number; beatsPerBar?: number; defaultNote?: number; label?: string } = {},
): number {
  const bpb = Math.max(2, opts.beatsPerBar ?? songTime(doc).meter.at(Math.max(0, opts.startBeats ?? 0)).lenBeats ?? 4);
  const baseBeat = Math.max(0, opts.startBeats ?? (doc.loop?.on ? doc.loop.startBeats : 0));
  const barInfo = songTime(doc).meter.at(baseBeat);
  const clipStart = barInfo.startBeat;

  const track = trackId ? doc.arrangement.find((t) => t.id === trackId && t.kind === 'instrument') : undefined;
  if (track) {
    const baseNote = opts.defaultNote ?? 48;
    const events: NoteEvent[] = [];
    for (const n of result.notes) {
      events.push({
        id: grooveUid(),
        startBeats: Math.max(0, n.bar * bpb + n.at),
        lengthBeats: Math.max(0.0625, n.len),
        key: Math.max(0, Math.min(127, Math.round(n.key))),
        vel: Math.max(1, Math.min(127, Math.round(n.vel))),
        ...(n.articulation ? { articulation: n.articulation } : {}),
        ...(n.expr ? { expr: n.expr } : {}),
      });
    }
    if (!events.length && result.hits.length) {
      const zoneOffset: Record<string, number> = { kick: 0, snare: 2, rim: 4, hatC: 5, shaker: 5, clap: 3, tomH: 7, tomL: -5 };
      for (const h of result.hits) {
        events.push({
          id: grooveUid(),
          startBeats: Math.max(0, h.bar * bpb + h.at),
          lengthBeats: 0.25,
          key: Math.max(24, Math.min(96, baseNote + (zoneOffset[h.voice] ?? 0))),
          vel: Math.max(1, Math.min(127, Math.round(h.vel))),
        });
      }
    }
    if (!events.length) return 0;
    const maxBeat = events.reduce((acc, e) => Math.max(acc, e.startBeats + e.lengthBeats), bpb);
    const clipLen = Math.max(bpb, Math.ceil(maxBeat / bpb) * bpb);
    track.clips.push({
      id: grooveUid(),
      startBeats: clipStart,
      lengthBeats: clipLen,
      notes: events,
      name: opts.label || 'Musician Take',
      generativeEngine: 'session-band',
    });
    return events.length;
  }

  if (!result.hits.length) return 0;
  const map = kitMap(doc.kit);
  let pat = doc.patterns[0];
  if (!pat) {
    pat = { id: grooveUid(), name: opts.label || 'Band Drums', groupIdx: 0, length: 64, steps: {} };
    doc.patterns.push(pat);
  }
  if (pat.length < 64) pat.length = 64;
  let written = 0;
  for (const h of result.hits) {
    const padIdx = map[h.voice];
    if (padIdx < 0) continue;
    const stepIdx = Math.round((h.bar * bpb + h.at) * 4);
    if (stepIdx < 0 || stepIdx >= pat.length) continue;
    if (!pat.steps[padIdx]) pat.steps[padIdx] = {};
    pat.steps[padIdx][stepIdx] = { v: Math.max(1, Math.min(127, Math.round(h.vel))) };
    written++;
  }
  return written;
}
