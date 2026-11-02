// learnerAuth router — the secure identity flow for child accounts (the only accounts with no
// email). Children log in with a username + a password set by a parent or a verified teacher;
// the server verifies the scrypt hash and mints a Firebase CUSTOM TOKEN so the child gets a real
// session. Teacher-provisioned accounts are walled and require an offline parent CLAIM code to
// transfer ownership. Enforces the policy in services/accountSafeguards.ts. No firebase-admin —
// uses services/firebaseAdminRest.ts (SA-signed JWTs over REST), matching the rest of server.ts.
//
// Mounted in server.ts as:  app.use('/api/learner-auth', express.json(), learnerAuthRouter)
// with authLimiter applied to the /login path.

import { Router, Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import {
  createCustomToken, verifyIdToken, hashPassword, verifyPassword,
  fsGet, fsSet, fsPatch, fsCreate, fsQuery, fsGetUser, fsPatchUser, adminConfig,
} from '../services/firebaseAdminRest';
import { lookupAuthUser, lookupUidByEmail } from '../services/notify/emailNotifyServer';
import {
  isValidUsername, isValidChildPassword, createClaimToken, validateClaim,
  canProvisionChildren, provisioningCaps, type TeacherVerification, type ClaimToken,
} from '../services/accountSafeguards';

export const learnerAuthRouter = Router();

const CRED = (username: string) => `learnerCredentials/${username.toLowerCase()}`;
const USER = (uid: string) => `users/${uid}`;
const normalizeCode = (c: string) => (c || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
const CLAIM = (code: string) => `claimTokens/${normalizeCode(code)}`;
const newChildUid = (by: string) => `child_${by.slice(0, 6)}_${Math.random().toString(36).slice(2, 9)}`;

const CHILD_CONTROLS = {
  adultFilter: true,
  maxMaturity: 'PG',
  hideAdultPosts: true,
  autoHideMatureThemes: true,
  profanityFilter: true,
  kidsMode: true,
};

async function callerUid(req: Request): Promise<string | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  return verifyIdToken(auth.slice(7));
}

async function audit(childUid: string, actorUid: string, action: string, detail?: string) {
  await fsCreate('accountAudit', { childUid, actorUid, action, at: Date.now(), ...(detail ? { detail } : {}) });
}

// ── POST /provision ──────────────────────────────────────────────────────────────
// A signed-in PARENT (creates their own child → immediately owned) or a VERIFIED TEACHER
// (creates a walled, school-provisioned child → returns a claim code for the family).
learnerAuthRouter.post('/provision', async (req: Request, res: Response) => {
  if (!adminConfig.hasCredentials()) return res.status(503).json({ error: 'Server not configured for account provisioning.' });
  const uid = await callerUid(req);
  if (!uid) return res.status(401).json({ error: 'Sign in to create a learner account.' });

  const { username, password, displayName, birthYear, role, classroomId, speechRecognition } = req.body ?? {};
  const u = isValidUsername(username); if (!u.ok) return res.status(400).json({ error: u.reason });
  const p = isValidChildPassword(password); if (!p.ok) return res.status(400).json({ error: p.reason });
  if (!displayName || typeof displayName !== 'string') return res.status(400).json({ error: 'A display name is required.' });
  const asTeacher = role === 'teacher';

  // Username uniqueness.
  if (await fsGet(CRED(username))) return res.status(409).json({ error: 'That username is taken.' });

  // Teacher path: must be a verified teacher and within provisioning caps.
  const caller = await fsGet(USER(uid));
  if (asTeacher) {
    const v = (caller?.teacherVerification ?? 'UNVERIFIED') as TeacherVerification;
    if (!canProvisionChildren(v)) return res.status(403).json({ error: 'Only verified teachers can provision student accounts.' });
    void provisioningCaps(v); // cap enforcement (count check) wired with the roster in Phase 2b
  }

  const childUid = newChildUid(uid);
  const now = Date.now();
  const childState = asTeacher ? 'SCHOOL_PROVISIONED' : 'PARENT_OWNED';
  const cleanUsername = String(username).trim().toLowerCase();
  const cleanPassword = String(password);

  const profile: Record<string, unknown> = {
    uid: childUid, displayName, photoURL: '',
    isChild: true, accountType: 'CHILD', username: cleanUsername,
    childState, role: 'user', tier: 'FREE',
    followerCount: 0, followingCount: 0, createdAt: now,
  };
  const privateProfile: Record<string, unknown> = {
    // reading-voice consent is decided by the adult creating the account (parent, or school for a teacher-
    // provisioned student) so a child never waits for an absent adult before Chora can listen
    parentalControls: {
      ...CHILD_CONTROLS,
      ...(speechRecognition === true ? { speechRecognition: true } : {}),
      updatedAt: now,
      updatedBy: uid,
    },
    ...(typeof birthYear === 'number' ? { birthYear } : {}),
    ...(asTeacher ? { provisionedByTeacherUid: uid } : { guardianUid: uid }),
  };
  // Private half first: a child's public doc never exists without its guardian link and controls.
  if (!(await fsSet(`${USER(childUid)}/private/profile`, privateProfile))) return res.status(502).json({ error: 'Could not create the account.' });
  if (!(await fsSet(USER(childUid), profile))) return res.status(502).json({ error: 'Could not create the account.' });
  await fsSet(CRED(cleanUsername), {
    childUid,
    hash: hashPassword(cleanPassword),
    createdBy: uid,
    createdAt: now,
    failedAttempts: 0,
    lockedUntil: 0,
  });

  let claimCode: string | undefined;
  if (asTeacher) {
    const token = createClaimToken(childUid, uid, now);
    await fsSet(CLAIM(token.code), { childUid, createdBy: uid, createdAt: now, expiresAt: token.expiresAt, usedAt: 0 });
    claimCode = token.code;
  } else {
    // Link to the parent's childUids.
    const parent = await fsGetUser(uid);
    const kids: string[] = Array.isArray(parent?.childUids) ? parent!.childUids : [];
    if (!kids.includes(childUid)) await fsPatchUser(uid, { childUids: [...kids, childUid] });
  }
  if (speechRecognition === true) await audit(childUid, uid, 'consent', asTeacher ? 'voca-speech:school' : 'voca-speech:guardian');
  if (classroomId && typeof classroomId === 'string') await audit(childUid, uid, 'provision', `class:${classroomId}`);
  else await audit(childUid, uid, 'provision', asTeacher ? 'teacher' : 'parent');

  return res.status(201).json({ childUid, username: cleanUsername, childState, ...(claimCode ? { claimCode } : {}) });
});

// ── POST /login ────────────────────────────────────────────────────────────────
// PUBLIC + rate-limited. Username + password → Firebase custom token. No email involved.
learnerAuthRouter.post('/login', async (req: Request, res: Response) => {
  if (!adminConfig.hasCredentials()) return res.status(503).json({ error: 'Sign-in is temporarily unavailable.' });
  const { username, password } = req.body ?? {};
  if (!username || !password) return res.status(400).json({ error: 'Enter your username and password.' });

  const cred = await fsGet(CRED(String(username)));
  // Generic message on any failure — never reveal whether the username exists.
  const deny = () => res.status(401).json({ error: 'Wrong username or password.' });
  if (!cred || !cred.hash) return deny();

  const now = Date.now();
  if (typeof cred.lockedUntil === 'number' && cred.lockedUntil > now) {
    return res.status(429).json({ error: 'Too many tries. Ask your parent or teacher to help, then try again later.' });
  }
  if (!verifyPassword(String(password), String(cred.hash))) {
    const failed = (typeof cred.failedAttempts === 'number' ? cred.failedAttempts : 0) + 1;
    const lock = failed >= 8 ? now + 15 * 60 * 1000 : 0; // lock 15 min after 8 wrong tries
    await fsPatch(CRED(String(username)), { failedAttempts: failed, lockedUntil: lock });
    await audit(String(cred.childUid || ''), String(cred.childUid || ''), 'login_failed');
    return deny();
  }

  if (cred.failedAttempts) await fsPatch(CRED(String(username)), { failedAttempts: 0, lockedUntil: 0 });
  const token = await createCustomToken(String(cred.childUid));
  if (!token) return res.status(500).json({ error: 'Sign-in failed. Please try again.' });
  await audit(String(cred.childUid), String(cred.childUid), 'login');
  return res.json({ token, childUid: cred.childUid });
});

// ── POST /claim ──────────────────────────────────────────────────────────────────
// A signed-in PARENT claims a teacher-provisioned child with the offline code → ownership transfers.
learnerAuthRouter.post('/claim', async (req: Request, res: Response) => {
  const uid = await callerUid(req);
  if (!uid) return res.status(401).json({ error: 'Sign in as a parent to claim a child.' });
  const { claimCode } = req.body ?? {};
  if (!claimCode) return res.status(400).json({ error: 'Enter the claim code from your child\'s teacher.' });

  const rec = await fsGet(CLAIM(String(claimCode)));
  if (!rec) return res.status(404).json({ error: 'That claim code was not found.' });
  const token: ClaimToken = { code: normalizeCode(String(claimCode)), childUid: String(rec.childUid), createdBy: String(rec.createdBy), createdAt: Number(rec.createdAt) || 0, expiresAt: Number(rec.expiresAt) || 0, usedAt: rec.usedAt ? Number(rec.usedAt) : undefined };
  const check = validateClaim({ token, code: normalizeCode(String(claimCode)), claimerIsAuthenticatedParent: true });
  if (!check.ok) return res.status(409).json({ error: check.reason });

  // Transfer ownership: guardian = claimer; state → PARENT_OWNED (teacher keeps classroom-scoped view).
  await fsPatchUser(token.childUid, { guardianUid: uid, childState: 'PARENT_OWNED' });
  const parent = await fsGetUser(uid);
  const kids: string[] = Array.isArray(parent?.childUids) ? parent!.childUids : [];
  if (!kids.includes(token.childUid)) await fsPatchUser(uid, { childUids: [...kids, token.childUid] });
  await fsPatch(CLAIM(String(claimCode)), { usedAt: Date.now() });
  await audit(token.childUid, uid, 'claim');

  return res.json({ childUid: token.childUid });
});

// ── GET /child-credentials ──────────────────────────────────────────────────────
// Guardian or provisioning teacher reads their child's login username, saved password, and lock status.
learnerAuthRouter.get('/child-credentials', async (req: Request, res: Response) => {
  const uid = await callerUid(req);
  if (!uid) return res.status(401).json({ error: 'Sign in first.' });
  const childUid = String(req.query.childUid || '').trim();
  if (!childUid) return res.status(400).json({ error: 'childUid is required.' });

  const child = await fsGetUser(childUid);
  if (!child) return res.status(404).json({ error: 'Child account not found.' });
  const allowed = child.guardianUid === uid || child.provisionedByTeacherUid === uid;
  if (!allowed) return res.status(403).json({ error: 'Only this child\'s parent or teacher can view credentials.' });

  const username = String(child.username || '').trim().toLowerCase();
  const cred = username ? await fsGet(CRED(username)) : null;
  return res.json({
    childUid,
    username,
    hasPasswordHash: Boolean(cred?.hash),
    failedAttempts: Number(cred?.failedAttempts || 0),
    lockedUntil: Number(cred?.lockedUntil || 0),
  });
});

// ── POST /reset-password ──────────────────────────────────────────────────────────
// Guardian or the provisioning teacher sets/resets a child's password (and can assign a username
// if the child profile was created without one). Only a hash is kept: the adult sees the new password once.
learnerAuthRouter.post('/reset-password', async (req: Request, res: Response) => {
  const uid = await callerUid(req);
  if (!uid) return res.status(401).json({ error: 'Sign in first.' });
  const { childUid: bodyChildUid, username: bodyUsername, newPassword } = req.body ?? {};
  const p = isValidChildPassword(newPassword);
  if (!p.ok) return res.status(400).json({ error: p.reason });

  let targetUsername = String(bodyUsername || '').trim().toLowerCase();
  let cred = targetUsername ? await fsGet(CRED(targetUsername)) : null;
  const targetChildUid = String(bodyChildUid || cred?.childUid || '').trim();
  if (!targetChildUid) return res.status(400).json({ error: 'Child account or username is required.' });

  const child = await fsGetUser(targetChildUid);
  if (!child) return res.status(404).json({ error: 'Child account not found.' });
  const allowed = child.guardianUid === uid || child.provisionedByTeacherUid === uid;
  if (!allowed) return res.status(403).json({ error: 'Only this child\'s parent or teacher can reset the password.' });

  if (!targetUsername) {
    targetUsername = String(child.username || '').trim().toLowerCase();
  }
  if (!targetUsername) {
    return res.status(400).json({ error: 'Please choose a username for this child account.' });
  }
  const uCheck = isValidUsername(targetUsername);
  if (!uCheck.ok) return res.status(400).json({ error: uCheck.reason });

  // If the username is new or changed, verify it isn't owned by a different child
  cred = await fsGet(CRED(targetUsername));
  if (cred && cred.childUid && String(cred.childUid) !== targetChildUid) {
    return res.status(409).json({ error: 'That username is already taken by another learner.' });
  }

  const now = Date.now();
  const cleanPw = String(newPassword);
  await fsSet(CRED(targetUsername), {
    childUid: targetChildUid,
    hash: hashPassword(cleanPw),
    createdBy: cred?.createdBy || uid,
    createdAt: cred?.createdAt || now,
    updatedAt: now,
    failedAttempts: 0,
    lockedUntil: 0,
  });

  const { savedChildPassword: _dropped, ...existingControls } = ((child.parentalControls && typeof child.parentalControls === 'object')
    ? child.parentalControls
    : CHILD_CONTROLS) as Record<string, unknown>;
  await fsPatchUser(targetChildUid, {
    username: targetUsername,
    parentalControls: {
      ...existingControls,
      updatedAt: now,
      updatedBy: uid,
    },
  });

  await audit(targetChildUid, uid, 'access', 'password-reset');
  return res.json({ ok: true, username: targetUsername });
});

// ── POST /unlock ────────────────────────────────────────────────────────────────
// Guardian or provisioning teacher unlocks a child account after failed login attempts.
learnerAuthRouter.post('/unlock', async (req: Request, res: Response) => {
  const uid = await callerUid(req);
  if (!uid) return res.status(401).json({ error: 'Sign in first.' });
  const { username, childUid } = req.body ?? {};
  const targetUsername = String(username || '').trim().toLowerCase();
  if (!targetUsername) return res.status(400).json({ error: 'Username is required.' });

  const cred = await fsGet(CRED(targetUsername));
  const resolvedChildUid = String(childUid || cred?.childUid || '');
  if (!resolvedChildUid) return res.status(404).json({ error: 'Account not found.' });
  const child = await fsGetUser(resolvedChildUid);
  const allowed = child && (child.guardianUid === uid || child.provisionedByTeacherUid === uid);
  if (!allowed) return res.status(403).json({ error: 'Only this child\'s parent or teacher can unlock the account.' });

  if (cred) {
    await fsPatch(CRED(targetUsername), { failedAttempts: 0, lockedUntil: 0 });
  }
  await audit(resolvedChildUid, uid, 'access', 'account-unlock');
  return res.json({ ok: true });
});

// ── Teacher verification ───────────────────────────────────────────────────────
// Only verified teachers may provision student accounts. An institutional email domain
// (.edu / .k12.* / .sch.* / .ac.* etc.) auto-verifies; anything else files a request for
// admin/district-SSO review and stays unverified (no provisioning powers).
function classifyTeacherEmail(email: string): TeacherVerification | null {
  const domain = (email.split('@')[1] || '').toLowerCase();
  if (!domain) return null;
  if (/(^|\.)edu$/.test(domain)) return 'DOMAIN';                 // *.edu
  if (/\.edu\.[a-z]{2,3}$/.test(domain)) return 'DOMAIN';         // edu.au, edu.sg, ...
  if (/\.(k12|sch|ac)\.[a-z]{2,3}$/.test(domain)) return 'DOMAIN'; // k12.*, sch.uk, ac.uk, ...
  if (/\.k12\./.test(domain)) return 'DOMAIN';                    // *.k12.<state>.us
  return null;
}

// ── POST /guardians-of ─────────────────────────────────────────────────────────
// Teachers loop parents in (assignments, attendance, chat CC) but can't read a student's private doc.
// Returns guardian uids only, only for a student the caller teaches, guards, is, or shares a chat room with.
learnerAuthRouter.post('/guardians-of', async (req: Request, res: Response) => {
  const uid = await callerUid(req);
  if (!uid) return res.status(401).json({ error: 'Sign in first.' });
  const uids: string[] = (Array.isArray(req.body?.uids) ? req.body.uids : []).filter((x: unknown) => typeof x === 'string' && x).slice(0, 300);
  const roomId = typeof req.body?.roomId === 'string' ? req.body.roomId : '';
  const room = roomId ? await fsGet(`chat_rooms/${roomId}`) : null;
  const inRoom: string[] = room && Array.isArray(room.participants) && room.participants.includes(uid) ? room.participants : [];
  const owned = await fsQuery('classrooms', [{ field: 'ownerId', value: uid }], 200);
  const taught = new Set<string>();
  for (const c of owned) for (const s of (Array.isArray(c.data.enrolledStudents) ? c.data.enrolledStudents : [])) taught.add(String(s));
  const guardians: Record<string, string[]> = {};
  await Promise.all(uids.map(async (s) => {
    const priv = (await fsGet(`${USER(s)}/private/profile`)) || {};
    const links = [priv.guardianUid, ...(Array.isArray(priv.coGuardianUids) ? priv.coGuardianUids : [])].filter(Boolean) as string[];
    if (s === uid || links.includes(uid) || taught.has(s) || inRoom.includes(s) || priv.provisionedByTeacherUid === uid) guardians[s] = [...new Set(links)];
  }));
  return res.json({ guardians });
});

// ── Class join codes ───────────────────────────────────────────────────────────
// A class that isn't open is joined with a code its teacher hands out. classJoinCodes has no client rule:
// only the server reads it, so a code can't be listed or guessed through Firestore.
learnerAuthRouter.post('/class-code', async (req: Request, res: Response) => {
  const uid = await callerUid(req);
  if (!uid) return res.status(401).json({ error: 'Sign in first.' });
  const classId = String(req.body?.classId || '');
  const cls = classId ? await fsGet(`classrooms/${classId}`) : null;
  if (!cls || cls.ownerId !== uid) return res.status(403).json({ error: 'Only the teacher can see the code.' });
  const existing = await fsQuery('classJoinCodes', [{ field: 'classId', value: classId }], 1);
  if (existing[0]) return res.json({ code: existing[0].id });
  const code = randomBytes(6).toString('base64').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8);
  if (code.length < 8 || !(await fsSet(`classJoinCodes/${code}`, { classId, ownerId: uid, createdAt: Date.now() }))) {
    return res.status(502).json({ error: 'Could not make a code. Try again.' });
  }
  return res.json({ code });
});

learnerAuthRouter.post('/join-class', async (req: Request, res: Response) => {
  const uid = await callerUid(req);
  if (!uid) return res.status(401).json({ error: 'Sign in first.' });
  const code = String(req.body?.code || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const rec = code ? await fsGet(`classJoinCodes/${code}`) : null;
  const cls = rec ? await fsGet(`classrooms/${rec.classId}`) : null;
  if (!rec || !cls) return res.status(404).json({ error: 'That code was not found.' });
  // A code never skips payment: paid courses are joined through checkout.
  if (Number(cls.price) > 0) return res.status(409).json({ error: 'This course is joined through checkout.' });
  const enrolled: string[] = Array.isArray(cls.enrolledStudents) ? cls.enrolledStudents : [];
  if (enrolled.includes(uid)) return res.json({ classId: rec.classId });
  const capacity = Number(cls.capacity) || 0;
  if (capacity > 0 && enrolled.length >= capacity) return res.status(409).json({ error: 'This class is full.' });
  if (!(await fsPatch(`classrooms/${rec.classId}`, { enrolledStudents: [...enrolled, uid] }))) {
    return res.status(502).json({ error: 'Could not join. Try again.' });
  }
  return res.json({ classId: rec.classId });
});

// ── POST /brand-manager ────────────────────────────────────────────────────────
// Adding a manager by email. Emails aren't queryable from the client, so the brand's owner asks here.
learnerAuthRouter.post('/brand-manager', async (req: Request, res: Response) => {
  const uid = await callerUid(req);
  if (!uid) return res.status(401).json({ error: 'Sign in first.' });
  const brandId = String(req.body?.brandId || '');
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!brandId || !email) return res.status(400).json({ error: 'Brand and email are required.' });
  const brand = await fsGet(`brand_accounts/${brandId}`);
  if (!brand || brand.ownerId !== uid) return res.status(403).json({ error: 'Only the brand owner can add managers.' });
  const managerUid = await lookupUidByEmail(email);
  if (!managerUid) return res.status(404).json({ error: 'User not found' });
  const managers: string[] = Array.isArray(brand.managers) ? brand.managers : [];
  await fsPatch(`brand_accounts/${brandId}`, { managers: [...new Set([...managers, managerUid])] });
  const m = await fsGet(USER(managerUid));
  const ids: string[] = Array.isArray(m?.managedBrandIds) ? m!.managedBrandIds : [];
  await fsPatch(USER(managerUid), { managedBrandIds: [...new Set([...ids, brandId])] });
  return res.json({ ok: true });
});

learnerAuthRouter.get('/teacher-status', async (req: Request, res: Response) => {
  const uid = await callerUid(req);
  if (!uid) return res.status(401).json({ error: 'Sign in.' });
  const u = await fsGet(USER(uid));
  const verification = (u?.teacherVerification ?? 'UNVERIFIED') as TeacherVerification;
  const account = await lookupAuthUser(uid);
  return res.json({ verification, email: account?.email || '', canProvision: canProvisionChildren(verification) });
});

learnerAuthRouter.post('/request-teacher', async (req: Request, res: Response) => {
  if (!adminConfig.hasCredentials()) return res.status(503).json({ error: 'Verification is temporarily unavailable.' });
  const uid = await callerUid(req);
  if (!uid) return res.status(401).json({ error: 'Sign in.' });
  const u = await fsGet(USER(uid));
  if (!u) return res.status(404).json({ error: 'Account not found.' });

  // Only the address Firebase Auth has verified counts: a profile field could be typed by anyone.
  const account = await lookupAuthUser(uid);
  const cls = account?.emailVerified ? classifyTeacherEmail(String(account.email || '')) : null;
  if (cls) {
    await fsPatch(USER(uid), { teacherVerification: cls, isTeacher: true });
    return res.json({ verification: cls, pending: false, canProvision: true });
  }
  await fsSet(`teacherVerificationRequests/${uid}`, { uid, email: account?.email || '', requestedAt: Date.now(), status: 'PENDING' });
  return res.json({ verification: 'UNVERIFIED', pending: true, canProvision: false });
});
