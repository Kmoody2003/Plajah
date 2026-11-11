// openNetworks — /api/open-networks/* : Mobilizon, Lemmy, BookWyrm, Owncast, Matrix bridges.
//
// Mount (server.ts):
//   import { createOpenNetworksRouter, defaultOpenNetworksDeps } from './routes/openNetworks';
//   app.use('/api/open-networks', createOpenNetworksRouter(await defaultOpenNetworksDeps()));
// (or without top-level await: defaultOpenNetworksDeps().then(d => app.use('/api/open-networks', createOpenNetworksRouter(d))))
//
// Auth is a Firebase ID token in `Authorization: Bearer`. Public reads (Lemmy community posts, BookWyrm shelves,
// Owncast status) need no sign-in but are rate-limited per IP and cached briefly. Child accounts can't connect or
// write. Org events go out only when the org allows the network (churches/faith/nonprofits/schools: opt-in, default
// off) and the event is public; private, members-only and paywalled content never leaves.

import express, { Router, type Request, type Response } from 'express';
import {
  type NetDeps, type AccountStore, type SecretBox, type AccountDoc, type NetworkId, type ProfileLike, type OrgLike,
  NETWORKS, OpenNetworkError, ACCOUNT_ID_RE, ORG_SETTINGS_COLLECTION,
  normalizeServer, accountDocId, toPublicAccount, canConnectOpenNetworks, orgAllowsNetwork, orgRequiresOptIn, isOrgAdmin, clean,
  defaultNetDeps, defaultSecretBox, firestoreAccountStore,
} from '../services/openNetworks/common';
import { mobilizonLogin, mobilizonCreateEvent, buildMobilizonEvent, eventBlockReason, type EventLike, type MobilizonTokens } from '../services/openNetworks/mobilizon';
import { lemmyLogin, lemmyCreatePost, lemmyListPosts, parseCommunity } from '../services/openNetworks/lemmy';
import { bookwyrmShelf, BOOKWYRM_DEFAULT_SHELVES } from '../services/openNetworks/bookwyrm';
import { owncastStatus, owncastSendChat, owncastIngestConfig, parseRtmpHost, parseRtmpPort } from '../services/openNetworks/owncast';
import { matrixDiscover, matrixWhoami, matrixPasswordLogin, matrixLogout, matrixJoinedRooms, matrixSend, matrixMessages } from '../services/openNetworks/matrix';

export interface OrgNetworkSettings {
  enabled?: Partial<Record<NetworkId, boolean>>;
  /** Lemmy communities shown as boards; departmentId absent = the org-wide board. */
  lemmyBoards?: Array<{ departmentId?: string; server: string; community: string }>;
  updatedAt?: number; updatedBy?: string;
}

export interface OpenNetworksDeps {
  net: NetDeps;
  store: AccountStore;
  box: SecretBox;
  verify(idToken: string): Promise<string | null>;
  getUser(uid: string): Promise<ProfileLike | null>;
  getOrg(orgId: string): Promise<OrgLike | null>;
  getOrgSettings(orgId: string): Promise<OrgNetworkSettings | null>;
  setOrgSettings(orgId: string, s: OrgNetworkSettings): Promise<boolean>;
  getEvent(eventId: string): Promise<EventLike | null>;
  eventUrl(eventId: string, ev: EventLike): string;
  now?: () => number;
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

class TtlCache {
  private m = new Map<string, { at: number; v: unknown }>();
  constructor(private ttlMs: number, private max = 500) {}
  get(k: string, now: number) { const e = this.m.get(k); if (!e || now - e.at > this.ttlMs) return undefined; return e.v; }
  set(k: string, v: unknown, now: number) { if (this.m.size >= this.max) this.m.delete(this.m.keys().next().value!); this.m.set(k, { at: now, v }); }
}

export function createOpenNetworksRouter(deps: OpenNetworksDeps): Router {
  const now = deps.now ?? Date.now;
  const r = Router();
  r.use(express.json({ limit: '64kb' }));

  // ── helpers ────────────────────────────────────────────────────────────────
  const hits = new Map<string, { n: number; at: number }>();
  const rateOk = (key: string, max: number, windowMs: number) => {
    const t = now(); const h = hits.get(key);
    if (!h || t - h.at > windowMs) { hits.set(key, { n: 1, at: t }); if (hits.size > 5000) hits.clear(); return true; }
    h.n += 1; return h.n <= max;
  };
  const cache = new TtlCache(60_000);

  type H = (req: Request, res: Response) => Promise<unknown>;
  const wrap = (fn: H) => (req: Request, res: Response) => {
    fn(req, res).catch((e: any) => {
      if (res.headersSent) return;
      if (e instanceof OpenNetworkError) return res.status(e.status).json({ error: e.message, code: e.code });
      console.error('[open-networks]', e?.message || e);
      res.status(500).json({ error: 'Something went wrong' });
    });
  };
  const uidOf = async (req: Request) => {
    const a = req.headers.authorization;
    return a?.startsWith('Bearer ') ? deps.verify(a.slice(7)) : null;
  };
  const needUid = async (req: Request): Promise<string> => {
    const uid = await uidOf(req);
    if (!uid) throw new OpenNetworkError(401, 'Sign in first.');
    if (!rateOk(`u:${uid}`, 60, 60_000)) throw new OpenNetworkError(429, 'Too many requests — slow down a little');
    return uid;
  };
  const needAdult = async (uid: string) => {
    const ok = canConnectOpenNetworks(await deps.getUser(uid).catch(() => null), new Date(now()).getFullYear());
    if (!ok.ok) throw new OpenNetworkError(403, ok.reason!, 'child');
  };
  const publicRate = (req: Request) => {
    const ip = String(req.ip || req.socket?.remoteAddress || 'unknown');
    if (!rateOk(`ip:${ip}`, 30, 60_000)) throw new OpenNetworkError(429, 'Too many requests');
  };
  const ownAccount = async (uid: string, id: unknown, network: NetworkId): Promise<{ id: string; doc: AccountDoc; secret: Record<string, any> }> => {
    const sid = String(id ?? '');
    if (!ACCOUNT_ID_RE.test(sid) || !sid.startsWith(`${uid}_${network}_`)) throw new OpenNetworkError(404, 'Account not found');
    const doc = await deps.store.get(sid);
    if (!doc || doc.uid !== uid || doc.network !== network) throw new OpenNetworkError(404, 'Account not found');
    return { id: sid, doc, secret: deps.box.open(doc.secret) };
  };
  const save = async (uid: string, network: NetworkId, server: string, handle: string, secret: Record<string, unknown>, extra: { displayName?: string; meta?: Record<string, unknown> } = {}) => {
    const id = accountDocId(uid, network, server, handle);
    const prev = await deps.store.get(id);
    const t = now();
    const doc: AccountDoc = {
      uid, network, server, handle, secret: deps.box.seal(secret), createdAt: prev?.createdAt ?? t, updatedAt: t,
      ...(extra.displayName ? { displayName: extra.displayName } : {}),
      meta: { ...(prev?.meta ?? {}), ...(extra.meta ?? {}) },
    };
    if (!(await deps.store.set(id, doc))) throw new OpenNetworkError(500, 'Could not save the connection');
    return toPublicAccount(id, doc);
  };
  const str = (v: unknown, max = 1024) => (typeof v === 'string' ? v : '').slice(0, max);

  // ── accounts ───────────────────────────────────────────────────────────────
  r.get('/accounts', wrap(async (req, res) => {
    const uid = await needUid(req);
    const rows = await deps.store.listByUid(uid);
    res.json({ accounts: rows.filter(x => x.data?.uid === uid).map(x => toPublicAccount(x.id, x.data)) });
  }));

  r.delete('/accounts/:id', wrap(async (req, res) => {
    const uid = await needUid(req);
    const id = String(req.params.id);
    const network = NETWORKS.find(n => id.startsWith(`${uid}_${n}_`));
    if (!network) throw new OpenNetworkError(404, 'Account not found');
    const acct = await ownAccount(uid, id, network);
    // A Matrix token we minted ourselves is logged out so it doesn't linger on the homeserver.
    if (network === 'matrix' && acct.secret.minted && acct.secret.accessToken) await matrixLogout(deps.net, acct.doc.server, acct.secret.accessToken);
    await deps.store.delete(id);
    res.json({ ok: true });
  }));

  // ── Mobilizon ──────────────────────────────────────────────────────────────
  r.post('/mobilizon/connect', wrap(async (req, res) => {
    const uid = await needUid(req); await needAdult(uid);
    const server = normalizeServer(req.body?.server).origin;
    const { tokens, identity } = await mobilizonLogin(deps.net, server, str(req.body?.email, 254), str(req.body?.password));
    res.json({ account: await save(uid, 'mobilizon', server, identity.username, { ...tokens }, { displayName: identity.name, meta: { actorId: identity.actorId } }) });
  }));

  r.post('/mobilizon/publish-event', wrap(async (req, res) => {
    const uid = await needUid(req); await needAdult(uid);
    const eventId = str(req.body?.eventId, 128);
    if (!SAFE_ID.test(eventId)) throw new OpenNetworkError(400, 'eventId required');
    const acct = await ownAccount(uid, req.body?.accountId, 'mobilizon');
    const ev = await deps.getEvent(eventId);
    const block = eventBlockReason(ev);
    if (block) throw new OpenNetworkError(ev ? 400 : 404, block, 'blocked');
    const host = ev!.host;
    if (host?.kind === 'org') {
      const org = await deps.getOrg(host.id);
      if (!org) throw new OpenNetworkError(404, 'Hosting org not found');
      if (!isOrgAdmin(org, uid) && ev!.creatorUid !== uid) throw new OpenNetworkError(403, 'Only org admins or the event creator can share this event');
      if (!orgAllowsNetwork(org, await deps.getOrgSettings(host.id), 'mobilizon')) {
        throw new OpenNetworkError(403, org.isPrivate ? 'Private orgs do not federate events' : 'This org has not turned on Mobilizon sharing (Settings → Open networks)', 'org-off');
      }
    } else if (ev!.creatorUid !== uid) {
      throw new OpenNetworkError(403, 'You can only share your own events');
    }
    const published = (acct.doc.meta?.published ?? {}) as Record<string, string>;
    if (published[eventId]) return res.json({ ok: true, already: true, url: published[eventId] });
    const actorId = String(acct.doc.meta?.actorId || '');
    if (!actorId) throw new OpenNetworkError(400, 'Reconnect Mobilizon (no identity saved)');
    const input = buildMobilizonEvent(ev!, actorId, deps.eventUrl(eventId, ev!));
    const out = await mobilizonCreateEvent(deps.net, acct.doc.server, acct.secret as MobilizonTokens, input);
    const keep = Object.entries({ ...published, [eventId]: out.url || out.uuid || out.id }).slice(-200);
    await deps.store.set(acct.id, {
      ...acct.doc,
      secret: out.rotatedTokens ? deps.box.seal({ ...out.rotatedTokens }) : acct.doc.secret,
      meta: { ...(acct.doc.meta ?? {}), published: Object.fromEntries(keep) },
      updatedAt: now(),
    });
    res.json({ ok: true, id: out.id, url: out.url });
  }));

  // ── Lemmy ──────────────────────────────────────────────────────────────────
  r.post('/lemmy/connect', wrap(async (req, res) => {
    const uid = await needUid(req); await needAdult(uid);
    const server = normalizeServer(req.body?.server).origin;
    const { jwt, handle } = await lemmyLogin(deps.net, server, str(req.body?.username, 254), str(req.body?.password), str(req.body?.totp, 12) || undefined);
    res.json({ account: await save(uid, 'lemmy', server, handle, { jwt }) });
  }));

  r.post('/lemmy/post', wrap(async (req, res) => {
    const uid = await needUid(req); await needAdult(uid);
    const acct = await ownAccount(uid, req.body?.accountId, 'lemmy');
    const out = await lemmyCreatePost(deps.net, acct.doc.server, String(acct.secret.jwt || ''), {
      community: str(req.body?.community, 320), title: str(req.body?.title, 400), body: str(req.body?.body, 20_000) || undefined, url: str(req.body?.url, 2048) || undefined,
    });
    res.json({ ok: true, ...out });
  }));

  const lemmyRead = async (server: string, community: string, sort?: string, limit?: number) => {
    const key = `lemmy|${server}|${community}|${sort}|${limit}`;
    const hit = cache.get(key, now()); if (hit) return hit;
    const posts = await lemmyListPosts(deps.net, server, community, { sort, limit });
    const v = { server, community, posts };
    cache.set(key, v, now());
    return v;
  };

  /** Public: any community, e.g. a Gamer Network community. No account needed. */
  r.get('/lemmy/posts', wrap(async (req, res) => {
    publicRate(req);
    const server = normalizeServer(req.query.server).origin;
    const community = parseCommunity(req.query.community);
    res.json(await lemmyRead(server, community, str(req.query.sort, 20), Number(req.query.limit) || 20));
  }));

  /** The board an org (or one of its departments) linked. Public read of a public community. */
  r.get('/orgs/:orgId/lemmy-board', wrap(async (req, res) => {
    publicRate(req);
    const orgId = String(req.params.orgId);
    if (!SAFE_ID.test(orgId)) throw new OpenNetworkError(400, 'bad org');
    const org = await deps.getOrg(orgId);
    const s = await deps.getOrgSettings(orgId);
    if (!org || !orgAllowsNetwork(org, s, 'lemmy')) return res.json({ board: null, posts: [] });
    const dept = str(req.query.departmentId, 128) || undefined;
    const board = (s?.lemmyBoards ?? []).find(b => (b.departmentId || undefined) === dept);
    if (!board) return res.json({ board: null, posts: [] });
    const v: any = await lemmyRead(board.server, board.community, 'New', 20);
    res.json({ board, posts: v.posts });
  }));

  // ── BookWyrm (read only) ───────────────────────────────────────────────────
  r.get('/bookwyrm/shelf', wrap(async (req, res) => {
    publicRate(req);
    const handle = str(req.query.handle, 300);
    const shelf = str(req.query.shelf, 100) || 'read';
    const key = `bw|${handle.toLowerCase()}|${shelf}`;
    const hit = cache.get(key, now()); if (hit) return res.json(hit);
    const v = await bookwyrmShelf(deps.net, handle, shelf);
    cache.set(key, v, now());
    res.json(v);
  }));
  r.get('/bookwyrm/shelves', (_req, res) => res.json({ shelves: BOOKWYRM_DEFAULT_SHELVES, writeSupported: false }));

  // ── Owncast ────────────────────────────────────────────────────────────────
  r.post('/owncast/connect', wrap(async (req, res) => {
    const uid = await needUid(req); await needAdult(uid);
    const server = normalizeServer(req.body?.server).origin;
    const status = await owncastStatus(deps.net, server, { withConfig: true });
    const rtmpHost = parseRtmpHost(req.body?.rtmpHost);
    const rtmpPort = parseRtmpPort(req.body?.rtmpPort);
    res.json({
      account: await save(uid, 'owncast', server, new URL(server).host,
        { accessToken: str(req.body?.accessToken, 512), streamKey: str(req.body?.streamKey, 512) },
        { displayName: status.name, meta: { rtmpHost: rtmpHost ?? null, rtmpPort: rtmpPort ?? null, hasChatToken: !!str(req.body?.accessToken), hasStreamKey: !!str(req.body?.streamKey) } }),
      status,
    });
  }));

  /** Public: live/offline + viewers for any Owncast server. */
  r.get('/owncast/status', wrap(async (req, res) => {
    publicRate(req);
    const server = normalizeServer(req.query.server).origin;
    const key = `oc|${server}`;
    const hit = cache.get(key, now() + 45_000); // 60s TTL shifted → ~15s freshness for a live counter
    if (hit) return res.json(hit);
    const v = await owncastStatus(deps.net, server);
    cache.set(key, v, now());
    res.json(v);
  }));

  r.post('/owncast/chat', wrap(async (req, res) => {
    const uid = await needUid(req); await needAdult(uid);
    const acct = await ownAccount(uid, req.body?.accountId, 'owncast');
    res.json(await owncastSendChat(deps.net, acct.doc.server, String(acct.secret.accessToken || ''), str(req.body?.text, 2000)));
  }));

  /** Owner-only: RTMP URL + stream key for Stage/Go Live. */
  r.get('/owncast/ingest/:accountId', wrap(async (req, res) => {
    const uid = await needUid(req);
    const acct = await ownAccount(uid, req.params.accountId, 'owncast');
    res.setHeader('Cache-Control', 'no-store');
    res.json(owncastIngestConfig(acct.doc.server, String(acct.secret.streamKey || ''), {
      rtmpHost: (acct.doc.meta?.rtmpHost as string) || undefined, rtmpPort: (acct.doc.meta?.rtmpPort as number) || undefined,
    }));
  }));

  // ── Matrix ─────────────────────────────────────────────────────────────────
  r.post('/matrix/connect', wrap(async (req, res) => {
    const uid = await needUid(req); await needAdult(uid);
    const hs = await matrixDiscover(deps.net, str(req.body?.homeserver, 300));
    let token = str(req.body?.accessToken, 2048).trim();
    let minted = false;
    let userId: string;
    if (token) {
      userId = (await matrixWhoami(deps.net, hs, token)).userId;
    } else {
      const login = await matrixPasswordLogin(deps.net, hs, str(req.body?.user, 300), str(req.body?.password));
      token = login.accessToken; userId = login.userId; minted = true;
    }
    res.json({ account: await save(uid, 'matrix', hs, userId, { accessToken: token, minted }) });
  }));

  r.get('/matrix/rooms', wrap(async (req, res) => {
    const uid = await needUid(req);
    const acct = await ownAccount(uid, req.query.accountId, 'matrix');
    res.json({ rooms: await matrixJoinedRooms(deps.net, acct.doc.server, String(acct.secret.accessToken || '')) });
  }));

  r.post('/matrix/send', wrap(async (req, res) => {
    const uid = await needUid(req); await needAdult(uid);
    const acct = await ownAccount(uid, req.body?.accountId, 'matrix');
    const txn = /^[A-Za-z0-9_-]{8,64}$/.test(str(req.body?.txnId, 64)) ? str(req.body?.txnId, 64) : undefined; // idempotent retries
    res.json(await matrixSend(deps.net, acct.doc.server, String(acct.secret.accessToken || ''), str(req.body?.roomId, 600), str(req.body?.text, 8000), txn));
  }));

  r.get('/matrix/messages', wrap(async (req, res) => {
    const uid = await needUid(req);
    const acct = await ownAccount(uid, req.query.accountId, 'matrix');
    res.json(await matrixMessages(deps.net, acct.doc.server, String(acct.secret.accessToken || ''), str(req.query.roomId, 600), {
      limit: Number(req.query.limit) || 30, from: str(req.query.from, 500) || undefined,
    }));
  }));

  // ── Org opt-in settings ────────────────────────────────────────────────────
  const orgForAdmin = async (req: Request) => {
    const uid = await needUid(req);
    const orgId = String(req.params.orgId);
    if (!SAFE_ID.test(orgId)) throw new OpenNetworkError(400, 'bad org');
    const org = await deps.getOrg(orgId);
    if (!org) throw new OpenNetworkError(404, 'Org not found');
    if (!isOrgAdmin(org, uid)) throw new OpenNetworkError(403, 'Org admins only');
    return { uid, orgId, org };
  };
  const effective = (org: OrgLike, s: OrgNetworkSettings | null) =>
    Object.fromEntries(NETWORKS.map(n => [n, orgAllowsNetwork(org, s, n)])) as Record<NetworkId, boolean>;

  r.get('/orgs/:orgId/settings', wrap(async (req, res) => {
    const { orgId, org } = await orgForAdmin(req);
    const s = await deps.getOrgSettings(orgId);
    res.json({ settings: s ?? {}, optInRequired: orgRequiresOptIn(org), privateOrg: !!org.isPrivate, effective: effective(org, s) });
  }));

  r.put('/orgs/:orgId/settings', wrap(async (req, res) => {
    const { uid, orgId, org } = await orgForAdmin(req);
    const enabled: Partial<Record<NetworkId, boolean>> = {};
    for (const n of NETWORKS) if (typeof req.body?.enabled?.[n] === 'boolean') enabled[n] = req.body.enabled[n];
    const boards: NonNullable<OrgNetworkSettings['lemmyBoards']> = [];
    for (const b of Array.isArray(req.body?.lemmyBoards) ? req.body.lemmyBoards.slice(0, 50) : []) {
      const dept = clean(b?.departmentId, 128);
      if (dept && !SAFE_ID.test(dept)) throw new OpenNetworkError(400, 'bad departmentId');
      boards.push({ ...(dept ? { departmentId: dept } : {}), server: normalizeServer(b?.server).origin, community: parseCommunity(b?.community) });
    }
    const prev = await deps.getOrgSettings(orgId);
    const next: OrgNetworkSettings = {
      enabled: { ...(prev?.enabled ?? {}), ...enabled },
      lemmyBoards: Array.isArray(req.body?.lemmyBoards) ? boards : (prev?.lemmyBoards ?? []),
      updatedAt: now(), updatedBy: uid,
    };
    if (!(await deps.setOrgSettings(orgId, next))) throw new OpenNetworkError(500, 'Could not save');
    res.json({ settings: next, effective: effective(org, next) });
  }));

  return r;
}

/** Production wiring: Firestore REST, encryptCreds, real fetch + DNS. */
export async function defaultOpenNetworksDeps(): Promise<OpenNetworksDeps> {
  const fs = await import('../services/firebaseAdminRest');
  const appBase = (process.env.VITE_APP_URL || 'https://plajah.com').replace(/\/+$/, '');
  return {
    net: defaultNetDeps(),
    store: await firestoreAccountStore(),
    box: await defaultSecretBox(),
    verify: fs.verifyIdToken,
    getUser: async (uid) => (await fs.fsGetUser(uid)) as ProfileLike | null,
    getOrg: async (id) => { const o = await fs.fsGet(`organizations/${id}`); return o ? ({ id, ...o } as OrgLike) : null; },
    getOrgSettings: async (id) => (await fs.fsGet(`${ORG_SETTINGS_COLLECTION}/${id}`)) as OrgNetworkSettings | null,
    setOrgSettings: (id, s) => fs.fsSet(`${ORG_SETTINGS_COLLECTION}/${id}`, s as unknown as Record<string, unknown>),
    getEvent: async (id) => { const e = await fs.fsGet(`plajahEvents/${id}`); return e ? ({ id, ...e } as EventLike) : null; },
    eventUrl: (id) => `${appBase}/event/${encodeURIComponent(id)}`, // App.tsx deep link: /event/:eventId
  };
}
