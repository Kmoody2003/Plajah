// Robust, privacy-friendly YouTube embed for the Labs studios.
//
// It's a "facade": we show the video's thumbnail with a play button and only load the real
// iframe (youtube-nocookie) on click — fast, private, and no autoplay spam. If the id is stale
// (thumbnail 404s) or missing, it degrades to a "Watch on YouTube" card that opens a search for
// the title + channel, so a bad id is never a dead end.

import React, { useState } from 'react';
import { Play, Youtube, ExternalLink } from 'lucide-react';

export interface YouTubeEmbedProps {
  id?: string;
  title: string;
  channel?: string;
  query?: string;       // fallback search; defaults to `${title} ${channel}`
  blurb?: string;
  accent?: string;
  compact?: boolean;    // grid card vs. large featured
}

const searchUrl = (title: string, channel?: string, query?: string) =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(query || `${title} ${channel || ''}`.trim())}`;

const YouTubeEmbed: React.FC<YouTubeEmbedProps> = ({ id, title, channel, query, blurb, accent = '#FF8C00', compact }) => {
  const [playing, setPlaying] = useState(false);
  const [imgBad, setImgBad] = useState(false);
  const canEmbed = !!id && !imgBad;

  return (
    <div className="rounded-2xl overflow-hidden border border-white/8 bg-white/[0.03] group">
      <div className="relative aspect-video bg-black">
        {playing && id ? (
          <iframe
            title={title}
            className="w-full h-full"
            src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`}
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
          />
        ) : canEmbed ? (
          <button onClick={() => setPlaying(true)} className="absolute inset-0 w-full h-full" aria-label={`Play ${title}`}>
            <img
              src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
              alt={title}
              loading="lazy"
              className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
              onError={() => setImgBad(true)}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/10" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-14 h-14 rounded-full flex items-center justify-center shadow-xl transition-transform group-hover:scale-110"
                style={{ background: accent }}>
                <Play size={22} className="text-black translate-x-0.5" fill="currentColor" />
              </div>
            </div>
          </button>
        ) : (
          // Fallback: no id / dead thumbnail → send to a YouTube search (always works)
          <a href={searchUrl(title, channel, query)} target="_blank" rel="noreferrer"
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-4 hover:bg-white/[0.03] transition-colors">
            <Youtube size={30} className="text-red-500/80" />
            <span className="text-[11px] font-black uppercase tracking-widest text-white/60 flex items-center gap-1.5">Find on YouTube <ExternalLink size={11} /></span>
          </a>
        )}
      </div>
      <div className={compact ? 'p-3' : 'p-4'}>
        <p className={`font-black text-white leading-snug ${compact ? 'text-[13px] line-clamp-2' : 'text-[15px]'}`}>{title}</p>
        <div className="flex items-center justify-between gap-2 mt-1.5">
          {channel && <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: accent }}>{channel}</p>}
          <a href={searchUrl(title, channel, query)} target="_blank" rel="noreferrer" title="Open on YouTube"
            className="text-white/25 hover:text-white shrink-0" onClick={e => e.stopPropagation()}><ExternalLink size={12} /></a>
        </div>
        {blurb && !compact && <p className="text-[12px] text-white/45 mt-2 leading-relaxed">{blurb}</p>}
      </div>
    </div>
  );
};

export default YouTubeEmbed;
