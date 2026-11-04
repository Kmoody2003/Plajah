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
import type { Organization, StreamArchive, FastChannelSchedule } from '../types';
import { runElevateLivePipeline } from './elevateLiveBriefing';
import { fetchFastChannelSchedule } from './backendService';
import { airedProgramsInWindow, pickServiceProgram, programMediaUrl } from './elevateChannelAiring';
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

/**
 * A TV-channel run: find the org's channel schedule, work out which programme
 * aired longest inside the window, and present it to the pipeline in the same
 * shape as a stream archive. A LIVE break-in on the channel falls back to the
 * stream recording of that live show.
 */
export async function resolveChannelAiring(run: ElevateLiveRun, org: Organization): Promise<{ archive: StreamArchive; mediaUrl: string }> {
  const candidates = [run.channelOwnerId, org.id, (org as any).creatorId, ...(((org as any).admins as string[]) || [])]
    .filter((v, i, a): v is string => !!v && a.indexOf(v) === i);
  let ownerId = '';
  let schedule: FastChannelSchedule | null = null;
  for (const uid of candidates) {
    const s = await fetchFastChannelSchedule(uid).catch(() => null);
    if (s && ((s.slots && s.slots.length) || (s.weeklySlots && Object.keys(s.weeklySlots).length))) { ownerId = uid; schedule = s; break; }
  }
  if (!schedule) throw new Error('channel-schedule-not-found');

  const program = pickServiceProgram(airedProgramsInWindow(schedule, run.windowStart, run.windowEnd));
  if (!program) throw new Error('channel-nothing-aired');

  if (program.kind === 'LIVE') {
    const archive = await findArchiveForRun(run, [ownerId, org.id]);
    const playbackId = (archive as any)?.muxPlaybackId as string | undefined;
    if (!archive || !playbackId) throw new Error('channel-live-recording-not-found');
    return { archive, mediaUrl: `https://stream.mux.com/${playbackId}.m3u8` };
  }

  const mediaUrl = programMediaUrl(program);
  if (!mediaUrl) throw new Error('channel-program-no-media');
  const archive = {
    id: `channel_${ownerId}_${program.muxPlaybackId || run.windowStart}`,
    title: program.title,
    ownerId,
    ownerName: org.name,
    muxPlaybackId: program.muxPlaybackId,
    durationMs: program.durationSec ? program.durationSec * 1000 : undefined,
    startedAt: program.firstSeenMs,
  } as unknown as StreamArchive;
  return { archive, mediaUrl };
}

let processing = false;

/** One sweep: claim every due run and process it end-to-end. */
export async function processDueElevateRuns(now = Date.now(), orgId?: string): Promise<{ processed: string[]; errors: Array<{ runId: string; error: string }> }> {
  const processed: string[] = [];
  const errors: Array<{ runId: string; error: string }> = [];
  if (processing) return { processed, errors };
  processing = true;
  try {
    const runs = await claimDueElevateRuns(now, 5 * 60 * 1000, 10, orgId);
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
        let archive: StreamArchive | null = null;
        let mediaUrl = '';
        if (run.sourceKind === 'FAST_CHANNEL') {
          // TV channel: transcribe what the channel actually played in the window.
          const aired = await resolveChannelAiring(run, org);
          archive = aired.archive;
          mediaUrl = aired.mediaUrl;
        } else {
          archive = await findArchiveForRun(run, ownerIds);
          if (!archive) throw new Error('archive-not-found');
          const playbackId = (archive as any).muxPlaybackId as string | undefined;
          if (!playbackId) throw new Error('archive-no-playback-id');
          mediaUrl = `https://stream.mux.com/${playbackId}.m3u8`;
        }

        const cfg = await getElevateLiveConfig(org.id).catch(() => null);
        const result = await runElevateLivePipeline(
          {
            run, org, archive,
            mediaUrl,
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
