import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, Music2, X } from 'lucide-react';
import type { MediaAsset } from '../../services/lessonMedia';

/**
 * Shows lesson media the way a museum label would: the image or recording, a caption (the teaching
 * point) and a credit line with a link back to the archive. Images open in a lightbox; audio plays
 * in place. Used by lessons, practice questions and the teacher's lesson player.
 */
export const Credit: React.FC<{ a: MediaAsset }> = ({ a }) => (
  <p className="text-[10px] leading-snug text-white/45 mt-1">
    {a.attribution}{' '}
    <a href={a.sourceUrl} target="_blank" rel="noreferrer noopener" className="underline underline-offset-2 hover:text-white/80 inline-flex items-center gap-0.5">Source <ExternalLink size={9} /></a>
  </p>
);

const MediaStrip: React.FC<{ assets: MediaAsset[]; caption?: string; large?: boolean }> = ({ assets, caption, large }) => {
  const [zoom, setZoom] = useState<MediaAsset | null>(null);
  if (!assets.length) return null;
  const images = assets.filter(a => a.kind === 'image');
  const audio = assets.filter(a => a.kind === 'audio');
  return (
    <figure className="my-4">
      {images.length > 0 && (
        <div className={`grid gap-2 ${images.length === 1 ? 'grid-cols-1' : large ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2'}`}>
          {images.map(a => (
            <div key={a.id}>
              <button type="button" onClick={() => setZoom(a)} className="block w-full overflow-hidden rounded-2xl border border-white/10 bg-black/40 group" aria-label={`Enlarge: ${a.title}`}>
                <img src={a.thumbUrl && images.length > 1 ? a.thumbUrl : a.url} alt={a.title} loading="lazy"
                  className={`w-full object-cover group-hover:scale-[1.02] transition-transform ${images.length === 1 ? 'max-h-80' : 'h-36'}`}
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
              </button>
              <p className="text-[11px] font-bold text-white/80 mt-1 line-clamp-1">{a.title}</p>
              <Credit a={a} />
            </div>
          ))}
        </div>
      )}
      {audio.map(a => (
        <div key={a.id} className="mt-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <div className="flex items-center gap-2 mb-1.5"><Music2 size={14} className="text-[#FF8C00]" /><p className="text-[12px] font-black truncate">{a.title}</p></div>
          <audio controls preload="none" src={a.url} className="w-full h-9" aria-label={`Listen: ${a.title}`} />
          <Credit a={a} />
        </div>
      ))}
      {caption && <figcaption className="text-[12px] text-white/65 mt-2 leading-snug italic">{caption}</figcaption>}
      {zoom && createPortal(
        <div role="dialog" aria-modal="true" aria-label={zoom.title} className="fixed inset-0 z-[500] bg-black/90 grid place-items-center p-4" onClick={() => setZoom(null)}>
          <button type="button" aria-label="Close" onClick={() => setZoom(null)} className="absolute top-4 right-4 w-10 h-10 grid place-items-center rounded-full bg-white/10 text-white"><X size={20} /></button>
          <div className="max-w-4xl w-full" onClick={e => e.stopPropagation()}>
            <img src={zoom.url} alt={zoom.title} className="max-h-[78vh] w-auto mx-auto rounded-xl" />
            <p className="text-white font-black text-center mt-3">{zoom.title}</p>
            <div className="text-center"><Credit a={zoom} /></div>
          </div>
        </div>, document.body)}
    </figure>
  );
};

export default MediaStrip;
