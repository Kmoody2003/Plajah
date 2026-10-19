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

import { auth, db, storage } from './firebase';
import { doc, getDoc } from 'firebase/firestore';
import { onSnapshot } from './safeSnapshot';
import { ref, getDownloadURL } from 'firebase/storage';
import { getHalloweenStoryIntelBundle, getSyntheticAnalysisJob } from '../data/halloweenStoryIntel';

/**
 * Ask the server to run (or re-run) Story Intelligence for an album the caller owns.
 * Server-side + fire-and-forget by nature: the worker keeps going whether or not any
 * page stays open — progress lands on the taleoAnalysis/{albumId} job doc.
 * `force` re-runs a title that already has a finished analysis (a fresh run costs
 * real money, so the server ignores repeat requests without it). Non-throwing.
 */
export async function requestAnalysis(
  albumId: string,
  opts: { force?: boolean } = {},
): Promise<{ ok: boolean; status?: string; error?: string }> {
  try {
    if (!auth.currentUser) return { ok: false, error: 'Sign in required.' };
    const token = await auth.currentUser.getIdToken();
    const appUrl = (import.meta as any).env?.VITE_APP_URL ?? window.location.origin;
    const res = await fetch(`${appUrl}/api/taleo/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ albumId, ...(opts.force ? { force: true } : {}) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error || `HTTP ${res.status}` };
    return { ok: true, status: data?.status };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Network error' };
  }
}

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
  /** Direct URL to the character's verified close-up portrait frame from the movie */
  imageUrl?: string;
  /** Storage relative path (e.g. "stills/char_1_portrait.jpg") */
  portraitPath?: string;
  /** ID of the still in report.stills representing this character's best frame */
  portraitStillId?: string;
  /** Additional gallery still IDs for this character */
  stillIds?: string[];
  /** Timestamp in seconds of the character's primary close-up frame in the movie */
  bestFrameSec?: number;
}

export interface StoryReportDialogueLine {
  tSec: number;
  speaker: string;
  parenthetical?: string;
  text: string;
}

export interface StoryReportShot {
  slug: string;
  type: 'WIDE' | 'MED' | 'CU' | 'ECU' | 'INSERT' | 'POV' | 'OTS' | 'ESTABLISHING';
  startSec: number;
  endSec: number;
  camera: string;
  action: string;
  purpose?: string;
  character?: string;
  dialogue?: StoryReportDialogueLine[];
  stillIndex?: number;
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
  /** Shot-by-shot camera, action, and line-by-line dialogue breakdown within this scene. */
  shots?: StoryReportShot[];
  /** Formatted screenplay text for this scene in cut order. */
  script?: string;
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
  imageUrl?: string;
  portraitPath?: string;
  stillIds?: string[];
  bestFrameSec?: number;
}

export interface StoryReportMacguffin {
  refId: string;
  name: string;
  description: string;
  narrativeRole: 'MACGUFFIN' | 'KEY_PROP' | 'MOTIF';
  sceneIds: string[];
  evidence: string[];
  imageUrl?: string;
  portraitPath?: string;
  stillIds?: string[];
  bestFrameSec?: number;
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
  version: 1 | 2;
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
  /** Full reverse-engineered Fountain screenplay across all acts, scenes, shots, and dialogue lines. */
  screenplay?: string;
  transcriptPath?: string;
}

/**
 * Formats a StoryReport into an industry-standard Fountain screenplay (scene-by-scene,
 * shot-by-shot, line-by-line) if `report.screenplay` is not already pre-rendered.
 */
export function buildFountainFromStoryReport(report: StoryReport, title = 'Untitled Film'): string {
  if (report.screenplay && report.screenplay.trim().length > 40) {
    return report.screenplay;
  }
  const lines: string[] = [
    `Title: ${title}`,
    `Credit: Reverse-Engineered by Plajah Taleo Story Intelligence`,
    `Notes: ${report.logline || ''}`,
    '',
    'FADE IN:',
    '',
  ];

  const sortedScenes = [...(report.scenes || [])].sort((a, b) => a.index - b.index);
  let currentAct = 0;

  for (const scene of sortedScenes) {
    if (scene.actNumber && scene.actNumber !== currentAct) {
      currentAct = scene.actNumber;
      const actMeta = report.structure?.acts?.find(a => a.number === currentAct);
      lines.push(`# ACT ${currentAct}${actMeta?.title ? ` — ${actMeta.title.toUpperCase()}` : ''}`);
      lines.push('');
    }
    const fmtTime = (sec: number) => {
      const s = Math.max(0, Math.floor(sec || 0));
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    };
    lines.push(`${(scene.slugline || `INT. ${scene.title} - CONTINUOUS`).toUpperCase()} /* [${fmtTime(scene.startSec)} - ${fmtTime(scene.endSec)}] */`);
    lines.push('');

    if (scene.script && scene.script.trim()) {
      lines.push(scene.script.trim());
      lines.push('');
      continue;
    }

    if (Array.isArray(scene.shots) && scene.shots.length > 0) {
      for (const sh of scene.shots) {
        lines.push(`[${sh.slug} · ${sh.type} · ${fmtTime(sh.startSec)}–${fmtTime(sh.endSec)}] ${sh.action || sh.camera}`);
        lines.push('');
        if (Array.isArray(sh.dialogue)) {
          for (const d of sh.dialogue) {
            lines.push((d.speaker || 'VOICE').toUpperCase());
            if (d.parenthetical) lines.push(`(${d.parenthetical.replace(/^\(|\)$/g, '')})`);
            lines.push(d.text);
            lines.push('');
          }
        }
      }
    } else if (scene.summary) {
      lines.push(scene.summary);
      lines.push('');
    }
  }

  lines.push('FADE OUT.');
  return lines.join('\n');
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
  const fallbackJob = getSyntheticAnalysisJob(albumId);
  try {
    return onSnapshot(
      doc(db, 'taleoAnalysis', albumId),
      snap => {
        try {
          if (snap.exists()) {
            const remoteJob = snap.data() as TaleoAnalysisJob;
            cb(remoteJob.status === 'READY' || !fallbackJob ? remoteJob : fallbackJob);
          } else {
            cb(fallbackJob);
          }
        } catch { /* subscriber errors must not kill the stream */ }
      },
      () => cb(fallbackJob)
    );
  } catch {
    cb(fallbackJob);
    return () => {};
  }
}

/** One-shot read of the analysis job. Null when absent or unreadable. */
export async function getAnalysisJob(albumId: string): Promise<TaleoAnalysisJob | null> {
  const fallbackJob = getSyntheticAnalysisJob(albumId);
  try {
    const snap = await getDoc(doc(db, 'taleoAnalysis', albumId));
    if (snap.exists()) {
      const remoteJob = snap.data() as TaleoAnalysisJob;
      return remoteJob.status === 'READY' || !fallbackJob ? remoteJob : fallbackJob;
    }
    return fallbackJob;
  } catch {
    return fallbackJob;
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
    const precomputed = getHalloweenStoryIntelBundle(job.albumId)?.report;
    if (job.reportPath?.startsWith('inline://halloween-story-intel/') && precomputed) {
      return precomputed;
    }
    try {
      const path = job.reportPath || `taleoAnalysis/${job.ownerId}/${job.albumId}/report.json`;
      const url = await getDownloadURL(ref(storage, path));
      const res = await fetch(url);
      if (!res.ok) throw new Error(`report fetch ${res.status}`);
      const report = (await res.json()) as StoryReport;
      if (!report || !Array.isArray(report.scenes)) throw new Error('malformed report');
      return report;
    } catch (e) {
      if (precomputed) return precomputed;
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
