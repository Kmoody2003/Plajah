// legacyFormula — the original P0/P1 Grid formula evaluator, kept verbatim for
// compatibility: older callers (and tests) still evaluate legacy A1 → string
// cell maps with it. New code reads values from the sheet engine
// (components/tela/grid/runtime.ts), which supersedes this evaluator.

import type { GridLinkContext, TelaBaseLite } from './runtime';
export type { TelaBaseLite };

// ── A1 helpers ────────────────────────────────────────────────────────────────

export const colLetter = (i: number): string => {
  // 0 → A, 25 → Z, 26 → AA …
  let s = '';
  let n = i;
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
};

const colIndex = (letters: string): number => {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

export const cellKey = (col: number, row: number) => `${colLetter(col)}${row + 1}`;

// ── Formula evaluation ────────────────────────────────────────────────────────

const REF_RE = /\b([A-Z]+)([0-9]+)\b/g;
const RANGE_FN_RE = /\b(SUM|AVG|AVERAGE|MIN|MAX|COUNT)\(\s*([A-Z]+[0-9]+)\s*:\s*([A-Z]+[0-9]+)\s*\)/gi;
// Cross-device (P1): `GridName!A1` and `COUNT(BaseName)` / `SUM(BaseName.field)`.
const XGRID_RE = /([A-Za-z_][A-Za-z0-9_ ]*)!([A-Z]+[0-9]+)/g;
const BASEAGG_RE = /\b(COUNT|SUM|AVG|AVERAGE|MIN|MAX)\(\s*([A-Za-z_][A-Za-z0-9_ ]*?)(?:\.([A-Za-z_][A-Za-z0-9_ ]*?))?\s*\)/gi;

const MAX_DEPTH = 12;

/** Cross-device resolution — how a Grid reaches outside its own cells. The
 *  sheet engine uses `resolveGridDevice` (full workbooks); the legacy evaluator
 *  below only understands `resolveGrid` (A1 → string cells). */
export interface TelaFormulaContext extends GridLinkContext {
  /** Recursion guard across devices (legacy evaluator). */
  depth?: number;
}

function numericValue(cells: Record<string, string>, key: string, seen: Set<string>, ctx?: TelaFormulaContext): number {
  const raw = (cells[key] ?? '').trim();
  if (!raw) return 0;
  if (raw.startsWith('=')) {
    const v = evaluateFormula(raw, cells, seen, key, ctx);
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return Number.isFinite(n) ? n : NaN;
  }
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : NaN;
}

function rangeValues(cells: Record<string, string>, a: string, b: string, seen: Set<string>, ctx?: TelaFormulaContext): number[] {
  const ma = a.match(/^([A-Z]+)([0-9]+)$/);
  const mb = b.match(/^([A-Z]+)([0-9]+)$/);
  if (!ma || !mb) return [];
  const c1 = colIndex(ma[1]); const r1 = parseInt(ma[2], 10) - 1;
  const c2 = colIndex(mb[1]); const r2 = parseInt(mb[2], 10) - 1;
  const out: number[] = [];
  for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
    for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
      const n = numericValue(cells, cellKey(c, r), seen, ctx);
      if (Number.isFinite(n)) out.push(n);
    }
  }
  return out;
}

/** COUNT(Base) / COUNT(Base.field) / SUM|MIN|MAX|AVG(Base.field). */
function baseAggregate(base: TelaBaseLite, fn: string, field?: string): number {
  const f = field ? base.fields.find(x => x.name.toUpperCase() === field.toUpperCase()) : null;
  if (fn === 'COUNT') {
    if (!field) return base.rows.length;
    if (!f) return 0;
    return base.rows.filter(r => (r.values[f.id] ?? '').trim() !== '').length;
  }
  // Numeric aggregate — named field, else the first NUMBER field.
  const fid = f?.id ?? base.fields.find(x => x.type === 'NUMBER')?.id;
  const nums: number[] = [];
  if (fid) for (const r of base.rows) {
    const n = parseFloat(r.values[fid]);
    if (Number.isFinite(n)) nums.push(n);
  }
  if (fn === 'SUM') return nums.reduce((s, v) => s + v, 0);
  if (fn === 'MIN') return nums.length ? Math.min(...nums) : 0;
  if (fn === 'MAX') return nums.length ? Math.max(...nums) : 0;
  return nums.length ? nums.reduce((s, v) => s + v, 0) / nums.length : 0; // AVG
}

/**
 * Evaluate a `=...` formula against the cell map. `seen` guards intra-grid
 * cycles (A1 = B1, B1 = A1 → #REF!); `ctx.depth` bounds cross-device recursion.
 * Returns a number, or an error token string.
 */
export function evaluateFormula(
  raw: string,
  cells: Record<string, string>,
  seen: Set<string> = new Set(),
  selfKey?: string,
  ctx?: TelaFormulaContext,
): number | string {
  if ((ctx?.depth ?? 0) > MAX_DEPTH) return '#REF!';
  if (selfKey) {
    if (seen.has(selfKey)) return '#REF!';
    seen.add(selfKey);
  }
  let expr = raw.slice(1).toUpperCase();
  let bad = false;

  // 1) Cross-grid references: GridName!A1 → the referenced cell's value.
  if (ctx?.resolveGrid) {
    expr = expr.replace(XGRID_RE, (m, name: string, cell: string) => {
      const cs = ctx.resolveGrid!(String(name).trim());
      if (!cs) return m; // unknown grid → leave token (will surface as #ERR)
      const n = numericValue(cs, cell, new Set(), { ...ctx, depth: (ctx.depth ?? 0) + 1 });
      if (!Number.isFinite(n)) { bad = true; return '0'; }
      return `(${n})`;
    });
  }

  // 2) Base aggregates: COUNT(Base) / SUM(Base.field). Falls through when the
  //    name isn't a Base (so local SUM(A1:B3) range handling still applies).
  if (ctx?.resolveBase) {
    expr = expr.replace(BASEAGG_RE, (m, fn: string, name: string, field?: string) => {
      const base = ctx.resolveBase!(String(name).trim());
      if (!base) return m;
      return String(baseAggregate(base, String(fn).toUpperCase(), field ? String(field).trim() : undefined));
    });
  }

  // 3) Local range functions, so their refs don't get single-substituted.
  expr = expr.replace(RANGE_FN_RE, (_m, fn: string, a: string, b: string) => {
    const vals = rangeValues(cells, a, b, new Set(seen), ctx);
    const f = fn.toUpperCase();
    if (f === 'SUM') return String(vals.reduce((s, v) => s + v, 0));
    if (f === 'MIN') return String(vals.length ? Math.min(...vals) : 0);
    if (f === 'MAX') return String(vals.length ? Math.max(...vals) : 0);
    if (f === 'COUNT') return String(vals.length);
    /* AVG / AVERAGE */
    return String(vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0);
  });

  // 4) Single-cell references.
  expr = expr.replace(REF_RE, (_m, letters: string, digits: string) => {
    const n = numericValue(cells, `${letters}${digits}`, new Set(seen), ctx);
    if (!Number.isFinite(n)) { bad = true; return '0'; }
    return `(${n})`;
  });
  if (bad) return '#ERR';

  // Whitelist: only arithmetic survives → safe to Function-eval.
  if (!/^[0-9+\-*/().,\s%]*$/.test(expr) || !expr.trim()) return '#ERR';
  try {
    // eslint-disable-next-line no-new-func
    const v = Function(`"use strict"; return (${expr});`)();
    return typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1e10) / 1e10 : '#ERR';
  } catch {
    return '#ERR';
  }
}

/** What a cell shows at rest: its literal, or its formula's computed value. */
export function displayValue(cells: Record<string, string>, key: string, ctx?: TelaFormulaContext): string {
  const raw = cells[key] ?? '';
  if (!raw.trim().startsWith('=')) return raw;
  const v = evaluateFormula(raw.trim(), cells, new Set(), key, ctx);
  return String(v);
}

