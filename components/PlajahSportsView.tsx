import React, { useEffect, useState, useMemo, useRef } from 'react';
import { scoreText } from '../src/lib/scoreText';
import { motion, AnimatePresence } from 'motion/react';
import { SportsCenterView } from './SportsCenterView';
import WorldCupHub from './WorldCupHub';
import WorldCupTopBoard from './WorldCupTopBoard';
import { SportsIntelligenceSection } from './SportsIntelligenceSection';
import ResearchDrawer from './ResearchDrawer';
import LabsNotebook from './LabsNotebook';
import PlajahHealthFitnessView from './PlajahHealthFitnessView';
import {
  Zap, Search, X, Plus, MapPin, Trophy, TrendingUp, Newspaper,
  ChevronRight, ChevronLeft, Star, Shield, BarChart2, Flag, Gauge,
  Radio, Gamepad2, Globe, RefreshCw, Dumbbell, Target, CircleDot,
  BookOpen, Heart, Activity,
} from 'lucide-react';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import { fetchNewsFromRSS } from '../services/rssService';
import { Article, UserProfile, Post } from '../types';
import { fetchLeagueNews, fetchLeagueScores, fetchWorldCupWindow } from '../services/sportsService';
import { SPORTS_INTELLIGENCE_DOMAINS, seedSportsSourceRegistry } from '../services/sportsKnowledgeService';
import { getLeagueStaticTeams } from '../data/leagueTeams';
import { WC26_TEAMS } from '../data/worldCup2026';
import { StatCardBuilder } from './sports/StatCardBuilder';
import { RaceHistoryView } from './sports/RaceHistoryView';

// ─── League config ─────────────────────────────────────────────────────────────
const LEAGUES = [
  { id: 'WORLD_CUP', label: 'World Cup 2026', icon: Trophy, color: '#FF8C00' },
  { id: 'ALL',     label: 'All Sports', icon: Globe,    color: '#FF8C00' },
  { id: 'NBA',     label: 'NBA',        icon: Trophy,   color: '#C9082A' },
  { id: 'NFL',     label: 'NFL',        icon: Shield,   color: '#013369' },
  { id: 'MLB',     label: 'MLB',        icon: Flag,     color: '#002D72' },
  { id: 'NHL',     label: 'NHL',        icon: Zap,      color: '#00539B' },
  { id: 'FIFA',    label: 'Football',   icon: Globe,    color: '#39B54A' },
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
  { id: 'FITNESS',  label: 'Fitness',   icon: Dumbbell, color: '#06D6A0' },
  { id: 'HEALTH',   label: 'Health',    icon: Heart,    color: '#E63946' },
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
  F1: 'https://images.unsplash.com/photo-1504137957-34a07c86abfc?w=300&q=80',
  NASCAR: 'https://images.unsplash.com/photo-1547347298-4074fc3086f0?w=300&q=80',
  INDYCAR: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=300&q=80',
};

// Each slide is a placeholder shown briefly while live news loads.
// imageUrl is empty for sports where no reliable still is known —
// the carousel shows a dark gradient instead. News loading replaces
// these with real action photos pulled from the league's own feed.
const HERO_FALLBACKS = [
  { id: 'h-wc',     title: 'World Cup 2026',    subtitle: '48 nations · Every match · Only on Plajah', imageUrl: 'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=1400&q=80', leagueId: 'WORLD_CUP' },
  { id: 'h-nba',    title: 'NBA Basketball',     subtitle: 'Live scores · Highlights · Analysis',       imageUrl: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=1400&q=80',  leagueId: 'NBA' },
  { id: 'h-nfl',    title: 'NFL Football',       subtitle: 'This week · Live scores · Standings',       imageUrl: '', leagueId: 'NFL' },
  { id: 'h-f1',     title: 'Formula 1',          subtitle: 'Race results · Standings · Race replay',    imageUrl: 'https://images.unsplash.com/photo-1504137957-34a07c86abfc?w=1400&q=80',  leagueId: 'F1' },
  { id: 'h-nascar', title: 'NASCAR Cup Series',  subtitle: 'Cup standings · Picks · History',           imageUrl: '', leagueId: 'NASCAR' },
  { id: 'h-mlb',    title: 'MLB Baseball',       subtitle: 'Scores · Stats · Season highlights',        imageUrl: 'https://images.unsplash.com/photo-1566577739112-5180d4bf9390?w=1400&q=80', leagueId: 'MLB' },
  { id: 'h-ufc',    title: 'UFC · MMA',          subtitle: 'Fight cards · Results · Rankings',          imageUrl: '', leagueId: 'UFC' },
  { id: 'h-indycar',title: 'IndyCar Open Wheel', subtitle: 'Indy 500 · Road courses · Ovals',           imageUrl: '', leagueId: 'INDYCAR' },
];

// ── Sport image guard ──────────────────────────────────────────────────────────
// At least one of these terms must appear in the article text/title/source/url
// for an article's image to be placed in that league's hero slot.
// This prevents a crypto story, wrong-sport article, or off-topic news photo
// from ever ending up in the carousel.
const SPORT_REQUIRED_TERMS: Record<string, string[]> = {
  NBA:       ['nba','basketball','lakers','celtics','warriors','bulls','heat','knicks','nets','sixers','bucks','nuggets','suns','mavericks','rockets','clippers','thunder','blazers','jazz','spurs','grizzlies','pelicans','hornets','hawks','pistons','cavaliers','pacers','magic','raptors','timberwolves','wizards','kings','dunk','alley-oop','court','playoff','three-point','point guard','shooting guard','small forward','power forward','center'],
  NFL:       ['nfl','football','quarterback','touchdown','super bowl','superbowl','chiefs','eagles','cowboys','patriots','packers','seahawks','rams','49ers','ravens','steelers','broncos','bears','giants','jets','bills','dolphins','colts','texans','jaguars','titans','browns','bengals','raiders','chargers','cardinals','falcons','saints','buccaneers','panthers','vikings','lions','gridiron','nfc','afc','field goal','end zone','running back','wide receiver','linebacker','cornerback'],
  MLB:       ['mlb','baseball','yankees','red sox','dodgers','cubs','mets','braves','astros','cardinals','giants','phillies','brewers','padres','athletics','orioles','blue jays','rays','mariners','angels','tigers','twins','white sox','royals','rangers','pitcher','home run','inning','batting','strikeout','world series','outfield','shortstop','catcher','umpire','bullpen','dugout','ball park'],
  NHL:       ['nhl','hockey','puck','ice rink','rangers','bruins','maple leafs','canadiens','blackhawks','penguins','capitals','lightning','avalanche','golden knights','oilers','flames','canucks','jets','wild','sabres','flyers','devils','islanders','ducks','kings','sharks','stars','blues','predators','red wings','hurricanes','blue jackets','senators','panthers','goalie','power play','penalty shot','faceoff','slap shot'],
  F1:        ['formula 1','formula one','f1','grand prix','ferrari','mercedes','red bull racing','mclaren','hamilton','verstappen','leclerc','alonso','norris','sainz','pérez','perez','aston martin f1','williams f1','haas f1','alpine f1','pole position','pit stop','lap record','race circuit','constructor championship','fastest lap'],
  NASCAR:    ['nascar','cup series','daytona','talladega','bristol','martinsville','charlotte motor','hendrick','penske nascar','stock car','superspeedway','restrictor plate','checkered flag','caution flag','pit road','drafting','plate racing','xfinity','truck series'],
  INDYCAR:   ['indycar','indy 500','indianapolis 500','open wheel','andretti','chip ganassi','team penske indycar','oval race','indy car','road course indy'],
  UFC:       ['ufc','mma','mixed martial arts','octagon','knockout','submission','rear naked choke','takedown','fight night','pay-per-view ppv','heavyweight','lightweight','welterweight','middleweight','featherweight','bantamweight','flyweight','women\'s'],
  MMA:       ['mma','mixed martial arts','ufc','bellator','one championship','fight','knockout','submission','grappling'],
  BOXING:    ['boxing','heavyweight','welterweight','lightweight','bout','boxing ring','boxing gloves','jab','uppercut','knockdown','k.o.','t.k.o.','split decision','unanimous decision'],
  FIFA:      ['soccer','football match','premier league','la liga','bundesliga','serie a','ligue 1','champions league','europa league','manchester','barcelona','real madrid','liverpool','arsenal','chelsea','juventus','bayern munich','psg','paris saint-germain','goal scorer','goalkeeper','striker','corner kick','penalty kick','offside','header','dribble'],
  WORLD_CUP: ['world cup','fifa','world cup 2026','group stage','knockout round','quarterfinal','semifinal','soccer match','football match','goal','nations'],
  MLS:       ['mls','major league soccer','lafc','inter miami','galaxy','sounders','portland timbers','toronto fc','atlanta united','chicago fire','new york city fc','nycfc','new england revolution','houston dynamo','colorado rapids'],
  WNBA:      ['wnba','women\'s basketball','basketball','liberty','aces','dream','sparks','wings','mercury','mystics','fever','lynx','storm','sky','sun'],
  TENNIS:    ['tennis','wimbledon','us open tennis','french open','australian open','grand slam','serve','ace','deuce','set','match point','djokovic','federer','nadal','swiatek','sinner','alcaraz','serena','gauff','osaka','raquet','volley'],
  GOLF:      ['golf','pga tour','masters','the open championship','us open golf','ryder cup','mcilroy','scottie scheffler','fairway','birdie','eagle','par','bogey','tee shot','iron shot','chipping','putting','18th hole'],
  CRICKET:   ['cricket','test match','odi','t20','ipl','wicket','batsman','bowler','over','innings','ashes','cricket world cup'],
  RUGBY:     ['rugby union','rugby league','try','scrum','lineout','conversion','drop goal','six nations','rugby world cup','all blacks','springboks'],
  ESPORTS:   ['esports','e-sports','gaming tournament','league of legends','dota 2','cs:go','csgo','valorant','overwatch league','fortnite competitive','pro player','roster change','lan event'],
};

// These terms disqualify any article from the hero carousel regardless of league.
const HERO_BLOCKLIST = [
  'bitcoin','crypto','cryptocurrency','blockchain','ethereum','nft','defi','web3','token','dogecoin','altcoin','binance','coinbase',
  'stock market','wall street','dow jones','nasdaq','s&p 500','hedge fund','ipo','investment fund',
  'election','president','congress','senate','legislation','parliament','prime minister','political',
  'fashion week','beauty','makeup','skincare','hairstyle','celebrity wedding','red carpet',
  'real estate','mortgage','interest rate','federal reserve',
];

// Returns true only if an article is confirmed relevant to the given sport.
// An empty leagueId or 'ALL' skips the check.
const articleMatchesSport = (
  article: { title?: string; source?: string; content?: string; url?: string },
  leagueId: string,
): boolean => {
  const text = `${article.title ?? ''} ${article.source ?? ''} ${article.content ?? ''} ${article.url ?? ''}`.toLowerCase();
  // Block obviously-wrong content from every sport slot.
  if (HERO_BLOCKLIST.some(b => text.includes(b))) return false;
  const required = SPORT_REQUIRED_TERMS[leagueId];
  if (required) return required.some(kw => text.includes(kw));
  return true; // Unknown league — don't block.
};

// ── Crisp imagery ───────────────────────────────────────────────────────────
// Article art often arrives as a small thumbnail and gets stretched into a big
// banner → blurry. We (1) pick the highest-resolution source available, then
// (2) request a banner-sized render. ESPN serves most art through its "combiner"
// CDN (takes &w=/&h=); plain espncdn photos can be routed through it; Unsplash
// takes ?w=. Anything else is returned untouched.
const HERO_W = 1600, HERO_H = 900;
const upscaleSportsImage = (url: string, w = HERO_W, h = HERO_H): string => {
  if (!url || typeof url !== 'string') return url;
  try {
    if (url.includes('espncdn.com/combiner')) {
      let u = url.replace(/([?&])w=\d+/i, `$1w=${w}`).replace(/([?&])h=\d+/i, `$1h=${h}`);
      if (!/[?&]w=/i.test(u)) u += `${u.includes('?') ? '&' : '?'}w=${w}&h=${h}`;
      return u;
    }
    // Plain ESPN photo/media URL → route through the combiner at high res.
    if (/^https?:\/\/[^/]*espncdn\.com\/(photo|media)\//i.test(url)) {
      const path = url.replace(/^https?:\/\/[^/]+/i, '');
      return `https://a.espncdn.com/combiner/i?img=${encodeURIComponent(path)}&w=${w}&h=${h}&scale=crop&cquality=90&format=jpg`;
    }
    if (url.includes('images.unsplash.com')) {
      let u = /[?&]w=\d+/i.test(url) ? url.replace(/([?&])w=\d+/i, `$1w=${w}`) : `${url}${url.includes('?') ? '&' : '?'}w=${w}`;
      u = /[?&]q=\d+/i.test(u) ? u.replace(/([?&])q=\d+/i, '$1q=85') : `${u}&q=85`;
      return u;
    }
    return url;
  } catch { return url; }
};

// Choose the sharpest image an article offers (largest by width), then upscale.
const bestSportsImage = (item: any): string => {
  if (!item) return '';
  let best = '', bestW = 0;
  const imgs: any[] = Array.isArray(item.images) ? item.images : [];
  for (const im of imgs) {
    const u = im?.url || im?.href;
    if (!u) continue;
    const w = Number(im?.width) || 0;
    if (!best || w > bestW) { best = u; bestW = w; }
  }
  const chosen = item.imageUrl || best || imgs[0]?.url || imgs[0]?.href || '';
  return upscaleSportsImage(chosen);
};

// "Live & Today" must mean exactly that. ESPN's no-date /scoreboard returns the
// nearest games even in the offseason (e.g. NFL in June), so we only keep events
// that are live right now OR fall on the local calendar day. No demo/stale data.
const isLiveOrTodayEvent = (ev: any): boolean => {
  const state = ev?.status?.type?.state;
  if (state === 'in') return true;                       // in progress = live
  const raw = ev?.date || ev?.competitions?.[0]?.date;
  if (!raw) return false;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear()
      && d.getMonth() === now.getMonth()
      && d.getDate() === now.getDate();
};

const normalizeSportsArticle = (item: any, fallbackSource = 'Sports'): Article => ({
  id: String(item.id || item.guid || item.url || item.links?.web?.href || item.headline || item.title || Math.random()),
  title: item.title || item.headline || 'Sports update',
  content: item.content || item.summary || item.description || item.descriptionText || '',
  source: item.source || item.byline || fallbackSource,
  url: item.url || item.links?.web?.href || item.links?.mobile?.href || '',
  imageUrl: bestSportsImage(item),
  timestamp: item.timestamp || (item.published ? new Date(item.published).getTime() : Date.now()),
} as Article);

// ─── Hero carousel ─────────────────────────────────────────────────────────────
const SportsHero: React.FC<{
  items: any[];
  onNavigate?: (leagueId?: string, url?: string) => void;
}> = ({ items, onNavigate }) => {
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

  // Live World Cup score bug overlaid on the cover banner (desktop + mobile).
  const [wcEvents, setWcEvents] = useState<any[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () => fetchWorldCupWindow().then(ev => { if (alive) setWcEvents(ev || []); }).catch(() => {});
    load();
    const id = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  const wcLive = wcEvents.filter(e => e?.status?.type?.state === 'in');
  const wcRecent = wcEvents.filter(e => e?.status?.type?.state === 'post')
    .sort((a, b) => +new Date(b.date) - +new Date(a.date)).slice(0, 6);
  const wcRibbon = [...wcLive, ...wcRecent];

  const handleItemClick = (item: any) => {
    if (!onNavigate) return;
    if (item.url && item.url !== '#') onNavigate(undefined, item.url);
    else if (item.leagueId) onNavigate(item.leagueId);
  };

  if (!items.length) return (
    <div className="relative h-[40vh] sm:h-[55vh] min-h-[240px] bg-gradient-to-br from-[#1a1a2e] to-[#0a0a0a] rounded-[2.5rem] overflow-hidden flex items-end p-6 sm:p-8">
      <div>
        <p className="text-[9px] font-black uppercase tracking-[0.4em] text-[#FF8C00] mb-2">Plajah Sports</p>
        <h2 className="text-3xl sm:text-5xl font-black uppercase tracking-tighter text-white">Your World of Sport</h2>
      </div>
    </div>
  );

  const item = items[idx];

  return (
    <div
      className="relative h-[40vh] sm:h-[55vh] min-h-[240px] rounded-[2.5rem] overflow-hidden group shadow-2xl"
      onClick={() => handleItemClick(item)}
      style={{ cursor: onNavigate ? 'pointer' : 'default' }}
    >
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
            <img
              src={item.imageUrl}
              alt={item.title}
              className="w-full h-full object-cover scale-105 group-hover:scale-100 transition-transform duration-700"
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#1a1a2e] to-[#0a0a0a]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-black/10" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-transparent to-transparent" />
        </motion.div>
      </AnimatePresence>

      {/* ── Live World Cup score bug — right in the cover banner (all screens) ── */}
      {wcRibbon.length > 0 && (
        <div
          onClick={e => { e.stopPropagation(); onNavigate?.('WORLD_CUP'); }}
          className="absolute top-0 left-0 right-0 z-20 flex items-center gap-2 px-3 sm:px-4 py-2 bg-black/45 backdrop-blur-md border-b border-white/10 cursor-pointer"
        >
          <div className="flex items-center gap-1.5 shrink-0 pr-2 border-r border-white/15">
            <Trophy size={12} className="text-[#FF8C00]" />
            <span className="hidden sm:inline text-[8px] font-black uppercase tracking-[0.25em] text-white/70">World Cup</span>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar flex-1">
            {wcRibbon.map((ev: any) => {
              const c = ev?.competitions?.[0];
              const a = c?.competitors?.find((x: any) => x.homeAway === 'away');
              const h = c?.competitors?.find((x: any) => x.homeAway === 'home');
              const isLive = ev?.status?.type?.state === 'in';
              return (
                <div key={ev.id} className={`shrink-0 flex items-center gap-2 px-2.5 py-1 rounded-lg ${isLive ? 'bg-red-500/20 border border-red-500/30' : 'bg-white/[0.06]'}`}>
                  {isLive
                    ? <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                    : <span className="text-[6px] font-black uppercase tracking-widest text-white/35 shrink-0">FT</span>}
                  {a?.team?.logo && <img src={a.team.logo} alt="" className="w-4 h-4 object-contain shrink-0" loading="lazy" />}
                  <span className="text-[10px] font-black tabular-nums text-white whitespace-nowrap">
                    {scoreText(a?.score) || '0'}<span className="text-white/30 mx-1">–</span>{scoreText(h?.score) || '0'}
                  </span>
                  {h?.team?.logo && <img src={h.team.logo} alt="" className="w-4 h-4 object-contain shrink-0" loading="lazy" />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-8 md:p-12 max-w-3xl z-10">
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
                {item.leagueId ? item.leagueId : 'Plajah Sports'}
              </span>
              {item.subtitle && (
                <span className="text-[9px] font-black uppercase tracking-widest text-white/50">{item.subtitle}</span>
              )}
            </div>
            <h2 className="text-3xl sm:text-5xl md:text-6xl font-black uppercase tracking-tight leading-[0.9] text-white drop-shadow-2xl">
              {item.title}
            </h2>
            {/* CTA */}
            {onNavigate && (
              <button
                onClick={e => { e.stopPropagation(); handleItemClick(item); }}
                className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-[#FF8C00] text-black text-[9px] font-black uppercase tracking-widest hover:bg-white transition-colors"
              >
                {item.leagueId ? `Open ${item.leagueId}` : item.url && item.url !== '#' ? 'Read Article' : 'Explore'}
                <ChevronRight size={12} />
              </button>
            )}
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
    href={article.url || undefined} target="_blank" rel="noreferrer"
    className={`group flex gap-4 p-4 sm:p-5 bg-white/[0.03] border border-white/8 rounded-[1.5rem] hover:bg-white/[0.07] hover:border-white/20 transition-all ${featured ? 'flex-col' : ''}`}
  >
    {article.imageUrl && (
      <div className={`shrink-0 rounded-xl overflow-hidden ${featured ? 'w-full aspect-video' : 'w-20 h-16'}`}>
        <img src={article.imageUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" onError={e => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none'; }} />
      </div>
    )}
    <div className="flex-1 min-w-0">
      {article.source && (
        <p className="text-[8px] font-black uppercase tracking-[0.3em] text-[#FF8C00] mb-1.5">{article.source}</p>
      )}
      <h4 className={`font-black uppercase tracking-tight leading-tight group-hover:text-[#FF8C00] transition-colors line-clamp-3 ${featured ? 'text-lg' : 'text-sm'}`}>
        {article.title}
      </h4>
      {featured && article.content && (
        <p className="text-xs text-white/40 mt-2 line-clamp-2 leading-relaxed">{article.content}</p>
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
        <p className="text-xs font-black uppercase tracking-tight text-white leading-tight truncate">{team.name}</p>
        <p className="text-[10px] font-black uppercase tracking-widest text-[#FF8C00]/70 mt-0.5">{team.league}</p>
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
          {isPre ? 'vs' : `${scoreText(away?.score) || '—'} – ${scoreText(home?.score) || '—'}`}
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
  onOpenAthletes?: () => void;
}

export const PlajahSportsView: React.FC<Props> = ({ onVisitUser, currentUser, onOpenAthletes }) => {
  const [hero, setHero]               = useState<any[]>(HERO_FALLBACKS);
  const [activeTab, setActiveTab]     = useState<string>('WORLD_CUP');
  const [wcOpenTab, setWcOpenTab]     = useState<string | undefined>(undefined);
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
  const [platformPosts, setPlatformPosts] = useState<Post[]>([]);
  const [platformAccounts, setPlatformAccounts] = useState<UserProfile[]>([]);

  // ── Research Notebook + Intelligence drawer ──────────────────────────────────
  const [drawerArticle, setDrawerArticle]     = useState<Article | null>(null);
  const [drawerOpen, setDrawerOpen]           = useState(false);
  const [showNotebook, setShowNotebook]       = useState(false);
  const [bookmarkedIds, setBookmarkedIds]     = useState<Set<string>>(new Set());

  const openDrawer = (article?: Article) => {
    setDrawerArticle(article ?? null);
    setDrawerOpen(true);
  };

  const handleBookmark = (article: Article) => {
    setBookmarkedIds(prev => new Set([...prev, article.id]));
    openDrawer(article);
  };

  // ── Load platform sports posts + accounts when ALL tab is active ────────────
  useEffect(() => {
    if (activeTab !== 'ALL') return;
    const SPORT_TAGS = ['sports','basketball','football','soccer','baseball','hockey','tennis','golf','mma','boxing','racing','nba','nfl','mlb','nhl','ufc','fifa','f1','nascar','indycar','wrestling','rugby','cricket','volleyball','lacrosse'];
    getDocs(
      query(collection(db, 'posts'),
        where('isPublic', '==', true),
        where('tags', 'array-contains-any', SPORT_TAGS.slice(0, 10)),
        orderBy('timestamp', 'desc'),
        limit(8)
      )
    ).then(snap => setPlatformPosts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Post)))).catch(() => {});

    getDocs(
      query(collection(db, 'users'),
        where('favoriteSportsTeams', '!=', null),
        orderBy('favoriteSportsTeams'),
        orderBy('followerCount', 'desc'),
        limit(8)
      )
    ).then(snap => setPlatformAccounts(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)))).catch(() => {});
  }, [activeTab]);

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
    if (tab === 'WORLD_CUP' || tab === 'FITNESS' || tab === 'HEALTH') return;
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
      // Only genuinely live or today's games — keeps out-of-season/stale fixtures
      // (e.g. NFL in the offseason) out of "Live & Today".
      const liveOrToday = scoreArr.filter(isLiveOrTodayEvent);
      setLiveScores(liveOrToday.slice(0, 12));

      // Build hero from news — filter to sport-relevant articles only so we never
      // show a wrong-sport or off-topic image (e.g. crypto on the NBA slide).
      const sportNews = tab !== 'ALL'
        ? newsArr.filter((n: any) => articleMatchesSport(n, tab))
        : newsArr;

      const heroItems = sportNews
        .filter((n: any) => n.imageUrl)
        .slice(0, 6)
        .map((n: any, i: number) => ({
          id: n.id || `n${i}`,
          title: n.title,
          subtitle: n.source || tab,
          imageUrl: n.imageUrl,
          url: n.url,
          leagueId: tab !== 'ALL' ? tab : undefined,
        }));
      // Need at least 2 validated images; otherwise keep the sport's fallback gradient.
      if (heroItems.length >= 2) setHero(heroItems);
    } finally {
      setLoadingNews(false);
    }
  };

  useEffect(() => {
    // Reset to this sport's own fallback while news loads so stale images from the
    // previous tab never bleed into the new tab's carousel.
    const sportFallback = HERO_FALLBACKS.find(f => f.leagueId === activeTab);
    setHero(sportFallback
      ? [sportFallback]
      : [{ id: `loading-${activeTab}`, title: activeTab, subtitle: 'Live coverage on Plajah', imageUrl: '', leagueId: activeTab }]
    );
    loadData(activeTab);
  }, [activeTab]);

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
      <div className="sticky top-0 z-30 bg-[#0a0a0a]/90 backdrop-blur-2xl border-b border-white/5 px-4 sm:px-5 lg:px-10 py-3">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#FF8C00]/15 flex items-center justify-center border border-[#FF8C00]/30">
              <Zap size={15} className="text-[#FF8C00]" />
            </div>
            <h1 className="text-lg font-black uppercase tracking-widest text-white">Plajah Sports</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNotebook(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/50 text-[9px] font-black uppercase tracking-widest hover:bg-white/10 hover:text-white transition-all"
            >
              <BookOpen size={12} /> Notebook
            </button>
            <button
              onClick={() => setShowStatCard(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FF8C00]/10 border border-[#FF8C00]/30 text-[#FF8C00] text-[9px] font-black uppercase tracking-widest hover:bg-[#FF8C00]/20 transition-all"
            >
              <BarChart2 size={12} /> Stat Cards
            </button>
            {onOpenAthletes && (
              <button
                onClick={onOpenAthletes}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/50 text-[9px] font-black uppercase tracking-widest hover:bg-white/10 hover:text-white transition-all"
              >
                <Trophy size={12} /> Athletes
              </button>
            )}
            <button
              onClick={() => loadData(activeTab)}
              className="p-2 rounded-xl bg-white/5 border border-white/10 text-white/40 hover:text-white transition-all"
            >
              <RefreshCw size={14} className={loadingNews ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-5 lg:px-10 py-6 space-y-6 sm:space-y-8">

        {/* ── WORLD CUP SHOWCASE — always top, always first ─────────────────── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="text-3xl leading-none select-none">⚽</span>
              <div>
                <p className="text-[7px] font-black uppercase tracking-[0.45em] text-[#39B54A]">FIFA World Cup 2026™ · North, Central America &amp; Caribbean</p>
                <h2 className="text-lg font-black uppercase tracking-tight text-white leading-none">The World Cup Hub</h2>
              </div>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/15 border border-red-500/25 shrink-0">
              <span className="w-1.5 h-1.5 bg-red-400 rounded-full animate-pulse" />
              <span className="text-[7px] font-black uppercase tracking-widest text-red-400">Tournament Live</span>
            </div>
          </div>

          <motion.button
            className="relative w-full overflow-hidden rounded-3xl text-left group"
            style={{ background: 'linear-gradient(135deg, #010E04 0%, #001122 50%, #010A03 100%)', border: '1px solid rgba(57,181,74,0.18)' }}
            onClick={() => { setActiveTab('WORLD_CUP'); setWcOpenTab('clubs'); }}
            whileHover={{ scale: 1.003 }}
            transition={{ duration: 0.2 }}
          >
            <div className="absolute inset-0 flex items-center overflow-hidden opacity-[0.07] pointer-events-none select-none text-3xl gap-1.5 px-3">
              {WC26_TEAMS.slice(0, 28).map((t: any) => <span key={t.id}>{t.flag}</span>)}
            </div>
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#39B54A]/65 to-transparent" />
            <div className="absolute -top-16 left-1/3 w-96 h-48 bg-[#39B54A]/6 blur-3xl rounded-full pointer-events-none" />
            <div className="relative px-6 py-7 sm:px-8 sm:py-9 flex flex-col sm:flex-row items-start sm:items-center gap-6">
              <div className="flex items-center gap-5 shrink-0">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center text-4xl sm:text-5xl shrink-0"
                  style={{ background: 'rgba(57,181,74,0.12)', border: '1px solid rgba(57,181,74,0.25)' }}>
                  📹
                </div>
                <div>
                  <p className="text-[7px] font-black uppercase tracking-[0.45em] text-[#39B54A] mb-1.5">Live · Real Video · 24 Fans Per Room</p>
                  <h3 className="text-2xl sm:text-3xl lg:text-4xl font-black uppercase tracking-tight text-white leading-none">Live Fan Rooms</h3>
                </div>
              </div>
              <div className="flex-1 min-w-0 sm:pl-2">
                <p className="text-sm sm:text-base text-white/50 leading-relaxed max-w-xs sm:max-w-sm">
                  Watch every match with your nation's fans. Real faces. Real reactions. Only on Plajah.
                </p>
              </div>
              <div className="shrink-0">
                <span className="flex items-center gap-2.5 px-6 py-3.5 rounded-2xl font-black text-[11px] uppercase tracking-widest whitespace-nowrap"
                  style={{ background: '#39B54A', color: '#000' }}>
                  Find Your Room <ChevronRight size={14} />
                </span>
              </div>
            </div>
          </motion.button>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {([
              { emoji: '🏆', color: '#FFB514', badge: 'Interactive 3D', title: 'Hall of Legends', desc: 'Walk through every World Cup champion in a cinematic 3D trophy room. No other platform has this.', tab: 'history' },
              { emoji: '🎯', color: '#FF8C00', badge: 'All 104 Matches', title: 'Pick Every Match', desc: 'Lock your bracket from the group stage all the way to the Final. Compete globally.', tab: 'picks' },
              { emoji: '🌍', color: '#39B54A', badge: '48 Live Communities', title: 'Nation Fan Clubs', desc: 'Every competing nation has its own hub — rosters, timelines, media, and live video rooms.', tab: 'clubs' },
              { emoji: '⚡', color: '#3B82F6', badge: 'Auto-Updating', title: 'Live Bracket', desc: 'Track every result from groups to the knockout Final. Crystal clear. Always live.', tab: 'bracket' },
            ] as const).map(card => (
              <motion.button
                key={card.tab}
                className="group relative text-left overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 hover:border-white/[0.12] transition-all"
                onClick={() => { setActiveTab('WORLD_CUP'); setWcOpenTab(card.tab); }}
                whileHover={{ scale: 1.02, y: -2 }}
                transition={{ duration: 0.15 }}
              >
                <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${card.color}55, transparent)` }} />
                <div className="text-3xl mb-4 select-none">{card.emoji}</div>
                <p className="text-[7px] font-black uppercase tracking-[0.35em] mb-2" style={{ color: card.color }}>{card.badge}</p>
                <h4 className="text-[11px] sm:text-xs font-black uppercase tracking-tight text-white mb-2 leading-snug">{card.title}</h4>
                <p className="text-[10px] text-white/35 leading-relaxed">{card.desc}</p>
                <div className="absolute bottom-3.5 right-3.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ChevronRight size={12} style={{ color: card.color }} />
                </div>
              </motion.button>
            ))}
          </div>

          <button
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl border border-white/[0.06] text-white/25 text-[9px] font-black uppercase tracking-widest hover:text-white/50 hover:border-white/12 transition-all"
            onClick={() => setActiveTab('WORLD_CUP')}
          >
            Open Full World Cup Hub <ChevronRight size={11} />
          </button>
        </div>

        {/* ── WORLD CUP LIVE SCORES / FIXTURES ─────────────────────────────── */}
        <WorldCupTopBoard onOpenFull={() => setActiveTab('WORLD_CUP')} />

        {/* ── SPORTS INTELLIGENCE ───────────────────────────────────────────── */}
        <SportsIntelligenceSection
          onBookmark={handleBookmark}
          bookmarkedIds={bookmarkedIds}
          onOpenNotebook={() => setShowNotebook(true)}
        />

        {/* ── HERO ──────────────────────────────────────────────────────────── */}
        <SportsHero
          items={hero}
          onNavigate={(leagueId, url) => {
            if (leagueId) setActiveTab(leagueId);
            else if (url) window.open(url, '_blank', 'noopener,noreferrer');
          }}
        />

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
        <div className="space-y-2">
          {/* Health & Fitness quick-row */}
          <div className="flex items-center gap-2">
            <span className="text-[7px] font-black uppercase tracking-[0.3em] text-white/25 shrink-0">Health</span>
            {[
              { id: 'FITNESS', label: 'Fitness', color: '#06D6A0', Icon: Dumbbell },
              { id: 'HEALTH',  label: 'Health',  color: '#E63946', Icon: Heart },
            ].map(m => (
              <button
                key={m.id}
                onClick={() => setActiveTab(m.id)}
                className={`shrink-0 flex items-center gap-2 px-3.5 py-1.5 rounded-full font-black text-[9px] uppercase tracking-widest transition-all border ${
                  activeTab === m.id ? 'text-black border-transparent' : 'bg-white/5 border-white/8 text-white/50 hover:text-white hover:bg-white/10'
                }`}
                style={activeTab === m.id ? { background: m.color } : {}}
              >
                <m.Icon size={11} />
                {m.label}
              </button>
            ))}
          </div>
          {/* Motorsport quick-row (always visible above the main tab strip) */}
          <div className="flex items-center gap-2">
            <span className="text-[7px] font-black uppercase tracking-[0.3em] text-white/25 shrink-0">Motorsport</span>
            {[
              { id: 'F1',      label: 'Formula 1', color: '#E10600', img: LEAGUE_LOGOS.F1 },
              { id: 'NASCAR',  label: 'NASCAR',     color: '#FFB514', img: LEAGUE_LOGOS.NASCAR },
              { id: 'INDYCAR', label: 'IndyCar',    color: '#C5232A', img: LEAGUE_LOGOS.INDYCAR },
            ].map(m => (
              <button
                key={m.id}
                onClick={() => setActiveTab(m.id)}
                className={`shrink-0 flex items-center gap-2 px-3.5 py-1.5 rounded-full font-black text-[9px] uppercase tracking-widest transition-all border ${
                  activeTab === m.id ? 'text-black border-transparent' : 'bg-white/5 border-white/8 text-white/50 hover:text-white hover:bg-white/10'
                }`}
                style={activeTab === m.id ? { background: m.color } : {}}
              >
                <img src={m.img} alt={m.label} className="w-4 h-4 object-contain" loading="lazy" />
                {m.label}
              </button>
            ))}
          </div>

          {/* Main tab strip */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {LEAGUES.filter(l => !['F1', 'NASCAR', 'INDYCAR'].includes(l.id)).map(league => {
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
            {/* Motorsport also in main strip for discoverability */}
            <div className="w-px bg-white/10 self-stretch mx-1" />
            {['F1', 'NASCAR', 'INDYCAR'].map(id => {
              const league = LEAGUES.find(l => l.id === id)!;
              const Icon = league.icon;
              const active = activeTab === id;
              return (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-full font-black text-[9px] uppercase tracking-widest transition-all border ${
                    active ? 'text-black border-transparent shadow-lg' : 'bg-white/5 border-white/8 text-white/50 hover:text-white hover:bg-white/10 hover:border-white/15'
                  }`}
                  style={active ? { background: league.color } : {}}
                >
                  <Icon size={11} />
                  {league.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── MAIN CONTENT GRID ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6 lg:gap-8">

          {/* Left: Sports center or league picker */}
          <div className="space-y-6 lg:space-y-8 min-w-0">
            {/* World Cup Hub */}
            {activeTab === 'WORLD_CUP' && (
              <WorldCupHub
                currentUser={currentUser ?? null}
                initialTab={wcOpenTab as any}
              />
            )}

            {/* Health & Fitness hub tabs */}
            {(activeTab === 'FITNESS' || activeTab === 'HEALTH') && (
              <PlajahHealthFitnessView
                currentUser={currentUser}
                onBack={() => setActiveTab('ALL')}
              />
            )}

            {/* League-specific sports center */}
            {activeTab !== 'ALL' && activeTab !== 'WORLD_CUP' && activeTab !== 'FITNESS' && activeTab !== 'HEALTH' && (
              <SportsCenterView selectedSportsTab={activeTab as any} />
            )}

            {/* ALL view: league grid */}
            {activeTab === 'ALL' && (
              <div className="space-y-6">
                {/* Motorsport feature row */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Gauge size={11} className="text-[#FF8C00]" />
                    <h3 className="text-[9px] font-black uppercase tracking-[0.35em] text-white/60">Motorsport</h3>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {[
                      { id: 'F1',      label: 'Formula 1',  color: '#E10600', img: LEAGUE_LOGOS.F1,      desc: 'Race calendar, standings & replay' },
                      { id: 'NASCAR',  label: 'NASCAR',      color: '#FFB514', img: LEAGUE_LOGOS.NASCAR,  desc: 'Cup Series, picks & history' },
                      { id: 'INDYCAR', label: 'IndyCar',     color: '#C5232A', img: LEAGUE_LOGOS.INDYCAR, desc: 'Indy 500, ovals & road courses' },
                    ].map(m => (
                      <motion.button
                        key={m.id}
                        whileHover={{ y: -3 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => setActiveTab(m.id)}
                        className="relative flex flex-col items-center gap-3 p-4 sm:p-5 rounded-[1.5rem] border border-white/8 overflow-hidden text-center group"
                        style={{ background: `${m.color}10` }}
                      >
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: `${m.color}18` }} />
                        <img src={m.img} alt={m.label} className="w-14 h-14 object-contain drop-shadow-lg group-hover:scale-110 transition-transform" loading="lazy" />
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-white">{m.label}</p>
                          <p className="text-[7px] text-white/35 mt-0.5">{m.desc}</p>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </div>

                {/* All leagues grid */}
                <div>
                  <h3 className="text-[9px] font-black uppercase tracking-[0.35em] text-white/40 mb-3">All Leagues</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {Object.entries(LEAGUE_LOGOS).map(([lg, logo]) => (
                      <motion.button
                        key={lg}
                        whileHover={{ y: -3 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => setActiveTab(lg)}
                        className="flex flex-col items-center gap-3 p-4 sm:p-5 bg-white/[0.03] border border-white/8 hover:border-[#FF8C00]/40 rounded-[1.5rem] transition-all group"
                      >
                        <img src={logo} alt={lg} className="w-12 h-12 object-contain drop-shadow group-hover:scale-110 transition-transform" loading="lazy" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-white/60 group-hover:text-[#FF8C00] transition-colors">{lg}</span>
                      </motion.button>
                    ))}
                  </div>
                </div>

                {/* Platform Sports Accounts */}
                {platformAccounts.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[9px] font-black uppercase tracking-[0.35em] text-white/60 flex items-center gap-2">
                        <Shield size={10} className="text-[#FF8C00]" /> Sports Accounts
                      </h3>
                    </div>
                    <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
                      {platformAccounts.map(acc => (
                        <button
                          key={acc.uid}
                          onClick={() => onVisitUser?.(acc.uid)}
                          className="flex-none flex flex-col items-center gap-2 p-3 w-[88px] bg-white/[0.03] border border-white/8 hover:border-[#FF8C00]/30 rounded-2xl transition-all group"
                        >
                          <div className="relative w-11 h-11 rounded-full overflow-hidden bg-white/10 shrink-0">
                            {(acc.customPhotoURL || acc.photoURL) ? (
                              <img src={acc.customPhotoURL || acc.photoURL} alt={acc.displayName} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-white/30 font-black text-sm">
                                {acc.displayName?.[0]?.toUpperCase() ?? '?'}
                              </div>
                            )}
                          </div>
                          <div className="text-center min-w-0 w-full">
                            <p className="text-[8px] font-black text-white/80 truncate group-hover:text-white transition-colors">{acc.displayName}</p>
                            <p className="text-[7px] text-white/30 mt-0.5">{acc.followerCount ?? 0} followers</p>
                          </div>
                          {acc.favoriteSportsTeams && acc.favoriteSportsTeams.length > 0 && (
                            <p className="text-[6px] text-[#FF8C00]/70 font-bold truncate w-full text-center">{acc.favoriteSportsTeams[0]}</p>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Platform Sports Posts */}
                {platformPosts.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-[9px] font-black uppercase tracking-[0.35em] text-white/60 flex items-center gap-2">
                      <TrendingUp size={10} className="text-[#FF8C00]" /> Platform Highlights
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {platformPosts.map(post => {
                        const thumb = post.media?.find(m => m.thumbnail || (m.type === 'PHOTO' && m.url))?.thumbnail
                          || post.media?.find(m => m.type === 'PHOTO')?.url
                          || post.media?.find(m => m.thumbnail)?.thumbnail;
                        return (
                          <button
                            key={post.id}
                            onClick={() => onVisitUser?.(post.authorId)}
                            className="flex items-center gap-3 p-3 bg-white/[0.03] border border-white/8 hover:border-[#FF8C00]/30 rounded-2xl transition-all text-left group"
                          >
                            {thumb ? (
                              <img src={thumb} alt="" className="w-12 h-12 rounded-xl object-cover shrink-0 opacity-80 group-hover:opacity-100 transition-opacity" />
                            ) : (
                              <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
                                <TrendingUp size={14} className="text-white/20" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-[9px] font-black text-white/80 line-clamp-2 group-hover:text-white transition-colors">{post.text || '—'}</p>
                              <div className="flex items-center gap-2 mt-1.5">
                                <span className="text-[7px] text-white/30">{post.authorName}</span>
                                {post.tags?.slice(0, 2).map(t => (
                                  <span key={t} className="px-1 py-0.5 rounded bg-[#FF8C00]/10 text-[#FF8C00]/70 text-[6px] font-black uppercase">{t}</span>
                                ))}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

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

          {/* Right sidebar: My Teams hub — hidden on mobile, shows on xl */}
          <aside className="hidden xl:block space-y-5">
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
                                <p className="text-xs font-black text-white truncate">{t.name}</p>
                                <p className="text-[10px] text-white/35 uppercase tracking-widest">{t.location} · {t.league}</p>
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
                    <p className="text-xs font-black uppercase tracking-tight text-white/70">{domain.label}</p>
                    <p className="text-[10px] text-white/40 leading-relaxed mt-1">{domain.description}</p>
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

      {/* ── Research Drawer (slide-in from right) ────────────────────────────── */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              key="drawer-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
              onClick={() => setDrawerOpen(false)}
            />
            <motion.div
              key="drawer-panel"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 350, damping: 40 }}
              className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-sm bg-[#0d0d0d] border-l border-white/10 shadow-2xl overflow-hidden"
            >
              <ResearchDrawer
                article={drawerArticle}
                currentUser={currentUser}
                onClose={() => setDrawerOpen(false)}
                onOpenFull={() => { setDrawerOpen(false); setShowNotebook(true); }}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Full Research Notebook overlay ───────────────────────────────────── */}
      <AnimatePresence>
        {showNotebook && (
          <motion.div
            key="notebook-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-[#0a0a0a] overflow-hidden"
          >
            <LabsNotebook
              currentUser={currentUser}
              context="sports"
              onBack={() => setShowNotebook(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PlajahSportsView;
