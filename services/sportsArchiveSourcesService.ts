// Plajah Sports Archive — non-ESPN data repositories, official league APIs,
// and league PDF document sources.
//
// Every source here was verified reachable. Fetchers normalize records and
// persist them into the sports knowledge Firestore collections with full
// attribution (writes succeed when run by the admin device agent; client
// reads are public per firestore.rules).
//
//  Verified sources:
//   - nflverse (CSV releases)      — NFL rosters per season, bios + headshots
//   - MLB Stats API (official)     — historical rosters to the 1800s, person bios
//   - NHL api-web (official)       — historical rosters w/ headshots by season
//   - Jolpica-F1 (Ergast successor)— complete F1 history since 1950
//   - Chadwick Bureau register     — baseball player ID crosswalk
//   - Baseball Databank (Lahman)   — season stat tables back to 1871
//   - Retrosheet                   — game logs / play-by-play archives (zip)
//   - FIA documents / IndyCar stats / NCAA records — official PDF repositories

import {
  makeSportsDocId,
  readSportsKnowledge,
  sportsSource,
  writeSportsKnowledge,
  writeSportsKnowledgeBatch,
  type SportsSourceAttribution,
} from './sportsKnowledgeService';

const UA_HEADERS = { 'User-Agent': 'Plajah/1.0 (sports data archive)' };

async function fetchText(url: string): Promise<string | null> {
  try {
    const isBrowser = typeof window !== 'undefined';
    const requestUrl = isBrowser ? `/api/proxy?url=${encodeURIComponent(url)}` : url;
    const res = await fetch(requestUrl, { signal: AbortSignal.timeout(60000), ...(isBrowser ? {} : { headers: UA_HEADERS }), redirect: 'follow' });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

async function fetchJson(url: string): Promise<any> {
  try {
    const isBrowser = typeof window !== 'undefined';
    const requestUrl = isBrowser ? `/api/proxy?url=${encodeURIComponent(url)}` : url;
    const res = await fetch(requestUrl, { signal: AbortSignal.timeout(30000), ...(isBrowser ? {} : { headers: UA_HEADERS }) });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ─── Source registry ─────────────────────────────────────────────────────────

export interface ArchiveSource {
  id: string;
  label: string;
  kind: 'csv' | 'api' | 'pdf-index' | 'archive';
  leagues: string[];
  url: string;
  description: string;
  licenseNote: string;
}

export const ARCHIVE_SOURCES: ArchiveSource[] = [
  { id: 'nflverse', label: 'nflverse', kind: 'csv', leagues: ['NFL'],
    url: 'https://github.com/nflverse/nflverse-data',
    description: 'Community-maintained NFL data: season rosters with bios, headshots, draft data, and IDs across providers.',
    licenseNote: 'CC-BY 4.0 — attribution required.' },
  { id: 'mlb_statsapi', label: 'MLB Stats API', kind: 'api', leagues: ['MLB'],
    url: 'https://statsapi.mlb.com/api/v1',
    description: 'Official MLB Stats API: historical rosters for any season, person bios, stats, schedules.',
    licenseNote: 'Official MLB public API; ©MLBAM — non-commercial display with attribution.' },
  { id: 'nhl_apiweb', label: 'NHL API', kind: 'api', leagues: ['NHL'],
    url: 'https://api-web.nhle.com/v1',
    description: 'Official NHL API: rosters by franchise & season (with headshots), standings, player landing pages.',
    licenseNote: 'Official NHL public API; ©NHL — display with attribution.' },
  { id: 'jolpica_f1', label: 'Jolpica-F1 (Ergast)', kind: 'api', leagues: ['F1'],
    url: 'https://api.jolpi.ca/ergast/f1',
    description: 'Complete Formula 1 history since 1950: every race result, driver, constructor, and championship.',
    licenseNote: 'Open community API (Ergast successor), CC-BY-NC.' },
  { id: 'chadwick_register', label: 'Chadwick Bureau Register', kind: 'csv', leagues: ['MLB'],
    url: 'https://github.com/chadwickbureau/register',
    description: 'Canonical baseball player identity register — crosswalk of MLBAM/Retrosheet/BBRef/FanGraphs IDs.',
    licenseNote: 'Open Data Commons Attribution.' },
  { id: 'baseball_databank', label: 'Baseball Databank (Lahman)', kind: 'csv', leagues: ['MLB'],
    url: 'https://raw.githubusercontent.com/cbwinslow/baseballdatabank/master',
    description: 'Season-by-season batting, pitching, and fielding tables for every player back to 1871.',
    licenseNote: 'CC-BY-SA 3.0.' },
  { id: 'retrosheet', label: 'Retrosheet', kind: 'archive', leagues: ['MLB'],
    url: 'https://www.retrosheet.org/gamelogs/',
    description: 'Game logs and play-by-play event files for nearly every MLB game in history (zip archives).',
    licenseNote: 'Free use with required Retrosheet notice.' },
  { id: 'fia_documents', label: 'FIA Decision Documents', kind: 'pdf-index', leagues: ['F1'],
    url: 'https://www.fia.com/documents',
    description: 'Official FIA event PDFs: entry lists, classifications, stewards decisions for every Grand Prix.',
    licenseNote: '©FIA — official public documents.' },
  { id: 'indycar_stats', label: 'IndyCar Stats PDFs', kind: 'pdf-index', leagues: ['INDYCAR'],
    url: 'https://www.indycar.com/Stats',
    description: 'Official IndyCar box scores, entry lists, and points reports published as PDFs per race.',
    licenseNote: '©INDYCAR — official public documents.' },
  { id: 'ncaa_records', label: 'NCAA Records Books', kind: 'pdf-index', leagues: ['NCAA'],
    url: 'https://www.ncaa.org/sports/2013/11/27/statistics.aspx',
    description: 'Official NCAA statistics and records books (PDF) across sports and divisions.',
    licenseNote: '©NCAA — official public documents.' },
  { id: 'thesportsdb', label: 'TheSportsDB', kind: 'api', leagues: ['NBA', 'NFL', 'NHL', 'MLB', 'FIFA', 'MLS'],
    url: 'https://www.thesportsdb.com',
    description: 'Community sports metadata: team art, player cutouts, legacy player bios.',
    licenseNote: 'Free community API.' },
  { id: 'ufcstats', label: 'UFC Stats', kind: 'archive', leagues: ['UFC', 'MMA'],
    url: 'http://ufcstats.com/statistics/events/completed',
    description: 'Official historical fight result tables for every UFC event.',
    licenseNote: 'Public official statistics site.' },
];

export async function seedArchiveSourceRegistry(): Promise<void> {
  await Promise.all(ARCHIVE_SOURCES.map(src =>
    writeSportsKnowledge('sports_source_registry', `archive_${src.id}`, src, [
      sportsSource('PublicSource', src.url, src.label, src.licenseNote),
    ], ['sports', 'archive_source', ...src.leagues.map(l => l.toLowerCase())], 'HIGH')
  ));
}

// ─── Tiny CSV parser (quoted fields supported) ───────────────────────────────

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift() ?? [];
  return rows.map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

// ─── NFL: nflverse season rosters (full bios + headshots) ───────────────────

export interface ArchiveRosterPlayer {
  league: string;
  season: number;
  team: string;
  name: string;
  position: string;
  jersey: string;
  birthDate: string;
  height: string;
  weight: string;
  college: string;
  headshot: string;
  draftInfo: string;
  externalIds: Record<string, string>;
}

export async function fetchNflverseRosterSeason(season: number): Promise<ArchiveRosterPlayer[]> {
  const docId = makeSportsDocId('nfl', 'archive_roster', season);
  const stored = await readSportsKnowledge<ArchiveRosterPlayer[]>('sports_team_rosters', docId);
  if (stored?.data?.length) return stored.data;

  const url = `https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_${season}.csv`;
  const text = await fetchText(url);
  if (!text) return [];
  const seen = new Set<string>();
  const players: ArchiveRosterPlayer[] = parseCsv(text)
    .filter(r => {
      const key = `${r.team}:${r.full_name}`;
      if (!r.full_name || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(r => ({
      league: 'NFL',
      season,
      team: r.team,
      name: r.full_name,
      position: r.position,
      jersey: r.jersey_number,
      birthDate: r.birth_date,
      height: r.height,
      weight: r.weight,
      college: r.college,
      headshot: r.headshot_url,
      draftInfo: r.draft_club ? `${r.draft_club} R? #${r.draft_number} (${r.entry_year})` : '',
      externalIds: { gsis: r.gsis_id, espn: r.espn_id, pfr: r.pfr_id },
    }));

  if (players.length) {
    writeSportsKnowledge('sports_team_rosters', docId, players, [
      sportsSource('PublicSource', url, `nflverse NFL roster ${season}`, 'nflverse data, CC-BY 4.0.'),
    ], ['sports', 'NFL', 'archive_roster', String(season)], 'HIGH').catch(() => {});
  }
  return players;
}

// ─── MLB: official Stats API (historical rosters + bios) ────────────────────

export async function fetchMlbTeams(season?: number): Promise<{ id: number; name: string; abbreviation: string }[]> {
  const data = await fetchJson(`https://statsapi.mlb.com/api/v1/teams?sportId=1${season ? `&season=${season}` : ''}`);
  return (data?.teams ?? []).map((t: any) => ({ id: t.id, name: t.name, abbreviation: t.abbreviation }));
}

export async function fetchMlbHistoricalRoster(teamId: number, season: number): Promise<ArchiveRosterPlayer[]> {
  const docId = makeSportsDocId('mlb', 'archive_roster', teamId, season);
  const stored = await readSportsKnowledge<ArchiveRosterPlayer[]>('sports_team_rosters', docId);
  if (stored?.data?.length) return stored.data;

  const url = `https://statsapi.mlb.com/api/v1/teams/${teamId}/roster?season=${season}`;
  const data = await fetchJson(url);
  const players: ArchiveRosterPlayer[] = (data?.roster ?? []).map((r: any) => ({
    league: 'MLB',
    season,
    team: String(teamId),
    name: r.person?.fullName ?? '',
    position: r.position?.name ?? '',
    jersey: r.jerseyNumber ?? '',
    birthDate: '', height: '', weight: '', college: '',
    headshot: r.person?.id ? `https://img.mlbstatic.com/mlb-photos/image/upload/w_213,q_auto:best/v1/people/${r.person.id}/headshot/67/current` : '',
    draftInfo: '',
    externalIds: { mlbam: String(r.person?.id ?? '') },
  })).filter((p: ArchiveRosterPlayer) => p.name);

  if (players.length) {
    writeSportsKnowledge('sports_team_rosters', docId, players, [
      sportsSource('PublicSource', url, `MLB Stats API roster team ${teamId} ${season}`, 'Official MLB Stats API, ©MLBAM.'),
    ], ['sports', 'MLB', 'archive_roster', String(teamId), String(season)], 'HIGH').catch(() => {});
  }
  return players;
}

export async function fetchMlbPersonBio(personId: number): Promise<any | null> {
  const url = `https://statsapi.mlb.com/api/v1/people/${personId}`;
  const data = await fetchJson(url);
  const person = data?.people?.[0] ?? null;
  if (person) {
    writeSportsKnowledge('sports_player_profiles', makeSportsDocId('mlb', 'bio', personId), person, [
      sportsSource('PublicSource', url, `MLB person bio ${personId}`, 'Official MLB Stats API, ©MLBAM.'),
    ], ['sports', 'MLB', 'player_bio', String(personId)], 'HIGH').catch(() => {});
  }
  return person;
}

// ─── NHL: official api-web (historical rosters with headshots) ───────────────

export async function fetchNhlHistoricalRoster(teamTriCode: string, seasonStartYear: number): Promise<ArchiveRosterPlayer[]> {
  const seasonId = `${seasonStartYear}${seasonStartYear + 1}`;
  const docId = makeSportsDocId('nhl', 'archive_roster', teamTriCode, seasonStartYear);
  const stored = await readSportsKnowledge<ArchiveRosterPlayer[]>('sports_team_rosters', docId);
  if (stored?.data?.length) return stored.data;

  const url = `https://api-web.nhle.com/v1/roster/${teamTriCode}/${seasonId}`;
  const data = await fetchJson(url);
  if (!data) return [];
  const groups = [
    ...(data.forwards ?? []), ...(data.defensemen ?? []), ...(data.goalies ?? []),
  ];
  const players: ArchiveRosterPlayer[] = groups.map((p: any) => ({
    league: 'NHL',
    season: seasonStartYear,
    team: teamTriCode,
    name: `${p.firstName?.default ?? ''} ${p.lastName?.default ?? ''}`.trim(),
    position: p.positionCode ?? '',
    jersey: String(p.sweaterNumber ?? ''),
    birthDate: p.birthDate ?? '',
    height: p.heightInInches ? `${Math.floor(p.heightInInches / 12)}'${p.heightInInches % 12}"` : '',
    weight: p.weightInPounds ? `${p.weightInPounds} lbs` : '',
    college: '',
    headshot: p.headshot ?? '',
    draftInfo: '',
    externalIds: { nhl: String(p.id ?? '') },
  })).filter(p => p.name);

  if (players.length) {
    writeSportsKnowledge('sports_team_rosters', docId, players, [
      sportsSource('PublicSource', url, `NHL roster ${teamTriCode} ${seasonId}`, 'Official NHL API, ©NHL.'),
    ], ['sports', 'NHL', 'archive_roster', teamTriCode, String(seasonStartYear)], 'HIGH').catch(() => {});
  }
  return players;
}

// ─── F1: Jolpica (complete Ergast history since 1950) ───────────────────────

export async function fetchF1SeasonArchive(year: number): Promise<{
  results: any[];
  driverStandings: any[];
  constructorStandings: any[];
} | null> {
  const docId = makeSportsDocId('f1', 'season_archive', year);
  const stored = await readSportsKnowledge<any>('sports_game_event_research', docId);
  if (stored?.data) return stored.data;

  const base = `https://api.jolpi.ca/ergast/f1/${year}`;

  // Jolpica caps limit at 100 — page through results and merge races
  const races = new Map<string, any>();
  for (let offset = 0; offset < 1200; offset += 100) {
    const page = await fetchJson(`${base}/results.json?limit=100&offset=${offset}`);
    const pageRaces: any[] = page?.MRData?.RaceTable?.Races ?? [];
    for (const r of pageRaces) {
      const key = r.round;
      const existing = races.get(key);
      if (existing) existing.Results = [...(existing.Results ?? []), ...(r.Results ?? [])];
      else races.set(key, r);
    }
    const total = Number(page?.MRData?.total ?? 0);
    if (!pageRaces.length || offset + 100 >= total) break;
  }

  const [driversData, constructorsData] = await Promise.all([
    fetchJson(`${base}/driverstandings.json?limit=100`),
    fetchJson(`${base}/constructorstandings.json?limit=100`),
  ]);
  const archive = {
    results: [...races.values()].sort((a, b) => Number(a.round) - Number(b.round)),
    driverStandings: driversData?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings ?? [],
    constructorStandings: constructorsData?.MRData?.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings ?? [],
  };
  if (!archive.results.length && !archive.driverStandings.length) return null;

  writeSportsKnowledge('sports_game_event_research', docId, archive, [
    sportsSource('PublicSource', base, `F1 ${year} season archive (Jolpica/Ergast)`, 'Jolpica-F1 community API, CC-BY-NC.'),
  ], ['sports', 'F1', 'season_archive', String(year)], 'HIGH').catch(() => {});
  return archive;
}

export async function fetchF1DriverCareer(driverId: string): Promise<any[]> {
  const data = await fetchJson(`https://api.jolpi.ca/ergast/f1/drivers/${driverId}/driverstandings.json?limit=100`);
  return data?.MRData?.StandingsTable?.StandingsLists ?? [];
}

// ─── Baseball Databank (Lahman) season tables ────────────────────────────────

export async function fetchBaseballDatabankTable(table: 'Batting' | 'Pitching' | 'People' | 'Teams'): Promise<Record<string, string>[]> {
  const text = await fetchText(`https://raw.githubusercontent.com/cbwinslow/baseballdatabank/master/core/${table}.csv`);
  return text ? parseCsv(text) : [];
}

// ─── PDF document discovery (FIA / IndyCar / NCAA) ───────────────────────────

export interface DiscoveredPdf {
  url: string;
  title: string;
  sourcePage: string;
}

// Scrape a documents page for .pdf links (runs through the server proxy in
// the browser, so CORS is not an issue).
export async function discoverPdfLinks(pageUrl: string, limit = 40): Promise<DiscoveredPdf[]> {
  const html = await fetchText(pageUrl);
  if (!html) return [];
  const out: DiscoveredPdf[] = [];
  const seen = new Set<string>();
  const re = /<a[^>]+href="([^"]+\.pdf[^"]*)"[^>]*>(.*?)<\/a>/gis;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < limit) {
    let href = m[1];
    if (href.startsWith('//')) href = 'https:' + href;
    else if (href.startsWith('/')) href = new URL(pageUrl).origin + href;
    if (seen.has(href)) continue;
    seen.add(href);
    const title = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() || href.split('/').pop() || 'Document';
    out.push({ url: href, title, sourcePage: pageUrl });
  }
  return out;
}

// Extract text from a PDF (node-side: used by the local archive agent).
export async function extractPdfText(url: string, maxPages = 30): Promise<string> {
  try {
    const isBrowser = typeof window !== 'undefined';
    const requestUrl = isBrowser ? `/api/proxy?url=${encodeURIComponent(url)}` : url;
    const res = await fetch(requestUrl, { signal: AbortSignal.timeout(90000), ...(isBrowser ? {} : { headers: UA_HEADERS }) });
    if (!res.ok) return '';
    const buf = new Uint8Array(await res.arrayBuffer());
    const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: buf, useSystemFonts: true }).promise;
    const pages = Math.min(doc.numPages, maxPages);
    let text = '';
    for (let p = 1; p <= pages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      text += content.items.map((it: any) => it.str).join(' ') + '\n';
    }
    return text;
  } catch { return ''; }
}

// Ingest a league document: extract text, store with attribution.
export async function ingestLeagueDocument(doc: DiscoveredPdf, league: string): Promise<boolean> {
  const text = await extractPdfText(doc.url);
  if (!text || text.length < 200) return false;
  await writeSportsKnowledge('sports_game_event_research', makeSportsDocId(league, 'document', doc.title.slice(0, 60)), {
    league, title: doc.title, url: doc.url, sourcePage: doc.sourcePage,
    extractedText: text.slice(0, 200_000),
    extractedAt: Date.now(),
  }, [
    sportsSource('PublicSource', doc.url, `${league} document: ${doc.title}`, 'Official league PDF; text extracted for archive search with attribution.'),
  ], ['sports', league, 'league_document'], 'HIGH');
  return true;
}

// ─── Bulk archive ingestion (called by the local archive agent) ──────────────

export interface ArchiveIngestionSummary {
  steps: { step: string; count: number }[];
  errors: string[];
}

export async function runArchiveIngestion(options: {
  nflSeasons?: number[];
  mlbSeasons?: number[];
  nhlSeasons?: number[];
  nhlTeams?: string[];
  f1Years?: number[];
  ingestPdfs?: boolean;
} = {}): Promise<ArchiveIngestionSummary> {
  const summary: ArchiveIngestionSummary = { steps: [], errors: [] };
  const step = async (label: string, fn: () => Promise<number>) => {
    try { summary.steps.push({ step: label, count: await fn() }); }
    catch (e: any) { summary.errors.push(`${label}: ${e?.message ?? e}`); }
  };

  await step('seed source registry', async () => { await seedArchiveSourceRegistry(); return ARCHIVE_SOURCES.length; });

  for (const season of options.nflSeasons ?? []) {
    await step(`nflverse roster ${season}`, async () => (await fetchNflverseRosterSeason(season)).length);
  }

  if (options.mlbSeasons?.length) {
    const teams = await fetchMlbTeams();
    for (const season of options.mlbSeasons) {
      await step(`MLB rosters ${season}`, async () => {
        let n = 0;
        for (const t of teams) n += (await fetchMlbHistoricalRoster(t.id, season)).length;
        return n;
      });
    }
  }

  const nhlTeams = options.nhlTeams ?? ['TOR', 'MTL', 'BOS', 'NYR', 'CHI', 'DET', 'EDM', 'PIT', 'WSH', 'COL', 'TBL', 'VGK', 'FLA', 'DAL'];
  for (const season of options.nhlSeasons ?? []) {
    await step(`NHL rosters ${season}`, async () => {
      let n = 0;
      for (const t of nhlTeams) n += (await fetchNhlHistoricalRoster(t, season)).length;
      return n;
    });
  }

  for (const year of options.f1Years ?? []) {
    await step(`F1 season archive ${year}`, async () => {
      const a = await fetchF1SeasonArchive(year);
      return a ? a.results.length : 0;
    });
  }

  if (options.ingestPdfs) {
    await step('IndyCar PDFs', async () => {
      const docs = await discoverPdfLinks('https://www.indycar.com/Stats', 10);
      let n = 0;
      for (const d of docs) { if (await ingestLeagueDocument(d, 'INDYCAR')) n++; }
      return n;
    });
  }

  return summary;
}
