/**
 * Art College studio state: studio submissions, critique log, self-assessment scores, portfolio
 * pieces, review results and the declared major. Stored per learner at
 * users/{uid}/schoolProgress/art-college-studio (covered by the existing schoolProgress rule) and
 * mirrored to localStorage so guests and offline learners keep their place.
 *
 * Lesson completion itself lives in the shared school chassis (id 'art-college'); this store holds
 * what the chassis doesn't: the work and the judgement about it. Pure helpers are exported for tests.
 */
import { db, auth } from '../backendService';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { COURSES, PROGRAMS, RUBRICS, unitKey, courseByCode, programCredits } from '../../data/artCollege';
import type { Course, CritiqueId, Program, ReviewId, RubricId } from '../../data/artCollege/types';

export interface Submission { unit: string; note: string; link?: string; at: number }
export interface CritLog { id: string; unit: string; format: CritiqueId; heard: string; next: string; at: number }
export interface PortfolioPiece { id: string; title: string; unit?: string; statement: string; link?: string; at: number }
export interface ScoreSet { rubric: RubricId; scores: Record<string, number>; note?: string; at: number }

export interface StudioState {
  programId?: string;
  submissions: Record<string, Submission>;
  crits: CritLog[];
  pieces: PortfolioPiece[];
  /** Self-assessment per unit (key) or review (`review:<id>`). */
  scores: Record<string, ScoreSet>;
}

export const emptyState = (): StudioState => ({ submissions: {}, crits: [], pieces: [], scores: {} });

const DOC = 'art-college-studio';
const lsKey = (uid: string) => `artCollegeStudio_${uid}`;

function readLocal(uid: string): StudioState {
  try { return { ...emptyState(), ...JSON.parse(localStorage.getItem(lsKey(uid)) || '{}') }; } catch { return emptyState(); }
}
function writeLocal(uid: string, s: StudioState) { try { localStorage.setItem(lsKey(uid), JSON.stringify(s)); } catch { /* */ } }

export async function loadStudio(): Promise<StudioState> {
  const uid = auth.currentUser?.uid || 'guest';
  const local = readLocal(uid);
  if (!auth.currentUser) return local;
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'schoolProgress', DOC));
    if (!snap.exists()) return local;
    const remote = { ...emptyState(), ...(snap.data() as any) } as StudioState;
    return remote.pieces.length + remote.crits.length >= local.pieces.length + local.crits.length ? remote : local;
  } catch { return local; }
}

export async function saveStudio(s: StudioState): Promise<void> {
  const uid = auth.currentUser?.uid || 'guest';
  writeLocal(uid, s);
  if (!auth.currentUser) return;
  try { await setDoc(doc(db, 'users', uid, 'schoolProgress', DOC), { ...s, updatedAt: Date.now() }); } catch { /* best-effort */ }
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

/** Mean of a score set on the 1–4 rubric scale, or null when nothing is scored. */
export function meanScore(set?: ScoreSet): number | null {
  const v = Object.values(set?.scores ?? {}).filter(n => n >= 1 && n <= 4);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/** Does a review's score set clear its bar? Mirrors the bars published in PORTFOLIO_REVIEWS. */
export function reviewPasses(id: ReviewId, set: ScoreSet): boolean {
  const m = meanScore(set);
  if (m === null) return false;
  const min = Math.min(...Object.values(set.scores));
  switch (id) {
    case 'foundation': return m >= 2.0 && min >= 1.5;
    case 'sophomore': return m >= 2.5;
    case 'junior': return m >= 3.0;
    case 'senior': return m >= 3.0 && min >= 2.5;
  }
}

export const unitsDone = (course: Course, completed: string[]) => course.units.filter(u => completed.includes(unitKey(course, u))).length;
export const courseComplete = (course: Course, completed: string[]) => unitsDone(course, completed) === course.units.length;

export interface Audit {
  creditsEarned: number;
  requiredCredits: number;
  /** Programme courses finished, in progress, and not started. */
  done: string[]; started: string[]; todo: string[];
  /** Courses whose prerequisites are all complete and which are not complete themselves. */
  available: string[];
  electivesNeeded: number;
}

/** Degree audit against a programme given completed lesson ids from the chassis. */
export function auditProgram(p: Program, completed: string[]): Audit {
  const codes = p.years.flatMap(y => y.courses);
  const done: string[] = [], started: string[] = [], todo: string[] = [];
  let earned = 0;
  for (const code of codes) {
    const c = courseByCode(code);
    if (!c) continue;
    if (courseComplete(c, completed)) { done.push(code); earned += c.credits; }
    else if (unitsDone(c, completed) > 0) started.push(code);
    else todo.push(code);
  }
  const doneAll = new Set(COURSES.filter(c => courseComplete(c, completed)).map(c => c.code));
  const available = codes.filter(code => !doneAll.has(code) && (courseByCode(code)?.prereq ?? []).every(r => doneAll.has(r)));
  return { creditsEarned: earned, requiredCredits: programCredits(p), done, started, todo, available, electivesNeeded: p.years.reduce((n, y) => n + y.electives, 0) };
}

export const rubricCriteria = (id: RubricId) => RUBRICS[id].criteria;
export const allPrograms = () => PROGRAMS;
