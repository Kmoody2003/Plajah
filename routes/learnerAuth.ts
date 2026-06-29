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
import {
  createCustomToken, verifyIdToken, hashPassword, verifyPassword,
  fsGet, fsSet, fsPatch, fsCreate, adminConfig,
} from '../services/firebaseAdminRest';
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

const CHILD_CONTROLS = { adultFilter: true, maxMaturity: 'PG', hideAdultPosts: true, kidsMode: true };

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
  if (!adminConfig.hasServiceAccount()) return res.status(503).json({ error: 'Server not configured for account provisioning.' });
  const uid = await callerUid(req);
  if (!uid) return res.status(401).json({ error: 'Sign in to create a learner account.' });

  const { username, password, displayName, birthYear, role, classroomId } = req.body ?? {};
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

  const profile: Record<string, unknown> = {
    uid: childUid, displayName, photoURL: '', email: '',
    isChild: true, accountType: 'CHILD', username: username.toLowerCase(),
    childState, role: 'user', tier: 'FREE',
    followerCount: 0, followingCount: 0, createdAt: now,
    parentalControls: CHILD_CONTROLS,
    ...(typeof birthYear === 'number' ? { birthYear } : {}),
    ...(asTeacher ? { provisionedByTeacherUid: uid } : { guardianUid: uid }),
  };
  if (!(await fsSet(USER(childUid), profile))) return res.status(502).json({ error: 'Could not create the account.' });
  await fsSet(CRED(username), { childUid, hash: hashPassword(password), createdBy: uid, createdAt: now, failedAttempts: 0, lockedUntil: 0 });

  let claimCode: string | undefined;
  if (asTeacher) {
    const token = createClaimToken(childUid, uid, now);
    await fsSet(CLAIM(token.code), { childUid, createdBy: uid, createdAt: now, expiresAt: token.expiresAt, usedAt: 0 });
    claimCode = token.code;
  } else {
    // Link to the parent's childUids.
    const parent = await fsGet(USER(uid));
    const kids: string[] = Array.isArray(parent?.childUids) ? parent!.childUids : [];
    if (!kids.includes(childUid)) await fsPatch(USER(uid), { childUids: [...kids, childUid] });
  }
  if (classroomId && typeof classroomId === 'string') await audit(childUid, uid, 'provision', `class:${classroomId}`);
  else await audit(childUid, uid, 'provision', asTeacher ? 'teacher' : 'parent');

  return res.status(201).json({ childUid, username: username.toLowerCase(), childState, ...(claimCode ? { claimCode } : {}) });
});

// ── POST /login ────────────────────────────────────────────────────────────────
// PUBLIC + rate-limited. Username + password → Firebase custom token. No email involved.
learnerAuthRouter.post('/login', async (req: Request, res: Response) => {
  if (!adminConfig.hasServiceAccount()) return res.status(503).json({ error: 'Sign-in is temporarily unavailable.' });
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
  const token = createCustomToken(String(cred.childUid));
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
  await fsPatch(USER(token.childUid), { guardianUid: uid, childState: 'PARENT_OWNED' });
  const parent = await fsGet(USER(uid));
  const kids: string[] = Array.isArray(parent?.childUids) ? parent!.childUids : [];
  if (!kids.includes(token.childUid)) await fsPatch(USER(uid), { childUids: [...kids, token.childUid] });
  await fsPatch(CLAIM(String(claimCode)), { usedAt: Date.now() });
  await audit(token.childUid, uid, 'claim');

  return res.json({ childUid: token.childUid });
});

// ── POST /reset-password ──────────────────────────────────────────────────────────
// Guardian or the provisioning teacher sets a new password (child has no email to self-reset).
learnerAuthRouter.post('/reset-password', async (req: Request, res: Response) => {
  const uid = await callerUid(req);
  if (!uid) return res.status(401).json({ error: 'Sign in first.' });
  const { username, newPassword } = req.body ?? {};
  const p = isValidChildPassword(newPassword); if (!p.ok) return res.status(400).json({ error: p.reason });

  const cred = await fsGet(CRED(String(username)));
  if (!cred) return res.status(404).json({ error: 'No account with that username.' });
  const child = await fsGet(USER(String(cred.childUid)));
  const allowed = child && (child.guardianUid === uid || child.provisionedByTeacherUid === uid);
  if (!allowed) return res.status(403).json({ error: 'Only this child\'s parent or teacher can reset the password.' });

  await fsPatch(CRED(String(username)), { hash: hashPassword(String(newPassword)), failedAttempts: 0, lockedUntil: 0 });
  await audit(String(cred.childUid), uid, 'access', 'password-reset');
  return res.json({ ok: true });
});
