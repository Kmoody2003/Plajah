// Client for /api/reello/* (routes/reelloIntel.ts): upload templates + defaults, Story Intelligence
// jobs and their drafts. Every call needs the signed-in account; errors come back as thrown Errors
// with the server's message so the UI can show it as written.

import { auth } from '../firebase';
import { DEFAULT_PREFS, type ReelloUploadPrefs } from './uploadPrefs';
import type { ArticleDraft, DraftState, IntelOptions, ReelloIntelJob } from './intel/types';

const base = () => ((import.meta as any).env?.VITE_APP_URL ?? window.location.origin) + '/api/reello';

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const u = auth.currentUser;
  if (!u) throw new Error('Sign in first.');
  const token = await u.getIdToken();
  const res = await fetch(base() + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || `Request failed (${res.status})`);
  return data as T;
}

export async function loadPrefs(): Promise<ReelloUploadPrefs> {
  try { return await call<ReelloUploadPrefs>('/prefs'); } catch { return DEFAULT_PREFS; }
}
export const savePrefs = (p: ReelloUploadPrefs) => call<ReelloUploadPrefs>('/prefs', { method: 'PUT', body: JSON.stringify(p) });

export const requestIntel = (videoId: string, options: IntelOptions, force = false) =>
  call<{ status: string }>('/intel/analyze', { method: 'POST', body: JSON.stringify({ videoId, options, ...(force ? { force: true } : {}) }) });
export const continueIntel = (videoId: string) => call<{ status: string }>('/intel/continue', { method: 'POST', body: JSON.stringify({ videoId }) });
export const listIntel = () => call<{ jobs: ReelloIntelJob[] }>('/intel').then(r => r.jobs);
export const getIntel = (videoId: string) => call<{ job: ReelloIntelJob }>(`/intel/${encodeURIComponent(videoId)}`).then(r => r.job);
export const postIntelDraft = (videoId: string, key: string, edits?: unknown) =>
  call<{ draft: DraftState; article?: ArticleDraft }>(`/intel/${encodeURIComponent(videoId)}/post`, { method: 'POST', body: JSON.stringify({ key, ...(edits ? { edits } : {}) }) });
export const discardIntelDraft = (videoId: string, key: string) =>
  call<{ draft: DraftState }>(`/intel/${encodeURIComponent(videoId)}/discard`, { method: 'POST', body: JSON.stringify({ key }) }).then(r => r.draft);
