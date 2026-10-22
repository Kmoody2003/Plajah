// musicLedger.ts — Conservatory drills → the portable Academic Passport.
//
// Ear Gym and Staff Sprint keep fine-grained progress locally (per item, per level); what the
// ledger needs is the coarse claim: "mastery of MUSIC.EAR.68 moved from 0.42 to 0.48". Each write
// carries the before→after from the last value we wrote for that standard, so the Passport shows
// real growth rather than a stream of absolute snapshots. Guests keep local progress only.

import { auth } from '../backendService';
import { appendRecord } from '../learningLedgerService';
import { standardById } from '../../data/educationStandards';

const KEY = 'musicLedger.last.v1';

function lastWritten(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}

/** Write one mastery record if signed in and the value moved by at least a point. */
export async function recordMusicMastery(standardId: string, mastery: number, evidence: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const std = standardById(standardId);
  if (!std) return;
  const last = lastWritten();
  const before = last[`${uid}:${standardId}`] ?? 0;
  const after = Math.round(Math.max(0, Math.min(1, mastery)) * 100) / 100;
  if (Math.abs(after - before) < 0.01) return;
  last[`${uid}:${standardId}`] = after;
  try { localStorage.setItem(KEY, JSON.stringify(last)); } catch { /* */ }
  await appendRecord({
    studentId: uid, standardId, framework: std.framework, source: 'conservatory',
    masteryBefore: before, masteryAfter: after, evidence, byUid: uid,
  });
}
