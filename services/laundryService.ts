// laundryService - client for the laundromat layer (/api/laundry/*). The UI talks to the small `LaundryApi`
// interface so the dev preview can swap in the in-memory demo (createDemoLaundryApi) with no server.
// A LaundryApi is found from the TicketApi the board already has: `laundryApiFor(ticketApi)`.
import { authedFetch, svCustomer } from './registerService';
import type { Ticket } from './ticketCore';
import type { TicketApi } from './ticketService';
import { cleanLaundrySettings, DEFAULT_LAUNDRY, type LaundrySettings } from './laundryDefaults';
import { cleanAccount, expandSchedule, buildStatement, applyInvoicePayment, voidInvoice, type CommercialAccount, type Invoice, type Statement } from './commercialCore';

export interface LaundryApi {
  settings(): Promise<LaundrySettings>;
  saveSettings(s: LaundrySettings): Promise<LaundrySettings>;
  accounts(): Promise<CommercialAccount[]>;
  saveAccount(a: Partial<CommercialAccount> & { name: string }): Promise<CommercialAccount>;
  billToAccount(ticketId: string): Promise<Ticket>;
  invoices(accountId?: string): Promise<Invoice[]>;
  generateInvoice(a: { accountId: string; periodFrom: string; periodTo: string; memo?: string }): Promise<{ invoice: Invoice; skipped: number }>;
  payInvoice(id: string, a: { amountCents: number; method: string; reference?: string }): Promise<Invoice>;
  voidInvoice(id: string, reason: string): Promise<Invoice>;
  statement(accountId: string): Promise<Statement>;
  generateSchedule(a: { from?: string; to?: string; accountId?: string }): Promise<{ created: { number: string; account: string; date: string }[]; from: string; to: string }>;
  runReminders(): Promise<{ sent: { number: string; kind: string; day: number; push: boolean; email: boolean }[]; ownerReview: string[] }>;
  /** Wallet balance in cents for an attached Plajah customer, or null when they have no wallet / lookup fails. */
  walletBalance(customerUid: string): Promise<number | null>;
  businessName?: string;
}

export function serverLaundryApi(businessUid: string, sessionToken?: string | null): LaundryApi {
  const h = sessionToken ? { 'X-Register-Session': sessionToken } : {};
  const call = (name: string, body: any = {}) => authedFetch(`/api/laundry/${name}`, { businessUid, ...body }, h);
  return {
    settings: async () => cleanLaundrySettings((await call('settings/get')).settings),
    saveSettings: async s => cleanLaundrySettings((await call('settings/set', { settings: s })).settings),
    accounts: async () => (await call('accounts/list')).accounts,
    saveAccount: async a => (await call('accounts/upsert', { account: a })).account,
    billToAccount: async ticketId => (await call('bill-to-account', { ticketId })).ticket,
    invoices: async accountId => (await call('invoices/list', { accountId })).invoices,
    generateInvoice: a => call('invoices/generate', a),
    payInvoice: async (invoiceId, a) => (await call('invoices/pay', { invoiceId, ...a })).invoice,
    voidInvoice: async (invoiceId, reason) => (await call('invoices/void', { invoiceId, reason })).invoice,
    statement: async accountId => (await call('invoices/statement', { accountId })).statement,
    generateSchedule: a => call('schedule/generate', a),
    runReminders: () => call('reminders/run'),
    walletBalance: async uid => { try { const r = await svCustomer(businessUid, uid, sessionToken); return r.wallet ? r.wallet.balanceCents : null; } catch { return null; } },
  };
}

// Registry: the preview attaches a demo; production derives the server API from the TicketApi's `ctx`.
const attached = new WeakMap<object, LaundryApi>();
export const attachLaundryApi = (ticketApi: TicketApi, api: LaundryApi): TicketApi => { attached.set(ticketApi, api); return ticketApi; };
const derived = new WeakMap<object, LaundryApi>();
export function laundryApiFor(ticketApi: TicketApi): LaundryApi | null {
  const a = attached.get(ticketApi); if (a) return a;
  const ctx = (ticketApi as any).ctx as { businessUid: string; sessionToken?: string | null } | undefined;
  if (!ctx?.businessUid) return null;
  let d = derived.get(ticketApi); if (!d) { d = serverLaundryApi(ctx.businessUid, ctx.sessionToken); derived.set(ticketApi, d); }
  return d;
}

/** In-memory LaundryApi for the dev preview (uses the same pure cores as the server; nothing persists). */
export function createDemoLaundryApi(seed: { accounts?: CommercialAccount[]; invoices?: Invoice[]; wallet?: Record<string, number>; settings?: Partial<LaundrySettings> } = {}): LaundryApi & { state: { accounts: CommercialAccount[]; invoices: Invoice[] } } {
  const state = { accounts: [...(seed.accounts || [])], invoices: [...(seed.invoices || [])] };
  let settings = cleanLaundrySettings({ ...DEFAULT_LAUNDRY, ...seed.settings, promo: { ...DEFAULT_LAUNDRY.promo, enabled: true, ...(seed.settings?.promo || {}) } });
  const wait = () => new Promise(r => setTimeout(r, 80));
  return {
    state, businessName: 'Suds & Co Laundromat',
    settings: async () => { await wait(); return settings; },
    saveSettings: async s => { await wait(); settings = cleanLaundrySettings(s); return settings; },
    accounts: async () => { await wait(); return state.accounts; },
    saveAccount: async a => {
      await wait(); const id = (a as any).id || `ac_${Date.now().toString(36)}`; const r = cleanAccount(a, id, 'demo'); if (!r.account) throw new Error(r.error);
      state.accounts = [...state.accounts.filter(x => x.id !== id), r.account]; return r.account;
    },
    billToAccount: async () => { throw new Error('Charging to an account is exercised against the real server; the preview does not hold ticket totals here.'); },
    invoices: async accountId => { await wait(); return state.invoices.filter(i => !accountId || i.accountId === accountId); },
    generateInvoice: async () => { throw new Error('Invoice generation needs real tickets; use the server (covered by tests/laundryCore.test.ts).'); },
    payInvoice: async (id, a) => {
      await wait(); const i = state.invoices.find(x => x.id === id); if (!i) throw new Error('Invoice not found.');
      const r = applyInvoicePayment(i, { id: `pay_${Date.now()}`, ...a, by: 'Demo Owner' }); if (!r.invoice) throw new Error(r.error);
      state.invoices = state.invoices.map(x => (x.id === id ? r.invoice! : x)); return r.invoice;
    },
    voidInvoice: async (id, reason) => {
      await wait(); const i = state.invoices.find(x => x.id === id); if (!i) throw new Error('Invoice not found.'); const r = voidInvoice(i, reason); if (!r.invoice) throw new Error(r.error);
      state.invoices = state.invoices.map(x => (x.id === id ? r.invoice! : x)); return r.invoice;
    },
    statement: async accountId => { await wait(); const a = state.accounts.find(x => x.id === accountId); if (!a) throw new Error('Account not found.'); return buildStatement(a, state.invoices, Date.now()); },
    generateSchedule: async a => {
      await wait(); const from = a.from || new Date().toISOString().slice(0, 10); const to = a.to || new Date(Date.now() + 6 * 86_400_000).toISOString().slice(0, 10);
      const created = state.accounts.flatMap(ac => expandSchedule(ac, from, to).map((p, i) => ({ number: `WF-${900 + i}`, account: ac.name, date: p.date })));
      return { created, from, to };
    },
    runReminders: async () => { await wait(); return { sent: [], ownerReview: [] }; },
    walletBalance: async uid => { await wait(); return seed.wallet && uid in seed.wallet ? seed.wallet[uid] : null; },
  } as any;
}
