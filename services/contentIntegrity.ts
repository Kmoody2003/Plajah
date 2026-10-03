/**
 * Content integrity — the platform's accuracy guard rails.
 *
 * Principle: Plajah never presents content as more trustworthy than it has earned. Every course
 * carries an honest verification status; anything a check or a learner has contradicted is withheld
 * from practice; every question and lesson has a "Report a problem" path; and corrections are logged.
 * The default for anything unchecked is "draft", never "verified".
 */
import { addDoc, collection } from 'firebase/firestore';
import { db, auth } from './firebase';
import { COURSE_STATUS, FLAGGED, type CourseVerification, type VerifyStatus } from '../data/practice/verificationData';

export type { VerifyStatus, CourseVerification };

export const STATUS_META: Record<VerifyStatus, { label: string; short: string; color: string; detail: string }> = {
  draft: { label: 'Draft: not yet independently verified', short: 'Draft', color: '#f59e0b', detail: 'This was written without an independent fact-check yet. Treat it as a good starting point, and check anything important. If you spot a mistake, please report it.' },
  'machine-verified': { label: 'Cross-checked', short: 'Cross-checked', color: '#3b82f6', detail: 'Two independent checks agreed with every answer, and none flagged a problem. It has not yet been tied to cited sources or reviewed by an educator.' },
  sourced: { label: 'Verified against sources', short: 'Sourced', color: '#10b981', detail: 'Cross-checked, and each checked fact carries a cited source.' },
  'educator-reviewed': { label: 'Reviewed by educators', short: 'Educator reviewed', color: '#a855f7', detail: 'Verified against sources and signed off by two credentialed educators.' },
  disputed: { label: 'Under review', short: 'Under review', color: '#ef4444', detail: 'A check or a report has questioned part of this. The disputed items are hidden from practice until resolved.' },
};

const DRAFT: CourseVerification = { status: 'draft', authoredBy: 'ai-assisted' };

/** Verification state for a course/curriculum id. Unknown = draft, never verified. */
export const courseVerification = (id?: string): CourseVerification => (id && COURSE_STATUS[id]) || DRAFT;

/** A question or lesson that must NOT be served to learners. */
export const isServable = (id: string): boolean => !FLAGGED[id];

/** Drop withheld items from a practice pool. */
export const filterServable = <T extends { id: string }>(items: T[]): T[] => items.filter(i => isServable(i.id));

export interface ProblemReport {
  kind: 'question' | 'lesson' | 'guide' | 'passage' | 'other';
  /** Question id, lesson id, etc. */
  ref: string;
  courseId?: string;
  /** What the learner or teacher thinks is wrong. */
  note: string;
  /** Snapshot of the text, so the report is reviewable even if the content changes. */
  excerpt?: string;
}

/** Send a correction request. Resolves true when it reached the review queue. */
export async function reportProblem(r: ProblemReport): Promise<boolean> {
  // Firestore rejects undefined fields, so every optional value becomes null/''.
  const rec = { kind: r.kind, ref: r.ref, courseId: r.courseId || null, note: r.note.trim().slice(0, 1000), excerpt: (r.excerpt || '').slice(0, 600), uid: auth.currentUser?.uid || null, at: Date.now(), status: 'open' };
  try { await addDoc(collection(db, 'contentReports'), rec); return true; } catch { /* offline or rules: keep it locally so it is not lost */ }
  try {
    const k = 'plajah:pendingReports'; const prev = JSON.parse(localStorage.getItem(k) || '[]');
    localStorage.setItem(k, JSON.stringify([...prev, rec].slice(-50)));
  } catch { /* private mode */ }
  return false;
}
