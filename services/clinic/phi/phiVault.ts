// phiVault — the lifecycle of a clinic's encrypted vault: set-up, membership, key grants, rotation,
// recovery. Everything that changes who can read PHI goes through here and is audited (the database
// rules require an audit entry in the same batch for each of these writes).
//
//   owner sets up the clinic  →  two data keys (front, clinical), the owner's own key pair, a recovery key
//   owner invites a member    →  the member enrolls with their OWN passphrase (we never see it)
//   an admin grants keys      →  the data keys for that member's role, sealed to their public key
//   suspending a member       →  rules cut access at once; their grants are deleted and the keys rotated
import * as C from './phiCrypto';
import {
  clinicPath, grantPath, grantsPath, memberPath, membersPath, recordPath, recordsPath, recoveryPath, recoveryWrapPath,
  type PhiDb, type WriteOp,
} from './phiPort';
import { PhiSession, type KeyEntry } from './phiSession';
import {
  KIND_DOMAIN, PHI_DOMAINS, PHI_KINDS, PhiError, ROLE_CAN_ASSIGN, ROLE_DOMAINS,
  type ClinicRole, type GrantDoc, type KeyWrap, type MemberDoc, type MemberStatus, type PhiDomain,
  type RecordDoc, type RecoveryDoc, type RecoveryWrapDoc,
} from './types';

const UID_RE = /^[A-Za-z0-9]{6,128}$/;

export const clinicIdFor = (ownerUid: string, businessId: string) =>
  `${ownerUid}__${businessId.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 48)}`;
export const founderOf = (clinicId: string) => clinicId.split('__')[0];

export type ClinicState =
  | { state: 'no-clinic' }                                // the founder has not set the vault up yet
  | { state: 'not-member' }                               // not on this clinic (or the clinic does not exist)
  | { state: 'suspended'; role: ClinicRole }
  | { state: 'needs-enroll'; role: ClinicRole }           // invited — must choose a passphrase
  | { state: 'awaiting-grant'; role: ClinicRole }         // enrolled — an admin must grant keys
  | { state: 'locked'; role: ClinicRole };                // ready to unlock

const isGrantor = (role: ClinicRole, domain: PhiDomain) => role === 'OWNER' || (role === 'ADMIN' && domain === 'front');

export async function clinicState(db: PhiDb, clinicId: string, uid: string): Promise<ClinicState> {
  let m: MemberDoc | null = null;
  try { m = await db.get(memberPath(clinicId, uid)) as MemberDoc | null; } catch (e) { if (!(e instanceof PhiError && e.code === 'no-access')) throw e; }
  if (!m) return { state: founderOf(clinicId) === uid ? 'no-clinic' : 'not-member' };
  if (m.status === 'SUSPENDED') return { state: 'suspended', role: m.role };
  if (!m.pub || !m.wrappedPriv) return { state: 'needs-enroll', role: m.role };
  const grants = await Promise.all(ROLE_DOMAINS[m.role].map(d => db.get(grantPath(clinicId, uid, d))));
  return grants.some(Boolean) ? { state: 'locked', role: m.role } : { state: 'awaiting-grant', role: m.role };
}

// ── set-up (owner) ───────────────────────────────────────────────────────────
export async function createClinic(db: PhiDb, p: { ownerUid: string; businessId: string; name?: string; displayName?: string; passphrase: string }):
  Promise<{ clinicId: string; recoveryKey: string; session: PhiSession }> {
  const clinicId = clinicIdFor(p.ownerUid, p.businessId);
  C.checkPassphrase(p.passphrase);
  if (await db.get(memberPath(clinicId, p.ownerUid)).catch(() => null)) throw new PhiError('conflict', 'This clinic vault is already set up.');

  const keys = await C.createMemberKeys(clinicId, p.ownerUid, p.passphrase);
  const recovery = await C.createRecovery(clinicId);
  const entries: KeyEntry[] = [];
  const grants: Array<{ domain: PhiDomain; wrap: KeyWrap }> = [];
  const recWraps: Array<{ domain: PhiDomain; wrap: KeyWrap }> = [];
  for (const domain of PHI_DOMAINS) {
    const keyId = C.randomId(8), key = await C.generateDataKey(true);
    entries.push({ domain, keyId, key });
    grants.push({ domain, wrap: await C.wrapDataKeyFor(clinicId, domain, keyId, p.ownerUid, keys.pub, key) });
    recWraps.push({ domain, wrap: await C.wrapDataKeyFor(clinicId, domain, keyId, C.RECOVERY_UID, recovery.pub, key) });
  }

  const now = db.serverNow();
  // 1. the clinic (rules: only the uid in the clinic id may create it)
  try { await db.commit([{ op: 'create', path: clinicPath(clinicId), data: { ownerUid: p.ownerUid, ...(p.name ? { name: p.name.slice(0, 120) } : {}), createdAt: now, ver: 1 } }]); }
  catch (e) { if (!(e instanceof PhiError && e.code === 'conflict')) throw e; /* a half-finished earlier attempt: carry on */ }
  // 2. the owner (rules: the clinic's own founder may create their OWNER record)
  await db.commit([{ op: 'create', path: memberPath(clinicId, p.ownerUid), data: {
    uid: p.ownerUid, role: 'OWNER', status: 'ACTIVE', ...(p.displayName ? { displayName: p.displayName.slice(0, 80) } : {}),
    addedBy: p.ownerUid, createdAt: now, updatedAt: now, pub: keys.pub, wrappedPriv: keys.wrappedPriv } }]);
  // 3. keys + recovery + the audit entry that explains them, all or nothing
  const session = new PhiSession(db, clinicId, p.ownerUid, 'OWNER', entries);
  const { id: auditId, op: auditOp } = await session.auditOp('CLINIC_CREATE', '', clinicId);
  const ops: WriteOp[] = [auditOp,
    { op: 'create', path: recoveryPath(clinicId), data: { pub: recovery.pub, sealedPriv: recovery.sealedPriv, createdAt: now, updatedAt: now, auditId } satisfies RecoveryDoc },
    ...grants.map(g => ({ op: 'create', path: grantPath(clinicId, p.ownerUid, g.domain), data: { uid: p.ownerUid, domain: g.domain, wraps: [g.wrap], grantedBy: p.ownerUid, updatedAt: now, auditId } satisfies GrantDoc } as WriteOp)),
    ...recWraps.map(r => ({ op: 'create', path: recoveryWrapPath(clinicId, r.domain), data: { domain: r.domain, wraps: [r.wrap], updatedAt: now, auditId } satisfies RecoveryWrapDoc } as WriteOp)),
  ];
  await db.commit(ops);
  return { clinicId, recoveryKey: recovery.recoveryKey, session };
}

// ── enroll + unlock (every member) ───────────────────────────────────────────
/** A member chooses their passphrase. Only the sealed private key and the public key are stored. */
export async function enrollMember(db: PhiDb, clinicId: string, uid: string, passphrase: string): Promise<void> {
  const m = await db.get(memberPath(clinicId, uid)) as MemberDoc | null;
  if (!m) throw new PhiError('no-access', 'You have not been added to this clinic.');
  if (m.status !== 'ACTIVE') throw new PhiError('no-access', 'Your access to this clinic is suspended.');
  if (m.pub) throw new PhiError('conflict', 'You have already enrolled.');
  const keys = await C.createMemberKeys(clinicId, uid, passphrase);
  const session = new PhiSession(db, clinicId, uid, m.role, []);
  const { id: auditId, op } = await session.auditOp('MEMBER_ENROLL', '', uid);
  await db.commit([{ op: 'update', path: memberPath(clinicId, uid), data: { pub: keys.pub, wrappedPriv: keys.wrappedPriv, updatedAt: db.serverNow(), auditId } }, op]);
}

async function openGrants(db: PhiDb, clinicId: string, uid: string, role: ClinicRole, priv: CryptoKey): Promise<KeyEntry[]> {
  const entries: KeyEntry[] = [];
  for (const domain of ROLE_DOMAINS[role]) {
    const g = await db.get(grantPath(clinicId, uid, domain)) as GrantDoc | null;
    if (!g?.wraps?.length) continue;
    for (const w of g.wraps) entries.push({ domain, keyId: w.keyId, key: await C.unwrapDataKey(clinicId, domain, uid, w, priv, isGrantor(role, domain)) });
  }
  return entries;                                              // the LAST wrap of a domain is its current key
}

export async function unlock(db: PhiDb, clinicId: string, uid: string, passphrase: string, onLock?: () => void): Promise<PhiSession> {
  const m = await db.get(memberPath(clinicId, uid)) as MemberDoc | null;
  if (!m) throw new PhiError('no-access', 'You are not a member of this clinic.');
  if (m.status !== 'ACTIVE') throw new PhiError('no-access', 'Your access to this clinic is suspended.');
  if (!m.pub || !m.wrappedPriv) throw new PhiError('not-enrolled', 'Choose your passphrase first.');
  const priv = await C.unlockMemberKey(clinicId, uid, m.wrappedPriv, passphrase);
  const keys = await openGrants(db, clinicId, uid, m.role, priv);
  if (!keys.length) throw new PhiError('no-grant', 'The clinic owner has not given you access yet.');
  const session = new PhiSession(db, clinicId, uid, m.role, keys, onLock);
  await session.audit('VAULT_UNLOCK', '', '', { wait: false });
  return session;
}

export async function changePassphrase(db: PhiDb, clinicId: string, uid: string, oldPass: string, newPass: string): Promise<void> {
  const m = await db.get(memberPath(clinicId, uid)) as MemberDoc | null;
  if (!m?.wrappedPriv) throw new PhiError('not-enrolled');
  const wrappedPriv = await C.changeMemberPassphrase(clinicId, uid, m.wrappedPriv, oldPass, newPass);
  const session = new PhiSession(db, clinicId, uid, m.role, []);
  const { id: auditId, op } = await session.auditOp('PASSPHRASE_CHANGE', '', uid);
  await db.commit([{ op: 'update', path: memberPath(clinicId, uid), data: { wrappedPriv, updatedAt: db.serverNow(), auditId } }, op]);
}

// ── membership (owner / admin) ───────────────────────────────────────────────
export async function addMember(s: PhiSession, m: { uid: string; role: ClinicRole; displayName?: string }): Promise<void> {
  if (!ROLE_CAN_ASSIGN[s.role].includes(m.role)) throw new PhiError('no-access', `A${s.role === 'OWNER' ? 'n owner' : 'n ' + s.role.toLowerCase()} cannot add a ${m.role.toLowerCase()}.`);
  if (!UID_RE.test(m.uid)) throw new PhiError('bad-input', 'That is not a valid user id.');
  if (await s.getMember(m.uid)) throw new PhiError('conflict', 'That person is already on this clinic.');
  const { id: auditId, op } = await s.auditOp('MEMBER_ADD', '', m.uid);
  const now = s.db.serverNow();
  await s.db.commit([{ op: 'create', path: memberPath(s.clinicId, m.uid), data: {
    uid: m.uid, role: m.role, status: 'ACTIVE', ...(m.displayName ? { displayName: m.displayName.slice(0, 80) } : {}),
    addedBy: s.uid, createdAt: now, updatedAt: now, auditId } }, op]);
}

/** Wrap every key this member's role may hold for their public key. They must have enrolled first. */
export async function grantAccess(s: PhiSession, targetUid: string): Promise<PhiDomain[]> {
  const t = await s.getMember(targetUid);
  if (!t) throw new PhiError('not-found', 'That person is not on this clinic.');
  if (t.status !== 'ACTIVE') throw new PhiError('no-access', 'That member is suspended.');
  if (!t.pub) throw new PhiError('not-enrolled', 'They need to choose their passphrase first.');
  const domains = ROLE_DOMAINS[t.role].filter(d => s.canGrant(d));
  if (!domains.length) throw new PhiError('no-access', 'You cannot grant access to this member.');
  const { id: auditId, op } = await s.auditOp('KEY_GRANT', '', targetUid);
  const now = s.db.serverNow();
  const ops: WriteOp[] = [op];
  for (const domain of domains) {
    const wraps = await Promise.all(s.allKeys(domain).map(k => C.wrapDataKeyFor(s.clinicId, domain, k.keyId, targetUid, t.pub!, k.key)));
    ops.push({ op: 'set', path: grantPath(s.clinicId, targetUid, domain), data: { uid: targetUid, domain, wraps, grantedBy: s.uid, updatedAt: now, auditId } satisfies GrantDoc });
  }
  await s.db.commit(ops);
  return domains;
}

/** Cut a member off. Access stops at once (the rules); their key grants are removed and the keys rotated. */
export async function setMemberStatus(s: PhiSession, uid: string, status: MemberStatus): Promise<void> {
  if (uid === s.uid) throw new PhiError('bad-input', 'You cannot change your own access.');
  const t = await s.getMember(uid);
  if (!t) throw new PhiError('not-found', 'That person is not on this clinic.');
  if (!ROLE_CAN_ASSIGN[s.role].includes(t.role)) throw new PhiError('no-access', 'You cannot change this member.');
  const { id: auditId, op } = await s.auditOp(status === 'SUSPENDED' ? 'MEMBER_SUSPEND' : 'MEMBER_RESTORE', '', uid);
  const ops: WriteOp[] = [{ op: 'update', path: memberPath(s.clinicId, uid), data: { status, updatedAt: s.db.serverNow(), auditId } }, op];
  if (status === 'SUSPENDED') for (const d of ROLE_DOMAINS[t.role]) ops.push({ op: 'delete', path: grantPath(s.clinicId, uid, d) });
  await s.db.commit(ops);
  if (status === 'SUSPENDED') for (const d of ROLE_DOMAINS[t.role]) if (s.canGrant(d)) await rotateDomain(s, d);
}

export async function changeRole(s: PhiSession, uid: string, role: ClinicRole): Promise<void> {
  if (uid === s.uid) throw new PhiError('bad-input', 'You cannot change your own role.');
  const t = await s.getMember(uid);
  if (!t) throw new PhiError('not-found', 'That person is not on this clinic.');
  if (!ROLE_CAN_ASSIGN[s.role].includes(t.role) || !ROLE_CAN_ASSIGN[s.role].includes(role)) throw new PhiError('no-access', 'You cannot make that change.');
  const { id: auditId, op } = await s.auditOp('MEMBER_ROLE', '', uid);
  const lost = ROLE_DOMAINS[t.role].filter(d => !ROLE_DOMAINS[role].includes(d));
  const ops: WriteOp[] = [{ op: 'update', path: memberPath(s.clinicId, uid), data: { role, updatedAt: s.db.serverNow(), auditId } }, op];
  for (const d of lost) ops.push({ op: 'delete', path: grantPath(s.clinicId, uid, d) });
  await s.db.commit(ops);
  for (const d of lost) if (s.canGrant(d)) await rotateDomain(s, d);
  if (t.pub && ROLE_DOMAINS[role].some(d => !ROLE_DOMAINS[t.role].includes(d))) await grantAccess(s, uid).catch(() => { /* an admin cannot grant clinical; the owner will */ });
}

// ── key rotation ─────────────────────────────────────────────────────────────
// Firestore rules may touch only 20 distinct documents per batched write, and every grant write looks up its
// target member, so grant batches stay small; record batches share one member + one audit lookup.
const GRANT_CHUNK = 8;
const CHUNK = 50;

/**
 * Replace a domain's data key: wrap the new key for every active member and for recovery, re-encrypt every
 * record that isn't signed, then drop old keys nobody still needs. Signed (locked) records are immutable,
 * so they stay under their original key, which remains available to the members who may read them.
 */
export async function rotateDomain(s: PhiSession, domain: PhiDomain): Promise<{ reencrypted: number; failed: string[] }> {
  if (!s.canGrant(domain)) throw new PhiError('no-access', 'You cannot rotate this key.');
  const members = (await s.db.query(membersPath(s.clinicId), [])).map(r => r.data as MemberDoc);
  const targets = members.filter(m => m.status === 'ACTIVE' && m.pub && ROLE_DOMAINS[m.role].includes(domain));
  const rec = await s.db.get(recoveryPath(s.clinicId)) as RecoveryDoc | null;
  const newKeyId = C.randomId(8), newKey = await C.generateDataKey(true);
  const everyKey: Array<{ keyId: string; key: CryptoKey }> = [...s.allKeys(domain), { keyId: newKeyId, key: newKey }];
  const { id: auditId, op: auditOp } = await s.auditOp('KEY_ROTATE', '', domain);
  const now = s.db.serverNow();

  // 1. everyone (and recovery) can open the new key BEFORE any record moves to it
  const grantOps: WriteOp[] = [];
  for (const m of targets) {
    const wraps = await Promise.all(everyKey.map(k => C.wrapDataKeyFor(s.clinicId, domain, k.keyId, m.uid, m.pub!, k.key)));
    grantOps.push({ op: 'set', path: grantPath(s.clinicId, m.uid, domain), data: { uid: m.uid, domain, wraps, grantedBy: s.uid, updatedAt: now, auditId } satisfies GrantDoc });
  }
  if (rec) {
    const wraps = await Promise.all(everyKey.map(k => C.wrapDataKeyFor(s.clinicId, domain, k.keyId, C.RECOVERY_UID, rec.pub, k.key)));
    grantOps.push({ op: 'set', path: recoveryWrapPath(s.clinicId, domain), data: { domain, wraps, updatedAt: now, auditId } satisfies RecoveryWrapDoc });
  }
  await s.db.commit([auditOp, ...grantOps.slice(0, GRANT_CHUNK)]);
  for (let i = GRANT_CHUNK; i < grantOps.length; i += GRANT_CHUNK) await s.db.commit(grantOps.slice(i, i + GRANT_CHUNK));
  s.adoptKey(domain, newKeyId, newKey, true);

  // 2. move every unsigned record to the new key
  let reencrypted = 0; const failed: string[] = [];
  const stillNeeded = new Set<string>([newKeyId]);
  for (const kind of PHI_KINDS.filter(k => KIND_DOMAIN[k] === domain)) {
    const rows = await s.db.query(recordsPath(s.clinicId), [['kind', '==', kind]]);
    const updates: WriteOp[] = [];
    for (const row of rows) {
      const d = row.data as RecordDoc;
      if (d.keyId === newKeyId) continue;
      if (d.locked) { stillNeeded.add(d.keyId); continue; }
      try {
        const payload = await C.openJson<unknown>(s.keyFor(domain, d.keyId), { iv: d.iv, ct: d.ct }, C.recordAad(s.clinicId, row.id, kind, d.keyId, d.rev));
        const rev = d.rev + 1;
        const sealed = await C.sealJson(newKey, payload, C.recordAad(s.clinicId, row.id, kind, newKeyId, rev));
        updates.push({ op: 'update', path: recordPath(s.clinicId, row.id), data: { rev, keyId: newKeyId, iv: sealed.iv, ct: sealed.ct, updatedBy: s.uid, updatedAt: s.db.serverNow(), auditId } });
      } catch { failed.push(row.id); stillNeeded.add(d.keyId); }
    }
    for (let i = 0; i < updates.length; i += CHUNK) { await s.db.commit(updates.slice(i, i + CHUNK)); reencrypted += Math.min(CHUNK, updates.length - i); }
  }

  // 3. drop keys no record uses any more (best effort — a leftover is harmless, it only keeps an old key)
  const keep = everyKey.filter(k => stillNeeded.has(k.keyId));
  if (keep.length < everyKey.length) {
    const cleanup: WriteOp[] = [];
    for (const m of targets) cleanup.push({ op: 'set', path: grantPath(s.clinicId, m.uid, domain), data: { uid: m.uid, domain, wraps: await Promise.all(keep.map(k => C.wrapDataKeyFor(s.clinicId, domain, k.keyId, m.uid, m.pub!, k.key))), grantedBy: s.uid, updatedAt: s.db.serverNow(), auditId } satisfies GrantDoc });
    if (rec) cleanup.push({ op: 'set', path: recoveryWrapPath(s.clinicId, domain), data: { domain, wraps: await Promise.all(keep.map(k => C.wrapDataKeyFor(s.clinicId, domain, k.keyId, C.RECOVERY_UID, rec.pub, k.key))), updatedAt: s.db.serverNow(), auditId } satisfies RecoveryWrapDoc });
    for (let i = 0; i < cleanup.length; i += GRANT_CHUNK) await s.db.commit(cleanup.slice(i, i + GRANT_CHUNK)).catch(() => {});
    s.dropKeys(domain, new Set(keep.map(k => k.keyId)));
  }
  return { reencrypted, failed };
}

// ── recovery (owner) ─────────────────────────────────────────────────────────
/** The owner forgot their passphrase: the recovery key reopens the keys and a new passphrase is set. */
export async function recoverOwnerAccess(db: PhiDb, clinicId: string, uid: string, recoveryKey: string, newPassphrase: string, onLock?: () => void): Promise<PhiSession> {
  const m = await db.get(memberPath(clinicId, uid)) as MemberDoc | null;
  if (!m || m.role !== 'OWNER' || m.status !== 'ACTIVE') throw new PhiError('no-access', 'Only the clinic owner can use the recovery key.');
  const rec = await db.get(recoveryPath(clinicId)) as RecoveryDoc | null;
  if (!rec) throw new PhiError('not-found', 'This clinic has no recovery key on file.');
  const recPriv = await C.openRecoveryPrivateKey(clinicId, rec.sealedPriv, recoveryKey);

  const entries: KeyEntry[] = [];
  for (const domain of PHI_DOMAINS) {
    const rw = await db.get(recoveryWrapPath(clinicId, domain)) as RecoveryWrapDoc | null;
    for (const w of rw?.wraps ?? []) entries.push({ domain, keyId: w.keyId, key: await C.unwrapDataKey(clinicId, domain, C.RECOVERY_UID, w, recPriv, true) });
  }
  if (!entries.length) throw new PhiError('no-grant', 'No recoverable keys were found.');

  const keys = await C.createMemberKeys(clinicId, uid, newPassphrase);
  const session = new PhiSession(db, clinicId, uid, 'OWNER', entries, onLock);
  const { id: auditId, op } = await session.auditOp('VAULT_RECOVER', '', uid);
  const now = db.serverNow();
  const ops: WriteOp[] = [op, { op: 'update', path: memberPath(clinicId, uid), data: { pub: keys.pub, wrappedPriv: keys.wrappedPriv, updatedAt: now, auditId } }];
  for (const domain of PHI_DOMAINS) {
    const wraps = await Promise.all(session.allKeys(domain).map(k => C.wrapDataKeyFor(clinicId, domain, k.keyId, uid, keys.pub, k.key)));
    ops.push({ op: 'set', path: grantPath(clinicId, uid, domain), data: { uid, domain, wraps, grantedBy: uid, updatedAt: now, auditId } satisfies GrantDoc });
  }
  await db.commit(ops);
  return session;
}

/** Issue a new recovery key (the old one stops working). Owner only. */
export async function rotateRecoveryKey(s: PhiSession): Promise<string> {
  if (s.role !== 'OWNER') throw new PhiError('no-access', 'Only the owner can change the recovery key.');
  const next = await C.createRecovery(s.clinicId);
  const { id: auditId, op } = await s.auditOp('KEY_ROTATE', '', 'recovery');
  const now = s.db.serverNow();
  const ops: WriteOp[] = [op, { op: 'set', path: recoveryPath(s.clinicId), data: { pub: next.pub, sealedPriv: next.sealedPriv, createdAt: now, updatedAt: now, auditId } satisfies RecoveryDoc }];
  for (const domain of PHI_DOMAINS) {
    const wraps = await Promise.all(s.allKeys(domain).map(k => C.wrapDataKeyFor(s.clinicId, domain, k.keyId, C.RECOVERY_UID, next.pub, k.key)));
    ops.push({ op: 'set', path: recoveryWrapPath(s.clinicId, domain), data: { domain, wraps, updatedAt: now, auditId } satisfies RecoveryWrapDoc });
  }
  await s.db.commit(ops);
  return next.recoveryKey;
}

export { grantsPath };
