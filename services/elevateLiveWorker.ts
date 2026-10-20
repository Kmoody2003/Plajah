// elevateLiveWorker — the scheduler half of Elevate Live.
//
// Mirrors the repo's two real scheduling patterns:
//   • in-process workers booted in server.ts (services/sportsIngestionWorker.ts,
//     services/terraIngestionWorker.ts): single-flight guard + setInterval
//   • the external-cron endpoint (server.ts POST /api/cron/publish-due-posts)
// In production this runs SERVER-SIDE (cloud-native default): either boot
// startElevateLiveScheduler() beside the sports/terra workers, or expose
// processDueElevateRuns() behind POST /api/cron/elevate-live-due guarded by
// the same x-cron-key check and have Cloud Scheduler call it every minute.
// The identical function powers a manual "Run now" in the Elevate Content
// Studio (browser, org-admin session) — behaviour does not differ, only who
// holds the credentials.

import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase';
import type { Organization, StreamArchive } from '../types';
import { runElevateLivePipeline } from './elevateLiveBriefing';
import {
  claimDueElevateRuns, updateElevateLiveRun, getElevateLiveConfig,
  saveElevateBriefing, saveElevateArticle, saveRepurposeJob, publishElevateBriefing,
} from './elevateLiveStore';
import type { ElevateLiveRun } from './elevateLiveBriefing';

/** Resolve an org by its exact display name (live account data — org ids are
 *  not in the repo). Returns null when there is no unambiguous match. */
export async function resolveOrgByName(name: string): Promise<Organization | null> {
  const snap = await getDocs(query(collection(db, 'organizations'), where('name', '==', name)));
  if (snap.docs.length !== 1) return null;
  return { id: snap.docs[0].id, ...(snap.docs[0].data() as any) } as Organization;
}

/** The stream archive created when the run's stream/slot ended
 *  (backendService.saveStreamArchive -> stream_archives/{id}). Matches on the
 *  owner ids that could have streamed it and a start inside the window. */
export async function findArchiveForRun(run: ElevateLiveRun, ownerIds: string[]): Promise<StreamArchive | null> {
  const snap = await getDocs(query(collection(db, 'stream_archives'), where('startedAt', '>=', run.windowStart - 15 * 60 * 1000)));
  const candidates = snap.docs
    .map(d => ({ id: d.id, ...(d.data() as any) } as StreamArchive & { startedAt?: number; endedAt?: number }))
    .filter(a => (a as any).startedAt <= run.windowEnd)
    .filter(a => !ownerIds.length || ownerIds.includes((a as any).ownerId));
  candidates.sort((a, b) => ((a as any).startedAt || 0) - ((b as any).startedAt || 0));
  return candidates[0] || null;
}

let processing = false;

/** One sweep: claim every due run and process it end-to-end. */
export async function processDueElevateRuns(now = Date.now()): Promise<{ processed: string[]; errors: Array<{ runId: string; error: string }> }> {
  const processed: string[] = [];
  const errors: Array<{ runId: string; error: string }> = [];
  if (processing) return { processed, errors };
  processing = true;
  try {
    const runs = await claimDueElevateRuns(now);
    for (const run of runs) {
      try {
        let org: Organization | null = null;
        if (run.orgId) {
          const byName = await resolveOrgByName(run.orgName);
          org = byName && byName.id === run.orgId ? byName : byName;
        } else if (run.requiresOrgResolution) {
          org = await resolveOrgByName(run.orgName);
          if (!org) throw new Error('org-unresolved');
        }
        if (!org) throw new Error('org-unresolved');

        // Candidate stream owners: the org itself + its channel owner (for a
        // FAST channel, FastChannel.id === the channel owner's uid).
        const ownerIds = [org.id, run.channelOwnerId].filter(Boolean) as string[];
        const archive = await findArchiveForRun(run, ownerIds);
        if (!archive) throw new Error('archive-not-found');
        const playbackId = (archive as any).muxPlaybackId as string | undefined;
        if (!playbackId) throw new Error('archive-no-playback-id');

        const cfg = await getElevateLiveConfig(org.id).catch(() => null);
        const result = await runElevateLivePipeline(
          {
            run, org, archive,
            mediaUrl: `https://stream.mux.com/${playbackId}.m3u8`,
            outputs: cfg?.outputs || { article: true, briefing: true, clips: true, bookChapter: false },
            autoPublishBriefing: cfg?.autoPublishBriefing !== false,
          },
          {
            saveBriefing: saveElevateBriefing, saveArticle: saveElevateArticle,
            saveJob: saveRepurposeJob as any, publishBriefing: publishElevateBriefing,
          },
        );
        await updateElevateLiveRun(run.id, {
          status: 'READY', processedAt: Date.now(), briefingId: result.briefing.id,
          jobId: result.jobId, archiveId: (archive as any).id,
          ...(run.requiresOrgResolution ? { orgId: org.id } : {}),
        });
        processed.push(run.id);
      } catch (e: any) {
        const error = String(e?.message || e || 'unknown');
        errors.push({ runId: run.id, error });
        await updateElevateLiveRun(run.id, { status: 'ERROR', error }).catch(() => undefined);
      }
    }
  } finally {
    processing = false;
  }
  return { processed, errors };
}

// ─── In-process scheduler (same shape as startSportsIngestionScheduler) ──────

let schedulerStarted = false;

export function startElevateLiveScheduler(options: { intervalMs?: number } = {}): void {
  if (schedulerStarted) return;
  schedulerStarted = true;
  const intervalMs = options.intervalMs ?? 60 * 1000;
  const tick = () => { processDueElevateRuns().catch(() => undefined); };
  tick();
  setInterval(tick, intervalMs);
}
