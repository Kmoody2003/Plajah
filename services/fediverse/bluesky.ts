// ─── Bluesky / AT Protocol adapter ────────────────────────────────────────────
// Built on the official @atproto/api SDK so lexicon changes (embed shapes, chat proxying, new notification
// reasons) arrive with the package instead of rotting in hand-rolled XRPC.
//
// What the SDK buys here, and what the previous hand-rolled adapter got wrong:
//   • SESSIONS — access JWTs live ~2h. The old code threw AUTH_EXPIRED and never refreshed, so every linked
//     account silently died after two hours. agentFor() resumes the stored session, the SDK refreshes it, and the
//     rotated token pair is written back onto `creds` (callers persist it — see auth.ts loadAccounts()).
//   • RICH TEXT — mentions, links and #hashtags need byte-indexed facets; plain posts had none.
//   • EMBEDS — timeline posts carry *view* embeds (CDN thumb/fullsize, video playlist, link card, quoted post),
//     not blob refs. The old mapper looked for blob refs, so images were always blank and quote posts vanished.
//   • DMs — chat lives on api.bsky.chat and is reached by PROXYING through the user's PDS
//     (atproto-proxy: did:web:api.bsky.chat#bsky_chat), not by calling it directly with a hand-made token.
//   • IMAGES — blobs are uploaded (≤1MB, with alt text + aspect ratio) so cross-posts can carry pictures.
//
// Auth is still an app password (createSession). ATProto OAuth is the successor; it is a separate sign-in flow
// (DPoP + PAR + client metadata) and slots in behind agentFor() without touching the rest of this file.

import { AtpAgent, RichText, type Agent } from '@atproto/api';
import type {
  FediverseAdapter, FediverseCredentials, FediversePost, FediverseProfile,
  FediverseNotification, FediverseMedia, FediverseNotifType, CreatePostOptions,
} from './types';
import { FediverseError } from './types';

const DEFAULT_PDS = 'https://bsky.social';
const GRAPHEME_LIMIT = 300;
const WHATS_HOT = 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot';
const CHAT_DID = 'did:web:api.bsky.chat';

// ─── Errors ───────────────────────────────────────────────────────────────────

function mapErr(e: unknown): FediverseError {
  if (e instanceof FediverseError) return e;
  const err = e as { error?: string; status?: number; message?: string; headers?: Record<string, string> };
  const name = String(err?.error ?? '');
  const status = Number(err?.status ?? 0);
  const msg = String(err?.message ?? e);

  if (/scope/i.test(msg)) {
    return new FediverseError('bluesky', 'API_ERROR',
      'This app password cannot do that. In Bluesky go to Settings → Privacy and security → App passwords, and create one with "Allow access to your direct messages" ticked.');
  }
  if (['ExpiredToken', 'InvalidToken', 'AuthRequired', 'AuthenticationRequired', 'AccountTakedown'].includes(name) || status === 401) {
    return new FediverseError('bluesky', 'AUTH_EXPIRED', 'Bluesky session expired — reconnect this account');
  }
  if (name === 'RateLimitExceeded' || status === 429) {
    const reset = Number(err?.headers?.['ratelimit-reset']);
    return new FediverseError('bluesky', 'RATE_LIMITED', 'Bluesky is rate limiting this account — try again shortly', reset ? Math.max(1, reset - Math.floor(Date.now() / 1000)) : 60);
  }
  if (status === 404 || name === 'NotFound' || name === 'ProfileNotFound') return new FediverseError('bluesky', 'NOT_FOUND', msg);
  return new FediverseError('bluesky', 'API_ERROR', msg || 'Bluesky request failed');
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

const dirtySessions = new WeakSet<FediverseCredentials>();

/**
 * OAuth accounts: the server registers a function that returns an Agent for a DID (see blueskyOAuth.ts). It is
 * injected, not imported, so the browser bundle never pulls in the OAuth client.
 */
let oauthRestorer: ((did: string) => Promise<Agent>) | null = null;
export function setBlueskyOAuthRestorer(fn: (did: string) => Promise<Agent>): void { oauthRestorer = fn; }

/** exp (ms) from a JWT, or 0 when it can't be read. */
export function jwtExpiresAt(jwt?: string): number {
  try {
    const part = String(jwt).split('.')[1];
    const json = typeof Buffer !== 'undefined' ? Buffer.from(part, 'base64url').toString('utf8') : atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return (JSON.parse(json).exp ?? 0) * 1000;
  } catch { return 0; }
}

/**
 * An authenticated agent for stored credentials. If the access token is expired the SDK refreshes it; the rotated
 * pair is copied back onto `creds` (and the creds are flagged) so the caller can persist it.
 */
async function agentFor(creds: FediverseCredentials, forceRefresh = false): Promise<AtpAgent> {
  if (creds.oauth) {
    if (!oauthRestorer || !creds.did) throw new FediverseError('bluesky', 'AUTH_EXPIRED', 'Bluesky sign-in is unavailable — reconnect this account');
    try { return (await oauthRestorer(creds.did)) as unknown as AtpAgent; }
    catch { throw new FediverseError('bluesky', 'AUTH_EXPIRED', 'Bluesky access was revoked or expired — reconnect this account'); }
  }
  const agent = new AtpAgent({
    service: (creds.pdsUrl || DEFAULT_PDS).replace(/\/$/, ''),
    persistSession: (_evt, session) => {
      if (!session) return;
      creds.accessToken = session.accessJwt;
      creds.refreshToken = session.refreshJwt;
      creds.did = session.did;
      creds.handle = session.handle;
      dirtySessions.add(creds);
    },
  });
  if (!creds.refreshToken || !creds.did) throw new FediverseError('bluesky', 'AUTH_EXPIRED', 'Bluesky session missing — reconnect this account');
  const session = {
    accessJwt: creds.accessToken, refreshJwt: creds.refreshToken, did: creds.did,
    handle: creds.handle || creds.did, active: true,
  };
  // NOTE: the SDK's resumeSession() ALWAYS forces a refreshSession round-trip ("ensure the session is still valid"),
  // which rotates the single-use refresh token on every call. So only use it when the access token really is
  // (nearly) expired. While it is still valid, attach the session directly — no network call, no rotation — and let
  // the SDK's own fetch handler refresh lazily if the server ever answers ExpiredToken.
  const exp = jwtExpiresAt(creds.accessToken);
  if (!forceRefresh && exp && exp - Date.now() > 60_000) {
    (agent.sessionManager as unknown as { session?: typeof session }).session = session;
  } else {
    try { await agent.resumeSession(session); } catch (e) { throw mapErr(e); }
  }
  return agent;
}

async function run<T>(creds: FediverseCredentials, fn: (agent: AtpAgent) => Promise<T>): Promise<T> {
  const agent = await agentFor(creds);
  try { return await fn(agent); } catch (e) { throw mapErr(e); }
}

/**
 * Refresh a stored session when its access token is expired or about to be. Returns true when `creds` changed and
 * must be saved (refresh tokens ROTATE — losing the new one means the next refresh fails).
 */
export async function bskyRefreshIfNeeded(creds: FediverseCredentials, withinMs = 10 * 60_000): Promise<boolean> {
  if (creds.oauth || !creds.refreshToken) return false; // OAuth sessions refresh inside the OAuth client
  const exp = jwtExpiresAt(creds.accessToken);
  if (exp && exp - Date.now() > withinMs) return false;
  await agentFor(creds, true); // inside the window: force the refresh now, while the refresh token is certainly good
  return dirtySessions.delete(creds);
}

export async function bskyCreateSession(
  handleOrEmail: string,
  appPassword: string,
  pdsUrl = DEFAULT_PDS,
): Promise<FediverseCredentials> {
  const service = pdsUrl.replace(/\/$/, '');
  const agent = new AtpAgent({ service });
  let data;
  try {
    ({ data } = await agent.login({ identifier: handleOrEmail.trim().replace(/^@/, ''), password: appPassword }));
  } catch (e) {
    const m = mapErr(e);
    throw new FediverseError('bluesky', 'AUTH_EXPIRED', /AUTH_EXPIRED/.test(m.message) ? 'Bluesky rejected that handle or app password' : m.message);
  }
  // Talk to the account's own PDS from now on (self-hosted accounts differ from the entryway we logged in through).
  const doc = data.didDoc as { service?: { id?: string; serviceEndpoint?: string }[] } | undefined;
  const hosted = doc?.service?.find(s => s.id === '#atproto_pds')?.serviceEndpoint;
  return {
    accessToken: data.accessJwt, refreshToken: data.refreshJwt, did: data.did, handle: data.handle,
    pdsUrl: (hosted || service).replace(/\/$/, ''),
  };
}

/** Kept for existing callers; the SDK handles routine refresh inside agentFor(). */
export async function bskyRefreshSession(creds: FediverseCredentials): Promise<FediverseCredentials> {
  const next = { ...creds };
  await agentFor(next, true);
  return next;
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

const rkeyOf = (uri: string) => uri.split('/').at(-1) ?? '';
const postUrl = (handleOrDid: string, uri: string) => `https://bsky.app/profile/${handleOrDid}/post/${rkeyOf(uri)}`;
const isType = (o: any, t: string) => typeof o?.$type === 'string' && o.$type.startsWith(t);

interface MappedEmbed {
  media: FediverseMedia[];
  card?: FediversePost['card'];
  quote?: FediversePost['quote'];
}

/** Map a *view* embed (what getTimeline/getFeed return) — images, video, link card, quoted post, or quote + media. */
export function mapEmbedView(embed: any): MappedEmbed {
  const out: MappedEmbed = { media: [] };
  if (!embed) return out;
  if (isType(embed, 'app.bsky.embed.images')) {
    out.media = (embed.images ?? []).map((i: any): FediverseMedia => ({
      type: 'image', url: String(i.fullsize ?? i.thumb ?? ''), previewUrl: i.thumb ? String(i.thumb) : undefined,
      altText: i.alt ? String(i.alt) : undefined, width: i.aspectRatio?.width, height: i.aspectRatio?.height,
    }));
  } else if (isType(embed, 'app.bsky.embed.video')) {
    out.media = [{
      type: 'video', url: String(embed.playlist ?? ''), previewUrl: embed.thumbnail ? String(embed.thumbnail) : undefined,
      altText: embed.alt ? String(embed.alt) : undefined, width: embed.aspectRatio?.width, height: embed.aspectRatio?.height,
    }];
  } else if (isType(embed, 'app.bsky.embed.external')) {
    const x = embed.external ?? {};
    out.card = { uri: String(x.uri ?? ''), title: String(x.title ?? ''), description: String(x.description ?? ''), thumb: x.thumb ? String(x.thumb) : undefined };
  } else if (isType(embed, 'app.bsky.embed.recordWithMedia')) {
    const inner = mapEmbedView(embed.media);
    out.media = inner.media; out.card = inner.card;
    out.quote = mapEmbedView({ $type: 'app.bsky.embed.record#view', record: embed.record?.record }).quote;
  } else if (isType(embed, 'app.bsky.embed.record')) {
    const r = embed.record;
    if (isType(r, 'app.bsky.embed.record#viewRecord') && r.author) {
      out.quote = {
        uri: String(r.uri), cid: r.cid ? String(r.cid) : undefined,
        authorHandle: String(r.author.handle ?? ''), authorDisplayName: String(r.author.displayName || r.author.handle || ''),
        authorAvatarUrl: r.author.avatar ? String(r.author.avatar) : undefined,
        text: String(r.value?.text ?? ''), url: postUrl(String(r.author.handle ?? r.author.did), String(r.uri)),
      };
    }
  }
  return out;
}

/** A hydrated app.bsky.feed.defs#postView (+ optional feed `reason`) → FediversePost. */
export function mapPostView(post: any, accountId: string, reason?: any): FediversePost {
  const record = post.record ?? {};
  const author = post.author ?? {};
  const viewer = post.viewer ?? {};
  const uri = String(post.uri ?? '');
  const e = mapEmbedView(post.embed);
  const reply = record.reply;
  return {
    id: String(post.cid ?? ''),
    uri,
    protocol: 'bluesky',
    accountId,
    authorHandle: String(author.handle ?? ''),
    authorDisplayName: String(author.displayName || author.handle || ''),
    authorAvatarUrl: author.avatar ? String(author.avatar) : undefined,
    authorDid: String(author.did ?? ''),
    content: String(record.text ?? ''),
    contentText: String(record.text ?? ''),
    createdAt: Date.parse(String(record.createdAt ?? post.indexedAt ?? '')) || 0,
    url: postUrl(String(author.handle || author.did), uri),
    replyCount: Number(post.replyCount ?? 0),
    repostCount: Number(post.repostCount ?? 0) + Number(post.quoteCount ?? 0) * 0,
    likeCount: Number(post.likeCount ?? 0),
    isLiked: !!viewer.like,
    isReposted: !!viewer.repost,
    isBookmarked: !!viewer.bookmarked,
    likeUri: viewer.like ? String(viewer.like) : undefined,
    repostUri: viewer.repost ? String(viewer.repost) : undefined,
    media: e.media,
    card: e.card,
    quote: e.quote,
    repostedBy: isType(reason, 'app.bsky.feed.defs#reasonRepost') ? String(reason.by?.displayName || reason.by?.handle || '') : undefined,
    rootUri: reply?.root?.uri ? String(reply.root.uri) : undefined,
    rootCid: reply?.root?.cid ? String(reply.root.cid) : undefined,
    inReplyToUri: reply?.parent?.uri ? String(reply.parent.uri) : undefined,
    lang: Array.isArray(record.langs) ? (record.langs as string[]) : undefined,
  };
}

function mapProfile(actor: any): FediverseProfile {
  const viewer = actor.viewer ?? {};
  const handle = String(actor.handle ?? '');
  return {
    id: String(actor.did ?? ''),
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
    isFollowing: viewer.following ? true : viewer.following === undefined ? undefined : false,
    isFollowedBy: viewer.followedBy ? true : undefined,
    followRecordUri: viewer.following ? String(viewer.following) : undefined,
    url: `https://bsky.app/profile/${handle || actor.did}`,
  };
}

// ─── Building a post record ───────────────────────────────────────────────────

type BlobUploader = (url: string) => Promise<{ blob: unknown; width?: number; height?: number }>;

/** Download + shrink + uploadBlob. Loaded lazily so the browser bundle never pulls in sharp. */
function serverUploader(agent: AtpAgent): BlobUploader {
  return async (url) => {
    const modPath = './blueskyMedia';
    const { prepareImage } = await import(/* @vite-ignore */ modPath) as typeof import('./blueskyMedia');
    const img = await prepareImage(url);
    const up = await agent.uploadBlob(img.bytes, { encoding: img.mime });
    return { blob: up.data.blob, width: img.width, height: img.height };
  };
}

/**
 * The app.bsky.feed.post record for `text` + options: facets for mentions/links/hashtags, reply refs, up to 4
 * images (alt text + aspect ratio) or a link card, and an optional quoted post. Exported for tests.
 */
export async function buildPostRecord(
  agent: AtpAgent,
  text: string,
  options: CreatePostOptions | undefined,
  upload: BlobUploader,
): Promise<Record<string, unknown>> {
  const rt = new RichText({ text });
  if (rt.graphemeLength > GRAPHEME_LIMIT) {
    throw new FediverseError('bluesky', 'API_ERROR', `Bluesky posts are limited to ${GRAPHEME_LIMIT} characters (this one is ${rt.graphemeLength}).`);
  }
  await rt.detectFacets(agent); // resolves @handles → DIDs; links and #tags are pure text

  const record: Record<string, unknown> = {
    $type: 'app.bsky.feed.post',
    text: rt.text,
    createdAt: new Date().toISOString(),
    langs: options?.langs?.length ? options.langs : ['en'],
  };
  if (rt.facets?.length) record.facets = rt.facets;
  if (options?.labels?.length) {
    record.labels = { $type: 'com.atproto.label.defs#selfLabels', values: [...new Set(options.labels)].map(val => ({ val })) };
  }

  if (options?.inReplyToUri && options?.inReplyToCid) {
    record.reply = {
      root: { uri: options.inReplyToRootUri ?? options.inReplyToUri, cid: options.inReplyToRootCid ?? options.inReplyToCid },
      parent: { uri: options.inReplyToUri, cid: options.inReplyToCid },
    };
  }

  let media: Record<string, unknown> | undefined;
  if (options?.images?.length) {
    const images: Record<string, unknown>[] = [];
    for (const img of options.images.slice(0, 4)) {
      const up = await upload(img.url);
      images.push({
        image: up.blob, alt: img.alt ?? '',
        ...(up.width && up.height ? { aspectRatio: { width: up.width, height: up.height } } : {}),
      });
    }
    media = { $type: 'app.bsky.embed.images', images };
  } else if (options?.link?.uri) {
    let thumb: unknown;
    if (options.link.thumbUrl) { try { thumb = (await upload(options.link.thumbUrl)).blob; } catch { /* card without a thumbnail */ } }
    media = {
      $type: 'app.bsky.embed.external',
      external: { uri: options.link.uri, title: options.link.title ?? '', description: options.link.description ?? '', ...(thumb ? { thumb } : {}) },
    };
  }

  if (options?.quote) {
    const rec = { $type: 'app.bsky.embed.record', record: { uri: options.quote.uri, cid: options.quote.cid } };
    record.embed = media ? { $type: 'app.bsky.embed.recordWithMedia', record: rec, media } : rec;
  } else if (media) {
    record.embed = media;
  }
  return record;
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export const blueskyadapter: FediverseAdapter = {
  protocol: 'bluesky',

  async verifyCredentials(creds) {
    return run(creds, async (agent) => mapProfile((await agent.getProfile({ actor: creds.did! })).data));
  },

  async getHomeTimeline(creds, cursor) {
    return run(creds, async (agent) => {
      const { data } = await agent.getTimeline({ limit: 40, ...(cursor ? { cursor } : {}) });
      return { posts: data.feed.map(i => mapPostView(i.post, creds.did ?? 'local', i.reason)), cursor: data.cursor };
    });
  },

  async getPublicTimeline(creds, cursor) {
    return run(creds, async (agent) => {
      const { data } = await agent.app.bsky.feed.getFeed({ feed: WHATS_HOT, limit: 40, ...(cursor ? { cursor } : {}) });
      return { posts: data.feed.map(i => mapPostView(i.post, creds.did ?? 'local', i.reason)), cursor: data.cursor };
    });
  },

  async createPost(creds, content, options?: CreatePostOptions) {
    return run(creds, async (agent) => {
      const record = await buildPostRecord(agent, content, options, serverUploader(agent));
      const res = await agent.com.atproto.repo.createRecord({
        repo: creds.did!, collection: 'app.bsky.feed.post', record,
      });
      const handle = creds.handle || creds.did!;
      return {
        id: res.data.cid, uri: res.data.uri, protocol: 'bluesky', accountId: creds.did ?? 'local',
        authorHandle: creds.handle ?? '', authorDisplayName: '',
        content: String(record.text), contentText: String(record.text), createdAt: Date.now(),
        url: postUrl(handle, res.data.uri),
        replyCount: 0, repostCount: 0, likeCount: 0, isLiked: false, isReposted: false, isBookmarked: false, media: [],
      } satisfies FediversePost;
    });
  },

  async deletePost(creds, postId) {
    // Accept an AT-URI, or a bare rkey (older callers passed whatever id they had).
    const uri = postId.startsWith('at://') ? postId : `at://${creds.did}/app.bsky.feed.post/${postId}`;
    await run(creds, (agent) => agent.deletePost(uri));
  },

  async likePost(creds, post) {
    return run(creds, async (agent) => {
      const res = await agent.like(post.uri, post.id);
      return { isLiked: true, likeCount: post.likeCount + 1, likeUri: res.uri };
    });
  },

  async unlikePost(creds, post) {
    if (!post.likeUri) return;
    await run(creds, (agent) => agent.deleteLike(post.likeUri!));
  },

  async repost(creds, post) {
    return run(creds, async (agent) => {
      const res = await agent.repost(post.uri, post.id);
      return { isReposted: true, repostCount: post.repostCount + 1, repostUri: res.uri };
    });
  },

  async unrepost(creds, post) {
    if (!post.repostUri) return;
    await run(creds, (agent) => agent.deleteRepost(post.repostUri!));
  },

  async followProfile(creds, profile) {
    return run(creds, async (agent) => {
      const res = await agent.follow(profile.did ?? profile.id);
      return { isFollowing: true, followRecordUri: res.uri };
    });
  },

  async unfollowProfile(creds, profile) {
    if (!profile.followRecordUri) return;
    await run(creds, (agent) => agent.deleteFollow(profile.followRecordUri!));
  },

  async getNotifications(creds) {
    return run(creds, async (agent) => {
      const { data } = await agent.listNotifications({ limit: 40 });
      // Newer reasons fold into the closest type we render: "…-via-repost" is still a like/repost.
      const typeMap: Record<string, FediverseNotifType> = {
        like: 'like', 'like-via-repost': 'like', repost: 'repost', 'repost-via-repost': 'repost',
        follow: 'follow', mention: 'mention', reply: 'reply', quote: 'quote',
      };
      return data.notifications.map((n: any): FediverseNotification => {
        const rec = n.record ?? {};
        const isPostRecord = ['mention', 'reply', 'quote'].includes(String(n.reason));
        return {
          id: String(n.uri ?? n.cid ?? ''),
          protocol: 'bluesky',
          type: typeMap[String(n.reason)] ?? 'mention',
          createdAt: Date.parse(String(n.indexedAt ?? '')) || 0,
          isRead: !!n.isRead,
          actor: n.author ? mapProfile(n.author) : undefined,
          post: isPostRecord ? {
            id: String(n.cid ?? ''), uri: String(n.uri ?? ''), protocol: 'bluesky', accountId: creds.did ?? 'local',
            authorHandle: String(n.author?.handle ?? ''), authorDisplayName: String(n.author?.displayName || n.author?.handle || ''),
            authorAvatarUrl: n.author?.avatar ? String(n.author.avatar) : undefined,
            content: String(rec.text ?? ''), contentText: String(rec.text ?? ''),
            createdAt: Date.parse(String(rec.createdAt ?? n.indexedAt ?? '')) || 0,
            url: postUrl(String(n.author?.handle ?? n.author?.did ?? ''), String(n.uri ?? '')),
            replyCount: 0, repostCount: 0, likeCount: 0, isLiked: false, isReposted: false, isBookmarked: false, media: [],
          } : undefined,
        };
      });
    });
  },

  async lookupProfile(creds, handleOrId) {
    return run(creds, async (agent) => mapProfile((await agent.getProfile({ actor: handleOrId.replace(/^@/, '') })).data));
  },
};

/** Mark notifications seen (clears the badge in Bluesky's own apps too). */
export async function bskyMarkNotificationsSeen(creds: FediverseCredentials): Promise<void> {
  await run(creds, (agent) => agent.updateSeenNotifications());
}

// ─── Bluesky DMs (chat.bsky.convo) ────────────────────────────────────────────
// Chat is a separate service. The supported way to reach it is to proxy through the user's PDS:
// the SDK adds `atproto-proxy: did:web:api.bsky.chat#bsky_chat` and the PDS mints the service-auth token.
// The app password must have been created with "Allow access to your direct messages".

const chatFor = (agent: AtpAgent) => agent.withProxy('bsky_chat', CHAT_DID).api.chat.bsky.convo;

export interface BskyConversation {
  id: string;
  lastMessage?: { text: string; sentAt: string };
  unreadCount: number;
  muted: boolean;
  members: { did: string; handle: string; displayName?: string; avatarUrl?: string }[];
}

export interface BskyMessage {
  id: string;
  text: string;
  sentAt: string;
  senderDid: string;
  senderHandle: string;
}

export async function bskyListConversations(creds: FediverseCredentials): Promise<BskyConversation[]> {
  return run(creds, async (agent) => {
    const { data } = await chatFor(agent).listConvos({ limit: 50 });
    return data.convos.map((c: any): BskyConversation => ({
      id: c.id,
      unreadCount: c.unreadCount ?? 0,
      muted: !!c.muted,
      lastMessage: c.lastMessage && c.lastMessage.text !== undefined ? { text: String(c.lastMessage.text ?? ''), sentAt: String(c.lastMessage.sentAt ?? '') } : undefined,
      members: (c.members ?? []).map((m: any) => ({ did: m.did, handle: m.handle, displayName: m.displayName, avatarUrl: m.avatar })),
    }));
  });
}

export async function bskyGetMessages(creds: FediverseCredentials, convoId: string): Promise<BskyMessage[]> {
  return run(creds, async (agent) => {
    const chat = chatFor(agent);
    const [{ data }, convo] = await Promise.all([
      chat.getMessages({ convoId, limit: 50 }),
      chat.getConvo({ convoId }).catch(() => null),
    ]);
    const handles = new Map<string, string>((convo?.data.convo.members ?? []).map((m: any) => [m.did, m.handle]));
    // Skip deletedMessageView entries; newest-first from the API → oldest-first for display.
    return data.messages
      .filter((m: any) => typeof m.text === 'string')
      .map((m: any): BskyMessage => ({ id: m.id, text: m.text, sentAt: m.sentAt ?? '', senderDid: m.sender?.did ?? '', senderHandle: handles.get(m.sender?.did) ?? '' }))
      .reverse();
  });
}

export async function bskySendMessage(creds: FediverseCredentials, convoId: string, text: string): Promise<BskyMessage> {
  return run(creds, async (agent) => {
    const rt = new RichText({ text });
    await rt.detectFacets(agent);
    const { data } = await chatFor(agent).sendMessage({
      convoId, message: { text: rt.text, ...(rt.facets?.length ? { facets: rt.facets } : {}) },
    });
    return { id: data.id, text: data.text ?? text, sentAt: data.sentAt ?? new Date().toISOString(), senderDid: creds.did ?? '', senderHandle: creds.handle ?? '' };
  });
}

export async function bskyMarkConvoRead(creds: FediverseCredentials, convoId: string): Promise<void> {
  await run(creds, (agent) => chatFor(agent).updateRead({ convoId }).then(() => undefined));
}

// ─── Full-client reads: profiles, threads, search, graph, feeds ───────────────
// Everything the in-app Bluesky screens need beyond the home timeline. All of it goes through run(), so sessions
// refresh and errors are mapped exactly like the rest of the adapter.

const acct = (creds: FediverseCredentials) => creds.did ?? 'local';

export interface BskyProfileDetail extends FediverseProfile {
  /** Viewer relationship flags the profile screen needs. */
  muted?: boolean;
  blocked?: boolean;
  blockedBy?: boolean;
  labels?: string[];
  joinedAt?: string;
  pinnedPostUri?: string;
  /** AT-URI of the block record when you have blocked this account (needed to unblock). */
  blockUri?: string;
}

export async function bskyGetProfile(creds: FediverseCredentials, actor: string): Promise<BskyProfileDetail> {
  return run(creds, async (agent) => {
    const { data } = await agent.getProfile({ actor: actor.replace(/^@/, '') });
    const v: any = data.viewer ?? {};
    return {
      ...mapProfile(data),
      muted: !!v.muted, blocked: !!v.blocking, blockedBy: !!v.blockedBy, blockUri: v.blocking ? String(v.blocking) : undefined,
      labels: (data.labels ?? []).map((l: any) => String(l.val)),
      joinedAt: (data as any).createdAt ?? (data as any).indexedAt,
      pinnedPostUri: (data as any).pinnedPost?.uri,
    };
  });
}

export type AuthorFeedFilter = 'posts_with_replies' | 'posts_no_replies' | 'posts_with_media' | 'posts_and_author_threads';

export async function bskyGetAuthorFeed(creds: FediverseCredentials, actor: string, opts: { filter?: AuthorFeedFilter; cursor?: string } = {}): Promise<{ posts: FediversePost[]; cursor?: string }> {
  return run(creds, async (agent) => {
    const { data } = await agent.getAuthorFeed({ actor: actor.replace(/^@/, ''), limit: 30, filter: opts.filter ?? 'posts_no_replies', ...(opts.cursor ? { cursor: opts.cursor } : {}) });
    return { posts: data.feed.map(i => mapPostView(i.post, acct(creds), i.reason)), cursor: data.cursor };
  });
}

export interface BskyThread {
  /** Ancestors, oldest first, ending at the post just above `post`. */
  parents: FediversePost[];
  post: FediversePost;
  /** Direct replies, each with its own nested replies (depth-limited by the request). */
  replies: BskyThreadNode[];
}
export interface BskyThreadNode { post: FediversePost; replies: BskyThreadNode[] }

export async function bskyGetThread(creds: FediverseCredentials, uri: string): Promise<BskyThread> {
  return run(creds, async (agent) => {
    const { data } = await agent.getPostThread({ uri, depth: 6, parentHeight: 20 });
    const root: any = data.thread;
    if (!root || root.$type === 'app.bsky.feed.defs#notFoundPost') throw new FediverseError('bluesky', 'NOT_FOUND', 'That post is no longer available');
    if (root.$type === 'app.bsky.feed.defs#blockedPost') throw new FediverseError('bluesky', 'API_ERROR', 'That post is from an account you can\'t see');
    const isPost = (n: any) => n && n.$type === 'app.bsky.feed.defs#threadViewPost' && n.post;
    const parents: FediversePost[] = [];
    for (let p = root.parent; isPost(p); p = p.parent) parents.unshift(mapPostView(p.post, acct(creds)));
    const walk = (nodes: any[] | undefined): BskyThreadNode[] =>
      (nodes ?? []).filter(isPost).map(n => ({ post: mapPostView(n.post, acct(creds)), replies: walk(n.replies) }))
        // Most-engaged replies first, like the official client's default sort.
        .sort((a, b) => (b.post.likeCount + b.post.replyCount) - (a.post.likeCount + a.post.replyCount));
    return { parents, post: mapPostView(root.post, acct(creds)), replies: walk(root.replies) };
  });
}

export async function bskySearchPosts(creds: FediverseCredentials, q: string, opts: { sort?: 'top' | 'latest'; cursor?: string } = {}): Promise<{ posts: FediversePost[]; cursor?: string }> {
  return run(creds, async (agent) => {
    const { data } = await agent.app.bsky.feed.searchPosts({ q, limit: 30, sort: opts.sort ?? 'top', ...(opts.cursor ? { cursor: opts.cursor } : {}) });
    return { posts: data.posts.map(p => mapPostView(p, acct(creds))), cursor: data.cursor };
  });
}

export async function bskySearchActors(creds: FediverseCredentials, q: string, cursor?: string): Promise<{ profiles: FediverseProfile[]; cursor?: string }> {
  return run(creds, async (agent) => {
    const { data } = await agent.searchActors({ q, limit: 25, ...(cursor ? { cursor } : {}) });
    return { profiles: data.actors.map(mapProfile), cursor: data.cursor };
  });
}

export async function bskyGetFollowers(creds: FediverseCredentials, actor: string, cursor?: string): Promise<{ profiles: FediverseProfile[]; cursor?: string }> {
  return run(creds, async (agent) => {
    const { data } = await agent.getFollowers({ actor, limit: 50, ...(cursor ? { cursor } : {}) });
    return { profiles: data.followers.map(mapProfile), cursor: data.cursor };
  });
}

/** One page of who `actor` follows (for the profile screen). Distinct from bskyGetFollows below, which pages the whole list. */
export async function bskyListFollows(creds: FediverseCredentials, actor: string, cursor?: string): Promise<{ profiles: FediverseProfile[]; cursor?: string }> {
  return run(creds, async (agent) => {
    const { data } = await agent.getFollows({ actor, limit: 50, ...(cursor ? { cursor } : {}) });
    return { profiles: data.follows.map(mapProfile), cursor: data.cursor };
  });
}

export async function bskySuggestedFollows(creds: FediverseCredentials): Promise<FediverseProfile[]> {
  return run(creds, async (agent) => (await agent.getSuggestions({ limit: 20 })).data.actors.map(mapProfile));
}

export async function bskySetMuted(creds: FediverseCredentials, actor: string, muted: boolean): Promise<void> {
  await run(creds, (agent) => (muted ? agent.mute(actor) : agent.unmute(actor)).then(() => undefined));
}

/** Block / unblock. Blocks are records in the user's repo; unblocking needs the record URI from the profile's viewer state. */
export async function bskySetBlocked(creds: FediverseCredentials, actorDid: string, blocked: boolean, blockUri?: string): Promise<{ blockUri?: string }> {
  return run(creds, async (agent) => {
    if (blocked) {
      const r = await agent.com.atproto.repo.createRecord({ repo: creds.did!, collection: 'app.bsky.graph.block', record: { $type: 'app.bsky.graph.block', subject: actorDid, createdAt: new Date().toISOString() } });
      return { blockUri: r.data.uri };
    }
    if (blockUri) {
      const rkey = blockUri.split('/').at(-1)!;
      await agent.com.atproto.repo.deleteRecord({ repo: creds.did!, collection: 'app.bsky.graph.block', rkey });
    }
    return {};
  });
}

export interface BskyFeedInfo { uri: string; name: string; description?: string; avatar?: string; creator: string; likeCount: number; pinned?: boolean }

/** The user's saved/pinned custom feeds (from their Bluesky preferences) with display info. */
export async function bskyGetSavedFeeds(creds: FediverseCredentials): Promise<BskyFeedInfo[]> {
  return run(creds, async (agent) => {
    const prefs: any = await agent.getPreferences();
    const saved: any[] = prefs.savedFeeds ?? [];
    const feedItems = saved.filter(f => f.type === 'feed');
    const uris = feedItems.map(f => String(f.value));
    if (!uris.length) return [];
    const { data } = await agent.app.bsky.feed.getFeedGenerators({ feeds: uris.slice(0, 25) });
    const pinned = new Set(feedItems.filter(f => f.pinned).map(f => String(f.value)));
    return data.feeds.map((g: any): BskyFeedInfo => ({
      uri: g.uri, name: g.displayName, description: g.description, avatar: g.avatar,
      creator: g.creator?.handle ?? '', likeCount: Number(g.likeCount ?? 0), pinned: pinned.has(g.uri),
    }));
  });
}

export async function bskyGetFeed(creds: FediverseCredentials, feed: string, cursor?: string): Promise<{ posts: FediversePost[]; cursor?: string }> {
  return run(creds, async (agent) => {
    const { data } = await agent.app.bsky.feed.getFeed({ feed, limit: 30, ...(cursor ? { cursor } : {}) });
    return { posts: data.feed.map(i => mapPostView(i.post, acct(creds), i.reason)), cursor: data.cursor };
  });
}

/** Everyone who has replied/liked etc. is a notification; this is the post lookup for hydrating one by URI. */
export async function bskyGetPosts(creds: FediverseCredentials, uris: string[]): Promise<FediversePost[]> {
  return run(creds, async (agent) => (await agent.getPosts({ uris: uris.slice(0, 25) })).data.posts.map(p => mapPostView(p, acct(creds))));
}

/**
 * Who this account follows (app.bsky.graph.getFollows), paged up to `max`. Used by "Find your people"
 * (services/socialMigrationServer.ts) to match follows against Plajah users who linked the same Bluesky DID.
 */
export async function bskyGetFollows(
  creds: FediverseCredentials, max = 2000,
): Promise<Array<{ did: string; handle: string; displayName: string; avatarUrl?: string }>> {
  return run(creds, async (agent) => {
    const out: Array<{ did: string; handle: string; displayName: string; avatarUrl?: string }> = [];
    let cursor: string | undefined;
    do {
      const res = await agent.getFollows({ actor: creds.did!, limit: 100, cursor });
      for (const f of res.data.follows) {
        out.push({ did: String(f.did), handle: String(f.handle), displayName: String(f.displayName || f.handle), avatarUrl: f.avatar ? String(f.avatar) : undefined });
      }
      cursor = res.data.cursor;
    } while (cursor && out.length < max);
    return out.slice(0, max);
  });
}
