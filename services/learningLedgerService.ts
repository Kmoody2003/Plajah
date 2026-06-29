// learningLedgerService — the append-only Learner Ledger.
//
// The atomic unit is a LearningRecord (student × standard × evidence × proficiency-delta ×
// timestamp × source). Records are append-only — corrections are new records that supersede,
// never edits — so the ledger is a trustworthy longitudinal history. Roll-ups produce per-
// standard mastery (LearnerProficiency); high-stakes mastery becomes a CompetencyAssertion
// that Phase 6 will sign/anchor and export as Open Badges 3.0 / Verifiable Credentials.
//
// Firestore layout:
//   learningLedger/{studentId}/records/{recordId}   append-only LearningRecord
//   learnerProficiency/{studentId}                  rolled-up mastery by standard
//   competencyAssertions/{studentId}/items/{id}     signed competency assertions
//
// All writes are guarded + field-complete (no undefined — Firestore rejects it) and non-fatal,
// matching readingQuestService. Reads use single-field ordering only (no where+orderBy combo)
// to avoid composite-index requirements (see [[plajah-firestore-gotchas]]).

import { collection, doc, getDoc, getDocs, addDoc, setDoc, query, orderBy, limit } from 'firebase/firestore';
import { db } from './firebase';
import {
  ProficiencyLevel,
  masteryToLevel,
  masteryToPISABand,
  bandFor,
  standardById,
} from '../data/educationStandards';

export type LearningRecordSource =
  | 'reading-quest' | 'math-classroom' | 'teacher-assessment' | 'creative-artifact' | 'import';

export interface LearningRecord {
  id: string;
  studentId: string;
  standardId: string;
  framework: string;
  source: LearningRecordSource;
  masteryBefore: number;
  masteryAfter: number;
  delta: number;
  at: number;
  byUid?: string;       // who recorded it (teacher / self / system)
  evidence?: string;    // ref to artifact, assessment, or game session
}

export interface CompetencyAssertion {
  id: string;
  studentId: string;
  standardId: string;
  framework: string;
  level: ProficiencyLevel;
  mastery: number;
  assertedAt: number;
  assertedBy: string;
  signature?: string;   // Phase 6: Open Badges 3.0 / W3C VC signature + anchor
}

export interface LearnerProficiency {
  studentId: string;
  byStandard: Record<string, number>;  // standardId → 0..100 mastery
  updatedAt: number;
}

// ── Append a record (the only way the ledger grows) ──────────────────────────────
export async function appendRecord(
  input: Omit<LearningRecord, 'id' | 'delta' | 'at'> & { at?: number }
): Promise<LearningRecord | null> {
  const at = input.at ?? Date.now();
  const delta = Math.round((input.masteryAfter - input.masteryBefore) * 100) / 100;
  // Build field-complete payload — omit optional keys when absent (no undefined writes).
  const payload: Record<string, unknown> = {
    studentId: input.studentId,
    standardId: input.standardId,
    framework: input.framework,
    source: input.source,
    masteryBefore: input.masteryBefore,
    masteryAfter: input.masteryAfter,
    delta,
    at,
  };
  if (input.byUid) payload.byUid = input.byUid;
  if (input.evidence) payload.evidence = input.evidence;

  try {
    const ref = await addDoc(collection(db, 'learningLedger', input.studentId, 'records'), payload);
    await rollupProficiency(input.studentId, input.standardId, input.masteryAfter);
    return { id: ref.id, delta, at, ...input } as LearningRecord;
  } catch (err) {
    console.error('[ledger] appendRecord failed:', err);
    return null;
  }
}

/** Merge a single standard's latest mastery into the learner's rolled-up proficiency doc. */
export async function rollupProficiency(studentId: string, standardId: string, mastery: number): Promise<void> {
  try {
    await setDoc(
      doc(db, 'learnerProficiency', studentId),
      { studentId, byStandard: { [standardId]: mastery }, updatedAt: Date.now() },
      { merge: true }
    );
  } catch (err) {
    console.error('[ledger] rollupProficiency failed:', err);
  }
}

export async function loadProficiency(studentId: string): Promise<LearnerProficiency | null> {
  try {
    const snap = await getDoc(doc(db, 'learnerProficiency', studentId));
    if (!snap.exists()) return null;
    const data = snap.data() as Partial<LearnerProficiency>;
    return { studentId, byStandard: data.byStandard || {}, updatedAt: data.updatedAt || 0 };
  } catch (err) {
    console.error('[ledger] loadProficiency failed:', err);
    return null;
  }
}

export async function loadRecords(studentId: string, max = 50): Promise<LearningRecord[]> {
  try {
    const q = query(collection(db, 'learningLedger', studentId, 'records'), orderBy('at', 'desc'), limit(max));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<LearningRecord, 'id'>) }));
  } catch (err) {
    console.error('[ledger] loadRecords failed:', err);
    return [];
  }
}

/** Certify a competency once mastery is high enough (Phase 6 signs + anchors this). */
export async function assertCompetency(studentId: string, standardId: string, mastery: number, assertedBy: string): Promise<CompetencyAssertion | null> {
  const std = standardById(standardId);
  const assertion: Omit<CompetencyAssertion, 'id'> = {
    studentId,
    standardId,
    framework: std?.framework || 'CCSS_ELA',
    level: masteryToLevel(mastery),
    mastery,
    assertedAt: Date.now(),
    assertedBy,
  };
  try {
    const ref = await addDoc(collection(db, 'competencyAssertions', studentId, 'items'), assertion);
    return { id: ref.id, ...assertion };
  } catch (err) {
    console.error('[ledger] assertCompetency failed:', err);
    return null;
  }
}

// ── Read lenses (pure — operate on already-loaded, scope-checked data) ────────────

export interface DomainSummary { domain: string; mastery: number; level: ProficiencyLevel; color: string; }

/** Parent/student lens: average mastery per domain, with proficiency level + color. */
export function summarizeByDomain(prof: LearnerProficiency): DomainSummary[] {
  const buckets: Record<string, number[]> = {};
  for (const [id, m] of Object.entries(prof.byStandard)) {
    const std = standardById(id);
    const domain = std?.domain || 'General';
    (buckets[domain] ||= []).push(m);
  }
  return Object.entries(buckets).map(([domain, ms]) => {
    const avg = Math.round(ms.reduce((a, b) => a + b, 0) / ms.length);
    const band = bandFor(avg);
    return { domain, mastery: avg, level: band.level, color: band.color };
  });
}

/** Global "where you stand" benchmark for the individual learner. */
export function globalBenchmark(prof: LearnerProficiency): { overall: number; pisaBand: number; level: ProficiencyLevel } {
  const vals = Object.values(prof.byStandard);
  const overall = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  return { overall, pisaBand: masteryToPISABand(overall), level: masteryToLevel(overall) };
}

/**
 * Teacher lens — STRICTLY classroom-scoped: only the standards the teacher teaches, only for
 * enrolled students. Never the learner's out-of-school activity. Returns a mastery heatmap +
 * auto-grouping into support / on-level / turbo for differentiated planning.
 */
export interface ClassMasteryCell { studentId: string; standardId: string; mastery: number; level: ProficiencyLevel; }
export interface ClassMastery {
  cells: ClassMasteryCell[];
  groups: { support: string[]; onLevel: string[]; turbo: string[] };
}
export function classroomMastery(
  enrolled: { studentId: string; byStandard: Record<string, number> }[],
  taughtStandardIds: string[]
): ClassMastery {
  const cells: ClassMasteryCell[] = [];
  const groups = { support: [] as string[], onLevel: [] as string[], turbo: [] as string[] };
  for (const s of enrolled) {
    const scores: number[] = [];
    for (const stdId of taughtStandardIds) {
      const m = s.byStandard[stdId];
      if (typeof m === 'number') { cells.push({ studentId: s.studentId, standardId: stdId, mastery: m, level: masteryToLevel(m) }); scores.push(m); }
    }
    const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    if (avg >= 90) groups.turbo.push(s.studentId);
    else if (avg < 50) groups.support.push(s.studentId);
    else groups.onLevel.push(s.studentId);
  }
  return { cells, groups };
}
