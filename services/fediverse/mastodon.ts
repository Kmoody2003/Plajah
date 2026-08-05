// ─── Mastodon / ActivityPub Adapter ────────────────────────────────────────
// Mastodon REST API v1. Works with any ActivityPub-compatible instance
// (Mastodon, Akkoma, Pleroma, Misskey-compat, Pixelfed, etc.)
// Auth: user generates a personal access token in their instance settings
// → Preferences → Development → New Application (scopes: read write follow)

import type {
  FediverseAdapter, FediverseCredentials, FediversePost, FediverseProfile,
  FediverseNotification, FediverseMedia, FediverseNotifType, CreatePostOptions,
} from './types';
import { FediverseError } from './types';

// ─── HTTP helper ─────────────────────────────────────────────────────────────

async function mFetch(
  instanceUrl: string,
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<unknown> {
  const base = instanceUrl.replace(/\/$/, '');
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  if (res.status === 401) throw new FediverseError('mastodon', 'AUTH_EXPIRED', 'Token expired or revoked');
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('x-ratelimit-reset') ?? 60);
    throw new FediverseError('mastodon', 'RATE_LIMITED', 'Rate limited', retryAfter);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new FediverseError('mastodon', 'API_ERROR', String(body.error ?? res.statusText));
  }
  if (res.status === 200) return res.json();
  return null;
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

function mapMedia(m: Record<string, unknown>): FediverseMedia {
  const meta = (m.meta as Record<string, unknown> | undefined);
  const orig = (meta?.original as Record<string, unknown> | undefined);
  return {
    type: (m.type as FediverseMedia['type']) ?? 'image',
    url: String(m.url ?? m.remote_url ?? ''),
    previewUrl: m.preview_url ? String(m.preview_url) : undefined,
    altText: m.description ? String(m.description) : undefined,
    width: orig?.width ? Number(orig.width) : undefined,
    height: orig?.height ? Number(orig.height) : undefined,
  };
}

function mapStatus(status: Record<string, unknown>, accountId: string): FediversePost {
  const account = status.account as Record<string, unknown>;
  const media = (status.media_attachments as Record<string, unknown>[] | undefined) ?? [];
  const html = String(status.content ?? '');
  return {
    id: String(status.id),
    uri: String(status.uri ?? status.url ?? ''),
    protocol: 'mastodon',
    accountId,
    authorHandle: `@${account.acct}`,
    authorDisplayName: String(account.display_name || account.username),
    authorAvatarUrl: account.avatar ? String(account.avatar) : undefined,
    content: html,
    contentText: html.replace(/<[^>]+>/g, '').trim(),
    createdAt: new Date(String(status.created_at)).getTime(),
    url: String(status.url ?? status.uri ?? ''),
    replyCount: Number(status.replies_count ?? 0),
    repostCount: Number(status.reblogs_count ?? 0),
    likeCount: Number(status.favourites_count ?? 0),
    isLiked: Boolean(status.favourited),
    isReposted: Boolean(status.reblogged),
    isBookmarked: Boolean(status.bookmarked),
    media: media.map(mapMedia),
    inReplyToId: status.in_reply_to_id ? String(status.in_reply_to_id) : undefined,
    sensitive: Boolean(status.sensitive),
    spoilerText: status.spoiler_text ? String(status.spoiler_text) : undefined,
    visibility: (status.visibility as FediversePost['visibility']) ?? 'public',
  };
}

function mapAccount(a: Record<string, unknown>): FediverseProfile {
  return {
    id: String(a.id),
    protocol: 'mastodon',
    handle: `@${a.acct}`,
    displayName: String(a.display_name || a.username),
    bio: a.note ? String(a.note).replace(/<[^>]+>/g, '').trim() : undefined,
    avatarUrl: a.avatar ? String(a.avatar) : undefined,
    headerUrl: a.header ? String(a.header) : undefined,
    followersCount: Number(a.followers_count ?? 0),
    followingCount: Number(a.following_count ?? 0),
    postsCount: Number(a.statuses_count ?? 0),
    isFollowing: a.following != null ? Boolean(a.following) : undefined,
    url: String(a.url ?? ''),
  };
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export const mastodonAdapter: FediverseAdapter = {
  protocol: 'mastodon',

  async verifyCredentials(creds) {
    const data = await mFetch(
      creds.instanceUrl!, '/api/v1/accounts/verify_credentials', creds.accessToken
    ) as Record<string, unknown>;
    return mapAccount(data);
  },

  async getHomeTimeline(creds, cursor) {
    const qs = cursor ? `?max_id=${cursor}&limit=40` : '?limit=40';
    const data = await mFetch(
      creds.instanceUrl!, `/api/v1/timelines/home${qs}`, creds.accessToken
    ) as Record<string, unknown>[];
    const posts = data.map(s => mapStatus(s, creds.did ?? 'local'));
    return { posts, cursor: posts.at(-1)?.id };
  },

  async getPublicTimeline(creds, cursor) {
    const qs = cursor ? `?max_id=${cursor}&limit=40` : '?limit=40';
    const data = await mFetch(
      creds.instanceUrl!, `/api/v1/timelines/public${qs}`, creds.accessToken
    ) as Record<string, unknown>[];
    const posts = data.map(s => mapStatus(s, creds.did ?? 'local'));
    return { posts, cursor: posts.at(-1)?.id };
  },

  async createPost(creds, content, options) {
    const body: Record<string, unknown> = { status: content };
    if (options?.visibility)  body.visibility     = options.visibility;
    if (options?.inReplyToId) body.in_reply_to_id = options.inReplyToId;
    if (options?.sensitive)   body.sensitive       = true;
    if (options?.spoilerText) body.spoiler_text    = options.spoilerText;
    if (options?.langs)       body.language        = options.langs[0];
    const data = await mFetch(
      creds.instanceUrl!, '/api/v1/statuses', creds.accessToken,
      { method: 'POST', body: JSON.stringify(body) }
    ) as Record<string, unknown>;
    return mapStatus(data, creds.did ?? 'local');
  },

  async deletePost(creds, postId) {
    await mFetch(
      creds.instanceUrl!, `/api/v1/statuses/${postId}`, creds.accessToken,
      { method: 'DELETE' }
    );
  },

  async likePost(creds, post) {
    await mFetch(
      creds.instanceUrl!, `/api/v1/statuses/${post.id}/favourite`, creds.accessToken,
      { method: 'POST' }
    );
    return { isLiked: true, likeCount: post.likeCount + 1 };
  },

  async unlikePost(creds, post) {
    await mFetch(
      creds.instanceUrl!, `/api/v1/statuses/${post.id}/unfavourite`, creds.accessToken,
      { method: 'POST' }
    );
  },

  async repost(creds, post) {
    await mFetch(
      creds.instanceUrl!, `/api/v1/statuses/${post.id}/reblog`, creds.accessToken,
      { method: 'POST' }
    );
    return { isReposted: true, repostCount: post.repostCount + 1 };
  },

  async unrepost(creds, post) {
    await mFetch(
      creds.instanceUrl!, `/api/v1/statuses/${post.id}/unreblog`, creds.accessToken,
      { method: 'POST' }
    );
  },

  async followProfile(creds, profile) {
    await mFetch(
      creds.instanceUrl!, `/api/v1/accounts/${profile.id}/follow`, creds.accessToken,
      { method: 'POST' }
    );
    return { isFollowing: true };
  },

  async unfollowProfile(creds, profile) {
    await mFetch(
      creds.instanceUrl!, `/api/v1/accounts/${profile.id}/unfollow`, creds.accessToken,
      { method: 'POST' }
    );
  },

  async getNotifications(creds) {
    const data = await mFetch(
      creds.instanceUrl!, '/api/v1/notifications?limit=30', creds.accessToken
    ) as Record<string, unknown>[];

    const typeMap: Record<string, FediverseNotifType> = {
      mention: 'mention', reblog: 'repost', favourite: 'like',
      follow: 'follow', poll: 'mention', status: 'reply',
    };

    return data.map(n => ({
      id: String(n.id),
      protocol: 'mastodon' as const,
      type: typeMap[String(n.type)] ?? 'mention',
      createdAt: new Date(String(n.created_at)).getTime(),
      isRead: false,
      actor: n.account
        ? mapAccount(n.account as Record<string, unknown>)
        : undefined,
      post: n.status
        ? mapStatus(n.status as Record<string, unknown>, creds.did ?? 'local')
        : undefined,
    })) satisfies FediverseNotification[];
  },

  async lookupProfile(creds, handleOrId) {
    // try by account ID first; fall back to search
    try {
      const data = await mFetch(
        creds.instanceUrl!, `/api/v1/accounts/${handleOrId}`, creds.accessToken
      ) as Record<string, unknown>;
      return mapAccount(data);
    } catch {
      const clean = handleOrId.replace(/^@/, '');
      const results = await mFetch(
        creds.instanceUrl!,
        `/api/v1/accounts/search?q=${encodeURIComponent(clean)}&limit=1&resolve=true`,
        creds.accessToken,
      ) as Record<string, unknown>[];
      if (!results.length) throw new FediverseError('mastodon', 'NOT_FOUND', `Profile not found: ${handleOrId}`);
      return mapAccount(results[0]);
    }
  },
};
