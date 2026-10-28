// worksheetGrading router — grades Academia worksheets where the answer key lives (services/worksheetKeys.ts).
//
//   POST /check  { worksheetId, answers, readConfidence? }  → SelfCheckResult (looks-good / try-again, never the answer)
//   POST /grade  { worksheetId }                            → { grade }  and writes the score onto the submission
//
// Students' copies of a worksheet carry no correctAnswer, and firestore.rules keep score fields off their
// submission, so a grade can only come from here. /grade reads the answers the student already saved on
// worksheet_submissions/{worksheetId}_{uid}, merges the teacher-only key and stores score, percent and a
// pre-assessment without the key in it. The teacher's turn-in brief adds the key back from their own copy.
//
// Mounted in server.ts as:  app.use('/api/worksheets', express.json({ limit: '256kb' }), worksheetGradingRouter)

import { Router, Request, Response } from 'express';
import { verifyIdTokenDetailed, fsGet, fsPatch, fsSet, fsList } from '../services/firebaseAdminRest';
import { autoGradeWorksheet, type DigitalWorksheet } from '../services/worksheetDigitizer';
import { preAssessFromAnswers, preAssessWorksheet } from '../services/worksheetGrading';
import { selfCheckWorksheet } from '../services/worksheetScanCore';
import { hasEmbeddedKeys, splitWorksheetKeys, withWorksheetKeys, withoutExpected, type WorksheetAnswerKeys } from '../services/worksheetKeys';

export interface WorksheetGradingDeps {
  verify: typeof verifyIdTokenDetailed;
  get: typeof fsGet;
  patch: typeof fsPatch;
}
const live: WorksheetGradingDeps = { verify: verifyIdTokenDetailed, get: fsGet, patch: fsPatch };

const cleanAnswers = (v: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v as Record<string, unknown>).slice(0, 400)) if (typeof x === 'string' || typeof x === 'number') out[k.slice(0, 80)] = String(x).slice(0, 2000);
  return out;
};
const cleanConfidence = (v: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v as Record<string, unknown>).slice(0, 400)) if (typeof x === 'number' && Number.isFinite(x)) out[k.slice(0, 80)] = Math.max(0, Math.min(1, x));
  return out;
};

export function createWorksheetGradingRouter({ verify, get, patch }: WorksheetGradingDeps = live) {
  const router = Router();

  async function caller(req: Request) {
    const auth = req.headers.authorization;
    const t = auth?.startsWith('Bearer ') ? await verify(auth.slice(7)) : null;
    return t && !t.isAnonymous ? t.uid : null;
  }

  /** The full worksheet (key merged), if this person may open it. */
  async function fullSheet(worksheetId: string, uid: string): Promise<DigitalWorksheet | null> {
    if (!/^[\w-]{1,128}$/.test(worksheetId)) return null;
    const pub = await get(`digital_worksheets/${worksheetId}`) as (DigitalWorksheet & { accessUids?: string[] }) | null;
    if (!pub || !(pub.createdBy === uid || (pub.accessUids || []).includes(uid))) return null;
    const key = await get(`digital_worksheet_keys/${worksheetId}`) as { keys?: WorksheetAnswerKeys } | null;
    return withWorksheetKeys({ ...pub, id: worksheetId, fields: pub.fields || [] }, key?.keys);
  }

  router.post('/check', async (req: Request, res: Response) => {
    const uid = await caller(req);
    if (!uid) return res.status(401).json({ error: 'Sign in to check your work.' });
    const sheet = await fullSheet(String(req.body?.worksheetId || ''), uid);
    if (!sheet) return res.status(404).json({ error: 'That assignment isn’t available.' });
    res.json(selfCheckWorksheet(sheet, cleanAnswers(req.body?.answers), cleanConfidence(req.body?.readConfidence)));
  });

  router.post('/grade', async (req: Request, res: Response) => {
    const uid = await caller(req);
    if (!uid) return res.status(401).json({ error: 'Sign in to turn in.' });
    const worksheetId = String(req.body?.worksheetId || '');
    const sheet = await fullSheet(worksheetId, uid);
    if (!sheet) return res.status(404).json({ error: 'That assignment isn’t available.' });
    const subPath = `worksheet_submissions/${worksheetId}_${uid}`;
    const sub = await get(subPath);
    if (!sub || sub.studentId !== uid || sub.status !== 'turned-in') return res.status(409).json({ error: 'Turn the assignment in first.' });

    const answers = cleanAnswers(sub.answers);
    const readConfidence = cleanConfidence(sub.readConfidence);
    const grade = autoGradeWorksheet(sheet, answers);
    const student = { id: uid, name: String(sub.studentName || '') };
    const at = typeof sub.turnedInAt === 'number' ? sub.turnedInAt : Date.now();
    const preAssessment = Object.keys(readConfidence).length
      ? preAssessWorksheet(sheet, { answers, confidence: { ...Object.fromEntries(Object.keys(answers).map(id => [id, 1])), ...readConfidence } }, student, at)
      : preAssessFromAnswers(sheet, answers, student, at);
    const ok = await patch(subPath, {
      score: grade.score, maxScore: grade.maxScore, percent: grade.percent, needsManualReview: grade.needsManualReview,
      gradedAt: Date.now(), preAssessment: JSON.parse(JSON.stringify(withoutExpected(preAssessment))),
    });
    if (!ok) return res.status(502).json({ error: 'Couldn’t save your grade. Try again.' });
    res.json({ grade });
  });

  return router;
}

export const worksheetGradingRouter = createWorksheetGradingRouter();

// ── One-time split of worksheets saved before keys were withheld ─────────────────────────────────
// Worksheets published before services/worksheetKeys.ts carry correctAnswer on the copy students read.
// The teacher's next open splits one client-side; this splits all of them server-side, once per
// deploy-safe marker (serverMigrations has no client rule, so only the service account sees it).
// Idempotent: a re-run skips worksheets with no embedded key and merges into any key doc already there.
export interface LegacyKeySplitDeps {
  get: typeof fsGet;
  set: typeof fsSet;
  patch: typeof fsPatch;
  list: typeof fsList;
}
const MIGRATION = 'serverMigrations/worksheetKeySplit_v1';

export async function splitLegacyWorksheetKeys(deps: LegacyKeySplitDeps = { get: fsGet, set: fsSet, patch: fsPatch, list: fsList }): Promise<{ scanned: number; split: number; skipped?: boolean }> {
  if ((await deps.get(MIGRATION))?.done) return { scanned: 0, split: 0, skipped: true };
  const all = await deps.list('digital_worksheets', { pageSize: 200, maxDocs: 20000 });
  let split = 0;
  for (const { id, data } of all) {
    const sheet = { ...data, id, fields: Array.isArray(data.fields) ? data.fields : [] } as DigitalWorksheet;
    if (!hasEmbeddedKeys(sheet)) continue;
    const { publicSheet, keys } = splitWorksheetKeys(sheet);
    const prior = await deps.get(`digital_worksheet_keys/${id}`);
    const keyed = await deps.set(`digital_worksheet_keys/${id}`, { worksheetId: id, createdBy: String(data.createdBy || ''), keys: { ...((prior?.keys as WorksheetAnswerKeys) || {}), ...keys }, updatedAt: Date.now() });
    // Only strip the student copy once its key is safely stored.
    if (keyed && await deps.patch(`digital_worksheets/${id}`, { fields: JSON.parse(JSON.stringify(publicSheet.fields)), answerKeyWithheld: true })) split++;
  }
  await deps.set(MIGRATION, { done: true, scanned: all.length, split, at: Date.now() });
  return { scanned: all.length, split };
}
