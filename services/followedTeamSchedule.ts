import { slimScheduleEvent } from './sportsSlim';
import type { FollowedGame, FollowedTeam } from './sportsPersonalization';

const PATHS: Record<string, string[]> = {
  NFL: ['football/nfl'], NBA: ['basketball/nba'], WNBA: ['basketball/wnba'],
  MLB: ['baseball/mlb'], NHL: ['hockey/nhl'], MLS: ['soccer/usa.1'], EPL: ['soccer/eng.1'],
  NCAA: ['football/college-football', 'basketball/mens-college-basketball'],
  FIFA: ['soccer/fifa.world', 'soccer/fifa.worldq.uefa', 'soccer/fifa.worldq.concacaf', 'soccer/uefa.nations'],
};

const formatDate = (date: Date) => `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;

export function scheduleUrls(league: string, now = new Date()): string[] {
  const start = new Date(now); start.setDate(start.getDate() - 1);
  const end = new Date(now); end.setDate(end.getDate() + 14);
  return (PATHS[league] || []).map(path => `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${formatDate(start)}-${formatDate(end)}&limit=1000`);
}

export function parseFollowedSchedule(data: any, league: string, sourceUrl: string, now = Date.now()): FollowedGame[] {
  if (!Array.isArray(data?.events)) throw new Error('Schedule unavailable');
  const seen = new Set<string>();
  return data.events.map((event: any) => {
    if (!event?.id || !Array.isArray(event.competitions?.[0]?.competitors)) throw new Error('Incomplete schedule');
    const teams = event.competitions[0].competitors;
    if (!teams.some((t: any) => t.homeAway === 'home' && t.team?.id) || !teams.some((t: any) => t.homeAway === 'away' && t.team?.id)) throw new Error('Incomplete matchup');
    let detailUrl: string | undefined;
    const link = event.links?.find((link: any) => link.rel?.includes('summary'))?.href;
    try {
      const url = new URL(link);
      if (url.protocol === 'https:' && (url.hostname === 'espn.com' || url.hostname.endsWith('.espn.com'))) detailUrl = url.href;
    } catch { /* No trusted game detail link in this response. */ }
    return { id: `${league}:${event.id}`, league, event: slimScheduleEvent(event), fetchedAt: now, sourceUrl, detailUrl };
  }).filter((game: FollowedGame) => {
    if (seen.has(game.id)) return false;
    seen.add(game.id);
    return true;
  });
}

export interface FollowedSchedule { games: FollowedGame[]; unavailable: string[]; checkedAt: number; }

/** Strict, uncached reads: an unavailable league cannot masquerade as an idle team. */
export async function fetchFollowedSchedule(favorites: FollowedTeam[], signal: AbortSignal): Promise<FollowedSchedule> {
  const leagues = [...new Set(favorites.map(t => t.league))];
  const results = await Promise.all(leagues.map(async league => {
    const urls = scheduleUrls(league);
    if (!urls.length) return { league, games: [], failed: true };
    const sources = await Promise.allSettled(urls.map(async url => {
      const response = await fetch(url, { signal, cache: 'no-store' });
      if (!response.ok) throw new Error('Schedule unavailable');
      return parseFollowedSchedule(await response.json(), league, url);
    }));
    return { league, games: sources.flatMap(s => s.status === 'fulfilled' ? s.value : []), failed: sources.some(s => s.status === 'rejected') };
  }));
  return {
    games: [...new Map(results.flatMap(r => r.games).map(game => [game.id, game])).values()],
    unavailable: results.filter(r => r.failed).map(r => r.league), checkedAt: Date.now(),
  };
}
