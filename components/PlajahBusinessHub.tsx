import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Store, Building2, Search, Briefcase, ShoppingBag, Radio, Monitor,
  Star, Users, Globe, MapPin, Tag, ArrowRight, CheckCircle2, Sparkles,
  Music2, ChevronRight, Gift, Zap,
} from 'lucide-react';
import { BusinessPage, BrandAccount, UserProfile } from '../types';
import { fetchAllBusinessPages } from '../services/businessService';
import { fetchAllPublicBrandAccounts } from '../services/backendService';
import { DEMO_BUSINESS } from '../data/demoBusiness';

type HubTab = 'BUSINESSES' | 'BRANDS';

const TYPE_LABELS: Record<string, string> = {
  RETAIL:        'Retail',
  RESTAURANT:    'Restaurant',
  SERVICE:       'Service',
  ENTERTAINMENT: 'Entertainment',
  TECH:          'Tech',
  HEALTH:        'Health & Wellness',
  OTHER:         'Business',
};

const TYPE_COLORS: Record<string, string> = {
  RETAIL:        '#FF8C00',
  RESTAURANT:    '#D40055',
  SERVICE:       '#6B0099',
  ENTERTAINMENT: '#00B4D8',
  TECH:          '#06D6A0',
  HEALTH:        '#FFD166',
  OTHER:         '#ffffff40',
};

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
    if (!q) return businesses;
    return businesses.filter(b =>
      b.businessName.toLowerCase().includes(q) ||
      b.description?.toLowerCase().includes(q) ||
      b.city?.toLowerCase().includes(q) ||
      b.businessType?.toLowerCase().includes(q)
    );
  }, [businesses, search]);

  const filteredBrands = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return brands;
    return brands.filter(b =>
      b.name.toLowerCase().includes(q) ||
      b.description?.toLowerCase().includes(q)
    );
  }, [brands, search]);

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

  return (
    <div className="min-h-screen bg-black/40 text-white">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-white/[0.06] px-6 py-5">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3 flex-1">
            <div className="p-2.5 rounded-2xl bg-gradient-to-br from-[#FF8C00]/20 to-[#D40055]/20 border border-white/10">
              <Briefcase size={18} className="text-[#FF8C00]" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight">Plajah Business</h1>
              <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Business &amp; Brand Directory</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                type="text"
                placeholder="Search businesses &amp; brands..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-56 sm:w-72 bg-white/[0.05] border border-white/10 rounded-2xl py-2.5 pl-9 pr-4 text-[10px] font-bold outline-none focus:border-white/30 transition-all placeholder:text-white/20"
              />
            </div>

            {isLoggedIn && (
              <button
                onClick={() => onNavigate('BUSINESS_DASHBOARD')}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#FF8C00] text-black rounded-2xl text-[9px] font-black uppercase tracking-widest hover:scale-105 transition-all whitespace-nowrap"
              >
                <Briefcase size={11} /> My Dashboard
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-6xl mx-auto mt-4 flex gap-2">
          {([
            { id: 'BUSINESSES' as HubTab, label: `Businesses (${businesses.length})`, icon: Store },
            { id: 'BRANDS' as HubTab, label: `Brands (${brands.length})`, icon: Building2 },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all ${
                tab === t.id ? 'bg-white text-black' : 'bg-white/5 text-white/40 hover:text-white border border-white/10'
              }`}
            >
              <t.icon size={11} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-32">
            <div className="w-8 h-8 border-2 border-white/10 border-t-[#FF8C00] rounded-full animate-spin" />
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {tab === 'BUSINESSES' && (
              <motion.div
                key="businesses"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {/* Demo Business Spotlight */}
                {!search && (
                  <motion.div
                    className="mb-8 relative overflow-hidden rounded-3xl cursor-pointer group"
                    onClick={() => handleVisitBusiness(DEMO_BUSINESS)}
                    whileTap={{ scale: 0.99 }}
                  >
                    {/* Background */}
                    <div className="absolute inset-0">
                      <img
                        src={DEMO_BUSINESS.coverUrl}
                        alt=""
                        className="w-full h-full object-cover scale-105 group-hover:scale-110 transition-transform duration-700"
                      />
                      <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-black/30" />
                    </div>

                    <div className="relative z-10 p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center gap-5">
                      {/* Logo */}
                      <img
                        src={DEMO_BUSINESS.logoUrl}
                        alt=""
                        className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border-2 border-white/20 shadow-2xl flex-shrink-0"
                      />

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                            Demo Business
                          </span>
                          <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-[#FF8C00]">
                            <CheckCircle2 size={9} /> Verified
                          </span>
                        </div>
                        <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">{DEMO_BUSINESS.businessName}</h2>
                        <p className="text-white/60 text-xs mt-1 line-clamp-1">{DEMO_BUSINESS.tagline}</p>
                        <div className="flex flex-wrap gap-2 mt-3">
                          {DEMO_BUSINESS.radioServiceEnabled && (
                            <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-1 bg-white/5 border border-white/10 rounded-full text-white/50">
                              <Radio size={8} /> In-Store Radio
                            </span>
                          )}
                          {DEMO_BUSINESS.digitalSignageEnabled && (
                            <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-1 bg-white/5 border border-white/10 rounded-full text-white/50">
                              <Monitor size={8} /> Digital Signage
                            </span>
                          )}
                          {DEMO_BUSINESS.rewardsEnabled && (
                            <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-1 bg-white/5 border border-white/10 rounded-full text-white/50">
                              <Gift size={8} /> Loyalty Rewards
                            </span>
                          )}
                          {DEMO_BUSINESS.isAcceptingOrders && (
                            <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-1 bg-white/5 border border-white/10 rounded-full text-white/50">
                              <ShoppingBag size={8} /> Online Orders
                            </span>
                          )}
                        </div>
                      </div>

                      {/* CTA */}
                      <div className="flex-shrink-0">
                        <div className="flex items-center gap-2 px-5 py-3 bg-[#FF8C00] text-black rounded-2xl text-xs font-black uppercase tracking-widest group-hover:bg-amber-400 transition-colors">
                          View Demo <ChevronRight size={14} />
                        </div>
                        <p className="text-white/30 text-[9px] text-center mt-2">See how your page could look</p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Section label */}
                {!search && businesses.length > 0 && (
                  <div className="flex items-center gap-3 mb-5">
                    <div className="h-px flex-1 bg-white/5" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-white/20">All Businesses</span>
                    <div className="h-px flex-1 bg-white/5" />
                  </div>
                )}

                {filteredBusinesses.length === 0 && !search ? (
                  <div className="text-center py-16 bg-white/[0.02] rounded-[3rem] border border-dashed border-white/10">
                    <Store size={48} className="mx-auto mb-4 opacity-20" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/20 mb-2">
                      No businesses listed yet
                    </p>
                    {isLoggedIn && (
                      <button
                        onClick={() => onNavigate('BUSINESS_DASHBOARD')}
                        className="mt-3 text-[#FF8C00] text-xs font-bold hover:underline"
                      >
                        Create your business page →
                      </button>
                    )}
                  </div>
                ) : filteredBusinesses.length === 0 ? (
                  <div className="text-center py-32 bg-white/[0.02] rounded-[3rem] border border-dashed border-white/10">
                    <Store size={48} className="mx-auto mb-4 opacity-20" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/20">
                      No businesses match your search
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredBusinesses.map((page, i) => (
                      <motion.div key={page.id} transition={{ delay: i * 0.04 }}>
                        <BusinessCard page={page} onClick={() => handleVisitBusiness(page)} />
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {tab === 'BRANDS' && (
              <motion.div
                key="brands"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
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
      </div>
    </div>
  );
};

export default PlajahBusinessHub;
