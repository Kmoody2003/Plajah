// poolServer — Express routes for Event Photo Pools v2. Registered from server.ts with ONE call; every server helper is
// injected (`PoolDeps`), same shape as services/evite/eviteServer.ts, so this file never imports server.ts.
//
//  Link-holder (no sign-in needed)   GET  /api/pool/:id            pool page payload (window, phase, fence*, live, counts)
//                                    GET  /api/pool/:id/items      ?scope=public | mine (mine needs sign-in)
//  Signed in                         POST /api/pool/:id/checkin    {lat,lng,accuracy}  position used once, never stored
//                                    POST /api/pool/:id/check      {hashes[]}          which files are already in
//                                    POST /api/pool/:id/items      metadata after the client uploaded to Storage
//                                    POST /api/pool/:id/items/:itemId/visibility  {visibility}   owner only
//                                    POST /api/pool/:id/items/:itemId/delete                     owner only
//                                    POST /api/pool/:id/streams    {streamId, attach}  host, or a contributor's own stream
//  Host                              POST /api/pool/ensure         {eviteId | eventId}  create-or-return the event's pool
//                                    POST /api/pool/:id/items/:itemId/hide  {hidden}
//                                    POST /api/pool/:id/attendance
//                                    POST /api/pool/:id/settings   {visibility, uploadPolicy, overrides}
//  (* the fence centre is withheld when the evite hides its address, until the viewer checks in or is a host.)
//
// Collections (server-only, flat docs; the full object is JSON in `json`, query keys beside it). The browser never
// touches them, so no Firestore rules change is needed:
//   pool_meta/{poolId}                 poolId, json          resolved window / fence / hosts / settings / streams
//   pool_items/{poolId_uid_hash24}     poolId, ownerUid, visibility, hidden, hash, json
//   pool_checkins/{poolId_uid}         poolId, uid, at, json     (no coordinates, ever)
// Pools live in `event_photo_pools/{id}`. firestore.rules has NO rule for that collection, so the old client-side
// createEventPhotoPool is denied; POST /api/pool/ensure creates the pool server-side (idempotent) for an evite or a
// ticketed event and saves photoPoolId back onto it. The pool is linked to its evite (pool.eviteId, or a scan of the
// owner's evites for json.photoPoolId) or ticketed event (plajahEvents, else ppv_events).
import nodeCrypto from 'node:crypto';
import {
  type PoolMeta, type PoolItem, type CheckIn, type LatLng, type Geofence, type PoolStreamView, type EventWindow,
  isPoolId, isSha256Hex, clampStr, clampRadius, eventWindow, isLatLng, isCheckInEligible, CHECKIN_MESSAGES,
  canContribute, canChangeVisibility, canHide, isHost, listForViewer, toItemView, toPoolView, cleanItemInput,
  cleanPoolSettings, applyOverrides, geocodeQueryOf, checkinIdFor,
} from './poolCore';

type Row = Record<string, any>;
export interface PoolDeps {
  app: any; express: any; rateLimit: any; authMiddleware: any;
  firestoreRead: (c: string, id: string) => Promise<Row | null>;
  firestoreWrite: (c: string, id: string, data: object, requireSuccess?: boolean) => Promise<any>;
  firestoreCreateOnce: (c: string, id: string, data: Row) => Promise<'created' | 'exists' | 'error'>;
  firestoreDeleteDoc: (c: string, id: string) => Promise<void>;
  fsQueryDocs: (c: string, f: Array<{ field: string; op: string; value: any }>, n?: number) => Promise<Array<{ id: string; data: Row }>>;
  /** Verifies a Firebase ID token for routes that are public but personalise when signed in (server.ts: verifyFirebaseToken). */
  verifyIdToken?: (token: string) => Promise<{ uid: string; isAnonymous?: boolean } | null>;
  /** Forward geocoder for evites / events with an address but no coordinates. See nominatimGeocoder below. */
  geocode?: (query: string) => Promise<LatLng | null>;
  /** Only accept media URLs in this Storage bucket (server.ts: STORAGE_BUCKET). */
  storageBucket?: string;
  now?: () => number;
}

const META_TTL_MS = 10 * 60 * 1000;
const MAX_ITEMS_QUERY = 2000;
const MAX_ITEMS_PER_USER = 1000;
const MAX_STREAMS = 12;
const parse = <T,>(row: Row | null | undefined): T | null => { try { return row?.json ? JSON.parse(row.json) as T : null; } catch { return null; } };
const isStreamId = (s: any): s is string => typeof s === 'string' && /^[A-Za-z0-9_-]{4,80}$/.test(s);

export function registerPoolRoutes(d: PoolDeps) {
  const { app, express } = d;
  const now = () => (d.now ? d.now() : Date.now());
  const jsonBody = express.json({ limit: '32kb' });
  const readLimiter = d.rateLimit({ windowMs: 60 * 1000, max: 240, standardHeaders: true, legacyHeaders: false, message: { error: 'Slow down a little.' } });
  // Bulk sync posts one metadata call per file, so this is generous; uploads themselves go straight to Storage.
  const writeLimiter = d.rateLimit({ windowMs: 10 * 60 * 1000, max: 600, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many changes at once. Give it a minute.' } });
  // Tight: a check-in answer is a yes/no about where the venue is, so it must not be usable as a probe.
  const checkinLimiter = d.rateLimit({ windowMs: 10 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many check-in tries. Try again in a few minutes.' } });

  /** Public routes personalise when a valid token is present but never require one. */
  const softAuth = async (req: any, _res: any, next: any) => {
    if (!req.uid) {
      const h = String(req.headers?.authorization || '');
      if (h.startsWith('Bearer ') && d.verifyIdToken) {
        try { const r = await d.verifyIdToken(h.slice(7)); if (r?.uid) { req.uid = r.uid; req.isAnonymous = !!r.isAnonymous; } } catch { /* treat as signed out */ }
      }
    }
    return next();
  };
  const registered = (req: any, res: any) => {
    if (req.isAnonymous) { res.status(403).json({ error: 'Sign in with an account to add to the pool.', code: 'ANONYMOUS_NOT_ALLOWED' }); return false; }
    return true;
  };

  // ── resolve: event_photo_pools + evite / event → PoolMeta (cached in pool_meta) ─────────────────────────────
  const saveMeta = (m: PoolMeta) => d.firestoreWrite('pool_meta', m.poolId, { poolId: m.poolId, json: JSON.stringify(m) }, true);

  async function resolveMeta(poolId: string, opts: { force?: boolean; patch?: Partial<PoolMeta> } = {}): Promise<PoolMeta | null> {
    if (!isPoolId(poolId)) return null;
    const [pool, cachedRow] = await Promise.all([d.firestoreRead('event_photo_pools', poolId), d.firestoreRead('pool_meta', poolId)]);
    if (!pool) return null;
    const cached0 = parse<PoolMeta>(cachedRow);
    const cached: PoolMeta | null = opts.patch ? { ...(cached0 || {}), ...opts.patch } as PoolMeta : cached0;
    const t = now();
    if (cached && !opts.force && !opts.patch && Number.isFinite(cached.resolvedAt) && t - cached.resolvedAt < META_TTL_MS) return cached;

    const ownerId = String(pool.ownerId || '');
    const hosts = new Set<string>(ownerId ? [ownerId] : []);
    let source: PoolMeta['source'] = { kind: 'none' };
    let window: EventWindow | null = null, fence: Geofence | null = null, fenceSource: PoolMeta['fenceSource'];
    let timezone: string | undefined, placeLabel: string | undefined, addressPrivate = false, geocodeQuery = '';
    let eventId = clampStr(pool.eventId, 80);

    // Evite that owns this pool: pool.eviteId (pools made by /api/pool/ensure), else scan the owner's evites for the
    // one whose photoPoolId points here (pools made by the older client path).
    if (ownerId) {
      let inv: any = null;
      if (pool.eviteId && isPoolId(String(pool.eviteId))) {
        const one = parse<any>(await d.firestoreRead('evites', String(pool.eviteId)));
        if (one && one.photoPoolId === poolId) inv = one;
      }
      if (!inv) {
        const rows = await d.fsQueryDocs('evites', [{ field: 'ownerUid', op: 'EQUAL', value: ownerId }], 200);
        inv = rows.map(r => parse<any>(r.data)).find(x => x && x.photoPoolId === poolId) || null;
      }
      if (inv) {
        source = { kind: 'evite', id: inv.id };
        hosts.add(inv.ownerUid); (inv.coHostUids || []).forEach((u: string) => u && hosts.add(u));
        const f = inv.fields || {};
        window = eventWindow(f.startsAt, f.endsAt);
        timezone = f.timezone || undefined;
        placeLabel = clampStr(f.venueName, 80) || undefined;
        addressPrivate = !!inv.settings?.revealAddressAfterYes;
        geocodeQuery = geocodeQueryOf(f.address || f.venueName);
        if (!eventId && inv.eventId) eventId = clampStr(inv.eventId, 80);
      }
    }
    // Ticketed event (coordinates when the organiser set them), else a PPV event (virtual: time only).
    if (eventId && isPoolId(eventId)) {
      const ev = await d.firestoreRead('plajahEvents', eventId);
      if (ev) {
        if (source.kind === 'none') source = { kind: 'event', id: eventId };
        if (ev.creatorUid) hosts.add(String(ev.creatorUid));
        window = eventWindow(Number(ev.startDate), Number(ev.endDate)) || window;
        timezone = ev.timezone || timezone;
        placeLabel = clampStr(ev.venueName, 80) || placeLabel;
        const p = { lat: Number(ev.lat), lng: Number(ev.lng) };
        if (isLatLng(p)) { fence = { ...p, radiusM: clampRadius() }; fenceSource = 'event'; }
        else geocodeQuery = geocodeQueryOf(ev.venueAddress, ev.city, ev.state, ev.country) || geocodeQuery;
      } else {
        const ppv = await d.firestoreRead('ppv_events', eventId);
        if (ppv) {
          if (source.kind === 'none') source = { kind: 'ppv', id: eventId };
          if (ppv.ownerId) hosts.add(String(ppv.ownerId));
          const s = Number(ppv.startTime);
          window = window || eventWindow(s, s + (Number(ppv.duration) || 0) * 60_000);
        }
      }
    }
    // Geocode the address once per distinct address; the answer lives in pool_meta for at most 30 days
    // (Google Maps Platform terms cap cached coordinates at 30 days), then it is looked up again.
    const fresh = !!cached?.geocodedAt && t - cached.geocodedAt < GEOCODE_TTL_MS;
    let geocoded: LatLng | null | undefined = cached?.geocodeQuery === geocodeQuery && fresh ? cached?.geocoded : undefined;
    let geocodedAt = geocoded === undefined ? undefined : cached?.geocodedAt;
    if (!fence && geocodeQuery && geocoded === undefined && d.geocode) {
      try { geocoded = await d.geocode(geocodeQuery); geocodedAt = t; } catch { geocoded = undefined; }
    }
    if (!fence && geocoded && isLatLng(geocoded)) { fence = { lat: geocoded.lat, lng: geocoded.lng, radiusM: clampRadius() }; fenceSource = 'geocode'; }

    const applied = applyOverrides({ window, fence, fenceSource }, cached?.overrides);
    const meta: PoolMeta = {
      poolId, title: clampStr(pool.title, 120) || 'Event photos', description: clampStr(pool.description, 500) || undefined,
      hostUids: [...hosts], source, timezone, window: applied.window, fence: applied.fence, fenceSource: applied.fenceSource,
      placeLabel, addressPrivate, geocodeQuery: geocodeQuery || undefined, geocoded: geocoded === undefined ? (fresh ? cached?.geocoded : undefined) : geocoded, geocodedAt: geocoded === undefined ? (fresh ? cached?.geocodedAt : undefined) : geocodedAt,
      visibility: cached?.visibility || 'guests', uploadPolicy: cached?.uploadPolicy || 'link',
      streamIds: cached?.streamIds || [], overrides: cached?.overrides,
      resolvedAt: t, createdAt: cached?.createdAt || t, updatedAt: t,
    };
    if (meta.geocoded === undefined) { delete meta.geocoded; delete meta.geocodedAt; }
    await saveMeta(meta).catch(() => {});
    return meta;
  }

  // ── loaders ───────────────────────────────────────────────────────────────
  const loadItems = async (poolId: string, filters: Array<{ field: string; op: string; value: any }> = []) =>
    (await d.fsQueryDocs('pool_items', [{ field: 'poolId', op: 'EQUAL', value: poolId }, ...filters], MAX_ITEMS_QUERY)).map(r => parse<PoolItem>(r.data)).filter(Boolean) as PoolItem[];
  const loadItem = async (poolId: string, itemId: any): Promise<PoolItem | null> => {
    if (typeof itemId !== 'string' || itemId.length > 300 || !itemId.startsWith(`${poolId}_`) || !/^[A-Za-z0-9_-]+$/.test(itemId)) return null;
    const it = parse<PoolItem>(await d.firestoreRead('pool_items', itemId));
    return it && it.poolId === poolId ? it : null;
  };
  const saveItem = (it: PoolItem) => d.firestoreWrite('pool_items', it.id, { poolId: it.poolId, ownerUid: it.ownerUid, visibility: it.visibility, hidden: it.hiddenByHost, hash: it.hash, json: JSON.stringify(it) }, true);
  const loadCheckin = async (poolId: string, uid?: string | null) => (uid ? parse<CheckIn>(await d.firestoreRead('pool_checkins', checkinIdFor(poolId, uid))) : null);
  const loadCheckins = async (poolId: string) => (await d.fsQueryDocs('pool_checkins', [{ field: 'poolId', op: 'EQUAL', value: poolId }], MAX_ITEMS_QUERY)).map(r => parse<CheckIn>(r.data)).filter(Boolean) as CheckIn[];
  const profile = async (uid: string) => { const u = await d.firestoreRead('users', uid).catch(() => null); return { name: clampStr(u?.displayName || u?.name || u?.username, 60) || undefined, photoURL: typeof u?.photoURL === 'string' && /^https:\/\//.test(u.photoURL) ? u.photoURL.slice(0, 500) : undefined }; };

  async function loadStreams(meta: PoolMeta, viewerIsHost: boolean): Promise<PoolStreamView[]> {
    const linked = await d.fsQueryDocs('streams', [{ field: 'photoPoolId', op: 'EQUAL', value: meta.poolId }], MAX_STREAMS).catch(() => []);
    const ids = [...new Set([...meta.streamIds, ...linked.map(r => r.id)])].filter(isStreamId).slice(0, MAX_STREAMS);
    const rows = await Promise.all(ids.map(async id => ({ id, s: await d.firestoreRead('streams', id).catch(() => null) })));
    return rows.filter(r => r.s && (!r.s.isPrivate || viewerIsHost)).map(({ id, s }) => ({
      id, title: clampStr(s!.title, 120) || 'Live', ownerName: clampStr(s!.ownerName, 60) || undefined, ownerUid: s!.ownerUid || undefined,
      isLive: s!.isLive === true, startedAt: Number(s!.startedAt) || undefined,
    }));
  }

  async function viewFor(meta: PoolMeta, uid?: string | null) {
    const host = isHost(meta, uid);
    const [mine, pub, checkins, streams] = await Promise.all([
      loadCheckin(meta.poolId, uid), loadItems(meta.poolId, [{ field: 'visibility', op: 'EQUAL', value: 'public' }]),
      loadCheckins(meta.poolId), loadStreams(meta, host),
    ]);
    return toPoolView(meta, {
      uid, checkedIn: !!mine, checkedInAt: mine?.at, now: now(),
      publicItems: listForViewer(pub, { uid, isHost: false }, 'public').length, attendees: checkins.length, streams,
    });
  }

  const withPool = (fn: (req: any, res: any, meta: PoolMeta) => Promise<any>, label: string) => async (req: any, res: any) => {
    try {
      const meta = await resolveMeta(String(req.params?.id || ''));
      if (!meta) return res.status(404).json({ error: 'This photo pool isn’t available.' });
      await fn(req, res, meta);
    } catch (err: any) { console.error(`/api/pool ${label}`, err?.message || err); res.status(500).json({ error: 'Something went wrong with the photo pool. Try again.' }); }
  };
  const hostOnly = (meta: PoolMeta, req: any, res: any) => { if (!isHost(meta, req.uid)) { res.status(403).json({ error: 'Only the host can do that.' }); return false; } return true; };

  // ── link-holder reads ─────────────────────────────────────────────────────
  app.get('/api/pool/:id', readLimiter, softAuth, withPool(async (req, res, meta) => {
    res.set('Cache-Control', 'no-store').json({ pool: await viewFor(meta, req.uid) });
  }, 'get'));

  app.get('/api/pool/:id/items', readLimiter, softAuth, withPool(async (req, res, meta) => {
    const scope = req.query?.scope === 'mine' ? 'mine' : 'public';
    const viewer = { uid: req.uid || null, isHost: isHost(meta, req.uid) };
    if (scope === 'mine' && !viewer.uid) return res.status(401).json({ error: 'Sign in to see your photos.' });
    const rows = scope === 'mine'
      ? await loadItems(meta.poolId, [{ field: 'ownerUid', op: 'EQUAL', value: viewer.uid }])
      : await loadItems(meta.poolId, [{ field: 'visibility', op: 'EQUAL', value: 'public' }]);
    res.set('Cache-Control', 'no-store').json({ items: listForViewer(rows, viewer, scope).map(i => toItemView(i, viewer)) });
  }, 'items'));

  // ── check-in: the position decides yes/no and is then dropped ────────────────
  app.post('/api/pool/:id/checkin', checkinLimiter, d.authMiddleware, jsonBody, withPool(async (req, res, meta) => {
    if (!registered(req, res)) return;
    const existing = await loadCheckin(meta.poolId, req.uid);
    if (existing) return res.json({ checkedIn: true, at: existing.at, pool: await viewFor(meta, req.uid) });
    const b = req.body || {};
    const pos = { lat: Number(b.lat), lng: Number(b.lng), accuracy: b.accuracy === undefined ? undefined : Number(b.accuracy) };
    const decision = isCheckInEligible(meta, pos, now());
    if (decision.ok === false) {
      // No distance when the address is private: a distance answer would let anyone triangulate the venue.
      const canShowDistance = !meta.addressPrivate || isHost(meta, req.uid);
      return res.status(409).json({ error: CHECKIN_MESSAGES[decision.reason], reason: decision.reason, ...(canShowDistance && decision.distanceM !== undefined ? { distanceM: decision.distanceM } : {}) });
    }
    const who = await profile(req.uid);
    const ci: CheckIn = { id: checkinIdFor(meta.poolId, req.uid), poolId: meta.poolId, uid: req.uid, at: now(), method: 'geo', ...(who.name ? { name: who.name } : {}), ...(who.photoURL ? { photoURL: who.photoURL } : {}) };
    const r = await d.firestoreCreateOnce('pool_checkins', ci.id, { poolId: ci.poolId, uid: ci.uid, at: ci.at, json: JSON.stringify(ci) });
    if (r === 'error') return res.status(500).json({ error: 'Could not check you in. Try again.' });
    res.json({ checkedIn: true, at: ci.at, pool: await viewFor(meta, req.uid) });
  }, 'checkin'));

  // ── sync ─────────────────────────────────────────────────────────────────
  app.post('/api/pool/:id/check', writeLimiter, d.authMiddleware, jsonBody, withPool(async (req, res, meta) => {
    const hashes = (Array.isArray(req.body?.hashes) ? req.body.hashes : []).map((h: any) => String(h).toLowerCase()).filter(isSha256Hex).slice(0, 500);
    const want = new Set<string>(hashes);
    const [mine, pub] = await Promise.all([
      loadItems(meta.poolId, [{ field: 'ownerUid', op: 'EQUAL', value: req.uid }]),
      loadItems(meta.poolId, [{ field: 'visibility', op: 'EQUAL', value: 'public' }]),
    ]);
    res.json({
      mine: [...new Set(mine.map(i => i.hash).filter(h => want.has(h)))],
      pool: [...new Set(pub.filter(i => !i.hiddenByHost && i.ownerUid !== req.uid).map(i => i.hash).filter(h => want.has(h)))],
    });
  }, 'check'));

  app.post('/api/pool/:id/items', writeLimiter, d.authMiddleware, jsonBody, withPool(async (req, res, meta) => {
    if (!registered(req, res)) return;
    const checkedIn = !!(await loadCheckin(meta.poolId, req.uid));
    const refusal = canContribute(meta, req.uid, checkedIn, now());
    if (refusal) return res.status(403).json({ error: refusal });
    const who = await profile(req.uid);
    const clean = cleanItemInput(req.body, { uid: req.uid, poolId: meta.poolId, bucket: d.storageBucket, now: now(), ownerName: who.name, window: meta.window });
    if (clean.ok === false) return res.status(400).json({ error: clean.error });
    const item = clean.value;
    const existing = await loadItem(meta.poolId, item.id);
    if (existing) return res.json({ item: toItemView(existing, { uid: req.uid, isHost: isHost(meta, req.uid) }), duplicate: true });
    const mineCount = (await d.fsQueryDocs('pool_items', [{ field: 'poolId', op: 'EQUAL', value: meta.poolId }, { field: 'ownerUid', op: 'EQUAL', value: req.uid }], MAX_ITEMS_PER_USER + 1)).length;
    if (mineCount >= MAX_ITEMS_PER_USER) return res.status(409).json({ error: `You’ve added ${MAX_ITEMS_PER_USER} items to this pool, which is the limit.` });
    const r = await d.firestoreCreateOnce('pool_items', item.id, { poolId: item.poolId, ownerUid: item.ownerUid, visibility: item.visibility, hidden: false, hash: item.hash, json: JSON.stringify(item) });
    if (r === 'error') return res.status(500).json({ error: 'Could not add that file. Try again.' });
    if (r === 'exists') { const again = await loadItem(meta.poolId, item.id); return res.json({ item: again ? toItemView(again, { uid: req.uid, isHost: isHost(meta, req.uid) }) : null, duplicate: true }); }
    res.json({ item: toItemView(item, { uid: req.uid, isHost: isHost(meta, req.uid) }) });
  }, 'add'));

  app.post('/api/pool/:id/items/:itemId/visibility', writeLimiter, d.authMiddleware, jsonBody, withPool(async (req, res, meta) => {
    const item = await loadItem(meta.poolId, req.params.itemId);
    if (!item) return res.status(404).json({ error: 'That photo is no longer here.' });
    const to = req.body?.visibility === 'public' ? 'public' : req.body?.visibility === 'private' ? 'private' : null;
    if (!to) return res.status(400).json({ error: 'Choose Private or Public.' });
    const refusal = canChangeVisibility(item, req.uid, to);
    if (refusal) return res.status(403).json({ error: refusal });
    const next: PoolItem = { ...item, visibility: to, updatedAt: now() };
    await saveItem(next);
    res.json({ item: toItemView(next, { uid: req.uid, isHost: isHost(meta, req.uid) }) });
  }, 'visibility'));

  app.post('/api/pool/:id/items/:itemId/delete', writeLimiter, d.authMiddleware, jsonBody, withPool(async (req, res, meta) => {
    const item = await loadItem(meta.poolId, req.params.itemId);
    if (!item) return res.json({ ok: true, storagePaths: [] });
    if (item.ownerUid !== req.uid) return res.status(403).json({ error: isHost(meta, req.uid) ? 'Hosts can hide photos, but only the person who added one can delete it.' : 'Only the person who added this can delete it.' });
    await d.firestoreDeleteDoc('pool_items', item.id);
    // The uploader's client deletes the files (storage.rules let owners write users/{uid}/**).
    res.json({ ok: true, storagePaths: item.storagePaths });
  }, 'delete'));

  // ── host moderation ──────────────────────────────────────────────────────
  app.post('/api/pool/:id/items/:itemId/hide', writeLimiter, d.authMiddleware, jsonBody, withPool(async (req, res, meta) => {
    const item = await loadItem(meta.poolId, req.params.itemId);
    if (!item) return res.status(404).json({ error: 'That photo is no longer here.' });
    const hidden = req.body?.hidden !== false;
    if (hidden) { const refusal = canHide(meta, item, req.uid); if (refusal) return res.status(403).json({ error: refusal }); }
    else if (!isHost(meta, req.uid)) return res.status(403).json({ error: 'Only the host can do that.' });
    const next: PoolItem = { ...item, hiddenByHost: hidden, updatedAt: now() };
    if (hidden) { next.hiddenAt = now(); next.hiddenBy = req.uid; } else { delete next.hiddenAt; delete next.hiddenBy; }
    await saveItem(next);
    res.json({ item: toItemView(next, { uid: req.uid, isHost: true }) });
  }, 'hide'));

  app.post('/api/pool/:id/attendance', readLimiter, d.authMiddleware, jsonBody, withPool(async (req, res, meta) => {
    if (!hostOnly(meta, req, res)) return;
    const list = (await loadCheckins(meta.poolId)).sort((a, b) => a.at - b.at).map(c => ({ uid: c.uid, name: c.name, photoURL: c.photoURL, at: c.at, method: c.method }));
    res.json({ attendees: list, count: list.length });
  }, 'attendance'));

  app.post('/api/pool/:id/settings', writeLimiter, d.authMiddleware, jsonBody, withPool(async (req, res, meta) => {
    if (!hostOnly(meta, req, res)) return;
    const clean = cleanPoolSettings(req.body || {}, meta);
    if (clean.ok === false) return res.status(400).json({ error: clean.error });
    const next = await resolveMeta(meta.poolId, { force: true, patch: clean.value });
    res.json({ pool: await viewFor(next || meta, req.uid) });
  }, 'settings'));

  // ── auto-create: every evite / ticketed event gets a pool (host only, idempotent) ─────────────────────────
  const newPoolId = () => `pool_${Date.now().toString(36)}${nodeCrypto.randomBytes(5).toString('hex')}`;
  const poolExists = async (id: any) => isPoolId(id) && !!(await d.firestoreRead('event_photo_pools', id));
  async function createPoolDoc(o: { ownerId: string; title: string; eventId?: string; eviteId?: string }): Promise<string | null> {
    for (let i = 0; i < 4; i++) {
      const id = newPoolId();
      const r = await d.firestoreCreateOnce('event_photo_pools', id, {
        id, ownerId: o.ownerId, title: clampStr(o.title, 120) || 'Event photos', description: 'Photos and videos from the event.',
        eventId: o.eventId || '', eviteId: o.eviteId || '', mediaIds: [], inviteLink: `/pool/${id}`, timestamp: now(),
      });
      if (r === 'created') return id;
      if (r === 'error') return null;
    }
    return null;
  }

  app.post('/api/pool/ensure', writeLimiter, d.authMiddleware, jsonBody, async (req: any, res: any) => {
    try {
      if (!registered(req, res)) return;
      const eviteId = clampStr(req.body?.eviteId, 40), eventId = clampStr(req.body?.eventId, 80);
      if (eviteId) {
        if (!isPoolId(eviteId)) return res.status(400).json({ error: 'Bad invitation id.' });
        const row = await d.firestoreRead('evites', eviteId);
        const inv = parse<any>(row);
        if (!inv) return res.status(404).json({ error: 'That invitation no longer exists.' });
        if (inv.ownerUid !== req.uid && !(inv.coHostUids || []).includes(req.uid)) return res.status(403).json({ error: 'Only the host can do that.' });
        if (await poolExists(inv.photoPoolId)) return res.json({ poolId: inv.photoPoolId, created: false });
        const id = await createPoolDoc({ ownerId: inv.ownerUid, title: `${clampStr(inv.fields?.headline, 90) || 'Event'} · photos`, eventId: inv.eventId, eviteId });
        if (!id) return res.status(500).json({ error: 'Could not create the photo pool. Try again.' });
        inv.photoPoolId = id; inv.updatedAt = now();
        await d.firestoreWrite('evites', eviteId, { json: JSON.stringify(inv) }, true);
        return res.json({ poolId: id, created: true });
      }
      if (eventId) {
        if (!isPoolId(eventId)) return res.status(400).json({ error: 'Bad event id.' });
        const ev = await d.firestoreRead('plajahEvents', eventId);
        if (!ev) return res.status(404).json({ error: 'That event no longer exists.' });
        if (ev.creatorUid !== req.uid) return res.status(403).json({ error: 'Only the organiser can do that.' });
        if (await poolExists(ev.photoPoolId)) return res.json({ poolId: ev.photoPoolId, created: false });
        const id = await createPoolDoc({ ownerId: req.uid, title: `${clampStr(ev.title, 90) || 'Event'} · photos`, eventId });
        if (!id) return res.status(500).json({ error: 'Could not create the photo pool. Try again.' });
        await d.firestoreWrite('plajahEvents', eventId, { photoPoolId: id }, true);
        return res.json({ poolId: id, created: true });
      }
      res.status(400).json({ error: 'Say which invitation or event the pool is for.' });
    } catch (err: any) { console.error('/api/pool/ensure', err?.message || err); res.status(500).json({ error: 'Could not create the photo pool.' }); }
  });

  // ── live streams (the one streams/{id} engine; we only keep references) ─────
  app.post('/api/pool/:id/streams', writeLimiter, d.authMiddleware, jsonBody, withPool(async (req, res, meta) => {
    const streamId = req.body?.streamId;
    if (!isStreamId(streamId)) return res.status(400).json({ error: 'That isn’t a live stream id.' });
    const attach = req.body?.attach !== false;
    const s = await d.firestoreRead('streams', streamId);
    const host = isHost(meta, req.uid);
    const ownsStream = !!s && s.ownerUid === req.uid;
    if (attach) {
      if (!s) return res.status(404).json({ error: 'That live stream doesn’t exist.' });
      if (!host) {
        if (!ownsStream) return res.status(403).json({ error: 'You can only add your own live stream.' });
        const refusal = canContribute(meta, req.uid, !!(await loadCheckin(meta.poolId, req.uid)), now());
        if (refusal) return res.status(403).json({ error: refusal });
      }
      if (!meta.streamIds.includes(streamId)) {
        if (meta.streamIds.length >= MAX_STREAMS) return res.status(409).json({ error: `A pool can show up to ${MAX_STREAMS} live streams.` });
        meta.streamIds = [...meta.streamIds, streamId];
      }
    } else {
      if (!host && !ownsStream) return res.status(403).json({ error: 'Only the host or the streamer can remove it.' });
      meta.streamIds = meta.streamIds.filter(x => x !== streamId);
    }
    meta.updatedAt = now();
    await saveMeta(meta);
    res.json({ pool: await viewFor(meta, req.uid) });
  }, 'streams'));
}

// ── geocoding ───────────────────────────────────────────────────────────────

export const GEOCODE_TTL_MS = 30 * 864e5;

/**
 * OpenStreetMap Nominatim forward geocoder that follows the usage policy: an identifying User-Agent, at most one
 * request per second (calls are serialised), results cached in memory (and, by the caller, in pool_meta).
 * https://operations.osmfoundation.org/policies/nominatim/
 */
export function nominatimGeocoder(opts: { userAgent: string; email?: string; endpoint?: string; fetchImpl?: typeof fetch; minIntervalMs?: number }) {
  const endpoint = (opts.endpoint || 'https://nominatim.openstreetmap.org').replace(/\/$/, '');
  const f = opts.fetchImpl || fetch;
  const gap = opts.minIntervalMs ?? 1100;
  const cache = new Map<string, LatLng | null>();
  let last = 0;
  let chain: Promise<unknown> = Promise.resolve();
  return (query: string): Promise<LatLng | null> => {
    const key = query.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!key) return Promise.resolve(null);
    if (cache.has(key)) return Promise.resolve(cache.get(key)!);
    const run = async (): Promise<LatLng | null> => {
      if (cache.has(key)) return cache.get(key)!;
      const wait = last + gap - Date.now();
      if (wait > 0) await new Promise(r => setTimeout(r, wait));
      last = Date.now();
      const url = `${endpoint}/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}${opts.email ? `&email=${encodeURIComponent(opts.email)}` : ''}`;
      try {
        const res = await f(url, { headers: { 'User-Agent': opts.userAgent, 'Accept-Language': 'en' }, signal: AbortSignal.timeout(8000) } as any);
        if (!res.ok) return null; // not cached: try again next time
        const arr: any = await res.json();
        const hit = Array.isArray(arr) && arr[0] ? { lat: Number(arr[0].lat), lng: Number(arr[0].lon) } : null;
        const v = hit && isLatLng(hit) ? hit : null;
        if (cache.size > 2000) cache.clear();
        cache.set(key, v);
        return v;
      } catch { return null; }
    };
    const p = chain.then(run, run);
    chain = p.catch(() => null);
    return p;
  };
}

/**
 * Google Maps Geocoding API forward geocoder — Plajah's default for location services (Nominatim only when Google
 * is ruled out). Results are cached in memory (and, by the caller, in pool_meta), so each address costs one lookup.
 * Only OK answers are cached as hits and ZERO_RESULTS as misses; quota/denied/errors are retried next time.
 * https://developers.google.com/maps/documentation/geocoding/requests-geocoding
 */
export function googleGeocoder(opts: { apiKey: string; region?: string; fetchImpl?: typeof fetch }) {
  const f = opts.fetchImpl || fetch;
  const cache = new Map<string, LatLng | null>();
  return async (query: string): Promise<LatLng | null> => {
    const key = query.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!key || !opts.apiKey) return null;
    if (cache.has(key)) return cache.get(key)!;
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}${opts.region ? `&region=${encodeURIComponent(opts.region)}` : ''}&key=${encodeURIComponent(opts.apiKey)}`;
    try {
      const res = await f(url, { signal: AbortSignal.timeout(8000) } as any);
      if (!res.ok) return null;
      const body: any = await res.json();
      if (body?.status !== 'OK' && body?.status !== 'ZERO_RESULTS') return null;   // OVER_QUERY_LIMIT, REQUEST_DENIED…: not cached
      const loc = body?.results?.[0]?.geometry?.location;
      const hit = loc ? { lat: Number(loc.lat), lng: Number(loc.lng) } : null;
      const v = hit && isLatLng(hit) ? hit : null;
      if (cache.size > 2000) cache.clear();
      cache.set(key, v);
      return v;
    } catch { return null; }
  };
}
