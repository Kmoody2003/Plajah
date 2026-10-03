// acctPosting — PURE double-entry posting rules for Elevate. No Firebase/React imports so server.ts
// (webhooks) and the client share exactly the same accounting. Every builder returns a balanced
// journal (debits == credits, in dollars to the cent) plus a deterministic `key` for idempotency.
//
//   online gift      Dr Stripe Clearing            Cr Contributions (fund)
//   processing fee   Dr Online Giving Fees (exp)   Cr Stripe Clearing
//   refund           Dr Refunds & Chargebacks      Cr Stripe Clearing
//   payout           Dr Cash (operating bank)      Cr Stripe Clearing
//   cash/check gift  Dr Undeposited Funds          Cr Contributions (fund)
//   deposit          Dr Cash                       Cr Undeposited Funds
//   expense paid     Dr Expense (acct/fund/dept)   Cr Cash
//   bill entered     Dr Expense                    Cr Accounts Payable ; bill paid: Dr AP Cr Cash

import type { AcctAccount, AcctJournal, AcctJournalLine, AcctSystemKey } from '../types';

export const cents = (n: number) => Math.round((n || 0) * 100);
export const dollars = (c: number) => c / 100;
export const periodOf = (isoDate: string) => isoDate.slice(0, 7);

export type DraftJournal = Omit<AcctJournal, 'id' | 'orgId' | 'createdBy' | 'createdAt' | 'status'>;
export type SysAccounts = Partial<Record<AcctSystemKey, string>>;   // systemKey → accountId

export function isBalanced(lines: AcctJournalLine[]): boolean {
  return lines.reduce((s, l) => s + cents(l.debit) - cents(l.credit), 0) === 0 && lines.every(l => (l.debit > 0) !== (l.credit > 0));
}

function need(sys: SysAccounts, key: AcctSystemKey): string {
  const id = sys[key];
  if (!id) throw new Error(`Missing system account: ${key}`);
  return id;
}

function mk(date: string, memo: string, lines: AcctJournalLine[], source: DraftJournal['source'], key: string): DraftJournal {
  const clean = lines.filter(l => cents(l.debit) !== 0 || cents(l.credit) !== 0);
  if (!isBalanced(clean)) throw new Error(`Unbalanced journal: ${memo}`);
  return { date, period: periodOf(date), memo, lines: clean, source, key, };
}

export function onlineGiftEntry(sys: SysAccounts, g: { id: string; date: string; amount: number; fundId?: string; fundName?: string; giver?: string; stripePaymentId?: string }): DraftJournal {
  return mk(g.date, `Online gift${g.giver ? ' — ' + g.giver : ''}${g.fundName ? ' (' + g.fundName + ')' : ''}`, [
    { accountId: need(sys, 'STRIPE_CLEARING'), debit: g.amount, credit: 0 },
    { accountId: need(sys, 'CONTRIBUTIONS'), debit: 0, credit: g.amount, fundId: g.fundId },
  ], { kind: 'CONTRIBUTION', id: g.id }, `contrib:${g.id}`);
}

export function offlineGiftEntry(sys: SysAccounts, g: { id: string; date: string; amount: number; fundId?: string; fundName?: string; giver?: string; method?: string }): DraftJournal {
  return mk(g.date, `${g.method || 'Cash/check'} gift${g.giver ? ' — ' + g.giver : ''}${g.fundName ? ' (' + g.fundName + ')' : ''}`, [
    { accountId: need(sys, 'UNDEPOSITED_FUNDS'), debit: g.amount, credit: 0 },
    { accountId: need(sys, 'CONTRIBUTIONS'), debit: 0, credit: g.amount, fundId: g.fundId },
  ], { kind: 'CONTRIBUTION', id: g.id }, `contrib:${g.id}`);
}

export function depositEntry(sys: SysAccounts, d: { batchId: string; date: string; amount: number; bankCashAccountId?: string }): DraftJournal {
  return mk(d.date, `Deposit — batch ${d.batchId}`, [
    { accountId: d.bankCashAccountId || need(sys, 'CASH_OPERATING'), debit: d.amount, credit: 0 },
    { accountId: need(sys, 'UNDEPOSITED_FUNDS'), debit: 0, credit: d.amount },
  ], { kind: 'BANK', id: d.batchId }, `deposit:${d.batchId}`);
}

export function feeEntry(sys: SysAccounts, f: { id: string; date: string; amount: number; fundId?: string; memo?: string }): DraftJournal {
  return mk(f.date, f.memo || 'Stripe processing fee', [
    { accountId: need(sys, 'ONLINE_GIVING_FEES'), debit: f.amount, credit: 0, fundId: f.fundId },
    { accountId: need(sys, 'STRIPE_CLEARING'), debit: 0, credit: f.amount },
  ], { kind: 'FEE', id: f.id }, `fee:${f.id}`);
}

export function refundEntry(sys: SysAccounts, r: { id: string; date: string; amount: number; fundId?: string; memo?: string }): DraftJournal {
  return mk(r.date, r.memo || 'Refund', [
    { accountId: need(sys, 'REFUNDS_CHARGEBACKS'), debit: r.amount, credit: 0, fundId: r.fundId },
    { accountId: need(sys, 'STRIPE_CLEARING'), debit: 0, credit: r.amount },
  ], { kind: 'REFUND', id: r.id }, `refund:${r.id}`);
}

export function disputeFeeEntry(sys: SysAccounts, f: { id: string; date: string; amount: number; memo?: string }): DraftJournal {
  return mk(f.date, f.memo || 'Dispute fee', [
    { accountId: need(sys, 'STRIPE_DISPUTE_FEES'), debit: f.amount, credit: 0 },
    { accountId: need(sys, 'STRIPE_CLEARING'), debit: 0, credit: f.amount },
  ], { kind: 'DISPUTE', id: f.id }, `dispute:${f.id}`);
}

/** Money leaves the Stripe balance and lands in the bank. */
export function payoutEntry(sys: SysAccounts, p: { id: string; date: string; amount: number; bankCashAccountId?: string }): DraftJournal {
  return mk(p.date, `Stripe payout ${p.id}`, [
    { accountId: p.bankCashAccountId || need(sys, 'CASH_OPERATING'), debit: p.amount, credit: 0 },
    { accountId: need(sys, 'STRIPE_CLEARING'), debit: 0, credit: p.amount },
  ], { kind: 'PAYOUT', id: p.id }, `payout:${p.id}`);
}

export function expenseEntry(sys: SysAccounts, e: { id: string; date: string; amount: number; accountId: string; fundId?: string; deptId?: string; memo: string; paidFromAccountId?: string }): DraftJournal {
  return mk(e.date, e.memo, [
    { accountId: e.accountId, debit: e.amount, credit: 0, fundId: e.fundId, deptId: e.deptId },
    { accountId: e.paidFromAccountId || need(sys, 'CASH_OPERATING'), debit: 0, credit: e.amount, fundId: e.fundId },
  ], { kind: 'EXPENSE', id: e.id }, `expense:${e.id}`);
}

export function billEntry(sys: SysAccounts, b: { id: string; date: string; amount: number; accountId: string; fundId?: string; deptId?: string; memo: string }): DraftJournal {
  return mk(b.date, b.memo, [
    { accountId: b.accountId, debit: b.amount, credit: 0, fundId: b.fundId, deptId: b.deptId },
    { accountId: need(sys, 'ACCOUNTS_PAYABLE'), debit: 0, credit: b.amount },
  ], { kind: 'BILL', id: b.id }, `bill:${b.id}`);
}

export function billPaymentEntry(sys: SysAccounts, b: { id: string; date: string; amount: number; memo: string; paidFromAccountId?: string }): DraftJournal {
  return mk(b.date, b.memo, [
    { accountId: need(sys, 'ACCOUNTS_PAYABLE'), debit: b.amount, credit: 0 },
    { accountId: b.paidFromAccountId || need(sys, 'CASH_OPERATING'), debit: 0, credit: b.amount },
  ], { kind: 'BILL_PAYMENT', id: b.id }, `billpay:${b.id}`);
}

/** Plajah Billing: invoice issued → Dr Accounts Receivable, Cr Invoice Revenue. Key is per invoice (idempotent). */
export function invoiceIssuedEntry(sys: SysAccounts, i: { id: string; date: string; amount: number; number?: string; customer?: string; revenueAccountId?: string }): DraftJournal {
  return mk(i.date, `Invoice ${i.number || i.id}${i.customer ? ' — ' + i.customer : ''}`, [
    { accountId: need(sys, 'ACCOUNTS_RECEIVABLE'), debit: i.amount, credit: 0 },
    { accountId: i.revenueAccountId || need(sys, 'INVOICE_REVENUE'), debit: 0, credit: i.amount },
  ], { kind: 'INVOICE', id: i.id }, `inv:${i.id}`);
}

/** Plajah Billing: invoice payment received into Stripe → Dr Stripe Clearing, Cr Accounts Receivable. `id` = Stripe payment/charge id (idempotent). */
export function invoicePaymentEntry(sys: SysAccounts, p: { id: string; date: string; amount: number; number?: string; customer?: string; outOfBand?: boolean }): DraftJournal {
  return mk(p.date, `Payment on invoice ${p.number || p.id}${p.customer ? ' — ' + p.customer : ''}${p.outOfBand ? ' (received outside Stripe)' : ''}`, [
    // Paid outside Stripe (cash/check): it never touched the Stripe balance → Undeposited Funds, deposited later.
    { accountId: need(sys, p.outOfBand ? 'UNDEPOSITED_FUNDS' : 'STRIPE_CLEARING'), debit: p.amount, credit: 0 },
    { accountId: need(sys, 'ACCOUNTS_RECEIVABLE'), debit: 0, credit: p.amount },
  ], { kind: 'INVOICE_PAYMENT', id: p.id }, `invpay:${p.id}`);
}

/** Exact mirror entry used to reverse a posted journal (journals are never deleted). */
export function reversalOf(j: Pick<AcctJournal, 'id' | 'date' | 'memo' | 'lines'>, date: string): DraftJournal {
  return {
    date, period: periodOf(date), memo: `Reversal: ${j.memo}`,
    lines: j.lines.map(l => ({ ...l, debit: l.credit, credit: l.debit })),
    source: { kind: 'REVERSAL', id: j.id }, key: `reversal:${j.id}`, reversalOf: j.id,
  } as DraftJournal;
}

// ── Default chart of accounts (church / nonprofit) ───────────────────────────
type Seed = Omit<AcctAccount, 'id' | 'orgId' | 'createdAt'>;
const A = (code: string, name: string, type: AcctAccount['type'], extra: Partial<Seed> = {}): Seed => ({ code, name, type, active: true, ...extra });

export const DEFAULT_CHART: Seed[] = [
  A('1000', 'Operating Checking', 'ASSET', { systemKey: 'CASH_OPERATING', isSystem: true, subtype: 'cash' }),
  A('1010', 'Savings / Reserve', 'ASSET', { subtype: 'cash' }),
  A('1050', 'Stripe Clearing', 'ASSET', { systemKey: 'STRIPE_CLEARING', isSystem: true, subtype: 'clearing' }),
  A('1060', 'Undeposited Funds', 'ASSET', { systemKey: 'UNDEPOSITED_FUNDS', isSystem: true, subtype: 'clearing' }),
  A('1100', 'Accounts Receivable', 'ASSET', { systemKey: 'ACCOUNTS_RECEIVABLE', isSystem: true, subtype: 'receivable' }),
  A('1500', 'Property & Equipment', 'ASSET', { subtype: 'fixed' }),
  A('2000', 'Accounts Payable', 'LIABILITY', { systemKey: 'ACCOUNTS_PAYABLE', isSystem: true }),
  A('2100', 'Payroll Liabilities', 'LIABILITY'),
  A('2200', 'Credit Card Payable', 'LIABILITY'),
  A('3000', 'Net Assets — Without Donor Restrictions', 'NET_ASSET', { subtype: 'unrestricted' }),
  A('3100', 'Net Assets — With Donor Restrictions', 'NET_ASSET', { subtype: 'restricted' }),
  A('3900', 'Opening Balance Equity', 'NET_ASSET', { systemKey: 'OPENING_BALANCE', isSystem: true }),
  A('4000', 'Contributions', 'REVENUE', { systemKey: 'CONTRIBUTIONS', isSystem: true, subtype: 'giving' }),
  A('4100', 'Special Offerings & Missions', 'REVENUE', { subtype: 'giving' }),
  A('4200', 'Facility Rental Income', 'REVENUE'),
  A('4300', 'Store & Event Income', 'REVENUE'),
  A('4400', 'Invoiced Income', 'REVENUE', { systemKey: 'INVOICE_REVENUE', isSystem: true }),
  A('4900', 'Other Income', 'REVENUE'),
  A('5000', 'Salaries & Wages', 'EXPENSE', { functionalClass: 'PROGRAM' }),
  A('5010', 'Pastoral Housing Allowance', 'EXPENSE', { functionalClass: 'PROGRAM' }),
  A('5020', 'Payroll Taxes & Benefits', 'EXPENSE', { functionalClass: 'MANAGEMENT' }),
  A('5100', 'Ministry Supplies & Programs', 'EXPENSE', { functionalClass: 'PROGRAM' }),
  A('5200', 'Missions & Benevolence', 'EXPENSE', { functionalClass: 'PROGRAM' }),
  A('5300', 'Worship & Music', 'EXPENSE', { functionalClass: 'PROGRAM' }),
  A('5400', 'Media & Technology', 'EXPENSE', { functionalClass: 'PROGRAM' }),
  A('5500', 'Utilities', 'EXPENSE', { functionalClass: 'MANAGEMENT' }),
  A('5510', 'Building Maintenance & Repairs', 'EXPENSE', { functionalClass: 'MANAGEMENT' }),
  A('5600', 'Insurance', 'EXPENSE', { functionalClass: 'MANAGEMENT' }),
  A('5700', 'Office & Administration', 'EXPENSE', { functionalClass: 'MANAGEMENT' }),
  A('5800', 'Professional Fees', 'EXPENSE', { functionalClass: 'MANAGEMENT' }),
  A('5900', 'Online Giving Fees', 'EXPENSE', { systemKey: 'ONLINE_GIVING_FEES', isSystem: true, functionalClass: 'MANAGEMENT' }),
  A('5910', 'Refunds & Chargebacks', 'EXPENSE', { systemKey: 'REFUNDS_CHARGEBACKS', isSystem: true, functionalClass: 'MANAGEMENT' }),
  A('5920', 'Dispute Fees', 'EXPENSE', { systemKey: 'STRIPE_DISPUTE_FEES', isSystem: true, functionalClass: 'MANAGEMENT' }),
  A('5990', 'Reconciliation Discrepancies', 'EXPENSE', { systemKey: 'RECONCILIATION_DISCREPANCY', isSystem: true, functionalClass: 'MANAGEMENT' }),
  A('6000', 'Fundraising Expenses', 'EXPENSE', { functionalClass: 'FUNDRAISING' }),
];

/** Resolve systemKey → accountId from a loaded chart. */
export function sysAccountsOf(accounts: Pick<AcctAccount, 'id' | 'systemKey'>[]): SysAccounts {
  const out: SysAccounts = {};
  for (const a of accounts) if (a.systemKey) out[a.systemKey] = a.id;
  return out;
}

/** Trial balance from journals (posted only). Debits-credits by account, in dollars. */
export function trialBalance(journals: Pick<AcctJournal, 'lines' | 'status'>[]): Record<string, { debit: number; credit: number }> {
  const t: Record<string, { d: number; c: number }> = {};
  for (const j of journals) {
    if (j.status === 'REVERSED') { /* reversed originals stay in the books; the reversal entry offsets them */ }
    for (const l of j.lines) {
      const r = (t[l.accountId] ||= { d: 0, c: 0 });
      r.d += cents(l.debit); r.c += cents(l.credit);
    }
  }
  return Object.fromEntries(Object.entries(t).map(([k, v]) => [k, { debit: dollars(v.d), credit: dollars(v.c) }]));
}

// ── Deterministic doc ids ────────────────────────────────────────────────────
// Server webhooks and the client both post the same events; deterministic ids make double-posting
// impossible (a second write targets the same doc). ALWAYS use these when creating accounts/journals.
const safe = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '_');
export const accountDocId = (orgId: string, code: string) => `a_${safe(orgId)}_${safe(code)}`;
export const journalDocId = (orgId: string, key: string) => `j_${safe(orgId)}_${safe(key)}`;
/** Stripe-synced doc ids (payouts, payout lines) — same idempotency rule. */
export const payoutDocId = (orgId: string, stripePayoutId: string) => `po_${safe(orgId)}_${safe(stripePayoutId)}`;
export const payoutLineDocId = (orgId: string, balanceTxnId: string) => `pl_${safe(orgId)}_${safe(balanceTxnId)}`;
/** Contribution id for an online gift — one doc per Stripe payment, so webhook retries and re-syncs dedupe. */
export const onlineGiftDocId = (orgId: string, stripePaymentId: string) => `gift_${safe(orgId)}_${safe(stripePaymentId)}`;
