// schoolChassis.ts — Part 6, Thread 2: ONE school engine, used five times.
//
// Film School, the Photography & Art School, Chora's music-history curriculum and Academia's
// tracks all describe themselves as a `Curriculum` (tracks → lessons) and render through the
// shared <SchoolView>. Progress is stored per-user and every completion writes a LearningRecord
// to the portable Academic Passport, so finishing a cinematography lesson counts the same way a
// Reading Quest does.
//
// Storage: users/{uid}/schoolProgress/{curriculumId} → { completed: string[] }, mirrored to
// localStorage so guests and offline users keep their place (same pattern as notebookService).

import { db, auth } from './backendService';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { appendRecord } from './learningLedgerService';

// ── Model ─────────────────────────────────────────────────────────────────────
export interface LessonAssignment {
  prompt: string;
  /** Which studio the learner does the work in — deep-links the "make your own" step. */
  tool?: 'FABULA' | 'PHOTO' | 'CHORA' | 'LOREA' | 'PIXELS' | 'NONE';
  /** Tag applied to the published result, so a lesson gets a visible student wall. */
  postTag?: string;
}

export interface WatchAlong {
  title: string;
  url?: string;
  /** Timestamps to watch, e.g. '00:00' → '03:10'. */
  start?: string;
  end?: string;
  note?: string;
}

export interface Lesson {
  id: string;
  title: string;
  blurb: string;
  minutes?: number;
  /** Teaching text. Plain paragraphs separated by blank lines. */
  body?: string;
  /** A curated YouTube id for the lesson. */
  videoId?: string;
  watchAlong?: WatchAlong;
  assignment?: LessonAssignment;
  resources?: { label: string; url: string }[];
  /** Education standards this lesson evidences, for the ledger. */
  standardIds?: string[];
}

export interface Track {
  id: string;
  title: string;
  blurb: string;
  level?: 'FOUNDATION' | 'INTERMEDIATE' | 'ADVANCED';
  lessons: Lesson[];
}

export interface Curriculum {
  id: string;            // 'film-school' | 'photo-art-school' | 'chora-history' | …
  label: string;
  blurb: string;
  accent: string;
  framework?: string;    // standards framework for ledger records
  tracks: Track[];
}

// ── Progress ──────────────────────────────────────────────────────────────────
const lsKey = (curriculumId: string, uid: string) => `schoolProgress_${curriculumId}_${uid}`;

function readLocal(curriculumId: string, uid: string): string[] {
  try { return JSON.parse(localStorage.getItem(lsKey(curriculumId, uid)) || '[]'); } catch { return []; }
}
function writeLocal(curriculumId: string, uid: string, completed: string[]): void {
  try { localStorage.setItem(lsKey(curriculumId, uid), JSON.stringify(completed)); } catch { /* */ }
}

/** Load completed lesson ids, merging the cloud record with the local cache. */
export async function loadProgress(curriculumId: string): Promise<string[]> {
  const uid = auth.currentUser?.uid || 'guest';
  const local = readLocal(curriculumId, uid);
  if (!auth.currentUser) return local;
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'schoolProgress', curriculumId));
    const remote: string[] = snap.exists() ? ((snap.data() as any)?.completed || []) : [];
    const merged = Array.from(new Set([...remote, ...local]));
    if (merged.length !== remote.length) void persist(curriculumId, merged);
    writeLocal(curriculumId, uid, merged);
    return merged;
  } catch { return local; }
}

async function persist(curriculumId: string, completed: string[]): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  try { await setDoc(doc(db, 'users', uid, 'schoolProgress', curriculumId), { completed, updatedAt: Date.now() }, { merge: true }); }
  catch { /* best-effort */ }
}

/**
 * Mark a lesson complete: update progress and — for signed-in learners — append a
 * LearningRecord per standard so it lands in the portable Academic Passport.
 */
export async function markLessonComplete(
  curriculum: Curriculum, lesson: Lesson, completedSoFar: string[],
): Promise<string[]> {
  const uid = auth.currentUser?.uid || 'guest';
  if (completedSoFar.includes(lesson.id)) return completedSoFar;
  const next = [...completedSoFar, lesson.id];
  writeLocal(curriculum.id, uid, next);
  void persist(curriculum.id, next);

  if (auth.currentUser && lesson.standardIds?.length) {
    for (const standardId of lesson.standardIds) {
      void appendRecord({
        studentId: auth.currentUser.uid,
        standardId,
        framework: curriculum.framework || curriculum.id,
        source: 'school-lesson',
        masteryBefore: 0,
        masteryAfter: 70,           // a completed lesson evidences working proficiency
        byUid: auth.currentUser.uid,
        evidence: `${curriculum.id}/${lesson.id}`,
      });
    }
  }
  return next;
}

/** Un-mark a lesson (progress only — ledger records are append-only by design). */
export async function unmarkLesson(curriculumId: string, lessonId: string, completedSoFar: string[]): Promise<string[]> {
  const uid = auth.currentUser?.uid || 'guest';
  const next = completedSoFar.filter(id => id !== lessonId);
  writeLocal(curriculumId, uid, next);
  void persist(curriculumId, next);
  return next;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
export function trackProgress(track: Track, completed: string[]): { done: number; total: number; pct: number } {
  const total = track.lessons.length;
  const done = track.lessons.filter(l => completed.includes(l.id)).length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

export function curriculumProgress(c: Curriculum, completed: string[]): { done: number; total: number; pct: number } {
  const all = c.tracks.flatMap(t => t.lessons);
  const done = all.filter(l => completed.includes(l.id)).length;
  return { done, total: all.length, pct: all.length ? Math.round((done / all.length) * 100) : 0 };
}
