// Brain Rush, Crowd Says and Impostor Night: pure rules plus full games through the real router on an
// in-memory store with a fake clock. Also checks the Sketch Rush referee leaves these games alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import * as P from '../services/liveGames/party';
import { TRIVIA_PACKS, CROWD_PACKS } from '../services/liveGames/partyContent';
import { hasProfanity } from '../services/liveGames/core';
import { memoryGamerStore } from '../services/gamerNet/store';
import { createGamerRouter } from '../routes/gamerNet';
import { createLiveGameRouter } from '../routes/liveGames';
import { createLivePartyRouter } from '../routes/liveParty';

// ── rules ───────────────────────────────────────────────────────────────────────────
test('content: every trivia answer is in range, options unique, nothing rude', () => {
  for (const p of TRIVIA_PACKS) {
    assert.ok(p.questions.length >= 10, p.id);
    for (const q of p.questions) {
      assert.ok(q.answer >= 0 && q.answer < 4, q.q);
      assert.equal(new Set(q.options).size, 4, q.q);
      assert.ok(!hasProfanity(q.q + ' ' + q.options.join(' ')), q.q);
    }
  }
  for (const p of CROWD_PACKS) { assert.ok(p.prompts.length >= 8); assert.equal(new Set(p.prompts).size, p.prompts.length, p.id); }
});
test('trivia points: right answers 100–500, faster is more', () => {
  assert.equal(P.triviaPoints(0, 12_000), 500);
  assert.equal(P.triviaPoints(12_000, 12_000), 100);
  assert.ok(P.triviaPoints(3_000, 12_000) > P.triviaPoints(6_000, 12_000));
});
test('crowd: answers group by meaning, board ranks them, points follow popularity', () => {
  assert.equal(P.crowdKey('Pizzas!'), P.crowdKey('a pizza'));
  assert.equal(P.crowdKey('Sandwiches'), P.crowdKey('sandwich'));
  assert.equal(P.crowdKey('glass'), 'glass');
  const board = P.crowdBoard(['Towel', 'towels', 'a towel', 'sunscreen', 'Sun screen', 'ball', 'sh1t']);
  assert.equal(board[0].count, 3);
  assert.equal(board[0].text, 'towel');
  assert.ok(!board.some(b => b.text.includes('sh')), 'profanity never reaches the board');
  assert.equal(P.crowdPoints('TOWELS', board), 500);
  assert.equal(P.crowdPoints('ball', board), 100 + Math.round(400 / 3));
  assert.equal(P.crowdPoints('umbrella', board), 0);
});
test('impostor: counts scale with the room, clues cannot give away the word, votes tally', () => {
  assert.equal(P.impostorCount(3), 1);
  assert.equal(P.impostorCount(14), 2);
  assert.equal(P.impostorCount(500), 4);
  assert.equal(P.cleanClue('Giraffes', 'giraffe').ok, false);
  assert.equal(P.cleanClue('long neck spots', 'giraffe').ok, false);
  assert.deepEqual(P.cleanClue('tall', 'giraffe'), { ok: true, text: 'tall' });
  const t = P.tallyImpostor([{ voter: 'a', target: 'x' }, { voter: 'b', target: 'x' }, { voter: 'x', target: 'a' }, { voter: 'c', target: 'c' }], ['x']);
  assert.equal(t.caught, true);
  assert.equal(t.counts.get('c'), undefined, 'self votes do not count');
  assert.equal(P.tallyImpostor([{ voter: 'a', target: 'b' }, { voter: 'b', target: 'x' }], ['x']).caught, false, 'a tie with a crew member lets the impostor escape');
});
test('phase clock: impostor goes answer→vote, others answer→reveal; rounds end the game', () => {
  const g = { kind: 'impostor' as P.PartyKind, status: 'answer' as P.PartyStatus, round: 1, phaseEndsAt: 10, hostSeenAt: 0, settings: P.clampPartySettings('impostor', {}) };
  assert.deepEqual(P.partyTick(g, 11), { kind: 'toVote' });
  assert.deepEqual(P.partyTick({ ...g, kind: 'trivia' }, 11), { kind: 'close' });
  assert.deepEqual(P.partyTick({ ...g, status: 'reveal', round: g.settings.rounds }, 11), { kind: 'endGame', reason: 'done' });
  assert.deepEqual(P.partyTick({ ...g, hostSeenAt: -200_000 }, 11), { kind: 'endGame', reason: 'host-gone' });
  assert.equal(P.clampPartySettings('trivia', { answerMs: 1 }).answerMs, 6_000);
});

// ── router ──────────────────────────────────────────────────────────────────────────
async function harness() {
  let clock = Date.UTC(2026, 10, 12, 20);
  const store = memoryGamerStore();
  const users: Record<string, { name: string; isChild?: boolean }> = { host: { name: 'Hana' }, amy: { name: 'Amy' }, ben: { name: 'Ben' }, cal: { name: 'Cal' }, kid: { name: 'Kid', isChild: true } };
  const gamer = createGamerRouter({ store, verify: async t => t.slice(4), userCard: async uid => users[uid] ?? null, now: () => clock });
  const deps = {
    store, now: () => clock, rand: () => 0,
    verify: async (t: string) => (t.startsWith('tok-') ? { uid: t.slice(4), guest: t.startsWith('tok-guest') } : null),
    userCard: async (uid: string) => users[uid] ?? null, appendEvent: gamer.appendEvent,
  };
  const app = express(); app.use(express.json());
  app.use('/api/live-party', createLivePartyRouter(deps));
  app.use('/api/live-game', createLiveGameRouter(deps));
  const server = app.listen(0);
  const root = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const req = async (base: string, as: string | null, method: string, path: string, body?: object) => {
    const res = await fetch(`${root}/${base}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(as ? { Authorization: `Bearer tok-${as}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, json: await res.json() as any };
  };
  return {
    store, call: (as: string | null, m: string, p: string, b?: object) => req('live-party', as, m, p, b),
    sketch: (as: string | null, m: string, p: string, b?: object) => req('live-game', as, m, p, b),
    close: () => server.close(), advance: (ms: number) => { clock += ms; },
  };
}

test('Brain Rush: answer stays secret, fast right answers win, ledger lands', async () => {
  const h = await harness();
  try {
    assert.equal((await h.call('guest-1', 'POST', '/', { kind: 'trivia' })).status, 403);
    assert.equal((await h.call('kid', 'POST', '/', { kind: 'trivia' })).status, 403);
    assert.equal((await h.call('host', 'POST', '/', { kind: 'chess' })).status, 400);
    const gid = (await h.call('host', 'POST', '/', { kind: 'trivia', settings: { rounds: 1, answerMs: 10_000 } })).json.game.id;
    await h.call('host', 'POST', `/${gid}/start`);
    const view = await h.call('amy', 'GET', `/${gid}`);
    assert.equal(view.json.game.status, 'answer');
    assert.equal(view.json.game.options.length, 4);
    assert.equal(view.json.game.reveal, null, 'the right answer is not on the public doc');
    const q = TRIVIA_PACKS[0].questions.find(x => x.q === view.json.game.prompt)!;
    h.advance(1000);
    assert.equal((await h.call('amy', 'POST', `/${gid}/answer`, { choice: q.answer })).json.result, 'locked');
    assert.equal((await h.call('amy', 'POST', `/${gid}/answer`, { choice: (q.answer + 1) % 4 })).status, 429);
    h.advance(1000);
    assert.equal((await h.call('amy', 'POST', `/${gid}/answer`, { choice: (q.answer + 1) % 4 })).json.result, 'already', 'no changing your answer');
    h.advance(3000);
    await h.call('ben', 'POST', `/${gid}/answer`, { choice: q.answer });
    await h.call('guest-9', 'POST', `/${gid}/answer`, { choice: (q.answer + 1) % 4 });
    assert.equal((await h.call('amy', 'GET', `/${gid}`)).json.mine.choice, q.answer);
    h.advance(6000);
    const rev = (await h.call('host', 'POST', `/${gid}/tick`)).json.game;
    assert.equal(rev.status, 'reveal');
    assert.equal(rev.reveal.correct, q.answer);
    assert.equal(rev.reveal.counts[q.answer], 2);
    assert.equal(rev.top[0].name, 'Amy');
    assert.equal(rev.top[0].score, P.triviaPoints(1000, 10_000));
    assert.equal(rev.top[1].score, P.triviaPoints(5000, 10_000));
    h.advance(10_000);
    assert.equal((await h.call('host', 'POST', `/${gid}/tick`)).json.game.status, 'ended');
    const live = (Object.values(h.store.dump('gamerLedger')) as any[]).filter(e => e.event === 'LIVE_GAME');
    assert.deepEqual(live.map(e => e.uid).sort(), ['amy', 'ben']);
    assert.equal(live[0].game, 'trivia');
    assert.equal((await h.call('amy', 'POST', `/${gid}/answer`, { choice: 0 })).json.result, 'closed');
  } finally { h.close(); }
});

test('Crowd Says: the crowd builds the board and pays by popularity', async () => {
  const h = await harness();
  try {
    const gid = (await h.call('host', 'POST', '/', { kind: 'crowd', settings: { rounds: 1 } })).json.game.id;
    await h.call('host', 'POST', `/${gid}/start`);
    for (const [who, text] of [['amy', 'Pizza'], ['ben', 'pizzas'], ['cal', 'tacos'], ['host', 'a pizza']] as const) {
      assert.equal((await h.call(who, 'POST', `/${gid}/answer`, { text })).json.result, 'locked');
    }
    assert.equal((await h.call('guest-2', 'POST', `/${gid}/answer`, { text: 'sh1t' })).status, 400);
    assert.equal((await h.call('amy', 'GET', `/${gid}`)).json.game.answered, 4);
    await h.call('host', 'POST', `/${gid}/skip`);
    const g = (await h.call('amy', 'GET', `/${gid}`)).json.game;
    assert.equal(g.status, 'reveal');
    assert.equal(g.reveal.board[0].count, 3);
    assert.equal(g.top.find((t: any) => t.uid === 'cal').score, 100 + Math.round(400 / 3));
    assert.equal(g.top.find((t: any) => t.uid === 'amy').score, 500);
  } finally { h.close(); }
});

test('Impostor Night: roles stay private, clues then votes, caught impostor scores nothing', async () => {
  const h = await harness();
  try {
    const gid = (await h.call('host', 'POST', '/', { kind: 'impostor', settings: { rounds: 1 } })).json.game.id;
    for (const u of ['amy', 'ben', 'cal']) await h.call(u, 'POST', `/${gid}/join`);
    await h.call('host', 'POST', `/${gid}/start`);
    const views = Object.fromEntries(await Promise.all(['host', 'amy', 'ben', 'cal'].map(async u => [u, (await h.call(u, 'GET', `/${gid}`)).json] as const)));
    const impostors = Object.entries(views).filter(([, v]) => v.mine.role === 'impostor').map(([u]) => u);
    assert.equal(impostors.length, 1);
    const imp = impostors[0];
    const word = Object.values(views).find(v => v.mine.role === 'crew')!.mine.word as string;
    assert.ok(word);
    assert.equal(views[imp].mine.word, undefined, 'the impostor never gets the word');
    assert.ok(!JSON.stringify((await h.call(null, 'GET', `/${gid}`)).json).includes(`"${word}"`), 'outsiders never see the word');
    assert.equal((await h.call('amy', 'POST', `/${gid}/answer`, { text: word })).status, 400, 'clue cannot be the word');
    h.advance(1000);
    for (const u of ['host', 'amy', 'ben', 'cal']) assert.equal((await h.call(u, 'POST', `/${gid}/answer`, { text: `clue${u}` })).json.result, 'locked');
    await h.call('host', 'POST', `/${gid}/skip`);
    const vote = (await h.call('amy', 'GET', `/${gid}`)).json.game;
    assert.equal(vote.status, 'vote');
    assert.equal(vote.clues.length, 4);
    assert.equal(vote.reveal, null);
    const crew = ['host', 'amy', 'ben', 'cal'].filter(u => u !== imp);
    assert.equal((await h.call(crew[0], 'POST', `/${gid}/vote`, { target: crew[0] })).status, 400, 'no self votes');
    for (const u of crew) await h.call(u, 'POST', `/${gid}/vote`, { target: imp });
    await h.call(imp, 'POST', `/${gid}/vote`, { target: crew[0] });
    await h.call('host', 'POST', `/${gid}/skip`);
    const rev = (await h.call('amy', 'GET', `/${gid}`)).json.game;
    assert.equal(rev.status, 'reveal');
    assert.equal(rev.reveal.caught, true);
    assert.equal(rev.reveal.word, word);
    assert.equal(rev.top.find((t: any) => t.uid === crew[1]).score, P.IMPOSTOR_CLUE + P.IMPOSTOR_CREW_CATCH);
    assert.equal(rev.top.find((t: any) => t.uid === imp).score, P.IMPOSTOR_CLUE, 'caught impostor gets only the clue points');
  } finally { h.close(); }
});

test('shared room: Sketch Rush referee leaves party games alone; /live lists them', async () => {
  const h = await harness();
  try {
    const gid = (await h.call('host', 'POST', '/', { kind: 'trivia' })).json.game.id;
    await h.call('host', 'POST', `/${gid}/start`);
    h.advance(60_000);
    const viaSketch = await h.sketch(null, 'GET', `/${gid}/poll`);
    assert.equal(viaSketch.json.game.status, 'answer', 'sketch referee did not advance it');
    const live = (await h.sketch(null, 'GET', '/live')).json.games;
    assert.ok(live.some((g: any) => g.id === gid));
  } finally { h.close(); }
});
