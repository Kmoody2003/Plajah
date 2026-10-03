// chmsFinanceReports — PURE finance calculations for Elevate ChMS (no Firestore, no React).
// Ledger merge (manual + native Stripe), aggregates, reports, insights/anomalies, pledge tracking,
// statements, and exports (CSV / QuickBooks IIF / Servant-Keeper-compatible). Every number the Finance
// Hub shows — and everything ARIA narrates — is computed here, deterministically.

import type { ChmsBatch, ChmsContribution, ChmsHousehold, ChmsPerson, ChmsPledge, GivingFund, ChmsFinanceSettings, ChmsPayout, ChmsPayoutLine } from '../types';

// ── Basic helpers ───────────────────────────────────────────────────────────────
export const todayStr = (d = new Date()): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const money = (n: number): string => (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
export const median = (xs: number[]): number => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const addDays = (iso: string, n: number): string => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return todayStr(d); };
export const daysBetween = (a: string, b: string): number => Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000);
export const toMillis = (v: any): number => {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') { const t = Date.parse(v); return isNaN(t) ? 0 : t; }
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  return 0;
};

export interface DateRange { from: string; to: string; label: string }
export const yearRange = (y: number): DateRange => ({ from: `${y}-01-01`, to: `${y}-12-31`, label: String(y) });
export function fiscalRange(y: number, startMonth = 1): DateRange {
  if (startMonth <= 1) return yearRange(y);
  const from = `${y}-${String(startMonth).padStart(2, '0')}-01`;
  const end = new Date(y + 1, startMonth - 1, 0);
  return { from, to: todayStr(end), label: `FY${y + 1}` };
}
export function quarterRange(y: number, q: number): DateRange {
  const sm = (q - 1) * 3; const from = new Date(y, sm, 1); const to = new Date(y, sm + 3, 0);
  return { from: todayStr(from), to: todayStr(to), label: `Q${q} ${y}` };
}
export function monthRange(y: number, m: number): DateRange { // m: 0-11
  return { from: todayStr(new Date(y, m, 1)), to: todayStr(new Date(y, m + 1, 0)), label: new Date(y, m, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' }) };
}
export const inRange = (date: string, r: { from: string; to: string }): boolean => date >= r.from && date <= r.to;
export const curQuarter = (d = new Date()): DateRange => quarterRange(d.getFullYear(), Math.floor(d.getMonth() / 3) + 1);

// ── Ledger (manual contributions + native online donations) ────────────────────
export type LedgerRow = ChmsContribution & { origin: 'LEDGER' | 'ONLINE' };

/** A native Stripe gift from the `donations` collection (see server.ts church_donation webhook). */
export interface NativeDonation {
  id: string; fromId?: string; fromName?: string; churchId?: string; fund?: string; amount: number;
  recurring?: boolean; stripePaymentIntentId?: string; stripeSubscriptionId?: string; timestamp: number;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Merge native online gifts into the ledger view. Dedupes on stripePaymentId against manual/imported rows. */
export function buildLedger(orgId: string, contribs: ChmsContribution[], donations: NativeDonation[], people: ChmsPerson[], funds: GivingFund[]): { rows: LedgerRow[]; onlineMerged: number; onlineDuplicates: number } {
  const rows: LedgerRow[] = contribs.map(c => ({ ...c, origin: 'LEDGER' as const }));
  const seen = new Set(contribs.map(c => c.stripePaymentId).filter(Boolean) as string[]);
  // A monthly gift's `donations` row is the subscription START; once the server has written the real
  // per-invoice contributions (invoice.paid), those replace it (otherwise the first payment double-counts).
  contribs.forEach(c => { if (c.stripeSubscriptionId) seen.add(c.stripeSubscriptionId); });
  const byUid = new Map<string, ChmsPerson>();
  people.forEach(p => { if (p.linkedUid) byUid.set(p.linkedUid, p); });
  const fundByName = new Map(funds.map(f => [f.name.toLowerCase(), f]));
  let merged = 0, dup = 0;
  for (const d of donations) {
    const pid = d.stripePaymentIntentId || d.stripeSubscriptionId || `donation:${d.id}`;
    if (seen.has(pid)) { dup++; continue; }
    seen.add(pid);
    const person = d.fromId ? byUid.get(d.fromId) : undefined;
    const fundName = d.fund || 'General';
    const fund = fundByName.get(fundName.toLowerCase());
    const ts = d.timestamp || Date.now();
    rows.push({
      id: `online_${d.id}`, orgId, personId: person?.id, householdId: person?.householdId,
      giverName: person ? undefined : (d.fromName || 'Online giver'),
      fundId: fund?.id || slug(fundName), fundName: fund?.name || fundName,
      amount: d.amount, date: todayStr(new Date(ts)), method: 'ONLINE', deductible: true,
      stripePaymentId: pid, status: 'POSTED', enteredBy: 'stripe', createdAt: ts,
      linkedUid: d.fromId, origin: 'ONLINE',
    });
    merged++;
  }
  return { rows, onlineMerged: merged, onlineDuplicates: dup };
}

export const live = (rows: LedgerRow[]): LedgerRow[] => rows.filter(r => r.status !== 'VOID');
export const sum = (rows: { amount: number }[]): number => round2(rows.reduce((a, r) => a + r.amount, 0));

// ── Giver identity ─────────────────────────────────────────────────────────────
export interface PeopleIndex {
  byId: Map<string, ChmsPerson>; households: Map<string, ChmsHousehold>;
  nameOf: (personId?: string, fallback?: string) => string;
  householdNameOf: (householdId?: string) => string;
}
export function indexPeople(people: ChmsPerson[], households: ChmsHousehold[]): PeopleIndex {
  const byId = new Map(people.map(p => [p.id, p]));
  const hh = new Map(households.map(h => [h.id, h]));
  const personName = (p: ChmsPerson) => `${p.preferredName || p.firstName} ${p.lastName}`.trim();
  return {
    byId, households: hh,
    nameOf: (id, fb) => { const p = id ? byId.get(id) : undefined; return p ? personName(p) : (fb || 'Anonymous'); },
    householdNameOf: id => (id && hh.get(id)?.name) || '',
  };
}
export const giverKey = (r: Pick<ChmsContribution, 'personId' | 'giverName' | 'anonymous'>): string =>
  r.personId ? `p:${r.personId}` : r.anonymous || !r.giverName ? 'anon' : `n:${r.giverName.toLowerCase()}`;
export const envelopeOf = (p: ChmsPerson): string => {
  const c = p.custom || {};
  const k = Object.keys(c).find(x => /envelope/i.test(x));
  return k ? String(c[k] || '') : '';
};

export function searchPeople(people: ChmsPerson[], households: ChmsHousehold[], q: string, limit = 8): ChmsPerson[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const hhIds = new Set(households.filter(h => h.name.toLowerCase().includes(s)).map(h => h.id));
  const toks = s.split(/\s+/);
  const scored: { p: ChmsPerson; score: number }[] = [];
  for (const p of people) {
    if (p.status === 'DECEASED') continue;
    const full = `${p.firstName} ${p.preferredName || ''} ${p.lastName}`.toLowerCase();
    const env = envelopeOf(p).toLowerCase();
    let score = 0;
    if (env && env === s) score = 100;
    else if (toks.every(t => full.includes(t))) score = full.startsWith(s) || p.lastName.toLowerCase().startsWith(toks[0]) ? 80 : 60;
    else if (p.householdId && hhIds.has(p.householdId)) score = 40;
    else if (p.email && p.email.toLowerCase().includes(s)) score = 30;
    if (score) scored.push({ p, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map(x => x.p);
}

// ── Aggregates ─────────────────────────────────────────────────────────────────
export interface GiverAgg { key: string; personId?: string; householdId?: string; name: string; total: number; count: number; first: string; last: string; funds: Record<string, number> }
export function aggregateGivers(rows: LedgerRow[], idx: PeopleIndex): GiverAgg[] {
  const m = new Map<string, GiverAgg>();
  for (const r of rows) {
    const k = giverKey(r);
    let g = m.get(k);
    if (!g) { g = { key: k, personId: r.personId, householdId: r.householdId, name: r.anonymous ? 'Anonymous' : idx.nameOf(r.personId, r.giverName), total: 0, count: 0, first: r.date, last: r.date, funds: {} }; m.set(k, g); }
    g.total = round2(g.total + r.amount); g.count++;
    if (r.date < g.first) g.first = r.date;
    if (r.date > g.last) g.last = r.date;
    g.funds[r.fundName] = round2((g.funds[r.fundName] || 0) + r.amount);
  }
  return [...m.values()];
}
export function totalsBy<T extends string>(rows: LedgerRow[], keyFn: (r: LedgerRow) => T): Record<string, { total: number; count: number }> {
  const out: Record<string, { total: number; count: number }> = {};
  for (const r of rows) { const k = keyFn(r); const o = out[k] || (out[k] = { total: 0, count: 0 }); o.total = round2(o.total + r.amount); o.count++; }
  return out;
}

// ── Funds: totals, restricted/unrestricted, transfers, budget vs actual ────────
export interface FundTransfer { id: string; pairId: string; fundId: string; fundName: string; amount: number /* signed: − out, + in */; date: string; reason?: string }
export interface FundSummary { fund: GivingFund; ytd: number; lifetime: number; period: number; transfersNet: number; balance: number; budget?: number; budgetPct?: number; goalPct?: number; restricted: boolean }
export function fundSummaries(funds: GivingFund[], rows: LedgerRow[], transfers: FundTransfer[], period: DateRange, year = new Date().getFullYear()): FundSummary[] {
  const rl = live(rows);
  const list: GivingFund[] = [...funds];
  // Funds that appear in the ledger but not in org.givingFunds (e.g. imported) still get a line.
  for (const r of rl) if (!list.some(f => f.id === r.fundId || f.name === r.fundName)) list.push({ id: r.fundId, name: r.fundName });
  return list.map(f => {
    const mine = rl.filter(r => r.fundId === f.id || r.fundName === f.name);
    const ytd = sum(mine.filter(r => inRange(r.date, yearRange(year))));
    const lifetime = sum(mine);
    const per = sum(mine.filter(r => inRange(r.date, period)));
    const tn = round2(transfers.filter(t => t.fundId === f.id).reduce((a, t) => a + t.amount, 0));
    return {
      fund: f, ytd, lifetime, period: per, transfersNet: tn, balance: round2(lifetime + tn), restricted: !!f.restricted,
      budget: f.budget, budgetPct: f.budget ? Math.round((ytd / f.budget) * 100) : undefined,
      goalPct: f.goal ? Math.round((lifetime / f.goal) * 100) : undefined,
    };
  });
}

// ── Batches ────────────────────────────────────────────────────────────────────
export interface BatchTotals { count: number; total: number; byFund: Record<string, number>; byMethod: Record<string, number>; expectedTotal?: number; expectedCount?: number; variance: number; countVariance: number; balanced: boolean }
export function batchTotals(batch: ChmsBatch, rows: LedgerRow[]): BatchTotals {
  const mine = rows.filter(r => r.batchId === batch.id && r.status !== 'VOID');
  const total = sum(mine);
  const byFund: Record<string, number> = {}; const byMethod: Record<string, number> = {};
  mine.forEach(r => { byFund[r.fundName] = round2((byFund[r.fundName] || 0) + r.amount); byMethod[r.method] = round2((byMethod[r.method] || 0) + r.amount); });
  // Split rows share a splitGroupId and count as ONE item against a deposit-slip item count.
  const items = new Set(mine.map(r => r.splitGroupId || r.id)).size;
  const variance = batch.expectedTotal != null ? round2(total - batch.expectedTotal) : 0;
  const countVariance = batch.expectedCount != null ? items - batch.expectedCount : 0;
  const hasControl = batch.expectedTotal != null;
  return { count: items, total, byFund, byMethod, expectedTotal: batch.expectedTotal, expectedCount: batch.expectedCount, variance, countVariance, balanced: hasControl && variance === 0 && countVariance === 0 };
}

// ── Pledges ────────────────────────────────────────────────────────────────────
const FREQ_DAYS: Record<ChmsPledge['frequency'], number> = { ONCE: 0, WEEKLY: 7, MONTHLY: 30.4375, QUARTERLY: 91.3125, YEARLY: 365.25 };
export interface PledgeProgress { pledge: ChmsPledge; given: number; remaining: number; pct: number; expectedToDate: number; behind: number; isBehind: boolean; endDate: string; name: string }
/** `amount` is the TOTAL commitment between startDate and endDate (default 1 year); frequency is the installment cadence. */
export function pledgeProgress(p: ChmsPledge, rows: LedgerRow[], idx: PeopleIndex, today = todayStr()): PledgeProgress {
  const end = p.endDate || addDays(p.startDate, 365);
  const mine = live(rows).filter(r => r.pledgeId === p.id || attachesTo(p, r));
  const seenIds = new Set<string>();
  const given = sum(mine.filter(r => (seenIds.has(r.id) ? false : (seenIds.add(r.id), true))));
  let expected = 0;
  if (p.frequency === 'ONCE' || FREQ_DAYS[p.frequency] === 0) expected = today >= end ? p.amount : 0;
  else {
    const span = Math.max(1, daysBetween(p.startDate, end));
    const step = FREQ_DAYS[p.frequency];
    const n = Math.max(1, Math.round(span / step));
    const elapsed = Math.max(0, daysBetween(p.startDate, today < end ? today : end));
    const due = Math.min(n, Math.floor(elapsed / step) + (elapsed >= 0 ? 1 : 0));
    expected = today < p.startDate ? 0 : round2((p.amount * due) / n);
  }
  const behind = Math.max(0, round2(expected - given));
  return { pledge: p, given, remaining: Math.max(0, round2(p.amount - given)), pct: p.amount ? Math.min(100, Math.round((given / p.amount) * 100)) : 0, expectedToDate: expected, behind, isBehind: p.status === 'ACTIVE' && behind > p.amount * 0.1 && behind > 0, endDate: end, name: idx.nameOf(p.personId, p.giverName) };
}
/** Does a gift match a pledge (same giver/household, same fund, within window)? Powers auto-attach of matching gifts. */
export function attachesTo(p: ChmsPledge, r: Pick<ChmsContribution, 'personId' | 'householdId' | 'fundId' | 'date' | 'pledgeId'>): boolean {
  if (r.pledgeId) return r.pledgeId === p.id;
  if (p.status !== 'ACTIVE' && p.status !== 'FULFILLED') return false;
  if (r.fundId !== p.fundId) return false;
  const end = p.endDate || addDays(p.startDate, 365);
  if (r.date < p.startDate || r.date > end) return false;
  return (!!p.personId && p.personId === r.personId) || (!!p.householdId && p.householdId === r.householdId);
}
export const findPledgeFor = (pledges: ChmsPledge[], r: Pick<ChmsContribution, 'personId' | 'householdId' | 'fundId' | 'date'>): ChmsPledge | undefined =>
  pledges.find(p => p.status === 'ACTIVE' && attachesTo(p, { ...r, pledgeId: undefined }));

// ── Insights (deterministic) ───────────────────────────────────────────────────
export type InsightKind = 'LAPSED' | 'FIRST_TIME' | 'ANOMALY' | 'FUND_HEALTH' | 'CHECKLIST' | 'PLEDGE_BEHIND' | 'APPROVAL';
export interface Insight { id: string; kind: InsightKind; severity: 'info' | 'watch' | 'action'; title: string; detail: string; personId?: string; rowIds?: string[]; amount?: number }

export function lapsedGivers(rows: LedgerRow[], idx: PeopleIndex, lapsedDays = 60, today = todayStr()): GiverAgg[] {
  const rl = live(rows).filter(r => r.personId && !r.anonymous);
  const since = addDays(today, -365);
  const recent = rl.filter(r => r.date >= since);
  const aggs = aggregateGivers(recent, idx);
  return aggs.filter(g => g.count >= 3 && daysBetween(g.last, today) > lapsedDays && daysBetween(g.last, today) < 365 - 30)
    .sort((a, b) => b.total - a.total);
}
export function firstTimeGivers(rows: LedgerRow[], idx: PeopleIndex, withinDays = 30, today = todayStr()): GiverAgg[] {
  const rl = live(rows).filter(r => r.personId && !r.anonymous);
  const all = aggregateGivers(rl, idx);
  return all.filter(g => daysBetween(g.first, today) <= withinDays && daysBetween(g.first, today) >= 0);
}

export function detectAnomalies(rows: LedgerRow[], idx: PeopleIndex, st: ChmsFinanceSettings = {}, today = todayStr()): Insight[] {
  const out: Insight[] = [];
  const rl = live(rows).filter(r => r.origin === 'LEDGER');
  const recentFrom = addDays(today, -45);
  // 1. Possible duplicates: same giver + amount + fund + date (or same check number).
  const seen = new Map<string, LedgerRow>();
  for (const r of rl.filter(x => x.date >= recentFrom)) {
    const k = `${giverKey(r)}|${r.amount}|${r.fundId}|${r.date}|${r.method}`;
    const prev = seen.get(k);
    if (prev && !(prev.splitGroupId && prev.splitGroupId === r.splitGroupId)) {
      out.push({ id: `dup_${r.id}`, kind: 'ANOMALY', severity: 'action', title: 'Possible duplicate gift', detail: `${idx.nameOf(r.personId, r.giverName)} · ${money(r.amount)} to ${r.fundName} on ${r.date} appears twice.`, rowIds: [prev.id, r.id], amount: r.amount, personId: r.personId });
    } else seen.set(k, r);
  }
  const checks = new Map<string, LedgerRow>();
  for (const r of rl.filter(x => x.method === 'CHECK' && x.checkNumber && x.date >= recentFrom)) {
    const k = `${giverKey(r)}|${r.checkNumber}`;
    const prev = checks.get(k);
    if (prev && prev.splitGroupId !== r.splitGroupId) out.push({ id: `chk_${r.id}`, kind: 'ANOMALY', severity: 'action', title: 'Check number reused', detail: `Check #${r.checkNumber} from ${idx.nameOf(r.personId, r.giverName)} was entered more than once.`, rowIds: [prev.id, r.id], personId: r.personId });
    else checks.set(k, r);
  }
  // 2. Off-pattern amounts vs the giver's own history.
  const mult = st.anomalyMultiple && st.anomalyMultiple > 1 ? st.anomalyMultiple : 5;
  const hist = new Map<string, number[]>();
  for (const r of rl.filter(x => x.date < recentFrom && x.personId)) { const a = hist.get(r.personId!) || []; a.push(r.amount); hist.set(r.personId!, a); }
  for (const r of rl.filter(x => x.date >= recentFrom && x.personId)) {
    const h = hist.get(r.personId!) || [];
    if (h.length >= 4) {
      const med = median(h);
      if (med > 0 && r.amount >= med * mult && r.amount >= 250) out.push({ id: `big_${r.id}`, kind: 'ANOMALY', severity: 'watch', title: 'Unusually large gift', detail: `${idx.nameOf(r.personId, r.giverName)} gave ${money(r.amount)} on ${r.date} — typically about ${money(med)}. Verify the amount.`, rowIds: [r.id], amount: r.amount, personId: r.personId });
    }
  }
  // 3. Round-number cash over a large threshold with no giver (anonymous large cash).
  for (const r of rl.filter(x => x.date >= recentFrom && x.method === 'CASH' && !x.personId && x.amount >= 1000)) {
    out.push({ id: `cash_${r.id}`, kind: 'ANOMALY', severity: 'watch', title: 'Large anonymous cash gift', detail: `${money(r.amount)} cash with no giver on ${r.date}. Consider recording the donor for a receipt.`, rowIds: [r.id], amount: r.amount });
  }
  return out;
}

export interface ChecklistItem { key: string; label: string; ok: boolean; detail?: string }
export function yearEndChecklist(args: { org: { legalName?: string; ein?: string; statementFooter?: string }; batches: ChmsBatch[]; rows: LedgerRow[]; people: ChmsPerson[]; pendingApprovals: number; statementsSent: number; year: number; pledges: PledgeProgress[] }): ChecklistItem[] {
  const { org, batches, rows, people, pendingApprovals, statementsSent, year, pledges } = args;
  const yr = yearRange(year);
  const yBatches = batches.filter(b => inRange(b.date, yr));
  const open = yBatches.filter(b => b.status === 'OPEN' || b.status === 'BALANCED');
  const undeposited = yBatches.filter(b => b.status === 'POSTED');
  const yRows = live(rows).filter(r => inRange(r.date, yr) && r.personId && r.deductible);
  const givers = new Set(yRows.map(r => r.personId!));
  const noAddr = [...givers].filter(id => { const p = people.find(x => x.id === id); return p && !(p.address?.line1 && p.address?.postal); });
  const unbatched = yRows.filter(r => r.origin === 'LEDGER' && !r.batchId).length;
  return [
    { key: 'legal', label: 'Legal name and EIN set for statements', ok: !!(org.legalName && org.ein), detail: !org.legalName || !org.ein ? 'Add them in Settings.' : undefined },
    { key: 'open', label: 'All batches posted', ok: open.length === 0, detail: open.length ? `${open.length} batch(es) still open` : undefined },
    { key: 'dep', label: 'All posted batches marked deposited', ok: undeposited.length === 0, detail: undeposited.length ? `${undeposited.length} posted but not deposited` : undefined },
    { key: 'approvals', label: 'No pending approvals', ok: pendingApprovals === 0, detail: pendingApprovals ? `${pendingApprovals} waiting on a second approver` : undefined },
    { key: 'addr', label: 'Every giver has a mailing address', ok: noAddr.length === 0, detail: noAddr.length ? `${noAddr.length} giver(s) missing an address` : undefined },
    { key: 'unbatched', label: 'No gifts left outside a batch', ok: unbatched === 0, detail: unbatched ? `${unbatched} gift(s) have no batch` : undefined },
    { key: 'pledges', label: 'Pledges reviewed', ok: pledges.filter(p => p.pledge.status === 'ACTIVE' && p.endDate <= yr.to && p.remaining > 0).length === 0, detail: 'Close out expired pledges.' },
    { key: 'sent', label: 'Statements generated', ok: statementsSent > 0, detail: statementsSent ? `${statementsSent} generated` : `${givers.size} givers ready` },
  ];
}

export function fundHealthInsights(funds: FundSummary[]): Insight[] {
  const out: Insight[] = [];
  for (const f of funds) {
    if (f.fund.inactive) continue;
    if (f.budget && f.budgetPct != null) {
      const monthFrac = (new Date().getMonth() + new Date().getDate() / 30) / 12;
      const expected = f.budget * monthFrac;
      if (f.ytd < expected * 0.8) out.push({ id: `fh_${f.fund.id}`, kind: 'FUND_HEALTH', severity: 'watch', title: `${f.fund.name} is behind budget`, detail: `${money(f.ytd)} year-to-date vs about ${money(expected)} expected (${f.budgetPct}% of annual budget).` });
    }
    if (f.restricted && f.balance < 0) out.push({ id: `fn_${f.fund.id}`, kind: 'FUND_HEALTH', severity: 'action', title: `${f.fund.name} (restricted) is overdrawn`, detail: `Balance ${money(f.balance)} after transfers.` });
  }
  return out;
}

// ── Generic report tables ──────────────────────────────────────────────────────
export interface ReportTable { title: string; headers: string[]; rows: (string | number)[][]; note?: string }
const sortDesc = <T,>(a: T[], f: (x: T) => number) => [...a].sort((x, y) => f(y) - f(x));

export type ReportKey = 'FUND' | 'GIVER' | 'PERIOD_WEEK' | 'PERIOD_MONTH' | 'METHOD' | 'BATCH' | 'TOP' | 'FIRST' | 'LAPSED' | 'MOVERS' | 'YOY' | 'PLEDGES' | 'BATCH_HISTORY' | 'VOIDS';
export const REPORTS: { key: ReportKey; label: string; givers?: boolean }[] = [
  { key: 'FUND', label: 'Giving by fund' }, { key: 'GIVER', label: 'Giving by giver', givers: true }, { key: 'PERIOD_WEEK', label: 'Weekly totals' },
  { key: 'PERIOD_MONTH', label: 'Monthly totals' }, { key: 'METHOD', label: 'Giving by method' }, { key: 'BATCH', label: 'Giving by batch' },
  { key: 'TOP', label: 'Top givers', givers: true }, { key: 'FIRST', label: 'First-time givers', givers: true }, { key: 'LAPSED', label: 'Lapsed givers', givers: true },
  { key: 'MOVERS', label: 'Increase / decrease givers', givers: true }, { key: 'YOY', label: 'Year over year' }, { key: 'PLEDGES', label: 'Outstanding pledges', givers: true },
  { key: 'BATCH_HISTORY', label: 'Batch history' }, { key: 'VOIDS', label: 'Voided gifts audit' },
];

function isoWeekStart(iso: string): string { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() - d.getDay()); return todayStr(d); }

export function runReport(key: ReportKey, a: { rows: LedgerRow[]; range: DateRange; batches: ChmsBatch[]; pledges: PledgeProgress[]; idx: PeopleIndex; settings?: ChmsFinanceSettings; today?: string; users?: Record<string, string> }): ReportTable {
  const today = a.today || todayStr();
  const inR = live(a.rows).filter(r => inRange(r.date, a.range));
  const rangeNote = `${a.range.from} to ${a.range.to}`;
  switch (key) {
    case 'FUND': { const t = totalsBy(inR, r => r.fundName); return { title: 'Giving by fund', note: rangeNote, headers: ['Fund', 'Gifts', 'Total'], rows: sortDesc(Object.entries(t), ([, v]) => v.total).map(([k, v]) => [k, v.count, v.total]) }; }
    case 'METHOD': { const t = totalsBy(inR, r => r.method); return { title: 'Giving by method', note: rangeNote, headers: ['Method', 'Gifts', 'Total'], rows: sortDesc(Object.entries(t), ([, v]) => v.total).map(([k, v]) => [k, v.count, v.total]) }; }
    case 'BATCH': { const t = totalsBy(inR, r => r.batchId ? (a.batches.find(b => b.id === r.batchId)?.name || r.batchId) : (r.origin === 'ONLINE' ? 'Online (Stripe)' : '(no batch)')); return { title: 'Giving by batch', note: rangeNote, headers: ['Batch', 'Gifts', 'Total'], rows: Object.entries(t).map(([k, v]) => [k, v.count, v.total]) }; }
    case 'PERIOD_WEEK': case 'PERIOD_MONTH': {
      const t = totalsBy(inR, r => key === 'PERIOD_WEEK' ? isoWeekStart(r.date) : r.date.slice(0, 7));
      return { title: key === 'PERIOD_WEEK' ? 'Weekly totals (week starting Sunday)' : 'Monthly totals', note: rangeNote, headers: [key === 'PERIOD_WEEK' ? 'Week of' : 'Month', 'Gifts', 'Total'], rows: Object.entries(t).sort(([x], [y]) => x.localeCompare(y)).map(([k, v]) => [k, v.count, v.total]) };
    }
    case 'GIVER': { const g = sortDesc(aggregateGivers(inR, a.idx), x => x.total); return { title: 'Giving by giver', note: rangeNote, headers: ['Giver', 'Gifts', 'Total', 'First gift', 'Last gift'], rows: g.map(x => [x.name, x.count, x.total, x.first, x.last]) }; }
    case 'TOP': { const g = sortDesc(aggregateGivers(inR, a.idx).filter(x => x.key !== 'anon'), x => x.total).slice(0, 25); return { title: 'Top 25 givers', note: rangeNote, headers: ['Rank', 'Giver', 'Total', 'Gifts'], rows: g.map((x, i) => [i + 1, x.name, x.total, x.count]) }; }
    case 'FIRST': { const g = firstTimeGivers(a.rows, a.idx, Math.max(1, daysBetween(a.range.from, a.range.to)), a.range.to < today ? a.range.to : today).filter(x => x.first >= a.range.from); return { title: 'First-time givers', note: rangeNote, headers: ['Giver', 'First gift', 'Amount to date', 'Gifts'], rows: g.map(x => [x.name, x.first, x.total, x.count]) }; }
    case 'LAPSED': { const g = lapsedGivers(a.rows, a.idx, a.settings?.lapsedDays || 60, today); return { title: 'Lapsed givers', note: `No gift in ${a.settings?.lapsedDays || 60}+ days (gave 3+ times in the past year)`, headers: ['Giver', 'Last gift', 'Days since', 'Gifts in past year', 'Past-year total'], rows: g.map(x => [x.name, x.last, daysBetween(x.last, today), x.count, x.total]) }; }
    case 'MOVERS': {
      const len = daysBetween(a.range.from, a.range.to) + 1;
      const prevRange = { from: addDays(a.range.from, -len), to: addDays(a.range.from, -1) };
      const cur = new Map(aggregateGivers(inR, a.idx).map(g => [g.key, g]));
      const prev = new Map(aggregateGivers(live(a.rows).filter(r => inRange(r.date, prevRange)), a.idx).map(g => [g.key, g]));
      const keys = new Set([...cur.keys(), ...prev.keys()]); keys.delete('anon');
      const rows = [...keys].map(k => { const c = cur.get(k)?.total || 0, p = prev.get(k)?.total || 0; return { name: (cur.get(k) || prev.get(k))!.name, c, p, d: round2(c - p) }; }).filter(x => x.d !== 0).sort((x, y) => y.d - x.d);
      return { title: 'Increase / decrease givers', note: `${rangeNote} vs the prior ${len} days (${prevRange.from} to ${prevRange.to})`, headers: ['Giver', 'Prior period', 'This period', 'Change'], rows: rows.map(x => [x.name, x.p, x.c, x.d]) };
    }
    case 'YOY': {
      const y = new Date(a.range.to + 'T00:00:00').getFullYear();
      const months = Array.from({ length: 12 }, (_, i) => i);
      const rl = live(a.rows);
      const tot = (yr: number, m: number) => sum(rl.filter(r => r.date.startsWith(`${yr}-${String(m + 1).padStart(2, '0')}`)));
      const rows = months.map(m => { const c = tot(y, m), p = tot(y - 1, m); return [new Date(2000, m, 1).toLocaleString('en-US', { month: 'short' }), p, c, round2(c - p)]; });
      rows.push(['Total', round2(rows.reduce((s, r) => s + Number(r[1]), 0)), round2(rows.reduce((s, r) => s + Number(r[2]), 0)), round2(rows.reduce((s, r) => s + Number(r[3]), 0))]);
      return { title: `Year over year: ${y} vs ${y - 1}`, headers: ['Month', String(y - 1), String(y), 'Change'], rows };
    }
    case 'PLEDGES': { const p = a.pledges.filter(x => x.pledge.status === 'ACTIVE' && x.remaining > 0); return { title: 'Outstanding pledges', headers: ['Giver', 'Fund', 'Pledged', 'Given', 'Remaining', '% fulfilled', 'Behind pace by', 'Ends'], rows: p.map(x => [x.name, x.pledge.fundName, x.pledge.amount, x.given, x.remaining, x.pct, x.behind, x.endDate]) }; }
    case 'BATCH_HISTORY': { const bs = a.batches.filter(b => inRange(b.date, a.range)).sort((x, y) => y.date.localeCompare(x.date)); return { title: 'Batch history', note: rangeNote, headers: ['Batch', 'Date', 'Status', 'Gifts', 'Total', 'Expected', 'Variance', 'Override reason'], rows: bs.map(b => { const t = batchTotals(b, a.rows); return [b.name, b.date, b.status, t.count, t.total, b.expectedTotal ?? '', b.expectedTotal != null ? t.variance : '', b.overrideReason || '']; }) }; }
    case 'VOIDS': { const v = a.rows.filter(r => r.status === 'VOID' && (!r.voidedAt || inRange(todayStr(new Date(r.voidedAt)), a.range) || inRange(r.date, a.range))); return { title: 'Voided gifts audit', note: rangeNote, headers: ['Gift date', 'Giver', 'Fund', 'Amount', 'Voided on', 'Voided by', 'Reason'], rows: v.map(r => [r.date, a.idx.nameOf(r.personId, r.giverName), r.fundName, r.amount, r.voidedAt ? todayStr(new Date(r.voidedAt)) : '', a.users?.[r.voidedBy || ''] || r.voidedBy || '', r.voidReason || '']) }; }
  }
}

// ── CSV + exports ──────────────────────────────────────────────────────────────
const csvCell = (v: any): string => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const toCsv = (headers: string[], rows: (string | number | undefined | null)[][]): string => [headers, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8'): void {
  const blob = new Blob(['﻿' + text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export const tableToCsv = (t: ReportTable): string => toCsv(t.headers, t.rows);

/** Full ledger export — every field, round-trippable. */
export function contributionsCsv(rows: LedgerRow[], idx: PeopleIndex, batches: ChmsBatch[]): string {
  const bn = new Map(batches.map(b => [b.id, b.name]));
  return toCsv(['Date', 'Giver', 'Household', 'Fund', 'Amount', 'Method', 'Check #', 'Batch', 'Memo', 'Tribute', 'Deductible', 'Status', 'Void reason', 'Source'],
    rows.map(r => [r.date, r.anonymous ? 'Anonymous' : idx.nameOf(r.personId, r.giverName), idx.householdNameOf(r.householdId), r.fundName, r.amount, r.method, r.checkNumber, bn.get(r.batchId || '') || '', r.memo, r.tributeNote, r.deductible ? 'Y' : 'N', r.status, r.voidReason, r.origin === 'ONLINE' ? 'Online (Stripe)' : r.source?.system || 'Plajah']));
}
/** Servant-Keeper-style flat contribution export (best-effort column set, one row per fund line). */
export function servantKeeperCsv(rows: LedgerRow[], idx: PeopleIndex, batches: ChmsBatch[]): string {
  const bn = new Map(batches.map(b => [b.id, b.name]));
  return toCsv(['Individual ID', 'Family ID', 'Envelope Number', 'Last Name', 'First Name', 'Contribution Date', 'Fund Name', 'Amount', 'Contribution Type', 'Check Number', 'Batch Number', 'Memo', 'Tax Deductible'],
    live(rows).map(r => { const p = r.personId ? idx.byId.get(r.personId) : undefined; return [r.personId || '', r.householdId || '', p ? envelopeOf(p) : '', p?.lastName || r.giverName || 'Anonymous', p?.firstName || '', r.date, r.fundName, r.amount.toFixed(2), r.method === 'CHECK' ? 'Check' : r.method === 'CASH' ? 'Cash' : r.method === 'ONLINE' ? 'Online' : r.method, r.checkNumber, bn.get(r.batchId || '') || '', r.memo, r.deductible ? 'Yes' : 'No']; }));
}

const iifDate = (iso: string) => { const [y, m, d] = iso.split('-'); return `${m}/${d}/${y}`; };
export interface QbOptions { depositAccount: string; incomePrefix: string; funds: GivingFund[] }
/** QuickBooks Desktop IIF: one DEPOSIT per batch (or per day for unbatched/online) with a credit split per fund. */
export function quickBooksIif(rows: LedgerRow[], batches: ChmsBatch[], o: QbOptions): string {
  const fundAcct = (r: LedgerRow) => { const f = o.funds.find(x => x.id === r.fundId || x.name === r.fundName); return `${o.incomePrefix}${f?.accountCode || r.fundName}`; };
  const groups = new Map<string, { date: string; memo: string; rows: LedgerRow[] }>();
  for (const r of live(rows)) {
    const b = r.batchId ? batches.find(x => x.id === r.batchId) : undefined;
    const key = b ? `b:${b.id}` : `d:${r.origin === 'ONLINE' ? 'online' : 'misc'}:${r.date}`;
    const g = groups.get(key) || { date: b?.date || r.date, memo: b ? `Batch ${b.name}` : r.origin === 'ONLINE' ? 'Online giving (Stripe)' : 'Unbatched gifts', rows: [] };
    g.rows.push(r); groups.set(key, g);
  }
  const lines = ['!TRNS\tTRNSTYPE\tDATE\tACCNT\tAMOUNT\tMEMO', '!SPL\tTRNSTYPE\tDATE\tACCNT\tAMOUNT\tMEMO', '!ENDTRNS'];
  for (const g of [...groups.values()].sort((a, b) => a.date.localeCompare(b.date))) {
    lines.push(`TRNS\tDEPOSIT\t${iifDate(g.date)}\t${o.depositAccount}\t${sum(g.rows).toFixed(2)}\t${g.memo}`);
    const byAcct = new Map<string, number>();
    g.rows.forEach(r => byAcct.set(fundAcct(r), round2((byAcct.get(fundAcct(r)) || 0) + r.amount)));
    byAcct.forEach((amt, acct) => lines.push(`SPL\tDEPOSIT\t${iifDate(g.date)}\t${acct}\t${(-amt).toFixed(2)}\t${g.memo}`));
    lines.push('ENDTRNS');
  }
  return lines.join('\r\n') + '\r\n';
}
/** Journal CSV by fund/class — for QuickBooks Online "import journal entries" or any GL. */
export function journalCsv(rows: LedgerRow[], batches: ChmsBatch[], o: QbOptions): string {
  const out: (string | number)[][] = [];
  const groups = new Map<string, LedgerRow[]>();
  for (const r of live(rows)) { const b = batches.find(x => x.id === r.batchId); const k = `${b?.date || r.date}|${b?.name || (r.origin === 'ONLINE' ? 'Online giving' : 'Unbatched')}`; (groups.get(k) || groups.set(k, []).get(k)!).push(r); }
  let n = 1;
  for (const [k, rs] of [...groups.entries()].sort()) {
    const [date, name] = k.split('|');
    const entry = `GJ-${String(n++).padStart(5, '0')}`;
    out.push([entry, date, o.depositAccount, '', sum(rs), 0, name, '']);
    const byFund = totalsBy(rs, r => r.fundName);
    for (const [fund, v] of Object.entries(byFund)) { const f = o.funds.find(x => x.name === fund); out.push([entry, date, `${o.incomePrefix}${f?.accountCode || fund}`, fund, 0, v.total, name, fund]); }
  }
  return toCsv(['Journal No', 'Date', 'Account', 'Class (Fund)', 'Debit', 'Credit', 'Memo', 'Fund'], out);
}

// ── Statements ─────────────────────────────────────────────────────────────────
export interface StatementData {
  key: string; name: string; address?: ChmsPerson['address']; personIds: string[]; householdId?: string; email?: string; linkedUids: string[];
  lines: { date: string; fund: string; amount: number; method: string; memo?: string; tribute?: string; inKind?: boolean }[];
  total: number; byFund: Record<string, number>; range: DateRange;
}
/** Statements for every giver (or household when `byHousehold`) with deductible gifts in the range. */
export function buildStatements(rows: LedgerRow[], people: ChmsPerson[], households: ChmsHousehold[], range: DateRange, byHousehold: boolean): StatementData[] {
  const idx = indexPeople(people, households);
  const rl = live(rows).filter(r => r.deductible && inRange(r.date, range) && r.personId && !r.anonymous);
  const groups = new Map<string, LedgerRow[]>();
  for (const r of rl) {
    const p = idx.byId.get(r.personId!);
    const hid = r.householdId || p?.householdId;
    const k = byHousehold && hid ? `h:${hid}` : `p:${r.personId}`;
    (groups.get(k) || groups.set(k, []).get(k)!).push(r);
  }
  const out: StatementData[] = [];
  for (const [key, rs] of groups) {
    const first = rs[0];
    const p = idx.byId.get(first.personId!);
    const hid = key.startsWith('h:') ? key.slice(2) : undefined;
    const hh = hid ? idx.households.get(hid) : undefined;
    const head = hh?.headPersonId ? idx.byId.get(hh.headPersonId) : undefined;
    const members = hid ? people.filter(x => x.householdId === hid) : (p ? [p] : []);
    const addrSrc = [hh?.address, head?.address, p?.address, ...members.map(m => m.address)].find(a => a && a.line1);
    const name = hh && byHousehold ? (hh.name || idx.nameOf(head?.id)) : idx.nameOf(first.personId, first.giverName);
    const byFund: Record<string, number> = {};
    rs.forEach(r => { byFund[r.fundName] = round2((byFund[r.fundName] || 0) + r.amount); });
    out.push({
      key, name, address: addrSrc || undefined, personIds: members.map(m => m.id).length ? members.map(m => m.id) : [first.personId!], householdId: hid,
      email: (head?.email || p?.email || members.find(m => m.email)?.email), linkedUids: [...new Set(members.map(m => m.linkedUid).filter(Boolean) as string[])],
      lines: rs.sort((a, b) => a.date.localeCompare(b.date)).map(r => ({ date: r.date, fund: r.fundName, amount: r.amount, method: r.method, memo: r.memo, tribute: r.tributeNote, inKind: r.method === 'INKIND' })),
      total: sum(rs), byFund, range,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

const esc = (s: any) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
export interface StatementOrg { name: string; legalName?: string; ein?: string; statementFooter?: string; address?: string; intro?: string; faith?: boolean }
export const NO_GOODS_TEXT = (faith: boolean) => faith
  ? 'No goods or services were provided in exchange for these contributions, other than intangible religious benefits.'
  : 'No goods or services were provided in exchange for these contributions.';

/** Printable HTML (browser print / Save as PDF). One page-broken statement per giver. */
export function statementsHtml(stmts: StatementData[], org: StatementOrg): string {
  const pages = stmts.map(s => {
    const a = s.address;
    const addr = a ? [a.line1, a.line2, [a.city, a.region].filter(Boolean).join(', ') + (a.postal ? ' ' + a.postal : '')].filter(Boolean).map(esc).join('<br/>') : '';
    const fundRows = Object.entries(s.byFund).map(([f, v]) => `<tr><td>${esc(f)}</td><td class="r">${money(v)}</td></tr>`).join('');
    const lineRows = s.lines.map(l => `<tr><td>${esc(l.date)}</td><td>${esc(l.fund)}</td><td>${esc(l.method)}${l.tribute ? ' &middot; ' + esc(l.tribute) : ''}${l.inKind ? ' (in-kind: no value assigned)' : ''}</td><td class="r">${money(l.amount)}</td></tr>`).join('');
    return `<section class="page">
<header><div><h1>${esc(org.legalName || org.name)}</h1>${org.ein ? `<p>EIN ${esc(org.ein)}</p>` : ''}${org.address ? `<p>${esc(org.address)}</p>` : ''}</div><div class="r"><h2>Contribution Statement</h2><p>${esc(s.range.label)} &middot; ${esc(s.range.from)} to ${esc(s.range.to)}</p></div></header>
<div class="to">${esc(s.name)}<br/>${addr || '<em>No mailing address on file</em>'}</div>
${org.intro ? `<p>${esc(org.intro)}</p>` : `<p>Thank you for your generous support of ${esc(org.name)}.</p>`}
<table><thead><tr><th>Date</th><th>Fund</th><th>Type</th><th class="r">Amount</th></tr></thead><tbody>${lineRows}</tbody><tfoot><tr><td colspan="3">Total contributions</td><td class="r">${money(s.total)}</td></tr></tfoot></table>
<h3>Summary by fund</h3><table class="sm"><tbody>${fundRows}</tbody></table>
<p class="legal">${esc(NO_GOODS_TEXT(!!org.faith))}</p>${org.statementFooter ? `<p class="legal">${esc(org.statementFooter)}</p>` : ''}
</section>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Contribution statements</title><style>
body{font-family:Georgia,'Times New Roman',serif;color:#111;margin:0}.page{padding:48px 56px;page-break-after:always;min-height:9in}
header{display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:24px}h1{font-size:20px;margin:0}h2{font-size:16px;margin:0}h3{font-size:13px;margin:22px 0 6px}
p{font-size:12px;margin:4px 0}.r{text-align:right}.to{font-size:13px;margin:0 0 18px;line-height:1.4}table{width:100%;border-collapse:collapse;font-size:12px;margin-top:10px}
th,td{padding:5px 6px;border-bottom:1px solid #ccc;text-align:left}th.r,td.r{text-align:right}tfoot td{font-weight:bold;border-top:2px solid #111}.sm{width:55%}.legal{margin-top:20px;font-size:11px;color:#333;font-style:italic}
@media print{.page{padding:0.5in 0.6in}}</style></head><body>${pages || '<p>No statements.</p>'}</body></html>`;
}
export function openPrintWindow(html: string): boolean {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open(); w.document.write(html); w.document.close();
  w.focus(); setTimeout(() => { try { w.print(); } catch { /* user can print manually */ } }, 350);
  return true;
}
/** Avery 5160-style label data: CSV for mail-merge. */
export function mailingLabelsCsv(stmts: StatementData[]): string {
  return toCsv(['Name', 'Address 1', 'Address 2', 'City', 'State', 'Zip'], stmts.filter(s => s.address?.line1).map(s => [s.name, s.address!.line1, s.address!.line2, s.address!.city, s.address!.region, s.address!.postal]));
}

export function depositSlipHtml(batch: ChmsBatch, rows: LedgerRow[], idx: PeopleIndex, orgName: string): string {
  const t = batchTotals(batch, rows);
  const mine = rows.filter(r => r.batchId === batch.id && r.status !== 'VOID').sort((a, b) => a.method.localeCompare(b.method));
  const lines = mine.map(r => `<tr><td>${esc(r.method)}${r.checkNumber ? ' #' + esc(r.checkNumber) : ''}</td><td>${esc(r.anonymous ? 'Anonymous' : idx.nameOf(r.personId, r.giverName))}</td><td>${esc(r.fundName)}</td><td class="r">${money(r.amount)}</td></tr>`).join('');
  const meth = Object.entries(t.byMethod).map(([m, v]) => `<tr><td>${esc(m)}</td><td class="r">${money(v)}</td></tr>`).join('');
  const fund = Object.entries(t.byFund).map(([m, v]) => `<tr><td>${esc(m)}</td><td class="r">${money(v)}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Deposit slip</title><style>body{font-family:Arial,sans-serif;padding:36px;color:#111}h1{font-size:20px;margin:0}table{width:100%;border-collapse:collapse;font-size:12px;margin:10px 0}th,td{border-bottom:1px solid #ccc;padding:4px 6px;text-align:left}.r{text-align:right}.box{display:flex;gap:24px}.box>div{flex:1}.sig{margin-top:40px;display:flex;gap:40px}.sig div{flex:1;border-top:1px solid #111;font-size:11px;padding-top:4px}</style></head><body>
<h1>${esc(orgName)} &mdash; Deposit Slip</h1><p>Batch <b>${esc(batch.name)}</b> &middot; ${esc(batch.date)} &middot; ${esc(batch.status)}${batch.overrideReason ? ' &middot; OVERRIDE: ' + esc(batch.overrideReason) : ''}</p>
<p>Items: <b>${t.count}</b> &nbsp; Total: <b>${money(t.total)}</b>${t.expectedTotal != null ? ` &nbsp; Expected: ${money(t.expectedTotal)} &nbsp; Variance: ${money(t.variance)}` : ''}</p>
<div class="box"><div><h3>By method</h3><table><tbody>${meth}</tbody></table></div><div><h3>By fund</h3><table><tbody>${fund}</tbody></table></div></div>
<h3>Items</h3><table><thead><tr><th>Type</th><th>Giver</th><th>Fund</th><th class="r">Amount</th></tr></thead><tbody>${lines}</tbody></table>
<div class="sig"><div>Counted by</div><div>Counted by (second)</div><div>Deposited by / date</div></div></body></html>`;
}

// ── Recurring schedules ────────────────────────────────────────────────────────
export interface RecurringSpec { id: string; orgId: string; personId?: string; giverName?: string; fundId: string; fundName: string; amount: number; method: ChmsContribution['method']; frequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'; startDate: string; endDate?: string; lastGenerated?: string; active: boolean; memo?: string }
/** Dates (YYYY-MM-DD) owed by a schedule through `upTo`, after lastGenerated. Capped for safety. */
export function dueDates(r: RecurringSpec, upTo = todayStr(), cap = 60): string[] {
  const out: string[] = [];
  const stop = r.endDate && r.endDate < upTo ? r.endDate : upTo;
  const startD = new Date(r.startDate + 'T00:00:00');
  for (let i = 0; i < 2000 && out.length < cap; i++) {
    const d = new Date(startD);
    if (r.frequency === 'WEEKLY') d.setDate(d.getDate() + 7 * i);
    else if (r.frequency === 'BIWEEKLY') d.setDate(d.getDate() + 14 * i);
    else d.setMonth(d.getMonth() + i);
    const s = todayStr(d);
    if (s > stop) break;
    if (!r.lastGenerated || s > r.lastGenerated) out.push(s);
  }
  return out;
}

// ── Reconciliation (online giving vs Stripe payouts) ───────────────────────────
export interface PayoutRec { id: string; payoutDate: string; periodStart: string; periodEnd: string; gross: number; fees: number; net: number; ref?: string; note?: string }
export interface PayoutCheck { payout: PayoutRec; ledgerGross: number; ledgerCount: number; grossVariance: number; netVariance: number; feePct: number; flags: string[] }
export function reconcilePayouts(payouts: PayoutRec[], rows: LedgerRow[]): PayoutCheck[] {
  const online = live(rows).filter(r => r.origin === 'ONLINE' || r.method === 'ONLINE' || !!r.stripePaymentId);
  return payouts.map(p => {
    const inP = online.filter(r => inRange(r.date, { from: p.periodStart, to: p.periodEnd }));
    const ledgerGross = sum(inP);
    const grossVariance = round2(p.gross - ledgerGross);
    const netVariance = round2(p.gross - p.fees - p.net);
    const feePct = p.gross ? round2((p.fees / p.gross) * 100) : 0;
    const flags: string[] = [];
    if (Math.abs(grossVariance) >= 0.01) flags.push(`Payout gross differs from ledger by ${money(grossVariance)}`);
    if (Math.abs(netVariance) >= 0.01) flags.push(`Gross − fees ≠ net (off by ${money(netVariance)})`);
    if (p.gross && (feePct > 4.5 || feePct < 0.5)) flags.push(`Fee rate ${feePct}% looks unusual`);
    return { payout: p, ledgerGross, ledgerCount: inP.length, grossVariance, netVariance, feePct, flags };
  });
}
// Automatic (Stripe-synced) reconciliation: ChmsPayout + ChmsPayoutLine, no hand-typed figures.
export interface StripePayoutCheck {
  payout: ChmsPayout; lines: ChmsPayoutLine[]; giftLines: ChmsPayoutLine[]; matchedCount: number; unmatchedCount: number;
  /** payout.amount − Σ line net — non-zero means Stripe moved money we can't itemise (adjustments, itemisation gap). */
  difference: number; flags: string[]; reconciled: boolean;
}
export function reconcileStripePayouts(payouts: ChmsPayout[], lines: ChmsPayoutLine[]): StripePayoutCheck[] {
  const byPayout = new Map<string, ChmsPayoutLine[]>();
  lines.forEach(l => { const a = byPayout.get(l.payoutId) || []; a.push(l); byPayout.set(l.payoutId, a); });
  return payouts.map(p => {
    const ls = (byPayout.get(p.id) || []).sort((a, b) => a.date.localeCompare(b.date));
    const giftLines = ls.filter(l => l.type === 'payment' || l.type === 'charge');
    const matchedCount = giftLines.filter(l => !!l.contributionId).length;
    const unmatchedCount = giftLines.length - matchedCount;
    const difference = p.difference ?? (ls.length ? round2(p.amount - sum(ls.map(l => ({ amount: l.net })))) : 0);
    const flags: string[] = [];
    if (p.status === 'failed') flags.push('Payout failed — Stripe returned the money; check the bank account on file');
    if (p.status === 'canceled') flags.push('Payout was canceled');
    if (p.unitemized) flags.push('Stripe can’t itemise this payout (manual payout) — totals are unverified');
    else if (p.status === 'paid' && !ls.length) flags.push('No line items synced yet — press Sync now');
    if (Math.abs(difference) >= 0.01) flags.push(`Unexplained difference of ${money(difference)} between the payout and its line items`);
    if (unmatchedCount > 0) flags.push(`${unmatchedCount} line${unmatchedCount === 1 ? '' : 's'} not matched to a gift in the ledger`);
    return { payout: p, lines: ls, giftLines, matchedCount, unmatchedCount, difference, flags, reconciled: p.status === 'paid' && !flags.length };
  });
}

/** Online-ish rows worth a second look: no payment id, or a manual ONLINE row that mirrors a native donation. */
export function onlineLedgerFlags(rows: LedgerRow[]): { row: LedgerRow; flag: string }[] {
  const out: { row: LedgerRow; flag: string }[] = [];
  const native = rows.filter(r => r.origin === 'ONLINE' && r.status !== 'VOID');
  for (const r of rows.filter(x => x.origin === 'LEDGER' && x.status !== 'VOID' && x.method === 'ONLINE')) {
    if (!r.stripePaymentId) out.push({ row: r, flag: 'Online gift with no Stripe payment id (cannot be deduped)' });
    const twin = native.find(n => n.amount === r.amount && Math.abs(daysBetween(n.date, r.date)) <= 2 && (n.personId === r.personId || n.fundId === r.fundId));
    if (twin) out.push({ row: r, flag: `Possible double count with native online gift ${twin.date}` });
  }
  return out;
}
