// worldCupLive.ts — the REAL 2026 World Cup schedule + bracket, live from ESPN's
// keyless fifa.world scoreboard. Replaces the hand-authored pre-tournament guesses
// in data/worldCup2026.ts (groups/fixtures/knockout) that go stale the moment the
// draw and results are published. National-flag emojis + brand colours are enriched
// from the static team list when a name matches; otherwise ESPN's own logo is used.

import { WC26_TEAMS } from '../data/worldCup2026';

const B = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world';

export type WCRound = 'GROUP' | 'R32' | 'R16' | 'QF' | 'SF' | '3RD' | 'FINAL';

// ESPN season.type codes → tournament round (verified live, 2026-07).
const ROUND_BY_TYPE: Record<number, WCRound> = {
  13802: 'GROUP', 13801: 'R32', 13800: 'R16', 13799: 'QF', 13798: 'SF', 13797: '3RD', 13803: 'FINAL',
};
export const WC_ROUND_LABEL: Record<WCRound, string> = {
  GROUP: 'Group Stage', R32: 'Round of 32', R16: 'Round of 16', QF: 'Quarter-finals',
  SF: 'Semi-finals', '3RD': 'Third Place', FINAL: 'Final',
};

export interface WCLiveTeam {
  name: string; abbr: string; logo?: string;
  flag?: string; color?: string;
  score?: number; winner?: boolean;
  tbd: boolean;          // undecided knockout slot ("R16 W7") — no real team yet
}
export interface WCLiveMatch {
  id: string; round: WCRound; group?: string;
  dateMs: number; venue?: string; city?: string;
  state: 'pre' | 'in' | 'post'; finished: boolean;
  detail?: string;       // status short detail (kickoff time / "FT" / live clock)
  note?: string;         // e.g. "Morocco advance 3-2 on penalties"
  home: WCLiveTeam; away: WCLiveTeam;
}

// ── static-team enrichment index (flag emoji + colour) ───────────────────────
const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z]/g, '');
const byName = new Map<string, typeof WC26_TEAMS[number]>();
const byAbbr = new Map<string, typeof WC26_TEAMS[number]>();
for (const t of WC26_TEAMS) { byName.set(norm(t.name), t); byAbbr.set(norm(t.shortName), t); }

// A competitor is a real nation unless its name looks like a bracket placeholder.
const PLACEHOLDER = /\b[WL]\d\b|^(rd16|rd32|qf|sf|grp|group|winner|loser)/i;
function isPlaceholder(name: string, abbr: string): boolean {
  return PLACEHOLDER.test(name) || PLACEHOLDER.test(abbr) || /^\d?[a-l]$/i.test(abbr) && name.length <= 3;
}

function toTeam(c: any): WCLiveTeam {
  const t = c?.team || {};
  const name = t.displayName || t.name || t.abbreviation || 'TBD';
  const abbr = t.abbreviation || name.slice(0, 3).toUpperCase();
  const tbd = isPlaceholder(name, abbr) || !t.id;
  const stat = byName.get(norm(name)) || byAbbr.get(norm(abbr));
  const scoreRaw = c?.score;
  const score = scoreRaw !== undefined && scoreRaw !== '' ? parseInt(scoreRaw, 10) : undefined;
  return {
    name, abbr,
    logo: t.logos?.[0]?.href || t.logo,
    flag: tbd ? undefined : stat?.flag,
    color: tbd ? undefined : (stat?.primaryColor),
    score: Number.isNaN(score as any) ? undefined : score,
    winner: !!c?.winner,
    tbd,
  };
}

function toMatch(ev: any): WCLiveMatch | null {
  const comp = ev?.competitions?.[0];
  const cs: any[] = comp?.competitors || [];
  if (cs.length < 2) return null;
  const home = cs.find(c => c.homeAway === 'home') || cs[0];
  const away = cs.find(c => c.homeAway === 'away') || cs[1];
  const round = ROUND_BY_TYPE[ev?.season?.type] || 'GROUP';
  const st = ev?.status?.type || {};
  return {
    id: String(ev.id),
    round,
    group: comp?.groups?.abbreviation || comp?.notes?.find?.((n: any) => /group/i.test(n?.headline || ''))?.headline,
    dateMs: ev?.date ? Date.parse(ev.date) : 0,
    venue: comp?.venue?.fullName || ev?.venue?.fullName,
    city: comp?.venue?.address?.city,
    state: (st.state || 'pre') as WCLiveMatch['state'],
    finished: st.state === 'post' || !!st.completed,
    detail: st.shortDetail,
    note: comp?.notes?.find?.((n: any) => /advance|penalt/i.test(n?.headline || ''))?.headline,
    home: toTeam(home),
    away: toTeam(away),
  };
}

let _cache: { t: number; v: WCLiveMatch[] } | null = null;
let _inflight: Promise<WCLiveMatch[]> | null = null;

/** Every tournament match (group → final), real + live, newest data. Cached 60s. */
export async function fetchAllMatches(): Promise<WCLiveMatch[]> {
  if (_cache && Date.now() - _cache.t < 60_000) return _cache.v;
  if (_inflight) return _inflight;
  _inflight = (async () => {
    try {
      // The dated scoreboard caps at ~100 events, so pull two overlapping windows.
      const urls = [
        `${B}/scoreboard?dates=20260611-20260712`,
        `${B}/scoreboard?dates=20260712-20260726`,
      ];
      const jsons = await Promise.all(urls.map(u => fetch(u).then(r => r.ok ? r.json() : { events: [] }).catch(() => ({ events: [] }))));
      const seen = new Set<string>();
      const out: WCLiveMatch[] = [];
      for (const jn of jsons) for (const ev of jn?.events || []) {
        if (seen.has(String(ev.id))) continue;
        seen.add(String(ev.id));
        const m = toMatch(ev);
        if (m) out.push(m);
      }
      out.sort((a, b) => a.dateMs - b.dateMs);
      _cache = { t: Date.now(), v: out };
      return out;
    } catch {
      return _cache?.v || [];
    } finally { _inflight = null; }
  })();
  return _inflight;
}

const KO_ORDER: WCRound[] = ['R32', 'R16', 'QF', 'SF', 'FINAL', '3RD'];

/** Knockout matches grouped by round, in bracket order. */
export async function fetchBracket(): Promise<Record<WCRound, WCLiveMatch[]>> {
  const all = await fetchAllMatches();
  const out = { R32: [], R16: [], QF: [], SF: [], FINAL: [], '3RD': [], GROUP: [] } as Record<WCRound, WCLiveMatch[]>;
  for (const m of all) if (KO_ORDER.includes(m.round)) out[m.round].push(m);
  for (const r of KO_ORDER) out[r].sort((a, b) => a.dateMs - b.dateMs);
  return out;
}

/** Live (in-progress) and upcoming matches for the schedule view. */
export async function fetchScheduleBuckets(): Promise<{ live: WCLiveMatch[]; upcoming: WCLiveMatch[]; recent: WCLiveMatch[] }> {
  const all = await fetchAllMatches();
  const live = all.filter(m => m.state === 'in');
  const upcoming = all.filter(m => m.state === 'pre');
  const recent = all.filter(m => m.finished).slice(-16).reverse();
  return { live, upcoming, recent };
}
