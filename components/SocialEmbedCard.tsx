import React, { useState, useEffect, useRef } from 'react';
import type { SocialEmbed } from '../utils/socialEmbed';
import { ExternalLink, Play } from 'lucide-react';

const PLATFORM_META = {
  youtube:   { label: 'YouTube',   color: '#FF0000', border: 'rgba(255,0,0,0.25)',   bg: 'rgba(255,0,0,0.04)'   },
  tiktok:    { label: 'TikTok',    color: '#FE2C55', border: 'rgba(254,44,85,0.25)', bg: 'rgba(254,44,85,0.04)' },
  twitter:   { label: 'X',         color: '#1D9BF0', border: 'rgba(29,155,240,0.25)',bg: 'rgba(29,155,240,0.04)'},
  instagram: { label: 'Instagram', color: '#E1306C', border: 'rgba(225,48,108,0.25)',bg: 'rgba(225,48,108,0.04)'},
} as const;

function loadScript(src: string, onLoad?: () => void) {
  if (document.querySelector(`script[src="${src}"]`)) { onLoad?.(); return; }
  const s = document.createElement('script');
  s.src = src; s.async = true; s.charset = 'utf-8';
  if (onLoad) s.onload = onLoad;
  document.body.appendChild(s);
}

interface Props { embed: SocialEmbed; }

const SocialEmbedCard: React.FC<Props> = ({ embed }) => {
  const [playing, setPlaying] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const meta = PLATFORM_META[embed.platform];

  // Load third-party embed scripts for Twitter and Instagram
  useEffect(() => {
    if (embed.platform === 'twitter') {
      const process = () => (window as any).twttr?.widgets?.load(ref.current);
      if ((window as any).twttr?.widgets) { process(); }
      else { loadScript('https://platform.twitter.com/widgets.js', process); }
    }
    if (embed.platform === 'instagram') {
      const process = () => (window as any).instgrm?.Embeds?.process();
      if ((window as any).instgrm?.Embeds) { process(); }
      else { loadScript('https://www.instagram.com/embed.js', process); }
    }
  }, [embed.platform, embed.embedUrl]);

  const header = (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-[9px] font-black uppercase tracking-[0.35em]" style={{ color: meta.color }}>
        {meta.label}
      </span>
      <a
        href={embed.originalUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-white/25 hover:text-white/60 transition-colors"
      >
        Open <ExternalLink size={9} />
      </a>
    </div>
  );

  const shell = (content: React.ReactNode) => (
    <div
      ref={ref}
      className="rounded-2xl overflow-hidden border"
      style={{ borderColor: meta.border, background: meta.bg }}
    >
      {header}
      {content}
    </div>
  );

  // ── YouTube ────────────────────────────────────────────────────────────────
  if (embed.platform === 'youtube') {
    const thumb = `https://img.youtube.com/vi/${embed.id}/hqdefault.jpg`;
    return shell(
      playing ? (
        <div className="aspect-video">
          <iframe
            src={`${embed.embedUrl}&autoplay=1`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="w-full h-full border-0"
            title="YouTube video"
          />
        </div>
      ) : (
        <div
          className="relative aspect-video cursor-pointer group"
          onClick={() => setPlaying(true)}
        >
          <img
            src={thumb}
            alt="YouTube thumbnail"
            className="w-full h-full object-cover"
            loading="lazy"
            onError={e => { (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${embed.id}/mqdefault.jpg`; }}
          />
          <div className="absolute inset-0 bg-black/35 group-hover:bg-black/15 transition-colors flex items-center justify-center">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-transform group-hover:scale-110"
              style={{ background: meta.color }}
            >
              <Play size={22} fill="white" className="text-white ml-1" />
            </div>
          </div>
        </div>
      )
    );
  }

  // ── TikTok ─────────────────────────────────────────────────────────────────
  if (embed.platform === 'tiktok') {
    return shell(
      <div className="flex justify-center bg-black/60 py-2" style={{ minHeight: 560 }}>
        <iframe
          src={embed.embedUrl}
          allow="autoplay; clipboard-write; encrypted-media; picture-in-picture"
          allowFullScreen
          className="border-0"
          style={{ width: 325, height: 560 }}
          title="TikTok video"
          loading="lazy"
        />
      </div>
    );
  }

  // ── Twitter / X ────────────────────────────────────────────────────────────
  if (embed.platform === 'twitter') {
    return shell(
      <div className="px-3 pb-3 overflow-x-auto">
        <blockquote className="twitter-tweet" data-theme="dark" data-dnt="true" data-lang="en">
          <a href={embed.embedUrl}>Loading post…</a>
        </blockquote>
      </div>
    );
  }

  // ── Instagram ──────────────────────────────────────────────────────────────
  if (embed.platform === 'instagram') {
    return shell(
      <div className="px-3 pb-3 overflow-x-auto">
        <blockquote
          className="instagram-media"
          data-instgrm-permalink={embed.embedUrl}
          data-instgrm-version="14"
          style={{ maxWidth: '100%', minWidth: 'min(326px, 100%)', margin: 0 }}
        >
          <a href={embed.embedUrl} target="_blank" rel="noopener noreferrer">
            View on Instagram
          </a>
        </blockquote>
      </div>
    );
  }

  return null;
};

export default SocialEmbedCard;
