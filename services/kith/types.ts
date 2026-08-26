/**
 * Kith Sightings — shared types.
 *
 * Chora and Reello turn up rarely on surfaces that suit them. The user gets one
 * chance to log the sighting: 10 points, an entry in their Field Log, and an
 * achievement at 1 / 10 / 50 / 100.
 *
 * The whole feature rests on one rule: **the client never decides that a
 * sighting happened.** The server decides, writes the sighting doc, and hands
 * back only an id. See routes/kithSightings.ts for the authority side.
 *
 * NOTE: Kith (the game) is admin-gated and its identity is embargoed. Sightings
 * are the only public acknowledgement — do not surface the wordmark, the roster
 * or any explanation of what a kith *is* from these surfaces.
 */

/** The two starter kith. Both Ember-type; they differ by discipline. */
export type KithMascot = 'CHORA' | 'REELLO';

export type KithSightingStatus = 'ACTIVE' | 'CLAIMED' | 'EXPIRED';

/**
 * A spawn, written server-side. The client is given `id` and nothing else that
 * matters — `mascot` and `surface` are echoed for rendering, but the copies that
 * get logged are read back off this document at claim time, never from the
 * claim request. That is what stops a caller from forging where or when.
 */
export interface KithSighting {
  id: string;
  userId: string;
  mascot: KithMascot;
  /** AppView the sighting was spawned on, captured at spawn, trusted thereafter. */
  surface: string;
  spawnedAt: number;
  expiresAt: number;
  status: KithSightingStatus;
  claimedAt?: number;
  /** Deterministic window this spawn belongs to — refresh cannot produce a new one. */
  windowKey: string;
  /** True when minted by the kids-mode guaranteed-daily path rather than the random roll. */
  guaranteed?: boolean;
}

/** Per-user counters and cooldown state. Server-owned. */
export interface KithHunterState {
  userId: string;
  /** Lifetime logged sightings. Drives achievement thresholds. */
  total: number;
  /** UTC-offset day key (YYYY-MM-DD) the daily counter belongs to. */
  dayKey: string;
  dayCount: number;
  lastSpawnAt: number;
  lastClaimAt: number;
  /** Day key on which the kids-mode guaranteed sighting was already granted. */
  kidsDayKey?: string;
  updatedAt: number;
}

/** One row in the Field Log — the collectible journal on the profile. */
export interface KithSightingLogEntry {
  id: string;
  sightingId: string;
  mascot: KithMascot;
  surface: string;
  at: number;
}

/** Response from the spawn check. `sighting` is absent when nothing is due. */
export interface KithSpawnResponse {
  sighting: {
    id: string;
    mascot: KithMascot;
    surface: string;
    expiresAt: number;
  } | null;
  /** Sightings remaining today, so the UI can say so and kill the infinite hunt. */
  remainingToday: number;
}

export interface KithClaimResponse {
  ok: true;
  mascot: KithMascot;
  surface: string;
  at: number;
  pointsAwarded: number;
  total: number;
  /** Thresholds crossed by this claim, e.g. ['KITH_SIGHTING_FIRST']. */
  unlocked: KithAchievementTrigger[];
  /** True when this exact sighting had already been claimed — the call is idempotent. */
  alreadyClaimed?: boolean;
}

export type KithAchievementTrigger =
  | 'KITH_SIGHTING_FIRST'
  | 'KITH_SIGHTING_10'
  | 'KITH_SIGHTING_50'
  | 'KITH_SIGHTING_100';

/** Cumulative thresholds, ascending. Shared by server (mint) and client (display). */
export const KITH_ACHIEVEMENT_TIERS: ReadonlyArray<{
  trigger: KithAchievementTrigger;
  count: number;
  title: string;
  description: string;
}> = [
  { trigger: 'KITH_SIGHTING_FIRST', count: 1,   title: 'First Sighting', description: 'You saw something.' },
  { trigger: 'KITH_SIGHTING_10',    count: 10,  title: 'Field Notes',    description: 'A pattern emerges.' },
  { trigger: 'KITH_SIGHTING_50',    count: 50,  title: 'Tracker',        description: 'You know their habits.' },
  { trigger: 'KITH_SIGHTING_100',   count: 100, title: 'Kith-Kenner',    description: 'They trust you now.' },
] as const;

export const KITH_POINTS_PER_SIGHTING = 10;
