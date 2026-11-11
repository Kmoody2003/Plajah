// Live party games (Sketch Rush): guess judging, hints, scoring, stroke validation, and a full game through the
// real router on an in-memory store with a fake clock — host, two viewers, a guest, the gamer ledger.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import * as C from '../services/liveGames/core';
import { PACKS, aliasesFor } from '../services/liveGames/words';
import { memoryGamerStore } from '../services/gamerNet/store';
import { createGamerRouter } from '../routes/gamerNet';
import { createLiveGameRouter } from '../routes/liveGames';
import { applyEvent, emptyFold, scoreOf, LIVE_DAILY_CAP } from '../services/gamerNet/score';
import { makeEntry, GENESIS } from '../services/gamerNet/ledger';

// ── judging ─────────────────────────────────────────────────────────────────────────
test('judge: exact, case, plural, spacing, sentence, aliases', () => {
  assert.equal(C.judgeGuess('Cat', 'cat'), 'correct');
  assert.equal(C.judgeGuess('cats', 'cat'), 'correct');
  assert.equal(C.judgeGuess('icecream', 'ice cream'), 'correct');
  assert.equal(C.judgeGuess('Ice-Cream!', 'ice cream'), 'correct');
  assert.equal(C.judgeGuess('is it a giraffe?', 'giraffe'), 'correct');
  assert.equal(C.judgeGuess('tv', 'television', aliasesFor('television')), 'correct');
  assert.equal(C.judgeGuess('café', 'cafe'), 'correct');
});
test('judge: near misses are close, others wrong, short words never close', () => {
  assert.equal(C.judgeGuess('girafe', 'giraffe'), 'close');
  assert.equal(C.judgeGuess('helicoptor', 'helicopter'), 'close');
  assert.equal(C.judgeGuess('dog', 'cat'), 'wrong');
  assert.equal(C.judgeGuess('cot', 'cat'), 'wrong', '3-letter words need the exact answer');
  assert.equal(C.judgeGuess('', 'cat'), 'wrong');
  assert.equal(C.judgeGuess('category', 'cat'), 'wrong', 'answer inside a longer word is not the answer');
});
test('public guess text: profanity, links and control chars never reach the feed', () => {
  assert.equal(C.publicGuessText('a big   house'), 'a big house');
  assert.equal(C.publicGuessText('sh1t'), null);
  assert.equal(C.publicGuessText('see www.spam.com'), null);
  assert.equal(C.publicGuessText('x'.repeat(100))?.length, C.GUESS_MAX_CHARS);
});

// ── hints + scoring ─────────────────────────────────────────────────────────────────
test('hints: none before half time, never the whole word, stable per word', () => {
  const w = 'lighthouse';
  assert.equal(C.revealedCount(w, 10_000, 75_000), 0);
  assert.ok(C.revealedCount(w, 74_000, 75_000) <= Math.floor(10 / 3));
  assert.equal(C.hintFor(w, 0), '__________');
  assert.equal(C.hintFor('ice cream', 0), '___ _____');
  assert.equal(C.hintFor(w, 2), C.hintFor(w, 2));
  assert.equal([...C.hintFor(w, 2)].filter(c => c !== '_').length, 2);
  assert.equal(C.revealedCount('ox', 74_000, 75_000), 0);
});
test('scoring: faster is more, podium bonus, drawer capped', () => {
  assert.equal(C.guessPoints(0, 75_000, 1), 600);
  assert.equal(C.guessPoints(75_000, 75_000, 9), 100);
  assert.ok(C.guessPoints(10_000, 75_000, 2) > C.guessPoints(10_000, 75_000, 4));
  assert.equal(C.drawerPoints(3), 180);
  assert.equal(C.drawerPoints(500), C.DRAWER_CAP);
  assert.equal(C.gamerPointsFor(5000, 1, 10), 50);
  assert.equal(C.gamerPointsFor(5000, 1, 3), 40, 'no winner bonus in a tiny room');
});
test('word packs: family-safe, no dupes, enough to choose from', () => {
  for (const p of PACKS) {
    assert.ok(p.words.length >= 30, p.id);
    assert.equal(new Set(p.words).size, p.words.length, `dupes in ${p.id}`);
    for (const w of p.words) assert.ok(!C.hasProfanity(w), w);
  }
  const c = C.pickChoices(PACKS[0].words, PACKS[0].words.slice(0, PACKS[0].words.length - 2));
  assert.equal(c.length, 3, 'falls back to the whole pool when almost everything was used');
});

// ── strokes ─────────────────────────────────────────────────────────────────────────
test('strokes: validation clamps and rejects junk; fold handles continue/undo/clear', () => {
  assert.deepEqual(C.cleanOps([{ t: 's', id: 1, c: '#111111', w: 9, p: [-5, 10, 2000, 800.4] }]), [{ t: 's', id: 1, c: '#111111', w: 9, p: [0, 10, 1000, 750] }]);
  assert.equal(C.cleanOps([{ t: 's', id: 1, c: 'red', w: 9, p: [1, 1] }]), null, 'colour must be from the palette');
  assert.equal(C.cleanOps([{ t: 's', id: 1, c: '#111111', w: 7, p: [1, 1] }]), null, 'width must be a preset');
  assert.equal(C.cleanOps([{ t: 's', id: 1, c: '#111111', w: 9, p: [1] }]), null);
  assert.equal(C.cleanOps([]), null);
  assert.equal(C.cleanOps([{ t: 's', id: 1, c: '#111111', w: 9, p: new Array(1400).fill(1) }]), null, 'too many points');
  const folded = C.foldStrokes([
    { seq: 2, ops: [{ t: 's', id: 1, c: '#111111', w: 9, p: [3, 3] }, { t: 's', id: 2, c: '#e53935', w: 4, p: [9, 9] }] },
    { seq: 1, ops: [{ t: 's', id: 1, c: '#111111', w: 9, p: [1, 1, 2, 2] }] },
    { seq: 3, ops: [{ t: 'u', id: 2 }] },
  ]);
  assert.deepEqual(folded, [{ id: 1, c: '#111111', w: 9, p: [1, 1, 2, 2, 3, 3] }]);
  assert.deepEqual(C.foldStrokes([{ seq: 1, ops: [{ t: 's', id: 1, c: '#111111', w: 9, p: [1, 1] }, { t: 'c' }] }]), []);
});

// ── gamer score ─────────────────────────────────────────────────────────────────────
test('gamer score: LIVE_GAME adds capped points, at most LIVE_DAILY_CAP games a day', () => {
  let f = emptyFold(); let prev = GENESIS;
  const at = Date.UTC(2026, 10, 10, 12);
  for (let i = 1; i <= LIVE_DAILY_CAP + 2; i++) {
    const e = makeEntry({ event: 'LIVE_GAME', uid: 'a', at: at + i, key: `live:g${i}`, source: 'first-party', game: 'sketch', points: 999, rank: 1, players: 9 }, i, prev);
    prev = e.hash; f = applyEvent(f, e);
  }
  assert.equal(scoreOf(f).live, 50 * LIVE_DAILY_CAP, 'per-entry cap 50, daily cap');
  assert.equal(f.livePlays, LIVE_DAILY_CAP + 2);
  const next = makeEntry({ event: 'LIVE_GAME', uid: 'a', at: at + 86_400_000, key: 'live:n', source: 'first-party', game: 'sketch', points: 20 }, 99, prev);
  assert.equal(scoreOf(applyEvent(f, next)).live, 50 * LIVE_DAILY_CAP + 20, 'new UTC day resets the cap');
  assert.equal(scoreOf(emptyFold()).live, undefined, 'old score cards unchanged');
});

// ── full game through the router ────────────────────────────────────────────────────
async function harness() {
  let clock = Date.UTC(2026, 10, 10, 20);
  const store = memoryGamerStore();
  const users: Record<string, { name: string; isChild?: boolean }> = { host: { name: 'Hana' }, amy: { name: 'Amy' }, ben: { name: 'Ben' }, kid: { name: 'Kid', isChild: true } };
  const gamerRouter = createGamerRouter({ store, verify: async t => t.slice(4), userCard: async uid => users[uid] ?? null, now: () => clock });
  const app = express();
  app.use(express.json());
  app.use('/api/live-game', createLiveGameRouter({
    store, now: () => clock, rand: () => 0,
    verify: async t => (t.startsWith('tok-') ? { uid: t.slice(4), guest: t.startsWith('tok-guest') } : null),
    userCard: async uid => users[uid] ?? null,
    appendEvent: gamerRouter.appendEvent,
  }));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/live-game`;
  const call = async (as: string | null, method: string, path: string, body?: object) => {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(as ? { Authorization: `Bearer tok-${as}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, json: await res.json() as any };
  };
  return { store, call, close: () => server.close(), advance: (ms: number) => { clock += ms; }, now: () => clock };
}

test('router: host opens, viewers guess, secret stays secret, points + ledger land once', async () => {
  const h = await harness();
  try {
    assert.equal((await h.call('guest-1', 'POST', '/', {})).status, 403, 'guests cannot host');
    assert.equal((await h.call('kid', 'POST', '/', {})).status, 403, 'children cannot host');
    const open = await h.call('host', 'POST', '/', { settings: { rounds: 2, roundMs: 60_000 } });
    assert.equal(open.status, 200);
    const gid = open.json.game.id as string;
    assert.equal((await h.call('amy', 'POST', `/${gid}/start`)).status, 403, 'only the host starts');
    assert.equal((await h.call('host', 'POST', `/${gid}/start`)).status, 200);

    // choosing: drawer sees three choices; a viewer sees none
    const hostView = await h.call('host', 'GET', `/${gid}`);
    assert.equal(hostView.json.game.status, 'choosing');
    assert.equal(hostView.json.secret.choices.length, 3);
    const amyView = await h.call('amy', 'GET', `/${gid}`);
    assert.equal(amyView.json.secret, undefined);
    assert.ok(!JSON.stringify(amyView.json).includes(hostView.json.secret.choices[0]), 'no choice leaks to viewers');

    const chose = await h.call('host', 'POST', `/${gid}/choose`, { i: 1 });
    const word = chose.json.secret.word as string;
    assert.equal(word, hostView.json.secret.choices[1]);
    const pub = await h.call('amy', 'GET', `/${gid}`);
    assert.equal(pub.json.game.status, 'drawing');
    assert.ok(!JSON.stringify(pub.json).includes(word), 'the live word never reaches a viewer');
    assert.equal(pub.json.game.hint.replace(/[^_]/g, '').length, word.replace(/[^a-z0-9]/gi, '').length);

    // strokes: only the drawer, only this round, dupes ignored
    const ops = [{ t: 's', id: 1, c: '#111111', w: 9, p: [10, 10, 50, 50] }];
    assert.equal((await h.call('amy', 'POST', `/${gid}/strokes`, { round: 1, seq: 1, ops })).status, 403);
    assert.equal((await h.call('host', 'POST', `/${gid}/strokes`, { round: 1, seq: 1, ops })).json.ok, true);
    assert.equal((await h.call('host', 'POST', `/${gid}/strokes`, { round: 1, seq: 1, ops })).json.dup, true);
    assert.equal((await h.call('host', 'POST', `/${gid}/strokes`, { round: 2, seq: 2, ops })).status, 409);

    // guesses
    h.advance(1000);
    assert.equal((await h.call('host', 'POST', `/${gid}/guess`, { text: word })).status, 403, 'drawer cannot guess');
    const wrong = await h.call('amy', 'POST', `/${gid}/guess`, { text: 'zzzz' });
    assert.equal(wrong.json.verdict, 'wrong');
    assert.equal((await h.call('amy', 'POST', `/${gid}/guess`, { text: word })).status, 429, 'rate limited');
    h.advance(1000);
    const right = await h.call('amy', 'POST', `/${gid}/guess`, { text: word.toUpperCase() });
    assert.equal(right.json.verdict, 'correct');
    assert.equal(right.json.points, C.guessPoints(2000, 60_000, 1));
    h.advance(1000);
    assert.equal((await h.call('amy', 'POST', `/${gid}/guess`, { text: word })).json.verdict, 'already', 'one solve per round');
    h.advance(4000);
    const guest = await h.call('guest-7', 'POST', `/${gid}/join`, { name: 'Zed' });
    assert.equal(guest.json.me.name, 'Zed');
    assert.equal((await h.call('guest-7', 'POST', `/${gid}/guess`, { text: word })).json.points, C.guessPoints(7000, 60_000, 2));

    // the feed never shows the answer while the round is live; the poll returns strokes for late joiners
    const poll = await h.call(null, 'GET', `/${gid}/poll?round=1`);
    assert.equal(poll.json.strokes.length, 1);
    const feedText = poll.json.feed.map((f: any) => f.text).join(' | ');
    assert.ok(feedText.includes('Amy got it'), feedText);
    assert.ok(!feedText.toLowerCase().includes(word), 'no spoilers in the feed');

    // time runs out → reveal, drawer paid for 2 solvers → next round (host draws again)
    h.advance(60_000);
    const rev = await h.call('host', 'POST', `/${gid}/tick`);
    assert.equal(rev.json.game.status, 'reveal');
    assert.equal(rev.json.game.revealWord, word);
    assert.equal(rev.json.game.top[0].name, 'Amy');
    const hostRow = rev.json.game.top.find((t: any) => t.uid === 'host');
    assert.equal(hostRow.score, C.drawerPoints(2));
    h.advance(6_000);
    const r2 = await h.call('host', 'POST', `/${gid}/tick`);
    assert.equal(r2.json.game.status, 'choosing');
    assert.equal(r2.json.game.round, 2);

    // nobody chooses → auto-pick; nobody guesses → reveal → game ends → ledger written once per player
    h.advance(12_000); await h.call('host', 'POST', `/${gid}/tick`);
    assert.equal((await h.call('amy', 'GET', `/${gid}`)).json.game.status, 'drawing');
    h.advance(60_000); await h.call('host', 'POST', `/${gid}/tick`);
    h.advance(6_000);
    const end = await h.call('host', 'POST', `/${gid}/tick`);
    assert.equal(end.json.game.status, 'ended');
    await h.call('host', 'POST', `/${gid}/end`);
    const ledger = Object.values(h.store.dump('gamerLedger')) as any[];
    const live = ledger.filter(e => e.event === 'LIVE_GAME');
    assert.deepEqual(live.map(e => e.uid).sort(), ['amy', 'guest-7', 'host'].sort());
    assert.equal(live.find(e => e.uid === 'amy').rank, 1);
    assert.equal((await h.call('ben', 'POST', `/${gid}/guess`, { text: 'x' })).json.verdict, 'closed');
  } finally { h.close(); }
});

test('router: host going quiet ends the game; /live lists only fresh games', async () => {
  const h = await harness();
  try {
    const gid = (await h.call('host', 'POST', '/', {})).json.game.id;
    await h.call('host', 'POST', `/${gid}/start`);
    assert.equal((await h.call(null, 'GET', '/live')).json.games.length, 1);
    h.advance(C.HOST_GONE_MS + 1000);
    assert.equal((await h.call(null, 'GET', '/live')).json.games.length, 0);
    assert.equal((await h.call('amy', 'GET', `/${gid}`)).json.game.status, 'ended');
  } finally { h.close(); }
});

test('router: skip during choosing reveals nothing and moves on', async () => {
  const h = await harness();
  try {
    const gid = (await h.call('host', 'POST', '/', { settings: { rounds: 3 } })).json.game.id;
    await h.call('host', 'POST', `/${gid}/start`);
    const sk = await h.call('host', 'POST', `/${gid}/skip`);
    assert.equal(sk.json.game.status, 'reveal');
    assert.equal(sk.json.game.revealWord, '(skipped)');
  } finally { h.close(); }
});
