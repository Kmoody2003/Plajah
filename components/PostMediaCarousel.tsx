// PostMediaCarousel — inline photo/video gallery for a social post.
//
// One asset renders full-width. Two or more become a swipeable carousel with scroll-snap
// (native, buttery on mobile), a position counter, dots, and desktop arrows — and every asset has
// a fullscreen button that opens an immersive lightbox you can page through. Reflows cleanly from
// phone to desktop because the slide width is the container, not a fixed pixel size.

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, X, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import PostVideo from './PostVideo';

export interface CarouselMedia {
  type: string;               // 'PHOTO' | 'GIF' | 'STICKER' | 'VIDEO'
  url?: string;
  thumbnail?: string;
  title?: string;
  /** Video doc id + Mux playback id — needed to play Reello/Mux videos (empty url + mux only). */
  id?: string;
  muxPlaybackId?: string;
}

const isVideo = (m: CarouselMedia) => m.type === 'VIDEO';

const Slide: React.FC<{ item: CarouselMedia; onFull: () => void; contain?: boolean }> = ({ item, onFull, contain }) => (
  <div className="relative w-full h-full bg-black">
    {isVideo(item)
      ? <PostVideo url={item.url} id={item.id} muxPlaybackId={item.muxPlaybackId} poster={item.thumbnail} title={item.title} className={contain ? 'object-contain' : 'object-cover'} />
      : <img src={item.url} alt={item.title || 'Post media'} loading="lazy" onClick={onFull} className={`w-full h-full ${contain ? 'object-contain' : 'object-cover'} cursor-zoom-in`} />}
    {!isVideo(item) && (
      <button onClick={e => { e.stopPropagation(); onFull(); }} title="Fullscreen"
        className="absolute top-2.5 right-2.5 w-9 h-9 rounded-full bg-black/55 backdrop-blur-sm border border-white/15 flex items-center justify-center text-white/80 hover:text-white hover:bg-black/75 transition-all z-10">
        <Maximize2 size={15} />
      </button>
    )}
  </div>
);

const Lightbox: React.FC<{ items: CarouselMedia[]; index: number; onClose: () => void; onNav: (i: number) => void }> = ({ items, index, onClose, onNav }) => {
  const item = items[index];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && index > 0) onNav(index - 1);
      if (e.key === 'ArrowRight' && index < items.length - 1) onNav(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, items.length, onClose, onNav]);

  const overlay = (
    <div className="fixed inset-0 z-[400] bg-black/95 flex items-center justify-center" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-white/70 hover:text-white z-20" style={{ top: 'max(1rem, env(safe-area-inset-top))' }}><X size={18} /></button>
      {item?.url && !isVideo(item) && (
        <a href={item.url} target="_blank" rel="noreferrer" download onClick={e => e.stopPropagation()} title="Open original"
          className="absolute top-4 left-4 w-10 h-10 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-white/70 hover:text-white z-20" style={{ top: 'max(1rem, env(safe-area-inset-top))' }}><Download size={17} /></a>
      )}
      {items.length > 1 && (
        <div className="absolute top-5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-white/10 text-white/70 text-[11px] font-black tabular-nums z-20">{index + 1} / {items.length}</div>
      )}
      {index > 0 && (
        <button onClick={e => { e.stopPropagation(); onNav(index - 1); }} className="absolute left-3 sm:left-6 w-11 h-11 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-white/70 hover:text-white z-20"><ChevronLeft size={22} /></button>
      )}
      {index < items.length - 1 && (
        <button onClick={e => { e.stopPropagation(); onNav(index + 1); }} className="absolute right-3 sm:right-6 w-11 h-11 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-white/70 hover:text-white z-20"><ChevronRight size={22} /></button>
      )}
      <div className="w-full h-full flex items-center justify-center p-4 sm:p-12" onClick={e => e.stopPropagation()}>
        {item && (isVideo(item)
          ? <div className="w-full h-full max-w-4xl max-h-full"><PostVideo url={item.url} id={item.id} muxPlaybackId={item.muxPlaybackId} poster={item.thumbnail} title={item.title} className="object-contain rounded-lg" /></div>
          : <img src={item?.url} alt={item?.title || ''} className="max-w-full max-h-full object-contain rounded-lg" />)}
      </div>
    </div>
  );
  return typeof document !== 'undefined' ? createPortal(overlay, document.body) : overlay;
};

const PostMediaCarousel: React.FC<{ items: CarouselMedia[]; accent?: string }> = ({ items, accent = '#FF8C00' }) => {
  const [index, setIndex] = useState(0);
  const [full, setFull] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollTo = useCallback((i: number) => {
    const el = scrollRef.current; if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
    setIndex(i);
  }, []);

  const onScroll = useCallback(() => {
    const el = scrollRef.current; if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== index) setIndex(i);
  }, [index]);

  if (items.length === 0) return null;

  // Single asset — no carousel chrome.
  if (items.length === 1) {
    return (
      <div className="mt-3 rounded-2xl overflow-hidden border border-white/10 bg-black relative aspect-video max-h-[600px]">
        <Slide item={items[0]} onFull={() => setFull(0)} contain />
        {full !== null && <Lightbox items={items} index={full} onClose={() => setFull(null)} onNav={setFull} />}
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-black group/carousel">
        <div ref={scrollRef} onScroll={onScroll}
          className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide aspect-video max-h-[600px]"
          style={{ scrollbarWidth: 'none' }}>
          {items.map((item, i) => (
            <div key={i} className="snap-center shrink-0 w-full h-full">
              <Slide item={item} onFull={() => setFull(i)} contain />
            </div>
          ))}
        </div>

        {/* Counter */}
        <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full bg-black/55 backdrop-blur-sm text-white/85 text-[11px] font-black tabular-nums pointer-events-none z-10">{index + 1} / {items.length}</div>

        {/* Desktop arrows */}
        {index > 0 && (
          <button onClick={() => scrollTo(index - 1)} className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/55 backdrop-blur-sm border border-white/15 flex items-center justify-center text-white/80 hover:text-white opacity-0 group-hover/carousel:opacity-100 transition-opacity z-10 hidden sm:flex"><ChevronLeft size={18} /></button>
        )}
        {index < items.length - 1 && (
          <button onClick={() => scrollTo(index + 1)} className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/55 backdrop-blur-sm border border-white/15 flex items-center justify-center text-white/80 hover:text-white opacity-0 group-hover/carousel:opacity-100 transition-opacity z-10 hidden sm:flex"><ChevronRight size={18} /></button>
        )}
      </div>

      {/* Dots — small circles (active is a filled accent dot, the rest are faint) */}
      <div className="flex items-center justify-center gap-1.5 mt-2.5">
        {items.map((_, i) => (
          <button key={i} onClick={() => scrollTo(i)} aria-label={`Go to media ${i + 1}`}
            className="rounded-full transition-all shrink-0"
            style={i === index
              ? { width: 7, height: 7, background: accent }
              : { width: 5, height: 5, background: 'rgba(255,255,255,0.28)' }} />
        ))}
      </div>

      {full !== null && <Lightbox items={items} index={full} onClose={() => setFull(null)} onNav={setFull} />}
    </div>
  );
};

export default PostMediaCarousel;
