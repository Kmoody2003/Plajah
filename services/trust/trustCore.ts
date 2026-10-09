// trustCore — PURE account trust tiers + the limits each tier gets.
//
// Principle (docs/ANTI_BOT_PLAYBOOK.md): invisible to humans, walls for bots. A real person who
// signs up, confirms their email (or used Google/Apple/…), and follows a few people is BASIC
// within days and TRUSTED within weeks without ever seeing a limit. A fresh scripted account
// with no verified identity, no organic graph, and reports against it stays NEW, where the
// ceilings that matter to spam (links, cold DMs, mass mentions, follow bursts, giant groups)
// are low.
//
// Tiers:  NEW → BASIC → TRUSTED → VERIFIED_CREATOR
//   NEW               default; also where restricted accounts land (active sanction / upheld reports)
//   BASIC             age ≥ 2 d with a verified email or an OAuth provider, OR age ≥ 7 d
//   TRUSTED           age ≥ 30 d, verified identity, a real follower graph, no upheld reports
//   VERIFIED_CREATOR  server-granted creator verification (users/{uid} verified flag / custom claim)
//
// No I/O, no Firebase imports — used by the client (composer, DM start, rate limits) and the
// server (scheduled-post publisher, outbound social publish). Unit tests: tests/trustCore.test.ts.

export type TrustTier = 'NEW' | 'BASIC' | 'TRUSTED' | 'VERIFIED_CREATOR';

export interface TrustSignals {
  /** Account age in ms (now - creation). Unknown → treated as 0 for tiering (but see `ageUnknown`). */
  accountAgeMs?: number | null;
  emailVerified?: boolean;
  /** Firebase providerIds, e.g. ['password'], ['google.com']. */
  providers?: readonly string[];
  isAnonymous?: boolean;
  /** Phone verification (not collected today — reserved). */
  phoneVerified?: boolean;
  followerCount?: number;
  /** Followers this account also follows back (a cheap organic-graph signal). */
  mutualFollowCount?: number;
  /** Followers who are themselves BASIC+ (if known; server-side enrichment). */
  qualityFollowerCount?: number;
  /** Reports against this account that moderation UPHELD (lifetime). */
  upheldReports?: number;
  /** Open, unreviewed reports against the account in the last 30 days. */
  openReports30d?: number;
  /** Prior sanctions (lifetime count) and whether one is active now. */
  priorSanctions?: number;
  activeSanction?: boolean;
  /** Server-granted creator verification (never client-claimable). */
  verifiedCreator?: boolean;
}

export interface TrustLimits {
  /** Max links in one post/comment before it's blocked (NEW) or flagged (others). */
  linksPerPost: number;
  /** Max @mentions in one post/comment. */
  mentionsPerPost: number;
  /** New 1:1 conversations with people who don't follow you, per rolling 24 h. */
  dmsToNonFollowersPerDay: number;
  /** May start group chats at all. */
  canCreateGroups: boolean;
  /** Max participants when creating a group chat. */
  maxGroupSize: number;
  /** Follows per rolling hour. */
  followsPerHour: number;
}

export interface TrustResult {
  tier: TrustTier;
  /** 0–100 informational score (for dashboards; tier is the contract). */
  score: number;
  /** Why — short machine-readable tags. */
  reasons: string[];
  limits: TrustLimits;
  /** True when the account is held at NEW because of moderation signals (not just newness). */
  restricted: boolean;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const BASIC_MIN_AGE_VERIFIED_MS = 2 * DAY;
/** Unverified accounts reach BASIC on age alone after this (matches the old 7-day rule). */
export const BASIC_MIN_AGE_UNVERIFIED_MS = 7 * DAY;
export const TRUSTED_MIN_AGE_MS = 30 * DAY;

export const TIER_LIMITS: Record<TrustTier, TrustLimits> = {
  NEW:              { linksPerPost: 1,  mentionsPerPost: 3,  dmsToNonFollowersPerDay: 5,   canCreateGroups: true, maxGroupSize: 10,   followsPerHour: 20 },
  BASIC:            { linksPerPost: 3,  mentionsPerPost: 8,  dmsToNonFollowersPerDay: 20,  canCreateGroups: true, maxGroupSize: 50,   followsPerHour: 60 },
  TRUSTED:          { linksPerPost: 5,  mentionsPerPost: 15, dmsToNonFollowersPerDay: 60,  canCreateGroups: true, maxGroupSize: 256,  followsPerHour: 120 },
  VERIFIED_CREATOR: { linksPerPost: 10, mentionsPerPost: 30, dmsToNonFollowersPerDay: 200, canCreateGroups: true, maxGroupSize: 1000, followsPerHour: 200 },
};

/** Restricted accounts: NEW ceilings, minus group creation. */
const RESTRICTED_LIMITS: TrustLimits = { ...TIER_LIMITS.NEW, dmsToNonFollowersPerDay: 2, canCreateGroups: false, maxGroupSize: 0, followsPerHour: 10 };

const OAUTH_PROVIDERS = new Set(['google.com', 'apple.com', 'microsoft.com', 'facebook.com', 'twitter.com', 'github.com']);

const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

export function hasVerifiedIdentity(s: TrustSignals): boolean {
  if (s.isAnonymous) return false;
  if (s.emailVerified || s.phoneVerified) return true;
  return (s.providers || []).some(p => OAUTH_PROVIDERS.has(p));
}

/** Organic follower graph: some mutuals, or a meaningful set of quality followers. */
export function hasOrganicGraph(s: TrustSignals): boolean {
  const followers = n(s.followerCount), mutuals = n(s.mutualFollowCount), quality = n(s.qualityFollowerCount);
  if (quality >= 5) return true;
  if (mutuals >= 3 && followers >= 5) return true;
  return followers >= 25 && mutuals >= 1;
}

export function computeTrust(s: TrustSignals): TrustResult {
  const reasons: string[] = [];
  const age = n(s.accountAgeMs);
  const identity = hasVerifiedIdentity(s);
  const graph = hasOrganicGraph(s);
  const upheld = n(s.upheldReports), open = n(s.openReports30d), sanctions = n(s.priorSanctions);

  let score = 0;
  score += Math.min(30, (age / TRUSTED_MIN_AGE_MS) * 30);
  if (identity) score += 25;
  if (graph) score += 25;
  score += Math.min(10, n(s.followerCount) / 10);
  if (s.verifiedCreator) score += 10;
  score -= upheld * 15 + Math.min(open, 5) * 3 + sanctions * 10;
  score = Math.max(0, Math.min(100, Math.round(score)));

  // Hard holds first.
  const restricted = !!s.activeSanction || upheld >= 3;
  if (s.activeSanction) reasons.push('active_sanction');
  if (upheld >= 3) reasons.push('upheld_reports');
  if (restricted) return { tier: 'NEW', score, reasons, limits: RESTRICTED_LIMITS, restricted: true };
  if (s.isAnonymous) {
    reasons.push('anonymous');
    return { tier: 'NEW', score, reasons, limits: TIER_LIMITS.NEW, restricted: false };
  }

  if (s.verifiedCreator) {
    reasons.push('verified_creator');
    return { tier: 'VERIFIED_CREATOR', score, reasons, limits: TIER_LIMITS.VERIFIED_CREATOR, restricted: false };
  }

  if (identity) reasons.push('verified_identity'); else reasons.push('unverified_identity');
  if (graph) reasons.push('organic_graph');

  const cleanRecord = upheld === 0 && sanctions === 0 && open < 3;
  if (age >= TRUSTED_MIN_AGE_MS && identity && graph && cleanRecord) {
    reasons.push('tenure');
    return { tier: 'TRUSTED', score, reasons, limits: TIER_LIMITS.TRUSTED, restricted: false };
  }

  const basicByVerified = identity && age >= BASIC_MIN_AGE_VERIFIED_MS;
  const basicByAge = age >= BASIC_MIN_AGE_UNVERIFIED_MS;
  // A couple of upheld reports or a past sanction delays BASIC until the account has real tenure.
  const blemished = upheld > 0 || sanctions > 0;
  if ((basicByVerified || basicByAge) && (!blemished || age >= TRUSTED_MIN_AGE_MS)) {
    reasons.push(basicByVerified ? 'verified_and_aged' : 'aged');
    return { tier: 'BASIC', score, reasons, limits: TIER_LIMITS.BASIC, restricted: false };
  }

  reasons.push('new_account');
  return { tier: 'NEW', score, reasons, limits: TIER_LIMITS.NEW, restricted: false };
}

export const tierAtLeast = (tier: TrustTier, min: TrustTier): boolean => {
  const order: TrustTier[] = ['NEW', 'BASIC', 'TRUSTED', 'VERIFIED_CREATOR'];
  return order.indexOf(tier) >= order.indexOf(min);
};

/** Friendly, non-accusatory copy for a limit a person actually hit. */
export const TRUST_LIMIT_COPY = {
  dm: 'You’ve started a lot of new conversations today. To keep Plajah spam-free, new accounts can message a few people who don’t follow them each day — this grows as your account does.',
  group: (max: number) => `Group chats from newer accounts can include up to ${max} people for now. This limit grows as your account does.`,
  groupBlocked: 'Starting new group chats is paused on this account. You can still message people who follow you.',
} as const;
