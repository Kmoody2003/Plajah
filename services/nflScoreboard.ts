import { slimScheduleEvent } from './sportsSlim';

export const NFL_SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';

export interface NflScoreboard {
  events: any[];
  season: number | null;
  seasonLabel: string;
  week: number | null;
  fetchedAt: number;
}

// Metadata comes from the provider: January playoffs belong to the prior season.
export function parseNflScoreboard(data: any, now = Date.now()): NflScoreboard {
  if (!data || !Array.isArray(data.events)) throw new Error('NFL scoreboard unavailable');
  const seen = new Set<string>();
  const events = data.events.filter((event: any) => {
    if (!event?.id || seen.has(String(event.id))) return false;
    const teams = event.competitions?.[0]?.competitors;
    if (!Array.isArray(teams) || !teams.some((t: any) => t.homeAway === 'home' && t.team?.id)
      || !teams.some((t: any) => t.homeAway === 'away' && t.team?.id)) return false;
    seen.add(String(event.id));
    return true;
  }).map(slimScheduleEvent).sort((a: any, b: any) => {
    const live = (e: any) => (e.status ?? e.competitions?.[0]?.status)?.type?.state === 'in' ? 0 : 1;
    return live(a) - live(b) || (Date.parse(a.date) || 0) - (Date.parse(b.date) || 0);
  });
  if (data.events.length > 0 && events.length === 0) throw new Error('NFL matchups unavailable');
  return {
    events,
    season: Number.isInteger(data.season?.year) ? data.season.year : null,
    seasonLabel: ({ 1: 'Preseason', 2: 'Regular season', 3: 'Postseason', 4: 'Offseason' } as Record<number, string>)[data.season?.type] || 'NFL schedule',
    week: Number.isInteger(data.week?.number) ? data.week.number : null,
    fetchedAt: now,
  };
}

export async function fetchNflScoreboard(signal?: AbortSignal): Promise<NflScoreboard> {
  const response = await fetch(NFL_SCOREBOARD_URL, { signal, cache: 'no-store' });
  if (!response.ok) throw new Error('NFL scoreboard unavailable');
  return parseNflScoreboard(await response.json());
}
