// schoolService — client side of the emergent-school backend (/api/schools/*).
// A teacher enters their school name and we resolve-or-create it; colleagues join and confirm each
// other; a verified teacher claims it to make it official; districts pre-provision. See the Classroom
// Setup flow + routes/schools.ts. Auth via the signed-in user's Firebase ID token.

import { auth } from './firebase';
import type { School, SchoolMembership } from '../types';

async function authedHeaders(): Promise<Record<string, string>> {
  const tok = await auth.currentUser?.getIdToken();
  return { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) };
}

async function post(path: string, body: unknown): Promise<any> {
  const res = await fetch(`/api/schools${path}`, { method: 'POST', headers: await authedHeaders(), body: JSON.stringify(body ?? {}) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
  return json;
}
async function get(path: string): Promise<any> {
  const res = await fetch(`/api/schools${path}`, { headers: await authedHeaders() });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
  return json;
}

export interface ResolveResult { school: School; joined: boolean; isNew: boolean; }

/** Teacher enters their school name → find the existing school or auto-create it UNOFFICIAL. */
export async function resolveOrCreateSchool(name: string, orgType?: School['orgType']): Promise<ResolveResult> {
  return post('/resolve', { name, orgType });
}

/** Colleagues awaiting confirmation at a school (caller must be a confirmed teacher there). */
export async function listPendingTeachers(schoolId: string): Promise<Array<{ id: string; uid: string; joinedAt: number; emailDomain?: string }>> {
  const { pending } = await get(`/pending?schoolId=${encodeURIComponent(schoolId)}`);
  return pending ?? [];
}

/** Confirm that a pending colleague really works at this school. */
export async function confirmTeacher(schoolId: string, uid: string): Promise<void> {
  await post('/confirm', { schoolId, uid });
}

export interface ClaimResult { claimed: boolean; autoApproved: boolean; claimId: string; school?: School; message?: string; }

/** Request to make the school OFFICIAL (auto-approves for a matching institutional email). */
export async function requestClaim(schoolId: string): Promise<ClaimResult> {
  return post('/request-claim', { schoolId });
}

/** Platform admin / district pre-provisions an official school. */
export async function provisionSchool(input: { name: string; orgType?: School['orgType']; domain?: string; adminUid?: string; districtId?: string }): Promise<{ school: School }> {
  return post('/provision', input);
}

/** Schools the signed-in user belongs to, with their membership status/role. */
export async function getMySchools(): Promise<Array<School & { myStatus: SchoolMembership['status']; myRole: SchoolMembership['role'] }>> {
  const { schools } = await get('/mine');
  return schools ?? [];
}

/** Public school info by id. */
export async function getSchool(id: string): Promise<Partial<School> | null> {
  try { const { school } = await get(`/${encodeURIComponent(id)}`); return school ?? null; }
  catch { return null; }
}
