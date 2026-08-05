// FromSocialGallery — a gallery of everything a user has shared to the feed, with the caption
// of the associated post. Used by the "From Social" tabs in Photos (photos) and Reello (videos).
// Clicking an item opens it fullscreen alongside its post caption.

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, MessageSquare, Play, Loader2, ExternalLink } from 'lucide-react';
import { fetchUserSocialMedia, type SocialMediaItem } from '../services/socialMedia';

const isVideo = (t: string) => t === 'VIDEO';

const Lightbox: React.FC<{ item: SocialMediaItem; onClose: () => void }> = ({ item, onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const overlay = (
    <div className="fixed inset-0 z-[400] bg-black/95 flex flex-col" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-white/70 hover:text-white z-20" style={{ top: 'max(1rem, env(safe-area-inset-top))' }}><X size={18} /></button>
      <div className="flex-1 flex items-center justify-center p-4 sm:p-12 min-h-0" onClick={e => e.stopPropagation()}>
        {isVideo(item.type)
          ? <video src={item.url} poster={item.thumbnail} controls autoPlay playsInline className="max-w-full max-h-full rounded-lg" />
          : <img src={item.url} alt={item.title || ''} className="max-w-full max-h-full object-contain rounded-lg" />}
      </div>
      {item.caption && (
        <div className="shrink-0 px-5 pb-8 pt-4 max-w-2xl mx-auto w-full" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-2 mb-2">
            {item.authorPhoto ? <img src={item.authorPhoto} alt="" className="w-6 h-6 rounded-full object-cover" /> : <div className="w-6 h-6 rounded-full bg-white/10" />}
            <span className="text-[11px] font-bold text-white/70">{item.authorName || 'You'}</span>
            <span className="text-[9px] font-black uppercase tracking-widest text-white/25 ml-auto">From your feed</span>
          </div>
          <p className="text-[14px] text-white/80 leading-relaxed whitespace-pre-wrap line-clamp-4">{item.caption}</p>
        </div>
      )}
    </div>
  );
  return typeof document !== 'undefined' ? createPortal(overlay, document.body) : overlay;
};

interface Props {
  uid: string;
  kinds: string[];          // ['PHOTO','GIF','STICKER'] or ['VIDEO']
  accent?: string;
  emptyLabel?: string;
}

const FromSocialGallery: React.FC<Props> = ({ uid, kinds, accent = '#FF8C00', emptyLabel }) => {
  const [items, setItems] = useState<SocialMediaItem[] | null>(null);
  const [open, setOpen] = useState<SocialMediaItem | null>(null);

  useEffect(() => { let a = true; fetchUserSocialMedia(uid, kinds).then(r => a && setItems(r)); return () => { a = false; }; }, [uid, kinds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  if (items === null) {
    return <div className="py-24 flex items-center justify-center text-white/30"><Loader2 size={20} className="animate-spin" /></div>;
  }
  if (items.length === 0) {
    return (
      <div className="py-24 text-center">
        <MessageSquare size={34} className="mx-auto text-white/12 mb-4" />
        <p className="text-[11px] font-black uppercase tracking-widest text-white/30">{emptyLabel || 'Nothing shared to your feed yet'}</p>
        <p className="text-[11px] text-white/25 mt-2 max-w-sm mx-auto leading-relaxed">Anything you post to Plajah Social lands here automatically, next to the post it came from.</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[11px] text-white/40 mb-4 leading-relaxed">Everything you’ve shared to Plajah Social — kept in sync with your feed. Tap any item to see it full-screen with its post.</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
        {items.map((it, i) => (
          <button key={`${it.postId}-${i}`} onClick={() => setOpen(it)}
            className="group relative aspect-square rounded-2xl overflow-hidden border border-white/8 bg-white/5 hover:border-white/20 transition-all">
            {isVideo(it.type)
              ? (it.thumbnail
                  ? <img src={it.thumbnail} alt="" loading="lazy" className="w-full h-full object-cover" />
                  : <video src={it.url} preload="metadata" muted playsInline className="w-full h-full object-cover" />)
              : <img src={it.url} alt={it.title || ''} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            {isVideo(it.type) && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-11 h-11 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center"><Play size={18} className="text-white translate-x-0.5" fill="currentColor" /></div>
              </div>
            )}
            {it.caption && (
              <p className="absolute bottom-0 inset-x-0 p-2.5 text-[10px] text-white/85 leading-tight line-clamp-2 opacity-0 group-hover:opacity-100 transition-opacity">{it.caption}</p>
            )}
          </button>
        ))}
      </div>
      {open && <Lightbox item={open} onClose={() => setOpen(null)} />}
    </div>
  );
};

export default FromSocialGallery;
