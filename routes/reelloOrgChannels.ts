// Department channels on Reello — an org's departments each get a channel under the org's main one,
// and a department channel appears only once it has posted a public video or started a stream.
//
//   GET  /mine                                   orgs + departments the caller may post for
//   GET  /org?orgId=                             an org's department channels that have content (public)
//   GET  /by-account?uid=                        same, for the org whose account IS this uid (public)
//   GET  /channel?orgId=&departmentId=           one department channel: its public videos + live now (public)
//   POST /attach { kind, id, orgId, departmentId }   post a video / stream for a department (owner + member)
//   POST /detach { kind, id, orgId, departmentId }   take it back off (its owner, or someone who posts for the dept)
//
// The index lives in `reelloDeptChannels/{orgId}__{deptId}`, written only here (no client rules match it,
// so clients can neither read nor write it). A video's own fields are never trusted for placement: a
// department page lists only what this route attached after checking the poster's department access.
//
// Mounted in server.ts as:  app.use('/api/reello/org-channels', apiLimiter, express.json({ limit: '8kb' }), reelloOrgChannelsRouter)
// createReelloOrgChannelsRouter({ store, callerUid }) runs the same routes on another store (the upload lab).

import { Router, Request, Response } from 'express';
import { verifyIdTokenDetailed, fsGet, fsPatch, fsQuery } from '../services/firebaseAdminRest';
import {
  MAX_INDEX_LIVE, MAX_INDEX_VIDEOS, canPostToDepartment, deptChannelId, isPublicVideo, orgDepartments,
  postableDepartmentIds, pushFront, toMillis,
} from '../services/reello/orgChannelsCore';
import { isFeedLive } from '../services/liveFeedLiveness';

export interface OrgChannelsStore {
  get(path: string): Promise<Record<string, any> | null>;
  patch(path: string, data: Record<string, unknown>): Promise<boolean>;
  query(collection: string, filters: { field: string; value: string | number | boolean }[], limit?: number): Promise<Array<{ id: string; data: Record<string, any> }>>;
}
const adminStore: OrgChannelsStore = { get: fsGet, patch: fsPatch, query: (c, f, l) => fsQuery(c, f, l) };

const badId = (s: string) => !s || s.length > 128 || /[\/]/.test(s);

async function tokenUid(req: Request): Promise<string | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  const t = await verifyIdTokenDetailed(auth.slice(7));
  return t && !t.isAnonymous ? t.uid : null;
}

export function createReelloOrgChannelsRouter(deps: { store?: OrgChannelsStore; callerUid?: (req: Request) => Promise<string | null> } = {}): Router {
  const r = Router();
  const store = deps.store || adminStore;
  const callerUid = deps.callerUid || tokenUid;

  async function membershipFor(orgId: string, uid: string): Promise<Record<string, any> | null> {
    const rows = await store.query('orgMemberships', [{ field: 'userId', value: uid }], 200);
    return rows.map(r => r.data).find(m => m.orgId === orgId) || null;
  }

  // Small read cache for the public listings (they fan out to many video reads).
  const cache = new Map<string, { at: number; body: any }>();
  const CACHE_MS = 60_000;
  const cached = async (key: string, make: () => Promise<any>) => {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.body;
    const body = await make();
    cache.set(key, { at: Date.now(), body });
    if (cache.size > 500) cache.delete(cache.keys().next().value as string);
    return body;
  };
  const forget = (orgId: string) => { for (const k of cache.keys()) if (k.includes(orgId)) cache.delete(k); };

  const videoCard = (id: string, v: Record<string, any>) => ({
    id, title: v.title || 'Untitled', ownerId: v.ownerId, artist: v.artist || v.ownerName || '',
    thumbnailUrl: v.thumbnailUrl || (v.muxPlaybackId ? `https://image.mux.com/${v.muxPlaybackId}/thumbnail.png?width=640&time=5` : ''),
    muxPlaybackId: v.muxPlaybackId || undefined, url: v.url || '', duration: v.duration || 0,
    playsCount: v.playsCount || 0, timestamp: toMillis(v.timestamp), isRello: v.isRello ?? true,
  });

  const feedCard = (id: string, f: Record<string, any>) => ({
    id, title: f.title || 'Live', ownerId: f.ownerId, ownerName: f.ownerName || '', ownerPhoto: f.ownerPhoto || '',
    streamId: f.streamId || undefined, muxStreamId: f.muxStreamId || undefined, url: f.url || '', status: f.status,
  });

  /** Public videos (newest first) and live-now feeds for one index doc. */
  async function resolveIndex(idx: Record<string, any>, videoLimit: number) {
    const now = Date.now();
    const vids = (await Promise.all(((idx.videoIds || []) as string[]).slice(0, videoLimit * 2).map(async id => {
      const v = await store.get(`videos/${id}`);
      return v && isPublicVideo(v, now) ? videoCard(id, v) : null;
    }))).filter(Boolean).slice(0, videoLimit) as ReturnType<typeof videoCard>[];
    const feeds = (await Promise.all(((idx.liveFeedIds || []) as string[]).slice(0, 10).map(async id => {
      const f = await store.get(`live_feeds/${id}`);
      return f && f.isPublic !== false && isFeedLive(f as any, now) ? feedCard(id, f) : null;
    }))).filter(Boolean) as ReturnType<typeof feedCard>[];
    return { videos: vids, liveNow: feeds };
  }

  /** An org's department channels that have something to show. */
  async function orgChannels(orgId: string) {
    const org = await store.get(`organizations/${orgId}`);
    if (!org) return null;
    const depts = orgDepartments(org);
    const rows = await store.query('reelloDeptChannels', [{ field: 'orgId', value: orgId }], 200);
    const byDept = new Map(rows.map(r => [String(r.data.departmentId), r.data]));
    const channels = (await Promise.all(depts.map(async d => {
      const idx = byDept.get(d.id);
      if (!idx) return null;
      const { videos, liveNow } = await resolveIndex(idx, 24); // public videos only, shown as 24+ past that
      // Appears once it has a public video or has streamed for the department.
      if (!videos.length && !liveNow.length && !idx.firstLiveAt) return null;
      return {
        departmentId: d.id, name: d.name, iconEmoji: d.iconEmoji || null, description: d.description || '',
        videoCount: videos.length, moreVideos: videos.length >= 24, live: liveNow.length > 0,
        thumbnailUrl: videos[0]?.thumbnailUrl || '', lastActivityAt: toMillis(idx.lastActivityAt),
      };
    }))).filter(Boolean) as any[];
    channels.sort((a, b) => Number(b.live) - Number(a.live) || b.lastActivityAt - a.lastActivityAt);
    return {
      org: { id: orgId, name: org.name || 'Organization', handle: org.handle || null, logoUrl: org.logoUrl || '', accountUid: org.accountUid || null },
      channels,
    };
  }

  r.get('/mine', async (req: Request, res: Response) => {
    const uid = await callerUid(req);
    if (!uid) return res.status(401).json({ error: 'Sign in first.' });
    const mems = (await store.query('orgMemberships', [{ field: 'userId', value: uid }], 200)).map(r => r.data);
    const owned = (await store.query('organizations', [{ field: 'creatorId', value: uid }], 50)).map(r => r.id);
    const asAccount = (await store.query('organizations', [{ field: 'accountUid', value: uid }], 10)).map(r => r.id);
    const orgIds = Array.from(new Set([...mems.filter(m => m.status === 'ACTIVE').map(m => String(m.orgId)), ...owned, ...asAccount])).slice(0, 50);
    const out = (await Promise.all(orgIds.map(async orgId => {
      const org = await store.get(`organizations/${orgId}`);
      if (!org) return null;
      const allowed = new Set(postableDepartmentIds(uid, org, mems.find(m => m.orgId === orgId)));
      const departments = orgDepartments(org).filter(d => allowed.has(d.id)).map(d => ({ id: d.id, name: d.name, iconEmoji: d.iconEmoji || null }));
      return departments.length ? { orgId, orgName: org.name || 'Organization', logoUrl: org.logoUrl || '', departments } : null;
    }))).filter(Boolean);
    return res.json({ orgs: out });
  });

  r.get('/org', async (req: Request, res: Response) => {
    const orgId = String(req.query.orgId || '').trim();
    if (badId(orgId)) return res.status(400).json({ error: 'Bad request.' });
    const body = await cached(`org:${orgId}`, () => orgChannels(orgId));
    return body ? res.json(body) : res.status(404).json({ error: 'Organization not found.' });
  });

  r.get('/by-account', async (req: Request, res: Response) => {
    const uid = String(req.query.uid || '').trim();
    if (badId(uid)) return res.status(400).json({ error: 'Bad request.' });
    const body = await cached(`acct:${uid}`, async () => {
      const orgs = await store.query('organizations', [{ field: 'accountUid', value: uid }], 1);
      return orgs[0] ? orgChannels(orgs[0].id) : { org: null, channels: [] };
    });
    return res.json(body);
  });

  r.get('/channel', async (req: Request, res: Response) => {
    const orgId = String(req.query.orgId || '').trim();
    const departmentId = String(req.query.departmentId || '').trim();
    if (badId(orgId) || badId(departmentId)) return res.status(400).json({ error: 'Bad request.' });
    const body = await cached(`chan:${orgId}:${departmentId}`, async () => {
      const [org, idx] = await Promise.all([store.get(`organizations/${orgId}`), store.get(`reelloDeptChannels/${deptChannelId(orgId, departmentId)}`)]);
      const dept = orgDepartments(org).find(d => d.id === departmentId);
      if (!org || !dept) return null;
      const { videos, liveNow } = idx ? await resolveIndex(idx, 60) : { videos: [], liveNow: [] };
      return {
        org: { id: orgId, name: org.name || 'Organization', handle: org.handle || null, logoUrl: org.logoUrl || '', accountUid: org.accountUid || null },
        department: { id: dept.id, name: dept.name, iconEmoji: dept.iconEmoji || null, description: dept.description || '' },
        videos, liveNow,
      };
    });
    return body ? res.json(body) : res.status(404).json({ error: 'Channel not found.' });
  });

  async function readTarget(kind: string, id: string) {
    if (kind === 'video') return store.get(`videos/${id}`);
    if (kind === 'live') return store.get(`live_feeds/${id}`);
    return null;
  }

  r.post('/attach', async (req: Request, res: Response) => {
    const uid = await callerUid(req);
    if (!uid) return res.status(401).json({ error: 'Sign in first.' });
    const kind = String(req.body?.kind || ''), id = String(req.body?.id || '').trim();
    const orgId = String(req.body?.orgId || '').trim(), departmentId = String(req.body?.departmentId || '').trim();
    if ((kind !== 'video' && kind !== 'live') || badId(id) || badId(orgId) || badId(departmentId)) return res.status(400).json({ error: 'Bad request.' });
    const [target, org] = await Promise.all([readTarget(kind, id), store.get(`organizations/${orgId}`)]);
    if (!target || target.ownerId !== uid) return res.status(403).json({ error: 'You can only post your own videos and streams.' });
    if (!org) return res.status(404).json({ error: 'Organization not found.' });
    if (!canPostToDepartment(uid, org, await membershipFor(orgId, uid), departmentId)) {
      return res.status(403).json({ error: 'You are not in that department.' });
    }
    const path = `reelloDeptChannels/${deptChannelId(orgId, departmentId)}`;
    const cur = (await store.get(path)) || {};
    const now = Date.now();
    const next: Record<string, unknown> = {
      orgId, departmentId, lastActivityAt: now,
      firstActivityAt: cur.firstActivityAt || now,
      videoIds: kind === 'video' ? pushFront(cur.videoIds, id, MAX_INDEX_VIDEOS) : (cur.videoIds || []),
      liveFeedIds: kind === 'live' ? pushFront(cur.liveFeedIds, id, MAX_INDEX_LIVE) : (cur.liveFeedIds || []),
    };
    if (kind === 'live' && !cur.firstLiveAt) next.firstLiveAt = now;
    const ok = await store.patch(path, next);
    if (!ok) return res.status(500).json({ error: 'Could not save.' });
    // Stamp the placement on the item so its owner's tools can show it (display only — listings use the index).
    const dept = orgDepartments(org).find(d => d.id === departmentId);
    await store.patch(`${kind === 'video' ? 'videos' : 'live_feeds'}/${id}`, {
      orgChannel: { orgId, orgName: org.name || '', departmentId, departmentName: dept?.name || '' },
    });
    forget(orgId); if (org.accountUid) forget(String(org.accountUid));
    return res.json({ ok: true });
  });

  r.post('/detach', async (req: Request, res: Response) => {
    const uid = await callerUid(req);
    if (!uid) return res.status(401).json({ error: 'Sign in first.' });
    const kind = String(req.body?.kind || ''), id = String(req.body?.id || '').trim();
    const orgId = String(req.body?.orgId || '').trim(), departmentId = String(req.body?.departmentId || '').trim();
    if ((kind !== 'video' && kind !== 'live') || badId(id) || badId(orgId) || badId(departmentId)) return res.status(400).json({ error: 'Bad request.' });
    const [target, org] = await Promise.all([readTarget(kind, id), store.get(`organizations/${orgId}`)]);
    if (!org) return res.status(404).json({ error: 'Organization not found.' });
    const owns = !!target && target.ownerId === uid;
    if (!owns && !canPostToDepartment(uid, org, await membershipFor(orgId, uid), departmentId)) return res.status(403).json({ error: 'Not allowed.' });
    const path = `reelloDeptChannels/${deptChannelId(orgId, departmentId)}`;
    const cur = await store.get(path);
    if (cur) {
      const field = kind === 'video' ? 'videoIds' : 'liveFeedIds';
      await store.patch(path, { [field]: ((cur[field] || []) as string[]).filter(x => x !== id), lastActivityAt: Date.now() });
    }
    if (target) await store.patch(`${kind === 'video' ? 'videos' : 'live_feeds'}/${id}`, { orgChannel: null });
    forget(orgId); if (org.accountUid) forget(String(org.accountUid));
    return res.json({ ok: true });
  });

  return r;
}

export const reelloOrgChannelsRouter = createReelloOrgChannelsRouter();
