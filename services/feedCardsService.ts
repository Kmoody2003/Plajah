/**
 * feedCardsService — native cards from other Plajah products, shown inline in the timeline.
 *
 *   const { cards, loading, refresh } = useFeedCards(viewer, followingIds, clubIds, {
 *     hiddenUids, mutedKinds: prefs.mutedCardKinds, viewerProfile, candidatePosts,
 *   });
 *   const entries = interleaveCards(posts, cards, { modules: [{ id: 'people', firstAfter: 9, every: 14 }] });
 *
 * Every query below was checked against services/ code, firestore.rules and firestore.indexes.json:
 *
 *  kind            source                                           why it is rule-provable / index-backed
 *  LIVE_NOW        live_feeds where status=='LIVE' (onSnapshot)      `live_feeds` read: true; single-field filter. Liveness decided by
 *                  — the discovery mirror of `streams` (see          liveFeedLiveness.isFeedLive (heartbeat), never by status alone;
 *                  liveStreamService); filtered client-side to       re-evaluated every 60s so a dead broadcaster drops out.
 *                  followed owners + joined clubs
 *  NEW_RELEASE     albums where ownerId in [≤10] orderBy createdAt   `albums` read: true; NEW composite index albums(ownerId, createdAt desc).
 *                  desc (Chora releases = type MUSIC)
 *  NEW_VIDEO       videos where ownerId in [≤10] orderBy timestamp   `videos` read: true; NEW composite index videos(ownerId, timestamp desc).
 *                  desc
 *  CLUB_HIGHLIGHT  clubPosts where clubId==X orderBy isPinned desc,  top-level `clubPosts` read: isAuthenticated; existing index
 *                  timestamp desc (≤ 6 clubs) + clubs/{id} for name  clubPosts(clubId, isPinned desc, timestamp desc).
 *  EVENT_SOON      ppv_events where ownerId in [≤10] & status==      `ppv_events` read: true; equality-only → no composite index needed;
 *                  'UPCOMING', then startTime window client-side      time window applied client-side.
 *  LABS_DATAVIZ    NOT queried: there is no safe "latest dataViz posts" query (`dataViz != null` orders by the map, not time). Instead built from
 *                  `opts.candidatePosts` (e.g. trendingService results) — the lead decides which posts to offer.
 *  HISTORY_MOMENT  no data; one card/day (components/HistoryMomentPulseCard renders it).
 *
 *  DEBATE          debates where status=='ACTIVE' orderBy postCount    `debates` read: true (rules block added by CARDS2; before that the
 *                  desc limit 12; open (endsAt>now) & viewer not a   collection had NO match → default-deny). NEW composite index
 *                  party; followed participants outrank others       debates(status, postCount desc). Max 2 cards.
 *  ACHIEVEMENT     publicAchievements where userId in [≤10] orderBy  opt-in mirror (`users/{uid}.shareAchievements !== false`), public read.
 *                  earnedAt desc limit 5 + ≤3 users/{uid} reads for  NEW composite index publicAchievements(userId, earnedAt desc).
 *                  the name/photo; one per person; max 3 cards
 *  SPORTS_MOMENT   ESPN scoreboard (site.api.espn.com, same source as   no Firestore. Only when profile.favoriteSportsTeams resolves to
 *                  followedTeamSchedule) for the viewer's favourite     teams; ≤3 leagues; 2-min module cache; any failure → no card.
 *                  teams: live or final ≤ ~16h; max 2 cards             Scores coerced with scoreText() (ESPN scores can be objects).
 *
 * Author priority: at most MAX_AUTHORS (40) followed ids are queried for releases/videos/events/achievements (4 `in`
 * chunks) to bound reads. Which 40: the viewer's MOST RECENT follows first (`follows` ordered by timestamp desc —
 * composite index follows(followerId, timestamp desc); follows that lack a timestamp fall back to the caller's order),
 * then the rest in the order `followingIds` was given. So pass `followingIds` newest-first when you know it.
 * Hidden uids, muted kinds and the child-safety filter (contentSafety.filterForViewer) are honoured.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, query, where, orderBy, limit, getDocs, getDoc, doc } from 'firebase/firestore';
import { db } from './firebase';
import { onSnapshot } from './safeSnapshot';
import { filterForViewer } from './contentSafety';
import type { UserProfile } from '../types';
import { chunk, IN_QUERY_LIMIT } from './feedPaginationCore';
import {
  liveFeedToCard, albumToCard, videoToCard, clubPostToCard, eventToCard, dataVizPostToCard, historyMomentCard, filterCards,
  debateToCard, achievementToCard, pickAchievementCards, sportsGameToCard, prioritizeAuthors,
  type FeedCardItem, type LiveFeedDoc, type AlbumDoc, type VideoDoc, type ClubPostDoc, type EventDoc, type PostWithDataViz,
  type DebateDoc, type PublicAchievementDoc,
} from './feedCardsCore';
import { loadFollowedTeams, type FollowedGame, type FollowedTeam } from './sportsPersonalization';
import { scheduleUrls, parseFollowedSchedule } from './followedTeamSchedule';

export * from './feedCardsCore';

const MAX_AUTHORS = 40;
const MAX_CLUBS = 6;
const REFRESH_MS = 5 * 60_000;
const LIVE_TICK_MS = 60_000;

export interface UseFeedCardsOptions {
  hiddenUids?: ReadonlySet<string>;
  /** FeedPreferences.mutedCardKinds */
  mutedKinds?: readonly string[];
  /** For the child-safety filter on albums/videos. */
  viewerProfile?: UserProfile | null;
  /** Posts to mine for LABS_DATAVIZ cards (e.g. trendingService output). Omit = no dataviz cards. */
  candidatePosts?: readonly PostWithDataViz[];
  enabled?: boolean;
}

type Raw<T> = T & { id: string };
const docs = <T,>(snap: { docs: { id: string; data: () => any }[] }): Raw<T>[] => snap.docs.map(d => ({ id: d.id, ...d.data() }) as Raw<T>);

async function safe<T>(label: string, p: Promise<T>, fallback: T): Promise<T> {
  try { return await p; } catch (e) { console.warn(`[feedCards] ${label} failed:`, (e as Error)?.message?.slice(0, 160)); return fallback; }
}

// ─── Recent follows (author priority) ─────────────────────────────────────────

/** The viewer's follows, newest first. Docs without a `timestamp` are excluded by orderBy — callers merge. */
export async function fetchRecentFollowingIds(uid: string, max = MAX_AUTHORS): Promise<string[]> {
  return safe('recentFollows', getDocs(query(collection(db, 'follows'), where('followerId', '==', uid), orderBy('timestamp', 'desc'), limit(max)))
    .then(s => s.docs.map(d => d.data().followingId).filter((x): x is string => typeof x === 'string')), [] as string[]);
}

// ─── SPORTS_MOMENT (ESPN, favourite teams only) ───────────────────────────────

const SPORTS_TTL_MS = 2 * 60_000;
const SPORTS_MAX_LEAGUES = 3;
const sportsCache = new Map<string, { at: number; games: FollowedGame[] }>();

const ymd = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

/** Yesterday → tomorrow scoreboard (covers live + last night's finals across time zones), small page. */
export function sportsScoreboardUrls(league: string, now: number): string[] {
  const from = ymd(new Date(now - 24 * 3_600_000)), to = ymd(new Date(now + 24 * 3_600_000));
  return scheduleUrls(league, new Date(now)).map(u => u.replace(/dates=[^&]+/, `dates=${from}-${to}`).replace(/limit=\d+/, 'limit=200'));
}

async function fetchLeagueGames(league: string, now: number): Promise<FollowedGame[]> {
  const hit = sportsCache.get(league);
  if (hit && now - hit.at < SPORTS_TTL_MS) return hit.games;
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), 6000) : null;
  try {
    const parts = await Promise.allSettled(sportsScoreboardUrls(league, now).map(async url => {
      const r = await fetch(url, { signal: ctl?.signal });
      if (!r.ok) throw new Error('scoreboard unavailable');
      return parseFollowedSchedule(await r.json(), league, url, now);
    }));
    const games = parts.flatMap(p => (p.status === 'fulfilled' ? p.value : []));
    sportsCache.set(league, { at: now, games });
    return games;
  } catch { return hit?.games ?? []; }
  finally { if (timer) clearTimeout(timer); }
}

/** ≤ 2 "your team is playing / final" cards. Empty (never throws) when the viewer has no resolvable favourites or ESPN is down. */
export async function fetchSportsCards(viewerId: string | undefined, profile: UserProfile | null | undefined, now: number): Promise<FeedCardItem[]> {
  try {
    if (!profile?.favoriteSportsTeams?.length && typeof localStorage === 'undefined') return [];
    const storage = typeof localStorage !== 'undefined' ? localStorage : { getItem: () => null };
    const favs: FollowedTeam[] = loadFollowedTeams(storage, viewerId, profile?.favoriteSportsTeams);
    if (!favs.length) return [];
    const leagues = [...new Set(favs.map(f => f.league))].filter(Boolean).slice(0, SPORTS_MAX_LEAGUES);
    const games = (await Promise.all(leagues.map(l => fetchLeagueGames(l, now)))).flat();
    const cards = favs.flatMap(f => games.map(g => sportsGameToCard(g, f, now))).filter((c): c is FeedCardItem => !!c);
    const seen = new Set<string>();
    return cards.sort((a, b) => b.score - a.score).filter(c => !seen.has(c.id) && !!seen.add(c.id)).slice(0, 2);
  } catch { return []; }
}

/** One-shot fetch of every non-live card kind. Exported for non-hook callers (tests, prefetch). */
export async function fetchFeedCards(
  viewerId: string | undefined, followingIds: readonly string[], clubIds: readonly string[],
  o: { viewerProfile?: UserProfile | null; now?: number; /** follows newest-first (fetchRecentFollowingIds) */ recentFollowing?: readonly string[] } = {},
): Promise<{ cards: FeedCardItem[]; clubNames: Record<string, string> }> {
  const now = o.now ?? Date.now();
  const authors = prioritizeAuthors(o.recentFollowing ?? [], followingIds, viewerId, MAX_AUTHORS);
  const followSet = new Set(followingIds);
  const authorChunks = chunk(authors, IN_QUERY_LIMIT);
  const clubs = [...new Set(clubIds)].slice(0, MAX_CLUBS);
  const clubNames: Record<string, string> = {};

  const [albums, videos, events, clubCards, debateCards, achievementCards, sportsCards] = await Promise.all([
    safe('albums', Promise.all(authorChunks.map(a =>
      getDocs(query(collection(db, 'albums'), where('ownerId', 'in', a), orderBy('createdAt', 'desc'), limit(6))).then(s => docs<AlbumDoc>(s)))
    ).then(r => r.flat()), [] as Raw<AlbumDoc>[]),
    safe('videos', Promise.all(authorChunks.map(a =>
      getDocs(query(collection(db, 'videos'), where('ownerId', 'in', a), orderBy('timestamp', 'desc'), limit(6))).then(s => docs<VideoDoc>(s)))
    ).then(r => r.flat()), [] as Raw<VideoDoc>[]),
    safe('events', Promise.all(authorChunks.map(a =>
      getDocs(query(collection(db, 'ppv_events'), where('ownerId', 'in', a), where('status', '==', 'UPCOMING'), limit(10))).then(s => docs<EventDoc>(s)))
    ).then(r => r.flat()), [] as Raw<EventDoc>[]),
    safe('clubPosts', Promise.all(clubs.map(async clubId => {
      const [snap, club] = await Promise.all([
        getDocs(query(collection(db, 'clubPosts'), where('clubId', '==', clubId), orderBy('isPinned', 'desc'), orderBy('timestamp', 'desc'), limit(8))),
        getDoc(doc(db, 'clubs', clubId)),
      ]);
      const name = String(club.exists() ? club.data()?.name ?? 'your club' : 'your club');
      clubNames[clubId] = name;
      const best = docs<ClubPostDoc>(snap)
        .map(p => clubPostToCard(p, name, now, viewerId))
        .filter((c): c is FeedCardItem => !!c)
        .sort((a, b) => b.score - a.score)[0];
      return best ? [best] : [];
    })).then(r => r.flat().sort((a, b) => b.score - a.score).slice(0, 3)), [] as FeedCardItem[]),
    // DEBATE: open debates, most active first (index debates(status, postCount desc)); public read
    viewerId ? safe('debates', getDocs(query(collection(db, 'debates'), where('status', '==', 'ACTIVE'), orderBy('postCount', 'desc'), limit(12)))
      .then(s => docs<DebateDoc>(s).map(d => debateToCard(d, now, { followingIds: followSet, viewerId })).filter((c): c is FeedCardItem => !!c)
        .sort((a, b) => b.score - a.score).slice(0, 2)), [] as FeedCardItem[]) : Promise.resolve([] as FeedCardItem[]),
    // ACHIEVEMENT: followed users' opt-in public achievements (index publicAchievements(userId, earnedAt desc))
    safe('achievements', Promise.all(authorChunks.map(a =>
      getDocs(query(collection(db, 'publicAchievements'), where('userId', 'in', a), orderBy('earnedAt', 'desc'), limit(5))).then(s => docs<PublicAchievementDoc>(s)))
    ).then(async r => {
      const picked = pickAchievementCards(r.flat().map(d => achievementToCard(d, now, undefined, viewerId)).filter((c): c is FeedCardItem => !!c), 3);
      // name/photo come from the author's own user doc (never from the self-asserted showcase doc)
      const people = await Promise.all(picked.map(c => getDoc(doc(db, 'users', c.authorId!)).then(s => (s.exists() ? s.data() : null)).catch(() => null)));
      return picked.map((c, i) => {
        const src = r.flat().find(d => `${d.userId}_${d.achievementId}` === c.id || d.id === c.id);
        const p = people[i] as any;
        return src ? achievementToCard(src, now, { name: p?.displayName, photo: p?.photoURL }, viewerId) : null;
      }).filter((c): c is FeedCardItem => !!c);
    }), [] as FeedCardItem[]),
    fetchSportsCards(viewerId, o.viewerProfile, now),
  ]);

  const cards: FeedCardItem[] = [
    ...filterForViewer(albums, o.viewerProfile).map(a => albumToCard(a, now)),
    ...filterForViewer(videos, o.viewerProfile).map(v => videoToCard(v, now)),
    ...events.map(e => eventToCard(e, now)),
    ...clubCards, ...debateCards, ...achievementCards, ...sportsCards,
  ].filter((c): c is FeedCardItem => !!c);

  // releases/videos: keep the best 2 per kind so one prolific creator can't fill the rail
  const cap = (kind: FeedCardItem['kind'], n: number) => {
    let k = 0;
    return (c: FeedCardItem) => c.kind !== kind || ++k <= n;
  };
  const ranked = cards.sort((a, b) => b.score - a.score);
  const c1 = cap('NEW_RELEASE', 3), c2 = cap('NEW_VIDEO', 3), c3 = cap('EVENT_SOON', 2);
  return { cards: ranked.filter(c => c1(c) && c2(c) && c3(c)), clubNames };
}

export function useFeedCards(
  viewer: { uid?: string } | null | undefined,
  followingIds: Iterable<string> | undefined,
  clubIds: Iterable<string> | undefined,
  opts: UseFeedCardsOptions = {},
): { cards: FeedCardItem[]; loading: boolean; refresh: () => void } {
  const { hiddenUids, mutedKinds, viewerProfile, candidatePosts, enabled = true } = opts;
  const viewerId = viewer?.uid;
  // stable string keys → no refetch when the parent passes a new array/set with the same ids
  const followKey = useMemo(() => (followingIds ? [...followingIds].sort().join(',') : ''), [followingIds]);
  const clubKey = useMemo(() => (clubIds ? [...clubIds].sort().join(',') : ''), [clubIds]);

  const [stat, setStat] = useState<FeedCardItem[]>([]);
  const [clubNames, setClubNames] = useState<Record<string, string>>({});
  const [liveDocs, setLiveDocs] = useState<LiveFeedDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(() => Date.now());
  const [nonce, setNonce] = useState(0);
  const profileRef = useRef(viewerProfile); profileRef.current = viewerProfile;
  // The caller's own order is kept (followKey is sorted only to be a stable dependency): when more than
  // MAX_AUTHORS are followed, earlier ids win — pass newest-first. The `follows` timestamp order is also fetched.
  const followOrderRef = useRef<string[]>([]); followOrderRef.current = followingIds ? [...followingIds] : [];
  const recentRef = useRef<{ key: string; ids: string[] } | null>(null);

  // non-live kinds: fetch on key change + every 5 min
  useEffect(() => {
    if (!enabled || !viewerId) { setStat([]); setLoading(false); return; }
    let cancelled = false;
    const run = async () => {
      try {
        const needRecent = followKey.split(',').filter(Boolean).length > MAX_AUTHORS;   // only matters when we must truncate
        const rk = `${viewerId}|${followKey}`;
        if (needRecent && recentRef.current?.key !== rk) recentRef.current = { key: rk, ids: await fetchRecentFollowingIds(viewerId) };
        const r = await fetchFeedCards(viewerId, followOrderRef.current, clubKey ? clubKey.split(',') : [], {
          viewerProfile: profileRef.current, recentFollowing: needRecent ? recentRef.current?.ids : undefined,
        });
        if (!cancelled) { setStat(r.cards); setClubNames(r.clubNames); setLoading(false); }
      } catch { if (!cancelled) setLoading(false); }
    };
    setLoading(true);
    run();
    const t = setInterval(run, REFRESH_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, [enabled, viewerId, followKey, clubKey, nonce]);

  // live: realtime discovery mirror
  useEffect(() => {
    if (!enabled || !viewerId) { setLiveDocs([]); return; }
    const unsub = onSnapshot(
      query(collection(db, 'live_feeds'), where('status', '==', 'LIVE'), limit(60)),
      snap => setLiveDocs(docs<LiveFeedDoc>(snap)),
      () => setLiveDocs([]),
    );
    const t = setInterval(() => setTick(Date.now()), LIVE_TICK_MS);   // heartbeat staleness
    return () => { unsub(); clearInterval(t); };
  }, [enabled, viewerId]);

  const cards = useMemo(() => {
    if (!enabled || !viewerId) return [];
    const now = Date.now();
    const f = new Set(followKey ? followKey.split(',') : []);
    const c = new Set(clubKey ? clubKey.split(',') : []);
    const live = liveDocs.map(d => liveFeedToCard(d, now, { followingIds: f, clubIds: c, viewerId, clubNames })).filter((x): x is FeedCardItem => !!x);
    const viz = (candidatePosts ?? []).map(p => dataVizPostToCard(p, now)).filter((x): x is FeedCardItem => !!x).slice(0, 2);
    return filterCards([...live, ...stat, ...viz, historyMomentCard(viewerId, now)], { hiddenUids, mutedKinds, viewerId });
    // tick re-evaluates liveness without new data
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, viewerId, liveDocs, stat, candidatePosts, hiddenUids, mutedKinds, followKey, clubKey, clubNames, tick]);

  const refresh = useCallback(() => setNonce(n => n + 1), []);
  return { cards, loading, refresh };
}
