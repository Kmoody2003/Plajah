// Diagnostic: hits every upstream endpoint the sports section depends on and
// reports which ones return usable data. Run with: npx tsx scripts/sportsEndpointDiagnostic.ts
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';
const TSDB = 'https://www.thesportsdb.com/api/v1/json/3';
const OPENF1 = 'https://api.openf1.org/v1';

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

const RACING: Record<string, { sport: string; league: string }> = {
  F1:      { sport: 'racing', league: 'f1' },
  NASCAR:  { sport: 'racing', league: 'nascar-premier' },
  INDYCAR: { sport: 'racing', league: 'irl' },
};

type Row = { area: string; check: string; ok: boolean; detail: string };
const rows: Row[] = [];

async function probe(area: string, check: string, url: string, extract: (d: any) => { ok: boolean; detail: string }) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Plajah/1.0)' } });
    if (!res.ok) { rows.push({ area, check, ok: false, detail: `HTTP ${res.status}` }); return null; }
    const data = await res.json();
    const r = extract(data);
    rows.push({ area, check, ok: r.ok, detail: r.detail });
    return data;
  } catch (e: any) {
    rows.push({ area, check, ok: false, detail: e?.message?.slice(0, 60) ?? 'error' });
    return null;
  }
}

async function main() {
  const year = new Date().getFullYear();

  for (const [tab, cfg] of Object.entries(LEAGUES)) {
    const base = `${ESPN}/${cfg.sport}/${cfg.league}`;
    const teamsData = await probe(tab, 'teams', `${base}/teams?limit=50`, d => {
      const n = d?.sports?.[0]?.leagues?.[0]?.teams?.length ?? 0;
      return { ok: n > 0, detail: `${n} teams` };
    });
    await probe(tab, 'standings', `${base}/standings`, d => {
      const groups = d?.children ?? (d?.standings?.entries ? [d] : []);
      const entries = groups.reduce((s: number, g: any) => s + (g?.standings?.entries?.length ?? 0), 0);
      return { ok: entries > 0, detail: `${groups.length} groups / ${entries} entries` };
    });
    await probe(tab, 'news', `${base}/news?limit=5`, d => ({ ok: (d?.articles?.length ?? 0) > 0, detail: `${d?.articles?.length ?? 0} articles` }));
    await probe(tab, 'scoreboard', `${base}/scoreboard`, d => ({ ok: Array.isArray(d?.events), detail: `${d?.events?.length ?? 0} events` }));

    // Roster + athlete detail for the first team
    const firstTeam = teamsData?.sports?.[0]?.leagues?.[0]?.teams?.[0]?.team;
    if (firstTeam) {
      const rosterData = await probe(tab, `roster (${firstTeam.abbreviation})`, `${base}/teams/${firstTeam.id}/roster`, d => {
        const groups = Array.isArray(d?.athletes) ? d.athletes : [];
        const count = groups[0]?.items ? groups.reduce((s: number, g: any) => s + (g.items?.length ?? 0), 0) : groups.length;
        return { ok: count > 0, detail: `${count} athletes` };
      });
      const athlete = rosterData?.athletes?.[0]?.items?.[0] ?? rosterData?.athletes?.[0];
      if (athlete?.id) {
        await probe(tab, `athlete overview (${athlete.displayName ?? athlete.id})`,
          `https://site.web.api.espn.com/apis/common/v3/sports/${cfg.sport}/${cfg.league}/athletes/${athlete.id}`,
          d => ({ ok: !!d?.athlete?.displayName || !!d?.displayName, detail: d?.athlete?.displayName ?? d?.displayName ?? 'no name' }));
        await probe(tab, `athlete season stats`, `${base}/athletes/${athlete.id}/statistics?season=${year - 1}&seasontype=2`,
          d => {
            const cats = d?.statistics?.splits?.categories ?? [];
            const n = cats.reduce((s: number, c: any) => s + (c.stats?.length ?? 0), 0);
            return { ok: n > 0, detail: `${cats.length} categories / ${n} stats` };
          });
        await probe(tab, `athlete gamelog`, `https://site.web.api.espn.com/apis/common/v3/sports/${cfg.sport}/${cfg.league}/athletes/${athlete.id}/gamelog`,
          d => ({ ok: !!d?.seasonTypes || !!d?.events, detail: d?.seasonTypes ? `${d.seasonTypes.length} season types` : 'no gamelog' }));
        // Historical roster (3 seasons back) — roster history check
        await probe(tab, `historical roster ${year - 3}`, `${base}/teams/${firstTeam.id}/roster?season=${year - 3}`, d => {
          const groups = Array.isArray(d?.athletes) ? d.athletes : [];
          const count = groups[0]?.items ? groups.reduce((s: number, g: any) => s + (g.items?.length ?? 0), 0) : groups.length;
          return { ok: count > 0, detail: `${count} athletes` };
        });
      }
    }
    await probe(tab, 'leaders', `${base}/leaders?season=${year - 1}&seasontype=2`, d => ({ ok: (d?.categories?.length ?? 0) > 0, detail: `${d?.categories?.length ?? 0} categories` }));
    await probe(tab, 'player search', `${base}/athletes?limit=5&active=true&search=ja`, d => {
      const n = d?.athletes?.length ?? d?.items?.length ?? 0;
      return { ok: n > 0, detail: `${n} results` };
    });
  }

  for (const [tab, cfg] of Object.entries(RACING)) {
    const base = `${ESPN}/${cfg.sport}/${cfg.league}`;
    await probe(tab, 'schedule/scoreboard', `${base}/scoreboard`, d => ({ ok: (d?.events?.length ?? 0) > 0, detail: `${d?.events?.length ?? 0} events` }));
    await probe(tab, 'standings', `${base}/standings`, d => {
      const n = d?.standings?.entries?.length ?? d?.children?.[0]?.standings?.entries?.length ?? 0;
      return { ok: n > 0, detail: `${n} entries` };
    });
    await probe(tab, 'news', `${base}/news?limit=5`, d => ({ ok: (d?.articles?.length ?? 0) > 0, detail: `${d?.articles?.length ?? 0} articles` }));
  }

  // TheSportsDB (free key 3 — soccer teams/standings + legends)
  await probe('TSDB', 'EPL teams (key 3)', `${TSDB}/search_all_teams.php?l=English%20Premier%20League`, d => ({ ok: (d?.teams?.length ?? 0) > 0, detail: `${d?.teams?.length ?? 0} teams` }));
  await probe('TSDB', 'EPL table (key 3)', `${TSDB}/lookuptable.php?l=4328&s=2024-2025`, d => ({ ok: (d?.table?.length ?? 0) > 0, detail: `${d?.table?.length ?? 0} rows` }));
  await probe('TSDB', 'MLS teams (key 3)', `${TSDB}/search_all_teams.php?l=American%20Major%20League%20Soccer`, d => ({ ok: (d?.teams?.length ?? 0) > 0, detail: `${d?.teams?.length ?? 0} teams` }));
  await probe('TSDB', 'player search (key 3)', `${TSDB}/searchplayers.php?p=Messi`, d => ({ ok: (d?.player?.length ?? 0) > 0, detail: `${d?.player?.length ?? 0} players` }));
  // New free key 123
  await probe('TSDB', 'EPL teams (key 123)', `https://www.thesportsdb.com/api/v1/json/123/search_all_teams.php?l=English%20Premier%20League`, d => ({ ok: (d?.teams?.length ?? 0) > 0, detail: `${d?.teams?.length ?? 0} teams` }));

  // OpenF1
  await probe('OpenF1', 'meetings 2025', `${OPENF1}/meetings?year=2025`, d => ({ ok: Array.isArray(d) && d.length > 0, detail: `${Array.isArray(d) ? d.length : 0} meetings` }));
  await probe('OpenF1', 'drivers latest', `${OPENF1}/drivers?session_key=latest`, d => ({ ok: Array.isArray(d) && d.length > 0, detail: `${Array.isArray(d) ? d.length : 0} drivers` }));

  // Jolpica (Ergast successor) — F1 history candidate
  await probe('Jolpica', 'F1 1990 results', `https://api.jolpi.ca/ergast/f1/1990/results.json?limit=5`, d => {
    const races = d?.MRData?.RaceTable?.Races ?? [];
    return { ok: races.length > 0, detail: `${races.length} races` };
  });
  await probe('Jolpica', 'F1 drivers 2024', `https://api.jolpi.ca/ergast/f1/2024/drivers.json`, d => {
    const n = d?.MRData?.DriverTable?.Drivers?.length ?? 0;
    return { ok: n > 0, detail: `${n} drivers` };
  });

  // Output
  let pass = 0, fail = 0;
  for (const r of rows) { r.ok ? pass++ : fail++; }
  console.log('\n=== SPORTS ENDPOINT DIAGNOSTIC ===\n');
  for (const r of rows) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  [${r.area.padEnd(8)}] ${r.check.padEnd(42)} ${r.detail}`);
  }
  console.log(`\n${pass} passed, ${fail} failed of ${rows.length}`);
}

main();
