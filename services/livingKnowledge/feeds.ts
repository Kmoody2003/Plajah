/**
 * Official newsroom feeds. Verified reachable on 2026-10-01. Feeds for the ICJ and the U.S.
 * Supreme Court's own site returned 404, so they are NOT listed (the Supreme Court is covered
 * through CourtListener). Add a feed here only after confirming it returns 200 XML; run
 * `npx tsx scripts/ingestKnowledge.ts --check-feeds` to re-verify.
 */
import type { Domain, KnowledgeItem } from './types';
import { hash, isoDay, politeFetch } from './http';

export interface FeedDef { id: string; domain: Domain; url: string; label: string; kind: KnowledgeItem['kind']; tier: KnowledgeItem['tier'] }

export const FEEDS: FeedDef[] = [
  { id: 'fda-medwatch', domain: 'medicine', url: 'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/medwatch/rss.xml', label: 'FDA MedWatch safety alerts', kind: 'safety-alert', tier: 'regulatory' },
  { id: 'cdc-mmwr', domain: 'medicine', url: 'https://tools.cdc.gov/api/v2/resources/media/342778.rss', label: 'CDC MMWR', kind: 'news', tier: 'regulatory' },
  { id: 'who-news', domain: 'medicine', url: 'https://www.who.int/rss-feeds/news-english.xml', label: 'WHO news', kind: 'news', tier: 'news' },
  { id: 'un-news-law', domain: 'law', url: 'https://news.un.org/feed/subscribe/en/news/topic/law-and-crime-prevention/feed/rss.xml', label: 'UN News: law and crime prevention', kind: 'news', tier: 'news' },
];

const unwrap = (s: string) => s.replace(/^<!\[CDATA\[|\]\]>$/g, '').trim();
const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
const tag = (block: string, name: string) => { const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i')); return m ? decode(unwrap(m[1].trim())) : ''; };
const text = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/** Minimal tolerant RSS 2.0 item parser (no DOM needed on the server). */
export function parseRss(xml: string, def: FeedDef, now = Date.now()): KnowledgeItem[] {
  const out: KnowledgeItem[] = [];
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const b = m[0]; const title = text(tag(b, 'title')); const link = tag(b, 'link') || tag(b, 'guid');
    if (!title || !/^https?:/i.test(link)) continue;
    const when = new Date(tag(b, 'pubDate') || tag(b, 'dc:date') || now); const date = isNaN(+when) ? isoDay(new Date(now)) : isoDay(when);
    const desc = text(tag(b, 'description')).slice(0, 300);
    out.push({ id: `feed_${def.id}_${hash(link)}`, domain: def.domain, source: 'feed', kind: def.kind, tier: def.tier, title, date, url: link, venue: def.label, peerReviewed: false, excerpt: desc || undefined, fetchedAt: now });
  }
  return out;
}

export async function fetchFeed(def: FeedDef, max = 30): Promise<KnowledgeItem[]> {
  const res = await politeFetch(def.url, { host: new URL(def.url).host, minGapMs: 1000, headers: { Accept: 'application/rss+xml, application/xml, text/xml' } });
  if (!res.ok) throw new Error(`${def.id} ${res.status}`);
  return parseRss(await res.text(), def).slice(0, max);
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Does this feed item text mention the anchor (whole-word, case-insensitive)? Used for drug/treaty/statute anchors only. */
export const mentions = (item: KnowledgeItem, ref: string): boolean => {
  const r = ref.split('|')[0].trim(); if (r.length < 4) return false;
  return new RegExp(`(^|[^a-z0-9])${esc(r)}([^a-z0-9]|$)`, 'i').test(`${item.title} ${item.excerpt || ''}`);
};
