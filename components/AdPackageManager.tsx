import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Zap, Star, Trophy, Rocket, Globe, TrendingUp, Clock, Check,
  BarChart3, Radio, RefreshCw, ExternalLink
} from 'lucide-react';
import { UserProfile } from '../types';
import { auth } from '../services/firebase';
import { AD_PACKAGES, OFF_PLATFORM_PACKAGES, purchaseAdPackage, purchaseOffPlatformPromotion } from '../services/stripeService';
import { recalculateBoostProfile, SUBSCRIPTION_BOOST_PCT, ACTIVITY_SCORE } from '../services/adAlgorithmService';
import { fetchMySubscription } from '../services/subscriptionService';

// ── Package card ──────────────────────────────────────────────────────────────

const PACKAGE_ICONS = { BASIC: Star, FEATURED: Zap, PREMIUM: Rocket, MAXIMUM: Trophy };
const PACKAGE_COLORS = { BASIC: '#FF8C00', FEATURED: '#6B0099', PREMIUM: '#D40055', MAXIMUM: '#FFD166' };

const PackageCard: React.FC<{
  pkg: typeof AD_PACKAGES[number];
  onBuy: (type: string) => void;
  loading: boolean;
}> = ({ pkg, onBuy, loading }) => {
  const Icon = PACKAGE_ICONS[pkg.type];
  const color = PACKAGE_COLORS[pkg.type];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative bg-white/[0.04] border border-white/[0.07] rounded-3xl p-6 overflow-hidden hover:border-white/20 transition-all"
    >
      <div className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-10 blur-2xl" style={{ background: color }} />
      <div className="flex items-start justify-between mb-4">
        <div className="p-3 rounded-2xl" style={{ background: `${color}20` }}>
          <Icon size={18} style={{ color }} />
        </div>
        <span className="text-[10px] font-black text-white/40 bg-white/5 px-2 py-1 rounded-full uppercase tracking-widest">
          {pkg.days}d
        </span>
      </div>
      <h3 className="text-base font-black text-white mb-1">{pkg.label}</h3>
      <p className="text-xs text-white/40 mb-4 leading-relaxed">{pkg.description}</p>
      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center gap-1.5 px-2 py-1 bg-white/5 rounded-full">
          <TrendingUp size={10} style={{ color }} />
          <span className="text-[9px] font-black" style={{ color }}>{pkg.boostMultiplier}× boost</span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1 bg-white/5 rounded-full">
          <Clock size={10} className="text-white/30" />
          <span className="text-[9px] text-white/40">{pkg.days} days</span>
        </div>
      </div>
      <button
        onClick={() => onBuy(pkg.type)}
        disabled={loading}
        className="w-full py-3 rounded-2xl text-xs font-black uppercase tracking-widest text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
        style={{ background: `linear-gradient(135deg, ${color}AA, ${color})` }}
      >
        {loading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" /> : `$${pkg.price}/boost`}
      </button>
    </motion.div>
  );
};

// ── Boost Score Visualizer ────────────────────────────────────────────────────

const BoostDisplay: React.FC<{ score: number; label: string; color: string; max?: number }> = ({
  score, label, color, max = 100
}) => (
  <div className="space-y-1.5">
    <div className="flex items-center justify-between">
      <p className="text-[9px] font-black uppercase tracking-widest text-white/40">{label}</p>
      <p className="text-xs font-black" style={{ color }}>{score.toFixed(1)}</p>
    </div>
    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${Math.min((score / max) * 100, 100)}%`, background: color }}
      />
    </div>
  </div>
);

// ── Main Component ────────────────────────────────────────────────────────────

interface AdPackageManagerProps {
  currentUser: UserProfile;
}

const AdPackageManager: React.FC<AdPackageManagerProps> = ({ currentUser }) => {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [boostProfile, setBoostProfile] = useState<any>(null);
  const [subTier, setSubTier] = useState<1 | 2 | 3 | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    setRefreshing(true);
    try {
      const [sub, profile] = await Promise.all([
        fetchMySubscription(),
        recalculateBoostProfile(currentUser.uid, null),
      ]);
      if (sub?.status === 'active') setSubTier(sub.tier);
      setBoostProfile(profile);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => { loadData(); }, [currentUser.uid]);

  const handleBuyPackage = async (packageType: string) => {
    const user = auth.currentUser;
    if (!user) { setError('Please sign in'); return; }
    setLoading(packageType);
    setError(null);
    try {
      const token = await user.getIdToken();
      await purchaseAdPackage({ packageType, userIdToken: token });
    } catch (e: any) {
      setError(e.message);
      setLoading(null);
    }
  };

  const handleBuyOffPlatform = async (tier: 'STANDARD' | 'PREMIUM') => {
    const user = auth.currentUser;
    if (!user) { setError('Please sign in'); return; }
    setLoading(`off_${tier}`);
    setError(null);
    try {
      const token = await user.getIdToken();
      await purchaseOffPlatformPromotion({ tier, userIdToken: token });
    } catch (e: any) {
      setError(e.message);
      setLoading(null);
    }
  };

  const tierBoost = subTier ? SUBSCRIPTION_BOOST_PCT[subTier] : 0;

  return (
    <div className="space-y-10 pb-16">
      {/* Header */}
      <div>
        <h1 className="text-5xl md:text-[6rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">
          Promotion
        </h1>
        <p className="text-white/40 text-sm font-bold uppercase tracking-widest mt-4">
          Boost your visibility on and off the Plajah platform
        </p>
      </div>

      {/* Your Boost Profile */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/[0.04] border border-white/[0.07] rounded-3xl p-6"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-sm font-black uppercase tracking-widest text-white">Your Boost Profile</h2>
          <button
            onClick={loadData}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-full text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-all"
          >
            <RefreshCw size={10} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {boostProfile ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-[#D40055]/10 to-[#FF8C00]/10 border border-[#D40055]/20 rounded-2xl">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Total Boost Score</p>
                <p className="text-3xl font-black text-white">{boostProfile.totalBoostScore.toFixed(1)}</p>
              </div>
              <Zap size={32} className="text-[#FF8C00]" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <BoostDisplay score={boostProfile.activityScore} label="Activity Score" color="#00B4D8" />
              <BoostDisplay score={tierBoost} label="Subscription Boost" color="#6B0099" max={50} />
              <BoostDisplay score={boostProfile.achievementBoostMultiplier} label="Achievement Boost" color="#FFD166" max={30} />
              <BoostDisplay score={(boostProfile.activeAdPackageBoost - 1) * 100} label="Package Boost" color="#D40055" max={500} />
            </div>

            <div className="mt-4 p-4 bg-white/5 rounded-2xl">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-2">How to earn activity points</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: 'Post', points: 1, cap: '20/day' },
                  { label: 'Video', points: 10, cap: 'Unlimited' },
                  { label: 'Photo', points: 5, cap: 'Unlimited' },
                  { label: 'New Release', points: 25, cap: 'Unlimited' },
                ].map(item => (
                  <div key={item.label} className="bg-white/5 rounded-xl p-2.5 text-center">
                    <p className="text-xs font-black text-white">{item.label}</p>
                    <p className="text-lg font-black text-[#FF8C00]">+{item.points}</p>
                    <p className="text-[8px] text-white/30">{item.cap}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-white/30">
            <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
            <span className="text-xs">Loading boost profile…</span>
          </div>
        )}
      </motion.div>

      {/* Ad System Overview */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { pct: 50, label: 'Creator Promotion', desc: 'Slots reserved for on-platform user promotion', color: '#D40055' },
          { pct: 20, label: 'Content Partners', desc: 'Plajah content partner promotional slots', color: '#6B0099' },
          { pct: 30, label: 'Third-Party Ads', desc: 'External brand and agency advertisements', color: '#FF8C00' },
        ].map(item => (
          <div key={item.label} className="bg-white/[0.04] border border-white/[0.07] rounded-2xl p-4 text-center">
            <p className="text-3xl font-black" style={{ color: item.color }}>{item.pct}%</p>
            <p className="text-[9px] font-black uppercase tracking-widest text-white/60 mt-1">{item.label}</p>
            <p className="text-[8px] text-white/30 mt-1 leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </div>

      {/* On-Platform Ad Packages */}
      <div>
        <h2 className="text-sm font-black uppercase tracking-widest text-white mb-2">On-Platform Ad Packages</h2>
        <p className="text-xs text-white/40 mb-6">
          All new content releases are automatically promoted. Ad packages buy more aggressive, featured placements and higher priority in discovery.
        </p>
        {error && <p className="text-xs text-red-400 mb-4">{error}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {AD_PACKAGES.map(pkg => (
            <PackageCard
              key={pkg.type}
              pkg={pkg}
              onBuy={handleBuyPackage}
              loading={loading === pkg.type}
            />
          ))}
        </div>
      </div>

      {/* Subscription Tier Boost Info */}
      {subTier && (
        <div className="p-6 bg-[#6B0099]/10 border border-[#6B0099]/30 rounded-3xl">
          <div className="flex items-center gap-3 mb-3">
            <BarChart3 size={18} className="text-[#6B0099]" />
            <h3 className="text-sm font-black text-white">Your Plajah+ Boost is Active</h3>
          </div>
          <p className="text-xs text-white/50 leading-relaxed">
            Your Tier {subTier} subscription gives you a <span className="text-white font-black">+{tierBoost}% boost</span> over the baseline allocation across the 50% user promotion slot pool.
            When two users compete for the same placement, activity score and most recent release are used to resolve ties.
          </p>
        </div>
      )}

      {/* Off-Platform Promotion */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <Globe size={18} className="text-[#FF8C00]" />
          <h2 className="text-sm font-black uppercase tracking-widest text-white">Off-Platform Promotion</h2>
        </div>
        <p className="text-xs text-white/40 mb-6">
          Plajah promotes your brand and content beyond the platform — digital ads, social campaigns, and real-world digital billboard placements. Random creators are featured for free; paid placement guarantees your spot.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {OFF_PLATFORM_PACKAGES.map(pkg => (
            <motion.div
              key={pkg.tier}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white/[0.04] border border-white/[0.07] rounded-3xl p-6"
            >
              <div className="flex items-start justify-between mb-4">
                <Globe size={20} className={pkg.tier === 'PREMIUM' ? 'text-[#FFD166]' : 'text-[#FF8C00]'} />
                {pkg.tier === 'PREMIUM' && (
                  <span className="text-[8px] font-black uppercase tracking-widest text-[#FFD166] bg-[#FFD166]/10 px-2 py-1 rounded-full">
                    Includes Billboards
                  </span>
                )}
              </div>
              <h3 className="text-base font-black text-white mb-1">{pkg.label}</h3>
              <p className="text-xs text-white/40 mb-4 leading-relaxed">{pkg.description}</p>
              <div className="text-3xl font-black text-white mb-1">${pkg.price}<span className="text-base text-white/40">/mo</span></div>
              <button
                onClick={() => handleBuyOffPlatform(pkg.tier)}
                disabled={loading === `off_${pkg.tier}`}
                className="w-full mt-4 py-3 rounded-2xl text-xs font-black uppercase tracking-widest text-white bg-gradient-to-r from-[#FF8C00] to-[#D40055] hover:scale-[1.02] transition-all"
              >
                {loading === `off_${pkg.tier}` ? '…' : `Get ${pkg.tier === 'PREMIUM' ? 'Premium' : 'Standard'} — $${pkg.price}/mo`}
              </button>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Achievement Boosts */}
      <div className="p-6 bg-white/[0.04] border border-white/[0.07] rounded-3xl">
        <div className="flex items-center gap-3 mb-4">
          <Trophy size={18} className="text-[#FFD166]" />
          <h3 className="text-sm font-black uppercase tracking-widest text-white">Achievement Boosts</h3>
        </div>
        <p className="text-xs text-white/40 mb-4">Earn achievements to unlock automatic time-limited ad boosts.</p>
        <div className="grid grid-cols-3 gap-3">
          {[
            { level: 'Easy', boost: '+10%', duration: '1 Day', color: '#06D6A0' },
            { level: 'Medium', boost: '+20%', duration: '1 Week', color: '#FF8C00' },
            { level: 'Hard', boost: '+30%', duration: '1 Month', color: '#D40055' },
          ].map(item => (
            <div key={item.level} className="p-3 bg-white/5 rounded-2xl text-center">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/40">{item.level}</p>
              <p className="text-lg font-black mt-1" style={{ color: item.color }}>{item.boost}</p>
              <p className="text-[9px] text-white/30">{item.duration}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdPackageManager;
