/**
 * The certification programme, made concrete.
 *
 * Plajah does not manufacture. Licensees carry tooling, ASTM F963, FCC/CE, freight,
 * returns and recalls. Plajah publishes the protocol, runs certification, owns the
 * badge, and takes a per-SKU fee plus a cut of sessions played on certified gear.
 * Zero hardware margin, zero hardware risk. See ADR-0005.
 */

import type { DeviceId, SkuId, PartnerId, AccountId } from "./ids";

export type DeviceKind =
  | "blaster"
  | "vest"
  | "anchor"
  | "wearable"
  /** A wand prop — a `ranged` skin (ADR-0009). Same cert path as a blaster. */
  | "wand"
  /** A blade prop — a `melee` skin. Soft, no rigid core (the no-contact rule). */
  | "blade"
  /** A carried shield — a `defensive` skin. */
  | "shield"
  /** A wired or toy-tier turret station — the `mounted` class. */
  | "turret"
  /** A governed, certified vehicle. Venue-only, ADR-0010. */
  | "vehicle";

export interface CertifiedSku {
  id: SkuId;
  manufacturerId: PartnerId;
  kind: DeviceKind;
  displayName: string;

  /** Protocol revision this SKU passed against. A 2027 blaster must still work in
   *  a 2029 arena, which is why the version is on the retail box. */
  certVersion: string;
  certifiedAt: string;

  /** Kill switch at the SKU level. One bad batch does not require chasing units. */
  revokedAt: string | null;
}

export interface CertifiedDevice {
  id: DeviceId;
  skuId: SkuId;

  /** Hardware-rooted. No attestation, no session — this is the anti-spoof boundary. */
  attestKeyId: string;

  /** Null means unbound: venue rental stock, handed to a walk-in. */
  ownerAccountId: AccountId | null;

  firmwareVersion: string;
  revokedAt: string | null;
}

/** Physical safety requirements the spec imposes on every licensee. */
export interface PhysicalSpec {
  /** Fraction of exposed surface that must be in the marking colour. */
  minMarkingColourRatio: number;
  /** Finishes that cannot be certified at all. */
  forbiddenFinishes: readonly ["black", "grey", "metallic"];
  /** Silhouette must fail a weapon-likeness review at this distance, in poor light. */
  silhouetteReviewDistanceM: 50;
  maxMuzzleEnergyJ: number;
  minAgeMarking: number;
}

/** Extra requirements for a `blade` skin — the no-contact rule made physical (ADR-0009). */
export interface MeleeSpec {
  /** Soft throughout. A rigid internal core cannot be certified. */
  rigidCoreForbidden: true;
  /** The prop is a skin; contact is never how a hit resolves. */
  maxTipHardnessShoreA: number;
}

/**
 * Extra requirements for a certified `vehicle` (ADR-0010). Venue-only, and the highest-
 * liability SKU in the programme — certified conservatively, insured by the licensee.
 */
export interface VehicleSpec {
  maxSpeedMps: number;
  /** A hardware kill the host console triggers to halt every vehicle at once. */
  hostEStop: true;
  rollProtection: boolean;
  minRiderHeightCm: number;
  minAgeMarking: number;
}
