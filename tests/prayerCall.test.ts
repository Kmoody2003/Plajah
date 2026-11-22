// Prayer Call: who may start / see / join, the 60-minute server limit, leader controls, prayer list.
// Core rules (services/elevate/prayerCallCore.ts) and the route (routes/prayerCall.ts) over HTTP
// with fake auth, store, clock and LiveKit room service.
//   npx tsx --test tests/prayerCall.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import {
  PRAYER_CALL_MAX_MS, canJoinPrayerCall, canLeadPrayerCall, defaultTitle, formatLeft, newCall, warningLevel,
} from '../services/elevate/prayerCallCore';
import { createPrayerCallRouter, type PrayerCallDeps } from '../routes/prayerCall';
import { verifyJwt } from '../services/meetings/livekitServer';

const T0 = Date.UTC(2026, 10, 21, 19);

const church: any = {
  id: 'gf', name: 'Great Faith', orgType: 'CHURCH', creatorId: 'owner', admins: [],
  ministries: [
    { id: 'pray', name: 'Intercessory Prayer', headUids: ['head'] },
    { id: 'youth', name: 'Youth' },
  ],
};
const shop: any = { ...church, id: 'shop', orgType: 'BRAND' };
const m = (userId: string, extra: any = {}): any => ({ userId, orgId: 'gf', role: 'MEMBER', status: 'ACTIVE', ...extra });
const MEMBERS: Record<string, any> = {
  pastor: m('pastor', { role: 'ADMIN', roleKey: 'PASTOR' }),
  head: m('head', { ministryIds: ['pray'] }),
  admin: m('admin', { ministryRoles: [{ ministryId: 'pray', roleKey: 'DEPARTMENT_ADMIN' }] }),
  staff: m('staff', { role: 'STAFF', roleKey: 'STAFF', ministryIds: ['pray'] }),
  youthStaff: m('youthStaff', { role: 'STAFF', roleKey: 'STAFF', ministryIds: ['youth'] }),
  youthHead: m('youthHead', { ministryRoles: [{ ministryId: 'youth', roleKey: 'DEPARTMENT_HEAD' }] }),
  member: m('member', { ministryIds: ['pray'] }),
  member2: m('member2', { ministryRoles: [{ ministryId: 'pray', roleKey: 'PRAYER_WARRIOR' }] }),
  outsider: m('outsider', { ministryIds: ['youth'] }),
  lapsed: m('lapsed', { ministryIds: ['pray'], status: 'INACTIVE' }),
};

test('who may lead a Prayer Call', () => {
  const lead = (uid: string, org = church, min = 'pray') => canLeadPrayerCall(uid, MEMBERS[uid] || null, org, min).ok;
  assert.equal(lead('owner'), true, 'org owner');
  assert.equal(lead('pastor'), true, 'pastoral role, any ministry');
  assert.equal(lead('pastor', church, 'youth'), true);
  assert.equal(lead('head'), true, 'headUids');
  assert.equal(lead('admin'), true, 'department admin of this ministry');
  assert.equal(lead('staff'), true, 'roster staff in this ministry');
  assert.equal(lead('youthStaff'), false, 'staff of another ministry');
  assert.equal(lead('youthHead'), false, 'head of another ministry');
  assert.equal(lead('member'), false);
  assert.equal(lead('member2'), false, 'prayer warrior is a member, not a leader');
  assert.equal(lead('nobody'), false);
  assert.equal(canLeadPrayerCall('owner', null, shop, 'pray').reason, 'NOT_FAITH_ORG', 'faith orgs only');
  assert.equal(canLeadPrayerCall('pastor', MEMBERS.pastor, church, 'gone').reason, 'NO_MINISTRY');
});

test('who may see and join', () => {
  const join = (uid: string) => canJoinPrayerCall(uid, MEMBERS[uid] || null, church, 'pray').ok;
  for (const uid of ['owner', 'pastor', 'head', 'admin', 'staff', 'member', 'member2']) assert.equal(join(uid), true, uid);
  for (const uid of ['outsider', 'youthStaff', 'youthHead', 'lapsed', 'nobody']) assert.equal(join(uid), false, uid);
  // A membership record for someone else never counts.
  assert.equal(canJoinPrayerCall('outsider', MEMBERS.member, church, 'pray').ok, false);
});

test('calls are 60 minutes at most and warn before the end', () => {
  const c = newCall({ org: church, ministry: church.ministries[0], uid: 'head', name: 'Head', now: T0, callId: 'x', minutes: 600 });
  assert.equal(c.endsAt - c.startedAt, PRAYER_CALL_MAX_MS);
  const short = newCall({ org: church, ministry: church.ministries[0], uid: 'head', name: 'Head', now: T0, callId: 'x', minutes: 1 });
  assert.equal(short.endsAt - short.startedAt, 5 * 60_000, 'shortest is 5 minutes');
  assert.equal(warningLevel(6 * 60_000), 'none');
  assert.equal(warningLevel(5 * 60_000), 'soon');
  assert.equal(warningLevel(59_000), 'final');
  assert.equal(formatLeft(PRAYER_CALL_MAX_MS), '1:00:00');
  assert.equal(formatLeft(65_000), '1:05');
  assert.equal(defaultTitle('Intercessory Prayer'), 'Intercessory Prayer Call');
  assert.equal(defaultTitle('Youth'), 'Youth Prayer Call');
});

// ── Route ────────────────────────────────────────────────────────────────────
function world(opts: { livekit?: boolean } = {}) {
  let clock = T0;
  const docs = new Map<string, any>();
  const roomLog: string[] = [];
  const liveRooms = new Map<string, number>();
  let n = 0;
  const deps: PrayerCallDeps = {
    authMiddleware: (req: any, res: any, next: any) => {
      const h = String(req.headers.authorization || '');
      if (!h) return res.status(401).json({ error: 'sign in' });
      req.uid = h.slice(7); next();
    },
    getOrg: async id => (id === 'gf' ? church : id === 'shop' ? shop : null),
    getMembership: async (_org, uid) => MEMBERS[uid] || null,
    displayName: async uid => uid[0].toUpperCase() + uid.slice(1),
    store: {
      get: async k => (docs.has(k) ? JSON.parse(JSON.stringify(docs.get(k))) : null),
      put: async (k, raw) => { docs.set(k, { ...(docs.get(k) || {}), ...JSON.parse(JSON.stringify(raw)) }); return true; },
    },
    livekit: () => (opts.livekit === false ? null : { url: 'wss://lk.test', apiKey: 'key', apiSecret: 'secret-secret-secret-secret-1234' }),
    rooms: () => ({
      roomState: async room => ({ count: liveRooms.get(room) ?? 0, maxParticipants: liveRooms.has(room) ? 25 : null }),
      ensureRoom: async room => { roomLog.push(`create ${room}`); liveRooms.set(room, 0); },
      deleteRoom: async room => { roomLog.push(`delete ${room}`); liveRooms.delete(room); },
      removeParticipant: async (room, id) => { roomLog.push(`remove ${room} ${id}`); },
    }),
    now: () => clock,
    newId: () => `id${++n}`,
    timers: false,
  };
  const app = express();
  app.use('/api/elevate/prayer-call', createPrayerCallRouter(deps));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/elevate/prayer-call`;
  const req = async (method: string, path: string, uid: string | null, body?: any) => {
    const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(uid ? { Authorization: `Bearer ${uid}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => ({})) as any };
  };
  const target = { orgId: 'gf', ministryId: 'pray' };
  return {
    req, target, docs, roomLog, liveRooms,
    tick: (ms: number) => { clock += ms; },
    get: (uid: string, here = false) => req('GET', `/?orgId=gf&ministryId=pray${here ? '&here=1' : ''}`, uid),
    close: () => server.close(),
  };
}

test('route: a leader starts, members see the live card and join, outsiders see nothing', async () => {
  const w = world();
  try {
    assert.equal((await w.req('POST', '/start', null, w.target)).status, 401);
    assert.equal((await w.req('POST', '/start', 'member', w.target)).status, 403, 'members cannot start');
    assert.equal((await w.req('POST', '/start', 'outsider', w.target)).status, 403);
    assert.equal((await w.req('POST', '/start', 'owner', { orgId: 'shop', ministryId: 'pray' })).status, 403, 'non-faith org');

    const s = await w.req('POST', '/start', 'head', { ...w.target, minutes: 90 });
    assert.equal(s.status, 200);
    assert.equal(s.body.call.status, 'LIVE');
    assert.equal(s.body.call.endsAt - s.body.call.startedAt, PRAYER_CALL_MAX_MS, 'client cannot ask for more than 60');

    const again = await w.req('POST', '/start', 'pastor', w.target);
    assert.equal(again.body.existing, true, 'one live call per ministry');
    assert.equal(again.body.call.callId, s.body.call.callId);

    const seen = await w.get('member');
    assert.equal(seen.body.call?.status, 'LIVE');
    assert.equal(seen.body.canStart, false);
    assert.equal(seen.body.call.youLead, false);

    const hidden = await w.get('outsider');
    assert.equal(hidden.body.call, null, 'non-members cannot see the call');
    assert.equal(hidden.body.canJoin, false);
    assert.equal((await w.req('POST', '/token', 'outsider', w.target)).status, 403);
    assert.equal((await w.req('POST', '/token', 'lapsed', w.target)).status, 403);

    const tok = await w.req('POST', '/token', 'member', w.target);
    assert.equal(tok.body.available, true);
    assert.equal(tok.body.room, `pc.${s.body.call.callId}`);
    const claims = verifyJwt(tok.body.token, 'secret-secret-secret-secret-1234', { now: T0 })!;
    assert.equal(claims.sub, 'member');
    assert.equal(claims.video.room, tok.body.room);
    assert.ok(claims.exp <= Math.ceil(s.body.call.endsAt / 1000), 'token expires with the call');
    assert.deepEqual(w.roomLog, [`create pc.${s.body.call.callId}`]);

    await w.get('member', true);
    const roster = await w.get('head');
    assert.deepEqual(roster.body.call.present.map((p: any) => p.uid).sort(), ['head', 'member']);
  } finally { w.close(); }
});

test('route: the server ends the call at 60 minutes and closes the LiveKit room', async () => {
  const w = world();
  try {
    const s = await w.req('POST', '/start', 'staff', w.target);
    const room = `pc.${s.body.call.callId}`;
    await w.req('POST', '/token', 'member', w.target);
    w.tick(59 * 60_000);
    assert.equal((await w.get('member')).body.call.status, 'LIVE');
    w.tick(60_000);
    const after = await w.get('member');
    assert.equal(after.body.call.status, 'ENDED');
    assert.equal(after.body.call.endReason, 'TIME');
    assert.ok(w.roomLog.includes(`delete ${room}`), 'room deleted (everyone disconnected)');
    assert.equal((await w.req('POST', '/token', 'member', w.target)).status, 410, 'no tokens after the end');
    assert.equal((await w.req('POST', '/requests', 'member', { ...w.target, op: 'add', text: 'x' })).status, 410);
    assert.equal(w.docs.get('gf__pray').status, 'ENDED', 'stored as ended');
    // A fresh call can start afterwards, with a new room.
    const next = await w.req('POST', '/start', 'head', w.target);
    assert.notEqual(next.body.call.callId, s.body.call.callId);
    assert.equal(next.body.call.endReason, undefined, 'old end fields cleared');
    assert.equal(w.docs.get('gf__pray').endReason, null);
  } finally { w.close(); }
});

test('route: leader ends early and removes someone; members cannot', async () => {
  const w = world();
  try {
    const s = await w.req('POST', '/start', 'admin', w.target);
    const room = `pc.${s.body.call.callId}`;
    assert.equal((await w.req('POST', '/remove', 'member', { ...w.target, uid: 'member2' })).status, 403);
    assert.equal((await w.req('POST', '/end', 'member', w.target)).status, 403);
    assert.equal((await w.req('POST', '/remove', 'admin', { ...w.target, uid: 'member2' })).status, 200);
    assert.ok(w.roomLog.includes(`remove ${room} member2`));
    const t = await w.req('POST', '/token', 'member2', w.target);
    assert.equal(t.status, 403);
    assert.equal(t.body.reason, 'REMOVED');
    assert.equal((await w.get('member2')).body.call.removed, true);

    assert.equal((await w.req('POST', '/end', 'pastor', w.target)).status, 200, 'any leader may end it');
    const v = await w.get('member');
    assert.equal(v.body.call.status, 'ENDED');
    assert.equal(v.body.call.endReason, 'LEADER');
    assert.ok(w.roomLog.includes(`delete ${room}`));
  } finally { w.close(); }
});

test('route: prayer-request list', async () => {
  const w = world();
  try {
    await w.req('POST', '/start', 'head', w.target);
    const add = await w.req('POST', '/requests', 'member', { ...w.target, op: 'add', text: '  Healing for my mother  ' });
    assert.equal(add.status, 200);
    const id = add.body.call.requests[0].id;
    assert.equal(add.body.call.requests[0].text, 'Healing for my mother');
    assert.equal((await w.req('POST', '/requests', 'outsider', { ...w.target, op: 'add', text: 'hi' })).status, 403);
    assert.equal((await w.req('POST', '/requests', 'member2', { ...w.target, op: 'prayed', id })).status, 400, 'members cannot mark prayed');
    assert.equal((await w.req('POST', '/requests', 'member2', { ...w.target, op: 'delete', id })).status, 400, 'or delete others');
    assert.equal((await w.req('POST', '/requests', 'head', { ...w.target, op: 'prayed', id })).body.call.requests[0].prayed, true);
    assert.equal((await w.req('POST', '/requests', 'member', { ...w.target, op: 'toggle', on: false })).status, 403);
    assert.equal((await w.req('POST', '/requests', 'head', { ...w.target, op: 'toggle', on: false })).body.call.requestsOn, false);
    assert.equal((await w.req('POST', '/requests', 'member', { ...w.target, op: 'add', text: 'more' })).status, 400, 'list off');
    assert.equal((await w.req('POST', '/requests', 'member', { ...w.target, op: 'delete', id })).body.call.requests.length, 0, 'own request removable');
  } finally { w.close(); }
});

test('route: without LiveKit the room still runs, media says unavailable', async () => {
  const w = world({ livekit: false });
  try {
    await w.req('POST', '/start', 'head', w.target);
    const t = await w.req('POST', '/token', 'member', w.target);
    assert.equal(t.status, 200);
    assert.equal(t.body.available, false);
    assert.equal((await w.get('member')).body.media, false);
  } finally { w.close(); }
});
