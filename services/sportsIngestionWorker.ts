import {
  fetchEsportsNews,
  fetchLeagueLeaders,
  fetchLeagueNews,
  fetchLeagueScores,
  fetchLeagueStandings,
  fetchLeagueTeams,
  fetchPlayerProfile,
  fetchRacingNews,
  fetchRacingSchedule,
  fetchRacingStandings,
  fetchRichTeamPage,
  fetchTeamFullSchedule,
  fetchTeamRosterForSeason,
  getSpecialtySportCfg,
} from './sportsService';
import {
  fetchHistoricalLeaders,
  fetchPlayerSeasonStats,
  fetchRacingDriverStandingsByYear,
  fetchRacingSeasonResults,
  fetchTeamSeasonRecord,
  fetchTeamSeasonStats,
} from './sportsHistoryService';
import {
  makeSportsDocId,
  seedSportsSourceRegistry,
  sportsSource,
  writeSportsKnowledge,
} from './sportsKnowledgeService';

export type SportsIngestionScope = 'lite' | 'standard' | 'deep';

export interface SportsIngestionOptions {
  scope?: SportsIngestionScope;
  leagues?: string[];
  includeHistory?: boolean;
  investigateEvents?: boolean;
  reason?: string;
  maxEventsPerLeague?: number;
  maxTeamsPerLeague?: number;
  maxPlayersPerTeam?: number;
}

export interface SportsIngestionRunSummary {
  id: string;
  status: 'completed' | 'failed' | 'skipped';
  reason: string;
  scope: SportsIngestionScope;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  leagues: string[];
  counts: Record<string, number>;
  errors: { label: string; message: string }[];
}

const CORE_LEAGUES = [
  'NBA', 'NFL', 'MLB', 'NHL', 'WNBA', 'NCAA', 'FIFA', 'MLS',
  'UFC', 'MMA', 'BOXING', 'MARTIAL_ARTS', 'FENCING', 'TENNIS', 'GOLF',
  'CRICKET', 'RUGBY', 'WRESTLING', 'VOLLEYBALL', 'LACROSSE', 'ESPORTS',
];

const RACING_LEAGUES = ['F1', 'NASCAR', 'INDYCAR'];
const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000;

let activeRun: Promise<SportsIngestionRunSummary> | null = null;
let schedulerStarted = false;

const currentSeason = () => new Date().getFullYear();
const previousSeason = () => currentSeason() - 1;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function normalizeLeagues(leagues?: string[]) {
  const requested = leagues?.length ? leagues : [...CORE_LEAGUES, ...RACING_LEAGUES];
  return [...new Set(requested.map(l => String(l).trim().toUpperCase()).filter(Boolean))];
}

function getLimits(scope: SportsIngestionScope, options: SportsIngestionOptions) {
  const defaults = scope === 'deep'
    ? { teams: 24, players: 18, events: 24 }
    : scope === 'standard'
      ? { teams: 12, players: 10, events: 14 }
      : { teams: 6, players: 6, events: 8 };
  return {
    maxTeamsPerLeague: options.maxTeamsPerLeague ?? defaults.teams,
    maxPlayersPerTeam: options.maxPlayersPerTeam ?? defaults.players,
    maxEventsPerLeague: options.maxEventsPerLeague ?? defaults.events,
    includeHistory: options.includeHistory ?? scope !== 'lite',
    investigateEvents: options.investigateEvents ?? true,
  };
}

function makeRunId(reason: string) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `sports-ingestion-${reason}-${stamp}`;
}

function flattenRoster(roster: { athletes?: any[] }[]) {
  return roster.flatMap(group => group.athletes ?? []);
}

function getAthleteId(athlete: any) {
  return String(athlete?.id ?? athlete?.athlete?.id ?? athlete?.uid ?? '').trim();
}

function getTeamIdFromCompetitor(competitor: any) {
  return String(competitor?.team?.id ?? competitor?.id ?? '').trim();
}

function getTeamNameFromCompetitor(competitor: any) {
  return String(
    competitor?.team?.displayName ??
    competitor?.team?.shortDisplayName ??
    competitor?.team?.name ??
    competitor?.displayName ??
    '',
  ).trim();
}

function extractScheduledEventTargets(events: any[]) {
  return events
    .filter(event => event?.id || event?.uid)
    .map(event => ({
      id: String(event.id ?? event.uid),
      uid: event.uid,
      name: event.name ?? event.shortName ?? event.title ?? '',
      shortName: event.shortName ?? '',
      date: event.date ?? event.startDate ?? '',
      status: event.status?.type?.description ?? event.status?.type?.name ?? event.status?.displayClock ?? '',
      venue: event.competitions?.[0]?.venue?.fullName ?? event.venue?.fullName ?? '',
      competitors: (event.competitions?.[0]?.competitors ?? event.competitors ?? [])
        .map((competitor: any) => ({
          teamId: getTeamIdFromCompetitor(competitor),
          teamName: getTeamNameFromCompetitor(competitor),
          homeAway: competitor.homeAway ?? '',
          score: competitor.score ?? '',
        }))
        .filter((team: any) => team.teamId || team.teamName),
      raw: event,
    }));
}

async function investigateEventLead(
  league: string,
  eventLead: ReturnType<typeof extractScheduledEventTargets>[number],
  options: ReturnType<typeof getLimits>,
  counts: Record<string, number>,
  errors: SportsIngestionRunSummary['errors'],
) {
  const investigatedTeams: any[] = [];

  for (const competitor of eventLead.competitors.slice(0, 4)) {
    const teamId = competitor.teamId;
    if (!teamId) continue;
    const [teamPage, schedule, roster] = await Promise.all([
      safeStep(`${league}:event:${eventLead.id}:${teamId}:teamPage`, errors, counts, 'eventTeamPages', () =>
        fetchRichTeamPage(league, teamId, competitor.teamName, '', undefined)),
      safeStep(`${league}:event:${eventLead.id}:${teamId}:schedule`, errors, counts, 'eventTeamSchedules', () =>
        fetchTeamFullSchedule(league, teamId)),
      safeStep(`${league}:event:${eventLead.id}:${teamId}:roster`, errors, counts, 'eventTeamRosters', () =>
        fetchTeamRosterForSeason(league, teamId, currentSeason())),
    ]);

    const athletes = flattenRoster(roster ?? []).slice(0, options.maxPlayersPerTeam);
    for (const athlete of athletes) {
      const athleteId = getAthleteId(athlete);
      if (!athleteId) continue;
      await safeStep(`${league}:event:${eventLead.id}:${teamId}:${athleteId}:profile`, errors, counts, 'eventPlayerProfiles', () =>
        fetchPlayerProfile(league, athleteId));
      if (options.includeHistory) {
        await safeStep(`${league}:event:${eventLead.id}:${teamId}:${athleteId}:stats`, errors, counts, 'eventPlayerStats', () =>
          fetchPlayerSeasonStats(league, athleteId, previousSeason()));
      }
    }

    if (options.includeHistory) {
      await safeStep(`${league}:event:${eventLead.id}:${teamId}:record`, errors, counts, 'eventTeamRecords', () =>
        fetchTeamSeasonRecord(league, teamId, previousSeason()));
      await safeStep(`${league}:event:${eventLead.id}:${teamId}:stats`, errors, counts, 'eventTeamStats', () =>
        fetchTeamSeasonStats(league, teamId, previousSeason()));
    }

    investigatedTeams.push({
      ...competitor,
      rosterGroups: roster?.length ?? 0,
      scheduleEvents: schedule?.length ?? 0,
      hasTeamPage: Boolean(teamPage),
      sampledPlayers: athletes.map((athlete: any) => ({
        id: getAthleteId(athlete),
        name: athlete?.displayName ?? athlete?.fullName ?? athlete?.athlete?.displayName ?? '',
      })).filter((athlete: any) => athlete.id || athlete.name),
    });
  }

  const dossier = {
    league,
    eventId: eventLead.id,
    uid: eventLead.uid,
    name: eventLead.name,
    shortName: eventLead.shortName,
    date: eventLead.date,
    status: eventLead.status,
    venue: eventLead.venue,
    competitors: eventLead.competitors,
    investigatedTeams,
    researchFocus: [
      'scheduled_event',
      'participants',
      'team_context',
      'current_rosters',
      'recent_schedules',
      ...(options.includeHistory ? ['previous_season_records', 'previous_season_stats', 'player_stats'] : []),
    ],
    rawEvent: eventLead.raw,
  };

  await writeSportsKnowledge(
    'sports_game_event_research',
    makeSportsDocId(league, eventLead.id),
    dossier,
    [sportsSource('ESPN', `https://site.api.espn.com/apis/site/v2/sports/${league.toLowerCase()}/scoreboard`, `${league} event research ${eventLead.id}`)],
    ['sports', league, 'event_research', eventLead.id],
    'HIGH',
  ).catch(() => {});
  counts.eventResearchDossiers = (counts.eventResearchDossiers ?? 0) + 1;
}

async function recordRun(summary: SportsIngestionRunSummary) {
  await writeSportsKnowledge(
    'sports_ingestion_runs',
    summary.id,
    summary,
    [sportsSource('Plajah', 'internal://sports-ingestion-worker', 'Plajah Sports ingestion worker')],
    ['sports', 'ingestion', summary.status],
    summary.status === 'completed' ? 'HIGH' : 'LOW',
  ).catch(() => {});
}

async function safeStep<T>(
  label: string,
  errors: SportsIngestionRunSummary['errors'],
  counts: Record<string, number>,
  counter: string,
  task: () => Promise<T>,
) {
  try {
    const result = await task();
    if (Array.isArray(result)) counts[counter] = (counts[counter] ?? 0) + result.length;
    else if (result) counts[counter] = (counts[counter] ?? 0) + 1;
    return result;
  } catch (err: any) {
    errors.push({ label, message: err?.message || String(err) });
    return null;
  }
}

async function ingestLeague(
  league: string,
  options: ReturnType<typeof getLimits>,
  counts: Record<string, number>,
  errors: SportsIngestionRunSummary['errors'],
) {
  if (RACING_LEAGUES.includes(league)) {
    const racingSchedule = await safeStep(`${league}:schedule`, errors, counts, 'racingSchedules', () => fetchRacingSchedule(league)) ?? [];
    await safeStep(`${league}:standings`, errors, counts, 'racingStandings', () => fetchRacingStandings(league));
    await safeStep(`${league}:news`, errors, counts, 'racingNews', () => fetchRacingNews(league));
    if (options.investigateEvents) {
      for (const race of racingSchedule.slice(0, options.maxEventsPerLeague)) {
        await writeSportsKnowledge(
          'sports_game_event_research',
          makeSportsDocId(league, race.id ?? race.name ?? race.date),
          {
            league,
            eventId: race.id ?? '',
            name: race.name ?? '',
            date: race.date ?? '',
            status: race.status ?? '',
            venue: race.venue ?? race.city ?? '',
            competitors: [],
            investigatedTeams: [],
            researchFocus: ['scheduled_race', 'race_calendar', 'driver_standings', 'race_history'],
            rawEvent: race,
          },
          [sportsSource('ESPN', `https://www.espn.com/racing/schedule/_/series/${league.toLowerCase()}`, `${league} race research`)],
          ['sports', league, 'event_research', 'race'],
          'MEDIUM',
        ).catch(() => {});
        counts.eventResearchDossiers = (counts.eventResearchDossiers ?? 0) + 1;
      }
    }
    if (options.includeHistory) {
      await safeStep(`${league}:seasonResults`, errors, counts, 'historicalRacingResults', () => fetchRacingSeasonResults(league, previousSeason()));
      await safeStep(`${league}:driverStandings`, errors, counts, 'historicalRacingStandings', () => fetchRacingDriverStandingsByYear(league, previousSeason()));
    }
    return;
  }

  if (league === 'ESPORTS') {
    await safeStep('ESPORTS:news', errors, counts, 'esportsNews', () => fetchEsportsNews());
    return;
  }

  await safeStep(`${league}:news`, errors, counts, 'leagueNews', () => fetchLeagueNews(league));
  const leagueEvents = await safeStep(`${league}:scores`, errors, counts, 'leagueScores', () => fetchLeagueScores(league)) ?? [];
  await safeStep(`${league}:leaders`, errors, counts, 'leagueLeaders', () => fetchLeagueLeaders(league));

  if (getSpecialtySportCfg(league)) return;

  if (options.investigateEvents) {
    const eventLeads = extractScheduledEventTargets(leagueEvents).slice(0, options.maxEventsPerLeague);
    for (const eventLead of eventLeads) {
      await investigateEventLead(league, eventLead, options, counts, errors);
      await sleep(120);
    }
  }

  await safeStep(`${league}:standings`, errors, counts, 'leagueStandings', () => fetchLeagueStandings(league));
  const teams = await safeStep(`${league}:teams`, errors, counts, 'leagueTeams', () => fetchLeagueTeams(league)) ?? [];
  const teamsToRefresh = teams.slice(0, options.maxTeamsPerLeague);

  for (const team of teamsToRefresh) {
    await safeStep(`${league}:${team.id}:teamPage`, errors, counts, 'teamPages', () =>
      fetchRichTeamPage(league, team.id, team.nickname || team.name, team.location || '', (team as any).tsdbId));
    await safeStep(`${league}:${team.id}:schedule`, errors, counts, 'teamSchedules', () =>
      fetchTeamFullSchedule(league, team.id));
    const roster = await safeStep(`${league}:${team.id}:roster`, errors, counts, 'teamRosters', () =>
      fetchTeamRosterForSeason(league, team.id, currentSeason())) ?? [];

    const athletes = flattenRoster(roster).slice(0, options.maxPlayersPerTeam);
    for (const athlete of athletes) {
      const athleteId = getAthleteId(athlete);
      if (!athleteId) continue;
      await safeStep(`${league}:${team.id}:${athleteId}:profile`, errors, counts, 'playerProfiles', () =>
        fetchPlayerProfile(league, athleteId));
      if (options.includeHistory) {
        await safeStep(`${league}:${team.id}:${athleteId}:stats`, errors, counts, 'playerSeasonStats', () =>
          fetchPlayerSeasonStats(league, athleteId, previousSeason()));
      }
    }

    if (options.includeHistory) {
      await safeStep(`${league}:${team.id}:record`, errors, counts, 'teamSeasonRecords', () =>
        fetchTeamSeasonRecord(league, team.id, previousSeason()));
      await safeStep(`${league}:${team.id}:teamStats`, errors, counts, 'teamSeasonStats', () =>
        fetchTeamSeasonStats(league, team.id, previousSeason()));
    }

    await sleep(80);
  }

  if (options.includeHistory) {
    await safeStep(`${league}:historicalLeaders`, errors, counts, 'historicalLeaders', () =>
      fetchHistoricalLeaders(league, previousSeason()));
  }
}

async function runSportsIngestion(options: SportsIngestionOptions = {}): Promise<SportsIngestionRunSummary> {
  const startedAt = new Date();
  const scope = options.scope ?? 'standard';
  const reason = options.reason ?? 'manual';
  const id = makeRunId(reason);
  const leagues = normalizeLeagues(options.leagues);
  const limits = getLimits(scope, options);
  const counts: Record<string, number> = {};
  const errors: SportsIngestionRunSummary['errors'] = [];

  await seedSportsSourceRegistry().catch(() => {});

  for (const league of leagues) {
    await ingestLeague(league, limits, counts, errors);
  }

  const finishedAt = new Date();
  const summary: SportsIngestionRunSummary = {
    id,
    status: errors.length ? 'failed' : 'completed',
    reason,
    scope,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    leagues,
    counts,
    errors,
  };
  await recordRun(summary);
  return summary;
}

export function runSportsIngestionWorker(options: SportsIngestionOptions = {}) {
  if (activeRun) {
    const now = new Date().toISOString();
    return Promise.resolve({
      id: `sports-ingestion-skipped-${now.replace(/[:.]/g, '-')}`,
      status: 'skipped' as const,
      reason: 'already_running',
      scope: options.scope ?? 'standard',
      startedAt: now,
      finishedAt: now,
      durationMs: 0,
      leagues: normalizeLeagues(options.leagues),
      counts: {},
      errors: [],
    });
  }

  activeRun = runSportsIngestion(options).finally(() => {
    activeRun = null;
  });
  return activeRun;
}

export function startSportsIngestionScheduler({ intervalMs = DEFAULT_INTERVAL_MS } = {}) {
  if (schedulerStarted) return;
  schedulerStarted = true;

  setTimeout(() => {
    runSportsIngestionWorker({ scope: 'lite', reason: 'startup' }).catch(err => {
      console.warn('[Sports Ingestion] Startup run failed:', err?.message || err);
    });
  }, 30_000);

  setInterval(() => {
    runSportsIngestionWorker({ scope: 'standard', reason: 'scheduled' }).catch(err => {
      console.warn('[Sports Ingestion] Scheduled run failed:', err?.message || err);
    });
  }, intervalMs);
}
