// ─── Meta Threads Adapter ──────────────────────────────────────────────────────
// Threads API (graph.threads.net) — a subset of the Meta Graph API.
// Auth: OAuth 2.0 via Meta App Review. The OAuth flow happens externally;
// this adapter receives the resulting long-lived access token.
//
// Current Threads API capability matrix (as of 2025):
//   ✅ Read own profile
//   ✅ Read own posts / replies
//   ✅ Publish text posts (two-step: create container → publish)
//   ✅ Reply to posts
//   ❌ Follow / unfollow (not in public API)
//   ❌ Like / unlike
//   ❌ Home timeline (others' posts)
//   ❌ Notifications
//
// Unsupported operations throw FediverseError with code 'UNSUPPORTED'
// so callers can degrade gracefully per-feature.

import type {
  FediverseAdapter, FediverseCredentials, FediversePost, FediverseProfile,
  FediverseNotification, CreatePostOptions,
} from './types';
import { FediverseError } from './types';

const BASE = 'https://graph.threads.net/v1.0';

// ─── HTTP helper ─────────────────────────────────────────────────────────────

async function tFetch(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<unknown> {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${BASE}${path}${sep}access_token=${encodeURIComponent(token)}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (res.status === 401) throw new FediverseError('threads', 'AUTH_EXPIRED', 'Token expired or revoked');
  if (res.status === 429) throw new FediverseError('threads', 'RATE_LIMITED', 'Rate limited', 60);
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    const msg = (body.error as Record<string, unknown> | undefined)?.message ?? res.statusText;
    throw new FediverseError('threads', 'API_ERROR', String(msg));
  }
  if (res.status === 204) return null;
  return res.json();
}

// ─── Exchange short-lived token for long-lived (60 days) ─────────────────────
// Call this once right after the user authorises via OAuth.

export async function threadsExchangeToken(
  shortLivedToken: string,
  appId: string,
  appSecret: string,
): Promise<FediverseCredentials> {
  const url = `https://graph.threads.net/access_token`
    + `?grant_type=th_exchange_token`
    + `&client_id=${appId}`
    + `&client_secret=${appSecret}`
    + `&access_token=${encodeURIComponent(shortLivedToken)}`;
  const res = await fetch(url);
  if (!res.ok) throw new FediverseError('threads', 'AUTH_EXPIRED', 'Token exchange failed');
  const data = await res.json() as { access_token: string; token_type: string; expires_in: number };
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

export async function threadsRefreshToken(longLivedToken: string): Promise<FediverseCredentials> {
  const url = `https://graph.threads.net/refresh_access_token`
    + `?grant_type=th_refresh_token`
    + `&access_token=${encodeURIComponent(longLivedToken)}`;
  const res = await fetch(url);
  if (!res.ok) throw new FediverseError('threads', 'AUTH_EXPIRED', 'Token refresh failed');
  const data = await res.json() as { access_token: string; expires_in: number };
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

const THREAD_FIELDS = 'id,text,timestamp,permalink,username,like_count,replies_count,media_type,media_url,thumbnail_url,is_reply,reply_audience';
const PROFILE_FIELDS = 'id,username,name,biography,profile_picture_url,threads_profile_picture_url,followers_count,following_count,threads_biography';

function mapThread(t: Record<string, unknown>, accountId: string): FediversePost {
  const text = String(t.text ?? '');
  return {
    id: String(t.id),
    uri: String(t.permalink ?? `https://www.threads.net/t/${t.id}`),
    protocol: 'threads',
    accountId,
    authorHandle: `@${t.username ?? ''}`,
    authorDisplayName: String(t.name ?? t.username ?? ''),
    content: text,
    contentText: text,
    createdAt: t.timestamp ? new Date(String(t.timestamp)).getTime() : Date.now(),
    url: String(t.permalink ?? `https://www.threads.net/t/${t.id}`),
    replyCount: Number(t.replies_count ?? 0),
    repostCount: 0,
    likeCount: Number(t.like_count ?? 0),
    isLiked: false,
    isReposted: false,
    isBookmarked: false,
    media: (() => {
      if (!t.media_url) return [];
      const type = String(t.media_type ?? 'IMAGE').toLowerCase();
      return [{
        type: type === 'video' ? 'video' : 'image' as const,
        url: String(t.media_url),
        previewUrl: t.thumbnail_url ? String(t.thumbnail_url) : undefined,
      }];
    })(),
  };
}

function mapProfile(p: Record<string, unknown>): FediverseProfile {
  const username = String(p.username ?? '');
  return {
    id: String(p.id),
    protocol: 'threads',
    handle: `@${username}`,
    displayName: String(p.name || username),
    bio: String(p.biography ?? p.threads_biography ?? ''),
    avatarUrl: String(p.threads_profile_picture_url ?? p.profile_picture_url ?? ''),
    followersCount: Number(p.followers_count ?? 0),
    followingCount: Number(p.following_count ?? 0),
    postsCount: 0,
    url: `https://www.threads.net/@${username}`,
  };
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export const threadsAdapter: FediverseAdapter = {
  protocol: 'threads',

  async verifyCredentials(creds) {
    const data = await tFetch(
      `/me?fields=${PROFILE_FIELDS}`, creds.accessToken
    ) as Record<string, unknown>;
    return mapProfile(data);
  },

  async getHomeTimeline() {
    // Threads API does not expose a home/following timeline.
    throw new FediverseError('threads', 'UNSUPPORTED', 'Threads does not provide a home timeline via the public API');
  },

  async getPublicTimeline(creds) {
    // Fall back to own posts as "timeline" — Threads has no public discover endpoint
    const data = await tFetch(
      `/me/threads?fields=${THREAD_FIELDS}&limit=40`, creds.accessToken
    ) as { data: Record<string, unknown>[] };
    const posts = (data.data ?? []).map(t => mapThread(t, creds.did ?? 'local'));
    return { posts };
  },

  async createPost(creds, content, options?: CreatePostOptions) {
    // Step 1 — create media container
    const params = new URLSearchParams({
      media_type: 'TEXT',
      text: content,
      access_token: creds.accessToken,
    });
    if (options?.inReplyToId) params.set('reply_to_id', options.inReplyToId);

    const container = await fetch(`${BASE}/me/threads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    }).then(r => r.json()) as { id: string };

    // Brief wait for container to process
    await new Promise(r => setTimeout(r, 1500));

    // Step 2 — publish
    const publishParams = new URLSearchParams({
      creation_id: container.id,
      access_token: creds.accessToken,
    });
    const published = await fetch(`${BASE}/me/threads_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: publishParams.toString(),
    }).then(r => r.json()) as { id: string };

    return {
      id: published.id,
      uri: `https://www.threads.net/t/${published.id}`,
      protocol: 'threads',
      accountId: creds.did ?? 'local',
      authorHandle: '',
      authorDisplayName: '',
      content,
      contentText: content,
      createdAt: Date.now(),
      url: `https://www.threads.net/t/${published.id}`,
      replyCount: 0, repostCount: 0, likeCount: 0,
      isLiked: false, isReposted: false, isBookmarked: false,
      media: [],
    };
  },

  async deletePost() {
    throw new FediverseError('threads', 'UNSUPPORTED', 'Threads does not support post deletion via the public API');
  },

  async likePost() {
    throw new FediverseError('threads', 'UNSUPPORTED', 'Threads does not support liking posts via the public API');
  },

  async unlikePost() {
    throw new FediverseError('threads', 'UNSUPPORTED', 'Threads does not support unliking posts via the public API');
  },

  async repost() {
    throw new FediverseError('threads', 'UNSUPPORTED', 'Threads does not support reposting via the public API');
  },

  async unrepost() {
    throw new FediverseError('threads', 'UNSUPPORTED', 'Threads does not support unreposting via the public API');
  },

  async followProfile() {
    throw new FediverseError('threads', 'UNSUPPORTED', 'Threads does not expose a follow API');
  },

  async unfollowProfile() {
    throw new FediverseError('threads', 'UNSUPPORTED', 'Threads does not expose an unfollow API');
  },

  async getNotifications() {
    throw new FediverseError('threads', 'UNSUPPORTED', 'Threads does not provide a notifications API');
  },

  async lookupProfile(creds, handleOrId) {
    // Threads only allows looking up the authed user's own profile
    const data = await tFetch(
      `/${handleOrId}?fields=${PROFILE_FIELDS}`, creds.accessToken
    ) as Record<string, unknown>;
    return mapProfile(data);
  },
};
