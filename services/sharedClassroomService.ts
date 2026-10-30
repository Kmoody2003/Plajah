// services/sharedClassroomService.ts
// Shared Club-Model Classroom Infrastructure for BOTH Academia and Elevate Christian Education.
// Models each classroom off Plajah Clubs (Social Feed, Photos Gallery, Roster, Chat, and Live Stream),
// confined to the classroom's Teacher and enrolled Students, with a Special Interactive Lecture Live Mode:
// - Video Lecture Mode: students raise hand and come on camera to answer
// - Audio Lecture Mode (repurposed Live Talk stage): students raise hand and come on mic to answer
// - Both modes include Screen Sharing (getDisplayMedia) and an Interactive Digital Whiteboard.

import { db } from './firebase';
import { doc, setDoc } from 'firebase/firestore';

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

const POSTS_KEY = (classId: string) => `plajah_cls_club_posts_v1_${classId}`;
const PHOTOS_KEY = (classId: string) => `plajah_cls_club_photos_v1_${classId}`;
const LECTURE_KEY = (classId: string) => `plajah_cls_club_lecture_v1_${classId}`;

// ── 1. Classroom Social Feed (Club-Model Timeline Confined to Teacher & Class) ──

// Earlier builds wrote sample content into every class the first time it opened: a welcome post
// in the teacher's name with a comment from an invented student, and two stock photos captioned as
// class work. Real classes show only what real people posted, so those items are dropped on load.
const isSeedPost = (p: ClassroomSocialPost) => typeof p?.id === 'string' && p.id.startsWith('cpost_seed_');
const isSeedPhoto = (p: ClassroomPhotoItem) => typeof p?.id === 'string' && p.id.startsWith('cphoto_seed_');

export function loadClassroomPosts(classId: string): ClassroomSocialPost[] {
  try {
    const raw = localStorage.getItem(POSTS_KEY(classId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const real = parsed.filter(p => !isSeedPost(p));
        if (real.length !== parsed.length) saveClassroomPosts(classId, real);
        return real;
      }
    }
  } catch {}
  return [];
}

export function saveClassroomPosts(classId: string, posts: ClassroomSocialPost[]): void {
  try {
    localStorage.setItem(POSTS_KEY(classId), JSON.stringify(posts));
  } catch {}
}

export function addClassroomPost(
  classId: string,
  post: Omit<ClassroomSocialPost, 'id' | 'classId' | 'likes' | 'comments' | 'createdAt'>
): ClassroomSocialPost[] {
  const current = loadClassroomPosts(classId);
  const created: ClassroomSocialPost = {
    ...post,
    id: `cpost_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    classId,
    likes: [],
    comments: [],
    createdAt: Date.now(),
  };
  const next = [created, ...current];
  saveClassroomPosts(classId, next);
  try {
    setDoc(doc(db, 'classroomClubs', classId, 'posts', created.id), created).catch(() => {});
  } catch {}
  return next;
}

export function toggleClassroomPostLike(classId: string, postId: string, uid: string): ClassroomSocialPost[] {
  const current = loadClassroomPosts(classId);
  const next = current.map(p => {
    if (p.id !== postId) return p;
    const has = p.likes.includes(uid);
    return {
      ...p,
      likes: has ? p.likes.filter(x => x !== uid) : [...p.likes, uid],
    };
  });
  saveClassroomPosts(classId, next);
  return next;
}

export function toggleClassroomPostPin(classId: string, postId: string): ClassroomSocialPost[] {
  const current = loadClassroomPosts(classId);
  const next = current.map(p => (p.id === postId ? { ...p, pinned: !p.pinned } : p));
  saveClassroomPosts(classId, next);
  return next;
}

export function addClassroomPostComment(
  classId: string,
  postId: string,
  comment: { authorUid: string; authorName: string; authorRole: 'TEACHER' | 'STUDENT'; text: string }
): ClassroomSocialPost[] {
  const current = loadClassroomPosts(classId);
  const next = current.map(p => {
    if (p.id !== postId) return p;
    return {
      ...p,
      comments: [
        ...p.comments,
        {
          id: `ccom_${Date.now().toString(36)}`,
          ...comment,
          createdAt: Date.now(),
        },
      ],
    };
  });
  saveClassroomPosts(classId, next);
  return next;
}

// ── 2. Classroom Photos & Whiteboard Gallery ─────────────────────────────────

export function loadClassroomPhotos(classId: string): ClassroomPhotoItem[] {
  try {
    const raw = localStorage.getItem(PHOTOS_KEY(classId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const real = parsed.filter(p => !isSeedPhoto(p));
        if (real.length !== parsed.length) saveClassroomPhotos(classId, real);
        return real;
      }
    }
  } catch {}
  return [];
}

export function saveClassroomPhotos(classId: string, photos: ClassroomPhotoItem[]): void {
  try {
    localStorage.setItem(PHOTOS_KEY(classId), JSON.stringify(photos));
  } catch {}
}

export function addClassroomPhoto(
  classId: string,
  item: Omit<ClassroomPhotoItem, 'id' | 'classId' | 'createdAt'>
): ClassroomPhotoItem[] {
  const current = loadClassroomPhotos(classId);
  const created: ClassroomPhotoItem = {
    ...item,
    id: `cphoto_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
    classId,
    createdAt: Date.now(),
  };
  const next = [created, ...current];
  saveClassroomPhotos(classId, next);
  return next;
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
