/**
 * Voca cloud sync — Firestore progress (`vocaProgress/{uid}`) + Learner Ledger records.
 * Everything here is best-effort and non-fatal: local progress (vocaProgress.ts) is always the source the
 * game runs on, so a flaky network or a missing rule never blocks a child mid-read.
 */
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { appendRecord, loadProficiency } from '../learningLedgerService';
import { masteryAfter, type VocaProgress, type VocaSession } from './vocaProgress';
import { levelInfo } from '../../data/vocaPassages';

export async function loadCloud(uid: string): Promise<VocaProgress | null> {
  try {
    const snap = await getDoc(doc(db, 'vocaProgress', uid));
    return snap.exists() ? (snap.data() as VocaProgress) : null;
  } catch { return null; }
}

export async function saveCloud(uid: string, p: VocaProgress): Promise<boolean> {
  try {
    // field-complete, JSON-clean payload (Firestore rejects undefined)
    await setDoc(doc(db, 'vocaProgress', uid), JSON.parse(JSON.stringify(p)));
    return true;
  } catch { return false; }
}

/** Newer of local vs cloud wins (by updatedAt). */
export function pickNewer(a: VocaProgress | null, b: VocaProgress | null): VocaProgress | null {
  if (!a) return b; if (!b) return a; return (b.updatedAt || 0) > (a.updatedAt || 0) ? b : a;
}

/** One ledger record per completed (non-noisy) read against the level's fluency standard. */
export async function recordToLedger(uid: string, s: VocaSession): Promise<void> {
  if (s.noisy) return;
  try {
    const std = levelInfo(s.level).standardId;
    const prof = await loadProficiency(uid);
    const before = prof?.byStandard?.[std] ?? 0;
    await appendRecord({ studentId: uid, standardId: std, framework: 'CCSS_ELA', source: 'voca', masteryBefore: before, masteryAfter: masteryAfter(before, s), byUid: uid, evidence: `voca:${s.passageId}` });
  } catch { /* ledger is additive; a failed write never interrupts the game */ }
}
