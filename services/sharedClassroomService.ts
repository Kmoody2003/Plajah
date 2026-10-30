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

export function loadClassroomPosts(
  classId: string,
  defaults?: { teacherName: string; className: string; contextKind: ClassroomContextKind }
): ClassroomSocialPost[] {
  try {
    const raw = localStorage.getItem(POSTS_KEY(classId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}

  if (!defaults) return [];
  const seeded: ClassroomSocialPost[] = [
    {
      id: `cpost_seed_1_${classId}`,
      classId,
      authorUid: 'teacher_seed',
      authorName: defaults.teacherName,
      authorRole: 'TEACHER',
      text:
        defaults.contextKind === 'CHRISTIAN_EDUCATION'
          ? `Welcome to the ${defaults.className} Classroom Club! Post your Scripture observations, memory-verse recordings, and questions here. During our live lecture, use the ✋ Raise Hand button to come on camera or audio mic to answer!`
          : `Welcome to ${defaults.className}! Use this classroom social feed to share project updates, study notes, and questions. When we go live for lecture, tap ✋ Raise Hand to join the stage or solve on the digital whiteboard.`,
      pinned: true,
      likes: ['student_1', 'student_2'],
      comments: [
        {
          id: `ccom_seed_1`,
          authorUid: 'student_1',
          authorName: 'Maya Lin',
          authorRole: 'STUDENT',
          text: 'Excited for today’s interactive Tela lesson and live whiteboard session!',
          createdAt: Date.now() - 1800_000,
        },
      ],
      createdAt: Date.now() - 3600_000,
    },
  ];
  saveClassroomPosts(classId, seeded);
  return seeded;
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

export function loadClassroomPhotos(classId: string, teacherName = 'Instructor'): ClassroomPhotoItem[] {
  try {
    const raw = localStorage.getItem(PHOTOS_KEY(classId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}

  const seeded: ClassroomPhotoItem[] = [
    {
      id: `cphoto_seed_1_${classId}`,
      classId,
      url: 'https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=900&q=80',
      caption: 'Classroom Whiteboard & Key Diagram Notes',
      uploadedByUid: 'teacher_seed',
      uploadedByName: teacherName,
      uploadedByRole: 'TEACHER',
      createdAt: Date.now() - 86400_000,
    },
    {
      id: `cphoto_seed_2_${classId}`,
      classId,
      url: 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=900&q=80',
      caption: 'Interactive Study Guide & Annotated Passage',
      uploadedByUid: 'teacher_seed',
      uploadedByName: teacherName,
      uploadedByRole: 'TEACHER',
      createdAt: Date.now() - 43200_000,
    },
  ];
  saveClassroomPhotos(classId, seeded);
  return seeded;
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
