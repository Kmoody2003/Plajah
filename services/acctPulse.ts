// acctPulse — PURE "Budget Pulse" maths for Elevate finance (NO Firebase, NO React) so the dashboard, the print
// snapshot AND server.ts (proactive alert sweep) compute exactly the same numbers.
//
// Everything is deterministic and integer-cents internally; outputs are dollars rounded to the cent.
//
// WHAT COUNTS AS SPEND (per department / account / fund / project)
//   spent      posted EXPENSE-type journal lines (debit - credit) — reversals net out automatically
//   committed  APPROVED expenses/bills not yet journaled (money is promised but not yet in the books)
//   pending    SUBMITTED expenses + open purchase requests (what is coming; shown as its own segment)
//   hard       spent + committed  → drives "% used" and the RED (over budget) state
//   Viewers who cannot read journals (department heads) run in mode 'EXPENSES_ONLY': PAID/journaled
//   expenses stand in for `spent`.
//
// HEALTH COLOUR SCALE (thresholds from financeSettings.budgetWatchPct / budgetRiskPct, defaults 80 / 115)
//   GREEN   on track      pace < 85%  and  used <= 80%
//   YELLOW  watch         pace 85–100%+ (up to risk)  or  used > watchPct
//   ORANGE  at risk       projected period-end > budget  or  pace > riskPct
//   RED     over budget   used > 100% of the period budget
//   NONE    no budget     (spend still shown; "set a budget to unlock pace tracking")
//   pace = hard ÷ budgetToDate  (== spend% ÷ time% for a flat budget; budget-phased for seasonal budgets)
//
// Self-checking examples (budget $1,200/yr flat, today = Jul 1 = 181/365 days; spent $900):
//   assess({budget:1200, budgetToDate:595, spent:900, committed:0, pending:0, daysElapsed:181, daysTotal:365, th})
//     → usedPct 75, pace 1.51 (151%), projected ≈ 1,815.13, overrun ≈ 615.13 → ORANGE, runwayDays 60
//   same with spent $1,250 → usedPct 104 → RED.   spent $300 → pace 0.50 → GREEN.
//   zScore([100,100,110,90,100], 400) ≫ 2.5 → spike.   divide-by-zero cases return null/0, never NaN.

import type {
  AcctAccount, AcctBudget, AcctExpense, AcctJournal, AcctProject, ChmsFinanceSettings, GivingFund, Ministry, RecurringBill,
} from '../types';

// ── Tiny pure helpers (dollars <-> cents, ISO dates) ───────────────────────────────────────────
const toC = (n: number) => Math.round((Number(n) || 0) * 100);
const toD = (c: number) => Math.round(c) / 100;
const sdiv = (a: number, b: number): number => (b ? a / b : 0);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const pad2 = (n: number) => String(n).padStart(2, '0');
const utc = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)) || 1);
export const daysBetween = (a: string, b: string) => Math.round((utc(b) - utc(a)) / 86400000);
export const addDays = (iso: string, n: number) => { const d = new Date(utc(iso) + n * 86400000); return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`; };
const dim = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();   // m = 1..12
export const addMonthsYm = (ym: string, n: number) => { const t = Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1 + n; return `${Math.floor(t / 12)}-${pad2((t % 12) + 1)}`; };
export const monthEnd = (ym: string) => `${ym}-${pad2(dim(Number(ym.slice(0, 4)), Number(ym.slice(5, 7))))}`;
const ymOf = (iso: string) => iso.slice(0, 7);
export const usd0 = (n: number) => (n < 0 ? '-' : '') + '$' + Math.round(Math.abs(n)).toLocaleString('en-US');
export const usd2 = (n: number) => (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const monthShort = (ym: string) => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(ym.slice(5, 7)) - 1] + (ym.slice(5, 7) === '01' ? ` '${ym.slice(2, 4)}` : '');

/** Fiscal calendar (identical rules to services/acctReports: fiscalYear = calendar year in which the FY STARTS). */
export function fiscalMonthsOf(fy: number, startMonth = 1): string[] {
  const out: string[] = [];
  for (let i = 0; i < 12; i++) { const m0 = startMonth - 1 + i; out.push(`${fy + Math.floor(m0 / 12)}-${pad2((m0 % 12) + 1)}`); }
  return out;
}
export const fiscalYearOfDate = (date: string, startMonth = 1) => (Number(date.slice(5, 7)) >= startMonth ? Number(date.slice(0, 4)) : Number(date.slice(0, 4)) - 1);

export const zScore = (hist: number[], x: number): number => {
  if (hist.length < 2) return 0;
  const mean = hist.reduce((s, v) => s + v, 0) / hist.length;
  const sd = Math.sqrt(hist.reduce((s, v) => s + (v - mean) ** 2, 0) / (hist.length - 1));
  const floor = Math.max(sd, Math.abs(mean) * 0.1, 1);   // a flat history must not make every wiggle a "spike"
  return (x - mean) / floor;
};

// ── Status colour scale ────────────────────────────────────────────────────────────────────────
export type PulseStatus = 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED' | 'NONE';
export const STATUS_RANK: Record<PulseStatus, number> = { NONE: 0, GREEN: 1, YELLOW: 2, ORANGE: 3, RED: 4 };
/** Colour + icon + words — the UI always renders all three (never colour alone). Hex values are tuned for dark UI (AA on #0b0b0f). */
export const STATUS_META: Record<PulseStatus, { label: string; short: string; icon: string; hex: string; soft: string }> = {
  GREEN:  { label: 'On track',     short: 'On track', icon: '●', hex: '#4ade80', soft: 'rgba(74,222,128,0.14)' },
  YELLOW: { label: 'Watch',        short: 'Watch',    icon: '▲', hex: '#facc15', soft: 'rgba(250,204,21,0.14)' },
  ORANGE: { label: 'At risk',      short: 'At risk',  icon: '◆', hex: '#fb923c', soft: 'rgba(251,146,60,0.16)' },
  RED:    { label: 'Over budget',  short: 'Over',     icon: '■', hex: '#f87171', soft: 'rgba(248,113,113,0.16)' },
  NONE:   { label: 'No budget',    short: 'No budget', icon: '○', hex: '#94a3b8', soft: 'rgba(148,163,184,0.12)' },
};
export const worst = (a: PulseStatus, b: PulseStatus): PulseStatus => (STATUS_RANK[a] >= STATUS_RANK[b] ? a : b);

export interface PulseThresholds { watchUsedPct: number; riskPacePct: number; paceWatchPct: number; minTimeFrac: number }
export const DEFAULT_THRESHOLDS: PulseThresholds = { watchUsedPct: 80, riskPacePct: 115, paceWatchPct: 85, minTimeFrac: 0.08 };
export function thresholdsOf(fs?: Pick<ChmsFinanceSettings, 'budgetWatchPct' | 'budgetRiskPct'> | null): PulseThresholds {
  const w = Number(fs?.budgetWatchPct), r = Number(fs?.budgetRiskPct);
  return { ...DEFAULT_THRESHOLDS, watchUsedPct: Number.isFinite(w) && w >= 50 && w <= 99 ? w : DEFAULT_THRESHOLDS.watchUsedPct, riskPacePct: Number.isFinite(r) && r >= 100 && r <= 250 ? r : DEFAULT_THRESHOLDS.riskPacePct };
}

// ── The core: assess ONE budget line against the clock ────────────────────────────────────────
export interface AssessIn {
  budget: number;            // period budget ($)
  budgetToDate: number;      // budget that "should" be spent by today (phased by month, prorated within the month)
  spent: number; committed: number; pending: number;
  daysElapsed: number; daysTotal: number;
  recurringRemaining?: number;   // known recurring bills still to come in the period (floor for the projection)
  th?: PulseThresholds;
}
export interface Assessment {
  budget: number; budgetToDate: number; spent: number; committed: number; pending: number; hard: number;
  /** hard ÷ budget × 100, or null when there is no budget. */
  usedPct: number | null;
  /** Share of the period elapsed, 0–100 (calendar) and budget-weighted (where the bar SHOULD be). */
  timePct: number; expectedPct: number;
  /** hard ÷ budgetToDate (1 = exactly on pace); null when there is nothing to pace against. */
  paceRatio: number | null;
  burnPerDay: number;
  projected: number; projectedLinear: number;
  /** projected − budget (negative = projected to finish under). */
  projectedVariance: number; overrun: number; overrunPct: number;
  runwayDays: number | null; daysLeft: number;
  status: PulseStatus; unbudgeted: boolean; paceTrusted: boolean;
  reasons: string[];
}
export function assess(i: AssessIn): Assessment {
  const th = i.th || DEFAULT_THRESHOLDS;
  const B = toC(i.budget), BTD = Math.min(toC(i.budgetToDate), B), S = toC(i.spent), C = toC(i.committed), P = toC(i.pending);
  const H = S + C;
  const daysTotal = Math.max(1, i.daysTotal), daysElapsed = clamp(i.daysElapsed, 0, daysTotal), daysLeft = daysTotal - daysElapsed;
  const timeFrac = daysElapsed / daysTotal;
  const phased = B > 0 ? BTD / B : timeFrac;
  const trusted = phased >= th.minTimeFrac;
  const paceDen = Math.max(BTD, Math.round(B * th.minTimeFrac));
  const pace = B > 0 && paceDen > 0 ? H / paceDen : null;
  const burn = daysElapsed > 0 ? H / daysElapsed : 0;                       // cents / day
  const linear = daysElapsed > 0 ? H + Math.round(burn * daysLeft) : H;
  // Budget-shaped projection: the remaining budget is spent at today's pace (seasonality comes from the phasing).
  const model = B <= 0 ? linear : trusted ? H + Math.round((B - BTD) * (H / Math.max(BTD, 1))) : H + (B - BTD);
  const floor = H + P + toC(i.recurringRemaining || 0);
  const projected = Math.max(model, floor);
  const used = B > 0 ? (H / B) * 100 : null;
  const reasons: string[] = [];
  let status: PulseStatus;
  if (B <= 0) status = 'NONE';
  else if (H > B) { status = 'RED'; reasons.push('Spending has passed the budget.'); }
  else if ((projected > B * 1.005 && (trusted || H + P > B)) || (trusted && pace !== null && pace * 100 > th.riskPacePct)) {
    status = 'ORANGE'; reasons.push(projected > B ? 'On pace to finish over budget.' : 'Spending is running well ahead of the calendar.');
  } else if ((trusted && pace !== null && pace * 100 >= th.paceWatchPct) || (used !== null && used > th.watchUsedPct)) {
    status = 'YELLOW'; reasons.push(used !== null && used > th.watchUsedPct ? `More than ${th.watchUsedPct}% of the budget is used.` : 'Spending is close to the pace of the calendar.');
  } else status = 'GREEN';
  const left = B - H;
  const runway = B <= 0 ? null : left <= 0 ? 0 : burn > 0 ? Math.floor(left / burn) : null;
  const variance = B > 0 ? projected - B : 0;
  return {
    budget: toD(B), budgetToDate: toD(BTD), spent: toD(S), committed: toD(C), pending: toD(P), hard: toD(H),
    usedPct: used === null ? null : Math.round(used * 10) / 10,
    timePct: Math.round(timeFrac * 1000) / 10, expectedPct: Math.round(phased * 1000) / 10,
    paceRatio: pace === null ? null : Math.round(pace * 1000) / 1000,
    burnPerDay: toD(burn), projected: toD(projected), projectedLinear: toD(linear),
    projectedVariance: toD(variance), overrun: toD(Math.max(0, variance)), overrunPct: B > 0 ? Math.round(Math.max(0, variance) / B * 1000) / 10 : 0,
    runwayDays: runway, daysLeft, status, unbudgeted: B <= 0 && H + P > 0, paceTrusted: trusted, reasons,
  };
}

// ── Period windows ─────────────────────────────────────────────────────────────────────────────
export type PulseScope = 'YEAR' | 'QUARTER' | 'MONTH';
export interface PulseWindow { scope: PulseScope; from: string; to: string; key: string; label: string; months: string[]; daysTotal: number; daysElapsed: number; fiscalYear: number; allMonths: string[]; curIdx: number }
export function scopeWindow(fy: number, startMonth: number, today: string, scope: PulseScope = 'YEAR'): PulseWindow {
  const all = fiscalMonthsOf(fy, startMonth);
  const cur = all.indexOf(ymOf(today));
  const curIdx = cur < 0 ? (today < `${all[0]}-01` ? 0 : 11) : cur;
  const a = scope === 'YEAR' ? 0 : scope === 'QUARTER' ? Math.floor(curIdx / 3) * 3 : curIdx;
  const b = scope === 'YEAR' ? 11 : scope === 'QUARTER' ? a + 2 : curIdx;
  const months = all.slice(a, b + 1);
  const from = `${months[0]}-01`, to = monthEnd(months[months.length - 1]);
  const daysTotal = daysBetween(from, to) + 1;
  const daysElapsed = clamp(daysBetween(from, today) + 1, 0, daysTotal);
  const fyLabel = startMonth === 1 ? `FY${fy}` : `FY${fy}-${String(fy + 1).slice(2)}`;
  const key = scope === 'YEAR' ? fyLabel : scope === 'QUARTER' ? `${fyLabel}Q${Math.floor(curIdx / 3) + 1}` : months[0];
  const label = scope === 'YEAR' ? fyLabel : scope === 'QUARTER' ? `Q${Math.floor(curIdx / 3) + 1} of ${fyLabel}` : months[0];
  return { scope, from, to, key, label, months, daysTotal, daysElapsed, fiscalYear: fy, allMonths: all, curIdx };
}
/** Budget for the window + the portion that should be spent by `today` (phased by month, prorated within the current month). */
export function phasedBudget(amounts12: number[], w: PulseWindow, today: string): { total: number; toDate: number } {
  let total = 0, toDate = 0;
  w.months.forEach(m => {
    const idx = w.allMonths.indexOf(m);
    const amt = toC(amounts12[idx] || 0);
    total += amt;
    const ms = `${m}-01`, days = dim(Number(m.slice(0, 4)), Number(m.slice(5, 7)));
    const frac = today >= monthEnd(m) ? 1 : today < ms ? 0 : (daysBetween(ms, today) + 1) / days;
    toDate += Math.round(amt * frac);
  });
  return { total: toD(total), toDate: toD(toDate) };
}
/** Known recurring bills (financeSettings.recurringBills) that will land after `today` and by `to`, for one department. */
export function recurringRemaining(bills: RecurringBill[] | undefined, deptId: string | undefined, today: string, to: string): number {
  let c = 0;
  for (const b of bills || []) {
    if (!b.active || (deptId !== undefined && (b.deptId || GENERAL) !== deptId)) continue;
    let d = b.nextDate, guard = 0;
    while (d <= to && guard++ < 60) {
      if (d > today) c += toC(b.amount);
      const [y, m, dd] = d.split('-').map(Number);
      d = b.frequency === 'WEEKLY' ? addDays(d, 7)
        : b.frequency === 'MONTHLY' ? `${addMonthsYm(d.slice(0, 7), 1)}-${pad2(Math.min(dd, dim(Number(addMonthsYm(d.slice(0, 7), 1).slice(0, 4)), Number(addMonthsYm(d.slice(0, 7), 1).slice(5, 7)))))}`
        : b.frequency === 'QUARTERLY' ? `${addMonthsYm(d.slice(0, 7), 3)}-${pad2(Math.min(dd, 28))}`
        : `${y + 1}-${pad2(m)}-${pad2(Math.min(dd, 28))}`;
    }
  }
  return toD(c);
}

// ── Input / output shapes ─────────────────────────────────────────────────────────────────────
export const GENERAL = '_general';
export type PulseMode = 'FULL' | 'EXPENSES_ONLY';
export interface PulseInput {
  orgId: string; today: string;                       // today = YYYY-MM-DD in the org's timezone
  fiscalYear?: number; startMonth?: number; scope?: PulseScope;
  accounts: Pick<AcctAccount, 'id' | 'code' | 'name' | 'type' | 'subtype' | 'systemKey'>[];
  journals: AcctJournal[]; expenses: AcctExpense[]; budgets: AcctBudget[];
  ministries: Pick<Ministry, 'id' | 'name' | 'headUids'>[];
  funds?: GivingFund[]; projects?: AcctProject[]; recurring?: RecurringBill[];
  settings?: ChmsFinanceSettings | null;
  mode?: PulseMode;
  /** Department heads: only these departments are reported (their own). */
  visibleDeptIds?: string[];
}
export interface PulseTxn { kind: 'JOURNAL' | 'EXPENSE'; id: string; date: string; memo: string; amount: number; accountId: string; fundId?: string; state: 'POSTED' | 'COMMITTED' | 'PENDING'; vendor?: string }
export interface LinePulse extends Assessment { key: string; name: string; accountId?: string; code?: string }
export interface Driver { label: string; amount: number; note: string }
export interface Anomaly { period: string; amount: number; mean: number; z: number; delta: number }
export interface DeptPulse extends Assessment {
  deptId: string; name: string; headUids: string[]; isGeneral: boolean;
  months: string[]; monthly: number[]; avg3: number[]; priorYear: number[];
  mom: number | null; yoy: number | null; trend: 'UP' | 'FLAT' | 'DOWN';
  accounts: LinePulse[]; txns: PulseTxn[]; anomaly: Anomaly | null; accelerating: { pct: number; recent: number; prior: number } | null;
  drivers: Driver[]; narrative: string[]; nextMonthForecast: number;
}
export interface OrgPulse {
  cash: number | null; monthIn: number; monthOut: number; net: number;
  burn3: number | null; runwayMonths: number | null; runwayStatus: PulseStatus;
  netSeries: { ym: string; inn: number; out: number; net: number }[];
  scissors: { revenuePct: number; expensePct: number } | null;
}
export interface IncomePulse extends Assessment { given: number; label: string }
export interface FundPulse { fundId: string; name: string; goal?: number; raised: number; raisedFy: number; target: number; pacePct: number | null; status: PulseStatus; projectedFinish: string | null; reached: boolean; ratePerDay: number }
export interface ProjectPulse extends Assessment { project: AcctProject; burn: { date: string; planned: number; actual: number | null }[]; deptName?: string; finishedEarly: boolean }
export interface PulseReport {
  orgId: string; asOf: string; fiscalYear: number; scope: PulseScope; window: PulseWindow; mode: PulseMode;
  hasBudget: boolean; thresholds: PulseThresholds;
  depts: DeptPulse[]; counts: Record<PulseStatus, number>;
  total: Assessment; org: OrgPulse; income: IncomePulse | null; funds: FundPulse[]; projects: ProjectPulse[];
  heat: { deptId: string; name: string; values: number[] }[]; months: string[];
  orgMonthly: { out: number[]; inn: number[] };
}

// ── The engine ─────────────────────────────────────────────────────────────────────────────────
interface Acc { spent: number; committed: number; pending: number; byAcct: Map<string, { s: number; c: number; p: number }>; txns: PulseTxn[] }
const newAcc = (): Acc => ({ spent: 0, committed: 0, pending: 0, byAcct: new Map(), txns: [] });
const bump = (m: Map<string, { s: number; c: number; p: number }>, k: string, f: 's' | 'c' | 'p', v: number) => { const x = m.get(k) || { s: 0, c: 0, p: 0 }; x[f] += v; m.set(k, x); };

export function computePulse(inp: PulseInput): PulseReport {
  const startMonth = inp.startMonth || inp.settings?.fiscalYearStartMonth || 1;
  const fy = inp.fiscalYear ?? fiscalYearOfDate(inp.today, startMonth);
  const scope = inp.scope || 'YEAR';
  const mode: PulseMode = inp.mode || 'FULL';
  const th = thresholdsOf(inp.settings);
  const W = scopeWindow(fy, startMonth, inp.today, scope);
  const today = inp.today, curYm = ymOf(today);
  const acct = new Map(inp.accounts.map(a => [a.id, a]));
  const typeOf = (id: string) => acct.get(id)?.type;
  const nameOf = (id: string) => acct.get(id)?.name || 'Uncategorized';
  const dk = (d?: string) => d || GENERAL;

  // 1. Budget lines for this fiscal year (latest doc wins).
  const bdoc = [...inp.budgets].filter(b => b.fiscalYear === fy).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
  const bExp = new Map<string, Map<string, number[]>>();   // dept → account → amounts
  const bRev = new Map<string, number[]>();                // revenue account → amounts
  for (const l of bdoc?.lines || []) {
    const t = typeOf(l.accountId);
    if (t === 'REVENUE') { const cur = bRev.get(l.accountId) || Array(12).fill(0); l.amounts.forEach((v, i) => { cur[i] = (cur[i] || 0) + (v || 0); }); bRev.set(l.accountId, cur); continue; }
    if (t && t !== 'EXPENSE') continue;
    const d = dk(l.deptId); const m = bExp.get(d) || new Map<string, number[]>();
    const cur = m.get(l.accountId) || Array(12).fill(0); l.amounts.forEach((v, i) => { cur[i] = (cur[i] || 0) + (v || 0); }); m.set(l.accountId, cur); bExp.set(d, m);
  }

  // 2. Aggregate actuals.
  const accs = new Map<string, Acc>();
  const get = (d: string) => { let a = accs.get(d); if (!a) { a = newAcc(); accs.set(d, a); } return a; };
  const mSpend = new Map<string, Map<string, number>>();    // dept → ym → cents (ALL loaded history, for trends)
  const mIn = new Map<string, number>(), mOut = new Map<string, number>();
  const revByFundFy = new Map<string, number>(), revByFundAll = new Map<string, number>(), spendByFund = new Map<string, number>();
  const revFundRecent = new Map<string, number>();          // last 90 days
  let cashC = 0, haveCash = false, revWindow = 0;
  const revByAcctWin = new Map<string, number>();
  const projSpend = new Map<string, { spent: number; committed: number; pending: number; ev: { date: string; c: number }[] }>();
  const psp = (id: string) => { let x = projSpend.get(id); if (!x) { x = { spent: 0, committed: 0, pending: 0, ev: [] }; projSpend.set(id, x); } return x; };
  const fyFrom = `${W.allMonths[0]}-01`, fyTo = monthEnd(W.allMonths[11]), d90 = addDays(today, -90);
  const addM = (m: Map<string, Map<string, number>>, d: string, ym: string, c: number) => { const x = m.get(d) || new Map<string, number>(); x.set(ym, (x.get(ym) || 0) + c); m.set(d, x); };
  const projects = (inp.projects || []).filter(p => p.status !== 'CANCELLED');
  const projectFor = (l: { projectId?: string; fundId?: string }, date: string): string | null => {
    if (l.projectId) return projects.some(p => p.id === l.projectId) ? l.projectId : null;
    if (l.fundId) { const p = projects.find(p => p.fundId === l.fundId && date >= p.startDate && date <= p.endDate); return p ? p.id : null; }
    return null;
  };

  if (mode === 'FULL') {
    for (const j of inp.journals) {
      const ym = ymOf(j.date);
      for (const l of j.lines) {
        const net = toC(l.debit) - toC(l.credit);
        const a = acct.get(l.accountId);
        if (!a) continue;
        if (a.type === 'ASSET' && a.subtype === 'cash') { cashC += net; haveCash = true; }
        if (a.type === 'EXPENSE') {
          const d = dk(l.deptId);
          addM(mSpend, d, ym, net); mOut.set(ym, (mOut.get(ym) || 0) + net);
          const fk = l.fundId || ''; if (j.date >= fyFrom && j.date <= fyTo) spendByFund.set(fk, (spendByFund.get(fk) || 0) + net);
          if (j.date >= W.from && j.date <= W.to) {
            const acc = get(d); acc.spent += net; bump(acc.byAcct, l.accountId, 's', net);
            acc.txns.push({ kind: 'JOURNAL', id: j.id, date: j.date, memo: l.memo || j.memo, amount: toD(net), accountId: l.accountId, fundId: l.fundId, state: 'POSTED' });
          }
          const pid = projectFor(l, j.date);
          if (pid) { const p = psp(pid); p.spent += net; p.ev.push({ date: j.date, c: net }); }
        } else if (a.type === 'REVENUE') {
          const c = -net;
          mIn.set(ym, (mIn.get(ym) || 0) + c);
          const fk = l.fundId || '';
          revByFundAll.set(fk, (revByFundAll.get(fk) || 0) + c);
          if (j.date >= fyFrom && j.date <= fyTo) revByFundFy.set(fk, (revByFundFy.get(fk) || 0) + c);
          if (j.date >= d90 && j.date <= today) revFundRecent.set(fk, (revFundRecent.get(fk) || 0) + c);
          if (j.date >= W.from && j.date <= W.to) { revWindow += c; revByAcctWin.set(l.accountId, (revByAcctWin.get(l.accountId) || 0) + c); }
        }
      }
    }
  }
  // Expenses: committed + pending always; `spent` too when journals are unavailable (department-head view).
  const linkedRequests = new Set(inp.expenses.filter(e => e.requestId && e.status !== 'VOID' && e.status !== 'REJECTED').map(e => e.requestId!));
  for (const e of inp.expenses) {
    if (e.status === 'VOID' || e.status === 'REJECTED' || e.status === 'DRAFT') continue;
    if (e.isRequest && linkedRequests.has(e.id)) continue;
    const c = toC(e.amount); const d = dk(e.deptId);
    const inWin = e.date >= W.from && e.date <= W.to;
    let state: PulseTxn['state'] | null = null;
    if (e.isRequest) state = (e.status === 'SUBMITTED' || e.status === 'APPROVED') ? 'PENDING' : null;
    else if (e.status === 'SUBMITTED') state = 'PENDING';
    else if (e.status === 'APPROVED' && !e.journalId) state = 'COMMITTED';
    else if (mode === 'EXPENSES_ONLY' && (e.status === 'PAID' || (e.status === 'APPROVED' && e.journalId))) state = 'POSTED';
    if (!state) continue;
    if (state === 'POSTED') { addM(mSpend, d, ymOf(e.date), c); mOut.set(ymOf(e.date), (mOut.get(ymOf(e.date)) || 0) + c); }
    if (inWin) {
      const acc = get(d);
      const f = state === 'POSTED' ? 's' : state === 'COMMITTED' ? 'c' : 'p';
      if (f === 's') acc.spent += c; else if (f === 'c') acc.committed += c; else acc.pending += c;
      bump(acc.byAcct, e.accountId, f, c);
      acc.txns.push({ kind: 'EXPENSE', id: e.id, date: e.date, memo: e.description, amount: toD(c), accountId: e.accountId, fundId: e.fundId, state, vendor: e.vendorName });
    }
    const pid = projectFor(e, e.date);
    if (pid && state !== 'POSTED') { const p = psp(pid); if (state === 'COMMITTED') p.committed += c; else p.pending += c; }
    else if (pid && mode === 'EXPENSES_ONLY') { const p = psp(pid); p.spent += c; p.ev.push({ date: e.date, c }); }
  }

  // 3. Department rows.
  const mins = inp.ministries;
  const ids = new Set<string>([...mins.map(m => m.id), ...bExp.keys(), ...accs.keys()]);
  const nameFor = (d: string) => d === GENERAL ? 'General / unassigned' : mins.find(m => m.id === d)?.name || inp.expenses.find(e => e.deptId === d)?.deptName || 'Department';
  const months12 = Array.from({ length: 12 }, (_, i) => addMonthsYm(curYm, i - 11));
  const lastDone = months12.length - 2;                       // index of the last COMPLETED month (current month is partial)
  const depts: DeptPulse[] = [];
  for (const d of ids) {
    if (inp.visibleDeptIds && !inp.visibleDeptIds.includes(d)) continue;
    const acc = accs.get(d) || newAcc();
    const bl = bExp.get(d) || new Map<string, number[]>();
    let btot = 0, btd = 0;
    const accKeys = new Set<string>([...bl.keys(), ...acc.byAcct.keys()]);
    const lines: LinePulse[] = [];
    for (const a of accKeys) {
      const pb = phasedBudget(bl.get(a) || Array(12).fill(0), W, today);
      btot += toC(pb.total); btd += toC(pb.toDate);
      const x = acc.byAcct.get(a) || { s: 0, c: 0, p: 0 };
      const as = assess({ budget: pb.total, budgetToDate: pb.toDate, spent: toD(x.s), committed: toD(x.c), pending: toD(x.p), daysElapsed: W.daysElapsed, daysTotal: W.daysTotal, th });
      lines.push({ ...as, key: a, accountId: a, code: acct.get(a)?.code, name: nameOf(a) });
    }
    lines.sort((a, b) => b.hard + b.pending - (a.hard + a.pending));
    const rr = recurringRemaining(inp.recurring, d, today, W.to);
    const as = assess({ budget: toD(btot), budgetToDate: toD(btd), spent: toD(acc.spent), committed: toD(acc.committed), pending: toD(acc.pending), daysElapsed: W.daysElapsed, daysTotal: W.daysTotal, recurringRemaining: rr, th });
    // Trends
    const hist = mSpend.get(d) || new Map<string, number>();
    const monthly = months12.map(m => toD(hist.get(m) || 0));
    const priorYear = months12.map(m => toD(hist.get(addMonthsYm(m, -12)) || 0));
    const avg3 = monthly.map((_, i) => { const s = monthly.slice(Math.max(0, i - 2), i + 1); return Math.round(sdiv(s.reduce((a, b) => a + b, 0), s.length) * 100) / 100; });
    const prevYm = (m: string) => toD(hist.get(addMonthsYm(m, -12)) || 0);
    const rec3 = monthly.slice(lastDone - 2, lastDone + 1), pri3 = monthly.slice(lastDone - 5, lastDone - 2);
    const rec3s = rec3.reduce((a, b) => a + b, 0), pri3s = pri3.reduce((a, b) => a + b, 0);
    const yoyBase = [0, 1, 2].reduce((s, k) => s + prevYm(months12[lastDone - k]), 0);
    const mom = lastDone >= 1 && monthly[lastDone - 1] > 0 ? Math.round((monthly[lastDone] - monthly[lastDone - 1]) / monthly[lastDone - 1] * 1000) / 10 : null;
    const yoy = yoyBase > 0 ? Math.round((rec3s - yoyBase) / yoyBase * 1000) / 10 : null;
    const trend: DeptPulse['trend'] = pri3s > 0 && rec3s / pri3s > 1.1 ? 'UP' : pri3s > 0 && rec3s / pri3s < 0.9 ? 'DOWN' : 'FLAT';
    // Anomaly: last completed month (or the partial current month if it ALREADY beats history) vs the dept's own history.
    let anomaly: Anomaly | null = null;
    const histVals = monthly.slice(0, lastDone).filter((_, i) => i < lastDone);
    const hasHist = histVals.filter(v => v > 0).length >= 4;
    if (hasHist) {
      const cand: [number, number][] = [[lastDone, monthly[lastDone]], [lastDone + 1, monthly[lastDone + 1]]];
      for (const [idx, val] of cand) {
        const base = monthly.slice(0, idx).slice(-12).filter((_, i, arr) => i < arr.length);
        const z = zScore(base, val); const mean = sdiv(base.reduce((a, b) => a + b, 0), base.length);
        if (z >= 2.5 && val - mean >= 250) { anomaly = { period: months12[idx], amount: val, mean: Math.round(mean * 100) / 100, z: Math.round(z * 10) / 10, delta: Math.round((val - mean) * 100) / 100 }; }
      }
    }
    const accelerating = pri3s > 0 && rec3s / pri3s >= 1.25 && (rec3s - pri3s) / 3 >= 100 ? { pct: Math.round((rec3s / pri3s - 1) * 1000) / 10, recent: Math.round(rec3s / 3), prior: Math.round(pri3s / 3) } : null;
    const nextMonthForecast = Math.round(Math.max(0, sdiv(rec3s, 3)) * 100) / 100;
    // Drivers + narrative (deterministic)
    const drivers: Driver[] = lines.filter(l => l.hard > 0).map(l => ({ l, over: l.hard - l.budgetToDate })).sort((a, b) => b.over - a.over).slice(0, 3)
      .map(({ l, over }) => ({ label: l.name, amount: l.hard, note: l.budget > 0 ? `${usd0(l.hard)} so far vs ${usd0(l.budgetToDate)} expected (${over >= 0 ? usd0(over) + ' ahead' : usd0(-over) + ' under'})` : `${usd0(l.hard)} with no budget line` }));
    const narrative: string[] = [];
    if (as.budget > 0) narrative.push(`${usd0(as.hard)} of ${usd0(as.budget)} used (${as.usedPct}%) with ${as.expectedPct}% of the plan expected by now.`);
    if (mom !== null && Math.abs(mom) >= 15) narrative.push(`Last month spending ${mom > 0 ? 'rose' : 'fell'} ${Math.abs(mom)}% from the month before.`);
    if (accelerating) narrative.push(`Spending has sped up ${accelerating.pct}% (about ${usd0(accelerating.recent)}/mo vs ${usd0(accelerating.prior)}/mo before).`);
    if (anomaly) narrative.push(`${monthShort(anomaly.period)} was unusually high: ${usd0(anomaly.amount)} vs a typical ${usd0(anomaly.mean)}.`);
    if (drivers[0] && as.budget > 0) narrative.push(`Biggest driver: ${drivers[0].label} — ${drivers[0].note}.`);
    if (as.pending > 0) narrative.push(`${usd0(as.pending)} more is waiting for approval.`);
    if (as.committed > 0) narrative.push(`${usd0(as.committed)} is approved but not yet paid.`);
    if (rr > 0) narrative.push(`${usd0(rr)} of recurring bills are still due this period.`);
    acc.txns.sort((a, b) => b.date.localeCompare(a.date));
    depts.push({
      ...as, deptId: d, name: nameFor(d), headUids: mins.find(m => m.id === d)?.headUids || [], isGeneral: d === GENERAL,
      months: months12, monthly, avg3, priorYear, mom, yoy, trend, accounts: lines, txns: acc.txns.slice(0, 300), anomaly, accelerating, drivers, narrative, nextMonthForecast,
    });
  }
  depts.sort((a, b) => STATUS_RANK[b.status] - STATUS_RANK[a.status] || (b.projectedVariance - a.projectedVariance) || b.hard - a.hard);
  // Hide empty, unbudgeted, unspent departments (an org with 20 ministries should not see 20 blank cards).
  const shown = depts.filter(d => d.budget > 0 || d.hard + d.pending > 0 || d.monthly.some(v => v > 0));
  const counts: Record<PulseStatus, number> = { GREEN: 0, YELLOW: 0, ORANGE: 0, RED: 0, NONE: 0 };
  shown.forEach(d => { counts[d.status]++; });
  const sum = (f: (d: DeptPulse) => number) => toD(shown.reduce((s, d) => s + toC(f(d)), 0));
  const total = assess({
    budget: sum(d => d.budget), budgetToDate: sum(d => d.budgetToDate), spent: sum(d => d.spent), committed: sum(d => d.committed), pending: sum(d => d.pending),
    daysElapsed: W.daysElapsed, daysTotal: W.daysTotal, recurringRemaining: recurringRemaining(inp.recurring, undefined, today, W.to), th,
  });

  // 4. Org level: cash runway, month in/out, scissors.
  const netSeries = months12.map(ym => ({ ym, inn: toD(mIn.get(ym) || 0), out: toD(mOut.get(ym) || 0), net: toD((mIn.get(ym) || 0) - (mOut.get(ym) || 0)) }));
  const last3 = netSeries.slice(lastDone - 2, lastDone + 1);
  const burn3 = mode === 'FULL' && last3.some(m => m.out > 0) ? Math.round(sdiv(last3.reduce((s, m) => s + (m.out - m.inn), 0), 3) * 100) / 100 : null;
  const cash = haveCash ? toD(cashC) : null;
  const runwayMonths = cash !== null && burn3 !== null && burn3 > 0 ? Math.round(Math.max(0, cash) / burn3 * 10) / 10 : null;
  const minRunway = Number(inp.settings?.cashRunwayMonthsMin) > 0 ? Number(inp.settings!.cashRunwayMonthsMin) : 3;
  const runwayStatus: PulseStatus = cash === null || burn3 === null ? 'NONE' : burn3 <= 0 ? 'GREEN' : runwayMonths! < 1 ? 'RED' : runwayMonths! < minRunway ? 'ORANGE' : runwayMonths! < minRunway * 2 ? 'YELLOW' : 'GREEN';
  const rv3 = netSeries.slice(lastDone - 2, lastDone + 1).reduce((s, m) => s + m.inn, 0), rvp = netSeries.slice(lastDone - 5, lastDone - 2).reduce((s, m) => s + m.inn, 0);
  const ex3 = last3.reduce((s, m) => s + m.out, 0), exp3 = netSeries.slice(lastDone - 5, lastDone - 2).reduce((s, m) => s + m.out, 0);
  const scissors = rvp > 0 && exp3 > 0 && rv3 <= rvp * 0.9 && ex3 >= exp3 * 1.1 ? { revenuePct: Math.round((rv3 / rvp - 1) * 1000) / 10, expensePct: Math.round((ex3 / exp3 - 1) * 1000) / 10 } : null;
  const cm = netSeries[netSeries.length - 1];
  const org: OrgPulse = { cash, monthIn: cm?.inn || 0, monthOut: cm?.out || 0, net: cm?.net || 0, burn3, runwayMonths, runwayStatus, netSeries, scissors };

  // 5. Income vs revenue budget.
  let income: IncomePulse | null = null;
  if (bRev.size && mode === 'FULL') {
    let tb = 0, ttd = 0;
    for (const amts of bRev.values()) { const pb = phasedBudget(amts, W, today); tb += toC(pb.total); ttd += toC(pb.toDate); }
    const given = toD(revWindow);
    const pace = ttd > 0 && W.daysElapsed / W.daysTotal >= th.minTimeFrac ? revWindow / ttd : null;
    const status: PulseStatus = pace === null ? (tb > 0 ? 'GREEN' : 'NONE') : pace >= 0.95 ? 'GREEN' : pace >= 0.85 ? 'YELLOW' : pace >= 0.7 ? 'ORANGE' : 'RED';
    const base = assess({ budget: toD(tb), budgetToDate: toD(ttd), spent: given, committed: 0, pending: 0, daysElapsed: W.daysElapsed, daysTotal: W.daysTotal, th });
    income = { ...base, status, given, label: 'Giving & revenue vs plan' };
  }

  // 6. Funds (goal pace + projected finish).
  const funds: FundPulse[] = [];
  for (const f of inp.funds || []) {
    if (f.inactive) continue;
    const raisedAll = Math.max(toD(revByFundAll.get(f.id) || 0), 0);
    const raised = mode === 'FULL' ? Math.max(raisedAll, f.raised || 0) : (f.raised || 0);
    const raisedFy = toD(revByFundFy.get(f.id) || 0);
    const rate = (revFundRecent.get(f.id) || 0) / 100 / 90;
    const reached = !!f.goal && raised >= f.goal;
    const finish = f.goal && !reached && rate > 0 ? addDays(today, Math.ceil((f.goal - raised) / rate)) : null;
    const target = f.budget || 0;
    const tdFrac = W.allMonths.length ? clamp((daysBetween(fyFrom, today) + 1) / (daysBetween(fyFrom, fyTo) + 1), 0, 1) : 0;
    const pace = target > 0 && tdFrac >= 0.15 ? raisedFy / (target * tdFrac) : null;
    const status: PulseStatus = reached ? 'GREEN' : pace === null ? 'NONE' : pace >= 0.95 ? 'GREEN' : pace >= 0.85 ? 'YELLOW' : pace >= 0.7 ? 'ORANGE' : 'RED';
    if (f.goal || target || raisedAll > 0) funds.push({ fundId: f.id, name: f.name, goal: f.goal, raised: Math.round(raised * 100) / 100, raisedFy, target, pacePct: pace === null ? null : Math.round(pace * 1000) / 10, status, projectedFinish: finish, reached, ratePerDay: Math.round(rate * 100) / 100 });
  }

  // 7. Projects (budget vs timeline, burn-down).
  const prow: ProjectPulse[] = [];
  for (const p of inp.projects || []) {
    if (p.status === 'CANCELLED') continue;
    const x = projSpend.get(p.id) || { spent: 0, committed: 0, pending: 0, ev: [] };
    const total = Math.max(1, daysBetween(p.startDate, p.endDate) + 1);
    const el = clamp(daysBetween(p.startDate, today) + 1, 0, total);
    const as = assess({ budget: p.budget, budgetToDate: toD(Math.round(toC(p.budget) * el / total)), spent: toD(x.spent), committed: toD(x.committed), pending: toD(x.pending), daysElapsed: el, daysTotal: total, th });
    const pts = 12, burn: ProjectPulse['burn'] = [];
    for (let i = 0; i <= pts; i++) {
      const date = addDays(p.startDate, Math.round((total - 1) * i / pts));
      burn.push({ date, planned: toD(Math.round(toC(p.budget) * (i / pts))), actual: date <= today ? toD(x.ev.filter(e => e.date <= date).reduce((s, e) => s + e.c, 0)) : null });
    }
    const done = p.status === 'DONE';
    prow.push({ ...as, status: done ? (as.hard > as.budget && as.budget > 0 ? 'RED' : 'GREEN') : as.status, project: p, burn, deptName: p.deptId ? nameFor(p.deptId) : undefined, finishedEarly: done && as.hard <= as.budget });
  }
  prow.sort((a, b) => STATUS_RANK[b.status] - STATUS_RANK[a.status]);

  return {
    orgId: inp.orgId, asOf: today, fiscalYear: fy, scope, window: W, mode, hasBudget: !!bdoc && bdoc.lines.some(l => l.amounts.some(v => v > 0)), thresholds: th,
    depts: shown, counts, total, org, income, funds, projects: prow,
    heat: shown.map(d => ({ deptId: d.deptId, name: d.name, values: d.monthly })), months: months12,
    orgMonthly: { out: netSeries.map(m => m.out), inn: netSeries.map(m => m.inn) },
  };
}

// ── Alerts (deterministic; the SAME function runs on the client and in the server sweep) ───────
export type AlertSeverity = 'INFO' | 'WATCH' | 'RISK' | 'CRITICAL';
export const SEVERITY_RANK: Record<AlertSeverity, number> = { INFO: 0, WATCH: 1, RISK: 2, CRITICAL: 3 };
export const SEVERITY_STATUS: Record<AlertSeverity, PulseStatus> = { INFO: 'NONE', WATCH: 'YELLOW', RISK: 'ORANGE', CRITICAL: 'RED' };
export interface PulseAlert {
  id: string; orgId: string; scope: 'ORG' | 'DEPT' | 'FUND' | 'PROJECT'; scopeId: string; deptId?: string;
  kind: 'WATCH' | 'RISK' | 'OVER' | 'SPIKE' | 'OUTPACING' | 'FUND_BEHIND' | 'CASH_LOW' | 'SCISSORS' | 'PROJECT_RISK' | 'PROJECT_OVER';
  severity: AlertSeverity; period: string; title: string; message: string; nextStep: string; amount?: number; daysLeft?: number | null;
}
export const alertDocId = (orgId: string, scope: string, scopeId: string, kind: string, period: string) => `${orgId}_${scope}_${scopeId}_${kind}_${period}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 200);
const mkAlert = (orgId: string, a: Omit<PulseAlert, 'id' | 'orgId'>): PulseAlert => ({ ...a, orgId, id: alertDocId(orgId, a.scope, a.scopeId, a.kind, a.period) });
const daysPhrase = (d: number | null) => d === null ? '' : d <= 0 ? 'The budget is used up' : d === 1 ? '1 day of budget left' : `${d} days of budget left`;

export function deriveAlerts(input: PulseInput): PulseAlert[] {
  const year = computePulse({ ...input, scope: 'YEAR' });
  const quarter = computePulse({ ...input, scope: 'QUARTER' });
  const out: PulseAlert[] = [];
  const oid = input.orgId;
  const levelOf = (s: PulseStatus): { kind: 'WATCH' | 'RISK' | 'OVER'; sev: AlertSeverity } | null => s === 'RED' ? { kind: 'OVER', sev: 'CRITICAL' } : s === 'ORANGE' ? { kind: 'RISK', sev: 'RISK' } : s === 'YELLOW' ? { kind: 'WATCH', sev: 'WATCH' } : null;
  const seenDept = new Map<string, number>();
  const consider = (r: PulseReport, isYear: boolean) => {
    for (const d of r.depts) {
      if (d.budget <= 0) continue;
      let lv = levelOf(d.status);
      if (!lv) continue;
      // Quiet by design: a plain pace-only yellow is not worth a ping — only "more than watch% used".
      if (lv.kind === 'WATCH' && !(d.usedPct !== null && d.usedPct > r.thresholds.watchUsedPct)) continue;
      const rank = SEVERITY_RANK[lv.sev];
      if (!isYear && (seenDept.get(d.deptId) ?? -1) >= rank) continue;          // the year alert already says it
      seenDept.set(d.deptId, Math.max(seenDept.get(d.deptId) ?? -1, isYear ? rank : -1));
      const w = r.window, per = isYear ? 'the year' : 'the quarter';
      const rd = daysPhrase(d.runwayDays);
      const message = lv.kind === 'OVER'
        ? `${d.name} has spent ${usd0(d.hard)} against a ${usd0(d.budget)} budget for ${per} — ${usd0(d.hard - d.budget)} over.`
        : lv.kind === 'RISK'
          ? `${d.name} is on pace to exceed its ${per === 'the year' ? 'annual budget' : 'quarter'} by ${usd0(d.overrun)}${rd ? ` — ${rd}` : ''}.`
          : `${d.name} has used ${d.usedPct}% of its budget for ${per} — ${usd0(d.budget - d.hard)} left.`;
      const next = lv.kind === 'OVER' ? 'Pause non-essential approvals, or ask finance to raise the budget or move funds from another department.'
        : lv.kind === 'RISK' ? 'Review the biggest items, hold optional purchases, or ask finance for a transfer before it tips over.'
        : 'Nothing to do yet — keep an eye on upcoming requests.';
      out.push(mkAlert(oid, { scope: 'DEPT', scopeId: d.deptId, deptId: d.deptId === GENERAL ? undefined : d.deptId, kind: lv.kind, severity: lv.sev, period: w.key, title: `${d.name}: ${STATUS_META[d.status].label.toLowerCase()}`, message, nextStep: next, amount: lv.kind === 'OVER' ? d.hard - d.budget : d.overrun, daysLeft: d.runwayDays }));
    }
  };
  consider(year, true); consider(quarter, false);
  for (const d of year.depts) {
    if (d.anomaly) out.push(mkAlert(oid, { scope: 'DEPT', scopeId: d.deptId, deptId: d.deptId === GENERAL ? undefined : d.deptId, kind: 'SPIKE', severity: 'WATCH', period: d.anomaly.period, title: `${d.name}: unusual spending`, message: `${d.name} spent ${usd0(d.anomaly.amount)} in ${monthShort(d.anomaly.period)} — about ${usd0(d.anomaly.delta)} more than its usual ${usd0(d.anomaly.mean)}.`, nextStep: 'Open the department and check the largest transactions.', amount: d.anomaly.delta }));
  }
  for (const f of year.funds) {
    if (f.status === 'ORANGE' || f.status === 'RED') out.push(mkAlert(oid, { scope: 'FUND', scopeId: f.fundId, kind: 'FUND_BEHIND', severity: 'WATCH', period: year.window.key, title: `${f.name}: giving is behind plan`, message: `${f.name} has raised ${usd0(f.raisedFy)} this year — about ${f.pacePct}% of where the plan says it should be.`, nextStep: 'Consider a reminder to givers, or revisit the target.', amount: Math.max(0, f.target - f.raisedFy) }));
  }
  for (const p of year.projects) {
    if (p.project.status === 'DONE' || (p.status !== 'ORANGE' && p.status !== 'RED')) continue;
    const over = p.status === 'RED';
    out.push(mkAlert(oid, { scope: 'PROJECT', scopeId: p.project.id, deptId: p.project.deptId, kind: over ? 'PROJECT_OVER' : 'PROJECT_RISK', severity: over ? 'CRITICAL' : 'RISK', period: p.project.endDate.slice(0, 7), title: `${p.project.name}: ${over ? 'over budget' : 'at risk'}`, message: over ? `${p.project.name} has spent ${usd0(p.hard)} of its ${usd0(p.budget)} budget — ${usd0(p.hard - p.budget)} over.` : `${p.project.name} is on pace to finish ${usd0(p.overrun)} over its ${usd0(p.budget)} budget.`, nextStep: over ? 'Decide whether to fund the gap or trim the scope.' : 'Review remaining purchases against the timeline.', amount: over ? p.hard - p.budget : p.overrun, daysLeft: p.runwayDays }));
  }
  const o = year.org;
  if (o.runwayMonths !== null && (o.runwayStatus === 'RED' || o.runwayStatus === 'ORANGE')) {
    out.push(mkAlert(oid, { scope: 'ORG', scopeId: 'org', kind: 'CASH_LOW', severity: o.runwayStatus === 'RED' ? 'CRITICAL' : 'RISK', period: input.today.slice(0, 7), title: 'Cash runway is getting short', message: `Cash on hand covers about ${o.runwayMonths} month${o.runwayMonths === 1 ? '' : 's'} at the recent spending rate.`, nextStep: 'Review upcoming bills and large commitments; consider moving reserve funds.', amount: o.cash ?? undefined }));
  }
  if (o.scissors) out.push(mkAlert(oid, { scope: 'ORG', scopeId: 'org', kind: 'SCISSORS', severity: 'WATCH', period: input.today.slice(0, 7), title: 'Giving is down while spending is up', message: `Over the last 3 months giving is ${o.scissors.revenuePct}% vs the 3 before, while spending is ${o.scissors.expensePct > 0 ? '+' : ''}${o.scissors.expensePct}%.`, nextStep: 'Look at the departments that are speeding up.' }));
  return out.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || (b.amount || 0) - (a.amount || 0));
}

/** Who should hear about an alert: dept head for their dept; finance/bookkeeper/treasurer for all; pastors ONLY for org-level. */
export function alertAudience(a: Pick<PulseAlert, 'scope' | 'deptId'>, org: { ministries?: Pick<Ministry, 'id' | 'headUids'>[]; financeUids?: string[]; accountingUids?: string[]; pastorUids?: string[] }): string[] {
  const s = new Set<string>([...(org.financeUids || []), ...(org.accountingUids || [])]);
  if (a.deptId) (org.ministries || []).find(m => m.id === a.deptId)?.headUids?.forEach(u => s.add(u));
  if (a.scope === 'ORG') (org.pastorUids || []).forEach(u => s.add(u));
  return [...s];
}

export type AlertPref = 'ALL' | 'WATCH' | 'RISK' | 'CRITICAL' | 'OFF';
export const prefAllows = (pref: AlertPref | undefined, sev: AlertSeverity) => { const p = pref || 'WATCH'; return p === 'OFF' ? false : p === 'ALL' ? true : SEVERITY_RANK[sev] >= SEVERITY_RANK[p as AlertSeverity]; };

// ── Flow (where did the money come from / go) ─────────────────────────────────────────────────
export interface DateSpan { from: string; to: string; label: string }
export function rangePreset(kind: 'MTD' | 'QTD' | 'YTD' | '12MO', today: string, startMonth = 1): DateSpan {
  const fy = fiscalYearOfDate(today, startMonth), months = fiscalMonthsOf(fy, startMonth), idx = Math.max(0, months.indexOf(ymOf(today)));
  if (kind === 'MTD') return { from: `${ymOf(today)}-01`, to: today, label: 'Month to date' };
  if (kind === 'QTD') return { from: `${months[Math.floor(idx / 3) * 3]}-01`, to: today, label: 'Quarter to date' };
  if (kind === 'YTD') return { from: `${months[0]}-01`, to: today, label: 'Year to date' };
  return { from: `${addMonthsYm(ymOf(today), -11)}-01`, to: today, label: 'Last 12 months' };
}
export function shiftSpan(r: DateSpan, mode: 'PRIOR_PERIOD' | 'PRIOR_YEAR'): DateSpan {
  if (mode === 'PRIOR_YEAR') return { from: `${Number(r.from.slice(0, 4)) - 1}${r.from.slice(4)}`, to: `${Number(r.to.slice(0, 4)) - 1}${r.to.slice(4)}`, label: 'Same time last year' };
  const len = daysBetween(r.from, r.to) + 1;
  return { from: addDays(r.from, -len), to: addDays(r.from, -1), label: 'Previous period' };
}
export interface FlowResult {
  span: DateSpan; totalIn: number; totalOut: number; net: number;
  sources: { id: string; name: string; amount: number; spent: number }[];
  uses: { id: string; name: string; amount: number }[];
  links: { from: string; to: string; amount: number }[];
  categories: { accountId: string; name: string; amount: number }[];
}
export function computeFlow(inp: Pick<PulseInput, 'accounts' | 'journals' | 'ministries' | 'funds'>, span: DateSpan): FlowResult {
  const acct = new Map(inp.accounts.map(a => [a.id, a]));
  const fundName = (id: string) => id ? inp.funds?.find(f => f.id === id)?.name || 'Fund' : 'General fund';
  const deptName = (id: string) => id === GENERAL ? 'General / unassigned' : inp.ministries.find(m => m.id === id)?.name || 'Department';
  const src = new Map<string, number>(), spentBy = new Map<string, number>(), use = new Map<string, number>(), link = new Map<string, number>(), cat = new Map<string, number>();
  for (const j of inp.journals) {
    if (j.date < span.from || j.date > span.to) continue;
    for (const l of j.lines) {
      const a = acct.get(l.accountId); if (!a) continue;
      const net = toC(l.debit) - toC(l.credit);
      if (a.type === 'REVENUE') src.set(l.fundId || '', (src.get(l.fundId || '') || 0) - net);
      else if (a.type === 'EXPENSE') {
        const d = l.deptId || GENERAL, f = l.fundId || '';
        use.set(d, (use.get(d) || 0) + net); spentBy.set(f, (spentBy.get(f) || 0) + net);
        link.set(`${f}\u0000${d}`, (link.get(`${f}\u0000${d}`) || 0) + net); cat.set(l.accountId, (cat.get(l.accountId) || 0) + net);
      }
    }
  }
  const fundIds = new Set([...src.keys(), ...spentBy.keys()]);
  const sources = [...fundIds].map(id => ({ id, name: fundName(id), amount: toD(src.get(id) || 0), spent: toD(spentBy.get(id) || 0) })).filter(s => s.amount !== 0 || s.spent !== 0).sort((a, b) => b.amount - a.amount);
  const uses = [...use].map(([id, c]) => ({ id, name: deptName(id), amount: toD(c) })).filter(u => u.amount > 0).sort((a, b) => b.amount - a.amount);
  const links = [...link].map(([k, c]) => { const [from, to] = k.split('\u0000'); return { from, to, amount: toD(c) }; }).filter(l => l.amount > 0);
  const categories = [...cat].map(([accountId, c]) => ({ accountId, name: acct.get(accountId)?.name || 'Other', amount: toD(c) })).filter(c => c.amount > 0).sort((a, b) => b.amount - a.amount);
  const tin = toD([...src.values()].reduce((a, b) => a + b, 0)), tout = toD([...use.values()].reduce((a, b) => a + b, 0));
  return { span, totalIn: tin, totalOut: tout, net: Math.round((tin - tout) * 100) / 100, sources, uses, links, categories };
}

// ── Auto-suggested budgets from the last 12 months of actual spending ─────────────────────────
export function suggestBudgetLines(inp: Pick<PulseInput, 'accounts' | 'journals' | 'today'> & { startMonth?: number }): AcctBudget['lines'] {
  const acct = new Map(inp.accounts.map(a => [a.id, a]));
  const start = addMonthsYm(ymOf(inp.today), -12), end = addMonthsYm(ymOf(inp.today), -1);   // 12 completed months
  const fy = fiscalYearOfDate(inp.today, inp.startMonth || 1), months = fiscalMonthsOf(fy, inp.startMonth || 1);
  const agg = new Map<string, { accountId: string; deptId?: string; byYm: Map<string, number> }>();
  for (const j of inp.journals) {
    const ym = ymOf(j.date); if (ym < start || ym > end) continue;
    for (const l of j.lines) {
      if (acct.get(l.accountId)?.type !== 'EXPENSE') continue;
      const k = `${l.accountId}|${l.deptId || ''}`; const x = agg.get(k) || { accountId: l.accountId, deptId: l.deptId, byYm: new Map() };
      x.byYm.set(ym, (x.byYm.get(ym) || 0) + toC(l.debit) - toC(l.credit)); agg.set(k, x);
    }
  }
  const lines: AcctBudget['lines'] = [];
  for (const x of agg.values()) {
    const total = [...x.byYm.values()].reduce((a, b) => a + b, 0);
    if (total <= 0) continue;
    const avg = total / 12;
    const byMm = new Map([...x.byYm].map(([ym, c]) => [ym.slice(5, 7), c]));   // seasonality: same calendar month of the last 12
    const amounts = months.map(m => { const same = byMm.get(m.slice(5, 7)); return Math.round(((same !== undefined && same > 0 ? same : avg) / 100) / 5) * 5; });
    lines.push({ accountId: x.accountId, deptId: x.deptId, amounts });
  }
  return lines;
}

// ── Exports ───────────────────────────────────────────────────────────────────────────────────
const q = (v: string | number | null | undefined) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function pulseCsv(r: PulseReport): string {
  const head = ['Department', 'Status', 'Budget', 'Budget to date', 'Spent', 'Committed', 'Pending', '% used', 'Pace %', 'Projected', 'Projected over/(under)', 'Days of budget left', ...r.months.map(monthShort)];
  const rows = r.depts.map(d => [d.name, STATUS_META[d.status].label, d.budget, d.budgetToDate, d.spent, d.committed, d.pending, d.usedPct ?? '', d.paceRatio === null ? '' : Math.round(d.paceRatio * 100), d.projected, d.projectedVariance, d.runwayDays ?? '', ...d.monthly]);
  return [head, ...rows].map(r => r.map(q).join(',')).join('\n');
}

/** Plain-language one-line summary of a department (used in lists, notifications, and as the ARIA fallback). */
export function deptHeadline(d: DeptPulse): string {
  if (d.status === 'NONE') return d.hard + d.pending > 0 ? `${usd0(d.hard + d.pending)} spent with no budget set.` : 'No activity yet.';
  if (d.status === 'RED') return `${usd0(d.hard - d.budget)} over budget.`;
  if (d.status === 'ORANGE') return `On pace to finish ${usd0(d.overrun)} over${d.runwayDays !== null ? ` — ${daysPhrase(d.runwayDays)}` : ''}.`;
  if (d.status === 'YELLOW') return `${d.usedPct}% used — worth watching.`;
  return `${usd0(Math.max(0, d.budget - d.hard))} left, on track.`;
}
