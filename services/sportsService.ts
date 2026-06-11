// ESPN public API – no key required.  All responses are cached in-memory.
import { findStaticTeam } from '../data/leagueTeams';
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
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const isBrowser = typeof window !== 'undefined';
    const requestUrl = isBrowser ? `/api/proxy?url=${encodeURIComponent(url)}` : url;
    const res = await fetch(requestUrl, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    if (ttlKey) toCache(ttlKey, data);
    return data;
  } catch {
    clearTimeout(timer);
    return null;
  }
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
  FIFA: { sport: 'soccer',     league: 'eng.1' },  // Premier League as global soccer feed
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
// FIFA tab shows top-flight global soccer (Premier League + Champions League)
// MLS tab shows Major League Soccer exclusively
const TSDB_SOCCER: Record<string, { leagueId: string; leagueName: string; espnNews: string }> = {
  FIFA: { leagueId: '4328', leagueName: 'English Premier League', espnNews: 'soccer/eng.1' },
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
      links: { web: { href: item.url || item.link || '#' } },
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
  // Soccer tabs use TheSportsDB (richer metadata, no ESPN key needed)
  if (tab === 'FIFA' || tab === 'MLS') {
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
  if (tab === 'FIFA' || tab === 'MLS') return fetchSoccerScoresFromTSDB(tab);

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
  if (tab === 'FIFA' || tab === 'MLS') return fetchSoccerStandingsFromTSDB(tab);

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
  FIFA: 'English Premier League',
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
        pos: c.order ?? i + 1,
        driverName: c.athlete?.displayName ?? c.displayName ?? 'Driver',
        teamName: c.team?.displayName ?? c.team?.shortDisplayName ?? '',
        driverLogo: c.athlete?.headshot?.href ?? c.athlete?.flag?.href ?? '',
        points: c.statistics?.find((s: any) => s.name === 'points')?.value,
        time: c.time ?? c.statistics?.find((s: any) => s.name === 'time')?.displayValue,
        laps: c.laps,
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
    const get = (name: string) => stats.find((s: any) => s.name === name)?.value ?? 0;
    return {
      rank: (e.stats?.find((s: any) => s.name === 'rank')?.value ?? i + 1),
      driverName: e.athlete?.displayName ?? e.team?.displayName ?? `Driver ${i + 1}`,
      teamName: e.team?.displayName ?? e.team?.shortDisplayName ?? '',
      driverLogo: e.athlete?.headshot?.href ?? '',
      points: get('points') || get('pointsFor') || 0,
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

export async function fetchRacingDrivers(tab: string): Promise<RacingDriver[]> {
  const cfg = getRacingCfg(tab);
  if (!cfg) return [];
  const key = `racing:drivers:${tab}`;
  const c = fromCache(key, TTL.teams);
  if (c) return c;

  const data = await safeFetch(`${ESPN}/${cfg.sport}/${cfg.league}/athletes?limit=80&active=true`);
  const items: any[] = data?.items ?? data?.athletes ?? [];
  if (!items.length) { toCache(key, []); return []; }

  const drivers: RacingDriver[] = items.slice(0, 60).map((a: any) => ({
    id: a.id ?? '',
    name: a.displayName ?? a.fullName ?? '',
    number: a.jersey ?? '',
    teamName: a.team?.displayName ?? a.team?.shortDisplayName ?? '',
    manufacturer: a.team?.manufacturer?.displayName ?? '',
    nationality: a.citizenship ?? a.birthPlace?.country ?? '',
    headshot: a.headshot?.href ?? '',
    teamColor: a.team?.color ? `#${a.team.color}` : '#FF8C00',
    teamLogo: a.team?.logos?.[0]?.href ?? '',
  }));

  toCache(key, drivers);
  return drivers;
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
    const get = (n: string) => stats.find((s: any) => s.name === n)?.value ?? 0;
    return {
      id: e.team?.id ?? e.athlete?.id ?? `${i}`,
      name: e.team?.displayName ?? e.athlete?.displayName ?? `Team ${i + 1}`,
      abbreviation: e.team?.abbreviation ?? '',
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

  // FIFA/MLS teams have TheSportsDB IDs — bypass ESPN entirely
  if (tab === 'FIFA' || tab === 'MLS') {
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
