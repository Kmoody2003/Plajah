// services/coedit/audit.ts — a document's paper trail: who shared, opened, exported or lost access, and what was blocked.
//
//   docAudit/{projectId}/events/{id}   plajah-ops; only the server writes it, with the name from the account
//
// Nobody can edit or delete an event, the document's owner included, and it outlives the document. The owner and the
// org's IT Admins read it. Sharing, revoking, leaving and deleting are recorded by the server as they happen. Opens
// and exports are reported by the person's app, so someone running a modified client could skip theirs.

import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { auth, opsDb } from '../firebase';

export const DOC_AUDIT = 'docAudit';

export type DocAuditAction =
  | 'shared' | 'role_changed' | 'access_revoked' | 'all_access_revoked' | 'access_expiry_set' | 'access_ended_copy_removed'
  | 'opened' | 'exported' | 'threat_blocked'
  | 'left' | 'deleted' | 'custody_transferred' | 'shared_outside_org' | 'media_published' | 'media_sent_to_chat';

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
  left: 'Left the document',
  deleted: 'Deleted the document',
  custody_transferred: 'Document passed to the organization',
  shared_outside_org: 'Shared outside the organization',
  media_published: 'Made its images public',
  media_sent_to_chat: 'Sent its images to a chat',
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
  if (!u || !ref.pid) return;
  try {
    const res = await fetch('/api/coedit/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await u.getIdToken()}` },
      body: JSON.stringify({ pid: ref.pid, action, detail: detail.slice(0, 300) }),
      keepalive: true,
    });
    if (!res.ok) console.warn('[audit] could not record', action, res.status);
  } catch (e) {
    console.warn('[audit] could not record', action, e);
  }
}

/** The trail, newest first. Queried the way rules allow it: as the owner, or as the org's IT Admin. */
export async function listDocAudit(ref: DocAuditRef, max = 300): Promise<DocAuditEvent[]> {
  const uid = auth.currentUser?.uid;
  const events = collection(opsDb, DOC_AUDIT, ref.pid, 'events');
  const asOrg = () => getDocs(query(events, where('orgId', '==', ref.orgId || '-'), orderBy('at', 'desc'), limit(max)));
  const asOwner = () => getDocs(query(events, where('ownerId', '==', ref.ownerId), orderBy('at', 'desc'), limit(max)));
  // An org's steward sees the whole trail, including events from before custody passed to them.
  const snap = ref.orgId ? await asOrg().catch(() => asOwner()) : uid === ref.ownerId ? await asOwner() : await asOrg();
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
