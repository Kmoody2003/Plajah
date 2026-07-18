// learnChips.ts — Part 6, Thread 4: the universal "go deeper" affordance.
//
// Any piece of content (a Reello video, a Chora track, a photo, a post) can be matched to a
// place to LEARN about it. Education is Plajah's cross-platform moat; this makes it a discovery
// surface instead of a silo — a video tagged "astronomy" gets a chip into the Astronomy studio.

import { SCIENCE_DISCIPLINES } from '../data/scienceDisciplines';

export interface LearnTarget {
  kind: 'discipline';
  id: string;        // LabsDisciplineId
  label: string;
  accent: string;
}

/** The three bespoke studios aren't in SCIENCE_DISCIPLINES but are just as linkable. */
const BESPOKE: LearnTarget[] = [
  { kind: 'discipline', id: 'history', label: 'World History', accent: '#E8590C' },
  { kind: 'discipline', id: 'architecture', label: 'Architecture', accent: '#B08968' },
  { kind: 'discipline', id: 'archaeology', label: 'Archaeology', accent: '#D4A017' },
];

function allTargets(): LearnTarget[] {
  const sci = Object.values(SCIENCE_DISCIPLINES).map(d => ({
    kind: 'discipline' as const, id: d.id, label: d.label, accent: d.accent,
  }));
  return [...sci, ...BESPOKE];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');

/**
 * Find the best learning destination for a piece of content.
 * Exact tag → discipline id wins; otherwise we look for the discipline label or a concept tag
 * in the content's tags/title/text. Returns null when nothing matches (show no chip).
 */
export function findLearnTarget(tags: string[] = [], text = ''): LearnTarget | null {
  const targets = allTargets();
  const lowerTags = tags.map(t => t.toLowerCase().trim());

  // 1. A tag that IS a discipline id.
  const direct = targets.find(t => lowerTags.includes(t.id));
  if (direct) return direct;

  // 2. A tag that matches a discipline label (e.g. 'computer science').
  const byLabel = targets.find(t => lowerTags.includes(t.label.toLowerCase()));
  if (byLabel) return byLabel;

  // 3. Keyword presence in tags + text (concept tags give each discipline its vocabulary).
  const haystack = norm(`${lowerTags.join(' ')} ${text}`);
  if (!haystack.trim()) return null;
  let best: { target: LearnTarget; score: number } | null = null;
  for (const d of Object.values(SCIENCE_DISCIPLINES)) {
    const vocab = new Set<string>([
      ...norm(d.label).split(/\s+/),
      ...d.concepts.flatMap(c => [...norm(c.name).split(/\s+/), ...(c.tags || []).map(t => t.toLowerCase())]),
    ].filter(w => w.length > 4));
    let score = 0;
    vocab.forEach(w => { if (haystack.includes(w)) score++; });
    if (score > 0 && (!best || score > best.score)) {
      best = { target: { kind: 'discipline', id: d.id, label: d.label, accent: d.accent }, score };
    }
  }
  return best && best.score >= 2 ? best.target : null;
}

/** Open a learn target (deep-links into Plajah Labs / Academia). */
export function openLearnTarget(target: LearnTarget): void {
  window.dispatchEvent(new CustomEvent('OPEN_LABS_DISCIPLINE', { detail: { disciplineId: target.id } }));
}
