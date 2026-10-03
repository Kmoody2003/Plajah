/**
 * CourtListener (Free Law Project) adapter. Court opinions are public records; CourtListener's
 * search covers SCOTUS, the federal circuits and state supreme courts, usually within days of
 * a decision. Anonymous use works at a low rate; set COURTLISTENER_TOKEN for more.
 *
 * Limits we are honest about: a text hit for "overruled" next to a case name is a SIGNAL, not a
 * verdict (courts also write "we decline to overrule X"). Impacts from this adapter are always
 * marked for human review. We do not claim to be a citator like Shepard's or KeyCite.
 */
import type { CourtLevel, KnowledgeItem } from './types';
import { hash, isoDay, politeFetch } from './http';
import { parseCaseRef } from './watchlist';
import type { AnchorKind } from '../schoolChassis';

const BASE = 'https://www.courtlistener.com/api/rest/v4';
const token = () => (typeof process !== 'undefined' ? process.env?.COURTLISTENER_TOKEN : undefined);
const gap = () => (token() ? 700 : 2500);

export function levelOf(courtId: string, jurisdiction?: string): CourtLevel | null {
  if (courtId === 'scotus') return 'supreme-federal';
  if (jurisdiction === 'F') return 'federal-appellate';
  if (jurisdiction === 'S') return 'state-supreme';
  return null;
}

export const levelLabel: Record<CourtLevel, string> = { 'supreme-federal': 'U.S. Supreme Court', 'federal-appellate': 'Federal court of appeals', 'state-supreme': 'State supreme court' };

const strip = (s: string) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const quote = (s: string) => `"${s.replace(/["\\]/g, ' ').replace(/\s+/g, ' ').trim()}"`;

/** The full-text query that watches a legal anchor, or null if it is not a legal one. */
export function queryFor(kind: AnchorKind, ref: string): { q: string; treatment: boolean } | null {
  if (kind === 'case') {
    const { name } = parseCaseRef(ref); if (!name) return null;
    // Both parties' names must appear near "overrule"-type language. Treated as a signal for review.
    return { q: `${quote(name)} AND (overruled OR overruling OR overrules OR abrogated OR "no longer good law")`, treatment: true };
  }
  if (kind === 'statute' || kind === 'regulation' || kind === 'concept') return { q: quote(ref), treatment: false };
  return null;
}

export async function searchOpinions(q: string, since: Date, max = 8): Promise<KnowledgeItem[]> {
  const headers: Record<string, string> = token() ? { Authorization: `Token ${token()}` } : {};
  // Over-fetch because we drop trial and intermediate appellate courts after the fact.
  const url = `${BASE}/search/?type=o&order_by=dateFiled+desc&stat_Precedential=on&filed_after=${isoDay(since)}&q=${encodeURIComponent(q)}`;
  const res = await politeFetch(url, { host: 'courtlistener', minGapMs: gap(), headers });
  if (!res.ok) throw new Error(`courtlistener ${res.status}`);
  const rows: any[] = (await res.json())?.results || [];
  const out: KnowledgeItem[] = [];
  for (const r of rows) {
    const level = levelOf(String(r.court_id || ''), r.court_jurisdiction); if (!level) continue;
    const cluster = String(r.cluster_id ?? ''); if (!cluster) continue;
    const snippet = (r.opinions?.[0]?.snippet as string | undefined) || '';
    out.push({
      id: `cl_${cluster}`, domain: 'law', source: 'courtlistener', kind: 'opinion',
      tier: level === 'federal-appellate' ? 'court-persuasive' : 'court-binding',
      title: String(r.caseName || r.caseNameFull || 'Untitled opinion'), date: String(r.dateFiled || '').slice(0, 10) || isoDay(new Date()),
      url: `https://www.courtlistener.com${r.absolute_url || ''}`, venue: r.court_citation_string || r.court,
      ids: { clusterId: cluster }, peerReviewed: false,
      court: { id: String(r.court_id), name: String(r.court || r.court_citation_string || ''), level },
      excerpt: snippet ? strip(snippet).slice(0, 400) : undefined, fetchedAt: Date.now(),
    });
    if (out.length >= max) break;
  }
  return out;
}

export const _hash = hash;
