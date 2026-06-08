/**
 * OnTheHorizonHub — full showcase of all 10 upcoming Plajah features.
 *
 * Features are INACTIVE. Each card renders a HorizonFeatureGate in cardOnly mode.
 * Clicking "Learn More" expands the card; the Notify CTA registers in Firestore.
 * A live waitlist counter updates in real time using Firestore snapshot.
 */

import React, { useEffect, useState } from 'react';
import {
  Telescope,
  FlaskConical,
  Zap,
  Rocket,
  Trophy,
  TrendingUp,
  Star,
  Shield,
  Users,
  Camera,
  Award,
  Search,
  Wallet,
  ChevronDown,
  ChevronUp,
  Bell,
  Lock,
  Sparkles,
} from 'lucide-react';
import { auth, db } from '../services/firebase';
import { collection, query, where, onSnapshot, QuerySnapshot, DocumentData } from 'firebase/firestore';
import { registerHorizonInterest } from '../services/horizonFeaturesService';

// ─── Feature registry ─────────────────────────────────────────────────────────

type FeatureStatus = 'PLANNED' | 'BUILDING' | 'TESTING' | 'LAUNCHING';
type FeatureCategory = 'athlete' | 'community' | 'media' | 'compliance';

interface HorizonFeature {
  id: string;
  name: string;
  tagline: string;
  description: string;
  details: string[];
  status: FeatureStatus;
  eta: string;
  revenueModel: string;
  icon: React.ReactNode;
  category: FeatureCategory;
  color: string;
}

const FEATURES: HorizonFeature[] = [
  {
    id: 'DYNAMIC_NFT',
    name: 'Dynamic Rarity NFT Cards',
    tagline: 'Cards that evolve with every highlight',
    description:
      'Athlete highlight NFTs that automatically upgrade their rarity tier as career stats accumulate. A card minted at COMMON can reach LEGENDARY — its on-chain metadata updates live.',
    details: [
      'Four tiers: Common, Rare, Epic, Legendary — driven by career stats',
      'Rarity upgrades reflected in marketplace floor price automatically',
      'Card art re-renders with glow effects as tier changes',
      'Limited LEGENDARY editions (< 10 per athlete per season)',
    ],
    status: 'BUILDING',
    eta: 'Q3 2026',
    revenueModel: '7.5% secondary royalty + 10% first-mint fee',
    icon: <Sparkles size={22} />,
    category: 'athlete',
    color: '#F59E0B',
  },
  {
    id: 'PREDICTION_MARKET',
    name: 'Prediction Markets',
    tagline: 'Stake PLAJ on the next big play',
    description:
      "Binary prediction markets resolved by on-chain athlete stats. Will Marcus rush 1,000 yards? Will Lincoln score 30+ Friday night? Plajah's broadcast IS the oracle — no middlemen.",
    details: [
      'Game-level and season-level markets',
      'PLAJ-denominated staking (min 10 PLAJ)',
      '5% platform fee on total pool; 95% to winners',
      'Auto-resolves when AthleteRegistry stat crosses threshold',
    ],
    status: 'BUILDING',
    eta: 'Q4 2026',
    revenueModel: '5% of prediction pool on every resolved market',
    icon: <TrendingUp size={22} />,
    category: 'community',
    color: '#10B981',
  },
  {
    id: 'ALUMNI_ENDORSEMENT',
    name: 'Alumni Endorsement Staking',
    tagline: 'Pro alumni put skin in the game',
    description:
      'Verified pro or college alumni stake PLAJ tokens behind a current high school player — a cryptographically proven endorsement that cannot be faked or bought. Deposit returns when endorsement expires.',
    details: [
      'PRO tier: 500 PLAJ deposit | COLLEGE: 100 PLAJ | HS Alum: 25 PLAJ',
      'Endorsement appears on AthleteCareerCard with verifiable signature',
      'Max 4-year endorsement window (full HS career)',
      'Boosts scout discovery rank for endorsed athletes',
    ],
    status: 'PLANNED',
    eta: 'Q1 2027',
    revenueModel: 'Platform earns on secondary PLAJ activity + scout upsell',
    icon: <Star size={22} />,
    category: 'athlete',
    color: '#6366F1',
  },
  {
    id: 'SOULBOUND_TOKEN',
    name: 'Soulbound Career Token',
    tagline: 'A permanent, non-transferable career record',
    description:
      'Every Plajah athlete receives a Soulbound (ERC-5192) token at signup. Non-transferable — it is their on-chain identity. Milestone badges accumulate: Debut Game, 1,000 Points, State Champion, LOI Signed.',
    details: [
      'Implements ERC-5192 — cannot be sold or transferred, ever',
      '12 milestone badge tiers from Debut to Graduation',
      'LOI record anchors the exact signing moment on-chain',
      '$25 credential verification fee (80% to athlete)',
    ],
    status: 'BUILDING',
    eta: 'Q3 2026',
    revenueModel: '$25 USDC credential verification fee per record',
    icon: <Shield size={22} />,
    category: 'compliance',
    color: '#EC4899',
  },
  {
    id: 'BOOSTER_DAO',
    name: 'Booster Club DAO',
    tagline: 'Transparent, on-chain school athletics funding',
    description:
      'School programs launch a Booster Club DAO. Parents, fans, and community members contribute USDC. PLAJ-weighted voting decides how treasury funds are spent — all visible on Polygonscan.',
    details: [
      '2% platform fee on USDC contributions',
      '51% quorum threshold + 3-day voting window',
      'Full on-chain transparency — no more missing booster funds',
      'Integrates with existing Plajah Club system',
    ],
    status: 'BUILDING',
    eta: 'Q4 2026',
    revenueModel: '2% fee on all USDC inflows to DAO treasuries',
    icon: <Users size={22} />,
    category: 'community',
    color: '#3B82F6',
  },
  {
    id: 'INJURY_INSURANCE',
    name: 'Injury Insurance Micro-Pool',
    tagline: 'Community-funded protection, no paperwork',
    description:
      'Fans stake PLAJ into a pool dedicated to a specific athlete. If a game producer logs an INJURY event, the contract auto-releases funds to the athlete. No insurance company, no adjuster, no delay.',
    details: [
      'Three severity tiers: MINOR (10%), MAJOR (50%), SEASON_ENDING (100%)',
      '30-day cooling period between claims',
      '3% management fee; backers earn loyalty PLAJ',
      'Pool resets each season — backers can re-stake',
    ],
    status: 'PLANNED',
    eta: 'Q1 2027',
    revenueModel: '3% management fee on every claim payout',
    icon: <Shield size={22} />,
    category: 'athlete',
    color: '#EF4444',
  },
  {
    id: 'PHOTO_LICENSE',
    name: 'Game Photo Licensing',
    tagline: 'Every sideline shot generates athlete revenue',
    description:
      'Photos uploaded to EventPhotoPool are registered for on-chain licensing. Media orgs, print publications, or commercial clients purchase a license — revenue splits automatically to photographer + athletes featured.',
    details: [
      'Editorial Digital: $25 | Print One-Use: $75 | Commercial: $250 | Broadcast: $750',
      '60% photographer / 25% athletes / 15% platform split',
      'Athletes opt-in; all revenue flows to their custodial wallet',
      'License receipt NFT issued to purchaser as proof of rights',
    ],
    status: 'PLANNED',
    eta: 'Q2 2027',
    revenueModel: '15% platform split on every photo license sale',
    icon: <Camera size={22} />,
    category: 'media',
    color: '#F97316',
  },
  {
    id: 'LOI_NFT',
    name: 'Letter of Intent Moment NFT',
    tagline: 'The biggest signing in an athlete\'s life, on-chain forever',
    description:
      'When a Plajah athlete signs their Letter of Intent, the platform mints a 1-of-3 commemorative NFT: one for the athlete, one for the school\'s archive, one for the college. The moment, video clip, and LOI doc are all pinned to IPFS.',
    details: [
      '1-of-3 edition: athlete + school + college wallets',
      'Video clip and signing photo pinned to IPFS alongside LOI document',
      'Ties to Soulbound Token LOI milestone badge automatically',
      'Shareable on social with embedded verification link',
    ],
    status: 'PLANNED',
    eta: 'Q2 2027',
    revenueModel: '$199 one-time mint fee per LOI moment',
    icon: <Award size={22} />,
    category: 'athlete',
    color: '#8B5CF6',
  },
  {
    id: 'SCOUT_DISCOVERY',
    name: 'Scout Discovery Network',
    tagline: 'Verified stats. Real athletes. No middlemen.',
    description:
      'College scouts subscribe to Plajah\'s verified-stat search. Every metric is chain-authenticated. Athletes opt in to be discoverable. The data is live — no stale recruiting profiles.',
    details: [
      'Regional license: $299/yr | National: $999/yr',
      'Search by sport, state, graduating class, verified stat thresholds',
      'Athletes control their own opt-in; no data without consent',
      'Direct message pathway to athlete\'s Plajah inbox',
    ],
    status: 'BUILDING',
    eta: 'Q3 2026',
    revenueModel: '$299–$999/yr scout subscriptions',
    icon: <Search size={22} />,
    category: 'compliance',
    color: '#14B8A6',
  },
  {
    id: 'FAMILY_MULTISIG',
    name: 'Family Multi-Sig Wallet',
    tagline: 'NIL earnings protected until the athlete is ready',
    description:
      'For athletes under 18, NIL revenue flows into a 2-of-3 multi-sig wallet (athlete + parent + Plajah backup). Both signatures required to move funds. Converts to a standard wallet at age 18.',
    details: [
      '2-of-3 multi-sig: athlete wallet + parent wallet + Plajah custodial backup',
      'Full NIL revenue protection for minors under applicable state law',
      'Auto-converts to single-sig at athlete\'s 18th birthday',
      'Parent receives real-time push notifications on any pending transfer',
    ],
    status: 'PLANNED',
    eta: 'Q1 2027',
    revenueModel: 'Included in athlete account — drives platform retention',
    icon: <Wallet size={22} />,
    category: 'compliance',
    color: '#06B6D4',
  },
];

// ─── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<FeatureStatus, { label: string; color: string; icon: React.ReactNode }> = {
  PLANNED:   { label: 'Planned',   color: '#94A3B8', icon: <Telescope size={12} /> },
  BUILDING:  { label: 'Building',  color: '#38BDF8', icon: <FlaskConical size={12} /> },
  TESTING:   { label: 'Testing',   color: '#FBBF24', icon: <Zap size={12} /> },
  LAUNCHING: { label: 'Launching', color: '#4ADE80', icon: <Rocket size={12} /> },
};

const CATEGORY_LABELS: Record<FeatureCategory, string> = {
  athlete:    'Athlete Economy',
  community:  'Community & Fans',
  media:      'Media & Content',
  compliance: 'Compliance & Trust',
};

// ─── Waitlist hook ────────────────────────────────────────────────────────────

function useWaitlistCounts() {
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'horizon_waitlist'),
      (snap: QuerySnapshot<DocumentData>) => {
        const map: Record<string, number> = {};
        snap.docs.forEach(d => {
          const fid = d.data().featureId as string;
          map[fid] = (map[fid] ?? 0) + 1;
        });
        setCounts(map);
      },
    );
    return unsub;
  }, []);

  return counts;
}

// ─── Feature Card ─────────────────────────────────────────────────────────────

interface FeatureCardProps {
  feature: HorizonFeature;
  waitlistCount: number;
  userId: string | null;
}

function FeatureCard({ feature, waitlistCount, userId }: FeatureCardProps) {
  const [expanded,   setExpanded]   = useState(false);
  const [notified,   setNotified]   = useState(false);
  const [loading,    setLoading]    = useState(false);
  const statusCfg = STATUS_CONFIG[feature.status];

  async function handleNotify() {
    if (!userId || notified || loading) return;
    setLoading(true);
    try {
      await registerHorizonInterest(feature.id, userId);
      setNotified(true);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        background: 'rgba(15, 23, 42, 0.85)',
        border: `1px solid rgba(255,255,255,0.08)`,
        borderRadius: 16,
        overflow: 'hidden',
        backdropFilter: 'blur(12px)',
        transition: 'border-color 0.2s',
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = feature.color + '66')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}
    >
      {/* Header */}
      <div style={{ padding: '20px 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
          {/* Icon */}
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: feature.color + '22',
              border: `1px solid ${feature.color}44`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: feature.color,
              flexShrink: 0,
            }}
          >
            {feature.icon}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#F1F5F9', lineHeight: 1.3 }}>
                {feature.name}
              </h3>
              {/* Status badge */}
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '2px 8px',
                  borderRadius: 20,
                  fontSize: 10,
                  fontWeight: 600,
                  background: statusCfg.color + '22',
                  color: statusCfg.color,
                  border: `1px solid ${statusCfg.color}44`,
                  letterSpacing: '0.04em',
                }}
              >
                {statusCfg.icon}
                {statusCfg.label}
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: feature.color, fontWeight: 500 }}>
              {feature.tagline}
            </p>
          </div>

          {/* Lock icon */}
          <div style={{ color: '#475569', flexShrink: 0 }}>
            <Lock size={16} />
          </div>
        </div>

        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#94A3B8', lineHeight: 1.6 }}>
          {feature.description}
        </p>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{ padding: '0 20px 16px' }}>
          <ul style={{ margin: 0, padding: '0 0 0 16px', listStyle: 'disc' }}>
            {feature.details.map((d, i) => (
              <li key={i} style={{ fontSize: 12, color: '#CBD5E1', marginBottom: 6, lineHeight: 1.5 }}>
                {d}
              </li>
            ))}
          </ul>

          <div
            style={{
              marginTop: 14,
              padding: '10px 12px',
              borderRadius: 8,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <p style={{ margin: 0, fontSize: 11, color: '#64748B' }}>
              <span style={{ color: '#94A3B8', fontWeight: 600 }}>Revenue model: </span>
              {feature.revenueModel}
            </p>
          </div>
        </div>
      )}

      {/* Footer */}
      <div
        style={{
          padding: '12px 20px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 11, color: '#475569' }}>ETA {feature.eta}</span>
          {waitlistCount > 0 && (
            <span style={{ fontSize: 11, color: '#64748B' }}>
              {waitlistCount.toLocaleString()} interested
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => setExpanded(e => !e)}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              padding: '5px 10px',
              fontSize: 11,
              color: '#94A3B8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {expanded ? 'Less' : 'Details'}
          </button>

          <button
            onClick={handleNotify}
            disabled={!userId || notified || loading}
            style={{
              background: notified ? '#15803D' : feature.color,
              border: 'none',
              borderRadius: 8,
              padding: '5px 12px',
              fontSize: 11,
              fontWeight: 600,
              color: '#fff',
              cursor: notified || !userId ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              opacity: !userId ? 0.5 : 1,
              transition: 'background 0.2s',
            }}
          >
            <Bell size={11} />
            {notified ? 'Notified!' : loading ? '...' : 'Notify Me'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Roadmap timeline ─────────────────────────────────────────────────────────

const ROADMAP_QUARTERS = [
  { quarter: 'Q3 2026', ids: ['DYNAMIC_NFT', 'SOULBOUND_TOKEN', 'SCOUT_DISCOVERY'] },
  { quarter: 'Q4 2026', ids: ['PREDICTION_MARKET', 'BOOSTER_DAO'] },
  { quarter: 'Q1 2027', ids: ['ALUMNI_ENDORSEMENT', 'INJURY_INSURANCE', 'FAMILY_MULTISIG'] },
  { quarter: 'Q2 2027', ids: ['PHOTO_LICENSE', 'LOI_NFT'] },
];

function RoadmapTimeline() {
  return (
    <div style={{ marginBottom: 48 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: '#F1F5F9', marginBottom: 24, textAlign: 'center' }}>
        Activation Roadmap
      </h2>
      <div style={{ display: 'flex', gap: 0, overflowX: 'auto', paddingBottom: 8 }}>
        {ROADMAP_QUARTERS.map((q, qi) => {
          const features = FEATURES.filter(f => q.ids.includes(f.id));
          return (
            <React.Fragment key={q.quarter}>
              <div style={{ flex: '0 0 200px', textAlign: 'center' }}>
                <div
                  style={{
                    display: 'inline-block',
                    padding: '4px 14px',
                    borderRadius: 20,
                    background: 'rgba(99,102,241,0.15)',
                    border: '1px solid rgba(99,102,241,0.3)',
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#A5B4FC',
                    marginBottom: 16,
                  }}
                >
                  {q.quarter}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
                  {features.map(f => (
                    <div
                      key={f.id}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 8,
                        background: f.color + '15',
                        border: `1px solid ${f.color}33`,
                        fontSize: 11,
                        color: f.color,
                        width: 168,
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      {f.icon}
                      {f.name}
                    </div>
                  ))}
                </div>
              </div>
              {qi < ROADMAP_QUARTERS.length - 1 && (
                <div
                  style={{
                    flex: '0 0 40px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#334155',
                    fontSize: 20,
                  }}
                >
                  →
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Hub ─────────────────────────────────────────────────────────────────

export default function OnTheHorizonHub() {
  const user = auth.currentUser;
  const [activeCategory, setActiveCategory] = useState<FeatureCategory | 'all'>('all');
  const counts = useWaitlistCounts();

  const categories: Array<FeatureCategory | 'all'> = ['all', 'athlete', 'community', 'media', 'compliance'];

  const filtered = activeCategory === 'all'
    ? FEATURES
    : FEATURES.filter(f => f.category === activeCategory);

  const totalWaitlist = Object.values(counts).reduce((s, c) => s + c, 0);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0F172A 0%, #1E1B4B 50%, #0F172A 100%)',
        padding: '40px 20px 80px',
        fontFamily: 'inherit',
      }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 16px',
              borderRadius: 20,
              background: 'rgba(99,102,241,0.15)',
              border: '1px solid rgba(99,102,241,0.3)',
              fontSize: 12,
              fontWeight: 600,
              color: '#A5B4FC',
              marginBottom: 20,
              letterSpacing: '0.06em',
            }}
          >
            <Telescope size={14} />
            ON THE HORIZON
          </div>

          <h1
            style={{
              fontSize: 'clamp(28px, 5vw, 48px)',
              fontWeight: 900,
              color: '#F1F5F9',
              margin: '0 0 16px',
              lineHeight: 1.1,
            }}
          >
            What's Coming to Plajah
          </h1>

          <p style={{ fontSize: 16, color: '#94A3B8', maxWidth: 600, margin: '0 auto 20px', lineHeight: 1.7 }}>
            Ten features under active development that will transform how high school athletes
            build their careers, earn from their talent, and connect with their communities.
          </p>

          {totalWaitlist > 0 && (
            <p style={{ fontSize: 13, color: '#64748B' }}>
              {totalWaitlist.toLocaleString()} people are already on the waitlist.
            </p>
          )}
        </div>

        {/* Roadmap */}
        <RoadmapTimeline />

        {/* Category filter */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            marginBottom: 28,
            justifyContent: 'center',
          }}
        >
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              style={{
                padding: '7px 16px',
                borderRadius: 20,
                border: '1px solid',
                borderColor: activeCategory === cat ? '#6366F1' : 'rgba(255,255,255,0.1)',
                background: activeCategory === cat ? 'rgba(99,102,241,0.2)' : 'transparent',
                color: activeCategory === cat ? '#A5B4FC' : '#64748B',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s',
                letterSpacing: '0.03em',
              }}
            >
              {cat === 'all' ? 'All Features' : CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>

        {/* Feature grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 20,
          }}
        >
          {filtered.map(feature => (
            <FeatureCard
              key={feature.id}
              feature={feature}
              waitlistCount={counts[feature.id] ?? 0}
              userId={user?.uid ?? null}
            />
          ))}
        </div>

        {/* Footer note */}
        <div
          style={{
            marginTop: 48,
            textAlign: 'center',
            padding: '20px',
            borderRadius: 12,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <p style={{ margin: 0, fontSize: 12, color: '#475569', lineHeight: 1.7 }}>
            Features are currently inactive and labeled "On The Horizon." Waitlist registrations
            are stored securely and used only to notify you when your feature activates.
            Revenue models and ETAs are subject to change based on regulatory guidance and development progress.
          </p>
        </div>
      </div>
    </div>
  );
}
