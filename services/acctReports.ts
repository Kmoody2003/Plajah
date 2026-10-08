// acctReports — PURE accounting maths for the Elevate Books (no Firebase, no React): financial
// statements, budget vs actual, fund balances, aging, month-end checklist, Form 990 worksheet, exports.
// Everything is computed in integer cents from posted journals, so every report ties to the trial balance.

import type {
  AcctAccount, AcctBankAccount, AcctBankTxn, AcctBudget, AcctExpense, AcctJournal, AcctJournalLine,
  ChmsBatch, ChmsContribution, ChmsPayout, GivingFund,
} from '../types';
import {
  cents, dollars, isBalanced, offlineGiftEntry, onlineGiftEntry, depositEntry, reversalOf, periodOf,
  type DraftJournal, type SysAccounts,
} from './acctPosting';
import { addDays, money, round2, todayStr, toCsv, type DateRange } from './chmsFinanceReports';

// ── Context + generic report shape ─────────────────────────────────────────────
export interface BookCtx {
  accounts: AcctAccount[];
  journals: AcctJournal[];
  funds: GivingFund[];
  ministries: { id: string; name: string }[];
}

export type Cell = number | string | null;
export interface RptRow {
  label: string;
  v?: Cell[];
  level?: 0 | 1 | 2;
  kind?: 'section' | 'line' | 'subtotal' | 'total' | 'note';
  accountId?: string;
  flag?: 'good' | 'warn' | 'bad';
}
export interface Rpt { id: string; title: string; subtitle: string; labelHeader: string; columns: string[]; rows: RptRow[]; notes?: string[] }

const sec = (label: string): RptRow => ({ label, kind: 'section' });
const line = (label: string, v: Cell[], extra: Partial<RptRow> = {}): RptRow => ({ label, v, kind: 'line', level: 1, ...extra });
const sub = (label: string, v: Cell[]): RptRow => ({ label, v, kind: 'subtotal', level: 0 });
const tot = (label: string, v: Cell[]): RptRow => ({ label, v, kind: 'total', level: 0 });
const d$ = (c: number) => dollars(c);

// ── Fiscal calendar ────────────────────────────────────────────────────────────
/** fiscalYear = the calendar year in which the fiscal year STARTS (== calendar year when it starts in January). */
export function fiscalMonths(fy: number, startMonth = 1): string[] {
  const out: string[] = [];
  for (let i = 0; i < 12; i++) { const m0 = startMonth - 1 + i; out.push(`${fy + Math.floor(m0 / 12)}-${String((m0 % 12) + 1).padStart(2, '0')}`); }
  return out;
}
export function fiscalYearOf(date: string, startMonth = 1): number {
  const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7));
  return m >= startMonth ? y : y - 1;
}
export function fiscalYearRange(fy: number, startMonth = 1): DateRange {
  const ms = fiscalMonths(fy, startMonth);
  const last = ms[11]; const [ly, lm] = last.split('-').map(Number);
  const to = todayStr(new Date(ly, lm, 0));
  return { from: `${ms[0]}-01`, to, label: startMonth === 1 ? `FY${fy}` : `FY${fy}–${String(fy + 1).slice(2)}` };
}
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = []; let y = Number(from.slice(0, 4)), m = Number(from.slice(5, 7));
  const ey = Number(to.slice(0, 4)), em = Number(to.slice(5, 7));
  while (y < ey || (y === ey && m <= em)) { out.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++; } }
  return out;
}
export const monthLabel = (p: string) => new Date(Number(p.slice(0, 4)), Number(p.slice(5, 7)) - 1, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' });
export const periodRange = (p: string): DateRange => { const y = Number(p.slice(0, 4)), m = Number(p.slice(5, 7)); return { from: `${p}-01`, to: todayStr(new Date(y, m, 0)), label: monthLabel(p) }; };

export interface RangePreset { key: string; label: string; range: DateRange }
export function rangePresets(today = todayStr(), startMonth = 1): RangePreset[] {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  const cur = periodRange(today.slice(0, 7));
  const prevP = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  const qStart = Math.floor((m - 1) / 3) * 3 + 1;
  const q = { from: `${y}-${String(qStart).padStart(2, '0')}-01`, to: todayStr(new Date(y, qStart + 2, 0)), label: `Q${Math.floor((m - 1) / 3) + 1} ${y}` };
  const pqS = qStart - 3; const pqY = pqS < 1 ? y - 1 : y; const pqM = pqS < 1 ? pqS + 12 : pqS;
  const pq = { from: `${pqY}-${String(pqM).padStart(2, '0')}-01`, to: todayStr(new Date(pqY, pqM + 2, 0)), label: `Q${Math.floor((pqM - 1) / 3) + 1} ${pqY}` };
  const fy = fiscalYearOf(today, startMonth);
  const fyr = fiscalYearRange(fy, startMonth);
  return [
    { key: 'month', label: 'This month', range: cur },
    { key: 'lastmonth', label: 'Last month', range: periodRange(prevP) },
    { key: 'quarter', label: 'This quarter', range: q },
    { key: 'lastquarter', label: 'Last quarter', range: pq },
    { key: 'ytd', label: 'Year to date', range: { ...fyr, to: today, label: `${fyr.label} YTD` } },
    { key: 'fy', label: 'Full fiscal year', range: fyr },
    { key: 'lastfy', label: 'Last fiscal year', range: fiscalYearRange(fy - 1, startMonth) },
  ];
}
/** The comparison window: the equal-length period immediately before, or the same dates a year earlier. */
export function comparisonRange(r: DateRange, mode: 'prior' | 'lastyear'): DateRange {
  if (mode === 'lastyear') {
    const sh = (s: string) => `${Number(s.slice(0, 4)) - 1}${s.slice(4)}`;
    return { from: sh(r.from), to: sh(r.to), label: `${r.label} (prior year)` };
  }
  const len = Math.round((new Date(r.to + 'T00:00:00').getTime() - new Date(r.from + 'T00:00:00').getTime()) / 86400000) + 1;
  return { from: addDays(r.from, -len), to: addDays(r.from, -1), label: 'Prior period' };
}

// ── Aggregation core ───────────────────────────────────────────────────────────
interface Lk { acct: Map<string, AcctAccount>; restricted: (fundId?: string) => boolean; fundName: (id?: string) => string; deptName: (id?: string) => string }
function lookups(ctx: BookCtx): Lk {
  const acct = new Map(ctx.accounts.map(a => [a.id, a]));
  const rf = new Set(ctx.funds.filter(f => f.restricted).map(f => f.id));
  const fn = new Map(ctx.funds.map(f => [f.id, f.name]));
  const dn = new Map(ctx.ministries.map(m => [m.id, m.name]));
  return { acct, restricted: id => !!id && rf.has(id), fundName: id => (id ? fn.get(id) || id : 'General / unassigned'), deptName: id => (id ? dn.get(id) || id : 'No department') };
}
const inR = (d: string, r: { from: string; to: string }) => d >= r.from && d <= r.to;
const accountsByCode = (accts: AcctAccount[]) => [...accts].sort((a, b) => a.code.localeCompare(b.code));

/** Net debit-minus-credit in cents per account over journals matching `pred`. */
function netByAccount(journals: AcctJournal[], pred: (j: AcctJournal) => boolean, linePred?: (l: AcctJournalLine) => boolean): Map<string, number> {
  const m = new Map<string, number>();
  for (const j of journals) { if (!pred(j)) continue; for (const l of j.lines) { if (linePred && !linePred(l)) continue; m.set(l.accountId, (m.get(l.accountId) || 0) + cents(l.debit) - cents(l.credit)); } }
  return m;
}
/** Surplus (revenue − expense) in cents, split by donor restriction of the fund on the line. */
function surplus(ctx: BookCtx, lk: Lk, pred: (j: AcctJournal) => boolean): { without: number; withR: number } {
  let w = 0, r = 0;
  for (const j of ctx.journals) {
    if (!pred(j)) continue;
    for (const l of j.lines) {
      const a = lk.acct.get(l.accountId); if (!a || (a.type !== 'REVENUE' && a.type !== 'EXPENSE')) continue;
      const v = cents(l.credit) - cents(l.debit);
      if (lk.restricted(l.fundId)) r += v; else w += v;
    }
  }
  return { without: w, withR: r };
}
function netAssetsByClass(ctx: BookCtx, lk: Lk, upTo: string): { without: number; withR: number; equityWithout: number; equityWith: number; sWithout: number; sWith: number } {
  const net = netByAccount(ctx.journals, j => j.date <= upTo);
  let ew = 0, er = 0;
  for (const a of ctx.accounts) if (a.type === 'NET_ASSET') { const v = -(net.get(a.id) || 0); if (a.subtype === 'restricted') er += v; else ew += v; }
  const s = surplus(ctx, lk, j => j.date <= upTo);
  return { without: ew + s.without, withR: er + s.withR, equityWithout: ew, equityWith: er, sWithout: s.without, sWith: s.withR };
}
const isCashAcct = (a: AcctAccount) => a.type === 'ASSET' && (a.subtype === 'cash' || a.systemKey === 'CASH_OPERATING');

// ── 1. Statement of Financial Position ─────────────────────────────────────────
export function financialPosition(ctx: BookCtx, asOf: string, compareAsOf?: string): Rpt {
  const lk = lookups(ctx);
  const dates = compareAsOf ? [asOf, compareAsOf] : [asOf];
  const nets = dates.map(d => netByAccount(ctx.journals, j => j.date <= d));
  const nas = dates.map(d => netAssetsByClass(ctx, lk, d));
  const rows: RptRow[] = [];
  const accts = accountsByCode(ctx.accounts);
  const block = (type: 'ASSET' | 'LIABILITY', sign: 1 | -1): Cell[] => {
    const totals = dates.map(() => 0);
    for (const a of accts.filter(x => x.type === type)) {
      const vals = nets.map(n => (sign * (n.get(a.id) || 0)));
      if (vals.every(v => v === 0)) continue;
      rows.push(line(`${a.code} · ${a.name}`, vals.map(d$), { accountId: a.id }));
      vals.forEach((v, i) => { totals[i] += v; });
    }
    return totals.map(d$);
  };
  rows.push(sec('Assets'));
  const ta = block('ASSET', 1); rows.push(sub('Total assets', ta));
  rows.push(sec('Liabilities'));
  const tl = block('LIABILITY', -1); rows.push(sub('Total liabilities', tl));
  rows.push(sec('Net assets'));
  rows.push(line('Without donor restrictions', nas.map(n => d$(n.without)), { level: 1 }));
  rows.push({ label: 'Opening / equity accounts', v: nas.map(n => d$(n.equityWithout)), level: 2, kind: 'line' });
  rows.push({ label: 'Surplus (deficit) since books began', v: nas.map(n => d$(n.sWithout)), level: 2, kind: 'line' });
  rows.push(line('With donor restrictions', nas.map(n => d$(n.withR)), { level: 1 }));
  rows.push({ label: 'Restricted equity accounts', v: nas.map(n => d$(n.equityWith)), level: 2, kind: 'line' });
  rows.push({ label: 'Restricted funds net of spending', v: nas.map(n => d$(n.sWith)), level: 2, kind: 'line' });
  const tna = nas.map(n => d$(n.without + n.withR)); rows.push(sub('Total net assets', tna));
  const tlna = dates.map((_, i) => round2(Number(tl[i]) + Number(tna[i])));
  rows.push(tot('Total liabilities and net assets', tlna));
  const notes: string[] = [];
  dates.forEach((d, i) => { if (round2(Number(ta[i]) - tlna[i]) !== 0) notes.push(`As of ${d}: assets and liabilities + net assets differ by ${money(round2(Number(ta[i]) - tlna[i]))} — check the Trial Balance for an unbalanced entry.`); });
  return { id: 'position', title: 'Statement of Financial Position', subtitle: `As of ${asOf}${compareAsOf ? ` · compared with ${compareAsOf}` : ''}`, labelHeader: 'Account', columns: dates, rows, notes };
}

// ── 2. Statement of Activities ─────────────────────────────────────────────────
interface ActTotals { rev: Map<string, { w: number; r: number }>; exp: Map<string, number>; release: number; revW: number; revR: number; expT: number }
function activityTotals(ctx: BookCtx, lk: Lk, range: DateRange): ActTotals {
  const rev = new Map<string, { w: number; r: number }>(); const exp = new Map<string, number>();
  let release = 0, revW = 0, revR = 0, expT = 0;
  for (const j of ctx.journals) {
    if (!inR(j.date, range)) continue;
    for (const l of j.lines) {
      const a = lk.acct.get(l.accountId); if (!a) continue;
      if (a.type === 'REVENUE') {
        const v = cents(l.credit) - cents(l.debit); const e = rev.get(a.id) || { w: 0, r: 0 };
        if (lk.restricted(l.fundId)) { e.r += v; revR += v; } else { e.w += v; revW += v; }
        rev.set(a.id, e);
      } else if (a.type === 'EXPENSE') {
        const v = cents(l.debit) - cents(l.credit); exp.set(a.id, (exp.get(a.id) || 0) + v); expT += v;
        if (lk.restricted(l.fundId)) release += v;
      }
    }
  }
  return { rev, exp, release, revW, revR, expT };
}
export function statementOfActivities(ctx: BookCtx, range: DateRange, compare?: DateRange): Rpt {
  const lk = lookups(ctx); const accts = accountsByCode(ctx.accounts);
  const cur = activityTotals(ctx, lk, range);
  const rows: RptRow[] = [];
  if (compare) {
    const prev = activityTotals(ctx, lk, compare);
    const trio = (a: number, b: number): Cell[] => [d$(a), d$(b), d$(a - b)];
    rows.push(sec('Revenue & support'));
    for (const a of accts.filter(x => x.type === 'REVENUE')) {
      const c = cur.rev.get(a.id), p = prev.rev.get(a.id); if (!c && !p) continue;
      rows.push(line(`${a.code} · ${a.name}`, trio((c?.w || 0) + (c?.r || 0), (p?.w || 0) + (p?.r || 0)), { accountId: a.id }));
    }
    rows.push(sub('Total revenue & support', trio(cur.revW + cur.revR, prev.revW + prev.revR)));
    rows.push(sec('Expenses'));
    for (const a of accts.filter(x => x.type === 'EXPENSE')) {
      const c = cur.exp.get(a.id), p = prev.exp.get(a.id); if (!c && !p) continue;
      rows.push(line(`${a.code} · ${a.name}`, trio(c || 0, p || 0), { accountId: a.id }));
    }
    rows.push(sub('Total expenses', trio(cur.expT, prev.expT)));
    rows.push(tot('Change in net assets', trio(cur.revW + cur.revR - cur.expT, prev.revW + prev.revR - prev.expT)));
    return { id: 'activities', title: 'Statement of Activities', subtitle: `${range.label} vs ${compare.label}`, labelHeader: 'Account', columns: [range.label, compare.label, 'Change'], rows };
  }
  const f3 = (w: number, r: number): Cell[] => [d$(w), d$(r), d$(w + r)];
  rows.push(sec('Revenue & support'));
  for (const a of accts.filter(x => x.type === 'REVENUE')) { const c = cur.rev.get(a.id); if (!c || (c.w === 0 && c.r === 0)) continue; rows.push(line(`${a.code} · ${a.name}`, f3(c.w, c.r), { accountId: a.id })); }
  rows.push(line('Net assets released from restrictions', [d$(cur.release), d$(-cur.release), 0]));
  rows.push(sub('Total revenue, support & releases', f3(cur.revW + cur.release, cur.revR - cur.release)));
  rows.push(sec('Expenses'));
  for (const a of accts.filter(x => x.type === 'EXPENSE')) { const v = cur.exp.get(a.id); if (!v) continue; rows.push(line(`${a.code} · ${a.name}`, [d$(v), 0, d$(v)], { accountId: a.id })); }
  rows.push(sub('Total expenses', f3(cur.expT, 0)));
  const chW = cur.revW + cur.release - cur.expT, chR = cur.revR - cur.release;
  rows.push(tot('Change in net assets', f3(chW, chR)));
  const begin = netAssetsByClass(ctx, lk, addDays(range.from, -1));
  rows.push(line('Net assets, beginning of period', f3(begin.without, begin.withR)));
  rows.push(tot('Net assets, end of period', f3(begin.without + chW, begin.withR + chR)));
  return { id: 'activities', title: 'Statement of Activities', subtitle: range.label + ` (${range.from} to ${range.to})`, labelHeader: 'Account', columns: ['Without donor restrictions', 'With donor restrictions', 'Total'], rows, notes: ['Spending from a donor-restricted fund is shown as a release: it moves from "with" to "without" restrictions.'] };
}

// ── 3. Cash flow (indirect) ────────────────────────────────────────────────────
export function cashFlow(ctx: BookCtx, range: DateRange): Rpt {
  const lk = lookups(ctx); const accts = accountsByCode(ctx.accounts);
  const dNet = netByAccount(ctx.journals, j => inR(j.date, range));
  const s = surplus(ctx, lk, j => inR(j.date, range));
  const rows: RptRow[] = [];
  const change = s.without + s.withR;
  let op = change, inv = 0, fin = 0;
  rows.push(sec('Operating activities'));
  rows.push(line('Change in net assets', [d$(change)]));
  for (const a of accts) {
    const dn = dNet.get(a.id) || 0; if (dn === 0) continue;
    if (a.type === 'ASSET' && !isCashAcct(a) && a.subtype !== 'fixed') { op -= dn; rows.push(line(`${dn > 0 ? 'Increase' : 'Decrease'} in ${a.name}`, [d$(-dn)], { level: 2, accountId: a.id })); }
    if (a.type === 'LIABILITY') { op -= dn; rows.push(line(`${dn < 0 ? 'Increase' : 'Decrease'} in ${a.name}`, [d$(-dn)], { level: 2, accountId: a.id })); }
  }
  rows.push(sub('Net cash from operating activities', [d$(op)]));
  rows.push(sec('Investing activities'));
  for (const a of accts.filter(x => x.type === 'ASSET' && x.subtype === 'fixed')) { const dn = dNet.get(a.id) || 0; if (!dn) continue; inv -= dn; rows.push(line(`${dn > 0 ? 'Purchase of' : 'Sale of'} ${a.name}`, [d$(-dn)], { accountId: a.id })); }
  rows.push(sub('Net cash from investing activities', [d$(inv)]));
  rows.push(sec('Financing & equity activities'));
  for (const a of accts.filter(x => x.type === 'NET_ASSET')) { const dn = dNet.get(a.id) || 0; if (!dn) continue; fin -= dn; rows.push(line(a.name + ' (opening balances / adjustments)', [d$(-dn)], { accountId: a.id })); }
  rows.push(sub('Net cash from financing & equity', [d$(fin)]));
  const netChange = op + inv + fin;
  const cashIds = new Set(ctx.accounts.filter(isCashAcct).map(a => a.id));
  const beginCash = [...netByAccount(ctx.journals, j => j.date < range.from)].filter(([id]) => cashIds.has(id)).reduce((t, [, v]) => t + v, 0);
  const endCash = [...netByAccount(ctx.journals, j => j.date <= range.to)].filter(([id]) => cashIds.has(id)).reduce((t, [, v]) => t + v, 0);
  rows.push(tot('Net change in cash', [d$(netChange)]));
  rows.push(line('Cash at beginning of period', [d$(beginCash)]));
  rows.push(tot('Cash at end of period', [d$(beginCash + netChange)]));
  const notes: string[] = [];
  if (beginCash + netChange !== endCash) notes.push(`Cash per books is ${money(d$(endCash))}; the statement computes ${money(d$(beginCash + netChange))}. Review accounts typed as cash.`);
  return { id: 'cashflow', title: 'Statement of Cash Flows (indirect)', subtitle: range.label, labelHeader: 'Activity', columns: ['Amount'], rows, notes };
}

// ── 4. Statement of Functional Expenses (Form 990 Part IX shape) ───────────────
export const FUNC_CLASSES = ['PROGRAM', 'MANAGEMENT', 'FUNDRAISING'] as const;
export function functionalExpenseData(ctx: BookCtx, range: DateRange) {
  const lk = lookups(ctx); const rows: { account: AcctAccount; p: number; m: number; f: number; total: number; unclassified: boolean }[] = [];
  const net = netByAccount(ctx.journals, j => inR(j.date, range));
  for (const a of accountsByCode(ctx.accounts).filter(x => x.type === 'EXPENSE')) {
    const t = net.get(a.id) || 0; if (!t) continue;
    const k = a.functionalClass || 'MANAGEMENT';
    rows.push({ account: a, p: k === 'PROGRAM' ? t : 0, m: k === 'MANAGEMENT' ? t : 0, f: k === 'FUNDRAISING' ? t : 0, total: t, unclassified: !a.functionalClass });
  }
  void lk;
  return rows;
}
export function functionalExpenses(ctx: BookCtx, range: DateRange): Rpt {
  const data = functionalExpenseData(ctx, range);
  const rows: RptRow[] = data.map(r => line(`${r.account.code} · ${r.account.name}${r.unclassified ? ' *' : ''}`, [d$(r.p), d$(r.m), d$(r.f), d$(r.total)], { accountId: r.account.id }));
  const T = data.reduce((t, r) => ({ p: t.p + r.p, m: t.m + r.m, f: t.f + r.f, total: t.total + r.total }), { p: 0, m: 0, f: 0, total: 0 });
  rows.push(tot('Total expenses', [d$(T.p), d$(T.m), d$(T.f), d$(T.total)]));
  const pct = (x: number) => (T.total ? `${Math.round((x / T.total) * 100)}%` : '—');
  rows.push({ label: 'Share of total', kind: 'note', v: [pct(T.p), pct(T.m), pct(T.f), T.total ? '100%' : '—'] });
  const notes = ['Program / management / fundraising comes from each expense account\'s functional class (Chart of Accounts).'];
  if (data.some(r => r.unclassified)) notes.push('* No functional class set — counted as Management & general. Set it on the account.');
  return { id: 'functional', title: 'Statement of Functional Expenses', subtitle: range.label, labelHeader: 'Expense', columns: ['Program services', 'Management & general', 'Fundraising', 'Total'], rows, notes };
}

// ── 5. Trial balance ───────────────────────────────────────────────────────────
export function trialBalanceReport(ctx: BookCtx, asOf: string): Rpt {
  const net = netByAccount(ctx.journals, j => j.date <= asOf);
  const rows: RptRow[] = []; let D = 0, C = 0;
  for (const a of accountsByCode(ctx.accounts)) {
    const n = net.get(a.id) || 0; if (!n) continue;
    if (n > 0) D += n; else C += -n;
    rows.push(line(`${a.code} · ${a.name}`, [n > 0 ? d$(n) : null, n < 0 ? d$(-n) : null], { accountId: a.id }));
  }
  rows.push(tot('Totals', [d$(D), d$(C)]));
  return { id: 'tb', title: 'Trial Balance', subtitle: `As of ${asOf}`, labelHeader: 'Account', columns: ['Debit', 'Credit'], rows, notes: D === C ? ['In balance: total debits equal total credits.'] : [`OUT OF BALANCE by ${money(d$(D - C))}. Find the entry in the Journal tab.`] };
}
export const trialBalanceInBalance = (journals: AcctJournal[]): boolean => journals.every(j => j.lines.reduce((s, l) => s + cents(l.debit) - cents(l.credit), 0) === 0);

// ── 6. General ledger / account register ───────────────────────────────────────
export function generalLedger(ctx: BookCtx, accountId: string, range: DateRange): Rpt {
  const lk = lookups(ctx); const a = lk.acct.get(accountId);
  const sign = a && (a.type === 'ASSET' || a.type === 'EXPENSE') ? 1 : -1;
  const opening = [...ctx.journals].filter(j => j.date < range.from).reduce((t, j) => t + j.lines.filter(l => l.accountId === accountId).reduce((s, l) => s + cents(l.debit) - cents(l.credit), 0), 0) * sign;
  let run = opening;
  const rows: RptRow[] = [{ label: 'Opening balance', kind: 'subtotal', v: ['', null, null, d$(run)] }];
  const js = ctx.journals.filter(j => inR(j.date, range) && j.lines.some(l => l.accountId === accountId)).sort((x, y) => x.date.localeCompare(y.date) || x.createdAt - y.createdAt);
  for (const j of js) for (const l of j.lines.filter(x => x.accountId === accountId)) {
    run += (cents(l.debit) - cents(l.credit)) * sign;
    const dim = [l.fundId ? lk.fundName(l.fundId) : '', l.deptId ? lk.deptName(l.deptId) : ''].filter(Boolean).join(' / ');
    rows.push(line(`${j.date} · ${j.memo}${j.status === 'REVERSED' ? ' (reversed)' : ''}`, [dim, l.debit || null, l.credit || null, d$(run)]));
  }
  rows.push(tot('Closing balance', ['', null, null, d$(run)]));
  return { id: 'gl', title: `General Ledger — ${a ? `${a.code} ${a.name}` : accountId}`, subtitle: range.label, labelHeader: 'Date · description', columns: ['Fund / department', 'Debit', 'Credit', 'Balance'], rows };
}

// ── 7. Fund balances ───────────────────────────────────────────────────────────
export interface FundBal { fundId: string; name: string; restricted: boolean; begin: number; income: number; spending: number; end: number }
export function fundBalanceData(ctx: BookCtx, range: DateRange): FundBal[] {
  const lk = lookups(ctx); const map = new Map<string, { begin: number; income: number; spending: number }>();
  const get = (id: string) => { let e = map.get(id); if (!e) { e = { begin: 0, income: 0, spending: 0 }; map.set(id, e); } return e; };
  for (const f of ctx.funds) get(f.id);
  for (const j of ctx.journals) for (const l of j.lines) {
    if (j.date > range.to) continue;
    const a = lk.acct.get(l.accountId); if (!a) continue;
    const id = l.fundId || '_none'; const e = get(id);
    if (a.type === 'REVENUE') { const v = cents(l.credit) - cents(l.debit); if (j.date < range.from) e.begin += v; else e.income += v; }
    else if (a.type === 'EXPENSE') { const v = cents(l.debit) - cents(l.credit); if (j.date < range.from) e.begin -= v; else e.spending += v; }
    else if (a.type === 'NET_ASSET' && l.fundId) { const v = cents(l.credit) - cents(l.debit); if (j.date < range.from) e.begin += v; else e.income += v; }
  }
  return [...map.entries()].map(([id, e]) => ({ fundId: id, name: id === '_none' ? 'General / unassigned' : lk.fundName(id), restricted: lk.restricted(id), begin: d$(e.begin), income: d$(e.income), spending: d$(e.spending), end: d$(e.begin + e.income - e.spending) }))
    .filter(f => f.begin || f.income || f.spending).sort((a, b) => Number(b.restricted) - Number(a.restricted) || a.name.localeCompare(b.name));
}
export function fundBalances(ctx: BookCtx, range: DateRange): Rpt {
  const data = fundBalanceData(ctx, range);
  const rows: RptRow[] = data.map(f => line(`${f.name}${f.restricted ? ' · restricted' : ''}`, [f.begin, f.income, f.spending, f.end], { flag: f.end < 0 ? 'bad' : undefined }));
  const T = data.reduce((t, f) => ({ b: t.b + f.begin, i: t.i + f.income, s: t.s + f.spending, e: t.e + f.end }), { b: 0, i: 0, s: 0, e: 0 });
  rows.push(tot('All funds', [round2(T.b), round2(T.i), round2(T.s), round2(T.e)]));
  const notes = data.filter(f => f.end < 0).map(f => `${f.name} is overspent by ${money(-f.end)} — it has spent more than it has received.`);
  return { id: 'funds', title: 'Fund Balances', subtitle: range.label, labelHeader: 'Fund', columns: ['Beginning', 'Income', 'Spending (released)', 'Ending balance'], rows, notes };
}

// ── 8. Budget vs actual ────────────────────────────────────────────────────────
export type GroupBy = 'account' | 'dept' | 'fund';
export const budgetFlag = (isRevenue: boolean, budget: number, actual: number): 'good' | 'warn' | 'bad' | undefined => {
  if (!budget) return actual && !isRevenue ? 'bad' : undefined;
  const p = actual / budget;
  if (isRevenue) return p >= 0.95 ? 'good' : p >= 0.8 ? 'warn' : 'bad';
  return p <= 0.9 ? 'good' : p <= 1 ? 'warn' : 'bad';
};
export function budgetVsActual(ctx: BookCtx, budget: AcctBudget | null, range: DateRange, o: { groupBy: GroupBy; deptIds?: string[]; startMonth?: number }): Rpt {
  const lk = lookups(ctx); const dset = o.deptIds ? new Set(o.deptIds) : null;
  const start = o.startMonth || 1;
  const fy = fiscalYearOf(range.from, start);
  const months = new Set(monthsBetween(range.from, range.to));
  const idxMonths = fiscalMonths(budget?.fiscalYear ?? fy, start);
  const keyOf = (accountId: string, deptId?: string, fundId?: string) => o.groupBy === 'account' ? accountId : o.groupBy === 'dept' ? deptId || '' : fundId || '';
  const m = new Map<string, { rev: boolean; b: number; a: number }>();
  const slot = (rev: boolean, k: string) => { const id = `${rev ? 'R' : 'E'}|${k}`; let e = m.get(id); if (!e) { e = { rev, b: 0, a: 0 }; m.set(id, e); } return e; };
  for (const bl of budget?.lines || []) {
    if (dset && !(bl.deptId && dset.has(bl.deptId))) continue;
    const a = lk.acct.get(bl.accountId); if (!a || (a.type !== 'REVENUE' && a.type !== 'EXPENSE')) continue;
    let t = 0; idxMonths.forEach((p, i) => { if (months.has(p)) t += cents(bl.amounts[i] || 0); });
    slot(a.type === 'REVENUE', keyOf(bl.accountId, bl.deptId, bl.fundId)).b += t;
  }
  for (const j of ctx.journals) {
    if (!inR(j.date, range)) continue;
    for (const l of j.lines) {
      const a = lk.acct.get(l.accountId); if (!a || (a.type !== 'REVENUE' && a.type !== 'EXPENSE')) continue;
      if (dset && !(l.deptId && dset.has(l.deptId))) continue;
      const rev = a.type === 'REVENUE';
      slot(rev, keyOf(l.accountId, l.deptId, l.fundId)).a += rev ? cents(l.credit) - cents(l.debit) : cents(l.debit) - cents(l.credit);
    }
  }
  const label = (k: string) => o.groupBy === 'account' ? (lk.acct.get(k) ? `${lk.acct.get(k)!.code} · ${lk.acct.get(k)!.name}` : k) : o.groupBy === 'dept' ? lk.deptName(k || undefined) : lk.fundName(k || undefined);
  const rows: RptRow[] = []; const tt = { rb: 0, ra: 0, eb: 0, ea: 0 };
  for (const rev of [true, false]) {
    rows.push(sec(rev ? 'Revenue' : 'Expenses'));
    const ents = [...m.entries()].filter(([id]) => id.startsWith(rev ? 'R|' : 'E|')).map(([id, e]) => ({ k: id.slice(2), ...e })).sort((x, y) => label(x.k).localeCompare(label(y.k)));
    for (const e of ents) {
      if (!e.b && !e.a) continue;
      const bud = d$(e.b), act = d$(e.a); const varc = rev ? act - bud : bud - act;
      rows.push(line(label(e.k), [bud, act, round2(varc), e.b ? `${Math.round((e.a / e.b) * 100)}%` : '—'], { flag: budgetFlag(rev, e.b, e.a), accountId: o.groupBy === 'account' ? e.k : undefined }));
      if (rev) { tt.rb += e.b; tt.ra += e.a; } else { tt.eb += e.b; tt.ea += e.a; }
    }
    const b = d$(rev ? tt.rb : tt.eb), a = d$(rev ? tt.ra : tt.ea);
    rows.push(sub(rev ? 'Total revenue' : 'Total expenses', [b, a, round2(rev ? a - b : b - a), b ? `${Math.round((a / b) * 100)}%` : '—']));
  }
  rows.push(tot('Net (revenue − expenses)', [round2(d$(tt.rb - tt.eb)), round2(d$(tt.ra - tt.ea)), round2(d$(tt.ra - tt.ea - (tt.rb - tt.eb))), '']));
  const notes = [budget ? `Budget: FY${budget.fiscalYear}. Green = on track, amber = watch (within 10% of limit / revenue 80-95%), red = over budget / behind.` : 'No budget saved for this year yet — create one in the Budgets tab.'];
  return { id: 'budget', title: `Budget vs Actual by ${o.groupBy === 'account' ? 'Account' : o.groupBy === 'dept' ? 'Department' : 'Fund'}`, subtitle: range.label, labelHeader: o.groupBy === 'account' ? 'Account' : o.groupBy === 'dept' ? 'Department' : 'Fund', columns: ['Budget', 'Actual', 'Variance (+ favorable)', '% of budget'], rows, notes };
}
export function budgetHealth(r: Rpt): { good: number; warn: number; bad: number } {
  const h = { good: 0, warn: 0, bad: 0 };
  for (const row of r.rows) if (row.flag) h[row.flag]++;
  return h;
}

// ── 9. Pastor's "simple view" ──────────────────────────────────────────────────
export interface SimpleView {
  range: DateRange; moneyIn: number; moneyOut: number; net: number; cash: number; monthsOfCash: number | null; ratio: number | null;
  givingByFund: { name: string; amount: number }[]; outByCategory: { name: string; amount: number }[]; trend: { month: string; in: number; out: number }[];
}
export function simpleView(ctx: BookCtx, range: DateRange): SimpleView {
  const lk = lookups(ctx); const byFund = new Map<string, number>(); const byCat = new Map<string, number>();
  let inC = 0, outC = 0;
  const monthly = new Map<string, { i: number; o: number }>();
  const trendMonths = monthsBetween(addDays(range.to.slice(0, 7) + '-01', -170), range.to).slice(-6);
  trendMonths.forEach(p => monthly.set(p, { i: 0, o: 0 }));
  for (const j of ctx.journals) for (const l of j.lines) {
    const a = lk.acct.get(l.accountId); if (!a || (a.type !== 'REVENUE' && a.type !== 'EXPENSE')) continue;
    const v = a.type === 'REVENUE' ? cents(l.credit) - cents(l.debit) : cents(l.debit) - cents(l.credit);
    const mo = monthly.get(periodOf(j.date)); if (mo) { if (a.type === 'REVENUE') mo.i += v; else mo.o += v; }
    if (!inR(j.date, range)) continue;
    if (a.type === 'REVENUE') { inC += v; const k = lk.fundName(l.fundId) === 'General / unassigned' ? a.name : lk.fundName(l.fundId); byFund.set(k, (byFund.get(k) || 0) + v); }
    else { outC += v; byCat.set(a.name, (byCat.get(a.name) || 0) + v); }
  }
  const cashIds = new Set(ctx.accounts.filter(isCashAcct).map(a => a.id));
  const cash = ctx.journals.filter(j => j.date <= range.to).reduce((t, j) => t + j.lines.filter(l => cashIds.has(l.accountId)).reduce((s, l) => s + cents(l.debit) - cents(l.credit), 0), 0);
  const days = Math.max(1, Math.round((new Date(range.to + 'T00:00:00').getTime() - new Date(range.from + 'T00:00:00').getTime()) / 86400000) + 1);
  const monthlyBurn = outC > 0 ? (outC / days) * 30.4 : 0;
  const top = (m: Map<string, number>) => [...m.entries()].map(([name, v]) => ({ name, amount: d$(v) })).filter(x => x.amount !== 0).sort((a, b) => b.amount - a.amount);
  return {
    range, moneyIn: d$(inC), moneyOut: d$(outC), net: d$(inC - outC), cash: d$(cash), monthsOfCash: monthlyBurn > 0 ? Math.round((cash / monthlyBurn) * 10) / 10 : null,
    ratio: outC > 0 ? Math.round((inC / outC) * 100) / 100 : null, givingByFund: top(byFund), outByCategory: top(byCat),
    trend: trendMonths.map(p => ({ month: p, in: d$(monthly.get(p)!.i), out: d$(monthly.get(p)!.o) })),
  };
}
export function simpleViewReport(s: SimpleView): Rpt {
  const rows: RptRow[] = [sec('Money in'), ...s.givingByFund.map(x => line(x.name, [x.amount])), sub('Total money in', [s.moneyIn]), sec('Money out'), ...s.outByCategory.map(x => line(x.name, [x.amount])), sub('Total money out', [s.moneyOut]), tot('Left over (in − out)', [s.net]), line('Cash in the bank today', [s.cash])];
  return { id: 'simple', title: 'Giving vs Spending — Pastor overview', subtitle: s.range.label, labelHeader: 'What', columns: ['Amount'], rows };
}

// ── 10. Aging ──────────────────────────────────────────────────────────────────
export interface AgingItem { name: string; due: string; amount: number }
export function agingReport(title: string, items: AgingItem[], asOf: string): Rpt {
  const buckets = ['Current', '1–30', '31–60', '61–90', '90+'];
  const by = new Map<string, number[]>();
  for (const it of items) {
    const late = Math.round((new Date(asOf + 'T00:00:00').getTime() - new Date(it.due + 'T00:00:00').getTime()) / 86400000);
    const b = late <= 0 ? 0 : late <= 30 ? 1 : late <= 60 ? 2 : late <= 90 ? 3 : 4;
    const arr = by.get(it.name) || [0, 0, 0, 0, 0]; arr[b] += it.amount; by.set(it.name, arr);
  }
  const rows: RptRow[] = [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([n, a]) => line(n, [...a.map(round2), round2(a.reduce((s, x) => s + x, 0))]));
  const T = [0, 0, 0, 0, 0]; by.forEach(a => a.forEach((v, i) => { T[i] += v; }));
  rows.push(tot('Total', [...T.map(round2), round2(T.reduce((s, x) => s + x, 0))]));
  return { id: 'aging', title, subtitle: `As of ${asOf}`, labelHeader: 'Payee', columns: [...buckets, 'Total'], rows };
}
export function apAging(expenses: AcctExpense[], asOf: string): Rpt {
  const items = expenses.filter(e => (e.kind === 'BILL' || e.kind === 'REIMBURSEMENT') && (e.status === 'APPROVED' || e.status === 'SUBMITTED') && !e.paidAt)
    .map(e => ({ name: e.vendorName || e.submittedByName || 'Unknown payee', due: e.dueDate || e.date, amount: e.amount }));
  const r = agingReport('Accounts Payable Aging', items, asOf);
  if (!items.length) r.notes = ['No unpaid bills — nothing owed.'];
  return r;
}

// ── Form 990 worksheet ─────────────────────────────────────────────────────────
const L990: [RegExp, string][] = [
  [/grant|missions|benevolence|assistance/i, 'Part IX line 1–3 · Grants & assistance'],
  [/housing|pastoral/i, 'Part IX line 7 · Other salaries & wages (incl. housing)'],
  [/salar|wage|payroll(?!.*tax)/i, 'Part IX line 7 · Other salaries & wages'],
  [/payroll tax|benefit|pension|retire/i, 'Part IX lines 8–10 · Pension, benefits & payroll taxes'],
  [/professional|legal|accounting|audit|fees for/i, 'Part IX line 11 · Fees for services'],
  [/office|admin|supplies/i, 'Part IX line 13 · Office expenses'],
  [/media|technology|software|internet|it\b/i, 'Part IX line 14 · Information technology'],
  [/utilit|building|maintenance|repair|rent|occupancy/i, 'Part IX line 16 · Occupancy'],
  [/insurance/i, 'Part IX line 23 · Insurance'],
];
export const form990Line = (a: AcctAccount): string => (L990.find(([re]) => re.test(a.name)) || [null, 'Part IX line 24 · All other expenses'])[1] as string;
export function form990Worksheet(ctx: BookCtx, range: DateRange): Rpt {
  const rows: RptRow[] = []; const net = netByAccount(ctx.journals, j => inR(j.date, range));
  const accts = accountsByCode(ctx.accounts);
  rows.push(sec('Part VIII — Statement of Revenue'));
  let revTotal = 0;
  for (const a of accts.filter(x => x.type === 'REVENUE')) {
    const v = -(net.get(a.id) || 0); if (!v) continue; revTotal += v;
    const lbl = a.subtype === 'giving' ? 'Line 1 · Contributions, gifts, grants' : /rental/i.test(a.name) ? 'Line 2/6 · Rental / program service income' : /store|event/i.test(a.name) ? 'Line 2 · Program service revenue / Line 8 fundraising events' : 'Line 11 · Other revenue';
    rows.push(line(`${lbl}  —  ${a.name}`, [d$(v)], { accountId: a.id }));
  }
  rows.push(sub('Line 12 · Total revenue', [d$(revTotal)]));
  rows.push(sec('Part IX — Statement of Functional Expenses'));
  const fx = functionalExpenseData(ctx, range); let T = 0, P = 0, M = 0, F = 0;
  const byLine = new Map<string, { p: number; m: number; f: number; t: number }>();
  for (const r of fx) { const k = form990Line(r.account); const e = byLine.get(k) || { p: 0, m: 0, f: 0, t: 0 }; e.p += r.p; e.m += r.m; e.f += r.f; e.t += r.total; byLine.set(k, e); T += r.total; P += r.p; M += r.m; F += r.f; }
  [...byLine.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([k, e]) => rows.push(line(`${k}  [program ${money(d$(e.p))} · mgmt ${money(d$(e.m))} · fundraising ${money(d$(e.f))}]`, [d$(e.t)])));
  rows.push(sub('Line 25 · Total functional expenses', [d$(T)]));
  rows.push(line('Column (B) Program service expenses', [d$(P)]));
  rows.push(line('Column (C) Management & general', [d$(M)]));
  rows.push(line('Column (D) Fundraising', [d$(F)]));
  rows.push(tot('Line 18 · Revenue less expenses', [d$(revTotal - T)]));
  rows.push(sec('Part X — Balance Sheet (end of period)'));
  const bal = netByAccount(ctx.journals, j => j.date <= range.to); const lk = lookups(ctx);
  const cashIds = ctx.accounts.filter(isCashAcct); let cashT = 0, otherA = 0, fixed = 0, liab = 0;
  for (const a of ctx.accounts) { const v = bal.get(a.id) || 0; if (a.type === 'ASSET') { if (isCashAcct(a)) cashT += v; else if (a.subtype === 'fixed') fixed += v; else otherA += v; } if (a.type === 'LIABILITY') liab += -v; }
  rows.push(line('Line 1 · Cash — non-interest-bearing', [d$(cashT)]));
  rows.push(line('Line 15 · Other assets (clearing, receivables)', [d$(otherA)]));
  rows.push(line('Line 10 · Land, buildings & equipment (net)', [d$(fixed)]));
  rows.push(sub('Line 16 · Total assets', [d$(cashT + otherA + fixed)]));
  rows.push(line('Line 17–25 · Total liabilities', [d$(liab)]));
  const na = netAssetsByClass(ctx, lk, range.to);
  rows.push(line('Line 27 · Net assets without donor restrictions', [d$(na.without)]));
  rows.push(line('Line 28 · Net assets with donor restrictions', [d$(na.withR)]));
  rows.push(tot('Line 33 · Total liabilities and net assets', [d$(liab + na.without + na.withR)]));
  void cashIds;
  return { id: 'f990', title: 'Form 990 Data Worksheet', subtitle: `${range.label} — a worksheet to hand your preparer, NOT a filed return`, labelHeader: '990 line', columns: ['Amount'], rows, notes: ['Mapping is by account name/type; your CPA should confirm each line. Churches are generally not required to file Form 990, but many nonprofits and affiliated organizations are.'] };
}

// ── Draft builders (pure; the service posts them) ──────────────────────────────
export interface ManualLineInput { accountId: string; debit: number; credit: number; fundId?: string; deptId?: string; memo?: string }
export function buildManualDraft(i: { date: string; memo: string; lines: ManualLineInput[]; key: string; kind?: 'MANUAL' | 'OPENING' }): DraftJournal {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.date)) throw new Error('Enter a valid date.');
  if (!i.memo.trim()) throw new Error('Add a memo so future-you knows why this entry exists.');
  const lines = i.lines.filter(l => cents(l.debit) || cents(l.credit)).map(l => ({ ...l, debit: round2(l.debit || 0), credit: round2(l.credit || 0) }));
  if (lines.length < 2) throw new Error('An entry needs at least two lines.');
  if (lines.some(l => !l.accountId)) throw new Error('Every line needs an account.');
  if (lines.some(l => l.debit < 0 || l.credit < 0)) throw new Error('Amounts cannot be negative — use the other column instead.');
  if (lines.some(l => cents(l.debit) && cents(l.credit))) throw new Error('A line is either a debit or a credit, not both.');
  const diff = lines.reduce((s, l) => s + cents(l.debit) - cents(l.credit), 0);
  if (diff !== 0) throw new Error(`Debits and credits differ by ${money(Math.abs(dollars(diff)))}. They must be equal.`);
  const clean = lines.map(l => { const o: AcctJournalLine = { accountId: l.accountId, debit: l.debit, credit: l.credit }; if (l.fundId) o.fundId = l.fundId; if (l.deptId) o.deptId = l.deptId; if (l.memo?.trim()) o.memo = l.memo.trim(); return o; });
  return { date: i.date, period: periodOf(i.date), memo: i.memo.trim(), lines: clean, source: { kind: i.kind || 'MANUAL' }, key: i.key };
}
export interface OpeningInput { accountId: string; amount: number; fundId?: string }
/** Opening balances: assets as debits; liabilities/net assets as credits; any difference plugs to Opening Balance Equity. */
export function buildOpeningDraft(sys: SysAccounts, accounts: AcctAccount[], date: string, bal: OpeningInput[], key = 'opening:v1'): DraftJournal {
  const byId = new Map(accounts.map(a => [a.id, a]));
  const lines: AcctJournalLine[] = [];
  for (const b of bal) {
    const a = byId.get(b.accountId); if (!a || !cents(b.amount)) continue;
    const debitNormal = a.type === 'ASSET' || a.type === 'EXPENSE';
    const amt = round2(Math.abs(b.amount)); const asDebit = debitNormal ? b.amount > 0 : b.amount < 0;
    const l: AcctJournalLine = { accountId: a.id, debit: asDebit ? amt : 0, credit: asDebit ? 0 : amt }; if (b.fundId) l.fundId = b.fundId; lines.push(l);
  }
  if (!lines.length) throw new Error('Enter at least one opening balance.');
  const diff = lines.reduce((s, l) => s + cents(l.debit) - cents(l.credit), 0);
  if (diff !== 0) {
    const eq = sys.OPENING_BALANCE; if (!eq) throw new Error('Missing Opening Balance Equity account — run chart setup first.');
    lines.push({ accountId: eq, debit: diff < 0 ? dollars(-diff) : 0, credit: diff > 0 ? dollars(diff) : 0 });
  }
  return { date, period: periodOf(date), memo: 'Opening balances', lines, source: { kind: 'OPENING' }, key };
}

// ── Gift → journal gap detection ───────────────────────────────────────────────
export const isOnlineGift = (c: Pick<ChmsContribution, 'method' | 'stripePaymentId'>) => c.method === 'ONLINE' || !!c.stripePaymentId;
export interface GiftSyncPlan { drafts: DraftJournal[]; reversals: AcctJournal[]; waiting: number; errors: string[] }
export function planGiftJournals(i: { contributions: ChmsContribution[]; batches: ChmsBatch[]; journals: AcctJournal[]; sys: SysAccounts }): GiftSyncPlan {
  const byKey = new Map<string, AcctJournal>(); i.journals.forEach(j => { if (j.key) byKey.set(j.key, j); });
  const batch = new Map(i.batches.map(b => [b.id, b]));
  const drafts: DraftJournal[] = []; const reversals: AcctJournal[] = []; const errors: string[] = []; let waiting = 0;
  const attempt = (fn: () => DraftJournal) => { try { drafts.push(fn()); } catch (e: any) { if (!errors.includes(e?.message)) errors.push(e?.message || 'Could not build entry'); } };
  for (const c of i.contributions) {
    const key = `contrib:${c.id}`; const ex = byKey.get(key);
    if (c.status === 'VOID') { if (ex && ex.status === 'POSTED' && !byKey.has(`reversal:${ex.id}`)) reversals.push(ex); continue; }
    if (ex) continue;
    const online = isOnlineGift(c); const b = c.batchId ? batch.get(c.batchId) : undefined;
    if (!online && b && b.status !== 'POSTED' && b.status !== 'DEPOSITED') { waiting++; continue; }
    if (!(c.amount > 0)) continue;
    attempt(() => online
      ? onlineGiftEntry(i.sys, { id: c.id, date: c.date, amount: round2(c.amount), fundId: c.fundId, fundName: c.fundName, stripePaymentId: c.stripePaymentId })
      : offlineGiftEntry(i.sys, { id: c.id, date: c.date, amount: round2(c.amount), fundId: c.fundId, fundName: c.fundName, method: c.method }));
  }
  for (const b of i.batches) {
    if (b.status !== 'DEPOSITED' || byKey.has(`deposit:${b.id}`)) continue;
    const amt = round2(i.contributions.filter(c => c.batchId === b.id && c.status !== 'VOID' && !isOnlineGift(c)).reduce((s, c) => s + c.amount, 0));
    if (amt > 0) attempt(() => depositEntry(i.sys, { batchId: b.id, date: b.depositedAt ? todayStr(new Date(b.depositedAt)) : b.date, amount: amt }));
  }
  return { drafts, reversals, waiting, errors };
}
export { reversalOf };

// ── Month-end close checklist ──────────────────────────────────────────────────
export type FixTarget = 'journal' | 'bank' | 'reports' | 'setup' | 'budgets' | 'finance:batches' | 'finance:reconcile' | 'finance:spending';
export interface CloseItem { key: string; label: string; ok: boolean; severity: 'block' | 'warn'; detail: string; fix?: { target: FixTarget; label: string } }
export function closeChecklist(i: {
  period: string; contributions: ChmsContribution[]; batches: ChmsBatch[]; journals: AcctJournal[]; sys: SysAccounts; payouts: ChmsPayout[];
  bankAccounts: AcctBankAccount[]; bankTxns: AcctBankTxn[]; expenses: AcctExpense[];
}): CloseItem[] {
  const pr = periodRange(i.period); const inP = (d: string) => inR(d, pr);
  const out: CloseItem[] = [];
  const plan = planGiftJournals({ contributions: i.contributions, batches: i.batches, journals: i.journals, sys: i.sys });
  const openBatches = i.batches.filter(b => (b.status === 'OPEN' || b.status === 'BALANCED') && inP(b.date));
  out.push({ key: 'batches-posted', label: 'All gift batches are posted', ok: openBatches.length === 0, severity: 'block', detail: openBatches.length ? `${openBatches.length} batch(es) still open: ${openBatches.slice(0, 3).map(b => b.name).join(', ')}` : 'Every batch dated this month is posted.', fix: openBatches.length ? { target: 'finance:batches', label: 'Open Batches' } : undefined });
  const undep = i.batches.filter(b => b.status === 'POSTED' && inP(b.date));
  out.push({ key: 'batches-deposited', label: 'Posted batches are marked deposited', ok: undep.length === 0, severity: 'warn', detail: undep.length ? `${undep.length} posted batch(es) not yet marked deposited.` : 'All deposits recorded.', fix: undep.length ? { target: 'finance:batches', label: 'Mark deposited' } : undefined });
  const missing = plan.drafts.filter(d => inP(d.date)).length;
  out.push({ key: 'gifts-journaled', label: 'Every gift is in the books', ok: missing === 0, severity: 'block', detail: missing ? `${missing} gift/deposit entr${missing === 1 ? 'y is' : 'ies are'} missing a journal — one click posts them.` : 'Gifts and deposits all have journal entries.', fix: missing ? { target: 'setup', label: 'Post missing entries' } : undefined });
  const pay = i.payouts.filter(p => inP(p.arrivalDate) && !p.reconciled && p.status !== 'failed' && p.status !== 'canceled');
  out.push({ key: 'payouts', label: 'Stripe payouts are reconciled', ok: pay.length === 0, severity: 'warn', detail: pay.length ? `${pay.length} payout(s) not matched to the bank yet.` : 'All payouts matched.', fix: pay.length ? { target: 'bank', label: 'Match in Bank tab' } : undefined });
  const banks = i.bankAccounts.filter(b => b.active && b.kind !== 'STRIPE');
  const unmatched = i.bankTxns.filter(t => t.status === 'UNMATCHED' && inP(t.date)).length;
  const unrec = banks.filter(b => !(b as any).lastReconciled || (b as any).lastReconciled.date < pr.to);
  out.push({ key: 'bank', label: 'Bank accounts are reconciled', ok: banks.length > 0 && unmatched === 0 && unrec.length === 0, severity: 'warn', detail: !banks.length ? 'No bank account is set up yet.' : unmatched ? `${unmatched} bank line(s) this month are unmatched.` : unrec.length ? `${unrec.map(b => b.name).join(', ')} not reconciled through ${pr.to}.` : 'Reconciled.', fix: { target: banks.length ? 'bank' : 'setup', label: banks.length ? 'Reconcile' : 'Add bank account' } });
  const pend = i.expenses.filter(e => e.status === 'SUBMITTED' && inP(e.date));
  const unpaid = i.expenses.filter(e => e.status === 'APPROVED' && e.kind !== 'BILL' && inP(e.date) && !e.paidAt);
  out.push({ key: 'expenses', label: 'Expenses are approved and paid', ok: pend.length === 0 && unpaid.length === 0, severity: pend.length ? 'block' : 'warn', detail: pend.length ? `${pend.length} expense(s) waiting for approval.` : unpaid.length ? `${unpaid.length} approved expense(s) not yet paid.` : 'Nothing waiting.', fix: pend.length || unpaid.length ? { target: 'finance:spending', label: 'Open Spending' } : undefined });
  const bad = i.journals.filter(j => inP(j.date) && !isBalanced(j.lines));
  out.push({ key: 'balanced', label: 'All journals balance', ok: bad.length === 0, severity: 'block', detail: bad.length ? `${bad.length} journal(s) are out of balance.` : 'Debits equal credits everywhere.', fix: bad.length ? { target: 'journal', label: 'Review journal' } : undefined });
  out.push({ key: 'statements', label: 'Statements are ready to review', ok: bad.length === 0, severity: 'warn', detail: 'Open Reports to review the Statement of Activities and Financial Position before you lock the month.', fix: { target: 'reports', label: 'Open reports' } });
  return out;
}

/** Year-end extras: giving-statement readiness + org identity. */
export function yearEndReadiness(i: { year: number; contributions: ChmsContribution[]; batches: ChmsBatch[]; journals: AcctJournal[]; sys: SysAccounts; org: { legalName?: string; ein?: string }; openPeriods: string[] }): { key: string; label: string; ok: boolean; detail: string }[] {
  const plan = planGiftJournals({ contributions: i.contributions, batches: i.batches, journals: i.journals, sys: i.sys });
  const yr = String(i.year);
  const gaps = plan.drafts.filter(d => d.date.startsWith(yr)).length;
  const open = i.batches.filter(b => b.date.startsWith(yr) && b.status !== 'POSTED' && b.status !== 'DEPOSITED').length;
  return [
    { key: 'ein', label: 'Legal name and EIN are on file (printed on giving statements)', ok: !!i.org.legalName && !!i.org.ein, detail: i.org.legalName && i.org.ein ? `${i.org.legalName} · ${i.org.ein}` : 'Add them in Finance Hub › Settings.' },
    { key: 'batches', label: `Every ${yr} batch is posted`, ok: open === 0, detail: open ? `${open} batch(es) still open.` : 'All posted.' },
    { key: 'journals', label: `Every ${yr} gift is in the books`, ok: gaps === 0, detail: gaps ? `${gaps} gift entr${gaps === 1 ? 'y' : 'ies'} missing.` : 'Books match the giving ledger.' },
    { key: 'periods', label: 'All twelve months are closed', ok: i.openPeriods.length === 0, detail: i.openPeriods.length ? `Still open: ${i.openPeriods.join(', ')}` : 'All locked.' },
  ];
}

// ── Exports ────────────────────────────────────────────────────────────────────
const fmtCell = (c: Cell | undefined) => c === null || c === undefined ? '' : c;
export function rptToCsv(r: Rpt): string {
  return toCsv([r.labelHeader, ...r.columns], [...r.rows.filter(x => x.kind !== 'section' || true).map(x => [x.label, ...(x.v || r.columns.map(() => '')).map(fmtCell)]), ...(r.notes || []).map(n => ['Note: ' + n])]);
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function rptToHtml(r: Rpt, orgName: string): string {
  const cell = (c: Cell | undefined) => typeof c === 'number' ? `<td class="n${c < 0 ? ' neg' : ''}">${money(c)}</td>` : `<td class="n">${esc(String(fmtCell(c)))}</td>`;
  const body = r.rows.map(x => x.kind === 'section' ? `<tr class="sec"><td colspan="${r.columns.length + 1}">${esc(x.label)}</td></tr>` : `<tr class="${x.kind || 'line'}"><td style="padding-left:${(x.level || 0) * 14 + 6}px">${esc(x.label)}</td>${(x.v || r.columns.map(() => '')).map(cell).join('')}</tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(r.title)}</title><style>
body{font:12px/1.4 -apple-system,Segoe UI,Arial,sans-serif;color:#111;margin:32px}h1{font-size:18px;margin:0}h2{font-size:12px;font-weight:400;color:#555;margin:2px 0 14px}
table{border-collapse:collapse;width:100%}th{text-align:right;font-size:10px;text-transform:uppercase;letter-spacing:.06em;border-bottom:2px solid #111;padding:4px 6px}th:first-child{text-align:left}
td{padding:3px 6px;border-bottom:1px solid #eee}td.n{text-align:right;font-variant-numeric:tabular-nums}.neg{color:#b00}.sec td{font-weight:700;background:#f4f4f4;text-transform:uppercase;font-size:10px;letter-spacing:.06em}
.subtotal td,.total td{font-weight:700;border-top:1px solid #111}.total td{border-bottom:3px double #111}.note td{color:#666;font-style:italic}.foot{margin-top:16px;color:#666;font-size:10px}
@media print{body{margin:12mm}}</style></head><body><h1>${esc(orgName)}</h1><h1>${esc(r.title)}</h1><h2>${esc(r.subtitle)}</h2>
<table><thead><tr><th>${esc(r.labelHeader)}</th>${r.columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>
${(r.notes || []).map(n => `<p class="foot">${esc(n)}</p>`).join('')}<p class="foot">Prepared ${todayStr()} · unaudited management report</p></body></html>`;
}

export function chartCsv(accounts: AcctAccount[]): string {
  return toCsv(['Code', 'Name', 'Type', 'Subtype', 'Functional class', 'Active'], accountsByCode(accounts).map(a => [a.code, a.name, a.type, a.subtype || '', a.functionalClass || '', a.active ? 'yes' : 'no']));
}
export function journalsCsv(ctx: BookCtx, range: DateRange): string {
  const lk = lookups(ctx); const rows: (string | number)[][] = [];
  [...ctx.journals].filter(j => inR(j.date, range)).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt).forEach((j, n) => j.lines.forEach(l => {
    const a = lk.acct.get(l.accountId);
    rows.push([j.date, `J${String(n + 1).padStart(5, '0')}`, j.id, a?.code || '', a?.name || l.accountId, l.debit || '', l.credit || '', l.fundId ? lk.fundName(l.fundId) : '', l.deptId ? lk.deptName(l.deptId) : '', l.memo || j.memo, j.source.kind, j.status]);
  }));
  return toCsv(['Date', 'Entry #', 'Journal id', 'Account code', 'Account', 'Debit', 'Credit', 'Fund', 'Department', 'Memo', 'Source', 'Status'], rows);
}
/** QuickBooks Desktop IIF built from the REAL chart + journals (general-journal transactions). */
export function quickBooksJournalIif(ctx: BookCtx, range: DateRange): string {
  const type = (a: AcctAccount) => a.type === 'ASSET' ? (isCashAcct(a) ? 'BANK' : a.subtype === 'fixed' ? 'FIXASSET' : 'OCASSET') : a.type === 'LIABILITY' ? (a.subtype === 'card' || /credit card/i.test(a.name) ? 'CCARD' : 'OCLIAB') : a.type === 'NET_ASSET' ? 'EQUITY' : a.type === 'REVENUE' ? 'INC' : 'EXP';
  const nm = (a: AcctAccount) => `${a.code} ${a.name}`.replace(/[:\t]/g, ' ');
  const byId = new Map(ctx.accounts.map(a => [a.id, a]));
  const us = (d: string) => `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)}`;
  const L: string[] = ['!ACCNT\tNAME\tACCNTTYPE\tACCNUM', ...accountsByCode(ctx.accounts).map(a => `ACCNT\t${nm(a)}\t${type(a)}\t${a.code}`),
    '!TRNS\tTRNSTYPE\tDATE\tACCNT\tAMOUNT\tMEMO', '!SPL\tTRNSTYPE\tDATE\tACCNT\tAMOUNT\tMEMO', '!ENDTRNS'];
  const js = ctx.journals.filter(j => inR(j.date, range)).sort((a, b) => a.date.localeCompare(b.date));
  for (const j of js) {
    j.lines.forEach((l, i) => {
      const a = byId.get(l.accountId); if (!a) return;
      const amt = (cents(l.debit) - cents(l.credit)) / 100;
      L.push(`${i === 0 ? 'TRNS' : 'SPL'}\tGENERAL JOURNAL\t${us(j.date)}\t${nm(a)}\t${amt.toFixed(2)}\t${(l.memo || j.memo).replace(/[\t\r\n]/g, ' ')}`);
    });
    L.push('ENDTRNS');
  }
  return L.join('\r\n') + '\r\n';
}
