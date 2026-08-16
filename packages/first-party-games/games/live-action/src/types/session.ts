/**
 * Sessions, participants, roles and tiers.
 *
 * Three fields here carry the entire trust model: Session.visibility,
 * Session.ageTier and Participant.role. Read ADR-0001 (overwatch cannot fire),
 * ADR-0002 (two products) and ADR-0004 (casual mixed, ranked tier-locked) before
 * changing any of them.
 */

import type {
  ArenaId,
  SessionId,
  ParticipantId,
  AccountId,
  DeviceId,
  TeamId,
  ConsentId,
} from "./ids";
import type { Polygon } from "./arena";
import type { Loadout } from "./loadout";
import type { FairnessConfig } from "./balance";

/** Public sessions only. Household sessions carry null — the roster is the tier. */
export type AgeTier = "under13" | "teen" | "adult";

export type SessionVisibility =
  /** Discoverable and matchmade. Age-tiered. Venue only. */
  | "public"
  /** Invite code. Age-tiered. Venue or household. */
  | "party"
  /** Closed household roster. Never discoverable. Age tiering does not apply. */
  | "household"
  /** Closed class roster, teacher-operated. Never discoverable. ADR-0008. */
  | "institution";

export type SessionState = "draft" | "open" | "live" | "settled" | "abandoned";

export interface Session {
  id: SessionId;
  arenaId: ArenaId;

  visibility: SessionVisibility;

  /**
   * Null if and only if visibility is closed-graph ("household" or "institution"),
   * where the roster is the tier. Non-null exactly for age-tiered public play.
   * Immutable once the session leaves draft — there is no code path, including admin
   * tooling, that edits this on a live session. See ADR-0008.
   */
  ageTier: AgeTier | null;

  mode: string;

  /**
   * True forces every operative participant to share one tier. Casual (false)
   * allows mixed tiers with balancing. See ADR-0004.
   */
  ranked: boolean;

  /**
   * How a mixed casual lobby is evened, tuned by the host (ADR-0011). Inert when
   * ranked — a single-tier session forces fairness strength to 0.
   */
  fairness: FairnessConfig;

  /** Floor capacity — operatives physically present. */
  capacity: number;

  /** Overwatch capacity. Independent of floor capacity, and that is the point: a
   *  six-person floor can run a fourteen-person match. */
  remoteSlots: number;

  /**
   * Host-declared play boundary. Required for household sessions outside a building.
   * Crossing it removes the participant from the match and alerts the host.
   */
  boundary: Polygon | null;

  priceCents: number;
  state: SessionState;

  createdBy: AccountId;
  startsAt: string;
}

export type ParticipantRole =
  /** On site, resolves hits, can be eliminated. */
  | "operative"
  /** Remote or on site. Directs. Cannot fire — enforced structurally, see ADR-0001. */
  | "overwatch"
  /** The accountable adult. Supervision surface, not a competitor. */
  | "host";

/**
 * Fidelity, never advantage — except in ranked, where a session is single-tier.
 * Null only for overwatch, which never resolves a position or a hit.
 */
export type PlayTier = "phone" | "gear" | "mr" | null;

export type Presence = "onsite" | "remote";

export interface Participant {
  id: ParticipantId;
  sessionId: SessionId;
  accountId: AccountId;

  role: ParticipantRole;
  tier: PlayTier;

  /** "remote" is only valid with role "overwatch". Enforce at the boundary. */
  presence: Presence;

  team: TeamId;

  /** Certified gear bound for this session only. Empty on the phone tier. */
  deviceIds: DeviceId[];

  /**
   * Absent is a valid, fully playable state. No vitals are ingested without it, and
   * nothing about the match changes. Always null for under-18 — see ADR-0006.
   */
  healthConsent: ConsentId | null;

  /**
   * Milliseconds a phone-tier player must hold a target before the shot resolves.
   * Zero on the gear tier. This is the upgrade argument, felt rather than read:
   * a gear player pulls and it is gone; a phone player stands exposed for most of
   * a second. Tuning this is tuning the entire hardware incentive.
   */
  lockMs: number;

  /** Phone tier cannot fire while sprinting. Gear carries its own tracking. */
  canFireWhileMoving: boolean;

  /**
   * Weapon class + archetype are server-side balance; the skin is cosmetic. See
   * ADR-0009. Overwatch has no loadout — it never resolves a hit.
   */
  loadout: Loadout | null;

  /**
   * Set only when the player occupies a vehicle (venue arenas with the capability, see
   * ADR-0010). A Warthog crew shares one deviceId across a "driver" and a "gunner" seat;
   * the driver has no turret, the gunner works the mounted weapon. Null = on foot.
   */
  vehicle: { deviceId: DeviceId; seat: "driver" | "gunner" } | null;
}
