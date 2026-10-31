// services/coedit/audit.ts — a document's paper trail: who shared, opened, exported or lost access, and what was blocked.
//
//   docAudit/{projectId}/events/{id}   plajah-ops; rules allow adding only, in your own name, stamped with server time
//
// Nobody can edit or delete an event, the document's owner included, and it outlives the document. The owner and the
// org's IT Admins read it. A person's own app records events, so someone running a modified client could skip theirs;
// the record of what was written is what's protected.

import { addDoc, collection, getDocs, limit, orderBy, query, serverTimestamp, where } from 'firebase/firestore';
import { auth, opsDb } from '../firebase';

export const DOC_AUDIT = 'docAudit';

export type DocAuditAction =
  | 'shared' | 'role_changed' | 'access_revoked' | 'all_access_revoked' | 'access_expiry_set' | 'access_ended_copy_removed'
  | 'opened' | 'exported' | 'threat_blocked';

export const AUDIT_LABEL: Record<DocAuditAction, string> = {
  shared: 'Shared',
  role_changed: 'Changed access level',
  access_revoked: 'Revoked access',
  all_access_revoked: 'Revoked everyone',
  access_expiry_set: 'Set access end date',
  access_ended_copy_removed: 'Removed a copy from a device',
  opened: 'Opened',
  exported: 'Exported',
  threat_blocked: 'Blocked unsafe content',
};

export interface DocAuditEvent {
  id: string;
  pid: string;
  action: DocAuditAction;
  by: string;
  byName: string;
  at: number;
  detail: string;
  ownerId: string;
  orgId?: string;
}

export interface DocAuditRef { pid: string; ownerId: string; orgId?: string }

/** Adds to the trail. Never throws: a failed log must not stop someone's work. */
export async function logDocEvent(ref: DocAuditRef, action: DocAuditAction, detail = ''): Promise<void> {
  const u = auth.currentUser;
  if (!u || !ref.pid || !ref.ownerId) return;
  try {
    await addDoc(collection(opsDb, DOC_AUDIT, ref.pid, 'events'), {
      pid: ref.pid,
      action,
      by: u.uid,
      byName: u.displayName || 'Member',
      at: serverTimestamp(),
      detail: detail.slice(0, 300),
      ownerId: ref.ownerId,
      ...(ref.orgId ? { orgId: ref.orgId } : {}),
    });
  } catch (e) {
    console.warn('[audit] could not record', action, e);
  }
}

/** The trail, newest first. Queried the way rules allow it: as the owner, or as the org's IT Admin. */
export async function listDocAudit(ref: DocAuditRef, max = 300): Promise<DocAuditEvent[]> {
  const uid = auth.currentUser?.uid;
  const scope = uid === ref.ownerId ? where('ownerId', '==', ref.ownerId) : where('orgId', '==', ref.orgId || '-');
  const snap = await getDocs(query(collection(opsDb, DOC_AUDIT, ref.pid, 'events'), scope, orderBy('at', 'desc'), limit(max)));
  return snap.docs.map((d) => {
    const data = d.data();
    return { ...(data as DocAuditEvent), id: d.id, at: typeof data.at === 'number' ? data.at : data.at?.toMillis?.() ?? 0 };
  }).sort((a, b) => b.at - a.at);
}

/** Records an export of a Tela document. */
export function logTelaExport(doc: { id: string; ownerId?: string; orgOrigin?: { orgId?: string } }, what: string) {
  void logDocEvent({ pid: `tela__${doc.id}`, ownerId: doc.ownerId || '', ...(doc.orgOrigin?.orgId ? { orgId: doc.orgOrigin.orgId } : {}) }, 'exported', what);
}

export function auditCsv(events: DocAuditEvent[]): string {
  // A leading quote stops a spreadsheet treating a name or detail as a formula.
  const cell = (v: string) => `"${(/^[=+\-@]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;
  const rows = events.map((e) => [new Date(e.at).toISOString(), AUDIT_LABEL[e.action] || e.action, e.byName, e.by, e.detail].map(cell).join(','));
  return ['When,Action,Person,Person ID,Detail', ...rows].join('\r\n');
}
