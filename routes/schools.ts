// schools router — the emergent-school backend. A school grows from teachers up:
//   1. A teacher enters their school name → POST /resolve creates it UNOFFICIAL (or joins the
//      existing one as a PENDING colleague awaiting confirmation).
//   2. As colleagues join and confirm each other it becomes BUILDING.
//   3. A verified teacher who works there claims it (POST /request-claim) → OFFICIAL + an admin
//      persona forms. Districts skip straight to OFFICIAL via POST /provision.
// Mirrors the Clubs "Claim as Founder" pattern. Only real staff (matching institutional email or
// teacherVerification) can claim — never students/parents/outsiders. No firebase-admin; uses the
// SA-signed REST layer (services/firebaseAdminRest.ts), matching server.ts.
//
// Mounted in server.ts as:  app.use('/api/schools', express.json(), schoolsRouter)

import { Router, Request, Response } from 'express';
import {
  verifyIdToken, fsGet, fsSet, fsPatch, fsCreate, fsList,
  getCustomClaims, setCustomClaims, adminConfig,
} from '../services/firebaseAdminRest';

export const schoolsRouter = Router();

const SCHOOL = (id: string) => `schools/${id}`;
const MEMBER = (schoolId: string, uid: string) => `schoolMemberships/${schoolId}__${uid}`;
const USER = (uid: string) => `users/${uid}`;

async function callerUid(req: Request): Promise<string | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  return verifyIdToken(auth.slice(7));
}
async function audit(schoolId: string, actorUid: string, action: string, detail?: string) {
  await fsCreate('schoolAudit', { schoolId, actorUid, action, at: Date.now(), ...(detail ? { detail } : {}) });
}

// Same normalization on both ends so the same school resolves to one record.
function normalizeName(name: string): string {
  return (name || '')
    .toLowerCase().trim()
    .replace(/[^\p{L}\p{N}\s]/gu, '')  // drop punctuation, keep letters/numbers/space
    .replace(/\s+/g, ' ');
}
function emailDomain(email?: string): string | undefined {
  const at = (email || '').split('@')[1];
  return at ? at.toLowerCase().trim() : undefined;
}
// A domain that indicates a real institution (auto-verifiable for a claim).
function isInstitutionalDomain(domain?: string): boolean {
  if (!domain) return false;
  return /\.edu$/.test(domain) || /\.k12\./.test(domain) || /\.sch\./.test(domain)
    || /\.ac\.[a-z]{2}$/.test(domain) || /\.edu\.[a-z]{2}$/.test(domain);
}
const VALID_ORG_TYPES = new Set(['school', 'district', 'homeschool', 'pod', 'micro-school', 'university']);

// ── POST /resolve ──────────────────────────────────────────────────────────────
// A signed-in teacher enters their school name. Find the existing school (by normalized name) and
// join it as a PENDING colleague, or create a new UNOFFICIAL one with the caller as founder-of-record.
schoolsRouter.post('/resolve', async (req: Request, res: Response) => {
  if (!adminConfig.hasCredentials()) return res.status(503).json({ error: 'Server not configured for schools.' });
  const uid = await callerUid(req);
  if (!uid) return res.status(401).json({ error: 'Sign in to set up your school.' });

  const { name, orgType } = req.body ?? {};
  if (!name || typeof name !== 'string' || name.trim().length < 2) return res.status(400).json({ error: 'Enter your school name.' });
  const org: string = VALID_ORG_TYPES.has(orgType) ? orgType : 'school';
  const norm = normalizeName(name);
  if (!norm) return res.status(400).json({ error: 'Enter a valid school name.' });

  const caller = await fsGet(USER(uid));
  const domain = emailDomain(caller?.email as string | undefined);
  const now = Date.now();

  // De-dupe on normalized name (scan — schools collection is small; a where(normalizedName) query
  // + composite index is the scale-up path once this grows).
  const all = await fsList('schools', { maxDocs: 5000 });
  const existing = all.find(s => s.data?.normalizedName === norm);

  if (existing) {
    const schoolId = existing.id;
    const memberPath = MEMBER(schoolId, uid);
    const already = await fsGet(memberPath);
    if (!already) {
      const isFounder = existing.data?.createdByUid === uid;
      await fsSet(memberPath, {
        id: `${schoolId}__${uid}`, schoolId, uid,
        status: isFounder ? 'CONFIRMED' : 'PENDING',
        role: 'TEACHER', joinedAt: now, ...(domain ? { emailDomain: domain } : {}),
      });
      const teacherCount = (Number(existing.data?.teacherCount) || 1) + 1;
      const patch: Record<string, unknown> = { teacherCount };
      if (existing.data?.state === 'UNOFFICIAL' && teacherCount >= 2) patch.state = 'BUILDING';
      await fsPatch(SCHOOL(schoolId), patch);
      await audit(schoolId, uid, 'JOIN', isFounder ? 'founder' : 'pending-colleague');
    }
    const school = await fsGet(SCHOOL(schoolId));
    return res.json({ school: { id: schoolId, ...school }, joined: !already, isNew: false });
  }

  // Create a new unofficial school with the caller as founder-of-record.
  const schoolId = await fsCreate('schools', {
    name: name.trim(), normalizedName: norm, state: 'UNOFFICIAL', orgType: org,
    createdByUid: uid, createdAt: now, adminUids: [], teacherCount: 1,
    ...(isInstitutionalDomain(domain) ? { domain } : {}),
  });
  if (!schoolId) return res.status(500).json({ error: 'Could not create the school.' });
  await fsSet(MEMBER(schoolId, uid), {
    id: `${schoolId}__${uid}`, schoolId, uid, status: 'CONFIRMED', role: 'TEACHER',
    joinedAt: now, ...(domain ? { emailDomain: domain } : {}),
  });
  await audit(schoolId, uid, 'CREATE', `unofficial ${org}`);
  const school = await fsGet(SCHOOL(schoolId));
  return res.json({ school: { id: schoolId, ...school }, joined: true, isNew: true });
});

// ── GET /pending?schoolId= ───────────────────────────────────────────────────────
// A CONFIRMED teacher lists colleagues awaiting confirmation at their school.
schoolsRouter.get('/pending', async (req: Request, res: Response) => {
  const uid = await callerUid(req);
  if (!uid) return res.status(401).json({ error: 'Sign in.' });
  const schoolId = String(req.query.schoolId || '');
  if (!schoolId) return res.status(400).json({ error: 'schoolId required.' });
  const me = await fsGet(MEMBER(schoolId, uid));
  if (!me || (me.status !== 'CONFIRMED' && me.status !== 'ADMIN')) return res.status(403).json({ error: 'Only confirmed teachers can view this.' });
  const all = await fsList('schoolMemberships', { maxDocs: 5000 });
  const pending = all.filter(m => m.data?.schoolId === schoolId && m.data?.status === 'PENDING')
    .map(m => ({ id: m.id, uid: m.data.uid, joinedAt: m.data.joinedAt, emailDomain: m.data.emailDomain }));
  return res.json({ pending });
});

// ── POST /confirm ──────────────────────────────────────────────────────────────
// A CONFIRMED teacher confirms that a PENDING colleague really works there.
schoolsRouter.post('/confirm', async (req: Request, res: Response) => {
  if (!adminConfig.hasCredentials()) return res.status(503).json({ error: 'Server not configured for schools.' });
  const uid = await callerUid(req);
  if (!uid) return res.status(401).json({ error: 'Sign in.' });
  const { schoolId, uid: targetUid } = req.body ?? {};
  if (!schoolId || !targetUid) return res.status(400).json({ error: 'schoolId and uid required.' });
  const me = await fsGet(MEMBER(schoolId, uid));
  if (!me || (me.status !== 'CONFIRMED' && me.status !== 'ADMIN')) return res.status(403).json({ error: 'Only confirmed teachers can confirm colleagues.' });
  const target = await fsGet(MEMBER(schoolId, targetUid));
  if (!target) return res.status(404).json({ error: 'That teacher is not pending at this school.' });
  if (target.status === 'PENDING') {
    await fsPatch(MEMBER(schoolId, targetUid), { status: 'CONFIRMED', confirmedByUid: uid });
    await audit(schoolId, uid, 'CONFIRM', targetUid);
  }
  return res.json({ ok: true });
});

// ── POST /request-claim ──────────────────────────────────────────────────────────
// A CONFIRMED teacher requests to make the school OFFICIAL. Auto-approves when their institutional
// email domain matches (or establishes) the school domain; otherwise files a claim for review.
schoolsRouter.post('/request-claim', async (req: Request, res: Response) => {
  if (!adminConfig.hasCredentials()) return res.status(503).json({ error: 'Server not configured for schools.' });
  const uid = await callerUid(req);
  if (!uid) return res.status(401).json({ error: 'Sign in.' });
  const { schoolId } = req.body ?? {};
  if (!schoolId) return res.status(400).json({ error: 'schoolId required.' });

  const school = await fsGet(SCHOOL(schoolId));
  if (!school) return res.status(404).json({ error: 'School not found.' });
  const me = await fsGet(MEMBER(schoolId, uid));
  if (!me || (me.status !== 'CONFIRMED' && me.status !== 'ADMIN')) return res.status(403).json({ error: 'Only a confirmed teacher at this school can claim it.' });
  if (school.state === 'OFFICIAL') return res.status(409).json({ error: 'This school is already official.' });

  const caller = await fsGet(USER(uid));
  const domain = emailDomain(caller?.email as string | undefined);
  const verified = caller?.teacherVerification && caller.teacherVerification !== 'UNVERIFIED';
  const domainMatches = domain && school.domain && domain === school.domain;
  const canAutoApprove = !!(domainMatches || (isInstitutionalDomain(domain) && (!school.domain || school.domain === domain)) || verified);

  const now = Date.now();
  const claimId = await fsCreate('schoolClaims', {
    schoolId, requestedByUid: uid, requestedAt: now,
    status: canAutoApprove ? 'APPROVED' : 'PENDING',
    ...(domain ? { evidenceDomain: domain } : {}),
    ...(canAutoApprove ? { resolvedAt: now, resolvedByUid: uid } : {}),
  });

  if (canAutoApprove) {
    const adminUids = Array.isArray(school.adminUids) ? Array.from(new Set([...school.adminUids, uid])) : [uid];
    await fsPatch(SCHOOL(schoolId), {
      state: 'OFFICIAL', adminUids, claimedByUid: uid, claimedAt: now,
      ...(isInstitutionalDomain(domain) && !school.domain ? { domain } : {}),
    });
    await fsPatch(MEMBER(schoolId, uid), { status: 'ADMIN', role: 'ADMIN' });
    // Reach firestore.rules: mark the caller a school admin (merge, don't clobber existing claims).
    const existingClaims = await getCustomClaims(uid);
    await setCustomClaims(uid, { ...existingClaims, isSchoolAdmin: true, schoolAdminOf: schoolId });
    await audit(schoolId, uid, 'CLAIM_APPROVED', domain || 'verified-teacher');
    return res.json({ claimed: true, autoApproved: true, claimId, school: { id: schoolId, ...(await fsGet(SCHOOL(schoolId))) } });
  }

  await audit(schoolId, uid, 'CLAIM_REQUESTED', domain || 'no-domain');
  return res.json({ claimed: false, autoApproved: false, claimId, message: 'Claim filed for review.' });
});

// ── POST /provision ──────────────────────────────────────────────────────────────
// A platform admin / district pre-provisions an OFFICIAL school (skips the emergent flow).
schoolsRouter.post('/provision', async (req: Request, res: Response) => {
  if (!adminConfig.hasCredentials()) return res.status(503).json({ error: 'Server not configured for schools.' });
  const uid = await callerUid(req);
  if (!uid) return res.status(401).json({ error: 'Sign in.' });
  const caller = await fsGet(USER(uid));
  const isPlatformAdmin = caller?.role === 'admin' || caller?.isAdmin === true;
  if (!isPlatformAdmin) return res.status(403).json({ error: 'Only a platform admin or district can pre-provision schools.' });

  const { name, orgType, domain, adminUid, districtId } = req.body ?? {};
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'School name required.' });
  const org: string = VALID_ORG_TYPES.has(orgType) ? orgType : 'school';
  const now = Date.now();
  const admin = typeof adminUid === 'string' && adminUid ? adminUid : uid;
  const schoolId = await fsCreate('schools', {
    name: name.trim(), normalizedName: normalizeName(name), state: 'OFFICIAL', orgType: org,
    createdByUid: uid, createdAt: now, adminUids: [admin], teacherCount: 0,
    claimedByUid: admin, claimedAt: now,
    ...(domain ? { domain: String(domain).toLowerCase() } : {}),
    ...(districtId ? { districtId } : {}),
  });
  if (!schoolId) return res.status(500).json({ error: 'Could not provision the school.' });
  await fsSet(MEMBER(schoolId, admin), { id: `${schoolId}__${admin}`, schoolId, uid: admin, status: 'ADMIN', role: 'ADMIN', joinedAt: now });
  await audit(schoolId, uid, 'PROVISION', `official ${org}`);
  return res.json({ school: { id: schoolId, ...(await fsGet(SCHOOL(schoolId))) } });
});

// ── GET /mine ────────────────────────────────────────────────────────────────────
// The schools the caller is a member of, with their membership status.
schoolsRouter.get('/mine', async (req: Request, res: Response) => {
  const uid = await callerUid(req);
  if (!uid) return res.status(401).json({ error: 'Sign in.' });
  const all = await fsList('schoolMemberships', { maxDocs: 5000 });
  const mine = all.filter(m => m.data?.uid === uid);
  const schools = await Promise.all(mine.map(async m => {
    const s = await fsGet(SCHOOL(m.data.schoolId));
    return s ? { id: m.data.schoolId, ...s, myStatus: m.data.status, myRole: m.data.role } : null;
  }));
  return res.json({ schools: schools.filter(Boolean) });
});

// ── GET /:id ───────────────────────────────────────────────────────────────────
// Public school info (name, state, counts) — safe for anyone.
schoolsRouter.get('/:id', async (req: Request, res: Response) => {
  const s = await fsGet(SCHOOL(req.params.id));
  if (!s) return res.status(404).json({ error: 'School not found.' });
  return res.json({
    school: {
      id: req.params.id, name: s.name, state: s.state, orgType: s.orgType,
      teacherCount: s.teacherCount, domain: s.domain, overlayId: s.overlayId,
    },
  });
});
