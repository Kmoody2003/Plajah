// Showcase books as real TELA DOCUMENTS (the base of the living editions, docs/LIVING_PUBLISHING.md).
//
//   buildShowcaseTelaDoc(bookId)   one Tela FRAME per spread, hosting one VECTOR device whose objects are EXACTLY what the registered
//                                  publication designer draws for that spread (instantiatePublicationPage, as the gallery does)
//
// What this builder changes about the designers' output, and ONLY this:
//   1. object ids: the designers mint `rect_<time>_<counter>` ids that differ on every run. Here an id is
//      `p<NN>_<label-slug>_<k>` (page, label, k-th object with that label on the page) so a behaviour that targets an id keeps
//      working after a rebuild. It only drifts if a designer inserts an object with the SAME label earlier on the SAME page.
//   2. generic labels ('Ellipse', 'rect', 'poly'...) get a meaningful, stable label from the mapping layer below
//      (kind + size + where on the page). Look, geometry, fills and templateRole are never touched. Specific labels
//      ('Eye', 'Window', 'Planet shade') are never touched, so label targeting works against the designers' own names.
// Everything else (kind, geometry, paint, text, objectLabel of specific objects, templateRole) is byte-identical to the designer output;
// tests/showcaseLive.test.ts asserts it.

import type { TelaDoc, TelaFrame, TelaVectorDevice, TelaVectorObject } from '../../types';
import { showcaseById, type ShowcaseBook } from '../../data/showcase';
import { TELA_PUBLICATION_TEMPLATES, instantiatePublicationPage } from '../telaPublicationTemplates';
import type { BookMetadata } from '../bookmeta/types';
import { emptyLivingPage, LIVING_SCHEMA_VERSION, type LivingBook, type LivingPage, type Target } from '../living/contracts';
import { defaultDocId, frameIds } from '../bookTela/bookToTela';
import { FIXED_PAGE_MARK } from '../bookTela/livingNotes';
import type { BookTelaBundle } from '../bookTela/upgrade';

/** Fixed timestamp for doc fields so two builds are byte-identical (2026-10-09, the day the books were published flat). */
export const SHOWCASE_DOC_EPOCH = Date.UTC(2026, 9, 9);
/** The album id a showcase book is published under (scripts/showcase/publishBooks.ts). */
export const showcaseAlbumId = (bookId: string) => `showcase_${bookId}`;
/** Tela chapter id of one page; every spread is its own "chapter" so the reader, TOC, position and export treat it as a page. */
export const pageChapterId = (n: number) => `p${String(n).padStart(2, '0')}`;
export const pageDeviceId = (docId: string, n: number) => `${docId}:ch:${pageChapterId(n)}:opener`;
export { FIXED_PAGE_MARK };

// ───────────────────────────── label mapping layer ─────────────────────────────

// 'Path', 'Star', 'Image' are NOT generic here: the designers use them as real names (the forest path, the sky's stars).
const GENERIC_LABEL = /^(poly|polygon|polyline|rect|rectangle|ellipse|circle|oval|line|text|shape|object|group|layer|vector|freeform)[\s_-]*\d*$/i;
export const isGenericLabel = (l: string | undefined): boolean => !l || !l.trim() || GENERIC_LABEL.test(l.trim());

const KIND_NOUN: Record<string, string> = { RECT: 'Block', ELLIPSE: 'Disc', PATH: 'Shape', LINE: 'Line', TEXT: 'Text', IMAGE: 'Picture' };

function bounds(o: TelaVectorObject): { x0: number; y0: number; x1: number; y1: number } {
  const pts = o.points;
  if ((o.kind === 'PATH' || o.kind === 'LINE') && pts && pts.length >= 4) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i + 1 < pts.length; i += 2) { x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]); }
    return { x0, y0, x1, y1 };
  }
  return { x0: o.x, y0: o.y, x1: o.x + o.w, y1: o.y + o.h };
}

/** A meaningful label for an object whose designer label is missing or generic. Deterministic, depends only on the object and the page size. */
export function mappedLabel(o: TelaVectorObject, W: number, H: number): string {
  const b = bounds(o);
  const cx = (b.x0 + b.x1) / 2 / W, cy = (b.y0 + b.y1) / 2 / H;
  const col = cx < 0.34 ? 'left' : cx > 0.66 ? 'right' : 'centre';
  const row = cy < 0.34 ? 'top' : cy > 0.66 ? 'bottom' : 'middle';
  const where = col === 'centre' && row === 'middle' ? 'centre' : col === 'centre' ? row : row === 'middle' ? col : `${row} ${col}`;
  const area = Math.max(0, (b.x1 - b.x0) * (b.y1 - b.y0)) / (W * H);
  const size = area < 0.002 ? 'tiny' : area < 0.02 ? 'small' : area < 0.15 ? 'medium' : 'large';
  if (o.kind === 'TEXT') { const t = (o.text || '').replace(/\s+/g, ' ').trim().slice(0, 24); return t ? `Text "${t}"` : `Text (${where})`; }
  const noun = KIND_NOUN[o.kind] || 'Shape';
  return `${size[0].toUpperCase()}${size.slice(1)} ${noun.toLowerCase()} (${where})`;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'object';

// ───────────────────────────── per-book pages ─────────────────────────────

export interface PageObjectsResult {
  objects: TelaVectorObject[];
  /** objects that came from the designer with no label at all */
  unlabeled: number;
  /** objects that came with a generic label and were given a mapped one: designer label -> count */
  remapped: Record<string, number>;
}

/** The designer's objects for one spread with stable ids and mapped generic labels. Pure and deterministic. */
export function pageObjects(templateId: string, pageIndex: number, W?: number, H?: number): PageObjectsResult {
  const t = TELA_PUBLICATION_TEMPLATES.find(x => x.id === templateId);
  if (!t) throw new Error(`Unknown publication template "${templateId}"`);
  const raw = instantiatePublicationPage(t, t.pages[pageIndex], pageIndex);
  const w = W ?? t.width, h = H ?? t.height;
  const n = pageIndex + 1;
  const seen = new Map<string, number>();
  let unlabeled = 0; const remapped: Record<string, number> = {};
  const objects = raw.map(o => {
    let label = o.objectLabel as string;
    if (!label || !label.trim()) { unlabeled++; label = mappedLabel(o, w, h); }
    else if (isGenericLabel(label)) { remapped[label] = (remapped[label] || 0) + 1; label = mappedLabel(o, w, h); }
    // the id keys on the DESIGNER's label where it is specific (that is the name an author sees in the designer), else on the mapped one
    const key = slug(label);
    const k = (seen.get(key) || 0) + 1; seen.set(key, k);
    return { ...o, id: `p${String(n).padStart(2, '0')}_${key}_${k}`, objectLabel: label };
  });
  return { objects, unlabeled, remapped };
}

export function frameLabelFor(book: ShowcaseBook, n: number): string {
  const beat = book.spreads[n - 1]?.beat;
  return beat === 'cover' ? book.title : beat === 'back' ? 'Back cover' : `Page ${n}`;
}

// ───────────────────────────── the doc ─────────────────────────────

export interface ShowcaseDocOptions { ownerId?: string; now?: number }

/** An empty LivingBook: one empty LivingPage per spread (a page with no behaviours is the flat page). */
export function emptyLivingBook(book: Pick<ShowcaseBook, 'id' | 'spreads'>): LivingBook {
  return { version: LIVING_SCHEMA_VERSION, bookId: book.id, pages: book.spreads.map(s => emptyLivingPage(s.n)), scores: {} };
}

/** Make sure the living book has exactly one page entry per spread, in order (missing pages are added empty; extras are reported by checkLivingTargets). */
export function normaliseLiving(book: Pick<ShowcaseBook, 'id' | 'spreads'>, living: LivingBook): LivingBook {
  const by = new Map(living.pages.map(p => [p.page, p]));
  const pages: LivingPage[] = book.spreads.map(s => by.get(s.n) ?? emptyLivingPage(s.n));
  return { ...living, version: LIVING_SCHEMA_VERSION, bookId: book.id, pages };
}

export function showcaseMetadata(b: ShowcaseBook): Partial<BookMetadata> {
  return {
    title: b.title, language: 'en', description: b.blurb, penName: b.author,
    contributors: [{ name: b.author, role: 'author' }],
    audience: { minAge: b.ageMin, maxAge: b.ageMax, adult: false },
    keywords: ['children', 'picture book', `ages ${b.ageMin}-${b.ageMax}`, 'living book', 'cc by'],
    genre: "Children's Picture Books",
    license: 'CC-BY',
    ai: { text: 'assisted', images: 'generated', translation: 'none', tools: b.aiDisclosure },
    copyrightHolder: b.author, copyrightYear: '2026',
    accessibility: { altTextDeclared: false, summary: 'Every page is vector artwork with real, selectable story text. The Lorea reader adds optional read-aloud, sound and touch interactions; all of them can be switched off and the page reads the same.' },
  };
}

/**
 * The Tela document for a showcase book. SYNC and pure. `living` is the book's LivingBook (data/showcase/living/<id>.ts); pass it in,
 * or use loadShowcaseTelaDoc() which imports it when the file exists. Without it the doc carries one empty LivingPage per spread.
 */
export function buildShowcaseTelaDoc(bookId: string, living?: LivingBook | null, o: ShowcaseDocOptions = {}): TelaDoc {
  const book = showcaseById(bookId);
  if (!book) throw new Error(`Unknown showcase book "${bookId}"`);
  const t = TELA_PUBLICATION_TEMPLATES.find(x => x.id === book.templateId);
  if (!t) throw new Error(`Template "${book.templateId}" for "${bookId}" is not registered`);
  if (t.pages.length !== book.spreads.length) throw new Error(`"${bookId}": the template draws ${t.pages.length} pages but the story has ${book.spreads.length} spreads`);
  const docId = defaultDocId(showcaseAlbumId(book.id));
  const now = o.now ?? SHOWCASE_DOC_EPOCH;
  const frames: TelaFrame[] = []; const devices: TelaDoc['devices'] = {};
  let y = 0;
  book.spreads.forEach((s, i) => {
    const n = i + 1; const cid = pageChapterId(n);
    const { objects } = pageObjects(t.id, i);
    const dev: TelaVectorDevice = { id: pageDeviceId(docId, n), type: 'VECTOR', name: frameLabelFor(book, n), width: t.width, height: t.height, objects, objectLabel: FIXED_PAGE_MARK };
    devices[dev.id] = dev;
    frames.push({ id: frameIds.opener(docId, cid), kind: 'SCREEN', preset: 'FREE', x: 0, y, w: t.width, h: t.height, deviceIds: [dev.id], label: frameLabelFor(book, n) });
    y += t.height + 24;
  });
  const lv = normaliseLiving(book, living ?? emptyLivingBook(book));
  return {
    id: docId, ownerId: o.ownerId ?? '', title: book.title, frames, devices, createdAt: now, updatedAt: now,
    publication: {
      kind: 'picture-book', bookId: book.id, templateId: book.templateId, author: book.author, license: 'CC BY 4.0', licenseId: book.license,
      ageMin: book.ageMin, ageMax: book.ageMax, language: 'en', aiDisclosure: book.aiDisclosure, pageCount: book.spreads.length,
    },
    living: lv,
  };
}

/** Same, plus `data/showcase/living/<id>.ts` when it exists (dynamic import: the file is optional). Default export or any export shaped like a LivingBook. */
export async function loadShowcaseLiving(bookId: string): Promise<LivingBook | null> {
  const spec = `../../data/showcase/living/${bookId}`;
  let mod: Record<string, unknown>;
  try { mod = await import(/* @vite-ignore */ spec); }
  catch (e) {
    const msg = String((e as Error)?.message || e);
    // only "this book has no living file yet" is optional; a living file that exists but fails to load (syntax error, bad import) must surface
    if (/Cannot find module|ERR_MODULE_NOT_FOUND|Failed to resolve/i.test(msg) && msg.includes(bookId)) return null;
    throw e;
  }
  const isLiving = (v: unknown): v is LivingBook => !!v && typeof v === 'object' && (v as LivingBook).version === 1 && Array.isArray((v as LivingBook).pages);
  for (const v of [mod.default, ...Object.values(mod)]) if (isLiving(v)) return v;
  return null;
}
export async function loadShowcaseTelaDoc(bookId: string, o: ShowcaseDocOptions = {}): Promise<TelaDoc> {
  return buildShowcaseTelaDoc(bookId, await loadShowcaseLiving(bookId), o);
}

// ───────────────────────────── reader bundle ─────────────────────────────

/** The reader bundle (services/bookTela/upgrade BookTelaBundle) for a showcase doc. Picture book: visual-led, page turn = flip. */
export function makeShowcaseBundle(doc: TelaDoc, versionId: string, createdAt: number, label?: string, o: { coverUrl?: string; /** the album the bundle is published under (defaults to showcase_<book-id>); the reader checks bundle.bookId against it */ albumId?: string } = {}): BookTelaBundle {
  const book = showcaseById(doc.publication?.bookId || '');
  if (!book) throw new Error('This doc is not a showcase book');
  const albumId = o.albumId ?? showcaseAlbumId(book.id);
  const toc = doc.frames.map(f => ({ chapterId: f.id.split(':f:ch:')[1].split(':')[0], title: f.label || '', frameId: f.id }));
  return {
    schemaVersion: 1, bookId: albumId, versionId, createdAt, ...(label ? { label } : {}),
    doc: { ...doc, currentVersionId: versionId },
    enhancements: [], pageTurn: { style: 'flip' }, toc,
    book: {
      id: albumId, title: book.title, authors: [book.author], contributors: [{ name: book.author, role: 'author' }], language: 'en', description: book.blurb,
      metadata: showcaseMetadata(book), visualLed: true,
      ...(o.coverUrl ? { coverUrl: o.coverUrl, coverAlt: `Cover of ${book.title}` } : {}),
    },
  };
}

// ───────────────────────────── audits ─────────────────────────────

export interface LabelAudit {
  bookId: string; pages: number; objects: number;
  /** designer objects with no label at all */
  unlabeled: number;
  /** designer objects with a generic label that the mapping layer renamed: designer label -> count */
  remapped: Record<string, number>;
  remappedTotal: number;
  /** after the mapping layer: objects whose label is still empty or generic (must be 0) */
  stillGeneric: number;
  /** after the mapping layer: ids that are not unique within the doc (must be 0) */
  duplicateIds: number;
  perPage: Array<{ page: number; objects: number; unlabeled: number; remapped: number }>;
}

export function auditShowcaseLabels(bookId: string): LabelAudit {
  const book = showcaseById(bookId); if (!book) throw new Error(`Unknown showcase book "${bookId}"`);
  const a: LabelAudit = { bookId, pages: book.spreads.length, objects: 0, unlabeled: 0, remapped: {}, remappedTotal: 0, stillGeneric: 0, duplicateIds: 0, perPage: [] };
  const ids = new Set<string>();
  book.spreads.forEach((_s, i) => {
    const r = pageObjects(book.templateId, i);
    const rem = Object.values(r.remapped).reduce((s, v) => s + v, 0);
    a.objects += r.objects.length; a.unlabeled += r.unlabeled; a.remappedTotal += rem;
    for (const [k, v] of Object.entries(r.remapped)) a.remapped[k] = (a.remapped[k] || 0) + v;
    for (const o of r.objects) { if (isGenericLabel(o.objectLabel)) a.stillGeneric++; if (ids.has(o.id)) a.duplicateIds++; ids.add(o.id); }
    a.perPage.push({ page: i + 1, objects: r.objects.length, unlabeled: r.unlabeled, remapped: rem });
  });
  return a;
}

const prefixMatch = (pattern: string, label: string) => (pattern.endsWith('*') ? label.startsWith(pattern.slice(0, -1)) : label === pattern);

/** Does a Target resolve to at least one object on the page? */
export function targetResolves(t: Target, objects: ReadonlyArray<TelaVectorObject>, groups: Record<string, string[]> | undefined): boolean {
  if ('page' in t) return true;
  if ('id' in t) return objects.some(o => o.id === t.id);
  if ('label' in t) return objects.some(o => !!o.objectLabel && prefixMatch(t.label, o.objectLabel));
  if ('role' in t) return objects.some(o => o.templateRole === t.role);
  if ('group' in t) return !!groups?.[t.group]?.length && groups[t.group].every(e => entryResolves(e, objects));
  return false;
}
function entryResolves(e: string, objects: ReadonlyArray<TelaVectorObject>): boolean {
  if (e.startsWith('label:')) return objects.some(o => !!o.objectLabel && prefixMatch(e.slice(6), o.objectLabel));
  if (e.startsWith('role:')) return objects.some(o => o.templateRole === e.slice(5));
  return objects.some(o => o.id === e);
}
const targetsOf = (a: unknown, out: Target[] = []): Target[] => {
  if (Array.isArray(a)) a.forEach(x => targetsOf(x, out));
  else if (a && typeof a === 'object') {
    const r = a as Record<string, unknown>;
    if (r.target && typeof r.target === 'object') out.push(r.target as Target);
    if (r.at && typeof r.at === 'object' && ('id' in r.at || 'label' in r.at || 'role' in r.at || 'group' in r.at || 'page' in r.at)) out.push(r.at as Target);
    for (const v of Object.values(r)) if (v && typeof v === 'object') targetsOf(v, out);
  }
  return out;
};

/** Problems that would make a LivingBook silently do nothing on this doc: dangling targets/groups, pages that do not exist, wrong book id. Empty list = fine. */
export function checkLivingTargets(doc: TelaDoc): string[] {
  const problems: string[] = []; const lv = doc.living; if (!lv) return problems;
  const pubBook = doc.publication?.bookId;
  if (pubBook && lv.bookId !== pubBook) problems.push(`living.bookId is "${lv.bookId}" but the doc is "${pubBook}"`);
  doc.frames.forEach((f, i) => {
    const dev = doc.devices[f.deviceIds[0]]; const objects = dev?.type === 'VECTOR' ? dev.objects : [];
    const page = lv.pages.find(p => p.page === i + 1);
    if (!page) { problems.push(`no LivingPage for page ${i + 1}`); return; }
    for (const [g, entries] of Object.entries(page.groups ?? {})) for (const e of entries) if (!entryResolves(e, objects)) problems.push(`page ${i + 1}: group "${g}" entry "${e}" matches no object`);
    for (const b of page.behaviors) {
      for (const t of [b.target, ...targetsOf(b.do), ...targetsOf(b.reduced ?? [])]) if (t && !targetResolves(t, objects, page.groups)) problems.push(`page ${i + 1}: behaviour "${b.id}" targets ${JSON.stringify(t)} which matches no object`);
    }
  });
  for (const p of lv.pages) if (p.page < 1 || p.page > doc.frames.length) problems.push(`LivingPage ${p.page} has no frame`);
  return problems;
}
