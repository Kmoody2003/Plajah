// routes/meetingsSfu.ts over HTTP with fake auth, a fake Firestore and a fake LiveKit RoomService:
// membership (mirrors firestore.rules), each room cap, the 300 plan gate, the over-300 refusal,
// 1:1 calls staying on the mesh, signed webhooks → usage ledger (idempotent).
//   npx tsx --test tests/meetingsSfu.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createMeetingsSfuRouter, recordWebhook, roomNameFor, type MeetingsSfuDeps } from '../routes/meetingsSfu';
import { signJwt, verifyJwt, mintJoinToken, verifyWebhook, type LiveKitConfig, livekitConfigFromEnv } from '../services/meetings/livekitServer';
import { MEETING_CAPS, decideJoin, SFU_REFUSED_CODE } from '../services/meetings/sfuCaps';
import { usageSummary } from '../services/meetings/sfuUsage';

type Doc = Record<string, any>;
const NOW = Date.UTC(2026, 10, 12, 18);
const CFG: LiveKitConfig = { url: 'wss://plajah-test.livekit.cloud', apiKey: 'APIkey', apiSecret: 'secret-secret-secret-secret-secret' };

function world(opts: { occupancy?: Record<string, number>; roomCaps?: Record<string, number>; plus?: string[]; sfuOn?: boolean } = {}) {
  const docs = new Map<string, Doc>([
    ['chat_rooms/group', { type: 'GROUP', ownerId: 'owner', participants: ['owner', 'alice', 'bob', 'carol'] }],
    ['chat_rooms/dm', { type: 'PRIVATE', participants: ['alice', 'bob'] }],
    ['chat_rooms/orgroom', { type: 'GROUP', ownerId: 'owner', orgId: 'gf', workspaceType: 'ORGANIZATION', participants: ['owner', 'alice', 'bob'] }],
    ['organizations/gf', { name: 'Great Faith' }],
    ['chat_rooms/class', { type: 'GROUP', workspaceType: 'CLASSROOM_MEETING', liveClassSessionId: 'ls1', participants: ['teacher', 'kid1', 'kid2'] }],
    ['liveClassSessions/ls1', { status: 'ENDED' }],
    ['chat_rooms/breakout', { type: 'GROUP', ownerId: 'owner', participants: ['owner', 'alice', 'bob'] }],
    ['chat_rooms/breakout/meetings/control', { hostId: 'owner', removedIds: ['bob'], assignments: { alice: 'b1' }, breakoutRooms: { b1: 'Team 1' } }],
    ['public_meetings/pm1', { roomId: 'group', hostUid: 'owner', guestsAllowed: true }],
    ['public_meetings/pm1/lobby/guestA', { status: 'ADMITTED', name: 'Ann' }],
    ['public_meetings/pm1/lobby/guestW', { status: 'WAITING', name: 'Will' }],
  ]);
  const created: Array<{ room: string; max: number; meta: any }> = [];
  const deps: MeetingsSfuDeps = {
    authMiddleware: (req: any, res: any, next: any) => {
      const h = String(req.headers.authorization || '');
      if (!h.startsWith('Bearer ')) return res.status(401).end();
      const uid = h.slice(7);
      req.uid = uid; req.isAnonymous = uid.startsWith('guest');
      next();
    },
    config: () => (opts.sfuOn === false ? null : CFG),
    roomService: () => ({
      roomState: async room => ({ count: opts.occupancy?.[room] ?? 0, maxParticipants: opts.roomCaps?.[room] ?? (created.find(c => c.room === room)?.max ?? null) }),
      ensureRoom: async (room, max, meta) => { created.push({ room, max, meta: JSON.parse(meta) }); },
    }),
    readDoc: async (c, id) => docs.get(`${c}/${id}`) || null,
    createOnce: async (c, id, d) => { const k = `${c}/${id}`; if (docs.has(k)) return 'exists'; docs.set(k, d); return 'created'; },
    patchDoc: async (c, id, d) => { const k = `${c}/${id}`; docs.set(k, { ...(docs.get(k) || {}), ...d }); return true; },
    query: async (c, filters) => [...docs.entries()]
      .filter(([k, v]) => k.startsWith(c + '/') && k.split('/').length === 2 && filters.every(f => v[f.field] === f.value))
      .map(([k, v]) => ({ id: k.split('/')[1], data: v })),
    hasPlajahPlus: async uid => (opts.plus || []).includes(uid),
    isAdmin: async req => req.uid === 'kenne',
    now: () => NOW,
  };
  return { deps, docs, created };
}

async function call(deps: MeetingsSfuDeps, method: 'GET' | 'POST', path: string, uid: string | null, body?: any, headers: Record<string, string> = {}) {
  const app = express();
  app.use('/api/meetings/sfu', createMeetingsSfuRouter(deps));
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const raw = typeof body === 'string' ? body : body === undefined ? undefined : JSON.stringify(body);
    const r = await fetch(`http://127.0.0.1:${port}/api/meetings/sfu${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(uid ? { Authorization: `Bearer ${uid}` } : {}), ...headers },
      body: raw,
    });
    return { status: r.status, body: await r.json().catch(() => null) as any };
  } finally { server.close(); }
}

const token = (deps: MeetingsSfuDeps, uid: string, target: any, purpose: 'huddle' | 'meeting' = 'meeting') =>
  call(deps, 'POST', '/token', uid, { target, purpose, name: `${uid} name` });

// ── Membership ──────────────────────────────────────────────────────────────────

test('a chat-room member gets a LiveKit token for that room only', async () => {
  const { deps, created } = world();
  const r = await token(deps, 'alice', { type: 'room', roomId: 'group', scope: 'main' });
  assert.equal(r.status, 200);
  assert.equal(r.body.mode, 'sfu');
  assert.equal(r.body.room, 'cr.group.main');
  assert.equal(r.body.identity, 'alice');
  assert.equal(r.body.url, CFG.url);
  const claims = verifyJwt(r.body.token, CFG.apiSecret, { issuer: CFG.apiKey, now: NOW })!;
  assert.equal(claims.sub, 'alice');
  assert.deepEqual(claims.video.room, 'cr.group.main');
  assert.equal(claims.video.roomJoin, true);
  assert.equal(claims.video.roomAdmin, undefined, 'participants never get admin');
  assert.equal(created[0].max, MEETING_CAPS.meeting);
  assert.deepEqual({ kind: created[0].meta.ownerKind, id: created[0].meta.ownerId }, { kind: 'user', id: 'owner' });
});

test('non-members, unauthenticated callers and bad targets are refused', async () => {
  const { deps } = world();
  assert.equal((await token(deps, 'mallory', { type: 'room', roomId: 'group', scope: 'main' })).status, 403);
  assert.equal((await token(deps, 'alice', { type: 'room', roomId: 'nope', scope: 'main' })).status, 403);
  assert.equal((await call(deps, 'POST', '/token', null, { target: { type: 'room', roomId: 'group', scope: 'main' } })).status, 401);
  assert.equal((await token(deps, 'alice', { type: 'room', roomId: '../x', scope: 'main' })).status, 400);
});

test('meeting control: removed people and wrong breakout scopes are refused (meetingScope)', async () => {
  const { deps } = world();
  assert.equal((await token(deps, 'bob', { type: 'room', roomId: 'breakout', scope: 'main' })).status, 403, 'removed');
  assert.equal((await token(deps, 'alice', { type: 'room', roomId: 'breakout', scope: 'main' })).status, 403, 'assigned to b1');
  const ok = await token(deps, 'alice', { type: 'room', roomId: 'breakout', scope: 'b1' });
  assert.equal(ok.body.room, 'cr.breakout.b1');
  assert.equal((await token(deps, 'owner', { type: 'room', roomId: 'breakout', scope: 'b9' })).status, 403, 'not a breakout');
  // No control doc: only 'main' exists.
  assert.equal((await token(deps, 'alice', { type: 'room', roomId: 'group', scope: 'b1' })).status, 403);
});

test('classroom meetings only open while the class session is LIVE', async () => {
  const { deps, docs } = world();
  assert.equal((await token(deps, 'kid1', { type: 'room', roomId: 'class', scope: 'main' })).status, 403);
  docs.set('liveClassSessions/ls1', { status: 'LIVE' });
  assert.equal((await token(deps, 'kid1', { type: 'room', roomId: 'class', scope: 'main' })).body.mode, 'sfu');
});

test('public meeting links: room members and ADMITTED guests join; waiting/unknown guests do not', async () => {
  const { deps } = world();
  const t = { type: 'public', meetingId: 'pm1' };
  assert.equal((await token(deps, 'bob', t)).body.room, 'pm.pm1');
  const guest = await token(deps, 'guestA', t);
  assert.equal(guest.body.mode, 'sfu');
  assert.equal(guest.body.identity, 'guestA');
  assert.equal((await token(deps, 'guestW', t)).status, 403, 'still in the waiting room');
  assert.equal((await token(deps, 'guestX', t)).status, 403, 'never knocked');
});

// ── Engine choice ───────────────────────────────────────────────────────────────

test('1:1 chat calls stay peer-to-peer (mesh), groups go to the SFU', async () => {
  const { deps, created } = world();
  assert.deepEqual((await token(deps, 'alice', { type: 'room', roomId: 'dm', scope: 'main' })).body, { mode: 'mesh' });
  assert.equal(created.length, 0);
});

test('flag off (or no keys) → everyone stays on the mesh, membership still checked', async () => {
  const { deps } = world({ sfuOn: false });
  assert.deepEqual((await token(deps, 'alice', { type: 'room', roomId: 'group', scope: 'main' })).body, { mode: 'mesh' });
  assert.equal((await token(deps, 'mallory', { type: 'room', roomId: 'group', scope: 'main' })).status, 403);
  assert.equal(livekitConfigFromEnv({ LIVEKIT_URL: 'wss://x', LIVEKIT_API_KEY: 'k', LIVEKIT_API_SECRET: 's' }), null, 'needs MEETINGS_SFU=1');
  assert.equal(livekitConfigFromEnv({ MEETINGS_SFU: '1', LIVEKIT_URL: 'wss://x', LIVEKIT_API_KEY: 'k' }), null, 'needs all keys');
  assert.ok(livekitConfigFromEnv({ MEETINGS_SFU: '1', LIVEKIT_URL: 'wss://x', LIVEKIT_API_KEY: 'k', LIVEKIT_API_SECRET: 's' }));
});

// ── Caps ─────────────────────────────────────────────────────────────────────────

test('huddle cap: 50 people, the 51st is refused with a start-a-meeting message', async () => {
  const room = roomNameFor({ type: 'room', roomId: 'group', scope: 'main' });
  const ok = await token(world({ occupancy: { [room]: 49 } }).deps, 'alice', { type: 'room', roomId: 'group', scope: 'main' }, 'huddle');
  assert.equal(ok.body.cap, 50);
  const full = await token(world({ occupancy: { [room]: 50 } }).deps, 'alice', { type: 'room', roomId: 'group', scope: 'main' }, 'huddle');
  assert.equal(full.status, 403);
  assert.equal(full.body.code, SFU_REFUSED_CODE);
  assert.equal(full.body.reason, 'ROOM_FULL');
  assert.equal(full.body.cap, 50);
});

test('meeting cap: 100 for everyone; the 101st without a plan is told it needs one', async () => {
  const room = 'cr.group.main';
  assert.equal((await token(world({ occupancy: { [room]: 99 } }).deps, 'alice', { type: 'room', roomId: 'group', scope: 'main' })).body.cap, 100);
  const full = await token(world({ occupancy: { [room]: 100 } }).deps, 'alice', { type: 'room', roomId: 'group', scope: 'main' });
  assert.equal(full.status, 403);
  assert.equal(full.body.reason, 'NEEDS_PLAN');
});

test('large meetings (300) need an org plan or Plajah+ — owner, org, or the person starting it', async () => {
  const t = { type: 'room', roomId: 'group', scope: 'main' };
  const busy = { 'cr.group.main': 150 };
  assert.equal((await token(world({ occupancy: busy }).deps, 'alice', t)).status, 403, 'free: capped at 100');
  assert.equal((await token(world({ occupancy: busy, plus: ['owner'] }).deps, 'alice', t)).body.cap, 300, 'owner has Plajah+');
  assert.equal((await token(world({ occupancy: busy, plus: ['alice'] }).deps, 'alice', t)).body.cap, 300, 'joiner has Plajah+');
  const org = await token(world({ occupancy: { 'cr.orgroom.main': 150 } }).deps, 'alice', { type: 'room', roomId: 'orgroom', scope: 'main' });
  assert.equal(org.body.cap, 300, 'org room');
  // Public meeting: host's plan counts; an anonymous guest's never does.
  assert.equal((await token(world({ occupancy: { 'pm.pm1': 120 }, plus: ['owner'] }).deps, 'guestA', { type: 'public', meetingId: 'pm1' })).body.cap, 300);
  assert.equal((await token(world({ occupancy: { 'pm.pm1': 120 }, plus: ['guestA'] }).deps, 'guestA', { type: 'public', meetingId: 'pm1' })).status, 403);
  // Huddles never grow past 50, plan or not.
  assert.equal((await token(world({ occupancy: { 'cr.group.main': 50 }, plus: ['owner'] }).deps, 'alice', t, 'huddle')).status, 403);
});

test('past 300 there is no meeting room: refused with the broadcast offer', async () => {
  const r = await token(world({ occupancy: { 'cr.orgroom.main': 300 } }).deps, 'alice', { type: 'room', roomId: 'orgroom', scope: 'main' });
  assert.equal(r.status, 403);
  assert.equal(r.body.reason, 'USE_BROADCAST');
  assert.match(r.body.message, /broadcast/i);
});

test('an existing room keeps the cap it was created with (first joiner fixes it)', async () => {
  const { deps } = world({ occupancy: { 'cr.group.main': 50 }, roomCaps: { 'cr.group.main': 50 } });
  const r = await token(deps, 'alice', { type: 'room', roomId: 'group', scope: 'main' }, 'meeting');
  assert.equal(r.status, 403, 'a huddle-created room stays at 50');
  assert.equal(decideJoin({ kind: 'meeting', largeAllowed: true, current: 10, roomCap: 999 }).cap, 300, 'never above the ceiling');
});

test('SFU unreachable → client told to use the mesh (degraded), not stranded', async () => {
  const { deps } = world();
  deps.roomService = () => ({ roomState: async () => { throw new Error('down'); }, ensureRoom: async () => {} });
  const r = await token(deps, 'alice', { type: 'room', roomId: 'group', scope: 'main' });
  assert.equal(r.body.mode, 'mesh');
  assert.equal(r.body.degraded, true);
});

// ── Webhooks + ledger ───────────────────────────────────────────────────────────

function signed(event: any) {
  const raw = JSON.stringify(event);
  const sha256 = createHash('sha256').update(raw).digest('base64');
  const auth = signJwt({ iss: CFG.apiKey, nbf: Math.floor(Date.now() / 1000) - 5, exp: Math.floor(Date.now() / 1000) + 300, sha256 }, CFG.apiSecret);
  return { raw, auth };
}
const roomInfo = { name: 'cr.orgroom.main', sid: 'RM_1', metadata: JSON.stringify({ ownerKind: 'org', ownerId: 'gf', kind: 'meeting', cap: 300 }) };
const t0 = Math.floor(NOW / 1000);

test('webhook signature is required and checked against the exact body', async () => {
  const { deps } = world();
  const ev = { event: 'participant_joined', room: roomInfo, participant: { sid: 'PA_1', identity: 'alice', joinedAt: t0 }, createdAt: t0 };
  const { raw, auth } = signed(ev);
  assert.equal((await call(deps, 'POST', '/webhook', null, raw, { 'Content-Type': 'application/webhook+json' })).status, 401, 'unsigned');
  assert.equal((await call(deps, 'POST', '/webhook', null, raw.replace('alice', 'mallo'), { Authorization: auth, 'Content-Type': 'application/webhook+json' })).status, 401, 'tampered');
  assert.equal((await call(deps, 'POST', '/webhook', null, raw, { Authorization: auth, 'Content-Type': 'application/webhook+json' })).status, 200);
  assert.equal(verifyWebhook({ ...CFG, apiSecret: 'other' }, raw, auth), null, 'wrong secret');
});

test('ledger: joined → left records participant-minutes for the owner, retries never double-count', async () => {
  const { deps, docs } = world();
  const joined = { event: 'participant_joined', room: roomInfo, participant: { sid: 'PA_1', identity: 'alice', joinedAt: t0 }, createdAt: t0 };
  const left = { event: 'participant_left', room: roomInfo, participant: { sid: 'PA_1', identity: 'alice', joinedAt: t0 }, createdAt: t0 + 30 * 60 };
  for (const ev of [joined, joined, left, left]) {
    const { raw, auth } = signed(ev);
    assert.equal((await call(deps, 'POST', '/webhook', null, raw, { Authorization: auth, 'Content-Type': 'application/webhook+json' })).status, 200);
  }
  const usage = [...docs.entries()].filter(([k]) => k.startsWith('meetingUsage/'));
  assert.equal(usage.length, 1);
  const rec = usage[0][1];
  assert.equal(rec.minutes, 30);
  assert.equal(rec.ownerKey, 'org:gf');
  assert.equal(rec.month, '2026-11');
  assert.equal(docs.get('meetingSfuSessions/RM_1__PA_1')!.open, false);
});

test('ledger: room_finished closes anyone whose participant_left never arrived', async () => {
  const { deps, docs } = world();
  for (const [sid, who] of [['PA_1', 'alice'], ['PA_2', 'bob']]) {
    await recordWebhook(deps, { event: 'participant_joined', room: roomInfo, participant: { sid, identity: who, joinedAt: t0 }, createdAt: t0 });
  }
  await recordWebhook(deps, { event: 'participant_left', room: roomInfo, participant: { sid: 'PA_1', identity: 'alice', joinedAt: t0 }, createdAt: t0 + 600 });
  await recordWebhook(deps, { event: 'room_finished', room: roomInfo, createdAt: t0 + 3600 });
  const recs = [...docs.entries()].filter(([k]) => k.startsWith('meetingUsage/')).map(([, v]) => v).sort((a, b) => a.minutes - b.minutes);
  assert.deepEqual(recs.map(r => r.minutes), [10, 60]);
});

test('ledger falls back to meetingSfuRooms attribution when room metadata is missing', async () => {
  const { deps, docs } = world();
  docs.set('meetingSfuRooms/cr.group.main', { ownerKind: 'user', ownerId: 'owner', kind: 'huddle' });
  const room = { name: 'cr.group.main', sid: 'RM_2' };
  await recordWebhook(deps, { event: 'participant_left', room, participant: { sid: 'PA_9', identity: 'bob', joinedAt: t0 }, createdAt: t0 + 120 });
  const rec = docs.get('meetingUsage/RM_2__PA_9')!;
  assert.equal(rec.ownerKey, 'user:owner');
  assert.equal(rec.kind, 'huddle');
  assert.equal(rec.minutes, 2);
});

test('usage summary: admins only; minutes → GB → $ and the self-host break-even', async () => {
  const { deps, docs } = world();
  docs.set('meetingUsage/a', { month: '2026-11', ownerKind: 'org', ownerId: 'gf', minutes: 600, room: 'r1' });
  docs.set('meetingUsage/b', { month: '2026-11', ownerKind: 'user', ownerId: 'owner', minutes: 60, room: 'r2' });
  docs.set('meetingUsage/c', { month: '2026-10', ownerKind: 'user', ownerId: 'owner', minutes: 999, room: 'r3' });
  assert.equal((await call(deps, 'GET', '/usage?month=2026-11', 'alice')).status, 403);
  const r = await call(deps, 'GET', '/usage?month=2026-11', 'kenne');
  assert.equal(r.status, 200);
  assert.equal(r.body.participantMinutes, 660);
  assert.equal(r.body.owners[0].ownerId, 'gf');
  const s = usageSummary('2026-11', [{ month: '2026-11', minutes: 60 * 1000, ownerKind: 'org', ownerId: 'x' } as any], { SFU_USD_PER_GB: '0.10', SFU_GB_PER_PARTICIPANT_HOUR: '1' });
  assert.equal(s.estimatedGb, 1000);
  assert.equal(s.estimatedCloudUsd, 100);
});

test('join tokens are scoped, short-lived HS256 JWTs', () => {
  const jwt = mintJoinToken(CFG, { room: 'pm.pm1', identity: 'guestA', name: 'Ann' }, NOW);
  const c = verifyJwt(jwt, CFG.apiSecret, { issuer: CFG.apiKey, now: NOW })!;
  assert.equal(c.video.room, 'pm.pm1');
  assert.equal(c.video.canPublishData, true);
  assert.ok(c.exp - c.nbf <= 6 * 3600 + 10);
  assert.equal(verifyJwt(jwt, CFG.apiSecret, { now: NOW + 7 * 3600 * 1000 }), null, 'expired');
});
