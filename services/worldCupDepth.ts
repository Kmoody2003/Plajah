// worldCupDepth.ts — live World Cup match + squad depth from ESPN (keyless site.api):
// team squads (bios/positions/headshots), per-match lineups + FORMATIONS, key events, and
// multi-source game reports. Powers the lineups view, match detail, and living rosters.

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world';

const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z]/g, '');
const cache = new Map<string, { t: number; v: any }>();
async function memo<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const c = cache.get(key);
  if (c && Date.now() - c.t < ttlMs) return c.v as T;
  try { const v = await fn(); cache.set(key, { t: Date.now(), v }); return v; }
  catch { return (c?.v as T) ?? (null as any); }
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
export interface SquadPlayer {
  id: string; name: string; jersey?: string; posAbbr: string; posName: string; group: PosGroup;
  age?: number; dob?: string; height?: string; weight?: string; headshot?: string;
  citizenship?: string; club?: string; slug?: string; injured?: boolean;
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
