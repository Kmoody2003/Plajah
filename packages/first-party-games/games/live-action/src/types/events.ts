/**
 * Match events. Both tables are append-only and server-authoritative.
 *
 * The important thing about this file is what is NOT in it: OverwatchAction has no
 * damage field and no relationship to scoring. That is the mechanism by which a
 * remote player cannot hollow out the physical game — an absent relationship rather
 * than a balance number sitting in config waiting to be tuned up. See ADR-0001.
 */

import type {
  EventId,
  SessionId,
  ParticipantId,
  ObstructionId,
  ZoneId,
  DoorId,
} from "./ids";
import type { FixSource } from "./arena";
import type { WeaponClass, WeaponArchetype } from "./loadout";

/**
 * The only record that changes a score.
 *
 * Clients propose, the server disposes. A blaster reports a trigger pull and a
 * time-of-flight; the engine decides whether it landed, using the arena survey for
 * the cover check. Without this, the first modded firmware ends the game for
 * everyone — and cross-tier play is the whole design.
 */
export interface HitEvent {
  id: EventId;
  sessionId: SessionId;

  /** Authoritative clock. Client timestamps are advisory only. */
  tServer: string;

  /** Must have role "operative". Overwatch has no path to this table. */
  shooterId: ParticipantId;

  /** Null is a miss. Misses are still logged — they are half the telemetry. */
  targetId: ParticipantId | null;

  source: FixSource;

  /**
   * 0..1. Low confidence downgrades a hit; it never escalates one. A shot taken on
   * a stale fix should not be able to out-resolve one taken on a fresh fix.
   */
  confidence: number;

  /**
   * Which class and archetype resolved this hit (ADR-0009). The physical skin is
   * cosmetic and is deliberately NOT here — it can never change how a hit resolved.
   */
  weaponClass: WeaponClass;
  weaponArchetype: WeaponArchetype;

  /** The cover check ran against the survey and said no. */
  losBlockedBy: ObstructionId | null;

  /** The target had a shield raised toward the shooter's bearing. A non-null is a block. */
  shieldBlocked: boolean;

  /**
   * The cone half-angle this shot actually resolved against, after device tier, fix
   * confidence and any Balance Fields (ADR-0011). Recording it makes a contested call
   * explainable and a replay deterministic — fairness is never a hidden mechanic.
   */
  effectiveSpreadRad: number;

  /** The Balance Field that shaped this shot, if any. Null when no field applied. */
  fieldModifierId: string | null;

  /**
   * Seconds since the shooter's last true position fix. On the phone tier this
   * climbs while the phone is lowered, which is what makes going dark a real
   * tradeoff: you are harder to find and worse at shooting.
   */
  secSinceFix: number;
}

/**
 * What overwatch can do. Deliberately a small verb set — a large one turns the
 * remote player into a narrator who plays the match on everyone else's behalf.
 */
export type OverwatchVerb =
  /** Reveal a known enemy position to the team. Decays. */
  | "ping"
  /** Open or lock a door the venue has wired. Venue arenas only. */
  | "door"
  /** Call or contest an objective, granting a capture bonus. */
  | "objective"
  /** Temporarily suppress the other team's own overwatch feed. */
  | "jam";

export interface OverwatchAction {
  id: EventId;
  sessionId: SessionId;

  /** Must have role "overwatch". Enforce at write time, not at read time. */
  actorId: ParticipantId;

  kind: OverwatchVerb;
  targetRef: ParticipantId | ZoneId | DoorId;

  tServer: string;

  /**
   * Milliseconds before this decays. Intel goes stale — a ping is a snapshot, not
   * a tracker, otherwise the on-site players stop looking and start following.
   */
  ttlMs: number;

  /** Shared cooldown bucket. Prevents an overwatch player from acting continuously. */
  cooldownGroup: string;
}

/**
 * Compile-time guard. If someone adds damage to OverwatchAction, this fails.
 * Deliberate: the constraint should break the build, not a play session.
 */
type _NoDamageOnOverwatch = OverwatchAction extends { damage: unknown }
  ? never
  : true;
export const OVERWATCH_CANNOT_DAMAGE: _NoDamageOnOverwatch = true;
