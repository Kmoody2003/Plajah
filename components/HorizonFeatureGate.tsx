/**
 * HorizonFeatureGate — "On The Horizon" feature preview wrapper.
 *
 * Drop this around any built-but-not-activated UI to:
 *   • Show the real component dimmed/blurred as a live preview
 *   • Overlay a frosted glass badge + description
 *   • Let users register interest (writes to Firestore horizon_waitlist)
 *   • Show build status (PLANNED → BUILDING → TESTING → LAUNCHING)
 *
 * Usage:
 *   <HorizonFeatureGate feature={HORIZON_FEATURES.PREDICTION_MARKET}>
 *     <PredictionMarketView ... />
 *   </HorizonFeatureGate>
 */

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Telescope, Bell, BellOff, ChevronDown, ChevronUp, Sparkles, Zap, FlaskConical, Rocket } from 'lucide-react';
import { db } from '../services/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth } from '../services/firebase';

// ─── Feature status ───────────────────────────────────────────────────────────

export type HorizonStatus = 'PLANNED' | 'BUILDING' | 'TESTING' | 'LAUNCHING';

export interface HorizonFeatureDef {
  id: string;
  name: string;
  tagline: string;
  description: string;
  status: HorizonStatus;
  eta?: string;          // e.g. "Q3 2026"
  revenueModel?: string; // e.g. "70% athlete / 20% school / 10% Plajah"
  icon: string;          // emoji
  category: 'CAREER' | 'FAN_ECONOMY' | 'SCHOOL' | 'ATHLETE_PROTECTION' | 'RECRUITING';
}

// ─── Canonical feature registry ───────────────────────────────────────────────

export const HORIZON_FEATURES: Record<string, HorizonFeatureDef> = {
  DYNAMIC_NFT: {
    id: 'DYNAMIC_NFT',
    name: 'Dynamic Rarity NFT Cards',
    tagline: 'Cards that grow with the athlete.',
    description:
      'Highlight NFTs that update their rarity tier as the athlete\'s career stats grow. ' +
      'A card minted at 5 touchdowns becomes a different artifact at 50. ' +
      'Common → Rare → Epic → Legendary — first collectors hold appreciating assets.',
    status: 'BUILDING',
    eta: 'Q3 2026',
    revenueModel: 'Secondary royalties: 7.5% to athlete (ERC-2981)',
    icon: '✨',
    category: 'FAN_ECONOMY',
  },
  PREDICTION_MARKET: {
    id: 'PREDICTION_MARKET',
    name: 'On-Chain Prediction Markets',
    tagline: 'Put PLAJ behind your read.',
    description:
      'Fans stake PLAJ tokens on game and season outcomes. ' +
      'Markets resolve automatically when verified on-chain stats cross the threshold — ' +
      'no oracle needed, Plajah\'s broadcast IS the oracle. ' +
      '"Will Marcus rush for 1,000 yards?" — let the community decide.',
    status: 'BUILDING',
    eta: 'Q4 2026',
    revenueModel: '5% platform take from winning pool; 95% to winners',
    icon: '📈',
    category: 'FAN_ECONOMY',
  },
  ALUMNI_ENDORSEMENT: {
    id: 'ALUMNI_ENDORSEMENT',
    name: 'Alumni Endorsement Staking',
    tagline: 'Former pros vouch on-chain.',
    description:
      'Verified professional athletes who attended the same school can cryptographically stake ' +
      'their reputation behind a current player. The endorsement appears on the athlete\'s recruiting card — ' +
      'provably signed, can\'t be faked, can\'t be bought.',
    status: 'PLANNED',
    eta: 'Q1 2027',
    revenueModel: 'No fee — pure reputation signal',
    icon: '🏆',
    category: 'RECRUITING',
  },
  SOULBOUND_TOKEN: {
    id: 'SOULBOUND_TOKEN',
    name: 'Soulbound Career Token',
    tagline: 'A credential that cannot be sold.',
    description:
      'An ERC-5192 non-transferable token issued to each athlete at registration. ' +
      'It accumulates verified career milestones, game records, and coach signatures — ' +
      'and cannot be sold, traded, or faked. College coaches request it. ' +
      'Think: a blockchain transcript working alongside their GPA transcript.',
    status: 'BUILDING',
    eta: 'Q3 2026',
    revenueModel: 'Free to athletes — verification fees to institutions ($25/check)',
    icon: '🔮',
    category: 'CAREER',
  },
  BOOSTER_DAO: {
    id: 'BOOSTER_DAO',
    name: 'Booster Club DAO',
    tagline: 'School programs governed on-chain.',
    description:
      'School teams launch a DAO. Boosters buy school-specific PLAJ tokens that vote on ' +
      'team spending — equipment, travel, camps. Every dollar spent is visible on Polygonscan. ' +
      'Programs in underfunded schools can self-fund through their community without a school board vote.',
    status: 'BUILDING',
    eta: 'Q4 2026',
    revenueModel: '2% platform fee on DAO treasury inflows',
    icon: '🏛️',
    category: 'SCHOOL',
  },
  INJURY_INSURANCE: {
    id: 'INJURY_INSURANCE',
    name: 'Injury Insurance Micro-Pool',
    tagline: 'Community-backed athlete protection.',
    description:
      'Fans stake PLAJ into a pool tied to an athlete. ' +
      'If an authorized game producer logs an INJURY event, the pool pays out to the athlete\'s wallet — ' +
      'no paperwork, no claims process, no insurance company. ' +
      'Small amounts from many fans creates real community-backed protection.',
    status: 'PLANNED',
    eta: 'Q1 2027',
    revenueModel: '3% pool management fee; 97% to athlete on claim',
    icon: '🛡️',
    category: 'ATHLETE_PROTECTION',
  },
  PHOTO_LICENSE: {
    id: 'PHOTO_LICENSE',
    name: 'Game Photo Licensing',
    tagline: 'Every touchdown photo has a price.',
    description:
      'Photographers who upload to Plajah\'s Event Photo Pool get on-chain content IDs via LicenseRegistry.sol. ' +
      'When media outlets, brands, or colleges use a game photo, they pay the license fee automatically. ' +
      'Revenue splits: photographer 60%, featured athlete 25%, Plajah 15%.',
    status: 'PLANNED',
    eta: 'Q2 2027',
    revenueModel: '60% photographer / 25% athlete / 15% Plajah',
    icon: '📸',
    category: 'FAN_ECONOMY',
  },
  LOI_NFT: {
    id: 'LOI_NFT',
    name: 'Letter of Intent Moment NFT',
    tagline: 'The signing — forever on-chain.',
    description:
      'When an athlete signs their D1 Letter of Intent, Plajah mints a 1-of-1 commemorative NFT ' +
      'of that exact moment — video clip from their live stream (or uploaded photo). ' +
      'One copy to the athlete, one to the school, one to the Plajah archive. ' +
      'An uncopyable digital artifact of one of the biggest moments in a young athlete\'s life.',
    status: 'PLANNED',
    eta: 'Q2 2027',
    revenueModel: '100% to athlete — Plajah mints as a gift',
    icon: '📜',
    category: 'CAREER',
  },
  SCOUT_DISCOVERY: {
    id: 'SCOUT_DISCOVERY',
    name: 'Scout Discovery Network',
    tagline: 'The authoritative recruiting database.',
    description:
      'Coaches pay a regional subscription to query verified athletes: sport, position, ' +
      'state, graduating class, verified stat thresholds. More trustworthy than any existing platform ' +
      'because every stat has a blockchain signature and a live video link. Athletes opt in and control their data.',
    status: 'BUILDING',
    eta: 'Q3 2026',
    revenueModel: '$299/yr regional access — 80% athlete data revenue / 20% Plajah',
    icon: '🔭',
    category: 'RECRUITING',
  },
  FAMILY_MULTISIG: {
    id: 'FAMILY_MULTISIG',
    name: 'Family NIL Wallet (Multi-Sig)',
    tagline: 'Parental oversight built into the blockchain.',
    description:
      'For minor athletes, the platform auto-creates a 2-of-3 multisig wallet (athlete + parent + Plajah backup). ' +
      'No USDC moves without two signatures. Athletes build financial literacy by approving their own transactions. ' +
      'At 18, parental key is removed automatically.',
    status: 'PLANNED',
    eta: 'Q1 2027',
    revenueModel: 'Free for athletes — required for NIL compliance',
    icon: '👨‍👩‍👦',
    category: 'ATHLETE_PROTECTION',
  },
};

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<HorizonStatus, { label: string; color: string; Icon: React.ComponentType<any> }> = {
  PLANNED:   { label: 'Planned',   color: 'text-white/40 border-white/15 bg-white/5',       Icon: Telescope },
  BUILDING:  { label: 'Building',  color: 'text-sky-400 border-sky-500/30 bg-sky-500/10',   Icon: FlaskConical },
  TESTING:   { label: 'Testing',   color: 'text-amber-400 border-amber-500/30 bg-amber-500/10', Icon: Zap },
  LAUNCHING: { label: 'Launching', color: 'text-green-400 border-green-500/30 bg-green-500/10', Icon: Rocket },
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  feature: HorizonFeatureDef;
  children?: React.ReactNode;
  /** If true, the children preview is hidden and only the card is shown */
  cardOnly?: boolean;
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

const HorizonFeatureGate: React.FC<Props> = ({ feature, children, cardOnly = false, className = '' }) => {
  const [notified, setNotified]   = useState(false);
  const [loading, setLoading]     = useState(false);
  const [expanded, setExpanded]   = useState(false);
  const cfg = STATUS_CONFIG[feature.status];

  const registerInterest = useCallback(async () => {
    setLoading(true);
    try {
      const uid = auth.currentUser?.uid ?? 'anon';
      await setDoc(
        doc(db, 'horizon_waitlist', `${feature.id}_${uid}`),
        {
          featureId: feature.id,
          featureName: feature.name,
          userId: uid,
          registeredAt: serverTimestamp(),
        },
        { merge: true }
      );
      setNotified(true);
    } catch {
      setNotified(true); // optimistic
    } finally {
      setLoading(false);
    }
  }, [feature.id, feature.name]);

  // ── Card-only mode (used inside OnTheHorizonHub) ─────────────────────────

  if (cardOnly) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className={`bg-[#0d0d1a] border border-white/8 rounded-2xl overflow-hidden ${className}`}
      >
        <div className="p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{feature.icon}</span>
              <div>
                <h3 className="text-white font-black text-sm leading-tight">{feature.name}</h3>
                <p className="text-white/30 text-[11px] mt-0.5 italic">{feature.tagline}</p>
              </div>
            </div>
            <div className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider ${cfg.color}`}>
              <cfg.Icon size={10} />
              {cfg.label}
            </div>
          </div>

          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <p className="text-white/40 text-xs leading-relaxed mb-3">{feature.description}</p>
                {feature.revenueModel && (
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[9px] font-black text-white/20 uppercase tracking-wider">Revenue</span>
                    <span className="text-[10px] text-amber-400/70">{feature.revenueModel}</span>
                  </div>
                )}
                {feature.eta && (
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[9px] font-black text-white/20 uppercase tracking-wider">ETA</span>
                    <span className="text-[10px] text-white/40">{feature.eta}</span>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={registerInterest}
              disabled={loading || notified}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${
                notified
                  ? 'border-green-500/30 bg-green-500/10 text-green-400'
                  : 'border-white/10 bg-white/5 text-white/40 hover:border-amber-500/30 hover:bg-amber-500/10 hover:text-amber-400'
              }`}
            >
              {notified ? <><BellOff size={10} /> Notified</> : <><Bell size={10} /> {loading ? '...' : 'Notify Me'}</>}
            </button>
            <button
              onClick={() => setExpanded(e => !e)}
              className="ml-auto text-white/20 hover:text-white/50 transition-colors p-1"
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  // ── Wrapper mode (overlays the actual feature UI) ─────────────────────────

  return (
    <div className={`relative ${className}`}>
      {/* Blurred preview of the real UI */}
      {children && (
        <div className="pointer-events-none select-none" style={{ filter: 'blur(3px) brightness(0.35)', userSelect: 'none' }}>
          {children}
        </div>
      )}

      {/* Overlay */}
      <div className="absolute inset-0 flex items-center justify-center z-10">
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-full max-w-sm mx-4 bg-[#0a0a16]/95 backdrop-blur-2xl border border-white/10 rounded-3xl p-6 shadow-2xl"
        >
          {/* On The Horizon badge */}
          <div className="flex items-center gap-2 mb-4">
            <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/15 border border-amber-500/25 rounded-full">
              <Sparkles size={11} className="text-amber-400" />
              <span className="text-amber-400 text-[10px] font-black uppercase tracking-widest">On The Horizon</span>
            </div>
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider ${cfg.color}`}>
              <cfg.Icon size={10} />
              {cfg.label}
            </div>
          </div>

          <div className="flex items-center gap-3 mb-3">
            <span className="text-3xl">{feature.icon}</span>
            <div>
              <h3 className="text-white font-black text-base leading-tight">{feature.name}</h3>
              <p className="text-white/30 text-xs mt-0.5 italic">{feature.tagline}</p>
            </div>
          </div>

          <p className="text-white/40 text-xs leading-relaxed mb-4">{feature.description}</p>

          {feature.revenueModel && (
            <div className="p-3 bg-white/4 border border-white/8 rounded-xl mb-4">
              <p className="text-white/20 text-[9px] font-black uppercase tracking-widest mb-1">Revenue Model</p>
              <p className="text-amber-400/70 text-[11px]">{feature.revenueModel}</p>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={registerInterest}
              disabled={loading || notified}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all border ${
                notified
                  ? 'border-green-500/30 bg-green-500/10 text-green-400'
                  : 'border-amber-500/30 bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'
              }`}
            >
              {notified
                ? <><BellOff size={12} /> You\'re on the list</>
                : loading ? '...'
                : <><Bell size={12} /> Get Early Access</>}
            </button>
            {feature.eta && (
              <span className="text-white/20 text-[10px] font-bold shrink-0">{feature.eta}</span>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default HorizonFeatureGate;
