// evitePrintCore — PURE rules for printed Plajah Evites: products, paper, quantities, at-cost pricing, the print layout
// (bleed / trim / safe / text / QR boxes at 300 dpi), address + order validation, and two tiny JPEG helpers.
// No DOM, no Node APIs: shared by the browser renderer (evitePrintRender), the host sheet and the server.
//
// Pricing rule (owner): personal events carry NO platform cut. Print is a physical product Plajah resells, so until the
// owner picks a margin it is sold AT COST: provider price + shipping + Stripe processing, grossed up so Plajah nets zero.
//
// Art rule (owner): names are never baked into stored art. The print file is rendered per order from the plate + the
// invite's live text, so every printed card is that order's own file.
import { grossUpCents, type FeeParams } from '../giftFees';

// ── OWNER DECISION ────────────────────────────────────────────────────────────────────────────────────────────────
/** Plajah's margin on printed invitations, in percent of provider cost (prints + shipping). 0 = sold at cost.
 *  OWNER DECISION: change only with the owner's sign-off. Processing is always grossed up on top, so 0 nets $0. */
export const PRINT_MARGIN_PCT = 0;
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export const PRINT_DPI = 300;
export const PRINT_BLEED_IN = 0.125;
export const PRINT_SAFE_IN = 0.125;          // inside the trim line: nothing important past here
export const PRINT_MAX_FILE_BYTES = 12 * 1024 * 1024;

export type PrintProductId = 'card_5x7' | 'card_4x6' | 'card_a6';
export type PrintPaperId = 'silk' | 'matte' | 'recycled';

export interface PrintProduct {
  id: PrintProductId;
  label: string;
  blurb: string;
  /** Finished (trimmed) size in inches. */
  trimIn: { w: number; h: number };
  /** Gelato's format token for flat cards (`cards_pf_<format>_pt_<paper>_cl_4-0_ver`). UNVERIFIED: confirm against
   *  the Gelato catalog (GET product.gelatoapis.com/v3/catalogs/cards/products:search) before go-live. */
  gelatoFormat: string;
}

export interface PrintPaper { id: PrintPaperId; label: string; blurb: string; /** Gelato paper token, UNVERIFIED (see above). */ gelatoPaper: string }

export const PRINT_PRODUCTS: PrintProduct[] = [
  { id: 'card_5x7', label: '5 × 7 in', blurb: 'The classic invitation size', trimIn: { w: 5, h: 7 }, gelatoFormat: '5r' },
  { id: 'card_4x6', label: '4 × 6 in', blurb: 'Postcard size, fits the art exactly', trimIn: { w: 4, h: 6 }, gelatoFormat: '4r' },
  { id: 'card_a6', label: 'A6', blurb: '105 × 148 mm, the European postcard', trimIn: { w: 105 / 25.4, h: 148 / 25.4 }, gelatoFormat: 'a6' },
];

// OWNER DECISION: which stocks to offer. Tokens are Gelato's naming pattern but must be verified in their catalog.
export const PRINT_PAPERS: PrintPaper[] = [
  { id: 'silk', label: 'Silk', blurb: '350 gsm coated silk, soft sheen, colours pop', gelatoPaper: '350-gsm-coated-silk' },
  { id: 'matte', label: 'Matte', blurb: '350 gsm uncoated, writes like paper', gelatoPaper: '350-gsm-uncoated' },
  { id: 'recycled', label: 'Recycled', blurb: '350 gsm recycled uncoated', gelatoPaper: '350-gsm-uncoated-recycled' },
];

export const PRINT_QTY_TIERS = [10, 25, 50, 75, 100, 150, 200] as const;

/** Countries we ship printed invites to. OWNER DECISION: widen as Gelato coverage and tax handling allow. */
export const PRINT_COUNTRIES: Array<{ code: string; label: string }> = [
  { code: 'US', label: 'United States' }, { code: 'CA', label: 'Canada' }, { code: 'GB', label: 'United Kingdom' },
  { code: 'IE', label: 'Ireland' }, { code: 'AU', label: 'Australia' }, { code: 'NZ', label: 'New Zealand' },
  { code: 'DE', label: 'Germany' }, { code: 'FR', label: 'France' }, { code: 'NL', label: 'Netherlands' },
  { code: 'ES', label: 'Spain' }, { code: 'IT', label: 'Italy' },
];
const STATE_REQUIRED = new Set(['US', 'CA', 'AU']);

export const printProduct = (id: unknown): PrintProduct | null => PRINT_PRODUCTS.find(p => p.id === id) || null;
export const printPaper = (id: unknown): PrintPaper | null => PRINT_PAPERS.find(p => p.id === id) || null;
export const isPrintQty = (q: unknown): q is number => typeof q === 'number' && (PRINT_QTY_TIERS as readonly number[]).includes(q);

/** Gelato flat-card product UID for this product + paper: front printed full colour (4-0), back blank. UNVERIFIED. */
export const gelatoProductUid = (product: PrintProduct, paper: PrintPaper) =>
  `cards_pf_${product.gelatoFormat}_pt_${paper.gelatoPaper}_cl_4-0_ver`;

// ── Layout ────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface Rect { x: number; y: number; w: number; h: number }
export interface PrintLayout {
  dpi: number;
  /** Full file size in px (trim + bleed on every side). */
  widthPx: number;
  heightPx: number;
  bleedPx: number;
  safeInsetPx: number;
  /** The whole file; the plate covers this. */
  bleed: Rect;
  /** Where the cutter goes. */
  trim: Rect;
  /** Keep text and the QR inside this. */
  safe: Rect;
  /** Where the eyebrow / headline / subline / date / venue sit (bottom of the safe box, above the QR row). */
  text: Rect;
  /** The QR tile (white, with its own quiet zone), bottom-right of the safe box. */
  qr: Rect;
  /** Scrim / paper-wash gradient region: full bleed width, from above the text to the bottom bleed edge. */
  scrim: Rect;
  /** Typographic unit: one "guest-page CSS px" on this card (the guest page card is ~400 px wide). */
  unit: number;
}

const QR_IN = 0.7;            // printed QR tile side; ~5.7 px/module at 300 dpi for a /i/<id> link, scans from a phone
const QR_GAP_IN = 0.08;

/** Every rectangle in pixels at `dpi` (default 300). `scale` shrinks the whole layout for previews (0 < scale ≤ 1). */
export function printLayout(product: PrintProduct, opts: { dpi?: number; scale?: number } = {}): PrintLayout {
  const dpi = (opts.dpi || PRINT_DPI) * (opts.scale && opts.scale > 0 && opts.scale <= 1 ? opts.scale : 1);
  const px = (inches: number) => inches * dpi;
  const widthPx = Math.round(px(product.trimIn.w + 2 * PRINT_BLEED_IN));
  const heightPx = Math.round(px(product.trimIn.h + 2 * PRINT_BLEED_IN));
  const bleedPx = px(PRINT_BLEED_IN);
  const safeInsetPx = px(PRINT_SAFE_IN);
  const bleed: Rect = { x: 0, y: 0, w: widthPx, h: heightPx };
  // The trim box is the exact physical card, centred; rounding the file to whole pixels only nudges the bleed (< 0.5 px).
  const tw = px(product.trimIn.w), th = px(product.trimIn.h);
  const trim: Rect = { x: (widthPx - tw) / 2, y: (heightPx - th) / 2, w: tw, h: th };
  const safe: Rect = { x: trim.x + safeInsetPx, y: trim.y + safeInsetPx, w: trim.w - 2 * safeInsetPx, h: trim.h - 2 * safeInsetPx };
  const q = px(QR_IN);
  const qr: Rect = { x: safe.x + safe.w - q, y: safe.y + safe.h - q, w: q, h: q };
  const textTop = safe.y + safe.h * 0.5;
  const text: Rect = { x: safe.x, y: textTop, w: safe.w, h: qr.y - px(QR_GAP_IN) - textTop };
  const scrimTop = Math.max(0, text.y - px(1.1));
  const scrim: Rect = { x: 0, y: scrimTop, w: widthPx, h: heightPx - scrimTop };
  return { dpi, widthPx, heightPx, bleedPx, safeInsetPx, bleed, trim, safe, text, qr, scrim, unit: text.w / 400 };
}

/** Where the plate (wPx × hPx) must be drawn to cover `box` with no gaps (CSS object-fit: cover, centred). */
export function coverRect(srcW: number, srcH: number, box: Rect): Rect & { scale: number } {
  const scale = Math.max(box.w / srcW, box.h / srcH);
  const w = srcW * scale, h = srcH * scale;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h, scale };
}

// ── Pricing ───────────────────────────────────────────────────────────────────────────────────────────────────────

export interface PrintQuoteInput {
  product: PrintProductId;
  paper: PrintPaperId;
  qty: number;
  /** Provider price per card in cents. Ignored when `providerItemsCents` (the provider's exact line total) is given. */
  providerUnitCents?: number;
  providerItemsCents?: number;
  shippingCents: number;
  fee?: FeeParams;
  marginPct?: number;          // tests only; production always uses PRINT_MARGIN_PCT
}

export interface PrintQuote {
  product: PrintProductId;
  paper: PrintPaperId;
  qty: number;
  currency: 'usd';
  /** What the provider charges Plajah for the cards. */
  itemsCents: number;
  shippingCents: number;
  /** Plajah's margin (0 while PRINT_MARGIN_PCT is 0). */
  marginCents: number;
  /** Stripe processing, grossed up so Plajah keeps exactly items + shipping + margin after Stripe's fee. */
  processingCents: number;
  totalCents: number;
  /** total / qty, rounded up, for display only. */
  perCardCents: number;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export function quotePrint(i: PrintQuoteInput): Result<PrintQuote> {
  if (!printProduct(i.product)) return { ok: false, error: 'Pick a card size.' };
  if (!printPaper(i.paper)) return { ok: false, error: 'Pick a paper.' };
  if (!isPrintQty(i.qty)) return { ok: false, error: `Choose a quantity: ${PRINT_QTY_TIERS.join(', ')}.` };
  const items = i.providerItemsCents !== undefined ? i.providerItemsCents : (i.providerUnitCents ?? NaN) * i.qty;
  const ship = i.shippingCents;
  if (!Number.isFinite(items) || items <= 0 || !Number.isFinite(ship) || ship < 0) return { ok: false, error: 'The printer did not return a price. Try again in a moment.' };
  const itemsCents = Math.round(items), shippingCents = Math.round(ship);
  const pct = i.marginPct ?? PRINT_MARGIN_PCT;
  const marginCents = Math.round((itemsCents + shippingCents) * Math.max(0, pct) / 100);
  const net = itemsCents + shippingCents + marginCents;
  const g = grossUpCents(net, i.fee);
  return { ok: true, value: {
    product: i.product, paper: i.paper, qty: i.qty, currency: 'usd',
    itemsCents, shippingCents, marginCents, processingCents: g.feeCents, totalCents: g.grossCents, perCardCents: Math.ceil(g.grossCents / i.qty),
  } };
}

// ── Address + order ───────────────────────────────────────────────────────────────────────────────────────────────

export interface PrintAddress { name: string; line1: string; line2?: string; city: string; state?: string; postalCode: string; country: string; phone?: string }

const clamp = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

export function cleanAddress(raw: any): Result<PrintAddress> {
  const a: PrintAddress = {
    name: clamp(raw?.name, 80), line1: clamp(raw?.line1, 120), line2: clamp(raw?.line2, 120) || undefined,
    city: clamp(raw?.city, 80), state: clamp(raw?.state, 40) || undefined, postalCode: clamp(raw?.postalCode, 16).toUpperCase(),
    country: clamp(raw?.country, 2).toUpperCase(), phone: clamp(raw?.phone, 24) || undefined,
  };
  if (!PRINT_COUNTRIES.some(c => c.code === a.country)) return { ok: false, error: 'We can’t ship printed cards to that country yet.' };
  if (!a.name) return { ok: false, error: 'Add the name the cards should ship to.' };
  if (!a.line1) return { ok: false, error: 'Add a street address.' };
  if (!a.city) return { ok: false, error: 'Add a city.' };
  if (STATE_REQUIRED.has(a.country) && !a.state) return { ok: false, error: a.country === 'CA' ? 'Add a province.' : 'Add a state.' };
  if (a.country === 'US' && !/^\d{5}(-\d{4})?$/.test(a.postalCode)) return { ok: false, error: 'Add a 5-digit ZIP code.' };
  if (!/^[A-Z0-9][A-Z0-9 -]{1,14}$/.test(a.postalCode)) return { ok: false, error: 'Add a postal code.' };
  if (a.phone && !/^[+()\d .-]{6,24}$/.test(a.phone)) return { ok: false, error: 'That phone number doesn’t look right.' };
  // Drop undefined keys: Firestore REST writes reject `undefined`.
  for (const k of Object.keys(a) as Array<keyof PrintAddress>) if (a[k] === undefined) delete a[k];
  return { ok: true, value: a };
}

export interface PrintOrderInput { product: PrintProduct; paper: PrintPaper; qty: number; address: PrintAddress }

export function checkPrintOrder(raw: any): Result<PrintOrderInput> {
  const product = printProduct(raw?.product);
  if (!product) return { ok: false, error: 'Pick a card size.' };
  const paper = printPaper(raw?.paper);
  if (!paper) return { ok: false, error: 'Pick a paper.' };
  const qty = Number(raw?.qty);
  if (!isPrintQty(qty)) return { ok: false, error: `Choose a quantity: ${PRINT_QTY_TIERS.join(', ')}.` };
  const addr = cleanAddress(raw?.address);
  if (addr.ok === false) return addr;
  return { ok: true, value: { product, paper, qty, address: addr.value } };
}

// ── JPEG helpers (used by the renderer to stamp 300 dpi, and by the server to check an upload) ────────────────────

/** Width/height from a baseline or progressive JPEG's SOF marker; null if the bytes are not a JPEG. */
export function jpegSize(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7) || m === 0xff) { i += m === 0xff ? 1 : 2; continue; }
    const len = (b[i + 2] << 8) | b[i + 3];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] };
    if (m === 0xd9 || m === 0xda) return null;
    i += 2 + len;
  }
  return null;
}

/** Stamp the JFIF APP0 density as `dpi` dots per inch (canvas writes 1:1 aspect units). Returns a copy; untouched if no JFIF header. */
export function setJpegDpi(b: Uint8Array, dpi = PRINT_DPI): Uint8Array {
  const out = Uint8Array.from(b);               // a real copy (Buffer#slice would share memory)
  // FF D8 | FF E0 len(2) 'J''F''I''F'\0 ver(2) units(1) Xdensity(2) Ydensity(2)
  if (out.length > 18 && out[2] === 0xff && out[3] === 0xe0 && out[6] === 0x4a && out[7] === 0x46 && out[8] === 0x49 && out[9] === 0x46 && out[10] === 0) {
    out[13] = 1; out[14] = (dpi >> 8) & 0xff; out[15] = dpi & 0xff; out[16] = (dpi >> 8) & 0xff; out[17] = dpi & 0xff;
  }
  return out;
}

/** Does an uploaded print file match the product exactly (a JPEG at the full 300 dpi bleed size)? */
export function checkPrintFile(b: Uint8Array, product: PrintProduct): Result<{ width: number; height: number }> {
  if (b.length > PRINT_MAX_FILE_BYTES) return { ok: false, error: 'The print file is too large.' };
  const s = jpegSize(b);
  if (!s) return { ok: false, error: 'The print file must be a JPEG.' };
  const L = printLayout(product);
  if (s.width !== L.widthPx || s.height !== L.heightPx) return { ok: false, error: `The print file must be ${L.widthPx} × ${L.heightPx} px for ${product.label}.` };
  return { ok: true, value: s };
}

export const money = (c: number) => `$${(c / 100).toFixed(2)}`;
