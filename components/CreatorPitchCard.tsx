import React, { useRef } from 'react';
import { Music, Film, PenTool, Globe, Share2, Download } from 'lucide-react';
import html2canvas from 'html2canvas';

export type PitchSegment = 'music' | 'film' | 'writer';

interface Props {
  segment: PitchSegment;
  creatorName?: string;
  tagline?: string;
}

const CONFIGS: Record<PitchSegment, {
  icon: React.FC<any>;
  color: string;
  gradient: string;
  headline: string;
  subline: string;
  points: string[];
  cta: string;
}> = {
  music: {
    icon: Music,
    color: '#ff8c00',
    gradient: 'linear-gradient(135deg, #ff8c00 0%, #ff4500 100%)',
    headline: 'Your music. Your 24/7 radio. Your 90%.',
    subline: 'The first platform built for independent musicians who own their revenue.',
    points: ['Artist Radio auto-built from your catalog', '90% of every tip, sale, and subscription', 'Sanctuary fan memberships — like Patreon, built in', 'Hide N Seek gamified discovery'],
    cta: 'plajah.com/for-music',
  },
  film: {
    icon: Film,
    color: '#3b82f6',
    gradient: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
    headline: 'Your own 24/7 streaming TV channel.',
    subline: 'No aggregators. No gatekeepers. Launch your FAST channel in 5 clicks.',
    points: ['24/7 FAST auto-scheduling', 'Mid-roll ad markers you set', 'Festival screener mode', 'Streams on FireTV, Roku, Samsung TV, Chromecast'],
    cta: 'plajah.com/for-film',
  },
  writer: {
    icon: PenTool,
    color: '#10b981',
    gradient: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
    headline: 'Write, publish, and get paid — on your terms.',
    subline: 'Articles, books, podcasts, and memberships. One owned platform.',
    points: ['Direct reader subscriptions (90% to you)', 'E-books, podcasts, and articles cross-linked', 'Fediverse cross-posting to Mastodon + Bluesky', 'No algorithm. Your audience is yours.'],
    cta: 'plajah.com/for-writers',
  },
};

export default function CreatorPitchCard({ segment, creatorName, tagline }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const cfg = CONFIGS[segment];
  const Icon = cfg.icon;

  const handleDownload = async () => {
    if (!cardRef.current) return;
    try {
      const canvas = await html2canvas(cardRef.current, {
        scale: 2,
        backgroundColor: '#020202',
        useCORS: true,
      });
      const link = document.createElement('a');
      link.download = `plajah-${segment}-pitch.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (e) {
      console.error('Export failed:', e);
    }
  };

  const handleShare = async () => {
    const shareData = {
      title: cfg.headline,
      text: `${cfg.subline}\n\n${cfg.cta}`,
      url: `https://${cfg.cta}`,
    };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch { /* user cancelled */ }
    } else {
      await navigator.clipboard.writeText(`https://${cfg.cta}`);
      alert('Link copied!');
    }
  };

  return (
    <div className="space-y-4">
      {/* The card itself */}
      <div
        ref={cardRef}
        className="relative overflow-hidden rounded-2xl"
        style={{
          background: '#020202',
          border: `1px solid ${cfg.color}30`,
          width: '100%',
          maxWidth: 480,
        }}
      >
        {/* Gradient accent top stripe */}
        <div style={{ height: 4, background: cfg.gradient }} />

        <div className="p-7">
          {/* Header */}
          <div className="flex items-center gap-3 mb-5">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: `${cfg.color}15` }}
            >
              <Icon size={20} style={{ color: cfg.color }} />
            </div>
            <div>
              <div className="font-bold text-white text-sm">Plajah</div>
              {creatorName && <div className="text-xs" style={{ color: cfg.color }}>{creatorName}</div>}
            </div>
          </div>

          {/* Headline */}
          <h2 className="text-white font-black text-2xl leading-tight mb-2">{cfg.headline}</h2>
          {tagline ? (
            <p className="text-sm mb-5" style={{ color: `${cfg.color}cc` }}>{tagline}</p>
          ) : (
            <p className="text-sm text-white/50 mb-5">{cfg.subline}</p>
          )}

          {/* Points */}
          <ul className="space-y-2 mb-6">
            {cfg.points.map((point) => (
              <li key={point} className="flex items-center gap-2 text-sm text-white/70">
                <span style={{ color: cfg.color }}>✓</span>
                {point}
              </li>
            ))}
          </ul>

          {/* CTA */}
          <div
            className="rounded-xl px-4 py-3 flex items-center justify-between"
            style={{ background: `${cfg.color}15` }}
          >
            <div className="flex items-center gap-2 text-sm font-bold" style={{ color: cfg.color }}>
              <Globe size={14} />
              {cfg.cta}
            </div>
            <div className="text-xs text-white/30">Founding spots open</div>
          </div>

          {/* Plajah branding */}
          <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
            <span className="text-xs text-white/20">Create your own at plajah.com</span>
            <span className="text-xs font-bold text-white/20">PLAJAH</span>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          onClick={handleShare}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white/70 hover:bg-white/10 transition-colors"
        >
          <Share2 size={15} />
          Share
        </button>
        <button
          onClick={handleDownload}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white/70 hover:bg-white/10 transition-colors"
        >
          <Download size={15} />
          Download as image
        </button>
      </div>

      <p className="text-xs text-center text-white/20">
        Post this card on LinkedIn, X, Discord, or DM it to creator communities.
      </p>
    </div>
  );
}
