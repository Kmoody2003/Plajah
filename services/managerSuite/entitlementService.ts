// ─── Manager Suite — entitlement ─────────────────────────────────────────────
// Free-year clock starts the FIRST time a user opens the suite (per product
// decision). After the year, they drop to the FREE tier unless they hold a
// paid PRO plan. The Plajah+ subscription is separate; the suite's free year
// and Pro tier are deliberately additive to it.

import { doc, getDoc, setDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { hasActiveSubscription } from '../subscriptionService';
import {
  ManagerSuiteEntitlement, SuitePlan, SuiteLimits, SUITE_LIMITS, FREE_YEAR_MS,
} from './types';

const COLLECTION = 'managerSuiteEntitlements';
const USAGE_COLLECTION = 'managerSuiteUsage';

/**
 * Read the caller's entitlement, creating it on first call (this is the
 * "first opened the suite" moment that starts the free year).
 */
export async function activateAndGetEntitlement(): Promise<ManagerSuiteEntitlement | null> {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;

  const ref = doc(db, COLLECTION, uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    return snap.data() as ManagerSuiteEntitlement;
  }

  const now = Date.now();
  const entitlement: ManagerSuiteEntitlement = {
    uid,
    activatedAt: now,
    freeUntil: now + FREE_YEAR_MS,
    updatedAt: now,
  };
  // merge:true so a race can't clobber an existing activation
  await setDoc(ref, { ...entitlement, _serverActivatedAt: serverTimestamp() }, { merge: true });
  return entitlement;
}

/** Read-only fetch (does NOT activate). Returns null if never activated. */
export async function getEntitlement(uid: string): Promise<ManagerSuiteEntitlement | null> {
  const snap = await getDoc(doc(db, COLLECTION, uid));
  return snap.exists() ? (snap.data() as ManagerSuiteEntitlement) : null;
}

export interface PlanContext {
  /** Whether the user holds an active Plajah+ subscription. */
  hasPlajahPlus?: boolean;
}

/**
 * The effective plan right now. Pro is granted by ANY of:
 *   - the 12-month free year (from first opening the suite),
 *   - an explicit paid suite plan, or
 *   - an active Plajah+ subscription (the recommended monetization path —
 *     the suite is a headline Plajah+ benefit, not a separate charge).
 */
export function effectivePlan(
  ent: ManagerSuiteEntitlement | null,
  ctx: PlanContext = {},
  now = Date.now(),
): SuitePlan {
  if (ctx.hasPlajahPlus) return 'PRO';
  if (!ent) return 'FREE';
  if (ent.paidPlan === 'PRO') return 'PRO';
  if (now < ent.freeUntil) return 'PRO'; // free year grants Pro
  return 'FREE';
}

export function effectiveLimits(
  ent: ManagerSuiteEntitlement | null,
  ctx: PlanContext = {},
  now = Date.now(),
): SuiteLimits {
  return SUITE_LIMITS[effectivePlan(ent, ctx, now)];
}

/** Live Plajah+ check for the current user (used to resolve the plan). */
export async function currentUserHasPlajahPlus(): Promise<boolean> {
  const uid = auth.currentUser?.uid;
  if (!uid) return false;
  try { return await hasActiveSubscription(uid); } catch { return false; }
}

// ── AI-assist metering ────────────────────────────────────────────────────────
// The only variable cost in the suite. Tracked per user per calendar month so
// a heavy user can never run the platform into a per-user loss.

const monthKey = (d = new Date()) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

export async function getAiUsageThisMonth(): Promise<number> {
  const uid = auth.currentUser?.uid;
  if (!uid) return 0;
  const snap = await getDoc(doc(db, USAGE_COLLECTION, `${uid}_${monthKey()}`));
  return snap.exists() ? (snap.data().aiAssists || 0) : 0;
}

export interface AiQuotaStatus { used: number; limit: number; remaining: number; allowed: boolean }

export async function aiQuotaStatus(limits: SuiteLimits): Promise<AiQuotaStatus> {
  const used = await getAiUsageThisMonth();
  const limit = limits.aiAssistPerMonth;
  return { used, limit, remaining: Math.max(0, limit - used), allowed: used < limit };
}

/** Atomically record one AI assist; returns false if over the monthly cap. */
export async function recordAiAssist(limits: SuiteLimits): Promise<boolean> {
  const uid = auth.currentUser?.uid;
  if (!uid) return false;
  const ref = doc(db, USAGE_COLLECTION, `${uid}_${monthKey()}`);
  try {
    return await runTransaction(db, async tx => {
      const snap = await tx.get(ref);
      const used = snap.exists() ? (snap.data().aiAssists || 0) : 0;
      if (used >= limits.aiAssistPerMonth) return false;
      tx.set(ref, { uid, month: monthKey(), aiAssists: used + 1, updatedAt: Date.now() }, { merge: true });
      return true;
    });
  } catch {
    return false;
  }
}

export interface FreeYearStatus {
  inFreeYear: boolean;
  daysLeft: number;
  freeUntil: number | null;
}

export function freeYearStatus(ent: ManagerSuiteEntitlement | null, now = Date.now()): FreeYearStatus {
  if (!ent || ent.paidPlan === 'PRO') {
    return { inFreeYear: false, daysLeft: 0, freeUntil: ent?.freeUntil ?? null };
  }
  const inFreeYear = now < ent.freeUntil;
  return {
    inFreeYear,
    daysLeft: inFreeYear ? Math.ceil((ent.freeUntil - now) / (24 * 60 * 60 * 1000)) : 0,
    freeUntil: ent.freeUntil,
  };
}
