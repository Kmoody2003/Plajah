// Plajah Gamer Network — game registry. Every first-party game that wants online matches,
// ratings and leaderboards registers its rules here. The server only ever advances a match
// through these rules, so results written to the gamer ledger are verified, not self-reported.
//
// State is an opaque string the rules own (Tic Tac Toe: the 9-char board). Seat 0 moves first.

import * as ttt from './games/ticTacToe';

export interface MatchOutcome { winnerSeat: 0 | 1 | null; draw: boolean; detail?: unknown }

export interface GameRules {
  id: string;
  title: string;
  /** Per-move clock for online matches; the player to move forfeits when it runs out. */
  moveTimeMs: number;
  initial(): string;
  seatToMove(state: string): 0 | 1;
  /** Apply a move for `seat`; null when illegal. */
  apply(state: string, seat: 0 | 1, move: unknown): string | null;
  outcome(state: string): MatchOutcome | null;
}

const ticTacToe: GameRules = {
  id: 'ttt',
  title: 'Cyber Tic Tac Toe',
  moveTimeMs: 45_000,
  initial: () => ttt.EMPTY,
  seatToMove: s => (ttt.turnOf(s) === 'X' ? 0 : 1),
  apply: (s, seat, move) => ttt.play(s, Number(move), seat === 0 ? 'X' : 'O'),
  outcome: s => {
    const o = ttt.outcome(s);
    if (!o) return null;
    return o.kind === 'draw' ? { winnerSeat: null, draw: true } : { winnerSeat: o.mark === 'X' ? 0 : 1, draw: false, detail: o.line };
  },
};

export const GAMES: Readonly<Record<string, GameRules>> = { [ticTacToe.id]: ticTacToe };
export const gameRules = (id: unknown): GameRules | null => (typeof id === 'string' && Object.prototype.hasOwnProperty.call(GAMES, id) ? GAMES[id] : null);
