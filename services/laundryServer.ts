// laundryServer - Express routes for the laundromat layer on top of the generic ticket engine.
// Registered from server.ts with ONE call (every server helper it needs is injected). It never edits ticketServer;
// it reads/writes the same flat `tickets/{id}` docs through the same CAS + serializeTicket codec.
//
//  POST /api/laundry/settings/get|set        owner-editable prices, add-ons, turnaround, promo ... (laundrySettings/{businessUid})
//  POST /api/laundry/accounts/list|upsert    commercial accounts (laundryAccounts/{id}); server-write-only
//  POST /api/laundry/bill-to-account         charge a completed ticket to its commercial account (ACCOUNT deposit)
//  POST /api/laundry/invoices/list|generate|pay|void|statement    INVOICE-ONLY (no payment rail); laundryInvoices/{id}
//  POST /api/laundry/schedule/generate       standing pickup schedules -> draft tickets (idempotent by schedule key)
//  POST /api/laundry/reminders/run           unclaimed-order reminders for ONE business (staff button)
//  POST /api/laundry/cron/reminders          same for ALL businesses; guarded by header x-cron-secret = env CRON_SECRET
//                                            (point Cloud Scheduler / any cron at it daily; 503 until CRON_SECRET is set)
// Wallet top-up bonus is applied inside /api/stored-value/reload (server.ts) via `loadWalletPromo` below.
import nodeCrypto from 'node:crypto';
import { casUpdate } from './casCore';
import { getPack } from './verticalPacks';
import { parseTicket, serializeTicket, addDeposit, audit, computeTicketTotals, stageKind, type Ticket, type TicketConfig, newTicket } from './ticketCore';
import { makeToken } from './ticketServer';
import { cleanLaundrySettings, type LaundrySettings } from './laundryDefaults';
import { unclaimedActions, coveredDays, type ReminderAction } from './laundryCore';
import {
  cleanAccount, serializeAccount, parseAccount, expandSchedule, draftTicketFor, billableTickets, buildInvoice, serializeInvoice, parseInvoice,
  applyInvoicePayment, voidInvoice, buildStatement, billedToAccount, isoDate, type CommercialAccount, type Invoice,
} from './commercialCore';
import type { WalletPromo } from './walletPromoCore';
import { cleanPromo } from './walletPromoCore';
import type { TaxSettings } from './taxCore';

export interface LaundryDeps {
  app: any; express: any;
  authMiddleware: any;
  resolveActor: (req: any, businessUid: string, perm: string) => Promise<any>;
  restCas: (collectionPath: string) => any;
  fsQueryDocs: (c: string, f: Array<{ field: string; op: string; value: any }>, n?: number) => Promise<Array<{ id: string; data: Record<string, any> }>>;
  firestoreRead: (c: string, id: string) => Promise<Record<string, any> | null>;
  firestoreWrite: (c: string, id: string, data: object, requireSuccess?: boolean) => Promise<any>;
  firestoreGetDeep: (c: string, id: string) => Promise<Record<string, any> | null>;
  firestoreCreate: (c: string, data: object) => Promise<any>;
  sendFcmMulticast: (tokens: string[], opts: any) => Promise<any>;
  loadRegisterSettings: (businessUid: string) => Promise<{ tax: TaxSettings }>;
}

const PACK_ID = 'laundromat';
const rid = (p: string) => `${p}_${Date.now().toString(36)}${nodeCrypto.randomBytes(4).toString('hex')}`;
const cleanId = (s: any) => String(s ?? '').replace(/[^A-Za-z0-9_\-]/g, '').slice(0, 80);

/** Wallet promo for a business ('' when none). Used by the stored-value reload route. Never throws. */
export async function loadWalletPromo(firestoreRead: LaundryDeps['firestoreRead'], businessUid: string): Promise<WalletPromo> {
  try { const d = await firestoreRead('laundrySettings', businessUid); return d?.json ? cleanLaundrySettings(d.json).promo : cleanPromo(null); } catch { return cleanPromo(null); }
}

export function registerLaundryRoutes(d: LaundryDeps): void {
  const { app, express } = d;
  const cfg = (): TicketConfig => getPack(PACK_ID)!.ticket!;
  const tickets = () => d.restCas('tickets');
  const jsonBody = express.json({ limit: '64kb' });

  const settingsFor = async (b: string): Promise<LaundrySettings> => { try { const r = await d.firestoreRead('laundrySettings', b); return cleanLaundrySettings(r?.json); } catch { return cleanLaundrySettings(null); } };
  const wrap = (name: string, fn: (req: any, res: any, b: string, actor: any) => Promise<any>, perm = 'RING_SALES') =>
    app.post(`/api/laundry/${name}`, d.authMiddleware, jsonBody, async (req: any, res: any) => {
      try {
        const b = String(req.body?.businessUid || ''); if (!b) return res.status(400).json({ error: 'businessUid required.' });
        const a = await d.resolveActor(req, b, perm); if (a.ok === false) return res.status(a.status).json({ error: a.error, code: a.code });
        await fn(req, res, b, a);
      } catch (err: any) { console.error(`/api/laundry/${name}`, err?.message || err); res.status(500).json({ error: 'Laundry request failed.' }); }
    });
  const MGR = 'VIEW_REPORTS';

  // ── settings ─────────────────────────────────────────────────────────────────────────────────
  wrap('settings/get', async (_req, res, b) => res.json({ settings: await settingsFor(b) }));
  wrap('settings/set', async (req, res, b) => {
    const s = cleanLaundrySettings(req.body?.settings);
    await d.firestoreWrite('laundrySettings', b, { businessUid: b, json: JSON.stringify(s), updatedAt: Date.now() }, true);
    res.json({ settings: s });
  }, MGR);

  // ── accounts ─────────────────────────────────────────────────────────────────────────────────
  const listAccounts = async (b: string): Promise<CommercialAccount[]> =>
    (await d.fsQueryDocs('laundryAccounts', [{ field: 'businessUid', op: 'EQUAL', value: b }], 300)).map(r => parseAccount(r.data)).sort((a, c) => a.name.localeCompare(c.name));
  wrap('accounts/list', async (_req, res, b) => res.json({ accounts: await listAccounts(b) }));
  wrap('accounts/upsert', async (req, res, b) => {
    const id = cleanId(req.body?.account?.id) || rid('ac');
    const prior = await d.restCas('laundryAccounts').get(id);
    if (prior && prior.data.businessUid !== b) return res.status(404).json({ error: 'Account not found.' });
    const r = cleanAccount({ ...req.body?.account, createdAt: prior?.data.createdAt }, id, b);
    if (!r.account) return res.status(400).json({ error: r.error });
    const w = await casUpdate<null>(d.restCas('laundryAccounts'), id, cur => (cur && cur.businessUid !== b ? { abort: true, result: null } : { patch: serializeAccount(r.account!), result: null }));
    if (w.ok === false) return res.status(409).json({ error: 'Could not save the account. Try again.' });
    res.json({ account: r.account });
  }, MGR);

  // ── tickets <-> accounts ─────────────────────────────────────────────────────────────────────
  wrap('bill-to-account', async (req, res, b, actor) => {
    const id = cleanId(req.body?.ticketId); const c = cfg(); const tax = (await d.loadRegisterSettings(b)).tax; let fail = '';
    const out = await casUpdate<Ticket | null>(tickets(), id, cur => {
      if (!cur || cur.businessUid !== b) { fail = 'Ticket not found.'; return { abort: true, result: null }; }
      const t = parseTicket(cur); const accId = String(t.subject.account || '');
      if (!accId) { fail = 'Attach a commercial account to this ticket first.'; return { abort: true, result: null }; }
      const tot = computeTicketTotals(t, c, tax);
      if (!tot.approvedCount) { fail = 'Weigh in and add lines first.'; return { abort: true, result: null }; }
      if (t.saleOrderId) { fail = 'This ticket is already paid.'; return { abort: true, result: null }; }
      if (tot.balanceCents <= 0) { fail = billedToAccount(t) ? 'Already charged to the account.' : 'Nothing is due on this ticket.'; return { abort: true, result: null }; }
      const x = addDeposit(t, { id: rid('d'), amountCents: tot.balanceCents, method: 'ACCOUNT', reference: accId.slice(0, 40), by: `${actor.staffName}` });
      if (!x.ticket) { fail = x.error || 'Could not bill.'; return { abort: true, result: null }; }
      const nt = audit({ ...x.ticket, updatedAt: Date.now() }, { by: `${actor.staffName}`, type: 'ACCOUNT', detail: `charged to account ${accId}` });
      return { patch: serializeTicket(nt, c, tax), result: nt };
    });
    if (out.ok === false || !out.result) return res.status(fail ? 400 : 409).json({ error: fail || 'Someone else just changed this ticket. Try again.' });
    res.json({ ticket: { ...out.result, audit: out.result.audit.slice(-80) } });
  });

  // ── invoices ─────────────────────────────────────────────────────────────────────────────────
  const invoices = () => d.restCas('laundryInvoices');
  const listInvoices = async (b: string, accountId?: string): Promise<Invoice[]> =>
    (await d.fsQueryDocs('laundryInvoices', [{ field: 'businessUid', op: 'EQUAL', value: b }, ...(accountId ? [{ field: 'accountId', op: 'EQUAL', value: accountId }] : [])], 500)).map(r => parseInvoice(r.data)).sort((a, c) => c.issuedAt - a.issuedAt);
  wrap('invoices/list', async (req, res, b) => res.json({ invoices: await listInvoices(b, req.body?.accountId ? cleanId(req.body.accountId) : undefined) }), MGR);

  wrap('invoices/generate', async (req, res, b, actor) => {
    const accId = cleanId(req.body?.accountId); const from = String(req.body?.periodFrom || ''), to = String(req.body?.periodTo || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) return res.status(400).json({ error: 'Pick a billing period.' });
    const accRow = await d.restCas('laundryAccounts').get(accId);
    if (!accRow || accRow.data.businessUid !== b) return res.status(404).json({ error: 'Account not found.' });
    const account = parseAccount(accRow.data); const s = await settingsFor(b); const c = cfg(); const tax = (await d.loadRegisterSettings(b)).tax;
    const fromMs = Date.parse(`${from}T00:00:00Z`) - s.tzOffsetMin * 60_000, toMs = Date.parse(`${to}T23:59:59Z`) - s.tzOffsetMin * 60_000;
    const all = (await d.fsQueryDocs('tickets', [{ field: 'businessUid', op: 'EQUAL', value: b }], 1500)).map(r => parseTicket(r.data));
    const cand = billableTickets(all, c, accId, { fromMs, toMs }, new Set());
    // Claim each ticket (create-once marker) so two staff generating at once cannot invoice it twice.
    const claimed: Ticket[] = []; const invId = rid('inv');
    for (const t of cand) {
      const r = await casUpdate<boolean>(d.restCas('laundryInvoiced'), t.id, cur => (cur && cur.released !== true ? { abort: true, result: false } : { patch: { businessUid: b, ticketId: t.id, invoiceId: invId, released: false, at: Date.now() }, result: true }));
      if (r.ok && r.result) claimed.push(t);
    }
    const releaseAll = async () => { for (const t of claimed) await casUpdate(d.restCas('laundryInvoiced'), t.id, cur => (cur && cur.invoiceId === invId ? { patch: { released: true }, result: null } : { abort: true, result: null })).catch(() => {}); };
    if (!claimed.length) return res.status(400).json({ error: cand.length ? 'Those tickets are already on an invoice.' : 'No completed tickets charged to this account in that period. Use "Charge to account" on each finished ticket first.' });
    const cnt = await casUpdate<number>(d.restCas('laundryCounters'), b, cur => { const n = Math.max(1, Number(cur?.nextInvoice) || 1); return { patch: { nextInvoice: n + 1, businessUid: b }, result: n }; });
    if (cnt.ok === false) { await releaseAll(); return res.status(503).json({ error: 'Could not number the invoice. Try again.' }); }
    const built = buildInvoice({ id: invId, seq: cnt.result, account, tickets: claimed, cfg: c, tax, periodFrom: from, periodTo: to, memo: req.body?.memo ? String(req.body.memo) : undefined });
    if (!built.invoice) { await releaseAll(); return res.status(400).json({ error: built.error }); }
    const w = await casUpdate<null>(invoices(), invId, cur => (cur ? { abort: true, result: null } : { patch: serializeInvoice(built.invoice!), result: null }));
    if (w.ok === false) { await releaseAll(); return res.status(500).json({ error: 'Could not save the invoice.' }); }
    console.log(`[laundry] invoice ${built.invoice.number} for ${account.name} by ${actor.staffName}`);
    res.json({ invoice: built.invoice, skipped: cand.length - claimed.length });
  }, MGR);

  const mutateInvoice = async (b: string, id: string, fn: (i: Invoice) => { invoice?: Invoice; error?: string }): Promise<{ ok: true; invoice: Invoice } | { ok: false; status: number; error: string }> => {
    let err = '';
    const out = await casUpdate<Invoice | null>(invoices(), id, cur => {
      if (!cur || cur.businessUid !== b) { err = 'Invoice not found.'; return { abort: true, result: null }; }
      const r = fn(parseInvoice(cur)); if (!r.invoice) { err = r.error || 'Could not update.'; return { abort: true, result: null }; }
      return { patch: serializeInvoice(r.invoice), result: r.invoice };
    });
    if (out.ok && out.result) return { ok: true, invoice: out.result };
    return { ok: false, status: err === 'Invoice not found.' ? 404 : err ? 400 : 409, error: err || 'Someone else just changed this invoice. Try again.' };
  };
  wrap('invoices/pay', async (req, res, b, actor) => {
    const r = await mutateInvoice(b, cleanId(req.body?.invoiceId), i => applyInvoicePayment(i, { id: rid('pay'), amountCents: req.body?.amountCents, method: String(req.body?.method || 'EXTERNAL'), reference: req.body?.reference ? String(req.body.reference) : undefined, by: `${actor.staffName}` }));
    r.ok === false ? res.status(r.status).json({ error: r.error }) : res.json({ invoice: r.invoice });
  }, MGR);
  wrap('invoices/void', async (req, res, b) => {
    const r = await mutateInvoice(b, cleanId(req.body?.invoiceId), i => voidInvoice(i, String(req.body?.reason || '')));
    if (r.ok) { for (const l of r.invoice.lines) await casUpdate(d.restCas('laundryInvoiced'), l.ticketId, cur => (cur && cur.invoiceId === r.invoice.id ? { patch: { released: true }, result: null } : { abort: true, result: null })).catch(() => {}); }
    r.ok === false ? res.status(r.status).json({ error: r.error }) : res.json({ invoice: r.invoice });
  }, MGR);
  wrap('invoices/statement', async (req, res, b) => {
    const accId = cleanId(req.body?.accountId); const acc = await d.restCas('laundryAccounts').get(accId);
    if (!acc || acc.data.businessUid !== b) return res.status(404).json({ error: 'Account not found.' });
    const a = parseAccount(acc.data);
    res.json({ statement: buildStatement(a, await listInvoices(b, accId), Date.now()) });
  }, MGR);

  // ── standing pickup schedules -> draft tickets ───────────────────────────────────────────────
  wrap('schedule/generate', async (req, res, b, actor) => {
    const c = cfg(); const tax = (await d.loadRegisterSettings(b)).tax; const s = await settingsFor(b);
    const from = String(req.body?.from || isoDate(Date.now(), s.tzOffsetMin)); const to = String(req.body?.to || isoDate(Date.now() + 6 * 86_400_000, s.tzOffsetMin));
    const accounts = (await listAccounts(b)).filter(a => !req.body?.accountId || a.id === cleanId(req.body.accountId));
    const existing = new Set((await d.fsQueryDocs('tickets', [{ field: 'businessUid', op: 'EQUAL', value: b }], 1500)).map(r => String(parseTicket(r.data).subject.sched_key || '')).filter(Boolean));
    const created: { number: string; account: string; date: string }[] = [];
    for (const a of accounts) {
      for (const p of expandSchedule(a, from, to, existing).slice(0, 60)) {
        const cnt = await casUpdate<number>(d.restCas('ticketCounters'), `${b}_${PACK_ID}`, cur => { const n = Math.max(c.startAt, Number(cur?.next) || c.startAt); return { patch: { next: n + 1, businessUid: b }, result: n }; });
        if (cnt.ok === false) return res.status(503).json({ error: 'Could not number the tickets. Try again.', created });
        const dr = draftTicketFor(a, p); const id = rid('tk');
        const t = newTicket(c, { id, seq: cnt.result, businessUid: b, packId: PACK_ID, customer: dr.customer, subject: dr.subject, by: `${actor.staffName} (schedule)` });
        const w = await casUpdate<null>(tickets(), id, cur => (cur ? { abort: true, result: null } : { patch: serializeTicket(t, c, tax), result: null }));
        if (w.ok) { existing.add(p.key); created.push({ number: t.number, account: a.name, date: p.date }); }
      }
    }
    res.json({ created, from, to });
  });

  // ── unclaimed-order reminders ────────────────────────────────────────────────────────────────
  async function notify(t: Ticket, a: ReminderAction, businessName: string, base: string): Promise<{ push: boolean; email: boolean }> {
    const out = { push: false, email: false }; const link = `${base}/t/${makeToken(t)}`; const title = `${businessName}: ${t.number} is waiting for you`;
    try {
      if (t.customer.uid) {
        const sub = await d.firestoreRead(`businesses/${t.businessUid}/subscribers`, t.customer.uid).catch(() => null);
        if (!(sub && sub.transactional === false)) {
          await d.firestoreCreate('notifications', { userId: t.customer.uid, senderId: t.businessUid, senderName: businessName, senderPhoto: '', type: 'BUSINESS_UPDATE', title, message: `${a.text} ${link}`, link: 'PROFILE', targetId: t.businessUid, isRead: false, timestamp: Date.now() });
          const u = await d.firestoreGetDeep('users', t.customer.uid);
          const tokens: string[] = [...(Array.isArray(u?.fcmTokens) ? u!.fcmTokens : []), ...(u?.fcmToken ? [u.fcmToken] : [])].filter(Boolean);
          if (tokens.length) d.sendFcmMulticast([...new Set(tokens)], { title, body: a.text.slice(0, 180), link, channelId: 'system', data: { type: 'BUSINESS_UPDATE', targetId: t.businessUid, senderName: businessName } }).catch(() => {});
          out.push = true;
        }
      }
    } catch (e: any) { console.error('[laundry] reminder push failed', e?.message); }
    try {
      if (t.customer.email && process.env.RESEND_API_KEY) {
        const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c]);
        const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: process.env.RESEND_FROM || 'Plajah <onboarding@resend.dev>', to: t.customer.email, subject: title, html: `<p>${esc(a.text)}</p><p><a href="${link}">View your ticket</a></p>` }) });
        out.email = r.ok;
      }
    } catch (e: any) { console.error('[laundry] reminder email failed', e?.message); }
    return out;   // SMS stays the no-op seam (ticketServer.sendSms); not wired here on purpose.
  }
  async function runReminders(b: string, base: string, now = Date.now()): Promise<{ sent: { number: string; kind: string; day: number; push: boolean; email: boolean }[]; ownerReview: string[] }> {
    const c = cfg(); const s = await settingsFor(b);
    const ready = (await d.fsQueryDocs('tickets', [{ field: 'businessUid', op: 'EQUAL', value: b }, { field: 'stageKind', op: 'EQUAL', value: 'READY' }], 500)).map(r => parseTicket(r.data));
    const sent: Record<string, number[]> = {};
    for (const t of ready) { const r = await d.firestoreRead('laundryReminders', t.id).catch(() => null); if (r?.days) { try { sent[t.id] = JSON.parse(String(r.days)); } catch { /* none */ } } }
    const actions = unclaimedActions(ready, c, now, sent, s.unclaimed);
    const bn = await d.fsQueryDocs('businessPages', [{ field: 'ownerId', op: 'EQUAL', value: b }], 1).then(r => String(r[0]?.data?.businessName || 'Your laundromat')).catch(() => 'Your laundromat');
    const out: { number: string; kind: string; day: number; push: boolean; email: boolean }[] = []; const ownerReview: string[] = [];
    for (const a of actions) {
      const t = ready.find(x => x.id === a.ticketId)!;
      let res = { push: false, email: false };
      if (a.kind === 'DISPOSAL_ELIGIBLE') ownerReview.push(t.number); else res = await notify(t, a, bn, base);
      // Record BEFORE moving on so a crash can't re-send tomorrow; covers earlier thresholds too (no catch-up spam).
      await d.firestoreWrite('laundryReminders', t.id, { businessUid: b, ticketId: t.id, days: JSON.stringify([...new Set([...(sent[t.id] || []), ...coveredDays(a, s.unclaimed)])]), updatedAt: now }).catch(() => {});
      out.push({ number: t.number, kind: a.kind, day: a.day, ...res });
    }
    return { sent: out, ownerReview };
  }
  const baseUrl = (req: any) => (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  wrap('reminders/run', async (req, res, b) => res.json(await runReminders(b, baseUrl(req))));
  app.post('/api/laundry/cron/reminders', jsonBody, async (req: any, res: any) => {
    const secret = process.env.CRON_SECRET; if (!secret) return res.status(503).json({ error: 'CRON_SECRET is not configured.' });
    const got = Buffer.from(String(req.get('x-cron-secret') || '')), want = Buffer.from(secret);
    if (got.length !== want.length || !nodeCrypto.timingSafeEqual(got, want)) return res.status(401).json({ error: 'Unauthorized.' });
    try {
      const rows = await d.fsQueryDocs('tickets', [{ field: 'packId', op: 'EQUAL', value: PACK_ID }, { field: 'stageKind', op: 'EQUAL', value: 'READY' }], 1500);
      const businesses = [...new Set(rows.map(r => String(r.data.businessUid || '')).filter(Boolean))];
      const results: Record<string, number> = {};
      for (const b of businesses) { const r = await runReminders(b, baseUrl(req)); results[b] = r.sent.length; }
      res.json({ businesses: businesses.length, results });
    } catch (e: any) { console.error('/api/laundry/cron/reminders', e?.message); res.status(500).json({ error: 'Reminder run failed.' }); }
  });
  void stageKind;
}
