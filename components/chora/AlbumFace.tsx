// The album's face on the album page — what the artist chose in the Mastering Desk's Artwork
// bay: the animated cover (a square GIF or ≤ 10 s loop, muted and looped), a Tela document
// (live and interactive, or its still), or the still cover. `fallback` is the still path the
// page already renders (LookedCover), so nothing changes for albums that never set a face.

import React, { Suspense } from 'react';
import type { Album } from '../../types';

const TelaEmbed = React.lazy(() => import('../tela/TelaEmbed'));

export const albumHasFace = (album: Album): boolean =>
  (album.coverFace === 'animated' && !!album.animatedCover?.url) ||
  (album.coverFace === 'tela' && !!album.telaCover?.docId);

export const AlbumFace: React.FC<{ album: Album; fallback: React.ReactNode; className?: string; width?: number }> = ({ album, fallback, className = 'w-full h-full object-cover', width }) => {
  if (album.coverFace === 'animated' && album.animatedCover?.url) {
    const a = album.animatedCover;
    return a.kind === 'gif'
      ? <img src={a.url} alt={album.title} className={className} loading="lazy" decoding="async" />
      : <video src={a.url} poster={album.coverImage || undefined} autoPlay muted loop playsInline className={className} aria-label={album.title} />;
  }
  if (album.coverFace === 'tela' && album.telaCover?.docId) {
    const t = album.telaCover;
    if (t.interactive) {
      return (
        <Suspense fallback={fallback}>
          <div className={`${className} overflow-hidden`}>
            <TelaEmbed docId={t.docId} mode={t.mode} versionId={t.versionId} frameId={t.frameId} width={width} />
          </div>
        </Suspense>
      );
    }
    if (t.stillUrl) return <img src={t.stillUrl} alt={album.title} className={className} loading="lazy" decoding="async" />;
  }
  return <>{fallback}</>;
};

export default AlbumFace;
