import type { Album, BookChapter } from '../types';
import { uploadFile } from './backendService';

const STORAGE_HOST_MARKERS = [
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
];

const CONTENT_TYPES: Record<string, string> = {
  epub: 'application/epub+zip',
  pdf: 'application/pdf',
  txt: 'text/plain;charset=utf-8',
  html: 'text/html;charset=utf-8',
  htm: 'text/html;charset=utf-8',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const getExtension = (url: string, format?: BookChapter['format']) => {
  const formatted = format?.toLowerCase();
  if (formatted && CONTENT_TYPES[formatted]) return formatted;

  try {
    const path = new URL(url).pathname;
    const match = path.match(/\.([a-z0-9]{2,8})$/i);
    if (match) return match[1].toLowerCase();
  } catch {
    const match = url.match(/\.([a-z0-9]{2,8})(?:$|[?#])/i);
    if (match) return match[1].toLowerCase();
  }

  return 'bin';
};

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'book';

const shouldCache = (url?: string) =>
  !!url &&
  /^https?:\/\//i.test(url) &&
  !STORAGE_HOST_MARKERS.some(marker => url.includes(marker));

export const cacheExternalBookAssets = async (book: Album, ownerId: string): Promise<Album> => {
  const chapters = book.bookChapters || [];
  if (!chapters.some(chapter => shouldCache(chapter.url))) return book;

  const cachedChapters = await Promise.all(chapters.map(async (chapter, index) => {
    if (!shouldCache(chapter.url)) return chapter;

    const sourceUrl = chapter.url!;
    const extension = getExtension(sourceUrl, chapter.format);
    const contentType = CONTENT_TYPES[extension] || 'application/octet-stream';
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(sourceUrl)}`;
    const response = await fetch(proxyUrl);

    if (!response.ok) {
      throw new Error(`Could not cache ${chapter.title}: ${response.status} ${response.statusText}`);
    }

    const blob = await response.blob();
    const typedBlob = blob.type === contentType ? blob : new Blob([blob], { type: contentType });
    const storagePath = `books/${ownerId}/${slug(book.id)}/${String(index + 1).padStart(2, '0')}-${slug(chapter.id || chapter.title)}.${extension}`;
    const cachedUrl = await uploadFile(storagePath, typedBlob);

    return {
      ...chapter,
      url: cachedUrl,
      description: chapter.description || `Cached from ${new URL(sourceUrl).hostname}`,
    };
  }));

  return {
    ...book,
    bookChapters: cachedChapters,
  };
};
