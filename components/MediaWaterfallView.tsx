import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ChevronUp, ChevronDown, Maximize2, Volume2, VolumeX, ExternalLink, Play } from 'lucide-react';

export interface WaterfallMediaItem {
  type: 'PHOTO' | 'VIDEO' | 'AUDIO' | 'LINK' | 'GIF' | 'ALBUM';
  url?: string;
  title?: string;
  thumbnail?: string;
  linkPreview?: { title?: string; description?: string; image?: string; url: string };
}

interface MediaWaterfallViewProps {
  items: WaterfallMediaItem[];
  initialIndex?: number;
  commentNode: React.ReactNode;
  onClose: () => void;
}

const MediaWaterfallView: React.FC<MediaWaterfallViewProps> = ({ items, initialIndex = 0, commentNode, onClose }) => {
  const [activeIdx, setActiveIdx] = useState(initialIndex);
  const [fullscreen, setFullscreen] = useState(false);
  const [muted, setMuted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const active = items[activeIdx];

  const goTo = useCallback((idx: number) => {
    const clamped = Math.max(0, Math.min(items.length - 1, idx));
    setActiveIdx(clamped);
  }, [items.length]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') goTo(activeIdx + 1);
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') goTo(activeIdx - 1);
      else if (e.key === 'Escape') onClose();
      else if (e.key === 'f' || e.key === 'F') setFullscreen(f => !f);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [activeIdx, goTo, onClose]);

  const renderActiveMedia = () => {
    if (!active) return null;
    switch (active.type) {
      case 'PHOTO':
      case 'GIF':
        return (
          <img
            src={active.url}
            alt={active.title || ''}
            className="max-w-full max-h-full object-contain rounded-2xl"
            draggable={false}
          />
        );
      case 'VIDEO':
        return (
          <video
            ref={videoRef}
            key={active.url}
            src={active.url}
            controls
            autoPlay
            muted={muted}
            loop
            playsInline
            className="max-w-full max-h-full rounded-2xl object-contain"
          />
        );
      case 'AUDIO':
        return (
          <div className="flex flex-col items-center gap-6 p-10">
            {active.thumbnail && <img src={active.thumbnail} alt="" className="w-48 h-48 rounded-2xl object-cover shadow-2xl" />}
            <p className="text-sm font-black uppercase tracking-widest opacity-60">{active.title}</p>
            <audio ref={audioRef} key={active.url} src={active.url} controls autoPlay className="w-64" />
          </div>
        );
      case 'LINK':
        const preview = active.linkPreview;
        return (
          <a href={preview?.url || active.url} target="_blank" rel="noreferrer" className="block max-w-sm">
            {preview?.image && <img src={preview.image} alt="" className="w-full h-48 object-cover rounded-t-2xl" />}
            <div className="bg-white/10 backdrop-blur-md border border-white/10 rounded-b-2xl p-5">
              {preview?.title && <p className="text-sm font-black uppercase tracking-wide mb-1">{preview.title}</p>}
              {preview?.description && <p className="text-xs opacity-50">{preview.description}</p>}
              <div className="flex items-center gap-1 mt-3 text-[9px] opacity-30 font-black uppercase tracking-widest">
                <ExternalLink size={9} /> Open Link
              </div>
            </div>
          </a>
        );
      default:
        return <div className="text-white/20 text-xs font-black uppercase tracking-widest">Media unavailable</div>;
    }
  };

  const getThumbnail = (item: WaterfallMediaItem) =>
    item.thumbnail || item.linkPreview?.image || (item.type === 'PHOTO' || item.type === 'GIF' ? item.url : undefined);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9000] bg-black/92 backdrop-blur-xl flex"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Close */}
      <button onClick={onClose} className="absolute top-5 right-5 z-20 p-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-full transition-all">
        <X size={16} />
      </button>

      {/* Comment thread — left panel */}
      <div className={`transition-all duration-500 ${fullscreen ? 'w-0 overflow-hidden' : 'w-full max-w-[420px]'} shrink-0 border-r border-white/5 overflow-y-auto bg-black/40`}>
        <div className="p-6 pt-14">
          {commentNode}
        </div>
      </div>

      {/* Media waterfall — right panel */}
      <div className="flex-1 flex flex-col relative overflow-hidden">
        {/* Main media viewer */}
        <div className="flex-1 flex items-center justify-center relative p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeIdx}
              initial={{ opacity: 0, y: 30, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -30, scale: 0.96 }}
              transition={{ duration: 0.35, ease: [0.25, 0.8, 0.25, 1] }}
              className="flex items-center justify-center w-full h-full"
            >
              {renderActiveMedia()}
            </motion.div>
          </AnimatePresence>

          {/* Controls overlay */}
          <div className="absolute top-4 right-4 flex gap-2">
            {(active?.type === 'VIDEO' || active?.type === 'AUDIO') && (
              <button onClick={() => setMuted(m => !m)} className="p-2.5 bg-black/60 hover:bg-black/80 rounded-full border border-white/10 transition-all">
                {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
            )}
            <button onClick={() => setFullscreen(f => !f)} className="p-2.5 bg-black/60 hover:bg-black/80 rounded-full border border-white/10 transition-all">
              <Maximize2 size={14} />
            </button>
          </div>

          {/* Item counter */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[9px] font-black uppercase tracking-widest opacity-30">
            {activeIdx + 1} / {items.length}
          </div>
        </div>

        {/* Rolodex strip — bottom */}
        <div className="shrink-0 border-t border-white/5 bg-black/60 px-6 py-4">
          <div className="flex gap-3 overflow-x-auto no-scrollbar">
            {items.map((item, idx) => {
              const thumb = getThumbnail(item);
              return (
                <motion.button
                  key={idx}
                  whileHover={{ scale: 1.08 }}
                  onClick={() => goTo(idx)}
                  className={`relative w-16 h-16 rounded-xl overflow-hidden shrink-0 border-2 transition-all ${idx === activeIdx ? 'border-white opacity-100' : 'border-transparent opacity-40 hover:opacity-70'}`}
                >
                  {thumb
                    ? <img src={thumb} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full bg-white/10 flex items-center justify-center text-white/40"><Play size={14} /></div>
                  }
                  {item.type === 'VIDEO' && (
                    <div className="absolute inset-0 flex items-center justify-center"><Play size={12} className="text-white drop-shadow-md" /></div>
                  )}
                </motion.button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Nav arrows — vertical on right edge */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-10">
        <button onClick={() => goTo(activeIdx - 1)} disabled={activeIdx === 0}
          className="p-3 bg-black/60 hover:bg-black/80 border border-white/10 rounded-full transition-all disabled:opacity-20">
          <ChevronUp size={16} />
        </button>
        <button onClick={() => goTo(activeIdx + 1)} disabled={activeIdx === items.length - 1}
          className="p-3 bg-black/60 hover:bg-black/80 border border-white/10 rounded-full transition-all disabled:opacity-20">
          <ChevronDown size={16} />
        </button>
      </div>
    </motion.div>
  );
};

export default MediaWaterfallView;
