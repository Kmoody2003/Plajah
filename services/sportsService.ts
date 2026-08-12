// ESPN public API – no key required.  All responses are cached in-memory.
import { scoreText } from '../src/lib/scoreText';
import { findStaticTeam } from '../data/leagueTeams';

/** Coerce an ESPN stat value (number | string | {value,displayValue}) to a number. */
const statNum = (v: any): number => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseFloat(v) || 0;
  if (v && typeof v === 'object') return Number(v.value ?? v.displayValue) || 0;
  return 0;
};
import { fetchTeamSquad, type SquadPlayer } from './worldCupDepth';
import { legendsForNation } from '../data/soccerLegends';
import {
  makeSportsDocId,
  readSportsKnowledge,
  sportsSource,
  writeSportsKnowledge,
  writeSportsKnowledgeBatch,
} from './sportsKnowledgeService';

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';

// ---------- cache ---------------------------------------------------------
const _cache = new Map<string, { data: any; ts: number }>();
const TTL = {
  teams:     60 * 60 * 1000,   // 1 hour
  standings: 30 * 60 * 1000,   // 30 min
  news:       5 * 60 * 1000,   // 5 min
  roster:    60 * 60 * 1000,   // 1 hour
  scores:     2 * 60 * 1000,   // 2 min
};

function fromCache(key: string, ttl: number) {
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.ts < ttl) return hit.data;
  return null;
}
function toCache(key: string, data: any) { _cache.set(key, { data, ts: Date.now() }); }

async function safeFetch(url: string, ttlKey?: string, ttl?: number): Promise<any> {
  if (ttlKey) { const c = fromCache(ttlKey, ttl!); if (c !== null) return c; }

  const fetchJson = async (u: string): Promise<any> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch(u, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) return undefined;
      return await res.json();
    } catch { clearTimeout(timer); return undefined; }
  };

  // 1. Direct. ESPN + TheSportsDB send permissive CORS headers, so this works in
  //    production (where there is NO /api backend) and also avoids the dev
  //    /api/proxy, which was truncating large JSON responses (e.g. scoreboards).
  let data = await fetchJson(url);
  // 2. Same-origin dev proxy — only helps a source that blocks CORS in local dev.
  if (data === undefined && typeof window !== 'undefined') {
    data = await fetchJson(`/api/proxy?url=${encodeURIComponent(url)}`);
  }
  // 3. Public CORS proxy as the last resort.
  if (data === undefined) data = await fetchJson(`https://corsproxy.io/?${encodeURIComponent(url)}`);

  if (data === undefined || data === null) return null;
  if (ttlKey) toCache(ttlKey, data);
  return data;
}

const ESPN_SOURCE_BASE = 'https://site.api.espn.com/apis/site/v2/sports';
// ESPN moved standings/leaders/athlete-stats off the site API — these hosts carry them now.
const ESPN_WEB = 'https://site.web.api.espn.com/apis';
const ESPN_CORE = 'https://sports.core.api.espn.com/v2/sports';

// Resolve ESPN core-API `$ref` URLs with bounded concurrency (core responses link
// athletes/teams by reference instead of embedding them).
async function resolveRefs<T = any>(refs: string[], concurrency = 8): Promise<(T | null)[]> {
  const out: (T | null)[] = new Array(refs.length).fill(null);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, refs.length) }, async () => {
    while (next < refs.length) {
      const i = next++;
      const url = refs[i].replace('http://', 'https://');
      out[i] = await safeFetch(url, `ref:${url}`, TTL.roster);
    }
  });
  await Promise.all(workers);
  return out;
}

// ---------- league config --------------------------------------------------
export type LeagueTab =
  | 'NBA' | 'NFL' | 'NHL' | 'MLB' | 'NCAA' | 'WNBA' | 'ESPORTS' | 'FIFA' | 'MLS'
  | 'UFC' | 'MMA' | 'BOXING' | 'MARTIAL_ARTS' | 'FENCING' | 'TENNIS' | 'GOLF'
  | 'CRICKET' | 'RUGBY' | 'WRESTLING' | 'VOLLEYBALL' | 'LACROSSE';

const LEAGUES: Partial<Record<Exclude<LeagueTab, 'ESPORTS'>, { sport: string; league: string }>> = {
  NBA:  { sport: 'basketball', league: 'nba' },
  NFL:  { sport: 'football',   league: 'nfl' },
  NHL:  { sport: 'hockey',     league: 'nhl' },
  MLB:  { sport: 'baseball',   league: 'mlb' },
  NCAA: { sport: 'basketball', league: 'mens-college-basketball' },
  WNBA: { sport: 'basketball', league: 'wnba' },
  // Soccer — ESPN endpoints for news/scores; TSDB handles teams/standings
  FIFA: { sport: 'soccer',     league: 'fifa.world' },  // FIFA World Cup 2026
  MLS:  { sport: 'soccer',     league: 'usa.1' },
};

export interface SpecialtySportCfg {
  id: string;
  label: string;
  sportFamily: string;
  summary: string;
  rssCategory: string;
  espnPaths: string[];
  publicSources: { name: string; url: string; note: string }[];
}

const SPECIALTY_SPORTS: Record<string, SpecialtySportCfg> = {
  UFC: { id: 'UFC', label: 'UFC', sportFamily: 'Combat Sports', summary: 'UFC cards, fight-night headlines, rankings context, and public fight results.', rssCategory: 'SPORTS_UFC', espnPaths: ['mma/ufc'], publicSources: [
    { name: 'ESPN MMA', url: 'https://www.espn.com/mma/', note: 'News, cards, rankings, and fight coverage.' },
    { name: 'UFC Stats', url: 'http://ufcstats.com/statistics/events/completed', note: 'Official historical fight result tables.' },
    { name: 'TheSportsDB', url: 'https://www.thesportsdb.com/documentation', note: 'Free community sports API for metadata, players, teams, and events.' },
  ] },
  MMA: { id: 'MMA', label: 'MMA', sportFamily: 'Combat Sports', summary: 'Mixed martial arts headlines and event tracking across public combat-sports sources.', rssCategory: 'SPORTS_MMA', espnPaths: ['mma'], publicSources: [
    { name: 'ESPN MMA', url: 'https://www.espn.com/mma/', note: 'Major MMA headlines and event coverage.' },
    { name: 'Sherdog', url: 'https://www.sherdog.com/news/news/list', note: 'Public news feed and fighter/event context.' },
    { name: 'TheSportsDB', url: 'https://www.thesportsdb.com/', note: 'Community sports metadata where coverage exists.' },
  ] },
  BOXING: { id: 'BOXING', label: 'Boxing', sportFamily: 'Combat Sports', summary: 'Boxing headlines, cards, champions, and public fight-result sources.', rssCategory: 'SPORTS_BOXING', espnPaths: ['boxing'], publicSources: [
    { name: 'ESPN Boxing', url: 'https://www.espn.com/boxing/', note: 'Boxing headlines, schedules, and analysis.' },
    { name: 'The Ring', url: 'https://www.ringtv.com/', note: 'Public rankings and boxing news.' },
    { name: 'Box.Live', url: 'https://box.live/', note: 'Public schedules and upcoming fight cards.' },
  ] },
  MARTIAL_ARTS: { id: 'MARTIAL_ARTS', label: 'Martial Arts', sportFamily: 'Combat Sports', summary: 'Karate, judo, taekwondo, grappling, and martial arts headlines from public federation sources.', rssCategory: 'SPORTS_MARTIAL_ARTS', espnPaths: ['mma'], publicSources: [
    { name: 'World Karate Federation', url: 'https://www.wkf.net/news-center-new', note: 'Karate federation news and events.' },
    { name: 'International Judo Federation', url: 'https://www.ijf.org/news', note: 'Judo news, competitions, and rankings context.' },
    { name: 'World Taekwondo', url: 'https://www.worldtaekwondo.org/', note: 'Taekwondo federation events and news.' },
  ] },
  FENCING: { id: 'FENCING', label: 'Fencing', sportFamily: 'Olympic Sports', summary: 'FIE and Olympic-style fencing headlines, events, rankings, and public federation links.', rssCategory: 'SPORTS_FENCING', espnPaths: [], publicSources: [
    { name: 'FIE', url: 'https://fie.org/', note: 'International fencing federation rankings, competitions, and news.' },
    { name: 'USA Fencing', url: 'https://www.usafencing.org/news', note: 'US fencing news and athlete/event coverage.' },
    { name: 'Olympics Fencing', url: 'https://olympics.com/en/sports/fencing/', note: 'Olympic sport explainer and competition coverage.' },
  ] },
  TENNIS: { id: 'TENNIS', label: 'Tennis', sportFamily: 'Racket Sports', summary: 'ATP/WTA headlines, tournament schedules, and tennis match coverage.', rssCategory: 'SPORTS_TENNIS', espnPaths: ['tennis/atp', 'tennis/wta'], publicSources: [
    { name: 'ESPN Tennis', url: 'https://www.espn.com/tennis/', note: 'ATP/WTA news and tournament coverage.' },
    { name: 'ATP Tour', url: 'https://www.atptour.com/', note: 'Men’s tour rankings, draws, and results.' },
    { name: 'WTA', url: 'https://www.wtatennis.com/', note: 'Women’s tour rankings, draws, and results.' },
  ] },
  GOLF: { id: 'GOLF', label: 'Golf', sportFamily: 'Golf', summary: 'PGA/LPGA headlines, tournament leaderboards, and public tour links.', rssCategory: 'SPORTS_GOLF', espnPaths: ['golf/pga'], publicSources: [
    { name: 'ESPN Golf', url: 'https://www.espn.com/golf/', note: 'Tournament coverage and headlines.' },
    { name: 'PGA Tour', url: 'https://www.pgatour.com/', note: 'Leaderboards, schedules, and player profiles.' },
    { name: 'LPGA', url: 'https://www.lpga.com/', note: 'Women’s tour results and player coverage.' },
  ] },
  CRICKET: { id: 'CRICKET', label: 'Cricket', sportFamily: 'Cricket', summary: 'International and league cricket headlines with ESPN Cricinfo as the primary public source.', rssCategory: 'SPORTS_CRICKET', espnPaths: ['cricket'], publicSources: [
    { name: 'ESPN Cricinfo', url: 'https://www.espncricinfo.com/', note: 'Cricket scores, fixtures, stats, and news.' },
    { name: 'ICC', url: 'https://www.icc-cricket.com/', note: 'International cricket rankings and tournaments.' },
    { name: 'Cricbuzz', url: 'https://www.cricbuzz.com/', note: 'Public live score and news coverage.' },
  ] },
  RUGBY: { id: 'RUGBY', label: 'Rugby', sportFamily: 'Rugby', summary: 'Rugby union and league news, fixtures, and federation coverage.', rssCategory: 'SPORTS_RUGBY', espnPaths: ['rugby'], publicSources: [
    { name: 'ESPN Rugby', url: 'https://www.espn.com/rugby/', note: 'Rugby news and match coverage.' },
    { name: 'World Rugby', url: 'https://www.world.rugby/', note: 'Global fixtures, rankings, and competitions.' },
    { name: 'TheSportsDB', url: 'https://www.thesportsdb.com/', note: 'Community teams/events metadata.' },
  ] },
  WRESTLING: { id: 'WRESTLING', label: 'Wrestling', sportFamily: 'Combat Sports', summary: 'Olympic wrestling, college wrestling, and pro wrestling headlines from public sources.', rssCategory: 'SPORTS_WRESTLING', espnPaths: ['mma'], publicSources: [
    { name: 'United World Wrestling', url: 'https://uww.org/', note: 'Olympic wrestling news, rankings, and events.' },
    { name: 'NCAA Wrestling', url: 'https://www.ncaa.com/sports/wrestling/d1', note: 'College championship coverage.' },
    { name: 'ESPN Combat Sports', url: 'https://www.espn.com/mma/', note: 'Adjacent combat sports coverage.' },
  ] },
  VOLLEYBALL: { id: 'VOLLEYBALL', label: 'Volleyball', sportFamily: 'Volleyball', summary: 'International volleyball and beach volleyball news and public event sources.', rssCategory: 'SPORTS_VOLLEYBALL', espnPaths: [], publicSources: [
    { name: 'Volleyball World', url: 'https://en.volleyballworld.com/', note: 'International volleyball scores, rankings, and news.' },
    { name: 'FIVB', url: 'https://www.fivb.com/', note: 'Federation competitions and announcements.' },
    { name: 'NCAA Volleyball', url: 'https://www.ncaa.com/sports/volleyball-women/d1', note: 'College tournament coverage.' },
  ] },
  LACROSSE: { id: 'LACROSSE', label: 'Lacrosse', sportFamily: 'Lacrosse', summary: 'PLL, NLL, college lacrosse, and international lacrosse public coverage.', rssCategory: 'SPORTS_LACROSSE', espnPaths: ['lacrosse'], publicSources: [
    { name: 'Premier Lacrosse League', url: 'https://premierlacrosseleague.com/', note: 'PLL schedules, rosters, standings, and news.' },
    { name: 'NLL', url: 'https://www.nll.com/', note: 'Box lacrosse league schedules and news.' },
    { name: 'NCAA Lacrosse', url: 'https://www.ncaa.com/sports/lacrosse-men/d1', note: 'College tournament and team coverage.' },
  ] },
};

export function getSpecialtySportCfg(tab: string) {
  return SPECIALTY_SPORTS[tab] ?? null;
}

export function getSpecialtySports() {
  return Object.values(SPECIALTY_SPORTS);
}

export function getLeagueCfg(tab: string) {
  if (tab === 'ESPORTS') return null;
  return LEAGUES[tab as Exclude<LeagueTab, 'ESPORTS'>] ?? null;
}

const normalizeArticle = (article: any, source = 'Sports') => ({
  ...article,
  headline: article?.headline || article?.title || '',
  title: article?.title || article?.headline || '',
  source: article?.source || source,
  links: article?.links || (article?.url ? { web: { href: article.url } } : undefined),
  images: article?.images || (article?.imageUrl ? [{ url: article.imageUrl }] : []),
});

async function fetchSpecialtySportsNews(tab: string): Promise<any[]> {
  const cfg = getSpecialtySportCfg(tab);
  if (!cfg) return [];
  const key = `specialty:news:${tab}`;
  const cached = fromCache(key, TTL.news);
  if (cached) return cached;

  const espnResults = await Promise.allSettled(
    cfg.espnPaths.map(path => safeFetch(`${ESPN}/${path}/news?limit=20`))
  );
  let articles = espnResults.flatMap(result =>
    result.status === 'fulfilled' ? (result.value?.articles ?? []) : []
  );

  if (articles.length === 0) {
    try {
      const { fetchNewsFromRSS } = await import('./rssService');
      const rss = await fetchNewsFromRSS(cfg.rssCategory);
      articles = rss.map((item: any) => normalizeArticle(item, cfg.label));
    } catch {
      articles = [];
    }
  }

  const normalized = articles.map((article: any) => normalizeArticle(article, cfg.label)).slice(0, 24);
  toCache(key, normalized);
  return normalized;
}

async function fetchSpecialtySportsScores(tab: string): Promise<any[]> {
  const cfg = getSpecialtySportCfg(tab);
  if (!cfg) return [];
  const key = `specialty:scores:${tab}`;
  const cached = fromCache(key, TTL.scores);
  if (cached) return cached;

  const results = await Promise.allSettled(
    cfg.espnPaths.map(path => safeFetch(`${ESPN}/${path}/scoreboard`))
  );
  const events = results.flatMap(result =>
    result.status === 'fulfilled' ? (result.value?.events ?? []) : []
  );
  toCache(key, events);
  return events;
}

async function resolveEspnTeamId(tab: string, teamId: string, fullName?: string): Promise<string> {
  if (/^\d+$/.test(teamId)) return teamId;
  const staticTeam = findStaticTeam(tab, teamId) || (fullName ? findStaticTeam(tab, fullName) : undefined);
  const abbr = (staticTeam?.espnId || teamId).toLowerCase();
  const name = (fullName || staticTeam?.name || '').toLowerCase();
  const teams = await fetchLeagueTeams(tab).catch(() => []);
  const matched = teams.find(t =>
    t.id === teamId ||
    t.abbreviation.toLowerCase() === abbr ||
    t.name.toLowerCase() === name ||
    (name && t.name.toLowerCase().includes(name))
  );
  return matched?.id || staticTeam?.espnId || teamId;
}

// ── TheSportsDB Soccer Config ────────────────────────────────────────────────
// TheSportsDB free tier key = "3" (already set in TSDB const below)
// FIFA tab shows the FIFA World Cup 2026 (teams/standings/news via ESPN fifa.world)
// MLS tab shows Major League Soccer exclusively
const TSDB_SOCCER: Record<string, { leagueId: string; leagueName: string; espnNews: string }> = {
  FIFA: { leagueId: '4429', leagueName: 'FIFA World Cup', espnNews: 'soccer/fifa.world' },
  MLS:  { leagueId: '4346', leagueName: 'Major League Soccer',    espnNews: 'soccer/usa.1' },
};

// ---------- E-Sports organizations (free, no API key) ----------------------
export interface EsportsOrg {
  id: string;
  name: string;
  abbreviation: string;
  region: string;
  games: string[];
  logo: string;
  color: string;
  altColor: string;
  founded: string;
  description: string;
}

export const ESPORTS_ORGS: EsportsOrg[] = [
  { id: 'liquid',    name: 'Team Liquid',        abbreviation: 'TL',   region: 'NA',   games: ['LoL','CS2','Dota 2','Valorant'],   logo: 'https://logo.clearbit.com/teamliquid.net',  color: '#1D2671', altColor: '#C8C8C8', founded: '2000', description: 'One of the most decorated multi-game esports organizations in the world, based in Utrecht, Netherlands.' },
  { id: 'cloud9',   name: 'Cloud9',              abbreviation: 'C9',   region: 'NA',   games: ['LoL','CS2','Valorant','Halo'],      logo: 'https://logo.clearbit.com/cloud9.gg',       color: '#6DC5F3', altColor: '#FFFFFF', founded: '2013', description: 'North American esports organization headquartered in Los Angeles, California. Known for their blue branding.' },
  { id: 'faze',     name: 'FaZe Clan',           abbreviation: 'FaZe', region: 'NA',   games: ['CS2','Warzone','Valorant','FIFA'],  logo: 'https://logo.clearbit.com/fazeclan.com',    color: '#CC0000', altColor: '#FFFFFF', founded: '2010', description: 'Entertainment and sports organization that operates among the most followed gaming content creator networks.' },
  { id: 'navi',     name: 'Natus Vincere',       abbreviation: 'NAVI', region: 'EU',   games: ['CS2','Dota 2','FIFA'],              logo: 'https://logo.clearbit.com/navi.gg',         color: '#FFCC00', altColor: '#1A1A1A', founded: '2009', description: 'Ukrainian esports organization, best known for their legendary CS:GO roster led by s1mple.' },
  { id: 'fnatic',   name: 'Fnatic',              abbreviation: 'FNC',  region: 'EU',   games: ['LoL','CS2','Valorant','FIFA'],      logo: 'https://logo.clearbit.com/fnatic.com',      color: '#FF5500', altColor: '#FFFFFF', founded: '2004', description: 'British esports organization founded in 2004, one of the oldest and most storied brands in competitive gaming.' },
  { id: 'g2',       name: 'G2 Esports',          abbreviation: 'G2',   region: 'EU',   games: ['LoL','CS2','Valorant','R6'],        logo: 'https://logo.clearbit.com/g2esports.com',   color: '#C0AF6A', altColor: '#000000', founded: '2014', description: 'European esports organization known for their entertaining playstyle and legendary roster acquisitions.' },
  { id: 't1',       name: 'T1',                  abbreviation: 'T1',   region: 'KR',   games: ['LoL','Valorant','Dota 2'],          logo: 'https://logo.clearbit.com/t1.gg',           color: '#DB4446', altColor: '#FFFFFF', founded: '2002', description: 'South Korean esports organization home to the legendary Faker, the greatest League of Legends player of all time.' },
  { id: '100t',     name: '100 Thieves',         abbreviation: '100T', region: 'NA',   games: ['Valorant','LoL','Fortnite'],        logo: 'https://logo.clearbit.com/100thieves.com',  color: '#D30000', altColor: '#C89B3C', founded: '2017', description: 'Esports and lifestyle brand founded by former Call of Duty world champion Nadeshot.' },
  { id: 'sentinels',name: 'Sentinels',           abbreviation: 'SEN',  region: 'NA',   games: ['Valorant','Halo','Apex Legends'],   logo: 'https://logo.clearbit.com/sentinels.gg',    color: '#F11818', altColor: '#FFFFFF', founded: '2018', description: 'North American esports organization known for their dominant Valorant roster featuring TenZ and Shroud.' },
  { id: 'vitality', name: 'Team Vitality',       abbreviation: 'VIT',  region: 'EU',   games: ['CS2','LoL','Dota 2'],              logo: 'https://logo.clearbit.com/vitality.gg',     color: '#FDE036', altColor: '#000000', founded: '2013', description: 'French esports organization headquartered in Paris, home to zywoo, one of the best CS2 players globally.' },
  { id: 'eg',       name: 'Evil Geniuses',       abbreviation: 'EG',   region: 'NA',   games: ['Dota 2','CS2','Valorant'],         logo: 'https://logo.clearbit.com/evilgeniuses.gg', color: '#0E2D4F', altColor: '#4F9EFF', founded: '1999', description: 'One of the most decorated Dota 2 organizations, winner of The International 2015.' },
  { id: 'mouz',     name: 'MOUZ',                abbreviation: 'MZ',   region: 'EU',   games: ['CS2','Valorant'],                  logo: 'https://logo.clearbit.com/mouz.gg',         color: '#FF6800', altColor: '#FFFFFF', founded: '2002', description: 'German esports organization with a strong CS tradition, known for developing top European talent.' },
  { id: 'astralis', name: 'Astralis',            abbreviation: 'AST',  region: 'EU',   games: ['CS2','LoL','FIFA'],                logo: 'https://logo.clearbit.com/astralis.gg',     color: '#CE1620', altColor: '#1F1F1F', founded: '2016', description: 'Danish CS:GO dynasty that won four Majors and revolutionized how tactical shooters are played.' },
  { id: 'tsm',      name: 'Team SoloMid',        abbreviation: 'TSM',  region: 'NA',   games: ['LoL','Valorant','Apex Legends'],   logo: 'https://logo.clearbit.com/tsm.gg',          color: '#1D3559', altColor: '#FFFFFF', founded: '2009', description: 'One of the most iconic North American League of Legends organizations, founded by reginald.' },
  { id: 'loud',     name: 'LOUD',                abbreviation: 'LOUD', region: 'BR',   games: ['Valorant','CS2'],                  logo: 'https://logo.clearbit.com/loud.gg',         color: '#C2EA01', altColor: '#000000', founded: '2020', description: 'Brazilian esports organization that rose to become one of the most watched orgs on the internet.' },
  { id: 'og',       name: 'OG Esports',          abbreviation: 'OG',   region: 'EU',   games: ['Dota 2','CS2','Valorant'],         logo: 'https://logo.clearbit.com/og.gg',           color: '#1C7DC4', altColor: '#FFFFFF', founded: '2015', description: 'Dota 2 legends and the only team to win The International twice, including back-to-back in 2018 and 2019.' },
  { id: 'nrg',      name: 'NRG',                 abbreviation: 'NRG',  region: 'NA',   games: ['Apex Legends','Valorant','CS2'],   logo: 'https://logo.clearbit.com/nrg.gg',          color: '#00B22D', altColor: '#FFFFFF', founded: '2015', description: 'North American esports organization known for their strong Apex Legends and Rocket League rosters.' },
  { id: 'heroic',   name: 'Heroic',              abbreviation: 'HC',   region: 'EU',   games: ['CS2','Valorant'],                  logo: 'https://logo.clearbit.com/heroicgg.com',    color: '#E85912', altColor: '#FFFFFF', founded: '2017', description: 'Danish esports organization that has been a consistent top-10 CS2 team in the world.' },
  { id: 'spirit',   name: 'Team Spirit',         abbreviation: 'SP',   region: 'CIS',  games: ['CS2','Dota 2','Valorant'],         logo: 'https://logo.clearbit.com/teamspirit.gg',   color: '#4A90D9', altColor: '#FFFFFF', founded: '2015', description: 'Russian esports organization and winners of The International 2021 and multiple CS2 majors.' },
  { id: 'complexity',name: 'Complexity Gaming',  abbreviation: 'COL',  region: 'NA',   games: ['CS2','Valorant','Halo'],           logo: 'https://logo.clearbit.com/complexity.gg',   color: '#002366', altColor: '#F5A623', founded: '2003', description: 'North American veteran organization owned by the Dallas Cowboys, one of the founding orgs in esports.' },
  { id: 'geng',      name: 'Gen.G Esports',       abbreviation: 'GEN',  region: 'KR',   games: ['League of Legends','Valorant'],    logo: 'https://logo.clearbit.com/gen.g',           color: '#C69B3A', altColor: '#000000', founded: '2017', description: 'Korean esports organization home to Chovy, consistently among the world\'s best LoL and Valorant teams.' },
  { id: 'drx',       name: 'DRX',                 abbreviation: 'DRX',  region: 'KR',   games: ['League of Legends','Valorant'],    logo: 'https://logo.clearbit.com/drx.gg',          color: '#00B4D8', altColor: '#FFFFFF', founded: '2017', description: 'Korean org famous for DRX\'s miraculous 2022 Worlds run from Play-Ins all the way to the Championship.' },
  { id: 'jdg',       name: 'JDG Esports',         abbreviation: 'JDG',  region: 'CN',   games: ['League of Legends'],               logo: 'https://logo.clearbit.com/jdgesports.com',  color: '#0066CC', altColor: '#FFFFFF', founded: '2015', description: 'Dominant Chinese LPL organization and 2023 MSI Champions, home to some of the world\'s best imported talent.' },
  { id: 'blg',       name: 'Bilibili Gaming',     abbreviation: 'BLG',  region: 'CN',   games: ['League of Legends'],               logo: 'https://logo.clearbit.com/blg.gg',          color: '#00A1D6', altColor: '#FFFFFF', founded: '2018', description: 'Chinese LPL team backed by Bilibili, known for their aggressive playstyle and MSI championship pedigree.' },
];

// ── Esports Players ──────────────────────────────────────────────────────────

export interface EsportsPlayer {
  id: string;
  ign: string;
  name: string;
  role: string;
  game: string;
  orgId?: string;
  orgName: string;
  nationality: string;
  flag: string;
  bio: string;
  stats: { label: string; value: string }[];
  achievements: string[];
  socials?: { twitch?: string; twitter?: string };
}

export const ESPORTS_PLAYERS: EsportsPlayer[] = [
  // ── CS2 ──
  { id: 'zywoo', ign: 'ZywOo', name: 'Mathieu Herbaut', role: 'AWP / Rifler', game: 'CS2', orgId: 'vitality', orgName: 'Team Vitality',
    nationality: 'French', flag: '🇫🇷',
    bio: 'The most dominant individual performer in CS history. ZywOo won 5 consecutive #1 HLTV rankings (2019–2023) and delivered his first Major title at blast.tv Paris 2023 with Team Vitality.',
    stats: [{ label: 'HLTV Rating (career)', value: '1.34' }, { label: 'Major Wins', value: '1' }, { label: '#1 HLTV Rankings', value: '5' }, { label: 'K/D Ratio', value: '1.27' }],
    achievements: ['blast.tv Paris 2023 Major Champion', '5× HLTV #1 Player (2019–2023)', 'BLAST Premier World Final 2023 Champion', 'IEM Cologne 2023 Champion'],
    socials: { twitch: 'https://www.twitch.tv/zywoo', twitter: 'https://twitter.com/ZywOo' },
  },
  { id: 'donk', ign: 'donk', name: 'Danil Kryshkovets', role: 'Rifler', game: 'CS2', orgId: 'spirit', orgName: 'Team Spirit',
    nationality: 'Russian', flag: '🇷🇺',
    bio: 'The 18-year-old prodigy who broke every CS2 individual record, posting the highest HLTV rating ever recorded (1.48) en route to the PGL Copenhagen 2024 Major championship.',
    stats: [{ label: 'HLTV Rating (2024)', value: '1.48' }, { label: 'Major Wins', value: '1' }, { label: '#1 HLTV Rankings', value: '1' }, { label: 'ADR', value: '89.3' }],
    achievements: ['PGL Copenhagen 2024 Major Champion & MVP', '#1 HLTV 2024 (youngest ever)', 'BLAST Premier Fall 2024 Champion', 'Record HLTV Rating 1.48'],
    socials: { twitter: 'https://twitter.com/donk_cs2' },
  },
  { id: 'niko', ign: 'NiKo', name: 'Nikola Kovač', role: 'Rifler', game: 'CS2', orgId: 'g2', orgName: 'G2 Esports',
    nationality: 'Bosnian', flag: '🇧🇦',
    bio: 'A top-5 player for over a decade, NiKo\'s mechanical precision and clutch performance have made him one of the most revered riflers in Counter-Strike history across mouz, FaZe, and G2.',
    stats: [{ label: 'HLTV Rating (career)', value: '1.21' }, { label: 'Major Wins', value: '1' }, { label: 'Years Pro', value: '14+' }, { label: 'K/D Ratio', value: '1.19' }],
    achievements: ['PGL Antwerp 2022 Major Champion', 'IEM Katowice 2024 Champion', 'HLTV Top-5 eight consecutive years', 'ESL One Cologne 2022 Champion'],
    socials: { twitter: 'https://twitter.com/G2NiKo' },
  },
  { id: 'device', ign: 'device', name: 'Nicolai Reedtz', role: 'AWPer', game: 'CS2', orgId: 'astralis', orgName: 'Astralis',
    nationality: 'Danish', flag: '🇩🇰',
    bio: 'The most decorated AWPer in Major history. device anchored the Astralis dynasty that won 4 Majors and revolutionized how tactical shooters are played with a data-driven, team-first philosophy.',
    stats: [{ label: 'Major Wins', value: '4' }, { label: 'HLTV Peak Rating', value: '1.22' }, { label: '#1 HLTV Rankings', value: '1' }, { label: 'Major MVPs', value: '2' }],
    achievements: ['4× CS:GO Major Champion (Astralis era)', '#1 HLTV Player 2018', '2× Major MVP', 'IEM Katowice 2019 Champion'],
    socials: { twitter: 'https://twitter.com/device' },
  },
  { id: 'm0nesy', ign: 'm0NESY', name: 'Ilya Osipov', role: 'AWPer', game: 'CS2', orgId: 'g2', orgName: 'G2 Esports',
    nationality: 'Russian', flag: '🇷🇺',
    bio: 'A prodigy who debuted at 16, m0NESY rapidly became one of the most feared AWPers in CS2, known for his aggressive peeking, absurd reaction time, and mechanical ceiling that rivals any player.',
    stats: [{ label: 'HLTV Rating (2023)', value: '1.24' }, { label: 'Pro Debut Age', value: '16' }, { label: 'Major Finals', value: '1' }, { label: 'K/D Ratio', value: '1.18' }],
    achievements: ['IEM Cologne 2023 Champion', 'BLAST Premier World Final 2023 Champion', 'HLTV Top-10 Player 2022 & 2023', 'Youngest player at Major Grand Final'],
    socials: { twitch: 'https://www.twitch.tv/m0nesy', twitter: 'https://twitter.com/m0nesyCS' },
  },
  // ── Valorant ──
  { id: 'tenz', ign: 'TenZ', name: 'Tyson Ngo', role: 'Duelist', game: 'Valorant', orgId: 'sentinels', orgName: 'Sentinels',
    nationality: 'Canadian', flag: '🇨🇦',
    bio: 'The face of North American Valorant. TenZ\'s Jett and Raze mechanics set a new standard for Duelist play and his highlight reel — including a 1v5 clutch at Champions 2021 — made him the game\'s breakout star.',
    stats: [{ label: 'Peak Rank', value: '#1 NA Radiant' }, { label: 'VCT Stage Wins', value: '1' }, { label: 'K/D Ratio', value: '1.14' }, { label: 'Avg ACS', value: '248' }],
    achievements: ['2021 VCT Stage 1 NA Champion', 'VCT Classic 2021 Standout Performer', 'Perennial #1 Radiant ranking', 'Sentinels Franchise Cornerstone'],
    socials: { twitch: 'https://www.twitch.tv/tenz', twitter: 'https://twitter.com/TenZOfficial' },
  },
  { id: 'aspas', ign: 'aspas', name: 'Victor Gonçalves', role: 'Duelist', game: 'Valorant', orgId: 'loud', orgName: 'LOUD',
    nationality: 'Brazilian', flag: '🇧🇷',
    bio: 'Brazil\'s greatest Valorant player. aspas\'s Raze play at 2022 Champions redefined the Duelist ceiling, and he has maintained that level across three Champions appearances — consistently among the highest-ACS players in the world.',
    stats: [{ label: 'VCT Americas Wins', value: '2' }, { label: 'Champions Appearances', value: '3' }, { label: 'K/D Ratio', value: '1.19' }, { label: 'Avg ACS', value: '266' }],
    achievements: ['2× VCT Americas Champion', '2022 VCT Champions Finalist', '2023 VCT Champions Finalist', 'Highest single-event ACS at Champions'],
    socials: { twitch: 'https://www.twitch.tv/aspas', twitter: 'https://twitter.com/aspas' },
  },
  { id: 'derke', ign: 'Derke', name: 'Nikita Sirmitev', role: 'Duelist', game: 'Valorant', orgId: 'fnatic', orgName: 'Fnatic',
    nationality: 'Finnish', flag: '🇫🇮',
    bio: 'Fnatic\'s star carry and the face of European Valorant. Derke\'s aggressive Jett mechanics and tactical versatility make him a consistent top performer at every international tournament.',
    stats: [{ label: 'VCT EMEA Wins', value: '3' }, { label: 'Lock//In Finish', value: 'Finalist 2023' }, { label: 'K/D Ratio', value: '1.12' }, { label: 'Avg ACS', value: '238' }],
    achievements: ['3× VCT EMEA Champion', '2023 VCT Lock//In São Paulo Finalist', 'VCT Masters Tokyo 2023 Participant', 'EMEA MVP multiple splits'],
    socials: { twitch: 'https://www.twitch.tv/derke', twitter: 'https://twitter.com/Derke' },
  },
  { id: 'nats', ign: 'nAts', name: 'Ayaz Akbarli', role: 'Sentinel', game: 'Valorant', orgId: 'navi', orgName: 'Natus Vincere',
    nationality: 'Russian', flag: '🇷🇺',
    bio: 'Considered the best sentinel player in Valorant history, nAts redefined Cypher and Chamber with his information control and clutch plays, anchoring NAVI to a Masters championship and Champions finals appearance.',
    stats: [{ label: 'VCT Masters Win', value: '2022' }, { label: 'Champions Finish', value: 'Finalist 2022' }, { label: 'K/D Ratio', value: '1.09' }, { label: 'Clutch Win %', value: '42%' }],
    achievements: ['VCT Masters Reykjavík 2022 Champion', '2022 VCT Champions Finalist', 'Best Sentinel by rating 2022', 'EMEA VCT consistent top-3 performer'],
    socials: { twitter: 'https://twitter.com/nAtsvalorant' },
  },
  { id: 'boaster', ign: 'Boaster', name: 'Jake Howlett', role: 'IGL / Controller', game: 'Valorant', orgId: 'fnatic', orgName: 'Fnatic',
    nationality: 'British', flag: '🇬🇧',
    bio: 'The charismatic and cerebral IGL who transformed Fnatic into the dominant European force. Boaster\'s game sense, entry fragging on Omen, and leadership are widely regarded as the best in EMEA Valorant.',
    stats: [{ label: 'VCT EMEA Wins', value: '3' }, { label: 'First Bloods Avg', value: '0.21' }, { label: 'Maps Played (VCT)', value: '200+' }, { label: 'IGL Win Rate', value: '68%' }],
    achievements: ['3× VCT EMEA Champion as IGL', '2023 VCT Lock//In São Paulo Finalist', 'Voted Best IGL in EMEA multiple years', 'Fnatic Valorant team founder'],
    socials: { twitch: 'https://www.twitch.tv/boaster', twitter: 'https://twitter.com/Boaster' },
  },
  // ── League of Legends ──
  { id: 'faker', ign: 'Faker', name: 'Lee Sang-hyeok', role: 'Mid Laner', game: 'League of Legends', orgId: 't1', orgName: 'T1',
    nationality: 'Korean', flag: '🇰🇷',
    bio: 'The greatest League of Legends player of all time and the game\'s first global superstar. Active since 2013, Faker holds the record for most World Championships at 4 — and was named an Olympic Torchbearer for his cultural impact.',
    stats: [{ label: 'World Championships', value: '4' }, { label: 'LCK Titles', value: '10+' }, { label: 'Years Active', value: '12+' }, { label: 'Worlds Games', value: '100+' }],
    achievements: ['4× World Champion (2013, 2015, 2016, 2023)', '3× Worlds MVP', '10× LCK Champion', 'Olympic Torchbearer (2024 Paris)', 'KeSPA Player of the Year multiple times'],
    socials: { twitch: 'https://www.twitch.tv/faker', twitter: 'https://twitter.com/faker' },
  },
  { id: 'chovy', ign: 'Chovy', name: 'Jung Ji-hoon', role: 'Mid Laner', game: 'League of Legends', orgId: 'geng', orgName: 'Gen.G',
    nationality: 'Korean', flag: '🇰🇷',
    bio: 'Holder of the highest individual performance metrics in modern LoL. Chovy\'s CS leads, damage output, and champion pool depth are consistently unmatched — some analysts consider him the most mechanically gifted player ever.',
    stats: [{ label: 'LCK Titles', value: '3' }, { label: 'Worlds Appearances', value: '6' }, { label: 'CS Diff @15 (avg)', value: '+18.3' }, { label: 'DPM (avg)', value: '695' }],
    achievements: ['3× LCK Champion', '2023 Worlds Finalist', '2024 MSI Champion', 'Highest DPM in Worlds history (single split)'],
    socials: { twitter: 'https://twitter.com/Chovy_GenG' },
  },
  { id: 'zeus', ign: 'Zeus', name: 'Choi Woo-je', role: 'Top Laner', game: 'League of Legends', orgId: 't1', orgName: 'T1',
    nationality: 'Korean', flag: '🇰🇷',
    bio: 'T1\'s stone-cold top laner and 2023 World Champion. Zeus is known for his Renekton and Jayce mastery and his ability to carry the highest-pressure moments on the international stage.',
    stats: [{ label: 'World Championships', value: '1' }, { label: 'LCK Titles', value: '3' }, { label: 'CS Diff @15', value: '+8.2' }, { label: 'Worlds Finals', value: '2' }],
    achievements: ['2023 World Champion', '3× LCK Champion', '2024 MSI Champion', 'LCK 2023 Spring MVP'],
    socials: { twitter: 'https://twitter.com/T1Zeus' },
  },
  { id: 'ruler', ign: 'Ruler', name: 'Park Jae-hyuk', role: 'ADC', game: 'League of Legends', orgId: 'blg', orgName: 'Bilibili Gaming',
    nationality: 'Korean', flag: '🇰🇷',
    bio: 'One of the most decorated ADCs in LoL history across SSG, Gen.G, JDG, and BLG. Ruler has appeared in 4 Worlds Finals and won the 2018 World Championship — a career spanning the entire modern era of the game.',
    stats: [{ label: 'World Championships', value: '1' }, { label: 'Worlds Finals', value: '4' }, { label: 'Years Active', value: '9+' }, { label: 'MSI Wins', value: '1' }],
    achievements: ['2018 World Champion (Samsung Galaxy)', '2023 MSI Champion (JDG)', '4× Worlds Finalist', 'Multiple LCK/LPL All-Star selections'],
    socials: { twitter: 'https://twitter.com/JDG_Ruler' },
  },
  { id: 'beryl', ign: 'BeryL', name: 'Cho Gun-hee', role: 'Support', game: 'League of Legends', orgId: 'drx', orgName: 'DRX',
    nationality: 'Korean', flag: '🇰🇷',
    bio: 'The support who guided DRX through the most remarkable Worlds run in history — entering at Play-Ins and winning the 2022 World Championship. BeryL is known for his champion pool, vision control, and leadership.',
    stats: [{ label: 'World Championships', value: '1' }, { label: 'LCK Titles', value: '2' }, { label: '2022 Worlds Path', value: 'Play-In → Champ' }, { label: 'Vision Score Avg', value: '62.3' }],
    achievements: ['2022 World Champion (DRX — Play-Ins to Title)', '2× LCK Champion', 'LCK All-Pro Team multiple seasons', 'Longest Worlds run by seed (2022)'],
    socials: { twitter: 'https://twitter.com/DRX_BeryL' },
  },
  // ── Dota 2 ──
  { id: 'n0tail', ign: 'N0tail', name: 'Johan Sundstein', role: 'Pos 4 Support', game: 'Dota 2', orgId: 'og', orgName: 'OG Esports',
    nationality: 'Danish', flag: '🇩🇰',
    bio: 'Captain of OG\'s legendary back-to-back TI championship teams (2018, 2019), N0tail is the only person to win The International twice and is widely considered one of the greatest Dota 2 leaders of all time.',
    stats: [{ label: 'TI Wins', value: '2 (TI8, TI9)' }, { label: 'Career Earnings', value: '$7M+' }, { label: 'TI Appearances', value: '8' }, { label: 'TI Win Rate', value: '65%' }],
    achievements: ['TI8 Champion (OG)', 'TI9 Champion (OG) — first back-to-back ever', 'Record career Dota 2 prize earnings at the time', 'Esports Hall of Fame inductee'],
    socials: { twitch: 'https://www.twitch.tv/n0tail', twitter: 'https://twitter.com/n0tail' },
  },
  { id: 'arteezy', ign: 'Arteezy', name: 'Artour Babaev', role: 'Pos 1 Carry', game: 'Dota 2', orgId: 'eg', orgName: 'Evil Geniuses',
    nationality: 'Canadian', flag: '🇨🇦',
    bio: 'The most consistent North American carry in Dota 2 history. Arteezy has competed at the elite level since 2013, known for his precise last-hitting, Terrorblade mastery, and multiple TI deep runs with Evil Geniuses.',
    stats: [{ label: 'TI Appearances', value: '8+' }, { label: 'Best TI Finish', value: '2nd (TI9)' }, { label: 'Career Earnings', value: '$3M+' }, { label: 'Hero Pool', value: '120+' }],
    achievements: ['TI9 Runner-Up with EG', 'Multiple TI Top-8 finishes', 'ESL One Major Champion multiple times', 'NA Dota 2 cornerstone player'],
    socials: { twitch: 'https://www.twitch.tv/arteezy', twitter: 'https://twitter.com/arteezy' },
  },
  { id: 'miracle', ign: 'Miracle-', name: 'Amer Al-Barkawi', role: 'Pos 1 / Pos 2', game: 'Dota 2', orgId: 'liquid', orgName: 'Team Liquid',
    nationality: 'Jordanian', flag: '🇯🇴',
    bio: 'TI7 champion with Team Liquid and the first player ever to reach 9000 MMR. Miracle-\'s impossible mechanics and diverse hero pool made him the benchmark for carry play in Dota 2\'s peak era.',
    stats: [{ label: 'TI Wins', value: '1 (TI7)' }, { label: 'Peak MMR', value: '9000 (first ever)' }, { label: 'Career Earnings', value: '$2.8M+' }, { label: 'TI7 KDA', value: '7.2' }],
    achievements: ['TI7 Champion (Team Liquid)', 'First player to reach 9000 MMR', 'ESL One Frankfurt 2017 Champion', 'Multiple TI Top-4 finishes'],
    socials: { twitch: 'https://www.twitch.tv/miracledota', twitter: 'https://twitter.com/Miracle_Dota2' },
  },
  // ── Apex Legends ──
  { id: 'imperialhal', ign: 'ImperialHal', name: 'Philip Dosen', role: 'IGL / Fragger', game: 'Apex Legends', orgId: 'tsm', orgName: 'TSM',
    nationality: 'American', flag: '🇺🇸',
    bio: 'The "Emperor" of competitive Apex Legends. ImperialHal\'s IGL calls, Pathfinder positioning, and clutch fragging have made him the undisputed face of the scene since the game\'s competitive launch.',
    stats: [{ label: 'ALGS Wins', value: '5+' }, { label: 'Year 2 Championship', value: '✓' }, { label: 'Avg Damage/Round', value: '712' }, { label: 'Win Rate', value: '38%' }],
    achievements: ['ALGS Year 2 Championship', '5× ALGS Split Champion', 'TSM franchise cornerstone', 'Most-watched Apex competitive player'],
    socials: { twitch: 'https://www.twitch.tv/imperialhal', twitter: 'https://twitter.com/ImperialHal' },
  },
  { id: 'genburten', ign: 'Genburten', name: 'Phillip Boman', role: 'Fragger', game: 'Apex Legends', orgId: 'nrg', orgName: 'NRG',
    nationality: 'Dutch', flag: '🇳🇱',
    bio: 'Widely considered the best mechanical fragger in competitive Apex Legends history. Genburten\'s aim, movement, and game sense are unmatched, anchoring NRG to multiple ALGS championships.',
    stats: [{ label: 'ALGS Year 3 Win', value: '✓' }, { label: 'Avg Damage/Round', value: '856' }, { label: 'K/D Ratio', value: '4.8' }, { label: 'Headshot %', value: '34%' }],
    achievements: ['ALGS Year 3 Championship (NRG)', 'Multiple ALGS Pro League Split wins', 'Consistent #1 fragger rating in global standings', 'NRG ALGS dynasty anchor'],
    socials: { twitch: 'https://www.twitch.tv/genburten', twitter: 'https://twitter.com/genburten' },
  },
  // ── Rocket League ──
  { id: 'jstn', ign: 'jstn', name: 'Justin Morales', role: 'Midfielder / Striker', game: 'Rocket League', orgId: 'nrg', orgName: 'NRG',
    nationality: 'American', flag: '🇺🇸',
    bio: 'The 2018 RLCS World Champion whose overtime double-tap goal is the most iconic play in Rocket League history. jstn rose from relative obscurity at age 16 to become a World Champion in a single year.',
    stats: [{ label: 'RLCS Wins', value: '1 (2018)' }, { label: 'Season MVPs', value: '2' }, { label: 'Goals Per Game', value: '1.12' }, { label: 'Shot %', value: '29%' }],
    achievements: ['2018 RLCS World Champion (NRG)', 'RLCS Season 5 Champion', 'Iconic overtime double-tap winner vs. G2', 'Youngest RLCS Champion at the time (16)'],
    socials: { twitch: 'https://www.twitch.tv/jstn', twitter: 'https://twitter.com/jstn_RL' },
  },
  // ── Fortnite ──
  { id: 'bugha', ign: 'Bugha', name: 'Kyle Giersdorf', role: 'Solo Fragger / Builder', game: 'Fortnite', orgId: 'sentinels', orgName: 'Sentinels',
    nationality: 'American', flag: '🇺🇸',
    bio: 'The 2019 Fortnite World Cup Solo Champion who won $3 million at age 16. Bugha\'s editing speed, building mechanics, and under-pressure performance remain the gold standard in competitive Fortnite.',
    stats: [{ label: 'World Cup Win', value: '2019 Solo' }, { label: 'Prize Money', value: '$3M' }, { label: 'Age at Win', value: '16' }, { label: 'Edit Speed (cps)', value: '16+' }],
    achievements: ['2019 Fortnite World Cup Solo Champion ($3M)', 'FNCS Champion multiple seasons', 'Youngest major esports World Champion ($3M prize)', 'Sentinels franchise player'],
    socials: { twitch: 'https://www.twitch.tv/bugha', twitter: 'https://twitter.com/bugha' },
  },
];

// ── Esports Tournament Watch Links ──────────────────────────────────────────

export interface EsportsTournamentWatch {
  id: string;
  game: string;
  name: string;
  organizer: string;
  description: string;
  watchUrl: string;
  liveUrl: string;
  color: string;
}

export const ESPORTS_TOURNAMENT_WATCH: EsportsTournamentWatch[] = [
  // CS2
  { id: 'blast-premier', game: 'CS2', name: 'BLAST Premier', organizer: 'BLAST', color: '#FFC72C',
    description: 'The premier CS2 global circuit — Spring & Fall Finals plus the World Final',
    watchUrl: 'https://www.youtube.com/@BLASTPremier', liveUrl: 'https://www.twitch.tv/blast_premier_show' },
  { id: 'pgl-major', game: 'CS2', name: 'PGL Major', organizer: 'PGL', color: '#E85912',
    description: 'The flagship CS2 Major with $1.25M prize pool and 24 invited teams',
    watchUrl: 'https://www.youtube.com/@PGLtv', liveUrl: 'https://www.twitch.tv/pgl_cs2' },
  { id: 'iem', game: 'CS2', name: 'IEM (Intel Extreme Masters)', organizer: 'ESL Gaming', color: '#00B4D8',
    description: "The world's longest-running esports circuit — Cologne, Katowice, Dallas",
    watchUrl: 'https://www.youtube.com/@ESLCS', liveUrl: 'https://www.twitch.tv/esl_csgo' },
  // Valorant
  { id: 'vct-champions', game: 'Valorant', name: 'VCT Champions', organizer: 'Riot Games', color: '#FF4655',
    description: 'The annual Valorant World Championship — the biggest prize in the game',
    watchUrl: 'https://www.youtube.com/@ValorantChampionsTour', liveUrl: 'https://www.twitch.tv/valorant' },
  { id: 'vct-masters', game: 'Valorant', name: 'VCT Masters', organizer: 'Riot Games', color: '#A970FF',
    description: 'The mid-season Valorant international — East vs West',
    watchUrl: 'https://www.youtube.com/@ValorantChampionsTour', liveUrl: 'https://www.twitch.tv/valorant' },
  { id: 'vct-lock-in', game: 'Valorant', name: 'VCT Lock//In', organizer: 'Riot Games', color: '#00C4B4',
    description: 'Opening season international with all 30 partnered teams competing',
    watchUrl: 'https://www.youtube.com/@ValorantChampionsTour', liveUrl: 'https://www.twitch.tv/valorant' },
  // League of Legends
  { id: 'lol-worlds', game: 'League of Legends', name: 'World Championship', organizer: 'Riot Games', color: '#C69B3A',
    description: 'The LoL World Championship — the biggest annual event in esports',
    watchUrl: 'https://www.youtube.com/@lolEsports', liveUrl: 'https://www.twitch.tv/riotgames' },
  { id: 'lol-msi', game: 'League of Legends', name: 'Mid-Season Invitational', organizer: 'Riot Games', color: '#DB4446',
    description: 'Annual inter-regional LoL tournament — best of each region in May',
    watchUrl: 'https://www.youtube.com/@lolEsports', liveUrl: 'https://www.twitch.tv/riotgames' },
  { id: 'lck', game: 'League of Legends', name: 'LCK (Korea)', organizer: 'LCK', color: '#00B4D8',
    description: 'Korea\'s premier LoL league — most consistently the strongest region in the world',
    watchUrl: 'https://www.youtube.com/@lck', liveUrl: 'https://www.twitch.tv/lck' },
  // Dota 2
  { id: 'the-international', game: 'Dota 2', name: 'The International', organizer: 'Valve', color: '#A970FF',
    description: 'Dota 2\'s annual championship — holder of the largest prize pools in esports history',
    watchUrl: 'https://www.youtube.com/@dota2', liveUrl: 'https://www.twitch.tv/dota2ti' },
  { id: 'dpc-majors', game: 'Dota 2', name: 'DPC Major Tournaments', organizer: 'Valve/ESL/PGL', color: '#4A90D9',
    description: 'The Dota Pro Circuit regional qualifiers and international Majors leading to TI',
    watchUrl: 'https://www.youtube.com/@dota2', liveUrl: 'https://www.twitch.tv/dota2' },
  // Apex Legends
  { id: 'algs-championship', game: 'Apex Legends', name: 'ALGS Championship', organizer: 'Electronic Arts', color: '#FF8C00',
    description: 'The Apex Legends Global Series Championship — the biggest annual ALGS event',
    watchUrl: 'https://www.youtube.com/@EAPlayPro', liveUrl: 'https://www.twitch.tv/playapex' },
  { id: 'algs-majors', game: 'Apex Legends', name: 'ALGS Major', organizer: 'Electronic Arts', color: '#C69B3A',
    description: 'ALGS Pro League Season Majors held globally throughout the year',
    watchUrl: 'https://www.youtube.com/@EAPlayPro', liveUrl: 'https://www.twitch.tv/playapex' },
  // Rocket League
  { id: 'rlcs-worlds', game: 'Rocket League', name: 'RLCS World Championship', organizer: 'Psyonix / Epic', color: '#00C4B4',
    description: 'The Rocket League Championship Series annual World Championship',
    watchUrl: 'https://www.youtube.com/@RocketLeagueEsports', liveUrl: 'https://www.twitch.tv/rocketleague' },
  { id: 'rlcs-majors', game: 'Rocket League', name: 'RLCS Majors', organizer: 'Psyonix / Epic', color: '#6DC5F3',
    description: 'Regional Majors across NA, EU, SAM, MENA, OCE, APAC throughout the season',
    watchUrl: 'https://www.youtube.com/@RocketLeagueEsports', liveUrl: 'https://www.twitch.tv/rocketleague' },
  // Fortnite
  { id: 'fncs', game: 'Fortnite', name: 'Fortnite Champion Series', organizer: 'Epic Games', color: '#A970FF',
    description: 'The official Fortnite competitive circuit featuring Solos, Duos, and Trios formats',
    watchUrl: 'https://www.youtube.com/@Fortnite', liveUrl: 'https://www.twitch.tv/fortnitegame' },
  { id: 'fwc', game: 'Fortnite', name: 'Fortnite World Cup', organizer: 'Epic Games', color: '#FFC72C',
    description: 'The Fortnite World Cup — the landmark event with $30M total prize pool',
    watchUrl: 'https://www.youtube.com/results?search_query=fortnite+world+cup+final+official', liveUrl: 'https://www.twitch.tv/fortnitegame' },
];

// ── LoL Worlds Opening Ceremonies ───────────────────────────────────────────

export interface LolWorldsOpen {
  year: number;
  anthem: string;
  artist: string;
  location: string;
  winner: string;
  watchUrl: string;
  color: string;
}

export const LOL_WORLDS_OPENS: LolWorldsOpen[] = [
  { year: 2024, anthem: 'Heavy Is The Crown', artist: 'Linkin Park', location: 'The O2, London, UK',
    winner: 'T1', color: '#DB4446',
    watchUrl: 'https://www.youtube.com/results?search_query=league+of+legends+worlds+2024+opening+ceremony+heavy+is+the+crown+linkin+park' },
  { year: 2023, anthem: 'GODS', artist: 'NewJeans', location: 'Gocheok Sky Dome, Seoul, South Korea',
    winner: 'T1', color: '#C69B3A',
    watchUrl: 'https://www.youtube.com/results?search_query=league+of+legends+worlds+2023+opening+ceremony+gods+newjeans+official' },
  { year: 2022, anthem: 'Star Walking', artist: 'Nicki Minaj', location: 'Chase Center, San Francisco, USA',
    winner: 'DRX', color: '#00B4D8',
    watchUrl: 'https://www.youtube.com/results?search_query=league+of+legends+worlds+2022+opening+ceremony+star+walking+nicki+minaj' },
  { year: 2021, anthem: 'Enemy', artist: 'Imagine Dragons & JID', location: 'Reykjavík, Iceland',
    winner: 'EDward Gaming', color: '#A970FF',
    watchUrl: 'https://www.youtube.com/results?search_query=league+of+legends+worlds+2021+opening+ceremony+enemy+imagine+dragons' },
  { year: 2020, anthem: 'Take Over', artist: 'Jeremy McKinnon, Henry Lau & Against The Current', location: 'Pudong Football Stadium, Shanghai, China',
    winner: 'DAMWON Gaming', color: '#FFC72C',
    watchUrl: 'https://www.youtube.com/results?search_query=league+of+legends+worlds+2020+opening+ceremony+take+over+official' },
  { year: 2019, anthem: 'GIANTS', artist: 'True Damage', location: 'AccorHotels Arena, Paris, France',
    winner: 'FunPlus Phoenix', color: '#00C4B4',
    watchUrl: 'https://www.youtube.com/results?search_query=league+of+legends+worlds+2019+opening+ceremony+giants+true+damage' },
  { year: 2018, anthem: 'POP/STARS', artist: 'K/DA', location: 'Munhak Stadium, Incheon & Busan, South Korea',
    winner: 'Invictus Gaming', color: '#FF4655',
    watchUrl: 'https://www.youtube.com/results?search_query=league+of+legends+worlds+2018+opening+ceremony+pop+stars+kda+official' },
  { year: 2017, anthem: 'Legends Never Die', artist: 'Against The Current', location: 'National Stadium (Bird\'s Nest), Beijing, China',
    winner: 'Samsung Galaxy', color: '#4A90D9',
    watchUrl: 'https://www.youtube.com/results?search_query=league+of+legends+worlds+2017+opening+ceremony+legends+never+die' },
  { year: 2016, anthem: 'Ignite', artist: 'Zedd', location: 'Staples Center, Los Angeles & Madison Square Garden, NYC',
    winner: 'SKT T1', color: '#FF8C00',
    watchUrl: 'https://www.youtube.com/results?search_query=league+of+legends+worlds+2016+opening+ceremony+ignite+zedd' },
  { year: 2015, anthem: 'Warriors', artist: 'Imagine Dragons', location: 'Brussels / London Wembley Arena / Berlin Velodrom',
    winner: 'SKT T1', color: '#6DC5F3',
    watchUrl: 'https://www.youtube.com/results?search_query=league+of+legends+worlds+2015+opening+ceremony+warriors+imagine+dragons' },
  { year: 2014, anthem: 'Warriors (Live Debut)', artist: 'Imagine Dragons', location: 'Seoul World Cup Stadium, Seoul, South Korea',
    winner: 'Samsung White', color: '#C8C8C8',
    watchUrl: 'https://www.youtube.com/results?search_query=league+of+legends+worlds+2014+opening+ceremony+imagine+dragons+warriors+live' },
  { year: 2013, anthem: 'Worlds 2013 Theme', artist: 'Imagine Dragons (Live)', location: 'Staples Center, Los Angeles, USA',
    winner: 'SKT T1', color: '#E85912',
    watchUrl: 'https://www.youtube.com/results?search_query=league+of+legends+worlds+2013+opening+ceremony+staples+center' },
  { year: 2012, anthem: 'Worlds 2012 Theme', artist: 'Various Artists', location: 'USC Galen Center, Los Angeles, USA',
    winner: 'Taipei Assassins', color: '#FF5500',
    watchUrl: 'https://www.youtube.com/results?search_query=league+of+legends+season+2+world+championship+2012+opening+ceremony' },
];

export async function fetchEsportsNews(): Promise<any[]> {
  const key = 'esports:news';
  const cached = fromCache(key, TTL.news);
  if (cached) return cached;

  // Try ESPN esports news first
  const espnEsports = await safeFetch('https://site.api.espn.com/apis/site/v2/sports/esports/news?limit=20');
  const espnArticles: any[] = espnEsports?.articles ?? [];

  if (espnArticles.length > 0) {
    toCache(key, espnArticles);
    return espnArticles;
  }

  // ESPN esports endpoint is unreliable — fall back to dedicated esports RSS feeds
  try {
    const { fetchNewsFromRSS } = await import('./rssService');
    const rssItems = await fetchNewsFromRSS('SPORTS_ESPORTS');
    // Normalize to ESPN article shape so existing renderer works
    const articles = rssItems.map((item: any) => ({
      headline: item.title,
      title:    item.title,
      published: item.timestamp || new Date().toISOString(),
      links: { web: { href: item.url || item.link || '' } },
      images: item.imageUrl ? [{ url: item.imageUrl }] : [],
      source: item.source,
      description: item.content || item.description || '',
    }));
    toCache(key, articles);
    return articles;
  } catch {
    return [];
  }
}

// ── World Cup News ───────────────────────────────────────────────────────────
export async function fetchWorldCupNews(): Promise<any[]> {
  const key = 'wc2026:news';
  const c = fromCache(key, TTL.news);
  if (c) return c;

  // Try multiple ESPN soccer endpoints in parallel
  const [wcData, soccerData, qualData] = await Promise.all([
    safeFetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/news?limit=20`),
    safeFetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/news?limit=30`),
    safeFetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.worldq/news?limit=10`),
  ]);

  const wcArticles: any[]     = wcData?.articles     ?? [];
  const soccerArticles: any[] = soccerData?.articles ?? [];
  const qualArticles: any[]   = qualData?.articles   ?? [];

  // Merge, deduplicate by id
  const seen = new Set<string>();
  const all: any[] = [];
  for (const art of [...wcArticles, ...qualArticles, ...soccerArticles]) {
    const key = art.id || art.links?.web?.href || art.headline;
    if (key && !seen.has(key)) { seen.add(key); all.push(art); }
  }

  if (all.length > 0) {
    toCache(key, all);
    return all;
  }

  // ESPN returned nothing — fall back to RSS soccer feeds (Guardian, BBC)
  try {
    const { fetchNewsFromRSS } = await import('./rssService');
    const rssItems = await fetchNewsFromRSS('SPORTS_FIFA_WC');
    const articles = rssItems.map((item: any) => ({
      headline:  item.title,
      published: item.pubDate || new Date().toISOString(),
      links:     { web: { href: item.url || item.link || '' } },
      images:    item.imageUrl ? [{ url: item.imageUrl }] : [],
      source:    item.source || 'Soccer News',
      description: item.summary || item.content || '',
    }));
    if (articles.length > 0) toCache(key, articles);
    return articles;
  } catch {
    return [];
  }
}

// ── TheSportsDB soccer helpers (no key required, free tier) ─────────────────
// These are defined before the TSDB const at line ~258 to keep them together
// with the league functions; the TSDB const is declared later but hoisted as a const.

async function fetchSoccerTeamsFromTSDB(tab: string): Promise<SportsTeam[]> {
  const cfg = TSDB_SOCCER[tab];
  if (!cfg) return [];
  const key = `tsdb:soccer:teams:${tab}`;
  const c = fromCache(key, TTL.teams);
  if (c !== null) return c;

  // TSDB endpoint: search_all_teams by league name
  const data = await safeFetch(
    `https://www.thesportsdb.com/api/v1/json/3/search_all_teams.php?l=${encodeURIComponent(cfg.leagueName)}`
  );
  const rawTeams: any[] = data?.teams ?? [];
  if (rawTeams.length === 0) return [];

  const teams: SportsTeam[] = rawTeams.map((t: any) => ({
    id:           t.idTeam,
    name:         t.strTeam || '',
    abbreviation: t.strTeamShort || t.strAlternate || (t.strTeam || '').substring(0, 3).toUpperCase(),
    location:     t.strCity || t.strCountry || '',
    nickname:     t.strTeam || '',
    logo:         t.strTeamBadge || t.strTeamLogo || '',
    color:        '#1a1a1a',
    altColor:     '#ffffff',
    record:       '',
    tsdbId:       t.idTeam,
  }));

  toCache(key, teams);
  return teams;
}

async function fetchSoccerStandingsFromTSDB(tab: string): Promise<any[]> {
  const cfg = TSDB_SOCCER[tab];
  if (!cfg) return [];
  const key = `tsdb:soccer:standings:${tab}`;
  const c = fromCache(key, TTL.standings);
  if (c !== null) return c;

  const season = new Date().getFullYear().toString();
  const data = await safeFetch(
    `https://www.thesportsdb.com/api/v1/json/3/lookuptable.php?l=${cfg.leagueId}&s=${season}`
  );
  const table: any[] = data?.table ?? [];
  if (table.length === 0) return [];

  // Wrap in ESPN-compatible structure so the existing standings renderer works
  const entries = table.map((row: any) => ({
    team: {
      id:           row.idTeam,
      displayName:  row.strTeam,
      abbreviation: (row.strTeam || '').substring(0, 3).toUpperCase(),
      logos: row.strBadge ? [{ href: row.strBadge }] : [],
    },
    stats: [
      { name: 'wins',             value: Number(row.intWin   ?? 0), displayValue: row.intWin   ?? '0' },
      { name: 'losses',           value: Number(row.intLoss  ?? 0), displayValue: row.intLoss  ?? '0' },
      { name: 'ties',             value: Number(row.intDraw  ?? 0), displayValue: row.intDraw  ?? '0' },
      { name: 'points',           value: Number(row.intPoints ?? 0), displayValue: row.intPoints ?? '0' },
      { name: 'goalsFor',         value: Number(row.intGoalsFor ?? 0), displayValue: row.intGoalsFor ?? '0' },
      { name: 'goalsAgainst',     value: Number(row.intGoalsAgainst ?? 0), displayValue: row.intGoalsAgainst ?? '0' },
      { name: 'pointDifferential',value: Number(row.intGoalDifference ?? 0), displayValue: row.intGoalDifference ?? '0' },
      { name: 'gamesPlayed',      value: Number(row.intPlayed ?? 0), displayValue: row.intPlayed ?? '0' },
      { name: 'rank',             value: Number(row.intRank  ?? 0), displayValue: row.intRank  ?? '0' },
    ],
  }));

  const groups = [{ name: cfg.leagueName, standings: { entries } }];
  toCache(key, groups);
  return groups;
}

/** FIFA tab — show the live World Cup from ESPN's fifa.world scoreboard while the
 *  tournament is on (verified: returns the in-progress matches), and fall back to
 *  the global top-flight soccer feed (TheSportsDB) off-tournament. ESPN events are
 *  already in the shape the ScoreCard renderer expects. */
async function fetchFifaWorldCupScores(): Promise<any[]> {
  const key = 'espn:fifa.world:scores';
  const c = fromCache(key, TTL.scores);
  if (c !== null) return c;
  const wc = await safeFetch(`${ESPN}/soccer/fifa.world/scoreboard`);
  const wcEvents: any[] = wc?.events ?? [];
  if (wcEvents.length) {
    toCache(key, wcEvents);
    writeSportsKnowledge('sports_league_scores', makeSportsDocId('FIFA', 'current'), wcEvents, [
      sportsSource('ESPN', `${ESPN}/soccer/fifa.world/scoreboard`, 'FIFA World Cup live scoreboard'),
    ], ['sports', 'FIFA', 'scores', 'live', 'worldcup'], 'HIGH').catch(() => {});
    return wcEvents;
  }
  return fetchSoccerScoresFromTSDB('FIFA');
}

/** FIFA tab teams — the 48 World Cup nations from ESPN (badges, colours), not
 *  Premier League clubs. Returns the SportsTeam shape the grid renders. */
async function fetchFifaWorldCupTeams(): Promise<SportsTeam[]> {
  const key = 'espn:fifa.world:teams';
  const c = fromCache(key, TTL.teams);
  if (c !== null) return c;
  const data = await safeFetch(`${ESPN}/soccer/fifa.world/teams?limit=99`);
  const raw: any[] = data?.sports?.[0]?.leagues?.[0]?.teams ?? [];
  if (raw.length === 0) return [];
  const teams: SportsTeam[] = raw.map(({ team: t }: any) => ({
    id:           String(t.id),
    name:         t.displayName || t.name || '',
    abbreviation: t.abbreviation || (t.displayName || '').substring(0, 3).toUpperCase(),
    location:     t.location || t.displayName || '',
    nickname:     t.name || t.displayName || '',
    logo:         t.logos?.[0]?.href || '',
    color:        t.color ? `#${t.color}` : '#1a1a1a',
    altColor:     t.alternateColor ? `#${t.alternateColor}` : '#ffffff',
    record:       '',
  }));
  teams.sort((a, b) => a.name.localeCompare(b.name));
  toCache(key, teams);
  return teams;
}

/** FIFA tab standings — the live World Cup group tables from ESPN, normalised to
 *  the stat names the standings renderer already understands. */
async function fetchFifaWorldCupStandings(): Promise<any[]> {
  const key = 'espn:fifa.world:standings';
  const c = fromCache(key, TTL.standings);
  if (c !== null) return c;
  const data = await safeFetch(`https://site.api.espn.com/apis/v2/sports/soccer/fifa.world/standings`);
  const children: any[] = data?.children ?? [];
  if (children.length === 0) return [];
  const stat = (row: any, name: string) =>
    row.stats?.find((s: any) => s.name === name)?.value ?? 0;
  const groups = children.map((g: any) => {
    const entries = (g.standings?.entries ?? []).map((row: any) => ({
      team: {
        id:           row.team?.id,
        displayName:  row.team?.displayName,
        abbreviation: row.team?.abbreviation || (row.team?.displayName || '').substring(0, 3).toUpperCase(),
        logos:        row.team?.logos ?? [],
      },
      stats: [
        { name: 'wins',              value: stat(row, 'wins'),             displayValue: String(stat(row, 'wins')) },
        { name: 'losses',            value: stat(row, 'losses'),           displayValue: String(stat(row, 'losses')) },
        { name: 'ties',              value: stat(row, 'ties'),             displayValue: String(stat(row, 'ties')) },
        { name: 'points',            value: stat(row, 'points'),           displayValue: String(stat(row, 'points')) },
        { name: 'goalsFor',          value: stat(row, 'pointsFor'),        displayValue: String(stat(row, 'pointsFor')) },
        { name: 'goalsAgainst',      value: stat(row, 'pointsAgainst'),    displayValue: String(stat(row, 'pointsAgainst')) },
        { name: 'pointDifferential', value: stat(row, 'pointDifferential'),displayValue: String(stat(row, 'pointDifferential')) },
        { name: 'gamesPlayed',       value: stat(row, 'gamesPlayed'),      displayValue: String(stat(row, 'gamesPlayed')) },
        { name: 'rank',              value: stat(row, 'rank'),             displayValue: String(stat(row, 'rank')) },
      ],
    }));
    return { name: g.name || 'Group', standings: { entries } };
  });
  toCache(key, groups);
  return groups;
}

// ---------- FIFA World Cup nation depth (roster / schedule / legends) --------

/** Wikipedia thumbnail for a page slug (photos for legends etc.). */
async function fetchWikiThumb(slug: string): Promise<string> {
  const key = `wikithumb:${slug}`;
  const c = fromCache(key, TTL.teams);
  if (c !== null) return c;
  const data = await safeFetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`);
  const thumb = data?.originalimage?.source || data?.thumbnail?.source || '';
  toCache(key, thumb);
  return thumb;
}

/** Map a live ESPN World Cup squad into the roster shape TeamPageView renders. */
function squadToRoster(squad: SquadPlayer[]): { group: string; athletes: any[] }[] {
  const groups: { key: string; label: string }[] = [
    { key: 'GK', label: 'Goalkeepers' }, { key: 'DEF', label: 'Defenders' },
    { key: 'MID', label: 'Midfielders' }, { key: 'FWD', label: 'Forwards' },
  ];
  return groups.map(g => ({
    group: g.label,
    athletes: squad.filter(p => p.group === g.key).map(p => ({
      id: p.id,
      fullName: p.name,
      displayName: p.name,
      jersey: p.jersey,
      headshot: p.headshot ? { href: p.headshot } : undefined,
      position: { displayName: p.posName, abbreviation: p.posAbbr },
      age: p.age,
      injured: p.injured,
    })),
  })).filter(g => g.athletes.length > 0);
}

/** All World Cup fixtures involving one nation (ESPN event shape), newest last. */
async function fetchWorldCupTeamEvents(espnId: string): Promise<any[]> {
  const key = `wc:teamevents:${espnId}`;
  const c = fromCache(key, TTL.scores);
  if (c !== null) return c;
  const fmt = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const end = new Date(); end.setDate(end.getDate() + 7);
  const data = await safeFetch(`${ESPN}/soccer/fifa.world/scoreboard?dates=20260611-${fmt(end)}`);
  const events: any[] = (data?.events ?? []).filter((ev: any) =>
    (ev?.competitions?.[0]?.competitors ?? []).some((cmp: any) => String(cmp?.team?.id) === String(espnId)),
  );
  toCache(key, events);
  return events;
}

/** Curated national-team legends, hydrated with Wikipedia photos. */
async function fetchNationLegends(nationName: string): Promise<LegendPlayer[]> {
  const seeds = legendsForNation(nationName);
  if (!seeds.length) return [];
  const thumbs = await Promise.all(seeds.map(s => fetchWikiThumb(s.wikiSlug).catch(() => '')));
  return seeds.map((s, i) => ({
    id:          s.wikiSlug,
    name:        s.name,
    position:    s.position,
    nationality: nationName,
    birthDate:   `${s.born}-07-01`,
    description: s.honors,
    thumb:       thumbs[i] || '',
  }));
}

/** FIFA national-team detail — real ESPN squad + schedule + curated legends +
 *  Wikipedia history, so clicking a World Cup nation is a full fan page. */
async function fetchFifaWorldCupRichTeamPage(
  espnId: string,
  fullName: string,
  cacheKey: string,
): Promise<RichTeamPage | null> {
  const [teamRes, wikiRes, squad, events, legends] = await Promise.all([
    safeFetch(`${ESPN}/soccer/fifa.world/teams/${espnId}`).catch(() => null),
    fetchWikiSummary(`${fullName} national football team`).catch(() => ''),
    fetchTeamSquad(espnId).catch(() => [] as SquadPlayer[]),
    fetchWorldCupTeamEvents(espnId).catch(() => [] as any[]),
    fetchNationLegends(fullName).catch(() => [] as LegendPlayer[]),
  ]);
  const t = teamRes?.team ?? null;
  const wikiText = wikiRes || '';

  const rich: RichTeamPage = {
    team: t ? {
      id:               String(t.id),
      displayName:      t.displayName || fullName,
      shortDisplayName: t.shortDisplayName || t.name || fullName,
      abbreviation:     t.abbreviation || (t.displayName || fullName).substring(0, 3).toUpperCase(),
      logos:            t.logos ?? [],
      color:            t.color || '1a1a1a',
      alternateColor:   t.alternateColor || 'ffffff',
      record:           { items: [] },
    } : null,
    news:        [],
    roster:      squadToRoster(squad),
    recentGames: events,
    description: wikiText || '',
    founded:     '',
    city:        t?.location || '',
    stadium:     '',
    fanart:      '',
    badge:       t?.logos?.[0]?.href || '',
    legends,
  };
  toCache(cacheKey, rich);
  return rich;
}

/** World Cup events across a window (recent results + live + upcoming) in one
 *  call, via ESPN's date-range scoreboard. Falls back to today's board. */
export async function fetchWorldCupWindow(daysBack = 3, daysFwd = 4): Promise<any[]> {
  const fmt = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const start = new Date(); start.setDate(start.getDate() - daysBack);
  const end = new Date(); end.setDate(end.getDate() + daysFwd);
  const range = `${fmt(start)}-${fmt(end)}`;
  const key = `espn:fifa.world:window:${range}`;
  const c = fromCache(key, TTL.scores);
  if (c !== null) return c;
  const data = await safeFetch(`${ESPN}/soccer/fifa.world/scoreboard?dates=${range}`);
  const events: any[] = data?.events ?? [];
  if (events.length) { toCache(key, events); return events; }
  // Fallback to today's board if the ranged call comes back empty.
  return fetchFifaWorldCupScores();
}

/** Play-by-play / commentary for one soccer match (ESPN summary). Newest first. */
export async function fetchSoccerSummary(eventId: string, league = 'fifa.world'): Promise<{ time: string; text: string }[]> {
  if (!eventId) return [];
  const key = `espn:soccer:summary:${eventId}`;
  const c = fromCache(key, TTL.scores);
  if (c !== null) return c;
  const data = await safeFetch(`${ESPN_WEB}/site/v2/sports/soccer/${league}/summary?event=${eventId}`);
  const commentary: any[] = data?.commentary ?? [];
  const plays = commentary
    .map((p: any) => ({ time: p?.time?.displayValue || p?.clock?.displayValue || '', text: p?.text || '' }))
    .filter((p: any) => p.text)
    .reverse(); // newest first
  toCache(key, plays);
  return plays;
}

async function fetchSoccerScoresFromTSDB(tab: string): Promise<any[]> {
  const cfg = TSDB_SOCCER[tab];
  if (!cfg) return [];
  const key = `tsdb:soccer:scores:${tab}`;
  const c = fromCache(key, TTL.scores);
  if (c !== null) return c;

  // Get next + last 5 events for a live-ish scoreboard
  const [nextData, pastData] = await Promise.allSettled([
    safeFetch(`https://www.thesportsdb.com/api/v1/json/3/eventsnextleague.php?id=${cfg.leagueId}`),
    safeFetch(`https://www.thesportsdb.com/api/v1/json/3/eventspastleague.php?id=${cfg.leagueId}`),
  ]);

  const nextEvents: any[] = nextData.status === 'fulfilled' ? (nextData.value?.events ?? []) : [];
  const pastEvents: any[] = pastData.status === 'fulfilled' ? (pastData.value?.events ?? []) : [];
  const combined = [...nextEvents.slice(0, 8), ...pastEvents.slice(0, 5)];

  // Map to ESPN scoreboard event shape so the existing ScoreCard renderer works
  const events = combined.map((e: any) => {
    const isCompleted = !!(e.intHomeScore !== null && e.intHomeScore !== '');
    return {
      id: e.idEvent,
      name: e.strEvent || `${e.strHomeTeam} vs ${e.strAwayTeam}`,
      shortName: `${(e.strHomeTeam || '').substring(0, 3).toUpperCase()} vs ${(e.strAwayTeam || '').substring(0, 3).toUpperCase()}`,
      date: `${e.dateEvent || ''}T${e.strTime || '00:00:00'}Z`,
      status: { type: { state: isCompleted ? 'post' : 'pre', completed: isCompleted, description: isCompleted ? 'Final' : (e.strTime || 'TBD') } },
      competitions: [{
        competitors: [
          {
            id: e.idHomeTeam || '1',
            homeAway: 'home',
            score: String(e.intHomeScore ?? ''),
            team: { displayName: e.strHomeTeam || '', logos: e.strHomeTeamBadge ? [{ href: e.strHomeTeamBadge }] : [], color: '1a1a1a', alternateColor: 'ffffff' },
          },
          {
            id: e.idAwayTeam || '2',
            homeAway: 'away',
            score: String(e.intAwayScore ?? ''),
            team: { displayName: e.strAwayTeam || '', logos: e.strAwayTeamBadge ? [{ href: e.strAwayTeamBadge }] : [], color: '1a1a1a', alternateColor: 'ffffff' },
          },
        ],
        venue: { fullName: e.strVenue || '', address: { city: e.strCity || '' } },
      }],
    };
  });

  toCache(key, events);
  return events;
}

// ---------- types ----------------------------------------------------------
export interface SportsTeam {
  id: string;
  name: string;
  abbreviation: string;
  location: string;
  nickname: string;
  logo: string;
  color: string;
  altColor: string;
  record: string;        // e.g. "48-34"
  standingsRank?: number;
}

export interface TeamPageData {
  team: any;
  news: any[];
  roster: { group: string; athletes: any[] }[];
  recentGames: any[];
}

// ---------- teams list -----------------------------------------------------
export async function fetchLeagueTeams(tab: string): Promise<SportsTeam[]> {
  if (getSpecialtySportCfg(tab)) return [];
  const stored = await readSportsKnowledge<SportsTeam[]>('sports_league_teams', makeSportsDocId(tab), TTL.teams);
  // FIFA tab = the 48 World Cup nations from ESPN; MLS still via TheSportsDB
  if (tab === 'FIFA') {
    const teams = await fetchFifaWorldCupTeams();
    return teams.length ? teams : (stored?.data || []);
  }
  if (tab === 'MLS') {
    const teams = await fetchSoccerTeamsFromTSDB(tab);
    return teams.length ? teams : (stored?.data || []);
  }

  const cfg = getLeagueCfg(tab);
  if (!cfg) return [];
  const key = `teams:${tab}`;
  const cached = fromCache(key, TTL.teams);
  if (cached) return cached;

  const sourceUrl = `${ESPN}/${cfg.sport}/${cfg.league}/teams?limit=50`;
  const data = await safeFetch(sourceUrl);
  if (!data?.sports?.[0]?.leagues?.[0]?.teams) return stored?.data || [];

  const teams: SportsTeam[] = data.sports[0].leagues[0].teams.map((t: any) => {
    const tm = t.team;
    return {
      id: String(tm.id),
      name: tm.displayName || tm.name || '',
      abbreviation: tm.abbreviation || '',
      location: tm.location || '',
      nickname: tm.nickname || '',
      logo: tm.logos?.[0]?.href || `https://a.espncdn.com/i/teamlogos/${cfg.league}/500/${(tm.abbreviation || '').toLowerCase()}.png`,
      color: `#${tm.color || '333333'}`,
      altColor: `#${tm.alternateColor || 'ffffff'}`,
      record: tm.record?.items?.[0]?.summary || '',
    };
  });

  toCache(key, teams);
  writeSportsKnowledge('sports_league_teams', makeSportsDocId(tab), teams, [
    sportsSource('ESPN', sourceUrl, `${tab} teams`),
  ], ['sports', tab, 'teams'], 'HIGH').catch(() => {});
  writeSportsKnowledgeBatch('sports_team_pages', teams, team => makeSportsDocId(tab, team.id), [
    sportsSource('ESPN', sourceUrl, `${tab} team index`),
  ], ['sports', tab, 'team'], 'MEDIUM').catch(() => {});
  return teams;
}

// ---------- league news (ESPN native JSON) ---------------------------------
export async function fetchLeagueNews(tab: string): Promise<any[]> {
  if (getSpecialtySportCfg(tab)) return fetchSpecialtySportsNews(tab);
  const stored = await readSportsKnowledge<any[]>('sports_league_news', makeSportsDocId(tab), TTL.news);
  const key = `news:${tab}`;
  const cached = fromCache(key, TTL.news);
  if (cached) return cached;

  // Soccer tabs route to the appropriate ESPN soccer feed
  const soccerCfg = TSDB_SOCCER[tab];
  const espnPath = soccerCfg
    ? `${ESPN}/${soccerCfg.espnNews}/news?limit=25`
    : (() => { const cfg = getLeagueCfg(tab); return cfg ? `${ESPN}/${cfg.sport}/${cfg.league}/news?limit=25` : null; })();
  if (!espnPath) return [];

  const data = await safeFetch(espnPath);
  const articles = data?.articles ?? stored?.data ?? [];
  toCache(key, articles);
  if (articles.length) {
    writeSportsKnowledge('sports_league_news', makeSportsDocId(tab), articles, [
      sportsSource('ESPN', espnPath, `${tab} news`),
    ], ['sports', tab, 'news'], 'MEDIUM').catch(() => {});
  }
  return articles;
}

// ---------- league scoreboard (scores) ------------------------------------
export async function fetchLeagueScores(tab: string): Promise<any[]> {
  if (getSpecialtySportCfg(tab)) return fetchSpecialtySportsScores(tab);
  const stored = await readSportsKnowledge<any[]>('sports_league_scores', makeSportsDocId(tab, 'current'), TTL.scores);
  if (tab === 'FIFA') return fetchFifaWorldCupScores();
  if (tab === 'MLS') return fetchSoccerScoresFromTSDB(tab);

  const cfg = getLeagueCfg(tab);
  if (!cfg) return [];
  const key = `scores:${tab}`;
  const cached = fromCache(key, TTL.scores);
  if (cached) return cached;

  const sourceUrl = `${ESPN}/${cfg.sport}/${cfg.league}/scoreboard`;
  const data = await safeFetch(sourceUrl);
  const events = data?.events ?? stored?.data ?? [];
  toCache(key, events);
  if (events.length) {
    writeSportsKnowledge('sports_league_scores', makeSportsDocId(tab, 'current'), events, [
      sportsSource('ESPN', sourceUrl, `${tab} current scoreboard`),
    ], ['sports', tab, 'scores', 'live'], 'HIGH').catch(() => {});
  }
  return events;
}

// ---------- standings ------------------------------------------------------
export async function fetchLeagueStandings(tab: string): Promise<any[]> {
  if (getSpecialtySportCfg(tab)) return [];
  const stored = await readSportsKnowledge<any[]>('sports_league_standings', makeSportsDocId(tab, new Date().getFullYear()), TTL.standings);
  if (tab === 'FIFA') return fetchFifaWorldCupStandings();
  if (tab === 'MLS') return fetchSoccerStandingsFromTSDB(tab);

  const cfg = getLeagueCfg(tab);
  if (!cfg) return [];
  const key = `standings:${tab}`;
  const cached = fromCache(key, TTL.standings);
  if (cached) return cached;

  // site.api.espn.com no longer returns standings entries — site.web.api still does
  const sourceUrl = `${ESPN_WEB}/v2/sports/${cfg.sport}/${cfg.league}/standings`;
  const data = await safeFetch(sourceUrl);
  // ESPN standings: data.children = [ { name: 'Eastern', standings: { entries: [] } } ]
  const groups = data?.children ?? (data?.standings?.entries ? [data] : stored?.data ?? []);
  toCache(key, groups);
  if (groups.length) {
    writeSportsKnowledge('sports_league_standings', makeSportsDocId(tab, new Date().getFullYear()), groups, [
      sportsSource('ESPN', sourceUrl, `${tab} standings`),
    ], ['sports', tab, 'standings'], 'HIGH').catch(() => {});
  }
  return groups;
}

// ESPN returns roster as grouped `{ position: string, items: athlete[] }[]` — check items first
function parseRosterAthletes(rawAthletes: any[]): { group: string; athletes: any[] }[] {
  if (!Array.isArray(rawAthletes) || rawAthletes.length === 0) return [];
  if (rawAthletes[0]?.items) {
    return rawAthletes.map((g: any) => ({ group: g.position || g.name || '', athletes: g.items || [] }));
  }
  if (rawAthletes[0]?.id || rawAthletes[0]?.displayName) {
    const grouped: Record<string, any[]> = {};
    rawAthletes.forEach((a: any) => {
      const pos = a.position?.abbreviation || a.position?.name || 'Other';
      if (!grouped[pos]) grouped[pos] = [];
      grouped[pos].push(a);
    });
    return Object.entries(grouped).map(([group, athletes]) => ({ group, athletes }));
  }
  return [];
}

// ---------- team page: news + roster + recent games -----------------------
export async function fetchTeamPage(tab: string, teamId: string): Promise<TeamPageData | null> {
  const cfg = getLeagueCfg(tab);
  if (!cfg) return null;
  const resolvedTeamId = await resolveEspnTeamId(tab, teamId);
  const key = `teampage:${tab}:${resolvedTeamId}`;
  const cached = fromCache(key, TTL.roster);
  if (cached) return cached;
  const stored = await readSportsKnowledge<TeamPageData>('sports_team_pages', makeSportsDocId(tab, resolvedTeamId), TTL.roster);

  const base = `${ESPN}/${cfg.sport}/${cfg.league}/teams/${resolvedTeamId}`;

  const [teamRes, newsRes, rosterRes, scoresRes] = await Promise.allSettled([
    safeFetch(`${base}?enable=roster,record,stats`),
    safeFetch(`${ESPN}/${cfg.sport}/${cfg.league}/news?team=${resolvedTeamId}&limit=15`),
    safeFetch(`${base}/roster`),
    safeFetch(`${ESPN}/${cfg.sport}/${cfg.league}/teams/${resolvedTeamId}/schedule?season=${new Date().getFullYear()}&seasontype=2&limit=10`),
  ]);

  const teamData   = teamRes.status   === 'fulfilled' ? teamRes.value   : null;
  const newsData   = newsRes.status   === 'fulfilled' ? newsRes.value   : null;
  const rosterData = rosterRes.status === 'fulfilled' ? rosterRes.value : null;
  const scoresData = scoresRes.status === 'fulfilled' ? scoresRes.value : null;

  const rawAthletes: any[] = rosterData?.athletes ?? teamData?.team?.athletes ?? [];
  const roster = parseRosterAthletes(rawAthletes);

  const page: TeamPageData = {
    team: teamData?.team ?? stored?.data?.team ?? null,
    news: newsData?.articles ?? stored?.data?.news ?? [],
    roster: roster.length ? roster : (stored?.data?.roster ?? []),
    recentGames: scoresData?.events ?? stored?.data?.recentGames ?? [],
  };

  if (page.team || page.news.length > 0 || page.roster.length > 0) {
    toCache(key, page);
    writeSportsKnowledge('sports_team_pages', makeSportsDocId(tab, resolvedTeamId), page, [
      sportsSource('ESPN', base, `${tab} team page ${resolvedTeamId}`),
    ], ['sports', tab, 'team', resolvedTeamId], 'HIGH').catch(() => {});
    if (page.roster.length) {
      writeSportsKnowledge('sports_team_rosters', makeSportsDocId(tab, resolvedTeamId, new Date().getFullYear()), page.roster, [
        sportsSource('ESPN', `${base}/roster`, `${tab} roster ${resolvedTeamId}`),
      ], ['sports', tab, 'roster', resolvedTeamId], 'HIGH').catch(() => {});
    }
  }
  return page;
}

// ---------- prefetch all leagues (warms cache silently) -------------------
export function prefetchSports(): void {
  const tabs: LeagueTab[] = ['NBA', 'NFL', 'NHL', 'MLB', 'NCAA', 'WNBA', 'FIFA', 'MLS', 'UFC', 'BOXING', 'TENNIS', 'GOLF'];
  tabs.forEach((tab, i) => {
    setTimeout(() => {
      fetchLeagueTeams(tab).catch(() => {});
      fetchLeagueNews(tab).catch(() => {});
      fetchLeagueScores(tab).catch(() => {});
    }, i * 350);
  });
}

// ---------- TheSportsDB (free tier, no key required) ----------------------
const TSDB = 'https://www.thesportsdb.com/api/v1/json/3';

export interface LegendPlayer {
  id: string;
  name: string;
  position: string;
  nationality: string;
  birthDate: string;
  description: string;
  thumb: string;
}

export interface RichTeamPage extends TeamPageData {
  description: string;
  founded: string;
  city: string;
  stadium: string;
  fanart: string;
  badge: string;
  legends: LegendPlayer[];
}

// Maps ESPN tab → TSDB strSport value so we never mix basketball/soccer legends
const TSDB_SPORT: Record<string, string> = {
  NBA:  'Basketball',
  NFL:  'American Football',
  NHL:  'Ice Hockey',
  MLB:  'Baseball',
  NCAA: 'Basketball',
  FIFA: 'Soccer',
  MLS:  'Soccer',
};

// Static TSDB team ID fallback map (ESPN abbr → TSDB idTeam)
// Used when dynamic search fails. IDs verified from TSDB API.
// Static TSDB IDs verified by sequential lookupteam.php scan.
// Only confirmed IDs are included — unverified teams fall back to search_all_teams.
const TSDB_STATIC_IDS: Record<string, Record<string, string>> = {
  // NBA: IDs 134860-134885 confirmed by lookupteam.php scan
  NBA: {
    atl: '134880', bos: '134860', bkn: '134861', cha: '134881', chi: '134870',
    cle: '134871', dal: '134875', den: '134885', det: '134872', gs:  '134865',
    hou: '134876', ind: '134873', lac: '134866', lal: '134867', mem: '134877',
    mia: '134882', mil: '134874', no:  '134878', ny:  '134862', orl: '134883',
    phi: '134863', phx: '134868', sac: '134869', sa:  '134879', tor: '134864',
    wsh: '134884',
    // OKC, Portland, Utah, Minnesota IDs not confirmed — omitted to prevent wrong player data
  },
  // NFL: only confirmed IDs from search_all_teams + Cowboys direct lookup
  NFL: {
    ari: '134946', atl: '134942', dal: '134934',
  },
  // NHL + MLB: only confirmed from search_all_teams results
  NHL: { ana: '134846', bos: '134830' },
  MLB: { ari: '135267', oak: '135261' },
};

// Map ESPN tab → TSDB league name for search_all_teams
const TSDB_LEAGUE_NAME: Record<string, string> = {
  NBA:  'NBA',
  NFL:  'NFL',
  NHL:  'NHL',
  MLB:  'MLB',
  NCAA: 'NCAAB',
  FIFA: 'FIFA World Cup',
  MLS:  'Major League Soccer',
};

// Fetch all teams from TSDB by league, detecting pagination loops (free tier returns same 10 on every page)
async function fetchTSDBAllTeamsByLeague(tab: string): Promise<any[]> {
  const league = TSDB_LEAGUE_NAME[tab];
  if (!league) return [];
  const key = `tsdb:allteams:${tab}`;
  const c = fromCache(key, TTL.teams);
  if (c !== null) return c;
  const allTeams: any[] = [];
  const seenIds = new Set<string>();
  for (let p = 1; p <= 4; p++) {
    const data = await safeFetch(`${TSDB}/search_all_teams.php?l=${encodeURIComponent(league)}&p=${p}`);
    const batch: any[] = data?.teams ?? [];
    if (batch.length === 0) break;
    // Detect pagination loop — stop if we see duplicate IDs
    const newTeams = batch.filter(t => !seenIds.has(t.idTeam));
    if (newTeams.length === 0) break; // free tier looping, stop
    newTeams.forEach(t => seenIds.add(t.idTeam));
    allTeams.push(...newTeams);
    if (batch.length < 10) break;
  }
  toCache(key, allTeams);
  return allTeams;
}

async function fetchTheSportsDBTeamById(tsdbId: string): Promise<any | null> {
  const key = `tsdb:teambyid:${tsdbId}`;
  const c = fromCache(key, TTL.teams);
  if (c !== null) return c;
  const data = await safeFetch(`${TSDB}/lookupteam.php?id=${tsdbId}`);
  const team = data?.teams?.[0] ?? null;
  toCache(key, team);
  return team;
}

async function fetchTheSportsDBTeam(fullName: string, sport?: string, tab?: string, knownTsdbId?: string, espnAbbr?: string): Promise<any | null> {
  // Priority 1: known TSDB ID from static data (fastest, most reliable)
  if (knownTsdbId) {
    return fetchTheSportsDBTeamById(knownTsdbId);
  }

  // Priority 2: static ID map keyed by ESPN abbreviation
  if (tab && espnAbbr && TSDB_STATIC_IDS[tab]?.[espnAbbr]) {
    return fetchTheSportsDBTeamById(TSDB_STATIC_IDS[tab][espnAbbr]);
  }

  const key = `tsdb:team:${fullName}:${sport ?? ''}`;
  const c = fromCache(key, TTL.teams);
  if (c !== null) return c;

  const lc = fullName.toLowerCase();

  // Priority 3: search_all_teams by league (free tier returns up to 10 unique teams)
  if (tab && TSDB_LEAGUE_NAME[tab]) {
    const allTeams = await fetchTSDBAllTeamsByLeague(tab);
    const match = allTeams.find(t =>
      t.strTeam?.toLowerCase() === lc ||
      lc.includes(t.strTeam?.toLowerCase() ?? '') ||
      t.strTeam?.toLowerCase().includes(lc)
    ) ?? null;
    toCache(key, match);
    return match;
  }

  toCache(key, null);
  return null;
}

async function fetchTheSportsDBPlayers(tsdbTeamId: string): Promise<LegendPlayer[]> {
  const key = `tsdb:players:${tsdbTeamId}`;
  const c = fromCache(key, TTL.roster);
  if (c !== null) return c;
  const data = await safeFetch(`${TSDB}/lookup_all_players.php?id=${tsdbTeamId}`);
  const players: LegendPlayer[] = (data?.player ?? [])
    .filter((p: any) => p.strCutout || p.strThumb)
    .slice(0, 60)
    .map((p: any) => ({
      id: p.idPlayer,
      name: p.strPlayer,
      position: p.strPosition || '',
      nationality: p.strNationality || '',
      birthDate: p.dateBorn || '',
      description: (p.strDescriptionEN || '').substring(0, 300),
      thumb: p.strCutout || p.strThumb || '',
    }));
  toCache(key, players);
  return players;
}

async function fetchWikiSummary(title: string): Promise<string> {
  const key = `wiki:${title}`;
  const c = fromCache(key, TTL.teams);
  if (c !== null) return c;
  const id = makeSportsDocId(title);
  const stored = await readSportsKnowledge<{ title: string; extract: string; url?: string }>('sports_wikipedia_summaries', id);
  const sourceUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`;
  const data = await safeFetch(sourceUrl);
  const text = data?.extract ?? stored?.data?.extract ?? '';
  if (text) {
    writeSportsKnowledge('sports_wikipedia_summaries', id, {
      title: data?.title || title,
      extract: text,
      url: data?.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
    }, [
      sportsSource('Wikipedia', sourceUrl, `Wikipedia summary: ${title}`, 'Wikipedia REST summary; stored with source URL and retrieved timestamp for historical context.'),
    ], ['sports', 'wikipedia', title], 'MEDIUM').catch(() => {});
  }
  toCache(key, text);
  return text;
}

// ─── RACING SPORTS (F1 / NASCAR / IndyCar) ──────────────────────────────────

export type RacingTab = 'F1' | 'NASCAR' | 'INDYCAR';

const RACING: Record<RacingTab, { sport: string; league: string; label: string }> = {
  F1:      { sport: 'racing', league: 'f1',             label: 'Formula 1' },
  NASCAR:  { sport: 'racing', league: 'nascar-premier', label: 'NASCAR Cup' },  // ESPN retired the 'nascar-cup-series' slug
  INDYCAR: { sport: 'racing', league: 'irl',            label: 'IndyCar' },
};

export function getRacingCfg(tab: string) {
  return RACING[tab as RacingTab] ?? null;
}

export interface RaceEvent {
  id: string;
  name: string;
  shortName: string;
  date: string;
  venue: string;
  city: string;
  status: string; // 'pre' | 'in' | 'post'
  results: RaceResult[];
}

export interface RaceResult {
  pos: number;
  driverName: string;
  teamName: string;
  driverLogo: string;
  points?: number;
  time?: string;
  laps?: number;
}

export interface RacingStanding {
  rank: number;
  driverName: string;
  teamName: string;
  driverLogo: string;
  points: number;
  wins: number;
}

export async function fetchRacingSchedule(tab: string): Promise<RaceEvent[]> {
  const cfg = getRacingCfg(tab);
  if (!cfg) return [];
  const key = `racing:schedule:${tab}`;
  const c = fromCache(key, TTL.scores);
  if (c) return c;

  const data = await safeFetch(`${ESPN}/${cfg.sport}/${cfg.league}/scoreboard`);
  const events: RaceEvent[] = (data?.events ?? []).slice(0, 12).map((e: any) => {
    const comp = e.competitions?.[0];
    const competitors: any[] = comp?.competitors ?? [];
    const results: RaceResult[] = competitors
      .sort((a: any, b: any) => (a.order ?? 99) - (b.order ?? 99))
      .slice(0, 10)
      .map((c: any, i: number) => ({
        pos: statNum(c.order) || (i + 1),
        driverName: scoreText(c.athlete?.displayName ?? c.displayName) || 'Driver',
        teamName: scoreText(c.team?.displayName ?? c.team?.shortDisplayName),
        driverLogo: c.athlete?.headshot?.href ?? c.athlete?.flag?.href ?? '',
        points: statNum(c.statistics?.find((s: any) => s.name === 'points')?.value),
        // time can arrive as a string OR an ESPN {value,displayValue} object — coerce to a string.
        time: scoreText(c.time) || scoreText(c.statistics?.find((s: any) => s.name === 'time')?.displayValue),
        laps: statNum(c.laps),
      }));

    return {
      id: e.id,
      name: e.name ?? e.shortName ?? 'Race',
      shortName: e.shortName ?? e.name ?? 'Race',
      date: e.date ?? '',
      venue: comp?.venue?.fullName ?? '',
      city: [comp?.venue?.address?.city, comp?.venue?.address?.country].filter(Boolean).join(', '),
      status: e.status?.type?.state ?? 'pre',
      results,
    };
  });

  toCache(key, events);
  return events;
}

export async function fetchRacingStandings(tab: string): Promise<RacingStanding[]> {
  const cfg = getRacingCfg(tab);
  if (!cfg) return [];
  const key = `racing:standings:${tab}`;
  const c = fromCache(key, TTL.standings);
  if (c) return c;

  const data = await safeFetch(`${ESPN_WEB}/v2/sports/${cfg.sport}/${cfg.league}/standings`);
  const entries: any[] = data?.children?.[0]?.standings?.entries
    ?? data?.standings?.entries
    ?? [];

  const standings: RacingStanding[] = entries.slice(0, 20).map((e: any, i: number) => {
    const stats = e.stats ?? [];
    // ESPN stats arrive as number | string | {value,displayValue}; ALWAYS coerce to a number so a
    // stat object can never reach the UI as a raw React child (minified React #31 → whole-page crash).
    const get = (name: string): number => statNum(stats.find((s: any) => s.name === name)?.value);
    return {
      rank: get('rank') || (i + 1),
      driverName: scoreText(e.athlete?.displayName ?? e.team?.displayName) || `Driver ${i + 1}`,
      teamName: scoreText(e.team?.displayName ?? e.team?.shortDisplayName),
      driverLogo: e.athlete?.headshot?.href ?? '',
      points: get('points') || get('pointsFor') || get('championshipPts') || 0,
      wins: get('wins') || 0,
    };
  });

  toCache(key, standings);
  return standings;
}

export async function fetchRacingNews(tab: string): Promise<any[]> {
  const cfg = getRacingCfg(tab);
  if (!cfg) return [];
  const key = `racing:news:${tab}`;
  const c = fromCache(key, TTL.news);
  if (c) return c;

  const data = await safeFetch(`${ESPN}/${cfg.sport}/${cfg.league}/news?limit=20`);
  let articles = data?.articles ?? [];
  // ESPN's nascar-premier news feed is empty — fall back to motorsport RSS
  if (articles.length === 0) {
    try {
      const { fetchNewsFromRSS } = await import('./rssService');
      const rssCategory = tab === 'F1' ? 'SPORTS_F1' : tab === 'INDYCAR' ? 'SPORTS_INDYCAR' : 'SPORTS_NASCAR';
      const rss = await fetchNewsFromRSS(rssCategory);
      articles = rss.map((item: any) => normalizeArticle(item, cfg.label));
    } catch { /* keep empty */ }
  }
  toCache(key, articles);
  return articles;
}

// ─── RACING DRIVERS & CONSTRUCTORS ──────────────────────────────────────────

export interface RacingDriver {
  id: string;
  name: string;
  number: string;       // car number — primary identity for NASCAR/IndyCar
  teamName: string;
  manufacturer: string; // Chevy/Toyota/Ford (NASCAR), Honda/Chevy (IndyCar)
  nationality: string;
  headshot: string;
  teamColor: string;
  teamLogo: string;
}

export interface RacingConstructor {
  id: string;
  name: string;
  abbreviation: string;
  logo: string;
  color: string;
  wins: number;
  points: number;
  rank: number;
}

// ── Racing driver photos · TheSportsDB ───────────────────────────────────────
// ESPN has NO usable headshots for NASCAR/IndyCar (athlete endpoints 404, the
// headshot CDN 404s for racing ids). TheSportsDB DOES carry accurate driver
// cutouts, matched by name. We cache resolutions permanently in localStorage
// (a driver's photo doesn't change) so it's a one-time lookup. (TSDB base URL
// is declared once above.)
const RACE_PHOTO_KEY = 'plajah_racing_photos_v1';
function loadRacePhotoCache(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(RACE_PHOTO_KEY) || '{}'); } catch { return {}; }
}
function saveRacePhotoCache(c: Record<string, string>) {
  try { localStorage.setItem(RACE_PHOTO_KEY, JSON.stringify(c)); } catch { /* */ }
}

/** Full TheSportsDB record for a motorsport driver (photo, nationality, dob, bio). */
export async function fetchRacingDriverDetail(name: string): Promise<any | null> {
  if (!name) return null;
  const key = `racing:driverdetail:${name.toLowerCase()}`;
  const cached = fromCache(key, TTL.teams);
  if (cached !== null && cached !== undefined) return cached;
  try {
    const data = await safeFetch(`${TSDB}/searchplayers.php?p=${encodeURIComponent(name)}`);
    const players: any[] = data?.player ?? [];
    const p = players.find((x: any) => (x.strSport || '').toLowerCase() === 'motorsport') ?? players[0] ?? null;
    toCache(key, p);
    return p;
  } catch { return null; }
}

/** Accurate driver headshot (TheSportsDB cutout), localStorage-cached. */
export async function resolveDriverPhoto(name: string): Promise<string> {
  if (!name) return '';
  const cache = loadRacePhotoCache();
  const k = name.toLowerCase();
  if (k in cache) return cache[k];
  const p = await fetchRacingDriverDetail(name);
  const url = p?.strCutout || p?.strThumb || '';
  cache[k] = url; saveRacePhotoCache(cache);
  return url;
}

// NASCAR team → manufacturer (the badge the cards show). ESPN standings give the
// team name; this maps the current charter teams to their make.
function nascarManufacturer(team: string): string {
  const t = (team || '').toLowerCase();
  if (/hendrick|trackhouse|kaulig|spire|childress|\brcr\b/.test(t)) return 'Chevrolet';
  if (/gibbs|23xi|legacy/.test(t)) return 'Toyota';
  if (/penske|\brfk\b|front row|wood brothers|stewart|haas|rick ware|\brwr\b/.test(t)) return 'Ford';
  return '';
}

async function mapWithConcurrency<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const idx = i++; try { out[idx] = await fn(items[idx]); } catch { /* */ } }
  }));
  return out;
}

export async function fetchRacingDrivers(tab: string): Promise<RacingDriver[]> {
  const cfg = getRacingCfg(tab);
  if (!cfg) return [];
  const key = `racing:drivers:${tab}`;
  const c = fromCache(key, TTL.teams);
  if (c) return c;

  // Roster + team + championship rank from ESPN standings (accurate for both
  // NASCAR & IndyCar — the /athletes endpoint is dead for racing).
  const standings = await fetchRacingStandings(tab);
  const base: RacingDriver[] = standings
    .filter(s => s.driverName && !/^driver\s/i.test(s.driverName))
    .map((s, i) => ({
      id: `${tab}-${i}-${s.driverName.replace(/\s+/g, '_')}`,
      name: s.driverName,
      number: '',
      teamName: s.teamName,
      manufacturer: tab === 'NASCAR' ? nascarManufacturer(s.teamName) : '',
      nationality: '',
      headshot: '',
      teamColor: '#FF8C00',
      teamLogo: '',
    }));

  // Accurate photos from TheSportsDB (cached, concurrency-limited).
  const photos = await mapWithConcurrency(base, 6, d => resolveDriverPhoto(d.name));
  base.forEach((d, i) => { d.headshot = photos[i] || ''; });

  toCache(key, base);
  return base;
}

export async function fetchRacingConstructors(tab: string): Promise<RacingConstructor[]> {
  const cfg = getRacingCfg(tab);
  if (!cfg) return [];
  const key = `racing:constructors:${tab}`;
  const c = fromCache(key, TTL.standings);
  if (c) return c;

  const data = await safeFetch(`${ESPN_WEB}/v2/sports/${cfg.sport}/${cfg.league}/standings`);
  const children: any[] = data?.children ?? [];

  // F1: children[1] = constructor standings
  // NASCAR: find the group named "manufacturer"
  // IndyCar: children[1] if it exists
  const constructorGroup = tab === 'NASCAR'
    ? children.find((g: any) => /manufacturer/i.test(g.name ?? '')) ?? children[1]
    : children[1];

  const entries: any[] = constructorGroup?.standings?.entries ?? [];
  const result: RacingConstructor[] = entries.slice(0, 15).map((e: any, i: number) => {
    const stats = e.stats ?? [];
    const get = (n: string): number => statNum(stats.find((s: any) => s.name === n)?.value);
    return {
      id: String(e.team?.id ?? e.athlete?.id ?? i),
      name: scoreText(e.team?.displayName ?? e.athlete?.displayName) || `Team ${i + 1}`,
      abbreviation: scoreText(e.team?.abbreviation),
      logo: e.team?.logos?.[0]?.href ?? '',
      color: e.team?.color ? `#${e.team.color}` : '#FF8C00',
      wins: get('wins') || 0,
      points: get('points') || 0,
      rank: i + 1,
    };
  });

  toCache(key, result);
  return result;
}

// ─── LEAGUE LEADERS ─────────────────────────────────────────────────────────

export interface LeaderEntry {
  athleteId: string;
  name: string;
  photo: string;
  teamAbbr: string;
  teamLogo: string;
  value: number;
  displayValue: string;
}

export interface LeaderCategory {
  name: string;
  displayName: string;
  shortName: string;
  leaders: LeaderEntry[];
}

export async function fetchLeagueLeaders(tab: string): Promise<LeaderCategory[]> {
  // Soccer leagues have no ESPN /leaders endpoint — skip gracefully
  if (tab === 'FIFA' || tab === 'MLS') return [];

  const cfg = getLeagueCfg(tab);
  if (!cfg) return [];
  const key = `leaders:${tab}`;
  const c = fromCache(key, TTL.standings);
  if (c) return c;

  const stored = await readSportsKnowledge<LeaderCategory[]>('sports_league_leaders', makeSportsDocId(tab, 'current'), TTL.standings);
  if (stored?.data?.length) { toCache(key, stored.data); return stored.data; }

  try {
    // The site API /leaders endpoint now 404s — use the core API and resolve refs.
    const season = new Date().getFullYear();
    let data = await safeFetch(`${ESPN_CORE}/${cfg.sport}/leagues/${cfg.league}/seasons/${season}/types/2/leaders?limit=5`);
    if (!Array.isArray(data?.categories) || data.categories.length === 0) {
      data = await safeFetch(`${ESPN_CORE}/${cfg.sport}/leagues/${cfg.league}/seasons/${season - 1}/types/2/leaders?limit=5`);
    }
    if (!Array.isArray(data?.categories)) return [];

    const PRIORITY: Record<string, string[]> = {
      NBA:  ['pointsPerGame', 'reboundsPerGame', 'assistsPerGame', 'blocksPerGame'],
      NFL:  ['passingYards', 'rushingYards', 'receivingYards', 'sacks'],
      NHL:  ['points', 'goals', 'assists', 'plusMinus'],
      MLB:  ['battingAvg', 'homeRuns', 'RBIs', 'ERA'],
      NCAA: ['pointsPerGame', 'reboundsPerGame', 'assistsPerGame', 'blocksPerGame'],
      WNBA: ['pointsPerGame', 'reboundsPerGame', 'assistsPerGame', 'blocksPerGame'],
    };
    const priority = PRIORITY[tab] ?? [];

    const rawCats = (data.categories as any[])
      .filter((cat: any) => priority.length === 0 || priority.includes(cat.name))
      .sort((a: any, b: any) => {
        const ai = priority.indexOf(a.name);
        const bi = priority.indexOf(b.name);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      })
      .slice(0, 4)
      .map((cat: any) => ({ ...cat, leaders: (cat.leaders ?? []).slice(0, 5) }));

    // Core API links athletes/teams by $ref — resolve them all in one bounded pass
    const athleteRefs = rawCats.flatMap((c: any) => c.leaders.map((l: any) => l.athlete?.$ref ?? ''));
    const teamRefs    = rawCats.flatMap((c: any) => c.leaders.map((l: any) => l.team?.$ref ?? ''));
    const [athletes, teams] = await Promise.all([resolveRefs(athleteRefs), resolveRefs(teamRefs)]);

    let cursor = 0;
    const cats: LeaderCategory[] = rawCats.map((cat: any) => ({
      name: cat.name,
      displayName: cat.displayName || cat.name,
      shortName: cat.shortDisplayName || cat.abbreviation || cat.name,
      leaders: cat.leaders.map((l: any) => {
        const athlete: any = athletes[cursor];
        const team: any = teams[cursor];
        cursor++;
        return {
          athleteId: String(athlete?.id ?? ''),
          name: athlete?.displayName ?? athlete?.fullName ?? 'Unknown',
          photo: athlete?.headshot?.href ?? '',
          teamAbbr: team?.abbreviation ?? '',
          teamLogo: team?.logos?.[0]?.href ?? '',
          value: l.value ?? 0,
          displayValue: l.displayValue ?? String(l.value ?? 0),
        };
      }).filter((l: LeaderEntry) => l.athleteId),
    })).filter((c: LeaderCategory) => c.leaders.length > 0);

    toCache(key, cats);
    if (cats.length) {
      writeSportsKnowledge('sports_league_leaders', makeSportsDocId(tab, 'current'), cats, [
        sportsSource('ESPN', `${ESPN_CORE}/${cfg.sport}/leagues/${cfg.league}/seasons/${season}/types/2/leaders`, `${tab} current leaders`),
      ], ['sports', tab, 'leaders', 'current'], 'HIGH').catch(() => {});
    }
    return cats;
  } catch {
    return [];
  }
}

// ─── PLAYER PROFILE ─────────────────────────────────────────────────────────

export async function fetchPlayerProfile(tab: string, athleteId: string): Promise<any | null> {
  const cfg = getLeagueCfg(tab);
  if (!cfg) return null;
  const key = `player:${tab}:${athleteId}`;
  const c = fromCache(key, TTL.roster);
  if (c !== null) return c;

  // FIFA legends carry a Wikipedia slug (non-numeric id), not an ESPN athlete id —
  // synthesize a profile from the Wikipedia summary (photo + biography).
  if (tab === 'FIFA' && !/^\d+$/.test(athleteId)) {
    const wiki = await safeFetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${athleteId}`);
    const legendProfile = wiki ? {
      id:          athleteId,
      displayName: wiki.title || athleteId.replace(/_/g, ' '),
      fullName:    wiki.title || athleteId.replace(/_/g, ' '),
      headshot:    wiki.originalimage?.source || wiki.thumbnail?.source
        ? { href: wiki.originalimage?.source || wiki.thumbnail?.source } : undefined,
      position:    {},
      notes:       wiki.extract || '',
    } : null;
    toCache(key, legendProfile);
    return legendProfile;
  }
  const stored = await readSportsKnowledge<any>('sports_player_profiles', makeSportsDocId(tab, athleteId), TTL.roster);

  // Bio from the common v3 athlete endpoint; current-season stats from the core
  // API (the old site-API athlete endpoint no longer carries either reliably).
  const season = new Date().getFullYear();
  const sourceUrl = `${ESPN_WEB}/common/v3/sports/${cfg.sport}/${cfg.league}/athletes/${athleteId}`;
  const [data, statsNow, statsPrev] = await Promise.all([
    safeFetch(sourceUrl),
    safeFetch(`${ESPN_CORE}/${cfg.sport}/leagues/${cfg.league}/seasons/${season}/types/2/athletes/${athleteId}/statistics`),
    safeFetch(`${ESPN_CORE}/${cfg.sport}/leagues/${cfg.league}/seasons/${season - 1}/types/2/athletes/${athleteId}/statistics`),
  ]);

  const profile = data?.athlete ?? stored?.data ?? null;
  if (profile) {
    const splits = statsNow?.splits?.categories?.length ? statsNow.splits
      : statsPrev?.splits?.categories?.length ? statsPrev.splits
      : profile.statistics?.splits ?? null;
    if (splits) profile.statistics = { ...(profile.statistics ?? {}), splits };
  }

  toCache(key, profile);
  if (profile) {
    writeSportsKnowledge('sports_player_profiles', makeSportsDocId(tab, athleteId), profile, [
      sportsSource('ESPN', sourceUrl, `${tab} player ${athleteId}`),
    ], ['sports', tab, 'player', athleteId], 'HIGH').catch(() => {});
  }
  return profile;
}

// ─── PLAYER CAREER TABLE (season-by-season stats + roster history) ─────────
// Backed by ESPN's common v3 /stats endpoint: every season the athlete played,
// which team they were on, and per-season stat lines. This powers career stats
// on profile cards and team-by-team roster history.

export interface CareerSeasonRow {
  year: number;
  seasonDisplay: string;   // "2003-04"
  teamId: string;
  teamAbbr: string;
  teamName: string;
  stats: string[];         // aligned with CareerCategory.labels
}

export interface CareerCategory {
  name: string;            // 'averages' | 'totals' | ...
  displayName: string;
  labels: string[];        // ["GP", "PTS", ...]
  names: string[];         // ["gamesPlayed", ...]
  displayNames: string[];
  seasons: CareerSeasonRow[];
  careerTotals?: string[]; // career summary row, aligned with labels
}

export interface PlayerCareer {
  athleteId: string;
  categories: CareerCategory[];
  /** Roster history: every team the athlete appeared for, with season ranges */
  teamHistory: { teamId: string; teamName: string; teamAbbr: string; color: string; seasons: string[] }[];
}

export async function fetchPlayerCareer(tab: string, athleteId: string): Promise<PlayerCareer | null> {
  const cfg = getLeagueCfg(tab);
  if (!cfg) return null;
  const key = `career:${tab}:${athleteId}`;
  const c = fromCache(key, TTL.teams);
  if (c !== null) return c;
  const docId = makeSportsDocId(tab, athleteId, 'career');
  const stored = await readSportsKnowledge<PlayerCareer>('sports_player_stats', docId, TTL.teams);

  const sourceUrl = `${ESPN_WEB}/common/v3/sports/${cfg.sport}/${cfg.league}/athletes/${athleteId}/stats`;
  const data = await safeFetch(sourceUrl);
  if (!Array.isArray(data?.categories) || data.categories.length === 0) return stored?.data ?? null;

  const teamsMap: Record<string, any> = data.teams ?? {};
  const teamBySlugOrId = (row: any) => teamsMap[row.teamSlug] ?? Object.values(teamsMap).find((t: any) => t.id === row.teamId) ?? null;

  const categories: CareerCategory[] = (data.categories as any[]).map((cat: any) => ({
    name: cat.name,
    displayName: cat.displayName || cat.name,
    labels: cat.labels ?? [],
    names: cat.names ?? [],
    displayNames: cat.displayNames ?? [],
    seasons: (cat.statistics ?? []).map((row: any) => {
      const team = teamBySlugOrId(row);
      return {
        year: row.season?.year ?? 0,
        seasonDisplay: row.season?.displayName ?? String(row.season?.year ?? ''),
        teamId: String(row.teamId ?? team?.id ?? ''),
        teamAbbr: team?.abbreviation ?? '',
        teamName: team?.displayName ?? '',
        stats: row.stats ?? [],
      };
    }),
    careerTotals: cat.totals ?? cat.career?.stats ?? undefined,
  }));

  // Derive roster history from the primary category's season rows
  const primary = categories[0];
  const historyMap = new Map<string, { teamId: string; teamName: string; teamAbbr: string; color: string; seasons: string[] }>();
  for (const row of primary?.seasons ?? []) {
    if (!row.teamId) continue;
    const team: any = Object.values(teamsMap).find((t: any) => String(t.id) === row.teamId) ?? {};
    const entry = historyMap.get(row.teamId) ?? {
      teamId: row.teamId,
      teamName: row.teamName || team.displayName || '',
      teamAbbr: row.teamAbbr || team.abbreviation || '',
      color: team.color ? `#${team.color}` : '#333333',
      seasons: [],
    };
    entry.seasons.push(row.seasonDisplay);
    historyMap.set(row.teamId, entry);
  }

  const career: PlayerCareer = { athleteId, categories, teamHistory: [...historyMap.values()] };
  toCache(key, career);
  writeSportsKnowledge('sports_player_stats', docId, career, [
    sportsSource('ESPN', sourceUrl, `${tab} player career ${athleteId}`),
  ], ['sports', tab, 'player_career', athleteId], 'HIGH').catch(() => {});
  return career;
}

// ─── TEAM FULL SCHEDULE ─────────────────────────────────────────────────────

export async function fetchTeamFullSchedule(tab: string, teamId: string): Promise<any[]> {
  // FIFA nations have no ESPN team-schedule endpoint — build it from the
  // tournament scoreboard filtered to this nation (real fixtures + results).
  if (tab === 'FIFA') return fetchWorldCupTeamEvents(teamId);
  const cfg = getLeagueCfg(tab);
  if (!cfg) return [];
  const resolvedTeamId = await resolveEspnTeamId(tab, teamId);
  const key = `fullsched:${tab}:${resolvedTeamId}`;
  const c = fromCache(key, TTL.scores);
  if (c) return c;
  const season = new Date().getFullYear();
  const stored = await readSportsKnowledge<any[]>('sports_team_schedules', makeSportsDocId(tab, resolvedTeamId, season), TTL.scores);
  const sourceUrl = `${ESPN}/${cfg.sport}/${cfg.league}/teams/${resolvedTeamId}/schedule?season=${season}&seasontype=2`;
  const data = await safeFetch(sourceUrl);
  const events = data?.events ?? stored?.data ?? [];
  toCache(key, events);
  if (events.length) {
    writeSportsKnowledge('sports_team_schedules', makeSportsDocId(tab, resolvedTeamId, season), events, [
      sportsSource('ESPN', sourceUrl, `${tab} schedule ${resolvedTeamId} ${season}`),
    ], ['sports', tab, 'schedule', resolvedTeamId, String(season)], 'HIGH').catch(() => {});
  }
  return events;
}

// ─── ROSTER FOR SPECIFIC SEASON ──────────────────────────────────────────────

export async function fetchTeamRosterForSeason(
  tab: string,
  teamId: string,
  season: number,
): Promise<{ group: string; athletes: any[] }[]> {
  const cfg = getLeagueCfg(tab);
  if (!cfg) return [];
  const resolvedTeamId = await resolveEspnTeamId(tab, teamId);
  const key = `roster:${tab}:${resolvedTeamId}:${season}`;
  const c = fromCache(key, TTL.roster);
  if (c) return c;
  const stored = await readSportsKnowledge<{ group: string; athletes: any[] }[]>('sports_team_rosters', makeSportsDocId(tab, resolvedTeamId, season), TTL.roster);
  const sourceUrl = `${ESPN}/${cfg.sport}/${cfg.league}/teams/${resolvedTeamId}/roster?season=${season}`;
  const data = await safeFetch(sourceUrl);
  const rawAthletes: any[] = data?.athletes ?? [];
  let roster = parseRosterAthletes(rawAthletes);

  // The site API ignores ?season= for pro leagues (returns empty groups or group
  // skeletons for past years). The core API keeps full historical rosters — fetch
  // the season's athlete refs and resolve them into the same grouped shape.
  const totalAthletes = roster.reduce((s, g) => s + g.athletes.length, 0);
  if (totalAthletes === 0) {
    const coreUrl = `${ESPN_CORE}/${cfg.sport}/leagues/${cfg.league}/seasons/${season}/teams/${resolvedTeamId}/athletes?limit=200`;
    const core = await safeFetch(coreUrl, `coreroster:${tab}:${resolvedTeamId}:${season}`, TTL.roster);
    const refs: string[] = (core?.items ?? []).map((i: any) => i.$ref).filter(Boolean);
    if (refs.length) {
      const resolved = (await resolveRefs(refs)).filter(Boolean) as any[];
      const athletes = resolved.map((a: any) => ({
        id: String(a.id),
        displayName: a.displayName ?? a.fullName ?? '',
        fullName: a.fullName ?? a.displayName ?? '',
        jersey: a.jersey ?? '',
        position: a.position ? { name: a.position.name, abbreviation: a.position.abbreviation, displayName: a.position.displayName } : undefined,
        headshot: a.headshot ? { href: a.headshot.href } : undefined,
        displayHeight: a.displayHeight ?? '',
        displayWeight: a.displayWeight ?? '',
        dateOfBirth: a.dateOfBirth ?? '',
        birthPlace: a.birthPlace,
        experience: a.experience,
      }));
      roster = parseRosterAthletes(athletes);
    }
  }

  const finalRoster = roster.some(g => g.athletes.length > 0) ? roster : (stored?.data ?? []);
  if (finalRoster.length > 0) {
    toCache(key, finalRoster);
    writeSportsKnowledge('sports_team_rosters', makeSportsDocId(tab, resolvedTeamId, season), finalRoster, [
      sportsSource('ESPN', sourceUrl, `${tab} roster ${resolvedTeamId} ${season}`),
    ], ['sports', tab, 'roster', resolvedTeamId, String(season)], 'HIGH').catch(() => {});
  }
  return finalRoster;
}

// ─── LEAGUE CHAMPIONS HISTORY ────────────────────────────────────────────────

export interface ChampionEntry {
  year: number;
  champion: string;
  opponent?: string;
  series?: string;
  note?: string;
}

export const LEAGUE_CHAMPIONS: Record<string, ChampionEntry[]> = {
  NBA: [
    { year: 2024, champion: 'Boston Celtics',        opponent: 'Dallas Mavericks',        series: '4-1' },
    { year: 2023, champion: 'Denver Nuggets',         opponent: 'Miami Heat',              series: '4-1' },
    { year: 2022, champion: 'Golden State Warriors',  opponent: 'Boston Celtics',          series: '4-2' },
    { year: 2021, champion: 'Milwaukee Bucks',        opponent: 'Phoenix Suns',            series: '4-2' },
    { year: 2020, champion: 'Los Angeles Lakers',     opponent: 'Miami Heat',              series: '4-2' },
    { year: 2019, champion: 'Toronto Raptors',        opponent: 'Golden State Warriors',   series: '4-2' },
    { year: 2018, champion: 'Golden State Warriors',  opponent: 'Cleveland Cavaliers',     series: '4-0' },
    { year: 2017, champion: 'Golden State Warriors',  opponent: 'Cleveland Cavaliers',     series: '4-1' },
    { year: 2016, champion: 'Cleveland Cavaliers',    opponent: 'Golden State Warriors',   series: '4-3' },
    { year: 2015, champion: 'Golden State Warriors',  opponent: 'Cleveland Cavaliers',     series: '4-2' },
    { year: 2014, champion: 'San Antonio Spurs',      opponent: 'Miami Heat',              series: '4-1' },
    { year: 2013, champion: 'Miami Heat',             opponent: 'San Antonio Spurs',       series: '4-3' },
    { year: 2012, champion: 'Miami Heat',             opponent: 'Oklahoma City Thunder',   series: '4-1' },
    { year: 2011, champion: 'Dallas Mavericks',       opponent: 'Miami Heat',              series: '4-2' },
    { year: 2010, champion: 'Los Angeles Lakers',     opponent: 'Boston Celtics',          series: '4-3' },
  ],
  NFL: [
    { year: 2025, champion: 'Philadelphia Eagles',    opponent: 'Kansas City Chiefs',      series: '40-22',    note: 'Super Bowl LIX' },
    { year: 2024, champion: 'Kansas City Chiefs',     opponent: 'San Francisco 49ers',     series: '25-22 OT', note: 'Super Bowl LVIII' },
    { year: 2023, champion: 'Kansas City Chiefs',     opponent: 'Philadelphia Eagles',     series: '38-35',    note: 'Super Bowl LVII' },
    { year: 2022, champion: 'Los Angeles Rams',       opponent: 'Cincinnati Bengals',      series: '23-20',    note: 'Super Bowl LVI' },
    { year: 2021, champion: 'Tampa Bay Buccaneers',   opponent: 'Kansas City Chiefs',      series: '31-9',     note: 'Super Bowl LV' },
    { year: 2020, champion: 'Kansas City Chiefs',     opponent: 'San Francisco 49ers',     series: '31-20',    note: 'Super Bowl LIV' },
    { year: 2019, champion: 'New England Patriots',   opponent: 'Los Angeles Rams',        series: '13-3',     note: 'Super Bowl LIII' },
    { year: 2018, champion: 'Philadelphia Eagles',    opponent: 'New England Patriots',    series: '41-33',    note: 'Super Bowl LII' },
    { year: 2017, champion: 'New England Patriots',   opponent: 'Atlanta Falcons',         series: '34-28 OT', note: 'Super Bowl LI' },
    { year: 2016, champion: 'Denver Broncos',         opponent: 'Carolina Panthers',       series: '24-10',    note: 'Super Bowl 50' },
    { year: 2015, champion: 'New England Patriots',   opponent: 'Seattle Seahawks',        series: '28-24',    note: 'Super Bowl XLIX' },
    { year: 2014, champion: 'Seattle Seahawks',       opponent: 'Denver Broncos',          series: '43-8',     note: 'Super Bowl XLVIII' },
    { year: 2013, champion: 'Baltimore Ravens',       opponent: 'San Francisco 49ers',     series: '34-31',    note: 'Super Bowl XLVII' },
    { year: 2012, champion: 'New York Giants',        opponent: 'New England Patriots',    series: '21-17',    note: 'Super Bowl XLVI' },
    { year: 2011, champion: 'Green Bay Packers',      opponent: 'Pittsburgh Steelers',     series: '31-25',    note: 'Super Bowl XLV' },
  ],
  NHL: [
    { year: 2024, champion: 'Florida Panthers',       opponent: 'Edmonton Oilers',         series: '4-3' },
    { year: 2023, champion: 'Vegas Golden Knights',   opponent: 'Florida Panthers',        series: '4-1' },
    { year: 2022, champion: 'Colorado Avalanche',     opponent: 'Tampa Bay Lightning',     series: '4-2' },
    { year: 2021, champion: 'Tampa Bay Lightning',    opponent: 'Montreal Canadiens',      series: '4-1' },
    { year: 2020, champion: 'Tampa Bay Lightning',    opponent: 'Dallas Stars',            series: '4-2' },
    { year: 2019, champion: 'St. Louis Blues',        opponent: 'Boston Bruins',           series: '4-3' },
    { year: 2018, champion: 'Washington Capitals',    opponent: 'Vegas Golden Knights',    series: '4-1' },
    { year: 2017, champion: 'Pittsburgh Penguins',    opponent: 'Nashville Predators',     series: '4-2' },
    { year: 2016, champion: 'Pittsburgh Penguins',    opponent: 'San Jose Sharks',         series: '4-2' },
    { year: 2015, champion: 'Chicago Blackhawks',     opponent: 'Tampa Bay Lightning',     series: '4-2' },
    { year: 2014, champion: 'Los Angeles Kings',      opponent: 'New York Rangers',        series: '4-1' },
    { year: 2013, champion: 'Chicago Blackhawks',     opponent: 'Boston Bruins',           series: '4-2' },
    { year: 2012, champion: 'Los Angeles Kings',      opponent: 'New Jersey Devils',       series: '4-2' },
    { year: 2011, champion: 'Boston Bruins',          opponent: 'Vancouver Canucks',       series: '4-3' },
    { year: 2010, champion: 'Chicago Blackhawks',     opponent: 'Philadelphia Flyers',     series: '4-2' },
  ],
  MLB: [
    { year: 2024, champion: 'Los Angeles Dodgers',    opponent: 'New York Yankees',        series: '4-1' },
    { year: 2023, champion: 'Texas Rangers',          opponent: 'Arizona Diamondbacks',    series: '4-1' },
    { year: 2022, champion: 'Houston Astros',         opponent: 'Philadelphia Phillies',   series: '4-2' },
    { year: 2021, champion: 'Atlanta Braves',         opponent: 'Houston Astros',          series: '4-2' },
    { year: 2020, champion: 'Los Angeles Dodgers',    opponent: 'Tampa Bay Rays',          series: '4-2' },
    { year: 2019, champion: 'Washington Nationals',   opponent: 'Houston Astros',          series: '4-3' },
    { year: 2018, champion: 'Boston Red Sox',         opponent: 'Los Angeles Dodgers',     series: '4-1' },
    { year: 2017, champion: 'Houston Astros',         opponent: 'Los Angeles Dodgers',     series: '4-3' },
    { year: 2016, champion: 'Chicago Cubs',           opponent: 'Cleveland Guardians',     series: '4-3' },
    { year: 2015, champion: 'Kansas City Royals',     opponent: 'New York Mets',           series: '4-1' },
    { year: 2014, champion: 'San Francisco Giants',   opponent: 'Kansas City Royals',      series: '4-3' },
    { year: 2013, champion: 'Boston Red Sox',         opponent: 'St. Louis Cardinals',     series: '4-2' },
    { year: 2012, champion: 'San Francisco Giants',   opponent: 'Detroit Tigers',          series: '4-0' },
    { year: 2011, champion: 'St. Louis Cardinals',    opponent: 'Texas Rangers',           series: '4-3' },
    { year: 2010, champion: 'San Francisco Giants',   opponent: 'Texas Rangers',           series: '4-1' },
  ],
  FIFA: [
    { year: 2022, champion: 'Argentina',          opponent: 'France',            series: '3-3 (4-2 pens)', note: 'FIFA World Cup — Qatar' },
    { year: 2018, champion: 'France',             opponent: 'Croatia',           series: '4-2',            note: 'FIFA World Cup — Russia' },
    { year: 2014, champion: 'Germany',            opponent: 'Argentina',         series: '1-0 AET',        note: 'FIFA World Cup — Brazil' },
    { year: 2010, champion: 'Spain',              opponent: 'Netherlands',       series: '1-0 AET',        note: 'FIFA World Cup — South Africa' },
    { year: 2006, champion: 'Italy',              opponent: 'France',            series: '1-1 (5-3 pens)', note: 'FIFA World Cup — Germany' },
    { year: 2002, champion: 'Brazil',             opponent: 'Germany',           series: '2-0',            note: 'FIFA World Cup — Korea/Japan' },
    // UEFA Champions League winners (interspersed for richness)
    { year: 2024, champion: 'Real Madrid',        opponent: 'Borussia Dortmund', series: '2-0',            note: 'UEFA Champions League Final' },
    { year: 2023, champion: 'Manchester City',    opponent: 'Inter Milan',       series: '1-0',            note: 'UEFA Champions League Final' },
    { year: 2022, champion: 'Real Madrid',        opponent: 'Liverpool',         series: '1-0',            note: 'UEFA Champions League Final' },
    { year: 2021, champion: 'Chelsea',            opponent: 'Manchester City',   series: '1-0',            note: 'UEFA Champions League Final' },
    { year: 2020, champion: 'Bayern Munich',      opponent: 'Paris SG',          series: '1-0',            note: 'UEFA Champions League Final' },
    { year: 2019, champion: 'Liverpool',          opponent: 'Tottenham',         series: '2-0',            note: 'UEFA Champions League Final' },
    { year: 2018, champion: 'Real Madrid',        opponent: 'Liverpool',         series: '3-1',            note: 'UEFA Champions League Final' },
    { year: 2017, champion: 'Real Madrid',        opponent: 'Juventus',          series: '4-1',            note: 'UEFA Champions League Final' },
    { year: 2016, champion: 'Real Madrid',        opponent: 'Atlético Madrid',   series: '1-1 (5-3 pens)', note: 'UEFA Champions League Final' },
  ],
  MLS: [
    { year: 2024, champion: 'LA Galaxy',          opponent: 'New York Red Bulls', series: '2-1',           note: 'MLS Cup' },
    { year: 2023, champion: 'Columbus Crew',      opponent: 'Los Angeles FC',    series: '2-1',            note: 'MLS Cup' },
    { year: 2022, champion: 'Los Angeles FC',     opponent: 'Philadelphia Union', series: '3-3 (3-0 pens)', note: 'MLS Cup' },
    { year: 2021, champion: 'New England Revolution', opponent: 'Colorado Rapids', series: 'DNF',          note: 'Supporters Shield' },
    { year: 2020, champion: 'Columbus Crew',      opponent: 'Seattle Sounders',  series: '3-0',            note: 'MLS Cup' },
    { year: 2019, champion: 'Seattle Sounders',   opponent: 'Toronto FC',        series: '3-1',            note: 'MLS Cup' },
    { year: 2018, champion: 'Atlanta United',     opponent: 'Portland Timbers',  series: '2-0',            note: 'MLS Cup' },
    { year: 2017, champion: 'Toronto FC',         opponent: 'Seattle Sounders',  series: '2-0',            note: 'MLS Cup' },
    { year: 2016, champion: 'Seattle Sounders',   opponent: 'Toronto FC',        series: '0-0 (5-4 pens)', note: 'MLS Cup' },
    { year: 2015, champion: 'Portland Timbers',   opponent: 'Columbus Crew',     series: '2-1',            note: 'MLS Cup' },
    { year: 2014, champion: 'LA Galaxy',          opponent: 'New England Revolution', series: '2-1 AET',   note: 'MLS Cup' },
    { year: 2013, champion: 'Sporting Kansas City', opponent: 'Real Salt Lake',  series: '1-1 (7-6 pens)', note: 'MLS Cup' },
    { year: 2012, champion: 'LA Galaxy',          opponent: 'Houston Dynamo',    series: '3-1',            note: 'MLS Cup' },
    { year: 2011, champion: 'LA Galaxy',          opponent: 'Houston Dynamo',    series: '1-0',            note: 'MLS Cup' },
    { year: 2010, champion: 'Colorado Rapids',    opponent: 'FC Dallas',         series: '2-1 AET',        note: 'MLS Cup' },
  ],
  NCAA: [
    { year: 2025, champion: 'Florida Gators',         opponent: 'Houston Cougars',         series: '65-63' },
    { year: 2024, champion: 'UConn Huskies',          opponent: 'Purdue Boilermakers',     series: '75-60' },
    { year: 2023, champion: 'UConn Huskies',          opponent: 'San Diego State',         series: '76-59' },
    { year: 2022, champion: 'Kansas Jayhawks',        opponent: 'North Carolina',          series: '72-69' },
    { year: 2021, champion: 'Baylor Bears',           opponent: 'Gonzaga Bulldogs',        series: '86-70' },
    { year: 2020, champion: 'N/A',                    note: 'Tournament cancelled (COVID-19)' },
    { year: 2019, champion: 'Virginia Cavaliers',     opponent: 'Texas Tech Red Raiders',  series: '85-77 OT' },
    { year: 2018, champion: 'Villanova Wildcats',     opponent: 'Michigan Wolverines',     series: '79-62' },
    { year: 2017, champion: 'North Carolina Tar Heels', opponent: 'Gonzaga Bulldogs',     series: '71-65' },
    { year: 2016, champion: 'Villanova Wildcats',     opponent: 'North Carolina Tar Heels',series: '77-74' },
    { year: 2015, champion: 'Duke Blue Devils',       opponent: 'Wisconsin Badgers',       series: '68-63' },
    { year: 2014, champion: 'UConn Huskies',          opponent: 'Florida Gators',          series: '60-54' },
    { year: 2013, champion: 'Louisville Cardinals',   opponent: 'Michigan Wolverines',     series: '82-76' },
    { year: 2012, champion: 'Kentucky Wildcats',      opponent: 'Kansas Jayhawks',         series: '67-59' },
    { year: 2011, champion: 'UConn Huskies',          opponent: 'Butler Bulldogs',         series: '53-41' },
  ],
};

// ─── RICH TEAM PAGE ──────────────────────────────────────────────────────────

// FIFA/MLS teams carry a TheSportsDB ID, not an ESPN ID.
// This function builds the team page entirely from TSDB data.
async function fetchSoccerRichTeamPage(
  tsdbTeamId: string,
  fullName: string,
  nickname: string,
  location: string,
  cacheKey: string,
): Promise<RichTeamPage | null> {
  const [teamRes, playersRes, wikiRes] = await Promise.allSettled([
    safeFetch(`${TSDB}/lookupteam.php?id=${tsdbTeamId}`),
    fetchTheSportsDBPlayers(tsdbTeamId),
    fetchWikiSummary(fullName),
  ]);

  const tsdbTeam = teamRes.status === 'fulfilled' ? (teamRes.value?.teams?.[0] ?? null) : null;
  const legends  = playersRes.status === 'fulfilled' ? playersRes.value : [];
  const wikiText = wikiRes.status   === 'fulfilled' ? wikiRes.value    : '';

  const rich: RichTeamPage = {
    team: tsdbTeam ? {
      id:               tsdbTeamId,
      displayName:      tsdbTeam.strTeam || fullName,
      shortDisplayName: tsdbTeam.strTeamShort || nickname,
      abbreviation:     (tsdbTeam.strTeamShort || nickname || '').substring(0, 3).toUpperCase(),
      logos:            tsdbTeam.strTeamBadge ? [{ href: tsdbTeam.strTeamBadge }] : [],
      color:            '1a1a1a',
      alternateColor:   'ffffff',
      record:           { items: [] },
    } : null,
    news:        [],
    roster:      [],
    recentGames: [],
    description: wikiText || tsdbTeam?.strDescriptionEN || '',
    founded:     tsdbTeam?.intFormedYear  || '',
    city:        tsdbTeam?.strCity || tsdbTeam?.strCountry || location || '',
    stadium:     tsdbTeam?.strStadium     || '',
    fanart:      tsdbTeam?.strFanart1     || tsdbTeam?.strFanart2 || '',
    badge:       tsdbTeam?.strTeamBadge   || '',
    legends,
  };

  toCache(cacheKey, rich);
  return rich;
}

export async function fetchRichTeamPage(
  tab: string,
  teamId: string,
  nickname: string,
  location: string,
  tsdbId?: string,
): Promise<RichTeamPage | null> {
  const key = `rich:${tab}:${teamId}`;
  const c = fromCache(key, TTL.roster);
  if (c !== null) return c;

  const fullName = location ? `${location} ${nickname}`.trim() : nickname;

  // FIFA teams are World Cup nations (ESPN ids); MLS teams have TheSportsDB IDs
  if (tab === 'FIFA') {
    return fetchFifaWorldCupRichTeamPage(teamId, fullName, key);
  }
  if (tab === 'MLS') {
    return fetchSoccerRichTeamPage(teamId, fullName, nickname, location, key);
  }

  // teamId is either an ESPN abbreviation (e.g. 'lal') or a numeric ID ('13')
  // Use it as espnAbbr for the static ID map lookup when it looks like an abbr (non-numeric)
  const espnAbbr = /^\d+$/.test(teamId) ? undefined : teamId;

  const [base, tsdbTeam, wikiText] = await Promise.all([
    fetchTeamPage(tab, teamId),
    fetchTheSportsDBTeam(fullName, TSDB_SPORT[tab], tab, tsdbId, espnAbbr),
    fetchWikiSummary(fullName),
  ]);

  let legends: LegendPlayer[] = [];
  if (tsdbTeam?.idTeam) {
    legends = await fetchTheSportsDBPlayers(tsdbTeam.idTeam);
  }

  const rich: RichTeamPage = {
    team:        base?.team        ?? null,
    news:        base?.news        ?? [],
    roster:      base?.roster      ?? [],
    recentGames: base?.recentGames ?? [],
    description: wikiText || tsdbTeam?.strDescriptionEN || '',
    founded:     tsdbTeam?.intFormedYear  || '',
    city:        tsdbTeam?.strCity || location || '',
    stadium:     tsdbTeam?.strStadium     || '',
    fanart:      tsdbTeam?.strFanart1     || tsdbTeam?.strFanart2 || '',
    badge:       tsdbTeam?.strTeamBadge   || '',
    legends,
  };

  toCache(key, rich);
  return rich;
}
