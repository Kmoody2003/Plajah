// SignageStudio — the business dashboard's digital signage editor, plus the renderers every screen uses.
//
//   • LiveSlide      — renders ONE slide (static TEXT/PROMO/IMAGE/VIDEO or live PRODUCT/MENU/DEAL/EVENT)
//                      at any size; type scales with the box, so the same component drives the dashboard
//                      preview, the in-store display mode and the TV receiver.
//   • SignagePlayer  — a live rotation for a business page: slides via commerceBus.subscribeSignage, live
//                      catalog + offers per seller via commerceBus, same-device SALE events applied
//                      instantly, SIGNAGE_PUSH jumps to a slide. Polls only if the listener fails.
//   • SignageStudio  — the editor (default export): list / reorder / toggle / delete, add static and live
//                      slides, live preview, "Open on this screen" and "Cast to TV".

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Trash2, ChevronUp, ChevronDown, Eye, EyeOff, Pencil, X, Check, Monitor, Tv, Maximize2,
  Type, Megaphone, Image as ImageIcon, Film, Package, UtensilsCrossed, BadgePercent, CalendarDays,
  Loader2, Search, Upload, Radio,
} from 'lucide-react';
import type { BusinessEvent, BusinessPage, DigitalSignageSlide, StoreProduct } from '../../types';
import type { BusinessOffer } from '../../services/offersCore';
import {
  subscribeCatalog, subscribeOffers, subscribeSignage, onCommerce, emitCommerce,
  priceBoard, activeDeals, dealHeadline, boardPrice, applySaleLocally, type PriceBoardRow,
} from '../../services/commerceBus';
import { fetchSignageSlides, saveSignageSlide, deleteSignageSlide } from '../../services/businessService';

// ── Brand ─────────────────────────────────────────────────────────────────────

const PURPLE = '#6B0099', MAGENTA = '#D40055', ORANGE = '#FF8C00';
const DISPLAY = "'Bricolage Grotesque', Inter, system-ui, sans-serif";
const BODY = 'Inter, system-ui, sans-serif';
const GRAD = `linear-gradient(135deg, ${PURPLE}, ${MAGENTA} 55%, ${ORANGE})`;
const DEFAULT_BG = `radial-gradient(120% 90% at 0% 0%, rgba(107,0,153,.55), transparent 60%), radial-gradient(90% 80% at 100% 100%, rgba(212,0,85,.32), transparent 60%), #0B0710`;
const LIVE_TYPES = new Set<DigitalSignageSlide['type']>(['PRODUCT', 'MENU', 'DEAL', 'EVENT']);
const MAX_PRODUCTS = 12;

const pretty = (s?: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase().replace(/_/g, ' ') : '');

function isLight(color?: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec((color || '').trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62;
}

/** Upcoming events (today onward), soonest first. */
export function upcomingEvents(events: BusinessEvent[] = [], now = Date.now(), max = 3): BusinessEvent[] {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  return events
    .map(e => ({ e, t: Date.parse(e.date) }))
    .filter(x => Number.isFinite(x.t) && x.t >= today.getTime() - 12 * 3600_000)
    .sort((a, b) => a.t - b.t)
    .slice(0, max)
    .map(x => x.e);
}

function pickDeal(slide: DigitalSignageSlide, offers: BusinessOffer[] = []): BusinessOffer | null {
  const live = activeDeals(offers);
  if (slide.offerId) return live.find(o => o.id === slide.offerId) || null;
  // "Best deal": biggest percent first, then biggest flat amount.
  return [...live].sort((a, b) => (a.kind === b.kind ? b.value - a.value : a.kind === 'PERCENT' ? -1 : 1))[0] || null;
}

function boardRows(slide: DigitalSignageSlide, products: StoreProduct[] = []): PriceBoardRow[] {
  if (slide.type === 'PRODUCT') return priceBoard(products, { productIds: slide.productIds || [], hideSoldOut: slide.hideSoldOut });
  if (slide.type === 'MENU') return priceBoard(products, { category: slide.category, hideSoldOut: slide.hideSoldOut });
  return [];
}

/** Would this slide show anything right now? Players skip live slides with nothing to say. */
export function slideIsShowable(slide: DigitalSignageSlide, products: StoreProduct[] = [], offers: BusinessOffer[] = [], events: BusinessEvent[] = []): boolean {
  switch (slide.type) {
    case 'IMAGE': case 'VIDEO': return !!slide.url || !!slide.headline;
    case 'TEXT': case 'PROMO': return !!(slide.headline || slide.subtext);
    case 'PRODUCT': case 'MENU': return boardRows(slide, products).length > 0;
    case 'DEAL': return !!pickDeal(slide, offers);
    case 'EVENT': return upcomingEvents(events).length > 0;
    default: return false;
  }
}

// ── LiveSlide ─────────────────────────────────────────────────────────────────

export interface LiveSlideProps {
  slide: DigitalSignageSlide;
  /** The slide seller's live catalog (PRODUCT / MENU). */
  products?: StoreProduct[];
  /** The slide seller's offers (DEAL). */
  offers?: BusinessOffer[];
  /** The business page's events (EVENT). */
  events?: BusinessEvent[];
  /** Muted video autoplay (default true). */
  muted?: boolean;
}

function useBoxWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

const Pill: React.FC<{ tone: 'out' | 'low' | 'live'; children: React.ReactNode }> = ({ tone, children }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: '.4em', padding: '.3em .8em', borderRadius: 999, fontWeight: 700,
    fontSize: '1.15em', lineHeight: 1.2, whiteSpace: 'nowrap',
    background: tone === 'out' ? 'rgba(212,0,85,.22)' : tone === 'low' ? 'rgba(255,140,0,.2)' : 'rgba(255,255,255,.12)',
    color: tone === 'out' ? '#FF6FA3' : tone === 'low' ? ORANGE : 'inherit',
  }}>{children}</span>
);

const Price: React.FC<{ value: number; compare?: number; size: number; dim?: boolean }> = ({ value, compare, size, dim }) => (
  <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '.35em', fontVariantNumeric: 'tabular-nums', opacity: dim ? 0.45 : 1 }}>
    <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: `${size}em`, letterSpacing: '-0.02em', lineHeight: 1 }}>{boardPrice(value)}</span>
    {compare != null && <span style={{ fontSize: `${size * 0.42}em`, textDecoration: 'line-through', opacity: 0.5, fontWeight: 600 }}>{boardPrice(compare)}</span>}
  </span>
);

const Empty: React.FC<{ text: string }> = ({ text }) => (
  <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: '4em', textAlign: 'center', fontSize: '2em', opacity: 0.55 }}>{text}</div>
);

export const LiveSlide: React.FC<LiveSlideProps> = ({ slide, products = [], offers = [], events = [], muted = true }) => {
  const ref = useRef<HTMLDivElement>(null);
  const w = useBoxWidth(ref);
  const light = isLight(slide.backgroundColor);
  const fg = light ? '#14101A' : '#FFFFFF';
  const sub = light ? 'rgba(20,16,26,.66)' : 'rgba(255,255,255,.7)';
  const rows = useMemo(() => boardRows(slide, products), [slide, products]);

  let body: React.ReactNode = null;
  const headline = (text?: string, size = 5) => text ? (
    <h2 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: `${size}em`, lineHeight: 0.98, letterSpacing: '-0.025em', margin: 0 }}>{text}</h2>
  ) : null;
  const subtext = (text?: string, size = 1.9) => text ? <p style={{ fontSize: `${size}em`, color: sub, margin: '.6em 0 0', lineHeight: 1.3 }}>{text}</p> : null;

  switch (slide.type) {
    case 'IMAGE':
    case 'VIDEO': {
      body = (
        <>
          {slide.url && slide.type === 'IMAGE' && <img src={slide.url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
          {slide.url && slide.type === 'VIDEO' && <video key={slide.url} src={slide.url} autoPlay muted={muted} loop playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
          {(slide.headline || slide.subtext) && (
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '8em 4em 3.5em', background: 'linear-gradient(transparent, rgba(0,0,0,.75))', color: '#fff' }}>
              {headline(slide.headline, 4.2)}
              {slide.subtext && <p style={{ fontSize: '1.9em', margin: '.5em 0 0', color: 'rgba(255,255,255,.8)' }}>{slide.subtext}</p>}
            </div>
          )}
          {!slide.url && !slide.headline && <Empty text={`Add an ${slide.type === 'IMAGE' ? 'image' : 'video'}`} />}
        </>
      );
      break;
    }
    case 'TEXT':
    case 'PROMO': {
      body = (slide.headline || slide.subtext) ? (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '4em 6em' }}>
          {slide.type === 'PROMO' && <div style={{ marginBottom: '1.6em' }}><span style={{ display: 'inline-block', padding: '.45em 1.1em', borderRadius: 999, background: ORANGE, color: '#1A0E00', fontWeight: 800, fontSize: '1.6em' }}>Special offer</span></div>}
          {headline(slide.headline, slide.type === 'PROMO' ? 6.4 : 6)}
          {subtext(slide.subtext, 2.4)}
        </div>
      ) : <Empty text="Write a headline" />;
      break;
    }
    case 'PRODUCT': {
      if (!rows.length) { body = <Empty text={slide.productIds?.length ? 'Everything here is sold out' : 'Pick products to feature'} />; break; }
      if (rows.length === 1) {
        const r = rows[0];
        body = (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: r.image ? '1fr 1.1fr' : '1fr', gap: '4em', alignItems: 'center', padding: '4em 5em' }}>
            {r.image && <div style={{ aspectRatio: '1 / 1', maxHeight: '100%', borderRadius: '2em', overflow: 'hidden', background: 'rgba(255,255,255,.06)' }}><img src={r.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: r.status === 'out' ? 0.45 : 1 }} /></div>}
            <div>
              {slide.headline && <p style={{ color: ORANGE, fontWeight: 700, fontSize: '1.8em', margin: '0 0 .7em' }}>{slide.headline}</p>}
              {headline(r.title, 5.2)}
              <div style={{ marginTop: '.5em' }}><Price value={r.price} compare={r.compareAtPrice} size={7.5} dim={r.status === 'out'} /></div>
              {r.badge && <div style={{ marginTop: '1.4em', fontSize: '1.3em' }}><Pill tone={r.status === 'out' ? 'out' : 'low'}>{r.badge}</Pill></div>}
              {subtext(slide.subtext, 2)}
            </div>
          </div>
        );
        break;
      }
      if (rows.length <= 4) {
        body = (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', padding: '3.5em 4em' }}>
            {headline(slide.headline, 4)}
            <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: `repeat(${rows.length}, 1fr)`, gap: '2.4em', marginTop: slide.headline ? '2em' : 0, alignItems: 'end' }}>
              {rows.map(r => (
                <div key={r.id} style={{ display: 'flex', flexDirection: 'column', minWidth: 0, opacity: r.status === 'out' ? 0.55 : 1 }}>
                  <div style={{ aspectRatio: '1 / 1', borderRadius: '1.4em', overflow: 'hidden', background: 'rgba(255,255,255,.07)', position: 'relative' }}>
                    {r.image && <img src={r.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                    {r.badge && <div style={{ position: 'absolute', top: '.8em', left: '.8em' }}><Pill tone={r.status === 'out' ? 'out' : 'low'}>{r.badge}</Pill></div>}
                  </div>
                  <p style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: '2.2em', margin: '.6em 0 .15em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</p>
                  <Price value={r.price} compare={r.compareAtPrice} size={3.6} />
                </div>
              ))}
            </div>
          </div>
        );
        break;
      }
      body = <Board rows={rows} title={slide.headline} note={slide.subtext} sub={sub} />;
      break;
    }
    case 'MENU': {
      body = rows.length
        ? <Board rows={rows} title={slide.headline || pretty(slide.category) || 'Menu'} note={slide.subtext} sub={sub} />
        : <Empty text={slide.category ? `Nothing in ${pretty(slide.category)} yet` : 'Choose a category'} />;
      break;
    }
    case 'DEAL': {
      const o = pickDeal(slide, offers);
      if (!o) { body = <Empty text="No active deal right now" />; break; }
      const conds = [o.membersOnly ? 'Plajah members' : '', o.minSubtotalCents ? `On orders ${boardPrice(o.minSubtotalCents / 100)}+` : ''].filter(Boolean).join(' · ');
      const big = o.kind === 'PERCENT' ? `${o.value}% off` : `${boardPrice(o.value)} off`;
      body = (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '4em 6em' }}>
          <p style={{ color: ORANGE, fontWeight: 700, fontSize: '2em', margin: 0 }}>{slide.headline || 'Today’s deal'}</p>
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: '11em', lineHeight: 0.95, letterSpacing: '-0.035em', fontVariantNumeric: 'tabular-nums', background: GRAD, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', margin: '.08em 0' }}>{big}</div>
          <p style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: '3.2em', margin: 0 }}>{o.label || dealHeadline(o)}</p>
          {conds && <p style={{ fontSize: '1.9em', color: sub, margin: '.5em 0 0' }}>{conds}</p>}
          {subtext(slide.subtext, 1.9)}
        </div>
      );
      break;
    }
    case 'EVENT': {
      const list = upcomingEvents(events);
      if (!list.length) { body = <Empty text="No upcoming events" />; break; }
      body = (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', padding: '4em 5em' }}>
          {headline(slide.headline || 'Coming up', 4.4)}
          {subtext(slide.subtext, 1.8)}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '1.8em', marginTop: '1.5em' }}>
            {list.map(e => {
              const d = new Date(Date.parse(e.date));
              return (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: '2em' }}>
                  <div style={{ width: '6.4em', flexShrink: 0, textAlign: 'center', borderRadius: '1.2em', padding: '.7em 0', background: GRAD, color: '#fff' }}>
                    <div style={{ fontSize: '1.4em', fontWeight: 700 }}>{d.toLocaleDateString(undefined, { month: 'short' })}</div>
                    <div style={{ fontFamily: DISPLAY, fontSize: '3.4em', fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{d.getDate()}</div>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: '2.8em', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.title}</p>
                    <p style={{ fontSize: '1.7em', color: sub, margin: '.2em 0 0' }}>
                      {[d.toLocaleDateString(undefined, { weekday: 'long' }), e.time, e.isFree ? 'Free' : e.price ? boardPrice(e.price) : ''].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
      break;
    }
  }

  return (
    <div ref={ref} style={{
      position: 'relative', width: '100%', height: '100%', overflow: 'hidden', color: fg, fontFamily: BODY,
      fontSize: w ? `${w / 64}px` : '16px', background: slide.backgroundColor || DEFAULT_BG,
    }}>
      {body}
    </div>
  );
};

/** Live price board (MENU, or PRODUCT with many items). Two columns once it gets long. */
const Board: React.FC<{ rows: PriceBoardRow[]; title?: string; note?: string; sub: string }> = ({ rows, title, note, sub }) => {
  const shown = rows.slice(0, 18);
  const two = shown.length > 8;
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', padding: '3.5em 4.5em' }}>
      {title && <h2 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: '4.6em', lineHeight: 1, letterSpacing: '-0.025em', margin: 0 }}>{title}</h2>}
      {note && <p style={{ fontSize: '1.8em', color: sub, margin: '.5em 0 0' }}>{note}</p>}
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: two ? '1fr 1fr' : '1fr', columnGap: '4em', alignContent: 'center', marginTop: '1.4em' }}>
        {shown.map(r => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'baseline', gap: '.8em', padding: two ? '.55em 0' : '.75em 0', opacity: r.status === 'out' ? 0.5 : 1 }}>
            <span style={{ fontSize: two ? '2.1em' : '2.6em', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: r.status === 'out' ? 'line-through' : 'none' }}>{r.title}</span>
            {r.badge && <span style={{ fontSize: two ? '.95em' : '1.05em' }}><Pill tone={r.status === 'out' ? 'out' : 'low'}>{r.badge}</Pill></span>}
            <span style={{ flex: 1, borderBottom: '.15em dotted currentColor', opacity: 0.25, transform: 'translateY(-.4em)' }} />
            <Price value={r.price} compare={r.compareAtPrice} size={two ? 2.4 : 3} />
          </div>
        ))}
      </div>
      {rows.length > shown.length && <p style={{ fontSize: '1.5em', color: sub, margin: 0 }}>+{rows.length - shown.length} more in store</p>}
    </div>
  );
};

// ── Live data for players ─────────────────────────────────────────────────────

/** Live catalog + offers for each seller uid (shared listeners), with same-device SALEs applied instantly. */
export function useLiveCommerce(sellerUids: string[]): { products: Record<string, StoreProduct[]>; offers: Record<string, BusinessOffer[]> } {
  const key = Array.from(new Set(sellerUids.filter(Boolean))).sort().join(',');
  const [products, setProducts] = useState<Record<string, StoreProduct[]>>({});
  const [offers, setOffers] = useState<Record<string, BusinessOffer[]>>({});
  useEffect(() => {
    const uids = key ? key.split(',') : [];
    const uns: (() => void)[] = [];
    for (const uid of uids) {
      uns.push(subscribeCatalog(uid, list => setProducts(m => ({ ...m, [uid]: list }))));
      uns.push(subscribeOffers(uid, list => setOffers(m => ({ ...m, [uid]: list }))));
    }
    uns.push(onCommerce(e => {
      if (e.type === 'SALE' && uids.includes(e.sellerUid)) {
        setProducts(m => (m[e.sellerUid] ? { ...m, [e.sellerUid]: applySaleLocally(m[e.sellerUid], e.lines) } : m));
      }
    }));
    return () => uns.forEach(u => u());
  }, [key]);
  return { products, offers };
}

const FADE_CSS = '@keyframes pjSignFade{from{opacity:0;transform:scale(1.01)}to{opacity:1;transform:none}}';

export interface SignagePlayerProps {
  /** businessPages id the slides are keyed by. */
  businessId: string;
  /** Fallback seller for live slides that don't carry sellerUid (the page owner). */
  sellerUid?: string;
  events?: BusinessEvent[];
  /** Re-read slides on this interval ONLY if the live listener fails (default 5 min). */
  pollFallbackMs?: number;
  /** What to show when there's nothing to play. */
  renderEmpty?: () => React.ReactNode;
}

/** A live, rotating signage screen for one business page. Fills its (positioned) parent. */
export const SignagePlayer: React.FC<SignagePlayerProps> = ({ businessId, sellerUid, events = [], pollFallbackMs = 5 * 60_000, renderEmpty }) => {
  const [slides, setSlides] = useState<DigitalSignageSlide[]>([]);
  const [idx, setIdx] = useState(0);
  const [jump, setJump] = useState<string | null>(null);

  useEffect(() => {
    if (!businessId) { setSlides([]); return; }
    let alive = true, live = false, poll: number | undefined;
    const load = () => fetchSignageSlides(businessId).then(s => { if (alive) setSlides(s); }).catch(() => { /* keep what we have — never blank a screen on a blip */ });
    const startPoll = () => { if (poll === undefined) { load(); poll = window.setInterval(load, pollFallbackMs); } };
    const un = subscribeSignage(businessId, s => { live = true; if (alive) setSlides(s); }, { onError: startPoll });
    // safeSnapshot can swallow a failed registration silently — if nothing arrives, read once and poll.
    const watchdog = window.setTimeout(() => { if (!live) startPoll(); }, 8000);
    return () => { alive = false; un(); window.clearTimeout(watchdog); if (poll !== undefined) window.clearInterval(poll); };
  }, [businessId, pollFallbackMs]);

  useEffect(() => onCommerce(e => {
    if (e.type === 'SIGNAGE_PUSH' && e.businessId === businessId && e.slideId) setJump(e.slideId);
  }), [businessId]);

  const sellerOf = (s: DigitalSignageSlide) => s.sellerUid || sellerUid || '';
  const sellers = useMemo(() => slides.filter(s => LIVE_TYPES.has(s.type)).map(sellerOf), [slides, sellerUid]); // eslint-disable-line react-hooks/exhaustive-deps
  const { products, offers } = useLiveCommerce(sellers);
  const playable = slides.filter(s => s.isActive && slideIsShowable(s, products[sellerOf(s)], offers[sellerOf(s)], events));

  useEffect(() => {
    if (!jump) return;
    const i = playable.findIndex(s => s.id === jump);
    if (i >= 0) { setIdx(i); setJump(null); }
  }, [jump, playable]);

  const cur = playable.length ? playable[idx % playable.length] : null;
  useEffect(() => {
    if (playable.length < 2) return;
    const t = window.setTimeout(() => setIdx(i => (i + 1) % playable.length), Math.max(3, cur?.durationSeconds || 8) * 1000);
    return () => window.clearTimeout(t);
  }, [playable.length, idx, cur?.id, cur?.durationSeconds]);

  if (!cur) return <>{renderEmpty ? renderEmpty() : <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,.45)', fontSize: 24, fontFamily: BODY }}>No signage slides yet.</div>}</>;
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000' }}>
      <style>{FADE_CSS}</style>
      <div key={cur.id} style={{ position: 'absolute', inset: 0, animation: 'pjSignFade .6s ease-out' }}>
        <LiveSlide slide={cur} products={products[sellerOf(cur)]} offers={offers[sellerOf(cur)]} events={events} />
      </div>
    </div>
  );
};

// ── Studio (editor) ───────────────────────────────────────────────────────────

export interface SignageStudioProps {
  businessPage: BusinessPage;
  /** storeProducts.sellerId / businesses/{uid} — the owner uid live slides read from. */
  sellerUid: string;
  /** Action colour (default Plajah orange). */
  accent?: string;
}

type Draft = Partial<DigitalSignageSlide> & { type: DigitalSignageSlide['type'] };

const TYPES: { type: DigitalSignageSlide['type']; label: string; desc: string; icon: React.ReactNode; live?: boolean }[] = [
  { type: 'TEXT', label: 'Text', desc: 'Announcement or welcome', icon: <Type size={18} /> },
  { type: 'PROMO', label: 'Promo', desc: 'Special-offer callout', icon: <Megaphone size={18} /> },
  { type: 'IMAGE', label: 'Image', desc: 'A photo or poster', icon: <ImageIcon size={18} /> },
  { type: 'VIDEO', label: 'Video', desc: 'Looping muted clip', icon: <Film size={18} /> },
  { type: 'PRODUCT', label: 'Products', desc: 'Live price + stock', icon: <Package size={18} />, live: true },
  { type: 'MENU', label: 'Menu board', desc: 'A live category board', icon: <UtensilsCrossed size={18} />, live: true },
  { type: 'DEAL', label: 'Deal', desc: 'An active offer', icon: <BadgePercent size={18} />, live: true },
  { type: 'EVENT', label: 'Events', desc: 'What’s coming up', icon: <CalendarDays size={18} />, live: true },
];
const typeMeta = (t: DigitalSignageSlide['type']) => TYPES.find(x => x.type === t) || TYPES[0];

const SWATCHES = ['', '#0B0710', '#000000', PURPLE, MAGENTA, ORANGE, '#F6F1EA'];

const btn = 'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[.98] disabled:opacity-40 disabled:pointer-events-none';
const iconBtn = `${btn} w-11 h-11 shrink-0 text-white/60 hover:text-white hover:bg-white/10`;
const input = 'w-full h-11 rounded-xl bg-white/[0.06] border border-white/10 px-3.5 text-[14px] text-white placeholder-white/35 outline-none focus:border-white/30';
const labelCls = 'block text-[12px] font-medium text-white/55 mb-1.5';

const SignageStudio: React.FC<SignageStudioProps> = ({ businessPage, sellerUid, accent = ORANGE }) => {
  const businessId = businessPage.id;
  const [slides, setSlides] = useState<DigitalSignageSlide[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [catalog, setCatalog] = useState<StoreProduct[]>([]);
  const [offers, setOffers] = useState<BusinessOffer[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [castOpen, setCastOpen] = useState(false);
  const events = businessPage.events || [];

  useEffect(() => {
    setLoaded(false);
    const un = subscribeSignage(businessId, s => { setSlides(s); setLoaded(true); }, {
      onError: () => fetchSignageSlides(businessId).then(setSlides).catch(() => {}).finally(() => setLoaded(true)),
    });
    return un;
  }, [businessId]);
  useEffect(() => subscribeCatalog(sellerUid, list => setCatalog(list.filter(p => p.isActive !== false))), [sellerUid]);
  useEffect(() => subscribeOffers(sellerUid, setOffers), [sellerUid]);

  const sellerOf = (s: DigitalSignageSlide) => s.sellerUid || sellerUid;
  const onRotation = slides.filter(s => s.isActive && slideIsShowable(s, catalog, offers, events)).length;

  const startNew = (type: DigitalSignageSlide['type']) => {
    setAdding(false); setErr('');
    setDraft({
      type, durationSeconds: type === 'MENU' ? 15 : 10, isActive: true, order: slides.length,
      headline: type === 'TEXT' ? `Welcome to ${businessPage.businessName}` : type === 'PROMO' ? '' : undefined,
      productIds: type === 'PRODUCT' ? [] : undefined,
      category: type === 'MENU' ? (catalog[0]?.category || undefined) : undefined,
    });
  };

  const save = async () => {
    if (!draft || busy) return;
    setBusy(true); setErr('');
    try {
      const live = LIVE_TYPES.has(draft.type);
      const payload: Partial<DigitalSignageSlide> = {
        ...draft, businessId,
        sellerUid: live ? (draft.sellerUid || sellerUid) : undefined,
        durationSeconds: Math.max(3, Math.min(120, Math.round(draft.durationSeconds || 10))),
      };
      if (!draft.id) { delete payload.id; for (const k of Object.keys(payload) as (keyof DigitalSignageSlide)[]) if (payload[k] === undefined) delete payload[k]; }
      const saved = await saveSignageSlide(payload);
      emitCommerce({ type: 'SIGNAGE_PUSH', businessId, slideId: saved.id || draft.id });
      setDraft(null);
    } catch (e: any) {
      setErr(e?.code === 'permission-denied' ? 'You don’t have permission to edit this page’s signage.' : (e?.message || 'Couldn’t save the slide.'));
    } finally { setBusy(false); }
  };

  const patch = async (s: DigitalSignageSlide, p: Partial<DigitalSignageSlide>) => {
    setSlides(list => list.map(x => (x.id === s.id ? { ...x, ...p } : x)));
    try { await saveSignageSlide({ id: s.id, ...p }); } catch { setErr('Couldn’t update that slide — check your connection.'); }
  };

  const move = async (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= slides.length) return;
    const next = [...slides];
    [next[i], next[j]] = [next[j], next[i]];
    const renumbered = next.map((s, k) => ({ ...s, order: k }));
    setSlides(renumbered);
    try {
      await Promise.all(renumbered.filter((s, k) => slides.find(x => x.id === s.id)?.order !== k).map(s => saveSignageSlide({ id: s.id, order: s.order })));
    } catch { setErr('Couldn’t reorder — check your connection.'); }
  };

  const remove = async (s: DigitalSignageSlide) => {
    if (confirmDel !== s.id) { setConfirmDel(s.id); return; }
    setConfirmDel(null);
    setSlides(list => list.filter(x => x.id !== s.id));
    try { await deleteSignageSlide(s.id); } catch { setErr('Couldn’t delete that slide.'); }
    if (draft?.id === s.id) setDraft(null);
  };

  const draftSlide: DigitalSignageSlide | null = draft ? { id: draft.id || 'draft', businessId, durationSeconds: 10, isActive: true, order: 0, ...draft } as DigitalSignageSlide : null;

  return (
    <div className="text-white" style={{ fontFamily: BODY }}>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h2 className="text-[28px] leading-none font-extrabold tracking-tight" style={{ fontFamily: DISPLAY }}>Signage</h2>
          <p className="text-[13px] text-white/55 mt-1.5">
            {loaded ? `${onRotation} on rotation · ${slides.length} slide${slides.length === 1 ? '' : 's'}` : 'Loading…'}
            <span className="inline-flex items-center gap-1 ml-2 text-white/70"><Radio size={12} style={{ color: '#3ddc97' }} /> Prices and stock update live</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setFullscreen(true)} className={`${btn} h-11 px-4 bg-white/10 hover:bg-white/15 text-[14px]`}><Maximize2 size={16} /> Open on this screen</button>
          <div className="relative">
            <button onClick={() => setCastOpen(v => !v)} className={`${btn} h-11 px-4 text-[14px] text-[#1A0E00]`} style={{ background: accent }} aria-expanded={castOpen}><Tv size={16} /> Cast to TV</button>
            {castOpen && <CastMenu pageId={businessId} title={businessPage.businessName} onClose={() => setCastOpen(false)} />}
          </div>
        </div>
      </div>

      {err && <p role="alert" className="mb-4 rounded-xl px-4 py-3 text-[13px] flex items-start justify-between gap-3" style={{ background: 'rgba(212,0,85,.14)', color: '#FFB3CD' }}>{err}<button onClick={() => setErr('')} aria-label="Dismiss" className="shrink-0"><X size={16} /></button></p>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* Slide list */}
        <div className="space-y-2.5 min-w-0">
          {!loaded ? (
            [0, 1, 2].map(i => <div key={i} className="h-[72px] rounded-2xl bg-white/[0.04] animate-pulse" />)
          ) : slides.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 p-6 text-center">
              <Monitor size={26} className="mx-auto text-white/30" />
              <p className="text-[15px] font-semibold mt-2">No slides yet</p>
              <p className="text-[13px] text-white/50 mt-1">Start with a live menu board — it reads straight from your inventory.</p>
            </div>
          ) : slides.map((s, i) => {
            const meta = typeMeta(s.type);
            const live = LIVE_TYPES.has(s.type);
            const showable = slideIsShowable(s, s.sellerUid && s.sellerUid !== sellerUid ? [] : catalog, offers, events);
            const editing = draft?.id === s.id;
            return (
              <div key={s.id} className={`rounded-2xl border p-2 pl-3 flex items-center gap-2 transition ${editing ? 'border-white/40 bg-white/[0.07]' : 'border-white/10 bg-white/[0.03]'} ${s.isActive ? '' : 'opacity-60'}`}>
                <div className="w-11 h-11 rounded-xl shrink-0 grid place-items-center overflow-hidden" style={{ background: s.backgroundColor || (live ? GRAD : 'rgba(255,255,255,.08)') }}>
                  {s.type === 'IMAGE' && s.url ? <img src={s.url} alt="" className="w-full h-full object-cover" /> : <span className={isLight(s.backgroundColor) ? 'text-black/70' : 'text-white'}>{meta.icon}</span>}
                </div>
                <button onClick={() => { setErr(''); setDraft({ ...s }); }} className="flex-1 min-w-0 text-left py-1">
                  <p className="text-[14px] font-semibold truncate">{s.headline || (s.type === 'MENU' && s.category ? `${pretty(s.category)} board` : meta.label)}</p>
                  <p className="text-[12px] text-white/50 truncate">
                    {meta.label} · {s.durationSeconds}s{live ? ' · live' : ''}
                    {s.isActive && !showable ? <span style={{ color: ORANGE }}> · skipped (nothing to show)</span> : null}
                  </p>
                </button>
                <button className={iconBtn} onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up"><ChevronUp size={18} /></button>
                <button className={iconBtn} onClick={() => move(i, 1)} disabled={i === slides.length - 1} aria-label="Move down"><ChevronDown size={18} /></button>
                <button className={iconBtn} onClick={() => patch(s, { isActive: !s.isActive })} aria-label={s.isActive ? 'Hide from rotation' : 'Show in rotation'} aria-pressed={s.isActive}>
                  {s.isActive ? <Eye size={18} /> : <EyeOff size={18} />}
                </button>
                <button className={iconBtn} onClick={() => emitCommerce({ type: 'SIGNAGE_PUSH', businessId, slideId: s.id })} title="Show now on screens on this device" aria-label="Show now"><Monitor size={17} /></button>
                <button className={`${iconBtn} ${confirmDel === s.id ? '!text-[#FF6FA3] !bg-[rgba(212,0,85,.18)] !w-auto px-3' : ''}`} onClick={() => remove(s)} onBlur={() => setConfirmDel(c => (c === s.id ? null : c))} aria-label="Delete slide">
                  <Trash2 size={17} />{confirmDel === s.id && <span className="text-[13px]">Delete?</span>}
                </button>
              </div>
            );
          })}

          {/* Add */}
          {adding ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[14px] font-semibold">Add a slide</p>
                <button className={iconBtn} onClick={() => setAdding(false)} aria-label="Close"><X size={18} /></button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {TYPES.map(t => (
                  <button key={t.type} onClick={() => startNew(t.type)} className="text-left rounded-xl border border-white/10 hover:border-white/30 bg-white/[0.03] p-3 min-h-[64px] flex gap-3 items-start transition">
                    <span className="mt-0.5" style={{ color: t.live ? accent : 'rgba(255,255,255,.75)' }}>{t.icon}</span>
                    <span className="min-w-0">
                      <span className="block text-[14px] font-semibold">{t.label}{t.live && <span className="ml-1.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-full align-middle" style={{ background: 'rgba(255,140,0,.16)', color: ORANGE }}>Live</span>}</span>
                      <span className="block text-[12px] text-white/50">{t.desc}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <button onClick={() => { setAdding(true); setDraft(null); }} className={`${btn} w-full h-12 text-[14px] border border-dashed border-white/20 hover:border-white/40 text-white/80`}>
              <Plus size={17} /> Add slide
            </button>
          )}
        </div>

        {/* Preview + editor */}
        <div className="min-w-0 lg:sticky lg:top-4 self-start space-y-3">
          <div className="relative w-full rounded-2xl overflow-hidden border border-white/10 bg-black" style={{ aspectRatio: '16 / 9' }}>
            {draftSlide
              ? <LiveSlide slide={draftSlide} products={draftSlide.sellerUid && draftSlide.sellerUid !== sellerUid ? [] : catalog} offers={offers} events={events} />
              : <SignagePlayer businessId={businessId} sellerUid={sellerUid} events={events} renderEmpty={() => (
                  <div className="absolute inset-0 grid place-items-center text-center px-6" style={{ background: DEFAULT_BG }}>
                    <p className="text-[15px] text-white/60">Your screen preview appears here.</p>
                  </div>
                )} />}
            <span className="absolute top-2.5 left-2.5 text-[11px] font-semibold px-2 py-1 rounded-full bg-black/60 text-white/85">{draftSlide ? 'Editing preview' : 'Live rotation'}</span>
          </div>

          {draft && (
            <SlideEditor draft={draft} setDraft={setDraft} catalog={catalog} offers={offers} events={events} accent={accent}
              busy={busy} onSave={save} onCancel={() => { setDraft(null); setErr(''); }} uploaderUid={sellerUid} />
          )}
        </div>
      </div>

      {fullscreen && <FullscreenPlayer businessId={businessId} sellerUid={sellerUid} events={events} onClose={() => setFullscreen(false)} />}
    </div>
  );
};

// ── Editor panel ──────────────────────────────────────────────────────────────

const SlideEditor: React.FC<{
  draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft | null>>;
  catalog: StoreProduct[]; offers: BusinessOffer[]; events: BusinessEvent[]; accent: string;
  busy: boolean; onSave: () => void; onCancel: () => void; uploaderUid: string;
}> = ({ draft, setDraft, catalog, offers, events, accent, busy, onSave, onCancel, uploaderUid }) => {
  const set = (p: Partial<DigitalSignageSlide>) => setDraft(d => (d ? { ...d, ...p } : d));
  const [q, setQ] = useState('');
  const [uploading, setUploading] = useState(false);
  const [upErr, setUpErr] = useState('');
  const meta = typeMeta(draft.type);
  const live = LIVE_TYPES.has(draft.type);

  const categories = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of catalog) {
      const c = String(p.category || 'OTHER'); m.set(c, (m.get(c) || 0) + 1);
      for (const t of p.tags || []) { const k = String(t); if (k) m.set(k, (m.get(k) || 0) + 1); }
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 24);
  }, [catalog]);

  const picked = draft.productIds || [];
  const togglePick = (id: string) => set({ productIds: picked.includes(id) ? picked.filter(x => x !== id) : picked.length >= MAX_PRODUCTS ? picked : [...picked, id] });
  const found = catalog.filter(p => !q.trim() || p.title.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 40);
  const deals = activeDeals(offers);

  const upload = async (file: File) => {
    setUploading(true); setUpErr('');
    try {
      const { uploadFile } = await import('../../services/backendService');
      const safe = file.name.replace(/[^\w.-]+/g, '_').slice(-60);
      const url = await uploadFile(`users/${uploaderUid}/signage/${Date.now()}_${safe}`, file);
      set({ url });
    } catch { setUpErr('Upload failed — paste a link instead.'); }
    finally { setUploading(false); }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[16px] font-bold flex items-center gap-2" style={{ fontFamily: DISPLAY }}>
          <span style={{ color: live ? accent : undefined }}>{meta.icon}</span>{draft.id ? 'Edit' : 'New'} {meta.label.toLowerCase()} slide
        </p>
        <button className={iconBtn} onClick={onCancel} aria-label="Close editor"><X size={18} /></button>
      </div>

      {(draft.type === 'IMAGE' || draft.type === 'VIDEO') && (
        <div>
          <label className={labelCls} htmlFor="sg-url">{draft.type === 'IMAGE' ? 'Image' : 'Video'} link</label>
          <div className="flex gap-2">
            <input id="sg-url" className={input} value={draft.url || ''} onChange={e => set({ url: e.target.value || undefined })} placeholder="https://…" />
            <label className={`${btn} h-11 px-3.5 bg-white/10 hover:bg-white/15 text-[14px] cursor-pointer shrink-0`}>
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} Upload
              <input type="file" accept={draft.type === 'IMAGE' ? 'image/*' : 'video/*'} className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
            </label>
          </div>
          {upErr && <p className="text-[12px] mt-1.5" style={{ color: '#FFB3CD' }}>{upErr}</p>}
        </div>
      )}

      {draft.type === 'PRODUCT' && (
        <div>
          <label className={labelCls}>Products · {picked.length}/{MAX_PRODUCTS} picked</label>
          {picked.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {picked.map(id => {
                const p = catalog.find(x => x.id === id);
                return <button key={id} onClick={() => togglePick(id)} className="h-9 pl-3 pr-2 rounded-full bg-white/10 hover:bg-white/15 text-[13px] inline-flex items-center gap-1.5 max-w-full"><span className="truncate max-w-[180px]">{p?.title || 'Removed product'}</span><X size={14} /></button>;
              })}
            </div>
          )}
          <div className="relative mb-2">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
            <input className={`${input} pl-9`} value={q} onChange={e => setQ(e.target.value)} placeholder="Search your inventory" />
          </div>
          <div className="max-h-64 overflow-y-auto rounded-xl border border-white/10 divide-y divide-white/[0.06]">
            {catalog.length === 0 ? <p className="p-4 text-[13px] text-white/50">No products in inventory yet — add some in Inventory and they appear here instantly.</p>
              : found.map(p => {
                const on = picked.includes(p.id);
                const [row] = priceBoard([p]);
                return (
                  <button key={p.id} onClick={() => togglePick(p.id)} className={`w-full min-h-[52px] flex items-center gap-3 px-3 py-2 text-left hover:bg-white/[0.05] ${on ? 'bg-white/[0.06]' : ''}`}>
                    <span className="w-5 h-5 rounded-md border grid place-items-center shrink-0" style={{ borderColor: on ? accent : 'rgba(255,255,255,.3)', background: on ? accent : 'transparent' }}>{on && <Check size={14} className="text-black" />}</span>
                    <span className="w-9 h-9 rounded-lg overflow-hidden bg-white/10 shrink-0">{p.images?.[0] && <img src={p.images[0]} alt="" className="w-full h-full object-cover" />}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[14px] truncate">{p.title}</span>
                      {row?.badge && <span className="block text-[12px]" style={{ color: row.status === 'out' ? '#FF6FA3' : ORANGE }}>{row.badge}</span>}
                    </span>
                    <span className="text-[15px] font-bold tabular-nums">{boardPrice(p.price)}</span>
                  </button>
                );
              })}
          </div>
        </div>
      )}

      {draft.type === 'MENU' && (
        <div>
          <label className={labelCls}>Inventory category</label>
          {categories.length === 0 ? <p className="text-[13px] text-white/50">Add products in Inventory to build a menu board.</p> : (
            <div className="flex flex-wrap gap-1.5">
              {categories.map(([c, n]) => {
                const on = (draft.category || '').toLowerCase() === c.toLowerCase();
                return <button key={c} onClick={() => set({ category: c })} className="h-10 px-3.5 rounded-full text-[13px] font-medium border transition" style={{ borderColor: on ? accent : 'rgba(255,255,255,.14)', background: on ? 'rgba(255,140,0,.14)' : 'transparent', color: on ? '#FFD4A3' : 'rgba(255,255,255,.8)' }}>{pretty(c)} <span className="opacity-60 tabular-nums">{n}</span></button>;
              })}
            </div>
          )}
        </div>
      )}

      {draft.type === 'DEAL' && (
        <div>
          <label className={labelCls}>Which deal</label>
          <div className="space-y-1.5">
            {[{ id: '', label: 'Best active deal', sub: 'Switches automatically as deals change' }, ...offers.map(o => ({ id: o.id, label: o.label || dealHeadline(o), sub: `${dealHeadline(o)}${deals.includes(o) ? '' : ' · not active'}` }))].map(o => {
              const on = (draft.offerId || '') === o.id;
              return (
                <button key={o.id || 'best'} onClick={() => set({ offerId: o.id || undefined })} className="w-full min-h-[48px] rounded-xl border px-3 py-2 text-left flex items-center gap-3" style={{ borderColor: on ? accent : 'rgba(255,255,255,.12)', background: on ? 'rgba(255,140,0,.1)' : 'transparent' }}>
                  <span className="w-4 h-4 rounded-full border-2 shrink-0" style={{ borderColor: on ? accent : 'rgba(255,255,255,.35)', background: on ? accent : 'transparent' }} />
                  <span className="min-w-0"><span className="block text-[14px] font-semibold truncate">{o.label}</span><span className="block text-[12px] text-white/50 truncate">{o.sub}</span></span>
                </button>
              );
            })}
            {offers.length === 0 && <p className="text-[13px] text-white/50">No deals yet — create one under Offers and it shows here.</p>}
          </div>
        </div>
      )}

      {draft.type === 'EVENT' && (
        <p className="text-[13px] text-white/60">{upcomingEvents(events).length ? `Shows your next ${upcomingEvents(events).length} upcoming event${upcomingEvents(events).length === 1 ? '' : 's'} from your business page.` : 'No upcoming events on your business page — add one and this slide starts showing.'}</p>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <div className={draft.type === 'TEXT' || draft.type === 'PROMO' ? 'sm:col-span-2' : ''}>
          <label className={labelCls} htmlFor="sg-h">{live ? 'Title (optional)' : 'Headline'}</label>
          <input id="sg-h" className={input} value={draft.headline || ''} onChange={e => set({ headline: e.target.value || undefined })} placeholder={draft.type === 'MENU' ? pretty(draft.category) || 'Menu' : draft.type === 'DEAL' ? 'Today’s deal' : draft.type === 'EVENT' ? 'Coming up' : 'Say something big'} maxLength={80} />
        </div>
        <div className={draft.type === 'TEXT' || draft.type === 'PROMO' ? 'sm:col-span-2' : ''}>
          <label className={labelCls} htmlFor="sg-s">Subtext</label>
          <input id="sg-s" className={input} value={draft.subtext || ''} onChange={e => set({ subtext: e.target.value || undefined })} placeholder="Optional" maxLength={140} />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3 items-end">
        <div>
          <label className={labelCls} htmlFor="sg-d">On screen for <span className="tabular-nums text-white/80">{draft.durationSeconds || 10}s</span></label>
          <input id="sg-d" type="range" min={4} max={60} step={1} value={draft.durationSeconds || 10} onChange={e => set({ durationSeconds: Number(e.target.value) })} className="w-full h-11" style={{ accentColor: accent }} />
        </div>
        <div>
          <span className={labelCls}>Background</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {SWATCHES.map(c => (
              <button key={c || 'brand'} onClick={() => set({ backgroundColor: c || undefined })} aria-label={c ? `Background ${c}` : 'Plajah gradient'} className="w-9 h-9 rounded-full border-2" style={{ background: c || DEFAULT_BG, borderColor: (draft.backgroundColor || '') === c ? '#fff' : 'rgba(255,255,255,.15)' }} />
            ))}
            <input type="color" value={draft.backgroundColor || '#0B0710'} onChange={e => set({ backgroundColor: e.target.value })} aria-label="Custom background colour" className="w-9 h-9 rounded-full bg-transparent border-0 p-0 cursor-pointer" />
          </div>
        </div>
      </div>

      {(draft.type === 'PRODUCT' || draft.type === 'MENU') && (
        <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
          <input type="checkbox" checked={!!draft.hideSoldOut} onChange={e => set({ hideSoldOut: e.target.checked || undefined })} className="w-5 h-5" style={{ accentColor: accent }} />
          <span className="text-[14px]">Hide sold-out items <span className="text-white/50">(otherwise they show “Sold out”)</span></span>
        </label>
      )}

      <div className="flex gap-2 pt-1">
        <button onClick={onSave} disabled={busy} className={`${btn} flex-1 h-12 text-[15px] text-[#1A0E00]`} style={{ background: accent }}>
          {busy ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} />} {draft.id ? 'Save changes' : 'Add to rotation'}
        </button>
        <button onClick={onCancel} className={`${btn} h-12 px-5 text-[15px] bg-white/10 hover:bg-white/15`}>Cancel</button>
      </div>
    </div>
  );
};

// ── Cast + fullscreen ─────────────────────────────────────────────────────────

type CastTarget = { key: string; name: string; online: boolean; raw: unknown };

const CastMenu: React.FC<{ pageId: string; title: string; onClose: () => void }> = ({ pageId, title, onClose }) => {
  const [targets, setTargets] = useState<CastTarget[] | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const svc = useRef<typeof import('../../services/tv/tvReceiverService') | null>(null);

  useEffect(() => {
    let un: (() => void) | undefined, alive = true;
    import('../../services/tv/tvReceiverService').then(m => {
      if (!alive) return;
      svc.current = m;
      un = m.listenToMyTvTargets(ts => setTargets(ts.map(t => ({ key: `${t.kind}:${t.deviceId}`, name: t.name, online: t.online, raw: t }))));
    }).catch(() => setTargets([]));
    return () => { alive = false; un?.(); };
  }, []);

  const cast = async (t: CastTarget) => {
    const m = svc.current; if (!m) return;
    setSending(t.key); setNote('');
    try { await m.sendDutyToTv(t.raw as any, m.signageDuty({ pageId, title: `${title} signage` })); setNote(`Showing on ${t.name}`); }
    catch (e: any) { setNote(e?.message || 'Couldn’t reach that TV.'); }
    finally { setSending(null); }
  };

  return (
    <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-[300px] max-w-[calc(100vw-32px)] rounded-2xl border border-white/10 bg-[#120D18] shadow-2xl p-2" role="menu">
      <div className="flex items-center justify-between pl-2">
        <p className="text-[14px] font-semibold">Your TVs</p>
        <button className={iconBtn} onClick={onClose} aria-label="Close"><X size={17} /></button>
      </div>
      {targets === null ? <p className="px-2 py-3 text-[13px] text-white/50 flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> Looking for screens…</p>
        : targets.length === 0 ? <p className="px-2 py-3 text-[13px] text-white/55">No TVs yet. Open Plajah on a TV and pair it from Settings → TV, then it shows up here.</p>
        : targets.map(t => (
          <button key={t.key} onClick={() => cast(t)} disabled={!!sending} className="w-full min-h-[48px] rounded-xl px-2.5 flex items-center gap-3 hover:bg-white/[0.06] text-left disabled:opacity-50" role="menuitem">
            <Tv size={17} className="shrink-0 text-white/70" />
            <span className="flex-1 min-w-0 text-[14px] truncate">{t.name}</span>
            {sending === t.key ? <Loader2 size={15} className="animate-spin" /> : <span className="text-[12px]" style={{ color: t.online ? '#3ddc97' : 'rgba(255,255,255,.4)' }}>{t.online ? 'Online' : 'Offline'}</span>}
          </button>
        ))}
      {note && <p className="px-2.5 pt-2 pb-1 text-[13px] text-white/75">{note}</p>}
    </div>
  );
};

const FullscreenPlayer: React.FC<{ businessId: string; sellerUid: string; events: BusinessEvent[]; onClose: () => void }> = ({ businessId, sellerUid, events, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onClose = () => closeRef.current();
    const el = ref.current;
    el?.requestFullscreen?.().catch(() => { /* overlay still fills the window */ });
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onFs = () => { if (!document.fullscreenElement) onClose(); };
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFs);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, []);
  return (
    <div ref={ref} className="fixed inset-0 z-[400] bg-black group">
      <SignagePlayer businessId={businessId} sellerUid={sellerUid} events={events} />
      <button onClick={onClose} className="absolute top-4 right-4 h-11 px-4 rounded-full bg-black/60 text-white text-[14px] font-semibold inline-flex items-center gap-2 opacity-30 group-hover:opacity-100 focus:opacity-100 transition">
        <X size={16} /> Exit
      </button>
    </div>
  );
};

export default SignageStudio;
