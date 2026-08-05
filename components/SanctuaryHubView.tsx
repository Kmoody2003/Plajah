import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Shield, Users, Sparkles, ArrowRight,
  Music2, Palette, Gamepad2, Mic2, BookOpen,
  Camera, Video, Crown, Zap, Globe, Search, X, ChevronLeft,
} from 'lucide-react';
import { UserProfile, SanctuaryTier } from '../types';
import { searchUsers } from '../services/backendService';
import { fetchCreatorTiers } from '../services/sanctuaryService';
import { SANCTUARY_THEME, SanctuaryBadge } from './sanctuary/SanctuaryIdentity';

interface SanctuaryHubViewProps {
  onBack?: () => void;
  onVisitProfile: (userId: string) => void;
  onOpenDemo?: () => void;
  currentUserId?: string;
  currentUserProfile?: UserProfile;
}

// ── CATEGORIES ─────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: 'ALL', label: 'All Creators', icon: Globe },
  { id: 'MUSIC', label: 'Music', icon: Music2 },
  { id: 'ART', label: 'Art & Design', icon: Palette },
  { id: 'GAMING', label: 'Gaming', icon: Gamepad2 },
  { id: 'PODCAST', label: 'Podcasts', icon: Mic2 },
  { id: 'WRITING', label: 'Writing', icon: BookOpen },
  { id: 'PHOTO', label: 'Photography', icon: Camera },
  { id: 'VIDEO', label: 'Video', icon: Video },
];

// ── TIER BADGE ─────────────────────────────────────────────────────────────────

const TierBadge: React.FC<{ tier: SanctuaryTier }> = ({ tier }) => (
  <div
    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-widest whitespace-nowrap"
    style={{ background: tier.color + '22', color: tier.color, border: `1px solid ${tier.color}44` }}
  >
    <span>{tier.iconEmoji}</span>
    <span>{tier.name}</span>
    <span className="opacity-60">${tier.price}/mo</span>
  </div>
);

// ── CREATOR CARD ───────────────────────────────────────────────────────────────

interface CreatorCardData {
  profile: UserProfile;
  tiers: SanctuaryTier[];
}

const CreatorCard: React.FC<{ data: CreatorCardData; onClick: () => void }> = ({ data, onClick }) => {
  const { profile, tiers } = data;
  const activeTiers = tiers.filter(t => t.isActive).sort((a, b) => a.price - b.price);
  const lowestTier = activeTiers[0];
  const totalMembers = activeTiers.reduce((s, t) => s + t.memberCount, 0);

  return (
    <motion.div
      whileHover={{ y: -4, scale: 1.015 }}
      onClick={onClick}
      className="relative border border-white/10 rounded-[2rem] overflow-hidden cursor-pointer bg-white/[0.04] hover:border-white/20 transition-all group"
    >
      {/* Cover */}
      <div className="h-28 relative overflow-hidden">
        <div
          className="absolute inset-0 transition-transform duration-500 group-hover:scale-105"
          style={{ background: SANCTUARY_THEME.heroGradient }}
        />
        {profile.photoURL && (
          <img src={profile.photoURL} alt="" className="absolute inset-0 w-full h-full object-cover opacity-20 group-hover:opacity-30 transition-opacity" />
        )}
        <div className="absolute inset-0" style={{ background: SANCTUARY_THEME.goldSheen }} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 to-transparent" />

        <div className="absolute top-3 left-3"><SanctuaryBadge size="sm" /></div>

        {/* Member count badge */}
        {totalMembers > 0 && (
          <div className="absolute top-3 right-3 flex items-center gap-1 px-2.5 py-1 bg-black/60 backdrop-blur-sm rounded-full border border-white/10">
            <Users size={9} className="text-white/60" />
            <span className="text-[8px] font-black text-white/60">{totalMembers}</span>
          </div>
        )}
      </div>

      <div className="px-4 pb-4">
        {/* Avatar + price row */}
        <div className="-mt-8 mb-2 flex items-end justify-between">
          <div className="w-14 h-14 rounded-xl border-2 border-black overflow-hidden bg-white/10 flex-shrink-0 shadow-xl">
            {profile.photoURL
              ? <img src={profile.photoURL} alt={profile.displayName} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-xl font-black">{profile.displayName?.[0]}</div>
            }
          </div>
          {lowestTier && (
            <div className="text-right">
              <div className="text-lg font-black" style={{ color: lowestTier.color }}>
                ${lowestTier.price}<span className="text-[8px] text-white/30 font-bold">/mo</span>
              </div>
            </div>
          )}
        </div>

        <h3 className="text-xs font-black uppercase tracking-tight truncate mb-0.5">{profile.displayName}</h3>
        {profile.bio && <p className="text-[9px] text-white/30 line-clamp-2 mb-2 leading-relaxed">{profile.bio}</p>}

        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center gap-1 text-[8px] text-white/20">
            <Crown size={8} />{activeTiers.length} tier{activeTiers.length !== 1 ? 's' : ''}
          </div>
        </div>

        {activeTiers.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {activeTiers.slice(0, 2).map(t => <TierBadge key={t.id} tier={t} />)}
          </div>
        )}

        <button
          className="w-full py-2.5 rounded-xl flex items-center justify-center gap-1.5 text-[9px] font-black uppercase tracking-widest transition-all hover:brightness-110"
          style={{ color: SANCTUARY_THEME.goldSoft, background: SANCTUARY_THEME.goldSheen, border: `1px solid ${SANCTUARY_THEME.line}` }}
          onClick={onClick}
        >
          <Shield size={11} /> Enter Sanctuary <ArrowRight size={10} />
        </button>
      </div>
    </motion.div>
  );
};

// ── HOW IT WORKS ────────────────────────────────────────────────────────────────

const HOW_IT_WORKS = [
  { icon: Search, title: 'Discover Creators', body: 'Browse artists, writers, gamers, and more across every category.' },
  { icon: Crown, title: 'Choose Your Tier', body: 'Pick a membership level that fits your budget. Cancel anytime.' },
  { icon: Shield, title: 'Unlock Exclusives', body: 'Get exclusive content, private chats, member badges, and more.' },
];

// ── MAIN COMPONENT ─────────────────────────────────────────────────────────────

const SanctuaryHubView: React.FC<SanctuaryHubViewProps> = ({
  onBack,
  onVisitProfile,
  onOpenDemo,
  currentUserId,
}) => {
  const [creators, setCreators] = useState<CreatorCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('ALL');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const loadCreators = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const users = await searchUsers(query || 'a');
      const artistUsers = users.filter(u => u.isArtist || (u.followerCount ?? 0) > 0).slice(0, 32);
      const withTiers = await Promise.all(
        artistUsers.map(async (profile) => {
          try {
            const tiers = await fetchCreatorTiers(profile.uid);
            return { profile, tiers };
          } catch {
            return { profile, tiers: [] };
          }
        })
      );
      const sorted = withTiers.sort((a, b) => {
        const aM = a.tiers.reduce((s, t) => s + t.memberCount, 0);
        const bM = b.tiers.reduce((s, t) => s + t.memberCount, 0);
        return bM - aM;
      });
      setCreators(sorted);
    } catch {
      setCreators([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadCreators(''); }, []);

  const handleSearch = () => {
    setSearchQuery(searchInput);
    loadCreators(searchInput || 'a');
  };

  const displayCreators = creators.filter(c =>
    !searchQuery || c.profile.displayName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-black text-white">

      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/50 via-black to-black" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-600/15 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-pink-600/10 rounded-full blur-[80px] pointer-events-none" />

        <div className="relative z-10 px-6 pt-14 pb-14 max-w-7xl mx-auto">
          {onBack && (
            <button onClick={onBack} className="flex items-center gap-2 text-white/40 hover:text-white text-xs font-black uppercase tracking-widest transition-all mb-8">
              <ChevronLeft size={16} /> Back
            </button>
          )}
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center shadow-2xl shadow-purple-900">
              <Shield size={20} className="text-white" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-purple-400">Sanctuary</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-black uppercase tracking-tightest leading-none mb-3">
            Support the<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
              Creators You Love
            </span>
          </h1>
          <p className="text-sm text-white/40 max-w-md leading-relaxed mb-8">
            Exclusive content, behind-the-scenes access, private chats, and more. Join the inner circle of your favorite artists and creators.
          </p>

          {/* Search */}
          <div className="flex items-center gap-2 max-w-sm bg-white/5 border border-white/10 rounded-2xl px-4 py-3 focus-within:border-purple-500/50 transition-all">
            <Search size={15} className="text-white/30 flex-shrink-0" />
            <input
              type="text"
              placeholder="Search creators…"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="flex-1 bg-transparent text-sm outline-none placeholder-white/20"
            />
            {searchInput && (
              <button onClick={() => { setSearchInput(''); setSearchQuery(''); loadCreators('a'); }}>
                <X size={13} className="text-white/30 hover:text-white" />
              </button>
            )}
            <button onClick={handleSearch} className="px-3 py-1.5 bg-purple-600 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-purple-500 transition-all">
              Search
            </button>
          </div>
        </div>
      </div>

      {/* ── BODY ──────────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-6 py-10">

        {/* Category filter + Become a creator CTA row */}
        <div className="flex items-center justify-between gap-4 mb-8 flex-wrap">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
            {CATEGORIES.map(cat => {
              const Icon = cat.icon;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest whitespace-nowrap transition-all flex-shrink-0 ${activeCategory === cat.id ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/40' : 'bg-white/5 text-white/30 hover:bg-white/10 border border-white/5'}`}
                >
                  <Icon size={10} /> {cat.label}
                </button>
              );
            })}
          </div>

          {currentUserId && (
            <button
              onClick={() => onVisitProfile(currentUserId)}
              className="flex items-center gap-1.5 px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shadow-lg shadow-purple-900 flex-shrink-0"
            >
              <Zap size={12} /> Start Your Sanctuary
            </button>
          )}
        </div>

        {/* Creator grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-white/5 border border-white/5 rounded-[2rem] h-64 animate-pulse" />
            ))}
          </div>
        ) : displayCreators.length === 0 ? (
          <div className="py-24 text-center border border-white/5 rounded-[2rem] bg-white/[0.02]">
            <Shield size={40} className="mx-auto mb-4 text-white/10" />
            <p className="text-sm font-black uppercase tracking-widest text-white/20">No creators found</p>
            <p className="text-[10px] text-white/10 mt-2">Try a different search or category</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {onOpenDemo && (
              <button onClick={onOpenDemo}
                className="relative flex flex-col text-left rounded-[2rem] overflow-hidden group transition-all hover:brightness-110"
                style={{ background: SANCTUARY_THEME.heroGradient, border: `1px solid ${SANCTUARY_THEME.line}` }}>
                <div className="h-28 relative overflow-hidden">
                  <div className="absolute inset-0" style={{ background: SANCTUARY_THEME.goldSheen }} />
                  <div className="absolute top-3 left-3"><SanctuaryBadge size="sm" label="Demo" /></div>
                </div>
                <div className="px-4 pb-4 -mt-8 relative">
                  <div className="w-14 h-14 rounded-xl border-2 border-black overflow-hidden shadow-xl" style={{ background: SANCTUARY_THEME.panel }}>
                    <div className="w-full h-full flex items-center justify-center text-2xl">◈</div>
                  </div>
                  <h3 className="text-xs font-black uppercase tracking-tight mt-2 mb-0.5" style={{ color: SANCTUARY_THEME.goldSoft }}>See a Sanctuary in action</h3>
                  <p className="text-[9px] text-white/40 leading-relaxed mb-3">Tour tiers, gated posts, a live campaign &amp; more — then build your own.</p>
                  <span className="inline-block w-full text-center py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest text-black" style={{ background: SANCTUARY_THEME.gold }}>Explore demo →</span>
                </div>
              </button>
            )}
            <AnimatePresence>
              {displayCreators.map((data, i) => (
                <motion.div
                  key={data.profile.uid}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: i * 0.03 }}
                >
                  <CreatorCard
                    data={data}
                    onClick={() => onVisitProfile(data.profile.uid)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* ── HOW IT WORKS ──────────────────────────────────────────────────── */}
      <div className="px-6 max-w-7xl mx-auto pb-20 mt-8">
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-[3rem] p-10">
          <div className="flex items-center gap-3 mb-10 justify-center">
            <Sparkles size={18} className="text-purple-400" />
            <h2 className="text-xl font-black uppercase tracking-tightest text-center">How Sanctuary Works</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {HOW_IT_WORKS.map((step, i) => {
              const Icon = step.icon;
              return (
                <div key={i} className="flex flex-col items-center text-center gap-4">
                  <div className="w-12 h-12 bg-purple-600/20 border border-purple-500/30 rounded-2xl flex items-center justify-center">
                    <Icon size={20} className="text-purple-400" />
                  </div>
                  <div>
                    <div className="text-[9px] font-black uppercase tracking-widest text-white/25 mb-1">Step {i + 1}</div>
                    <h3 className="text-xs font-black uppercase tracking-tight mb-2">{step.title}</h3>
                    <p className="text-[10px] text-white/30 leading-relaxed">{step.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SanctuaryHubView;
