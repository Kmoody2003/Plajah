/**
 * Data Commons — federal grant matcher (Elevate / Business).
 *
 * Sources: Grants.gov `search2` + `fetchOpportunity` (keyless), and USAspending
 * for "who has been funded near you" context.
 *
 * ── What the score is, and is not ────────────────────────────────────────────
 * `relevance` ranks how well a posting's title/agency/category lines up with the
 * org's stated mission, and how workable its deadline is. It is NOT an
 * eligibility determination. Grants.gov filters by applicant TYPE, but each
 * notice (NOFO) carries its own geography, tax-status and match requirements in
 * prose. So every match ships `eligibilityText` verbatim from the notice and the
 * UI says "confirm eligibility in the notice".
 */

import { cached, fetchJson, prov, cleanText, type Provenance } from './core';

const API = 'https://api.grants.gov/v1/api';

// ─── Vocabulary ──────────────────────────────────────────────────────────────

export type ApplicantKind =
  | 'church' | 'nonprofit' | 'charity' | 'cultural' | 'school-district' | 'college'
  | 'small-business' | 'business' | 'city' | 'county' | 'state' | 'tribal' | 'housing-authority'
  | 'public-school' | 'charter-school' | 'private-school' | 'homeschool-coop' | 'teacher';

/** Grants.gov applicant-type codes (from the live facet list). */
export const ELIGIBILITY_BY_KIND: Record<ApplicantKind, string[]> = {
  church: ['12', '13'],
  nonprofit: ['12', '13'],
  charity: ['12', '13'],
  cultural: ['12', '13'],
  'school-district': ['05'],
  college: ['06', '20'],
  'small-business': ['23'],
  business: ['22', '23'],
  city: ['02'],
  county: ['01'],
  state: ['00'],
  tribal: ['07', '11'],
  'housing-authority': ['08'],
  // A single public school applies through its district (05). Charters vary by state: some are their own
  // nonprofit (12), some are treated as district-like. Private schools and co-ops are nonprofits or "Other".
  'public-school': ['05'],
  'charter-school': ['12', '05'],
  'private-school': ['12', '25'],
  'homeschool-coop': ['12', '13'],
  // Individuals (21): few federal notices are open to a teacher personally — see KIND_NOTES.
  teacher: ['21'],
};

/** Mission topic → Grants.gov funding-category code + a search phrase. */
export const TOPICS: Record<string, { label: string; category: string; phrase: string }> = {
  housing: { label: 'Housing', category: 'HO', phrase: 'housing' },
  community: { label: 'Community development', category: 'CD', phrase: 'community development' },
  food: { label: 'Food & nutrition', category: 'FN', phrase: 'food nutrition' },
  health: { label: 'Health', category: 'HL', phrase: 'health' },
  education: { label: 'Education', category: 'ED', phrase: 'education' },
  workforce: { label: 'Jobs & training', category: 'ELT', phrase: 'workforce training' },
  arts: { label: 'Arts', category: 'AR', phrase: 'arts' },
  humanities: { label: 'Humanities & history', category: 'HU', phrase: 'humanities' },
  environment: { label: 'Environment', category: 'ENV', phrase: 'environment' },
  disaster: { label: 'Disaster & resilience', category: 'DPR', phrase: 'disaster resilience' },
  business: { label: 'Business & commerce', category: 'BC', phrase: 'small business' },
  recreation: { label: 'Recreation & tourism', category: 'RT', phrase: 'recreation' },
  income: { label: 'Income & social services', category: 'IS', phrase: 'social services' },
  legal: { label: 'Law & justice', category: 'LJL', phrase: 'justice' },
  energy: { label: 'Energy', category: 'EN', phrase: 'energy efficiency' },
  transportation: { label: 'Transportation', category: 'T', phrase: 'transportation' },
  opportunityZone: { label: 'Opportunity Zones', category: 'OZ', phrase: 'opportunity zone' },
  science: { label: 'Science & research', category: 'ST', phrase: 'science technology research' },
  agriculture: { label: 'Agriculture', category: 'AG', phrase: 'agriculture farm' },
  rural: { label: 'Rural development', category: 'RD', phrase: 'rural' },
  // Education sub-topics: the "Education" category alone is far too broad for a school.
  stem: { label: 'STEM education', category: 'ED', phrase: 'STEM education' },
  literacy: { label: 'Literacy & reading', category: 'ED', phrase: 'literacy reading' },
  specialEd: { label: 'Special education', category: 'ED', phrase: 'disabilities special education' },
  earlyChildhood: { label: 'Early childhood', category: 'ED', phrase: 'early childhood' },
  cte: { label: 'Career & technical education', category: 'ED', phrase: 'career technical education' },
  schoolMeals: { label: 'School meals & nutrition', category: 'FN', phrase: 'school meals nutrition' },
  schoolSafety: { label: 'School safety & mental health', category: 'ED', phrase: 'school safety mental health' },
  teacherDev: { label: 'Teacher training', category: 'ED', phrase: 'teacher professional development' },
};

/** Context the UI should show for a kind before the user applies. */
export const KIND_NOTES: Partial<Record<ApplicantKind, string>> = {
  church: 'Federal funds can generally support secular services a congregation provides (food, housing counseling, '
    + 'youth programs) but not worship or religious instruction. Check each notice, and use a separate legal entity '
    + 'or program account where the notice asks for one.',
  'small-business': 'Most federal grants exclude for-profits. Small-business money is mostly SBA loans, SBIR/STTR research '
    + 'awards and government contracts, so expect few grant matches and use the financing and contracts guidance below.',
  business: 'Most federal grants exclude for-profits. Check the notice: research (SBIR/STTR-style), rural and energy programs '
    + 'are the ones that often accept businesses.',
  'public-school': 'A single public school normally applies through its district. Big programs like Title I and IDEA are formula '
    + 'funds that reach schools through the state, not competitive grants you apply for directly.',
  'charter-school': 'Whether a charter applies as its own nonprofit or through a district depends on your state. Confirm which '
    + 'entity holds your UEI and tax status before you apply.',
  'private-school': 'Private schools can apply as nonprofits to many notices, but some education funds are limited to public '
    + 'schools. The notice says; read its eligibility text.',
  'homeschool-coop': 'Co-ops usually apply as a nonprofit. Individual homeschooling families are rarely eligible for federal grants.',
  teacher: 'Very few federal grants go to individual teachers. The ones that do are mostly fellowships and summer institutes. '
    + 'Most classroom money comes from your district, foundations and classroom-funding sites, so ask your school or district '
    + 'office whether they can apply for you.',
};

// ─── Pure helpers (unit-tested) ──────────────────────────────────────────────

export interface GrantHit {
  id: string;
  number: string;
  title: string;
  agencyCode: string;
  agency: string;
  openDate?: string;
  /** ISO date, or undefined for forecasts / rolling notices. */
  closeDate?: string;
  status: 'posted' | 'forecasted' | string;
  assistanceListings: string[];
}

/** Grants.gov dates are MM/DD/YYYY; "" means no deadline. */
export function parseGrantsDate(s: unknown): string | undefined {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s ?? '').trim());
  return m ? `${m[3]}-${m[1]}-${m[2]}` : undefined;
}

export function normalizeHit(h: any): GrantHit | null {
  if (!h?.id || !h?.title) return null;
  return {
    id: String(h.id),
    number: String(h.number || ''),
    title: cleanText(h.title, 220),
    agencyCode: String(h.agencyCode || ''),
    agency: cleanText(h.agency, 120),
    openDate: parseGrantsDate(h.openDate),
    closeDate: parseGrantsDate(h.closeDate),
    status: String(h.oppStatus || ''),
    assistanceListings: Array.isArray(h.cfdaList) ? h.cfdaList.map(String) : [],
  };
}

export function daysUntil(iso: string | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  const t = Date.parse(`${iso}T23:59:59Z`);
  return Number.isFinite(t) ? Math.ceil((t - now) / 86_400_000) : null;
}

export interface MatchInput {
  kind: ApplicantKind;
  topics: string[];
  keywords: string[];
  preferredAgencies?: string[];
}

const RESEARCH_MECHANISM = /\((?:[A-Z]\d{2}|R\d{2}|U\d{2}|P\d{2})[^)]*\)|research (?:project|software|scientist)|investigator|studies to/i;

export interface Scored { relevance: number; reasons: string[] }

/** `topicsHit` / `keywordsFound` come from which searches surfaced this posting. */
export function scoreOpportunity(
  hit: GrantHit,
  ctx: { topicsHit: string[]; keywordsFound: string[]; input: MatchInput },
  now = Date.now(),
): Scored {
  let score = 0;
  const reasons: string[] = [];
  const title = hit.title.toLowerCase();

  const topicPts = Math.min(2, ctx.topicsHit.length) * 20;
  if (topicPts) {
    score += topicPts;
    reasons.push(`Funding category fits: ${ctx.topicsHit.map(t => TOPICS[t]?.label || t).join(', ')}`);
  }

  // Funding-category tags are broad (NIH tags lab research "Food and Nutrition"), so reward a title
  // that actually names the topic, and demote investigator-style research mechanisms for orgs that
  // are not colleges — those notices are written for principal investigators, not service providers.
  const topicWords = ctx.input.topics.flatMap(t => (TOPICS[t]?.phrase || '').split(' ')).filter(w => w.length > 3);
  // Whole-word match: "food" must not fire on "foodborne" pathogen research.
  if (topicWords.some(w => new RegExp(`\\b${w}\\b`).test(title))) { score += 20; reasons.push('Title names your topic'); }
  if (ctx.input.kind !== 'college' && RESEARCH_MECHANISM.test(hit.title)) {
    score -= 20;
    reasons.push('Research-mechanism award — usually written for investigators, not service providers');
  }

  const titleKw = ctx.input.keywords.filter(k => k && title.includes(k.toLowerCase()));
  if (titleKw.length) {
    score += Math.min(2, titleKw.length) * 15;
    reasons.push(`Title mentions ${titleKw.slice(0, 2).map(k => `"${k}"`).join(', ')}`);
  } else if (ctx.keywordsFound.length) {
    score += 10;
    reasons.push(`Surfaced by your keyword search (${ctx.keywordsFound.slice(0, 2).join(', ')})`);
  }

  if (hit.status === 'posted') { score += 10; } else if (hit.status === 'forecasted') {
    score += 5;
    reasons.push('Forecast — not open yet, but you can prepare early');
  }

  const days = daysUntil(hit.closeDate, now);
  if (hit.status === 'posted' && days !== null) {
    if (days < 0) { score -= 40; reasons.push('Deadline has passed'); }
    else if (days < 14) { score -= 5; reasons.push(`Tight: closes in ${days} day${days === 1 ? '' : 's'}`); }
    else if (days <= 120) { score += 10; reasons.push(`Closes in ${days} days — time to prepare`); }
  }

  const pref = (ctx.input.preferredAgencies || []).map(a => a.toLowerCase());
  if (pref.length && pref.some(p => hit.agencyCode.toLowerCase() === p || hit.agency.toLowerCase().includes(p))) {
    score += 10;
    reasons.push(`From a preferred agency (${hit.agencyCode})`);
  }

  return { relevance: Math.max(0, Math.min(100, score)), reasons };
}

// ─── Grants.gov ──────────────────────────────────────────────────────────────

async function search2(body: Record<string, unknown>): Promise<GrantHit[]> {
  const key = `g2:${JSON.stringify(body)}`;
  const json = await cached(key, 30 * 60_000, () => fetchJson<any>(`${API}/search2`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    timeoutMs: 25_000,
  }));
  if (json?.errorcode && json.errorcode !== 0) throw new Error(`Grants.gov: ${json.msg || 'search failed'}`);
  return (Array.isArray(json?.data?.oppHits) ? json.data.oppHits : [])
    .map(normalizeHit).filter((h: GrantHit | null): h is GrantHit => !!h);
}

export interface OpportunityDetail {
  id: string;
  number: string;
  title: string;
  agency: string;
  summary: string;
  eligibilityText: string;
  awardFloor?: number;
  awardCeiling?: number;
  estimatedFunding?: number;
  numberOfAwards?: number;
  costSharing?: boolean;
  postingDate?: string;
  closeDate?: string;
  contactEmail?: string;
  link: string;
}

const money = (v: unknown): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

export function normalizeDetail(json: any): OpportunityDetail | null {
  const d = json?.data;
  const s = d?.synopsis;
  if (!d?.id) return null;
  const toIso = (x: unknown) => {
    const t = Date.parse(String(x ?? '').replace(/ (AM|PM) .*$/, ' $1'));
    return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : undefined;
  };
  return {
    id: String(d.id),
    number: String(d.opportunityNumber || ''),
    title: cleanText(d.opportunityTitle, 220),
    agency: cleanText(s?.agencyName || d.owningAgencyCode, 120),
    summary: cleanText(s?.synopsisDesc, 600),
    eligibilityText: cleanText(s?.applicantEligibilityDesc, 700),
    awardFloor: money(s?.awardFloor),
    awardCeiling: money(s?.awardCeiling),
    estimatedFunding: money(s?.estimatedFunding),
    numberOfAwards: money(s?.numberOfAwards),
    costSharing: typeof s?.costSharing === 'boolean' ? s.costSharing : undefined,
    postingDate: toIso(s?.postingDate),
    closeDate: toIso(s?.responseDate),
    contactEmail: typeof s?.agencyContactEmail === 'string' ? s.agencyContactEmail : undefined,
    link: `https://www.grants.gov/search-results-detail/${encodeURIComponent(String(d.id))}`,
  };
}

export async function fetchOpportunity(id: string): Promise<OpportunityDetail | null> {
  if (!/^\d{1,12}$/.test(id)) throw new Error('opportunity id must be numeric');
  const json = await cached(`g2d:${id}`, 6 * 60 * 60_000, () => fetchJson<any>(`${API}/fetchOpportunity`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ opportunityId: Number(id) }),
    timeoutMs: 25_000,
  }));
  return normalizeDetail(json);
}

// ─── Matcher ─────────────────────────────────────────────────────────────────

export interface GrantMatch extends GrantHit {
  relevance: number;
  reasons: string[];
  detail?: OpportunityDetail;
  link: string;
}

export interface GrantMatchResult {
  input: MatchInput;
  matches: GrantMatch[];
  totalConsidered: number;
  kindNote?: string;
  /** The UI must show this next to every result set. */
  disclaimer: string;
  source: Provenance;
}

export const GRANT_DISCLAIMER =
  'Relevance is a ranking of how a notice lines up with your mission and timeline — not an eligibility '
  + 'determination. Each notice sets its own geography, tax-status and match rules; read its eligibility text before applying.';

export function sanitizeInput(raw: any): MatchInput {
  const kind = String(raw?.kind || 'nonprofit') as ApplicantKind;
  if (!(kind in ELIGIBILITY_BY_KIND)) throw new Error(`unknown applicant kind: ${kind}`);
  const list = (v: unknown, max: number, len: number): string[] =>
    (Array.isArray(v) ? v : []).map(x => cleanText(x, len)).filter(Boolean).slice(0, max);
  const topics = list(raw?.topics, 4, 30).filter(t => t in TOPICS);
  const keywords = list(raw?.keywords, 4, 40);
  if (!topics.length && !keywords.length) throw new Error('pick at least one topic or keyword');
  return { kind, topics, keywords, preferredAgencies: list(raw?.preferredAgencies, 5, 20) };
}

export async function matchGrants(rawInput: unknown, opts: { enrich?: number } = {}): Promise<GrantMatchResult> {
  const input = sanitizeInput(rawInput);
  const eligibilities = ELIGIBILITY_BY_KIND[input.kind].join('|');
  const base = { oppStatuses: 'forecasted|posted', eligibilities, rows: 25 };

  const searches: { topic?: string; keyword?: string; body: Record<string, unknown> }[] = [
    ...input.topics.map(t => ({ topic: t, body: { ...base, fundingCategories: TOPICS[t].category } })),
    ...input.keywords.map(k => ({ keyword: k, body: { ...base, keyword: k } })),
  ];

  const settled = await Promise.allSettled(searches.map(s => search2(s.body)));
  if (settled.every(r => r.status === 'rejected')) {
    throw new Error((settled[0] as PromiseRejectedResult).reason?.message || 'Grants.gov unavailable');
  }

  const pool = new Map<string, { hit: GrantHit; topics: Set<string>; keywords: Set<string> }>();
  settled.forEach((r, i) => {
    if (r.status !== 'fulfilled') return;
    for (const hit of r.value) {
      const slot = pool.get(hit.id) || { hit, topics: new Set<string>(), keywords: new Set<string>() };
      if (searches[i].topic) slot.topics.add(searches[i].topic!);
      if (searches[i].keyword) slot.keywords.add(searches[i].keyword!);
      pool.set(hit.id, slot);
    }
  });

  const ranked: GrantMatch[] = [...pool.values()]
    .map(({ hit, topics, keywords }) => {
      const s = scoreOpportunity(hit, { topicsHit: [...topics], keywordsFound: [...keywords], input });
      return { ...hit, ...s, link: `https://www.grants.gov/search-results-detail/${hit.id}` };
    })
    // A closed notice is history, not a match.
    .filter(m => !(m.status === 'posted' && (daysUntil(m.closeDate) ?? 1) < 0))
    .sort((a, b) => b.relevance - a.relevance || String(a.closeDate || '9').localeCompare(String(b.closeDate || '9')))
    .slice(0, 30);

  // Enrich only the head of the list — each detail is one more upstream call.
  const enrichN = Math.min(ranked.length, opts.enrich ?? 10);
  await Promise.all(ranked.slice(0, enrichN).map(async m => {
    try { m.detail = (await fetchOpportunity(m.id)) ?? undefined; } catch { /* leave the card without detail */ }
  }));

  return {
    input,
    matches: ranked,
    totalConsidered: pool.size,
    kindNote: KIND_NOTES[input.kind],
    disclaimer: GRANT_DISCLAIMER,
    source: prov('GSA / Grants.gov', 'Search2 + fetchOpportunity', 'https://www.grants.gov/search-grants'),
  };
}

// ─── USAspending peer context ────────────────────────────────────────────────

export interface PeerAward {
  recipient: string;
  amount: number;
  description: string;
  awardId: string;
}

export interface PeerAwards {
  fiscalYear: number;
  awards: PeerAward[];
  source: Provenance;
}

/** Recent federal grant awards performed in a county — "who has been funded near you". */
export async function peerAwards(
  state: string, countyFips: string, keywords: string[], limit = 6,
): Promise<PeerAwards> {
  if (!/^[A-Z]{2}$/.test(state) || !/^\d{3}$/.test(countyFips)) throw new Error('state (2-letter) and 3-digit county FIPS required');
  const now = new Date();
  // Federal fiscal year runs Oct–Sep; use the last COMPLETED one so the numbers are stable.
  const fiscalYear = now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1;
  const body = {
    filters: {
      award_type_codes: ['02', '03', '04', '05'],
      place_of_performance_locations: [{ country: 'USA', state, county: countyFips }],
      time_period: [{ start_date: `${fiscalYear - 1}-10-01`, end_date: `${fiscalYear}-09-30` }],
      ...(keywords.length ? { keywords: keywords.slice(0, 4) } : {}),
    },
    fields: ['Award ID', 'Recipient Name', 'Award Amount', 'Description'],
    sort: 'Award Amount',
    order: 'desc',
    limit: Math.min(10, limit),
  };
  const json = await cached(`usa:${JSON.stringify(body)}`, 12 * 60 * 60_000, () => fetchJson<any>(
    'https://api.usaspending.gov/api/v2/search/spending_by_award/',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), timeoutMs: 30_000 },
  ));
  const awards: PeerAward[] = (Array.isArray(json?.results) ? json.results : []).map((r: any) => ({
    recipient: cleanText(r['Recipient Name'], 100),
    amount: Number(r['Award Amount']) || 0,
    description: cleanText(r['Description'], 220),
    awardId: String(r['Award ID'] || ''),
  }));
  return {
    fiscalYear,
    awards,
    source: prov('Treasury / USAspending.gov', 'Spending by award', 'https://www.usaspending.gov/search', `FY${fiscalYear}`),
  };
}
