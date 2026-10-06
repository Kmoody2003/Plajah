/**
 * forYouRanker — PURE "For You" ordering + explanation for the social feed. No Firebase, no React.
 *
 * rankForYou(items, viewerContext, now, opts) → RankedItem[] (best first, diversified, explainable).
 *
 * Score per item (all components 0..1, then × feed-preference multiplier):
 *
 *   warm viewer :  0.38·recency + 0.22·engagement + 0.40·affinity
 *   cold start  :  0.50·engagement + 0.50·recency            (viewer follows nobody / no signals)
 *
 *   recency     = 0.5^(ageHours / 18)
 *   engagement  = s/(s+ref) where s = feedScoreEngine score (stored `score`, else computeFeedScore from the
 *                 item's interactions, else synthesised from likes/comments) and ref = batch p75
 *   affinity    = followed .60 / own .60 / shared club .30 / song-chat .25 / author dwell+like history ≤ .30
 *                 / interest overlap ≤ .30   (capped at 1)
 *
 * DIVERSITY pass (after scoring): max `maxConsecutiveSameAuthor` (2) in a row, max
 * `maxConsecutiveSameType` (3) of one media type in a row (lookahead window, relaxed only when it
 * cannot be met), and ~`explorationRate` (15%) of slots reserved for good-quality posts from authors the
 * viewer does NOT follow (never the first slot). If the remaining pool can only offer one author the
 * run limit is unavoidable and the items are still emitted (we never drop content to satisfy it).
 *
 * Time is injected (`now`) so results are deterministic. feedScoreEngine reads Date.now() internally, so
 * we shift `createdAt` to preserve the age relative to `now`.
 */

import {
  computeFeedScore, DEEP_VALUES, MEDIUM_VALUES,
  type PostInteractions, type CreatorSignals,
} from './feedScoreEngine';
import {
  applyFeedPreferences, preferenceMultiplier, primaryContentType, postTopics,
  type FeedPreferences, type FeedContentType, type PrefPostLike,
} from './feedPreferencesCore';

export interface RankableItem extends PrefPostLike {
  id: string;
  authorId: string;
  authorName?: string;
  timestamp: number;             // ms
  likesCount?: number;
  commentsCount?: number;
  /** Stored engagement score (`feed` docs). When present it is used as-is. */
  score?: number;
  interactions?: { deep?: Record<string, number>; medium?: Record<string, number>; base?: Record<string, number>; dmSharerIds?: string[] };
  creatorSignals?: CreatorSignals;
  clubId?: string;
  isPublic?: boolean;
}

export interface ForYouViewerContext {
  viewerId?: string;
  followedAuthorIds: ReadonlySet<string>;
  sharedClubAuthorIds?: ReadonlySet<string>;
  sharedSongChatAuthorIds?: ReadonlySet<string>;
  /** Lower-case topics/hashtags the viewer likes (profile interests, recent likes, listens). */
  interests?: readonly string[];
  /** authorId → 0..1 from past dwell/likes on that author (see hooks/useFeedScoring dwell tracker). */
  authorAffinity?: Readonly<Record<string, number>>;
  /** authorId → club name, to produce 'Popular in <club>' explanations. */
  clubNameByAuthor?: Readonly<Record<string, string>>;
  hiddenUids?: ReadonlySet<string>;
  prefs?: FeedPreferences | null;
}

export interface RankOptions {
  explorationRate?: number;            // default 0.15
  maxConsecutiveSameAuthor?: number;   // default 2
  maxConsecutiveSameType?: number;     // default 3
  lookahead?: number;                  // candidates inspected per slot, default 15
  recencyHalfLifeHours?: number;       // default 18
  minExploreEngagement?: number;       // likes + 2·comments to count as "good quality", default 3
  limit?: number;                      // cap output length
}

export type RankReason = 'OWN' | 'FOLLOWING' | 'CLUB' | 'SONG_CHAT' | 'AFFINITY' | 'INTEREST' | 'EXPLORE' | 'TRENDING' | 'RECENT';

export interface RankedItem<T> {
  item: T;
  score: number;
  /** Human-readable, e.g. 'From someone you follow', 'Popular in Lo-fi Beats', 'Trending'. */
  why: string;
  reason: RankReason;
  /** True when this item filled an exploration slot. */
  exploration: boolean;
}

const DEFAULTS = {
  explorationRate: 0.15, maxConsecutiveSameAuthor: 2, maxConsecutiveSameType: 3,
  lookahead: 15, recencyHalfLifeHours: 18, minExploreEngagement: 3,
};

const NO_CREATOR: CreatorSignals = {
  hasPaidSanctuaryMembers: false, hasActivePitchDeck: false, hasActiveFundraiser: false,
  isNewProjectLaunch: false, isFediverseConnected: false, isVerifiedIndependent: false,
};

// ─── Engagement helpers ───────────────────────────────────────────────────────

/** Raw, age-independent engagement count (likes + 3·comments + weighted shares/deep actions). */
export function postEngagement(it: RankableItem): number {
  let e = (it.likesCount ?? 0) + 3 * (it.commentsCount ?? 0);
  const inter = it.interactions;
  if (inter) {
    for (const [k, n] of Object.entries(inter.medium ?? {})) if (k !== 'LONG_COMMENT') e += (n ?? 0) * ((MEDIUM_VALUES as Record<string, number>)[k] ?? 1);
    for (const [k, n] of Object.entries(inter.deep ?? {})) e += (n ?? 0) * ((DEEP_VALUES as Record<string, number>)[k] ?? 1);
  }
  return e;
}

/** feedScoreEngine score at `now` (see header). */
export function engineScore(it: RankableItem, now: number): number {
  if (typeof it.score === 'number' && Number.isFinite(it.score) && it.score > 0) return it.score;
  const ageMs = Math.max(0, now - it.timestamp);
  const createdAt = Date.now() - ageMs;
  const inter: PostInteractions = it.interactions
    ? {
        deep: (it.interactions.deep ?? {}) as PostInteractions['deep'],
        medium: (it.interactions.medium ?? {}) as PostInteractions['medium'],
        base: (it.interactions.base ?? {}) as PostInteractions['base'],
        dmSharerIds: it.interactions.dmSharerIds ?? [],
      }
    : {
        deep: {},
        medium: { LONG_COMMENT: it.commentsCount ?? 0 },
        base: { LIKE: it.likesCount ?? 0 },
        deepContributorIds: [], dmSharerIds: [], commentAuthorIds: [],
      };
  const s = computeFeedScore({ interactions: inter, createdAt, creatorSignals: it.creatorSignals ?? NO_CREATOR });
  return Number.isFinite(s) ? s : 0;
}

const percentile = (sorted: number[], p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0);

const titleCase = (s: string) => s.replace(/(^|[\s-])(\p{L})/gu, (_m, a, b) => a + b.toUpperCase());

// ─── Trending (also used by services/trendingService) ────────────────────────

/** Engagement velocity: engagement / (ageHours + 2)^1.3 — recent engagement outranks old volume. */
export function trendingVelocity(it: RankableItem, now: number): number {
  const ageH = Math.max(0, (now - it.timestamp) / 3_600_000);
  return postEngagement(it) / Math.pow(ageH + 2, 1.3);
}

export interface TrendingOptions { windowMs?: number; minEngagement?: number; limit?: number; hiddenUids?: ReadonlySet<string> }

/** Windowed (24h default) velocity ranking. Pure. Drops items under `minEngagement` and hidden authors. */
export function rankTrending<T extends RankableItem>(items: T[], now: number, opts: TrendingOptions = {}): T[] {
  const windowMs = opts.windowMs ?? 24 * 3_600_000;
  const minE = opts.minEngagement ?? 2;
  const seen = new Set<string>();
  return items
    .filter(i => {
      if (seen.has(i.id)) return false;
      seen.add(i.id);
      return i.timestamp > 0 && now - i.timestamp <= windowMs && i.timestamp <= now + 60_000
        && postEngagement(i) >= minE && i.isPublic !== false && !opts.hiddenUids?.has(i.authorId);
    })
    .map(i => ({ i, v: trendingVelocity(i, now) }))
    .sort((a, b) => b.v - a.v || b.i.timestamp - a.i.timestamp)
    .slice(0, opts.limit ?? 20)
    .map(x => x.i);
}

// ─── The ranker ───────────────────────────────────────────────────────────────

interface Scored<T extends RankableItem> {
  item: T; score: number; norm: number; why: string; reason: RankReason;
  type: FeedContentType; explorable: boolean;
}

export function isColdStart(ctx: ForYouViewerContext): boolean {
  return ctx.followedAuthorIds.size === 0
    && !(ctx.interests && ctx.interests.length)
    && !(ctx.authorAffinity && Object.keys(ctx.authorAffinity).length);
}

export function rankForYou<T extends RankableItem>(
  itemsIn: readonly T[],
  ctx: ForYouViewerContext,
  now: number = Date.now(),
  opts: RankOptions = {},
): RankedItem<T>[] {
  const o = { ...DEFAULTS, ...opts };
  const cold = isColdStart(ctx);

  // 1. filter: dedupe, hidden authors, malformed, hard preferences
  const seen = new Set<string>();
  let items = itemsIn.filter(i => {
    if (!i || !i.id || seen.has(i.id) || !(i.timestamp > 0)) return false;
    seen.add(i.id);
    if (i.isPublic === false && i.authorId !== ctx.viewerId) return false;
    if (ctx.hiddenUids?.has(i.authorId)) return false;
    return true;
  });
  items = applyFeedPreferences(items, ctx.prefs, { viewerId: ctx.viewerId, now });
  if (!items.length) return [];

  // 2. raw engine scores → batch reference for saturation
  const raw = items.map(i => engineScore(i, now));
  const positives = raw.filter(s => s > 0).sort((a, b) => a - b);
  const ref = Math.max(0.5, percentile(positives, 0.75));
  const interests = new Set((ctx.interests ?? []).map(s => s.toLowerCase().replace(/^#/, '')));

  // 3. score + explain
  const scored: Scored<T>[] = items.map((item, idx) => {
    const s = raw[idx];
    const norm = s / (s + ref);
    const ageH = Math.max(0, (now - item.timestamp) / 3_600_000);
    const recency = Math.pow(0.5, ageH / o.recencyHalfLifeHours);

    const own = !!ctx.viewerId && item.authorId === ctx.viewerId;
    const followed = own || ctx.followedAuthorIds.has(item.authorId);
    const inClub = !!ctx.sharedClubAuthorIds?.has(item.authorId);
    const inChat = !!ctx.sharedSongChatAuthorIds?.has(item.authorId);
    const hist = Math.min(0.3, Math.max(0, ctx.authorAffinity?.[item.authorId] ?? 0) * 0.3);
    const topics = postTopics(item);
    const hit = topics.filter(t => interests.has(t));
    const interest = Math.min(0.3, hit.length * 0.15);

    const affinity = Math.min(1, (followed ? 0.6 : 0) + (inClub ? 0.3 : 0) + (inChat ? 0.25 : 0) + hist + interest);
    const base = cold ? 0.5 * norm + 0.5 * recency : 0.38 * recency + 0.22 * norm + 0.4 * affinity;
    const score = base * preferenceMultiplier(item, ctx.prefs, now);

    // explanation, most specific first
    let reason: RankReason; let why: string;
    if (own) { reason = 'OWN'; why = 'Your post'; }
    else if (followed) { reason = 'FOLLOWING'; why = 'From someone you follow'; }
    else if (inClub) {
      reason = 'CLUB';
      const club = ctx.clubNameByAuthor?.[item.authorId];
      why = club ? (norm >= 0.4 ? `Popular in ${club}` : `From ${club}`) : 'From a club you are in';
    }
    else if (inChat) { reason = 'SONG_CHAT'; why = 'From someone you met in song chat'; }
    else if (hist >= 0.15) { reason = 'AFFINITY'; why = 'You often engage with this creator'; }
    else if (hit.length) { reason = 'INTEREST'; why = `Popular in ${titleCase(hit[0])}`; }
    else if (norm >= 0.5) { reason = 'TRENDING'; why = 'Trending'; }
    else { reason = 'RECENT'; why = cold ? 'New on Plajah' : 'Suggested for you'; }

    const good = (item.likesCount ?? 0) + 2 * (item.commentsCount ?? 0) >= o.minExploreEngagement
      || postEngagement(item) >= o.minExploreEngagement + 1;
    const explorable = !followed && !inClub && !inChat && good;
    return { item, score, norm, why, reason, type: primaryContentType(item), explorable };
  });

  // near-duplicate cross-posts (same author + identical long text): keep the best
  const byText = new Map<string, Scored<T>>();
  const keep: Scored<T>[] = [];
  for (const sc of scored) {
    const text = (sc.item.text ?? sc.item.content ?? '').trim();
    if (text.length >= 20) {
      const k = `${sc.item.authorId}|${text.toLowerCase()}`;
      const prev = byText.get(k);
      if (prev) { if (sc.score > prev.score) { keep[keep.indexOf(prev)] = sc; byText.set(k, sc); } continue; }
      byText.set(k, sc);
    }
    keep.push(sc);
  }

  const remaining = keep.sort((a, b) => b.score - a.score || b.item.timestamp - a.item.timestamp || (a.item.id < b.item.id ? -1 : 1));

  // 4. diversity pass
  const out: RankedItem<T>[] = [];
  const outMeta: { author: string; type: FeedContentType }[] = [];
  const limit = Math.min(o.limit ?? Infinity, remaining.length);
  const rate = cold ? 0 : o.explorationRate;

  const runLen = (pick: (m: { author: string; type: FeedContentType }) => boolean) => {
    let n = 0;
    for (let i = outMeta.length - 1; i >= 0 && pick(outMeta[i]); i--) n++;
    return n;
  };
  const authorOk = (c: Scored<T>) => runLen(m => m.author === c.item.authorId) < o.maxConsecutiveSameAuthor;
  const typeOk = (c: Scored<T>) => runLen(m => m.type === c.type) < o.maxConsecutiveSameType;

  const pick = (pred: (c: Scored<T>) => boolean): Scored<T> | null => {
    const passes: ((c: Scored<T>) => boolean)[] = [c => authorOk(c) && typeOk(c), authorOk];
    for (const ok of passes) {
      let seenCandidates = 0;
      for (let i = 0; i < remaining.length && seenCandidates < o.lookahead; i++) {
        const c = remaining[i];
        if (!pred(c)) continue;
        seenCandidates++;
        if (ok(c)) { remaining.splice(i, 1); return c; }
      }
    }
    return null;
  };

  while (remaining.length && out.length < limit) {
    const i = out.length;
    const exploreSlot = rate > 0 && Math.floor((i + 1) * rate) > Math.floor(i * rate);
    let exploration = false;
    let c: Scored<T> | null = null;
    if (exploreSlot) { c = pick(x => x.explorable); exploration = !!c; }
    if (!c) c = pick(() => true);
    if (!c) { c = remaining.shift()!; }           // unavoidable run (see header)
    let { why, reason } = c;
    if (exploration && c.reason === 'RECENT') { why = 'Suggested for you'; reason = 'EXPLORE'; }
    else if (exploration && c.reason !== 'TRENDING' && c.reason !== 'INTEREST') { reason = 'EXPLORE'; }
    out.push({ item: c.item, score: c.score, why, reason, exploration });
    outMeta.push({ author: c.item.authorId, type: c.type });
  }
  return out;
}

/** Convenience: ranked items without the explanations. */
export const rankForYouItems = <T extends RankableItem>(items: readonly T[], ctx: ForYouViewerContext, now?: number, opts?: RankOptions): T[] =>
  rankForYou(items, ctx, now, opts).map(r => r.item);
