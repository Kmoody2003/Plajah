// Org media (client) — publish media as an organization to PUBLIC / ORG / DEPARTMENT / CLASS audiences and
// list / play what this person may see. Rules live in services/orgPublish/audienceCore.ts; the server
// (routes/orgMedia.ts) checks them on every list and play, and internal items play with signed Mux tokens.
import { auth } from './firebase';
import type { OrgMediaApp, OrgMediaAudience } from './orgPublish/audienceCore';

export type { OrgMediaApp, OrgMediaAudience } from './orgPublish/audienceCore';

export interface OrgMediaItem {
  id: string; orgId: string; audience: OrgMediaAudience; departmentId?: string; classId?: string;
  app: OrgMediaApp; kind: 'video' | 'audio' | 'document'; title: string; playlist?: string; ownerUid: string;
  status: 'UPLOADING' | 'PROCESSING' | 'READY' | 'ERRORED'; playbackPolicy: 'public' | 'signed';
  durationSec?: number; source?: 'class-live' | 'upload'; createdAt: number; muxPlaybackId?: string;
}
export interface OrgMediaPlaylist { name: string; items: OrgMediaItem[] }

async function headers(json = false): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken?.();
  return { ...(json ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}
async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/org-media${path}`, { method, headers: await headers(!!body), body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e: any = new Error(data.error || 'Request failed'); e.code = data.code; e.status = res.status; throw e; }
  return data as T;
}

export interface PublishOrgMedia {
  orgId: string; audience: OrgMediaAudience; departmentId?: string; classId?: string;
  app?: OrgMediaApp; title: string; playlist?: string; source?: 'class-live' | 'upload';
}

/** Upload a file/blob as the org and wait until it's playable (or until `waitMs` passes; it keeps processing server-side). */
export async function publishOrgMedia(file: Blob, meta: PublishOrgMedia, onProgress?: (pct: number) => void, waitMs = 10 * 60_000): Promise<{ id: string; status: string }> {
  const { id, url } = await call<{ id: string; url: string }>('POST', '/uploads', meta);
  const UpChunk = await import('@mux/upchunk');
  const named = file instanceof File ? file : new File([file], `${meta.title.replace(/[^\w.-]+/g, '_').slice(0, 60) || 'recording'}.webm`, { type: file.type || 'video/webm' });
  await new Promise<void>((resolve, reject) => {
    const up = UpChunk.createUpload({ endpoint: url, file: named, chunkSize: 30720, attempts: 6, delayBeforeAttempt: 1 });
    up.on('progress', (e: any) => onProgress?.(Math.round(e.detail)));
    up.on('success', () => resolve());
    up.on('error', (e: any) => reject(new Error(e?.detail?.message || 'Upload failed')));
  });
  onProgress?.(100);
  // Mux transcodes in the background; ask until it has a playback id.
  const until = Date.now() + waitMs;
  let status = 'PROCESSING';
  while (Date.now() < until) {
    status = (await call<{ status: string }>('POST', `/${id}/finalize`).catch(() => ({ status }))).status;
    if (status === 'READY' || status === 'ERRORED') break;
    await new Promise(r => setTimeout(r, 4000));
  }
  return { id, status };
}

/** Ask the server to re-check an item that was still processing (owner only). */
export const finalizeOrgMedia = (id: string) => call<{ status: string }>('POST', `/${id}/finalize`);

export async function listOrgMedia(q: { orgId: string; departmentId?: string; classId?: string; app?: OrgMediaApp }): Promise<{ playlists: OrgMediaPlaylist[]; signedPlayback: boolean }> {
  const p = new URLSearchParams({ orgId: q.orgId, ...(q.departmentId ? { departmentId: q.departmentId } : {}), ...(q.classId ? { classId: q.classId } : {}), ...(q.app ? { app: q.app } : {}) });
  return call('GET', `/list?${p}`);
}

export interface OrgMediaPlayback { playbackId: string; token?: string; thumbToken?: string }
export const playOrgMedia = (id: string) => call<OrgMediaPlayback>('GET', `/${id}/play`);
export const deleteOrgMedia = (id: string) => call<{ ok: true }>('DELETE', `/${id}`);

/** HLS + poster URLs for a playback (token appended for signed items). */
export function playbackUrls(p: OrgMediaPlayback) {
  return {
    hls: `https://stream.mux.com/${p.playbackId}.m3u8${p.token ? `?token=${p.token}` : ''}`,
    poster: `https://image.mux.com/${p.playbackId}/thumbnail.jpg${p.thumbToken ? `?token=${p.thumbToken}` : ''}`,
  };
}

export const AUDIENCE_LABEL: Record<OrgMediaAudience, string> = {
  PUBLIC: 'Public', ORG: 'Members only', DEPARTMENT: 'Department only', CLASS: 'Class only',
};
