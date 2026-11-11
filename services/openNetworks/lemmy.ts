// Lemmy bridge — federated forums for org/department boards and Gamer Network communities.
//
//   connect:  POST /api/v3/user/login { username_or_email, password, totp_2fa_token? } → { jwt }  (password not kept)
//   resolve:  GET  /api/v3/community?name=<name[@instance]>                         → community_view.community.id
//   post:     POST /api/v3/post { name, community_id, body?, url? }  with Authorization: Bearer <jwt>
//   read:     GET  /api/v3/post/list?community_name=<name>&sort=New&limit=N          (public, no account)
//
// API notes: Bearer auth on the v3 API is Lemmy 0.19+. Older 0.18 servers expected `auth` in the body/query; we also
// send `auth` in the post body as a fallback (0.19 ignores unknown fields). Lemmy 1.0 introduces /api/v4 — not
// covered here; v3 stays available on 0.19.x which is what most instances run today.

import { type NetDeps, OpenNetworkError, netFetch, clean, stripHtml, safeLink, remoteError } from './common';

const COMMUNITY_RE = /^[a-z0-9_]{1,64}(@[a-z0-9.-]{1,253})?$/i;

export function parseCommunity(raw: unknown): string {
  const s = clean(raw, 320).replace(/^!/, '');
  if (!COMMUNITY_RE.test(s)) throw new OpenNetworkError(400, 'Community name looks like "name" or "name@instance"', 'bad-community');
  return s;
}

export async function lemmyLogin(deps: NetDeps, server: string, user: string, password: string, totp?: string): Promise<{ jwt: string; handle: string }> {
  if (!user || !password) throw new OpenNetworkError(400, 'Username and password required');
  const r = await netFetch(deps, `${server}/api/v3/user/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ username_or_email: clean(user, 254), password: String(password).slice(0, 1024), ...(totp ? { totp_2fa_token: clean(totp, 12) } : {}) }),
  });
  const jwt = (r.json as any)?.jwt;
  if (!r.ok || typeof jwt !== 'string' || !jwt) {
    const msg = remoteError(r, 'Login failed');
    if (/missing_totp|totp/i.test(msg)) throw new OpenNetworkError(401, 'This account uses two-factor; enter the 6-digit code', 'totp');
    if (/email_not_verified|registration_application/i.test(msg)) throw new OpenNetworkError(401, 'This account is not approved/verified on that instance yet', 'auth');
    throw new OpenNetworkError(401, msg === 'incorrect_login' ? 'Wrong username or password' : msg, 'auth');
  }
  return { jwt, handle: clean(user, 100) };
}

export async function lemmyCommunityId(deps: NetDeps, server: string, community: string, jwt?: string): Promise<{ id: number; title?: string; actorId?: string }> {
  const r = await netFetch(deps, `${server}/api/v3/community?name=${encodeURIComponent(community)}`, {
    headers: { Accept: 'application/json', ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) },
  });
  const c = (r.json as any)?.community_view?.community;
  if (!r.ok || typeof c?.id !== 'number') throw new OpenNetworkError(404, `Community "${community}" not found on that instance`, 'not-found');
  return { id: c.id, title: clean(c.title, 200) || undefined, actorId: safeLink(c.actor_id) };
}

export interface LemmyPostInput { community: string; title: string; body?: string; url?: string }

export async function lemmyCreatePost(deps: NetDeps, server: string, jwt: string, input: LemmyPostInput): Promise<{ id: number; url?: string }> {
  const title = clean(input.title, 200);
  if (!title) throw new OpenNetworkError(400, 'Title required');
  const community = await lemmyCommunityId(deps, server, parseCommunity(input.community), jwt);
  const link = input.url ? safeLink(input.url) : undefined;
  if (input.url && !link) throw new OpenNetworkError(400, 'Link must be http(s)');
  const r = await netFetch(deps, `${server}/api/v3/post`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ name: title, community_id: community.id, body: clean(input.body, 10_000) || undefined, url: link, auth: jwt }),
  });
  const pv = (r.json as any)?.post_view?.post;
  if (!r.ok || typeof pv?.id !== 'number') {
    const msg = remoteError(r, `Lemmy answered HTTP ${r.status}`);
    throw new OpenNetworkError(r.status === 401 || /not_logged_in|incorrect_login/.test(msg) ? 401 : 502, msg, r.status === 401 ? 'auth' : 'remote');
  }
  return { id: pv.id, url: safeLink(pv.ap_id) };
}

export interface LemmyPostCard {
  id: number; title: string; body?: string; url?: string; link: string; author: string; authorUrl?: string;
  community: string; score: number; comments: number; published?: string; nsfw: boolean; thumbnail?: string;
}

/** Public read — no account needed. NSFW and removed/deleted posts are dropped. */
export async function lemmyListPosts(deps: NetDeps, server: string, community: string, opts: { limit?: number; sort?: string; page?: number } = {}): Promise<LemmyPostCard[]> {
  const name = parseCommunity(community);
  const limit = Math.max(1, Math.min(50, Math.floor(opts.limit ?? 20)));
  const sort = ['New', 'Hot', 'Active', 'TopDay', 'TopWeek'].includes(String(opts.sort)) ? String(opts.sort) : 'New';
  const page = Math.max(1, Math.min(50, Math.floor(opts.page ?? 1)));
  const r = await netFetch(deps, `${server}/api/v3/post/list?community_name=${encodeURIComponent(name)}&sort=${sort}&limit=${limit}&page=${page}&type_=All`, {
    headers: { Accept: 'application/json' },
  });
  const posts = (r.json as any)?.posts;
  if (!r.ok || !Array.isArray(posts)) throw new OpenNetworkError(r.status === 404 ? 404 : 502, remoteError(r, `Couldn't read ${name}`), 'remote');
  const out: LemmyPostCard[] = [];
  for (const pv of posts) {
    const p = pv?.post;
    if (!p || typeof p.id !== 'number' || p.deleted || p.removed || p.nsfw || pv?.community?.nsfw) continue;
    const link = safeLink(p.ap_id) ?? `${server}/post/${p.id}`;
    out.push({
      id: p.id,
      title: clean(p.name, 300),
      body: p.body ? stripHtml(p.body, 600) : undefined,
      url: safeLink(p.url),
      link,
      author: clean(pv?.creator?.display_name || pv?.creator?.name, 100),
      authorUrl: safeLink(pv?.creator?.actor_id),
      community: clean(pv?.community?.name, 100),
      score: Number(pv?.counts?.score) || 0,
      comments: Number(pv?.counts?.comments) || 0,
      published: typeof p.published === 'string' ? p.published : undefined,
      nsfw: false,
      thumbnail: safeLink(p.thumbnail_url),
    });
  }
  return out;
}
