// eviteServer — Express routes for Plajah Evites. Registered from server.ts with ONE call; every server helper it
// needs is injected (`EviteDeps`), so this file has no dependency on server.ts internals (same shape as ticketServer).
//
//  Host routes    POST /api/evite/{save,mine,guests,remove-rsvp,remove-note}   Firebase auth, owner / co-host only
//  Public routes  GET  /api/evite/:id/public     POST /api/evite/:id/{rsvp,wall,gift}
//                 GET  /api/evite/:id/ics        GET  /api/evite/:id/qr.svg      GET /i/:id (SPA shell + link preview tags)
//
// Guests never sign in. A guest's RSVP is edited with a random token handed back once and kept on their device
// (only its SHA-256 is stored). Data is read/written with the server's Firestore REST helpers, so no Firestore
// rules change is needed: the browser never touches these collections.
//
// Collections (flat docs; the full object is JSON in `json`, indexable keys beside it):
//   evites/{id}            ownerUid, status, json
//   evite_rsvps/{id}       inviteId, tokenHash, json
//   evite_wall/{id}        inviteId, json
//   evite_gifts/{session}  inviteId, amountCents, ...   (written by the Stripe webhook; Stripe Checkout, no platform cut)
import nodeCrypto from 'node:crypto';
import QRCode from 'qrcode';
import { grossUpCents } from '../giftFees';
import {
  newShortId, isShortId, clampStr, cleanFields, cleanSettings, cleanQuestions, cleanBringList, cleanGifts, cleanLook, safeHttpUrl,
  checkRsvp, applyCapacity, cleanHost, dueForReminder, reminderEmail, isEmail, confirmedHeadcount, promoteWaitlist, isClosed, toPublicView, buildIcs, summarize, partySize, rsvpsToCsv,
} from './eviteCore';
import { DEFAULT_GIFTS, DEFAULT_SETTINGS, type EviteDoc, type EviteRsvp, type EviteWallNote } from './eviteTypes';
import { isPlateId, plateUrls, plateOgUrl } from './plateCatalog';
import { isEraId } from './eraIds';

type Row = Record<string, any>;
export interface EviteDeps {
  app: any; express: any; rateLimit: any; authMiddleware: any;
  firestoreRead: (c: string, id: string) => Promise<Row | null>;
  firestoreWrite: (c: string, id: string, data: object, requireSuccess?: boolean) => Promise<any>;
  firestoreCreateOnce: (c: string, id: string, data: Row) => Promise<'created' | 'exists' | 'error'>;
  firestoreDeleteDoc: (c: string, id: string) => Promise<void>;
  fsQueryDocs: (c: string, f: Array<{ field: string; op: string; value: any }>, n?: number) => Promise<Array<{ id: string; data: Row }>>;
  getStripe: () => any;
  trustedRequestOrigin: (req: any) => string;
  /** Reads dist/index.html for the link-preview shell; undefined in dev (Vite serves the shell). */
  readIndexHtml?: () => Promise<string | null>;
  /** Email lane for reminders (Resend in server.ts). Returns true when accepted. */
  sendEmail?: (to: string, subject: string, text: string) => Promise<boolean>;
  /** Cron auth (x-cron-key), same secret as the other /api/cron jobs. */
  cronAuthorized?: (req: any) => boolean;
  /** Creator themes (services/evite/eviteThemeServer.ts): may this host use a non-catalogue design id ("theme:<id>")? */
  mayUseTemplate?: (uid: string, templateId: string) => Promise<boolean>;
  /** Creator themes: the art for a non-catalogue design id, attached to the guest view as `art`. */
  resolveArt?: (templateId: string) => Promise<EviteArt | null>;
}
export interface EviteArt { plate: string; depth?: string; thumb?: string; preset: string; foil?: string; voice?: string; light?: boolean }

const MAX_RSVPS = 2000;
const hashToken = (t: string) => nodeCrypto.createHash('sha256').update(t).digest('hex');
const esc = (s: any) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
const parse = <T,>(row: Row | null | undefined): T | null => { try { return row?.json ? JSON.parse(row.json) as T : null; } catch { return null; } };

export function registerEviteRoutes(d: EviteDeps) {
  const { app, express } = d;
  const jsonBody = express.json({ limit: '64kb' });
  // Public write limiter: generous for a household on one wifi, hard on scripts.
  const writeLimiter = d.rateLimit({ windowMs: 10 * 60 * 1000, max: 40, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many tries. Give it a minute and try again.' } });
  const readLimiter = d.rateLimit({ windowMs: 60 * 1000, max: 240, standardHeaders: true, legacyHeaders: false, message: { error: 'Slow down a little.' } });

  const loadInvite = async (id: string): Promise<EviteDoc | null> => isShortId(id) ? parse<EviteDoc>(await d.firestoreRead('evites', id)) : null;
  const loadRsvps = async (id: string): Promise<EviteRsvp[]> => (await d.fsQueryDocs('evite_rsvps', [{ field: 'inviteId', op: 'EQUAL', value: id }], MAX_RSVPS)).map(r => parse<EviteRsvp>(r.data)).filter(Boolean) as EviteRsvp[];
  const loadWall = async (id: string): Promise<EviteWallNote[]> => ((await d.fsQueryDocs('evite_wall', [{ field: 'inviteId', op: 'EQUAL', value: id }], 100)).map(r => parse<EviteWallNote>(r.data)).filter(Boolean) as EviteWallNote[]).sort((a, b) => b.createdAt - a.createdAt);
  const saveInvite = (inv: EviteDoc) => d.firestoreWrite('evites', inv.id, { ownerUid: inv.ownerUid, status: inv.status, json: JSON.stringify(inv) }, true);
  const isHost = (inv: EviteDoc, uid: string) => inv.ownerUid === uid || inv.coHostUids.includes(uid);
  const hostStripe = async (uid: string): Promise<string | undefined> => (await d.firestoreRead('users', uid))?.stripeConnectAccountId || undefined;
  const raised = async (id: string) => (await d.fsQueryDocs('evite_gifts', [{ field: 'inviteId', op: 'EQUAL', value: id }], 1000)).reduce((n, r) => n + (Number(r.data.amountCents) || 0), 0);

  const viewFor = async (inv: EviteDoc, token?: string) => {
    const [rsvps, wall, acct] = await Promise.all([loadRsvps(inv.id), loadWall(inv.id), inv.gifts?.enabled ? hostStripe(inv.ownerUid) : Promise.resolve(undefined)]);
    const mine = token ? await d.firestoreRead('evite_rsvps', `${inv.id}_${hashToken(token).slice(0, 20)}`) : null;
    const me = parse<EviteRsvp>(mine);
    const view: any = toPublicView(inv, rsvps, wall, { viewerStatus: me?.status, raisedCents: inv.gifts?.goalCents ? await raised(inv.id) : 0, stripeReady: !!acct });
    if (!isPlateId(inv.templateId) && !isEraId(inv.templateId) && d.resolveArt) view.art = await d.resolveArt(inv.templateId).catch(() => null);
    return { view, me: me ? { name: me.name, status: me.status, adults: me.adults, kids: me.kids, note: me.note, answers: me.answers, bringing: me.bringing } : null };
  };

  // ── Host: create / update ──────────────────────────────────────────────────
  app.post('/api/evite/save', d.authMiddleware, jsonBody, async (req: any, res: any) => {
    try {
      const b = req.body || {};
      const now = Date.now();
      let inv: EviteDoc | null = null;
      if (b.id) {
        inv = await loadInvite(String(b.id));
        if (!inv) return res.status(404).json({ error: 'That invite no longer exists.' });
        if (!isHost(inv, req.uid)) return res.status(403).json({ error: 'Only the host can change this invite.' });
      }
      const templateId = clampStr(b.templateId || inv?.templateId, 60);
      // An unchanged design is never re-checked: a host whose theme licence lapsed (or was passed on) can still edit their invite.
      if (!templateId || !(isPlateId(templateId) || isEraId(templateId) || templateId === inv?.templateId || (d.mayUseTemplate && await d.mayUseTemplate(req.uid, templateId)))) return res.status(400).json({ error: 'Pick a design first, or one you have the rights to use.' });
      const next: EviteDoc = {
        id: inv?.id || '', ownerUid: inv?.ownerUid || req.uid, coHostUids: Array.isArray(b.coHostUids) ? b.coHostUids.map((x: any) => clampStr(x, 40)).filter(Boolean).slice(0, 5) : (inv?.coHostUids || []),
        templateId, fields: cleanFields(b.fields || {}, inv?.fields), look: cleanLook(b.look, inv?.look), settings: cleanSettings(b.settings, inv?.settings || DEFAULT_SETTINGS),
        questions: b.questions === undefined ? (inv?.questions || []) : cleanQuestions(b.questions),
        bringList: b.bringList === undefined ? (inv?.bringList || []) : cleanBringList(b.bringList, inv?.bringList),
        gifts: cleanGifts(b.gifts, inv?.gifts || DEFAULT_GIFTS),
        photoUrl: b.photoUrl === undefined ? inv?.photoUrl : safeHttpUrl(b.photoUrl) || undefined,
        // The invite's own link preview, rendered by the host's browser into THEIR Storage folder for THIS invite only.
        ogImage: b.ogImage === undefined ? (templateId === inv?.templateId ? inv?.ogImage : undefined) : (inv && isOwnOgUrl(b.ogImage, inv.ownerUid, inv.id) ? b.ogImage : undefined),
        ogSig: b.ogSig === undefined ? inv?.ogSig : clampStr(b.ogSig, 1500) || undefined,
        registryUrl: b.registryUrl === undefined ? inv?.registryUrl : safeHttpUrl(b.registryUrl) || undefined,
        eventId: b.eventId === undefined ? inv?.eventId : clampStr(b.eventId, 80) || undefined,
        photoPoolId: b.photoPoolId === undefined ? inv?.photoPoolId : clampStr(b.photoPoolId, 80) || undefined,
        clubId: b.clubId === undefined ? inv?.clubId : clampStr(b.clubId, 80) || undefined,
        clubInvite: b.clubInvite === undefined ? inv?.clubInvite : clampStr(b.clubInvite, 40) || undefined,
        host: b.host === undefined ? inv?.host : cleanHost(b.host),
        planDone: Array.isArray(b.planDone) ? b.planDone.map((x: any) => clampStr(x, 30)).filter(Boolean).slice(0, 60) : inv?.planDone,
        chatChannelId: b.chatChannelId === undefined ? inv?.chatChannelId : clampStr(b.chatChannelId, 80) || undefined,
        status: ['draft', 'live', 'closed', 'cancelled'].includes(b.status) ? b.status : (inv?.status || 'draft'),
        createdAt: inv?.createdAt || now, updatedAt: now, sentCount: inv?.sentCount || 0, viewCount: inv?.viewCount || 0,
      };
      if (!next.fields.headline) return res.status(400).json({ error: 'Give the invitation a headline.' });
      if (!inv) {
        for (let i = 0; i < 6 && !next.id; i++) {
          const id = newShortId(8);
          const r = await d.firestoreCreateOnce('evites', id, { ownerUid: next.ownerUid, status: next.status, json: JSON.stringify({ ...next, id }) });
          if (r === 'created') next.id = id; else if (r === 'error') return res.status(500).json({ error: 'Could not save the invite. Try again.' });
        }
        if (!next.id) return res.status(500).json({ error: 'Could not save the invite. Try again.' });
        await saveInvite(next);
      } else await saveInvite(next);
      res.json({ invite: next });
    } catch (err: any) { console.error('/api/evite/save', err?.message || err); res.status(500).json({ error: 'Could not save the invite.' }); }
  });

  app.post('/api/evite/mine', d.authMiddleware, jsonBody, async (req: any, res: any) => {
    try {
      const rows = await d.fsQueryDocs('evites', [{ field: 'ownerUid', op: 'EQUAL', value: req.uid }], 200);
      const invites = rows.map(r => parse<EviteDoc>(r.data)).filter(Boolean) as EviteDoc[];
      const out = await Promise.all(invites.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 100).map(async inv => ({ invite: inv, counts: summarize(await loadRsvps(inv.id), inv.settings) })));
      res.json({ items: out });
    } catch (err: any) { console.error('/api/evite/mine', err?.message || err); res.status(500).json({ error: 'Could not load your invites.' }); }
  });

  app.post('/api/evite/guests', d.authMiddleware, jsonBody, async (req: any, res: any) => {
    try {
      const inv = await loadInvite(String(req.body?.id || ''));
      if (!inv) return res.status(404).json({ error: 'Not found.' });
      if (!isHost(inv, req.uid)) return res.status(403).json({ error: 'Only the host can see replies.' });
      const [rsvps, wall] = await Promise.all([loadRsvps(inv.id), loadWall(inv.id)]);
      const sorted = rsvps.sort((a, b) => b.updatedAt - a.updatedAt);
      res.json({ rsvps: sorted, wall, counts: summarize(rsvps, inv.settings), raisedCents: await raised(inv.id), csv: req.body?.csv ? rsvpsToCsv(sorted, inv.questions, inv.bringList) : undefined });
    } catch (err: any) { console.error('/api/evite/guests', err?.message || err); res.status(500).json({ error: 'Could not load replies.' }); }
  });

  app.post('/api/evite/remove-rsvp', d.authMiddleware, jsonBody, async (req: any, res: any) => {
    try {
      const inv = await loadInvite(String(req.body?.id || ''));
      if (!inv || !isHost(inv, req.uid)) return res.status(403).json({ error: 'Only the host can do that.' });
      const rid = clampStr(req.body?.rsvpId, 80);
      if (!rid.startsWith(`${inv.id}_`)) return res.status(400).json({ error: 'Bad reply id.' });
      await d.firestoreDeleteDoc('evite_rsvps', rid);
      await promoteAndSave(inv);
      res.json({ ok: true });
    } catch (err: any) { console.error('/api/evite/remove-rsvp', err?.message || err); res.status(500).json({ error: 'Could not remove that reply.' }); }
  });

  app.post('/api/evite/remove-note', d.authMiddleware, jsonBody, async (req: any, res: any) => {
    try {
      const inv = await loadInvite(String(req.body?.id || ''));
      if (!inv || !isHost(inv, req.uid)) return res.status(403).json({ error: 'Only the host can do that.' });
      const nid = clampStr(req.body?.noteId, 80);
      if (!nid.startsWith(`${inv.id}_`)) return res.status(400).json({ error: 'Bad note id.' });
      await d.firestoreDeleteDoc('evite_wall', nid);
      res.json({ ok: true });
    } catch (err: any) { console.error('/api/evite/remove-note', err?.message || err); res.status(500).json({ error: 'Could not remove that note.' }); }
  });

  /** After a spot opens up, move waitlisted guests (oldest first) whose party fits. */
  async function promoteAndSave(inv: EviteDoc) {
    const all = await loadRsvps(inv.id);
    for (const id of promoteWaitlist(all, inv.settings)) {
      const r = all.find(x => x.id === id); if (!r) continue;
      r.status = 'yes'; r.updatedAt = Date.now();
      await d.firestoreWrite('evite_rsvps', r.id, { inviteId: inv.id, json: JSON.stringify(r) });
    }
  }

  // ── Public ─────────────────────────────────────────────────────────────────
  app.get('/api/evite/:id/public', readLimiter, async (req: any, res: any) => {
    try {
      const inv = await loadInvite(req.params.id);
      if (!inv || inv.status === 'draft') return res.status(404).json({ error: 'This invitation isn’t available.' });
      const token = typeof req.query.t === 'string' ? req.query.t.slice(0, 64) : undefined;
      const { view, me } = await viewFor(inv, token);
      res.set('Cache-Control', 'no-store').json({ invite: view, me });
    } catch (err: any) { console.error('/api/evite/public', err?.message || err); res.status(500).json({ error: 'Could not open this invitation.' }); }
  });

  app.post('/api/evite/:id/rsvp', writeLimiter, jsonBody, async (req: any, res: any) => {
    try {
      const inv = await loadInvite(req.params.id);
      if (!inv || inv.status === 'draft') return res.status(404).json({ error: 'This invitation isn’t available.' });
      const supplied = typeof req.body?.token === 'string' ? req.body.token.slice(0, 64) : '';
      const existingId = supplied ? `${inv.id}_${hashToken(supplied).slice(0, 20)}` : '';
      const existing = existingId ? parse<EviteRsvp>(await d.firestoreRead('evite_rsvps', existingId)) : null;
      // A closed invite still lets an existing guest change to "no", so nobody is stuck holding a spot.
      if (isClosed(inv) && !(existing && req.body?.status === 'no')) return res.status(409).json({ error: inv.status === 'cancelled' ? 'This event was cancelled.' : 'The host has closed replies.' });
      const check = checkRsvp(req.body || {}, inv);
      if (check.ok === false) return res.status(400).json({ error: check.error });
      const all = await loadRsvps(inv.id);
      if (!existing && all.length >= MAX_RSVPS) return res.status(409).json({ error: 'This invitation has reached its reply limit.' });
      const v = check.value;
      const party = v.adults + v.kids;
      const cap = applyCapacity(v.status, party, inv.settings, confirmedHeadcount(all, existing?.id));
      if (cap.error) return res.status(409).json({ error: cap.error });
      const token = existing ? supplied : nodeCrypto.randomBytes(12).toString('base64url');
      const id = existing ? existing.id : `${inv.id}_${hashToken(token).slice(0, 20)}`;
      const now = Date.now();
      const rsvp: EviteRsvp = { ...v, status: cap.status, id, inviteId: inv.id, createdAt: existing?.createdAt || now, updatedAt: now };
      // Bring-list claims: first come, first served; a taken item is silently dropped from this guest's answer.
      const claimed = new Set(inv.bringList.filter(b => b.claimedBy && b.claimedBy !== id).map(b => b.id));
      rsvp.bringing = (rsvp.bringing || []).filter(x => !claimed.has(x));
      if (!rsvp.bringing.length) delete rsvp.bringing;
      await d.firestoreWrite('evite_rsvps', id, { inviteId: inv.id, tokenHash: hashToken(token), json: JSON.stringify(rsvp) }, true);
      if (inv.bringList.length) {
        inv.bringList = inv.bringList.map(b => b.claimedBy === id && !(rsvp.bringing || []).includes(b.id) ? { ...b, claimedBy: undefined, claimedName: undefined } : (rsvp.bringing || []).includes(b.id) ? { ...b, claimedBy: id, claimedName: rsvp.name } : b);
        await d.firestoreWrite('evites', inv.id, { json: JSON.stringify(inv) });
      }
      if (existing && partySize(existing) > partySize(rsvp)) await promoteAndSave(inv);
      const { view, me } = await viewFor(inv, token);
      res.json({ token, status: rsvp.status, waitlisted: rsvp.status === 'waitlist', invite: view, me });
    } catch (err: any) { console.error('/api/evite/rsvp', err?.message || err); res.status(500).json({ error: 'We couldn’t save your reply. Please try again.' }); }
  });

  app.post('/api/evite/:id/wall', writeLimiter, jsonBody, async (req: any, res: any) => {
    try {
      const inv = await loadInvite(req.params.id);
      if (!inv || inv.status === 'draft' || !inv.settings.guestWall) return res.status(404).json({ error: 'Notes are turned off for this invitation.' });
      const name = clampStr(req.body?.name, 40), text = clampStr(req.body?.text, 280);
      if (!name || !text) return res.status(400).json({ error: 'Add your name and a note.' });
      if (/https?:\/\/|www\./i.test(text)) return res.status(400).json({ error: 'Links aren’t allowed in notes.' });
      const note: EviteWallNote = { id: `${inv.id}_${Date.now().toString(36)}${nodeCrypto.randomBytes(3).toString('hex')}`, inviteId: inv.id, name, text, createdAt: Date.now() };
      await d.firestoreWrite('evite_wall', note.id, { inviteId: inv.id, json: JSON.stringify(note) }, true);
      res.json({ note });
    } catch (err: any) { console.error('/api/evite/wall', err?.message || err); res.status(500).json({ error: 'Could not post your note.' }); }
  });

  // Gift via Stripe Checkout. No platform cut: the guest may cover Stripe's processing fee (default on) so the host
  // receives the full gift; the fee rides as application_fee on the destination charge (same math as church giving).
  app.post('/api/evite/:id/gift', writeLimiter, jsonBody, async (req: any, res: any) => {
    try {
      const inv = await loadInvite(req.params.id);
      if (!inv || inv.status === 'draft' || !inv.gifts?.enabled || !inv.gifts.stripe) return res.status(404).json({ error: 'Gifts aren’t turned on for this invitation.' });
      const acct = await hostStripe(inv.ownerUid);
      if (!acct) return res.status(409).json({ error: 'The host hasn’t finished setting up card payments yet. Try Cash App or Zelle below.' });
      const giftCents = Math.floor(Number(req.body?.amountCents));
      if (!Number.isFinite(giftCents) || giftCents < 100 || giftCents > 100000) return res.status(400).json({ error: 'Choose an amount between $1 and $1,000.' });
      const cover = req.body?.coverFees !== false;
      const m = grossUpCents(giftCents, { rate: process.env.STRIPE_FEE_RATE ? Number(process.env.STRIPE_FEE_RATE) : undefined, fixedCents: process.env.STRIPE_FEE_FIXED_CENTS ? Number(process.env.STRIPE_FEE_FIXED_CENTS) : undefined });
      const feeCovered = cover ? m.feeCents : 0;
      const charge = cover ? m.grossCents : m.giftCents;
      const origin = d.trustedRequestOrigin(req);
      const name = clampStr(req.body?.name, 40), note = clampStr(req.body?.note, 200);
      const meta = { type: 'evite_gift', inviteId: inv.id, hostUid: inv.ownerUid, giftCents: String(m.giftCents), feeCoveredCents: String(feeCovered), fromName: name, note };
      const session = await d.getStripe().checkout.sessions.create({
        mode: 'payment', payment_method_types: ['card'],
        line_items: [{ price_data: { currency: 'usd', product_data: { name: `Gift for ${inv.fields.honoree || inv.fields.hostName || inv.fields.headline}` }, unit_amount: charge }, quantity: 1 }],
        payment_intent_data: { metadata: meta, transfer_data: { destination: acct }, ...(feeCovered ? { application_fee_amount: feeCovered } : {}) },
        metadata: meta,
        success_url: `${origin}/i/${inv.id}?gift=thanks`, cancel_url: `${origin}/i/${inv.id}`,
      });
      res.json({ url: session.url, giftCents: m.giftCents, feeCents: feeCovered, totalCents: charge });
    } catch (err: any) { console.error('/api/evite/gift', err?.message || err); res.status(500).json({ error: 'Could not start the gift checkout.' }); }
  });

  app.get('/api/evite/:id/ics', readLimiter, async (req: any, res: any) => {
    const inv = await loadInvite(req.params.id);
    if (!inv || inv.status === 'draft') return res.status(404).send('Not found');
    const url = `${d.trustedRequestOrigin(req)}/i/${inv.id}`;
    // The address stays out of the calendar file until the guest has said yes, when the host asked for that.
    const f = inv.settings.revealAddressAfterYes ? { ...inv.fields, address: '' } : inv.fields;
    res.set({ 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': `attachment; filename="${inv.id}.ics"`, 'Cache-Control': 'public, max-age=300' }).send(buildIcs(f, url, inv.id));
  });

  // QR for the invite link (default) or its linked ticketed event (?to=event). SVG so it prints at any size.
  app.get('/api/evite/:id/qr.svg', readLimiter, async (req: any, res: any) => {
    const inv = await loadInvite(req.params.id);
    if (!inv || inv.status === 'draft') return res.status(404).send('Not found');
    const origin = d.trustedRequestOrigin(req);
    const target = req.query.to === 'event' && inv.eventId ? `${origin}/event/${encodeURIComponent(inv.eventId)}` : `${origin}/i/${inv.id}`;
    const qr = QRCode.create(target, { errorCorrectionLevel: 'Q' });
    const n = qr.modules.size, side = n + 8;
    let path = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.modules.get(r, c)) path += `M${c + 4} ${r + 4}h1v1h-1z`;
    res.set({ 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600' }).send(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" shape-rendering="crispEdges" role="img" aria-label="QR code for the invitation"><rect width="${side}" height="${side}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`);
  });

  // Daily reminder pass (Cloud Scheduler → POST /api/evite/cron/reminders with x-cron-key).
  app.post('/api/evite/cron/reminders', jsonBody, async (req: any, res: any) => {
    if (!d.cronAuthorized?.(req)) return res.status(401).json({ error: 'Unauthorized' });
    try { res.json(await runEviteReminders(d, d.trustedRequestOrigin(req))); }
    catch (err: any) { console.error('/api/evite/cron/reminders', err?.message || err); res.status(500).json({ error: 'Reminder run failed.' }); }
  });

  // The page itself: the app shell plus the tags link previews (iMessage, WhatsApp, Slack) read.
  app.get('/i/:id', readLimiter, async (req: any, res: any, next: any) => {
    try {
      const html = d.readIndexHtml ? await d.readIndexHtml() : null;
      if (!html) return next();
      const inv = await loadInvite(req.params.id);
      if (!inv || inv.status === 'draft') return res.status(404).type('html').send(html);
      const origin = d.trustedRequestOrigin(req);
      // Preview image, best first: the invite's own card with its names (1200×630, rendered at publish) → the host's
      // cover photo → the design's pre-rendered preview (1200×630, catalogue plates + design eras) → a creator theme's plate.
      const og: { url: string; w?: number; h?: number } | null =
        inv.ogImage ? { url: inv.ogImage, w: 1200, h: 630 }
        : inv.photoUrl ? { url: inv.photoUrl }
        : plateOgUrl(inv.templateId) ? { url: plateOgUrl(inv.templateId)!, w: 1200, h: 630 }
        : d.resolveArt ? await d.resolveArt(inv.templateId).then(a => a?.plate ? { url: a.plate, w: 812, h: 1224 } : null).catch(() => null)
        : null;
      const title = esc(`${inv.fields.hostName ? inv.fields.hostName + ' invited you: ' : 'You’re invited: '}${inv.fields.headline}`);
      const when = new Date(inv.fields.startsAt).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: inv.fields.timezone || 'UTC' });
      const desc = esc([when, inv.settings.revealAddressAfterYes ? '' : inv.fields.venueName, 'Tap to see the invitation and reply. No account needed.'].filter(Boolean).join(' · '));
      const tags = `<title>${title}</title><meta property="og:type" content="website"><meta property="og:site_name" content="Plajah Events"><meta property="og:title" content="${title}"><meta property="og:description" content="${desc}"><meta property="og:url" content="${esc(origin)}/i/${inv.id}"><meta name="twitter:card" content="${og ? 'summary_large_image' : 'summary'}"><meta name="twitter:title" content="${title}"><meta name="twitter:description" content="${desc}">${og ? `<meta property="og:image" content="${esc(og.url)}">${og.w ? `<meta property="og:image:width" content="${og.w}"><meta property="og:image:height" content="${og.h}">` : ''}<meta property="og:image:alt" content="${title}"><meta name="twitter:image" content="${esc(og.url)}">` : ''}`;
      const stripped = html.replace(/<title>[\s\S]*?<\/title>/i, '').replace(/[ \t]*<meta\s+(?:property|name)="(?:og:[^"]*|twitter:[^"]*)"[^>]*\/?>\s*/gi, '');
      res.set('Cache-Control', 'no-cache').type('html').send(stripped.replace('</head>', `${tags}</head>`));
    } catch { next(); }
  });
}

/** An invite's preview image must be a Firebase Storage download URL inside the owner's folder for that invite. */
export function isOwnOgUrl(u: unknown, ownerUid: string, inviteId: string): u is string {
  if (typeof u !== 'string' || u.length > 1500 || !ownerUid || !inviteId) return false;
  const m = u.match(/^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[a-z0-9.\-_]+\/o\/([^?#]+)\?alt=media(&token=[a-f0-9-]+)?$/i);
  return !!m && decodeURIComponent(m[1]) === `users/${ownerUid}/evites/${inviteId}/og.jpg`;
}

/** One reminder pass (daily cron): emails Going/Maybe guests who left an email, ~24 h before. Idempotent per invite. */
export async function runEviteReminders(d: Pick<EviteDeps, 'fsQueryDocs' | 'firestoreWrite' | 'sendEmail'>, origin: string, now = Date.now()) {
  if (!d.sendEmail) return { invites: 0, sent: 0, skipped: 'EMAIL_NOT_CONFIGURED' as const };
  const rows = await d.fsQueryDocs('evites', [{ field: 'status', op: 'EQUAL', value: 'live' }], 1000);
  let invites = 0, sent = 0;
  for (const row of rows) {
    const inv = parse<EviteDoc & { remindedAt?: number }>(row.data); if (!inv || !dueForReminder(inv, now)) continue;
    invites++;
    const rs = (await d.fsQueryDocs('evite_rsvps', [{ field: 'inviteId', op: 'EQUAL', value: inv.id }], 2000)).map(r => parse<EviteRsvp>(r.data)).filter(Boolean) as EviteRsvp[];
    for (const r of rs) {
      if ((r.status !== 'yes' && r.status !== 'maybe') || !isEmail(r.contact)) continue;
      const m = reminderEmail(inv, r, origin);
      if (await d.sendEmail(r.contact!, m.subject, m.text).catch(() => false)) sent++;
    }
    await d.firestoreWrite('evites', inv.id, { json: JSON.stringify({ ...inv, remindedAt: now }) });
  }
  return { invites, sent };
}

/** Called from the Stripe webhook for `metadata.type === 'evite_gift'`. Idempotent per Checkout session. */
export async function recordEviteGift(d: Pick<EviteDeps, 'firestoreCreateOnce'>, session: any): Promise<'created' | 'exists' | 'error' | 'ignored'> {
  const meta = session?.metadata || {};
  if (meta.type !== 'evite_gift' || !session?.id) return 'ignored';
  return d.firestoreCreateOnce('evite_gifts', String(session.id), {
    inviteId: meta.inviteId || '', hostUid: meta.hostUid || '', amountCents: Number(meta.giftCents) || 0, feeCoveredCents: Number(meta.feeCoveredCents) || 0,
    fromName: meta.fromName || '', note: meta.note || '', paymentIntent: String(session.payment_intent || ''), createdAt: Date.now(),
  });
}
