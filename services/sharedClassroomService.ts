// services/sharedClassroomService.ts
// Shared Club-Model Classroom Infrastructure for BOTH Academia and Elevate Christian Education.
// Models each classroom off Plajah Clubs (Social Feed, Photos Gallery, Roster, Chat, and Live Stream),
// confined to the classroom's Teacher and enrolled Students, with a Special Interactive Lecture Live Mode:
// - Video Lecture Mode: students raise hand and come on camera to answer
// - Audio Lecture Mode (repurposed Live Talk stage): students raise hand and come on mic to answer
// - Both modes include Screen Sharing (getDisplayMedia) and an Interactive Digital Whiteboard.

import { auth, db, opsDb, storage } from './firebase';
import { ref as storageRef, uploadBytesResumable } from 'firebase/storage';
import {
  arrayRemove, arrayUnion, collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, setDoc, updateDoc,
} from 'firebase/firestore';

export type ClassroomContextKind = 'ACADEMIA' | 'CHRISTIAN_EDUCATION';

export interface ClassroomSocialPost {
  id: string;
  classId: string;
  authorUid: string;
  authorName: string;
  authorRole: 'TEACHER' | 'STUDENT' | 'CATECHIST' | 'TA';
  authorAvatar?: string;
  text: string;
  /** Links and GIFs from the composer. Files people upload are in mediaItems, never here. */
  mediaUrls?: string[];
  /** Private files attached to the post: class copies in clubPhotos. */
  mediaItems?: { photoId: string; kind: ClubMediaKind }[];
  editedAt?: number;
  editedByUid?: string;
  telaDocId?: string;
  telaTitle?: string;
  pinned?: boolean;
  likes: string[];
  comments: Array<{
    id: string;
    authorUid: string;
    authorName: string;
    authorRole: 'TEACHER' | 'STUDENT';
    text: string;
    createdAt: number;
  }>;
  createdAt: number;
}

export type ClubMediaKind = 'image' | 'video' | 'audio';

/** The class's copy of a file. The file itself is a private asset in its owner's Content HQ (the
 *  uploader's account, or the org for its staff); the bytes come through classMediaObjectUrl.
 *  Removing or re-captioning a copy never changes the original. */
export interface ClassroomPhotoItem {
  id: string;
  classId: string;
  assetId: string;
  kind: ClubMediaKind;
  ownerScope: 'user' | 'org';
  /** True when the file is attached to a post rather than added to the gallery. */
  attachedToPost?: boolean;
  editedAt?: number;
  editedByUid?: string;
  caption: string;
  uploadedByUid: string;
  uploadedByName: string;
  uploadedByRole: 'TEACHER' | 'STUDENT';
  isWhiteboardSnapshot?: boolean;
  createdAt: number;
}

export interface RaisedHandEntry {
  uid: string;
  name: string;
  avatar?: string;
  promptNote?: string;
  requestedMode: 'CAMERA' | 'AUDIO_MIC' | 'WHITEBOARD';
  raisedAt: number;
  status: 'WAITING' | 'ON_STAGE' | 'ANSWERED';
}

export type LectureBroadcastMode = 'VIDEO_LECTURE' | 'AUDIO_LIVE_TALK';
export type LectureStageSurface = 'CAMERA' | 'SCREEN_SHARE' | 'WHITEBOARD' | 'LESSON' | 'TELA_DOC';
/** How the class uses the document on the stage: read along with the teacher, answer on their own
 *  private copy, or answer on one shared copy the whole class sees. */
export type LessonInteraction = 'FOLLOW' | 'OWN_COPY' | 'TOGETHER';

export interface WhiteboardStroke {
  id: string;
  tool: 'pen' | 'highlighter' | 'eraser' | 'line' | 'rect' | 'circle' | 'text';
  color: string;
  size: number;
  points: Array<{ x: number; y: number }>;
  text?: string;
  authorName?: string;
}

export interface LectureSessionState {
  id: string;
  classId: string;
  title: string;
  isLive: boolean;
  mode: LectureBroadcastMode;
  stageSurface: LectureStageSurface;
  /** The document on the stage when stageSurface is LESSON: the document itself, not a video of it. */
  lessonSource?: { unitId: string; title: string; interaction?: LessonInteraction } | null;
  /** Answers on the class's one shared copy (interaction TOGETHER). */
  lessonShared?: Record<string, string>;
  hostUid: string;
  hostName: string;
  startedAt: number;
  raisedHands: RaisedHandEntry[];
  /** Student currently invited by the teacher onto camera or live talk mic to answer */
  activeStudentOnStage: RaisedHandEntry | null;
  allowStudentWhiteboard: boolean;
  whiteboardBg: 'obsidian' | 'chalkboard' | 'vellum' | 'grid';
  whiteboardStrokes: WhiteboardStroke[];
  lectureChat: Array<{
    id: string;
    senderUid: string;
    senderName: string;
    senderRole: 'TEACHER' | 'STUDENT';
    text: string;
    createdAt: number;
  }>;
}

const LECTURE_KEY = (classId: string) => `plajah_cls_club_lecture_v1_${classId}`;

// ── 1. Classroom Social Feed (Club-Model Timeline Confined to Teacher & Class) ──
// Posts and photos are shared through Firestore under the class's own record, so the class's
// existing roster decides who sees them:
//   Academia:      classrooms/{id}/clubPosts|clubPhotos       (plajah-prod; owner + enrolledStudents)
//   Christian Ed:  churchPrograms/{id}/clubPosts|clubPhotos   (plajah-ops; teacherUids + studentUids)

/** Where a class's feed lives. Without one (Teacher Tools' sample class) there is nothing to share to. */
export interface ClassClubHome {
  kind: 'classroom' | 'churchProgram';
  id: string;
}

const clubCol = (home: ClassClubHome, sub: 'clubPosts' | 'clubPhotos') =>
  home.kind === 'classroom'
    ? collection(db, 'classrooms', home.id, sub)
    : collection(opsDb, 'churchPrograms', home.id, sub);

const FEED_LIMIT = 200;
const clean = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

/** Live class feed, newest first. Returns the unsubscribe. */
export function watchClassroomPosts(
  home: ClassClubHome,
  onPosts: (posts: ClassroomSocialPost[]) => void,
  onError?: (e: Error) => void
): () => void {
  return onSnapshot(
    query(clubCol(home, 'clubPosts'), orderBy('createdAt', 'desc'), limit(FEED_LIMIT)),
    snap => onPosts(snap.docs.map(d => ({ ...(d.data() as ClassroomSocialPost), id: d.id }))),
    e => onError?.(e)
  );
}

export async function addClassroomPost(
  home: ClassClubHome,
  post: Omit<ClassroomSocialPost, 'id' | 'classId' | 'likes' | 'comments' | 'createdAt'>
): Promise<ClassroomSocialPost> {
  const ref = doc(clubCol(home, 'clubPosts'));
  const created: ClassroomSocialPost = { ...post, id: ref.id, classId: home.id, likes: [], comments: [], createdAt: Date.now() };
  await setDoc(ref, clean(created));
  return created;
}

export function setClassroomPostLike(home: ClassClubHome, postId: string, uid: string, liked: boolean) {
  return updateDoc(doc(clubCol(home, 'clubPosts'), postId), { likes: liked ? arrayUnion(uid) : arrayRemove(uid) });
}

export function setClassroomPostPin(home: ClassClubHome, postId: string, pinned: boolean) {
  return updateDoc(doc(clubCol(home, 'clubPosts'), postId), { pinned });
}

export function addClassroomPostComment(
  home: ClassClubHome,
  postId: string,
  comment: { authorUid: string; authorName: string; authorRole: 'TEACHER' | 'STUDENT'; text: string }
) {
  const entry = { id: `ccom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`, ...comment, createdAt: Date.now() };
  return updateDoc(doc(clubCol(home, 'clubPosts'), postId), { comments: arrayUnion(entry) });
}

export function editClassroomPost(home: ClassClubHome, postId: string, text: string, uid: string) {
  return updateDoc(doc(clubCol(home, 'clubPosts'), postId), { text, editedByUid: uid, editedAt: Date.now() });
}

export async function deleteClassroomPost(home: ClassClubHome, post: Pick<ClassroomSocialPost, 'id' | 'mediaItems'>) {
  await Promise.all((post.mediaItems || []).map(m => deleteDoc(doc(clubCol(home, 'clubPhotos'), m.photoId)).catch(() => {})));
  return deleteDoc(doc(clubCol(home, 'clubPosts'), post.id));
}

// ── 2. Classroom Photos & Whiteboard Gallery ─────────────────────────────────

export function watchClassroomPhotos(
  home: ClassClubHome,
  onPhotos: (photos: ClassroomPhotoItem[]) => void,
  onError?: (e: Error) => void
): () => void {
  return onSnapshot(
    query(clubCol(home, 'clubPhotos'), orderBy('createdAt', 'desc'), limit(FEED_LIMIT)),
    snap => onPhotos(snap.docs.map(d => ({ ...(d.data() as ClassroomPhotoItem), id: d.id }))),
    e => onError?.(e)
  );
}

async function clubMediaFetch(home: ClassClubHome, tail: string, init: RequestInit = {}): Promise<Response> {
  const token = await auth.currentUser?.getIdToken();
  return fetch(`/api/class-club/${home.kind}/${encodeURIComponent(home.id)}/${tail}`, {
    ...init,
    headers: { ...(init.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
}

/** Saves the file privately under its owner (the server decides: the uploader's account, or the org
 *  for its staff and volunteers), then adds the class's copy of it. */
export async function shareClassMedia(
  home: ClassClubHome,
  file: File,
  item: Pick<ClassroomPhotoItem, 'caption' | 'uploadedByUid' | 'uploadedByName' | 'uploadedByRole' | 'isWhiteboardSnapshot' | 'attachedToPost'>
): Promise<ClassroomPhotoItem> {
  const mimeType = file.type || 'application/octet-stream';
  const prep = await clubMediaFetch(home, 'media/prepare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name, mimeType, sizeBytes: file.size }),
  });
  if (prep.status === 413) {
    const { scopeKind } = await prep.json().catch(() => ({} as any));
    throw new Error(scopeKind === 'org' ? "Your organization's storage is full." : 'Your account storage is full.');
  }
  if (!prep.ok) throw new Error((await prep.json().catch(() => ({} as any))).error || 'Upload could not start.');
  const { assetId, storagePath, scopeKind } = await prep.json();
  try {
    await new Promise<void>((resolve, reject) => {
      uploadBytesResumable(storageRef(storage, storagePath), file, { contentType: mimeType, customMetadata: { ownerUid: item.uploadedByUid } })
        .on('state_changed', undefined, reject, () => resolve());
    });
  } catch (e) {
    void clubMediaFetch(home, `media/${assetId}/abort`, { method: 'POST' }).catch(() => {});
    throw e;
  }
  await clubMediaFetch(home, `media/${assetId}/finish`, { method: 'POST' }).catch(() => {});
  const ref = doc(clubCol(home, 'clubPhotos'));
  const kind: ClubMediaKind = mimeType.startsWith('video/') ? 'video' : mimeType.startsWith('audio/') ? 'audio' : 'image';
  const created: ClassroomPhotoItem = { ...item, assetId, kind, ownerScope: scopeKind, id: ref.id, classId: home.id, createdAt: Date.now() };
  await setDoc(ref, clean(created));
  return created;
}

export class ClassMediaGoneError extends Error {}
const mediaUrlCache = new Map<string, Promise<string>>();

/** The copy's bytes, as a URL only this page can use. Signed-in class members only. */
export function classMediaObjectUrl(home: ClassClubHome, photoId: string): Promise<string> {
  const key = `${home.kind}:${home.id}:${photoId}`;
  let pending = mediaUrlCache.get(key);
  if (!pending) {
    pending = clubMediaFetch(home, `photos/${encodeURIComponent(photoId)}/file`).then(async res => {
      if (res.status === 410 || res.status === 404) throw new ClassMediaGoneError();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return URL.createObjectURL(await res.blob());
    });
    // A failure (still scanning, offline) can be retried; only a success stays cached.
    pending.catch(() => mediaUrlCache.delete(key));
    mediaUrlCache.set(key, pending);
  }
  return pending;
}

export function editClassroomPhotoCaption(home: ClassClubHome, photoId: string, caption: string, uid: string) {
  return updateDoc(doc(clubCol(home, 'clubPhotos'), photoId), { caption, editedByUid: uid, editedAt: Date.now() });
}

/** Removes the class's copy only. The owner's original stays in their files. */
export function deleteClassroomPhoto(home: ClassClubHome, photoId: string) {
  return deleteDoc(doc(clubCol(home, 'clubPhotos'), photoId));
}

// Earlier builds kept the feed in this browser only (and wrote sample content into every class:
// a welcome post with a comment from an invented student, and two stock photos). Once a class has
// a shared home, this device's own posts and uploaded photos move there and the local copy is
// dropped; seed items and other people's local copies are discarded.
const LEGACY_POSTS_KEY = (classId: string) => `plajah_cls_club_posts_v1_${classId}`;
const LEGACY_PHOTOS_KEY = (classId: string) => `plajah_cls_club_photos_v1_${classId}`;
const isSeedId = (id: unknown) => typeof id === 'string' && /^c(post|photo)_seed_/.test(id);

export async function migrateLocalClassroomFeed(legacyClassId: string, home: ClassClubHome, uid: string): Promise<void> {
  const read = (key: string): any[] => {
    try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return Array.isArray(v) ? v : []; } catch { return []; }
  };
  const posts = read(LEGACY_POSTS_KEY(legacyClassId)).filter(p => !isSeedId(p?.id) && p?.authorUid === uid);
  const photos = read(LEGACY_PHOTOS_KEY(legacyClassId)).filter(
    p => !isSeedId(p?.id) && p?.uploadedByUid === uid && typeof p?.url === 'string'
  );
  const rest = <T extends object>(o: any, drop: string[]): T => Object.fromEntries(Object.entries(o).filter(([k]) => !drop.includes(k))) as T;
  try {
    for (const p of posts.reverse()) {
      await addClassroomPost(home, rest(p, ['id', 'classId', 'likes', 'comments', 'createdAt']));
    }
    // Old photos become private files in their owner's storage, like any new upload.
    for (const p of photos.reverse()) {
      const blob = await (await fetch(p.url)).blob();
      await shareClassMedia(home, new File([blob], `${p.caption || 'class-photo'}`.replace(/[^\w.\-]+/g, '_'), { type: blob.type || 'image/jpeg' }), {
        caption: p.caption || '', uploadedByUid: uid, uploadedByName: p.uploadedByName || '', uploadedByRole: p.uploadedByRole === 'TEACHER' ? 'TEACHER' : 'STUDENT',
        ...(p.isWhiteboardSnapshot ? { isWhiteboardSnapshot: true } : {}),
      });
    }
    localStorage.removeItem(LEGACY_POSTS_KEY(legacyClassId));
    localStorage.removeItem(LEGACY_PHOTOS_KEY(legacyClassId));
  } catch (e) {
    console.warn('[classroomClub] could not move this device\'s posts to the class', e);
  }
}

// ── 3. Interactive Lecture Live Stream & Audio Live Talk State ────────────────

/** A lecture that hasn't started: no hands, no chat — what a student sees until the teacher's
 *  live state arrives over the lecture session. */
export function blankLectureSession(
  classId: string,
  defaults: { title: string; hostUid: string; hostName: string }
): LectureSessionState {
  return {
    id: `lec_${classId}`,
    classId,
    title: `${defaults.title} · Interactive Lecture`,
    isLive: false,
    mode: 'VIDEO_LECTURE',
    stageSurface: 'CAMERA',
    hostUid: defaults.hostUid,
    hostName: defaults.hostName,
    startedAt: Date.now(),
    raisedHands: [],
    activeStudentOnStage: null,
    allowStudentWhiteboard: true,
    whiteboardBg: 'obsidian',
    whiteboardStrokes: [],
    lectureChat: [],
  };
}

/** The teacher's saved lecture (this device). Earlier builds seeded sample hands and a canned
 *  welcome message into every class; those are dropped on load — real classes show real people only. */
export function loadLectureSession(
  classId: string,
  defaults: { title: string; hostUid: string; hostName: string }
): LectureSessionState {
  try {
    const raw = localStorage.getItem(LECTURE_KEY(classId));
    if (raw) {
      const parsed = JSON.parse(raw) as LectureSessionState;
      if (parsed && parsed.classId === classId) {
        const isSeed = (uid?: string) => !!uid && uid.startsWith('student_demo_');
        return {
          ...parsed,
          raisedHands: (parsed.raisedHands || []).filter(h => !isSeed(h.uid)),
          activeStudentOnStage: isSeed(parsed.activeStudentOnStage?.uid) ? null : parsed.activeStudentOnStage,
          lectureChat: (parsed.lectureChat || []).filter(m => m.id !== 'lchat_1'),
        };
      }
    }
  } catch {}
  return blankLectureSession(classId, defaults);
}

export function saveLectureSession(classId: string, session: LectureSessionState): void {
  try {
    localStorage.setItem(LECTURE_KEY(classId), JSON.stringify(session));
  } catch {}
}
