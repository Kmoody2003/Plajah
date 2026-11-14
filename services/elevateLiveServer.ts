// elevateLiveServer — Event Intelligence runs fire on their own.
//
// The browser path (elevateLiveWorker.processDueElevateRuns) only runs when an
// org admin presses "Run due now" in Master Control. This is the same sweep
// for the server: server.ts calls it every 2 minutes and from
// POST /api/cron/elevate-live-due. Every database and media call goes through
// the injected `io`, so the logic is tested without Firestore
// (tests/elevateLiveServer.test.ts) and server.ts supplies REST + server-side
// captions.
//
// Ownership: in the browser the signed-in admin owns the article, clips and
// feed post. On the server nobody is signed in, so they belong to the church's
// owner account (org.creatorId, else its first admin) and show as the church
// (authorOrgId), exactly like an admin posting "as the org".
//
// Exactly once: each run is claimed with a create-if-absent lock doc keyed on
// run id + window, so two server instances can never both process it. The
// manual button still works; it picks up only runs still SCHEDULED.

import type { Organization, StreamArchive, FastChannelSchedule } from '../types';
import {
  runElevateLivePipeline, AI_DRAFT_NOTICE,
  type ElevateLiveRun, type ElevateLiveConfig, type ServiceBriefing, type ElevateArticleBlock,
} from './elevateLiveBriefing';
import type { StreamTranscript } from './ministryRepurpose';
import type { LiveClip } from './liveClipService';
import { resolveChannelAiring, pickArchiveForWindow, type ArchiveRef } from './elevateChannelAiring';

export const ARCHIVE_BUFFER_MS = 5 * 60 * 1000;
const RUNS = 'elevateLiveRuns';
const LOCKS = 'elevateLiveRunClaims';

export interface ElevateServerIo {
  get: (path: string) => Promise<Record<string, any> | null>;
  set: (path: string, data: Record<string, unknown>) => Promise<boolean>;
  patch: (path: string, data: Record<string, unknown>) => Promise<boolean>;
  query: (collection: string, filters: { field: string; value: string | number | boolean }[], limit?: number) => Promise<Array<{ id: string; data: Record<string, any> }>>;
  /** Create only if absent: 'created' means this caller owns the work. */
  createOnce: (collection: string, id: string, data: Record<string, unknown>) => Promise<'created' | 'exists' | 'error'>;
  /** Auto-id create (feed mirror). */
  create: (collection: string, data: Record<string, unknown>) => Promise<string | null>;
  /** Audio/video URL -> timecoded captions (server.ts generateTimedCaptions). */
  captions: (audioUrl: string, title: string, speaker: string) => Promise<Array<{ time: number; text: string }>>;
  log?: (msg: string) => void;
}

const strip = (o: Record<string, any>): Record<string, any> => {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out;
};
const stripDeep = (v: any): any => {
  if (Array.isArray(v)) return v.map(stripDeep);
  if (v && typeof v === 'object') {
    const out: Record<string, any> = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined) out[k] = stripDeep(x);
    return out;
  }
  return v;
};

/** Runs whose window ended at least ARCHIVE_BUFFER_MS ago and were never started. */
export function dueRuns(rows: ElevateLiveRun[], now: number, max = 10): ElevateLiveRun[] {
  return rows
    .filter(r => (r.status === 'SCHEDULED' || r.status === 'MONITORING') && r.windowEnd + ARCHIVE_BUFFER_MS <= now)
    .sort((a, b) => a.windowEnd - b.windowEnd)
    .slice(0, max);
}

/** The account that owns what the server writes for this org. */
export function orgOwnerUid(org: Organization): string {
  return String((org as any).creatorId || ((org as any).admins || [])[0] || '');
}

async function resolveOrg(io: ElevateServerIo, run: ElevateLiveRun): Promise<Organization | null> {
  if (run.orgId) {
    const d = await io.get(`organizations/${run.orgId}`);
    if (d) return { ...d, id: run.orgId } as Organization;
  }
  if (!run.orgName) return null;
  const hits = await io.query('organizations', [{ field: 'name', value: run.orgName }], 2);
  return hits.length === 1 ? ({ ...hits[0].data, id: hits[0].id } as Organization) : null;
}

async function findArchive(io: ElevateServerIo, run: ElevateLiveRun, ownerIds: string[]): Promise<ArchiveRef | null> {
  const ids = [...new Set(ownerIds.filter(Boolean))];
  const rows: ArchiveRef[] = [];
  for (const ownerId of ids) {
    for (const r of await io.query('stream_archives', [{ field: 'ownerId', value: ownerId }], 200)) rows.push({ ...r.data, id: r.id } as ArchiveRef);
  }
  return pickArchiveForWindow(rows, run, ids);
}

function serverMedia(io: ElevateServerIo, org: Organization, owner: string) {
  return {
    transcribe: async (url: string, title: string, speaker: string): Promise<StreamTranscript> => {
      const caps = await io.captions(url, title, speaker);
      const segments = caps.filter(c => c && typeof c.text === 'string').map(c => ({ time: Number(c.time) || 0, text: String(c.text) }));
      return { text: segments.map(s => s.text).join(' ').replace(/\s+/g, ' ').trim(), segments };
    },
    createClip: async (input: { archive?: StreamArchive; startSec: number; endSec: number; title?: string }): Promise<LiveClip | null> => {
      const src = input.archive as any;
      if (!src) return null;
      const id = `clip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const clip = strip({
        id, archiveId: src.id,
        sourcePlaybackId: src.muxPlaybackId, sourceAssetId: src.muxAssetId,
        sourceTitle: src.title || 'Service', sourceOwnerId: src.ownerId || owner, sourceOwnerName: src.ownerName || org.name,
        startSec: input.startSec, endSec: input.endSec,
        durationSec: Math.round((input.endSec - input.startSec) * 10) / 10,
        title: (input.title || '').trim() || `${src.title || 'Service'} — clip`,
        clippedBy: owner, clippedByName: org.name,
        createdAt: Date.now(), encodeStatus: 'VIRTUAL',
      }) as LiveClip;
      return (await io.set(`live_clips/${id}`, clip as any)) ? clip : null;
    },
    publishClip: async (clip: LiveClip): Promise<string | null> => {
      const videoId = `video_${clip.id}`;
      const playback = clip.clipPlaybackId || clip.sourcePlaybackId;
      const ok = await io.set(`videos/${videoId}`, strip({
        id: videoId, ownerId: owner,
        title: (clip.title || 'Clip').slice(0, 180),
        description: `Clipped from “${clip.sourceTitle}” by ${clip.sourceOwnerName}`,
        url: playback ? `https://stream.mux.com/${playback}.m3u8` : '',
        muxPlaybackId: playback, muxAssetId: clip.clipAssetId || clip.sourceAssetId,
        thumbnailUrl: playback ? `https://image.mux.com/${playback}/thumbnail.jpg?time=${Math.floor(clip.startSec || 0)}` : '',
        artist: org.name, genre: 'Live', duration: clip.durationSec,
        isRello: true, isPrivate: false, likesCount: 0, commentsCount: 0, timestamp: Date.now(),
        tags: ['clip', 'live'], remixStartSec: clip.startSec, remixEndSec: clip.endSec,
        provenance: strip({ originVideoId: clip.archiveId || clip.streamId, originOwnerId: clip.sourceOwnerId, stampedAt: Date.now() }),
      }));
      if (!ok) return null;
      await io.patch(`live_clips/${clip.id}`, { videoId });
      return videoId;
    },
  };
}

function serverSavers(io: ElevateServerIo, owner: string) {
  return {
    saveBriefing: async (b: ServiceBriefing) => { await io.set(`elevateBriefings/${b.id}`, stripDeep({ ...b, briefingMarkdown: undefined })); },
    saveArticle: async (org: Organization, title: string, blocks: ElevateArticleBlock[], tags: string[]) => {
      const id = `elevate_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const ok = await io.set(`articles/${id}`, stripDeep({
        id, authorId: owner, authorName: org.name, authorPhoto: (org as any).logoUrl || '',
        title, subtitle: '', blocks,
        content: blocks.filter(b => b.type === 'TEXT' || b.type === 'HEADING').map(b => b.content).join('\n\n'),
        tags, category: 'Sermon', isPublic: false, likesCount: 0, commentsCount: 0, timestamp: Date.now(),
      }));
      return ok ? id : null;
    },
    saveJob: async (job: Record<string, any>) => { await io.set(`contentRepurposeJobs/${job.id}`, stripDeep(job)); },
    publishBriefing: async (org: Organization, b: ServiceBriefing, blocks: ElevateArticleBlock[]) => {
      // Deterministic id: a retry can never post the same briefing twice.
      const postId = `elevate_${b.runId}`;
      if (await io.get(`posts/${postId}`)) return postId;
      const text = `${b.title}\n\n${b.summary}\n\n— ${AI_DRAFT_NOTICE}`;
      const editableUids = [...new Set([(org as any).creatorId, ...((org as any).admins || [])].filter(Boolean))];
      const ok = await io.set(`posts/${postId}`, stripDeep({
        text, authorId: owner, authorName: org.name, authorPhoto: (org as any).logoUrl || '',
        authorIsOrg: true, authorOrgId: org.id, isPublic: true,
        tags: ['elevate-briefing', 'sermon', `church:${org.id}`],
        documentKind: 'ELEVATE_BRIEFING', briefingId: b.id, articleId: b.articleId,
        aiDraft: true, draftNotice: AI_DRAFT_NOTICE, editableUids,
        telaDocument: {
          format: 'TELA_DOCUMENT', version: 1, title: b.title, orgName: b.orgName, serviceDate: b.serviceDate,
          caveat: AI_DRAFT_NOTICE, blocks, keyPoints: b.keyPoints, scriptureIndex: b.scriptureIndex,
          biblicalFigures: b.biblicalFigures, announcements: b.announcements, highlights: b.highlights,
          stills: b.stills, clipIds: b.clipIds, clipVideoIds: b.clipVideoIds,
        },
        likesCount: 0, commentsCount: 0, timestamp: Date.now(), targetUserId: null, targetUserName: null,
      }));
      if (!ok) return null;
      await io.create('feed', {
        authorId: owner, authorName: org.name, authorPhoto: (org as any).logoUrl || '',
        authorIsOrg: true, authorOrgId: org.id, type: 'NEWS', content: text,
        timestamp: Date.now(), likesCount: 0, commentCount: 0, shareCount: 0, originalPostId: postId,
      }).catch(() => null);
      return postId;
    },
  };
}

/** Process one claimed run end-to-end. Throws an error code on failure. */
async function processRun(io: ElevateServerIo, run: ElevateLiveRun): Promise<Record<string, unknown>> {
  const org = await resolveOrg(io, run);
  if (!org) throw new Error('org-unresolved');
  const owner = orgOwnerUid(org);
  if (!owner) throw new Error('org-owner-unknown');

  let archive: StreamArchive;
  let mediaUrl: string;
  if (run.sourceKind === 'FAST_CHANNEL') {
    const aired = await resolveChannelAiring<StreamArchive>(run, org as any, {
      fetchSchedule: async uid => (await io.get(`fast_channel_schedules/${uid}`)) as FastChannelSchedule | null,
      findArchive: ids => findArchive(io, run, ids),
    });
    archive = aired.archive;
    mediaUrl = aired.mediaUrl;
  } else {
    const a = await findArchive(io, run, [org.id, run.channelOwnerId || '']);
    if (!a) throw new Error('archive-not-found');
    if (!a.muxPlaybackId) throw new Error('archive-no-playback-id');
    archive = a as unknown as StreamArchive;
    mediaUrl = `https://stream.mux.com/${a.muxPlaybackId}.m3u8`;
  }

  const cfg = (await io.get(`elevateLiveConfigs/${org.id}`)) as ElevateLiveConfig | null;
  const result = await runElevateLivePipeline(
    {
      run, org, archive, mediaUrl,
      outputs: cfg?.outputs || { article: true, briefing: true, clips: true, bookChapter: false },
      autoPublishBriefing: cfg?.autoPublishBriefing !== false,
    },
    serverSavers(io, owner) as any,
    serverMedia(io, org, owner) as any,
  );
  return strip({
    status: 'READY', processedAt: Date.now(), processedBy: 'server',
    briefingId: result.briefing.id, jobId: result.jobId, archiveId: (archive as any).id,
    ...(run.requiresOrgResolution ? { orgId: org.id } : {}),
  });
}

let sweeping = false;

/** One sweep: claim every due run and process it. Safe to call often. */
export async function processDueElevateRunsServer(io: ElevateServerIo, now = Date.now()): Promise<{ processed: string[]; errors: Array<{ runId: string; error: string }>; skipped: number }> {
  const processed: string[] = [];
  const errors: Array<{ runId: string; error: string }> = [];
  let skipped = 0;
  if (sweeping) return { processed, errors, skipped };
  sweeping = true;
  try {
    const rows: ElevateLiveRun[] = [];
    for (const status of ['SCHEDULED', 'MONITORING']) {
      for (const r of await io.query(RUNS, [{ field: 'status', value: status }], 100)) rows.push({ ...(r.data as ElevateLiveRun), id: r.id });
    }
    for (const run of dueRuns(rows, now)) {
      const claim = await io.createOnce(LOCKS, `${run.id}_${run.windowEnd}`, { runId: run.id, windowEnd: run.windowEnd, claimedAt: Date.now() });
      if (claim !== 'created') { skipped++; continue; }
      await io.patch(`${RUNS}/${run.id}`, { status: 'PROCESSING' });
      try {
        await io.patch(`${RUNS}/${run.id}`, await processRun(io, run));
        processed.push(run.id);
        io.log?.(`[elevate-live] ${run.id} READY`);
      } catch (e: any) {
        const error = String(e?.message || e || 'unknown').slice(0, 300);
        errors.push({ runId: run.id, error });
        await io.patch(`${RUNS}/${run.id}`, { status: 'ERROR', error, processedBy: 'server' }).catch(() => false);
        io.log?.(`[elevate-live] ${run.id} ERROR ${error}`);
      }
    }
  } finally {
    sweeping = false;
  }
  return { processed, errors, skipped };
}
