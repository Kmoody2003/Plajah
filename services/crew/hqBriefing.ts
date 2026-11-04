/**
 * Aria HQ — the owner's daily briefing, composed by the HQ crew from real records only.
 *
 *   Security Council → the latest security brief + open findings (rule-based; Aria only reports)
 *   Growth Analyst   → counted signups; a figure that could not be counted says so, never a guess
 *   Keeper of the Vision → the standing decisions + the drifts the owner logged and has not closed
 *
 * Pure: the route gathers the inputs, this turns them into the briefing.
 */

/** A standing owner decision. `since` is when it was decided; `rule` is what must stay true. */
export interface VisionPrinciple { id: string; title: string; rule: string; since: string }

/**
 * The owner's standing decisions, as recorded in the project's decision log. Changing one is the owner's
 * call alone — edit it here in the same commit as the decision.
 */
export const VISION_PRINCIPLES: VisionPrinciple[] = [
  { id: 'no_held_money', title: 'No held money', rule: 'Every payment goes straight to the person or org being paid; Plajah never holds funds.', since: '2026-10' },
  { id: 'direct_fee', title: '5% direct sales fee', rule: 'Direct sales carry 5% without Plajah+. Copy that says 10% / 90% is wrong.', since: '2026-11-01' },
  { id: 'free_by_default', title: 'Free by default', rule: 'Content is free unless a creator paywalls their own work.', since: '2026-10' },
  { id: 'real_data_only', title: 'Real data only', rule: 'Real orgs see real data. Demo data lives on Grace Chapel only.', since: '2026-10' },
  { id: 'account_wall', title: 'Org files never cross accounts', rule: 'An org’s files and records never reach another account; security stays in the server.', since: '2026-11-01' },
  { id: 'desktop_first_ai', title: 'Desktop-first AI', rule: 'AI runs on the desktop app’s GPU first, the cloud with consent second. Users never spend the owner’s accounts.', since: '2026-10-21' },
  { id: 'indie_first', title: 'Indie-first Chora', rule: 'No licensed catalog tier; invest in independent artists.', since: '2026-11-01' },
  { id: 'firebase_default', title: 'Firebase by default', rule: 'Firestore + Firebase Storage unless B2 is designated for the feature.', since: '2026-10' },
  { id: 'crew_limits', title: 'The crew drafts, people decide', rule: 'No crew member moves money, sends, posts, deletes or changes settings. Security is never steered by a model.', since: '2026-11-04' },
];

export interface VisionDrift { id: string; principleId: string; note: string; openedAt: number; closedAt?: number }

export interface BriefingInputs {
  now: number;
  /** security_briefs/{date} — the latest one found (today or yesterday). */
  securityBrief?: { date?: string; summary?: string; topRisks?: string[]; recommendedActions?: string[]; openFindings?: number; activeMitigations?: number; councilRunsLast24h?: number } | null;
  /** Open + acknowledged findings by severity. */
  findings?: { critical: number; high: number; medium: number; low: number } | null;
  /** Users created in the window. `capped` = the count hit the read limit, so it is "at least". */
  signups?: { last24h: number; last7d: number; capped: boolean } | null;
  drifts?: VisionDrift[];
}

export interface BriefingSection { crew: string; headline: string; lines: string[]; tone: 'ok' | 'watch' | 'act' | 'unknown' }
export interface HqBriefing { date: string; generatedAt: number; headline: string; sections: BriefingSection[] }

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

export function composeBriefing(i: BriefingInputs): HqBriefing {
  const sections: BriefingSection[] = [];

  // Security Council
  const f = i.findings;
  const b = i.securityBrief;
  if (!f && !b) {
    sections.push({ crew: 'Security Council', headline: 'No security data reached the briefing.', lines: ['The council’s records could not be read. Check that its 15-minute run is alive.'], tone: 'unknown' });
  } else {
    const urgent = (f?.critical || 0) + (f?.high || 0);
    const lines: string[] = [];
    if (f) lines.push(`Open: ${f.critical} critical, ${f.high} high, ${f.medium} medium, ${f.low} low.`);
    if (b?.summary) lines.push(b.summary);
    for (const r of (b?.topRisks || []).slice(0, 3)) lines.push(`Risk: ${r}`);
    for (const a of (b?.recommendedActions || []).slice(0, 3)) lines.push(`Do: ${a}`);
    if (typeof b?.activeMitigations === 'number') lines.push(`${plural(b.activeMitigations, 'reversible mitigation')} active.`);
    if (b && b.councilRunsLast24h === 0) lines.push('The council has not run in 24 hours.');
    sections.push({
      crew: 'Security Council',
      headline: urgent ? `${plural(urgent, 'urgent finding')} need you.` : 'Nothing urgent.',
      lines, tone: f?.critical ? 'act' : urgent || b?.councilRunsLast24h === 0 ? 'watch' : 'ok',
    });
  }

  // Growth Analyst
  const g = i.signups;
  if (!g) {
    sections.push({ crew: 'Growth Analyst', headline: 'Signups could not be counted.', lines: ['No figure is shown rather than a guess.'], tone: 'unknown' });
  } else {
    const atLeast = g.capped ? 'at least ' : '';
    const perDay = g.last7d / 7;
    const lines = [
      `${atLeast}${plural(g.last24h, 'new account')} in the last 24 hours; ${atLeast}${g.last7d} in 7 days.`,
      g.capped ? 'Counts hit the read limit, so they are floors, not totals.' : `About ${perDay.toFixed(1)} a day this week.`,
    ];
    const slow = !g.capped && g.last7d > 0 && g.last24h < perDay * 0.5;
    sections.push({ crew: 'Growth Analyst', headline: slow ? 'Today is running below this week’s pace.' : 'Signups in line with the week.', lines, tone: slow ? 'watch' : 'ok' });
  }

  // Keeper of the Vision
  const open = (i.drifts || []).filter(d => !d.closedAt);
  const byId = new Map(VISION_PRINCIPLES.map(p => [p.id, p]));
  sections.push({
    crew: 'Keeper of the Vision',
    headline: open.length ? `${plural(open.length, 'open drift')} from your standing decisions.` : 'No open drifts logged.',
    lines: open.length
      ? open.slice(0, 8).map(d => `${byId.get(d.principleId)?.title || d.principleId}: ${d.note}`)
      : [`${VISION_PRINCIPLES.length} standing decisions held.`],
    tone: open.length ? 'watch' : 'ok',
  });

  const act = sections.filter(x => x.tone === 'act').length;
  const watch = sections.filter(x => x.tone === 'watch' || x.tone === 'unknown').length;
  return {
    date: new Date(i.now).toISOString().slice(0, 10),
    generatedAt: i.now,
    headline: act ? 'Something needs you today.' : watch ? `${plural(watch, 'thing')} to keep an eye on.` : 'All quiet across the crew.',
    sections,
  };
}

/** Count signups from rows newest-first (createdAt in ms or a Firestore timestamp-ish value). */
export function countSignups(rows: { createdAt?: unknown }[], now: number, readLimit: number): BriefingInputs['signups'] {
  const ms = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' ? Date.parse(v) : v && typeof v === 'object' && 'seconds' in (v as any) ? Number((v as any).seconds) * 1000 : NaN);
  const times = rows.map(r => ms(r.createdAt)).filter(Number.isFinite) as number[];
  if (!times.length && rows.length) return null; // the field is not what we expected — say "could not count"
  const last24h = times.filter(t => now - t <= 86_400_000).length;
  const last7d = times.filter(t => now - t <= 7 * 86_400_000).length;
  const oldest = times.length ? Math.min(...times) : now;
  return { last24h, last7d, capped: rows.length >= readLimit && now - oldest <= 7 * 86_400_000 };
}
