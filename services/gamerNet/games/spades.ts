// Spades — partnership trick-taking, pure rules + CPU. Table and seats: see cards.ts.
//
// House rules (documented in docs/GAMER_NETWORK.md): 52 cards, 13 each, deal rotates. Everyone bids 0–13
// (0 = nil). Spades can't be led until broken (unless you hold only spades). A team that makes its combined
// bid scores 10 × bid + 1 per overtrick (bag); missing it costs 10 × bid. Nil: +100 if the bidder takes no
// tricks, −100 otherwise (their tricks count as bags, never toward the partner's bid). Every 10 bags: −100.
// First team to 500 wins (higher score if both cross; a tie plays on). A team at −200 or below loses.

import { deck52, deal, legalPlays, trickWinner, botPlay, nextPos, partnerOf, teamOf, isBotPos, rankIdx, suitOf, pushLog, redactTable, isCard, type TrickRules, type TrickTable } from './cards';
import { newSeed, parse } from './rng';

export const ID = 'spades';
export const TARGET = 500;
export const FLOOR = -200;

export interface SpadesState extends TrickTable {
  g: 'spades';
  phase: 'bid' | 'play';
  bids: (number | null)[];
  bags: [number, number];
  broken: boolean;
  lastHand: { points: [number, number]; tricks: number[]; bids: number[] } | null;
}

export const R: TrickRules = {
  trump: 'S',
  eff: c => suitOf(c),
  score: (c, led) => (suitOf(c) === 'S' ? 200 + rankIdx(c) : suitOf(c) === led ? 100 + rankIdx(c) : rankIdx(c) - 100),
  power: c => (suitOf(c) === 'S' ? 100 : 0) + rankIdx(c) + 1,
};

function newHand(t: SpadesState): SpadesState {
  const dealer = nextPos(t.dealer);
  const d = deal(deck52(), 13, t.rs, nextPos(dealer));
  return { ...t, rs: d.rs, dealer, handNo: t.handNo + 1, hands: d.hands, phase: 'bid', bids: [null, null, null, null], turn: nextPos(dealer), trick: [], won: [0, 0, 0, 0], broken: false };
}

export function initialState(seed = newSeed()): SpadesState {
  const t: SpadesState = {
    g: 'spades', rs: seed >>> 0, dealer: 3, handNo: 0, hands: [[], [], [], []], phase: 'bid', bids: [null, null, null, null], turn: 0,
    trick: [], won: [0, 0, 0, 0], last: null, lastWinner: -1, scores: [0, 0], bags: [0, 0], broken: false, lastHand: null, log: [], over: null,
  };
  return newHand(t);
}

function scoreHand(t: SpadesState): SpadesState {
  const scores: [number, number] = [...t.scores] as [number, number];
  const bags: [number, number] = [...t.bags] as [number, number];
  const points: [number, number] = [0, 0];
  for (const team of [0, 1] as const) {
    const ps = [team, team + 2];
    let bid = 0, took = 0, extraBags = 0;
    for (const p of ps) {
      const b = t.bids[p] ?? 0;
      if (b === 0) { points[team] += t.won[p] === 0 ? 100 : -100; extraBags += t.won[p]; }
      else { bid += b; took += t.won[p]; }
    }
    if (bid > 0) {
      if (took >= bid) { points[team] += 10 * bid; extraBags += took - bid; }
      else points[team] -= 10 * bid;
    }
    // Every bag (overtricks and a nil bidder's tricks) is worth 1 now and counts toward the 10-bag penalty.
    points[team] += extraBags;
    bags[team] += extraBags;
    while (bags[team] >= 10) { bags[team] -= 10; points[team] -= 100; }
    scores[team] += points[team];
  }
  let over: SpadesState['over'] = null;
  const [a, b] = scores;
  if (a <= FLOOR && b > FLOOR) over = { winner: 1 };
  else if (b <= FLOOR && a > FLOOR) over = { winner: 0 };
  else if ((a >= TARGET || b >= TARGET) && a !== b) over = { winner: a > b ? 0 : 1 };
  const done: SpadesState = { ...t, scores, bags, lastHand: { points, tricks: [...t.won], bids: t.bids.map(x => x ?? 0) }, over };
  pushLog(done, `Hand ${t.handNo} scored`);
  return over ? done : newHand(done);
}

function playCard(t: SpadesState, p: number, c: string): SpadesState | null {
  if (t.phase !== 'play' || t.turn !== p || !t.hands[p].includes(c)) return null;
  const legal = legalPlays(t.hands[p], t.trick, R, x => t.broken || suitOf(x) !== 'S');
  if (!legal.includes(c)) return null;
  const hands = t.hands.map((h, i) => (i === p ? h.filter(x => x !== c) : h));
  const trick = [...t.trick, { p, c }];
  let n: SpadesState = { ...t, hands, trick, broken: t.broken || suitOf(c) === 'S', turn: nextPos(p) };
  if (trick.length === 4) {
    const w = trickWinner(trick, R);
    const won = [...n.won]; won[w]++;
    n = { ...n, won, last: trick, lastWinner: w, trick: [], turn: w };
    if (n.hands.every(h => h.length === 0)) n = scoreHand(n);
  }
  return n;
}

function doBid(t: SpadesState, p: number, b: number): SpadesState | null {
  if (t.phase !== 'bid' || t.turn !== p || !Number.isInteger(b) || b < 0 || b > 13) return null;
  const bids = [...t.bids]; bids[p] = b;
  const n: SpadesState = { ...t, bids, turn: nextPos(p) };
  pushLog(n, `{${p}} bid ${b === 0 ? 'nil' : b}`);
  return bids.every(x => x !== null) ? { ...n, phase: 'play', turn: nextPos(t.dealer) } : n;
}

/** A CPU bid: sure tricks from aces, guarded kings and long spades. Never nil. */
export function botBid(hand: ReadonlyArray<string>): number {
  let n = 0;
  const bySuit = (s: string) => hand.filter(c => suitOf(c) === s);
  for (const s of ['H', 'D', 'C']) {
    const cs = bySuit(s);
    if (cs.some(c => c[0] === 'A')) n += 1;
    if (cs.some(c => c[0] === 'K') && cs.length >= 2 && cs.length <= 5) n += 0.8;
  }
  const sp = bySuit('S');
  for (const c of sp) if ('AKQ'.includes(c[0])) n += c[0] === 'Q' && sp.length < 3 ? 0.3 : 1;
  n += Math.max(0, sp.length - 3);
  return Math.max(1, Math.min(13, Math.round(n)));
}

/** The move a CPU would make at position `p` (used for the server partners and for local vs-CPU seats). */
export function botMoveFor(t: SpadesState, p: number): { bid: number } | { play: string } {
  if (t.phase === 'bid') return { bid: botBid(t.hands[p]) };
  return { play: botPlay(t.hands[p], t.trick, p, R, x => t.broken || suitOf(x) !== 'S') };
}

function step(t: SpadesState, p: number, move: any): SpadesState | null {
  if (move && typeof move === 'object' && 'bid' in move) return doBid(t, p, Number(move.bid));
  if (move && typeof move === 'object' && isCard(move.play)) return playCard(t, p, move.play);
  return null;
}

/** Play every CPU turn until a human (position 0 or 1) must act or the game ends. */
function runBots(t: SpadesState): SpadesState {
  let n = t, guard = 0;
  while (!n.over && isBotPos(n.turn) && guard++ < 400) n = step(n, n.turn, botMoveFor(n, n.turn)) ?? n;
  return n;
}

// ── GameRules adapter (string state) ──────────────────────────────────────────────
export const initial = (seed?: number) => JSON.stringify(runBots(initialState(seed)));
export const seatToMove = (s: string): 0 | 1 => ((parse<SpadesState>(s)?.turn ?? 0) % 2) as 0 | 1;
export function apply(s: string, seat: 0 | 1, move: unknown): string | null {
  const t = parse<SpadesState>(s); if (!t || t.over || t.turn !== seat) return null;
  const n = step(t, seat, move); return n ? JSON.stringify(runBots(n)) : null;
}
export const outcome = (s: string) => { const t = parse<SpadesState>(s); return t?.over ? { winnerSeat: t.over.winner, draw: false, detail: { scores: t.scores } } : null; };
export const viewFor = (s: string, seat: number) => { const t = parse<SpadesState>(s); return t ? JSON.stringify(redactTable(t, seat)) : s; };
export const botMove = (s: string, seat: number) => { const t = parse<SpadesState>(s)!; return botMoveFor(t, seat); };
export { teamOf, partnerOf };
