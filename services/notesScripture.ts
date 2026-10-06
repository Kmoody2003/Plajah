/**
 * The "Scripture & Sacred Texts" notebook in Plajah Notes. It is a read-through view of notes that
 * live in the readers' own buckets of the shared notebook:
 *
 *   verseNotes         Lectio verse notes ("45:8:28", "catholic.74:2:1")      → Verse notes
 *   sacredReaderNotes  Sacred Library passage notes ("work/title/edition/seg") → Sacred Library notes
 *   sacredResearch     research sources + comparisons                         → Research notebook
 *
 * Nothing is copied into the general notebook; pages built here carry a `reader` payload and edits
 * go back through the reader stores. This file is pure (no storage) so the mapping is unit-tested.
 */
import { parseRefId } from './scriptureRef';
import type { ResearchNotebook } from './sacredResearch';
import type { NotebookMeta, PageMeta, ReaderItem, SectionMeta, Structure } from './notesStructure';

export const SCRIPTURE_NOTEBOOK = 'nb_scripture';
export const SCRIPTURE_SECTIONS = { verses: 'sec_scripture_verses', sacred: 'sec_scripture_sacred', research: 'sec_scripture_research' } as const;
export const SCRIPTURE_NOTEBOOK_META: NotebookMeta = { id: SCRIPTURE_NOTEBOOK, title: 'Scripture & Sacred Texts', emoji: '📜', color: '#C9A227', order: 90 };

export interface ReaderNotesInput {
  verse: Record<string, string>;
  sacred: Record<string, string>;
  research?: ResearchNotebook | null;
}

const CANON_LABEL: Record<string, string> = { catholic: 'Catholic canon', orthodox: 'Orthodox canon' };

export interface VerseKey { canon: string; book: number; chapter: number; verse: number }
/** "45:8:28" → Romans 8:28; "catholic.27:3:1" → Daniel 3:1 in the Catholic canon. */
export function parseVerseKey(key: string): VerseKey | null {
  const m = /^(?:([a-z]+)\.)?(\d+):(\d+):(\d+)$/.exec(key.trim());
  if (!m) return null;
  return { canon: m[1] || '', book: +m[2], chapter: +m[3], verse: +m[4] };
}

/** "work/title/edition/segment"; titles and editions can themselves contain "/". */
export function parseSacredKey(key: string): { workId: string; title: string; edition: string; segment: string } | null {
  const parts = key.split('/');
  if (parts.length < 4) return null;
  const mid = parts.slice(1, -1);
  return { workId: parts[0], title: mid.slice(0, -1).join('/'), edition: mid[mid.length - 1], segment: parts[parts.length - 1] };
}

const page = (id: string, sectionId: string, title: string, kind: 'verse' | 'sacred' | 'research', items: ReaderItem[], order: number): PageMeta => ({
  id, notebookId: SCRIPTURE_NOTEBOOK, sectionId, title, template: 'lined', text: items.map(i => [i.label, i.text, ...(i.details || [])].join(' ')).join(' \n').slice(0, 20000),
  tags: [], pinned: false, legacy: false, createdAt: 0, updatedAt: 0, order, reader: { kind, items },
});

/** Verse notes: one page per book (per canon), notes in chapter → verse order. */
function versePages(verse: Record<string, string>): PageMeta[] {
  const groups = new Map<string, { canon: string; book: number; name: string; items: Array<ReaderItem & { c: number; v: number }> }>();
  const loose: ReaderItem[] = [];
  for (const [key, text] of Object.entries(verse)) {
    if (!text?.trim()) continue;
    const k = parseVerseKey(key);
    const ref = k ? parseRefId(`${k.book}.${k.chapter}.${k.verse}`) : null;
    if (!k || !ref) { loose.push({ key, label: key, text, editable: true }); continue; }
    const gid = `${k.canon}|${k.book}`;
    const g = groups.get(gid) || { canon: k.canon, book: k.book, name: ref.bookName, items: [] };
    g.items.push({ key, label: `${ref.bookName} ${k.chapter}:${k.verse}`, text, refId: `${k.book}.${k.chapter}.${k.verse}`, editable: true, c: k.chapter, v: k.verse });
    groups.set(gid, g);
  }
  const sorted = [...groups.values()].sort((a, b) => (a.canon === b.canon ? 0 : a.canon ? 1 : -1) || a.canon.localeCompare(b.canon) || a.book - b.book);
  const pages = sorted.map((g, i) => page(
    `reader_verse_${g.canon || 'std'}_${g.book}`, SCRIPTURE_SECTIONS.verses, g.canon ? `${g.name} (${CANON_LABEL[g.canon] || g.canon})` : g.name, 'verse',
    g.items.sort((a, b) => a.c - b.c || a.v - b.v).map(({ c: _c, v: _v, ...item }) => item), i,
  ));
  if (loose.length) pages.push(page('reader_verse_other', SCRIPTURE_SECTIONS.verses, 'Other verse notes', 'verse', loose.sort((a, b) => a.key.localeCompare(b.key)), pages.length));
  return pages;
}

/** Sacred Library notes: one page per work + edition, passages in natural segment order. */
function sacredPages(sacred: Record<string, string>): PageMeta[] {
  const groups = new Map<string, { title: string; edition: string; items: ReaderItem[] }>();
  for (const [key, text] of Object.entries(sacred)) {
    if (!text?.trim()) continue;
    const k = parseSacredKey(key);
    const gid = k ? `${k.workId}/${k.title}/${k.edition}` : '';
    const g = groups.get(gid) || { title: k?.title || 'Other passages', edition: k?.edition || '', items: [] };
    g.items.push({ key, label: k ? `${k.title} · ${k.segment}` : key, text, editable: true });
    groups.set(gid, g);
  }
  const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
  return [...groups.entries()].sort((a, b) => natural(a[1].title, b[1].title) || natural(a[1].edition, b[1].edition)).map(([gid, g], i) => page(
    `reader_sacred_${gid || 'other'}`, SCRIPTURE_SECTIONS.sacred, g.edition ? `${g.title} (${g.edition})` : g.title, 'sacred', g.items.sort((a, b) => natural(a.key, b.key)), i,
  ));
}

/** Research notebook: a page of pinned sources, then one page per comparison. Read-only here. */
function researchPages(nb: ResearchNotebook | null | undefined): PageMeta[] {
  if (!nb) return [];
  const pages: PageMeta[] = [];
  const byId = new Map(nb.sources.map(s => [s.id, s]));
  if (nb.sources.length) pages.push(page('reader_research_sources', SCRIPTURE_SECTIONS.research, 'Pinned sources', 'research', nb.sources.map(s => (
    { key: s.id, label: [s.title, s.locator].filter(Boolean).join(' · '), text: s.text, details: [s.edition && `Edition: ${s.edition}`, s.faith && `Tradition: ${s.faith}`, s.sourceUrl && `Source: ${s.sourceUrl}`].filter(Boolean) as string[], editable: false }
  )), 0));
  nb.comparisons.forEach((c, i) => {
    const l = byId.get(c.left), r = byId.get(c.right);
    const name = (s?: { title: string; locator: string }) => (s ? [s.title, s.locator].filter(Boolean).join(' ') : 'Missing source');
    const items: ReaderItem[] = [
      { key: `${c.id}:relation`, label: `${name(l)} ↔ ${name(r)}`, text: `Relation: ${c.relation} (${c.status})`, editable: false },
      ...(c.similarities ? [{ key: `${c.id}:sim`, label: 'Similarities', text: c.similarities, editable: false }] : []),
      ...(c.differences ? [{ key: `${c.id}:diff`, label: 'Differences', text: c.differences, editable: false }] : []),
      ...(c.context ? [{ key: `${c.id}:ctx`, label: 'Context', text: c.context, editable: false }] : []),
    ];
    pages.push(page(`reader_research_cmp_${c.id}`, SCRIPTURE_SECTIONS.research, `${l?.title || 'Source'} ↔ ${r?.title || 'Source'}`, 'research', items, i + 1));
  });
  return pages;
}

/** Build the Scripture & Sacred Texts notebook; sections (and the notebook) appear only with content. */
export function readerNotesStructure(input: ReaderNotesInput): Structure {
  const verses = versePages(input.verse || {}), sacred = sacredPages(input.sacred || {}), research = researchPages(input.research);
  const sections: SectionMeta[] = [];
  if (verses.length) sections.push({ id: SCRIPTURE_SECTIONS.verses, notebookId: SCRIPTURE_NOTEBOOK, title: 'Verse notes', color: '#C9A227', order: 0 });
  if (sacred.length) sections.push({ id: SCRIPTURE_SECTIONS.sacred, notebookId: SCRIPTURE_NOTEBOOK, title: 'Sacred Library notes', color: '#7a2bd6', order: 1 });
  if (research.length) sections.push({ id: SCRIPTURE_SECTIONS.research, notebookId: SCRIPTURE_NOTEBOOK, title: 'Research notebook', color: '#06D6A0', order: 2 });
  return { notebooks: sections.length ? [SCRIPTURE_NOTEBOOK_META] : [], sections, pages: [...verses, ...sacred, ...research] };
}

/** Replace any earlier reader notebook in `base` with `reader` (used on load and on live updates). */
export function mergeReaderNotes<T extends Structure>(base: T, reader: Structure): T {
  const notebooks = base.notebooks.filter(n => n.id !== SCRIPTURE_NOTEBOOK);
  const sections = base.sections.filter(s => s.notebookId !== SCRIPTURE_NOTEBOOK);
  const pages = base.pages.filter(p => !p.reader);
  return { ...base, notebooks: [...notebooks, ...reader.notebooks].sort((a, b) => a.order - b.order), sections: [...sections, ...reader.sections], pages: [...pages, ...reader.pages] };
}
