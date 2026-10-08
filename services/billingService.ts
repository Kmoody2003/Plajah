// billingService — client for Plajah Billing: typed /api/billing/* wrappers (Bearer Firebase ID token),
// Firestore listeners for customers / price book / invoices / estimates / payment links / settings,
// integer-cents math (totals preview mirrors what the server computes), and number formatting.
// Money on the wire and in docs is DOLLARS (see types.ts); all arithmetic here goes through integer cents.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, deleteDoc, doc, query, setDoc, where } from 'firebase/firestore';
import { auth, db } from './firebase';
import { onSnapshot } from './safeSnapshot';
import type {
  BillingBalance, BillingConnection, BillingCustomer, BillingEntityRef, BillingItem, BillingSettings,
  Estimate, Invoice, InvoiceLine, InvoiceStatus, PaymentLink,
} from '../types';

// ── entity helpers ─────────────────────────────────────────────────────────────
export const entityKey = (e: BillingEntityRef) => `${e.kind}:${e.id}`;

// ── money (integer cents) ──────────────────────────────────────────────────────
export const toCents = (dollars: number | string | undefined | null): number => {
  const n = typeof dollars === 'string' ? parseFloat(dollars) : (dollars ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
export const fromCents = (c: number) => Math.round(c) / 100;
const fmtCache = new Map<string, Intl.NumberFormat>();
export function formatMoney(dollars: number, currency = 'usd'): string {
  const k = currency.toUpperCase();
  let f = fmtCache.get(k);
  if (!f) { try { f = new Intl.NumberFormat(undefined, { style: 'currency', currency: k }); } catch { f = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }); } fmtCache.set(k, f); }
  return f.format(dollars || 0);
}

export interface TotalsInput { lines: InvoiceLine[]; discount?: number; taxRate?: number /* percent, applied to taxable lines */ }
export interface Totals { subtotal: number; discount: number; tax: number; total: number }
/** Totals preview. Discount is a flat dollar amount spread pro-rata across taxable/non-taxable lines. */
export function computeTotals({ lines, discount = 0, taxRate = 0 }: TotalsInput): Totals {
  let sub = 0, taxableSub = 0;
  for (const l of lines) {
    const amt = Math.round(toCents(l.unitAmount) * (Number(l.quantity) || 0));
    sub += amt; if (l.taxable) taxableSub += amt;
  }
  const disc = Math.min(Math.max(toCents(discount), 0), sub);
  const taxableAfter = sub > 0 ? Math.round(taxableSub * (1 - disc / sub)) : 0;
  const tax = Math.round(taxableAfter * (Math.max(taxRate, 0) / 100));
  return { subtotal: fromCents(sub), discount: fromCents(disc), tax: fromCents(tax), total: fromCents(sub - disc + tax) };
}
export const lineAmount = (l: InvoiceLine) => fromCents(Math.round(toCents(l.unitAmount) * (Number(l.quantity) || 0)));

// ── dates ──────────────────────────────────────────────────────────────────────
export const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
export const addDaysISO = (iso: string, days: number) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
export const daysBetween = (a: string, b: string) => Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000);
export const fmtDate = (iso?: string) => iso ? new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
export const TERMS: { label: string; days: number }[] = [{ label: 'On receipt', days: 0 }, { label: 'Net 7', days: 7 }, { label: 'Net 15', days: 15 }, { label: 'Net 30', days: 30 }];

/** Effective status: OPEN/PARTIAL past due → OVERDUE (display only; server remains source of truth). */
export function effectiveStatus(inv: Pick<Invoice, 'status' | 'dueDate'>, today = todayISO()): InvoiceStatus {
  if ((inv.status === 'OPEN' || inv.status === 'PARTIAL') && inv.dueDate && inv.dueDate < today) return 'OVERDUE';
  return inv.status;
}

// ── API ────────────────────────────────────────────────────────────────────────
export class BillingApiError extends Error { code?: string; constructor(msg: string, code?: string) { super(msg); this.code = code; } }

async function call<T>(method: 'GET' | 'POST', path: string, body?: Record<string, unknown>, params?: Record<string, string>): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new BillingApiError('Sign in to continue');
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  let res: Response;
  try {
    res = await fetch(`/api/billing/${path}${qs}`, {
      method, headers: { Authorization: `Bearer ${token}`, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
      body: method === 'POST' ? JSON.stringify(body || {}) : undefined,
    });
  } catch { throw new BillingApiError('You appear to be offline — nothing was changed.'); }
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new BillingApiError(data?.error || `Request failed (${res.status})`, data?.code);
  return data as T;
}
export const isComingSoon = (e: unknown) => (e as BillingApiError)?.code === 'COMING_SOON';

const q = (e: BillingEntityRef) => ({ kind: e.kind, id: e.id });

export const billingApi = {
  connectStart: (entity: BillingEntityRef) => call<{ url: string }>('POST', 'connect/start', { entity }),
  connectLink: (entity: BillingEntityRef) => call<{ url: string }>('POST', 'connect/link', { entity }),
  status: (entity: BillingEntityRef) => call<BillingConnection>('GET', 'status', undefined, q(entity)),
  saveInvoice: (entity: BillingEntityRef, invoice: Partial<Invoice>) => call<{ invoice: Invoice }>('POST', 'invoices/save', { entity, invoice }).then(r => r.invoice),
  invoiceAction: (action: 'send' | 'void' | 'mark-paid' | 'remind' | 'duplicate' | 'sync', entity: BillingEntityRef, invoiceId: string, extra?: Record<string, unknown>) =>
    call<{ invoice: Invoice }>('POST', `invoices/${action}`, { entity, invoiceId, ...(extra || {}) }).then(r => r.invoice),
  invoicePdf: (entity: BillingEntityRef, invoiceId: string) => call<{ url: string }>('GET', 'invoices/pdf', undefined, { ...q(entity), invoiceId }).then(r => r.url),
  saveEstimate: (entity: BillingEntityRef, estimate: Partial<Estimate>) => call<{ estimate: Estimate }>('POST', 'estimates/save', { entity, estimate }).then(r => r.estimate),
  sendEstimate: (entity: BillingEntityRef, estimateId: string) => call<{ estimate: Estimate }>('POST', 'estimates/send', { entity, estimateId }).then(r => r.estimate),
  convertEstimate: (entity: BillingEntityRef, estimateId: string) => call<{ invoice: Invoice }>('POST', 'estimates/convert', { entity, estimateId }).then(r => r.invoice),
  createLink: (entity: BillingEntityRef, link: Partial<PaymentLink>) => call<{ link: PaymentLink }>('POST', 'payment-links/create', { entity, link }).then(r => r.link),
  deactivateLink: (entity: BillingEntityRef, linkId: string, active = false) => call<{ link: PaymentLink }>('POST', 'payment-links/deactivate', { entity, linkId, active }).then(r => r.link),
  balance: (entity: BillingEntityRef) => call<BillingBalance>('GET', 'balance', undefined, q(entity)),
};

// ── Firestore writes (customers / price book / settings are client-writable) ───
const strip = <T extends object>(o: T): T => JSON.parse(JSON.stringify(o)); // drops undefined (Firestore throws on it)
export const newId = (coll: string) => doc(collection(db, coll)).id;

export async function saveCustomer(entity: BillingEntityRef, c: Partial<BillingCustomer> & { name: string }): Promise<BillingCustomer> {
  const id = c.id || newId('billingCustomers');
  const full = strip({ ...c, id, entityKey: entityKey(entity), createdAt: c.createdAt || Date.now() }) as BillingCustomer;
  await setDoc(doc(db, 'billingCustomers', id), full);
  return full;
}
export async function saveItem(entity: BillingEntityRef, it: Partial<BillingItem> & { name: string; unitAmount: number }): Promise<BillingItem> {
  const id = it.id || newId('billingItems');
  const full = strip({ ...it, id, entityKey: entityKey(entity), active: it.active ?? true, createdAt: it.createdAt || Date.now() }) as BillingItem;
  await setDoc(doc(db, 'billingItems', id), full);
  return full;
}
export const deleteItem = (id: string) => deleteDoc(doc(db, 'billingItems', id));
export async function saveSettings(entity: BillingEntityRef, s: Partial<BillingSettings>) {
  const key = entityKey(entity);
  await setDoc(doc(db, 'billingSettings', key.replace(/[/]/g, '_')), strip({ ...s, entityKey: key, entity, updatedAt: Date.now() }), { merge: true });
}

// ── live lists ─────────────────────────────────────────────────────────────────
function useEntityList<T extends { id: string; createdAt?: number }>(coll: string, entity: BillingEntityRef, enabled = true) {
  const key = entityKey(entity);
  const [rows, setRows] = useState<T[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    setLoading(true);
    const unsub = onSnapshot(query(collection(db, coll), where('entityKey', '==', key)),
      s => { setRows(s.docs.map(d => ({ ...(d.data() as any), id: d.id } as T)).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))); setError(null); setLoading(false); },
      e => { setError(e?.message || 'Could not load.'); setLoading(false); });
    return () => { try { (unsub as any)?.(); } catch { /* */ } };
  }, [coll, key, enabled]);
  return { rows, loading, error };
}
export const useBillingCustomers = (e: BillingEntityRef, on = true) => useEntityList<BillingCustomer>('billingCustomers', e, on);
export const useBillingItems = (e: BillingEntityRef, on = true) => useEntityList<BillingItem>('billingItems', e, on);
export const useBillingInvoices = (e: BillingEntityRef, on = true) => useEntityList<Invoice>('billingInvoices', e, on);
export const useBillingEstimates = (e: BillingEntityRef, on = true) => useEntityList<Estimate>('billingEstimates', e, on);
export const useBillingLinks = (e: BillingEntityRef, on = true) => useEntityList<PaymentLink>('billingPaymentLinks', e, on);

export function useBillingSettings(entity: BillingEntityRef) {
  const key = entityKey(entity);
  const [settings, setSettings] = useState<BillingSettings | null>(null); const [loading, setLoading] = useState(true);
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'billingSettings', key.replace(/[/]/g, '_')),
      s => { setSettings(s.exists() ? (s.data() as BillingSettings) : null); setLoading(false); }, () => setLoading(false));
    return () => { try { (unsub as any)?.(); } catch { /* */ } };
  }, [key]);
  return { settings, loading };
}

// ── Stripe connection (cached, deduped) ────────────────────────────────────────
const connCache = new Map<string, { conn: BillingConnection | null; at: number }>();
const connInflight = new Map<string, Promise<BillingConnection>>();
export const isStripeReady = (c?: BillingConnection | null) => !!(c?.stripeAccountId && c.chargesEnabled && c.detailsSubmitted);

export function useBillingConnection(entity: BillingEntityRef, opts?: { enabled?: boolean }) {
  const key = entityKey(entity); const enabled = opts?.enabled !== false;
  const hit = connCache.get(key);
  const [conn, setConn] = useState<BillingConnection | null>(hit?.conn ?? null);
  const [loading, setLoading] = useState(enabled && !hit);
  const [error, setError] = useState<string | null>(null);
  const [comingSoon, setComingSoon] = useState(false);
  const alive = useRef(true); useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const refresh = useCallback(async (force = true) => {
    const h = connCache.get(key);
    if (!force && h && Date.now() - h.at < 60000) { setConn(h.conn); setLoading(false); return; }
    let p = connInflight.get(key);
    if (!p) { p = billingApi.status(entity).finally(() => connInflight.delete(key)); connInflight.set(key, p); }
    try { const c = await p; connCache.set(key, { conn: c, at: Date.now() }); if (alive.current) { setConn(c); setError(null); setComingSoon(false); } }
    catch (e: any) { if (alive.current) { if (isComingSoon(e)) setComingSoon(true); else setError(e?.message || 'Could not check Stripe.'); } }
    finally { if (alive.current) setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!enabled) return;
    // Returning from Stripe onboarding (?billing=connected): bypass the cache.
    let returned = false;
    try { returned = new URLSearchParams(window.location.search).get('billing') === 'connected'; } catch { /* */ }
    refresh(!returned ? false : true);
  }, [enabled, refresh]);

  const connect = useCallback(async () => {
    const needsLink = !!conn?.stripeAccountId;
    const { url } = needsLink ? await billingApi.connectLink(entity) : await billingApi.connectStart(entity);
    if (!url) throw new BillingApiError('Stripe did not return a link.');
    window.location.href = url;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, conn?.stripeAccountId]);

  return { conn, loading, error, comingSoon, ready: isStripeReady(conn), refresh, connect };
}

// ── summary ────────────────────────────────────────────────────────────────────
export interface BillingSummary {
  outstanding: number; overdue: number; overdueCount: number; paidThisMonth: number; draftCount: number; openCount: number;
  aging: { bucket: string; amount: number; count: number }[];
}
export function summarize(invoices: Invoice[], today = todayISO()): BillingSummary {
  let out = 0, over = 0, overN = 0, paid = 0, drafts = 0, open = 0;
  const aging = [{ bucket: 'Current', amount: 0, count: 0 }, { bucket: '1–30 late', amount: 0, count: 0 }, { bucket: '31–60 late', amount: 0, count: 0 }, { bucket: '60+ late', amount: 0, count: 0 }];
  const monthStart = today.slice(0, 7);
  for (const inv of invoices) {
    const st = effectiveStatus(inv, today);
    if (st === 'DRAFT') drafts++;
    if (st === 'PAID' && inv.paidAt && new Date(inv.paidAt).toISOString().slice(0, 7) === monthStart) paid += toCents(inv.total);
    if (st === 'OPEN' || st === 'PARTIAL' || st === 'OVERDUE') {
      open++; const due = toCents(inv.amountDue); out += due;
      const late = st === 'OVERDUE' ? daysBetween(inv.dueDate, today) : 0;
      if (st === 'OVERDUE') { over += due; overN++; }
      const b = late <= 0 ? 0 : late <= 30 ? 1 : late <= 60 ? 2 : 3;
      aging[b].amount += due; aging[b].count++;
    }
  }
  return { outstanding: fromCents(out), overdue: fromCents(over), overdueCount: overN, paidThisMonth: fromCents(paid), draftCount: drafts, openCount: open, aging: aging.map(a => ({ ...a, amount: fromCents(a.amount) })) };
}
export function useBillingSummary(entity: BillingEntityRef, enabled = true) {
  const { rows, loading, error } = useBillingInvoices(entity, enabled);
  const summary = useMemo(() => summarize(rows), [rows]);
  return { summary, invoices: rows, loading, error };
}

// ── misc ───────────────────────────────────────────────────────────────────────
export const emptyLine = (): InvoiceLine => ({ description: '', quantity: 1, unitAmount: 0, taxable: false });
export const isEmail = (s?: string) => !!s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
export async function copyText(t: string): Promise<boolean> { try { await navigator.clipboard.writeText(t); return true; } catch { return false; } }
