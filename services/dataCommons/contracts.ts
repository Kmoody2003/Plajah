/**
 * Data Commons — federal contract opportunities (SAM.gov), for small businesses.
 *
 * Source: the SAM.gov "Get Opportunities" public API (api.sam.gov/opportunities/v2/search). It needs a
 * free API key (`SAM_GOV_API_KEY`, created on a SAM.gov account's Account Details page), and its daily
 * request quota is small for non-federal keys. So this module is built around spending as few
 * requests as possible:
 *
 *   - ONE pull per place-of-performance state and day (cached six hours), up to 1,000 recent notices.
 *   - Everything else — business type (NAICS), keywords, set-asides, certifications — filters that
 *     pulled set locally, so a hundred businesses in one state cost one request.
 *   - The API accepts only one set-aside value per call, which is another reason not to filter upstream.
 *
 * Honesty rules: a notice reserved for a certification the business does not hold is hidden by default
 * and counted, never silently dropped; and "full and open" notices are marked as competing against
 * businesses of every size. We do not know a business's win chances, so there is no win score.
 *
 * Without a key the module reports `unconfigured` rather than failing, so the UI can say so plainly.
 */

import { cached, cleanText, fetchJson, prov, type Provenance } from './core';

const API = 'https://api.sam.gov/opportunities/v2/search';

export type CertKey = 'small' | 'wosb' | 'edwosb' | 'sdvosb' | 'vosb' | 'hubzone' | '8a' | 'indian';
export const CERTS: { key: CertKey; label: string; hint: string }[] = [
  { key: 'small', label: 'Small business', hint: 'Meets SBA size standards for your NAICS code. Most businesses with under a few hundred employees qualify.' },
  { key: 'wosb', label: 'Women-owned (WOSB)', hint: 'At least 51% owned and controlled by women.' },
  { key: 'edwosb', label: 'Economically disadvantaged women-owned (EDWOSB)', hint: 'WOSB that also meets SBA\'s economic-disadvantage tests.' },
  { key: 'sdvosb', label: 'Service-disabled veteran-owned (SDVOSB)', hint: 'Owned and controlled by a veteran with a service-connected disability.' },
  { key: 'vosb', label: 'Veteran-owned (VOSB)', hint: 'Owned and controlled by a veteran.' },
  { key: 'hubzone', label: 'HUBZone', hint: 'Principal office in a Historically Underutilized Business Zone and most employees live in one.' },
  { key: '8a', label: '8(a) Business Development', hint: 'Admitted to SBA\'s 8(a) program for socially and economically disadvantaged owners.' },
];
export const CERT_KEYS = CERTS.map(c => c.key);

/** Which certification a SAM.gov set-aside code requires. `null` = no certification (open, or local). */
export function requiredCert(code: string | undefined): CertKey | null | 'unknown' {
  switch ((code || '').toUpperCase()) {
    case '': case 'NONE': return null;
    case 'SBA': case 'SBP': return 'small';
    case '8A': case '8AN': return '8a';
    case 'HZC': case 'HZS': return 'hubzone';
    case 'SDVOSBC': case 'SDVOSBS': return 'sdvosb';
    case 'WOSB': case 'WOSBSS': return 'wosb';
    case 'EDWOSB': case 'EDWOSBSS': return 'edwosb';
    case 'VSA': case 'VSS': return 'vosb';
    case 'IEE': case 'ISBEE': return 'indian';
    case 'LAS': return null; // local-area set-aside (disaster response): decided by place, not a certification
    default: return 'unknown';
  }
}

/** Certifications nest: an SDVOSB is also veteran-owned, and an EDWOSB is also women-owned. The reverse is not true. */
export function holds(certs: CertKey[], need: CertKey): boolean {
  if (certs.includes(need)) return true;
  if (need === 'vosb') return certs.includes('sdvosb');
  if (need === 'wosb') return certs.includes('edwosb');
  return false;
}

export interface ContractOpp {
  noticeId: string;
  title: string;
  solicitation?: string;
  agency: string;
  type: string;
  postedDate?: string;
  /** ISO date-time as SAM.gov gives it; absent for notices with no response date. */
  deadline?: string;
  setAside?: string;
  setAsideCode?: string;
  naics?: string;
  place?: string;
  link: string;
}

export function normalizeOpp(r: any): ContractOpp | null {
  if (!r || !r.noticeId || !r.title) return null;
  const place = r.placeOfPerformance || r.officeAddress || {};
  const city = place.city?.name || place.city || '';
  const st = place.state?.code || place.state || '';
  return {
    noticeId: String(r.noticeId),
    title: cleanText(r.title, 200),
    solicitation: r.solicitationNumber ? String(r.solicitationNumber) : undefined,
    agency: cleanText(String(r.fullParentPathName || r.organizationName || '').split('.').slice(0, 2).join(' · '), 140),
    type: cleanText(r.type || r.baseType, 40),
    postedDate: typeof r.postedDate === 'string' ? r.postedDate.slice(0, 10) : undefined,
    deadline: typeof r.responseDeadLine === 'string' && r.responseDeadLine ? r.responseDeadLine : undefined,
    setAside: r.typeOfSetAsideDescription ? cleanText(r.typeOfSetAsideDescription, 80) : undefined,
    setAsideCode: r.typeOfSetAside ? String(r.typeOfSetAside) : undefined,
    naics: r.naicsCode ? String(r.naicsCode) : undefined,
    place: [city, st].filter(Boolean).join(', ') || undefined,
    link: typeof r.uiLink === 'string' && /^https:\/\/sam\.gov\//.test(r.uiLink) ? r.uiLink : `https://sam.gov/opp/${encodeURIComponent(String(r.noticeId))}/view`,
  };
}

/** Notice types a business can still respond to. Awards and surplus sales are history, not opportunities. */
export const OPEN_TYPES = /solicitation|combined synopsis|presolicitation|sources sought|special notice|request for information/i;

export function isOpen(o: ContractOpp, now = Date.now()): boolean {
  if (!OPEN_TYPES.test(o.type)) return false;
  if (!o.deadline) return true; // sources-sought and presolicitations often have no hard date
  const t = Date.parse(o.deadline);
  return !Number.isFinite(t) || t >= now;
}

export interface ContractFilter {
  /** 2-6 digit NAICS prefixes; a notice matches when its code starts with any. */
  naics?: string[];
  keywords?: string[];
  certs?: CertKey[];
  /** Keep notices reserved for certifications the business lacks (default false). */
  includeIneligible?: boolean;
}

export interface ScoredOpp extends ContractOpp {
  score: number;
  reasons: string[];
  /** 'reserved' = limited to small/certified businesses; 'open' = full and open competition. */
  competition: 'reserved' | 'open';
}

export function filterAndScore(all: ContractOpp[], f: ContractFilter, now = Date.now()): { opps: ScoredOpp[]; hiddenIneligible: number } {
  const certs: CertKey[] = f.certs?.length ? f.certs : ['small'];
  const prefixes = (f.naics || []).map(n => n.replace(/\D/g, '')).filter(n => n.length >= 2);
  const kws = (f.keywords || []).map(k => k.toLowerCase()).filter(Boolean);
  let hidden = 0;
  const opps: ScoredOpp[] = [];

  for (const o of all) {
    if (!isOpen(o, now)) continue;
    const naicsHit = !!o.naics && prefixes.some(p => o.naics!.startsWith(p));
    const title = o.title.toLowerCase();
    const kwHits = kws.filter(k => title.includes(k));
    // Asked for a type of work: only notices for that work are relevant — including to the "hidden" count.
    if ((prefixes.length || kws.length) && !naicsHit && !kwHits.length) continue;

    const need = requiredCert(o.setAsideCode);
    if (need !== null && need !== 'unknown' && !holds(certs, need)) {
      if (!f.includeIneligible) { hidden++; continue; }
    }
    let score = 0;
    const reasons: string[] = [];
    if (naicsHit) { score += 40; reasons.push(`Matches your NAICS code (${o.naics})`); }
    if (kwHits.length) { score += Math.min(2, kwHits.length) * 15; reasons.push(`Title mentions ${kwHits.slice(0, 2).map(k => `"${k}"`).join(', ')}`); }
    if (need !== null && need !== 'unknown') { score += 25; reasons.push(`Set aside for: ${CERTS.find(c => c.key === need)?.label || need} — you qualify`); }
    if (/sources sought|presolicitation|request for information/i.test(o.type)) { score += 10; reasons.push('Early notice — the agency is still shaping the buy, the best time to introduce yourself'); }
    const days = o.deadline ? Math.ceil((Date.parse(o.deadline) - now) / 86_400_000) : null;
    if (days !== null && days <= 5) { score -= 10; reasons.push(`Closes in ${Math.max(0, days)} day${days === 1 ? '' : 's'}`); }
    opps.push({ ...o, score: Math.max(0, Math.min(100, score)), reasons, competition: need === null ? 'open' : 'reserved' });
  }
  opps.sort((a, b) => b.score - a.score || String(a.deadline || '9').localeCompare(String(b.deadline || '9')));
  return { opps: opps.slice(0, 60), hiddenIneligible: hidden };
}

// ─── Upstream ────────────────────────────────────────────────────────────────

export interface ContractSearchResult {
  /** 'key-problem': SAM.gov rejected our key (invalid or expired) — an admin action, not the user's. */
  status: 'ok' | 'unconfigured' | 'rate-limited' | 'key-problem' | 'unavailable';
  message?: string;
  opportunities: ScoredOpp[];
  hiddenIneligible: number;
  /** How many notices were pulled for the state before filtering. */
  pulled: number;
  state?: string;
  source: Provenance;
}

const mdY = (d: Date) => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;

export async function pullState(state: string, apiKey: string, days = 45, now = new Date()): Promise<ContractOpp[]> {
  const from = new Date(now.getTime() - days * 86_400_000);
  const params = new URLSearchParams({ api_key: apiKey, postedFrom: mdY(from), postedTo: mdY(now), limit: '1000', offset: '0', state });
  // The key is a query parameter; it must never appear in a cache key or a log line.
  const json = await cached(`sam:${state}:${mdY(now)}`, 6 * 60 * 60_000, () => fetchJson<any>(`${API}?${params}`, { timeoutMs: 45_000 }));
  return (Array.isArray(json?.opportunitiesData) ? json.opportunitiesData : []).map(normalizeOpp).filter((o: ContractOpp | null): o is ContractOpp => !!o);
}

export async function searchContracts(
  state: string, filter: ContractFilter, env: { apiKey?: string } = { apiKey: process.env.SAM_GOV_API_KEY },
): Promise<ContractSearchResult> {
  const source = prov('GSA / SAM.gov', 'Contract Opportunities (Get Opportunities API)', 'https://sam.gov/search/?index=opp');
  const empty = { opportunities: [] as ScoredOpp[], hiddenIneligible: 0, pulled: 0, state, source };
  if (!/^[A-Z]{2}$/.test(state)) return { ...empty, status: 'unavailable', message: 'Add your state to your profile so we can search near you.' };
  if (!env.apiKey) {
    return { ...empty, status: 'unconfigured', message: 'Contract search is being set up. You can browse opportunities directly on SAM.gov in the meantime.' };
  }
  try {
    const all = await pullState(state, env.apiKey);
    const { opps, hiddenIneligible } = filterAndScore(all, filter);
    return { status: 'ok', opportunities: opps, hiddenIneligible, pulled: all.length, state, source };
  } catch (err: any) {
    const msg = String(err?.message || '');
    // 429 is throttling; 401/403 mean the provider rejected the key itself (invalid, or past its 90-day life).
    if (/\b429\b/.test(msg)) return { ...empty, status: 'rate-limited', message: 'SAM.gov\'s daily request limit was reached. Try again tomorrow, or browse SAM.gov directly.' };
    if (/\b(401|403)\b/.test(msg)) return { ...empty, status: 'key-problem', message: 'Contract search is temporarily unavailable while we renew our SAM.gov access. You can browse opportunities on SAM.gov in the meantime.' };
    return { ...empty, status: 'unavailable', message: 'SAM.gov did not respond. Try again in a few minutes.' };
  }
}

// ─── Business types → NAICS prefixes ─────────────────────────────────────────

/** Broad lines of work and the NAICS sector/subsector prefixes they usually fall under. A starting point, not a classification. */
export const BUSINESS_TYPES: { key: string; label: string; naics: string[] }[] = [
  { key: 'construction', label: 'Construction & trades', naics: ['23'] },
  { key: 'food', label: 'Food & catering', naics: ['311', '722', '445'] },
  { key: 'it', label: 'IT & software', naics: ['5112', '5182', '5415'] },
  { key: 'professional', label: 'Consulting & professional services', naics: ['5416', '5412', '5413', '5418'] },
  { key: 'creative', label: 'Media, design & marketing', naics: ['5121', '5122', '5191', '5418', '711'] },
  { key: 'facilities', label: 'Cleaning, security & facilities', naics: ['5612', '5616', '5617'] },
  { key: 'transport', label: 'Transportation & logistics', naics: ['484', '485', '492', '493'] },
  { key: 'manufacturing', label: 'Manufacturing & supply', naics: ['31', '32', '33', '423'] },
  { key: 'health', label: 'Health & social services', naics: ['621', '623', '624'] },
  { key: 'training', label: 'Training & education', naics: ['6114', '6115', '6116', '6117'] },
  { key: 'agriculture', label: 'Farming & landscaping', naics: ['11', '5617'] },
];

export function parseNaicsList(raw: string): string[] {
  return [...new Set(raw.split(/[\s,;]+/).map(s => s.replace(/\D/g, '')).filter(s => s.length >= 2 && s.length <= 6))].slice(0, 12);
}
