// PhiSession — an UNLOCKED clinic vault for one signed-in member.
//
// Holds the data keys in memory (non-extractable except for members who may grant onward), does every
// encrypted read/write, and bundles each write with its audit entry in ONE atomic batch — the database
// rules refuse a record write that doesn't carry a matching audit entry. lock() drops every key.
import { AuditChain } from './phiAudit';
import * as C from './phiCrypto';
import {
  auditEntryPath, auditPath, memberPath, membersPath, recordPath, recordsPath,
  type PhiDb, type WriteOp,
} from './phiPort';
import {
  KIND_DOMAIN, PhiError, ROLE_DOMAINS, ROLE_READ, ROLE_WRITE, PHI_KINDS,
  type AuditAction, type AuditDoc, type ClinicRole, type ListOptions, type MemberDoc,
  type PhiDomain, type PhiKind, type PhiRecord, type PutOptions, type RecordDoc,
} from './types';

const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Don't hold a PHI read hostage to the network just to log it; the write is queued and lands when it can. */
const AUDIT_WAIT_MS = 4000;

export interface KeyEntry { domain: PhiDomain; keyId: string; key: CryptoKey }

export interface PhiList<T> { records: PhiRecord<T>[]; failed: string[] }

const toMs = (v: unknown) => (typeof v === 'number' ? v : 0);

export class PhiSession {
  private ring = new Map<string, CryptoKey>();                       // `${domain}:${keyId}`
  private currentKey = new Map<PhiDomain, { keyId: string; key: CryptoKey }>();
  private chain: AuditChain;
  private _locked = false;

  constructor(
    readonly db: PhiDb, readonly clinicId: string, readonly uid: string, readonly role: ClinicRole,
    keys: KeyEntry[], private readonly onLock?: () => void,
  ) {
    this.chain = new AuditChain(uid);
    for (const k of keys) { this.ring.set(`${k.domain}:${k.keyId}`, k.key); this.currentKey.set(k.domain, { keyId: k.keyId, key: k.key }); }
  }

  get locked() { return this._locked; }
  get domains(): PhiDomain[] { return [...this.currentKey.keys()]; }
  /** Domains this member may grant onward (their keys were opened extractable). */
  canGrant(domain: PhiDomain): boolean { return (this.role === 'OWNER' || (this.role === 'ADMIN' && domain === 'front')) && this.currentKey.has(domain); }
  canRead(kind: PhiKind) { return ROLE_READ[this.role].includes(kind) && this.currentKey.has(KIND_DOMAIN[kind]); }
  canWrite(kind: PhiKind) { return ROLE_WRITE[this.role].includes(kind) && this.currentKey.has(KIND_DOMAIN[kind]); }

  // ── key access (also used by the vault for grants and rotation) ────────────
  /** @internal */ current(domain: PhiDomain) { this.assertOpen(); const c = this.currentKey.get(domain); if (!c) throw new PhiError('no-access', `No access to ${domain} records.`); return c; }
  /** @internal */ keyFor(domain: PhiDomain, keyId: string) { this.assertOpen(); const k = this.ring.get(`${domain}:${keyId}`); if (!k) throw new PhiError('no-grant', 'This record was written with a key you do not hold.'); return k; }
  /** @internal */ allKeys(domain: PhiDomain): KeyEntry[] { this.assertOpen(); return [...this.ring].filter(([k]) => k.startsWith(domain + ':')).map(([k, key]) => ({ domain, keyId: k.slice(domain.length + 1), key })); }
  /** @internal */ adoptKey(domain: PhiDomain, keyId: string, key: CryptoKey, makeCurrent: boolean) { this.assertOpen(); this.ring.set(`${domain}:${keyId}`, key); if (makeCurrent) this.currentKey.set(domain, { keyId, key }); }
  /** @internal */ dropKeys(domain: PhiDomain, keep: Set<string>) { for (const k of [...this.ring.keys()]) if (k.startsWith(domain + ':') && !keep.has(k.slice(domain.length + 1))) this.ring.delete(k); }

  private assertOpen() { if (this._locked) throw new PhiError('locked', 'The clinic vault is locked.'); }

  // ── audit ──────────────────────────────────────────────────────────────────
  /** An audit write that is part of a batch the caller commits. */
  async auditOp(action: AuditAction, kind: PhiKind | '' = '', recordId = ''): Promise<{ id: string; op: WriteOp }> {
    const { id, entry } = await this.chain.next(action, kind, recordId);
    return { id, op: { op: 'create', path: auditEntryPath(this.clinicId, id), data: { ...entry, at: this.db.serverNow() } } };
  }

  /** Log an action that has no record write of its own (reads, exports, prints, lock). */
  async audit(action: AuditAction, kind: PhiKind | '' = '', recordId = '', opts: { wait?: boolean } = { wait: true }): Promise<void> {
    const { op } = await this.auditOp(action, kind, recordId);
    const p = this.db.commit([op]);
    if (opts.wait === false) { p.catch(() => {}); return; }
    await Promise.race([p, new Promise<void>(res => setTimeout(res, AUDIT_WAIT_MS))]);
  }

  // ── records ────────────────────────────────────────────────────────────────
  private checkId(id: string) { if (!ID_RE.test(id)) throw new PhiError('bad-input', 'Record ids are 6–64 letters, digits, - or _.'); }

  private async decode<T>(id: string, d: RecordDoc): Promise<PhiRecord<T>> {
    const domain = KIND_DOMAIN[d.kind];
    const key = this.keyFor(domain, d.keyId);
    const payload = await C.openJson<{ v: 1; data: T }>(key, { iv: d.iv, ct: d.ct }, C.recordAad(this.clinicId, id, d.kind, d.keyId, d.rev));
    if (d.locked && d.contentSha && (await C.sha256Hex(JSON.stringify(payload))) !== d.contentSha)
      throw new PhiError('decrypt-failed', 'A signed record no longer matches the signature it was locked with.');
    return {
      id, kind: d.kind, rev: d.rev, locked: !!d.locked, authorUid: d.authorUid, createdAt: toMs(d.createdAt), updatedAt: toMs(d.updatedAt),
      ...(d.day ? { day: d.day } : {}), ...(d.apptRef ? { apptRef: d.apptRef } : {}), ...(d.status ? { status: d.status } : {}), data: payload.data,
    };
  }

  async getRecord<T = unknown>(kind: PhiKind, id: string): Promise<PhiRecord<T> | null> {
    this.assertOpen(); this.checkId(id);
    if (!this.canRead(kind)) throw new PhiError('no-access', `Your role cannot read ${kind} records.`);
    const doc = await this.db.get(recordPath(this.clinicId, id)) as RecordDoc | null;
    if (!doc) return null;
    if (doc.kind !== kind) throw new PhiError('bad-input', 'That record is a different kind.');
    const rec = await this.decode<T>(id, doc);
    await this.audit('READ_RECORD', kind, id);
    return rec;
  }

  async listRecords<T = unknown>(kind: PhiKind, opts: ListOptions = {}): Promise<PhiList<T>> {
    this.assertOpen();
    if (!this.canRead(kind)) throw new PhiError('no-access', `Your role cannot read ${kind} records.`);
    const filters: Array<[string, '==' | '>=' | '<=', unknown]> = [['kind', '==', kind]];
    if (opts.apptRef) filters.push(['apptRef', '==', opts.apptRef]);
    if (opts.status) filters.push(['status', '==', opts.status]);
    if (opts.dayFrom) { if (!DAY_RE.test(opts.dayFrom)) throw new PhiError('bad-input', 'dayFrom must be YYYY-MM-DD.'); filters.push(['day', '>=', opts.dayFrom]); }
    if (opts.dayTo) { if (!DAY_RE.test(opts.dayTo)) throw new PhiError('bad-input', 'dayTo must be YYYY-MM-DD.'); filters.push(['day', '<=', opts.dayTo]); }
    const rows = await this.db.query(recordsPath(this.clinicId), filters, { limit: opts.limit ?? 500 });
    const records: PhiRecord<T>[] = [], failed: string[] = [];
    for (const r of rows) {
      try { records.push(await this.decode<T>(r.id, r.data as RecordDoc)); } catch { failed.push(r.id); }
    }
    await this.audit('LIST_RECORDS', kind);
    return { records, failed };
  }

  /** Create or update a record. Updating a locked (signed) record is refused. */
  async putRecord<T = unknown>(kind: PhiKind, id: string, data: T, opts: PutOptions = {}): Promise<PhiRecord<T>> {
    this.assertOpen(); this.checkId(id);
    if (!PHI_KINDS.includes(kind)) throw new PhiError('bad-input', 'Unknown record kind.');
    if (!this.canWrite(kind)) throw new PhiError('no-access', `Your role cannot write ${kind} records.`);
    if (opts.day && !DAY_RE.test(opts.day)) throw new PhiError('bad-input', 'day must be YYYY-MM-DD.');
    for (const [k, max] of [['apptRef', 64], ['status', 24]] as const) if ((opts as any)[k] != null && String((opts as any)[k]).length > max) throw new PhiError('bad-input', `${k} is too long.`);

    const existing = await this.db.get(recordPath(this.clinicId, id)) as RecordDoc | null;
    if (existing && existing.kind !== kind) throw new PhiError('bad-input', 'That record id belongs to a different kind.');
    if (existing?.locked) throw new PhiError('immutable', 'This record is signed and locked; it can no longer be changed.');

    const domain = KIND_DOMAIN[kind];
    const { keyId, key } = this.current(domain);
    const rev = existing ? existing.rev + 1 : 1;
    const payload = { v: 1 as const, data };
    const sealed = await C.sealJson(key, payload, C.recordAad(this.clinicId, id, kind, keyId, rev));
    const action: AuditAction = opts.lock ? 'LOCK_RECORD' : existing ? 'UPDATE_RECORD' : 'CREATE_RECORD';
    const { id: auditId, op: auditOp } = await this.auditOp(action, kind, id);
    const now = this.db.serverNow();

    const doc: Record<string, unknown> = {
      kind, rev, keyId, iv: sealed.iv, ct: sealed.ct,
      authorUid: existing?.authorUid ?? this.uid, updatedBy: this.uid,
      createdAt: existing ? existing.createdAt : now, updatedAt: now,
      locked: !!opts.lock, auditId,
      ...(opts.day ? { day: opts.day } : {}), ...(opts.apptRef ? { apptRef: opts.apptRef } : {}), ...(opts.status ? { status: opts.status } : {}),
      ...(opts.lock ? { contentSha: await C.sha256Hex(JSON.stringify(payload)) } : {}),
    };
    const recOp: WriteOp = existing
      ? { op: 'update', path: recordPath(this.clinicId, id), data: doc }
      : { op: 'create', path: recordPath(this.clinicId, id), data: doc };
    try { await this.db.commit([recOp, auditOp]); }
    catch (e) { throw e instanceof PhiError && e.code === 'conflict' ? new PhiError('conflict', 'Someone else changed this record. Reload and try again.') : e; }

    return {
      id, kind, rev, locked: !!opts.lock, authorUid: existing?.authorUid ?? this.uid,
      createdAt: existing ? toMs(existing.createdAt) : Date.now(), updatedAt: Date.now(),
      ...(opts.day ? { day: opts.day } : {}), ...(opts.apptRef ? { apptRef: opts.apptRef } : {}), ...(opts.status ? { status: opts.status } : {}), data,
    };
  }

  /** Sign a record: it becomes immutable, and any later change is detectable. */
  async lockRecord<T = unknown>(kind: PhiKind, id: string): Promise<PhiRecord<T>> {
    const cur = await this.getRecord<T>(kind, id);
    if (!cur) throw new PhiError('not-found', 'No such record.');
    if (cur.locked) return cur;
    return this.putRecord<T>(kind, id, cur.data, { day: cur.day, apptRef: cur.apptRef, status: cur.status, lock: true });
  }

  // ── audit viewing (owner / admin) ──────────────────────────────────────────
  async readAuditLog(limit = 200): Promise<Array<AuditDoc & { id: string }>> {
    this.assertOpen();
    if (this.role !== 'OWNER' && this.role !== 'ADMIN') throw new PhiError('no-access', 'Only the owner or an admin can read the audit log.');
    const rows = await this.db.query(auditPath(this.clinicId), [], { orderBy: 'at', desc: true, limit });
    await this.audit('AUDIT_VIEW');
    return rows.map(r => ({ id: r.id, ...(r.data as AuditDoc) }));
  }

  async listMembers(): Promise<Array<Omit<MemberDoc, 'wrappedPriv'> & { enrolled: boolean }>> {
    this.assertOpen();
    if (this.role !== 'OWNER' && this.role !== 'ADMIN') throw new PhiError('no-access', 'Only the owner or an admin can list members.');
    const rows = await this.db.query(membersPath(this.clinicId), []);
    return rows.map(r => { const { wrappedPriv, ...m } = r.data as MemberDoc; return { ...m, enrolled: !!m.pub }; });
  }

  async getMember(uid: string): Promise<MemberDoc | null> { this.assertOpen(); return (await this.db.get(memberPath(this.clinicId, uid))) as MemberDoc | null; }

  // ── lock ───────────────────────────────────────────────────────────────────
  /** Drop every key from memory. Safe to call repeatedly. */
  lock(): void {
    if (this._locked) return;
    this.audit('VAULT_LOCK', '', '', { wait: false }).catch(() => {});
    this._locked = true;
    this.ring.clear(); this.currentKey.clear();
    this.onLock?.();
  }
}

export { ROLE_DOMAINS };
