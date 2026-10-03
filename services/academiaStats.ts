/**
 * One place that answers "how is this learner doing in each learning app?" — real data only.
 * Each loader is independent and failure-tolerant (a missing doc or a rules denial is just "no
 * stats yet"), so one broken app never blanks the whole hub. Used by the student's own hub and by
 * the parent hub (the rules let a guardian read their child's progress docs).
 */
import { loadHandwritingProgress, HANDWRITING_CATEGORIES } from './handwritingProgressService';
import { loadReadingProgress, READING_PILLARS } from './readingQuestService';
import { loadLanguageProgress } from './languageQuestService';
import { loadProficiency, globalBenchmark } from './learningLedgerService';
import { loadLocal, loadCloudSafe } from './voca/vocaStats';

export interface AppStat {
  /** Headline number/phrase shown on the app card, e.g. "Level 4" or "12-day streak". */
  headline: string;
  /** Second line, e.g. "WCPM 78 · 94% accuracy". */
  detail: string;
  /** 0–100 progress bar, if the app has one. */
  pct?: number;
  /** false when the learner hasn't started — card shows a "Start" nudge instead of numbers. */
  started: boolean;
}

export interface LearnerStats {
  voca: AppStat; penna: AppStat; reading: AppStat; languages: AppStat; ledger: AppStat;
  /** Lifetime practice signal for "keep going" copy. */
  streakDays: number;
}

const none = (headline: string, detail: string): AppStat => ({ headline, detail, started: false });
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

export async function loadLearnerStats(uid: string): Promise<LearnerStats> {
  const [voca, pen, rd, lang, prof] = await Promise.all([
    loadLocalOrCloudVoca(uid).catch(() => null),
    loadHandwritingProgress(uid).catch(() => null),
    loadReadingProgress(uid).catch(() => null),
    loadLanguageProgress(uid).catch(() => null),
    loadProficiency(uid).catch(() => null),
  ]);

  const vocaStat: AppStat = voca && voca.sessions.length
    ? (() => {
        const last = [...voca.sessions].reverse().find(s => !s.noisy) || voca.sessions[voca.sessions.length - 1];
        return { started: true, headline: `Level ${voca.level}`, detail: `${Math.round(last.wcpm)} WCPM · ${Math.round(last.accuracy * 100)}% accuracy · ${voca.sessions.length} reads`, pct: Math.min(100, (voca.level / 10) * 100) };
      })()
    : none('Not started', 'Read aloud with Chora');

  const penStat: AppStat = pen && (pen.masteredLetters.length || pen.xp)
    ? { started: true, headline: `${pen.masteredLetters.length} letters`, detail: `${pen.booksCompleted.length} stories · ${pen.xp} XP`, pct: avg(HANDWRITING_CATEGORIES.map(c => pen.mastery[c] || 0)) }
    : none('Not started', 'Trace letters, earn the picture');

  const rdStat: AppStat = rd && (rd.completedQuests.length || rd.xp)
    ? { started: true, headline: `${rd.completedQuests.length} quests`, detail: `${rd.xp} XP · ${READING_PILLARS.length} pillars`, pct: avg(READING_PILLARS.map(p => rd.mastery[p] || 0)) }
    : none('Not started', 'Phonics to comprehension');

  const langStat: AppStat = lang && (lang.xp || lang.streak)
    ? { started: true, headline: `${lang.streak}-day streak`, detail: `${lang.xp} XP · ${Object.keys(lang.srs).length} cards learned`, pct: Math.min(100, Object.keys(lang.srs).length) }
    : none('Not started', 'Spanish, French, Mandarin');

  const bench = prof && Object.keys(prof.byStandard).length ? globalBenchmark(prof) : null;
  const ledgerStat: AppStat = bench
    ? { started: true, headline: `${bench.overall}% mastery`, detail: `${Object.keys(prof!.byStandard).length} standards · ${bench.level}`, pct: bench.overall }
    : none('No evidence yet', 'Grows as work is graded');

  return {
    voca: vocaStat, penna: penStat, reading: rdStat, languages: langStat, ledger: ledgerStat,
    streakDays: Math.max(voca?.streak?.count || 0, lang?.streak || 0),
  };
}

async function loadLocalOrCloudVoca(uid: string) {
  return (await loadCloudSafe(uid)) ?? loadLocal(uid);
}

// ── Teacher: real class performance ───────────────────────────────────────────────────────────
import { getDocs, collection, query, where, limit } from 'firebase/firestore';
import { db } from './firebase';
import type { TemplateSubmission } from './assignmentTemplateService';

export interface ClassMetric {
  classId: string; title: string; enrolled: number;
  submitted: number; graded: number; awaiting: number;
  /** Mean rubric mastery across graded work, null until something is graded. */
  avgMastery: number | null;
  /** Enrolled students with ledger evidence AND mean mastery under 50. No evidence ≠ at risk. */
  atRisk: number;
  /** Enrolled students with ledger evidence at all. */
  withEvidence: number;
}

export interface TeacherMetrics {
  classes: ClassMetric[];
  totals: { classes: number; students: number; awaiting: number; graded: number; avgMastery: number | null; atRisk: number };
}

export async function loadTeacherMetrics(teacherUid: string, classes: Array<{ id: string; title?: string; enrolledStudents?: string[] }>): Promise<TeacherMetrics> {
  let subs: TemplateSubmission[] = [];
  try {
    const snap = await getDocs(query(collection(db, 'templateSubmissions'), where('teacherUid', '==', teacherUid), limit(500)));
    subs = snap.docs.map(d => ({ ...(d.data() as any), id: d.id } as TemplateSubmission));
  } catch { /* no submissions yet, or rules */ }

  const rows: ClassMetric[] = await Promise.all(classes.map(async c => {
    const mine = subs.filter(s => s.classId === c.id);
    const graded = mine.filter(s => s.status === 'graded' && s.grade);
    const enrolled = c.enrolledStudents || [];
    const profs = await Promise.all(enrolled.slice(0, 40).map(id => loadProficiency(id).catch(() => null)));
    const evid = profs.filter(p => p && Object.keys(p.byStandard).length);
    const atRisk = evid.filter(p => globalBenchmark(p!).overall < 50).length;
    return {
      classId: c.id, title: c.title || 'Class', enrolled: enrolled.length,
      submitted: mine.length, graded: graded.length, awaiting: mine.length - graded.length,
      avgMastery: graded.length ? avg(graded.map(s => s.grade!.masteryPercent)) : null,
      atRisk, withEvidence: evid.length,
    };
  }));

  const g = rows.reduce((a, r) => a + r.graded, 0);
  const weighted = rows.reduce((a, r) => a + (r.avgMastery ?? 0) * r.graded, 0);
  return {
    classes: rows,
    totals: {
      classes: rows.length, students: rows.reduce((a, r) => a + r.enrolled, 0),
      awaiting: rows.reduce((a, r) => a + r.awaiting, 0), graded: g,
      avgMastery: g ? Math.round(weighted / g) : null, atRisk: rows.reduce((a, r) => a + r.atRisk, 0),
    },
  };
}
