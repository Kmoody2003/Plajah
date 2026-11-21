// The table games on the Gamer Network: chess, checkers, dominoes, Spades, Euchre and Bid Whist. Each module is
// pure (client + server); this file wraps them in the registry's GameRules shape and adds what the browser
// needs for local play against the CPU (botMove).

import type { GameRules } from '../registry';
import * as chess from './chess';
import * as checkers from './checkers';
import * as dominoes from './dominoes';
import * as spades from './spades';
import * as euchre from './euchre';
import * as bidWhist from './bidWhist';

export interface TableGame extends GameRules {
  /** Partnership card game: each human seat plays with a CPU partner. */
  partnered: boolean;
  /** One short line for lobbies. */
  blurb: string;
  /** The move a CPU makes for `seat` (local vs-CPU play; for card games `seat` is the table position). */
  botMove(state: string, seat: number): unknown;
}

const wrap = (id: string, title: string, moveTimeMs: number, partnered: boolean, blurb: string, m: {
  initial(): string; seatToMove(s: string): 0 | 1; apply(s: string, seat: 0 | 1, mv: unknown): string | null;
  outcome(s: string): { winnerSeat: 0 | 1 | null; draw: boolean; detail?: unknown } | null;
  viewFor?(s: string, seat: number): string; botMove(s: string, seat: number): unknown;
}): TableGame => ({
  id, title, moveTimeMs, partnered, blurb,
  initial: () => m.initial(), seatToMove: m.seatToMove, apply: m.apply, outcome: m.outcome, botMove: m.botMove,
  ...(m.viewFor ? { viewFor: m.viewFor } : {}),
});

export const TABLE_GAMES: ReadonlyArray<TableGame> = [
  wrap(chess.ID, 'Chess', 90_000, false, 'Full rules · checkmate, stalemate, repetition', chess),
  wrap(checkers.ID, 'Checkers', 60_000, false, 'American rules · forced jumps, kings', checkers),
  wrap(dominoes.ID, 'Dominoes', 60_000, false, 'Draw dominoes · double-six · first to 100', dominoes),
  wrap(spades.ID, 'Spades', 60_000, true, 'You + a CPU partner · bids, nil, bags · to 500', spades),
  wrap(euchre.ID, 'Euchre', 60_000, true, 'You + a CPU partner · bowers, stick the dealer · to 10', euchre),
  wrap(bidWhist.ID, 'Bid Whist', 60_000, true, 'You + a CPU partner · uptown, downtown, no trump · to 7', bidWhist),
];

export const tableGame = (id: string): TableGame | undefined => TABLE_GAMES.find(g => g.id === id);
