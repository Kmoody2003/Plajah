// Shared trick-taking table for Spades, Euchre and Bid Whist. Pure: no IO, runs on the server (refereed online
// matches) and in the browser (vs CPU).
//
// Table: positions 0..3 clockwise. Partners sit opposite (0+2 = team 0, 1+3 = team 1). On the Gamer Network the
// match has two human seats: seat 0 plays position 0 and seat 1 plays position 1; positions 2 and 3 are server
// CPU partners whose turns run inside apply(), so the player to move is always a human.
//
// Cards: rank + suit, e.g. 'AS', 'TH', '9C'. Ranks 23456789TJQKA, suits S H D C. Jokers: 'BJ' (big), 'LJ' (little).

import { shuffle } from './rng';

export const RANKS = '23456789TJQKA';
export const SUITS = ['S', 'H', 'D', 'C'] as const;
export type Suit = typeof SUITS[number];
export const SUIT_NAME: Record<string, string> = { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' };
export const SUIT_GLYPH: Record<string, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };

export const isJoker = (c: string) => c === 'BJ' || c === 'LJ';
export const suitOf = (c: string): string => (isJoker(c) ? 'J' : c[1]);
export const rankIdx = (c: string): number => RANKS.indexOf(c[0]);
export const isCard = (c: unknown): c is string => typeof c === 'string' && (isJoker(c) || (c.length === 2 && RANKS.includes(c[0]) && 'SHDC'.includes(c[1])));
export const sameColor = (s: string): string => ({ S: 'C', C: 'S', H: 'D', D: 'H' } as Record<string, string>)[s];

export function deck52(): string[] { const d: string[] = []; for (const s of SUITS) for (const r of RANKS) d.push(r + s); return d; }
export function deck24(): string[] { return deck52().filter(c => '9TJQKA'.includes(c[0])); }
export function deck54(): string[] { return [...deck52(), 'BJ', 'LJ']; }

export const partnerOf = (p: number) => (p + 2) % 4;
export const teamOf = (p: number): 0 | 1 => (p % 2) as 0 | 1;
export const nextPos = (p: number) => (p + 1) % 4;
/** Positions a CPU plays on the Gamer Network (the human seats are 0 and 1). */
export const isBotPos = (p: number) => p >= 2;
export const POS_NAME = ['You', 'Left', 'Partner', 'Right'];

export interface Play { p: number; c: string }

/** How one game ranks cards. `eff` = the suit a card follows as (Euchre's left bower is trump). */
export interface TrickRules {
  eff(c: string): string;
  /** Strength inside the trick: higher wins. `led` is the effective suit led. */
  score(c: string, led: string): number;
  /** Rough strength regardless of the led suit (for CPU discards). */
  power(c: string): number;
  trump: string | null;
}

/** The effective suit of a trick: the first card's, skipping cards that follow no suit ('X'). */
export function ledSuit(trick: ReadonlyArray<Play>, R: TrickRules): string | null {
  for (const t of trick) { const e = R.eff(t.c); if (e !== 'X') return e; }
  return null;
}

export function trickWinner(trick: ReadonlyArray<Play>, R: TrickRules): number {
  const led = ledSuit(trick, R) ?? '';
  let best = trick[0];
  for (const t of trick) if (R.score(t.c, led) > R.score(best.c, led)) best = t;
  return best.p;
}

/** Cards a player may play: follow the led suit when you can. `canLead` narrows leads (Spades: unbroken). */
export function legalPlays(hand: ReadonlyArray<string>, trick: ReadonlyArray<Play>, R: TrickRules, canLead?: (c: string) => boolean): string[] {
  const led = ledSuit(trick, R);
  if (!led) {
    // Leading (or every card so far followed no suit). Cards that follow no suit may lead only when nothing else is left.
    const real = hand.filter(c => R.eff(c) !== 'X');
    const pool = real.length ? real : [...hand];
    if (trick.length) return [...hand];
    const ok = canLead ? pool.filter(canLead) : pool;
    return ok.length ? ok : pool;
  }
  const follow = hand.filter(c => R.eff(c) === led);
  return follow.length ? follow : [...hand];
}

/** Deal `perHand` cards to four players from a seeded shuffle. Returns hands, the rest, and the advanced seed. */
export function deal(deck: ReadonlyArray<string>, perHand: number, rs: number, firstPos: number): { hands: string[][]; rest: string[]; rs: number } {
  const [d, r] = shuffle(deck, rs);
  const hands: string[][] = [[], [], [], []];
  for (let i = 0; i < perHand * 4; i++) hands[(firstPos + i) % 4].push(d[i]);
  return { hands, rest: d.slice(perHand * 4), rs: r };
}

/** Sort a hand for display: grouped by suit (trump first), high to low. */
export function sortHand(hand: ReadonlyArray<string>, R?: TrickRules): string[] {
  const order = ['J', R?.trump ?? '', 'S', 'H', 'C', 'D'];
  const key = (c: string) => { const e = R ? R.eff(c) : suitOf(c); const i = order.indexOf(e); return (i < 0 ? 9 : i) * 1000 - (R ? R.power(c) : rankIdx(c)); };
  return [...hand].sort((a, b) => key(a) - key(b));
}

/** A simple, legal CPU card play: win cheaply when the partner isn't already winning, otherwise shed low. */
export function botPlay(hand: ReadonlyArray<string>, trick: ReadonlyArray<Play>, pos: number, R: TrickRules, canLead?: (c: string) => boolean): string {
  const legal = legalPlays(hand, trick, R, canLead);
  const low = (cs: string[]) => [...cs].sort((a, b) => R.power(a) - R.power(b))[0];
  const high = (cs: string[]) => [...cs].sort((a, b) => R.power(b) - R.power(a))[0];
  const nonTrump = (cs: string[]) => cs.filter(c => R.eff(c) !== R.trump);
  if (!trick.length) {
    // Lead an ace/top card of a side suit if we have one, else the low card of our longest side suit.
    const side = nonTrump(legal);
    const tops = side.filter(c => R.power(c) >= 12);
    if (tops.length) return high(tops);
    if (side.length) {
      const bySuit: Record<string, string[]> = {};
      for (const c of side) (bySuit[R.eff(c)] ??= []).push(c);
      const longest = Object.values(bySuit).sort((a, b) => b.length - a.length)[0];
      return low(longest);
    }
    return low(legal);
  }
  const led = ledSuit(trick, R) ?? '';
  const winnerPos = trickWinner(trick, R);
  const winning = trick.find(t => t.p === winnerPos)!;
  if (winnerPos === partnerOf(pos)) {
    const shed = nonTrump(legal);
    return low(shed.length ? shed : legal);
  }
  const beaters = legal.filter(c => R.score(c, led) > R.score(winning.c, led));
  if (beaters.length) return [...beaters].sort((a, b) => R.score(a, led) - R.score(b, led))[0];
  const shed = nonTrump(legal);
  return low(shed.length ? shed : legal);
}

/** Common fields every trick game keeps in its JSON state. */
export interface TrickTable {
  rs: number;
  dealer: number;
  handNo: number;
  hands: string[][];
  turn: number;
  trick: Play[];
  won: number[];
  last: Play[] | null;
  lastWinner: number;
  scores: [number, number];
  log: string[];
  over: { winner: 0 | 1 } | null;
}

export const pushLog = (t: { log: string[] }, line: string) => { t.log = [...t.log, line].slice(-8); };

/** Strip what a seat must not see: the seed and the other players' cards (their counts stay). */
export function redactTable<T extends TrickTable>(t: T, seat: number, extraHidden: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(t as unknown as Record<string, unknown>) };
  delete out.rs;
  for (const k of extraHidden) delete out[k];
  out.hands = t.hands.map((h, p) => (p === seat ? h : []));
  out.counts = t.hands.map(h => h.length);
  return out;
}
