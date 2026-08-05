// worldCupDepth.ts — live World Cup match + squad depth from ESPN (keyless site.api):
// team squads (bios/positions/headshots), per-match lineups + FORMATIONS, key events, and
// multi-source game reports. Powers the lineups view, match detail, and living rosters.

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world';

const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z]/g, '');
const cache = new Map<string, { t: number; v: any }>();
const inflight = new Map<string, Promise<any>>();
async function memo<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const c = cache.get(key);
  if (c && Date.now() - c.t < ttlMs) return c.v as T;
  if (inflight.has(key)) return inflight.get(key) as Promise<T>; // dedupe concurrent callers (e.g. 12 group tables)
  const p = (async () => {
    try { const v = await fn(); cache.set(key, { t: Date.now(), v }); return v; }
    catch { return (c?.v as T) ?? (null as any); }
    finally { inflight.delete(key); }
  })();
  inflight.set(key, p);
  return p;
}
const j = async (url: string) => { const r = await fetch(url); if (!r.ok) throw new Error(String(r.status)); return r.json(); };

// ── Team id resolution (WC nation name → ESPN team id) ───────────────────────
let teamIdMap: Record<string, string> | null = null;
export async function espnTeamId(name: string): Promise<string | null> {
  if (!teamIdMap) {
    teamIdMap = await memo('wc:teamids', 6 * 3600_000, async () => {
      const d = await j(`${BASE}/teams`);
      const ts = d?.sports?.[0]?.leagues?.[0]?.teams || [];
      const m: Record<string, string> = {};
      for (const t of ts) { const tm = t.team; if (tm?.displayName && tm?.id) m[norm(tm.displayName)] = tm.id; }
      return m;
    });
  }
  const n = norm(name);
  if (teamIdMap[n]) return teamIdMap[n];
  for (const [k, v] of Object.entries(teamIdMap)) if (k.length > 3 && (k.includes(n) || n.includes(k))) return v;
  return null;
}

// ── Squads (living rosters w/ bios) ──────────────────────────────────────────
export type PosGroup = 'GK' | 'DEF' | 'MID' | 'FWD';
export interface SquadStats {
  appearances?: number; goals?: number; assists?: number;
  yellowCards?: number; redCards?: number; shots?: number; shotsOnTarget?: number;
}
export interface SquadPlayer {
  id: string; name: string; jersey?: string; posAbbr: string; posName: string; group: PosGroup;
  age?: number; dob?: string; height?: string; weight?: string; headshot?: string;
  citizenship?: string; club?: string; slug?: string; injured?: boolean;
  espnUrl?: string; stats?: SquadStats;
}

/** Parse ESPN's statistics.splits.categories into flat World Cup stats. */
function parseSquadStats(statistics: any): SquadStats | undefined {
  const cats = statistics?.splits?.categories;
  if (!Array.isArray(cats)) return undefined;
  const get = (cat: string, stat: string): number | undefined => {
    const c = cats.find((x: any) => x.name === cat);
    const s = c?.stats?.find((y: any) => y.name === stat);
    if (!s) return undefined;
    const n = parseInt(s.displayValue ?? String(s.value ?? ''), 10);
    return isNaN(n) ? undefined : n;
  };
  const out: SquadStats = {
    appearances: get('general', 'appearances'),
    goals: get('offensive', 'totalGoals'),
    assists: get('offensive', 'goalAssists'),
    yellowCards: get('general', 'yellowCards'),
    redCards: get('general', 'redCards'),
    shots: get('offensive', 'totalShots'),
    shotsOnTarget: get('offensive', 'shotsOnTarget'),
  };
  return Object.values(out).some(v => v !== undefined) ? out : undefined;
}

function posGroup(abbr: string, name: string): PosGroup {
  const s = `${abbr} ${name}`.toLowerCase();
  if (/goal|gk|^g$/.test(s)) return 'GK';
  if (/def|back|cb|fb|lb|rb|wb/.test(s)) return 'DEF';
  if (/mid|dm|cm|am/.test(s)) return 'MID';
  return 'FWD';
}

export async function fetchTeamSquad(espnId: string): Promise<SquadPlayer[]> {
  if (!espnId) return [];
  return memo(`wc:squad:${espnId}`, 6 * 3600_000, async () => {
    const d = await j(`${BASE}/teams/${espnId}/roster`);
    const ath: any[] = d?.athletes || [];
    const players: SquadPlayer[] = ath.map((a: any) => {
      const pos = a.position || {};
      const abbr = pos.abbreviation || '';
      const name = pos.displayName || pos.name || '';
      return {
        id: String(a.id), name: a.displayName || a.fullName || 'Player', jersey: a.jersey,
        posAbbr: abbr, posName: name, group: posGroup(abbr, name),
        age: a.age, dob: a.dateOfBirth, height: a.displayHeight, weight: a.displayWeight,
        headshot: a.headshot?.href, citizenship: a.citizenship, slug: a.slug,
        injured: Array.isArray(a.injuries) && a.injuries.length > 0,
        espnUrl: a.links?.find((l: any) => /playercard|stats|player/i.test((l.rel || []).join(' ')))?.href || a.links?.[0]?.href,
        stats: parseSquadStats(a.statistics),
      };
    });
    const order: PosGroup[] = ['GK', 'DEF', 'MID', 'FWD'];
    return players.sort((x, y) => order.indexOf(x.group) - order.indexOf(y.group) || (+(x.jersey || 99) - +(y.jersey || 99)));
  });
}

/** Convenience: squad by nation name (resolves the ESPN id). */
export async function fetchSquadByName(name: string): Promise<SquadPlayer[]> {
  const id = await espnTeamId(name);
  return id ? fetchTeamSquad(id) : [];
}

// ── Match detail (lineups + formations + key events + reports) ───────────────
export interface LineupPlayer { id: string; name: string; jersey?: string; pos: string; starter: boolean; group: PosGroup; }
export interface TeamLineup { name: string; abbr?: string; logo?: string; formation?: string; xi: LineupPlayer[]; bench: LineupPlayer[]; }
export interface MatchEvent { clock: string; type: string; text: string; team?: string; scoreValue?: boolean; }
export interface GameReport { headline: string; source: string; href?: string; image?: string; published?: string; description?: string; }
export interface MatchDetail {
  home?: TeamLineup; away?: TeamLineup;
  events: MatchEvent[];
  reports: GameReport[];
  status?: string;
}

// ── Live results overlay (for Pick'em grading + bracket hydration) ───────────
export interface LiveResult { a: string; sa: number; b: string; sb: number; state: string; finished: boolean; }

/** All World Cup match results in the tournament window (group start → now). */
export async function fetchLiveResults(): Promise<LiveResult[]> {
  return memo('wc:results', 60_000, async () => {
    const now = new Date();
    const fmt = (dt: Date) => `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, '0')}${String(dt.getDate()).padStart(2, '0')}`;
    const end = new Date(now.getTime() + 2 * 86_400_000);
    const d = await j(`${BASE}/scoreboard?dates=20260611-${fmt(end)}`);
    const out: LiveResult[] = [];
    for (const ev of d?.events || []) {
      const cs = ev.competitions?.[0]?.competitors || [];
      if (cs.length < 2) continue;
      const [ca, cb] = cs;
      const state = ev?.status?.type?.state || 'pre';
      out.push({
        a: ca?.team?.displayName || ca?.team?.name || '', sa: parseInt(ca?.score ?? '', 10) || 0,
        b: cb?.team?.displayName || cb?.team?.name || '', sb: parseInt(cb?.score ?? '', 10) || 0,
        state, finished: state === 'post',
      });
    }
    return out;
  });
}

/** Resolve a fixture's live score by its two team names (order-independent). */
export function resultForTeams(results: LiveResult[], homeName: string, awayName: string): { homeScore: number; awayScore: number; state: string; finished: boolean } | null {
  const h = norm(homeName), a = norm(awayName);
  const hit = (x: string, y: string) => x.length > 3 && y.length > 3 && (x === y || x.includes(y) || y.includes(x));
  for (const r of results) {
    const ra = norm(r.a), rb = norm(r.b);
    if (hit(ra, h) && hit(rb, a)) return { homeScore: r.sa, awayScore: r.sb, state: r.state, finished: r.finished };
    if (hit(ra, a) && hit(rb, h)) return { homeScore: r.sb, awayScore: r.sa, state: r.state, finished: r.finished };
  }
  return null;
}

// ── Highlights / video clips (official ESPN, embeddable HLS) ─────────────────
export interface WcVideo { id: string; headline: string; description?: string; duration: number; thumbnail?: string; hls?: string; web?: string; }

/** Official ESPN video clips (analysis + highlights) from recent matches — playable HLS. */
export async function fetchWcVideos(): Promise<WcVideo[]> {
  return memo('wc:videos', 300_000, async () => {
    const sb = await j(`${BASE}/scoreboard`);
    const ids = (sb?.events || [])
      .filter((e: any) => ['post', 'in'].includes(e?.status?.type?.state))
      .sort((a: any, b: any) => +new Date(b.date) - +new Date(a.date))
      .slice(0, 5).map((e: any) => String(e.id));
    const summaries = await Promise.all(ids.map(id => j(`${BASE}/summary?event=${id}`).catch(() => null)));
    const out: WcVideo[] = [];
    const seen = new Set<string>();
    const now = Date.now();
    for (const d of summaries) {
      for (const v of (d?.videos || [])) {
        const id = String(v?.id || '');
        if (!id || seen.has(id)) continue;
        const embargo = v?.timeRestrictions?.embargoDate ? +new Date(v.timeRestrictions.embargoDate) : 0;
        if (embargo && embargo > now) continue; // not yet released
        seen.add(id);
        out.push({
          id, headline: v.headline || '', description: v.description, duration: v.duration || 0,
          thumbnail: v.thumbnail || v.images?.[0]?.url,
          hls: v?.links?.source?.HLS?.href || v?.links?.source?.href,
          web: v?.links?.web?.href,
        });
      }
    }
    return out.slice(0, 18);
  });
}

// ── Group standings (live) ───────────────────────────────────────────────────
export interface StandingRow {
  team: string; abbr?: string; logo?: string;
  p: number; w: number; d: number; l: number; gf: number; ga: number; gd: number; pts: number;
  rank: number; advanced?: boolean;
}

/** Live World Cup group standings keyed by group letter (A–L). */
export async function fetchGroupStandings(): Promise<Record<string, StandingRow[]>> {
  return memo('wc:standings', 300_000, async () => {
    const d = await j(`https://site.api.espn.com/apis/v2/sports/soccer/fifa.world/standings`);
    const out: Record<string, StandingRow[]> = {};
    for (const g of d?.children || []) {
      const letter = String(g.abbreviation || g.name || '').replace(/group\s*/i, '').trim().toUpperCase();
      if (!letter) continue;
      const rows: StandingRow[] = (g?.standings?.entries || []).map((e: any) => {
        const s: Record<string, string> = {};
        for (const st of e.stats || []) s[st.name] = st.displayValue ?? String(st.value ?? '');
        const num = (k: string) => parseInt(s[k] || '0', 10) || 0;
        return {
          team: e.team?.displayName || e.team?.name || '', abbr: e.team?.abbreviation, logo: e.team?.logos?.[0]?.href,
          p: num('gamesPlayed'), w: num('wins'), d: num('ties'), l: num('losses'),
          gf: num('pointsFor'), ga: num('pointsAgainst'), gd: num('pointDifferential'),
          pts: num('points'), rank: num('rank'), advanced: s['advanced'] === '1' || s['advanced'] === 'true',
        };
      }).sort((a: StandingRow, b: StandingRow) => (a.rank || 99) - (b.rank || 99));
      out[letter] = rows;
    }
    return out;
  });
}

export async function fetchMatchDetail(eventId: string): Promise<MatchDetail | null> {
  if (!eventId) return null;
  return memo(`wc:match:${eventId}`, 120_000, async () => {
    const d = await j(`${BASE}/summary?event=${eventId}`);
    const rosters: any[] = d?.rosters || [];
    const toLineup = (r: any): TeamLineup => {
      const roster: any[] = r?.roster || [];
      const map = (p: any): LineupPlayer => {
        const posAbbr = p?.position?.abbreviation || p?.position || '';
        const posName = p?.position?.name || '';
        return {
          id: String(p?.athlete?.id || ''), name: p?.athlete?.displayName || p?.athlete?.fullName || 'Player',
          jersey: p?.jersey, pos: posAbbr, starter: !!p?.starter, group: posGroup(posAbbr, posName),
        };
      };
      return {
        name: r?.team?.displayName || r?.team?.name || 'Team', abbr: r?.team?.abbreviation,
        logo: r?.team?.logos?.[0]?.href || r?.team?.logo,
        formation: r?.formation,
        xi: roster.filter((p: any) => p?.starter).map(map),
        bench: roster.filter((p: any) => !p?.starter).map(map),
      };
    };
    const home = rosters.find((r: any) => r?.homeAway === 'home') || rosters[0];
    const away = rosters.find((r: any) => r?.homeAway === 'away') || rosters[1];

    const events: MatchEvent[] = (d?.keyEvents || []).map((e: any) => ({
      clock: e?.clock?.displayValue || e?.time?.displayValue || '',
      type: e?.type?.text || e?.type?.name || '',
      text: e?.text || [e?.type?.text, (e?.participants || e?.athletesInvolved || []).map((a: any) => a?.athlete?.displayName || a?.displayName).filter(Boolean).join(', ')].filter(Boolean).join(' — '),
      team: e?.team?.displayName || e?.team?.abbreviation,
      scoreValue: !!e?.scoringPlay || /goal/i.test(e?.type?.text || ''),
    })).filter((e: MatchEvent) => e.text);

    // Game reports from multiple sources: the featured article + related news.
    const reports: GameReport[] = [];
    const art = d?.article;
    if (art) reports.push({ headline: art.headline || art.title, source: art?.source || 'ESPN', href: art?.links?.web?.href, image: art?.images?.[0]?.url, published: art?.published, description: art?.description });
    for (const a of (d?.news?.articles || d?.news || [])) {
      if (!a?.headline) continue;
      reports.push({ headline: a.headline, source: a?.source || 'Soccer', href: a?.links?.web?.href, image: a?.images?.[0]?.url, published: a?.published, description: a?.description });
      if (reports.length >= 10) break;
    }

    return { home: home ? toLineup(home) : undefined, away: away ? toLineup(away) : undefined, events, reports, status: d?.header?.competitions?.[0]?.status?.type?.description };
  });
}
