// careerImport/scan — turn what a creator pasted into a staged catalogue.
//
// The entry point for Phase 0. Takes a list of free-form inputs (profile links, feed URLs, or
// just a name), works out what each one is, runs the matching open-lane resolver, and returns
// draft items for review. Nothing is written to the platform here — commit is a later phase.

import type { ResolvedInput, ScanResult, SourceResult, StagedItem } from './types';
import { fromAudius, fromMusicBrainz, fromOpenLibrary, fromPodcastRss } from './sources';

/**
 * Work out what a pasted string is. Deliberately conservative: a URL we do not recognise returns
 * sourceId null rather than being guessed at, because silently resolving someone's Bandcamp link
 * as a MusicBrainz name search produces confident nonsense.
 */
export function resolveInput(raw: string): ResolvedInput {
  const s = raw.trim();
  if (!s) return { sourceId: null, value: '', label: 'Empty' };

  if (/audius\.co\//i.test(s) || /^@[\w.-]+$/.test(s)) {
    return { sourceId: 'audius', value: s, label: 'Audius profile' };
  }
  // Feed-ish URL: an explicit XML/RSS path, or a host that advertises a feed in the path.
  if (/^https?:\/\//i.test(s) && /(\.xml|\/rss|\/feed|feeds?\.|format=rss)/i.test(s)) {
    return { sourceId: 'podcast', value: s, label: 'Podcast feed' };
  }
  if (/^https?:\/\//i.test(s)) {
    // A real URL we have no open-lane resolver for. P2's ownership gate is where these belong.
    return { sourceId: null, value: s, label: 'Link (not yet supported)' };
  }
  // Bare text is a name. Which kind is ambiguous, so scan() runs both name-based sources and
  // lets confidence + review sort it out rather than forcing a choice here.
  return { sourceId: null, value: s, label: 'Name' };
}

export interface ScanOptions {
  /** Profile links, feed URLs, or names. */
  inputs: string[];
  /** Run the name-based discography/bibliography lookups for bare-text inputs. */
  includeNameSearch?: boolean;
  onProgress?: (msg: string) => void;
}

/**
 * Run every applicable open-lane source. Sources run CONCURRENTLY and each is independently
 * fault-tolerant, so one dead API degrades a scan rather than failing it — the creator still
 * sees whatever the other four found.
 */
export async function scan(opts: ScanOptions): Promise<ScanResult> {
  const log = (m: string) => opts.onProgress?.(m);
  const jobs: Promise<SourceResult>[] = [];

  const names: string[] = [];
  for (const raw of opts.inputs) {
    const r = resolveInput(raw);
    if (r.sourceId === 'audius') { log(`Reading Audius profile…`); jobs.push(fromAudius(r.value)); }
    else if (r.sourceId === 'podcast') { log(`Reading podcast feed…`); jobs.push(fromPodcastRss(r.value)); }
    else if (r.label === 'Name') names.push(r.value);
  }

  // A bare name could be a musician or an author, and frequently is both. Run both and let the
  // review queue decide — that is cheaper than making the creator categorise themselves first.
  if (opts.includeNameSearch !== false) {
    for (const n of names) {
      log(`Searching open catalogues for “${n}”…`);
      jobs.push(fromMusicBrainz(n), fromOpenLibrary(n));
    }
  }

  const results = await Promise.all(jobs);
  const items = dedupe(results.flatMap(r => r.items));
  log(`Found ${items.length} item${items.length === 1 ? '' : 's'}.`);

  return { results, items, scannedAt: Date.now() };
}

/**
 * Collapse the same work appearing from more than one source — a release listed on both Audius
 * and MusicBrainz is one release. Matching is on normalised title plus release year, which is
 * imperfect but errs toward keeping duplicates: two rows a human merges is a smaller failure
 * than one row that silently swallowed a genuinely different work.
 *
 * The surviving copy is the one with the richer lane, then the higher confidence, so an OPEN
 * item carrying real media always beats a metadata-only twin.
 */
function dedupe(items: StagedItem[]): StagedItem[] {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const best = new Map<string, StagedItem>();

  for (const it of items) {
    const year = it.releasedAt ? new Date(it.releasedAt).getUTCFullYear() : '';
    const key = `${it.kind}|${norm(it.title)}|${year}`;
    const prev = best.get(key);
    if (!prev) { best.set(key, it); continue; }
    const rank = (x: StagedItem) => (x.lane === 'OPEN' ? 1 : 0) * 10 + x.confidence;
    const winner = rank(it) > rank(prev) ? it : prev;
    const loser = winner === it ? prev : it;
    // Keep the fact that two sources agreed — corroboration is worth showing in review.
    winner.meta = { ...(winner.meta || {}), alsoSeenIn: [...(winner.meta?.alsoSeenIn || []), loser.sourceId] };
    best.set(key, winner);
  }
  // Least confident first: review exists for the uncertain rows, not the obvious ones.
  return [...best.values()].sort((a, b) => a.confidence - b.confidence);
}
