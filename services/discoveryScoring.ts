// People-discovery scoring — PURE (no Firebase, no DOM) so it is unit-testable.
// services/discoveryService.ts gathers the candidate pool + signals and calls rankSuggestions().
//
// PRIVACY RULE: a suggestion `reason` may only be built from data the candidate has PUBLIC
// (public interests, clubs they publicly belong to, follows, join date, public region opt-in).
// Never weatherCity/lat/lon/GPS. Region matching needs BOTH people opted in.

import type { UserProfile } from '../types';

export type DiscoveryMode = 'new-user' | 'existing' | 'new-members';

/** The slice of UserProfile discovery reads (+ forward-compat private-account flag). */
export type DiscoveryProfile = Pick<UserProfile, 'uid' | 'displayName' | 'photoURL'> & Partial<Pick<UserProfile,
  | 'followerCount' | 'joinedAt' | 'createdAt' | 'publicInterests' | 'favoriteSportsTeams'
  | 'favoriteScienceFields' | 'isArtist' | 'isWriter' | 'isStudent' | 'isTeacher' | 'isFan' | 'accountType'
  | 'athleteSport' | 'isChild' | 'isEmployee' | 'hideFromSuggestions' | 'discoverByRegion' | 'discoveryRegion'
  | 'sayHiOptOut' | 'isWelcomeAmbassador' | 'bio' | 'discoveryRegionKey'>> & {
  /** Private-account flag (users/{uid}.isPrivate, written by socialSafetyService.setAccountPrivate).
   *  Private accounts are never suggested. */
  isPrivate?: boolean;
  handle?: string;
  /** Optional last-activity ms if the profile carries one. */
  lastActiveAt?: number;
};

export interface DiscoveryContext {
  viewer: DiscoveryProfile;
  followingIds: ReadonlySet<string>;
  /** blocked ∪ blockedBy ∪ muted (from socialSafety). */
  hiddenUids: ReadonlySet<string>;
  /** uids the viewer dismissed (X) within the last 30 days. */
  dismissedUids?: ReadonlySet<string>;
  /** candidate uid -> names of clubs shared with the viewer. */
  sharedClubs?: ReadonlyMap<string, readonly string[]>;
  /** candidate uid -> number of people the viewer follows who also follow the candidate. */
  mutualCounts?: ReadonlyMap<string, number>;
  /** candidates that are live right now. */
  liveUids?: ReadonlySet<string>;
  now: number;
  /** Seed for the deterministic near-tie shuffle, e.g. `${viewerUid}:${YYYY-MM-DD}`. */
  seed: string;
}

export type ReasonKind = 'ambassador' | 'club' | 'mutual' | 'interest' | 'type' | 'region' | 'fresh' | 'live' | 'active' | 'popular';

export interface Suggestion {
  uid: string;
  profile: DiscoveryProfile;
  score: number;
  /** Human reason shown on the card (strongest signal). */
  reason: string;
  reasonKind: ReasonKind;
  reasons: string[];
  isNew: boolean;
}

export const FRESH_DAYS = 14;
const DAY_MS = 86_400_000;
export const POPULAR_FOLLOWER_THRESHOLD = 1000;

// ── helpers ───────────────────────────────────────────────────────────────────

/** FNV-1a 32-bit -> [0,1). Deterministic, no Math.random. */
export function hash01(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return (h >>> 0) / 4294967296;
}

export function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function normTag(s: string): string {
  return String(s).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function normRegion(s: string | undefined | null): string {
  return normTag(s || '');
}

/** Region match requires BOTH to have opted in AND typed a region. 'Detroit' matches 'Detroit, MI'. */
export function regionMatch(viewer: DiscoveryProfile, cand: DiscoveryProfile): string | null {
  if (!viewer.discoverByRegion || !cand.discoverByRegion) return null;
  const a = normRegion(viewer.discoveryRegion);
  const b = normRegion(cand.discoveryRegion);
  if (!a || !b) return null;
  if (a === b) return cand.discoveryRegion!.trim();
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (long.startsWith(short + ' ')) return cand.discoveryRegion!.trim();
  return null;
}

export function joinedMs(p: DiscoveryProfile): number {
  const j = typeof p.joinedAt === 'number' ? p.joinedAt : 0;
  const c = typeof p.createdAt === 'number' ? p.createdAt : 0;
  return j || c || 0;
}

export function ageDays(p: DiscoveryProfile, now: number): number | null {
  const t = joinedMs(p);
  if (!t) return null;
  return Math.max(0, (now - t) / DAY_MS);
}

export function isNewMember(p: DiscoveryProfile, now: number): boolean {
  const a = ageDays(p, now);
  return a !== null && a < FRESH_DAYS;
}

export function joinedLabel(p: DiscoveryProfile, now: number): string {
  const a = ageDays(p, now);
  if (a === null) return 'New on Plajah';
  const d = Math.floor(a);
  if (d <= 0) return 'Joined today';
  if (d === 1) return 'Joined yesterday';
  return `Joined ${d} days ago`;
}

/** Coarse creator type of a profile, for "fellow artist" style matching. */
export function creatorTypes(p: DiscoveryProfile): string[] {
  const t: string[] = [];
  if (p.isArtist || p.accountType === 'ARTIST') t.push('artist');
  if (p.isWriter || p.accountType === 'WRITER') t.push('writer');
  if (p.isStudent || p.accountType === 'STUDENT') t.push('student');
  if (p.isTeacher || p.accountType === 'TEACHER') t.push('teacher');
  if (p.accountType === 'ATHLETE' || p.athleteSport) t.push(p.athleteSport ? `athlete:${String(p.athleteSport).toLowerCase()}` : 'athlete');
  return t;
}

export function creatorTypeLabel(type: string): string {
  if (type.startsWith('athlete:')) return `Fellow ${type.slice(8)} athlete`;
  return `Fellow ${type}`;
}

function sharedTags(a: readonly string[] | undefined, b: readonly string[] | undefined): string[] {
  if (!a?.length || !b?.length) return [];
  const mine = new Map(a.map(x => [normTag(x), x] as const));
  const out: string[] = [];
  for (const x of b) {
    const k = normTag(x);
    if (k && mine.has(k) && !out.includes(x)) out.push(x);
  }
  return out;
}

function joinNames(names: string[], max = 2): string {
  const shown = names.slice(0, max);
  return shown.length === 2 ? `${shown[0]} and ${shown[1]}` : shown[0];
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

// ── eligibility ───────────────────────────────────────────────────────────────

/** Hard exclusions — applied before scoring. Child + managed employee profiles are ALWAYS excluded. */
export function isEligibleCandidate(c: DiscoveryProfile, ctx: DiscoveryContext): boolean {
  if (!c.uid || c.uid === ctx.viewer.uid) return false;
  if (!c.displayName) return false;
  if (c.isChild || c.accountType === 'CHILD') return false;
  if (c.isEmployee || c.accountType === 'EMPLOYEE') return false;
  if (c.hideFromSuggestions) return false;
  if (c.isPrivate) return false;
  if (ctx.followingIds.has(c.uid)) return false;
  if (ctx.hiddenUids.has(c.uid)) return false;
  if (ctx.dismissedUids?.has(c.uid)) return false;
  return true;
}

// ── scoring ───────────────────────────────────────────────────────────────────

interface Signal { kind: ReasonKind; pts: number; text: string }

export function collectSignals(c: DiscoveryProfile, ctx: DiscoveryContext, mode: DiscoveryMode): Signal[] {
  const out: Signal[] = [];
  const v = ctx.viewer;

  const clubs = ctx.sharedClubs?.get(c.uid) ?? [];
  if (clubs.length) {
    out.push({
      kind: 'club', pts: Math.min(40, 30 + 5 * (clubs.length - 1)),
      text: clubs.length === 1 ? `Also in ${clubs[0]} club` : `In ${clubs.length} of your clubs`,
    });
  }

  const mutual = ctx.mutualCounts?.get(c.uid) ?? 0;
  if (mutual > 0) {
    out.push({ kind: 'mutual', pts: Math.min(42, 14 * mutual), text: mutual === 1 ? '1 mutual follow' : `${mutual} mutual follows` });
  }

  const interests = sharedTags(v.publicInterests, c.publicInterests);
  const sports = sharedTags(v.favoriteSportsTeams, c.favoriteSportsTeams);
  const science = sharedTags(v.favoriteScienceFields, c.favoriteScienceFields);
  const nShared = interests.length + sports.length + science.length;
  if (nShared > 0) {
    // interests carry more weight when we know little else (new users have no graph yet)
    const per = mode === 'new-user' ? 10 : 8;
    const text = interests.length ? `Likes ${joinNames(interests.map(s => s.toLowerCase()))}`
      : sports.length ? `Fan of ${joinNames(sports)}`
      : `Into ${joinNames(science.map(s => s.toLowerCase()))}`;
    out.push({ kind: 'interest', pts: Math.min(28, per * nShared), text });
  }

  const vt = creatorTypes(v);
  const sameType = creatorTypes(c).find(t => vt.includes(t));
  if (sameType) out.push({ kind: 'type', pts: 10, text: creatorTypeLabel(sameType) });

  const region = regionMatch(v, c);
  if (region) out.push({ kind: 'region', pts: 14, text: `Also in ${region}` });

  const age = ageDays(c, ctx.now);
  if (age !== null && age < FRESH_DAYS) {
    const base = mode === 'new-members' ? 30 : 12;
    out.push({ kind: 'fresh', pts: base * (1 - age / FRESH_DAYS) + 4, text: joinedLabel(c, ctx.now) });
  }

  // Welcome Committee volunteers are surfaced to people who are just starting out
  if (c.isWelcomeAmbassador && mode === 'new-user') out.push({ kind: 'ambassador', pts: 12, text: 'Welcome Committee ambassador' });

  if (ctx.liveUids?.has(c.uid)) out.push({ kind: 'live', pts: 15, text: 'Live now' });

  if (typeof c.lastActiveAt === 'number' && ctx.now - c.lastActiveAt < 3 * DAY_MS) {
    out.push({ kind: 'active', pts: 6, text: 'Active recently' });
  }

  // popularity prior with log damping (capped so it never outweighs a real shared signal)
  const fc = Math.max(0, c.followerCount || 0);
  const popWeight = mode === 'new-members' ? 3 : mode === 'new-user' ? 6 : 4;
  const pop = Math.min(20, Math.log10(1 + fc) * popWeight);
  // zero-follower accounts still get a floor so a young network isn't an empty list for newcomers
  out.push({ kind: 'popular', pts: Math.max(pop, 1), text: fc >= 10 ? `${formatCount(fc)} followers` : 'New on Plajah' });
  return out;
}

/** Score one candidate; null when ineligible or (existing mode) carrying no real signal. */
export function scoreCandidate(c: DiscoveryProfile, ctx: DiscoveryContext, mode: DiscoveryMode): Suggestion | null {
  if (!isEligibleCandidate(c, ctx)) return null;
  const sig = collectSignals(c, ctx, mode);
  if (!sig.length) return null;
  const real = sig.filter(s => s.kind !== 'popular' && s.kind !== 'active');
  // Existing users only see people we can actually justify; new users may fall back to popularity/fresh.
  if (mode === 'existing' && real.length === 0) return null;
  if (mode === 'new-members' && !sig.some(s => s.kind === 'fresh')) return null;
  const score = sig.reduce((a, s) => a + s.pts, 0);
  const ordered = [...sig].sort((a, b) => b.pts - a.pts);
  return {
    uid: c.uid, profile: c, score, reason: ordered[0].text, reasonKind: ordered[0].kind,
    reasons: ordered.map(s => s.text),
    isNew: isNewMember(c, ctx.now),
  };
}

export interface RankOptions {
  limit?: number;
  mode: DiscoveryMode;
  /** Scores within this many points are treated as ties and shuffled per viewer per day. */
  tieBand?: number;
  /** At most this share of the result may be "celebrity" accounts so newcomers aren't all shown the same few. */
  maxPopularShare?: number;
}

/**
 * Rank candidates:
 *  1. score each (hard exclusions applied);
 *  2. bucket by score band and order within a band by hash(seed:uid) — a deterministic shuffle
 *     that differs per viewer and per day, so the same accounts don't top every newcomer's list;
 *  3. exposure cap: at most `maxPopularShare` of the picks may have >= 1000 followers.
 */
export function rankSuggestions(candidates: readonly DiscoveryProfile[], ctx: DiscoveryContext, opts: RankOptions): Suggestion[] {
  const limit = opts.limit ?? 12;
  const band = opts.tieBand ?? 6;
  const maxPopular = Math.max(1, Math.ceil(limit * (opts.maxPopularShare ?? 0.4)));
  const seen = new Set<string>();
  const scored: Suggestion[] = [];
  for (const c of candidates) {
    if (seen.has(c.uid)) continue;
    seen.add(c.uid);
    const s = scoreCandidate(c, ctx, opts.mode);
    if (s) scored.push(s);
  }
  const key = (s: Suggestion) => Math.floor(s.score / band);
  const tie = (s: Suggestion) => hash01(`${ctx.seed}:${s.uid}`);
  scored.sort((a, b) => key(b) - key(a) || tie(a) - tie(b) || b.score - a.score || (a.uid < b.uid ? -1 : 1));

  const out: Suggestion[] = [];
  const overflow: Suggestion[] = [];
  let popular = 0;
  for (const s of scored) {
    const isPop = (s.profile.followerCount || 0) >= POPULAR_FOLLOWER_THRESHOLD;
    if (isPop && popular >= maxPopular) { overflow.push(s); continue; }
    if (isPop) popular++;
    out.push(s);
    if (out.length >= limit) return out;
  }
  // not enough non-celebrity candidates: top up rather than return a short list
  for (const s of overflow) { out.push(s); if (out.length >= limit) break; }
  return out;
}

export function pickMode(viewer: DiscoveryProfile, followingCount: number, now: number): DiscoveryMode {
  return followingCount < 5 || isNewMember(viewer, now) ? 'new-user' : 'existing';
}

// ── tabs (PeopleDiscoveryPage) ───────────────────────────────────────────────

export type DiscoveryTab = 'new' | 'clubs' | 'like-you' | 'live' | 'creators' | 'near';

/** Creator-type keys the "Creators by type" tab offers. */
export const CREATOR_TYPES = ['artist', 'writer', 'student', 'teacher', 'athlete'] as const;

/** Pre-filter the pool for a tab; the result is then ranked with rankSuggestions. */
export function filterForTab(
  candidates: readonly DiscoveryProfile[], ctx: DiscoveryContext, tab: DiscoveryTab, creatorType?: string,
): DiscoveryProfile[] {
  return candidates.filter(c => {
    if (!isEligibleCandidate(c, ctx)) return false;
    switch (tab) {
      case 'new': return isNewMember(c, ctx.now);
      case 'clubs': return (ctx.sharedClubs?.get(c.uid)?.length ?? 0) > 0;
      case 'like-you': {
        const sig = collectSignals(c, ctx, 'existing');
        return sig.some(s => s.kind === 'interest' || s.kind === 'type' || s.kind === 'mutual');
      }
      case 'live': return !!ctx.liveUids?.has(c.uid);
      case 'creators': {
        const types = creatorTypes(c);
        return creatorType ? types.some(t => t === creatorType || t.startsWith(creatorType + ':')) : types.length > 0;
      }
      case 'near': return regionMatch(ctx.viewer, c) !== null;   // BOTH opted in, else never
    }
  });
}
