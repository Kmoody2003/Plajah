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

// ── linked platforms: Steam ─────────────────────────────────────────────────────────
// Steam is a fake: OpenID check_authentication + the three Web API calls, all through the injected fetch.
// No key, no network, no real account.

test('score: an external game scores on its running total, so sync frequency never changes the number', () => {
  const imp = (key: string, hours: number, ach = 0) => ({ event: 'EXTERNAL_IMPORT' as const, uid: 'a', at: DAY, key, source: 'linked' as const, platform: 'steam', externalGameId: '730', hours, achievementsUnlocked: ach });
  const daily = recalculate(chainOf(Array.from({ length: 30 }, (_, i) => imp(`d${i}`, 2, 1))));
  const once = recalculate(chainOf([imp('once', 60, 30)]));
  assert.ok(Math.abs(daily.external - once.external) < 1e-9, `${daily.external} vs ${once.external}`);
  assert.equal(Math.round(once.external * 1000), Math.round(0.6 * (Math.sqrt(60) * 4 + 30 * 2) * 1000));
  assert.equal(daily.externalHours, 60);
});

const STEAM_ID = '76561198000000001';
const OPENID = 'https://steamcommunity.com/openid/login';
interface FakeSteam { public: boolean; games: Array<{ appid: number; name: string; playtime_forever: number }>; ach: Record<number, number>; valid: boolean; calls: string[] }
const fakeSteam = (): FakeSteam => ({
  public: true, valid: true, calls: [],
  games: [
    { appid: 730, name: 'Counter-Strike 2', playtime_forever: 600 },   // 10 h, 12 achievements
    { appid: 570, name: 'Dota 2', playtime_forever: 90 },              // 1.5 h, no stats → null
    { appid: 440, name: 'Team Fortress 2', playtime_forever: 0 },      // owned, never played
  ],
  ach: { 730: 12 },
});
const steamFetch = (f: FakeSteam) => async (url: string, init?: { method?: string; body?: string }) => {
  f.calls.push(url.split('?')[0]);
  const reply = (status: number, body: unknown) => ({ ok: status < 300, status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)), json: async () => body });
  if (url === OPENID && init?.method === 'POST') {
    assert.match(init.body ?? '', /openid\.mode=check_authentication/);
    return reply(200, `ns:http://specs.openid.net/auth/2.0\nis_valid:${f.valid}\n`);
  }
  const q = new URL(url).searchParams;
  if (url.includes('/GetPlayerSummaries/')) return reply(200, { response: { players: [{ steamid: q.get('steamids'), personaname: 'neonfox', avatarfull: '', profileurl: 'https://steamcommunity.com/id/neonfox/', communityvisibilitystate: f.public ? 3 : 1 }] } });
  if (url.includes('/GetOwnedGames/')) return reply(200, { response: f.public ? { game_count: f.games.length, games: f.games } : {} });
  if (url.includes('/GetPlayerAchievements/')) {
    const n = f.ach[Number(q.get('appid'))];
    if (n === undefined) return reply(400, { playerstats: { error: 'Requested app has no stats', success: false } });
    return reply(200, { playerstats: { success: true, achievements: Array.from({ length: n + 3 }, (_, i) => ({ apiname: `a${i}`, achieved: i < n ? 1 : 0 })) } });
  }
  return reply(404, {});
};

async function steamHarness(opts: { key?: string; wrapStore?: (s: ReturnType<typeof memoryGamerStore>) => any } = {}) {
  const f = fakeSteam();
  const mem = memoryGamerStore();
  const store = opts.wrapStore ? opts.wrapStore(mem) : mem;
  let clock = Date.UTC(2026, 10, 9, 15);
  const app = express(); app.use(express.json());
  app.use('/api/gamer', createGamerRouter({
    store, now: () => clock,
    verify: async t => (t.startsWith('tok-') ? t.slice(4) : null),
    userCard: async uid => ({ name: `Gamer ${uid}` }),
    steam: { apiKey: opts.key ?? 'test-key', fetch: steamFetch(f) },
  }));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/gamer`;
  const call = async (uid: string | null, method: string, path: string, body?: object) => {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(uid ? { Authorization: `Bearer tok-${uid}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, json: await res.json() as any };
  };
  /** Start the link, then play Steam's redirect back with a (fake-)signed assertion. Returns where it sent us. */
  const link = async (uid: string, edit: (p: Record<string, string>) => void = () => {}) => {
    const start = await call(uid, 'POST', '/links/steam/start', { returnPath: '/games?view=hub' });
    assert.equal(start.status, 200, JSON.stringify(start.json));
    const login = new URL(start.json.url);
    assert.equal(login.origin + login.pathname, OPENID);
    const returnTo = login.searchParams.get('openid.return_to')!;
    const p: Record<string, string> = {
      'openid.ns': 'http://specs.openid.net/auth/2.0', 'openid.mode': 'id_res', 'openid.op_endpoint': OPENID,
      'openid.claimed_id': `https://steamcommunity.com/openid/id/${STEAM_ID}`, 'openid.identity': `https://steamcommunity.com/openid/id/${STEAM_ID}`,
      'openid.return_to': returnTo, 'openid.response_nonce': '2026-11-09T15:00:00Zabc', 'openid.assoc_handle': '1234567890',
      'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle', 'openid.sig': 'c2ln',
    };
    edit(p);
    const res = await fetch(`${returnTo}&${new URLSearchParams(p)}`, { redirect: 'manual' });
    const loc = res.headers.get('location') ?? '';
    return { status: res.status, loc, ok: /status=ok/.test(loc), reason: new URLSearchParams(loc.split('?')[1] ?? '').get('reason') ?? '', returnTo };
  };
  return { f, store: mem, call, link, tick: (ms: number) => { clock += ms; }, close: () => server.close() };
}

test('steam: OpenID link imports playtime + achievements onto the ledger and the score', async () => {
  const h = await steamHarness();
  try {
    const back = await h.link('alice');
    assert.equal(back.status, 302); assert.ok(back.ok, back.loc);
    assert.match(back.loc, /^\/games\?view=hub&gamerLink=steam&status=ok/);

    const links = (await h.call('alice', 'GET', '/links')).json;
    assert.equal(links.links.length, 1);
    const l = links.links[0];
    assert.deepEqual({ id: l.accountId, name: l.name, hours: l.hours, games: l.games, ach: l.achievements }, { id: STEAM_ID, name: 'neonfox', hours: 11.5, games: 2, ach: 12 });
    assert.equal(links.platforms.find((p: any) => p.id === 'steam').available, true);

    const hist = (await h.call(null, 'GET', '/history/alice')).json.entries;
    assert.equal(hist.length, 2, 'one entry per played game; the unplayed one is baselined only');
    const cs = hist.find((e: any) => e.externalGameId === '730');
    assert.deepEqual({ ev: cs.event, src: cs.source, pl: cs.platform, h: cs.hours, a: cs.achievementsUnlocked }, { ev: 'EXTERNAL_IMPORT', src: 'linked', pl: 'steam', h: 10, a: 12 });
    assert.equal(hist.find((e: any) => e.externalGameId === '570').hours, 1.5);

    const me = (await h.call('alice', 'GET', '/me')).json.profile;
    assert.equal(me.externalHours, 11.5);
    assert.deepEqual(me.platforms, ['steam']);
    assert.equal(me.scoreCard.external, Math.round(0.6 * (Math.sqrt(10) * 4 + 12 * 2 + Math.sqrt(1.5) * 4)));
    const v = (await h.call(null, 'GET', '/verify/alice')).json;
    assert.equal(v.chain.ok, true); assert.equal(v.scoreMatches, true);
  } finally { h.close(); }
});

test('steam: re-syncs import only the change — never the same playtime twice', async () => {
  const h = await steamHarness();
  try {
    await h.link('alice');
    const before = (await h.call('alice', 'GET', '/me')).json.profile;
    assert.equal((await h.call('alice', 'POST', '/links/steam/sync')).status, 429, 'cooldown after a finished sync');

    h.tick(11 * 60_000);
    const same = (await h.call('alice', 'POST', '/links/steam/sync')).json;
    assert.equal(same.imported, 0); assert.equal(same.more, false);
    assert.equal(h.f.calls.filter(c => c.includes('GetPlayerAchievements')).length, 2, 'unchanged games are not looked up again');
    assert.equal((await h.call('alice', 'GET', '/me')).json.profile.ledger.length, before.ledger.length);

    h.f.games[0].playtime_forever += 90; h.f.ach[730] = 14;       // +1.5 h, +2 achievements
    h.f.games[1].playtime_forever = 60;                          // Steam reports LESS (refund/reset): ignored
    h.tick(11 * 60_000);
    const step = (await h.call('alice', 'POST', '/links/steam/sync')).json;
    assert.deepEqual({ n: step.imported, h: step.hours, a: step.achievements }, { n: 1, h: 1.5, a: 2 });
    const top = (await h.call(null, 'GET', '/history/alice?limit=1')).json.entries[0];
    assert.deepEqual({ g: top.externalGameId, h: top.hours, a: top.achievementsUnlocked }, { g: '730', h: 1.5, a: 2 });

    const me = (await h.call('alice', 'GET', '/me')).json.profile;
    assert.equal(me.externalHours, 13);
    assert.equal(me.scoreCard.external, Math.round(0.6 * (Math.sqrt(11.5) * 4 + 14 * 2 + Math.sqrt(1.5) * 4)), 'same as importing 11.5 h in one go');
    assert.equal((await h.call(null, 'GET', '/verify/alice')).json.scoreMatches, true);
  } finally { h.close(); }
});

test('steam: an interrupted pass resumes with the same keys and imports nothing twice', async () => {
  let failRelease = false;
  const h = await steamHarness({
    wrapStore: mem => ({
      ...mem,
      cas: (c: string) => {
        const inner = mem.cas(c);
        if (c !== 'gamerLinks') return inner;
        return { get: inner.get, put: async (k: string, patch: Record<string, any>, v: string | null) => (failRelease && 'games' in patch ? 'error' : inner.put(k, patch, v)) };
      },
    }),
  });
  try {
    await h.link('alice');
    h.f.games[0].playtime_forever += 120;
    h.tick(11 * 60_000);
    failRelease = true;                                       // the pass writes its ledger entry, then dies saving the baseline
    await h.call('alice', 'POST', '/links/steam/sync');
    failRelease = false;
    const mid = (await h.call('alice', 'GET', '/me')).json.profile;
    assert.equal(mid.externalHours, 13.5);
    assert.equal((await h.call('alice', 'POST', '/links/steam/sync')).status, 409, 'lease still held');
    h.tick(3 * 60_000);
    const again = (await h.call('alice', 'POST', '/links/steam/sync')).json;
    assert.equal(again.imported, 0, 'same sync number + same totals → same key → dropped');
    const after = (await h.call('alice', 'GET', '/me')).json.profile;
    assert.equal(after.ledger.length, mid.ledger.length);
    assert.equal(after.externalHours, 13.5);
    assert.equal((await h.call('alice', 'GET', '/links')).json.links[0].hours, 13.5, 'baseline caught up');
  } finally { h.close(); }
});

test('steam: big libraries import in bounded passes', async () => {
  const h = await steamHarness();
  try {
    h.f.games = Array.from({ length: 95 }, (_, i) => ({ appid: 1000 + i, name: `Game ${i}`, playtime_forever: 60 * (i + 1) }));
    h.f.ach = {};
    await h.link('alice');
    let link = (await h.call('alice', 'GET', '/links')).json.links[0];
    assert.equal(link.pending, true); assert.equal(link.games, 40);
    const p2 = (await h.call('alice', 'POST', '/links/steam/sync')).json;   // no cooldown while pending
    assert.equal(p2.more, true);
    const p3 = (await h.call('alice', 'POST', '/links/steam/sync')).json;
    assert.equal(p3.more, false); assert.equal(p3.imported, 15);
    link = (await h.call('alice', 'GET', '/links')).json.links[0];
    assert.equal(link.pending, false); assert.equal(link.games, 95);
    const me = (await h.call('alice', 'GET', '/me')).json.profile;
    assert.equal(me.ledger.length, 95); assert.equal(me.externalHours, (95 * 96) / 2);
  } finally { h.close(); }
});

test('steam: forged, replayed, rejected or already-claimed sign-ins never link', async () => {
  const h = await steamHarness();
  try {
    assert.equal((await h.link('alice', p => { p['openid.op_endpoint'] = 'https://evil.example/openid'; })).reason, 'not signed by Steam');
    assert.equal((await h.link('alice', p => { p['openid.claimed_id'] = p['openid.identity'] = 'https://steamcommunity.com/openid/id/123'; })).reason, 'no SteamID in the response');
    assert.equal((await h.link('alice', p => { p['openid.signed'] = 'op_endpoint,claimed_id,identity'; })).reason, 'Steam did not sign return_to');
    assert.equal((await h.link('alice', p => { p['openid.return_to'] = 'https://evil.example/return'; })).reason, 'return address mismatch');
    assert.equal((await h.link('alice', p => { p['openid.mode'] = 'cancel'; })).reason, 'cancelled');
    h.f.valid = false;
    assert.equal((await h.link('alice')).reason, 'Steam rejected the sign-in');
    h.f.valid = true;
    assert.equal((await h.call('alice', 'GET', '/links')).json.links.length, 0);

    const ok = await h.link('alice');
    assert.ok(ok.ok);
    const replay = await fetch(`${ok.returnTo}&openid.mode=id_res`, { redirect: 'manual' });
    assert.match(replay.headers.get('location') ?? '', /reason=expired/, 'state is one-time');
    assert.equal((await h.link('bob')).reason, 'claimed', 'one Steam account feeds one ledger');

    assert.equal((await h.call('alice', 'DELETE', '/links/steam')).json.ok, true);
    assert.equal((await h.call('alice', 'GET', '/links')).json.links.length, 0);
    assert.equal((await h.call('alice', 'GET', '/me')).json.profile.externalHours, 11.5, 'history stays after unlink');
    assert.equal((await h.link('bob')).reason, 'claimed', 'unlinking does not free the account for another ledger');
    assert.ok((await h.link('alice')).ok);
    assert.equal((await h.call('alice', 'GET', '/me')).json.profile.externalHours, 11.5, 'relinking the same account keeps its baseline');
  } finally { h.close(); }
});

test('steam: private profiles explain themselves; no key means no linking', async () => {
  const h = await steamHarness();
  try {
    h.f.public = false;
    assert.ok((await h.link('alice')).ok, 'the link itself works');
    assert.match((await h.call('alice', 'GET', '/links')).json.links[0].error, /private/);
    h.tick(11 * 60_000);
    const s = await h.call('alice', 'POST', '/links/steam/sync');
    assert.equal(s.status, 422); assert.match(s.json.error, /Public/);
    assert.equal((await h.call('alice', 'GET', '/me')).json.profile.ledger.length, 0);
  } finally { h.close(); }
  const off = await steamHarness({ key: '' });
  try {
    assert.equal((await off.call('alice', 'POST', '/links/steam/start', {})).status, 503);
    assert.equal((await off.call('alice', 'GET', '/links')).json.platforms.find((p: any) => p.id === 'steam').available, false);
  } finally { off.close(); }
});
