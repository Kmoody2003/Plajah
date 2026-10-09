import React, { useMemo } from 'react';
import type { BookChapter } from '../../types';
import { bookFromAlbum, chaptersToAlbum } from '../../services/bookTela/upgrade';
import BookTelaModal from './BookTelaModal';

interface Props {
  albumId: string; ownerId: string; uid?: string;
  title: string; artist: string; description?: string; coverImage?: string;
  bookChapters: BookChapter[]; price?: number; bookLicense?: string;
  /** Called with the chapters to adopt after a revert or a sync from Tela. */
  onChaptersChange: (next: BookChapter[]) => void;
  onClose: () => void;
}

/** Album (Lorea book) edit surface -> Tela edition + export. Lazy-loaded by AlbumCreator and the owner's reader. */
export default function AlbumBookTela(p: Props) {
  const { book, unsupported } = useMemo(() => bookFromAlbum({ id: p.albumId, title: p.title, artist: p.artist, ownerId: p.ownerId, coverImage: p.coverImage || '', description: p.description, bookChapters: p.bookChapters } as any), [p.albumId, p.title, p.artist, p.ownerId, p.coverImage, p.description, p.bookChapters]);
  return (
    <>
      <BookTelaModal book={book} uid={p.uid} album={{ id: p.albumId, ownerId: p.ownerId, price: p.price, bookLicense: p.bookLicense }}
        onChaptersChanged={chs => p.onChaptersChange(chaptersToAlbum(p.bookChapters, chs))} onClose={p.onClose} />
      {unsupported.length > 0 && <p className="sr-only" role="note">{unsupported.length} file-based chapters (PDF/EPUB/comic pages) are not part of the Tela edition: {unsupported.join(', ')}.</p>}
    </>
  );
}
