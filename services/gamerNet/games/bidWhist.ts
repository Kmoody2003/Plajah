// Bid Whist — partnership trick-taking, pure rules + CPU. Table and seats: see cards.ts.
//
// House rules (a common Detroit table; documented in docs/GAMER_NETWORK.md): 54 cards with two jokers, 12 each,
// 6 in the kitty. Starting left of the dealer, each player bids once or passes: 3–7 books over six, uptown
// (high wins), downtown (low wins: A 2 3 … K) or no trump (uptown, worth double). No trump outranks a suit
// bid of the same number. If the first three pass, the dealer must bid. The winner takes the kitty, names trump
// (not for no trump) and lays away 6 cards, which count as the bidding team's first book, then leads.
// Jokers are the top trumps (big over little); in no trump they follow no suit, can't win a trick and may only be
// led when nothing else is left. Making the bid scores books − 6 (×2 in no trump); falling short loses the bid
// (×2 in no trump). Taking every book ("Boston") wins the game. First to 7 wins; −7 loses.

import { deck54, deal, legalPlays, trickWinner, botPlay, nextPos, teamOf, isBotPos, rankIdx, suitOf, isJoker, pushLog, redactTable, isCard, SUITS, type TrickRules, type TrickTable } from './cards';
import { newSeed, parse } from './rng';

export const ID = 'bidwhist';
export const TARGET = 7;

export type Mode = 'up' | 'down' | 'no';
export interface Bid { n: number; mode: Mode }

export interface BidWhistState extends TrickTable {
  g: 'bidwhist';
  phase: 'bid' | 'kitty' | 'play';
  kitty: string[];
  bids: (Bid | 'pass' | null)[];
  bidder: number;
  bid: Bid | null;
  trump: string | null;
  lastHand: { points: [number, number]; books: [number, number]; bidderTeam: 0 | 1; bid: Bid; trump: string | null } | null;
}

const bidValue = (b: Bid) => b.n * 2 + (b.mode === 'no' ? 1 : 0);
const isBid = (b: any): b is Bid => !!b && Number.isInteger(b.n) && b.n >= 3 && b.n <= 7 && ['up', 'down', 'no'].includes(b.mode);

export function rulesFor(mode: Mode, trump: string | null): TrickRules {
  const rs = (c: string) => { const i = rankIdx(c); return mode === 'down' ? (i === 12 ? 13 : 12 - i) : i + 1; };
  const T = mode === 'no' ? null : trump;
  const eff = (c: string) => (isJoker(c) ? (T ?? 'X') : suitOf(c));
  const jPow = (c: string) => (c === 'BJ' ? 300 : 299);
  return {
    trump: T, eff,
    score: (c, led) => (isJoker(c) ? (T ? jPow(c) : -1000) : T && suitOf(c) === T ? 200 + rs(c) : suitOf(c) === led ? 100 + rs(c) : rs(c) - 100),
    power: c => (isJoker(c) ? (T ? jPow(c) - 100 : 0) : (T && suitOf(c) === T ? 100 : 0) + rs(c)),
  };
}

function newHand(t: BidWhistState): BidWhistState {
  const dealer = nextPos(t.dealer);
  const d = deal(deck54(), 12, t.rs, nextPos(dealer));
  return { ...t, rs: d.rs, dealer, handNo: t.handNo + 1, hands: d.hands, kitty: d.rest, bids: [null, null, null, null], bidder: -1, bid: null, trump: null, phase: 'bid', turn: nextPos(dealer), trick: [], won: [0, 0, 0, 0] };
}

export function initialState(seed = newSeed()): BidWhistState {
  return newHand({
    g: 'bidwhist', rs: seed >>> 0, dealer: 3, handNo: 0, hands: [[], [], [], []], kitty: [], bids: [null, null, null, null], bidder: -1, bid: null, trump: null,
    phase: 'bid', turn: 0, trick: [], won: [0, 0, 0, 0], last: null, lastWinner: -1, scores: [0, 0], lastHand: null, log: [], over: null,
  });
}

const R = (t: BidWhistState) => rulesFor(t.bid?.mode ?? 'up', t.trump);

function scoreHand(t: BidWhistState): BidWhistState {
  const bt = teamOf(t.bidder);
  const books: [number, number] = [t.won[0] + t.won[2], t.won[1] + t.won[3]];
  books[bt] += 1; // the kitty laid away
  const mult = t.bid!.mode === 'no' ? 2 : 1;
  const points: [number, number] = [0, 0];
  if (books[bt] >= 6 + t.bid!.n) points[bt] = (books[bt] - 6) * mult; else points[bt] = -t.bid!.n * mult;
  const scores: [number, number] = [t.scores[0] + points[0], t.scores[1] + points[1]];
  let over: BidWhistState['over'] = null;
  if (books[bt] === 13) over = { winner: bt };
  else if (scores[0] >= TARGET || scores[1] <= -TARGET) over = { winner: 0 };
  else if (scores[1] >= TARGET || scores[0] <= -TARGET) over = { winner: 1 };
  const done: BidWhistState = { ...t, scores, over, lastHand: { points, books, bidderTeam: bt, bid: t.bid!, trump: t.trump } };
  pushLog(done, points[bt] > 0 ? `{${t.bidder}} made ${t.bid!.n} (${books[bt]} books)` : `{${t.bidder}} was set`);
  return over ? done : newHand(done);
}

function doBid(t: BidWhistState, p: number, b: Bid | 'pass'): BidWhistState | null {
  if (t.phase !== 'bid' || t.turn !== p) return null;
  const best = t.bids.reduce<Bid | null>((m, x) => (x && x !== 'pass' && (!m || bidValue(x) > bidValue(m)) ? x : m), null);
  if (b === 'pass') { if (p === t.dealer && !best) return null; }
  else if (!isBid(b) || (best && bidValue(b) <= bidValue(best))) return null;
  const bids = [...t.bids]; bids[p] = b === 'pass' ? 'pass' : { n: b.n, mode: b.mode };
  const n: BidWhistState = { ...t, bids, turn: nextPos(p) };
  pushLog(n, b === 'pass' ? `{${p}} passed` : `{${p}} bid ${b.n} ${b.mode === 'up' ? 'uptown' : b.mode === 'down' ? 'downtown' : 'no trump'}`);
  if (p !== t.dealer) return n;
  // The dealer has spoken: the highest bid takes the kitty.
  let bidder = -1, top: Bid | null = null;
  bids.forEach((x, i) => { if (x && x !== 'pass' && (!top || bidValue(x) > bidValue(top))) { top = x; bidder = i; } });
  const hands = n.hands.map((h, i) => (i === bidder ? [...h, ...n.kitty] : h));
  return { ...n, hands, kitty: [], bidder, bid: top, phase: 'kitty', turn: bidder };
}

function layAway(t: BidWhistState, p: number, trump: unknown, cards: unknown): BidWhistState | null {
  if (t.phase !== 'kitty' || t.turn !== p || p !== t.bidder || !Array.isArray(cards)) return null;
  const set = Array.from(new Set(cards as string[]));
  if (set.length !== 6 || !set.every(c => isCard(c) && t.hands[p].includes(c))) return null;
  let tr: string | null = null;
  if (t.bid!.mode !== 'no') { if (!(SUITS as readonly string[]).includes(String(trump))) return null; tr = String(trump); }
  const hands = t.hands.map((h, i) => (i === p ? h.filter(c => !set.includes(c)) : h));
  const n: BidWhistState = { ...t, hands, kitty: set, trump: tr, phase: 'play', turn: p };
  if (tr) pushLog(n, `{${p}} named ${tr} trump`);
  return n;
}

function playCard(t: BidWhistState, p: number, c: string): BidWhistState | null {
  if (t.phase !== 'play' || t.turn !== p || !t.hands[p].includes(c)) return null;
  if (!legalPlays(t.hands[p], t.trick, R(t)).includes(c)) return null;
  const hands = t.hands.map((h, i) => (i === p ? h.filter(x => x !== c) : h));
  const trick = [...t.trick, { p, c }];
  let n: BidWhistState = { ...t, hands, trick, turn: nextPos(p) };
  if (trick.length === 4) {
    const w = trickWinner(trick, R(t));
    const won = [...n.won]; won[w]++;
    n = { ...n, won, last: trick, lastWinner: w, trick: [], turn: w };
    if (n.hands.every(h => h.length === 0)) n = scoreHand(n);
  }
  return n;
}

/** Estimated books this hand takes on its own for a mode and suit. */
export function estimate(hand: ReadonlyArray<string>, mode: Mode, trump: string | null): number {
  const Rt = rulesFor(mode, trump);
  let b = 0;
  const bySuit: Record<string, string[]> = {};
  for (const c of hand) (bySuit[Rt.eff(c)] ??= []).push(c);
  for (const [s, cs] of Object.entries(bySuit)) {
    if (s === 'X') continue;
    const top = [...cs].sort((a, b2) => Rt.power(b2) - Rt.power(a));
    if (s === Rt.trump) { b += top.filter(c => Rt.power(c) >= 111 || isJoker(c)).length + Math.max(0, cs.length - 3); continue; }
    if (top[0] && Rt.power(top[0]) === 13) b += 1;
    if (top[1] && Rt.power(top[1]) === 12 && Rt.power(top[0]) === 13) b += 0.7;
  }
  return b;
}

export function bestContract(hand: ReadonlyArray<string>): { bid: Bid; trump: string | null; books: number } {
  let best = { bid: { n: 3, mode: 'up' as Mode }, trump: 'S' as string | null, books: -1 };
  for (const mode of ['up', 'down'] as const) for (const s of SUITS) {
    const e = estimate(hand, mode, s);
    if (e > best.books) best = { bid: { n: 3, mode }, trump: s, books: e };
  }
  const nt = estimate(hand, 'up', null);
  if (nt >= best.books + 1.5) best = { bid: { n: 3, mode: 'no' }, trump: null, books: nt };
  return best;
}

export function botMoveFor(t: BidWhistState, p: number): { bid: Bid | 'pass' } | { trump: string | null; discard: string[] } | { play: string } {
  if (t.phase === 'bid') {
    const best = t.bids.reduce<Bid | null>((m, x) => (x && x !== 'pass' && (!m || bidValue(x) > bidValue(m)) ? x : m), null);
    const c = bestContract(t.hands[p]);
    // Partner's expected share plus the kitty book.
    const n = Math.min(7, Math.floor(c.books + 2.5 + 1) - 6);
    const mine: Bid = { n: Math.max(3, n), mode: c.bid.mode };
    if (n >= 3 && (!best || bidValue(mine) > bidValue(best))) return { bid: mine };
    if (p === t.dealer && !best) return { bid: { n: 3, mode: c.bid.mode } };
    return { bid: 'pass' };
  }
  if (t.phase === 'kitty') {
    const mode = t.bid!.mode;
    let trump: string | null = null;
    if (mode !== 'no') {
      trump = SUITS.map(s => ({ s, e: estimate(t.hands[p], mode, s) })).sort((a, b) => b.e - a.e)[0].s;
    }
    const Rt = rulesFor(mode, trump);
    const keep = (c: string) => (Rt.trump && Rt.eff(c) === Rt.trump ? 1000 : 0) + Rt.power(c);
    const discard = [...t.hands[p]].sort((a, b) => keep(a) - keep(b)).slice(0, 6);
    return { trump, discard };
  }
  return { play: botPlay(t.hands[p], t.trick, p, R(t)) };
}

function step(t: BidWhistState, p: number, move: any): BidWhistState | null {
  if (!move || typeof move !== 'object') return null;
  if ('bid' in move) return doBid(t, p, move.bid === 'pass' ? 'pass' : move.bid);
  if ('discard' in move) return layAway(t, p, move.trump, move.discard);
  if (isCard(move.play)) return playCard(t, p, move.play);
  return null;
}

function runBots(t: BidWhistState): BidWhistState {
  let n = t, guard = 0;
  while (!n.over && isBotPos(n.turn) && guard++ < 400) n = step(n, n.turn, botMoveFor(n, n.turn)) ?? n;
  return n;
}

export const initial = (seed?: number) => JSON.stringify(runBots(initialState(seed)));
export const seatToMove = (s: string): 0 | 1 => ((parse<BidWhistState>(s)?.turn ?? 0) % 2) as 0 | 1;
export function apply(s: string, seat: 0 | 1, move: unknown): string | null {
  const t = parse<BidWhistState>(s); if (!t || t.over || t.turn !== seat) return null;
  const n = step(t, seat, move); return n ? JSON.stringify(runBots(n)) : null;
}
export const outcome = (s: string) => { const t = parse<BidWhistState>(s); return t?.over ? { winnerSeat: t.over.winner, draw: false, detail: { scores: t.scores } } : null; };
/** The kitty is never shown (before the bid it's face down; after, it's the bidder's lay-away). */
export const viewFor = (s: string, seat: number) => { const t = parse<BidWhistState>(s); return t ? JSON.stringify(redactTable(t, seat, ['kitty'])) : s; };
export const botMove = (s: string, seat: number) => botMoveFor(parse<BidWhistState>(s)!, seat);
