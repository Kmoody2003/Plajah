import React from 'react';
import { motion } from 'motion/react';
import { Check, MessageSquare, Shield, Crown, Sparkles } from 'lucide-react';
import { SanctuaryTier, SanctuaryMembership } from '../../types';
import { SANCTUARY_THEME } from './SanctuaryIdentity';

// ── Membership Home · Tier card ─────────────────────────────────────────────────
// A single membership tier as a glass card. The featured tier gets a "Most popular"
// ribbon and a lifted look. Join runs the EXISTING sanctuaryService checkout flow
// (passed down as onJoin). Members see their active state + manage affordance.

interface Props {
  tier: SanctuaryTier;
  membership: SanctuaryMembership | null;   // the viewer's membership IN THIS tier (or null)
  featured?: boolean;
  isLoading?: boolean;
  onJoin: (tier: SanctuaryTier) => void;
  onManage: (membership: SanctuaryMembership) => void;
}

const SanctuaryTierCard: React.FC<Props> = ({ tier, membership, featured, isLoading, onJoin, onManage }) => {
  const isMember = !!membership;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative rounded-3xl border overflow-hidden flex flex-col"
      style={{
        borderColor: featured ? `${tier.color}70` : `${tier.color}2e`,
        background: 'rgba(23,18,22,0.55)',
        boxShadow: featured ? `0 18px 48px ${tier.color}22` : 'var(--pj-elev-2)',
      }}
    >
      {/* Featured ribbon */}
      {featured && (
        <div className="absolute top-0 right-0 flex items-center gap-1 px-3 py-1 rounded-bl-2xl text-[8px] font-black uppercase tracking-[0.2em] text-black z-10"
          style={{ background: tier.color }}>
          <Crown size={9} /> Most popular
        </div>
      )}

      {/* Top accent bar */}
      <div className="h-1.5 w-full" style={{ background: `linear-gradient(90deg, ${tier.color}, ${tier.color}88)` }} />
      <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at top, ${tier.color}14 0%, transparent 68%)` }} />

      <div className="p-6 relative flex flex-col flex-1">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <span className="text-2xl">{tier.iconEmoji}</span>
              <div>
                <h3 className="text-lg font-black uppercase tracking-tighter">{tier.name}</h3>
                <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest">{tier.memberCount} member{tier.memberCount !== 1 ? 's' : ''}</p>
              </div>
            </div>
            {tier.description && <p className="text-[11px] text-white/50 leading-relaxed">{tier.description}</p>}
          </div>
          <div className="text-right shrink-0 ml-4">
            <div className="text-3xl font-black italic" style={{ color: tier.color }}>${tier.price}</div>
            <div className="text-[9px] font-bold text-white/25 uppercase tracking-widest">/month</div>
            {tier.annualPrice != null && tier.annualPrice > 0 && (
              <div className="text-[8px] font-bold mt-0.5" style={{ color: SANCTUARY_THEME.goldSoft }}>
                ${tier.annualPrice}/yr (save {Math.round((1 - tier.annualPrice / (tier.price * 12)) * 100)}%)
              </div>
            )}
          </div>
        </div>

        {/* Perks */}
        <div className="space-y-2 mb-6 flex-1">
          {tier.benefits.map((benefit, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: `${tier.color}25` }}>
                <Check size={9} style={{ color: tier.color }} />
              </div>
              <span className="text-[11px] text-white/70 leading-tight">{benefit}</span>
            </div>
          ))}
          {tier.hasPrivateChat && (
            <div className="flex items-start gap-2.5">
              <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: `${tier.color}25` }}>
                <MessageSquare size={9} style={{ color: tier.color }} />
              </div>
              <span className="text-[11px] text-white/70">Private member chat room</span>
            </div>
          )}
          {tier.hasMemberBadge && (
            <div className="flex items-start gap-2.5">
              <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: `${tier.color}25` }}>
                <Shield size={9} style={{ color: tier.color }} />
              </div>
              <span className="text-[11px] text-white/70">Exclusive member badge</span>
            </div>
          )}
        </div>

        {/* Action */}
        {isMember ? (
          <div className="space-y-2">
            <div
              className="w-full py-3 rounded-2xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest"
              style={{ background: `${tier.color}20`, color: tier.color, border: `1px solid ${tier.color}40` }}
            >
              <Check size={14} /> Active member
            </div>
            <button
              onClick={() => membership && onManage(membership)}
              className="w-full py-2 rounded-xl text-[9px] font-bold text-white/30 hover:text-white transition-colors uppercase tracking-widest"
            >
              Manage membership
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              onClick={() => onJoin(tier)}
              disabled={isLoading}
              className="w-full py-3.5 rounded-2xl text-white text-[10px] font-black uppercase tracking-widest transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2"
              style={{ background: `linear-gradient(135deg, ${tier.color}, ${tier.color}bb)` }}
            >
              {tier.price > 0 ? <>Join for ${tier.price}/mo</> : <><Sparkles size={13} /> Join for free</>}
            </button>
            <p className="text-center text-[8px] font-bold text-white/25 uppercase tracking-widest">Cancel anytime · you keep 90%</p>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default SanctuaryTierCard;
