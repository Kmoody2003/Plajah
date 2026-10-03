/**
 * PubMed (NCBI E-utilities) adapter. Free, no key needed (3 requests/s; set NCBI_API_KEY for 10/s).
 * We only pull the study types that can change what a textbook says: systematic reviews,
 * meta-analyses, randomised trials and practice guidelines, plus retraction flags. Single
 * observational papers and case reports are deliberately left out.
 */
import type { AnchorKind } from '../schoolChassis';
import type { EvidenceTier, ItemKind, KnowledgeItem } from './types';
import { hash, isoDay, politeFetch } from './http';

const BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const gap = () => (typeof process !== 'undefined' && process.env?.NCBI_API_KEY ? 120 : 400);
// NCBI redirects custom bot User-Agents to its abuse page; it asks callers to identify with tool/email params instead.
const keyParam = () => {
  const e = typeof process !== 'undefined' ? process.env : ({} as Record<string, string | undefined>);
  return `&tool=plajah-academia${e.NCBI_EMAIL ? `&email=${encodeURIComponent(e.NCBI_EMAIL)}` : ''}${e.NCBI_API_KEY ? `&api_key=${e.NCBI_API_KEY}` : ''}`;
};
const HDR = { 'User-Agent': 'plajah-academia/1.0' };

const HIGH_PT = '(meta-analysis[pt] OR systematic review[pt] OR randomized controlled trial[pt] OR practice guideline[pt] OR guideline[pt])';
const RETRACT_PT = '(retracted publication[pt] OR retraction of publication[pt])';
const clean = (s: string) => s.replace(/["\[\]]/g, ' ').replace(/\s+/g, ' ').trim();

/** The PubMed query that watches one medical anchor, or null when PubMed is the wrong source for it. */
export function queryFor(kind: AnchorKind, ref: string): string | null {
  const r = clean(ref); if (!r) return null;
  switch (kind) {
    case 'mesh': return `"${r}"[MeSH Major Topic] AND ${HIGH_PT} AND hasabstract AND english[lang]`;
    case 'drug': return `"${r}"[Title] AND (${HIGH_PT} OR ${RETRACT_PT}) AND hasabstract AND english[lang]`;
    case 'trial': return `"${r}"[Title/Abstract] AND (${HIGH_PT} OR ${RETRACT_PT}) AND english[lang]`;
    case 'guideline': {
      // "Body, Topic, Year": watch for newer guidelines on the topic.
      const parts = ref.split(',').map(clean); const topic = parts.length >= 2 ? parts[1] : parts[0];
      return topic ? `"${topic}"[Title] AND (practice guideline[pt] OR guideline[pt]) AND english[lang]` : null;
    }
    default: return null;
  }
}

export function classify(pubtypes: string[]): { kind: ItemKind; tier: EvidenceTier; peerReviewed: boolean; retracted: boolean } {
  const has = (t: string) => pubtypes.some(p => p.toLowerCase() === t);
  if (has('retracted publication')) return { kind: 'retraction', tier: 'other', peerReviewed: true, retracted: true };
  if (has('preprint')) return { kind: 'preprint', tier: 'other', peerReviewed: false, retracted: false };
  if (has('meta-analysis')) return { kind: 'meta-analysis', tier: 'synthesis', peerReviewed: true, retracted: false };
  if (has('systematic review')) return { kind: 'systematic-review', tier: 'synthesis', peerReviewed: true, retracted: false };
  if (has('practice guideline') || has('guideline')) return { kind: 'guideline', tier: 'guideline', peerReviewed: true, retracted: false };
  if (has('randomized controlled trial') || has('clinical trial')) return { kind: 'trial', tier: 'trial', peerReviewed: true, retracted: false };
  return { kind: 'news', tier: 'other', peerReviewed: true, retracted: false };
}

const normDate = (s?: string): string => {
  const m = (s || '').match(/(\d{4})[\/\- ]?(\d{2})?[\/\- ]?(\d{2})?/); if (!m) return isoDay(new Date());
  const d = `${m[1]}-${m[2] || '01'}-${m[3] || '01'}`;
  // Journals date issues ahead of release (a "December" issue in October); never show a future date.
  const today = isoDay(new Date()); return d > today ? today : d;
};

export async function searchPubmed(term: string, since: Date, max = 8): Promise<KnowledgeItem[]> {
  const today = new Date();
  const es = await politeFetch(`${BASE}/esearch.fcgi?db=pubmed&retmode=json&retmax=${max}&sort=pub_date&datetype=edat&mindate=${isoDay(since).replace(/-/g, '/')}&maxdate=${isoDay(today).replace(/-/g, '/')}&term=${encodeURIComponent(term)}${keyParam()}`, { host: 'pubmed', minGapMs: gap(), headers: HDR });
  if (!es.ok) throw new Error(`pubmed esearch ${es.status}`);
  const ids: string[] = (await es.json())?.esearchresult?.idlist || [];
  if (!ids.length) return [];
  const sm = await politeFetch(`${BASE}/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(',')}${keyParam()}`, { host: 'pubmed', minGapMs: gap(), headers: HDR });
  if (!sm.ok) throw new Error(`pubmed esummary ${sm.status}`);
  const result = (await sm.json())?.result || {};
  const out: KnowledgeItem[] = [];
  for (const id of ids) {
    const r = result[id]; if (!r?.title) continue;
    const c = classify(r.pubtype || []);
    const doi = (r.articleids || []).find((a: any) => a.idtype === 'doi')?.value as string | undefined;
    out.push({
      id: `pm_${id}`, domain: 'medicine', source: 'pubmed', kind: c.kind, tier: c.tier, peerReviewed: c.peerReviewed,
      title: String(r.title).replace(/\.$/, ''), date: normDate(r.sortpubdate || r.pubdate), url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
      venue: r.source, ids: { pmid: id, doi }, fetchedAt: Date.now(),
    });
  }
  return out;
}

export const _hash = hash;
