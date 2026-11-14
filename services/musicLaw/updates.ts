/**
 * Music law "Latest" feed — ongoing cases and rule changes from free public sources, each item
 * labelled with where it came from. Server-side (routes/musicLaw.ts) so the browser never hits the
 * upstreams directly and results are cached.
 *
 * Sources (verified reachable without a key on 2026-10-29):
 *  - CourtListener (Free Law Project) search feeds, Atom. RECAP dockets (type=r) cover new and active
 *    federal suits; opinions (type=o) cover decisions. The REST API now needs a token, the feeds do not.
 *  - Federal Register API, filtered by agency: the U.S. Copyright Office and the Copyright Royalty Board.
 *
 * Items carry the source's own title, court/agency, date and link — never a machine-written summary.
 * A docket appearing here means a suit was filed or had activity, not that anyone did anything wrong.
 */
import { politeFetch } from '../livingKnowledge/http';
import { WATCH, type WatchQuery } from '../../data/musicLaw/library';

export type UpdateSource = 'CourtListener · RECAP docket' | 'CourtListener · opinion' | 'Federal Register';
export interface LawUpdate {
  id: string;
  watch: string;
  source: UpdateSource;
  title: string;
  /** Court or agency, as the source names it. */
  venue: string;
  /** yyyy-mm-dd */
  date: string;
  url: string;
  /** Federal Register document type (Rule, Proposed Rule, Notice) or 'Docket' / 'Opinion'. */
  kind: string;
}
export interface UpdatesResult {
  items: LawUpdate[];
  /** Per-watch status, so the UI can say which source failed instead of silently showing less. */
  status: { watch: string; label: string; ok: boolean; count: number; error?: string }[];
  fetchedAt: number;
}

const CL_FEED = 'https://www.courtlistener.com/feed/search/';
const FR_API = 'https://www.federalregister.gov/api/v1/documents.json';

const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
const tag = (b: string, name: string) => { const m = b.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i')); return m ? decode(m[1].trim()) : ''; };

/** Parse a CourtListener Atom search feed. Exported for tests. */
export function parseCourtListenerAtom(xml: string, w: WatchQuery): LawUpdate[] {
  const out: LawUpdate[] = [];
  for (const m of xml.matchAll(/<entry>[\s\S]*?<\/entry>/gi)) {
    const b = m[0];
    const title = tag(b, 'title'); const url = (b.match(/<link href="([^"]+)"/) || [])[1] || '';
    if (!title || !/^https:\/\/www\.courtlistener\.com\//.test(url)) continue;
    const docket = w.source === 'courtlistener-recap';
    out.push({
      id: `${w.id}:${(url.match(/\/(?:docket|opinion)\/(\d+)/) || [, url])[1]}`, watch: w.id,
      source: docket ? 'CourtListener · RECAP docket' : 'CourtListener · opinion',
      title, venue: tag(b, 'name'), date: tag(b, 'published').slice(0, 10), url,
      kind: docket ? 'Docket' : 'Opinion',
    });
  }
  // A docket shows up once per new filing; keep the newest entry per docket.
  const seen = new Set<string>();
  return out.filter(u => !seen.has(u.id) && (seen.add(u.id), true));
}

async function fetchWatch(w: WatchQuery, max: number): Promise<LawUpdate[]> {
  if (w.source === 'federal-register') {
    const p = new URLSearchParams({ per_page: String(max), order: 'newest' });
    p.append('conditions[agencies][]', w.agency!);
    for (const f of ['title', 'publication_date', 'type', 'html_url', 'document_number']) p.append('fields[]', f);
    const res = await politeFetch(`${FR_API}?${p}`, { host: 'federalregister', minGapMs: 500, timeoutMs: 15000 });
    if (!res.ok) throw new Error(`Federal Register ${res.status}`);
    const rows: any[] = (await res.json())?.results || [];
    return rows.filter(r => r.title && r.html_url).map(r => ({
      id: `${w.id}:${r.document_number}`, watch: w.id, source: 'Federal Register' as const, title: String(r.title),
      venue: w.agency === 'copyright-royalty-board' ? 'Copyright Royalty Board' : 'U.S. Copyright Office',
      date: String(r.publication_date || ''), url: String(r.html_url), kind: String(r.type || 'Document'),
    }));
  }
  const p = new URLSearchParams({ q: w.q!, type: w.source === 'courtlistener-recap' ? 'r' : 'o', order_by: 'dateFiled desc' });
  const res = await politeFetch(`${CL_FEED}?${p}`, { host: 'courtlistener-feed', minGapMs: 1500, timeoutMs: 20000, headers: { Accept: 'application/atom+xml, application/xml' } });
  if (!res.ok) throw new Error(`CourtListener ${res.status}`);
  const xml = await res.text();
  if (!/<feed[\s>]/.test(xml)) throw new Error('CourtListener returned a page instead of a feed');
  return parseCourtListenerAtom(xml, w).slice(0, max);
}

let cache: { at: number; result: UpdatesResult } | null = null;
const TTL = 60 * 60 * 1000;

/** All watches, newest first. Cached for an hour; a failed source is reported, not hidden. */
export async function fetchMusicLawUpdates(opts: { max?: number; fresh?: boolean } = {}): Promise<UpdatesResult> {
  if (!opts.fresh && cache && Date.now() - cache.at < TTL) return cache.result;
  const max = Math.min(Math.max(opts.max ?? 12, 1), 30);
  const settled = await Promise.allSettled(WATCH.map(w => fetchWatch(w, max)));
  const items: LawUpdate[] = []; const status: UpdatesResult['status'] = [];
  settled.forEach((s, i) => {
    const w = WATCH[i];
    if (s.status === 'fulfilled') { items.push(...s.value); status.push({ watch: w.id, label: w.label, ok: true, count: s.value.length }); }
    else status.push({ watch: w.id, label: w.label, ok: false, count: 0, error: String((s.reason as any)?.message || s.reason).slice(0, 160) });
  });
  items.sort((a, b) => b.date.localeCompare(a.date));
  const result = { items, status, fetchedAt: Date.now() };
  if (status.some(s => s.ok)) cache = { at: Date.now(), result };
  return result;
}
