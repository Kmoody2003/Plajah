// Cyber Tic Tac Toe — pure rules + CPU opponent. Shared by the client (local / CPU play) and the
// server (authoritative online matches), so a move the server accepts is exactly a move the board allows.
//
// Board: a 9-char string, row-major, 'X' | 'O' | '-'. X always moves first.

export type Mark = 'X' | 'O';
export type Board = string;
export const EMPTY: Board = '---------';
export const LINES: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export type Outcome = { kind: 'win'; mark: Mark; line: readonly [number, number, number] } | { kind: 'draw' };

export const isBoard = (b: unknown): b is Board => typeof b === 'string' && /^[XO-]{9}$/.test(b);

export function count(b: Board, m: Mark | '-'): number { let n = 0; for (const c of b) if (c === m) n++; return n; }

/** Whose move it is (valid boards only: X count is O count or O count + 1). */
export function turnOf(b: Board): Mark { return count(b, 'X') === count(b, 'O') ? 'X' : 'O'; }

export function outcome(b: Board): Outcome | null {
  for (const line of LINES) {
    const [a, c, d] = line;
    if (b[a] !== '-' && b[a] === b[c] && b[a] === b[d]) return { kind: 'win', mark: b[a] as Mark, line };
  }
  return b.includes('-') ? null : { kind: 'draw' };
}

/** Place `mark` at `i`. Null when the move is illegal (game over, wrong turn, taken, out of range). */
export function play(b: Board, i: number, mark: Mark): Board | null {
  if (!isBoard(b) || !Number.isInteger(i) || i < 0 || i > 8) return null;
  if (outcome(b) || b[i] !== '-' || turnOf(b) !== mark) return null;
  return b.slice(0, i) + mark + b.slice(i + 1);
}

export const emptyCells = (b: Board): number[] => [...b].flatMap((c, i) => (c === '-' ? [i] : []));
const other = (m: Mark): Mark => (m === 'X' ? 'O' : 'X');

/** Minimax score from `me`'s view (+10 win sooner is better, -10 loss later is better). */
function minimax(b: Board, toMove: Mark, me: Mark, depth: number): number {
  const o = outcome(b);
  if (o) return o.kind === 'draw' ? 0 : o.mark === me ? 10 - depth : depth - 10;
  const scores = emptyCells(b).map(i => minimax(b.slice(0, i) + toMove + b.slice(i + 1), other(toMove), me, depth + 1));
  return toMove === me ? Math.max(...scores) : Math.min(...scores);
}

export function bestMoves(b: Board, mark: Mark): number[] {
  const cells = emptyCells(b);
  const scored = cells.map(i => ({ i, s: minimax(b.slice(0, i) + mark + b.slice(i + 1), other(mark), mark, 1) }));
  const top = Math.max(...scored.map(x => x.s));
  return scored.filter(x => x.s === top).map(x => x.i);
}

export type CpuLevel = 'easy' | 'medium' | 'hard';

/** CPU move. easy: takes a win or blocks one, else random. medium: perfect 65% of the time. hard: perfect. */
export function cpuMove(b: Board, mark: Mark, level: CpuLevel, rnd: () => number = Math.random): number {
  const cells = emptyCells(b);
  if (!cells.length) return -1;
  const pick = (xs: number[]) => xs[Math.floor(rnd() * xs.length) % xs.length];
  const winning = (m: Mark) => cells.filter(i => { const o = outcome(b.slice(0, i) + m + b.slice(i + 1)); return o?.kind === 'win'; });
  if (level === 'hard' || (level === 'medium' && rnd() < 0.65)) return pick(bestMoves(b, mark));
  const win = winning(mark); if (win.length) return pick(win);
  const block = winning(other(mark)); if (block.length) return pick(block);
  return pick(cells);
}
