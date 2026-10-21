// services/comicProject/catalog.ts — the showcase books an author can open as a project.
// The book data is large, so it loads on demand instead of riding in Tela's bundle.

import { canAccessPumpkinPatchProject } from '../comic/comicStudioBridge';
import { showcaseBookToComicProject } from './showcaseImport';
import type { ComicProject } from './types';

export interface ShowcaseCatalogEntry {
  id: string;
  title: string;
  pageCount: number;
  panelCount: number;
  hasArt: boolean;
}

/** Pumpkin Patch is the creator's own feature; other showcase titles are open to all. */
function canOpen(id: string) {
  return id !== 'pumpkin-patch-v4' || canAccessPumpkinPatchProject();
}

export async function listShowcaseCatalog(): Promise<ShowcaseCatalogEntry[]> {
  const { SHOWCASE_COMICS } = await import('../../data/showcase/comics');
  return SHOWCASE_COMICS.filter((b) => canOpen(b.id)).map((b) => {
    const panels = b.pages.flatMap((p) => p.panels);
    return {
      id: b.id,
      title: b.title,
      pageCount: b.pages.length,
      panelCount: panels.length,
      hasArt: panels.some((p) => !!p.imageUrl),
    };
  });
}

export async function openShowcaseAsProject(showcaseId: string): Promise<ComicProject> {
  const { getShowcaseComic } = await import('../../data/showcase/comics');
  const book = getShowcaseComic(showcaseId);
  if (!book || !canOpen(book.id)) throw new Error(`Showcase book "${showcaseId}" is not available`);
  return showcaseBookToComicProject(book);
}
