import { doc, updateDoc, increment } from 'firebase/firestore';
import { db } from './firebase';
import type { UserProfile } from '../types';

// ─────────────────────────────────────────────────────────────────────────
// Crossover free-tier usage. Free users get a capped number of conversions;
// admins/staff are unlimited. The counter lives on the user doc
// (`users/{uid}.crossoverConversions`) so client and server share one source of
// truth (the live profile listener keeps the UI in sync).
//
// Plajah+ unlimited is a FUTURE step: when added, OR `hasPlus` into `unlimited`
// HERE and in the server enforcement together so the two stay consistent.
// ─────────────────────────────────────────────────────────────────────────

export const FREE_CONVERSION_LIMIT = 3;

export interface ConversionAllowance {
  unlimited: boolean;
  used: number;
  limit: number;
  remaining: number;
  allowed: boolean;
}

export function isCrossoverAdmin(profile?: UserProfile | null): boolean {
  return profile?.role === 'admin' || profile?.role === 'staff';
}

export function conversionAllowance(profile?: UserProfile | null): ConversionAllowance {
  const unlimited = isCrossoverAdmin(profile);
  const used = Math.max(0, profile?.crossoverConversions ?? 0);
  const limit = FREE_CONVERSION_LIMIT;
  const remaining = unlimited ? Infinity : Math.max(0, limit - used);
  return { unlimited, used, limit, remaining, allowed: unlimited || used < limit };
}

/** Count a browser-side conversion. Server conversions are counted server-side,
 *  so the caller should only invoke this for client-backend results. */
export async function recordClientConversion(uid: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'users', uid), { crossoverConversions: increment(1) });
  } catch {
    // Best-effort — the profile listener reconciles the authoritative count.
  }
}
