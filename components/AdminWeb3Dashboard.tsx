/**
 * Admin Web3 Dashboard
 * Admin-only. Never shown to regular users.
 * Gate this component behind: isFeatureEnabled('WEB3_ADMIN_DASHBOARD', uid, isAdmin)
 *
 * Shows: all feature flags, their status, phase, rollout %, and toggle controls.
 * Opens Web3Infographic in a full-screen modal.
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Shield, Zap, ToggleLeft, ToggleRight, ChevronRight,
  BookOpen, Film, Music2, Globe, Layers, BarChart2,
  Lock, Unlock, TrendingUp, AlertTriangle, CheckCircle2,
  ExternalLink, RefreshCw,
} from 'lucide-react';
import {
  getAllFlags, updateFlag, getFlagsByPhase,
  type FeatureFlag, type Web3FlagName, type FeaturePhase,
} from '../services/featureFlagService';
import { Web3Infographic } from './Web3Infographic';

// ─── Phase config ──────────────────────────────────────────────────────────────

const PHASE_META: Record<FeaturePhase, { label: string; color: string; description: string }> = {
  0: { label: 'Phase 0',  color: '#6b7280', description: 'Infrastructure — Admin tools only' },
  1: { label: 'Phase 1',  color: '#f97316', description: 'Creation Certificates + NFTs' },
  2: { label: 'Phase 2',  color: '#a855f7', description: 'On-Chain Licensing Marketplace' },
  3: { label: 'Phase 3',  color: '#3b82f6', description: 'Fan Investment + Collab Contracts' },
  4: { label: 'Phase 4',  color: '#10b981', description: 'Lightning Micropayments' },
  5: { label: 'Phase 5',  color: '#f59e0b', description: 'Full Ecosystem: DeFi + Nodes + PLAJ' },
};

const VERTICAL_ICON: Record<string, React.ReactNode> = {
  MUSIC:      <Music2 size={12} />,
  FILM:       <Film size={12} />,
  BOOKS:      <BookOpen size={12} />,
  JOURNALISM: <Globe size={12} />,
  TALEO:      <TrendingUp size={12} />,
  RELLO:      <Layers size={12} />,
  LOREA:      <BarChart2 size={12} />,
  IPWORLDS:   <Globe size={12} />,
  ALL:        <Zap size={12} />,
};

// ─── Component ─────────────────────────────────────────────────────────────────

interface AdminWeb3DashboardProps {
  adminId: string;
}

export const AdminWeb3Dashboard: React.FC<AdminWeb3DashboardProps> = ({ adminId }) => {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [selectedPhase, setSelectedPhase] = useState<FeaturePhase | 'ALL'>('ALL');
  const [showInfographic, setShowInfographic] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date>(new Date());

  useEffect(() => {
    setFlags(getAllFlags());
  }, []);

  const visibleFlags = selectedPhase === 'ALL'
    ? flags
    : flags.filter(f => f.phase === selectedPhase);

  const enabledCount = flags.filter(f => f.enabled).length;
  const liveCount    = flags.filter(f => f.enabled && f.rolloutPercentage > 0).length;

  async function handleToggle(flag: FeatureFlag) {
    if (updating) return;
    setUpdating(flag.name);
    try {
      await updateFlag(flag.name as Web3FlagName, { enabled: !flag.enabled }, adminId);
      setFlags(prev => prev.map(f => f.name === flag.name ? { ...f, enabled: !f.enabled } : f));
    } finally {
      setUpdating(null);
    }
  }

  async function handleRollout(flag: FeatureFlag, pct: number) {
    if (updating) return;
    setUpdating(flag.name);
    try {
      await updateFlag(flag.name as Web3FlagName, {
        rolloutPercentage: pct,
        adminOnly: pct === 0,
      }, adminId);
      setFlags(prev => prev.map(f =>
        f.name === flag.name ? { ...f, rolloutPercentage: pct, adminOnly: pct === 0 } : f,
      ));
    } finally {
      setUpdating(null);
    }
  }

  return (
    <>
      <div className="min-h-screen bg-[#050505] text-white p-6 font-sans">

        {/* Header */}
        <div className="max-w-6xl mx-auto">
          <div className="flex items-start justify-between mb-8">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Shield size={16} className="text-orange-400" />
                <span className="text-[9px] font-black uppercase tracking-[0.3em] text-orange-400/70">
                  Admin — Internal Only
                </span>
              </div>
              <h1 className="text-2xl font-black text-white">Plajah Web3 Infrastructure</h1>
              <p className="text-sm text-white/40 mt-1">
                Feature flags · Smart contracts · Blockchain rollout control
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setFlags(getAllFlags()); setLastSync(new Date()); }}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/50 hover:text-white/80 text-xs transition-all"
              >
                <RefreshCw size={12} /> Sync
              </button>
              <button
                onClick={() => setShowInfographic(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/30 text-orange-400 text-xs font-bold transition-all"
              >
                <BarChart2 size={13} /> View Infographic
              </button>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Total Features',    value: flags.length,    color: '#6b7280', icon: <Layers size={14} /> },
              { label: 'Admin Preview',     value: enabledCount,    color: '#f97316', icon: <Lock size={14} /> },
              { label: 'Live to Users',     value: liveCount,       color: '#10b981', icon: <Unlock size={14} /> },
              { label: 'Phases Remaining',  value: 5 - Math.max(...flags.filter(f => f.enabled && f.rolloutPercentage > 0).map(f => f.phase), 0), color: '#a855f7', icon: <TrendingUp size={14} /> },
            ].map(stat => (
              <div key={stat.label} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${stat.color}20`, color: stat.color }}>
                  {stat.icon}
                </div>
                <div>
                  <p className="text-[8px] font-black uppercase tracking-[0.2em] text-white/30">{stat.label}</p>
                  <p className="text-lg font-black text-white">{stat.value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Phase filter tabs */}
          <div className="flex items-center gap-2 mb-6 flex-wrap">
            <button
              onClick={() => setSelectedPhase('ALL')}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${selectedPhase === 'ALL' ? 'bg-white/15 text-white' : 'bg-white/[0.03] text-white/40 hover:text-white/70'}`}
            >
              All Features
            </button>
            {(Object.entries(PHASE_META) as [string, typeof PHASE_META[0]][]).map(([phase, meta]) => {
              const phaseNum = parseInt(phase) as FeaturePhase;
              const phaseFlagCount = getFlagsByPhase(phaseNum).length;
              const phaseEnabled = getFlagsByPhase(phaseNum).filter(f => f.enabled).length;
              return (
                <button
                  key={phase}
                  onClick={() => setSelectedPhase(phaseNum)}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2 ${selectedPhase === phaseNum ? 'text-white' : 'text-white/40 hover:text-white/70'}`}
                  style={selectedPhase === phaseNum ? { background: `${meta.color}20`, border: `1px solid ${meta.color}40` } : { background: 'rgba(255,255,255,0.03)' }}
                >
                  <span style={{ color: meta.color }}>{meta.label}</span>
                  <span className="text-white/30">{phaseEnabled}/{phaseFlagCount}</span>
                </button>
              );
            })}
          </div>

          {/* Feature flag cards */}
          <div className="space-y-3">
            {visibleFlags.map(flag => {
              const phase = PHASE_META[flag.phase];
              const isUpdating = updating === flag.name;

              return (
                <motion.div
                  key={flag.name}
                  layout
                  className="bg-white/[0.025] border border-white/[0.05] rounded-2xl p-5 hover:border-white/10 transition-all"
                >
                  <div className="flex items-start justify-between gap-4">
                    {/* Left: info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span
                          className="text-[7px] font-black uppercase tracking-[0.2em] px-2 py-0.5 rounded-full"
                          style={{ background: `${phase.color}20`, color: phase.color }}
                        >
                          {phase.label}
                        </span>
                        <span className="flex items-center gap-1 text-[7px] font-black uppercase tracking-wider text-white/30 bg-white/5 px-2 py-0.5 rounded-full">
                          {VERTICAL_ICON[flag.vertical]}
                          {flag.vertical}
                        </span>
                        {flag.adminOnly && (
                          <span className="flex items-center gap-1 text-[7px] font-black uppercase tracking-wider text-orange-400/70 bg-orange-500/10 px-2 py-0.5 rounded-full">
                            <Lock size={8} /> Admin Preview
                          </span>
                        )}
                        {flag.enabled && flag.rolloutPercentage > 0 && (
                          <span className="flex items-center gap-1 text-[7px] font-black uppercase tracking-wider text-emerald-400/70 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                            <CheckCircle2 size={8} /> {flag.rolloutPercentage}% Live
                          </span>
                        )}
                        {!flag.enabled && (
                          <span className="text-[7px] font-black uppercase tracking-wider text-white/20">Off</span>
                        )}
                      </div>
                      <p className="text-sm font-black text-white">{flag.label}</p>
                      <p className="text-[10px] text-white/40 mt-0.5">{flag.description}</p>
                    </div>

                    {/* Right: controls */}
                    <div className="flex flex-col items-end gap-3 shrink-0">
                      {/* Enable toggle */}
                      <button
                        onClick={() => handleToggle(flag)}
                        disabled={isUpdating || flag.name === 'WEB3_ADMIN_DASHBOARD'}
                        className="flex items-center gap-2 transition-all disabled:opacity-50"
                      >
                        {flag.enabled
                          ? <ToggleRight size={28} className="text-orange-400" />
                          : <ToggleLeft  size={28} className="text-white/20" />
                        }
                      </button>

                      {/* Rollout slider (only shown when enabled and not admin-dashboard) */}
                      {flag.enabled && flag.name !== 'WEB3_ADMIN_DASHBOARD' && (
                        <div className="flex items-center gap-2">
                          <span className="text-[8px] text-white/30 font-mono">Rollout</span>
                          <div className="flex gap-1">
                            {[0, 10, 25, 50, 100].map(pct => (
                              <button
                                key={pct}
                                onClick={() => handleRollout(flag, pct)}
                                className={`text-[8px] px-2 py-0.5 rounded-lg font-black transition-all ${flag.rolloutPercentage === pct ? 'bg-orange-500/30 text-orange-400' : 'bg-white/5 text-white/30 hover:text-white/60'}`}
                              >
                                {pct === 0 ? 'Admin' : `${pct}%`}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Contract status */}
          <div className="mt-10 p-5 bg-white/[0.02] border border-white/[0.05] rounded-2xl">
            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-white/30 mb-4">Smart Contract Deployment Status</p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { name: 'PLAJToken',              env: 'VITE_CONTRACT_PLAJ_TOKEN' },
                { name: 'PlajahMusicNFT',         env: 'VITE_CONTRACT_MUSIC_NFT' },
                { name: 'PlajahLicenseRegistry',  env: 'VITE_CONTRACT_LICENSE_REGISTRY' },
                { name: 'FractionalShares',       env: 'VITE_CONTRACT_FRACTIONAL_SHARES' },
                { name: 'RoyaltyDistributor',     env: 'VITE_CONTRACT_ROYALTY_DISTRIBUTOR' },
                { name: 'Bitcoin Ordinals API',   env: 'VITE_ORDINALSBOT_API_KEY' },
              ].map(contract => {
                const address = (import.meta as any).env?.[contract.env];
                const deployed = !!address;
                return (
                  <div key={contract.name} className="flex items-center gap-3 bg-white/[0.02] rounded-xl p-3">
                    <div className={`w-2 h-2 rounded-full ${deployed ? 'bg-emerald-400' : 'bg-white/20'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[8px] font-black text-white/70 truncate">{contract.name}</p>
                      <p className="text-[7px] text-white/30 font-mono truncate">
                        {deployed ? `${address.slice(0, 8)}...${address.slice(-6)}` : 'Not deployed'}
                      </p>
                    </div>
                    {deployed && (
                      <a
                        href={`https://polygonscan.com/address/${address}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-white/20 hover:text-white/60 transition-colors"
                      >
                        <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-4 p-3 bg-orange-500/10 border border-orange-500/20 rounded-xl flex items-start gap-3">
              <AlertTriangle size={13} className="text-orange-400 mt-0.5 shrink-0" />
              <p className="text-[9px] text-orange-400/80">
                Deploy to Mumbai testnet first: <code className="font-mono">cd blockchain && npm install && npm run deploy:testnet</code>
              </p>
            </div>
          </div>

          <p className="text-center text-[8px] text-white/20 mt-6 font-mono">
            Last synced: {lastSync.toLocaleTimeString()} · Admin: {adminId}
          </p>
        </div>
      </div>

      {/* Infographic modal */}
      <AnimatePresence>
        {showInfographic && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-xl overflow-y-auto"
          >
            <button
              onClick={() => setShowInfographic(false)}
              className="fixed top-5 right-5 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/60 hover:text-white transition-all"
            >
              ✕
            </button>
            <Web3Infographic />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default AdminWeb3Dashboard;
