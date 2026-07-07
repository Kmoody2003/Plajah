// openLibraryService — Open Library (openlibrary.org) is the best global, free,
// no-key, CORS-open book API: millions of works across every language, with covers,
// subjects, authors, and — crucially — links to readable/borrowable scans on the
// Internet Archive. This gives Lorea a genuine worldwide library.
import { cached } from '../src/lib/performanceCache';
import type { ArchiveBook } from './archiveContentService';

const OL = 'https://openlibrary.org';
export const olCover = (id?: number | string, size: 'S' | 'M' | 'L' = 'M') =>
  id ? `https://covers.openlibrary.org/b/id/${id}-${size}.jpg` : undefined;

// A readable Open Library result maps onto the same ArchiveBook shape BookTab already
// consumes. Items with an `ia` scan are readable on archive.org; others carry a link.
const toArchiveBook = (d: any): ArchiveBook => {
  const iaId = Array.isArray(d.ia) ? d.ia[0] : d.ia;
  const cover = olCover(d.cover_i, 'M') || (iaId ? `https://archive.org/services/img/${iaId}` : undefined);
  const formats: Record<string, string> = {};
  if (iaId) {
    // Readable on the Internet Archive (same path BookTab uses for IA texts).
    formats['application/pdf'] = `https://archive.org/download/${iaId}/${iaId}.pdf`;
    formats['ia'] = iaId;
  }
  formats['text/html'] = `${OL}${d.key || ''}`;
  return {
    id: `ol-${String(d.key || d.cover_edition_key || d.title).replace(/\W+/g, '-').slice(-70)}`,
    title: d.title || 'Untitled',
    authors: d.author_name || (d.authors ? d.authors.map((a: any) => a.name) : ['Unknown']),
    subjects: (d.subject || []).slice(0, 8),
    formats,
    download_count: d.readinglog_count || d.want_to_read_count || 0,
    coverImage: cover,
    genre: (d.subject && d.subject[0]) || 'Open Library',
  };
};

/** Global full-text catalog search. */
export const searchOpenLibrary = async (query: string, limit = 30): Promise<ArchiveBook[]> => {
  if (!query.trim()) return [];
  return cached(`ol-search:${query}:${limit}`, 1000 * 60 * 30, async () => {
    const params = new URLSearchParams({
      q: query, limit: String(limit),
      fields: 'key,title,author_name,first_publish_year,cover_i,ia,subject,edition_count,language',
    });
    const res = await fetch(`${OL}/search.json?${params}`);
    if (!res.ok) throw new Error(`OpenLibrary ${res.status}`);
    const data = await res.json();
    return (data.docs || []).map(toArchiveBook);
  }).catch(() => []);
};

/** Browse a subject (e.g. "science_fiction", "history", "comics"). */
export const openLibrarySubject = async (subject: string, limit = 30): Promise<ArchiveBook[]> => {
  const slug = subject.toLowerCase().replace(/\s+/g, '_');
  return cached(`ol-subject:${slug}:${limit}`, 1000 * 60 * 60, async () => {
    const res = await fetch(`${OL}/subjects/${encodeURIComponent(slug)}.json?limit=${limit}`);
    if (!res.ok) throw new Error(`OpenLibrary subject ${res.status}`);
    const data = await res.json();
    return (data.works || []).map((w: any) => toArchiveBook({
      key: w.key, title: w.title, cover_i: w.cover_id,
      author_name: (w.authors || []).map((a: any) => a.name),
      ia: w.ia, subject: w.subject,
    }));
  }).catch(() => []);
};

// Curated global browse shelves — a broad, worldwide "library" front for Lorea.
export const OPEN_LIBRARY_SHELVES: { label: string; subject: string }[] = [
  { label: 'Literature', subject: 'literature' },
  { label: 'Science Fiction', subject: 'science_fiction' },
  { label: 'Fantasy', subject: 'fantasy' },
  { label: 'History', subject: 'history' },
  { label: 'Philosophy', subject: 'philosophy' },
  { label: 'Science', subject: 'science' },
  { label: 'Poetry', subject: 'poetry' },
  { label: 'Mystery', subject: 'detective_and_mystery_stories' },
  { label: 'Biography', subject: 'biography' },
  { label: 'Art', subject: 'art' },
  { label: 'Children', subject: 'children' },
  { label: 'Comics', subject: 'comics_and_graphic_novels' },
];
