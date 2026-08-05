import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShoppingBag, Star, ChevronLeft, ChevronRight, Search,
  Tag, Shirt, Music2, Bookmark, Cpu, Package, Image,
  Sparkles, ArrowRight, Store, TrendingUp, Zap, X,
  Heart, ShoppingCart, Filter, SlidersHorizontal,
} from 'lucide-react';
import { MerchItem, UserProfile } from '../types';
import { fetchMerchItems, searchUsers } from '../services/backendService';
import { DEMO_STORE_ID } from '../data/demoShowcase';

interface StoreHubViewProps {
  onBack?: () => void;
  onVisitStore: (sellerId: string) => void;
  currentUserId?: string;
}

// ── CATEGORIES ─────────────────────────────────────────────────────────────────

type LucideIcon = React.FC<{ size?: number; style?: React.CSSProperties; className?: string }>;

const CATEGORIES: { id: MerchItem['category'] | 'ALL'; label: string; icon: LucideIcon; color: string }[] = [
  { id: 'ALL', label: 'All', icon: Package, color: '#ffffff' },
  { id: 'APPAREL', label: 'Apparel', icon: Shirt, color: '#f97316' },
  { id: 'MUSIC', label: 'Music', icon: Music2, color: '#a855f7' },
  { id: 'ACCESSORY', label: 'Accessories', icon: Tag, color: '#3b82f6' },
  { id: 'DIGITAL', label: 'Digital', icon: Cpu, color: '#22c55e' },
  { id: 'COLLECTIBLES', label: 'Collectibles', icon: Bookmark, color: '#eab308' },
  { id: 'MEDIA', label: 'Media', icon: Image, color: '#ec4899' },
];

// ── ITEM CARD ──────────────────────────────────────────────────────────────────

const ItemCard: React.FC<{
  item: MerchItem;
  seller?: UserProfile;
  onVisitStore: () => void;
  size?: 'sm' | 'md' | 'lg';
}> = ({ item, seller, onVisitStore, size = 'md' }) => {
  const [liked, setLiked] = useState(false);
  const cat = CATEGORIES.find(c => c.id === item.category);
  const discount = item.salePrice ? Math.round((1 - item.salePrice / item.price) * 100) : 0;
  const displayPrice = item.salePrice ?? item.price;

  return (
    <motion.div
      whileHover={{ y: -3 }}
      onClick={onVisitStore}
      className={`group relative bg-white/5 border border-white/10 rounded-[1.5rem] overflow-hidden cursor-pointer hover:border-white/20 transition-all ${size === 'lg' ? 'col-span-2' : ''}`}
    >
      {/* Image */}
      <div className={`relative overflow-hidden bg-white/5 ${size === 'lg' ? 'h-56' : size === 'sm' ? 'h-32' : 'h-44'}`}>
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-all duration-500" />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: `${cat?.color}11` }}>
            {cat && <cat.icon size={40} style={{ color: cat.color, opacity: 0.3 }} />}
          </div>
        )}

        {/* Discount badge */}
        {discount > 0 && (
          <div className="absolute top-2 left-2 bg-red-500 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded-lg">
            -{discount}%
          </div>
        )}

        {/* Category pill */}
        <div
          className="absolute top-2 right-2 px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest"
          style={{ background: cat?.color + '22', color: cat?.color, border: `1px solid ${cat?.color}33` }}
        >
          {item.category}
        </div>

        {/* Wishlist */}
        <button
          onClick={e => { e.stopPropagation(); setLiked(l => !l); }}
          className="absolute bottom-2 right-2 w-7 h-7 rounded-full bg-black/60 backdrop-blur flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:scale-110"
        >
          <Heart size={13} className={liked ? 'fill-red-500 text-red-500' : 'text-white/60'} />
        </button>
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="text-[10px] text-white/30 mb-0.5 truncate">
          {seller?.displayName ?? 'Artist'}
        </p>
        <h3 className="text-xs font-black uppercase tracking-tight truncate mb-2">{item.title}</h3>

        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm font-black text-white">${displayPrice.toFixed(2)}</span>
            {item.salePrice && (
              <span className="text-[9px] text-white/30 line-through">${item.price.toFixed(2)}</span>
            )}
          </div>
          {item.rating && (
            <div className="flex items-center gap-0.5 text-[9px] text-amber-400">
              <Star size={9} className="fill-amber-400" />
              <span>{item.rating.toFixed(1)}</span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

// ── ARTIST STORE CARD ─────────────────────────────────────────────────────────

const ArtistStoreCard: React.FC<{ profile: UserProfile; items: MerchItem[]; onClick: () => void }> = ({ profile, items, onClick }) => {
  const previewItems = items.slice(0, 3);
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      onClick={onClick}
      className="relative bg-white/5 border border-white/10 rounded-[2rem] overflow-hidden cursor-pointer hover:border-white/20 transition-all group p-5"
    >
      <div className="flex items-center gap-4 mb-4">
        <div className="w-12 h-12 rounded-xl overflow-hidden bg-white/10 flex-shrink-0">
          {profile.photoURL
            ? <img src={profile.photoURL} alt={profile.displayName} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center font-black text-lg">{profile.displayName?.[0]}</div>
          }
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-black uppercase tracking-tight truncate">{profile.displayName}</h3>
          <div className="text-[9px] text-white/30">{items.length} item{items.length !== 1 ? 's' : ''} in store</div>
        </div>
        <div className="flex items-center gap-1 text-[10px] font-black text-orange-400 group-hover:gap-2 transition-all">
          Shop <ArrowRight size={12} />
        </div>
      </div>

      {/* Mini product row */}
      {previewItems.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {previewItems.map(item => (
            <div key={item.id} className="aspect-square bg-white/5 rounded-xl overflow-hidden">
              {item.imageUrl
                ? <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-white/10">
                    <ShoppingBag size={16} />
                  </div>
              }
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
};

// ── HERO CAROUSEL ─────────────────────────────────────────────────────────────

const HERO_SLIDES = [
  {
    bg: 'from-orange-900/70 to-black',
    accent: '#f97316',
    badge: 'New Drop',
    title: 'Artist Merch',
    subtitle: 'Exclusive drops from your favorite artists. Limited runs, unlimited style.',
    cta: 'Shop New Arrivals',
  },
  {
    bg: 'from-purple-900/70 to-black',
    accent: '#a855f7',
    badge: 'Trending Now',
    title: 'Collectors Edition',
    subtitle: 'Rare collectibles and limited-edition pieces from independent creators.',
    cta: 'Browse Collectibles',
  },
  {
    bg: 'from-blue-900/70 to-black',
    accent: '#3b82f6',
    badge: 'Digital Assets',
    title: 'Digital Goods',
    subtitle: 'Sample packs, presets, art prints, and more — delivered instantly.',
    cta: 'Explore Digital',
  },
];

const HeroCarousel: React.FC<{ onShop: (cat: string) => void }> = ({ onShop }) => {
  const [slide, setSlide] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const next = useCallback(() => setSlide(s => (s + 1) % HERO_SLIDES.length), []);
  const prev = () => setSlide(s => (s - 1 + HERO_SLIDES.length) % HERO_SLIDES.length);

  useEffect(() => {
    timerRef.current = setTimeout(next, 5000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [slide, next]);

  const current = HERO_SLIDES[slide];

  return (
    <div className="relative h-[340px] overflow-hidden rounded-[2.5rem] mb-8">
      <AnimatePresence mode="wait">
        <motion.div
          key={slide}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.4 }}
          className={`absolute inset-0 bg-gradient-to-r ${current.bg} flex items-center`}
        >
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_left,_rgba(255,255,255,0.04)_0%,_transparent_60%)]" />

          <div className="relative z-10 px-10 max-w-lg">
            <div
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest mb-4"
              style={{ background: current.accent + '22', color: current.accent, border: `1px solid ${current.accent}44` }}
            >
              <Sparkles size={10} /> {current.badge}
            </div>
            <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tightest leading-none mb-3">
              {current.title}
            </h1>
            <p className="text-xs text-white/50 leading-relaxed mb-6 max-w-xs">{current.subtitle}</p>
            <button
              onClick={() => onShop(current.badge)}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest text-black hover:scale-105 transition-all shadow-2xl"
              style={{ background: current.accent }}
            >
              <ShoppingCart size={14} />
              {current.cta}
            </button>
          </div>

          {/* Slide number */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
            {HERO_SLIDES.map((_, i) => (
              <button
                key={i}
                onClick={() => setSlide(i)}
                className={`transition-all rounded-full ${i === slide ? 'w-6 h-2 bg-white' : 'w-2 h-2 bg-white/30'}`}
              />
            ))}
          </div>
        </motion.div>
      </AnimatePresence>

      <button onClick={prev} className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 backdrop-blur flex items-center justify-center hover:bg-black/60 transition-all z-20">
        <ChevronLeft size={18} />
      </button>
      <button onClick={next} className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 backdrop-blur flex items-center justify-center hover:bg-black/60 transition-all z-20">
        <ChevronRight size={18} />
      </button>
    </div>
  );
};

// ── MAIN COMPONENT ─────────────────────────────────────────────────────────────

const StoreHubView: React.FC<StoreHubViewProps> = ({ onBack, onVisitStore, currentUserId }) => {
  const [items, setItems] = useState<MerchItem[]>([]);
  const [sellers, setSellers] = useState<Map<string, UserProfile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<MerchItem['category'] | 'ALL'>('ALL');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'NEW' | 'POPULAR' | 'PRICE_ASC' | 'PRICE_DESC'>('NEW');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const allItems = await fetchMerchItems();
        setItems(allItems);

        // Fetch seller profiles
        const ownerIds = [...new Set(allItems.map(i => i.ownerId))];
        const profiles = await Promise.all(
          ownerIds.slice(0, 20).map(async (uid) => {
            try {
              const results = await searchUsers(uid);
              return results.find(u => u.uid === uid) ?? null;
            } catch {
              return null;
            }
          })
        );
        const map = new Map<string, UserProfile>();
        profiles.forEach(p => { if (p) map.set(p.uid, p); });
        setSellers(map);
      } catch {
        setItems([]);
      }
      setLoading(false);
    };
    load();
  }, []);

  const filteredItems = items
    .filter(item => {
      if (activeCategory !== 'ALL' && item.category !== activeCategory) return false;
      if (searchQuery && !item.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'PRICE_ASC') return (a.salePrice ?? a.price) - (b.salePrice ?? b.price);
      if (sortBy === 'PRICE_DESC') return (b.salePrice ?? b.price) - (a.salePrice ?? a.price);
      if (sortBy === 'POPULAR') return (b.rating ?? 0) - (a.rating ?? 0);
      return b.timestamp - a.timestamp; // NEW
    });

  // Group items by seller for the "Browse by Artist" section
  const itemsBySeller = new Map<string, MerchItem[]>();
  items.forEach(item => {
    const arr = itemsBySeller.get(item.ownerId) ?? [];
    arr.push(item);
    itemsBySeller.set(item.ownerId, arr);
  });
  const topSellers = [...itemsBySeller.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 6);

  const featuredItems = filteredItems.slice(0, 8);
  const newArrivals = [...items].sort((a, b) => b.timestamp - a.timestamp).slice(0, 4);

  const handleSearch = () => setSearchQuery(searchInput);

  return (
    <div className="min-h-screen bg-black text-white pb-20">
      {/* ── TOP BAR ───────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-40 bg-black/80 backdrop-blur-xl border-b border-white/5 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-4">
          {onBack && (
            <button onClick={onBack} className="text-white/40 hover:text-white transition-all flex-shrink-0">
              <ChevronLeft size={20} />
            </button>
          )}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Store size={20} className="text-orange-400" />
            <span className="font-black uppercase tracking-widest text-sm">Plajah Store</span>
          </div>

          {/* Search */}
          <div className="flex-1 flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2 focus-within:border-orange-500/40 transition-all max-w-lg">
            <Search size={14} className="text-white/30 flex-shrink-0" />
            <input
              type="text"
              placeholder="Search merch, artists, styles…"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="flex-1 bg-transparent text-sm outline-none placeholder-white/20"
            />
            {searchInput && (
              <button onClick={() => { setSearchInput(''); setSearchQuery(''); }}>
                <X size={13} className="text-white/30 hover:text-white" />
              </button>
            )}
          </div>

          <button
            onClick={handleSearch}
            className="px-4 py-2 bg-orange-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-orange-400 transition-all flex-shrink-0"
          >
            Search
          </button>

          <button
            onClick={() => onVisitStore(DEMO_STORE_ID)}
            title="Browse a sample store"
            className="flex items-center gap-2 px-4 py-2 bg-orange-500/15 border border-orange-500/30 text-orange-300 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-orange-500/25 transition-all flex-shrink-0"
          >
            <Sparkles size={13} /> Demo Store
          </button>

          {currentUserId && (
            <button
              onClick={() => onVisitStore(currentUserId)}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all flex-shrink-0"
            >
              <Store size={13} />
              My Store
            </button>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 pt-8">
        {/* ── HERO CAROUSEL ─────────────────────────────────────────────── */}
        <HeroCarousel onShop={(badge) => {
          if (badge.includes('Digital')) setActiveCategory('DIGITAL');
          else if (badge.includes('Collector')) setActiveCategory('COLLECTIBLES');
          else setActiveCategory('ALL');
        }} />

        {/* ── CATEGORY ROW ──────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 overflow-x-auto pb-3 custom-scrollbar mb-10">
          {CATEGORIES.map(cat => {
            const Icon = cat.icon;
            const active = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id as any)}
                className={`flex flex-col items-center gap-2 px-4 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest whitespace-nowrap transition-all flex-shrink-0 min-w-[72px] ${active ? 'text-black shadow-lg' : 'bg-white/5 border border-white/5 hover:border-white/10 hover:bg-white/8 text-white/50'}`}
                style={active ? { background: cat.color, boxShadow: `0 8px 30px ${cat.color}44` } : {}}
              >
                <Icon size={20} style={active ? undefined : { color: cat.color, opacity: 0.7 }} />
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* ── FEATURED PRODUCTS ─────────────────────────────────────────── */}
        <section className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-black uppercase tracking-tightest flex items-center gap-2">
              <TrendingUp size={18} className="text-orange-400" />
              {searchQuery ? `Results for "${searchQuery}"` : activeCategory === 'ALL' ? 'Featured Merch' : CATEGORIES.find(c => c.id === activeCategory)?.label}
            </h2>

            {/* Sort */}
            <div className="flex items-center gap-2">
              <SlidersHorizontal size={14} className="text-white/30" />
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as any)}
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white outline-none cursor-pointer"
              >
                <option value="NEW">Newest</option>
                <option value="POPULAR">Popular</option>
                <option value="PRICE_ASC">Price: Low → High</option>
                <option value="PRICE_DESC">Price: High → Low</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="bg-white/5 border border-white/5 rounded-[1.5rem] h-56 animate-pulse" />
              ))}
            </div>
          ) : featuredItems.length === 0 ? (
            <div className="py-16 text-center border border-white/5 rounded-[2rem] bg-white/5">
              <ShoppingBag size={48} className="mx-auto mb-4 text-white/10" />
              <p className="text-sm font-black uppercase tracking-widest text-white/20">No items found</p>
              <p className="text-[10px] text-white/10 mt-2">Try a different category or search</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {featuredItems.map((item, i) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <ItemCard
                    item={item}
                    seller={sellers.get(item.ownerId)}
                    onVisitStore={() => onVisitStore(item.ownerId)}
                  />
                </motion.div>
              ))}
            </div>
          )}
        </section>

        {/* ── NEW ARRIVALS ROW ──────────────────────────────────────────── */}
        {!searchQuery && activeCategory === 'ALL' && newArrivals.length > 0 && (
          <section className="mb-12">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-black uppercase tracking-tightest flex items-center gap-2">
                <Zap size={18} className="text-yellow-400" />
                New Arrivals
              </h2>
              <span className="text-[10px] text-white/30 uppercase tracking-widest">Just dropped</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {newArrivals.map((item, i) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.06 }}
                >
                  <ItemCard item={item} seller={sellers.get(item.ownerId)} onVisitStore={() => onVisitStore(item.ownerId)} size="sm" />
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {/* ── BROWSE BY ARTIST ──────────────────────────────────────────── */}
        {!searchQuery && topSellers.length > 0 && (
          <section className="mb-12">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-black uppercase tracking-tightest flex items-center gap-2">
                <Sparkles size={18} className="text-purple-400" />
                Browse by Artist
              </h2>
              <span className="text-[10px] text-white/30 uppercase tracking-widest">Explore stores</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {topSellers.map(([sellerId, sellerItems], i) => {
                const profile = sellers.get(sellerId);
                if (!profile) return null;
                return (
                  <motion.div
                    key={sellerId}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                  >
                    <ArtistStoreCard
                      profile={profile}
                      items={sellerItems}
                      onClick={() => onVisitStore(sellerId)}
                    />
                  </motion.div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── OPEN YOUR STORE CTA ───────────────────────────────────────── */}
        <section>
          <div className="relative bg-gradient-to-r from-orange-900/50 to-amber-900/30 border border-orange-500/20 rounded-[3rem] p-10 overflow-hidden text-center">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(249,115,22,0.12)_0%,_transparent_70%)]" />
            <Store size={40} className="mx-auto mb-6 text-orange-400 relative z-10" />
            <h2 className="text-3xl font-black uppercase tracking-tightest mb-3 relative z-10">Open Your Store</h2>
            <p className="text-xs text-white/40 max-w-sm mx-auto mb-8 relative z-10">
              Sell merch, digital goods, and collectibles directly to your fans. No middleman, no hidden fees.
            </p>
            <button
              onClick={() => currentUserId && onVisitStore(currentUserId)}
              className="relative z-10 inline-flex items-center gap-2 px-8 py-4 bg-orange-500 hover:bg-orange-400 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all shadow-2xl shadow-orange-900 hover:scale-105"
            >
              <Store size={16} />
              Launch Your Store
              <ArrowRight size={16} />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};

export default StoreHubView;
