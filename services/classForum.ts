// services/classForum.ts — a class's discussion board (Christian Ed classes): threads and replies, like a
// forum. Every lesson posted or assigned to the class gets its own thread (ensureLessonThread), and anyone in
// the class can start a discussion or share a resource: a lesson from the library (key-free, opened in full in
// desk view), a syllabus, or links.
//
//   classThreads/{threadId}                 orgId, programId, kind, title, body, attachments, votes, counts
//   classThreads/{threadId}/replies/{id}    a reply (one level of nesting via parentId)
//
// Rules: firestore.ops.rules `classThreads` — the class's teachers and students read and post; authors edit
// their own; teachers pin, lock and remove. Answer keys never ride along (withoutKeys).

import {
  collection, deleteDoc, doc, getDoc, getDocs, increment, orderBy, query, setDoc, updateDoc, where, arrayRemove, arrayUnion,
} from 'firebase/firestore';
import { auth, opsDb } from './firebase';
import type { IngestedCurriculumUnit } from './curriculumIngestionService';
import { withoutKeys } from './christianEdSync';

export type ThreadKind = 'discussion' | 'lesson' | 'resource';

export type ThreadAttachment =
  | { kind: 'lesson'; unitId: string; title: string; unitJson: string }
  | { kind: 'link'; url: string; title: string };

export interface ClassThread {
  id: string;
  orgId: string;
  programId: string;
  kind: ThreadKind;
  title: string;
  body: string;
  authorUid: string;
  authorName: string;
  attachments: ThreadAttachment[];
  /** The desk assignment a lesson thread belongs to. */
  assignmentId?: string;
  upvoterUids: string[];
  replyCount: number;
  pinned?: boolean;
  locked?: boolean;
  createdAt: number;
  lastActivityAt: number;
}

export interface ThreadReply {
  id: string;
  threadId: string;
  programId: string;
  parentId?: string;
  body: string;
  authorUid: string;
  authorName: string;
  upvoterUids: string[];
  createdAt: number;
  editedAt?: number;
}

const COL = 'classThreads';
const MAX_UNIT_JSON = 600_000;
const strip = <T,>(o: T): T => JSON.parse(JSON.stringify(o));
const me = () => ({ uid: auth.currentUser?.uid || '', name: auth.currentUser?.displayName || 'Member' });

/** A lesson as an attachment students can open in full: the class copy, without answer keys or raw source. */
export function lessonAttachment(u: IngestedCurriculumUnit): ThreadAttachment | null {
  const { rawAnswerKeyText: _k, sacredLibrarySupplements: _s, ...rest } = u;
  const unitJson = JSON.stringify(withoutKeys(rest));
  return unitJson.length > MAX_UNIT_JSON ? null : { kind: 'lesson', unitId: u.id, title: u.title, unitJson };
}

export function attachedUnit(a: ThreadAttachment): IngestedCurriculumUnit | null {
  if (a.kind !== 'lesson') return null;
  try { return JSON.parse(a.unitJson) as IngestedCurriculumUnit; } catch { return null; }
}

/** Throws when the board can't be read, so a refusal isn't mistaken for an empty board. */
export async function fetchThreads(programId: string): Promise<ClassThread[]> {
  const snap = await getDocs(query(collection(opsDb, COL), where('programId', '==', programId)));
  return snap.docs.map(d => d.data() as ClassThread);
}

export async function listThreads(programId: string): Promise<ClassThread[]> {
  return fetchThreads(programId).catch(() => []);
}

export async function createThread(t: { orgId: string; programId: string; kind: ThreadKind; title: string; body: string; attachments: ThreadAttachment[]; id?: string; assignmentId?: string }): Promise<ClassThread | null> {
  const who = me();
  if (!who.uid) return null;
  const now = Date.now();
  const id = t.id || `t_${now.toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const thread: ClassThread = {
    id, orgId: t.orgId, programId: t.programId, kind: t.kind, title: t.title.trim().slice(0, 200), body: t.body.trim().slice(0, 20_000),
    authorUid: who.uid, authorName: who.name, attachments: t.attachments.slice(0, 12), ...(t.assignmentId ? { assignmentId: t.assignmentId } : {}),
    upvoterUids: [], replyCount: 0, createdAt: now, lastActivityAt: now,
  };
  try {
    await setDoc(doc(opsDb, COL, id), strip(thread));
    return thread;
  } catch {
    return null;
  }
}

/**
 * The thread every lesson gets when it's posted or assigned to a class (one per assignment; created once).
 * Called by the teacher's device when it mirrors the assignment.
 */
export async function ensureLessonThread(a: { id: string; orgId: string; classroomId: string; title: string; instructions?: string; dueLabel?: string; unitSnapshot: IngestedCurriculumUnit }): Promise<void> {
  if (!auth.currentUser) return;
  const id = `lesson_${a.id}`.replace(/\//g, '_');
  try {
    if ((await getDoc(doc(opsDb, COL, id))).exists()) return;
    const att = lessonAttachment(a.unitSnapshot);
    await createThread({
      id, orgId: a.orgId, programId: a.classroomId, kind: 'lesson', assignmentId: a.id,
      title: a.title, body: [a.instructions, a.dueLabel ? `Due: ${a.dueLabel}` : ''].filter(Boolean).join('\n\n'),
      attachments: att ? [att] : [],
    });
  } catch {
    /* not a teacher of the class, or offline */
  }
}

export async function updateThread(t: ClassThread, patch: Partial<Pick<ClassThread, 'title' | 'body' | 'attachments' | 'pinned' | 'locked'>>): Promise<void> {
  await updateDoc(doc(opsDb, COL, t.id), strip(patch));
}

export async function deleteThread(t: ClassThread): Promise<void> {
  await deleteDoc(doc(opsDb, COL, t.id));
}

export async function toggleThreadVote(t: ClassThread): Promise<void> {
  const uid = me().uid;
  if (!uid) return;
  await updateDoc(doc(opsDb, COL, t.id), { upvoterUids: t.upvoterUids.includes(uid) ? arrayRemove(uid) : arrayUnion(uid) });
}

export async function listReplies(threadId: string): Promise<ThreadReply[]> {
  try {
    const snap = await getDocs(query(collection(opsDb, COL, threadId, 'replies'), orderBy('createdAt', 'asc')));
    return snap.docs.map(d => d.data() as ThreadReply);
  } catch {
    return [];
  }
}

export async function addReply(t: ClassThread, body: string, parentId?: string): Promise<ThreadReply | null> {
  const who = me();
  if (!who.uid || !body.trim()) return null;
  const now = Date.now();
  const r: ThreadReply = {
    id: `r_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`, threadId: t.id, programId: t.programId,
    ...(parentId ? { parentId } : {}), body: body.trim().slice(0, 10_000), authorUid: who.uid, authorName: who.name, upvoterUids: [], createdAt: now,
  };
  try {
    await setDoc(doc(opsDb, COL, t.id, 'replies', r.id), strip(r));
    await updateDoc(doc(opsDb, COL, t.id), { replyCount: increment(1), lastActivityAt: now }).catch(() => {});
    return r;
  } catch {
    return null;
  }
}

export async function deleteReply(t: ClassThread, r: ThreadReply): Promise<void> {
  await deleteDoc(doc(opsDb, COL, t.id, 'replies', r.id));
  await updateDoc(doc(opsDb, COL, t.id), { replyCount: increment(-1) }).catch(() => {});
}

export async function toggleReplyVote(t: ClassThread, r: ThreadReply): Promise<void> {
  const uid = me().uid;
  if (!uid) return;
  await updateDoc(doc(opsDb, COL, t.id, 'replies', r.id), { upvoterUids: r.upvoterUids.includes(uid) ? arrayRemove(uid) : arrayUnion(uid) });
}
