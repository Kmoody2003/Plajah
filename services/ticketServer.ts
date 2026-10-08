// ticketServer - Express routes for the generic ticket engine (auto repair orders, laundromat tickets...).
// Registered from server.ts with ONE call; every server helper it needs is injected (`TicketDeps`), so this
// file has no dependency on server.ts internals. Rules live in services/ticketCore.ts (pure + tested).
//
//  Staff routes   POST /api/tickets/{list,get,create,update,line,transition,deposit,link}
//                 auth = Firebase auth + owner OR register PIN session (same as /api/store/pos-sale)
//  Public routes  GET /t/:token (HTML)  POST /t/:token/decide   - HMAC link token, rate-limited, own ticket only
//  Payment        NOT a route here: pos-sale accepts `ticketId` and calls `ticketSaleHooks` (below), so tax,
//                 split tenders, drawer, loyalty and the receipt all run through the existing pipeline.
//
// Tickets live in `tickets/{id}` (flat doc, complex parts JSON-stringified - see serializeTicket) and every
// write is a compare-and-swap (casCore), so two staff / the customer cannot clobber each other.
import nodeCrypto from 'node:crypto';
import { casUpdate } from './casCore';
import { getPack } from './verticalPacks';
import { renderTicketPage, renderTicketMessagePage } from './ticketPublicPage';
import { renderTicketPageExtras } from './ticketPageHooks';
import {
  type Ticket, type TicketConfig, newTicket, serializeTicket, parseTicket, canTransition, applyTransition, shouldNotify, stageById, stageKind,
  stageOfKind, cleanLine, cleanSubject, addDeposit, startTimer, stopTimer, decideLines, stageAfterDecision, computeTicketTotals, audit,
  toPublicView, formatToken, parseToken, saleLines, lineFromTemplate, matchesQuery, DEFAULT_CONSENT, allowedNext,
} from './ticketCore';
import type { TaxSettings } from './taxCore';

export interface TicketDeps {
  app: any; express: any; rateLimit: any;
  authMiddleware: any;
  resolveActor: (req: any, businessUid: string, perm: string) => Promise<any>;
  managerApproval: (businessUid: string, pin: any) => Promise<{ id: string; name: string } | null>;
  restCas: (collectionPath: string) => any;
  fsQueryDocs: (c: string, f: Array<{ field: string; op: string; value: any }>, n?: number) => Promise<Array<{ id: string; data: Record<string, any> }>>;
  firestoreRead: (c: string, id: string) => Promise<Record<string, any> | null>;
  firestoreGetDeep: (c: string, id: string) => Promise<Record<string, any> | null>;
  firestoreCreate: (c: string, data: object) => Promise<any>;
  sendFcmMulticast: (tokens: string[], opts: any) => Promise<any>;
  loadRegisterSettings: (businessUid: string) => Promise<{ tax: TaxSettings }>;
  applyStockSale: (lines: any[], ctx: any) => Promise<boolean>;
}

// ── SMS seam (PLANNED: needs A2P 10DLC registration + TCPA consent capture). Intentionally a no-op. ──
export async function sendSms(to: string, body: string): Promise<{ sent: false; reason: string }> {
  console.log(`[tickets] sendSms skipped (SMS is planned, not enabled): to=${String(to).replace(/\d(?=\d{2})/g, '*')} len=${body.length}`);
  return { sent: false, reason: 'SMS_NOT_ENABLED' };
}

const secret = (): string =>
  process.env.TICKET_LINK_SECRET || process.env.REGISTER_SESSION_SECRET
  || nodeCrypto.createHash('sha256').update(String(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.STRIPE_SECRET_KEY || 'plajah-dev-ticket-secret')).digest('hex');
const mac = (ticketId: string, version: number): string => nodeCrypto.createHmac('sha256', secret()).update(`tkt|${ticketId}|${version}`).digest('base64url').slice(0, 24);
export const makeToken = (t: Pick<Ticket, 'id' | 'linkVersion'>): string => formatToken(t.id, t.linkVersion, mac(t.id, t.linkVersion));
export function verifyToken(tok: string): { ticketId: string; version: number } | null {
  const p = parseToken(tok);
  if (!p) return null;
  const want = Buffer.from(mac(p.ticketId, p.version)), got = Buffer.from(p.mac);
  return want.length === got.length && nodeCrypto.timingSafeEqual(want, got) ? { ticketId: p.ticketId, version: p.version } : null;
}

export const cfgForTicket = (packId?: string): TicketConfig | null => getPack(packId)?.ticket || null;
const rid = (p: string) => `${p}_${Date.now().toString(36)}${nodeCrypto.randomBytes(4).toString('hex')}`;

// ── Hooks used by pos-sale (set by registerTicketRoutes) ──────────────────────────────────────────
export interface TicketSalePrep { ticket: Ticket; cfg: TicketConfig; lines: ReturnType<typeof saleLines>; depositsCents: number }
export const ticketSaleHooks: {
  prepare: (businessUid: string, ticketId: string) => Promise<{ ok: true; prep: TicketSalePrep } | { ok: false; status: number; error: string; code?: string }>;
  /** Merge ticket lines into the priced basket pos-sale already built. */
  merge: (priced: { lines: any[]; products: Map<string, any>; subtotalCents: number }, prep: TicketSalePrep) => { lines: any[]; products: Map<string, any>; subtotalCents: number };
  /** Deposit credited against this sale (never more than the sale total). */
  credit: (prep: TicketSalePrep, totalCents: number) => number;
  claim: (prep: TicketSalePrep, orderId: string, by: string) => Promise<boolean>;
  release: (prep: TicketSalePrep, orderId: string) => Promise<void>;
  finalize: (prep: TicketSalePrep, orderId: string, a: { paidCents: number; by: string; creditCents: number }) => Promise<void>;
  orderFields: (prep: TicketSalePrep, creditCents: number) => Record<string, any>;
} = {
  prepare: async () => ({ ok: false, status: 503, error: 'Tickets are not available on this server.' }),
  merge: p => p, credit: () => 0, claim: async () => false, release: async () => {}, finalize: async () => {}, orderFields: () => ({}),
};

export function registerTicketRoutes(d: TicketDeps): void {
  const { app, express } = d;
  const store = () => d.restCas('tickets');

  // ── load / mutate ───────────────────────────────────────────────────────────────────────────────
  const load = async (id: string): Promise<{ ticket: Ticket; cfg: TicketConfig } | null> => {
    const cur = await store().get(String(id || ''));
    if (!cur) return null;
    const ticket = parseTicket(cur.data); const cfg = cfgForTicket(ticket.packId);
    return cfg ? { ticket, cfg } : null;
  };
  type MutResult = { ticket?: Ticket; error?: string; status?: number; code?: string; extra?: any };
  async function mutate(ticketId: string, businessUid: string, fn: (t: Ticket, cfg: TicketConfig, tax: TaxSettings) => Promise<MutResult> | MutResult):
    Promise<{ ok: true; ticket: Ticket; cfg: TicketConfig; extra?: any } | { ok: false; status: number; error: string; code?: string }> {
    const tax = (await d.loadRegisterSettings(businessUid)).tax;
    let fail: { status: number; error: string; code?: string } | null = null; let extra: any; let cfgOut: TicketConfig | null = null;
    const out = await casUpdate<Ticket | null>(store(), String(ticketId), async cur => {
      if (!cur || cur.businessUid !== businessUid) { fail = { status: 404, error: 'Ticket not found.' }; return { abort: true, result: null }; }
      const t = parseTicket(cur); const cfg = cfgForTicket(t.packId);
      if (!cfg) { fail = { status: 400, error: 'This ticket has no pipeline configured.' }; return { abort: true, result: null }; }
      const r = await fn(t, cfg, tax);
      if (r.error || !r.ticket) { fail = { status: r.status || 400, error: r.error || 'Could not update.', code: r.code }; return { abort: true, result: null }; }
      extra = r.extra; cfgOut = cfg;
      const nt = { ...r.ticket, updatedAt: Date.now() };
      return { patch: serializeTicket(nt, cfg, tax), result: nt };
    });
    if (out.ok === false) {
      if (fail) return { ok: false, ...(fail as any) };
      return { ok: false, status: out.reason === 'CONFLICT' ? 409 : 500, error: out.reason === 'CONFLICT' ? 'Someone else just changed this ticket. Try again.' : 'Could not save the ticket.' };
    }
    return { ok: true, ticket: out.result as Ticket, cfg: cfgOut as unknown as TicketConfig, extra };
  }

  const actorFor = async (req: any, res: any, perm = 'RING_SALES') => {
    const businessUid = String(req.body?.businessUid || '');
    if (!businessUid) { res.status(400).json({ error: 'businessUid required.' }); return null; }
    const a = await d.resolveActor(req, businessUid, perm);
    if (a.ok === false) { res.status(a.status).json({ error: a.error, code: a.code }); return null; }
    return { businessUid, actor: a };
  };
  const byOf = (a: any) => `${a.staffName}`.slice(0, 60);
  const publicTicket = (t: Ticket) => ({ ...t, audit: t.audit.slice(-80) });

  // ── Customer notifications ──────────────────────────────────────────────────────────────────────
  const businessName = async (businessUid: string): Promise<string> => {
    try { const r = await d.fsQueryDocs('businessPages', [{ field: 'ownerId', op: 'EQUAL', value: businessUid }], 1); return String(r[0]?.data?.businessName || 'Your service shop'); } catch { return 'Your service shop'; }
  };
  const baseUrl = (req: any) => (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  async function notifyCustomer(req: any, t: Ticket, cfg: TicketConfig, stageId: string): Promise<{ push: boolean; email: boolean; sms: boolean }> {
    const out = { push: false, email: false, sms: false };
    const st = stageById(cfg, stageId); if (!st) return out;
    const name = await businessName(t.businessUid);
    const link = `${baseUrl(req)}/t/${makeToken(t)}`;
    const k = st.kind;
    const title = k === 'AWAITING_APPROVAL' ? `${name}: estimate ready` : k === 'READY' ? `${name}: ${t.number} is ready` : `${name}: ${t.number} - ${st.label}`;
    const text = k === 'AWAITING_APPROVAL' ? `Your estimate for ${t.number} is ready. Review and approve: ${link}` : k === 'READY' ? `${t.number} is ready for pickup. Details: ${link}` : `${t.number} is now "${st.label}". Details: ${link}`;
    try {   // in-app + push (Plajah users). Honour an explicit transactional opt-out.
      if (t.customer.uid) {
        const sub = await d.firestoreRead(`businesses/${t.businessUid}/subscribers`, t.customer.uid).catch(() => null);
        if (!(sub && sub.transactional === false)) {
          await d.firestoreCreate('notifications', { userId: t.customer.uid, senderId: t.businessUid, senderName: name, senderPhoto: '', type: 'BUSINESS_UPDATE', title, message: text, link: 'PROFILE', targetId: t.businessUid, isRead: false, timestamp: Date.now() });
          const u = await d.firestoreGetDeep('users', t.customer.uid);
          const tokens: string[] = [...(Array.isArray(u?.fcmTokens) ? u!.fcmTokens : []), ...(u?.fcmToken ? [u.fcmToken] : [])].filter(Boolean);
          if (tokens.length) d.sendFcmMulticast([...new Set(tokens)], { title, body: text.slice(0, 180), link, channelId: 'system', data: { type: 'BUSINESS_UPDATE', targetId: t.businessUid, senderName: name } }).catch(() => {});
          out.push = true;
        }
      }
    } catch (e: any) { console.error('[tickets] push failed', e?.message); }
    try {   // email via Resend when configured
      if (t.customer.email && process.env.RESEND_API_KEY) {
        const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c]);
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: process.env.RESEND_FROM || 'Plajah <onboarding@resend.dev>', to: t.customer.email, subject: title, html: `<p>${esc(text.replace(link, ''))}</p><p><a href="${link}">${esc(k === 'AWAITING_APPROVAL' ? 'Review estimate' : 'View ticket')}</a></p>` }),
        });
        out.email = r.ok;
      }
    } catch (e: any) { console.error('[tickets] email failed', e?.message); }
    if (t.customer.phone) out.sms = (await sendSms(t.customer.phone, text)).sent;
    return out;
  }

  // ── Staff routes ────────────────────────────────────────────────────────────────────────────────
  const jsonBody = express.json({ limit: '128kb' });
  const wrap = (name: string, fn: (req: any, res: any, a: { businessUid: string; actor: any }) => Promise<any>, perm = 'RING_SALES') =>
    app.post(`/api/tickets/${name}`, d.authMiddleware, jsonBody, async (req: any, res: any) => {
      try { const a = await actorFor(req, res, perm); if (a) await fn(req, res, a); }
      catch (err: any) { console.error(`/api/tickets/${name}`, err?.message || err); res.status(500).json({ error: 'Ticket request failed.' }); }
    });
  const reply = (res: any, r: Awaited<ReturnType<typeof mutate>>, extra: Record<string, any> = {}) =>
    r.ok === false ? res.status(r.status).json({ error: r.error, code: r.code }) : res.json({ ticket: publicTicket(r.ticket), ...extra, ...(r.extra || {}) });

  wrap('list', async (req, res, { businessUid }) => {
    const q = String(req.body?.q || '').slice(0, 80);
    const rows = (await d.fsQueryDocs('tickets', [{ field: 'businessUid', op: 'EQUAL', value: businessUid }], 800)).map(r => parseTicket(r.data));
    const out = rows.filter(t => matchesQuery(t, q)).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 400).map(t => ({ ...t, audit: [] }));
    res.json({ tickets: out });
  });

  wrap('get', async (req, res, { businessUid }) => {
    const r = await load(String(req.body?.ticketId || ''));
    if (!r || r.ticket.businessUid !== businessUid) return res.status(404).json({ error: 'Ticket not found.' });
    res.json({ ticket: publicTicket(r.ticket), link: `${baseUrl(req)}/t/${makeToken(r.ticket)}` });
  });

  wrap('create', async (req, res, { businessUid, actor }) => {
    const cfg = cfgForTicket(String(req.body?.packId || ''));
    if (!cfg) return res.status(400).json({ error: 'This business type has no ticket pipeline.' });
    const packId = String(req.body.packId);
    const cname = String(req.body?.customer?.name || '').trim().slice(0, 80);
    if (!cname) return res.status(400).json({ error: 'Customer name is required.' });
    const customer = { name: cname, ...(req.body.customer.uid ? { uid: String(req.body.customer.uid).slice(0, 128) } : {}), ...(req.body.customer.phone ? { phone: String(req.body.customer.phone).slice(0, 30) } : {}), ...(req.body.customer.email && /^\S+@\S+\.\S+$/.test(String(req.body.customer.email)) ? { email: String(req.body.customer.email).slice(0, 120) } : {}) };
    const cs = cleanSubject(cfg, req.body?.subject);
    if (cs.errors.length) return res.status(400).json({ error: cs.errors[0] });
    // per-business sequence (CAS counter): RO-1042, WF-0217...
    let seq = 0;
    const c = await casUpdate<number>(d.restCas('ticketCounters'), `${businessUid}_${packId}`, cur => { const n = Math.max(cfg.startAt, Number(cur?.next) || cfg.startAt); return { patch: { next: n + 1, businessUid }, result: n }; });
    if (c.ok === false) return res.status(503).json({ error: 'Could not number the ticket. Try again.' });
    seq = c.result;
    const id = rid('tk');
    let t = newTicket(cfg, { id, seq, businessUid, packId, customer, subject: cs.subject, by: byOf(actor) });
    let n = 0;
    for (const key of Array.isArray(req.body?.templates) ? req.body.templates.slice(0, 12) : []) {
      const raw = lineFromTemplate(cfg, String(key)); if (!raw) continue;
      const cl = cleanLine(cfg, raw, `l${++n}`); if (cl.line) t = { ...t, lines: [...t.lines, cl.line] };
    }
    const tax = (await d.loadRegisterSettings(businessUid)).tax;
    const w = await casUpdate<null>(store(), id, cur => (cur ? { abort: true, result: null } : { patch: serializeTicket(t, cfg, tax), result: null }));
    if (w.ok === false) return res.status(500).json({ error: 'Could not create the ticket.' });
    res.json({ ticket: publicTicket(t) });
  });

  wrap('update', async (req, res, { businessUid, actor }) => {
    const b = req.body || {};
    const r = await mutate(String(b.ticketId || ''), businessUid, (t, cfg) => {
      let nt = t; const by = byOf(actor);
      if (b.customer) {
        const c = b.customer; const name = String(c.name ?? t.customer.name).trim().slice(0, 80);
        if (!name) return { error: 'Customer name is required.' };
        nt = { ...nt, customer: { name, ...(c.uid ?? t.customer.uid ? { uid: String(c.uid ?? t.customer.uid) } : {}), ...(c.phone ?? t.customer.phone ? { phone: String(c.phone ?? t.customer.phone).slice(0, 30) } : {}), ...(c.email ?? t.customer.email ? { email: String(c.email ?? t.customer.email).slice(0, 120) } : {}) } };
      }
      if (b.subject) { const cs = cleanSubject(cfg, { ...nt.subject, ...b.subject }); if (cs.errors.length) return { error: cs.errors[0] }; nt = { ...nt, subject: cs.subject }; }
      if (b.assignedTo !== undefined) {
        nt = { ...nt, assignedTo: b.assignedTo && b.assignedTo.id ? { id: String(b.assignedTo.id).slice(0, 80), name: String(b.assignedTo.name || '').slice(0, 60) } : undefined };
        nt = audit(nt, { by, type: 'ASSIGN', detail: nt.assignedTo?.name || 'unassigned' });
      }
      if (b.note?.text) {
        const text = String(b.note.text).trim().slice(0, 1000);
        if (text) nt = { ...nt, notes: [...nt.notes, { id: rid('n'), text, internal: b.note.internal !== false, by, at: Date.now() }].slice(-100) };
      }
      if (b.attachment?.url) {
        const url = String(b.attachment.url);
        if (!/^https:\/\//i.test(url)) return { error: 'Attachment must be an https storage URL.' };
        const kind = ['image', 'video', 'file'].includes(b.attachment.kind) ? b.attachment.kind : 'image';
        nt = { ...nt, attachments: [...nt.attachments, { id: rid('a'), url: url.slice(0, 1000), kind, ...(b.attachment.name ? { name: String(b.attachment.name).slice(0, 80) } : {}), ...(b.attachment.lineId ? { lineId: String(b.attachment.lineId) } : {}), by, at: Date.now(), visibleToCustomer: b.attachment.visibleToCustomer !== false }].slice(-60) };
        nt = audit(nt, { by, type: 'ATTACH', detail: kind });
      }
      if (b.removeAttachmentId) nt = { ...nt, attachments: nt.attachments.filter(a => a.id !== b.removeAttachmentId) };
      if (b.timer === 'start' || b.timer === 'stop') {
        const x = b.timer === 'start' ? startTimer(nt, { id: rid('tm'), staffId: actor.staffId, staffName: actor.staffName, lineId: b.lineId ? String(b.lineId) : undefined }) : stopTimer(nt, actor.staffId);
        if (x.error || !x.ticket) return { error: x.error };
        nt = x.ticket;
      }
      return { ticket: nt };
    });
    reply(res, r);
  });

  wrap('line', async (req, res, { businessUid, actor }) => {
    const b = req.body || {}; const by = byOf(actor);
    const r = await mutate(String(b.ticketId || ''), businessUid, (t, cfg) => {
      if (t.saleOrderId) return { error: 'This ticket is already paid.' };
      const kind = stageKind(cfg, t.stage);
      if (kind === 'DONE' || kind === 'CANCELLED') return { error: 'This ticket is closed.' };
      let nt = t;
      if (b.op === 'add') {
        if (t.lines.length >= 80) return { error: 'Too many lines on one ticket.' };
        const cl = cleanLine(cfg, b.line, rid('l'));
        if (!cl.line) return { error: cl.error };
        // Scope added after work started must be approved again (requireApproval packs): cleanLine already sets PENDING.
        nt = audit({ ...t, lines: [...t.lines, cl.line] }, { by, type: 'LINE', detail: `+ ${cl.line.description}` });
      } else if (b.op === 'edit' || b.op === 'remove') {
        const cur = t.lines.find(l => l.id === b.lineId);
        if (!cur) return { error: 'Line not found.' };
        if (b.op === 'remove') nt = audit({ ...t, lines: t.lines.filter(l => l.id !== cur.id) }, { by, type: 'LINE', detail: `- ${cur.description}` });
        else {
          const cl = cleanLine(cfg, { ...cur, ...b.line }, cur.id);
          if (!cl.line) return { error: cl.error };
          // Changing price/qty of an approved line re-opens approval (customer agreed to the OLD number).
          const money = cl.line.unitPriceCents !== cur.unitPriceCents || cl.line.qty !== cur.qty;
          const line = { ...cl.line, approval: money && cur.approval !== 'PENDING' && cfg.requireApproval ? ('PENDING' as const) : cur.approval };
          nt = audit({ ...t, lines: t.lines.map(l => (l.id === cur.id ? line : l)) }, { by, type: 'LINE', detail: `~ ${line.description}${line.approval !== cur.approval ? ' (re-approval needed)' : ''}` });
        }
      } else if (b.op === 'decide') {   // staff records a verbal / in-person decision
        if (!cfg.requireApproval) return { error: 'This pipeline does not need approvals.' };
        const dec: Record<string, 'APPROVED' | 'DECLINED'> = {};
        for (const [id, v] of Object.entries(b.decisions || {})) if (v === 'APPROVED' || v === 'DECLINED') dec[id] = v;
        const x = decideLines(t, dec, { ip: String(req.ip || ''), consentText: String(b.consentNote || 'Recorded by staff (verbal/in person)').slice(0, 200), via: 'STAFF', by });
        if (!x.applied) return { error: 'Nothing to decide.' };
        nt = x.ticket;
      } else return { error: 'Unknown line operation.' };
      return { ticket: nt };
    });
    reply(res, r);
  });

  wrap('transition', async (req, res, { businessUid, actor }) => {
    const b = req.body || {}; const by = byOf(actor); const to = String(b.to || '');
    let overrideBy = '';
    if (b.override) {
      if (actor.perms.has('DISCOUNT_OVERRIDE')) overrideBy = by;
      else { const m = await d.managerApproval(businessUid, b.managerPin); if (!m) return res.status(403).json({ error: 'An override needs a manager PIN.', code: 'MANAGER_PIN' }); overrideBy = m.name; }
    }
    const r = await mutate(String(b.ticketId || ''), businessUid, (t, cfg, tax) => {
      const chk = canTransition(t, cfg, to, { override: !!overrideBy, tax });
      if (chk.ok === false) return { error: chk.error, code: chk.canOverride ? `OVERRIDABLE_${chk.code}` : chk.code, status: 409 };
      return { ticket: applyTransition(t, cfg, to, overrideBy && chk.overridden ? `${by} (override: ${overrideBy})` : by, { overridden: chk.overridden, reason: b.reason ? String(b.reason).slice(0, 200) : undefined }), extra: { from: t.stage } };
    });
    if (r.ok && shouldNotify(r.cfg, to)) {
      const sent = await notifyCustomer(req, r.ticket, r.cfg, to);
      if (stageKind(r.cfg, to) === 'AWAITING_APPROVAL') await mutate(r.ticket.id, businessUid, t => ({ ticket: { ...t, estimateSentAt: Date.now() } })).catch(() => {});
      return reply(res, r, { notified: sent });
    }
    reply(res, r);
  });

  wrap('deposit', async (req, res, { businessUid, actor }) => {
    const b = req.body || {};
    const r = await mutate(String(b.ticketId || ''), businessUid, t => addDeposit(t, { id: rid('d'), amountCents: b.amountCents, method: b.method, reference: b.reference, by: byOf(actor) }));
    reply(res, r);
  });

  // Customer link (re-)issue. rotate:true revokes every earlier link for this ticket.
  wrap('link', async (req, res, { businessUid }) => {
    const id = String(req.body?.ticketId || '');
    const r = req.body?.rotate ? await mutate(id, businessUid, t => ({ ticket: { ...t, linkVersion: t.linkVersion + 1 } })) : null;
    const ticket = r ? (r.ok ? r.ticket : null) : (await load(id))?.ticket;
    if (!ticket || ticket.businessUid !== businessUid) return res.status(404).json({ error: 'Ticket not found.' });
    res.json({ link: `${baseUrl(req)}/t/${makeToken(ticket)}` });
  });

  // ── Public customer page ────────────────────────────────────────────────────────────────────────
  const pubGet = d.rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false, message: 'Too many requests.' });
  const pubPost = d.rateLimit({ windowMs: 10 * 60_000, max: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts. Try again later.' } });
  const noStore = (res: any) => { res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Robots-Tag', 'noindex, nofollow'); res.setHeader('Referrer-Policy', 'no-referrer'); };
  const resolveToken = async (tok: string) => {
    const v = verifyToken(tok); if (!v) return null;
    const r = await load(v.ticketId);
    return r && r.ticket.linkVersion === v.version ? r : null;
  };

  app.get('/t/:token', pubGet, async (req: any, res: any) => {
    noStore(res);
    try {
      const r = await resolveToken(String(req.params.token));
      if (!r) return res.status(404).type('html').send(renderTicketMessagePage('Link not found', 'This link is not valid or has been replaced. Please ask the shop for a new one.'));
      const tax = (await d.loadRegisterSettings(r.ticket.businessUid)).tax;
      const view = toPublicView(r.ticket, r.cfg, await businessName(r.ticket.businessUid), tax);
      res.type('html').send(renderTicketPage(view, { token: String(req.params.token), extraHtml: await renderTicketPageExtras(r.ticket, r.cfg) }));
    } catch (err: any) { console.error('/t/:token', err?.message || err); res.status(500).type('html').send(renderTicketMessagePage('Something went wrong', 'Please try again in a moment.')); }
  });

  app.post('/t/:token/decide', pubPost, express.json({ limit: '8kb' }), async (req: any, res: any) => {
    noStore(res);
    try {
      const found = await resolveToken(String(req.params.token));
      if (!found) return res.status(404).json({ error: 'This link is not valid.' });
      const raw = req.body?.decisions;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return res.status(400).json({ error: 'Choose approve or decline for each item.' });
      const dec: Record<string, 'APPROVED' | 'DECLINED'> = {};
      for (const [id, v] of Object.entries(raw)) if (v === 'APPROVED' || v === 'DECLINED') dec[String(id).slice(0, 60)] = v;
      if (!Object.keys(dec).length) return res.status(400).json({ error: 'Choose approve or decline for each item.' });
      const ip = String(req.ip || req.socket?.remoteAddress || '').slice(0, 64);
      const r = await mutate(found.ticket.id, found.ticket.businessUid, (t, cfg) => {
        if (t.linkVersion !== found.ticket.linkVersion) return { error: 'This link is no longer valid.', status: 410 };
        if (stageKind(cfg, t.stage) !== 'AWAITING_APPROVAL') return { error: 'This estimate is not waiting for approval.', status: 409 };
        const x = decideLines(t, dec, { ip, consentText: cfg.consentText || DEFAULT_CONSENT, via: 'LINK' });
        if (!x.applied) return { error: 'Those items were already decided.', status: 409 };
        let nt = x.ticket;
        const to = stageAfterDecision(nt, cfg);
        if (to) nt = applyTransition(nt, cfg, to, 'customer', { reason: 'customer decision via link' });
        return { ticket: nt, extra: { pendingLeft: x.pendingLeft } };
      });
      if (r.ok === false) return res.status(r.status).json({ error: r.error });
      // Tell the shop (in-app).
      d.firestoreCreate('notifications', { userId: r.ticket.businessUid, senderId: 'plajah-tickets', senderName: 'Tickets', senderPhoto: '', type: 'SYSTEM', title: `${r.ticket.number}: customer answered`, message: `${r.ticket.customer.name} responded to the estimate. Now: ${stageById(r.cfg, r.ticket.stage)?.label}.`, targetId: r.ticket.id, isRead: false, timestamp: Date.now() }).catch(() => {});
      res.json({ ok: true, stage: stageById(r.cfg, r.ticket.stage)?.label });
    } catch (err: any) { console.error('/t/:token/decide', err?.message || err); res.status(500).json({ error: 'Could not save your answer.' }); }
  });

  // ── Hooks for pos-sale ──────────────────────────────────────────────────────────────────────────
  ticketSaleHooks.prepare = async (businessUid, ticketId) => {
    const r = await load(ticketId);
    if (!r || r.ticket.businessUid !== businessUid) return { ok: false, status: 404, error: 'Ticket not found.' };
    const { ticket, cfg } = r; const kind = stageKind(cfg, ticket.stage);
    if (ticket.saleOrderId) return { ok: false, status: 409, error: 'This ticket is already paid.', code: 'TICKET_PAID' };
    if (kind === 'CANCELLED' || kind === 'DONE') return { ok: false, status: 409, error: 'This ticket is closed.', code: 'TICKET_CLOSED' };
    const tot = computeTicketTotals(ticket, cfg);
    if (cfg.requireApproval && tot.pendingCount) return { ok: false, status: 409, error: 'Some lines are still waiting for approval.', code: 'TICKET_UNAPPROVED' };
    const lines = saleLines(ticket, cfg);
    if (!lines.length) return { ok: false, status: 400, error: 'No approved lines to charge.', code: 'TICKET_EMPTY' };
    return { ok: true, prep: { ticket, cfg, lines, depositsCents: tot.depositsCents } };
  };
  ticketSaleHooks.merge = (priced, prep) => {
    const products = new Map(priced.products); const lines = [...priced.lines]; let sub = priced.subtotalCents;
    for (const l of prep.lines) {
      const productId = `tkt:${l.ref.split(':').slice(1).join(':')}`;
      products.set(productId, { taxClass: l.taxClass, snapEligible: false });
      lines.push({ productId, variantId: null, title: l.title, qty: 1, unitAmount: l.unitAmount, variantName: null });
      sub += l.unitAmount;
    }
    return { lines, products, subtotalCents: sub };
  };
  ticketSaleHooks.credit = (prep, total) => Math.max(0, Math.min(prep.depositsCents, total));
  ticketSaleHooks.claim = async (prep, orderId, by) => {
    const r = await mutate(prep.ticket.id, prep.ticket.businessUid, t => (t.saleOrderId ? { error: 'already paid', status: 409 } : { ticket: audit({ ...t, saleOrderId: orderId }, { by, type: 'PAYMENT', detail: `sale ${orderId} started` }) }));
    return r.ok;
  };
  ticketSaleHooks.release = async (prep, orderId) => {
    await mutate(prep.ticket.id, prep.ticket.businessUid, t => (t.saleOrderId === orderId ? { ticket: audit({ ...t, saleOrderId: undefined }, { by: 'system', type: 'PAYMENT', detail: `sale ${orderId} failed, claim released` }) } : { error: 'not ours' })).catch(() => {});
  };
  ticketSaleHooks.finalize = async (prep, orderId, a) => {
    await mutate(prep.ticket.id, prep.ticket.businessUid, (t, cfg) => {
      let nt: Ticket = audit({ ...t, saleOrderId: orderId, paidAt: Date.now(), paidCents: a.paidCents + a.creditCents }, { by: a.by, type: 'PAYMENT', detail: `paid $${(a.paidCents / 100).toFixed(2)} (+$${(a.creditCents / 100).toFixed(2)} deposit) order ${orderId}` });
      // Paying at pickup completes the ticket: READY -> the DONE stage when the pipeline allows it.
      if (stageKind(cfg, nt.stage) === 'READY') { const done = stageOfKind(cfg, 'DONE'); if (done && allowedNext(cfg, nt.stage).includes(done.id)) nt = applyTransition(nt, cfg, done.id, a.by, { reason: 'paid at register' }); }
      return { ticket: nt };
    }).catch((e: any) => console.error('[tickets] finalize failed', e?.message));
    // Inventory-linked parts leave stock now (custom lines never touch inventory).
    const parts = prep.lines.filter(l => l.productId).map(l => ({ productId: l.productId, variantId: null, qty: Math.max(1, Math.ceil(l.partQty)) }));
    if (parts.length) await d.applyStockSale(parts, { orderId, sellerId: prep.ticket.businessUid, reason: 'POS_SALE', by: a.by }).catch(() => {});
  };
  ticketSaleHooks.orderFields = (prep, credit) => ({ ticketId: prep.ticket.id, ticketNumber: prep.ticket.number, depositCreditCents: credit });
}
