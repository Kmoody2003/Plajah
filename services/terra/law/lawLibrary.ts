/**
 * Terra Law Library — server-side reader for the laws a resident or a new
 * business actually runs into, straight from the official publishers.
 *
 *  · MICHIGAN — the Michigan Compiled Laws, from legislature.mi.gov. The
 *    Legislature's Automated Data Collection Policy permits automated access
 *    at no more than ONE request per second; every upstream call here goes
 *    through one serial gate that enforces that, plus a cache so repeat
 *    questions never reach them at all.
 *  · FEDERAL — the eCFR (Code of Federal Regulations) search API, ecfr.gov.
 *    Keyless public API. The eCFR is the authoritative-but-unofficial edition;
 *    we say so next to every result.
 *  · DETROIT — the City Code lives on Municode, which has no API and whose
 *    terms don't permit bulk copying. Terra links into it (and carries its own
 *    hand-encoded, cited zoning rules) instead of mirroring it.
 *
 * Law text is not copyrightable (Georgia v. Public.Resource.Org, 2020), but the
 * Legislature's own disclaimer applies: this is not the official version, and
 * nothing here is legal advice. The UI carries both.
 */

import { cached, cleanText } from '../../dataCommons/core';

const MI = 'https://www.legislature.mi.gov';
const UA = 'Plajah-Terra/1.0 (civic law lookup; honours the 1 req/s automated-access policy)';

// ─── The 1 request / second gate ─────────────────────────────────────────────

let gate: Promise<unknown> = Promise.resolve();
let lastCallAt = 0;

/** Serialize every legislature.mi.gov request at ≥1.05 s apart. */
function throughGate<T>(fn: () => Promise<T>): Promise<T> {
  const run = gate.then(async () => {
    const wait = lastCallAt + 1050 - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastCallAt = Date.now();
    return fn();
  });
  gate = run.catch(() => undefined);
  return run;
}

async function fetchText(url: string, timeoutMs = 15_000): Promise<string> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal, redirect: 'follow', headers: { 'User-Agent': UA, Accept: 'text/html' } });
    if (!res.ok) throw new Error(`${new URL(url).host} responded ${res.status}`);
    return await res.text();
  } catch (err: any) {
    if (err?.name === 'AbortError') throw new Error(`${new URL(url).host} timed out`);
    throw err;
  } finally { clearTimeout(timer); }
}

// ─── Michigan Compiled Laws ──────────────────────────────────────────────────

export interface MclHit {
  /** objectName id, e.g. "mcl-554-602". */
  id: string;
  /** "554.602" */
  section: string;
  catchline: string;
  url: string;
}

export interface MclSection {
  id: string;
  section: string;
  catchline: string;
  /** "LANDLORD AND TENANT RELATIONSHIPS" */
  actTitle?: string;
  /** "Act 348 of 1972" */
  actNumber?: string;
  popularName?: string;
  paragraphs: string[];
  history?: string;
  url: string;
  retrievedAt: number;
}

export const MCL_NOTICE =
  'Michigan Compiled Laws from legislature.mi.gov — not the official version, and not legal advice. Confirm against the Legislature\'s site before relying on it.';

/** Accept "554.602", "MCL 554.602", "mcl-554-602". */
export function mclId(raw: string): string | null {
  const m = String(raw).trim().toLowerCase().replace(/^mcl[\s-]*/, '').match(/^(\d{1,3})[.-]([0-9a-z]{1,12})$/);
  return m ? `mcl-${m[1]}-${m[2]}` : null;
}

/**
 * Everyday words → the term Michigan statutes actually use. Only phrases where
 * the plain word finds little or nothing and the legal term is unambiguous.
 */
const LEGAL_TERMS: Record<string, string> = {
  'food truck': 'mobile food establishment',
  'food trucks': 'mobile food establishment',
  'dba': 'assumed name',
  'doing business as': 'assumed name',
  'business name': 'assumed name',
  'llc': 'limited liability company',
  'eviction': 'summary proceedings',
  'evict': 'summary proceedings',
  'home business': 'home occupation',
  'airbnb': 'short-term rental',
  'short term rental': 'short-term rental',
  'landlord': 'landlord and tenant',
  'nonprofit': 'nonprofit corporation',
};

export function legalTerm(q: string): string | undefined {
  return LEGAL_TERMS[q.trim().toLowerCase().replace(/\s+/g, ' ')];
}

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'or', 'to', 'in', 'for', 'on', 'my', 'i', 'is', 'can', 'do', 'how', 'what', 'need']);

/**
 * Keyword search via the Legislature's own search. Their results come back in
 * section-number order with no ranking, so we rank by how much of the query the
 * catchline (the section's one-line summary) actually covers.
 */
export async function searchMcl(query: string, max = 20): Promise<{ total: number; hits: MclHit[]; searchedAs?: string }> {
  const typed = cleanText(query, 120);
  if (typed.length < 2) return { total: 0, hits: [] };
  const searchedAs = legalTerm(typed);
  const q = searchedAs ?? typed;
  // A section number typed directly is a lookup, not a search.
  const direct = mclId(q);
  if (direct) {
    const s = await fetchMclSection(direct);
    return { total: 1, hits: [{ id: s.id, section: s.section, catchline: s.catchline, url: s.url }] };
  }
  return cached(`mcl:search:${q.toLowerCase()}`, 6 * 3600_000, async () => {
    const url = `${MI}/Search/ExecuteSearch?docTypes=MCLs&contentFullText=${encodeURIComponent(q)}`;
    const html = await throughGate(() => fetchText(url, 20_000));
    const total = Number((html.match(/\(([\d,]+) results? found\)/i)?.[1] ?? '0').replace(/,/g, ''));
    const rows: MclHit[] = [];
    const rowRe = /objectName=(mcl-[0-9a-z-]+)[^"]*">Section\s+([^<]+)<\/a><\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td>([\s\S]*?)<\/td>/gi;
    let m: RegExpExecArray | null;
    while ((m = rowRe.exec(html))) {
      if (m[3].trim().toLowerCase() !== 'section') continue;
      const id = m[1].toLowerCase();
      // The highlight <span>s leave a space before punctuation ("deposit ; amount").
      const catchline = cleanText(m[4], 400).replace(/\s+([;,.:])/g, '$1');
      rows.push({ id, section: m[2].trim(), catchline, url: `${MI}/Laws/MCL?objectName=${id}` });
    }
    const words = q.toLowerCase().split(/\W+/).filter(w => w.length > 1 && !STOP.has(w));
    const phrase = q.toLowerCase();
    const score = (h: MclHit) => {
      const c = h.catchline.toLowerCase();
      let s = words.reduce((n, w) => n + (c.includes(w) ? 2 : 0), 0);
      if (c.includes(phrase)) s += 5;
      // Short, specific catchlines beat sprawling omnibus ones on the same hits —
      // but only among sections that matched; a bare "Definitions." isn't a hit.
      return s > 0 ? s - Math.min(c.length / 400, 1) : -1;
    };
    // Stable sort: equal scores keep the Legislature's own order.
    rows.sort((a, b) => score(b) - score(a));
    return { total: total || rows.length, hits: rows.slice(0, max), searchedAs };
  });
}

export async function fetchMclSection(rawId: string): Promise<MclSection> {
  const id = mclId(rawId);
  if (!id) throw new Error('Not an MCL section number');
  return cached(`mcl:section:${id}`, 24 * 3600_000, async () => {
    const url = `${MI}/Laws/MCL?objectName=${id}`;
    const html = await throughGate(() => fetchText(url));
    const wrap = html.match(/<div class="sectionWrapper">([\s\S]*?)<\/main>/i)?.[1];
    if (!wrap) throw new Error('Section not found on legislature.mi.gov');
    const actTitle = cleanText(wrap.match(/class="h2">([\s\S]*?)<\/h1>/i)?.[1], 200).replace(/\s*\(EXCERPT\)\s*$/i, '') || undefined;
    const actNumber = cleanText(wrap.match(/class="h3">([\s\S]*?)<\/h1>/i)?.[1], 80) || undefined;
    const head = cleanText(wrap.match(/class="h4"[^>]*>([\s\S]*?)<\/h1>/i)?.[1], 2000);
    const section = head.match(/^([0-9]+\.[0-9a-z]+)/i)?.[1] ?? id.replace(/^mcl-/, '').replace('-', '.');
    const catchline = head.replace(/^[0-9]+\.[0-9a-z]+\s*/i, '');
    const editorial = wrap.match(/<div class="editorials[^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? '';
    const body = wrap.replace(/<div class="editorials[\s\S]*?<\/div>/i, '');
    const paragraphs = [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
      .map(p => cleanText(p[1], 20_000))
      .filter(t => t && !/^sec\.\s*[0-9a-z]+\.?$/i.test(t));
    const history = cleanText(editorial.match(/History:<\/span>([\s\S]*?)(<br|<\/p>)/i)?.[1], 600) || undefined;
    const popularName = cleanText(editorial.match(/Popular Name:<\/span>([\s\S]*?)<\/p>/i)?.[1], 200) || undefined;
    return { id, section, catchline, actTitle, actNumber, popularName, paragraphs, history, url, retrievedAt: Date.now() };
  });
}

// ─── Federal: eCFR ───────────────────────────────────────────────────────────

export interface CfrHit {
  title: string;
  part?: string;
  section?: string;
  /** "Title 21 · Part 1 · § 1.281" */
  citation: string;
  heading: string;
  agency?: string;
  excerpt: string;
  url: string;
}

export const CFR_NOTICE =
  'Code of Federal Regulations via eCFR (ecfr.gov) — authoritative but not the official legal edition; current text only.';

export async function searchCfr(query: string, max = 15): Promise<{ total: number; hits: CfrHit[] }> {
  const q = cleanText(query, 120);
  if (q.length < 2) return { total: 0, hits: [] };
  return cached(`cfr:search:${q.toLowerCase()}`, 6 * 3600_000, async () => {
    const url = `https://www.ecfr.gov/api/search/v1/results?query=${encodeURIComponent(q)}&date=current&per_page=${Math.min(max * 2, 40)}`;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15_000);
    let j: any;
    try {
      const res = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json', 'User-Agent': UA } });
      if (!res.ok) throw new Error(`ecfr.gov responded ${res.status}`);
      j = await res.json();
    } catch (err: any) {
      throw new Error(err?.name === 'AbortError' ? 'ecfr.gov timed out' : String(err?.message || err));
    } finally { clearTimeout(timer); }
    const seen = new Set<string>();
    const hits: CfrHit[] = [];
    for (const r of j?.results ?? []) {
      const h = r.hierarchy ?? {};
      const key = `${h.title}:${h.section ?? h.part}`;
      if (!h.title || seen.has(key)) continue;
      seen.add(key);
      const hh = r.headings ?? {};
      const path = h.section ? `title-${h.title}/section-${h.section}` : h.part ? `title-${h.title}/part-${h.part}` : `title-${h.title}`;
      hits.push({
        title: String(h.title),
        part: h.part ?? undefined,
        section: h.section ?? undefined,
        citation: [`Title ${h.title}`, h.part && `Part ${h.part}`, h.section && `§ ${h.section}`].filter(Boolean).join(' · '),
        heading: cleanText(hh.section || hh.part || hh.title, 300),
        agency: cleanText(hh.chapter, 160) || undefined,
        excerpt: cleanText(r.full_text_excerpt, 360),
        url: `https://www.ecfr.gov/current/${path}`,
      });
      if (hits.length >= max) break;
    }
    return { total: Number(j?.meta?.total_count ?? hits.length), hits };
  });
}
