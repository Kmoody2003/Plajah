// address — A1 / R1C1 coordinate helpers for the Tela sheet engine.
//
// Everything inside the engine is 0-based (row, col). A1 strings appear only at
// the edges: the persisted cell map keys, formula text, and the UI. Keeping the
// conversion in one tiny module means no other file hand-rolls column letters.

export const MAX_ROWS = 1048576;
export const MAX_COLS = 16384;

export interface CellAddr { row: number; col: number }
export interface RangeAddr { r1: number; c1: number; r2: number; c2: number }

const letterCache: string[] = [];
export function colToLetters(col: number): string {
  if (col < 1024 && letterCache[col]) return letterCache[col];
  let s = '';
  let n = col;
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  if (col < 1024) letterCache[col] = s;
  return s;
}

export function lettersToCol(letters: string): number {
  let n = 0;
  for (let i = 0; i < letters.length; i++) {
    const c = letters.charCodeAt(i);
    n = n * 26 + ((c >= 97 ? c - 32 : c) - 64);
  }
  return n - 1;
}

export const toA1 = (row: number, col: number): string => colToLetters(col) + (row + 1);

const A1_RE = /^\$?([A-Za-z]{1,3})\$?(\d+)$/;
export function parseA1(a1: string): CellAddr | null {
  const m = A1_RE.exec(a1.trim());
  if (!m) return null;
  const col = lettersToCol(m[1]);
  const row = Number(m[2]) - 1;
  if (col < 0 || col >= MAX_COLS || row < 0 || row >= MAX_ROWS) return null;
  return { row, col };
}

/** "A1:B3", "A:A", "3:5", or a single "C4" → normalized range (r1<=r2, c1<=c2). */
export function parseRange(ref: string): RangeAddr | null {
  const s = ref.trim().replace(/\$/g, '');
  const parts = s.split(':');
  if (parts.length === 1) {
    const a = parseA1(parts[0]);
    return a ? { r1: a.row, c1: a.col, r2: a.row, c2: a.col } : null;
  }
  if (parts.length !== 2) return null;
  const [p, q] = parts;
  if (/^[A-Za-z]{1,3}$/.test(p) && /^[A-Za-z]{1,3}$/.test(q)) {
    const c1 = lettersToCol(p), c2 = lettersToCol(q);
    return { r1: 0, c1: Math.min(c1, c2), r2: MAX_ROWS - 1, c2: Math.max(c1, c2) };
  }
  if (/^\d+$/.test(p) && /^\d+$/.test(q)) {
    const r1 = Number(p) - 1, r2 = Number(q) - 1;
    return { r1: Math.min(r1, r2), c1: 0, r2: Math.max(r1, r2), c2: MAX_COLS - 1 };
  }
  const a = parseA1(p), b = parseA1(q);
  if (!a || !b) return null;
  return { r1: Math.min(a.row, b.row), c1: Math.min(a.col, b.col), r2: Math.max(a.row, b.row), c2: Math.max(a.col, b.col) };
}

export function rangeToA1(r: RangeAddr): string {
  if (r.r1 === 0 && r.r2 === MAX_ROWS - 1) return `${colToLetters(r.c1)}:${colToLetters(r.c2)}`;
  if (r.c1 === 0 && r.c2 === MAX_COLS - 1) return `${r.r1 + 1}:${r.r2 + 1}`;
  const a = toA1(r.r1, r.c1);
  return r.r1 === r.r2 && r.c1 === r.c2 ? a : `${a}:${toA1(r.r2, r.c2)}`;
}

export const rangeContains = (r: RangeAddr, row: number, col: number) =>
  row >= r.r1 && row <= r.r2 && col >= r.c1 && col <= r.c2;

export const rangesIntersect = (a: RangeAddr, b: RangeAddr) =>
  a.r1 <= b.r2 && b.r1 <= a.r2 && a.c1 <= b.c2 && b.c1 <= a.c2;

export function* iterRange(r: RangeAddr): Generator<CellAddr> {
  for (let row = r.r1; row <= r.r2; row++) for (let col = r.c1; col <= r.c2; col++) yield { row, col };
}

/** Quote a sheet name for formula text when needed ('My Sheet'!A1). */
export function quoteSheetName(name: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_.]*$/.test(name) && !/^[A-Za-z]{1,3}\d+$/.test(name) && !/^(R|C|RC|R\d+C\d+)$/i.test(name)) return name;
  return `'${name.replace(/'/g, "''")}'`;
}

/** Numeric cell key used by the engine's hot maps (row-major, fits a double exactly). */
export const cellKeyNum = (row: number, col: number) => row * MAX_COLS + col;
export const keyRow = (k: number) => Math.floor(k / MAX_COLS);
export const keyCol = (k: number) => k % MAX_COLS;
