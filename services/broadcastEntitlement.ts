/**
 * Who can use Broadcast Out (simulcast / RTMP fan-out).
 *
 * Gated to the paid tiers by product decision: an active Plajah+ subscription OR a Business/Org
 * identity — the subscription IS the affordability control for the relay's usage cost. Mirrors the
 * established entitlement shape in services/contentHqEntitlements.ts (active statuses, org-by-identity)
 * so gating stays consistent across the platform rather than each feature inventing its own.
 *
 * This gates the UI + the push. It is NOT the security boundary — Firestore rules already restrict
 * broadcast_destinations reads/writes to the owner, and the relay (when it exists) re-checks server-side.
 */
import { fetchMySubscription } from './subscriptionService';
import type { UserProfile } from '../types';

const ACTIVE_STATUSES = ['active', 'trialing', 'past_due'];
/** accountType values that carry Business entitlement by virtue of the identity. */
const BUSINESS_ACCOUNT_TYPES = ['ORGANIZATION', 'BRAND'];

export interface BroadcastAccess {
  allowed: boolean;
  /** How access was granted (or why not) — drives the upsell copy. */
  via: 'plus' | 'business' | 'none';
}

export async function resolveBroadcastAccess(
  profile?: Pick<UserProfile, 'accountType'> | null,
): Promise<BroadcastAccess> {
  // Business / organization identities are entitled without a personal Plajah+ subscription.
  if (profile?.accountType && BUSINESS_ACCOUNT_TYPES.includes(profile.accountType)) {
    return { allowed: true, via: 'business' };
  }
  try {
    const sub = await fetchMySubscription();
    const active = !!sub && ACTIVE_STATUSES.includes((sub as any).status);
    return active ? { allowed: true, via: 'plus' } : { allowed: false, via: 'none' };
  } catch {
    return { allowed: false, via: 'none' };
  }
}
