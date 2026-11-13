/**
 * /api/meetings/sfu — LiveKit (SFU) path for meetings and huddles. See docs/MEETINGS_SFU.md.
 *
 *   POST /token    → { mode: 'mesh' } (SFU off, or a 1:1 call that stays peer-to-peer)
 *                  | { mode: 'sfu', url, token, room, identity, cap }
 *                  | 403 { code: MEETING_ROOM_REFUSED, reason, message, cap }   (caps, plan gate)
 *   POST /webhook  ← LiveKit webhooks (participant_joined/left, room_finished) → usage ledger
 *   GET  /usage    → platform admins: participant-minutes per org/user for a month + cost estimate
 *
 * Membership mirrors firestore.rules exactly (meetingMember + meetingScope for a chat room's call,
 * room member or ADMITTED lobby entry for a public meeting link); the caps come from
 * services/meetings/sfuCaps.ts and are checked against LiveKit's live occupancy, never the client.
 * The ledger collections (meetingSfuSessions, meetingUsage) have no client rules: server writes only.
 */
import express, { Router } from 'express';
import { decideJoin, capFor, SFU_REFUSED_CODE, type SfuRoomKind } from '../services/meetings/sfuCaps';
import {
  createRoomService, mintJoinToken, verifyWebhook, type LiveKitConfig, type RoomServiceLike,
} from '../services/meetings/livekitServer';
import { usageSummary, type UsageRecord } from '../services/meetings/sfuUsage';

type Doc = Record<string, any> | null;

export interface MeetingsSfuDeps {
  authMiddleware: any;
  limiter?: any;
  /** null = SFU off → every caller is told to use the mesh. Read per request so a redeploy isn't needed in tests. */
  config: () => LiveKitConfig | null;
  roomService?: (cfg: LiveKitConfig) => RoomServiceLike;
  /** Read one doc by slash path collection + id (service account). */
  readDoc: (collection: string, id: string) => Promise<Doc>;
  createOnce: (collection: string, id: string, data: Record<string, any>) => Promise<'created' | 'exists' | 'error'>;
  patchDoc: (collection: string, id: string, data: Record<string, any>) => Promise<boolean>;
  query: (collection: string, filters: Array<{ field: string; op: string; value: any }>, limit: number) => Promise<Array<{ id: string; data: Record<string, any> }>>;
  hasPlajahPlus: (uid: string) => Promise<boolean>;
  isAdmin: (req: any) => Promise<boolean>;
  now?: () => number;
}

export type SfuTarget =
  | { type: 'room'; roomId: string; scope: string }
  | { type: 'public'; meetingId: string };

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export function parseTarget(body: any): SfuTarget | null {
  const t = body?.target;
  if (t?.type === 'room' && ID_RE.test(String(t.roomId || '')) && ID_RE.test(String(t.scope || 'main'))) {
    return { type: 'room', roomId: String(t.roomId), scope: String(t.scope || 'main') };
  }
  if (t?.type === 'public' && ID_RE.test(String(t.meetingId || ''))) return { type: 'public', meetingId: String(t.meetingId) };
  return null;
}

/** LiveKit room name for a target. Stable, so everyone on the same call lands in the same room. */
export function roomNameFor(t: SfuTarget): string {
  return t.type === 'room' ? `cr.${t.roomId}.${t.scope}` : `pm.${t.meetingId}`;
}

interface Resolved {
  /** Stays peer-to-peer (1:1 chat call). */
  mesh?: boolean;
  allowed: boolean;
  why?: string;
  /** Who the usage is billed to. */
  owner: { kind: 'org' | 'user'; id: string };
  /** Facts for the large-meeting plan gate. */
  orgId?: string;
  hostUids: string[];
}

/** Mirrors firestore.rules meetingMember() + meetingScope(uid, scope) for chat_rooms/{id}/meeting_rtc/{scope}. */
async function resolveRoom(deps: MeetingsSfuDeps, uid: string, t: { roomId: string; scope: string }): Promise<Resolved> {
  const room = await deps.readDoc('chat_rooms', t.roomId);
  const none: Resolved = { allowed: false, why: 'not-found', owner: { kind: 'user', id: uid }, hostUids: [] };
  if (!room) return none;
  const participants: string[] = Array.isArray(room.participants) ? room.participants : [];
  const owner = room.orgId ? { kind: 'org' as const, id: String(room.orgId) } : { kind: 'user' as const, id: String(room.ownerId || uid) };
  const base = { owner, orgId: room.orgId ? String(room.orgId) : undefined, hostUids: [room.ownerId].filter(Boolean).map(String) };
  if (!participants.includes(uid)) return { ...base, allowed: false, why: 'not-member' };
  if (room.workspaceType === 'CLASSROOM_MEETING') {
    const session = room.liveClassSessionId ? await deps.readDoc('liveClassSessions', String(room.liveClassSessionId)) : null;
    if (session?.status !== 'LIVE') return { ...base, allowed: false, why: 'class-not-live' };
  }
  const control = await deps.readDoc(`chat_rooms/${t.roomId}/meetings`, 'control');
  if (!control) {
    if (t.scope !== 'main') return { ...base, allowed: false, why: 'scope' };
  } else {
    const removed: string[] = Array.isArray(control.removedIds) ? control.removedIds : [];
    const assigned = (control.assignments && typeof control.assignments === 'object' ? control.assignments[uid] : undefined) || 'main';
    const breakouts = control.breakoutRooms && typeof control.breakoutRooms === 'object' ? control.breakoutRooms : {};
    if (removed.includes(uid)) return { ...base, allowed: false, why: 'removed' };
    if (assigned !== t.scope || (t.scope !== 'main' && !(t.scope in breakouts))) return { ...base, allowed: false, why: 'scope' };
    if (control.hostId) base.hostUids.push(String(control.hostId));
  }
  // 1:1 calls stay on rtcCore P2P (TURN via /api/rtc/ice): nothing to gain from an SFU hop.
  const oneToOne = room.type === 'PRIVATE' || participants.length <= 2;
  return { ...base, allowed: true, mesh: oneToOne && t.scope === 'main' };
}

/** Mirrors firestore.rules public_meetings/{id}: inMeeting(uid) = room member || ADMITTED lobby entry. */
async function resolvePublic(deps: MeetingsSfuDeps, uid: string, meetingId: string): Promise<Resolved> {
  const pm = await deps.readDoc('public_meetings', meetingId);
  if (!pm) return { allowed: false, why: 'not-found', owner: { kind: 'user', id: uid }, hostUids: [] };
  const room = pm.roomId ? await deps.readDoc('chat_rooms', String(pm.roomId)) : null;
  const owner = room?.orgId ? { kind: 'org' as const, id: String(room.orgId) } : { kind: 'user' as const, id: String(pm.hostUid || uid) };
  const base = { owner, orgId: room?.orgId ? String(room.orgId) : undefined, hostUids: [pm.hostUid, room?.ownerId].filter(Boolean).map(String) };
  const member = !!room && Array.isArray(room.participants) && room.participants.includes(uid);
  if (member) return { ...base, allowed: true };
  const entry = await deps.readDoc(`public_meetings/${meetingId}/lobby`, uid);
  if (entry?.status === 'ADMITTED') return { ...base, allowed: true };
  return { ...base, allowed: false, why: 'not-admitted' };
}

/** Large meetings (300): org plans and Plajah+ only — the room's org, its owner/host, or the person starting it. */
async function largeAllowed(deps: MeetingsSfuDeps, r: Resolved, uid: string, isAnonymous: boolean): Promise<boolean> {
  if (r.orgId && await deps.readDoc('organizations', r.orgId)) return true;
  const uids = [...new Set([...r.hostUids, ...(isAnonymous ? [] : [uid])])];
  for (const u of uids) if (await deps.hasPlajahPlus(u).catch(() => false)) return true;
  return false;
}

const cleanName = (s: unknown) => String(s || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 100) || 'Guest';

export function createMeetingsSfuRouter(deps: MeetingsSfuDeps): Router {
  const r = Router();
  const now = deps.now || (() => Date.now());
  const svc = (cfg: LiveKitConfig) => (deps.roomService ? deps.roomService(cfg) : createRoomService(cfg));
  const mw = deps.limiter ? [deps.limiter, deps.authMiddleware] : [deps.authMiddleware];

  r.post('/token', ...mw, express.json({ limit: '4kb' }), async (req: any, res: any) => {
    res.set('Cache-Control', 'private, no-store');
    const target = parseTarget(req.body);
    if (!target) return res.status(400).json({ error: 'Bad meeting target.' });
    const kind: SfuRoomKind = req.body?.purpose === 'huddle' ? 'huddle' : 'meeting';
    const uid = String(req.uid);
    const resolved = target.type === 'room' ? await resolveRoom(deps, uid, target) : await resolvePublic(deps, uid, target.meetingId);
    if (!resolved.allowed) return res.status(403).json({ error: 'You are not in this meeting.', reason: resolved.why });

    const cfg = deps.config();
    if (!cfg || resolved.mesh) return res.json({ mode: 'mesh' });

    const room = roomNameFor(target);
    const big = kind === 'meeting' ? await largeAllowed(deps, resolved, uid, !!req.isAnonymous) : false;
    const service = svc(cfg);
    let state: { count: number; maxParticipants: number | null };
    try { state = await service.roomState(room); }
    catch (e: any) {
      // SFU unreachable: say so and let the client fall back to the mesh rather than strand the call.
      console.warn('[meetings/sfu] room state failed:', e?.message || e);
      return res.json({ mode: 'mesh', degraded: true });
    }
    const decision = decideJoin({ kind, largeAllowed: big, current: state.count, roomCap: state.maxParticipants });
    if (!decision.ok) {
      return res.status(403).json({ code: SFU_REFUSED_CODE, reason: decision.reason, message: decision.message, cap: decision.cap });
    }
    const meta = { ownerKind: resolved.owner.kind, ownerId: resolved.owner.id, kind, cap: decision.cap, target };
    try {
      if (state.maxParticipants == null) await service.ensureRoom(room, capFor(kind, big), JSON.stringify(meta));
    } catch (e: any) {
      console.warn('[meetings/sfu] create room failed:', e?.message || e);
      return res.json({ mode: 'mesh', degraded: true });
    }
    // Fallback attribution for the ledger (room metadata is primary).
    void deps.patchDoc('meetingSfuRooms', room, { ...meta, target: JSON.stringify(target), updatedAt: now() }).catch(() => {});
    const name = cleanName(req.body?.name);
    const token = mintJoinToken(cfg, {
      room, identity: uid, name,
      metadata: JSON.stringify({ guest: !!req.isAnonymous }),
      ttlSeconds: 6 * 3600,
    }, now());
    return res.json({ mode: 'sfu', url: cfg.url, token, room, identity: uid, cap: decision.cap });
  });

  // LiveKit → us. Raw body: the signature covers the exact bytes.
  r.post('/webhook', express.raw({ type: () => true, limit: '256kb' }), async (req: any, res: any) => {
    const cfg = deps.config();
    if (!cfg) return res.status(404).end();
    const raw: Buffer | string = Buffer.isBuffer(req.body) ? req.body : typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    const event = verifyWebhook(cfg, raw, req.headers.authorization || req.headers.Authorization);
    if (!event) return res.status(401).json({ error: 'bad signature' });
    try { await recordWebhook(deps, event, now); }
    catch (e: any) { console.warn('[meetings/sfu] webhook ledger failed:', e?.message || e); return res.status(500).end(); }
    return res.status(200).json({ ok: true });
  });

  r.get('/usage', ...mw, async (req: any, res: any) => {
    if (!await deps.isAdmin(req)) return res.status(403).json({ error: 'Admins only.' });
    const month = /^\d{4}-\d{2}$/.test(String(req.query.month || '')) ? String(req.query.month) : new Date(now()).toISOString().slice(0, 7);
    const rows = await deps.query('meetingUsage', [{ field: 'month', op: 'EQUAL', value: month }], 10_000);
    res.json(usageSummary(month, rows.map(x => x.data as UsageRecord), process.env));
  });

  return r;
}

const secs = (v: any): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};
function roomMeta(event: any): { ownerKind?: string; ownerId?: string; kind?: string } {
  try { return JSON.parse(event?.room?.metadata || '{}') || {}; } catch { return {}; }
}

/**
 * The ledger. One immutable usage record per participant session (participant_left, or room_finished
 * for anyone still marked open), created with createOnce so LiveKit's at-least-once retries never
 * double-count. Exported for tests.
 */
export async function recordWebhook(deps: MeetingsSfuDeps, event: any, now: () => number = () => Date.now()): Promise<void> {
  const type = String(event?.event || '');
  const room = event?.room || {};
  const roomName = String(room.name || '');
  const roomSid = String(room.sid || roomName);
  if (!roomName) return;
  let meta = roomMeta(event);
  if (!meta.ownerId) meta = (await deps.readDoc('meetingSfuRooms', roomName)) || {};
  const at = (secs(event.createdAt ?? event.created_at) ?? now() / 1000) * 1000;

  const sessionId = (p: any) => `${roomSid}__${String(p.sid || p.identity)}`.replace(/[\/]/g, '_');
  const close = async (open: { id: string; data: Record<string, any> }, leftAt: number) => {
    const joinedAt = Number(open.data.joinedAt) || leftAt;
    const seconds = Math.max(0, Math.round((leftAt - joinedAt) / 1000));
    const d = new Date(joinedAt);
    const rec: UsageRecord = {
      room: roomName, roomSid, identity: String(open.data.identity || ''),
      ownerKind: (open.data.ownerKind || meta.ownerKind || 'user') as 'org' | 'user',
      ownerId: String(open.data.ownerId || meta.ownerId || open.data.identity || 'unknown'),
      kind: String(open.data.kind || meta.kind || 'meeting'),
      joinedAt, leftAt, seconds, minutes: Math.round((seconds / 60) * 100) / 100,
      month: d.toISOString().slice(0, 7),
    };
    await deps.createOnce('meetingUsage', open.id, { ...rec, ownerKey: `${rec.ownerKind}:${rec.ownerId}` });
    await deps.patchDoc('meetingSfuSessions', open.id, { open: false, leftAt });
  };

  if (type === 'participant_joined') {
    const p = event.participant || {};
    const joinedAt = (secs(p.joinedAt ?? p.joined_at) ?? at / 1000) * 1000;
    await deps.createOnce('meetingSfuSessions', sessionId(p), {
      room: roomName, roomSid, identity: String(p.identity || ''), joinedAt, open: true,
      ownerKind: meta.ownerKind || 'user', ownerId: meta.ownerId || String(p.identity || ''), kind: meta.kind || 'meeting',
    });
  } else if (type === 'participant_left') {
    const p = event.participant || {};
    const id = sessionId(p);
    const existing = await deps.readDoc('meetingSfuSessions', id);
    const joinedAt = Number(existing?.joinedAt) || (secs(p.joinedAt ?? p.joined_at) ?? at / 1000) * 1000;
    await close({ id, data: { ...(existing || {}), identity: p.identity, joinedAt } }, at);
  } else if (type === 'room_finished') {
    const open = await deps.query('meetingSfuSessions', [{ field: 'roomSid', op: 'EQUAL', value: roomSid }, { field: 'open', op: 'EQUAL', value: true }], 1000);
    for (const o of open) await close(o, at);
  }
}
