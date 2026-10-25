/**
 * Curriculum-to-collection mapping: resolves a unit's StudyRef into real museum objects through
 * the shared museum layer (services/museum), honouring the Art College audience gate.
 *
 *   adult  : unfiltered (college tier; figure refs allowed)
 *   minor  : figure refs are never fetched; everything else passes isEducationSafeArtwork
 *            (fail-closed: an empty result is correct, not an error)
 */
import { searchMuseums, searchMuseums3D, type MuseumObject, type MuseumSource } from '../museum';
import type { ArtAudience } from './audience';

export interface StudyQuery {
  query: string;
  sources?: string[];
  why?: string;
  figure?: boolean;
  threeD?: boolean;
}

export interface StudyResult {
  objects: MuseumObject[];
  /** True when the ref was withheld for this audience (figure study for a minor/unknown age). */
  withheld: boolean;
}

const cache = new Map<string, Promise<StudyResult>>();

// The Met answers per-object detail calls with CORS-less 403s when hammered, and a catalog page can
// mount a dozen refs at once: run at most 2 museum searches at a time and keep results for a day.
let running = 0;
const waiting: Array<() => void> = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= 2) await new Promise<void>(r => waiting.push(r));
  running++;
  try { return await fn(); } finally { running--; waiting.shift()?.(); }
}
const TTL = 24 * 3600 * 1000;
const lsGet = (k: string): MuseumObject[] | null => {
  try { const v = JSON.parse(localStorage.getItem('acStudy:' + k) || 'null'); return v && Date.now() - v.at < TTL ? v.objects : null; } catch { return null; }
};
const lsPut = (k: string, objects: MuseumObject[]) => { try { localStorage.setItem('acStudy:' + k, JSON.stringify({ at: Date.now(), objects })); } catch { /* quota */ } };

export function resolveStudy(ref: StudyQuery, audience: ArtAudience, limit = 6): Promise<StudyResult> {
  if (ref.figure && audience !== 'adult') return Promise.resolve({ objects: [], withheld: true });
  const key = [ref.query, (ref.sources ?? []).join(','), audience, ref.threeD ? '3d' : '', limit].join('|');
  const hit = cache.get(key);
  if (hit) return hit;
  const stored = lsGet(key);
  if (stored?.length) { const r = Promise.resolve({ objects: stored, withheld: false }); cache.set(key, r); return r; }
  const p = slot(async (): Promise<StudyResult> => {
    const educationSafe = audience !== 'adult';
    const sources = ref.sources as MuseumSource[] | undefined;
    const [flat, solid] = await Promise.all([
      searchMuseums(ref.query, { limit, sources, educationSafe }).catch(() => []),
      ref.threeD ? searchMuseums3D(ref.query, { limit: 3 }).catch(() => []) : Promise.resolve([] as MuseumObject[]),
    ]);
    const seen = new Set<string>();
    const objects = [...solid, ...flat].filter(o => (seen.has(o.id) ? false : (seen.add(o.id), true))).slice(0, limit);
    if (objects.length) lsPut(key, objects);
    return { objects, withheld: false };
  });
  // Do not cache empty results forever (network blips, key not yet set).
  p.then(r => { if (!r.objects.length) cache.delete(key); }).catch(() => cache.delete(key));
  cache.set(key, p);
  return p;
}

export function clearStudyCache() { cache.clear(); }
