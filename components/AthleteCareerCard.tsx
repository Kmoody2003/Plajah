/**
 * AthleteCareerCard — Verified on-chain career profile card.
 *
 * Shows an athlete's chain-verified stats, highlight NFT gallery,
 * NIL earnings, scholar fund, and PLAJ token balance.
 * Doubles as a shareable recruiting card (export to PNG via html2canvas).
 *
 * Integrates with:
 *   - athleteChainService (career stats, NFTs, NIL deals)
 *   - blockchainWalletService (PLAJ balance)
 *   - StatCardBuilder (existing sports stat card UI)
 *   - LicenseRegistry (scout purchase flow)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Shield, Zap, Trophy, DollarSign, ExternalLink, Download,
  Share2, CheckCircle2, Clock, Users, Star, Lock, ChevronRight,
  Sparkles, TrendingUp, Award,
} from 'lucide-react';
import { buildShareUrl } from '../services/deepLinkService';
import {
  getChainCareerStats, getAthleteHighlightNFTs,
  purchaseStatLicense,
  type CareerStatSummary, type HighlightNFTMeta,
} from '../services/athleteChainService';
import { auth } from '../services/firebase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  athleteUserId: string;
  athleteName: string;
  athletePhoto?: string;
  schoolName: string;
  sport: string;
  graduatingClass: number;
  /** If true, shows the scout/recruiter purchase flow */
  scoutMode?: boolean;
  onClose?: () => void;
  /** Render inline (no modal overlay) — used inside profile tabs */
  inline?: boolean;
}

// ─── Helper: verified stat row ────────────────────────────────────────────────

const StatRow: React.FC<{ label: string; value: number | string; accent?: boolean }> = ({
  label, value, accent = false,
}) => (
  <div className="flex items-center justify-between py-2.5 border-b border-white/5">
    <span className="text-white/40 text-xs font-bold uppercase tracking-wider">{label}</span>
    <span className={`text-sm font-black tabular-nums ${accent ? 'text-amber-400' : 'text-white'}`}>
      {value}
    </span>
  </div>
);

// Sport-specific stat display
const SPORT_STATS: Record<string, { key: keyof CareerStatSummary; label: string }[]> = {
  FOOTBALL: [
    { key: 'touchdowns',    label: 'Touchdowns' },
    { key: 'rushingYards',  label: 'Rushing Yards' },
    { key: 'passingYards',  label: 'Passing Yards' },
    { key: 'receivingYards',label: 'Receiving Yards' },
    { key: 'interceptions', label: 'Interceptions' },
  ],
  BASKETBALL: [
    { key: 'points2pt',  label: '2-PT Field Goals' },
    { key: 'points3pt',  label: '3-PT Field Goals' },
    { key: 'rebounds',   label: 'Rebounds' },
    { key: 'assists',    label: 'Assists' },
  ],
  SOCCER: [
    { key: 'goals',   label: 'Goals' },
    { key: 'assists', label: 'Assists' },
  ],
  BASEBALL: [
    { key: 'homeRuns', label: 'Home Runs' },
  ],
};

// ─── NFT tile ─────────────────────────────────────────────────────────────────

const NFTTile: React.FC<{ nft: HighlightNFTMeta; onClick: () => void }> = ({ nft, onClick }) => (
  <motion.button
    whileHover={{ scale: 1.03 }}
    whileTap={{ scale: 0.97 }}
    onClick={onClick}
    className="relative aspect-square bg-gradient-to-br from-amber-500/20 to-orange-600/20 rounded-2xl border border-amber-500/20 overflow-hidden group"
  >
    {/* Glow shimmer */}
    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-br from-amber-500/10 to-transparent" />

    <div className="absolute inset-0 flex flex-col items-center justify-center p-3 gap-2">
      <span className="text-2xl">
        {nft.statType === 'TOUCHDOWN' ? '🏈' :
         nft.statType === 'GOAL' ? '⚽' :
         nft.statType === 'THREE_POINTER' ? '🏀' :
         nft.statType === 'HOME_RUN' ? '⚾' : '⚡'}
      </span>
      <p className="text-amber-400 text-[9px] font-black uppercase tracking-widest text-center leading-tight">
        {nft.statType.replace(/_/g, ' ')}
      </p>
      <p className="text-white/30 text-[8px]">1 of {nft.maxEditions}</p>
    </div>

    {/* Chain verified badge */}
    <div className="absolute top-1.5 right-1.5">
      <CheckCircle2 size={12} className="text-green-400" />
    </div>
  </motion.button>
);

// ─── Main component ────────────────────────────────────────────────────────────

const AthleteCareerCard: React.FC<Props> = ({
  athleteUserId, athleteName, athletePhoto, schoolName, sport,
  graduatingClass, scoutMode = false, onClose, inline = false,
}) => {
  const [stats, setStats]       = useState<CareerStatSummary | null>(null);
  const [nfts, setNfts]         = useState<HighlightNFTMeta[]>([]);
  const [loading, setLoading]   = useState(true);
  const [activeTab, setTab]     = useState<'stats' | 'nfts' | 'earnings' | 'recruit'>('stats');
  const [scoutBuying, setScoutBuying] = useState(false);
  const [scoutDone, setScoutDone]     = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      getChainCareerStats(athleteUserId),
      getAthleteHighlightNFTs(athleteUserId),
    ]).then(([s, n]) => {
      setStats(s);
      setNfts(n);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [athleteUserId]);

  const exportCard = useCallback(async () => {
    if (!cardRef.current) return;
    const { default: html2canvas } = await import('html2canvas' as any);
    const canvas = await html2canvas(cardRef.current, { backgroundColor: '#0a0a12', scale: 2 });
    const link = document.createElement('a');
    link.download = `${athleteName.replace(/\s+/g, '_')}_verified_stats.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, [athleteName]);

  const buyScoutLicense = async () => {
    if (!auth.currentUser) return;
    setScoutBuying(true);
    await purchaseStatLicense({
      athleteUserId,
      purchaserUserId: auth.currentUser.uid,
      accessType: 'CAREER_STATS',
      amountUsd: 49.99,
    });
    setScoutBuying(false);
    setScoutDone(true);
  };

  const displayStats = SPORT_STATS[sport] ?? SPORT_STATS.FOOTBALL;

  return (
    <motion.div
      initial={{ scale: 0.97, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={inline ? '' : 'fixed inset-0 z-[950] flex items-center justify-center bg-black/80 backdrop-blur-md p-4'}
      onClick={inline ? undefined : e => e.target === e.currentTarget && onClose?.()}
    >
      <div
        ref={cardRef}
        className="w-full max-w-lg bg-[#0a0a12] border border-white/10 rounded-[2rem] overflow-hidden"
        style={{ maxHeight: inline ? 'none' : '90vh', display: 'flex', flexDirection: 'column' }}
      >

        {/* ── Hero ────────────────────────────────────────────────────────── */}
        <div className="relative bg-gradient-to-br from-amber-900/30 via-orange-900/20 to-black p-6 shrink-0">
          {athletePhoto && (
            <img src={athletePhoto} alt=""
              className="absolute inset-0 w-full h-full object-cover opacity-15 blur-sm" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a12] via-transparent to-transparent" />

          <div className="relative flex items-end gap-4">
            {/* Avatar */}
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500/40 to-orange-600/40 border border-amber-500/30 flex items-center justify-center shrink-0 overflow-hidden">
              {athletePhoto
                ? <img src={athletePhoto} alt={athleteName} className="w-full h-full object-cover" />
                : <span className="text-3xl font-black text-amber-400">{athleteName.charAt(0)}</span>
              }
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-white/30 text-[10px] font-black uppercase tracking-widest">{sport}</span>
                <span className="text-white/15">•</span>
                <span className="text-white/30 text-[10px] font-black uppercase tracking-widest">Class of {graduatingClass}</span>
              </div>
              <h2 className="text-white font-black text-2xl leading-none uppercase tracking-tight truncate">
                {athleteName}
              </h2>
              <p className="text-white/40 text-sm mt-0.5">{schoolName}</p>
            </div>

            {/* Chain verified badge */}
            <div className="shrink-0">
              {stats?.verified ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/15 border border-green-500/30 rounded-full">
                  <CheckCircle2 size={12} className="text-green-400" />
                  <span className="text-green-400 text-[10px] font-black uppercase tracking-wider">Verified</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 rounded-full">
                  <Clock size={12} className="text-white/30" />
                  <span className="text-white/30 text-[10px] font-black uppercase tracking-wider">Pending</span>
                </div>
              )}
            </div>
          </div>

          {/* Chain badge row */}
          <div className="relative flex items-center gap-2 mt-4">
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-black/40 border border-white/8 rounded-full">
              <Shield size={10} className="text-amber-400" />
              <span className="text-white/50 text-[9px] font-bold uppercase tracking-wider">Polygon</span>
            </div>
            {nfts.length > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-black/40 border border-amber-500/20 rounded-full">
                <Sparkles size={10} className="text-amber-400" />
                <span className="text-amber-400 text-[9px] font-bold uppercase tracking-wider">{nfts.length} Highlight NFT{nfts.length > 1 ? 's' : ''}</span>
              </div>
            )}
            {stats && parseFloat(stats.totalNilEarned) > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-black/40 border border-green-500/20 rounded-full">
                <DollarSign size={10} className="text-green-400" />
                <span className="text-green-400 text-[9px] font-bold uppercase tracking-wider">NIL Active</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Tab nav ─────────────────────────────────────────────────────── */}
        <div className="flex border-b border-white/8 shrink-0">
          {[
            { id: 'stats' as const,   label: 'Stats',    icon: TrendingUp },
            { id: 'nfts' as const,    label: 'Moments',  icon: Sparkles },
            { id: 'earnings' as const,label: 'Earnings', icon: DollarSign },
            { id: 'recruit' as const, label: 'Recruit',  icon: Award },
          ].map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3.5 text-[10px] font-black uppercase tracking-wider border-b-2 transition-all ${
                activeTab === id
                  ? 'border-amber-500 text-amber-400'
                  : 'border-transparent text-white/25 hover:text-white/50'
              }`}>
              <Icon size={12} /> {label}
            </button>
          ))}
        </div>

        {/* ── Tab content ─────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-white/20 text-sm">
              <div className="animate-spin w-5 h-5 border-2 border-amber-500/30 border-t-amber-500 rounded-full" />
            </div>
          ) : (

            <AnimatePresence mode="wait">
              <motion.div key={activeTab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >

                {/* ── Stats tab ──────────────────────────────────────────── */}
                {activeTab === 'stats' && (
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <Shield size={14} className="text-amber-400" />
                      <p className="text-white/30 text-[10px] font-black uppercase tracking-widest">
                        On-Chain Verified Career Stats
                      </p>
                    </div>
                    {stats ? (
                      <div className="space-y-0">
                        {displayStats.map(({ key, label }) => (
                          <StatRow
                            key={key}
                            label={label}
                            value={stats[key] as number}
                            accent={(stats[key] as number) > 0}
                          />
                        ))}
                        <div className="mt-4 p-3 bg-amber-500/8 border border-amber-500/15 rounded-xl">
                          <p className="text-amber-400/70 text-[10px] leading-relaxed">
                            These stats are permanently recorded on the Polygon blockchain and cannot be altered.
                            Each stat was verified by an authorized game producer during a live Plajah Sports Broadcast.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-white/20 text-sm text-center py-8">
                        No on-chain stats yet — stats are recorded during Live Sports Broadcasts.
                      </p>
                    )}
                  </div>
                )}

                {/* ── Highlight NFTs tab ─────────────────────────────────── */}
                {activeTab === 'nfts' && (
                  <div>
                    <p className="text-white/30 text-[10px] font-black uppercase tracking-widest mb-4">
                      Highlight Moment NFTs
                    </p>
                    {nfts.length > 0 ? (
                      <div className="grid grid-cols-3 gap-3">
                        {nfts.map(nft => (
                          <NFTTile
                            key={nft.tokenId}
                            nft={nft}
                            onClick={() => {
                              if (nft.clipIpfsCid)
                                window.open(`https://ipfs.io/ipfs/${nft.clipIpfsCid}`, '_blank');
                            }}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <Sparkles size={32} className="text-white/10 mx-auto mb-3" />
                        <p className="text-white/20 text-sm">
                          Highlight NFTs are minted from verified game moments during live broadcasts.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Earnings tab ───────────────────────────────────────── */}
                {activeTab === 'earnings' && stats && (
                  <div className="space-y-4">
                    <p className="text-white/30 text-[10px] font-black uppercase tracking-widest">
                      On-Chain Earnings
                    </p>

                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: 'NFT Revenue', value: `$${stats.totalNftRevenue}`, color: 'amber', icon: Sparkles },
                        { label: 'NIL Earned',   value: `$${stats.totalNilEarned}`,  color: 'green', icon: DollarSign },
                      ].map(({ label, value, color, icon: Icon }) => (
                        <div key={label} className={`p-4 rounded-2xl border bg-${color}-500/8 border-${color}-500/20`}>
                          <Icon size={16} className={`text-${color}-400 mb-2`} />
                          <p className={`text-${color}-400 font-black text-xl`}>{value}</p>
                          <p className="text-white/30 text-[10px] font-bold uppercase tracking-wider mt-1">{label}</p>
                        </div>
                      ))}
                    </div>

                    <div className="p-4 bg-white/4 border border-white/8 rounded-2xl space-y-2">
                      <p className="text-white/30 text-[10px] font-black uppercase tracking-widest">How It Works</p>
                      {[
                        ['Highlight NFT Sales', '70% to athlete, 20% to school, 10% to Plajah'],
                        ['NIL Deals (auto)',    '90% to athlete, 5% to school, 5% to Plajah'],
                        ['Stat Licenses',       '80% to athlete, 10% to school, 10% to Plajah'],
                        ['PLAJ Token Rewards',  'Earned per milestone, convertible to USDC'],
                      ].map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-3">
                          <span className="text-white/40 text-[10px]">{k}</span>
                          <span className="text-white/60 text-[10px] text-right">{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Recruit tab ────────────────────────────────────────── */}
                {activeTab === 'recruit' && (
                  <div className="space-y-4">
                    <p className="text-white/30 text-[10px] font-black uppercase tracking-widest">
                      Recruiting Profile
                    </p>

                    {scoutMode ? (
                      scoutDone ? (
                        <div className="p-5 bg-green-500/10 border border-green-500/30 rounded-2xl text-center">
                          <CheckCircle2 size={32} className="text-green-400 mx-auto mb-3" />
                          <p className="text-green-400 font-black text-sm uppercase tracking-wide">
                            Access Granted
                          </p>
                          <p className="text-white/40 text-xs mt-1">
                            Full verified stat package unlocked. Valid 365 days.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="p-4 bg-white/4 border border-white/8 rounded-2xl">
                            <p className="text-white font-black text-sm mb-1">Career Stats Package</p>
                            <p className="text-white/40 text-xs leading-relaxed">
                              Full verified on-chain stats, all highlight clips, game-by-game breakdown.
                              Revenue split: 80% athlete / 10% school / 10% Plajah.
                            </p>
                            <p className="text-amber-400 font-black text-lg mt-3">$49.99 / year</p>
                          </div>
                          <button onClick={buyScoutLicense} disabled={scoutBuying}
                            className="w-full py-4 bg-amber-500 hover:bg-amber-600 text-black font-black text-sm uppercase tracking-widest rounded-2xl disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                            {scoutBuying
                              ? <><div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> Processing...</>
                              : <><Lock size={16} /> Unlock Verified Profile</>}
                          </button>
                        </div>
                      )
                    ) : (
                      <div className="space-y-3">
                        <div className="p-4 bg-white/4 border border-white/8 rounded-2xl">
                          <p className="text-white/60 text-xs leading-relaxed">
                            College coaches and scouts can purchase access to this athlete's full verified stat package.
                            All stats are permanently recorded on the Polygon blockchain and cannot be altered or inflated.
                          </p>
                        </div>
                        <div className="p-4 bg-amber-500/8 border border-amber-500/15 rounded-2xl">
                          <p className="text-amber-400 text-[10px] font-black uppercase tracking-widest mb-2">
                            What's Included
                          </p>
                          {[
                            'All on-chain verified career stats',
                            'Highlight video clips (IPFS stored)',
                            'Game-by-game stat breakdown',
                            'Producer verification signatures',
                            'NIL deal history (public deals)',
                          ].map(item => (
                            <div key={item} className="flex items-center gap-2 py-1">
                              <CheckCircle2 size={12} className="text-amber-400 shrink-0" />
                              <span className="text-white/50 text-[11px]">{item}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

              </motion.div>
            </AnimatePresence>
          )}
        </div>

        {/* ── Footer actions ───────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 px-5 py-4 border-t border-white/8 shrink-0">
          <button onClick={exportCard}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-white/5 border border-white/10 rounded-2xl text-white/50 text-[10px] font-black uppercase tracking-wider hover:bg-white/10 transition-colors">
            <Download size={12} /> Export Card
          </button>
          <button onClick={() => {
            // Land on the athlete's profile (which shows this card) — a working link.
            const url = buildShareUrl('profile', athleteUserId);
            navigator.clipboard?.writeText(url).catch(() => {});
          }}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-white/5 border border-white/10 rounded-2xl text-white/50 text-[10px] font-black uppercase tracking-wider hover:bg-white/10 transition-colors">
            <Share2 size={12} /> Share Profile
          </button>
          {onClose && (
            <button onClick={onClose}
              className="px-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-white/50 text-[10px] font-black uppercase tracking-wider hover:bg-white/10 transition-colors">
              ✕
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default AthleteCareerCard;
