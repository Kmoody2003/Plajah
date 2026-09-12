// adminMediaHealth — client for the Admin Media Health tool (server routes in server.ts).
//
// Two audiences share this module:
//  • Admins/support: scan a creator or album for broken files, ffprobe a master for the truth,
//    and PROPOSE replacing a bad file (never applied until the creator approves).
//  • Creators: list the repair requests waiting on them and approve/deny.
//
// Every call is authed with the caller's Firebase ID token; the server re-checks admin status
// (against the `admins` collection) and ownership on its side — nothing here is trusted.

import { auth, storage } from './firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

export interface MediaHealthRow {
  albumId: string; albumTitle: string; ownerId: string; albumType: string;
  trackId: string; trackTitle: string; artist: string;
  url: string; size: number | null; contentType: string | null; estSeconds: number | null;
  streamStatus: string; durationSec: number | null;
  hls: boolean; low: boolean; flac: boolean; loudnessLufs: number | null;
  flags: string[];
}
export interface MediaHealthReport { ok: boolean; albums: number; tracks: number; rows: MediaHealthRow[]; albumFlags: { albumId: string; albumTitle: string; ownerId: string; flags: string[] }[]; }
export interface ProbeResult { ok: boolean; durationSec: number; bitRate: number | null; formatName: string; codec: string; sampleRate: number | null; channels: number | null; sizeBytes: number | null; }
export interface RepairRequest {
  id: string; albumId: string; trackId: string; ownerId: string; albumTitle: string; trackTitle: string;
  adminUid: string; oldUrl: string; newUrl: string; note: string; status: 'pending' | 'approved' | 'denied' | 'failed';
  createdAt: number; resolvedAt?: number; error?: string;
}

async function authed(path: string, init: RequestInit = {}): Promise<any> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('not signed in');
  const res = await fetch(path, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
  return json;
}

/** Scan an album (or a whole creator's catalogue) for file/encode problems. */
export function scanMediaHealth(scope: { albumId?: string; ownerId?: string; trackId?: string }): Promise<MediaHealthReport> {
  const q = new URLSearchParams();
  if (scope.albumId) q.set('albumId', scope.albumId);
  if (scope.ownerId) q.set('ownerId', scope.ownerId);
  if (scope.trackId) q.set('trackId', scope.trackId);
  return authed(`/api/admin/media-health?${q.toString()}`);
}

/** Exact ffprobe of a master (downloads it server-side) — the ground truth for duration/format. */
export function probeMaster(url: string): Promise<ProbeResult> {
  return authed('/api/admin/media-health/probe', { method: 'POST', body: JSON.stringify({ url }) });
}

/** Upload a replacement master to Plajah storage and return its download URL. */
export async function uploadReplacementFile(file: File, onProgress?: (pct: number) => void): Promise<string> {
  const safe = file.name.replace(/[^\w.\-]+/g, '_');
  const objectRef = ref(storage, `uploads/musics/${Date.now()}_${safe}`);
  const task = uploadBytesResumable(objectRef, file, { contentType: file.type || 'audio/mpeg' });
  await new Promise<void>((resolve, reject) => {
    task.on('state_changed',
      s => onProgress?.(Math.round((s.bytesTransferred / s.totalBytes) * 100)),
      reject, () => resolve());
  });
  return getDownloadURL(objectRef);
}

/** Propose replacing a track's file. Creates a pending request + notifies the creator. */
export function requestRepair(input: { albumId: string; trackId: string; newUrl: string; note?: string }): Promise<{ ok: boolean; requestId: string; ownerId: string }> {
  return authed('/api/admin/media-repair/request', { method: 'POST', body: JSON.stringify(input) });
}

/** Admin: list all repair requests (any status). */
export function listRepairRequests(): Promise<{ ok: boolean; requests: RepairRequest[] }> {
  return authed('/api/admin/media-repair/list');
}

/** Creator: list repair requests awaiting my approval. */
export function myRepairRequests(): Promise<{ ok: boolean; requests: RepairRequest[] }> {
  return authed('/api/media-repair/mine');
}

/** Creator: approve or deny a repair request. Approve applies the swap + re-transcodes. */
export function respondRepair(requestId: string, approve: boolean): Promise<{ ok: boolean; applied?: boolean; already?: string }> {
  return authed('/api/media-repair/respond', { method: 'POST', body: JSON.stringify({ requestId, approve }) });
}
