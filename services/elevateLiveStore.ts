// elevateLiveStore — Firestore persistence + scheduling for Elevate Live.
//
// Collections:
//   elevateLiveConfigs/{orgId}   — the org's feature toggle (per source)
//   elevateLiveRuns/{runId}      — scheduled occurrences; claimed before work
//   elevateBriefings/{briefingId}— generated Service Briefings (DRAFT)
//   contentRepurposeJobs/{jobId} — the existing synergy-engine job spine
//   articles/{id}                — the generated article (real Article shape)
//
// Claiming mirrors the repo's own scheduled-posts pattern
// (server.ts POST /api/cron/publish-due-posts): flip status first, then work,
// so two workers can never run the same window twice.

import { db, opsDb, auth } from './firebase';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, query, where, limit as qlimit } from 'firebase/firestore';
import { createPost } from './backendService';
import type { Organization } from '../types';
import { AI_DRAFT_NOTICE, type ElevateLiveConfig, type ElevateLiveRun, type ServiceBriefing, type ElevateArticleBlock } from './elevateLiveBriefing';

export const ELEVATE_CONFIGS = 'elevateLiveConfigs';
export const ELEVATE_RUNS = 'elevateLiveRuns';
export const ELEVATE_BRIEFINGS = 'elevateBriefings';
export const REPURPOSE_JOBS = 'contentRepurposeJobs';

const strip = (o: Record<string, any>): Record<string, any> => {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out;
};

// ─── Config (org turns the feature on, per source) ────────────────────────────

export async function saveElevateLiveConfig(cfg: ElevateLiveConfig): Promise<void> {
  await setDoc(doc(opsDb, ELEVATE_CONFIGS, cfg.orgId), strip({ ...cfg, updatedAt: Date.now() }));
}

export async function getElevateLiveConfig(orgId: string): Promise<ElevateLiveConfig | null> {
  const snap = await getDoc(doc(opsDb, ELEVATE_CONFIGS, orgId));
  return snap.exists() ? (snap.data() as ElevateLiveConfig) : null;
}

// ─── Runs ─────────────────────────────────────────────────────────────────────

export async function createElevateLiveRun(run: ElevateLiveRun): Promise<string> {
  await setDoc(doc(opsDb, ELEVATE_RUNS, run.id), strip({ ...run }));
  return run.id;
}

export async function updateElevateLiveRun(id: string, patch: Partial<ElevateLiveRun>): Promise<void> {
  await updateDoc(doc(opsDb, ELEVATE_RUNS, id), strip({ ...patch }));
}

/**
 * Runs whose window has ended (plus an archive buffer) and have not been
 * processed. Claims each by flipping it to PROCESSING before returning it —
 * callers must mark READY/ERROR when done.
 */
export async function claimDueElevateRuns(now = Date.now(), archiveBufferMs = 5 * 60 * 1000, max = 10, orgId?: string): Promise<ElevateLiveRun[]> {
  // When orgId is given (the Master Control panel sweep), scope the query to
  // that org — Firestore rules are per-doc org-admin, so an unscoped sweep
  // query is denied from a client session.
  const constraints: any[] = [where('status', 'in', ['SCHEDULED', 'MONITORING']), qlimit(50)];
  if (orgId) constraints.unshift(where('orgId', '==', orgId));
  const snap = await getDocs(query(collection(opsDb, ELEVATE_RUNS), ...constraints));
  const due = snap.docs
    .map(d => d.data() as ElevateLiveRun)
    .filter(r => r.windowEnd + archiveBufferMs <= now)
    .slice(0, max);
  const claimed: ElevateLiveRun[] = [];
  for (const run of due) {
    try {
      await updateDoc(doc(opsDb, ELEVATE_RUNS, run.id), { status: 'PROCESSING' });
      claimed.push({ ...run, status: 'PROCESSING' });
    } catch { /* another worker claimed it — skip */ }
  }
  return claimed;
}

// ─── Output savers (injected into runElevateLivePipeline) ─────────────────────

export async function saveElevateBriefing(b: ServiceBriefing): Promise<void> {
  await setDoc(doc(opsDb, ELEVATE_BRIEFINGS, b.id), strip({
    ...b,
    // The full timecoded transcript is the substrate for repurposing; keep it
    // on the briefing doc so "repurpose this" never re-transcribes.
    briefingMarkdown: undefined,
  }));
}

/** Save the generated article in the real Article shape (ArticleView-ready). */
export async function saveElevateArticle(org: Organization, title: string, blocks: ElevateArticleBlock[], tags: string[]): Promise<string | null> {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  const id = `elevate_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  await setDoc(doc(db, 'articles', id), strip({
    id,
    authorId: uid,
    authorName: org.name,
    authorPhoto: org.logoUrl || '',
    title,
    subtitle: '',
    blocks: blocks.map(b => strip({ ...b })),
    content: blocks.filter(b => b.type === 'TEXT' || b.type === 'HEADING').map(b => b.content).join('\n\n'),
    tags,
    category: 'Sermon',
    isPublic: false, // DRAFT — the org publishes after review
    likesCount: 0,
    commentsCount: 0,
    timestamp: Date.now(),
  }));
  return id;
}

export async function saveRepurposeJob(job: Record<string, any>): Promise<void> {
  await setDoc(doc(opsDb, REPURPOSE_JOBS, job.id), strip({ ...job }));
}

// ─── Reads for the Master Control panel ───────────────────────────────────────

export async function listElevateRunsForOrg(orgId: string, orgName: string): Promise<ElevateLiveRun[]> {
  const byId = new Map<string, ElevateLiveRun>();
  const grab = async (field: string, value: string) => {
    if (!value) return;
    const snap = await getDocs(query(collection(opsDb, ELEVATE_RUNS), where(field, '==', value), qlimit(50)));
    snap.docs.forEach(d => byId.set(d.id, d.data() as ElevateLiveRun));
  };
  await grab('orgId', orgId);
  await grab('orgName', orgName);
  return [...byId.values()].sort((a, b) => b.windowStart - a.windowStart);
}

export async function listElevateBriefingsForOrg(orgId: string): Promise<ServiceBriefing[]> {
  const snap = await getDocs(query(collection(opsDb, ELEVATE_BRIEFINGS), where('orgId', '==', orgId), qlimit(50)));
  return snap.docs.map(d => d.data() as ServiceBriefing).sort((a, b) => b.createdAt - a.createdAt);
}

export async function setElevateBriefingStatus(id: string, status: ServiceBriefing['status']): Promise<void> {
  await updateDoc(doc(opsDb, ELEVATE_BRIEFINGS, id), { status });
}

/** Publish the generated Article draft (it was saved as a private draft). */
export async function publishElevateArticle(articleId: string): Promise<void> {
  await updateDoc(doc(db, 'articles', articleId), { isPublic: true });
}

// ─── Auto-publish: briefing -> feed document post ─────────────────────────────
// One createPost call dual-writes `posts` + `feed` and handles org identity
// (authorOrgId): the post appears on the org's Elevate members surface AND in
// the public Plajah social feed. The post carries the entire document inline
// (`telaDocument`) so PostCard renders it in place — click-in is the document
// itself, not a link out. Role-holders (org creator + admins) are listed in
// editableUids: they get the in-document editor; everyone else is read-only.

export function editableUidsForOrg(org: Organization): string[] {
  const ids = [org.creatorId, ...((org as any).admins || [])].filter(Boolean) as string[];
  return [...new Set(ids)];
}

export async function publishElevateBriefing(org: Organization, b: ServiceBriefing, blocks: ElevateArticleBlock[]): Promise<string | null> {
  const postId = await createPost({
    text: `${b.title}\n\n${b.summary}\n\n— ${AI_DRAFT_NOTICE}`,
    authorOrgId: org.id,
    authorName: org.name,
    authorPhoto: org.logoUrl || '',
    isPublic: true,
    tags: ['elevate-briefing', 'sermon', `church:${org.id}`],
    documentKind: 'ELEVATE_BRIEFING',
    briefingId: b.id,
    articleId: b.articleId,
    aiDraft: true,
    draftNotice: AI_DRAFT_NOTICE,
    editableUids: editableUidsForOrg(org),
    telaDocument: {
      format: 'TELA_DOCUMENT',
      version: 1,
      title: b.title,
      orgName: b.orgName,
      serviceDate: b.serviceDate,
      caveat: AI_DRAFT_NOTICE,
      blocks,
      keyPoints: b.keyPoints,
      scriptureIndex: b.scriptureIndex,
      biblicalFigures: b.biblicalFigures,
      announcements: b.announcements,
      highlights: b.highlights,
      stills: b.stills,
      clipIds: b.clipIds,
      clipVideoIds: b.clipVideoIds,
    },
  } as any);
  return postId || null;
}

/**
 * A role-holder revised the document in-feed: update the briefing doc and
 * both post copies (posts + feed). The revision is marked so readers can see
 * the draft was revised after auto-publish.
 */
export async function updateElevateDocument(params: {
  postId: string;
  briefingId: string;
  title: string;
  summary: string;
  blocks: ElevateArticleBlock[];
}): Promise<void> {
  const revisedAt = Date.now();
  await updateDoc(doc(opsDb, ELEVATE_BRIEFINGS, params.briefingId), {
    title: params.title, summary: params.summary, revisedAt, revised: true,
  }).catch(() => undefined);
  for (const coll of ['posts', 'feed']) {
    await updateDoc(doc(db, coll, params.postId), {
      text: `${params.title}\n\n${params.summary}\n\n— ${AI_DRAFT_NOTICE}`,
      'telaDocument.title': params.title,
      'telaDocument.blocks': params.blocks,
      'telaDocument.revisedAt': revisedAt,
      revisedAt,
    }).catch(() => undefined);
  }
}

// ─── Tonight's test run — Great Faith, 2nd Live Hub channel ──────────────────
// Tue 2026-10-20, 7:00–8:05pm America/New_York (EDT, UTC-4).
// The org's Firestore orgId is NOT in the repo (it is live account data), so
// the run is created by NAME with requiresOrgResolution: the worker resolves
// orgId by matching the Organization doc whose name is "Great Faith" (and the
// channel by ordinal among that owner's Live Hub channels) before processing.
// If resolution fails the run ends ERROR 'org-unresolved' with the name kept —
// nothing is ever generated against the wrong account.

export function greatFaithTonightTestRun(): ElevateLiveRun {
  return {
    id: 'elevate_run_greatfaith_20261020_1900',
    orgId: '',
    orgName: 'Great Faith',
    requiresOrgResolution: true,
    sourceKind: 'FAST_CHANNEL',
    channelOrdinal: 2,
    windowStart: Date.parse('2026-10-20T19:00:00-04:00'),
    windowEnd: Date.parse('2026-10-20T20:05:00-04:00'),
    timezone: 'America/New_York',
    status: 'SCHEDULED',
    createdAt: Date.now(),
  };
}

/** The config doc to write for Great Faith once its orgId is resolved. */
export function greatFaithTestConfig(orgId: string): ElevateLiveConfig {
  return {
    orgId,
    orgName: 'Great Faith',
    enabled: true,
    sources: [{ kind: 'FAST_CHANNEL', channelOrdinal: 2 }],
    autoPublishBriefing: true,
    outputs: { article: true, briefing: true, clips: true, bookChapter: false },
    faithContext: true,
    updatedAt: Date.now(),
  };
}
