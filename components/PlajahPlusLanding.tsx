import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Zap, Check, Crown, Star, Music, Video, Radio, Shield, Cloud,
  Users, Gift, ShoppingBag, Tv, ArrowRight, X, ChevronDown, ChevronUp
} from 'lucide-react';
import { TIER_META, startSubscriptionCheckout } from '../services/stripeService';
import { listenToMySubscription } from '../services/subscriptionService';
import { auth } from '../services/firebase';
import { PlajahPlusSubscription } from '../types';
import Logo from './Logo';

interface PlajahPlusLandingProps {
  onClose?: () => void;
  defaultCreatorId?: string;
  defaultCreatorName?: string;
  isMorphMode?: boolean;
}

// ── Tier badge colors ─────────────────────────────────────────────────────────

const TIER_GRADIENT = {
  1: 'from-[#FF8C00] via-[#FF6B00] to-[#FF4500]',
  2: 'from-[#6B0099] via-[#8B00CC] to-[#A020F0]',
  3: 'from-[#D40055] via-[#E8004D] to-[#FF0066]',
} as const;

const TIER_GLOW = {
  1: 'rgba(255,140,0,0.4)',
  2: 'rgba(107,0,153,0.4)',
  3: 'rgba(212,0,85,0.5)',
} as const;

const TIER_ICONS = {
  1: Star,
  2: Crown,
  3: Zap,
} as const;

// ── FAQ ───────────────────────────────────────────────────────────────────────

const FAQ = [
  {
    q: 'What is Plajah+?',
    a: 'Plajah+ is our subscription program that lets you support your favorite creator while unlocking exclusive benefits — discounts, storage, points, early access, and more.'
  },
  {
    q: 'What is Plajah+Morph?',
    a: 'Morph mode lets your subscription support up to 3 creators simultaneously, or rotate to random creators each month. Sign up through the Club page or platform subscription page (not a creator\'s profile) to get Morph mode.'
  },
  {
    q: 'Can I change which creator I support?',
    a: 'Yes — but switching to a different creator (rebinding) costs $2.99. To avoid this fee entirely, use Plajah+Morph which gives you full flexibility at no extra charge.'
  },
  {
    q: 'How much do creators earn?',
    a: 'Tier 1 creators get $3.00, Tier 2 get $7.00, and Tier 3 get $11.00 per subscriber per month. Creators can split their share with up to 3 other creators, charities, or clubs — but always keep at least $1.00 of their share.'
  },
  {
    q: 'What happens to my subscription if a creator leaves?',
    a: 'If your bound creator deactivates their account, your subscription will be moved to the platform general pool and your benefits will remain active until your next billing cycle, where you can rebind free of charge.'
  },
  {
    q: 'What if I\'m a creator who subscribes?',
    a: 'Artists who subscribe must direct their creator share to another artist on the platform, or choose random distribution — your share will never go back to yourself.'
  },
  {
    q: 'How are Plajah Points earned and used?',
    a: 'Points accumulate through posting (1pt, cap 20/day), uploading videos (10pts), photos (5pts/post), and new releases (25pts). You also get monthly points from your subscription. Points can be redeemed for ad boosts, in-app purchases, and more.'
  },
];

// ── Feature comparison icons ──────────────────────────────────────────────────

const FeatureIcon: React.FC<{ label: string }> = ({ label }) => {
  if (label.toLowerCase().includes('radio')) return <Radio size={14} className="text-white/40" />;
  if (label.toLowerCase().includes('video') || label.toLowerCase().includes('tv')) return <Tv size={14} className="text-white/40" />;
  if (label.toLowerCase().includes('storage')) return <Cloud size={14} className="text-white/40" />;
  if (label.toLowerCase().includes('merch') || label.toLowerCase().includes('store')) return <ShoppingBag size={14} className="text-white/40" />;
  if (label.toLowerCase().includes('point')) return <Zap size={14} className="text-white/40" />;
  if (label.toLowerCase().includes('sanctuary')) return <Shield size={14} className="text-white/40" />;
  if (label.toLowerCase().includes('boost') || label.toLowerCase().includes('promot')) return <Star size={14} className="text-white/40" />;
  return <Check size={14} className="text-white/40" />;
};

// ── Main Component ────────────────────────────────────────────────────────────

const PlajahPlusLanding: React.FC<PlajahPlusLandingProps> = ({
  onClose,
  defaultCreatorId,
  defaultCreatorName,
  isMorphMode = false,
}) => {
  const [selectedTier, setSelectedTier] = useState<1 | 2 | 3>(2);
  const [morphMode, setMorphMode] = useState<'SPLIT' | 'RANDOM'>('SPLIT');
  const [morphCreatorIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSub, setActiveSub] = useState<PlajahPlusSubscription | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    return listenToMySubscription(setActiveSub);
  }, []);

  const handleSubscribe = async () => {
    const user = auth.currentUser;
    if (!user) {
      setError('Please sign in to subscribe.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const token = await user.getIdToken();
      await startSubscriptionCheckout({
        tier: selectedTier,
        isMorph: isMorphMode,
        boundCreatorId: !isMorphMode ? defaultCreatorId : undefined,
        morphCreatorIds: isMorphMode && morphMode === 'SPLIT' ? morphCreatorIds : undefined,
        morphMode: isMorphMode ? morphMode : undefined,
        userIdToken: token,
      });
    } catch (e: any) {
      setError(e.message || 'Failed to start checkout');
      setLoading(false);
    }
  };

  const tiers = ([1, 2, 3] as const);

  return (
    <div className="min-h-screen bg-[#020202] overflow-y-auto">
      {/* Close button */}
      {onClose && (
        <button
          onClick={onClose}
          className="fixed top-6 right-6 z-50 p-3 bg-white/5 border border-white/10 rounded-full hover:bg-white/10 transition-all"
        >
          <X size={18} className="text-white/60" />
        </button>
      )}

      {/* Hero */}
      <div className="relative pt-24 pb-20 px-6 text-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#6B0099]/20 via-[#D40055]/10 to-transparent" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-gradient-radial from-[#D40055]/20 to-transparent rounded-full blur-3xl" />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="relative z-10 flex flex-col items-center gap-6"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-[#6B0099] via-[#D40055] to-[#FF8C00] rounded-2xl flex items-center justify-center">
              <Logo size={28} fluid />
            </div>
            <span className="text-4xl font-black text-white tracking-tighter">Plajah<span className="text-[#FF8C00]">+</span></span>
          </div>

          <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter text-white leading-[0.85]">
            Support Creators.<br />
            <span className="bg-gradient-to-r from-[#D40055] via-[#FF8C00] to-[#FFD166] bg-clip-text text-transparent">
              Unlock Everything.
            </span>
          </h1>

          <p className="text-white/50 text-lg max-w-2xl font-light tracking-wide leading-relaxed">
            Subscribe under any creator and your membership binds to them — giving them a direct revenue share
            every month while you get exclusive benefits across the entire Plajah platform.
          </p>

          {defaultCreatorName && (
            <div className="flex items-center gap-2 px-5 py-2.5 bg-white/5 border border-white/10 rounded-full">
              <Users size={14} className="text-[#FF8C00]" />
              <span className="text-sm font-black text-white/70">Supporting <span className="text-white">{defaultCreatorName}</span></span>
            </div>
          )}

          {isMorphMode && (
            <div className="flex items-center gap-3 p-4 bg-[#6B0099]/20 border border-[#6B0099]/40 rounded-2xl">
              <Zap size={16} className="text-[#6B0099]" />
              <div className="text-left">
                <p className="text-xs font-black uppercase tracking-widest text-[#A020F0]">Plajah+Morph Mode</p>
                <p className="text-xs text-white/50 mt-0.5">Your subscription supports multiple creators — zero rebind fees</p>
              </div>
            </div>
          )}
        </motion.div>
      </div>

      {/* Active Sub Banner */}
      {activeSub && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mx-6 mb-8 p-5 bg-green-500/10 border border-green-500/30 rounded-3xl flex items-center gap-4"
        >
          <Check size={20} className="text-green-400 shrink-0" />
          <div>
            <p className="text-sm font-black text-green-400">You're already subscribed to Plajah+ {['', 'Starter', 'Pro', 'Elite'][activeSub.tier]}</p>
            <p className="text-xs text-white/40 mt-0.5">Manage your subscription via the billing portal</p>
          </div>
        </motion.div>
      )}

      {/* Tier Cards */}
      <div className="px-6 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {tiers.map((tier, idx) => {
            const meta = TIER_META[tier];
            const Icon = TIER_ICONS[tier];
            const isSelected = selectedTier === tier;
            const isPopular = tier === 2;

            return (
              <motion.div
                key={tier}
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                onClick={() => setSelectedTier(tier)}
                className={`relative cursor-pointer rounded-[2rem] border overflow-hidden transition-all duration-300 ${
                  isSelected
                    ? 'border-white/30 scale-[1.02]'
                    : 'border-white/10 hover:border-white/20'
                }`}
                style={isSelected ? { boxShadow: `0 0 60px ${TIER_GLOW[tier]}` } : {}}
              >
                {isPopular && (
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#6B0099] to-transparent" />
                )}
                {isPopular && (
                  <div className="absolute top-4 right-4 px-2.5 py-1 bg-[#6B0099] rounded-full text-[8px] font-black uppercase tracking-widest text-white">
                    Most Popular
                  </div>
                )}

                {/* Card gradient header */}
                <div className={`h-2 w-full bg-gradient-to-r ${TIER_GRADIENT[tier]}`} />

                <div className="p-8 bg-white/[0.03]">
                  <div className="flex items-center gap-3 mb-6">
                    <div className={`p-2.5 rounded-xl bg-gradient-to-br ${TIER_GRADIENT[tier]}`}>
                      <Icon size={18} className="text-white" />
                    </div>
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Plajah+</p>
                      <h3 className="text-lg font-black text-white">{meta.label.replace('Plajah+ ', '')}</h3>
                    </div>
                  </div>

                  <div className="mb-6">
                    <span className="text-5xl font-black text-white">${meta.price}</span>
                    <span className="text-white/40 text-sm ml-1">/month</span>
                  </div>

                  <div className="space-y-2.5 mb-8">
                    {meta.features.map((f, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <div className={`mt-0.5 p-1 rounded-md bg-gradient-to-br ${TIER_GRADIENT[tier]} shrink-0`}>
                          <Check size={9} className="text-white" />
                        </div>
                        <span className="text-xs text-white/60">{f}</span>
                      </div>
                    ))}
                  </div>

                  <div className="pt-4 border-t border-white/10">
                    <p className="text-[9px] text-white/30 text-center">
                      Platform: <span className="text-white/50">${meta.platformTake}/mo</span> &nbsp;•&nbsp;
                      Creator: <span className="text-white/50">${meta.creatorShare}/mo</span>
                    </p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Morph mode toggle */}
        {isMorphMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-8 p-6 bg-white/[0.03] border border-white/10 rounded-3xl"
          >
            <p className="text-xs font-black uppercase tracking-widest text-white/50 mb-4">Morph Distribution Mode</p>
            <div className="flex gap-3">
              {(['SPLIT', 'RANDOM'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setMorphMode(mode)}
                  className={`flex-1 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${
                    morphMode === mode ? 'bg-[#6B0099] text-white' : 'bg-white/5 text-white/40 hover:text-white'
                  }`}
                >
                  {mode === 'SPLIT' ? 'Split 3 Creators' : 'Random Monthly'}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-white/30 mt-3">
              {morphMode === 'SPLIT'
                ? 'Choose up to 3 creators to split your subscription share between each month.'
                : 'Your creator share is distributed to random active platform creators each month.'}
            </p>
          </motion.div>
        )}

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-10 flex flex-col items-center gap-4"
        >
          {error && (
            <div className="px-5 py-3 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-400 text-sm">
              {error}
            </div>
          )}

          <button
            onClick={handleSubscribe}
            disabled={loading || !!activeSub}
            className={`relative w-full max-w-md flex items-center justify-center gap-3 px-8 py-5 rounded-2xl font-black text-sm uppercase tracking-widest transition-all duration-300 ${
              activeSub
                ? 'bg-white/5 text-white/30 cursor-not-allowed'
                : 'bg-gradient-to-r from-[#D40055] via-[#6B0099] to-[#FF8C00] text-white hover:scale-[1.02] hover:shadow-[0_0_40px_rgba(212,0,85,0.4)] active:scale-[0.98]'
            }`}
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : activeSub ? (
              'Already Subscribed'
            ) : (
              <>
                Subscribe — ${TIER_META[selectedTier].price}/mo
                <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>

          <p className="text-[10px] text-white/25 text-center max-w-sm">
            Cancel anytime. Rebinding to a different creator costs $2.99. Use Plajah+Morph (sign up via Club or platform page) for zero rebind fees.
          </p>
        </motion.div>

        {/* How it works */}
        <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { icon: Users, title: 'Bind to a Creator', desc: 'Subscribe on any creator\'s profile and your monthly payment is linked to them — they earn your creator share every month.' },
            { icon: Gift, title: 'Unlock Benefits', desc: 'Get storage, points, discounts, early access, boosted promotion, and tier-exclusive platform features immediately.' },
            { icon: Zap, title: 'Support the Ecosystem', desc: 'Creators split their share with up to 3 other artists, charities, or clubs — spreading support across the entire Plajah community.' },
          ].map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 + i * 0.1 }}
              className="p-6 bg-white/[0.03] border border-white/[0.06] rounded-3xl"
            >
              <div className="p-3 bg-white/5 rounded-2xl w-fit mb-4">
                <item.icon size={20} className="text-[#FF8C00]" />
              </div>
              <h4 className="text-sm font-black text-white mb-2">{item.title}</h4>
              <p className="text-xs text-white/40 leading-relaxed">{item.desc}</p>
            </motion.div>
          ))}
        </div>

        {/* FAQ */}
        <div className="mt-20 pb-20">
          <h2 className="text-3xl font-black uppercase tracking-tighter text-white mb-8 text-center">Frequently Asked Questions</h2>
          <div className="space-y-3 max-w-3xl mx-auto">
            {FAQ.map((item, i) => (
              <div key={i} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-6 py-4 text-left"
                >
                  <span className="text-sm font-black text-white">{item.q}</span>
                  {openFaq === i ? (
                    <ChevronUp size={16} className="text-white/40 shrink-0" />
                  ) : (
                    <ChevronDown size={16} className="text-white/40 shrink-0" />
                  )}
                </button>
                <AnimatePresence>
                  {openFaq === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className="px-6 pb-5 text-xs text-white/50 leading-relaxed border-t border-white/[0.06] pt-4">
                        {item.a}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlajahPlusLanding;
