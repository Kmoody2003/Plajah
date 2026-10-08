/**
 * ariaTier.ts — SERVER-SIDE entitlement for Aria. Pure decision logic, no I/O.
 *
 * Why this exists: Aria's chat and council routes used to take `tier` from the request
 * body, so any signed-in user could send tier:"PRO" and get the PRO daily cap, web-search
 * budget and reasoning budget. The tier is now derived here from sources a client cannot
 * write:
 *   • the verified ID-token email (owner account only, and only when emailVerified)
 *   • the `admins/{uid}` collection  (no client rule → default-deny → server/console only)
 *   • `plajahPlusSubscriptions`      (written by the Stripe webhook; no client rule)
 *
 * It deliberately does NOT read users/{uid}.role, .tier or .accountType: the users
 * profile is owner-writable (firestore.rules only protects teacherVerification), so
 * those fields are self-asserted and prove nothing.
 */

import { OWNER_EMAIL, isVerifiedAdmin, type AdminFacts } from '../platformAdmin';

// Platform-admin identity lives in services/platformAdmin.ts; re-exported for existing importers.
export { OWNER_EMAIL, isVerifiedAdmin };

export type VerifiedAgentTier = 'FREE' | 'PLAJAH_PLUS' | 'PRO';

export interface VerifiedFacts extends AdminFacts {
  /** An active/trialing Plajah+ subscription doc exists for this uid. */
  hasActiveSubscription: boolean;
}

export function decideVerifiedAgentTier(f: VerifiedFacts): VerifiedAgentTier {
  if (isVerifiedAdmin(f)) return 'PRO';
  if (f.hasActiveSubscription) return 'PLAJAH_PLUS';
  return 'FREE';
}
