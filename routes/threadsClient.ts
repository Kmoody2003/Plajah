// threadsClient — the read/write surface behind Plajah's Threads screens. Mounted at /api/fediverse/threads/c.
//
// Signed-in, acting as the caller's connected Threads account (token never leaves the server):
//   GET    /me                      — profile of the connected account
//   GET    /me/posts?cursor=        — own posts (paged)
//   GET    /me/replies              — own replies
//   GET    /post/:id                — a post + its whole conversation
//   GET    /profile?username=       — public profile    (threads_profile_discovery; 403 code SCOPE when not approved)
//   GET    /profile/posts?username= — its public posts  (same)
//   GET    /search?q=&type=TOP|RECENT (threads_keyword_search)
//   DELETE /post/:id                — delete own post
//
// No Threads account needed:
//   GET    /public/profile?username= — a Threads profile's public posts through the fediverse bridge. Threads
//          accounts that turned on "Fediverse sharing" federate over ActivityPub, so any Mastodon server can read them
//          without credentials. Used for the Threads handle on Plajah profiles.

import { Router, type Request, type Response } from 'express';
import { verifyIdToken } from '../services/firebaseAdminRest';
import { decentralizedAuth } from '../services/fediverse/auth';
import {
  threadsGetMe, threadsGetOwnPosts, threadsGetOwnReplies, threadsGetConversation, threadsLookupProfile,
  threadsGetProfilePosts, threadsSearch, threadsAdapter,
} from '../services/fediverse/threads';
import { mapStatus, mapAccount } from '../services/fediverse/mastodon';
import type { FediverseCredentials } from '../services/fediverse/types';

export const threadsClientRouter = Router();

const USERNAME = /^[A-Za-z0-9._]{1,30}$/;
const MEDIA_ID = /^\d{5,30}$/;
const cleanUser = (v: unknown) => {
  const s = typeof v === 'string' ? v.trim().replace(/^@/, '').replace(/@threads\.(net|com)$/i, '') : '';
  return USERNAME.test(s) ? s.toLowerCase() : null;
};

// ─── Public bridge (no account) ──────────────────────────────────────────────
const BRIDGE = (process.env.THREADS_FEDI_BRIDGE || 'https://mastodon.social').replace(/\/+$/, '');
const bridgeCache = new Map<string, { at: number; body: unknown }>();
const BRIDGE_TTL = 5 * 60_000;

threadsClientRouter.get('/public/profile', async (req: Request, res: Response) => {
  const username = cleanUser(req.query.username);
  if (!username) return res.status(400).json({ error: 'Enter a Threads username.' });
  const hit = bridgeCache.get(username);
  if (hit && Date.now() - hit.at < BRIDGE_TTL) { res.set('Cache-Control', 'public, max-age=120'); return res.json(hit.body); }
  try {
    const look = await fetch(`${BRIDGE}/api/v1/accounts/lookup?acct=${encodeURIComponent(`${username}@threads.net`)}`, { signal: AbortSignal.timeout(10_000) });
    if (look.status === 404) {
      const body = { profile: null, posts: [], federated: false };
      bridgeCache.set(username, { at: Date.now(), body });
      return res.json(body);
    }
    if (!look.ok) throw new Error(`bridge ${look.status}`);
    const acct: any = await look.json();
    const st = await fetch(`${BRIDGE}/api/v1/accounts/${encodeURIComponent(acct.id)}/statuses?exclude_replies=true&exclude_reblogs=true&limit=20`, { signal: AbortSignal.timeout(10_000) });
    const statuses: any[] = st.ok ? await st.json() : [];
    const profile = { ...mapAccount(acct), protocol: 'threads' as const, handle: `@${username}`, url: `https://www.threads.com/@${username}` };
    const posts = (Array.isArray(statuses) ? statuses : [])
      .filter(s => !s.sensitive)
      .map(s => ({ ...mapStatus(s, 'public'), protocol: 'threads' as const, authorHandle: `@${username}`, url: String(s.url || s.uri || profile.url) }));
    const body = { profile, posts, federated: true };
    bridgeCache.set(username, { at: Date.now(), body });
    res.set('Cache-Control', 'public, max-age=120');
    res.json(body);
  } catch (e: any) {
    if (hit) return res.json({ ...(hit.body as object), stale: true });
    res.status(502).json({ error: 'Threads is unreachable right now.', posts: [] });
  }
});

// ─── Signed-in ───────────────────────────────────────────────────────────────

async function withThreads(req: Request, res: Response, fn: (creds: FediverseCredentials, accountId: string) => Promise<unknown>) {
  try {
    const auth = req.headers.authorization;
    const uid = auth?.startsWith('Bearer ') ? await verifyIdToken(auth.slice(7)) : null;
    if (!uid) return res.status(401).json({ error: 'Sign in first.' });
    const accounts = await decentralizedAuth.loadAccounts(uid, auth!.slice(7));
    const want = typeof req.query.accountId === 'string' ? req.query.accountId : undefined;
    const acct = accounts.find(a => a.protocol === 'threads' && a.isActive && (!want || a.id === want));
    if (!acct) return res.status(404).json({ error: 'Connect a Threads account first.', code: 'NO_ACCOUNT' });
    res.json(await fn(acct.credentials, acct.id));
  } catch (e: any) {
    const code = String(e?.code ?? '');
    const status = code === 'AUTH_EXPIRED' ? 401 : code === 'RATE_LIMITED' ? 429 : code === 'NOT_FOUND' ? 404 : code === 'UNSUPPORTED' ? 403 : 502;
    if (status === 502) console.error('[threads-client]', req.path, e?.message || e);
    res.status(status).json({ error: String(e?.message || 'Threads request failed').replace(/^\[threads\]\s*\w+:\s*/, ''), code: code === 'UNSUPPORTED' ? 'SCOPE' : code });
  }
}

threadsClientRouter.get('/me', (req, res) => withThreads(req, res, c => threadsGetMe(c).then(profile => ({ profile }))));
threadsClientRouter.get('/me/posts', (req, res) => withThreads(req, res, (c, id) => threadsGetOwnPosts(c, id, typeof req.query.cursor === 'string' ? req.query.cursor.slice(0, 200) : undefined)));
threadsClientRouter.get('/me/replies', (req, res) => withThreads(req, res, (c, id) => threadsGetOwnReplies(c, id).then(posts => ({ posts }))));

threadsClientRouter.get('/post/:id', (req, res) => {
  if (!MEDIA_ID.test(req.params.id)) return res.status(400).json({ error: 'Bad post id' });
  return withThreads(req, res, (c, id) => threadsGetConversation(c, id, req.params.id));
});

threadsClientRouter.delete('/post/:id', (req, res) => {
  if (!MEDIA_ID.test(req.params.id)) return res.status(400).json({ error: 'Bad post id' });
  return withThreads(req, res, c => threadsAdapter.deletePost(c, req.params.id).then(() => ({ ok: true })));
});

threadsClientRouter.get('/profile', (req, res) => {
  const u = cleanUser(req.query.username);
  if (!u) return res.status(400).json({ error: 'Enter a Threads username.' });
  return withThreads(req, res, c => threadsLookupProfile(c, u).then(profile => ({ profile })));
});

threadsClientRouter.get('/profile/posts', (req, res) => {
  const u = cleanUser(req.query.username);
  if (!u) return res.status(400).json({ error: 'Enter a Threads username.' });
  return withThreads(req, res, (c, id) => threadsGetProfilePosts(c, id, u).then(posts => ({ posts })));
});

threadsClientRouter.get('/search', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  if (!q) return res.status(400).json({ error: 'Enter something to search for.' });
  const type = req.query.type === 'RECENT' ? 'RECENT' : 'TOP';
  return withThreads(req, res, (c, id) => threadsSearch(c, id, q, type).then(posts => ({ posts })));
});
