import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { X, ExternalLink } from 'lucide-react';

interface Props {
  videoId?: string;       // single video
  playlistId?: string;    // OR a playlist (plays as a queue)
  title?: string;
  fallbackUrl?: string;   // "watch on YouTube" (search or watch url)
  onClose: () => void;
}

// Inline YouTube player. Uses the official /embed/ endpoint (the only YouTube URL
// that allows framing — search & watch pages send X-Frame-Options: SAMEORIGIN).
// If a video has embedding disabled or is region-locked, the iframe shows YouTube's
// own "Watch on YouTube" button, and we surface a fallback link too.
const YouTubeModal: React.FC<Props> = ({ videoId, playlistId, title, fallbackUrl, onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const src = playlistId
    ? `https://www.youtube-nocookie.com/embed/videoseries?list=${playlistId}&autoplay=1&rel=0`
    : `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`;
  const watchUrl = fallbackUrl
    || (playlistId ? `https://www.youtube.com/playlist?list=${playlistId}` : `https://www.youtube.com/watch?v=${videoId}`);

  const overlay = (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[130] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-3xl"
      >
        <div className="flex items-center justify-between mb-2 px-1">
          <p className="text-[11px] font-black uppercase tracking-widest text-white/70 truncate pr-3">{title || 'Highlight'}</p>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 border border-white/15 flex items-center justify-center hover:bg-white/20 shrink-0">
            <X size={15} />
          </button>
        </div>
        <div className="relative rounded-2xl overflow-hidden border border-white/12 bg-black" style={{ aspectRatio: '16 / 9' }}>
          <iframe
            src={src}
            title={title || 'YouTube video'}
            className="absolute inset-0 w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
        <div className="mt-2 flex justify-end px-1">
          <a href={watchUrl} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white">
            Watch on YouTube <ExternalLink size={11} />
          </a>
        </div>
      </motion.div>
    </motion.div>
  );

  // Portal to <body> so `position: fixed` centres on the viewport even when an
  // ancestor has a transform (the WC hub's animated containers) — otherwise the
  // modal anchors to that ancestor and opens above the user's scroll position.
  return typeof document !== 'undefined' ? createPortal(overlay, document.body) : overlay;
};

export default YouTubeModal;
