// blueskyClient — the read/write surface behind Plajah's in-app Bluesky screens (profiles, threads, search, graph,
// custom feeds, moderation). Mounted in server.ts at /api/fediverse/bluesky/c.
//
// Every route acts as the caller's own connected Bluesky account (credentials never leave the server). `accountId`
// picks one when the user has linked several; otherwise the first active Bluesky account is used.

import { Router, type Request, type Response } from 'express';
import { verifyIdToken } from '../services/firebaseAdminRest';
import { decentralizedAuth } from '../services/fediverse/auth';
import {
  blueskyadapter, bskyGetProfile, bskyGetAuthorFeed, bskyGetThread, bskySearchPosts, bskySearchActors,
  bskyGetFollowers, bskyListFollows, bskySuggestedFollows, bskySetMuted, bskySetBlocked, bskyGetSavedFeeds, bskyGetFeed,
  bskyBookmarkPost, bskyUnbookmarkPost, bskyGetBookmarks, bskySetLiveStatus, bskySetPostInteractionGates,
  bskyGetTrendingTopics, bskyTypeaheadActors, bskyGetActorStarterPacks, bskySearchStarterPacks, bskyGetStarterPack,
  bskyGetPostQuotes, bskyGetPostLikes, bskyGetPostRepostedBy, bskyStartConversation, bskyReactToMessage, bskyAcceptConversation,
  type AuthorFeedFilter,
} from '../services/fediverse/bluesky';
import type { FediverseCredentials, BlueskyReplyGate } from '../services/fediverse/types';

export const blueskyClientRouter = Router();

const ACTOR = /^(@?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+|did:[a-z]+:[\w.:%-]{1,200})$/i;
const AT_URI = /^at:\/\/[\w.:%-]+\/[\w.]+\/[\w.~-]+$/;
const FILTERS: AuthorFeedFilter[] = ['posts_with_replies', 'posts_no_replies', 'posts_with_media', 'posts_and_author_threads'];

const str = (v: unknown, max = 300) => (typeof v === 'string' && v.length <= max ? v : undefined);
const bad = (res: Response, msg: string) => res.status(400).json({ error: msg });

/** Resolve the caller + their Bluesky credentials, run `fn`, and turn adapter errors into clean JSON. */
async function withBluesky(req: Request, res: Response, fn: (creds: FediverseCredentials, uid: string) => Promise<unknown>) {
  try {
    const auth = req.headers.authorization;
    const uid = auth?.startsWith('Bearer ') ? await verifyIdToken(auth.slice(7)) : null;
    if (!uid) return res.status(401).json({ error: 'Sign in first.' });
    const accounts = await decentralizedAuth.loadAccounts(uid, auth!.slice(7));
    const want = str((req.query.accountId ?? req.body?.accountId) as unknown, 80);
    const acct = accounts.find(a => a.protocol === 'bluesky' && a.isActive && (!want || a.id === want));
    if (!acct) return res.status(404).json({ error: 'Connect a Bluesky account first.', code: 'NO_ACCOUNT' });
    res.json(await fn(acct.credentials, uid));
  } catch (e: any) {
    const code = String(e?.code ?? '');
    const status = code === 'AUTH_EXPIRED' ? 401 : code === 'RATE_LIMITED' ? 429 : code === 'NOT_FOUND' ? 404 : 502;
    if (status === 502) console.error('[bsky-client]', req.path, e?.message || e);
    res.status(status).json({ error: String(e?.message || 'Bluesky request failed').replace(/^\[bluesky\]\s*\w+:\s*/, ''), code });
  }
}

blueskyClientRouter.get('/profile', (req, res) => {
  const actor = str(req.query.actor, 260); if (!actor || !ACTOR.test(actor)) return bad(res, 'actor required');
  withBluesky(req, res, (c) => bskyGetProfile(c, actor));
});

blueskyClientRouter.get('/author-feed', (req, res) => {
  const actor = str(req.query.actor, 260); if (!actor || !ACTOR.test(actor)) return bad(res, 'actor required');
  const filter = FILTERS.find(f => f === req.query.filter);
  withBluesky(req, res, (c) => bskyGetAuthorFeed(c, actor, { filter, cursor: str(req.query.cursor, 400) }));
});

blueskyClientRouter.get('/thread', (req, res) => {
  const uri = str(req.query.uri, 400); if (!uri || !AT_URI.test(uri)) return bad(res, 'valid at:// uri required');
  withBluesky(req, res, (c) => bskyGetThread(c, uri));
});

blueskyClientRouter.get('/search/posts', (req, res) => {
  const q = str(req.query.q, 300)?.trim(); if (!q) return bad(res, 'q required');
  withBluesky(req, res, (c) => bskySearchPosts(c, q, { sort: req.query.sort === 'latest' ? 'latest' : 'top', cursor: str(req.query.cursor, 400) }));
});

blueskyClientRouter.get('/search/actors', (req, res) => {
  const q = str(req.query.q, 200)?.trim(); if (!q) return bad(res, 'q required');
  withBluesky(req, res, (c) => bskySearchActors(c, q, str(req.query.cursor, 400)));
});

blueskyClientRouter.get('/followers', (req, res) => {
  const actor = str(req.query.actor, 260); if (!actor || !ACTOR.test(actor)) return bad(res, 'actor required');
  withBluesky(req, res, (c) => bskyGetFollowers(c, actor, str(req.query.cursor, 400)));
});

blueskyClientRouter.get('/follows', (req, res) => {
  const actor = str(req.query.actor, 260); if (!actor || !ACTOR.test(actor)) return bad(res, 'actor required');
  withBluesky(req, res, (c) => bskyListFollows(c, actor, str(req.query.cursor, 400)));
});

blueskyClientRouter.get('/suggestions', (req, res) => withBluesky(req, res, (c) => bskySuggestedFollows(c).then(profiles => ({ profiles }))));

blueskyClientRouter.get('/feeds', (req, res) => withBluesky(req, res, (c) => bskyGetSavedFeeds(c).then(feeds => ({ feeds }))));

blueskyClientRouter.get('/feed', (req, res) => {
  const uri = str(req.query.uri, 400); if (!uri || !AT_URI.test(uri)) return bad(res, 'valid feed uri required');
  withBluesky(req, res, (c) => bskyGetFeed(c, uri, str(req.query.cursor, 400)));
});

blueskyClientRouter.post('/follow', (req, res) => {
  const did = str(req.body?.did, 260); if (!did || !/^did:/.test(did)) return bad(res, 'did required');
  withBluesky(req, res, (c) => blueskyadapter.followProfile(c, { id: did, did, handle: '' }));
});

blueskyClientRouter.post('/unfollow', (req, res) => {
  const followRecordUri = str(req.body?.followRecordUri, 400); if (!followRecordUri || !AT_URI.test(followRecordUri)) return bad(res, 'followRecordUri required');
  withBluesky(req, res, async (c) => { await blueskyadapter.unfollowProfile(c, { id: '', handle: '', followRecordUri }); return { ok: true }; });
});

blueskyClientRouter.post('/mute', (req, res) => {
  const actor = str(req.body?.actor, 260); if (!actor || !ACTOR.test(actor)) return bad(res, 'actor required');
  withBluesky(req, res, async (c) => { await bskySetMuted(c, actor, req.body?.muted !== false); return { ok: true }; });
});

blueskyClientRouter.post('/block', (req, res) => {
  const did = str(req.body?.did, 260); if (!did || !/^did:/.test(did)) return bad(res, 'did required');
  const blockUri = str(req.body?.blockUri, 400);
  withBluesky(req, res, (c) => bskySetBlocked(c, did, req.body?.blocked !== false, blockUri));
});

/** Quote a Bluesky post (with the user's own text). */
blueskyClientRouter.post('/quote', (req, res) => {
  const text = str(req.body?.text, 2000)?.trim(); const uri = str(req.body?.uri, 400); const cid = str(req.body?.cid, 120);
  if (!text || !uri || !cid || !AT_URI.test(uri)) return bad(res, 'text, uri and cid required');
  withBluesky(req, res, async (c) => ({ post: await blueskyadapter.createPost(c, text, { quote: { uri, cid } }) }));
});

// ─── Latest AT Protocol (v0.19+) Endpoints ───────────────────────────────────

blueskyClientRouter.get('/bookmarks', (req, res) => {
  withBluesky(req, res, (c) => bskyGetBookmarks(c, str(req.query.cursor, 400)));
});

blueskyClientRouter.post('/bookmark', (req, res) => {
  const uri = str(req.body?.uri, 400); const cid = str(req.body?.cid, 120);
  if (!uri || !cid || !AT_URI.test(uri)) return bad(res, 'valid uri and cid required');
  withBluesky(req, res, (c) => bskyBookmarkPost(c, uri, cid));
});

blueskyClientRouter.post('/unbookmark', (req, res) => {
  const uri = str(req.body?.uri, 400);
  if (!uri || !AT_URI.test(uri)) return bad(res, 'valid uri required');
  withBluesky(req, res, (c) => bskyUnbookmarkPost(c, uri));
});

blueskyClientRouter.post('/live-status', (req, res) => {
  const active = Boolean(req.body?.active);
  const streamUrl = str(req.body?.streamUrl, 500);
  const title = str(req.body?.title, 160);
  const description = str(req.body?.description, 300);
  const durationMinutes = Number(req.body?.durationMinutes) || 60;
  withBluesky(req, res, (c) => bskySetLiveStatus(c, { active, streamUrl, title, description, durationMinutes }));
});

blueskyClientRouter.post('/gates', (req, res) => {
  const postUri = str(req.body?.postUri, 400);
  if (!postUri || !AT_URI.test(postUri)) return bad(res, 'valid postUri required');
  const replyGate = str(req.body?.replyGate, 32) as BlueskyReplyGate | undefined;
  const allowQuote = typeof req.body?.allowQuote === 'boolean' ? req.body.allowQuote : undefined;
  const hiddenReplies = Array.isArray(req.body?.hiddenReplies) ? req.body.hiddenReplies.filter((u: unknown): u is string => typeof u === 'string' && AT_URI.test(u)) : undefined;
  const detachedEmbeddingUris = Array.isArray(req.body?.detachedEmbeddingUris) ? req.body.detachedEmbeddingUris.filter((u: unknown): u is string => typeof u === 'string' && AT_URI.test(u)) : undefined;
  withBluesky(req, res, (c) => bskySetPostInteractionGates(c, postUri, { replyGate, allowQuote, hiddenReplies, detachedEmbeddingUris }));
});

blueskyClientRouter.get('/trending', (req, res) => {
  withBluesky(req, res, (c) => bskyGetTrendingTopics(c, 12));
});

blueskyClientRouter.get('/search/typeahead', (req, res) => {
  const q = str(req.query.q, 120)?.trim();
  if (!q) return res.json({ profiles: [] });
  withBluesky(req, res, (c) => bskyTypeaheadActors(c, q, 8).then(profiles => ({ profiles })));
});

blueskyClientRouter.get('/starter-packs', (req, res) => {
  const actor = str(req.query.actor, 260);
  if (!actor || !ACTOR.test(actor)) return bad(res, 'actor required');
  withBluesky(req, res, (c) => bskyGetActorStarterPacks(c, actor, str(req.query.cursor, 400)));
});

blueskyClientRouter.get('/starter-packs/search', (req, res) => {
  const q = str(req.query.q, 200)?.trim();
  if (!q) return bad(res, 'q required');
  withBluesky(req, res, (c) => bskySearchStarterPacks(c, q, str(req.query.cursor, 400)));
});

blueskyClientRouter.get('/starter-pack', (req, res) => {
  const uri = str(req.query.uri, 400);
  if (!uri || !AT_URI.test(uri)) return bad(res, 'valid starterPack uri required');
  withBluesky(req, res, (c) => bskyGetStarterPack(c, uri));
});

blueskyClientRouter.get('/post/quotes', (req, res) => {
  const uri = str(req.query.uri, 400);
  if (!uri || !AT_URI.test(uri)) return bad(res, 'valid post uri required');
  withBluesky(req, res, (c) => bskyGetPostQuotes(c, uri, str(req.query.cursor, 400)));
});

blueskyClientRouter.get('/post/likes', (req, res) => {
  const uri = str(req.query.uri, 400);
  if (!uri || !AT_URI.test(uri)) return bad(res, 'valid post uri required');
  withBluesky(req, res, (c) => bskyGetPostLikes(c, uri, str(req.query.cursor, 400)));
});

blueskyClientRouter.get('/post/reposts', (req, res) => {
  const uri = str(req.query.uri, 400);
  if (!uri || !AT_URI.test(uri)) return bad(res, 'valid post uri required');
  withBluesky(req, res, (c) => bskyGetPostRepostedBy(c, uri, str(req.query.cursor, 400)));
});

blueskyClientRouter.post('/dm/start', (req, res) => {
  const did = str(req.body?.did, 260);
  if (!did || !/^did:/.test(did)) return bad(res, 'did required');
  withBluesky(req, res, (c) => bskyStartConversation(c, did));
});

blueskyClientRouter.post('/dm/react', (req, res) => {
  const convoId = str(req.body?.convoId, 160);
  const messageId = str(req.body?.messageId, 160);
  const value = str(req.body?.value, 32);
  if (!convoId || !messageId || !value) return bad(res, 'convoId, messageId, and value required');
  withBluesky(req, res, (c) => bskyReactToMessage(c, convoId, messageId, value, Boolean(req.body?.remove)));
});

blueskyClientRouter.post('/dm/accept', (req, res) => {
  const convoId = str(req.body?.convoId, 160);
  if (!convoId) return bad(res, 'convoId required');
  withBluesky(req, res, (c) => bskyAcceptConversation(c, convoId));
});

