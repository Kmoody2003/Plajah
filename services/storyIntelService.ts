// ─── Taleo Story Intelligence (Phase 1) ──────────────────────────────────────
// After a creator publishes a movie, a background worker "watches" the film —
// sampling stills + audio, perceiving characters/scenes/locations, reasoning
// about structure — and writes:
//   (a) a job doc at  taleoAnalysis/{albumId}            (Firestore, status+progress)
//   (b) a report at   taleoAnalysis/{ownerId}/{albumId}/ (Storage: report.json,
//       transcript.json, stills/*.jpg)
// This service is the CLIENT read surface: watch the job, fetch the report,
// resolve still URLs. Everything is read-only and non-throwing — analysis is a
// bonus layer and must never break the movie page.

import { db, storage } from './firebase';
import { doc, getDoc } from 'firebase/firestore';
import { onSnapshot } from './safeSnapshot';
import { ref, getDownloadURL } from 'firebase/storage';

// ─── Types (source of truth for the Phase-1 pipeline) ────────────────────────

export type TaleoAnalysisScope = 'MOVIE' | 'TV_EPISODE' | 'TV_SERIES';

export type TaleoAnalysisStatus =
  | 'WAITING_MEDIA'
  | 'QUEUED'
  | 'SAMPLING'
  | 'PERCEIVING'
  | 'REASONING'
  | 'ASSEMBLING'
  | 'READY'
  | 'PARTIAL'
  | 'FAILED'
  | 'SKIPPED';

export interface TaleoAnalysisJob {
  albumId: string;
  ownerId: string;
  scope: TaleoAnalysisScope;
  status: TaleoAnalysisStatus;
  progress: { stage: string; pct: number; note?: string };
  counts?: {
    characters: number;
    scenes: number;
    sequences: number;
    locations: number;
    macguffins: number;
    stills: number;
  };
  coverage?: 'FULL' | 'PARTIAL';
  reportPath?: string;
  usage?: any;
  pipelineVersion: number;
  createdAt: number;
  updatedAt: number;
  error?: string;
}

export interface StoryReportAct {
  number: number;
  title: string;
  startSec: number;
  endSec: number;
  summary: string;
  turningPoint?: string;
}

export interface StoryReportCharacter {
  refId: string;
  name: string;
  aka: string[];
  tier: 'MAIN' | 'SUPPORTING' | 'MINOR';
  description: string;
  arc?: string;
  appearances: { sceneId: string; tSec: number }[];
  screenTimeSec: number;
  dialogueLines: number;
  confidence: number;
  evidence: string[];
}

export interface StoryReportScene {
  id: string;
  index: number;
  slugline: string;
  title: string;
  summary: string;
  startSec: number;
  endSec: number;
  actNumber: number;
  sequenceId?: string;
  locationRefId?: string;
  timeOfDay?: string;
  mood?: string;
  characterRefIds: string[];
  stillIndexes: number[];
}

export interface StoryReportSequence {
  id: string;
  title: string;
  sceneIds: string[];
  purpose: string;
}

export interface StoryReportLocation {
  refId: string;
  name: string;
  description: string;
  kind: string;
  sceneIds: string[];
  confidence: number;
}

export interface StoryReportMacguffin {
  refId: string;
  name: string;
  description: string;
  narrativeRole: 'MACGUFFIN' | 'KEY_PROP' | 'MOTIF';
  sceneIds: string[];
  evidence: string[];
  confidence: number;
}

export interface StoryReportStill {
  id: string;
  tSec: number;
  sceneId: string;
  path: string;
  kind: string;
}

export interface StoryReport {
  version: 1;
  logline: string;
  synopsis: string;
  themes: string[];
  structure: { acts: StoryReportAct[] };
  characters: StoryReportCharacter[];
  scenes: StoryReportScene[];
  sequences: StoryReportSequence[];
  locations: StoryReportLocation[];
  macguffins: StoryReportMacguffin[];
  stills: StoryReportStill[];
}

// ─── Job doc (Firestore) ─────────────────────────────────────────────────────

/**
 * Live-watch the analysis job for an album. Non-throwing: a permission error,
 * a missing doc or a corrupted watch stream all just deliver `null`.
 * Returns an unsubscribe function (always safe to call).
 */
export function watchAnalysisJob(
  albumId: string,
  cb: (job: TaleoAnalysisJob | null) => void
): () => void {
  try {
    return onSnapshot(
      doc(db, 'taleoAnalysis', albumId),
      snap => {
        try {
          cb(snap.exists() ? (snap.data() as TaleoAnalysisJob) : null);
        } catch { /* subscriber errors must not kill the stream */ }
      },
      () => cb(null)
    );
  } catch {
    cb(null);
    return () => {};
  }
}

/** One-shot read of the analysis job. Null when absent or unreadable. */
export async function getAnalysisJob(albumId: string): Promise<TaleoAnalysisJob | null> {
  try {
    const snap = await getDoc(doc(db, 'taleoAnalysis', albumId));
    return snap.exists() ? (snap.data() as TaleoAnalysisJob) : null;
  } catch {
    return null;
  }
}

// ─── Report + stills (Storage) ───────────────────────────────────────────────

// In-memory per-album cache — the review UI may be opened repeatedly in one
// session and the report is immutable per pipeline run.
const reportCache = new Map<string, Promise<StoryReport | null>>();
const stillUrlCache = new Map<string, Promise<string | null>>();

/**
 * Fetch + parse the worker's report.json for a finished job.
 * Cached per albumId; a failed fetch is not cached so a retry can succeed.
 */
export function fetchStoryReport(job: TaleoAnalysisJob): Promise<StoryReport | null> {
  const cached = reportCache.get(job.albumId);
  if (cached) return cached;

  const p = (async (): Promise<StoryReport | null> => {
    try {
      const path = job.reportPath || `taleoAnalysis/${job.ownerId}/${job.albumId}/report.json`;
      const url = await getDownloadURL(ref(storage, path));
      const res = await fetch(url);
      if (!res.ok) throw new Error(`report fetch ${res.status}`);
      const report = (await res.json()) as StoryReport;
      if (!report || !Array.isArray(report.scenes)) throw new Error('malformed report');
      return report;
    } catch (e) {
      console.warn('[storyIntel] report fetch failed:', (e as Error)?.message);
      reportCache.delete(job.albumId); // let a later open retry
      return null;
    }
  })();

  reportCache.set(job.albumId, p);
  return p;
}

/**
 * Resolve a download URL for one still. `path` is the report's still path —
 * either relative to the job folder (e.g. "stills/0004.jpg") or already the
 * full Storage path. Cached; null on failure (render a placeholder).
 */
export function stillUrl(ownerId: string, albumId: string, path: string): Promise<string | null> {
  const fullPath = path.startsWith('taleoAnalysis/')
    ? path
    : `taleoAnalysis/${ownerId}/${albumId}/${path.replace(/^\/+/, '')}`;

  const cached = stillUrlCache.get(fullPath);
  if (cached) return cached;

  const p = getDownloadURL(ref(storage, fullPath)).catch(() => {
    stillUrlCache.delete(fullPath);
    return null;
  });
  stillUrlCache.set(fullPath, p);
  return p;
}
