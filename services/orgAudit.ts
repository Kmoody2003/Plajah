// orgAudit — an append-only trail of sensitive org actions (who did what, when).
//
// Every role change / employee add-remove / accept-decline / money setting / page edit
// logs here so a business owner can see exactly what their staff have done. Stored under
// organizations/{orgId}/audit. Best-effort: logging never blocks the action it records.

import { collection, doc, setDoc, getDocs, query, orderBy, limit as fbLimit } from 'firebase/firestore';
import { db, auth } from './firebase';

export type OrgAuditAction =
  | 'EMPLOYEE_ADDED' | 'EMPLOYEE_REMOVED' | 'ROLE_CHANGED'
  | 'MEMBER_ACCEPTED' | 'MEMBER_DECLINED' | 'MEMBER_APPLIED'
  | 'EMPLOYEE_CLAIMED' | 'PAGE_EDITED' | 'MONEY_SETTING' | 'ADMIN_CHANGED';

export interface OrgAuditEntry {
  id: string;
  orgId: string;
  actorUid: string;
  actorName?: string;
  action: OrgAuditAction;
  targetId?: string;       // membership id / user id acted upon
  targetName?: string;
  meta?: Record<string, any>;
  timestamp: number;
}

function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as T;
}

/** Record an org action. Never throws — auditing must not break the operation it logs. */
export async function logOrgAction(
  orgId: string,
  action: OrgAuditAction,
  opts?: { targetId?: string; targetName?: string; meta?: Record<string, any> },
): Promise<void> {
  if (!auth.currentUser || !orgId) return;
  try {
    const ref = doc(collection(db, 'organizations', orgId, 'audit'));
    const entry: OrgAuditEntry = {
      id: ref.id,
      orgId,
      actorUid: auth.currentUser.uid,
      actorName: auth.currentUser.displayName || '',
      action,
      targetId: opts?.targetId,
      targetName: opts?.targetName,
      meta: opts?.meta,
      timestamp: Date.now(),
    };
    await setDoc(ref, stripUndefined(entry));
  } catch { /* non-fatal */ }
}

/** The org's recent audit trail, newest first (owner/admin surface). */
export async function fetchOrgAudit(orgId: string, max = 100): Promise<OrgAuditEntry[]> {
  try {
    const snap = await getDocs(query(collection(db, 'organizations', orgId, 'audit'), orderBy('timestamp', 'desc'), fbLimit(max)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as OrgAuditEntry));
  } catch {
    return [];
  }
}
