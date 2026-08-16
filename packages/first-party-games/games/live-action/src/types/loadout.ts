/**
 * Weapons, skins and shields. See ADR-0009.
 *
 * The whole point of this file: the physical form is a cosmetic SKIN over a
 * server-resolved ARCHETYPE. A wand, a laser sword and a blaster are the same three
 * layers wearing different clothes. A skin never carries a stat — that is the line
 * that keeps creator-made weapon skins from becoming pay-to-win.
 */

import type { SkuId } from "./ids";

/** How a hit resolves, server-side. */
export type WeaponClass =
  /** Ray + cone + range against the survey. Blasters and wands. */
  | "ranged"
  /** Proximity + swing gesture. Blades. No-contact: resolution is spatial. */
  | "melee"
  /** A ranged class bound to an arena fixture (a turret), not a player device. */
  | "mounted"
  /** A shield: blocks incoming hits inside a facing arc while raised. */
  | "defensive";

/**
 * The balance unit. Archetypes are SIDEGRADES, not upgrades — a rock-paper-scissors
 * spread where none dominates. A dominant archetype is a bug (ADR-0009).
 */
export type WeaponArchetype =
  | "blaster"
  | "wand"
  | "blade"
  | "turret"
  | "shield";

/**
 * The cosmetic form. Never carries a stat. Rides the platform's existing content and
 * commerce rails — a creator authors a skin the same way they author any other asset.
 */
export interface WeaponSkin {
  id: string;
  /** Null for a stock skin; set when the form is a certified physical prop. */
  skuId: SkuId | null;
  displayName: string;
  /** Purely presentational: muzzle glow, blade colour, rune trail. No stats here. */
  vfx?: string;
}

export interface Weapon {
  class: WeaponClass;
  archetype: WeaponArchetype;
  skin: WeaponSkin;

  /**
   * Ranged only. A wand variant resolves a small area at the impact point instead of a
   * single ray — the one genuinely new resolution added by ADR-0009. Metres; 0 = a
   * single-target ray (a plain blaster).
   */
  splashRadiusM?: number;
}

export interface Loadout {
  primary: Weapon;
  /** Optional. A raised shield blocks a facing arc; it does not block a flank or a closer. */
  shield: Weapon | null;
}
