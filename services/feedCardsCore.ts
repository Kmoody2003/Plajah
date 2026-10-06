/**
 * feedCardsCore — PURE types, builders and the interleaver for native cross-product feed cards.
 * No Firebase/React. services/feedCardsService.ts fetches the raw docs and calls these builders;
 * components/feed/cards renders them; tests/feedEngine.test.ts covers `interleaveCards` + builders.
 *
 * Kinds that ship (collection + rule + index verified in services/feedCardsService.ts header):
 *   LIVE_NOW, NEW_RELEASE, NEW_VIDEO, CLUB_HIGHLIGHT, LABS_DATAVIZ, HISTORY_MOMENT, EVENT_SOON,
 *   DEBATE (debates rules added), ACHIEVEMENT (opt-in `publicAchievements`), SPORTS_MOMENT (ESPN, followed teams).
 */

import { isFeedLive, type LivenessFields } from './liveFeedLiveness';
import { toMillisLoose } from './feedPaginationCore';
import { scoreText } from '../src/lib/scoreText';

export type FeedCardKind =
  | 'LIVE_NOW' | 'NEW_RELEASE' | 'NEW_VIDEO' | 'CLUB_HIGHLIGHT' | 'LABS_DATAVIZ' | 'HISTORY_MOMENT' | 'EVENT_SOON'
  | 'DEBATE' | 'ACHIEVEMENT' | 'SPORTS_MOMENT';

export const FEED_CARD_KINDS: FeedCardKind[] = [
  'LIVE_NOW', 'NEW_RELEASE', 'NEW_VIDEO', 'CLUB_HIGHLIGHT', 'LABS_DATAVIZ', 'HISTORY_MOMENT', 'EVENT_SOON',
  'DEBATE', 'ACHIEVEMENT', 'SPORTS_MOMENT',
];

export const FEED_CARD_LABELS: Record<FeedCardKind, string> = {
  LIVE_NOW: 'Live now', NEW_RELEASE: 'New music', NEW_VIDEO: 'New videos', CLUB_HIGHLIGHT: 'Club highlights',
  LABS_DATAVIZ: 'Labs data stories', HISTORY_MOMENT: 'History moments', EVENT_SOON: 'Upcoming events',
  DEBATE: 'Debates', ACHIEVEMENT: 'Friends\' achievements', SPORTS_MOMENT: 'Your teams',
};

export interface LiveNowData {
  feedId: string; streamId?: string; title: string; ownerId: string; ownerName: string; ownerPhoto: string;
  url: string; clubId?: string; clubName?: string; viaClub: boolean;
}
export interface NewReleaseData {
  albumId: string; title: string; artist: string; coverImage: string; ownerId: string;
  trackCount: number; genre?: string; subType?: string; releasedAt: number;
}
export interface NewVideoData {
  videoId: string; title: string; thumbnailUrl?: string; ownerId: string; ownerName?: string; durationSec?: number; releasedAt: number;
}
export interface ClubHighlightData {
  clubId: string; clubName: string; postId: string; authorId: string; authorName: string; authorPhoto?: string;
  text: string; imageUrl?: string; likeCount: number; commentCount: number;
}
export interface DataVizData { postId: string; authorId: string; authorName: string; authorPhoto?: string; text: string; dataViz: unknown }
export interface HistoryMomentData { uid?: string; startOffset: number }
export interface EventSoonData {
  eventId: string; title: string; ownerId: string; ownerName: string; thumbnailUrl?: string; startTime: number; price: number;
}

export interface DebateCardData {
  debateId: string; topic: string; status: 'PENDING' | 'ACTIVE' | 'ENDED' | 'JUDGED' | 'DECLINED' | string;
  challengerId: string; challengerName: string; challengerPhoto?: string;
  defenderId: string; defenderName: string; defenderPhoto?: string;
  postCount: number; supporterCount: number;
  /** ms the debate closes (ACTIVE) */ endsAt: number;
  /** a followed person is a participant */ involvesFollowed: boolean;
}
export interface AchievementCardData {
  achievementId: string; userId: string; userName: string; userPhoto?: string;
  title: string; description: string; icon?: string; color?: string; pointsValue: number; earnedAt: number;
}
export interface SportsMomentData {
  gameId: string; league: string; teamName: string;
  state: 'in' | 'post';
  statusText: string;
  home: { name: string; abbr?: string; logo?: string; score: string };
  away: { name: string; abbr?: string; logo?: string; score: string };
  /** For a final: did the followed team win/lose/tie (undefined = unknown). */
  outcome?: 'W' | 'L' | 'T';
  startTime: number;
}

export interface FeedCardDataMap {
  LIVE_NOW: LiveNowData; NEW_RELEASE: NewReleaseData; NEW_VIDEO: NewVideoData; CLUB_HIGHLIGHT: ClubHighlightData;
  LABS_DATAVIZ: DataVizData; HISTORY_MOMENT: HistoryMomentData; EVENT_SOON: EventSoonData;
  DEBATE: DebateCardData; ACHIEVEMENT: AchievementCardData; SPORTS_MOMENT: SportsMomentData;
}

/** A timeline card. `score` is 0..1 (higher = more worth showing); `timestamp` is the event time (ms). */
export type FeedCardItem = {
  [K in FeedCardKind]: {
    kind: K; id: string; timestamp: number; score: number;
    /** Who the card is about, for hidden-uid filtering. */
    authorId?: string;
    clubId?: string;
    data: FeedCardDataMap[K];
  };
}[FeedCardKind];

const HOUR = 3_600_000;
const decay = (ageMs: number, halfLifeH: number) => Math.pow(0.5, Math.max(0, ageMs) / (halfLifeH * HOUR));
const strip = (s: unknown, max = 220) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// ─── Builders (raw Firestore doc → card | null) ──────────────────────────────

export interface LiveFeedDoc extends LivenessFields {
  id: string; ownerId?: string; ownerName?: string; ownerPhoto?: string; title?: string; url?: string;
  streamId?: string; clubId?: string; isPublic?: boolean;
}

/** Live card for a followed owner's, or a joined club's, stream. null when not genuinely live. */
export function liveFeedToCard(
  f: LiveFeedDoc, now: number,
  ctx: { followingIds: ReadonlySet<string>; clubIds: ReadonlySet<string>; viewerId?: string; clubNames?: Readonly<Record<string, string>> },
): FeedCardItem | null {
  if (!f.ownerId || !isFeedLive(f, now)) return null;
  if (f.ownerId === ctx.viewerId) return null;
  const viaClub = !!f.clubId && ctx.clubIds.has(f.clubId);
  const followed = ctx.followingIds.has(f.ownerId);
  if (!followed && !viaClub) return null;
  if (f.isPublic === false && !viaClub) return null;          // private streams only surface inside their club
  const started = toMillisLoose(f.lastActiveAt) || toMillisLoose(f.timestamp) || now;
  return {
    kind: 'LIVE_NOW', id: f.id, timestamp: started, authorId: f.ownerId, clubId: f.clubId,
    score: followed ? 1 : 0.9,                                  // on-air always outranks everything else
    data: {
      feedId: f.id, streamId: f.streamId, title: strip(f.title || 'Live now', 100), ownerId: f.ownerId,
      ownerName: f.ownerName || 'Creator', ownerPhoto: f.ownerPhoto || '', url: f.url || '',
      clubId: f.clubId, clubName: f.clubId ? ctx.clubNames?.[f.clubId] : undefined, viaClub,
    },
  };
}

export interface AlbumDoc {
  id: string; ownerId?: string; title?: string; artist?: string; coverImage?: string; coverThumb?: string; tracks?: unknown[];
  createdAt?: unknown; releaseDate?: unknown; isDraft?: boolean; isPublic?: boolean; isPrivate?: boolean; isIntimateOnly?: boolean;
  isScheduled?: boolean; type?: string; subType?: string; genre?: string; oerTextbook?: boolean;
}

/** Chora releases only (type MUSIC or untyped; not drafts/private/scheduled-in-future/textbooks), ≤ 30 days old. */
export function albumToCard(a: AlbumDoc, now: number, maxAgeDays = 30): FeedCardItem | null {
  if (!a.ownerId || a.isDraft || a.isPrivate || a.isIntimateOnly || a.isPublic === false || a.oerTextbook) return null;
  if (a.type && a.type !== 'MUSIC') return null;
  if (a.subType === 'PODCAST' || a.subType === 'AUDIOBOOK') return null;
  const released = toMillisLoose(a.releaseDate) || toMillisLoose(a.createdAt);
  if (!released || released > now + 60_000) return null;     // not out yet
  if (now - released > maxAgeDays * 24 * HOUR) return null;
  const cover = a.coverThumb || a.coverImage || '';
  if (!a.title) return null;
  return {
    kind: 'NEW_RELEASE', id: a.id, timestamp: released, authorId: a.ownerId,
    score: 0.55 + 0.4 * decay(now - released, 72),
    data: {
      albumId: a.id, title: strip(a.title, 100), artist: strip(a.artist, 80), coverImage: cover, ownerId: a.ownerId,
      trackCount: Array.isArray(a.tracks) ? a.tracks.length : 0, genre: a.genre, subType: a.subType, releasedAt: released,
    },
  };
}

export interface VideoDoc {
  id: string; ownerId?: string; title?: string; thumbnailUrl?: string; coverImageUrl?: string; artist?: string;
  duration?: number; timestamp?: unknown; releaseDate?: unknown; isPrivate?: boolean; isScheduled?: boolean; isPaywalled?: boolean;
}

/** New public video from a followed creator, ≤ 14 days old. */
export function videoToCard(v: VideoDoc, now: number, maxAgeDays = 14): FeedCardItem | null {
  if (!v.ownerId || !v.title || v.isPrivate) return null;
  const released = toMillisLoose(v.releaseDate) || toMillisLoose(v.timestamp);
  if (!released || released > now + 60_000) return null;
  if (now - released > maxAgeDays * 24 * HOUR) return null;
  return {
    kind: 'NEW_VIDEO', id: v.id, timestamp: released, authorId: v.ownerId,
    score: 0.5 + 0.4 * decay(now - released, 48),
    data: {
      videoId: v.id, title: strip(v.title, 100), thumbnailUrl: v.thumbnailUrl || v.coverImageUrl, ownerId: v.ownerId,
      ownerName: v.artist, durationSec: v.duration, releasedAt: released,
    },
  };
}

export interface ClubPostDoc {
  id: string; clubId?: string; authorId?: string; authorName?: string; authorPhoto?: string; content?: string;
  attachments?: { type?: string; url?: string; thumbnailUrl?: string }[]; likes?: string[]; commentCount?: number;
  isPinned?: boolean; timestamp?: unknown; type?: string;
}

/** Highlight = recent (≤ 7d) club post worth surfacing; ranked by engagement + recency. */
export function clubPostToCard(p: ClubPostDoc, clubName: string, now: number, viewerId?: string): FeedCardItem | null {
  if (!p.clubId || !p.authorId || p.authorId === viewerId) return null;
  const ts = toMillisLoose(p.timestamp);
  if (!ts || now - ts > 7 * 24 * HOUR) return null;
  const likes = Array.isArray(p.likes) ? p.likes.length : 0;
  const comments = p.commentCount ?? 0;
  const text = strip(p.content);
  const img = p.attachments?.find(a => a.thumbnailUrl || (a.type === 'PHOTO' && a.url));
  if (!text && !img) return null;
  const eng = likes + 2 * comments + (p.isPinned ? 3 : 0);
  return {
    kind: 'CLUB_HIGHLIGHT', id: p.id, timestamp: ts, authorId: p.authorId, clubId: p.clubId,
    score: Math.min(0.9, 0.25 + 0.5 * (eng / (eng + 6)) + 0.15 * decay(now - ts, 36)),
    data: {
      clubId: p.clubId, clubName, postId: p.id, authorId: p.authorId, authorName: p.authorName || 'Member', authorPhoto: p.authorPhoto,
      text, imageUrl: img?.thumbnailUrl || img?.url, likeCount: likes, commentCount: comments,
    },
  };
}

export interface PostWithDataViz {
  id: string; authorId: string; authorName?: string; authorPhoto?: string; text?: string; timestamp: number;
  dataViz?: unknown; isPublic?: boolean; likesCount?: number; commentsCount?: number;
}

export function dataVizPostToCard(p: PostWithDataViz, now: number): FeedCardItem | null {
  if (!p.dataViz || p.isPublic === false || !(p.timestamp > 0) || now - p.timestamp > 14 * 24 * HOUR) return null;
  const eng = (p.likesCount ?? 0) + 2 * (p.commentsCount ?? 0);
  return {
    kind: 'LABS_DATAVIZ', id: p.id, timestamp: p.timestamp, authorId: p.authorId,
    score: 0.3 + 0.4 * (eng / (eng + 8)) + 0.15 * decay(now - p.timestamp, 48),
    data: { postId: p.id, authorId: p.authorId, authorName: p.authorName || 'Creator', authorPhoto: p.authorPhoto, text: strip(p.text, 160), dataViz: p.dataViz },
  };
}

export interface EventDoc {
  id: string; ownerId?: string; ownerName?: string; title?: string; thumbnailUrl?: string; startTime?: unknown; price?: number;
  status?: string; isExclusive?: boolean;
}

/** Upcoming (next 7 days) pay-per-view / live event from a followed creator. */
export function eventToCard(e: EventDoc, now: number, horizonDays = 7): FeedCardItem | null {
  if (!e.ownerId || !e.title || e.status !== 'UPCOMING') return null;
  const start = toMillisLoose(e.startTime);
  if (!start || start < now || start - now > horizonDays * 24 * HOUR) return null;
  const hoursOut = (start - now) / HOUR;
  return {
    kind: 'EVENT_SOON', id: e.id, timestamp: start, authorId: e.ownerId,
    score: 0.45 + 0.4 * Math.max(0, 1 - hoursOut / (horizonDays * 24)),
    data: { eventId: e.id, title: strip(e.title, 100), ownerId: e.ownerId, ownerName: e.ownerName || 'Creator', thumbnailUrl: e.thumbnailUrl, startTime: start, price: e.price ?? 0 },
  };
}

export interface DebateDoc {
  id: string; topic?: string; status?: string; challengerId?: string; challengerName?: string; challengerPhoto?: string;
  defenderId?: string; defenderName?: string; defenderPhoto?: string; postCount?: number; endsAt?: unknown;
  challengerSupporters?: unknown[]; defenderSupporters?: unknown[]; createdAt?: unknown; acceptedAt?: unknown;
}

/** An OPEN (ACTIVE, not yet expired) debate the viewer is not a party to. Followed participants score higher. */
export function debateToCard(
  d: DebateDoc, now: number, ctx: { followingIds?: ReadonlySet<string>; viewerId?: string } = {},
): FeedCardItem | null {
  if (!d.challengerId || !d.defenderId || d.status !== 'ACTIVE' || !d.topic) return null;
  if (d.challengerId === ctx.viewerId || d.defenderId === ctx.viewerId) return null;   // the viewer has Pulse for those
  const ends = toMillisLoose(d.endsAt);
  if (!ends || ends <= now) return null;
  const posts = Math.max(0, Number(d.postCount) || 0);
  const supporters = (Array.isArray(d.challengerSupporters) ? d.challengerSupporters.length : 0)
    + (Array.isArray(d.defenderSupporters) ? d.defenderSupporters.length : 0);
  const involvesFollowed = !!ctx.followingIds && (ctx.followingIds.has(d.challengerId) || ctx.followingIds.has(d.defenderId));
  const eng = posts * 3 + supporters * 2;
  const started = toMillisLoose(d.acceptedAt) || toMillisLoose(d.createdAt) || now;
  return {
    kind: 'DEBATE', id: d.id, timestamp: started, authorId: d.challengerId,
    score: Math.min(0.9, 0.3 + 0.35 * (eng / (eng + 12)) + (involvesFollowed ? 0.2 : 0)),
    data: {
      debateId: d.id, topic: strip(d.topic, 160), status: 'ACTIVE',
      challengerId: d.challengerId, challengerName: d.challengerName || 'Challenger', challengerPhoto: d.challengerPhoto,
      defenderId: d.defenderId, defenderName: d.defenderName || 'Defender', defenderPhoto: d.defenderPhoto,
      postCount: posts, supporterCount: supporters, endsAt: ends, involvesFollowed,
    },
  };
}

/** Filter that also hides a debate when EITHER participant is hidden (blocked/muted); `authorId` only covers one. */
export function debateParticipantsVisible(c: FeedCardItem, hidden?: ReadonlySet<string>): boolean {
  if (c.kind !== 'DEBATE' || !hidden) return true;
  return !hidden.has(c.data.challengerId) && !hidden.has(c.data.defenderId);
}

/** Shape of a `publicAchievements/{uid}_{achievementId}` doc. */
export interface PublicAchievementDoc {
  id: string; userId?: string; achievementId?: string; title?: string; description?: string; icon?: string;
  backgroundColor?: string; category?: string; pointsValue?: number; earnedAt?: unknown;
}

/** Celebratory card for something a followed person earned (≤ 14 days). `profile` comes from the author's user doc. */
export function achievementToCard(
  a: PublicAchievementDoc, now: number, profile?: { name?: string; photo?: string }, viewerId?: string, maxAgeDays = 14,
): FeedCardItem | null {
  if (!a.userId || !a.achievementId || !a.title || a.userId === viewerId) return null;
  const earned = toMillisLoose(a.earnedAt);
  if (!earned || earned > now + 5 * 60_000 || now - earned > maxAgeDays * 24 * HOUR) return null;
  const pts = Math.max(0, Number(a.pointsValue) || 0);
  return {
    kind: 'ACHIEVEMENT', id: a.id || `${a.userId}_${a.achievementId}`, timestamp: earned, authorId: a.userId,
    score: Math.min(0.85, 0.3 + 0.25 * (pts / (pts + 60)) + 0.3 * decay(now - earned, 72)),
    data: {
      achievementId: a.achievementId, userId: a.userId, userName: profile?.name || 'Someone you follow', userPhoto: profile?.photo,
      title: strip(a.title, 80), description: strip(a.description, 160), icon: a.icon, color: a.backgroundColor,
      pointsValue: pts, earnedAt: earned,
    },
  };
}

/** Keep each person's newest achievement only, newest/best first, capped. */
export function pickAchievementCards(cards: readonly FeedCardItem[], max = 3): FeedCardItem[] {
  const seen = new Set<string>();
  return [...cards].filter(c => c.kind === 'ACHIEVEMENT').sort((a, b) => b.score - a.score || b.timestamp - a.timestamp)
    .filter(c => (c.authorId && !seen.has(c.authorId)) ? (seen.add(c.authorId), true) : false).slice(0, max);
}

/** The minimal ESPN-event shape the sports card reads (works for slimmed schedule events AND raw scoreboard events). */
export interface SportsGameLike { id: string; league: string; event: any }
export interface SportsFavoriteLike { name: string; league?: string; espnId?: string; abbreviation?: string }

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();
const isFavoriteCompetitor = (c: any, f: SportsFavoriteLike) => {
  const t = c?.team;
  if (!t) return false;
  return (!!f.espnId && norm(t.id) === norm(f.espnId)) || (!!f.abbreviation && norm(t.abbreviation) === norm(f.abbreviation))
    || norm(t.displayName) === norm(f.name);
};

/**
 * "Your team is playing now" / "final score" card. null for upcoming, postponed/cancelled, finals older than 12h,
 * or games the favorite is not in. Scores go through scoreText() — ESPN scores are strings OR {value,displayValue}.
 */
export function sportsGameToCard(game: SportsGameLike, fav: SportsFavoriteLike, now: number): FeedCardItem | null {
  const comp = game.event?.competitions?.[0];
  const competitors: any[] = Array.isArray(comp?.competitors) ? comp.competitors : [];
  const mine = competitors.find(c => isFavoriteCompetitor(c, fav));
  const other = competitors.find(c => c !== mine);
  if (!mine || !other) return null;
  if (fav.league && game.league && fav.league.toUpperCase() !== game.league.toUpperCase()) return null;
  const type = comp?.status?.type ?? game.event?.status?.type ?? {};
  const state = type.state;
  if (state !== 'in' && state !== 'post') return null;
  if (/postpon|cancel|suspend|delay/i.test(`${type.name || ''} ${type.detail || ''} ${type.shortDetail || ''}`)) return null;
  const start = Date.parse(game.event?.date || comp?.date || '');
  if (!Number.isFinite(start)) return null;
  if (state === 'in' && (start > now + 5 * 60_000 || now - start > 18 * HOUR)) return null;   // stale "live"
  if (state === 'post' && (start > now || now - start > 12 * HOUR + 4 * HOUR)) return null;    // final from this half-day only
  const side = (c: any) => ({
    name: String(c.team?.displayName || c.team?.shortDisplayName || c.team?.abbreviation || 'Team'),
    abbr: c.team?.abbreviation ? String(c.team.abbreviation) : undefined,
    logo: typeof c.team?.logo === 'string' ? c.team.logo : undefined,
    score: scoreText(c.score),
  });
  const home = side(competitors.find(c => c.homeAway === 'home') ?? mine);
  const away = side(competitors.find(c => c.homeAway === 'away') ?? other);
  let outcome: SportsMomentData['outcome'];
  if (state === 'post') {
    const a = parseFloat(scoreText(mine.score)), b = parseFloat(scoreText(other.score));
    if (mine.winner === true) outcome = 'W';
    else if (other.winner === true) outcome = 'L';
    else if (Number.isFinite(a) && Number.isFinite(b)) outcome = a > b ? 'W' : a < b ? 'L' : 'T';
  }
  const live = state === 'in';
  return {
    kind: 'SPORTS_MOMENT', id: String(game.id), timestamp: live ? now : start,
    score: live ? 0.85 : 0.5 + 0.2 * decay(now - start, 6),
    data: {
      gameId: String(game.id), league: game.league, teamName: fav.name, state,
      statusText: String(type.shortDetail || type.detail || (live ? 'Live' : 'Final')),
      home, away, outcome, startTime: start,
    },
  };
}

/** One rotating history card per viewer per day (rendered by the existing HistoryMomentPulseCard). */
export function historyMomentCard(uid: string | undefined, now: number): FeedCardItem {
  const day = Math.floor(now / (24 * HOUR));
  return {
    kind: 'HISTORY_MOMENT', id: `history-${day}`, timestamp: now, score: 0.2,
    data: { uid, startOffset: day % 7 },
  };
}

// ─── Author prioritisation ────────────────────────────────────────────────────

/**
 * Which followed authors to spend the (capped) per-kind queries on. `recent` = follows newest-first (from the
 * `follows` timestamp), `given` = the caller's list in the order it was given (assumed newest-first when the
 * caller knows; otherwise arbitrary). Recent follows win, then the rest in `given` order; viewer + empties dropped.
 */
export function prioritizeAuthors(recent: readonly string[], given: readonly string[], viewerId: string | undefined, max: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of [...recent, ...given]) {
    if (!id || id === viewerId || seen.has(id)) continue;
    seen.add(id); out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

// ─── Filtering ────────────────────────────────────────────────────────────────

export function filterCards(
  cards: readonly FeedCardItem[],
  o: { hiddenUids?: ReadonlySet<string>; mutedKinds?: readonly string[]; viewerId?: string } = {},
): FeedCardItem[] {
  const seen = new Set<string>();
  return cards.filter(c => {
    const k = `${c.kind}:${c.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    if (o.mutedKinds?.includes(c.kind)) return false;
    if (c.authorId && c.authorId !== o.viewerId && o.hiddenUids?.has(c.authorId)) return false;
    if (!debateParticipantsVisible(c, o.hiddenUids)) return false;
    return true;
  });
}

// ─── Interleaving ─────────────────────────────────────────────────────────────

/** A slot the lead fills with a discovery module (people row, club to join, creators like your follows…). */
export interface DiscoveryModuleSpec {
  /** e.g. 'people' | 'clubs' | 'creators' — opaque to the interleaver; handed back to <DiscoveryModuleSlot />. */
  id: string;
  /** Show after this many posts the first time. */
  firstAfter: number;
  /** …then every N posts. */
  every: number;
  /** Max appearances per interleave call (default 3). */
  max?: number;
}

export interface InterleaveOptions<P> {
  /** Posts before the first card (default 4 → a card is never the first slot). */
  firstCardAfter?: number;
  /** Posts between cards, cycled (default [6,7,8] → "a card every ~6-8 posts"). */
  gaps?: number[];
  maxCards?: number;
  modules?: DiscoveryModuleSpec[];
  /** Minimum post count between ANY two inserts (default 2 → never adjacent). */
  minInsertGap?: number;
  getPostId?: (p: P) => string;
}

export type FeedEntry<P> =
  | { type: 'post'; key: string; post: P }
  | { type: 'card'; key: string; card: FeedCardItem }
  | { type: 'module'; key: string; module: DiscoveryModuleSpec; occurrence: number };

/**
 * Weave cards (and discovery-module slots) into a post list. Guarantees: the first entry is always a post,
 * inserts are never adjacent (≥ minInsertGap posts between them), the same card id never repeats, and card
 * kinds rotate (a kind is not repeated back-to-back while another kind has cards left). Deterministic.
 */
export function interleaveCards<P extends { id: string }>(
  posts: readonly P[], cards: readonly FeedCardItem[], opts: InterleaveOptions<P> = {},
): FeedEntry<P>[] {
  const gaps = (opts.gaps && opts.gaps.length ? opts.gaps : [6, 7, 8]).map(g => Math.max(1, Math.floor(g)));
  const minGap = Math.max(2, opts.minInsertGap ?? 2);
  const getId = opts.getPostId ?? ((p: P) => p.id);
  const maxCards = opts.maxCards ?? Infinity;

  const queues = new Map<FeedCardKind, FeedCardItem[]>();
  const seenCard = new Set<string>();
  [...cards].sort((a, b) => b.score - a.score || b.timestamp - a.timestamp).forEach(c => {
    const k = `${c.kind}:${c.id}`;
    if (seenCard.has(k)) return;
    seenCard.add(k);
    (queues.get(c.kind) ?? queues.set(c.kind, []).get(c.kind)!).push(c);
  });
  const used = new Map<FeedCardKind, number>();
  let cardsLeft = Math.min(maxCards, cards.length);
  let lastKind: FeedCardKind | null = null;
  let nextCardAt = Math.max(1, opts.firstCardAfter ?? 4);
  let gapIdx = 0;
  let lastInsertAt = -Infinity;
  const mods = (opts.modules ?? []).map(m => ({ spec: m, next: Math.max(1, m.firstAfter), count: 0, max: m.max ?? 3 }));

  const nextCard = (): FeedCardItem | null => {
    const kinds = [...queues.entries()].filter(([, q]) => q.length);
    if (!kinds.length) return null;
    const pool = kinds.length > 1 ? kinds.filter(([k]) => k !== lastKind) : kinds;
    pool.sort((a, b) => b[1][0].score - a[1][0].score || (used.get(a[0]) ?? 0) - (used.get(b[0]) ?? 0));
    const [kind, q] = pool[0];
    used.set(kind, (used.get(kind) ?? 0) + 1);
    lastKind = kind;
    return q.shift()!;
  };

  const out: FeedEntry<P>[] = [];
  posts.forEach((post, i) => {
    out.push({ type: 'post', key: `post:${getId(post)}`, post });
    const n = i + 1;
    if (n - lastInsertAt < minGap) return;
    const cardDue = cardsLeft > 0 && n >= nextCardAt && [...queues.values()].some(q => q.length);
    const modDue = mods.filter(m => n >= m.next && m.count < m.max).sort((a, b) => a.next - b.next)[0];
    if (modDue && (!cardDue || modDue.next <= nextCardAt)) {
      modDue.count++;
      out.push({ type: 'module', key: `module:${modDue.spec.id}:${modDue.count}`, module: modDue.spec, occurrence: modDue.count });
      modDue.next = n + Math.max(2, modDue.spec.every);
      lastInsertAt = n;
    } else if (cardDue) {
      const c = nextCard();
      if (c) {
        out.push({ type: 'card', key: `card:${c.kind}:${c.id}`, card: c });
        cardsLeft--;
        nextCardAt = n + gaps[gapIdx++ % gaps.length];
        lastInsertAt = n;
      }
    }
  });
  return out;
}
