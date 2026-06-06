import React, { useEffect, useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { SportsCenterView } from './SportsCenterView';
import {
  Zap, Search, X, Plus, MapPin, Trophy, TrendingUp, Newspaper,
  ChevronRight, ChevronLeft, Star, Shield, BarChart2, Flag, Gauge,
  Radio, Gamepad2, Globe, RefreshCw, Dumbbell, Target, CircleDot,
} from 'lucide-react';
import { fetchNewsFromRSS } from '../services/rssService';
import { Article, UserProfile } from '../types';
import { fetchLeagueNews, fetchLeagueScores } from '../services/sportsService';
import { SPORTS_INTELLIGENCE_DOMAINS, seedSportsSourceRegistry } from '../services/sportsKnowledgeService';
import { getLeagueStaticTeams } from '../data/leagueTeams';
import { StatCardBuilder } from './sports/StatCardBuilder';
import { RaceHistoryView } from './sports/RaceHistoryView';

// ─── League config ─────────────────────────────────────────────────────────────
const LEAGUES = [
  { id: 'ALL',     label: 'All Sports', icon: Globe,    color: '#FF8C00' },
  { id: 'NBA',     label: 'NBA',        icon: Trophy,   color: '#C9082A' },
  { id: 'NFL',     label: 'NFL',        icon: Shield,   color: '#013369' },
  { id: 'MLB',     label: 'MLB',        icon: Flag,     color: '#002D72' },
  { id: 'NHL',     label: 'NHL',        icon: Zap,      color: '#00539B' },
  { id: 'FIFA',    label: 'Soccer',     icon: Globe,    color: '#39B54A' },
  { id: 'MLS',     label: 'MLS',        icon: Globe,    color: '#00245D' },
  { id: 'NCAA',    label: 'NCAA',       icon: Trophy,   color: '#00539B' },
  { id: 'WNBA',    label: 'WNBA',       icon: Trophy,   color: '#F57C00' },
  { id: 'ESPORTS', label: 'Esports',    icon: Gamepad2, color: '#7B2FBE' },
  { id: 'F1',      label: 'Formula 1',  icon: Gauge,    color: '#E10600' },
  { id: 'NASCAR',  label: 'NASCAR',     icon: Gauge,    color: '#FFB514' },
  { id: 'INDYCAR', label: 'IndyCar',    icon: Gauge,    color: '#C5232A' },
  { id: 'UFC',     label: 'UFC',        icon: Dumbbell, color: '#D20A0A' },
  { id: 'MMA',     label: 'MMA',        icon: Dumbbell, color: '#8B0000' },
  { id: 'BOXING',  label: 'Boxing',     icon: Dumbbell, color: '#B91C1C' },
  { id: 'MARTIAL_ARTS', label: 'Martial Arts', icon: Target, color: '#C2410C' },
  { id: 'FENCING', label: 'Fencing',    icon: Target,   color: '#CBD5E1' },
  { id: 'TENNIS',  label: 'Tennis',     icon: CircleDot,color: '#84CC16' },
  { id: 'GOLF',    label: 'Golf',       icon: Flag,     color: '#16A34A' },
  { id: 'CRICKET', label: 'Cricket',    icon: CircleDot,color: '#2563EB' },
  { id: 'RUGBY',   label: 'Rugby',      icon: Shield,   color: '#7C2D12' },
  { id: 'WRESTLING', label: 'Wrestling', icon: Dumbbell,color: '#A16207' },
  { id: 'VOLLEYBALL', label: 'Volleyball', icon: CircleDot, color: '#0EA5E9' },
  { id: 'LACROSSE', label: 'Lacrosse',  icon: Target,   color: '#9333EA' },
] as const;

const LEAGUE_LOGOS: Record<string, string> = {
  NBA: 'https://a.espncdn.com/i/teamlogos/leagues/500/nba.png',
  NFL: 'https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png',
  MLB: 'https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png',
  NHL: 'https://a.espncdn.com/i/teamlogos/leagues/500/nhl.png',
  NCAA: 'https://a.espncdn.com/i/teamlogos/leagues/500/ncaa.png',
  WNBA: 'https://a.espncdn.com/i/teamlogos/leagues/500/wnba.png',
  FIFA: 'https://a.espncdn.com/i/teamlogos/leagues/500/fifa.png',
  MLS: 'https://a.espncdn.com/i/teamlogos/leagues/500/mls.png',
  UFC: 'https://a.espncdn.com/i/teamlogos/leagues/500/ufc.png',
  MMA: 'https://a.espncdn.com/i/teamlogos/leagues/500/ufc.png',
  BOXING: 'https://a.espncdn.com/i/teamlogos/leagues/500/boxing.png',
  MARTIAL_ARTS: 'https://images.unsplash.com/photo-1555597673-b21d5c935865?w=300&q=80',
  FENCING: 'https://images.unsplash.com/photo-1599058917212-d750089bc07e?w=300&q=80',
  TENNIS: 'https://a.espncdn.com/i/teamlogos/leagues/500/tennis.png',
  GOLF: 'https://a.espncdn.com/i/teamlogos/leagues/500/golf.png',
  CRICKET: 'https://a.espncdn.com/i/teamlogos/leagues/500/cricket.png',
  RUGBY: 'https://a.espncdn.com/i/teamlogos/leagues/500/rugby.png',
  WRESTLING: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=300&q=80',
  VOLLEYBALL: 'https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?w=300&q=80',
  LACROSSE: 'https://images.unsplash.com/photo-1564694202779-bc908c327862?w=300&q=80',
};

const HERO_FALLBACKS = [
  { id: 'h1', title: 'World Sport Today', subtitle: 'Breaking headlines across every league', imageUrl: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=1400&q=80' },
  { id: 'h2', title: 'Game Day Coverage', subtitle: 'Live scores, analysis and highlights', imageUrl: 'https://images.unsplash.com/photo-1508098682722-e99c643e7f0b?w=1400&q=80' },
  { id: 'h3', title: 'Formula 1 Season',  subtitle: 'Race results, standings and replay', imageUrl: 'https://images.unsplash.com/photo-1504137957-34a07c86abfc?w=1400&q=80' },
  { id: 'h4', title: 'Court & Field',     subtitle: 'NBA, NFL, MLB — your leagues in one place', imageUrl: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=1400&q=80' },
];

const normalizeSportsArticle = (item: any, fallbackSource = 'Sports'): Article => ({
  id: String(item.id || item.guid || item.url || item.links?.web?.href || item.headline || item.title || Math.random()),
  title: item.title || item.headline || 'Sports update',
  content: item.content || item.summary || item.description || item.descriptionText || '',
  source: item.source || item.byline || fallbackSource,
  url: item.url || item.links?.web?.href || '#',
  imageUrl: item.imageUrl || item.images?.[0]?.url || item.images?.[0]?.href || '',
  timestamp: item.timestamp || (item.published ? new Date(item.published).getTime() : Date.now()),
} as Article);

// ─── Hero carousel ─────────────────────────────────────────────────────────────
const SportsHero: React.FC<{ items: any[] }> = ({ items }) => {
  const [idx, setIdx] = useState(0);
  const [direction, setDir] = useState(1);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const go = (n: number) => {
    setDir(n > idx ? 1 : -1);
    setIdx(n);
  };
  const next = () => { setDir(1); setIdx(i => (i + 1) % items.length); };
  const prev = () => { setDir(-1); setIdx(i => (i - 1 + items.length) % items.length); };

  useEffect(() => {
    timer.current = setInterval(next, 7000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [items.length]);

  if (!items.length) return (
    <div className="relative h-[55vh] min-h-[380px] bg-gradient-to-br from-[#1a1a2e] to-[#0a0a0a] rounded-[2.5rem] overflow-hidden flex items-end p-8">
      <div>
        <p className="text-[9px] font-black uppercase tracking-[0.4em] text-[#FF8C00] mb-2">Plajah Sports</p>
        <h2 className="text-5xl font-black uppercase tracking-tighter text-white">Your World of Sport</h2>
      </div>
    </div>
  );

  const item = items[idx];

  return (
    <div className="relative h-[55vh] min-h-[380px] rounded-[2.5rem] overflow-hidden group shadow-2xl">
      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={idx}
          custom={direction}
          initial={{ opacity: 0, x: direction * 60 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -direction * 60 }}
          transition={{ duration: 0.6, ease: [0.25, 1, 0.5, 1] }}
          className="absolute inset-0"
        >
          {item.imageUrl ? (
            <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover scale-105 group-hover:scale-100 transition-transform duration-700" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#1a1a2e] to-[#0a0a0a]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-black/10" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-transparent to-transparent" />
        </motion.div>
      </AnimatePresence>

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-8 md:p-12 max-w-3xl z-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={`content-${idx}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.45, delay: 0.1 }}
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="px-3 py-1 bg-[#FF8C00]/90 rounded-xl text-[8px] font-black uppercase tracking-widest text-white">
                Plajah Sports
              </span>
              {item.subtitle && (
                <span className="text-[9px] font-black uppercase tracking-widest text-white/50">{item.subtitle}</span>
              )}
            </div>
            <h2 className="text-3xl sm:text-5xl md:text-6xl font-black uppercase tracking-tight leading-[0.9] text-white drop-shadow-2xl">
              {item.title}
            </h2>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Controls */}
      <div className="absolute top-1/2 -translate-y-1/2 left-4 right-4 flex justify-between z-10 pointer-events-none">
        <button onClick={prev} className="pointer-events-auto w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/15 flex items-center justify-center text-white/70 hover:text-white hover:bg-black/60 transition-all opacity-0 group-hover:opacity-100">
          <ChevronLeft size={18} />
        </button>
        <button onClick={next} className="pointer-events-auto w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/15 flex items-center justify-center text-white/70 hover:text-white hover:bg-black/60 transition-all opacity-0 group-hover:opacity-100">
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Dots */}
      <div className="absolute bottom-4 right-6 flex gap-1.5 z-10">
        {items.map((_, i) => (
          <button key={i} onClick={() => go(i)}
            className={`transition-all duration-300 rounded-full ${i === idx ? 'w-6 h-2 bg-[#FF8C00]' : 'w-2 h-2 bg-white/30 hover:bg-white/60'}`} />
        ))}
      </div>
    </div>
  );
};

// ─── Headline card ─────────────────────────────────────────────────────────────
const HeadlineCard: React.FC<{ article: Article; featured?: boolean }> = ({ article, featured }) => (
  <a
    href={article.url || '#'} target="_blank" rel="noreferrer"
    className={`group flex gap-4 p-5 bg-white/[0.03] border border-white/8 rounded-[1.5rem] hover:bg-white/[0.07] hover:border-white/20 transition-all ${featured ? 'flex-col' : ''}`}
  >
    {article.imageUrl && (
      <div className={`shrink-0 rounded-xl overflow-hidden ${featured ? 'w-full aspect-video' : 'w-20 h-16'}`}>
        <img src={article.imageUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
      </div>
    )}
    <div className="flex-1 min-w-0">
      {article.source && (
        <p className="text-[8px] font-black uppercase tracking-[0.3em] text-[#FF8C00] mb-1.5">{article.source}</p>
      )}
      <h4 className={`font-black uppercase tracking-tight leading-tight group-hover:text-[#FF8C00] transition-colors line-clamp-3 ${featured ? 'text-lg' : 'text-[10px]'}`}>
        {article.title}
      </h4>
      {featured && article.content && (
        <p className="text-[10px] text-white/40 mt-2 line-clamp-2 leading-relaxed">{article.content}</p>
      )}
    </div>
    <ChevronRight size={14} className="text-white/20 group-hover:text-[#FF8C00] transition-colors shrink-0 self-center" />
  </a>
);

// ─── Team hub card ─────────────────────────────────────────────────────────────
const TeamHubCard: React.FC<{ team: any; onRemove: () => void; onClick: () => void }> = ({ team, onRemove, onClick }) => (
  <motion.div layout className="relative group">
    <button onClick={onClick} className="w-full flex items-center gap-3 p-3.5 rounded-[1.5rem] border border-white/8 bg-white/[0.03] hover:bg-white/[0.07] hover:border-[#FF8C00]/30 transition-all text-left">
      <div className="w-11 h-11 rounded-xl overflow-hidden bg-white/10 shrink-0 flex items-center justify-center">
        {team.logo
          ? <img src={team.logo} alt={team.name} className="w-full h-full object-contain p-1" loading="lazy" />
          : <Trophy size={16} className="text-white/20" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-black uppercase tracking-tight text-white leading-tight truncate">{team.name}</p>
        <p className="text-[8px] font-black uppercase tracking-widest text-[#FF8C00]/70 mt-0.5">{team.league}</p>
      </div>
      <ChevronRight size={12} className="text-white/20 group-hover:text-[#FF8C00] transition-colors shrink-0" />
    </button>
    <button
      onClick={e => { e.stopPropagation(); onRemove(); }}
      className="absolute -top-1 -right-1 w-5 h-5 bg-black border border-white/20 rounded-full opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center hover:bg-red-500 hover:border-red-400"
    >
      <X size={9} />
    </button>
  </motion.div>
);

// ─── Live score chip ───────────────────────────────────────────────────────────
const ScoreChip: React.FC<{ event: any }> = ({ event }) => {
  const comps = event.competitions?.[0];
  const away = comps?.competitors?.find((c: any) => c.homeAway === 'away');
  const home = comps?.competitors?.find((c: any) => c.homeAway === 'home');
  const isLive = event.status?.type?.state === 'in';
  const isPre  = event.status?.type?.state === 'pre';

  return (
    <div className={`shrink-0 min-w-[180px] px-4 py-3 rounded-2xl border text-center ${isLive ? 'bg-red-500/8 border-red-500/25' : 'bg-white/[0.03] border-white/8'}`}>
      <div className="flex items-center justify-center gap-1.5 mb-2">
        {isLive && <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />}
        <p className="text-[7px] font-black uppercase tracking-widest text-white/35">{event.status?.type?.shortDetail}</p>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <img src={away?.team?.logo} alt="" className="w-5 h-5 object-contain opacity-80" loading="lazy" />
          <p className="text-[9px] font-black text-white/70 truncate">{away?.team?.abbreviation}</p>
        </div>
        <div className="text-[10px] font-black text-white">
          {isPre ? 'vs' : `${away?.score ?? '—'} – ${home?.score ?? '—'}`}
        </div>
        <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
          <p className="text-[9px] font-black text-white/70 truncate">{home?.team?.abbreviation}</p>
          <img src={home?.team?.logo} alt="" className="w-5 h-5 object-contain opacity-80" loading="lazy" />
        </div>
      </div>
    </div>
  );
};

// ─── Main component ─────────────────────────────────────────────────────────────

interface Props {
  onVisitUser?: (uid: string) => void;
  currentUser?: UserProfile | null;
}

export const PlajahSportsView: React.FC<Props> = ({ onVisitUser, currentUser }) => {
  const [hero, setHero]               = useState<any[]>(HERO_FALLBACKS);
  const [activeTab, setActiveTab]     = useState<string>('ALL');
  const [favoriteTeams, setFavTeams]  = useState<any[]>([]);
  const [headlines, setHeadlines]     = useState<Article[]>([]);
  const [liveScores, setLiveScores]   = useState<any[]>([]);
  const [teamSearch, setTeamSearch]   = useState('');
  const [searchResults, setSearchRes] = useState<any[]>([]);
  const [showSearch, setShowSearch]   = useState(false);
  const [detectedCity, setCity]       = useState<string | null>(null);
  const [geoStatus, setGeoStatus]     = useState<'idle'|'pending'|'denied'|'failed'|'success'>('idle');
  const [manualCity, setManualCity]   = useState('');
  const [showStatCard, setShowStatCard] = useState(false);
  const [loadingNews, setLoadingNews] = useState(false);

  // ── Persist favorite teams ──────────────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem('vibestream_favorite_teams_v2');
    if (saved) {
      try { setFavTeams(JSON.parse(saved)); } catch {}
    }
  }, []);

  const saveFavs = (teams: any[]) => {
    setFavTeams(teams);
    localStorage.setItem('vibestream_favorite_teams_v2', JSON.stringify(teams));
  };

  const addFav = (t: any) => {
    const next = [{ name: t.name, league: t.league, logo: t.logo }, ...favoriteTeams.filter(x => x.name !== t.name)].slice(0, 16);
    saveFavs(next);
    setShowSearch(false);
    setTeamSearch('');
  };
  const removeFav = (name: string) => saveFavs(favoriteTeams.filter(t => t.name !== name));

  // ── Load news & scores ──────────────────────────────────────────────────────
  const loadData = async (tab: string) => {
    setLoadingNews(true);
    try {
      const scoreTabs = ['NBA', 'NFL', 'MLB', 'NHL', 'WNBA', 'FIFA', 'MLS', 'UFC', 'BOXING', 'TENNIS', 'GOLF'];
      const [news, scores] = await Promise.allSettled([
        tab === 'ALL'
          ? fetchNewsFromRSS('SPORTS_ALL')
          : fetchLeagueNews(tab as any),
        tab === 'ALL'
          ? Promise.allSettled(scoreTabs.map(lg => fetchLeagueScores(lg as any))).then(results =>
              results.flatMap(result => result.status === 'fulfilled' ? result.value : [])
            )
          : tab !== 'ESPORTS'
          ? fetchLeagueScores(tab as any)
          : Promise.resolve([]),
      ]);

      const rawNews = news.status === 'fulfilled' ? news.value ?? [] : [];
      const newsArr = rawNews.map((item: any) => normalizeSportsArticle(item, tab === 'ALL' ? 'Sports' : tab));
      const scoreArr = scores.status === 'fulfilled' ? scores.value ?? [] : [];

      setHeadlines(newsArr.slice(0, 16));
      setLiveScores(scoreArr.slice(0, 12));

      // Build hero from news with images
      const heroItems = newsArr
        .filter((n: any) => n.imageUrl)
        .slice(0, 6)
        .map((n: any, i: number) => ({ id: n.id || `n${i}`, title: n.title, subtitle: n.source || tab, imageUrl: n.imageUrl }));
      if (heroItems.length >= 2) setHero(heroItems);
    } finally {
      setLoadingNews(false);
    }
  };

  useEffect(() => { loadData(activeTab); }, [activeTab]);

  useEffect(() => {
    seedSportsSourceRegistry().catch(() => {});
  }, []);

  // ── Team search ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const q = teamSearch.trim().toLowerCase();
    if (q.length < 2) { setSearchRes([]); return; }
    const res: any[] = [];
    Object.keys(LEAGUE_LOGOS).forEach(lg => {
      try {
        getLeagueStaticTeams(lg as any).forEach(t => {
          if (`${t.name} ${t.location} ${t.nickname} ${t.abbreviation}`.toLowerCase().includes(q)) {
            res.push({ ...t, league: lg });
          }
        });
      } catch {}
    });
    setSearchRes(res.slice(0, 20));
  }, [teamSearch]);

  // ── Hometown detection ──────────────────────────────────────────────────────
  const matchCity = (city: string) => {
    const q = city.trim().toLowerCase();
    const matches: any[] = [];
    Object.keys(LEAGUE_LOGOS).forEach(lg => {
      try {
        getLeagueStaticTeams(lg as any).forEach(t => {
          if (`${t.city ?? ''} ${t.location ?? ''}`.toLowerCase().includes(q)) {
            matches.push({ name: t.name, league: lg, logo: t.logo });
          }
        });
      } catch {}
    });
    if (matches.length > 0) saveFavs([...matches.slice(0, 8), ...favoriteTeams.filter(f => !matches.find(m => m.name === f.name))].slice(0, 16));
  };

  const detectGeo = () => {
    if (!navigator.geolocation) { setGeoStatus('failed'); return; }
    setGeoStatus('pending');
    navigator.geolocation.getCurrentPosition(async pos => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`, { headers: { 'User-Agent': 'PlajahApp/1.0' } });
        const j = await res.json();
        const city = j.address?.city || j.address?.town || j.address?.county;
        if (city) { setCity(city); setGeoStatus('success'); matchCity(city); }
        else setGeoStatus('failed');
      } catch { setGeoStatus('failed'); }
    }, err => { setGeoStatus(err.code === 1 ? 'denied' : 'failed'); }, { timeout: 10000, maximumAge: 3600000 });
  };

  const openTeam = (name: string) => {
    window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'TEAM_DETAIL', params: { teamName: name } } }));
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-transparent text-white">
      {/* ── PAGE HEADER ─────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-[#0a0a0a]/90 backdrop-blur-2xl border-b border-white/5 px-5 lg:px-10 py-3">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#FF8C00]/15 flex items-center justify-center border border-[#FF8C00]/30">
              <Zap size={15} className="text-[#FF8C00]" />
            </div>
            <h1 className="text-lg font-black uppercase tracking-widest text-white">Plajah Sports</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowStatCard(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FF8C00]/10 border border-[#FF8C00]/30 text-[#FF8C00] text-[9px] font-black uppercase tracking-widest hover:bg-[#FF8C00]/20 transition-all"
            >
              <BarChart2 size={12} /> Stat Cards
            </button>
            <button
              onClick={() => loadData(activeTab)}
              className="p-2 rounded-xl bg-white/5 border border-white/10 text-white/40 hover:text-white transition-all"
            >
              <RefreshCw size={14} className={loadingNews ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-5 lg:px-10 py-6 space-y-8">

        {/* ── HERO ──────────────────────────────────────────────────────────── */}
        <SportsHero items={hero} />

        {/* ── LIVE SCORES STRIP ─────────────────────────────────────────────── */}
        {liveScores.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <p className="text-[8px] font-black uppercase tracking-[0.4em] text-white/40">Live & Today</p>
            </div>
            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2 -mx-1 px-1">
              {liveScores.map((ev: any) => <ScoreChip key={ev.id} event={ev} />)}
            </div>
          </div>
        )}

        {/* ── LEAGUE NAV TABS ───────────────────────────────────────────────── */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {LEAGUES.map(league => {
            const Icon = league.icon;
            const active = activeTab === league.id;
            return (
              <button
                key={league.id}
                onClick={() => setActiveTab(league.id)}
                className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-full font-black text-[9px] uppercase tracking-widest transition-all border ${
                  active
                    ? 'text-black border-transparent shadow-lg'
                    : 'bg-white/5 border-white/8 text-white/50 hover:text-white hover:bg-white/10 hover:border-white/15'
                }`}
                style={active ? { background: league.color } : {}}
              >
                <Icon size={11} />
                {league.label}
              </button>
            );
          })}
        </div>

        {/* ── MAIN CONTENT GRID ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-8">

          {/* Left: Sports center or league picker */}
          <div className="space-y-8 min-w-0">
            {/* League-specific sports center */}
            {activeTab !== 'ALL' && (
              <SportsCenterView selectedSportsTab={activeTab as any} />
            )}

            {/* ALL view: league grid */}
            {activeTab === 'ALL' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {Object.entries(LEAGUE_LOGOS).map(([lg, logo]) => (
                    <motion.button
                      key={lg}
                      whileHover={{ y: -3 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setActiveTab(lg)}
                      className="flex flex-col items-center gap-3 p-5 bg-white/[0.03] border border-white/8 hover:border-[#FF8C00]/40 rounded-[1.5rem] transition-all group"
                    >
                      <img src={logo} alt={lg} className="w-12 h-12 object-contain drop-shadow group-hover:scale-110 transition-transform" loading="lazy" />
                      <span className="text-[9px] font-black uppercase tracking-widest text-white/60 group-hover:text-[#FF8C00] transition-colors">{lg}</span>
                    </motion.button>
                  ))}
                </div>

                {/* World news when on ALL tab */}
                <div className="space-y-3">
                  <h3 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/40 flex items-center gap-2">
                    <Newspaper size={10} /> Headlines Across Sport
                  </h3>
                  {loadingNews
                    ? <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{[...Array(6)].map((_,i) => <div key={i} className="h-20 bg-white/5 rounded-[1.5rem] animate-pulse" />)}</div>
                    : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {headlines.slice(0, 2).map(h => <HeadlineCard key={h.id} article={h} featured />)}
                        {headlines.slice(2, 10).map(h => <HeadlineCard key={h.id} article={h} />)}
                      </div>
                    )
                  }
                </div>
              </div>
            )}

            {/* League news below sports center */}
            {activeTab !== 'ALL' && headlines.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/40 flex items-center gap-2">
                  <Newspaper size={10} /> {activeTab} Headlines
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {headlines.slice(0, 8).map(h => <HeadlineCard key={h.id} article={h} />)}
                </div>
              </div>
            )}
          </div>

          {/* Right sidebar: My Teams hub */}
          <aside className="space-y-5">
            {/* MY TEAMS HUB */}
            <div className="bg-white/[0.03] border border-white/8 rounded-[2rem] overflow-hidden">
              <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Star size={14} className="text-[#FF8C00]" />
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-white">My Teams Hub</h3>
                </div>
                <button
                  onClick={() => setShowSearch(v => !v)}
                  className={`p-1.5 rounded-lg transition-all ${showSearch ? 'bg-[#FF8C00]/20 text-[#FF8C00]' : 'text-white/30 hover:text-white bg-white/5'}`}
                >
                  {showSearch ? <X size={14} /> : <Plus size={14} />}
                </button>
              </div>

              {/* Team search */}
              <AnimatePresence>
                {showSearch && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-b border-white/8 overflow-hidden"
                  >
                    <div className="p-4 space-y-2">
                      <div className="flex items-center gap-2 px-3 py-2 bg-black/30 rounded-xl border border-white/10 focus-within:border-[#FF8C00]/50 transition-all">
                        <Search size={13} className="text-white/30 shrink-0" />
                        <input
                          autoFocus
                          value={teamSearch}
                          onChange={e => setTeamSearch(e.target.value)}
                          placeholder="Search teams, cities..."
                          className="flex-1 bg-transparent text-sm text-white outline-none placeholder-white/25 font-bold"
                        />
                      </div>
                      {searchResults.length > 0 && (
                        <div className="max-h-52 overflow-y-auto custom-scrollbar space-y-1.5">
                          {searchResults.map(t => (
                            <div key={t.id || t.name} className="flex items-center gap-3 px-3 py-2 bg-white/5 rounded-xl hover:bg-white/10 transition-all">
                              <img src={t.logo} alt="" className="w-7 h-7 object-contain rounded-lg" loading="lazy" />
                              <div className="flex-1 min-w-0">
                                <p className="text-[9px] font-black text-white truncate">{t.name}</p>
                                <p className="text-[7px] text-white/35 uppercase tracking-widest">{t.location} · {t.league}</p>
                              </div>
                              <button onClick={() => addFav(t)} className="px-2.5 py-1 rounded-lg bg-[#FF8C00]/15 border border-[#FF8C00]/30 text-[#FF8C00] text-[7px] font-black uppercase tracking-widest hover:bg-[#FF8C00]/25 transition-all">
                                Add
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      {teamSearch.length >= 2 && searchResults.length === 0 && (
                        <p className="text-[8px] font-black uppercase text-white/25 tracking-widest text-center py-3">No teams found</p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Team list */}
              <div className="p-4">
                {favoriteTeams.length === 0 ? (
                  <div className="py-8 text-center space-y-3">
                    <Star size={28} className="mx-auto text-white/10" />
                    <p className="text-[9px] font-black uppercase text-white/25 tracking-widest">No teams saved yet</p>
                    <button onClick={() => setShowSearch(true)} className="px-4 py-2 bg-[#FF8C00]/10 border border-[#FF8C00]/25 rounded-xl text-[#FF8C00] text-[9px] font-black uppercase tracking-widest hover:bg-[#FF8C00]/20 transition-all">
                      Add Your First Team
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {favoriteTeams.map(t => (
                      <TeamHubCard key={t.name} team={t} onRemove={() => removeFav(t.name)} onClick={() => openTeam(t.name)} />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* HOMETOWN TEAMS */}
            <div className="bg-white/[0.03] border border-white/8 rounded-[2rem] overflow-hidden">
              <div className="px-5 py-4 border-b border-white/8 flex items-center gap-2.5">
                <MapPin size={14} className="text-[#FF8C00]" />
                <h3 className="text-[10px] font-black uppercase tracking-widest text-white">Hometown Teams</h3>
              </div>
              <div className="p-4 space-y-4">
                {/* Geolocation */}
                {geoStatus === 'idle' && (
                  <button onClick={detectGeo} className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10 hover:border-[#FF8C00]/30 hover:bg-[#FF8C00]/5 transition-all group text-left">
                    <MapPin size={14} className="text-white/30 group-hover:text-[#FF8C00] transition-colors shrink-0" />
                    <div>
                      <p className="text-[9px] font-black text-white/60 group-hover:text-white transition-colors">Detect my location</p>
                      <p className="text-[7px] text-white/25">Find teams near you automatically</p>
                    </div>
                  </button>
                )}
                {geoStatus === 'pending' && (
                  <div className="flex items-center gap-2 text-white/40 py-2">
                    <RefreshCw size={12} className="animate-spin" />
                    <p className="text-[8px] font-black uppercase tracking-widest">Detecting location…</p>
                  </div>
                )}
                {geoStatus === 'success' && detectedCity && (
                  <div className="flex items-center gap-2 p-3 bg-green-500/8 border border-green-500/20 rounded-xl">
                    <MapPin size={12} className="text-green-400 shrink-0" />
                    <p className="text-[9px] font-black text-white flex-1">Detected: <span className="text-green-400">{detectedCity}</span></p>
                    <button onClick={() => matchCity(detectedCity)} className="text-[7px] font-black uppercase tracking-widest text-green-400 hover:text-green-300">Use</button>
                  </div>
                )}
                {(geoStatus === 'denied' || geoStatus === 'failed') && (
                  <p className="text-[8px] text-white/30">{geoStatus === 'denied' ? 'Location permission denied.' : 'Could not detect location.'}</p>
                )}

                {/* Manual city input */}
                <div className="space-y-2">
                  <p className="text-[7px] font-black uppercase tracking-[0.3em] text-white/25">Enter your city</p>
                  <div className="flex gap-2">
                    <input
                      value={manualCity}
                      onChange={e => setManualCity(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && manualCity.trim()) { matchCity(manualCity); setManualCity(''); } }}
                      placeholder="e.g. Chicago, Houston..."
                      className="flex-1 px-3 py-2 bg-black/20 border border-white/10 focus:border-[#FF8C00]/40 rounded-xl text-[10px] text-white outline-none placeholder-white/20 font-bold transition-all"
                    />
                    <button
                      onClick={() => { if (manualCity.trim()) { matchCity(manualCity); setManualCity(''); } }}
                      disabled={!manualCity.trim()}
                      className="px-3 py-2 bg-[#FF8C00] disabled:opacity-40 text-black rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-[#FF8C00]/80 transition-all"
                    >
                      Go
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* SPORTS INTELLIGENCE */}
            <div className="bg-white/[0.03] border border-white/8 rounded-[2rem] overflow-hidden">
              <div className="px-5 py-4 border-b border-white/8 flex items-center gap-2.5">
                <BarChart2 size={14} className="text-[#FF8C00]" />
                <h3 className="text-[10px] font-black uppercase tracking-widest text-white">Sports Intelligence</h3>
              </div>
              <div className="p-4 space-y-2">
                {SPORTS_INTELLIGENCE_DOMAINS.map(domain => (
                  <div key={domain.id} className="p-3 rounded-xl bg-white/[0.03] border border-white/8">
                    <p className="text-[9px] font-black uppercase tracking-tight text-white/70">{domain.label}</p>
                    <p className="text-[7px] text-white/30 leading-relaxed mt-1">{domain.description}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {domain.sources.slice(0, 3).map(source => (
                        <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer" className="text-[6px] font-black uppercase tracking-widest text-[#FF8C00]/70 hover:text-[#FF8C00]">
                          {source.label}
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* ── Stat Card Builder modal ──────────────────────────────────────────── */}
      <AnimatePresence>
        {showStatCard && (
          <StatCardBuilder onClose={() => setShowStatCard(false)} currentUser={null} initialTab={activeTab !== 'ALL' ? activeTab : 'NBA'} />
        )}
      </AnimatePresence>
    </div>
  );
};

export default PlajahSportsView;
