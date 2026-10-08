// commercialCore - PURE commercial / recurring laundry accounts (hotels, gyms, restaurants, salons):
// negotiated per-lb price, net-terms INVOICING built from completed tickets, aging, statements, "mark paid"
// (cash / check / external), and standing pickup schedules that expand into draft tickets.
//
// INVOICE-ONLY: this module has no payment rail. Money is collected outside Plajah (check, cash, ACH/wire the
// owner receives themselves) and recorded here against the invoice. All amounts are INTEGER CENTS.
// Why not services/billingService.ts: that system is dollar-float, Stripe hosted-invoice oriented and flag-gated;
// laundry invoices must be built from ticket totals (cents, taxCore) and need no payment link.
// Tests: npm run test:laundry.

import { computeTicketTotals, stageKind, type Ticket, type TicketConfig } from './ticketCore';
import type { TaxSettings } from './taxCore';
import { NO_TAX } from './taxCore';
import { escapeHtml } from './laundryCore';

const DAY = 86_400_000;
const int = (v: any): number => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : 0; };
const str = (v: any, n: number): string => String(v ?? '').trim().slice(0, n);

// ── Accounts + standing schedules ─────────────────────────────────────────────────────────────────
export interface PickupSchedule { id: string; /** 0=Sunday..6=Saturday */ days: number[]; start: string; end: string; address: string; note?: string; active: boolean }
export interface CommercialAccount {
  id: string; businessUid: string; name: string; contactName?: string; email?: string; phone?: string; customerUid?: string;
  /** Negotiated price per lb (cents). Overrides the shop price bands on this account's tickets. */
  pricePerLbCents?: number;
  termsDays: number;           // 0 = due on receipt, 15, 30...
  taxExempt: boolean; exemptCertificate?: string;
  schedules: PickupSchedule[]; active: boolean; notes?: string; createdAt: number;
}
export const TERMS_CHOICES = [0, 7, 15, 30, 45];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function cleanAccount(raw: any, id: string, businessUid: string, now = Date.now()): { account?: CommercialAccount; error?: string } {
  const name = str(raw?.name, 80); if (!name) return { error: 'Account name is required.' };
  const email = str(raw?.email, 120); if (email && !/^\S+@\S+\.\S+$/.test(email)) return { error: 'That email does not look right.' };
  const terms = int(raw?.termsDays ?? 30); if (terms < 0 || terms > 120) return { error: 'Payment terms must be 0 to 120 days.' };
  const price = raw?.pricePerLbCents === undefined || raw.pricePerLbCents === '' || raw.pricePerLbCents === null ? undefined : int(raw.pricePerLbCents);
  if (price !== undefined && (price < 0 || price > 100_000)) return { error: 'Price per lb is out of range.' };
  const schedules: PickupSchedule[] = [];
  for (const s of (Array.isArray(raw?.schedules) ? raw.schedules : []).slice(0, 6)) {
    const days = [...new Set((Array.isArray(s?.days) ? s.days : []).filter((d: any) => d !== "" && d !== null && Number.isInteger(Number(d))).map(int).filter((d: number) => d >= 0 && d <= 6))].sort() as number[];
    if (!days.length) continue;
    const start = HHMM.test(String(s?.start)) ? String(s.start) : '08:00', end = HHMM.test(String(s?.end)) ? String(s.end) : '10:00';
    if (end <= start) return { error: 'A pickup window must end after it starts.' };
    schedules.push({ id: str(s?.id, 40) || `s${schedules.length + 1}`, days, start, end, address: str(s?.address, 200), ...(s?.note ? { note: str(s.note, 160) } : {}), active: s?.active !== false });
  }
  return { account: {
    id, businessUid, name, termsDays: terms, taxExempt: raw?.taxExempt === true, schedules, active: raw?.active !== false, createdAt: int(raw?.createdAt) || now,
    ...(raw?.contactName ? { contactName: str(raw.contactName, 80) } : {}), ...(email ? { email } : {}), ...(raw?.phone ? { phone: str(raw.phone, 30) } : {}),
    ...(raw?.customerUid ? { customerUid: str(raw.customerUid, 128) } : {}), ...(price !== undefined ? { pricePerLbCents: price } : {}),
    ...(raw?.exemptCertificate ? { exemptCertificate: str(raw.exemptCertificate, 60) } : {}), ...(raw?.notes ? { notes: str(raw.notes, 500) } : {}),
  } };
}

export const isoDate = (ms: number, tzOffsetMin = 0): string => new Date(ms + tzOffsetMin * 60_000).toISOString().slice(0, 10);
const dowOf = (iso: string): number => new Date(`${iso}T12:00:00Z`).getUTCDay();
const addDays = (iso: string, n: number): string => new Date(Date.parse(`${iso}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
export const scheduleKey = (accountId: string, date: string, scheduleId: string): string => `${accountId}:${date}:${scheduleId}`;

export interface ScheduledPickup { key: string; accountId: string; accountName: string; date: string; scheduleId: string; start: string; end: string; address: string; note?: string }
/** Standing schedules -> concrete pickups in [fromISO, toISO] (max 62 days). Keys already in `existing` are skipped, so a re-run is a no-op. */
export function expandSchedule(account: CommercialAccount, fromISO: string, toISO: string, existing: Set<string> | string[] = []): ScheduledPickup[] {
  if (!account.active || !/^\d{4}-\d{2}-\d{2}$/.test(fromISO) || !/^\d{4}-\d{2}-\d{2}$/.test(toISO) || toISO < fromISO) return [];
  const have = existing instanceof Set ? existing : new Set(existing); const out: ScheduledPickup[] = [];
  for (let d = fromISO, i = 0; d <= toISO && i < 62; d = addDays(d, 1), i++) {
    for (const s of account.schedules) {
      if (!s.active || !s.days.includes(dowOf(d))) continue;
      const key = scheduleKey(account.id, d, s.id); if (have.has(key)) continue;
      out.push({ key, accountId: account.id, accountName: account.name, date: d, scheduleId: s.id, start: s.start, end: s.end, address: s.address, ...(s.note ? { note: s.note } : {}) });
    }
  }
  return out;
}
/** Subject + customer for the draft ticket a pickup creates (the attendant weighs in on arrival). */
export function draftTicketFor(a: CommercialAccount, p: ScheduledPickup): { customer: { name: string; phone?: string; email?: string; uid?: string }; subject: Record<string, string | number> } {
  return {
    customer: { name: a.name, ...(a.phone ? { phone: a.phone } : {}), ...(a.email ? { email: a.email } : {}), ...(a.customerUid ? { uid: a.customerUid } : {}) },
    subject: { bags: 1, svc: 'Pickup', pu_date: p.date, pu_start: p.start, pu_end: p.end, addr: p.address, ...(p.note ? { addr_note: p.note } : {}), account: a.id, sched_key: p.key },
  };
}

// ── Invoices ──────────────────────────────────────────────────────────────────────────────────────
export type InvoiceStatus = 'OPEN' | 'PAID' | 'VOID';
export type PaymentMethod = 'CASH' | 'CHECK' | 'EXTERNAL';
export interface InvoicePayment { id: string; at: number; amountCents: number; method: PaymentMethod; reference?: string; by: string }
export interface InvoiceLine { ticketId: string; number: string; doneAt: number; description: string; subtotalCents: number; taxCents: number; totalCents: number }
export interface Invoice {
  id: string; number: string; businessUid: string; accountId: string; accountName: string;
  periodFrom: string; periodTo: string; issuedAt: number; dueAt: number; termsDays: number;
  lines: InvoiceLine[]; subtotalCents: number; taxCents: number; totalCents: number;
  payments: InvoicePayment[]; paidCents: number; status: InvoiceStatus; voidReason?: string; memo?: string;
}
export const invoiceNumber = (seq: number): string => `INV-${String(Math.max(1, seq)).padStart(5, '0')}`;
export const invoiceBalance = (i: Pick<Invoice, 'totalCents' | 'paidCents' | 'status'>): number => (i.status === 'VOID' ? 0 : Math.max(0, i.totalCents - i.paidCents));

/** When did the ticket reach its DONE stage? */
export function doneAtOf(t: Ticket, cfg: TicketConfig): number | undefined {
  for (let i = t.audit.length - 1; i >= 0; i--) { const e = t.audit[i]; if ((e.type === 'TRANSITION' || e.type === 'OVERRIDE') && e.to && stageKind(cfg, e.to) === 'DONE') return e.at; }
  return stageKind(cfg, t.stage) === 'DONE' ? t.updatedAt : undefined;
}
/** Charged-to-account marker: a deposit with method ACCOUNT (added by the "Bill to account" action). */
export const billedToAccount = (t: Pick<Ticket, 'deposits'>): number => t.deposits.filter(d => d.method === 'ACCOUNT').reduce((n, d) => n + d.amountCents, 0);

/** Tickets that belong on an invoice for the period: this account, DONE, billed to account, not on an earlier invoice. */
export function billableTickets(tickets: Ticket[], cfg: TicketConfig, accountId: string, p: { fromMs: number; toMs: number }, alreadyInvoiced: Set<string>): Ticket[] {
  return tickets.filter(t => {
    if (String(t.subject.account || '') !== accountId || alreadyInvoiced.has(t.id)) return false;
    if (stageKind(cfg, t.stage) !== 'DONE' || !billedToAccount(t)) return false;
    const at = doneAtOf(t, cfg); return !!at && at >= p.fromMs && at <= p.toMs;
  }).sort((a, b) => (doneAtOf(a, cfg) || 0) - (doneAtOf(b, cfg) || 0));
}

export function buildInvoice(a: { id: string; seq: number; account: CommercialAccount; tickets: Ticket[]; cfg: TicketConfig; tax?: TaxSettings; periodFrom: string; periodTo: string; issuedAt?: number; memo?: string }): { invoice?: Invoice; error?: string } {
  if (!a.tickets.length) return { error: 'No completed, account-billed tickets in that period.' };
  const issuedAt = a.issuedAt ?? Date.now(); const tax = a.account.taxExempt ? NO_TAX : (a.tax ?? NO_TAX);
  const lines: InvoiceLine[] = a.tickets.map(t => {
    const tot = computeTicketTotals({ lines: t.lines, deposits: [], paidCents: 0 }, a.cfg, tax).approved;
    const wt = t.subject.weight_lb ? ` ${t.subject.weight_lb} lb` : '';
    return { ticketId: t.id, number: t.number, doneAt: doneAtOf(t, a.cfg) || t.updatedAt, description: `Wash & fold${wt}`.slice(0, 80), subtotalCents: tot.subtotalCents, taxCents: tot.taxCents, totalCents: tot.totalCents };
  });
  const subtotalCents = lines.reduce((n, l) => n + l.subtotalCents, 0), taxCents = lines.reduce((n, l) => n + l.taxCents, 0);
  return { invoice: {
    id: a.id, number: invoiceNumber(a.seq), businessUid: a.account.businessUid, accountId: a.account.id, accountName: a.account.name,
    periodFrom: a.periodFrom, periodTo: a.periodTo, issuedAt, dueAt: issuedAt + a.account.termsDays * DAY, termsDays: a.account.termsDays,
    lines, subtotalCents, taxCents, totalCents: subtotalCents + taxCents, payments: [], paidCents: 0, status: 'OPEN', ...(a.memo ? { memo: str(a.memo, 300) } : {}),
  } };
}

export function applyInvoicePayment(inv: Invoice, p: { id: string; amountCents: number; method: string; reference?: string; by: string; at?: number }): { invoice?: Invoice; error?: string } {
  if (inv.status === 'VOID') return { error: 'This invoice is void.' };
  const amt = int(p.amountCents); if (!(amt > 0)) return { error: 'Enter an amount above $0.' };
  const bal = invoiceBalance(inv); if (amt > bal) return { error: `That is more than the $${(bal / 100).toFixed(2)} balance.` };
  const method = (['CASH', 'CHECK', 'EXTERNAL'].includes(String(p.method).toUpperCase()) ? String(p.method).toUpperCase() : 'EXTERNAL') as PaymentMethod;
  const pay: InvoicePayment = { id: p.id, at: p.at ?? Date.now(), amountCents: amt, method, by: str(p.by, 60), ...(p.reference ? { reference: str(p.reference, 40) } : {}) };
  const paidCents = inv.paidCents + amt;
  return { invoice: { ...inv, payments: [...inv.payments, pay].slice(-60), paidCents, status: paidCents >= inv.totalCents ? 'PAID' : 'OPEN' } };
}
export function voidInvoice(inv: Invoice, reason: string): { invoice?: Invoice; error?: string } {
  if (inv.status === 'VOID') return { error: 'Already void.' };
  if (inv.paidCents > 0) return { error: 'This invoice has payments recorded. Void is only for unpaid invoices.' };
  if (!str(reason, 200)) return { error: 'A reason is required.' };
  return { invoice: { ...inv, status: 'VOID', voidReason: str(reason, 200) } };
}

// ── Aging + statements ────────────────────────────────────────────────────────────────────────────
export interface Aging { current: number; d1_30: number; d31_60: number; d61_90: number; d90plus: number; totalCents: number; count: number }
export const daysPastDue = (inv: Pick<Invoice, 'dueAt'>, now: number): number => Math.floor((now - inv.dueAt) / DAY);
export function agingBuckets(invoices: Invoice[], now = Date.now()): Aging {
  const a: Aging = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0, totalCents: 0, count: 0 };
  for (const i of invoices) {
    const bal = invoiceBalance(i); if (i.status !== 'OPEN' || bal <= 0) continue;
    const d = daysPastDue(i, now);
    if (d <= 0) a.current += bal; else if (d <= 30) a.d1_30 += bal; else if (d <= 60) a.d31_60 += bal; else if (d <= 90) a.d61_90 += bal; else a.d90plus += bal;
    a.totalCents += bal; a.count++;
  }
  return a;
}
export interface StatementRow { at: number; kind: 'INVOICE' | 'PAYMENT'; ref: string; description: string; chargeCents: number; paymentCents: number; balanceCents: number }
export interface Statement { account: Pick<CommercialAccount, 'id' | 'name' | 'termsDays'>; asOf: number; rows: StatementRow[]; balanceCents: number; aging: Aging }
export function buildStatement(account: Pick<CommercialAccount, 'id' | 'name' | 'termsDays'>, invoices: Invoice[], now = Date.now()): Statement {
  const mine = invoices.filter(i => i.accountId === account.id && i.status !== 'VOID');
  const ev: Omit<StatementRow, 'balanceCents'>[] = [];
  for (const i of mine) {
    ev.push({ at: i.issuedAt, kind: 'INVOICE', ref: i.number, description: `Invoice ${i.number} (${i.periodFrom} to ${i.periodTo}), due ${isoDate(i.dueAt)}`, chargeCents: i.totalCents, paymentCents: 0 });
    for (const p of i.payments) ev.push({ at: p.at, kind: 'PAYMENT', ref: i.number, description: `Payment ${p.method}${p.reference ? ' #' + p.reference : ''} on ${i.number}`, chargeCents: 0, paymentCents: p.amountCents });
  }
  ev.sort((a, b) => a.at - b.at || (a.kind === 'INVOICE' ? -1 : 1));
  let bal = 0; const rows = ev.map(e => { bal += e.chargeCents - e.paymentCents; return { ...e, balanceCents: bal }; });
  return { account, asOf: now, rows, balanceCents: bal, aging: agingBuckets(mine, now) };
}
const $ = (c: number) => `$${(c / 100).toFixed(2)}`;
export function statementHtml(s: Statement, o: { businessName?: string } = {}): string {
  const a = s.aging;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Statement - ${escapeHtml(s.account.name)}</title><style>body{font:13px system-ui,sans-serif;margin:20px;color:#111}h1{font-size:20px;margin:0}table{width:100%;border-collapse:collapse;margin-top:10px}th,td{border-bottom:1px solid #ccc;padding:5px 6px;text-align:left}th{font-size:11px;text-transform:uppercase}td.n,th.n{text-align:right}.age{display:flex;gap:10px;margin-top:12px}.age div{border:1px solid #999;padding:6px 10px;border-radius:6px}@media print{body{margin:8mm}}</style></head><body>
<h1>Statement - ${escapeHtml(s.account.name)}</h1><div>${escapeHtml(o.businessName || '')} - as of ${escapeHtml(isoDate(s.asOf))} - terms net ${s.account.termsDays}</div>
<table><tr><th>Date</th><th>Description</th><th class="n">Charges</th><th class="n">Payments</th><th class="n">Balance</th></tr>${s.rows.map(r => `<tr><td>${escapeHtml(isoDate(r.at))}</td><td>${escapeHtml(r.description)}</td><td class="n">${r.chargeCents ? $(r.chargeCents) : ''}</td><td class="n">${r.paymentCents ? $(r.paymentCents) : ''}</td><td class="n">${$(r.balanceCents)}</td></tr>`).join('') || '<tr><td colspan="5">No activity.</td></tr>'}</table>
<h2>Balance due: ${$(s.balanceCents)}</h2><div class="age"><div>Current<br><b>${$(a.current)}</b></div><div>1-30 days<br><b>${$(a.d1_30)}</b></div><div>31-60<br><b>${$(a.d31_60)}</b></div><div>61-90<br><b>${$(a.d61_90)}</b></div><div>90+<br><b>${$(a.d90plus)}</b></div></div>
<p>Payment is accepted by check, cash or your own bank transfer arrangement with us. Please reference the invoice number.</p></body></html>`;
}
export function invoiceHtml(inv: Invoice, o: { businessName?: string } = {}): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(inv.number)}</title><style>body{font:13px system-ui,sans-serif;margin:20px;color:#111}h1{font-size:22px;margin:0}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border-bottom:1px solid #ccc;padding:5px 6px;text-align:left}td.n,th.n{text-align:right}@media print{body{margin:8mm}}</style></head><body>
<h1>Invoice ${escapeHtml(inv.number)}</h1><div>${escapeHtml(o.businessName || '')}</div><div>Bill to: <b>${escapeHtml(inv.accountName)}</b> - Period ${escapeHtml(inv.periodFrom)} to ${escapeHtml(inv.periodTo)} - Issued ${escapeHtml(isoDate(inv.issuedAt))} - Due ${escapeHtml(isoDate(inv.dueAt))} (net ${inv.termsDays})</div>
<table><tr><th>Ticket</th><th>Completed</th><th>Description</th><th class="n">Amount</th><th class="n">Tax</th><th class="n">Total</th></tr>${inv.lines.map(l => `<tr><td>${escapeHtml(l.number)}</td><td>${escapeHtml(isoDate(l.doneAt))}</td><td>${escapeHtml(l.description)}</td><td class="n">${$(l.subtotalCents)}</td><td class="n">${$(l.taxCents)}</td><td class="n">${$(l.totalCents)}</td></tr>`).join('')}</table>
<p style="text-align:right">Subtotal ${$(inv.subtotalCents)} - Tax ${$(inv.taxCents)} - <b>Total ${$(inv.totalCents)}</b> - Paid ${$(inv.paidCents)} - <b>Balance ${$(invoiceBalance(inv))}</b></p>${inv.memo ? `<p>${escapeHtml(inv.memo)}</p>` : ''}<p>Payable by check, cash or your arranged bank transfer. This invoice is not payable through Plajah.</p></body></html>`;
}

/** Storage codec: arrays JSON-stringified (the server writer cannot store object arrays). */
export const serializeAccount = (a: CommercialAccount): Record<string, any> => ({ ...a, schedules: JSON.stringify(a.schedules), search: `${a.name} ${a.contactName || ''}`.toLowerCase() });
export const parseAccount = (d: Record<string, any>): CommercialAccount => ({ ...(d as any), schedules: (() => { try { const v = typeof d.schedules === 'string' ? JSON.parse(d.schedules) : d.schedules; return Array.isArray(v) ? v : []; } catch { return []; } })(), taxExempt: d.taxExempt === true, active: d.active !== false });
export const serializeInvoice = (i: Invoice): Record<string, any> => ({ ...i, lines: JSON.stringify(i.lines), payments: JSON.stringify(i.payments), balanceCents: invoiceBalance(i), ticketIds: JSON.stringify(i.lines.map(l => l.ticketId)) });
export function parseInvoice(d: Record<string, any>): Invoice {
  const j = (v: any) => { try { const x = typeof v === 'string' ? JSON.parse(v) : v; return Array.isArray(x) ? x : []; } catch { return []; } };
  const { ticketIds: _t, balanceCents: _b, ...rest } = d as any;
  return { ...rest, lines: j(d.lines), payments: j(d.payments) } as Invoice;
}
