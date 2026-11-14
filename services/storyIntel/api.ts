// Client for /api/story-intel (routes/storyIntelSources.ts): everything Story Intelligence has read for
// this account (videos, films, albums), filing it into Worlds, and the auto-file rules.

import { auth } from '../firebase';
import type { WorldFiling } from '../reello/intel/types';
import type { FindingEdits, StoryIntelRules } from './findings';
import type { IntelSourceView, SourceKind } from './sources';

const base = () => ((import.meta as any).env?.VITE_APP_URL ?? window.location.origin) + '/api/story-intel';

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const u = auth.currentUser;
  if (!u) throw new Error('Sign in first.');
  const token = await u.getIdToken();
  const res = await fetch(base() + path, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || `Request failed (${res.status})`);
  return data as T;
}

export type WorldMatch = { id: string; by: 'source' | 'name'; name: string };
export type FileResult = { key: string; ok: boolean; entryId?: string; merged?: boolean; error?: string };
const at = (kind: SourceKind, id: string) => `/${kind}/${encodeURIComponent(id)}`;

export const listSources = () => call<{ sources: IntelSourceView[] }>('/sources').then(r => r.sources);
export const sourceMatches = (kind: SourceKind, id: string, worldId: string) =>
  call<{ matches: Record<string, WorldMatch> }>(`${at(kind, id)}/world?worldId=${encodeURIComponent(worldId)}`).then(r => r.matches);
export const fileFromSource = (kind: SourceKind, id: string, worldId: string, items: Array<{ key: string; edits?: FindingEdits }>) =>
  call<{ results: FileResult[]; worldFiling: Record<string, WorldFiling> }>(`${at(kind, id)}/file`, { method: 'POST', body: JSON.stringify({ worldId, items }) });
export const skipInSource = (kind: SourceKind, id: string, keys: string[], undo = false) =>
  call<{ worldFiling: Record<string, WorldFiling> }>(`${at(kind, id)}/skip`, { method: 'POST', body: JSON.stringify({ keys, undo }) }).then(r => r.worldFiling);
export const getRules = () => call<{ rules: StoryIntelRules }>('/rules').then(r => r.rules);
export const saveRules = (rules: StoryIntelRules) => call<{ rules: StoryIntelRules; applied: number }>('/rules', { method: 'PUT', body: JSON.stringify(rules) });

/** Ask for a fresh reading. What's already in a World stays (filing records survive a re-run). */
export async function readAgain(kind: SourceKind, id: string, videoOptions?: unknown) {
  const u = auth.currentUser;
  if (!u) throw new Error('Sign in first.');
  const origin = (import.meta as any).env?.VITE_APP_URL ?? window.location.origin;
  const [path, body] = kind === 'video'
    ? ['/api/reello/intel/analyze', { videoId: id, force: true, ...(videoOptions ? { options: videoOptions } : {}) }]
    : kind === 'film' ? ['/api/taleo/analyze', { albumId: id, force: true }] : ['/api/music-intel/analyze', { albumId: id, force: true }];
  const res = await fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await u.getIdToken()}` }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || `Request failed (${res.status})`);
  return data;
}
