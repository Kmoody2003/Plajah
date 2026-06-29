// accountSafeguards — the child-account threat model, encoded as pure policy.
//
// These are dependency-light, side-effect-free functions so the rules are auditable and
// testable in isolation. Phase 2 wires them into the live auth/provision/claim flow and the
// Firestore rules; this module is the single source of truth for "who may do what to a child
// account." See docs/education/PLAJAH_EDUCATION_LEDGER_BLUEPRINT.md §2.

// ── Child-account lifecycle ──────────────────────────────────────────────────────
// SCHOOL_PROVISIONED: created by a teacher, walled (school-scoped only), awaiting claim.
// PARENT_OWNED:       a guardian has claimed it; parent owns the ledger.
// SELF_OWNED:         graduated at the age of digital consent (with guardian sign-off).
// ARCHIVED:           provisioned-but-unclaimed past expiry, or deleted by owner.
export type ChildAccountState = 'SCHOOL_PROVISIONED' | 'PARENT_OWNED' | 'SELF_OWNED' | 'ARCHIVED';

// ── Claim tokens ─────────────────────────────────────────────────────────────────
// A high-entropy, single-use, expiring code handed to the family OFFLINE by the teacher.
// Claiming requires the code AND an authenticated parent — knowing a username is never enough.
export const CLAIM_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const UNCONFUSABLE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0/I/1 — readable on a printed handout

export interface ClaimToken {
  code: string;        // e.g. 'QK7-M4PD-RJ9'
  childUid: string;
  createdBy: string;   // teacher uid
  createdAt: number;
  expiresAt: number;
  usedAt?: number;
}

function randomInts(n: number): number[] {
  const out = new Array<number>(n);
  const g: Crypto | undefined = (globalThis as any).crypto;
  if (g && typeof g.getRandomValues === 'function') {
    const buf = new Uint32Array(n);
    g.getRandomValues(buf);
    for (let i = 0; i < n; i++) out[i] = buf[i];
  } else {
    // Non-crypto fallback (server/test); real flow always has WebCrypto.
    for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 0xffffffff);
  }
  return out;
}

/** ~10 unconfusable chars ≈ 50 bits of entropy, grouped for legibility on a handout. */
export function generateClaimCode(): string {
  const chars = randomInts(10).map(r => UNCONFUSABLE[r % UNCONFUSABLE.length]);
  return `${chars.slice(0, 3).join('')}-${chars.slice(3, 7).join('')}-${chars.slice(7, 10).join('')}`;
}

export function createClaimToken(childUid: string, createdBy: string, now = Date.now()): ClaimToken {
  return { code: generateClaimCode(), childUid, createdBy, createdAt: now, expiresAt: now + CLAIM_TOKEN_TTL_MS };
}

export interface ClaimAttempt { token: ClaimToken; code: string; claimerIsAuthenticatedParent: boolean; now?: number; }

/** Validate a parent's attempt to claim a provisioned child. Constant-time-ish code compare. */
export function validateClaim({ token, code, claimerIsAuthenticatedParent, now = Date.now() }: ClaimAttempt): { ok: boolean; reason?: string } {
  if (!claimerIsAuthenticatedParent) return { ok: false, reason: 'Claimer must be a signed-in parent account.' };
  if (token.usedAt) return { ok: false, reason: 'This claim code was already used.' };
  if (now > token.expiresAt) return { ok: false, reason: 'This claim code has expired — ask the teacher for a new one.' };
  if (!safeEqual(code.trim().toUpperCase(), token.code.toUpperCase())) return { ok: false, reason: 'Claim code does not match.' };
  return { ok: true };
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ── Child credentials (no email — username + parent/teacher-set password) ─────────
// The username maps to an internal auth identifier the child never sees or types. Plajah
// never stores the plaintext password (Firebase hashes it; Phase 2 v2 uses custom tokens).
export const CHILD_AUTH_DOMAIN = 'learner.plajah';
export const deriveChildAuthEmail = (username: string) => `${username.toLowerCase()}@${CHILD_AUTH_DOMAIN}`;

export const RESERVED_USERNAMES = new Set(['admin', 'root', 'plajah', 'teacher', 'parent', 'support', 'system', 'null', 'undefined']);

/** Username rules: 3–20 chars, [a-z0-9._-], not reserved, and (caller-supplied) not the child's full legal name. */
export function isValidUsername(username: string): { ok: boolean; reason?: string } {
  const u = (username || '').trim();
  if (u.length < 3 || u.length > 20) return { ok: false, reason: 'Username must be 3–20 characters.' };
  if (!/^[a-z0-9._-]+$/i.test(u)) return { ok: false, reason: 'Use only letters, numbers, dot, underscore, or hyphen.' };
  if (RESERVED_USERNAMES.has(u.toLowerCase())) return { ok: false, reason: 'That username is reserved.' };
  return { ok: true };
}

/** Child password floor (set by an adult): length only — no PII checks possible client-side. */
export function isValidChildPassword(pw: string): { ok: boolean; reason?: string } {
  if (!pw || pw.length < 6) return { ok: false, reason: 'Password must be at least 6 characters.' };
  return { ok: true };
}

// ── Teacher verification & provisioning caps ──────────────────────────────────────
export type TeacherVerification = 'UNVERIFIED' | 'DOMAIN' | 'DISTRICT_SSO' | 'ADMIN_APPROVED';

/** Only verified teachers may mint child accounts — stops anyone harvesting identities. */
export function canProvisionChildren(v: TeacherVerification): boolean {
  return v === 'DOMAIN' || v === 'DISTRICT_SSO' || v === 'ADMIN_APPROVED';
}

export function provisioningCaps(v: TeacherVerification): { maxAccounts: number; walled: boolean } {
  switch (v) {
    case 'DISTRICT_SSO': return { maxAccounts: 1000, walled: true };
    case 'ADMIN_APPROVED': return { maxAccounts: 200, walled: true };
    case 'DOMAIN': return { maxAccounts: 60, walled: true };
    default: return { maxAccounts: 0, walled: true };
  }
}

// ── Scope / siloing (who sees what of a child's ledger) ───────────────────────────
export type ViewerRelation = 'self' | 'guardian' | 'co_guardian' | 'teacher_enrolled' | 'school_admin' | 'none';

export interface LedgerScope {
  academic: boolean;     // can see academic mastery at all
  classroomOnly: boolean; // restricted to the standards taught in their class
  outOfSchool: boolean;  // can see home/out-of-school activity
  pii: boolean;          // can see guardian contact / identifying info
}

export function ledgerScopeFor(relation: ViewerRelation): LedgerScope {
  switch (relation) {
    case 'self':
    case 'guardian': return { academic: true, classroomOnly: false, outOfSchool: true, pii: true };
    case 'co_guardian': return { academic: true, classroomOnly: false, outOfSchool: true, pii: false };
    case 'teacher_enrolled': return { academic: true, classroomOnly: true, outOfSchool: false, pii: false };
    case 'school_admin': return { academic: true, classroomOnly: true, outOfSchool: false, pii: false };
    default: return { academic: false, classroomOnly: true, outOfSchool: false, pii: false };
  }
}

// ── Child self-mutation guard ─────────────────────────────────────────────────────
// Fields a CHILD account may never change on itself (enforced in Firestore rules too).
export const CHILD_LOCKED_FIELDS = new Set<string>([
  'accountType', 'isChild', 'guardianUid', 'childUids', 'email', 'parentalControls', 'role', 'tier', 'birthYear',
]);
export const childMayEditField = (field: string): boolean => !CHILD_LOCKED_FIELDS.has(field);

// ── Advertising / tracking exclusion (COPPA) ──────────────────────────────────────
/** Children are HARD-excluded from the ad + behavioral-tracking pipeline. Enforce at serve time. */
export function isAdEligible(p?: { isChild?: boolean; accountType?: string } | null): boolean {
  if (!p) return false;
  return !(p.isChild || p.accountType === 'CHILD');
}

// ── Audit log (FERPA access logging + abuse forensics) ────────────────────────────
export type AccountAuditAction =
  | 'provision' | 'claim' | 'access' | 'export' | 'delete' | 'revoke' | 'graduate' | 'login' | 'login_failed';

export interface AccountAuditEvent {
  childUid: string;
  actorUid: string;
  action: AccountAuditAction;
  at: number;
  detail?: string;
}

export function auditEvent(childUid: string, actorUid: string, action: AccountAuditAction, detail?: string): AccountAuditEvent {
  const e: AccountAuditEvent = { childUid, actorUid, action, at: Date.now() };
  if (detail) e.detail = detail;
  return e;
}
