// Plajah Billing — server side. Invoices / estimates / payment links / balance for ANY billing entity
// (USER | ORG | BUSINESS | PRODUCTION). Money moves on the ENTITY'S OWN Stripe account (DIRECT: every
// Stripe call carries { stripeAccount }) — invoices live in the entity's own Stripe dashboard, Stripe
// fees are theirs, Plajah never holds funds. Plajah's application fee is BILLING_APP_FEE_PCT (default 0).
//
// Every route first checks config/billingFlags (30s cache): OFF → 403 {code:'COMING_SOON', flag}
// (platform admins pass through, response header X-Billing-Preview: 1). Entity authorisation is ALWAYS
// re-derived server-side (resolveBillingEntity) — the client's claim about who it is billing is never trusted.
//
// Works with NO webhook: POST /api/billing/invoices/sync and the sweep (POST /api/billing/recurring/run,
// optional in-process BILLING_SWEEP=1) pull state from Stripe. The Connect webhook (dormant until
// STRIPE_CONNECT_WEBHOOK_SECRET exists) calls handleConnectEvent for the same mirror, idempotently.
//
// Wired from server.ts via createBilling(deps); see docs/STRIPE_SETUP_CHECKLIST.md.

import express from 'express';
import rateLimit from 'express-rate-limit';
import nodeCrypto from 'node:crypto';
import { invoiceIssuedEntry, invoicePaymentEntry, reversalOf, journalDocId, type DraftJournal, type SysAccounts } from '../services/acctPosting';
import type { BillingEntityKind, BillingEntityRef, BillingFlagKey, InvoiceStatus } from '../types';

export interface BillingDeps {
  getStripe: () => any;
  authMiddleware: any;
  requireRegisteredUser: any;
  trustedRequestOrigin: (req: any) => string;
  firestoreAuthHeaders: () => Promise<Record<string, string>>;
  /** deep doc read (nested maps/arrays intact) */
  read: (collection: string, id: string) => Promise<Record<string, any> | null>;
  /** merge-patch specific fields (creates the doc if absent) */
  patch: (collection: string, id: string, fields: Record<string, any>) => Promise<boolean>;
  /** create with auto id (scalar fields only) */
  create: (collection: string, data: object) => Promise<string | null>;
  query: (collection: string, filters: Array<{ field: string; op: string; value: any }>, limit?: number) => Promise<Array<{ id: string; data: Record<string, any> }>>;
  isPlatformAdmin: (uid: string) => Promise<boolean>;
  autoPost: (orgId: string, make: (sys: SysAccounts) => DraftJournal) => Promise<string | null>;
  postJournal: (orgId: string, draft: DraftJournal) => Promise<string | null>;
}

const PROJECT = 'gen-lang-client-0665118474';
const DB = 'plajah-prod';
const TZ = process.env.ELEVATE_TZ || 'America/Detroit';

class BillingError extends Error {
  constructor(public status: number, message: string, public code?: string, public extra?: Record<string, any>) { super(message); }
}
const fail = (status: number, message: string, code?: string, extra?: Record<string, any>): never => { throw new BillingError(status, message, code, extra); };

// ── small pure helpers ───────────────────────────────────────────────────────
const safeId = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '_');
const c2d = (c: number) => Math.round(c || 0) / 100;
const d2c = (d: number) => Math.round(Number((Number(d) * 100).toPrecision(12)));
const clean = <T,>(o: T): T => JSON.parse(JSON.stringify(o));
const todayIso = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
const isIso = (s: any) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
const str = (v: any, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const idOf = (x: any): string | undefined => (typeof x === 'string' ? x : x?.id) || undefined;
const appFeePct = () => { const n = Number(process.env.BILLING_APP_FEE_PCT || 0); return Number.isFinite(n) ? Math.max(0, Math.min(30, n)) : 0; };

/** anchor + n periods, day clamped to month length (Jan 31 + 1 month = Feb 28/29). */
function addPeriod(anchor: string, interval: 'week' | 'month' | 'year', n: number): string {
  if (interval === 'week') return addDays(anchor, 7 * n);
  const [y, m, d] = anchor.split('-').map(Number);
  const months = interval === 'month' ? n : 12 * n;
  const total = (m - 1) + months;
  const ny = y + Math.floor(total / 12), nm = ((total % 12) + 12) % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

export interface Totals { subtotalC: number; discountC: number; taxC: number; totalC: number }
/** Integer-cents totals. Tax = explicit `tax` dollars, or taxRatePct applied to the taxable share (after discount). */
export function computeTotals(lines: Array<{ quantity: number; unitAmount: number; taxable?: boolean }>, discount?: number, tax?: number, taxRatePct?: number): Totals {
  const lineC = lines.map(l => d2c(l.quantity * l.unitAmount));
  const subtotalC = lineC.reduce((s, c) => s + c, 0);
  const discountC = Math.min(Math.max(0, d2c(discount || 0)), subtotalC);
  let taxC = 0;
  if (taxRatePct && taxRatePct > 0) {
    const taxableC = lines.reduce((s, l, i) => s + (l.taxable ? lineC[i] : 0), 0);
    const base = subtotalC > 0 ? Math.round(taxableC * (subtotalC - discountC) / subtotalC) : 0;
    taxC = Math.round(base * taxRatePct / 100);
  } else taxC = Math.max(0, d2c(tax || 0));
  return { subtotalC, discountC, taxC, totalC: subtotalC - discountC + taxC };
}

const COLL: Record<BillingEntityKind, string> = { USER: 'users', ORG: 'organizations', BUSINESS: 'businesses', PRODUCTION: 'productions' };
const ACCT_FIELD = (k: BillingEntityKind) => (k === 'USER' ? 'stripeConnectAccountId' : 'stripeAccountId');

interface Ent {
  kind: BillingEntityKind; id: string; entityKey: string; name: string; ownerUid: string;
  stripeAccountId?: string; doc: Record<string, any>;
}
const ALL_FLAGS: BillingFlagKey[] = ['INVOICES', 'ESTIMATES', 'RECURRING_INVOICES', 'INSTALLMENTS', 'REMINDERS', 'PAYMENT_LINKS', 'CUSTOMERS', 'PRICE_BOOK', 'BALANCE_DASHBOARD', 'SALES_TAX', 'ACCOUNTING_SYNC', 'CREW_PAY', 'PRODUCTION_FINANCE'];

export function createBilling(deps: BillingDeps) {
  const stripe = () => deps.getStripe();
  const memo = new Map<string, { v: any; exp: number }>();
  const cached = async <T,>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> => {
    const hit = memo.get(key);
    if (hit && hit.exp > Date.now()) return hit.v as T;
    const v = await fn();
    memo.set(key, { v, exp: Date.now() + ttlMs });
    if (memo.size > 2000) for (const [k, e] of memo) if (e.exp < Date.now()) memo.delete(k);
    return v;
  };

  // ── flags ──────────────────────────────────────────────────────────────────
  let flagCache: { v: Record<string, boolean>; exp: number } | null = null;
  async function flagsNow(): Promise<Record<string, boolean>> {
    if (flagCache && flagCache.exp > Date.now()) return flagCache.v;
    let v: Record<string, boolean> = {};
    try { const d = await deps.read('config', 'billingFlags'); for (const k of ALL_FLAGS) v[k] = d?.[k] === true; } catch { v = {}; }
    flagCache = { v, exp: Date.now() + 30_000 };
    return v;
  }
  const adminCache = new Map<string, { v: boolean; exp: number }>();
  async function isAdminUid(uid: string): Promise<boolean> {
    const hit = adminCache.get(uid);
    if (hit && hit.exp > Date.now()) return hit.v;
    let v = false; try { v = await deps.isPlatformAdmin(uid); } catch { v = false; }
    adminCache.set(uid, { v, exp: Date.now() + 60_000 });
    return v;
  }
  /** Throws 403 COMING_SOON when `flag` is OFF, unless the caller is a platform admin (preview). */
  async function requireFlag(req: any, res: any, flag: BillingFlagKey | BillingFlagKey[]): Promise<void> {
    const flags = await flagsNow();
    const list = Array.isArray(flag) ? flag : [flag];
    if (list.some(f => flags[f])) return;
    if (req?.uid && await isAdminUid(req.uid)) { res?.setHeader?.('X-Billing-Preview', '1'); return; }
    fail(403, 'Coming soon', 'COMING_SOON', { flag: list[0] });
  }

  // ── entity resolution + authorization ──────────────────────────────────────
  const parseRef = (raw: any): BillingEntityRef => {
    const kind = String(raw?.kind || '').toUpperCase() as BillingEntityKind;
    const id = String(raw?.id || '');
    if (!COLL[kind]) fail(400, 'Unknown entity kind', 'BAD_ENTITY');
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(id)) fail(400, 'Bad entity id', 'BAD_ENTITY');
    return { kind, id };
  };
  async function loadEntity(ref: BillingEntityRef): Promise<Ent | null> {
    const entityKey = `${ref.kind}:${ref.id}`;
    const doc = await deps.read(COLL[ref.kind], ref.id);
    if (ref.kind === 'BUSINESS') {
      // businesses/{ownerUid} may not exist until something is written to it; the id IS the owner's uid.
      const d = doc || {};
      const page = await deps.read('businessPages', ref.id).catch(() => null);
      const owner = await deps.read('users', ref.id).catch(() => null);
      const name = page?.name || page?.businessName || d.name || owner?.displayName || 'Business';
      return { kind: 'BUSINESS', id: ref.id, entityKey, name, ownerUid: ref.id, stripeAccountId: d.stripeAccountId || undefined, doc: d };
    }
    if (!doc) return null;
    if (ref.kind === 'USER') return { kind: 'USER', id: ref.id, entityKey, name: doc.displayName || doc.name || doc.username || 'Plajah creator', ownerUid: ref.id, stripeAccountId: doc.stripeConnectAccountId || undefined, doc };
    if (ref.kind === 'ORG') return { kind: 'ORG', id: ref.id, entityKey, name: doc.name || 'Organization', ownerUid: doc.creatorId || '', stripeAccountId: doc.stripeAccountId || undefined, doc };
    return { kind: 'PRODUCTION', id: ref.id, entityKey, name: doc.title || 'Production', ownerUid: doc.ownerUid || '', stripeAccountId: doc.stripeAccountId || undefined, doc };
  }
  const orgStaff = (org: Record<string, any>, uid: string) => {
    const inList = (k: string) => Array.isArray(org[k]) && org[k].includes(uid);
    return org.creatorId === uid || inList('admins') || inList('financeUids') || inList('accountingUids') || inList('pastorUids');
  };
  function canAdminister(uid: string, e: Ent): boolean {
    switch (e.kind) {
      case 'USER': case 'BUSINESS': return e.id === uid;
      case 'ORG': return orgStaff(e.doc, uid);
      case 'PRODUCTION':
        if (e.doc.isShowcase === true) return false;
        return e.doc.ownerUid === uid || !!e.doc.authority?.[uid]?.permissions?.includes?.('MANAGE_BUDGET');
    }
  }
  /** Public contract: who may administer {kind,id}. Production billing additionally needs PRODUCTION_FINANCE. */
  async function resolveBillingEntity(uid: string, ref: BillingEntityRef): Promise<{ ok: true; stripeAccountId?: string; name: string; ownerUid: string; entityKey: string; doc: Record<string, any>; ent: Ent } | { ok: false; status: number; error: string }> {
    const ent = await loadEntity(ref);
    if (!ent) return { ok: false, status: 404, error: 'Not found' };
    if (!canAdminister(uid, ent)) return { ok: false, status: 403, error: 'You do not manage this account' };
    return { ok: true, stripeAccountId: ent.stripeAccountId, name: ent.name, ownerUid: ent.ownerUid, entityKey: ent.entityKey, doc: ent.doc, ent };
  }
  async function entityFor(req: any, res: any, raw: any): Promise<Ent> {
    const ref = parseRef(raw);
    const r = await resolveBillingEntity(req.uid, ref);
    const x = r as any;
    if (!x.ok) return fail(x.status, x.error, x.status === 403 ? 'FORBIDDEN' : 'NOT_FOUND');
    if (ref.kind === 'PRODUCTION') await requireFlag(req, res, 'PRODUCTION_FINANCE');
    return x.ent as Ent;
  }

  /** The entity's Stripe account — verified to be BOUND to this entity (stops someone pointing their own
   *  org/business doc at another connected account). Legacy accounts (metadata.uid only) pass when that uid
   *  is the owner / a staff member of the entity. Cached 60s. */
  async function billingAccount(ent: Ent, fresh = false): Promise<{ id: string; account: any }> {
    const acct = ent.stripeAccountId;
    if (!acct) return fail(409, 'Stripe is not connected for this account yet', 'NOT_CONNECTED');
    const key = `acct:${ent.entityKey}:${acct}`;
    if (fresh) memo.delete(key);
    const account = await cached(key, 60_000, async () => {
      const a = await stripe().accounts.retrieve(acct);
      const md = a.metadata || {};
      const legacyOk = !md.entityKey && !!md.uid && (ent.kind === 'ORG' ? orgStaff(ent.doc, md.uid) : (md.uid === ent.ownerUid || md.uid === ent.id));
      if (md.entityKey !== ent.entityKey && !legacyOk) fail(403, 'This Stripe account is not linked to this entity', 'ACCOUNT_MISMATCH');
      return a;
    });
    return { id: acct, account };
  }
  const opts = (acct: string) => ({ stripeAccount: acct });

  async function mirrorConnection(ent: Ent, account: any) {
    const conn = clean({
      stripeAccountId: account.id, chargesEnabled: !!account.charges_enabled, payoutsEnabled: !!account.payouts_enabled,
      detailsSubmitted: !!account.details_submitted,
      requirementsDue: [...new Set<string>([...(account.requirements?.currently_due || []), ...(account.requirements?.past_due || [])])],
      checkedAt: Date.now(),
    });
    await deps.patch(COLL[ent.kind], ent.id, { billingConnection: conn });
    return { entity: { kind: ent.kind, id: ent.id }, ...conn };
  }

  // ── notifications / email ──────────────────────────────────────────────────
  async function notifyUser(uid: string | undefined, title: string, message: string, targetId: string, senderName: string) {
    if (!uid) return;
    try { await deps.create('notifications', { userId: uid, senderId: 'plajah-billing', senderName, senderPhoto: '', type: 'SYSTEM', title, message, targetId, isRead: false, timestamp: Date.now() }); } catch { /* best effort */ }
  }
  async function emailVia(to: string | undefined, subject: string, html: string): Promise<boolean> {
    const key = process.env.RESEND_API_KEY;
    if (!key || !to || !to.includes('@')) return false;
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: process.env.RESEND_FROM || 'Plajah <onboarding@resend.dev>', to, subject, html }),
      });
      return r.ok;
    } catch { return false; }
  }
  const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

  // ── sequential numbers (optimistic-concurrency counter, atomic via commit precondition) ──
  async function nextNumber(entityKey: string, prefix: 'INV' | 'EST'): Promise<string> {
    const id = `bc_${safeId(entityKey)}_${prefix}`;
    const name = `projects/${PROJECT}/databases/${DB}/documents/billingCounters/${id}`;
    for (let i = 0; i < 10; i++) {
      const h = await deps.firestoreAuthHeaders();
      const r = await fetch(`https://firestore.googleapis.com/v1/${name}`, { headers: h });
      let seq = 0; let pre: any;
      if (r.status === 404) pre = { exists: false };
      else if (r.ok) { const j: any = await r.json(); seq = Number(j.fields?.seq?.integerValue || 0); pre = { updateTime: j.updateTime }; }
      else return fail(503, 'Could not allocate a number', 'COUNTER');
      const next = seq + 1;
      const c = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${DB}/documents:commit`, {
        method: 'POST', headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({ writes: [{ update: { name, fields: { seq: { integerValue: String(next) }, entityKey: { stringValue: entityKey } } }, currentDocument: pre }] }),
      });
      if (c.ok) return `${prefix}-${String(next).padStart(4, '0')}`;
      await new Promise(r2 => setTimeout(r2, 40 + Math.random() * 120));   // lost the race → re-read and retry
    }
    return fail(503, 'Numbering is busy, try again', 'COUNTER');
  }

  // ── validation / draft building ────────────────────────────────────────────
  function normLines(raw: any): Array<{ itemId?: string; description: string; quantity: number; unitAmount: number; taxable?: boolean }> {
    if (!Array.isArray(raw) || raw.length < 1 || raw.length > 100) fail(400, 'Add between 1 and 100 line items', 'BAD_LINES');
    return raw.map((l: any, i: number) => {
      const description = str(l?.description, 500);
      const quantity = Number(l?.quantity), unitAmount = Number(l?.unitAmount);
      if (!description) fail(400, `Line ${i + 1}: description required`, 'BAD_LINES');
      if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) fail(400, `Line ${i + 1}: quantity must be > 0`, 'BAD_LINES');
      if (!Number.isFinite(unitAmount) || unitAmount < 0 || unitAmount > 10_000_000) fail(400, `Line ${i + 1}: unit amount out of range`, 'BAD_LINES');
      return { ...(l.itemId ? { itemId: str(l.itemId, 100) } : {}), description, quantity: Math.round(quantity * 1000) / 1000, unitAmount: c2d(d2c(unitAmount)), taxable: !!l.taxable };
    });
  }
  async function customerOf(ent: Ent, customerId: any): Promise<Record<string, any>> {
    const c = await deps.read('billingCustomers', str(customerId, 200) || '_none_');
    if (!c || c.entityKey !== ent.entityKey) return fail(400, 'Choose one of your customers', 'BAD_CUSTOMER');
    return { ...c, id: str(customerId, 200) };
  }
  const intList = (v: any, max: number) => (Array.isArray(v) ? [...new Set(v.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 90))].slice(0, max) : undefined);

  /** Validate + normalise an invoice draft into the fields we persist (totals are server-computed). */
  async function buildInvoiceFields(req: any, res: any, ent: Ent, d: any, existing?: Record<string, any>): Promise<Record<string, any>> {
    const cust = await customerOf(ent, d.customerId);
    const lines = normLines(d.lines);
    const issueDate = d.issueDate ? (isIso(d.issueDate) ? d.issueDate : fail(400, 'Bad issue date', 'BAD_DATE')) : todayIso();
    const dueDate = d.dueDate ? (isIso(d.dueDate) ? d.dueDate : fail(400, 'Bad due date', 'BAD_DATE')) : addDays(issueDate, 14);
    if (dueDate < issueDate) fail(400, 'Due date is before the issue date', 'BAD_DATE');
    const currency = /^[a-zA-Z]{3}$/.test(String(d.currency || '')) ? String(d.currency).toLowerCase() : 'usd';
    const discount = d.discount !== undefined && d.discount !== null ? Number(d.discount) : 0;
    if (!Number.isFinite(discount) || discount < 0) fail(400, 'Bad discount', 'BAD_AMOUNT');
    const taxRatePct = d.taxRatePct !== undefined && d.taxRatePct !== null && d.taxRatePct !== '' ? Number(d.taxRatePct) : undefined;
    if (taxRatePct !== undefined && (!Number.isFinite(taxRatePct) || taxRatePct < 0 || taxRatePct > 50)) fail(400, 'Bad tax rate', 'BAD_AMOUNT');
    const tax = d.tax !== undefined && d.tax !== null ? Number(d.tax) : 0;
    if (!Number.isFinite(tax) || tax < 0) fail(400, 'Bad tax', 'BAD_AMOUNT');
    const t = computeTotals(lines, discount, tax, taxRatePct);
    if (t.totalC > 99_999_999) fail(400, 'Total too large', 'BAD_AMOUNT');

    const f: Record<string, any> = {
      entityKey: ent.entityKey, entity: { kind: ent.kind, id: ent.id },
      customerId: cust.id, customerName: cust.name || cust.company || 'Customer', customerEmail: cust.email || '', customerUid: cust.plajahUid || '',
      lines, subtotal: c2d(t.subtotalC), discount: c2d(t.discountC), tax: c2d(t.taxC), total: c2d(t.totalC),
      amountPaid: existing?.amountPaid || 0, amountDue: c2d(t.totalC), currency, issueDate, dueDate,
      memo: str(d.memo, 2000), footer: str(d.footer, 2000), poNumber: str(d.poNumber, 100), projectRef: str(d.projectRef, 200),
      ...(taxRatePct !== undefined ? { taxRatePct } : { taxRatePct: null }),
      ...(d.estimateId ? { estimateId: str(d.estimateId, 200) } : {}),
    };
    if (Array.isArray(d.schedule) && d.schedule.length) {
      await requireFlag(req, res, 'INSTALLMENTS');
      if (d.schedule.length > 24) fail(400, 'At most 24 installments', 'BAD_SCHEDULE');
      const sched = d.schedule.map((s: any, i: number) => {
        const amount = Number(s?.amount);
        if (!Number.isFinite(amount) || amount <= 0) fail(400, `Installment ${i + 1}: amount must be > 0`, 'BAD_SCHEDULE');
        if (!isIso(s?.dueDate)) fail(400, `Installment ${i + 1}: bad due date`, 'BAD_SCHEDULE');
        return { label: str(s?.label, 80) || `Payment ${i + 1}`, amount: c2d(d2c(amount)), dueDate: s.dueDate, paid: false };
      });
      if (sched.reduce((s: number, x: any) => s + d2c(x.amount), 0) !== t.totalC) fail(400, 'Installments must add up to the invoice total', 'SCHEDULE_MISMATCH', { total: c2d(t.totalC) });
      f.schedule = sched;
    } else f.schedule = [];
    if (d.recurring && typeof d.recurring === 'object') {
      await requireFlag(req, res, 'RECURRING_INVOICES');
      const interval = d.recurring.interval;
      const every = Number(d.recurring.every);
      if (!['week', 'month', 'year'].includes(interval)) fail(400, 'Bad recurring interval', 'BAD_RECURRING');
      if (!Number.isInteger(every) || every < 1 || every > 52) fail(400, 'Bad recurring interval length', 'BAD_RECURRING');
      if (d.recurring.endDate && !isIso(d.recurring.endDate)) fail(400, 'Bad recurring end date', 'BAD_RECURRING');
      if (f.schedule.length) fail(400, 'A recurring invoice cannot also have an installment schedule', 'BAD_RECURRING');
      const prev = existing?.recurring || {};
      f.recurring = clean({ interval, every, endDate: d.recurring.endDate || undefined, nextRun: prev.nextRun, anchor: prev.anchor, runCount: prev.runCount, templateOf: prev.templateOf });
      f.isTemplate = true;
    } else { f.recurring = null; f.isTemplate = false; if (existing?.recurringActive) f.recurringActive = false; }
    if (d.reminders && typeof d.reminders === 'object') {
      await requireFlag(req, res, 'REMINDERS');
      f.reminders = clean({ beforeDueDays: intList(d.reminders.beforeDueDays, 6) || [], afterDueDays: intList(d.reminders.afterDueDays, 6) || [], lastSentAt: existing?.reminders?.lastSentAt });
    } else f.reminders = null;
    return f;
  }

  async function saveInvoiceDoc(ent: Ent, uid: string, fields: Record<string, any>, existing?: Record<string, any>, id?: string) {
    const now = Date.now();
    const docId = id || `inv_${nodeCrypto.randomUUID().replace(/-/g, '')}`;
    const number = existing?.number || await nextNumber(ent.entityKey, 'INV');
    const base = existing ? {} : { id: docId, status: 'DRAFT', number, createdBy: uid, createdAt: now };
    const doc = clean({ ...base, ...fields, updatedAt: now, number });
    if (!(await deps.patch('billingInvoices', docId, doc))) fail(500, 'Could not save the invoice', 'SAVE_FAILED');
    return (await deps.read('billingInvoices', docId)) as Record<string, any>;
  }

  // ── Stripe customers / sales tax ───────────────────────────────────────────
  async function ensureStripeCustomer(acct: string, ent: Ent, c: Record<string, any>): Promise<string> {
    const a = c.address || {};
    const address = clean({ line1: str(a.line1, 200) || undefined, line2: str(a.line2, 200) || undefined, city: str(a.city, 100) || undefined, state: str(a.region, 100) || undefined, postal_code: str(a.postal, 20) || undefined, country: /^[A-Za-z]{2}$/.test(a.country || '') ? String(a.country).toUpperCase() : undefined });
    const params: any = clean({
      name: c.name || c.company || undefined, email: c.email || undefined, phone: c.phone || undefined,
      ...(Object.keys(address).length ? { address } : {}), tax_exempt: c.taxExempt ? 'exempt' : 'none',
      metadata: { plajahCustomerId: c.id, entityKey: ent.entityKey },
    });
    if (c.stripeCustomerId) {
      try { await stripe().customers.update(c.stripeCustomerId, params, opts(acct)); return c.stripeCustomerId; }
      catch (e: any) { if (e?.code !== 'resource_missing') throw e; }
    }
    const created = await stripe().customers.create(params, opts(acct));
    await deps.patch('billingCustomers', c.id, { stripeCustomerId: created.id });
    return created.id;
  }
  /** Automatic tax only when the SALES_TAX flag is on AND Stripe Tax is active on the connected account. Otherwise tax stays manual. */
  async function autoTaxOn(acct: string): Promise<boolean> {
    if (!(await flagsNow()).SALES_TAX) return false;
    return cached(`tax:${acct}`, 10 * 60_000, async () => { try { return (await stripe().tax.settings.retrieve({}, opts(acct)))?.status === 'active'; } catch { return false; } });
  }

  // ── Stripe → local mirror ──────────────────────────────────────────────────
  const mapStatus = (s: any): InvoiceStatus => {
    switch (s.status) {
      case 'draft': return 'DRAFT';
      case 'paid': return 'PAID';
      case 'void': return 'VOID';
      case 'uncollectible': return 'UNCOLLECTIBLE';
      default: return (s.amount_paid || 0) > 0 && (s.amount_remaining ?? 1) > 0 ? 'PARTIAL' : 'OPEN';
    }
  };
  const effectiveStatus = (inv: Record<string, any>): InvoiceStatus => {
    if ((inv.status === 'OPEN' || inv.status === 'PARTIAL') && inv.dueDate && inv.dueDate < todayIso()) return 'OVERDUE';
    return inv.status;
  };

  /** Fold one Stripe invoice into the local doc (mutates `inv`). Derived from Stripe state, so replays are no-ops. */
  function foldStripeInvoice(inv: Record<string, any>, s: any): void {
    const instIdx = inv.schedule?.length
      ? inv.schedule.findIndex((x: any) => x.stripeInvoiceId === s.id)
      : -1;
    const pis = new Set<string>(inv.paymentIntentIds || []);
    const pi = idOf(s.payment_intent); if (pi) pis.add(pi);
    inv.paymentIntentIds = [...pis];
    if (instIdx >= 0) {
      const x = inv.schedule[instIdx];
      x.hostedUrl = s.hosted_invoice_url || x.hostedUrl; x.pdfUrl = s.invoice_pdf || x.pdfUrl; x.stripeStatus = s.status;
      x.amountPaid = c2d(s.amount_paid); x.paid = s.status === 'paid';
      if (s.status_transitions?.paid_at) x.paidAt = s.status_transitions.paid_at * 1000;
      if (s.paid_out_of_band) x.paidOutOfBand = true;
      const all = inv.schedule as any[];
      const paidN = all.filter(y => y.paid).length;
      const voidN = all.filter(y => y.stripeStatus === 'void').length;
      inv.amountPaid = c2d(all.reduce((t, y) => t + d2c(y.amountPaid || 0), 0));
      inv.amountDue = c2d(Math.max(0, d2c(inv.total) - d2c(inv.amountPaid)));
      inv.status = paidN === all.length ? 'PAID' : voidN === all.length ? 'VOID' : paidN > 0 ? 'PARTIAL' : (all.some(y => y.stripeStatus === 'uncollectible') && paidN === 0 ? 'UNCOLLECTIBLE' : 'OPEN');
      const nextUnpaid = all.find(y => !y.paid && y.stripeStatus !== 'void');
      inv.hostedUrl = nextUnpaid?.hostedUrl || all[all.length - 1]?.hostedUrl || inv.hostedUrl;
      inv.pdfUrl = nextUnpaid?.pdfUrl || inv.pdfUrl;
      if (inv.status === 'PAID') inv.paidAt = Math.max(...all.map(y => y.paidAt || 0)) || Date.now();
      return;
    }
    inv.status = mapStatus(s);
    inv.stripeStatus = s.status;
    inv.hostedUrl = s.hosted_invoice_url || inv.hostedUrl; inv.pdfUrl = s.invoice_pdf || inv.pdfUrl;
    inv.amountPaid = c2d(s.amount_paid); inv.amountDue = c2d(s.amount_remaining ?? s.amount_due);
    if (s.total != null && d2c(inv.total) !== s.total && inv.status !== 'DRAFT') { inv.total = c2d(s.total); inv.tax = c2d(s.tax || 0); }   // automatic tax changed the total
    if (s.status_transitions?.paid_at) inv.paidAt = s.status_transitions.paid_at * 1000;
    if (s.paid_out_of_band) inv.paidOutOfBand = true;
    if (s.status === 'open' && s.status_transitions?.finalized_at && !inv.sentAt) inv.sentAt = s.status_transitions.finalized_at * 1000;
  }

  /** Org books (flag ACCOUNTING_SYNC): AR on issue, payment clears AR, void reverses. Idempotent by deterministic keys. Never throws. */
  async function accountingHooks(ent: Ent, inv: Record<string, any>, s?: any): Promise<void> {
    if (ent.kind !== 'ORG' || !(await flagsNow()).ACCOUNTING_SYNC) return;
    try {
      const orgId = ent.id;
      const customer = inv.customerName;
      if (inv.status !== 'DRAFT' && inv.sentAt) {
        const date = inv.issueDate || new Date(inv.sentAt).toISOString().slice(0, 10);
        if (inv.status !== 'VOID' || !s) await deps.autoPost(orgId, sys => invoiceIssuedEntry(sys, { id: inv.id, date, amount: inv.total, number: inv.number, customer }));
      }
      const stripeInvoices = s ? [s] : [];
      for (const si of stripeInvoices) {
        if ((si.amount_paid || 0) > 0) {
          const paidAt = si.status_transitions?.paid_at ? new Date(si.status_transitions.paid_at * 1000).toISOString().slice(0, 10) : todayIso();
          await deps.autoPost(orgId, sys => invoicePaymentEntry(sys, { id: si.id, date: paidAt, amount: c2d(si.amount_paid), number: inv.number, customer, outOfBand: !!(si.paid_out_of_band || inv.paidOutOfBand) }));
        }
      }
      if (inv.status === 'VOID' && (inv.amountPaid || 0) === 0) {
        const j = await deps.read('acctJournals', journalDocId(orgId, `inv:${inv.id}`));
        if (j) await deps.postJournal(orgId, reversalOf({ id: j.id || journalDocId(orgId, `inv:${inv.id}`), date: todayIso(), memo: j.memo || `Invoice ${inv.number}`, lines: j.lines || [] } as any, todayIso()));
      }
    } catch (e: any) { console.error('[Billing] accounting hook failed:', e?.message); }
  }

  async function persistFold(ent: Ent, before: Record<string, any>, inv: Record<string, any>, s?: any) {
    const patch: Record<string, any> = { status: inv.status, amountPaid: inv.amountPaid, amountDue: inv.amountDue, hostedUrl: inv.hostedUrl || null, pdfUrl: inv.pdfUrl || null, paymentIntentIds: inv.paymentIntentIds || [], stripeStatus: inv.stripeStatus || null, updatedAt: Date.now() };
    if (inv.schedule?.length) patch.schedule = inv.schedule;
    if (inv.paidAt) patch.paidAt = inv.paidAt;
    if (inv.paidOutOfBand) patch.paidOutOfBand = true;
    if (inv.sentAt) patch.sentAt = inv.sentAt;
    if (inv.total !== before.total) { patch.total = inv.total; patch.tax = inv.tax; }
    await deps.patch('billingInvoices', inv.id, clean(patch));
    await accountingHooks(ent, inv, s);
    if (before.status !== 'PAID' && inv.status === 'PAID') {
      await notifyUser(ent.ownerUid, `Invoice ${inv.number} paid`, `${inv.customerName} paid ${(inv.total).toFixed(2)} ${String(inv.currency).toUpperCase()}.`, inv.id, 'Plajah Billing');
    }
  }

  async function syncInvoice(ent: Ent, id: string): Promise<Record<string, any>> {
    const inv = (await deps.read('billingInvoices', id)) as Record<string, any> | null;
    if (!inv || inv.entityKey !== ent.entityKey) return fail(404, 'Invoice not found', 'NOT_FOUND');
    const ids: string[] = inv.schedule?.length ? inv.schedule.map((x: any) => x.stripeInvoiceId).filter(Boolean) : (inv.stripeInvoiceId ? [inv.stripeInvoiceId] : []);
    if (!ids.length || inv.status === 'DRAFT') return inv;
    const { id: acct } = await billingAccount(ent);
    const before = JSON.parse(JSON.stringify(inv));
    for (const sid of ids) {
      const s = await stripe().invoices.retrieve(sid, {}, opts(acct));
      foldStripeInvoice(inv, s);
      await accountingHooks(ent, { ...inv }, s).catch(() => {});
    }
    await persistFold(ent, before, inv);
    return { ...inv, displayStatus: effectiveStatus(inv) };
  }

  // ── send ───────────────────────────────────────────────────────────────────
  async function stripeCleanupInvoice(acct: string, sid: string) {
    try { const s = await stripe().invoices.retrieve(sid, {}, opts(acct)); if (s.status === 'draft') await stripe().invoices.del(sid, {}, opts(acct)); else if (s.status === 'open') await stripe().invoices.voidInvoice(sid, {}, opts(acct)); } catch { /* best effort */ }
  }
  const stripeLineParams = (customer: string, invoice: string, currency: string, l: { description: string; quantity: number; unitAmount: number }) => {
    const unitC = d2c(l.unitAmount);
    if (Number.isInteger(l.quantity)) return { customer, invoice, currency, description: l.description, quantity: l.quantity, unit_amount: unitC };
    return { customer, invoice, currency, description: `${l.description} (${l.quantity} x ${l.unitAmount.toFixed(2)})`, amount: d2c(l.quantity * l.unitAmount) };
  };

  async function sendInvoiceCore(ent: Ent, invId: string, o: { emailNow?: boolean } = {}): Promise<Record<string, any>> {
    const inv = (await deps.read('billingInvoices', invId)) as Record<string, any> | null;
    if (!inv || inv.entityKey !== ent.entityKey) return fail(404, 'Invoice not found', 'NOT_FOUND');
    if (inv.status !== 'DRAFT') return fail(409, 'This invoice was already sent', 'ALREADY_SENT');
    const lines = normLines(inv.lines);
    const t = computeTotals(lines, inv.discount, inv.tax, inv.taxRatePct ?? undefined);
    if (t.totalC < 50) return fail(400, 'Invoice total must be at least 0.50', 'MIN_AMOUNT');
    const cust = await customerOf(ent, inv.customerId);
    const { id: acct, account } = await billingAccount(ent, true);
    if (!account.charges_enabled) return fail(409, 'Finish Stripe onboarding before sending invoices', 'NOT_READY', { requirementsDue: account.requirements?.currently_due || [] });
    const customer = await ensureStripeCustomer(acct, ent, cust);
    const s = stripe();
    const pct = appFeePct();
    const number: string = inv.number;
    const currency: string = inv.currency || 'usd';
    const baseMeta = { plajahInvoiceId: inv.id, entityKey: ent.entityKey, number };
    const sched: any[] = Array.isArray(inv.schedule) ? inv.schedule : [];
    const today = todayIso();
    const sendEmail = !!cust.email && o.emailNow !== false;
    const created: string[] = [];
    const now = Date.now();
    try {
      if (inv.stripeInvoiceId) await stripeCleanupInvoice(acct, inv.stripeInvoiceId);   // leftover from an interrupted earlier attempt
      if (!sched.length) {
        const wantAuto = await autoTaxOn(acct);
        const mk = async (auto: boolean) => {
          const params: any = clean({
            customer, collection_method: 'send_invoice', days_until_due: Math.max(1, daysBetween(today, inv.dueDate)), auto_advance: false,
            pending_invoice_items_behavior: 'exclude', currency, description: inv.memo || undefined, footer: inv.footer || undefined,
            metadata: baseMeta, custom_fields: [{ name: 'Reference', value: String(inv.poNumber ? `${number} / PO ${inv.poNumber}` : number).slice(0, 30) }],
            ...(auto ? { automatic_tax: { enabled: true } } : {}),
            ...(pct > 0 ? { application_fee_amount: Math.round(t.totalC * pct / 100) } : {}),
          });
          const si = await s.invoices.create(params, opts(acct));
          created.push(si.id);
          for (const l of lines) await s.invoiceItems.create(stripeLineParams(customer, si.id, currency, l), opts(acct));
          if (t.discountC > 0) await s.invoiceItems.create({ customer, invoice: si.id, currency, amount: -t.discountC, description: 'Discount' }, opts(acct));
          if (!auto && t.taxC > 0) await s.invoiceItems.create({ customer, invoice: si.id, currency, amount: t.taxC, description: inv.taxRatePct ? `Tax (${inv.taxRatePct}%)` : 'Tax' }, opts(acct));
          return si;
        };
        let si: any;
        try { si = await mk(wantAuto); } catch (e: any) {
          if (!wantAuto) throw e;
          for (const id of created.splice(0)) await stripeCleanupInvoice(acct, id);
          si = await mk(false);   // automatic tax refused (e.g. no customer address) → fall back to manual tax silently
        }
        let fin = await s.invoices.finalizeInvoice(si.id, { auto_advance: false }, opts(acct));
        if (sendEmail) fin = await s.invoices.sendInvoice(si.id, {}, opts(acct));
        foldStripeInvoice(inv, fin);
        inv.stripeInvoiceId = fin.id; inv.stripeInvoiceIds = [fin.id];
        inv.status = mapStatus(fin);
      } else {
        // Deposits / milestones: ONE Stripe invoice per installment (each has its own due date, hosted page,
        // email, receipt and payment). The local invoice is the parent that rolls them up.
        if (sched.reduce((x, y) => x + d2c(y.amount), 0) !== t.totalC) fail(400, 'Installments must add up to the invoice total', 'SCHEDULE_MISMATCH');
        const ids: string[] = [];
        for (let i = 0; i < sched.length; i++) {
          const x = sched[i];
          const amountC = d2c(x.amount);
          const si = await s.invoices.create(clean({
            customer, collection_method: 'send_invoice', days_until_due: Math.max(1, daysBetween(today, x.dueDate)), auto_advance: false,
            pending_invoice_items_behavior: 'exclude', currency, description: inv.memo || undefined, footer: inv.footer || undefined,
            metadata: { ...baseMeta, installment: String(i) }, custom_fields: [{ name: 'Reference', value: `${number} (${i + 1}/${sched.length})`.slice(0, 30) }],
            ...(pct > 0 ? { application_fee_amount: Math.round(amountC * pct / 100) } : {}),
          }), opts(acct));
          created.push(si.id);
          await s.invoiceItems.create({ customer, invoice: si.id, currency, amount: amountC, description: `${number} - ${x.label}` }, opts(acct));
          let fin = await s.invoices.finalizeInvoice(si.id, { auto_advance: false }, opts(acct));
          const soon = i === 0 || daysBetween(today, x.dueDate) <= 7;   // later installments are emailed by the sweep when they come due
          if (sendEmail && soon) { fin = await s.invoices.sendInvoice(si.id, {}, opts(acct)); x.sentAt = now; }
          x.stripeInvoiceId = fin.id; x.hostedUrl = fin.hosted_invoice_url; x.pdfUrl = fin.invoice_pdf; x.stripeStatus = fin.status; x.paid = false; x.amountPaid = 0;
          ids.push(fin.id);
        }
        inv.schedule = sched; inv.stripeInvoiceId = ids[0]; inv.stripeInvoiceIds = ids;
        inv.hostedUrl = sched[0].hostedUrl; inv.pdfUrl = sched[0].pdfUrl; inv.status = 'OPEN'; inv.amountPaid = 0; inv.amountDue = c2d(t.totalC);
      }
    } catch (e: any) {
      for (const id of created) await stripeCleanupInvoice(acct, id);
      throw e;
    }
    inv.sentAt = now; inv.emailed = sendEmail;
    const patch = clean({
      status: inv.status, stripeInvoiceId: inv.stripeInvoiceId, stripeInvoiceIds: inv.stripeInvoiceIds, hostedUrl: inv.hostedUrl, pdfUrl: inv.pdfUrl, stripeStatus: inv.stripeStatus || null,
      sentAt: now, emailed: sendEmail, schedule: inv.schedule || [], paymentIntentIds: inv.paymentIntentIds || [],
      subtotal: c2d(t.subtotalC), discount: c2d(t.discountC), tax: inv.tax ?? c2d(t.taxC), total: inv.total ?? c2d(t.totalC), amountPaid: inv.amountPaid ?? 0, amountDue: inv.amountDue ?? c2d(t.totalC),
      paidAt: inv.paidAt || null, updatedAt: now,
    });
    await deps.patch('billingInvoices', inv.id, patch);
    const out = { ...inv, ...patch };
    await accountingHooks(ent, out, undefined);
    if (inv.customerUid) await notifyUser(inv.customerUid, `New invoice ${number} from ${ent.name}`, `${(out.total as number).toFixed(2)} ${currency.toUpperCase()} due ${inv.dueDate}.`, inv.id, ent.name);
    return out;
  }

  // ── sweeps: no-webhook sync, installment emails, reminders, recurring ───────
  let sweeping = false;
  async function sweep(scopeEntityKey?: string): Promise<Record<string, number>> {
    const out = { synced: 0, installmentsSent: 0, reminders: 0, recurring: 0, errors: 0 };
    if (sweeping) return { ...out, errors: -1 };
    sweeping = true;
    try {
      const flags = await flagsNow();
      if (!flags.INVOICES) return out;
      const entCache = new Map<string, Ent | null>();
      const entOf = async (inv: Record<string, any>) => {
        const k = inv.entityKey as string;
        if (!entCache.has(k)) entCache.set(k, inv.entity?.kind ? await loadEntity(inv.entity) : null);
        return entCache.get(k) || null;
      };
      const today = todayIso();
      const open: Array<{ id: string; data: Record<string, any> }> = [];
      for (const status of ['OPEN', 'PARTIAL']) {
        const f: any[] = [{ field: 'status', op: 'EQUAL', value: status }];
        if (scopeEntityKey) f.push({ field: 'entityKey', op: 'EQUAL', value: scopeEntityKey });
        open.push(...await deps.query('billingInvoices', f, 300));
      }
      for (const row of open) {
        try {
          const ent = await entOf(row.data); if (!ent?.stripeAccountId) continue;
          let inv: Record<string, any> = { ...row.data, id: row.id };
          if (inv.stripeInvoiceId) { inv = await syncInvoice(ent, row.id); out.synced++; }
          if (inv.status !== 'OPEN' && inv.status !== 'PARTIAL') continue;
          const { id: acct } = await billingAccount(ent);
          // later installments: email once they are within a week of due
          if (flags.INSTALLMENTS && inv.schedule?.length) {
            let changed = false;
            for (const x of inv.schedule) {
              if (x.stripeInvoiceId && !x.sentAt && !x.paid && daysBetween(today, x.dueDate) <= 7 && inv.customerEmail) {
                await stripe().invoices.sendInvoice(x.stripeInvoiceId, {}, opts(acct)); x.sentAt = Date.now(); out.installmentsSent++; changed = true;
              }
            }
            if (changed) await deps.patch('billingInvoices', row.id, { schedule: inv.schedule });
          }
          // reminders
          if (flags.REMINDERS && inv.reminders && (inv.reminders.beforeDueDays?.length || inv.reminders.afterDueDays?.length)) {
            const target = inv.schedule?.length ? inv.schedule.findIndex((x: any) => !x.paid && x.stripeStatus !== 'void') : -1;
            const due: string = target >= 0 ? inv.schedule[target].dueDate : inv.dueDate;
            const sid: string | undefined = target >= 0 ? inv.schedule[target].stripeInvoiceId : inv.stripeInvoiceId;
            const d = daysBetween(today, due);
            const tag = d >= 0 ? (inv.reminders.beforeDueDays || []).includes(d) ? `b${d}` : '' : (inv.reminders.afterDueDays || []).includes(-d) ? `a${-d}` : '';
            const key = `${tag}:${target}`;
            const sent: string[] = Array.isArray(inv.remindersSent) ? inv.remindersSent : [];
            if (tag && sid && !sent.includes(key)) {
              if (inv.customerEmail) await stripe().invoices.sendInvoice(sid, {}, opts(acct));
              await notifyUser(inv.customerUid, d >= 0 ? `Invoice ${inv.number} is due ${d === 0 ? 'today' : `in ${d} day${d === 1 ? '' : 's'}`}` : `Invoice ${inv.number} is ${-d} day${-d === 1 ? '' : 's'} overdue`, `${ent.name} - ${inv.amountDue?.toFixed?.(2) ?? ''} ${String(inv.currency).toUpperCase()}`, row.id, ent.name);
              await deps.patch('billingInvoices', row.id, { remindersSent: [...sent, key], reminders: { ...inv.reminders, lastSentAt: Date.now() } });
              out.reminders++;
            }
          }
        } catch (e: any) { out.errors++; console.error('[Billing] sweep invoice failed:', row.id, e?.message); }
      }
      if (flags.RECURRING_INVOICES) {
        const f: any[] = [{ field: 'recurringActive', op: 'EQUAL', value: true }];
        if (scopeEntityKey) f.push({ field: 'entityKey', op: 'EQUAL', value: scopeEntityKey });
        for (const row of await deps.query('billingInvoices', f, 300)) {
          try { if (await runTemplate(row.id, row.data, today)) out.recurring++; } catch (e: any) { out.errors++; console.error('[Billing] recurring failed:', row.id, e?.message); }
        }
      }
      return out;
    } finally { sweeping = false; }
  }

  /** Generate (and send) the next child of an active recurring template if it is due. Returns true when one was created. */
  async function runTemplate(id: string, t: Record<string, any>, today: string, force = false): Promise<boolean> {
    const rec = t.recurring;
    if (!rec || !t.recurringActive) return false;
    if (rec.endDate && rec.nextRun > rec.endDate) { await deps.patch('billingInvoices', id, { recurringActive: false, updatedAt: Date.now() }); return false; }
    if (!force && rec.nextRun > today) return false;
    const ent = await loadEntity(t.entity);
    if (!ent) return false;
    const gap = Math.max(1, daysBetween(t.issueDate, t.dueDate));
    const fields = clean({
      entityKey: t.entityKey, entity: t.entity, customerId: t.customerId, customerName: t.customerName, customerEmail: t.customerEmail || '', customerUid: t.customerUid || '',
      lines: t.lines, subtotal: t.subtotal, discount: t.discount, tax: t.tax, total: t.total, amountPaid: 0, amountDue: t.total, currency: t.currency,
      issueDate: today, dueDate: addDays(today, gap), memo: t.memo || '', footer: t.footer || '', poNumber: t.poNumber || '', projectRef: t.projectRef || '',
      taxRatePct: t.taxRatePct ?? null, schedule: [], recurring: { interval: rec.interval, every: rec.every, templateOf: id }, isTemplate: false,
      reminders: t.reminders || null,
    });
    const childId = `inv_${nodeCrypto.randomUUID().replace(/-/g, '')}`;
    const child = await saveInvoiceDoc(ent, t.createdBy, fields, undefined, childId);
    // advance the schedule BEFORE sending so a send failure can never double-generate; the child stays a DRAFT to retry by hand
    let runCount = (rec.runCount || 0) + 1;
    const anchor = rec.anchor || rec.nextRun;
    let next = addPeriod(anchor, rec.interval, rec.every * runCount);
    // missed periods (server was down) are skipped, not back-billed in a burst
    while (!force && next <= today && next < '2100-01-01') { runCount++; next = addPeriod(anchor, rec.interval, rec.every * runCount); }
    await deps.patch('billingInvoices', id, { recurring: clean({ ...rec, anchor, runCount, nextRun: next, lastRunAt: Date.now() }), recurringActive: !(rec.endDate && next > rec.endDate), updatedAt: Date.now() });
    try { await sendInvoiceCore(ent, child.id); }
    catch (e: any) { await deps.patch('billingInvoices', child.id, { sendError: String(e?.message || e).slice(0, 300) }); console.error('[Billing] recurring child send failed:', e?.message); }
    return true;
  }

  // ── webhook mirror (called from /api/stripe/connect-webhook; dormant until the secret exists) ──
  const BILLING_EVENTS = new Set(['invoice.finalized', 'invoice.sent', 'invoice.paid', 'invoice.payment_failed', 'invoice.voided', 'invoice.marked_uncollectible', 'invoice.overdue', 'invoice.payment_succeeded', 'invoice.updated']);
  async function once(key: string): Promise<boolean> {
    const id = `ev_${safeId(key)}`;
    if (await deps.read('billingCounters', id)) return false;
    await deps.patch('billingCounters', id, { at: Date.now(), kind: 'EVENT' });
    return true;
  }
  /** Returns true when the event belonged to Plajah Billing (so the caller can skip org-only handling for it). */
  async function handleConnectEvent(event: any, acct: string): Promise<boolean> {
    try {
      const obj = event.data?.object;
      if (event.type === 'account.updated' && obj?.id) {
        for (const kind of ['USER', 'ORG', 'BUSINESS', 'PRODUCTION'] as BillingEntityKind[]) {
          const rows = await deps.query(COLL[kind], [{ field: ACCT_FIELD(kind), op: 'EQUAL', value: acct }], 1);
          if (rows[0]) { const ent = await loadEntity({ kind, id: rows[0].id }); if (ent) { memo.delete(`acct:${ent.entityKey}:${acct}`); await mirrorConnection(ent, obj); } }
        }
        return false;   // org branch in server.ts still handles its own state mirror
      }
      if (event.type === 'checkout.session.completed' && obj?.payment_link) {
        const rows = await deps.query('billingPaymentLinks', [{ field: 'stripePaymentLinkId', op: 'EQUAL', value: idOf(obj.payment_link)! }], 1);
        const pl = rows[0]; if (!pl) return false;
        if (obj.payment_status === 'paid' && await once(`pl_${obj.id}`)) {
          const cur = await deps.read('billingPaymentLinks', pl.id);
          await deps.patch('billingPaymentLinks', pl.id, { paidCount: (cur?.paidCount || 0) + 1, paidTotal: c2d(d2c(cur?.paidTotal || 0) + (obj.amount_total || 0)), lastPaidAt: Date.now() });
          const ent = await loadEntity(pl.data.entity);
          if (ent) await notifyUser(ent.ownerUid, `Payment received - ${pl.data.title}`, `${c2d(obj.amount_total || 0).toFixed(2)} ${String(obj.currency || 'usd').toUpperCase()}${obj.customer_details?.name ? ' from ' + obj.customer_details.name : ''}`, pl.id, 'Plajah Billing');
        }
        return true;
      }
      if (!BILLING_EVENTS.has(event.type) || !obj?.id) return false;
      let local: { id: string; data: Record<string, any> } | undefined;
      const pid = obj.metadata?.plajahInvoiceId;
      if (pid) { const d = await deps.read('billingInvoices', pid); if (d) local = { id: pid, data: d }; }
      if (!local) local = (await deps.query('billingInvoices', [{ field: 'stripeInvoiceIds', op: 'ARRAY_CONTAINS', value: obj.id }], 1))[0];
      if (!local) return false;   // not a Plajah Billing invoice (e.g. a church subscription invoice)
      const ent = await loadEntity(local.data.entity);
      if (!ent || ent.stripeAccountId !== acct) return true;   // account mismatch: ignore
      const s = await stripe().invoices.retrieve(obj.id, {}, opts(acct));   // fresh state → ordering-proof and idempotent
      const inv: Record<string, any> = { ...local.data, id: local.id };
      const before = JSON.parse(JSON.stringify(inv));
      foldStripeInvoice(inv, s);
      await persistFold(ent, before, inv, s);
      return true;
    } catch (e: any) { console.error('[Billing] connect event failed:', event?.type, e?.message); return false; }
  }

  const invoiceByPaymentIntent = async (pi: string): Promise<{ id: string; entityKey: string } | null> => {
    const r = await deps.query('billingInvoices', [{ field: 'paymentIntentIds', op: 'ARRAY_CONTAINS', value: pi }], 1);
    return r[0] ? { id: r[0].id, entityKey: r[0].data.entityKey } : null;
  };

  // ── routes ─────────────────────────────────────────────────────────────────
  const wrap = (fn: (req: any, res: any) => Promise<any>) => async (req: any, res: any) => {
    try { await fn(req, res); }
    catch (e: any) {
      if (res.headersSent) return;
      if (e instanceof BillingError) return res.status(e.status).json({ error: e.message, code: e.code, ...(e.extra || {}) });
      const stripeStatus = typeof e?.statusCode === 'number' && String(e?.type || '').startsWith('Stripe') ? e.statusCode : 0;
      console.error('[Billing]', req.method, req.path, e?.message);
      res.status(stripeStatus >= 400 && stripeStatus < 500 ? 400 : 500).json({ error: e?.message || 'Billing error', code: e?.code || 'ERROR' });
    }
  };
  const pre = (): any[] => [deps.authMiddleware, deps.requireRegisteredUser, express.json({ limit: '1mb' })];
  const publicLimiter = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests, try again shortly' } });
  const cronOk = (req: any) => {
    const provided = String(req.get?.('x-elevate-cron-key') || '');
    const expected = process.env.ELEVATE_CRON_KEY || '';
    if (!provided) return null;
    const a = Buffer.from(provided), b = Buffer.from(expected);
    return !!expected && a.length === b.length && nodeCrypto.timingSafeEqual(a, b);
  };

  /** The target doc id for an action: accepts `id` or the typed aliases the client sends. */
  const bid = (req: any): any => req.body?.id ?? req.body?.invoiceId ?? req.body?.estimateId ?? req.body?.linkId;
  async function invoiceFor(req: any, res: any, id: any, allowCustomer = false): Promise<{ inv: Record<string, any>; ent: Ent; asCustomer: boolean }> {
    const inv = (await deps.read('billingInvoices', str(id, 200) || '_none_')) as Record<string, any> | null;
    if (!inv) return fail(404, 'Invoice not found', 'NOT_FOUND');
    inv.id = str(id, 200);
    if (allowCustomer && inv.customerUid && inv.customerUid === req.uid && inv.status !== 'DRAFT') {
      const ent = await loadEntity(inv.entity);
      if (!ent) return fail(404, 'Invoice not found', 'NOT_FOUND');
      return { inv, ent, asCustomer: true };
    }
    return { inv, ent: await entityFor(req, res, inv.entity), asCustomer: false };
  }

  function register(app: any) {
    // ---- connect ----
    app.post('/api/billing/connect/start', ...pre(), wrap(async (req, res) => {
      await requireFlag(req, res, ALL_FLAGS);
      const ent = await entityFor(req, res, req.body?.entity);
      const s = stripe();
      let acct = ent.stripeAccountId;
      let account: any;
      if (!acct) {
        const bt = ent.kind === 'USER' ? 'individual' : ent.kind === 'ORG' ? (['CHURCH', 'NONPROFIT', 'RELIGIOUS', 'CULTURAL'].includes(ent.doc.orgType) ? 'non_profit' : (['BUSINESS', 'LABEL'].includes(ent.doc.orgType) ? 'company' : undefined)) : 'company';
        const capabilities: any = { card_payments: { requested: true }, transfers: { requested: true } };
        if (process.env.BILLING_ACH === '1') capabilities.us_bank_account_ach_payments = { requested: true };
        account = await s.accounts.create(clean({
          type: 'express', business_type: bt, capabilities,
          ...(ent.kind !== 'USER' ? { business_profile: { name: ent.name } } : {}),
          metadata: { entityKey: ent.entityKey, ownerUid: ent.ownerUid, startedBy: req.uid, uid: ent.ownerUid, plajah: 'billing' },
        }));
        acct = account.id as string;
        const ok = await deps.patch(COLL[ent.kind], ent.id, { [ACCT_FIELD(ent.kind)]: acct, updatedAt: Date.now() });
        if (!ok) fail(500, 'Could not store the Stripe account', 'SAVE_FAILED');
        ent.stripeAccountId = acct;
        memo.set(`acct:${ent.entityKey}:${acct}`, { v: account, exp: Date.now() + 60_000 });
      } else account = (await billingAccount(ent, true)).account;
      const origin = deps.trustedRequestOrigin(req);
      const q = `billing=connected&entity=${encodeURIComponent(ent.entityKey)}`;
      if (account.details_submitted && account.charges_enabled && !(account.requirements?.currently_due || []).length) {
        const login = await s.accounts.createLoginLink(acct);
        return res.json({ connected: true, accountId: acct, url: login.url, connection: await mirrorConnection(ent, account) });
      }
      const link = await s.accountLinks.create({ account: acct, type: 'account_onboarding', return_url: `${origin}/?${q}`, refresh_url: `${origin}/?billing=refresh&entity=${encodeURIComponent(ent.entityKey)}` });
      res.json({ connected: false, accountId: acct, url: link.url });
    }));

    app.get('/api/billing/status', deps.authMiddleware, deps.requireRegisteredUser, wrap(async (req, res) => {
      await requireFlag(req, res, ALL_FLAGS);
      const ent = await entityFor(req, res, { kind: req.query.kind, id: req.query.id });
      if (!ent.stripeAccountId) return res.json({ entity: { kind: ent.kind, id: ent.id }, connected: false });
      const { account } = await billingAccount(ent, true);
      res.json({ connected: true, ...(await mirrorConnection(ent, account)) });
    }));

    app.post('/api/billing/connect/link', ...pre(), wrap(async (req, res) => {
      await requireFlag(req, res, ALL_FLAGS);
      const ent = await entityFor(req, res, req.body?.entity);
      const { id } = await billingAccount(ent);
      res.json({ url: (await stripe().accounts.createLoginLink(id)).url });
    }));

    // ---- invoices ----
    app.post('/api/billing/invoices/save', ...pre(), wrap(async (req, res) => {
      await requireFlag(req, res, 'INVOICES');
      const ent = await entityFor(req, res, req.body?.entity);
      const d = req.body?.invoice || {};
      let existing: Record<string, any> | undefined;
      if (d.id) {
        const e = await deps.read('billingInvoices', str(d.id, 200));
        if (!e || e.entityKey !== ent.entityKey) fail(404, 'Invoice not found', 'NOT_FOUND');
        if (e!.status !== 'DRAFT') fail(409, 'Only drafts can be edited — void it or duplicate it', 'NOT_DRAFT');
        existing = e!;
      }
      const fields = await buildInvoiceFields(req, res, ent, d, existing);
      const saved = await saveInvoiceDoc(ent, req.uid, fields, existing, existing ? str(d.id, 200) : undefined);
      res.json({ invoice: saved });
    }));

    app.post('/api/billing/invoices/send', ...pre(), wrap(async (req, res) => {
      await requireFlag(req, res, 'INVOICES');
      const { inv, ent } = await invoiceFor(req, res, bid(req));
      if (inv.recurring && inv.isTemplate) {
        // Activate the recurring series: this doc is the TEMPLATE; the first child is generated + sent now.
        await requireFlag(req, res, 'RECURRING_INVOICES');
        if (inv.status !== 'DRAFT') fail(409, 'This recurring invoice is already active', 'ALREADY_SENT');
        const today = todayIso();
        const start = inv.issueDate && inv.issueDate > today ? inv.issueDate : today;
        const rec = { ...inv.recurring, anchor: start, nextRun: start, runCount: 0 };
        await deps.patch('billingInvoices', inv.id, { recurring: clean(rec), recurringActive: true, sentAt: Date.now(), updatedAt: Date.now() });
        const t = { ...inv, recurring: rec, recurringActive: true };
        await runTemplate(inv.id, t, today);
        return res.json({ template: await deps.read('billingInvoices', inv.id), activated: true });
      }
      res.json({ invoice: await sendInvoiceCore(ent, inv.id) });
    }));

    app.post('/api/billing/invoices/void', ...pre(), wrap(async (req, res) => {
      await requireFlag(req, res, 'INVOICES');
      const { inv, ent } = await invoiceFor(req, res, bid(req));
      if (inv.status === 'VOID') return res.json({ invoice: inv });
      if (inv.isTemplate) { await deps.patch('billingInvoices', inv.id, { status: 'VOID', recurringActive: false, updatedAt: Date.now() }); return res.json({ invoice: await deps.read('billingInvoices', inv.id) }); }
      if (inv.status === 'PAID' || (inv.amountPaid || 0) > 0) fail(409, 'A paid invoice cannot be voided — refund it from your Stripe dashboard', 'PAID');
      if (inv.status !== 'DRAFT') {
        const { id: acct } = await billingAccount(ent);
        const ids: string[] = inv.stripeInvoiceIds || (inv.stripeInvoiceId ? [inv.stripeInvoiceId] : []);
        for (const sid of ids) { try { const s = await stripe().invoices.retrieve(sid, {}, opts(acct)); if (s.status === 'open') await stripe().invoices.voidInvoice(sid, {}, opts(acct)); else if (s.status === 'draft') await stripe().invoices.del(sid, {}, opts(acct)); } catch (e: any) { if (e?.code !== 'resource_missing') throw e; } }
      } else if (inv.stripeInvoiceId) { const { id: acct } = await billingAccount(ent).catch(() => ({ id: '' })); if (acct) await stripeCleanupInvoice(acct, inv.stripeInvoiceId); }
      const next = { ...inv, status: 'VOID', amountDue: 0 };
      await deps.patch('billingInvoices', inv.id, { status: 'VOID', amountDue: 0, voidedAt: Date.now(), updatedAt: Date.now() });
      await accountingHooks(ent, next, {});
      res.json({ invoice: next });
    }));

    app.post('/api/billing/invoices/mark-paid', ...pre(), wrap(async (req, res) => {
      await requireFlag(req, res, 'INVOICES');
      const { inv, ent } = await invoiceFor(req, res, bid(req));
      if (!['OPEN', 'PARTIAL'].includes(inv.status)) fail(409, 'Only open invoices can be marked paid', 'BAD_STATE');
      const { id: acct } = await billingAccount(ent);
      const ids: string[] = inv.schedule?.length
        ? inv.schedule.filter((x: any, i: number) => !x.paid && x.stripeInvoiceId && (req.body?.installment === undefined || Number(req.body.installment) === i)).map((x: any) => x.stripeInvoiceId)
        : [inv.stripeInvoiceId];
      if (!ids.length || !ids[0]) fail(400, 'Nothing to mark paid', 'BAD_STATE');
      inv.paidOutOfBand = true;
      const reason = str(req.body?.reason, 300);
      await deps.patch('billingInvoices', inv.id, clean({ paidOutOfBand: true, offlinePayment: { reason: reason || undefined, markedBy: req.uid, at: Date.now() } }));
      for (const sid of ids) await stripe().invoices.pay(sid, { paid_out_of_band: true }, opts(acct));
      res.json({ invoice: await syncInvoice(ent, inv.id) });
    }));

    app.post('/api/billing/invoices/remind', ...pre(), wrap(async (req, res) => {
      await requireFlag(req, res, 'INVOICES');
      const { inv, ent } = await invoiceFor(req, res, bid(req));
      if (!['OPEN', 'PARTIAL'].includes(inv.status)) fail(409, 'Only open invoices can be reminded', 'BAD_STATE');
      if (inv.lastRemindedAt && Date.now() - inv.lastRemindedAt < 10 * 60_000) fail(429, 'A reminder was just sent', 'TOO_SOON');
      const { id: acct } = await billingAccount(ent);
      const target = inv.schedule?.length ? inv.schedule.find((x: any) => !x.paid && x.stripeInvoiceId)?.stripeInvoiceId : inv.stripeInvoiceId;
      if (!target) fail(400, 'Nothing to remind', 'BAD_STATE');
      let emailed = false;
      if (inv.customerEmail) { await stripe().invoices.sendInvoice(target, {}, opts(acct)); emailed = true; }
      await notifyUser(inv.customerUid, `Reminder: invoice ${inv.number}`, `${ent.name} - ${Number(inv.amountDue || inv.total).toFixed(2)} ${String(inv.currency).toUpperCase()}, due ${inv.dueDate}`, inv.id, ent.name);
      await deps.patch('billingInvoices', inv.id, { lastRemindedAt: Date.now() });
      res.json({ ok: true, emailed });
    }));

    app.post('/api/billing/invoices/duplicate', ...pre(), wrap(async (req, res) => {
      await requireFlag(req, res, 'INVOICES');
      const { inv, ent } = await invoiceFor(req, res, bid(req));
      const today = todayIso();
      const gap = Math.max(0, daysBetween(inv.issueDate || today, inv.dueDate || today)) || 14;
      const draft = { ...inv, issueDate: today, dueDate: addDays(today, gap), schedule: [], recurring: inv.recurring && inv.isTemplate ? { interval: inv.recurring.interval, every: inv.recurring.every, endDate: inv.recurring.endDate } : undefined, reminders: inv.reminders };
      const fields = await buildInvoiceFields(req, res, ent, draft);
      res.json({ invoice: await saveInvoiceDoc(ent, req.uid, fields) });
    }));

    app.post('/api/billing/invoices/sync', ...pre(), wrap(async (req, res) => {
      await requireFlag(req, res, 'INVOICES');
      if (bid(req)) { const { inv, ent } = await invoiceFor(req, res, bid(req)); return res.json({ invoice: await syncInvoice(ent, inv.id) }); }
      const ent = await entityFor(req, res, req.body?.entity);
      const rows: Array<{ id: string; data: Record<string, any> }> = [];
      for (const status of ['OPEN', 'PARTIAL']) rows.push(...await deps.query('billingInvoices', [{ field: 'entityKey', op: 'EQUAL', value: ent.entityKey }, { field: 'status', op: 'EQUAL', value: status }], 100));
      const updated: any[] = []; let errors = 0;
      for (const r of rows) { try { updated.push(await syncInvoice(ent, r.id)); } catch (e: any) { errors++; console.error('[Billing] sync failed:', r.id, e?.message); } }
      res.json({ synced: updated.length, errors, invoices: updated });
    }));

    app.get('/api/billing/invoices/pdf', deps.authMiddleware, deps.requireRegisteredUser, wrap(async (req, res) => {
      await requireFlag(req, res, 'INVOICES');
      const { inv, ent } = await invoiceFor(req, res, req.query.invoiceId ?? req.query.id, true);
      if (inv.status === 'DRAFT') fail(409, 'Send the invoice first — drafts have no PDF yet', 'DRAFT');
      const { id: acct } = await billingAccount(ent);
      const idx = req.query.i !== undefined ? Number(req.query.i) : -1;
      const sid: string | undefined = inv.schedule?.length ? inv.schedule[idx >= 0 ? idx : 0]?.stripeInvoiceId : inv.stripeInvoiceId;
      if (!sid) fail(404, 'No PDF available', 'NOT_FOUND');
      const s = await stripe().invoices.retrieve(sid!, {}, opts(acct));
      if (!s.invoice_pdf) fail(404, 'No PDF available', 'NOT_FOUND');
      const u = new URL(s.invoice_pdf);
      if (!/(^|\.)stripe\.com$/.test(u.hostname)) fail(502, 'Unexpected PDF host', 'BAD_PDF');
      const r = await fetch(u.toString());
      if (!r.ok) fail(502, 'Could not fetch the PDF', 'BAD_PDF');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${safeId(inv.number || 'invoice')}.pdf"`);
      res.send(Buffer.from(await r.arrayBuffer()));
    }));

    // ---- estimates ----
    const estimateFields = async (req: any, res: any, ent: Ent, d: any, existing?: Record<string, any>) => {
      const cust = await customerOf(ent, d.customerId);
      const lines = normLines(d.lines);
      const discount = Number(d.discount || 0), tax = Number(d.tax || 0);
      const taxRatePct = d.taxRatePct !== undefined && d.taxRatePct !== null && d.taxRatePct !== '' ? Number(d.taxRatePct) : undefined;
      if (!Number.isFinite(discount) || discount < 0 || !Number.isFinite(tax) || tax < 0 || (taxRatePct !== undefined && (!Number.isFinite(taxRatePct) || taxRatePct < 0 || taxRatePct > 50))) fail(400, 'Bad amount', 'BAD_AMOUNT');
      if (d.validUntil && !isIso(d.validUntil)) fail(400, 'Bad valid-until date', 'BAD_DATE');
      const t = computeTotals(lines, discount, tax, taxRatePct);
      return clean({
        entityKey: ent.entityKey, entity: { kind: ent.kind, id: ent.id }, entityName: ent.name, ownerUid: ent.ownerUid,
        customerId: cust.id, customerName: cust.name || cust.company || 'Customer', customerEmail: cust.email || '', customerUid: cust.plajahUid || '',
        lines, subtotal: c2d(t.subtotalC), discount: c2d(t.discountC), tax: c2d(t.taxC), total: c2d(t.totalC), taxRatePct: taxRatePct ?? null,
        currency: /^[a-zA-Z]{3}$/.test(String(d.currency || '')) ? String(d.currency).toLowerCase() : 'usd',
        validUntil: d.validUntil || '', memo: str(d.memo, 2000), updatedAt: Date.now(),
      });
    };
    const estimateFor = async (req: any, res: any, id: any) => {
      const est = (await deps.read('billingEstimates', str(id, 200) || '_none_')) as Record<string, any> | null;
      if (!est) return fail(404, 'Estimate not found', 'NOT_FOUND');
      est.id = str(id, 200);
      return { est, ent: await entityFor(req, res, est.entity) };
    };

    app.post('/api/billing/estimates/save', ...pre(), wrap(async (req, res) => {
      await requireFlag(req, res, 'ESTIMATES');
      const ent = await entityFor(req, res, req.body?.entity);
      const d = req.body?.estimate || {};
      let existing: Record<string, any> | undefined;
      if (d.id) {
        const e = await deps.read('billingEstimates', str(d.id, 200));
        if (!e || e.entityKey !== ent.entityKey) fail(404, 'Estimate not found', 'NOT_FOUND');
        if (e!.status !== 'DRAFT') fail(409, 'Only draft estimates can be edited', 'NOT_DRAFT');
        existing = e!;
      }
      const fields = await estimateFields(req, res, ent, d, existing);
      const id = existing ? str(d.id, 200) : `est_${nodeCrypto.randomUUID().replace(/-/g, '')}`;
      const number = existing?.number || await nextNumber(ent.entityKey, 'EST');
      await deps.patch('billingEstimates', id, clean({ ...(existing ? {} : { id, status: 'DRAFT', createdBy: req.uid, createdAt: Date.now() }), ...fields, number }));
      res.json({ estimate: await deps.read('billingEstimates', id) });
    }));

    app.post('/api/billing/estimates/send', ...pre(), wrap(async (req, res) => {
      await requireFlag(req, res, 'ESTIMATES');
      const { est, ent } = await estimateFor(req, res, bid(req));
      if (!['DRAFT', 'SENT'].includes(est.status)) fail(409, 'This estimate can no longer be sent', 'BAD_STATE');
      const token = est.acceptToken || nodeCrypto.randomBytes(24).toString('hex');
      const link = `${deps.trustedRequestOrigin(req)}/?estimate=${token}`;
      await deps.patch('billingEstimates', est.id, { status: 'SENT', acceptToken: token, sentAt: Date.now(), updatedAt: Date.now() });
      const html = `<p>${esc(ent.name)} sent you an estimate <b>${esc(est.number)}</b> for <b>${Number(est.total).toFixed(2)} ${esc(String(est.currency || 'usd').toUpperCase())}</b>.</p><p><a href="${link}">Review and respond</a></p>${est.validUntil ? `<p>Valid until ${esc(est.validUntil)}.</p>` : ''}`;
      const emailed = await emailVia(est.customerEmail, `Estimate ${est.number} from ${ent.name}`, html);
      await notifyUser(est.customerUid, `Estimate ${est.number} from ${ent.name}`, `${Number(est.total).toFixed(2)} ${String(est.currency || 'usd').toUpperCase()} - tap to review`, est.id, ent.name);
      res.json({ estimate: await deps.read('billingEstimates', est.id), link, emailed });
    }));

    app.get('/api/billing/estimates/public', publicLimiter, wrap(async (req, res) => {
      const flags = await flagsNow(); if (!flags.ESTIMATES) fail(403, 'Coming soon', 'COMING_SOON', { flag: 'ESTIMATES' });
      const e = await estimateByToken(req.query.token);
      res.json({ estimate: { number: e.data.number, entityName: e.data.entityName, customerName: e.data.customerName, lines: e.data.lines, subtotal: e.data.subtotal, discount: e.data.discount, tax: e.data.tax, total: e.data.total, currency: e.data.currency, validUntil: e.data.validUntil, memo: e.data.memo, status: e.data.status } });
    }));
    async function estimateByToken(token: any) {
      const t = String(token || '');
      if (!/^[a-f0-9]{48}$/.test(t)) return fail(404, 'Estimate not found', 'NOT_FOUND');
      const e = (await deps.query('billingEstimates', [{ field: 'acceptToken', op: 'EQUAL', value: t }], 1))[0];
      if (!e) return fail(404, 'Estimate not found', 'NOT_FOUND');
      return e;
    }
    app.post('/api/billing/estimates/respond', publicLimiter, express.json({ limit: '10kb' }), wrap(async (req, res) => {
      const flags = await flagsNow(); if (!flags.ESTIMATES) fail(403, 'Coming soon', 'COMING_SOON', { flag: 'ESTIMATES' });
      const decision = String(req.body?.decision || '').toUpperCase();
      if (!['ACCEPT', 'DECLINE'].includes(decision)) fail(400, 'decision must be ACCEPT or DECLINE', 'BAD_DECISION');
      const e = await estimateByToken(req.body?.token);
      if (e.data.status !== 'SENT') return res.status(409).json({ error: `This estimate is already ${String(e.data.status).toLowerCase()}`, code: 'BAD_STATE', status: e.data.status });
      if (e.data.validUntil && e.data.validUntil < todayIso()) { await deps.patch('billingEstimates', e.id, { status: 'EXPIRED', updatedAt: Date.now() }); return res.status(409).json({ error: 'This estimate has expired', code: 'EXPIRED', status: 'EXPIRED' }); }
      const status = decision === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED';
      await deps.patch('billingEstimates', e.id, { status, respondedAt: Date.now(), updatedAt: Date.now() });
      for (const uid of new Set([e.data.ownerUid, e.data.createdBy].filter(Boolean))) await notifyUser(uid as string, `Estimate ${e.data.number} ${status.toLowerCase()}`, `${e.data.customerName} ${status.toLowerCase()} your estimate (${Number(e.data.total).toFixed(2)} ${String(e.data.currency || 'usd').toUpperCase()}).`, e.id, 'Plajah Billing');
      res.json({ status });
    }));

    app.post('/api/billing/estimates/convert', ...pre(), wrap(async (req, res) => {
      await requireFlag(req, res, ['ESTIMATES']);
      await requireFlag(req, res, 'INVOICES');
      const { est, ent } = await estimateFor(req, res, bid(req));
      if (est.status === 'CONVERTED' && est.convertedInvoiceId) return res.json({ invoice: await deps.read('billingInvoices', est.convertedInvoiceId), alreadyConverted: true });
      if (!['ACCEPTED', 'SENT', 'DRAFT'].includes(est.status)) fail(409, `A ${String(est.status).toLowerCase()} estimate cannot be converted`, 'BAD_STATE');
      const today = todayIso();
      const fields = await buildInvoiceFields(req, res, ent, { customerId: est.customerId, lines: est.lines, discount: est.discount, tax: est.tax, taxRatePct: est.taxRatePct ?? undefined, currency: est.currency, issueDate: today, dueDate: addDays(today, 14), memo: est.memo, projectRef: `Estimate ${est.number}`, estimateId: est.id });
      const invoice = await saveInvoiceDoc(ent, req.uid, fields);
      await deps.patch('billingEstimates', est.id, { status: 'CONVERTED', convertedInvoiceId: invoice.id, updatedAt: Date.now() });
      res.json({ invoice });
    }));

    // ---- payment links ----
    app.post('/api/billing/payment-links/create', ...pre(), wrap(async (req, res) => {
      await requireFlag(req, res, 'PAYMENT_LINKS');
      const ent = await entityFor(req, res, req.body?.entity);
      const lk: any = { ...(req.body || {}), ...(req.body?.link || {}) };
      const title = str(lk.title, 120); if (!title) fail(400, 'Title required', 'BAD_TITLE');
      const description = str(lk.description, 500);
      const custom = !!lk.allowCustomAmount;
      const amount = lk.amount !== undefined && lk.amount !== null && lk.amount !== '' ? Number(lk.amount) : undefined;
      if (amount !== undefined && (!Number.isFinite(amount) || d2c(amount) < 50 || d2c(amount) > 99_999_999)) fail(400, 'Amount must be at least 0.50', 'BAD_AMOUNT');
      if (amount === undefined && !custom) fail(400, 'Set an amount or allow a custom amount', 'BAD_AMOUNT');
      const currency = /^[a-zA-Z]{3}$/.test(String(lk.currency || '')) ? String(lk.currency).toLowerCase() : 'usd';
      const { id: acct, account } = await billingAccount(ent, true);
      if (!account.charges_enabled) fail(409, 'Finish Stripe onboarding before creating payment links', 'NOT_READY');
      const s = stripe();
      const id = `pl_${nodeCrypto.randomUUID().replace(/-/g, '')}`;
      const product = await s.products.create(clean({ name: title, description: description || undefined, metadata: { plajahPaymentLinkId: id, entityKey: ent.entityKey } }), opts(acct));
      const price = await s.prices.create(clean({
        product: product.id, currency,
        ...(custom ? { custom_unit_amount: { enabled: true, minimum: 50, ...(amount !== undefined ? { preset: d2c(amount) } : {}) } } : { unit_amount: d2c(amount!) }),
      }), opts(acct));
      const pct = appFeePct();
      let link: any;
      try {
        link = await s.paymentLinks.create(clean({ line_items: [{ price: price.id, quantity: 1 }], metadata: { plajahPaymentLinkId: id, entityKey: ent.entityKey }, ...(pct > 0 ? { application_fee_percent: pct } : {}) }), opts(acct));
      } catch (e: any) { try { await s.products.update(product.id, { active: false }, opts(acct)); } catch { /* */ } throw e; }
      await deps.patch('billingPaymentLinks', id, clean({
        id, entityKey: ent.entityKey, entity: { kind: ent.kind, id: ent.id }, title, description, ...(amount !== undefined ? { amount: c2d(d2c(amount)) } : {}), allowCustomAmount: custom, currency,
        active: true, stripePaymentLinkId: link.id, stripePriceId: price.id, stripeProductId: product.id, url: link.url, paidCount: 0, paidTotal: 0, createdBy: req.uid, createdAt: Date.now(),
      }));
      const created = await deps.read('billingPaymentLinks', id);
      res.json({ paymentLink: created, link: created });
    }));

    app.post('/api/billing/payment-links/deactivate', ...pre(), wrap(async (req, res) => {
      await requireFlag(req, res, 'PAYMENT_LINKS');
      const lid = str(bid(req), 200) || '_none_';
      const pl = await deps.read('billingPaymentLinks', lid);
      if (!pl) return fail(404, 'Payment link not found', 'NOT_FOUND');
      const ent = await entityFor(req, res, pl.entity);
      const { id: acct } = await billingAccount(ent);
      const active = req.body?.active === true;            // default = deactivate; {active:true} turns it back on
      if (pl.stripePaymentLinkId) await stripe().paymentLinks.update(pl.stripePaymentLinkId, { active }, opts(acct));
      await deps.patch('billingPaymentLinks', lid, active ? { active: true, deactivatedAt: 0 } : { active: false, deactivatedAt: Date.now() });
      const out = await deps.read('billingPaymentLinks', lid);
      res.json({ paymentLink: out, link: out });
    }));

    // ---- balance ----
    app.get('/api/billing/balance', deps.authMiddleware, deps.requireRegisteredUser, wrap(async (req, res) => {
      await requireFlag(req, res, 'BALANCE_DASHBOARD');
      const ent = await entityFor(req, res, { kind: req.query.kind, id: req.query.id });
      const { id: acct } = await billingAccount(ent);
      const cur = /^[a-zA-Z]{3}$/.test(String(req.query.currency || '')) ? String(req.query.currency).toLowerCase() : 'usd';
      const out = await cached(`bal:${ent.entityKey}:${cur}`, 60_000, async () => {
        const s = stripe();
        const since = Math.floor(Date.now() / 1000) - 30 * 86400;
        const [bal, payouts, txns] = await Promise.all([
          s.balance.retrieve({}, opts(acct)),
          s.payouts.list({ limit: 20 }, opts(acct)),
          s.balanceTransactions.list({ created: { gte: since }, limit: 100 }, opts(acct)).autoPagingToArray({ limit: 1000 }),
        ]);
        const sumC = (xs: any[] | undefined) => (xs || []).filter(b => b.currency === cur).reduce((t, b) => t + b.amount, 0);
        let gross = 0, fees = 0, refunds = 0, net = 0, count = 0;
        for (const bt of txns as any[]) {
          if (bt.currency !== cur || ['payout', 'payout_cancel', 'payout_failure'].includes(bt.type)) continue;
          count++; net += bt.net;
          if (bt.type === 'charge' || bt.type === 'payment') { gross += bt.amount; fees += bt.fee; }
          else if (['payment_refund', 'refund', 'payment_failure_refund'].includes(bt.type)) refunds += Math.abs(bt.amount);
          else if (['stripe_fee', 'application_fee'].includes(bt.type)) fees += Math.abs(bt.amount);
        }
        const pm = (p: any) => ({ id: p.id, amount: c2d(p.amount), currency: p.currency, status: p.status, arrivalDate: new Date((p.arrival_date || p.created) * 1000).toISOString().slice(0, 10), method: p.method });
        const list = (payouts.data as any[]).filter(p => p.currency === cur);
        return {
          currency: cur, available: c2d(sumC(bal.available)), pending: c2d(sumC(bal.pending)),
          upcomingPayouts: list.filter(p => p.status === 'pending' || p.status === 'in_transit').sort((a, b) => a.arrival_date - b.arrival_date).map(pm),
          recentPayouts: list.filter(p => p.status === 'paid' || p.status === 'failed' || p.status === 'canceled').slice(0, 10).map(pm),
          last30: { gross: c2d(gross), fees: c2d(fees), refunds: c2d(refunds), net: c2d(net), transactions: count, truncated: (txns as any[]).length >= 1000 },
          asOf: Date.now(),
        };
      });
      res.json({ ...out, payouts: [...((out as any).upcomingPayouts || []), ...((out as any).recentPayouts || [])] });
    }));

    // ---- sweep (cron or manual) ----
    app.post('/api/billing/recurring/run', (req: any, res: any, next: any) => {
      const ck = cronOk(req);
      if (ck === null) return deps.authMiddleware(req, res, () => deps.requireRegisteredUser(req, res, next));
      if (!ck) return res.status(401).json({ error: 'invalid or missing cron key' });
      req.billingCron = true; next();
    }, express.json({ limit: '100kb' }), wrap(async (req, res) => {
      if (req.billingCron) return res.json(await sweep(req.body?.entity ? `${String(req.body.entity.kind).toUpperCase()}:${req.body.entity.id}` : undefined));
      await requireFlag(req, res, 'INVOICES');
      const ent = await entityFor(req, res, req.body?.entity);
      res.json(await sweep(ent.entityKey));
    }));
    if (process.env.BILLING_SWEEP === '1') {
      const every = Math.max(10, Number(process.env.BILLING_SWEEP_MIN) || 60) * 60_000;
      setTimeout(() => sweep().catch(() => {}), 120_000).unref?.();
      setInterval(() => sweep().catch(() => {}), every).unref?.();
      console.log(`[Billing] sweep enabled (every ${every / 60000} min)`);
    }
  }

  return { register, handleConnectEvent, invoiceByPaymentIntent, resolveBillingEntity, sweep, computeTotals };
}
