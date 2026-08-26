// handwritingProgressService — real-data layer for Penna (the handwriting workshop). Mirrors
// readingQuestService exactly: when a user is signed in, their progress (per-category mastery +
// mastered letters + completed Story-Mode books + xp) persists to Firestore at
// handwritingProgress/{uid}, and finishing a stroke / letter / book awards real Plajah Points via
// pointsService. All writes are guarded and field-complete (no undefined, which Firestore rejects)
// and failures are non-fatal so practice never blocks on the network.

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { addPoints } from './pointsService';
import type { LetterCategory } from './handwritingFormEngine';

export const HANDWRITING_CATEGORIES: LetterCategory[] = ['prewriting', 'capital', 'lowercase', 'number'];

export interface HandwritingProgress {
  userId: string;
  mastery: Record<LetterCategory, number>;   // 0–100 per category
  masteredLetters: string[];                  // letter keys the child forms correctly
  booksCompleted: string[];                   // Story-Mode titles finished
  xp: number;
  updatedAt: number;
}

const COLLECTION = 'handwritingProgress';

export const defaultMastery = (): Record<LetterCategory, number> =>
  Object.fromEntries(HANDWRITING_CATEGORIES.map(c => [c, 0])) as Record<LetterCategory, number>;

/** Load a user's saved handwriting progress, or null if they have none yet. */
export async function loadHandwritingProgress(userId: string): Promise<HandwritingProgress | null> {
  try {
    const snap = await getDoc(doc(db, COLLECTION, userId));
    if (!snap.exists()) return null;
    const data = snap.data() as Partial<HandwritingProgress>;
    return {
      userId,
      mastery: { ...defaultMastery(), ...(data.mastery || {}) },
      masteredLetters: data.masteredLetters || [],
      booksCompleted: data.booksCompleted || [],
      xp: data.xp || 0,
      updatedAt: data.updatedAt || 0,
    };
  } catch (err) {
    console.error('[penna] loadHandwritingProgress failed:', err);
    return null;
  }
}

/** Persist a user's handwriting progress (full document, merge-safe, no undefined fields). */
export async function saveHandwritingProgress(
  userId: string,
  progress: {
    mastery: Record<LetterCategory, number>;
    masteredLetters: string[];
    booksCompleted: string[];
    xp: number;
  },
): Promise<void> {
  try {
    const payload: HandwritingProgress = {
      userId,
      mastery: { ...defaultMastery(), ...progress.mastery },
      masteredLetters: progress.masteredLetters || [],
      booksCompleted: progress.booksCompleted || [],
      xp: progress.xp || 0,
      updatedAt: Date.now(),
    };
    await setDoc(doc(db, COLLECTION, userId), payload, { merge: true });
  } catch (err) {
    console.error('[penna] saveHandwritingProgress failed:', err);
  }
}

/**
 * Record a finished piece of correct handwriting for a signed-in user and award real Plajah Points.
 * `kind` picks the reward weight (a whole book is worth the most); `entityId` ties the transaction
 * to the letter/book for traceability. Reward is bound to FORM-CORRECT events only — never to
 * finishing or speed — which is the core pedagogical rule of the workshop.
 */
export async function awardHandwritingPoints(
  userId: string,
  kind: 'letter' | 'book',
  entityId: string,
): Promise<number> {
  const amount = kind === 'book' ? 10 : 3;
  try {
    await addPoints(userId, amount, 'DAILY_ACTIVITY', 'handwriting', entityId);
  } catch (err) {
    console.error('[penna] awardHandwritingPoints failed:', err);
  }
  return amount;
}
