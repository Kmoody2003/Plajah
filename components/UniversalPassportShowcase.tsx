import React, { useState, useEffect } from 'react';
import {
  Gamepad2,
  Trophy,
  ShieldCheck,
  Sparkles,
  ExternalLink,
  Flame,
  CheckCircle2,
  RefreshCw,
  Copy,
  ChevronRight,
  Plus,
} from 'lucide-react';
import {
  UniversalGamerPassport,
  GamingPlatform,
  GamerTier,
} from '../types/gaming';
import { universalGamerService } from '../services/gaming/universalGamerService';
import { TIER_CONFIG } from '../services/gaming/plajahScoreEngine';

interface UniversalPassportShowcaseProps {
  userId: string;
  username?: string;
}

const TIER_COLORS: Record<GamerTier, { bg: string; text: string; border: string; glow: string }> = {
  BRONZE_NOMAD: {
    bg: 'from-amber-900/30 to-amber-700/10',
    text: 'text-amber-500',
    border: 'border-amber-600/30',
    glow: 'rgba(217, 119, 6, 0.2)',
  },
  SILVER_EXPLORER: {
    bg: 'from-slate-400/30 to-slate-200/10',
    text: 'text-slate-300',
    border: 'border-slate-400/30',
    glow: 'rgba(203, 213, 225, 0.2)',
  },
  GOLD_CHAMPION: {
    bg: 'from-yellow-500/30 to-amber-400/10',
    text: 'text-yellow-400',
    border: 'border-yellow-400/40',
    glow: 'rgba(250, 204, 21, 0.3)',
  },
  PLATINUM_VANGUARD: {
    bg: 'from-cyan-500/30 to-blue-500/10',
    text: 'text-cyan-400',
    border: 'border-cyan-400/40',
    glow: 'rgba(34, 211, 238, 0.3)',
  },
  DIAMOND_PARAGON: {
    bg: 'from-purple-500/30 to-pink-500/10',
    text: 'text-fuchsia-400',
    border: 'border-fuchsia-500/40',
    glow: 'rgba(217, 70, 239, 0.3)',
  },
  PLAJAH_SOVEREIGN: {
    bg: 'from-rose-500/40 via-purple-600/30 to-amber-500/30',
    text: 'text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-rose-300 to-cyan-300',
    border: 'border-purple-400/60',
    glow: 'rgba(244, 63, 94, 0.4)',
  },
};

export const UniversalPassportShowcase: React.FC<UniversalPassportShowcaseProps> = ({
  userId,
  username = 'Plajah Pioneer',
}) => {
  const [passport, setPassport] = useState<UniversalGamerPassport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showAttestationModal, setShowAttestationModal] = useState(false);
  const [copiedDid, setCopiedDid] = useState(false);
  const [connectingPlatform, setConnectingPlatform] = useState<GamingPlatform | null>(null);
  const [handleInput, setHandleInput] = useState('');

  useEffect(() => {
    loadPassport();
  }, [userId]);

  const loadPassport = async () => {
    setIsLoading(true);
    try {
      let data = await universalGamerService.getPassport(userId);
      if (!data) {
        data = await universalGamerService.initializeDemoPassport(userId, username);
      }
      setPassport(data);
    } catch (e) {
      console.error('Failed to load passport:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSyncAll = async () => {
    if (!passport || isSyncing) return;
    setIsSyncing(true);
    try {
      const refreshed = await universalGamerService.initializeDemoPassport(userId, passport.username);
      setPassport(refreshed);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleConnectPlatform = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connectingPlatform || !handleInput.trim()) return;

    setIsSyncing(true);
    try {
      const updated = await universalGamerService.linkPlatform(userId, connectingPlatform, handleInput.trim());
      setPassport(updated);
      setConnectingPlatform(null);
      setHandleInput('');
    } finally {
      setIsSyncing(false);
    }
  };

  const copyDidToClipboard = () => {
    if (passport?.did) {
      navigator.clipboard?.writeText(passport.did);
      setCopiedDid(true);
      setTimeout(() => setCopiedDid(false), 2000);
    }
  };

  if (isLoading || !passport) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-neutral-900/60 rounded-3xl border border-white/10 animate-pulse text-white/50">
        <Gamepad2 className="w-10 h-10 animate-spin text-purple-400 mb-3" />
        <p className="text-sm">Synthesizing Universal Gaming Passport...</p>
      </div>
    );
  }

  const tierStyle = TIER_COLORS[passport.combinedScore.tier];
  const tierConfig = TIER_CONFIG.find((t) => t.tier === passport.combinedScore.tier);
  const steamData = passport.combinedScore.platformBreakdowns.STEAM;
  const xboxData = passport.combinedScore.platformBreakdowns.XBOX;
  const psnData = passport.combinedScore.platformBreakdowns.PLAYSTATION;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* ── PASSPORT HERO CARD ──────────────────────────────────────────────── */}
      <div
        className={`relative overflow-hidden rounded-3xl border ${tierStyle.border} bg-gradient-to-br ${tierStyle.bg} backdrop-blur-xl p-6 md:p-8 shadow-2xl`}
        style={{ boxShadow: `0 20px 50px -10px ${tierStyle.glow}` }}
      >
        {/* Ambient Top Glow */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          {/* Identity & DID */}
          <div className="flex items-start gap-4">
            <div className="relative">
              <img
                src={passport.avatarUrl || 'https://images.unsplash.com/photo-1563089145-599997674d42?w=150'}
                alt={passport.username}
                className="w-20 h-20 rounded-2xl object-cover border-2 border-white/20 shadow-md"
              />
              <span className="absolute -bottom-2 -right-2 bg-emerald-500 text-black p-1 rounded-full text-xs" title="Decentralized Identity Verified">
                <ShieldCheck size={14} />
              </span>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-white/10 text-white/70 font-semibold border border-white/10">
                  Universal Passport
                </span>
                <span className={`text-xs uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-black/40 ${tierStyle.text} border ${tierStyle.border}`}>
                  {tierConfig?.label}
                </span>
              </div>
              <h2 className="text-2xl md:text-3xl font-black text-white">{passport.username}</h2>
              
              <div className="flex items-center gap-2 mt-2 text-xs text-white/50">
                <span className="font-mono truncate max-w-[200px] md:max-w-xs">{passport.did}</span>
                <button
                  onClick={copyDidToClipboard}
                  className="hover:text-white transition-colors p-1"
                  title="Copy DID"
                >
                  {copiedDid ? <CheckCircle2 size={13} className="text-emerald-400" /> : <Copy size={13} />}
                </button>
              </div>
            </div>
          </div>

          {/* Plajah Score Highlight */}
          <div className="flex flex-col items-start md:items-end justify-center bg-black/40 border border-white/10 rounded-2xl p-5 backdrop-blur-md">
            <span className="text-xs uppercase tracking-widest text-white/50 mb-1 flex items-center gap-1.5">
              <Sparkles size={13} className="text-amber-400" /> Combined Plajah Score
            </span>
            <div className="text-4xl md:text-5xl font-black tracking-tight text-white flex items-baseline gap-1">
              {passport.combinedScore.totalCombinedScore.toLocaleString()}
              <span className="text-sm font-semibold text-purple-400">PTS</span>
            </div>

            {passport.combinedScore.crossPlatformHarmonyBonus > 0 && (
              <div className="flex items-center gap-1 mt-2 text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                <Flame size={12} />
                <span>+{passport.combinedScore.crossPlatformHarmonyBonus.toLocaleString()} Cross-Platform Harmony</span>
              </div>
            )}
          </div>
        </div>

        {/* Tier Progress Bar */}
        <div className="relative z-10 mt-6 pt-6 border-t border-white/10">
          <div className="flex justify-between text-xs text-white/60 mb-2">
            <span>Tier Progress ({tierConfig?.label})</span>
            <span>
              {passport.combinedScore.tierProgressPercentage}% towards {passport.combinedScore.nextTierThreshold.toLocaleString()} PTS
            </span>
          </div>
          <div className="w-full h-2.5 bg-black/50 rounded-full overflow-hidden border border-white/10">
            <div
              className="h-full bg-gradient-to-r from-purple-500 via-pink-500 to-amber-400 rounded-full transition-all duration-700"
              style={{ width: `${passport.combinedScore.tierProgressPercentage}%` }}
            />
          </div>
        </div>

        {/* Quick Actions */}
        <div className="relative z-10 flex items-center justify-between mt-6">
          <button
            onClick={() => setShowAttestationModal(true)}
            className="text-xs flex items-center gap-1.5 text-purple-300 hover:text-white bg-purple-900/30 hover:bg-purple-900/50 border border-purple-500/30 px-3.5 py-1.5 rounded-xl transition"
          >
            <ShieldCheck size={14} /> View On-Chain EAS Attestation
          </button>

          <button
            onClick={handleSyncAll}
            disabled={isSyncing}
            className="text-xs flex items-center gap-1.5 text-white/70 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 px-3.5 py-1.5 rounded-xl transition"
          >
            <RefreshCw size={13} className={isSyncing ? 'animate-spin' : ''} />
            {isSyncing ? 'Syncing Ecosystems...' : 'Sync Ecosystems'}
          </button>
        </div>
      </div>

      {/* ── ECOSYSTEM BREAKDOWN CARDS ────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-black uppercase tracking-wider text-white flex items-center gap-2">
            <Gamepad2 size={20} className="text-purple-400" /> Connected Ecosystems
          </h3>
          <span className="text-xs text-white/40">
            {passport.connectedAccounts.length} Platforms Active
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Steam Card */}
          <div className="relative rounded-2xl bg-neutral-900/80 border border-white/10 p-5 flex flex-col justify-between hover:border-cyan-500/40 transition">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-400 bg-cyan-950/50 border border-cyan-800/40 px-2 py-0.5 rounded-md">
                  Steam
                </span>
                {steamData ? (
                  <span className="text-emerald-400 text-xs flex items-center gap-1">
                    <CheckCircle2 size={12} /> Connected
                  </span>
                ) : (
                  <button
                    onClick={() => setConnectingPlatform('STEAM')}
                    className="text-xs text-white/60 hover:text-white flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded"
                  >
                    <Plus size={12} /> Connect
                  </button>
                )}
              </div>

              {steamData ? (
                <>
                  <p className="text-sm font-semibold text-white truncate">{steamData.accountHandle}</p>
                  <p className="text-2xl font-black text-white mt-1">
                    {steamData.totalPlatformScore.toLocaleString()}{' '}
                    <span className="text-xs text-white/40 font-normal">pts</span>
                  </p>
                  <div className="mt-3 space-y-1 text-xs text-white/50">
                    <div className="flex justify-between">
                      <span>Games Tracked:</span>
                      <span className="text-white">{steamData.totalGamesTracked}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>100% Completed:</span>
                      <span className="text-cyan-300 font-bold">{steamData.completedGamesCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Achievements:</span>
                      <span className="text-white">{steamData.totalAchievementsUnlocked}</span>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-xs text-white/40 mt-3">Connect your Steam account to bridge achievements and game history.</p>
              )}
            </div>
          </div>

          {/* Xbox Live Card */}
          <div className="relative rounded-2xl bg-neutral-900/80 border border-white/10 p-5 flex flex-col justify-between hover:border-emerald-500/40 transition">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 bg-emerald-950/50 border border-emerald-800/40 px-2 py-0.5 rounded-md">
                  Xbox Live
                </span>
                {xboxData ? (
                  <span className="text-emerald-400 text-xs flex items-center gap-1">
                    <CheckCircle2 size={12} /> Connected
                  </span>
                ) : (
                  <button
                    onClick={() => setConnectingPlatform('XBOX')}
                    className="text-xs text-white/60 hover:text-white flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded"
                  >
                    <Plus size={12} /> Connect
                  </button>
                )}
              </div>

              {xboxData ? (
                <>
                  <p className="text-sm font-semibold text-white truncate">{xboxData.accountHandle}</p>
                  <p className="text-2xl font-black text-white mt-1">
                    {xboxData.rawNativeScore.toLocaleString()}{' '}
                    <span className="text-xs text-emerald-400 font-bold">G</span>
                  </p>
                  <div className="mt-3 space-y-1 text-xs text-white/50">
                    <div className="flex justify-between">
                      <span>Plajah Normalized:</span>
                      <span className="text-white font-semibold">{xboxData.totalPlatformScore.toLocaleString()} pts</span>
                    </div>
                    <div className="flex justify-between">
                      <span>100% Completed:</span>
                      <span className="text-emerald-300 font-bold">{xboxData.completedGamesCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Achievements:</span>
                      <span className="text-white">{xboxData.totalAchievementsUnlocked}</span>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-xs text-white/40 mt-3">Link your Xbox Live Gamertag to bring your Gamerscore to Plajah.</p>
              )}
            </div>
          </div>

          {/* PlayStation Card */}
          <div className="relative rounded-2xl bg-neutral-900/80 border border-white/10 p-5 flex flex-col justify-between hover:border-blue-500/40 transition">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-400 bg-blue-950/50 border border-blue-800/40 px-2 py-0.5 rounded-md">
                  PlayStation Network
                </span>
                {psnData ? (
                  <span className="text-emerald-400 text-xs flex items-center gap-1">
                    <CheckCircle2 size={12} /> Connected
                  </span>
                ) : (
                  <button
                    onClick={() => setConnectingPlatform('PLAYSTATION')}
                    className="text-xs text-white/60 hover:text-white flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded"
                  >
                    <Plus size={12} /> Connect
                  </button>
                )}
              </div>

              {psnData ? (
                <>
                  <p className="text-sm font-semibold text-white truncate">{psnData.accountHandle}</p>
                  <p className="text-2xl font-black text-white mt-1">
                    {psnData.totalPlatformScore.toLocaleString()}{' '}
                    <span className="text-xs text-white/40 font-normal">pts</span>
                  </p>
                  <div className="mt-3 space-y-1 text-xs text-white/50">
                    <div className="flex justify-between">
                      <span>Raw Trophy Value:</span>
                      <span className="text-blue-300 font-semibold">{psnData.rawNativeScore.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Platinums / 100%:</span>
                      <span className="text-indigo-300 font-bold">{psnData.completedGamesCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Trophies Unlocked:</span>
                      <span className="text-white">{psnData.totalAchievementsUnlocked}</span>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-xs text-white/40 mt-3">Link your PSN Online ID to import your Platinum and Gold trophies.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── TOP GAMES SHOWCASE ────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-black uppercase tracking-wider text-white flex items-center gap-2">
            <Trophy size={20} className="text-amber-400" /> Mastered Cross-Platform Titles
          </h3>
          <span className="text-xs text-white/40">
            {passport.combinedScore.total100PercentCompletions} Total 100% Completions
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {passport.topGamesShowcase.map((game) => (
            <div
              key={game.id}
              className="bg-neutral-900/60 border border-white/10 rounded-2xl p-4 flex flex-col justify-between hover:bg-neutral-800/60 transition"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                      game.platform === 'STEAM'
                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                        : game.platform === 'XBOX'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    }`}
                  >
                    {game.platform}
                  </span>

                  {game.is100PercentCompleted && (
                    <span className="text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Sparkles size={10} /> 100% Mastered
                    </span>
                  )}
                </div>

                <h4 className="text-sm font-bold text-white mb-1 line-clamp-1">{game.titleName}</h4>
                <div className="flex items-center justify-between text-xs text-white/50 mb-2">
                  <span>{Math.round(game.playtimeMinutes / 60)} hrs played</span>
                  <span className="font-semibold text-white/80">
                    {game.unlockedAchievementsCount} / {game.totalAchievementsCount} Ach.
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div>
                <div className="w-full h-1.5 bg-black/60 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      game.is100PercentCompleted
                        ? 'bg-amber-400'
                        : 'bg-gradient-to-r from-purple-500 to-indigo-500'
                    }`}
                    style={{ width: `${game.completionPercentage}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── CONNECT PLATFORM MODAL ────────────────────────────────────────── */}
      {connectingPlatform && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-white/20 rounded-3xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-black text-white mb-2">Connect {connectingPlatform}</h3>
            <p className="text-xs text-white/60 mb-4">
              Enter your {connectingPlatform === 'STEAM' ? 'SteamID64 / Profile ID' : connectingPlatform === 'XBOX' ? 'Xbox Gamertag' : 'PSN Online ID'} to bridge your achievements into Plajah.
            </p>

            <form onSubmit={handleConnectPlatform} className="space-y-4">
              <input
                type="text"
                value={handleInput}
                onChange={(e) => setHandleInput(e.target.value)}
                placeholder={
                  connectingPlatform === 'STEAM'
                    ? 'e.g. 76561198000000000'
                    : connectingPlatform === 'XBOX'
                    ? 'e.g. MasterChief_Plajah'
                    : 'e.g. Kratos_Plajah'
                }
                className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-purple-500"
                autoFocus
              />

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setConnectingPlatform(null)}
                  className="px-4 py-2 rounded-xl text-xs text-white/60 hover:text-white bg-white/5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!handleInput.trim() || isSyncing}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 transition disabled:opacity-50"
                >
                  {isSyncing ? 'Verifying...' : 'Bridge Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── EAS / ATTESTATION MODAL ────────────────────────────────────────── */}
      {showAttestationModal && passport.latestAttestation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-purple-500/30 rounded-3xl p-6 max-w-xl w-full shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck size={20} className="text-emerald-400" />
                <h3 className="text-lg font-black text-white">Universal Sovereign Credential</h3>
              </div>
              <button
                onClick={() => setShowAttestationModal(false)}
                className="text-xs text-white/50 hover:text-white"
              >
                ✕ Close
              </button>
            </div>

            <p className="text-xs text-white/60 mb-4">
              This cryptographic payload certifies your cross-platform gaming achievements. It can be validated by web3 games, decentralized tournaments, and DAOs.
            </p>

            <pre className="bg-black/80 border border-white/10 rounded-2xl p-4 text-[11px] text-emerald-400 font-mono overflow-x-auto max-h-64 scrollbar-thin">
              {JSON.stringify(passport.latestAttestation, null, 2)}
            </pre>

            <div className="flex justify-between items-center mt-5 pt-4 border-t border-white/10 text-xs">
              <span className="text-white/40">Scheme: {passport.latestAttestation.signatureScheme}</span>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(JSON.stringify(passport.latestAttestation, null, 2));
                  alert('Attestation JSON copied to clipboard!');
                }}
                className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-4 py-2 rounded-xl transition"
              >
                Copy Verifiable JSON
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
