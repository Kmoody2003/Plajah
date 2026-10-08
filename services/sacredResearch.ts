import type { FaithId } from '../data/sacredLibrary/readerCatalog';
import { loadNotebook, notebookKey, readCachedNotebook, saveEntry, removeEntry, putEntry, type SyncableEntry } from './notebookService';
export interface ResearchSource {
  id: string; faith: FaithId; kind: 'passage' | 'artifact'; title: string; locator: string;
  edition: string; text: string; sourceUrl: string; rights?: string; original?: string;
}
export type ResearchRelation = 'shared wording' | 'ethical analogy' | 'contrasting teaching' | 'shared narrative' | 'historical context' | 'possible influence';
export interface ResearchComparison {
  id: string; left: string; right: string; relation: ResearchRelation;
  similarities: string; differences: string; context: string; status: 'personal interpretation';
}
export interface ResearchNotebook { schema: 'plajah-sacred-research-v1'; sources: ResearchSource[]; comparisons: ResearchComparison[]; }
/** The device-only store this notebook used before it joined the shared notebook. Read once, for import. */
const KEY = 'plajah_sacred_research_v1';
/** Bucket in the shared notebook (services/notebookService → users/{uid}/notebook). */
const BUCKET = 'sacredResearch';
export const RESEARCH_CHANGED = 'PLAJAH_SACRED_RESEARCH_CHANGED';
export function researchSourceId(faith: string, work: string, locator: string, edition: string): string {
  let hash = 2166136261;
  for (const char of `${locator}\n${edition}`) { hash ^= char.codePointAt(0)!; hash = Math.imul(hash, 16777619); }
  return `${faith}/${work}/${(hash >>> 0).toString(16)}`;
}
export const RELATIONS: ResearchRelation[] = ['shared wording', 'ethical analogy', 'contrasting teaching', 'shared narrative', 'historical context', 'possible influence'];
export const safeSourceUrl = (value: string) => {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; } catch { return ''; }
};
const faiths = ['christianity', 'buddhism', 'islam', 'judaism', 'hinduism', 'sikhism'];
export function validateNotebook(raw: any): ResearchNotebook {
  if (raw?.schema !== 'plajah-sacred-research-v1' || !Array.isArray(raw.sources) || !Array.isArray(raw.comparisons) || raw.sources.length > 500 || raw.comparisons.length > 1000) throw Error('This is not a supported research notebook.');
  const boundedString = (value: any, max: number) => typeof value === 'string' && value.length <= max;
  const sourceIds = new Set<string>();
  const sources: ResearchSource[] = raw.sources.map((s: any) => {
    if (!boundedString(s.id, 600) || !s.id || sourceIds.has(s.id) || !faiths.includes(s.faith) || !['passage','artifact'].includes(s.kind) ||
      !['title','locator','edition'].every(k => boundedString(s[k], 2000)) || !boundedString(s.text, 40000) || !boundedString(s.sourceUrl, 2000) || !safeSourceUrl(s.sourceUrl) ||
      (s.original !== undefined && !boundedString(s.original, 40000)) || (s.rights !== undefined && !boundedString(s.rights, 4000))) throw Error('A source entry is invalid or duplicated.');
    sourceIds.add(s.id);
    return { id: s.id, faith: s.faith, kind: s.kind, title: s.title, locator: s.locator, edition: s.edition, text: s.text,
      sourceUrl: safeSourceUrl(s.sourceUrl), original: s.original, rights: s.rights };
  });
  const comparisonIds = new Set<string>();
  const comparisons: ResearchComparison[] = raw.comparisons.map((c: any) => {
    if (!boundedString(c.id, 600) || !c.id || comparisonIds.has(c.id) || !sourceIds.has(c.left) || !sourceIds.has(c.right) || c.left === c.right || !RELATIONS.includes(c.relation) || c.status !== 'personal interpretation' ||
      !['similarities','differences','context'].every(k => boundedString(c[k], 40000))) throw Error('A comparison has invalid or missing evidence.');
    comparisonIds.add(c.id);
    return { id: c.id, left: c.left, right: c.right, relation: c.relation, similarities: c.similarities, differences: c.differences, context: c.context, status: c.status };
  });
  return { schema: 'plajah-sacred-research-v1', sources, comparisons };
}
export const emptyNotebook = (): ResearchNotebook => ({ schema: 'plajah-sacred-research-v1', sources: [], comparisons: [] });
// ── Storage: one entry per source / comparison in the shared notebook ─────────
// Sources and comparisons are stored as individual notebook entries, so the
// research notebook syncs across devices exactly like every other notebook and
// two devices editing different comparisons never overwrite each other.
const researchKey = () => notebookKey(BUCKET);
const SOURCE = 'RESEARCH_SOURCE', COMPARISON = 'RESEARCH_COMPARISON';
const sourceEntryId = (id: string) => `src:${id}`, comparisonEntryId = (id: string) => `cmp:${id}`;
const byCreated = (a: SyncableEntry, b: SyncableEntry) => (a.createdAt ?? 0) - (b.createdAt ?? 0);

function fromEntries(entries: SyncableEntry[]): ResearchNotebook {
  const ordered = [...entries].sort(byCreated);
  const sources = ordered.filter(e => e.type === SOURCE && e.source).map(e => e.source as ResearchSource);
  const ids = new Set(sources.map(s => s.id));
  // A comparison can arrive from another device before its sources do; hold it back until they're here.
  const comparisons = ordered.filter(e => e.type === COMPARISON && e.comparison && ids.has(e.comparison.left) && ids.has(e.comparison.right)).map(e => e.comparison as ResearchComparison);
  return { schema: 'plajah-sacred-research-v1', sources, comparisons };
}

function persist(storageKey: string, next: ResearchNotebook, cloud = true): void {
  const existing = new Map(readCachedNotebook(storageKey).filter(e => e.type === SOURCE || e.type === COMPARISON).map(e => [e.id, e]));
  const keep = new Set<string>();
  const upsert = (id: string, entry: SyncableEntry, field: 'source' | 'comparison') => {
    keep.add(id);
    const prev = existing.get(id);
    if (!prev || JSON.stringify(prev[field]) !== JSON.stringify(entry[field])) saveEntry(storageKey, entry, { cloud });
  };
  next.sources.forEach(s => upsert(sourceEntryId(s.id), { id: sourceEntryId(s.id), type: SOURCE, source: s }, 'source'));
  next.comparisons.forEach(c => upsert(comparisonEntryId(c.id), { id: comparisonEntryId(c.id), type: COMPARISON, comparison: c }, 'comparison'));
  for (const id of existing.keys()) if (!keep.has(id)) removeEntry(storageKey, id);
}

/** Bring the old device-only notebook into this account's shared notebook, once. */
function importLegacy(storageKey: string): void {
  const flag = `${storageKey}__legacyImported`;
  try {
    if (localStorage.getItem(flag)) return;
    const stored = localStorage.getItem(KEY);
    if (stored) persist(storageKey, mergeNotebooks(fromEntries(readCachedNotebook(storageKey)), validateNotebook(JSON.parse(stored))), false);
    localStorage.setItem(flag, '1');
  } catch { /* unreadable legacy data stays where it is, untouched */ }
}

/** True when the research notebook is syncing to an account (vs. guest, this device only). */
export const researchSyncsToAccount = () => !researchKey().endsWith('_guest');

export function readNotebook(): ResearchNotebook {
  const storageKey = researchKey();
  importLegacy(storageKey);
  return validateNotebook(fromEntries(readCachedNotebook(storageKey)));
}
export function writeNotebook(value: ResearchNotebook): void {
  const storageKey = researchKey();
  importLegacy(storageKey);
  persist(storageKey, validateNotebook(value));
  window.dispatchEvent(new Event(RESEARCH_CHANGED));
}
/** Pull the account copy into the local cache and notify readers. Safe to call often. */
export async function syncResearchNotebook(): Promise<void> {
  const storageKey = researchKey();
  importLegacy(storageKey);
  if (!researchSyncsToAccount()) return;
  const merged = await loadNotebook(storageKey);
  const pushFlag = `${storageKey}__legacyPushed`;
  if (!localStorage.getItem(pushFlag)) {
    await Promise.all(merged.filter(e => e.type === SOURCE || e.type === COMPARISON).map(e => putEntry(storageKey, e)));
    try { localStorage.setItem(pushFlag, '1'); } catch { /* */ }
  }
  window.dispatchEvent(new Event(RESEARCH_CHANGED));
}
export function pinResearchSource(source: ResearchSource): void {
  const notebook = readNotebook();
  writeNotebook({ ...notebook, sources: [...notebook.sources.filter(s => s.id !== source.id), source] });
}
export function mergeNotebooks(current: ResearchNotebook, incoming: ResearchNotebook): ResearchNotebook {
  const merged = { schema: current.schema, sources: [...current.sources, ...incoming.sources.filter(s => !current.sources.some(old => old.id === s.id))],
    comparisons: [...current.comparisons, ...incoming.comparisons.filter(c => !current.comparisons.some(old => old.id === c.id))] };
  return validateNotebook(merged);
}
export function researchMarkdown(notebook: ResearchNotebook): string {
  const sources = notebook.sources.map(s => `## ${s.title}\n${s.locator} · ${s.faith}\nEdition: ${s.edition}\nSource: ${s.sourceUrl}\n${s.rights ? `Rights: ${s.rights}\n` : ''}\n${s.text}\n${s.original ? `\nOriginal:\n${s.original}\n` : ''}`).join('\n');
  const comparisons = notebook.comparisons.map(c => {
    const left = notebook.sources.find(s => s.id === c.left)!, right = notebook.sources.find(s => s.id === c.right)!;
    return `## ${left.locator} ↔ ${right.locator}\nRelation: ${c.relation}\nStatus: ${c.status}\n\nSimilarities:\n${c.similarities}\n\nDifferences:\n${c.differences}\n\nContext and limits:\n${c.context}\n`;
  }).join('\n');
  return `# Sacred Library research notebook\n\n${sources}\n# Comparisons\n\n${comparisons}`;
}
export function downloadResearchFile(name: string, text: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
