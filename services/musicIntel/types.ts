// Music Intelligence — shared types (server pipeline + client read surface).
//
// The Chora sibling of Taleo Story Intelligence: after a music album is published, the API
// listens to every song (measured DSP facts + a listening model grounded on them + the synced
// lyrics) and writes a per-track breakdown and an album-level read. Stored server-only:
//   musicIntel/{albumId}                    job + album report
//   musicIntel/{albumId}/tracks/{trackId}   one TrackIntel per song
// and served through GET /api/music-intel/:albumId, so no firestore.rules change is needed.

export type MusicIntelStatus = 'QUEUED' | 'LISTENING' | 'SYNTHESIZING' | 'READY' | 'PARTIAL' | 'FAILED';

export interface MeasuredSection {
  startSec: number;
  endSec: number;
  /** Similarity letter: sections that share harmony get the same letter (A, B, A …). */
  label: string;
  /** Relative loudness of the section within the song, 0..1. */
  energy: number;
}

export interface MeasuredAudio {
  durationSec: number;
  sampleRate: number;
  channels: 1 | 2;
  integratedLufs: number | null;
  loudnessRangeLu: number;
  samplePeakDbfs: number;
  crestFactorDb: number | null;
  stereo: { width: number; correlation: number } | null;
  /** Energy share per band, in percent. */
  spectralBalance: { sub: number; low: number; lowMid: number; highMid: number; presence: number; air: number };
  brightnessHz: number | null;
  tempo: { bpm: number; confidence: number };
  key: { key: string; mode: 'major' | 'minor'; confidence: number; alternate: string; chroma: number[] };
  /** Short-term loudness, normalised 0..1; one point per `energyCurveStepSec`. */
  energyCurve: number[];
  energyCurveStepSec: number;
  sections: MeasuredSection[];
}

export type HostCardKind = 'intro' | 'lyric' | 'composition' | 'mix' | 'emotion' | 'context' | 'outro';

/** The radio-host voice: a short spoken-style note, optionally pinned to a moment in the song. */
export interface HostCard {
  kind: HostCardKind;
  title: string;
  text: string;
  atSec?: number;
}

export interface TrackIntel {
  trackId: string;
  title: string;
  version: number;
  analyzedAt: number;
  /** The url the analysis heard — a changed url re-runs the song. */
  sourceUrl: string;
  measured: MeasuredAudio | null;
  summary: string;
  genreTags: string[];
  mood: { primary: string; secondary: string[]; valence: number; arousal: number };
  emotionalArc: { atSec: number; emotion: string; intensity: number; note: string }[];
  sections: { startSec: number; endSec: number; label: string; description: string }[];
  lyrics: {
    hasVocals: boolean;
    themes: string[];
    imagery: string[];
    perspective: string;
    storyArc: string;
    craft: string;
    standoutLines: { line: string; why: string }[];
  };
  composition: {
    key: string;
    tempoBpm: number;
    timeSignature: string;
    harmony: string;
    melody: string;
    rhythm: string;
    arrangement: string;
    instrumentation: string[];
    /** Lead-sheet chord chart, section by section. */
    chordChart: { section: string; chords: string[] }[];
  };
  production: {
    overview: string;
    techniques: { technique: string; where: string; effect: string }[];
    vocals: string;
    lowEnd: string;
    space: string;
    dynamics: string;
  };
  hostCards: HostCard[];
  linerNote: string;
  error?: string;
}

export interface FilmContext {
  status: 'LINKED' | 'PENDING' | 'NONE';
  filmAlbumId?: string;
  filmTitle?: string;
  logline?: string;
  themes?: string[];
  characters?: string[];
  /** How the music serves the film, written once both reads exist. */
  connection?: string;
}

export interface AlbumIntel {
  overview: string;
  sonicSignature: string;
  sequencing: string;
  throughlines: string[];
  standoutMoments: { trackId: string; atSec?: number; why: string }[];
  linerNotes: string;
  hostCards: HostCard[];
}

export interface MusicIntelJob {
  albumId: string;
  ownerId: string;
  status: MusicIntelStatus;
  progress: { done: number; total: number; note?: string };
  isSoundtrack: boolean;
  film?: FilmContext;
  album?: AlbumIntel;
  /** trackId → url last analysed; drives incremental re-runs when tracks change. */
  heard?: Record<string, string>;
  version: number;
  createdAt: number;
  updatedAt: number;
  error?: string;
}

export interface MusicIntelBundle {
  job: MusicIntelJob | null;
  tracks: Record<string, TrackIntel>;
}

export const MUSIC_INTEL_VERSION = 1;

/**
 * The creator's corrections to a song's read — stored beside the analysis, never inside it, so
 * a re-run can't overwrite what the artist fixed. Applied on every read (applyIntelCorrections).
 */
export interface TrackIntelCorrections {
  summary?: string;
  genreTags?: string[];
  moodPrimary?: string;
  moodSecondary?: string[];
  key?: string;
  tempoBpm?: number;
  timeSignature?: string;
  themes?: string[];
  linerNote?: string;
  /** Section relabels by index (the boundaries are measured, the names are the artist's call). */
  sectionLabels?: Record<string, string>;
  updatedAt?: number;
}

/** Overlay the creator's corrections on a measured/listened read. Pure — returns a new object. */
export function applyIntelCorrections(t: TrackIntel, c: TrackIntelCorrections | null | undefined): TrackIntel {
  if (!c) return t;
  const out: TrackIntel = {
    ...t,
    mood: { ...t.mood },
    composition: { ...t.composition },
    lyrics: { ...t.lyrics },
    sections: t.sections.map((s) => ({ ...s })),
  };
  if (c.summary != null) out.summary = c.summary;
  if (c.genreTags) out.genreTags = c.genreTags;
  if (c.moodPrimary != null) out.mood.primary = c.moodPrimary;
  if (c.moodSecondary) out.mood.secondary = c.moodSecondary;
  if (c.key != null) out.composition.key = c.key;
  if (c.tempoBpm != null && Number.isFinite(c.tempoBpm)) out.composition.tempoBpm = c.tempoBpm;
  if (c.timeSignature != null) out.composition.timeSignature = c.timeSignature;
  if (c.themes) out.lyrics.themes = c.themes;
  if (c.linerNote != null) out.linerNote = c.linerNote;
  for (const [i, label] of Object.entries(c.sectionLabels ?? {})) {
    const s = out.sections[Number(i)];
    if (s) s.label = label;
  }
  return out;
}
