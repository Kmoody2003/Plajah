// services/genCloud/tiers.ts — who may use which lane, and what each tier grants monthly. Pure.
//
// Owner direction (2026-11-08): local AI is free and unlimited everywhere; cloud models sit at the
// higher Plajah+ tiers plus add-on credit packs. Rule as implemented (change here, nowhere else):
//   • standard lane: Glow and up — or any account holding pack credits;
//   • premium lane: Nova and up (packs top them up, they don't unlock premium);
//   • adult-only engines: verified 18+ accounts only; never on minor / class accounts.

import type { Engine, Lane } from './types';

export type PlanId = 'free' | 'spark' | 'glow' | 'nova' | 'all_access' | 'studio_max' | 'studio_team' | 'production_house';

export interface PlanGrant {
  monthlyCredits: number;
  /** Months unused monthly credits survive (0 = expire at renewal). */
  rolloverMonths: number;
  lanes: Lane[];
  /** Seats sharing one pool (team plans). */
  seats: number;
}

export const PLAN_GRANTS: Record<PlanId, PlanGrant> = {
  free:             { monthlyCredits: 0,     rolloverMonths: 0, lanes: [],                      seats: 1 },
  spark:            { monthlyCredits: 0,     rolloverMonths: 0, lanes: [],                      seats: 1 },
  glow:             { monthlyCredits: 80,    rolloverMonths: 1, lanes: ['standard'],            seats: 1 },
  nova:             { monthlyCredits: 200,   rolloverMonths: 1, lanes: ['standard', 'premium'], seats: 1 },
  all_access:       { monthlyCredits: 800,   rolloverMonths: 2, lanes: ['standard', 'premium'], seats: 1 },
  studio_max:       { monthlyCredits: 6000,  rolloverMonths: 3, lanes: ['standard', 'premium'], seats: 1 },
  studio_team:      { monthlyCredits: 20000, rolloverMonths: 3, lanes: ['standard', 'premium'], seats: 5 },
  production_house: { monthlyCredits: 30000, rolloverMonths: 3, lanes: ['standard', 'premium'], seats: 15 },
};

/** Monthly credits never pile up past this many months' worth. */
export const ROLLOVER_CAP_MONTHS = 3;

export interface AccountFacts {
  plan: PlanId;
  /** Unexpired pack credits on the account. */
  packCredits: number;
  verifiedAdult: boolean;
  /** Minor, class or school-managed account. */
  restricted: boolean;
}

export type AccessDenial = 'restricted_account' | 'adult_only' | 'lane_locked';

export function canUseEngine(e: Engine, a: AccountFacts): { ok: true; reason?: undefined; upgradeTo?: undefined } | { ok: false; reason: AccessDenial; upgradeTo?: PlanId } {
  if (a.restricted && (e.kind === 'video' || e.adultOnly)) return { ok: false, reason: 'restricted_account' };
  if (e.adultOnly && !a.verifiedAdult) return { ok: false, reason: 'adult_only' };
  const lanes = PLAN_GRANTS[a.plan].lanes;
  if (lanes.includes(e.lane)) return { ok: true };
  if (e.lane === 'standard' && a.packCredits > 0) return { ok: true };
  return { ok: false, reason: 'lane_locked', upgradeTo: e.lane === 'premium' ? 'nova' : 'glow' };
}
