import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search, ShoppingCart, Star, Filter, ChevronLeft, ChevronRight,
  X, Plus, Minus, Trash2, Tag, Package, Truck, Shield, Zap,
  Heart, Share2, ChevronDown, Grid3X3, List, SlidersHorizontal,
  Sparkles, TrendingUp, Clock, Crown, Gavel,
  CheckCircle2, ArrowRight, ExternalLink,
} from 'lucide-react';
import { motion as m, AnimatePresence as AP } from 'motion/react';
import { auth } from '../services/backendService';
import {
  fetchAllActiveProducts, fetchFeaturedProducts, fetchProductsByCategory,
  fetchProductReviews, addProductReview, createOrder, listenToProducts,
} from '../services/storeService';
import { StoreProduct, StoreCartItem, StoreReview, StoreProductCategory } from '../types';
import { uploadFile } from '../services/backendService';

// ── Constants ─────────────────────────────────────────────────────────────────
const CATEGORIES: { id: StoreProductCategory | 'ALL'; label: string; emoji: string }[] = [
  { id: 'ALL', label: 'All Items', emoji: '🛍️' },
  { id: 'APPAREL', label: 'Apparel', emoji: '👕' },
  { id: 'MUSIC', label: 'Music', emoji: '🎵' },
  { id: 'ACCESSORIES', label: 'Accessories', emoji: '💎' },
  { id: 'DIGITAL', label: 'Digital', emoji: '💾' },
  { id: 'COLLECTIBLES', label: 'Collectibles', emoji: '🏆' },
  { id: 'BOOKS', label: 'Books', emoji: '📚' },
  { id: 'ART', label: 'Art', emoji: '🎨' },
  { id: 'HOME', label: 'Home', emoji: '🏠' },
  { id: 'OTHER', label: 'Other', emoji: '📦' },
];

const SORT_OPTIONS = [
  { id: 'newest', label: 'Newest' },
  { id: 'price_asc', label: 'Price: Low to High' },
  { id: 'price_desc', label: 'Price: High to Low' },
  { id: 'popular', label: 'Most Popular' },
  { id: 'rating', label: 'Top Rated' },
];

// ── Star Rating ───────────────────────────────────────────────────────────────
const StarRating: React.FC<{ rating: number; onRate?: (r: number) => void; size?: number }> = ({ rating, onRate, size = 14 }) => {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <button key={i} type="button"
          onClick={() => onRate?.(i)}
          onMouseEnter={() => onRate && setHover(i)}
          onMouseLeave={() => onRate && setHover(0)}
          disabled={!onRate}
          className={`transition-all ${onRate ? 'cursor-pointer hover:scale-110' : 'cursor-default'}`}
        >
          <Star size={size}
            className={`transition-colors ${(hover || rating) >= i ? 'text-amber-400 fill-amber-400' : 'text-white/20'}`}
          />
        </button>
      ))}
    </div>
  );
};

// ── Product Card ──────────────────────────────────────────────────────────────
const ProductCard: React.FC<{
  product: StoreProduct;
  onSelect: () => void;
  onAddToCart: () => void;
  layout?: 'grid' | 'list';
}> = ({ product, onSelect, onAddToCart, layout = 'grid' }) => {
  const [isWishlisted, setIsWishlisted] = useState(false);
  const discount = product.compareAtPrice
    ? Math.round((1 - product.price / product.compareAtPrice) * 100)
    : 0;

  if (layout === 'list') {
    return (
      <motion.div
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex gap-4 p-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl hover:border-white/10 transition-all group cursor-pointer"
        onClick={onSelect}
      >
        <div className="w-24 h-24 rounded-xl overflow-hidden shrink-0 bg-black/30">
          <img src={product.images[0]} alt={product.title} className="w-full h-full object-cover group-hover:scale-105 transition-all duration-500" loading="lazy" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-black uppercase tracking-wider truncate mb-1">{product.title}</h3>
          <p className="text-[10px] text-white/30 line-clamp-2 mb-2">{product.description}</p>
          <div className="flex items-center gap-3">
            <StarRating rating={product.rating || 0} size={11} />
            <span className="text-[9px] text-white/20">({product.reviewCount || 0})</span>
          </div>
        </div>
        <div className="shrink-0 flex flex-col items-end justify-between">
          <div className="text-right">
            <div className="text-xl font-black text-small-orange">${product.price.toFixed(2)}</div>
            {product.compareAtPrice && (
              <div className="text-[10px] text-white/25 line-through">${product.compareAtPrice.toFixed(2)}</div>
            )}
          </div>
          <button onClick={e => { e.stopPropagation(); onAddToCart(); }}
            className="px-4 py-2 bg-small-orange/20 text-small-orange text-[9px] font-black uppercase tracking-widest rounded-full hover:bg-small-orange hover:text-white transition-all">
            Add to Cart
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden hover:border-white/10 transition-all group cursor-pointer"
      onClick={onSelect}
    >
      {/* Discount badge */}
      {discount > 0 && (
        <div className="absolute top-2 left-2 z-10 px-2 py-0.5 bg-red-500 text-white text-[8px] font-black rounded-full">-{discount}%</div>
      )}
      {product.isFeatured && (
        <div className="absolute top-2 right-10 z-10 px-2 py-0.5 bg-small-orange/90 text-white text-[8px] font-black rounded-full flex items-center gap-1">
          <Sparkles size={8} /> Featured
        </div>
      )}

      {/* Wishlist */}
      <button
        onClick={e => { e.stopPropagation(); setIsWishlisted(w => !w); }}
        className="absolute top-2 right-2 z-10 p-1.5 bg-black/50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
      >
        <Heart size={13} className={isWishlisted ? 'text-red-400 fill-red-400' : 'text-white/50'} />
      </button>

      {/* Image */}
      <div className="aspect-square overflow-hidden bg-black/40">
        {product.images[0] ? (
          <img src={product.images[0]} alt={product.title}
            className="w-full h-full object-cover group-hover:scale-110 transition-all duration-700" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package size={32} className="text-white/10" />
          </div>
        )}
      </div>

      {/* Quick add hover overlay */}
      <div className="absolute bottom-[4.5rem] left-0 right-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
        <button
          onClick={e => { e.stopPropagation(); onAddToCart(); }}
          className="px-6 py-2 bg-black/80 backdrop-blur-md text-white text-[9px] font-black uppercase tracking-widest rounded-full hover:bg-small-orange transition-all"
        >
          Quick Add
        </button>
      </div>

      {/* Info */}
      <div className="p-3">
        <span className="text-[8px] font-black uppercase tracking-widest text-white/25 mb-1 block">{product.category}</span>
        <h3 className="text-[11px] font-black uppercase tracking-wider truncate mb-1">{product.title}</h3>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-black text-small-orange">${product.price.toFixed(2)}</span>
            {product.compareAtPrice && (
              <span className="text-[9px] text-white/20 line-through">${product.compareAtPrice.toFixed(2)}</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Star size={9} className="text-amber-400 fill-amber-400" />
            <span className="text-[9px] text-white/30">{(product.rating || 0).toFixed(1)}</span>
          </div>
        </div>
        {product.stock < 10 && product.stock > 0 && (
          <p className="text-[8px] text-red-400 mt-0.5">Only {product.stock} left!</p>
        )}
        {product.stock === 0 && (
          <p className="text-[8px] text-white/20 mt-0.5">Out of stock</p>
        )}
      </div>
    </motion.div>
  );
};

// ── Cart Sidebar ──────────────────────────────────────────────────────────────
const CartSidebar: React.FC<{
  items: StoreCartItem[];
  onUpdateQty: (productId: string, qty: number) => void;
  onRemove: (productId: string) => void;
  onCheckout: () => void;
  onClose: () => void;
}> = ({ items, onUpdateQty, onRemove, onCheckout, onClose }) => {
  const subtotal = items.reduce((sum, i) => sum + i.product.price * i.quantity, 0);
  const shipping = subtotal > 50 ? 0 : 5.99;
  const tax = subtotal * 0.08;
  const total = subtotal + shipping + tax;

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 28, stiffness: 300 }}
      className="fixed right-0 top-0 bottom-0 w-full sm:w-96 bg-[#0e0e0e] border-l border-white/[0.08] z-[200] flex flex-col shadow-2xl"
    >
      <div className="px-6 py-5 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShoppingCart size={20} className="text-small-orange" />
          <span className="font-black uppercase tracking-tighter text-lg">Cart</span>
          <span className="w-6 h-6 bg-small-orange text-white text-[10px] font-black rounded-full flex items-center justify-center">
            {items.reduce((s, i) => s + i.quantity, 0)}
          </span>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl transition-all"><X size={18} /></button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide p-4 space-y-3">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <ShoppingCart size={40} className="text-white/10" />
            <p className="text-[10px] font-black uppercase tracking-widest text-white/20">Your cart is empty</p>
          </div>
        ) : items.map(item => (
          <div key={item.product.id} className="flex gap-3 p-3 bg-white/[0.04] border border-white/[0.06] rounded-2xl">
            <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 bg-black/30">
              <img src={item.product.images[0] || ''} alt="" className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-[10px] font-black uppercase tracking-wider truncate">{item.product.title}</h4>
              {item.variantName && <p className="text-[8px] text-white/30">{item.variantName}</p>}
              <p className="text-sm font-black text-small-orange mt-0.5">${(item.product.price * item.quantity).toFixed(2)}</p>
              <div className="flex items-center gap-2 mt-2">
                <div className="flex items-center gap-1 bg-black/40 rounded-lg">
                  <button onClick={() => onUpdateQty(item.product.id, item.quantity - 1)}
                    className="p-1.5 hover:bg-white/5 rounded-lg transition-all disabled:opacity-30" disabled={item.quantity <= 1}>
                    <Minus size={11} />
                  </button>
                  <span className="text-[11px] font-black w-5 text-center">{item.quantity}</span>
                  <button onClick={() => onUpdateQty(item.product.id, item.quantity + 1)}
                    className="p-1.5 hover:bg-white/5 rounded-lg transition-all">
                    <Plus size={11} />
                  </button>
                </div>
                <button onClick={() => onRemove(item.product.id)} className="p-1.5 hover:bg-red-500/10 rounded-lg transition-all">
                  <Trash2 size={11} className="text-red-400/60 hover:text-red-400" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {items.length > 0 && (
        <div className="p-5 border-t border-white/[0.06] space-y-3">
          {/* Free shipping banner */}
          {subtotal < 50 && (
            <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-xl text-[10px] font-bold text-green-400 flex items-center gap-2">
              <Truck size={12} />
              Add ${(50 - subtotal).toFixed(2)} more for free shipping!
            </div>
          )}

          <div className="space-y-1.5 text-sm">
            {[
              { label: 'Subtotal', value: `$${subtotal.toFixed(2)}` },
              { label: 'Shipping', value: shipping === 0 ? 'Free' : `$${shipping.toFixed(2)}` },
              { label: 'Tax', value: `$${tax.toFixed(2)}` },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-[10px] text-white/40 font-bold uppercase tracking-widest">{label}</span>
                <span className="text-[10px] font-black">{value}</span>
              </div>
            ))}
            <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
              <span className="text-[11px] font-black uppercase tracking-widest">Total</span>
              <span className="text-lg font-black text-small-orange">${total.toFixed(2)}</span>
            </div>
          </div>

          <button
            onClick={onCheckout}
            className="w-full py-4 bg-small-orange text-white font-black uppercase tracking-widest text-[10px] rounded-2xl hover:bg-small-orange/80 transition-all flex items-center justify-center gap-2"
          >
            Checkout <ArrowRight size={16} />
          </button>

          <div className="flex items-center justify-center gap-3 text-[8px] font-bold text-white/20">
            <Shield size={10} /> Secure checkout · <Truck size={10} /> Fast shipping
          </div>
        </div>
      )}
    </motion.div>
  );
};

// ── Product Detail Modal ──────────────────────────────────────────────────────
const ProductDetailModal: React.FC<{
  product: StoreProduct;
  onClose: () => void;
  onAddToCart: (product: StoreProduct, variantId?: string) => void;
}> = ({ product, onClose, onAddToCart }) => {
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState<string | undefined>();
  const [quantity, setQuantity] = useState(1);
  const [reviews, setReviews] = useState<StoreReview[]>([]);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewBody, setReviewBody] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'REVIEWS' | 'SHIPPING'>('OVERVIEW');

  useEffect(() => {
    fetchProductReviews(product.id).then(setReviews);
  }, [product.id]);

  const avgRating = reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : product.rating || 0;

  const handleSubmitReview = async () => {
    if (!auth.currentUser || !reviewBody.trim()) return;
    setIsSubmittingReview(true);
    try {
      await addProductReview({
        productId: product.id,
        reviewerId: auth.currentUser.uid,
        reviewerName: auth.currentUser.displayName || 'Anonymous',
        reviewerPhoto: auth.currentUser.photoURL || '',
        rating: reviewRating,
        title: reviewTitle,
        body: reviewBody,
        isVerifiedPurchase: false,
      });
      setReviews(prev => [{
        id: Date.now().toString(), productId: product.id, reviewerId: auth.currentUser!.uid,
        reviewerName: auth.currentUser!.displayName || 'Anonymous', reviewerPhoto: auth.currentUser!.photoURL || '',
        rating: reviewRating, title: reviewTitle, body: reviewBody, isVerifiedPurchase: false,
        helpfulCount: 0, timestamp: Date.now(),
      }, ...prev]);
      setShowReviewForm(false);
      setReviewBody('');
      setReviewTitle('');
      setReviewRating(5);
    } finally {
      setIsSubmittingReview(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[300] flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="max-w-4xl w-full bg-[#0e0e0e] border border-white/10 rounded-3xl overflow-hidden shadow-2xl my-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex flex-col md:flex-row">
          {/* Images */}
          <div className="md:w-1/2 p-6">
            <div className="aspect-square rounded-2xl overflow-hidden bg-black/40 mb-3">
              <img src={product.images[selectedImage] || ''} alt={product.title}
                className="w-full h-full object-cover" />
            </div>
            {product.images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                {product.images.map((img, i) => (
                  <button key={i} onClick={() => setSelectedImage(i)}
                    className={`w-14 h-14 rounded-xl overflow-hidden shrink-0 border-2 transition-all ${selectedImage === i ? 'border-small-orange' : 'border-white/10 hover:border-white/20'}`}>
                    <img src={img} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="md:w-1/2 p-6 flex flex-col">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <span className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-1 block">
                  {product.category} · {product.sellerName}
                </span>
                <h2 className="text-xl font-black uppercase tracking-tighter">{product.title}</h2>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl shrink-0"><X size={18} /></button>
            </div>

            {/* Rating */}
            <div className="flex items-center gap-3 mb-4">
              <StarRating rating={avgRating} size={14} />
              <span className="text-[10px] text-white/30">{avgRating.toFixed(1)} ({reviews.length} reviews)</span>
            </div>

            {/* Price */}
            <div className="flex items-baseline gap-3 mb-6">
              <span className="text-3xl font-black text-small-orange">${product.price.toFixed(2)}</span>
              {product.compareAtPrice && (
                <>
                  <span className="text-base text-white/25 line-through">${product.compareAtPrice.toFixed(2)}</span>
                  <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-[8px] font-black rounded-full">
                    -{Math.round((1 - product.price / product.compareAtPrice) * 100)}%
                  </span>
                </>
              )}
            </div>

            {/* Variants */}
            {product.variants && product.variants.length > 0 && (
              <div className="mb-4">
                <label className="text-[9px] font-black uppercase tracking-widest text-white/30 block mb-2">Select Option</label>
                <div className="flex flex-wrap gap-2">
                  {product.variants.map(v => (
                    <button key={v.id} onClick={() => setSelectedVariant(v.id)}
                      disabled={v.stock === 0}
                      className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border disabled:opacity-30 disabled:cursor-not-allowed ${selectedVariant === v.id ? 'bg-small-orange border-small-orange text-white' : 'border-white/10 hover:border-white/20 text-white/60'}`}>
                      {v.name}
                      {v.stock === 0 && ' (sold out)'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quantity */}
            <div className="flex items-center gap-4 mb-6">
              <div className="flex items-center gap-2 bg-white/[0.05] rounded-xl border border-white/10">
                <button onClick={() => setQuantity(q => Math.max(1, q - 1))} className="p-2.5 hover:bg-white/5 rounded-xl transition-all">
                  <Minus size={14} />
                </button>
                <span className="w-8 text-center font-black">{quantity}</span>
                <button onClick={() => setQuantity(q => Math.min(product.stock, q + 1))} className="p-2.5 hover:bg-white/5 rounded-xl transition-all">
                  <Plus size={14} />
                </button>
              </div>
              <span className="text-[9px] text-white/25">{product.stock} in stock</span>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mb-6">
              <button
                onClick={() => onAddToCart(product, selectedVariant)}
                disabled={product.stock === 0}
                className="flex-1 py-3.5 bg-small-orange text-white font-black uppercase tracking-widest text-[10px] rounded-2xl hover:bg-small-orange/80 transition-all disabled:opacity-30 flex items-center justify-center gap-2"
              >
                <ShoppingCart size={16} /> Add to Cart
              </button>
              <button className="p-3.5 bg-white/5 rounded-2xl hover:bg-white/10 transition-all border border-white/10">
                <Heart size={18} className="text-white/40" />
              </button>
            </div>

            {/* Trust badges */}
            <div className="flex items-center gap-4 mb-6">
              {[
                { icon: Shield, label: 'Buyer Protected' },
                { icon: Truck, label: 'Free over $50' },
                { icon: Zap, label: 'Fast Delivery' },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-1.5 text-[8px] font-bold text-white/20">
                  <Icon size={11} className="text-white/20" /> {label}
                </div>
              ))}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 p-1 bg-black/30 rounded-xl mb-4">
              {(['OVERVIEW', 'REVIEWS', 'SHIPPING'] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`}>
                  {tab}
                </button>
              ))}
            </div>

            {activeTab === 'OVERVIEW' && (
              <p className="text-[11px] text-white/50 leading-relaxed">{product.description}</p>
            )}

            {activeTab === 'REVIEWS' && (
              <div className="space-y-3 max-h-48 overflow-y-auto scrollbar-hide">
                {!showReviewForm && auth.currentUser && (
                  <button onClick={() => setShowReviewForm(true)}
                    className="w-full py-2 border border-dashed border-white/10 rounded-xl text-[9px] font-black uppercase tracking-widest text-white/20 hover:text-white hover:border-white/20 transition-all">
                    Write a Review
                  </button>
                )}
                {showReviewForm && (
                  <div className="p-3 bg-white/[0.03] border border-white/[0.08] rounded-xl space-y-3">
                    <StarRating rating={reviewRating} onRate={setReviewRating} size={18} />
                    <input value={reviewTitle} onChange={e => setReviewTitle(e.target.value)} placeholder="Review title…"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none" />
                    <textarea value={reviewBody} onChange={e => setReviewBody(e.target.value)} placeholder="Share your experience…" rows={3}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none resize-none" />
                    <div className="flex gap-2">
                      <button onClick={() => setShowReviewForm(false)} className="flex-1 py-2 bg-white/5 rounded-xl text-[9px] font-black uppercase text-white/30">Cancel</button>
                      <button onClick={handleSubmitReview} disabled={isSubmittingReview || !reviewBody.trim()}
                        className="flex-1 py-2 bg-small-orange rounded-xl text-[9px] font-black uppercase text-white disabled:opacity-30">
                        {isSubmittingReview ? 'Posting…' : 'Post'}
                      </button>
                    </div>
                  </div>
                )}
                {reviews.map(r => (
                  <div key={r.id} className="p-3 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                    <div className="flex items-center gap-2 mb-1.5">
                      <img src={r.reviewerPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${r.reviewerId}`}
                        className="w-6 h-6 rounded-full object-cover" />
                      <span className="text-[10px] font-black">{r.reviewerName}</span>
                      {r.isVerifiedPurchase && <span className="text-[8px] text-green-400 font-bold">✓ Verified</span>}
                    </div>
                    <StarRating rating={r.rating} size={11} />
                    {r.title && <p className="text-[11px] font-bold mt-1">{r.title}</p>}
                    <p className="text-[10px] text-white/40 mt-1">{r.body}</p>
                  </div>
                ))}
                {reviews.length === 0 && <p className="text-[9px] text-white/20 text-center py-4">No reviews yet</p>}
              </div>
            )}

            {activeTab === 'SHIPPING' && (
              <div className="space-y-3">
                {[
                  { icon: Truck, label: 'Standard Shipping', desc: '5-7 business days · $5.99 (free over $50)' },
                  { icon: Zap, label: 'Express Shipping', desc: '2-3 business days · $12.99' },
                  { icon: Shield, label: 'Returns', desc: '30-day hassle-free returns on most items' },
                ].map(({ icon: Icon, label, desc }) => (
                  <div key={label} className="flex items-start gap-3 p-3 bg-white/[0.03] rounded-xl">
                    <Icon size={14} className="text-small-orange shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest">{label}</p>
                      <p className="text-[9px] text-white/30">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ── Main StorePageView ────────────────────────────────────────────────────────
interface StorePageViewProps {
  onBack?: () => void;
  onGarageSale?: () => void;
  sellerId?: string;        // filter to specific seller's products
}

const StorePageView: React.FC<StorePageViewProps> = ({ onBack, onGarageSale, sellerId }) => {
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [featured, setFeatured] = useState<StoreProduct[]>([]);
  const [cart, setCart] = useState<StoreCartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<StoreProductCategory | 'ALL'>('ALL');
  const [sortBy, setSortBy] = useState('newest');
  const [searchQuery, setSearchQuery] = useState('');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [showCart, setShowCart] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<StoreProduct | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showCheckout, setShowCheckout] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [featuredSlide, setFeaturedSlide] = useState(0);

  useEffect(() => {
    setIsLoading(true);
    const unsub = listenToProducts(items => {
      setProducts(items);
      setFeatured(items.filter(p => p.isFeatured).slice(0, 5));
      setIsLoading(false);
    }, sellerId);
    return unsub;
  }, [sellerId]);

  // Featured carousel auto-advance
  useEffect(() => {
    if (featured.length <= 1) return;
    const t = setInterval(() => setFeaturedSlide(s => (s + 1) % featured.length), 5000);
    return () => clearInterval(t);
  }, [featured.length]);

  const addToCart = (product: StoreProduct, variantId?: string) => {
    if (product.stock === 0) return;
    const variant = product.variants?.find(v => v.id === variantId);
    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id && i.variantId === variantId);
      if (existing) {
        return prev.map(i => i.product.id === product.id && i.variantId === variantId
          ? { ...i, quantity: i.quantity + 1 }
          : i);
      }
      return [...prev, { product, variantId, variantName: variant?.name, quantity: 1 }];
    });
    setSelectedProduct(null);
  };

  const updateQty = (productId: string, qty: number) => {
    if (qty < 1) return;
    setCart(prev => prev.map(i => i.product.id === productId ? { ...i, quantity: qty } : i));
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(i => i.product.id !== productId));
  };

  const handleCheckout = async () => {
    if (!auth.currentUser || cart.length === 0) return;
    const subtotal = cart.reduce((s, i) => s + i.product.price * i.quantity, 0);
    const shipping = subtotal > 50 ? 0 : 5.99;
    const tax = subtotal * 0.08;
    try {
      await createOrder({
        buyerId: auth.currentUser.uid,
        buyerName: auth.currentUser.displayName || 'Anonymous',
        items: cart.map(i => ({
          productId: i.product.id,
          variantId: i.variantId,
          title: i.product.title,
          imageUrl: i.product.images[0],
          price: i.product.price,
          quantity: i.quantity,
        })),
        subtotal, shippingCost: shipping, tax, total: subtotal + shipping + tax,
        status: 'PENDING',
      });
      setCart([]);
      setShowCart(false);
      setShowCheckout(false);
      setOrderSuccess(true);
      setTimeout(() => setOrderSuccess(false), 6000);
    } catch (err) {
      console.error('Checkout failed:', err);
    }
  };

  // Filter + sort products
  const displayProducts = products
    .filter(p => {
      if (selectedCategory !== 'ALL' && p.category !== selectedCategory) return false;
      if (searchQuery && !p.title.toLowerCase().includes(searchQuery.toLowerCase()) && !p.description.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'price_asc') return a.price - b.price;
      if (sortBy === 'price_desc') return b.price - a.price;
      if (sortBy === 'popular') return (b.soldCount || 0) - (a.soldCount || 0);
      if (sortBy === 'rating') return (b.rating || 0) - (a.rating || 0);
      return b.createdAt - a.createdAt;
    });

  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="h-full overflow-y-auto scrollbar-hide bg-black/40">
      {/* ── TOP BAR ──────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-black/60 backdrop-blur-xl border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-3 max-w-7xl mx-auto">
          {onBack && (
            <button onClick={onBack} className="p-2 hover:bg-white/5 rounded-xl transition-all shrink-0">
              <ChevronLeft size={20} />
            </button>
          )}

          <div className="flex-1 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20" size={16} />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search the store…"
              className="w-full bg-white/[0.06] border border-white/[0.08] rounded-2xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:border-small-orange/40 transition-all"
            />
          </div>

          {onGarageSale && (
            <button
              onClick={onGarageSale}
              className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/20 text-amber-400 rounded-2xl text-[9px] font-black uppercase tracking-widest hover:bg-amber-500/30 transition-all shrink-0 border border-amber-500/20"
            >
              <Gavel size={14} /> Garage Sale
            </button>
          )}

          <button
            onClick={() => setShowCart(true)}
            className="relative p-2.5 bg-small-orange/15 text-small-orange rounded-xl hover:bg-small-orange/25 transition-all border border-small-orange/20 shrink-0"
          >
            <ShoppingCart size={20} />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-small-orange text-white text-[9px] font-black rounded-full flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-8">
        {/* ── FEATURED HERO CAROUSEL ──────────────────────────────── */}
        {featured.length > 0 && !searchQuery && selectedCategory === 'ALL' && (
          <div className="relative rounded-3xl overflow-hidden h-64 md:h-80 bg-black/40">
            <AnimatePresence mode="wait">
              <motion.div
                key={featuredSlide}
                initial={{ opacity: 0, scale: 1.05 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="absolute inset-0"
              >
                <img src={featured[featuredSlide]?.images[0] || ''} alt=""
                  className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
                <div className="absolute inset-0 p-8 md:p-12 flex flex-col justify-end">
                  <span className="text-[9px] font-black uppercase tracking-widest text-small-orange mb-2">Featured</span>
                  <h2 className="text-2xl md:text-4xl font-black uppercase tracking-tighter mb-2 max-w-md">
                    {featured[featuredSlide]?.title}
                  </h2>
                  <div className="flex items-center gap-4">
                    <span className="text-2xl font-black text-small-orange">${featured[featuredSlide]?.price.toFixed(2)}</span>
                    <button
                      onClick={() => addToCart(featured[featuredSlide]!)}
                      className="px-6 py-2.5 bg-small-orange text-white text-[10px] font-black uppercase tracking-widest rounded-full hover:bg-small-orange/80 transition-all"
                    >
                      Add to Cart
                    </button>
                    <button
                      onClick={() => setSelectedProduct(featured[featuredSlide])}
                      className="px-6 py-2.5 bg-white/10 text-white text-[10px] font-black uppercase tracking-widest rounded-full hover:bg-white/20 transition-all"
                    >
                      View
                    </button>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Dots */}
            {featured.length > 1 && (
              <div className="absolute bottom-4 right-6 flex items-center gap-1.5">
                {featured.map((_, i) => (
                  <button key={i} onClick={() => setFeaturedSlide(i)}
                    className={`transition-all rounded-full ${i === featuredSlide ? 'w-6 h-2 bg-small-orange' : 'w-2 h-2 bg-white/30 hover:bg-white/60'}`} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── PROMO BANNERS ──────────────────────────────────────── */}
        {!searchQuery && selectedCategory === 'ALL' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { icon: Truck, title: 'Free Shipping', desc: 'On orders over $50', color: '#10B981' },
              { icon: Shield, title: 'Buyer Protection', desc: '100% secure checkout', color: '#3B82F6' },
              { icon: Zap, title: 'Fast Delivery', desc: '2-3 days express available', color: '#F59E0B' },
            ].map(({ icon: Icon, title, desc, color }) => (
              <div key={title} className="flex items-center gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                <div className="p-2.5 rounded-xl shrink-0" style={{ background: `${color}20` }}>
                  <Icon size={18} style={{ color }} />
                </div>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-widest">{title}</p>
                  <p className="text-[9px] text-white/30">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── CATEGORIES ─────────────────────────────────────────── */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full shrink-0 text-[9px] font-black uppercase tracking-widest transition-all border ${
                selectedCategory === cat.id
                  ? 'bg-small-orange border-small-orange text-white'
                  : 'bg-white/[0.04] border-white/[0.08] text-white/40 hover:text-white hover:border-white/15'
              }`}
            >
              <span>{cat.emoji}</span> {cat.label}
            </button>
          ))}
        </div>

        {/* ── FILTERS BAR ────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4">
          <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest">
            {displayProducts.length} item{displayProducts.length !== 1 ? 's' : ''}
            {searchQuery && ` for "${searchQuery}"`}
          </p>
          <div className="flex items-center gap-2">
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2 text-[9px] font-black uppercase tracking-widest text-white/60 outline-none focus:border-white/20"
            >
              {SORT_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
            <div className="flex items-center gap-1 p-1 bg-white/[0.04] rounded-xl border border-white/[0.06]">
              {(['grid', 'list'] as const).map(l => (
                <button key={l} onClick={() => setLayout(l)}
                  className={`p-1.5 rounded-lg transition-all ${layout === l ? 'bg-white text-black' : 'text-white/30 hover:text-white'}`}>
                  {l === 'grid' ? <Grid3X3 size={14} /> : <List size={14} />}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── PRODUCT GRID ───────────────────────────────────────── */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array(8).fill(0).map((_, i) => (
              <div key={i} className="aspect-square rounded-2xl bg-white/[0.04] animate-pulse" />
            ))}
          </div>
        ) : displayProducts.length === 0 ? (
          <div className="py-24 text-center">
            <Package size={40} className="text-white/10 mx-auto mb-4" />
            <p className="text-[11px] font-black uppercase tracking-widest text-white/20 mb-2">No products found</p>
            <p className="text-[9px] text-white/10">{searchQuery ? `No results for "${searchQuery}"` : 'Check back soon'}</p>
          </div>
        ) : (
          <div className={layout === 'grid'
            ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4'
            : 'space-y-3'}>
            {displayProducts.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                onSelect={() => setSelectedProduct(product)}
                onAddToCart={() => addToCart(product)}
                layout={layout}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── CART SIDEBAR ───────────────────────────────────────── */}
      <AnimatePresence>
        {showCart && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-[190]" onClick={() => setShowCart(false)} />
            <CartSidebar
              items={cart}
              onUpdateQty={updateQty}
              onRemove={removeFromCart}
              onCheckout={handleCheckout}
              onClose={() => setShowCart(false)}
            />
          </>
        )}
      </AnimatePresence>

      {/* ── PRODUCT DETAIL ─────────────────────────────────────── */}
      <AnimatePresence>
        {selectedProduct && (
          <ProductDetailModal
            product={selectedProduct}
            onClose={() => setSelectedProduct(null)}
            onAddToCart={addToCart}
          />
        )}
      </AnimatePresence>

      {/* ── ORDER SUCCESS TOAST ─────────────────────────────────── */}
      <AnimatePresence>
        {orderSuccess && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[400] px-6 py-4 bg-green-500/20 border border-green-500/30 rounded-2xl flex items-center gap-3 shadow-2xl backdrop-blur-xl"
          >
            <CheckCircle2 size={20} className="text-green-400" />
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-green-400">Order placed!</p>
              <p className="text-[9px] text-white/30">You'll receive a confirmation shortly.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default StorePageView;
