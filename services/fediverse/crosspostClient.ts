// Client for POST /api/fediverse/crosspost-native — shares an already-published Plajah post to the author's fediverse
// accounts. The server re-reads the stored post and plans the Bluesky version itself, so what goes out is exactly what
// the composer previewed (same planner, services/fediverse/blueskyVersion.ts).

import { auth } from '../firebase';

export interface CrosspostOutcome {
  accountId: string; protocol: string; handle: string; ok: boolean; url?: string; error?: string;
}
export interface CrosspostResponse { blocked?: string; results: CrosspostOutcome[] }

export async function crosspostNative(postId: string, opts: { accountIds: string[]; override?: string }): Promise<CrosspostResponse> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in first.');
  const res = await fetch('/api/fediverse/crosspost-native', {
    method: 'POST',
    headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ postId, accountIds: opts.accountIds, ...(opts.override ? { override: opts.override } : {}) }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Could not share (${res.status})`);
  return json as CrosspostResponse;
}
