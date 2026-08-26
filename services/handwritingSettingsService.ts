// handwritingSettingsService — where a parent/teacher's difficulty tuning for a learner persists.
// Difficulty is set BY an adult FOR a learner; a learner never changes their own. Per-learner
// settings live at handwritingSettings/{learnerUid}; an optional per-class default lives at
// handwritingClassSettings/{classId} (a teacher sets one baseline for a whole class, and a
// per-learner setting overrides it). Resolution order used by the view: learner override → class
// default → auto (skill-adaptive). Same guarantees as the rest of Penna: field-complete writes
// (no undefined), failures non-fatal.

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { DEFAULT_TUNING, type HandwritingTuning } from './handwritingFormEngine';

const LEARNER_COLLECTION = 'handwritingSettings';
const CLASS_COLLECTION = 'handwritingClassSettings';

export interface HandwritingSettingsDoc {
  scopeId: string;          // learner uid or class id
  tuning: HandwritingTuning;
  updatedBy: string;        // uid of the adult who set it (audit trail)
  updatedAt: number;
}

/** Normalize to a field-complete tuning object Firestore will accept. */
const cleanTuning = (t?: Partial<HandwritingTuning> | null): HandwritingTuning => ({
  mode: t?.mode === 'manual' ? 'manual' : 'auto',
  manual: typeof t?.manual === 'number' ? t.manual : DEFAULT_TUNING.manual,
});

async function loadTuning(collection: string, scopeId: string): Promise<HandwritingTuning | null> {
  if (!scopeId) return null;
  try {
    const snap = await getDoc(doc(db, collection, scopeId));
    if (!snap.exists()) return null;
    return cleanTuning((snap.data() as Partial<HandwritingSettingsDoc>).tuning);
  } catch (err) {
    console.error('[penna] loadTuning failed:', err);
    return null;
  }
}

async function saveTuning(collection: string, scopeId: string, tuning: HandwritingTuning, updatedBy: string): Promise<void> {
  if (!scopeId) return;
  try {
    const payload: HandwritingSettingsDoc = {
      scopeId,
      tuning: cleanTuning(tuning),
      updatedBy: updatedBy || 'unknown',
      updatedAt: Date.now(),
    };
    await setDoc(doc(db, collection, scopeId), payload, { merge: true });
  } catch (err) {
    console.error('[penna] saveTuning failed:', err);
  }
}

/** A single learner's difficulty tuning, set by their parent/teacher. */
export const loadLearnerTuning = (learnerUid: string) => loadTuning(LEARNER_COLLECTION, learnerUid);
export const saveLearnerTuning = (learnerUid: string, tuning: HandwritingTuning, updatedBy: string) =>
  saveTuning(LEARNER_COLLECTION, learnerUid, tuning, updatedBy);

/** A teacher's class-wide default difficulty. Per-learner settings override this. */
export const loadClassTuning = (classId: string) => loadTuning(CLASS_COLLECTION, classId);
export const saveClassTuning = (classId: string, tuning: HandwritingTuning, updatedBy: string) =>
  saveTuning(CLASS_COLLECTION, classId, tuning, updatedBy);

/** Resolve which tuning applies: learner override first, then class default, then null (→ auto). */
export function resolveTuning(learner: HandwritingTuning | null, klass: HandwritingTuning | null): HandwritingTuning | null {
  return learner ?? klass ?? null;
}
