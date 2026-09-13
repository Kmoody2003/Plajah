import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Store, Building2, Search, Briefcase, ShoppingBag, Radio, Monitor,
  Star, Users, MapPin, Tag, ArrowRight, CheckCircle2, Sparkles,
  Music2, ChevronRight, Gift, Zap, UtensilsCrossed, Scissors, Ticket,
  Code2, Heart, Home, CreditCard, Megaphone, Plus, Play,
} from 'lucide-react';
import { BusinessPage, BrandAccount, UserProfile } from '../types';
import { fetchAllBusinessPages } from '../services/businessService';
import { VERTICAL_LABELS, VERTICAL_COLORS } from '../services/businessVerticals';
import { fetchAllPublicBrandAccounts } from '../services/backendService';
import { DEMO_BUSINESS } from '../data/demoBusiness';
import AriaMark from './aria/AriaMark';

type HubTab = 'BUSINESSES' | 'BRANDS';

// Derived from the vertical registry — adding a vertical there surfaces it here
// automatically, instead of drifting between two hand-maintained literals.
const TYPE_LABELS = VERTICAL_LABELS;
const TYPE_COLORS = VERTICAL_COLORS;

// Category browse row — id maps to BusinessPage.businessType (a vertical id).
// Icon + short subtitle are presentation-only; label/colour still come from the
// vertical registry so nothing drifts.
const CATEGORIES: { id: string; label: string; sub: string; color: string; icon: React.FC<{ size?: number }> }[] = [
  { id: 'RESTAURANT',    label: 'Restaurants',        sub: 'Cafés · bars · kitchens', color: '#D40055', icon: UtensilsCrossed },
  { id: 'RETAIL',        label: 'Retail & shops',     sub: 'Boutiques · makers',      color: '#FF8C00', icon: ShoppingBag },
  { id: 'SERVICE',       label: 'Services',           sub: 'Trades · pros',           color: '#D0BCFF', icon: Scissors },
  { id: 'ENTERTAINMENT', label: 'Entertainment',      sub: 'Venues · clubs',          color: '#00B4D8', icon: Ticket },
  { id: 'TECH',          label: 'Tech & studios',     sub: 'Software · creative',     color: '#06D6A0', icon: Code2 },
  { id: 'HEALTH',        label: 'Health & wellness',  sub: 'Salons · clinics',        color: '#FFD166', icon: Heart },
  { id: 'REAL_ESTATE',   label: 'Real estate',        sub: 'Agents · brokerages',     color: '#5B8DEF', icon: Home },
  { id: 'OTHER',         label: 'Everything else',    sub: 'The full stack',          color: '#ffffff', icon: Building2 },
];

// The marquee capabilities every owner gets — pure marketing content for the
// value band. All already built in the product (store, rewards, signage, radio,
// register, marketing/seed raiser).
const CAPABILITIES: {
  title: string; desc: string; color: string; icon: React.FC<{ size?: number }>;
  power?: string; stat: string; wide?: boolean;
}[] = [
  { title: 'An online store, ready on day one', color: '#FF8C00', icon: ShoppingBag, wide: true,
    desc: 'Sell products, merch, tickets and digital goods with variants, inventory and checkout — and payouts land straight in your bank.',
    power: 'Powered by your Merch Store', stat: 'Variants · inventory · Stripe payouts · order tracking' },
  { title: 'Customer rewards', color: '#00DAF3', icon: Gift,
    desc: 'Points, tiers and auto-deals the register recognizes the moment a regular walks in.',
    stat: 'Loyalty · offers · CRM' },
  { title: 'Your own in-store radio', color: '#D40055', icon: Radio,
    desc: 'Put a station in the room. Every phone sees Now Playing and can tip or buy the track.',
    stat: 'Live · tip & buy · linked artists' },
  { title: 'Digital signage', color: '#FF8C00', icon: Monitor,
    desc: 'Menu boards and promo screens on any display, changed from your phone.',
    stat: 'Menu boards · slideshows · remote' },
  { title: 'Register & kiosk', color: '#06D6A0', icon: CreditCard,
    desc: 'Ring up cash or card on any device; hand guests a self-order tablet.',
    stat: 'POS · BYO hardware · loyalty at checkout' },
  { title: 'Marketing & funding', color: '#D0BCFF', icon: Megaphone,
    desc: 'Post everywhere, run local ads, and crowdfund your next move with Seed Raiser.',
    stat: 'Organic + paid · Seed Raiser' },
];

function FeaturePill({ label, icon: Icon }: { label: string; icon: React.FC<{ size?: number }> }) {
  return (
    <span className="flex items-center gap-1 px-2 py-0.5 bg-white/5 border border-white/10 rounded-full text-[8px] font-black uppercase tracking-widest text-white/50">
      <Icon size={8} />{label}
    </span>
  );
}

function BusinessCard({ page, onClick }: { page: BusinessPage; onClick: () => void }) {
  const color = TYPE_COLORS[page.businessType] ?? '#ffffff40';
  const label = TYPE_LABELS[page.businessType] ?? 'Business';

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      className="group relative bg-white/[0.03] border border-white/[0.07] rounded-3xl overflow-hidden cursor-pointer hover:border-white/20 hover:bg-white/[0.06] transition-all duration-300"
    >
      {/* Cover */}
      <div className="h-28 relative overflow-hidden">
        {page.coverUrl || page.coverImageUrl ? (
          <img src={page.coverUrl ?? page.coverImageUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full" style={{ background: `linear-gradient(135deg, ${color}22 0%, #0a0a0a 100%)` }} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/10 to-transparent" />
        {page.isVerified && (
          <div className="absolute top-3 right-3 flex items-center gap-1 bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded-full">
            <CheckCircle2 size={9} className="text-[#06D6A0]" />
            <span className="text-[7px] font-black uppercase tracking-widest text-[#06D6A0]">Verified</span>
          </div>
        )}
      </div>

      <div className="p-4 -mt-6 relative z-10">
        {/* Logo */}
        <div className="flex items-end gap-3 mb-3">
          {page.logoUrl ? (
            <img src={page.logoUrl} alt="" className="w-12 h-12 rounded-2xl object-cover border-2 border-[#0a0a0a] shadow-xl flex-shrink-0" />
          ) : (
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center border-2 border-[#0a0a0a] shadow-xl flex-shrink-0" style={{ background: `linear-gradient(135deg, ${color}44, #111)` }}>
              <Store size={20} style={{ color }} />
            </div>
          )}
          <div className="pb-0.5 flex-1 min-w-0">
            <h3 className="text-sm font-black tracking-tight text-white truncate">{page.businessName}</h3>
            <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ color, background: `${color}18` }}>
              {label}
            </span>
          </div>
        </div>

        {(page.city || page.state) && (
          <div className="flex items-center gap-1 mb-2">
            <MapPin size={9} className="text-white/30" />
            <span className="text-[9px] text-white/40">{[page.city, page.state].filter(Boolean).join(', ')}</span>
          </div>
        )}

        {page.description && (
          <p className="text-[9px] text-white/40 leading-relaxed line-clamp-2 mb-3">{page.description}</p>
        )}

        {/* Feature pills */}
        <div className="flex flex-wrap gap-1 mb-3">
          {page.isAcceptingOrders && <FeaturePill label="Orders" icon={ShoppingBag} />}
          {page.radioServiceEnabled && <FeaturePill label="Radio" icon={Radio} />}
          {page.digitalSignageEnabled && <FeaturePill label="Signage" icon={Monitor} />}
          {page.rewardsEnabled && <FeaturePill label="Rewards" icon={Star} />}
        </div>

        {page.priceRange && (
          <div className="flex items-center gap-1 mb-3">
            <Tag size={9} className="text-white/30" />
            <span className="text-[9px] text-white/40">{page.priceRange}</span>
          </div>
        )}

        <button className="w-full flex items-center justify-center gap-2 py-2.5 bg-white/[0.06] border border-white/10 rounded-2xl text-[9px] font-black uppercase tracking-widest text-white/70 group-hover:bg-white/10 group-hover:text-white transition-all">
          Visit Page <ArrowRight size={10} />
        </button>
      </div>
    </motion.div>
  );
}

function BrandCard({ brand, onClick }: { brand: BrandAccount; onClick: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      className="group relative bg-white/[0.03] border border-white/[0.07] rounded-3xl overflow-hidden cursor-pointer hover:border-white/20 hover:bg-white/[0.06] transition-all duration-300"
    >
      {/* Cover */}
      <div className="h-28 relative overflow-hidden">
        {brand.coverUrl ? (
          <img src={brand.coverUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-[#6B0099]/20 via-[#D40055]/10 to-[#0a0a0a]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/10 to-transparent" />
      </div>

      <div className="p-4 -mt-6 relative z-10">
        <div className="flex items-end gap-3 mb-3">
          {brand.logoUrl ? (
            <img src={brand.logoUrl} alt="" className="w-12 h-12 rounded-2xl object-cover border-2 border-[#0a0a0a] shadow-xl flex-shrink-0" />
          ) : (
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center border-2 border-[#0a0a0a] shadow-xl flex-shrink-0 bg-gradient-to-br from-[#6B0099] to-[#D40055]">
              <Music2 size={20} className="text-white" />
            </div>
          )}
          <div className="pb-0.5 flex-1 min-w-0">
            <h3 className="text-sm font-black tracking-tight text-white truncate">{brand.name}</h3>
            <div className="flex items-center gap-1 mt-0.5">
              <Users size={8} className="text-white/40" />
              <span className="text-[8px] text-white/40">{brand.managedArtistIds?.length ?? 0} artists</span>
            </div>
          </div>
        </div>

        {brand.description && (
          <p className="text-[9px] text-white/40 leading-relaxed line-clamp-2 mb-3">{brand.description}</p>
        )}

        <button className="w-full flex items-center justify-center gap-2 py-2.5 bg-white/[0.06] border border-white/10 rounded-2xl text-[9px] font-black uppercase tracking-widest text-white/70 group-hover:bg-white/10 group-hover:text-white transition-all">
          View Brand <ArrowRight size={10} />
        </button>
      </div>
    </motion.div>
  );
}

interface PlajahBusinessHubProps {
  onNavigate: (target: string, params?: any) => void;
  currentUser?: UserProfile | null;
  isLoggedIn?: boolean;
}

const PlajahBusinessHub: React.FC<PlajahBusinessHubProps> = ({ onNavigate, currentUser, isLoggedIn }) => {
  const [tab, setTab] = useState<HubTab>('BUSINESSES');
  const [businesses, setBusinesses] = useState<BusinessPage[]>([]);
  const [brands, setBrands] = useState<BrandAccount[]>([]);
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [biz, br] = await Promise.all([fetchAllBusinessPages(), fetchAllPublicBrandAccounts()]);
      setBusinesses(biz);
      setBrands(br);
      setLoading(false);
    };
    load();
  }, []);

  const filteredBusinesses = useMemo(() => {
    const q = search.toLowerCase();
    return businesses.filter(b => {
      if (cat && b.businessType !== cat) return false;
      if (!q) return true;
      return (
        b.businessName.toLowerCase().includes(q) ||
        b.description?.toLowerCase().includes(q) ||
        b.city?.toLowerCase().includes(q) ||
        b.businessType?.toLowerCase().includes(q)
      );
    });
  }, [businesses, search, cat]);

  const filteredBrands = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return brands;
    return brands.filter(b =>
      b.name.toLowerCase().includes(q) ||
      b.description?.toLowerCase().includes(q)
    );
  }, [brands, search]);

  const catCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const b of businesses) m[b.businessType] = (m[b.businessType] ?? 0) + 1;
    return m;
  }, [businesses]);

  const handleVisitBusiness = (page: BusinessPage) => {
    onNavigate('BUSINESS_PUBLIC', { businessPage: page });
  };

  const handleVisitBrand = (brand: BrandAccount) => {
    // Adapt BrandAccount → BrandPublicPageData shape for BrandPublicPage
    const adapted = {
      id: brand.id,
      brandId: brand.id,
      adminId: brand.adminId,
      brandName: brand.name,
      about: brand.description || '',
      logoUrl: brand.logoUrl,
      coverImageUrl: brand.coverUrl,
      roster: (brand.managedArtistIds ?? []).map(id => ({ artistId: id, artistName: id })),
      featuredReleaseIds: [],
      isPublic: true,
      createdAt: brand.timestamp,
      updatedAt: brand.timestamp,
    };
    onNavigate('BRAND_PUBLIC', { brandPage: adapted });
  };

  // Primary owner CTA — signed-in owners jump to the dashboard to build their
  // page; guests go to the start-a-business flow (Praxis, learn-as-you-build).
  const startBusiness = () => onNavigate(isLoggedIn ? 'BUSINESS_DASHBOARD' : 'PRAXIS');

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="min-h-screen bg-black/40 text-white">
      {/* ── NAV ── */}
      <div className="sticky top-0 z-30 bg-[#0a0a0d]/85 backdrop-blur-xl border-b border-white/[0.07]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center gap-4">
          <div className="flex items-center gap-3 mr-2">
            <div className="w-7 h-7 rounded-[9px]" style={{ background: 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)', boxShadow: '0 8px 24px rgba(212,0,85,.34)' }} />
            <div className="leading-none">
              <div className="text-[15px] font-black tracking-tight">Plajah Business</div>
              <div className="text-[8px] font-black uppercase tracking-[0.22em] text-white/35 mt-0.5">Directory</div>
            </div>
          </div>
          <button onClick={() => scrollTo('dir')} className="hidden md:block px-3 py-2 rounded-full text-[13px] font-bold text-white/50 hover:text-white hover:bg-white/5 transition-all">Browse</button>
          <button onClick={() => scrollTo('cats')} className="hidden md:block px-3 py-2 rounded-full text-[13px] font-bold text-white/50 hover:text-white hover:bg-white/5 transition-all">Categories</button>
          <button onClick={() => scrollTo('owners')} className="hidden md:block px-3 py-2 rounded-full text-[13px] font-bold text-white/50 hover:text-white hover:bg-white/5 transition-all">For owners</button>

          <div className="ml-auto flex items-center gap-3">
            <div className="relative hidden sm:block">
              <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                type="text"
                placeholder="Search businesses & brands…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-56 bg-white/[0.05] border border-white/10 rounded-full py-2.5 pl-9 pr-4 text-[12px] font-medium outline-none focus:border-white/30 transition-all placeholder:text-white/25"
              />
            </div>
            {isLoggedIn && (
              <button
                onClick={() => onNavigate('BUSINESS_DASHBOARD')}
                className="hidden sm:flex items-center gap-2 px-4 h-10 bg-white/5 border border-white/15 rounded-full text-[11px] font-black uppercase tracking-widest hover:bg-white/10 transition-all whitespace-nowrap"
              >
                <Briefcase size={12} /> Dashboard
              </button>
            )}
            <button
              onClick={startBusiness}
              className="flex items-center gap-2 px-4 h-10 rounded-full text-[12px] font-black tracking-tight text-white hover:-translate-y-px transition-transform whitespace-nowrap"
              style={{ background: 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)', boxShadow: '0 8px 24px rgba(212,0,85,.34)' }}
            >
              <ArrowRight size={14} /> Start free
            </button>
          </div>
        </div>
      </div>

      {/* ── HERO ── */}
      <header className="relative overflow-hidden border-b border-white/[0.07]">
        <div className="pointer-events-none absolute -top-40 -right-24 w-[34rem] h-[34rem] rounded-full blur-3xl" style={{ background: 'radial-gradient(circle,rgba(255,140,0,.28),transparent 66%)' }} />
        <div className="pointer-events-none absolute -bottom-52 -left-28 w-[30rem] h-[30rem] rounded-full blur-3xl" style={{ background: 'radial-gradient(circle,rgba(107,0,153,.44),transparent 66%)' }} />
        <div className="pointer-events-none absolute top-10 left-1/2 w-[22rem] h-[22rem] rounded-full blur-3xl" style={{ background: 'radial-gradient(circle,rgba(0,218,243,.15),transparent 66%)' }} />
        <div className="relative max-w-6xl mx-auto px-6 py-16 sm:py-20 text-center">
          <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-[11px] font-black uppercase tracking-[0.3em] text-white/40 mb-5" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Plajah for Business
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            className="font-black italic uppercase leading-[0.86] tracking-[-0.035em]"
            style={{ fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(48px,9vw,104px)' }}
          >
            <span className="text-white">Open. Sell. </span>
            <span className="block" style={{ background: 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>Grow.</span>
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="text-white/65 mx-auto mt-6 max-w-2xl leading-relaxed" style={{ fontSize: 'clamp(16px,2.1vw,20px)' }}>
            Your online store, register, customer rewards, digital signage and your own in-store radio — all in one app. Free to start. Nothing to install. Zero per-feature fees.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }} className="mt-9 flex flex-wrap gap-3 justify-center">
            <button
              onClick={startBusiness}
              className="flex items-center gap-2.5 h-14 px-7 rounded-full text-[15px] font-black tracking-tight text-white hover:-translate-y-0.5 transition-transform"
              style={{ fontFamily: 'Outfit, sans-serif', background: 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)', boxShadow: '0 10px 34px rgba(212,0,85,.36)' }}
            >
              <ShoppingBag size={18} /> Run your business on Plajah
            </button>
            <button
              onClick={() => scrollTo('dir')}
              className="flex items-center gap-2.5 h-14 px-7 rounded-full text-[15px] font-black tracking-tight bg-white/[0.05] border border-white/15 text-white hover:bg-white/10 transition-all"
              style={{ fontFamily: 'Outfit, sans-serif' }}
            >
              <Search size={17} /> Browse local businesses
            </button>
          </motion.div>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.24 }} className="mt-7 flex flex-wrap gap-2.5 justify-center">
            {[
              { t: 'Free to start', dot: true },
              { t: '0% per-feature fees' },
              { t: '7 tools, one app' },
              { t: 'Payouts straight to your bank' },
            ].map(c => (
              <span key={c.t} className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.04] border border-white/10 text-[12.5px] font-semibold text-white/65">
                {c.dot && <span className="w-1.5 h-1.5 rounded-full bg-[#06D6A0]" style={{ boxShadow: '0 0 0 3px rgba(6,214,160,.2)' }} />}
                {c.t}
              </span>
            ))}
          </motion.div>
        </div>
      </header>

      {/* ── CATEGORIES ── */}
      <section id="cats" className="max-w-6xl mx-auto px-6 py-14">
        <div className="flex items-end justify-between gap-5 mb-6">
          <div>
            <h2 className="font-black italic uppercase tracking-[-0.02em] leading-[0.95]" style={{ fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(24px,3.4vw,34px)' }}>Find your kind of business</h2>
            <p className="text-white/40 text-sm mt-2">Every business on Plajah, sorted the way people actually shop.</p>
          </div>
          {cat && (
            <button onClick={() => setCat(null)} className="text-[12px] font-black text-white/60 hover:text-white flex items-center gap-1.5 whitespace-nowrap" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Clear filter <span className="text-white/40">✕</span>
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {CATEGORIES.map(c => {
            const active = cat === c.id;
            const count = catCounts[c.id] ?? 0;
            return (
              <button
                key={c.id}
                onClick={() => { setCat(active ? null : c.id); scrollTo('dir'); }}
                className={`group relative overflow-hidden text-left p-5 rounded-3xl border transition-all min-h-[128px] flex flex-col gap-3 ${active ? 'border-white/25' : 'border-white/[0.08] hover:border-white/20'}`}
                style={{ background: active ? `${c.color}12` : 'rgba(255,255,255,0.04)' }}
              >
                <span className="absolute w-36 h-36 rounded-full blur-[46px] -top-10 -right-10 opacity-40 group-hover:opacity-60 transition-opacity" style={{ background: c.color }} />
                <span className="relative w-11 h-11 rounded-2xl grid place-items-center" style={{ background: `${c.color}22`, color: c.color }}>
                  <c.icon size={20} />
                </span>
                <span className="relative font-black text-[16px]" style={{ fontFamily: 'Outfit, sans-serif' }}>{c.label}</span>
                <span className="relative mt-auto flex items-center gap-2 text-[11.5px] text-white/40">
                  {count > 0 ? `${count} ${count === 1 ? 'listing' : 'listings'}` : c.sub}
                  <ChevronRight size={13} className="ml-auto opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" style={{ color: c.color }} />
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── OWNER VALUE BAND ── */}
      <section id="owners" className="bg-[#08080b] border-y border-white/[0.07]">
        <div className="max-w-6xl mx-auto px-6 py-14">
          <div className="flex items-end justify-between gap-5 mb-7">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.3em] text-[#FF8C00] mb-3" style={{ fontFamily: 'Outfit, sans-serif' }}>Why owners choose Plajah</div>
              <h2 className="font-black italic uppercase tracking-[-0.02em] leading-[0.95]" style={{ fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(24px,3.4vw,36px)' }}>One app runs the whole shop</h2>
              <p className="text-white/40 text-sm mt-2 max-w-md">No stack of subscriptions. Every tool below is included and works together out of the box.</p>
            </div>
            <button onClick={startBusiness} className="hidden sm:flex items-center gap-2 text-[12.5px] font-black text-white/70 hover:text-white whitespace-nowrap" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Start free <ArrowRight size={14} />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {CAPABILITIES.map(cap => (
              <div
                key={cap.title}
                className={`relative overflow-hidden p-6 rounded-[28px] border border-white/[0.08] hover:border-white/20 hover:-translate-y-0.5 transition-all flex flex-col ${cap.wide ? 'lg:col-span-2' : ''}`}
                style={{ background: 'linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.02))' }}
              >
                <span className="absolute inset-0 opacity-50 pointer-events-none" style={{ background: `radial-gradient(120% 120% at 100% 0%, ${cap.color}22, transparent 55%)` }} />
                <span className="relative w-11 h-11 rounded-2xl grid place-items-center mb-4" style={{ background: `${cap.color}22`, color: cap.color }}>
                  <cap.icon size={22} />
                </span>
                <h3 className="relative font-black text-[18px]" style={{ fontFamily: 'Outfit, sans-serif' }}>{cap.title}</h3>
                <p className="relative text-white/60 text-[13.5px] mt-2 leading-relaxed max-w-[44ch]">{cap.desc}</p>
                {cap.power && (
                  <span className="relative mt-3 inline-flex items-center gap-1.5 text-[10.5px] font-black uppercase tracking-widest text-[#FF8C00]">
                    <Zap size={13} /> {cap.power}
                  </span>
                )}
                <span className="relative mt-auto pt-4 text-[12px] text-white/40 font-mono">{cap.stat}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── DIRECTORY ── */}
      <section id="dir" className="max-w-6xl mx-auto px-6 py-14">
        <div className="flex items-end justify-between gap-5 mb-6">
          <div>
            <h2 className="font-black italic uppercase tracking-[-0.02em] leading-[0.95]" style={{ fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(24px,3.4vw,34px)' }}>
              {cat ? (TYPE_LABELS[cat] ?? 'Businesses') : 'Now open on Plajah'}
            </h2>
            <p className="text-white/40 text-sm mt-2">Real businesses running their whole operation here. Yours could be next.</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Businesses / Brands toggle */}
            {([
              { id: 'BUSINESSES' as HubTab, label: `Businesses (${businesses.length})`, icon: Store },
              { id: 'BRANDS' as HubTab, label: `Brands (${brands.length})`, icon: Building2 },
            ]).map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${
                  tab === t.id ? 'bg-white text-black' : 'bg-white/5 text-white/40 hover:text-white border border-white/10'
                }`}
              >
                <t.icon size={11} />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Demo Business Spotlight — always visible, no loading dependency */}
        {tab === 'BUSINESSES' && !search && !cat && (
          <motion.div
            className="mb-8 relative overflow-hidden rounded-[28px] cursor-pointer group border border-white/10"
            onClick={() => handleVisitBusiness(DEMO_BUSINESS)}
            whileTap={{ scale: 0.99 }}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="absolute inset-0">
              {DEMO_BUSINESS.coverUrl && (
                <img src={DEMO_BUSINESS.coverUrl} alt="" className="w-full h-full object-cover scale-105 group-hover:scale-110 transition-transform duration-700" />
              )}
              <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-black/30" />
            </div>
            <div className="relative z-10 p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center gap-5">
              {DEMO_BUSINESS.logoUrl && (
                <img src={DEMO_BUSINESS.logoUrl} alt="" className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border-2 border-white/20 shadow-2xl flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-[#FF8C00]/15 text-[#FF8C00] border border-[#FF8C00]/30 flex items-center gap-1">
                    <Sparkles size={9} /> Featured demo
                  </span>
                  <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-[#06D6A0]">
                    <CheckCircle2 size={9} /> Verified
                  </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">{DEMO_BUSINESS.businessName}</h2>
                <p className="text-white/60 text-xs mt-1 line-clamp-1">{DEMO_BUSINESS.tagline}</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {DEMO_BUSINESS.radioServiceEnabled && (
                    <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-1 bg-white/5 border border-white/10 rounded-full text-white/50"><Radio size={8} /> In-Store Radio</span>
                  )}
                  {DEMO_BUSINESS.digitalSignageEnabled && (
                    <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-1 bg-white/5 border border-white/10 rounded-full text-white/50"><Monitor size={8} /> Digital Signage</span>
                  )}
                  {DEMO_BUSINESS.rewardsEnabled && (
                    <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-1 bg-white/5 border border-white/10 rounded-full text-white/50"><Gift size={8} /> Loyalty Rewards</span>
                  )}
                  {DEMO_BUSINESS.isAcceptingOrders && (
                    <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-1 bg-white/5 border border-white/10 rounded-full text-white/50"><ShoppingBag size={8} /> Online Orders</span>
                  )}
                </div>
              </div>
              <div className="flex-shrink-0">
                <div className="flex items-center gap-2 px-5 py-3 bg-[#FF8C00] text-black rounded-2xl text-xs font-black uppercase tracking-widest group-hover:bg-amber-400 transition-colors">
                  View Demo <ChevronRight size={14} />
                </div>
                <p className="text-white/30 text-[9px] text-center mt-2">See how your page could look</p>
              </div>
            </div>
          </motion.div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-32">
            <div className="w-8 h-8 border-2 border-white/10 border-t-[#FF8C00] rounded-full animate-spin" />
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {tab === 'BUSINESSES' && (
              <motion.div key="businesses" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filteredBusinesses.map((page, i) => (
                    <motion.div key={page.id} transition={{ delay: i * 0.04 }}>
                      <BusinessCard page={page} onClick={() => handleVisitBusiness(page)} />
                    </motion.div>
                  ))}

                  {/* Always-present "add your business" tile */}
                  <button
                    onClick={startBusiness}
                    className="flex flex-col items-center justify-center text-center rounded-3xl border border-dashed border-white/12 hover:border-[#FF8C00]/50 transition-all min-h-[230px] p-6 group"
                  >
                    <span className="w-12 h-12 rounded-2xl grid place-items-center" style={{ background: 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)' }}>
                      <Plus size={22} className="text-white" />
                    </span>
                    <span className="mt-3.5 font-black text-[15px]" style={{ fontFamily: 'Outfit, sans-serif' }}>Your business here</span>
                    <span className="text-[9.5px] font-black uppercase tracking-widest text-[#FF8C00] mt-1.5">Free to list</span>
                    <span className="text-[11px] text-white/40 mt-2.5 max-w-[22ch]">Get discovered by every Plajah member near you.</span>
                  </button>
                </div>

                {filteredBusinesses.length === 0 && (search || cat) && (
                  <div className="text-center py-16 text-white/30 text-[11px] font-black uppercase tracking-widest">
                    No businesses match {cat && !search ? `“${TYPE_LABELS[cat] ?? cat}”` : 'your search'}
                  </div>
                )}
              </motion.div>
            )}

            {tab === 'BRANDS' && (
              <motion.div key="brands" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {filteredBrands.length === 0 ? (
                  <div className="text-center py-32 bg-white/[0.02] rounded-[3rem] border border-dashed border-white/10">
                    <Building2 size={48} className="mx-auto mb-4 opacity-20" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/20">
                      {search ? 'No brands match your search' : 'No brand pages yet'}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredBrands.map((brand, i) => (
                      <motion.div key={brand.id} transition={{ delay: i * 0.04 }}>
                        <BrandCard brand={brand} onClick={() => handleVisitBrand(brand)} />
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </section>

      {/* ── FOUNDER CTA ── */}
      <section className="max-w-6xl mx-auto px-6 pb-16">
        <div className="relative overflow-hidden rounded-[36px] border border-white/15 px-8 sm:px-10 py-14 text-center" style={{ background: 'linear-gradient(135deg,rgba(107,0,153,.30),rgba(212,0,85,.16) 55%,rgba(255,140,0,.12))' }}>
          <span className="pointer-events-none absolute -top-40 -right-20 w-[26rem] h-[26rem] rounded-full blur-3xl" style={{ background: 'radial-gradient(circle,rgba(255,140,0,.28),transparent 66%)' }} />
          <div className="relative text-[11px] font-black uppercase tracking-[0.3em] text-[#FF8C00] mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>Ready in minutes</div>
          <h2 className="relative font-black italic uppercase leading-[0.9] tracking-[-0.03em]" style={{ fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(30px,5vw,58px)' }}>
            Run your business<br />on Plajah
          </h2>
          <p className="relative text-white/65 text-[16px] mt-5 max-w-xl mx-auto">
            Set up your page, switch on the tools you need, and start selling today. No contracts, no setup fee, and your payouts go straight to your bank.
          </p>
          <div className="relative mt-8 flex flex-wrap gap-3 justify-center">
            <button
              onClick={startBusiness}
              className="flex items-center gap-2.5 h-14 px-7 rounded-full text-[15px] font-black tracking-tight text-white hover:-translate-y-0.5 transition-transform"
              style={{ fontFamily: 'Outfit, sans-serif', background: 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)', boxShadow: '0 10px 34px rgba(212,0,85,.36)' }}
            >
              <ArrowRight size={18} /> Start free
            </button>
            <button
              onClick={() => handleVisitBusiness(DEMO_BUSINESS)}
              className="flex items-center gap-2.5 h-14 px-7 rounded-full text-[15px] font-black tracking-tight bg-white/[0.06] border border-white/15 text-white hover:bg-white/10 transition-all"
              style={{ fontFamily: 'Outfit, sans-serif' }}
            >
              <Play size={16} /> See the demo shop
            </button>
          </div>
          <div className="relative mt-5">
            <button onClick={() => onNavigate('PRAXIS')} className="inline-flex items-center gap-2 text-[12px] font-bold text-white/50 hover:text-white transition-colors">
              <AriaMark size={14} petals={false} /> Prefer to learn as you build? Start with Aria
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default PlajahBusinessHub;
