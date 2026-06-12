import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'motion/react';
import {
  X, Download, Share2, Sparkles, Search, ChevronDown,
  BarChart2, User, Users, Trophy, Zap, Check, Copy,
  Play, Pause, RefreshCw, Image as ImageIcon,
} from 'lucide-react';
import { RadialBarChart, RadialBar, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell } from 'recharts';
import { searchPlayers, fetchPlayerSeasonStats, fetchTeamSeasonStats, getAvailableSeasons, type PlayerSearchResult } from '../../services/sportsHistoryService';
import { auth, createClubPost, fetchUserClubs } from '../../services/backendService';
import type { Club } from '../../types';

// ─── Animated counter ──────────────────────────────────────────────────────────
function AnimatedNumber({ value, decimals = 1, duration = 1.2 }: { value: number; decimals?: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const mv = useMotionValue(0);

  useEffect(() => {
    const ctrl = animate(mv, value, { duration, ease: [0.16, 1, 0.3, 1] });
    const unsub = mv.on('change', v => {
      if (ref.current) ref.current.textContent = v.toFixed(decimals);
    });
    return () => { ctrl.stop(); unsub(); };
  }, [value, duration, decimals, mv]);

  return <span ref={ref}>0</span>;
}

// ─── Card templates ────────────────────────────────────────────────────────────
type CardTemplate = 'PLAYER_SPOTLIGHT' | 'PLAYER_COMPARE' | 'TEAM_SEASON' | 'STAT_BAR' | 'RACE_RESULT';

const TEMPLATES: { id: CardTemplate; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: 'PLAYER_SPOTLIGHT', label: 'Player Spotlight', icon: <User size={16} />, desc: 'Single player season stats' },
  { id: 'PLAYER_COMPARE',   label: 'Head to Head',     icon: <Users size={16} />, desc: 'Compare two players' },
  { id: 'TEAM_SEASON',      label: 'Team Season',      icon: <Trophy size={16} />, desc: 'Full season record' },
  { id: 'STAT_BAR',         label: 'Stat Leader',      icon: <BarChart2 size={16} />, desc: 'Category leaders chart' },
  { id: 'RACE_RESULT',      label: 'Race Result',       icon: <Zap size={16} />, desc: 'F1 / NASCAR race recap' },
];

const LEAGUES = ['NBA','NFL','NHL','MLB','NCAA'] as const;
type League = typeof LEAGUES[number];

// Team accent colors keyed by ESPN abbreviation
const TEAM_COLORS: Record<string, string> = {
  lal:'#552583', gsw:'#1D428A', bos:'#007A33', chi:'#CE1141', mia:'#98002E',
  nyy:'#003087', lad:'#005A9C', kc:'#004687', ne:'#002244', dal:'#003594',
  gb:'#203731', pit:'#FFB612', det:'#0076B6', tb:'#D50A0A',
};

const COMPOUND_COLS: Record<string, string> = {
  SOFT:'#E8002D', MEDIUM:'#FFF200', HARD:'#FFFFFF', INTERMEDIATE:'#39B54A', WET:'#0067FF',
};

// ─── Canvas PNG export ─────────────────────────────────────────────────────────
async function exportCardAsPNG(cardEl: HTMLElement, filename = 'plajah-statcard.png'): Promise<void> {
  try {
    const { default: html2canvas } = await import('html2canvas' as any);
    const canvas: HTMLCanvasElement = await html2canvas(cardEl, {
      backgroundColor: null,
      scale: 3,
      useCORS: true,
      allowTaint: true,
    });
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch {
    // html2canvas not available — fallback: open in new tab
    alert('Export requires html2canvas. Install via: npm i html2canvas');
  }
}

// ─── Card render components ────────────────────────────────────────────────────

interface StatCardData {
  template: CardTemplate;
  league: League;
  season: number;
  // player spotlight
  player?: PlayerSearchResult;
  playerStats?: any;
  // compare
  player2?: PlayerSearchResult;
  playerStats2?: any;
  // team
  teamId?: string;
  teamName?: string;
  teamColor?: string;
  teamLogo?: string;
  teamRecord?: string;
  teamStats?: any;
  // race
  raceName?: string;
  raceResults?: any[];
}

function PlayerSpotlightCard({ data, animate: shouldAnimate = true }: { data: StatCardData; animate?: boolean }) {
  const p = data.player;
  const stats = data.playerStats;
  const cats = stats?.categories?.[0]?.stats?.slice(0, 6) ?? [];
  const keyStats = cats.slice(0, 3);
  const barStats = cats.slice(3, 6);
  const maxBarVal = Math.max(...barStats.map((s: any) => s.value), 1);
  const accent = '#FF8C00';

  return (
    <div
      className="relative w-[380px] h-[520px] rounded-[2rem] overflow-hidden select-none"
      style={{ background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #16213e 100%)' }}
    >
      {/* Background gradient orb */}
      <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full opacity-20 blur-3xl"
        style={{ background: accent }} />
      <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full opacity-10 blur-2xl"
        style={{ background: '#6C63FF' }} />

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 px-6 pt-5 flex items-center justify-between z-10">
        <div>
          <p className="text-[7px] font-black uppercase tracking-[0.5em] text-white/30">Plajah Sports</p>
          <p className="text-[9px] font-black uppercase tracking-widest text-white/50">{data.league} · {data.season}–{String(data.season + 1).slice(2)}</p>
        </div>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: `${accent}22`, border: `1px solid ${accent}44` }}>
          <Sparkles size={14} style={{ color: accent }} />
        </div>
      </div>

      {/* Player photo area */}
      <div className="absolute top-16 left-0 right-0 flex justify-center z-10">
        <div className="relative">
          <div className="w-28 h-28 rounded-[1.5rem] overflow-hidden border-2"
            style={{ borderColor: `${accent}60` }}>
            {p?.headshot
              ? <img src={p.headshot} alt={p.name} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center bg-white/5"><User size={40} className="text-white/20" /></div>
            }
          </div>
          <div className="absolute -bottom-2 -right-2 px-2.5 py-1 rounded-xl text-[8px] font-black uppercase"
            style={{ background: accent, color: '#000' }}>
            {p?.position}
          </div>
        </div>
      </div>

      {/* Player name + team */}
      <div className="absolute top-[230px] left-0 right-0 text-center z-10 px-4">
        <h2 className="text-2xl font-black uppercase tracking-tight text-white leading-none">
          {p?.name?.split(' ').map((w, i) => (
            <span key={i} className={i === 0 ? 'text-white/60' : 'text-white'}>{w}{' '}</span>
          ))}
        </h2>
        <p className="text-[9px] font-black uppercase tracking-[0.3em] mt-1" style={{ color: accent }}>
          {data.playerStats?.teamName || p?.teamName}
        </p>
      </div>

      {/* Key stats — 3 big numbers */}
      <div className="absolute top-[290px] left-0 right-0 px-6 z-10">
        <div className="grid grid-cols-3 gap-3">
          {keyStats.map((stat: any, i: number) => (
            <div key={i} className="text-center p-3 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <p className="text-[22px] font-black text-white leading-none">
                {shouldAnimate ? <AnimatedNumber value={stat.value} decimals={stat.value < 10 ? 1 : 0} /> : stat.value.toFixed(stat.value < 10 ? 1 : 0)}
              </p>
              <p className="text-[7px] font-black uppercase tracking-widest mt-1" style={{ color: `${accent}aa` }}>
                {stat.abbreviation}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Bar stats */}
      <div className="absolute top-[395px] left-0 right-0 px-6 z-10 space-y-2">
        {barStats.map((stat: any, i: number) => (
          <div key={i}>
            <div className="flex items-center justify-between mb-0.5">
              <p className="text-[8px] font-black uppercase tracking-widest text-white/40">{stat.abbreviation}</p>
              <p className="text-[9px] font-black text-white/70">{stat.displayValue}</p>
            </div>
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              {shouldAnimate ? (
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: `linear-gradient(90deg, ${accent}, ${accent}88)` }}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, (stat.value / maxBarVal) * 100)}%` }}
                  transition={{ duration: 1, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
                />
              ) : (
                <div className="h-full rounded-full"
                  style={{ width: `${Math.min(100, (stat.value / maxBarVal) * 100)}%`, background: `linear-gradient(90deg, ${accent}, ${accent}88)` }} />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="absolute bottom-4 left-0 right-0 px-6 flex items-center justify-between z-10">
        <p className="text-[7px] font-black uppercase tracking-[0.4em] text-white/15">plajah.com</p>
        <div className="flex items-center gap-1">
          <div className="w-1 h-1 rounded-full" style={{ background: accent }} />
          <p className="text-[7px] font-black uppercase tracking-widest text-white/25">Sports</p>
        </div>
      </div>
    </div>
  );
}

function PlayerCompareCard({ data, animate: shouldAnimate = true }: { data: StatCardData; animate?: boolean }) {
  const p1 = data.player;
  const p2 = data.player2;
  const stats1 = data.playerStats?.categories?.[0]?.stats?.slice(0, 5) ?? [];
  const stats2 = data.playerStats2?.categories?.[0]?.stats?.slice(0, 5) ?? [];

  return (
    <div
      className="relative w-[480px] h-[320px] rounded-[2rem] overflow-hidden select-none"
      style={{ background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%)' }}
    >
      <div className="absolute inset-0 flex">
        {/* Left player */}
        <div className="flex-1 relative p-5" style={{ background: 'linear-gradient(135deg, #FF8C0022 0%, transparent 60%)' }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl overflow-hidden border border-[#FF8C00]/40">
              {p1?.headshot ? <img src={p1.headshot} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full bg-white/10 flex items-center justify-center"><User size={16} className="text-white/30" /></div>}
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-tight text-white leading-tight">{p1?.name}</p>
              <p className="text-[7px] font-black uppercase tracking-widest text-[#FF8C00]/70">{p1?.teamName}</p>
            </div>
          </div>
          <div className="space-y-2">
            {stats1.map((s: any, i: number) => (
              <div key={i} className="flex items-center justify-between">
                <p className="text-[8px] text-white/40 font-black uppercase tracking-widest">{s.abbreviation}</p>
                <p className="text-[11px] font-black text-white">{s.displayValue}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="w-px bg-white/10 flex items-center justify-center relative">
          <div className="absolute w-7 h-7 rounded-full bg-[#0a0a0a] border border-white/20 flex items-center justify-center z-10">
            <span className="text-[7px] font-black text-white/50">VS</span>
          </div>
        </div>

        {/* Right player */}
        <div className="flex-1 relative p-5" style={{ background: 'linear-gradient(225deg, #6C63FF22 0%, transparent 60%)' }}>
          <div className="flex items-center gap-3 mb-4 flex-row-reverse">
            <div className="w-12 h-12 rounded-xl overflow-hidden border border-[#6C63FF]/40">
              {p2?.headshot ? <img src={p2.headshot} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full bg-white/10 flex items-center justify-center"><User size={16} className="text-white/30" /></div>}
            </div>
            <div className="text-right">
              <p className="text-[10px] font-black uppercase tracking-tight text-white leading-tight">{p2?.name}</p>
              <p className="text-[7px] font-black uppercase tracking-widest text-[#6C63FF]/70">{p2?.teamName}</p>
            </div>
          </div>
          <div className="space-y-2">
            {stats2.map((s: any, i: number) => (
              <div key={i} className="flex items-center justify-between">
                <p className="text-[11px] font-black text-white">{s.displayValue}</p>
                <p className="text-[8px] text-white/40 font-black uppercase tracking-widest">{s.abbreviation}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Header label */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2">
        <p className="text-[7px] font-black uppercase tracking-[0.5em] text-white/30">Plajah · {data.league} {data.season}</p>
      </div>
    </div>
  );
}

function TeamSeasonCard({ data, animate: shouldAnimate = true }: { data: StatCardData; animate?: boolean }) {
  const accent = data.teamColor || '#FF8C00';
  const record = data.teamRecord || '0-0';
  const [w, l] = record.split('-').map(Number);
  const total = (w || 0) + (l || 0);
  const winPct = total > 0 ? ((w || 0) / total) * 100 : 0;
  const topStats = data.teamStats?.stats?.slice(0, 6) ?? [];

  return (
    <div
      className="relative w-[400px] h-[440px] rounded-[2rem] overflow-hidden select-none"
      style={{ background: `linear-gradient(135deg, #0a0a0a 0%, ${accent}15 50%, #0a0a0a 100%)` }}
    >
      <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full opacity-20 blur-3xl"
        style={{ background: accent }} />

      {/* Team logo + name */}
      <div className="relative z-10 px-6 pt-6 flex items-center gap-4">
        {data.teamLogo && (
          <img src={data.teamLogo} alt="" className="w-16 h-16 object-contain drop-shadow-xl" />
        )}
        <div>
          <p className="text-[8px] font-black uppercase tracking-[0.4em] text-white/40">
            {data.league} · {data.season}–{String(data.season + 1).slice(2)} Season
          </p>
          <h2 className="text-2xl font-black uppercase tracking-tight text-white leading-none mt-1">
            {data.teamName}
          </h2>
        </div>
      </div>

      {/* Win record ring + bar */}
      <div className="relative z-10 px-6 mt-6">
        <div className="flex items-center gap-4 mb-2">
          <p className="text-4xl font-black text-white">{w}</p>
          <div>
            <p className="text-[8px] font-black uppercase text-white/40 tracking-widest">Wins</p>
            <p className="text-[8px] font-black uppercase text-white/40 tracking-widest">{l} Losses</p>
          </div>
          <div className="ml-auto">
            <p className="text-2xl font-black" style={{ color: accent }}>
              {winPct.toFixed(0)}%
            </p>
            <p className="text-[7px] font-black uppercase text-white/30 tracking-widest">Win Rate</p>
          </div>
        </div>
        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
          {shouldAnimate ? (
            <motion.div
              className="h-full rounded-full"
              style={{ background: `linear-gradient(90deg, ${accent}, ${accent}aa)` }}
              initial={{ width: 0 }}
              animate={{ width: `${winPct}%` }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            />
          ) : (
            <div className="h-full rounded-full" style={{ width: `${winPct}%`, background: `linear-gradient(90deg, ${accent}, ${accent}aa)` }} />
          )}
        </div>
      </div>

      {/* Team stats grid */}
      <div className="relative z-10 px-6 mt-5">
        <div className="grid grid-cols-3 gap-3">
          {topStats.map((stat: any, i: number) => (
            <div key={i} className="p-3 rounded-xl text-center"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-lg font-black text-white leading-none">{stat.displayValue}</p>
              <p className="text-[7px] font-black uppercase tracking-widest mt-1 text-white/35">{stat.displayName?.slice(0, 8)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="absolute bottom-5 left-6 right-6 flex items-center justify-between z-10">
        <p className="text-[7px] font-black uppercase tracking-[0.4em] text-white/15">plajah.com</p>
        <p className="text-[7px] font-black uppercase tracking-widest text-white/25">Sports Stats</p>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

interface StatCardBuilderProps {
  onClose: () => void;
  currentUser: any;
  initialTab?: string;
}

export const StatCardBuilder: React.FC<StatCardBuilderProps> = ({ onClose, currentUser, initialTab }) => {
  const [template, setTemplate] = useState<CardTemplate>('PLAYER_SPOTLIGHT');
  const [league, setLeague] = useState<League>((initialTab?.toUpperCase() as League) || 'NBA');
  const [season, setSeason] = useState(new Date().getFullYear() - 1);
  const [cardData, setCardData] = useState<StatCardData>({ template, league, season });
  const [playerSearch, setPlayerSearch] = useState('');
  const [playerSearch2, setPlayerSearch2] = useState('');
  const [searchResults, setSearchResults] = useState<PlayerSearchResult[]>([]);
  const [searchResults2, setSearchResults2] = useState<PlayerSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [isAnimating, setIsAnimating] = useState(true);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [userClubs, setUserClubs] = useState<Club[]>([]);
  const [exporting, setExporting] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const seasons = getAvailableSeasons(league);

  useEffect(() => {
    if (auth.currentUser) {
      fetchUserClubs(auth.currentUser.uid).then(setUserClubs).catch(() => {});
    }
  }, []);

  const doSearchPlayers = useCallback(async (q: string, which: 1 | 2) => {
    if (q.trim().length < 2) {
      which === 1 ? setSearchResults([]) : setSearchResults2([]);
      return;
    }
    const res = await searchPlayers(league, q);
    which === 1 ? setSearchResults(res) : setSearchResults2(res);
  }, [league]);

  useEffect(() => {
    const t = setTimeout(() => doSearchPlayers(playerSearch, 1), 300);
    return () => clearTimeout(t);
  }, [playerSearch, doSearchPlayers]);

  useEffect(() => {
    const t = setTimeout(() => doSearchPlayers(playerSearch2, 2), 300);
    return () => clearTimeout(t);
  }, [playerSearch2, doSearchPlayers]);

  const selectPlayer = async (player: PlayerSearchResult, which: 1 | 2) => {
    setLoading(true);
    try {
      const stats = await fetchPlayerSeasonStats(league, player.id, season);
      if (which === 1) {
        setPlayerSearch(player.name);
        setSearchResults([]);
        setCardData(prev => ({ ...prev, player, playerStats: stats }));
      } else {
        setPlayerSearch2(player.name);
        setSearchResults2([]);
        setCardData(prev => ({ ...prev, player2: player, playerStats2: stats }));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleExportPNG = async () => {
    if (!cardRef.current) return;
    setExporting(true);
    try {
      await exportCardAsPNG(cardRef.current, `plajah-${template.toLowerCase()}-${season}.png`);
    } finally {
      setExporting(false);
    }
  };

  const handleShareToFeed = async (clubId?: string) => {
    if (!auth.currentUser || !cardRef.current) return;
    setShareSuccess(false);
    try {
      // Capture card as data URL
      const { default: html2canvas } = await import('html2canvas' as any);
      const canvas: HTMLCanvasElement = await html2canvas(cardRef.current, { backgroundColor: null, scale: 2, useCORS: true });
      const dataUrl = canvas.toDataURL('image/png');
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], 'stat-card.png', { type: 'image/png' });

      // Upload via backendService uploadFile
      const { uploadFile } = await import('../../services/backendService');
      const uploadedUrl = await uploadFile(`stat-cards/${auth.currentUser.uid}/${Date.now()}.png`, file);

      if (clubId) {
        await createClubPost({
          clubId,
          content: `Check out this stat card I made on Plajah! ${cardData.player?.name ?? cardData.teamName ?? ''} ${league} ${season} stats.`,
          type: 'POST',
          attachments: [{ type: 'PHOTO', url: uploadedUrl, title: 'Stat Card' }],
        });
      }
      setShareSuccess(true);
      setTimeout(() => setShareSuccess(false), 3000);
    } catch {
      alert('Share failed. Try exporting as PNG instead.');
    }
    setShareMenuOpen(false);
  };

  const renderCard = () => {
    const updatedData = { ...cardData, template, league, season };
    if (template === 'PLAYER_SPOTLIGHT') return <PlayerSpotlightCard data={updatedData} animate={isAnimating} />;
    if (template === 'PLAYER_COMPARE') return <PlayerCompareCard data={updatedData} animate={isAnimating} />;
    if (template === 'TEAM_SEASON') return <TeamSeasonCard data={updatedData} animate={isAnimating} />;
    return (
      <div className="w-[380px] h-[300px] rounded-[2rem] bg-white/5 border border-white/10 flex items-center justify-center">
        <p className="text-white/30 text-sm font-black uppercase tracking-widest">Select a template</p>
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[300] bg-black/85 backdrop-blur-xl flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        className="w-full max-w-6xl max-h-[90vh] overflow-hidden rounded-[2rem] border border-white/10 flex flex-col lg:flex-row"
        style={{ background: 'linear-gradient(135deg, #0d0d0d 0%, #131320 100%)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Left panel — controls */}
        <div className="w-full lg:w-80 shrink-0 border-b lg:border-b-0 lg:border-r border-white/8 flex flex-col overflow-y-auto custom-scrollbar">
          <div className="p-6 border-b border-white/8 flex items-center justify-between">
            <div>
              <p className="text-[8px] font-black uppercase tracking-[0.4em] text-[#FF8C00]/70">Plajah</p>
              <h2 className="text-lg font-black uppercase tracking-tight text-white">Stat Card Builder</h2>
            </div>
            <button onClick={onClose} className="p-2 text-white/30 hover:text-white transition-colors">
              <X size={18} />
            </button>
          </div>

          <div className="p-5 space-y-5 flex-1">
            {/* Template picker */}
            <div className="space-y-2">
              <p className="text-[8px] font-black uppercase tracking-[0.4em] text-white/40">Template</p>
              <div className="grid grid-cols-1 gap-1.5">
                {TEMPLATES.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTemplate(t.id)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left ${
                      template === t.id
                        ? 'bg-[#FF8C00]/15 border-[#FF8C00]/40 text-white'
                        : 'bg-white/[0.03] border-white/8 text-white/50 hover:border-white/20 hover:text-white'
                    }`}
                  >
                    <span className={template === t.id ? 'text-[#FF8C00]' : 'text-white/30'}>{t.icon}</span>
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest">{t.label}</p>
                      <p className="text-[7px] text-white/30 mt-0.5">{t.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* League + Season */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[8px] font-black uppercase tracking-widest text-white/40 mb-1.5">League</p>
                <select
                  value={league}
                  onChange={e => setLeague(e.target.value as League)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[9px] font-black uppercase text-white outline-none appearance-none"
                >
                  {LEAGUES.map(l => <option key={l} value={l} className="bg-[#0d0d0d]">{l}</option>)}
                </select>
              </div>
              <div>
                <p className="text-[8px] font-black uppercase tracking-widest text-white/40 mb-1.5">Season</p>
                <select
                  value={season}
                  onChange={e => setSeason(Number(e.target.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[9px] font-black uppercase text-white outline-none appearance-none"
                >
                  {seasons.slice(0, 20).map(s => <option key={s.year} value={s.year} className="bg-[#0d0d0d]">{s.label}</option>)}
                </select>
              </div>
            </div>

            {/* Player search */}
            {(template === 'PLAYER_SPOTLIGHT' || template === 'PLAYER_COMPARE') && (
              <div className="space-y-2">
                <p className="text-[8px] font-black uppercase tracking-widest text-white/40">
                  {template === 'PLAYER_COMPARE' ? 'Player 1' : 'Player'}
                </p>
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                  <input
                    type="text"
                    value={playerSearch}
                    onChange={e => setPlayerSearch(e.target.value)}
                    placeholder="Search player..."
                    className="w-full bg-white/5 border border-white/10 focus:border-[#FF8C00]/50 rounded-xl pl-9 pr-3 py-2 text-[9px] font-bold text-white placeholder-white/20 outline-none transition-all"
                  />
                  {searchResults.length > 0 && (
                    <div className="absolute top-full mt-1 left-0 right-0 bg-[#0d0d0d] border border-white/15 rounded-xl overflow-hidden z-20 shadow-2xl max-h-40 overflow-y-auto">
                      {searchResults.map(p => (
                        <button
                          key={p.id}
                          onClick={() => selectPlayer(p, 1)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/5 transition-all text-left"
                        >
                          {p.headshot && <img src={p.headshot} className="w-6 h-6 rounded-full object-cover" alt="" loading="lazy" />}
                          <div>
                            <p className="text-[9px] font-black text-white">{p.displayName}</p>
                            <p className="text-[7px] text-white/40">{p.position} · {p.teamName}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {template === 'PLAYER_COMPARE' && (
                  <div className="space-y-1">
                    <p className="text-[8px] font-black uppercase tracking-widest text-white/40">Player 2</p>
                    <div className="relative">
                      <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                      <input
                        type="text"
                        value={playerSearch2}
                        onChange={e => setPlayerSearch2(e.target.value)}
                        placeholder="Search second player..."
                        className="w-full bg-white/5 border border-white/10 focus:border-[#6C63FF]/50 rounded-xl pl-9 pr-3 py-2 text-[9px] font-bold text-white placeholder-white/20 outline-none transition-all"
                      />
                      {searchResults2.length > 0 && (
                        <div className="absolute top-full mt-1 left-0 right-0 bg-[#0d0d0d] border border-white/15 rounded-xl overflow-hidden z-20 shadow-2xl max-h-40 overflow-y-auto">
                          {searchResults2.map(p => (
                            <button key={p.id} onClick={() => selectPlayer(p, 2)}
                              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/5 transition-all text-left">
                              {p.headshot && <img src={p.headshot} className="w-6 h-6 rounded-full object-cover" alt="" loading="lazy" />}
                              <div>
                                <p className="text-[9px] font-black text-white">{p.displayName}</p>
                                <p className="text-[7px] text-white/40">{p.position} · {p.teamName}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {loading && (
              <div className="flex items-center gap-2 text-white/40">
                <RefreshCw size={12} className="animate-spin" />
                <p className="text-[9px] font-black uppercase tracking-widest">Loading stats...</p>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="p-5 border-t border-white/8 space-y-2">
            {/* Animate toggle */}
            <button
              onClick={() => setIsAnimating(v => !v)}
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                isAnimating
                  ? 'bg-white/10 text-white border border-white/15'
                  : 'bg-white/5 text-white/40 border border-white/8 hover:border-white/15'
              }`}
            >
              {isAnimating ? <Pause size={12} /> : <Play size={12} />}
              {isAnimating ? 'Stop Animation' : 'Play Animation'}
            </button>

            {/* Export PNG */}
            <button
              onClick={handleExportPNG}
              disabled={exporting}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest bg-[#FF8C00] text-black hover:bg-[#FF8C00]/80 transition-all disabled:opacity-50"
            >
              <Download size={12} />
              {exporting ? 'Exporting...' : 'Export PNG'}
            </button>

            {/* Share */}
            {auth.currentUser && (
              <div className="relative">
                <button
                  onClick={() => setShareMenuOpen(v => !v)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all"
                >
                  {shareSuccess ? <Check size={12} className="text-green-400" /> : <Share2 size={12} />}
                  {shareSuccess ? 'Shared!' : 'Share to Club'}
                </button>
                <AnimatePresence>
                  {shareMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      className="absolute bottom-full mb-1 left-0 right-0 bg-[#0d0d0d] border border-white/15 rounded-xl overflow-hidden shadow-2xl z-20 max-h-48 overflow-y-auto"
                    >
                      {userClubs.map(c => (
                        <button
                          key={c.id}
                          onClick={() => handleShareToFeed(c.id)}
                          className="w-full px-3 py-2.5 flex items-center gap-2 hover:bg-white/5 transition-all text-left"
                        >
                          {c.iconImage && <img src={c.iconImage} className="w-5 h-5 rounded-lg" alt="" />}
                          <p className="text-[9px] font-black text-white truncate">{c.name}</p>
                        </button>
                      ))}
                      {userClubs.length === 0 && (
                        <p className="px-3 py-3 text-[8px] font-black uppercase text-white/30 tracking-widest">No clubs joined yet</p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>

        {/* Right panel — card preview */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 gap-6 bg-[#0a0a0a]/50 overflow-x-auto">
          <div className="flex items-center gap-3 mb-2">
            <p className="text-[9px] font-black uppercase tracking-[0.4em] text-white/25">Card Preview</p>
          </div>

          {/* Animated card */}
          <div ref={cardRef} className="relative">
            <AnimatePresence mode="wait">
              <motion.div
                key={`${template}-${league}-${season}-${cardData.player?.id}`}
                initial={{ opacity: 0, scale: 0.92, rotateX: 5 }}
                animate={{ opacity: 1, scale: 1, rotateX: 0 }}
                exit={{ opacity: 0, scale: 0.94 }}
                transition={{ type: 'spring', stiffness: 280, damping: 26 }}
                style={{ transformStyle: 'preserve-3d', perspective: 1000 }}
              >
                {renderCard()}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Tips */}
          <div className="flex items-center gap-6 text-center">
            <p className="text-[7px] font-black uppercase tracking-widest text-white/15">
              Search a player · select season · export PNG
            </p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default StatCardBuilder;
