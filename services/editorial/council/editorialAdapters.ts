// editorialAdapters — turn the three places the council is mounted into a ManuscriptInput. Pure (no firebase).
import type { BookDraft } from '../../bookmeta/types';
import type { ArticleDisclosures, Claim, ImageRights } from '../../journalist/types';
import { isTrulyVerified } from '../../journalist/factCheck';
import type { ManuscriptInput, ManuscriptKind } from './editorialTypes';

export function htmlToText(html: string): string {
  return (html || '').replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, '\n\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&rsquo;/g, "'").replace(/\n{3,}/g, '\n\n').trim();
}

const FORMAT_KIND: Record<string, ManuscriptKind> = { NOVEL: 'FICTION', SERIAL: 'SERIAL', GRAPHIC_NOVEL: 'FICTION', NON_FICTION: 'NONFICTION', TEXTBOOK: 'NONFICTION', ZINE: 'NONFICTION' };

/** The ebook submission flow's draft. */
export function bookDraftToManuscript(d: BookDraft, kind?: ManuscriptKind): ManuscriptInput {
  const md = d.metadata;
  const k: ManuscriptKind = kind ?? ((md.audience.maxAge != null && md.audience.maxAge <= 17) ? 'YOUNG_READERS' : (FORMAT_KIND[d.format] ?? 'FICTION'));
  return {
    title: md.title, kind: k, genre: md.genre || undefined,
    chapters: (d.manuscript?.chapters ?? []).filter(c => c.included).map(c => ({ id: c.id, title: c.title, text: c.text || htmlToText(c.html), kind: c.kind })),
    meta: { description: md.description, keywords: md.keywords, bisac: md.bisac, isbnMode: md.isbn?.mode, copyrightHolder: md.copyrightHolder, copyrightYear: md.copyrightYear, license: md.license, aiText: md.ai?.text, aiImages: md.ai?.images, aiTools: md.ai?.tools, publicDomain: md.publicDomain, language: md.language, hasCover: !!d.cover, penName: md.penName, contentWarnings: md.contentWarnings, audienceMinAge: md.audience.minAge },
  };
}

/** BookAuthoringStudio pages (TEXT pages carry richText + chapterTitle). */
export function studioPagesToManuscript(book: { title?: string; pages: Array<{ id: string; type: string; order: number; richText?: string; chapterTitle?: string }> }, kind: ManuscriptKind = 'FICTION'): ManuscriptInput {
  const pages = [...book.pages].sort((a, b) => a.order - b.order).filter(p => p.richText && htmlToText(p.richText).trim());
  return { title: book.title || 'Untitled', kind, chapters: pages.map((p, i) => ({ id: p.id, title: p.chapterTitle || `Chapter ${i + 1}`, text: htmlToText(p.richText!) })) };
}

/** ArticleDesk. Reads the fact-check workbench; never writes to it. */
export function articleToManuscript(a: { title: string; subtitle?: string; text: string; disclosures: ArticleDisclosures; rights: ImageRights[]; imageRefs: string[]; claims: Claim[]; aiUsed?: boolean; notices?: number; kind?: 'ARTICLE' | 'NEWSLETTER' }): ManuscriptInput {
  return {
    title: a.title, kind: a.kind ?? 'ARTICLE', chapters: [{ id: 'body', title: a.title || 'Article', text: a.text }],
    article: {
      headline: a.title, disclosures: a.disclosures, imageRights: a.rights.map(r => ({ ref: r.ref, credit: r.credit, license: r.license, sourceUrl: r.sourceUrl })), imageRefs: a.imageRefs,
      claims: a.claims.map(c => ({ text: c.text, status: c.status, sources: c.sources.length, humanVerified: isTrulyVerified(c) })), aiUsedInEditor: a.aiUsed, notices: a.notices,
    },
  };
}
