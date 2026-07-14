import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  MapPin, Calendar, Clock, Globe, Video, Ticket, Users, Share2,
  ChevronDown, ChevronUp, Check, X, ArrowLeft, ExternalLink,
  Copy, Twitter, Facebook, Zap, Heart, Package, Printer,
  Music2, Play, AlertCircle, RefreshCw, QrCode, Info,
} from 'lucide-react';
import { fetchEvent, purchaseTickets } from '../services/backendService';
import { UserProfile, PlajahEvent, TicketTier } from '../types';

interface Props {
  eventId: string;
  currentUser: UserProfile | null;
  onBack: () => void;
  onSignIn?: () => void;
}

const fmt = (cents: number) =>
  cents === 0 ? 'Free' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

const fmtDate = (ts: number) => new Date(ts).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

const ITINERARY_EMOJI: Record<string, string> = { DOORS: '🚪', PERFORMANCE: '🎤', WORKSHOP: '🛠️', MEET_GREET: '🤝', BREAK: '⏸️', CEREMONY: '🏆', OTHER: '📌' };
const TYPE_LABELS: Record<string, string> = { IN_PERSON: 'In-Person Event', VIRTUAL: 'Virtual Event', HYBRID: 'Hybrid Event' };
const TYPE_ICONS: Record<string, React.ComponentType<any>> = { IN_PERSON: MapPin, VIRTUAL: Globe, HYBRID: Globe };

// ── Ticket Purchase Modal ─────────────────────────────────────────────────────

const PurchaseModal: React.FC<{ tier: TicketTier; event: PlajahEvent; currentUser: UserProfile | null; onClose: () => void; onSignIn?: () => void }> = ({ tier, event, currentUser, onClose, onSignIn }) => {
  const [qty, setQty]               = useState(1);
  const [holderName, setHolderName] = useState(currentUser?.displayName ?? '');
  const [holderEmail, setHolderEmail] = useState(currentUser?.email ?? '');
  const [physical, setPhysical]     = useState(false);
  const [packaging, setPackaging]   = useState(false);
  const [promoCode, setPromoCode]   = useState('');
  const [shippingAddr, setShippingAddr] = useState({ name: '', line1: '', city: '', state: '', zip: '', country: 'US' });
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');

  const subtotal = tier.priceCents * qty + (physical && packaging ? tier.customPackagingFeeCents : 0);
  const platformFee = Math.round(subtotal * 0.10);

  const handleBuy = async () => {
    if (!holderName.trim() || !holderEmail.trim()) { setError('Name and email are required'); return; }
    if (!currentUser) { onSignIn?.(); return; }
    setLoading(true); setError('');
    try {
      const { url } = await purchaseTickets({ eventId: event.id, tierId: tier.id, quantity: qty, holderName, holderEmail, physicalRequested: physical, customPackagingRequested: packaging, shippingAddress: physical ? shippingAddr : undefined, promoCode: promoCode || undefined });
      window.location.href = url;
    } catch (e: any) { setError(e.message); setLoading(false); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div initial={{ scale: 0.92, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 16 }} transition={{ type: 'spring', stiffness: 320, damping: 28 }} className="bg-[#0d0d0d] border border-white/10 rounded-3xl p-6 max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-[10px] text-white/30 uppercase tracking-widest mb-1">{event.title}</p>
            <h2 className="text-lg font-black text-white">{tier.name}</h2>
            <p className="text-2xl font-black mt-1" style={{ color: tier.color }}>{fmt(tier.priceCents)}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-white/30 hover:text-white"><X size={16} /></button>
        </div>

        {tier.benefits.length > 0 && (
          <div className="mb-4 p-3 rounded-xl" style={{ background: `${tier.color}10`, border: `1px solid ${tier.color}25` }}>
            {tier.benefits.map((b, i) => <div key={i} className="flex items-center gap-2 text-xs text-white/70 mb-1 last:mb-0"><Check size={11} style={{ color: tier.color }} />{b}</div>)}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="modal-label">Full Name</label>
            <input value={holderName} onChange={e => setHolderName(e.target.value)} placeholder="Your name as it appears on ID" className="modal-input" />
          </div>
          <div>
            <label className="modal-label">Email Address</label>
            <input type="email" value={holderEmail} onChange={e => setHolderEmail(e.target.value)} placeholder="Ticket sent here" className="modal-input" />
          </div>
          <div className="flex items-center gap-3">
            <label className="modal-label mb-0">Quantity</label>
            <div className="flex items-center gap-2 ml-auto">
              <button onClick={() => setQty(q => Math.max(tier.perOrderMin, q - 1))} className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-all font-black">−</button>
              <span className="w-8 text-center text-sm font-black text-white">{qty}</span>
              <button onClick={() => setQty(q => Math.min(tier.perOrderMax, q + 1))} className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-all font-black">+</button>
            </div>
          </div>
          <div>
            <label className="modal-label">Promo Code (optional)</label>
            <input value={promoCode} onChange={e => setPromoCode(e.target.value)} placeholder="Enter code" className="modal-input" />
          </div>

          {tier.physicalTicketAvailable && (
            <div className="p-3 bg-white/[0.03] border border-white/8 rounded-xl space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-2"><Package size={14} className="text-[#60a5fa]" /><span className="text-xs font-black text-white">Mail me a physical ticket</span></div>
                <input type="checkbox" checked={physical} onChange={e => setPhysical(e.target.checked)} className="accent-[#6B0099] w-4 h-4" />
              </label>
              {physical && tier.customPackagingAvailable && (
                <label className="flex items-center justify-between cursor-pointer pl-5">
                  <span className="text-xs text-white/50">Custom event packaging (+{fmt(tier.customPackagingFeeCents)})</span>
                  <input type="checkbox" checked={packaging} onChange={e => setPackaging(e.target.checked)} className="accent-[#6B0099] w-4 h-4" />
                </label>
              )}
              {physical && (
                <div className="pl-5 space-y-2 pt-1">
                  {(['line1','city','state','zip'] as const).map(field => (
                    <input key={field} value={shippingAddr[field]} onChange={e => setShippingAddr(a => ({ ...a, [field]: e.target.value }))} placeholder={{ line1: 'Street address', city: 'City', state: 'State', zip: 'ZIP code' }[field]} className="modal-input text-xs" />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Order summary */}
          <div className="p-3 bg-white/[0.03] border border-white/8 rounded-xl space-y-1.5 text-xs">
            <div className="flex justify-between text-white/50"><span>{tier.name} × {qty}</span><span>{fmt(tier.priceCents * qty)}</span></div>
            {physical && packaging && <div className="flex justify-between text-white/50"><span>Custom packaging</span><span>{fmt(tier.customPackagingFeeCents)}</span></div>}
            <div className="flex justify-between text-white/30 text-[10px]"><span>Platform fee (10%)</span><span>{fmt(platformFee)}</span></div>
            <div className="h-px bg-white/8" />
            <div className="flex justify-between font-black text-white"><span>Total</span><span>{fmt(subtotal)}</span></div>
          </div>

          {error && <div className="flex items-center gap-2 text-xs text-red-400"><AlertCircle size={12} />{error}</div>}

          <button onClick={handleBuy} disabled={loading} className="w-full py-4 font-black text-sm uppercase tracking-widest rounded-2xl transition-all disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: `linear-gradient(135deg, ${tier.color}cc, ${tier.color})`, color: 'white' }}>
            {loading ? <RefreshCw size={16} className="animate-spin" /> : <Ticket size={16} />}
            {loading ? 'Redirecting to Checkout…' : tier.priceCents === 0 ? 'Register Free' : `Buy Ticket — ${fmt(subtotal)}`}
          </button>
          <p className="text-[9px] text-white/20 text-center uppercase tracking-widest">Powered by Stripe · Secure checkout</p>
        </div>

        <style>{`.modal-label { display: block; font-size: 9px; font-weight: 900; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.3); margin-bottom: 6px; } .modal-input { width: 100%; padding: 10px 14px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; font-size: 13px; color: white; outline: none; } .modal-input:focus { border-color: rgba(255,255,255,0.25); } .modal-input::placeholder { color: rgba(255,255,255,0.2); }`}</style>
      </motion.div>
    </motion.div>
  );
};

// ── Main Landing Page ─────────────────────────────────────────────────────────

const EventLandingPage: React.FC<Props> = ({ eventId, currentUser, onBack, onSignIn }) => {
  const [event, setEvent]             = useState<PlajahEvent | null>(null);
  const [loading, setLoading]         = useState(true);
  const [selectedTier, setSelectedTier] = useState<TicketTier | null>(null);
  const [showAllItinerary, setShowAllItinerary] = useState(false);
  const [showAllFaq, setShowAllFaq]   = useState(false);
  const [copied, setCopied]           = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const videoRef                      = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    fetchEvent(eventId).then(e => { setEvent(e); setLoading(false); });
  }, [eventId]);

  const handleShare = (platform?: string) => {
    const url = `${window.location.origin}/event/${eventId}`;
    if (platform === 'twitter') { window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(`${event?.title} — get your tickets`)}&url=${encodeURIComponent(url)}`, '_blank'); return; }
    if (platform === 'facebook') { window.open(`https://facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank'); return; }
    if (navigator.share) { navigator.share({ title: event?.title, url }); return; }
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64"><RefreshCw size={20} className="text-white/20 animate-spin" /></div>
  );
  if (!event) return (
    <div className="flex flex-col items-center justify-center h-64 text-white/30">
      <Ticket size={32} className="mb-3 opacity-40" />
      <p className="text-sm">Event not found</p>
      <button onClick={onBack} className="mt-3 text-xs text-white/40 hover:text-white underline">Go back</button>
    </div>
  );

  const TypeIcon = TYPE_ICONS[event.type] ?? MapPin;
  const availableTiers = event.tiers.filter(t => t.isVisible);
  const soldOut = event.totalSold >= event.totalCapacity && event.totalCapacity > 0;
  const isPast = event.endDate < Date.now();
  const isYoutube = event.heroVideoUrl?.includes('youtube') || event.heroVideoUrl?.includes('youtu.be');

  return (
    <div className="text-white min-h-screen">

      {/* Hero */}
      <div className="relative min-h-[60vh] flex flex-col overflow-hidden">
        {/* Background */}
        {event.coverImage ? (
          <div className="absolute inset-0">
            <img src={event.coverImage} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black" />
          </div>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#6B0099]/60 via-[#D40055]/40 to-[#0d0d0d]" />
        )}

        {/* Back button */}
        <div className="relative z-10 p-4">
          <button onClick={onBack} className="flex items-center gap-2 px-3 py-2 bg-black/40 backdrop-blur-md rounded-xl text-sm text-white/70 hover:text-white transition-colors">
            <ArrowLeft size={15} /> Back
          </button>
        </div>

        {/* Promo video overlay */}
        {event.heroVideoUrl && !videoPlaying && (
          <button onClick={() => setVideoPlaying(true)} className="absolute inset-0 flex items-center justify-center z-10 group">
            <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center group-hover:scale-110 transition-all">
              <Play size={24} className="text-white ml-1" />
            </div>
          </button>
        )}
        {videoPlaying && event.heroVideoUrl && (
          <div className="absolute inset-0 z-20 bg-black">
            {isYoutube ? (
              <iframe src={`${event.heroVideoUrl.replace('watch?v=', 'embed/').replace('youtu.be/', 'www.youtube.com/embed/')}?autoplay=1`} className="w-full h-full border-none" allow="autoplay; fullscreen" />
            ) : (
              <video ref={videoRef} src={event.heroVideoUrl} autoPlay controls className="w-full h-full object-cover" />
            )}
            <button onClick={() => setVideoPlaying(false)} className="absolute top-4 right-4 p-2 bg-black/60 rounded-full text-white"><X size={16} /></button>
          </div>
        )}

        {/* Hero content */}
        <div className="relative z-10 mt-auto p-6 pb-10 max-w-4xl mx-auto w-full">
          <div className="flex items-center gap-2 mb-3">
            <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-white/15 backdrop-blur-md border border-white/20 flex items-center gap-1.5">
              <TypeIcon size={10} /> {TYPE_LABELS[event.type] ?? event.type}
            </span>
            {isPast && <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-white/10 text-white/50">Past Event</span>}
            {soldOut && !isPast && <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-red-500/20 text-red-400 border border-red-500/30">Sold Out</span>}
          </div>
          <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter leading-[0.9] mb-3">{event.title}</h1>
          {event.subtitle && <p className="text-white/60 text-lg font-light mb-4">{event.subtitle}</p>}
          <div className="flex flex-wrap items-center gap-4 text-sm text-white/70">
            <div className="flex items-center gap-1.5"><Calendar size={14} />{fmtDate(event.startDate)}</div>
            <div className="flex items-center gap-1.5"><Clock size={14} />{fmtTime(event.startDate)}</div>
            {event.venueName && <div className="flex items-center gap-1.5"><MapPin size={14} />{event.venueName}{event.city ? `, ${event.city}` : ''}</div>}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-4xl mx-auto px-4 md:px-6 pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 -mt-4">

          {/* Left: info column */}
          <div className="lg:col-span-2 space-y-8">

            {/* Creator */}
            <div className="flex items-center gap-3 p-4 bg-white/[0.04] border border-white/8 rounded-2xl">
              {event.creatorPhotoURL
                ? <img src={event.creatorPhotoURL} className="w-10 h-10 rounded-full object-cover" alt="" />
                : <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/40 font-black">{event.creatorName?.[0]}</div>}
              <div>
                <p className="text-[9px] text-white/30 uppercase tracking-widest">Hosted by</p>
                <p className="text-sm font-black text-white">{event.creatorName}</p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <button onClick={() => handleShare('twitter')} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-all"><Twitter size={14} className="text-white/50" /></button>
                <button onClick={() => handleShare('facebook')} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-all"><Facebook size={14} className="text-white/50" /></button>
                <button onClick={() => handleShare()} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 transition-all text-[10px] font-black uppercase text-white/50">
                  {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />} {copied ? 'Copied!' : 'Copy Link'}
                </button>
              </div>
            </div>

            {/* Description */}
            <div>
              <h2 className="text-sm font-black uppercase tracking-widest text-white/30 mb-3">About This Event</h2>
              <p className="text-white/70 leading-relaxed whitespace-pre-wrap">{event.description}</p>
            </div>

            {/* Itinerary */}
            {event.itinerary.length > 0 && (
              <div>
                <h2 className="text-sm font-black uppercase tracking-widest text-white/30 mb-4">Schedule</h2>
                <div className="relative pl-4 border-l-2 border-white/10 space-y-4">
                  {(showAllItinerary ? event.itinerary : event.itinerary.slice(0, 5)).map((item, i) => (
                    <div key={item.id} className="relative">
                      <div className="absolute -left-5 w-3 h-3 rounded-full bg-white/20 border-2 border-[#0d0d0d] top-1" />
                      <div className="flex items-start gap-3">
                        <span className="text-lg shrink-0">{ITINERARY_EMOJI[item.type] ?? '📌'}</span>
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            {item.time && <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">{item.time}</span>}
                            <span className="text-sm font-black text-white">{item.title}</span>
                          </div>
                          {item.performer && <p className="text-[11px] text-white/40">{item.performer}</p>}
                          {item.description && <p className="text-xs text-white/30 mt-0.5">{item.description}</p>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {event.itinerary.length > 5 && (
                  <button onClick={() => setShowAllItinerary(v => !v)} className="mt-3 text-xs text-white/40 hover:text-white flex items-center gap-1">
                    {showAllItinerary ? <><ChevronUp size={12} /> Show less</> : <><ChevronDown size={12} /> Show all {event.itinerary.length} items</>}
                  </button>
                )}
              </div>
            )}

            {/* Location */}
            {(event.venueName || event.venueAddress) && (
              <div>
                <h2 className="text-sm font-black uppercase tracking-widest text-white/30 mb-3">Location</h2>
                <div className="p-4 bg-white/[0.04] border border-white/8 rounded-2xl flex items-start gap-3">
                  <MapPin size={16} className="text-white/40 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-black text-white">{event.venueName}</p>
                    {event.venueAddress && <p className="text-xs text-white/40 mt-0.5">{event.venueAddress}</p>}
                    {(event.city || event.state) && <p className="text-xs text-white/40">{[event.city, event.state, event.country].filter(Boolean).join(', ')}</p>}
                    {event.venueName && <a href={`https://maps.google.com/?q=${encodeURIComponent([event.venueName, event.venueAddress, event.city].filter(Boolean).join(', '))}`} target="_blank" rel="noopener noreferrer" className="mt-2 flex items-center gap-1 text-[10px] text-white/40 hover:text-white transition-colors">
                      <ExternalLink size={10} /> Open in Google Maps
                    </a>}
                  </div>
                </div>
              </div>
            )}

            {/* FAQ */}
            {event.faqItems && event.faqItems.length > 0 && (
              <div>
                <h2 className="text-sm font-black uppercase tracking-widest text-white/30 mb-4">FAQ</h2>
                <div className="space-y-2">
                  {(showAllFaq ? event.faqItems : event.faqItems.slice(0, 4)).map((faq, i) => (
                    <details key={i} className="p-4 bg-white/[0.03] border border-white/8 rounded-xl group">
                      <summary className="text-sm font-black text-white cursor-pointer list-none flex items-center justify-between">
                        {faq.question} <ChevronDown size={14} className="text-white/30 group-open:rotate-180 transition-transform" />
                      </summary>
                      <p className="text-xs text-white/50 mt-2 leading-relaxed">{faq.answer}</p>
                    </details>
                  ))}
                  {event.faqItems.length > 4 && <button onClick={() => setShowAllFaq(v => !v)} className="text-xs text-white/40 hover:text-white">{showAllFaq ? 'Show less' : `Show all ${event.faqItems.length} questions`}</button>}
                </div>
              </div>
            )}

            {/* Event details chips */}
            <div className="flex flex-wrap gap-2">
              {event.ageRestriction && <span className="px-3 py-1.5 bg-white/[0.04] border border-white/8 rounded-full text-[10px] text-white/50 flex items-center gap-1.5"><Users size={10} />{event.ageRestriction}</span>}
              {event.dresscode && <span className="px-3 py-1.5 bg-white/[0.04] border border-white/8 rounded-full text-[10px] text-white/50">👔 {event.dresscode}</span>}
              {event.accessibilityInfo && <span className="px-3 py-1.5 bg-white/[0.04] border border-white/8 rounded-full text-[10px] text-white/50">♿ Accessible</span>}
              {event.refundPolicy !== 'NO_REFUND' && <span className="px-3 py-1.5 bg-white/[0.04] border border-white/8 rounded-full text-[10px] text-white/50">↩ Refunds available</span>}
            </div>
          </div>

          {/* Right: ticket column (sticky on desktop) */}
          <div className="lg:sticky lg:top-6 lg:self-start space-y-3">
            <div className="p-5 bg-[#0d0d0d] border border-white/12 rounded-3xl shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Tickets</p>
                {event.totalCapacity > 0 && (
                  <div className="text-right">
                    <p className="text-[10px] text-white/30">{event.totalSold}/{event.totalCapacity} sold</p>
                    <div className="h-1 w-20 bg-white/5 rounded-full overflow-hidden mt-1">
                      <div className="h-full rounded-full bg-gradient-to-r from-[#6B0099] to-[#D40055]" style={{ width: `${Math.min(100, (event.totalSold / event.totalCapacity) * 100)}%` }} />
                    </div>
                  </div>
                )}
              </div>

              {isPast ? (
                <div className="text-center py-4 text-white/30">
                  <Ticket size={24} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">This event has ended</p>
                </div>
              ) : soldOut ? (
                <div className="text-center py-4 text-white/30">
                  <p className="text-sm font-black">Sold Out</p>
                  <p className="text-xs mt-1">Check back for added capacity</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {availableTiers.map(tier => {
                    const available = tier.quantity - tier.sold;
                    const isAlmostGone = available <= 10 && available > 0;
                    return (
                      <button key={tier.id} onClick={() => setSelectedTier(tier)} disabled={available === 0} className="w-full p-4 rounded-2xl text-left border transition-all hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed" style={{ background: `${tier.color}10`, borderColor: `${tier.color}30` }}>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-black text-white">{tier.name}</p>
                            {tier.description && <p className="text-[10px] text-white/40 mt-0.5">{tier.description}</p>}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-lg font-black" style={{ color: tier.color }}>{fmt(tier.priceCents)}</p>
                            {isAlmostGone && <p className="text-[9px] text-orange-400 font-black uppercase">Only {available} left!</p>}
                            {available === 0 && <p className="text-[9px] text-red-400 font-black uppercase">Sold out</p>}
                          </div>
                        </div>
                        {tier.benefits.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{tier.benefits.slice(0,3).map((b,i) => <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: `${tier.color}20`, color: tier.color }}>✓ {b}</span>)}</div>}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Platform synergies */}
              <div className="mt-4 space-y-2">
                {event.sanctuaryMembersOnly && <div className="flex items-center gap-2 text-[10px] text-[#f472b6]/70 p-2 bg-[#f472b6]/5 rounded-xl border border-[#f472b6]/15"><Heart size={11} />Members-only event — join Sanctuary to purchase</div>}
                {event.plajahPlusDiscount && event.plajahPlusDiscount > 0 && <div className="flex items-center gap-2 text-[10px] text-[#fbbf24]/70 p-2 bg-[#fbbf24]/5 rounded-xl border border-[#fbbf24]/15"><Zap size={11} />Plajah+ subscribers get {event.plajahPlusDiscount}% off</div>}
                {event.kioskEnabled && <div className="flex items-center gap-2 text-[10px] text-[#60a5fa]/70 p-2 bg-[#60a5fa]/5 rounded-xl border border-[#60a5fa]/15"><Package size={11} />Merch kiosk available at this event</div>}
                {event.printingEnabled && <div className="flex items-center gap-2 text-[10px] text-white/40 p-2 bg-white/[0.03] rounded-xl border border-white/8"><Printer size={11} />Physical ticket printing available</div>}
              </div>

              <p className="text-[8px] text-white/20 text-center mt-4 uppercase tracking-widest">Secure checkout by Stripe · 10% platform fee</p>
            </div>

            {/* Date / time summary card */}
            <div className="p-4 bg-white/[0.03] border border-white/8 rounded-2xl space-y-2">
              <div className="flex items-center gap-2 text-xs text-white/60"><Calendar size={13} />{fmtDate(event.startDate)}</div>
              <div className="flex items-center gap-2 text-xs text-white/60"><Clock size={13} />{fmtTime(event.startDate)} – {fmtTime(event.endDate)}</div>
              {event.doorsOpenDate && <div className="flex items-center gap-2 text-xs text-white/40"><Info size={13} />Doors open at {fmtTime(event.doorsOpenDate)}</div>}
              {event.type !== 'IN_PERSON' && <div className="flex items-center gap-2 text-xs text-white/60"><Globe size={13} />Stream link sent after purchase</div>}
            </div>
          </div>
        </div>
      </div>

      {/* Purchase modal */}
      <AnimatePresence>
        {selectedTier && (
          <PurchaseModal tier={selectedTier} event={event} currentUser={currentUser} onClose={() => setSelectedTier(null)} onSignIn={onSignIn} />
        )}
      </AnimatePresence>
    </div>
  );
};

export default EventLandingPage;
