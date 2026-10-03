/**
 * Registry of cross-curricular connections (see connectionTypes.ts). A connection is stored once but
 * shown from both ends: a physics lesson on sound lists the music-theory lesson, and the music-theory
 * lesson lists the physics one. Loaded on demand so it never weighs on first paint.
 */
import type { Connection, ConnectionKind } from './connectionTypes';

let cache: Connection[] | null = null;

export async function loadConnections(): Promise<Connection[]> {
  if (cache) return cache;
  const files = await Promise.all([
    import('./connectionsScience').then(m => m.CONNECTIONS_SCIENCE).catch(() => [] as Connection[]),
    import('./connectionsHumanities').then(m => m.CONNECTIONS_HUMANITIES).catch(() => [] as Connection[]),
    import('./connectionsLiterature').then(m => m.CONNECTIONS_LITERATURE).catch(() => [] as Connection[]),
  ]);
  // Three authors wrote these independently, so the same pair can appear twice (or once from each end).
  // Keep the first of each pair; the reader would show it once anyway.
  const seen = new Set<string>(); const out: Connection[] = [];
  const keyOf = (a: string, b: string) => [a, b].sort().join('|');
  for (const c of files.flat()) {
    const from = `${c.from.courseId}::${c.from.lessonId}`;
    const to = 'lessonId' in c.to ? `${c.to.courseId}::${c.to.lessonId}` : 'sim' in c.to ? `sim:${c.to.sim}` : `labs:${c.to.labs}`;
    const k = keyOf(from, to); if (seen.has(k)) continue; seen.add(k); out.push(c);
  }
  cache = out;
  return cache;
}

export type LinkTarget = { type: 'lesson'; courseId: string; lessonId: string } | { type: 'labs'; id: string } | { type: 'sim'; id: string };
export interface ResolvedLink { kind: ConnectionKind; why: string; target: LinkTarget }

/** Every link that touches this lesson, from either direction, de-duplicated. */
export async function linksFor(courseId: string, lessonId: string): Promise<ResolvedLink[]> {
  const all = await loadConnections(); const out: ResolvedLink[] = []; const seen = new Set<string>();
  const add = (l: ResolvedLink) => { const k = JSON.stringify(l.target); if (!seen.has(k)) { seen.add(k); out.push(l); } };
  for (const c of all) {
    if (c.from.courseId === courseId && c.from.lessonId === lessonId) {
      const t = c.to;
      add({ kind: c.kind, why: c.why, target: 'lessonId' in t ? { type: 'lesson', courseId: t.courseId, lessonId: t.lessonId } : 'labs' in t ? { type: 'labs', id: t.labs } : { type: 'sim', id: t.sim } });
    } else if ('lessonId' in c.to && c.to.courseId === courseId && c.to.lessonId === lessonId) {
      add({ kind: c.kind, why: c.why, target: { type: 'lesson', courseId: c.from.courseId, lessonId: c.from.lessonId } });
    }
  }
  return out;
}

/** Which Labs discipline hosts a simulator (used to open the right studio). */
export const SIM_DISCIPLINE: Record<string, string> = {
  projectile: 'physics', pendulum: 'physics', wave: 'physics', 'ideal-gas': 'chemistry', 'ph-titration': 'chemistry',
  population: 'biology', 'hardy-weinberg': 'biology', sir: 'biology', 'function-plotter': 'mathematics', 'prime-sieve': 'mathematics',
  sorting: 'cs', 'big-o': 'cs', orbit: 'astronomy', neuron: 'neuroscience', beam: 'engineering',
};

export const KIND_LABEL: Record<ConnectionKind, string> = {
  'science-behind': 'The science behind it', 'math-behind': 'The math behind it', 'history-of': 'The history', 'art-of': 'The art', application: 'Where it is used', 'same-idea': 'The same idea',
};
