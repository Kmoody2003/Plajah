// BookDraft -> the Partial<Album> that the existing publishing path (AlbumCreator -> albums) understands, so a
// submitted book lands in the same store/reader (BookTab, BookReader) as every other book. Pure.

import type { Album, BookChapter } from '../../types';
import type { BookDraft } from './types';
import { checkIsbn } from './isbn';
import { sampleSplit } from './pricing';
import { copyrightHtml } from './copyright';
import { titlePageHtml } from './manuscript';
import { stripTags, stripUndefinedDeep } from './util';

export function toAlbumPartial(d: BookDraft, submissionId?: string): Partial<Album> {
  const m = d.metadata, p = d.pricing;
  const all = d.manuscript?.chapters ?? [];
  const story = all.filter(c => c.included && (c.kind ?? 'chapter') !== 'toc');
  const isbn = m.isbn.mode === 'own' ? checkIsbn(m.isbn.value) : null;

  const front: BookChapter[] = [];
  if (!story.some(c => c.kind === 'front')) {
    front.push({ id: 'gen_title', title: 'Title page', content: titlePageHtml(m), format: 'TXT', price: 0, isPaywalled: false });
  }
  if (m.includeGeneratedCopyrightPage) {
    front.push({ id: 'gen_copyright', title: 'Copyright', content: copyrightHtml(m, isbn?.isbn13), format: 'TXT', price: 0, isPaywalled: false });
  }
  const chapters: BookChapter[] = [...front, ...story.map(c => ({ id: c.id, title: c.title, content: c.html, format: 'TXT' as const, price: 0, isPaywalled: false }))];

  const paid = p.model === 'PAID';
  const storyIds = story.filter(c => (c.kind ?? 'chapter') === 'chapter');
  const split = sampleSplit(storyIds, p.freeSamplePct, p.freeFirstChapters);
  const freeIds = [...front.map(c => c.id), ...split.freeIds, ...story.filter(c => (c.kind ?? 'chapter') !== 'chapter').map(c => c.id)];

  const author = m.penName || m.contributors.find(c => c.role === 'author')?.name || '';
  const release = p.preorder.enabled && p.preorder.date ? Date.parse(p.preorder.date) : (m.publicationDate ? Date.parse(m.publicationDate) : NaN);
  const future = !isNaN(release) && release > Date.now();

  return stripUndefinedDeep({
    type: 'BOOK',
    subType: d.format === 'GRAPHIC_NOVEL' ? 'GRAPHIC_NOVEL' : 'NOVEL',
    title: m.subtitle ? `${m.title}: ${m.subtitle}` : m.title,
    artist: author,
    genre: m.genre,
    description: stripTags(m.description),
    isPaywalled: paid,
    price: paid ? (p.prices.USD ?? Object.values(p.prices)[0] ?? 0) : 0,
    isScheduled: future,
    releaseDate: future ? release : undefined,
    ...(future && m.releaseAnnouncement ? { releaseAnnouncement: m.releaseAnnouncement } : {}),
    bookChapters: chapters,
    bookPreviewConfig: paid ? { type: 'CHAPTERS', allowedChapterIds: freeIds } : undefined,
    tags: [...new Set([m.genre, ...m.keywords, 'book'].map(t => (t || '').trim()).filter(Boolean))],
    ...(d.cover?.url ? { coverImage: d.cover.url } : {}),
    bookDistribution: {
      delivery: p.delivery, watermark: p.delivery === 'DOWNLOAD_OPEN' ? p.watermark : undefined, submissionId,
      language: m.language, isbn13: isbn?.valid ? isbn.isbn13 : undefined, arkId: m.isbn.mode === 'platform' ? m.isbn.ark : undefined,
      wordCount: story.reduce((s, c) => s + c.wordCount, 0), aiDisclosure: m.ai.text !== 'none' || m.ai.images !== 'none' ? `${m.ai.text}/${m.ai.images}` : 'none', license: m.license,
    },
  }) as Partial<Album>;
}
