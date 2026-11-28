// Plajah Realtime: tickets, server-to-server signatures, the race referee, the relay room lifecycle,
// settlement, and a full end-to-end race (API on HTTP + realtime server on WebSocket + two clients).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { signTicket, verifyTicket, resumeTicket, signBody, verifyBody, RESULT_SIG_HEADER, RESULT_TS_HEADER, type TicketPayload } from '../services/realtime/ticket';
import { RaceReferee } from '../services/realtime/referee';
import { RelayRoom, cleanState, type Peer, type RoomResult } from '../services/realtime/room';
import { REALTIME_GAMES, APEX_RACE, APEX_WORLD, realtimeGame, type RealtimeGameDef } from '../services/realtime/games';
import { settlementPlan } from '../services/realtime/settle';
import { startRealtimeServer } from '../services/realtime/server';
import { resultPoster } from '../services/realtime/resultPoster';
import { RealtimeClient, type RtEvent } from '../services/realtime/client';
import { nextRating } from '../services/gamerNet/rating';
import { PAIR_DAILY_CAP } from '../services/gamerNet/score';
import { memoryGamerStore } from '../services/gamerNet/store';
import { createGamerRouter } from '../routes/gamerNet';

const SECRET = 'ticket-secret-0123456789abcdef';
const RSECRET = 'result-secret-0123456789abcdef';
const T0 = Date.UTC(2026, 10, 21, 12, 0, 0);
const ticket = (o: Partial<TicketPayload> = {}): TicketPayload => ({ k: 'join', room: 'm1', game: APEX_RACE, uid: 'alice', seat: 0, name: 'Alice', min: 2, rated: true, iat: T0, exp: T0 + 60_000, ...o });

test('games: legacy fh-race alias resolves with id preserved without polluting REALTIME_GAMES', () => {
  assert.equal(Object.prototype.hasOwnProperty.call(REALTIME_GAMES, 'fh-race'), false);
  const legacy = realtimeGame('fh-race');
  assert.ok(legacy);
  assert.equal(legacy.id, 'fh-race');
  assert.equal(legacy.tickHz, REALTIME_GAMES[APEX_RACE].tickHz);
  assert.equal(realtimeGame(APEX_WORLD)?.dropIn, true);
});

// ── tickets ─────────────────────────────────────────────────────────────────────────
test('ticket: sign/verify round trip', () => {
  const tok = signTicket(ticket(), SECRET);
  const v = verifyTicket(tok, SECRET, T0 + 1000);
  assert.equal(v.ok, true);
  assert.deepEqual(v.ok && v.ticket, ticket());
});

test('ticket: tampered, wrong secret, expired, malformed are refused', () => {
  const tok = signTicket(ticket(), SECRET);
  const [body, sig] = tok.split('.');
  const forged = Buffer.from(JSON.stringify({ ...ticket(), uid: 'mallory' })).toString('base64url');
  assert.deepEqual(verifyTicket(`${forged}.${sig}`, SECRET, T0), { ok: false, reason: 'signature' });
  assert.deepEqual(verifyTicket(tok, 'another-secret-0123456789', T0), { ok: false, reason: 'signature' });
  assert.deepEqual(verifyTicket(tok, SECRET, T0 + 60_001), { ok: false, reason: 'expired' });
  assert.equal(verifyTicket(`${body}`, SECRET, T0).ok, false);
  assert.equal(verifyTicket(`${body}.${sig}.x`, SECRET, T0).ok, false);
  assert.equal(verifyTicket(42, SECRET, T0).ok, false);
  assert.throws(() => signTicket(ticket(), 'short'), /secret/);
  // A signed payload with bad fields is still refused.
  const bad = signTicket({ ...ticket(), seat: -1 }, SECRET);
  assert.deepEqual(verifyTicket(bad, SECRET, T0), { ok: false, reason: 'fields' });
});

test('ticket: resume tickets live longer and verify with the same secret', () => {
  const r = resumeTicket(ticket(), SECRET, T0 + 50_000);
  const v = verifyTicket(r, SECRET, T0 + 10 * 60_000);
  assert.ok(v.ok && v.ticket.k === 'resume' && v.ticket.uid === 'alice');
});

test('result signature: canonical body, skew window, tamper', () => {
  const body = { matchId: 'm1', standings: [{ uid: 'a', place: 1 }, { uid: 'b', place: 2 }], game: APEX_RACE };
  const sig = signBody(body, RSECRET, T0);
  // Key order doesn't matter (canonical JSON), values do.
  assert.equal(verifyBody({ game: APEX_RACE, standings: body.standings, matchId: 'm1' }, String(T0), sig, RSECRET, T0 + 1000), true);
  assert.equal(verifyBody({ ...body, matchId: 'm2' }, T0, sig, RSECRET, T0), false);
  assert.equal(verifyBody(body, T0, sig, 'wrong-secret-0123456789', T0), false);
  assert.equal(verifyBody(body, T0, sig, RSECRET, T0 + 6 * 60_000), false, 'stale');
  assert.equal(verifyBody(body, undefined, sig, RSECRET, T0), false);
});

// ── referee ─────────────────────────────────────────────────────────────────────────
test('referee: progress is rate-capped, finish order is server-timed', () => {
  const ref = new RaceReferee({ laps: 1, maxProgressPerSec: 0.1, maxSpeedMps: 100, finishGraceMs: 5000, maxRaceMs: 60_000 });
  ref.start([0, 1], T0);
  // Seat 1 claims the finish 1 s in: clamped to ~0.11 laps, not a finish.
  ref.onState(1, { lap: 1, splineT: 0 }, T0 + 1000);
  assert.equal(ref.drainFinishes().length, 0);
  // Seat 0 drives honestly to the line over 11 s.
  for (let s = 1; s <= 11; s++) ref.onState(0, { lap: 0, splineT: Math.min(0.9999, s * 0.0995), x: s * 50, z: 0 }, T0 + s * 1000);
  ref.onState(0, { lap: 1, splineT: 0, x: 600, z: 0 }, T0 + 12_000);
  const f = ref.drainFinishes();
  assert.deepEqual(f, [{ seat: 0, place: 1, timeMs: 12_000 }]);
  assert.equal(ref.done(T0 + 12_000), false, 'seat 1 still has the finish grace');
  assert.equal(ref.done(T0 + 17_001), true);
  const st = ref.standings();
  assert.equal(st[0].seat, 0); assert.equal(st[1].seat, 1); assert.equal(st[1].dnf, true); assert.equal(st[1].why, 'time');
});

test('referee: last car running wins by forfeit; teleporting gets flagged', () => {
  const ref = new RaceReferee({ laps: 3, maxProgressPerSec: 0.05, maxSpeedMps: 100, finishGraceMs: 5000, maxRaceMs: 60_000, maxViolations: 3 });
  ref.start([0, 1], T0);
  for (let i = 1; i <= 5; i++) ref.onState(1, { lap: 0, splineT: 0.01 * i, x: i * 10000, z: 0 }, T0 + i * 100);
  assert.equal(ref.done(T0 + 600), true, 'seat 1 flagged → seat 0 alone');
  const st = ref.standings();
  assert.deepEqual(st.map(x => [x.seat, x.place, x.dnf, x.why]), [[0, 1, false, 'forfeit-win'], [1, 2, true, 'flagged']]);
});

test('cleanState: flat, bounded, finite only', () => {
  assert.deepEqual(cleanState({ x: 1.23456, ok: true, car: 'kestrel' }, 600), { x: 1.235, ok: true, car: 'kestrel' });
  assert.equal(cleanState({ x: NaN }, 600), null);
  assert.equal(cleanState({ nested: { a: 1 } }, 600), null);
  assert.equal(cleanState([1, 2], 600), null);
  assert.equal(cleanState({ s: 'x'.repeat(40), t: 'y'.repeat(40) }, 60), null);
});

// ── room lifecycle (fake peers, fake clock) ─────────────────────────────────────────
const fastDef = (over: Partial<RealtimeGameDef> = {}): RealtimeGameDef => ({
  ...REALTIME_GAMES[APEX_RACE], countdownMs: 1000, reconnectGraceMs: 2000,
  referee: () => new RaceReferee({ laps: 1, maxProgressPerSec: 1, maxSpeedMps: 1000, finishGraceMs: 3000, maxRaceMs: 60_000 }),
  ...over,
});
function fakePeer() {
  const sent: any[] = []; let closed: number | null = null;
  const p: Peer & { sent: any[]; closed(): number | null; last(t: string): any } = {
    sent, send: m => { sent.push(m); }, close: c => { closed = c ?? 1000; }, closed: () => closed,
    last: t => [...sent].reverse().find(m => m.t === t),
  };
  return p;
}

test('room: lobby → ready → countdown → go → relay → finish → one result', () => {
  let now = T0; const results: RoomResult[] = [];
  const room = new RelayRoom({ id: 'm1', def: fastDef(), min: 2, rated: true, now: () => now, onResult: r => results.push(r), resume: t => `resume-${t.uid}` });
  const a = fakePeer(), b = fakePeer();
  assert.deepEqual(room.join(ticket(), a), { ok: true });
  assert.equal(a.last('welcome').resume, 'resume-alice');
  room.message(0, a, { t: 'ready', ready: true });
  room.tick();
  assert.equal(room.phase, 'lobby', 'one player is not enough');
  assert.deepEqual(room.join(ticket({ uid: 'bob', seat: 1, name: 'Bob' }), b), { ok: true });
  room.message(1, b, { t: 'ready', ready: true });
  room.tick();
  assert.equal(room.phase, 'countdown');
  assert.equal(b.last('countdown').goAt, T0 + 1000);
  // Unready during the countdown → back to the lobby; ready again → new countdown.
  room.message(1, b, { t: 'ready', ready: false }); assert.equal(room.phase, 'lobby');
  room.message(1, b, { t: 'ready', ready: true }); room.tick(); assert.equal(room.phase, 'countdown');
  // A third player can't take a seat once the race has started.
  now += 1000; room.tick();
  assert.equal(room.phase, 'running');
  assert.ok(a.last('go'));
  assert.equal(room.join(ticket({ uid: 'carol', seat: 2 }), fakePeer()).ok, false);
  // States relay to the other seat only.
  room.message(0, a, { t: 'state', s: { x: 1, z: 2, lap: 0, splineT: 0.2 } });
  now += 50; room.tick();
  const tick = b.last('tick');
  assert.deepEqual(tick.s, [{ x: 1, z: 2, lap: 0, splineT: 0.2, seat: 0 }]);
  assert.equal(a.sent.filter(m => m.t === 'tick').length, 0, 'own state is not echoed');
  // A client "result" message is ignored; only progress the server saw counts.
  room.message(1, b, { t: 'result', winner: 1 });
  for (const step of [0.6, 0.99]) { now += 500; room.message(0, a, { t: 'state', s: { lap: 0, splineT: step } }); room.tick(); }
  now += 500; room.message(0, a, { t: 'state', s: { lap: 1, splineT: 0 } }); room.tick();
  assert.equal(b.last('finish').seat, 0);
  for (let i = 0; i < 5; i++) { now += 500; room.message(1, b, { t: 'state', s: { lap: 0, splineT: Math.min(0.99, 0.2 * (i + 1)) } }); room.tick(); }
  now += 500; room.message(1, b, { t: 'state', s: { lap: 1, splineT: 0 } }); room.tick();
  assert.equal(room.phase, 'finished');
  assert.equal(results.length, 1);
  assert.deepEqual(results[0].standings.map(s => [s.uid, s.place, s.dnf]), [['alice', 1, false], ['bob', 2, false]]);
  room.tick(); room.tick();
  assert.equal(results.length, 1, 'result fires once');
  room.recorded(true);
  assert.equal(a.last('recorded').ok, true);
});

test('room: reconnect inside the grace window keeps the seat; past it is a DNF', () => {
  let now = T0; const results: RoomResult[] = [];
  const room = new RelayRoom({ id: 'm2', def: fastDef(), min: 2, rated: true, now: () => now, onResult: r => results.push(r) });
  const a = fakePeer(), b = fakePeer();
  room.join(ticket({ room: 'm2' }), a); room.join(ticket({ room: 'm2', uid: 'bob', seat: 1 }), b);
  room.message(0, a, { t: 'ready', ready: true }); room.message(1, b, { t: 'ready', ready: true });
  room.tick(); now += 1000; room.tick();
  assert.equal(room.phase, 'running');
  // Bob drops and comes back 1.5 s later on a new socket: same seat, still racing.
  room.leave(1, b);
  now += 1500; room.tick();
  const b2 = fakePeer();
  assert.deepEqual(room.join(ticket({ room: 'm2', uid: 'bob', seat: 1, k: 'resume' }), b2), { ok: true });
  assert.equal(b2.last('welcome').phase, 'running');
  // Someone else can't take bob's seat, and bob can't take a second one.
  assert.equal(room.join(ticket({ room: 'm2', uid: 'mallory', seat: 1 }), fakePeer()).ok, false);
  assert.equal(room.join(ticket({ room: 'm2', uid: 'bob', seat: 3 }), fakePeer()).ok, false);
  // Now alice drops for good: past the grace window she's out and bob wins by forfeit.
  room.leave(0, a);
  now += 2001; room.tick();
  assert.equal(room.phase, 'finished');
  assert.deepEqual(results[0].standings.map(s => [s.uid, s.place, s.dnf]), [['bob', 1, false], ['alice', 2, true]]);
});

test('room: a replaced socket is kicked and its close is ignored', () => {
  const now = T0;
  const room = new RelayRoom({ id: 'm3', def: fastDef(), min: 2, rated: false, now: () => now, onResult: () => {} });
  const a1 = fakePeer(), a2 = fakePeer();
  room.join(ticket({ room: 'm3' }), a1);
  room.join(ticket({ room: 'm3' }), a2);
  assert.equal(a1.closed(), 4001);
  room.leave(0, a1); // the old socket's close event arrives late
  assert.equal(room.connected, 1);
});

// ── settlement ──────────────────────────────────────────────────────────────────────
test('settle: 1v1 matches the turn-based Elo; a field uses pairwise Elo and names one opponent', () => {
  const plan = settlementPlan({
    matchId: 'm', game: APEX_RACE, rated: true, at: T0,
    standings: [{ uid: 'b', place: 2, timeMs: null, dnf: true }, { uid: 'a', place: 1, timeMs: 61_500, dnf: false }],
    stats: { a: { rating: 1200, rated: 0 }, b: { rating: 1300, rated: 25 } },
  });
  assert.deepEqual(plan.map(e => [e.uid, e.result, e.opponentUid, e.ratingAfter, e.key, e.source]), [
    ['a', 'win', 'b', nextRating(1200, 1300, 1, 0), 'rt:m', 'first-party'],
    ['b', 'loss', 'a', nextRating(1300, 1200, 0, 25), 'rt:m', 'first-party'],
  ]);
  assert.equal(plan[0].note, 'P1/2 · 1:01.50');
  const three = settlementPlan({
    matchId: 'm3', game: APEX_RACE, rated: true, at: T0,
    standings: [{ uid: 'a', place: 1, timeMs: 1, dnf: false }, { uid: 'b', place: 2, timeMs: 2, dnf: false }, { uid: 'c', place: 3, timeMs: 3, dnf: false }],
    stats: {},
  });
  assert.deepEqual(three.map(e => [e.uid, e.opponentUid, e.rank, e.players]), [['a', 'b', 1, 3], ['b', 'a', 2, 3], ['c', 'b', 3, 3]]);
  assert.ok(three[0].ratingAfter! > 1200 && three[1].ratingAfter === 1200 && three[2].ratingAfter! < 1200);
  const unrated = settlementPlan({ matchId: 'u', game: APEX_RACE, rated: false, at: T0, standings: three.map(e => ({ uid: e.uid, place: e.rank!, timeMs: 1, dnf: false })), stats: {} });
  assert.ok(unrated.every(e => e.ratingAfter === e.ratingBefore));
});

// ── end to end: API + realtime server + two clients ─────────────────────────────────
async function stack(opts: { postFetch?: typeof fetch } = {}) {
  const store = memoryGamerStore();
  const app = express();
  const gamer = createGamerRouter({
    store, verify: async t => (t.startsWith('tok-') ? t.slice(4) : null), userCard: async uid => ({ name: uid[0].toUpperCase() + uid.slice(1) }),
    realtime: { ticketSecret: SECRET, resultSecret: RSECRET, urls: ['ws://placeholder'] },
  });
  app.use('/api/gamer', express.json({ limit: '8kb' }), gamer);
  const api = app.listen(0);
  await new Promise(r => api.once('listening', r));
  const apiUrl = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  const def = fastDef({ countdownMs: 300, tickHz: 30, referee: () => new RaceReferee({ laps: 1, maxProgressPerSec: 4, maxSpeedMps: 1000, finishGraceMs: 2000, maxRaceMs: 30_000 }) });
  const rt = await startRealtimeServer({
    port: 0, host: '127.0.0.1', ticketSecret: SECRET, games: id => (id === APEX_RACE ? def : null), lingerMs: 2000,
    postResult: resultPoster({ apiUrl, secret: RSECRET, backoffMs: [0, 200], fetch: opts.postFetch as never }),
  });
  return { store, api, apiUrl, rt, rtUrl: `ws://127.0.0.1:${rt.port}`, close: async () => { await rt.close(); await new Promise(r => api.close(r)); } };
}

function client(apiUrl: string, uid: string) {
  const events: RtEvent[] = [];
  const waiters: Array<{ pred: (e: RtEvent) => boolean; res: (e: RtEvent) => void }> = [];
  const c = new RealtimeClient({
    apiBase: apiUrl, game: APEX_RACE, getToken: async () => `tok-${uid}`,
    onEvent: e => { events.push(e); for (const w of [...waiters]) if (w.pred(e)) { waiters.splice(waiters.indexOf(w), 1); w.res(e); } },
  });
  const until = (pred: (e: RtEvent) => boolean, ms = 5000) => {
    const hit = events.find(pred); if (hit) return Promise.resolve(hit);
    return new Promise<RtEvent>((res, rej) => { const t = setTimeout(() => rej(new Error(`timeout waiting (${uid})`)), ms); waiters.push({ pred, res: e => { clearTimeout(t); res(e); } }); });
  };
  return { c, events, until };
}

/** Rewrite every rt match's url to the live test server (the router was built with a placeholder). */
async function pointMatches(store: ReturnType<typeof memoryGamerStore>, url: string) {
  for (const [id, m] of Object.entries(store.dump('gamerRtMatches'))) await store.cas('gamerRtMatches').put(id, { ...m, url }, String((await store.cas('gamerRtMatches').get(id))!.version));
}

async function drive(c: RealtimeClient, secs: number, speedLapsPerSec: number) {
  const start = Date.now();
  while (Date.now() - start < secs * 1000) {
    const p = Math.min(1, ((Date.now() - start) / 1000) * speedLapsPerSec);
    c.sendState({ x: p * 1000, z: 0, yaw: 0, lap: p >= 1 ? 1 : 0, splineT: p >= 1 ? 0 : p });
    if (p >= 1) return;
    await new Promise(r => setTimeout(r, 33));
  }
}

test('e2e: private room, tickets, synced countdown, race, result signed back onto both ledgers', async () => {
  const s = await stack();
  try {
    const cfg = await (await fetch(`${s.apiUrl}/api/gamer/rt/config`)).json();
    assert.equal(cfg.enabled, true);
    const A = client(s.apiUrl, 'alice'), B = client(s.apiUrl, 'bob');
    const { matchId, code } = await A.c.createPrivate();
    assert.equal(await B.c.joinCode(code), matchId);
    await pointMatches(s.store, s.rtUrl);
    // A ticket is only issued to players in the match.
    const stranger = await fetch(`${s.apiUrl}/api/gamer/rt/ticket`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer tok-mallory' }, body: JSON.stringify({ matchId }) });
    assert.equal(stranger.status, 404);
    await A.c.connect(matchId); await B.c.connect(matchId);
    await A.until(e => e.type === 'lobby' && e.players.length === 2 && e.players.every(p => p.connected));
    A.c.setReady(true); B.c.setReady(true);
    const ca = await A.until(e => e.type === 'countdown') as Extract<RtEvent, { type: 'countdown' }>;
    const cb = await B.until(e => e.type === 'countdown') as Extract<RtEvent, { type: 'countdown' }>;
    assert.equal(ca.goAt, cb.goAt, 'both clients get the same server GO time');
    await Promise.all([A.until(e => e.type === 'go'), B.until(e => e.type === 'go')]);
    // Both drive; alice is faster. Bob sees alice's states relayed.
    await Promise.all([drive(A.c, 3, 2), drive(B.c, 3, 1.2)]);
    const seen = B.events.filter(e => e.type === 'states').flatMap(e => (e as any).states);
    assert.ok(seen.some((x: any) => x.seat === 0 && typeof x.x === 'number'), 'bob received alice state');
    const ra = await A.until(e => e.type === 'result') as Extract<RtEvent, { type: 'result' }>;
    assert.deepEqual(ra.standings.map(x => [x.uid, x.place, x.dnf]), [['alice', 1, false], ['bob', 2, false]]);
    await A.until(e => e.type === 'recorded' && e.ok === true);
    const ha = await (await fetch(`${s.apiUrl}/api/gamer/history/alice`)).json();
    const hb = await (await fetch(`${s.apiUrl}/api/gamer/history/bob`)).json();
    const aliceMatch = ha.entries.find((e: any) => e.event === 'MATCH_RESULT');
    const aliceAch = ha.entries.find((e: any) => e.event === 'ACHIEVEMENT');
    assert.ok(aliceMatch); assert.equal(aliceMatch.result, 'win'); assert.equal(aliceMatch.source, 'first-party'); assert.equal(aliceMatch.matchId, matchId);
    assert.equal(aliceAch?.achievementId, 'apex-race.first-win');
    assert.equal(hb.entries[0].result, 'loss'); assert.equal(hb.entries[0].opponentUid, 'alice');
    const va = await (await fetch(`${s.apiUrl}/api/gamer/verify/alice`)).json();
    assert.equal(va.chain.ok, true); assert.equal(va.scoreMatches, true);
    // The match is closed: no new tickets.
    const again = await fetch(`${s.apiUrl}/api/gamer/rt/ticket`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer tok-alice' }, body: JSON.stringify({ matchId }) });
    assert.equal(again.status, 409);
    A.c.leave(); B.c.leave();
  } finally { await s.close(); }
});

test('e2e: rated queue pairs two players; bad tickets are refused by the realtime server', async () => {
  const s = await stack();
  try {
    const A = client(s.apiUrl, 'alice'), B = client(s.apiUrl, 'bob');
    const [ma, mb] = await Promise.all([A.c.quickMatch(), (async () => { await new Promise(r => setTimeout(r, 100)); return B.c.quickMatch(); })()]);
    assert.equal(ma, mb);
    const m = (await s.store.get('gamerRtMatches', ma))!;
    assert.equal(m.rated, true); assert.deepEqual(m.players, ['alice', 'bob']);
    // A forged ticket never gets a seat.
    const bad = new WebSocket(s.rtUrl);
    const closed = await new Promise<number>(res => { bad.onopen = () => bad.send(JSON.stringify({ t: 'hello', ticket: signTicket(ticket({ room: ma }), 'not-the-real-secret-123') })); bad.onclose = e => res(e.code); });
    assert.equal(closed, 4003);
    assert.equal(s.rt.rooms.size, 0, 'no room was created for a forged ticket');
  } finally { await s.close(); }
});

test('api: unsigned or forged results are refused; the per-opponent daily cap still applies', async () => {
  const s = await stack();
  try {
    const post = (body: unknown, ts = Date.now(), secret = RSECRET) => fetch(`${s.apiUrl}/api/gamer/rt/result`, {
      method: 'POST', headers: { 'content-type': 'application/json', [RESULT_TS_HEADER]: String(ts), [RESULT_SIG_HEADER]: signBody(body, secret, ts) }, body: JSON.stringify(body),
    });
    const api = (uid: string, path: string, body?: unknown) => fetch(`${s.apiUrl}/api/gamer/rt${path}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer tok-${uid}` }, body: JSON.stringify(body ?? {}) }).then(r => r.json());
    const result = (matchId: string, winner = 'alice', loser = 'bob') => ({ matchId, game: APEX_RACE, rated: false, startedAt: Date.now() - 60_000, endedAt: Date.now(), standings: [{ seat: 0, uid: winner, name: 'W', place: 1, timeMs: 60_000, dnf: false, progress: 1 }, { seat: 1, uid: loser, name: 'L', place: 2, timeMs: null, dnf: true, progress: 0.5 }] });

    const { matchId, code } = await api('alice', '/private', { game: APEX_RACE });
    await api('bob', '/join', { code });
    // A client posting its own "result" has no signature → 401. Forged secret → 401.
    const naked = await fetch(`${s.apiUrl}/api/gamer/rt/result`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer tok-alice' }, body: JSON.stringify(result(matchId)) });
    assert.equal(naked.status, 401);
    assert.equal((await post(result(matchId), Date.now(), 'forged-secret-0123456789abc')).status, 401);
    // Signed, but naming someone who isn't in the match → 400.
    assert.equal((await post(result(matchId, 'alice', 'mallory'))).status, 400);
    // Valid → ledger; replay → already.
    assert.equal((await (await post(result(matchId))).json()).entries, 2);
    assert.equal((await (await post(result(matchId))).json()).already, true);

    for (let i = 0; i < PAIR_DAILY_CAP + 1; i++) {
      const m = await api('alice', '/private', { game: APEX_RACE });
      await api('bob', '/join', { code: m.code });
      assert.equal((await post(result(m.matchId))).status, 200);
    }
    const prof = await (await fetch(`${s.apiUrl}/api/gamer/profile/alice`)).json();
    assert.equal(prof.profile.games[APEX_RACE].wins, PAIR_DAILY_CAP + 2);
    // play points: 15 per counted win, counted at most PAIR_DAILY_CAP times a day against the same opponent.
    assert.equal(prof.profile.scoreCard.play, 15 * PAIR_DAILY_CAP);
    const lb = await (await fetch(`${s.apiUrl}/api/gamer/leaderboard?game=${APEX_RACE}`)).json();
    assert.equal(lb.game, APEX_RACE);
  } finally { await s.close(); }
});

test('room: drop-in open-world shard (apex-world) starts immediately, accepts late joiners, frees seats and idles out', () => {
  let now = T0;
  const worldDef = REALTIME_GAMES[APEX_WORLD];
  const room = new RelayRoom({ id: 'w1', def: worldDef, min: 1, rated: false, meta: { region: 'ironport' }, now: () => now, onResult: () => {}, idleMs: 10_000 });
  const a = fakePeer(), b = fakePeer(), c = fakePeer();
  // First driver enters and the drop-in shard launches immediately into running without waiting in a lobby.
  assert.deepEqual(room.join(ticket({ room: 'w1', game: APEX_WORLD, uid: 'alice', seat: 0, min: 1, rated: false, meta: { region: 'ironport' } }), a), { ok: true });
  assert.equal(room.phase, 'running');
  assert.deepEqual(a.last('welcome').meta, { region: 'ironport' });
  // Second driver drops into the already-running shard and receives Alice's live car telemetry.
  room.message(0, a, { t: 'state', s: { x: 100, z: 200, yaw: 0.5 } });
  assert.deepEqual(room.join(ticket({ room: 'w1', game: APEX_WORLD, uid: 'bob', seat: 1, min: 1, rated: false }), b), { ok: true });
  assert.equal(b.last('welcome').phase, 'running');
  assert.equal(b.last('welcome').states.length, 1);
  // Alice explicitly leaves -> seat 0 is freed so Carol can take seat 0 right away.
  room.leave(0, a, true);
  assert.deepEqual(room.join(ticket({ room: 'w1', game: APEX_WORLD, uid: 'carol', seat: 0, min: 1, rated: false }), c), { ok: true });
  // Everyone leaves -> shard closes cleanly after idleMs.
  room.leave(1, b, true); room.leave(0, c, true);
  now += 100; room.tick();
  assert.equal(room.phase, 'running');
  now += 10_001; room.tick();
  assert.equal(room.phase, 'closed');
});

test('e2e: /rt/shard drop-in pooling + seat recycling and circuitId room meta sync', async () => {
  const store = memoryGamerStore();
  const app = express();
  const gamer = createGamerRouter({
    store, verify: async t => (t.startsWith('tok-') ? t.slice(4) : null), userCard: async uid => ({ name: uid[0].toUpperCase() + uid.slice(1) }),
    realtime: { ticketSecret: SECRET, resultSecret: RSECRET, urls: ['ws://placeholder'] },
  });
  app.use('/api/gamer', express.json({ limit: '8kb' }), gamer);
  const api = app.listen(0);
  await new Promise(r => api.once('listening', r));
  const apiUrl = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  const rt = await startRealtimeServer({
    port: 0, host: '127.0.0.1', ticketSecret: SECRET,
    postResult: resultPoster({ apiUrl, secret: RSECRET }),
  });
  const rtUrl = `ws://127.0.0.1:${rt.port}`;
  try {
    // 1. Two players calling joinShard() for apex-world land in the SAME open-world shard and sync telemetry.
    const wA = new RealtimeClient({ apiBase: apiUrl, game: APEX_WORLD, getToken: async () => 'tok-alice', onEvent: () => {} });
    const wB = new RealtimeClient({ apiBase: apiUrl, game: APEX_WORLD, getToken: async () => 'tok-bob', onEvent: () => {} });
    const shardA = await wA.joinShard({ region: 'ironport' });
    const shardB = await wB.joinShard({ region: 'ironport' });
    assert.equal(shardA, shardB, 'second player joins the existing open-world shard');
    await pointMatches(store, rtUrl);
    await wA.connect(shardA);
    await wB.connect(shardB);
    await new Promise(r => setTimeout(r, 150));
    assert.equal(wA.phase, 'running');
    assert.equal(wB.phase, 'running');
    assert.deepEqual(wB.meta, { region: 'ironport' });
    wA.leave();
    await new Promise(r => setTimeout(r, 100));
    // Carol takes Alice's recycled seat 0 without shifting Bob's seat 1.
    const wC = new RealtimeClient({ apiBase: apiUrl, game: APEX_WORLD, getToken: async () => 'tok-carol', onEvent: () => {} });
    const shardC = await wC.joinShard({ region: 'ironport' });
    assert.equal(shardC, shardA);
    await wC.connect(shardC);
    await new Promise(r => setTimeout(r, 100));
    assert.equal(wC.seat, 0);
    assert.equal(wB.seat, 1);
    wB.leave(); wC.leave();

    // 2. Private race room propagates circuitId metadata from creator -> joiner -> ticket -> WS welcome.
    const rA = client(apiUrl, 'alice'), rB = client(apiUrl, 'bob');
    const created = await rA.c.createPrivate({ circuitId: 'pinewood_rally_stage' });
    assert.equal(created.meta?.circuitId, 'pinewood_rally_stage');
    const joinedId = await rB.c.joinCode(created.code);
    assert.equal(joinedId, created.matchId);
    assert.equal(rB.c.meta?.circuitId, 'pinewood_rally_stage');
    await pointMatches(store, rtUrl);
    await rA.c.connect(created.matchId);
    await rB.c.connect(joinedId);
    await rB.until(e => e.type === 'lobby' && e.meta?.circuitId === 'pinewood_rally_stage');
    rA.c.leave(); rB.c.leave();
  } finally {
    await rt.close();
    await new Promise(r => api.close(r));
  }
});
