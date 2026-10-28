// academiaClass router — a teacher's view into their own class's Learner Ledger.
//
//   POST /mastery  { classId }                                                  → { students: [{ id, byStandard }] }
//   POST /assess   { classId, studentId, standardId, framework, mastery, evidence? } → { ok }
//
// Ledger docs (learnerProficiency/{uid}, learningLedger/{uid}/records) are readable and writable only by the
// student and their guardians in firestore.rules, because rules can't look up which classes list a student.
// This route can: it checks classrooms/{classId}.ownerId is the caller and the student is enrolled, then reads
// or appends through the service account. Teacher Tools (components/TeacherToolsView.tsx) uses it so the
// gradebook, plans and reports show the class's real evidence instead of sample numbers.
//
// Mounted in server.ts as:  app.use('/api/academia/class', express.json({ limit: '32kb' }), academiaClassRouter)

import { Router, Request, Response } from 'express';
import { verifyIdTokenDetailed, fsGet, fsPatch, fsCreate } from '../services/firebaseAdminRest';

export interface AcademiaClassDeps {
  verify: typeof verifyIdTokenDetailed;
  get: typeof fsGet;
  patch: typeof fsPatch;
  create: typeof fsCreate;
}
const live: AcademiaClassDeps = { verify: verifyIdTokenDetailed, get: fsGet, patch: fsPatch, create: fsCreate };

const MAX_STUDENTS = 200;
const idOk = (s: unknown): s is string => typeof s === 'string' && /^[\w.:-]{1,128}$/.test(s);

export function createAcademiaClassRouter({ verify, get, patch, create }: AcademiaClassDeps = live) {
  const router = Router();

  /** The class, if the caller teaches it. */
  async function myClass(req: Request): Promise<{ uid: string; enrolled: string[] } | null> {
    const auth = req.headers.authorization;
    const t = auth?.startsWith('Bearer ') ? await verify(auth.slice(7)) : null;
    if (!t || t.isAnonymous || !idOk(req.body?.classId)) return null;
    const cls = await get(`classrooms/${req.body.classId}`);
    if (!cls || cls.ownerId !== t.uid) return null;
    return { uid: t.uid, enrolled: (Array.isArray(cls.enrolledStudents) ? cls.enrolledStudents : []).filter(idOk).slice(0, MAX_STUDENTS) };
  }

  router.post('/mastery', async (req: Request, res: Response) => {
    const c = await myClass(req);
    if (!c) return res.status(403).json({ error: 'Only this class’s teacher can see its mastery.' });
    const students = await Promise.all(c.enrolled.map(async id => {
      const p = await get(`learnerProficiency/${id}`);
      return { id, byStandard: (p?.byStandard && typeof p.byStandard === 'object' ? p.byStandard : {}) as Record<string, number> };
    }));
    res.json({ students });
  });

  router.post('/assess', async (req: Request, res: Response) => {
    const c = await myClass(req);
    if (!c) return res.status(403).json({ error: 'Only this class’s teacher can record assessments.' });
    const { studentId, standardId, framework, mastery, evidence } = req.body || {};
    if (!idOk(studentId) || !c.enrolled.includes(studentId)) return res.status(400).json({ error: 'That student isn’t in this class.' });
    if (!idOk(standardId) || typeof mastery !== 'number' || !Number.isFinite(mastery) || mastery < 0 || mastery > 100) return res.status(400).json({ error: 'Pick a standard and a score.' });
    const at = Date.now();
    const record: Record<string, unknown> = {
      studentId, standardId, framework: typeof framework === 'string' ? framework.slice(0, 40) : 'CCSS_ELA',
      source: 'creative-artifact', masteryBefore: mastery, masteryAfter: mastery, delta: 0, at, byUid: c.uid,
    };
    if (typeof evidence === 'string' && evidence.trim()) record.evidence = evidence.trim().slice(0, 1000);
    const id = await create(`learningLedger/${studentId}/records`, record);
    if (!id) return res.status(502).json({ error: 'Couldn’t save the assessment. Try again.' });
    // Merge in memory: standard ids contain dots, which a REST field-path mask would split.
    const prof = await get(`learnerProficiency/${studentId}`);
    const byStandard = { ...((prof?.byStandard as Record<string, number>) || {}), [standardId]: mastery };
    await patch(`learnerProficiency/${studentId}`, { studentId, byStandard, updatedAt: at });
    res.json({ ok: true });
  });

  return router;
}

export const academiaClassRouter = createAcademiaClassRouter();
