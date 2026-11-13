// services/edu/extensions.ts — extension requests (plajah-ops churchEduExtensions/{assignmentId}__{uid}).
// After the due date a locked assignment can't be turned in; the student asks here, the class's teachers
// grant a new deadline or deny. The database rules read the granted deadline when the student turns in.
// Every request and decision goes to the class ledger.

import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { auth, opsDb } from '../firebase';
import { logEduEvent } from './eduLedger';
import type { ExtensionStatus } from './assignmentPolicy';

export interface ExtensionRequest {
  id: string;
  orgId: string;
  programId: string;
  assignmentId: string;
  assignmentTitle: string;
  studentUid: string;
  studentName: string;
  reason: string;
  status: ExtensionStatus;
  requestedAt: number;
  extendedUntil?: number;
  decidedByUid?: string;
  decidedAt?: number;
  note?: string;
}

export const extensionId = (assignmentId: string, uid: string) => `${assignmentId}__${uid}`;
const COL = 'churchEduExtensions';

export async function fetchMyExtension(assignmentId: string): Promise<ExtensionRequest | null> {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  try {
    const s = await getDoc(doc(opsDb, COL, extensionId(assignmentId, uid)));
    return s.exists() ? (s.data() as ExtensionRequest) : null;
  } catch {
    return null;
  }
}

export async function fetchMyClassExtensions(programId: string): Promise<ExtensionRequest[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  try {
    const snap = await getDocs(query(collection(opsDb, COL), where('programId', '==', programId), where('studentUid', '==', uid)));
    return snap.docs.map(d => d.data() as ExtensionRequest);
  } catch {
    return [];
  }
}

/** Teacher side: every request in a class. */
export async function fetchClassExtensions(programId: string): Promise<ExtensionRequest[]> {
  try {
    const snap = await getDocs(query(collection(opsDb, COL), where('programId', '==', programId)));
    return snap.docs.map(d => d.data() as ExtensionRequest).sort((a, b) => b.requestedAt - a.requestedAt);
  } catch {
    return [];
  }
}

export async function requestExtension(a: { id: string; orgId: string; classroomId: string; title: string }, reason: string, studentName: string, existing?: ExtensionRequest | null): Promise<ExtensionRequest> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in first.');
  const text = reason.trim().slice(0, 1000);
  const id = extensionId(a.id, uid);
  const now = Date.now();
  let rec: ExtensionRequest;
  if (existing) {
    // Asking again after a denial: only the request fields change.
    await updateDoc(doc(opsDb, COL, id), { status: 'requested', reason: text, requestedAt: now, decidedByUid: '', decidedAt: 0, note: '' });
    rec = { ...existing, status: 'requested', reason: text, requestedAt: now, decidedByUid: '', decidedAt: 0, note: '' };
  } else {
    rec = { id, orgId: a.orgId, programId: a.classroomId, assignmentId: a.id, assignmentTitle: a.title, studentUid: uid, studentName, reason: text, status: 'requested', requestedAt: now };
    await setDoc(doc(opsDb, COL, id), rec);
  }
  void logEduEvent({ orgId: a.orgId, programId: a.classroomId, assignmentId: a.id, assignmentTitle: a.title, studentUid: uid, event: 'extension_requested', actorName: studentName, detail: { reason: text } });
  return rec;
}

export async function decideExtension(r: ExtensionRequest, grant: boolean, extendedUntil: number | null, note = ''): Promise<ExtensionRequest> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in first.');
  const now = Date.now();
  const patch = grant
    ? { status: 'granted' as const, extendedUntil: Math.round(extendedUntil || now + 2 * 86_400_000), decidedByUid: uid, decidedAt: now, note: note.trim().slice(0, 500) }
    : { status: 'denied' as const, decidedByUid: uid, decidedAt: now, note: note.trim().slice(0, 500) };
  await updateDoc(doc(opsDb, COL, r.id), patch);
  void logEduEvent({
    orgId: r.orgId, programId: r.programId, assignmentId: r.assignmentId, assignmentTitle: r.assignmentTitle, studentUid: r.studentUid,
    event: grant ? 'extension_granted' : 'extension_denied',
    detail: { student: r.studentName, ...(grant ? { extendedUntil: patch.extendedUntil as number } : {}), ...(note ? { note } : {}) },
  });
  return { ...r, ...patch };
}
