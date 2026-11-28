// Playing together: chat rules (masking, quick chat, kids, rate limit, blocks), party rules (join/leave/leader
// hand-off/invites/voice), and the /api/gamer/party + /api/gamer/chat routers end to end on a memory store.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import * as C from '../services/gamerNet/chat';
import * as P from '../services/gamerNet/party';
import { memoryGamerStore } from '../services/gamerNet/store';
import { createGamerRouter } from '../routes/gamerNet';
import { createGamerTogether } from '../routes/gamerTogether';
import type { GamerNotice } from '../routes/gamerSocial';
import { verifyJwt } from '../services/meetings/livekitServer';

const adult = (uid: string): C.Sender => ({ uid, name: uid, photo: '', isChild: false });
const kid = (uid: string): C.Sender => ({ uid, name: uid, photo: 'p.jpg', isChild: true });

// ── chat rules ──────────────────────────────────────────────────────────────────────
test('chat: scopes parse strictly', () => {
  assert.deepEqual(C.parseScope('match_abc-1'), { kind: 'match', id: 'abc-1', key: 'match_abc-1' });
  assert.equal(C.parseScope('party_../x'), null);
  assert.equal(C.parseScope('dm_abc'), null);
  assert.equal(C.parseScope(''), null);
});

test('chat: text is cleaned and profanity masked', () => {
  assert.equal(C.cleanText('  hi\u0000 there\n\n you  '), 'hi there you');
  assert.equal(C.cleanText('what the fuck!'), 'what the ****!');
  assert.equal(C.cleanText('   '), null);
  assert.equal(C.cleanText('x'.repeat(500))!.length, C.MAX_TEXT);
});

test('chat: children send quick chat only, appear as Player, and see others’ free text hidden', () => {
  const k = C.appendLine(null, 'match_m', kid('k'), { text: 'hello' }, 'l1', 1000);
  assert.equal(k.ok, false);
  const q = C.appendLine(null, 'match_m', kid('k'), { quick: 'gg' }, 'l1', 1000);
  assert.ok(q.ok); if (!q.ok) return;
  assert.equal(q.line.text, 'GG'); assert.equal(q.line.name, 'Player'); assert.equal(q.line.photo, '');
  const a = C.appendLine(q.doc, 'match_m', adult('a'), { text: 'nice one' }, 'l2', 1100);
  assert.ok(a.ok); if (!a.ok) return;
  const seenByKid = C.viewLines(a.doc, 0, { uid: 'k', isChild: true, hidden: new Set() });
  assert.deepEqual(seenByKid.map(l => l.text), ['GG', '(message hidden)']);
  const seenByAdult = C.viewLines(a.doc, 1, { uid: 'a', isChild: false, hidden: new Set() });
  assert.deepEqual(seenByAdult.map(l => l.text), ['nice one'], 'since filters by seq');
  assert.deepEqual(C.viewLines(a.doc, 0, { uid: 'x', isChild: false, hidden: new Set(['a']) }).map(l => l.uid), ['k'], 'blocked people are hidden');
  assert.equal(C.appendLine(null, 'match_m', adult('a'), { quick: 'hack' }, 'l', 1).ok, false, 'unknown quick id');
});

test('chat: rate limit — 5 per 10 s, then cool down', () => {
  let doc: C.ChatDoc | null = null;
  for (let i = 0; i < 5; i++) { const r = C.appendLine(doc, 'party_p', adult('a'), { text: `m${i}` }, `l${i}`, 1000 + i); assert.ok(r.ok); if (r.ok) doc = r.doc; }
  const blocked = C.appendLine(doc, 'party_p', adult('a'), { text: 'more' }, 'lx', 1010);
  assert.equal(blocked.ok, false); if (!blocked.ok) assert.equal(blocked.status, 429);
  assert.ok(C.appendLine(doc, 'party_p', adult('b'), { text: 'me too' }, 'ly', 1010).ok, 'per person');
  assert.ok(C.appendLine(doc, 'party_p', adult('a'), { text: 'later' }, 'lz', 1000 + 10_001).ok);
});

test('chat: log is capped', () => {
  let doc: C.ChatDoc | null = null;
  for (let i = 0; i < C.MAX_LINES + 10; i++) doc = C.appendSystem(doc, 'party_p', `n${i}`, `s${i}`, i);
  assert.equal(doc!.lines.length, C.MAX_LINES); assert.equal(doc!.seq, C.MAX_LINES + 10);
});

test('chat: access — players, members, spectators', () => {
  assert.equal(C.accessFor('match', { uid: 'a', isChild: false, isPlayer: false }).read, false);
  assert.equal(C.accessFor('match', { uid: 'a', isChild: true, isPlayer: true }).quickOnly, true);
  assert.equal(C.accessFor('spec', { uid: 'a', isChild: false, isPlayer: true, matchDone: false }).read, false, 'players don’t read spectators mid-match');
  assert.equal(C.accessFor('spec', { uid: 'a', isChild: false, isPlayer: true, matchDone: true }).read, true);
  assert.equal(C.accessFor('spec', { uid: 'z', isChild: false }).post, true);
  assert.equal(C.accessFor('party', { uid: 'a', isChild: false, isMember: false }).read, false);
});

// ── party rules ─────────────────────────────────────────────────────────────────────
const pm = (uid: string, at = 0, isChild = false): P.PartyMember => ({ uid, name: uid.toUpperCase(), photo: '', isChild, joinedAt: at });

test('party: join, cap, leader hand-off, last out closes', () => {
  let d = P.newParty({ id: 'p', code: 'ABC234', leader: pm('a'), now: 0 });
  for (const u of ['b', 'c', 'd', 'e', 'f', 'g', 'h']) { const r = P.join(d, pm(u), 10); assert.ok(r.ok); if (r.ok) d = r.doc; }
  assert.equal(d.members.length, P.MAX_PARTY);
  assert.equal(P.join(d, pm('i'), 10).ok, false, 'full');
  const r1 = P.leave(d, 'a', 20); assert.ok(r1.ok); if (!r1.ok) return;
  assert.equal(r1.doc.leader, 'b'); assert.match(r1.note!, /B leads now/);
  let x = P.newParty({ id: 'q', code: 'X', leader: pm('a'), now: 0 });
  const r2 = P.leave(x, 'a', 1); assert.ok(r2.ok); if (r2.ok) x = r2.doc;
  assert.equal(x.status, 'closed');
  assert.equal(P.join(x, pm('b'), 2).ok, false, 'closed parties take nobody');
});

test('party: invites expire, only the leader runs the party, kids stay off voice', () => {
  let d = P.newParty({ id: 'p', code: 'C', leader: pm('a'), now: 0 });
  assert.equal(P.join(d, pm('b'), 1, true).ok, false, 'no invite');
  const inv = P.invite(d, 'a', 'b', 1); assert.ok(inv.ok); if (inv.ok) d = inv.doc;
  assert.equal(P.partyView(d, 1).pendingInvites, 1);
  assert.ok(!('invites' in P.partyView(d, 1)), 'who invited whom stays private');
  assert.equal(P.join(d, pm('b'), 1 + P.INVITE_TTL_MS, true).ok, false, 'expired');
  const j = P.join(d, pm('b', 0, true), 2, true); assert.ok(j.ok); if (j.ok) d = j.doc;
  assert.equal(P.kick(d, 'b', 'a', 3).ok, false, 'members can’t kick');
  assert.equal(P.setGame(d, 'b', 'ttt', 3).ok, false);
  assert.ok(P.setGame(d, 'a', 'ttt', 3).ok);
  assert.equal(P.voiceAllowed(d, 'a'), true); assert.equal(P.voiceAllowed(d, 'b'), false);
  assert.equal(P.startMatch(d, 'a', { id: 'm', game: 'ttt', seats: ['a', 'zed'] }, 4).ok, false, 'seats must be members');
});

// ── routers ─────────────────────────────────────────────────────────────────────────
const LK = { url: 'wss://lk.example', apiKey: 'key', apiSecret: 'secret-secret-secret' };

async function harness(opts: { voice?: boolean; kids?: string[]; rtUrls?: string[] } = {}) {
  const store = memoryGamerStore();
  let clock = 5_000_000;
  const notices: GamerNotice[] = [];
  const blocks = new Set<string>(['carl|dave']);
  const kids = new Set(opts.kids ?? []);
  const verify = async (t: string) => (t.startsWith('tok-') ? t.slice(4) : null);
  const userCard = async (uid: string) => ({ name: uid[0].toUpperCase() + uid.slice(1), isChild: kids.has(uid) });
  const blockedFor = async (uid: string) => new Set([...blocks].flatMap(p => { const [a, b] = p.split('|'); return a === uid ? [b] : b === uid ? [a] : []; }));
  const app = express();
  const t = createGamerTogether({
    store, verify, userCard, now: () => clock, notify: async n => { notices.push(n); }, blockedFor,
    livekit: () => (opts.voice ? LK : null),
    rtUrls: opts.rtUrls ? () => opts.rtUrls! : undefined,
  });
  app.use('/api/gamer/party', express.json(), t.party);
  app.use('/api/gamer/chat', express.json(), t.chat);
  app.use('/api/gamer', express.json(), createGamerRouter({ store, verify, userCard, now: () => clock }));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/gamer`;
  const call = async (uid: string | null, method: string, path: string, body?: object) => {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(uid ? { Authorization: `Bearer tok-${uid}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, json: await res.json().catch(() => ({})) as any };
  };
  return { call, notices, store, tick: (ms: number) => { clock += ms; }, close: () => server.close() };
}

test('router: party by code, invite by notification, chat with system lines, play a match from the party', async () => {
  const h = await harness();
  try {
    assert.equal((await h.call(null, 'GET', '/party/me')).status, 401);
    assert.equal((await h.call('ann', 'GET', '/party/me')).json.party, null);
    const made = await h.call('ann', 'POST', '/party', { game: 'ttt' });
    const party = made.json.party; assert.equal(party.leader, 'ann'); assert.equal(party.code.length, 6);
    assert.equal(made.json.voice.available, false);

    assert.equal((await h.call('bob', 'POST', '/party/join', { code: 'ZZZZZZ' })).status, 404);
    const joined = await h.call('bob', 'POST', '/party/join', { code: party.code.toLowerCase() });
    assert.deepEqual(joined.json.party.members.map((m: any) => m.uid), ['ann', 'bob']);

    // invite carl through a notification; dave is blocked by carl and can't join
    assert.equal((await h.call('bob', 'POST', '/party/invite', { to: 'carl' })).status, 200);
    const n = h.notices.at(-1)!; assert.equal(n.userId, 'carl'); assert.equal(n.link, `game-party:${party.id}`);
    assert.equal((await h.call('carl', 'GET', `/party/peek/${party.id}`)).json.party.members.length, 2);
    assert.equal((await h.call('eve', 'GET', `/party/peek/${party.id}`)).status, 404, 'no invite, no peek');
    assert.equal((await h.call('carl', 'POST', '/party/join', { partyId: party.id })).status, 200);
    assert.equal((await h.call('dave', 'POST', '/party/join', { code: party.code })).status, 403, 'blocked by a member');

    // chat
    const scope = `party_${party.id}`;
    assert.equal((await h.call('eve', 'GET', `/chat/${scope}`)).status, 403);
    assert.equal((await h.call('bob', 'POST', `/chat/${scope}`, { text: 'yo  team' })).json.line.text, 'yo team');
    await h.call('carl', 'POST', `/chat/${scope}`, { quick: 'ready' });
    const log = await h.call('ann', 'GET', `/chat/${scope}?since=0`);
    assert.deepEqual(log.json.lines.map((l: any) => l.text), ['Ann started the party', 'Bob joined the party', 'Carl joined the party', 'yo team', "I'm ready"]);
    assert.equal(log.json.access.post, true); assert.ok(log.json.quick.length > 5);
    const after = await h.call('ann', 'GET', `/chat/${scope}?since=${log.json.seq}`);
    assert.equal(after.json.lines.length, 0);

    // report another person's line (once)
    const line = log.json.lines[3];
    assert.equal((await h.call('ann', 'POST', `/chat/${scope}/report`, { lineId: line.id, reason: 'test' })).json.ok, true);
    assert.equal((await h.call('ann', 'POST', `/chat/${scope}/report`, { lineId: line.id })).json.duplicate, true);
    assert.equal((await h.call('bob', 'POST', `/chat/${scope}/report`, { lineId: line.id })).status, 400, 'not your own');

    // leader-only actions
    assert.equal((await h.call('bob', 'POST', '/party/play', { game: 'ttt', with: 'ann' })).status, 403);
    assert.equal((await h.call('ann', 'POST', '/party/play', { game: 'nope', with: 'bob' })).status, 400);
    const play = await h.call('ann', 'POST', '/party/play', { game: 'ttt', with: 'bob' });
    assert.equal(play.status, 200); const matchId = play.json.matchId;
    assert.deepEqual(play.json.party.match.seats, ['ann', 'bob']);
    const mv = await h.call('ann', 'POST', `/match/${matchId}/move`, { move: 4 });
    assert.equal(mv.status, 200, 'the core router referees the party match'); assert.equal(mv.json.match.rated, false);

    // match chat: players only; spectators in their own room
    assert.equal((await h.call('ann', 'POST', `/chat/match_${matchId}`, { quick: 'gl' })).status, 200);
    assert.equal((await h.call('carl', 'GET', `/chat/match_${matchId}`)).status, 403);
    assert.equal((await h.call('carl', 'POST', `/chat/spec_${matchId}`, { text: 'go ann' })).status, 200);
    assert.equal((await h.call('ann', 'GET', `/chat/spec_${matchId}`)).status, 403, 'players see spectator chat after the match');

    // kick + leader hand-off
    assert.equal((await h.call('ann', 'POST', '/party/kick', { uid: 'carl' })).status, 200);
    assert.equal((await h.call('carl', 'GET', '/party/me')).json.party, null);
    await h.call('ann', 'POST', '/party/leave');
    const bobView = await h.call('bob', 'GET', '/party/me');
    assert.equal(bobView.json.party.leader, 'bob');
    await h.call('bob', 'POST', '/party/leave');
    assert.equal((await h.call('bob', 'POST', '/party/join', { code: party.code })).status, 404, 'empty party closed');
  } finally { h.close(); }
});

test('router: one party at a time — starting another leaves the first', async () => {
  const h = await harness();
  try {
    const a = (await h.call('ann', 'POST', '/party')).json.party;
    await h.call('bob', 'POST', '/party/join', { code: a.code });
    const b = (await h.call('bob', 'POST', '/party')).json.party;
    assert.notEqual(a.id, b.id);
    assert.deepEqual((await h.call('ann', 'GET', '/party/me')).json.party.members.map((m: any) => m.uid), ['ann']);
  } finally { h.close(); }
});

test('router: voice — off without LiveKit, tokens for members/players, never for kids', async () => {
  const off = await harness();
  try {
    const p = (await off.call('ann', 'POST', '/party')).json.party;
    const r = await off.call('ann', 'POST', '/chat/voice', { scope: `party_${p.id}` });
    assert.equal(r.status, 503); assert.equal(r.json.available, false);
  } finally { off.close(); }

  const h = await harness({ voice: true, kids: ['kim'] });
  try {
    const made = await h.call('ann', 'POST', '/party');
    assert.equal(made.json.voice.available, true);
    const p = made.json.party;
    await h.call('kim', 'POST', '/party/join', { code: p.code });
    const v = await h.call('ann', 'POST', '/chat/voice', { scope: `party_${p.id}` });
    assert.equal(v.status, 200); assert.equal(v.json.room, `gparty-${p.id}`); assert.equal(v.json.url, LK.url);
    const claims = verifyJwt(v.json.token, LK.apiSecret, { now: 5_000_000, issuer: LK.apiKey })!;
    assert.equal(claims.sub, 'ann'); assert.equal(claims.video.room, `gparty-${p.id}`);
    assert.equal((await h.call('kim', 'POST', '/chat/voice', { scope: `party_${p.id}` })).status, 403, 'kids never get voice');
    assert.equal((await h.call('eve', 'POST', '/chat/voice', { scope: `party_${p.id}` })).status, 403, 'members only');
    assert.equal((await h.call('ann', 'POST', '/chat/voice', { scope: `spec_x` })).status, 400);

    // match voice: off against a child opponent
    const kidMatch = (await h.call('ann', 'POST', '/party/play', { game: 'ttt', with: 'kim' })).json.matchId;
    assert.equal((await h.call('ann', 'POST', '/chat/voice', { scope: `match_${kidMatch}` })).status, 403);
    // kids' free text refused, quick chat fine
    assert.equal((await h.call('kim', 'POST', `/chat/match_${kidMatch}`, { text: 'hi' })).status, 403);
    assert.equal((await h.call('kim', 'POST', `/chat/match_${kidMatch}`, { quick: 'gg' })).status, 200);
  } finally { h.close(); }
});

// ── teams, party search, stream consent ─────────────────────────────────────────────
test('party: teams — pick your own, leader moves anyone, leaving clears it', () => {
  let d = P.newParty({ id: 'p', code: 'C', leader: pm('a'), now: 0 });
  for (const u of ['b', 'c']) { const r = P.join(d, pm(u), 1); if (r.ok) d = r.doc; }
  const self = P.setTeam(d, 'b', 'b', 1, 2); assert.ok(self.ok); if (self.ok) d = self.doc;
  assert.equal(P.teamOf(d, 'b'), 1);
  assert.equal(P.setTeam(d, 'b', 'c', 0, 3).ok, false, 'members only move themselves');
  const moved = P.setTeam(d, 'a', 'c', 0, 3); assert.ok(moved.ok); if (moved.ok) d = moved.doc;
  assert.equal(P.teamOf(d, 'c'), 0);
  const gone = P.leave(d, 'b', 4); assert.ok(gone.ok); if (gone.ok) d = gone.doc;
  assert.equal(P.teamOf(d, 'b'), null);
  const none = P.setTeam(d, 'c', 'c', null, 5); assert.ok(none.ok); if (none.ok) assert.equal(P.teamOf(none.doc, 'c'), null);
});

test('party: stream consent — one streamer, opt-in only, resets on change, kids never', () => {
  let d = P.newParty({ id: 'p', code: 'C', leader: pm('a'), now: 0 });
  for (const m of [pm('b'), pm('c'), pm('k', 0, true)]) { const r = P.join(d, m, 1); if (r.ok) d = r.doc; }
  assert.equal(P.setStreamConsent(d, 'b', true, 2).ok, false, 'nobody streaming yet');
  assert.equal(P.setStreaming(d, 'k', true, 2).ok, false, 'kids cannot stream party voice');
  const on = P.setStreaming(d, 'a', true, 2); assert.ok(on.ok); if (on.ok) d = on.doc;
  assert.deepEqual(d.streamOk, [], 'nobody is on it until they agree');
  assert.equal(P.setStreaming(d, 'b', true, 3).ok, false, 'one streamer at a time');
  const ok = P.setStreamConsent(d, 'b', true, 3); assert.ok(ok.ok); if (ok.ok) d = ok.doc;
  assert.deepEqual(d.streamOk, ['b']);
  assert.equal(P.setStreamConsent(d, 'k', true, 3).ok, false, 'kids are never put on a stream');
  assert.equal(P.setStreamConsent(d, 'a', true, 3).ok, false, 'the streamer does not consent to themselves');
  const back = P.setStreamConsent(d, 'b', false, 4); assert.ok(back.ok); if (back.ok) d = back.doc;
  assert.deepEqual(d.streamOk, []);
  const again = P.setStreamConsent(d, 'c', true, 5); if (again.ok) d = again.doc;
  const left = P.leave(d, 'a', 6); assert.ok(left.ok); if (left.ok) { assert.equal(left.doc.streaming, null); assert.deepEqual(left.doc.streamOk, []); }
});

test('party: search — leader only, new id each time', () => {
  let d = P.newParty({ id: 'p', code: 'C', leader: pm('a'), now: 0 });
  const j = P.join(d, pm('b'), 1); if (j.ok) d = j.doc;
  assert.equal(P.startQueue(d, 'b', { id: 'q1', game: 'ttt' }, 2).ok, false);
  const q = P.startQueue(d, 'a', { id: 'q1', game: 'ttt' }, 2); assert.ok(q.ok); if (q.ok) d = q.doc;
  assert.equal(d.queue!.id, 'q1');
  const s2 = P.stopQueue(d, 'a', 3); assert.ok(s2.ok); if (s2.ok) assert.equal(s2.doc.queue, null);
});

test('chat: team and realtime-room scopes', () => {
  assert.deepEqual(C.parseScope('team_abc-1_0'), { kind: 'team', id: 'abc-1_0', key: 'team_abc-1_0' });
  assert.equal(C.parseScope('team_abc-1'), null, 'team needs _0 or _1');
  assert.equal(C.parseScope('team_abc_2'), null);
  assert.equal(C.accessFor('team', { uid: 'a', isChild: false, isMember: true, onTeam: false }).read, false);
  assert.equal(C.accessFor('team', { uid: 'a', isChild: false, isMember: true, onTeam: true }).post, true);
  assert.equal(C.accessFor('rt', { uid: 'a', isChild: false, isPlayer: false }).read, false);
});

test('spatial: volume falls with distance and stops at the edge', async () => {
  const S = await import('../services/gamerNet/spatialVoice');
  const o = S.SPATIAL_DEFAULTS;
  assert.equal(S.proximityGain(0), 1); assert.equal(S.proximityGain(o.refDistance), 1);
  const mid = S.proximityGain(40), far = S.proximityGain(100);
  assert.ok(mid < 1 && far < mid && far > 0);
  assert.equal(S.proximityGain(o.maxDistance), 0); assert.equal(S.proximityGain(500), 0);
  assert.equal(S.distance({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 }), 5);
});

test('router: teams, team voice, party search, stream consent; realtime-room voice with blocks', async () => {
  const h = await harness({ voice: true, kids: ['kim'] });
  try {
    const p = (await h.call('ann', 'POST', '/party')).json.party;
    await h.call('bob', 'POST', '/party/join', { code: p.code });
    await h.call('carl', 'POST', '/party/join', { code: p.code });
    // teams
    assert.equal((await h.call('bob', 'POST', '/party/team', { team: 1 })).json.party.teams.bob, 1);
    assert.equal((await h.call('bob', 'POST', '/party/team', { uid: 'carl', team: 0 })).status, 403);
    assert.equal((await h.call('ann', 'POST', '/party/team', { uid: 'carl', team: 1 })).status, 200);
    const tv = await h.call('bob', 'POST', '/chat/voice', { scope: 'team_' + p.id + '_1' });
    assert.equal(tv.status, 200); assert.equal(tv.json.room, 'gteam-' + p.id + '-1');
    assert.equal((await h.call('ann', 'POST', '/chat/voice', { scope: 'team_' + p.id + '_1' })).status, 403, 'not on that team');
    assert.equal((await h.call('carl', 'POST', '/chat/team_' + p.id + '_1', { quick: 'ready' })).status, 200);
    assert.equal((await h.call('ann', 'GET', '/chat/team_' + p.id + '_1')).status, 403, 'team chat is for the team');
    // party search
    assert.equal((await h.call('bob', 'POST', '/party/queue', { game: 'ttt' })).status, 403);
    const q = await h.call('ann', 'POST', '/party/queue', { game: 'ttt' });
    assert.equal(q.json.party.queue.game, 'ttt');
    assert.equal((await h.call('ann', 'DELETE', '/party/queue')).json.party.queue, null);
    // stream consent
    assert.equal((await h.call('bob', 'POST', '/party/stream', { on: true })).json.party.streaming.uid, 'bob');
    assert.equal((await h.call('ann', 'POST', '/party/stream', { on: true })).status, 409);
    assert.deepEqual((await h.call('ann', 'POST', '/party/stream-consent', { ok: true })).json.party.streamOk, ['ann']);
    assert.deepEqual((await h.call('ann', 'POST', '/party/stream-consent', { ok: false })).json.party.streamOk, []);
    assert.equal((await h.call('bob', 'POST', '/party/stream', { on: false })).json.party.streaming, null);

    // realtime room voice: players only, blocked people listed for the listener to drop
    await h.store.createOnce('gamerRtMatches', 'race1', { id: 'race1', game: 'apex-race', status: 'open', players: ['carl', 'dave', 'ann'] });
    const rv = await h.call('carl', 'POST', '/chat/voice', { scope: 'rt_race1' });
    assert.equal(rv.status, 200); assert.equal(rv.json.room, 'grt-race1'); assert.equal(rv.json.cap, 12);
    assert.deepEqual(rv.json.exclude, ['dave'], 'carl blocked dave');
    assert.equal((await h.call('bob', 'POST', '/chat/voice', { scope: 'rt_race1' })).status, 403);
    assert.equal((await h.call('ann', 'POST', '/chat/rt_race1', { text: 'gl all' })).status, 200);
    assert.equal((await h.call('bob', 'GET', '/chat/rt_race1')).status, 403);
  } finally { h.close(); }
});

test('router: party leader launches whole party into a realtime room; open-world voice caps at 32', async () => {
  const h = await harness({ voice: true, rtUrls: ['wss://rt-1.plajah.test'] });
  try {
    const p = (await h.call('ann', 'POST', '/party', { game: 'apex-race' })).json.party;
    await h.call('bob', 'POST', '/party/join', { code: p.code });
    await h.call('carl', 'POST', '/party/join', { code: p.code });

    // Whole-party realtime launch seats all three members into one gamerRtMatches room with circuit meta.
    const launched = await h.call('ann', 'POST', '/party/play', { game: 'apex-race', meta: { circuitId: 'harbor_district_circuit' } });
    assert.equal(launched.status, 200);
    assert.equal(launched.json.rt, true);
    assert.equal(launched.json.code.length, 6);
    assert.equal(launched.json.party.match.rt, true);
    assert.deepEqual(launched.json.party.match.seats, ['ann', 'bob', 'carl']);
    const rtDoc = await h.store.get('gamerRtMatches', launched.json.matchId);
    assert.ok(rtDoc);
    assert.deepEqual(rtDoc.players, ['ann', 'bob', 'carl']);
    assert.deepEqual(rtDoc.meta, { circuitId: 'harbor_district_circuit' });

    // Open-world shard voice room scales cap to 32 (matching apex-world maxPlayers).
    const world = await h.call('ann', 'POST', '/party/play', { game: 'apex-world' });
    assert.equal(world.status, 200);
    const wv = await h.call('ann', 'POST', '/chat/voice', { scope: `rt_${world.json.matchId}` });
    assert.equal(wv.status, 200);
    assert.equal(wv.json.cap, 32);

    // Party queue also accepts realtime games.
    const pq = await h.call('ann', 'POST', '/party/queue', { game: 'apex-race' });
    assert.equal(pq.status, 200);
    assert.equal(pq.json.party.queue.game, 'apex-race');
  } finally { h.close(); }
});
