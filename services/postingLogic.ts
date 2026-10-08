/**
 * postingLogic — PURE helpers behind the posting/retention features (no Firebase,
 * no React) so they run under `npx tsx --test tests/posting.test.ts`.
 *
 * Contents: hashtag parse/normalise, canReply, quote snapshots, edit history,
 * draft (de)serialisation, schedule due logic, trending ranking, milestone /
 * streak math, weekly recap assembly, impression de-dupe keys, undefined-strip.
 */

// ── undefined stripping (Firestore throws on undefined) ──────────────────────

/** Deep-strip `undefined` (objects + arrays). Leaves Dates/Files/Blobs/sentinels alone. */
export function stripUndefined<T>(value: T): T {
  const walk = (v: any): any => {
    if (Array.isArray(v)) return v.filter(x => x !== undefined).map(walk);
    if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
      const out: Record<string, any> = {};
      for (const [k, x] of Object.entries(v)) if (x !== undefined) out[k] = walk(x);
      return out;
    }
    return v;
  };
  return walk(value);
}

// ── Hashtags ─────────────────────────────────────────────────────────────────

export const MAX_HASHTAG_LENGTH = 50;
export const MAX_HASHTAGS_PER_POST = 30;

const TAG_BODY = '[\\p{L}\\p{N}\\p{M}_]{1,100}';
/** `#tag` not glued to a preceding word char / & / / / # (so URL fragments and "C#" are skipped). */
const HASHTAG_RE = new RegExp(`(^|[^\\p{L}\\p{N}\\p{M}_&/#])#(${TAG_BODY})`, 'gu');
const MENTION_RE_SRC = /@\[([^\]]+)\]\(([^)]+)\)/g;
const URL_RE_SRC = /https?:\/\/[^\s<>"]+/g;

/**
 * Canonical form of a tag: NFKC, case-folded, leading # dropped, only letters /
 * numbers / marks / underscore, <= MAX_HASHTAG_LENGTH, and it must contain at
 * least one letter (so "#1" or "#2024" are not tags). Returns null if invalid.
 */
export function normalizeHashtag(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  let t = raw.normalize('NFKC').replace(/^#+/, '').toLowerCase();
  t = t.replace(/[^\p{L}\p{N}\p{M}_]/gu, '');
  if (!t) return null;
  if (t.length > MAX_HASHTAG_LENGTH) t = t.slice(0, MAX_HASHTAG_LENGTH);
  if (!/\p{L}/u.test(t)) return null;
  // Firestore doc ids may not match __.*__
  if (/^__.*__$/.test(t)) return null;
  return t;
}

export interface HashtagSpan { start: number; end: number; raw: string; tag: string }

function maskedRanges(text: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const re of [MENTION_RE_SRC, URL_RE_SRC]) {
    const r = new RegExp(re.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = r.exec(text)) !== null) out.push([m.index, m.index + m[0].length]);
  }
  return out;
}

/** Positions of every valid hashtag in `text` (skipping URLs and @[mention](uid) tokens). */
export function findHashtagSpans(text: string): HashtagSpan[] {
  if (!text || text.indexOf('#') === -1) return [];
  const masks = maskedRanges(text);
  const spans: HashtagSpan[] = [];
  const re = new RegExp(HASHTAG_RE.source, 'gu');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const start = m.index + m[1].length;
    const end = m.index + m[0].length;
    if (masks.some(([a, b]) => start >= a && start < b)) continue;
    const tag = normalizeHashtag(m[2]);
    if (!tag) continue;
    spans.push({ start, end, raw: text.slice(start, end), tag });
  }
  return spans;
}

/** Unique normalised tags in order of first appearance, capped. */
export function extractHashtags(text: string, max = MAX_HASHTAGS_PER_POST): string[] {
  const seen = new Set<string>();
  for (const s of findHashtagSpans(text)) {
    if (seen.size >= max) break;
    seen.add(s.tag);
  }
  return [...seen];
}

/** The `#partial` being typed right before `cursor`, or null (composer autocomplete). */
export function activeHashtagQuery(text: string, cursor: number): { query: string; anchor: number } | null {
  const before = text.slice(0, cursor);
  const m = before.match(/(^|[^\p{L}\p{N}\p{M}_&/#])#([\p{L}\p{N}\p{M}_]*)$/u);
  if (!m) return null;
  return { query: m[2], anchor: cursor - m[2].length - 1 };
}

// ── Reply controls ───────────────────────────────────────────────────────────

export type ReplyAudience = 'everyone' | 'following' | 'mentioned' | 'none';
export const REPLY_AUDIENCES: { id: ReplyAudience; label: string; hint: string }[] = [
  { id: 'everyone',  label: 'Everyone',          hint: 'Anyone can reply' },
  { id: 'following', label: 'People I follow',   hint: 'Only people you follow can reply' },
  { id: 'mentioned', label: 'Only people I mention', hint: 'Only people you @mention can reply' },
  { id: 'none',      label: 'Nobody',            hint: 'Replies are turned off' },
];

/** uids from `@[Name](uid)` tokens in a post body. */
export function extractMentionUids(text: string): string[] {
  const out = new Set<string>();
  const re = new RegExp(MENTION_RE_SRC.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text || '')) !== null) out.add(m[2]);
  return [...out];
}

/**
 * Can `viewerUid` reply to `post`?
 *  - the author can always reply to their own post
 *  - audience undefined/'everyone' -> any signed-in viewer
 *  - 'following' -> only people the AUTHOR follows (`authorFollowsViewer`)
 *  - 'mentioned' -> only uids in `mentionedUids` (use extractMentionUids(post.text))
 *  - 'none' -> nobody but the author
 * UI-LEVEL ONLY: firestore.rules for comments is deliberately unchanged.
 */
export function canReply(
  post: { authorId: string; replyAudience?: ReplyAudience | null },
  viewerUid: string | null | undefined,
  authorFollowsViewer: boolean,
  mentionedUids: Iterable<string> = [],
): boolean {
  if (!viewerUid) return false;
  if (post.authorId === viewerUid) return true;
  switch (post.replyAudience ?? 'everyone') {
    case 'none': return false;
    case 'following': return !!authorFollowsViewer;
    case 'mentioned': {
      for (const u of mentionedUids) if (u === viewerUid) return true;
      return false;
    }
    default: return true;
  }
}

/** Short, non-shaming explanation for a disabled reply box. */
export function replyRestrictionLabel(a: ReplyAudience | null | undefined): string {
  switch (a) {
    case 'none': return 'Replies are turned off for this post';
    case 'following': return 'Only people the author follows can reply';
    case 'mentioned': return 'Only people mentioned can reply';
    default: return '';
  }
}

// ── Quote / repost snapshot ──────────────────────────────────────────────────

export interface QuotedPostSnapshot {
  id: string;
  authorId: string;
  authorName: string;
  authorPhoto: string;
  text: string;
  mediaThumb?: string;
  mediaType?: string;
  timestamp: number;
}

export const QUOTE_TEXT_MAX = 280;

type SnapshotSource = {
  id: string; authorId: string; authorName?: string; authorPhoto?: string; text?: string; timestamp?: number;
  media?: { type?: string; url?: string; thumbnail?: string }[];
  quotedPost?: QuotedPostSnapshot;
};

/** Immutable copy of the source post embedded in the quoting post (survives source deletion). */
export function buildQuoteSnapshot(src: SnapshotSource): QuotedPostSnapshot {
  const m = src.media?.find(x => x && (x.thumbnail || x.url));
  const text = (src.text || '').trim();
  return stripUndefined({
    id: src.id,
    authorId: src.authorId,
    authorName: src.authorName || 'Someone',
    authorPhoto: src.authorPhoto || '',
    text: text.length > QUOTE_TEXT_MAX ? text.slice(0, QUOTE_TEXT_MAX - 1) + '…' : text,
    mediaThumb: m ? (m.thumbnail || (m.type === 'PHOTO' || m.type === 'GIF' ? m.url : undefined)) : undefined,
    mediaType: m?.type,
    timestamp: typeof src.timestamp === 'number' ? src.timestamp : 0,
  });
}

/** Quote-of-a-quote / repost-of-a-repost point at the ORIGINAL post, never at the wrapper. */
export function resolveQuoteTarget(src: SnapshotSource & { repostOf?: string; quotedPostId?: string }): SnapshotSource {
  if (src.repostOf && src.quotedPost) {
    return { ...src.quotedPost, id: src.repostOf, media: src.quotedPost.mediaThumb ? [{ type: src.quotedPost.mediaType, thumbnail: src.quotedPost.mediaThumb }] : undefined };
  }
  return src;
}

/** Deterministic doc id => a user can repost a given post at most once. */
export const repostDocId = (uid: string, originalId: string) => `repost_${uid}_${originalId}`;

// ── Edit history ─────────────────────────────────────────────────────────────

export interface PostRevision { text: string; editedAt: number }
export const MAX_REVISIONS = 5;

/** Append the text being replaced; keep the newest MAX_REVISIONS. */
export function pushRevision(history: PostRevision[] | undefined, previousText: string, editedAt: number, cap = MAX_REVISIONS): PostRevision[] {
  const next = [...(history || []), { text: previousText, editedAt }];
  return next.slice(-cap);
}

// ── Drafts ───────────────────────────────────────────────────────────────────

export interface DraftAttachment { type: string; url: string; title?: string; thumbnail?: string; alt?: string }
export interface DraftData {
  text: string;
  attachments: DraftAttachment[];
  contentLabels?: string[];
  replyAudience?: ReplyAudience;
  theme?: string;
  quoteOfId?: string;
  scheduledFor?: number;
}
export interface Draft extends DraftData { id: string; updatedAt: number }

export const DRAFT_SCHEMA = 1;

/** Blob/object URLs and File handles can't outlive the page, so they are dropped from drafts. */
export const isPersistableUrl = (u: string | undefined) => !!u && !u.startsWith('blob:') && !u.startsWith('data:');

export function serializeDraft(d: DraftData & { attachments: Array<DraftAttachment & { file?: unknown }> }, id: string, updatedAt: number): string {
  const clean: Draft = stripUndefined({
    id, updatedAt,
    text: d.text || '',
    attachments: (d.attachments || []).filter(a => isPersistableUrl(a.url)).map(a => ({ type: a.type, url: a.url, title: a.title, thumbnail: a.thumbnail, alt: a.alt })),
    contentLabels: d.contentLabels?.length ? d.contentLabels : undefined,
    replyAudience: d.replyAudience && d.replyAudience !== 'everyone' ? d.replyAudience : undefined,
    theme: d.theme && d.theme !== 'STANDARD' ? d.theme : undefined,
    quoteOfId: d.quoteOfId,
    scheduledFor: d.scheduledFor,
  });
  return JSON.stringify({ v: DRAFT_SCHEMA, ...clean });
}

export function parseDraft(raw: string | null | undefined): Draft | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object' || typeof o.id !== 'string') return null;
    return {
      id: o.id,
      updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : 0,
      text: typeof o.text === 'string' ? o.text : '',
      attachments: Array.isArray(o.attachments) ? o.attachments.filter((a: any) => a && typeof a.url === 'string' && typeof a.type === 'string') : [],
      contentLabels: Array.isArray(o.contentLabels) ? o.contentLabels : undefined,
      replyAudience: ['everyone', 'following', 'mentioned', 'none'].includes(o.replyAudience) ? o.replyAudience : undefined,
      theme: typeof o.theme === 'string' ? o.theme : undefined,
      quoteOfId: typeof o.quoteOfId === 'string' ? o.quoteOfId : undefined,
      scheduledFor: typeof o.scheduledFor === 'number' ? o.scheduledFor : undefined,
    };
  } catch { return null; }
}

/** A draft worth keeping/prompting for: has text or at least one persistable attachment. */
export const isDraftMeaningful = (d: Pick<DraftData, 'text' | 'attachments'>) =>
  (d.text || '').trim().length > 0 || (d.attachments || []).some(a => isPersistableUrl(a.url));

// ── Scheduled posts ──────────────────────────────────────────────────────────

export type ScheduleStatus = 'PENDING' | 'PUBLISHING' | 'PUBLISHED' | 'CANCELLED' | 'FAILED';
export interface ScheduledLike { id: string; authorId: string; publishAt: number; status: ScheduleStatus; attempts?: number }

export const MIN_SCHEDULE_LEAD_MS = 60_000;
export const MAX_SCHEDULE_AHEAD_MS = 365 * 24 * 3600_000;
export const MAX_PUBLISH_ATTEMPTS = 3;
/** A PUBLISHING claim older than this is assumed crashed and may be retried. */
export const STALE_CLAIM_MS = 5 * 60_000;

export function validateSchedule(publishAt: number, now: number): { ok: boolean; reason?: string } {
  if (!Number.isFinite(publishAt)) return { ok: false, reason: 'Pick a date and time' };
  if (publishAt < now + MIN_SCHEDULE_LEAD_MS) return { ok: false, reason: 'Pick a time at least a minute from now' };
  if (publishAt > now + MAX_SCHEDULE_AHEAD_MS) return { ok: false, reason: 'Scheduling is limited to one year ahead' };
  return { ok: true };
}

export function isDue(p: ScheduledLike, now: number): boolean {
  if ((p.attempts ?? 0) >= MAX_PUBLISH_ATTEMPTS) return false;
  return p.status === 'PENDING' && p.publishAt <= now;
}

/** Due posts, oldest first. */
export const dueScheduled = <T extends ScheduledLike>(list: T[], now: number): T[] =>
  list.filter(p => isDue(p, now)).sort((a, b) => a.publishAt - b.publishAt);

// ── Trending hashtags ────────────────────────────────────────────────────────

export interface TrendingTag { tag: string; count: number; authors: number; score: number }

/**
 * Rank tags from recent posts. Score = distinct authors * 2 + uses (one account
 * spamming a tag can't trend it alone), with newer posts weighted up to 1.5x.
 */
export function rankTrending(
  posts: { authorId: string; hashtags?: string[]; timestamp: number; isPublic?: boolean }[],
  now: number, windowHours = 24, limit = 10, minAuthors = 1,
): TrendingTag[] {
  const windowMs = windowHours * 3600_000;
  const agg = new Map<string, { count: number; authors: Set<string>; weighted: number }>();
  for (const p of posts) {
    if (p.isPublic === false || !p.hashtags?.length) continue;
    const age = now - p.timestamp;
    if (age < 0 || age > windowMs) continue;
    const w = 1 + 0.5 * (1 - age / windowMs);
    for (const t of new Set(p.hashtags)) {
      const a = agg.get(t) || { count: 0, authors: new Set<string>(), weighted: 0 };
      a.count++; a.weighted += w; a.authors.add(p.authorId);
      agg.set(t, a);
    }
  }
  return [...agg.entries()]
    .filter(([, a]) => a.authors.size >= minAuthors)
    .map(([tag, a]) => ({ tag, count: a.count, authors: a.authors.size, score: a.authors.size * 2 + a.weighted }))
    .sort((x, y) => y.score - x.score || y.count - x.count || x.tag.localeCompare(y.tag))
    .slice(0, limit);
}

// ── Streaks & milestones ─────────────────────────────────────────────────────

/** Local calendar day key YYYY-MM-DD. */
export function dayKey(ts: number, tzOffsetMin = new Date(ts).getTimezoneOffset()): string {
  const d = new Date(ts - tzOffsetMin * 60_000);
  return d.toISOString().slice(0, 10);
}
const dayIndex = (key: string) => Math.floor(Date.parse(key + 'T00:00:00Z') / 86_400_000);

export interface StreakInfo { current: number; best: number; activeToday: boolean }

/**
 * Consecutive active days. Gentle by design: a streak stays alive through
 * yesterday (you still have all of today), and only resets after a full
 * missed day. `days` = day keys on which the user was active.
 */
export function computeStreak(days: Iterable<string>, todayKey: string): StreakInfo {
  const idx = [...new Set(days)].map(dayIndex).filter(Number.isFinite).sort((a, b) => a - b);
  if (!idx.length) return { current: 0, best: 0, activeToday: false };
  let best = 1, run = 1;
  for (let i = 1; i < idx.length; i++) {
    run = idx[i] === idx[i - 1] + 1 ? run + 1 : 1;
    if (run > best) best = run;
  }
  const today = dayIndex(todayKey);
  const last = idx[idx.length - 1];
  const activeToday = last === today;
  let current = 0;
  if (last === today || last === today - 1) {
    current = 1;
    for (let i = idx.length - 1; i > 0 && idx[i] - idx[i - 1] === 1; i--) current++;
  }
  return { current, best: Math.max(best, current), activeToday };
}

/** Add today to a day list, keeping the most recent `cap` distinct days. */
export function recordActiveDay(days: string[], todayKey: string, cap = 120): string[] {
  const set = new Set(days);
  set.add(todayKey);
  return [...set].sort().slice(-cap);
}

/** Warm, no-guilt copy. */
export function streakCopy(s: StreakInfo): string {
  if (s.current <= 0) return s.best > 0 ? 'Good to see you' : 'Welcome';
  if (s.current === 1) return 'Nice start';
  if (s.current < 7) return `${s.current} days around`;
  if (s.current < 30) return `${s.current} days in a row`;
  return `${s.current} days — lovely`;
}

export type MilestoneId =
  | 'FIRST_POST' | 'FOLLOWERS_10' | 'FOLLOWERS_100' | 'FOLLOWERS_1000'
  | 'POST_LIKES_10' | 'POST_LIKES_100' | 'POST_LIKES_1000';

export interface MilestoneDef { id: MilestoneId; title: string; body: string; emoji: string }
export const MILESTONES: MilestoneDef[] = [
  { id: 'FIRST_POST',     emoji: '🌱', title: 'Your first post',      body: 'You shared your first post. Welcome in.' },
  { id: 'FOLLOWERS_10',   emoji: '🎉', title: '10 followers',         body: '10 people chose to follow along.' },
  { id: 'FOLLOWERS_100',  emoji: '🌟', title: '100 followers',        body: 'A hundred people are following your work.' },
  { id: 'FOLLOWERS_1000', emoji: '🚀', title: '1,000 followers',      body: 'A thousand followers. Thank you for building this.' },
  { id: 'POST_LIKES_10',  emoji: '💛', title: 'A post with 10 likes', body: 'One of your posts found its audience.' },
  { id: 'POST_LIKES_100', emoji: '🔥', title: 'A post with 100 likes', body: 'A post of yours really resonated.' },
  { id: 'POST_LIKES_1000', emoji: '🏆', title: 'A post with 1,000 likes', body: 'A post of yours took off.' },
];
export const milestoneDef = (id: string) => MILESTONES.find(m => m.id === id);

export interface MilestoneInputs { postCount: number; followerCount: number; topPostLikes: number }

/** Milestones reached by `s` that aren't in `achieved` yet (ordered as MILESTONES). */
export function detectMilestones(s: MilestoneInputs, achieved: Iterable<string>): MilestoneDef[] {
  const done = new Set(achieved);
  const reached: MilestoneId[] = [];
  if (s.postCount >= 1) reached.push('FIRST_POST');
  if (s.followerCount >= 10) reached.push('FOLLOWERS_10');
  if (s.followerCount >= 100) reached.push('FOLLOWERS_100');
  if (s.followerCount >= 1000) reached.push('FOLLOWERS_1000');
  if (s.topPostLikes >= 10) reached.push('POST_LIKES_10');
  if (s.topPostLikes >= 100) reached.push('POST_LIKES_100');
  if (s.topPostLikes >= 1000) reached.push('POST_LIKES_1000');
  return MILESTONES.filter(m => reached.includes(m.id) && !done.has(m.id));
}

// ── Weekly recap ─────────────────────────────────────────────────────────────

export const WEEK_MS = 7 * 86_400_000;

type RecapPost = {
  id: string; authorId: string; authorName?: string; authorPhoto?: string; text?: string; timestamp: number;
  likesCount?: number; commentsCount?: number; likedBy?: string[]; isPublic?: boolean;
};

export interface WeeklyRecap {
  since: number;
  newFollowerCount: number;
  newFollowerUids: string[];
  postCount: number;
  topPost: { id: string; text: string; likes: number; replies: number } | null;
  repliesReceived: number;
  likesReceived: number;
  missed: { postId: string; authorId: string; authorName: string; authorPhoto: string; text: string; likes: number }[];
  /** True when there is anything worth showing. */
  hasContent: boolean;
}

const engagement = (p: RecapPost) => (p.likesCount || 0) + 2 * (p.commentsCount || 0);

/** Posts from people you follow, from the window, that you haven't liked — best-engaged first, one per author. */
export function pickMissed(
  posts: RecapPost[], followingIds: Set<string>, viewerUid: string, since: number,
  hidden: { has(uid: string): boolean } = new Set<string>(), limit = 3,
): WeeklyRecap['missed'] {
  const seen = new Set<string>();
  return posts
    .filter(p => followingIds.has(p.authorId) && p.authorId !== viewerUid && !hidden.has(p.authorId)
      && p.timestamp >= since && p.isPublic !== false && !(p.likedBy || []).includes(viewerUid) && (p.text || '').trim().length > 0)
    .sort((a, b) => engagement(b) - engagement(a))
    .filter(p => (seen.has(p.authorId) ? false : (seen.add(p.authorId), true)))
    .slice(0, limit)
    .map(p => ({
      postId: p.id, authorId: p.authorId, authorName: p.authorName || 'Someone', authorPhoto: p.authorPhoto || '',
      text: (p.text || '').slice(0, 140), likes: p.likesCount || 0,
    }));
}

export function buildWeeklyRecap(input: {
  now: number;
  viewerUid: string;
  followerTimestamps: { followerId: string; at: number }[];
  ownPosts: RecapPost[];
  recentPosts: RecapPost[];
  followingIds: Set<string>;
  hidden?: { has(uid: string): boolean };
}): WeeklyRecap {
  const since = input.now - WEEK_MS;
  const fresh = input.followerTimestamps.filter(f => f.at >= since).sort((a, b) => b.at - a.at);
  const mine = input.ownPosts.filter(p => p.authorId === input.viewerUid && p.timestamp >= since);
  const top = [...mine].sort((a, b) => engagement(b) - engagement(a))[0];
  const repliesReceived = mine.reduce((n, p) => n + (p.commentsCount || 0), 0);
  const likesReceived = mine.reduce((n, p) => n + (p.likesCount || 0), 0);
  const missed = pickMissed(input.recentPosts, input.followingIds, input.viewerUid, since, input.hidden);
  const recap: WeeklyRecap = {
    since,
    newFollowerCount: fresh.length,
    newFollowerUids: fresh.slice(0, 5).map(f => f.followerId),
    postCount: mine.length,
    topPost: top && engagement(top) > 0 ? { id: top.id, text: (top.text || '').slice(0, 140), likes: top.likesCount || 0, replies: top.commentsCount || 0 } : null,
    repliesReceived, likesReceived, missed,
    hasContent: false,
  };
  recap.hasContent = recap.newFollowerCount > 0 || recap.repliesReceived > 0 || recap.likesReceived > 0 || missed.length > 0;
  return recap;
}

/** Digest is allowed at most once per 7 days. */
export const digestDue = (lastDigestAt: number | undefined | null, now: number) => !lastDigestAt || now - lastDigestAt >= WEEK_MS;

// ── Impression tracking keys ─────────────────────────────────────────────────

export interface ImpressionDedupe { seenToday: Set<string>; seenEver: Set<string> }

/**
 * Decide what a fresh view of `postId` counts as. One impression per viewer
 * per post per day; "unique viewer" only the first time ever.
 */
export function classifyImpression(postId: string, d: ImpressionDedupe): { impression: boolean; unique: boolean } {
  if (d.seenToday.has(postId)) return { impression: false, unique: false };
  return { impression: true, unique: !d.seenEver.has(postId) };
}

export const STAT_REFERRERS = ['FEED', 'PROFILE', 'SEARCH', 'HASHTAG', 'SHARE', 'OTHER'] as const;
export type StatReferrer = typeof STAT_REFERRERS[number];

export interface PostStatsDoc {
  authorId: string;
  impressions?: number;
  uniqueViewers?: number;
  dwellMs?: number;
  profileVisits?: number;
  followsFromPost?: number;
  hourly?: Record<string, number>;
  referrers?: Record<string, number>;
}

/** Engagement rate in percent (likes + replies + quotes + reposts per impression). */
export function engagementRate(stats: Pick<PostStatsDoc, 'impressions'> | null | undefined, post: { likesCount?: number; commentsCount?: number; quoteCount?: number; repostCount?: number }): number {
  const imp = stats?.impressions || 0;
  if (imp <= 0) return 0;
  const eng = (post.likesCount || 0) + (post.commentsCount || 0) + (post.quoteCount || 0) + (post.repostCount || 0);
  return Math.min(100, Math.round((eng / imp) * 1000) / 10);
}

export function topReferrer(stats: Pick<PostStatsDoc, 'referrers'> | null | undefined): { name: string; count: number } | null {
  const e = Object.entries(stats?.referrers || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  return e.length ? { name: e[0][0], count: e[0][1] } : null;
}

/** 24 hour-of-day buckets (local hour the impression happened). */
export function hourlySeries(stats: Pick<PostStatsDoc, 'hourly'> | null | undefined): number[] {
  return Array.from({ length: 24 }, (_, h) => Number((stats?.hourly || {})[String(h)] || 0));
}

// ── Composer → Post field mapping ────────────────────────────────────────────

export interface ComposerExtras {
  text: string;
  replyAudience?: ReplyAudience;
  quoteOf?: SnapshotSource;
  contentLabels?: string[];
}

/**
 * The new Post fields derived from composer output. Spread into createPost():
 * `createPost({ ...yourExistingFields, ...composerPostExtras(data) })`.
 * Already undefined-stripped.
 */
export function composerPostExtras(d: ComposerExtras): Record<string, any> {
  const tags = extractHashtags(d.text || '');
  const target = d.quoteOf ? resolveQuoteTarget(d.quoteOf as any) : undefined;
  return stripUndefined({
    hashtags: tags.length ? tags : undefined,
    replyAudience: d.replyAudience && d.replyAudience !== 'everyone' ? d.replyAudience : undefined,
    quotedPostId: target?.id,
    quotedPost: target ? buildQuoteSnapshot(target) : undefined,
  });
}

// ── Media helpers for the composer hand-off ──────────────────────────────────

/**
 * Copy composer alt text onto resolved media. `resolveComposerMedia` returns one
 * entry per attachment in order, so match by index when lengths agree.
 */
export function withAltText<M extends object>(media: M[], attachments: { alt?: string }[]): M[] {
  if (media.length !== attachments.length) return media;
  return media.map((m, i) => {
    const alt = (attachments[i]?.alt || '').trim().slice(0, 1000);
    return alt ? { ...m, alt } : m;
  });
}

export interface LinkPreviewData { url: string; title?: string; description?: string; image?: string }

/** A Post.media LINK entry for a link preview card. */
export function linkPreviewMedia(lp: LinkPreviewData) {
  return stripUndefined({
    type: 'LINK' as const,
    url: lp.url,
    title: lp.title,
    thumbnail: lp.image,
    linkPreview: stripUndefined({ url: lp.url, title: lp.title, description: lp.description, image: lp.image }),
  });
}
