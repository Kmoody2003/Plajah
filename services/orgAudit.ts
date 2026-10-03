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
  | 'EMPLOYEE_CLAIMED' | 'PAGE_EDITED' | 'MONEY_SETTING' | 'ADMIN_CHANGED'
  | 'CHMS_VIEW_SENSITIVE' | 'CHMS_MERGE' | 'CHMS_EXPORT' | 'CHMS_BROADCAST'
  // Elevate ChMS Finance Hub (services/chmsFinance.ts)
  | 'FIN_GIFT_ENTERED' | 'FIN_BATCH_OPENED' | 'FIN_BATCH_POSTED' | 'FIN_BATCH_DEPOSITED' | 'FIN_BATCH_OVERRIDE'
  | 'FIN_VOID_REQUESTED' | 'FIN_VOID' | 'FIN_VOID_REJECTED' | 'FIN_APPROVED' | 'FIN_PLEDGE' | 'FIN_TRANSFER' | 'FIN_PAYOUT'
  | 'FIN_STATEMENT' | 'FIN_EXPORT' | 'FIN_SETTINGS' | 'FIN_CARE_FLAG' | 'FIN_IMPORT'
  // Spending (services/acctSpending.ts)
  | 'FIN_EXP_SUBMITTED' | 'FIN_EXP_APPROVED' | 'FIN_EXP_REJECTED' | 'FIN_EXP_PAID' | 'FIN_EXP_BOOKED' | 'FIN_EXP_VOID'
  | 'FIN_VENDOR' | 'FIN_RECURRING' | 'FIN_ACCOUNTANT_INVITE' | 'FIN_SETUP'
  // Elevate Books (services/acctService.ts)
  | 'ACCT_POST' | 'ACCT_REVERSE' | 'ACCT_CLOSE' | 'ACCT_REOPEN' | 'ACCT_EXPORT' | 'ACCT_SETUP' | 'ACCT_BANK' | 'ACCT_BUDGET' | 'ACCT_BACKFILL';

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
