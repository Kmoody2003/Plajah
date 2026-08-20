// ─── Manager Suite — type layer ──────────────────────────────────────────────
// The "Studio" — a Hootsuite/Buffer-class publishing, scheduling and analytics
// suite that sits on top of the existing fediverse cross-posting engine
// (services/fediverse) and the on-platform feed. Free for everyone for the
// first 12 months from the moment they first open the suite; a free tier
// remains after, with a Pro tier whose limits exceed Plajah+.

import type { FediverseProtocol } from '../fediverse/types';

// A target channel is either a connected fediverse account or the Plajah feed.
export type SuiteChannelKind = FediverseProtocol | 'plajah';

export type ScheduledPostStatus =
  | 'DRAFT'        // saved, no send time
  | 'SCHEDULED'    // has a future scheduledAt, waiting for the publisher
  | 'PUBLISHING'   // publisher picked it up (claim lock)
  | 'PUBLISHED'    // all targets succeeded
  | 'PARTIAL'      // some targets succeeded, some failed
  | 'FAILED';      // all targets failed

export interface ScheduledPostTargetResult {
  channelKind: SuiteChannelKind;
  accountId?: string;       // fediverse account id (undefined for 'plajah')
  ok: boolean;
  postUrl?: string;
  error?: string;
}

/** Which managed identity a scheduled post belongs to. CREATOR = the signed-in
 *  operator themselves; BUSINESS/ORG = a page/org the operator manages. */
export type ScheduledPostOwnerKind = 'CREATOR' | 'BUSINESS' | 'ORG';

export interface ScheduledPost {
  id: string;
  /** The managed identity this post belongs to. For a personal (CREATOR) queue
   *  this is the operator's uid; for a business/org queue it's that identity's id.
   *  The Firestore document itself always lives under the OPERATING user's subtree
   *  (users/{operatorUid}/scheduledPosts) — the only place per-user rules permit a
   *  write — so ownerId is the logical partition key, not the storage path. */
  ownerId: string;
  /** Kind of the owning identity (defaults to CREATOR when absent). */
  ownerKind?: ScheduledPostOwnerKind;
  /** When the Plajah-feed copy should be attributed to a business/org rather than
   *  the operator, the identity id to post as (reuses createPost's authorOrgId).
   *  Consumed client-side on immediate publish; the server cron publisher should
   *  honor it too (server-side change tracked separately). */
  authorOrgId?: string;
  text: string;
  /** Public media URLs (already uploaded to Plajah storage). */
  mediaUrls: string[];
  /** Optional link to attach (builds the link card on networks that support it). */
  linkUri?: string;
  linkTitle?: string;
  linkDescription?: string;
  /** Fediverse account ids to post to. */
  targetAccountIds: string[];
  /** Also publish to the Plajah on-platform feed. */
  alsoPostToPlajah: boolean;
  /** Epoch ms. null/undefined for a draft. */
  scheduledAt?: number;
  /** IANA timezone the user scheduled in, e.g. "America/New_York". */
  timezone?: string;
  status: ScheduledPostStatus;
  results?: ScheduledPostTargetResult[];
  /** Human-readable outcome summary written by the server publisher (kept as a
   *  scalar so the REST cron path doesn't have to encode nested arrays). */
  publishLog?: string;
  lastAttemptAt?: number;
  createdAt: number;
  updatedAt: number;
  /** Set when the publisher claims the post, to avoid double-sends. */
  claimedAt?: number;
}

// ─── Entitlement ──────────────────────────────────────────────────────────────

export type SuitePlan = 'FREE' | 'PRO';

export interface ManagerSuiteEntitlement {
  uid: string;
  /** When the user first opened the suite (free-year clock start). */
  activatedAt: number;
  /** activatedAt + 365 days. While now < freeUntil, the user has PRO for free. */
  freeUntil: number;
  /** Explicit paid plan, independent of the free year. */
  paidPlan?: SuitePlan;
  updatedAt: number;
}

export interface SuiteLimits {
  /** Max connected social channels. */
  maxChannels: number;
  /** Max posts that can sit scheduled in the queue at once. */
  maxScheduledPosts: number;
  /** Days of analytics history retained/visible. */
  analyticsHistoryDays: number;
  /** AI caption/best-time assists allowed per calendar month (0 = none).
   *  This is the ONE real variable cost (Gemini/Anthropic calls), so it is
   *  metered rather than a boolean — the cap is what guarantees no per-user loss. */
  aiAssistPerMonth: number;
  /** May connect paid/approval-gated networks (X, YouTube). Free tier is
   *  limited to the zero-marginal-cost networks. */
  premiumNetworks: boolean;
  /** Bulk CSV upload / bulk scheduling. */
  bulkScheduling: boolean;
}

// Free tier is intentionally generous; Pro (free year, or via Plajah+) goes
// beyond it. The AI cap is the only knob protecting per-user margin.
export const SUITE_LIMITS: Record<SuitePlan, SuiteLimits> = {
  FREE: { maxChannels: 3,  maxScheduledPosts: 10,  analyticsHistoryDays: 30,  aiAssistPerMonth: 0,   premiumNetworks: false, bulkScheduling: false },
  PRO:  { maxChannels: 25, maxScheduledPosts: 1000, analyticsHistoryDays: 730, aiAssistPerMonth: 300, premiumNetworks: true,  bulkScheduling: true  },
};

export const FREE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
