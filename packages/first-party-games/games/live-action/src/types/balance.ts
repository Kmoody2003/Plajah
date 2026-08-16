/**
 * Balance Fields — the environmental fairness layer for mixed casual lobbies.
 * See ADR-0011 and docs/balance-fields.md.
 *
 * The whole point: cross-tier fairness is legible geometry plus visible fields, tuned by
 * the host — never a stat inversion, never invisible RNG, and always downgrade-only (a
 * modifier widens forgiveness or reduces precision, it never escalates a hit).
 */

import type { PlayTier } from "./session";
import type { Polygon } from "./arena";

export type BalanceFieldKind =
  /** Widens a phone-only player's forgiveness cone. Offensive evener. */
  | "aim-aura"
  /** Adds scatter to precise (gear) shots. The "wind shear". Reins in the laser. */
  | "shear"
  /** Light damage-soak / post-hit grace for phone players. Defensive evener. */
  | "bubble";

/**
 * A field attaches either to every player of a tier, or to a zone of the arena.
 * Host-placed, visible in play, and only active in casual (see FairnessConfig).
 */
export type FieldTarget =
  | { kind: "tier"; tier: PlayTier }
  | { kind: "zone"; area: Polygon };

export interface BalanceField {
  id: string;
  kind: BalanceFieldKind;
  target: FieldTarget;

  /**
   * 0..1. Scaled by the session Fairness dial at resolve time. Strength only ever
   * widens forgiveness or reduces precision — it cannot escalate a hit.
   */
  strength: number;

  /** Shown to players. Fairness is never a hidden mechanic. */
  visible: true;
}

/**
 * Host tuning for a lobby. Inert when the session is ranked (single-tier, so there is
 * nothing to compensate) — ranked forces `strength` to 0.
 */
export interface FairnessConfig {
  /** 0 = raw tiers, 1 = fully evened. Casual default ~0.5. */
  strength: number;
  /** Per-field kill switches, so a host can keep aura but drop shear, etc. */
  enabled: Record<BalanceFieldKind, boolean>;
}
