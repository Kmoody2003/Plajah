/**
 * Mastery — the Khan-style learn → practice → master loop, for every Academia course.
 *
 * Each practiceable thing (a lesson, a math skill) is a SKILL with a key like
 * `lesson:civics-hall:t1-l2` or `math:g5:Fraction Operations`. A learner earns mastery points by
 * answering practice questions: right answers add, wrong answers subtract (never below 0), and the
 * total maps to four levels — Attempted → Familiar → Proficient → Mastered. Reaching Proficient
 * for the first time writes evidence to the Learner Ledger (the same ledger the teacher and parent
 * hubs read), so practice counts, not just reading.
 *
 * Storage mirrors schoolChassis: localStorage always, plus one Firestore doc per learner
 * (`users/{uid}/mastery/skills`) when signed in. Pure functions are exported for tests.
 */
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, auth } from './backendService';
import { appendRecord } from './learningLedgerService';

export type MasteryLevel = 'new' | 'attempted' | 'familiar' | 'proficient' | 'mastered';

export interface SkillState {
  /** 0–100 mastery points. */
  points: number;
  attempts: number;
  correct: number;
  updatedAt: number;
  /** true once Proficient has been written to the ledger, so it is only recorded once. */
  ledgered?: boolean;
}
export type SkillMap = Record<string, SkillState>;

export const LEVELS: Array<{ id: MasteryLevel; label: string; min: number; color: string }> = [
  { id: 'new', label: 'Not started', min: -1, color: '#64748b' },
  { id: 'attempted', label: 'Attempted', min: 0, color: '#f59e0b' },
  { id: 'familiar', label: 'Familiar', min: 50, color: '#fb923c' },
  { id: 'proficient', label: 'Proficient', min: 80, color: '#3b82f6' },
  { id: 'mastered', label: 'Mastered', min: 100, color: '#a855f7' },
];

export function levelFor(s?: SkillState): MasteryLevel {
  if (!s || s.attempts === 0) return 'new';
  if (s.points >= 100) return 'mastered';
  if (s.points >= 80) return 'proficient';
  if (s.points >= 50) return 'familiar';
  return 'attempted';
}
export const levelMeta = (l: MasteryLevel) => LEVELS.find(x => x.id === l)!;

/** Points for one answer. Harder questions are worth more; a miss costs less than a hit earns. */
export function pointsFor(correct: boolean, level: 1 | 2 | 3 = 1): number {
  return correct ? 6 + 3 * level : -4;
}

/** Apply a finished practice set (list of right/wrong with the question level) to a skill. */
export function applySet(prev: SkillState | undefined, results: Array<{ correct: boolean; level?: 1 | 2 | 3 }>, now = Date.now()): SkillState {
  let pts = prev?.points ?? 0;
  for (const r of results) pts = Math.max(0, Math.min(100, pts + pointsFor(r.correct, r.level ?? 1)));
  return {
    points: pts,
    attempts: (prev?.attempts ?? 0) + results.length,
    correct: (prev?.correct ?? 0) + results.filter(r => r.correct).length,
    updatedAt: now,
    ledgered: prev?.ledgered,
  };
}

/** Roll many skills up to a single 0–100 figure (average of points; unstarted skills count as 0). */
export function rollup(keys: string[], map: SkillMap): { pct: number; byLevel: Record<MasteryLevel, number>; started: number } {
  const byLevel: Record<MasteryLevel, number> = { new: 0, attempted: 0, familiar: 0, proficient: 0, mastered: 0 };
  let sum = 0; let started = 0;
  for (const k of keys) {
    const s = map[k]; byLevel[levelFor(s)]++;
    sum += s?.points ?? 0; if (s?.attempts) started++;
  }
  return { pct: keys.length ? Math.round(sum / keys.length) : 0, byLevel, started };
}

// ── Storage ──────────────────────────────────────────────────────────────────
const lsKey = (uid: string) => `plajah:mastery:${uid}`;
const readLocal = (uid: string): SkillMap => { try { return JSON.parse(localStorage.getItem(lsKey(uid)) || '{}'); } catch { return {}; } };
const writeLocal = (uid: string, m: SkillMap) => { try { localStorage.setItem(lsKey(uid), JSON.stringify(m)); } catch { /* quota / private mode */ } };
const uidOf = (uid?: string) => uid || auth.currentUser?.uid || 'guest';

/** Newest-wins merge of two skill maps (per skill, by updatedAt). */
export function mergeMaps(a: SkillMap, b: SkillMap): SkillMap {
  const out: SkillMap = { ...a };
  for (const [k, v] of Object.entries(b)) if (!out[k] || (v.updatedAt || 0) > (out[k].updatedAt || 0)) out[k] = v;
  return out;
}

export async function loadMastery(uid?: string): Promise<SkillMap> {
  const id = uidOf(uid);
  const local = readLocal(id);
  if (id === 'guest' || !auth.currentUser) return local;
  try {
    const snap = await getDoc(doc(db, 'users', id, 'mastery', 'skills'));
    const remote: SkillMap = snap.exists() ? ((snap.data() as any)?.skills || {}) : {};
    const merged = mergeMaps(remote, local);
    writeLocal(id, merged);
    return merged;
  } catch { return local; }
}

export interface RecordOpts {
  /** Ledger standards to credit when the skill first reaches Proficient. */
  standardIds?: string[];
  framework?: string;
  evidence?: string;
}

/** Save a finished set for one skill. Returns the new full map. */
export async function recordSet(
  skillKey: string, results: Array<{ correct: boolean; level?: 1 | 2 | 3 }>, current: SkillMap, opts: RecordOpts = {}, uid?: string,
): Promise<SkillMap> {
  const id = uidOf(uid);
  const before = current[skillKey];
  let next = applySet(before, results);
  const nowProficient = levelFor(next) === 'proficient' || levelFor(next) === 'mastered';

  if (nowProficient && !next.ledgered && auth.currentUser && opts.standardIds?.length) {
    for (const standardId of opts.standardIds) {
      void appendRecord({
        studentId: auth.currentUser.uid, standardId, framework: opts.framework || 'academia',
        source: 'school-lesson', masteryBefore: Math.round(before?.points ?? 0), masteryAfter: Math.round(next.points),
        byUid: auth.currentUser.uid, evidence: opts.evidence || skillKey,
      });
    }
    next = { ...next, ledgered: true };
  }

  const map = { ...current, [skillKey]: next };
  writeLocal(id, map);
  if (auth.currentUser && id !== 'guest') {
    try { await setDoc(doc(db, 'users', id, 'mastery', 'skills'), { skills: map, updatedAt: Date.now() }, { merge: true }); } catch { /* best-effort */ }
  }
  return map;
}

export const lessonKey = (curriculumId: string, lessonId: string) => `lesson:${curriculumId}:${lessonId}`;
export const mathKey = (grade: number, topic: string) => `math:g${grade}:${topic}`;
