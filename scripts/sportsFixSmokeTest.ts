// Smoke test: exercises the repaired sports data functions end-to-end.
// Run: npx tsx scripts/sportsFixSmokeTest.ts
import {
  fetchLeagueStandings, fetchLeagueLeaders, fetchPlayerProfile, fetchPlayerCareer,
  fetchTeamRosterForSeason, fetchRacingStandings, fetchRacingSchedule, fetchRacingNews,
  fetchRacingConstructors,
} from '../services/sportsService';
import { fetchPlayerSeasonStats, fetchHistoricalLeaders, searchPlayers } from '../services/sportsHistoryService';

let pass = 0, fail = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(50)} ${detail}`);
  ok ? pass++ : fail++;
}

async function main() {
  const standings = await fetchLeagueStandings('NBA');
  const entries = standings.reduce((s: number, g: any) => s + (g?.standings?.entries?.length ?? 0), 0);
  check('NBA standings', entries >= 28, `${standings.length} groups, ${entries} teams`);

  const nflStandings = await fetchLeagueStandings('NFL');
  const nflEntries = nflStandings.reduce((s: number, g: any) => s + (g?.standings?.entries?.length ?? 0), 0);
  check('NFL standings', nflEntries >= 30, `${nflEntries} teams`);

  const leaders = await fetchLeagueLeaders('NBA');
  check('NBA leaders', leaders.length > 0 && leaders[0].leaders.length > 0,
    leaders.length ? `${leaders.length} cats; #1 ${leaders[0].displayName}: ${leaders[0].leaders[0]?.name} (${leaders[0].leaders[0]?.displayValue}) photo=${!!leaders[0].leaders[0]?.photo}` : 'none');

  const profile = await fetchPlayerProfile('NBA', '1966'); // LeBron
  check('Player profile (LeBron)', !!profile?.displayName && !!profile?.headshot?.href,
    `${profile?.displayName}, ht=${profile?.displayHeight}, stats cats=${profile?.statistics?.splits?.categories?.length ?? 0}`);

  const career = await fetchPlayerCareer('NBA', '1966');
  check('Player career (LeBron)', (career?.categories?.[0]?.seasons?.length ?? 0) > 15 && (career?.teamHistory?.length ?? 0) >= 3,
    `${career?.categories?.[0]?.seasons?.length ?? 0} seasons, teams: ${career?.teamHistory?.map(t => t.teamAbbr).join('/')}`);

  const roster2016 = await fetchTeamRosterForSeason('NBA', '5', 2016); // 2016 Cavs
  const rosterCount = roster2016.reduce((s, g) => s + g.athletes.length, 0);
  check('Historical roster (2016 Cavs)', rosterCount > 8, `${rosterCount} athletes in ${roster2016.length} groups`);

  const nflRoster = await fetchTeamRosterForSeason('NFL', '22', 2018);
  const nflCount = nflRoster.reduce((s, g) => s + g.athletes.length, 0);
  check('Historical roster (2018 Cardinals)', nflCount > 30, `${nflCount} athletes`);

  const seasonStats = await fetchPlayerSeasonStats('NBA', '1966', 2013);
  const statCount = seasonStats?.categories?.reduce((s, c) => s + c.stats.length, 0) ?? 0;
  check('Player season stats (LeBron 2013)', statCount > 10, `${seasonStats?.categories?.length ?? 0} cats, ${statCount} stats`);

  const histLeaders = await fetchHistoricalLeaders('NBA', 2005);
  check('Historical leaders (NBA 2005)', histLeaders.length > 0 && !!histLeaders[0]?.leaders?.[0]?.name && histLeaders[0].leaders[0].name !== 'Unknown',
    histLeaders.length ? `${histLeaders[0].displayName}: ${histLeaders[0].leaders[0]?.name} ${histLeaders[0].leaders[0]?.displayValue}` : 'none');

  const search = await searchPlayers('NBA', 'curry');
  check('Player search (curry)', search.length > 0 && search.some(p => /curry/i.test(p.name)), search.slice(0, 3).map(p => p.name).join(', '));

  const nascarStandings = await fetchRacingStandings('NASCAR');
  check('NASCAR standings', nascarStandings.length > 10 && !!nascarStandings[0]?.driverName && !nascarStandings[0].driverName.startsWith('Driver '),
    nascarStandings.length ? `${nascarStandings.length} drivers; P1 ${nascarStandings[0]?.driverName} ${nascarStandings[0]?.points}pts` : 'none');

  const nascarSched = await fetchRacingSchedule('NASCAR');
  check('NASCAR schedule', nascarSched.length > 0, `${nascarSched.length} events; next: ${nascarSched[0]?.name}`);

  const nascarNews = await fetchRacingNews('NASCAR');
  check('NASCAR news (RSS fallback)', nascarNews.length > 0, `${nascarNews.length} articles`);

  const f1Standings = await fetchRacingStandings('F1');
  check('F1 standings', f1Standings.length > 15, f1Standings.length ? `${f1Standings.length} drivers; P1 ${f1Standings[0]?.driverName}` : 'none');

  const f1Constructors = await fetchRacingConstructors('F1');
  check('F1 constructors', f1Constructors.length > 5, `${f1Constructors.length} teams; #1 ${f1Constructors[0]?.name}`);

  const indyStandings = await fetchRacingStandings('INDYCAR');
  check('IndyCar standings', indyStandings.length > 10, indyStandings.length ? `${indyStandings.length} drivers; P1 ${indyStandings[0]?.driverName}` : 'none');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main();
