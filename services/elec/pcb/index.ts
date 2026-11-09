// Schematic → manufacturable two-layer board: place, route, check. If the first try leaves nets
// unrouted or breaks a rule, it routes the stubborn nets first, then spreads the parts out and
// tries again, keeping the best board.

import type { Circuit } from '../circuit';
import type { FpStyle } from './footprints';
import { prepare, place } from './place';
import { route, defaultOrder, type RouteResult } from './route';
import { drc, drcCounts, type DrcItem } from './drc';
import type { Board, Rules } from './types';

export * from './types';
export { footprintFor } from './footprints';
export type { FpStyle } from './footprints';
export { drc, ratsnest, connectivity, drcCounts } from './drc';
export type { DrcItem } from './drc';

export interface LayoutOptions { style?: FpStyle; rules?: Partial<Rules>; holes?: boolean; /** Give up after this long (ms) and return the best board so far. */ budgetMs?: number }
export interface Layout { board: Board; drc: DrcItem[]; route: RouteResult; attempts: number; ms: number }

export function layoutBoard(c: Circuit, o: LayoutOptions = {}): Layout {
  const t0 = Date.now(); const prep = prepare(c, { style: o.style, rules: o.rules });
  if (!prep.parts.length) throw new Error('Nothing to put on a board: add some parts first.');
  let best: Layout | null = null; let attempts = 0;
  const score = (l: Layout) => { const k = drcCounts(l.drc); return k.errors * 1000 + l.route.failed.length * 100 + k.warnings; };
  outer: for (const gap of [2.5, 3.8, 5.5, 8]) {
    const base = place(prep, { gap, holes: o.holes });
    let order = defaultOrder(base);
    for (let k = 0; k < 4; k++) {
      attempts++; const board: Board = { ...base, tracks: [], vias: [] };
      const rr = route(board, { order }); const items = drc(board);
      const l: Layout = { board, drc: items, route: rr, attempts, ms: 0 };
      if (!best || score(l) < score(best)) best = l;
      if (score(l) < 1000 && !rr.failed.length) break outer;
      if (Date.now() - t0 > (o.budgetMs ?? 60000)) break outer;
      if (!rr.failed.length) break; // rule problems that reordering will not fix: spread out instead
      const bad = new Set(rr.failed.map(f => f.net)); order = [...order.filter(n => bad.has(n)), ...order.filter(n => !bad.has(n))];
    }
  }
  const out = best!; out.attempts = attempts; out.ms = Date.now() - t0;
  const n = out.board.notes; n.length = 0;
  for (const v of out.board.virtual) n.push(`${v.ref} is not on the board: ${v.why}.`);
  for (const p of out.board.parts) if (p.fp.note) n.push(`${p.ref} (${p.fp.name}): ${p.fp.note}`);
  return out;
}
