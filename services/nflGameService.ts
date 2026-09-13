/**
 * nflGameService — ESPN game summary API integration for the NFL Live Game Experience.
 *
 * Extends the existing nflScoreboard.ts pattern to pull the FULL ESPN game summary
 * endpoint which provides play-by-play, win probability, team/player stats, and
 * game situation data.
 *
 * Endpoint: GET https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event={gameId}
 *
 * Polling: 8s during live games, 60s for completed games, paused when tab hidden.
 */

import { scoreText } from '../src/lib/scoreText';

// ─── URLs ─────────────────────────────────────────────────────────────────────

const ESPN_SUMMARY = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NflTeamInfo {
  id: string;
  abbreviation: string;
  displayName: string;
  shortDisplayName: string;
  logo: string;
  color: string;
  altColor: string;
  score: number;
  record: string;
  homeAway: 'home' | 'away';
  winner?: boolean;
}

export interface NflPlay {
  id: string;
  sequenceNumber: number;
  text: string;
  shortText: string;
  type: string;         // e.g. 'Rush', 'Pass Reception', 'Punt', 'Kickoff'
  scoringPlay: boolean;
  scoreValue: number;
  clock: string;        // e.g. '12:45'
  period: number;
  down: number;
  distance: number;
  yardLine: number;
  yardsGained: number;
  team: 'home' | 'away' | null;
  /** Timestamp from ESPN for sorting */
  wallclock?: string;
}

export interface NflDrive {
  id: string;
  description: string;
  team: 'home' | 'away' | null;
  teamAbbreviation: string;
  teamLogo: string;
  result: string;         // e.g. 'Touchdown', 'Punt', 'Field Goal', 'Fumble'
  plays: NflPlay[];
  yards: number;
  timeOfPossession: string;
  isScoring: boolean;
}

export interface NflPlayerStatLine {
  id: string;
  name: string;
  shortName: string;
  headshot: string;
  jersey: string;
  position: string;
  team: 'home' | 'away';
  /** Stat columns vary by category — stored as label/value pairs */
  stats: string[];
  /** Category labels corresponding to stats array */
  labels: string[];
}

export interface NflPlayerStatCategory {
  name: string;         // e.g. 'passing', 'rushing', 'receiving', 'fumbles', 'kicking'
  displayName: string;
  labels: string[];     // Column headers: ['C/ATT', 'YDS', 'AVG', 'TD', 'INT']
  home: NflPlayerStatLine[];
  away: NflPlayerStatLine[];
}

export interface NflTeamStatItem {
  label: string;
  home: string;
  away: string;
  homeRaw: number;
  awayRaw: number;
}

export interface WinProbPoint {
  playId: string;
  homeWinPct: number;
  secondsLeft: number;
  text?: string;
}

export interface NflGameSituation {
  period: number;
  periodLabel: string;
  clock: string;
  down: number | null;
  distance: number | null;
  yardLine: number | null;
  possession: 'home' | 'away' | null;
  isRedZone: boolean;
  lastPlay: string;
  state: 'pre' | 'in' | 'post';
}

export interface NflGameSummary {
  gameId: string;
  home: NflTeamInfo;
  away: NflTeamInfo;
  situation: NflGameSituation;
  drives: NflDrive[];
  scoringPlays: NflPlay[];
  teamStats: NflTeamStatItem[];
  playerStats: NflPlayerStatCategory[];
  winProbability: WinProbPoint[];
  headlines: Array<{ text: string; shortText: string; videoUrl?: string; thumbnailUrl?: string }>;
  venue: string;
  broadcast: string;
  weather: string;
  fetchedAt: number;
}

// ─── Cache ────────────────────────────────────────────────────────────────────

const _cache = new Map<string, { data: NflGameSummary; ts: number }>();
const LIVE_TTL = 8_000;     // 8 seconds for live games
const POST_TTL = 60_000;    // 60 seconds for completed games

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseTeam(competitors: any[], side: 'home' | 'away'): NflTeamInfo {
  const c = competitors.find((x: any) => x.homeAway === side) ?? competitors[0];
  const team = c?.team ?? {};
  return {
    id: team.id ?? '',
    abbreviation: team.abbreviation ?? '',
    displayName: team.displayName ?? team.name ?? '',
    shortDisplayName: team.shortDisplayName ?? team.abbreviation ?? '',
    logo: team.logo ?? '',
    color: team.color ? `#${team.color}` : '#333333',
    altColor: team.alternateColor ? `#${team.alternateColor}` : '#666666',
    score: Number(scoreText(c?.score)) || 0,
    record: c?.records?.[0]?.summary ?? '',
    homeAway: side,
    winner: c?.winner,
  };
}

function identifyTeamSide(teamId: string, home: NflTeamInfo, away: NflTeamInfo): 'home' | 'away' | null {
  if (teamId === home.id) return 'home';
  if (teamId === away.id) return 'away';
  return null;
}

function parseDrives(raw: any, home: NflTeamInfo, away: NflTeamInfo): NflDrive[] {
  const previous = raw?.drives?.previous ?? [];
  const current = raw?.drives?.current;
  const all = current ? [...previous, current] : previous;

  return all.map((drive: any, idx: number) => {
    const teamId = drive.team?.id ?? '';
    const side = identifyTeamSide(teamId, home, away);
    const plays: NflPlay[] = (drive.plays ?? []).map((p: any) => ({
      id: p.id ?? `play-${idx}-${p.sequenceNumber}`,
      sequenceNumber: p.sequenceNumber ?? 0,
      text: p.text ?? p.description ?? '',
      shortText: p.shortText ?? p.text ?? '',
      type: p.type?.text ?? p.type?.abbreviation ?? '',
      scoringPlay: !!p.scoringPlay,
      scoreValue: p.scoreValue ?? 0,
      clock: p.clock?.displayValue ?? '',
      period: p.period?.number ?? 0,
      down: p.start?.down ?? 0,
      distance: p.start?.distance ?? 0,
      yardLine: p.start?.yardLine ?? 0,
      yardsGained: p.statYardage ?? 0,
      team: side,
      wallclock: p.wallclock,
    }));

    return {
      id: drive.id ?? `drive-${idx}`,
      description: drive.description ?? drive.displayResult ?? '',
      team: side,
      teamAbbreviation: drive.team?.abbreviation ?? '',
      teamLogo: drive.team?.logo ?? '',
      result: drive.displayResult ?? drive.result ?? '',
      plays,
      yards: drive.yards ?? 0,
      timeOfPossession: drive.timeOfPossession?.displayValue ?? '',
      isScoring: drive.isScore ?? plays.some((p: NflPlay) => p.scoringPlay),
    };
  });
}

function parseScoringPlays(raw: any, home: NflTeamInfo, away: NflTeamInfo): NflPlay[] {
  const plays = raw?.scoringPlays ?? [];
  return plays.map((p: any) => ({
    id: p.id ?? '',
    sequenceNumber: p.sequenceNumber ?? 0,
    text: p.text ?? '',
    shortText: p.shortText ?? p.text ?? '',
    type: p.type?.text ?? '',
    scoringPlay: true,
    scoreValue: p.scoreValue ?? 0,
    clock: p.clock?.displayValue ?? '',
    period: p.period?.number ?? 0,
    down: p.start?.down ?? 0,
    distance: p.start?.distance ?? 0,
    yardLine: p.start?.yardLine ?? 0,
    yardsGained: p.statYardage ?? 0,
    team: identifyTeamSide(p.team?.id ?? '', home, away),
  }));
}

function parseTeamStats(raw: any): NflTeamStatItem[] {
  const boxscore = raw?.boxscore;
  if (!boxscore?.teams) return [];

  // ESPN returns teams[0] and teams[1] — need to figure out which is home/away
  const team0 = boxscore.teams[0];
  const team1 = boxscore.teams[1];
  const homeTeamStats = team0?.homeAway === 'home' ? team0 : team1;
  const awayTeamStats = team0?.homeAway === 'home' ? team1 : team0;

  const homeStats = homeTeamStats?.statistics ?? [];
  const awayStats = awayTeamStats?.statistics ?? [];

  // Build a map of stat name → { home, away }
  const statMap = new Map<string, { label: string; home: string; away: string; homeRaw: number; awayRaw: number }>();

  homeStats.forEach((s: any) => {
    statMap.set(s.name, {
      label: s.displayValue ? s.label ?? s.name : s.name,
      home: s.displayValue ?? String(s.value ?? ''),
      away: '',
      homeRaw: Number(s.value) || 0,
      awayRaw: 0,
    });
  });

  awayStats.forEach((s: any) => {
    const existing = statMap.get(s.name);
    if (existing) {
      existing.away = s.displayValue ?? String(s.value ?? '');
      existing.awayRaw = Number(s.value) || 0;
    } else {
      statMap.set(s.name, {
        label: s.label ?? s.name,
        home: '',
        away: s.displayValue ?? String(s.value ?? ''),
        homeRaw: 0,
        awayRaw: Number(s.value) || 0,
      });
    }
  });

  return Array.from(statMap.values());
}

function parsePlayerStats(raw: any, home: NflTeamInfo, away: NflTeamInfo): NflPlayerStatCategory[] {
  const boxscore = raw?.boxscore;
  if (!boxscore?.players) return [];

  const categories: NflPlayerStatCategory[] = [];
  const playerTeams = boxscore.players as any[];

  // ESPN structure: players[teamIdx].statistics[catIdx].athletes[playerIdx]
  // Merge home/away into unified categories
  const catMap = new Map<string, NflPlayerStatCategory>();

  playerTeams.forEach((teamBlock: any) => {
    const side: 'home' | 'away' = teamBlock.homeAway === 'home' ? 'home' : 'away';

    (teamBlock.statistics ?? []).forEach((cat: any) => {
      const catName = cat.name ?? cat.type ?? '';
      if (!catMap.has(catName)) {
        catMap.set(catName, {
          name: catName,
          displayName: cat.text ?? cat.displayName ?? catName,
          labels: (cat.labels ?? cat.keys ?? []).map((l: any) => typeof l === 'string' ? l : l?.displayValue ?? ''),
          home: [],
          away: [],
        });
      }

      const category = catMap.get(catName)!;
      (cat.athletes ?? []).forEach((athlete: any) => {
        const a = athlete.athlete ?? athlete;
        const line: NflPlayerStatLine = {
          id: a.id ?? '',
          name: a.displayName ?? a.fullName ?? '',
          shortName: a.shortName ?? a.displayName ?? '',
          headshot: a.headshot?.href ?? a.headshot ?? '',
          jersey: a.jersey ?? '',
          position: a.position?.abbreviation ?? a.position ?? '',
          team: side,
          stats: (athlete.stats ?? []).map((s: any) => String(s)),
          labels: category.labels,
        };
        category[side].push(line);
      });
    });
  });

  catMap.forEach(cat => categories.push(cat));
  return categories;
}

function parseWinProbability(raw: any): WinProbPoint[] {
  const wp = raw?.winprobability ?? raw?.winProbability ?? [];
  return wp.map((point: any) => ({
    playId: point.playId ?? '',
    homeWinPct: (point.homeWinPercentage ?? point.homeWinPct ?? 0.5) * 100,
    secondsLeft: point.secondsLeft ?? 0,
    text: point.text ?? '',
  }));
}

function parseHeadlines(raw: any): NflGameSummary['headlines'] {
  const headlines = raw?.news?.articles ?? raw?.headlines ?? [];
  return headlines.slice(0, 10).map((h: any) => {
    const video = h.video?.[0] ?? h.videos?.[0];
    const image = h.images?.[0];
    return {
      text: h.headline ?? h.title ?? '',
      shortText: h.description ?? h.shortLinkText ?? '',
      videoUrl: video?.links?.source?.href ?? video?.links?.web?.href ?? video?.source?.href ?? undefined,
      thumbnailUrl: image?.url ?? video?.thumbnail ?? undefined,
    };
  });
}

function parseSituation(raw: any, home: NflTeamInfo, away: NflTeamInfo): NflGameSituation {
  const header = raw?.header;
  const competition = header?.competitions?.[0] ?? {};
  const status = competition.status ?? header?.status ?? {};
  const statusType = status.type ?? {};
  const situation = raw?.situation ?? competition.situation ?? {};

  const state: 'pre' | 'in' | 'post' =
    statusType.state === 'in' ? 'in' :
    statusType.completed ? 'post' : 'pre';

  const possTeamId = situation.possession ?? situation.team?.id ?? '';

  return {
    period: status.period ?? 0,
    periodLabel: statusType.shortDetail ?? statusType.detail ?? '',
    clock: status.displayClock ?? '',
    down: situation.down ?? situation.$ref ? null : null,
    distance: situation.distance ?? null,
    yardLine: situation.yardLine ?? null,
    possession: identifyTeamSide(possTeamId, home, away),
    isRedZone: !!(situation.isRedZone ?? (situation.yardLine != null && situation.yardLine <= 20)),
    lastPlay: situation.lastPlay?.text ?? raw?.drives?.current?.plays?.slice(-1)?.[0]?.text ?? '',
    state,
  };
}

// ─── Main fetch & parse ───────────────────────────────────────────────────────

export function parseNflGameSummary(data: any, gameId: string): NflGameSummary {
  const header = data?.header;
  const competition = header?.competitions?.[0] ?? {};
  const competitors = competition.competitors ?? [];

  const home = parseTeam(competitors, 'home');
  const away = parseTeam(competitors, 'away');

  return {
    gameId,
    home,
    away,
    situation: parseSituation(data, home, away),
    drives: parseDrives(data, home, away),
    scoringPlays: parseScoringPlays(data, home, away),
    teamStats: parseTeamStats(data),
    playerStats: parsePlayerStats(data, home, away),
    winProbability: parseWinProbability(data),
    headlines: parseHeadlines(data),
    venue: competition.venue?.fullName ?? '',
    broadcast: competition.broadcasts?.[0]?.names?.[0] ?? '',
    weather: data?.gameInfo?.weather?.displayValue ?? '',
    fetchedAt: Date.now(),
  };
}

export async function fetchNflGameSummary(
  gameId: string,
  signal?: AbortSignal
): Promise<NflGameSummary> {
  // Check cache
  const cached = _cache.get(gameId);
  if (cached) {
    const ttl = cached.data.situation.state === 'in' ? LIVE_TTL : POST_TTL;
    if (Date.now() - cached.ts < ttl) return cached.data;
  }

  const url = `${ESPN_SUMMARY}?event=${encodeURIComponent(gameId)}`;
  const response = await fetch(url, { signal, cache: 'no-store' });
  if (!response.ok) throw new Error(`NFL game summary unavailable (${response.status})`);

  const raw = await response.json();
  const summary = parseNflGameSummary(raw, gameId);

  _cache.set(gameId, { data: summary, ts: Date.now() });
  return summary;
}

/** Returns polling interval in ms based on game state */
export function getPollingInterval(state: 'pre' | 'in' | 'post'): number {
  switch (state) {
    case 'in': return LIVE_TTL;
    case 'pre': return 30_000;
    case 'post': return POST_TTL;
  }
}
