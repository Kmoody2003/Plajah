import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, MapPin, Phone, Globe, Clock, Star, MessageSquare,
  Instagram, Twitter, Facebook, ShoppingBag, Radio, Monitor,
  CheckCircle2, ChevronDown, ChevronUp, ExternalLink, Tag,
  Wifi, ParkingCircle, Coffee, Utensils, Music2, Leaf, Shield,
  Send, Heart, UtensilsCrossed, Image as ImageIcon, Calendar,
  Ticket, Gift, Zap, ChevronRight, X, Presentation,
} from 'lucide-react';
import type { BusinessPage, BusinessMenuItem, BusinessEvent, PitchDeck } from '../types';
import { generateBusinessDeck } from '../services/pitchDeckTemplates';
import BusinessMessageOptIn from './BusinessMessageOptIn';
import StorefrontNowPlaying from './StorefrontNowPlaying';

// ── HELPERS ──────────────────────────────────────────────────────────────────

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS: Record<string, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
};
const DAY_FULL: Record<string, string> = {
  monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday',
  friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
};

const AMENITY_ICONS: Record<string, React.ReactNode> = {
  'wifi':         <Wifi size={14} />,
  'parking':      <ParkingCircle size={14} />,
  'coffee':       <Coffee size={14} />,
  'food':         <Utensils size={14} />,
  'music':        <Music2 size={14} />,
  'outdoor':      <Leaf size={14} />,
  'accessible':   <Shield size={14} />,
};

function todayKey() {
  return DAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];
}

function isOpenNow(hours?: BusinessPage['hours']): boolean {
  if (!hours) return false;
  const today = todayKey();
  const slot = hours[today];
  if (!slot || slot.closed) return false;
  const now = new Date();
  const [oh, om] = slot.open.split(':').map(Number);
  const [ch, cm] = slot.close.split(':').map(Number);
  const nowMins = now.getHours() * 60 + now.getMinutes();
  return nowMins >= oh * 60 + om && nowMins < ch * 60 + cm;
}

function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function StarDisplay({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} size={size} className={i <= Math.round(rating) ? 'text-amber-400 fill-amber-400' : 'text-white/20'} />
      ))}
    </div>
  );
}

// ── REVIEW FORM ───────────────────────────────────────────────────────────────

interface Review {
  id: string;
  authorName: string;
  rating: number;
  text: string;
  timestamp: number;
  isVerified?: boolean;
}

interface ReviewFormProps {
  businessId: string;
  currentUserName?: string;
  onSubmit: (rating: number, text: string) => void;
}

function ReviewForm({ businessId, currentUserName, onSubmit }: ReviewFormProps) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!rating || !text.trim()) return;
    setSubmitting(true);
    await onSubmit(rating, text.trim());
    setRating(0); setText(''); setSubmitting(false);
  };

  return (
    <div className="bg-white/5 rounded-2xl p-5 border border-white/10">
      <h4 className="text-white font-bold text-sm mb-3">Leave a review</h4>
      <div className="flex gap-1 mb-3">
        {[1, 2, 3, 4, 5].map(i => (
          <button key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(0)} onClick={() => setRating(i)}>
            <Star size={22} className={`transition-colors ${i <= (hover || rating) ? 'text-amber-400 fill-amber-400' : 'text-white/20'}`} />
          </button>
        ))}
      </div>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Share your experience..."
        rows={3}
        className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 resize-none focus:outline-none focus:border-[--small-orange]/50"
      />
      <motion.button
        onClick={handleSubmit}
        disabled={!rating || !text.trim() || submitting}
        className="mt-3 flex items-center gap-2 bg-[--small-orange] text-white text-sm font-bold px-5 py-2.5 rounded-xl hover:opacity-90 disabled:opacity-40 transition-opacity"
        whileTap={{ scale: 0.97 }}
      >
        <Send size={14} /> {submitting ? 'Posting…' : 'Post Review'}
      </motion.button>
    </div>
  );
}

// ── FEATURE BADGES ────────────────────────────────────────────────────────────

function FeaturePill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-full px-3 py-1.5 text-xs text-white/70">
      <span className="text-[--small-orange]">{icon}</span>
      {label}
    </div>
  );
}

// ── MENU SECTION ─────────────────────────────────────────────────────────────

function MenuSection({ items }: { items: BusinessMenuItem[] }) {
  const categories = Array.from(new Set(items.map(i => i.category)));
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [lightboxItem, setLightboxItem] = useState<BusinessMenuItem | null>(null);

  const allCategories = ['All', ...categories];
  const filtered = activeCategory === 'All' ? items : items.filter(i => i.category === activeCategory);
  const featured = items.filter(i => i.isFeatured);

  return (
    <div className="space-y-5">
      {/* Featured items */}
      {featured.length > 0 && (
        <div>
          <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2">
            <Zap size={14} className="text-[--small-orange]" /> Featured
          </h3>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-none">
            {featured.map(item => (
              <motion.div
                key={item.id}
                onClick={() => setLightboxItem(item)}
                className="flex-shrink-0 w-40 bg-white/5 border border-white/10 rounded-2xl overflow-hidden cursor-pointer hover:border-[--small-orange]/40 transition-colors"
                whileTap={{ scale: 0.97 }}
              >
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.name} className="w-full h-24 object-cover" />
                ) : (
                  <div className="w-full h-24 bg-gradient-to-br from-[--small-orange]/10 to-white/5 flex items-center justify-center">
                    <UtensilsCrossed size={24} className="text-white/20" />
                  </div>
                )}
                <div className="p-2.5">
                  <div className="text-white text-xs font-bold truncate">{item.name}</div>
                  <div className="text-[--small-orange] text-xs font-black mt-0.5">{formatPrice(item.price)}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Category filter */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
        {allCategories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors ${activeCategory === cat ? 'bg-[--small-orange] text-white' : 'bg-white/5 text-white/50 hover:text-white/80'}`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Items list */}
      <div className="space-y-2.5">
        {filtered.map(item => (
          <motion.div
            key={item.id}
            onClick={() => setLightboxItem(item)}
            className="flex gap-3 bg-white/5 border border-white/10 rounded-2xl p-3 cursor-pointer hover:border-white/20 transition-colors"
            whileTap={{ scale: 0.98 }}
          >
            {item.imageUrl ? (
              <img src={item.imageUrl} alt={item.name} className="w-16 h-16 rounded-xl object-cover flex-shrink-0" />
            ) : (
              <div className="w-16 h-16 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
                <UtensilsCrossed size={20} className="text-white/20" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="font-bold text-sm text-white truncate">{item.name}</div>
                <div className="text-[--small-orange] font-black text-sm flex-shrink-0">{formatPrice(item.price)}</div>
              </div>
              {item.description && (
                <p className="text-white/50 text-xs mt-0.5 line-clamp-2">{item.description}</p>
              )}
              {item.tags && item.tags.length > 0 && (
                <div className="flex gap-1 mt-1.5 flex-wrap">
                  {item.tags.map(tag => (
                    <span key={tag} className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-white/5 text-white/40 rounded">{tag}</span>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Item detail lightbox */}
      <AnimatePresence>
        {lightboxItem && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setLightboxItem(null)}
          >
            <motion.div
              className="w-full max-w-sm bg-[#151515] border border-white/10 rounded-3xl overflow-hidden"
              initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
              onClick={e => e.stopPropagation()}
            >
              {lightboxItem.imageUrl ? (
                <img src={lightboxItem.imageUrl} alt={lightboxItem.name} className="w-full h-48 object-cover" />
              ) : (
                <div className="w-full h-32 bg-gradient-to-br from-[--small-orange]/10 to-white/5 flex items-center justify-center">
                  <UtensilsCrossed size={40} className="text-white/20" />
                </div>
              )}
              <div className="p-5">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h3 className="text-white font-black text-lg">{lightboxItem.name}</h3>
                  <button onClick={() => setLightboxItem(null)} className="p-1 text-white/40 hover:text-white transition-colors">
                    <X size={18} />
                  </button>
                </div>
                <div className="text-[--small-orange] font-black text-xl mb-3">{formatPrice(lightboxItem.price)}</div>
                {lightboxItem.description && (
                  <p className="text-white/60 text-sm leading-relaxed">{lightboxItem.description}</p>
                )}
                {lightboxItem.tags && lightboxItem.tags.length > 0 && (
                  <div className="flex gap-1.5 mt-3 flex-wrap">
                    {lightboxItem.tags.map(tag => (
                      <span key={tag} className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 bg-white/5 border border-white/10 text-white/50 rounded-full">{tag}</span>
                    ))}
                  </div>
                )}
                <div className="mt-4 text-xs text-white/30 text-center">Ask staff to order</div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── GALLERY SECTION ───────────────────────────────────────────────────────────

function GallerySection({ images }: { images: string[] }) {
  const [lightbox, setLightbox] = useState<string | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {images.map((url, i) => (
          <motion.div
            key={i}
            onClick={() => setLightbox(url)}
            className={`relative overflow-hidden rounded-2xl cursor-pointer bg-white/5 ${i === 0 ? 'col-span-2 row-span-2' : ''}`}
            style={{ aspectRatio: i === 0 ? '16/9' : '1/1' }}
            whileTap={{ scale: 0.97 }}
          >
            <img src={url} alt="" className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {lightbox && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setLightbox(null)}
          >
            <button className="absolute top-4 right-4 p-2 text-white/60 hover:text-white transition-colors">
              <X size={24} />
            </button>
            <motion.img
              src={lightbox}
              alt=""
              className="max-w-full max-h-full object-contain rounded-2xl"
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ── EVENTS SECTION ────────────────────────────────────────────────────────────

function EventsSection({ events }: { events: BusinessEvent[] }) {
  const now = new Date();
  const upcoming = events.filter(e => new Date(e.date) >= now);
  const past = events.filter(e => new Date(e.date) < now);
  const list = upcoming.length > 0 ? upcoming : past;

  return (
    <div className="space-y-3">
      {upcoming.length === 0 && past.length > 0 && (
        <p className="text-white/30 text-xs text-center mb-4">Showing past events</p>
      )}
      {list.map(event => {
        const d = new Date(event.date);
        const isPast = d < now;
        return (
          <div key={event.id} className={`relative overflow-hidden bg-white/5 border rounded-2xl ${isPast ? 'border-white/5 opacity-60' : 'border-white/10'}`}>
            {event.imageUrl && (
              <img src={event.imageUrl} alt="" className="w-full h-32 object-cover" />
            )}
            <div className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 bg-[--small-orange]/10 border border-[--small-orange]/20 rounded-xl px-3 py-2 text-center min-w-[52px]">
                  <div className="text-[--small-orange] font-black text-lg leading-none">{d.getDate()}</div>
                  <div className="text-[--small-orange]/70 text-[10px] font-bold uppercase">{d.toLocaleDateString('en', { month: 'short' })}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-white font-bold text-sm">{event.title}</h4>
                  {event.time && <div className="text-white/40 text-xs mt-0.5">{event.time}</div>}
                  {event.description && <p className="text-white/60 text-xs mt-1.5 leading-relaxed">{event.description}</p>}
                  <div className="flex items-center gap-2 mt-2">
                    {event.isFree ? (
                      <span className="text-xs font-bold text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">Free</span>
                    ) : event.price !== undefined ? (
                      <span className="text-xs font-bold text-white/60 bg-white/5 px-2 py-0.5 rounded-full">{formatPrice(event.price)}</span>
                    ) : null}
                    {event.ticketUrl && !isPast && (
                      <a
                        href={event.ticketUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-xs font-bold text-[--small-orange] hover:underline"
                      >
                        <Ticket size={11} /> Tickets <ExternalLink size={9} />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────

interface BusinessPublicPageProps {
  business: BusinessPage;
  onBack?: () => void;
  currentUserId?: string;
  currentUserName?: string;
  onCreatePitchDeck?: (deck: PitchDeck) => void;
}

type TabId = 'ABOUT' | 'MENU' | 'GALLERY' | 'EVENTS' | 'REVIEWS' | 'HOURS';

export default function BusinessPublicPage({ business, onBack, currentUserId, currentUserName, onCreatePitchDeck }: BusinessPublicPageProps) {
  const [activeTab, setActiveTab] = useState<TabId>('ABOUT');
  const [reviews, setReviews] = useState<Review[]>([]);
  const [liked, setLiked] = useState(false);
  const [toast, setToast] = useState('');
  const [showPromoBanner, setShowPromoBanner] = useState(true);
  const open = isOpenNow(business.hours);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleReviewSubmit = async (rating: number, text: string) => {
    const newReview: Review = {
      id: Date.now().toString(),
      authorName: currentUserName ?? 'Anonymous',
      rating, text,
      timestamp: Date.now(),
      isVerified: !!currentUserId,
    };
    setReviews(prev => [newReview, ...prev]);
    showToast('Review posted!');
  };

  const displayRating = business.rating ?? (reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null);
  const totalReviews = business.reviewCount ?? reviews.length;

  const coverUrl = business.coverImageUrl ?? business.coverUrl;
  const priceColor = { '$': '#22c55e', '$$': '#eab308', '$$$': '#f97316', '$$$$': '#ef4444' }[business.priceRange ?? '$'] ?? '#fff';

  const hasMenu = business.menuItems && business.menuItems.length > 0;
  const hasGallery = business.galleryImages && business.galleryImages.length > 0;
  const hasEvents = business.events && business.events.length > 0;

  const tabs: { id: TabId; label: string }[] = [
    { id: 'ABOUT', label: 'About' },
    ...(hasMenu ? [{ id: 'MENU' as TabId, label: 'Menu' }] : []),
    ...(hasGallery ? [{ id: 'GALLERY' as TabId, label: 'Gallery' }] : []),
    ...(hasEvents ? [{ id: 'EVENTS' as TabId, label: 'Events' }] : []),
    { id: 'REVIEWS', label: `Reviews${totalReviews ? ` (${totalReviews})` : ''}` },
    ...(business.hours ? [{ id: 'HOURS' as TabId, label: 'Hours' }] : []),
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-green-500 text-white text-sm font-semibold px-4 py-2 rounded-full flex items-center gap-2 shadow-xl"
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
          >
            <CheckCircle2 size={14} /> {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Promo Banner */}
      <AnimatePresence>
        {business.promoBanner && showPromoBanner && (
          <motion.div
            className="relative bg-gradient-to-r from-[--small-orange] to-amber-600 text-white text-xs font-bold text-center py-2.5 px-10"
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
          >
            {business.promoBanner}
            <button
              onClick={() => setShowPromoBanner(false)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Demo Badge */}
      {business.isDemo && (
        <div className="bg-purple-900/40 border-b border-purple-500/20 text-center py-2 px-4">
          <span className="text-purple-300 text-xs font-bold">Demo Business — This page shows how your business can look on Plajah</span>
        </div>
      )}

      {/* Hero */}
      <div className="relative h-64 sm:h-80 overflow-hidden">
        {coverUrl ? (
          <img src={coverUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-[--small-orange]/20 via-purple-900/20 to-[#0a0a0a]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/40 to-transparent" />

        {onBack && (
          <button
            onClick={onBack}
            className="absolute top-4 left-4 p-2.5 bg-black/40 backdrop-blur-sm rounded-full text-white hover:bg-black/60 transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
        )}

        <button
          onClick={() => setLiked(l => !l)}
          className="absolute top-4 right-4 p-2.5 bg-black/40 backdrop-blur-sm rounded-full transition-colors"
        >
          <Heart size={18} className={liked ? 'text-red-400 fill-red-400' : 'text-white/70'} />
        </button>

        {business.hours && (
          <div className={`absolute bottom-4 left-4 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${open ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${open ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
            {open ? 'Open' : 'Closed'}
          </div>
        )}
      </div>

      {/* Identity bar */}
      <div className="max-w-3xl mx-auto px-4 -mt-8 relative z-10">
        <div className="flex items-end gap-4 mb-5">
          {business.logoUrl ? (
            <img src={business.logoUrl} alt="" className="w-20 h-20 rounded-2xl object-cover border-4 border-[#0a0a0a] shadow-xl flex-shrink-0" />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[--small-orange] to-amber-700 flex items-center justify-center border-4 border-[#0a0a0a] shadow-xl flex-shrink-0">
              <ShoppingBag size={28} className="text-white" />
            </div>
          )}
          <div className="pb-1 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-black text-white">{business.businessName}</h1>
              {business.isVerified && (
                <span className="flex items-center gap-1 text-[--small-orange] text-xs font-bold bg-[--small-orange]/10 px-2 py-0.5 rounded-full">
                  <CheckCircle2 size={10} /> Verified
                </span>
              )}
              {business.priceRange && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ color: priceColor, background: priceColor + '15' }}>
                  {business.priceRange}
                </span>
              )}
            </div>
            <p className="text-white/50 text-sm">{business.businessType} {business.city ? `· ${business.city}` : ''}</p>
            {displayRating !== null && (
              <div className="flex items-center gap-2 mt-1">
                <StarDisplay rating={displayRating} />
                <span className="text-white/60 text-xs">{displayRating.toFixed(1)} {totalReviews > 0 ? `(${totalReviews} reviews)` : ''}</span>
              </div>
            )}
          </div>
        </div>

        {business.tagline && (
          <p className="text-white/60 text-sm italic mb-4">"{business.tagline}"</p>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 mb-6">
          {onCreatePitchDeck && currentUserId === business.ownerId && (
            <button
              onClick={() => onCreatePitchDeck(generateBusinessDeck(business))}
              className="flex items-center gap-2 bg-blue-500/15 text-blue-400 border border-blue-500/20 text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-blue-500/20 transition-colors"
            >
              <Presentation size={15} /> Create Pitch Deck
            </button>
          )}
          {business.isAcceptingOrders && (
            <button className="flex items-center gap-2 bg-[--small-orange] text-white text-sm font-bold px-4 py-2.5 rounded-xl hover:opacity-90 transition-opacity">
              <ShoppingBag size={15} /> Order Now
            </button>
          )}
          {business.rewardsEnabled && (
            <button
              onClick={() => showToast('Rewards program — join to earn points!')}
              className="flex items-center gap-2 bg-amber-500/15 text-amber-400 border border-amber-500/20 text-sm font-bold px-4 py-2.5 rounded-xl hover:opacity-90 transition-opacity"
            >
              <Gift size={15} /> Rewards
            </button>
          )}
          {business.phone && (
            <a href={`tel:${business.phone}`} className="flex items-center gap-2 bg-white/10 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-white/15 transition-colors">
              <Phone size={15} /> Call
            </a>
          )}
          {business.website && (
            <a href={business.website} target="_blank" rel="noreferrer" className="flex items-center gap-2 bg-white/10 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-white/15 transition-colors">
              <Globe size={15} /> Website <ExternalLink size={12} className="text-white/40" />
            </a>
          )}
        </div>

        {/* Feature pills */}
        {(business.radioServiceEnabled || business.digitalSignageEnabled || business.rewardsEnabled || business.isAcceptingOrders) && (
          <div className="flex flex-wrap gap-2 mb-5">
            {business.isAcceptingOrders   && <FeaturePill icon={<ShoppingBag size={12} />} label="Online Orders" />}
            {business.radioServiceEnabled  && <FeaturePill icon={<Radio size={12} />}       label="In-Store Radio" />}
            {business.digitalSignageEnabled && <FeaturePill icon={<Monitor size={12} />}    label="Digital Signage" />}
            {business.rewardsEnabled       && <FeaturePill icon={<Tag size={12} />}          label="Loyalty Rewards" />}
          </div>
        )}

        {/* In-store live — check in, see what's playing, tip/buy on the spot (not for the owner). */}
        {currentUserId !== business.ownerId && (
          <div className="mb-5">
            <StorefrontNowPlaying businessUid={business.ownerId} businessName={business.businessName} currentUserId={currentUserId} geoLat={business.geoLat} geoLng={business.geoLng} geoRadiusM={business.geoRadiusM} />
          </div>
        )}

        {/* Get updates from this business — customer opt-in (transactional + deals), not for the owner. */}
        {currentUserId && currentUserId !== business.ownerId && (
          <div className="mb-5">
            <BusinessMessageOptIn businessUid={business.ownerId} businessName={business.businessName} />
          </div>
        )}

        {/* Tabs */}
        <div className="overflow-x-auto -mx-4 px-4 mb-5 scrollbar-none">
          <div className="flex gap-1 bg-white/5 p-1 rounded-2xl w-max min-w-full">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`flex-1 whitespace-nowrap py-2 px-3 rounded-xl text-xs font-semibold transition-colors min-w-[60px] ${activeTab === t.id ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white/70'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          <motion.div key={activeTab} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="pb-16">

            {/* ── ABOUT ─────────────────────────────────────────────────────── */}
            {activeTab === 'ABOUT' && (
              <div className="space-y-5">
                {business.description && (
                  <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                    <p className="text-white/70 text-sm leading-relaxed">{business.description}</p>
                  </div>
                )}

                {/* Platform features showcase */}
                {(business.radioServiceEnabled || business.digitalSignageEnabled || business.rewardsEnabled || business.crmEnabled) && (
                  <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                    <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2">
                      <Zap size={14} className="text-[--small-orange]" /> Powered by Plajah
                    </h3>
                    <div className="space-y-3">
                      {business.radioServiceEnabled && (
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-[--small-orange]/10 flex items-center justify-center flex-shrink-0">
                            <Radio size={15} className="text-[--small-orange]" />
                          </div>
                          <div>
                            <div className="text-white text-xs font-bold">Custom In-Store Radio</div>
                            <div className="text-white/40 text-xs">Music curated for this business's atmosphere</div>
                          </div>
                        </div>
                      )}
                      {business.digitalSignageEnabled && (
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                            <Monitor size={15} className="text-blue-400" />
                          </div>
                          <div>
                            <div className="text-white text-xs font-bold">Digital Signage</div>
                            <div className="text-white/40 text-xs">Dynamic displays for promotions and menus</div>
                          </div>
                        </div>
                      )}
                      {business.rewardsEnabled && (
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                            <Gift size={15} className="text-amber-400" />
                          </div>
                          <div>
                            <div className="text-white text-xs font-bold">Loyalty Rewards</div>
                            <div className="text-white/40 text-xs">{business.rewardPointsPerDollar ? `${business.rewardPointsPerDollar} pts per $1 spent` : 'Earn points on every visit'}</div>
                          </div>
                        </div>
                      )}
                      {business.crmEnabled && (
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-green-500/10 flex items-center justify-center flex-shrink-0">
                            <MessageSquare size={15} className="text-green-400" />
                          </div>
                          <div>
                            <div className="text-white text-xs font-bold">Customer Messaging</div>
                            <div className="text-white/40 text-xs">Direct communication with this business</div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Upcoming event teaser */}
                {hasEvents && (() => {
                  const next = business.events!.find(e => new Date(e.date) >= new Date());
                  if (!next) return null;
                  return (
                    <div
                      className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-3 cursor-pointer hover:border-white/20 transition-colors"
                      onClick={() => setActiveTab('EVENTS')}
                    >
                      <div className="flex-shrink-0 bg-[--small-orange]/10 border border-[--small-orange]/20 rounded-xl px-3 py-2 text-center min-w-[52px]">
                        <div className="text-[--small-orange] font-black text-lg leading-none">{new Date(next.date).getDate()}</div>
                        <div className="text-[--small-orange]/70 text-[10px] font-bold uppercase">{new Date(next.date).toLocaleDateString('en', { month: 'short' })}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-white/40 text-[10px] font-bold uppercase tracking-wider mb-0.5">Next Event</div>
                        <div className="text-white font-bold text-sm truncate">{next.title}</div>
                        {next.time && <div className="text-white/40 text-xs">{next.time}</div>}
                      </div>
                      <ChevronRight size={16} className="text-white/30 flex-shrink-0" />
                    </div>
                  );
                })()}

                {/* Location */}
                {(business.address || business.city) && (
                  <div className="bg-white/5 rounded-2xl p-4 border border-white/10 space-y-3">
                    <h3 className="text-white font-bold text-sm">Location</h3>
                    <div className="flex items-start gap-3 text-sm text-white/60">
                      <MapPin size={16} className="text-[--small-orange] mt-0.5 flex-shrink-0" />
                      <div>
                        {business.address && <div>{business.address}</div>}
                        {(business.city || business.state) && (
                          <div>{[business.city, business.state, business.postalCode].filter(Boolean).join(', ')}</div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Contact */}
                {(business.phone || business.email || business.website) && (
                  <div className="bg-white/5 rounded-2xl p-4 border border-white/10 space-y-3">
                    <h3 className="text-white font-bold text-sm">Contact</h3>
                    <div className="space-y-2">
                      {business.phone && (
                        <a href={`tel:${business.phone}`} className="flex items-center gap-3 text-sm text-white/60 hover:text-white transition-colors">
                          <Phone size={14} className="text-[--small-orange]" /> {business.phone}
                        </a>
                      )}
                      {business.email && (
                        <a href={`mailto:${business.email}`} className="flex items-center gap-3 text-sm text-white/60 hover:text-white transition-colors">
                          <MessageSquare size={14} className="text-[--small-orange]" /> {business.email}
                        </a>
                      )}
                      {business.website && (
                        <a href={business.website} target="_blank" rel="noreferrer" className="flex items-center gap-3 text-sm text-white/60 hover:text-white transition-colors">
                          <Globe size={14} className="text-[--small-orange]" /> {business.website}
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {/* Social */}
                {business.socialLinks && Object.values(business.socialLinks).some(Boolean) && (
                  <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                    <h3 className="text-white font-bold text-sm mb-3">Follow</h3>
                    <div className="flex flex-wrap gap-2">
                      {business.socialLinks.instagram && (
                        <a href={`https://instagram.com/${business.socialLinks.instagram}`} target="_blank" rel="noreferrer"
                          className="flex items-center gap-1.5 bg-gradient-to-r from-purple-600 to-pink-500 text-white text-xs font-semibold px-3 py-1.5 rounded-full">
                          <Instagram size={12} /> Instagram
                        </a>
                      )}
                      {business.socialLinks.twitter && (
                        <a href={`https://twitter.com/${business.socialLinks.twitter}`} target="_blank" rel="noreferrer"
                          className="flex items-center gap-1.5 bg-black text-white text-xs font-semibold px-3 py-1.5 rounded-full border border-white/20">
                          <Twitter size={12} /> X / Twitter
                        </a>
                      )}
                      {business.socialLinks.facebook && (
                        <a href={`https://facebook.com/${business.socialLinks.facebook}`} target="_blank" rel="noreferrer"
                          className="flex items-center gap-1.5 bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 rounded-full">
                          <Facebook size={12} /> Facebook
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {/* Amenities */}
                {business.amenities && business.amenities.length > 0 && (
                  <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                    <h3 className="text-white font-bold text-sm mb-3">Amenities</h3>
                    <div className="flex flex-wrap gap-2">
                      {business.amenities.map(a => (
                        <span key={a} className="flex items-center gap-1.5 bg-white/10 text-white/70 text-xs px-3 py-1 rounded-full">
                          {AMENITY_ICONS[a.toLowerCase()] ?? null}
                          {a}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Plajah discount */}
                {(business.plajahUserDiscountPct ?? 0) > 0 && (
                  <div className="bg-[--small-orange]/10 border border-[--small-orange]/20 rounded-2xl p-4 flex items-center gap-3">
                    <Tag size={20} className="text-[--small-orange] flex-shrink-0" />
                    <div>
                      <div className="text-white font-bold text-sm">{business.plajahUserDiscountPct}% Plajah Member Discount</div>
                      <div className="text-white/50 text-xs mt-0.5">Show your Plajah profile to redeem</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── MENU ──────────────────────────────────────────────────────── */}
            {activeTab === 'MENU' && hasMenu && (
              <MenuSection items={business.menuItems!} />
            )}

            {/* ── GALLERY ───────────────────────────────────────────────────── */}
            {activeTab === 'GALLERY' && hasGallery && (
              <GallerySection images={business.galleryImages!} />
            )}

            {/* ── EVENTS ────────────────────────────────────────────────────── */}
            {activeTab === 'EVENTS' && hasEvents && (
              <EventsSection events={business.events!} />
            )}

            {/* ── HOURS ─────────────────────────────────────────────────────── */}
            {activeTab === 'HOURS' && business.hours && (
              <div className="bg-white/5 rounded-2xl p-5 border border-white/10">
                <div className="flex items-center gap-2 mb-4">
                  <Clock size={16} className="text-[--small-orange]" />
                  <h3 className="text-white font-bold text-sm">Business Hours</h3>
                </div>
                <div className="space-y-2">
                  {DAYS.map(day => {
                    const slot = business.hours![day];
                    const isToday = day === todayKey();
                    return (
                      <div key={day} className={`flex justify-between py-2 text-sm border-b border-white/5 last:border-0 ${isToday ? 'text-white font-semibold' : 'text-white/50'}`}>
                        <span className="flex items-center gap-2">
                          {isToday && <span className="w-1.5 h-1.5 rounded-full bg-[--small-orange]" />}
                          {DAY_FULL[day]}
                        </span>
                        <span className={slot?.closed ? 'text-red-400' : 'text-white/70'}>
                          {slot?.closed ? 'Closed' : slot ? `${slot.open} – ${slot.close}` : '—'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── REVIEWS ───────────────────────────────────────────────────── */}
            {activeTab === 'REVIEWS' && (
              <div className="space-y-4">
                {currentUserId && (
                  <ReviewForm businessId={business.id} currentUserName={currentUserName} onSubmit={handleReviewSubmit} />
                )}
                {reviews.length === 0 ? (
                  <div className="text-center py-12 text-white/30">
                    <Star size={32} className="mx-auto mb-3" />
                    <p className="text-sm">No reviews yet — be the first!</p>
                  </div>
                ) : (
                  reviews.map(r => (
                    <div key={r.id} className="bg-white/5 rounded-2xl p-4 border border-white/10">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold">
                          {r.authorName[0]}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-white text-sm font-semibold">{r.authorName}</span>
                            {r.isVerified && <CheckCircle2 size={12} className="text-[--small-orange]" />}
                          </div>
                          <StarDisplay rating={r.rating} size={12} />
                        </div>
                        <span className="ml-auto text-white/30 text-xs">{new Date(r.timestamp).toLocaleDateString()}</span>
                      </div>
                      <p className="text-white/70 text-sm">{r.text}</p>
                    </div>
                  ))
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
