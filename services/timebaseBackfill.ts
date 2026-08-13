// One-time repair pass that brings an existing video library up to the timebase standard.
//
// Every video uploaded from now on is measured at upload (backendService.uploadVideo) and re-stamped
// from Mux once transcoded. Everything uploaded BEFORE that has no timebase — and often no duration
// either, which is what let the FAST auto-generator pad a 102-second teaser into a 30-minute slot.
// This walks a library, probes only what is genuinely unknown, and writes the result back so the
// repair is permanent rather than recomputed on every viewer's device.

import type { Video } from '../types';
import { updateVideo } from './backendService';
import { extractTimeInfoFromUrl, isCompleteTimebase, type MediaTimebase } from './mediaTimebase';

export interface BackfillReport {
  scanned: number;
  alreadyComplete: number;
  repaired: number;
  failed: number;
  skippedNoUrl: number;
  details: Array<{ id: string; title: string; durationSec?: number; timecode?: string; fps?: number; error?: string }>;
}

/** Best playable URL for probing — the Mux rendition wins, it declares its own frame rate. */
export function probeUrlForVideo(v: Video): string {
  const mux = (v as any).muxPlaybackId;
  if (mux) return `https://stream.mux.com/${mux}.m3u8`;
  const url = v.url || '';
  // An iframe-only embed (YouTube/Vimeo) exposes no media element we can measure.
  if (/youtube\.com|youtu\.be|vimeo\.com/i.test(url)) return '';
  return url;
}

/**
 * Probe + persist a timebase for every video missing one.
 *
 * Deliberately conservative: a video that already has a complete timebase is never re-probed, and a
 * failure is recorded rather than written as a guess — an absent timebase must stay absent so callers
 * re-probe later, instead of a wrong one becoming permanent.
 */
export async function backfillMissingTimebases(
  videos: Video[],
  opts: { concurrency?: number; limit?: number; timeoutMs?: number; onProgress?: (done: number, total: number) => void } = {},
): Promise<BackfillReport> {
  const { concurrency = 3, limit = 500, timeoutMs = 20000, onProgress } = opts;
  const report: BackfillReport = { scanned: 0, alreadyComplete: 0, repaired: 0, failed: 0, skippedNoUrl: 0, details: [] };

  const todo: Video[] = [];
  for (const v of videos) {
    report.scanned++;
    if (isCompleteTimebase((v as any).timebase)) { report.alreadyComplete++; continue; }
    if (!probeUrlForVideo(v)) { report.skippedNoUrl++; continue; }
    todo.push(v);
  }

  const slice = todo.slice(0, limit);
  let done = 0;
  for (let i = 0; i < slice.length; i += concurrency) {
    const batch = slice.slice(i, i + concurrency);
    await Promise.all(batch.map(async v => {
      const url = probeUrlForVideo(v);
      try {
        const info = await extractTimeInfoFromUrl(url, timeoutMs);
        const tb: MediaTimebase | null = info.timebase;
        if (!tb && !(info.durationSec > 0)) {
          report.failed++;
          report.details.push({ id: v.id, title: v.title, error: 'probe failed' });
          return;
        }
        if (tb) {
          await updateVideo(v.id, { timebase: tb, duration: Math.round(tb.durationSec) } as Partial<Video>);
          report.repaired++;
          report.details.push({ id: v.id, title: v.title, durationSec: tb.durationSec, timecode: tb.timecode, fps: tb.fps });
        } else {
          // Rate unknowable (no rVFC, no declared FRAME-RATE). The real length still ends the
          // default-block behaviour, so persist it and leave `timebase` absent to be re-probed later.
          await updateVideo(v.id, { duration: Math.round(info.durationSec) } as Partial<Video>);
          report.repaired++;
          report.details.push({ id: v.id, title: v.title, durationSec: info.durationSec, error: 'fps unknown — duration only' });
        }
      } catch (e: any) {
        report.failed++;
        report.details.push({ id: v.id, title: v.title, error: String(e?.message || e).slice(0, 120) });
      } finally {
        done++; onProgress?.(done, slice.length);
      }
    }));
  }
  return report;
}

/**
 * Runs the backfill at most once per library per device. The pass is idempotent and safe to repeat,
 * but probing is real network + decode work, so don't redo it on every mount.
 */
export async function backfillLibraryOnce(
  ownerId: string, videos: Video[], opts: Parameters<typeof backfillMissingTimebases>[1] = {},
): Promise<BackfillReport | null> {
  const key = `plajah_timebase_backfill_v1_${ownerId}`;
  try { if (localStorage.getItem(key)) return null; } catch { /* private mode */ }
  const missing = videos.filter(v => !isCompleteTimebase((v as any).timebase) && probeUrlForVideo(v));
  if (!missing.length) {
    try { localStorage.setItem(key, String(Date.now())); } catch { /* */ }
    return null;
  }
  const report = await backfillMissingTimebases(videos, opts);
  // Mark done only when nothing failed; a partial pass should get another attempt next session.
  if (report.failed === 0) { try { localStorage.setItem(key, String(Date.now())); } catch { /* */ } }
  return report;
}
