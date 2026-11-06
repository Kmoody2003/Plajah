// Client for /api/reello/org-channels (routes/reelloOrgChannels.ts): department channels on Reello.
// Posting a video or stream for a department is checked on the server against the poster's department
// access; the public listings only show departments that have posted something.

import { auth } from '../firebase';

const base = () => ((import.meta as any).env?.VITE_APP_URL ?? window.location.origin) + '/api/reello/org-channels';

async function call<T>(path: string, init: RequestInit = {}, needAuth = true): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const u = auth.currentUser;
  if (needAuth) {
    if (!u) throw new Error('Sign in first.');
    headers.Authorization = `Bearer ${await u.getIdToken()}`;
  }
  const res = await fetch(base() + path, { ...init, headers: { ...headers, ...(init.headers as any || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || `Request failed (${res.status})`);
  return data as T;
}

export interface PostableOrg { orgId: string; orgName: string; logoUrl: string; departments: { id: string; name: string; iconEmoji: string | null }[] }
export interface DeptTarget { orgId: string; departmentId: string; orgName?: string; departmentName?: string }
export interface OrgSummary { id: string; name: string; handle: string | null; logoUrl: string; accountUid: string | null }
export interface DeptChannelCard {
  departmentId: string; name: string; iconEmoji: string | null; description: string;
  videoCount: number; moreVideos?: boolean; live: boolean; thumbnailUrl: string; lastActivityAt: number;
}
export interface DeptVideo {
  id: string; title: string; ownerId: string; artist: string; thumbnailUrl: string; muxPlaybackId?: string;
  url: string; duration: number; playsCount: number; timestamp: number; isRello: boolean;
}
export interface DeptLive { id: string; title: string; ownerId: string; ownerName: string; ownerPhoto: string; streamId?: string; muxStreamId?: string; url: string; status?: string }
export interface DeptChannel { org: OrgSummary; department: { id: string; name: string; iconEmoji: string | null; description: string }; videos: DeptVideo[]; liveNow: DeptLive[] }

let mineCache: { uid: string; at: number; orgs: PostableOrg[] } | null = null;

/** Orgs and departments the signed-in person may post for (empty when none, or signed out). */
export async function postableDepartments(): Promise<PostableOrg[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  if (mineCache && mineCache.uid === uid && Date.now() - mineCache.at < 5 * 60_000) return mineCache.orgs;
  try {
    const res = await call<{ orgs?: PostableOrg[] }>('/mine');
    const orgs = Array.isArray(res?.orgs) ? res.orgs : [];
    mineCache = { uid, at: Date.now(), orgs };
    return orgs;
  } catch { return []; }
}

export const attachToDepartment = (kind: 'video' | 'live', id: string, t: DeptTarget) =>
  call<{ ok: true }>('/attach', { method: 'POST', body: JSON.stringify({ kind, id, orgId: t.orgId, departmentId: t.departmentId }) });
export const detachFromDepartment = (kind: 'video' | 'live', id: string, t: DeptTarget) =>
  call<{ ok: true }>('/detach', { method: 'POST', body: JSON.stringify({ kind, id, orgId: t.orgId, departmentId: t.departmentId }) });

export const fetchOrgDeptChannels = (orgId: string) =>
  call<{ org: OrgSummary; channels: DeptChannelCard[] }>(`/org?orgId=${encodeURIComponent(orgId)}`, {}, false).catch(() => ({ org: null as any, channels: [] as DeptChannelCard[] }));
export const fetchDeptChannelsForAccount = (uid: string) =>
  call<{ org: OrgSummary | null; channels: DeptChannelCard[] }>(`/by-account?uid=${encodeURIComponent(uid)}`, {}, false).catch(() => ({ org: null, channels: [] as DeptChannelCard[] }));
export const fetchDeptChannel = (orgId: string, departmentId: string) =>
  call<DeptChannel>(`/channel?orgId=${encodeURIComponent(orgId)}&departmentId=${encodeURIComponent(departmentId)}`, {}, false);

/** Open a department channel page from anywhere (ReelloUploadDock hosts it). */
export const OPEN_DEPT_CHANNEL_EVENT = 'reello:open-dept-channel';
export function openDeptChannel(orgId: string, departmentId: string) {
  window.dispatchEvent(new CustomEvent(OPEN_DEPT_CHANNEL_EVENT, { detail: { orgId, departmentId } }));
}
