// People discovery — data fetchers on top of the pure scoring module (services/discoveryScoring.ts).
//
//   suggestPeople({ viewer, limit, mode })   -> ranked Suggestion[]
//   loadDiscovery(viewer, followingIds)       -> the cached candidate pool + signals (tabs reuse it)
//   rankTab(data, tab)                        -> ranked list for one PeopleDiscoveryPage tab
//
// Reads are BOUNDED (recent users by createdAt desc, popular users, club co-members,
// friends-of-friends sample, live feeds, region opt-ins) — never "first 50 users" — and the pool
// is cached per session for 10 minutes. Follow/hidden/dismissed state is applied fresh each call.
//
// PRIVACY: reasons use only public data; location is opt-in on BOTH sides and typed by the user
// (discoveryRegion), never weatherCity / lat / lon / GPS.

import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db, fetchFollowingIds, fetchUserProfile, searchUserProfiles } from './backendService';
import { fetchHiddenUids } from './socialSafetyService';
import { uniqueIds } from './followGraphUtils';
import {
  dayKey, filterForTab, hash01, normRegion, pickMode, rankSuggestions,
  type DiscoveryContext, type DiscoveryMode, type DiscoveryProfile, type DiscoveryTab, type Suggestion,
} from './discoveryScoring';

export * from './discoveryScoring';

const POOL_TTL_MS = 10 * 60_000;
const DISMISS_MS = 30 * 86_400_000;

export interface DiscoveryData {
  at: number;
  candidates: Map<string, DiscoveryProfile>;
  sharedClubs: Map<string, string[]>;
  mutualCounts: Map<string, number>;
  liveUids: Set<string>;
  hiddenUids: Set<string>;
}

const asProfile = (id: string, d: any): DiscoveryProfile => ({ ...d, uid: id } as DiscoveryProfile);

// ── dismissals (X on a card), remembered 30 days per device ────────────────────

const dismissKey = (uid: string) => `plajah.discovery.dismissed.${uid}`;
const ls = (): Storage | null => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } };

export function getDismissed(uid: string, now: number = Date.now()): Set<string> {
  try {
    const raw = JSON.parse(ls()?.getItem(dismissKey(uid)) || '{}') as Record<string, number>;
    return new Set(Object.entries(raw).filter(([, exp]) => typeof exp === 'number' && exp > now).map(([id]) => id));
  } catch { return new Set(); }
}

export function dismissSuggestion(uid: string, targetUid: string, now: number = Date.now()): void {
  try {
    const raw = JSON.parse(ls()?.getItem(dismissKey(uid)) || '{}') as Record<string, number>;
    for (const k of Object.keys(raw)) if (raw[k] <= now) delete raw[k];
    raw[targetUid] = now + DISMISS_MS;
    ls()?.setItem(dismissKey(uid), JSON.stringify(raw));
  } catch { /* storage blocked: dismissal just won't persist */ }
}

// ── pool ───────────────────────────────────────────────────────────────────────

const cache = new Map<string, DiscoveryData>();
const inflight = new Map<string, Promise<DiscoveryData>>();

export function clearDiscoveryCache(uid?: string): void {
  if (uid) { cache.delete(uid); inflight.delete(uid); } else { cache.clear(); inflight.clear(); }
}

async function buildPool(viewer: DiscoveryProfile, followingIds: string[]): Promise<DiscoveryData> {
  const uid = viewer.uid;
  const now = Date.now();
  const candidates = new Map<string, DiscoveryProfile>();
  const sharedClubs = new Map<string, string[]>();
  const mutualCounts = new Map<string, number>();
  const liveUids = new Set<string>();
  const wanted = new Set<string>();   // ids we know about but still need a profile for

  const addDocs = (snap: { docs: any[] } | null) => snap?.docs.forEach(d => candidates.set(d.id, asProfile(d.id, d.data())));
  const safe = <T,>(p: Promise<T>): Promise<T | null> => p.catch(() => null);

  const regionKey = viewer.discoverByRegion ? normRegion(viewer.discoveryRegion) : '';

  // 1) recent joiners, 2) popularity prior, 3) region opt-ins (only if the viewer opted in),
  // 4) welcome ambassadors, 5) live now, 6) the viewer's club memberships
  const [recent, popular, region, ambassadors, live, memberships] = await Promise.all([
    safe(getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(60)))),
    safe(getDocs(query(collection(db, 'users'), orderBy('followerCount', 'desc'), limit(40)))),
    regionKey ? safe(getDocs(query(collection(db, 'users'), where('discoverByRegion', '==', true), where('discoveryRegionKey', '==', regionKey), limit(40)))) : Promise.resolve(null),
    safe(getDocs(query(collection(db, 'users'), where('isWelcomeAmbassador', '==', true), limit(10)))),
    safe(getDocs(query(collection(db, 'live_feeds'), where('status', '==', 'LIVE'), limit(60)))),
    safe(getDocs(query(collection(db, 'clubMemberships'), where('userId', '==', uid), where('status', '==', 'ACTIVE'), limit(10)))),
  ]);
  [recent, popular, region, ambassadors].forEach(addDocs);

  live?.docs.forEach(d => {
    const f = d.data() as any;
    if (f.ownerId && f.ownerId !== uid && f.isPublic !== false) { liveUids.add(f.ownerId); wanted.add(f.ownerId); }
  });

  // club co-members (cap 6 clubs x 40 members)
  const clubIds = uniqueIds(memberships?.docs.map(d => d.data().clubId as string) ?? []).slice(0, 6);
  await Promise.all(clubIds.map(async clubId => {
    const [club, members] = await Promise.all([
      safe(getDoc(doc(db, 'clubs', clubId))),
      safe(getDocs(query(collection(db, 'clubMemberships'), where('clubId', '==', clubId), where('status', '==', 'ACTIVE'), limit(40)))),
    ]);
    const clubName = String((club?.data() as any)?.name || 'a');
    members?.docs.forEach(d => {
      const m = d.data() as any;
      if (!m.userId || m.userId === uid) return;
      const arr = sharedClubs.get(m.userId) ?? [];
      arr.push(clubName);
      sharedClubs.set(m.userId, arr);
      wanted.add(m.userId);
    });
  }));

  // friends-of-friends: sample up to 12 followed people (deterministic per viewer+day) and
  // count how many of them follow each candidate ("N mutual follows")
  const seed = `${uid}:${dayKey(now)}`;
  const sample = [...followingIds].sort((a, b) => hash01(`${seed}:${a}`) - hash01(`${seed}:${b}`)).slice(0, 12);
  const followed = new Set(followingIds);
  await Promise.all(sample.map(async f => {
    const snap = await safe(getDocs(query(collection(db, 'follows'), where('followerId', '==', f), limit(40))));
    snap?.docs.forEach(d => {
      const t = d.data().followingId as string;
      if (!t || t === uid || followed.has(t)) return;
      mutualCounts.set(t, (mutualCounts.get(t) ?? 0) + 1);
      wanted.add(t);
    });
  }));

  // fetch profiles we only know by id — strongest signals first, hard cap 80 reads
  const missing = [...wanted].filter(id => !candidates.has(id));
  const rank = (id: string) => (sharedClubs.get(id)?.length ?? 0) * 10 + (mutualCounts.get(id) ?? 0) * 5 + (liveUids.has(id) ? 3 : 0);
  missing.sort((a, b) => rank(b) - rank(a));
  const profiles = await Promise.all(missing.slice(0, 80).map(id => safe(fetchUserProfile(id))));
  profiles.forEach(p => { if (p) candidates.set(p.uid, p as DiscoveryProfile); });

  const hiddenUids = await fetchHiddenUids(uid).catch(() => new Set<string>());
  return { at: now, candidates, sharedClubs, mutualCounts, liveUids, hiddenUids };
}

/** Cached (10 min) candidate pool + signals for this viewer. */
export async function loadDiscovery(viewer: DiscoveryProfile, followingIds?: readonly string[], force = false): Promise<DiscoveryData> {
  const uid = viewer.uid;
  const hit = cache.get(uid);
  if (hit && !force && Date.now() - hit.at < POOL_TTL_MS) return hit;
  const pending = inflight.get(uid);
  if (pending && !force) return pending;
  const p = (async () => {
    const ids = followingIds ? [...followingIds] : await fetchFollowingIds(uid, 1000);
    const data = await buildPool(viewer, ids);
    cache.set(uid, data);
    return data;
  })().finally(() => { inflight.delete(uid); });
  inflight.set(uid, p);
  return p;
}

/** Context for scoring: pool signals + the LIVE follow/hidden/dismissed state. */
export function makeContext(viewer: DiscoveryProfile, data: DiscoveryData, followingIds: ReadonlySet<string>, hiddenExtra?: ReadonlySet<string>, now: number = Date.now()): DiscoveryContext {
  const hidden = new Set(data.hiddenUids);
  hiddenExtra?.forEach(h => hidden.add(h));
  return {
    viewer, followingIds, hiddenUids: hidden,
    dismissedUids: getDismissed(viewer.uid, now),
    sharedClubs: data.sharedClubs, mutualCounts: data.mutualCounts, liveUids: data.liveUids,
    now, seed: `${viewer.uid}:${dayKey(now)}`,
  };
}

export interface SuggestOptions {
  viewer: DiscoveryProfile;
  limit?: number;
  mode?: DiscoveryMode;
  /** Pass the live set from useFollowing() to avoid a read; otherwise fetched. */
  followingIds?: ReadonlySet<string>;
  /** Extra uids to hide (e.g. useSocialSafety().hidden, fresher than the cached fetch). */
  hiddenUids?: ReadonlySet<string>;
  force?: boolean;
}

export async function suggestPeople(opts: SuggestOptions): Promise<Suggestion[]> {
  const { viewer } = opts;
  if (!viewer?.uid) return [];
  const following = opts.followingIds ?? new Set(await fetchFollowingIds(viewer.uid, 1000));
  const data = await loadDiscovery(viewer, [...following], opts.force);
  const ctx = makeContext(viewer, data, following, opts.hiddenUids);
  const mode = opts.mode ?? pickMode(viewer, following.size, ctx.now);
  return rankSuggestions([...data.candidates.values()], ctx, { limit: opts.limit ?? 12, mode });
}

/** Ranked list for one PeopleDiscoveryPage tab. */
export function rankTab(
  viewer: DiscoveryProfile, data: DiscoveryData, following: ReadonlySet<string>, tab: DiscoveryTab,
  opts: { creatorType?: string; limit?: number; hiddenUids?: ReadonlySet<string> } = {},
): Suggestion[] {
  const ctx = makeContext(viewer, data, following, opts.hiddenUids);
  const pool = filterForTab([...data.candidates.values()], ctx, tab, opts.creatorType);
  const mode: DiscoveryMode = tab === 'new' ? 'new-members' : 'new-user';   // permissive: tabs pre-filter
  return rankSuggestions(pool, ctx, { limit: opts.limit ?? 40, mode, maxPopularShare: tab === 'creators' || tab === 'live' ? 1 : 0.4 });
}

/** Real search: prefix over displayName (+ handle). Excludes self, hidden, child + employee. */
export async function searchPeople(
  viewer: DiscoveryProfile, term: string, hidden?: ReadonlySet<string>, max = 20,
): Promise<DiscoveryProfile[]> {
  const found = await searchUserProfiles(term, max, { excludeRestricted: true });
  // search is explicit, so people the viewer already follows are still shown (the UI marks them)
  return found.filter(u => u.uid !== viewer.uid && !u.isChild && !u.isEmployee && !hidden?.has(u.uid));
}

/** Volunteer welcome ambassadors (for the new-account greeting). */
export async function fetchWelcomeAmbassadors(max = 3): Promise<{ uid: string; displayName: string }[]> {
  try {
    const snap = await getDocs(query(collection(db, 'users'), where('isWelcomeAmbassador', '==', true), limit(10)));
    return snap.docs
      .map(d => ({ uid: d.id, displayName: String((d.data() as any).displayName || '') }))
      .filter(a => a.displayName).slice(0, max);
  } catch { return []; }
}
