// Checkers (American / English draughts) — pure rules + CPU, shared by client and server.
//
// 8×8 board, dark squares only. Seat 0 plays dark ('b', moves up the board, toward row 0) and moves first;
// seat 1 plays light ('r', moves down). Captures are compulsory, and a capturing piece must keep jumping
// while it can; a whole multi-jump is one move, given as the list of squares visited. A man reaching the far
// row is crowned and the move ends there. A side with no legal move loses. 80 plies (40 each) without a
// capture or a man moving is a draw.
//
// State: { b: 64-char board ('.', 'b', 'B', 'r', 'R'; index = row*8+col), t: side to move, q: quiet plies }.

import { parse } from './rng';

export const ID = 'checkers';
export const QUIET_DRAW = 80;
export interface CheckersState { b: string; t: 0 | 1; q: number; plies: number; last?: number[] }

export function initialState(): CheckersState {
  let b = '';
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) b += (r + c) % 2 === 1 ? (r < 3 ? 'r' : r > 4 ? 'b' : '.') : '.';
  return { b, t: 0, q: 0, plies: 0 };
}

const mine = (ch: string, side: 0 | 1) => (side === 0 ? ch === 'b' || ch === 'B' : ch === 'r' || ch === 'R');
const isKing = (ch: string) => ch === 'B' || ch === 'R';
const dirs = (ch: string): [number, number][] => (isKing(ch) ? [[-1, -1], [-1, 1], [1, -1], [1, 1]] : ch === 'b' ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]]);
const on = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;
const crownRow = (ch: string) => (ch === 'b' ? 0 : ch === 'r' ? 7 : -1);

/** All capture paths from one square (each path = squares visited, starting with the piece's square). */
function jumpsFrom(b: string, sq: number, side: 0 | 1): number[][] {
  const out: number[][] = [];
  const walk = (board: string, at: number, ch: string, path: number[]) => {
    let extended = false;
    const r = Math.floor(at / 8), c = at % 8;
    for (const [dr, dc] of dirs(ch)) {
      const mr = r + dr, mc = c + dc, lr = r + 2 * dr, lc = c + 2 * dc;
      if (!on(lr, lc)) continue;
      const mid = mr * 8 + mc, land = lr * 8 + lc;
      if (board[land] !== '.' || board[mid] === '.' || mine(board[mid], side)) continue;
      const nb = board.split(''); nb[at] = '.'; nb[mid] = '.';
      const crowned = !isKing(ch) && lr === crownRow(ch);
      nb[land] = crowned ? ch.toUpperCase() : ch;
      extended = true;
      if (crowned) out.push([...path, land]);
      else walk(nb.join(''), land, ch, [...path, land]);
    }
    if (!extended && path.length > 1) out.push(path);
  };
  walk(b, sq, b[sq], [sq]);
  return out;
}

export function legalMoves(s: CheckersState): number[][] {
  const caps: number[][] = [], steps: number[][] = [];
  for (let sq = 0; sq < 64; sq++) {
    if (!mine(s.b[sq], s.t)) continue;
    caps.push(...jumpsFrom(s.b, sq, s.t));
    const r = Math.floor(sq / 8), c = sq % 8;
    for (const [dr, dc] of dirs(s.b[sq])) {
      const nr = r + dr, nc = c + dc;
      if (on(nr, nc) && s.b[nr * 8 + nc] === '.') steps.push([sq, nr * 8 + nc]);
    }
  }
  return caps.length ? caps : steps;
}

export function play(s: CheckersState, path: unknown): CheckersState | null {
  if (!Array.isArray(path) || path.length < 2 || !path.every(n => Number.isInteger(n))) return null;
  const legal = legalMoves(s).find(m => m.length === path.length && m.every((x, i) => x === path[i]));
  if (!legal) return null;
  const b = s.b.split('');
  const ch = b[legal[0]];
  let captured = false;
  for (let i = 1; i < legal.length; i++) {
    const a = legal[i - 1], z = legal[i];
    if (Math.abs(a - z) > 9) { b[(a + z) / 2] = '.'; captured = true; }
  }
  b[legal[0]] = '.';
  const end = legal[legal.length - 1];
  b[end] = !isKing(ch) && Math.floor(end / 8) === crownRow(ch) ? ch.toUpperCase() : ch;
  const quiet = captured || !isKing(ch) ? 0 : s.q + 1;
  return { b: b.join(''), t: s.t === 0 ? 1 : 0, q: quiet, plies: s.plies + 1, last: legal };
}

export function result(s: CheckersState): { winner: 0 | 1 | null } | null {
  if (!legalMoves(s).length) return { winner: s.t === 0 ? 1 : 0 };
  if (s.q >= QUIET_DRAW) return { winner: null };
  return null;
}

// ── CPU: alpha-beta on material (man 1, king 1.6) plus a little advancement ───────────
function evalFor(s: CheckersState, side: 0 | 1): number {
  let v = 0;
  for (let sq = 0; sq < 64; sq++) {
    const ch = s.b[sq]; if (ch === '.') continue;
    const r = Math.floor(sq / 8);
    const val = isKing(ch) ? 1.6 : 1 + 0.03 * (ch === 'b' ? 7 - r : r);
    v += mine(ch, side) ? val : -val;
  }
  return v;
}
function search(s: CheckersState, depth: number, alpha: number, beta: number, side: 0 | 1): number {
  const res = result(s);
  if (res) return res.winner === null ? 0 : res.winner === side ? 1000 + depth : -1000 - depth;
  if (depth === 0) return evalFor(s, side);
  const maxi = s.t === side;
  let best = maxi ? -Infinity : Infinity;
  for (const m of legalMoves(s)) {
    const v = search(play(s, m)!, depth - 1, alpha, beta, side);
    if (maxi) { best = Math.max(best, v); alpha = Math.max(alpha, v); } else { best = Math.min(best, v); beta = Math.min(beta, v); }
    if (beta <= alpha) break;
  }
  return best;
}
export function cpuMove(s: CheckersState, depth = 5, rnd: () => number = Math.random): number[] {
  const moves = legalMoves(s);
  let best = moves[0], bv = -Infinity;
  for (const m of moves) {
    const v = search(play(s, m)!, depth - 1, -Infinity, Infinity, s.t) + rnd() * 0.01;
    if (v > bv) { bv = v; best = m; }
  }
  return best;
}

export const initial = () => JSON.stringify(initialState());
export const seatToMove = (s: string): 0 | 1 => parse<CheckersState>(s)?.t ?? 0;
export function apply(s: string, seat: 0 | 1, move: unknown): string | null {
  const t = parse<CheckersState>(s); if (!t || t.t !== seat || result(t)) return null;
  const n = play(t, move); return n ? JSON.stringify(n) : null;
}
export const outcome = (s: string) => {
  const t = parse<CheckersState>(s); const r = t && result(t);
  return r ? { winnerSeat: r.winner, draw: r.winner === null } : null;
};
export const botMove = (s: string) => cpuMove(parse<CheckersState>(s)!);
