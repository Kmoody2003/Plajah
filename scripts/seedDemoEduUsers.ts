// seedDemoEduUsers — creates demo TEACHER, PARENT, and STUDENT accounts so the education
// flows can be demoed without real OAuth. Idempotent (safe to re-run).
//
// Creates:
//   • a verified demo TEACHER (email login; teacherVerification = ADMIN_APPROVED so they can provision)
//   • a demo PARENT (email login) with two PARENT-OWNED children (username/password logins)
//   • one teacher-provisioned, UNCLAIMED student + a fixed claim code, so the parent-claim flow is demoable
//
// Requires (same as the server): GOOGLE_SERVICE_ACCOUNT_JSON (Firestore writes via the service
// account, which bypasses security rules) and FIREBASE_API_KEY (Auth REST sign-up for the email
// accounts). Run where those exist — e.g. on Cloud Run, or locally with them in .env.local:
//
//   npx tsx scripts/seedDemoEduUsers.ts
//
// Children log in on the app's "Student" tab; the teacher/parent on the Email tab.

import { readFileSync } from 'fs';
for (const f of ['.env.local', '.env']) {
  try {
    readFileSync(f, 'utf8').split('\n').forEach(l => {
      const t = l.trim(); if (!t || t.startsWith('#')) return;
      const i = t.indexOf('='); if (i < 0) return;
      const k = t.slice(0, i).trim(); const v = t.slice(i + 1).trim();
      if (k && !(k in process.env)) process.env[k] = v;
    });
    break;
  } catch {}
}

import { fsSet, fsGet, hashPassword, adminConfig } from '../services/firebaseAdminRest';

const API_KEY = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY;
const CHILD_CONTROLS = { adultFilter: true, maxMaturity: 'PG', hideAdultPosts: true, kidsMode: true };
const childUidFor = (username: string) => `child_demo_${username.replace(/[^a-z0-9]/gi, '')}`;
const normalizeCode = (c: string) => c.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
const PASS = 'PlajahDemo1!';
const KID_PASS = 'readwithme';

// Auth REST: create an email/password user (or sign in if it already exists) → uid.
async function getOrCreateAuthUser(email: string, password: string): Promise<string | null> {
  const signUp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const su = await signUp.json() as any;
  if (su.localId) return su.localId;
  if (su.error?.message === 'EMAIL_EXISTS') {
    const signIn = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    const si = await signIn.json() as any;
    return si.localId ?? null;
  }
  console.error('  auth error:', su.error?.message || JSON.stringify(su));
  return null;
}

async function writeChild(opts: { username: string; password: string; displayName: string; birthYear?: number; ownerUid: string; asTeacher: boolean }) {
  const childUid = childUidFor(opts.username);
  const now = Date.now();
  await fsSet(`users/${childUid}`, {
    uid: childUid, displayName: opts.displayName, photoURL: '', email: '',
    isChild: true, accountType: 'CHILD', username: opts.username.toLowerCase(),
    childState: opts.asTeacher ? 'SCHOOL_PROVISIONED' : 'PARENT_OWNED',
    role: 'user', tier: 'FREE', followerCount: 0, followingCount: 0, createdAt: now,
    parentalControls: CHILD_CONTROLS,
    ...(opts.birthYear ? { birthYear: opts.birthYear } : {}),
    ...(opts.asTeacher ? { provisionedByTeacherUid: opts.ownerUid } : { guardianUid: opts.ownerUid }),
  });
  await fsSet(`learnerCredentials/${opts.username.toLowerCase()}`, {
    childUid, hash: hashPassword(opts.password), createdBy: opts.ownerUid, createdAt: now, failedAttempts: 0, lockedUntil: 0,
  });
  return childUid;
}

(async () => {
  if (!adminConfig.hasServiceAccount()) { console.error('✗ GOOGLE_SERVICE_ACCOUNT_JSON not set — run where the service account is available (Cloud Run, or paste into .env.local).'); process.exit(1); }
  if (!API_KEY) { console.error('✗ FIREBASE_API_KEY not set.'); process.exit(1); }

  console.log('Seeding demo education users…');

  // ── Teacher ──
  const teacherEmail = 'demo.teacher@school.edu';
  const teacherUid = await getOrCreateAuthUser(teacherEmail, PASS);
  if (!teacherUid) { console.error('✗ could not create demo teacher'); process.exit(1); }
  await fsSet(`users/${teacherUid}`, {
    uid: teacherUid, displayName: 'Ms. Rivera (Demo Teacher)', photoURL: '', email: teacherEmail,
    accountType: 'TEACHER', isTeacher: true, teacherVerification: 'ADMIN_APPROVED',
    role: 'user', tier: 'FREE', followerCount: 0, followingCount: 0, createdAt: Date.now(),
  });
  console.log(`  ✓ teacher  ${teacherEmail} / ${PASS}  (verified, can provision)`);

  // ── Teacher-provisioned, unclaimed student + claim code ──
  const noahUid = await writeChild({ username: 'noah.demo', password: KID_PASS, displayName: 'Noah (Demo)', birthYear: 2016, ownerUid: teacherUid, asTeacher: true });
  const claimCode = 'DEMO-READ-2024';
  await fsSet(`claimTokens/${normalizeCode(claimCode)}`, { childUid: noahUid, createdBy: teacherUid, createdAt: Date.now(), expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000, usedAt: 0 });
  console.log(`  ✓ student  noah.demo / ${KID_PASS}  (UNCLAIMED — claim code: ${claimCode})`);

  // ── Parent + two owned children ──
  const parentEmail = 'demo.parent@example.com';
  const parentUid = await getOrCreateAuthUser(parentEmail, PASS);
  if (!parentUid) { console.error('✗ could not create demo parent'); process.exit(1); }
  const mayaUid = await writeChild({ username: 'maya.demo', password: KID_PASS, displayName: 'Maya (Demo)', birthYear: 2016, ownerUid: parentUid, asTeacher: false });
  const liamUid = await writeChild({ username: 'liam.demo', password: KID_PASS, displayName: 'Liam (Demo)', birthYear: 2017, ownerUid: parentUid, asTeacher: false });
  await fsSet(`users/${parentUid}`, {
    uid: parentUid, displayName: 'Demo Parent', photoURL: '', email: parentEmail,
    accountType: 'PARENT', childUids: [mayaUid, liamUid],
    role: 'user', tier: 'FREE', followerCount: 0, followingCount: 0, createdAt: Date.now(),
  });
  console.log(`  ✓ parent   ${parentEmail} / ${PASS}  (children: maya.demo, liam.demo)`);
  console.log(`  ✓ students maya.demo, liam.demo / ${KID_PASS}`);

  console.log('\nDone. Demo logins:');
  console.log(`  Teacher (Email tab):  ${teacherEmail} / ${PASS}`);
  console.log(`  Parent  (Email tab):  ${parentEmail} / ${PASS}`);
  console.log(`  Students (Student tab): maya.demo · liam.demo / ${KID_PASS}`);
  console.log(`  Claim demo: as the parent, claim "${claimCode}" to adopt noah.demo.`);
})();
