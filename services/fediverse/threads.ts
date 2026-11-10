// ─── Meta Threads Adapter ──────────────────────────────────────────────────────
// Threads API (graph.threads.net/v1.0). Users connect with "Continue with Threads" (OAuth, routes/threadsOAuth.ts);
// the server swaps the code for a 60-day token and refreshes it automatically (threadsRefreshIfNeeded, called from
// DecentralizedAuthService.loadAccounts), so nobody ever pastes a developer token.
//
// What the Threads API allows (and therefore what Plajah does):
//   ✅ Profile, own posts, own replies
//   ✅ Publish text, photo, video, carousels (up to 20), link previews, reply controls
//   ✅ Reply, repost, delete own posts                    (threads_manage_replies / threads_delete)
//   ✅ Read a post's replies/conversation                   (threads_read_replies)
//   ✅ Look up public profiles + their posts by username    (threads_profile_discovery — needs Meta app review)
//   ✅ Keyword search                                      (threads_keyword_search — needs Meta app review)
//   ❌ Like / unlike, follow / unfollow, home timeline — not in Meta's API at all
// Unsupported operations throw FediverseError('UNSUPPORTED') so callers can degrade per feature.

import type {
  FediverseAdapter, FediverseCredentials, FediversePost, FediverseProfile, CreatePostOptions,
} from './types';
import { FediverseError } from './types';

const GRAPH = 'https://graph.threads.net';
const BASE = `${GRAPH}/v1.0`;
export const THREADS_TEXT_LIMIT = 500;
export const THREADS_CAROUSEL_MAX = 20;

// ─── App config ──────────────────────────────────────────────────────────────
// A Threads use case on a Meta app has its OWN app id + secret (Meta dashboard → Use cases → Threads API → Settings),
// distinct from the Facebook Login one. THREADS_APP_* wins; META_APP_* is the fallback for apps that share them.
export function threadsAppConfig(): { appId: string; appSecret: string } | null {
  const appId = (process.env.THREADS_APP_ID || process.env.META_APP_ID || '').trim();
  const appSecret = (process.env.THREADS_APP_SECRET || process.env.META_APP_SECRET || '').trim();
  return appId && appSecret ? { appId, appSecret } : null;
}

/** Scopes asked for at sign-in. Discovery + search need Meta app review, so they're opt-in via THREADS_EXTRA_SCOPES. */
export function threadsScopes(): string {
  const base = ['threads_basic', 'threads_content_publish', 'threads_read_replies', 'threads_manage_replies', 'threads_delete'];
  const extra = (process.env.THREADS_EXTRA_SCOPES || '').split(/[\s,]+/).filter(s => /^threads_[a-z_]+$/.test(s));
  return [...new Set([...base, ...extra])].join(',');
}

// ─── HTTP helper ─────────────────────────────────────────────────────────────

function toError(status: number, body: any): FediverseError {
  const err = body?.error ?? {};
  const msg = String(err.error_user_msg || err.message || `Threads ${status}`);
  // Meta returns OAuth problems as 400 with type OAuthException / code 190.
  if (status === 401 || err.code === 190 || err.type === 'OAuthException' && /token|session/i.test(msg)) {
    return new FediverseError('threads', 'AUTH_EXPIRED', 'Your Threads connection expired. Reconnect Threads in Settings → Networks.');
  }
  if (status === 429 || err.code === 4 || err.code === 17 || err.code === 32) return new FediverseError('threads', 'RATE_LIMITED', 'Threads is rate limiting — try again in a minute.', 60);
  if (err.code === 10 || /permission/i.test(msg)) return new FediverseError('threads', 'UNSUPPORTED', msg);
  if (status === 404) return new FediverseError('threads', 'NOT_FOUND', msg);
  return new FediverseError('threads', 'API_ERROR', msg);
}

async function tFetch(
  path: string,
  token: string,
  init: { method?: 'GET' | 'POST' | 'DELETE'; form?: Record<string, string | undefined> } = {},
): Promise<any> {
  const method = init.method ?? 'GET';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(init.form ?? {})) if (v !== undefined && v !== '') params.set(k, v);
  params.set('access_token', token);
  const url = method === 'GET' || method === 'DELETE'
    ? `${BASE}${path}${path.includes('?') ? '&' : '?'}${params}`
    : `${BASE}${path}`;
  const res = await fetch(url, {
    method,
    ...(method === 'POST' ? { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() } : {}),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.error) throw toError(res.status, body);
  return body;
}

// ─── OAuth token lifecycle ───────────────────────────────────────────────────

/** Authorization code → short-lived token → 60-day token. */
export async function threadsExchangeCode(code: string, redirectUri: string): Promise<{ userId: string; creds: FediverseCredentials }> {
  const cfg = threadsAppConfig();
  if (!cfg) throw new FediverseError('threads', 'API_ERROR', 'Threads sign-in is not configured on this server.');
  const shortRes = await fetch(`${GRAPH}/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cfg.appId, client_secret: cfg.appSecret, grant_type: 'authorization_code', redirect_uri: redirectUri, code }).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const short: any = await shortRes.json().catch(() => ({}));
  if (!shortRes.ok || !short.access_token) throw toError(shortRes.status, short);
  const creds = await threadsExchangeToken(String(short.access_token), cfg.appSecret);
  return { userId: String(short.user_id ?? ''), creds: { ...creds, did: String(short.user_id ?? '') || undefined } };
}

/** Short-lived token → long-lived (60 days). */
export async function threadsExchangeToken(shortLivedToken: string, appSecret: string): Promise<FediverseCredentials> {
  const res = await fetch(`${GRAPH}/access_token?${new URLSearchParams({ grant_type: 'th_exchange_token', client_secret: appSecret, access_token: shortLivedToken })}`, { signal: AbortSignal.timeout(15_000) });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw toError(res.status, data);
  return { accessToken: String(data.access_token), expiresAt: Date.now() + Number(data.expires_in ?? 5_184_000) * 1000, refreshedAt: Date.now() };
}

export async function threadsRefreshToken(longLivedToken: string): Promise<FediverseCredentials> {
  const res = await fetch(`${GRAPH}/refresh_access_token?${new URLSearchParams({ grant_type: 'th_refresh_token', access_token: longLivedToken })}`, { signal: AbortSignal.timeout(15_000) });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw toError(res.status, data);
  return { accessToken: String(data.access_token), expiresAt: Date.now() + Number(data.expires_in ?? 5_184_000) * 1000 };
}

const DAY = 86_400_000;
/**
 * Long-lived Threads tokens last 60 days and can be refreshed once they're ≥24h old. Refresh any token past the
 * halfway mark so an account that's used even occasionally never lapses. Mutates `creds`; true = persist it.
 */
export async function threadsRefreshIfNeeded(creds: FediverseCredentials): Promise<boolean> {
  if (!creds.accessToken || !creds.expiresAt) return false;
  const now = Date.now();
  if (creds.expiresAt <= now) return false;                      // already dead — only a reconnect helps
  if (creds.expiresAt - now > 30 * DAY) return false;            // plenty left
  if (creds.refreshedAt && now - creds.refreshedAt < DAY) return false; // Meta refuses tokens younger than 24h
  const next = await threadsRefreshToken(creds.accessToken);
  creds.accessToken = next.accessToken;
  creds.expiresAt = next.expiresAt;
  creds.refreshedAt = now;
  return true;
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

const THREAD_FIELDS = 'id,text,timestamp,permalink,username,media_type,media_url,thumbnail_url,shortcode,is_quote_post,children{id,media_type,media_url,thumbnail_url},link_attachment_url,has_replies,root_post{id},replied_to{id}';
const PROFILE_FIELDS = 'id,username,name,threads_profile_picture_url,threads_biography,is_verified';
const LOOKUP_FIELDS = 'username,name,profile_picture_url,biography,is_verified,follower_count,likes_count,quotes_count,replies_count,reposts_count,views_count';

type Raw = Record<string, any>;

function mapMedia(t: Raw): FediversePost['media'] {
  const type = String(t.media_type ?? '').toUpperCase();
  if (type === 'CAROUSEL_ALBUM') return (t.children?.data ?? []).flatMap((c: Raw) => mapMedia(c));
  if (type === 'TEXT_POST' || type === 'REPOST_FACADE' || !t.media_url && !t.thumbnail_url) return [];
  const isVideo = type === 'VIDEO';
  return [{ type: isVideo ? 'video' : 'image', url: String(t.media_url ?? t.thumbnail_url), previewUrl: t.thumbnail_url ? String(t.thumbnail_url) : undefined }];
}

export function mapThread(t: Raw, accountId: string, author?: { name?: string; avatarUrl?: string }): FediversePost {
  const text = String(t.text ?? '');
  const username = String(t.username ?? '');
  const url = String(t.permalink ?? (t.shortcode ? `https://www.threads.com/@${username}/post/${t.shortcode}` : `https://www.threads.com/@${username}`));
  return {
    id: String(t.id),
    uri: url,
    protocol: 'threads',
    accountId,
    authorHandle: `@${username}`,
    authorDisplayName: String(author?.name || username),
    authorAvatarUrl: author?.avatarUrl,
    content: text,
    contentText: text,
    createdAt: t.timestamp ? new Date(String(t.timestamp)).getTime() : Date.now(),
    url,
    replyCount: Number(t.replies_count ?? 0),
    repostCount: Number(t.reposts_count ?? 0),
    likeCount: Number(t.like_count ?? t.likes ?? 0),
    isLiked: false,
    isReposted: false,
    isBookmarked: false,
    inReplyToId: t.replied_to?.id ? String(t.replied_to.id) : undefined,
    media: mapMedia(t),
  };
}

function mapProfile(p: Raw): FediverseProfile {
  const username = String(p.username ?? '');
  return {
    id: String(p.id ?? username),
    protocol: 'threads',
    handle: `@${username}`,
    displayName: String(p.name || username),
    bio: String(p.threads_biography ?? p.biography ?? ''),
    avatarUrl: String(p.threads_profile_picture_url ?? p.profile_picture_url ?? ''),
    followersCount: Number(p.follower_count ?? p.followers_count ?? 0),
    followingCount: 0,
    postsCount: 0,
    url: `https://www.threads.com/@${username}`,
  };
}

// ─── Publishing ──────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Wait until Meta has finished fetching/transcoding a container. Video can take a while; text is near-instant. */
async function waitForContainer(id: string, token: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let delay = 800;
  for (;;) {
    const s = await tFetch(`/${id}?fields=status,error_message`, token);
    const status = String(s.status ?? '');
    if (status === 'FINISHED' || status === 'PUBLISHED') return;
    if (status === 'ERROR' || status === 'EXPIRED') {
      throw new FediverseError('threads', 'API_ERROR', `Threads could not process the media${s.error_message ? ` (${String(s.error_message).toLowerCase().replace(/_/g, ' ')})` : ''}.`);
    }
    if (Date.now() > deadline) throw new FediverseError('threads', 'API_ERROR', 'Threads is still processing the media — try again shortly.');
    await sleep(delay);
    delay = Math.min(delay * 1.6, 5000);
  }
}

export interface ThreadsPostOptions extends CreatePostOptions {
  /** Who may reply: everyone | accounts_you_follow | mentioned_only. */
  replyControl?: 'everyone' | 'accounts_you_follow' | 'mentioned_only';
}

function replyControlFrom(o?: ThreadsPostOptions): string | undefined {
  if (o?.replyControl) return o.replyControl;
  switch (o?.replyGate) {
    case 'mentioned': case 'nobody': return 'mentioned_only';
    case 'following': return 'accounts_you_follow';
    default: return undefined; // 'followers' has no Threads equivalent — leave replies open rather than over-restrict
  }
}

/** Create + publish a post: text, a photo or video, a carousel, or a text post with a link preview. */
export async function threadsPublish(creds: FediverseCredentials, text: string, o: ThreadsPostOptions = {}): Promise<{ id: string; url: string }> {
  const token = creds.accessToken;
  const body = text.length > THREADS_TEXT_LIMIT ? `${text.slice(0, THREADS_TEXT_LIMIT - 1)}…` : text;
  const images = (o.images ?? []).filter(i => /^https:\/\//.test(i.url)).slice(0, THREADS_CAROUSEL_MAX);
  const video = o.video && /^https:\/\//.test(o.video.url) ? o.video : undefined;
  const common = { reply_to_id: o.inReplyToId, reply_control: replyControlFrom(o) };
  const items = [...images.map(i => ({ kind: 'IMAGE' as const, url: i.url, alt: i.alt })), ...(video ? [{ kind: 'VIDEO' as const, url: video.url, alt: video.alt }] : [])];

  let creationId: string;
  if (items.length > 1) {
    const children: string[] = [];
    for (const it of items) {
      const c = await tFetch('/me/threads', token, { method: 'POST', form: {
        media_type: it.kind, is_carousel_item: 'true',
        ...(it.kind === 'IMAGE' ? { image_url: it.url } : { video_url: it.url }),
        alt_text: it.alt?.slice(0, 1000),
      } });
      children.push(String(c.id));
    }
    await Promise.all(children.map(id => waitForContainer(id, token, items.some(i => i.kind === 'VIDEO') ? 5 * 60_000 : 60_000)));
    const c = await tFetch('/me/threads', token, { method: 'POST', form: { media_type: 'CAROUSEL', children: children.join(','), text: body, ...common } });
    creationId = String(c.id);
  } else if (items.length === 1) {
    const it = items[0];
    const c = await tFetch('/me/threads', token, { method: 'POST', form: {
      media_type: it.kind, text: body, ...common, alt_text: it.alt?.slice(0, 1000),
      ...(it.kind === 'IMAGE' ? { image_url: it.url } : { video_url: it.url }),
    } });
    creationId = String(c.id);
  } else {
    const c = await tFetch('/me/threads', token, { method: 'POST', form: { media_type: 'TEXT', text: body, ...common, link_attachment: o.link?.uri } });
    creationId = String(c.id);
  }
  await waitForContainer(creationId, token, video ? 5 * 60_000 : 60_000);
  const published = await tFetch('/me/threads_publish', token, { method: 'POST', form: { creation_id: creationId } });
  const id = String(published.id);
  let url = `https://www.threads.com/t/${id}`;
  try { const m = await tFetch(`/${id}?fields=permalink`, token); if (m.permalink) url = String(m.permalink); } catch { /* permalink is cosmetic */ }
  return { id, url };
}

// ─── Reads beyond the adapter interface (routes/threadsClient.ts) ────────────

export async function threadsGetMe(creds: FediverseCredentials): Promise<FediverseProfile> {
  return mapProfile(await tFetch(`/me?fields=${PROFILE_FIELDS}`, creds.accessToken));
}

export async function threadsGetOwnPosts(creds: FediverseCredentials, accountId: string, cursor?: string): Promise<{ posts: FediversePost[]; cursor?: string }> {
  const me = await threadsGetMe(creds).catch(() => null);
  const data = await tFetch(`/me/threads?fields=${THREAD_FIELDS}&limit=25${cursor ? `&after=${encodeURIComponent(cursor)}` : ''}`, creds.accessToken);
  return {
    posts: (data.data ?? []).map((t: Raw) => mapThread(t, accountId, { name: me?.displayName, avatarUrl: me?.avatarUrl })),
    cursor: data.paging?.cursors?.after && data.paging?.next ? String(data.paging.cursors.after) : undefined,
  };
}

export async function threadsGetOwnReplies(creds: FediverseCredentials, accountId: string): Promise<FediversePost[]> {
  const data = await tFetch(`/me/replies?fields=${THREAD_FIELDS}&limit=25`, creds.accessToken);
  return (data.data ?? []).map((t: Raw) => mapThread(t, accountId));
}

export async function threadsGetConversation(creds: FediverseCredentials, accountId: string, postId: string): Promise<{ post: FediversePost; replies: FediversePost[] }> {
  const [root, conv] = await Promise.all([
    tFetch(`/${encodeURIComponent(postId)}?fields=${THREAD_FIELDS}`, creds.accessToken),
    tFetch(`/${encodeURIComponent(postId)}/conversation?fields=${THREAD_FIELDS}&reverse=false`, creds.accessToken).catch(() => ({ data: [] })),
  ]);
  return { post: mapThread(root, accountId), replies: (conv.data ?? []).map((t: Raw) => mapThread(t, accountId)) };
}

/** Public profile by username (threads_profile_discovery). */
export async function threadsLookupProfile(creds: FediverseCredentials, username: string): Promise<FediverseProfile> {
  return mapProfile(await tFetch(`/profile_lookup?username=${encodeURIComponent(username)}&fields=${LOOKUP_FIELDS}`, creds.accessToken));
}

export async function threadsGetProfilePosts(creds: FediverseCredentials, accountId: string, username: string): Promise<FediversePost[]> {
  const [prof, data] = await Promise.all([
    threadsLookupProfile(creds, username).catch(() => null),
    tFetch(`/profile_posts?username=${encodeURIComponent(username)}&fields=${THREAD_FIELDS}&limit=25`, creds.accessToken),
  ]);
  return (data.data ?? []).map((t: Raw) => mapThread(t, accountId, { name: prof?.displayName, avatarUrl: prof?.avatarUrl }));
}

/** Keyword / tag search (threads_keyword_search). */
export async function threadsSearch(creds: FediverseCredentials, accountId: string, q: string, type: 'TOP' | 'RECENT' = 'TOP'): Promise<FediversePost[]> {
  const data = await tFetch(`/keyword_search?q=${encodeURIComponent(q)}&search_type=${type}&fields=${THREAD_FIELDS}&limit=25`, creds.accessToken);
  return (data.data ?? []).map((t: Raw) => mapThread(t, accountId));
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export const threadsAdapter: FediverseAdapter = {
  protocol: 'threads',

  async verifyCredentials(creds) {
    return threadsGetMe(creds);
  },

  async getHomeTimeline() {
    throw new FediverseError('threads', 'UNSUPPORTED', 'Threads does not provide a home timeline via its API');
  },

  async getPublicTimeline(creds) {
    // No public "discover" endpoint exists; the account's own posts are what Threads lets us show.
    return threadsGetOwnPosts(creds, creds.did ?? 'local');
  },

  async createPost(creds, content, options?: CreatePostOptions) {
    const { id, url } = await threadsPublish(creds, content, options);
    return {
      id, uri: url, protocol: 'threads', accountId: creds.did ?? 'local',
      authorHandle: creds.handle ? `@${creds.handle}` : '', authorDisplayName: creds.handle ?? '',
      content, contentText: content, createdAt: Date.now(), url,
      replyCount: 0, repostCount: 0, likeCount: 0, isLiked: false, isReposted: false, isBookmarked: false, media: [],
    };
  },

  async deletePost(creds, postId) {
    await tFetch(`/${encodeURIComponent(postId)}`, creds.accessToken, { method: 'DELETE' });
  },

  async likePost() {
    throw new FediverseError('threads', 'UNSUPPORTED', 'Liking is not available through the Threads API — open the post on Threads to like it.');
  },

  async unlikePost() {
    throw new FediverseError('threads', 'UNSUPPORTED', 'Liking is not available through the Threads API.');
  },

  async repost(creds, post) {
    await tFetch(`/${encodeURIComponent(post.id)}/repost`, creds.accessToken, { method: 'POST' });
    return { isReposted: true, repostCount: (post.repostCount ?? 0) + 1 };
  },

  async unrepost() {
    throw new FediverseError('threads', 'UNSUPPORTED', 'Undoing a repost is only available on Threads itself.');
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
    const name = handleOrId.replace(/^@/, '');
    if (/^\d+$/.test(name)) return mapProfile(await tFetch(`/${name}?fields=${PROFILE_FIELDS}`, creds.accessToken));
    return threadsLookupProfile(creds, name);
  },
};
