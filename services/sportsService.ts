// ESPN public API – no key required.  All responses are cached in-memory.
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
    // Route through server-side proxy to avoid CORS in production
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl, { signal: ctrl.signal });
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

// ---------- league config --------------------------------------------------
export type LeagueTab = 'NBA' | 'NFL' | 'NHL' | 'MLB' | 'NCAA' | 'ESPORTS' | 'FIFA' | 'MLS';

const LEAGUES: Record<Exclude<LeagueTab, 'ESPORTS'>, { sport: string; league: string }> = {
  NBA:  { sport: 'basketball', league: 'nba' },
  NFL:  { sport: 'football',   league: 'nfl' },
  NHL:  { sport: 'hockey',     league: 'nhl' },
  MLB:  { sport: 'baseball',   league: 'mlb' },
  NCAA: { sport: 'basketball', league: 'mens-college-basketball' },
  // Soccer — ESPN endpoints for news/scores; TSDB handles teams/standings
  FIFA: { sport: 'soccer',     league: 'eng.1' },  // Premier League as global soccer feed
  MLS:  { sport: 'soccer',     league: 'usa.1' },
};

export function getLeagueCfg(tab: string) {
  if (tab === 'ESPORTS') return null;
  return LEAGUES[tab as Exclude<LeagueTab, 'ESPORTS'>] ?? null;
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

  // Try ESPN esports news
  const espnEsports = await safeFetch('https://site.api.espn.com/apis/site/v2/sports/esports/news?limit=20');
  const articles = espnEsports?.articles ?? [];
  toCache(key, articles);
  return articles;
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
  // Soccer tabs use TheSportsDB (richer metadata, no ESPN key needed)
  if (tab === 'FIFA' || tab === 'MLS') return fetchSoccerTeamsFromTSDB(tab);

  const cfg = getLeagueCfg(tab);
  if (!cfg) return [];
  const key = `teams:${tab}`;
  const cached = fromCache(key, TTL.teams);
  if (cached) return cached;

  const data = await safeFetch(`${ESPN}/${cfg.sport}/${cfg.league}/teams?limit=50`);
  if (!data?.sports?.[0]?.leagues?.[0]?.teams) return [];

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
  return teams;
}

// ---------- league news (ESPN native JSON) ---------------------------------
export async function fetchLeagueNews(tab: string): Promise<any[]> {
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
  const articles = data?.articles ?? [];
  toCache(key, articles);
  return articles;
}

// ---------- league scoreboard (scores) ------------------------------------
export async function fetchLeagueScores(tab: string): Promise<any[]> {
  if (tab === 'FIFA' || tab === 'MLS') return fetchSoccerScoresFromTSDB(tab);

  const cfg = getLeagueCfg(tab);
  if (!cfg) return [];
  const key = `scores:${tab}`;
  const cached = fromCache(key, TTL.scores);
  if (cached) return cached;

  const data = await safeFetch(`${ESPN}/${cfg.sport}/${cfg.league}/scoreboard`);
  const events = data?.events ?? [];
  toCache(key, events);
  return events;
}

// ---------- standings ------------------------------------------------------
export async function fetchLeagueStandings(tab: string): Promise<any[]> {
  if (tab === 'FIFA' || tab === 'MLS') return fetchSoccerStandingsFromTSDB(tab);

  const cfg = getLeagueCfg(tab);
  if (!cfg) return [];
  const key = `standings:${tab}`;
  const cached = fromCache(key, TTL.standings);
  if (cached) return cached;

  const data = await safeFetch(`${ESPN}/${cfg.sport}/${cfg.league}/standings`);
  // ESPN standings: data.children = [ { name: 'Eastern', standings: { entries: [] } } ]
  const groups = data?.children ?? (data?.standings?.entries ? [data] : []);
  toCache(key, groups);
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
  const key = `teampage:${tab}:${teamId}`;
  const cached = fromCache(key, TTL.roster);
  if (cached) return cached;

  const base = `${ESPN}/${cfg.sport}/${cfg.league}/teams/${teamId}`;

  const [teamRes, newsRes, rosterRes, scoresRes] = await Promise.allSettled([
    safeFetch(`${base}?enable=roster,record,stats`),
    safeFetch(`${ESPN}/${cfg.sport}/${cfg.league}/news?team=${teamId}&limit=15`),
    safeFetch(`${base}/roster`),
    safeFetch(`${ESPN}/${cfg.sport}/${cfg.league}/teams/${teamId}/schedule?season=${new Date().getFullYear()}&seasontype=2&limit=10`),
  ]);

  const teamData   = teamRes.status   === 'fulfilled' ? teamRes.value   : null;
  const newsData   = newsRes.status   === 'fulfilled' ? newsRes.value   : null;
  const rosterData = rosterRes.status === 'fulfilled' ? rosterRes.value : null;
  const scoresData = scoresRes.status === 'fulfilled' ? scoresRes.value : null;

  const rawAthletes: any[] = rosterData?.athletes ?? teamData?.team?.athletes ?? [];
  const roster = parseRosterAthletes(rawAthletes);

  const page: TeamPageData = {
    team: teamData?.team ?? null,
    news: newsData?.articles ?? [],
    roster,
    recentGames: scoresData?.events ?? [],
  };

  if (page.team || page.news.length > 0 || page.roster.length > 0) {
    toCache(key, page);
  }
  return page;
}

// ---------- prefetch all leagues (warms cache silently) -------------------
export function prefetchSports(): void {
  const tabs: LeagueTab[] = ['NBA', 'NFL', 'NHL', 'MLB', 'NCAA', 'FIFA', 'MLS'];
  tabs.forEach((tab, i) => {
    setTimeout(() => {
      fetchLeagueTeams(tab).catch(() => {});
      fetchLeagueNews(tab).catch(() => {});
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
  const data = await safeFetch(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`
  );
  const text = data?.extract ?? '';
  toCache(key, text);
  return text;
}

// ─── RACING SPORTS (F1 / NASCAR / IndyCar) ──────────────────────────────────

export type RacingTab = 'F1' | 'NASCAR' | 'INDYCAR';

const RACING: Record<RacingTab, { sport: string; league: string; label: string }> = {
  F1:      { sport: 'racing', league: 'f1',                label: 'Formula 1' },
  NASCAR:  { sport: 'racing', league: 'nascar-cup-series', label: 'NASCAR Cup' },
  INDYCAR: { sport: 'racing', league: 'irl',               label: 'IndyCar' },
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

  const data = await safeFetch(`${ESPN}/${cfg.sport}/${cfg.league}/standings`);
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
  const articles = data?.articles ?? [];
  toCache(key, articles);
  return articles;
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

  try {
    const data = await safeFetch(`${ESPN}/${cfg.sport}/${cfg.league}/leaders`);
    if (!Array.isArray(data?.categories)) return [];

    const PRIORITY: Record<string, string[]> = {
      NBA:  ['pointsPerGame', 'reboundsPerGame', 'assistsPerGame', 'blocksPerGame'],
      NFL:  ['passingYards', 'rushingYards', 'receivingYards', 'sacks'],
      NHL:  ['points', 'goals', 'assists', 'plusMinus'],
      MLB:  ['battingAvg', 'homeRuns', 'rbi', 'era'],
      NCAA: ['pointsPerGame', 'reboundsPerGame', 'assistsPerGame', 'blocksPerGame'],
    };
    const priority = PRIORITY[tab] ?? [];

    const cats: LeaderCategory[] = (data.categories as any[])
      .filter((cat: any) => priority.length === 0 || priority.includes(cat.name))
      .sort((a: any, b: any) => {
        const ai = priority.indexOf(a.name);
        const bi = priority.indexOf(b.name);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      })
      .slice(0, 4)
      .map((cat: any) => ({
        name: cat.name,
        displayName: cat.displayName || cat.name,
        shortName: cat.shortDisplayName || cat.abbreviation || cat.name,
        leaders: (cat.leaders ?? []).slice(0, 5).map((l: any) => ({
          athleteId: String(l.athlete?.id ?? ''),
          name: l.athlete?.displayName ?? l.athlete?.fullName ?? 'Unknown',
          photo: l.athlete?.headshot?.href ?? '',
          teamAbbr: l.athlete?.team?.abbreviation ?? l.team?.abbreviation ?? '',
          teamLogo: l.athlete?.team?.logos?.[0]?.href ?? '',
          value: l.value ?? 0,
          displayValue: l.displayValue ?? String(l.value ?? 0),
        })),
      }));

    toCache(key, cats);
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
  const data = await safeFetch(`${ESPN}/${cfg.sport}/${cfg.league}/athletes/${athleteId}`);
  const profile = data?.athlete ?? null;
  toCache(key, profile);
  return profile;
}

// ─── TEAM FULL SCHEDULE ─────────────────────────────────────────────────────

export async function fetchTeamFullSchedule(tab: string, teamId: string): Promise<any[]> {
  const cfg = getLeagueCfg(tab);
  if (!cfg) return [];
  const key = `fullsched:${tab}:${teamId}`;
  const c = fromCache(key, TTL.scores);
  if (c) return c;
  const data = await safeFetch(
    `${ESPN}/${cfg.sport}/${cfg.league}/teams/${teamId}/schedule?season=${new Date().getFullYear()}&seasontype=2`
  );
  const events = data?.events ?? [];
  toCache(key, events);
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
  const key = `roster:${tab}:${teamId}:${season}`;
  const c = fromCache(key, TTL.roster);
  if (c) return c;
  const data = await safeFetch(
    `${ESPN}/${cfg.sport}/${cfg.league}/teams/${teamId}/roster?season=${season}`
  );
  const rawAthletes: any[] = data?.athletes ?? [];
  const roster = parseRosterAthletes(rawAthletes);
  if (roster.length > 0) toCache(key, roster);
  return roster;
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
