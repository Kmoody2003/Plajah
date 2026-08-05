import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Trophy, Star, Bell, BellOff, Shield,
  TrendingUp, Newspaper, ImageIcon, User, Medal,
  ChevronRight, Crown,
} from 'lucide-react';

const WorldCupHallOfLegends = lazy(() => import('./sports/WorldCupHallOfLegends'));
import {
  WCYear, HistoricalTeam, HistoricalPlayer,
  TEAMS_2022, TEAMS_2018, PLAYERS_2022, PLAYERS_2018, EDITIONS,
  getHistoricalTeamsByYear, getHistoricalPlayersByTeam, getEdition, getHistoricalTeam,
  TournamentEdition,
} from '../data/wcHistory';
import { auth, db } from '../services/backendService';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { onSnapshot } from '../services/safeSnapshot';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function fetchWikiPhoto(slug: string): Promise<string | null> {
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(slug)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.thumbnail?.source ?? data.originalimage?.source ?? null;
  } catch { return null; }
}

function positionLabel(pos: string): string {
  return ({ GK: 'Goalkeeper', DEF: 'Defender', MID: 'Midfielder', FWD: 'Forward' } as Record<string, string>)[pos] ?? pos;
}

function positionColor(pos: string): string {
  return ({ GK: '#F59E0B', DEF: '#3B82F6', MID: '#10B981', FWD: '#EF4444' } as Record<string, string>)[pos] ?? '#fff';
}

function getGroupsByYear(year: WCYear): string[] {
  const teams = year === 2022 ? TEAMS_2022 : TEAMS_2018;
  return [...new Set(teams.map(t => t.group))].sort();
}

function getTeamsByGroup(year: WCYear, group: string): HistoricalTeam[] {
  const teams = year === 2022 ? TEAMS_2022 : TEAMS_2018;
  return teams.filter(t => t.group === group);
}

function getAwardWinner(year: WCYear, key: 'isGoldenBoot' | 'isGoldenBall' | 'isGoldenGlove'): HistoricalPlayer | undefined {
  const players = year === 2022 ? PLAYERS_2022 : PLAYERS_2018;
  return players.find(p => p[key]);
}

// ── Sub-components ────────────────────────────────────────────────────────────

const PosBadge: React.FC<{ pos: string }> = ({ pos }) => (
  <span
    className="inline-block px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest"
    style={{ background: `${positionColor(pos)}22`, color: positionColor(pos) }}
  >
    {positionLabel(pos)}
  </span>
);

const StatPill: React.FC<{ label: string; value: string | number; color: string }> = ({ label, value, color }) => (
  <div className="flex flex-col items-center gap-1 p-3 rounded-2xl bg-white/[0.04] border border-white/8 min-w-[72px]">
    <span className="text-xl font-black text-white">{value}</span>
    <span className="text-[7px] font-black uppercase tracking-[0.3em] text-white/30">{label}</span>
  </div>
);

// ── Historical Player Profile ─────────────────────────────────────────────────

const HistoricalPlayerProfile: React.FC<{
  player: HistoricalPlayer;
  team: HistoricalTeam;
  onBack: () => void;
}> = ({ player, team, onBack }) => {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [tab, setTab] = useState<'stats' | 'news'>('stats');

  const uid = auth.currentUser?.uid;
  const followRef = uid ? doc(db, 'wcHistPlayerFollows', uid, 'players', player.id) : null;

  useEffect(() => {
    if (player.wikiSlug) fetchWikiPhoto(player.wikiSlug).then(setPhotoUrl);
  }, [player.wikiSlug]);

  useEffect(() => {
    if (!followRef) return;
    return onSnapshot(followRef, snap => setIsFollowing(snap.exists()));
  }, [player.id, uid]);

  const toggleFollow = useCallback(async () => {
    if (!followRef || followLoading) return;
    setFollowLoading(true);
    try {
      if (isFollowing) await deleteDoc(followRef);
      else await setDoc(followRef, { playerId: player.id, playerName: player.name, teamId: player.teamId, year: player.year, followedAt: Date.now() });
    } finally { setFollowLoading(false); }
  }, [followRef, isFollowing, followLoading, player]);

  const primary = team.primaryColor;
  const secondary = team.secondaryColor;

  const newsItems = [
    { headline: `${player.name} — WC${player.year} retrospective`, time: `${2026 - player.year} years ago` },
    { headline: `Watch: ${player.name}'s greatest World Cup moments`, time: `${2026 - player.year}y ago` },
    { headline: `Where is ${player.name} now?`, time: '1w ago' },
  ];

  return (
    <div className="space-y-5 pb-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 px-1 py-2 flex-wrap">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white hover:bg-white/[0.1] transition-all"
        >
          <ArrowLeft size={13} />
          {team.flag} {team.name} · WC{player.year}
        </button>
        <span className="text-white/20 text-xs">›</span>
        <span className="text-[10px] font-black text-white/50 uppercase tracking-wider">{player.name}</span>
      </nav>

      {/* Hero */}
      <div
        className="relative rounded-[2rem] overflow-hidden"
        style={{ background: `linear-gradient(145deg, ${primary} 0%, ${secondary} 60%, #000 100%)` }}
      >
        {/* Jersey number watermark */}
        <div
          className="absolute right-4 top-0 bottom-0 flex items-center select-none pointer-events-none"
          style={{ fontSize: '160px', fontWeight: 900, lineHeight: 1, color: 'rgba(255,255,255,0.06)', letterSpacing: '-0.05em' }}
        >
          {player.number}
        </div>

        <div className="relative px-7 py-8">
          <div className="flex items-start gap-5">
            {/* Photo / avatar */}
            <div
              className="w-24 h-24 rounded-2xl shrink-0 flex items-center justify-center overflow-hidden border-2"
              style={{ borderColor: `${primary}66`, background: `${primary}22` }}
            >
              {photoUrl
                ? <img src={photoUrl} alt={player.name} className="w-full h-full object-cover object-top" />
                : <User size={38} className="text-white/20" />
              }
            </div>

            <div className="flex-1 min-w-0">
              {/* Year badge */}
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span
                  className="px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest"
                  style={{ background: `${primary}30`, color: primary }}
                >
                  WC{player.year} · {team.flag} {team.name}
                </span>
                {player.isCaptain && (
                  <span className="flex items-center gap-1 text-[7px] font-black uppercase tracking-widest" style={{ color: primary }}>
                    <Shield size={9} style={{ color: primary }} /> Captain
                  </span>
                )}
              </div>
              <h2 className="text-2xl font-black uppercase tracking-tight text-white leading-none">{player.name}</h2>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className="text-[8px] font-black text-white/50">#{player.number}</span>
                <span className="text-white/20">·</span>
                <PosBadge pos={player.position} />
              </div>
              <p className="text-[9px] text-white/40 mt-1">Age {player.age} at WC{player.year} · {player.club}</p>

              {/* Award badges */}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {player.isGoldenBoot  && <span className="px-2 py-0.5 bg-yellow-500/20 border border-yellow-500/30 rounded-full text-[7px] font-black text-yellow-400 uppercase tracking-wider">⚽ Golden Boot</span>}
                {player.isGoldenBall  && <span className="px-2 py-0.5 bg-amber-500/20 border border-amber-500/30 rounded-full text-[7px] font-black text-amber-400 uppercase tracking-wider">🏆 Golden Ball</span>}
                {player.isGoldenGlove && <span className="px-2 py-0.5 bg-orange-500/20 border border-orange-500/30 rounded-full text-[7px] font-black text-orange-400 uppercase tracking-wider">🧤 Golden Glove</span>}
              </div>
            </div>
          </div>

          {/* Quick stats */}
          <div className="flex items-center gap-3 mt-5 overflow-x-auto pb-1 scrollbar-none">
            <StatPill label={`WC${player.year} Goals`} value={player.tournamentGoals} color="#FF8C00" />
            <StatPill label={`WC${player.year} Assists`} value={player.tournamentAssists} color="#10B981" />
            <StatPill label="Career Caps" value={player.caps} color={primary} />
            <StatPill label="Career Goals" value={player.goals} color="#EF4444" />
          </div>

          {/* Follow */}
          {uid && (
            <button
              onClick={toggleFollow}
              disabled={followLoading}
              className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all"
              style={isFollowing
                ? { background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)' }
                : { background: primary, color: '#000', border: `1px solid ${primary}` }
              }
            >
              {isFollowing ? <BellOff size={13} /> : <Bell size={13} />}
              {isFollowing ? 'Saved' : 'Save Player'}
            </button>
          )}
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-1 flex">
          <div className="flex-1" style={{ background: primary }} />
          <div className="flex-1" style={{ background: secondary }} />
        </div>
      </div>

      {/* Bio */}
      <p className="text-sm text-white/60 leading-relaxed px-1">{player.bio}</p>

      {/* Key player badge */}
      {player.isKeyPlayer && (
        <div
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl"
          style={{ background: `${primary}15`, border: `1px solid ${primary}30` }}
        >
          <Star size={13} style={{ color: primary }} />
          <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: primary }}>
            Tournament Key Player
          </span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-white/[0.03] border border-white/8 rounded-2xl">
        {([{ id: 'stats', label: 'Stats', icon: TrendingUp }, { id: 'news', label: 'News', icon: Newspaper }] as const).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${tab === t.id ? 'text-black shadow-lg' : 'text-white/40 hover:text-white/70'}`}
            style={tab === t.id ? { background: primary } : {}}
          >
            {React.createElement(t.icon as any, { size: 10 })}{t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
          {tab === 'stats' && (
            <div className="space-y-4">
              <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/30">WC{player.year} Tournament Stats</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Goals',          value: player.tournamentGoals },
                  { label: 'Assists',        value: player.tournamentAssists },
                  { label: 'Career Caps',    value: player.caps },
                  { label: 'Career Goals',   value: player.goals },
                  { label: 'Career Assists', value: player.assists },
                  { label: 'Position',       value: positionLabel(player.position) },
                  { label: 'Club',           value: player.club },
                  { label: 'Age at WC',      value: player.age },
                ].map(stat => (
                  <div key={stat.label} className="p-4 rounded-2xl bg-white/[0.03] border border-white/8">
                    <p className="text-[7px] font-black uppercase tracking-[0.25em] text-white/25 mb-1">{stat.label}</p>
                    <p className="text-base font-black text-white leading-none">{stat.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'news' && (
            <div className="space-y-2">
              {newsItems.map((item, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/8 hover:bg-white/[0.06] transition-colors cursor-pointer">
                  <div className="w-8 h-8 rounded-xl shrink-0 flex items-center justify-center" style={{ background: `${primary}22` }}>
                    <Newspaper size={14} style={{ color: primary }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-white/80 leading-snug">{item.headline}</p>
                    <p className="text-[8px] text-white/25 mt-1">{item.time} · World Cup Archive</p>
                  </div>
                </div>
              ))}
              <p className="text-[8px] text-center text-white/20 pt-1">Historical match coverage archived</p>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

// ── Team Roster (historical) ──────────────────────────────────────────────────

const HistoricalRoster: React.FC<{
  team: HistoricalTeam;
  onBack: () => void;
  onSelectPlayer: (p: HistoricalPlayer) => void;
}> = ({ team, onBack, onSelectPlayer }) => {
  const players = getHistoricalPlayersByTeam(team.id);
  const groups = (['GK', 'DEF', 'MID', 'FWD'] as const).filter(pos => players.some(p => p.position === pos));

  return (
    <div className="space-y-5 pb-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 px-1 py-2 flex-wrap">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white hover:bg-white/[0.1] transition-all"
        >
          <ArrowLeft size={13} />
          WC{team.year} Nations
        </button>
        <span className="text-white/20 text-xs">›</span>
        <span className="text-[10px] font-black text-white/50 uppercase tracking-wider">{team.flag} {team.name}</span>
      </nav>

      {/* Team hero */}
      <div
        className="relative rounded-[2rem] overflow-hidden px-8 py-8"
        style={{ background: `linear-gradient(135deg, ${team.primaryColor} 0%, ${team.secondaryColor}88 60%, #000 100%)` }}
      >
        <div className="absolute right-6 top-1/2 -translate-y-1/2 text-[120px] leading-none opacity-[0.1] select-none pointer-events-none">
          {team.flag}
        </div>
        <div className="relative">
          <p className="text-[8px] font-black uppercase tracking-[0.5em] text-white/50 mb-1">FIFA World Cup {team.year}</p>
          <h2 className="text-3xl font-black uppercase tracking-tight text-white leading-none">{team.name}</h2>
          <p className="text-[9px] text-white/50 mt-2">Group {team.group} · {players.length} players listed</p>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-1 flex">
          <div className="flex-1" style={{ background: team.primaryColor }} />
          <div className="flex-1" style={{ background: team.secondaryColor }} />
        </div>
      </div>

      {/* Roster by position */}
      {groups.map(pos => (
        <div key={pos}>
          <div className="flex items-center gap-2 mb-2">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: positionColor(pos) }}
            />
            <p className="text-[8px] font-black uppercase tracking-[0.3em]" style={{ color: positionColor(pos) }}>
              {positionLabel(pos)}s
            </p>
          </div>
          <div className="space-y-1.5">
            {players.filter(p => p.position === pos).map(player => (
              <motion.button
                key={player.id}
                onClick={() => onSelectPlayer(player)}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                className="w-full flex items-center gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/8 hover:bg-white/[0.07] hover:border-white/15 transition-all text-left"
              >
                {/* Number */}
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-black"
                  style={{ background: `${team.primaryColor}25`, color: team.primaryColor }}
                >
                  {player.number}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[11px] font-black text-white">{player.name}</p>
                    {player.isCaptain && (
                      <span className="px-1.5 py-0.5 bg-yellow-500/20 border border-yellow-500/30 rounded text-[6px] font-black text-yellow-400 uppercase tracking-wider">C</span>
                    )}
                    {player.isGoldenBoot  && <span className="text-[8px]">⚽</span>}
                    {player.isGoldenBall  && <span className="text-[8px]">🏆</span>}
                    {player.isGoldenGlove && <span className="text-[8px]">🧤</span>}
                  </div>
                  <p className="text-[8px] text-white/35 mt-0.5">{player.club} · {player.tournamentGoals}G {player.tournamentAssists}A in tournament</p>
                </div>

                <ChevronRight size={13} className="text-white/20 shrink-0" />
              </motion.button>
            ))}
          </div>
        </div>
      ))}

      {players.length === 0 && (
        <div className="py-12 text-center">
          <User size={28} className="text-white/10 mx-auto mb-3" />
          <p className="text-xs text-white/30">Player data coming soon</p>
        </div>
      )}
    </div>
  );
};

// ── Edition summary card ──────────────────────────────────────────────────────

const EditionSummary: React.FC<{ edition: TournamentEdition; year: WCYear; onTeamClick: (teamId: string) => void }> = ({ edition, year, onTeamClick }) => {
  const champion  = getHistoricalTeam(edition.champion);
  const runnerUp  = getHistoricalTeam(edition.runnerUp);
  const third     = getHistoricalTeam(edition.third);
  const boot      = getAwardWinner(year, 'isGoldenBoot');
  const ball      = getAwardWinner(year, 'isGoldenBall');
  const glove     = getAwardWinner(year, 'isGoldenGlove');

  return (
    <div className="space-y-4">
      {/* Champion banner */}
      <div
        className="relative rounded-[2rem] overflow-hidden p-8"
        style={{ background: `linear-gradient(135deg, ${champion?.primaryColor ?? '#111'} 0%, #000 80%)` }}
      >
        <div className="absolute right-6 top-1/2 -translate-y-1/2 text-[80px] leading-none opacity-[0.15] select-none">🏆</div>
        <div className="relative">
          <p className="text-[8px] font-black uppercase tracking-[0.5em] text-white/40 mb-1">{edition.host} {edition.year} · {edition.dates}</p>
          <p className="text-[8px] font-black uppercase tracking-[0.3em] text-yellow-400 mb-2">World Champions</p>
          <p className="text-4xl mb-1">{champion?.flag}</p>
          <h3 className="text-3xl font-black uppercase tracking-tight text-white">{champion?.name}</h3>
          <p className="text-xs text-white/40 mt-2">Final: {edition.finalScore}</p>
        </div>
      </div>

      {/* Finalists + 3rd */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '🥇 Champion', team: champion },
          { label: '🥈 Runner-up', team: runnerUp },
          { label: '🥉 Third Place', team: third },
        ].map(({ label, team }) => (
          <button
            key={label}
            onClick={() => team && onTeamClick(team.id)}
            className="p-4 rounded-2xl bg-white/[0.03] border border-white/8 hover:bg-white/[0.07] hover:border-white/15 transition-all text-center"
          >
            <p className="text-2xl mb-1">{team?.flag}</p>
            <p className="text-[9px] font-black text-white">{team?.shortName}</p>
            <p className="text-[7px] text-white/30 mt-1">{label}</p>
          </button>
        ))}
      </div>

      {/* Awards */}
      <div>
        <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/30 mb-3">Tournament Awards</p>
        <div className="grid grid-cols-1 gap-2">
          {[
            { icon: '⚽', label: 'Golden Boot', player: boot },
            { icon: '🏆', label: 'Golden Ball', player: ball },
            { icon: '🧤', label: 'Golden Glove', player: glove },
          ].map(({ icon, label, player }) => (
            <div key={label} className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/8">
              <span className="text-xl">{icon}</span>
              <div className="flex-1">
                <p className="text-[7px] font-black uppercase tracking-[0.3em] text-white/30">{label}</p>
                <p className="text-xs font-black text-white">{player?.name ?? '—'}</p>
                {player && (
                  <p className="text-[8px] text-white/30">
                    {player.isGoldenBoot ? `${player.tournamentGoals} goals` : ''}
                    {player.isGoldenGlove ? 'Best goalkeeper' : ''}
                    {player.isGoldenBall ? 'Best player' : ''}
                  </p>
                )}
              </div>
              {player && (
                <span className="text-[8px] text-white/30">{getHistoricalTeam(player.teamId)?.flag}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Top scorers */}
      <div>
        <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/30 mb-3">Top Scorers</p>
        <div className="space-y-1.5">
          {edition.topScorers.map((scorer, i) => (
            <div key={scorer.name} className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/8">
              <span className="text-[9px] font-black text-white/20 w-4">{i + 1}</span>
              <span className="text-base">{scorer.flag}</span>
              <p className="flex-1 text-[10px] font-bold text-white">{scorer.name}</p>
              <span className="text-sm font-black text-white/70">{scorer.goals}</span>
              <span className="text-[8px] text-white/25">goals</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── Nations grid ──────────────────────────────────────────────────────────────

const NationsGrid: React.FC<{ year: WCYear; onTeamClick: (teamId: string) => void }> = ({ year, onTeamClick }) => {
  const groups = getGroupsByYear(year);

  return (
    <div className="space-y-6">
      {groups.map(group => (
        <div key={group}>
          <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/30 mb-3">Group {group}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {getTeamsByGroup(year, group).map(team => (
              <motion.button
                key={team.id}
                onClick={() => onTeamClick(team.id)}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="p-4 rounded-2xl border transition-all text-left hover:border-white/20"
                style={{
                  background: `linear-gradient(135deg, ${team.primaryColor}20 0%, transparent 100%)`,
                  borderColor: `${team.primaryColor}30`,
                }}
              >
                <p className="text-2xl mb-2">{team.flag}</p>
                <p className="text-[10px] font-black text-white">{team.shortName}</p>
                <p className="text-[7px] text-white/30 mt-0.5">{team.name}</p>
              </motion.button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

type HistTab = 'summary' | 'nations' | 'legends';

const WorldCupHistoryHub: React.FC = () => {
  const [year, setYear]               = useState<WCYear>(2022);
  const [histTab, setHistTab]         = useState<HistTab>('summary');
  const [selectedTeamId, setSelectedTeamId]     = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer]     = useState<HistoricalPlayer | null>(null);

  const edition = getEdition(year);

  const handleTeamClick = (teamId: string) => {
    setSelectedPlayer(null);
    setSelectedTeamId(teamId);
  };

  const handleBack = () => {
    if (selectedPlayer) { setSelectedPlayer(null); return; }
    setSelectedTeamId(null);
  };

  // Drill-down: player profile
  if (selectedPlayer && selectedTeamId) {
    const team = getHistoricalTeam(selectedTeamId);
    if (team) {
      return (
        <HistoricalPlayerProfile
          player={selectedPlayer}
          team={team}
          onBack={handleBack}
        />
      );
    }
  }

  // Drill-down: team roster
  if (selectedTeamId) {
    const team = getHistoricalTeam(selectedTeamId);
    if (team) {
      return (
        <HistoricalRoster
          team={team}
          onBack={() => setSelectedTeamId(null)}
          onSelectPlayer={setSelectedPlayer}
        />
      );
    }
  }

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[8px] font-black uppercase tracking-[0.5em] text-white/30 mb-1">World Cup</p>
          <h2 className="text-2xl font-black uppercase tracking-tight text-white">History</h2>
        </div>
        <Medal size={22} className="text-[#FF8C00]" />
      </div>

      {/* Year selector (deep-dive editions; the Hall of Legends spans 1930→today) */}
      {histTab !== 'legends' && (
      <div className="flex items-center gap-2">
        {([2022, 2018] as WCYear[]).map(y => (
          <button
            key={y}
            onClick={() => { setYear(y); setHistTab('summary'); setSelectedTeamId(null); setSelectedPlayer(null); }}
            className={`flex-1 py-3 rounded-2xl font-black text-sm uppercase tracking-widest transition-all ${year === y ? 'bg-[#FF8C00] text-black shadow-lg' : 'bg-white/[0.03] border border-white/8 text-white/40 hover:text-white/70'}`}
          >
            {y === 2022 ? '🇶🇦' : '🇷🇺'} {y}
          </button>
        ))}
      </div>
      )}

      {/* Sub-tabs */}
      <div className="flex items-center gap-1 p-1 bg-white/[0.03] border border-white/8 rounded-2xl">
        {([
          { id: 'summary', label: 'Summary', icon: Trophy },
          { id: 'nations', label: 'Nations', icon: Medal },
          { id: 'legends', label: 'Hall of Legends', icon: Crown },
        ] as { id: HistTab; label: string; icon: React.ElementType }[]).map(t => (
          <button
            key={t.id}
            onClick={() => setHistTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${histTab === t.id ? 'bg-[#FF8C00] text-black shadow-lg' : 'text-white/40 hover:text-white/70'}`}
          >
            {React.createElement(t.icon as any, { size: 10 })}{t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${year}-${histTab}`}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
        >
          {histTab === 'summary' && (
            <EditionSummary edition={edition} year={year} onTeamClick={handleTeamClick} />
          )}
          {histTab === 'nations' && (
            <NationsGrid year={year} onTeamClick={handleTeamClick} />
          )}
          {histTab === 'legends' && (
            <Suspense fallback={
              <div className="flex items-center justify-center py-24">
                <div className="w-8 h-8 border-2 border-[#FF8C00]/20 border-t-[#FF8C00] rounded-full animate-spin" />
              </div>
            }>
              <WorldCupHallOfLegends
                onOpenTeam={(teamId, y) => {
                  setYear(y);
                  setSelectedPlayer(null);
                  setSelectedTeamId(teamId);
                }}
              />
            </Suspense>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default WorldCupHistoryHub;
