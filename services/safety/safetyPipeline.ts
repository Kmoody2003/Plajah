/**
 * safetyPipeline — SERVER-ONLY orchestration: read a target doc → scan its media → write
 * moderation/{collection}_{id} → patch the target with server fields → open a CSAM case when required.
 * Also: the cron sweep (backstop for client writes that never called /api/safety/scan), report
 * escalation for `sexual_minor_safety`, and admin soft-remove.
 *
 * Target fields written (server only; rules cannot yet stop an author from editing them — see docs):
 *   moderationStatus, safetyLabels, scannedAt, scanStatus ('scanned' | 'unscanned'), scanAttempts
 */
import {
  combineDecisions, moderationStatusFor, escalateMinorSafetyReport, moderationVisibility,
  type SafetyContext, type SafetyDecision, type SafetySurface, type ModerationStatus,
} from './safetyPolicy';
import { scanMedia, type MediaRef, type MediaScanResult } from './mediaSafetyServer';
import { openCsamCase } from './csamCase';
import {
  fsGet, fsMerge, fsQuery, fsListPage, gcsMeta, gcsRevokeToken, storagePathFromUrl,
} from './safetyServerIo';
import { removalPaths } from '../reportTriageCore';

const MAX_MEDIA_PER_TARGET = 6;
export const MAX_SCAN_ATTEMPTS = 5;

// ── Targets ───────────────────────────────────────────────────────────────────

/** Our storage or Mux only — third-party GIFs/links are not ours to scan (and would retry forever). */
function ownMediaUrl(url: unknown): url is string {
  if (typeof url !== 'string' || !url) return false;
  if (storagePathFromUrl(url)) return true;
  try { return new URL(url).hostname === 'image.mux.com'; } catch { return false; }
}

/** Identity of a target's media set — a re-scan is needed when it changes (edited post, new avatar). */
export const mediaKey = (refs: MediaRef[]): string => refs.map(r => (r.url ? r.url.split('?')[0] : '') || r.muxPlaybackId || '').join('|').slice(0, 1500);

function postMedia(d: Record<string, any>): MediaRef[] {
  const out: MediaRef[] = [];
  for (const m of Array.isArray(d.media) ? d.media : []) {
    if (!m || typeof m !== 'object') continue;
    if (m.type === 'VIDEO' && (m.muxPlaybackId || ownMediaUrl(m.url))) {
      out.push({ kind: 'video', url: ownMediaUrl(m.url) ? m.url : null, muxPlaybackId: m.muxPlaybackId || null });
    } else if ((m.type === 'PHOTO' || m.type === 'GIF' || m.type === 'STICKER') && ownMediaUrl(m.url)) {
      out.push({ kind: 'image', url: m.url });
    }
    if (m.thumbnail && ownMediaUrl(m.thumbnail) && m.type !== 'PHOTO') out.push({ kind: 'image', url: m.thumbnail });
  }
  if (ownMediaUrl(d.imageUrl)) out.push({ kind: 'image', url: d.imageUrl });
  return out;
}

interface TargetSpec {
  surface: SafetySurface;
  owner: (d: Record<string, any>, id: string) => string | null;
  extract: (d: Record<string, any>) => MediaRef[];
  timeField?: string;
  text?: (d: Record<string, any>) => string | undefined;
  creative?: boolean;
}

export const TARGETS: Record<string, TargetSpec> = {
  posts: { surface: 'post', owner: d => d.authorId || null, extract: postMedia, timeField: 'timestamp', text: d => d.text },
  private_posts: { surface: 'post', owner: d => d.authorId || null, extract: postMedia, timeField: 'timestamp', text: d => d.text },
  videos: {
    surface: 'video', owner: d => d.ownerId || null, timeField: 'timestamp', text: d => d.title,
    extract: d => {
      const out: MediaRef[] = [];
      if (d.muxPlaybackId || ownMediaUrl(d.url)) out.push({ kind: 'video', url: ownMediaUrl(d.url) ? d.url : null, muxPlaybackId: d.muxPlaybackId || null, durationSec: Number(d.duration) || null });
      for (const k of ['thumbnailUrl', 'coverImageUrl']) if (ownMediaUrl(d[k])) out.push({ kind: 'image', url: d[k] });
      return out;
    },
  },
  albums: {
    surface: 'album_art', owner: d => d.ownerId || null, timeField: 'createdAt', creative: true, text: d => d.title,
    extract: d => ['coverImage', 'coverOriginal'].filter(k => ownMediaUrl(d[k])).slice(0, 1).map(k => ({ kind: 'image' as const, url: d[k] })),
  },
  users: {
    surface: 'avatar', owner: (_d, id) => id,
    extract: d => (ownMediaUrl(d.photoURL) ? [{ kind: 'image' as const, url: d.photoURL }] : []),
  },
};

// ── Scan one target ───────────────────────────────────────────────────────────

export interface ScanOutcome {
  ok: boolean;
  error?: string;
  moderationStatus?: ModerationStatus;
  action?: SafetyDecision['action'];
  labels?: string[];
  display?: SafetyDecision['display'];
  scanComplete?: boolean;
  userFacingRule?: string | null;
  mediaCount?: number;
}

function perMediaRecord(ref: MediaRef, r: MediaScanResult) {
  return {
    kind: ref.kind,
    storagePath: r.storagePath,
    frames: r.frames,
    action: r.decision.action,
    display: r.decision.display,
    reason: r.decision.reason,
    labels: r.decision.labels,
    providerErrors: r.signals.providerErrors || [],
    hashMatched: Array.isArray(r.signals.hashMatch) ? r.signals.hashMatch.some(h => h.matched) : false,
    gemini: r.signals.gemini ? { verdict: r.signals.gemini.verdict, isArtistic: r.signals.gemini.isArtistic, minorsPresent: r.signals.gemini.minorsPresent, realVsFictional: r.signals.gemini.realVsFictional } : null,
    geminiRefused: r.signals.geminiRefused || null,
    openai: r.signals.openai ? Object.fromEntries(Object.entries(r.signals.openai).map(([k, v]) => [k.replace(/\//g, '_'), Math.round((v as number) * 1000) / 1000])) : null,
  };
}

export async function scanTarget(collection: string, id: string, opts: { uploaderIp?: string | null; trigger: 'client' | 'sweep' | 'report' | 'admin' }): Promise<ScanOutcome> {
  const spec = TARGETS[collection];
  if (!spec) return { ok: false, error: 'unsupported_collection' };
  if (!/^[A-Za-z0-9_\-]{1,200}$/.test(id)) return { ok: false, error: 'bad_id' };
  const doc = await fsGet(`${collection}/${id}`);
  if (!doc) return { ok: false, error: 'not_found' };

  const refs = spec.extract(doc).slice(0, MAX_MEDIA_PER_TARGET);
  const ctx: SafetyContext = {
    surface: spec.surface,
    creatorLabels: Array.isArray(doc.contentLabels) ? doc.contentLabels : [],
    isCreativeWorkUpload: !!spec.creative || !!doc.isCreativeWork,
  };
  const text = spec.text?.(doc);
  const results: Array<{ ref: MediaRef; r: MediaScanResult }> = [];
  for (const ref of refs) results.push({ ref, r: await scanMedia(ref, ctx, { text }) });

  const decision = combineDecisions(results.map(x => x.r.decision));
  const now = Date.now();
  const status = moderationStatusFor(decision);
  const ownerUid = spec.owner(doc, id);

  // CSAM: quarantine + case per offending media item (before anything else is written).
  let caseIds: string[] = [];
  if (decision.action === 'csam_block_and_report') {
    for (const { ref, r } of results) {
      if (r.decision.action !== 'csam_block_and_report') continue;
      const c = await openCsamCase({ scan: r, ref, surface: spec.surface, target: { collection, id }, uploaderUid: ownerUid, uploaderIp: opts.uploaderIp ?? null });
      caseIds.push(c.caseId);
    }
  }

  // Attempts live in the server-only moderation doc (a client can write scanAttempts on its own post).
  const prior = await fsGet(`moderation/${collection}_${id}`);
  const attempts = (Number(prior?.attempts) || 0) + 1;
  await fsMerge(`moderation/${collection}_${id}`, {
    attempts,
    mediaKey: mediaKey(refs),
    targetCollection: collection,
    targetId: id,
    surface: spec.surface,
    ownerUid,
    trigger: opts.trigger,
    action: decision.action,
    display: decision.display,
    reviewQueue: decision.reviewQueue,
    reviewStatus: decision.reviewQueue === 'none' ? 'none' : 'open',
    labels: decision.labels,
    reason: decision.reason,
    scanComplete: decision.scanComplete,
    scannedAt: now,
    media: results.map(x => perMediaRecord(x.ref, x.r)),
    ...(caseIds.length ? { csamCaseIds: caseIds } : {}),
  });

  await applyTargetStatus(collection, id, doc, {
    moderationStatus: refs.length ? status : 'approved',
    safetyLabels: decision.labels,
    scannedAt: now,
    scanStatus: decision.scanComplete ? 'scanned' : 'unscanned',
    scanAttempts: attempts,
  });

  return {
    ok: true, moderationStatus: status, action: decision.action, labels: decision.labels, display: decision.display,
    scanComplete: decision.scanComplete, userFacingRule: decision.userFacingRule, mediaCount: refs.length,
  };
}

/** Patch the target (+ its `feed` mirror for posts; avatar fields for users). */
async function applyTargetStatus(collection: string, id: string, doc: Record<string, any>, f: Record<string, unknown>): Promise<void> {
  if (collection === 'users') {
    const hide = moderationVisibility(f.moderationStatus) === 'hidden';
    await fsMerge(`users/${id}`, {
      avatarModerationStatus: f.moderationStatus,
      avatarScannedUrl: doc.photoURL || null,
      avatarScannedAt: f.scannedAt,
      avatarScanStatus: f.scanStatus,
      ...(hide && doc.photoURL ? { photoURL: '', avatarHeldUrl: doc.photoURL } : {}),
    });
    return;
  }
  // Never downgrade an admin removal or a block with a later, softer automated result.
  const current = doc.moderationStatus;
  const sticky = current === 'removed' || (current === 'blocked' && f.moderationStatus !== 'blocked');
  const patch = sticky ? { scannedAt: f.scannedAt, scanStatus: f.scanStatus, scanAttempts: f.scanAttempts } : f;
  await fsMerge(`${collection}/${id}`, patch);
  if (collection === 'posts' && !sticky) {
    const mirrors = await fsQuery('feed', { where: [{ field: 'originalPostId', op: 'EQUAL', value: id }], limit: 5 });
    for (const m of mirrors) await fsMerge(m.path, { moderationStatus: f.moderationStatus, safetyLabels: f.safetyLabels });
  }
}

// ── Ad-hoc media scan (no target doc) ─────────────────────────────────────────

export async function scanLooseMedia(ref: MediaRef, surface: SafetySurface, uploaderUid: string, uploaderIp: string | null): Promise<ScanOutcome> {
  const r = await scanMedia(ref, { surface });
  let caseNote: string | undefined;
  if (r.decision.action === 'csam_block_and_report') {
    const c = await openCsamCase({ scan: r, ref, surface, target: null, uploaderUid, uploaderIp });
    caseNote = c.caseId;
  }
  const key = (r.storagePath || ref.url || '').replace(/[^A-Za-z0-9_\-]/g, '_').slice(-180);
  await fsMerge(`moderation/media_${key}`, {
    targetCollection: 'media', targetId: key, surface, ownerUid: uploaderUid, trigger: 'client',
    action: r.decision.action, display: r.decision.display, reviewQueue: r.decision.reviewQueue,
    reviewStatus: r.decision.reviewQueue === 'none' ? 'none' : 'open', labels: r.decision.labels,
    reason: r.decision.reason, scanComplete: r.decision.scanComplete, scannedAt: Date.now(),
    media: [perMediaRecord(ref, r)], ...(caseNote ? { csamCaseIds: [caseNote] } : {}),
  });
  return { ok: true, moderationStatus: moderationStatusFor(r.decision), action: r.decision.action, labels: r.decision.labels,
    display: r.decision.display, scanComplete: r.decision.scanComplete, userFacingRule: r.decision.userFacingRule, mediaCount: 1 };
}

// ── Report escalation (sexual_minor_safety) ───────────────────────────────────

const REPORT_COLLECTIONS: Record<string, string[]> = { post: ['posts', 'private_posts'], video: ['videos'], profile: ['users'], image: ['posts'] };

export async function escalateReport(reportId: string): Promise<{ ok: boolean; error?: string; hidden?: boolean }> {
  const rep = await fsGet(`content_reports/${reportId}`);
  if (!rep) return { ok: false, error: 'not_found' };
  if (rep.reason !== 'sexual_minor_safety') return { ok: true, hidden: false };
  if (rep.csamEscalatedAt) return { ok: true, hidden: !!rep.escalation?.hidden };

  const cols = REPORT_COLLECTIONS[String(rep.contentType)] || [];
  let target: { collection: string; id: string } | null = null;
  for (const c of cols) if (rep.contentId && await fsGet(`${c}/${rep.contentId}`)) { target = { collection: c, id: String(rep.contentId) }; break; }

  const sameTarget = await fsQuery('content_reports', { where: [{ field: 'contentId', op: 'EQUAL', value: rep.contentId }], limit: 200 });
  const reporters = new Set(sameTarget.filter(r => r.data.reason === 'sexual_minor_safety').map(r => r.data.reporterId).filter(Boolean));

  let scanDecision: SafetyDecision | undefined;
  if (target) {
    const out = await scanTarget(target.collection, target.id, { trigger: 'report' });
    if (out.ok && out.action) scanDecision = { action: out.action, display: out.display!, labels: (out.labels || []) as any, reason: '', userFacingRule: null, reviewQueue: out.action === 'csam_block_and_report' ? 'csam' : 'standard', scanComplete: !!out.scanComplete };
    const m = await fsGet(`moderation/${target.collection}_${target.id}`);
    if (scanDecision && m?.reviewQueue) scanDecision.reviewQueue = m.reviewQueue;
  }
  const esc = escalateMinorSafetyReport({ distinctReporters: reporters.size, scan: scanDecision });
  if (target) {
    await fsMerge(`moderation/${target.collection}_${target.id}`, { reviewQueue: 'csam', reviewStatus: 'open', escalatedByReport: reportId, escalatedAt: Date.now() });
    if (esc.hide && target.collection !== 'users') {
      const cur = await fsGet(`${target.collection}/${target.id}`);
      if (cur && moderationVisibility(cur.moderationStatus) !== 'hidden') await fsMerge(`${target.collection}/${target.id}`, { moderationStatus: 'pending_review_hidden' });
    }
  }
  await fsMerge(`content_reports/${reportId}`, { csamEscalatedAt: Date.now(), escalation: { hidden: esc.hide, queue: esc.queue, distinctReporters: reporters.size, targetFound: !!target } });
  return { ok: true, hidden: esc.hide };
}

// ── Admin soft-remove ─────────────────────────────────────────────────────────

export async function softRemove(input: { contentType: string; contentId: string; parentId?: string; removedBy: string; reason?: string }): Promise<{ ok: boolean; removed: string[] }> {
  const paths = removalPaths({ contentType: input.contentType, contentId: input.contentId, parentId: input.parentId } as any);
  const removed: string[] = [];
  const now = Date.now();
  for (const p of paths) {
    const d = await fsGet(p);
    if (!d) continue;
    // Revoke public download tokens on our-storage media (object kept as evidence; token saved for restore).
    const revoked: Record<string, string> = {};
    for (const ref of postMedia(d)) {
      const sp = ref.url ? storagePathFromUrl(ref.url) : null;
      if (!sp) continue;
      const meta = await gcsMeta(sp);
      const tok = meta?.metadata?.firebaseStorageDownloadTokens;
      if (tok && await gcsRevokeToken(sp)) revoked[sp.replace(/[.\/]/g, '_')] = tok;
    }
    await fsMerge(p, { moderationStatus: 'removed', removedAt: now, removedBy: input.removedBy, ...(input.reason ? { removedReason: input.reason.slice(0, 200) } : {}) });
    const top = p.split('/');
    if (top[0] === 'posts' && top.length === 2) {
      const mirrors = await fsQuery('feed', { where: [{ field: 'originalPostId', op: 'EQUAL', value: top[1] }], limit: 5 });
      for (const m of mirrors) await fsMerge(m.path, { moderationStatus: 'removed' });
    }
    await fsMerge(`moderation/${p.replace(/\//g, '_')}`, {
      targetPath: p, removedAt: now, removedBy: input.removedBy, reviewStatus: 'closed', action: 'removed',
      ...(Object.keys(revoked).length ? { revokedTokens: revoked } : {}),
    });
    removed.push(p);
  }
  return { ok: true, removed };
}

// ── Cron sweep ────────────────────────────────────────────────────────────────

export interface SweepSummary { scanned: number; skipped: number; errors: number; byCollection: Record<string, number>; avatars: number; escalated: number; timedOut: boolean }

export async function runSweep(opts: { hours: number; budget: number; deadline: number }): Promise<SweepSummary> {
  const s: SweepSummary = { scanned: 0, skipped: 0, errors: 0, byCollection: {}, avatars: 0, escalated: 0, timedOut: false };
  const since = Date.now() - opts.hours * 3_600_000;
  const left = () => opts.budget - s.scanned - s.avatars;
  const time = () => Date.now() < opts.deadline || ((s.timedOut = true), false);

  // 1. Open child-safety reports first — they are the most urgent.
  const reports = await fsQuery('content_reports', { where: [{ field: 'reason', op: 'EQUAL', value: 'sexual_minor_safety' }], limit: 100 });
  for (const r of reports) {
    if (!time() || left() <= 0) break;
    if (r.data.status !== 'OPEN' || r.data.csamEscalatedAt) continue;
    const out = await escalateReport(r.id);
    if (out.ok) s.escalated++; else s.errors++;
  }

  // 2. Recent content without a completed scan.
  for (const col of ['posts', 'private_posts', 'videos', 'albums']) {
    const spec = TARGETS[col];
    if (!spec.timeField) continue;
    const rows = await fsQuery(col, { where: [{ field: spec.timeField, op: 'GREATER_THAN_OR_EQUAL', value: since }], orderBy: { field: spec.timeField, direction: 'DESCENDING' }, limit: 200 });
    for (const row of rows) {
      if (!time() || left() <= 0) break;
      const d = row.data;
      if (!spec.extract(d).length) {
        if (d.scannedAt) continue;
        // Text-only: stamp it so it is not re-read every run.
        await fsMerge(`${col}/${row.id}`, { scannedAt: Date.now(), scanStatus: 'scanned', ...(d.moderationStatus ? {} : { moderationStatus: 'approved' }) });
        s.skipped++;
        continue;
      }
      // Authoritative check is the server-only moderation doc: a bypassing client can forge
      // scannedAt/scanStatus on its own post, but cannot write moderation/*.
      const m = await fsGet(`moderation/${col}_${row.id}`);
      const sameMedia = !!m && m.mediaKey === mediaKey(spec.extract(d).slice(0, MAX_MEDIA_PER_TARGET));
      if (m && sameMedia && (m.scanComplete === true || (Number(m.attempts) || 0) >= MAX_SCAN_ATTEMPTS)) continue;
      const out = await scanTarget(col, row.id, { trigger: 'sweep' });
      if (out.ok) { s.scanned++; s.byCollection[col] = (s.byCollection[col] || 0) + 1; } else s.errors++;
    }
  }

  // 3. Avatars: users have no reliable "photo changed at" field, so walk the collection with a saved cursor.
  if (time() && left() > 0) {
    const state = await fsGet('safety_sweep_state/users');
    const page = await fsListPage('users', 100, state?.pageToken || undefined);
    let finished = true;
    for (const u of page.docs) {
      if (!time() || left() <= 0) { finished = false; break; }
      if (!ownMediaUrl(u.data.photoURL) || u.data.photoURL === u.data.avatarScannedUrl) continue;
      const out = await scanTarget('users', u.id, { trigger: 'sweep' });
      if (out.ok) s.avatars++; else s.errors++;
    }
    // Only advance the cursor once the whole page was handled, so no avatar is skipped.
    if (finished) await fsMerge('safety_sweep_state/users', { pageToken: page.next || '', updatedAt: Date.now() });
  }
  return s;
}
