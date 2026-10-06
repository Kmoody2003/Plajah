/**
 * socialServerCore — PURE decision logic behind the server-trusted social endpoints in
 * routes/socialServer.ts (achievement unlock, debate points, scheduled-post publishing).
 * No Firebase / Node-only imports, so tsx tests (tests/socialServer.test.ts) and the client can import it.
 */
import { routePostCollection, type PostCollectionName } from './privatePostsCore';
import { buildPublicAchievementDoc, isShareableAchievement, sharingEnabled, publicAchievementId, type AchievementLike } from './publicAchievementsCore';

// ── Achievements ──────────────────────────────────────────────────────────────

const ACH_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

/** Doc id for users' unlock records. Deterministic ⇒ at most one per (user, achievement). */
export const userAchievementDocId = (uid: string, achievementId: string) => `${uid}_${achievementId}`;

export type UnlockCheck = { ok: true } | { ok: false; status: number; error: string };

/**
 * May this caller self-unlock this catalog achievement? KITH_* are minted by routes/kithSightings.ts only
 * (matched on id AND on the catalog doc's triggerType), and the catalog row must exist and be active.
 */
export function checkUnlockable(achievementId: unknown, catalogDoc: Record<string, any> | null | undefined): UnlockCheck {
  if (typeof achievementId !== 'string' || !ACH_ID_RE.test(achievementId)) return { ok: false, status: 400, error: 'achievementId is required.' };
  if (/^KITH_/i.test(achievementId)) return { ok: false, status: 403, error: 'This achievement is awarded by the system.' };
  if (!catalogDoc) return { ok: false, status: 404, error: 'Unknown achievement.' };
  if (catalogDoc.isActive === false) return { ok: false, status: 404, error: 'Unknown achievement.' };
  if (typeof catalogDoc.triggerType === 'string' && /^KITH_/i.test(catalogDoc.triggerType)) return { ok: false, status: 403, error: 'This achievement is awarded by the system.' };
  return { ok: true };
}

/** Same fields the client used to write (UserAchievementProgress). */
export function buildUserAchievementDoc(uid: string, achievementId: string, now: number) {
  return { userId: uid, achievementId, unlockedAt: now, isNew: true, timestamp: now };
}

/** Public showcase copy, or null when sharing is off / private account / not shareable. */
export function planPublicAchievement(
  uid: string, achievementId: string, catalogDoc: Record<string, any>,
  profile: { shareAchievements?: boolean; isPrivate?: boolean } | null, earnedAt: number,
): { id: string; data: Record<string, string | number> } | null {
  const a: AchievementLike = { ...(catalogDoc as AchievementLike), id: achievementId };
  if (!isShareableAchievement(a) || !sharingEnabled(profile)) return null;
  return { id: publicAchievementId(uid, achievementId), data: buildPublicAchievementDoc(uid, a, earnedAt) };
}

// ── Simple fixed-window limiter (per key, in memory) ──────────────────────────

export function rateAllow(store: Map<string, { start: number; n: number }>, key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const e = store.get(key);
  if (!e || now - e.start >= windowMs) {
    store.set(key, { start: now, n: 1 });
    if (store.size > 5000) for (const [k, v] of store) { if (now - v.start >= windowMs) store.delete(k); }
    return true;
  }
  if (e.n >= max) return false;
  e.n++;
  return true;
}

// ── Debate points ─────────────────────────────────────────────────────────────

export const POINTS_DEBATE_WIN = 100;
export const POINTS_DEBATE_DRAW = 40;

export interface DebateLike {
  status?: string; endsAt?: number; challengerId?: string; defenderId?: string;
  challengerSupporters?: unknown[]; defenderSupporters?: unknown[];
  disqualified?: Array<{ uid?: string }>; verdict?: { winner?: string } | null; pointsAwarded?: boolean;
}

export type DebateAward =
  | { ok: true; winner: 'CHALLENGER' | 'DEFENDER' | 'DRAW'; awards: Array<{ uid: string; points: number }> }
  | { ok: false; status: number; error: string };

/**
 * Who gets what for a finished debate. The winner is RECOMPUTED from objective fields (disqualification log +
 * supporter counts — the same rule triggerAriaJudgment applies) instead of trusting `verdict.winner`, which is
 * client-written. The debate must be JUDGED with a verdict and past endsAt. Idempotency is the caller's
 * `pointsAwarded` claim; this only refuses when it's already set.
 */
export function computeDebateAward(debate: DebateLike | null | undefined, now: number): DebateAward {
  if (!debate) return { ok: false, status: 404, error: 'Debate not found.' };
  if (debate.status !== 'JUDGED' || !debate.verdict || !['CHALLENGER', 'DEFENDER', 'DRAW'].includes(String(debate.verdict.winner))) {
    return { ok: false, status: 409, error: 'Debate has not been judged.' };
  }
  if (typeof debate.endsAt !== 'number' || now < debate.endsAt) return { ok: false, status: 409, error: 'Debate has not ended.' };
  if (debate.pointsAwarded === true) return { ok: false, status: 409, error: 'Points already awarded.' };
  const c = debate.challengerId, d = debate.defenderId;
  if (!c || !d || c === d) return { ok: false, status: 409, error: 'Debate has no valid participants.' };

  const dq = debate.disqualified ?? [];
  const cDQ = dq.some(x => x?.uid === c), dDQ = dq.some(x => x?.uid === d);
  let winner: 'CHALLENGER' | 'DEFENDER' | 'DRAW';
  if (cDQ && !dDQ) winner = 'DEFENDER';
  else if (dDQ && !cDQ) winner = 'CHALLENGER';
  else if (cDQ && dDQ) winner = 'DRAW';
  else {
    const cv = (debate.challengerSupporters ?? []).length, dv = (debate.defenderSupporters ?? []).length;
    winner = cv > dv ? 'CHALLENGER' : cv < dv ? 'DEFENDER' : 'DRAW';
  }
  // A double-disqualification draw earns nothing (neither side behaved); a vote draw splits DRAW points.
  const awards: Array<{ uid: string; points: number }> =
    winner === 'CHALLENGER' ? [{ uid: c, points: POINTS_DEBATE_WIN }]
    : winner === 'DEFENDER' ? [{ uid: d, points: POINTS_DEBATE_WIN }]
    : (cDQ && dDQ) ? []
    : [{ uid: c, points: POINTS_DEBATE_DRAW }, { uid: d, points: POINTS_DEBATE_DRAW }];
  return { ok: true, winner, awards };
}

// ── Scheduled posts ───────────────────────────────────────────────────────────

export const MAX_PUBLISH_ATTEMPTS = 3;
export const STALE_CLAIM_MS = 5 * 60_000;
export const PUBLISH_BATCH_LIMIT = 50;

export interface ScheduledRow {
  id: string; authorId?: string; publishAt?: number; status?: string; attempts?: number; claimedAt?: number;
  post?: Record<string, any>; publishedPostId?: string;
}

/** Due + still claimable: PENDING, or a PUBLISHING claim that went stale (crashed attempt). */
export function isClaimable(r: ScheduledRow, now: number): boolean {
  if (typeof r.publishAt !== 'number' || r.publishAt > now) return false;
  if ((r.attempts ?? 0) >= MAX_PUBLISH_ATTEMPTS) return false;
  if (r.status === 'PENDING') return true;
  return r.status === 'PUBLISHING' && now - (r.claimedAt ?? 0) > STALE_CLAIM_MS;
}

/** Oldest-first, capped. */
export function selectDue(rows: ScheduledRow[], now: number, limit = PUBLISH_BATCH_LIMIT): ScheduledRow[] {
  return rows.filter(r => isClaimable(r, now)).sort((a, b) => (a.publishAt as number) - (b.publishAt as number)).slice(0, limit);
}

/** Fields written by the claim (status → PUBLISHING). Same shape the client transaction writes. */
export function claimFields(r: ScheduledRow, now: number) {
  return { status: 'PUBLISHING', claimedAt: now, attempts: (r.attempts ?? 0) + 1 };
}

/** Terminal/retry state after a failed attempt (mirrors the client: PENDING until attempts are exhausted). */
export function failureFields(attemptsAfterClaim: number, error: string) {
  return {
    status: attemptsAfterClaim >= MAX_PUBLISH_ATTEMPTS ? 'FAILED' : 'PENDING',
    lastError: String(error || 'unknown').slice(0, 300),
  };
}

/** Deterministic id of the published post (and its feed mirror) — duplicates are impossible. */
export const scheduledPostId = (scheduledId: string) => `sched_${scheduledId}`;

const STRIP_FROM_PAYLOAD = ['id', 'authorId', 'likedBy', 'likesCount', 'commentsCount', 'timestamp', 'sourceCollection', 'isPublic', 'modifiedAt'];

/** Drop null/undefined recursively (Firestore rejects undefined; createPost's removeUndefined also drops null). */
export function dropNullish(v: any): any {
  if (Array.isArray(v)) return v.map(x => (x && typeof x === 'object' ? dropNullish(x) : x)).filter(x => x !== undefined && x !== null);
  if (v && typeof v === 'object') {
    const out: Record<string, any> = {};
    for (const [k, x] of Object.entries(v)) {
      if (x === undefined || x === null) continue;
      out[k] = x && typeof x === 'object' ? dropNullish(x) : x;
    }
    return out;
  }
  return v;
}

export function eduRoleOfProfile(d: Record<string, any> | null | undefined): 'TEACHER' | 'STUDENT' | 'SCHOOL' | 'PARENT' | null {
  if (!d) return null;
  const t = d.accountType;
  if (t === 'TEACHER' || d.isTeacher || (d.teacherVerification && d.teacherVerification !== 'UNVERIFIED')) return 'TEACHER';
  if (t === 'STUDENT' || t === 'CHILD' || d.childState === 'SCHOOL_PROVISIONED' || d.provisionedByTeacherUid) return 'STUDENT';
  if (d.isSchoolAdmin) return 'SCHOOL';
  if (t === 'PARENT') return 'PARENT';
  return null;
}

const mediaFeedType = (media: any) =>
  !Array.isArray(media) || media.length === 0 ? 'NEWS' : media.some((m: any) => m?.type === 'VIDEO') ? 'VIDEO' : 'PICTURE';
const firstImageUrl = (media: any): string | undefined =>
  Array.isArray(media) ? media.find((m: any) => m?.url && m.type !== 'VIDEO' && m.type !== 'AUDIO')?.url : undefined;
const sanitizeMedia = (media: any): any[] | undefined => {
  if (!Array.isArray(media) || media.length === 0) return undefined;
  return media.map((m: any) => {
    const o: any = {};
    for (const k of ['type', 'url', 'id', 'title', 'thumbnail']) if (m?.[k] !== undefined && m?.[k] !== null) o[k] = m[k];
    if (m?.linkPreview) o.linkPreview = m.linkPreview;
    return o;
  });
};

export interface PlannedPost {
  collection: PostCollectionName;
  id: string;
  data: Record<string, any>;
  /** Public-feed mirror (only for public posts); same id as the post. */
  feed: { id: string; data: Record<string, any> } | null;
}

/**
 * Build the post exactly as the client's createPost would (field mapping, private-account routing, feed
 * mirror shape), minus follower notifications. Returns an error for payloads that must not be published.
 */
export function planScheduledPost(
  row: ScheduledRow, profile: Record<string, any> | null, now: number,
): { ok: true; plan: PlannedPost } | { ok: false; error: string } {
  const authorId = row.authorId;
  if (!authorId || typeof authorId !== 'string') return { ok: false, error: 'missing authorId' };
  const raw = row.post;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'missing post payload' };
  const payload: Record<string, any> = { ...raw };
  for (const k of STRIP_FROM_PAYLOAD) delete payload[k];
  const media = Array.isArray(payload.media) ? payload.media : [];
  const text = typeof payload.text === 'string' ? payload.text : '';
  if (!text.trim() && media.length === 0 && !payload.albumEmbed && !payload.assetEmbed) return { ok: false, error: 'empty post' };
  if (media.some((m: any) => !(m && ((typeof m.url === 'string' && /^https?:\/\//i.test(m.url)) || m.muxPlaybackId)))) {
    return { ok: false, error: 'media is not publishable' };
  }

  const collection = routePostCollection(profile, payload as { orgAudience?: string });
  const authorName = payload.authorName || profile?.displayName || 'Anonymous';
  const authorPhoto = payload.authorPhoto || profile?.photoURL || '';
  const eduRole = payload.eduRole ?? eduRoleOfProfile(profile) ?? undefined;
  const data = dropNullish({
    ...payload,
    text,
    authorId,
    authorName,
    authorPhoto,
    ...(eduRole ? { isEduPost: true, eduRole } : {}),
    likesCount: 0,
    commentsCount: 0,
    timestamp: now,
    isPublic: payload.orgAudience === 'DEPARTMENT' ? false : true,
  });
  if (JSON.stringify(data).length > 200_000) return { ok: false, error: 'payload too large' };

  const id = scheduledPostId(row.id);
  let feed: PlannedPost['feed'] = null;
  if (collection === 'posts' && payload.orgAudience !== 'DEPARTMENT') {
    const img = firstImageUrl(media);
    const fm = sanitizeMedia(media);
    feed = {
      id,
      data: dropNullish({
        authorId, authorName, authorPhoto,
        ...(payload.authorOrgId ? { authorIsOrg: true, authorOrgId: payload.authorOrgId } : {}),
        type: mediaFeedType(media),
        content: text,
        timestamp: now,
        likesCount: 0, commentCount: 0, shareCount: 0,
        ...(img ? { imageUrl: img } : {}),
        ...(fm ? { media: fm } : {}),
        originalPostId: id,
      }),
    };
  }
  return { ok: true, plan: { collection, id, data, feed } };
}
