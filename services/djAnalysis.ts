// djAnalysis.ts — precomputed, cached audio analysis (waveform peaks + beat grid) for a track.
//
// Computed ONCE (ideally at upload) and stored in Firestore `trackAnalysis/{trackId}`, so the
// scrolling waveform, beat grid, and DJ decks populate INSTANTLY with no on-play decode delay.
// Resolution order: inline track.audioAnalysis → in-memory cache → Firestore → compute (+persist).
// Never throws to callers that use the safe wrappers; returns null when it genuinely can't analyse.

import { db, auth } from './backendService';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { decodeMono, detectBeatsFromBuffer } from './audioBeatDetection';
import type { AudioAnalysis, Track } from '../types';

// Bump when the peak/beat algorithm changes so stale docs recompute.
export const ANALYSIS_VERSION = 1;
const PEAK_BUCKETS = 1024;   // waveform resolution stored per track (compact, Firestore-friendly)
const MAX_STORED_BEATS = 2048;

const memCache = new Map<string, AudioAnalysis>();      // by track id
const urlCache = new Map<string, AudioAnalysis>();      // by url (warmed at upload, before a track id exists)
const inflight = new Map<string, Promise<AudioAnalysis | null>>();
const urlInflight = new Map<string, Promise<AudioAnalysis | null>>();

/** Downsample mono PCM to normalized 0–1 peak buckets for waveform rendering. */
function extractPeaks(data: Float32Array, buckets = PEAK_BUCKETS): number[] {
  const step = Math.max(1, Math.floor(data.length / buckets));
  const peaks = new Array<number>(buckets).fill(0);
  let globalMax = 1e-4;
  for (let i = 0; i < buckets; i++) {
    const start = i * step;
    let max = 0;
    for (let j = 0; j < step && start + j < data.length; j++) {
      const v = Math.abs(data[start + j]);
      if (v > max) max = v;
    }
    peaks[i] = max;
    if (max > globalMax) globalMax = max;
  }
  for (let i = 0; i < buckets; i++) peaks[i] = Math.round((peaks[i] / globalMax) * 1000) / 1000;
  return peaks;
}

/** Build the full analysis from already-decoded mono PCM (no extra fetch). */
export function analysisFromMono(data: Float32Array, sampleRate: number, duration: number): AudioAnalysis {
  const beat = detectBeatsFromBuffer(data, sampleRate, duration);
  return {
    version: ANALYSIS_VERSION,
    bpm: beat.bpm,
    confidence: beat.confidence,
    firstBeatSec: beat.firstBeatSec,
    duration,
    peaks: extractPeaks(data),
    beats: beat.beats.slice(0, MAX_STORED_BEATS),
  };
}

/** Fetch + decode a URL and compute its analysis. Throws on fetch/decode failure. */
export async function computeAudioAnalysis(url: string, signal?: AbortSignal): Promise<AudioAnalysis> {
  const { data, sampleRate, duration } = await decodeMono(url, signal);
  return analysisFromMono(data, sampleRate, duration);
}

function isFresh(a: AudioAnalysis | undefined | null): a is AudioAnalysis {
  return !!a && a.version === ANALYSIS_VERSION && Array.isArray(a.peaks) && a.peaks.length > 0;
}

/** Persist analysis to `trackAnalysis/{trackId}` (best-effort; needs auth per rules). */
export async function persistAnalysis(trackId: string, analysis: AudioAnalysis): Promise<void> {
  memCache.set(trackId, analysis);
  if (!trackId || !auth.currentUser) return;
  try { await setDoc(doc(db, 'trackAnalysis', trackId), analysis as any); } catch { /* best-effort */ }
}

/**
 * Resolve a track's analysis from the fastest available source, computing + persisting if needed.
 * Safe: returns null instead of throwing. De-duped so concurrent callers share one computation.
 */
export async function getOrComputeAnalysis(track: Pick<Track, 'id' | 'url' | 'audioAnalysis'>, opts?: { persist?: boolean; signal?: AbortSignal }): Promise<AudioAnalysis | null> {
  const persist = opts?.persist !== false;
  if (isFresh(track.audioAnalysis)) return track.audioAnalysis!;
  const cached = memCache.get(track.id);
  if (isFresh(cached)) return cached;
  // Warmed at upload by URL, before this track had an id — adopt it and persist by id.
  if (track.url) {
    const u = urlCache.get(track.url);
    if (isFresh(u)) { memCache.set(track.id, u!); if (persist) void persistAnalysis(track.id, u!); return u!; }
  }
  const existing = inflight.get(track.id);
  if (existing) return existing;

  const job = (async (): Promise<AudioAnalysis | null> => {
    // Firestore (already computed by another session / at upload)
    try {
      const snap = await getDoc(doc(db, 'trackAnalysis', track.id));
      if (snap.exists()) {
        const a = snap.data() as AudioAnalysis;
        if (isFresh(a)) { memCache.set(track.id, a); return a; }
      }
    } catch { /* fall through to compute */ }

    if (!track.url) return null;
    try {
      const analysis = await computeAudioAnalysis(track.url, opts?.signal);
      memCache.set(track.id, analysis);
      if (persist) await persistAnalysis(track.id, analysis);
      return analysis;
    } catch { return null; }
  })();

  inflight.set(track.id, job);
  try { return await job; } finally { inflight.delete(track.id); }
}

/** Synchronous peek at whatever analysis is already resolved (inline or cached) — no I/O. */
export function getCachedAnalysis(track: Pick<Track, 'id' | 'url' | 'audioAnalysis'>): AudioAnalysis | null {
  if (isFresh(track.audioAnalysis)) return track.audioAnalysis!;
  const c = memCache.get(track.id);
  if (isFresh(c)) return c;
  const u = track.url ? urlCache.get(track.url) : null;
  return isFresh(u) ? u! : null;
}

/**
 * Warm the URL cache at upload time (before a track id exists). Best-effort, fire-and-forget:
 * when the track later plays, getOrComputeAnalysis finds this instantly and persists it by id.
 */
export function precomputeByUrl(url?: string | null): void {
  if (!url || urlCache.has(url) || urlInflight.has(url)) return;
  const job = computeAudioAnalysis(url)
    .then(a => { urlCache.set(url, a); return a; })
    .catch(() => null)
    .finally(() => { urlInflight.delete(url); });
  urlInflight.set(url, job);
}
