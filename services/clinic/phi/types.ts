// PHI store — shared contract.
//
// Patient data (PHI) lives in its OWN Firestore database (default id `plajah-phi`), never in the
// general `plajah-prod` database. Every record is encrypted in the browser before it leaves the
// device, so the database only ever holds ciphertext plus a few non-identifying fields.
//
// Two key domains give cryptographic role separation, not just rule separation:
//   front     appointments, intake forms, superbills — front desk, billing, admins, providers
//   clinical  SOAP notes — providers and the owner only
// A member is only ever handed the keys for their role's domains, so even if a rule were wrong,
// a front-desk account could not decrypt a clinical note.

export const PHI_DATABASE_ID = 'plajah-phi';

export type PhiDomain = 'front' | 'clinical';
export type PhiKind = 'appointment' | 'intake' | 'soap' | 'superbill';
export type ClinicRole = 'OWNER' | 'ADMIN' | 'PROVIDER' | 'STAFF' | 'BILLER';
export type MemberStatus = 'ACTIVE' | 'SUSPENDED';

export const PHI_KINDS: readonly PhiKind[] = ['appointment', 'intake', 'soap', 'superbill'];
export const PHI_DOMAINS: readonly PhiDomain[] = ['front', 'clinical'];
export const CLINIC_ROLES: readonly ClinicRole[] = ['OWNER', 'ADMIN', 'PROVIDER', 'STAFF', 'BILLER'];

/** Which key domain protects each kind of record. */
export const KIND_DOMAIN: Record<PhiKind, PhiDomain> = {
  appointment: 'front', intake: 'front', superbill: 'front', soap: 'clinical',
};

/** Key domains each role is granted. */
export const ROLE_DOMAINS: Record<ClinicRole, readonly PhiDomain[]> = {
  OWNER: ['front', 'clinical'], PROVIDER: ['front', 'clinical'],
  ADMIN: ['front'], STAFF: ['front'], BILLER: ['front'],
};

/** Minimum necessary: what each role may read and write. MUST match the Firestore rules. */
export const ROLE_READ: Record<ClinicRole, readonly PhiKind[]> = {
  OWNER: ['appointment', 'intake', 'soap', 'superbill'],
  PROVIDER: ['appointment', 'intake', 'soap', 'superbill'],
  ADMIN: ['appointment', 'intake', 'superbill'],
  STAFF: ['appointment', 'intake'],
  BILLER: ['appointment', 'superbill'],
};
export const ROLE_WRITE: Record<ClinicRole, readonly PhiKind[]> = {
  OWNER: ['appointment', 'intake', 'soap', 'superbill'],
  PROVIDER: ['appointment', 'intake', 'soap', 'superbill'],
  ADMIN: ['appointment', 'intake', 'superbill'],
  STAFF: ['appointment', 'intake'],
  BILLER: ['superbill'],
};

/** Who may manage membership, and which roles each may assign. */
export const ROLE_CAN_ASSIGN: Record<ClinicRole, readonly ClinicRole[]> = {
  OWNER: ['ADMIN', 'PROVIDER', 'STAFF', 'BILLER'],
  ADMIN: ['PROVIDER', 'STAFF', 'BILLER'],
  PROVIDER: [], STAFF: [], BILLER: [],
};

export type AuditAction =
  | 'CLINIC_CREATE' | 'VAULT_UNLOCK' | 'VAULT_LOCK' | 'VAULT_RECOVER'
  | 'MEMBER_ADD' | 'MEMBER_ENROLL' | 'MEMBER_ROLE' | 'MEMBER_SUSPEND' | 'MEMBER_RESTORE' | 'KEY_GRANT' | 'KEY_ROTATE' | 'PASSPHRASE_CHANGE'
  | 'CREATE_RECORD' | 'UPDATE_RECORD' | 'LOCK_RECORD' | 'READ_RECORD' | 'LIST_RECORDS' | 'EXPORT_RECORD' | 'PRINT_RECORD'
  | 'AUDIT_VIEW';

export const AUDIT_ACTIONS: readonly AuditAction[] = [
  'CLINIC_CREATE', 'VAULT_UNLOCK', 'VAULT_LOCK', 'VAULT_RECOVER',
  'MEMBER_ADD', 'MEMBER_ENROLL', 'MEMBER_ROLE', 'MEMBER_SUSPEND', 'MEMBER_RESTORE', 'KEY_GRANT', 'KEY_ROTATE', 'PASSPHRASE_CHANGE',
  'CREATE_RECORD', 'UPDATE_RECORD', 'LOCK_RECORD', 'READ_RECORD', 'LIST_RECORDS', 'EXPORT_RECORD', 'PRINT_RECORD',
  'AUDIT_VIEW',
];

// ── Stored documents (what Firestore actually holds) ─────────────────────────

/** AES-GCM output: 96-bit random IV and the ciphertext+tag, both base64. */
export interface Sealed { iv: string; ct: string }

export interface ClinicDoc { ownerUid: string; name?: string; createdAt: unknown; ver: 1 }

export interface MemberDoc {
  uid: string; role: ClinicRole; status: MemberStatus; displayName?: string;
  addedBy: string; createdAt: unknown; updatedAt: unknown;
  /** The audit entry written in the same batch (required by the rules for every change after bootstrap). */
  auditId?: string;
  /** ECDH P-256 public key (SPKI, base64). Absent until the member has enrolled. */
  pub?: string;
  /** The member's ECDH private key (PKCS8) sealed under a key derived from THEIR passphrase. */
  wrappedPriv?: PassphraseWrap;
}

export interface PassphraseWrap extends Sealed { salt: string; iter: number }

/** A data key sealed for one member: ephemeral-ECDH to the member's public key, then AES-GCM. */
export interface KeyWrap { keyId: string; epk: string; salt: string; iv: string; ct: string }

export interface GrantDoc { uid: string; domain: PhiDomain; wraps: KeyWrap[]; grantedBy: string; updatedAt: unknown; auditId: string }

/** Clinic recovery key pair. The public half lets admins wrap new data keys for recovery; the private
 *  half is sealed under the 256-bit recovery key the owner keeps offline. */
export interface RecoveryDoc { pub: string; sealedPriv: Sealed; createdAt: unknown; updatedAt: unknown; auditId: string }
/** Data keys wrapped for recovery, one document per domain (so admins can maintain `front` only). */
export interface RecoveryWrapDoc { domain: PhiDomain; wraps: KeyWrap[]; updatedAt: unknown; auditId: string }

export interface RecordDoc {
  kind: PhiKind; rev: number; keyId: string; iv: string; ct: string;
  authorUid: string; updatedBy: string; createdAt: unknown; updatedAt: unknown;
  locked: boolean; auditId: string;
  /** SHA-256 of the plaintext at the moment of signing (locked records only); detects any later change. */
  contentSha?: string;
  /** Non-identifying query helpers. Never names, dates of birth, or free text. */
  day?: string; apptRef?: string; status?: string;
}

export interface AuditDoc {
  actorUid: string; action: AuditAction; kind: PhiKind | ''; recordId: string;
  at: unknown;
  /** Session id + position in the session: lets a verifier see that no entry was removed. */
  sid: string; seq: number;
  /** Hash of this entry's fields chained to the previous entry of the same session. */
  prev: string; hash: string;
}

// ── What callers see ─────────────────────────────────────────────────────────
export interface PhiRecord<T = unknown> {
  id: string; kind: PhiKind; rev: number; locked: boolean;
  authorUid: string; createdAt: number; updatedAt: number;
  day?: string; apptRef?: string; status?: string;
  data: T;
}

export interface PutOptions { day?: string; apptRef?: string; status?: string; lock?: boolean }
export interface ListOptions { dayFrom?: string; dayTo?: string; apptRef?: string; status?: string; limit?: number }

export class PhiError extends Error {
  constructor(public code:
    | 'locked' | 'no-access' | 'not-found' | 'conflict' | 'immutable' | 'bad-input' | 'decrypt-failed'
    | 'weak-passphrase' | 'wrong-passphrase' | 'bad-recovery-key' | 'not-enrolled' | 'no-grant' | 'unavailable',
    message?: string) { super(message || code); this.name = 'PhiError'; }
}
