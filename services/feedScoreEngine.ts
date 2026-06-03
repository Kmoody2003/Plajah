/**
 * feedScoreEngine — Plajah Creator-Centric Engagement Score v2
 *
 * Full formula:
 *
 *   Score = [(W_d·D_dist) + (W_m·M) + (W_b·B)] / (T+1)^γ
 *           × α_creator × β_action × δ_discovery × ε_debate × Ω_whimsy
 *
 * Key principles:
 *   D_dist  — deep actions weighted by DISTINCT contributor count (distributed love)
 *   ε_debate — rewards real multi-voice discourse, not echo chambers
 *   Ω_whimsy — controlled serendipity: deterministic per viewer/day, unpredictable cross-viewer
 *
 * Advertising uses computeAdScore() — same engine, different signal set,
 * so good creative earns cheaper inventory automatically.
 *
 * All functions are pure (no Firestore). Tests can import freely.
 */

// ─── Weights ──────────────────────────────────────────────────────────────────

const W_D = 10;
const W_M = 3;
const W_B = 1;

// ─── Action type taxonomy ─────────────────────────────────────────────────────

export type DeepAction =
  | 'SANCTUARY_SUBSCRIBE'
  | 'PITCH_DECK_CONVERT'
  | 'SEED_RAISER_CONTRIB'
  | 'TIP_DONATION'
  | 'PAY_IT_FORWARD'
  | 'BOOK_PURCHASE';

export type MediumAction =
  | 'FEDIVERSE_BROADCAST'
  | 'DM_SHARE'
  | 'LONG_COMMENT'
  | 'DEBATE_REPLY'        // Reply to a different-perspective commenter (new)
  | 'NATIVE_SHARE'
  | 'CLUB_SHARE'
  | 'BOOKMARK'
  | 'PLAYLIST_ADD';

export type BaseAction =
  | 'LIKE'
  | 'SONG_PLAY_START'
  | 'SONG_PLAY_COMPLETE'
  | 'DWELL_10S';

const DEEP_VALUES: Record<DeepAction, number> = {
  SANCTUARY_SUBSCRIBE: 10,
  PITCH_DECK_CONVERT:   9,
  TIP_DONATION:         8,
  SEED_RAISER_CONTRIB:  7,
  PAY_IT_FORWARD:       6,
  BOOK_PURCHASE:        5,
};

const MEDIUM_VALUES: Record<MediumAction, number> = {
  FEDIVERSE_BROADCAST:  3.5,
  DM_SHARE:             3.0,
  LONG_COMMENT:         3.0,
  DEBATE_REPLY:         3.5,   // Debate reply scores higher than a standard long comment
  NATIVE_SHARE:         2.5,
  CLUB_SHARE:           2.5,
  BOOKMARK:             2.0,
  PLAYLIST_ADD:         2.0,
};

const BASE_VALUES: Record<BaseAction, number> = {
  LIKE:               1.0,
  SONG_PLAY_START:    1.5,
  SONG_PLAY_COMPLETE: 2.0,
  DWELL_10S:          1.0,     // hard cap: 6 events (60s max)
};

// ─── Interaction counters ─────────────────────────────────────────────────────

export interface PostInteractions {
  deep: Partial<Record<DeepAction, number>>;
  medium: Partial<Record<MediumAction, number>>;
  base: Partial<Record<BaseAction, number>>;
  // Distinct contributor tracking (for distributed-love D correction)
  deepContributorIds?: string[];      // unique UIDs who triggered a deep action
  dmSharerIds?: string[];             // unique UIDs who DM-shared
  // Debate signals
  commentAuthorIds?: string[];        // unique UIDs who left a long comment/reply
  creatorRepliedInThread?: boolean;   // creator personally engaged in their own thread
}

export const emptyInteractions = (): PostInteractions => ({
  deep: {}, medium: {}, base: {},
  deepContributorIds: [],
  dmSharerIds: [],
  commentAuthorIds: [],
});

// ─── D_dist — distributed-love corrected deep score ──────────────────────────
// Rewards breadth: 50 people × $1 > 1 person × $50

function aggregateDist(interactions: PostInteractions): number {
  const rawD = (Object.keys(interactions.deep) as DeepAction[])
    .reduce((sum, k) => sum + (interactions.deep[k] ?? 0) * DEEP_VALUES[k], 0);

  const uniqueContribs = interactions.deepContributorIds?.length ?? 1;
  // log(n+1) curve: 1 person → ×1.0, 10 → ×1.1, 50 → ×1.2, 100 → ×1.23
  const distributionBonus = Math.log(uniqueContribs + 1) / Math.log(10);

  return rawD * Math.max(1, distributionBonus);
}

function aggregateM(interactions: PostInteractions): number {
  return (Object.keys(interactions.medium) as MediumAction[])
    .reduce((sum, k) => sum + (interactions.medium[k] ?? 0) * MEDIUM_VALUES[k], 0);
}

function aggregateB(interactions: PostInteractions): number {
  return (Object.keys(interactions.base) as BaseAction[])
    .reduce((sum, k) => {
      const count = k === 'DWELL_10S'
        ? Math.min(interactions.base[k] ?? 0, 6)  // hard cap 60s
        : (interactions.base[k] ?? 0);
      return sum + count * BASE_VALUES[k];
    }, 0);
}

// ─── α_creator (creator amplifier) ───────────────────────────────────────────

export interface CreatorSignals {
  hasPaidSanctuaryMembers: boolean;
  hasActivePitchDeck: boolean;
  hasActiveFundraiser: boolean;
  isNewProjectLaunch: boolean;
  isFediverseConnected: boolean;
  isVerifiedIndependent: boolean;
}

export function computeCreatorAmplifier(signals: CreatorSignals): number {
  const boosts: number[] = [];

  if (signals.isNewProjectLaunch)     boosts.push(1.50);
  if (signals.hasActiveFundraiser)    boosts.push(1.40);
  if (signals.hasPaidSanctuaryMembers) boosts.push(1.25);
  if (signals.isVerifiedIndependent)  boosts.push(1.15);
  if (signals.hasActivePitchDeck)     boosts.push(1.10);
  if (signals.isFediverseConnected)   boosts.push(1.05);

  if (boosts.length === 0) return 1.0;
  boosts.sort((a, b) => b - a);
  const primary   = boosts[0];
  const secondary = boosts.slice(1).reduce((sum, v) => sum + (v - 1) * 0.5, 0);
  return Math.min(1.80, primary + secondary);
}

// ─── β_action (dwell-to-action dampener / word-of-mouth booster) ─────────────

export function computeActionQuality(interactions: PostInteractions): number {
  const sumD = Object.values(interactions.deep).reduce((s, n) => s + (n ?? 0), 0);
  const sumM = Object.values(interactions.medium).reduce((s, n) => s + (n ?? 0), 0);
  const sumB = Object.values(interactions.base).reduce((s, n) => s + (n ?? 0), 0);

  const dmSharerCount = interactions.dmSharerIds?.length ?? 0;
  if (dmSharerCount >= 3) return 1.15;  // organic word-of-mouth
  if (dmSharerCount >= 1) return 1.10;

  const ratio = (sumD + sumM) / Math.max(sumB, 1);
  if (ratio >= 0.3) return 1.00;
  if (ratio >= 0.1) return 0.85;
  if (sumD === 0 && sumM === 0) return 0.60;
  return 0.75;
}

// ─── γ (two-phase time decay) ─────────────────────────────────────────────────

function gammaForAge(ageHours: number): number {
  if (ageHours < 1)  return 0.4;
  if (ageHours < 6)  return 1.2;
  return 1.8;
}

// ─── δ_discovery (viewer-specific, client-only) ───────────────────────────────

export interface ViewerContext {
  followedAuthorIds: Set<string>;
  sharedSongChatAuthorIds: Set<string>;
  sharedClubAuthorIds: Set<string>;
}

export function computeDiscovery(authorId: string, ctx: ViewerContext): number {
  if (ctx.followedAuthorIds.has(authorId))        return 1.0;   // known — no boost
  if (ctx.sharedSongChatAuthorIds.has(authorId))  return 1.15;  // met in song chat
  if (ctx.sharedClubAuthorIds.has(authorId))      return 1.10;  // met in club
  return 1.08;  // complete stranger — small serendipity boost
}

// ─── ε_debate (discourse quality multiplier) ─────────────────────────────────
// Rewards real multi-voice discussion. Requires:
//   - At least 2 distinct commenters other than the post author
//   - At least 4 total long-comment/debate-reply events (back-and-forth signal)
//
// Extra multiplier if the creator joined and replied (skin in the game).

export interface DebateSignals {
  uniqueCommentAuthors: number;   // distinct UIDs who posted a long comment/reply
  totalDiscourseEvents: number;   // sum of LONG_COMMENT + DEBATE_REPLY counts
  creatorRepliedInThread: boolean;
}

export function computeDebateMultiplier(signals: DebateSignals): number {
  if (signals.uniqueCommentAuthors < 2 || signals.totalDiscourseEvents < 4) return 1.0;

  // Base debate bonus
  let epsilon = 1.15;

  // More voices → stronger signal (log-scaled, capped at 1.35)
  epsilon += Math.min(0.20, (signals.uniqueCommentAuthors - 2) * 0.025);

  // Creator engaged personally → adds credibility and depth
  if (signals.creatorRepliedInThread) epsilon += 0.10;

  return Math.min(1.35, epsilon);
}

// ─── Ω_whimsy (controlled serendipity) ───────────────────────────────────────
// Deterministic per (postId, viewerId, dayOfYear) — same value on every refresh
// for the same viewer on the same day, but varies across viewers and days.
// Every ~15 posts in a feed will have Ω ≥ 1.25 for SOME viewer — not the same post for all.
// This is the algorithm throwing a wild card.

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function computeWhimsy(postId: string, viewerId: string): number {
  const day = Math.floor(Date.now() / 86_400_000);  // day-of-epoch, stable within a day
  const seed = hashCode(`${postId}:${viewerId}:${day}`);

  // Normalize to [0, 1]
  const normalized = (seed % 10_000) / 10_000;

  // Most posts: Ω in [0.94, 1.06] — nearly neutral
  // ~7% of posts per viewer per day: Ω in [1.20, 1.35] — the wild card
  if (normalized > 0.93) {
    return 1.20 + (normalized - 0.93) / 0.07 * 0.15;  // 1.20–1.35
  }
  // ~5% of posts: slight downweight — not every surprise is good
  if (normalized < 0.05) {
    return 0.92 + normalized / 0.05 * 0.04;            // 0.92–0.96
  }
  // Middle 88%: gentle positive bias (slightly above 1.0 on average)
  return 0.97 + (normalized - 0.05) / 0.88 * 0.12;    // 0.97–1.09
}

// ─── Main feed score ──────────────────────────────────────────────────────────

export interface ScoreInput {
  interactions: PostInteractions;
  createdAt: number;
  creatorSignals: CreatorSignals;
  debateSignals?: DebateSignals;
  // Client-only (viewer-specific) — omit when writing to Firestore
  viewerCtx?: ViewerContext;
  authorId?: string;
  viewerId?: string;
}

export function computeFeedScore(input: ScoreInput): number {
  const { interactions, createdAt, creatorSignals, debateSignals, viewerCtx, authorId, viewerId } = input;

  const D = aggregateDist(interactions);
  const M = aggregateM(interactions);
  const B = aggregateB(interactions);

  const ageHours = (Date.now() - createdAt) / 3_600_000;
  const gamma    = gammaForAge(ageHours);

  const rawScore = (W_D * D + W_M * M + W_B * B) / Math.pow(ageHours + 1, gamma);

  const alpha   = computeCreatorAmplifier(creatorSignals);
  const beta    = computeActionQuality(interactions);
  const delta   = viewerCtx && authorId ? computeDiscovery(authorId, viewerCtx) : 1.0;
  const epsilon = debateSignals ? computeDebateMultiplier(debateSignals) : 1.0;
  const omega   = viewerId ? computeWhimsy(input.authorId ?? '', viewerId) : 1.0;

  return rawScore * alpha * beta * delta * epsilon * omega;
}

// ─── Advertising quality score ────────────────────────────────────────────────
// Ads run through the SAME engine as organic posts.
// Good creative earns cheaper inventory — bad creative is priced out.
//
// Ad-specific differences vs. organic scoring:
//   - No δ_discovery (ads are intentionally targeted, not discovered)
//   - No Ω_whimsy (ads should be consistent)
//   - α_creator is replaced by α_sponsor (brand signals)
//   - D is weighted by conversion quality, not just count
//   - A new "Quality Score" (QS 0–10) maps the final score to CPM pricing

export interface SponsorSignals {
  isContentPartner: boolean;    // Label / studio content partnership (vs. third-party)
  isCreatorSponsored: boolean;  // Sponsoring a specific creator (Sanctuary subsidy, Deck co-brand)
  isClubSponsor: boolean;       // Club presenting sponsor
  isSoundBar: boolean;          // Audio-only live chat sponsor (most native)
  isDiscoveryCard: boolean;     // Amplified δ_discovery slot
}

export interface AdInteractions {
  // Same action types, but ad-specific CTAs map to them
  clickThrough: number;         // maps to LIKE equivalent
  sanctuaryTrialStart: number;  // maps to SANCTUARY_SUBSCRIBE (brand-subsidized)
  dmShare: number;              // user DM-shared the ad (rare, extremely high signal)
  nativeShare: number;          // shared the ad organically
  longEngagement: number;       // spent >30s with the ad content (not just dwell)
  dismissals: number;           // explicit "not interested" — negative signal
  uniqueReachers: number;       // distinct UIDs who saw and didn't immediately dismiss
}

function computeSponsorAmplifier(signals: SponsorSignals): number {
  // Native ad units get placement advantages — they fit the platform's identity
  if (signals.isSoundBar)        return 1.40;   // most native
  if (signals.isDiscoveryCard)   return 1.30;   // algorithm-native
  if (signals.isCreatorSponsored) return 1.25;  // creator endorsement implied
  if (signals.isClubSponsor)     return 1.20;   // community trust
  if (signals.isContentPartner)  return 1.15;   // label/studio alignment
  return 1.0;  // generic third-party — no native advantage
}

export interface AdScoreInput {
  interactions: AdInteractions;
  createdAt: number;
  sponsorSignals: SponsorSignals;
  budgetRemaining: number;   // normalized 0–1 (1 = full budget, 0 = exhausted)
}

export interface AdQualityResult {
  rawScore: number;
  qualityScore: number;     // 0–10 (like Google's QS)
  cpmMultiplier: number;    // <1 = discount (good creative), >1 = premium (bad creative)
  shouldSuppress: boolean;  // high dismissal rate
}

export function computeAdScore(input: AdScoreInput): AdQualityResult {
  const { interactions: ai, createdAt, sponsorSignals } = input;

  // Penalize dismissals heavily — user actively rejected the content
  const dismissalRate = ai.dismissals / Math.max(ai.uniqueReachers, 1);
  const shouldSuppress = dismissalRate > 0.25;  // >25% dismiss rate → remove from rotation

  if (shouldSuppress) {
    return { rawScore: 0, qualityScore: 0, cpmMultiplier: 3.0, shouldSuppress: true };
  }

  // Map ad interactions to scoring buckets
  const engagement =
    ai.dmShare * 10 +          // someone DM-shared an ad — extremely rare, powerful signal
    ai.sanctuaryTrialStart * 9 +
    ai.nativeShare * 4 +
    ai.longEngagement * 2 +
    ai.clickThrough * 1;

  const ageHours = (Date.now() - createdAt) / 3_600_000;
  const gamma    = gammaForAge(ageHours);
  const alpha    = computeSponsorAmplifier(sponsorSignals);

  const rawScore = (engagement / Math.pow(ageHours + 1, gamma)) * alpha;

  // Quality score 0–10
  const engagementRate = (ai.clickThrough + ai.longEngagement) / Math.max(ai.uniqueReachers, 1);
  const qs = Math.min(10, Math.round(
    engagementRate * 50 +                        // base engagement rate
    (ai.dmShare > 0 ? 3 : 0) +                  // anyone shared the ad? +3
    (dismissalRate < 0.05 ? 2 : 0) +            // very low dismissal? +2
    (ai.sanctuaryTrialStart > 0 ? 2 : 0)        // converted? +2
  ));

  // CPM multiplier: QS 8–10 gets a 30–50% discount; QS 0–3 gets a 50–100% premium
  // This is the core incentive: make better ads, pay less
  const cpmMultiplier =
    qs >= 8 ? 0.5 + (10 - qs) * 0.1 :   // 0.5–0.7 (discount tier)
    qs >= 5 ? 0.8 + (7 - qs) * 0.1 :    // 0.8–1.0 (standard tier)
    1.0 + (5 - qs) * 0.3;               // 1.3–2.5 (penalty tier)

  return { rawScore, qualityScore: qs, cpmMultiplier, shouldSuppress: false };
}

// ─── Debate signal builder (called from comment recording logic) ──────────────

export function buildDebateSignals(interactions: PostInteractions): DebateSignals {
  return {
    uniqueCommentAuthors: interactions.commentAuthorIds?.length ?? 0,
    totalDiscourseEvents:
      (interactions.medium.LONG_COMMENT ?? 0) +
      (interactions.medium.DEBATE_REPLY ?? 0),
    creatorRepliedInThread: interactions.creatorRepliedInThread ?? false,
  };
}

// ─── Exported constants and labels ────────────────────────────────────────────

export const ACTION_LABELS: Record<DeepAction | MediumAction | BaseAction, string> = {
  SANCTUARY_SUBSCRIBE:  '+Sanctuary',
  PITCH_DECK_CONVERT:   '+Pitch',
  SEED_RAISER_CONTRIB:  '+Seed',
  TIP_DONATION:         '+Tip',
  PAY_IT_FORWARD:       '+Forward',
  BOOK_PURCHASE:        '+Book',
  FEDIVERSE_BROADCAST:  '+Fediverse',
  DM_SHARE:             '+DM Share',
  LONG_COMMENT:         '+Comment',
  DEBATE_REPLY:         '+Discussion',
  NATIVE_SHARE:         '+Share',
  CLUB_SHARE:           '+Club',
  BOOKMARK:             '+Saved',
  PLAYLIST_ADD:         '+Playlist',
  LIKE:                 '+Signal',
  SONG_PLAY_START:      '+Played',
  SONG_PLAY_COMPLETE:   '+Listened',
  DWELL_10S:            '+Dwell',
};

export { DEEP_VALUES, MEDIUM_VALUES, BASE_VALUES };
