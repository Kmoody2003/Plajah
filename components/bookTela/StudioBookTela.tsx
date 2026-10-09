import React, { useMemo } from 'react';
import type { StudioBook } from '../../types';
import { bookFromStudio } from '../../services/bookTela/upgrade';
import BookTelaModal from './BookTelaModal';

/**
 * Book Authoring Studio -> Tela edition + export. Pages become chapters (comic panels become pictures whose alt text
 * carries captions and speech). Text sync is one way here (Studio -> Tela): pages and chapters are not 1:1, so the
 * panel hides "Sync text from Tela" and the Studio stays the source for prose.
 */
export default function StudioBookTela({ book, uid, price, initialTab, onClose }: { book: StudioBook; uid?: string; price: number; initialTab: 'upgrade' | 'export'; onClose: () => void }) {
  const src = useMemo(() => ({ ...bookFromStudio(book), ownerId: uid }), [book, uid]);
  const albumId = book.publishedAlbumId;
  return <BookTelaModal book={src} uid={uid} initialTab={initialTab} album={albumId && uid ? { id: albumId, ownerId: uid, price } : undefined} onClose={onClose} />;
}
