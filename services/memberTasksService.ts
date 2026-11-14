// memberTasksService — what a member has to do for one organization, from real records only:
//   • their own to-dos (memberTasks, cloud-saved so every signed-in device sees the same list)
//   • volunteer shifts they're scheduled on (chmsShifts.assignedUids)
//   • care tasks a pastor/staff member assigned to them (chmsTasks.assignedUid)
// Nothing here is invented; an empty result means the member really has nothing listed.
import { collection, doc, getDocs, query, where, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { opsDb, auth } from './firebase';

export type MemberTaskSource = 'OWN' | 'SHIFT' | 'CARE';

export interface MemberTaskItem {
  /** Unique across sources: `${source}:${docId}`. */
  key: string;
  source: MemberTaskSource;
  docId: string;
  orgId: string;
  title: string;
  ministryId?: string;
  /** ISO date (YYYY-MM-DD) when known. */
  dueDate?: string;
  dueTime?: string;
  done: boolean;
  /** Shift only: the member's answer on the schedule. */
  shiftStatus?: 'PENDING' | 'CONFIRMED' | 'DECLINED';
  positionName?: string;
  createdAt: number;
}

/** Stored shape of a member's own to-do. */
export interface MemberTaskDoc {
  id: string;
  uid: string;
  orgId: string;
  title: string;
  ministryId?: string;
  dueDate?: string;
  done: boolean;
  createdAt: number;
  updatedAt: number;
  doneAt?: number | null;
}

const newId = () => `mt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
const clean = <T extends object>(o: T): T => JSON.parse(JSON.stringify(o));

async function fetchOwn(orgId: string, uid: string): Promise<MemberTaskItem[]> {
  const snap = await getDocs(query(collection(opsDb, 'memberTasks'), where('uid', '==', uid), where('orgId', '==', orgId)));
  return snap.docs.map(d => {
    const t = d.data() as MemberTaskDoc;
    return {
      key: `OWN:${d.id}`, source: 'OWN' as const, docId: d.id, orgId, title: t.title, ministryId: t.ministryId,
      dueDate: t.dueDate, done: !!t.done, createdAt: t.createdAt || 0,
    };
  });
}

async function fetchShifts(orgId: string, uid: string): Promise<MemberTaskItem[]> {
  const snap = await getDocs(query(collection(opsDb, 'chmsShifts'), where('orgId', '==', orgId), where('assignedUids', 'array-contains', uid)));
  const out: MemberTaskItem[] = [];
  for (const d of snap.docs) {
    const s = d.data() as { title: string; date: string; time?: string; ministryId?: string; createdAt?: number;
      positions?: Array<{ id: string; name: string }>; assignments?: Array<{ uid?: string; positionId: string; status: 'PENDING' | 'CONFIRMED' | 'DECLINED' }> };
    const mine = (s.assignments || []).find(a => a.uid === uid);
    if (!mine || mine.status === 'DECLINED') continue;
    out.push({
      key: `SHIFT:${d.id}`, source: 'SHIFT', docId: d.id, orgId, title: s.title, ministryId: s.ministryId,
      dueDate: s.date, dueTime: s.time, done: false, shiftStatus: mine.status,
      positionName: (s.positions || []).find(p => p.id === mine.positionId)?.name,
      createdAt: s.createdAt || 0,
    });
  }
  return out;
}

async function fetchCare(orgId: string, uid: string): Promise<MemberTaskItem[]> {
  const snap = await getDocs(query(collection(opsDb, 'chmsTasks'), where('orgId', '==', orgId), where('assignedUid', '==', uid)));
  return snap.docs.map(d => {
    const t = d.data() as { title: string; personName?: string; dueDate?: string; status?: string; createdAt?: number };
    return {
      key: `CARE:${d.id}`, source: 'CARE' as const, docId: d.id, orgId,
      title: t.personName ? `${t.title} — ${t.personName}` : t.title,
      dueDate: t.dueDate, done: t.status === 'DONE', createdAt: t.createdAt || 0,
    };
  });
}

export interface MemberTasksResult {
  items: MemberTaskItem[];
  /** True when the list could not be loaded at all (signed out / offline). */
  failed: boolean;
}

/** Everything this member has to do for this org. Each source loads on its own; one failing doesn't hide the others. */
export async function loadMemberTasks(orgId: string): Promise<MemberTasksResult> {
  const uid = auth.currentUser?.uid;
  if (!uid) return { items: [], failed: true };
  const results = await Promise.allSettled([fetchOwn(orgId, uid), fetchShifts(orgId, uid), fetchCare(orgId, uid)]);
  const items = results.flatMap(r => (r.status === 'fulfilled' ? r.value : []));
  const failed = results.every(r => r.status === 'rejected');
  items.sort((a, b) => Number(a.done) - Number(b.done) || (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || b.createdAt - a.createdAt);
  return { items, failed };
}

export async function addMemberTask(orgId: string, input: { title: string; ministryId?: string; dueDate?: string }): Promise<MemberTaskItem> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in to save tasks.');
  const id = newId();
  const now = Date.now();
  const rec: MemberTaskDoc = clean({
    id, uid, orgId, title: input.title.trim().slice(0, 300), ministryId: input.ministryId || undefined,
    dueDate: input.dueDate || undefined, done: false, createdAt: now, updatedAt: now,
  });
  await setDoc(doc(opsDb, 'memberTasks', id), rec);
  return { key: `OWN:${id}`, source: 'OWN', docId: id, orgId, title: rec.title, ministryId: rec.ministryId, dueDate: rec.dueDate, done: false, createdAt: now };
}

/** Tick a to-do or care task done / not done. Shifts are answered on the schedule, not ticked here. */
export async function setMemberTaskDone(item: MemberTaskItem, done: boolean): Promise<void> {
  if (item.source === 'OWN') {
    await updateDoc(doc(opsDb, 'memberTasks', item.docId), { done, doneAt: done ? Date.now() : null, updatedAt: Date.now() });
  } else if (item.source === 'CARE') {
    await updateDoc(doc(opsDb, 'chmsTasks', item.docId), { status: done ? 'DONE' : 'OPEN', doneAt: done ? Date.now() : null });
  }
}

export async function deleteMemberTask(item: MemberTaskItem): Promise<void> {
  if (item.source !== 'OWN') return;
  await deleteDoc(doc(opsDb, 'memberTasks', item.docId));
}

/** Friendly due label from an ISO date + optional time ("Today", "Sun, Nov 9 · 9:15 AM"). */
export function dueLabel(item: Pick<MemberTaskItem, 'dueDate' | 'dueTime'>, now = new Date()): string {
  if (!item.dueDate) return '';
  const [y, m, d] = item.dueDate.split('-').map(Number);
  if (!y || !m || !d) return item.dueDate;
  const date = new Date(y, m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((date.getTime() - today.getTime()) / 86_400_000);
  const day = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days === -1 ? 'Yesterday'
    : date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return item.dueTime ? `${day} · ${item.dueTime}` : day;
}

export const isOverdue = (item: Pick<MemberTaskItem, 'dueDate' | 'done'>, now = new Date()): boolean => {
  if (item.done || !item.dueDate) return false;
  const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return item.dueDate < iso;
};
