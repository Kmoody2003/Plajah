// routes/enrollments.ts — the Enrolled Student role (services/enrollmentCore.ts).
//
//   GET  /api/enrollments/mine                  the caller's active enrollments, every course on the platform
//   GET  /api/enrollments/org?orgId=             an org's enrolled students (org owner, admins, pastors, staff, teachers)
//   POST /api/enrollments/sync-program {programId}  follow a Christian Ed class roster after its staff save it
//   POST /api/enrollments/end-program  {programId}  a deleted class ends its students' enrollments

import { Router, Request, Response } from 'express';
import { fsGet, verifyIdToken } from '../services/firebaseAdminRest';
import { canManageProgram, endCourseEnrollments, enrollmentsOf, orgEnrollments, syncProgramEnrollments } from '../services/enrollmentServer';

export const enrollmentsRouter = Router();

async function callerUid(req: Request): Promise<string | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  return verifyIdToken(auth.slice(7));
}

const badId = (id: string) => !id || id.length > 128 || /[^A-Za-z0-9_-]/.test(id);

enrollmentsRouter.get('/mine', async (req: Request, res: Response) => {
  const uid = await callerUid(req);
  if (!uid) return res.status(401).json({ error: 'Sign in first.' });
  return res.json({ enrollments: await enrollmentsOf(uid, req.query.all === '1') });
});

enrollmentsRouter.get('/org', async (req: Request, res: Response) => {
  const uid = await callerUid(req);
  if (!uid) return res.status(401).json({ error: 'Sign in first.' });
  const orgId = String(req.query.orgId || '').trim();
  if (badId(orgId)) return res.status(400).json({ error: 'Bad request.' });
  const [org, platformAdmin] = await Promise.all([fsGet(`organizations/${orgId}`), fsGet(`admins/${uid}`)]);
  const staff = !!org && (org.creatorId === uid || [org.admins, org.itAdminUids, org.pastorUids, org.staffUids, org.eduTeacherUids].some((l: string[] | undefined) => (l || []).includes(uid)));
  if (!staff && !platformAdmin) return res.status(403).json({ error: 'Only the org’s staff can see who is enrolled.' });
  return res.json({ enrollments: await orgEnrollments(orgId) });
});

async function programForManager(req: Request, res: Response): Promise<string | null> {
  const uid = await callerUid(req);
  if (!uid) { res.status(401).json({ error: 'Sign in first.' }); return null; }
  const programId = String(req.body?.programId || '').trim();
  if (badId(programId)) { res.status(400).json({ error: 'Bad request.' }); return null; }
  const program = await fsGet(`churchPrograms/${programId}`);
  const org = program?.orgId ? await fsGet(`organizations/${program.orgId}`) : null;
  if (!canManageProgram(uid, program, org) && !(await fsGet(`admins/${uid}`))) { res.status(403).json({ error: 'Forbidden' }); return null; }
  return programId;
}

enrollmentsRouter.post('/sync-program', async (req: Request, res: Response) => {
  const programId = await programForManager(req, res);
  if (!programId) return;
  const r = await syncProgramEnrollments(programId);
  return r ? res.json(r) : res.status(404).json({ error: 'Class not found.' });
});

enrollmentsRouter.post('/end-program', async (req: Request, res: Response) => {
  const uid = await callerUid(req);
  if (!uid) return res.status(401).json({ error: 'Sign in first.' });
  const programId = String(req.body?.programId || '').trim();
  if (badId(programId)) return res.status(400).json({ error: 'Bad request.' });
  // Only once the class is really gone, so nobody can end a live class's enrollments.
  if (await fsGet(`churchPrograms/${programId}`)) return res.status(409).json({ error: 'The class still exists.' });
  return res.json({ ended: await endCourseEnrollments('christian_ed', programId) });
});
