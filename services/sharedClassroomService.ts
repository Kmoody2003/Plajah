// services/sharedClassroomService.ts
// Shared Club-Model Classroom Infrastructure for BOTH Academia and Elevate Christian Education.
// Models each classroom off Plajah Clubs (Social Feed, Photos Gallery, Roster, Chat, and Live Stream),
// confined to the classroom's Teacher and enrolled Students, with a Special Interactive Lecture Live Mode:
// - Video Lecture Mode: students raise hand and come on camera to answer
// - Audio Lecture Mode (repurposed Live Talk stage): students raise hand and come on mic to answer
// - Both modes include Screen Sharing (getDisplayMedia) and an Interactive Digital Whiteboard.

import { db, opsDb } from './firebase';
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
  mediaUrls?: string[];
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

export interface ClassroomPhotoItem {
  id: string;
  classId: string;
  url: string;
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
export type LectureStageSurface = 'CAMERA' | 'SCREEN_SHARE' | 'WHITEBOARD';

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

export function deleteClassroomPost(home: ClassClubHome, postId: string) {
  return deleteDoc(doc(clubCol(home, 'clubPosts'), postId));
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

/** `url` must be a stored file's URL, never a data: URL (a Firestore doc caps at 1 MB). */
export async function addClassroomPhoto(
  home: ClassClubHome,
  item: Omit<ClassroomPhotoItem, 'id' | 'classId' | 'createdAt'>
): Promise<ClassroomPhotoItem> {
  if (item.url.startsWith('data:')) throw new Error('Upload the image first; inline images cannot be shared.');
  const ref = doc(clubCol(home, 'clubPhotos'));
  const created: ClassroomPhotoItem = { ...item, id: ref.id, classId: home.id, createdAt: Date.now() };
  await setDoc(ref, clean(created));
  return created;
}

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
    p => !isSeedId(p?.id) && p?.uploadedByUid === uid && typeof p?.url === 'string' && !p.url.startsWith('data:')
  );
  const rest = <T extends object>(o: any, drop: string[]): T => Object.fromEntries(Object.entries(o).filter(([k]) => !drop.includes(k))) as T;
  try {
    for (const p of posts.reverse()) {
      await addClassroomPost(home, rest(p, ['id', 'classId', 'likes', 'comments', 'createdAt']));
    }
    for (const p of photos.reverse()) {
      await addClassroomPhoto(home, rest(p, ['id', 'classId', 'createdAt']));
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
