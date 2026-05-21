// ─── Bluesky / AT Protocol Adapter ────────────────────────────────────────────
// Bluesky uses the AT Protocol (atproto.com). All API calls are XRPC methods.
// Auth: user generates an "App Password" in Bluesky → Settings → App Passwords,
// then calls createSession with their handle + app password to receive a JWT.
// The DID (Decentralised Identifier) is the persistent identity.

import type {
  FediverseAdapter, FediverseCredentials, FediversePost, FediverseProfile,
  FediverseNotification, FediverseMedia, FediverseNotifType, CreatePostOptions,
} from './types';
import { FediverseError } from './types';

const DEFAULT_PDS = 'https://bsky.social';

// ─── XRPC helper ─────────────────────────────────────────────────────────────

async function xrpc(
  pdsUrl: string,
  method: string,
  params: Record<string, string | number | boolean> | null,
  body: unknown | null,
  token: string,
): Promise<unknown> {
  const base = (pdsUrl || DEFAULT_PDS).replace(/\/$/, '');
  let url = `${base}/xrpc/${method}`;
  if (params) {
    const qs = new URLSearchParams(
      Object.entries(params).map(([k, v]) => [k, String(v)])
    ).toString();
    url += `?${qs}`;
  }
  const res = await fetch(url, {
    method: body !== null ? 'POST' : 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body !== null ? JSON.stringify(body) : undefined,
  });

  if (res.status === 400) {
    const err = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (String(err.error).includes('ExpiredToken') || String(err.error).includes('InvalidToken')) {
      throw new FediverseError('bluesky', 'AUTH_EXPIRED', 'Session expired — re-authenticate');
    }
    throw new FediverseError('bluesky', 'API_ERROR', String(err.message ?? err.error ?? res.statusText));
  }
  if (res.status === 429) {
    throw new FediverseError('bluesky', 'RATE_LIMITED', 'Rate limited', 60);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new FediverseError('bluesky', 'API_ERROR', String(err.message ?? res.statusText));
  }
  if (res.status === 204) return null;
  return res.json();
}

// ─── Auth: create session from handle + app password ─────────────────────────

export async function bskyCreateSession(
  handleOrEmail: string,
  appPassword: string,
  pdsUrl = DEFAULT_PDS,
): Promise<FediverseCredentials> {
  const pds = pdsUrl.replace(/\/$/, '');
  const res = await fetch(`${pds}/xrpc/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: handleOrEmail, password: appPassword }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new FediverseError('bluesky', 'AUTH_EXPIRED', String(err.message ?? 'Auth failed'));
  }
  const data = await res.json() as {
    accessJwt: string; refreshJwt: string; did: string; handle: string;
  };
  return {
    accessToken: data.accessJwt,
    refreshToken: data.refreshJwt,
    did: data.did,
    pdsUrl: pds,
  };
}

export async function bskyRefreshSession(creds: FediverseCredentials): Promise<FediverseCredentials> {
  const pds = (creds.pdsUrl || DEFAULT_PDS).replace(/\/$/, '');
  const res = await fetch(`${pds}/xrpc/com.atproto.server.refreshSession`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${creds.refreshToken}` },
  });
  if (!res.ok) throw new FediverseError('bluesky', 'AUTH_EXPIRED', 'Refresh failed');
  const data = await res.json() as { accessJwt: string; refreshJwt: string };
  return { ...creds, accessToken: data.accessJwt, refreshToken: data.refreshJwt };
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

function rkeyFromUri(uri: string): string {
  return uri.split('/').at(-1) ?? '';
}

function mapEmbed(embed: Record<string, unknown> | undefined): FediverseMedia[] {
  if (!embed) return [];
  const type = String(embed.$type ?? '');
  if (type.includes('images')) {
    const images = (embed.images ?? embed.media) as Record<string, unknown>[] | undefined ?? [];
    return images.map(img => {
      const imgData = img.image as Record<string, unknown> | undefined;
      return {
        type: 'image' as const,
        url: imgData?.ref ? '' : String(imgData?.url ?? ''), // blob refs resolved via CDN
        previewUrl: undefined,
        altText: img.alt ? String(img.alt) : undefined,
        width: undefined,
        height: undefined,
      };
    });
  }
  return [];
}

function mapFeedPost(
  feedItem: Record<string, unknown>,
  accountId: string,
): FediversePost {
  const post  = feedItem.post as Record<string, unknown>;
  const record  = post.record as Record<string, unknown>;
  const author  = post.author as Record<string, unknown>;
  const viewer  = post.viewer as Record<string, unknown> | undefined;
  const uri = String(post.uri ?? '');
  const cid = String(post.cid ?? '');

  const replyRef = record.reply as Record<string, unknown> | undefined;

  return {
    id: cid,
    uri,
    protocol: 'bluesky',
    accountId,
    authorHandle: String(author.handle ?? ''),
    authorDisplayName: String(author.displayName || author.handle),
    authorAvatarUrl: author.avatar ? String(author.avatar) : undefined,
    authorDid: String(author.did ?? ''),
    content: String(record.text ?? ''),
    contentText: String(record.text ?? ''),
    createdAt: new Date(String(record.createdAt ?? '')).getTime(),
    url: `https://bsky.app/profile/${author.handle}/post/${rkeyFromUri(uri)}`,
    replyCount: Number(post.replyCount ?? 0),
    repostCount: Number(post.repostCount ?? 0),
    likeCount: Number(post.likeCount ?? 0),
    isLiked: !!viewer?.like,
    isReposted: !!viewer?.repost,
    isBookmarked: false,
    likeUri: viewer?.like ? String(viewer.like) : undefined,
    repostUri: viewer?.repost ? String(viewer.repost) : undefined,
    media: mapEmbed(post.embed as Record<string, unknown> | undefined),
    inReplyToUri: (replyRef?.parent as Record<string, unknown> | undefined)?.uri
      ? String((replyRef!.parent as Record<string, unknown>).uri)
      : undefined,
    lang: Array.isArray(record.langs) ? (record.langs as string[]) : undefined,
  };
}

function mapProfile(actor: Record<string, unknown>): FediverseProfile {
  const viewer = actor.viewer as Record<string, unknown> | undefined;
  const handle = String(actor.handle ?? '');
  return {
    id: String(actor.did ?? actor.id ?? ''),
    did: String(actor.did ?? ''),
    protocol: 'bluesky',
    handle,
    displayName: String(actor.displayName || handle),
    bio: actor.description ? String(actor.description) : undefined,
    avatarUrl: actor.avatar ? String(actor.avatar) : undefined,
    headerUrl: actor.banner ? String(actor.banner) : undefined,
    followersCount: Number(actor.followersCount ?? 0),
    followingCount: Number(actor.followsCount ?? 0),
    postsCount: Number(actor.postsCount ?? 0),
    isFollowing: viewer?.following ? true : viewer?.following === null ? false : undefined,
    isFollowedBy: viewer?.followedBy ? true : undefined,
    followRecordUri: viewer?.following ? String(viewer.following) : undefined,
    url: `https://bsky.app/profile/${handle}`,
  };
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export const blueskyadapter: FediverseAdapter = {
  protocol: 'bluesky',

  async verifyCredentials(creds) {
    const data = await xrpc(
      creds.pdsUrl ?? DEFAULT_PDS, 'app.bsky.actor.getProfile',
      { actor: creds.did! }, null, creds.accessToken
    ) as Record<string, unknown>;
    return mapProfile(data);
  },

  async getHomeTimeline(creds, cursor) {
    const params: Record<string, string | number | boolean> = { limit: 40 };
    if (cursor) params.cursor = cursor;
    const data = await xrpc(
      creds.pdsUrl ?? DEFAULT_PDS, 'app.bsky.feed.getTimeline',
      params, null, creds.accessToken
    ) as { feed: Record<string, unknown>[]; cursor?: string };
    const posts = data.feed.map(item => mapFeedPost(item, creds.did ?? 'local'));
    return { posts, cursor: data.cursor };
  },

  async getPublicTimeline(creds, cursor) {
    const params: Record<string, string | number | boolean> = { feed: 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot', limit: 40 };
    if (cursor) params.cursor = cursor;
    const data = await xrpc(
      creds.pdsUrl ?? DEFAULT_PDS, 'app.bsky.feed.getFeed',
      params, null, creds.accessToken
    ) as { feed: Record<string, unknown>[]; cursor?: string };
    const posts = data.feed.map(item => mapFeedPost(item, creds.did ?? 'local'));
    return { posts, cursor: data.cursor };
  },

  async createPost(creds, content, options?: CreatePostOptions) {
    const now = new Date().toISOString();
    const record: Record<string, unknown> = {
      $type: 'app.bsky.feed.post',
      text: content,
      createdAt: now,
      langs: options?.langs ?? ['en'],
    };

    if (options?.inReplyToUri && options?.inReplyToCid) {
      const rootUri  = options.inReplyToRootUri  ?? options.inReplyToUri;
      const rootCid  = options.inReplyToRootCid  ?? options.inReplyToCid;
      record.reply = {
        root:   { uri: rootUri,                cid: rootCid },
        parent: { uri: options.inReplyToUri,   cid: options.inReplyToCid },
      };
    }

    const res = await xrpc(
      creds.pdsUrl ?? DEFAULT_PDS,
      'com.atproto.repo.createRecord',
      null,
      { repo: creds.did, collection: 'app.bsky.feed.post', record },
      creds.accessToken,
    ) as { uri: string; cid: string };

    // build a minimal FediversePost from the response (no roundtrip needed)
    const rkey = rkeyFromUri(res.uri);
    return {
      id: res.cid,
      uri: res.uri,
      protocol: 'bluesky',
      accountId: creds.did ?? 'local',
      authorHandle: '',     // filled in by context after verifyCredentials
      authorDisplayName: '',
      content,
      contentText: content,
      createdAt: Date.now(),
      url: `https://bsky.app/profile/${creds.did}/post/${rkey}`,
      replyCount: 0, repostCount: 0, likeCount: 0,
      isLiked: false, isReposted: false, isBookmarked: false,
      media: [],
    };
  },

  async deletePost(creds, postId) {
    // postId may be an AT-URI — extract collection + rkey
    let collection = 'app.bsky.feed.post';
    let rkey = postId;
    if (postId.startsWith('at://')) {
      const parts = postId.split('/');
      collection = parts[2] ?? collection;
      rkey = parts[3] ?? rkey;
    }
    await xrpc(
      creds.pdsUrl ?? DEFAULT_PDS,
      'com.atproto.repo.deleteRecord',
      null,
      { repo: creds.did, collection, rkey },
      creds.accessToken,
    );
  },

  async likePost(creds, post) {
    const res = await xrpc(
      creds.pdsUrl ?? DEFAULT_PDS,
      'com.atproto.repo.createRecord',
      null,
      {
        repo: creds.did, collection: 'app.bsky.feed.like',
        record: {
          $type: 'app.bsky.feed.like',
          subject: { uri: post.uri, cid: post.id },
          createdAt: new Date().toISOString(),
        },
      },
      creds.accessToken,
    ) as { uri: string };
    return { isLiked: true, likeCount: post.likeCount + 1, likeUri: res.uri };
  },

  async unlikePost(creds, post) {
    if (!post.likeUri) return;
    const rkey = rkeyFromUri(post.likeUri);
    await xrpc(
      creds.pdsUrl ?? DEFAULT_PDS,
      'com.atproto.repo.deleteRecord',
      null,
      { repo: creds.did, collection: 'app.bsky.feed.like', rkey },
      creds.accessToken,
    );
  },

  async repost(creds, post) {
    const res = await xrpc(
      creds.pdsUrl ?? DEFAULT_PDS,
      'com.atproto.repo.createRecord',
      null,
      {
        repo: creds.did, collection: 'app.bsky.feed.repost',
        record: {
          $type: 'app.bsky.feed.repost',
          subject: { uri: post.uri, cid: post.id },
          createdAt: new Date().toISOString(),
        },
      },
      creds.accessToken,
    ) as { uri: string };
    return { isReposted: true, repostCount: post.repostCount + 1, repostUri: res.uri };
  },

  async unrepost(creds, post) {
    if (!post.repostUri) return;
    const rkey = rkeyFromUri(post.repostUri);
    await xrpc(
      creds.pdsUrl ?? DEFAULT_PDS,
      'com.atproto.repo.deleteRecord',
      null,
      { repo: creds.did, collection: 'app.bsky.feed.repost', rkey },
      creds.accessToken,
    );
  },

  async followProfile(creds, profile) {
    const res = await xrpc(
      creds.pdsUrl ?? DEFAULT_PDS,
      'com.atproto.repo.createRecord',
      null,
      {
        repo: creds.did, collection: 'app.bsky.graph.follow',
        record: {
          $type: 'app.bsky.graph.follow',
          subject: profile.did ?? profile.id,
          createdAt: new Date().toISOString(),
        },
      },
      creds.accessToken,
    ) as { uri: string };
    return { isFollowing: true, followRecordUri: res.uri };
  },

  async unfollowProfile(creds, profile) {
    if (!profile.followRecordUri) return;
    const rkey = rkeyFromUri(profile.followRecordUri);
    await xrpc(
      creds.pdsUrl ?? DEFAULT_PDS,
      'com.atproto.repo.deleteRecord',
      null,
      { repo: creds.did, collection: 'app.bsky.graph.follow', rkey },
      creds.accessToken,
    );
  },

  async getNotifications(creds) {
    const data = await xrpc(
      creds.pdsUrl ?? DEFAULT_PDS,
      'app.bsky.notification.listNotifications',
      { limit: 30 }, null, creds.accessToken
    ) as { notifications: Record<string, unknown>[] };

    const typeMap: Record<string, FediverseNotifType> = {
      like: 'like', repost: 'repost', follow: 'follow',
      mention: 'mention', reply: 'reply', quote: 'quote',
    };

    return data.notifications.map(n => ({
      id: String(n.uri ?? n.cid ?? ''),
      protocol: 'bluesky' as const,
      type: typeMap[String(n.reason)] ?? 'mention',
      createdAt: new Date(String(n.indexedAt ?? '')).getTime(),
      isRead: Boolean(n.isRead),
      actor: n.author ? mapProfile(n.author as Record<string, unknown>) : undefined,
      post: n.record ? (() => {
        const rec = n.record as Record<string, unknown>;
        return {
          id: String(n.cid ?? ''),
          uri: String(n.uri ?? ''),
          protocol: 'bluesky' as const,
          accountId: creds.did ?? 'local',
          authorHandle: '',
          authorDisplayName: '',
          content: String(rec.text ?? ''),
          contentText: String(rec.text ?? ''),
          createdAt: new Date(String(rec.createdAt ?? '')).getTime(),
          url: '',
          replyCount: 0, repostCount: 0, likeCount: 0,
          isLiked: false, isReposted: false, isBookmarked: false,
          media: [],
        } satisfies FediversePost;
      })() : undefined,
    })) satisfies FediverseNotification[];
  },

  async lookupProfile(creds, handleOrId) {
    const data = await xrpc(
      creds.pdsUrl ?? DEFAULT_PDS,
      'app.bsky.actor.getProfile',
      { actor: handleOrId }, null, creds.accessToken
    ) as Record<string, unknown>;
    return mapProfile(data);
  },
};
