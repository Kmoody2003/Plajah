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
