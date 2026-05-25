import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, MapPin, Phone, Globe, Clock, Star, MessageSquare,
  Instagram, Twitter, Facebook, ShoppingBag, Radio, Monitor,
  CheckCircle2, ChevronDown, ChevronUp, ExternalLink, Tag,
  Wifi, ParkingCircle, Coffee, Utensils, Music2, Leaf, Shield,
  Send, AlertCircle, Heart,
} from 'lucide-react';
import type { BusinessPage } from '../types';

// ── HELPERS ──────────────────────────────────────────────────────────────────

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS: Record<string, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
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

// ── HOURS TABLE ───────────────────────────────────────────────────────────────

function HoursTable({ hours }: { hours: BusinessPage['hours'] }) {
  const [expanded, setExpanded] = useState(false);
  const today = todayKey();
  const todaySlot = hours?.[today];
  const open = isOpenNow(hours);

  return (
    <div>
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-2 text-sm font-semibold text-white"
      >
        <span className={open ? 'text-green-400' : 'text-red-400'}>{open ? 'Open now' : 'Closed'}</span>
        {todaySlot && !todaySlot.closed && (
          <span className="text-white/40">· {todaySlot.open} – {todaySlot.close}</span>
        )}
        {expanded ? <ChevronUp size={14} className="text-white/40 ml-1" /> : <ChevronDown size={14} className="text-white/40 ml-1" />}
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-1.5">
              {DAYS.map(day => {
                const slot = hours?.[day];
                const isToday = day === today;
                return (
                  <div key={day} className={`flex justify-between text-sm ${isToday ? 'text-white font-semibold' : 'text-white/50'}`}>
                    <span>{DAY_LABELS[day]}</span>
                    <span>{slot?.closed ? 'Closed' : slot ? `${slot.open} – ${slot.close}` : 'Hours TBD'}</span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────

interface BusinessPublicPageProps {
  business: BusinessPage;
  onBack?: () => void;
  currentUserId?: string;
  currentUserName?: string;
}

interface Review {
  id: string;
  authorName: string;
  rating: number;
  text: string;
  timestamp: number;
  isVerified?: boolean;
}

export default function BusinessPublicPage({ business, onBack, currentUserId, currentUserName }: BusinessPublicPageProps) {
  const [activeTab, setActiveTab] = useState<'ABOUT' | 'REVIEWS' | 'HOURS'>('ABOUT');
  const [reviews, setReviews] = useState<Review[]>([]);
  const [liked, setLiked] = useState(false);
  const [toast, setToast] = useState('');
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

  const tabs = [
    { id: 'ABOUT' as const, label: 'About' },
    { id: 'REVIEWS' as const, label: `Reviews${totalReviews ? ` (${totalReviews})` : ''}` },
    ...(business.hours ? [{ id: 'HOURS' as const, label: 'Hours' }] : []),
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

        {/* Status pill */}
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
          {business.isAcceptingOrders && (
            <button className="flex items-center gap-2 bg-[--small-orange] text-white text-sm font-bold px-4 py-2.5 rounded-xl hover:opacity-90 transition-opacity">
              <ShoppingBag size={15} /> Order Now
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

        {/* Tabs */}
        <div className="flex gap-1 bg-white/5 p-1 rounded-2xl mb-5">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors ${activeTab === t.id ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white/70'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          <motion.div key={activeTab} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="pb-16">
            {activeTab === 'ABOUT' && (
              <div className="space-y-5">
                {/* Description */}
                {business.description && (
                  <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                    <p className="text-white/70 text-sm leading-relaxed">{business.description}</p>
                  </div>
                )}

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
                          {DAYS.indexOf(day) === 0 ? 'Monday' : DAYS.indexOf(day) === 1 ? 'Tuesday' : DAYS.indexOf(day) === 2 ? 'Wednesday' : DAYS.indexOf(day) === 3 ? 'Thursday' : DAYS.indexOf(day) === 4 ? 'Friday' : DAYS.indexOf(day) === 5 ? 'Saturday' : 'Sunday'}
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
