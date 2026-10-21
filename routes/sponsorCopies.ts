// Sponsored + gift copies — server I/O. Pure rules: services/sponsorCopies/model.ts.
// Mounted in server.ts:  app.use('/api/copies', createSponsorCopiesRouter({ ... }))
//
// Storage (all server-only in firestore.rules):
//   copyPools/{poolId}                pool record (sponsor, book, mode, seats, status, recipients)
//   copyPools/{poolId}/seats/{n}      one doc per claimed seat, created create-only → a seat can't be taken twice
//   copyClaims/{poolId}__{uid}        one claim per person per pool
//   copyCodes/{sha256(code)}          code → pool + seat (codes themselves are only stored hashed here)
//   copyPoolSecrets/{poolId}          the plain codes, for the sponsor to share again
//
// Endpoints
//   POST /api/copies/checkout                 auth: start a sponsor purchase (author's own book: free, instant)
//   GET  /api/copies/pool/:poolId             public view (+ codes/recipients for the sponsor)
//   GET  /api/copies/code/:code               public: which book a code is for (claim page preview)
//   POST /api/copies/claim                    auth: claim a copy by code, or from an OPEN / DIRECT pool
//   POST /api/copies/pool/:poolId/cancel      sponsor: stop the pool, refund unclaimed seats
//   GET  /api/copies/mine                     auth: pools I sponsored
//   GET  /api/copies/book/:bookId             public: OPEN giveaways listed on a book's page

import { Router } from 'express';
import express from 'express';
import * as crypto from 'node:crypto';
import { fsGet, fsSet, fsPatch, fsQuery, fsDelete, fsBatchWrite, verifyIdToken } from '../services/firebaseAdminRest';
import { fsCreateOnce } from '../services/safety/safetyServerIo';
import { checkPoolRequest, codeFromBytes, normalizeCode, seatsLeft, sponsorLine, unclaimedRefundCents, type CopyPool, type PoolRecipient } from '../services/sponsorCopies/model';
import { readRegistry, editionOf, type BookVersionStamp } from '../services/bookEditions/policy';
import { appendLedger } from './ledger';

export interface SponsorCopiesDeps {
  authMiddleware: any;
  requireRegisteredUser: any;
  getStripe: () => any;
  trustedRequestOrigin: (req: any) => string;
  /** Does uid manage this org/business (owner/admin/staff)? Same check events use. */
  canManageHost: (uid: string | undefined, kind: 'org' | 'business', id: string) => Promise<{ ok: boolean; exists: boolean; name?: string }>;
  firestoreIncrement: (path: string, increments: Record<string, number>) => Promise<boolean>;
  sendEmail?: (to: string, subject: string, text: string) => Promise<boolean>;
}

const hashCode = (code: string) => crypto.createHash('sha256').update(`plajah-copy:${code}`).digest('hex');
const newPoolId = () => `pool_${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`;
const albumOwner = (a: any) => String(a?.ownerId || a?.ownerUid || a?.creatorUid || '');
const claimLink = (origin: string, code: string) => `${origin.replace(/\/+$/, '')}/?claim=${encodeURIComponent(code)}`;
const poolLink = (origin: string, poolId: string) => `${origin.replace(/\/+$/, '')}/?gift=${encodeURIComponent(poolId)}`;

function publicPool(p: CopyPool, album: any) {
  return {
    poolId: p.poolId, bookId: p.workId, title: p.title || album?.title || '', author: album?.artist || '',
    cover: album?.coverThumb || album?.coverImage || '', sponsorName: p.sponsorName, sponsorKind: p.sponsorKind,
    message: p.message || '', mode: p.mode, quantity: p.quantity, claimed: p.claimed, left: seatsLeft(p),
    status: p.status, line: sponsorLine(p),
  };
}

/** Licence for a claimed copy: same shape as a purchase (services/contentLicense.ts), grant GIFT. */
async function mintGiftLicence(uid: string, pool: CopyPool, album: any, now: number) {
  const registry = readRegistry(album?.bookEditions);
  const stamps: BookVersionStamp[] = album?.bookTela?.enabled && Array.isArray(album.bookTela.versions) && album.bookTela.versions.length
    ? album.bookTela.versions : Array.isArray(album?.bookVersions) ? album.bookVersions : [];
  const edition = Math.min(pool.edition || registry.current, registry.current);
  const latest = stamps.filter(v => editionOf(v) === edition).sort((a, b) => b.createdAt - a.createdAt)[0];
  const delivery = album?.bookDistribution?.delivery === 'PLAJAH_ONLY' ? 'PLAJAH_ONLY' : 'DOWNLOAD_OPEN';
  const wm = (() => { let h = 0; const s = `${uid}:${pool.workId}`; for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0; return `PLJ-${(h >>> 0).toString(36).toUpperCase().padStart(7, '0')}`; })();
  const doc: Record<string, unknown> = {
    id: `book_${pool.workId}`, kind: 'book', contentId: pool.workId, title: pool.title,
    buyerUid: uid, issuerDid: `plajah:${albumOwner(album)}`, subjectDid: `plajah:${uid}`,
    grant: 'GIFT', delivery, priceCents: 0, currency: 'USD', paymentRef: pool.paymentRef || '',
    issuedAt: now, proof: null, placeholder: true, revokedAt: null, expiresAt: null,
    editions: [edition], ...(latest ? { versionAtPurchase: latest.versionId } : {}),
    giftPoolId: pool.poolId, giftFrom: pool.sponsorName,
    ...(delivery === 'DOWNLOAD_OPEN' && album?.bookDistribution?.watermark !== false ? { watermarkTag: wm } : {}),
  };
  if (!(await fsSet(`users/${uid}/contentLicenses/book_${pool.workId}`, doc))) throw new Error('Could not add the book to your library');
  return doc;
}

/** Turn a paid (or author-free) pool on: codes, notifications, ledger. Idempotent. */
export async function activateCopyPool(poolId: string, deps: Pick<SponsorCopiesDeps, 'sendEmail'>, origin: string, paymentRef = '', paidCents = 0): Promise<void> {
  const pool = await fsGet(`copyPools/${poolId}`) as (CopyPool & { recipients?: PoolRecipient[] }) | null;
  if (!pool || pool.status !== 'PENDING_PAYMENT') return;
  // Claim the activation so a re-fired webhook can't issue a second set of codes.
  if ((await fsCreateOnce('ledgerReceipts', `pool_${poolId}`, { at: Date.now() })) !== 'created') return;
  const now = Date.now();
  const codes: string[] = [];
  if (pool.mode !== 'OPEN') {
    for (let i = 0; i < pool.quantity; i++) codes.push(codeFromBytes(crypto.randomBytes(10)));
    await fsBatchWrite(codes.map((c, i) => ({ path: `copyCodes/${hashCode(c)}`, data: { poolId, seat: i + 1, createdAt: now } })));
    await fsSet(`copyPoolSecrets/${poolId}`, { poolId, sponsorUid: pool.sponsorUid, codes });
  }
  await fsPatch(`copyPools/${poolId}`, { status: 'ACTIVE', activatedAt: now, paymentRef });
  await appendLedger({
    event: 'GIFT', workKind: 'book', workId: pool.workId, at: now, actorUid: pool.sponsorUid,
    paymentRef: paymentRef || undefined, priceCents: paidCents || undefined, currency: paidCents ? 'USD' : undefined,
    note: `pool ${poolId}: ${pool.quantity} ${pool.quantity === 1 ? 'copy' : 'copies'}, ${pool.mode.toLowerCase()}, from ${pool.sponsorName}`,
  });
  // DIRECT: tell each recipient. Plajah users get an in-app notification; email addresses get the claim link.
  if (pool.mode === 'DIRECT' && Array.isArray(pool.recipients)) {
    for (let i = 0; i < pool.recipients.length; i++) {
      const r = pool.recipients[i];
      const link = claimLink(origin, codes[i]);
      const msg = `${pool.sponsorName} sent you “${pool.title}”.${pool.message ? ` “${pool.message}”` : ''}`;
      if (r.uid) {
        await fsCreate('notifications', { userId: r.uid, senderId: pool.sponsorUid, senderName: pool.sponsorName, senderPhoto: '', type: 'SYSTEM', title: 'A book for you', message: msg, link: `claim-copy:${codes[i]}`, targetId: poolId, isRead: false, timestamp: now });
      } else if (r.email && deps.sendEmail) {
        await deps.sendEmail(r.email, `${pool.sponsorName} sent you a book`, `${msg}\n\nClaim your copy: ${link}\n\nSign in or create a free Plajah account with this email address to keep it.`).catch(() => false);
      }
    }
  }
}

async function fsCreate(collection: string, data: Record<string, unknown>) {
  return fsCreateOnce(collection, crypto.randomUUID(), data);
}

export function createSponsorCopiesRouter(deps: SponsorCopiesDeps): Router {
  const r = Router();
  const json = express.json({ limit: '64kb' });

  r.post('/checkout', deps.authMiddleware, deps.requireRegisteredUser, json, async (req: any, res) => {
    try {
      const parsed = checkPoolRequest(req.body);
      if (parsed.ok === false) return res.status(400).json({ error: parsed.error });
      const p = parsed.value;
      const album = await fsGet(`albums/${encodeURIComponent(p.bookId)}`);
      if (!album || album.type !== 'BOOK') return res.status(404).json({ error: 'Book not found' });
      const owner = albumOwner(album);
      const price = Number(album.price) || 0;
      const isAuthor = owner === req.uid;
      if (!isAuthor && !(price > 0)) return res.status(400).json({ error: 'This book is already free to read — share it directly' });
      // Who the copies are "from".
      let sponsorName = '';
      if (p.as?.kind !== 'self' && p.as?.id) {
        const host = await deps.canManageHost(req.uid, p.as.kind as 'org' | 'business', p.as.id);
        if (!host.ok) return res.status(403).json({ error: 'You can only buy copies for an organization you manage' });
        sponsorName = host.name || '';
      } else {
        const u = await fsGet(`users/${req.uid}`);
        sponsorName = String(u?.displayName || u?.name || 'A reader').slice(0, 80);
      }
      const registry = readRegistry(album.bookEditions);
      const poolId = newPoolId();
      const now = Date.now();
      const pool: CopyPool & { recipients?: PoolRecipient[] } = {
        poolId, workKind: 'book', workId: p.bookId, title: String(album.title || ''),
        sponsorUid: req.uid, sponsorName, sponsorKind: p.as?.kind || 'self', ...(p.as?.id ? { sponsorOrgId: p.as.id } : {}),
        mode: p.mode, quantity: p.quantity, claimed: 0, unitPriceCents: isAuthor ? 0 : Math.round(price * 100),
        edition: registry.current, ...(p.message ? { message: p.message } : {}), showOnBookPage: !!p.showOnBookPage,
        status: 'PENDING_PAYMENT', createdAt: now, ...(p.recipients ? { recipients: p.recipients } : {}),
      };
      if (!(await fsSet(`copyPools/${poolId}`, pool as unknown as Record<string, unknown>))) return res.status(500).json({ error: 'Could not start the gift' });
      const origin = deps.trustedRequestOrigin(req);
      // The author gives their own book away for free — no payment, live at once.
      if (isAuthor) {
        await activateCopyPool(poolId, deps, origin);
        return res.json({ poolId, activated: true });
      }
      const session = await deps.getStripe().checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [{ price_data: { currency: 'usd', product_data: { name: `${pool.title} — gift ${p.quantity === 1 ? 'copy' : 'copies'}` }, unit_amount: pool.unitPriceCents }, quantity: p.quantity }],
        success_url: `${origin}/?copies_purchased=${encodeURIComponent(poolId)}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/?copies_cancelled=${encodeURIComponent(poolId)}`,
        metadata: { type: 'copy_pool', poolId, uid: req.uid, creatorUid: owner, kind: 'book', contentId: p.bookId, title: pool.title, quantity: String(p.quantity) },
        payment_intent_data: { metadata: { type: 'copy_pool', poolId } },
      });
      res.json({ url: session.url, poolId });
    } catch (e: any) {
      console.error('[copies] checkout failed', e?.message || e);
      res.status(500).json({ error: 'Could not start the gift checkout' });
    }
  });

  r.get('/pool/:poolId', async (req: any, res) => {
    const pool = await fsGet(`copyPools/${encodeURIComponent(String(req.params.poolId))}`) as (CopyPool & { recipients?: PoolRecipient[] }) | null;
    if (!pool) return res.status(404).json({ error: 'Gift not found' });
    const album = await fsGet(`albums/${encodeURIComponent(pool.workId)}`);
    const h = String(req.headers.authorization || '');
    const uid = h.startsWith('Bearer ') ? await verifyIdToken(h.slice(7)).catch(() => null) : null;
    res.setHeader('Cache-Control', 'private, no-store');
    const out: Record<string, unknown> = publicPool(pool, album);
    if (uid && uid === pool.sponsorUid) {
      const secrets = await fsGet(`copyPoolSecrets/${pool.poolId}`);
      const codes: string[] = Array.isArray(secrets?.codes) ? secrets!.codes : [];
      const origin = deps.trustedRequestOrigin(req);
      const seats = new Set<number>();
      if (codes.length) {
        for (let n = 1; n <= codes.length; n++) if (await fsGet(`copyPools/${pool.poolId}/seats/${n}`)) seats.add(n);
      }
      out.sponsor = {
        codes: codes.map((c, i) => ({ code: c, link: claimLink(origin, c), claimed: seats.has(i + 1), recipient: pool.recipients?.[i] || null })),
        shareLink: poolLink(origin, pool.poolId), unitPriceCents: pool.unitPriceCents, refundableCents: pool.status === 'ACTIVE' ? unclaimedRefundCents(pool) : 0,
      };
    } else if (uid && pool.mode === 'DIRECT') {
      out.forYou = (pool.recipients || []).some(r => r.uid === uid);
    }
    res.json(out);
  });

  r.get('/code/:code', async (req: any, res) => {
    const code = normalizeCode(req.params.code);
    const ref = code ? await fsGet(`copyCodes/${hashCode(code)}`) : null;
    if (!ref) return res.status(404).json({ error: 'That code isn’t valid. Check it and try again.' });
    const pool = await fsGet(`copyPools/${ref.poolId}`) as CopyPool | null;
    if (!pool) return res.status(404).json({ error: 'That gift no longer exists' });
    const album = await fsGet(`albums/${encodeURIComponent(pool.workId)}`);
    const taken = !!(await fsGet(`copyPools/${pool.poolId}/seats/${ref.seat}`));
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ ...publicPool(pool, album), code, codeUsed: taken });
  });

  r.post('/claim', deps.authMiddleware, deps.requireRegisteredUser, json, async (req: any, res) => {
    const uid: string = req.uid;
    try {
      const code = req.body?.code ? normalizeCode(req.body.code) : null;
      if (req.body?.code && !code) return res.status(400).json({ error: 'That code isn’t valid. Check it and try again.' });
      let poolId = typeof req.body?.poolId === 'string' ? req.body.poolId : '';
      let seat = 0;
      if (code) {
        const ref = await fsGet(`copyCodes/${hashCode(code)}`);
        if (!ref) return res.status(404).json({ error: 'That code isn’t valid. Check it and try again.' });
        poolId = String(ref.poolId); seat = Number(ref.seat);
      }
      const pool = poolId ? await fsGet(`copyPools/${encodeURIComponent(poolId)}`) as (CopyPool & { recipients?: PoolRecipient[] }) | null : null;
      if (!pool) return res.status(404).json({ error: 'Gift not found' });
      if (pool.status === 'EXHAUSTED' || (pool.status === 'ACTIVE' && seatsLeft(pool) <= 0 && !seat)) return res.status(410).json({ error: 'All the copies in this gift have been claimed' });
      if (pool.status !== 'ACTIVE') return res.status(410).json({ error: pool.status === 'PENDING_PAYMENT' ? 'This gift isn’t paid for yet' : 'This gift has ended' });
      if (!code && pool.mode === 'CODES') return res.status(400).json({ error: 'Enter your claim code' });
      if (!code && pool.mode === 'DIRECT') {
        // A named recipient opening the gift from their notification: their seat is the one addressed to them.
        const i = (pool.recipients || []).findIndex(r => r.uid === uid || (!!r.email && req.emailVerified && r.email === String(req.email || '').toLowerCase()));
        if (i < 0) return res.status(403).json({ error: 'This gift was sent to someone else' });
        seat = i + 1;
      }
      const album = await fsGet(`albums/${encodeURIComponent(pool.workId)}`);
      if (!album) return res.status(404).json({ error: 'This book is no longer available' });
      if (albumOwner(album) === uid) return res.status(409).json({ error: 'You wrote this book — it’s already yours', alreadyOwned: true, bookId: pool.workId });
      const existing = await fsGet(`users/${uid}/contentLicenses/book_${pool.workId}`);
      if (existing && !existing.revokedAt && (existing.expiresAt == null || Number(existing.expiresAt) > Date.now())) {
        return res.status(409).json({ error: 'You already own this book — pass the code on to someone else', alreadyOwned: true, bookId: pool.workId });
      }
      const claimKey = `${pool.poolId}__${uid}`;
      const first = await fsCreateOnce('copyClaims', claimKey, { poolId: pool.poolId, uid, at: Date.now() });
      if (first === 'exists') return res.status(409).json({ error: 'You already claimed a copy from this gift', alreadyOwned: true, bookId: pool.workId });
      if (first === 'error') return res.status(500).json({ error: 'Could not claim right now — try again' });
      // Take a seat. Seat docs are create-only, so two people can never get the same one.
      let got = 0;
      const now = Date.now();
      if (seat) {
        if ((await fsCreateOnce(`copyPools/${pool.poolId}/seats`, String(seat), { uid, at: now, via: code ? 'code' : 'direct' })) === 'created') got = seat;
      } else {
        for (let n = Math.max(1, pool.claimed + 1); n <= pool.quantity - (pool.refundedSeats || 0) && !got; n++) {
          if ((await fsCreateOnce(`copyPools/${pool.poolId}/seats`, String(n), { uid, at: now, via: 'open' })) === 'created') got = n;
        }
      }
      if (!got) {
        await fsDelete(`copyClaims/${claimKey}`);
        return res.status(410).json({ error: seat ? 'This code has already been used' : 'All the copies in this gift have been claimed' });
      }
      const lic = await mintGiftLicence(uid, pool, album, now);
      await deps.firestoreIncrement(`copyPools/${pool.poolId}`, { claimed: 1 });
      const after = await fsGet(`copyPools/${pool.poolId}`) as CopyPool | null;
      if (after && seatsLeft(after) <= 0) await fsPatch(`copyPools/${pool.poolId}`, { status: 'EXHAUSTED' });
      await appendLedger({
        event: 'CLAIM', workKind: 'book', workId: pool.workId, at: now, subjectUid: uid, actorUid: pool.sponsorUid,
        licenseId: `book_${pool.workId}`, editions: lic.editions as number[], versionId: lic.versionAtPurchase as string | undefined,
        paymentRef: pool.paymentRef || undefined, note: `pool ${pool.poolId} seat ${got}, from ${pool.sponsorName}`,
      });
      res.json({ ok: true, bookId: pool.workId, title: pool.title, from: pool.sponsorName });
    } catch (e: any) {
      console.error('[copies] claim failed', e?.message || e);
      res.status(500).json({ error: 'Could not claim right now — try again' });
    }
  });

  r.post('/pool/:poolId/cancel', deps.authMiddleware, json, async (req: any, res) => {
    const poolId = String(req.params.poolId);
    const pool = await fsGet(`copyPools/${encodeURIComponent(poolId)}`) as CopyPool | null;
    if (!pool) return res.status(404).json({ error: 'Gift not found' });
    if (pool.sponsorUid !== req.uid) return res.status(403).json({ error: 'Only the sponsor can cancel this gift' });
    if (pool.status === 'CLOSED') return res.json({ ok: true, refundedCents: 0 });
    // Close first so no new claims start, then count what's left.
    await fsPatch(`copyPools/${poolId}`, { status: 'CLOSED', closedAt: Date.now() });
    const fresh = (await fsGet(`copyPools/${poolId}`)) as CopyPool;
    const seats = seatsLeft(fresh);
    const cents = seats * fresh.unitPriceCents;
    let refundId = '';
    if (cents > 0 && fresh.paymentRef) {
      try {
        const stripe = deps.getStripe();
        const refund = await stripe.refunds.create({ payment_intent: fresh.paymentRef, amount: cents, metadata: { type: 'copy_pool_unclaimed', poolId } }, { idempotencyKey: `pool_refund_${poolId}` });
        refundId = refund.id;
        // Take back the author's share of the refunded copies.
        const rows = await fsQuery('creatorEarnings', [{ field: 'stripePaymentIntentId', value: fresh.paymentRef }], 3);
        for (const row of rows) {
          const share = Math.round((Number(row.data.creatorNetCents) || 0) * seats / fresh.quantity);
          if (row.data.transferId && share > 0) {
            await stripe.transfers.createReversal(String(row.data.transferId), { amount: share }, { idempotencyKey: `pool_reverse_${poolId}` }).catch((e: any) => console.error('[copies] reversal failed', e?.message || e));
          }
          await fsPatch(`creatorEarnings/${row.id}`, { refundedCents: share, refundedSeats: seats, refundedAt: Date.now() });
        }
      } catch (e: any) {
        console.error('[copies] refund failed', poolId, e?.message || e);
        return res.status(502).json({ error: 'The gift is closed, but the refund could not be issued. Contact support.', closed: true });
      }
    }
    await fsPatch(`copyPools/${poolId}`, { refundedSeats: seats, refundedCents: cents, ...(refundId ? { refundId } : {}) });
    await appendLedger({ event: 'POOL_CANCELLED', workKind: 'book', workId: pool.workId, at: Date.now(), actorUid: req.uid, priceCents: cents || undefined, currency: cents ? 'USD' : undefined, paymentRef: fresh.paymentRef || undefined, note: `pool ${poolId}: ${seats} unclaimed ${seats === 1 ? 'copy' : 'copies'} cancelled` });
    res.json({ ok: true, refundedSeats: seats, refundedCents: cents });
  });

  r.get('/mine', deps.authMiddleware, async (req: any, res) => {
    const rows = await fsQuery('copyPools', [{ field: 'sponsorUid', value: req.uid }], 200);
    res.setHeader('Cache-Control', 'private, no-store');
    const pools = rows.map(x => x.data as CopyPool).filter(p => p.status !== 'PENDING_PAYMENT').sort((a, b) => b.createdAt - a.createdAt);
    const albums = new Map<string, any>();
    for (const p of pools) if (!albums.has(p.workId)) albums.set(p.workId, await fsGet(`albums/${encodeURIComponent(p.workId)}`));
    res.json({ pools: pools.map(p => publicPool(p, albums.get(p.workId))) });
  });

  r.get('/book/:bookId', async (req: any, res) => {
    const rows = await fsQuery('copyPools', [{ field: 'workId', value: String(req.params.bookId) }, { field: 'status', value: 'ACTIVE' }, { field: 'showOnBookPage', value: true }], 20);
    res.setHeader('Cache-Control', 'public, max-age=30');
    res.json({ pools: rows.map(x => x.data as CopyPool).filter(p => p.mode === 'OPEN' && seatsLeft(p) > 0).map(p => publicPool(p, null)) });
  });

  return r;
}
