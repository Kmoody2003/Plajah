import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Timer, Gavel, Eye, Heart, Tag, Package, Plus,
  ChevronRight, ChevronLeft, CheckCircle2, AlertCircle, X,
  TrendingUp, Star, Zap, ImagePlus, Trash2, Upload, Clock,
  ShoppingBag, Award, Shield, Search, Grid3X3, List,
} from 'lucide-react';
import {
  listenToGarageSaleItems,
  placeBid,
  buyItNow,
  createGarageSaleItem,
  fetchBidHistory,
  watchGarageSaleItem,
  unwatchGarageSaleItem,
  fetchMyGarageSaleItems,
} from '../services/storeService';
import type { GarageSaleItem, GarageSaleBid, GarageSaleCondition, StoreProductCategory } from '../types';

// ── CONSTANTS ────────────────────────────────────────────────────────────────

const CONDITIONS: { value: GarageSaleCondition; label: string; color: string }[] = [
  { value: 'NEW',        label: 'New',        color: '#22c55e' },
  { value: 'LIKE_NEW',   label: 'Like New',   color: '#84cc16' },
  { value: 'GOOD',       label: 'Good',       color: '#eab308' },
  { value: 'FAIR',       label: 'Fair',       color: '#f97316' },
  { value: 'PARTS_ONLY', label: 'Parts Only', color: '#ef4444' },
];

const CATEGORIES: { value: StoreProductCategory; emoji: string; label: string }[] = [
  { value: 'APPAREL',      emoji: '👕', label: 'Apparel'      },
  { value: 'MUSIC',        emoji: '🎵', label: 'Music'        },
  { value: 'ELECTRONICS',  emoji: '📱', label: 'Electronics'  },
  { value: 'COLLECTIBLES', emoji: '🏆', label: 'Collectibles' },
  { value: 'BOOKS',        emoji: '📚', label: 'Books'        },
  { value: 'ART',          emoji: '🎨', label: 'Art'          },
  { value: 'HOME',         emoji: '🏠', label: 'Home'         },
  { value: 'ACCESSORIES',  emoji: '💎', label: 'Accessories'  },
  { value: 'OTHER',        emoji: '📦', label: 'Other'        },
];

function getCondition(val: GarageSaleCondition) {
  return CONDITIONS.find(c => c.value === val) ?? CONDITIONS[2];
}

// ── COUNTDOWN ────────────────────────────────────────────────────────────────

function useCountdown(endTime: number) {
  const [remaining, setRemaining] = useState(endTime - Date.now());
  useEffect(() => {
    const interval = setInterval(() => setRemaining(endTime - Date.now()), 1000);
    return () => clearInterval(interval);
  }, [endTime]);
  const secs = Math.max(0, Math.floor(remaining / 1000));
  const mins = Math.floor(secs / 60);
  const hrs  = Math.floor(mins / 60);
  const days = Math.floor(hrs  / 24);
  return {
    expired: remaining <= 0,
    days,
    hrs:  hrs  % 24,
    mins: mins % 60,
    secs: secs % 60,
    urgent: remaining < 3600_000,
  };
}

function CountdownDisplay({ endTime, compact }: { endTime: number; compact?: boolean }) {
  const { expired, days, hrs, mins, secs, urgent } = useCountdown(endTime);
  if (expired) return (
    <span className="text-red-400 font-semibold text-xs">Ended</span>
  );
  const color = urgent ? 'text-red-400' : 'text-amber-400';
  if (compact) return (
    <span className={`font-mono text-xs font-semibold ${color}`}>
      {days > 0 ? `${days}d ${hrs}h` : hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m ${secs}s`}
    </span>
  );
  return (
    <div className={`flex gap-2 items-center ${color}`}>
      <Timer size={13} />
      <span className="font-mono text-sm font-bold">
        {days > 0
          ? `${days}d ${hrs}h ${mins}m`
          : `${String(hrs).padStart(2,'0')}:${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`}
      </span>
    </div>
  );
}

// ── AUCTION CARD ─────────────────────────────────────────────────────────────

interface AuctionCardProps {
  item: GarageSaleItem;
  currentUserId?: string;
  onSelect: (item: GarageSaleItem) => void;
  onToggleWatch: (item: GarageSaleItem) => void;
  layout: 'grid' | 'list';
}

function AuctionCard({ item, currentUserId, onSelect, onToggleWatch, layout }: AuctionCardProps) {
  const isWatching = currentUserId ? item.watchers.includes(currentUserId) : false;
  const cond = getCondition(item.condition);
  const hasReserve = !!item.reservePrice;
  const reserveMet = !hasReserve || (item.currentBid ?? 0) >= (item.reservePrice ?? 0);
  const isEnded = item.status !== 'ACTIVE' || item.endTime <= Date.now();
  const isSold = item.status === 'SOLD';
  const leading = currentUserId && item.currentBidderId === currentUserId;

  if (layout === 'list') {
    return (
      <motion.div
        layout
        className="bg-white/5 rounded-2xl overflow-hidden border border-white/10 hover:border-[--small-orange]/40 transition-colors cursor-pointer flex gap-4"
        onClick={() => onSelect(item)}
        whileHover={{ y: -1 }}
      >
        <div className="relative w-36 flex-shrink-0">
          {item.images[0] ? (
            <img src={item.images[0]} alt={item.title} className="w-full h-full object-cover" style={{ minHeight: 100 }} />
          ) : (
            <div className="w-full h-full min-h-[100px] bg-white/10 flex items-center justify-center">
              <Package size={28} className="text-white/30" />
            </div>
          )}
          {(isEnded || isSold) && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <span className="text-white font-bold text-sm">{isSold ? 'SOLD' : 'ENDED'}</span>
            </div>
          )}
          <span className="absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: cond.color + '30', color: cond.color }}>{cond.label}</span>
        </div>
        <div className="flex-1 py-3 pr-4 flex flex-col justify-between">
          <div>
            <h3 className="text-white font-semibold text-sm line-clamp-1">{item.title}</h3>
            <p className="text-white/50 text-xs line-clamp-1 mt-0.5">{item.description}</p>
          </div>
          <div className="flex items-center gap-4 mt-2">
            <div>
              <div className="text-white/50 text-[10px]">{item.bidCount > 0 ? 'Current bid' : 'Starting'}</div>
              <div className="text-[--small-orange] font-bold">${(item.currentBid ?? item.startingBid).toFixed(2)}</div>
            </div>
            {item.buyItNowPrice && (
              <div>
                <div className="text-white/50 text-[10px]">Buy Now</div>
                <div className="text-green-400 font-bold">${item.buyItNowPrice.toFixed(2)}</div>
              </div>
            )}
            <div className="ml-auto flex items-center gap-3">
              <CountdownDisplay endTime={item.endTime} compact />
              <span className="text-white/40 text-xs">{item.bidCount} bids</span>
              <button
                className={`p-1.5 rounded-full transition-colors ${isWatching ? 'text-red-400' : 'text-white/40 hover:text-white/70'}`}
                onClick={e => { e.stopPropagation(); onToggleWatch(item); }}
              >
                <Heart size={14} fill={isWatching ? 'currentColor' : 'none'} />
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      layout
      className="bg-white/5 rounded-2xl overflow-hidden border border-white/10 hover:border-[--small-orange]/40 transition-colors cursor-pointer group"
      onClick={() => onSelect(item)}
      whileHover={{ y: -2 }}
    >
      <div className="relative aspect-[4/3] bg-white/10">
        {item.images[0] ? (
          <img src={item.images[0]} alt={item.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package size={40} className="text-white/30" />
          </div>
        )}

        {(isEnded || isSold) && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <span className="text-white font-bold text-lg">{isSold ? 'SOLD' : 'ENDED'}</span>
          </div>
        )}

        <div className="absolute top-2 left-2 flex gap-1.5">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: cond.color + '30', color: cond.color }}>{cond.label}</span>
          {leading && !isEnded && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">Leading</span>
          )}
        </div>

        <button
          className={`absolute top-2 right-2 p-1.5 rounded-full bg-black/40 backdrop-blur-sm transition-colors ${isWatching ? 'text-red-400' : 'text-white/60 opacity-0 group-hover:opacity-100'}`}
          onClick={e => { e.stopPropagation(); onToggleWatch(item); }}
        >
          <Heart size={14} fill={isWatching ? 'currentColor' : 'none'} />
        </button>

        {item.buyItNowPrice && !isEnded && (
          <div className="absolute bottom-2 right-2 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
            <Zap size={9} /> Buy Now
          </div>
        )}

        <div className="absolute bottom-2 left-2">
          <CountdownDisplay endTime={item.endTime} compact />
        </div>
      </div>

      <div className="p-3">
        <h3 className="text-white font-semibold text-sm line-clamp-1">{item.title}</h3>

        <div className="flex items-end justify-between mt-2">
          <div>
            <div className="text-white/40 text-[10px]">{item.bidCount > 0 ? 'Current bid' : 'Starting bid'}</div>
            <div className="text-[--small-orange] font-bold text-base">
              ${(item.currentBid ?? item.startingBid).toFixed(2)}
            </div>
            {hasReserve && !reserveMet && (
              <div className="text-amber-400 text-[10px]">Reserve not met</div>
            )}
          </div>
          <div className="text-right">
            <div className="text-white/40 text-[10px]">{item.bidCount} bids</div>
            <div className="flex items-center gap-1 text-white/40 text-[10px]">
              <Eye size={10} /> {item.watchers.length}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── BID HISTORY ───────────────────────────────────────────────────────────────

function BidHistory({ itemId }: { itemId: string }) {
  const [bids, setBids] = useState<GarageSaleBid[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBidHistory(itemId).then(b => { setBids(b); setLoading(false); });
  }, [itemId]);

  if (loading) return <div className="py-4 text-center text-white/40 text-sm">Loading bids...</div>;
  if (bids.length === 0) return <div className="py-4 text-center text-white/40 text-sm">No bids yet — be the first!</div>;

  return (
    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
      {bids.map((bid, i) => (
        <div key={bid.id} className={`flex items-center gap-3 py-2 px-3 rounded-xl ${i === 0 ? 'bg-[--small-orange]/10 border border-[--small-orange]/20' : 'bg-white/5'}`}>
          {bid.bidderPhoto ? (
            <img src={bid.bidderPhoto} alt="" className="w-7 h-7 rounded-full object-cover" />
          ) : (
            <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold text-white/60">
              {bid.bidderName[0]}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-white text-xs font-semibold truncate">{i === 0 ? `${bid.bidderName} (Leading)` : bid.bidderName}</div>
            <div className="text-white/40 text-[10px]">{new Date(bid.timestamp).toLocaleString()}</div>
          </div>
          <div className={`font-bold text-sm ${i === 0 ? 'text-[--small-orange]' : 'text-white/60'}`}>
            ${bid.amount.toFixed(2)}
          </div>
          {i === 0 && <Award size={14} className="text-[--small-orange]" />}
        </div>
      ))}
    </div>
  );
}

// ── ITEM DETAIL MODAL ────────────────────────────────────────────────────────

interface ItemDetailProps {
  item: GarageSaleItem;
  currentUserId?: string;
  currentUserName?: string;
  onClose: () => void;
  onBidSuccess: () => void;
}

function ItemDetailModal({ item, currentUserId, currentUserName, onClose, onBidSuccess }: ItemDetailProps) {
  const [activeImg, setActiveImg] = useState(0);
  const [bidAmount, setBidAmount] = useState('');
  const [bidError, setBidError] = useState('');
  const [bidding, setBidding] = useState(false);
  const [buyingNow, setBuyingNow] = useState(false);
  const [tab, setTab] = useState<'DETAILS' | 'BIDS' | 'SHIPPING'>('DETAILS');
  const [toast, setToast] = useState('');
  const minBid = (item.currentBid ?? item.startingBid) + (item.bidCount > 0 ? 0.01 : 0);
  const { expired, urgent } = useCountdown(item.endTime);
  const isEnded = expired || item.status !== 'ACTIVE';
  const cond = getCondition(item.condition);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleBid = async () => {
    const amount = parseFloat(bidAmount);
    if (isNaN(amount)) return setBidError('Enter a valid amount');
    if (amount < minBid) return setBidError(`Minimum bid is $${minBid.toFixed(2)}`);
    if (!currentUserId || !currentUserName) return setBidError('Please sign in to bid');
    setBidError(''); setBidding(true);
    const result = await placeBid(item.id, amount);
    if (result.success) {
      setBidAmount('');
      showToast(result.message);
      onBidSuccess();
    } else {
      setBidError(result.message);
    }
    setBidding(false);
  };

  const handleBuyNow = async () => {
    if (!currentUserId || !currentUserName) return;
    setBuyingNow(true);
    const result = await buyItNow(item.id);
    if (result.success) {
      showToast(result.message);
      onBidSuccess();
      setTimeout(onClose, 2000);
    } else {
      showToast(result.message);
    }
    setBuyingNow(false);
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        className="relative w-full max-w-2xl bg-[#121212] rounded-t-3xl sm:rounded-3xl overflow-hidden border border-white/10 max-h-[95vh] flex flex-col"
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
      >
        {/* Toast */}
        <AnimatePresence>
          {toast && (
            <motion.div
              className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-green-500 text-white text-sm font-semibold px-4 py-2 rounded-full flex items-center gap-2 shadow-lg"
              initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            >
              <CheckCircle2 size={14} /> {toast}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: cond.color + '20', color: cond.color }}>{cond.label}</span>
            {urgent && !isEnded && <span className="text-xs font-bold text-red-400 animate-pulse">Ending soon!</span>}
            {isEnded && <span className="text-xs font-bold text-white/40">Auction ended</span>}
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {/* Image gallery */}
          {item.images.length > 0 ? (
            <div className="relative">
              <div className="aspect-video bg-black overflow-hidden">
                <img src={item.images[activeImg]} alt={item.title} className="w-full h-full object-contain" />
              </div>
              {item.images.length > 1 && (
                <div className="flex gap-2 p-3 overflow-x-auto">
                  {item.images.map((img, i) => (
                    <button key={i} onClick={() => setActiveImg(i)}
                      className={`flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-colors ${i === activeImg ? 'border-[--small-orange]' : 'border-transparent'}`}>
                      <img src={img} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="aspect-video bg-white/5 flex items-center justify-center">
              <Package size={60} className="text-white/20" />
            </div>
          )}

          <div className="p-4 space-y-4">
            {/* Title + seller */}
            <div>
              <h2 className="text-white font-bold text-xl">{item.title}</h2>
              <div className="flex items-center gap-2 mt-1 text-white/50 text-sm">
                <span>by {item.sellerName}</span>
                <span>·</span>
                <span>{CATEGORIES.find(c => c.value === item.category)?.emoji} {CATEGORIES.find(c => c.value === item.category)?.label}</span>
              </div>
            </div>

            {/* Bid info + countdown */}
            <div className="bg-white/5 rounded-2xl p-4 flex items-center gap-4 flex-wrap">
              <div>
                <div className="text-white/50 text-xs">{item.bidCount > 0 ? 'Current bid' : 'Starting bid'}</div>
                <div className="text-[--small-orange] font-bold text-2xl">${(item.currentBid ?? item.startingBid).toFixed(2)}</div>
                <div className="text-white/40 text-xs">{item.bidCount} bid{item.bidCount !== 1 ? 's' : ''}</div>
              </div>
              <div className="h-10 w-px bg-white/10" />
              <div>
                <div className="text-white/50 text-xs">Time left</div>
                <CountdownDisplay endTime={item.endTime} />
              </div>
              {item.buyItNowPrice && (
                <>
                  <div className="h-10 w-px bg-white/10" />
                  <div>
                    <div className="text-white/50 text-xs">Buy It Now</div>
                    <div className="text-green-400 font-bold text-xl">${item.buyItNowPrice.toFixed(2)}</div>
                  </div>
                </>
              )}
            </div>

            {/* Bid / buy actions */}
            {!isEnded && currentUserId !== item.sellerId && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 font-semibold">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min={minBid}
                      value={bidAmount}
                      onChange={e => { setBidAmount(e.target.value); setBidError(''); }}
                      placeholder={`${minBid.toFixed(2)} or more`}
                      className="w-full bg-white/10 border border-white/20 rounded-xl pl-7 pr-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[--small-orange]/60"
                    />
                  </div>
                  <motion.button
                    onClick={handleBid}
                    disabled={bidding}
                    className="px-5 bg-[--small-orange] text-white font-bold rounded-xl flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                    whileTap={{ scale: 0.97 }}
                  >
                    <Gavel size={16} /> {bidding ? 'Placing…' : 'Bid'}
                  </motion.button>
                </div>
                {bidError && (
                  <div className="flex items-center gap-2 text-red-400 text-sm">
                    <AlertCircle size={14} /> {bidError}
                  </div>
                )}
                {item.buyItNowPrice && (
                  <motion.button
                    onClick={handleBuyNow}
                    disabled={buyingNow}
                    className="w-full bg-green-500 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-green-400 transition-colors disabled:opacity-50"
                    whileTap={{ scale: 0.98 }}
                  >
                    <Zap size={16} /> {buyingNow ? 'Processing…' : `Buy It Now — $${item.buyItNowPrice.toFixed(2)}`}
                  </motion.button>
                )}
              </div>
            )}

            {isEnded && item.winnerId && (
              <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-4 text-center">
                <Award size={24} className="text-green-400 mx-auto mb-2" />
                <div className="text-green-400 font-bold">Sold to {item.winnerName}</div>
                <div className="text-white/50 text-sm mt-1">Final price: ${item.finalPrice?.toFixed(2)}</div>
              </div>
            )}

            {/* Tabs */}
            <div className="flex gap-1 bg-white/5 p-1 rounded-xl">
              {(['DETAILS', 'BIDS', 'SHIPPING'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${tab === t ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white/70'}`}>
                  {t === 'BIDS' ? `Bids (${item.bidCount})` : t.charAt(0) + t.slice(1).toLowerCase()}
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              <motion.div key={tab} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                {tab === 'DETAILS' && (
                  <div className="space-y-3">
                    <p className="text-white/70 text-sm leading-relaxed">{item.description}</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {item.shippingCost !== undefined && (
                        <div className="bg-white/5 rounded-xl p-3">
                          <div className="text-white/40 text-xs">Shipping</div>
                          <div className="text-white font-semibold">{item.shippingCost === 0 ? 'Free' : `$${item.shippingCost.toFixed(2)}`}</div>
                        </div>
                      )}
                      {item.isLocalPickup && (
                        <div className="bg-white/5 rounded-xl p-3">
                          <div className="text-white/40 text-xs">Pickup</div>
                          <div className="text-white font-semibold">Available</div>
                        </div>
                      )}
                    </div>
                    {item.tags && item.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {item.tags.map(tag => (
                          <span key={tag} className="bg-white/10 text-white/60 text-xs px-2 py-0.5 rounded-full">#{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {tab === 'BIDS' && <BidHistory itemId={item.id} />}
                {tab === 'SHIPPING' && (
                  <div className="space-y-3 text-sm text-white/70">
                    <div className="flex items-start gap-3 bg-white/5 rounded-xl p-3">
                      <Shield size={16} className="text-[--small-orange] mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="text-white font-semibold text-sm">Buyer protection</div>
                        <div className="text-xs mt-0.5">If item doesn't arrive or isn't as described, you're covered.</div>
                      </div>
                    </div>
                    <p>{item.shippingCost === 0 ? 'Free shipping on this item.' : `Shipping: $${item.shippingCost?.toFixed(2)}`}</p>
                    {item.isLocalPickup && <p>Local pickup available — contact seller to arrange.</p>}
                    <p className="text-white/40 text-xs">Seller is responsible for shipping within 3 business days of payment.</p>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── CREATE LISTING MODAL ──────────────────────────────────────────────────────

interface CreateListingProps {
  currentUserId: string;
  currentUserName: string;
  currentUserPhoto?: string;
  onClose: () => void;
  onCreated: () => void;
}

function CreateListingModal({ currentUserId, currentUserName, currentUserPhoto, onClose, onCreated }: CreateListingProps) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    title: '', description: '', condition: 'GOOD' as GarageSaleCondition,
    category: 'OTHER' as StoreProductCategory,
    startingBid: '', reservePrice: '', buyItNowPrice: '',
    shippingCost: '', isLocalPickup: false,
    durationHours: 72,
    tags: '',
  });
  const [images, setImages] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof typeof form, v: any) => setForm(p => ({ ...p, [k]: v }));

  const DURATIONS = [
    { label: '1 hour',  value: 1   },
    { label: '4 hours', value: 4   },
    { label: '12 hrs',  value: 12  },
    { label: '1 day',   value: 24  },
    { label: '3 days',  value: 72  },
    { label: '7 days',  value: 168 },
  ];

  const handleAddImageUrl = () => {
    const url = prompt('Paste image URL:');
    if (url && url.trim()) setImages(p => [...p, url.trim()].slice(0, 6));
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) return setError('Title is required');
    const startBid = parseFloat(form.startingBid);
    if (isNaN(startBid) || startBid <= 0) return setError('Starting bid must be a positive number');
    setSubmitting(true); setError('');
    try {
      const now = Date.now();
      await createGarageSaleItem({
        sellerId: currentUserId,
        sellerName: currentUserName,
        sellerPhoto: currentUserPhoto,
        title: form.title.trim(),
        description: form.description.trim(),
        condition: form.condition,
        category: form.category,
        images,
        startingBid: startBid,
        reservePrice: form.reservePrice ? parseFloat(form.reservePrice) : undefined,
        buyItNowPrice: form.buyItNowPrice ? parseFloat(form.buyItNowPrice) : undefined,
        startTime: now,
        endTime: now + form.durationHours * 3600_000,
        shippingCost: form.shippingCost ? parseFloat(form.shippingCost) : undefined,
        isLocalPickup: form.isLocalPickup,
        tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      });
      onCreated();
      onClose();
    } catch (e: any) {
      setError(e.message ?? 'Failed to create listing');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        className="relative w-full max-w-lg bg-[#121212] rounded-t-3xl sm:rounded-3xl overflow-hidden border border-white/10 max-h-[92vh] flex flex-col"
        initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
      >
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div>
            <h2 className="text-white font-bold text-lg flex items-center gap-2">
              <Tag size={18} className="text-[--small-orange]" /> List an item
            </h2>
            <p className="text-white/40 text-xs mt-0.5">Step {step} of 2</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 text-white/60 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex overflow-hidden p-4 gap-2 border-b border-white/10">
          {[1, 2].map(s => (
            <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${s <= step ? 'bg-[--small-orange]' : 'bg-white/10'}`} />
          ))}
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                {/* Images */}
                <div>
                  <label className="text-white/70 text-sm font-semibold block mb-2">Photos (up to 6)</label>
                  <div className="grid grid-cols-3 gap-2">
                    {images.map((img, i) => (
                      <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-white/10">
                        <img src={img} alt="" className="w-full h-full object-cover" />
                        <button
                          className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 text-white/70 hover:text-red-400"
                          onClick={() => setImages(p => p.filter((_, j) => j !== i))}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                    {images.length < 6 && (
                      <button onClick={handleAddImageUrl}
                        className="aspect-square rounded-xl border-2 border-dashed border-white/20 hover:border-[--small-orange]/40 flex flex-col items-center justify-center gap-1 text-white/30 hover:text-white/60 transition-colors">
                        <ImagePlus size={20} />
                        <span className="text-[10px]">Add photo</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Title */}
                <div>
                  <label className="text-white/70 text-sm font-semibold block mb-1.5">Title *</label>
                  <input value={form.title} onChange={e => set('title', e.target.value)} maxLength={80}
                    placeholder="What are you selling?"
                    className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[--small-orange]/60" />
                </div>

                {/* Description */}
                <div>
                  <label className="text-white/70 text-sm font-semibold block mb-1.5">Description</label>
                  <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3}
                    placeholder="Describe the item, its history, any flaws..."
                    className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[--small-orange]/60 resize-none" />
                </div>

                {/* Condition */}
                <div>
                  <label className="text-white/70 text-sm font-semibold block mb-2">Condition *</label>
                  <div className="flex flex-wrap gap-2">
                    {CONDITIONS.map(c => (
                      <button key={c.value} onClick={() => set('condition', c.value)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${form.condition === c.value ? 'border-transparent text-white' : 'border-white/20 text-white/50 hover:text-white/80'}`}
                        style={form.condition === c.value ? { background: c.color + '30', borderColor: c.color, color: c.color } : {}}>
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Category */}
                <div>
                  <label className="text-white/70 text-sm font-semibold block mb-2">Category</label>
                  <div className="grid grid-cols-3 gap-2">
                    {CATEGORIES.map(c => (
                      <button key={c.value} onClick={() => set('category', c.value)}
                        className={`py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition-colors ${form.category === c.value ? 'bg-[--small-orange]/15 border-[--small-orange]/40 text-[--small-orange]' : 'bg-white/5 border-white/10 text-white/50 hover:text-white/80'}`}>
                        <span>{c.emoji}</span> {c.label}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                {/* Pricing */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-white/70 text-sm font-semibold block mb-1.5">Starting bid *</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40">$</span>
                      <input type="number" step="0.01" min="0.01" value={form.startingBid} onChange={e => set('startingBid', e.target.value)}
                        placeholder="1.00"
                        className="w-full bg-white/10 border border-white/20 rounded-xl pl-7 pr-3 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[--small-orange]/60" />
                    </div>
                  </div>
                  <div>
                    <label className="text-white/70 text-sm font-semibold block mb-1.5">Reserve price</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40">$</span>
                      <input type="number" step="0.01" min="0" value={form.reservePrice} onChange={e => set('reservePrice', e.target.value)}
                        placeholder="Optional"
                        className="w-full bg-white/10 border border-white/20 rounded-xl pl-7 pr-3 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[--small-orange]/60" />
                    </div>
                  </div>
                </div>

                {/* Buy It Now */}
                <div>
                  <label className="text-white/70 text-sm font-semibold block mb-1.5">Buy It Now price <span className="text-white/30 font-normal">(optional)</span></label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40">$</span>
                    <input type="number" step="0.01" min="0" value={form.buyItNowPrice} onChange={e => set('buyItNowPrice', e.target.value)}
                      placeholder="Allow instant purchase"
                      className="w-full bg-white/10 border border-white/20 rounded-xl pl-7 pr-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[--small-orange]/60" />
                  </div>
                </div>

                {/* Duration */}
                <div>
                  <label className="text-white/70 text-sm font-semibold block mb-2">Auction duration</label>
                  <div className="flex flex-wrap gap-2">
                    {DURATIONS.map(d => (
                      <button key={d.value} onClick={() => set('durationHours', d.value)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${form.durationHours === d.value ? 'bg-[--small-orange]/15 border-[--small-orange]/40 text-[--small-orange]' : 'bg-white/5 border-white/10 text-white/50 hover:text-white/80'}`}>
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Shipping */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-white/70 text-sm font-semibold block mb-1.5">Shipping cost</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40">$</span>
                      <input type="number" step="0.01" min="0" value={form.shippingCost} onChange={e => set('shippingCost', e.target.value)}
                        placeholder="0 = free"
                        className="w-full bg-white/10 border border-white/20 rounded-xl pl-7 pr-3 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[--small-orange]/60" />
                    </div>
                  </div>
                  <div className="flex items-end pb-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <div onClick={() => set('isLocalPickup', !form.isLocalPickup)}
                        className={`w-10 h-6 rounded-full transition-colors relative ${form.isLocalPickup ? 'bg-[--small-orange]' : 'bg-white/20'}`}>
                        <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${form.isLocalPickup ? 'translate-x-5' : 'translate-x-1'}`} />
                      </div>
                      <span className="text-white/70 text-sm">Local pickup</span>
                    </label>
                  </div>
                </div>

                {/* Tags */}
                <div>
                  <label className="text-white/70 text-sm font-semibold block mb-1.5">Tags <span className="text-white/30 font-normal">(comma-separated)</span></label>
                  <input value={form.tags} onChange={e => set('tags', e.target.value)}
                    placeholder="vintage, signed, rare"
                    className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[--small-orange]/60" />
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 rounded-xl px-3 py-2">
                    <AlertCircle size={14} /> {error}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="p-4 border-t border-white/10 flex gap-3">
          {step === 2 && (
            <button onClick={() => setStep(1)}
              className="px-4 py-3 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/15 transition-colors flex items-center gap-2">
              <ChevronLeft size={16} /> Back
            </button>
          )}
          {step === 1 ? (
            <motion.button onClick={() => setStep(2)}
              className="flex-1 bg-[--small-orange] text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
              whileTap={{ scale: 0.98 }}>
              Next <ChevronRight size={16} />
            </motion.button>
          ) : (
            <motion.button onClick={handleSubmit} disabled={submitting}
              className="flex-1 bg-[--small-orange] text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
              whileTap={{ scale: 0.98 }}>
              {submitting ? 'Listing…' : <><Upload size={16} /> List item</>}
            </motion.button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── MAIN GARAGE SALE VIEW ─────────────────────────────────────────────────────

interface GarageSaleViewProps {
  onBack?: () => void;
  currentUserId?: string;
  currentUserName?: string;
  currentUserPhoto?: string;
}

export default function GarageSaleView({ onBack, currentUserId, currentUserName, currentUserPhoto }: GarageSaleViewProps) {
  const [items, setItems] = useState<GarageSaleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<GarageSaleItem | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'ENDING' | 'MY_LISTINGS' | 'WATCHLIST'>('ACTIVE');
  const [filterCategory, setFilterCategory] = useState<StoreProductCategory | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [myItems, setMyItems] = useState<GarageSaleItem[]>([]);
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setLoading(true);
    unsubRef.current = listenToGarageSaleItems((fetched) => {
      setItems(fetched);
      setLoading(false);
    });
    return () => { unsubRef.current?.(); };
  }, []);

  useEffect(() => {
    if (activeTab === 'MY_LISTINGS' && currentUserId) {
      fetchMyGarageSaleItems().then(setMyItems);
    }
  }, [activeTab, currentUserId]);

  const handleToggleWatch = useCallback(async (item: GarageSaleItem) => {
    if (!currentUserId) return;
    if (item.watchers.includes(currentUserId)) {
      await unwatchGarageSaleItem(item.id);
    } else {
      await watchGarageSaleItem(item.id);
    }
  }, [currentUserId]);

  const watchlistItems = items.filter(i => currentUserId && i.watchers.includes(currentUserId));

  const getDisplayItems = () => {
    let pool = activeTab === 'MY_LISTINGS' ? myItems
      : activeTab === 'WATCHLIST' ? watchlistItems
      : activeTab === 'ENDING' ? [...items].filter(i => i.status === 'ACTIVE' && i.endTime > Date.now()).sort((a, b) => a.endTime - b.endTime)
      : items.filter(i => i.status === 'ACTIVE');

    if (filterCategory !== 'ALL') pool = pool.filter(i => i.category === filterCategory);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      pool = pool.filter(i => i.title.toLowerCase().includes(q) || i.description.toLowerCase().includes(q) || i.sellerName.toLowerCase().includes(q));
    }
    return pool;
  };

  const displayItems = getDisplayItems();

  const tabs = [
    { id: 'ACTIVE'      as const, label: 'Live Auctions', count: items.filter(i => i.status === 'ACTIVE').length },
    { id: 'ENDING'      as const, label: 'Ending Soon',   count: items.filter(i => i.status === 'ACTIVE' && i.endTime - Date.now() < 3600_000).length },
    { id: 'WATCHLIST'   as const, label: 'Watching',      count: watchlistItems.length },
    { id: 'MY_LISTINGS' as const, label: 'My Listings',   count: myItems.length },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-[#0a0a0a]/95 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            {onBack && (
              <button onClick={onBack} className="p-2 rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors">
                <ArrowLeft size={20} />
              </button>
            )}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[--small-orange] to-amber-600 flex items-center justify-center">
                <Gavel size={16} className="text-white" />
              </div>
              <div>
                <h1 className="text-white font-bold text-lg leading-none">Garage Sale</h1>
                <p className="text-white/40 text-[11px]">Bid · Buy · Discover</p>
              </div>
            </div>
            <div className="flex-1 relative ml-2">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search auctions..."
                className="w-full bg-white/10 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:bg-white/15 transition-colors"
              />
            </div>
            <button
              onClick={() => setLayout(l => l === 'grid' ? 'list' : 'grid')}
              className="p-2 rounded-xl hover:bg-white/10 text-white/50 hover:text-white transition-colors"
            >
              {layout === 'grid' ? <List size={18} /> : <Grid3X3 size={18} />}
            </button>
            {currentUserId && (
              <motion.button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 bg-[--small-orange] text-white text-sm font-bold px-4 py-2 rounded-xl hover:opacity-90 transition-opacity"
                whileTap={{ scale: 0.97 }}
              >
                <Plus size={16} /> Sell
              </motion.button>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-3 overflow-x-auto pb-0.5 scrollbar-hide">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${activeTab === t.id ? 'bg-[--small-orange] text-white' : 'bg-white/10 text-white/60 hover:text-white'}`}>
                {t.label}
                {t.count > 0 && <span className={`text-[10px] rounded-full px-1.5 ${activeTab === t.id ? 'bg-white/20' : 'bg-white/20'}`}>{t.count}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Hero stats */}
        {activeTab === 'ACTIVE' && !searchQuery && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[
              { label: 'Live Auctions', value: items.filter(i => i.status === 'ACTIVE').length, icon: <Gavel size={16} />, color: 'text-[--small-orange]' },
              { label: 'Total Bids',    value: items.reduce((s, i) => s + i.bidCount, 0),       icon: <TrendingUp size={16} />, color: 'text-blue-400' },
              { label: 'Watchers',      value: items.reduce((s, i) => s + i.watchers.length, 0), icon: <Eye size={16} />,        color: 'text-purple-400' },
            ].map(stat => (
              <div key={stat.label} className="bg-white/5 rounded-2xl p-3 text-center">
                <div className={`flex justify-center mb-1 ${stat.color}`}>{stat.icon}</div>
                <div className="text-white font-bold text-xl">{stat.value}</div>
                <div className="text-white/40 text-[10px]">{stat.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Category filter */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
          <button
            onClick={() => setFilterCategory('ALL')}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${filterCategory === 'ALL' ? 'bg-white/15 border-white/30 text-white' : 'bg-transparent border-white/10 text-white/50 hover:text-white/80'}`}>
            All
          </button>
          {CATEGORIES.map(c => (
            <button key={c.value} onClick={() => setFilterCategory(c.value)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${filterCategory === c.value ? 'bg-[--small-orange]/15 border-[--small-orange]/40 text-[--small-orange]' : 'bg-transparent border-white/10 text-white/50 hover:text-white/80'}`}>
              {c.emoji} {c.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className={layout === 'grid' ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4' : 'space-y-3'}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className={`bg-white/5 rounded-2xl animate-pulse ${layout === 'grid' ? 'aspect-[3/4]' : 'h-24'}`} />
            ))}
          </div>
        ) : displayItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
              {activeTab === 'WATCHLIST' ? <Heart size={28} className="text-white/20" />
                : activeTab === 'MY_LISTINGS' ? <ShoppingBag size={28} className="text-white/20" />
                : <Gavel size={28} className="text-white/20" />}
            </div>
            <p className="text-white/40 font-semibold">
              {searchQuery ? 'No auctions match your search'
                : activeTab === 'WATCHLIST' ? 'No items in your watchlist'
                : activeTab === 'MY_LISTINGS' ? "You haven't listed anything yet"
                : 'No active auctions right now'}
            </p>
            {activeTab === 'MY_LISTINGS' && currentUserId && (
              <button onClick={() => setShowCreateModal(true)}
                className="mt-4 bg-[--small-orange] text-white font-bold px-6 py-2.5 rounded-xl hover:opacity-90 transition-opacity flex items-center gap-2">
                <Plus size={16} /> List your first item
              </button>
            )}
          </div>
        ) : (
          <motion.div layout className={layout === 'grid' ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4' : 'space-y-3'}>
            <AnimatePresence>
              {displayItems.map(item => (
                <AuctionCard
                  key={item.id}
                  item={item}
                  currentUserId={currentUserId}
                  onSelect={setSelectedItem}
                  onToggleWatch={handleToggleWatch}
                  layout={layout}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}

        {/* Trust footer */}
        <div className="mt-12 grid grid-cols-3 gap-4 border-t border-white/10 pt-8">
          {[
            { icon: <Shield size={20} />, title: 'Buyer Protection', desc: 'Safe, secure transactions on every bid' },
            { icon: <Award size={20} />, title: 'Verified Sellers',  desc: 'Sellers are verified Plajah community members' },
            { icon: <Clock size={20} />, title: 'Real-time Bids',    desc: 'Live auction updates as bids happen' },
          ].map(item => (
            <div key={item.title} className="text-center">
              <div className="text-[--small-orange] flex justify-center mb-2">{item.icon}</div>
              <div className="text-white font-semibold text-sm">{item.title}</div>
              <div className="text-white/40 text-xs mt-0.5">{item.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {selectedItem && (
          <ItemDetailModal
            key="detail"
            item={selectedItem}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            onClose={() => setSelectedItem(null)}
            onBidSuccess={() => {
              // Refresh will come via the listenToGarageSaleItems onSnapshot
              setSelectedItem(prev => prev ? { ...prev } : null);
            }}
          />
        )}
        {showCreateModal && currentUserId && currentUserName && (
          <CreateListingModal
            key="create"
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            currentUserPhoto={currentUserPhoto}
            onClose={() => setShowCreateModal(false)}
            onCreated={() => {
              if (activeTab !== 'MY_LISTINGS') setActiveTab('MY_LISTINGS');
              fetchMyGarageSaleItems().then(setMyItems);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
