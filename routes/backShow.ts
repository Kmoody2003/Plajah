// Sponsor This Show: organizers sell sponsorship packages for a show. Rules live in services/backShow/backShowCore.ts.
//
// A sponsor pays through Stripe Checkout, as a direct charge on the organizer's own Stripe account: the organizer is
// the seller, Stripe bills them its fees, refunds and disputes land on their balance, and Plajah only receives its
// application fee. Plajah holds no money and pays nothing out. Those accounts are created here because Stripe covers
// losses on them, unlike the Express accounts other sales use, and that setting can't be changed later.
//
// Nothing can be sold until the venue is confirmed: on record in businessVenues, signed contract posted, and both the
// organizer and the venue have verified it. Plajah records that the agreement exists and isn't a party to it.
// Fan tickets are sold separately through normal ticketing.
//
// backShowCampaigns, backShowSponsorships, backShowSellers, backShowRecords, backShowHeads, backShowAnchors,
// backShowVerifyLinks and businessVenues are server-only (no firestore.rules match). Public reads go through this
// router. Venue phone numbers and the contract itself are never public; the record carries only the contract's hash.
//
// Mounted in server.ts as:  app.use('/api/back-show', express.json({ limit: '64kb' }), createBackShowRouter({...}))

import express, { Router, Request, Response } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { verifyIdTokenDetailed, fsGetStrict, fsSet, fsPatch, fsQueryStrict, fsDelete } from '../services/firebaseAdminRest';
import { casUpdate, type CasStore } from '../services/casCore';
import {
  campaignProblem, organizerProblem, ORGANIZER_TERMS_VERSION, entryPreimage, venueProblem, venueKey, bookingStep, sponsorFeeCents, CHECKOUT_HOLD_MS, CHECKOUT_SESSION_MS, DAY_MS, GENESIS, MAX_CONTRACT_BYTES, PLATFORM_FEE_BPS, VERIFY_LINK_MS, TERMS_VERSION,
  type BackTier, type ContractVerification, type RecordBody, type RecordEntry, type RecordType, type VenueBooking, type VenueInput,
} from '../services/backShow/backShowCore';
import type { LabelStore } from './labels';

export interface BackShowDeps {
  cas: (collection: string) => CasStore;
  getStripe: () => any;
  trustedRequestOrigin: (req: any) => string;
  cronKeyOk: (req: any) => boolean;
  isAdmin?: (uid: string) => Promise<boolean>;
  /** Private file storage for signed contracts. */
  files: { put: (path: string, data: Buffer, contentType: string) => Promise<boolean>; get: (path: string) => Promise<Buffer | null> };
  store?: LabelStore;
  verify?: (bearer: string) => Promise<{ uid: string } | null>;
  /** Submits a 32-byte digest to timestamp calendars; returns each calendar's response. */
  timestamp?: (digestHex: string) => Promise<{ calendar: string; response: Uint8Array }[]>;
  now?: () => number;
}

const restStore: LabelStore = { get: fsGetStrict, set: fsSet, patch: fsPatch, del: fsDelete, query: fsQueryStrict };
const restVerify = async (t: string) => {
  const d = await verifyIdTokenDetailed(t);
  return d && !d.isAnonymous ? { uid: d.uid } : null;
};

const CALENDARS = ['https://a.pool.opentimestamps.org', 'https://b.pool.opentimestamps.org'];
async function otsTimestamp(digestHex: string) {
  const digest = Buffer.from(digestHex, 'hex');
  const out: { calendar: string; response: Uint8Array }[] = [];
  await Promise.all(CALENDARS.map(async calendar => {
    try {
      const r = await fetch(`${calendar}/digest`, { method: 'POST', headers: { Accept: 'application/vnd.opentimestamps.v1' }, body: digest, signal: AbortSignal.timeout(15000) });
      if (r.ok) out.push({ calendar, response: new Uint8Array(await r.arrayBuffer()) });
    } catch { /* one calendar is enough; the tick retries if neither answers */ }
  }));
  return out;
}

const validId = (s: unknown): s is string => typeof s === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(s);
const clean = (s: unknown, max = 200) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const PENDING = 'pending', PAID = 'paid', RELEASED = 'released', REFUNDED = 'refunded';

/** Only the fields a public visitor may see. */
function publicCampaign(id: string, c: Record<string, any>, sponsors: { name: string; tier: string; website?: string }[]) {
  const { ownerUid: _o, sellerAccountId: _s, booking: _b, organizerAcceptance: _a, ...rest } = c;
  return { id, ...rest, sponsors };
}

const verificationView = (s?: ContractVerification) => (s ? { name: s.name, ...(s.title ? { title: s.title } : {}), at: s.at, contractHash: s.contractHash } : undefined);
/** What the artist sees of their booking: no storage path, link hash or signer IP. */
function bookingView(b?: VenueBooking) {
  if (!b) return { step: bookingStep(b) };
  const { verifyLinkHash: _h, artistVerification, venueVerification, contract, ...rest } = b;
  const a = verificationView(artistVerification), v = verificationView(venueVerification);
  const fresh = (s?: { contractHash: string }) => !!s && s.contractHash === contract?.hash;
  return {
    ...rest, step: bookingStep(b), hasVerifyLink: !!b.verifyLinkHash,
    ...(contract ? { contract: { hash: contract.hash, fileName: contract.fileName, size: contract.size, uploadedAt: contract.uploadedAt } } : {}),
    ...(fresh(a) ? { artistVerification: a } : {}), ...(fresh(v) ? { venueVerification: v } : {}),
  };
}
const OPEN_STATUSES = ['draft', 'live'];

export function createBackShowRouter(deps: BackShowDeps): Router {
  const r = Router();
  for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
    const add = (r[method] as any).bind(r);
    (r as any)[method] = (path: string, handler: (req: Request, res: Response) => Promise<unknown>) => add(path, (req: Request, res: Response) => {
      handler(req, res).catch(err => {
        console.error('[back-show]', req.method, req.path, err?.message);
        if (!res.headersSent) res.status(503).json({ error: 'Something went wrong on our side. Try again.' });
      });
    });
  }
  const store = deps.store || restStore;
  const verify = deps.verify || restVerify;
  const timestamp = deps.timestamp || otsTimestamp;
  const now = deps.now || Date.now;
  const campaigns = deps.cas('backShowCampaigns');
  const records = deps.cas('backShowRecords');
  const sponsorships = deps.cas('backShowSponsorships');

  const signedIn = async (req: Request, res: Response) => {
    const auth = req.headers.authorization;
    const who = auth?.startsWith('Bearer ') ? await verify(auth.slice(7)) : null;
    if (!who) res.status(401).json({ error: 'Sign in first.' });
    return who;
  };

  // ── Record ─────────────────────────────────────────────────────────────────

  const append = async (campaignId: string, type: RecordType, data: Record<string, unknown>): Promise<RecordEntry | null> => {
    const head = await store.get(`backShowHeads/${campaignId}`);
    let seq = (head?.seq || 0) + 1, prevHash: string = head?.hash || GENESIS;
    const body: RecordBody = { campaignId, type, at: now(), data };
    for (let i = 0; i < 25; i++) {
      const base = { ...body, seq, prevHash };
      const entry: RecordEntry = { ...base, hash: sha256(entryPreimage(base)) };
      const put = await records.put(`${campaignId}_${String(seq).padStart(8, '0')}`, entry as any, null);
      if (put === 'ok') {
        await store.patch(`backShowHeads/${campaignId}`, { seq, hash: entry.hash });
        return entry;
      }
      if (put === 'error') break;
      const taken = await store.get(`backShowRecords/${campaignId}_${String(seq).padStart(8, '0')}`);
      if (!taken) break;
      prevHash = taken.hash;
      seq++;
    }
    console.error(`[back-show] record append failed for ${campaignId}: ${type}`);
    return null;
  };

  /** Timestamps the current head unless it already is. Failures just wait for the next tick. */
  const anchorHead = async (campaignId: string) => {
    const head = await store.get(`backShowHeads/${campaignId}`);
    if (!head?.hash || head.anchoredSeq === head.seq) return;
    const receipts = await timestamp(head.hash);
    if (!receipts.length) return;
    await store.set(`backShowAnchors/${campaignId}_${String(head.seq).padStart(8, '0')}`, {
      campaignId, seq: head.seq, digest: head.hash, at: now(),
      receipts: receipts.map(x => ({ calendar: x.calendar, proof: Buffer.from(x.response).toString('base64') })),
    });
    await store.patch(`backShowHeads/${campaignId}`, { anchoredSeq: head.seq });
  };

  // ── Campaigns ──────────────────────────────────────────────────────────────

  const readInput = (b: any) => ({
    title: clean(b.title, 120), artistName: clean(b.artistName, 120), organizerName: clean(b.organizerName, 120), organizerRole: clean(b.organizerRole, 20), venue: clean(b.venue, 120), city: clean(b.city, 120), description: clean(b.description, 2000), ticketUrl: clean(b.ticketUrl, 500),
    showDate: Number(b.showDate),
    tiers: (Array.isArray(b.tiers) ? b.tiers : []).slice(0, 20).map((t: any) => ({
      id: clean(t?.id, 40), kind: t?.kind, name: clean(t?.name, 80), description: clean(t?.description, 400), cancellationTerms: clean(t?.cancellationTerms, 400), priceCents: Number(t?.priceCents),
      ...(t?.limit ? { limit: Number(t.limit) } : {}), sold: 0,
    })),
  });

  // ── The organizer's Stripe account ─────────────────────────────────────────

  const sellerState = async (uid: string) => {
    const seller = await store.get(`backShowSellers/${uid}`);
    if (!seller?.accountId) return { hasAccount: false, ready: false };
    const acct = await deps.getStripe().accounts.retrieve(seller.accountId);
    return { hasAccount: true, ready: !!acct?.charges_enabled, accountId: seller.accountId as string };
  };

  r.get('/seller', async (req, res) => {
    const who = await signedIn(req, res);
    if (!who) return;
    const { hasAccount, ready } = await sellerState(who.uid);
    res.json({ hasAccount, ready });
  });

  /** Starts or resumes setup with Stripe. Sends them back to the page they came from. */
  r.post('/seller', async (req, res) => {
    const who = await signedIn(req, res);
    if (!who) return;
    const stripe = deps.getStripe();
    let accountId: string | undefined = (await store.get(`backShowSellers/${who.uid}`))?.accountId;
    if (!accountId) {
      const account = await stripe.accounts.create({
        controller: { stripe_dashboard: { type: 'full' }, fees: { payer: 'account' }, losses: { payments: 'stripe' }, requirement_collection: 'stripe' },
        metadata: { uid: who.uid, plajah: 'sponsor_seller' },
      }, { idempotencyKey: `backshow_seller_${who.uid}` });
      accountId = account.id as string;
      await store.set(`backShowSellers/${who.uid}`, { accountId, createdAt: now() });
    }
    const path = String(req.body?.returnTo || '/');
    const back = `${deps.trustedRequestOrigin(req)}${path.startsWith('/') && !path.startsWith('//') ? path : '/'}`;
    const link = await stripe.accountLinks.create({ account: accountId, type: 'account_onboarding', refresh_url: back, return_url: back });
    res.json({ url: link.url });
  });

  // ── Shows ──────────────────────────────────────────────────────────────────

  r.get('/mine', async (req, res) => {
    const who = await signedIn(req, res);
    if (!who) return;
    const rows = await store.query('backShowCampaigns', [{ field: 'ownerUid', value: who.uid }], 100);
    res.json({ campaigns: rows.map(({ id, data: { organizerAcceptance: _a, sellerAccountId: _s, ...c } }) => ({ id, ...c, booking: bookingView(c.booking) })) });
  });

  r.post('/', async (req, res) => {
    const who = await signedIn(req, res);
    if (!who) return;
    const id = `show_${randomBytes(9).toString('hex')}`;
    await store.set(`backShowCampaigns/${id}`, { ...readInput(req.body || {}), ownerUid: who.uid, status: 'draft', sponsoredCents: 0, createdAt: now() });
    res.json({ id });
  });

  const owned = async (req: Request, res: Response) => {
    const who = await signedIn(req, res);
    if (!who) return null;
    const id = String(req.params.id);
    const c = validId(id) ? await store.get(`backShowCampaigns/${id}`) : null;
    if (!c || c.ownerUid !== who.uid) { res.status(404).json({ error: 'Show not found.' }); return null; }
    return { id, c, uid: who.uid };
  };

  r.patch('/:id', async (req, res) => {
    const o = await owned(req, res);
    if (!o) return;
    if (o.c.status !== 'draft') return res.status(409).json({ error: 'A published show’s terms are locked.' });
    await store.patch(`backShowCampaigns/${o.id}`, readInput(req.body || {}));
    res.json({ ok: true });
  });

  r.post('/:id/publish', async (req, res) => {
    const o = await owned(req, res);
    if (!o) return;
    if (o.c.status !== 'draft') return res.status(409).json({ error: 'This show is already published.' });
    const problem = organizerProblem(o.c as any) || campaignProblem(o.c as any, now());
    if (problem) return res.status(400).json({ error: problem });
    if (req.body?.acceptedOrganizerTerms !== ORGANIZER_TERMS_VERSION) return res.status(400).json({ error: 'Accept responsibility for the show to publish it.' });
    const seller = await sellerState(o.uid);
    if (!seller.ready) return res.status(400).json({ error: 'Finish setting up your Stripe account before publishing.' });
    const out = await casUpdate<boolean>(campaigns, o.id, cur => (cur?.status === 'draft' ? { patch: { status: 'live', publishedAt: now(), sellerAccountId: seller.accountId, organizerAcceptance: { version: ORGANIZER_TERMS_VERSION, at: now(), uid: o.uid, ip: clean(req.ip, 60), userAgent: clean(req.headers['user-agent'], 300) } }, result: true } : { abort: true, result: false }));
    if (!out.ok) return res.status(409).json({ error: 'This show is already published.' });
    const { title, artistName, organizerName, organizerRole, venue, city, showDate, tiers } = o.c;
    await append(o.id, 'published', { title, artistName, organizerName, organizerRole, organizerTermsVersion: ORGANIZER_TERMS_VERSION, venue, city, showDate, tiers: tiers.map(({ sold: _s, ...t }: BackTier) => t), termsVersion: TERMS_VERSION, feeBps: PLATFORM_FEE_BPS, salesRequire: 'verified_venue_contract' });
    if (o.c.contractVerified) await append(o.id, 'contract_verified', o.c.contractVerified);
    await anchorHead(o.id).catch(() => {});
    res.json({ ok: true });
  });

  // ── Venue booking ──────────────────────────────────────────────────────────

  /** Changes a booking in one write. The moment both sides have verified the same contract, it's recorded. */
  const changeBooking = (id: string, change: (b: VenueBooking) => VenueBooking | string) => casUpdate<string>(campaigns, id, cur => {
    if (!cur || !OPEN_STATUSES.includes(cur.status)) return { abort: true, result: 'This show is closed.' };
    const b: VenueBooking = cur.booking || {};
    if (b.confirmedAt) return { abort: true, result: 'This venue is already confirmed.' };
    const next = change(b);
    if (typeof next === 'string') return { abort: true, result: next };
    const v = next.venue, hash = next.contract?.hash;
    if (v && hash && next.artistVerification?.contractHash === hash && next.venueVerification?.contractHash === hash) {
      const at = now();
      return { patch: { booking: { ...next, confirmedAt: at }, contractVerified: { name: v.name, street: v.street, city: v.city, region: v.region, contractHash: hash, at } }, result: 'confirmed' };
    }
    return { patch: { booking: next }, result: '' };
  });
  /** Once both sides have verified: the venue's record, then the public record. */
  const afterVerify = async (id: string) => {
    const c = await store.get(`backShowCampaigns/${id}`);
    if (!c?.contractVerified) return;
    const signer: ContractVerification = c.booking.venueVerification;
    await store.patch(`businessVenues/${c.booking.venueId}`, { status: 'verified', verifiedAt: now(), verifiedContact: { name: signer.name, title: signer.title || '' }, lastConfirmedShow: id });
    if (c.status !== 'draft') {
      await append(id, 'contract_verified', c.contractVerified);
      await anchorHead(id).catch(() => {});
    }
  };
  const readVenue = (b: any): VenueInput => {
    const lat = b?.lat === '' || b?.lat == null ? undefined : Number(b.lat), lng = b?.lng === '' || b?.lng == null ? undefined : Number(b.lng);
    const email = clean(b?.email, 200);
    return {
      name: clean(b?.name, 120), street: clean(b?.street, 200), city: clean(b?.city, 120), region: clean(b?.region, 80), postalCode: clean(b?.postalCode, 20), country: clean(b?.country, 80),
      contactName: clean(b?.contactName, 120), phones: (Array.isArray(b?.phones) ? b.phones : []).slice(0, 5).map((p: any) => ({ label: clean(p?.label, 40), number: clean(p?.number, 30) })).filter((p: any) => p.number),
      ...(email ? { email } : {}), ...(lat !== undefined ? { lat } : {}), ...(lng !== undefined ? { lng } : {}),
    };
  };

  r.put('/:id/venue', async (req, res) => {
    const o = await owned(req, res);
    if (!o) return;
    const venue = readVenue(req.body);
    const problem = venueProblem(venue);
    if (problem) return res.status(400).json({ error: problem });
    const venueId = `venue_${sha256(venueKey(venue)).slice(0, 24)}`;
    const out = await changeBooking(o.id, b => {
      // A different venue voids any signatures. Fixing a typo at the same venue doesn't, since the contract is unchanged.
      const { artistVerification: _a, venueVerification: _v, ...rest } = b;
      return b.venueId && b.venueId !== venueId ? { ...rest, venueId, venue } : { ...b, venueId, venue };
    });
    if (!out.ok) return res.status(409).json({ error: out.result || 'Try again.' });
    // The Plajah venue database: venues are a customer base for events, ticketing, ads and other lines. Nobody can overwrite a record someone else started or one that's been verified.
    const existing = await store.get(`businessVenues/${venueId}`);
    if (!existing) await store.set(`businessVenues/${venueId}`, { ...venue, status: 'unverified', customerStage: 'prospect', source: 'back_this_show', createdBy: o.uid, createdAt: now() });
    else if (existing.status === 'unverified' && existing.createdBy === o.uid) await store.patch(`businessVenues/${venueId}`, { ...venue, updatedAt: now() });
    res.json({ ok: true, venueId });
  });

  r.use('/:id/contract', express.raw({ type: 'application/pdf', limit: MAX_CONTRACT_BYTES }));

  r.post('/:id/contract', async (req, res) => {
    const o = await owned(req, res);
    if (!o) return;
    const data = req.body;
    if (!Buffer.isBuffer(data) || data.subarray(0, 5).toString('latin1') !== '%PDF-') return res.status(400).json({ error: 'Post the contract as a PDF.' });
    const hash = createHash('sha256').update(data).digest('hex');
    const path = `back-show-contracts/${o.id}/${hash}.pdf`;
    if (!(await deps.files.put(path, data, 'application/pdf'))) return res.status(503).json({ error: 'The contract didn’t save. Try again.' });
    const fileName = clean(req.query.name, 160) || 'venue-contract.pdf';
    const out = await changeBooking(o.id, b => {
      if (!b.venue) return 'Add the venue first.';
      return { ...b, contract: { hash, path, fileName, size: data.length, uploadedAt: now() } };
    });
    if (!out.ok) return res.status(409).json({ error: out.result || 'Try again.' });
    res.json({ ok: true, hash });
  });

  const sendContract = async (res: Response, b: VenueBooking) => {
    const data = b.contract ? await deps.files.get(b.contract.path) : null;
    if (!data) return res.status(404).json({ error: 'No contract is posted.' });
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="venue-contract.pdf"', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' });
    return res.send(data);
  };

  r.get('/:id/contract', async (req, res) => {
    const who = await signedIn(req, res);
    if (!who) return;
    const id = String(req.params.id);
    const c = validId(id) ? await store.get(`backShowCampaigns/${id}`) : null;
    if (!c || (c.ownerUid !== who.uid && !(await deps.isAdmin?.(who.uid)))) return res.status(404).json({ error: 'Show not found.' });
    await sendContract(res, c.booking || {});
  });

  const verification = (req: Request, name: string, contractHash: string, extra: { title?: string; uid?: string } = {}): ContractVerification => ({
    name, at: now(), contractHash, ip: clean(req.ip, 60), userAgent: clean(req.headers['user-agent'], 300),
    ...(extra.title ? { title: extra.title } : {}), ...(extra.uid ? { uid: extra.uid } : {}),
  });

  r.post('/:id/contract/verify', async (req, res) => {
    const o = await owned(req, res);
    if (!o) return;
    const name = clean(req.body?.name, 120);
    if (!name || req.body?.agree !== true) return res.status(400).json({ error: 'Type your full name and agree to sign.' });
    const out = await changeBooking(o.id, b => {
      if (!b.contract || req.body?.contractHash !== b.contract.hash) return 'The contract changed. Open it again before signing.';
      return { ...b, artistVerification: verification(req, name, b.contract.hash, { uid: o.uid }) };
    });
    if (!out.ok) return res.status(409).json({ error: out.result || 'Try again.' });
    if (out.result === 'confirmed') await afterVerify(o.id);
    res.json({ ok: true });
  });

  /** A new private link for the venue. The token is shown once; only its hash is kept, and an older link stops working. */
  r.post('/:id/contract/verify-link', async (req, res) => {
    const o = await owned(req, res);
    if (!o) return;
    const token = randomBytes(24).toString('hex');
    const tokenHash = sha256(token);
    let previous = '';
    const out = await changeBooking(o.id, b => {
      if (!b.contract) return 'Post the contract first.';
      previous = b.verifyLinkHash || '';
      return { ...b, verifyLinkHash: tokenHash };
    });
    if (!out.ok) return res.status(409).json({ error: out.result || 'Try again.' });
    await store.set(`backShowVerifyLinks/${tokenHash}`, { campaignId: o.id, expiresAt: now() + VERIFY_LINK_MS });
    if (previous) await store.del(`backShowVerifyLinks/${previous}`);
    res.json({ url: `${deps.trustedRequestOrigin(req)}/back/verify/${token}` });
  });

  /** The campaign behind a venue's verify link, or null if the link is unknown, old or the show has closed. */
  const fromVerifyLink = async (token: string) => {
    if (!/^[a-f0-9]{48}$/.test(token)) return null;
    const tokenHash = sha256(token);
    const link = await store.get(`backShowVerifyLinks/${tokenHash}`);
    if (!link || link.expiresAt <= now()) return null;
    const c = await store.get(`backShowCampaigns/${link.campaignId}`);
    if (!c || c.booking?.verifyLinkHash !== tokenHash || !OPEN_STATUSES.includes(c.status)) return null;
    return { id: link.campaignId as string, c };
  };

  // No sign-in: the venue may not have a Plajah account. The token is the access.
  r.get('/verify/:token', async (req, res) => {
    const s = await fromVerifyLink(String(req.params.token));
    if (!s) return res.status(404).json({ error: 'This verify link is no longer active. Ask the artist for a new one.' });
    const b: VenueBooking = s.c.booking;
    const v = b.venue!;
    const fresh = (x?: ContractVerification) => (x?.contractHash === b.contract?.hash ? verificationView(x) : undefined);
    res.json({
      title: s.c.title, artistName: s.c.artistName, showDate: s.c.showDate,
      venue: { name: v.name, street: v.street, city: v.city, region: v.region, postalCode: v.postalCode, country: v.country },
      contract: b.contract ? { hash: b.contract.hash, fileName: b.contract.fileName, size: b.contract.size } : null,
      artistVerification: fresh(b.artistVerification) || null, venueVerification: fresh(b.venueVerification) || null,
    });
  });

  r.get('/verify/:token/contract', async (req, res) => {
    const s = await fromVerifyLink(String(req.params.token));
    if (!s) return res.status(404).json({ error: 'This verify link is no longer active.' });
    await sendContract(res, s.c.booking);
  });

  r.post('/verify/:token', async (req, res) => {
    const s = await fromVerifyLink(String(req.params.token));
    if (!s) return res.status(404).json({ error: 'This verify link is no longer active. Ask the artist for a new one.' });
    const auth = req.headers.authorization;
    const who = auth?.startsWith('Bearer ') ? await verify(auth.slice(7)) : null;
    if (who?.uid === s.c.ownerUid) return res.status(403).json({ error: 'The venue has to verify this itself. Send them the link.' });
    const name = clean(req.body?.name, 120), title = clean(req.body?.title, 120);
    if (!name || !title || req.body?.agree !== true) return res.status(400).json({ error: 'Add your name and title, and tick the box.' });
    const out = await changeBooking(s.id, b => {
      if (!b.contract || req.body?.contractHash !== b.contract.hash) return 'The contract changed. Open it again before signing.';
      return { ...b, venueVerification: verification(req, name, b.contract.hash, { title, ...(who ? { uid: who.uid } : {}) }) };
    });
    if (!out.ok) return res.status(409).json({ error: out.result || 'Try again.' });
    if (out.result === 'confirmed') await afterVerify(s.id);
    res.json({ ok: true });
  });

  /** Anyone may view a published show. */
  r.get('/:id', async (req, res) => {
    const id = String(req.params.id);
    const c = validId(id) ? await store.get(`backShowCampaigns/${id}`) : null;
    if (!c || c.status === 'draft') {
      const auth = req.headers.authorization;
      const who = c && auth?.startsWith('Bearer ') ? await verify(auth.slice(7)) : null;
      if (!c || who?.uid !== c.ownerUid) return res.status(404).json({ error: 'Show not found.' });
    }
    const rows = await sponsorshipsOf(id);
    const sponsors = rows.filter(p => p.data.status === PAID).map(p => ({ name: p.data.publicName, tier: p.data.tierName, ...(p.data.website ? { website: p.data.website } : {}) }));
    res.json({ campaign: publicCampaign(id, c, sponsors) });
  });

  /** Public, no sign-in: everything needed to re-check the chain and its Bitcoin proofs independently. */
  r.get('/:id/record', async (req, res) => {
    const id = String(req.params.id);
    const c = validId(id) ? await store.get(`backShowCampaigns/${id}`) : null;
    if (!c || c.status === 'draft') return res.status(404).json({ error: 'Show not found.' });
    const [rows, anchors] = await Promise.all([
      store.query('backShowRecords', [{ field: 'campaignId', value: id }], 10000),
      store.query('backShowAnchors', [{ field: 'campaignId', value: id }], 1000),
    ]);
    res.json({ entries: rows.map(d => d.data).sort((a, b) => a.seq - b.seq), anchors: anchors.map(d => d.data).sort((a, b) => a.seq - b.seq) });
  });

  /** The organizer's sponsor list. */
  r.get('/:id/sponsors', async (req, res) => {
    const o = await owned(req, res);
    if (!o) return;
    const rows = await sponsorshipsOf(o.id);
    res.json({ sponsors: rows.filter(p => p.data.status !== PENDING && p.data.status !== RELEASED).map(p => ({ id: p.id, name: p.data.buyerName, publicName: p.data.publicName, website: p.data.website || '', tier: p.data.tierName, amountCents: p.data.amountCents, status: p.data.status })) });
  });

  // ── Selling a package ──────────────────────────────────────────────────────

  const sponsorshipsOf = (id: string) => store.query('backShowSponsorships', [{ field: 'campaignId', value: id }], 2000);
  const salesOpen = (c: Record<string, any> | null | undefined) => c?.status === 'live' && !!c.contractVerified && c.showDate > now();
  const changeSold = (id: string, tierId: string, by: number) => casUpdate<boolean>(campaigns, id, cur => (cur
    ? { patch: { tiers: cur.tiers.map((t: BackTier) => (t.id === tierId ? { ...t, sold: Math.max(0, (t.sold || 0) + by) } : t)) }, result: true }
    : { abort: true, result: false }));

  r.post('/:id/sponsorships', async (req, res) => {
    const who = await signedIn(req, res);
    if (!who) return;
    const id = String(req.params.id);
    const c = validId(id) ? await store.get(`backShowCampaigns/${id}`) : null;
    if (!salesOpen(c)) return res.status(409).json({ error: 'This show isn’t selling sponsorships right now.' });
    if (c!.ownerUid === who.uid) return res.status(400).json({ error: 'You can’t sponsor your own show.' });
    // Price always comes from the published package, never from the client.
    const tier: BackTier | undefined = c!.tiers.find((t: BackTier) => t.id === req.body?.tierId);
    if (!tier) return res.status(400).json({ error: 'Pick a package.' });
    if (req.body?.acceptedTerms !== TERMS_VERSION) return res.status(400).json({ error: 'Please accept the terms.' });
    const publicName = clean(req.body?.publicName, 80);
    if (!publicName) return res.status(400).json({ error: 'Add the name to display.' });
    const website = clean(req.body?.website, 200);
    if (website && !/^https:\/\/\S+$/.test(website)) return res.status(400).json({ error: 'The website must start with https://.' });
    // The package is reserved before the sponsor reaches Stripe, so the last one can't be sold twice.
    const seat = await casUpdate<string>(campaigns, id, cur => {
      if (!salesOpen(cur)) return { abort: true, result: 'This show isn’t selling sponsorships right now.' };
      const t = cur.tiers.find((x: BackTier) => x.id === tier.id);
      if (!t) return { abort: true, result: 'That package no longer exists.' };
      if (t.limit !== undefined && (t.sold || 0) >= t.limit) return { abort: true, result: 'That package is sold out.' };
      return { patch: { tiers: cur.tiers.map((x: BackTier) => (x.id === tier.id ? { ...x, sold: (x.sold || 0) + 1 } : x)) }, result: '' };
    });
    if (!seat.ok) return res.status(409).json({ error: seat.result || 'Try again.' });
    const user = await store.get(`users/${who.uid}`);
    const sid = `sp_${randomBytes(12).toString('hex')}`;
    const feeCents = sponsorFeeCents(tier.priceCents);
    await store.set(`backShowSponsorships/${sid}`, {
      campaignId: id, uid: who.uid, tierId: tier.id, tierName: tier.name, kind: tier.kind, amountCents: tier.priceCents, feeCents, status: PENDING, termsVersion: TERMS_VERSION, acceptedCancellationTerms: tier.cancellationTerms,
      buyerName: clean(user?.displayName || user?.username || 'Sponsor', 80), publicName, ...(website ? { website } : {}), sellerAccountId: c!.sellerAccountId, createdAt: now(),
    });
    const origin = deps.trustedRequestOrigin(req);
    const stripe = deps.getStripe();
    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment', payment_method_types: ['card'],
        line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: tier.priceCents, product_data: { name: `${tier.name}: ${c!.title}` } } }],
        payment_intent_data: { application_fee_amount: feeCents, metadata: { type: 'sponsor_this_show', campaignId: id, sponsorshipId: sid } },
        expires_at: Math.floor((now() + CHECKOUT_SESSION_MS) / 1000),
        success_url: `${origin}/back/${id}?sponsorship=${sid}`, cancel_url: `${origin}/back/${id}`,
        metadata: { type: 'sponsor_this_show', campaignId: id, sponsorshipId: sid },
      }, { stripeAccount: c!.sellerAccountId, idempotencyKey: `backshow_${sid}` });
      await store.patch(`backShowSponsorships/${sid}`, { sessionId: session.id });
      res.json({ url: session.url });
    } catch (e: any) {
      await release(sid);
      throw e;
    }
  });

  const release = async (sid: string) => {
    const out = await casUpdate<any>(sponsorships, sid, cur => (cur?.status === PENDING ? { patch: { status: RELEASED }, result: cur } : { abort: true, result: null }));
    if (out.ok && out.result) await changeSold(out.result.campaignId, out.result.tierId, -1);
  };

  /** Counts a paid sponsorship exactly once, however many times the return page or the tick get here. */
  const finishIfPaid = async (sid: string): Promise<'paid' | 'open' | 'expired' | 'closed'> => {
    const p = await store.get(`backShowSponsorships/${sid}`);
    if (!p) return 'closed';
    if (p.status === PAID) return 'paid';
    if (p.status !== PENDING) return 'closed';
    if (!p.sessionId) return 'expired';
    const session = await deps.getStripe().checkout.sessions.retrieve(p.sessionId, {}, { stripeAccount: p.sellerAccountId });
    if (session?.metadata?.sponsorshipId !== sid) return 'closed';
    if (session.status === 'expired') return 'expired';
    if (session.status !== 'complete' || session.payment_status !== 'paid') return 'open';
    const moved = await casUpdate<boolean>(sponsorships, sid, cur => (cur?.status === PENDING ? { patch: { status: PAID, paymentIntentId: session.payment_intent, paidAt: now() }, result: true } : { abort: true, result: false }));
    if (!moved.ok) return 'paid';
    await casUpdate<boolean>(campaigns, p.campaignId, cur => (cur ? { patch: { sponsoredCents: (cur.sponsoredCents || 0) + p.amountCents }, result: true } : { abort: true, result: false }));
    await append(p.campaignId, 'sponsored', { ref: sha256(`${sid}:${p.sessionId}`), tierId: p.tierId, amountCents: p.amountCents, feeCents: p.feeCents, name: p.publicName });
    await anchorHead(p.campaignId).catch(() => {});
    return 'paid';
  };

  /** Called on return from Stripe. */
  r.post('/:id/sponsorships/:sid/confirm', async (req, res) => {
    const who = await signedIn(req, res);
    if (!who) return;
    const sid = String(req.params.sid);
    const p = validId(sid) ? await store.get(`backShowSponsorships/${sid}`) : null;
    if (!p || p.campaignId !== req.params.id || p.uid !== who.uid) return res.status(404).json({ error: 'Sponsorship not found.' });
    const state = await finishIfPaid(sid);
    if (state !== 'paid') return res.status(409).json({ error: 'The payment hasn’t gone through. You weren’t charged.' });
    res.json({ ok: true });
  });

  /** The organizer's decision and from their own balance. Stripe won't refund a charge twice. */
  r.post('/:id/sponsorships/:sid/refund', async (req, res) => {
    const o = await owned(req, res);
    if (!o) return;
    const sid = String(req.params.sid);
    const p = validId(sid) ? await store.get(`backShowSponsorships/${sid}`) : null;
    if (!p || p.campaignId !== o.id) return res.status(404).json({ error: 'Sponsorship not found.' });
    if (p.status !== PAID) return res.status(409).json({ error: 'Only a paid sponsorship can be refunded.' });
    try {
      await deps.getStripe().refunds.create({ payment_intent: p.paymentIntentId, refund_application_fee: true, metadata: { type: 'sponsor_this_show', campaignId: o.id } }, { stripeAccount: p.sellerAccountId, idempotencyKey: `backshow_${sid}_refund` });
    } catch (e: any) {
      console.error('[back-show] refund', sid, e?.message);
      return res.status(409).json({ error: 'Stripe couldn’t make this refund. Check your Stripe balance, then try again.' });
    }
    const moved = await casUpdate<boolean>(sponsorships, sid, cur => (cur?.status === PAID ? { patch: { status: REFUNDED, refundedAt: now() }, result: true } : { abort: true, result: false }));
    if (moved.ok) {
      await casUpdate<boolean>(campaigns, o.id, cur => (cur ? { patch: { sponsoredCents: Math.max(0, (cur.sponsoredCents || 0) - p.amountCents), tiers: cur.tiers.map((t: BackTier) => (t.id === p.tierId ? { ...t, sold: Math.max(0, (t.sold || 0) - 1) } : t)) }, result: true } : { abort: true, result: false }));
      await append(o.id, 'refunded', { ref: sha256(`${sid}:${p.sessionId}`), amountCents: p.amountCents });
      await anchorHead(o.id).catch(() => {});
    }
    res.json({ ok: true });
  });

  // ── Upkeep ─────────────────────────────────────────────────────────────────

  /** Catches a sponsor who paid but never came back, and frees packages from checkouts nobody finished. */
  const sweepPending = async (log: string[]) => {
    const rows = await store.query('backShowSponsorships', [{ field: 'status', value: PENDING }], 500);
    for (const row of rows) {
      try {
        const state = await finishIfPaid(row.id);
        if (state === 'paid') { log.push(`${row.id}: paid`); continue; }
        if (state === 'closed' || row.data.createdAt + CHECKOUT_HOLD_MS > now()) continue;
        // Close the page first, so nobody can pay for a package that's been given back. If they just paid, this throws and the next tick counts it.
        if (state === 'open') await deps.getStripe().checkout.sessions.expire(row.data.sessionId, {}, { stripeAccount: row.data.sellerAccountId });
        await release(row.id);
      } catch (e: any) { log.push(`${row.id}: ${e?.message}`); }
    }
  };

  const closeShow = async (id: string, status: 'completed' | 'cancelled', data: Record<string, unknown>) => {
    const moved = await casUpdate<boolean>(campaigns, id, cur => (cur?.status === 'live' ? { patch: { status, closedAt: now(), ...(status === 'cancelled' ? { cancelReason: data.reason } : {}) }, result: true } : { abort: true, result: false }));
    if (!moved.ok) return false;
    await append(id, status, data);
    await anchorHead(id).catch(() => {});
    return true;
  };

  const tick = async () => {
    const log: string[] = [];
    await sweepPending(log);
    const rows = await store.query('backShowCampaigns', [{ field: 'status', value: 'live' }], 500);
    for (const row of rows) {
      try {
        if (row.data.showDate <= now() && !row.data.contractVerified) await closeShow(row.id, 'cancelled', { reason: 'No venue contract was verified by the show date.' });
        else if (row.data.showDate + DAY_MS <= now()) await closeShow(row.id, 'completed', { sponsoredCents: row.data.sponsoredCents || 0 });
        await anchorHead(row.id);
      } catch (e: any) { log.push(`${row.id}: ${e?.message}`); }
    }
    return log;
  };

  r.post('/cron/tick', async (req, res) => {
    if (!deps.cronKeyOk(req)) return res.status(403).json({ error: 'Not allowed.' });
    res.json({ log: await tick() });
  });

  /** Stops sales and goes on the record. Refunds stay between the organizer and each sponsor, under the package's terms. */
  r.post('/:id/cancel', async (req, res) => {
    const who = await signedIn(req, res);
    if (!who) return;
    const id = String(req.params.id);
    const c = validId(id) ? await store.get(`backShowCampaigns/${id}`) : null;
    if (!c) return res.status(404).json({ error: 'Show not found.' });
    if (c.ownerUid !== who.uid && !(await deps.isAdmin?.(who.uid))) return res.status(404).json({ error: 'Show not found.' });
    if (c.status === 'draft') { await store.del(`backShowCampaigns/${id}`); return res.json({ ok: true }); }
    if (!(await closeShow(id, 'cancelled', { reason: clean(req.body?.reason, 300) }))) return res.status(409).json({ error: 'This show can’t be cancelled now.' });
    res.json({ ok: true });
  });

  return r;
}
