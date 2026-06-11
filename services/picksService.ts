// World Cup 2026 Picks & Predictions service
// All picks are free-to-play, no money involved.
// Stored under Firestore: wcPicks/{userId}

import { db } from './backendService';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { onSnapshot } from './safeSnapshot';

export type MatchResult = 'H' | 'D' | 'A'; // Home win / Draw / Away win

export interface MatchPick {
  result: MatchResult;
  homeScore?: number; // optional exact score (bonus points)
  awayScore?: number;
  pickedAt: number;
}

export interface PicksDoc {
  userId: string;
  matchPicks: Record<string, MatchPick>;      // matchId → pick
  champion?: string;                          // teamId
  runnerUp?: string;
  sf1?: string;
  sf2?: string;
  goldenBoot?: string;                        // playerId
  totalPoints: number;
  history: PicksSummary[];                    // archive of past rounds
  updatedAt: number;
}

export interface PicksSummary {
  round: string;
  pointsEarned: number;
  correct: number;
  total: number;
  snapshotAt: number;
}

// ── Points rules ──────────────────────────────────────────────────────────────
export const POINTS = {
  correctResult:       3,   // picked H/D/A correctly
  exactScore:          5,   // exact scoreline (includes result pts)
  correctGroupAdv:     2,   // correctly picked a team to advance
  correctQF:           3,
  correctSF:           4,
  correctFinalist:     5,
  correctChampion:    10,
  correctGoldenBoot:  15,
} as const;

// ── CRUD ──────────────────────────────────────────────────────────────────────

export function subscribeToPicks(userId: string, cb: (picks: PicksDoc | null) => void): () => void {
  const ref = doc(db, 'wcPicks', userId);
  return onSnapshot(ref, snap => cb(snap.exists() ? (snap.data() as PicksDoc) : null));
}

export async function getPicks(userId: string): Promise<PicksDoc | null> {
  const snap = await getDoc(doc(db, 'wcPicks', userId));
  return snap.exists() ? (snap.data() as PicksDoc) : null;
}

export async function saveMatchPick(userId: string, matchId: string, pick: MatchPick): Promise<void> {
  const ref = doc(db, 'wcPicks', userId);
  await setDoc(ref, {
    userId,
    [`matchPicks.${matchId}`]: pick,
    updatedAt: Date.now(),
  }, { merge: true });
}

export async function saveTournamentPicks(userId: string, data: {
  champion?: string;
  runnerUp?: string;
  sf1?: string;
  sf2?: string;
  goldenBoot?: string;
}): Promise<void> {
  const ref = doc(db, 'wcPicks', userId);
  await setDoc(ref, { userId, ...data, updatedAt: Date.now() }, { merge: true });
}

// ── Scoring helper (run server-side or after results are posted) ───────────────
export function scoreMatchPick(
  pick: MatchPick,
  actualHome: number,
  actualAway: number,
): number {
  const actualResult: MatchResult = actualHome > actualAway ? 'H' : actualHome === actualAway ? 'D' : 'A';
  if (pick.result !== actualResult) return 0;
  const base = POINTS.correctResult;
  if (pick.homeScore === actualHome && pick.awayScore === actualAway) return base + POINTS.exactScore;
  return base;
}
