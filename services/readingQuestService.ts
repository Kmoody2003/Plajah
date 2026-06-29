// readingQuestService — real-data layer for Reading Quest. When a user is signed in, their
// reading progress (per-pillar mastery + completed quests + xp) persists to Firestore at
// readingProgress/{uid}, and finishing an activity awards real Plajah Points via pointsService.
// The demo class / Dojo path stays separate (in-memory classroomStore) — this only runs for the
// signed-in "You" player. All Firestore writes are guarded and field-complete (no undefined,
// which Firestore rejects) and failures are non-fatal so play never blocks on the network.

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { addPoints } from './pointsService';

export const READING_PILLARS = ['Phonemic Awareness', 'Phonics', 'Fluency', 'Vocabulary', 'Comprehension'] as const;
export type ReadingPillar = typeof READING_PILLARS[number];

export interface ReadingProgress {
  userId: string;
  mastery: Record<ReadingPillar, number>;   // 0–100 per pillar
  completedQuests: string[];
  xp: number;
  updatedAt: number;
}

const COLLECTION = 'readingProgress';

export const defaultMastery = (): Record<ReadingPillar, number> =>
  Object.fromEntries(READING_PILLARS.map(p => [p, 0])) as Record<ReadingPillar, number>;

/** Load a user's saved reading progress, or null if they have none yet. */
export async function loadReadingProgress(userId: string): Promise<ReadingProgress | null> {
  try {
    const snap = await getDoc(doc(db, COLLECTION, userId));
    if (!snap.exists()) return null;
    const data = snap.data() as Partial<ReadingProgress>;
    return {
      userId,
      mastery: { ...defaultMastery(), ...(data.mastery || {}) },
      completedQuests: data.completedQuests || [],
      xp: data.xp || 0,
      updatedAt: data.updatedAt || 0,
    };
  } catch (err) {
    console.error('[readingQuest] loadReadingProgress failed:', err);
    return null;
  }
}

/** Persist a user's reading progress (full document, merge-safe, no undefined fields). */
export async function saveReadingProgress(
  userId: string,
  progress: { mastery: Record<ReadingPillar, number>; completedQuests: string[]; xp: number }
): Promise<void> {
  try {
    const payload: ReadingProgress = {
      userId,
      mastery: { ...defaultMastery(), ...progress.mastery },
      completedQuests: progress.completedQuests || [],
      xp: progress.xp || 0,
      updatedAt: Date.now(),
    };
    await setDoc(doc(db, COLLECTION, userId), payload, { merge: true });
  } catch (err) {
    console.error('[readingQuest] saveReadingProgress failed:', err);
  }
}

/**
 * Record a finished reading activity for a signed-in user: award real Plajah Points and
 * return the awarded amount. `kind` picks the reward weight; `entityId` ties the transaction
 * to the quest/word-set for traceability.
 */
export async function awardReadingPoints(
  userId: string,
  kind: 'quest' | 'phoneme',
  entityId: string
): Promise<number> {
  const amount = kind === 'quest' ? 3 : 2;
  try {
    await addPoints(userId, amount, 'DAILY_ACTIVITY', 'reading-quest', entityId);
  } catch (err) {
    console.error('[readingQuest] awardReadingPoints failed:', err);
  }
  return amount;
}
