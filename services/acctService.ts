// acctService — Firestore IO + rules for the Elevate Books (double-entry ledger).
//
//  • Journals are append-only: corrections are REVERSALS (reverseJournal), never edits or deletes.
//  • Every journal id is journalDocId(orgId, key) — the Stripe webhooks (server.ts) and this client post the
//    same events, so a second write is a no-op instead of a double count.
//  • Posting into a CLOSED period is refused until the period is reopened (with an audit entry).
//  • Gifts never fall through the cracks: backfillGiftJournals() posts a journal for every gift/deposit that
//    lacks one, and voiding a gift posts its reversal. chmsFinance calls onFinanceChange() after post/deposit/void.
//
// For the Spending builder: use acctPosting builders (expenseEntry / billEntry / billPaymentEntry) +
//   `await postJournal(orgId, draft, uid)` and `await sysAccounts(orgId)`; both honour period locks.

import {
  collection, doc, getDoc, getDocs, query, where, writeBatch, setDoc, updateDoc, limit as fbLimit,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { logOrgAction, type OrgAuditAction } from './orgAudit';
import { callGemini } from './geminiService';
import type {
  AcctAccount, AcctBankAccount, AcctBankTxn, AcctBudget, AcctExpense, AcctJournal, AcctPeriod, AcctVendor, ChmsBatch, ChmsContribution, ChmsPayout, Organization,
} from '../types';
import {
  DEFAULT_CHART, accountDocId, journalDocId, isBalanced, reversalOf, periodOf, sysAccountsOf, type DraftJournal, type SysAccounts,
} from './acctPosting';
import { buildManualDraft, buildOpeningDraft, planGiftJournals, periodRange, type ManualLineInput, type OpeningInput } from './acctReports';
import { bankTxnDocId, detectColumns, parseCsv, toBankLines, type CategoryGuess, type MatchCandidate } from './acctBank';
import { todayStr } from './chmsFinanceReports';

const uidOrThrow = (): string => { const u = auth.currentUser?.uid; if (!u) throw new Error('Sign in required'); return u; };
const strip = <T,>(o: T): T => JSON.parse(JSON.stringify(o));   // drops undefined (Firestore rejects it)
const safeId = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '_');
const audit = (orgId: string, action: OrgAuditAction, target?: string, meta?: Record<string, any>) => { logOrgAction(orgId, action, { targetName: target, meta: meta ? strip(meta) : undefined }).catch(() => {}); };
export const auditExport = (orgId: string, what: string, meta?: Record<string, any>) => audit(orgId, 'ACCT_EXPORT', what, meta);

async function listBy<T>(col: string, orgId: string, max = 50000): Promise<T[]> {
  const snap = await getDocs(query(collection(db, col), where('orgId', '==', orgId), fbLimit(max)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as unknown as T));
}

// ── Snapshot ───────────────────────────────────────────────────────────────────
export interface Books {
  accounts: AcctAccount[]; journals: AcctJournal[]; vendors: AcctVendor[]; bankAccounts: AcctBankAccount[]; bankTxns: AcctBankTxn[];
  budgets: AcctBudget[]; periods: AcctPeriod[]; expenses: AcctExpense[]; payouts: ChmsPayout[];
  sys: SysAccounts; closed: Set<string>; loadedAt: number; errors: string[];
}
export async function loadBooks(orgId: string): Promise<Books> {
  const errors: string[] = [];
  const safe = async <T,>(label: string, p: Promise<T[]>): Promise<T[]> => { try { return await p; } catch (e: any) { errors.push(`${label}: ${e?.code || e?.message || 'failed'}`); return []; } };
  const [accounts, journals, vendors, bankAccounts, bankTxns, budgets, periods, expenses, payouts] = await Promise.all([
    safe('accounts', listBy<AcctAccount>('acctAccounts', orgId, 2000)),
    safe('journals', listBy<AcctJournal>('acctJournals', orgId)),
    safe('vendors', listBy<AcctVendor>('acctVendors', orgId, 5000)),
    safe('bank accounts', listBy<AcctBankAccount>('acctBankAccounts', orgId, 200)),
    safe('bank lines', listBy<AcctBankTxn>('acctBankTxns', orgId)),
    safe('budgets', listBy<AcctBudget>('acctBudgets', orgId, 100)),
    safe('periods', listBy<AcctPeriod>('acctPeriods', orgId, 500)),
    safe('expenses', listBy<AcctExpense>('acctExpenses', orgId, 20000)),
    safe('payouts', listBy<ChmsPayout>('chmsPayouts', orgId, 5000)),
  ]);
  return {
    accounts, journals: journals.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt), vendors, bankAccounts, bankTxns, budgets, periods, expenses, payouts,
    sys: sysAccountsOf(accounts), closed: new Set(periods.filter(p => p.status === 'CLOSED').map(p => p.period)), loadedAt: Date.now(), errors,
  };
}
/** Giving facts the checklist/overview need (gifts + batches). Empty when the viewer cannot read giving data. */
export async function loadGivingFacts(orgId: string): Promise<{ contributions: ChmsContribution[]; batches: ChmsBatch[]; restricted: boolean }> {
  let restricted = false;
  const safe = async <T,>(p: Promise<T[]>): Promise<T[]> => { try { return await p; } catch { restricted = true; return []; } };
  const [contributions, batches] = await Promise.all([safe(listBy<ChmsContribution>('chmsContributions', orgId)), safe(listBy<ChmsBatch>('chmsBatches', orgId, 5000))]);
  return { contributions, batches, restricted };
}
/** Read-only slice for department heads (rules let leaders read accounts, budgets and expenses only). */
export async function loadDeptBooks(orgId: string): Promise<{ accounts: AcctAccount[]; budgets: AcctBudget[]; expenses: AcctExpense[]; errors: string[] }> {
  const errors: string[] = [];
  const safe = async <T,>(l: string, p: Promise<T[]>) => { try { return await p; } catch (e: any) { errors.push(`${l}: ${e?.code || 'failed'}`); return [] as T[]; } };
  const [accounts, budgets, expenses] = await Promise.all([safe('accounts', listBy<AcctAccount>('acctAccounts', orgId, 2000)), safe('budgets', listBy<AcctBudget>('acctBudgets', orgId, 100)), safe('expenses', listBy<AcctExpense>('acctExpenses', orgId, 20000))]);
  return { accounts, budgets, expenses, errors };
}

// ── Chart of accounts ──────────────────────────────────────────────────────────
/** Seed DEFAULT_CHART (deterministic ids). Idempotent; never overwrites an account the church has edited. Mirrors server ensureOrgChart. */
export async function ensureChart(orgId: string): Promise<{ sys: SysAccounts; accounts: AcctAccount[]; seeded: number }> {
  const existing = await listBy<AcctAccount>('acctAccounts', orgId, 2000);
  const ids = new Set(existing.map(a => a.id)), codes = new Set(existing.map(a => a.code)), keys = new Set(existing.map(a => a.systemKey).filter(Boolean));
  const add: AcctAccount[] = [];
  for (const s of DEFAULT_CHART) {
    const id = accountDocId(orgId, s.code);
    if (ids.has(id) || codes.has(s.code) || (s.systemKey && keys.has(s.systemKey))) continue;
    add.push({ ...s, id, orgId, createdAt: Date.now() } as AcctAccount);
  }
  for (let i = 0; i < add.length; i += 400) { const wb = writeBatch(db); add.slice(i, i + 400).forEach(a => wb.set(doc(db, 'acctAccounts', a.id), strip(a))); await wb.commit(); }
  const accounts = [...existing, ...add];
  if (add.length) audit(orgId, 'ACCT_SETUP', 'chart of accounts seeded', { accounts: add.length });
  _sysCache.delete(orgId);
  return { sys: sysAccountsOf(accounts), accounts, seeded: add.length };
}
const _sysCache = new Map<string, { sys: SysAccounts; exp: number }>();
/** systemKey → accountId for the org (seeds the chart if empty). Cached for a minute. */
export async function sysAccounts(orgId: string): Promise<SysAccounts> {
  const hit = _sysCache.get(orgId); if (hit && hit.exp > Date.now()) return hit.sys;
  let accts = await listBy<AcctAccount>('acctAccounts', orgId, 2000);
  if (!accts.length) accts = (await ensureChart(orgId)).accounts;
  const sys = sysAccountsOf(accts); _sysCache.set(orgId, { sys, exp: Date.now() + 60_000 }); return sys;
}
export async function saveAccount(orgId: string, a: Partial<AcctAccount> & { code: string; name: string; type: AcctAccount['type'] }): Promise<AcctAccount> {
  uidOrThrow();
  if (!/^[\w.-]{1,12}$/.test(a.code)) throw new Error('Account codes are short (letters, numbers, dot or dash).');
  const id = a.id || accountDocId(orgId, a.code);
  const ref = doc(db, 'acctAccounts', id); const snap = await getDoc(ref);
  if (!a.id && snap.exists()) throw new Error(`Account code ${a.code} is already in use.`);
  const base = snap.exists() ? (snap.data() as AcctAccount) : ({ id, orgId, createdAt: Date.now(), active: true } as AcctAccount);
  const next: AcctAccount = strip({ ...base, ...a, id, orgId, active: a.active ?? base.active });
  await setDoc(ref, next);
  audit(orgId, 'ACCT_SETUP', `account ${a.code} ${a.name}`, { id });
  return next;
}

// ── Periods ────────────────────────────────────────────────────────────────────
export const periodDocId = (orgId: string, period: string) => `p_${safeId(orgId)}_${period}`;
async function closedSet(orgId: string): Promise<Set<string>> {
  try { return new Set((await listBy<AcctPeriod>('acctPeriods', orgId, 500)).filter(p => p.status === 'CLOSED').map(p => p.period)); } catch { return new Set(); }
}
export async function closePeriod(orgId: string, period: string, checklist?: Record<string, boolean>): Promise<void> {
  const uid = uidOrThrow();
  await setDoc(doc(db, 'acctPeriods', periodDocId(orgId, period)), strip({ id: periodDocId(orgId, period), orgId, period, status: 'CLOSED', closedBy: uid, closedAt: Date.now(), checklist }));
  audit(orgId, 'ACCT_CLOSE', period, { checklist });
}
export async function reopenPeriod(orgId: string, period: string, reason: string): Promise<void> {
  const uid = uidOrThrow();
  if (!reason.trim()) throw new Error('Say why you are reopening this period — it is recorded in the audit trail.');
  await setDoc(doc(db, 'acctPeriods', periodDocId(orgId, period)), strip({ id: periodDocId(orgId, period), orgId, period, status: 'OPEN', reopenedBy: uid, reopenedAt: Date.now(), reopenReason: reason.trim() }), { merge: true });
  audit(orgId, 'ACCT_REOPEN', period, { reason });
}
/** Year-end close: lock every month of the fiscal year (net income rolls into net assets automatically in the reports). */
export async function closeFiscalYear(orgId: string, months: string[]): Promise<number> {
  const uid = uidOrThrow(); const closed = await closedSet(orgId); const todo = months.filter(m => !closed.has(m));
  for (let i = 0; i < todo.length; i += 400) { const wb = writeBatch(db); todo.slice(i, i + 400).forEach(p => wb.set(doc(db, 'acctPeriods', periodDocId(orgId, p)), strip({ id: periodDocId(orgId, p), orgId, period: p, status: 'CLOSED', closedBy: uid, closedAt: Date.now(), checklist: { yearEnd: true } }), { merge: true })); await wb.commit(); }
  audit(orgId, 'ACCT_CLOSE', `fiscal year ${months[0]}…${months[11]}`, { months: todo.length, yearEnd: true });
  return todo.length;
}

// ── Posting ────────────────────────────────────────────────────────────────────
export interface PostResult { id: string; created: boolean }
export async function postJournal(orgId: string, draft: DraftJournal, uid = uidOrThrow(), opts?: { closed?: Set<string> }): Promise<PostResult> {
  if (!draft.lines.length) throw new Error('Nothing to post.');
  if (!isBalanced(draft.lines)) throw new Error(`Unbalanced journal: ${draft.memo}`);
  const key = draft.key || `manual:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const id = journalDocId(orgId, key);
  const closed = opts?.closed ?? await closedSet(orgId);
  if (closed.has(draft.period || periodOf(draft.date))) throw new Error(`${draft.period} is closed. Reopen the period (Period Close tab) before posting into it.`);
  const ref = doc(db, 'acctJournals', id);
  if ((await getDoc(ref)).exists()) return { id, created: false };
  await setDoc(ref, strip({ ...draft, key, id, orgId, status: 'POSTED', createdBy: uid, createdAt: Date.now() }));
  return { id, created: true };
}
export async function postManualJournal(orgId: string, i: { date: string; memo: string; lines: ManualLineInput[] }): Promise<PostResult> {
  const uid = uidOrThrow();
  const draft = buildManualDraft({ ...i, key: `manual:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` });
  const r = await postJournal(orgId, draft, uid);
  audit(orgId, 'ACCT_POST', draft.memo, { journalId: r.id, date: draft.date, total: draft.lines.reduce((s, l) => s + l.debit, 0) });
  return r;
}
/** Mirror entry + mark the original REVERSED. Idempotent (key reversal:<id>). */
export async function reverseJournal(orgId: string, j: AcctJournal, reason = '', date?: string): Promise<PostResult> {
  const uid = uidOrThrow();
  if (j.reversalOf) throw new Error('This entry is itself a reversal — post a new entry instead.');
  if (j.status === 'REVERSED' && j.reversedBy) throw new Error('This entry was already reversed.');
  const closed = await closedSet(orgId);
  const d = date || (closed.has(j.period) ? todayStr() : j.date);
  const draft = reversalOf(j, d);
  if (reason.trim()) draft.memo = `${draft.memo} — ${reason.trim()}`;
  const r = await postJournal(orgId, draft, uid, { closed });
  await updateDoc(doc(db, 'acctJournals', j.id), { status: 'REVERSED', reversedBy: r.id });
  audit(orgId, 'ACCT_REVERSE', j.memo, { journalId: j.id, reversalId: r.id, reason });
  return r;
}

/** Post many drafts quickly; falls back to one-by-one on a batch conflict (e.g. the webhook raced us). */
async function commitDrafts(orgId: string, drafts: DraftJournal[], uid: string, closed: Set<string>, have: Set<string>): Promise<{ posted: number; closedSkipped: number; errors: string[] }> {
  let posted = 0, closedSkipped = 0; const errors: string[] = [];
  const todo = drafts.filter(d => { if (closed.has(d.period)) { closedSkipped++; return false; } return !have.has(journalDocId(orgId, d.key!)); });
  for (let i = 0; i < todo.length; i += 400) {
    const chunk = todo.slice(i, i + 400);
    try {
      const wb = writeBatch(db);
      chunk.forEach(d => { const id = journalDocId(orgId, d.key!); wb.set(doc(db, 'acctJournals', id), strip({ ...d, id, orgId, status: 'POSTED', createdBy: uid, createdAt: Date.now() })); });
      await wb.commit(); posted += chunk.length;
    } catch {
      for (const d of chunk) { try { const r = await postJournal(orgId, d, uid, { closed }); if (r.created) posted++; } catch (e: any) { errors.push(e?.message || 'post failed'); } }
    }
  }
  return { posted, closedSkipped, errors };
}

export interface BackfillResult { posted: number; reversed: number; waiting: number; closedSkipped: number; errors: string[] }
/** Post a journal for every gift / deposit that lacks one; reverse journals of voided gifts. Idempotent. */
export async function backfillGiftJournals(orgId: string, opts?: { silent?: boolean }): Promise<BackfillResult> {
  const uid = uidOrThrow();
  const { accounts } = await ensureChart(orgId);
  const sys = sysAccountsOf(accounts);
  const [contributions, batches, journals, closed] = await Promise.all([listBy<ChmsContribution>('chmsContributions', orgId), listBy<ChmsBatch>('chmsBatches', orgId, 5000), listBy<AcctJournal>('acctJournals', orgId), closedSet(orgId)]);
  const plan = planGiftJournals({ contributions, batches, journals, sys });
  const have = new Set(journals.map(j => j.id));
  const { posted, closedSkipped, errors } = await commitDrafts(orgId, plan.drafts, uid, closed, have);
  let reversed = 0;
  for (const j of plan.reversals) { try { await reverseJournal(orgId, j, 'gift voided'); reversed++; } catch (e: any) { errors.push(e?.message || 'reversal failed'); } }
  const res: BackfillResult = { posted, reversed, waiting: plan.waiting, closedSkipped, errors: [...plan.errors, ...errors] };
  if (!opts?.silent && (posted || reversed)) audit(orgId, 'ACCT_BACKFILL', `${posted} entries posted, ${reversed} reversed`, { posted, reversed, closedSkipped });
  return res;
}
const _last = new Map<string, number>();
/** Debounced catch-up used when the Books tab opens (at most once a minute per org). */
export async function debouncedBackfill(orgId: string, force = false): Promise<BackfillResult | null> {
  const now = Date.now(); if (!force && now - (_last.get(orgId) || 0) < 60_000) return null;
  _last.set(orgId, now);
  return backfillGiftJournals(orgId);
}
/** Hook for chmsFinance (batch post / deposit / void): keep the books in step. Never throws. */
export async function onFinanceChange(orgId: string): Promise<void> {
  try { _last.set(orgId, Date.now()); await backfillGiftJournals(orgId); } catch { /* the books tab catches up on open */ }
}

export async function postOpeningBalances(orgId: string, date: string, balances: OpeningInput[]): Promise<PostResult> {
  const uid = uidOrThrow(); const { accounts } = await ensureChart(orgId); const sys = sysAccountsOf(accounts);
  const draft = buildOpeningDraft(sys, accounts, date, balances);
  const r = await postJournal(orgId, draft, uid);
  if (!r.created) throw new Error('Opening balances were already posted. Reverse that entry in the Journal tab if you need to redo them.');
  audit(orgId, 'ACCT_SETUP', 'opening balances', { date, lines: draft.lines.length });
  return r;
}

// ── Bank ───────────────────────────────────────────────────────────────────────
export async function saveBankAccount(orgId: string, b: { id?: string; name: string; last4?: string; accountId: string; kind: AcctBankAccount['kind']; openingBalance?: number }): Promise<string> {
  uidOrThrow(); if (!b.name.trim()) throw new Error('Give the account a name.'); if (!b.accountId) throw new Error('Choose the ledger account this bank account posts to.');
  const ref = b.id ? doc(db, 'acctBankAccounts', b.id) : doc(collection(db, 'acctBankAccounts'));
  const data = strip({ ...(b.id ? {} : { createdAt: Date.now(), active: true }), id: ref.id, orgId, name: b.name.trim(), last4: b.last4?.trim() || undefined, accountId: b.accountId, kind: b.kind, openingBalance: b.openingBalance });
  await setDoc(ref, data, { merge: true });
  audit(orgId, 'ACCT_BANK', `bank account ${b.name}`, { id: ref.id });
  return ref.id;
}
export async function setBankActive(orgId: string, id: string, active: boolean) { uidOrThrow(); await updateDoc(doc(db, 'acctBankAccounts', id), { active }); }

export interface ImportPreview { lines: ReturnType<typeof toBankLines>['lines']; skipped: number; map: ReturnType<typeof detectColumns>; headers: string[] }
export function previewBankCsv(text: string, flipSign = false): ImportPreview {
  const rows = parseCsv(text); if (rows.length < 1) throw new Error('That file looks empty.');
  const map = detectColumns(rows);
  if (map.date < 0 || (map.amount < 0 && map.debit < 0 && map.credit < 0)) throw new Error('Could not find a date and an amount column. Export the CSV from your bank with Date, Description and Amount columns.');
  const { lines, skipped } = toBankLines(rows, map, flipSign);
  return { lines, skipped, map, headers: rows[0] };
}
export async function importBankLines(orgId: string, bankAccountId: string, lines: ImportPreview['lines'], existing: AcctBankTxn[]): Promise<{ added: number; duplicates: number }> {
  uidOrThrow();
  const have = new Set(existing.map(t => t.id)); const importId = `imp_${Date.now().toString(36)}`;
  // Also dedupe against already-imported lines with the same date+amount+description (e.g. re-exported with different columns).
  const sig = new Set(existing.filter(t => t.bankAccountId === bankAccountId).map(t => `${t.date}|${t.amount.toFixed(2)}|${t.description}`));
  const fresh = lines.map(l => ({ l, id: bankTxnDocId(orgId, bankAccountId, l.key) })).filter(x => !have.has(x.id) && !(x.l.key.endsWith('#1') && sig.has(`${x.l.date}|${x.l.amount.toFixed(2)}|${x.l.description}`)));
  for (let i = 0; i < fresh.length; i += 400) {
    const wb = writeBatch(db);
    fresh.slice(i, i + 400).forEach(({ l, id }) => wb.set(doc(db, 'acctBankTxns', id), strip({ id, orgId, bankAccountId, date: l.date, amount: l.amount, description: l.description, externalId: l.externalId, status: 'UNMATCHED', importId, createdAt: Date.now() } as AcctBankTxn)));
    await wb.commit();
  }
  audit(orgId, 'ACCT_BANK', 'bank statement imported', { added: fresh.length, duplicates: lines.length - fresh.length });
  return { added: fresh.length, duplicates: lines.length - fresh.length };
}

export async function acceptMatches(orgId: string, cands: MatchCandidate[]): Promise<number> {
  uidOrThrow(); let n = 0;
  for (let i = 0; i < cands.length; i += 200) {
    const wb = writeBatch(db);
    for (const c of cands.slice(i, i + 200)) {
      wb.update(doc(db, 'acctBankTxns', c.txnId), strip({ status: 'MATCHED', matchedJournalId: c.journalId, matchedPayoutId: c.payoutDocId || c.payoutId }));
      if (c.payoutDocId) wb.update(doc(db, 'chmsPayouts', c.payoutDocId), strip({ reconciled: true, bankTxnId: c.txnId }));
      n++;
    }
    await wb.commit();
  }
  audit(orgId, 'ACCT_BANK', `${n} bank line(s) matched`, { count: n });
  return n;
}
export async function unmatchTxn(orgId: string, t: AcctBankTxn): Promise<void> {
  uidOrThrow(); if (t.reconciledAt) throw new Error('This line is part of a finished reconciliation and is locked.');
  await updateDoc(doc(db, 'acctBankTxns', t.id), { status: 'UNMATCHED', matchedJournalId: null, matchedPayoutId: null });
  if (t.matchedPayoutId) { try { await updateDoc(doc(db, 'chmsPayouts', t.matchedPayoutId), { reconciled: false, bankTxnId: null }); } catch { /* payout may be a stripe id */ } }
  audit(orgId, 'ACCT_BANK', 'bank line unmatched', { txnId: t.id });
}
export async function ignoreTxn(orgId: string, t: AcctBankTxn, ignore = true): Promise<void> { uidOrThrow(); await updateDoc(doc(db, 'acctBankTxns', t.id), { status: ignore ? 'IGNORED' : 'UNMATCHED' }); audit(orgId, 'ACCT_BANK', ignore ? 'bank line ignored' : 'bank line restored', { txnId: t.id }); }

/** "Create entry from this bank line": Dr/Cr the counter account vs the bank's ledger account, then mark the line matched. */
export async function createEntryFromTxn(orgId: string, t: AcctBankTxn, bank: AcctBankAccount, e: { accountId: string; fundId?: string; deptId?: string; memo?: string }): Promise<PostResult> {
  const uid = uidOrThrow(); if (!e.accountId) throw new Error('Choose a category for this line.');
  const abs = Math.abs(t.amount); const inflow = t.amount > 0;
  const memo = (e.memo?.trim() || t.description).slice(0, 140);
  const counter = { accountId: e.accountId, debit: inflow ? 0 : abs, credit: inflow ? abs : 0, fundId: e.fundId, deptId: e.deptId };
  const cash = { accountId: bank.accountId, debit: inflow ? abs : 0, credit: inflow ? 0 : abs, fundId: e.fundId };
  const draft: DraftJournal = { date: t.date, period: periodOf(t.date), memo, lines: strip(inflow ? [cash, counter] : [counter, cash]), source: { kind: 'BANK', id: t.id }, key: `banktxn:${t.id}` };
  const r = await postJournal(orgId, draft, uid);
  await updateDoc(doc(db, 'acctBankTxns', t.id), { status: 'MATCHED', matchedJournalId: r.id });
  audit(orgId, 'ACCT_POST', memo, { journalId: r.id, fromBank: t.id, amount: t.amount });
  return r;
}
/** ARIA suggests a category; the numbers never leave the device (description + amount sign only). Falls back to null. */
export async function ariaCategorize(desc: string, amount: number, accounts: AcctAccount[]): Promise<CategoryGuess | null> {
  try {
    const pool = accounts.filter(a => a.active && (amount > 0 ? a.type === 'REVENUE' : a.type === 'EXPENSE'));
    if (!pool.length) return null;
    const raw = await callGemini(`You categorise a church bank-statement line. Reply JSON only: {"code":"<one of the codes>"}.\nLine: "${desc.slice(0, 120)}" (${amount > 0 ? 'money in' : 'money out'}).\nCodes:\n${pool.map(a => `${a.code} ${a.name}`).join('\n')}`, { responseMimeType: 'application/json' }, 'gemini-flash-latest');
    if (!raw) return null;
    const code = String(JSON.parse(raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()).code || '');
    const a = pool.find(x => x.code === code); return a ? { accountId: a.id, source: 'aria', confidence: 0.6, note: 'Suggested by Aria — please confirm' } : null;
  } catch { return null; }
}

/** Finish a reconciliation: lock the cleared lines and remember the statement balance. */
export async function finishReconciliation(orgId: string, bank: AcctBankAccount, statementDate: string, statementBalance: number, clearedTxnIds: string[], adjust?: { amount: number }): Promise<void> {
  const uid = uidOrThrow();
  if (adjust && Math.abs(adjust.amount) >= 0.005) {
    const sys = await sysAccounts(orgId); const dz = sys.RECONCILIATION_DISCREPANCY; if (!dz) throw new Error('Missing the Reconciliation Discrepancies account.');
    const abs = Math.abs(adjust.amount); const up = adjust.amount > 0;   // statement higher than books → cash up
    await postJournal(orgId, { date: statementDate, period: periodOf(statementDate), memo: `Reconciliation adjustment — ${bank.name}`, lines: up ? [{ accountId: bank.accountId, debit: abs, credit: 0 }, { accountId: dz, debit: 0, credit: abs }] : [{ accountId: dz, debit: abs, credit: 0 }, { accountId: bank.accountId, debit: 0, credit: abs }], source: { kind: 'BANK', id: `recon:${bank.id}:${statementDate}` }, key: `recon:${bank.id}:${statementDate}` }, uid);
  }
  for (let i = 0; i < clearedTxnIds.length; i += 400) { const wb = writeBatch(db); clearedTxnIds.slice(i, i + 400).forEach(id => wb.update(doc(db, 'acctBankTxns', id), { reconciledAt: Date.now() })); await wb.commit(); }
  await updateDoc(doc(db, 'acctBankAccounts', bank.id), { lastReconciled: { date: statementDate, balance: statementBalance, at: Date.now(), by: uid } });
  audit(orgId, 'ACCT_BANK', `reconciled ${bank.name} through ${statementDate}`, { balance: statementBalance, lines: clearedTxnIds.length, adjusted: adjust?.amount });
}

// ── Budgets ────────────────────────────────────────────────────────────────────
export const budgetDocId = (orgId: string, fy: number) => `b_${safeId(orgId)}_${fy}`;
export async function saveBudget(orgId: string, fiscalYear: number, lines: AcctBudget['lines']): Promise<void> {
  uidOrThrow();
  const clean = lines.filter(l => l.accountId && l.amounts.some(a => a)).map(l => ({ ...l, amounts: Array.from({ length: 12 }, (_, i) => Math.round((l.amounts[i] || 0) * 100) / 100) }));
  await setDoc(doc(db, 'acctBudgets', budgetDocId(orgId, fiscalYear)), strip({ id: budgetDocId(orgId, fiscalYear), orgId, fiscalYear, lines: clean, updatedAt: Date.now() }));
  audit(orgId, 'ACCT_BUDGET', `FY${fiscalYear} budget`, { lines: clean.length });
}

export { periodRange };
export type { Organization };
