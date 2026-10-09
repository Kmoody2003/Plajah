// Print-on-demand router. Mounted in server.ts:  app.use('/api/pod', createPodRouter({ ... }))
//
// Endpoints
//   GET    /api/pod/providers                      public: provider capabilities (direct connect vs export pack)
//   GET    /api/pod/spec                           public: spine/cover/preflight math for a spec (pure)
//   PUT    /api/pod/editions/:albumId              owner: save print edition (builds interior to count pages)
//   GET    /api/pod/editions/:albumId              public (listed only) / owner (full)
//   POST   /api/pod/quote                          auth: printer cost + royalty + minimum price
//   GET    /api/pod/preview/:albumId/:file         owner: interior.pdf | cover.pdf | cover-preview.pdf | metadata.csv | onix.xml (export pack)
//   POST   /api/pod/checkout                       auth: buy a print copy (Stripe) -> webhook -> printer job
//   POST   /api/pod/author-copies                  auth: owner orders copies / proof at cost (Stripe)
//   GET    /api/pod/orders                         auth: my orders (as buyer or author)
//   GET    /api/pod/files/:orderId/:file           signed URL the PRINTER fetches (interior.pdf | cover.pdf)
//   POST   /api/pod/webhook/:provider              printer status webhooks (raw body, signature verified)
//
// Secrets (LULU_CLIENT_SECRET, POD_FILE_SECRET, ...) are server env only. Nothing here is exposed to the client bundle.
import { Router, Request, Response } from 'express';
import express from 'express';
import * as crypto from 'node:crypto';
import { fsGet, fsSet, fsPatch, fsList, fsCreate } from '../services/firebaseAdminRest';
import { fsCreateOnce } from '../services/safety/safetyServerIo';
import { effectivePodFlags, POD_FLAGS, type PodFlagKey } from '../services/pod/podFlags';
import type { PrintEdition, PrinterId, PodAddress, PodQuote, ShippingLevel, PodJobStatus } from '../services/pod/podTypes';
import { PodError } from '../services/pod/podTypes';
import { getProvider, listProviders, ALL_PRINTERS } from '../services/pod/registry';
import { TRIM_SIZES, getTrim, coverDimensions, preflight, spineWidthIn, pageLimits, luluPodPackageId, CoverDims } from '../services/pod/printSpec';
import { computeRoyalty, minimumListPriceCents, CARD_FEE_RATE, CARD_FEE_FIXED_CENTS } from '../services/pod/royalty';
import { buildInteriorPdf, chaptersFromBook } from '../services/pod/interiorPdf';
import { buildCoverPdf } from '../services/pod/coverPdf';
import { normalizeIsbn13 } from '../services/pod/barcode';
import { buildMetadataCsv, buildOnix, EXPORT_GUIDES } from '../services/pod/providers/exportPack';
import { LuluProvider } from '../services/pod/providers/lulu';

export interface PodRouterDeps {
  authMiddleware: any;
  requireRegisteredUser: any;
  getStripe: () => any;
  trustedRequestOrigin: (req: any) => string;
  /** Verified platform-admin check (never the editable profile role). Admins can preview OFF features and read /readiness. */
  isAdmin?: (req: any) => Promise<boolean>;
}

const SHIPPING_LEVELS: ShippingLevel[] = ['MAIL', 'PRIORITY_MAIL', 'GROUND', 'EXPEDITED', 'EXPRESS'];
const MAX_RETAIL_QTY = 10, MAX_AUTHOR_QTY = 100;
const FILE_TTL_MS = 14 * 24 * 3600_000;

/* ---------- small helpers ---------- */
const publicBase = () => (process.env.POD_PUBLIC_BASE_URL || process.env.VITE_APP_URL || 'https://plajah.com').replace(/\/+$/, '');
const fileSecret = () => process.env.POD_FILE_SECRET || '';
const hmac = (s: string) => crypto.createHmac('sha256', fileSecret()).update(s).digest('hex');
export const signFile = (orderId: string, file: string, exp: number) => hmac(`${orderId}.${file}.${exp}`);
export function verifyFileSig(orderId: string, file: string, exp: number, sig: string): boolean {
  if (!fileSecret() || !(exp > Date.now())) return false;
  const a = Buffer.from(sig || ''), b = Buffer.from(signFile(orderId, file, exp));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
export const signedFileUrl = (orderId: string, file: 'interior.pdf' | 'cover.pdf') => {
  const exp = Date.now() + FILE_TTL_MS;
  return `${publicBase()}/api/pod/files/${encodeURIComponent(orderId)}/${file}?exp=${exp}&sig=${signFile(orderId, file, exp)}`;
};

const albumOwner = (a: any) => String(a?.ownerId || a?.ownerUid || a?.uid || a?.creatorUid || '');
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
const isPrinter = (v: any): v is PrinterId => ALL_PRINTERS.includes(v);
const sanitizeStr = (v: any, n: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

function chaptersOf(album: any) {
  const arr = Array.isArray(album?.bookChapters) ? album.bookChapters : [];
  return chaptersFromBook(arr.map((c: any) => ({ id: String(c.id ?? ''), title: String(c.title ?? ''), content: typeof c.content === 'string' ? c.content : '' })));
}
const contentHash = (album: any) => sha(JSON.stringify(chaptersOf(album).chapters));

/** SSRF-guarded fetch of the cover image (https only, no private/loopback hosts, 15 MB cap, 15 s). */
export async function fetchImageSafe(url: string): Promise<Uint8Array | null> {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return null;
    const h = u.hostname.toLowerCase();
    if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/.test(h) || h.includes(':') || h === '[::1]') return null;
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 15_000);
    const res = await fetch(u.toString(), { signal: ctl.signal, redirect: 'error' }); clearTimeout(t);
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    return buf.length > 15 * 1024 * 1024 ? null : buf;
  } catch { return null; }
}

/** Derive CoverDims from a printer-supplied total size (e.g. Lulu /cover-dimensions), keeping our panel layout. */
export function dimsFromTotal(widthIn: number, heightIn: number, trimId: string, spineIn: number): CoverDims {
  const t = getTrim(trimId);
  const side = (widthIn - 2 * t.wIn - spineIn) / 2;
  return {
    widthIn, heightIn, spineIn, bleedIn: Math.max(0.125, (heightIn - t.hIn) / 2), trimWIn: t.wIn, trimHIn: t.hIn,
    backX0In: side, spineX0In: side + t.wIn, frontX0In: side + t.wIn + spineIn,
    widthPx: Math.round(widthIn * 300), heightPx: Math.round(heightIn * 300), verified: true, estimated: false, note: 'Dimensions supplied by the printer API.',
  };
}

async function loadAlbum(id: string) { return id ? fsGet(`albums/${encodeURIComponent(id)}`) : null; }

async function buildFiles(album: any, e: PrintEdition & { pageCount?: number }, opts: { preview?: boolean } = {}) {
  const { chapters } = chaptersOf(album);
  const interior = await buildInteriorPdf({
    title: e.title, author: e.author, publisher: e.publisher, isbn13: e.isbn13, chapters,
    trimId: e.trimId, binding: e.binding, printer: e.printer,
  });
  let dims: CoverDims | undefined;
  if (e.printer === 'lulu' && e.binding === 'HARDCOVER_CASEWRAP') {
    const lulu = getProvider('lulu') as LuluProvider;
    const pod = luluPodPackageId(e.trimId, e.binding, e.paperColor, e.paperWeight === 50 ? 60 : e.paperWeight, !!e.colorInterior);
    const sp = spineWidthIn('lulu', e.binding, interior.pageCount, e.paperColor, e.paperWeight).value;
    if (lulu.configured() && pod && sp !== null && !opts.preview) {
      try { const d = await lulu.coverDimensions(pod, interior.pageCount); dims = dimsFromTotal(d.widthIn, d.heightIn, e.trimId, sp); } catch { /* fall back to the flagged estimate */ }
    }
  }
  const img = e.frontCoverUrl ? await fetchImageSafe(e.frontCoverUrl) : null;
  const cover = await buildCoverPdf({
    title: e.title, author: e.author, backText: e.backCoverText, isbn13: e.isbn13, frontImage: img ?? undefined, bgColor: e.spineColor,
    printer: e.printer, binding: e.binding, trimId: e.trimId, pageCount: interior.pageCount, paperColor: e.paperColor, paperWeight: e.paperWeight, dims, preview: opts.preview,
  });
  return { interior, cover };
}

/** ILLUSTRATIVE ONLY. Not a printer price; never used for checkout. */
function illustrativeEstimate(e: PrintEdition, pages: number, qty: number): PodQuote {
  const per = Math.round(150 + pages * (e.colorInterior ? 5 : 1.2) + (e.binding === 'HARDCOVER_CASEWRAP' ? 400 : 0));
  return { currency: 'USD', printCostCents: per * qty, fulfillmentCents: 0, shippingCents: 400, taxCents: 0, totalCents: per * qty + 400, perCopyPrintCents: per, provider: e.printer, estimated: true };
}

/* ---------- order persistence (canonical + per-user mirrors) ---------- */
interface PodOrder {
  id: string; kind: 'retail' | 'author_copies' | 'proof'; status: string; albumId: string; title: string;
  buyerUid: string; authorUid: string; printer: PrinterId; quantity: number; pageCount: number; contentHash: string;
  edition: Record<string, any>; shippingLevel: ShippingLevel; address?: PodAddress;
  listPriceCents: number; buyerTotalCents: number; printQuote: PodQuote; royalty?: Record<string, number>;
  providerJobId?: string; rawStatus?: string; trackingId?: string; trackingUrls?: string[]; error?: string;
  stripeSessionId?: string; createdAt: number; updatedAt: number; needsAttention?: boolean;
}
const strip = (o: Record<string, any>) => JSON.parse(JSON.stringify(o)); // firestore REST writes throw on undefined

async function saveOrder(o: PodOrder, fields?: string[]) {
  o.updatedAt = Date.now();
  const full = strip(o);
  const redacted = strip({ ...o, address: undefined, shipTo: o.address ? { name: o.address.name, city: o.address.city, countryCode: o.address.countryCode } : undefined });
  const pick = (d: any) => fields ? Object.fromEntries(Object.entries(d).filter(([k]) => fields.includes(k) || k === 'updatedAt')) : d;
  const write = async (path: string, data: any) => (fields ? fsPatch(path, pick(data)) : fsSet(path, data));
  await write(`podOrders/${o.id}`, full);
  await write(`users/${o.buyerUid}/podOrders/${o.id}`, full);
  if (o.authorUid !== o.buyerUid) await write(`users/${o.authorUid}/podOrders/${o.id}`, redacted);
}
const loadOrder = async (id: string): Promise<PodOrder | null> => (id ? (await fsGet(`podOrders/${encodeURIComponent(id)}`)) as PodOrder | null : null);

async function notify(userId: string, title: string, message: string, targetId: string) {
  try { await fsCreate('notifications', { userId, senderId: 'plajah-print', senderName: 'Plajah Print', senderPhoto: '', type: 'SYSTEM', title, message, targetId, isRead: false, timestamp: Date.now() }); } catch { /* best effort */ }
}

function parseAddress(a: any): PodAddress | null {
  if (!a || typeof a !== 'object') return null;
  const o: PodAddress = {
    name: sanitizeStr(a.name, 100), street1: sanitizeStr(a.street1, 120), street2: sanitizeStr(a.street2, 120) || undefined, city: sanitizeStr(a.city, 80),
    stateCode: sanitizeStr(a.stateCode, 10) || undefined, postcode: sanitizeStr(a.postcode, 20), countryCode: sanitizeStr(a.countryCode, 2).toUpperCase(),
    phone: sanitizeStr(a.phone, 30), email: sanitizeStr(a.email, 120),
  };
  if (!o.name || !o.street1 || !o.city || !o.postcode || o.countryCode.length !== 2 || !o.phone || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(o.email)) return null;
  return o;
}

/** Returns a PodOrder after an end-to-end Stripe `checkout.session.completed` for type 'pod_print_order'. Idempotent. */
export async function fulfillPodOrderFromStripe(session: any): Promise<{ handled: boolean; note?: string }> {
  const meta = session?.metadata || {};
  if (meta.type !== 'pod_print_order' || !meta.orderId) return { handled: false };
  const order = await loadOrder(meta.orderId);
  if (!order) return { handled: true, note: 'order not found' };
  if (order.status !== 'pending_payment') return { handled: true, note: `already ${order.status}` };           // idempotent re-delivery
  if (session.payment_status && session.payment_status !== 'paid') return { handled: true, note: 'not paid yet' };
  if (Number(session.amount_total) !== order.buyerTotalCents) {
    order.status = 'amount_mismatch'; order.needsAttention = true; order.error = `Stripe charged ${session.amount_total}, expected ${order.buyerTotalCents}`;
    await saveOrder(order, ['status', 'needsAttention', 'error']); return { handled: true, note: 'amount mismatch' };
  }
  // The status check above is read-then-write, so two simultaneous webhook deliveries could both pass it and submit two print jobs
  // (and write two earnings rows). Claim the order atomically: the create-if-absent lock succeeds for exactly one delivery.
  const lock = await fsCreateOnce('podLocks', order.id, { orderId: order.id, claimedAt: Date.now() });
  if (lock === 'exists') return { handled: true, note: 'already being fulfilled' };
  if (lock === 'error') return { handled: false, note: 'could not claim order' }; // let Stripe retry the webhook
  order.status = 'paid'; order.stripeSessionId = session.id;
  await saveOrder(order, ['status', 'stripeSessionId']);
  if (order.kind === 'retail' && order.royalty) {
    const gross = order.buyerTotalCents;
    const platformFee = Math.round(order.listPriceCents * order.quantity * 0.05);
    await fsCreate('creatorEarnings', {
      creatorUid: order.authorUid, payerUid: order.buyerUid, category: 'print_on_demand', grossCents: gross, platformFeeCents: platformFee,
      netCents: gross - platformFee, creatorNetCents: Math.max(0, order.royalty.authorProfitCents * order.quantity), splits: '[]',
      title: `Print edition: ${order.title}`, stripePaymentIntentId: String(session.payment_intent || ''), status: 'pending', timestamp: Date.now(),
    });
  }
  await submitPrintJob(order);
  return { handled: true };
}

async function submitPrintJob(order: PodOrder) {
  const provider = getProvider(order.printer);
  try {
    if (!provider?.createPrintJob || !provider.configured()) throw new PodError('Printer is not configured', 'NOT_CONFIGURED', 503);
    if (!order.address) throw new PodError('Order has no shipping address', 'NO_ADDRESS', 422);
    const album = await loadAlbum(order.albumId);
    if (!album || contentHash(album) !== order.contentHash) throw new PodError('Book text changed after the order was placed; files would not match what was bought', 'CONTENT_CHANGED', 409);
    const st = await provider.createPrintJob({
      externalId: order.id, edition: order.edition as any, pageCount: order.pageCount, quantity: order.quantity, title: order.title,
      interiorUrl: signedFileUrl(order.id, 'interior.pdf'), coverUrl: signedFileUrl(order.id, 'cover.pdf'), address: order.address, shippingLevel: order.shippingLevel,
    });
    order.providerJobId = st.providerJobId; order.rawStatus = st.rawStatus; order.status = 'submitted';
    await saveOrder(order, ['providerJobId', 'rawStatus', 'status']);
    await notify(order.buyerUid, 'Your print copy is on its way to production', `"${order.title}" was sent to the printer.`, order.id);
  } catch (e: any) {
    order.status = 'print_error'; order.needsAttention = true; order.error = String(e?.message || e).slice(0, 400);
    await saveOrder(order, ['status', 'needsAttention', 'error']);
    console.error('[pod] print job submit failed', order.id, order.error);
    await notify(order.authorUid, 'A print order needs attention', `Order ${order.id} could not be sent to the printer: ${order.error}`, order.id);
  }
}

export function applyJobStatus(order: PodOrder, st: PodJobStatus): { changed: boolean; shippedNow: boolean } {
  const prev = order.status;
  const map: Record<string, string> = { created: 'submitted', awaiting_payment: 'submitted', in_production: 'in_production', shipped: 'shipped', delivered: 'delivered', rejected: 'rejected', canceled: 'canceled', error: 'print_error' };
  const next = map[st.status];
  if (next) order.status = next;
  order.rawStatus = st.rawStatus || order.rawStatus;
  if (st.trackingId) order.trackingId = st.trackingId;
  if (st.trackingUrls?.length) order.trackingUrls = st.trackingUrls;
  if (st.status === 'rejected' || st.status === 'error') { order.needsAttention = true; order.error = st.message || order.error; }
  return { changed: prev !== order.status, shippedNow: prev !== 'shipped' && order.status === 'shipped' };
}

/* ---------- router ---------- */
export function createPodRouter(deps: PodRouterDeps): Router {
  const r = Router();
  const { authMiddleware: auth, requireRegisteredUser: reg } = deps;
  const fail = (res: Response, e: any) => {
    if (e instanceof PodError) return res.status(e.httpStatus).json({ error: e.message, code: e.code });
    console.error('[pod]', e?.message || e); return res.status(500).json({ error: 'Print service error' });
  };
  const jsonBody = express.json({ limit: '64kb' });

  // ── launch flags (config/podFlags, default OFF) ───────────────────────────────────────────────────────────────
  // Server-enforced, so hiding the UI is never the only protection. NOT gated, on purpose: GET /files (the printer must be able to
  // fetch files for orders already placed), POST /webhook (status updates for in-flight orders) and the Stripe fulfilment path.
  // Turning a flag off stops NEW orders; it never strands one that is already paid.
  let flagCache: { v: Record<PodFlagKey, boolean>; exp: number } | null = null;
  async function flagsNow() {
    if (flagCache && flagCache.exp > Date.now()) return flagCache.v;
    let raw: any = null; try { raw = await fsGet('config/podFlags'); } catch { raw = null; }   // unreadable => all OFF
    flagCache = { v: effectivePodFlags(raw), exp: Date.now() + 30_000 };
    return flagCache.v;
  }
  /** Passes when ANY listed flag is on, or the caller is a verified admin (preview). Otherwise 403 COMING_SOON. */
  const needFlag = (...keys: PodFlagKey[]) => async (req: any, res: Response, next: any) => {
    try {
      const f = await flagsNow();
      if (keys.some(k => f[k])) return next();
      if (deps.isAdmin && await deps.isAdmin(req).catch(() => false)) { res.setHeader('X-Pod-Preview', '1'); return next(); }
      res.status(403).json({ error: 'Print-on-demand is coming soon.', code: 'COMING_SOON', flag: keys[0] });
    } catch (e) { fail(res, e); }
  };
  const anyPrint = needFlag('PRINT_EXPORT_PACKS', 'PRINT_ORDERING', 'PRINT_RETAIL');



  /** Admin-only go-live check: what is configured, what is still missing. Reports presence only; never returns a secret. */
  r.get('/readiness', auth, reg, async (req: any, res) => {
    try {
      if (!deps.isAdmin || !(await deps.isAdmin(req).catch(() => false))) return res.status(403).json({ error: 'Platform admin access required' });
      const env = (k: string) => !!process.env[k];
      const base = process.env.POD_PUBLIC_BASE_URL || '';
      const lulu = getProvider('lulu') as any;
      let luluAuth: { ok: boolean; note: string } = { ok: false, note: 'Lulu keys not set' };
      if (lulu?.configured?.()) {
        try { await lulu.getToken(true); luluAuth = { ok: true, note: `Authenticated against ${process.env.LULU_SANDBOX === 'false' ? 'PRODUCTION' : 'SANDBOX'}` }; }
        catch (e: any) { luluAuth = { ok: false, note: String(e?.message || e).slice(0, 160) }; }
      }
      flagCache = null;
      const flags = await flagsNow();
      const checks = [
        { id: 'lulu_keys', label: 'Lulu client key + secret set', ok: env('LULU_CLIENT_KEY') && env('LULU_CLIENT_SECRET') },
        { id: 'lulu_auth', label: 'Lulu accepts the keys', ok: luluAuth.ok, note: luluAuth.note },
        { id: 'lulu_production', label: 'Pointed at PRODUCTION Lulu (LULU_SANDBOX=false)', ok: process.env.LULU_SANDBOX === 'false', note: 'Leave on sandbox while rehearsing; flip only for launch' },
        { id: 'file_secret', label: 'POD_FILE_SECRET set (24+ chars)', ok: (process.env.POD_FILE_SECRET || '').length >= 24 },
        { id: 'public_url', label: 'POD_PUBLIC_BASE_URL is a public https URL', ok: /^https:\/\//.test(base) && !/localhost|127\.0\.0\.1/.test(base), note: base ? undefined : 'not set' },
        { id: 'stripe', label: 'Stripe secret key set', ok: env('STRIPE_SECRET_KEY') },
        { id: 'stripe_webhook', label: 'Stripe webhook secret set', ok: env('STRIPE_WEBHOOK_SECRET') },
        // Lulu signs webhooks with the API client secret (no separate secret), so the only manual step is registering the URL.
        { id: 'lulu_webhook', label: 'Printer webhook registered in the Lulu developer portal (manual, cannot be checked from here)', ok: false, note: 'Register ' + (base || '<POD_PUBLIC_BASE_URL>') + '/api/pod/webhook/lulu, then tick it off in the launch checklist' },
      ];
      res.json({ flags, flagMeta: POD_FLAGS, checks, readyForOrdering: checks.filter(c => c.id !== 'lulu_production' && c.id !== 'lulu_webhook').every(c => c.ok) });
    } catch (e) { fail(res, e); }
  });

  r.get('/providers', (_req, res) => res.json({
    providers: listProviders().map(p => ({ ...p, guide: EXPORT_GUIDES[p.id] ?? null })),
    trims: TRIM_SIZES,
  }));

  r.get('/spec', (req, res) => {
    try {
      const q = req.query as Record<string, string>;
      const printer: PrinterId = isPrinter(q.printer) ? q.printer : 'lulu';
      const binding = (['PERFECT_PAPERBACK', 'HARDCOVER_CASEWRAP', 'SADDLE_STITCH'].includes(q.binding) ? q.binding : 'PERFECT_PAPERBACK') as any;
      const pages = Math.max(1, Math.min(2000, parseInt(q.pages || '0', 10) || 0));
      const paperWeight = ([50, 60, 80].includes(parseInt(q.weight, 10)) ? parseInt(q.weight, 10) : 60) as any;
      const paperColor = q.color === 'cream' ? 'cream' : 'white';
      const trimId = TRIM_SIZES.some(t => t.id === q.trim) ? q.trim : '6x9';
      res.json({
        spine: spineWidthIn(printer, binding, pages, paperColor, paperWeight), cover: coverDimensions(printer, binding, trimId, pages, paperColor, paperWeight),
        limits: pageLimits(printer, binding), preflight: preflight(printer, binding, trimId, pages, paperColor, paperWeight, q.isbn),
      });
    } catch (e) { fail(res, e); }
  });

  async function ownedAlbum(req: any, res: Response, albumId: string) {
    const album = await loadAlbum(albumId);
    if (!album) { res.status(404).json({ error: 'Book not found' }); return null; }
    if (albumOwner(album) !== req.uid) { res.status(403).json({ error: 'Only the author can do this' }); return null; }
    return album;
  }

  r.put('/editions/:albumId', auth, reg, anyPrint, jsonBody, async (req: any, res) => {
    try {
      const albumId = String(req.params.albumId);
      const album = await ownedAlbum(req, res, albumId); if (!album) return;
      const b = req.body || {};
      if (!isPrinter(b.printer)) return res.status(400).json({ error: 'Unknown printer' });
      if (!TRIM_SIZES.some(t => t.id === b.trimId)) return res.status(400).json({ error: 'Unknown trim size' });
      if (!['PERFECT_PAPERBACK', 'HARDCOVER_CASEWRAP', 'SADDLE_STITCH'].includes(b.binding)) return res.status(400).json({ error: 'Unknown binding' });
      if (![50, 60, 80].includes(b.paperWeight) || !['white', 'cream'].includes(b.paperColor)) return res.status(400).json({ error: 'Unknown paper' });
      const price = Math.round(Number(b.listPriceCents));
      if (!(price >= 99 && price <= 50_000)) return res.status(400).json({ error: 'List price must be between $0.99 and $500' });
      let isbn13: string | undefined;
      if (b.isbn13) { isbn13 = normalizeIsbn13(String(b.isbn13)) ?? undefined; if (!isbn13) return res.status(400).json({ error: 'ISBN-13 is invalid (check digit)' }); }
      const edition: PrintEdition = {
        albumId, ownerUid: req.uid, title: sanitizeStr(b.title || album.title, 200), author: sanitizeStr(b.author || album.artist || album.authorName, 120),
        trimId: b.trimId, binding: b.binding, paperColor: b.paperColor, paperWeight: b.paperWeight, colorInterior: !!b.colorInterior, listPriceCents: price,
        printer: b.printer, isbn13, publisher: sanitizeStr(b.publisher, 120) || undefined, backCoverText: sanitizeStr(b.backCoverText || album.description, 1500) || undefined,
        frontCoverUrl: sanitizeStr(b.frontCoverUrl || album.coverImage, 1000) || undefined, spineColor: /^#[0-9a-f]{6}$/i.test(b.spineColor || '') ? b.spineColor : undefined,
        listedForSale: !!b.listedForSale && getProvider(b.printer)?.capabilities.directOrder === true, updatedAt: Date.now(),
      };
      if (!edition.author) return res.status(400).json({ error: 'Author name is required' });
      const { chapters, skipped } = chaptersOf(album);
      const interior = await buildInteriorPdf({ title: edition.title, author: edition.author, chapters, trimId: edition.trimId, binding: edition.binding, printer: edition.printer, publisher: edition.publisher, isbn13 });
      const msgs = preflight(edition.printer, edition.binding, edition.trimId, interior.pageCount, edition.paperColor, edition.paperWeight, isbn13);
      if (skipped.length) msgs.push({ level: 'warn', text: `${skipped.length} chapter(s) have no text and are not in the print interior: ${skipped.slice(0, 5).join(', ')}` });
      for (const w of interior.warnings) msgs.push({ level: 'warn', text: w });
      const blocked = msgs.some(m => m.level === 'error');
      if (blocked) edition.listedForSale = false;
      const ok = await fsSet(`podEditions/${albumId}`, strip({ ...edition, pageCount: interior.pageCount, contentHash: contentHash(album) }));
      if (!ok) return res.status(500).json({ error: 'Could not save' });
      res.json({ edition, pageCount: interior.pageCount, preflight: msgs, blocked, cover: coverDimensions(edition.printer, edition.binding, edition.trimId, interior.pageCount, edition.paperColor, edition.paperWeight) });
    } catch (e) { fail(res, e); }
  });

  r.get('/editions/:albumId', needFlag('PRINT_EXPORT_PACKS', 'PRINT_ORDERING', 'PRINT_RETAIL'), async (req: any, res) => {
    try {
      const d: any = await fsGet(`podEditions/${encodeURIComponent(String(req.params.albumId))}`);
      if (!d) return res.status(404).json({ error: 'No print edition' });
      let uid = ''; // optional auth: owners see everything
      const h = String(req.headers.authorization || '');
      if (h.startsWith('Bearer ')) { try { const { verifyIdToken } = await import('../services/firebaseAdminRest'); uid = (await verifyIdToken(h.slice(7))) || ''; } catch { /* anonymous */ } }
      if (uid && uid === d.ownerUid) return res.json({ edition: d, owner: true });
      if (!d.listedForSale) return res.status(404).json({ error: 'No print edition' });
      const { trimId, binding, paperColor, paperWeight, listPriceCents, title, author, pageCount, printer, colorInterior } = d;
      res.json({ edition: { albumId: d.albumId, trimId, binding, paperColor, paperWeight, listPriceCents, title, author, pageCount, printer, colorInterior }, owner: false });
    } catch (e) { fail(res, e); }
  });

  async function quoteFor(e: any, qty: number, address: PodAddress | null, level: ShippingLevel) {
    const provider = getProvider(e.printer);
    const pages = Number(e.pageCount);
    if (provider?.quote && provider.configured() && address) {
      const q = await provider.quote({ edition: e, pageCount: pages, quantity: qty, address, shippingLevel: level });
      return q;
    }
    return illustrativeEstimate(e, pages, qty);
  }

  r.post('/quote', auth, reg, anyPrint, jsonBody, async (req: any, res) => {
    try {
      const e: any = await fsGet(`podEditions/${encodeURIComponent(String(req.body?.albumId || ''))}`);
      if (!e || (!e.listedForSale && e.ownerUid !== req.uid)) return res.status(404).json({ error: 'No print edition' });
      const qty = Math.max(1, Math.min(MAX_AUTHOR_QTY, parseInt(req.body?.quantity, 10) || 1));
      const level: ShippingLevel = SHIPPING_LEVELS.includes(req.body?.shippingLevel) ? req.body.shippingLevel : 'MAIL';
      const address = parseAddress(req.body?.address);
      const q = await quoteFor(e, qty, address, level);
      const per = q.perCopyPrintCents;
      res.json({
        quote: q, liveQuote: !q.estimated,
        royalty: computeRoyalty({ listPriceCents: e.listPriceCents, printCostCents: per, shippingCents: Math.round(q.shippingCents / qty), taxCents: Math.round(q.taxCents / qty) }),
        minListPriceCents: minimumListPriceCents(per, Math.round(q.shippingCents / qty), Math.round(q.taxCents / qty)),
        note: q.estimated ? 'ILLUSTRATIVE estimate only. A live printer quote needs the printer configured and a shipping address.' : undefined,
      });
    } catch (e) { fail(res, e); }
  });

  r.get('/preview/:albumId/:file', auth, reg, anyPrint, async (req: any, res) => {
    try {
      const albumId = String(req.params.albumId);
      const album = await ownedAlbum(req, res, albumId); if (!album) return;
      const e: any = await fsGet(`podEditions/${encodeURIComponent(albumId)}`);
      if (!e) return res.status(404).json({ error: 'Save the print edition first' });
      const file = String(req.params.file);
      const files = await buildFiles(album, e, { preview: file === 'cover-preview.pdf' });
      const send = (b: Uint8Array | string, type: string, name: string) => { res.setHeader('Content-Type', type); res.setHeader('Content-Disposition', `inline; filename="${name}"`); res.setHeader('X-Pod-Warnings', encodeURIComponent(JSON.stringify([...files.interior.warnings, ...files.cover.warnings]).slice(0, 1500))); res.send(Buffer.from(b as any)); };
      if (file === 'interior.pdf') return send(files.interior.bytes, 'application/pdf', file);
      if (file === 'cover.pdf' || file === 'cover-preview.pdf') return send(files.cover.bytes, 'application/pdf', file);
      const desc = e.backCoverText || '';
      if (file === 'metadata.csv') return send(buildMetadataCsv(e, files.interior.pageCount, desc), 'text/csv; charset=utf-8', file);
      if (file === 'onix.xml') return send(buildOnix(e, files.interior.pageCount, desc), 'application/xml; charset=utf-8', file);
      res.status(404).json({ error: 'Unknown file' });
    } catch (e) { fail(res, e); }
  });

  async function createOrderAndSession(req: any, res: Response, kind: PodOrder['kind']) {
    const albumId = String(req.body?.albumId || '');
    const e: any = await fsGet(`podEditions/${encodeURIComponent(albumId)}`);
    if (!e) return res.status(404).json({ error: 'No print edition' });
    const isAuthor = e.ownerUid === req.uid;
    if (kind === 'retail' && !e.listedForSale) return res.status(404).json({ error: 'This print edition is not for sale' });
    if (kind !== 'retail' && !isAuthor) return res.status(403).json({ error: 'Only the author can order author copies' });
    if (!fileSecret()) return res.status(503).json({ error: 'Print ordering is not configured on this server' });
    const provider = getProvider(e.printer);
    if (!provider?.createPrintJob || !provider.quote || !provider.configured()) return res.status(503).json({ error: 'The printer connection is not configured. Use the export pack instead.', code: 'NOT_CONFIGURED' });
    const address = parseAddress(req.body?.address);
    if (!address) return res.status(400).json({ error: 'A complete shipping address is required' });
    const qty = Math.max(1, Math.min(kind === 'retail' ? MAX_RETAIL_QTY : MAX_AUTHOR_QTY, parseInt(req.body?.quantity, 10) || 1));
    const level: ShippingLevel = SHIPPING_LEVELS.includes(req.body?.shippingLevel) ? req.body.shippingLevel : 'MAIL';
    const album = await loadAlbum(albumId);
    if (!album) return res.status(404).json({ error: 'Book not found' });
    const hash = contentHash(album);
    if (hash !== e.contentHash) return res.status(409).json({ error: 'The book text changed since the print edition was saved. The author must re-save the print edition.', code: 'STALE_EDITION' });
    const q = await provider.quote({ edition: e, pageCount: e.pageCount, quantity: qty, address, shippingLevel: level });
    if (q.estimated) return res.status(503).json({ error: 'No live printer quote available' });
    const passThrough = q.shippingCents + q.taxCents;
    let listPerCopy = e.listPriceCents, buyerTotal: number, royalty: Record<string, number> | undefined;
    if (kind === 'retail') {
      const minList = minimumListPriceCents(q.perCopyPrintCents, Math.round(q.shippingCents / qty), Math.round(q.taxCents / qty));
      if (listPerCopy < minList) return res.status(409).json({ error: 'This edition is currently priced below its print cost; the author must raise the price.', code: 'PRICE_BELOW_COST' });
      royalty = { ...computeRoyalty({ listPriceCents: listPerCopy, printCostCents: q.perCopyPrintCents, shippingCents: Math.round(q.shippingCents / qty), taxCents: Math.round(q.taxCents / qty) }) };
      buyerTotal = listPerCopy * qty + passThrough;
    } else {
      listPerCopy = 0; // at cost: printer total + card-fee gross-up so Plajah is not out of pocket
      buyerTotal = Math.ceil((q.totalCents + CARD_FEE_FIXED_CENTS) / (1 - CARD_FEE_RATE));
    }
    const id = `pod_${crypto.randomBytes(9).toString('hex')}`;
    const now = Date.now();
    const order: PodOrder = {
      id, kind, status: 'pending_payment', albumId, title: e.title, buyerUid: req.uid, authorUid: e.ownerUid, printer: e.printer, quantity: qty,
      pageCount: e.pageCount, contentHash: hash,
      edition: { trimId: e.trimId, binding: e.binding, paperColor: e.paperColor, paperWeight: e.paperWeight, colorInterior: !!e.colorInterior, listPriceCents: e.listPriceCents, printer: e.printer,
        title: e.title, author: e.author, isbn13: e.isbn13 ?? null, publisher: e.publisher ?? null, backCoverText: e.backCoverText ?? null, frontCoverUrl: e.frontCoverUrl ?? null, spineColor: e.spineColor ?? null },
      shippingLevel: level, address, listPriceCents: listPerCopy, buyerTotalCents: buyerTotal, printQuote: q, royalty, createdAt: now, updatedAt: now,
    };
    const stripe = deps.getStripe();
    const origin = deps.trustedRequestOrigin(req);
    const lineItems: any[] = kind === 'retail'
      ? [{ price_data: { currency: 'usd', product_data: { name: `${e.title} (print edition)` }, unit_amount: listPerCopy }, quantity: qty },
         ...(passThrough > 0 ? [{ price_data: { currency: 'usd', product_data: { name: 'Shipping and handling (at printer cost)' }, unit_amount: passThrough }, quantity: 1 }] : [])]
      : [{ price_data: { currency: 'usd', product_data: { name: `${kind === 'proof' ? 'Proof copy' : 'Author copies'}: ${e.title} (at cost)` }, unit_amount: buyerTotal }, quantity: 1 }];
    await saveOrder(order);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment', payment_method_types: ['card'], line_items: lineItems, customer_email: address.email,
      success_url: `${origin}/?pod_order=${id}&session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${origin}/?pod_cancelled=${id}`,
      metadata: { type: 'pod_print_order', orderId: id, uid: req.uid, albumId, kind },
    });
    res.json({ url: session.url, orderId: id, buyerTotalCents: buyerTotal });
  }

  r.post('/checkout', auth, reg, needFlag('PRINT_RETAIL'), jsonBody, async (req: any, res) => { try { await createOrderAndSession(req, res, 'retail'); } catch (e) { fail(res, e); } });
  r.post('/author-copies', auth, reg, needFlag('PRINT_ORDERING'), jsonBody, async (req: any, res) => { try { await createOrderAndSession(req, res, req.body?.proof ? 'proof' : 'author_copies'); } catch (e) { fail(res, e); } });

  r.get('/orders', auth, reg, async (req: any, res) => {
    try {
      const rows = (await fsList(`users/${req.uid}/podOrders`, { maxDocs: 200 })).map(d => d.data).sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));
      res.json({ orders: rows.map((o: any) => ({ ...o, role: o.authorUid === req.uid && o.buyerUid !== req.uid ? 'author' : 'buyer' })) });
    } catch (e) { fail(res, e); }
  });

  // The PRINTER fetches these. Authorization is the HMAC-signed, expiring URL (no cookies/headers possible).
  const fileCache = new Map<string, { at: number; bytes: Uint8Array }>();
  r.get('/files/:orderId/:file', async (req: Request, res: Response) => {
    try {
      const orderId = String(req.params.orderId), file = String(req.params.file);
      if (file !== 'interior.pdf' && file !== 'cover.pdf') return res.status(404).end();
      if (!verifyFileSig(orderId, file, Number(req.query.exp), String(req.query.sig || ''))) return res.status(403).json({ error: 'Link expired or invalid' });
      const key = `${orderId}/${file}`; const hit = fileCache.get(key);
      if (hit && Date.now() - hit.at < 30 * 60_000) { res.setHeader('Content-Type', 'application/pdf'); return res.send(Buffer.from(hit.bytes)); }
      const order = await loadOrder(orderId); if (!order) return res.status(404).end();
      const album = await loadAlbum(order.albumId); if (!album) return res.status(404).end();
      if (contentHash(album) !== order.contentHash) return res.status(409).json({ error: 'Book changed since order' });
      const files = await buildFiles(album, { ...(order.edition as any), albumId: order.albumId, pageCount: order.pageCount });
      if (files.interior.pageCount !== order.pageCount) return res.status(409).json({ error: 'Page count mismatch' });
      const bytes = file === 'interior.pdf' ? files.interior.bytes : files.cover.bytes;
      fileCache.set(key, { at: Date.now(), bytes }); if (fileCache.size > 40) fileCache.delete(fileCache.keys().next().value!);
      res.setHeader('Content-Type', 'application/pdf'); res.send(Buffer.from(bytes));
    } catch (e) { fail(res, e); }
  });

  r.post('/webhook/:provider', express.raw({ type: () => true, limit: '1mb' }), async (req: Request, res: Response) => {
    try {
      const id = String(req.params.provider);
      const provider = isPrinter(id) ? getProvider(id) : null;
      const raw: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
      if (!provider?.verifyWebhook || !provider.parseWebhook || !provider.verifyWebhook(raw, req.headers as any)) return res.status(401).json({ error: 'Bad signature' });
      let body: any; try { body = JSON.parse(raw.toString('utf8')); } catch { return res.status(400).json({ error: 'Bad JSON' }); }
      const st = provider.parseWebhook(body);
      const extId = String(body?.data?.external_id ?? body?.external_id ?? body?.orderReferenceId ?? '');
      const order = await loadOrder(extId);
      if (!st || !order) return res.json({ ok: true, ignored: true });                       // 2xx so the printer stops retrying unknown ids
      const { changed, shippedNow } = applyJobStatus(order, st);
      order.providerJobId = order.providerJobId || st.providerJobId;
      if (changed || st.trackingId) await saveOrder(order, ['status', 'rawStatus', 'trackingId', 'trackingUrls', 'needsAttention', 'error', 'providerJobId']);
      if (shippedNow) await notify(order.buyerUid, 'Your book has shipped', order.trackingId ? `Tracking: ${order.trackingId}` : `"${order.title}" is on its way.`, order.id);
      res.json({ ok: true });
    } catch (e) { fail(res, e); }
  });

  return r;
}
