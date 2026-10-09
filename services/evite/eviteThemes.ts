// eviteThemes — PURE rules for creator themes (the Evites theme marketplace). No I/O: the server
// (eviteThemeServer.ts), the browser client and the tests all share these.
//
// A theme is a creator's own art (plate + depth map + thumb) wearing the motion and typography of one catalogue
// collection (`preset`). An invite stores it as its design id: "theme:<id>" (catalogue ids look like "wedding/olive").
//
// Buying or claiming a theme gives a LICENSE to use it for your own events; the source stays the creator's.
// Licenses that were paid for or gifted can be passed on to another person ("trade").
//
// Access modes
//   free       anyone may use it (claiming just saves it to your library)
//   paid       one-time price. Stripe Checkout destination charge to the creator's connected account; Plajah keeps
//              a 5% application fee (owner rule for direct sales; gifts and personal events are 0%)
//   sanctuary  members of the creator's Sanctuary (sanctuaryMemberships/{creator}_{uid}, status ACTIVE)
//   private    only the creator
//
// Stripe's processing fee: on a destination charge the PLATFORM's balance pays Stripe's fee (same as course sales,
// server.ts /api/stripe/course-checkout, and the Elevate note "Destination charge: the PLATFORM's balance pays
// Stripe's fee"). So the creator receives price − 5%, and Plajah's 5% has to cover Stripe's ~2.9% + 30¢.
// `themeSaleMath` shows the platform's estimated net, which is negative below about $14.29 (see report).
import { PLATE_COLLECTIONS } from './plateCatalog';

export type ThemeAccess = 'free' | 'paid' | 'sanctuary' | 'private';
export type ThemeStatus = 'draft' | 'published' | 'removed';
export const THEME_ACCESS: ThemeAccess[] = ['free', 'paid', 'sanctuary', 'private'];

export interface EviteThemeAssets { plate: string; depth?: string; thumb: string }

export interface EviteTheme {
  id: string;
  ownerUid: string;
  /** display name captured when saved (for the market card) */
  ownerName?: string;
  title: string;
  description: string;
  tags: string[];
  /** catalogue collection whose motion recipe + typographic voice the theme borrows ('wedding', 'kids_boy', …) */
  preset: string;
  /** foil colour override, #RRGGBB */
  foil?: string;
  /** typographic voice (a collection id); defaults to the preset's */
  voice?: string;
  /** the lower 45% of the art (where the live text sits) is light: dark ink on a paper wash */
  light: boolean;
  assets: EviteThemeAssets;
  access: ThemeAccess;
  /** one-time price for `paid`, in cents (0 otherwise) */
  priceCents: number;
  /** for `sanctuary`: the creator's own Sanctuary (== ownerUid) */
  sanctuaryId?: string;
  /** for `sanctuary`: limit to these tiers (empty = any active member) */
  sanctuaryTierIds?: string[];
  status: ThemeStatus;
  /** shown in the public market (a published theme can be unlisted: existing licences keep working, no new ones) */
  listed: boolean;
  /** distinct people who used it in an invite */
  uses: number;
  /** paid licences sold */
  sales: number;
  /** 64-bit difference hash of the thumb (hex), for "this looks like an existing theme" */
  dhash?: string;
  /** "I made this or have the rights to use it" — recorded at publish */
  attestation?: { at: number; text: string };
  createdAt: number;
  updatedAt: number;
  publishedAt?: number;
}

export type LicenseSource = 'claim' | 'purchase' | 'gift' | 'transfer' | 'member';
export type LicenseStatus = 'active' | 'transferred' | 'revoked';

export interface EviteThemeLicense {
  /** `${uid}__${themeId}` */
  id: string;
  uid: string;
  themeId: string;
  ownerUid: string;
  source: LicenseSource;
  status: LicenseStatus;
  /** bumps every time this doc is re-activated; transfer locks are per generation, so one licence moves once */
  gen: number;
  sessionId?: string;
  fromUid?: string;
  transferredTo?: string;
  createdAt: number;
  updatedAt: number;
}

/** The art an invite borrows (same shape as EviteDeps' `EviteArt` in eviteServer.ts). */
export interface ThemeArt { plate: string; depth?: string; thumb?: string; preset: string; foil?: string; voice?: string; light?: boolean }

export const ATTESTATION_TEXT = 'I made this or have the rights to use it.';
export const PLATFORM_FEE_RATE = 0.05;
export const MIN_PRICE_CENTS = 100;
export const MAX_PRICE_CENTS = 10_000;
export const PLATE_W = 812, PLATE_H = 1224, THUMB_W = 240, THUMB_H = 362;

// ── ids ─────────────────────────────────────────────────────────────────────
export const THEME_PREFIX = 'theme:';
const ID_RE = /^[a-z0-9]{10}$/;
export const isThemeKey = (id: unknown): id is string => typeof id === 'string' && ID_RE.test(id);
export const themeTemplateId = (id: string) => `${THEME_PREFIX}${id}`;
export function themeIdOf(templateId: unknown): string | null {
  if (typeof templateId !== 'string' || !templateId.startsWith(THEME_PREFIX)) return null;
  const id = templateId.slice(THEME_PREFIX.length);
  return isThemeKey(id) ? id : null;
}
export const isThemeId = (templateId: unknown): templateId is string => themeIdOf(templateId) !== null;
export const licenseId = (uid: string, themeId: string) => `${uid}__${themeId}`;
/** Where a theme is opened in the app (share links, Checkout return). */
export const themeSharePath = (id: string) => `/?evite_theme=${encodeURIComponent(id)}`;

// ── access ──────────────────────────────────────────────────────────────────
/** Does this licence grant use? A 'member' bookmark does not (membership is re-checked live). */
export const licenseGrants = (l: Pick<EviteThemeLicense, 'status' | 'source'> | null | undefined): boolean => !!l && l.status === 'active' && l.source !== 'member';
/** Paid-for or gifted licences can be passed on. Free claims can't (just share the link); member access can't. */
export const licenseTransferable = (l: Pick<EviteThemeLicense, 'status' | 'source'> | null | undefined): boolean =>
  !!l && l.status === 'active' && (l.source === 'purchase' || l.source === 'gift' || l.source === 'transfer');

export function canUseTheme(theme: Pick<EviteTheme, 'ownerUid' | 'status' | 'access'> | null | undefined, uid: string | null | undefined, ctx: { licensed?: boolean; sanctuaryMember?: boolean } = {}): boolean {
  if (!theme || theme.status !== 'published' || !uid) return false;
  if (theme.ownerUid === uid) return true;
  // A licence is a granted right: it survives the creator later changing the price or access mode (a buyer of a
  // theme that goes private keeps it; a creator can gift a private theme to family).
  if (ctx.licensed) return true;
  switch (theme.access) {
    case 'free': return true;
    case 'sanctuary': return !!ctx.sanctuaryMember;
    default: return false;                                                // paid without a licence, private
  }
}

/** Public market / share link: published, not private, not removed. The owner always sees their own. */
export function canSeeTheme(theme: Pick<EviteTheme, 'ownerUid' | 'status' | 'access'> | null | undefined, uid?: string | null): boolean {
  if (!theme || theme.status === 'removed') return false;
  if (uid && theme.ownerUid === uid) return true;
  return theme.status === 'published' && theme.access !== 'private';
}
export const inMarket = (t: Pick<EviteTheme, 'status' | 'access' | 'listed'>) => t.status === 'published' && t.listed && t.access !== 'private';

/** The Sanctuary rule from services/sanctuaryService.ts `hasAccess` (TIER): ACTIVE, and in a required tier if any are set. */
export function sanctuaryAllows(membership: { status?: string; tierId?: string } | null | undefined, tierIds?: string[]): boolean {
  if (!membership || membership.status !== 'ACTIVE') return false;
  return !tierIds?.length || tierIds.includes(String(membership.tierId || ''));
}

export function themeArt(t: Pick<EviteTheme, 'assets' | 'preset' | 'foil' | 'voice' | 'light'>): ThemeArt {
  return { plate: t.assets.plate, depth: t.assets.depth, thumb: t.assets.thumb, preset: t.preset, foil: t.foil, voice: t.voice, light: !!t.light };
}

// ── money ───────────────────────────────────────────────────────────────────
export function validatePriceCents(v: unknown): { ok: true; cents: number } | { ok: false; error: string } {
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return { ok: false, error: 'Enter the price in whole cents.' };
  if (n < MIN_PRICE_CENTS) return { ok: false, error: `The lowest price is $${(MIN_PRICE_CENTS / 100).toFixed(2)}.` };
  if (n > MAX_PRICE_CENTS) return { ok: false, error: `The highest price is $${(MAX_PRICE_CENTS / 100).toFixed(2)}.` };
  return { ok: true, cents: n };
}

/**
 * One theme sale. `platformFeeCents` rides as application_fee_amount; the creator's connected account receives the
 * rest. Stripe's fee comes out of the platform's balance on a destination charge, so `platformNetCents` is what
 * Plajah actually keeps (an estimate at 2.9% + 30¢ unless overridden).
 */
export function themeSaleMath(priceCents: number, p: { rate?: number; fixedCents?: number } = {}) {
  const price = Math.max(0, Math.round(priceCents));
  const platformFeeCents = Math.round(price * PLATFORM_FEE_RATE);
  const estStripeFeeCents = price ? Math.round(price * (p.rate ?? 0.029) + (p.fixedCents ?? 30)) : 0;
  return { priceCents: price, platformFeeCents, creatorCents: price - platformFeeCents, estStripeFeeCents, platformNetCents: platformFeeCents - estStripeFeeCents };
}
export const formatCents = (c: number) => `$${(Math.max(0, c) / 100).toFixed(2)}`;

// ── input cleaning ──────────────────────────────────────────────────────────
const clamp = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const COLLECTION_IDS = new Set(PLATE_COLLECTIONS.map(c => c.id));
export const isPreset = (v: unknown): v is string => typeof v === 'string' && COLLECTION_IDS.has(v);
export const PRESETS = PLATE_COLLECTIONS.map(c => ({ id: c.id, label: c.label }));

export function cleanTags(v: unknown): string[] {
  const arr = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [];
  const out: string[] = [];
  for (const x of arr) {
    const t = clamp(x, 24).toLowerCase().replace(/^#/, '').replace(/[^a-z0-9 &'-]/g, '').trim();
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= 8) break;
  }
  return out;
}
export const cleanHex = (v: unknown): string | undefined => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim()) ? v.trim().toUpperCase() : undefined;

/**
 * Brands and characters we refuse by name (title, description, tags). Not a substitute for review: the attestation
 * and reports carry the rest. Plajah's own (Chora, Reello) are fine.
 */
const BRAND_RE = /\b(disney|pixar|marvel|avengers|spider[- ]?man|batman|superman|dc comics|star wars|mandalorian|pok[eé]mon|pikachu|nintendo|super mario|zelda|sonic the hedgehog|barbie|hot wheels|lego|paw patrol|peppa pig|bluey|cocomelon|disney frozen|moana|encanto|minecraft|fortnite|roblox|hello kitty|sanrio|my little pony|transformers|teenage mutant|ninja turtles|harry potter|hogwarts|looney tunes|sesame street|blippi|ms rachel|power rangers|minions|despicable me|shrek|toy story|cars movie|lightning mcqueen|nfl|nba|mlb|nhl|fifa|ncaa|nike|adidas|coca[- ]?cola|taylor swift|beyonc[eé])\b/i;
export function brandFlag(...texts: Array<string | string[] | undefined>): string | null {
  const s = texts.flat().filter(Boolean).join(' · ');
  const m = BRAND_RE.exec(s);
  return m ? m[0] : null;
}

/** Firebase Storage download URL whose object lives under users/{uid}/evite-themes/ (or `alsoAllow` prefixes). */
export function storageObjectPath(url: unknown): string | null {
  if (typeof url !== 'string' || url.length > 1200) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.hostname !== 'firebasestorage.googleapis.com') return null;
    const m = /^\/v0\/b\/[a-z0-9._-]+\/o\/([^/]+)$/i.exec(u.pathname);
    if (!m) return null;
    const p = decodeURIComponent(m[1]);
    return p.includes('..') || p.includes('//') ? null : p;
  } catch { return null; }
}
export const isOwnUpload = (url: unknown, uid: string) => { const p = storageObjectPath(url); return !!p && p.startsWith(`users/${uid}/evite-themes/`); };
export const isFrozenAsset = (url: unknown, themeId: string) => { const p = storageObjectPath(url); return !!p && p.startsWith(`evite-themes/${themeId}/`); };

export type ThemeInput = Partial<Pick<EviteTheme, 'title' | 'description' | 'tags' | 'preset' | 'foil' | 'voice' | 'light' | 'assets' | 'access' | 'priceCents' | 'sanctuaryTierIds' | 'dhash'>>;

/**
 * Validate a create/update from the creator. `prev` is the stored theme (assets already on it are kept as-is, so
 * frozen copies survive an edit). New asset URLs must be the creator's own uploads.
 */
export function cleanThemeInput(b: any, uid: string, prev?: EviteTheme | null): { ok: true; value: Omit<EviteTheme, 'id' | 'ownerUid' | 'status' | 'listed' | 'uses' | 'sales' | 'createdAt' | 'updatedAt'> } | { ok: false; error: string } {
  b = b || {};
  const title = b.title === undefined ? prev?.title || '' : clamp(b.title, 60);
  if (title.length < 2) return { ok: false, error: 'Give your theme a name.' };
  const description = b.description === undefined ? prev?.description || '' : clamp(b.description, 280);
  const tags = b.tags === undefined ? prev?.tags || [] : cleanTags(b.tags);
  const preset = b.preset === undefined ? prev?.preset : b.preset;
  if (!isPreset(preset)) return { ok: false, error: 'Pick which style the theme moves like.' };
  const voice = b.voice === undefined ? prev?.voice : (b.voice ? String(b.voice) : undefined);
  if (voice !== undefined && !isPreset(voice)) return { ok: false, error: 'Unknown lettering style.' };
  const foil = b.foil === undefined ? prev?.foil : cleanHex(b.foil);
  const light = b.light === undefined ? !!prev?.light : !!b.light;

  const a = b.assets === undefined ? prev?.assets : b.assets;
  if (!a || typeof a !== 'object') return { ok: false, error: 'Upload your art first.' };
  const keep = (k: keyof EviteThemeAssets) => !!prev?.assets && a[k] === prev.assets[k];
  const okUrl = (k: keyof EviteThemeAssets) => keep(k) || isOwnUpload(a[k], uid);
  if (!a.plate || !okUrl('plate')) return { ok: false, error: 'The art must be uploaded from your account.' };
  if (!a.thumb || !okUrl('thumb')) return { ok: false, error: 'The thumbnail must be uploaded from your account.' };
  if (a.depth && !okUrl('depth')) return { ok: false, error: 'The depth map must be uploaded from your account.' };
  const assets: EviteThemeAssets = { plate: String(a.plate), thumb: String(a.thumb), ...(a.depth ? { depth: String(a.depth) } : {}) };

  // Evite themes are FREE by default; charging, members-only or private is the creator's choice.
  const access: ThemeAccess = b.access === undefined ? prev?.access || 'free' : b.access;
  if (!THEME_ACCESS.includes(access)) return { ok: false, error: 'Choose who can use the theme.' };
  let priceCents = 0;
  if (access === 'paid') {
    const p = validatePriceCents(b.priceCents === undefined ? prev?.priceCents : b.priceCents);
    if (p.ok === false) return { ok: false, error: p.error };
    priceCents = p.cents;
  }
  const tierIds = access !== 'sanctuary' ? undefined
    : (b.sanctuaryTierIds === undefined ? prev?.sanctuaryTierIds : (Array.isArray(b.sanctuaryTierIds) ? b.sanctuaryTierIds.map((x: any) => clamp(x, 80)).filter(Boolean).slice(0, 10) : []));
  const dhash = b.dhash === undefined ? prev?.dhash : (typeof b.dhash === 'string' && /^[0-9a-f]{16}$/.test(b.dhash) ? b.dhash : undefined);

  const brand = brandFlag(title, description, tags);
  if (brand) return { ok: false, error: `Themes can’t use other brands’ names or characters (“${brand}”). Use art and words you made.` };

  return { ok: true, value: {
    title, description, tags, preset, ...(voice ? { voice } : {}), ...(foil ? { foil } : {}), light, assets, access, priceCents,
    ...(access === 'sanctuary' ? { sanctuaryId: uid, sanctuaryTierIds: tierIds || [] } : {}),
    ...(dhash ? { dhash } : {}),
    ...(prev?.attestation ? { attestation: prev.attestation } : {}), ...(prev?.publishedAt ? { publishedAt: prev.publishedAt } : {}), ...(prev?.ownerName ? { ownerName: prev.ownerName } : {}),
  } };
}

// ── look-alike check ────────────────────────────────────────────────────────
export function hamming64(a: string, b: string): number {
  if (!/^[0-9a-f]{16}$/.test(a) || !/^[0-9a-f]{16}$/.test(b)) return 64;
  let n = 0;
  for (let i = 0; i < 16; i++) { let x = parseInt(a[i], 16) ^ parseInt(b[i], 16); while (x) { n += x & 1; x >>= 1; } }
  return n;
}
/** 9×8 grayscale → 64-bit difference hash (hex). `gray` is row-major, 72 values 0..255. */
export function dhashFromGray(gray: ArrayLike<number>): string {
  let bits = '';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += gray[y * 9 + x] < gray[y * 9 + x + 1] ? '1' : '0';
  let hex = '';
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}
export const LOOKALIKE_BITS = 5;

/** Mean luminance of the bottom 45% of an RGBA image (0..255). `light` when > 150. */
export function bottomLuminance(rgba: ArrayLike<number>, w: number, h: number): number {
  const y0 = Math.floor(h * 0.55);
  let sum = 0, n = 0;
  for (let y = y0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    sum += 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]; n++;
  }
  return n ? sum / n : 0;
}
export const isLightBottom = (rgba: ArrayLike<number>, w: number, h: number) => bottomLuminance(rgba, w, h) > 150;

/** Cover-crop source (sw×sh) into a 2:3 frame: the source rectangle to draw. */
export function coverCrop(sw: number, sh: number, aspect = PLATE_W / PLATE_H): { sx: number; sy: number; sw: number; sh: number } {
  if (sw / sh > aspect) { const w = sh * aspect; return { sx: (sw - w) / 2, sy: 0, sw: w, sh }; }
  const h = sw / aspect; return { sx: 0, sy: (sh - h) / 2, sw, sh: h };
}

// ── market ──────────────────────────────────────────────────────────────────
export type ThemeSort = 'popular' | 'new' | 'price';
export interface MarketQuery { q?: string; tag?: string; preset?: string; access?: ThemeAccess | 'any'; sort?: ThemeSort; maxPriceCents?: number; owner?: string }

/** What anyone may see about a theme. */
export interface PublicTheme {
  id: string; templateId: string; ownerUid: string; ownerName?: string; title: string; description: string; tags: string[];
  preset: string; foil?: string; voice?: string; light: boolean; assets: EviteThemeAssets; access: ThemeAccess; priceCents: number;
  sanctuaryId?: string; uses: number; sales: number; listed: boolean; status: ThemeStatus; createdAt: number; publishedAt?: number;
}
export function toPublicTheme(t: EviteTheme): PublicTheme {
  return {
    id: t.id, templateId: themeTemplateId(t.id), ownerUid: t.ownerUid, ownerName: t.ownerName, title: t.title, description: t.description, tags: t.tags,
    preset: t.preset, foil: t.foil, voice: t.voice, light: !!t.light, assets: t.assets, access: t.access, priceCents: t.access === 'paid' ? t.priceCents : 0,
    sanctuaryId: t.access === 'sanctuary' ? t.sanctuaryId : undefined, uses: t.uses || 0, sales: t.sales || 0, listed: !!t.listed, status: t.status, createdAt: t.createdAt, publishedAt: t.publishedAt,
  };
}

export function filterMarket<T extends Pick<EviteTheme, 'title' | 'description' | 'tags' | 'preset' | 'access' | 'priceCents' | 'uses' | 'createdAt' | 'ownerUid' | 'ownerName'> & { publishedAt?: number }>(themes: T[], q: MarketQuery = {}): T[] {
  const words = clamp(q.q, 80).toLowerCase().split(' ').filter(Boolean);
  const tag = q.tag ? clamp(q.tag, 24).toLowerCase() : '';
  let out = themes.filter(t => {
    if (q.preset && t.preset !== q.preset) return false;
    if (q.access && q.access !== 'any' && t.access !== q.access) return false;
    if (q.owner && t.ownerUid !== q.owner) return false;
    if (tag && !t.tags.includes(tag)) return false;
    if (q.maxPriceCents !== undefined && t.access === 'paid' && t.priceCents > q.maxPriceCents) return false;
    if (words.length) {
      const hay = `${t.title} ${t.description} ${t.tags.join(' ')} ${t.preset.replace(/_/g, ' ')} ${t.ownerName || ''}`.toLowerCase();
      if (!words.every(w => hay.includes(w))) return false;
    }
    return true;
  });
  const when = (t: T) => t.publishedAt || t.createdAt || 0;
  out = out.sort(q.sort === 'new' ? (a, b) => when(b) - when(a)
    : q.sort === 'price' ? (a, b) => (a.access === 'paid' ? a.priceCents : 0) - (b.access === 'paid' ? b.priceCents : 0) || (b.uses || 0) - (a.uses || 0)
    : (a, b) => (b.uses || 0) - (a.uses || 0) || when(b) - when(a));
  return out;
}

/** Firestore index keys stored beside the JSON (single-field equality queries only: no composite indexes needed). */
export const themeIndexFields = (t: EviteTheme) => ({ ownerUid: t.ownerUid, status: t.status, access: t.access, market: inMarket(t) ? 'public' : 'none' });
