/**
 * Data Commons — data.gov catalog search.
 *
 * catalog.data.gov moved off the old CKAN `/api/3/action/*` endpoints; the live
 * search is `GET /search?q=&per_page=&after=` (cursor paging via `after`).
 * Records are DCAT. The catalog tells you WHAT exists and where it lives — the
 * rows themselves are fetched from the publishing agency.
 */

import { cached, fetchJson, prov, cleanText, type Provenance } from './core';

const BASE = 'https://catalog.data.gov';

export interface DatasetDistribution { format: string; title?: string; url: string }

export interface DatasetSummary {
  id: string;
  title: string;
  description: string;
  publisher: string;
  /** ISO date the publisher last modified it — the vintage the UI must show. */
  modified?: string;
  keywords: string[];
  hasSpatial: boolean;
  landingPage: string;
  distributions: DatasetDistribution[];
}

export interface CatalogPage {
  query: string;
  datasets: DatasetSummary[];
  /** Pass back as `after` for the next page. */
  next?: string;
  source: Provenance;
}

export function normalizeDataset(r: any): DatasetSummary | null {
  if (!r || typeof r !== 'object' || !r.title) return null;
  const dcat = r.dcat || {};
  const dists: DatasetDistribution[] = (Array.isArray(dcat.distribution) ? dcat.distribution : [])
    .map((d: any) => ({
      format: String(d?.format || d?.mediaType || '').replace(/^.*\//, '').toUpperCase() || 'LINK',
      title: d?.title ? cleanText(d.title, 80) : undefined,
      url: String(d?.downloadURL || d?.accessURL || ''),
    }))
    .filter((d: DatasetDistribution) => /^https?:\/\//.test(d.url))
    .slice(0, 6);
  return {
    id: String(r.identifier || r.slug || r.title),
    title: cleanText(r.title, 160),
    description: cleanText(r.description || dcat.description, 400),
    publisher: cleanText(r.organization?.name || r.publisher || dcat.publisher?.name, 120),
    modified: typeof dcat.modified === 'string' ? dcat.modified.slice(0, 10) : undefined,
    keywords: (Array.isArray(r.keyword) ? r.keyword : []).map((k: unknown) => cleanText(k, 40)).filter(Boolean).slice(0, 8),
    hasSpatial: !!r.has_spatial,
    landingPage: r.slug ? `${BASE}/dataset/${encodeURIComponent(r.slug)}` : BASE,
    distributions: dists,
  };
}

export async function searchCatalog(
  q: string,
  opts: { limit?: number; after?: string } = {},
): Promise<CatalogPage> {
  const query = q.trim().slice(0, 200);
  const limit = Math.min(30, Math.max(1, opts.limit ?? 12));
  const params = new URLSearchParams({ q: query, per_page: String(limit) });
  if (opts.after) params.set('after', opts.after.slice(0, 400));
  const url = `${BASE}/search?${params}`;
  const json = await cached(`cat:${url}`, 10 * 60_000, () => fetchJson<any>(url, { timeoutMs: 20_000 }));
  const datasets = (Array.isArray(json?.results) ? json.results : [])
    .map(normalizeDataset).filter((d: DatasetSummary | null): d is DatasetSummary => !!d);
  return {
    query,
    datasets,
    next: typeof json?.after === 'string' && datasets.length >= limit ? json.after : undefined,
    source: prov('GSA / data.gov', 'Data.gov catalog', `${BASE}/search?q=${encodeURIComponent(query)}`),
  };
}
