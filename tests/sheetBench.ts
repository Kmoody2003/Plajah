// Sheet engine benchmark: `npx tsx tests/sheetBench.ts` (also run by sheetBench.test.ts with budgets).
import { SheetEngine, createWorkbook, setCellInput, type Workbook } from '../services/tela/sheet';

const N = Number(process.env.SHEET_BENCH_N ?? 100_000);

/** Build with A1 keys for readability, converted straight into the row/col grid. */
function build(fill: (cells: Record<string, { v?: number; f?: string }>) => void): Workbook {
  const wb = createWorkbook();
  const grid = wb.sheets[0].cells;
  const proxy = new Proxy({} as Record<string, { v?: number; f?: string }>, { set(_t, k: string, v) { const m = /^([A-Z]+)(\d+)$/.exec(k)!; let c = 0; for (const ch of m[1]) c = c * 26 + ch.charCodeAt(0) - 64; (grid[Number(m[2]) - 1] ??= {})[c - 1] = v; return true; } });
  fill(proxy);
  return wb;
}
const time = <T>(fn: () => T): [T, number] => { const t = performance.now(); const r = fn(); return [r, performance.now() - t]; };

export interface BenchRow { scenario: string; formulas: number; loadMs: number; recalcAllMs: number; editMs: number; computedOnEdit: number }

export function runBench(n = N): BenchRow[] {
  const rows: BenchRow[] = [];
  const scenario = (name: string, count: number, wb: Workbook, editCell: string, check?: (e: SheetEngine) => void) => {
    const [e, loadMs] = time(() => new SheetEngine(wb));
    const [, recalcAllMs] = time(() => e.recalcAll());
    const next = setCellInput(wb, wb.sheets[0].id, editCell, '42').workbook;
    const [st, editMs] = time(() => e.update(next));
    check?.(e);
    rows.push({ scenario: name, formulas: count, loadMs: Math.round(loadMs), recalcAllMs: Math.round(recalcAllMs), editMs: Math.round(editMs * 10) / 10, computedOnEdit: st.computed });
  };
  scenario(`${n} row formulas =A*2+B`, n, build(c => { for (let r = 1; r <= n; r++) { c[`A${r}`] = { v: r }; c[`B${r}`] = { v: 1 }; c[`C${r}`] = { f: `A${r}*2+B${r}` }; } }), 'A500');
  scenario(`${n} running total chain`, n, build(c => { for (let r = 1; r <= n; r++) { c[`A${r}`] = { v: 1 }; c[`B${r}`] = { f: r === 1 ? 'A1' : `B${r - 1}+A${r}` }; } }), 'A1',
    e => { if (e.getValue(0, n - 1, 1) !== 42 + n - 1) throw new Error('chain result wrong'); });
  const m = Math.round(n / 10);
  scenario(`${m} windowed SUM(A r:r+99)`, m, build(c => { for (let r = 1; r <= m + 100; r++) c[`A${r}`] = { v: r }; for (let r = 1; r <= m; r++) c[`B${r}`] = { f: `SUM(A${r}:A${r + 99})` }; }), 'A50');
  scenario(`${m} VLOOKUP exact into ${m} rows`, m, build(c => { for (let r = 1; r <= m; r++) { c[`A${r}`] = { v: r }; c[`B${r}`] = { v: r * 3 }; c[`D${r}`] = { f: `VLOOKUP(${(r * 7) % m + 1},$A$1:$B$${m},2,FALSE)` }; } }), 'B10');
  scenario(`${m} SUMIFS over whole columns`, Math.round(m / 10), build(c => { for (let r = 1; r <= m; r++) { c[`A${r}`] = { v: r % 10 }; c[`B${r}`] = { v: r }; } for (let r = 1; r <= m / 10; r++) c[`D${r}`] = { f: `SUMIFS(B:B,A:A,${r % 10})` }; }), 'B10');
  return rows;
}

if (process.argv[1]?.endsWith('sheetBench.ts')) {
  const rows = runBench();
  console.table(rows);
}
