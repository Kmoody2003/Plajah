/**
 * TelaGrid — the spreadsheet device (P0).
 *
 * N×M cells keyed A1-style, click-to-edit, and a small formula evaluator:
 * literals, `=A1+B2` arithmetic (+ - * / ( ) ), and `=SUM(A1:B3)` /
 * `=AVG(...)` ranges. No cross-device references yet (P1). Recompute is a
 * simple full re-eval on change — dependency-free and fine at P0 scale.
 * Every cell is identified by its stable A1 key, so cell writes are ops.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { TelaGridDevice } from '../../types';

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

/** A Base seen through the formula engine (COUNT/SUM aggregates). */
export interface TelaBaseLite {
  fields: { id: string; name: string; type: string }[];
  rows: { values: Record<string, string> }[];
}

/** Cross-device resolution — how a Grid reaches outside its own cells (P1). */
export interface TelaFormulaContext {
  /** Cells of another grid, looked up by case-insensitive name/label or id. */
  resolveGrid?: (name: string) => Record<string, string> | null;
  /** Another Base by name/label/id, for COUNT/SUM aggregates. */
  resolveBase?: (name: string) => TelaBaseLite | null;
  /** Recursion guard across devices. */
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

// ── Component ─────────────────────────────────────────────────────────────────

interface TelaGridProps {
  device: TelaGridDevice;
  /** Ops-shaped: one cell write at a time (key is the stable cell id). */
  onSetCell: (key: string, value: string) => void;
  readOnly?: boolean;
  /** Cross-device resolution so `=Sheet2!A1` / `=SUM(Base.field)` recompute live. */
  formulaContext?: TelaFormulaContext;
}

const CELL_W = 88;
const CELL_H = 26;
const HDR_W = 36;

const TelaGrid: React.FC<TelaGridProps> = ({ device, onSetCell, readOnly, formulaContext }) => {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const beginEdit = useCallback((key: string) => {
    if (readOnly) return;
    setEditing(key);
    setSelected(key);
    setDraft(device.cells[key] ?? '');
  }, [device.cells, readOnly]);

  const commit = useCallback((move?: 'down' | 'right') => {
    if (!editing) return;
    const prev = device.cells[editing] ?? '';
    if (draft !== prev) onSetCell(editing, draft);
    const m = editing.match(/^([A-Z]+)([0-9]+)$/);
    setEditing(null);
    if (m && move) {
      const c = colIndex(m[1]); const r = parseInt(m[2], 10) - 1;
      const nc = move === 'right' ? c + 1 : c;
      const nr = move === 'down' ? r + 1 : r;
      if (nc < device.cols && nr < device.rows) {
        const nk = cellKey(nc, nr);
        setSelected(nk);
        // Enter/Tab flows straight into editing the next cell.
        setTimeout(() => { setEditing(nk); setDraft(device.cells[nk] ?? ''); }, 0);
      }
    }
  }, [editing, draft, device, onSetCell]);

  return (
    <div
      className="tela-grid custom-scrollbar"
      style={{
        overflow: 'auto',
        maxHeight: '100%',
        fontVariantNumeric: 'tabular-nums',
        fontFamily: 'var(--font-sans, system-ui, sans-serif)',
        fontSize: 12,
        background: '#FFFFFF',
        color: '#1B1523',
        userSelect: 'none',
      }}
    >
      <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <thead>
          <tr>
            <th style={{ width: HDR_W, minWidth: HDR_W, height: CELL_H, background: '#F0EDF4', border: '1px solid #DDD8E4', position: 'sticky', top: 0, zIndex: 2 }} />
            {Array.from({ length: device.cols }, (_, c) => (
              <th key={c} style={{
                width: CELL_W, minWidth: CELL_W, height: CELL_H,
                background: '#F0EDF4', border: '1px solid #DDD8E4',
                fontWeight: 700, fontSize: 10.5, color: '#6E6480',
                position: 'sticky', top: 0, zIndex: 1,
              }}>{colLetter(c)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: device.rows }, (_, r) => (
            <tr key={r}>
              <td style={{
                width: HDR_W, minWidth: HDR_W, height: CELL_H,
                background: '#F0EDF4', border: '1px solid #DDD8E4',
                textAlign: 'center', fontWeight: 700, fontSize: 10.5, color: '#6E6480',
              }}>{r + 1}</td>
              {Array.from({ length: device.cols }, (_, c) => {
                const key = cellKey(c, r);
                const isEd = editing === key;
                const isSel = selected === key;
                const raw = device.cells[key] ?? '';
                const shown = isEd ? '' : displayValue(device.cells, key, formulaContext);
                const numeric = !isEd && shown !== '' && Number.isFinite(parseFloat(shown)) && /^[-0-9.]/.test(shown.trim());
                return (
                  <td
                    key={key}
                    onClick={() => { setSelected(key); if (!isEd) beginEdit(key); }}
                    style={{
                      width: CELL_W, minWidth: CELL_W, height: CELL_H,
                      border: isSel ? '2px solid var(--pj-purple, #6B0099)' : '1px solid #E6E2EC',
                      padding: isEd ? 0 : '0 6px',
                      textAlign: numeric ? 'right' : 'left',
                      overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                      background: isSel ? 'rgba(107,0,153,0.05)' : '#FFFFFF',
                      color: shown.startsWith('#') && raw.trim().startsWith('=') ? 'var(--pj-danger, #EF4444)' : undefined,
                      cursor: readOnly ? 'default' : 'cell',
                    }}
                    title={raw.trim().startsWith('=') ? raw : undefined}
                  >
                    {isEd ? (
                      <input
                        ref={inputRef}
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        onBlur={() => commit()}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); commit('down'); }
                          else if (e.key === 'Tab') { e.preventDefault(); commit('right'); }
                          else if (e.key === 'Escape') { setEditing(null); }
                          e.stopPropagation();
                        }}
                        style={{
                          width: '100%', height: '100%', border: 'none', outline: 'none',
                          padding: '0 6px', fontSize: 12, fontFamily: 'inherit',
                          fontVariantNumeric: 'tabular-nums', background: '#FFFFFF', color: '#1B1523',
                        }}
                      />
                    ) : shown}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TelaGrid;
