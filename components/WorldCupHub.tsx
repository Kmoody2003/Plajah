import React, { useState, useMemo, lazy, Suspense, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Calendar, Globe, Headphones, Lock, MapPin, Clock, Mic2, GitBranch, Target, Play, Pause, Download, ChevronDown, ChevronUp, Check, Loader2, History, Users } from 'lucide-react';
import {
  WC26_TEAMS, WC26_MATCHES, WC26_GROUPS, WC26_PODCASTS,
  getTeam, getTeamsByGroup, getUpcomingMatches, getLiveMatches,
  ROUND_LABELS, type WC26Match, type WC26Group,
} from '../data/worldCup2026';
import WorldCupCountryHub from './WorldCupCountryHub';
import { fetchAndParseRss, type ParsedPodcastFeed } from '../services/podcastRssImporter';
import { auth, syncImportedEpisodes } from '../services/backendService';
import { useGlobalPlayer } from '../contexts/GlobalPlayerContext';
import { UserProfile, type ImportedRssEpisode } from '../types';

// Lazy-loaded heavy tabs — each loads independently so a failure in one
// cannot crash the whole hub or any other tab.
const WorldCupPredictionMarket = lazy(() => import('./WorldCupPredictionMarket'));
const WorldCupBracket           = lazy(() => import('./WorldCupBracket'));
const WorldCupPicksHub          = lazy(() => import('./WorldCupPicksHub'));
const WorldCupHistoryHub        = lazy(() => import('./WorldCupHistoryHub'));
const WorldCupFanClubs          = lazy(() => import('./WorldCupFanClubs'));

const TabLoader = () => (
  <div className="flex items-center justify-center py-24">
    <div className="w-8 h-8 border-2 border-[#FF8C00]/30 border-t-[#FF8C00] rounded-full animate-spin" />
  </div>
);

// ── Anthem playlist banner (sits between hero and tab nav) ─────────────────────
const WcHubAnthemBanner: React.FC = () => {
  const [dismissed, setDismissed] = React.useState(() => localStorage.getItem('wc26_hub_anthem_dismissed') === '1');
  if (dismissed) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl flex items-center gap-4 px-5 py-4"
      style={{ background: 'linear-gradient(135deg, #001A35 0%, #003366 60%, #001A35 100%)', border: '1px solid rgba(255,140,0,0.25)' }}
    >
      {/* Flag strip bg */}
      <div className="absolute inset-0 flex items-center overflow-hidden opacity-[0.07] pointer-events-none select-none text-2xl gap-1 px-2">
        {WC26_TEAMS.slice(0, 24).map(t => <span key={t.id}>{t.flag}</span>)}
      </div>
      <div className="w-9 h-9 rounded-xl bg-[#FF8C00]/15 flex items-center justify-center text-xl shrink-0">🎵</div>
      <div className="flex-1 min-w-0 relative">
        <p className="text-[7px] font-black uppercase tracking-[0.4em] text-[#FF8C00] mb-0.5">Plajah Chora · Now Streaming</p>
        <p className="text-[10px] font-black text-white leading-snug">
          Celebrate the Countries of the World Cup — in music with our World Cup Playlist of National Anthems
        </p>
      </div>
      <a
        href="#"
        onClick={e => { e.preventDefault(); }}
        className="shrink-0 px-3 py-1.5 bg-[#FF8C00] text-black rounded-xl text-[7px] font-black uppercase tracking-widest hover:bg-[#FFA020] transition-colors whitespace-nowrap"
      >
        Go to Chora
      </a>
      <button
        onClick={() => { localStorage.setItem('wc26_hub_anthem_dismissed', '1'); setDismissed(true); }}
        className="shrink-0 p-1 rounded-full text-white/25 hover:text-white/50 transition-colors"
      >
        <span className="text-xs">✕</span>
      </button>
    </motion.div>
  );
};

// ── Feature flag — flip to true when prediction market is ready to ship ───────
const PREDICTIONS_LIVE = false;

type HubTab = 'groups' | 'schedule' | 'countries' | 'bracket' | 'picks' | 'podcast' | 'clubs' | 'history' | 'predictions';

interface Props {
  currentUser: UserProfile | null;
}

// ── Match card ─────────────────────────────────────────────────────────────────
const MatchCard: React.FC<{ match: WC26Match; onOpenRoom?: (matchId: string) => void }> = ({ match, onOpenRoom }) => {
  const home = getTeam(match.homeTeamId);
  const away = getTeam(match.awayTeamId);
  if (!home || !away) return null;

  const now = Date.now();
  const isLive = match.status === 'LIVE' ||
    (match.kickoffMs <= now && match.kickoffMs > now - 110 * 60 * 1000 && match.status === 'SCHEDULED');
  const isPast = match.status === 'FINISHED' || (!isLive && match.kickoffMs < now);
  const kickoff = new Date(match.kickoffMs);
  const timeStr = kickoff.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = kickoff.toLocaleDateString([], { month: 'short', day: 'numeric' });

  return (
    <motion.div
      layout
      className={`p-4 rounded-2xl border transition-all ${isLive
        ? 'bg-red-500/8 border-red-500/25 shadow-[0_0_20px_rgba(239,68,68,0.08)]'
        : 'bg-white/[0.03] border-white/8 hover:bg-white/[0.06] hover:border-white/15'
      }`}
    >
      {/* Round + live badge */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[8px] font-black uppercase tracking-[0.3em] text-white/30">
          {match.group ? `Group ${match.group}` : ROUND_LABELS[match.round]}
        </span>
        {isLive ? (
          <span className="flex items-center gap-1 px-2 py-0.5 bg-red-500/20 border border-red-500/30 rounded-full">
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
            <span className="text-[8px] font-black uppercase text-red-400">Live</span>
          </span>
        ) : (
          <span className="text-[8px] font-bold text-white/25">{dateStr} · {timeStr}</span>
        )}
      </div>

      {/* Teams */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 text-right">
          <p className="text-2xl leading-none mb-1">{home.flag}</p>
          <p className="text-[9px] font-black uppercase tracking-wider text-white/70">{home.shortName}</p>
        </div>
        <div className="px-3 py-1.5 bg-white/5 rounded-xl text-center min-w-[52px]">
          {(match.homeScore !== undefined && match.awayScore !== undefined)
            ? <span className="text-sm font-black text-white">{match.homeScore} – {match.awayScore}</span>
            : <span className="text-xs font-bold text-white/30">vs</span>
          }
        </div>
        <div className="flex-1 text-left">
          <p className="text-2xl leading-none mb-1">{away.flag}</p>
          <p className="text-[9px] font-black uppercase tracking-wider text-white/70">{away.shortName}</p>
        </div>
      </div>

      {/* Venue */}
      <div className="flex items-center justify-center gap-1 mt-3">
        <MapPin size={9} className="text-white/20" />
        <span className="text-[8px] text-white/20">{match.city}</span>
      </div>

      {/* Live room button */}
      {(isLive || match.status === 'SCHEDULED') && onOpenRoom && (
        <button
          onClick={() => onOpenRoom(match.id)}
          className={`w-full mt-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${isLive
            ? 'bg-red-500 text-white hover:bg-red-400 shadow-lg shadow-red-500/20'
            : 'bg-white/5 border border-white/10 text-white/50 hover:bg-[#FF8C00]/10 hover:border-[#FF8C00]/30 hover:text-[#FF8C00]'
          }`}
        >
          {isLive ? '⚡ Watch Live Room' : '🎙 Open Fan Room'}
        </button>
      )}
    </motion.div>
  );
};

// ── Group table ────────────────────────────────────────────────────────────────
const GroupTable: React.FC<{ group: WC26Group }> = ({ group }) => {
  const teams = getTeamsByGroup(group);
  return (
    <div className="bg-white/[0.03] border border-white/8 rounded-2xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-white/8 flex items-center gap-2">
        <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40">Group</span>
        <span className="text-sm font-black text-white">{group}</span>
      </div>
      <div className="divide-y divide-white/5">
        {teams.map(team => (
          <div key={team.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="text-lg leading-none">{team.flag}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black text-white truncate">{team.name}</p>
              <p className="text-[8px] text-white/30 uppercase tracking-wider">{team.confederation}</p>
            </div>
            <div className="flex items-center gap-3 text-[9px] font-bold text-white/30">
              <span>P</span><span>W</span><span>D</span><span>L</span><span className="text-white/50">Pts</span>
            </div>
            <div className="flex items-center gap-3 text-[9px] font-black text-white">
              <span>0</span><span>0</span><span>0</span><span>0</span><span className="text-[#FF8C00]">0</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Country grid card ──────────────────────────────────────────────────────────
const CountryCard: React.FC<{ team: typeof WC26_TEAMS[0]; onClick: () => void }> = ({ team, onClick }) => (
  <motion.button
    whileHover={{ scale: 1.04 }}
    whileTap={{ scale: 0.97 }}
    onClick={onClick}
    className="relative overflow-hidden rounded-2xl border border-white/8 group aspect-[3/4]"
    style={{ background: `linear-gradient(135deg, ${team.primaryColor}33, ${team.secondaryColor}22)` }}
  >
    <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors" />
    <div className="relative h-full flex flex-col items-center justify-center gap-2 p-3">
      <span className="text-4xl leading-none">{team.flag}</span>
      <div className="text-center">
        <p className="text-[9px] font-black text-white uppercase tracking-widest">{team.shortName}</p>
        <p className="text-[7px] text-white/40 uppercase tracking-wider mt-0.5">Group {team.group}</p>
      </div>
    </div>
    <div
      className="absolute bottom-0 left-0 right-0 h-1"
      style={{ background: team.primaryColor }}
    />
  </motion.button>
);


// ── Interactive podcast card ──────────────────────────────────────────────────
const PodcastCard: React.FC<{ podcast: typeof WC26_PODCASTS[0] }> = ({ podcast }) => {
  const { playTrack } = useGlobalPlayer();
  const [expanded, setExpanded]       = useState(false);
  const [feed, setFeed]               = useState<ParsedPodcastFeed | null>(null);
  const [loading, setLoading]         = useState(false);
  const [imported, setImported]       = useState(false);
  const [importing, setImporting]     = useState(false);
  const [playingId, setPlayingId]     = useState<string | null>(null);
  const [fetchErr, setFetchErr]       = useState(false);
  // Tracks whether a fetch is already in-flight so we never double-fetch.
  const fetchingRef = React.useRef(false);

  // All side-effects live here, NOT inside setState updaters.
  const open = useCallback(() => {
    const willExpand = !expanded;
    setExpanded(willExpand);
    if (willExpand && !feed && !fetchingRef.current) {
      fetchingRef.current = true;
      setLoading(true);
      setFetchErr(false);
      fetchAndParseRss(podcast.rssUrl)
        .then(f => { setFeed(f); })
        .catch(() => { setFetchErr(true); })
        .finally(() => { setLoading(false); fetchingRef.current = false; });
    }
  }, [expanded, feed, podcast.rssUrl]);

  const handlePlay = useCallback((ep: ImportedRssEpisode) => {
    if (!ep.audioUrl) return;
    try {
      const track = {
        id:         ep.id,
        title:      ep.title,
        artist:     feed?.author ?? podcast.title,
        url:        ep.audioUrl,
        albumCover: ep.imageUrl ?? feed?.imageUrl,
        albumTitle: feed?.title ?? podcast.title,
        duration:   undefined,
      };
      playTrack(track as any, null, 'RADIO');
      setPlayingId(ep.id);
    } catch {
      // playTrack failure is non-fatal — just don't update playingId
    }
  }, [feed, podcast.title, playTrack]);

  const handleImport = useCallback(() => {
    if (!auth.currentUser || !feed || importing) return;
    setImporting(true);
    syncImportedEpisodes(feed.episodes)
      .then(() => { setImported(true); })
      .catch(() => { /* silent — import is non-critical */ })
      .finally(() => { setImporting(false); });
  }, [feed, importing]);

  const episodes = feed?.episodes.slice(0, 6) ?? [];

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] overflow-hidden">
      {/* Header row — always visible, click to expand */}
      <button
        onClick={open}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-white/[0.04] transition-colors"
      >
        <div className="w-12 h-12 rounded-xl shrink-0 flex items-center justify-center bg-white/[0.06]">
          <Headphones size={20} className="text-white/30" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-black text-white">{podcast.title}</p>
          <p className="text-[9px] text-white/35 mt-0.5 line-clamp-1">{podcast.description}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="px-2 py-0.5 bg-white/8 rounded-full text-[7px] font-black text-white/40 uppercase tracking-wider">{podcast.language}</span>
          {loading
            ? <Loader2 size={14} className="text-white/30 animate-spin" />
            : expanded ? <ChevronUp size={14} className="text-white/30" /> : <ChevronDown size={14} className="text-white/30" />
          }
        </div>
      </button>

      {/* Expanded episode list */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/8 px-4 py-3 space-y-1">
              {fetchErr && (
                <p className="text-[9px] text-red-400/70 text-center py-4">
                  Could not load feed — check your connection or try again.
                </p>
              )}

              {loading && (
                <div className="flex items-center justify-center py-6">
                  <Loader2 size={20} className="text-white/20 animate-spin" />
                </div>
              )}

              {episodes.map(ep => (
                <div key={ep.id} className="flex items-start gap-3 py-2.5 border-b border-white/5 last:border-0">
                  <button
                    onClick={() => handlePlay(ep)}
                    disabled={!ep.audioUrl}
                    className={`mt-0.5 w-7 h-7 rounded-lg shrink-0 flex items-center justify-center transition-all ${
                      ep.audioUrl
                        ? 'bg-[#FF8C00]/15 hover:bg-[#FF8C00]/30 text-[#FF8C00]'
                        : 'bg-white/5 text-white/15 cursor-not-allowed'
                    }`}
                  >
                    {playingId === ep.id
                      ? <Pause size={11} />
                      : <Play size={11} />
                    }
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-white/80 leading-snug line-clamp-2">{ep.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {ep.duration && <span className="text-[8px] text-white/25">{ep.duration}</span>}
                      {ep.pubDate && (
                        <span className="text-[8px] text-white/20">
                          {new Date(ep.pubDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {feed && episodes.length === 0 && (
                <p className="text-[9px] text-white/25 text-center py-4">No episodes found in feed</p>
              )}

              {/* Import button */}
              {feed && auth.currentUser && (
                <div className="pt-2 flex items-center justify-between">
                  <p className="text-[8px] text-white/25">{feed.episodes.length} episodes available</p>
                  <button
                    onClick={handleImport}
                    disabled={importing || imported}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all ${
                      imported
                        ? 'bg-green-500/15 border border-green-500/25 text-green-400'
                        : 'bg-[#FF8C00]/15 border border-[#FF8C00]/25 text-[#FF8C00] hover:bg-[#FF8C00]/25'
                    }`}
                  >
                    {importing ? <Loader2 size={10} className="animate-spin" /> : imported ? <Check size={10} /> : <Download size={10} />}
                    {imported ? 'Added to Library' : importing ? 'Importing…' : 'Add All to Library'}
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ── Main hub ──────────────────────────────────────────────────────────────────
const WorldCupHub: React.FC<Props> = ({ currentUser }) => {
  const [tab, setTab] = useState<HubTab>('groups');
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);

  const upcoming = useMemo(() => getUpcomingMatches(12), []);
  const live = useMemo(() => getLiveMatches(), []);

  // Navigate to Live Hub pre-loaded with match context
  const openFanRoom = useCallback((matchId: string) => {
    window.dispatchEvent(new CustomEvent('NAVIGATE', {
      detail: { target: 'LIVE_HUB', params: { wcMatchId: matchId } },
    }));
  }, []);

  const now = Date.now();
  const tournamentStart = new Date('2026-06-11T18:00:00-05:00').getTime();
  const tournamentEnd   = new Date('2026-07-19T18:00:00-05:00').getTime();
  const msLeft = tournamentStart - now;
  const daysLeft = Math.max(0, Math.floor(msLeft / 86_400_000));
  const hoursLeft = Math.max(0, Math.floor((msLeft % 86_400_000) / 3_600_000));
  const isLive = now >= tournamentStart && now <= tournamentEnd;

  const TABS: { id: HubTab; label: string; icon: React.ElementType; hidden?: boolean }[] = [
    { id: 'groups',      label: 'Groups',    icon: Trophy },
    { id: 'schedule',    label: 'Schedule',  icon: Calendar },
    { id: 'countries',   label: 'Countries', icon: Globe },
    { id: 'bracket',     label: 'Bracket',   icon: GitBranch },
    { id: 'picks',       label: 'Picks',     icon: Target },
    { id: 'podcast',     label: 'Podcast',   icon: Headphones },
    { id: 'clubs',       label: 'Fan Clubs', icon: Users },
    { id: 'history',     label: 'History',   icon: History },
    { id: 'predictions', label: 'Predict',   icon: Lock, hidden: !PREDICTIONS_LIVE },
  ];

  if (selectedCountry) {
    const team = getTeam(selectedCountry);
    if (team) {
      return (
        <WorldCupCountryHub
          team={team}
          currentUser={currentUser}
          onBack={() => setSelectedCountry(null)}
        />
      );
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Hero banner ── */}
      <div
        className="relative rounded-[2rem] overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #000B18 0%, #001A35 50%, #000B18 100%)' }}
      >
        {/* Trophy watermark */}
        <div className="absolute right-6 top-1/2 -translate-y-1/2 text-[120px] leading-none opacity-[0.07] select-none pointer-events-none">🏆</div>

        <div className="relative px-5 py-7 md:px-8 md:py-10 flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-6">
          <div className="flex-1">
            <p className="text-[8px] font-black uppercase tracking-[0.5em] text-[#FF8C00] mb-2">FIFA</p>
            <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tighter leading-[0.9] text-white">
              World Cup<br />
              <span style={{ color: '#FF8C00' }}>2026™</span>
            </h1>
            <p className="text-xs text-white/40 mt-2 md:mt-3 leading-relaxed">USA · Canada · Mexico · June 11 – July 19</p>
          </div>

          {/* Countdown / live badge */}
          <div className="shrink-0">
            {isLive ? (
              <div className="flex items-center gap-2 px-5 py-3 bg-red-500/15 border border-red-500/30 rounded-2xl">
                <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
                <span className="text-sm font-black text-red-400 uppercase tracking-widest">Live Now</span>
              </div>
            ) : msLeft > 0 ? (
              <div className="text-center">
                <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/30 mb-2">Kicks off in</p>
                <div className="flex items-end gap-2">
                  <div className="text-center px-3 py-2 bg-white/5 rounded-xl">
                    <p className="text-3xl font-black text-white leading-none">{daysLeft}</p>
                    <p className="text-[7px] text-white/30 uppercase tracking-wider mt-1">days</p>
                  </div>
                  <span className="text-2xl font-black text-white/20 mb-1">:</span>
                  <div className="text-center px-3 py-2 bg-white/5 rounded-xl">
                    <p className="text-3xl font-black text-white leading-none">{hoursLeft}</p>
                    <p className="text-[7px] text-white/30 uppercase tracking-wider mt-1">hrs</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="px-4 py-2 bg-white/5 rounded-xl">
                <p className="text-xs font-bold text-white/30">Tournament Ended</p>
              </div>
            )}
          </div>
        </div>

        {/* Stats strip */}
        <div className="border-t border-white/8 px-5 md:px-8 py-3 flex items-center gap-4 md:gap-8 text-center overflow-x-auto scrollbar-none">
          {[
            { label: 'Nations', value: '48' },
            { label: 'Groups',  value: '12' },
            { label: 'Matches', value: '104' },
            { label: 'Days',    value: '39' },
          ].map(s => (
            <div key={s.label}>
              <p className="text-base font-black text-white">{s.value}</p>
              <p className="text-[7px] font-black uppercase tracking-[0.3em] text-white/30">{s.label}</p>
            </div>
          ))}
          {live.length > 0 && (
            <div className="ml-auto flex items-center gap-2 px-3 py-1.5 bg-red-500/15 border border-red-500/25 rounded-xl">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
              <span className="text-[9px] font-black text-red-400">{live.length} Match{live.length > 1 ? 'es' : ''} Live</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Anthem Playlist Banner ── */}
      <WcHubAnthemBanner />

      {/* ── Tab nav (scrollable) ── */}
      <div className="overflow-x-auto scrollbar-none -mx-1 px-1">
        <div className="flex items-center gap-1 p-1 bg-white/[0.03] border border-white/8 rounded-2xl min-w-max">
          {TABS.filter(t => !t.hidden).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                tab === t.id
                  ? 'bg-[#FF8C00] text-black shadow-lg shadow-[#FF8C00]/25'
                  : 'text-white/40 hover:text-white/70'
              }`}
            >
              {React.createElement(t.icon as any, { size: 11 })}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
        >
          {/* GROUPS */}
          {tab === 'groups' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {WC26_GROUPS.map(g => <GroupTable key={g} group={g} />)}
            </div>
          )}

          {/* SCHEDULE */}
          {tab === 'schedule' && (
            <div className="space-y-3">
              {live.length > 0 && (
                <div className="mb-4">
                  <p className="text-[9px] font-black uppercase tracking-[0.3em] text-red-400 mb-3 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" /> Live
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {live.map(m => <MatchCard key={m.id} match={m} onOpenRoom={openFanRoom} />)}
                  </div>
                </div>
              )}
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30 mb-3 flex items-center gap-2">
                <Clock size={10} /> Upcoming
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {upcoming.map(m => <MatchCard key={m.id} match={m} onOpenRoom={openFanRoom} />)}
              </div>
              {upcoming.length === 0 && (
                <div className="py-16 text-center">
                  <Trophy size={32} className="text-white/10 mx-auto mb-3" />
                  <p className="text-sm text-white/30">No upcoming matches</p>
                </div>
              )}
            </div>
          )}

          {/* COUNTRIES */}
          {tab === 'countries' && (
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30 mb-4">
                48 Nations · Tap to open fan hub
              </p>
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                {WC26_TEAMS.map(team => (
                  <CountryCard
                    key={team.id}
                    team={team}
                    onClick={() => setSelectedCountry(team.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* BRACKET */}
          {tab === 'bracket' && (
            <Suspense fallback={<TabLoader />}>
              <WorldCupBracket />
            </Suspense>
          )}

          {/* PICKS */}
          {tab === 'picks' && (
            <Suspense fallback={<TabLoader />}>
              <WorldCupPicksHub currentUser={currentUser} />
            </Suspense>
          )}

          {/* PODCAST */}
          {tab === 'podcast' && (
            <div className="space-y-3">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#FF8C00] mb-1 flex items-center gap-2">
                  <Mic2 size={10} /> Football Podcasts
                </p>
                <p className="text-xs text-white/35 mb-1">Curated World Cup 2026 coverage</p>
                <p className="text-[8px] text-white/20 mb-4">Tap any podcast to browse episodes and add to your library</p>
              </div>
              {WC26_PODCASTS.map((pod, i) => (
                <PodcastCard key={i} podcast={pod} />
              ))}
            </div>
          )}

          {/* FAN CLUBS — unofficial open clubs for all 48 nations */}
          {tab === 'clubs' && (
            <Suspense fallback={<TabLoader />}>
              <WorldCupFanClubs currentUser={currentUser} />
            </Suspense>
          )}

          {/* HISTORY — 2022 Qatar + 2018 Russia */}
          {tab === 'history' && (
            <Suspense fallback={<TabLoader />}>
              <WorldCupHistoryHub />
            </Suspense>
          )}

          {/* PREDICTIONS — hidden until PREDICTIONS_LIVE flag */}
          {tab === 'predictions' && PREDICTIONS_LIVE && (
            <Suspense fallback={<TabLoader />}>
              <WorldCupPredictionMarket currentUser={currentUser} />
            </Suspense>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default WorldCupHub;
