// Euchre — partnership trick-taking, pure rules + CPU. Table and seats: see cards.ts.
//
// House rules: 24 cards (9–A), 5 each, one upcard. Round one: each player may order the dealer to pick up the
// upcard (its suit becomes trump; the dealer then discards one). Round two: name any other suit, and the
// dealer must name one if everyone passes ("stick the dealer"). The right bower (jack of trump) is highest, then
// the left bower (the other jack of the same colour, which counts as trump). Makers taking 3–4 tricks score 1,
// all 5 score 2; if they're euchred the defenders score 2. First team to 10 wins. No going alone in v1.

import { deck24, deal, legalPlays, trickWinner, botPlay, nextPos, teamOf, isBotPos, rankIdx, suitOf, sameColor, pushLog, redactTable, isCard, SUITS, type TrickRules, type TrickTable } from './cards';
import { newSeed, parse } from './rng';

export const ID = 'euchre';
export const TARGET = 10;

export interface EuchreState extends TrickTable {
  g: 'euchre';
  phase: 'call1' | 'call2' | 'discard' | 'play';
  kitty: string[];
  upcard: string;
  trump: string | null;
  maker: number;
  passes: number;
  lastHand: { points: [number, number]; tricks: [number, number]; makerTeam: 0 | 1; trump: string } | null;
}

export function rulesFor(trump: string | null): TrickRules {
  const left = trump ? 'J' + sameColor(trump) : '';
  const eff = (c: string) => (trump && c === left ? trump : suitOf(c));
  const tPow = (c: string) => (c === 'J' + trump ? 300 : c === left ? 299 : 200 + rankIdx(c));
  return {
    trump, eff,
    score: (c, led) => (trump && eff(c) === trump ? tPow(c) : eff(c) === led ? 100 + rankIdx(c) : rankIdx(c) - 100),
    power: c => (trump && eff(c) === trump ? tPow(c) - 100 : rankIdx(c) + 1),
  };
}

function newHand(t: EuchreState): EuchreState {
  const dealer = nextPos(t.dealer);
  const d = deal(deck24(), 5, t.rs, nextPos(dealer));
  return { ...t, rs: d.rs, dealer, handNo: t.handNo + 1, hands: d.hands, kitty: d.rest, upcard: d.rest[0], trump: null, maker: -1, passes: 0, phase: 'call1', turn: nextPos(dealer), trick: [], won: [0, 0, 0, 0] };
}

export function initialState(seed = newSeed()): EuchreState {
  return newHand({
    g: 'euchre', rs: seed >>> 0, dealer: 3, handNo: 0, hands: [[], [], [], []], kitty: [], upcard: '', trump: null, maker: -1, passes: 0,
    phase: 'call1', turn: 0, trick: [], won: [0, 0, 0, 0], last: null, lastWinner: -1, scores: [0, 0], lastHand: null, log: [], over: null,
  });
}

function scoreHand(t: EuchreState): EuchreState {
  const mt = teamOf(t.maker);
  const tricks: [number, number] = [t.won[0] + t.won[2], t.won[1] + t.won[3]];
  const points: [number, number] = [0, 0];
  if (tricks[mt] === 5) points[mt] = 2; else if (tricks[mt] >= 3) points[mt] = 1; else points[1 - mt] = 2;
  const scores: [number, number] = [t.scores[0] + points[0], t.scores[1] + points[1]];
  const over = scores[0] >= TARGET ? { winner: 0 as const } : scores[1] >= TARGET ? { winner: 1 as const } : null;
  const done: EuchreState = { ...t, scores, over, lastHand: { points, tricks, makerTeam: mt, trump: t.trump! } };
  pushLog(done, points[1 - mt] === 2 ? `{${t.maker}} got euchred` : `{${t.maker}} made it (${tricks[mt]} tricks)`);
  return over ? done : newHand(done);
}

const R = (t: EuchreState) => rulesFor(t.trump);

function playCard(t: EuchreState, p: number, c: string): EuchreState | null {
  if (t.phase !== 'play' || t.turn !== p || !t.hands[p].includes(c)) return null;
  if (!legalPlays(t.hands[p], t.trick, R(t)).includes(c)) return null;
  const hands = t.hands.map((h, i) => (i === p ? h.filter(x => x !== c) : h));
  const trick = [...t.trick, { p, c }];
  let n: EuchreState = { ...t, hands, trick, turn: nextPos(p) };
  if (trick.length === 4) {
    const w = trickWinner(trick, R(t));
    const won = [...n.won]; won[w]++;
    n = { ...n, won, last: trick, lastWinner: w, trick: [], turn: w };
    if (n.hands.every(h => h.length === 0)) n = scoreHand(n);
  }
  return n;
}

function call(t: EuchreState, p: number, what: string): EuchreState | null {
  if (t.turn !== p) return null;
  const up = suitOf(t.upcard);
  if (t.phase === 'call1') {
    if (what === 'pass') {
      const passes = t.passes + 1;
      const n: EuchreState = { ...t, passes, turn: nextPos(p) };
      pushLog(n, `{${p}} passed`);
      return passes >= 4 ? { ...n, phase: 'call2', passes: 0, turn: nextPos(t.dealer) } : n;
    }
    if (what !== 'order') return null;
    const hands = t.hands.map((h, i) => (i === t.dealer ? [...h, t.upcard] : h));
    const n: EuchreState = { ...t, hands, trump: up, maker: p, phase: 'discard', turn: t.dealer };
    pushLog(n, `{${p}} ordered up ${up}`);
    return n;
  }
  if (t.phase === 'call2') {
    if (what === 'pass') {
      if (p === t.dealer) return null; // stick the dealer
      const n: EuchreState = { ...t, passes: t.passes + 1, turn: nextPos(p) };
      pushLog(n, `{${p}} passed`);
      return n;
    }
    if (!(SUITS as readonly string[]).includes(what) || what === up) return null;
    const n: EuchreState = { ...t, trump: what, maker: p, phase: 'play', turn: nextPos(t.dealer) };
    pushLog(n, `{${p}} named ${what}`);
    return n;
  }
  return null;
}

function discard(t: EuchreState, p: number, c: string): EuchreState | null {
  if (t.phase !== 'discard' || t.turn !== p || p !== t.dealer || !t.hands[p].includes(c)) return null;
  const hands = t.hands.map((h, i) => (i === p ? h.filter(x => x !== c) : h));
  return { ...t, hands, phase: 'play', turn: nextPos(t.dealer) };
}

/** How good a hand is with `trump` (bowers 3 / 2.5, ace 2, K/Q 1.5, other trump 1, side aces 1). */
export function strength(hand: ReadonlyArray<string>, trump: string): number {
  const Rt = rulesFor(trump);
  let s = 0;
  for (const c of hand) {
    if (Rt.eff(c) === trump) s += c === 'J' + trump ? 3 : c === 'J' + sameColor(trump) ? 2.5 : c[0] === 'A' ? 2 : 'KQ'.includes(c[0]) ? 1.5 : 1;
    else if (c[0] === 'A') s += 1;
  }
  return s;
}

const worstCard = (hand: ReadonlyArray<string>, trump: string) => { const Rt = rulesFor(trump); return [...hand].sort((a, b) => Rt.power(a) - Rt.power(b))[0]; };

export function botMoveFor(t: EuchreState, p: number): { call: string } | { discard: string } | { play: string } {
  const up = suitOf(t.upcard);
  if (t.phase === 'call1') {
    let hand = t.hands[p];
    if (p === t.dealer) { hand = [...hand, t.upcard]; hand = hand.filter(c => c !== worstCard(hand, up)); }
    const need = teamOf(p) === teamOf(t.dealer) ? 6.5 : 7.5;
    return { call: strength(hand, up) >= need ? 'order' : 'pass' };
  }
  if (t.phase === 'call2') {
    const options = SUITS.filter(s => s !== up).map(s => ({ s, v: strength(t.hands[p], s) })).sort((a, b) => b.v - a.v);
    if (p === t.dealer || options[0].v >= 7) return { call: options[0].s };
    return { call: 'pass' };
  }
  if (t.phase === 'discard') {
    const Rt = rulesFor(t.trump);
    const side = t.hands[p].filter(c => Rt.eff(c) !== t.trump);
    return { discard: worstCard(side.length ? side : t.hands[p], t.trump!) };
  }
  return { play: botPlay(t.hands[p], t.trick, p, R(t)) };
}

function step(t: EuchreState, p: number, move: any): EuchreState | null {
  if (!move || typeof move !== 'object') return null;
  if (typeof move.call === 'string') return call(t, p, move.call);
  if (isCard(move.discard)) return discard(t, p, move.discard);
  if (isCard(move.play)) return playCard(t, p, move.play);
  return null;
}

function runBots(t: EuchreState): EuchreState {
  let n = t, guard = 0;
  while (!n.over && isBotPos(n.turn) && guard++ < 400) n = step(n, n.turn, botMoveFor(n, n.turn)) ?? n;
  return n;
}

export const initial = (seed?: number) => JSON.stringify(runBots(initialState(seed)));
export const seatToMove = (s: string): 0 | 1 => ((parse<EuchreState>(s)?.turn ?? 0) % 2) as 0 | 1;
export function apply(s: string, seat: 0 | 1, move: unknown): string | null {
  const t = parse<EuchreState>(s); if (!t || t.over || t.turn !== seat) return null;
  const n = step(t, seat, move); return n ? JSON.stringify(runBots(n)) : null;
}
export const outcome = (s: string) => { const t = parse<EuchreState>(s); return t?.over ? { winnerSeat: t.over.winner, draw: false, detail: { scores: t.scores } } : null; };
/** The upcard is public; the rest of the kitty never is. */
export const viewFor = (s: string, seat: number) => { const t = parse<EuchreState>(s); return t ? JSON.stringify(redactTable(t, seat, ['kitty'])) : s; };
export const botMove = (s: string, seat: number) => botMoveFor(parse<EuchreState>(s)!, seat);
