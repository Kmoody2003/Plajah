// ActivityPub server routes — makes every opted-in Plajah user/org followable as @handle@plajah.com from Mastodon,
// Threads, Pixelfed, Lemmy… and brings replies back.
//
// Two routers (see services/activitypub/* for the logic):
//
//   createActivityPubRouter()       PUBLIC protocol surface, mounted at the app root BEFORE the global JSON parser
//                                   (inbox Digest verification needs the exact bytes):
//     GET  /.well-known/webfinger?resource=acct:name@host
//     GET  /.well-known/host-meta
//     GET  /.well-known/nodeinfo           GET /nodeinfo/2.1
//     GET  /ap/actor                       site Application actor (signs fetches for "authorized fetch" servers)
//     GET  /ap/users/:handle               actor (browsers → the Plajah profile page)
//     GET  /ap/users/:handle/outbox        paged public posts as Create(Note)
//     GET  /ap/users/:handle/followers     count only      GET /ap/users/:handle/following  (always 0)
//     POST /ap/users/:handle/inbox         per-actor inbox     POST /ap/inbox  shared inbox
//     GET  /ap/posts/:postId               the Note (browsers → the post page)
//
//   createActivityPubOwnerRouter()  /api/activitypub (Bearer Firebase ID token):
//     GET  /me[?org=<orgId>]               status, handle, follower count, eligibility
//     POST /me  { enabled, handle?, org? } switch on/off (handle chosen once, then frozen)
//     GET  /replies/:postId                fediverse replies + like/boost counts for a post

import express, { Router, type Request, type Response, type NextFunction, type RequestHandler } from 'express';
import { AP_CONTENT_TYPE, apUrls, apHost, normalizeHandle, wantsActivityJson, actorKeyFor } from '../services/activitypub/config';
import {
  buildActor, buildInstanceActor, buildNote, buildCreate, orderedCollection, orderedCollectionPage,
  webfingerDoc, parseWebfingerResource, nodeinfoLinks, nodeinfoDoc, hostMetaXml,
} from '../services/activitypub/jsonld';
import { judgePost, postActorRef } from '../services/activitypub/policy';
import { resolveLocalActor, resolveActorKey, ensureInstanceActor, identityStatus, setIdentityEnabled, type Subject } from '../services/activitypub/actors';
import { authenticateInbound, processActivity } from '../services/activitypub/inbox';
import { defaultDeps, type ApDeps } from '../services/activitypub/deps';

type DepsSource = ApDeps | (() => Promise<ApDeps>);
const getDeps = (src?: DepsSource): Promise<ApDeps> =>
  !src ? defaultDeps() : typeof src === 'function' ? src() : Promise.resolve(src);

const SAFE_POST_ID = /^[A-Za-z0-9_-]{1,128}$/;
const OUTBOX_PAGE = 20;
const INBOX_BODY_LIMIT = '256kb';

function sendAp(res: Response, body: unknown, status = 200) {
  res.status(status).set({
    'Content-Type': `${AP_CONTENT_TYPE}; charset=utf-8`,
    'Vary': 'Accept',
    'Cache-Control': 'private, max-age=60',
    'Access-Control-Allow-Origin': '*',
  }).send(JSON.stringify(body));
}

/** Tiny per-IP fixed-window limiter (per instance). Swap for the app's limiter via opts.inboxLimiter. */
export function simpleIpLimiter(max: number, windowMs: number): RequestHandler {
  const hits = new Map<string, { start: number; n: number }>();
  return (req, res, next) => {
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const now = Date.now();
    const cur = hits.get(ip);
    if (!cur || now - cur.start > windowMs) { hits.set(ip, { start: now, n: 1 }); if (hits.size > 20_000) hits.clear(); return next(); }
    if (++cur.n > max) return res.status(429).set('Retry-After', String(Math.ceil(windowMs / 1000))).end();
    next();
  };
}

/** Raw-body parser for inboxes: keeps the exact bytes for Digest verification. Accepts any content type
 *  (activity+json, ld+json, json). If an earlier parser already consumed the body and stashed req.rawBody,
 *  that is used instead. */
export const inboxBodyParser: RequestHandler = express.raw({ type: () => true, limit: INBOX_BODY_LIMIT });

/** Alternative for server.ts if it prefers a JSON parser: parses the AP types and keeps req.rawBody. */
export const activityJsonParser: RequestHandler = express.json({
  type: ['application/activity+json', 'application/ld+json', 'application/json'],
  limit: INBOX_BODY_LIMIT,
  verify: (req: any, _res, buf) => { req.rawBody = Buffer.from(buf); },
});

export function createActivityPubRouter(opts: { deps?: DepsSource; version?: string; inboxLimiter?: RequestHandler } = {}): Router {
  const r = Router();
  const limiter = opts.inboxLimiter ?? simpleIpLimiter(300, 60_000);
  const readLimiter = simpleIpLimiter(600, 60_000);
  const version = opts.version ?? '1.0.0';
  const wrap = (fn: (req: Request, res: Response, deps: ApDeps) => Promise<unknown>) =>
    async (req: Request, res: Response, next: NextFunction) => {
      try { await fn(req, res, await getDeps(opts.deps)); } catch (e) { next(e); }
    };

  // ── Discovery ──────────────────────────────────────────────────────────────
  r.get('/.well-known/webfinger', readLimiter, wrap(async (req, res, deps) => {
    res.set('Access-Control-Allow-Origin', '*');
    const parsed = parseWebfingerResource(req.query.resource, deps.base);
    if (!parsed) return res.status(400).json({ error: 'resource required (acct:name@host)' });
    if (parsed.host !== apHost(deps.base).toLowerCase()) return res.status(404).end();
    const actor = await resolveLocalActor(deps, parsed.handle);
    if (!actor) return res.status(404).end();
    res.set({ 'Content-Type': 'application/jrd+json; charset=utf-8', 'Cache-Control': 'public, max-age=300' })
      .send(JSON.stringify(webfingerDoc(deps.base, actor.rec.handle, (buildActor(deps.base, actor.profile) as any).url)));
  }));

  r.get('/.well-known/host-meta', wrap(async (_req, res, deps) => {
    res.set({ 'Content-Type': 'application/xrd+xml; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' })
      .send(hostMetaXml(deps.base));
  }));

  r.get('/.well-known/nodeinfo', wrap(async (_req, res, deps) => {
    res.set({ 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' }).json(nodeinfoLinks(deps.base));
  }));

  r.get('/nodeinfo/2.1', wrap(async (_req, res, deps) => {
    const users = await deps.store.countEnabledActors().catch(() => undefined);
    res.set({
      'Content-Type': 'application/json; profile="http://nodeinfo.diaspora.software/ns/schema/2.1#"; charset=utf-8',
      'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=1800',
    }).send(JSON.stringify(nodeinfoDoc({ version, users })));
  }));

  // ── Actors ─────────────────────────────────────────────────────────────────
  r.get('/ap/actor', readLimiter, wrap(async (_req, res, deps) => {
    const rec = await ensureInstanceActor(deps);
    sendAp(res, buildInstanceActor(deps.base, rec.publicKeyPem));
  }));

  r.get('/ap/users/:handle', readLimiter, wrap(async (req, res, deps) => {
    const actor = await resolveLocalActor(deps, String(req.params.handle));
    if (!actor) return res.status(404).set('Vary', 'Accept').end();
    const doc = buildActor(deps.base, actor.profile);
    if (!wantsActivityJson(req.headers.accept)) return res.set('Vary', 'Accept').redirect(302, String(doc.url));
    sendAp(res, doc);
  }));

  r.get('/ap/users/:handle/outbox', readLimiter, wrap(async (req, res, deps) => {
    const actor = await resolveLocalActor(deps, String(req.params.handle));
    if (!actor) return res.status(404).end();
    const u = apUrls(deps.base);
    const outbox = u.outbox(actor.rec.handle);
    if (req.query.page !== 'true') return sendAp(res, orderedCollection(outbox, undefined, `${outbox}?page=true`));
    const maxRaw = Number(req.query.max);
    const before = Number.isFinite(maxRaw) && maxRaw > 0 ? Math.min(maxRaw, deps.now()) : deps.now();
    const rows = actor.profile.kind === 'user'
      ? await deps.postsByUser(actor.profile.refId, before, OUTBOX_PAGE)
      : await deps.postsByOrg(actor.profile.refId, before, OUTBOX_PAGE);
    const items = rows.filter(row => {
      const ref = postActorRef(row.data);
      return !!ref && actorKeyFor(ref.kind, ref.id) === actor.key && judgePost(row.data, u.postPage(row.id), deps.now()).ok;
    }).map(row => buildCreate(deps.base, buildNote(deps.base, { ...row.data, id: row.id }, actor.rec.handle)));
    const last = rows[rows.length - 1];
    const next = rows.length === OUTBOX_PAGE && last ? `${outbox}?page=true&max=${Number(last.data.timestamp) - 1}` : undefined;
    const pageId = `${outbox}?page=true${req.query.max ? `&max=${before}` : ''}`;
    sendAp(res, orderedCollectionPage(pageId, outbox, items, next));
  }));

  r.get('/ap/users/:handle/followers', readLimiter, wrap(async (req, res, deps) => {
    const actor = await resolveLocalActor(deps, String(req.params.handle));
    if (!actor) return res.status(404).end();
    // Count only: who follows someone is not published.
    sendAp(res, orderedCollection(apUrls(deps.base).followers(actor.rec.handle), await deps.store.followerCount(actor.key)));
  }));

  r.get('/ap/users/:handle/following', readLimiter, wrap(async (req, res, deps) => {
    const actor = await resolveLocalActor(deps, String(req.params.handle));
    if (!actor) return res.status(404).end();
    // Plajah identities don't follow remote accounts (yet), so this is honestly empty.
    sendAp(res, orderedCollection(apUrls(deps.base).following(actor.rec.handle), 0));
  }));

  // ── Objects ────────────────────────────────────────────────────────────────
  const loadFederatedNote = async (deps: ApDeps, postId: string) => {
    if (!SAFE_POST_ID.test(postId)) return null;
    const post = await deps.loadPost(postId);
    if (!post) return null;
    const ref = postActorRef(post);
    if (!ref || !judgePost(post, apUrls(deps.base).postPage(postId), deps.now()).ok) return null;
    const actor = await resolveActorKey(deps, actorKeyFor(ref.kind, ref.id));
    if (!actor) return null;
    return buildNote(deps.base, { ...post, id: postId }, actor.rec.handle);
  };

  r.get('/ap/posts/:postId', readLimiter, wrap(async (req, res, deps) => {
    const postId = String(req.params.postId);
    if (!wantsActivityJson(req.headers.accept)) {
      if (!SAFE_POST_ID.test(postId)) return res.status(404).end();
      return res.set('Vary', 'Accept').redirect(302, apUrls(deps.base).postPage(postId));
    }
    const note = await loadFederatedNote(deps, postId);
    if (!note) return res.status(404).set('Vary', 'Accept').end();
    sendAp(res, { '@context': 'https://www.w3.org/ns/activitystreams', ...note });
  }));

  r.get('/ap/posts/:postId/activity', readLimiter, wrap(async (req, res, deps) => {
    const note = await loadFederatedNote(deps, String(req.params.postId));
    if (!note) return res.status(404).end();
    sendAp(res, buildCreate(deps.base, note));
  }));

  // ── Inboxes ────────────────────────────────────────────────────────────────
  const inbox = (perActor: boolean) => wrap(async (req, res, deps) => {
    let raw: Buffer | null = Buffer.isBuffer(req.body) ? req.body : Buffer.isBuffer((req as any).rawBody) ? (req as any).rawBody : null;
    if (!raw) return res.status(400).json({ error: 'body unavailable for digest verification' });
    let activity: any;
    try { activity = JSON.parse(raw.toString('utf8')); } catch { return res.status(400).json({ error: 'invalid JSON' }); }
    if (!activity || typeof activity !== 'object' || Array.isArray(activity)) return res.status(400).json({ error: 'invalid activity' });

    let inboxHandle: string | undefined;
    if (perActor) {
      inboxHandle = normalizeHandle(String(req.params.handle)) ?? undefined;
      if (!inboxHandle || !(await resolveLocalActor(deps, inboxHandle))) return res.status(404).end();
    }
    const fwd = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
    const hostCandidates = [...new Set([fwd, String(req.headers.host || ''), apHost(deps.base)].filter(Boolean))];
    const auth = await authenticateInbound(deps, { method: req.method, path: req.originalUrl, headers: req.headers, rawBody: raw, hostCandidates }, activity);
    if (!auth.ok) {
      if (auth.status >= 400 && auth.status !== 403) deps.log('inbox rejected', { reason: auth.reason, actor: activity?.actor && String(typeof activity.actor === 'string' ? activity.actor : activity.actor.id).slice(0, 200) });
      return res.status(auth.status).json(auth.status === 202 ? {} : { error: auth.reason });
    }
    const out = await processActivity(deps, activity, auth.actor, inboxHandle);
    raw = null;
    res.status(out.status).json(out.status >= 400 ? { error: out.handled } : {});
  });

  r.post('/ap/inbox', limiter, inboxBodyParser, inbox(false));
  r.post('/ap/users/:handle/inbox', limiter, inboxBodyParser, inbox(true));
  r.get(['/ap/inbox', '/ap/users/:handle/inbox'], (_req, res) => res.status(405).set('Allow', 'POST').end());

  return r;
}

// ── Owner API ────────────────────────────────────────────────────────────────

export function createActivityPubOwnerRouter(opts: {
  deps?: DepsSource;
  /** Bearer token → uid (non-anonymous); defaults to firebaseAdminRest.verifyIdTokenDetailed. */
  verifyToken?: (token: string) => Promise<string | null>;
} = {}): Router {
  const r = Router();
  const verify = opts.verifyToken ?? (async (t: string) => {
    const { verifyIdTokenDetailed } = await import('../services/firebaseAdminRest');
    const d = await verifyIdTokenDetailed(t);
    return d && !d.isAnonymous ? d.uid : null;
  });
  const authed = (fn: (req: Request, res: Response, uid: string, deps: ApDeps) => Promise<unknown>) =>
    async (req: Request, res: Response) => {
      try {
        const h = req.headers.authorization;
        const uid = h?.startsWith('Bearer ') ? await verify(h.slice(7)) : null;
        if (!uid) return res.status(401).json({ error: 'Sign in first.' });
        await fn(req, res, uid, await getDeps(opts.deps));
      } catch (e: any) {
        const status = Number(e?.status) || 500;
        if (status === 500) console.error('[activitypub] owner route failed:', e);
        res.status(status).json({ error: status === 500 ? 'Something went wrong.' : String(e.message) });
      }
    };
  const subjectOf = (uid: string, org: unknown): Subject => {
    if (org === undefined || org === null || org === '') return { kind: 'user', uid };
    if (typeof org !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(org)) throw Object.assign(new Error('Bad org id.'), { status: 400 });
    return { kind: 'org', orgId: org, uid };
  };

  r.get('/me', authed(async (req, res, uid, deps) => {
    res.json(await identityStatus(deps, subjectOf(uid, req.query.org)));
  }));

  r.post('/me', authed(async (req, res, uid, deps) => {
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    if (typeof body.enabled !== 'boolean') return res.status(400).json({ error: 'enabled (true/false) required' });
    const handle = typeof body.handle === 'string' ? body.handle.slice(0, 80) : undefined;
    res.json(await setIdentityEnabled(deps, subjectOf(uid, body.org), body.enabled, handle));
  }));

  r.get('/replies/:postId', authed(async (req, res, uid, deps) => {
    const postId = String(req.params.postId);
    if (!SAFE_POST_ID.test(postId)) return res.status(400).json({ error: 'bad post id' });
    const post = await deps.loadPost(postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.isPublic !== true && post.authorId !== uid) return res.status(403).json({ error: 'Not allowed' });
    const [replies, counts] = await Promise.all([deps.store.listReplies(postId, 200), deps.store.postCounts(postId)]);
    res.json({
      postId,
      counts,
      replies: replies.map(x => ({
        id: x.noteId, url: x.url ?? x.noteId, author: { name: x.authorName, handle: x.authorHandle, icon: x.authorIcon ?? null, url: x.authorUrl ?? x.remoteActor },
        text: x.text, summary: x.summary ?? null, sensitive: !!x.sensitive, attachments: x.attachments ?? [], published: x.published,
      })),
    });
  }));

  return r;
}
