// phiAudit — the HIPAA audit trail (45 CFR 164.312(b)).
//
// Every action on PHI writes an entry; entries are append-only (the database rules reject any update
// or delete) and every record write is accepted only together with its entry in the same atomic batch
// (the rules check it). Entries never contain patient names or content — only who, what kind of
// record, which opaque record id, and when (server time).
//
// Tamper evidence: each entry carries a SHA-256 over its own fields chained to the previous entry of the
// same session. A verifier can recompute the chain and see edits, reordering or removed entries. The
// database's Cloud Audit Logs (Data Access) are the authoritative second record.
import { sha256Hex, randomId } from './phiCrypto';
import type { AuditAction, AuditDoc, PhiKind } from './types';

export const AUDIT_GENESIS = '';

export const canonicalAudit = (e: Pick<AuditDoc, 'actorUid' | 'sid' | 'seq' | 'action' | 'kind' | 'recordId' | 'prev'>) =>
  `plajah-phi/audit/v1|${e.actorUid}|${e.sid}|${e.seq}|${e.action}|${e.kind}|${e.recordId}|${e.prev}`;

/** Builds the next entry of one session's chain. */
export class AuditChain {
  readonly sid = randomId(9);
  private seq = 0;
  private prev = AUDIT_GENESIS;
  constructor(private readonly actorUid: string) {}

  async next(action: AuditAction, kind: PhiKind | '' = '', recordId = ''): Promise<{ id: string; entry: Omit<AuditDoc, 'at'> }> {
    const base = { actorUid: this.actorUid, sid: this.sid, seq: ++this.seq, action, kind, recordId, prev: this.prev };
    const hash = await sha256Hex(canonicalAudit(base));
    this.prev = hash;
    return { id: randomId(12), entry: { ...base, hash } };
  }
}

export interface ChainProblem { actorUid: string; sid: string; seq: number; problem: 'hash-mismatch' | 'broken-link' | 'gap' | 'duplicate' }

/** Recompute every chain. Returns the problems found (empty = intact). */
export async function verifyAuditChains(entries: Array<Pick<AuditDoc, 'actorUid' | 'sid' | 'seq' | 'action' | 'kind' | 'recordId' | 'prev' | 'hash'>>): Promise<ChainProblem[]> {
  const bySession = new Map<string, typeof entries>();
  for (const e of entries) { const k = `${e.actorUid}|${e.sid}`; (bySession.get(k) ?? bySession.set(k, []).get(k)!).push(e); }
  const problems: ChainProblem[] = [];
  for (const list of bySession.values()) {
    list.sort((a, b) => a.seq - b.seq);
    let prevHash = AUDIT_GENESIS, expected = 1, lastSeq = 0;
    for (const e of list) {
      if (e.seq === lastSeq) { problems.push({ actorUid: e.actorUid, sid: e.sid, seq: e.seq, problem: 'duplicate' }); continue; }
      if (e.seq !== expected) problems.push({ actorUid: e.actorUid, sid: e.sid, seq: e.seq, problem: 'gap' });
      if (e.prev !== prevHash) problems.push({ actorUid: e.actorUid, sid: e.sid, seq: e.seq, problem: 'broken-link' });
      if ((await sha256Hex(canonicalAudit(e))) !== e.hash) problems.push({ actorUid: e.actorUid, sid: e.sid, seq: e.seq, problem: 'hash-mismatch' });
      prevHash = e.hash; expected = e.seq + 1; lastSeq = e.seq;
    }
  }
  return problems;
}
