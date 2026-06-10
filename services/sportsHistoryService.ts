// Historical sports data via ESPN free public API.
// Browser requests route through /api/proxy; server workers fetch sources directly.
import {
  makeSportsDocId,
  readSportsKnowledge,
  sportsSource,
  writeSportsKnowledge,
} from './sportsKnowledgeService';

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';
const ESPN_STATS = 'https://sports.core.api.espn.com/v2/sports';

const _cache = new Map<string, { data: any; ts: number }>();
const TTL = 2 * 60 * 60 * 1000; // 2 hours for historical data

function fromCache(key: string) {
  const h = _cache.get(key);
  return h && Date.now() - h.ts < TTL ? h.data : null;
}
function toCache(key: string, data: any) { _cache.set(key, { data, ts: Date.now() }); }

async function espnFetch(url: string): Promise<any> {
  const key = url;
  const hit = fromCache(key);
  if (hit !== null) return hit;
  try {
    const isBrowser = typeof window !== 'undefined';
    const requestUrl = isBrowser ? `/api/proxy?url=${encodeURIComponent(url)}` : url;
    const res = await fetch(requestUrl);
    if (!res.ok) return null;
    const data = await res.json();
    toCache(key, data);
    return data;
  } catch {
    return null;
  }
}

// ─── League config ────────────────────────────────────────────────────────────

const LEAGUES: Record<string, { sport: string; league: string }> = {
  NBA:  { sport: 'basketball', league: 'nba' },
  NFL:  { sport: 'football',   league: 'nfl' },
  NHL:  { sport: 'hockey',     league: 'nhl' },
  MLB:  { sport: 'baseball',   league: 'mlb' },
  NCAA: { sport: 'basketball', league: 'mens-college-basketball' },
  WNBA: { sport: 'basketball', league: 'wnba' },
  FIFA: { sport: 'soccer',     league: 'eng.1' },
  MLS:  { sport: 'soccer',     league: 'usa.1' },
};

export type HistorySeason = {
  year: number;
  label: string;
};

export function getAvailableSeasons(tab: string): HistorySeason[] {
  const current = new Date().getFullYear();
  const startYear: Record<string, number> = {
    NBA: 1980, NFL: 1970, NHL: 1980, MLB: 1970, NCAA: 1990, WNBA: 1997, FIFA: 2000, MLS: 2000,
  };
  const start = startYear[tab] ?? 2000;
  const seasons: HistorySeason[] = [];
  for (let y = current; y >= start; y--) {
    seasons.push({ year: y, label: `${y}–${String(y + 1).slice(2)}` });
  }
  return seasons;
}

// ─── Player stats ─────────────────────────────────────────────────────────────

export interface PlayerSeasonStats {
  athleteId: string;
  athleteName: string;
  teamName: string;
  season: number;
  categories: {
    name: string;
    displayName: string;
    stats: { name: string; displayName: string; abbreviation: string; displayValue: string; value: number }[];
  }[];
}

export async function fetchPlayerSeasonStats(
  tab: string,
  athleteId: string,
  season: number,
): Promise<PlayerSeasonStats | null> {
  const cfg = LEAGUES[tab];
  if (!cfg) return null;
  const key = `playerstats:${tab}:${athleteId}:${season}`;
  const hit = fromCache(key);
  if (hit !== null) return hit;
  const stored = await readSportsKnowledge<PlayerSeasonStats>('sports_player_stats', makeSportsDocId(tab, athleteId, season));

  // The site-API athlete statistics endpoint 404s now — the core API carries it.
  const sourceUrl = `${ESPN_STATS}/${cfg.sport}/leagues/${cfg.league}/seasons/${season}/types/2/athletes/${athleteId}/statistics`;
  const data = await espnFetch(sourceUrl);
  if (!data) return stored?.data ?? null;

  const result: PlayerSeasonStats = {
    athleteId,
    athleteName: data.athlete?.fullName ?? '',
    teamName: data.team?.displayName ?? '',
    season,
    categories: (data.splits?.categories ?? data.statistics?.splits?.categories ?? []).map((cat: any) => ({
      name: cat.name,
      displayName: cat.displayName || cat.name,
      stats: (cat.stats ?? []).map((s: any) => ({
        name: s.name,
        displayName: s.displayName || s.name,
        abbreviation: s.abbreviation || s.name,
        displayValue: s.displayValue ?? String(s.value ?? ''),
        value: typeof s.value === 'number' ? s.value : parseFloat(s.displayValue) || 0,
      })),
    })),
  };
  toCache(key, result);
  if (result.categories.some(c => c.stats.length > 0)) {
    writeSportsKnowledge('sports_player_stats', makeSportsDocId(tab, athleteId, season), result, [
      sportsSource('ESPN', sourceUrl, `${tab} player season stats ${athleteId} ${season}`),
    ], ['sports', tab, 'player_stats', athleteId, String(season)], 'HIGH').catch(() => {});
  }
  return result;
}

// ─── Player career stats (multi-season) ───────────────────────────────────────

export async function fetchPlayerCareerStats(
  tab: string,
  athleteId: string,
  fromYear = 2015,
): Promise<PlayerSeasonStats[]> {
  const current = new Date().getFullYear();
  const seasons = Array.from({ length: current - fromYear + 1 }, (_, i) => fromYear + i);
  const results = await Promise.allSettled(
    seasons.map(y => fetchPlayerSeasonStats(tab, athleteId, y)),
  );
  return results
    .filter(r => r.status === 'fulfilled' && r.value?.categories.some(c => c.stats.length > 0))
    .map(r => (r as PromiseFulfilledResult<PlayerSeasonStats>).value!);
}

// ─── Team season record ───────────────────────────────────────────────────────

export interface TeamSeasonRecord {
  teamId: string;
  season: number;
  overall: { wins: number; losses: number; ties?: number; pct: number };
  home?: { wins: number; losses: number };
  away?: { wins: number; losses: number };
  postseason?: { wins: number; losses: number };
  pointsFor?: number;
  pointsAgainst?: number;
  streak?: string;
  standingRank?: number;
  conferenceRank?: number;
}

export async function fetchTeamSeasonRecord(
  tab: string,
  teamId: string,
  season: number,
): Promise<TeamSeasonRecord | null> {
  const cfg = LEAGUES[tab];
  if (!cfg) return null;
  const key = `teamrecord:${tab}:${teamId}:${season}`;
  const hit = fromCache(key);
  if (hit !== null) return hit;
  const stored = await readSportsKnowledge<TeamSeasonRecord>('sports_team_stats', makeSportsDocId(tab, teamId, season, 'record'));

  const sourceUrl = `${ESPN}/${cfg.sport}/${cfg.league}/teams/${teamId}?enable=record&season=${season}`;
  const data = await espnFetch(sourceUrl);
  if (!data?.team) return stored?.data ?? null;

  const records: any[] = data.team?.record?.items ?? [];
  const getRecord = (type: string) => records.find((r: any) => r.type === type || r.name === type);
  const overall = getRecord('overall') ?? getRecord('Total');
  const home = getRecord('home');
  const away = getRecord('away');
  const postseason = getRecord('postseason');

  const getStat = (rec: any, name: string) =>
    rec?.stats?.find((s: any) => s.name === name || s.abbreviation?.toLowerCase() === name.toLowerCase())?.value ?? 0;

  const result: TeamSeasonRecord = {
    teamId,
    season,
    overall: {
      wins: getStat(overall, 'wins'),
      losses: getStat(overall, 'losses'),
      ties: getStat(overall, 'ties') || undefined,
      pct: getStat(overall, 'winPercent') || getStat(overall, 'PCT'),
    },
    home: home ? { wins: getStat(home, 'wins'), losses: getStat(home, 'losses') } : undefined,
    away: away ? { wins: getStat(away, 'wins'), losses: getStat(away, 'losses') } : undefined,
    postseason: postseason ? { wins: getStat(postseason, 'wins'), losses: getStat(postseason, 'losses') } : undefined,
    streak: overall?.stats?.find((s: any) => s.name === 'streak')?.displayValue,
  };
  toCache(key, result);
  writeSportsKnowledge('sports_team_stats', makeSportsDocId(tab, teamId, season, 'record'), result, [
    sportsSource('ESPN', sourceUrl, `${tab} team record ${teamId} ${season}`),
  ], ['sports', tab, 'team_record', teamId, String(season)], 'HIGH').catch(() => {});
  return result;
}

// ─── Team multi-season records (for sparklines/trends) ───────────────────────

export async function fetchTeamSeasonHistory(
  tab: string,
  teamId: string,
  fromYear = 2010,
): Promise<TeamSeasonRecord[]> {
  const current = new Date().getFullYear();
  const seasons = Array.from({ length: current - fromYear + 1 }, (_, i) => fromYear + i);
  const results = await Promise.allSettled(
    seasons.map(y => fetchTeamSeasonRecord(tab, teamId, y)),
  );
  return results
    .filter(r => r.status === 'fulfilled' && r.value !== null)
    .map(r => (r as PromiseFulfilledResult<TeamSeasonRecord>).value!);
}

// ─── Historical league leaders ────────────────────────────────────────────────

export interface HistoricalLeader {
  season: number;
  athleteId: string;
  name: string;
  teamName: string;
  photoUrl?: string;
  displayValue: string;
  value: number;
}

export interface HistoricalLeaderCategory {
  name: string;
  displayName: string;
  leaders: HistoricalLeader[];
}

export async function fetchHistoricalLeaders(
  tab: string,
  season: number,
): Promise<HistoricalLeaderCategory[]> {
  const cfg = LEAGUES[tab];
  if (!cfg || tab === 'FIFA' || tab === 'MLS') return [];
  const key = `leaders:${tab}:${season}`;
  const hit = fromCache(key);
  if (hit !== null) return hit;
  const stored = await readSportsKnowledge<HistoricalLeaderCategory[]>('sports_league_leaders', makeSportsDocId(tab, season, 'leaders'));

  // Site-API /leaders 404s — core API keeps per-season leaders (athletes as $refs)
  const sourceUrl = `${ESPN_STATS}/${cfg.sport}/leagues/${cfg.league}/seasons/${season}/types/2/leaders?limit=10`;
  const data = await espnFetch(sourceUrl);
  if (!Array.isArray(data?.categories)) return stored?.data ?? [];

  const resolveRef = async (ref?: string) => ref ? espnFetch(ref.replace('http://', 'https://')) : null;

  const PRIORITY: Record<string, string[]> = {
    NBA:  ['pointsPerGame', 'reboundsPerGame', 'assistsPerGame', 'blocksPerGame', 'stealsPerGame'],
    NFL:  ['passingYards', 'rushingYards', 'receivingYards', 'sacks', 'interceptions'],
    NHL:  ['points', 'goals', 'assists', 'plusMinus', 'savePercentage'],
    MLB:  ['battingAvg', 'homeRuns', 'rbi', 'era', 'strikeouts'],
    NCAA: ['pointsPerGame', 'reboundsPerGame', 'assistsPerGame'],
    WNBA: ['pointsPerGame', 'reboundsPerGame', 'assistsPerGame'],
  };
  const priority = PRIORITY[tab] ?? [];

  const rawCats = (data.categories as any[])
    .filter((c: any) => !priority.length || priority.includes(c.name))
    .sort((a: any, b: any) => {
      const ai = priority.indexOf(a.name);
      const bi = priority.indexOf(b.name);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    })
    .slice(0, 6);

  const cats: HistoricalLeaderCategory[] = await Promise.all(rawCats.map(async (cat: any) => ({
    name: cat.name,
    displayName: cat.displayName || cat.name,
    leaders: await Promise.all((cat.leaders ?? []).slice(0, 5).map(async (l: any) => {
      const [athlete, team] = await Promise.all([resolveRef(l.athlete?.$ref), resolveRef(l.team?.$ref)]);
      return {
        season,
        athleteId: String(athlete?.id ?? ''),
        name: athlete?.displayName ?? athlete?.fullName ?? 'Unknown',
        teamName: team?.displayName ?? '',
        photoUrl: athlete?.headshot?.href ?? '',
        displayValue: l.displayValue ?? String(l.value ?? ''),
        value: l.value ?? 0,
      };
    })),
  })));

  toCache(key, cats);
  if (cats.length) {
    writeSportsKnowledge('sports_league_leaders', makeSportsDocId(tab, season, 'leaders'), cats, [
      sportsSource('ESPN', sourceUrl, `${tab} historical leaders ${season}`),
    ], ['sports', tab, 'leaders', String(season)], 'HIGH').catch(() => {});
  }
  return cats;
}

// ─── Player search ────────────────────────────────────────────────────────────

export interface PlayerSearchResult {
  id: string;
  name: string;
  displayName: string;
  position: string;
  teamName: string;
  teamLogo?: string;
  headshot?: string;
}

export async function searchPlayers(tab: string, query: string): Promise<PlayerSearchResult[]> {
  if (query.trim().length < 2) return [];
  const cfg = LEAGUES[tab];
  if (!cfg) return [];
  const key = `search:${tab}:${query.toLowerCase()}`;
  const hit = fromCache(key);
  if (hit !== null) return hit;

  // The site-API athlete search 404s now — use ESPN's common v3 search and
  // filter results down to this league.
  const data = await espnFetch(
    `https://site.web.api.espn.com/apis/common/v3/search?query=${encodeURIComponent(query)}&limit=20&mode=prefix&type=player`,
  );

  const items: any[] = data?.items ?? [];
  const results: PlayerSearchResult[] = items
    .filter((a: any) => a.sport === cfg.sport && (a.league === cfg.league || a.defaultLeagueSlug === cfg.league))
    .map((a: any) => ({
      id: String(a.id ?? ''),
      name: a.displayName ?? '',
      displayName: a.displayName ?? '',
      position: a.subtitle ?? '',
      teamName: a.teamName ?? a.subtitle ?? '',
      teamLogo: '',
      headshot: a.image?.default ?? `https://a.espncdn.com/i/headshots/${cfg.league}/players/full/${a.id}.png`,
    })).filter(p => p.id && p.name);

  toCache(key, results);
  return results;
}

// ─── Historical scoreboard (past games) ──────────────────────────────────────

export async function fetchHistoricalScores(
  tab: string,
  dateStr: string, // YYYYMMDD
): Promise<any[]> {
  const cfg = LEAGUES[tab];
  if (!cfg) return [];
  const key = `scores:${tab}:${dateStr}`;
  const hit = fromCache(key);
  if (hit !== null) return hit;
  const stored = await readSportsKnowledge<any[]>('sports_league_scores', makeSportsDocId(tab, dateStr));

  const sourceUrl = `${ESPN}/${cfg.sport}/${cfg.league}/scoreboard?dates=${dateStr}`;
  const data = await espnFetch(sourceUrl);
  const events = data?.events ?? stored?.data ?? [];
  toCache(key, events);
  if (events.length) {
    writeSportsKnowledge('sports_league_scores', makeSportsDocId(tab, dateStr), events, [
      sportsSource('ESPN', sourceUrl, `${tab} scoreboard ${dateStr}`),
    ], ['sports', tab, 'scores', dateStr], 'HIGH').catch(() => {});
  }
  return events;
}

// ─── Team stats (season totals for comparison) ───────────────────────────────

export interface TeamSeasonStats {
  teamId: string;
  teamName: string;
  season: number;
  stats: { name: string; displayName: string; displayValue: string; value: number; rank?: number }[];
}

export async function fetchTeamSeasonStats(
  tab: string,
  teamId: string,
  season: number,
): Promise<TeamSeasonStats | null> {
  const cfg = LEAGUES[tab];
  if (!cfg) return null;
  const key = `teamstats:${tab}:${teamId}:${season}`;
  const hit = fromCache(key);
  if (hit !== null) return hit;
  const stored = await readSportsKnowledge<TeamSeasonStats>('sports_team_stats', makeSportsDocId(tab, teamId, season, 'stats'));

  const sourceUrl = `${ESPN}/${cfg.sport}/${cfg.league}/teams/${teamId}/statistics?season=${season}&seasontype=2`;
  const data = await espnFetch(sourceUrl);
  if (!data) return stored?.data ?? null;

  const splits = data.results?.splits ?? data.splits ?? {};
  const cats = splits.categories ?? [];
  const allStats = cats.flatMap((c: any) => c.stats ?? []);

  const result: TeamSeasonStats = {
    teamId,
    teamName: data.team?.displayName ?? '',
    season,
    stats: allStats.map((s: any) => ({
      name: s.name,
      displayName: s.displayName || s.name,
      displayValue: s.displayValue ?? String(s.value ?? ''),
      value: typeof s.value === 'number' ? s.value : parseFloat(s.displayValue) || 0,
      rank: s.rank,
    })),
  };
  toCache(key, result);
  if (result.stats.length) {
    writeSportsKnowledge('sports_team_stats', makeSportsDocId(tab, teamId, season, 'stats'), result, [
      sportsSource('ESPN', sourceUrl, `${tab} team stats ${teamId} ${season}`),
    ], ['sports', tab, 'team_stats', teamId, String(season)], 'HIGH').catch(() => {});
  }
  return result;
}

// ─── NASCAR / IndyCar historical data ─────────────────────────────────────────

export async function fetchRacingSeasonResults(
  tab: string, // 'NASCAR' | 'INDYCAR'
  season: number,
): Promise<any[]> {
  const cfgMap: Record<string, { sport: string; league: string }> = {
    NASCAR:  { sport: 'racing', league: 'nascar-premier' },
    INDYCAR: { sport: 'racing', league: 'irl' },
    F1:      { sport: 'racing', league: 'f1' },
  };
  const cfg = cfgMap[tab];
  if (!cfg) return [];
  const key = `racing:results:${tab}:${season}`;
  const hit = fromCache(key);
  if (hit !== null) return hit;

  const data = await espnFetch(
    `${ESPN}/${cfg.sport}/${cfg.league}/scoreboard?season=${season}&seasontype=2&limit=40`,
  );
  const events = data?.events ?? [];
  toCache(key, events);
  return events;
}

export async function fetchRacingDriverStandingsByYear(
  tab: string,
  season: number,
): Promise<any[]> {
  const cfgMap: Record<string, { sport: string; league: string }> = {
    NASCAR:  { sport: 'racing', league: 'nascar-premier' },
    INDYCAR: { sport: 'racing', league: 'irl' },
    F1:      { sport: 'racing', league: 'f1' },
  };
  const cfg = cfgMap[tab];
  if (!cfg) return [];
  const key = `racing:standings:${tab}:${season}`;
  const hit = fromCache(key);
  if (hit !== null) return hit;

  const data = await espnFetch(
    `https://site.web.api.espn.com/apis/v2/sports/${cfg.sport}/${cfg.league}/standings?season=${season}`,
  );
  const entries = data?.children?.[0]?.standings?.entries ?? data?.standings?.entries ?? [];
  toCache(key, entries);
  return entries;
}
