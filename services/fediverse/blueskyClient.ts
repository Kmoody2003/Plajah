// Browser client for /api/fediverse/bluesky/c/* — the server acts as the user's connected Bluesky account.
// Types are imported type-only so none of the AT Protocol SDK reaches the browser bundle.

import { auth } from '../firebase';
import type { FediversePost, FediverseProfile } from './types';
import type { BskyProfileDetail, BskyThread, BskyFeedInfo, AuthorFeedFilter } from './bluesky';

export type { BskyProfileDetail, BskyThread, BskyThreadNode, BskyFeedInfo, AuthorFeedFilter } from './bluesky';

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in first.');
  const res = await fetch(`/api/fediverse/bluesky/c${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json?.error || `Request failed (${res.status})`), { code: json?.code as string | undefined });
  return json as T;
}
const qs = (o: Record<string, string | undefined>) => Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join('&');
const post = (path: string, body: object) => call<any>(path, { method: 'POST', body: JSON.stringify(body) });

export const bskyProfile = (actor: string) => call<BskyProfileDetail>(`/profile?${qs({ actor })}`);
export const bskyAuthorFeed = (actor: string, filter?: AuthorFeedFilter, cursor?: string) => call<{ posts: FediversePost[]; cursor?: string }>(`/author-feed?${qs({ actor, filter, cursor })}`);
export const bskyThread = (uri: string) => call<BskyThread>(`/thread?${qs({ uri })}`);
export const bskySearchPostsApi = (q: string, sort?: 'top' | 'latest', cursor?: string) => call<{ posts: FediversePost[]; cursor?: string }>(`/search/posts?${qs({ q, sort, cursor })}`);
export const bskySearchPeople = (q: string, cursor?: string) => call<{ profiles: FediverseProfile[]; cursor?: string }>(`/search/actors?${qs({ q, cursor })}`);
export const bskyFollowers = (actor: string, cursor?: string) => call<{ profiles: FediverseProfile[]; cursor?: string }>(`/followers?${qs({ actor, cursor })}`);
export const bskyFollowing = (actor: string, cursor?: string) => call<{ profiles: FediverseProfile[]; cursor?: string }>(`/follows?${qs({ actor, cursor })}`);
export const bskySuggestions = () => call<{ profiles: FediverseProfile[] }>('/suggestions');
export const bskySavedFeeds = () => call<{ feeds: BskyFeedInfo[] }>('/feeds');
export const bskyFeed = (uri: string, cursor?: string) => call<{ posts: FediversePost[]; cursor?: string }>(`/feed?${qs({ uri, cursor })}`);
export const bskyFollow = (did: string) => post('/follow', { did }) as Promise<{ isFollowing: boolean; followRecordUri?: string }>;
export const bskyUnfollow = (followRecordUri: string) => post('/unfollow', { followRecordUri }) as Promise<{ ok: true }>;
export const bskyMute = (actor: string, muted: boolean) => post('/mute', { actor, muted }) as Promise<{ ok: true }>;
export const bskyBlock = (did: string, blocked: boolean, blockUri?: string) => post('/block', { did, blocked, blockUri }) as Promise<{ blockUri?: string }>;
export const bskyQuote = (text: string, uri: string, cid: string) => post('/quote', { text, uri, cid }) as Promise<{ post: FediversePost }>;
