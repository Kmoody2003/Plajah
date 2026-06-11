// ─── Manager Suite — entitlement ─────────────────────────────────────────────
// Free-year clock starts the FIRST time a user opens the suite (per product
// decision). After the year, they drop to the FREE tier unless they hold a
// paid PRO plan. The Plajah+ subscription is separate; the suite's free year
// and Pro tier are deliberately additive to it.

import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import {
  ManagerSuiteEntitlement, SuitePlan, SuiteLimits, SUITE_LIMITS, FREE_YEAR_MS,
} from './types';

const COLLECTION = 'managerSuiteEntitlements';

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

/** The effective plan right now, accounting for the free year. */
export function effectivePlan(ent: ManagerSuiteEntitlement | null, now = Date.now()): SuitePlan {
  if (!ent) return 'FREE';
  if (ent.paidPlan === 'PRO') return 'PRO';
  if (now < ent.freeUntil) return 'PRO'; // free year grants Pro
  return 'FREE';
}

export function effectiveLimits(ent: ManagerSuiteEntitlement | null, now = Date.now()): SuiteLimits {
  return SUITE_LIMITS[effectivePlan(ent, now)];
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
