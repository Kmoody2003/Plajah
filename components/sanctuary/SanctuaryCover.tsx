import React from 'react';
import { motion } from 'motion/react';
import {
  ChevronLeft, Users, Crown, Lock, Shield, Gem, Heart, Check,
  Settings, MapPin, Sparkles,
} from 'lucide-react';
import { Sanctuary, SanctuaryMembership, UserProfile } from '../../types';
import { SANCTUARY_THEME, SanctuaryBadge } from './SanctuaryIdentity';

// ── Membership Home · Cover + identity band ─────────────────────────────────────
// The full-bleed cover, the creator identity, and the primary calls-to-action.
// Guest / member / owner each get the right CTA. Uses the Plajah DS triad gradient
// (var(--pj-grad-warm)) for the primary "Join the Sanctuary" button, layered over
// the Sanctuary's obsidian + gold skin.

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

interface Props {
  sanctuary: Sanctuary | null;
  creatorProfile?: UserProfile;
  creatorId: string;
  sanctuaryName: string;
  memberCount: number;
  tierCount: number;
  monthlyTotal: number | null;   // null → creator hasn't exposed it
  isOwner?: boolean;
  membership: SanctuaryMembership | null;
  following: boolean;
  followBusy: boolean;
  onFollow: () => void;
  onJoinClick: () => void;       // scrolls to / opens the tiers section
  onManageMembership: () => void;
  onOwnerConsole: () => void;
  onBack?: () => void;
}

const SanctuaryCover: React.FC<Props> = ({
  sanctuary, creatorProfile, creatorId, sanctuaryName, memberCount, tierCount,
  monthlyTotal, isOwner, membership, following, followBusy,
  onFollow, onJoinClick, onManageMembership, onOwnerConsole, onBack,
}) => {
  const cover = sanctuary?.coverUrl || sanctuary?.bannerUrl;
  const avatar = sanctuary?.avatarUrl || creatorProfile?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${creatorId}`;
  const descriptor = sanctuary?.category || sanctuary?.tagline;

  return (
    <div className="relative">
      {/* Full-bleed cover band */}
      <div className="h-52 md:h-72 relative overflow-hidden" style={{ background: SANCTUARY_THEME.heroGradient }}>
        {cover ? (
          <img src={cover} className="absolute inset-0 w-full h-full object-cover opacity-45" alt="" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Gem size={84} style={{ color: 'rgba(201,165,92,0.10)' }} />
          </div>
        )}
        {/* Gold sheen + bottom scrim so the identity reads over any cover */}
        <div className="absolute inset-0" style={{ background: SANCTUARY_THEME.goldSheen }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(8,8,11,0.96) 0%, rgba(8,8,11,0.35) 45%, transparent 100%)' }} />

        <div className="absolute top-4 left-5 right-5 flex items-center justify-between">
          {onBack ? (
            <button onClick={onBack} className="flex items-center gap-1.5 text-white/60 hover:text-white transition-colors text-[11px] font-bold uppercase tracking-widest">
              <ChevronLeft size={16} /> Back
            </button>
          ) : <span />}
          <SanctuaryBadge />
        </div>
      </div>

      {/* Identity + CTAs */}
      <div className="px-5 md:px-8 -mt-16 relative">
        <div className="flex flex-col md:flex-row md:items-end gap-5">
          {/* Avatar */}
          <div className="w-28 h-28 rounded-3xl overflow-hidden shrink-0 shadow-2xl" style={{ border: `3px solid ${SANCTUARY_THEME.gold}` }}>
            <img src={avatar} className="w-full h-full object-cover" alt="" />
          </div>

          {/* Name + subtitle */}
          <div className="min-w-0 flex-1 pb-1">
            <h1 className="text-3xl md:text-4xl font-black italic tracking-tight leading-none truncate" style={{ color: SANCTUARY_THEME.goldSoft }}>
              {sanctuaryName}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2.5">
              {descriptor && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-white/45 uppercase tracking-widest">
                  <Sparkles size={10} style={{ color: SANCTUARY_THEME.gold }} /> {descriptor}
                </span>
              )}
              {sanctuary?.location && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                  <MapPin size={10} /> {sanctuary.location}
                </span>
              )}
              <span className="flex items-center gap-1 text-[10px] font-bold text-white/45 uppercase tracking-widest">
                <Users size={10} /> {memberCount.toLocaleString()} member{memberCount !== 1 ? 's' : ''}
              </span>
              <span className="flex items-center gap-1 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                <Crown size={10} /> {tierCount} tier{tierCount !== 1 ? 's' : ''}
              </span>
              {monthlyTotal != null && monthlyTotal > 0 && (
                <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: SANCTUARY_THEME.goldSoft }}>
                  {money(monthlyTotal)}/mo raised
                </span>
              )}
              {sanctuary?.visibility === 'PRIVATE' && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                  <Lock size={10} /> Private
                </span>
              )}
            </div>
          </div>

          {/* CTAs */}
          <div className="flex items-center gap-2.5 pb-1 shrink-0">
            {isOwner ? (
              <button
                onClick={onOwnerConsole}
                className="flex items-center gap-2 px-6 h-12 rounded-full text-[11px] font-black uppercase tracking-widest text-black transition-all hover:brightness-110 active:scale-[0.98]"
                style={{ background: SANCTUARY_THEME.gold }}
              >
                <Settings size={15} /> Owner console
              </button>
            ) : membership ? (
              <button
                onClick={onManageMembership}
                className="flex items-center gap-2 px-6 h-12 rounded-full text-[11px] font-black uppercase tracking-widest transition-all"
                style={{ color: membership.tierColor, border: `1px solid ${membership.tierColor}55`, background: `${membership.tierColor}18` }}
              >
                <Shield size={15} /> {membership.tierName} member
              </button>
            ) : (
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={onJoinClick}
                className="flex items-center gap-2 px-7 h-12 rounded-full text-[11px] font-black uppercase tracking-widest text-white transition-all hover:brightness-110"
                style={{ background: 'var(--pj-grad-warm)', boxShadow: 'var(--pj-glow-brand)' }}
              >
                <Gem size={15} /> Join the Sanctuary
              </motion.button>
            )}

            {!isOwner && (
              <button
                onClick={onFollow}
                disabled={followBusy}
                className="flex items-center gap-2 px-5 h-12 rounded-full text-[11px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
                style={following
                  ? { color: SANCTUARY_THEME.goldSoft, background: SANCTUARY_THEME.goldSheen, border: `1px solid ${SANCTUARY_THEME.line}` }
                  : { color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.14)' }}
              >
                {following ? <><Check size={14} /> Following</> : <><Heart size={14} /> Follow</>}
              </button>
            )}
          </div>
        </div>

        {sanctuary?.tagline && sanctuary.tagline !== descriptor && (
          <p className="text-[13px] text-white/55 leading-relaxed max-w-2xl mt-4">{sanctuary.tagline}</p>
        )}
      </div>
    </div>
  );
};

export default SanctuaryCover;
