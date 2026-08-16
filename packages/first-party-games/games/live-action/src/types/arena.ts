/**
 * Spaces and their surveys.
 *
 * An Arena is a playable space. It hangs off either a Venue (operator-run, shared,
 * monetised) or a Household (parent-run, private, no payout path). That polymorphism
 * is the two-product fork made concrete — see ADR-0002.
 *
 * Geometry is immutable. Rearranging the furniture produces a new version; it never
 * mutates an existing one, because replays, hit adjudication and cover checks must
 * be reproducible against the geometry that was live at the time.
 */

import type {
  VenueId,
  HouseholdId,
  InstitutionId,
  AccountId,
  ArenaId,
} from "./ids";

/** Metres, arena-local origin. Y is up-plan, not up-world. */
export interface Point2 {
  x: number;
  y: number;
}

export interface Polygon {
  points: Point2[];
}

export interface Obstruction {
  id: string;
  shape: Polygon;
  /** Full-height walls block sight; a couch does not block a standing player. */
  heightM: number;
  label?: string;
}

export interface Anchor {
  id: string;
  at: Point2;
  /** UWB anchors are surveyed, never inferred from a phone walking past them. */
  kind: "uwb" | "ble";
  heightM: number;
}

export interface Objective {
  id: string;
  at: Point2;
  radiusM: number;
  label: string;
}

export interface Zone {
  id: string;
  /**
   * "revival" is the Dodge-mode sideline a frozen player is brought back from.
   * "powerup" is a Mario-Kart pad: rolling over it grants a temporary weapon, boost or
   * shield (ADR-0010). Reuses the zone system — no new mechanic.
   */
  shape: Polygon;
  role: "spawn" | "safe" | "out-of-play" | "revival" | "powerup";
  team?: string;
}

/**
 * A turret: a surveyed fixture hosting the `mounted` weapon class (ADR-0009). A player
 * occupies it — strong cone, no lock delay, stationary and exposed. In a venue it can be
 * wired, so overwatch's `door` verb can enable it (never fire it).
 */
export interface Station {
  id: string;
  at: Point2;
  headingRad: number;
  /** True where a venue has wired it, so overwatch can toggle its power. */
  wired: boolean;
}

/**
 * What a space can safely host (ADR-0010, arena-capabilities.md). Set by the operator's
 * survey, read-only to the game. A household leaves these off; a surveyed venue with a
 * marshal and an e-stop can turn them on. Vehicles are venue-only, enforced here.
 */
export interface ArenaCapabilities {
  melee: boolean;
  turrets: boolean;
  powerups: boolean;
  /** Venue-only. Requires UWB anchors, a marshal and the host e-stop. Never household. */
  vehicles: boolean;
}

/**
 * Reference to a stored point cloud used for visual relocalization.
 * For private arenas this never leaves the device; the ref is local-only.
 */
export interface VisualMapRef {
  provider: "arcore" | "arkit" | "arcore-geospatial";
  /** Local URI for private arenas, storage key for shared ones. */
  ref: string;
  capturedAt: string;
  /** Relocalization degrades badly as a room changes. Prompt a rescan past this. */
  staleAfterDays: number;
}

export type ArenaOwner =
  | { kind: "venue"; venueId: VenueId }
  | { kind: "household"; householdId: HouseholdId }
  /** School/org: operator-run like a venue, closed-graph like a household. ADR-0008. */
  | { kind: "institution"; institutionId: InstitutionId };

export interface Arena {
  id: ArenaId;
  owner: ArenaOwner;

  /** Bumped on any geometry change. Never edit a published version in place. */
  version: number;

  /** Walls indoors; a host-drawn boundary outdoors. */
  footprint: Polygon;
  obstructions: Obstruction[];
  zones: Zone[];
  objectives: Objective[];

  /** Empty for most households. Required for the gear tier's continuous tracking. */
  anchors: Anchor[];

  /** Surveyed turret fixtures. Empty unless capabilities.turrets is on. */
  stations: Station[];

  /** What this space may host. Households leave these off; see ADR-0010. */
  capabilities: ArenaCapabilities;

  /** Host-placed fairness fields (ADR-0011). Empty is fine; ranked ignores them. */
  balanceFields: import("./balance").BalanceField[];

  /** Absent disables the phone tier here — there is nothing to relocalize against. */
  visualMap: VisualMapRef | null;

  /**
   * True keeps geometry on the device and out of any sync. Households default true.
   * A private arena can never be listed, discovered or joined by a public session.
   */
  private: boolean;

  /**
   * Visual relocalization fails below usable light. Operators and hosts set this
   * during survey; false disables the phone tier for this arena rather than letting
   * players discover the failure mid-match.
   */
  lightingOk: boolean;

  /** Shown before every match. Stairs, glass, low ceiling, pond. */
  safetyNotes: string;

  surveyedBy: AccountId;
  surveyedAt: string;
}

/** How a given position fix was produced. Recorded on every hit. */
export type FixSource =
  | "vps" // visual relocalization — centimetre, but only at the moment of fix
  | "uwb" // continuous sub-metre, requires anchors and certified gear
  | "geo" // GNSS, outdoor only, metre-scale at best
  | "pdr"; // dead reckoning between fixes — degrades with time

export interface PositionFix {
  at: Point2;
  /** Radians, arena-local. Magnetometer alone is not trusted indoors. */
  headingRad: number;
  source: FixSource;
  /** 0..1. Drives cone width and can only ever weaken a shot, never strengthen it. */
  confidence: number;
  tServer: string;
}
