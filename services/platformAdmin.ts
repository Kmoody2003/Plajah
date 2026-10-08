/**
 * platformAdmin.ts — who is a PLATFORM admin. Pure, no I/O.
 *
 * Platform admin = the owner and designated staff, nobody else. It is NOT an organization
 * or business role: org admins/pastors/managers (organizations/{id}.admins, orgMemberships,
 * business staff roles, club roles …) never confer platform power and must never be
 * consulted here.
 *
 * Trusted sources only — things a client cannot write:
 *   • the verified ID-token email, and only when emailVerified (owner + ARIA_VOICE_ADMIN_EMAILS-style extras)
 *   • the `admins/{uid}` collection (no client rule → default-deny → console / service account only)
 *
 * It deliberately does NOT read users/{uid}.role, .isAdmin, .tier, .accountType or .email:
 * the users profile is owner-writable, so those fields are self-asserted and prove nothing.
 * (firestore.rules mirrors this in isAdmin().)
 */

/** The owner's account — always a platform admin. */
export const OWNER_EMAIL = 'kmoody2003@gmail.com';

export interface AdminFacts {
  /** From the verified token, never from the profile doc. */
  email?: string;
  emailVerified?: boolean;
  /** `admins/{uid}` exists (staff are added here). */
  isAdminDoc: boolean;
  /** Comma-separated extra admin emails (env PLATFORM_ADMIN_EMAILS, legacy ARIA_VOICE_ADMIN_EMAILS). */
  extraAdminEmails?: string;
}

export function isVerifiedAdmin(f: AdminFacts): boolean {
  if (f.isAdminDoc) return true;
  const email = (f.email || '').trim().toLowerCase();
  if (!f.emailVerified || !email) return false;
  const admins = [OWNER_EMAIL, ...(f.extraAdminEmails || '').split(',')].map(s => s.trim().toLowerCase()).filter(Boolean);
  return admins.includes(email);
}
