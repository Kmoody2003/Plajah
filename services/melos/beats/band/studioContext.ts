// Chora Session Band — live studio context reader. Summarizes the entire GrooveDoc (BPM,
// time signature, key/scale, arrangement tracks, chord progression, unrecorded live keyboard
// chords, lyrics, showcase book/film cue metadata, and active instrument/sub-preset) into a
// concise snapshot used by the musicians, live teacher prompts, reference researcher, and jam engine.

import type { ArrangeTrack, GrooveDoc, InstrumentType } from '../grooveDoc';
import type { PlayedChord } from '../chordAssist';
import type { StudiedReference } from './audioEar';
import { docKeyOrDefault, keyLabel, prefersFlats } from '../songKey';
import { songTime } from '../tempoMap';
import { identifyChord, pcName } from '../../theory';
import { chordMap } from './chords';

export type DocMutator = (fn: (d: GrooveDoc) => void) => void;
let registeredMutator: DocMutator | null = null;
let latestStudiedRef: StudiedReference | null = null;
const studiedListeners = new Set<(r: StudiedReference | null) => void>();

/** Called by BeatsRoom so seated musicians can record, switch sub-presets, and align key/tempo. */
export function registerStudioDocMutator(mutator: DocMutator | null): void {
  registeredMutator = mutator;
}

/** Mutate the active GrooveDoc via BeatsRoom's undo-tracked mutator (or explicit override). */
export function mutateStudioDoc(fn: (d: GrooveDoc) => void, override?: DocMutator): boolean {
  const mut = override ?? registeredMutator;
  if (!mut) return false;
  mut(fn);
  return true;
}

export function setLatestStudiedReference(ref: StudiedReference | null): void {
  latestStudiedRef = ref;
  for (const fn of studiedListeners) fn(ref);
}

export function getLatestStudiedReference(): StudiedReference | null {
  return latestStudiedRef;
}

export function subscribeStudiedReference(fn: (r: StudiedReference | null) => void): () => void {
  studiedListeners.add(fn);
  return () => { studiedListeners.delete(fn); };
}

export interface StudioTrackSummary {
  id: string;
  name: string;
  kind: ArrangeTrack['kind'];
  instrumentType?: InstrumentType;
  presetName?: string;
  noteCount: number;
  hasAudio: boolean;
  muted: boolean;
}

export interface StudioContextSnapshot {
  title: string;
  bpm: number;
  meter: string;
  keyLabel: string;
  keyTonic: number;
  keyScale: string;
  genre: string;
  barCount: number;
  barsWithChords: { bar: number; chords: string[] }[];
  unrecordedChords: string[];
  recentLyrics: { bar: number; text: string }[];
  tracks: StudioTrackSummary[];
  activeTrack?: StudioTrackSummary;
  activeInstrument?: string;
  activePreset?: string;
  showcaseBook?: string;
  showcaseLineage?: string[];
  promptSummary: string;
}

function formatPitchClassChord(pcs: number[], key: ReturnType<typeof docKeyOrDefault>): string {
  if (!pcs.length) return '';
  const detected = identifyChord(pcs.map((pc, i) => 60 + pc + (i > 0 && pc < pcs[0] ? 12 : 0)));
  if (detected?.symbol) return detected.symbol;
  return pcName(pcs[0], prefersFlats(key));
}

function formatPlayedChord(chord: PlayedChord, key: ReturnType<typeof docKeyOrDefault>): string {
  const root = pcName(chord.rootPc, prefersFlats(key));
  return `${root}${chord.chordId ?? ''}`;
}

export interface SummarizeContextOptions {
  trackId?: string;
  recentChords?: PlayedChord[];
  activeInstrument?: string;
  activePreset?: string;
  maxBars?: number;
}

/** Summarize the current project state for musicians, teacher prompts, and live jamming. */
export function summarizeStudioContext(doc: GrooveDoc, opts: SummarizeContextOptions = {}): StudioContextSnapshot {
  const key = docKeyOrDefault(doc);
  const keyStr = keyLabel(key);
  const { tempo, meter } = songTime(doc);
  const bpm = Math.round((tempo.bpmAt(0) || doc.bpm || 120) * 10) / 10;
  const sigAtStart = meter.at(0);
  const meterStr = `${sigAtStart.num}/${sigAtStart.den}`;

  let maxBeat = 16;
  for (const t of doc.arrangement) {
    for (const c of t.clips) {
      maxBeat = Math.max(maxBeat, c.startBeats + c.lengthBeats);
    }
  }
  const barCount = Math.max(4, meter.at(Math.max(0, maxBeat - 1e-4)).bar + 1);
  const spanBars = Math.min(opts.maxBars ?? 8, Math.max(4, barCount));

  const excludeIds = doc.band?.seats ? Object.values(doc.band.seats) : [];
  let mappedChords: Map<number, { at: number; beats: number; pcs: number[] }[]>;
  try {
    mappedChords = chordMap(doc, 0, spanBars, { chart: doc.band?.chart, exclude: excludeIds });
  } catch {
    mappedChords = new Map();
  }

  const barsWithChords: { bar: number; chords: string[] }[] = [];
  for (let b = 0; b < spanBars; b++) {
    const entries = mappedChords.get(b) ?? [];
    const symbols = entries.map((e) => formatPitchClassChord(e.pcs, key)).filter(Boolean);
    if (symbols.length) barsWithChords.push({ bar: b + 1, chords: symbols });
  }

  const tracks: StudioTrackSummary[] = doc.arrangement.map((t) => {
    const noteCount = t.clips.reduce((acc, c) => acc + (c.notes?.length ?? 0), 0);
    const hasAudio = t.clips.some((c) => Boolean(c.audio?.sampleKey));
    return {
      id: t.id,
      name: t.name,
      kind: t.kind,
      instrumentType: t.instrument?.type,
      presetName: t.instrument?.presetName,
      noteCount,
      hasAudio,
      muted: t.mute,
    };
  });

  const activeTrack = opts.trackId ? tracks.find((t) => t.id === opts.trackId) : undefined;
  const activeInstrument = opts.activeInstrument ?? activeTrack?.instrumentType;
  const activePreset = opts.activePreset ?? activeTrack?.presetName;

  const unrecordedChords = (opts.recentChords ?? []).slice(-6).map((c) => formatPlayedChord(c, key));
  const recentLyrics = (doc.lyrics ?? []).slice(0, 6).map((l) => ({ bar: l.bar + 1, text: l.text.trim() })).filter((l) => l.text);

  const meta = doc.showcaseMetadata;
  const parts: string[] = [
    `Song "${doc.name || 'Untitled'}" at ${bpm} BPM, ${meterStr}, Key ${keyStr}`,
  ];
  if (doc.band?.genre) parts.push(`Band style: ${doc.band.genre}`);
  if (activeInstrument || activePreset) {
    parts.push(`Focused seat: ${[activeInstrument?.toUpperCase(), activePreset ? `"${activePreset}"` : ''].filter(Boolean).join(' ')}`);
  }
  if (tracks.length) {
    const desc = tracks.slice(0, 8).map((t) => {
      const tag = t.instrumentType ? `${t.instrumentType}:${t.presetName || t.name}` : `${t.kind}:${t.name}`;
      return `${tag}${t.noteCount ? `(${t.noteCount}n)` : t.hasAudio ? '(audio)' : ''}${t.muted ? '[muted]' : ''}`;
    }).join(', ');
    parts.push(`Tracks (${tracks.length}): ${desc}`);
  }
  if (doc.band?.chart) {
    parts.push(`Chart: ${doc.band.chart}`);
  } else if (barsWithChords.length) {
    const progression = barsWithChords.slice(0, 6).map((b) => `B${b.bar}:${b.chords.join('/')}`).join(' | ');
    parts.push(`Progression: ${progression}`);
  }
  if (unrecordedChords.length) parts.push(`Just played live: ${unrecordedChords.join(' -> ')}`);
  if (recentLyrics.length) parts.push(`Lyrics: ${recentLyrics.map((l) => `b${l.bar}:"${l.text}"`).join(' ')}`);
  if (meta?.bookTitle) {
    parts.push(`Story world: ${meta.bookTitle}${meta.characterOrTheme ? ` (${meta.characterOrTheme})` : ''}`);
  }

  return {
    title: doc.name || 'Untitled',
    bpm,
    meter: meterStr,
    keyLabel: keyStr,
    keyTonic: key.tonic,
    keyScale: key.scale,
    genre: doc.band?.genre ?? 'pop',
    barCount,
    barsWithChords,
    unrecordedChords,
    recentLyrics,
    tracks,
    activeTrack,
    activeInstrument,
    activePreset,
    showcaseBook: meta?.bookTitle,
    showcaseLineage: meta?.composerLineage,
    promptSummary: parts.join('. ').slice(0, 900),
  };
}
