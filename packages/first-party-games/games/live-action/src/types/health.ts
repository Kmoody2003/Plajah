/**
 * Health integration.
 *
 * Two paths with two different jobs:
 *
 *   Live play  → BLE Heart Rate Profile (GATT 0x180D) direct. Sub-second,
 *                identical across platforms, no companion app, no platform
 *                health permission.
 *   The record → HealthKit / Health Connect, written AFTER the session so a
 *                match shows up in the person's own health app beside their runs.
 *
 * Health Connect and HealthKit are records, not live feeds. Live watch sensors
 * require Wear OS Health Services or a watchOS HKWorkoutSession companion app,
 * neither of which Capacitor builds. Treat that as real scope, not a plugin.
 *
 * See ADR-0006. The load-bearing rule: vitals never affect who wins.
 */

import type { ParticipantId, ConsentId } from "./ids";

export type HealthSource = "ble" | "healthkit" | "healthconnect";

/** Named explicitly. Both platforms require declaring types and purpose. */
export type HealthType =
  | "heartRate"
  | "distanceWalkingRunning"
  | "activeEnergy"
  | "stepCount"
  | "restingHeartRate";

export type Retention = "session" | "30d" | "none";

export interface HealthConsent {
  id: ConsentId;
  participantId: ParticipantId;
  source: HealthSource;

  /** Explicit list. Never a wildcard — App Store and Play both ask why. */
  types: HealthType[];

  /** False means post-session summary only; no data flows during play. */
  liveIngest: boolean;

  /** The participant chooses. "none" is a real, supported option. */
  retention: Retention;

  grantedAt: string;
  revokedAt: string | null;
}

/**
 * What the match engine is allowed to see. Derived on device — a raw heart rate
 * never crosses the boundary, only which band it sits in.
 *
 * Windows are 15-30s because watch sensors sample around every 5 seconds. This is a
 * physical constraint, not a privacy preference; it is also why vitals could never
 * gate a trigger pull even if we wanted them to.
 */
export interface VitalsBand {
  participantId: ParticipantId;
  tWindow: string;

  /** Zone index only. 1 = resting, 5 = maximal. */
  effortBand: 1 | 2 | 3 | 4 | 5;

  distanceM: number;
  sprintCount: number;

  /** 0..100, computed on device from prior recovery. */
  readiness: number;

  /**
   * Structural reminder. Vitals feed a parallel progression — effort, streaks,
   * readiness — and never the scoreboard. Gating abilities on heart rate gates
   * them on owning a watch.
   */
  readonly affectsScoring: false;
}

/** Under-18 health ingest is off. COPPA plus restricted child-account HealthKit
 *  behaviour makes anything else a bad trade for a feature that is not load-bearing. */
export const MINOR_HEALTH_INGEST = "off" as const;
