/**
 * productionFinance — pure budget / cost-tracking math + Firestore persistence for the Film Production "Finance" tab.
 *
 * ALL MONEY IS INTEGER CENTS. Percentages are plain numbers (7.5 = 7.5%). Nothing here moves money —
 * invoices go through Plajah Billing (entity {kind:'PRODUCTION', id: prodId}) on the production's own Stripe account.
 *
 * Firestore:
 *   productions/{prodId}/budget/main      single doc: { scenarios[], activeScenarioId, ... }
 *   productions/{prodId}/costs/{costId}   one doc per logged expense / receipt
 *
 * Self-checks (worked examples):
 *   lineTotals({units: 10, rateCents: 50000, fringePct: 20, contingencyPct: 10})
 *     sub = 500000, fringe = 100000, contingency = round((500000+100000)*0.10) = 60000, total = 660000
 *   scenarioTotals: 2 lines (ATL 660000 + BTL 100000) → grand 760000, atl 660000, btl 100000
 *   projection: budget 760000, actual 300000, 2 of 5 days shot → pct 0.4 → projected 750000, overage -10000 (under)
 *   centsFromDollars('12.345') → 1235 (half-up on cents); fmtCents(123456) → "$1,234.56"
 */
import { collection, doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';
import { db, auth, uploadFile } from './backendService';
import type { DeptKey } from './filmProductionService';

export type BudgetCategory = 'ATL' | 'BTL' | 'POST' | 'OTHER';
export const BUDGET_CATEGORIES: { key: BudgetCategory; label: string }[] = [
  { key: 'ATL', label: 'Above the line' }, { key: 'BTL', label: 'Below the line' },
  { key: 'POST', label: 'Post-production' }, { key: 'OTHER', label: 'Other' },
];

export interface BudgetLine {
  id: string; dept: DeptKey; category: BudgetCategory; description: string;
  units: number; rateCents: number;        // units × rate
  unitLabel?: string;                      // 'days' | 'wks' | 'flat' …
  fringePct?: number; contingencyPct?: number;
}
export interface BudgetScenario { id: string; name: string; lines: BudgetLine[] }
export interface ProductionBudgetDoc {
  id: 'main'; scenarios: BudgetScenario[]; activeScenarioId: string; currency: 'usd';
  updatedAt: number; updatedBy?: string;
}
export interface CostEntry {
  id: string; vendor: string; dept: DeptKey; amountCents: number; date: string;   // YYYY-MM-DD
  description?: string; paid: boolean; receiptUrl?: string;
  sceneId?: string; shootDay?: number; budgetLineId?: string;
  createdAt: number; createdBy?: string; updatedAt?: number;
}

// ── formatting / parsing ────────────────────────────────────────────────────
export const centsFromDollars = (v: string | number): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100 + (n >= 0 ? 1e-9 : -1e-9)) : 0;
};
export const fmtCents = (c: number): string =>
  `${c < 0 ? '-' : ''}$${(Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pctOf = (cents: number, pct?: number) => Math.round(cents * ((pct || 0) / 100));

// ── budget math ─────────────────────────────────────────────────────────────
export interface LineTotals { sub: number; fringe: number; contingency: number; total: number }
export function lineTotals(l: Pick<BudgetLine, 'units' | 'rateCents' | 'fringePct' | 'contingencyPct'>): LineTotals {
  const sub = Math.round((l.units || 0) * (l.rateCents || 0));
  const fringe = pctOf(sub, l.fringePct);
  const contingency = pctOf(sub + fringe, l.contingencyPct);
  return { sub, fringe, contingency, total: sub + fringe + contingency };
}

export interface ScenarioTotals {
  sub: number; fringe: number; contingency: number; grand: number;
  atl: number; btl: number; post: number; other: number;
  byDept: Record<string, number>; byCategory: Record<BudgetCategory, number>;
}
export function scenarioTotals(lines: BudgetLine[]): ScenarioTotals {
  const t: ScenarioTotals = { sub: 0, fringe: 0, contingency: 0, grand: 0, atl: 0, btl: 0, post: 0, other: 0, byDept: {}, byCategory: { ATL: 0, BTL: 0, POST: 0, OTHER: 0 } };
  for (const l of lines) {
    const x = lineTotals(l);
    t.sub += x.sub; t.fringe += x.fringe; t.contingency += x.contingency; t.grand += x.total;
    t.byDept[l.dept] = (t.byDept[l.dept] || 0) + x.total;
    t.byCategory[l.category] += x.total;
  }
  t.atl = t.byCategory.ATL; t.btl = t.byCategory.BTL; t.post = t.byCategory.POST; t.other = t.byCategory.OTHER;
  return t;
}

// ── cost report ─────────────────────────────────────────────────────────────
export interface DeptCostRow { dept: string; budget: number; actual: number; paid: number; unpaid: number; variance: number; pctUsed: number }
export function costReport(lines: BudgetLine[], costs: CostEntry[]): { rows: DeptCostRow[]; totals: DeptCostRow } {
  const bd = scenarioTotals(lines).byDept;
  const depts = [...new Set([...Object.keys(bd), ...costs.map(c => c.dept)])].sort();
  const mk = (dept: string, budget: number, cs: CostEntry[]): DeptCostRow => {
    const actual = cs.reduce((s, c) => s + c.amountCents, 0);
    const paid = cs.filter(c => c.paid).reduce((s, c) => s + c.amountCents, 0);
    return { dept, budget, actual, paid, unpaid: actual - paid, variance: budget - actual, pctUsed: budget > 0 ? actual / budget : actual > 0 ? 1 : 0 };
  };
  const rows = depts.map(d => mk(d, bd[d] || 0, costs.filter(c => c.dept === d)));
  return { rows, totals: mk('TOTAL', rows.reduce((s, r) => s + r.budget, 0), costs) };
}

/** Straight-line projection by shoot-day progress. Negative overage = projected under budget. */
export function projectOverage(budget: number, actual: number, daysShot: number, totalDays: number) {
  const pct = totalDays > 0 ? Math.min(1, Math.max(0, daysShot / totalDays)) : 0;
  const projected = pct > 0 ? Math.round(actual / pct) : actual;
  return { pct, projected, overage: projected - budget };
}

/** Hot-cost sheet for one day: that date's spend (or shootDay's) by dept + running total vs budget. */
export function dailyCostReport(costs: CostEntry[], opts: { date?: string; shootDay?: number }, budget: number) {
  const today = costs.filter(c => (opts.date && c.date === opts.date) || (opts.shootDay != null && c.shootDay === opts.shootDay));
  const upTo = costs.filter(c => !opts.date || c.date <= opts.date);
  const byDept: Record<string, number> = {};
  today.forEach(c => { byDept[c.dept] = (byDept[c.dept] || 0) + c.amountCents; });
  const dayTotal = today.reduce((s, c) => s + c.amountCents, 0);
  const toDate = upTo.reduce((s, c) => s + c.amountCents, 0);
  return { entries: today, byDept, dayTotal, toDate, remaining: budget - toDate };
}

// ── exports ─────────────────────────────────────────────────────────────────
const csvCell = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const toCsv = (rows: unknown[][]) => rows.map(r => r.map(csvCell).join(',')).join('\n');
export function costReportCsv(lines: BudgetLine[], costs: CostEntry[]): string {
  const { rows, totals } = costReport(lines, costs);
  const d = (c: number) => (c / 100).toFixed(2);
  return toCsv([['Department', 'Budget', 'Actual', 'Paid', 'Unpaid', 'Variance'],
    ...[...rows, totals].map(r => [r.dept, d(r.budget), d(r.actual), d(r.paid), d(r.unpaid), d(r.variance)])]);
}
export function downloadText(name: string, text: string, mime = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
/** Printable HTML → browser "Save as PDF". */
export function printHtml(title: string, bodyHtml: string) {
  const w = window.open('', '_blank'); if (!w) return;
  w.document.write(`<html><head><title>${title.replace(/</g, '&lt;')}</title><style>body{font:13px system-ui;padding:24px}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ccc;padding:4px 8px;text-align:left}td.n,th.n{text-align:right}</style></head><body>${bodyHtml}</body></html>`);
  w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
}

// ── persistence ─────────────────────────────────────────────────────────────
const stripUndef = <T extends object>(o: T): T => JSON.parse(JSON.stringify(o));
export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const emptyBudget = (): ProductionBudgetDoc => {
  const id = 'base';
  return { id: 'main', scenarios: [{ id, name: 'Base budget', lines: [] }], activeScenarioId: id, currency: 'usd', updatedAt: Date.now() };
};

export function subBudget(prodId: string, cb: (b: ProductionBudgetDoc | null) => void): () => void {
  try { return onSnapshot(doc(db, 'productions', prodId, 'budget', 'main'), s => cb(s.exists() ? (s.data() as ProductionBudgetDoc) : null), () => cb(null)); }
  catch { return () => {}; }
}
export async function saveBudget(prodId: string, b: ProductionBudgetDoc) {
  await setDoc(doc(db, 'productions', prodId, 'budget', 'main'), stripUndef({ ...b, id: 'main', updatedAt: Date.now(), updatedBy: auth.currentUser?.uid || '' }));
}
export function subCosts(prodId: string, cb: (c: CostEntry[]) => void): () => void {
  try { return onSnapshot(collection(db, 'productions', prodId, 'costs'), s => cb(s.docs.map(d => d.data() as CostEntry).sort((a, b) => b.date.localeCompare(a.date))), () => cb([])); }
  catch { return () => {}; }
}
export async function saveCost(prodId: string, c: CostEntry) {
  await setDoc(doc(db, 'productions', prodId, 'costs', c.id), stripUndef({ ...c, createdBy: c.createdBy || auth.currentUser?.uid || '', updatedAt: Date.now() }));
}
export async function deleteCost(prodId: string, id: string) { await deleteDoc(doc(db, 'productions', prodId, 'costs', id)); }
export async function uploadReceipt(prodId: string, file: File): Promise<string> {
  const uid = auth.currentUser?.uid || 'anon';
  const name = file.name.replace(/[^a-zA-Z0-9._-]/g, '_') || 'receipt';
  return uploadFile(`personal/${uid}/productionReceipts/${prodId}/${Date.now()}_${name}`, file);
}

/** Film price-book starters for Billing (offered by the Finance tab; Billing owns the real price book). */
export const FILM_PRICE_BOOK_DEFAULTS = [
  { name: 'Day rate', unit: 'day', unitAmount: 1000 },
  { name: 'Half-day rate', unit: 'day', unitAmount: 600 },
  { name: 'Usage license (single territory)', unit: 'each', unitAmount: 2500 },
  { name: 'Post-production services', unit: 'hour', unitAmount: 95 },
  { name: 'Equipment package rental', unit: 'day', unitAmount: 350 },
];
