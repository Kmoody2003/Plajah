// eviteThemeServer — the creator theme marketplace for Plajah Evites. Registered from server.ts with ONE call;
// every server helper is injected (`EviteThemeDeps`, same style as eviteServer's `EviteDeps`).
//
//  Creator   POST /api/evite-themes/{save,publish,listing,remove,mine,stats,list-in-shop}
//  Anyone    POST /api/evite-themes/market            GET /api/evite-themes/:id          (public, no account)
//  Signed in POST /api/evite-themes/{usable,claim,checkout,confirm,gift}   POST /api/evite-themes/:id/report
//
// Plus three hooks for the rest of the server:
//   mayUseTemplate(d, uid, templateId)   → eviteServer's EviteDeps.mayUseTemplate (may this host save "theme:<id>"?)
//   resolveArt(d, templateId)            → eviteServer's EviteDeps.resolveArt (the art guests see; published only)
//   recordThemePurchase(d, session)      → Stripe webhook, metadata.type === 'evite_theme' (idempotent per session)
//
// Collections (server-only, Firestore REST with the service account; the browser never touches them, so no rules):
//   evite_themes/{id}                       ownerUid, status, access, market ('public'|'none'), json, uses, sales
//   evite_theme_licenses/{uid}__{themeId}   uid, themeId, ownerUid, source, status, gen, ...
//   evite_theme_sales/{checkoutSessionId}   themeId, ownerUid, buyerUid, priceCents, platformFeeCents, ...
//   evite_theme_uses/{themeId}__{uid}       first time a person saved an invite with the theme (drives `uses`)
//   evite_theme_transfers/{licenseId}_g{n}  create-only lock: one licence generation moves once
//   evite_theme_reports/{themeId}__{uid}    "this uses someone else's art"
import nodeCrypto from 'node:crypto';
import {
  type EviteTheme, type EviteThemeLicense, type LicenseSource, type MarketQuery, type PublicTheme, type ThemeArt,
  ATTESTATION_TEXT, canSeeTheme, canUseTheme, cleanThemeInput, filterMarket, hamming64, inMarket, isThemeKey, licenseGrants, licenseId,
  licenseTransferable, LOOKALIKE_BITS, sanctuaryAllows, storageObjectPath, themeArt, themeIdOf, themeIndexFields, themeSaleMath, themeSharePath,
  themeTemplateId, toPublicTheme, isOwnUpload,
} from './eviteThemes';

type Row = Record<string, any>;
export interface EviteThemeDeps {
  app: any; express: any; rateLimit: any; authMiddleware: any;
  firestoreRead: (c: string, id: string) => Promise<Row | null>;
  firestoreWrite: (c: string, id: string, data: object, requireSuccess?: boolean) => Promise<any>;
  firestoreCreateOnce: (c: string, id: string, data: Row) => Promise<'created' | 'exists' | 'error'>;
  firestoreDeleteDoc: (c: string, id: string) => Promise<void>;
  fsQueryDocs: (c: string, f: Array<{ field: string; op: string; value: any }>, n?: number) => Promise<Array<{ id: string; data: Row }>>;
  getStripe: () => any;
  trustedRequestOrigin: (req: any) => string;
  /** server.ts firestoreIncrement (atomic). Without it counters are read-modify-write. */
  firestoreIncrement?: (path: string, inc: Record<string, number>) => Promise<boolean>;
  /** The viewer's membership in a Sanctuary. Default: sanctuaryMemberships/{sanctuaryId}_{uid} via firestoreRead. */
  sanctuaryMembership?: (sanctuaryId: string, uid: string) => Promise<{ status?: string; tierId?: string } | null>;
  /** Sanctuaries this person is an ACTIVE member of (creator ids). Default: fsQueryDocs on sanctuaryMemberships.memberId. */
  sanctuariesOf?: (uid: string) => Promise<Array<{ creatorId: string; status?: string; tierId?: string }>>;
  /** "@name" / name / uid → uid. Default: users/{uid} exists, else users where username == / handle == . */
  findUser?: (handle: string) => Promise<string | null>;
  /**
   * Optional: copy a published theme's files into a server-owned, immutable path (evite-themes/<id>/v<n>/…) so a
   * creator deleting their upload can't break invites people already sent. Same shape as eviteServer's print
   * `uploadPrintFile` (gcsUploadWithDownloadToken). Without it the creator's own upload URLs are used.
   */
  uploadThemeFile?: (objectPath: string, data: Buffer, contentType: string) => Promise<string | null>;
  /** fetch used to read uploads when freezing (tests inject one). */
  fetchImpl?: typeof fetch;
  /** Turn on "Sell in your shop" only once server.ts calls grantThemeLicensesForStoreOrder from the store_order webhook. */
  shopListing?: boolean;
  /** Stripe fee estimate params for creator stats (same env as gifts). */
  feeParams?: () => { rate?: number; fixedCents?: number };
}

const parse = <T,>(row: Row | null | undefined): T | null => { try { return row?.json ? JSON.parse(row.json) as T : null; } catch { return null; } };
const clamp = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const ID_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
const newThemeKey = () => { const b = nodeCrypto.randomBytes(10); let s = ''; for (let i = 0; i < 10; i++) s += ID_ALPHABET[b[i] % ID_ALPHABET.length]; return s; };
const UID_RE = /^[A-Za-z0-9_-]{6,128}$/;
const MARKET_SCAN = 600;

// ── shared loaders (used by routes and the exported hooks) ──────────────────
async function loadTheme(d: Pick<EviteThemeDeps, 'firestoreRead'>, id: string): Promise<EviteTheme | null> {
  if (!isThemeKey(id)) return null;
  const row = await d.firestoreRead('evite_themes', id);
  const t = parse<EviteTheme>(row);
  if (!t) return null;
  // counters live beside the JSON so increments never race the creator's edits
  return { ...t, uses: Number(row?.uses) || 0, sales: Number(row?.sales) || 0 };
}
const themeRow = (t: EviteTheme) => { const { uses: _u, sales: _s, ...rest } = t; return { ...themeIndexFields(t), json: JSON.stringify(rest) }; };
async function saveTheme(d: Pick<EviteThemeDeps, 'firestoreWrite'>, t: EviteTheme) { await d.firestoreWrite('evite_themes', t.id, themeRow(t), true); }

async function loadLicense(d: Pick<EviteThemeDeps, 'firestoreRead'>, uid: string, themeId: string): Promise<EviteThemeLicense | null> {
  const r = await d.firestoreRead('evite_theme_licenses', licenseId(uid, themeId));
  return r && r.uid ? { ...(r as any), gen: Number(r.gen) || 0 } as EviteThemeLicense : null;
}

async function bump(d: Pick<EviteThemeDeps, 'firestoreIncrement' | 'firestoreRead' | 'firestoreWrite'>, themeId: string, inc: Record<string, number>) {
  if (d.firestoreIncrement && await d.firestoreIncrement(`evite_themes/${themeId}`, inc).catch(() => false)) return;
  const row = await d.firestoreRead('evite_themes', themeId);
  if (!row) return;
  const patch: Record<string, number> = {};
  for (const [k, v] of Object.entries(inc)) patch[k] = (Number(row[k]) || 0) + v;
  await d.firestoreWrite('evite_themes', themeId, patch);
}

async function membershipOf(d: EviteThemeDeps, sanctuaryId: string, uid: string) {
  if (d.sanctuaryMembership) return d.sanctuaryMembership(sanctuaryId, uid).catch(() => null);
  return d.firestoreRead('sanctuaryMemberships', `${sanctuaryId}_${uid}`).catch(() => null);
}
async function isSanctuaryMember(d: EviteThemeDeps, t: EviteTheme, uid: string) {
  if (t.access !== 'sanctuary' || !uid) return false;
  return sanctuaryAllows(await membershipOf(d, t.sanctuaryId || t.ownerUid, uid), t.sanctuaryTierIds);
}

/** Grant (or re-activate) a licence. Never downgrades an active one. Returns the licence now on file. */
async function grantLicense(d: EviteThemeDeps, g: { uid: string; themeId: string; ownerUid: string; source: LicenseSource; sessionId?: string; fromUid?: string }): Promise<{ result: 'created' | 'reactivated' | 'already' | 'error'; license: EviteThemeLicense | null }> {
  const id = licenseId(g.uid, g.themeId);
  const now = Date.now();
  const fresh: EviteThemeLicense = { id, uid: g.uid, themeId: g.themeId, ownerUid: g.ownerUid, source: g.source, status: 'active', gen: 0, createdAt: now, updatedAt: now, ...(g.sessionId ? { sessionId: g.sessionId } : {}), ...(g.fromUid ? { fromUid: g.fromUid } : {}) };
  const existing = await loadLicense(d, g.uid, g.themeId);
  if (!existing) {
    const r = await d.firestoreCreateOnce('evite_theme_licenses', id, fresh as any);
    if (r === 'created') return { result: 'created', license: fresh };
    if (r === 'error') return { result: 'error', license: null };
    return grantLicense(d, g);                                           // lost a race: decide against what's there now
  }
  // An active paid/gifted licence beats a bookmark; an active one of equal or better standing stays as it is.
  if (existing.status === 'active' && (licenseGrants(existing) || g.source === 'member')) return { result: 'already', license: existing };
  const next: EviteThemeLicense = { ...fresh, gen: (existing.gen || 0) + 1, createdAt: existing.createdAt || now };
  await d.firestoreWrite('evite_theme_licenses', id, { ...next, sessionId: g.sessionId || '', fromUid: g.fromUid || '', transferredTo: '' }, true);
  return { result: 'reactivated', license: next };
}

// ── exported hooks ──────────────────────────────────────────────────────────

/** eviteServer's EviteDeps.mayUseTemplate: may `uid` save an invite whose design is `templateId` ("theme:<id>")? */
export async function mayUseTemplate(d: EviteThemeDeps, uid: string, templateId: string): Promise<boolean> {
  const id = themeIdOf(templateId);
  if (!id || !uid) return false;
  const t = await loadTheme(d, id).catch(() => null);
  if (!t) return false;
  const licensed = t.ownerUid === uid || t.access === 'free' ? false : licenseGrants(await loadLicense(d, uid, id).catch(() => null));
  const member = !licensed && t.access === 'sanctuary' ? await isSanctuaryMember(d, t, uid) : false;
  const ok = canUseTheme(t, uid, { licensed, sanctuaryMember: member });
  if (ok && uid !== t.ownerUid) {
    // `uses` = distinct people who designed an invite with it (the creator's own use doesn't count)
    try { if (await d.firestoreCreateOnce('evite_theme_uses', `${id}__${uid}`, { themeId: id, uid, ownerUid: t.ownerUid, at: Date.now() }) === 'created') await bump(d, id, { uses: 1 }); } catch { /* stats only */ }
  }
  return ok;
}

/** eviteServer's EviteDeps.resolveArt: the art for a published theme, null otherwise (draft, removed, unknown). */
export async function resolveArt(d: Pick<EviteThemeDeps, 'firestoreRead'>, templateId: string): Promise<ThemeArt | null> {
  const id = themeIdOf(templateId);
  if (!id) return null;
  const t = await loadTheme(d, id).catch(() => null);
  return t && t.status === 'published' ? themeArt(t) : null;
}

/** Stripe webhook for checkout.session.completed with metadata.type === 'evite_theme'. Idempotent per session. */
export async function recordThemePurchase(d: EviteThemeDeps, session: any): Promise<'created' | 'exists' | 'error' | 'ignored'> {
  const meta = session?.metadata || {};
  if (meta.type !== 'evite_theme' || !session?.id) return 'ignored';
  if (session.payment_status && session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') return 'ignored';
  const themeId = String(meta.themeId || ''), buyer = String(meta.buyerUid || ''), ownerUid = String(meta.ownerUid || '');
  if (!isThemeKey(themeId) || !UID_RE.test(buyer)) return 'ignored';
  const priceCents = Number(meta.priceCents) || 0, platformFeeCents = Number(meta.platformFeeCents) || 0;
  const r = await d.firestoreCreateOnce('evite_theme_sales', String(session.id), {
    themeId, ownerUid, buyerUid: buyer, priceCents, platformFeeCents, creatorCents: priceCents - platformFeeCents,
    amountTotal: Number(session.amount_total) || priceCents, currency: String(session.currency || 'usd'), paymentIntent: String(session.payment_intent || ''), createdAt: Date.now(),
  });
  if (r === 'error') return 'error';
  if (r === 'created') {
    await grantLicense(d, { uid: buyer, themeId, ownerUid, source: 'purchase', sessionId: String(session.id) });
    await bump(d, themeId, { sales: 1 }).catch(() => {});
    return 'created';
  }
  // Sale already recorded (Stripe retry, or /confirm got there first). Make sure the licence exists if a crash landed
  // between the two writes, but create-only: a licence that was since passed on must not come back.
  await d.firestoreCreateOnce('evite_theme_licenses', licenseId(buyer, themeId), { id: licenseId(buyer, themeId), uid: buyer, themeId, ownerUid, source: 'purchase', status: 'active', gen: 0, sessionId: String(session.id), createdAt: Date.now(), updatedAt: Date.now() });
  return 'exists';
}

/**
 * FOLLOW-UP hook for "Sell in your shop": call from server.ts's store_order webhook branch after the order is
 * CONFIRMED. Grants a licence for every line whose product is a theme listing (`linkedAssetId: "theme:<id>"`) owned
 * by the seller. Idempotent per (order, theme).
 */
export async function grantThemeLicensesForStoreOrder(d: EviteThemeDeps, order: { orderId: string; buyerUid: string; sellerUid: string; items: Array<{ productId: string }> }): Promise<number> {
  let n = 0;
  if (!order?.orderId || !UID_RE.test(String(order.buyerUid || ''))) return 0;
  for (const it of (order.items || []).slice(0, 60)) {
    const p = await d.firestoreRead('storeProducts', String(it.productId || '')).catch(() => null);
    const themeId = themeIdOf(p?.linkedAssetId);
    if (!themeId) continue;
    const t = await loadTheme(d, themeId);
    if (!t || t.ownerUid !== order.sellerUid || t.status === 'removed') continue;
    const r = await d.firestoreCreateOnce('evite_theme_sales', `store_${order.orderId}_${themeId}`, { themeId, ownerUid: t.ownerUid, buyerUid: order.buyerUid, priceCents: Math.round((Number(p?.price) || 0) * 100), platformFeeCents: 0, via: 'store', orderId: order.orderId, createdAt: Date.now() });
    if (r !== 'created') continue;
    await grantLicense(d, { uid: order.buyerUid, themeId, ownerUid: t.ownerUid, source: 'purchase', sessionId: `store:${order.orderId}` });
    await bump(d, themeId, { sales: 1 }).catch(() => {});
    n++;
  }
  return n;
}

// ── routes ──────────────────────────────────────────────────────────────────
export function registerEviteThemeRoutes(d: EviteThemeDeps) {
  const { app, express } = d;
  const jsonBody = express.json({ limit: '32kb' });
  const writeLimiter = d.rateLimit({ windowMs: 10 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many tries. Give it a minute.' } });
  const readLimiter = d.rateLimit({ windowMs: 60 * 1000, max: 240, standardHeaders: true, legacyHeaders: false, message: { error: 'Slow down a little.' } });
  const registered = (req: any, res: any, next: any) => req.isAnonymous ? res.status(403).json({ error: 'Sign in with an account to do that.' }) : next();
  const fail = (res: any, where: string, err: any, msg: string) => { console.error(where, err?.message || err); res.status(500).json({ error: msg }); };
  // The market is one equality query (no composite index) filtered/sorted in memory; cache it briefly per instance.
  let marketCache: { at: number; items: EviteTheme[] } | null = null;
  const marketThemes = async (): Promise<EviteTheme[]> => {
    if (marketCache && Date.now() - marketCache.at < 30_000) return marketCache.items;
    const rows = await d.fsQueryDocs('evite_themes', [{ field: 'market', op: 'EQUAL', value: 'public' }], MARKET_SCAN);
    const items = rows.map(r => { const t = parse<EviteTheme>(r.data); return t ? { ...t, uses: Number(r.data.uses) || 0, sales: Number(r.data.sales) || 0 } : null; }).filter((t): t is EviteTheme => !!t && inMarket(t));
    marketCache = { at: Date.now(), items };
    return items;
  };
  const changed = () => { marketCache = null; };

  const displayName = async (uid: string) => { const u = await d.firestoreRead('users', uid).catch(() => null); return clamp(u?.displayName || u?.artistName || u?.name || u?.username || '', 60) || undefined; };
  const connectAccount = async (uid: string): Promise<string | undefined> => (await d.firestoreRead('users', uid).catch(() => null))?.stripeConnectAccountId || undefined;
  const mine = async (req: any, id: unknown) => { const t = await loadTheme(d, String(id || '')); return t && t.ownerUid === req.uid && t.status !== 'removed' ? t : null; };
  const findUser = async (handle: string): Promise<string | null> => {
    const h = clamp(handle, 80).replace(/^@/, '');
    if (!h) return null;
    if (d.findUser) return d.findUser(h).catch(() => null);
    if (UID_RE.test(h) && await d.firestoreRead('users', h).catch(() => null)) return h;
    for (const field of ['username', 'handle']) for (const v of new Set([h, h.toLowerCase()])) {
      const hit = (await d.fsQueryDocs('users', [{ field, op: 'EQUAL', value: v }], 2).catch(() => []))[0];
      if (hit) return hit.id;
    }
    return null;
  };

  /** Copy uploads into evite-themes/<id>/v<n>/ (immutable, server-owned). Validates they are real JPEG/PNG images. */
  const freezeAssets = async (t: EviteTheme): Promise<EviteTheme['assets'] | { error: string }> => {
    if (!d.uploadThemeFile) return t.assets;
    const f = d.fetchImpl || fetch;
    const v = Date.now().toString(36);
    const out: any = {};
    for (const [k, url] of Object.entries(t.assets) as Array<[string, string | undefined]>) {
      if (!url) continue;
      if (storageObjectPath(url)?.startsWith(`evite-themes/${t.id}/`)) { out[k] = url; continue; }   // already frozen
      if (!isOwnUpload(url, t.ownerUid)) return { error: 'The art must be uploaded from your account.' };
      const r = await f(url);
      if (!r.ok) return { error: 'We couldn’t read your upload. Try uploading again.' };
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 6 * 1024 * 1024) return { error: 'That image is too large. Upload it again from the theme maker.' };
      const jpeg = buf[0] === 0xff && buf[1] === 0xd8, png = buf[0] === 0x89 && buf[1] === 0x50;
      if (!jpeg && !png) return { error: 'Theme art must be a JPEG or PNG image.' };
      const url2 = await d.uploadThemeFile(`evite-themes/${t.id}/${v}/${k}.${jpeg ? 'jpg' : 'png'}`, buf, jpeg ? 'image/jpeg' : 'image/png');
      if (!url2) return { error: 'Could not store the theme files. Try again.' };
      out[k] = url2;
    }
    return out;
  };

  // ── creator: create / update (stays a draft until published) ──
  app.post('/api/evite-themes/save', d.authMiddleware, registered, writeLimiter, jsonBody, async (req: any, res: any) => {
    try {
      const b = req.body || {};
      const prev = b.id ? await mine(req, b.id) : null;
      if (b.id && !prev) return res.status(404).json({ error: 'That theme isn’t yours or no longer exists.' });
      const c = cleanThemeInput(b, req.uid, prev);
      if (c.ok === false) return res.status(400).json({ error: c.error });
      const now = Date.now();
      const t: EviteTheme = {
        ...c.value, id: prev?.id || '', ownerUid: req.uid, ownerName: await displayName(req.uid) || c.value.ownerName,
        status: prev?.status || 'draft', listed: prev ? prev.listed : true, uses: prev?.uses || 0, sales: prev?.sales || 0, createdAt: prev?.createdAt || now, updatedAt: now,
      };
      if (prev?.status === 'published' && JSON.stringify(prev.assets) !== JSON.stringify(t.assets)) {
        const frozen = await freezeAssets(t);
        if ('error' in frozen) return res.status(400).json({ error: frozen.error });
        t.assets = frozen as EviteTheme['assets'];
      }
      if (prev?.status === 'published' && t.access === 'paid' && !(await connectAccount(req.uid))) return res.status(409).json({ error: 'Set up payouts (Stripe) before selling a theme.', code: 'NO_PAYOUTS' });
      if (!prev) {
        for (let i = 0; i < 6 && !t.id; i++) {
          const id = newThemeKey();
          const r = await d.firestoreCreateOnce('evite_themes', id, { ...themeRow({ ...t, id }), uses: 0, sales: 0 });
          if (r === 'created') t.id = id; else if (r === 'error') return res.status(500).json({ error: 'Could not save the theme. Try again.' });
        }
        if (!t.id) return res.status(500).json({ error: 'Could not save the theme. Try again.' });
      } else await saveTheme(d, t);
      changed();
      res.json({ theme: toPublicTheme(t) });
    } catch (err) { fail(res, '/api/evite-themes/save', err, 'Could not save the theme.'); }
  });

  // ── creator: publish (attestation required) ──
  app.post('/api/evite-themes/publish', d.authMiddleware, registered, writeLimiter, jsonBody, async (req: any, res: any) => {
    try {
      const t = await mine(req, req.body?.id);
      if (!t) return res.status(404).json({ error: 'That theme isn’t yours or no longer exists.' });
      if (req.body?.attest !== true) return res.status(400).json({ error: `Please confirm: “${ATTESTATION_TEXT}”`, code: 'ATTEST' });
      const c = cleanThemeInput({}, req.uid, t);                       // re-validate what's stored (brand words, price)
      if (c.ok === false) return res.status(400).json({ error: c.error });
      if (t.access === 'paid' && !(await connectAccount(req.uid))) return res.status(409).json({ error: 'Set up payouts (Stripe) before selling a theme.', code: 'NO_PAYOUTS' });
      if (t.dhash && t.access !== 'private') {
        const others = await marketThemes();
        const twin = others.find(o => o.ownerUid !== t.ownerUid && o.dhash && hamming64(o.dhash, t.dhash!) <= LOOKALIKE_BITS);
        if (twin) return res.status(409).json({ error: 'This art looks like a theme someone else already published. Upload art you made.', code: 'LOOKALIKE' });
      }
      const frozen = await freezeAssets(t);
      if ('error' in frozen) return res.status(400).json({ error: frozen.error });
      const now = Date.now();
      const next: EviteTheme = { ...t, assets: frozen as EviteTheme['assets'], status: 'published', listed: t.status === 'published' ? t.listed : true, attestation: { at: now, text: ATTESTATION_TEXT }, publishedAt: t.publishedAt || now, updatedAt: now };
      await saveTheme(d, next);
      changed();
      res.json({ theme: toPublicTheme(next), link: `${d.trustedRequestOrigin(req)}${themeSharePath(next.id)}` });
    } catch (err) { fail(res, '/api/evite-themes/publish', err, 'Could not publish the theme.'); }
  });

  // ── creator: list / unlist in the market (licences keep working either way) ──
  app.post('/api/evite-themes/listing', d.authMiddleware, registered, writeLimiter, jsonBody, async (req: any, res: any) => {
    try {
      const t = await mine(req, req.body?.id);
      if (!t) return res.status(404).json({ error: 'That theme isn’t yours or no longer exists.' });
      if (t.status !== 'published') return res.status(409).json({ error: 'Publish the theme first.' });
      const next = { ...t, listed: req.body?.listed !== false, updatedAt: Date.now() };
      await saveTheme(d, next);
      changed();
      res.json({ theme: toPublicTheme(next) });
    } catch (err) { fail(res, '/api/evite-themes/listing', err, 'Could not update the listing.'); }
  });

  // ── creator: remove (unusable everywhere, including invites that already use it) ──
  app.post('/api/evite-themes/remove', d.authMiddleware, registered, writeLimiter, jsonBody, async (req: any, res: any) => {
    try {
      const t = await mine(req, req.body?.id);
      if (!t) return res.status(404).json({ error: 'That theme isn’t yours or no longer exists.' });
      if (t.sales > 0 && req.body?.confirm !== true) return res.status(409).json({ error: `${t.sales} people bought this theme. Removing it stops it showing on their invites too. Unlist it instead, or confirm removal.`, code: 'HAS_BUYERS' });
      await saveTheme(d, { ...t, status: 'removed', listed: false, updatedAt: Date.now() });
      changed();
      res.json({ ok: true });
    } catch (err) { fail(res, '/api/evite-themes/remove', err, 'Could not remove the theme.'); }
  });

  // ── anyone: the market ──
  app.post('/api/evite-themes/market', readLimiter, jsonBody, async (req: any, res: any) => {
    try {
      const b = req.body || {};
      const all = await marketThemes();
      const q: MarketQuery = { q: b.q, tag: b.tag, preset: b.preset, access: b.access, sort: b.sort, owner: b.owner, maxPriceCents: Number.isFinite(Number(b.maxPriceCents)) && b.maxPriceCents !== null && b.maxPriceCents !== undefined ? Number(b.maxPriceCents) : undefined };
      const list = filterMarket(all, q);
      const offset = Math.max(0, Math.floor(Number(b.offset) || 0)), limit = Math.min(60, Math.max(1, Math.floor(Number(b.limit) || 30)));
      const tags = [...all.flatMap(t => t.tags).reduce((m, t) => m.set(t, (m.get(t) || 0) + 1), new Map<string, number>())].sort((a, z) => z[1] - a[1]).slice(0, 16).map(([t]) => t);
      res.set('Cache-Control', 'no-store').json({ items: list.slice(offset, offset + limit).map(toPublicTheme), total: list.length, tags });
    } catch (err) { fail(res, '/api/evite-themes/market', err, 'Could not load themes.'); }
  });

  // ── anyone: one theme (share links) ──
  app.get('/api/evite-themes/:id', readLimiter, async (req: any, res: any) => {
    try {
      const t = await loadTheme(d, String(req.params.id || ''));
      if (!t || !canSeeTheme(t)) return res.status(404).json({ error: 'This theme isn’t available.' });
      res.set('Cache-Control', 'no-store').json({ theme: toPublicTheme(t) });
    } catch (err) { fail(res, '/api/evite-themes/:id', err, 'Could not open this theme.'); }
  });

  // ── creator + collector: my themes and my licences ──
  app.post('/api/evite-themes/mine', d.authMiddleware, jsonBody, async (req: any, res: any) => {
    try {
      const [own, lic] = await Promise.all([
        d.fsQueryDocs('evite_themes', [{ field: 'ownerUid', op: 'EQUAL', value: req.uid }], 300),
        d.fsQueryDocs('evite_theme_licenses', [{ field: 'uid', op: 'EQUAL', value: req.uid }], 500),
      ]);
      const themes = own.map(r => { const t = parse<EviteTheme>(r.data); return t ? { ...t, uses: Number(r.data.uses) || 0, sales: Number(r.data.sales) || 0 } : null; })
        .filter((t): t is EviteTheme => !!t && t.status !== 'removed').sort((a, z) => z.updatedAt - a.updatedAt).map(toPublicTheme);
      const licenses = await Promise.all(lic.map(r => r.data as EviteThemeLicense).filter(l => l.status === 'active').map(async l => {
        const t = await loadTheme(d, l.themeId).catch(() => null);
        return t && t.status !== 'removed' ? { license: { id: l.id, themeId: l.themeId, source: l.source, createdAt: Number(l.createdAt) || 0, transferable: licenseTransferable(l), fromUid: l.fromUid || undefined }, theme: toPublicTheme(t) } : null;
      }));
      res.json({ themes, licenses: licenses.filter(Boolean) });
    } catch (err) { fail(res, '/api/evite-themes/mine', err, 'Could not load your themes.'); }
  });

  // ── signed in: every theme I can put on an invite right now (studio picker) ──
  app.post('/api/evite-themes/usable', d.authMiddleware, jsonBody, async (req: any, res: any) => {
    try {
      const uid = req.uid;
      const [own, lic, subs] = await Promise.all([
        d.fsQueryDocs('evite_themes', [{ field: 'ownerUid', op: 'EQUAL', value: uid }], 300),
        d.fsQueryDocs('evite_theme_licenses', [{ field: 'uid', op: 'EQUAL', value: uid }], 500),
        d.sanctuariesOf ? d.sanctuariesOf(uid).catch(() => []) : d.fsQueryDocs('sanctuaryMemberships', [{ field: 'memberId', op: 'EQUAL', value: uid }], 100).then(rs => rs.map(r => ({ creatorId: String(r.data.creatorId || ''), status: r.data.status, tierId: r.data.tierId }))).catch(() => []),
      ]);
      const out = new Map<string, { theme: PublicTheme; why: 'mine' | 'licensed' | 'free' | 'member'; art: ThemeArt }>();
      const add = (t: EviteTheme | null, why: 'mine' | 'licensed' | 'free' | 'member') => { if (t && t.status === 'published' && !out.has(t.id)) out.set(t.id, { theme: toPublicTheme(t), why, art: themeArt(t) }); };
      for (const r of own) { const t = parse<EviteTheme>(r.data); if (t) add({ ...t, uses: Number(r.data.uses) || 0, sales: Number(r.data.sales) || 0 }, 'mine'); }
      for (const r of lic) {
        const l = r.data as EviteThemeLicense; if (l.status !== 'active') continue;
        const t = await loadTheme(d, l.themeId).catch(() => null); if (!t) continue;
        const member = l.source === 'member' ? await isSanctuaryMember(d, t, uid) : false;
        if (canUseTheme(t, uid, { licensed: licenseGrants(l), sanctuaryMember: member })) add(t, t.access === 'free' ? 'free' : member ? 'member' : 'licensed');
      }
      for (const m of (subs as Array<{ creatorId: string; status?: string; tierId?: string }>).filter(s => s.creatorId && s.status === 'ACTIVE').slice(0, 25)) {
        const rows = await d.fsQueryDocs('evite_themes', [{ field: 'ownerUid', op: 'EQUAL', value: m.creatorId }], 100).catch(() => []);
        for (const r of rows) { const t = parse<EviteTheme>(r.data); if (t && t.access === 'sanctuary' && sanctuaryAllows(m, t.sanctuaryTierIds)) add({ ...t, uses: Number(r.data.uses) || 0, sales: Number(r.data.sales) || 0 }, 'member'); }
      }
      res.json({ items: [...out.values()].map(x => ({ ...x, templateId: themeTemplateId(x.theme.id) })) });
    } catch (err) { fail(res, '/api/evite-themes/usable', err, 'Could not load your themes.'); }
  });

  // ── signed in: claim a free theme (or save a members' theme to your library) ──
  app.post('/api/evite-themes/claim', d.authMiddleware, registered, writeLimiter, jsonBody, async (req: any, res: any) => {
    try {
      const t = await loadTheme(d, String(req.body?.id || ''));
      if (!t || !canSeeTheme(t, req.uid) || t.status !== 'published') return res.status(404).json({ error: 'This theme isn’t available.' });
      if (t.ownerUid === req.uid) return res.json({ ok: true, owner: true, templateId: themeTemplateId(t.id), art: themeArt(t) });
      if (t.access === 'paid') return res.status(402).json({ error: 'This theme is for sale. Buy it to use it.', code: 'PAID' });
      if (!t.listed) return res.status(410).json({ error: 'The creator isn’t offering this theme any more.' });
      if (t.access === 'sanctuary' && !(await isSanctuaryMember(d, t, req.uid))) return res.status(403).json({ error: 'This theme is for members of the creator’s Sanctuary.', code: 'MEMBERS', sanctuaryId: t.sanctuaryId || t.ownerUid });
      const g = await grantLicense(d, { uid: req.uid, themeId: t.id, ownerUid: t.ownerUid, source: t.access === 'sanctuary' ? 'member' : 'claim' });
      if (g.result === 'error') return res.status(500).json({ error: 'Could not add the theme. Try again.' });
      res.json({ ok: true, templateId: themeTemplateId(t.id), art: themeArt(t) });
    } catch (err) { fail(res, '/api/evite-themes/claim', err, 'Could not add the theme.'); }
  });

  // ── signed in: buy a paid theme (Stripe Checkout destination charge, 5% application fee) ──
  app.post('/api/evite-themes/checkout', d.authMiddleware, registered, writeLimiter, jsonBody, async (req: any, res: any) => {
    try {
      const t = await loadTheme(d, String(req.body?.id || ''));
      if (!t || t.status !== 'published' || t.access === 'private') return res.status(404).json({ error: 'This theme isn’t available.' });
      if (t.access !== 'paid') return res.status(400).json({ error: 'This theme isn’t for sale.' });
      if (!t.listed) return res.status(410).json({ error: 'The creator isn’t selling this theme any more.' });
      if (t.ownerUid === req.uid) return res.status(400).json({ error: 'This is your own theme.' });
      if (licenseGrants(await loadLicense(d, req.uid, t.id))) return res.status(409).json({ error: 'You already own this theme.', code: 'OWNED' });
      const acct = await connectAccount(t.ownerUid);
      if (!acct) return res.status(409).json({ error: 'The creator hasn’t finished setting up payouts yet.' });
      const stripe = d.getStripe();
      try { const info = await stripe.accounts.retrieve(acct); if (!info?.payouts_enabled) return res.status(409).json({ error: 'The creator can’t receive payouts yet.' }); }
      catch { return res.status(409).json({ error: 'Could not verify the creator’s payout account.' }); }
      const m = themeSaleMath(t.priceCents);
      const origin = d.trustedRequestOrigin(req);
      const meta = { type: 'evite_theme', themeId: t.id, buyerUid: req.uid, ownerUid: t.ownerUid, priceCents: String(m.priceCents), platformFeeCents: String(m.platformFeeCents) };
      const session = await stripe.checkout.sessions.create({
        mode: 'payment', payment_method_types: ['card'],
        line_items: [{ price_data: { currency: 'usd', product_data: { name: `Invitation theme: ${t.title}`.slice(0, 120), description: `A licence to use this theme for your own events. By ${t.ownerName || 'a Plajah creator'}.`.slice(0, 300) }, unit_amount: m.priceCents }, quantity: 1 }],
        payment_intent_data: { application_fee_amount: m.platformFeeCents, transfer_data: { destination: acct }, metadata: meta },
        metadata: meta, client_reference_id: req.uid,
        success_url: `${origin}${themeSharePath(t.id)}&theme_session={CHECKOUT_SESSION_ID}`, cancel_url: `${origin}${themeSharePath(t.id)}`,
      });
      res.json({ url: session.url, priceCents: m.priceCents, platformFeeCents: m.platformFeeCents });
    } catch (err) { fail(res, '/api/evite-themes/checkout', err, 'Checkout could not be started.'); }
  });

  // ── signed in: back from Checkout. Covers a slow webhook (same idempotent record). ──
  app.post('/api/evite-themes/confirm', d.authMiddleware, writeLimiter, jsonBody, async (req: any, res: any) => {
    try {
      const sid = clamp(req.body?.sessionId, 200);
      if (!/^cs_[A-Za-z0-9_]+$/.test(sid)) return res.status(400).json({ error: 'Missing checkout session.' });
      const session = await d.getStripe().checkout.sessions.retrieve(sid);
      if (session?.metadata?.type !== 'evite_theme' || session.metadata.buyerUid !== req.uid) return res.status(404).json({ error: 'That purchase wasn’t found.' });
      if (session.payment_status !== 'paid') return res.json({ licensed: false, pending: true });
      await recordThemePurchase(d, session);
      const t = await loadTheme(d, String(session.metadata.themeId));
      res.json({ licensed: licenseGrants(await loadLicense(d, req.uid, String(session.metadata.themeId))), templateId: t ? themeTemplateId(t.id) : undefined, art: t && t.status === 'published' ? themeArt(t) : undefined });
    } catch (err) { fail(res, '/api/evite-themes/confirm', err, 'Could not check the purchase.'); }
  });

  // ── signed in: gift. The creator grants a licence; a holder passes theirs on (it leaves their library). ──
  app.post('/api/evite-themes/gift', d.authMiddleware, registered, writeLimiter, jsonBody, async (req: any, res: any) => {
    try {
      const t = await loadTheme(d, String(req.body?.id || ''));
      if (!t || t.status === 'removed') return res.status(404).json({ error: 'This theme isn’t available.' });
      const to = await findUser(String(req.body?.to || ''));
      if (!to) return res.status(404).json({ error: 'We couldn’t find that person. Check their @username.' });
      if (to === req.uid) return res.status(400).json({ error: 'That’s you.' });
      if (to === t.ownerUid) return res.status(400).json({ error: 'That’s the theme’s creator.' });
      if (licenseGrants(await loadLicense(d, to, t.id))) return res.status(409).json({ error: 'They already have this theme.' });
      const now = Date.now();
      if (t.ownerUid === req.uid) {
        const g = await grantLicense(d, { uid: to, themeId: t.id, ownerUid: t.ownerUid, source: 'gift', fromUid: req.uid });
        if (g.result === 'error') return res.status(500).json({ error: 'Could not send the gift. Try again.' });
        return res.json({ ok: true, granted: true });
      }
      const src = await loadLicense(d, req.uid, t.id);
      if (!licenseTransferable(src)) return res.status(403).json({ error: src && licenseGrants(src) ? 'Free themes can’t be passed on. Share the link instead.' : 'You don’t have a licence for this theme to give.' });
      // One licence generation moves once, even if two gifts race.
      const lock = await d.firestoreCreateOnce('evite_theme_transfers', `${src!.id}_g${src!.gen || 0}`, { from: req.uid, to, themeId: t.id, at: now });
      if (lock !== 'created') return res.status(409).json({ error: 'That licence was already passed on.' });
      await d.firestoreWrite('evite_theme_licenses', src!.id, { status: 'transferred', transferredTo: to, updatedAt: now }, true);
      const g = await grantLicense(d, { uid: to, themeId: t.id, ownerUid: t.ownerUid, source: 'transfer', fromUid: req.uid });
      if (g.result === 'error') {
        await d.firestoreWrite('evite_theme_licenses', src!.id, { status: 'active', transferredTo: '', updatedAt: Date.now() });   // put it back
        await d.firestoreDeleteDoc('evite_theme_transfers', `${src!.id}_g${src!.gen || 0}`);
        return res.status(500).json({ error: 'Could not pass the licence on. You still have it.' });
      }
      res.json({ ok: true, transferred: true });
    } catch (err) { fail(res, '/api/evite-themes/gift', err, 'Could not send the gift.'); }
  });

  // ── creator: stats ──
  app.post('/api/evite-themes/stats', d.authMiddleware, jsonBody, async (req: any, res: any) => {
    try {
      const [own, sales, lic] = await Promise.all([
        d.fsQueryDocs('evite_themes', [{ field: 'ownerUid', op: 'EQUAL', value: req.uid }], 300),
        d.fsQueryDocs('evite_theme_sales', [{ field: 'ownerUid', op: 'EQUAL', value: req.uid }], 5000),
        d.fsQueryDocs('evite_theme_licenses', [{ field: 'ownerUid', op: 'EQUAL', value: req.uid }], 5000),
      ]);
      const fp = d.feeParams?.() || {};
      const per: Record<string, { id: string; title: string; uses: number; holders: number; sales: number; grossCents: number; platformFeeCents: number; creatorCents: number }> = {};
      for (const r of own) { const t = parse<EviteTheme>(r.data); if (t && t.status !== 'removed') per[t.id] = { id: t.id, title: t.title, uses: Number(r.data.uses) || 0, holders: 0, sales: 0, grossCents: 0, platformFeeCents: 0, creatorCents: 0 }; }
      for (const r of lic) { const p = per[r.data.themeId]; if (p && r.data.status === 'active' && r.data.source !== 'member') p.holders++; }
      for (const r of sales) {
        const p = per[r.data.themeId]; if (!p) continue;
        const price = Number(r.data.priceCents) || 0, fee = Number(r.data.platformFeeCents) || 0;
        p.sales++; p.grossCents += price; p.platformFeeCents += fee; p.creatorCents += price - fee;
      }
      const items = Object.values(per).sort((a, z) => z.grossCents - a.grossCents || z.uses - a.uses);
      const totals = items.reduce((s, p) => ({ uses: s.uses + p.uses, holders: s.holders + p.holders, sales: s.sales + p.sales, grossCents: s.grossCents + p.grossCents, platformFeeCents: s.platformFeeCents + p.platformFeeCents, creatorCents: s.creatorCents + p.creatorCents }), { uses: 0, holders: 0, sales: 0, grossCents: 0, platformFeeCents: 0, creatorCents: 0 });
      res.json({ items, totals, feeRate: 0.05, example: themeSaleMath(500, fp) });
    } catch (err) { fail(res, '/api/evite-themes/stats', err, 'Could not load your stats.'); }
  });

  // ── signed in: report a theme (someone else's art / brand) ──
  app.post('/api/evite-themes/:id/report', d.authMiddleware, registered, writeLimiter, jsonBody, async (req: any, res: any) => {
    try {
      const t = await loadTheme(d, String(req.params.id || ''));
      if (!t) return res.status(404).json({ error: 'Not found.' });
      await d.firestoreCreateOnce('evite_theme_reports', `${t.id}__${req.uid}`, { themeId: t.id, ownerUid: t.ownerUid, uid: req.uid, reason: clamp(req.body?.reason, 500), at: Date.now() });
      res.json({ ok: true });
    } catch (err) { fail(res, '/api/evite-themes/report', err, 'Could not send the report.'); }
  });

  // ── creator: list a paid theme as a digital product in my shop (off until the store webhook grants licences) ──
  app.post('/api/evite-themes/list-in-shop', d.authMiddleware, registered, writeLimiter, jsonBody, async (req: any, res: any) => {
    try {
      if (!d.shopListing) return res.status(501).json({ error: 'Selling themes in your shop is coming soon. For now, share the theme link.', code: 'SHOP_OFF' });
      const t = await mine(req, req.body?.id);
      if (!t) return res.status(404).json({ error: 'That theme isn’t yours or no longer exists.' });
      if (t.status !== 'published' || t.access !== 'paid') return res.status(409).json({ error: 'Publish it as a paid theme first.' });
      const productId = `evtheme_${t.id}`, now = Date.now();
      const r = await d.firestoreCreateOnce('storeProducts', productId, {
        id: productId, sellerId: req.uid, sellerName: t.ownerName || '', sellerType: 'USER', title: `${t.title} · invitation theme`, description: `${t.description || 'A living invitation theme.'} You get a licence to use it for your own events on Plajah.`,
        category: 'DIGITAL', price: t.priceCents / 100, images: [t.assets.thumb, t.assets.plate], stock: 0, trackInventory: false, isDigital: true, isActive: true,
        tags: [...t.tags, 'evite theme'], linkedAssetId: themeTemplateId(t.id), createdAt: now, updatedAt: now,
      });
      if (r === 'error') return res.status(500).json({ error: 'Could not add it to your shop.' });
      res.json({ ok: true, productId, existed: r === 'exists' });
    } catch (err) { fail(res, '/api/evite-themes/list-in-shop', err, 'Could not add it to your shop.'); }
  });
}
