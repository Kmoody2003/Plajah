// learnerAuthService — client side of the child-account identity flow. Talks to the
// /api/learner-auth endpoints and exchanges the returned Firebase custom token for a real
// session via signInWithCustomToken. Validates username/password locally (same rules the
// server re-checks) before hitting the network. See docs/education blueprint §1.

import { signInWithCustomToken, User } from 'firebase/auth';
import { auth } from './firebase';
import { isValidUsername, isValidChildPassword } from './accountSafeguards';

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

/** Guardian or provisioning teacher sets a new password for a child (who has no email). */
export async function resetChildPassword(username: string, newPassword: string): Promise<void> {
  const p = isValidChildPassword(newPassword); if (!p.ok) throw new Error(p.reason);
  const res = await fetch('/api/learner-auth/reset-password', { method: 'POST', headers: await authedHeaders(), body: JSON.stringify({ username, newPassword }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Could not reset the password.');
}
