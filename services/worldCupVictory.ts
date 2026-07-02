// worldCupVictory.ts — turn the live ESPN World Cup scoreboard into "a team just won"
// events, mapped to Plajah's rich per-nation identity (colors, flag, anthem) so the UI can
// throw a proper celebration. Pure/testable; the UI (WorldCupVictory.tsx) reacts to these.

import { WC26_TEAMS, WC26Team } from '../data/worldCup2026';

export interface Victory {
  id: string;                 // ESPN event id
  winnerName: string;
  winnerScore: number;
  loserName: string;
  loserScore: number;
  winnerWc: WC26Team | null;  // matched Plajah nation (colors/flag/anthem)
  loserWc: WC26Team | null;
  winnerLogo?: string;
  loserLogo?: string;
  penalties: boolean;         // decided on penalties (knockout)
  roundText: string;
  dateMs: number;
  event: any;
}

const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z]/g, '');

/** Map an ESPN competitor's team object to a Plajah WC26 nation. */
export function matchWcTeam(espnTeam: any): WC26Team | null {
  if (!espnTeam) return null;
  const cands = [espnTeam.displayName, espnTeam.shortDisplayName, espnTeam.name, espnTeam.location, espnTeam.abbreviation]
    .filter(Boolean).map(norm);
  // Exact name / shortName match first.
  for (const t of WC26_TEAMS) {
    if (cands.includes(norm(t.name)) || cands.includes(norm(t.shortName))) return t;
  }
  // Contains match (e.g. "USA" ↔ "United States", "Korea Republic" ↔ "South Korea").
  for (const t of WC26_TEAMS) {
    const n = norm(t.name);
    if (n.length > 3 && cands.some(c => c.length > 3 && (c.includes(n) || n.includes(c)))) return t;
  }
  return null;
}

/** Extract completed-match victories from an ESPN scoreboard event array. Draws are skipped. */
export function parseVictories(events: any[]): Victory[] {
  const out: Victory[] = [];
  for (const ev of events || []) {
    if (ev?.status?.type?.state !== 'post') continue;
    const comp = ev.competitions?.[0];
    const cs = comp?.competitors || [];
    if (cs.length < 2) continue;
    const a = cs[0], b = cs[1];
    const sa = parseInt(a?.score ?? '', 10);
    const sb = parseInt(b?.score ?? '', 10);
    let w: any, l: any;
    if (a?.winner === true) { w = a; l = b; }
    else if (b?.winner === true) { w = b; l = a; }
    else if (!isNaN(sa) && !isNaN(sb) && sa !== sb) { w = sa > sb ? a : b; l = sa > sb ? b : a; }
    else continue; // draw (or unknown) — not a victory to celebrate
    const penalties = !isNaN(sa) && !isNaN(sb) && sa === sb; // level after regulation → shootout
    out.push({
      id: String(ev.id),
      winnerName: w.team?.displayName || w.team?.name || 'Winner',
      winnerScore: parseInt(w?.score ?? '0', 10) || 0,
      loserName: l.team?.displayName || l.team?.name || 'Opponent',
      loserScore: parseInt(l?.score ?? '0', 10) || 0,
      winnerWc: matchWcTeam(w.team),
      loserWc: matchWcTeam(l.team),
      winnerLogo: w.team?.logos?.[0]?.href || w.team?.logo,
      loserLogo: l.team?.logos?.[0]?.href || l.team?.logo,
      penalties,
      roundText: ev.status?.type?.description || comp?.notes?.[0]?.headline || 'FIFA World Cup',
      dateMs: +new Date(ev.date || Date.now()),
      event: ev,
    });
  }
  return out.sort((a, b) => b.dateMs - a.dateMs);
}

/** Auto-generated congratulations copy for a winning nation. */
export function congratsFor(v: Victory): string {
  const name = v.winnerWc?.name || v.winnerName;
  const opp = v.loserWc?.name || v.loserName;
  const how = v.penalties ? `held their nerve in a shootout to beat ${opp}` : `beat ${opp} ${v.winnerScore}–${v.loserScore}`;
  return `${name} ${how} at the FIFA World Cup. The whole nation is celebrating — and so is Plajah.`;
}

/** A short punchy headline for the takeover. */
export function victoryHeadline(v: Victory): string {
  const name = (v.winnerWc?.shortName || v.winnerName).toUpperCase();
  return v.penalties ? `${name} SURVIVE!` : `${name} WIN!`;
}
