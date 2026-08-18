import React, { useMemo, useState } from 'react';
import { ArrowUpRight, ChevronLeft, ChevronRight, Play, Radio, Tv } from 'lucide-react';
import type { LiveFeed } from '../../types';
import { Button, Eyebrow, IconButton, Surface } from '../ui';

interface LiveHubShowcaseProps {
  feeds: LiveFeed[];
  onOpenHub: () => void;
  onWatch: (feed: LiveFeed) => void;
}

function embedUrl(url: string): string | null {
  const youtube = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]+)/i);
  if (youtube) return `https://www.youtube.com/embed/${youtube[1]}?autoplay=1&mute=1&controls=1&playsinline=1`;
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}?autoplay=1&muted=1`;
  const twitch = url.match(/twitch\.tv\/([^/?]+)/i);
  if (twitch && typeof window !== 'undefined') {
    return `https://player.twitch.tv/?channel=${twitch[1]}&parent=${window.location.hostname}&autoplay=true&muted=true`;
  }
  return null;
}

const LiveHubShowcase: React.FC<LiveHubShowcaseProps> = ({ feeds, onOpenHub, onWatch }) => {
  const liveFeeds = useMemo(() => feeds.filter(feed => feed.status !== 'OFFLINE'), [feeds]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const selectedIndex = Math.max(0, liveFeeds.findIndex(feed => feed.id === selectedId));
  const selected = liveFeeds[selectedIndex] ?? null;
  const previewSrc = selected ? embedUrl(selected.url || '') : null;

  const selectAt = (index: number) => {
    if (!liveFeeds.length) return;
    const next = liveFeeds[(index + liveFeeds.length) % liveFeeds.length];
    setSelectedId(next.id);
    setPreviewing(false);
  };

  return (
    <Surface
      level={3}
      shape="hero"
      brand
      padded={false}
      className="min-h-[340px] overflow-hidden flex flex-col"
      aria-label="Live TV and Live Hub showcase"
    >
      <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-white/10">
        <div className="min-w-0">
          <Eyebrow className="text-small-orange">On Plajah now</Eyebrow>
          <h2 className="text-lg font-black uppercase tracking-tight text-white">Live TV + Hub</h2>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/60">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
          {liveFeeds.length} live
        </div>
      </div>

      <div className="relative flex-1 min-h-[205px] bg-black/50 overflow-hidden">
        {selected ? (
          previewing && previewSrc ? (
            <iframe
              key={selected.id}
              src={previewSrc}
              title={`Live preview: ${selected.title}`}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 w-full h-full border-0"
            />
          ) : (
            <button
              type="button"
              onClick={() => previewSrc ? setPreviewing(true) : onWatch(selected)}
              className="absolute inset-0 w-full h-full text-left group"
              aria-label={`Preview ${selected.title}`}
            >
              {selected.ownerPhoto ? (
                <img src={selected.ownerPhoto} alt="" className="absolute inset-0 w-full h-full object-cover opacity-35 blur-sm scale-110" />
              ) : null}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="w-14 h-14 rounded-full bg-small-orange text-black flex items-center justify-center shadow-xl transition-transform group-hover:scale-105">
                  <Play size={22} fill="currentColor" aria-hidden="true" />
                </span>
              </div>
              <div className="absolute inset-x-0 bottom-0 p-5">
                <p className="text-[10px] font-black uppercase tracking-widest text-small-orange mb-1">Live now</p>
                <p className="font-black text-white truncate">{selected.title || 'Creator live stream'}</p>
                <p className="text-xs text-white/55 truncate">{selected.ownerName || 'Plajah creator'}</p>
              </div>
            </button>
          )
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8">
            <Tv size={32} className="text-small-orange mb-4" aria-hidden="true" />
            <p className="font-black uppercase tracking-widest text-sm text-white">The live stage is ready</p>
            <p className="text-xs text-white/50 mt-2 max-w-xs">Browse Live TV, creator channels, events and the full program guide.</p>
          </div>
        )}
      </div>

      <div className="p-4 space-y-3 bg-white/[0.03]">
        {liveFeeds.length > 1 && (
          <div className="flex items-center gap-2">
            <IconButton aria-label="Previous live channel" size="sm" variant="ghost" onClick={() => selectAt(selectedIndex - 1)}>
              <ChevronLeft />
            </IconButton>
            <div className="flex-1 flex gap-2 overflow-x-auto no-scrollbar" role="list" aria-label="Live channels">
              {liveFeeds.slice(0, 6).map((feed, index) => (
                <button
                  key={feed.id}
                  type="button"
                  onClick={() => selectAt(index)}
                  className={`shrink-0 w-8 h-8 rounded-full overflow-hidden border-2 transition-colors ${index === selectedIndex ? 'border-small-orange' : 'border-white/10 hover:border-white/40'}`}
                  aria-label={`Select ${feed.title}`}
                  aria-pressed={index === selectedIndex}
                >
                  {feed.ownerPhoto ? <img src={feed.ownerPhoto} alt="" className="w-full h-full object-cover" /> : <Radio size={13} className="m-auto text-white/60" />}
                </button>
              ))}
            </div>
            <IconButton aria-label="Next live channel" size="sm" variant="ghost" onClick={() => selectAt(selectedIndex + 1)}>
              <ChevronRight />
            </IconButton>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {selected && <Button size="sm" variant="accent" icon={<Play />} onClick={() => onWatch(selected)}>Watch full</Button>}
          <Button size="sm" variant={selected ? 'secondary' : 'accent'} icon={<Tv />} iconRight={<ArrowUpRight />} onClick={onOpenHub}>
            Open Live Hub
          </Button>
        </div>
      </div>
    </Surface>
  );
};

export default LiveHubShowcase;
