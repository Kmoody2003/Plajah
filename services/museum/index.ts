/**
 * Plajah Museum layer — one entry point over every museum/archive source.
 *
 * Runs in Node and the browser. In Node the keyed sources (Smithsonian, Europeana) resolve their
 * keys from SMITHSONIAN_API_KEY / EUROPEANA_API_KEY; in the browser they go through /api/museum.
 * Councils, Aria and Academia all read museums through here so they see the same objects.
 */
import { searchArtifacts, fetchArtifacts3D, type Artifact, type ArtifactSource } from '../artifactsService';
import type { MuseumRegion } from './regions';
import { isEducationSafeArtwork } from '../artMuseumService';

export type MuseumObject = Artifact;
export type MuseumSource = ArtifactSource;

export const ALL_MUSEUM_SOURCES: MuseumSource[] = ['met', 'artic', 'cleveland', 'smithsonian', 'europeana', 'commons', 'loc', 'harvard', 'rijks', 'nga', 'dpla', 'wellcome', 'jps', 'npm'];

export interface MuseumSearchOpts {
  limit?: number;
  sources?: MuseumSource[];
  /** Fail-closed filter for K-12 surfaces (non-human subjects only). */
  educationSafe?: boolean;
  /** World-region lens: narrows department-filterable collections and steers free-text ones. */
  region?: MuseumRegion;
  signal?: AbortSignal;
}

export async function searchMuseums(query: string, opts: MuseumSearchOpts = {}): Promise<MuseumObject[]> {
  const limit = opts.limit ?? 12;
  const found = await searchArtifacts(query, {
    limit: opts.educationSafe ? limit * 3 : limit,
    sources: opts.sources ?? (opts.region ? undefined : ALL_MUSEUM_SOURCES),
    region: opts.region,
    signal: opts.signal,
  });
  const kept = opts.educationSafe
    ? found.filter(a => isEducationSafeArtwork({ title: a.title, medium: a.medium, contentTags: [a.culture] }))
    : found;
  return kept.slice(0, limit);
}

export { fetchArtifacts3D as searchMuseums3D };

export const SOURCE_LABEL: Record<MuseumSource, string> = {
  met: 'The Metropolitan Museum of Art', artic: 'Art Institute of Chicago', cleveland: 'Cleveland Museum of Art',
  opencontext: 'Open Context', smithsonian: 'Smithsonian Institution', europeana: 'Europeana',
  commons: 'Wikimedia Commons', loc: 'Library of Congress', harvard: 'Harvard Art Museums',
  rijks: 'Rijksmuseum', nga: 'National Gallery of Art', dpla: 'Digital Public Library of America', wellcome: 'Wellcome Collection', jps: 'Japan Search', npm: 'National Palace Museum, Taipei',
};

/**
 * A grounded text block for council/LLM prompts: real collection objects the model may cite
 * (title, maker, date, medium, institution, link). Returns '' when nothing was found, so callers
 * can append it unconditionally. Never throws.
 */
export async function museumContextBlock(queries: string[], opts: { perQuery?: number; sources?: MuseumSource[] } = {}): Promise<string> {
  const per = opts.perQuery ?? 4;
  const uniq = Array.from(new Set(queries.map(q => q.trim()).filter(Boolean))).slice(0, 4);
  const lists = await Promise.all(uniq.map(q => searchMuseums(q, { limit: per, sources: opts.sources }).catch(() => [])));
  const lines: string[] = [];
  const seen = new Set<string>();
  lists.forEach((objs, i) => {
    for (const o of objs) {
      if (seen.has(o.id)) continue;
      seen.add(o.id);
      lines.push(`- "${o.title}" — ${o.culture || 'unknown maker'}${o.date ? `, ${o.date}` : ''}${o.medium ? `; ${o.medium}` : ''} [${SOURCE_LABEL[o.source] ?? o.source}] ${o.sourceUrl}  (found via "${uniq[i]}")`);
    }
  });
  if (!lines.length) return '';
  return `REAL MUSEUM OBJECTS (live open-access collections; cite only these, do not invent catalogue details):\n${lines.join('\n')}`;
}

export { REGIONS, type MuseumRegion } from './regions';
