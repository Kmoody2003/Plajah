// services/classMedia.ts — a class's Media Gallery: photos, videos, audio, recorded sessions and links, each
// optionally filed under a lesson so the gallery can be browsed lesson by lesson (or all at once).
//
//   classMedia/{id}   orgId, programId, kind, title, url, lessonId/lessonTitle, author, createdAt
//
// Files go to Storage under uploads/organizations/{orgId}/classes/{programId}/media/ (backendService.uploadFile).
// Rules: firestore.ops.rules `classMedia` — the class's teachers add and remove; teachers and students read.

import { collection, deleteDoc, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { auth, opsDb } from './firebase';
import { uploadFile } from './backendService';

export type ClassMediaKind = 'photo' | 'video' | 'audio' | 'recording' | 'link' | 'document';

export interface ClassMediaItem {
  id: string;
  orgId: string;
  programId: string;
  kind: ClassMediaKind;
  title: string;
  url: string;
  mime?: string;
  sizeBytes?: number;
  /** The lesson it belongs to (a library lesson id), for the gallery's by-lesson view. */
  lessonId?: string;
  lessonTitle?: string;
  authorUid: string;
  authorName: string;
  createdAt: number;
}

const COL = 'classMedia';
const strip = <T,>(o: T): T => JSON.parse(JSON.stringify(o));

export function kindForFile(f: { type?: string; name: string }): ClassMediaKind {
  const t = f.type || '';
  if (t.startsWith('image/')) return 'photo';
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('audio/')) return 'audio';
  if (/\.(png|jpe?g|gif|webp|heic|avif)$/i.test(f.name)) return 'photo';
  if (/\.(mp4|mov|webm|m4v)$/i.test(f.name)) return 'video';
  if (/\.(mp3|m4a|wav|aac|ogg|flac)$/i.test(f.name)) return 'audio';
  return 'document';
}

export function kindForUrl(url: string): ClassMediaKind {
  const path = (() => { try { return new URL(url).pathname; } catch { return url; } })();
  if (/\.(png|jpe?g|gif|webp|avif)$/i.test(path)) return 'photo';
  if (/\.(mp4|mov|webm|m4v)$/i.test(path) || /youtube\.com|youtu\.be|vimeo\.com/i.test(url)) return 'video';
  if (/\.(mp3|m4a|wav|aac|ogg)$/i.test(path)) return 'audio';
  return 'link';
}

export async function listClassMedia(programId: string): Promise<ClassMediaItem[]> {
  try {
    const snap = await getDocs(query(collection(opsDb, COL), where('programId', '==', programId)));
    return snap.docs.map(d => d.data() as ClassMediaItem).sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export async function addClassMedia(item: Omit<ClassMediaItem, 'id' | 'authorUid' | 'authorName' | 'createdAt'>): Promise<ClassMediaItem | null> {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  const now = Date.now();
  const full: ClassMediaItem = {
    ...item,
    title: item.title.trim().slice(0, 200) || 'Untitled',
    id: `m_${now.toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    authorUid: uid,
    authorName: auth.currentUser?.displayName || 'Teacher',
    createdAt: now,
  };
  try {
    await setDoc(doc(opsDb, COL, full.id), strip(full));
    return full;
  } catch {
    return null;
  }
}

/** Uploads a file into the class's media folder and adds it to the gallery. */
export async function uploadClassMedia(file: File, ctx: { orgId: string; programId: string; lessonId?: string; lessonTitle?: string; title?: string; kind?: ClassMediaKind }, onProgress?: (p: number) => void): Promise<ClassMediaItem | null> {
  const url = await uploadFile(`organizations/${ctx.orgId}/classes/${ctx.programId}/media/${Date.now()}_${file.name}`, file, onProgress);
  return addClassMedia({
    orgId: ctx.orgId,
    programId: ctx.programId,
    kind: ctx.kind || kindForFile(file),
    title: ctx.title || file.name.replace(/\.[a-z0-9]+$/i, ''),
    url,
    mime: file.type || undefined,
    sizeBytes: file.size,
    ...(ctx.lessonId ? { lessonId: ctx.lessonId, lessonTitle: ctx.lessonTitle } : {}),
  });
}

export async function updateClassMediaLesson(item: ClassMediaItem, lesson: { id: string; title: string } | null): Promise<void> {
  const { lessonId: _l, lessonTitle: _t, ...rest } = item;
  await setDoc(doc(opsDb, COL, item.id), strip(lesson ? { ...rest, lessonId: lesson.id, lessonTitle: lesson.title } : rest));
}

export async function removeClassMedia(item: ClassMediaItem): Promise<void> {
  await deleteDoc(doc(opsDb, COL, item.id));
}
