// ProductPage — a full product page (not a popup): its own header, a big photo gallery with zoom, the buy
// box, details, customer reviews and "more from this shop". Shared by the org/department shops and the
// marketplace. The caller owns the URL (?product=<id>) so Back closes it and the link can be shared.
//
// Only real information is shown: shipping is what the order spine actually charges ($5.99, free from $50
// per shop), money goes straight to the shop, reviews come from /api/store/reviews (verified purchase is
// decided on the server from paid orders), and the rating is computed from those reviews.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft, Bell, Camera, Check, ChevronLeft, ChevronRight, Loader2, Minus, Package, Pencil, Plus,
  Share2, ShieldCheck, ShoppingBag, Sparkles, Star, ThumbsUp, Trash2, Truck, X, Zap, MessageSquare, BadgeCheck,
} from 'lucide-react';
import type { StoreProduct, StoreReview } from '../../types';
import { auth } from '../../services/backendService';
import {
  addProductReview, deleteMyProductReview, fetchProductReviews, markReviewHelpful, replyToReview,
} from '../../services/storeService';
import { availableFor, liveVariants, storefrontBadge, unitPriceCents } from '../../services/inventoryCore';
import { joinWaitlist, leaveWaitlist, isOnWaitlist } from '../../services/inventoryService';
import { boardPrice } from '../../services/commerceBus';
import UserAvatar from '../avatar/UserAvatar';

const DISPLAY = "'Bricolage Grotesque', Inter, system-ui, sans-serif";
const pretty = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');
const STAR_WORDS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

export interface ProductPageProps {
  product: StoreProduct;
  /** Other products from the same shop, best matches first (same department, same category). */
  related?: StoreProduct[];
  shopName: string;
  /** Department name when the product sits on a department shelf. */
  deptName?: string;
  accent?: string;
  cartCount?: number;
  onOpenCart?: () => void;
  onAddToCart: (product: StoreProduct, variantId?: string, quantity?: number) => void;
  /** Straight to checkout with just this item. */
  onBuyNow?: (product: StoreProduct, variantId?: string, quantity?: number) => Promise<void> | void;
  onOpenProduct?: (p: StoreProduct) => void;
  onBack: () => void;
  backLabel?: string;
  /** Loyalty points per dollar at this shop (the store order webhook gives 1). */
  pointsPerDollar?: number;
}

const Stars: React.FC<{ value: number; size?: number; onPick?: (n: number) => void; label?: string }> = ({ value, size = 16, onPick, label }) => {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <span className="inline-flex items-center gap-0.5" role={onPick ? 'radiogroup' : 'img'} aria-label={label || `${value.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map(i => {
        const fill = Math.max(0, Math.min(1, shown - (i - 1)));
        const star = (
          <span className="relative inline-block" style={{ width: size, height: size }}>
            <Star size={size} className="absolute inset-0 text-white/20" />
            {fill > 0 && (
              <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <Star size={size} className="text-amber-400 fill-amber-400" />
              </span>
            )}
          </span>
        );
        return onPick ? (
          <button key={i} type="button" role="radio" aria-checked={value === i} aria-label={`${i} star${i > 1 ? 's' : ''} — ${STAR_WORDS[i]}`}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(0)} onClick={() => onPick(i)} className="p-0.5 hover:scale-110 transition">
            {star}
          </button>
        ) : <span key={i}>{star}</span>;
      })}
    </span>
  );
};

const fmtDate = (t?: number) => (t ? new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '');

/** <img> that retries once if the first load fails (storage URLs occasionally drop when many load at once). */
const Img: React.FC<React.ImgHTMLAttributes<HTMLImageElement>> = ({ src, onError, ...rest }) => {
  const [tries, setTries] = useState(0);
  useEffect(() => setTries(0), [src]);
  const url = src && tries ? `${src}${src.includes('?') ? '&' : '?'}r=${tries}` : src;
  return <img {...rest} src={url} onError={e => { if (tries < 2) setTimeout(() => setTries(t => t + 1), 400 * (tries + 1)); onError?.(e); }} />;
};

// ── Lightbox ──────────────────────────────────────────────────────────────────
const Lightbox: React.FC<{ images: string[]; start: number; onClose: () => void; title: string }> = ({ images, start, onClose, title }) => {
  const [i, setI] = useState(start);
  const [zoom, setZoom] = useState(false);
  const [origin, setOrigin] = useState('50% 50%');
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'ArrowRight') setI(n => (n + 1) % images.length);
      if (e.key === 'ArrowLeft') setI(n => (n - 1 + images.length) % images.length);
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [images.length, onClose]);
  useEffect(() => setZoom(false), [i]);
  return (
    <div className="fixed inset-0 z-[420] bg-black flex flex-col" role="dialog" aria-label={`${title} photos`}>
      <div className="flex items-center justify-between px-4 h-14 shrink-0">
        <span className="text-[13px] text-white/60 tabular-nums">{i + 1} / {images.length}</span>
        <button onClick={onClose} className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center" aria-label="Close photos"><X size={20} /></button>
      </div>
      <div className="relative flex-1 min-h-0 flex items-center justify-center overflow-hidden"
        onMouseMove={e => { if (!zoom) return; const r = e.currentTarget.getBoundingClientRect(); setOrigin(`${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`); }}>
        <Img src={images[i]} alt={`${title} — photo ${i + 1}`} onClick={() => setZoom(z => !z)}
          className={`max-w-full max-h-full object-contain transition-transform duration-200 ${zoom ? 'cursor-zoom-out' : 'cursor-zoom-in'}`}
          style={{ transform: zoom ? 'scale(2.2)' : 'none', transformOrigin: origin }} />
        {images.length > 1 && (
          <>
            <button onClick={() => setI(n => (n - 1 + images.length) % images.length)} aria-label="Previous photo" className="absolute left-3 w-12 h-12 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center"><ChevronLeft size={22} /></button>
            <button onClick={() => setI(n => (n + 1) % images.length)} aria-label="Next photo" className="absolute right-3 w-12 h-12 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center"><ChevronRight size={22} /></button>
          </>
        )}
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 justify-center p-3 overflow-x-auto shrink-0">
          {images.map((src, n) => (
            <button key={n} onClick={() => setI(n)} aria-label={`Photo ${n + 1}`} className={`w-16 h-16 rounded-lg overflow-hidden shrink-0 border-2 ${n === i ? 'border-white' : 'border-transparent opacity-60 hover:opacity-100'}`}>
              <Img src={src} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Review form ───────────────────────────────────────────────────────────────
const ReviewForm: React.FC<{ product: StoreProduct; mine?: StoreReview; accent: string; onSaved: (r: StoreReview, agg: { rating: number; reviewCount: number }) => void; onCancel: () => void }> = ({ product, mine, accent, onSaved, onCancel }) => {
  const [rating, setRating] = useState(mine?.rating || 0);
  const [title, setTitle] = useState(mine?.title || '');
  const [body, setBody] = useState(mine?.body || '');
  const [images, setImages] = useState<string[]>(mine?.images || []);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const addPhotos = async (files: FileList | null) => {
    const uid = auth.currentUser?.uid;
    if (!files?.length || !uid) return;
    setUploading(true); setError('');
    try {
      const { uploadImageWithDerivatives } = await import('../../services/backendService');
      const room = 4 - images.length;
      const picked = Array.from(files).filter(f => f.type.startsWith('image/')).slice(0, room);
      const urls: string[] = [];
      for (let i = 0; i < picked.length; i++) {
        const up = await uploadImageWithDerivatives(`users/${uid}/reviews/${product.id}_${Date.now()}_${i}`, picked[i]);
        urls.push(up.display);
      }
      setImages(prev => [...prev, ...urls].slice(0, 4));
    } catch { setError('A photo didn\'t upload. Try again.'); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const save = async () => {
    if (!rating) { setError('Pick a star rating.'); return; }
    if (body.trim().length < 3) { setError('Say a little about it.'); return; }
    setSaving(true); setError('');
    try {
      const res = await addProductReview({ productId: product.id, rating, title: title.trim(), body: body.trim(), images });
      onSaved(res.review, { rating: res.rating, reviewCount: res.reviewCount });
    } catch (e: any) { setError(e?.message || 'Couldn\'t post your review.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="rounded-2xl border border-white/12 bg-white/[0.04] p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-xl overflow-hidden bg-black/40 shrink-0">{product.images?.[0] && <Img src={product.images[0]} alt="" className="w-full h-full object-cover" />}</div>
        <div className="min-w-0">
          <p className="text-[16px] font-bold text-white">{mine ? 'Edit your review' : 'Write a review'}</p>
          <p className="text-[13px] text-white/55 truncate">{product.title}</p>
        </div>
      </div>
      <div>
        <p className="text-[13px] font-semibold text-white/80 mb-1.5">Overall rating</p>
        <div className="flex items-center gap-3">
          <Stars value={rating} size={28} onPick={setRating} label="Your rating" />
          <span className="text-[14px] text-white/60">{STAR_WORDS[rating]}</span>
        </div>
      </div>
      <label className="block">
        <span className="text-[13px] font-semibold text-white/80">Headline</span>
        <input value={title} onChange={e => setTitle(e.target.value)} maxLength={140} placeholder="What stood out?"
          className="mt-1.5 w-full h-11 rounded-xl bg-black/30 border border-white/12 px-3 text-[15px] text-white outline-none focus:border-white/30" />
      </label>
      <label className="block">
        <span className="text-[13px] font-semibold text-white/80">Your review</span>
        <textarea value={body} onChange={e => setBody(e.target.value)} maxLength={4000} rows={5} placeholder="How was the quality? How did you use it? Would you get it again?"
          className="mt-1.5 w-full rounded-xl bg-black/30 border border-white/12 px-3 py-2.5 text-[15px] text-white outline-none focus:border-white/30 resize-y" />
      </label>
      <div>
        <p className="text-[13px] font-semibold text-white/80 mb-1.5">Photos <span className="font-normal text-white/45">(up to 4)</span></p>
        <div className="flex gap-2 flex-wrap">
          {images.map((src, i) => (
            <div key={src} className="relative w-20 h-20 rounded-xl overflow-hidden bg-black/30">
              <Img src={src} alt="" className="w-full h-full object-cover" />
              <button onClick={() => setImages(prev => prev.filter((_, n) => n !== i))} aria-label="Remove photo" className="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/70 flex items-center justify-center"><X size={14} /></button>
            </div>
          ))}
          {images.length < 4 && (
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="w-20 h-20 rounded-xl border border-dashed border-white/20 hover:border-white/40 flex flex-col items-center justify-center gap-1 text-white/55 text-[12px]">
              {uploading ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />} {uploading ? 'Adding' : 'Add'}
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => addPhotos(e.target.files)} />
        </div>
      </div>
      {error && <p role="alert" className="text-[13px] font-semibold text-red-400">{error}</p>}
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="h-11 px-5 rounded-full text-[14px] font-semibold text-white/70 bg-white/[0.06] hover:bg-white/10">Cancel</button>
        <button onClick={save} disabled={saving || uploading} className="h-11 px-6 rounded-full text-[14px] font-bold text-[#1A0E00] disabled:opacity-50 flex items-center gap-2" style={{ background: accent }}>
          {saving && <Loader2 size={15} className="animate-spin" />} {mine ? 'Save changes' : 'Post review'}
        </button>
      </div>
      <p className="text-[12px] text-white/40">Your name and photo show with your review. It gets a "Verified purchase" badge if you bought this here.</p>
    </div>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────────
const ProductPage: React.FC<ProductPageProps> = ({
  product, related = [], shopName, deptName, accent = '#FF8C00', cartCount = 0, onOpenCart, onAddToCart, onBuyNow,
  onOpenProduct, onBack, backLabel, pointsPerDollar = 1,
}) => {
  const scroller = useRef<HTMLDivElement>(null);
  const reviewsRef = useRef<HTMLElement>(null);
  const [img, setImg] = useState(0);
  const [lightbox, setLightbox] = useState<{ images: string[]; start: number } | null>(null);
  const [variant, setVariant] = useState<string | undefined>(product.variants?.length === 1 ? product.variants[0].id : undefined);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState('');
  const [onList, setOnList] = useState(false);
  const [listBusy, setListBusy] = useState(false);
  const [listMsg, setListMsg] = useState('');
  const [shared, setShared] = useState(false);
  const [reviews, setReviews] = useState<StoreReview[] | null>(null);
  const [writing, setWriting] = useState(false);
  const [sort, setSort] = useState<'recent' | 'helpful' | 'high' | 'low'>('recent');
  const [starFilter, setStarFilter] = useState<number | null>(null);
  const [photosOnly, setPhotosOnly] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [helped, setHelped] = useState<Set<string>>(new Set());
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [note, setNote] = useState('');
  const uid = auth.currentUser?.uid;
  const isSeller = !!uid && uid === product.sellerId;
  const draft = product.isActive === false;

  // New product → top of the page, fresh selections.
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
    setImg(0); setQty(1); setAdded(false); setBuyError(''); setWriting(false); setStarFilter(null);
    setVariant(product.variants?.length === 1 ? product.variants[0].id : undefined);
    setReviews(null);
    let alive = true;
    fetchProductReviews(product.id).then(r => { if (alive) setReviews(r); }).catch(() => { if (alive) setReviews([]); });
    isOnWaitlist(product.id).then(v => { if (alive) setOnList(v); }).catch(() => {});
    return () => { alive = false; };
  }, [product.id]);

  // A page, not a popup: the app behind it doesn't scroll, Escape goes back.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !lightbox) onBack(); };
    window.addEventListener('keydown', k);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', k); };
  }, [onBack, lightbox]);

  useEffect(() => { if (!note) return; const t = setTimeout(() => setNote(''), 3500); return () => clearTimeout(t); }, [note]);

  const images = product.images?.length ? product.images : [];
  const hasOptions = !!product.variants?.length;
  const needsChoice = hasOptions && !variant;
  const avail = needsChoice ? Infinity : availableFor(product, variant);
  const soldOut = hasOptions ? (needsChoice ? storefrontBadge(product).soldOut : avail <= 0) : avail <= 0;
  const price = unitPriceCents(product, variant) / 100;
  const stock = needsChoice ? storefrontBadge(product) : storefrontBadge(product, variant);
  const maxQty = Math.min(Number.isFinite(avail) ? avail : 99, 99);
  const off = product.compareAtPrice && product.compareAtPrice > product.price ? Math.round((1 - product.price / product.compareAtPrice) * 100) : 0;
  const points = Math.floor(price * qty * pointsPerDollar);

  // Rating comes from the reviews themselves.
  const list = reviews || [];
  const count = list.length;
  const avg = count ? list.reduce((s, r) => s + r.rating, 0) / count : 0;
  const dist = [5, 4, 3, 2, 1].map(n => ({ n, c: list.filter(r => r.rating === n).length }));
  const mine = uid ? list.find(r => r.reviewerId === uid) : undefined;
  const shown = useMemo(() => {
    let r = list.slice();
    if (starFilter) r = r.filter(x => x.rating === starFilter);
    if (photosOnly) r = r.filter(x => x.images?.length);
    if (verifiedOnly) r = r.filter(x => x.isVerifiedPurchase);
    r.sort((a, b) => sort === 'helpful' ? (b.helpfulCount || 0) - (a.helpfulCount || 0) || b.timestamp - a.timestamp
      : sort === 'high' ? b.rating - a.rating || b.timestamp - a.timestamp
      : sort === 'low' ? a.rating - b.rating || b.timestamp - a.timestamp
      : b.timestamp - a.timestamp);
    return r;
  }, [list, starFilter, photosOnly, verifiedOnly, sort]);
  const reviewPhotos = useMemo(() => list.flatMap(r => r.images || []), [list]);

  const toReviews = () => reviewsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const add = () => {
    if (draft || needsChoice || soldOut) return;
    onAddToCart(product, variant, qty);
    setAdded(true); setTimeout(() => setAdded(false), 2200);
  };
  const buyNow = async () => {
    if (!onBuyNow || draft || needsChoice || soldOut) return;
    setBuying(true); setBuyError('');
    try { await onBuyNow(product, variant, qty); }
    catch (e: any) { setBuyError(e?.message || 'Checkout didn\'t start. Try again.'); }
    finally { setBuying(false); }
  };
  const toggleWaitlist = async () => {
    if (!uid) { setListMsg('Sign in to get a heads-up.'); return; }
    setListBusy(true); setListMsg('');
    try {
      if (onList) { await leaveWaitlist(product.id); setOnList(false); }
      else { await joinWaitlist(product.id); setOnList(true); setListMsg('We\'ll let you know the moment it\'s back.'); }
    } catch { setListMsg('Couldn\'t save that. Try again.'); }
    finally { setListBusy(false); }
  };
  const share = async () => {
    const url = window.location.href;
    try {
      if ((navigator as any).share) await (navigator as any).share({ title: product.title, url });
      else { await navigator.clipboard.writeText(url); setShared(true); setTimeout(() => setShared(false), 2000); }
    } catch { /* cancelled */ }
  };
  const helpful = async (r: StoreReview) => {
    if (!uid) { setNote('Sign in to vote.'); return; }
    if (helped.has(r.id) || r.reviewerId === uid) return;
    setHelped(prev => new Set(prev).add(r.id));
    try {
      const res = await markReviewHelpful(r.id);
      if (!res.already) setReviews(prev => (prev || []).map(x => (x.id === r.id ? { ...x, helpfulCount: (x.helpfulCount || 0) + 1 } : x)));
    } catch (e: any) { setNote(e?.message || 'Couldn\'t save that.'); }
  };
  const removeMine = async () => {
    if (!mine || !confirm('Delete your review?')) return;
    try {
      await deleteMyProductReview(product.id);
      setReviews(prev => (prev || []).filter(x => x.id !== mine.id)); setNote('Your review was deleted.');
    } catch (e: any) { setNote(e?.message || 'Couldn\'t delete it.'); }
  };
  const sendReply = async (r: StoreReview) => {
    try {
      const res = await replyToReview(r.id, replyText);
      setReviews(prev => (prev || []).map(x => (x.id === r.id ? { ...x, sellerReply: res.sellerReply, sellerReplyAt: Date.now() } : x)));
      setReplyFor(null); setReplyText('');
    } catch (e: any) { setNote(e?.message || 'Couldn\'t post the reply.'); }
  };

  const crumbs = [shopName, deptName, pretty(product.category || 'OTHER')].filter(Boolean) as string[];

  const page = (
    <div ref={scroller} className="fixed inset-0 z-[300] overflow-y-auto bg-[#0B0B0D] text-white" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
      role="main" aria-label={product.title}>
      {/* Header */}
      <header className="sticky top-0 z-20 bg-[#0B0B0D]/95 backdrop-blur border-b border-white/[0.07]">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-3">
          <button onClick={onBack} className="h-11 pl-2 pr-4 rounded-full hover:bg-white/[0.07] flex items-center gap-2 text-[14px] font-semibold text-white/85 min-w-0">
            <ArrowLeft size={18} className="shrink-0" /> <span className="truncate">{backLabel || `${deptName || shopName} shop`}</span>
          </button>
          <nav aria-label="Breadcrumb" className="hidden md:flex items-center gap-1.5 text-[13px] text-white/45 min-w-0 flex-1">
            {crumbs.map((c, i) => (
              <React.Fragment key={i}>
                {i > 0 && <ChevronRight size={13} className="shrink-0" />}
                <span className="truncate">{c}</span>
              </React.Fragment>
            ))}
          </nav>
          <div className="flex-1 md:hidden" />
          <button onClick={share} className="h-11 px-4 rounded-full bg-white/[0.06] hover:bg-white/10 flex items-center gap-2 text-[13px] font-semibold" aria-label="Share this product">
            {shared ? <Check size={15} /> : <Share2 size={15} />} <span className="hidden sm:inline">{shared ? 'Link copied' : 'Share'}</span>
          </button>
          {onOpenCart && (
            <button onClick={onOpenCart} className="h-11 px-4 rounded-full flex items-center gap-2 text-[14px] font-bold text-[#1A0E00]" style={{ background: accent }} aria-label={`Cart, ${cartCount} items`}>
              <ShoppingBag size={16} /> <span className="tabular-nums">{cartCount}</span>
            </button>
          )}
        </div>
      </header>

      {draft && (
        <div className="max-w-6xl mx-auto px-4 pt-4">
          <p className="rounded-xl px-4 py-3 text-[14px] bg-amber-400/10 border border-amber-300/25 text-amber-100">
            Draft — only leaders can see this page. It goes on sale once it has a price and is published.
          </p>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 py-6 lg:py-10 grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-8 lg:gap-12">
        {/* Gallery */}
        <div className="lg:sticky lg:top-24 self-start flex gap-3">
          {images.length > 1 && (
            <div className="hidden sm:flex flex-col gap-2 w-[72px] shrink-0 max-h-[640px] overflow-y-auto">
              {images.map((src, i) => (
                <button key={i} onClick={() => setImg(i)} onMouseEnter={() => setImg(i)} aria-label={`Photo ${i + 1}`}
                  className={`w-[72px] h-[72px] rounded-xl overflow-hidden border-2 shrink-0 transition ${img === i ? '' : 'border-transparent opacity-70 hover:opacity-100'}`}
                  style={img === i ? { borderColor: accent } : undefined}>
                  <Img src={src} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="relative aspect-square rounded-3xl overflow-hidden bg-white/[0.04] group">
              {images[img] ? (
                <button onClick={() => setLightbox({ images, start: img })} className="w-full h-full cursor-zoom-in" aria-label="Open photo full screen">
                  <Img src={images[img]} alt={product.title} className="w-full h-full object-cover" />
                </button>
              ) : <Package size={48} className="absolute inset-0 m-auto text-white/15" />}
              {off > 0 && <span className="absolute top-4 left-4 px-3 py-1 rounded-full bg-red-500 text-white text-[13px] font-bold">{off}% off</span>}
              {images.length > 1 && (
                <>
                  <button onClick={() => setImg(i => (i - 1 + images.length) % images.length)} aria-label="Previous photo" className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/55 hover:bg-black/75 flex items-center justify-center sm:opacity-0 group-hover:opacity-100 transition"><ChevronLeft size={20} /></button>
                  <button onClick={() => setImg(i => (i + 1) % images.length)} aria-label="Next photo" className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/55 hover:bg-black/75 flex items-center justify-center sm:opacity-0 group-hover:opacity-100 transition"><ChevronRight size={20} /></button>
                  <span className="absolute bottom-3 right-3 px-2.5 py-1 rounded-full bg-black/60 text-[12px] tabular-nums">{img + 1} / {images.length}</span>
                </>
              )}
            </div>
            {images.length > 1 && (
              <div className="sm:hidden flex gap-2 mt-3 overflow-x-auto">
                {images.map((src, i) => (
                  <button key={i} onClick={() => setImg(i)} aria-label={`Photo ${i + 1}`} className={`w-16 h-16 rounded-xl overflow-hidden border-2 shrink-0 ${img === i ? '' : 'border-transparent opacity-70'}`} style={img === i ? { borderColor: accent } : undefined}>
                    <Img src={src} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Buy box */}
        <div className="min-w-0">
          <p className="text-[13px] font-semibold" style={{ color: accent }}>{deptName ? `${deptName} · ${shopName}` : shopName}</p>
          <h1 className="mt-1 text-[30px] lg:text-[36px] leading-[1.1] font-extrabold tracking-tight" style={{ fontFamily: DISPLAY }}>{product.title}</h1>

          <button onClick={toReviews} className="mt-3 flex items-center gap-2 text-[14px] text-white/70 hover:text-white">
            {reviews === null ? <span className="text-white/40">Loading reviews…</span>
              : count ? <><Stars value={avg} size={17} /> <span className="font-bold text-white tabular-nums">{avg.toFixed(1)}</span> <span className="underline underline-offset-4 decoration-white/25 tabular-nums">{count} review{count === 1 ? '' : 's'}</span></>
              : <><Stars value={0} size={17} /> <span className="underline underline-offset-4 decoration-white/25">No reviews yet — be the first</span></>}
          </button>

          <div className="mt-5 flex items-baseline gap-3 flex-wrap">
            <span className="text-[34px] font-extrabold tabular-nums" style={{ fontFamily: DISPLAY }}>{draft && !product.price ? 'Price TBD' : boardPrice(price)}</span>
            {off > 0 && <span className="text-[18px] text-white/40 line-through tabular-nums">{boardPrice(product.compareAtPrice!)}</span>}
            {off > 0 && <span className="text-[14px] font-bold text-red-400">Save {boardPrice(product.compareAtPrice! - product.price)}</span>}
          </div>
          {!draft && points > 0 && (
            <p className="mt-1.5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-amber-300">
              <Sparkles size={14} /> Earn <span className="tabular-nums">{points}</span> loyalty point{points === 1 ? '' : 's'} at {shopName}
            </p>
          )}

          {hasOptions && (
            <div className="mt-6">
              <p className="text-[14px] font-semibold text-white/85 mb-2">
                {needsChoice ? 'Choose an option' : <>Option: <span className="text-white">{product.variants!.find(v => v.id === variant)?.name}</span></>}
              </p>
              <div className="flex flex-wrap gap-2">
                {liveVariants(product).map(v => {
                  const out = availableFor(product, v.id) <= 0;
                  const on = variant === v.id;
                  return (
                    <button key={v.id} onClick={() => { setVariant(v.id); setQty(1); }} disabled={out} aria-pressed={on}
                      className={`min-h-11 px-4 rounded-xl text-[14px] font-semibold border transition disabled:opacity-35 disabled:line-through disabled:cursor-not-allowed ${on ? 'text-[#1A0E00]' : 'border-white/15 hover:border-white/35 text-white/85'}`}
                      style={on ? { background: accent, borderColor: accent } : undefined}>
                      {v.name}{out ? ' · sold out' : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
            {draft ? (
              <p className="text-[14px] text-white/60">Not for sale yet.</p>
            ) : soldOut ? (
              <>
                <p className="text-[15px] font-bold text-pink-300">Sold out</p>
                <button onClick={toggleWaitlist} disabled={listBusy}
                  className={`w-full h-12 rounded-xl text-[15px] font-bold flex items-center justify-center gap-2 disabled:opacity-50 ${onList ? 'bg-white/10 text-white' : 'text-[#1A0E00]'}`}
                  style={onList ? undefined : { background: accent }}>
                  {listBusy ? <Loader2 size={16} className="animate-spin" /> : <Bell size={16} />} {onList ? 'You\'re on the list · tap to cancel' : 'Tell me when it\'s back'}
                </button>
                {listMsg && <p className="text-[13px] text-white/55">{listMsg}</p>}
              </>
            ) : (
              <>
                {stock.label && <p className="text-[14px] font-semibold text-pink-300">{stock.label}</p>}
                <div className="flex items-center gap-3">
                  <span className="text-[14px] text-white/70">Quantity</span>
                  <div className="flex items-center rounded-xl border border-white/15">
                    <button onClick={() => setQty(q => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="One fewer" className="w-11 h-11 flex items-center justify-center disabled:opacity-30"><Minus size={16} /></button>
                    <span className="w-10 text-center text-[16px] font-bold tabular-nums" aria-live="polite">{qty}</span>
                    <button onClick={() => setQty(q => Math.min(maxQty, q + 1))} disabled={qty >= maxQty} aria-label="One more" className="w-11 h-11 flex items-center justify-center disabled:opacity-30"><Plus size={16} /></button>
                  </div>
                </div>
                <button onClick={add} disabled={needsChoice}
                  className="w-full h-12 rounded-xl text-[15px] font-bold text-[#1A0E00] flex items-center justify-center gap-2 disabled:opacity-45" style={{ background: accent }}>
                  {added ? <><Check size={17} /> Added to cart</> : needsChoice ? 'Choose an option' : <><ShoppingBag size={17} /> Add to cart</>}
                </button>
                {onBuyNow && (
                  <button onClick={buyNow} disabled={needsChoice || buying}
                    className="w-full h-12 rounded-xl text-[15px] font-bold bg-white text-black hover:bg-white/90 flex items-center justify-center gap-2 disabled:opacity-45">
                    {buying ? <Loader2 size={17} className="animate-spin" /> : <Zap size={17} />} Buy now
                  </button>
                )}
                {buyError && <p role="alert" className="text-[13px] font-semibold text-red-400">{buyError}</p>}
              </>
            )}
          </div>

          <ul className="mt-5 space-y-3 text-[14px] text-white/75">
            {product.isDigital ? (
              <li className="flex gap-3"><Zap size={18} className="shrink-0 text-white/45" /> Digital item — yours right after payment, nothing ships.</li>
            ) : (
              <li className="flex gap-3"><Truck size={18} className="shrink-0 text-white/45" /> <span>Shipping is <b className="text-white">$5.99</b>, or <b className="text-white">free</b> on orders of $50 or more from {shopName}. You enter your address at checkout.</span></li>
            )}
            <li className="flex gap-3"><ShieldCheck size={18} className="shrink-0 text-white/45" /> Secure checkout through Stripe. Your payment goes straight to {shopName}.</li>
            {!draft && <li className="flex gap-3"><Sparkles size={18} className="shrink-0 text-white/45" /> Every paid order adds loyalty points and counts toward your shopper achievements.</li>}
          </ul>

          {!!product.features?.length && (
            <section className="mt-8">
              <h2 className="text-[18px] font-bold mb-3" style={{ fontFamily: DISPLAY }}>Highlights</h2>
              <ul className="space-y-2">
                {product.features.map((f, i) => (
                  <li key={i} className="flex gap-2.5 text-[15px] text-white/80"><Check size={17} className="shrink-0 mt-0.5" style={{ color: accent }} /> {f}</li>
                ))}
              </ul>
            </section>
          )}

          {product.description && (
            <section className="mt-8">
              <h2 className="text-[18px] font-bold mb-3" style={{ fontFamily: DISPLAY }}>About this item</h2>
              <p className="text-[15px] leading-relaxed text-white/75 whitespace-pre-line">{product.description}</p>
            </section>
          )}

          {!!product.specs?.length && (
            <section className="mt-8">
              <h2 className="text-[18px] font-bold mb-3" style={{ fontFamily: DISPLAY }}>Details</h2>
              <dl className="rounded-2xl border border-white/10 overflow-hidden">
                {product.specs.map((s, i) => (
                  <div key={i} className={`grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 px-4 py-3 text-[14px] ${i % 2 ? 'bg-white/[0.02]' : 'bg-white/[0.045]'}`}>
                    <dt className="text-white/55">{s.label}</dt><dd className="text-white/90">{s.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {!!product.tags?.length && (
            <div className="mt-6 flex flex-wrap gap-2">
              {product.tags.map(t => <span key={t} className="px-3 py-1.5 rounded-full bg-white/[0.06] text-[12px] text-white/65">#{t}</span>)}
            </div>
          )}
        </div>
      </div>

      {/* Reviews */}
      <section ref={reviewsRef} id="reviews" className="border-t border-white/[0.07] scroll-mt-16">
        <div className="max-w-6xl mx-auto px-4 py-10 grid lg:grid-cols-[320px_minmax(0,1fr)] gap-10">
          <div>
            <h2 className="text-[24px] font-extrabold tracking-tight" style={{ fontFamily: DISPLAY }}>Customer reviews</h2>
            {reviews === null ? (
              <Loader2 size={20} className="mt-4 animate-spin text-white/35" />
            ) : (
              <>
                <div className="mt-3 flex items-center gap-3">
                  <Stars value={avg} size={22} />
                  <span className="text-[18px] font-bold tabular-nums">{count ? `${avg.toFixed(1)} out of 5` : 'No ratings yet'}</span>
                </div>
                <p className="mt-1 text-[14px] text-white/55 tabular-nums">{count} review{count === 1 ? '' : 's'}</p>
                <div className="mt-5 space-y-2">
                  {dist.map(({ n, c }) => {
                    const pct = count ? Math.round((c / count) * 100) : 0;
                    const on = starFilter === n;
                    return (
                      <button key={n} onClick={() => setStarFilter(on ? null : n)} disabled={!c} aria-pressed={on}
                        className={`w-full flex items-center gap-3 text-[14px] rounded-lg px-1 py-0.5 disabled:cursor-default ${on ? 'bg-white/[0.07]' : c ? 'hover:bg-white/[0.04]' : ''}`}>
                        <span className="w-12 text-left text-white/70">{n} star</span>
                        <span className="flex-1 h-3 rounded-full bg-white/[0.08] overflow-hidden"><span className="block h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} /></span>
                        <span className="w-10 text-right tabular-nums text-white/55">{pct}%</span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-7 pt-6 border-t border-white/[0.08]">
                  <p className="text-[16px] font-bold">{mine ? 'You reviewed this' : 'Share your thoughts'}</p>
                  <p className="mt-1 text-[14px] text-white/55">{mine ? 'You can change or remove your review any time.' : 'Help other shoppers — tell them what you think.'}</p>
                  {isSeller ? (
                    <p className="mt-3 text-[13px] text-white/45">You sell this item, so you can reply to reviews but not write one.</p>
                  ) : draft ? (
                    <p className="mt-3 text-[13px] text-white/45">Reviews open once it's on sale.</p>
                  ) : uid ? (
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => { setWriting(true); toReviews(); }} className="flex-1 h-11 rounded-full border border-white/20 hover:border-white/40 text-[14px] font-semibold flex items-center justify-center gap-2">
                        <Pencil size={15} /> {mine ? 'Edit your review' : 'Write a review'}
                      </button>
                      {mine && <button onClick={removeMine} aria-label="Delete your review" className="w-11 h-11 rounded-full border border-white/20 hover:border-red-400/60 flex items-center justify-center text-white/65 hover:text-red-300"><Trash2 size={16} /></button>}
                    </div>
                  ) : (
                    <p className="mt-3 text-[14px] text-white/60">Sign in to write a review.</p>
                  )}
                </div>
                {reviewPhotos.length > 0 && (
                  <div className="mt-7 pt-6 border-t border-white/[0.08]">
                    <p className="text-[16px] font-bold mb-3">Photos from customers</p>
                    <div className="grid grid-cols-4 gap-2">
                      {reviewPhotos.slice(0, 8).map((src, i) => (
                        <button key={i} onClick={() => setLightbox({ images: reviewPhotos, start: i })} className="aspect-square rounded-lg overflow-hidden bg-white/5"><Img src={src} alt="" className="w-full h-full object-cover" /></button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="min-w-0">
            {writing && (
              <div className="mb-8">
                <ReviewForm product={product} mine={mine} accent={accent} onCancel={() => setWriting(false)}
                  onSaved={r => { setReviews(prev => [r, ...(prev || []).filter(x => x.id !== r.id)]); setWriting(false); setNote(mine ? 'Your review was updated.' : 'Thanks — your review is up.'); }} />
              </div>
            )}

            {count > 0 && (
              <div className="flex items-center gap-2 flex-wrap mb-5">
                <label className="flex items-center gap-2 text-[14px] text-white/65">
                  Sort
                  <select value={sort} onChange={e => setSort(e.target.value as any)} className="h-10 rounded-xl bg-white/[0.06] border border-white/12 px-3 text-[14px] text-white outline-none">
                    <option value="recent">Most recent</option>
                    <option value="helpful">Most helpful</option>
                    <option value="high">Highest rated</option>
                    <option value="low">Lowest rated</option>
                  </select>
                </label>
                <button onClick={() => setVerifiedOnly(v => !v)} aria-pressed={verifiedOnly} className={`h-10 px-4 rounded-full text-[13px] font-semibold border ${verifiedOnly ? 'bg-white text-black border-white' : 'border-white/15 text-white/75 hover:border-white/35'}`}>Verified purchases</button>
                {reviewPhotos.length > 0 && <button onClick={() => setPhotosOnly(v => !v)} aria-pressed={photosOnly} className={`h-10 px-4 rounded-full text-[13px] font-semibold border ${photosOnly ? 'bg-white text-black border-white' : 'border-white/15 text-white/75 hover:border-white/35'}`}>With photos</button>}
                {starFilter && <button onClick={() => setStarFilter(null)} className="h-10 px-4 rounded-full text-[13px] font-semibold bg-white/[0.08] flex items-center gap-1.5">{starFilter} star <X size={13} /></button>}
              </div>
            )}

            {reviews !== null && count === 0 && !writing && (
              <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center">
                <MessageSquare size={26} className="mx-auto text-white/30" />
                <p className="mt-3 text-[16px] font-semibold">No reviews yet</p>
                <p className="mt-1 text-[14px] text-white/55">Bought this? Your review helps the next person decide.</p>
              </div>
            )}
            {count > 0 && shown.length === 0 && <p className="text-[14px] text-white/55">No reviews match those filters.</p>}

            <ol className="space-y-6">
              {shown.map(r => (
                <li key={r.id} className="pb-6 border-b border-white/[0.07] last:border-0">
                  <div className="flex items-center gap-3">
                    <UserAvatar uid={r.reviewerId} src={r.reviewerPhoto} alt="" className="w-10 h-10 rounded-full object-cover bg-white/10"
                      fallback={<span className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-[15px] font-bold">{(r.reviewerName || '?').charAt(0)}</span>} />
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold truncate">{r.reviewerName}{r.reviewerId === uid && <span className="ml-2 text-[12px] font-normal text-white/45">(you)</span>}</p>
                      {r.isVerifiedPurchase && <p className="text-[12px] font-semibold text-emerald-300 flex items-center gap-1"><BadgeCheck size={13} /> Verified purchase</p>}
                    </div>
                  </div>
                  <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                    <Stars value={r.rating} size={15} />
                    {r.title && <span className="text-[15px] font-bold">{r.title}</span>}
                  </div>
                  <p className="mt-1 text-[13px] text-white/45">Reviewed {fmtDate(r.timestamp)}{r.editedAt ? ' · edited' : ''}</p>
                  <p className="mt-2 text-[15px] leading-relaxed text-white/80 whitespace-pre-line">{r.body}</p>
                  {!!r.images?.length && (
                    <div className="mt-3 flex gap-2 flex-wrap">
                      {r.images.map((src, i) => (
                        <button key={i} onClick={() => setLightbox({ images: r.images!, start: i })} className="w-24 h-24 rounded-xl overflow-hidden bg-white/5"><Img src={src} alt="" className="w-full h-full object-cover" /></button>
                      ))}
                    </div>
                  )}
                  {r.sellerReply && (
                    <div className="mt-4 ml-1 pl-4 border-l-2 py-1" style={{ borderColor: accent }}>
                      <p className="text-[13px] font-bold" style={{ color: accent }}>Reply from {shopName}</p>
                      <p className="mt-1 text-[14px] text-white/75 whitespace-pre-line">{r.sellerReply}</p>
                    </div>
                  )}
                  <div className="mt-3 flex items-center gap-3 flex-wrap">
                    {r.reviewerId !== uid && (
                      <button onClick={() => helpful(r)} disabled={helped.has(r.id)}
                        className="h-10 px-4 rounded-full border border-white/15 hover:border-white/35 text-[13px] font-semibold flex items-center gap-2 disabled:opacity-60">
                        <ThumbsUp size={14} /> {helped.has(r.id) ? 'Thanks!' : 'Helpful'}
                      </button>
                    )}
                    {(r.helpfulCount || 0) > 0 && <span className="text-[13px] text-white/50 tabular-nums">{r.helpfulCount} {r.helpfulCount === 1 ? 'person' : 'people'} found this helpful</span>}
                    {isSeller && replyFor !== r.id && (
                      <button onClick={() => { setReplyFor(r.id); setReplyText(r.sellerReply || ''); }} className="h-10 px-4 rounded-full text-[13px] font-semibold bg-white/[0.06] hover:bg-white/10">{r.sellerReply ? 'Edit reply' : 'Reply as the shop'}</button>
                    )}
                  </div>
                  {isSeller && replyFor === r.id && (
                    <div className="mt-3 space-y-2">
                      <textarea value={replyText} onChange={e => setReplyText(e.target.value)} rows={3} maxLength={2000} placeholder={`Reply publicly as ${shopName}…`}
                        className="w-full rounded-xl bg-black/30 border border-white/12 px-3 py-2.5 text-[15px] text-white outline-none focus:border-white/30" />
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setReplyFor(null)} className="h-10 px-4 rounded-full text-[13px] font-semibold bg-white/[0.06]">Cancel</button>
                        <button onClick={() => sendReply(r)} className="h-10 px-5 rounded-full text-[13px] font-bold text-[#1A0E00]" style={{ background: accent }}>{replyText.trim() ? 'Post reply' : 'Remove reply'}</button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* More from this shop */}
      {related.length > 0 && (
        <section className="border-t border-white/[0.07]">
          <div className="max-w-6xl mx-auto px-4 py-10">
            <h2 className="text-[22px] font-extrabold tracking-tight mb-5" style={{ fontFamily: DISPLAY }}>More from {deptName || shopName}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {related.slice(0, 10).map(p => {
                const b = p.isActive === false ? { label: 'Draft', soldOut: false } : storefrontBadge(p);
                return (
                  <button key={p.id} onClick={() => onOpenProduct?.(p)} className="text-left group">
                    <div className="aspect-square rounded-2xl overflow-hidden bg-white/[0.04] relative">
                      {p.images?.[0] ? <Img src={p.images[0]} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-[1.03] transition duration-300" /> : <Package size={26} className="absolute inset-0 m-auto text-white/15" />}
                      {b.label && <span className="absolute top-2 left-2 text-[11px] font-bold px-2.5 py-1 rounded-full bg-black/70" style={{ color: b.soldOut ? '#FF6FA3' : accent }}>{b.label}</span>}
                    </div>
                    <p className="mt-2 text-[14px] font-semibold line-clamp-2 group-hover:underline underline-offset-4">{p.title}</p>
                    {!!p.reviewCount && <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-white/55"><Stars value={p.rating || 0} size={12} /> <span className="tabular-nums">{p.reviewCount}</span></p>}
                    <p className="mt-0.5 text-[15px] font-bold tabular-nums">{p.isActive === false && !p.price ? 'Price TBD' : boardPrice(p.price)}{p.variants?.length ? '+' : ''}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <footer className="border-t border-white/[0.07]">
        <div className="max-w-6xl mx-auto px-4 py-8 flex items-center justify-between gap-3 flex-wrap">
          <button onClick={onBack} className="h-11 px-4 rounded-full bg-white/[0.06] hover:bg-white/10 text-[14px] font-semibold flex items-center gap-2"><ArrowLeft size={16} /> Back to the {deptName || shopName} shop</button>
          <p className="text-[13px] text-white/40">Sold by {shopName}</p>
        </div>
      </footer>

      {note && <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[410] px-5 py-3 rounded-full bg-white text-black text-[14px] font-semibold shadow-2xl">{note}</div>}
      {lightbox && <Lightbox images={lightbox.images} start={lightbox.start} title={product.title} onClose={() => setLightbox(null)} />}
    </div>
  );

  return createPortal(page, document.body);
};

export default ProductPage;

// ── URL: the open product lives in ?product=<id>, so Back closes it and the link can be shared. ──
// App's popstate handler leaves these entries alone (it checks state.productSheet and the window flag
// below), so opening a product never disturbs the app's own view history.
export const PRODUCT_PARAM = 'product';
const readProductParam = () => {
  try { return new URLSearchParams(window.location.search).get(PRODUCT_PARAM); } catch { return null; }
};
const urlWith = (id: string | null) => {
  const u = new URL(window.location.href);
  if (id) u.searchParams.set(PRODUCT_PARAM, id); else u.searchParams.delete(PRODUCT_PARAM);
  return u.pathname + u.search + u.hash;
};

/** Which product page is open, kept in the URL. `ids` = the products this shop can open (others are ignored). */
export function useProductRoute(ids: string[] | null) {
  const [openId, setOpenId] = useState<string | null>(() => readProductParam());
  const pushed = useRef(false);
  useEffect(() => {
    const onPop = () => { const id = readProductParam(); setOpenId(id); if (!id) pushed.current = false; };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const known = !!openId && !!ids && ids.includes(openId);
  useEffect(() => {
    (window as any).__plajahProductSheet = known ? openId : null;
    return () => { (window as any).__plajahProductSheet = null; };
  }, [known, openId]);
  const open = (id: string) => {
    const state = { ...(window.history.state || {}), productSheet: id };
    if (openId) window.history.replaceState(state, '', urlWith(id));      // product → product: Back still goes to the shop
    else { window.history.pushState(state, '', urlWith(id)); pushed.current = true; }
    setOpenId(id);
  };
  const close = () => {
    if (pushed.current) { window.history.back(); return; }               // popstate clears it
    const { productSheet, ...rest } = window.history.state || {};
    window.history.replaceState(rest, '', urlWith(null));                 // landed straight on a shared link
    setOpenId(null);
  };
  return { openId: known ? openId : null, open, close };
}
