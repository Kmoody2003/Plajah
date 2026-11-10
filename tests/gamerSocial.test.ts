// Games in the Social timeline: embed validation, lobby view, challenge state machine, share text, and the
// /api/gamer/social router end to end (feed matchmaking, challenge → refereed match, live links) on a memory store.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import * as S from '../services/gamerNet/social';
import * as M from '../services/gamerNet/match';
import { graphemeCount } from '../services/fediverse/blueskyVersion';
import { memoryGamerStore } from '../services/gamerNet/store';
import { createGamerRouter } from '../routes/gamerNet';
import { createGamerSocialRouter, type GamerNotice } from '../routes/gamerSocial';

// ── embed ───────────────────────────────────────────────────────────────────────────
test('embed: only registered games, known kinds and clean ids survive', () => {
  assert.deepEqual(S.sanitizeGameEmbed({ game: 'ttt', kind: 'play' }), { v: 1, game: 'ttt', kind: 'play' });
  assert.equal(S.sanitizeGameEmbed({ game: 'chess', kind: 'play' }), null, 'unknown game');
  assert.equal(S.sanitizeGameEmbed({ game: 'ttt', kind: 'hack' }), null, 'unknown kind');
  assert.equal(S.sanitizeGameEmbed(null), null);
  assert.equal(S.sanitizeGameEmbed({ game: 'ttt', kind: 'result' }), null, 'a result needs a match id');
  assert.equal(S.sanitizeGameEmbed({ game: 'ttt', kind: 'challenge' }), null, 'a challenge needs its id');
  const e = S.sanitizeGameEmbed({ game: 'ttt', kind: 'result', matchId: '../../etc', toName: 'x\u0000y', winner: 'me' })!;
  assert.equal(e, null, 'a bad match id kills a result embed');
  const ok = S.sanitizeGameEmbed({ game: 'ttt', kind: 'challenge', challengeId: 'abc-1', toUid: 'bob', toName: ' Bob\u0007 ', extra: 1 })!;
  assert.deepEqual(ok, { v: 1, game: 'ttt', kind: 'challenge', challengeId: 'abc-1', toUid: 'bob', toName: 'Bob' });
});

// ── lobby ───────────────────────────────────────────────────────────────────────────
const row = (uid: string, p: Partial<S.LobbyRow> = {}): S.LobbyRow => ({ uid, game: 'ttt', name: uid, rating: 1200, seenAt: 1000, seeking: false, status: 'here', ...p });

test('lobby: fresh people only, never me or blocked, seekers first, kids anonymous', () => {
  const now = 1000 + 5000;
  const v = S.lobbyView([
    row('me'), row('stale', { seenAt: now - S.LOBBY_STALE_MS - 1 }), row('left', { status: 'left' }), row('blocked'),
    row('ann', { seenAt: 2000 }), row('bob', { seenAt: 1500, seeking: true }), row('kid', { isChild: true, photo: 'p.jpg', seenAt: 3000 }), row('ann', { seenAt: 900 }),
  ], 'me', now, new Set(['blocked']));
  assert.equal(v.count, 3);
  assert.deepEqual(v.people.map(p => p.uid), ['bob', 'kid', 'ann']);
  assert.equal(v.people[1].name, 'Player'); assert.equal(v.people[1].photo, '');
  const many = S.lobbyView(Array.from({ length: 30 }, (_, i) => row(`u${i}`)), null, 1000);
  assert.equal(many.count, 30); assert.equal(many.people.length, S.LOBBY_SHOW);
});

// ── challenges ──────────────────────────────────────────────────────────────────────
const ch = (p: Partial<S.ChallengeDoc> = {}): S.ChallengeDoc => S.newChallenge({ id: 'c1', game: 'ttt', from: { uid: 'ann', name: 'Ann' }, to: { uid: 'bob', name: 'Bob' }, source: 'post', now: 0, ...p } as any)!;

test('challenge: limits on who and how many', () => {
  assert.equal(S.canChallenge('ann', 'ann', [], 0).ok, false, 'not yourself');
  assert.equal(S.canChallenge('ann', 'bob', [ch()], 1).ok, false, 'one pending per person');
  assert.equal(S.canChallenge('ann', 'bob', [ch()], S.CHALLENGE_TTL_MS + 1).ok, true, 'an expired one does not block');
  const five = Array.from({ length: S.MAX_PENDING_OUT }, (_, i) => ({ ...ch(), id: `c${i}`, to: `u${i}` }));
  const r = S.canChallenge('ann', 'zed', five, 1);
  assert.equal(r.ok, false); assert.equal((r as any).status, 429);
  const hour = Array.from({ length: S.MAX_PER_HOUR }, (_, i) => ({ ...ch(), id: `h${i}`, to: `u${i}`, status: 'declined' as const }));
  assert.equal(S.canChallenge('ann', 'zed', hour, 60_000).ok, false, 'hourly cap');
  assert.equal(S.canChallenge('ann', 'zed', hour, 3600_001).ok, true);
  assert.equal(S.newChallenge({ id: 'x', game: 'nope', from: { uid: 'a', name: 'A' }, to: { uid: 'b', name: 'B' }, source: 'post', now: 0 }), null);
});

test('challenge: only the right person can answer, once, before it expires', () => {
  const c = ch();
  assert.equal(S.respond(c, 'ann', 'accept', 1, 'm1').ok, false, 'challenger cannot accept their own');
  assert.equal(S.respond(c, 'bob', 'cancel', 1).ok, false, 'only the challenger cancels');
  assert.equal(S.respond(c, 'zed', 'decline', 1).ok, false);
  const acc = S.respond(c, 'bob', 'accept', 5, 'm1');
  assert.ok(acc.ok); assert.equal((acc as any).doc.status, 'accepted'); assert.equal((acc as any).doc.matchId, 'm1');
  assert.equal(S.respond((acc as any).doc, 'bob', 'accept', 6, 'm2').ok, false, 'no double accept');
  const late = S.respond(c, 'bob', 'accept', S.CHALLENGE_TTL_MS + 1, 'm1');
  assert.equal(late.ok, false); assert.equal((late as any).status, 410);
  assert.equal(S.effectiveStatus(c, S.CHALLENGE_TTL_MS + 1), 'expired');
  assert.equal((S.respond(c, 'ann', 'cancel', 1) as any).doc.status, 'cancelled');
  assert.deepEqual(S.challengeSeats(c), { seat0: 'bob', seat1: 'ann' }, 'the person who accepts opens');
});

// ── sharing ─────────────────────────────────────────────────────────────────────────
const doneMatch = (state: string, winnerSeat: number | null, endReason: M.EndReason = winnerSeat === null ? 'draw' : 'line'): M.MatchDoc => ({
  ...M.newMatch({ id: 'm1', game: 'ttt', rated: true, now: 0, seat0: { uid: 'ann', name: 'Ann', rating: 1200 }, seat1: { uid: 'bob', name: 'Bob', rating: 1200 } })!,
  state, status: 'done', winnerSeat, endReason, moves: 5,
});

test('share: headline from each side, emoji board, fits Bluesky', () => {
  const m = doneMatch('XXXOO----', 0);
  assert.equal(S.boardEmoji('XXXOO----'), '❌❌❌\n⭕⭕⬛\n⬛⬛⬛');
  assert.equal(S.boardEmoji('nope'), '');
  assert.match(S.matchShareText(m, 0), /^I beat Bob at Cyber Tic Tac Toe 🎮 · rated/);
  assert.match(S.matchShareText(m, 1), /^Ann got me at Cyber Tic Tac Toe/);
  assert.match(S.matchShareText(doneMatch('XOXXOOOXX', null), 0), /drew/);
  assert.match(S.matchShareText(doneMatch('X--------', 0, 'resign'), 0), /by resignation/);
  assert.equal(S.matchShareText({ ...m, status: 'active' }, 0), '', 'only finished matches');
  assert.ok(!S.matchShareText({ ...doneMatch('---------', 1, 'timeout'), moves: 0 }, 0).includes('⬛'), 'no empty board when nobody moved');
  assert.equal(S.matchShareText({ ...m, endReason: 'abandoned' }, 0), '');
  const long = doneMatch('XXXOO----', 0); long.cards = [{ uid: 'a', name: 'A'.repeat(60), rating: 1 }, { uid: 'b', name: 'B'.repeat(60), rating: 1 }];
  // the crosspost appends a ~60-char link; the post itself stays well inside 300
  assert.ok(graphemeCount(S.matchShareText(long, 0)) + 62 <= 300);
  assert.equal(S.liveTitle(m, 1), 'Cyber Tic Tac Toe: Bob vs Ann');
});

// ── router ──────────────────────────────────────────────────────────────────────────
async function harness() {
  const store = memoryGamerStore();
  let clock = 1_000_000;
  const notices: GamerNotice[] = [];
  const blocks = new Set<string>(['carl|dave']);
  const verify = async (t: string) => (t.startsWith('tok-') ? t.slice(4) : null);
  const userCard = async (uid: string) => ({ name: uid[0].toUpperCase() + uid.slice(1) });
  const app = express();
  app.use('/api/gamer/social', express.json(), createGamerSocialRouter({
    store, verify, userCard, now: () => clock,
    notify: async n => { notices.push(n); },
    blockedFor: async uid => new Set([...blocks].flatMap(p => { const [a, b] = p.split('|'); return a === uid ? [b] : b === uid ? [a] : []; })),
  }));
  app.use('/api/gamer', express.json(), createGamerRouter({ store, verify, userCard, now: () => clock }));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/gamer`;
  const call = async (uid: string | null, method: string, path: string, body?: object) => {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(uid ? { Authorization: `Bearer tok-${uid}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, json: await res.json().catch(() => ({})) as any };
  };
  return { call, notices, tick: (ms: number) => { clock += ms; }, close: () => server.close() };
}

test('router: timeline lobby shows who is here and pairs two seekers into a rated match', async () => {
  const h = await harness();
  try {
    assert.equal((await h.call(null, 'POST', '/social/lobby', { game: 'ttt' })).status, 401);
    await h.call('ann', 'POST', '/social/lobby', { game: 'ttt' });
    await h.call('carl', 'POST', '/social/lobby', { game: 'ttt' });
    const seen = await h.call('bob', 'POST', '/social/lobby', { game: 'ttt' });
    assert.equal(seen.json.count, 2, 'everyone here but me');
    assert.equal((await h.call(null, 'GET', '/social/lobby?game=ttt')).json.count, 3, 'signed-out readers see the count');
    assert.ok(!(await h.call('dave', 'GET', '/social/lobby?game=ttt')).json.people.some((p: any) => p.uid === 'carl'), 'blocked people stay hidden');

    const s1 = await h.call('ann', 'POST', '/social/lobby', { game: 'ttt', seeking: true });
    assert.equal(s1.json.status, 'seeking');
    h.tick(800);
    const s2 = await h.call('bob', 'POST', '/social/lobby', { game: 'ttt', seeking: true });
    assert.equal(s2.json.status, 'matched');
    const id = s2.json.matchId;
    const s3 = await h.call('ann', 'POST', '/social/lobby', { game: 'ttt', seeking: true });
    assert.equal(s3.json.matchId, id, 'the other seeker gets the same match on their next heartbeat');
    const again = await h.call('ann', 'POST', '/social/lobby', { game: 'ttt', seeking: false });
    assert.equal(again.json.status, 'here', 'handed over once, then back to presence');

    const m = await h.call('ann', 'GET', `/match/${id}`);
    assert.equal(m.json.you, 0, 'ann sought first → opens as X');
    assert.equal(m.json.match.rated, true);
    // played through the core referee
    for (const [u, c] of [['ann', 0], ['bob', 3], ['ann', 1], ['bob', 4], ['ann', 2]] as const) await h.call(u, 'POST', `/match/${id}/move`, { move: c });
    const end = await h.call('bob', 'GET', `/match/${id}`);
    assert.equal(end.json.match.winnerSeat, 0); assert.equal(end.json.match.settled, true);

    h.tick(60_000);
    assert.equal((await h.call('carl', 'GET', '/social/lobby?game=ttt')).json.count, 0, 'stale heartbeats fall out');
    assert.equal((await h.call('ann', 'DELETE', '/social/lobby?game=ttt')).json.status, 'left');
  } finally { h.close(); }
});

test('router: challenge → notification → accept starts a match the accepter opens', async () => {
  const h = await harness();
  try {
    assert.equal((await h.call('carl', 'POST', '/social/challenge', { game: 'ttt', to: 'dave' })).status, 403, 'blocked');
    assert.equal((await h.call('ann', 'POST', '/social/challenge', { game: 'ttt', to: 'ann' })).status, 400);
    const sent = await h.call('ann', 'POST', '/social/challenge', { game: 'ttt', to: 'bob', source: 'profile', postId: 'p1' });
    assert.equal(sent.status, 200);
    const cid = sent.json.challenge.id;
    assert.equal((await h.call('ann', 'POST', '/social/challenge', { game: 'ttt', to: 'bob' })).status, 409, 'no duplicates');
    assert.equal(h.notices.length, 1);
    assert.equal(h.notices[0].userId, 'bob'); assert.equal(h.notices[0].link, `game-challenge:${cid}`);

    const inbox = await h.call('bob', 'GET', '/social/challenges');
    assert.equal(inbox.json.incoming[0].id, cid);
    assert.equal((await h.call('zed', 'GET', `/social/challenge/${cid}`)).status, 404, 'strangers cannot read it');
    assert.equal((await h.call('ann', 'POST', `/social/challenge/${cid}/accept`)).status, 403);

    const acc = await h.call('bob', 'POST', `/social/challenge/${cid}/accept`);
    assert.equal(acc.status, 200);
    const mid = acc.json.matchId;
    assert.ok(mid);
    assert.equal(h.notices[1].userId, 'ann'); assert.equal(h.notices[1].link, `game-match:${mid}`);
    assert.equal((await h.call('bob', 'POST', `/social/challenge/${cid}/accept`)).status, 409, 'accept once');
    const out = await h.call('ann', 'GET', '/social/challenges');
    assert.equal(out.json.outgoing[0].matchId, mid, 'the challenger sees the match to jump into');

    const m = await h.call('bob', 'GET', `/match/${mid}`);
    assert.equal(m.json.you, 0, 'bob accepted → opens as X');
    assert.equal(m.json.match.rated, false, 'challenges are friendly');
    assert.ok(m.json.match.moveDeadline - 1_000_000 >= S.OPENING_GRACE_MS, 'first move has the opening grace');

    // live link: only players can attach one; anyone can read it
    assert.equal((await h.call('zed', 'POST', '/social/live', { matchId: mid, streamId: 's1' })).status, 403);
    assert.equal((await h.call('bob', 'POST', '/social/live', { matchId: mid, streamId: 's1' })).status, 200);
    assert.equal((await h.call(null, 'GET', `/social/live/${mid}`)).json.streamId, 's1');

    // decline + expiry
    const c2 = (await h.call('ann', 'POST', '/social/challenge', { game: 'ttt', to: 'carl' })).json.challenge.id;
    assert.equal((await h.call('carl', 'POST', `/social/challenge/${c2}/decline`)).json.challenge.status, 'declined');
    const c3 = (await h.call('ann', 'POST', '/social/challenge', { game: 'ttt', to: 'dave' })).json.challenge.id;
    h.tick(S.CHALLENGE_TTL_MS + 1);
    assert.equal((await h.call('dave', 'POST', `/social/challenge/${c3}/accept`)).status, 410);
    assert.equal((await h.call('ann', 'GET', `/social/challenge/${c3}`)).json.challenge.status, 'expired');
  } finally { h.close(); }
});
