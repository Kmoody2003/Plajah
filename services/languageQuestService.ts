// languageQuestService — real-data layer for the Languages cartridge (Phase E). When a user is
// signed in, their per-card spaced-repetition state, XP, and daily streak persist to Firestore at
// languageProgress/{uid}; finishing a session awards real Plajah Points. Guests play fully in
// memory (no writes). All writes are guarded + field-complete (no undefined) and non-fatal, so
// play never blocks on the network — the same contract as readingQuestService.

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { addPoints } from './pointsService';

/** SM-2-lite scheduling state for one card. */
export interface CardSRS {
  ease: number;         // 1.3 … 2.8 — how "easy" the card is
  intervalDays: number; // days until next review
  dueAt: number;        // unix ms when the card is next due
  reps: number;         // successful reps in a row
}

export interface LanguageProgress {
  userId: string;
  xp: number;
  streak: number;         // consecutive days practiced
  lastDay: string;        // 'YYYY-MM-DD' of last practice (local)
  srs: Record<string, CardSRS>; // key = `${langId}:${cardId}`
  updatedAt: number;
}

const COLLECTION = 'languageProgress';
const DAY_MS = 24 * 60 * 60 * 1000;

/** Local calendar day key. Accepts an injected `now` so callers stay deterministic/testable. */
export const dayKey = (now: number): string => new Date(now).toISOString().slice(0, 10);

export const emptyProgress = (userId: string): LanguageProgress => ({
  userId, xp: 0, streak: 0, lastDay: '', srs: {}, updatedAt: 0,
});

export async function loadLanguageProgress(userId: string): Promise<LanguageProgress | null> {
  try {
    const snap = await getDoc(doc(db, COLLECTION, userId));
    if (!snap.exists()) return null;
    const d = snap.data() as Partial<LanguageProgress>;
    return {
      userId,
      xp: d.xp || 0,
      streak: d.streak || 0,
      lastDay: d.lastDay || '',
      srs: d.srs || {},
      updatedAt: d.updatedAt || 0,
    };
  } catch (err) {
    console.error('[languageQuest] load failed:', err);
    return null;
  }
}

export async function saveLanguageProgress(p: LanguageProgress): Promise<void> {
  try {
    const payload: LanguageProgress = {
      userId: p.userId, xp: p.xp || 0, streak: p.streak || 0,
      lastDay: p.lastDay || '', srs: p.srs || {}, updatedAt: Date.now(),
    };
    await setDoc(doc(db, COLLECTION, p.userId), payload, { merge: true });
  } catch (err) {
    console.error('[languageQuest] save failed:', err);
  }
}

/**
 * Update a card's SRS state from a review outcome (pure). Correct answers grow the interval by
 * the ease factor; a miss resets to same-day so the learner sees it again this session/tomorrow.
 */
export function reviewCard(prev: CardSRS | undefined, correct: boolean, now: number): CardSRS {
  const cur: CardSRS = prev || { ease: 2.3, intervalDays: 0, dueAt: 0, reps: 0 };
  if (!correct) {
    return { ease: Math.max(1.3, cur.ease - 0.2), intervalDays: 0, dueAt: now + DAY_MS, reps: 0 };
  }
  const reps = cur.reps + 1;
  const intervalDays = reps === 1 ? 1 : reps === 2 ? 3 : Math.round(cur.intervalDays * cur.ease) || 1;
  return {
    ease: Math.min(2.8, cur.ease + 0.05),
    intervalDays,
    dueAt: now + intervalDays * DAY_MS,
    reps,
  };
}

/** Roll the daily streak forward given the last-practiced day and now (pure). */
export function bumpStreak(streak: number, lastDay: string, now: number): { streak: number; lastDay: string } {
  const today = dayKey(now);
  if (lastDay === today) return { streak: Math.max(1, streak), lastDay };      // already counted today
  const yesterday = dayKey(now - DAY_MS);
  const next = lastDay === yesterday ? streak + 1 : 1;                          // continue or reset
  return { streak: next, lastDay: today };
}

/** How many of the given card keys are due for review right now. */
export function dueCount(srs: Record<string, CardSRS>, keys: string[], now: number): number {
  return keys.filter(k => { const s = srs[k]; return s && s.dueAt <= now; }).length;
}

/** New (never-seen) card keys among the given set. */
export function newCount(srs: Record<string, CardSRS>, keys: string[]): number {
  return keys.filter(k => !srs[k]).length;
}

/** Award real Plajah Points for a finished language session (signed-in users only). */
export async function awardLanguagePoints(userId: string, entityId: string, amount = 3): Promise<number> {
  try {
    await addPoints(userId, amount, 'DAILY_ACTIVITY', 'language-quest', entityId);
  } catch (err) {
    console.error('[languageQuest] awardLanguagePoints failed:', err);
  }
  return amount;
}
