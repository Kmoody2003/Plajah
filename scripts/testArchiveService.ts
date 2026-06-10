// Smoke test for sportsArchiveSourcesService. Run: npx tsx scripts/testArchiveService.ts
import {
  fetchNflverseRosterSeason, fetchMlbTeams, fetchMlbHistoricalRoster,
  fetchNhlHistoricalRoster, fetchF1SeasonArchive, discoverPdfLinks, parseCsv,
} from '../services/sportsArchiveSourcesService';

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, detail: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(36)} ${detail}`);
  ok ? pass++ : fail++;
};

async function main() {
  const csv = parseCsv('a,b\n1,"x,y"\n2,z');
  check('csv parser', csv.length === 2 && csv[0].b === 'x,y', JSON.stringify(csv[0]));

  const nfl = await fetchNflverseRosterSeason(2010);
  check('nflverse 2010 roster', nfl.length > 1500, `${nfl.length} players; sample: ${nfl[0]?.name} (${nfl[0]?.team} ${nfl[0]?.position}) headshot=${!!nfl.find(p => p.headshot)}`);

  const teams = await fetchMlbTeams(1986);
  check('MLB teams 1986', teams.length >= 26, `${teams.length} teams`);
  const mets = teams.find(t => /Mets/.test(t.name));
  const roster86 = mets ? await fetchMlbHistoricalRoster(mets.id, 1986) : [];
  check('MLB 1986 Mets roster', roster86.length > 20, `${roster86.length} players; ${roster86[0]?.name}`);

  const leafs = await fetchNhlHistoricalRoster('TOR', 1992);
  check('NHL 1992-93 Leafs roster', leafs.length > 20, `${leafs.length} players; ${leafs[0]?.name} headshots=${leafs.filter(p => p.headshot).length}`);

  const f1_1976 = await fetchF1SeasonArchive(1976);
  check('F1 1976 archive', (f1_1976?.results?.length ?? 0) > 10 && (f1_1976?.driverStandings?.length ?? 0) > 10,
    `${f1_1976?.results?.length} races, ${f1_1976?.driverStandings?.length} drivers; champ: ${f1_1976?.driverStandings?.[0]?.Driver?.familyName}`);

  const pdfs = await discoverPdfLinks('https://www.indycar.com/Stats', 10);
  check('IndyCar PDF discovery', pdfs.length > 0, `${pdfs.length} PDFs; first: ${pdfs[0]?.title?.slice(0, 50)}`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main();
