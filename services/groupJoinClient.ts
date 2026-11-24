// groupJoinClient — the browser side of routes/elevateGroups.ts (ask to join a ministry / department / sub-group).
import { auth } from './backendService';

export interface GroupJoinRequestView { uid: string; displayName?: string; photoUrl?: string; at: number }

async function call(path: string, method: 'GET' | 'POST', body?: unknown): Promise<any> {
  const u = auth.currentUser;
  if (!u) throw new Error('Sign in first.');
  const token = await u.getIdToken();
  const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) { const e: any = new Error(out?.error || `HTTP ${res.status}`); e.needsOrg = !!out?.needsOrg; throw e; }
  return out;
}

const BASE = '/api/elevate/groups';
export const requestToJoinGroup = (orgId: string, ministryId: string): Promise<{ status: 'pending' | 'member' }> => call(`${BASE}/request`, 'POST', { orgId, ministryId });
export const cancelGroupRequest = (orgId: string, ministryId: string) => call(`${BASE}/cancel`, 'POST', { orgId, ministryId });
export const leaveGroup = (orgId: string, ministryId: string) => call(`${BASE}/leave`, 'POST', { orgId, ministryId });
export const myPendingGroupRequests = async (orgId: string): Promise<string[]> => (await call(`${BASE}/mine?orgId=${encodeURIComponent(orgId)}`, 'GET')).pending || [];
export const pendingGroupRequests = async (orgId: string, ministryId: string): Promise<GroupJoinRequestView[]> =>
  (await call(`${BASE}/pending?orgId=${encodeURIComponent(orgId)}&ministryId=${encodeURIComponent(ministryId)}`, 'GET')).requests || [];
export const decideGroupRequest = (orgId: string, ministryId: string, uid: string, approve: boolean) => call(`${BASE}/decide`, 'POST', { orgId, ministryId, uid, approve });
