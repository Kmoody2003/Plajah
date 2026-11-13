// services/edu/eduLedger.ts — the class ledger (plajah-ops churchEduLedger): an add-only record of every
// scheduling, availability, due-date, turn-in and extension event in a Christian Ed class. Nobody edits or
// deletes an entry (firestore.ops.rules); teachers see the class's, students their own. Best-effort: a
// failed write never blocks the action it records.

import { addDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { auth, opsDb } from '../firebase';

export type LedgerEvent =
  | 'assigned' | 'rescheduled' | 'auto_scheduled' | 'unassigned' | 'policy_changed'
  | 'turned_in' | 'turned_in_late' | 'turn_in_refused'
  | 'extension_requested' | 'extension_granted' | 'extension_denied'
  | 'returned' | 'opened';

export interface LedgerEntry {
  id?: string;
  orgId: string;
  programId: string;
  assignmentId: string;
  assignmentTitle?: string;
  /** The student it is about, for student events and extension decisions. */
  studentUid?: string;
  actorUid: string;
  actorName: string;
  event: LedgerEvent;
  /** What changed, in plain values: dates as ms, the after-due rule, a reason, a new deadline. */
  detail?: Record<string, string | number | boolean | null>;
  at: number;
}

export const LEDGER_LABEL: Record<LedgerEvent, string> = {
  assigned: 'Assigned',
  rescheduled: 'Dates changed',
  auto_scheduled: 'Auto-scheduled',
  unassigned: 'Unassigned',
  policy_changed: 'After-due rule changed',
  turned_in: 'Turned in',
  turned_in_late: 'Turned in late',
  turn_in_refused: 'Turn-in refused (past due)',
  extension_requested: 'Extension requested',
  extension_granted: 'Extension granted',
  extension_denied: 'Extension denied',
  returned: 'Returned with feedback',
  opened: 'Opened',
};

const clean = (d?: LedgerEntry['detail']) =>
  d ? Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)) : undefined;

export async function logEduEvent(e: Omit<LedgerEntry, 'actorUid' | 'actorName' | 'at' | 'id'> & { actorName?: string }): Promise<void> {
  const user = auth.currentUser;
  if (!user || !e.programId) return;
  const entry: LedgerEntry = {
    ...e,
    actorUid: user.uid,
    actorName: e.actorName || user.displayName || 'Teacher',
    at: Date.now(),
    ...(e.detail ? { detail: clean(e.detail) } : {}),
  };
  if (!entry.studentUid) delete entry.studentUid;
  if (!entry.assignmentTitle) delete entry.assignmentTitle;
  try {
    await addDoc(collection(opsDb, 'churchEduLedger'), entry);
  } catch {
    /* offline or not allowed: the action itself still happened */
  }
}

/** A class's ledger, newest first (teachers). */
export async function fetchClassLedger(programId: string): Promise<LedgerEntry[]> {
  try {
    const snap = await getDocs(query(collection(opsDb, 'churchEduLedger'), where('programId', '==', programId)));
    return snap.docs.map(d => ({ ...(d.data() as LedgerEntry), id: d.id })).sort((a, b) => b.at - a.at);
  } catch {
    return [];
  }
}

/** A student's own entries in a class. */
export async function fetchMyLedger(programId: string): Promise<LedgerEntry[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  try {
    const snap = await getDocs(query(collection(opsDb, 'churchEduLedger'), where('programId', '==', programId), where('studentUid', '==', uid)));
    return snap.docs.map(d => ({ ...(d.data() as LedgerEntry), id: d.id })).sort((a, b) => b.at - a.at);
  } catch {
    return [];
  }
}
