// Plajah ID store — server only (Admin REST). Clients can't read or write any of these collections:
// firestore.rules has no match for them, so Firestore denies by default. Everything goes through
// routes/plajahId.ts.
//
//   identities/{plajahId}                 kind, createdAt, status, headSeq, headHash
//                                         person: primaryUid · org: orgId, controllers[] (person IDs)
//   identities/{plajahId}/history/{seq}   append-only, hash-chained events (services/plajahId/core.ts)
//   identities/{plajahId}/logins/{uid}    the sign-ins attached to a person (phase 1: the one that created it)
//   loginIndex/{uid}                      { plajahId } — a Firebase uid → its person identity
//   orgIdentityIndex/{orgId}              { plajahId } — an organizations/{id} → its org identity
//
// Every create is ONE atomic commit with "must not exist" preconditions on the index doc, so two racing
// requests for the same account can never mint two identities: the loser re-reads the winner's.

import { fsCommit, fsGetStrict, fsList, type CommitWrite } from '../firebaseAdminRest';
import { generatePlajahId, nextEvent, seqDocId, verifyChain, type IdentityEvent, type IdentityEventType, type IdentityKind } from './core';

export interface IdentityRecord {
  id: string;
  kind: IdentityKind;
  createdAt: number;
  status: 'active';
  headSeq: number;
  headHash: string;
  primaryUid?: string;
  orgId?: string;
  controllers?: string[];
}

const histPath = (id: string, seq: number) => `identities/${id}/history/${seqDocId(seq)}`;
const eventDoc = (e: IdentityEvent) => ({ ...e }) as unknown as Record<string, unknown>;

export async function getIdentity(id: string): Promise<IdentityRecord | null> {
  const d = await fsGetStrict(`identities/${id}`);
  return d ? ({ id, ...d } as IdentityRecord) : null;
}

export async function personIdForUid(uid: string): Promise<string | null> {
  return ((await fsGetStrict(`loginIndex/${uid}`))?.plajahId as string) || null;
}

export async function orgIdForOrg(orgId: string): Promise<string | null> {
  return ((await fsGetStrict(`orgIdentityIndex/${orgId}`))?.plajahId as string) || null;
}

/** The person identity for a signed-in account, minting it (with its first login) if it doesn't exist. */
export async function ensurePersonId(uid: string, provider: string, actor = 'self'): Promise<{ id: string; created: boolean }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const existing = await personIdForUid(uid);
    if (existing) return { id: existing, created: false };

    const id = generatePlajahId('person');
    const now = Date.now();
    const e0 = nextEvent(id, null, 'created', actor === 'self' ? id : actor, { kind: 'person' }, now);
    const e1 = nextEvent(id, e0, 'login_linked', actor === 'self' ? id : actor, { uid, provider }, now);
    const writes: CommitWrite[] = [
      { path: `identities/${id}`, mustNotExist: true, data: { kind: 'person', createdAt: now, status: 'active', headSeq: e1.seq, headHash: e1.hash, primaryUid: uid } },
      { path: histPath(id, 0), mustNotExist: true, data: eventDoc(e0) },
      { path: histPath(id, 1), mustNotExist: true, data: eventDoc(e1) },
      { path: `identities/${id}/logins/${uid}`, mustNotExist: true, data: { uid, provider, linkedAt: now } },
      { path: `loginIndex/${uid}`, mustNotExist: true, data: { plajahId: id, at: now } },
    ];
    const r = await fsCommit(writes);
    if (r.ok) return { id, created: true };
    if (!r.conflict) throw new Error(`Could not create a Plajah ID (HTTP ${r.status}).`);
    // Conflict: another request won the race for this uid (or, astronomically rarely, the ID was taken) — loop.
  }
  throw new Error('Could not create a Plajah ID.');
}

/** The org identity for organizations/{orgId}. `controller` (a person ID) becomes its first controller. */
export async function ensureOrgId(orgId: string, controller: string | null, actor: string): Promise<{ id: string; created: boolean }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const existing = await orgIdForOrg(orgId);
    if (existing) return { id: existing, created: false };

    const id = generatePlajahId('org');
    const now = Date.now();
    const events: IdentityEvent[] = [];
    events.push(nextEvent(id, null, 'created', actor, { kind: 'org' }, now));
    events.push(nextEvent(id, events[0], 'org_linked', actor, { orgId }, now));
    if (controller) events.push(nextEvent(id, events[1], 'controller_added', actor, { controller }, now));
    const head = events[events.length - 1];
    const writes: CommitWrite[] = [
      { path: `identities/${id}`, mustNotExist: true, data: { kind: 'org', createdAt: now, status: 'active', headSeq: head.seq, headHash: head.hash, orgId, controllers: controller ? [controller] : [] } },
      ...events.map(e => ({ path: histPath(id, e.seq), mustNotExist: true, data: eventDoc(e) })),
      { path: `orgIdentityIndex/${orgId}`, mustNotExist: true, data: { plajahId: id, at: now } },
    ];
    const r = await fsCommit(writes);
    if (r.ok) return { id, created: true };
    if (!r.conflict) throw new Error(`Could not create an organization Plajah ID (HTTP ${r.status}).`);
  }
  throw new Error('Could not create an organization Plajah ID.');
}

/** Append one event. The next sequence slot is "must not exist", so two concurrent appends can't fork the chain. */
export async function appendEvent(id: string, type: IdentityEventType, actor: string, data: Record<string, unknown>, extra: Record<string, unknown> = {}): Promise<IdentityEvent> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const rec = await getIdentity(id);
    if (!rec) throw new Error('No such identity.');
    const e = nextEvent(id, { seq: rec.headSeq, hash: rec.headHash }, type, actor, data);
    const r = await fsCommit([
      { path: histPath(id, e.seq), mustNotExist: true, data: eventDoc(e) },
      { path: `identities/${id}`, mask: ['headSeq', 'headHash', ...Object.keys(extra)], data: { headSeq: e.seq, headHash: e.hash, ...extra } },
    ]);
    if (r.ok) return e;
    if (!r.conflict) throw new Error(`Could not record the event (HTTP ${r.status}).`);
  }
  throw new Error('Could not record the event (busy).');
}

/** The full history, oldest first, and whether its hash chain verifies. */
export async function readHistory(id: string): Promise<{ events: IdentityEvent[]; verified: boolean; brokenAt?: number; reason?: string }> {
  const docs = await fsList(`identities/${id}/history`, { pageSize: 300, maxDocs: 5000, strict: true });
  const events = docs.map(d => d.data as IdentityEvent).sort((a, b) => a.seq - b.seq);
  const v = verifyChain(id, events);
  return v.ok ? { events, verified: true } : { events, verified: false, brokenAt: v.brokenAt, reason: v.reason };
}
