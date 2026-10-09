// Upgrade orchestration, PURE: adapters from the two book shapes on the platform, the opt-in upgrade (with a
// verbatim snapshot of the original chapters), the before/after preview, revert, and the reader-bundle contract
// (what is published to readers, and how a buyer's pinned version is chosen).

import type { Album, BookChapter, TelaDoc } from '../../types';
import type { BookDraft } from '../bookmeta/types';
import { objectsToSvg } from '../tela/telaSvg';
import { bookToTelaDoc, defaultDocId, telaDocToBook, parseFrameId } from './bookToTela';
import { fidelitySummary, pageFidelity } from './model';
import { htmlToNodes, normalizeChapterHtml, plainText, wordCountOf } from './html';
import { validateInstance } from './enhancements';
import { sanitizeAuthorPageTurn, type AuthorPageTurn } from '../lorea/pageTransitions';
import type { BookSource, BookSourceChapter, BookTelaUpgrade, EnhancementInstance, ExportFormat, PageFidelity, UpgradeOptions } from './types';

// ── adapters ─────────────────────────────────────────────────────────────────

/** Submission-flow draft (manuscript chapters are already HTML-lite). */
export function bookFromDraft(d: BookDraft): BookSource {
  const m = d.metadata;
  const authors = m.contributors.filter(c => c.role === 'author').map(c => c.name).filter(Boolean);
  return {
    id: d.id, title: m.title || 'Untitled book', subtitle: m.subtitle || undefined,
    authors: authors.length ? authors : (m.penName ? [m.penName] : []),
    contributors: m.contributors, language: m.language || 'en', description: m.description || undefined,
    coverUrl: d.cover?.url, coverAlt: m.title ? `Cover of ${m.title}` : undefined,
    chapters: (d.manuscript?.chapters ?? []).map(c => ({ id: c.id, title: c.title, html: c.html || '', kind: c.kind ?? 'chapter', included: c.included })),
    metadata: m, ownerId: d.ownerId, visualLed: d.format === 'GRAPHIC_NOVEL' || d.format === 'ZINE',
  };
}

export interface AlbumAdapterResult { book: BookSource; unsupported: string[] }

/** Platform Album of type BOOK (Lorea). File-backed chapters (EPUB/PDF url, comic pages) cannot be upgraded as text. */
export function bookFromAlbum(a: Pick<Album, 'id' | 'title' | 'artist' | 'bookChapters' | 'coverImage' | 'ownerId' | 'description'> & { language?: string }): AlbumAdapterResult {
  const unsupported: string[] = [];
  const chapters: BookSourceChapter[] = [];
  for (const c of (a.bookChapters || []) as BookChapter[]) {
    if (c.content && c.content.trim()) chapters.push({ id: c.id, title: c.title || 'Untitled', html: c.content, kind: 'chapter', included: true, ...(c.audioUrl ? { audioUrl: c.audioUrl } : {}) });
    else unsupported.push(c.title || c.id);
  }
  return {
    book: { id: a.id, title: a.title, authors: a.artist ? [a.artist] : [], language: a.language || 'en', description: a.description, coverUrl: a.coverImage, coverAlt: `Cover of ${a.title}`, chapters, ownerId: a.ownerId },
    unsupported,
  };
}

/** Reverse of bookFromAlbum for the classic reader: chapters back to `content` (HTML-lite, which the reader accepts). */
export function chaptersToAlbum(base: BookChapter[], chapters: BookSourceChapter[]): BookChapter[] {
  const by = new Map(chapters.map(c => [c.id, c]));
  return base.map(b => { const c = by.get(b.id); return c ? { ...b, title: c.title, content: c.html } : b; });
}

// ── upgrade / revert ─────────────────────────────────────────────────────────

export function canUpgrade(book: BookSource): { ok: boolean; reason?: string } {
  const text = book.chapters.filter(c => c.included !== false && plainText(c.html).length > 0);
  if (!text.length) return { ok: false, reason: 'This book has no text chapters yet. Add or import a manuscript first.' };
  return { ok: true };
}

export interface UpgradeResult { upgrade: BookTelaUpgrade; doc: TelaDoc; issues: { enhancementId: string; message: string }[] }

export function createUpgrade(book: BookSource, opts: UpgradeOptions = {}): UpgradeResult {
  const now = opts.now ?? Date.now();
  const docId = opts.docId || defaultDocId(book.id);
  const enhancements = opts.enhancements ?? [];
  const doc = bookToTelaDoc(book, { ...opts, docId, now, enhancements });
  const issues: UpgradeResult['issues'] = [];
  for (const e of enhancements) for (const i of validateInstance(e)) issues.push({ enhancementId: e.id, message: i.message });
  const upgrade: BookTelaUpgrade = {
    schemaVersion: 1, bookId: book.id, docId, upgradedAt: now,
    originalChapters: book.chapters.map(c => ({ ...c })),   // verbatim: Revert restores exactly this
    enhancements, ...(opts.template ? { openerTemplateId: opts.template.id } : {}), layoutPreference: 'AUTO',
    ...(sanitizeAuthorPageTurn(opts.pageTurn) ? { pageTurn: sanitizeAuthorPageTurn(opts.pageTurn) } : {}),
  };
  return { upgrade, doc, issues };
}

/** Back to the original chapters. Does NOT delete the Tela doc (the author may still want it); it is simply no longer the source. */
export function revertUpgrade(u: BookTelaUpgrade, now = Date.now()): { chapters: BookSourceChapter[]; upgrade: BookTelaUpgrade } {
  return { chapters: u.originalChapters.map(c => ({ ...c })), upgrade: { ...u, revertedAt: now } };
}

/** Sync Tela text edits into the book's chapters. Original snapshot is untouched. */
export function syncChaptersFromTela(doc: TelaDoc, book: BookSource) {
  return telaDocToBook(doc, book);
}

// ── preview ──────────────────────────────────────────────────────────────────

export interface UpgradePreview {
  before: { chapters: number; words: number; images: number; readingMinutes: number };
  after: { frames: number; chapters: number; words: number; images: number; enhancements: number; readingMinutes: number };
  textPreserved: boolean;
  openerSvgs: { chapterId: string; title: string; svg: string }[];
  fidelity: { format: ExportFormat; pages: PageFidelity[]; summary: ReturnType<typeof fidelitySummary> };
  warnings: string[];
}

export function previewUpgrade(book: BookSource, opts: UpgradeOptions = {}, format: ExportFormat = 'EPUB_REFLOW', maxOpeners = 4): UpgradePreview {
  const { upgrade, doc, issues } = createUpgrade(book, opts);
  const included = book.chapters.filter(c => c.included !== false);
  const beforeWords = included.reduce((s, c) => s + wordCountOf(plainText(normalizeChapterHtml(c.title, c.html))), 0);
  const imgCount = (chs: BookSourceChapter[]) => chs.reduce((s, c) => s + htmlToNodes(c.html).filter(n => n.type === 'image').length, 0);
  const back = telaDocToBook(doc, book);
  const norm = (b: BookSourceChapter[]) => b.map(c => `${c.id}\u0000${normalizeChapterHtml(c.title, c.html)}`).join('\u0001');
  const textPreserved = norm(included) === norm(back.chapters);
  const afterWords = back.chapters.reduce((s, c) => s + wordCountOf(plainText(c.html)), 0);
  const openerSvgs = doc.frames.filter(f => parseFrameId(doc.id, f.id).role === 'opener').slice(0, maxOpeners).map(f => {
    const d = doc.devices[f.deviceIds[0]];
    const r = parseFrameId(doc.id, f.id);
    return { chapterId: 'chapterId' in r ? r.chapterId : '', title: f.label || '', svg: d?.type === 'VECTOR' ? objectsToSvg(d.objects, d.width, d.height) : '' };
  });
  const pages = pageFidelity(doc, upgrade, format);
  return {
    before: { chapters: included.length, words: beforeWords, images: imgCount(included), readingMinutes: Math.max(1, Math.round(beforeWords / 230)) },
    after: { frames: doc.frames.length, chapters: back.chapters.length, words: afterWords, images: imgCount(back.chapters), enhancements: upgrade.enhancements.length, readingMinutes: Math.max(1, Math.round(afterWords / 230)) },
    textPreserved, openerSvgs, fidelity: { format, pages, summary: fidelitySummary(pages) },
    warnings: [...back.warnings, ...issues.map(i => i.message)],
  };
}

// ── reader bundle (what is published to readers) ─────────────────────────────

/** Immutable payload stored at albums/{id}/telaVersions/{versionId}. originalChapters is NOT included (author-private). */
export interface BookTelaBundle {
  schemaVersion: 1;
  bookId: string;
  versionId: string;
  createdAt: number;
  label?: string;
  doc: TelaDoc;
  enhancements: EnhancementInstance[];
  /** The author's page-turn choice (Lorea reader only; exports ignore it). */
  pageTurn?: AuthorPageTurn;
  /** Chapter order + titles so the reader can build a contents list without parsing frames. */
  toc: { chapterId: string; title: string; frameId: string }[];
  book: Pick<BookSource, 'id' | 'title' | 'subtitle' | 'authors' | 'contributors' | 'language' | 'description' | 'coverUrl' | 'coverAlt' | 'metadata' | 'visualLed' | 'ownerId'>;
}

export function makeBundle(book: BookSource, upgrade: BookTelaUpgrade, doc: TelaDoc, versionId: string, now = Date.now(), label?: string): BookTelaBundle {
  const toc = doc.frames.flatMap(f => { const r = parseFrameId(doc.id, f.id); return r.role === 'opener' ? [{ chapterId: r.chapterId, title: f.label || '', frameId: f.id }] : []; });
  const { chapters: _c, ...rest } = book;
  return { schemaVersion: 1, bookId: book.id, versionId, createdAt: now, ...(label ? { label } : {}), doc: { ...doc, currentVersionId: versionId }, enhancements: upgrade.enhancements, ...(sanitizeAuthorPageTurn(upgrade.pageTurn) ? { pageTurn: sanitizeAuthorPageTurn(upgrade.pageTurn) } : {}), toc, book: rest };
}

export interface VersionStamp { versionId: string; createdAt: number }

/**
 * Buy-to-own pin, derived rather than stored: a sold copy reads the NEWEST version that existed at or before the
 * moment of purchase (license.issuedAt). Versions are write-once, so this never changes after the sale. If no
 * version existed yet, returns null: the buyer reads the classic text they bought (never a later upgrade).
 */
export function pinnedVersionFor(versions: ReadonlyArray<VersionStamp>, licenseIssuedAt: number): VersionStamp | null {
  return [...versions].filter(v => v.createdAt <= licenseIssuedAt).sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
}

export const latestVersion = (versions: ReadonlyArray<VersionStamp>): VersionStamp | null => [...versions].sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;

export type ReaderMode = { mode: 'classic' } | { mode: 'tela'; pin: 'follow-latest' | 'pinned'; version: VersionStamp };

/** Decide how Lorea should render this book for this reader. Pure so the policy is testable. */
export function chooseReaderMode(i: { versions: ReadonlyArray<VersionStamp>; isOwner: boolean; isPaid: boolean; license?: { issuedAt: number } | null; telaEnabled: boolean }): ReaderMode {
  if (!i.telaEnabled || !i.versions.length) return { mode: 'classic' };
  if (i.isOwner || !i.isPaid) { const v = latestVersion(i.versions); return v ? { mode: 'tela', pin: 'follow-latest', version: v } : { mode: 'classic' }; }
  if (!i.license) return { mode: 'classic' };           // not entitled: the gate handles it, nothing to render
  const v = pinnedVersionFor(i.versions, i.license.issuedAt);
  return v ? { mode: 'tela', pin: 'pinned', version: v } : { mode: 'classic' };
}

// ── more adapters ────────────────────────────────────────────────────────────

/** Reader bundle -> a BookSource the exporters understand (chapters rebuilt from the frozen Tela doc). */
export function bookFromBundle(b: BookTelaBundle): BookSource {
  const chapters = telaDocToBook(b.doc, { chapters: [] }).chapters;
  return { ...b.book, chapters };
}

/** Book Authoring Studio pages -> chapters. Comic panels become pictures whose alt text carries captions and speech. */
export function bookFromStudio(s: import('../../types').StudioBook): BookSource {
  const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const chapters: BookSourceChapter[] = []; let cur: BookSourceChapter | null = null;
  const start = (title: string) => { cur = { id: `st${chapters.length + 1}`, title, html: '', kind: 'chapter', included: true }; chapters.push(cur); };
  const sorted = [...s.pages].sort((a, b) => a.order - b.order);
  let coverUrl = s.coverImageUrl; let images = 0, texts = 0;
  for (const p of sorted) {
    if (p.type === 'COVER') { if (!coverUrl && p.imageUrl) coverUrl = p.imageUrl; continue; }
    if (p.type === 'CHAPTER_BREAK') { start(p.chapterTitle || `Chapter ${chapters.length + 1}`); continue; }
    if (p.type === 'TEXT') {
      if (!cur || p.chapterTitle) start(p.chapterTitle || `Chapter ${chapters.length + 1}`);
      cur!.html += (p.richText || ''); texts++; continue;
    }
    if (!cur) start('Chapter 1');
    if (p.type === 'FULL_BLEED' || p.type === 'MEDIA') { if (p.imageUrl) { cur!.html += `<figure><img src="${esc(p.imageUrl)}" alt="${esc(p.overlay || p.notes || 'Full-page illustration')}"/></figure>`; images++; } continue; }
    if (p.type === 'COMIC' || p.type === 'MANGA') {
      (p.panels || []).forEach((pn, i) => {
        if (!pn.imageUrl) return;
        const said = pn.bubbles.map(b => `${b.character ? b.character + ' ' : ''}${b.type === 'narration' ? 'narrates' : b.type === 'sfx' ? 'sound effect' : 'says'}: ${b.text}`).join('. ');
        const alt = [`Panel ${i + 1}`, pn.caption, said, pn.sfxText && `Sound: ${pn.sfxText}`].filter(Boolean).join('. ');
        cur!.html += `<figure><img src="${esc(pn.imageUrl)}" alt="${esc(alt)}"/></figure>`; images++;
      });
    }
  }
  return { id: s.id, title: s.title, authors: s.author ? [s.author] : [], language: 'en', description: s.synopsis, coverUrl, coverAlt: `Cover of ${s.title}`, chapters: chapters.filter(c => c.html.trim()), visualLed: ['GRAPHIC_NOVEL', 'MANGA', 'WEBTOON', 'COMIC'].includes(s.format) || images > texts };
}
