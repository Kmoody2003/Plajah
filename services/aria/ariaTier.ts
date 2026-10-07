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

/** The owner's account — always full access so the experience can be tested over time. */
export const OWNER_EMAIL = 'kmoody2003@gmail.com';

export type VerifiedAgentTier = 'FREE' | 'PLAJAH_PLUS' | 'PRO';

export interface VerifiedFacts {
  /** From the verified token, never from the profile doc. */
  email?: string;
  emailVerified?: boolean;
  /** `admins/{uid}` exists. */
  isAdminDoc: boolean;
  /** An active/trialing Plajah+ subscription doc exists for this uid. */
  hasActiveSubscription: boolean;
  /** Comma-separated extra admin emails (env ARIA_VOICE_ADMIN_EMAILS). */
  extraAdminEmails?: string;
}

/** Owner (verified email) or a member of the server-managed admins collection. */
export function isVerifiedAdmin(f: Pick<VerifiedFacts, 'email' | 'emailVerified' | 'isAdminDoc' | 'extraAdminEmails'>): boolean {
  if (f.isAdminDoc) return true;
  const email = (f.email || '').trim().toLowerCase();
  if (!f.emailVerified || !email) return false;
  const admins = [OWNER_EMAIL, ...(f.extraAdminEmails || '').split(',')].map(s => s.trim().toLowerCase()).filter(Boolean);
  return admins.includes(email);
}

export function decideVerifiedAgentTier(f: VerifiedFacts): VerifiedAgentTier {
  if (isVerifiedAdmin(f)) return 'PRO';
  if (f.hasActiveSubscription) return 'PLAJAH_PLUS';
  return 'FREE';
}
