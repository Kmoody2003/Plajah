// Reello Story Intelligence — pure helpers (no I/O): normalise what the model read, and turn a
// report into the drafts the account approves. Shared by the API (routes/reelloIntel.ts), the
// uploader UI and the tests, so the rules for prices, packages, clip ranges and the auto-created
// notice live in exactly one place.

import type {
  ArticleDraft, ArticleDraftBlock, IntelOptions, OfferPackage, ProductOffer, QuoteMoment,
  VideoChapter, VideoIntelReport, VideoLink, VideoStill,
} from './types';

export const CLIP_MIN_SEC = 4;
export const CLIP_MAX_SEC = 60;
export const MAX_QUOTES = 8;
export const MAX_OFFERS = 24;
/** Below this an auto-post holds a listing back for a person instead of selling it. */
export const AUTO_PRODUCT_MIN_CONFIDENCE = 0.7;

export const DEFAULT_INTEL_OPTIONS: IntelOptions = {
  article: true, clips: true, merch: true, publishMode: 'APPROVE', merchTarget: { kind: 'USER' }, clipVisibility: 'PUBLIC',
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v.replace(/[^0-9.\-]/g, '')) : NaN;
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown, max = 400): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'item';
const round2 = (n: number) => Math.round(n * 100) / 100;

export const formatClock = (sec: number): string => {
  const s = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
};

// ── Media URLs ────────────────────────────────────────────────────────────────

/** A still frame of a Mux video at t seconds — no ffmpeg, no storage: Mux renders it on request. */
export const muxStillUrl = (playbackId: string, tSec: number, width = 960) =>
  `https://image.mux.com/${playbackId}/thumbnail.jpg?time=${Math.max(0, Math.round(tSec * 10) / 10)}&width=${width}`;

/** Mux instant clip: the same asset, served as a stream that starts at s and ends at e. */
export const muxClipStreamUrl = (playbackId: string, startSec: number, endSec: number) =>
  `https://stream.mux.com/${playbackId}.m3u8?asset_start_time=${Math.max(0, Math.round(startSec * 10) / 10)}&asset_end_time=${Math.round(endSec * 10) / 10}`;

export const watchUrl = (videoId: string, base = 'https://plajah.com', tSec?: number) =>
  `${base.replace(/\/$/, '')}/share?type=video&id=${encodeURIComponent(videoId)}${tSec && tSec > 0 ? `&t=${Math.floor(tSec)}` : ''}`;

// ── The auto-created notice ───────────────────────────────────────────────────

/** Carried by everything posted without a person approving it first. */
export function autoNotice(accountName: string, videoTitle: string): string {
  const who = accountName.trim() || 'The account owner';
  return `Auto-created by Story Intelligence from the video “${videoTitle.trim() || 'Untitled'}”. ${who} may change this soon.`;
}

// ── Prices + packages ─────────────────────────────────────────────────────────

const CURRENCY: Record<string, string> = { '$': 'USD', 'US$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY', 'C$': 'CAD', 'A$': 'AUD' };
const WORD_NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, dozen: 12 };
const qtyOf = (s: string): number | null => {
  const w = s.toLowerCase();
  if (WORD_NUM[w] != null) return WORD_NUM[w];
  const n = parseInt(w, 10);
  return Number.isFinite(n) && n > 0 && n <= 500 ? n : null;
};

/** "$19.99", "19.99 USD", "€12", "12 dollars", "$1,200" → amount + ISO currency. */
export function parsePrice(text: string): { amount: number; currency: string } | null {
  const t = text.replace(/,(?=\d{3}\b)/g, '');
  let m = t.match(/(US\$|C\$|A\$|[$€£¥])\s?(\d+(?:\.\d{1,2})?)/);
  if (m) return { amount: parseFloat(m[2]), currency: CURRENCY[m[1]] || 'USD' };
  m = t.match(/(\d+(?:\.\d{1,2})?)\s?(usd|dollars?|bucks|eur|euros?|gbp|pounds?)\b/i);
  if (m) {
    const c = m[2].toLowerCase();
    return { amount: parseFloat(m[1]), currency: /eur/.test(c) ? 'EUR' : /gbp|pound/.test(c) ? 'GBP' : 'USD' };
  }
  return null;
}

/**
 * Packages in a price phrase: "3 for $50", "2-pack $30", "bundle of 4 for $60", "6 pack: $45",
 * "buy 2 get 1 free" (needs the single price). Returns [] when the phrase is a single price.
 */
export function parsePackages(text: string, singlePrice?: number | null): OfferPackage[] {
  const out: OfferPackage[] = [];
  const t = text.toLowerCase().replace(/,(?=\d{3}\b)/g, '');
  const Q = '(\\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve|dozen)';
  const P = '((?:us\\$|c\\$|a\\$|[$€£¥])\\s?\\d+(?:\\.\\d{1,2})?|\\d+(?:\\.\\d{1,2})?\\s?(?:usd|dollars?|bucks))';
  const pats = [
    new RegExp(`${Q}\\s*(?:for|/)\\s*${P}`, 'g'),                                   // 3 for $50
    new RegExp(`${Q}[\\s-]*(?:pack|pk|bundle|set|count|ct)\\b[^\\d$€£¥]{0,12}${P}`, 'g'), // 2-pack $30
    new RegExp(`(?:bundle|pack|set) of ${Q}[^\\d$€£¥]{0,12}${P}`, 'g'),              // bundle of 4 for $60
  ];
  for (const re of pats) {
    for (const m of t.matchAll(re)) {
      const q = qtyOf(m[1]); const p = parsePrice(m[2]);
      if (q && p && q > 1) out.push({ quantity: q, price: p.amount, label: m[0].trim() });
    }
  }
  const bogo = t.match(new RegExp(`buy ${Q},? get ${Q} free`));
  if (bogo && singlePrice) {
    const buy = qtyOf(bogo[1]) || 0, free = qtyOf(bogo[2]) || 0;
    if (buy > 0 && free > 0) out.push({ quantity: buy + free, price: round2(buy * singlePrice), label: bogo[0] });
  }
  return dedupePackages(out);
}

function dedupePackages(pkgs: OfferPackage[]): OfferPackage[] {
  const by = new Map<number, OfferPackage>();
  for (const p of pkgs) {
    if (!(p.quantity >= 1) || !(p.price > 0)) continue;
    const prev = by.get(p.quantity);
    if (!prev || p.price < prev.price) by.set(p.quantity, { ...p, price: round2(p.price) });
  }
  return [...by.values()].sort((a, b) => a.quantity - b.quantity);
}

// ── Links ─────────────────────────────────────────────────────────────────────

const URL_RE = /\b((?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|shop|store|co|io|me|tv|app|link|ly|gg|us|uk|ca|biz|info)(?:\/[^\s)"'<>]*)?)/gi;

/** Normalise one URL (adds https, strips trailing punctuation). Null when it isn't a web address. */
export function normalizeUrl(raw: string): string | null {
  let s = str(raw, 500).replace(/[.,;:!?)\]]+$/, '');
  if (!s) return null;
  // Spoken forms the model sometimes passes through verbatim.
  s = s.replace(/\s+dot\s+/gi, '.').replace(/\s+slash\s+/gi, '/').replace(/\s+/g, '');
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (!/\.[a-z]{2,}$/i.test(u.hostname)) return null;
    return u.toString().replace(/\/$/, u.pathname === '/' && !u.search ? '' : '/');
  } catch { return null; }
}

/** Every web address in a block of text (a description, a transcript line, an OCR'd graphic). */
export function extractUrls(text: string): string[] {
  const out = new Set<string>();
  for (const m of (text || '').matchAll(URL_RE)) {
    const u = normalizeUrl(m[1]);
    if (u) out.add(u);
  }
  return [...out];
}

// ── Normalising the model's read ──────────────────────────────────────────────

/** The model's raw offers (any shape it returned) → deduped, priced, packaged offers. */
export function normalizeOffers(raw: unknown, opts: { durationSec?: number; description?: string } = {}): ProductOffer[] {
  const list = Array.isArray(raw) ? raw : [];
  const dur = opts.durationSec && opts.durationSec > 0 ? opts.durationSec : Number.MAX_SAFE_INTEGER;
  const merged = new Map<string, ProductOffer>();
  for (const r of list as any[]) {
    const name = str(r?.name, 120);
    if (!name) continue;
    const priceText = [str(r?.priceText, 200), str(r?.price, 40)].filter(Boolean).join(' ');
    const parsed = parsePrice(priceText) || (num(r?.price) != null ? { amount: num(r?.price)!, currency: str(r?.currency, 3).toUpperCase() || 'USD' } : null);
    let single: number | null = parsed && parsed.amount > 0 ? parsed.amount : null;
    const pkgs: OfferPackage[] = [];
    for (const p of Array.isArray(r?.packages) ? r.packages : []) {
      const q = num(p?.quantity); const pr = num(p?.price);
      if (q && pr && q >= 1) pkgs.push({ quantity: Math.round(q), price: pr, label: str(p?.label, 80) || `${Math.round(q)} for ${pr}` });
    }
    pkgs.push(...parsePackages(priceText, single));
    // "3 for $50" on its own is a package, not a unit price.
    if (single != null && pkgs.some(p => p.quantity > 1 && Math.abs(p.price - single!) < 0.005)) single = null;
    if (single != null) pkgs.push({ quantity: 1, price: single, label: 'Single' });
    const compare = num(r?.compareAtPrice);
    const urlCandidates = [str(r?.url, 500), ...extractUrls(str(r?.urlText, 500))].filter(Boolean);
    const url = urlCandidates.map(normalizeUrl).find(Boolean) || undefined;
    const evidence = (['speech', 'graphic', 'both', 'description'] as const).includes(r?.evidence) ? r.evidence : 'speech';
    const offer: ProductOffer = {
      id: slug(name),
      name,
      description: str(r?.description, 600) || undefined,
      price: single,
      compareAtPrice: compare && single && compare > single ? compare : undefined,
      currency: parsed?.currency || 'USD',
      packages: dedupePackages(pkgs),
      url,
      promoCode: str(r?.promoCode, 40) || undefined,
      evidence,
      tSec: clamp(num(r?.tSec) ?? 0, 0, dur),
      confidence: clamp(num(r?.confidence) ?? 0.5, 0, 1),
      category: str(r?.category, 40) || undefined,
    };
    const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const prev = merged.get(key);
    if (!prev) { merged.set(key, offer); continue; }
    // Same product mentioned twice (said, then shown): keep the earliest moment, union the evidence.
    merged.set(key, {
      ...prev,
      description: prev.description || offer.description,
      price: prev.price ?? offer.price,
      packages: dedupePackages([...prev.packages, ...offer.packages]),
      url: prev.url || offer.url,
      promoCode: prev.promoCode || offer.promoCode,
      evidence: prev.evidence === offer.evidence ? prev.evidence : 'both',
      tSec: Math.min(prev.tSec, offer.tSec),
      confidence: Math.max(prev.confidence, offer.confidence),
    });
  }
  // Ids must be unique even when two names slug the same.
  const used = new Set<string>();
  return [...merged.values()].slice(0, MAX_OFFERS).map(o => {
    let id = o.id, n = 2;
    while (used.has(id)) id = `${o.id}-${n++}`;
    used.add(id);
    return { ...o, id };
  });
}

export function normalizeLinks(raw: unknown, description = ''): VideoLink[] {
  const out = new Map<string, VideoLink>();
  for (const r of (Array.isArray(raw) ? raw : []) as any[]) {
    const u = normalizeUrl(str(r?.url, 500));
    if (!u) continue;
    const ev = (['speech', 'graphic', 'both'] as const).includes(r?.evidence) ? r.evidence : 'speech';
    const prev = out.get(u);
    out.set(u, { url: u, label: str(r?.label, 80) || prev?.label, tSec: num(r?.tSec) ?? prev?.tSec, evidence: prev && prev.evidence !== ev ? 'both' : ev });
  }
  for (const u of extractUrls(description)) if (!out.has(u)) out.set(u, { url: u, evidence: 'description' });
  return [...out.values()].slice(0, 30);
}

/**
 * The model's quote picks → clip-ready ranges: a beat of lead-in before the line, a breath after,
 * CLIP_MIN..CLIP_MAX long, inside the video, no two clips of the same moment.
 */
export function normalizeQuotes(raw: unknown, durationSec?: number): QuoteMoment[] {
  const dur = durationSec && durationSec > 0 ? durationSec : Number.MAX_SAFE_INTEGER;
  const out: QuoteMoment[] = [];
  for (const r of (Array.isArray(raw) ? raw : []) as any[]) {
    const text = str(r?.text, 280).replace(/^["“]|["”]$/g, '');
    const s0 = num(r?.startSec); const e0 = num(r?.endSec);
    if (!text || s0 == null) continue;
    let s = Math.max(0, s0 - 1.5);
    let e = Math.max(e0 ?? s0 + 6, s0 + 1) + 1;
    if (e - s < CLIP_MIN_SEC) e = s + CLIP_MIN_SEC;
    if (e - s > CLIP_MAX_SEC) e = s + CLIP_MAX_SEC;
    if (e > dur) { e = dur; s = Math.max(0, Math.min(s, e - CLIP_MIN_SEC)); }
    if (s >= dur) continue;
    const overlaps = out.some(q => Math.min(q.endSec, e) - Math.max(q.startSec, s) > 0.5 * Math.min(q.endSec - q.startSec, e - s));
    if (overlaps) continue;
    out.push({
      id: `q${out.length + 1}-${Math.floor(s)}`,
      text, speaker: str(r?.speaker, 60) || undefined,
      startSec: Math.round(s * 10) / 10, endSec: Math.round(e * 10) / 10,
      why: str(r?.why, 200) || undefined,
    });
    if (out.length >= MAX_QUOTES) break;
  }
  return out.sort((a, b) => a.startSec - b.startSec);
}

export function normalizeChapters(raw: unknown, durationSec?: number): VideoChapter[] {
  const dur = durationSec && durationSec > 0 ? durationSec : Number.MAX_SAFE_INTEGER;
  const seen = new Set<number>();
  return ((Array.isArray(raw) ? raw : []) as any[])
    .map(c => ({ tSec: Math.round(clamp(num(c?.tSec) ?? -1, -1, dur)), title: str(c?.title, 90) }))
    .filter(c => c.tSec >= 0 && c.title && !seen.has(c.tSec) && (seen.add(c.tSec), true))
    .sort((a, b) => a.tSec - b.tSec)
    .slice(0, 20);
}

/** Assemble the report from the model's JSON; stills come from Mux at the moments that matter. */
export function buildReport(raw: any, ctx: { durationSec?: number; description?: string; playbackId?: string }): VideoIntelReport {
  const offers = normalizeOffers(raw?.offers, ctx);
  const quotes = normalizeQuotes(raw?.quotes, ctx.durationSec);
  const chapters = normalizeChapters(raw?.chapters, ctx.durationSec);
  const stills: VideoStill[] = [];
  if (ctx.playbackId) {
    const pid = ctx.playbackId;
    for (const o of offers) o.stillUrl = muxStillUrl(pid, o.tSec + 0.5);
    for (const q of quotes) q.stillUrl = muxStillUrl(pid, q.startSec + 1.5);
    const marks = [
      ...((Array.isArray(raw?.stills) ? raw.stills : []) as any[]).map(s => ({ t: num(s?.tSec), c: str(s?.caption, 140) })),
      ...chapters.map(c => ({ t: c.tSec + 2, c: c.title })),
    ].filter(m => m.t != null && m.t >= 0) as { t: number; c: string }[];
    const taken: number[] = [];
    for (const m of marks) {
      if (taken.some(t => Math.abs(t - m.t) < 4)) continue;
      taken.push(m.t);
      stills.push({ tSec: m.t, url: muxStillUrl(pid, m.t), caption: m.c || undefined });
      if (stills.length >= 12) break;
    }
    stills.sort((a, b) => a.tSec - b.tSec);
  }
  return {
    summary: str(raw?.summary, 1200),
    topics: ((Array.isArray(raw?.topics) ? raw.topics : []) as unknown[]).map(t => str(t, 40)).filter(Boolean).slice(0, 12),
    chapters, stills, offers, quotes,
    links: normalizeLinks(raw?.links, ctx.description),
    callsToAction: ((Array.isArray(raw?.callsToAction) ? raw.callsToAction : []) as unknown[]).map(t => str(t, 160)).filter(Boolean).slice(0, 8),
    language: str(raw?.language, 20) || undefined,
  };
}

// ── The article draft ─────────────────────────────────────────────────────────

/**
 * The blog post: an overview that TEASES rather than retells, the strongest lines pulled as quotes
 * (each linking to its moment), stills, and a closing push to go watch the full video.
 */
export function buildArticleDraft(raw: any, report: VideoIntelReport, ctx: { videoId: string; videoTitle: string; baseUrl?: string; coverImage?: string }): ArticleDraft {
  const base = ctx.baseUrl || 'https://plajah.com';
  const blocks: ArticleDraftBlock[] = [];
  const dek = str(raw?.dek, 600) || report.summary.split(/(?<=\.)\s/)[0] || '';
  if (dek) blocks.push({ type: 'TEXT', content: dek });
  const cover = ctx.coverImage || report.stills[0]?.url;
  if (cover) blocks.push({ type: 'IMAGE', content: cover, caption: `From “${ctx.videoTitle}”` });

  const sections = (Array.isArray(raw?.sections) ? raw.sections : []).slice(0, 6) as any[];
  const quotes = [...report.quotes];
  const stills = report.stills.slice(1);
  sections.forEach((s, i) => {
    const h = str(s?.heading, 100); const body = str(s?.body, 2400);
    if (h) blocks.push({ type: 'HEADING', content: h });
    if (body) blocks.push({ type: 'TEXT', content: body });
    const q = quotes.shift();
    if (q) blocks.push({ type: 'QUOTE', content: q.text, caption: `${q.speaker ? `${q.speaker} · ` : ''}${formatClock(q.startSec)} in the video — ${watchUrl(ctx.videoId, base, q.startSec)}` });
    const st = i % 2 === 1 ? stills.shift() : undefined;
    if (st) blocks.push({ type: 'IMAGE', content: st.url, caption: st.caption || `At ${formatClock(st.tSec)}` });
  });
  if (!sections.length && report.summary) blocks.push({ type: 'TEXT', content: report.summary });

  const priced = report.offers.filter(o => o.price != null || o.packages.length);
  if (priced.length) {
    blocks.push({ type: 'HEADING', content: 'Featured in the video' });
    blocks.push({ type: 'TEXT', content: priced.slice(0, 8).map(o => `• ${o.name}${o.price != null ? ` — ${money(o.price, o.currency)}` : ''}${o.packages.filter(p => p.quantity > 1).map(p => ` · ${p.quantity} for ${money(p.price, o.currency)}`).join('')}`).join('\n') });
  }

  const tease = str(raw?.tease, 600);
  blocks.push({ type: 'TEXT', content: `${tease ? `${tease} ` : ''}Watch the full video to see it all: ${watchUrl(ctx.videoId, base)}` });
  blocks.push({ type: 'VIDEO', content: watchUrl(ctx.videoId, base), caption: ctx.videoTitle });

  return {
    title: str(raw?.title, 140) || ctx.videoTitle,
    subtitle: str(raw?.subtitle, 200) || dek.slice(0, 200),
    coverImage: cover,
    tags: ((Array.isArray(raw?.tags) ? raw.tags : report.topics) as unknown[]).map(t => str(t, 30)).filter(Boolean).slice(0, 8),
    blocks,
  };
}

export const money = (n: number, currency = 'USD') => {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n); }
  catch { return `$${n.toFixed(2)}`; }
};

// ── Store listings ────────────────────────────────────────────────────────────

/** Why an offer can't be put on sale without a person looking at it (null = it can). */
export function productHoldReason(o: ProductOffer): string | null {
  if (o.price == null && !o.packages.length) return 'No price was given in the video.';
  if (o.confidence < AUTO_PRODUCT_MIN_CONFIDENCE) return 'Not sure this is a product for sale — please check it.';
  return null;
}

/**
 * A StoreProduct body for an offer. Packages become variants priced off the cheapest package
 * (StoreProduct variants carry a priceModifier on the base price). An offer with a link sells
 * through that link (fulfillmentSource 'external'), so a buyer is never charged for something
 * the account has no way to ship.
 */
export function buildProductDraft(o: ProductOffer, ctx: { sellerId: string; sellerName: string; sellerType: 'USER' | 'ORG'; videoId: string; videoTitle: string; notice?: string; now?: number; active: boolean }) {
  const pkgs = o.packages.length ? o.packages : [];
  const base = pkgs.length ? Math.min(...pkgs.map(p => p.price)) : (o.price ?? 0);
  const variants = pkgs.length > 1 ? pkgs.map(p => ({
    id: `pk${p.quantity}`, name: p.quantity === 1 ? 'Single' : `${p.quantity}-pack`, stock: 0, priceModifier: round2(p.price - base),
  })) : undefined;
  const now = ctx.now ?? Date.now();
  const desc = [
    o.description || `${o.name}, as featured in “${ctx.videoTitle}”.`,
    o.promoCode ? `Promo code from the video: ${o.promoCode}` : '',
    ctx.notice || '',
  ].filter(Boolean).join('\n\n');
  return {
    sellerId: ctx.sellerId, sellerName: ctx.sellerName, sellerType: ctx.sellerType,
    title: o.name.slice(0, 120), description: desc, category: 'OTHER',
    price: round2(base), ...(o.compareAtPrice ? { compareAtPrice: o.compareAtPrice } : {}),
    images: o.stillUrl ? [o.stillUrl] : [], ...(variants ? { variants } : {}),
    stock: 0, trackInventory: false, isDigital: false,
    tags: ['from-video', ...(o.category ? [o.category.toLowerCase()] : [])],
    isActive: ctx.active, linkedAssetId: ctx.videoId,
    fulfillmentSource: o.url ? 'external' : 'manual', ...(o.url ? { externalStoreUrl: o.url } : {}),
    createdAt: now, updatedAt: now,
    fromVideoIntel: { videoId: ctx.videoId, offerId: o.id, tSec: o.tSec, evidence: o.evidence, packages: o.packages },
  };
}

// ── Prompts ───────────────────────────────────────────────────────────────────

export const WATCH_PROMPT = (ctx: { title: string; description: string; durationSec?: number; offsetSec?: number }) => `You are watching AND listening to a creator's video (title: "${ctx.title.slice(0, 200)}").${ctx.offsetSec ? ` This clip starts ${Math.round(ctx.offsetSec)}s into the full video — add ${Math.round(ctx.offsetSec)} to every time you report.` : ''}
Creator's description: """${ctx.description.slice(0, 2000)}"""

Read everything: what is said, what is shown, and every on-screen graphic, caption, lower third, price card and URL.
Return STRICT JSON only:
{
 "summary": "3-5 sentences on what the video is about",
 "topics": ["..."],
 "language": "en",
 "chapters": [{"tSec": 0, "title": "short chapter title"}],
 "stills": [{"tSec": 12.5, "caption": "a visually strong moment worth a still"}],
 "offers": [{"name": "product or service", "description": "one line", "priceText": "exactly as said/shown, e.g. '$24.99' or '3 for $60' or '2-pack $30'", "packages": [{"quantity": 3, "price": 60, "label": "3 for $60"}], "compareAtPrice": null, "url": "where to buy if given", "promoCode": "", "evidence": "speech|graphic|both", "tSec": 0, "confidence": 0.0, "category": "apparel|food|book|music|course|ticket|service|other"}],
 "links": [{"url": "spoken or shown web address, written as a URL (say 'shop dot example dot com slash hats' → shop.example.com/hats)", "label": "", "evidence": "speech|graphic|both", "tSec": 0}],
 "quotes": [{"text": "a poignant, quotable line, verbatim", "speaker": "", "startSec": 0, "endSec": 0, "why": "why it lands"}],
 "callsToAction": ["..."]
}
Rules: an offer is something the creator is actually selling or promoting for purchase — not something merely visible. Prices are numbers in the stated currency. Only list packages that were offered. Times are seconds from the start of the full video. Up to 8 quotes, each one complete thought, 3-40 seconds long. No invented facts.`;

export const ARTICLE_PROMPT = (ctx: { title: string; accountName: string; report: VideoIntelReport }) => `Write a blog post that promotes a video by ${ctx.accountName || 'a creator'} titled "${ctx.title.slice(0, 200)}".
What the video contains (from a careful watch):
${JSON.stringify({ summary: ctx.report.summary, chapters: ctx.report.chapters, quotes: ctx.report.quotes.map(q => q.text), offers: ctx.report.offers.map(o => ({ name: o.name, price: o.price })), callsToAction: ctx.report.callsToAction }).slice(0, 12000)}

Give an overview that makes the reader WANT to watch: tease the best moments, never retell the whole thing, never reveal the payoff, ending or answer — the video delivers that. Warm, specific, no hype words, no invented facts.
Return STRICT JSON only:
{"title": "headline (not the video title verbatim)", "subtitle": "one-line dek", "dek": "2-3 sentence opening", "sections": [{"heading": "", "body": "1-2 short paragraphs"}], "tease": "one or two sentences that end on curiosity", "tags": ["..."]}
2-4 sections.`;
