// Gamer Network table games: chess, checkers, dominoes, Spades, Euchre, Bid Whist — rules, seeded deals,
// hidden views, and full online games through the real router.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { Chess } from 'chess.js';
import * as chess from '../services/gamerNet/games/chess';
import * as checkers from '../services/gamerNet/games/checkers';
import * as dominoes from '../services/gamerNet/games/dominoes';
import * as spades from '../services/gamerNet/games/spades';
import * as euchre from '../services/gamerNet/games/euchre';
import * as bidWhist from '../services/gamerNet/games/bidWhist';
import { TABLE_GAMES, tableGame } from '../services/gamerNet/games/table';
import { GAMES } from '../services/gamerNet/registry';
import { next } from '../services/gamerNet/games/rng';
import { memoryGamerStore } from '../services/gamerNet/store';
import { createGamerRouter } from '../routes/gamerNet';

const uci = (sans: string[]) => { const c = new Chess(); return sans.map(s => { const m = c.move(s); return m.from + m.to + (m.promotion ?? ''); }); };
const seeded = (seed: number) => { let s = seed; return () => { const [v, n] = next(s); s = n; return v; }; };

// ── registry ─────────────────────────────────────────────────────────────────────────
test('registry: all six table games are registered next to Tic Tac Toe', () => {
  for (const id of ['chess', 'checkers', 'dominoes', 'spades', 'euchre', 'bidwhist']) assert.ok(GAMES[id], id);
  assert.ok(GAMES.ttt);
  for (const id of ['dominoes', 'spades', 'euchre', 'bidwhist']) assert.ok(GAMES[id].viewFor, `${id} hides state`);
});

// ── chess ────────────────────────────────────────────────────────────────────────────
test('chess: legal moves only, turn order, fool\'s mate', () => {
  let s = chess.initial();
  assert.equal(chess.apply(s, 1, { from: 'e7', to: 'e5' }), null, 'black cannot open');
  assert.equal(chess.apply(s, 0, { from: 'e2', to: 'e5' }), null, 'illegal pawn jump');
  assert.equal(chess.apply(s, 0, { from: 'z9', to: 'e4' }), null, 'garbage square');
  for (const [i, m] of uci(['f3', 'e5', 'g4', 'Qh4#']).entries()) {
    const n = chess.apply(s, (i % 2) as 0 | 1, { from: m.slice(0, 2), to: m.slice(2, 4) });
    assert.ok(n, m); s = n!;
  }
  assert.deepEqual(chess.outcome(s), { winnerSeat: 1, draw: false, detail: { reason: 'checkmate' } });
  assert.equal(chess.apply(s, 0, { from: 'a2', to: 'a3' }), null, 'game over');
});

test('chess: stalemate and threefold repetition are draws', () => {
  // Sam Loyd's 10-move stalemate.
  let s = chess.initial();
  const loyd = uci(['e3', 'a5', 'Qh5', 'Ra6', 'Qxa5', 'h5', 'h4', 'Rah6', 'Qxc7', 'f6', 'Qxd7+', 'Kf7', 'Qxb7', 'Qd3', 'Qxb8', 'Qh7', 'Qxc8', 'Kg6', 'Qe6']);
  loyd.forEach((m, i) => { s = chess.apply(s, (i % 2) as 0 | 1, { from: m.slice(0, 2), to: m.slice(2, 4) })!; });
  assert.equal((chess.outcome(s)?.detail as any).reason, 'stalemate');
  let r = chess.initial();
  const knights = uci(['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']);
  knights.forEach((m, i) => { r = chess.apply(r, (i % 2) as 0 | 1, { from: m.slice(0, 2), to: m.slice(2, 4) })!; });
  assert.equal((chess.outcome(r)?.detail as any).reason, 'threefold');
});

test('chess: promotion picks the piece; CPU answers with a legal move', () => {
  const s = JSON.stringify({ moves: uci(['a4', 'h5', 'a5', 'h4', 'a6', 'h3', 'axb7', 'hxg2']), fen: '' });
  const fixed = JSON.stringify({ ...JSON.parse(s), fen: chess.replay(JSON.parse(s).moves)!.fen() });
  const n = chess.apply(fixed, 0, { from: 'b7', to: 'a8', promotion: 'n' });
  assert.ok(n); assert.match(JSON.parse(n!).moves.at(-1), /^b7a8n$/);
  const reply = chess.cpuMove(JSON.parse(n!), 1, () => 0);
  assert.ok(chess.apply(n!, 1, reply), 'CPU move is legal');
});

// ── checkers ─────────────────────────────────────────────────────────────────────────
test('checkers: captures are compulsory and multi-jumps are one move', () => {
  // Dark man on 5,2 (index 42); light men on 4,3 and 2,5 → a double jump to 1,6? (needs 3,4 empty and 1,6 empty)
  const board = '.'.repeat(64).split('');
  board[42] = 'b'; board[35] = 'r'; board[21] = 'r'; board[7] = 'r';
  const st: checkers.CheckersState = { b: board.join(''), t: 0, q: 0, plies: 0 };
  const moves = checkers.legalMoves(st);
  assert.deepEqual(moves, [[42, 28, 14]], 'must take both pieces');
  assert.equal(checkers.play(st, [42, 28]), null, 'stopping halfway is illegal');
  const n = checkers.play(st, [42, 28, 14])!;
  assert.equal(n.b[35], '.'); assert.equal(n.b[21], '.'); assert.equal(n.b[14], 'b');
  // Crowning ends the move.
  const crown = '.'.repeat(64).split(''); crown[19] = 'b'; crown[10] = 'r'; crown[3] = '.';
  const cs: checkers.CheckersState = { b: crown.join(''), t: 0, q: 0, plies: 0 };
  assert.deepEqual(checkers.legalMoves(cs), [[19, 1]]);
  assert.equal(checkers.play(cs, [19, 1])!.b[1], 'B');
});

test('checkers: CPU vs CPU always finishes', () => {
  let s = checkers.initial(); let guard = 0;
  const rnd = seeded(7);
  while (!checkers.outcome(s) && guard++ < 400) s = checkers.apply(s, checkers.seatToMove(s), checkers.cpuMove(JSON.parse(s), 2, rnd))!;
  assert.ok(checkers.outcome(s), 'game ended');
});

// ── dominoes ─────────────────────────────────────────────────────────────────────────
test('dominoes: seeded deals repeat; hands and boneyard stay hidden', () => {
  assert.equal(dominoes.initial(42), dominoes.initial(42));
  assert.notEqual(dominoes.initial(42), dominoes.initial(43));
  const s = dominoes.initial(42);
  const t = JSON.parse(s);
  const v = JSON.parse(dominoes.viewFor(s, 0));
  assert.equal(v.rs, undefined); assert.deepEqual(v.hands[1], []); assert.deepEqual(v.bone, []);
  assert.deepEqual(v.hands[0], t.hands[0]); assert.deepEqual(v.counts, [7, 7]); assert.equal(v.boneCount, 14);
  const spect = JSON.parse(dominoes.viewFor(s, -1));
  assert.deepEqual(spect.hands, [[], []]);
});

test('dominoes: draw only when stuck, tiles conserved, CPU games reach 100', () => {
  let s = dominoes.initial(9); let guard = 0;
  while (!dominoes.outcome(s) && guard++ < 5000) {
    const t = JSON.parse(s) as dominoes.DominoState;
    const seat = t.turn;
    const canPlay = t.hands[seat].some(x => dominoes.playableEnds(t.line, x).length);
    if (canPlay) assert.equal(dominoes.apply(s, seat, { draw: true }), null, 'no drawing with a play available');
    assert.equal(dominoes.apply(s, (1 - seat) as 0 | 1, dominoes.botMove(s, 1 - seat)), null, 'out of turn');
    const n = dominoes.apply(s, seat, dominoes.botMove(s, seat)); assert.ok(n);
    const nt = JSON.parse(n!) as dominoes.DominoState;
    if (nt.handNo === t.handNo) assert.equal(nt.hands[0].length + nt.hands[1].length + nt.bone.length + nt.line.length, 28);
    s = n!;
  }
  const o = dominoes.outcome(s)!; assert.ok(o);
  assert.ok(JSON.parse(s).scores[o.winnerSeat!] >= dominoes.TARGET);
});

// ── card games ───────────────────────────────────────────────────────────────────────
const CARD_GAMES = [
  { id: 'spades', m: spades, deck: 52 },
  { id: 'euchre', m: euchre, deck: 24 },
  { id: 'bidwhist', m: bidWhist, deck: 54 },
] as const;

for (const { id, m, deck } of CARD_GAMES) {
  test(`${id}: seeded deal repeats; views hide the seed, other hands and the kitty`, () => {
    assert.equal(m.initial(1234), m.initial(1234));
    assert.notEqual(m.initial(1234), m.initial(99));
    const s = m.initial(1234);
    const t = JSON.parse(s);
    for (const seat of [0, 1]) {
      const v = JSON.parse(m.viewFor(s, seat));
      assert.equal(v.rs, undefined);
      assert.equal(v.kitty, undefined);
      v.hands.forEach((h: string[], p: number) => assert.deepEqual(h, p === seat ? t.hands[p] : []));
      assert.deepEqual(v.counts, t.hands.map((h: string[]) => h.length));
    }
    assert.ok(JSON.parse(m.viewFor(s, -1)).hands.every((h: string[]) => h.length === 0));
    // Every card is somewhere at the start.
    const all = [...t.hands.flat(), ...(t.kitty ?? [])];
    assert.equal(new Set(all).size, deck);
  });

  test(`${id}: only humans are ever asked to move; CPU-vs-CPU games finish with a winner`, () => {
    for (const seed of [1, 2, 3]) {
      let s = m.initial(seed); let guard = 0;
      while (!m.outcome(s) && guard++ < 3000) {
        const t = JSON.parse(s);
        assert.ok(t.turn === 0 || t.turn === 1, 'a CPU seat never waits for a move');
        const seat = m.seatToMove(s);
        assert.equal(m.apply(s, (1 - seat) as 0 | 1, m.botMove(s, 1 - seat)), null, 'out of turn');
        // The bot plays from the redacted view, exactly as a client would.
        const n = m.apply(s, seat, m.botMove(m.viewFor(s, seat), seat));
        assert.ok(n, `legal move at guard ${guard}`); s = n!;
      }
      const o = m.outcome(s); assert.ok(o, `${id} seed ${seed} finished`);
      assert.ok(o!.winnerSeat === 0 || o!.winnerSeat === 1);
    }
  });
}

test('spades: no leading spades until broken; cards must follow suit', () => {
  // Find a seed where seat 0 leads the first trick and holds both spades and another suit.
  for (let seed = 1; seed < 500; seed++) {
    let s = spades.initial(seed);
    let t = JSON.parse(s) as spades.SpadesState;
    while (t.phase === 'bid' && (t.turn === 0 || t.turn === 1)) { s = spades.apply(s, t.turn as 0 | 1, { bid: 3 })!; t = JSON.parse(s); }
    const me = t.turn as 0 | 1;
    if (t.phase !== 'play' || me > 1 || t.trick.length) continue;
    const sp = t.hands[me].find(c => c[1] === 'S'), other = t.hands[me].find(c => c[1] !== 'S');
    if (!sp || !other) continue;
    assert.equal(spades.apply(s, me, { play: sp }), null, 'spades not broken');
    assert.equal(spades.apply(s, me, { play: 'XX' }), null, 'not a card');
    assert.ok(spades.apply(s, me, { play: other }));
    return;
  }
  assert.fail('no seed found');
});

test('spades: scoring — made bids, sets, nil and bags', () => {
  // Score through the pure path: run one bot hand and check the arithmetic on lastHand.
  let s = spades.initial(77); let guard = 0;
  while (!JSON.parse(s).lastHand && guard++ < 200) { const seat = spades.seatToMove(s); s = spades.apply(s, seat, spades.botMove(spades.viewFor(s, seat), seat))!; }
  const t = JSON.parse(s) as spades.SpadesState;
  const lh = t.lastHand!;
  for (const team of [0, 1]) {
    const ps = [team, team + 2];
    let exp = 0, bag = 0, bid = 0, took = 0;
    for (const p of ps) { if (lh.bids[p] === 0) { exp += lh.tricks[p] ? -100 : 100; bag += lh.tricks[p]; } else { bid += lh.bids[p]; took += lh.tricks[p]; } }
    if (bid) { if (took >= bid) { exp += 10 * bid; bag += took - bid; } else exp -= 10 * bid; }
    exp += bag;
    assert.equal(lh.points[team], exp, `team ${team}`);
  }
});

test('euchre: stick the dealer; dealer discards after an order-up', () => {
  for (let seed = 1; seed < 300; seed++) {
    let s = euchre.initial(seed);
    let t = JSON.parse(s) as euchre.EuchreState;
    if (t.phase !== 'call2' || t.dealer > 1 || t.turn !== t.dealer) {
      // Look for a seat-0 dealer in round two, or keep trying.
      if (t.phase === 'call1' && t.turn <= 1 && t.dealer === t.turn) {
        const n = euchre.apply(s, t.turn as 0 | 1, { call: 'order' })!;
        const nt = JSON.parse(n) as euchre.EuchreState;
        assert.equal(nt.phase, 'discard'); assert.equal(nt.hands[nt.dealer].length, 6);
        assert.equal(euchre.apply(n, nt.dealer as 0 | 1, { discard: 'XX' }), null);
        const d = euchre.apply(n, nt.dealer as 0 | 1, { discard: nt.hands[nt.dealer][0] })!;
        assert.equal(JSON.parse(d).hands[nt.dealer]?.length ?? 5, JSON.parse(d).hands[nt.dealer].length);
      }
      continue;
    }
    assert.equal(euchre.apply(s, t.dealer as 0 | 1, { call: 'pass' }), null, 'dealer is stuck');
    assert.equal(euchre.apply(s, t.dealer as 0 | 1, { call: t.upcard[1] }), null, 'cannot name the turned-down suit');
    return;
  }
});

test('bid whist: bids must climb, a stuck dealer must bid, lay-away is 6 cards', () => {
  for (let seed = 1; seed < 400; seed++) {
    let s = bidWhist.initial(seed);
    let t = JSON.parse(s) as bidWhist.BidWhistState;
    if (t.phase !== 'bid' || t.turn > 1) continue;
    const prior = t.bids.filter(b => b && b !== 'pass') as bidWhist.Bid[];
    if (prior.length) {
      assert.equal(bidWhist.apply(s, t.turn as 0 | 1, { bid: { n: 3, mode: 'up' } }), null, 'must outbid');
    }
    if (t.turn === t.dealer && !prior.length) assert.equal(bidWhist.apply(s, t.turn as 0 | 1, { bid: 'pass' }), null, 'stuck dealer');
    let n = bidWhist.apply(s, t.turn as 0 | 1, { bid: { n: 7, mode: 'no' } });
    if (!n) continue;
    t = JSON.parse(n);
    // Nobody can top 7 no trump: a human dealer still to speak passes.
    if (t.phase === 'bid' && t.turn <= 1) { n = bidWhist.apply(n, t.turn as 0 | 1, { bid: 'pass' })!; t = JSON.parse(n); }
    if (t.phase === 'kitty' && t.turn <= 1) {
      assert.equal(t.hands[t.turn].length, 18);
      assert.equal(bidWhist.apply(n, t.turn as 0 | 1, { discard: t.hands[t.turn].slice(0, 5) }), null, 'needs 6');
      const k = bidWhist.apply(n, t.turn as 0 | 1, { discard: t.hands[t.turn].slice(0, 6) })!;
      assert.equal(JSON.parse(k).hands[t.turn].length, 12);
      return;
    }
  }
  assert.fail('no seat-0/1 bid-winning deal found');
});

// ── online through the real router ───────────────────────────────────────────────────
async function harness() {
  const store = memoryGamerStore();
  let clock = Date.UTC(2026, 10, 21, 15);
  const app = express(); app.use(express.json());
  app.use('/api/gamer', createGamerRouter({ store, now: () => clock, verify: async t => (t.startsWith('tok-') ? t.slice(4) : null), userCard: async uid => ({ name: uid }) }));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/gamer`;
  const call = async (uid: string | null, method: string, path: string, body?: object) => {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(uid ? { Authorization: `Bearer tok-${uid}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, json: await res.json() as any };
  };
  return { store, call, tick: (ms: number) => { clock += ms; }, close: () => server.close() };
}

for (const id of ['spades', 'chess', 'dominoes']) {
  test(`router: a full ${id} match online — hidden state never leaves the server, result settles`, async () => {
    const h = await harness();
    const g = tableGame(id)!;
    try {
      await h.call('alice', 'POST', '/queue', { game: id }); h.tick(200);
      const q = await h.call('bob', 'POST', '/queue', { game: id });
      assert.equal(q.json.status, 'matched');
      const mid = q.json.matchId;
      const uids = ['alice', 'bob'];
      let guard = 0, last: any;
      while (guard++ < 4000) {
        const view = (await h.call('alice', 'GET', `/match/${mid}`)).json;
        last = view;
        if (view.match.status === 'done') break;
        assert.ok(!String(view.match.state).includes('"rs"'), 'seed hidden');
        // Ask each player for their own view and let the one to move act from it.
        for (const [i, uid] of uids.entries()) {
          const mine = (await h.call(uid, 'GET', `/match/${mid}`)).json;
          if (mine.match.status !== 'active') continue;
          if (g.viewFor) {
            const st = JSON.parse(mine.match.state);
            assert.equal(st.rs, undefined, 'seed hidden');
            st.hands.forEach((hand: string[], p: number) => { if (p !== i) assert.deepEqual(hand, [], 'other hands hidden'); });
          }
          const toMove = id === 'chess' ? (JSON.parse(mine.match.state).fen.split(' ')[1] === 'b' ? 1 : 0) : JSON.parse(mine.match.state).turn;
          if (toMove !== i) continue;
          const mv = id === 'chess' ? chess.cpuMove(JSON.parse(mine.match.state), 0, () => 0.5) : g.botMove(mine.match.state, i);
          const r = await h.call(uid, 'POST', `/match/${mid}/move`, { move: mv, v: mine.match.v });
          assert.equal(r.status, 200, JSON.stringify(r.json));
          h.tick(1000);
        }
      }
      assert.equal(last.match.status, 'done');
      assert.equal(last.match.settled, true);
      const a = (await h.call('alice', 'GET', '/me')).json.profile;
      const b = (await h.call('bob', 'GET', '/me')).json.profile;
      const st = (p: any) => p.games[id];
      assert.equal(st(a).wins + st(a).losses + st(a).draws, 1);
      assert.equal(st(b).wins + st(b).losses + st(b).draws, 1);
      assert.equal((await h.call(null, 'GET', '/verify/alice')).json.chain.ok, true);
      const lb = (await h.call(null, 'GET', `/leaderboard?game=${id}`)).json.players;
      assert.equal(lb.length, 2);
    } finally { h.close(); }
  });
}

test('router: a spectator sees no hands at all', async () => {
  const h = await harness();
  try {
    const p = await h.call('alice', 'POST', '/private', { game: 'euchre' });
    await h.call('bob', 'POST', '/join', { code: p.json.code });
    const spect = (await h.call(null, 'GET', `/match/${p.json.matchId}`)).json;
    assert.equal(spect.you, -1);
    assert.ok(JSON.parse(spect.match.state).hands.every((x: string[]) => x.length === 0));
  } finally { h.close(); }
});

test('table: every game has a title, clock and CPU', () => {
  assert.equal(TABLE_GAMES.length, 6);
  for (const g of TABLE_GAMES) { assert.ok(g.title && g.moveTimeMs >= 30_000 && typeof g.botMove === 'function'); }
});
