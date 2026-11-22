/**
 * /api/elevate/prayer-call — Prayer Call: a church ministry's instant live prayer room.
 * Rules live in services/elevate/prayerCallCore.ts; this router is the only writer of
 * prayerCalls/{orgId__ministryId} (that collection has no client rules, so clients can neither read
 * nor write it — nothing about a call can surface in a feed or a public page).
 *
 *   GET  /?orgId&ministryId[&here=1]  → { call, canStart, canJoin }   (call is null for non-members)
 *   POST /start    { orgId, ministryId, title?, minutes?, requestsOn? }   leaders only
 *   POST /token    { orgId, ministryId }   → { available:false } | { available:true, url, token, room, identity, cap }
 *   POST /end      { orgId, ministryId }                                  leaders only
 *   POST /remove   { orgId, ministryId, uid }                             leaders only
 *   POST /leave    { orgId, ministryId }
 *   POST /requests { orgId, ministryId, op:'add', text } | { op:'prayed'|'unprayed'|'delete', id } | { op:'toggle', on }
 *
 * The 60-minute limit is the server's: endsAt is set here from the server clock, every request
 * settles an expired call (status ENDED + LiveKit DeleteRoom, which disconnects everyone), each
 * instance also arms a timer for the calls it has seen, LiveKit tokens expire at endsAt, and no token
 * is minted for an ended call or a removed person.
 */
import express, { Router } from 'express';
import { randomBytes } from 'node:crypto';
import {
  PRAYER_CALL_CAP, canJoinPrayerCall, canLeadPrayerCall, callKey, dropPresence, editRequest, addRequest,
  endCall, findMinistry, isOver, newCall, roomNameFor, touchPresence, validId, viewFor,
  type PrayerCallDoc,
} from '../services/elevate/prayerCallCore';
import {
  createRoomService, deleteRoom, mintJoinToken, removeParticipant, type LiveKitConfig,
} from '../services/meetings/livekitServer';
import type { Organization, OrgMembership } from '../types';

export interface PrayerRoomOps {
  roomState(room: string): Promise<{ count: number; maxParticipants: number | null }>;
  ensureRoom(room: string, maxParticipants: number, metadata: string): Promise<void>;
  deleteRoom(room: string): Promise<void>;
  removeParticipant(room: string, identity: string): Promise<void>;
}

export interface PrayerCallStore {
  /** Raw stored doc (see toStored/fromStored). */
  get(key: string): Promise<Record<string, any> | null>;
  put(key: string, raw: Record<string, any>): Promise<boolean>;
}

export interface PrayerCallDeps {
  authMiddleware: any;
  limiter?: any;
  getOrg: (orgId: string) => Promise<Organization | null>;
  /** The caller's membership in that org (any status; the core checks ACTIVE). */
  getMembership: (orgId: string, uid: string) => Promise<OrgMembership | null>;
  displayName: (uid: string) => Promise<string>;
  store: PrayerCallStore;
  /** null = LiveKit not configured: the room, countdown and prayer list still work, cameras don't. */
  livekit: () => LiveKitConfig | null;
  rooms?: (cfg: LiveKitConfig) => PrayerRoomOps;
  now?: () => number;
  newId?: () => string;
  /** Tests turn the per-instance end timers off. */
  timers?: boolean;
}

const defaultRooms = (cfg: LiveKitConfig): PrayerRoomOps => {
  const svc = createRoomService(cfg);
  return {
    roomState: room => svc.roomState(room),
    ensureRoom: (room, max, meta) => svc.ensureRoom(room, max, meta),
    deleteRoom: room => deleteRoom(cfg, room),
    removeParticipant: (room, id) => removeParticipant(cfg, room, id),
  };
};

/** Firestore can't hold undefined, and a PATCH keeps fields it isn't told about, so clear them explicitly. */
export function toStored(doc: PrayerCallDoc): Record<string, any> {
  return { endedAt: null, endedBy: null, endReason: null, ...doc };
}
export function fromStored(raw: Record<string, any> | null): PrayerCallDoc | null {
  if (!raw || !raw.callId) return null;
  const d: any = { ...raw };
  for (const k of ['endedAt', 'endedBy', 'endReason']) if (d[k] == null) delete d[k];
  d.removedUids = Array.isArray(d.removedUids) ? d.removedUids : [];
  d.requests = Array.isArray(d.requests) ? d.requests : [];
  d.present = d.present && typeof d.present === 'object' ? d.present : {};
  return d as PrayerCallDoc;
}

export function createPrayerCallRouter(deps: PrayerCallDeps): Router {
  const r = Router();
  const now = deps.now || (() => Date.now());
  const newId = deps.newId || (() => randomBytes(12).toString('base64url'));
  const rooms = (cfg: LiveKitConfig) => (deps.rooms ? deps.rooms(cfg) : defaultRooms(cfg));
  const mw = deps.limiter ? [deps.limiter, deps.authMiddleware] : [deps.authMiddleware];
  const timers = new Map<string, { callId: string; t: ReturnType<typeof setTimeout> }>();

  const save = (doc: PrayerCallDoc) => deps.store.put(doc.key, toStored(doc));

  const closeRoom = (call: PrayerCallDoc) => {
    const cfg = deps.livekit();
    if (!cfg) return;
    void rooms(cfg).deleteRoom(roomNameFor(call.callId)).catch(e => console.warn('[prayer-call] delete room failed:', e?.message || e));
  };

  /** End an expired call (idempotent). Returns the call as it now stands. */
  const settle = async (call: PrayerCallDoc | null): Promise<PrayerCallDoc | null> => {
    if (!call || call.status !== 'LIVE') return call;
    if (now() < call.endsAt) { arm(call); return call; }
    const ended = endCall(call, now(), 'TIME');
    await save(ended);
    closeRoom(call);
    return ended;
  };

  /** This instance ends the call on time even if nobody asks it anything. */
  function arm(call: PrayerCallDoc) {
    if (deps.timers === false) return;
    const cur = timers.get(call.key);
    if (cur?.callId === call.callId) return;
    if (cur) clearTimeout(cur.t);
    const t = setTimeout(async () => {
      timers.delete(call.key);
      const fresh = fromStored(await deps.store.get(call.key));
      if (fresh && fresh.callId === call.callId) await settle(fresh).catch(() => {});
    }, Math.max(0, call.endsAt - now()) + 500);
    (t as any).unref?.();
    timers.set(call.key, { callId: call.callId, t });
  }

  /** Loads org, membership, ministry and both decisions for the caller. */
  async function context(req: any, src: any) {
    const orgId = String(src?.orgId || '');
    const ministryId = String(src?.ministryId || '');
    if (!validId(orgId) || !validId(ministryId)) return { error: 400 as const };
    const uid = String(req.uid);
    const [org, member] = await Promise.all([deps.getOrg(orgId), deps.getMembership(orgId, uid)]);
    const lead = canLeadPrayerCall(uid, member, org, ministryId);
    const join = canJoinPrayerCall(uid, member, org, ministryId);
    return { uid, org, member, orgId, ministryId, key: callKey(orgId, ministryId), lead, join };
  }

  const load = async (key: string) => settle(fromStored(await deps.store.get(key)));

  r.get('/', ...mw, async (req: any, res: any) => {
    res.set('Cache-Control', 'private, no-store');
    const c = await context(req, req.query);
    if ('error' in c) return res.status(400).json({ error: 'Bad ministry.' });
    // Non-members learn nothing — not even whether a call is live.
    if (!c.join.ok) return res.json({ call: null, canStart: false, canJoin: false, reason: c.join.reason });
    let call = await load(c.key);
    if (call && call.status === 'LIVE' && req.query.here === '1' && !call.removedUids.includes(c.uid)) {
      const prev = call.present?.[c.uid];
      // Throttle presence writes: one per person per ~20 s.
      if (!prev || now() - prev.lastSeen > 20_000) {
        call = { ...call, present: touchPresence(call, c.uid, prev?.name || await deps.displayName(c.uid), now()) };
        await save(call);
      }
    }
    const showEnded = call && call.status === 'ENDED' && now() - (call.endedAt || 0) < 10 * 60_000;
    res.json({
      call: call && (call.status === 'LIVE' || showEnded) ? viewFor(call, c.uid, c.lead.ok, now()) : null,
      canStart: c.lead.ok,
      canJoin: true,
      media: !!deps.livekit(),
    });
  });

  r.post('/start', ...mw, express.json({ limit: '4kb' }), async (req: any, res: any) => {
    const c = await context(req, req.body);
    if ('error' in c) return res.status(400).json({ error: 'Bad ministry.' });
    if (!c.lead.ok) return res.status(403).json({ error: c.lead.message, reason: c.lead.reason });
    const existing = await load(c.key);
    if (existing && !isOver(existing, now())) return res.json({ call: viewFor(existing, c.uid, true, now()), existing: true });
    const ministry = findMinistry(c.org, c.ministryId)!;
    const call = newCall({
      org: c.org!, ministry, uid: c.uid, name: await deps.displayName(c.uid), now: now(), callId: newId(),
      title: req.body?.title, minutes: req.body?.minutes, requestsOn: req.body?.requestsOn,
    });
    if (!await save(call)) return res.status(503).json({ error: 'Could not start the call. Try again.' });
    arm(call);
    res.json({ call: viewFor(call, c.uid, true, now()) });
  });

  r.post('/token', ...mw, express.json({ limit: '4kb' }), async (req: any, res: any) => {
    res.set('Cache-Control', 'private, no-store');
    const c = await context(req, req.body);
    if ('error' in c) return res.status(400).json({ error: 'Bad ministry.' });
    if (!c.join.ok) return res.status(403).json({ error: c.join.message, reason: c.join.reason });
    const call = await load(c.key);
    if (isOver(call, now())) return res.status(410).json({ error: 'This Prayer Call has ended.', reason: 'ENDED' });
    if (call!.removedUids.includes(c.uid)) return res.status(403).json({ error: 'A leader removed you from this call.', reason: 'REMOVED' });
    const cfg = deps.livekit();
    if (!cfg) return res.json({ available: false });
    const room = roomNameFor(call!.callId);
    const ops = rooms(cfg);
    try {
      const state = await ops.roomState(room);
      if (state.count >= (state.maxParticipants || PRAYER_CALL_CAP)) {
        return res.status(403).json({ error: `This Prayer Call is full (${PRAYER_CALL_CAP} people).`, reason: 'FULL' });
      }
      if (state.maxParticipants == null) {
        await ops.ensureRoom(room, PRAYER_CALL_CAP, JSON.stringify({ ownerKind: 'org', ownerId: c.orgId, kind: 'prayer-call', cap: PRAYER_CALL_CAP }));
      }
    } catch (e: any) {
      console.warn('[prayer-call] livekit failed:', e?.message || e);
      return res.json({ available: false, degraded: true });
    }
    const ttlSeconds = Math.max(30, Math.ceil((call!.endsAt - now()) / 1000));
    const name = call!.present?.[c.uid]?.name || await deps.displayName(c.uid);
    const token = mintJoinToken(cfg, { room, identity: c.uid, name, metadata: JSON.stringify({ lead: c.lead.ok }), ttlSeconds }, now());
    res.json({ available: true, url: cfg.url, token, room, identity: c.uid, cap: PRAYER_CALL_CAP, endsAt: call!.endsAt });
  });

  r.post('/end', ...mw, express.json({ limit: '4kb' }), async (req: any, res: any) => {
    const c = await context(req, req.body);
    if ('error' in c) return res.status(400).json({ error: 'Bad ministry.' });
    if (!c.lead.ok) return res.status(403).json({ error: 'Only a leader can end the call.' });
    const call = await load(c.key);
    if (!call || call.status !== 'LIVE') return res.json({ ok: true });
    const ended = endCall(call, now(), 'LEADER', c.uid);
    await save(ended);
    closeRoom(call);
    const t = timers.get(c.key); if (t) { clearTimeout(t.t); timers.delete(c.key); }
    res.json({ ok: true, call: viewFor(ended, c.uid, true, now()) });
  });

  r.post('/remove', ...mw, express.json({ limit: '4kb' }), async (req: any, res: any) => {
    const c = await context(req, req.body);
    if ('error' in c) return res.status(400).json({ error: 'Bad ministry.' });
    if (!c.lead.ok) return res.status(403).json({ error: 'Only a leader can remove someone.' });
    const target = String(req.body?.uid || '');
    if (!validId(target) || target === c.uid) return res.status(400).json({ error: 'Pick someone else to remove.' });
    const call = await load(c.key);
    if (isOver(call, now())) return res.status(410).json({ error: 'This Prayer Call has ended.' });
    const next: PrayerCallDoc = { ...call!, removedUids: [...new Set([...call!.removedUids, target])], present: dropPresence(call!, target) };
    await save(next);
    const cfg = deps.livekit();
    if (cfg) void rooms(cfg).removeParticipant(roomNameFor(call!.callId), target).catch(() => {});
    res.json({ ok: true, call: viewFor(next, c.uid, true, now()) });
  });

  r.post('/leave', ...mw, express.json({ limit: '4kb' }), async (req: any, res: any) => {
    const c = await context(req, req.body);
    if ('error' in c) return res.status(400).json({ error: 'Bad ministry.' });
    if (!c.join.ok) return res.json({ ok: true });
    const call = await load(c.key);
    if (call && call.status === 'LIVE' && call.present?.[c.uid]) await save({ ...call, present: dropPresence(call, c.uid) });
    res.json({ ok: true });
  });

  r.post('/requests', ...mw, express.json({ limit: '4kb' }), async (req: any, res: any) => {
    const c = await context(req, req.body);
    if ('error' in c) return res.status(400).json({ error: 'Bad ministry.' });
    if (!c.join.ok) return res.status(403).json({ error: c.join.message });
    const call = await load(c.key);
    if (isOver(call, now())) return res.status(410).json({ error: 'This Prayer Call has ended.' });
    if (call!.removedUids.includes(c.uid)) return res.status(403).json({ error: 'A leader removed you from this call.' });
    const op = String(req.body?.op || '');
    let out: { call: PrayerCallDoc; error?: string };
    if (op === 'add') {
      out = addRequest(call!, { id: newId(), uid: c.uid, name: call!.present?.[c.uid]?.name || await deps.displayName(c.uid), text: req.body?.text, now: now() });
    } else if (op === 'toggle') {
      if (!c.lead.ok) return res.status(403).json({ error: 'Only a leader can turn the prayer list on or off.' });
      out = { call: { ...call!, requestsOn: !!req.body?.on } };
    } else if (op === 'prayed' || op === 'unprayed' || op === 'delete') {
      out = editRequest(call!, String(req.body?.id || ''), op, c.uid, c.lead.ok);
    } else return res.status(400).json({ error: 'Unknown request action.' });
    if (out.error) return res.status(400).json({ error: out.error });
    await save(out.call);
    res.json({ call: viewFor(out.call, c.uid, c.lead.ok, now()) });
  });

  return r;
}
