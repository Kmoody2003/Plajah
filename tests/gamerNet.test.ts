// Plajah Gamer Network: rules, ledger, score fold, matchmaking, and full online matches through the router.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import * as ttt from '../services/gamerNet/games/ticTacToe';
import { makeEntry, verifyChain, GENESIS, type GamerEntry } from '../services/gamerNet/ledger';
import { applyEvent, emptyFold, recalculate, scoreOf, PAIR_DAILY_CAP } from '../services/gamerNet/score';
import { nextRating } from '../services/gamerNet/rating';
import { pickOpponent, windowFor } from '../services/gamerNet/matchmaking';
import * as M from '../services/gamerNet/match';
import { memoryGamerStore } from '../services/gamerNet/store';
import { createGamerRouter } from '../routes/gamerNet';

// ── rules ───────────────────────────────────────────────────────────────────────────
test('ttt: turns, illegal moves, wins and draws', () => {
  let b = ttt.EMPTY;
  assert.equal(ttt.turnOf(b), 'X');
  assert.equal(ttt.play(b, 0, 'O'), null, 'O cannot open');
  b = ttt.play(b, 0, 'X')!; assert.equal(ttt.play(b, 0, 'O'), null, 'taken');
  for (const [i, m] of [[3, 'O'], [1, 'X'], [4, 'O'], [2, 'X']] as const) b = ttt.play(b, i, m)!;
  assert.deepEqual(ttt.outcome(b), { kind: 'win', mark: 'X', line: [0, 1, 2] });
  assert.equal(ttt.play(b, 8, 'O'), null, 'game over');
  assert.deepEqual(ttt.outcome('XOXXOOOXX'), { kind: 'draw' });
});

test('ttt: hard CPU never loses (exhaustive over every human line)', () => {
  const explore = (b: string, cpu: ttt.Mark): void => {
    const o = ttt.outcome(b);
    if (o) { assert.ok(!(o.kind === 'win' && o.mark !== cpu), `CPU lost on ${b}`); return; }
    const m = ttt.turnOf(b);
    if (m === cpu) explore(ttt.play(b, ttt.cpuMove(b, cpu, 'hard', () => 0), cpu)!, cpu);
    else for (const i of ttt.emptyCells(b)) explore(ttt.play(b, i, m)!, cpu);
  };
  explore(ttt.EMPTY, 'O');
  explore(ttt.EMPTY, 'X');
});

test('ttt: easy CPU still takes a win and blocks', () => {
  assert.equal(ttt.cpuMove('XX-OO----', 'X', 'easy', () => 0.99), 2);
  assert.equal(ttt.cpuMove('XX-O-----', 'O', 'easy', () => 0.99), 2);
});

// ── ledger + score ──────────────────────────────────────────────────────────────────
const chainOf = (bodies: Parameters<typeof makeEntry>[0][]): GamerEntry[] => {
  const out: GamerEntry[] = []; let prev = GENESIS;
  bodies.forEach((b, i) => { const e = makeEntry(b, i + 1, prev); out.push(e); prev = e.hash; });
  return out;
};
const DAY = Date.UTC(2026, 10, 9, 12);
const win = (i: number, opp = 'b', at = DAY) => ({ event: 'MATCH_RESULT' as const, uid: 'a', at: at + i, key: `match:${opp}${i}`, source: 'first-party' as const, game: 'ttt', opponentUid: opp, result: 'win' as const, rated: true, ratingBefore: 1200, ratingAfter: 1200 + 10 * (i + 1) });

test('ledger: chain verifies and detects tampering', () => {
  const chain = chainOf([win(0), win(1), win(2)]);
  assert.equal(verifyChain(chain).ok, true);
  const bad = chain.map(e => ({ ...e })); bad[1].result = 'loss' as any;
  assert.match(verifyChain(bad).problem!, /altered/);
  assert.match(verifyChain([chain[0], chain[2]]).problem!, /missing/);
});

test('score: replay equals incremental fold; LOCAL_PLAY and self-reports never score', () => {
  const bodies = [win(0), win(1),
    { event: 'LOCAL_PLAY' as const, uid: 'a', at: DAY, key: 'l1', source: 'self' as const, game: 'ttt', result: 'win' as const },
    { event: 'EXTERNAL_IMPORT' as const, uid: 'a', at: DAY, key: 'x1', source: 'self' as const, platform: 'steam', hours: 400, achievementsUnlocked: 50 },
    { event: 'EXTERNAL_IMPORT' as const, uid: 'a', at: DAY, key: 'x2', source: 'linked' as const, platform: 'xbox', hours: 100, achievementsUnlocked: 10 },
  ];
  const chain = chainOf(bodies);
  const inc = chain.reduce(applyEvent, emptyFold());
  assert.deepEqual(scoreOf(inc), scoreOf(recalculate([...chain].reverse())));
  const s = scoreOf(inc);
  assert.equal(s.play, 30, '2 wins × 15');
  assert.equal(s.external, Math.round(0.6 * (Math.sqrt(100) * 4 + 10 * 2)), 'self-reported Steam adds nothing');
  assert.equal(inc.localPlays, 1);
  assert.deepEqual(inc.platforms, ['steam', 'xbox']);
});

test('score: farming one opponent caps per UTC day', () => {
  const chain = chainOf(Array.from({ length: 9 }, (_, i) => win(i)));
  assert.equal(scoreOf(recalculate(chain)).play, PAIR_DAILY_CAP * 15);
  const nextDay = chainOf([...Array.from({ length: 9 }, (_, i) => win(i)), win(20, 'b', DAY + 86_400_000)]);
  assert.equal(scoreOf(recalculate(nextDay)).play, (PAIR_DAILY_CAP + 1) * 15);
});

test('rating: Elo moves toward the result, upsets move more', () => {
  assert.ok(nextRating(1200, 1200, 1, 0) > 1200);
  assert.ok(nextRating(1200, 1600, 1, 30) - 1200 > nextRating(1600, 1200, 1, 30) - 1600);
});

test('matchmaking: window widens, closest rating wins, stale tickets skipped', () => {
  assert.equal(windowFor(0), 100); assert.equal(windowFor(10_000), 200); assert.equal(windowFor(31_000), Infinity);
  const now = 100_000;
  const me = { uid: 'me', rating: 1200, joinedAt: now, seenAt: now };
  const others = [
    { uid: 'far', rating: 1500, joinedAt: now, seenAt: now },
    { uid: 'near', rating: 1260, joinedAt: now, seenAt: now },
    { uid: 'stale', rating: 1200, joinedAt: now - 60_000, seenAt: now - 60_000 },
  ];
  assert.equal(pickOpponent(me, others, now)?.uid, 'near');
  assert.equal(pickOpponent(me, [others[0]], now), null);
  assert.equal(pickOpponent({ ...me, joinedAt: now - 31_000 }, [others[0]], now)?.uid, 'far');
});

test('match: clock forfeits the player to move', () => {
  const doc = M.newMatch({ id: 'm', game: 'ttt', rated: true, now: 0, seat0: { uid: 'a', name: 'A', rating: 1200 }, seat1: { uid: 'b', name: 'B', rating: 1200 } })!;
  assert.equal(M.timeout(doc, 1000), null);
  const t = M.timeout(doc, doc.moveDeadline + 1)!;
  assert.ok(t.ok && t.doc.winnerSeat === 1 && t.doc.endReason === 'timeout');
});

// ── router end-to-end ───────────────────────────────────────────────────────────────
async function harness() {
  const store = memoryGamerStore();
  let clock = Date.UTC(2026, 10, 9, 15);
  const app = express(); app.use(express.json());
  app.use('/api/gamer', createGamerRouter({
    store, now: () => clock,
    verify: async t => (t.startsWith('tok-') ? t.slice(4) : null),
    userCard: async uid => ({ name: uid === 'kid' ? 'Real Kid Name' : `Gamer ${uid}`, isChild: uid === 'kid' }),
  }));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/gamer`;
  const call = async (uid: string | null, method: string, path: string, body?: object) => {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(uid ? { Authorization: `Bearer tok-${uid}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, json: await res.json() as any };
  };
  return { store, call, tick: (ms: number) => { clock += ms; }, close: () => server.close() };
}

test('router: quick match pairs two players, referees moves, settles once, ledger verifies', async () => {
  const h = await harness();
  try {
    assert.equal((await h.call(null, 'POST', '/queue', { game: 'ttt' })).status, 401);
    const q1 = await h.call('alice', 'POST', '/queue', { game: 'ttt' });
    assert.equal(q1.json.status, 'waiting');
    h.tick(500);
    const q2 = await h.call('bob', 'POST', '/queue', { game: 'ttt' });
    assert.equal(q2.json.status, 'matched');
    const poll = await h.call('alice', 'GET', '/queue?game=ttt');
    assert.equal(poll.json.matchId, q2.json.matchId);
    const id = q2.json.matchId;

    const m0 = await h.call('alice', 'GET', `/match/${id}`);
    assert.equal(m0.json.you, 0, 'alice waited longer → opens as X');
    assert.equal(m0.json.match.rated, true);

    const play = async (uid: string, cell: number) => h.call(uid, 'POST', `/match/${id}/move`, { move: cell });
    assert.equal((await play('bob', 4)).status, 409, 'not your turn');
    await play('alice', 0); await play('bob', 3); await play('alice', 1);
    assert.equal((await play('bob', 1)).status, 400, 'taken');
    await play('bob', 4);
    const end = await play('alice', 2);
    assert.equal(end.json.match.status, 'done');
    assert.equal(end.json.match.winnerSeat, 0);
    assert.equal(end.json.match.settled, true);

    // Polling the finished match again must not double-count.
    await h.call('bob', 'GET', `/match/${id}`);
    const a = (await h.call('alice', 'GET', '/me')).json.profile;
    const b = (await h.call('bob', 'GET', '/me')).json.profile;
    assert.equal(a.games.ttt.wins, 1); assert.equal(b.games.ttt.losses, 1);
    assert.ok(a.games.ttt.rating > 1200 && b.games.ttt.rating < 1200);
    assert.ok(a.achievements.includes('ttt.first-win'));
    assert.equal(a.ledger.length, 2, 'match + achievement');

    const v = (await h.call(null, 'GET', '/verify/alice')).json;
    assert.equal(v.chain.ok, true); assert.equal(v.scoreMatches, true); assert.equal(v.headMatchesProfile, true);

    const lb = (await h.call(null, 'GET', '/leaderboard?game=ttt')).json.players;
    assert.deepEqual(lb.map((p: any) => p.uid), ['alice', 'bob']);
    const hist = (await h.call(null, 'GET', '/history/alice')).json.entries;
    assert.equal(hist[0].event, 'ACHIEVEMENT');
  } finally { h.close(); }
});

test('router: invite code, timeout forfeit, rematch swaps seats', async () => {
  const h = await harness();
  try {
    const inv = (await h.call('alice', 'POST', '/private', { game: 'ttt' })).json;
    assert.match(inv.code, /^[A-Z0-9]{6}$/);
    assert.equal((await h.call('alice', 'POST', '/join', { code: inv.code })).status, 409, 'cannot join own match');
    const j = await h.call('bob', 'POST', '/join', { code: inv.code.toLowerCase() });
    assert.equal(j.json.matchId, inv.matchId);
    h.tick(46_000);
    const m = (await h.call('bob', 'GET', `/match/${inv.matchId}`)).json.match;
    assert.equal(m.endReason, 'timeout'); assert.equal(m.winnerSeat, 1, 'alice (X) let her clock run out');
    assert.equal(m.rated, false);
    const bobP = (await h.call('bob', 'GET', '/me')).json.profile;
    assert.equal(bobP.games.ttt.rating, 1200, 'friendly match leaves rating alone');

    await h.call('alice', 'POST', `/match/${inv.matchId}/rematch`);
    const r2 = (await h.call('bob', 'POST', `/match/${inv.matchId}/rematch`)).json.match;
    assert.ok(r2.nextMatchId);
    const next = (await h.call('bob', 'GET', `/match/${r2.nextMatchId}`)).json;
    assert.equal(next.you, 0, 'bob opens the rematch');
  } finally { h.close(); }
});

test('router: child accounts stay anonymous and off the leaderboard', async () => {
  const h = await harness();
  try {
    const me = (await h.call('kid', 'GET', '/me')).json;
    assert.equal(me.profile.name, 'Player'); assert.equal(me.public, false);
    await h.call('kid', 'POST', '/local', { game: 'ttt', result: 'win', vs: 'cpu', level: 'hard' });
    const p = (await h.call('kid', 'GET', '/me')).json.profile;
    assert.equal(p.localPlays, 1); assert.equal(p.score, 0, 'local play is history only');
    const lb = (await h.call(null, 'GET', '/leaderboard')).json.players;
    assert.equal(lb.some((x: any) => x.uid === 'kid'), false);
  } finally { h.close(); }
});
