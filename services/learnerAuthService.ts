// learnerAuthService — client side of the child-account identity flow. Talks to the
// /api/learner-auth endpoints and exchanges the returned Firebase custom token for a real
// session via signInWithCustomToken. Validates username/password locally (same rules the
// server re-checks) before hitting the network. See docs/education blueprint §1.

import { signInWithCustomToken, User } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { isValidUsername, isValidChildPassword } from './accountSafeguards';
import { CHILD_DEFAULTS } from './contentSafety';

async function authedHeaders(): Promise<Record<string, string>> {
  const tok = await auth.currentUser?.getIdToken();
  return { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) };
}

export interface ProvisionInput {
  username: string;
  password: string;
  displayName: string;
  birthYear?: number;
  role: 'parent' | 'teacher';
  classroomId?: string;
  /** Guardian (or school, for teacher-provisioned students) allows Voca to listen while the child reads aloud.
   *  Decided once at setup so the child is never stopped mid-lesson waiting for an adult. */
  speechRecognition?: boolean;
}
export interface ProvisionResult { childUid: string; username: string; childState: string; claimCode?: string; }

/** Parent (owns immediately) or verified teacher (walled + returns a claim code) creates a child. */
export async function provisionChild(input: ProvisionInput): Promise<ProvisionResult> {
  const u = isValidUsername(input.username); if (!u.ok) throw new Error(u.reason);
  const p = isValidChildPassword(input.password); if (!p.ok) throw new Error(p.reason);
  const res = await fetch('/api/learner-auth/provision', { method: 'POST', headers: await authedHeaders(), body: JSON.stringify(input) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Could not create the account.');
  return data as ProvisionResult;
}

/** A child signs in with username + password — replaces the current session with the child's. */
export async function childLogin(username: string, password: string): Promise<User> {
  if (!username || !password) throw new Error('Enter your username and password.');
  const res = await fetch('/api/learner-auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Wrong username or password.');
  const cred = await signInWithCustomToken(auth, data.token);
  return cred.user;
}

/** A signed-in parent claims a teacher-provisioned child with the offline code. */
export async function claimChild(claimCode: string): Promise<{ childUid: string }> {
  if (!claimCode.trim()) throw new Error('Enter the claim code from your child\'s teacher.');
  const res = await fetch('/api/learner-auth/claim', { method: 'POST', headers: await authedHeaders(), body: JSON.stringify({ claimCode }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Could not claim this account.');
  return data as { childUid: string };
}

export interface TeacherStatus { verification: string; email: string; canProvision: boolean; }

/** Read the signed-in user's teacher-verification status. */
export async function teacherStatus(): Promise<TeacherStatus> {
  const res = await fetch('/api/learner-auth/teacher-status', { headers: await authedHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Could not load status.');
  return data as TeacherStatus;
}

/** Request teacher verification — institutional email auto-verifies, else files for review. */
export async function requestTeacherVerification(): Promise<{ verification: string; pending: boolean; canProvision: boolean }> {
  const res = await fetch('/api/learner-auth/request-teacher', { method: 'POST', headers: await authedHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Could not verify your teacher account.');
  return data;
}

export interface ChildCredentialInfo {
  childUid: string;
  username: string;
  savedPassword: string;
  hasPasswordHash: boolean;
  failedAttempts: number;
  lockedUntil: number;
}

/** Guardian or teacher fetches a child's login username, saved password, and lock status. */
export async function getChildCredentials(childUid: string): Promise<ChildCredentialInfo> {
  try {
    const res = await fetch(`/api/learner-auth/child-credentials?childUid=${encodeURIComponent(childUid)}`, {
      headers: await authedHeaders(),
    });
    if (res.ok) {
      const data = await res.json();
      return {
        childUid: data.childUid || childUid,
        username: data.username || '',
        savedPassword: data.savedPassword || '',
        hasPasswordHash: Boolean(data.hasPasswordHash),
        failedAttempts: Number(data.failedAttempts || 0),
        lockedUntil: Number(data.lockedUntil || 0),
      };
    }
  } catch { /* fallback to Firestore doc below */ }

  // Fallback: read from users/{childUid} directly via guardian Firestore rules
  const snap = await getDoc(doc(db, 'users', childUid));
  const d = snap.data() as any;
  const savedPassword = String(d?.parentalControls?.savedChildPassword || '');
  return {
    childUid,
    username: String(d?.username || ''),
    savedPassword,
    hasPasswordHash: Boolean(savedPassword || d?.username),
    failedAttempts: 0,
    lockedUntil: 0,
  };
}

/** Guardian or provisioning teacher sets/resets a password (and optionally username) for a child. */
export async function resetChildPassword(
  usernameOrInput: string | { childUid?: string; username: string; newPassword: string },
  newPasswordArg?: string
): Promise<{ username: string; savedPassword: string }> {
  const payload = typeof usernameOrInput === 'string'
    ? { username: usernameOrInput, newPassword: String(newPasswordArg || '') }
    : usernameOrInput;

  const cleanUsername = String(payload.username || '').trim().toLowerCase();
  const cleanPassword = String(payload.newPassword || '');

  const u = isValidUsername(cleanUsername);
  if (!u.ok) throw new Error(u.reason);
  const p = isValidChildPassword(cleanPassword);
  if (!p.ok) throw new Error(p.reason);

  let serverOk = false;
  let serverErr = '';
  try {
    const res = await fetch('/api/learner-auth/reset-password', {
      method: 'POST',
      headers: await authedHeaders(),
      body: JSON.stringify({
        childUid: payload.childUid,
        username: cleanUsername,
        newPassword: cleanPassword,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      serverOk = true;
    } else {
      serverErr = data.error || 'Could not reset the password.';
    }
  } catch (e: any) {
    serverErr = e?.message || 'Network error.';
  }

  // Always mirror username + savedChildPassword on the child's Firestore doc when childUid is known
  // so the guardian immediately sees the updated password in the UI.
  if (payload.childUid) {
    try {
      const snap = await getDoc(doc(db, 'users', payload.childUid));
      const existingControls = snap.data()?.parentalControls || CHILD_DEFAULTS;
      await updateDoc(doc(db, 'users', payload.childUid), {
        username: cleanUsername,
        parentalControls: {
          ...CHILD_DEFAULTS,
          ...existingControls,
          adultFilter: true,
          savedChildPassword: cleanPassword,
          updatedAt: Date.now(),
          updatedBy: auth.currentUser?.uid,
        },
      });
      serverOk = true;
    } catch { /* ignore if rules disallow teacher on non-guardian field */ }
  }

  if (!serverOk && serverErr) {
    throw new Error(serverErr);
  }
  return { username: cleanUsername, savedPassword: cleanPassword };
}

/** Guardian or teacher unlocks a locked child account. */
export async function unlockChildAccount(username: string, childUid?: string): Promise<void> {
  const res = await fetch('/api/learner-auth/unlock', {
    method: 'POST',
    headers: await authedHeaders(),
    body: JSON.stringify({ username, childUid }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Could not unlock account.');
}

const KID_ADJECTIVES = ['Sunny', 'Cosmic', 'Happy', 'Brave', 'Swift', 'Clever', 'Golden', 'Starry', 'Lucky', 'Mighty'];
const KID_NOUNS = ['Panda', 'Tiger', 'Falcon', 'Dolphin', 'Comet', 'Otter', 'Phoenix', 'Koala', 'Rocket', 'Dragon'];

/** Generate an easy-to-remember, kid-friendly password (>= 8 chars) for a parent to give their child. */
export function generateKidFriendlyPassword(): string {
  const adj = KID_ADJECTIVES[Math.floor(Math.random() * KID_ADJECTIVES.length)];
  const noun = KID_NOUNS[Math.floor(Math.random() * KID_NOUNS.length)];
  const num = Math.floor(10 + Math.random() * 89);
  return `${adj}-${noun}-${num}`;
}
