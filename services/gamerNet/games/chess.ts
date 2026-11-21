// Chess — full legality from chess.js (BSD-2): check, castling, en passant, promotion, mate, stalemate,
// 50-move rule, threefold repetition and insufficient material. Shared by client and server.
//
// State: { moves: ['e2e4', 'e7e5', …] (UCI), fen }. The server replays the move list, so threefold repetition
// is judged from the real history, never from a client-supplied position. Seat 0 = white.
// Move: { from: 'e2', to: 'e4', promotion?: 'q' | 'r' | 'b' | 'n' }.

import { Chess } from 'chess.js';
import { parse } from './rng';

export const ID = 'chess';
export interface ChessState { moves: string[]; fen: string }

export const START: ChessState = { moves: [], fen: new Chess().fen() };

export function replay(moves: ReadonlyArray<string>): Chess | null {
  const c = new Chess();
  for (const m of moves) {
    try { c.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] || undefined }); } catch { return null; }
  }
  return c;
}

export function play(s: ChessState, move: unknown): ChessState | null {
  if (!move || typeof move !== 'object') return null;
  const { from, to, promotion } = move as { from?: unknown; to?: unknown; promotion?: unknown };
  if (typeof from !== 'string' || typeof to !== 'string' || !/^[a-h][1-8]$/.test(from) || !/^[a-h][1-8]$/.test(to)) return null;
  const promo = typeof promotion === 'string' && /^[qrbn]$/.test(promotion) ? promotion : undefined;
  const c = replay(s.moves); if (!c || c.isGameOver()) return null;
  let made;
  try { made = c.move({ from, to, promotion: promo ?? 'q' }); } catch { return null; }
  return { moves: [...s.moves, made.from + made.to + (made.promotion ?? '')], fen: c.fen() };
}

export type ChessEnd = 'checkmate' | 'stalemate' | 'threefold' | 'insufficient' | 'fifty-move';
export function result(s: ChessState): { winner: 0 | 1 | null; reason: ChessEnd } | null {
  const c = replay(s.moves); if (!c) return null;
  if (c.isCheckmate()) return { winner: c.turn() === 'w' ? 1 : 0, reason: 'checkmate' };
  if (c.isStalemate()) return { winner: null, reason: 'stalemate' };
  if (c.isThreefoldRepetition()) return { winner: null, reason: 'threefold' };
  if (c.isInsufficientMaterial()) return { winner: null, reason: 'insufficient' };
  if (c.isDraw()) return { winner: null, reason: 'fifty-move' };
  return null;
}

// ── CPU: small alpha-beta on material + centre, for local play only ──────────────────
const VAL: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
function evaluate(c: Chess, side: 'w' | 'b'): number {
  let v = 0;
  const board = c.board();
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const sq = board[r][f]; if (!sq) continue;
    const centre = (sq.type === 'n' || sq.type === 'p') ? 10 - 3 * (Math.abs(3.5 - r) + Math.abs(3.5 - f)) : 0;
    v += (sq.color === side ? 1 : -1) * (VAL[sq.type] + centre);
  }
  return v;
}
function search(c: Chess, depth: number, alpha: number, beta: number, side: 'w' | 'b'): number {
  if (c.isCheckmate()) return c.turn() === side ? -100000 - depth : 100000 + depth;
  if (c.isDraw()) return 0;
  if (depth === 0) return evaluate(c, side);
  const maxi = c.turn() === side;
  const moves = c.moves({ verbose: true }).sort((a, b) => (b.captured ? VAL[b.captured] : 0) - (a.captured ? VAL[a.captured] : 0));
  let best = maxi ? -Infinity : Infinity;
  for (const m of moves) {
    c.move(m); const v = search(c, depth - 1, alpha, beta, side); c.undo();
    if (maxi) { best = Math.max(best, v); alpha = Math.max(alpha, v); } else { best = Math.min(best, v); beta = Math.min(beta, v); }
    if (beta <= alpha) break;
  }
  return best;
}
export function cpuMove(s: ChessState, depth = 2, rnd: () => number = Math.random): { from: string; to: string; promotion?: string } {
  const c = replay(s.moves)!;
  const side = c.turn();
  let best: { from: string; to: string; promotion?: string } | null = null, bv = -Infinity;
  for (const m of c.moves({ verbose: true })) {
    c.move(m); const v = search(c, depth, -Infinity, Infinity, side) + rnd() * 5; c.undo();
    if (v > bv) { bv = v; best = { from: m.from, to: m.to, ...(m.promotion ? { promotion: m.promotion } : {}) }; }
  }
  return best!;
}

export const initial = () => JSON.stringify(START);
export const seatToMove = (s: string): 0 | 1 => (parse<ChessState>(s)?.fen.split(' ')[1] === 'b' ? 1 : 0);
export function apply(s: string, seat: 0 | 1, move: unknown): string | null {
  const t = parse<ChessState>(s); if (!t || seatToMove(s) !== seat) return null;
  const n = play(t, move); return n ? JSON.stringify(n) : null;
}
export const outcome = (s: string) => {
  const t = parse<ChessState>(s); const r = t && result(t);
  return r ? { winnerSeat: r.winner, draw: r.winner === null, detail: { reason: r.reason } } : null;
};
export const botMove = (s: string) => cpuMove(parse<ChessState>(s)!);
